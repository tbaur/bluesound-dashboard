import { describe, expect, it } from 'vitest';
import type { PlayerStatus } from '@/api/types';
import {
  fleetHasActivePlayback,
  fleetHouseStatus,
  fleetHouseStatusLine,
} from '@/lib/fleetStatus';

function player(
  partial: Partial<PlayerStatus> & Pick<PlayerStatus, 'id' | 'name'>,
): PlayerStatus {
  return {
    ip: partial.ip ?? `10.0.0.${partial.id}`,
    model: '',
    brand: '',
    full_model: '',
    status: 'online',
    state: 'stop',
    service: '',
    volume: 20,
    muted: false,
    db: '',
    fw: '',
    master: '',
    group: '',
    slaves: [],
    sync_role: 'standalone',
    battery: null,
    track: '',
    artist: '',
    album: '',
    quality: '',
    consecutive_failures: 0,
    last_seen: null,
    ...partial,
  };
}

describe('fleetHouseStatus', () => {
  it('reports all quiet when idle', () => {
    expect(
      fleetHouseStatus(
        [player({ id: '1', name: 'Kitchen' }), player({ id: '2', name: 'Patio' })],
        null,
      ),
    ).toEqual({
      primary: 'All quiet',
      detail: '',
      meta: [],
      isIdle: true,
    });
  });

  it('names a single playing source with track detail', () => {
    expect(
      fleetHouseStatus(
        [
          player({
            id: '1',
            name: 'Living Room Speakers',
            state: 'stream',
            service: 'AirPlay',
            track: 'Song',
            artist: 'Artist',
          }),
          player({ id: '2', name: 'Kitchen' }),
        ],
        null,
      ),
    ).toEqual({
      primary: 'Living Room Speakers · AirPlay',
      detail: 'Song — Artist',
      meta: [],
      isIdle: false,
    });
  });

  it('splits playing count, synced, and muted into meta chips', () => {
    expect(
      fleetHouseStatus(
        [
          player({
            id: '1',
            name: 'Living',
            state: 'play',
            service: 'AirPlay',
            sync_role: 'primary',
            slaves: ['10.0.0.2'],
            track: 'Track',
          }),
          player({
            id: '2',
            name: 'Kitchen',
            state: 'stream',
            sync_role: 'synced',
            muted: true,
          }),
        ],
        {
          groups: [
            {
              primary_id: '1',
              primary_name: 'Living',
              primary_ip: '10.0.0.1',
              group: '',
              slave_ids: ['2'],
              slave_names: ['Kitchen'],
            },
          ],
          standalone_ids: [],
        },
      ),
    ).toEqual({
      primary: 'Living · AirPlay',
      detail: 'Track',
      meta: ['2 playing', 'Synced', '1 muted'],
      isIdle: false,
    });
  });

  it('formats a tooltip line', () => {
    expect(
      fleetHouseStatusLine(
        [
          player({
            id: '1',
            name: 'Living',
            state: 'stream',
            service: 'TIDAL connect',
            track: 'Sapana',
          }),
        ],
        null,
      ),
    ).toBe('Living · TIDAL connect · Sapana');
  });

  it('detects active playback', () => {
    expect(fleetHasActivePlayback([player({ id: '1', name: 'A' })])).toBe(false);
    expect(
      fleetHasActivePlayback([player({ id: '1', name: 'A', state: 'stream' })]),
    ).toBe(true);
  });
});
