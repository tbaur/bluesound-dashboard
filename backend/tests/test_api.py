from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.bluos.client import BluOSClient
from app.config import Settings, get_settings
from app.discovery.service import DiscoveryService
from app.main import create_app
from app.models import PlayerStatus, SyncRole
from app.services.events import EventBus
from app.services.poller import StatusPoller
from app.services.sync import build_sync_state
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


def test_build_sync_state() -> None:
    primary = PlayerStatus(
        id="p1",
        ip="192.168.1.10",
        name="Primary",
        status="online",
        slaves=["192.168.1.11"],
        sync_role=SyncRole.PRIMARY,
        group="Group",
    )
    slave = PlayerStatus(
        id="p2",
        ip="192.168.1.11",
        name="Slave",
        status="online",
        master="192.168.1.10",
        sync_role=SyncRole.SYNCED,
    )
    solo = PlayerStatus(
        id="p3",
        ip="192.168.1.12",
        name="Solo",
        status="online",
        sync_role=SyncRole.STANDALONE,
    )
    state = build_sync_state([primary, slave, solo])
    assert len(state.groups) == 1
    assert state.groups[0].primary_id == "p1"
    assert state.groups[0].slave_ids == ["p2"]
    assert state.standalone_ids == ["p3"]


async def _app_with_player(settings: Settings, monkeypatch: pytest.MonkeyPatch):
    async def seeded(self: DiscoveryService, *args, **kwargs):
        return self._snapshot

    monkeypatch.setattr(DiscoveryService, "refresh", seeded)
    monkeypatch.setattr(DiscoveryService, "get_devices", seeded)
    app = create_app()
    client = BluOSClient(settings)
    events = EventBus()
    discovery = DiscoveryService(settings, client)
    player = PlayerStatus(
        id="player-kitchen",
        ip="192.168.1.20",
        name="Kitchen",
        status="online",
    )
    discovery._snapshot.devices = [player]
    discovery._snapshot.ips_by_id = {player.id: player.ip}
    discovery._snapshot.ids_by_ip = {player.ip: player.id}
    discovery._snapshot.discovered_at = 1.0
    discovery._snapshot.method_used = "mdns"
    poller = StatusPoller(settings, discovery, client, events)
    poller.running = True
    app.state.app_state = AppState(
        settings=settings,
        client=client,
        discovery=discovery,
        events=events,
        poller=poller,
    )
    return app, client


@pytest.mark.asyncio
async def test_ssrf_unknown_device_rejected(settings: Settings, monkeypatch: pytest.MonkeyPatch):
    async def empty_refresh(self: DiscoveryService):
        return self._snapshot

    monkeypatch.setattr(DiscoveryService, "refresh", empty_refresh)
    app = create_app()
    client = BluOSClient(settings)
    events = EventBus()
    discovery = DiscoveryService(settings, client)
    poller = StatusPoller(settings, discovery, client, events)
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
        response = await http.post("/api/v1/devices/player-unknown/play")
        assert response.status_code == 404
        body = response.json()
        assert body["code"] == "device_not_found"
        assert "request_id" in body
    await client.aclose()


@pytest.mark.asyncio
async def test_volume_validation(settings: Settings, monkeypatch: pytest.MonkeyPatch):
    app, client = await _app_with_player(settings, monkeypatch)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        response = await http.post(
            "/api/v1/devices/player-kitchen/volume",
            json={"level": 250},
        )
        assert response.status_code == 422
    await client.aclose()


@pytest.mark.asyncio
async def test_health_and_version(settings: Settings, monkeypatch: pytest.MonkeyPatch):
    app, client = await _app_with_player(settings, monkeypatch)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        health = await http.get("/api/v1/healthz")
        assert health.status_code == 200
        version = await http.get("/api/v1/version")
        assert version.status_code == 200
        assert "version" in version.json()
        devices = await http.get("/api/v1/devices")
        assert devices.status_code == 200
        assert len(devices.json()["devices"]) == 1
    await client.aclose()
