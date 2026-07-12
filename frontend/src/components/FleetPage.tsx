import { useMemo, useState } from 'react';
import { FleetBar } from '@/components/GlobalVolumeControl';
import { PlayerRow } from '@/components/PlayerCard';
import { StatusPills } from '@/components/StatusPills';
import { SyncPanel } from '@/components/SyncPanel';
import { useLiveFleet } from '@/hooks/useLiveFleet';
import {
  fleetSortLabel,
  nextFleetSortMode,
  sortDevices,
  type FleetSortMode,
} from '@/lib/fleetSort';
import { useFleetStore } from '@/store/fleetStore';
import { APP_VERSION, REPO_URL } from '@/version';

export function FleetPage() {
  useLiveFleet();
  const devices = useFleetStore((s) => s.devices);
  const loading = useFleetStore((s) => s.loading);
  const refreshing = useFleetStore((s) => s.refreshing);
  const connection = useFleetStore((s) => s.connection);
  const error = useFleetStore((s) => s.error);
  const toast = useFleetStore((s) => s.toast);
  const setToast = useFleetStore((s) => s.setToast);
  const refresh = useFleetStore((s) => s.refresh);
  const discoveryMethod = useFleetStore((s) => s.discoveryMethod);
  const [sortMode, setSortMode] = useState<FleetSortMode>('name');

  const sorted = useMemo(
    () => sortDevices(devices, sortMode),
    [devices, sortMode],
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1 className="brand">Bluesound</h1>
          <p className="brand-sub">
            Live fleet control for every BluOS player on your network — discovered on load, no hardcoded IPs.
          </p>
        </div>
        <div className="header-actions">
          <StatusPills
            connection={connection}
            deviceCount={devices.length}
            discoveryMethod={discoveryMethod}
            loading={loading || refreshing}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            {refreshing ? 'Scanning…' : 'Rescan network'}
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {!loading && devices.length > 0 && <FleetBar />}

      {loading ? (
        <div className="empty">Discovering players on the LAN…</div>
      ) : devices.length === 0 ? (
        <div className="empty">
          No Bluesound players found. Check that devices are powered on and on the same network, then rescan.
        </div>
      ) : (
        <div className="fleet-table" role="table" aria-label="Bluesound players">
          <div className="fleet-row fleet-row-head" role="row">
            <div className="fleet-cell" role="columnheader" aria-sort="other">
              <button
                type="button"
                className="fleet-sort-btn"
                aria-label={`Sort by player, currently ${fleetSortLabel(sortMode)}. Click to switch.`}
                onClick={() => setSortMode((mode) => nextFleetSortMode(mode))}
              >
                <span>Player</span>
                <span className="fleet-sort-mode">{fleetSortLabel(sortMode)}</span>
              </button>
            </div>
            <div className="fleet-cell" role="columnheader">
              Now playing
            </div>
            <div className="fleet-cell fleet-cell-transport" role="columnheader">
              Controls
            </div>
            <div className="fleet-cell fleet-cell-volume" role="columnheader">
              Volume
            </div>
          </div>
          {sorted.map((device) => (
            <PlayerRow key={device.id} device={device} />
          ))}
        </div>
      )}

      <SyncPanel />

      <footer className="footer">
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          bluesound-dashboard v{APP_VERSION}
        </a>
        <span className="footer-credit"> · by tbaur</span>
      </footer>

      {toast && (
        <div className="toast" role="status">
          {toast}
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn" onClick={() => setToast(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
