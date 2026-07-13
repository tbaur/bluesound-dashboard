import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerDetailPage } from '@/components/PlayerDetailPage';
import type { PlayerStatus } from '@/api/types';
import { useFleetStore } from '@/store/fleetStore';

const getQueue = vi.fn();
const getInputs = vi.fn();
const getPresets = vi.fn();
const getBluetooth = vi.fn();
const diagnose = vi.fn();
const getUpgrade = vi.fn();
const reboot = vi.fn();

vi.mock('@/api/client', () => ({
  api: {
    getQueue: (...args: unknown[]) => getQueue(...args),
    getInputs: (...args: unknown[]) => getInputs(...args),
    getPresets: (...args: unknown[]) => getPresets(...args),
    getBluetooth: (...args: unknown[]) => getBluetooth(...args),
    diagnose: (...args: unknown[]) => diagnose(...args),
    getUpgrade: (...args: unknown[]) => getUpgrade(...args),
    reboot: (...args: unknown[]) => reboot(...args),
  },
}));

vi.mock('@/hooks/useLiveFleet', () => ({
  useLiveFleet: () => undefined,
}));

vi.mock('@/components/DeviceSettingsPanel', () => ({
  DeviceSettingsPanel: () => <div data-testid="settings-panel" />,
}));

vi.mock('@/components/VolumeNudgeButtons', () => ({
  VolumeNudgeButtons: () => null,
}));

const sample: PlayerStatus = {
  id: 'player-kitchen',
  ip: '192.168.1.20',
  name: 'Kitchen',
  model: 'NODE',
  brand: 'Bluesound',
  full_model: 'Bluesound NODE',
  device_class: 'streamer',
  mac: '90:56:82:00:00:01',
  status: 'online',
  state: 'pause',
  service: '',
  service_id: '',
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

function renderPlayer() {
  return render(
    <MemoryRouter initialEntries={['/player/player-kitchen']}>
      <Routes>
        <Route path="/player/:id" element={<PlayerDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PlayerDetailPage maintenance', () => {
  beforeEach(() => {
    getQueue.mockReset().mockResolvedValue({ items: [], count: 0 });
    getInputs.mockReset().mockResolvedValue([]);
    getPresets.mockReset().mockResolvedValue([]);
    getBluetooth.mockReset().mockResolvedValue({ mode: 'Automatic' });
    diagnose.mockReset().mockResolvedValue({
      device_id: 'player-kitchen',
      ip: '192.168.1.20',
      name: 'Kitchen',
      model: 'NODE',
      full_model: 'Bluesound NODE',
      device_class: 'streamer',
      mac: '',
      fw: '4.16.6',
      state: 'pause',
      service: '',
      volume: 20,
      muted: false,
      db: '-40',
      sync_role: 'standalone',
      master: '',
      group: '',
      uptime: '1h',
    });
    getUpgrade.mockReset().mockResolvedValue({
      device_id: 'player-kitchen',
      name: 'Kitchen',
      ip: '192.168.1.20',
      current_fw: '4.16.6',
      update_available: false,
      message: 'No update available.',
      ok: true,
    });
    reboot.mockReset().mockResolvedValue(undefined);

    useFleetStore.setState({
      devices: [sample],
      discoveredAt: Date.now(),
      discoveryMethod: 'mdns',
      sync: null,
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
      control: vi.fn(async (_id, action) => {
        await action();
      }),
      toggleMute: vi.fn(),
      patchDevice: vi.fn(),
    });
  });

  it('auto-checks upgrade on load and again from the button', async () => {
    renderPlayer();
    await screen.findByText('No update available on this player.');
    expect(getUpgrade).toHaveBeenCalledWith('player-kitchen');

    const before = getUpgrade.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Check for upgrade' }));
    await waitFor(() => expect(getUpgrade.mock.calls.length).toBeGreaterThan(before));
  });

  it('soft and hard reboot only after confirm', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const control = useFleetStore.getState().control;
    renderPlayer();
    await screen.findByRole('button', { name: 'Soft reboot' });

    fireEvent.click(screen.getByRole('button', { name: 'Soft reboot' }));
    await waitFor(() => expect(reboot).toHaveBeenCalledWith('player-kitchen', true));

    fireEvent.click(screen.getByRole('button', { name: 'Hard reboot' }));
    await waitFor(() => expect(reboot).toHaveBeenCalledWith('player-kitchen', false));
    expect(control).toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('skips reboot when confirm is cancelled', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPlayer();
    await screen.findByRole('button', { name: 'Soft reboot' });
    fireEvent.click(screen.getByRole('button', { name: 'Soft reboot' }));
    expect(reboot).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
