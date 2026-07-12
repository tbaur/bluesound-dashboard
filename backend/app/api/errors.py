"""API errors and helpers."""

from __future__ import annotations

from fastapi import HTTPException, Request

from app.logging import request_id_var
from app.models import ErrorBody


class AppError(HTTPException):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(
            status_code=status_code,
            detail=ErrorBody(
                error=code,
                message=message,
                code=code,
                request_id=request_id_var.get("-"),
            ).model_dump(),
        )


def get_request_id(request: Request) -> str:
    return getattr(request.state, "request_id", request_id_var.get("-"))
