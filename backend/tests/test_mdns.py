"""mDNS discovery unit tests with Zeroconf mocked."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.discovery.mdns import MDNSDiscovery


def test_mdns_discover_collects_ipv4_addresses() -> None:
    fake_info = MagicMock()
    fake_info.addresses = [bytes((192, 168, 1, 50))]

    with (
        patch("app.discovery.mdns.Zeroconf") as zc_cls,
        patch("app.discovery.mdns.ServiceBrowser") as browser_cls,
        patch("app.discovery.mdns.time.sleep", return_value=None),
    ):
        zc = zc_cls.return_value
        zc.get_service_info.return_value = fake_info

        def fake_browser(_zc, _service, handlers):
            handler = handlers[0]
            from zeroconf import ServiceStateChange

            handler(_zc, "_musc._tcp.local.", "Node._musc._tcp.local.", ServiceStateChange.Added)
            return MagicMock(cancel=MagicMock())

        browser_cls.side_effect = fake_browser
        ips = MDNSDiscovery(timeout=0.01).discover()

    assert ips == ["192.168.1.50"]
    zc.close.assert_called_once()
