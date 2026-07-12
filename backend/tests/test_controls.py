from __future__ import annotations

import httpx
import pytest
import respx

from app.bluos.client import BluOSClient
from app.config import Settings


@pytest.fixture
def settings() -> Settings:
    return Settings(
        allow_non_private_ips=True,
        device_http_timeout=1.0,
        control_rate_limit_seconds=0,
    )


@pytest.mark.asyncio
@respx.mock
async def test_control_endpoints(settings: Settings) -> None:
    for path in ("/Play", "/Pause", "/Stop", "/Skip", "/Back", "/Volume"):
        respx.get(url__regex=rf"http://192\.168\.1\.20:11000{path}.*").mock(
            return_value=httpx.Response(200, content=b"<ok/>")
        )
    client = BluOSClient(settings)
    try:
        assert await client.play("192.168.1.20")
        assert await client.pause("192.168.1.20")
        assert await client.stop("192.168.1.20")
        assert await client.skip("192.168.1.20")
        assert await client.back("192.168.1.20")
        assert await client.set_volume("192.168.1.20", 40)
        assert await client.set_mute("192.168.1.20", True)
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_poller_refresh_one(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.discovery.service import DiscoveryService
    from app.models import PlayerStatus
    from app.services.events import EventBus
    from app.services.poller import StatusPoller

    client = BluOSClient(settings)
    discovery = DiscoveryService(settings, client)
    player = PlayerStatus(id="p1", ip="192.168.1.20", name="K", status="online")
    discovery._snapshot.devices = [player]
    discovery._snapshot.ips_by_id = {"p1": "192.168.1.20"}
    events = EventBus()
    poller = StatusPoller(settings, discovery, client, events)

    async def fake_status(ip: str, device_id: str | None = None, node_id: str = ""):
        return PlayerStatus(id="p1", ip=ip, name="K", status="online", volume=11)

    monkeypatch.setattr(client, "get_player_status", fake_status)
    updated = await poller.refresh_one("p1")
    assert updated is not None
    assert updated.volume == 11
    await client.aclose()
