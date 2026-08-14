import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { FleetHealthLog } from '@/components/FleetHealthLog';
import type { PlayerStatus } from '@/api/types';
import { useFleetStore } from '@/store/fleetStore';

const kitchen: PlayerStatus = {
  id: 'p1',
  ip: '192.168.1.20',
  name: 'Kitchen',
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
};

describe('FleetHealthLog', () => {
  beforeEach(() => {
    useFleetStore.setState({
      devices: [kitchen],
      health: {
        started_at: Date.now() / 1000 - 600,
        observed_at: Date.now() / 1000,
        window_seconds: 86_400,
        presence_window_seconds: 43_200,
        circuit_failure_threshold: 5,
        first_online: { p1: 1 },
        drops: [
          {
            device_id: 'p1',
            name: 'Kitchen',
            started_at: Date.now() / 1000 - 180,
            ended_at: Date.now() / 1000 - 60,
            duration_seconds: 120,
            peak_failures: 3,
            slow_poll: false,
          },
        ],
      },
    });
  });

  it('lists recovered drops', () => {
    render(
      <MemoryRouter>
        <FleetHealthLog />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Health' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kitchen' })).toHaveAttribute('href', '/player/p1');
    expect(screen.getByText(/2m · 3 fails → recovered/)).toBeInTheDocument();
  });
});
