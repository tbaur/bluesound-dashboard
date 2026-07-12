export type SyncRole = 'primary' | 'synced' | 'standalone';

export interface PlayerStatus {
  id: string;
  ip: string;
  name: string;
  model: string;
  brand: string;
  full_model: string;
  status: string;
  state: string;
  service: string;
  volume: number;
  muted: boolean;
  db: string;
  fw: string;
  master: string;
  group: string;
  slaves: string[];
  sync_role: SyncRole;
  battery: string | null;
  track: string;
  artist: string;
  album: string;
  quality: string;
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
