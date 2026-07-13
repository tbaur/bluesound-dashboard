"""App lifespan, SPA fallback, and exception handlers."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.config import Settings, get_settings
from app.discovery.service import DiscoveryService, DiscoverySnapshot
from app.main import create_app


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    get_settings.cache_clear()
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "app.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "index.html").write_text("<html>ok</html>", encoding="utf-8")
    return Settings(
        discovery_cache_ttl=0,
        poll_interval=60,
        allow_non_private_ips=True,
        static_dir=str(tmp_path),
        enable_openapi=True,
        control_rate_limit_seconds=0,
    )


@pytest.mark.asyncio
async def test_lifespan_starts_and_stops(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def empty_refresh(self: DiscoveryService):
        return DiscoverySnapshot(discovered_at=1.0, method_used="mdns")

    monkeypatch.setattr(DiscoveryService, "refresh", empty_refresh)
    monkeypatch.setattr("app.main.get_settings", lambda: settings)

    app = create_app()
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as http:
            health = await http.get("/api/v1/healthz")
            assert health.status_code == 200
            spa = await http.get("/players/kitchen")
            assert spa.status_code == 200
            assert "ok" in spa.text
            api_miss = await http.get("/api/missing")
            assert api_miss.status_code == 404
            assert api_miss.json()["error"] == "not_found"
            asset = await http.get("/assets/app.js")
            assert asset.status_code == 200


@pytest.mark.asyncio
async def test_lifespan_survives_initial_discovery_failure(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def boom(self: DiscoveryService):
        raise RuntimeError("discovery down")

    monkeypatch.setattr(DiscoveryService, "refresh", boom)
    monkeypatch.setattr("app.main.get_settings", lambda: settings)

    app = create_app()
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as http:
            assert (await http.get("/api/v1/healthz")).status_code == 200


@pytest.mark.asyncio
async def test_exception_handlers(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    get_settings.cache_clear()
    # Nonexistent static_dir → no SPA catch-all stealing /__test/*
    missing = tmp_path / "no-ui"
    settings = Settings(
        discovery_cache_ttl=0,
        poll_interval=60,
        static_dir=str(missing),
        enable_openapi=False,
    )
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    monkeypatch.setattr(
        DiscoveryService,
        "refresh",
        AsyncMock(return_value=DiscoverySnapshot()),
    )
    app = create_app()

    @app.get("/__test/http")
    async def raise_http() -> None:
        raise HTTPException(status_code=418, detail="teapot")

    @app.get("/__test/http-dict")
    async def raise_http_dict() -> None:
        raise HTTPException(
            status_code=409,
            detail={"error": "conflict", "message": "nope", "code": "conflict", "request_id": "r1"},
        )

    @app.get("/__test/boom")
    async def raise_boom() -> None:
        raise RuntimeError("unexpected")

    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as http:
            http_err = await http.get("/__test/http")
            assert http_err.status_code == 418
            assert http_err.json()["code"] == "http_error"

            dict_err = await http.get("/__test/http-dict")
            assert dict_err.status_code == 409
            assert dict_err.json()["code"] == "conflict"

            boom = await http.get("/__test/boom")
            assert boom.status_code == 500
            assert boom.json()["code"] == "internal_error"


@pytest.mark.asyncio
async def test_spa_without_index_returns_ui_not_built(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    get_settings.cache_clear()
    settings = Settings(static_dir=str(tmp_path), poll_interval=60, discovery_cache_ttl=0)
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    monkeypatch.setattr(
        DiscoveryService,
        "refresh",
        AsyncMock(return_value=DiscoverySnapshot()),
    )
    app = create_app()
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as http:
            response = await http.get("/")
            assert response.status_code == 404
            assert response.json()["error"] == "ui_not_built"
