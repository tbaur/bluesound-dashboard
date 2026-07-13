export type SyncRole = 'primary' | 'synced' | 'standalone';

export interface PlayerStatus {
  id: string;
  ip: string;
  name: string;
  model: string;
  brand: string;
  full_model: string;
  device_class: string;
  mac: string;
  status: string;
  state: string;
  service: string;
  service_id: string;
  volume: number;
  muted: boolean;
  db: string;
  fw: string;
  master: string;
  group: string;
  group_volume: number | null;
  slaves: string[];
  sync_role: SyncRole;
  battery: string | null;
  track: string;
  artist: string;
  album: string;
  quality: string;
  stream_format: string;
  image: string;
  secs: number;
  totlen: number;
  can_seek: boolean;
  input_type_index: string;
  consecutive_failures: number;
  last_seen: number | null;
}

export interface DevicesResponse {
  devices: PlayerStatus[];
  discovered_at: number | null;
  discovery_method: string;
}

export interface QueueItem {
  title: string;
  artist: string;
  album: string;
  image: string;
  service: string;
}

export interface QueueResponse {
  items: QueueItem[];
  count: number;
}

export interface AudioInput {
  name: string;
  type: string;
  id: string;
  selected: boolean;
}

export interface Preset {
  id: string;
  name: string;
  image: string;
}

export interface SyncGroup {
  primary_id: string;
  primary_name: string;
  primary_ip: string;
  group: string;
  slave_ids: string[];
  slave_names: string[];
}

export interface SyncState {
  groups: SyncGroup[];
  standalone_ids: string[];
}

export interface DiagnoseResponse {
  device_id: string;
  ip: string;
  name: string;
  model: string;
  full_model: string;
  device_class: string;
  mac: string;
  fw: string;
  state: string;
  service: string;
  volume: number;
  muted: boolean;
  db: string;
  sync_role: SyncRole;
  master: string;
  group: string;
  quality: string;
  stream_format: string;
  uptime: string | null;
  network_name: string | null;
  signal_strength: string | null;
  total_songs: string | null;
  web_ip: string | null;
  web_mac: string | null;
  web_fw: string | null;
}

export interface SettingOption {
  name: string;
  display_name: string;
}

export interface DeviceSetting {
  id: string;
  name: string;
  display_name: string;
  kind: string;
  value: string;
  description: string;
  explanation: string;
  disabled: boolean;
  control_path: string;
  min_value: number | null;
  max_value: number | null;
  step: number | null;
  units: string;
  options: SettingOption[];
  depends_on: string;
  depends_value: string;
}

export interface DeviceSettingsResponse {
  page_id: string;
  settings: DeviceSetting[];
}

export interface UpgradeStatus {
  device_id: string;
  name: string;
  ip: string;
  current_fw: string;
  update_available: boolean;
  message: string;
  ok: boolean;
}

export interface FleetUpgradeResponse {
  updates_available: number;
  checked: number;
  failed: number;
  results: UpgradeStatus[];
}

export interface FirmwareEntry {
  device_id: string;
  name: string;
  ip: string;
  model: string;
  fw: string;
  status: string;
}

export interface FleetFirmwareResponse {
  unique_versions: string[];
  skew: boolean;
  devices: FirmwareEntry[];
}

export interface ApiErrorBody {
  error: string;
  message: string;
  code: string;
  request_id: string;
}

export class ApiError extends Error {
  status: number;
  code: string;
  requestId: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message || body.error || 'Request failed');
    this.status = status;
    this.code = body.code || body.error || 'error';
    this.requestId = body.request_id || '-';
  }
}
