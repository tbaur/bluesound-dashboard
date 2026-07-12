"""FastAPI route dependencies."""

from __future__ import annotations

from fastapi import Request

from app.state import AppState


def get_state(request: Request) -> AppState:
    state = request.app.state.app_state
    assert isinstance(state, AppState)
    return state
