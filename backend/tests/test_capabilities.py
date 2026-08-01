"""Device capability helpers."""

from __future__ import annotations

import pytest

from app.capabilities import (
    infer_zone,
    model_has_bluetooth,
    model_is_multi_zone_ci,
    zone_from_bluos_port,
)


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


@pytest.mark.parametrize(
    ("port", "expected"),
    [
        (11000, 1),
        (11010, 2),
        (11020, 3),
        (11030, 4),
    ],
)
def test_zone_from_bluos_port(port: int, expected: int) -> None:
    assert zone_from_bluos_port(port) == expected


def test_infer_zone_ci_primary_and_secondary() -> None:
    assert (
        infer_zone(11000, model="CI S2", brand="NAD", full_model="NAD CI S2") == 1
    )
    assert (
        infer_zone(11010, model="CI S2", brand="NAD", full_model="NAD CI S2") == 2
    )


def test_infer_zone_omits_ordinary_primary() -> None:
    assert infer_zone(11000, model="NODE", brand="Bluesound") is None
    assert not model_is_multi_zone_ci(model="C658", brand="NAD", full_model="NAD C658")
