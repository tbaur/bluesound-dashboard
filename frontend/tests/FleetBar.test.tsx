import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FleetBar } from '@/components/GlobalVolumeControl';
import type { PlayerStatus, SyncState } from '@/api/types';
import { useFleetStore } from '@/store/fleetStore';

vi.mock('@/components/VolumeNudgeButtons', () => ({
  VolumeNudgeButtons: () => null,
}));

function player(
  partial: Partial<PlayerStatus> & Pick<PlayerStatus, 'id' | 'name'>,
): PlayerStatus {
  return {
    ip: partial.ip ?? `10.0.0.${partial.id}`,
    model: 'NODE',
    brand: 'Bluesound',
    full_model: 'Bluesound NODE',
    device_class: 'streamer',
    mac: '',
    status: 'online',
    state: 'stop',
    service: '',
    service_id: '',
    volume: 20,
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

function renderBar() {
  return render(
    <MemoryRouter>
      <FleetBar />
    </MemoryRouter>,
  );
}

describe('FleetBar house remote art', () => {
  beforeEach(() => {
    useFleetStore.setState({
      devices: [],
      sync: null,
      fleetMuteAll: vi.fn(),
      fleetPauseAll: vi.fn(),
      fleetStopAll: vi.fn(),
      setFleetVolume: vi.fn(),
      holdVolumes: vi.fn(),
    });
  });

  it('shows artwork when one house stream is dominant', () => {
    const sync: SyncState = {
      groups: [
        {
          primary_id: '1',
          primary_name: 'Hallway',
          primary_ip: '10.0.0.1',
          group: '',
          slave_ids: ['2'],
          slave_names: ['Kitchen'],
        },
      ],
      standalone_ids: [],
    };
    useFleetStore.setState({
      devices: [
        player({
          id: '1',
          name: 'Hallway Speakers',
          state: 'play',
          service: 'AirPlay',
          sync_role: 'primary',
          track: 'Track',
          artist: 'Artist',
          image: 'http://10.0.0.1/cover.jpg',
        }),
        player({
          id: '2',
          name: 'Kitchen Speakers',
          state: 'stream',
          sync_role: 'synced',
          master: '10.0.0.1:11000',
          track: 'Track',
          artist: 'Artist',
        }),
      ],
      sync,
    });

    renderBar();
    const art = screen.getByRole('link', {
      name: /Now playing artwork — open Track/,
    });
    expect(art).toHaveAttribute('href', '/player/1');
    expect(art.querySelector('img')).toHaveAttribute('src', 'http://10.0.0.1/cover.jpg');
    expect(screen.getByText('Track — Artist')).toBeInTheDocument();
    expect(screen.getByText('AirPlay')).toBeInTheDocument();
    expect(screen.queryByText(/Open house/)).not.toBeInTheDocument();
  });

  it('shows stream format and bitrate under the track when available', () => {
    useFleetStore.setState({
      devices: [
        player({
          id: '1',
          name: 'Kitchen',
          state: 'play',
          service: 'TIDAL connect',
          track: 'Sapana',
          artist: 'Artist',
          quality: 'cd',
          stream_format: 'FLAC',
          image: 'http://10.0.0.1/cover.jpg',
        }),
      ],
      sync: null,
    });

    renderBar();
    expect(screen.getByText('Sapana — Artist')).toBeInTheDocument();
    expect(screen.getByText('TIDAL connect / FLAC / CD')).toBeInTheDocument();
  });

  it('shows track/service for parallel same-stream endpoints without room counts', () => {
    useFleetStore.setState({
      devices: [
        player({
          id: '1',
          name: 'Front Bedroom Speakers',
          state: 'play',
          service: 'AirPlay',
          track: 'Joni',
          artist: 'Moomin',
          image: 'http://10.0.0.1/cover.jpg',
        }),
        player({
          id: '2',
          name: 'Hallway Speakers',
          state: 'stream',
          service: 'AirPlay',
          track: 'Joni',
          artist: 'Moomin',
        }),
      ],
      sync: null,
    });

    renderBar();
    expect(screen.getByText('Joni — Moomin')).toBeInTheDocument();
    expect(screen.getByText('AirPlay')).toBeInTheDocument();
    expect(screen.getByText('2 playing')).toBeInTheDocument();
    expect(screen.queryByText(/rooms/)).not.toBeInTheDocument();
    const art = screen.getByRole('link', {
      name: /Now playing artwork — open Joni/,
    });
    expect(art).toHaveAttribute('href', '/house');
  });

  it('hides artwork when multiple sources are playing', () => {
    useFleetStore.setState({
      devices: [
        player({
          id: '1',
          name: 'Hallway',
          state: 'play',
          track: 'Party',
          artist: 'A',
          image: 'http://art/party.jpg',
        }),
        player({
          id: '2',
          name: 'Bedroom',
          state: 'play',
          track: 'Quiet',
          artist: 'B',
          image: 'http://art/quiet.jpg',
        }),
      ],
      sync: null,
    });

    renderBar();
    expect(screen.getByText('2 sources')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Now playing artwork/ }),
    ).not.toBeInTheDocument();
  });
});
