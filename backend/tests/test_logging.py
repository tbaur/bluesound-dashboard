"""Structured logging helpers."""

from __future__ import annotations

import json
import logging

from app.logging import JsonFormatter, configure_logging, request_id_var


def test_json_formatter_includes_extras_and_request_id() -> None:
    token = request_id_var.set("req-42")
    try:
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg="hello",
            args=(),
            exc_info=None,
        )
        record.device_id = "player-1"  # type: ignore[attr-defined]
        record.op = "play"  # type: ignore[attr-defined]
        record.succeeded = 2  # type: ignore[attr-defined]
        payload = json.loads(JsonFormatter().format(record))
        assert payload["msg"] == "hello"
        assert payload["request_id"] == "req-42"
        assert payload["device_id"] == "player-1"
        assert payload["op"] == "play"
        assert payload["succeeded"] == 2
    finally:
        request_id_var.reset(token)


def test_json_formatter_includes_exc_info() -> None:
    try:
        raise ValueError("boom")
    except ValueError:
        record = logging.LogRecord(
            name="test",
            level=logging.ERROR,
            pathname=__file__,
            lineno=1,
            msg="failed",
            args=(),
            exc_info=True,
        )
        # Attach current exception context
        import sys

        record.exc_info = sys.exc_info()
        payload = json.loads(JsonFormatter().format(record))
        assert "ValueError" in payload["exc_info"]


def test_configure_logging_sets_json_handler() -> None:
    configure_logging("DEBUG")
    root = logging.getLogger()
    assert root.level == logging.DEBUG
    assert any(isinstance(h.formatter, JsonFormatter) for h in root.handlers)
