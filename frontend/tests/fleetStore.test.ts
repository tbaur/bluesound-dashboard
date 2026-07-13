import { beforeEach, describe, expect, it } from 'vitest';
import { useFleetStore } from '@/store/fleetStore';
import type { PlayerStatus } from '@/api/types';

const sample: PlayerStatus = {
  id: 'player-1',
  ip: '192.168.1.10',
  name: 'Kitchen',
  model: 'NODE',
  brand: 'Bluesound',
  full_model: 'Bluesound NODE',
  device_class: 'streamer',
  mac: '90:56:82:00:00:01',
  status: 'online',
  state: 'play',
  service: 'Spotify',
  service_id: 'Spotify',
  volume: 20,
  muted: false,
  db: '-40',
  fw: '4.0',
  master: '',
  group: '',
  group_volume: null,
  slaves: [],
  sync_role: 'standalone',
  battery: null,
  track: 'Track',
  artist: 'Artist',
  album: 'Album',
  quality: '',
  stream_format: '',
  image: '',
  secs: 0,
  totlen: 0,
  can_seek: false,
  input_type_index: '',
  consecutive_failures: 0,
  last_seen: 1,
};

describe('fleetStore', () => {
  beforeEach(() => {
    useFleetStore.setState({
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
    });
  });

  it('sets fleet devices', () => {
    useFleetStore.getState().setFleet([sample], 123);
    const state = useFleetStore.getState();
    expect(state.devices).toHaveLength(1);
    expect(state.discoveredAt).toBe(123);
    expect(state.loading).toBe(false);
  });

  it('sets all volumes locally', () => {
    useFleetStore.getState().setFleet([sample, { ...sample, id: 'player-2', volume: 5 }]);
    useFleetStore.getState().setAllVolumesLocal(42);
    expect(useFleetStore.getState().devices.every((d) => d.volume === 42)).toBe(true);
  });

  it('preserves local volume while hold is active', () => {
    useFleetStore.getState().setFleet([sample]);
    useFleetStore.getState().holdVolume('player-1', 10_000);
    useFleetStore.getState().patchDevice('player-1', { volume: 55 });
    useFleetStore.getState().setFleet([{ ...sample, volume: 9, state: 'stop' }]);
    expect(useFleetStore.getState().devices[0].volume).toBe(55);
  });

  it('preserves optimistic mute while playback hold is active', () => {
    useFleetStore.getState().setFleet([sample]);
    useFleetStore.getState().holdPlayback('player-1', 10_000);
    useFleetStore.getState().patchDevice('player-1', { muted: true, volume: 0 });
    useFleetStore.getState().setFleet([{ ...sample, muted: false, volume: 20 }]);
    expect(useFleetStore.getState().devices[0].muted).toBe(true);
    expect(useFleetStore.getState().devices[0].volume).toBe(0);
  });
});
