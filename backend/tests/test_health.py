"""HealthLog presence / drop history."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.models import PlayerStatus
from app.services.health import HealthLog
from tests.helpers import app_with_players


def _player(**kwargs: object) -> PlayerStatus:
    values: dict[str, object] = {
        "id": "p1",
        "ip": "192.168.1.20",
        "name": "Kitchen",
        "status": "online",
    }
    values.update(kwargs)
    return PlayerStatus.model_validate(values)


def test_first_offline_is_not_a_drop() -> None:
    log = HealthLog(started_at=1_000, circuit_threshold=2)
    log.observe(_player(status="offline", consecutive_failures=1), previous_failures=0, now=1_010)
    snap = log.snapshot(now=1_010)
    assert snap.drops == []
    assert snap.first_online == {}


def test_online_then_offline_opens_drop() -> None:
    log = HealthLog(started_at=1_000, circuit_threshold=2)
    log.note_seen_online("p1", 1_000)
    log.observe(_player(status="offline", consecutive_failures=1), previous_failures=0, now=1_030)
    snap = log.snapshot(now=1_090)
    assert len(snap.drops) == 1
    drop = snap.drops[0]
    assert drop.ended_at is None
    assert drop.duration_seconds == 60
    assert drop.peak_failures == 1
    assert drop.slow_poll is False


def test_recovery_closes_drop() -> None:
    log = HealthLog(started_at=1_000, circuit_threshold=2)
    log.note_seen_online("p1", 1_000)
    log.observe(_player(status="offline", consecutive_failures=1), previous_failures=0, now=1_010)
    log.observe(_player(status="online"), previous_failures=1, now=1_040)
    snap = log.snapshot(now=1_050)
    assert len(snap.drops) == 1
    assert snap.drops[0].ended_at == 1_040
    assert snap.drops[0].duration_seconds == 30


def test_circuit_marks_slow_poll() -> None:
    log = HealthLog(started_at=1_000, circuit_threshold=2)
    log.note_seen_online("p1", 1_000)
    log.observe(_player(status="offline", consecutive_failures=1), previous_failures=0, now=1_010)
    log.observe(_player(status="offline", consecutive_failures=2), previous_failures=1, now=1_013)
    snap = log.snapshot(now=1_020)
    assert snap.drops[0].slow_poll is True
    assert snap.drops[0].peak_failures == 2


def test_prune_drops_closed_outside_window() -> None:
    log = HealthLog(started_at=1_000, window_seconds=100, max_drops=10)
    log.note_seen_online("p1", 1_000)
    log.observe(_player(status="offline"), previous_failures=0, now=1_010)
    log.observe(_player(status="online"), previous_failures=1, now=1_020)
    snap = log.snapshot(now=1_200)
    assert snap.drops == []


def test_open_drop_survives_window() -> None:
    log = HealthLog(started_at=1_000, window_seconds=100, max_drops=10)
    log.note_seen_online("p1", 1_000)
    log.observe(_player(status="offline"), previous_failures=0, now=1_010)
    snap = log.snapshot(now=1_200)
    assert len(snap.drops) == 1
    assert snap.drops[0].ended_at is None


@pytest.fixture
def settings() -> Settings:
    return Settings(allow_non_private_ips=True, api_rate_limit_seconds=0.0)


@pytest.mark.asyncio
async def test_fleet_health_endpoint(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    app, client, _, poller = await app_with_players(settings, monkeypatch)
    poller.health.note_seen_online("player-kitchen", 1_000)
    poller.health.observe(
        PlayerStatus(id="player-kitchen", ip="192.168.1.20", name="Kitchen", status="offline"),
        previous_failures=0,
        now=1_010,
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        response = await http.get("/api/v1/fleet/health")
        assert response.status_code == 200
        body = response.json()
        assert body["drops"][0]["name"] == "Kitchen"
        assert body["drops"][0]["ended_at"] is None
    await client.aclose()
