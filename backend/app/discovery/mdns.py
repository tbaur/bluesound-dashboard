"""Cross-platform mDNS discovery via python-zeroconf."""

from __future__ import annotations

import logging
import socket
import time

from zeroconf import ServiceBrowser, ServiceStateChange, Zeroconf

from app.validators import sanitize_ip

logger = logging.getLogger(__name__)


class MDNSDiscovery:
    def __init__(self, service_type: str = "_musc._tcp.local.", timeout: float = 5.0) -> None:
        self.service_type = service_type
        self.timeout = timeout

    def discover(self) -> list[str]:
        ips: set[str] = set()
        zc = Zeroconf()

        def on_service_state_change(
            zeroconf: Zeroconf,
            service_type: str,
            name: str,
            state_change: ServiceStateChange,
        ) -> None:
            if state_change not in (ServiceStateChange.Added, ServiceStateChange.Updated):
                return
            info = zeroconf.get_service_info(service_type, name, timeout=1000)
            if not info or not info.addresses:
                return
            for raw in info.addresses:
                try:
                    ip = socket.inet_ntoa(raw)
                except OSError:
                    continue
                sanitized = sanitize_ip(ip)
                if sanitized:
                    ips.add(sanitized)

        browser = ServiceBrowser(zc, self.service_type, handlers=[on_service_state_change])
        try:
            # Allow browse window for announcements
            time.sleep(self.timeout)
        finally:
            browser.cancel()
            zc.close()
        return sorted(ips)
