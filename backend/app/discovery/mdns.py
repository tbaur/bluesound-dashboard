"""Cross-platform mDNS discovery via python-zeroconf."""

from __future__ import annotations

import logging
import socket
import time

from zeroconf import ServiceBrowser, ServiceStateChange, Zeroconf

from app.validators import DEFAULT_BLUOS_PORT, format_endpoint, sanitize_ip, validate_bluos_port

logger = logging.getLogger(__name__)

# Primary BluOS players (_musc) + CI secondary zones (_musp), e.g. NAD CI S2.
BLUOS_MDNS_SERVICES = ("_musc._tcp.local.", "_musp._tcp.local.")


class MDNSDiscovery:
    def __init__(
        self,
        service_types: tuple[str, ...] | None = None,
        timeout: float = 5.0,
    ) -> None:
        self.service_types = service_types or BLUOS_MDNS_SERVICES
        self.timeout = timeout

    def discover(self) -> list[str]:
        """Return canonical ``ip:port`` endpoints from SRV records."""
        endpoints: set[str] = set()
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
            port = int(info.port) if info.port else DEFAULT_BLUOS_PORT
            if not validate_bluos_port(port):
                port = DEFAULT_BLUOS_PORT
            for raw in info.addresses:
                try:
                    ip = socket.inet_ntoa(raw)
                except OSError:
                    continue
                sanitized = sanitize_ip(ip)
                if sanitized:
                    endpoints.add(format_endpoint(sanitized, port))

        browsers = [
            ServiceBrowser(zc, service_type, handlers=[on_service_state_change])
            for service_type in self.service_types
        ]
        try:
            time.sleep(self.timeout)
        finally:
            for browser in browsers:
                browser.cancel()
            zc.close()
        return sorted(endpoints)
