"""Async BluOS HTTP client facade."""

from __future__ import annotations

from app.bluos.media import BluOSMediaMixin
from app.bluos.playback import BluOSPlaybackMixin
from app.bluos.rate_limit import RateLimiter
from app.bluos.sync_ops import BluOSSyncMixin
from app.bluos.webui import BluOSWebUIMixin

__all__ = ["BluOSClient", "RateLimiter"]


class BluOSClient(
    BluOSPlaybackMixin,
    BluOSMediaMixin,
    BluOSWebUIMixin,
    BluOSSyncMixin,
):
    """Facade over BluOS HTTP (:11000) and the device web UI (:80)."""

