from __future__ import annotations

import struct

from app.discovery.lsdp import LSDP_MAGIC, LSDP_VERSION, MSG_ANNOUNCE, LSDPDiscovery


def _announce_packet(node_id: str, ip: str, class_id: int = 1) -> bytes:
    header = struct.pack("!B", 6) + LSDP_MAGIC + struct.pack("!B", LSDP_VERSION)
    node = node_id.encode()
    ip_bytes = bytes(int(p) for p in ip.split("."))
    body = bytearray()
    body.append(0)  # length placeholder
    body.append(MSG_ANNOUNCE)
    body.append(len(node))
    body.extend(node)
    body.append(4)
    body.extend(ip_bytes)
    body.append(1)  # count
    body.extend(struct.pack("!H", class_id))
    body.append(0)  # txt_count
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
