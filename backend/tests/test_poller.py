"""Status poller unit tests."""

from __future__ import annotations

import asyncio

import pytest

from app.bluos.client import BluOSClient
from app.config import Settings
from app.discovery.service import DiscoveryService
from app.models import PlayerStatus
from app.services.events import EventBus
from app.services.poller import StatusPoller


@pytest.fixture
def settings() -> Settings:
    return Settings(
        allow_non_private_ips=True,
        poll_interval=1,
        empty_fleet_rediscovery_seconds=5,
        circuit_failure_threshold=2,
        circuit_slow_poll_seconds=30,
        control_rate_limit_seconds=0,
    )


@pytest.mark.asyncio
async def test_poller_start_stop(settings: Settings) -> None:
    client = BluOSClient(settings)
    discovery = DiscoveryService(settings, client)
    events = EventBus()
    poller = StatusPoller(settings, discovery, client, events)
    poller.start()
    assert poller.running is True
    poller.start()  # idempotent
    await poller.stop()
    assert poller.running is False
    await client.aclose()


@pytest.mark.asyncio
async def test_poll_once_updates_online_devices(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = BluOSClient(settings)
    discovery = DiscoveryService(settings, client)
    player = PlayerStatus(id="p1", ip="192.168.1.20", name="K", status="online")
    discovery._snapshot.devices = [player]
    discovery._snapshot.ips_by_id = {"p1": "192.168.1.20"}
    events = EventBus()
    poller = StatusPoller(settings, discovery, client, events)
    published: list[tuple[str, object]] = []

    async def capture(event: str, payload: object) -> None:
        published.append((event, payload))

    monkeypatch.setattr(events, "publish", capture)

    async def fake_status(ip: str, device_id: str | None = None, node_id: str = ""):
        return PlayerStatus(id="p1", ip=ip, name="K", status="online", volume=9)

    monkeypatch.setattr(client, "get_player_status", fake_status)
    await poller._poll_once()
    assert discovery.snapshot.devices[0].volume == 9
    assert poller._failures.get("p1") == 0
    assert any(event == "fleet" for event, _ in published)
    await client.aclose()


@pytest.mark.asyncio
async def test_poll_once_marks_exception_offline(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = BluOSClient(settings)
    discovery = DiscoveryService(settings, client)
    player = PlayerStatus(id="p1", ip="192.168.1.20", name="K", status="online")
    discovery._snapshot.devices = [player]
    discovery._snapshot.ips_by_id = {"p1": "192.168.1.20"}
    events = EventBus()
    poller = StatusPoller(settings, discovery, client, events)

    async def boom(*_args, **_kwargs):
        raise RuntimeError("device down")

    monkeypatch.setattr(client, "get_player_status", boom)
    await poller._poll_once()
    updated = discovery.snapshot.devices[0]
    assert updated.status == "offline"
    assert updated.consecutive_failures == 1
    await client.aclose()


@pytest.mark.asyncio
async def test_circuit_breaker_slows_poll(settings: Settings) -> None:
    import time

    client = BluOSClient(settings)
    discovery = DiscoveryService(settings, client)
    events = EventBus()
    poller = StatusPoller(settings, discovery, client, events)
    offline = PlayerStatus(id="p1", ip="192.168.1.20", name="K", status="offline")
    poller._record_result(offline)
    poller._record_result(offline)
    assert poller._failures["p1"] == 2
    due = poller._next_due["p1"]
    # Second failure trips circuit — next due uses circuit_slow_poll_seconds.
    assert due >= time.monotonic() + settings.circuit_slow_poll_seconds - 1
    await client.aclose()


@pytest.mark.asyncio
async def test_empty_fleet_triggers_refresh(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = BluOSClient(settings)
    discovery = DiscoveryService(settings, client)
    events = EventBus()
    poller = StatusPoller(settings, discovery, client, events)
    called = {"n": 0}

    async def refresh(self: DiscoveryService):
        called["n"] += 1
        return self._snapshot

    monkeypatch.setattr(DiscoveryService, "refresh", refresh)
    await poller._poll_once()
    assert called["n"] == 1
    await client.aclose()


@pytest.mark.asyncio
async def test_refresh_one_unknown_returns_none(settings: Settings) -> None:
    client = BluOSClient(settings)
    discovery = DiscoveryService(settings, client)
    events = EventBus()
    poller = StatusPoller(settings, discovery, client, events)
    assert await poller.refresh_one("missing") is None
    await client.aclose()


@pytest.mark.asyncio
async def test_run_loop_records_cycle_error(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = BluOSClient(settings)
    discovery = DiscoveryService(settings, client)
    events = EventBus()
    poller = StatusPoller(settings, discovery, client, events)

    async def boom() -> None:
        raise RuntimeError("cycle failed")

    monkeypatch.setattr(poller, "_poll_once", boom)
    # Shorten wait so the loop cycles quickly under test.
    poller.settings = settings.model_copy(update={"poll_interval": 1})
    poller.start()
    for _ in range(40):
        if poller.last_error:
            break
        await asyncio.sleep(0.05)
    await poller.stop()
    assert poller.last_error == "cycle failed"
    await client.aclose()
