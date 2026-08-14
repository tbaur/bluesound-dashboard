/**
 * The house remote is a session, not a guess from the latest poll.
 *
 * This house is AirPlay standalones, not a Bluesound sync group. Status
 * arrives one room at a time. User actions pin intent; device snapshots
 * fill in title/art. Connecting after Stop is not playback.
 */
export type HouseSessionPhase = 'live' | 'catchup' | 'stopped';

export type HouseSession = {
  phase: HouseSessionPhase;
  memberIds: string[];
};

export const LIVE_HOUSE_SESSION: HouseSession = { phase: 'live', memberIds: [] };

export function houseCatchupSession(memberIds: readonly string[]): HouseSession {
  return { phase: 'catchup', memberIds: uniqueIds(memberIds) };
}

export function houseStoppedSession(): HouseSession {
  return { phase: 'stopped', memberIds: [] };
}

export function isEstablishedPlayback(state: string): boolean {
  return state === 'play' || state === 'stream';
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}
