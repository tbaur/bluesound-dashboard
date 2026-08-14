import type { FleetHealthResponse, PresenceDrop } from '@/api/types';

export type PresenceState = 'unknown' | 'up' | 'down';

export type PresenceSegment = {
  start: number;
  end: number;
  state: PresenceState;
};

export function emptyFleetHealth(): FleetHealthResponse {
  return {
    started_at: 0,
    observed_at: 0,
    window_seconds: 86_400,
    presence_window_seconds: 43_200,
    circuit_failure_threshold: 5,
    first_online: {},
    drops: [],
  };
}

export function dropsForDevice(health: FleetHealthResponse, deviceId: string): PresenceDrop[] {
  return health.drops.filter((drop) => drop.device_id === deviceId);
}

export function latestDrop(health: FleetHealthResponse, deviceId: string): PresenceDrop | null {
  return dropsForDevice(health, deviceId)[0] ?? null;
}

export function presenceSegments(input: {
  deviceId: string;
  firstOnlineAt: number | undefined;
  drops: PresenceDrop[];
  now: number;
  windowSeconds: number;
}): PresenceSegment[] {
  const from = input.now - input.windowSeconds;
  const to = input.now;
  const knownFrom =
    input.firstOnlineAt == null ? to : Math.max(from, input.firstOnlineAt);
  const segments: PresenceSegment[] = [];
  if (knownFrom > from) {
    segments.push({ start: from, end: Math.min(knownFrom, to), state: 'unknown' });
  }
  if (knownFrom >= to) {
    return segments.length > 0 ? segments : [{ start: from, end: to, state: 'unknown' }];
  }
  const gaps = input.drops
    .filter((drop) => drop.device_id === input.deviceId)
    .map((drop) => ({
      start: Math.max(drop.started_at, knownFrom),
      end: Math.min(drop.ended_at ?? to, to),
    }))
    .filter((gap) => gap.end > gap.start)
    .sort((a, b) => a.start - b.start);
  let cursor = knownFrom;
  for (const gap of gaps) {
    if (gap.start > cursor) {
      segments.push({ start: cursor, end: gap.start, state: 'up' });
    }
    segments.push({ start: gap.start, end: gap.end, state: 'down' });
    cursor = Math.max(cursor, gap.end);
  }
  if (cursor < to) {
    segments.push({ start: cursor, end: to, state: 'up' });
  }
  return segments;
}

export function formatClockTime(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatDropDuration(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${secs}s`;
}

export function formatDropLine(drop: PresenceDrop): string {
  const when = formatClockTime(drop.started_at);
  const duration = formatDropDuration(drop.duration_seconds);
  if (drop.ended_at == null) return `${when} · down ${duration}`;
  return `${when} · back ${formatClockTime(drop.ended_at)} · ${duration}`;
}

export function formatRelativeAge(epochSeconds: number | null, nowSeconds: number): string {
  if (epochSeconds == null || epochSeconds <= 0) return '';
  const seconds = Math.max(0, Math.floor(nowSeconds - epochSeconds));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

export function fleetHealthCaption(
  health: FleetHealthResponse,
  online: number,
  total: number,
): string {
  const drops = health.drops.length;
  const since = health.started_at > 0 ? formatClockTime(health.started_at) : '';
  const sinceBit = since ? ` since ${since}` : '';
  if (drops === 0) return `${online}/${total} online · no drops${sinceBit}`;
  const noun = drops === 1 ? 'drop' : 'drops';
  return `${online}/${total} online · ${drops} ${noun}${sinceBit}`;
}
