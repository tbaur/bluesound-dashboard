from __future__ import annotations

import httpx
import pytest
import respx

from app.bluos.client import BluOSClient
from app.config import Settings
from tests.fixtures.xml_samples import (
    CAPTURE_SETTINGS,
    PRESETS,
    QUEUE,
    STATUS,
    STATUS_CAPTURE_OPTICAL,
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
        assert player.mac == "90:56:82:00:00:01"
        assert player.device_class == "streamer"
        assert player.stream_format == "Ogg Vorbis"
        assert player.image == "http://192.168.1.20:11000/images/album.png"
        assert player.secs == 30
        assert player.totlen == 240
        assert player.can_seek is True
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
    respx.get("http://192.168.1.20:11000/Playlist").mock(
        return_value=httpx.Response(200, content=QUEUE)
    )
    client = BluOSClient(settings)
    try:
        queue = await client.get_queue("192.168.1.20")
        assert queue is not None
        assert queue.count == 1
        assert queue.items[0].title == "Track A"
        assert queue.items[0].artist == "Artist A"
        assert queue.items[0].album == "Album A"
    finally:
        await client.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_get_inputs_and_bluetooth_from_capture_settings(settings: Settings) -> None:
    respx.get("http://192.168.1.20:11000/Settings").mock(
        return_value=httpx.Response(200, content=CAPTURE_SETTINGS)
    )
    respx.get("http://192.168.1.20:11000/Status").mock(
        return_value=httpx.Response(200, content=STATUS)
    )
    client = BluOSClient(settings)
    try:
        inputs = await client.get_inputs("192.168.1.20")
        assert inputs is not None
        assert [(i.name, i.id, i.selected) for i in inputs] == [
            ("Analog Input", "analog-1", False),
            ("Optical Input", "spdif-1", False),
            ("HDMI ARC", "arc-1", False),
        ]
        mode = await client.get_bluetooth_mode("192.168.1.20")
        assert mode == "Disabled"
    finally:
        await client.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_get_inputs_marks_active_capture_input(settings: Settings) -> None:
    respx.get("http://192.168.1.20:11000/Settings").mock(
        return_value=httpx.Response(200, content=CAPTURE_SETTINGS)
    )
    respx.get("http://192.168.1.20:11000/Status").mock(
        return_value=httpx.Response(200, content=STATUS_CAPTURE_OPTICAL)
    )
    client = BluOSClient(settings)
    try:
        inputs = await client.get_inputs("192.168.1.20")
        assert inputs is not None
        selected = [i for i in inputs if i.selected]
        assert len(selected) == 1
        assert selected[0].id == "spdif-1"
        assert selected[0].name == "Optical Input"
    finally:
        await client.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_set_input_uses_input_type_index(settings: Settings) -> None:
    respx.get("http://192.168.1.20:11000/Settings").mock(
        return_value=httpx.Response(200, content=CAPTURE_SETTINGS)
    )
    respx.get("http://192.168.1.20:11000/Status").mock(
        return_value=httpx.Response(200, content=STATUS)
    )
    route = respx.get("http://192.168.1.20:11000/Play").mock(
        return_value=httpx.Response(200, content=b"<ok/>")
    )
    client = BluOSClient(settings)
    try:
        assert await client.set_input("192.168.1.20", "Optical Input") is True
        assert route.called
        assert "inputTypeIndex=spdif-1" in str(route.calls.last.request.url)
    finally:
        await client.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_clear_and_move_queue_use_v17_paths(settings: Settings) -> None:
    clear_route = respx.get("http://192.168.1.20:11000/Clear").mock(
        return_value=httpx.Response(200, content=b"<playlist length=\"0\"/>")
    )
    move_route = respx.get("http://192.168.1.20:11000/Move").mock(
        return_value=httpx.Response(200, content=b"<ok/>")
    )
    client = BluOSClient(settings)
    try:
        assert await client.clear_queue("192.168.1.20") is True
        assert await client.move_queue_item("192.168.1.20", 1, 0) is True
        assert clear_route.called
        assert "old=1" in str(move_route.calls.last.request.url)
        assert "new=0" in str(move_route.calls.last.request.url)
    finally:
        await client.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_settings_follows_port_redirect(settings: Settings) -> None:
    """BluOS serves /Settings on :11001 and 301s from :11000."""
    respx.get("http://192.168.1.20:11000/Settings").mock(
        return_value=httpx.Response(
            301,
            headers={"Location": "http://192.168.1.20:11001/Settings?id=capture&schemaVersion=32"},
        )
    )
    respx.get("http://192.168.1.20:11001/Settings").mock(
        return_value=httpx.Response(200, content=CAPTURE_SETTINGS)
    )
    respx.get("http://192.168.1.20:11000/Status").mock(
        return_value=httpx.Response(200, content=STATUS)
    )
    client = BluOSClient(settings)
    try:
        inputs = await client.get_inputs("192.168.1.20")
        assert inputs is not None
        assert len(inputs) == 3
        assert await client.get_bluetooth_mode("192.168.1.20") == "Disabled"
    finally:
        await client.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_toggle_reboot_presets_and_sync(settings: Settings) -> None:
    pause = respx.get("http://192.168.1.20:11000/Pause").mock(
        return_value=httpx.Response(200, content=b"<ok/>")
    )
    play = respx.get("http://192.168.1.20:11000/Play").mock(
        return_value=httpx.Response(200, content=b"<ok/>")
    )
    soft = respx.post("http://192.168.1.20:11000/Reboot").mock(
        return_value=httpx.Response(200, content=b"<ok/>")
    )
    hard = respx.post("http://192.168.1.20:11000/reboot").mock(
        return_value=httpx.Response(200, content=b"<ok/>")
    )
    respx.get("http://192.168.1.20:11000/Presets").mock(
        return_value=httpx.Response(200, content=PRESETS)
    )
    preset_play = respx.get("http://192.168.1.20:11000/Preset").mock(
        return_value=httpx.Response(200, content=b"<ok/>")
    )
    bt = respx.get("http://192.168.1.20:11000/audiomodes").mock(
        return_value=httpx.Response(200, content=b"<ok/>")
    )
    add = respx.get("http://192.168.1.20:11000/AddSlave").mock(
        return_value=httpx.Response(200, content=b"<ok/>")
    )
    remove = respx.get("http://192.168.1.20:11000/RemoveSlave").mock(
        return_value=httpx.Response(200, content=b"<ok/>")
    )
    volume = respx.get("http://192.168.1.20:11000/Volume").mock(
        return_value=httpx.Response(200, content=b"<ok/>")
    )
    client = BluOSClient(settings)
    try:
        assert await client.toggle("192.168.1.20", state="play") is True
        assert pause.called
        assert await client.toggle("192.168.1.20", state="pause") is True
        assert play.called
        assert await client.reboot("192.168.1.20", soft=True) is True
        assert soft.called
        assert await client.reboot("192.168.1.20", soft=False) is True
        assert hard.called
        presets = await client.get_presets("192.168.1.20")
        assert presets is not None
        assert presets[0].name == "Morning"
        assert await client.play_preset("192.168.1.20", 1) is True
        assert "id=1" in str(preset_play.calls.last.request.url)
        assert await client.play_preset("192.168.1.20", 0) is False
        assert await client.set_bluetooth_mode("192.168.1.20", 1) is True
        assert "bluetoothAutoplay=1" in str(bt.calls.last.request.url)
        assert await client.add_sync_slave("192.168.1.20", "192.168.1.21") is True
        assert add.called
        assert await client.remove_sync_slave("192.168.1.20", "192.168.1.21") is True
        assert remove.called
        assert await client.adjust_volume("192.168.1.20", 5, 10) is True
        assert "level=15" in str(volume.calls.last.request.url)
    finally:
        await client.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_get_uptime_uses_port_80_diagnostics(settings: Settings) -> None:
    respx.get("http://192.168.1.20/diagnostics").mock(
        return_value=httpx.Response(
            200,
            text="<div>Uptime:</div><div>12h3m</div>",
        )
    )
    client = BluOSClient(settings)
    try:
        assert await client.get_uptime("192.168.1.20") == "12h3m"
    finally:
        await client.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_uptime_fallbacks_and_errors(settings: Settings) -> None:
    respx.get("http://192.168.1.20/diagnostics").mock(
        return_value=httpx.Response(200, text="<p>Uptime: </p> 9d4h")
    )
    client = BluOSClient(settings)
    try:
        assert await client.get_uptime("192.168.1.20") == "9d4h"
        assert await client.get_uptime("not-an-ip") is None
    finally:
        await client.aclose()


def test_input_type_from_icon_hints() -> None:
    assert BluOSClient._input_type_from_capture("Mystery", "ic_optical.png") == "spdif"
    assert BluOSClient._input_type_from_capture("Unknown Port", "") == "analog"
