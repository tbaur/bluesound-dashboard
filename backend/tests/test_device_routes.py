"""Device and fleet API route coverage with mocked BluOS client."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings, get_settings
from app.models import AudioInput, PlayerStatus, Preset, QueueItem, QueueResponse, SyncRole
from tests.helpers import app_with_players


@pytest.fixture
def settings() -> Settings:
    get_settings.cache_clear()
    return Settings(
        discovery_cache_ttl=0,
        poll_interval=60,
        allow_non_private_ips=True,
        control_rate_limit_seconds=0,
        cors_origins="http://localhost:5173",
    )


@pytest.mark.asyncio
async def test_device_transport_controls(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    app, client, _, _ = await app_with_players(settings, monkeypatch)
    for name in ("play", "pause", "stop", "skip", "back"):
        setattr(client, name, AsyncMock(return_value=True))
    client.toggle = AsyncMock(return_value=True)  # type: ignore[method-assign]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        for path in ("play", "pause", "stop", "skip", "back", "toggle"):
            response = await http.post(f"/api/v1/devices/player-kitchen/{path}")
            assert response.status_code == 204, path
    await client.aclose()


@pytest.mark.asyncio
async def test_device_volume_mute_adjust(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    app, client, _, _ = await app_with_players(settings, monkeypatch)
    client.set_volume = AsyncMock(return_value=True)  # type: ignore[method-assign]
    client.set_mute = AsyncMock(return_value=True)  # type: ignore[method-assign]
    client.adjust_volume = AsyncMock(return_value=True)  # type: ignore[method-assign]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        vol = await http.post("/api/v1/devices/player-kitchen/volume", json={"level": 40})
        assert vol.status_code == 204
        mute = await http.post("/api/v1/devices/player-kitchen/mute", json={"mute": True})
        assert mute.status_code == 204
        assert (
            await http.post("/api/v1/devices/player-kitchen/volume/adjust", json={"delta": 2})
        ).status_code == 204
        client.adjust_volume.assert_awaited_with("192.168.1.20", 2, 22)
    await client.aclose()


@pytest.mark.asyncio
async def test_control_failure_returns_502(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    app, client, _, _ = await app_with_players(settings, monkeypatch)
    client.play = AsyncMock(return_value=False)  # type: ignore[method-assign]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        response = await http.post("/api/v1/devices/player-kitchen/play")
        assert response.status_code == 502
        assert response.json()["code"] == "bluos_control_failed"
    await client.aclose()


@pytest.mark.asyncio
async def test_get_device_and_diagnose(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    app, client, _, _ = await app_with_players(settings, monkeypatch)
    client.get_diagnostics = AsyncMock(  # type: ignore[method-assign]
        return_value={
            "uptime": "1h2m",
            "network_name": "home",
            "signal_strength": "-70 dBm",
            "total_songs": "0",
            "web_ip": "192.168.1.20",
            "web_mac": "aa:bb:cc",
            "web_fw": "4.16.6",
        }
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        device = await http.get("/api/v1/devices/player-kitchen")
        assert device.status_code == 200
        assert device.json()["name"] == "Kitchen"

        diag = await http.get("/api/v1/devices/player-kitchen/diagnose")
        assert diag.status_code == 200
        body = diag.json()
        assert body["uptime"] == "1h2m"
        assert body["signal_strength"] == "-70 dBm"
        assert body["network_name"] == "home"
    await client.aclose()


@pytest.mark.asyncio
async def test_readyz_and_refresh(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    app, client, _, poller = await app_with_players(settings, monkeypatch)
    poller.last_poll_at = 1.0

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        ready = await http.get("/api/v1/readyz")
        assert ready.status_code == 200
        assert ready.json()["status"] == "ok"

        refreshed = await http.post("/api/v1/devices/refresh")
        assert refreshed.status_code == 200
        assert len(refreshed.json()["devices"]) == 1
    await client.aclose()


@pytest.mark.asyncio
async def test_queue_inputs_bluetooth_presets(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    app, client, _, _ = await app_with_players(settings, monkeypatch)
    client.get_queue = AsyncMock(  # type: ignore[method-assign]
        return_value=QueueResponse(
            count=1,
            items=[QueueItem(title="A", artist="B", album="C", service="Spotify")],
        )
    )
    client.clear_queue = AsyncMock(return_value=True)  # type: ignore[method-assign]
    client.move_queue_item = AsyncMock(return_value=True)  # type: ignore[method-assign]
    client.get_inputs = AsyncMock(  # type: ignore[method-assign]
        return_value=[AudioInput(id="analog-1", name="Analog", selected=False)]
    )
    client.set_input = AsyncMock(return_value=True)  # type: ignore[method-assign]
    client.get_bluetooth_mode = AsyncMock(return_value="Manual")  # type: ignore[method-assign]
    client.set_bluetooth_mode = AsyncMock(return_value=True)  # type: ignore[method-assign]
    client.get_presets = AsyncMock(  # type: ignore[method-assign]
        return_value=[Preset(id="1", name="Morning")]
    )
    client.play_preset = AsyncMock(return_value=True)  # type: ignore[method-assign]
    client.reboot = AsyncMock(return_value=True)  # type: ignore[method-assign]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        queue = await http.get("/api/v1/devices/player-kitchen/queue")
        assert queue.status_code == 200
        assert queue.json()["count"] == 1

        assert (await http.post("/api/v1/devices/player-kitchen/queue/clear")).status_code == 204
        assert (
            await http.post(
                "/api/v1/devices/player-kitchen/queue/move",
                json={"from_index": 1, "to_index": 0},
            )
        ).status_code == 204

        inputs = await http.get("/api/v1/devices/player-kitchen/inputs")
        assert inputs.status_code == 200
        assert len(inputs.json()) == 1

        assert (
            await http.post("/api/v1/devices/player-kitchen/input", json={"input": "Analog"})
        ).status_code == 204

        bt = await http.get("/api/v1/devices/player-kitchen/bluetooth")
        assert bt.json()["mode"] == "Manual"
        assert (
            await http.post("/api/v1/devices/player-kitchen/bluetooth", json={"mode": 3})
        ).status_code == 204

        presets = await http.get("/api/v1/devices/player-kitchen/presets")
        assert presets.status_code == 200
        assert (await http.post("/api/v1/devices/player-kitchen/presets/1/play")).status_code == 204

        assert (
            await http.post("/api/v1/devices/player-kitchen/reboot", json={"soft": True})
        ).status_code == 204
    await client.aclose()


@pytest.mark.asyncio
async def test_read_endpoints_fail_when_client_returns_none(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, client, _, _ = await app_with_players(settings, monkeypatch)
    client.get_queue = AsyncMock(return_value=None)  # type: ignore[method-assign]
    client.get_inputs = AsyncMock(return_value=None)  # type: ignore[method-assign]
    client.get_bluetooth_mode = AsyncMock(return_value=None)  # type: ignore[method-assign]
    client.get_presets = AsyncMock(return_value=None)  # type: ignore[method-assign]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        assert (await http.get("/api/v1/devices/player-kitchen/queue")).status_code == 502
        assert (await http.get("/api/v1/devices/player-kitchen/inputs")).status_code == 502
        assert (await http.get("/api/v1/devices/player-kitchen/bluetooth")).status_code == 502
        assert (await http.get("/api/v1/devices/player-kitchen/presets")).status_code == 502
    await client.aclose()


@pytest.mark.asyncio
async def test_fleet_mute_pause_stop(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    players = [
        PlayerStatus(id="a", ip="192.168.1.10", name="A", status="online"),
        PlayerStatus(id="b", ip="192.168.1.11", name="B", status="online"),
    ]
    app, client, _, _ = await app_with_players(settings, monkeypatch, players=players)
    client.set_mute = AsyncMock(return_value=True)  # type: ignore[method-assign]
    client.pause = AsyncMock(return_value=True)  # type: ignore[method-assign]
    client.stop = AsyncMock(return_value=True)  # type: ignore[method-assign]
    client.reboot = AsyncMock(return_value=True)  # type: ignore[method-assign]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        mute = await http.post("/api/v1/fleet/mute", json={"mute": True})
        assert mute.status_code == 200
        assert mute.json()["succeeded"] == 2

        pause = await http.post("/api/v1/fleet/pause")
        assert pause.status_code == 200
        assert pause.json()["action"] == "pause"

        stop = await http.post("/api/v1/fleet/stop")
        assert stop.status_code == 200
        assert stop.json()["action"] == "stop"

        soft = await http.post("/api/v1/fleet/reboot", json={"soft": True})
        assert soft.status_code == 200
        assert soft.json()["action"] == "soft_reboot"
        assert soft.json()["succeeded"] == 2
        assert client.reboot.await_count == 2

        hard = await http.post("/api/v1/fleet/reboot", json={"soft": False})
        assert hard.status_code == 200
        assert hard.json()["action"] == "reboot"
    await client.aclose()


@pytest.mark.asyncio
async def test_sync_add_enable_and_get(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    players = [
        PlayerStatus(
            id="primary",
            ip="192.168.1.10",
            name="Living",
            status="online",
            sync_role=SyncRole.STANDALONE,
        ),
        PlayerStatus(
            id="slave",
            ip="192.168.1.11",
            name="Kitchen",
            status="online",
            sync_role=SyncRole.STANDALONE,
        ),
    ]
    app, client, _, poller = await app_with_players(settings, monkeypatch, players=players)
    client.add_sync_slave = AsyncMock(return_value=True)  # type: ignore[method-assign]
    poller.refresh_one = AsyncMock(return_value=None)  # type: ignore[method-assign]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        sync = await http.get("/api/v1/sync")
        assert sync.status_code == 200
        assert len(sync.json()["standalone_ids"]) == 2

        add = await http.post(
            "/api/v1/sync/add",
            json={"master_id": "primary", "slave_id": "slave"},
        )
        assert add.status_code == 204

        enable = await http.post("/api/v1/sync/enable", json={"primary_id": "primary"})
        assert enable.status_code == 204
        assert client.add_sync_slave.await_count >= 2
    await client.aclose()


@pytest.mark.asyncio
async def test_sync_add_rejects_same_device(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    app, client, _, _ = await app_with_players(settings, monkeypatch)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        response = await http.post(
            "/api/v1/sync/add",
            json={"master_id": "player-kitchen", "slave_id": "player-kitchen"},
        )
        assert response.status_code == 400
        assert response.json()["code"] == "invalid_sync_pair"
    await client.aclose()


@pytest.mark.asyncio
async def test_settings_upgrade_and_fleet_firmware(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.models import DeviceSetting, DeviceSettingsResponse, UpgradeStatus

    app, client, _, _ = await app_with_players(settings, monkeypatch)
    client.get_device_settings = AsyncMock(  # type: ignore[method-assign]
        return_value=DeviceSettingsResponse(
            page_id="audio",
            settings=[
                DeviceSetting(
                    id="eq-switch",
                    display_name="Tone Controls",
                    kind="boolean",
                    value="ON",
                )
            ],
        )
    )
    client.set_device_setting = AsyncMock(return_value=True)  # type: ignore[method-assign]
    client.get_upgrade_status = AsyncMock(  # type: ignore[method-assign]
        return_value=UpgradeStatus(
            device_id="player-kitchen",
            name="Kitchen",
            ip="192.168.1.20",
            current_fw="4.16.6",
            update_available=False,
            message="No update available.",
            ok=True,
        )
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        settings_resp = await http.get("/api/v1/devices/player-kitchen/settings/audio")
        assert settings_resp.status_code == 200
        assert settings_resp.json()["settings"][0]["id"] == "eq-switch"

        write = await http.post(
            "/api/v1/devices/player-kitchen/settings",
            json={"id": "channelMode", "value": "left", "control_path": "/audiomodes"},
        )
        assert write.status_code == 204
        client.set_device_setting.assert_awaited_once()
        assert client.set_device_setting.await_args.kwargs.get("control_path") == "/audiomodes"

        upgrade = await http.get("/api/v1/devices/player-kitchen/upgrade")
        assert upgrade.status_code == 200
        assert upgrade.json()["update_available"] is False

        firmware = await http.get("/api/v1/fleet/firmware")
        assert firmware.status_code == 200
        assert firmware.json()["devices"][0]["device_id"] == "player-kitchen"

        fleet_upgrades = await http.get("/api/v1/fleet/upgrades")
        assert fleet_upgrades.status_code == 200
        assert fleet_upgrades.json()["checked"] == 1

        client.get_device_settings = AsyncMock(return_value=None)  # type: ignore[method-assign]
        missing = await http.get("/api/v1/devices/player-kitchen/settings/player")
        assert missing.status_code == 502

        client.set_device_setting = AsyncMock(return_value=False)  # type: ignore[method-assign]
        failed = await http.post(
            "/api/v1/devices/player-kitchen/settings",
            json={"id": "channelMode", "value": "left"},
        )
        assert failed.status_code == 502
        assert client.set_device_setting.await_args.kwargs.get("control_path") == ""

        bad_path = await http.post(
            "/api/v1/devices/player-kitchen/settings",
            json={"id": "channelMode", "value": "left", "control_path": "audiomodes"},
        )
        assert bad_path.status_code == 422
    await client.aclose()


@pytest.mark.asyncio
async def test_settings_write_forwards_empty_control_path(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """SPA may omit control_path; backend resolves via Settings XML."""
    app, client, _, _ = await app_with_players(settings, monkeypatch)
    client.set_device_setting = AsyncMock(return_value=True)  # type: ignore[method-assign]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        write = await http.post(
            "/api/v1/devices/player-kitchen/settings",
            json={"id": "fixedVolume", "value": "ON"},
        )
        assert write.status_code == 204
        client.set_device_setting.assert_awaited_once_with(
            "192.168.1.20",
            "fixedVolume",
            "ON",
            control_path="",
        )
    await client.aclose()
