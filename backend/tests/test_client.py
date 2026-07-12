from __future__ import annotations

import httpx
import pytest
import respx

from app.bluos.client import BluOSClient
from app.config import Settings
from tests.fixtures.xml_samples import (
    QUEUE,
    STATUS,
    STATUS_GROUP_VOLUME,
    STATUS_TIDAL_CONNECT,
    SYNC_STATUS,
    SYNC_STATUS_SLAVE,
)


@pytest.fixture
def settings() -> Settings:
    return Settings(allow_non_private_ips=True, device_http_timeout=1.0)


@pytest.mark.asyncio
@respx.mock
async def test_get_player_status_parses_sync_and_status(settings: Settings) -> None:
    respx.get("http://192.168.1.20:11000/SyncStatus").mock(
        return_value=httpx.Response(200, content=SYNC_STATUS)
    )
    respx.get("http://192.168.1.20:11000/Status").mock(
        return_value=httpx.Response(200, content=STATUS)
    )
    client = BluOSClient(settings)
    try:
        player = await client.get_player_status("192.168.1.20", device_id="kitchen")
        assert player.status == "online"
        assert player.name == "Kitchen"
        assert player.state == "play"
        assert player.volume == 22
        assert player.track == "Song Title"
        assert player.slaves == ["192.168.1.21"]
        assert player.sync_role.value == "primary"
    finally:
        await client.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_synced_slave_uses_syncstatus_volume_not_group_status(
    settings: Settings,
) -> None:
    """Synced players' /Status volume is group/primary — use SyncStatus instead."""
    respx.get("http://192.168.1.88:11000/SyncStatus").mock(
        return_value=httpx.Response(200, content=SYNC_STATUS_SLAVE)
    )
    respx.get("http://192.168.1.88:11000/Status").mock(
        return_value=httpx.Response(200, content=STATUS_GROUP_VOLUME)
    )
    client = BluOSClient(settings)
    try:
        player = await client.get_player_status("192.168.1.88", device_id="kitchen")
        assert player.sync_role.value == "synced"
        assert player.volume == 64
        assert player.state == "stream"
        assert player.track == "Track"
    finally:
        await client.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_prefers_service_name_over_service_id(settings: Settings) -> None:
    """BluOS service id is TidalConnect; serviceName is the display label."""
    respx.get("http://192.168.1.20:11000/SyncStatus").mock(
        return_value=httpx.Response(200, content=SYNC_STATUS)
    )
    respx.get("http://192.168.1.20:11000/Status").mock(
        return_value=httpx.Response(200, content=STATUS_TIDAL_CONNECT)
    )
    client = BluOSClient(settings)
    try:
        player = await client.get_player_status("192.168.1.20", device_id="kitchen")
        assert player.service == "TIDAL connect"
    finally:
        await client.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_blocks_non_private_by_default() -> None:
    settings = Settings(allow_non_private_ips=False)
    client = BluOSClient(settings)
    try:
        player = await client.get_player_status("8.8.8.8", device_id="x")
        assert player.status == "offline"
    finally:
        await client.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_get_queue(settings: Settings) -> None:
    respx.get("http://192.168.1.20:11000/Queue").mock(
        return_value=httpx.Response(200, content=QUEUE)
    )
    client = BluOSClient(settings)
    try:
        queue = await client.get_queue("192.168.1.20")
        assert queue is not None
        assert queue.count == 1
        assert queue.items[0].title == "Track A"
    finally:
        await client.aclose()
