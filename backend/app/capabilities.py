"""Device capability helpers (features not every BluOS player exposes)."""

from __future__ import annotations

import re

from app.validators import DEFAULT_BLUOS_PORT

# Known models without a Bluetooth radio / bluetoothAutoplay capture setting.
# Matched as whole tokens against brand + model + full_model (case-insensitive).
_NO_BLUETOOTH_MODEL_TOKENS = frozenset(
    {
        "ci s2",
        "cis2",
    }
)

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def _normalize_model_text(*parts: str) -> str:
    joined = " ".join(parts).lower()
    return " ".join(_NON_ALNUM.sub(" ", joined).split())


def model_has_bluetooth(model: str = "", brand: str = "", full_model: str = "") -> bool | None:
    """Return False when the model is known to lack Bluetooth, else None (probe).

    ``None`` means capability is unknown from model identity alone — callers should
    inspect capture settings for a ``bluetoothAutoplay`` setting.
    """
    text = _normalize_model_text(brand, model, full_model)
    if not text:
        return None
    compact = text.replace(" ", "")
    for token in _NO_BLUETOOTH_MODEL_TOKENS:
        if " " in token:
            if token in text:
                return False
        elif token in compact:
            return False
    return None


def zone_from_bluos_port(port: int) -> int:
    """Map BluOS API port to CI zone index (``11000``→1, ``11010``→2, ``11020``→3, …)."""
    if port <= DEFAULT_BLUOS_PORT:
        return 1
    return ((port - DEFAULT_BLUOS_PORT) // 10) + 1


def model_is_multi_zone_ci(model: str = "", brand: str = "", full_model: str = "") -> bool:
    """True for Lenbrook CI multi-zone chassis (CI S2, CI 580, …)."""
    text = _normalize_model_text(brand, model, full_model)
    return "ci" in text.split()


def infer_zone(
    port: int,
    *,
    model: str = "",
    brand: str = "",
    full_model: str = "",
) -> int | None:
    """Zone label for UI, or ``None`` when the player is a normal single-zone endpoint.

    Secondary CI ports always get a zone. Primary ``11000`` is labeled Zone 1 only for
    known multi-zone CI models so everyday NODEs stay unlabeled.
    """
    if port != DEFAULT_BLUOS_PORT:
        return zone_from_bluos_port(port)
    if model_is_multi_zone_ci(model=model, brand=brand, full_model=full_model):
        return 1
    return None
