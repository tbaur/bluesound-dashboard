import type { PlayerStatus, SyncState } from '@/api/types';
import { deviceEndpoint, endpointsMatch } from '@/lib/endpoint';
import { joinMeta } from '@/lib/meta';
import { streamQualityLabel } from '@/lib/streamQuality';

function isPlaying(state: string): boolean {
  return state === 'play' || state === 'stream';
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
    [lead.track, lead.artist].filter(Boolean).join(' — ') ||
    focus.members
      .map((m) => [m.track, m.artist].filter(Boolean).join(' — '))
      .find(Boolean) ||
    '';
  const service =
    serviceLabel(lead) ||
    focus.members.map(serviceLabel).find(Boolean) ||
    '';
  const quality = resolveStreamMeta(focus);

  return {
    primary: trackArtist || 'Playing',
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

/** Playing sync groups first, then each free playing room as its own cluster. */
function playingClusters(
  devices: PlayerStatus[],
  sync: SyncState | null,
): Cluster[] {
  const playing = devices.filter((d) => isPlaying(d.state));
  if (playing.length === 0) return [];

  const byId = new Map(devices.map((d) => [d.id, d]));
  const claimed = new Set<string>();
  const clusters: Cluster[] = [];

  const pushGroup = (primary: PlayerStatus, followers: PlayerStatus[]) => {
    const members = [primary, ...followers].filter((d) => isPlaying(d.state));
    if (members.length === 0) return;
    for (const m of members) claimed.add(m.id);
    clusters.push({ members, lead: pickLead(members) });
  };

  if (sync?.groups.length) {
    for (const group of sync.groups) {
      const primary = byId.get(group.primary_id);
      if (!primary) continue;
      const followers = group.slave_ids
        .map((id) => byId.get(id))
        .filter((d): d is PlayerStatus => Boolean(d));
      pushGroup(primary, followers);
    }
  } else {
    const primaries = playing
      .filter((d) => d.sync_role === 'primary')
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const primary of primaries) {
      const primaryEp = deviceEndpoint(primary);
      const followers = playing.filter(
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

  const free = playing
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
  // Keep unkeyed clusters separate — unknown metadata must not glue unrelated rooms.
  merged.push(...unkeyed);

  // Prefer largest source first for stable “house” choice when dominant.
  return merged.sort((a, b) => {
    if (b.members.length !== a.members.length) {
      return b.members.length - a.members.length;
    }
    return a.lead.name.localeCompare(b.lead.name);
  });
}

export type FleetHouseStatus = {
  /** Main line: source room + service, multi-source count, or idle copy. */
  primary: string;
  /** Optional track/artist under the source. */
  detail: string;
  /** Short chips: playing count, synced, muted. */
  meta: string[];
  isIdle: boolean;
  /** One clear house stream — safe to show album art / focus a lead. */
  hasDominantStream: boolean;
  image: string;
  leadId: string | null;
  /** Distinct playback sources (sync groups / identities), not player count. */
  sourceCount: number;
};

/** Structured house status for the fleet remote panel. */
export function fleetHouseStatus(
  devices: PlayerStatus[],
  sync: SyncState | null,
): FleetHouseStatus {
  if (devices.length === 0) {
    return {
      primary: 'No players',
      detail: '',
      meta: [],
      isIdle: true,
      hasDominantStream: false,
      image: '',
      leadId: null,
      sourceCount: 0,
    };
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
    return {
      primary: 'All quiet',
      detail: '',
      meta,
      isIdle: true,
      hasDominantStream: false,
      image: '',
      leadId: null,
      sourceCount: 0,
    };
  }

  const sources = mergeByStreamIdentity(playingClusters(devices, sync));
  const sourceCount = Math.max(sources.length, 1);
  const focus = sourceCount === 1 ? sources[0] : undefined;

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

  if (!focus) {
    return {
      primary: `${sourceCount} sources`,
      detail: 'Mixed playback across the house',
      meta,
      isIdle: false,
      hasDominantStream: false,
      image: '',
      leadId: null,
      sourceCount,
    };
  }

  const lead = focus.lead;
  const hasSyncPrimary = focus.members.some((d) => d.sync_role === 'primary');
  const { primary, detail } = nowPlayingLabel(focus);

  // Art deep-links to a player only when that player is a real group lead (or solo).
  const leadId =
    focus.members.length === 1 || hasSyncPrimary ? lead.id : null;

  return {
    primary,
    detail,
    meta,
    isIdle: false,
    hasDominantStream: true,
    image: resolveImage(lead, focus.members),
    leadId,
    sourceCount: 1,
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
