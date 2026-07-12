"""Shared validation helpers for BluOS targeting."""

from __future__ import annotations

import hashlib
import ipaddress
import re

_DEVICE_ID_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$")


def sanitize_ip(ip: str) -> str | None:
    if not ip or not isinstance(ip, str):
        return None
    if any(ch in ip for ch in ("\x00", "\n", "\r", "/", "\\")):
        return None
    candidate = ip.strip()
    if len(candidate) > 15 or not candidate:
        return None
    try:
        addr = ipaddress.ip_address(candidate)
    except ValueError:
        return None
    if not isinstance(addr, ipaddress.IPv4Address):
        return None
    return str(addr)


def validate_device_id(device_id: str) -> bool:
    return bool(device_id and _DEVICE_ID_RE.fullmatch(device_id))


def make_device_id(ip: str, name: str = "", node_id: str = "") -> str:
    if node_id:
        cleaned = re.sub(r"[^a-zA-Z0-9._-]", "-", node_id.strip())[:64].strip("-")
        if cleaned and validate_device_id(cleaned):
            return cleaned
    seed = f"{name.strip().lower()}|{ip.strip()}"
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()[:12]
    return f"player-{digest}"


def parse_bluos_host(value: str) -> str:
    if not value:
        return ""
    host = value.strip().split(":")[0].strip()
    return sanitize_ip(host) or ""
