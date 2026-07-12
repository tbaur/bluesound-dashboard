"""Orchestrates mDNS/LSDP discovery and BluOS enrichment."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field

from app.bluos.client import BluOSClient
from app.config import Settings
from app.discovery.lsdp import LSDPDevice, LSDPDiscovery
from app.discovery.mdns import MDNSDiscovery
from app.models import PlayerStatus
from app.validators import make_device_id, sanitize_ip

logger = logging.getLogger(__name__)


@dataclass
class DiscoveredEndpoint:
    ip: str
    node_id: str = ""


@dataclass
class DiscoverySnapshot:
    devices: list[PlayerStatus] = field(default_factory=list)
    endpoints: dict[str, DiscoveredEndpoint] = field(default_factory=dict)
    discovered_at: float | None = None
    method_used: str = ""
    ips_by_id: dict[str, str] = field(default_factory=dict)
    ids_by_ip: dict[str, str] = field(default_factory=dict)


class DiscoveryService:
    def __init__(self, settings: Settings, client: BluOSClient) -> None:
        self.settings = settings
        self.client = client
        self._lock = asyncio.Lock()
        self._snapshot = DiscoverySnapshot()
        self._grace_until: dict[str, float] = {}
        self._grace_ips: dict[str, str] = {}

    @property
    def snapshot(self) -> DiscoverySnapshot:
        return self._snapshot

    def is_known_id(self, device_id: str) -> bool:
        if device_id in self._snapshot.ips_by_id:
            return True
        return time.time() < self._grace_until.get(device_id, 0.0)

    def is_in_grace(self, device_id: str) -> bool:
        """True when the id is only reachable via discovered-grace TTL."""
        if device_id in self._snapshot.ips_by_id:
            return False
        return time.time() < self._grace_until.get(device_id, 0.0)

    def resolve_ip(self, device_id: str) -> str | None:
        ip = self._snapshot.ips_by_id.get(device_id)
        if ip:
            return ip
        if time.time() < self._grace_until.get(device_id, 0.0):
            return self._grace_ips.get(device_id)
        return None

    def get_device(self, device_id: str) -> PlayerStatus | None:
        for device in self._snapshot.devices:
            if device.id == device_id:
                return device
        return None

    def cache_fresh(self) -> bool:
        if self._snapshot.discovered_at is None:
            return False
        return (time.time() - self._snapshot.discovered_at) < self.settings.discovery_cache_ttl

    async def get_devices(self, *, force: bool = False) -> DiscoverySnapshot:
        async with self._lock:
            if not force and self.cache_fresh() and self._snapshot.devices:
                return self._snapshot
            return await self._refresh_locked()

    async def refresh(self) -> DiscoverySnapshot:
        async with self._lock:
            return await self._refresh_locked()

    async def _refresh_locked(self) -> DiscoverySnapshot:
        endpoints, method_used = await self._discover_endpoints()
        players = await self._enrich(endpoints)
        now = time.time()
        # Preserve grace for devices that disappeared
        previous_ids = set(self._snapshot.ips_by_id)
        new_ids = {p.id for p in players}
        for missing in previous_ids - new_ids:
            self._grace_until[missing] = now + self.settings.discovered_grace_ttl
            grace_ip = self._snapshot.ips_by_id.get(missing)
            if grace_ip:
                self._grace_ips[missing] = grace_ip
        for present in new_ids:
            self._grace_until.pop(present, None)
            self._grace_ips.pop(present, None)

        ips_by_id = {p.id: p.ip for p in players}
        ids_by_ip = {p.ip: p.id for p in players}
        self._snapshot = DiscoverySnapshot(
            devices=players,
            endpoints={e.ip: e for e in endpoints},
            discovered_at=now,
            method_used=method_used,
            ips_by_id=ips_by_id,
            ids_by_ip=ids_by_ip,
        )
        logger.info(
            "discovery_complete count=%s method=%s",
            len(players),
            method_used,
        )
        return self._snapshot

    async def _discover_endpoints(self) -> tuple[list[DiscoveredEndpoint], str]:
        method = self.settings.discovery_method
        by_ip: dict[str, DiscoveredEndpoint] = {}
        methods_run: list[str] = []

        run_mdns = method in ("mdns", "both")
        run_lsdp = method in ("lsdp", "both")

        mdns_task = (
            asyncio.to_thread(
                MDNSDiscovery(self.settings.mdns_service, self.settings.discovery_timeout).discover
            )
            if run_mdns
            else None
        )
        lsdp_task = (
            asyncio.to_thread(LSDPDiscovery(self.settings.discovery_timeout).discover)
            if run_lsdp
            else None
        )

        mdns_ips: list[str] = []
        lsdp_devices: list[LSDPDevice] = []
        if mdns_task is not None and lsdp_task is not None:
            mdns_ips, lsdp_devices = await asyncio.gather(mdns_task, lsdp_task)
        elif mdns_task is not None:
            mdns_ips = await mdns_task
        elif lsdp_task is not None:
            lsdp_devices = await lsdp_task

        if run_mdns:
            mdns_added = False
            for ip in mdns_ips:
                if self.settings.is_allowed_device_ip(ip):
                    by_ip[ip] = DiscoveredEndpoint(ip=ip)
                    mdns_added = True
            if mdns_added:
                methods_run.append("mdns")

        if run_lsdp:
            lsdp_added = False
            for device in lsdp_devices:
                if not self.settings.is_allowed_device_ip(device.ip):
                    continue
                existing = by_ip.get(device.ip)
                if existing is None:
                    by_ip[device.ip] = DiscoveredEndpoint(ip=device.ip, node_id=device.node_id)
                    lsdp_added = True
                elif device.node_id and not existing.node_id:
                    by_ip[device.ip] = DiscoveredEndpoint(ip=device.ip, node_id=device.node_id)
                    lsdp_added = True
                else:
                    lsdp_added = True
            if lsdp_added:
                methods_run.append("lsdp")

        method_used = "+".join(methods_run) if methods_run else method
        return sorted(by_ip.values(), key=lambda e: e.ip), method_used

    async def _enrich(self, endpoints: list[DiscoveredEndpoint]) -> list[PlayerStatus]:
        async def one(endpoint: DiscoveredEndpoint) -> PlayerStatus:
            device_id = make_device_id(endpoint.ip, node_id=endpoint.node_id)
            try:
                return await self.client.get_player_status(
                    endpoint.ip,
                    device_id=device_id,
                    node_id=endpoint.node_id,
                )
            except Exception as exc:  # noqa: BLE001 — isolate per device
                logger.debug("enrich_failed ip=%s err=%s", endpoint.ip, exc)
                return PlayerStatus(
                    id=device_id,
                    ip=endpoint.ip,
                    status="error",
                )

        results = await asyncio.gather(*(one(e) for e in endpoints))
        return list(results)

    async def update_device(self, player: PlayerStatus) -> None:
        async with self._lock:
            devices = [player if d.id == player.id else d for d in self._snapshot.devices]
            if not any(d.id == player.id for d in self._snapshot.devices):
                devices.append(player)
            self._snapshot.devices = devices
            self._snapshot.ips_by_id[player.id] = player.ip
            self._snapshot.ids_by_ip[player.ip] = player.id
            sanitized = sanitize_ip(player.ip)
            if sanitized:
                existing = self._snapshot.endpoints.get(sanitized, DiscoveredEndpoint(sanitized))
                self._snapshot.endpoints[sanitized] = DiscoveredEndpoint(
                    ip=sanitized,
                    node_id=existing.node_id,
                )
