import type { ConnectionState } from '@/store/fleetStore';

const CONNECTION_LABEL: Record<ConnectionState, string> = {
  live: 'Live updates',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  offline: 'Offline',
};

const DISCOVERY_LABEL: Record<string, string> = {
  both: 'mDNS + LSDP',
  mdns: 'mDNS',
  lsdp: 'LSDP',
  'mdns+lsdp': 'mDNS + LSDP',
};

interface StatusPillsProps {
  connection: ConnectionState;
  deviceCount: number;
  discoveryMethod: string;
  loading: boolean;
}

export function StatusPills({
  connection,
  deviceCount,
  discoveryMethod,
  loading,
}: StatusPillsProps) {
  const discovery = DISCOVERY_LABEL[discoveryMethod] ?? discoveryMethod;
  const playersLabel = loading
    ? 'Scanning…'
    : deviceCount === 1
      ? '1 player'
      : `${deviceCount} players`;

  return (
    <div className="status-pills" role="status" aria-live="polite">
      <span
        className="pill pill-connection"
        data-state={connection}
        title="Realtime connection to the dashboard backend"
      >
        <span className="pill-dot" aria-hidden="true" />
        {CONNECTION_LABEL[connection]}
      </span>
      <span
        className="pill pill-fleet"
        title={
          discovery
            ? `Network discovery via ${discovery}`
            : 'Players currently on the LAN'
        }
      >
        {playersLabel}
        {discovery && !loading ? (
          <span className="pill-muted"> · via {discovery}</span>
        ) : null}
      </span>
    </div>
  );
}
