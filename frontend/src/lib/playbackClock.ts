/** Drift larger than this (seconds) is a seek/skip, not poll jitter. */
export const PLAYBACK_SNAP_SECS = 1.75;

export function playbackPosition(
  originSecs: number,
  originAt: number,
  now: number,
  playing: boolean,
): number {
  if (!playing) return Math.max(0, originSecs);
  return Math.max(0, originSecs + (now - originAt) / 1000);
}

export function clampPlayback(secs: number, totlen: number): number {
  if (totlen > 0) return Math.min(Math.max(0, secs), totlen);
  return Math.max(0, secs);
}

export function shouldSnapPlayback(predicted: number, incoming: number): boolean {
  return Math.abs(predicted - incoming) >= PLAYBACK_SNAP_SECS;
}

export function playbackProgress(secs: number, totlen: number): number {
  if (totlen <= 0) return 0;
  return Math.min(1, Math.max(0, secs / totlen));
}
