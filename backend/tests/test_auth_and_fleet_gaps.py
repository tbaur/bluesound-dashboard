"""Auth, empty-fleet cache, fleet volume device_ids, and related gaps."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings, get_settings
from app.models import PlayerStatus, SyncRole
from tests.helpers import app_with_players


@pytest.fixture
def settings() -> Settings:
    get_settings.cache_clear()
    return Settings(
        discovery_cache_ttl=0,
        empty_fleet_rediscovery_seconds=30,
        poll_interval=60,
        allow_non_private_ips=True,
        control_rate_limit_seconds=0,
        api_rate_limit_seconds=0,
        cors_origins="http://127.0.0.1:8765,http://localhost:8765",
    )


@pytest.mark.asyncio
async def test_api_token_required_when_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    get_settings.cache_clear()
    settings = Settings(
        discovery_cache_ttl=0,
        poll_interval=60,
        allow_non_private_ips=True,
        control_rate_limit_seconds=0,
        api_rate_limit_seconds=0,
        api_token="secret-token",
        cors_origins="http://127.0.0.1:8765",
    )
    # Middleware reads get_settings() at create_app time — pin both import sites.
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    monkeypatch.setattr("app.middleware.get_settings", lambda: settings)
    app, client, _, _ = await app_with_players(settings, monkeypatch)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        denied = await http.get("/api/v1/devices")
        assert denied.status_code == 401
        assert denied.json()["code"] == "unauthorized"

        ok = await http.get(
            "/api/v1/devices",
            headers={"Authorization": "Bearer secret-token"},
        )
        assert ok.status_code == 200

        health = await http.get("/api/v1/healthz")
        assert health.status_code == 200
    await client.aclose()
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_fleet_volume_rejects_empty_device_ids(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    app, client, _, _ = await app_with_players(settings, monkeypatch)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        response = await http.post(
            "/api/v1/fleet/volume",
            json={"level": 10, "device_ids": []},
        )
        assert response.status_code == 400
        assert response.json()["code"] == "empty_device_ids"
    await client.aclose()


@pytest.mark.asyncio
async def test_empty_fleet_get_devices_uses_cache(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.bluos.client import BluOSClient
    from app.discovery.service import DiscoveryService

    get_settings.cache_clear()
    settings = Settings(
        allow_non_private_ips=True,
        discovery_cache_ttl=300,
        empty_fleet_rediscovery_seconds=60,
        discovery_method="mdns",
    )
    client = BluOSClient(settings)
    service = DiscoveryService(settings, client)
    calls = {"n": 0}

    async def fake_discover(self: DiscoveryService):
        calls["n"] += 1
        return [], "mdns"

    monkeypatch.setattr(DiscoveryService, "_discover_endpoints", fake_discover)
    first = await service.refresh()
    assert first.devices == []
    assert calls["n"] == 1
    second = await service.get_devices()
    assert second.discovered_at == first.discovered_at
    assert calls["n"] == 1  # cached empty
    await client.aclose()


@pytest.mark.asyncio
async def test_api_token_accepts_x_api_token_and_forwarded_for(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    get_settings.cache_clear()
    settings = Settings(
        discovery_cache_ttl=0,
        poll_interval=60,
        allow_non_private_ips=True,
        control_rate_limit_seconds=0,
        api_rate_limit_seconds=0.01,
        api_token="sse-secret",
        trusted_proxies="127.0.0.1",
        cors_origins="http://127.0.0.1:8765",
    )
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    monkeypatch.setattr("app.middleware.get_settings", lambda: settings)
    app, client, _, _ = await app_with_players(settings, monkeypatch)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        via_header = await http.get(
            "/api/v1/devices",
            headers={"X-API-Token": "sse-secret", "X-Forwarded-For": "10.0.0.9"},
        )
        assert via_header.status_code == 200
        denied_sse = await http.get("/api/v1/events")
        assert denied_sse.status_code == 401
    await client.aclose()
    get_settings.cache_clear()


def test_authorized_accepts_sse_query_token() -> None:
    from app.middleware import _authorized, _client_ip

    scope = {
        "path": "/api/v1/events",
        "query_string": b"token=sse-secret",
        "headers": [],
        "client": ("127.0.0.1", 12345),
    }
    assert _authorized(scope, "sse-secret") is True
    assert _authorized(scope, "wrong") is False
    assert _client_ip(scope, "127.0.0.1", {"127.0.0.1"}) == "127.0.0.1"
    scope["headers"] = [(b"x-forwarded-for", b"10.0.0.9, 127.0.0.1")]
    assert _client_ip(scope, "127.0.0.1", {"127.0.0.1"}) == "10.0.0.9"


@pytest.mark.asyncio
async def test_settings_cache_invalidated_after_write(settings: Settings) -> None:
    from app.bluos.client import BluOSClient
    from app.models import DeviceSettingsResponse

    client = BluOSClient(settings)
    client._settings_page_cache[("192.168.1.20:11000", "audio")] = (
        0.0,
        DeviceSettingsResponse(page_id="audio", settings=[]),
    )
    client._get = AsyncMock(return_value=b"<ok/>")  # type: ignore[method-assign]
    ok = await client.set_device_setting(
        "192.168.1.20",
        "eq-treble",
        "3",
        control_path="/Volume",
    )
    assert ok is True
    assert ("192.168.1.20:11000", "audio") not in client._settings_page_cache
    await client.aclose()


@pytest.mark.asyncio
async def test_rate_limiter_prunes_when_over_cap() -> None:
    from app.bluos.client import RateLimiter

    limiter = RateLimiter(0.001, max_keys=4)
    for i in range(8):
        await limiter.wait(f"k{i}")
    assert len(limiter._last) <= 4


@pytest.mark.asyncio
async def test_refresh_devices_includes_sync(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    players = [
        PlayerStatus(
            id="primary",
            ip="192.168.1.10",
            name="P",
            status="online",
            sync_role=SyncRole.PRIMARY,
            slaves=["192.168.1.11:11000"],
        ),
        PlayerStatus(
            id="slave",
            ip="192.168.1.11",
            name="S",
            status="online",
            sync_role=SyncRole.SYNCED,
            master="192.168.1.10:11000",
        ),
    ]
    app, client, discovery, _ = await app_with_players(
        settings, monkeypatch, players=players
    )
    published: list[dict] = []

    async def capture(event_type: str, data: object) -> None:
        published.append({"type": event_type, "data": data})

    app.state.app_state.events.publish = capture  # type: ignore[method-assign]
    discovery.refresh = AsyncMock(return_value=discovery.snapshot)  # type: ignore[method-assign]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        response = await http.post("/api/v1/devices/refresh")
        assert response.status_code == 200
    assert published
    assert "sync" in published[0]["data"]
    assert published[0]["data"]["sync"]["groups"]
    await client.aclose()
