"""Device capability helpers (features not every BluOS player exposes)."""

from __future__ import annotations

import re

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
