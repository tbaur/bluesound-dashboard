"""Versioned REST + SSE API."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.devices import router as devices_router
from app.api.events import router as events_router
from app.api.fleet import router as fleet_router
from app.api.health import router as health_router
from app.api.sync_routes import router as sync_router

router = APIRouter(prefix="/api/v1")
router.include_router(health_router)
router.include_router(devices_router)
router.include_router(fleet_router)
router.include_router(sync_router)
router.include_router(events_router)
