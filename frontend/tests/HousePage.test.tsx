import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HousePage } from '@/components/HousePage';
import type { PlayerStatus, SyncState } from '@/api/types';
import { useFleetStore } from '@/store/fleetStore';

const fleetUpgrades = vi.fn();
const syncBreak = vi.fn();

vi.mock('@/api/client', () => ({
  api: {
    fleetUpgrades: (...args: unknown[]) => fleetUpgrades(...args),
    syncBreak: (...args: unknown[]) => syncBreak(...args),
  },
}));

vi.mock('@/hooks/useLiveFleet', () => ({
  useLiveFleet: () => undefined,
}));

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
  fw: '4.16.6',
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

const syncWithGroup: SyncState = {
  groups: [
    {
      primary_id: 'player-1',
      primary_name: 'Kitchen',
      primary_ip: '192.168.1.10',
      group: 'g1',
      slave_ids: ['player-2'],
      slave_names: ['Living'],
    },
  ],
  standalone_ids: [],
};

function renderHouse() {
  return render(
    <MemoryRouter>
      <HousePage />
    </MemoryRouter>,
  );
}

describe('HousePage actions', () => {
  beforeEach(() => {
    fleetUpgrades.mockReset();
    syncBreak.mockReset();
    fleetUpgrades.mockResolvedValue({
      checked: 1,
      updates_available: 0,
      failed: 0,
      results: [],
    });
    syncBreak.mockResolvedValue(undefined);

    useFleetStore.setState({
      devices: [{ ...sample }, { ...sample, id: 'player-2', name: 'Living', fw: '4.10.0', state: 'play' }],
      discoveredAt: Date.now(),
      discoveryMethod: 'mdns',
      sync: syncWithGroup,
      connection: 'live',
      loading: false,
      refreshing: false,
      error: null,
      toast: null,
      volumeHoldUntil: {},
      playbackHoldUntil: {},
      globalVolumeHoldUntil: 0,
      syncHoldUntil: 0,
      lastAudibleVolume: {},
      fleetMuteAll: vi.fn().mockResolvedValue(undefined),
      fleetPauseAll: vi.fn().mockResolvedValue(undefined),
      fleetStopAll: vi.fn().mockResolvedValue(undefined),
      fleetRebootAll: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      reloadStatus: vi.fn().mockResolvedValue(undefined),
      holdSync: vi.fn(),
      setToast: vi.fn((toast: string | null) => {
        useFleetStore.setState({ toast });
      }),
    });
  });

  it('lists each device once with status and firmware in the same row', () => {
    renderHouse();
    expect(screen.getAllByRole('heading', { name: 'Devices' })).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Firmware' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Rooms' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Kitchen')).toHaveLength(1);
    expect(screen.getAllByText('Living')).toHaveLength(1);
    expect(screen.getByText('online · play · vol 20 · fw 4.16.6')).toBeInTheDocument();
    expect(
      screen.getByText('online · play · vol 20 · fw 4.10.0 · behind house newest'),
    ).toBeInTheDocument();
  });

  it('runs Check all for upgrades and sets a toast', async () => {
    renderHouse();
    fireEvent.click(screen.getByRole('button', { name: 'Check all for upgrades' }));
    await waitFor(() => {
      expect(fleetUpgrades).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(useFleetStore.getState().toast).toBe('Firmware: no updates available');
    });
  });

  it('mutes, pauses, and stops the fleet', async () => {
    const state = useFleetStore.getState();
    renderHouse();

    fireEvent.click(screen.getByRole('button', { name: 'Mute all' }));
    await waitFor(() => expect(state.fleetMuteAll).toHaveBeenCalledWith(true));

    fireEvent.click(screen.getByRole('button', { name: 'Pause all' }));
    await waitFor(() => expect(state.fleetPauseAll).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Stop all' }));
    await waitFor(() => expect(state.fleetStopAll).toHaveBeenCalled());
  });

  it('breaks all groups after confirm', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const holdSync = useFleetStore.getState().holdSync;
    const reloadStatus = useFleetStore.getState().reloadStatus;
    renderHouse();

    fireEvent.click(screen.getByRole('button', { name: 'Break all groups' }));
    await waitFor(() => expect(syncBreak).toHaveBeenCalled());
    expect(holdSync).toHaveBeenCalled();
    expect(reloadStatus).toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('skips break when confirm is cancelled', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderHouse();
    fireEvent.click(screen.getByRole('button', { name: 'Break all groups' }));
    expect(syncBreak).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('rescans and soft/hard reboots after confirm', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const refresh = useFleetStore.getState().refresh;
    const fleetRebootAll = useFleetStore.getState().fleetRebootAll;
    renderHouse();

    fireEvent.click(screen.getByRole('button', { name: 'Rescan network' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Soft reboot all' }));
    await waitFor(() => expect(fleetRebootAll).toHaveBeenCalledWith(true));

    fireEvent.click(screen.getByRole('button', { name: 'Hard reboot all' }));
    await waitFor(() => expect(fleetRebootAll).toHaveBeenCalledWith(false));
    confirm.mockRestore();
  });
});
