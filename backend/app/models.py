"""API and domain models."""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class SyncRole(str, Enum):
    PRIMARY = "primary"
    SYNCED = "synced"
    STANDALONE = "standalone"


class PlayerStatus(BaseModel):
    id: str
    ip: str
    name: str = "Unknown"
    model: str = ""
    brand: str = ""
    full_model: str = ""
    device_class: str = ""
    mac: str = ""
    status: str = "offline"
    state: str = "stop"
    service: str = ""
    service_id: str = ""
    volume: int = 0
    muted: bool = False
    db: str = ""
    fw: str = ""
    master: str = ""
    group: str = ""
    group_volume: int | None = None
    slaves: list[str] = Field(default_factory=list)
    sync_role: SyncRole = SyncRole.STANDALONE
    battery: str | None = None
    track: str = ""
    artist: str = ""
    album: str = ""
    quality: str = ""
    stream_format: str = ""
    image: str = ""
    secs: int = 0
    totlen: int = 0
    can_seek: bool = False
    input_type_index: str = ""
    consecutive_failures: int = 0
    last_seen: float | None = None


class VolumeRequest(BaseModel):
    level: int = Field(ge=0, le=100)


class VolumeAdjustRequest(BaseModel):
    delta: int = Field(ge=-100, le=100)


class RebootRequest(BaseModel):
    soft: bool = False


class SyncEnableRequest(BaseModel):
    primary_id: str = Field(min_length=1, max_length=128)


class DiagnoseResponse(BaseModel):
    device_id: str
    ip: str
    name: str
    model: str = ""
    full_model: str = ""
    device_class: str = ""
    mac: str = ""
    fw: str = ""
    state: str = ""
    service: str = ""
    volume: int = 0
    muted: bool = False
    db: str = ""
    sync_role: SyncRole = SyncRole.STANDALONE
    master: str = ""
    group: str = ""
    quality: str = ""
    stream_format: str = ""
    uptime: str | None = None
    network_name: str | None = None
    signal_strength: str | None = None
    total_songs: str | None = None
    web_ip: str | None = None
    web_mac: str | None = None
    web_fw: str | None = None


class SettingOption(BaseModel):
    name: str
    display_name: str = ""


class DeviceSetting(BaseModel):
    id: str
    name: str = ""
    display_name: str = ""
    kind: str = ""
    value: str = ""
    description: str = ""
    explanation: str = ""
    disabled: bool = False
    control_path: str = ""
    min_value: float | None = None
    max_value: float | None = None
    step: float | None = None
    units: str = ""
    options: list[SettingOption] = Field(default_factory=list)
    depends_on: str = ""
    depends_value: str = ""


class DeviceSettingsResponse(BaseModel):
    page_id: str
    settings: list[DeviceSetting]


class SettingWriteRequest(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    value: str = Field(default="", max_length=512)
    control_path: str = Field(default="", max_length=128)

    @field_validator("id")
    @classmethod
    def validate_setting_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned or any(ch in cleaned for ch in ("\x00", "\n", "\r", "/", "?", "&", "=")):
            raise ValueError("invalid setting id")
        if not all(ch.isalnum() or ch in "-_" for ch in cleaned):
            raise ValueError("invalid setting id")
        return cleaned

    @field_validator("value")
    @classmethod
    def validate_setting_value(cls, value: str) -> str:
        if any(ch in value for ch in ("\x00", "\n", "\r")):
            raise ValueError("invalid setting value")
        return value

    @field_validator("control_path")
    @classmethod
    def validate_control_path(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            return ""
        if not cleaned.startswith("/") or "://" in cleaned or "?" in cleaned or ".." in cleaned:
            raise ValueError("invalid control path")
        if not all(ch.isalnum() or ch in "/_-" for ch in cleaned):
            raise ValueError("invalid control path")
        return cleaned


class UpgradeStatus(BaseModel):
    device_id: str
    name: str
    ip: str
    current_fw: str = ""
    update_available: bool = False
    message: str = ""
    ok: bool = True


class FleetUpgradeResponse(BaseModel):
    updates_available: int
    checked: int
    failed: int
    results: list[UpgradeStatus]


class FirmwareEntry(BaseModel):
    device_id: str
    name: str
    ip: str
    model: str = ""
    fw: str = ""
    status: str = ""


class FleetFirmwareResponse(BaseModel):
    unique_versions: list[str]
    skew: bool
    devices: list[FirmwareEntry]


class FleetVolumeResult(BaseModel):
    device_id: str
    name: str
    ok: bool


class FleetVolumeResponse(BaseModel):
    level: int
    succeeded: int
    failed: int
    results: list[FleetVolumeResult]


class FleetActionResponse(BaseModel):
    action: str
    succeeded: int
    failed: int
    results: list[FleetVolumeResult]


class MuteRequest(BaseModel):
    mute: bool


class InputRequest(BaseModel):
    input: str = Field(min_length=1, max_length=128)

    @field_validator("input")
    @classmethod
    def strip_input(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("input must not be empty")
        if any(ch in cleaned for ch in ("\x00", "\n", "\r")):
            raise ValueError("input contains invalid characters")
        return cleaned


class BluetoothRequest(BaseModel):
    mode: Literal[0, 1, 2, 3]


class QueueMoveRequest(BaseModel):
    from_index: int = Field(ge=0, le=10_000, alias="from")
    to_index: int = Field(ge=0, le=10_000, alias="to")

    model_config = {"populate_by_name": True}


class SyncPairRequest(BaseModel):
    master_id: str = Field(min_length=1, max_length=128)
    slave_id: str = Field(min_length=1, max_length=128)


class QueueItem(BaseModel):
    title: str = ""
    artist: str = ""
    album: str = ""
    image: str = ""
    service: str = ""


class QueueResponse(BaseModel):
    items: list[QueueItem]
    count: int


class AudioInput(BaseModel):
    name: str
    type: str = ""
    id: str = ""
    selected: bool = False


class Preset(BaseModel):
    id: str
    name: str = ""
    image: str = ""


class SyncGroup(BaseModel):
    primary_id: str
    primary_name: str
    primary_ip: str
    group: str = ""
    slave_ids: list[str] = Field(default_factory=list)
    slave_names: list[str] = Field(default_factory=list)


class SyncState(BaseModel):
    groups: list[SyncGroup]
    standalone_ids: list[str]


class ErrorBody(BaseModel):
    error: str
    message: str
    code: str
    request_id: str


class VersionInfo(BaseModel):
    version: str
    name: str = "bluesound-dashboard"


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded", "error"]
    details: dict[str, Any] = Field(default_factory=dict)


class DevicesResponse(BaseModel):
    devices: list[PlayerStatus]
    discovered_at: float | None = None
    discovery_method: str = ""
