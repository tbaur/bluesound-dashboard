"""Per-key spacing for outbound BluOS calls and inbound API throttling."""

from __future__ import annotations

import asyncio
import time

_RATE_LIMITER_MAX_KEYS = 512


class RateLimiter:
    """Per-key cooldown used for outbound BluOS spacing and inbound API 429s."""

    def __init__(self, min_interval: float, *, max_keys: int = _RATE_LIMITER_MAX_KEYS) -> None:
        self._min_interval = min_interval
        self._last: dict[str, float] = {}
        self._lock = asyncio.Lock()
        self._max_keys = max_keys

    async def wait(self, key: str) -> None:
        """Per-key spacing without holding the lock across sleep (outbound BluOS)."""
        if self._min_interval <= 0:
            return
        while True:
            async with self._lock:
                now = time.monotonic()
                last = self._last.get(key, 0.0)
                delay = self._min_interval - (now - last)
                if delay <= 0:
                    self._last[key] = now
                    self._prune_unlocked(now)
                    return
            await asyncio.sleep(delay)

    async def acquire(self, key: str) -> bool:
        """Return True if ``key`` may proceed now; False if still in cooldown.

        Used by the API middleware so overloaded clients get HTTP 429 instead of
        holding a connection while sleeping.
        """
        if self._min_interval <= 0:
            return True
        async with self._lock:
            now = time.monotonic()
            last = self._last.get(key, 0.0)
            if now - last < self._min_interval:
                return False
            self._last[key] = now
            self._prune_unlocked(now)
            return True

    def _prune_unlocked(self, now: float) -> None:
        if len(self._last) <= self._max_keys:
            return
        # Drop oldest half when over cap (long-uptime safety).
        ordered = sorted(self._last.items(), key=lambda item: item[1])
        drop = len(ordered) - (self._max_keys // 2)
        for stale_key, _ts in ordered[:drop]:
            self._last.pop(stale_key, None)
