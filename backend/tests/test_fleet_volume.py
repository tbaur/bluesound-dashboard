from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.bluos.client import BluOSClient
from app.config import Settings, get_settings
from app.discovery.service import DiscoveryService
from app.main import create_app
from app.models import PlayerStatus
from app.services.events import EventBus
from app.services.poller import StatusPoller
from app.state import AppState


@pytest.fixture
def settings() -> Settings:
    get_settings.cache_clear()
    return Settings(
        discovery_cache_ttl=60,
        poll_interval=60,
        allow_non_private_ips=True,
        control_rate_limit_seconds=0,
    )


@pytest.mark.asyncio
async def test_fleet_volume_sets_all(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    async def seeded(self: DiscoveryService, *args, **kwargs):
        return self._snapshot

    monkeypatch.setattr(DiscoveryService, "refresh", seeded)
    monkeypatch.setattr(DiscoveryService, "get_devices", seeded)

    app = create_app()
    client = BluOSClient(settings)
    client.set_volume = AsyncMock(return_value=True)  # type: ignore[method-assign]
    events = EventBus()
    discovery = DiscoveryService(settings, client)
    players = [
        PlayerStatus(id="player-a", ip="192.168.1.10", name="A", status="online", volume=5),
        PlayerStatus(id="player-b", ip="192.168.1.11", name="B", status="online", volume=20),
    ]
    discovery._snapshot.devices = players
    discovery._snapshot.endpoints_by_id = {p.id: p.endpoint for p in players}
    discovery._snapshot.ids_by_endpoint = {p.endpoint: p.id for p in players}
    discovery._snapshot.discovered_at = 1.0
    poller = StatusPoller(settings, discovery, client, events)
    poller.refresh_one = AsyncMock(return_value=None)  # type: ignore[method-assign]
    poller.running = True
    app.state.app_state = AppState(
        settings=settings,
        client=client,
        discovery=discovery,
        events=events,
        poller=poller,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        response = await http.post("/api/v1/fleet/volume", json={"level": 33})
        assert response.status_code == 200
        body = response.json()
        assert body["level"] == 33
        assert body["succeeded"] == 2
        assert body["failed"] == 0
        assert client.set_volume.await_count == 2
        assert {c.args[0] for c in client.set_volume.await_args_list} == {
            "192.168.1.10:11000",
            "192.168.1.11:11000",
        }
    await client.aclose()


@pytest.mark.asyncio
async def test_fleet_volume_filters_device_ids(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def seeded(self: DiscoveryService, *args, **kwargs):
        return self._snapshot

    monkeypatch.setattr(DiscoveryService, "refresh", seeded)
    monkeypatch.setattr(DiscoveryService, "get_devices", seeded)

    app = create_app()
    client = BluOSClient(settings)
    client.set_volume = AsyncMock(return_value=True)  # type: ignore[method-assign]
    events = EventBus()
    discovery = DiscoveryService(settings, client)
    players = [
        PlayerStatus(id="room-a", ip="192.168.1.10", name="Patio", status="online", volume=5),
        PlayerStatus(
            id="zone-1",
            ip="172.16.10.144",
            port=11000,
            name="Living",
            model="CI S2",
            status="online",
            volume=40,
        ),
        PlayerStatus(
            id="zone-2",
            ip="172.16.10.144",
            port=11010,
            name="Kitchen",
            model="CI S2",
            status="online",
            volume=40,
        ),
    ]
    discovery._snapshot.devices = players
    discovery._snapshot.endpoints_by_id = {p.id: p.endpoint for p in players}
    discovery._snapshot.ids_by_endpoint = {p.endpoint: p.id for p in players}
    discovery._snapshot.discovered_at = 1.0
    poller = StatusPoller(settings, discovery, client, events)
    poller.refresh_one = AsyncMock(return_value=None)  # type: ignore[method-assign]
    poller.running = True
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
            "/api/v1/fleet/volume",
            json={"level": 22, "device_ids": ["zone-1", "zone-2"]},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["succeeded"] == 2
        assert {c.args[0] for c in client.set_volume.await_args_list} == {
            "172.16.10.144:11000",
            "172.16.10.144:11010",
        }
    await client.aclose()
