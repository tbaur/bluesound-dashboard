import type { PlayerStatus, SyncState } from '@/api/types';

function isPlaying(state: string): boolean {
  return state === 'play' || state === 'stream';
}

function serviceLabel(device: PlayerStatus): string {
  return device.service && device.service !== 'Library/Input' ? device.service : '';
}

function leadLabel(device: PlayerStatus): string {
  const service = serviceLabel(device);
  return service ? `${device.name} · ${service}` : device.name;
}

export type FleetHouseStatus = {
  /** Main line: source room + service, or idle copy. */
  primary: string;
  /** Optional track/artist under the source. */
  detail: string;
  /** Short chips: playing count, synced, muted. */
  meta: string[];
  isIdle: boolean;
};

/** Structured house status for the fleet remote panel. */
export function fleetHouseStatus(
  devices: PlayerStatus[],
  sync: SyncState | null,
): FleetHouseStatus {
  if (devices.length === 0) {
    return { primary: 'No players', detail: '', meta: [], isIdle: true };
  }

  const playing = devices.filter((d) => isPlaying(d.state));
  const mutedCount = devices.filter((d) => d.muted).length;
  const groupCount =
    sync?.groups.length ??
    devices.filter((d) => d.sync_role === 'primary').length;

  const meta: string[] = [];

  if (playing.length === 0) {
    if (mutedCount > 0) {
      meta.push(`${mutedCount} muted`);
    }
    if (groupCount > 0) {
      meta.push(groupCount === 1 ? 'Synced' : `${groupCount} groups`);
    }
    return { primary: 'All quiet', detail: '', meta, isIdle: true };
  }

  const lead =
    playing.find((d) => d.sync_role === 'primary') ??
    playing.find((d) => d.sync_role === 'standalone') ??
    playing[0];

  const detailParts = [lead.track, lead.artist].filter(Boolean);
  const detail = detailParts.join(' — ');

  if (playing.length > 1) {
    meta.push(`${playing.length} playing`);
  }
  if (groupCount === 1) {
    meta.push('Synced');
  } else if (groupCount > 1) {
    meta.push(`${groupCount} groups`);
  }
  if (mutedCount > 0) {
    meta.push(`${mutedCount} muted`);
  }

  return {
    primary: leadLabel(lead),
    detail,
    meta,
    isIdle: false,
  };
}

/** Flat string for titles/tooltips. */
export function fleetHouseStatusLine(
  devices: PlayerStatus[],
  sync: SyncState | null,
): string {
  const status = fleetHouseStatus(devices, sync);
  const parts = [status.primary, ...status.meta];
  if (status.detail) parts.splice(1, 0, status.detail);
  return parts.join(' · ');
}

export function fleetHasActivePlayback(devices: PlayerStatus[]): boolean {
  return devices.some((d) => isPlaying(d.state));
}
