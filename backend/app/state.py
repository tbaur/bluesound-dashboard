"""Application dependency container."""

from __future__ import annotations

from dataclasses import dataclass

from app.bluos.client import BluOSClient
from app.config import Settings
from app.discovery.service import DiscoveryService
from app.services.events import EventBus
from app.services.poller import StatusPoller


@dataclass
class AppState:
    settings: Settings
    client: BluOSClient
    discovery: DiscoveryService
    events: EventBus
    poller: StatusPoller
