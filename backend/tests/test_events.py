from __future__ import annotations

import asyncio

import pytest

from app.services.events import EventBus


@pytest.mark.asyncio
async def test_event_bus_publish_and_subscribe() -> None:
    bus = EventBus(max_queue_size=2)
    queue = await bus.subscribe()
    await bus.publish("fleet", {"ok": True})
    payload = await asyncio.wait_for(queue.get(), timeout=1)
    assert '"fleet"' in payload
    await bus.unsubscribe(queue)


@pytest.mark.asyncio
async def test_event_bus_backpressure_drops_oldest() -> None:
    bus = EventBus(max_queue_size=1)
    queue = await bus.subscribe()
    await bus.publish("a", 1)
    await bus.publish("b", 2)
    payload = await asyncio.wait_for(queue.get(), timeout=1)
    assert '"b"' in payload
    assert bus.dropped_events >= 1
    await bus.unsubscribe(queue)
