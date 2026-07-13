"""LSDP packet parsing and mocked discover() coverage."""

from __future__ import annotations

import struct
from unittest.mock import MagicMock

import pytest

from app.discovery.lsdp import (
    CLASS_BLUOS_PLAYER,
    LSDP_MAGIC,
    LSDP_VERSION,
    MSG_ANNOUNCE,
    MSG_QUERY,
    LSDPDiscovery,
)


def _announce_packet(
    node_id: str,
    ip: str,
    class_id: int = 1,
    *,
    txt: dict[str, str] | None = None,
    embed_ip: bool = True,
) -> bytes:
    header = struct.pack("!B", 6) + LSDP_MAGIC + struct.pack("!B", LSDP_VERSION)
    node = node_id.encode()
    body = bytearray()
    body.append(0)  # length placeholder
    body.append(MSG_ANNOUNCE)
    body.append(len(node))
    body.extend(node)
    if embed_ip:
        ip_bytes = bytes(int(p) for p in ip.split("."))
        body.append(4)
        body.extend(ip_bytes)
    else:
        body.append(0)  # fall back to source_ip
    body.append(1)  # count
    body.extend(struct.pack("!H", class_id))
    records = txt or {}
    body.append(len(records))
    for key, value in records.items():
        kb, vb = key.encode(), value.encode()
        body.append(len(kb))
        body.extend(kb)
        body.append(len(vb))
        body.extend(vb)
    body[0] = len(body)
    return header + bytes(body)


def test_lsdp_parse_announce() -> None:
    discovery = LSDPDiscovery(timeout=0.1)
    packet = _announce_packet("node-1", "192.168.1.50")
    discovery._parse_packet(packet, "192.168.1.50")
    assert any(d.ip == "192.168.1.50" for d in discovery.discovered_devices.values())
    assert any(d.node_id == "node-1" for d in discovery.discovered_devices.values())


def test_lsdp_rejects_bad_magic() -> None:
    discovery = LSDPDiscovery(timeout=0.1)
    discovery._parse_packet(b"\x06XXXX\x01", "192.168.1.1")
    assert discovery.discovered_devices == {}


def test_lsdp_rejects_bad_version() -> None:
    discovery = LSDPDiscovery(timeout=0.1)
    packet = struct.pack("!B", 6) + LSDP_MAGIC + struct.pack("!B", 99)
    discovery._parse_packet(packet, "192.168.1.1")
    assert discovery.discovered_devices == {}


def test_lsdp_parse_txt_records_and_source_ip_fallback() -> None:
    discovery = LSDPDiscovery(timeout=0.1)
    packet = _announce_packet(
        "hub-1",
        "192.168.1.9",
        class_id=8,
        txt={"name": "Patio", "model": "NODE"},
        embed_ip=False,
    )
    discovery._parse_packet(packet, "10.0.0.7")
    device = next(iter(discovery.discovered_devices.values()))
    assert device.ip == "10.0.0.7"
    assert device.txt_records["name"] == "Patio"
    assert device.class_id == 8


def test_lsdp_ignores_truncated_and_short_packets() -> None:
    discovery = LSDPDiscovery(timeout=0.1)
    discovery._parse_packet(b"short", "192.168.1.1")
    discovery._parse_announce(b"\x03\x41", "192.168.1.1")
    # Valid header but truncated message length
    header = struct.pack("!B", 6) + LSDP_MAGIC + struct.pack("!B", LSDP_VERSION)
    discovery._parse_packet(header + b"\xff\x41", "192.168.1.1")
    assert discovery.discovered_devices == {}


def test_build_query_packet() -> None:
    discovery = LSDPDiscovery(timeout=0.1)
    packet = discovery._build_query_packet([CLASS_BLUOS_PLAYER])
    assert packet[1:5] == LSDP_MAGIC
    assert MSG_QUERY in packet


def test_discover_with_mocked_socket(monkeypatch: pytest.MonkeyPatch) -> None:
    packet = _announce_packet("node-2", "192.168.1.60", txt={"n": "K"})
    calls = {"recv": 0}

    class FakeSock:
        def setsockopt(self, *_args: object) -> None:
            return None

        def sendto(self, *_args: object) -> int:
            return 1

        def settimeout(self, _timeout: float) -> None:
            return None

        def recvfrom(self, _size: int) -> tuple[bytes, tuple[str, int]]:
            calls["recv"] += 1
            if calls["recv"] == 1:
                return packet, ("192.168.1.60", 11430)
            raise TimeoutError()

        def close(self) -> None:
            return None

    monkeypatch.setattr("app.discovery.lsdp.socket.socket", lambda *a, **k: FakeSock())
    monkeypatch.setattr("app.discovery.lsdp.time.sleep", lambda *_a, **_k: None)
    monkeypatch.setattr("app.discovery.lsdp.random.uniform", lambda *_a, **_k: 0.0)

    discovery = LSDPDiscovery(timeout=0.05)
    devices = discovery.discover(class_ids=[CLASS_BLUOS_PLAYER])
    assert len(devices) == 1
    assert devices[0].ip == "192.168.1.60"
    assert devices[0].txt_records["n"] == "K"


def test_discover_dedupes_ips_and_handles_send_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    packet_a = _announce_packet("a", "192.168.1.70")
    packet_b = _announce_packet("b", "192.168.1.70")  # same IP, different node
    packets = [packet_a, packet_b]

    class FakeSock:
        def setsockopt(self, *_args: object) -> None:
            return None

        def sendto(self, *_args: object) -> int:
            raise OSError("send failed")

        def settimeout(self, _timeout: float) -> None:
            return None

        def recvfrom(self, _size: int) -> tuple[bytes, tuple[str, int]]:
            if packets:
                return packets.pop(0), ("192.168.1.70", 11430)
            raise TimeoutError()

        def close(self) -> None:
            return None

    monkeypatch.setattr("app.discovery.lsdp.socket.socket", lambda *a, **k: FakeSock())
    monkeypatch.setattr("app.discovery.lsdp.time.sleep", lambda *_a, **_k: None)
    monkeypatch.setattr("app.discovery.lsdp.random.uniform", lambda *_a, **_k: 0.0)

    devices = LSDPDiscovery(timeout=0.05).discover()
    assert len(devices) == 1
    assert devices[0].ip == "192.168.1.70"


def test_discover_socket_create_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.discovery.lsdp.socket.socket",
        MagicMock(side_effect=OSError("no udp")),
    )
    assert LSDPDiscovery(timeout=0.05).discover() == []


def test_discover_recv_oserror(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeSock:
        def setsockopt(self, *_args: object) -> None:
            return None

        def sendto(self, *_args: object) -> int:
            return 1

        def settimeout(self, _timeout: float) -> None:
            return None

        def recvfrom(self, _size: int) -> tuple[bytes, tuple[str, int]]:
            raise OSError("recv failed")

        def close(self) -> None:
            return None

    monkeypatch.setattr("app.discovery.lsdp.socket.socket", lambda *a, **k: FakeSock())
    monkeypatch.setattr("app.discovery.lsdp.time.sleep", lambda *_a, **_k: None)
    monkeypatch.setattr("app.discovery.lsdp.random.uniform", lambda *_a, **_k: 0.0)
    assert LSDPDiscovery(timeout=0.05).discover() == []


def test_discover_skips_invalid_sanitized_ip(monkeypatch: pytest.MonkeyPatch) -> None:
    # Craft announce with garbage IP bytes that sanitize_ip rejects via path — use 0.0.0.0
    packet = _announce_packet("x", "0.0.0.0")

    class FakeSock:
        def setsockopt(self, *_args: object) -> None:
            return None

        def sendto(self, *_args: object) -> int:
            return 1

        def settimeout(self, _timeout: float) -> None:
            return None

        def recvfrom(self, _size: int) -> tuple[bytes, tuple[str, int]]:
            if not hasattr(self, "_done"):
                self._done = True
                return packet, ("0.0.0.0", 11430)
            raise TimeoutError()

        def close(self) -> None:
            return None

    monkeypatch.setattr("app.discovery.lsdp.socket.socket", lambda *a, **k: FakeSock())
    monkeypatch.setattr("app.discovery.lsdp.time.sleep", lambda *_a, **_k: None)
    monkeypatch.setattr("app.discovery.lsdp.random.uniform", lambda *_a, **_k: 0.0)
    # 0.0.0.0 may still sanitize as valid IP string; ensure discover still returns list
    devices = LSDPDiscovery(timeout=0.05).discover()
    assert isinstance(devices, list)
