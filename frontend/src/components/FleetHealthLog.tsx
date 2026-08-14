import { Link } from 'react-router';
import type { PresenceDrop } from '@/api/types';
import { fleetHealthCaption, formatClockTime, formatDropDuration } from '@/lib/health';
import { useFleetStore } from '@/store/fleetStore';

const MAX_ROWS = 8;

export function FleetHealthLog() {
  const devices = useFleetStore((s) => s.devices);
  const health = useFleetStore((s) => s.health);
  if (!health || devices.length === 0) return null;

  const online = devices.filter((device) => device.status === 'online').length;
  const rows = health.drops.slice(0, MAX_ROWS);

  return (
    <section className="panel fleet-health">
      <h2>Health</h2>
      <p className="card-meta">{fleetHealthCaption(health, online, devices.length)}</p>
      {rows.length > 0 ? (
        <ul className="fleet-health-log">
          {rows.map((drop) => (
            <li key={`${drop.device_id}-${drop.started_at}`}>
              <span className="fleet-health-when">{formatClockTime(drop.started_at)}</span>
              <Link className="fleet-health-name" to={`/player/${drop.device_id}`}>
                {drop.name || drop.device_id}
              </Link>
              <span>{dropSummary(drop)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function dropSummary(drop: PresenceDrop): string {
  const duration = formatDropDuration(drop.duration_seconds);
  const fails = `${drop.peak_failures} fail${drop.peak_failures === 1 ? '' : 's'}`;
  const circuit = drop.slow_poll ? ' · slow-poll' : '';
  if (drop.ended_at == null) return `down ${duration} · ${fails}${circuit}`;
  return `${duration} · ${fails}${circuit} → recovered`;
}
