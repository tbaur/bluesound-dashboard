import { describe, expect, it } from 'vitest';
import type { FleetHealthResponse, PresenceDrop } from '@/api/types';
import {
  fleetHealthCaption,
  formatDropDuration,
  formatDropLine,
  formatRelativeAge,
  presenceSegments,
} from '@/lib/health';

const drop = (partial: Partial<PresenceDrop> & Pick<PresenceDrop, 'started_at'>): PresenceDrop => ({
  device_id: 'p1',
  name: 'Kitchen',
  ended_at: null,
  duration_seconds: 0,
  peak_failures: 1,
  slow_poll: false,
  ...partial,
});

const health: FleetHealthResponse = {
  started_at: 1_000,
  observed_at: 1_200,
  window_seconds: 86_400,
  presence_window_seconds: 43_200,
  circuit_failure_threshold: 5,
  first_online: { p1: 100 },
  drops: [],
};

describe('presenceSegments', () => {
  it('marks time before first-online as unknown, then up', () => {
    const segments = presenceSegments({
      deviceId: 'p1',
      firstOnlineAt: 50,
      drops: [],
      now: 100,
      windowSeconds: 100,
    });
    expect(segments).toEqual([
      { start: 0, end: 50, state: 'unknown' },
      { start: 50, end: 100, state: 'up' },
    ]);
  });

  it('cuts a down gap for an open drop', () => {
    const segments = presenceSegments({
      deviceId: 'p1',
      firstOnlineAt: 0,
      drops: [drop({ started_at: 80, ended_at: null })],
      now: 100,
      windowSeconds: 100,
    });
    expect(segments.map((s) => s.state)).toEqual(['up', 'down']);
    expect(segments[1]?.start).toBe(80);
  });
});

describe('formatters', () => {
  it('formats drop duration and open drop lines', () => {
    expect(formatDropDuration(4)).toBe('4s');
    expect(formatDropDuration(180)).toBe('3m');
    expect(formatDropDuration(3660)).toBe('1h 1m');
    const line = formatDropLine(drop({ started_at: 1_000, ended_at: 1_180, duration_seconds: 180 }));
    expect(line).toMatch(/back .* · 3m$/);
  });

  it('formats relative last-seen', () => {
    expect(formatRelativeAge(100, 103)).toBe('just now');
    expect(formatRelativeAge(100, 130)).toBe('30s ago');
    expect(formatRelativeAge(null, 1_000)).toBe('');
  });

  it('builds the fleet caption', () => {
    expect(fleetHealthCaption(health, 8, 9)).toMatch(/8\/9 online · no drops/);
    expect(
      fleetHealthCaption({ ...health, drops: [drop({ started_at: 1_010 })] }, 8, 9),
    ).toMatch(/1 drop/);
  });
});
