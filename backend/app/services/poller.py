"""Background status poller with per-device failure isolation."""

from __future__ import annotations

import asyncio
import logging
import time

from app.bluos.client import BluOSClient
from app.config import Settings
from app.discovery.service import DiscoveryService
from app.models import PlayerStatus
from app.services.events import EventBus

logger = logging.getLogger(__name__)


class StatusPoller:
    def __init__(
        self,
        settings: Settings,
        discovery: DiscoveryService,
        client: BluOSClient,
        events: EventBus,
    ) -> None:
        self.settings = settings
        self.discovery = discovery
        self.client = client
        self.events = events
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()
        self._failures: dict[str, int] = {}
        self._next_due: dict[str, float] = {}
        self.running = False
        self.last_poll_at: float | None = None
        self.last_error: str | None = None

    def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run(), name="status-poller")
        self.running = True

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        self.running = False

    async def refresh_one(self, device_id: str) -> PlayerStatus | None:
        ip = self.discovery.resolve_ip(device_id)
        if not ip:
            return None
        player = await self.client.get_player_status(ip, device_id=device_id)
        self._record_result(player)
        await self.discovery.update_device(player)
        await self.events.publish("device", player.model_dump())
        return player

    async def _run(self) -> None:
        while not self._stop.is_set():
            started = time.monotonic()
            try:
                await self._poll_once()
                self.last_poll_at = time.time()
                self.last_error = None
            except Exception as exc:  # noqa: BLE001
                self.last_error = str(exc)
                logger.exception("poller_cycle_failed")
            elapsed = time.monotonic() - started
            wait = max(0.5, self.settings.poll_interval - elapsed)
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=wait)
            except asyncio.TimeoutError:
                continue

    async def _poll_once(self) -> None:
        snapshot = self.discovery.snapshot
        if not snapshot.devices:
            # Re-scan when empty so late-joining players appear without a manual rescan.
            stale = (
                snapshot.discovered_at is None
                or (time.time() - snapshot.discovered_at)
                >= self.settings.empty_fleet_rediscovery_seconds
            )
            if stale:
                await self.discovery.refresh()
                snapshot = self.discovery.snapshot
            if not snapshot.devices:
                return

        now = time.monotonic()
        due: list[PlayerStatus] = []
        for device in snapshot.devices:
            due_at = self._next_due.get(device.id, 0.0)
            if now >= due_at:
                due.append(device)

        if not due:
            return

        results = await asyncio.gather(
            *(self._poll_device(d) for d in due),
            return_exceptions=True,
        )
        updated: list[PlayerStatus] = []
        for device, result in zip(due, results, strict=True):
            if isinstance(result, Exception):
                logger.debug("poll_device_error id=%s err=%s", device.id, result)
                offline = device.model_copy(
                    update={
                        "status": "offline",
                        "consecutive_failures": device.consecutive_failures + 1,
                    }
                )
                self._record_result(offline)
                updated.append(offline)
            elif isinstance(result, PlayerStatus):
                self._record_result(result)
                updated.append(result)

        for player in updated:
            await self.discovery.update_device(player)

        await self.events.publish(
            "fleet",
            {
                "devices": [d.model_dump() for d in self.discovery.snapshot.devices],
                "discovered_at": self.discovery.snapshot.discovered_at,
            },
        )

    async def _poll_device(self, device: PlayerStatus) -> PlayerStatus:
        return await self.client.get_player_status(device.ip, device_id=device.id)

    def _record_result(self, player: PlayerStatus) -> None:
        now = time.monotonic()
        if player.status == "online":
            self._failures[player.id] = 0
            player.consecutive_failures = 0
            self._next_due[player.id] = now + self.settings.poll_interval
            return
        failures = self._failures.get(player.id, 0) + 1
        self._failures[player.id] = failures
        player.consecutive_failures = failures
        if failures >= self.settings.circuit_failure_threshold:
            self._next_due[player.id] = now + self.settings.circuit_slow_poll_seconds
        else:
            self._next_due[player.id] = now + self.settings.poll_interval
