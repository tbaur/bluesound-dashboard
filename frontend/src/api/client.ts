import type {
  ApiErrorBody,
  AudioInput,
  DevicesResponse,
  PlayerStatus,
  Preset,
  QueueResponse,
  SyncState,
} from './types';
import { ApiError } from './types';

const BASE = '/api/v1';

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return new ApiError(response.status, body);
  } catch {
    return new ApiError(response.status, {
      error: 'http_error',
      message: response.statusText || 'Request failed',
      code: 'http_error',
      request_id: response.headers.get('X-Request-ID') || '-',
    });
  }
}

async function request<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const headers = new Headers(init?.headers);
  let body = init?.body;
  if (init?.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  const rest = { ...(init ?? {}) } as RequestInit & { json?: unknown };
  delete rest.json;
  const response = await fetch(`${BASE}${path}`, {
    ...rest,
    headers,
    body,
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const api = {
  listDevices: () => request<DevicesResponse>('/devices'),
  refreshDevices: () =>
    request<DevicesResponse>('/devices/refresh', { method: 'POST' }),
  getDevice: (id: string) => request<PlayerStatus>(`/devices/${id}`),
  play: (id: string) => request<void>(`/devices/${id}/play`, { method: 'POST' }),
  pause: (id: string) => request<void>(`/devices/${id}/pause`, { method: 'POST' }),
  stop: (id: string) => request<void>(`/devices/${id}/stop`, { method: 'POST' }),
  skip: (id: string) => request<void>(`/devices/${id}/skip`, { method: 'POST' }),
  back: (id: string) => request<void>(`/devices/${id}/back`, { method: 'POST' }),
  toggle: (id: string) => request<void>(`/devices/${id}/toggle`, { method: 'POST' }),
  adjustVolume: (id: string, delta: number) =>
    request<void>(`/devices/${id}/volume/adjust`, { method: 'POST', json: { delta } }),
  diagnose: (id: string) =>
    request<{
      device_id: string;
      ip: string;
      name: string;
      model: string;
      full_model: string;
      fw: string;
      state: string;
      service: string;
      volume: number;
      muted: boolean;
      sync_role: string;
      uptime: string | null;
    }>(`/devices/${id}/diagnose`),
  reboot: (id: string, soft = false) =>
    request<void>(`/devices/${id}/reboot`, { method: 'POST', json: { soft } }),
  setVolume: (id: string, level: number) =>
    request<void>(`/devices/${id}/volume`, { method: 'POST', json: { level } }),
  setFleetVolume: (level: number) =>
    request<{
      level: number;
      succeeded: number;
      failed: number;
      results: { device_id: string; name: string; ok: boolean }[];
    }>('/fleet/volume', { method: 'POST', json: { level } }),
  fleetMute: (mute: boolean) =>
    request<{
      action: string;
      succeeded: number;
      failed: number;
      results: { device_id: string; name: string; ok: boolean }[];
    }>('/fleet/mute', { method: 'POST', json: { mute } }),
  fleetPause: () =>
    request<{
      action: string;
      succeeded: number;
      failed: number;
      results: { device_id: string; name: string; ok: boolean }[];
    }>('/fleet/pause', { method: 'POST' }),
  fleetStop: () =>
    request<{
      action: string;
      succeeded: number;
      failed: number;
      results: { device_id: string; name: string; ok: boolean }[];
    }>('/fleet/stop', { method: 'POST' }),
  setMute: (id: string, mute: boolean) =>
    request<void>(`/devices/${id}/mute`, { method: 'POST', json: { mute } }),
  getQueue: (id: string) => request<QueueResponse>(`/devices/${id}/queue`),
  clearQueue: (id: string) =>
    request<void>(`/devices/${id}/queue/clear`, { method: 'POST' }),
  getInputs: (id: string) => request<AudioInput[]>(`/devices/${id}/inputs`),
  setInput: (id: string, input: string) =>
    request<void>(`/devices/${id}/input`, { method: 'POST', json: { input } }),
  getBluetooth: (id: string) =>
    request<{ mode: string }>(`/devices/${id}/bluetooth`),
  setBluetooth: (id: string, mode: 0 | 1 | 2 | 3) =>
    request<void>(`/devices/${id}/bluetooth`, { method: 'POST', json: { mode } }),
  getPresets: (id: string) => request<Preset[]>(`/devices/${id}/presets`),
  playPreset: (id: string, presetId: string | number) =>
    request<void>(`/devices/${id}/presets/${presetId}/play`, { method: 'POST' }),
  getSync: () => request<SyncState>('/sync'),
  syncAdd: (masterId: string, slaveId: string) =>
    request<void>('/sync/add', {
      method: 'POST',
      json: { master_id: masterId, slave_id: slaveId },
    }),
  syncEnable: (primaryId: string) =>
    request<void>('/sync/enable', {
      method: 'POST',
      json: { primary_id: primaryId },
    }),
  syncRemove: (masterId: string, slaveId: string) =>
    request<void>('/sync/remove', {
      method: 'POST',
      json: { master_id: masterId, slave_id: slaveId },
    }),
  syncBreak: () => request<void>('/sync/break', { method: 'POST' }),
  moveQueueItem: (id: string, fromIndex: number, toIndex: number) =>
    request<void>(`/devices/${id}/queue/move`, {
      method: 'POST',
      json: { from_index: fromIndex, to_index: toIndex },
    }),
};
