"""Async BluOS HTTP client with timeouts, retries, and rate limiting."""

from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any
from urllib.parse import quote

import httpx

from app.bluos.xml import attr, safe_parse_xml, text
from app.config import Settings
from app.models import (
    AudioInput,
    DeviceSetting,
    DeviceSettingsResponse,
    PlayerStatus,
    Preset,
    QueueItem,
    QueueResponse,
    SettingOption,
    SyncRole,
    UpgradeStatus,
)
from app.validators import make_device_id, parse_bluos_host, sanitize_ip

logger = logging.getLogger(__name__)


class RateLimiter:
    def __init__(self, min_interval: float) -> None:
        self._min_interval = min_interval
        self._last: dict[str, float] = {}
        self._lock = asyncio.Lock()

    async def wait(self, key: str) -> None:
        """Per-key spacing without holding the lock across sleep."""
        if self._min_interval <= 0:
            return
        while True:
            async with self._lock:
                now = time.monotonic()
                last = self._last.get(key, 0.0)
                delay = self._min_interval - (now - last)
                if delay <= 0:
                    self._last[key] = now
                    return
            await asyncio.sleep(delay)


class BluOSClient:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self.settings = settings
        self._owns_client = client is None
        # BluOS may 301 /Settings from :11000 -> :11001; match urllib follow behavior.
        self._client = client or httpx.AsyncClient(
            timeout=settings.device_http_timeout,
            follow_redirects=True,
        )
        self._rate = RateLimiter(settings.control_rate_limit_seconds)
        self._sem = asyncio.Semaphore(settings.max_concurrent_device_calls)

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    def _url(self, ip: str, path: str, query: str = "") -> str:
        base = f"http://{ip}:{self.settings.bluos_port}{path}"
        return f"{base}?{query}" if query else base

    async def _get(
        self,
        ip: str,
        path: str,
        *,
        query: str = "",
        retries: int = 3,
        control: bool = False,
    ) -> bytes | None:
        sanitized = sanitize_ip(ip)
        if not sanitized:
            return None
        if not self.settings.is_allowed_device_ip(sanitized):
            logger.warning("blocked_non_private_ip", extra={"device_ip": sanitized})
            return None
        if control:
            await self._rate.wait(sanitized)
        url = self._url(sanitized, path, query)
        last_error: Exception | None = None
        for attempt in range(retries if not control else 1):
            try:
                async with self._sem:
                    response = await self._client.get(url)
                if response.status_code >= 400:
                    logger.debug(
                        "bluos_http_error ip=%s path=%s status=%s",
                        sanitized,
                        path,
                        response.status_code,
                    )
                    return None
                content = response.content
                if len(content) > self.settings.max_xml_size:
                    logger.warning("payload_too_large ip=%s path=%s", sanitized, path)
                    return None
                return content
            except (httpx.TimeoutException, httpx.TransportError, OSError) as exc:
                last_error = exc
                if attempt + 1 >= retries or control:
                    break
                delay = min(10.0, (2**attempt) + 0.1)
                await asyncio.sleep(delay)
        if last_error:
            logger.debug("bluos_request_failed ip=%s path=%s err=%s", sanitized, path, last_error)
        return None

    async def _post(
        self,
        ip: str,
        path: str,
        *,
        data: dict[str, str] | None = None,
        control: bool = False,
    ) -> bool:
        sanitized = sanitize_ip(ip)
        if not sanitized:
            return False
        if not self.settings.is_allowed_device_ip(sanitized):
            logger.warning("blocked_non_private_ip", extra={"device_ip": sanitized})
            return False
        if control:
            await self._rate.wait(sanitized)
        url = self._url(sanitized, path)
        try:
            async with self._sem:
                response = await self._client.post(url, data=data or {})
            return response.status_code < 400
        except (httpx.TimeoutException, httpx.TransportError, OSError) as exc:
            logger.debug("bluos_post_failed ip=%s path=%s err=%s", sanitized, path, exc)
            return False

    async def _get_text(self, ip: str, path: str) -> str | None:
        raw = await self._get(ip, path)
        if raw is None:
            return None
        return raw.decode("utf-8", errors="ignore")

    def parse_sync_role(self, master: str, slaves: list[str], ip: str) -> SyncRole:
        if slaves:
            return SyncRole.PRIMARY
        if master and master != ip:
            return SyncRole.SYNCED
        return SyncRole.STANDALONE

    def _parse_sync(self, sync_xml: bytes, ip: str) -> dict[str, Any]:
        root = safe_parse_xml(sync_xml, self.settings, ip)
        if root is None:
            return {}
        master = parse_bluos_host(attr(root, "master") or text(root, "master"))
        group = attr(root, "group") or text(root, "group")
        slaves: list[str] = []
        for slave_elem in root.findall("slave"):
            slave_ip = parse_bluos_host(slave_elem.attrib.get("id") or (slave_elem.text or ""))
            if slave_ip and slave_ip not in slaves:
                slaves.append(slave_ip)
        battery_elem = root.find("battery")
        battery = battery_elem.attrib.get("level") if battery_elem is not None else None
        # Per-player volume lives on SyncStatus. For synced secondaries, /Status
        # volume is the group/primary level and must not be trusted.
        volume: int | None = None
        volume_raw = attr(root, "volume")
        if volume_raw not in ("", None):
            try:
                volume = max(0, min(100, int(volume_raw)))
            except ValueError:
                volume = None
        mute_raw = attr(root, "mute")
        muted: bool | None = None
        if mute_raw not in ("", None):
            muted = mute_raw in {"1", "true", "True"}
        return {
            "name": attr(root, "name") or "Unknown",
            "model": attr(root, "modelName") or attr(root, "brand") or "",
            "model_code": attr(root, "model"),
            "brand": attr(root, "brand"),
            "device_class": attr(root, "class"),
            "mac": attr(root, "mac"),
            "db": attr(root, "db"),
            "fw": attr(root, "version"),
            "master": master,
            "group": group,
            "slaves": slaves,
            "battery": battery,
            "volume": volume,
            "muted": muted,
        }

    def _absolute_media_url(self, ip: str, path: str) -> str:
        value = (path or "").strip()
        if not value:
            return ""
        if value.startswith(("http://", "https://")):
            return value
        if value.startswith("/"):
            return f"http://{ip}:{self.settings.bluos_port}{value}"
        return value

    @staticmethod
    def _parse_int(raw: str, default: int = 0) -> int:
        try:
            return int(float(raw))
        except (TypeError, ValueError):
            return default

    def _parse_status(self, status_xml: bytes, ip: str) -> dict[str, Any]:
        root = safe_parse_xml(status_xml, self.settings, ip)
        if root is None:
            return {}
        service = text(root, "service")
        service_name = text(root, "serviceName")
        if service == "Raat":
            service = "Roon"
        # Prefer BluOS display name (e.g. TidalConnect → "TIDAL connect").
        display_service = service_name or service
        volume_raw = text(root, "volume", "0")
        try:
            volume = int(volume_raw)
        except ValueError:
            volume = 0
        mute_raw = text(root, "mute", "0")
        image = text(root, "image") or text(root, "currentImage")
        group_volume_raw = text(root, "groupVolume")
        group_volume: int | None = None
        if group_volume_raw:
            try:
                group_volume = max(0, min(100, int(group_volume_raw)))
            except ValueError:
                group_volume = None
        return {
            "volume": max(0, min(100, volume)),
            "muted": mute_raw in {"1", "true", "True"},
            "state": text(root, "state", "stop") or "stop",
            "service": display_service,
            "service_id": service,
            "track": text(root, "title1") or text(root, "title"),
            "artist": text(root, "artist") or text(root, "title2"),
            "album": text(root, "album") or text(root, "title3"),
            "quality": text(root, "quality"),
            "stream_format": text(root, "streamFormat"),
            "image": self._absolute_media_url(ip, image),
            "secs": self._parse_int(text(root, "secs")),
            "totlen": self._parse_int(text(root, "totlen")),
            "can_seek": text(root, "canSeek") in {"1", "true", "True"},
            "input_type_index": text(root, "inputTypeIndex"),
            "input_id": text(root, "inputId"),
            "group_name": text(root, "groupName"),
            "group_volume": group_volume,
            "db": text(root, "db"),
        }

    async def get_player_status(
        self,
        ip: str,
        *,
        device_id: str | None = None,
        node_id: str = "",
    ) -> PlayerStatus:
        sanitized = sanitize_ip(ip)
        if not sanitized:
            return PlayerStatus(id="invalid", ip=ip or "", status="invalid")

        sync_xml, status_xml = await asyncio.gather(
            self._get(sanitized, "/SyncStatus"),
            self._get(sanitized, "/Status"),
        )
        player = PlayerStatus(
            id=device_id or make_device_id(sanitized, node_id=node_id),
            ip=sanitized,
        )
        if not sync_xml and not status_xml:
            player.status = "offline"
            return player

        sync: dict[str, Any] = {}
        if sync_xml:
            sync = self._parse_sync(sync_xml, sanitized)
            if not sync:
                player.status = "xml_error"
                return player
            player.name = sync["name"]
            player.model = sync["model"]
            player.brand = sync["brand"]
            player.device_class = sync.get("device_class", "")
            player.mac = sync.get("mac", "")
            player.db = sync["db"]
            player.fw = sync["fw"]
            player.master = sync["master"]
            player.group = sync["group"]
            player.slaves = sync["slaves"]
            player.battery = sync["battery"]
            player.sync_role = self.parse_sync_role(player.master, player.slaves, sanitized)
            if sync.get("volume") is not None:
                player.volume = sync["volume"]
            if sync.get("muted") is not None:
                player.muted = sync["muted"]
            if not device_id:
                player.id = make_device_id(sanitized, player.name, node_id)

        if status_xml:
            status = self._parse_status(status_xml, sanitized)
            if not status and player.status == "offline":
                player.status = "xml_error"
                return player
            # Prefer SyncStatus volume/mute — /Status reports group volume on secondaries.
            if sync.get("volume") is None:
                player.volume = status.get("volume", player.volume)
            if sync.get("muted") is None:
                player.muted = status.get("muted", player.muted)
            player.state = status.get("state", "stop")
            player.service = status.get("service", "")
            player.service_id = status.get("service_id", "")
            player.track = status.get("track", "")
            player.artist = status.get("artist", "")
            player.album = status.get("album", "")
            player.quality = status.get("quality", "")
            player.stream_format = status.get("stream_format", "")
            player.image = status.get("image", "")
            player.secs = status.get("secs", 0)
            player.totlen = status.get("totlen", 0)
            player.can_seek = status.get("can_seek", False)
            player.input_type_index = status.get("input_type_index", "")
            if status.get("group_name") and not player.group:
                player.group = status["group_name"]
            if status.get("group_volume") is not None:
                player.group_volume = status["group_volume"]
            if status.get("db"):
                player.db = status["db"]

        if player.brand and player.brand not in player.model:
            player.full_model = f"{player.brand} {player.model}".strip()
        else:
            player.full_model = player.model
        player.status = "online"
        player.last_seen = time.time()
        return player

    async def play(self, ip: str) -> bool:
        return (await self._get(ip, "/Play", control=True)) is not None

    async def pause(self, ip: str) -> bool:
        return (await self._get(ip, "/Pause", control=True)) is not None

    async def stop(self, ip: str) -> bool:
        return (await self._get(ip, "/Stop", control=True)) is not None

    async def skip(self, ip: str) -> bool:
        return (await self._get(ip, "/Skip", control=True)) is not None

    async def back(self, ip: str) -> bool:
        return (await self._get(ip, "/Back", control=True)) is not None

    async def toggle(self, ip: str, *, state: str) -> bool:
        if state in ("play", "stream", "connecting"):
            return await self.pause(ip)
        return await self.play(ip)

    async def reboot(self, ip: str, *, soft: bool = False) -> bool:
        """Reboot via the device web UI (:80), matching bluesound-controller / native UI.

        Soft: POST /Reboot soft=1. Hard: POST /reboot yes=1.
        BluOS :11000 has no /reboot|/Reboot handlers (404).
        """
        if soft:
            return await self._post_web_ui(ip, "/Reboot", {"soft": "1"})
        return await self._post_web_ui(ip, "/reboot", {"yes": "1"})

    def _web_ui_url(self, ip: str, path: str) -> str:
        port = self.settings.web_ui_port
        if port == 80:
            return f"http://{ip}{path}"
        return f"http://{ip}:{port}{path}"

    async def _get_web_ui(self, ip: str, path: str) -> str | None:
        """GET the device web UI (port 80 by default), not BluOS :11000."""
        sanitized = sanitize_ip(ip)
        if not sanitized:
            return None
        if not self.settings.is_allowed_device_ip(sanitized):
            logger.warning("blocked_non_private_ip", extra={"device_ip": sanitized})
            return None
        url = self._web_ui_url(sanitized, path)
        try:
            async with self._sem:
                response = await self._client.get(url)
            if response.status_code >= 400:
                return None
            text_body = response.text
            if len(text_body.encode("utf-8", errors="ignore")) > self.settings.max_xml_size:
                logger.warning("payload_too_large ip=%s path=%s", sanitized, path)
                return None
            return text_body
        except (httpx.TimeoutException, httpx.TransportError, OSError) as exc:
            logger.debug("web_ui_get_failed ip=%s path=%s err=%s", sanitized, path, exc)
            return None

    async def _post_web_ui(self, ip: str, path: str, data: dict[str, str]) -> bool:
        """POST form data to the device web UI (reverse-engineered settings writes)."""
        sanitized = sanitize_ip(ip)
        if not sanitized:
            return False
        if not self.settings.is_allowed_device_ip(sanitized):
            logger.warning("blocked_non_private_ip", extra={"device_ip": sanitized})
            return False
        await self._rate.wait(sanitized)
        url = self._web_ui_url(sanitized, path)
        try:
            async with self._sem:
                response = await self._client.post(url, data=data)
            return response.status_code < 400
        except (httpx.TimeoutException, httpx.TransportError, OSError) as exc:
            logger.debug("web_ui_post_failed ip=%s path=%s err=%s", sanitized, path, exc)
            return False

    @staticmethod
    def _parse_diagnostics_html(html: str) -> dict[str, str]:
        pairs = re.findall(
            r'<div class="ui-block-a">\s*([^<:]+?)\s*:?\s*</div>\s*'
            r'<div class="ui-block-b">\s*(.*?)\s*</div>',
            html,
            re.IGNORECASE | re.DOTALL,
        )
        label_map = {
            "connected to network": "network_name",
            "signal strength": "signal_strength",
            "ip address": "web_ip",
            "mac address": "web_mac",
            "bluos version": "web_fw",
            "uptime": "uptime",
            "total songs": "total_songs",
        }
        out: dict[str, str] = {}
        for label, value in pairs:
            key = label_map.get(re.sub(r"\s+", " ", label.strip().lower()))
            if not key:
                continue
            cleaned = re.sub(r"<[^>]+>", "", value).strip()
            if cleaned:
                out[key] = cleaned
        if "uptime" not in out:
            match = re.search(
                r"Uptime:</div>\s*<div[^>]*>(.*?)</div>", html, re.IGNORECASE
            )
            if match:
                out["uptime"] = match.group(1).strip()
            else:
                match = re.search(r"Uptime:\s*</[^>]+>\s*([^<\s]+)", html, re.IGNORECASE)
                if match:
                    out["uptime"] = match.group(1).strip()
        return out

    async def get_diagnostics(self, ip: str) -> dict[str, str] | None:
        html = await self._get_web_ui(ip, "/diagnostics")
        if html is None:
            return None
        parsed = self._parse_diagnostics_html(html)
        return parsed or {}

    async def get_uptime(self, ip: str) -> str | None:
        """Read uptime from the device web UI diagnostics page."""
        parsed = await self.get_diagnostics(ip)
        if parsed is None:
            return None
        return parsed.get("uptime")

    @staticmethod
    def _parse_upgrade_html(html: str) -> tuple[bool, str]:
        content_match = re.search(
            r'data-role="content"[^>]*>(.*?)</div>',
            html,
            re.IGNORECASE | re.DOTALL,
        )
        chunk = content_match.group(1) if content_match else html
        text_body = re.sub(r"<[^>]+>", " ", chunk)
        text_body = re.sub(r"\s+", " ", text_body).strip()
        lowered = text_body.lower()
        if "no update available" in lowered:
            return False, text_body or "No update available."
        if "update available" in lowered or "i want it now" in lowered:
            return True, text_body or "Update available."
        if text_body:
            return False, text_body
        return False, "Upgrade status unknown."

    async def get_upgrade_status(
        self, ip: str, *, device_id: str = "", name: str = "", current_fw: str = ""
    ) -> UpgradeStatus:
        html = await self._get_web_ui(ip, "/upgrade")
        if html is None:
            return UpgradeStatus(
                device_id=device_id,
                name=name,
                ip=ip,
                current_fw=current_fw,
                update_available=False,
                message="Upgrade check failed",
                ok=False,
            )
        available, message = self._parse_upgrade_html(html)
        return UpgradeStatus(
            device_id=device_id,
            name=name,
            ip=ip,
            current_fw=current_fw,
            update_available=available,
            message=message,
            ok=True,
        )

    def _parse_settings_page(
        self, raw: bytes, ip: str, page_id: str
    ) -> DeviceSettingsResponse | None:
        root = safe_parse_xml(raw, self.settings, ip)
        if root is None:
            return None
        settings: list[DeviceSetting] = []
        for node in root.iter("setting"):
            setting_id = (node.get("id") or node.get("name") or "").strip()
            if not setting_id:
                continue
            # Skip webview-only entries (Wi-Fi, etc.) — no simple value control.
            if node.find("webview") is not None:
                continue
            kind = (node.get("class") or "").strip()
            options: list[SettingOption] = []
            min_value: float | None = None
            max_value: float | None = None
            step: float | None = None
            units = ""
            for value_node in node.findall("value"):
                option_name = (value_node.get("name") or "").strip()
                if option_name:
                    options.append(
                        SettingOption(
                            name=option_name,
                            display_name=value_node.get("displayName") or option_name,
                        )
                    )
                    continue
                if value_node.get("min") is not None:
                    try:
                        min_value = float(value_node.get("min") or "")
                        max_value = float(value_node.get("max") or "")
                    except ValueError:
                        min_value = None
                        max_value = None
                    step_raw = value_node.get("step")
                    try:
                        step = float(step_raw) if step_raw else None
                    except ValueError:
                        step = None
                    units = value_node.get("units") or ""
            depends = node.find("dependsOn")
            settings.append(
                DeviceSetting(
                    id=setting_id,
                    name=node.get("name") or setting_id,
                    display_name=node.get("displayName") or setting_id,
                    kind=kind,
                    value=node.get("value") or "",
                    description=node.get("description") or "",
                    explanation=node.get("explanation") or "",
                    disabled=(node.get("disable") or "").lower() in {"true", "1", "yes"},
                    control_path=node.get("url") or "",
                    min_value=min_value,
                    max_value=max_value,
                    step=step,
                    units=units,
                    options=options,
                    depends_on=(depends.get("name") if depends is not None else "") or "",
                    depends_value=(depends.get("value") if depends is not None else "") or "",
                )
            )
        return DeviceSettingsResponse(page_id=page_id, settings=settings)

    async def get_device_settings(self, ip: str, page_id: str) -> DeviceSettingsResponse | None:
        """Read BluOS settings page (audio / player) via :11000/Settings."""
        page = (page_id or "").strip().lower()
        if page not in {"audio", "player"}:
            return None
        raw = await self._get(ip, "/Settings", query=f"id={page}")
        if not raw:
            return None
        return self._parse_settings_page(raw, ip, page)

    async def set_device_setting(
        self, ip: str, setting_id: str, value: str, *, control_path: str = ""
    ) -> bool:
        """Write a setting via its BluOS control path when known, else web UI POST."""
        sid = (setting_id or "").strip()
        if not sid:
            return False
        path = (control_path or "").strip()
        if not path:
            path = await self._resolve_setting_control_path(ip, sid)
        if path.startswith("/") and "://" not in path:
            path_only = path.split("?", 1)[0]
            if path_only.lower() == "/name":
                raw = await self._get(
                    ip, "/Name", query=f"name={quote(value)}", control=True
                )
            else:
                raw = await self._get(
                    ip,
                    path_only,
                    query=f"{quote(sid, safe='-_.')}={quote(value, safe=',.-')}",
                    control=True,
                )
            if raw is not None:
                return True
        return await self._post_web_ui(
            ip,
            "/settings",
            {"playnum": "1", "id": sid, "value": value},
        )

    async def _resolve_setting_control_path(self, ip: str, setting_id: str) -> str:
        for page in ("audio", "player"):
            page_data = await self.get_device_settings(ip, page)
            if page_data is None:
                continue
            for setting in page_data.settings:
                if setting.id == setting_id:
                    return setting.control_path or ""
        return ""

    async def set_volume(self, ip: str, level: int) -> bool:
        level = max(0, min(100, level))
        return (await self._get(ip, "/Volume", query=f"level={level}", control=True)) is not None

    async def adjust_volume(self, ip: str, delta: int, current_level: int) -> bool:
        level = max(0, min(100, current_level + delta))
        return await self.set_volume(ip, level)

    async def set_mute(self, ip: str, mute: bool) -> bool:
        return (
            await self._get(ip, "/Volume", query=f"mute={1 if mute else 0}", control=True)
        ) is not None

    _INPUT_HINTS = (
        ("hdmi arc", "arc"),
        ("earc", "earc"),
        ("optical", "spdif"),
        ("analog", "analog"),
        ("line in", "analog"),
        ("coax", "coax"),
        ("phono", "phono"),
        ("vinyl", "phono"),
        ("computer", "computer"),
        ("aes", "aesebu"),
        ("balanced", "balanced"),
        ("microphone", "microphone"),
        ("bluetooth", "bluetooth"),
    )
    _ICON_HINTS = (
        ("ic_optical", "spdif"),
        ("ic_analog", "analog"),
        ("ic_tv", "arc"),
        ("ic_hdmi", "arc"),
        ("ic_phono", "phono"),
        ("ic_coax", "coax"),
        ("ic_bluetooth", "bluetooth"),
    )
    _BT_MODE_MAP = {"0": "Manual", "1": "Automatic", "2": "Guest", "3": "Disabled"}

    @classmethod
    def _input_type_from_capture(cls, display_name: str, icon: str) -> str:
        """Map capture menu labels/icons to v1.7 inputTypeIndex type tokens."""
        name = (display_name or "").lower()
        for needle, type_name in cls._INPUT_HINTS:
            if needle in name:
                return type_name
        icon_l = (icon or "").lower()
        for needle, type_name in cls._ICON_HINTS:
            if needle in icon_l:
                return type_name
        return "analog"

    async def get_queue(self, ip: str) -> QueueResponse | None:
        """Play queue via BluOS v1.7 GET /Playlist."""
        raw = await self._get(ip, "/Playlist", query="start=0&end=500")
        if not raw:
            return None
        root = safe_parse_xml(raw, self.settings, ip)
        if root is None:
            return None
        items = [
            QueueItem(
                title=text(song, "title"),
                artist=text(song, "art") or text(song, "artist"),
                album=text(song, "alb") or text(song, "album"),
                image=text(song, "image"),
                service=text(song, "service"),
            )
            for song in root.findall("song")
        ]
        length_attr = root.attrib.get("length")
        length_el = root.findtext("length")
        try:
            count = int(
                length_attr
                if length_attr is not None
                else (length_el if length_el is not None else len(items))
            )
        except ValueError:
            count = len(items)
        return QueueResponse(items=items, count=count)

    async def clear_queue(self, ip: str) -> bool:
        """Clear play queue via BluOS v1.7 GET /Clear."""
        return (await self._get(ip, "/Clear", control=True)) is not None

    async def move_queue_item(self, ip: str, from_index: int, to_index: int) -> bool:
        """Move queue track via BluOS v1.7 GET /Move?old=&new=."""
        return (
            await self._get(
                ip,
                "/Move",
                query=f"old={from_index}&new={to_index}",
                control=True,
            )
        ) is not None

    async def get_inputs(self, ip: str) -> list[AudioInput] | None:
        """List capture inputs via BluOS v1.7 Settings?id=capture."""
        raw = await self._get(ip, "/Settings", query="id=capture&schemaVersion=32")
        if not raw:
            return None
        root = safe_parse_xml(raw, self.settings, ip)
        if root is None:
            return None

        active_type_index = ""
        active_input_id = ""
        active_name = ""
        status_raw = await self._get(ip, "/Status")
        if status_raw:
            status = self._parse_status(status_raw, ip)
            if status.get("service_id") == "Capture":
                active_type_index = str(status.get("input_type_index") or "")
                active_input_id = str(status.get("input_id") or "")
                active_name = str(status.get("track") or "")

        inputs: list[AudioInput] = []
        type_counts: dict[str, int] = {}
        for group in root.iter("menuGroup"):
            group_id = group.get("id", "")
            if not group_id.startswith("capture-") or group_id == "capture":
                continue
            if "bluetooth" in group_id.lower():
                continue
            name = group.get("displayName", "") or group_id
            icon = group.get("icon", "")
            type_name = self._input_type_from_capture(name, icon)
            type_counts[type_name] = type_counts.get(type_name, 0) + 1
            type_index = f"{type_name}-{type_counts[type_name]}"
            capture_key = group_id.removeprefix("capture-")
            selected = bool(
                (active_type_index and type_index == active_type_index)
                or (active_input_id and capture_key == active_input_id)
                or (active_name and name.lower() == active_name.lower())
            )
            inputs.append(
                AudioInput(
                    name=name,
                    type=type_name,
                    id=type_index,
                    selected=selected,
                )
            )
        return inputs

    async def set_input(self, ip: str, input_name: str) -> bool:
        """Select input by display name or inputTypeIndex (fw >= 4.2)."""
        target = (input_name or "").strip()
        if not target:
            return False
        type_index = target
        if "-" not in target or not any(ch.isdigit() for ch in target.split("-")[-1]):
            inputs = await self.get_inputs(ip) or []
            lowered = target.lower()
            match = next(
                (
                    inp
                    for inp in inputs
                    if inp.id.lower() == lowered
                    or inp.name.lower() == lowered
                    or inp.type.lower() == lowered
                ),
                None,
            )
            if match is None:
                return False
            type_index = match.id
        encoded = quote(type_index, safe="-")
        return (
            await self._get(ip, "/Play", query=f"inputTypeIndex={encoded}", control=True)
        ) is not None

    async def get_bluetooth_mode(self, ip: str) -> str | None:
        """Read Bluetooth mode from capture settings (no /AudioModes GET in v1.7)."""
        raw = await self._get(ip, "/Settings", query="id=capture&schemaVersion=32")
        if not raw:
            return None
        root = safe_parse_xml(raw, self.settings, ip)
        if root is None:
            return None
        for setting in root.iter("setting"):
            setting_id = setting.get("id") or setting.get("name")
            if setting_id == "bluetoothAutoplay":
                mode = setting.get("value", "")
                return self._BT_MODE_MAP.get(mode, "Unknown")
        return None

    async def set_bluetooth_mode(self, ip: str, mode: int) -> bool:
        if mode not in (0, 1, 2, 3):
            return False
        return (
            await self._get(ip, "/audiomodes", query=f"bluetoothAutoplay={mode}", control=True)
        ) is not None

    async def get_presets(self, ip: str) -> list[Preset] | None:
        raw = await self._get(ip, "/Presets", control=True)
        if not raw:
            return None
        root = safe_parse_xml(raw, self.settings, ip)
        if root is None:
            return None
        return [
            Preset(
                id=preset.get("id", ""),
                name=text(preset, "name"),
                image=text(preset, "image"),
            )
            for preset in root.findall("preset")
        ]

    async def play_preset(self, ip: str, preset_id: int) -> bool:
        if preset_id < 1:
            return False
        return (
            await self._get(ip, "/Preset", query=f"id={preset_id}", control=True)
        ) is not None

    async def add_sync_slave(self, master_ip: str, slave_ip: str) -> bool:
        master = sanitize_ip(master_ip)
        slave = sanitize_ip(slave_ip)
        if not master or not slave:
            return False
        port = self.settings.bluos_port
        ok = await self._get(
            master,
            "/AddSlave",
            query=f"slave={slave}&port={port}",
            control=True,
        )
        if ok is not None:
            return True
        return (
            await self._get(master, "/Sync", query=f"slave={slave}", control=True)
        ) is not None

    async def remove_sync_slave(self, master_ip: str, slave_ip: str) -> bool:
        master = sanitize_ip(master_ip)
        slave = sanitize_ip(slave_ip)
        if not master or not slave:
            return False
        port = self.settings.bluos_port
        ok = await self._get(
            master,
            "/RemoveSlave",
            query=f"slave={slave}&port={port}",
            control=True,
        )
        if ok is not None:
            return True
        return (
            await self._get(master, "/Sync", query=f"remove={slave}", control=True)
        ) is not None
