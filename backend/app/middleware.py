"""ASGI middleware that must not buffer streaming responses (SSE)."""

from __future__ import annotations

import logging
import time
import uuid

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.bluos.client import RateLimiter
from app.config import get_settings
from app.logging import request_id_var

logger = logging.getLogger(__name__)

# Album art is served from BluOS players on the LAN (http://<device>:11000/...).
# CSP cannot express RFC1918 CIDRs, so http: is required for single-process deploys.
_DEFAULT_CSP = (
    "default-src 'self'; "
    "connect-src 'self'; "
    "img-src 'self' data: http:; "
    "style-src 'self' 'unsafe-inline'; "
    "script-src 'self'; "
    "frame-ancestors 'none'"
)
# FastAPI Swagger UI loads bundle/CSS from jsDelivr and boots with an inline script.
_SWAGGER_CSP = (
    "default-src 'self'; "
    "connect-src 'self'; "
    "img-src 'self' data: https: http:; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "frame-ancestors 'none'"
)
_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
}

_EXPENSIVE_GET_PATHS = frozenset({"/api/v1/fleet/upgrades"})


class RequestContextMiddleware:
    """Attach request IDs, security headers, API rate limits, and access logs.

    FastAPI's ``@app.middleware("http")`` uses BaseHTTPMiddleware, which
    buffers responses and breaks Server-Sent Events. This pure ASGI wrapper
    streams through unchanged.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        settings = get_settings()
        self._api_rate = RateLimiter(settings.api_rate_limit_seconds)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "GET")
        path = scope.get("path", "")
        rate_limit = (
            method == "POST" and path.startswith("/api/v1/") and path != "/api/v1/events"
        ) or (method == "GET" and path in _EXPENSIVE_GET_PATHS)
        if rate_limit:
            client_host = (scope.get("client") or ("unknown", 0))[0] or "unknown"
            await self._api_rate.wait(client_host)

        request_id = _header_value(scope, b"x-request-id") or str(uuid.uuid4())
        scope.setdefault("state", {})
        scope["state"]["request_id"] = request_id
        token = request_id_var.set(request_id)
        started = time.monotonic()
        status_code = 500

        async def send_with_headers(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                headers = MutableHeaders(scope=message)
                headers["X-Request-ID"] = request_id
                for name, value in _SECURITY_HEADERS.items():
                    headers[name] = value
                headers["Content-Security-Policy"] = _csp_for_path(path)
            await send(message)

        try:
            await self.app(scope, receive, send_with_headers)
        finally:
            duration_ms = round((time.monotonic() - started) * 1000, 1)
            if path != "/api/v1/events":
                logger.info(
                    "http_request",
                    extra={
                        "http_method": method,
                        "http_path": path,
                        "http_status": status_code,
                        "duration_ms": duration_ms,
                    },
                )
            request_id_var.reset(token)


def _csp_for_path(path: str) -> str:
    if path == "/api/docs" or path.startswith("/api/docs/"):
        return _SWAGGER_CSP
    return _DEFAULT_CSP


def _header_value(scope: Scope, name: bytes) -> str | None:
    for key, value in scope.get("headers") or []:
        if key == name:
            return value.decode("latin-1")
    return None
