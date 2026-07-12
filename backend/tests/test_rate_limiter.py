"""Unit tests for BluOS client helpers."""

from __future__ import annotations

import asyncio
import time

import pytest

from app.bluos.client import RateLimiter


@pytest.mark.asyncio
async def test_rate_limiter_does_not_hold_lock_across_sleep() -> None:
    limiter = RateLimiter(0.05)
    started: list[float] = []

    async def one(key: str) -> None:
        await limiter.wait(key)
        started.append(time.monotonic())

    # Different keys must proceed concurrently even when both need to wait.
    await limiter.wait("a")
    await limiter.wait("b")
    t0 = time.monotonic()
    await asyncio.gather(one("a"), one("b"))
    elapsed = time.monotonic() - t0
    assert elapsed < 0.12
    assert len(started) == 2
