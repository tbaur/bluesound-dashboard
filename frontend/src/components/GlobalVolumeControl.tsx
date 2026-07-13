import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fleetHasActivePlayback,
  fleetHouseStatus,
  fleetHouseStatusLine,
} from '@/lib/fleetStatus';
import { useFleetStore } from '@/store/fleetStore';
import { VolumeNudgeButtons } from '@/components/VolumeNudgeButtons';

function medianVolume(volumes: number[]): number {
  if (volumes.length === 0) return 0;
  const sorted = [...volumes].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

function GlobalVolumePanel() {
  const devices = useFleetStore((s) => s.devices);
  const setFleetVolume = useFleetStore((s) => s.setFleetVolume);
  const holdAllVolumes = useFleetStore((s) => s.holdAllVolumes);
  const commitTimer = useRef<number | undefined>(undefined);
  const latestLevel = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);

  const fleetMedian = medianVolume(devices.map((d) => d.volume));
  const [draft, setDraft] = useState(fleetMedian);
  const [trackedMedian, setTrackedMedian] = useState(fleetMedian);
  const volumesMatch =
    devices.length > 0 && devices.every((d) => d.volume === devices[0].volume);

  if (!dragging && !pending && fleetMedian !== trackedMedian) {
    setTrackedMedian(fleetMedian);
    setDraft(fleetMedian);
  }

  useEffect(() => {
    latestLevel.current = draft;
  }, [draft]);

  const flush = (level: number) => {
    setPending(true);
    void setFleetVolume(level).finally(() => setPending(false));
  };

  const onInput = (level: number) => {
    latestLevel.current = level;
    setDraft(level);
    holdAllVolumes(5000);
    if (commitTimer.current) window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => {
      commitTimer.current = undefined;
      flush(level);
    }, 80);
  };

  const endDrag = () => {
    setDragging(false);
    if (commitTimer.current) {
      window.clearTimeout(commitTimer.current);
      commitTimer.current = undefined;
    }
    flush(latestLevel.current);
  };

  return (
    <section className="fleet-bar-panel" aria-labelledby="global-volume-heading">
      <div className="fleet-bar-panel-head">
        <h2 id="global-volume-heading">Global volume</h2>
        <span className="card-meta">
          {pending ? (
            'Syncing…'
          ) : dragging ? (
            <>All → {draft}</>
          ) : volumesMatch ? (
            <>
              All → {draft}
              <span className="volume-linked-pill">linked</span>
            </>
          ) : (
            <>
              Median {fleetMedian}
              <button
                type="button"
                className="volume-linked-pill volume-linked-pill-action"
                disabled={pending}
                title={`Set every player to median volume ${fleetMedian}`}
                onClick={() => {
                  setDraft(fleetMedian);
                  latestLevel.current = fleetMedian;
                  holdAllVolumes(5000);
                  flush(fleetMedian);
                }}
              >
                re-sync → {fleetMedian}
              </button>
            </>
          )}
        </span>
      </div>
      <div className="volume-row global-volume-row">
        <VolumeNudgeButtons
          value={draft}
          disabled={pending}
          onChange={(level) => onInput(level)}
        />
        <label htmlFor="global-vol">Vol</label>
        <input
          id="global-vol"
          type="range"
          min={0}
          max={100}
          value={draft}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={draft}
          aria-label="Set volume on all Bluesound players"
          onPointerDown={() => {
            setDragging(true);
            holdAllVolumes(5000);
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onChange={(e) => onInput(Number(e.target.value))}
        />
        <span className="global-volume-value" title={`${draft}%`}>
          {draft}
        </span>
      </div>
    </section>
  );
}

function FleetActionsPanel() {
  const devices = useFleetStore((s) => s.devices);
  const sync = useFleetStore((s) => s.sync);
  const fleetMuteAll = useFleetStore((s) => s.fleetMuteAll);
  const fleetPauseAll = useFleetStore((s) => s.fleetPauseAll);
  const fleetStopAll = useFleetStore((s) => s.fleetStopAll);
  const [busy, setBusy] = useState<string | null>(null);

  const allMuted = devices.length > 0 && devices.every((d) => d.muted);
  const anyPlaying = fleetHasActivePlayback(devices);
  const status = fleetHouseStatus(devices, sync);
  const statusTitle = fleetHouseStatusLine(devices, sync);

  const run = (key: string, action: () => Promise<void>) => {
    setBusy(key);
    void action().finally(() => setBusy(null));
  };

  return (
    <section
      className="fleet-bar-panel house-remote"
      aria-labelledby="fleet-actions-heading"
      data-idle={status.isIdle ? 'true' : 'false'}
    >
      <div className="house-remote-head">
        <div className="house-remote-title-row">
          <h2 id="fleet-actions-heading">
            <Link to="/house" className="house-remote-title-link">
              House remote
            </Link>
          </h2>
          {status.meta.length > 0 ? (
            <ul className="house-remote-meta" aria-label="House status">
              {status.meta.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <p className="house-remote-primary" title={statusTitle}>
          <Link to="/house" className="house-remote-status-link">
            {status.primary}
          </Link>
        </p>
        {status.detail ? (
          <p className="house-remote-detail" title={status.detail}>
            {status.detail}
          </p>
        ) : null}
        <p className="house-remote-open">
          <Link to="/house" className="card-meta">
            Open house →
          </Link>
        </p>
      </div>
      <div className="fleet-actions house-remote-actions" role="group" aria-label="House transport">
        <button
          type="button"
          className="btn"
          disabled={busy !== null}
          onClick={() => run('mute', () => fleetMuteAll(!allMuted))}
        >
          {busy === 'mute' ? '…' : allMuted ? 'Unmute' : 'Mute'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy !== null || !anyPlaying}
          title={anyPlaying ? 'Pause all playing rooms' : 'Nothing playing'}
          onClick={() => run('pause', () => fleetPauseAll())}
        >
          {busy === 'pause' ? '…' : 'Pause'}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy !== null}
          title="Stop playback on every player"
          onClick={() => run('stop', () => fleetStopAll())}
        >
          {busy === 'stop' ? '…' : 'Stop'}
        </button>
      </div>
    </section>
  );
}

/** Compact global volume (left) + fleet-wide mute/pause/stop (right). */
export function FleetBar() {
  const devices = useFleetStore((s) => s.devices);
  if (devices.length === 0) return null;

  return (
    <div className="fleet-bar">
      <GlobalVolumePanel />
      <FleetActionsPanel />
    </div>
  );
}

/** @deprecated Use FleetBar — kept name for any lingering imports */
export function GlobalVolumeControl() {
  return <FleetBar />;
}
