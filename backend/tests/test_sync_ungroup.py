from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.bluos.client import BluOSClient
from app.config import Settings, get_settings
from app.discovery.service import DiscoveryService
from app.main import create_app
from app.models import PlayerStatus, SyncRole
from app.services.events import EventBus
from app.services.poller import StatusPoller
from app.state import AppState


@pytest.fixture
def settings() -> Settings:
    get_settings.cache_clear()
    return Settings(
        discovery_cache_ttl=0,
        poll_interval=60,
        allow_non_private_ips=True,
        cors_origins="http://127.0.0.1:8765,http://localhost:8765",
    )


@pytest.mark.asyncio
async def test_sync_remove_stops_slave_and_empty_primary(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ungroup clears AirPlay/capture by stopping freed players."""

    async def seeded(self: DiscoveryService, *args, **kwargs):
        return self._snapshot

    monkeypatch.setattr(DiscoveryService, "refresh", seeded)
    monkeypatch.setattr(DiscoveryService, "get_devices", seeded)

    app = create_app()
    client = BluOSClient(settings)
    events = EventBus()
    discovery = DiscoveryService(settings, client)
    primary = PlayerStatus(
        id="primary",
        ip="192.168.1.10",
        name="Living",
        status="online",
        slaves=["192.168.1.11"],
        sync_role=SyncRole.PRIMARY,
    )
    slave = PlayerStatus(
        id="slave",
        ip="192.168.1.11",
        name="Kitchen",
        status="online",
        master="192.168.1.10",
        sync_role=SyncRole.SYNCED,
    )
    discovery._snapshot.devices = [primary, slave]
    discovery._snapshot.ips_by_id = {primary.id: primary.ip, slave.id: slave.ip}
    discovery._snapshot.ids_by_ip = {primary.ip: primary.id, slave.ip: slave.id}
    discovery._snapshot.discovered_at = 1.0
    poller = StatusPoller(settings, discovery, client, events)
    poller.refresh_one = AsyncMock(return_value=None)  # type: ignore[method-assign]
    client.remove_sync_slave = AsyncMock(return_value=True)  # type: ignore[method-assign]
    client.stop = AsyncMock(return_value=True)  # type: ignore[method-assign]
    client.get_player_status = AsyncMock(  # type: ignore[method-assign]
        return_value=PlayerStatus(
            id="primary",
            ip="192.168.1.10",
            name="Living",
            status="online",
            slaves=[],
            sync_role=SyncRole.STANDALONE,
        )
    )
    app.state.app_state = AppState(
        settings=settings,
        client=client,
        discovery=discovery,
        events=events,
        poller=poller,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        response = await http.post(
            "/api/v1/sync/remove",
            json={"master_id": "primary", "slave_id": "slave"},
        )
    assert response.status_code == 204
    client.remove_sync_slave.assert_awaited_once_with("192.168.1.10", "192.168.1.11")
    assert client.stop.await_count == 2
    stopped_ips = [call.args[0] for call in client.stop.await_args_list]
    assert stopped_ips == ["192.168.1.11", "192.168.1.10"]


@pytest.mark.asyncio
async def test_sync_remove_keeps_primary_playing_when_slaves_remain(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def seeded(self: DiscoveryService, *args, **kwargs):
        return self._snapshot

    monkeypatch.setattr(DiscoveryService, "refresh", seeded)
    monkeypatch.setattr(DiscoveryService, "get_devices", seeded)

    app = create_app()
    client = BluOSClient(settings)
    events = EventBus()
    discovery = DiscoveryService(settings, client)
    primary = PlayerStatus(
        id="primary",
        ip="192.168.1.10",
        name="Living",
        status="online",
        slaves=["192.168.1.11", "192.168.1.12"],
        sync_role=SyncRole.PRIMARY,
    )
    slave = PlayerStatus(
        id="slave",
        ip="192.168.1.11",
        name="Kitchen",
        status="online",
        master="192.168.1.10",
        sync_role=SyncRole.SYNCED,
    )
    other = PlayerStatus(
        id="other",
        ip="192.168.1.12",
        name="Roaming",
        status="online",
        master="192.168.1.10",
        sync_role=SyncRole.SYNCED,
    )
    discovery._snapshot.devices = [primary, slave, other]
    discovery._snapshot.ips_by_id = {
        primary.id: primary.ip,
        slave.id: slave.ip,
        other.id: other.ip,
    }
    discovery._snapshot.ids_by_ip = {
        primary.ip: primary.id,
        slave.ip: slave.id,
        other.ip: other.id,
    }
    discovery._snapshot.discovered_at = 1.0
    poller = StatusPoller(settings, discovery, client, events)
    poller.refresh_one = AsyncMock(return_value=None)  # type: ignore[method-assign]
    client.remove_sync_slave = AsyncMock(return_value=True)  # type: ignore[method-assign]
    client.stop = AsyncMock(return_value=True)  # type: ignore[method-assign]
    client.get_player_status = AsyncMock(  # type: ignore[method-assign]
        return_value=PlayerStatus(
            id="primary",
            ip="192.168.1.10",
            name="Living",
            status="online",
            slaves=["192.168.1.12"],
            sync_role=SyncRole.PRIMARY,
        )
    )
    app.state.app_state = AppState(
        settings=settings,
        client=client,
        discovery=discovery,
        events=events,
        poller=poller,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        response = await http.post(
            "/api/v1/sync/remove",
            json={"master_id": "primary", "slave_id": "slave"},
        )
    assert response.status_code == 204
    client.stop.assert_awaited_once_with("192.168.1.11")


@pytest.mark.asyncio
async def test_sync_break_does_not_stop_primary_when_all_removals_fail(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def seeded(self: DiscoveryService, *args, **kwargs):
        return self._snapshot

    monkeypatch.setattr(DiscoveryService, "refresh", seeded)
    monkeypatch.setattr(DiscoveryService, "get_devices", seeded)

    app = create_app()
    client = BluOSClient(settings)
    events = EventBus()
    discovery = DiscoveryService(settings, client)
    primary = PlayerStatus(
        id="primary",
        ip="192.168.1.10",
        name="Living",
        status="online",
        slaves=["192.168.1.11"],
        sync_role=SyncRole.PRIMARY,
    )
    slave = PlayerStatus(
        id="slave",
        ip="192.168.1.11",
        name="Kitchen",
        status="online",
        master="192.168.1.10",
        sync_role=SyncRole.SYNCED,
    )
    discovery._snapshot.devices = [primary, slave]
    discovery._snapshot.ips_by_id = {primary.id: primary.ip, slave.id: slave.ip}
    discovery._snapshot.ids_by_ip = {primary.ip: primary.id, slave.ip: slave.id}
    discovery._snapshot.discovered_at = 1.0
    poller = StatusPoller(settings, discovery, client, events)
    poller.refresh_one = AsyncMock(return_value=None)  # type: ignore[method-assign]
    client.remove_sync_slave = AsyncMock(return_value=False)  # type: ignore[method-assign]
    client.stop = AsyncMock(return_value=True)  # type: ignore[method-assign]
    app.state.app_state = AppState(
        settings=settings,
        client=client,
        discovery=discovery,
        events=events,
        poller=poller,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        response = await http.post("/api/v1/sync/break")
    assert response.status_code == 502
    client.stop.assert_not_awaited()
