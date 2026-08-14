import { describe, expect, it } from 'vitest';
import {
  PLAYBACK_SNAP_SECS,
  clampPlayback,
  playbackPosition,
  playbackProgress,
  shouldSnapPlayback,
} from '@/lib/playbackClock';

describe('playbackClock', () => {
  it('holds still when paused', () => {
    expect(playbackPosition(30, 1000, 4000, false)).toBe(30);
  });

  it('advances from wall clock while playing', () => {
    expect(playbackPosition(30, 1000, 2500, true)).toBe(31.5);
  });

  it('clamps to the track length', () => {
    expect(clampPlayback(-2, 100)).toBe(0);
    expect(clampPlayback(40, 30)).toBe(30);
    expect(clampPlayback(12, 0)).toBe(12);
  });

  it('ignores poll jitter smaller than the snap window', () => {
    expect(shouldSnapPlayback(32.2, 33)).toBe(false);
    expect(shouldSnapPlayback(30, 30 + PLAYBACK_SNAP_SECS)).toBe(true);
  });

  it('maps position to a 0–1 fill', () => {
    expect(playbackProgress(30, 120)).toBe(0.25);
    expect(playbackProgress(10, 0)).toBe(0);
    expect(playbackProgress(200, 100)).toBe(1);
  });
});
