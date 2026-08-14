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

  it('keeps now-playing through an empty poll while playback is held', () => {
    const playing = {
      ...sample,
      image: 'http://art/a.jpg',
      totlen: 200,
      secs: 40,
      state: 'play',
    };
    useFleetStore.getState().setFleet([playing]);
    useFleetStore.getState().holdPlayback('player-1', 10_000);
    useFleetStore.getState().setFleet([
      {
        ...playing,
        track: '',
        artist: '',
        album: '',
        image: '',
        totlen: 0,
        secs: 0,
        state: 'stop',
      },
    ]);
    const device = useFleetStore.getState().devices[0];
    expect(device.track).toBe('Track');
    expect(device.artist).toBe('Artist');
    expect(device.image).toBe('http://art/a.jpg');
    expect(device.totlen).toBe(200);
    expect(device.secs).toBe(40);
    expect(device.state).toBe('play');
  });

  it('accepts a new track while playback is held', () => {
    useFleetStore.getState().setFleet([{ ...sample, totlen: 200, secs: 40, state: 'play' }]);
    useFleetStore.getState().holdPlayback('player-1', 10_000);
    useFleetStore.getState().setFleet([
      { ...sample, track: 'Next', artist: 'Other', totlen: 180, secs: 1, state: 'play' },
    ]);
    const device = useFleetStore.getState().devices[0];
    expect(device.track).toBe('Next');
    expect(device.secs).toBe(1);
    expect(device.totlen).toBe(180);
  });

  it('holds playback for skip with no optimistic patch', async () => {
    useFleetStore.getState().setFleet([sample]);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const finished = useFleetStore.getState().control('player-1', () => gate);
    expect(useFleetStore.getState().playbackHoldUntil['player-1']).toBeGreaterThan(Date.now());
    release();
    await finished;
    expect(useFleetStore.getState().playbackHoldUntil['player-1']).toBeGreaterThan(Date.now());
  });

  it('does not hold playback for a volume-only patch', async () => {
    useFleetStore.getState().setFleet([sample]);
    await useFleetStore.getState().control('player-1', async () => undefined, { volume: 40 });
    expect(useFleetStore.getState().playbackHoldUntil['player-1'] ?? 0).toBe(0);
    expect(useFleetStore.getState().devices[0].volume).toBe(40);
  });
});
