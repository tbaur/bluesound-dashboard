"""Versioned REST + SSE API."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request, Response, status
from fastapi.responses import StreamingResponse

from app import __version__
from app.api.deps import get_state
from app.api.errors import AppError
from app.models import (
    BluetoothRequest,
    DevicesResponse,
    DiagnoseResponse,
    FleetActionResponse,
    FleetVolumeResponse,
    FleetVolumeResult,
    HealthResponse,
    InputRequest,
    MuteRequest,
    QueueMoveRequest,
    RebootRequest,
    SyncEnableRequest,
    SyncPairRequest,
    SyncState,
    VersionInfo,
    VolumeAdjustRequest,
    VolumeRequest,
)
from app.services.sync import build_sync_state
from app.state import AppState
from app.validators import validate_device_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1")
StateDep = Annotated[AppState, Depends(get_state)]


def _require_device(state: AppState, device_id: str) -> str:
    if not validate_device_id(device_id):
        raise AppError(400, "invalid_device_id", "Device id format is invalid")
    if not state.discovery.is_known_id(device_id):
        raise AppError(404, "device_not_found", "Device is not in the discovered set")
    ip = state.discovery.resolve_ip(device_id)
    if not ip:
        raise AppError(404, "device_not_found", "Device IP could not be resolved")
    if not state.settings.is_allowed_device_ip(ip):
        raise AppError(403, "ip_not_allowed", "Device IP is outside the allowed range")
    if state.discovery.is_in_grace(device_id):
        logger.warning(
            "control_during_grace",
            extra={"op": "resolve", "device_id": device_id, "device_ip": ip},
        )
    return ip


def _schedule_refresh(state: AppState, device_id: str) -> None:
    """Fire-and-forget status refresh with logged failures."""
    task = asyncio.create_task(
        state.poller.refresh_one(device_id),
        name=f"refresh-{device_id}",
    )

    def _done(done: asyncio.Task[object]) -> None:
        try:
            exc = done.exception()
        except asyncio.CancelledError:
            return
        if exc is not None:
            logger.warning(
                "refresh_one_failed",
                extra={"device_id": device_id},
                exc_info=exc,
            )

    task.add_done_callback(_done)


@router.get("/healthz", response_model=HealthResponse)
async def healthz(state: StateDep) -> HealthResponse:
    poller_running = state.poller.running
    return HealthResponse(
        status="ok" if poller_running else "degraded",
        details={"poller_running": poller_running},
    )


@router.get("/readyz", response_model=HealthResponse)
async def readyz(state: StateDep) -> HealthResponse:
    if not state.poller.running:
        raise AppError(503, "not_ready", "Status poller is not running")
    return HealthResponse(
        status="ok",
        details={
            "device_count": len(state.discovery.snapshot.devices),
            "last_poll_at": state.poller.last_poll_at,
            "last_error": state.poller.last_error,
            "sse_dropped_events": state.events.dropped_events,
            "sse_subscribers": len(state.events._subscribers),
        },
    )


@router.get("/version", response_model=VersionInfo)
async def version() -> VersionInfo:
    return VersionInfo(version=__version__)


@router.get("/devices", response_model=DevicesResponse)
async def list_devices(state: StateDep) -> DevicesResponse:
    snapshot = await state.discovery.get_devices()
    return DevicesResponse(
        devices=snapshot.devices,
        discovered_at=snapshot.discovered_at,
        discovery_method=snapshot.method_used,
    )


@router.post("/devices/refresh", response_model=DevicesResponse)
async def refresh_devices(state: StateDep) -> DevicesResponse:
    snapshot = await state.discovery.refresh()
    await state.events.publish(
        "fleet",
        {
            "devices": [d.model_dump() for d in snapshot.devices],
            "discovered_at": snapshot.discovered_at,
        },
    )
    return DevicesResponse(
        devices=snapshot.devices,
        discovered_at=snapshot.discovered_at,
        discovery_method=snapshot.method_used,
    )


@router.post("/fleet/volume", response_model=FleetVolumeResponse)
async def set_fleet_volume(body: VolumeRequest, state: StateDep) -> FleetVolumeResponse:
    """Set every discovered player to the same volume level."""
    snapshot = await state.discovery.get_devices()
    if not snapshot.devices:
        raise AppError(404, "no_devices", "No discovered devices to control")

    level = body.level

    async def set_one(device_id: str, name: str, ip: str) -> FleetVolumeResult:
        if not state.settings.is_allowed_device_ip(ip):
            return FleetVolumeResult(device_id=device_id, name=name, ok=False)
        logger.info(
            "control_op",
            extra={"op": "fleet_volume", "device_id": device_id, "device_ip": ip},
        )
        ok = await state.client.set_volume(ip, level)
        if ok:
            _schedule_refresh(state, device_id)
        else:
            logger.warning(
                "control_failed",
                extra={"op": "fleet_volume", "device_id": device_id, "device_ip": ip},
            )
        return FleetVolumeResult(device_id=device_id, name=name, ok=ok)

    results = await asyncio.gather(
        *(set_one(d.id, d.name, d.ip) for d in snapshot.devices)
    )
    succeeded = sum(1 for r in results if r.ok)
    failed = len(results) - succeeded
    logger.info(
        "fleet_action_complete",
        extra={"action": "volume", "succeeded": succeeded, "failed": failed},
    )
    if succeeded == 0:
        raise AppError(502, "fleet_volume_failed", "Failed to set volume on all devices")
    return FleetVolumeResponse(
        level=level,
        succeeded=succeeded,
        failed=failed,
        results=list(results),
    )


async def _fleet_action(
    state: AppState,
    action: str,
    run,
) -> FleetActionResponse:
    snapshot = await state.discovery.get_devices()
    if not snapshot.devices:
        raise AppError(404, "no_devices", "No discovered devices to control")

    async def one(device_id: str, name: str, ip: str) -> FleetVolumeResult:
        if not state.settings.is_allowed_device_ip(ip):
            return FleetVolumeResult(device_id=device_id, name=name, ok=False)
        logger.info(
            "control_op",
            extra={"op": f"fleet_{action}", "device_id": device_id, "device_ip": ip},
        )
        ok = await run(ip)
        if ok:
            _schedule_refresh(state, device_id)
        else:
            logger.warning(
                "control_failed",
                extra={"op": f"fleet_{action}", "device_id": device_id, "device_ip": ip},
            )
        return FleetVolumeResult(device_id=device_id, name=name, ok=ok)

    results = await asyncio.gather(
        *(one(d.id, d.name, d.ip) for d in snapshot.devices)
    )
    succeeded = sum(1 for r in results if r.ok)
    failed = len(results) - succeeded
    logger.info(
        "fleet_action_complete",
        extra={"action": action, "succeeded": succeeded, "failed": failed},
    )
    if succeeded == 0:
        raise AppError(502, "fleet_action_failed", f"Failed to {action} on all devices")
    return FleetActionResponse(
        action=action,
        succeeded=succeeded,
        failed=failed,
        results=list(results),
    )


@router.post("/fleet/mute", response_model=FleetActionResponse)
async def fleet_mute(body: MuteRequest, state: StateDep) -> FleetActionResponse:
    return await _fleet_action(
        state,
        "mute" if body.mute else "unmute",
        lambda ip: state.client.set_mute(ip, body.mute),
    )


@router.post("/fleet/pause", response_model=FleetActionResponse)
async def fleet_pause(state: StateDep) -> FleetActionResponse:
    return await _fleet_action(state, "pause", state.client.pause)


@router.post("/fleet/stop", response_model=FleetActionResponse)
async def fleet_stop(state: StateDep) -> FleetActionResponse:
    return await _fleet_action(state, "stop", state.client.stop)


@router.get("/devices/{device_id}")
async def get_device(device_id: str, state: StateDep):
    _require_device(state, device_id)
    device = state.discovery.get_device(device_id)
    if device is None:
        # Refresh single if in grace
        refreshed = await state.poller.refresh_one(device_id)
        if refreshed is None:
            raise AppError(404, "device_not_found", "Device not found")
        return refreshed
    return device


async def _control(state: AppState, device_id: str, op_name: str, coro) -> Response:
    ip = _require_device(state, device_id)
    logger.info(
        "control_op",
        extra={"op": op_name, "device_id": device_id, "device_ip": ip},
    )
    ok = await coro(ip)
    if not ok:
        logger.warning(
            "control_failed",
            extra={"op": op_name, "device_id": device_id, "device_ip": ip},
        )
        raise AppError(502, "bluos_control_failed", f"BluOS {op_name} failed")
    # Return immediately; poller/SSE will catch up
    _schedule_refresh(state, device_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/devices/{device_id}/play", status_code=204)
async def play(device_id: str, state: StateDep) -> Response:
    return await _control(state, device_id, "play", state.client.play)


@router.post("/devices/{device_id}/pause", status_code=204)
async def pause(device_id: str, state: StateDep) -> Response:
    return await _control(state, device_id, "pause", state.client.pause)


@router.post("/devices/{device_id}/stop", status_code=204)
async def stop(device_id: str, state: StateDep) -> Response:
    return await _control(state, device_id, "stop", state.client.stop)


@router.post("/devices/{device_id}/skip", status_code=204)
async def skip(device_id: str, state: StateDep) -> Response:
    return await _control(state, device_id, "skip", state.client.skip)


@router.post("/devices/{device_id}/toggle", status_code=204)
async def toggle(device_id: str, state: StateDep) -> Response:
    ip = _require_device(state, device_id)
    device = state.discovery.get_device(device_id)
    state_name = device.state if device else "stop"

    async def op(_: str) -> bool:
        return await state.client.toggle(ip, state=state_name)

    return await _control(state, device_id, "toggle", op)


@router.post("/devices/{device_id}/volume/adjust", status_code=204)
async def volume_adjust(device_id: str, body: VolumeAdjustRequest, state: StateDep) -> Response:
    ip = _require_device(state, device_id)
    device = state.discovery.get_device(device_id)
    current = device.volume if device else 0

    async def op(_: str) -> bool:
        return await state.client.adjust_volume(ip, body.delta, current)

    return await _control(state, device_id, "volume_adjust", op)


@router.get("/devices/{device_id}/diagnose", response_model=DiagnoseResponse)
async def diagnose(device_id: str, state: StateDep) -> DiagnoseResponse:
    ip = _require_device(state, device_id)
    device = state.discovery.get_device(device_id)
    if device is None:
        refreshed = await state.poller.refresh_one(device_id)
        if refreshed is None:
            raise AppError(404, "device_not_found", "Device not found")
        device = refreshed
    uptime = await state.client.get_uptime(ip)
    return DiagnoseResponse(
        device_id=device.id,
        ip=device.ip,
        name=device.name,
        model=device.model,
        full_model=device.full_model,
        device_class=device.device_class,
        mac=device.mac,
        fw=device.fw,
        state=device.state,
        service=device.service,
        volume=device.volume,
        muted=device.muted,
        db=device.db,
        sync_role=device.sync_role,
        master=device.master,
        group=device.group,
        quality=device.quality,
        stream_format=device.stream_format,
        uptime=uptime,
    )


@router.post("/devices/{device_id}/reboot", status_code=204)
async def reboot(device_id: str, body: RebootRequest, state: StateDep) -> Response:
    ip = _require_device(state, device_id)

    async def op(_: str) -> bool:
        return await state.client.reboot(ip, soft=body.soft)

    op_name = "soft_reboot" if body.soft else "reboot"
    return await _control(state, device_id, op_name, op)

@router.post("/devices/{device_id}/back", status_code=204)
async def back(device_id: str, state: StateDep) -> Response:
    return await _control(state, device_id, "back", state.client.back)


@router.post("/devices/{device_id}/volume", status_code=204)
async def volume(device_id: str, body: VolumeRequest, state: StateDep) -> Response:
    ip = _require_device(state, device_id)

    async def op(_: str) -> bool:
        return await state.client.set_volume(ip, body.level)

    return await _control(state, device_id, "volume", op)


@router.post("/devices/{device_id}/mute", status_code=204)
async def mute(device_id: str, body: MuteRequest, state: StateDep) -> Response:
    ip = _require_device(state, device_id)

    async def op(_: str) -> bool:
        return await state.client.set_mute(ip, body.mute)

    return await _control(state, device_id, "mute", op)


@router.get("/devices/{device_id}/queue")
async def queue(device_id: str, state: StateDep):
    ip = _require_device(state, device_id)
    result = await state.client.get_queue(ip)
    if result is None:
        raise AppError(502, "bluos_queue_failed", "Failed to read queue")
    return result


@router.post("/devices/{device_id}/queue/clear", status_code=204)
async def queue_clear(device_id: str, state: StateDep) -> Response:
    return await _control(state, device_id, "queue_clear", state.client.clear_queue)


@router.post("/devices/{device_id}/queue/move", status_code=204)
async def queue_move(device_id: str, body: QueueMoveRequest, state: StateDep) -> Response:
    ip = _require_device(state, device_id)

    async def op(_: str) -> bool:
        return await state.client.move_queue_item(ip, body.from_index, body.to_index)

    return await _control(state, device_id, "queue_move", op)


@router.get("/devices/{device_id}/inputs")
async def inputs(device_id: str, state: StateDep):
    ip = _require_device(state, device_id)
    result = await state.client.get_inputs(ip)
    if result is None:
        raise AppError(502, "bluos_inputs_failed", "Failed to read inputs")
    return result


@router.post("/devices/{device_id}/input", status_code=204)
async def set_input(device_id: str, body: InputRequest, state: StateDep) -> Response:
    ip = _require_device(state, device_id)

    async def op(_: str) -> bool:
        return await state.client.set_input(ip, body.input)

    return await _control(state, device_id, "input", op)


@router.get("/devices/{device_id}/bluetooth")
async def bluetooth(device_id: str, state: StateDep):
    ip = _require_device(state, device_id)
    mode = await state.client.get_bluetooth_mode(ip)
    if mode is None:
        raise AppError(502, "bluos_bluetooth_failed", "Failed to read Bluetooth mode")
    return {"mode": mode}


@router.post("/devices/{device_id}/bluetooth", status_code=204)
async def set_bluetooth(device_id: str, body: BluetoothRequest, state: StateDep) -> Response:
    ip = _require_device(state, device_id)

    async def op(_: str) -> bool:
        return await state.client.set_bluetooth_mode(ip, body.mode)

    return await _control(state, device_id, "bluetooth", op)


@router.get("/devices/{device_id}/presets")
async def presets(device_id: str, state: StateDep):
    ip = _require_device(state, device_id)
    result = await state.client.get_presets(ip)
    if result is None:
        raise AppError(502, "bluos_presets_failed", "Failed to read presets")
    return result


@router.post("/devices/{device_id}/presets/{preset_id}/play", status_code=204)
async def play_preset(
    device_id: str,
    preset_id: Annotated[int, Path(ge=1, le=10_000)],
    state: StateDep,
) -> Response:
    ip = _require_device(state, device_id)

    async def op(_: str) -> bool:
        return await state.client.play_preset(ip, preset_id)

    return await _control(state, device_id, "preset", op)


@router.get("/sync", response_model=SyncState)
async def sync_state(state: StateDep) -> SyncState:
    snapshot = await state.discovery.get_devices()
    return build_sync_state(snapshot.devices)


@router.post("/sync/add", status_code=204)
async def sync_add(body: SyncPairRequest, state: StateDep) -> Response:
    master_ip = _require_device(state, body.master_id)
    slave_ip = _require_device(state, body.slave_id)
    if master_ip == slave_ip:
        raise AppError(400, "invalid_sync_pair", "Master and slave must differ")
    logger.info(
        "control_op",
        extra={
            "op": "sync_add",
            "device_id": body.master_id,
            "device_ip": master_ip,
        },
    )
    ok = await state.client.add_sync_slave(master_ip, slave_ip)
    if not ok:
        logger.warning(
            "control_failed",
            extra={"op": "sync_add", "device_id": body.master_id, "device_ip": master_ip},
        )
        raise AppError(502, "sync_add_failed", "Failed to add sync slave")
    await state.poller.refresh_one(body.master_id)
    await state.poller.refresh_one(body.slave_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/sync/enable", status_code=204)
async def sync_enable(body: SyncEnableRequest, state: StateDep) -> Response:
    """Group every other discovered player under one primary."""
    primary_ip = _require_device(state, body.primary_id)
    snapshot = await state.discovery.get_devices()
    slaves = [d for d in snapshot.devices if d.id != body.primary_id]
    if not slaves:
        raise AppError(400, "no_slaves", "No other players to group under the primary")
    logger.info(
        "control_op",
        extra={"op": "sync_enable", "device_id": body.primary_id, "device_ip": primary_ip},
    )

    async def link_slave(slave_id: str, slave_ip: str) -> bool:
        return await state.client.add_sync_slave(primary_ip, slave_ip)

    results = await asyncio.gather(*(link_slave(d.id, d.ip) for d in slaves))
    failures = sum(1 for ok in results if not ok)
    if failures == len(results):
        logger.warning(
            "control_failed",
            extra={"op": "sync_enable", "device_id": body.primary_id, "device_ip": primary_ip},
        )
        raise AppError(502, "sync_enable_failed", "Failed to enable sync group")
    affected = {body.primary_id, *(d.id for d in slaves)}
    await asyncio.gather(*(state.poller.refresh_one(device_id) for device_id in affected))
    if failures:
        raise AppError(502, "sync_enable_partial", f"Failed to add {failures} sync link(s)")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _clear_playback_after_leave(
    state: AppState,
    *,
    master_id: str,
    master_ip: str,
    slave_id: str,
    slave_ip: str,
) -> None:
    """Stop freed players so leftover AirPlay/capture sessions do not linger.

    After RemoveSlave, secondaries are standalone again, but the former primary
    often keeps a paused AirPlay session. That blocks Apple multi-room AirPlay
    until Stop clears the capture endpoint.
    """
    slave_stopped = await state.client.stop(slave_ip)
    if not slave_stopped:
        logger.warning(
            "stop_after_ungroup_failed",
            extra={"op": "stop", "device_id": slave_id, "device_ip": slave_ip, "role": "slave"},
        )
    primary = await state.client.get_player_status(master_ip, device_id=master_id)
    if not primary.slaves:
        master_stopped = await state.client.stop(master_ip)
        if not master_stopped:
            logger.warning(
                "stop_after_ungroup_failed",
                extra={
                    "op": "stop",
                    "device_id": master_id,
                    "device_ip": master_ip,
                    "role": "primary",
                },
            )
    await state.poller.refresh_one(master_id)
    await state.poller.refresh_one(slave_id)

@router.post("/sync/remove", status_code=204)
async def sync_remove(body: SyncPairRequest, state: StateDep) -> Response:
    master_ip = _require_device(state, body.master_id)
    slave_ip = _require_device(state, body.slave_id)
    logger.info(
        "control_op",
        extra={"op": "sync_remove", "device_id": body.master_id, "device_ip": master_ip},
    )
    ok = await state.client.remove_sync_slave(master_ip, slave_ip)
    if not ok:
        logger.warning(
            "control_failed",
            extra={"op": "sync_remove", "device_id": body.master_id, "device_ip": master_ip},
        )
        raise AppError(502, "sync_remove_failed", "Failed to remove sync slave")
    await _clear_playback_after_leave(
        state,
        master_id=body.master_id,
        master_ip=master_ip,
        slave_id=body.slave_id,
        slave_ip=slave_ip,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/sync/break", status_code=204)
async def sync_break(state: StateDep) -> Response:
    """Dissolve every sync group without a full LAN rediscovery.

    Removes links, stops freed players (clears AirPlay capture), then refreshes
    only the affected devices. A network rescan is unnecessary and was making
    Break all feel multi‑second slow after mDNS+LSDP merge.
    """
    logger.info("control_op", extra={"op": "sync_break", "device_id": "-", "device_ip": "-"})
    snapshot = await state.discovery.get_devices()
    sync = build_sync_state(snapshot.devices)
    failures = 0
    slave_stops: list[tuple[str, str]] = []
    primary_stops: list[tuple[str, str]] = []
    affected: set[str] = set()

    for group in sync.groups:
        master_ip = _require_device(state, group.primary_id)
        affected.add(group.primary_id)

        async def remove_slave(slave_id: str, _master_ip: str = master_ip) -> bool:
            slave_ip = _require_device(state, slave_id)
            return await state.client.remove_sync_slave(_master_ip, slave_ip)

        results = await asyncio.gather(*(remove_slave(slave_id) for slave_id in group.slave_ids))
        removed_any = False
        for slave_id, ok in zip(group.slave_ids, results, strict=True):
            if not ok:
                failures += 1
                continue
            removed_any = True
            slave_ip = _require_device(state, slave_id)
            slave_stops.append((slave_id, slave_ip))
            affected.add(slave_id)
        if removed_any:
            primary_stops.append((group.primary_id, master_ip))

    async def _stop(device_id: str, ip: str, role: str) -> None:
        ok = await state.client.stop(ip)
        if not ok:
            logger.warning(
                "stop_after_ungroup_failed",
                extra={"op": "stop", "device_id": device_id, "device_ip": ip, "role": role},
            )

    await asyncio.gather(*(_stop(did, ip, "slave") for did, ip in slave_stops))
    await asyncio.gather(*(_stop(did, ip, "primary") for did, ip in primary_stops))
    await asyncio.gather(*(state.poller.refresh_one(device_id) for device_id in affected))

    if failures:
        logger.warning(
            "control_failed",
            extra={"op": "sync_break", "device_id": "-", "device_ip": "-"},
        )
        raise AppError(502, "sync_break_failed", f"Failed to remove {failures} sync link(s)")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/events")
async def events(request: Request, state: StateDep) -> StreamingResponse:
    keepalive = state.settings.sse_keepalive_seconds

    async def event_generator() -> AsyncIterator[str]:
        # Initial snapshot
        snapshot = state.discovery.snapshot
        initial = json.dumps(
            {
                "type": "fleet",
                "data": {
                    "devices": [d.model_dump() for d in snapshot.devices],
                    "discovered_at": snapshot.discovered_at,
                },
            },
            default=str,
        )
        yield f"data: {initial}\n\n"
        queue = await state.events.subscribe()
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=keepalive)
                    yield f"data: {payload}\n\n"
                except asyncio.TimeoutError:
                    if await request.is_disconnected():
                        break
                    yield ": keepalive\n\n"
        finally:
            await state.events.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
