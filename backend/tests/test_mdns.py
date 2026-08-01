"""mDNS discovery unit tests with Zeroconf mocked."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.discovery.mdns import MDNSDiscovery


def test_mdns_discover_collects_ipv4_addresses() -> None:
    fake_info = MagicMock()
    fake_info.addresses = [bytes((192, 168, 1, 50))]
    fake_info.port = 11000

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
        endpoints = MDNSDiscovery(timeout=0.01).discover()

    assert endpoints == ["192.168.1.50:11000"]
    assert browser_cls.call_count == 2  # _musc + _musp
    zc.close.assert_called_once()


def test_mdns_discover_keeps_musp_srv_port() -> None:
    fake_info = MagicMock()
    fake_info.addresses = [bytes((172, 16, 10, 144))]
    fake_info.port = 11010

    with (
        patch("app.discovery.mdns.Zeroconf") as zc_cls,
        patch("app.discovery.mdns.ServiceBrowser") as browser_cls,
        patch("app.discovery.mdns.time.sleep", return_value=None),
    ):
        zc = zc_cls.return_value
        zc.get_service_info.return_value = fake_info

        def fake_browser(_zc, service, handlers):
            handler = handlers[0]
            from zeroconf import ServiceStateChange

            if service == "_musp._tcp.local.":
                handler(_zc, service, "Zone._musp._tcp.local.", ServiceStateChange.Added)
            return MagicMock(cancel=MagicMock())

        browser_cls.side_effect = fake_browser
        endpoints = MDNSDiscovery(timeout=0.01).discover()

    assert "172.16.10.144:11010" in endpoints
