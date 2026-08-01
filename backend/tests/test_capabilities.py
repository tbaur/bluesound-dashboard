"""Device capability helpers."""

from __future__ import annotations

import pytest

from app.capabilities import model_has_bluetooth


@pytest.mark.parametrize(
    ("model", "brand", "full_model"),
    [
        ("CI S2", "NAD", "NAD CI S2"),
        ("ci s2", "", ""),
        ("CIS2", "NAD", ""),
        ("CI-S2", "NAD", "NAD CI-S2"),
    ],
)
def test_ci_s2_known_without_bluetooth(model: str, brand: str, full_model: str) -> None:
    assert model_has_bluetooth(model=model, brand=brand, full_model=full_model) is False


@pytest.mark.parametrize(
    ("model", "brand", "full_model"),
    [
        ("NODE", "Bluesound", "Bluesound NODE"),
        ("NODE 2i", "Bluesound", ""),
        ("POWENODE", "Bluesound", "Bluesound POWENODE"),
        ("", "", ""),
    ],
)
def test_unknown_or_typical_models_probe(model: str, brand: str, full_model: str) -> None:
    assert model_has_bluetooth(model=model, brand=brand, full_model=full_model) is None
