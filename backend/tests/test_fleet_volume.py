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
    discovery._snapshot.ips_by_id = {p.id: p.ip for p in players}
    discovery._snapshot.ids_by_ip = {p.ip: p.id for p in players}
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
    await client.aclose()
