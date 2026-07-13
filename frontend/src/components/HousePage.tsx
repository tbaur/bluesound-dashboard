import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import type { FleetUpgradeResponse, UpgradeStatus } from '@/api/types';
import { ApiError } from '@/api/types';
import { sortDevices } from '@/lib/fleetSort';
import {
  fleetHasActivePlayback,
  fleetHouseStatus,
  fleetHouseStatusLine,
} from '@/lib/fleetStatus';
import { useFleetStore } from '@/store/fleetStore';
import { useLiveFleet } from '@/hooks/useLiveFleet';

function compareFw(a: string, b: string): number {
  const pa = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function HousePage() {
  useLiveFleet();
  const devices = useFleetStore((s) => s.devices);
  const sync = useFleetStore((s) => s.sync);
  const loading = useFleetStore((s) => s.loading);
  const refreshing = useFleetStore((s) => s.refreshing);
  const toast = useFleetStore((s) => s.toast);
  const setToast = useFleetStore((s) => s.setToast);
  const refresh = useFleetStore((s) => s.refresh);
  const reloadStatus = useFleetStore((s) => s.reloadStatus);
  const holdSync = useFleetStore((s) => s.holdSync);
  const fleetMuteAll = useFleetStore((s) => s.fleetMuteAll);
  const fleetPauseAll = useFleetStore((s) => s.fleetPauseAll);
  const fleetStopAll = useFleetStore((s) => s.fleetStopAll);
  const fleetRebootAll = useFleetStore((s) => s.fleetRebootAll);

  const [busy, setBusy] = useState<string | null>(null);
  const [upgradeReport, setUpgradeReport] = useState<FleetUpgradeResponse | null>(null);

  const status = fleetHouseStatus(devices, sync);
  const statusTitle = fleetHouseStatusLine(devices, sync);
  const allMuted = devices.length > 0 && devices.every((d) => d.muted);
  const anyPlaying = fleetHasActivePlayback(devices);
  const groupCount = sync?.groups.length ?? 0;
  const sorted = useMemo(() => sortDevices(devices, 'name'), [devices]);

  const firmware = useMemo(() => {
    const versions = sorted.map((d) => d.fw).filter(Boolean);
    const unique = [...new Set(versions)].sort(compareFw);
    const newest = unique.length ? unique[unique.length - 1] : '';
    const byId = new Map<string, UpgradeStatus>();
    for (const row of upgradeReport?.results ?? []) {
      byId.set(row.device_id, row);
    }
    return { unique, newest, skew: unique.length > 1, byId };
  }, [sorted, upgradeReport]);

  const run = (key: string, action: () => Promise<void>) => {
    setBusy(key);
    void action().finally(() => setBusy(null));
  };

  const breakAll = async () => {
    holdSync(8000);
    try {
      await api.syncBreak();
      await reloadStatus();
    } catch (err) {
      setToast(
        err instanceof ApiError ? `${err.message} (${err.requestId})` : 'Break all failed',
      );
    }
  };

  const checkUpgrades = async () => {
    try {
      const report = await api.fleetUpgrades();
      setUpgradeReport(report);
      if (report.updates_available > 0) {
        setToast(
          `Firmware: ${report.updates_available} update${report.updates_available === 1 ? '' : 's'} available`,
        );
      } else if (report.failed > 0) {
        setToast(`Firmware check: ${report.checked} ok, ${report.failed} failed`);
      } else {
        setToast('Firmware: no updates available');
      }
    } catch (err) {
      setToast(
        err instanceof ApiError
          ? `${err.message} (${err.requestId})`
          : 'Firmware check failed',
      );
    }
  };

  if (loading && devices.length === 0) {
    return (
      <div className="app-shell">
        <Link to="/" className="card-meta">
          ← Fleet
        </Link>
        <div className="empty" style={{ marginTop: 16 }}>
          Discovering players…
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell dossier">
      <header className="dossier-header">
        <div>
          <Link to="/" className="card-meta">
            ← Fleet
          </Link>
          <h1 className="brand dossier-title">House</h1>
          <p className="brand-sub" title={statusTitle}>
            {status.primary}
            {status.detail ? ` — ${status.detail}` : ''}
          </p>
        </div>
        <div className="dossier-header-badges">
          <span className="badge" data-role="primary">
            {devices.length} player{devices.length === 1 ? '' : 's'}
          </span>
          {status.meta.map((item) => (
            <span key={item} className="badge">
              {item}
            </span>
          ))}
        </div>
      </header>

      {toast ? (
        <div className="toast" role="status">
          {toast}
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn" onClick={() => setToast(null)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <section className="panel">
        <h2>At a glance</h2>
        <dl className="dossier-metrics">
          <div>
            <dt>Players</dt>
            <dd>{devices.length}</dd>
          </div>
          <div>
            <dt>Playing</dt>
            <dd>{devices.filter((d) => d.state === 'play' || d.state === 'stream').length}</dd>
          </div>
          <div>
            <dt>Groups</dt>
            <dd>{groupCount}</dd>
          </div>
          <div>
            <dt>Muted</dt>
            <dd>{devices.filter((d) => d.muted).length}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <h2>Firmware</h2>
        <p className="card-meta" style={{ marginBottom: 12 }}>
          {firmware.unique.length === 0
            ? 'No firmware versions reported yet.'
            : firmware.skew
              ? `Version skew across the house: ${firmware.unique.join(', ')}.`
              : `All reported players on ${firmware.unique[0]}.`}
          {upgradeReport
            ? ` Last check: ${upgradeReport.updates_available} update${upgradeReport.updates_available === 1 ? '' : 's'} available${upgradeReport.failed ? `, ${upgradeReport.failed} failed` : ''}.`
            : ' Use Check all to query each player’s upgrade page.'}{' '}
          Installs still require the BluOS Controller app.
        </p>
        <ul className="house-room-list">
          {sorted.map((device) => {
            const row = firmware.byId.get(device.id);
            const behind = Boolean(
              firmware.newest && device.fw && compareFw(device.fw, firmware.newest) < 0,
            );
            let note = '';
            if (row) {
              if (!row.ok) note = ' · check failed';
              else if (row.update_available) note = ' · update available';
              else note = ' · up to date';
            } else if (behind) {
              note = ' · behind house newest';
            }
            return (
              <li key={device.id}>
                <Link to={`/player/${device.id}`}>
                  <span>{device.name}</span>
                  <span className="card-meta">
                    {device.fw || 'fw ?'}
                    {note}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="fleet-actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn"
            disabled={busy !== null || devices.length === 0}
            onClick={() => run('upgrade', checkUpgrades)}
          >
            {busy === 'upgrade' ? 'Checking…' : 'Check all for upgrades'}
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Transport</h2>
        <p className="card-meta" style={{ marginBottom: 12 }}>
          Same controls as the fleet House remote — mute, pause, or stop every player.
        </p>
        <div className="fleet-actions" role="group" aria-label="House transport">
          <button
            type="button"
            className="btn"
            disabled={busy !== null || devices.length === 0}
            onClick={() => run('mute', () => fleetMuteAll(!allMuted))}
          >
            {busy === 'mute' ? '…' : allMuted ? 'Unmute all' : 'Mute all'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy !== null || !anyPlaying}
            onClick={() => run('pause', () => fleetPauseAll())}
          >
            {busy === 'pause' ? '…' : 'Pause all'}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy !== null || devices.length === 0}
            onClick={() => run('stop', () => fleetStopAll())}
          >
            {busy === 'stop' ? '…' : 'Stop all'}
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Groups</h2>
        <p className="card-meta" style={{ marginBottom: 12 }}>
          Dissolve every multi-room group. Create or edit groups from the fleet Sync panel.
        </p>
        <button
          type="button"
          className="btn"
          disabled={busy !== null || groupCount === 0}
          onClick={() => {
            if (
              !window.confirm(
                `Break all ${groupCount} sync group${groupCount === 1 ? '' : 's'}?`,
              )
            ) {
              return;
            }
            run('break', breakAll);
          }}
        >
          {busy === 'break' ? '…' : 'Break all groups'}
        </button>
      </section>

      <section className="panel">
        <h2>Maintenance</h2>
        <p className="card-meta" style={{ marginBottom: 12 }}>
          Rescan the LAN, or reboot every player. Soft is gentler; hard fully restarts each device.
        </p>
        <div className="fleet-actions" role="group" aria-label="House maintenance">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy !== null || refreshing}
            onClick={() => run('rescan', () => refresh())}
          >
            {busy === 'rescan' || refreshing ? 'Scanning…' : 'Rescan network'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy !== null || devices.length === 0}
            onClick={() => {
              if (
                !window.confirm(
                  `Soft reboot all ${devices.length} player${devices.length === 1 ? '' : 's'}?`,
                )
              ) {
                return;
              }
              run('soft', () => fleetRebootAll(true));
            }}
          >
            {busy === 'soft' ? '…' : 'Soft reboot all'}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy !== null || devices.length === 0}
            onClick={() => {
              if (
                !window.confirm(
                  `Hard reboot all ${devices.length} player${devices.length === 1 ? '' : 's'}? This fully restarts each device.`,
                )
              ) {
                return;
              }
              run('hard', () => fleetRebootAll(false));
            }}
          >
            {busy === 'hard' ? '…' : 'Hard reboot all'}
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Rooms</h2>
        <ul className="house-room-list">
          {sorted.map((device) => (
            <li key={device.id}>
              <Link to={`/player/${device.id}`}>
                <span>{device.name}</span>
                <span className="card-meta">
                  {device.status}
                  {device.state ? ` · ${device.state}` : ''}
                  {` · vol ${device.volume}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
