from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.bluos.client import BluOSClient
from app.config import Settings
from app.discovery.service import DiscoveryService
from app.models import PlayerStatus


@pytest.mark.asyncio
async def test_both_mode_merges_mdns_and_lsdp(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(
        allow_non_private_ips=True,
        discovery_method="both",
        discovery_timeout=1.0,
        discovery_cache_ttl=0,
    )
    client = BluOSClient(settings)
    service = DiscoveryService(settings, client)

    class FakeMDNS:
        def __init__(self, *_args, **_kwargs) -> None:
            pass

        def discover(self) -> list[str]:
            return ["192.168.1.10"]

    class FakeLSDP:
        def __init__(self, *_args, **_kwargs) -> None:
            pass

        def discover(self):
            from app.discovery.lsdp import LSDPDevice

            return [
                LSDPDevice(ip="192.168.1.10", node_id="n10", class_id=1),
                LSDPDevice(ip="192.168.1.11", node_id="n11", class_id=1),
            ]

    monkeypatch.setattr("app.discovery.service.MDNSDiscovery", FakeMDNS)
    monkeypatch.setattr("app.discovery.service.LSDPDiscovery", FakeLSDP)

    async def fake_status(ip: str, device_id: str | None = None, node_id: str = ""):
        return PlayerStatus(id=device_id or ip, ip=ip, name=ip, status="online")

    client.get_player_status = AsyncMock(side_effect=fake_status)  # type: ignore[method-assign]

    snapshot = await service.refresh()
    assert snapshot.method_used == "mdns+lsdp"
    assert {d.ip for d in snapshot.devices} == {"192.168.1.10", "192.168.1.11"}
    assert snapshot.endpoints["192.168.1.10"].node_id == "n10"
    await client.aclose()
