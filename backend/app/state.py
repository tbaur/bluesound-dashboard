"""Application dependency container."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.bluos.client import BluOSClient
from app.config import Settings
from app.discovery.service import DiscoveryService
from app.models import FleetUpgradeResponse
from app.services.events import EventBus
from app.services.poller import StatusPoller


@dataclass
class AppState:
    settings: Settings
    client: BluOSClient
    discovery: DiscoveryService
    events: EventBus
    poller: StatusPoller
    fleet_upgrades_cached_at: float = 0.0
    fleet_upgrades_cache: FleetUpgradeResponse | None = None
    fleet_upgrades_ttl_seconds: float = field(default=30.0)
