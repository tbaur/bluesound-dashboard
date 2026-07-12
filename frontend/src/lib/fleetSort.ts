import type { PlayerStatus } from '@/api/types';

export type FleetSortMode = 'name' | 'sync';

export function sortDevices(
  devices: PlayerStatus[],
  mode: FleetSortMode,
): PlayerStatus[] {
  if (mode === 'name') {
    return devices.slice().sort((a, b) => a.name.localeCompare(b.name));
  }
  return sortBySyncGroup(devices);
}

/** Primaries A–Z, each followed by its followers A–Z; then remaining standalones A–Z. */
export function sortBySyncGroup(devices: PlayerStatus[]): PlayerStatus[] {
  const used = new Set<string>();
  const result: PlayerStatus[] = [];

  const primaries = devices
    .filter((d) => d.sync_role === 'primary')
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const primary of primaries) {
    result.push(primary);
    used.add(primary.id);

    const followers = devices
      .filter(
        (d) =>
          d.sync_role === 'synced' &&
          (d.master === primary.ip || primary.slaves.includes(d.ip)),
      )
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const follower of followers) {
      result.push(follower);
      used.add(follower.id);
    }
  }

  const leftovers = devices
    .filter((d) => !used.has(d.id))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  return result.concat(leftovers);
}

export function nextFleetSortMode(mode: FleetSortMode): FleetSortMode {
  return mode === 'name' ? 'sync' : 'name';
}

export function fleetSortLabel(mode: FleetSortMode): string {
  return mode === 'name' ? 'A–Z' : 'Sync';
}
