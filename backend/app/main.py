"""FastAPI application entrypoint."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.api.errors import AppError
from app.api.routes import router
from app.bluos.client import BluOSClient
from app.config import get_settings
from app.discovery.service import DiscoveryService
from app.logging import configure_logging, request_id_var
from app.middleware import RequestContextMiddleware
from app.services.events import EventBus
from app.services.poller import StatusPoller
from app.state import AppState

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)
    client = BluOSClient(settings)
    events = EventBus()
    discovery = DiscoveryService(settings, client)
    poller = StatusPoller(settings, discovery, client, events)
    app.state.app_state = AppState(
        settings=settings,
        client=client,
        discovery=discovery,
        events=events,
        poller=poller,
    )
    poller.start()
    try:
        await discovery.refresh()
    except Exception:  # noqa: BLE001
        logger.exception("initial_discovery_failed")
    logger.info("app_started host=%s port=%s", settings.host, settings.port)
    try:
        yield
    finally:
        await poller.stop()
        await client.aclose()
        logger.info("app_stopped")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Bluesound Dashboard",
        version=__version__,
        lifespan=lifespan,
        docs_url="/api/docs" if settings.openapi_enabled() else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if settings.openapi_enabled() else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list(),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestContextMiddleware)

    @app.exception_handler(AppError)
    async def app_error_handler(_request: Request, exc: AppError):
        detail = exc.detail if isinstance(exc.detail, dict) else {
            "error": "error",
            "message": str(exc.detail),
            "code": "error",
            "request_id": request_id_var.get("-"),
        }
        return JSONResponse(status_code=exc.status_code, content=detail)

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_request: Request, exc: HTTPException):
        if isinstance(exc.detail, dict) and "code" in exc.detail:
            return JSONResponse(status_code=exc.status_code, content=exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": "http_error",
                "message": str(exc.detail),
                "code": "http_error",
                "request_id": request_id_var.get("-"),
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.exception("unhandled_error")
        request_id = getattr(request.state, "request_id", "-")
        return JSONResponse(
            status_code=500,
            content={
                "error": "internal_error",
                "message": "An unexpected error occurred",
                "code": "internal_error",
                "request_id": request_id,
            },
        )

    app.include_router(router)

    @app.get("/health")
    async def health_alias() -> RedirectResponse:
        """Ops footgun guard: never serve SPA HTML for /health."""
        return RedirectResponse(url="/api/v1/healthz", status_code=307)

    static_dir = Path(settings.static_dir) if settings.static_dir else (
        Path(__file__).resolve().parents[2] / "frontend" / "dist"
    )
    if static_dir.is_dir():
        assets = static_dir / "assets"
        if assets.is_dir():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

        @app.get("/{full_path:path}")
        async def spa_fallback(full_path: str):
            if full_path.startswith("api/"):
                return JSONResponse(status_code=404, content={"error": "not_found"})
            index = static_dir / "index.html"
            if index.is_file():
                return FileResponse(index)
            return JSONResponse(status_code=404, content={"error": "ui_not_built"})

    return app


app = create_app()
