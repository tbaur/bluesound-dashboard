from app.bluos.xml import safe_parse_xml
from app.config import Settings
from app.validators import make_device_id, sanitize_ip, validate_device_id


def test_sanitize_ip_accepts_valid() -> None:
    assert sanitize_ip("192.168.1.10") == "192.168.1.10"


def test_sanitize_ip_rejects_path_injection() -> None:
    assert sanitize_ip("192.168.1.10/Status") is None
    assert sanitize_ip("127.0.0.1\n") is None


def test_device_id_validation() -> None:
    assert validate_device_id("player-abc123")
    assert not validate_device_id("../etc/passwd")
    assert not validate_device_id("a/b")


def test_make_device_id_stable() -> None:
    a = make_device_id("192.168.1.10", name="Kitchen")
    b = make_device_id("192.168.1.10", name="Kitchen")
    assert a == b
    assert a.startswith("player-")


def test_make_device_id_prefers_node_id() -> None:
    assert make_device_id("192.168.1.10", node_id="node-ABC") == "node-ABC"


def test_safe_parse_xml_rejects_too_deep() -> None:
    settings = Settings(max_xml_depth=2, max_xml_elements=100)
    xml = b"<a><b><c><d>x</d></c></b></a>"
    assert safe_parse_xml(xml, settings, "test") is None


def test_safe_parse_xml_accepts_normal() -> None:
    settings = Settings()
    root = safe_parse_xml(b"<status><state>play</state></status>", settings, "test")
    assert root is not None
    assert root.findtext("state") == "play"
