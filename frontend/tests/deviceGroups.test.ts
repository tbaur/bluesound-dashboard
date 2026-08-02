import { describe, expect, it } from 'vitest';
import type { PlayerStatus } from '@/api/types';
import { isCiS2Device, partitionVolumeGroups } from '@/lib/deviceGroups';

function device(partial: Partial<PlayerStatus> & Pick<PlayerStatus, 'id' | 'name'>): PlayerStatus {
  return {
    ip: '192.168.1.1',
    model: '',
    brand: '',
    full_model: '',
    device_class: '',
    mac: '',
    status: 'online',
    state: 'stop',
    service: '',
    service_id: '',
    volume: 10,
    muted: false,
    db: '',
    fw: '',
    master: '',
    group: '',
    group_volume: null,
    slaves: [],
    sync_role: 'standalone',
    battery: null,
    track: '',
    artist: '',
    album: '',
    quality: '',
    stream_format: '',
    image: '',
    secs: 0,
    totlen: 0,
    can_seek: false,
    input_type_index: '',
    consecutive_failures: 0,
    last_seen: 1,
    ...partial,
  };
}

describe('isCiS2Device', () => {
  it('detects NAD CI S2 variants', () => {
    expect(
      isCiS2Device({ model: 'CI S2', brand: 'NAD', full_model: 'NAD CI S2' }),
    ).toBe(true);
    expect(isCiS2Device({ model: 'CI-S2', brand: 'NAD', full_model: '' })).toBe(true);
  });

  it('rejects residential players', () => {
    expect(
      isCiS2Device({ model: 'NODE', brand: 'Bluesound', full_model: 'Bluesound NODE' }),
    ).toBe(false);
    expect(isCiS2Device({ model: 'C658', brand: 'NAD', full_model: 'NAD C658' })).toBe(false);
  });
});

describe('partitionVolumeGroups', () => {
  it('splits residential rooms from CI S2 zones', () => {
    const devices = [
      device({ id: 'a', name: 'Patio', model: 'NODE', brand: 'Bluesound' }),
      device({ id: 'b', name: 'Kitchen', model: 'CI S2', brand: 'NAD', full_model: 'NAD CI S2' }),
      device({ id: 'c', name: 'Living', model: 'CI S2', brand: 'NAD', port: 11010 }),
    ];
    const { residential, ciS2 } = partitionVolumeGroups(devices);
    expect(residential.map((d) => d.id)).toEqual(['a']);
    expect(ciS2.map((d) => d.id)).toEqual(['b', 'c']);
  });
});
