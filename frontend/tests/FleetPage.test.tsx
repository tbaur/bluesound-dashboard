import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerStatus, SyncState } from '@/api/types';
import { FleetPage } from '@/components/FleetPage';
import { useFleetStore } from '@/store/fleetStore';

vi.mock('@/components/GlobalVolumeControl', () => ({
  FleetBar: () => <div data-testid="fleet-bar" />,
}));

vi.mock('@/components/SyncPanel', () => ({
  SyncPanel: () => <div data-testid="sync-panel" />,
}));

vi.mock('@/components/PlayerCard', () => ({
  PlayerRow: ({ device }: { device: PlayerStatus }) => (
    <div data-testid="player-row">{device.name}</div>
  ),
}));

function player(
  partial: Partial<PlayerStatus> & Pick<PlayerStatus, 'id' | 'name'>,
): PlayerStatus {
  return {
    ip: partial.ip ?? `10.0.0.${partial.id.length}`,
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

const emptySync: SyncState = { groups: [], standalone_ids: ['a', 'b'] };

const groupedSync: SyncState = {
  groups: [
    {
      primary_id: 'a',
      primary_name: 'Alpha',
      primary_ip: '10.0.0.1',
      group: 'g1',
      slave_ids: ['b'],
      slave_names: ['Bravo'],
    },
  ],
  standalone_ids: [],
};

function renderFleet() {
  return render(
    <MemoryRouter>
      <FleetPage />
    </MemoryRouter>,
  );
}

describe('FleetPage sort', () => {
  beforeEach(() => {
    useFleetStore.setState({
      devices: [
        player({ id: 'b', name: 'Bravo', ip: '10.0.0.2' }),
        player({ id: 'a', name: 'Alpha', ip: '10.0.0.1' }),
      ],
      sync: emptySync,
      connection: 'live',
      loading: false,
      refreshing: false,
      error: null,
      toast: null,
      discoveryMethod: 'mdns',
      refresh: vi.fn().mockResolvedValue(undefined),
      setToast: vi.fn(),
    });
  });

  it('defaults to A–Z sort when no runtime groups exist', () => {
    renderFleet();
    expect(screen.getByRole('heading', { name: 'BluOS' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Live fleet control for every player on your network, discovered on load, no hardcoded IPs.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Sort by player, currently A–Z. Click to switch.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /bluos-dashboard v/ })).toHaveAttribute(
      'href',
      'https://github.com/tbaur/bluos-dashboard',
    );
  });

  it('switches to Sync sort when runtime groups become enabled', () => {
    renderFleet();
    expect(
      screen.getByRole('button', {
        name: 'Sort by player, currently A–Z. Click to switch.',
      }),
    ).toBeInTheDocument();

    act(() => {
      useFleetStore.setState({ sync: groupedSync });
    });

    expect(
      screen.getByRole('button', {
        name: 'Sort by player, currently Sync. Click to switch.',
      }),
    ).toBeInTheDocument();
  });

  it('starts on Sync sort when runtime groups are already present', () => {
    useFleetStore.setState({ sync: groupedSync });
    renderFleet();
    expect(
      screen.getByRole('button', {
        name: 'Sort by player, currently Sync. Click to switch.',
      }),
    ).toBeInTheDocument();
  });

  it('still allows toggling back to A–Z while groups remain', () => {
    useFleetStore.setState({ sync: groupedSync });
    renderFleet();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Sort by player, currently Sync. Click to switch.',
      }),
    );

    expect(
      screen.getByRole('button', {
        name: 'Sort by player, currently A–Z. Click to switch.',
      }),
    ).toBeInTheDocument();
  });
});
