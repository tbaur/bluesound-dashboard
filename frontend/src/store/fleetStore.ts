import { create } from 'zustand';
import { api } from '@/api/client';
import type { PlayerStatus, SyncState } from '@/api/types';
import { ApiError } from '@/api/types';

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline';

const VOLUME_HOLD_MS = 2500;
const PLAYBACK_HOLD_MS = 2000;
const MUTE_HOLD_MS = 4500;

interface FleetState {
  devices: PlayerStatus[];
  discoveredAt: number | null;
  discoveryMethod: string;
  sync: SyncState | null;
  connection: ConnectionState;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  toast: string | null;
  /** Device ids whose volume should not be overwritten by SSE yet */
  volumeHoldUntil: Record<string, number>;
  /** Device ids whose playback/mute should not be overwritten by SSE yet */
  playbackHoldUntil: Record<string, number>;
  globalVolumeHoldUntil: number;
  /** Ignore stale sync snapshots while BluOS catches up after AddSlave. */
  syncHoldUntil: number;
  /** Last non-zero volume per device — restored on unmute */
  lastAudibleVolume: Record<string, number>;
  load: () => Promise<void>;
  /** Full LAN rediscovery (Rescan). */
  refresh: () => Promise<void>;
  /** Reload cached fleet + sync status without rediscovering the LAN. */
  reloadStatus: (opts?: {
    ensureLink?: { primaryId: string; slaveId: string };
  }) => Promise<void>;
  setFleet: (devices: PlayerStatus[], discoveredAt?: number | null) => void;
  upsertDevice: (device: PlayerStatus) => void;
  patchDevice: (deviceId: string, patch: Partial<PlayerStatus>) => void;
  holdVolume: (deviceId: string, ms?: number) => void;
  holdAllVolumes: (ms?: number) => void;
  holdPlayback: (deviceId: string, ms?: number) => void;
  holdSync: (ms?: number) => void;
  setConnection: (connection: ConnectionState) => void;
  setSync: (sync: SyncState | null) => void;
  setToast: (toast: string | null) => void;
  setAllVolumesLocal: (level: number) => void;
  setFleetVolume: (level: number) => Promise<void>;
  toggleMute: (deviceId: string) => Promise<void>;
  fleetMuteAll: (mute: boolean) => Promise<void>;
  fleetPauseAll: () => Promise<void>;
  fleetStopAll: () => Promise<void>;
  fleetRebootAll: (soft: boolean) => Promise<void>;
  control: (
    deviceId: string,
    action: () => Promise<void>,
    optimistic?: Partial<PlayerStatus>,
  ) => Promise<void>;
}

function mergeRemoteDevice(
  incoming: PlayerStatus,
  previous: PlayerStatus | undefined,
  volumeHoldUntil: Record<string, number>,
  playbackHoldUntil: Record<string, number>,
  globalVolumeHoldUntil: number,
  now: number,
): PlayerStatus {
  if (!previous) return incoming;
  let next = incoming;
  const holdVolume =
    globalVolumeHoldUntil > now || (volumeHoldUntil[incoming.id] ?? 0) > now;
  if (holdVolume) {
    next = { ...next, volume: previous.volume };
  }
  if ((playbackHoldUntil[incoming.id] ?? 0) > now) {
    // Keep optimistic play/pause/mute/volume until the hold window expires
    next = {
      ...next,
      state: previous.state,
      muted: previous.muted,
      volume: previous.volume,
    };
  }
  return next;
}

export const useFleetStore = create<FleetState>((set, get) => ({
  devices: [],
  discoveredAt: null,
  discoveryMethod: '',
  sync: null,
  connection: 'connecting',
  loading: true,
  refreshing: false,
  error: null,
  toast: null,
  volumeHoldUntil: {},
  playbackHoldUntil: {},
  globalVolumeHoldUntil: 0,
  syncHoldUntil: 0,
  lastAudibleVolume: {},

  setFleet: (devices, discoveredAt = null) => {
    const now = Date.now();
    const state = get();
    const byId = new Map(state.devices.map((d) => [d.id, d]));
    const merged = devices.map((incoming) =>
      mergeRemoteDevice(
        incoming,
        byId.get(incoming.id),
        state.volumeHoldUntil,
        state.playbackHoldUntil,
        state.globalVolumeHoldUntil,
        now,
      ),
    );
    set({
      devices: merged,
      discoveredAt: discoveredAt ?? state.discoveredAt,
      loading: false,
      error: null,
    });
  },

  upsertDevice: (device) =>
    set((state) => {
      const now = Date.now();
      const previous = state.devices.find((d) => d.id === device.id);
      const merged = mergeRemoteDevice(
        device,
        previous,
        state.volumeHoldUntil,
        state.playbackHoldUntil,
        state.globalVolumeHoldUntil,
        now,
      );
      const exists = Boolean(previous);
      return {
        devices: exists
          ? state.devices.map((d) => (d.id === device.id ? merged : d))
          : [...state.devices, merged],
      };
    }),

  patchDevice: (deviceId, patch) =>
    set((state) => {
      const lastAudibleVolume = { ...state.lastAudibleVolume };
      if (typeof patch.volume === 'number' && patch.volume > 0) {
        lastAudibleVolume[deviceId] = patch.volume;
      }
      return {
        lastAudibleVolume,
        devices: state.devices.map((d) => (d.id === deviceId ? { ...d, ...patch } : d)),
      };
    }),

  holdVolume: (deviceId, ms = VOLUME_HOLD_MS) =>
    set((state) => ({
      volumeHoldUntil: {
        ...state.volumeHoldUntil,
        [deviceId]: Date.now() + ms,
      },
    })),

  holdAllVolumes: (ms = VOLUME_HOLD_MS) => {
    const until = Date.now() + ms;
    set((state) => {
      const volumeHoldUntil = { ...state.volumeHoldUntil };
      for (const device of state.devices) {
        volumeHoldUntil[device.id] = until;
      }
      return { volumeHoldUntil, globalVolumeHoldUntil: until };
    });
  },

  holdPlayback: (deviceId, ms = PLAYBACK_HOLD_MS) =>
    set((state) => ({
      playbackHoldUntil: {
        ...state.playbackHoldUntil,
        [deviceId]: Date.now() + ms,
      },
    })),

  holdSync: (ms = 5000) => set({ syncHoldUntil: Date.now() + ms }),

  setConnection: (connection) => set({ connection }),
  setSync: (sync) =>
    set((state) => {
      // Drop stale sync while BluOS catches up after AddSlave (SSE often races ahead).
      if (
        Date.now() < state.syncHoldUntil &&
        (state.sync?.groups.length ?? 0) > 0 &&
        (sync?.groups.length ?? 0) < (state.sync?.groups.length ?? 0)
      ) {
        return {};
      }
      return { sync, syncHoldUntil: 0 };
    }),
  setToast: (toast) => set({ toast }),

  setAllVolumesLocal: (level) =>
    set((state) => ({
      devices: state.devices.map((d) => ({ ...d, volume: level })),
    })),

  setFleetVolume: async (level) => {
    const clamped = Math.max(0, Math.min(100, Math.round(level)));
    get().holdAllVolumes();
    get().setAllVolumesLocal(clamped);
    try {
      const result = await api.setFleetVolume(clamped);
      get().holdAllVolumes();
      get().setAllVolumesLocal(clamped);
      if (clamped > 0) {
        set((state) => {
          const lastAudibleVolume = { ...state.lastAudibleVolume };
          for (const device of state.devices) {
            lastAudibleVolume[device.id] = clamped;
          }
          return { lastAudibleVolume };
        });
      }
      if (result.failed > 0) {
        set({
          toast: `Global volume ${clamped}: ${result.succeeded} ok, ${result.failed} failed`,
        });
      }
    } catch (err) {
      set({
        globalVolumeHoldUntil: 0,
        toast:
          err instanceof ApiError
            ? `${err.message} (${err.requestId})`
            : 'Failed to set global volume',
      });
      try {
        const fleet = await api.listDevices();
        set({ devices: fleet.devices });
      } catch {
        // ignore secondary failure
      }
    }
  },

  toggleMute: async (deviceId) => {
    const device = get().devices.find((d) => d.id === deviceId);
    if (!device) return;

    if (device.muted) {
      const restore =
        get().lastAudibleVolume[deviceId] ??
        (device.volume > 0 ? device.volume : 20);
      await get().control(
        deviceId,
        () => api.setMute(deviceId, false),
        { muted: false, volume: restore },
      );
      get().holdPlayback(deviceId, MUTE_HOLD_MS);
      get().holdVolume(deviceId, MUTE_HOLD_MS);
      return;
    }

    if (device.volume > 0) {
      set((state) => ({
        lastAudibleVolume: {
          ...state.lastAudibleVolume,
          [deviceId]: device.volume,
        },
      }));
    }
    await get().control(
      deviceId,
      () => api.setMute(deviceId, true),
      { muted: true, volume: 0 },
    );
    get().holdPlayback(deviceId, MUTE_HOLD_MS);
    get().holdVolume(deviceId, MUTE_HOLD_MS);
  },

  fleetMuteAll: async (mute) => {
    const devices = get().devices;
    if (devices.length === 0) return;

    if (mute) {
      set((state) => {
        const lastAudibleVolume = { ...state.lastAudibleVolume };
        const playbackHoldUntil = { ...state.playbackHoldUntil };
        const volumeHoldUntil = { ...state.volumeHoldUntil };
        const until = Date.now() + MUTE_HOLD_MS;
        for (const device of state.devices) {
          if (device.volume > 0) lastAudibleVolume[device.id] = device.volume;
          playbackHoldUntil[device.id] = until;
          volumeHoldUntil[device.id] = until;
        }
        return {
          lastAudibleVolume,
          playbackHoldUntil,
          volumeHoldUntil,
          devices: state.devices.map((d) => ({ ...d, muted: true, volume: 0 })),
        };
      });
    } else {
      set((state) => {
        const playbackHoldUntil = { ...state.playbackHoldUntil };
        const volumeHoldUntil = { ...state.volumeHoldUntil };
        const until = Date.now() + MUTE_HOLD_MS;
        for (const device of state.devices) {
          playbackHoldUntil[device.id] = until;
          volumeHoldUntil[device.id] = until;
        }
        return {
          playbackHoldUntil,
          volumeHoldUntil,
          devices: state.devices.map((d) => ({
            ...d,
            muted: false,
            volume: state.lastAudibleVolume[d.id] ?? (d.volume > 0 ? d.volume : 20),
          })),
        };
      });
    }

    try {
      const result = await api.fleetMute(mute);
      if (result.failed > 0) {
        set({
          toast: `Fleet ${mute ? 'mute' : 'unmute'}: ${result.succeeded} ok, ${result.failed} failed`,
        });
      }
    } catch (err) {
      set({
        toast:
          err instanceof ApiError
            ? `${err.message} (${err.requestId})`
            : 'Fleet mute failed',
      });
    }
  },

  fleetPauseAll: async () => {
    set((state) => {
      const playbackHoldUntil = { ...state.playbackHoldUntil };
      const until = Date.now() + MUTE_HOLD_MS;
      for (const device of state.devices) {
        playbackHoldUntil[device.id] = until;
      }
      return {
        playbackHoldUntil,
        devices: state.devices.map((d) => ({
          ...d,
          state: d.state === 'play' || d.state === 'stream' ? 'pause' : d.state,
        })),
      };
    });
    try {
      const result = await api.fleetPause();
      if (result.failed > 0) {
        set({
          toast: `Pause all: ${result.succeeded} ok, ${result.failed} failed`,
        });
      }
    } catch (err) {
      set({
        toast:
          err instanceof ApiError
            ? `${err.message} (${err.requestId})`
            : 'Pause all failed',
      });
    }
  },

  fleetStopAll: async () => {
    set((state) => {
      const playbackHoldUntil = { ...state.playbackHoldUntil };
      const until = Date.now() + MUTE_HOLD_MS;
      for (const device of state.devices) {
        playbackHoldUntil[device.id] = until;
      }
      return {
        playbackHoldUntil,
        devices: state.devices.map((d) => ({ ...d, state: 'stop' })),
      };
    });
    try {
      const result = await api.fleetStop();
      if (result.failed > 0) {
        set({
          toast: `Stop all: ${result.succeeded} ok, ${result.failed} failed`,
        });
      }
    } catch (err) {
      set({
        toast:
          err instanceof ApiError
            ? `${err.message} (${err.requestId})`
            : 'Stop all failed',
      });
    }
  },

  fleetRebootAll: async (soft) => {
    const count = get().devices.length;
    if (count === 0) return;
    try {
      const result = await api.fleetReboot(soft);
      const kind = soft ? 'Soft reboot' : 'Hard reboot';
      if (result.failed > 0) {
        set({
          toast: `${kind}: ${result.succeeded} ok, ${result.failed} failed`,
        });
      } else {
        set({
          toast: `${kind} sent to ${result.succeeded} player${result.succeeded === 1 ? '' : 's'}`,
        });
      }
    } catch (err) {
      set({
        toast:
          err instanceof ApiError
            ? `${err.message} (${err.requestId})`
            : 'Fleet reboot failed',
      });
    }
  },

  load: async () => {
    set({ loading: true, error: null });
    try {
      const [fleet, sync] = await Promise.all([api.listDevices(), api.getSync()]);
      set({
        devices: fleet.devices,
        discoveredAt: fleet.discovered_at,
        discoveryMethod: fleet.discovery_method,
        sync,
        loading: false,
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load devices';
      set({ loading: false, error: message });
    }
  },

  refresh: async () => {
    set({ refreshing: true, error: null });
    try {
      const [fleet, sync] = await Promise.all([
        api.refreshDevices(),
        api.getSync(),
      ]);
      set({
        devices: fleet.devices,
        discoveredAt: fleet.discovered_at,
        discoveryMethod: fleet.discovery_method,
        sync,
        refreshing: false,
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Refresh failed';
      set({ refreshing: false, error: message, toast: message });
    }
  },

  reloadStatus: async (opts) => {
    const ensure = opts?.ensureLink;
    const linkPresent = (sync: SyncState | null | undefined) => {
      if (!ensure) return true;
      return Boolean(
        sync?.groups.some(
          (g) =>
            g.primary_id === ensure.primaryId && g.slave_ids.includes(ensure.slaveId),
        ),
      );
    };

    const attempts = ensure ? 16 : 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const [fleet, sync] = await Promise.all([api.listDevices(), api.getSync()]);
        if (!linkPresent(sync)) {
          // BluOS SyncStatus often lags AddSlave — keep optimistic sync painted.
          set({
            devices: fleet.devices,
            discoveredAt: fleet.discovered_at,
            discoveryMethod: fleet.discovery_method,
          });
          await new Promise((r) => window.setTimeout(r, 200));
          continue;
        }
        set({
          devices: fleet.devices,
          discoveredAt: fleet.discovered_at,
          discoveryMethod: fleet.discovery_method,
          sync,
          syncHoldUntil: 0,
        });
        return;
      } catch (err) {
        lastError = err;
        if (attempt < attempts - 1) {
          await new Promise((r) => window.setTimeout(r, 200));
          continue;
        }
      }
    }

    if (lastError) {
      const message =
        lastError instanceof ApiError ? lastError.message : 'Status reload failed';
      set({ error: message, toast: message });
    }
  },

  control: async (deviceId, action, optimistic) => {
    const previous = get().devices.find((d) => d.id === deviceId);
    if (optimistic) {
      const now = Date.now();
      set((state) => {
        const playbackHoldUntil = { ...state.playbackHoldUntil };
        const volumeHoldUntil = { ...state.volumeHoldUntil };
        if (optimistic.state !== undefined || optimistic.muted !== undefined) {
          playbackHoldUntil[deviceId] = now + PLAYBACK_HOLD_MS;
        }
        if (optimistic.volume !== undefined) {
          volumeHoldUntil[deviceId] = now + VOLUME_HOLD_MS;
        }
        return {
          playbackHoldUntil,
          volumeHoldUntil,
          devices: state.devices.map((d) =>
            d.id === deviceId ? { ...d, ...optimistic } : d,
          ),
        };
      });
    }
    try {
      await action();
      // Extend hold so a slow BluOS status poll can't snap the UI back
      if (optimistic?.muted !== undefined || optimistic?.state !== undefined) {
        get().holdPlayback(deviceId, PLAYBACK_HOLD_MS);
      }
      if (optimistic?.volume !== undefined) {
        get().holdVolume(deviceId, VOLUME_HOLD_MS);
      }
    } catch (err) {
      if (previous) {
        get().patchDevice(deviceId, previous);
      }
      const message =
        err instanceof ApiError
          ? `${err.message} (${err.requestId})`
          : 'Control command failed';
      set({ toast: message });
    }
  },
}));
