"""LSDP (Lenbrook Service Discovery Protocol) — adapted from bluesound-controller."""

from __future__ import annotations

import logging
import random
import socket
import struct
import time
from dataclasses import dataclass, field

from app.validators import sanitize_ip

logger = logging.getLogger(__name__)

LSDP_PORT = 11430
LSDP_MAGIC = b"LSDP"
LSDP_VERSION = 1
CLASS_BLUOS_PLAYER = 0x0001
CLASS_BLUOS_HUB = 0x0008
MSG_QUERY = 0x51
MSG_ANNOUNCE = 0x41


@dataclass
class LSDPDevice:
    node_id: str
    ip: str
    class_id: int
    txt_records: dict[str, str] = field(default_factory=dict)


class LSDPDiscovery:
    def __init__(self, timeout: float = 5.0) -> None:
        self.timeout = timeout
        self.discovered_devices: dict[str, LSDPDevice] = {}

    def discover(self, class_ids: list[int] | None = None) -> list[LSDPDevice]:
        if class_ids is None:
            class_ids = [CLASS_BLUOS_PLAYER, CLASS_BLUOS_HUB]
        self.discovered_devices.clear()
        sock: socket.socket | None = None
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            query_packet = self._build_query_packet(class_ids)
            # Staggered queries per Lenbrook guidance; keep total under timeout.
            for delay in (0.0, 0.2, 0.4, 0.6, 0.9, 1.2, 1.5):
                if delay >= self.timeout:
                    break
                time.sleep(delay if delay == 0.0 else 0.2 + random.uniform(0, 0.05))
                try:
                    sock.sendto(query_packet, ("<broadcast>", LSDP_PORT))
                except OSError as exc:
                    logger.debug("lsdp_send_error err=%s", exc)
            end_time = time.time() + self.timeout
            while time.time() < end_time:
                remaining = end_time - time.time()
                if remaining <= 0:
                    break
                try:
                    sock.settimeout(remaining)
                    data, addr = sock.recvfrom(4096)
                    self._parse_packet(data, addr[0])
                except TimeoutError:
                    break
                except OSError as exc:
                    logger.debug("lsdp_recv_error err=%s", exc)
                    break
        except OSError as exc:
            logger.error("lsdp_discovery_error err=%s", exc)
        finally:
            if sock is not None:
                sock.close()

        devices: list[LSDPDevice] = []
        seen_ips: set[str] = set()
        for device in self.discovered_devices.values():
            ip = sanitize_ip(device.ip)
            if not ip or ip in seen_ips:
                continue
            seen_ips.add(ip)
            devices.append(
                LSDPDevice(
                    node_id=device.node_id,
                    ip=ip,
                    class_id=device.class_id,
                    txt_records=device.txt_records,
                )
            )
        return sorted(devices, key=lambda d: d.ip)

    def _build_query_packet(self, class_ids: list[int]) -> bytes:
        header = struct.pack("!B", 6) + LSDP_MAGIC + struct.pack("!B", LSDP_VERSION)
        msg_length = 3 + (len(class_ids) * 2)
        query = struct.pack("!B", msg_length) + struct.pack("!B", MSG_QUERY)
        query += struct.pack("!B", len(class_ids))
        for class_id in class_ids:
            query += struct.pack("!H", class_id)
        return header + query

    def _parse_packet(self, data: bytes, source_ip: str) -> None:
        if len(data) < 6 or data[1:5] != LSDP_MAGIC:
            return
        if data[5] != LSDP_VERSION:
            return
        offset = data[0]
        while offset < len(data):
            if offset + 1 > len(data):
                break
            msg_length = data[offset]
            if offset + msg_length > len(data):
                break
            if data[offset + 1] == MSG_ANNOUNCE:
                self._parse_announce(data[offset : offset + msg_length], source_ip)
            offset += msg_length

    def _parse_announce(self, data: bytes, source_ip: str) -> None:
        if len(data) < 3:
            return
        offset = 2
        node_id_len = data[offset]
        offset += 1
        if offset + node_id_len > len(data):
            return
        node_id = data[offset : offset + node_id_len].decode("utf-8", errors="ignore")
        offset += node_id_len
        if offset >= len(data):
            return
        addr_len = data[offset]
        offset += 1
        if addr_len == 4 and offset + 4 <= len(data):
            ip = ".".join(str(b) for b in data[offset : offset + 4])
            offset += 4
        else:
            ip = source_ip
            offset += addr_len
        if offset >= len(data):
            return
        count = data[offset]
        offset += 1
        for _ in range(count):
            if offset + 2 > len(data):
                break
            class_id = struct.unpack("!H", data[offset : offset + 2])[0]
            offset += 2
            if offset >= len(data):
                break
            txt_count = data[offset]
            offset += 1
            txt_records: dict[str, str] = {}
            for _ in range(txt_count):
                if offset >= len(data):
                    break
                key_len = data[offset]
                offset += 1
                if offset + key_len > len(data):
                    break
                key = data[offset : offset + key_len].decode("utf-8", errors="ignore")
                offset += key_len
                if offset >= len(data):
                    break
                val_len = data[offset]
                offset += 1
                if offset + val_len > len(data):
                    break
                value = data[offset : offset + val_len].decode("utf-8", errors="ignore")
                offset += val_len
                txt_records[key] = value
            self.discovered_devices[f"{node_id}:{class_id}"] = LSDPDevice(
                node_id=node_id,
                ip=ip,
                class_id=class_id,
                txt_records=txt_records,
            )
