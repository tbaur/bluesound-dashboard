import type { PlayerStatus, SyncState } from '@/api/types';
import { deviceEndpoint, endpointsMatch } from '@/lib/endpoint';
import { formatTrackArtist, joinMeta } from '@/lib/meta';
import { streamQualityLabel } from '@/lib/streamQuality';

function isPlaying(state: string): boolean {
  return state === 'play' || state === 'stream' || state === 'connecting';
}

function isPaused(state: string): boolean {
  return state === 'pause';
}

function serviceLabel(device: PlayerStatus): string {
  return device.service && device.service !== 'Library/Input' ? device.service : '';
}

function resolveStreamMeta(focus: Cluster): string {
  for (const member of [focus.lead, ...focus.members]) {
    const label = streamQualityLabel(member.quality, member.stream_format);
    if (label) return label;
  }
  return '';
}

function nowPlayingLabel(focus: Cluster): { primary: string; detail: string } {
  const lead = focus.lead;
  const trackArtist =
    formatTrackArtist(lead.track, lead.artist) ||
    focus.members.map((m) => formatTrackArtist(m.track, m.artist)).find(Boolean) ||
    '';
  const service =
    serviceLabel(lead) ||
    focus.members.map(serviceLabel).find(Boolean) ||
    '';
  const quality = resolveStreamMeta(focus);

  return {
    primary: trackArtist || (focus.members.some((m) => isPlaying(m.state)) ? 'Playing' : 'Paused'),
    detail: joinMeta(service, quality),
  };
}

/** Track + artist (+ service) identity; null when metadata is too thin to cluster. */
function streamKey(device: PlayerStatus): string | null {
  const track = device.track.trim().toLowerCase();
  const artist = device.artist.trim().toLowerCase();
  if (!track && !artist) return null;
  return `${track}\n${artist}\n${serviceLabel(device).toLowerCase()}`;
}

type Cluster = {
  members: PlayerStatus[];
  lead: PlayerStatus;
};

function pickLead(candidates: PlayerStatus[]): PlayerStatus {
  return (
    candidates.find((d) => d.sync_role === 'primary' && d.image) ??
    candidates.find((d) => d.sync_role === 'primary') ??
    candidates.find((d) => Boolean(d.image) && streamKey(d)) ??
    candidates.find((d) => Boolean(streamKey(d))) ??
    candidates.find((d) => Boolean(d.image)) ??
    candidates[0]
  );
}

function resolveImage(lead: PlayerStatus, members: PlayerStatus[]): string {
  if (lead.image) return lead.image;
  return members.find((m) => m.image)?.image ?? '';
}

function clusterStreamKey(cluster: Cluster): string | null {
  for (const member of [cluster.lead, ...cluster.members]) {
    const key = streamKey(member);
    if (key) return key;
  }
  return null;
}

function sourceKey(cluster: Cluster): string {
  const identity = clusterStreamKey(cluster);
  if (identity) return `stream:${identity.replaceAll('\n', '|')}`;
  return `members:${[...cluster.members.map((m) => m.id)].sort().join(',')}`;
}

function roomNamesOf(members: PlayerStatus[]): string[] {
  return [...new Set(members.map((m) => m.name).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Playing (or paused) sync groups first, then each free candidate as its own cluster. */
function clustersFromCandidates(
  devices: PlayerStatus[],
  sync: SyncState | null,
  candidates: PlayerStatus[],
): Cluster[] {
  if (candidates.length === 0) return [];

  const wanted = new Set(candidates.map((d) => d.id));
  const byId = new Map(devices.map((d) => [d.id, d]));
  const claimed = new Set<string>();
  const clusters: Cluster[] = [];

  const pushGroup = (primary: PlayerStatus, followers: PlayerStatus[]) => {
    const members = [primary, ...followers].filter((d) => wanted.has(d.id));
    if (members.length === 0) return;
    for (const member of members) claimed.add(member.id);
    clusters.push({ members, lead: pickLead(members) });
  };

  if (sync?.groups.length) {
    for (const group of sync.groups) {
      const primary = byId.get(group.primary_id);
      const followers = group.slave_ids
        .map((id) => byId.get(id))
        .filter((d): d is PlayerStatus => Boolean(d));
      if (!primary) {
        const orphanMembers = followers.filter((d) => wanted.has(d.id));
        if (orphanMembers.length === 0) continue;
        const lead = pickLead(orphanMembers);
        pushGroup(
          lead,
          orphanMembers.filter((d) => d.id !== lead.id),
        );
        continue;
      }
      pushGroup(primary, followers);
    }
  } else {
    const primaries = candidates
      .filter((d) => d.sync_role === 'primary')
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const primary of primaries) {
      const primaryEp = deviceEndpoint(primary);
      const followers = candidates.filter(
        (d) =>
          d.sync_role === 'synced' &&
          !claimed.has(d.id) &&
          (endpointsMatch(d.master, primaryEp) ||
            primary.slaves.some((slave) =>
              endpointsMatch(slave, deviceEndpoint(d)),
            )),
      );
      pushGroup(primary, followers);
    }
  }

  const free = candidates
    .filter((d) => !claimed.has(d.id))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const device of free) {
    clusters.push({ members: [device], lead: device });
  }

  return clusters;
}

/** Merge clusters that share the same now-playing identity. */
function mergeByStreamIdentity(clusters: Cluster[]): Cluster[] {
  const keyed = new Map<string, Cluster[]>();
  const unkeyed: Cluster[] = [];

  for (const cluster of clusters) {
    const key = clusterStreamKey(cluster);
    if (!key) {
      unkeyed.push(cluster);
      continue;
    }
    const list = keyed.get(key) ?? [];
    list.push(cluster);
    keyed.set(key, list);
  }

  const merged: Cluster[] = [];
  for (const list of keyed.values()) {
    const members = list.flatMap((c) => c.members);
    merged.push({ members, lead: pickLead(list.map((c) => c.lead)) });
  }
  merged.push(...unkeyed);

  return merged.sort((a, b) => {
    if (b.members.length !== a.members.length) {
      return b.members.length - a.members.length;
    }
    return a.lead.name.localeCompare(b.lead.name);
  });
}

export type HouseStreamSource = {
  key: string;
  leadId: string | null;
  primary: string;
  detail: string;
  image: string;
  album: string;
  roomNames: string[];
  playing: boolean;
  memberIds: string[];
};

function clusterToSource(cluster: Cluster): HouseStreamSource {
  const { primary, detail } = nowPlayingLabel(cluster);
  const hasSyncPrimary = cluster.members.some((d) => d.sync_role === 'primary');
  const album =
    cluster.lead.album.trim() ||
    cluster.members.find((m) => m.album.trim())?.album.trim() ||
    '';
  return {
    key: sourceKey(cluster),
    leadId: cluster.members.length === 1 || hasSyncPrimary ? cluster.lead.id : null,
    primary,
    detail,
    image: resolveImage(cluster.lead, cluster.members),
    album,
    roomNames: roomNamesOf(cluster.members),
    playing: cluster.members.some((m) => isPlaying(m.state)),
    memberIds: cluster.members.map((m) => m.id),
  };
}

export type FleetHouseStatus = {
  /** Main line: track, multi-source count, or idle copy. */
  primary: string;
  /** Optional service / format under the title. */
  detail: string;
  /** Short chips: playing count, synced, muted. */
  meta: string[];
  isIdle: boolean;
  /** Nothing playing, but a paused stream still has metadata. */
  isPaused: boolean;
  /** One clear house stream — safe to show album art / focus a lead. */
  hasDominantStream: boolean;
  image: string;
  leadId: string | null;
  /** Distinct playback sources (sync groups / identities), not player count. */
  sourceCount: number;
  album: string;
  rooms: string[];
  sources: HouseStreamSource[];
};

function emptyHouseStatus(partial: Partial<FleetHouseStatus> = {}): FleetHouseStatus {
  return {
    primary: 'All quiet',
    detail: '',
    meta: [],
    isIdle: true,
    isPaused: false,
    hasDominantStream: false,
    image: '',
    leadId: null,
    sourceCount: 0,
    album: '',
    rooms: [],
    sources: [],
    ...partial,
  };
}

function houseStreams(
  devices: PlayerStatus[],
  sync: SyncState | null,
): HouseStreamSource[] {
  const playing = devices.filter((d) => isPlaying(d.state));
  const candidates =
    playing.length > 0
      ? playing
      : devices.filter((d) => isPaused(d.state) && streamKey(d));
  return mergeByStreamIdentity(clustersFromCandidates(devices, sync, candidates)).map(
    clusterToSource,
  );
}

/** Devices the house remote should command for a focused stream. */
export function houseTransportTargets(
  source: HouseStreamSource,
  devices: PlayerStatus[],
): string[] {
  const byId = new Map(devices.map((d) => [d.id, d]));
  const members = source.memberIds
    .map((id) => byId.get(id))
    .filter((d): d is PlayerStatus => Boolean(d));
  const primary = members.find((d) => d.sync_role === 'primary');
  if (primary) return [primary.id];
  return members.map((d) => d.id);
}

/** Structured house status for the fleet remote panel. */
export function fleetHouseStatus(
  devices: PlayerStatus[],
  sync: SyncState | null,
): FleetHouseStatus {
  if (devices.length === 0) {
    return emptyHouseStatus({ primary: 'No players' });
  }

  const playing = devices.filter((d) => isPlaying(d.state));
  const mutedCount = devices.filter((d) => d.muted).length;
  const groupCount =
    sync?.groups.length ??
    devices.filter((d) => d.sync_role === 'primary').length;
  const sources = houseStreams(devices, sync);
  const meta: string[] = [];

  if (playing.length > 1) {
    meta.push(`${playing.length} playing`);
  }
  if (playing.length === 0 && sources.length > 0) {
    meta.push('Paused');
  }
  if (groupCount === 1) {
    meta.push('Synced');
  } else if (groupCount > 0) {
    meta.push(`${groupCount} groups`);
  }
  if (mutedCount > 0) {
    meta.push(`${mutedCount} muted`);
  }

  if (sources.length === 0) {
    return emptyHouseStatus({ meta });
  }

  const sourceCount = sources.length;
  const isPausedHouse = playing.length === 0;
  if (sourceCount > 1) {
    return emptyHouseStatus({
      primary: `${sourceCount} sources`,
      detail: isPausedHouse ? 'Mixed paused rooms' : 'Mixed playback across the house',
      meta,
      isIdle: false,
      isPaused: isPausedHouse,
      hasDominantStream: false,
      sourceCount,
      sources,
    });
  }

  const focus = sources[0];
  return {
    primary: focus.primary,
    detail: focus.detail,
    meta,
    isIdle: false,
    isPaused: isPausedHouse,
    hasDominantStream: true,
    image: focus.image,
    leadId: focus.leadId,
    sourceCount: 1,
    album: focus.album,
    rooms: focus.roomNames,
    sources,
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
  return joinMeta(...parts);
}

export function fleetHasActivePlayback(devices: PlayerStatus[]): boolean {
  return devices.some((d) => isPlaying(d.state));
}
