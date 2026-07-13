"""Shared fixtures for API route tests."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.bluos.client import BluOSClient
from app.config import Settings
from app.discovery.service import DiscoveryService
from app.main import create_app
from app.models import PlayerStatus
from app.services.events import EventBus
from app.services.poller import StatusPoller
from app.state import AppState


async def app_with_players(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
    players: list[PlayerStatus] | None = None,
) -> tuple:
    async def seeded(self: DiscoveryService, *args, **kwargs):
        return self._snapshot

    monkeypatch.setattr(DiscoveryService, "refresh", seeded)
    monkeypatch.setattr(DiscoveryService, "get_devices", seeded)

    app = create_app()
    client = BluOSClient(settings)
    events = EventBus()
    discovery = DiscoveryService(settings, client)
    devices = players or [
        PlayerStatus(
            id="player-kitchen",
            ip="192.168.1.20",
            name="Kitchen",
            status="online",
            volume=22,
            state="play",
        )
    ]
    discovery._snapshot.devices = devices
    discovery._snapshot.ips_by_id = {p.id: p.ip for p in devices}
    discovery._snapshot.ids_by_ip = {p.ip: p.id for p in devices}
    discovery._snapshot.discovered_at = 1.0
    discovery._snapshot.method_used = "mdns"
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
    return app, client, discovery, poller
