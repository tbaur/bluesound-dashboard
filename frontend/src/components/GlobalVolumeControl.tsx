import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { PlayerStatus } from '@/api/types';
import {
  fleetHasActivePlayback,
  fleetHouseStatus,
  fleetHouseStatusLine,
} from '@/lib/fleetStatus';
import { partitionVolumeGroups } from '@/lib/deviceGroups';
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

type GroupVolumePanelProps = {
  title: string;
  scopeLabel: string;
  devices: PlayerStatus[];
  inputId: string;
  ariaLabel: string;
};

function GroupVolumePanel({
  title,
  scopeLabel,
  devices,
  inputId,
  ariaLabel,
}: GroupVolumePanelProps) {
  const setFleetVolume = useFleetStore((s) => s.setFleetVolume);
  const holdVolumes = useFleetStore((s) => s.holdVolumes);
  const commitTimer = useRef<number | undefined>(undefined);
  const latestLevel = useRef(0);
  const deviceIdsRef = useRef<string[]>([]);
  const flushGeneration = useRef(0);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [dragDraft, setDragDraft] = useState<number | null>(null);

  const deviceIds = useMemo(() => devices.map((d) => d.id), [devices]);
  useEffect(() => {
    deviceIdsRef.current = deviceIds;
  }, [deviceIds]);

  const fleetMedian = medianVolume(devices.map((d) => d.volume));
  const display = dragDraft ?? fleetMedian;
  const volumesMatch =
    devices.length > 0 && devices.every((d) => d.volume === devices[0].volume);
  const headingId = `${inputId}-heading`;

  useEffect(() => {
    latestLevel.current = display;
  }, [display]);

  useEffect(
    () => () => {
      if (commitTimer.current) window.clearTimeout(commitTimer.current);
      flushGeneration.current += 1;
    },
    [],
  );

  const flush = (level: number) => {
    const ids = deviceIdsRef.current.slice();
    if (ids.length === 0) return;
    const generation = ++flushGeneration.current;
    setPending(true);
    holdVolumes(ids, 5000);
    void setFleetVolume(level, ids).finally(() => {
      // Only the latest in-flight flush owns the Syncing… indicator.
      if (generation !== flushGeneration.current) return;
      setPending(false);
      setDragDraft(null);
    });
  };

  const scheduleFlush = (level: number) => {
    latestLevel.current = level;
    setDragDraft(level);
    holdVolumes(deviceIdsRef.current, 5000);
    if (commitTimer.current) window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => {
      commitTimer.current = undefined;
      flush(latestLevel.current);
    }, 80);
  };

  const endDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    if (commitTimer.current) {
      window.clearTimeout(commitTimer.current);
      commitTimer.current = undefined;
    }
    flush(latestLevel.current);
  };

  if (devices.length === 0) return null;

  return (
    <section className="fleet-bar-panel" aria-labelledby={headingId}>
      <div className="fleet-bar-panel-head">
        <h2 id={headingId}>{title}</h2>
        <span className="card-meta">
          {pending ? (
            'Syncing…'
          ) : dragging ? (
            <>
              {scopeLabel} → {display}
            </>
          ) : volumesMatch ? (
            <>
              {scopeLabel} → {display}
              <span className="volume-linked-pill">linked</span>
            </>
          ) : (
            <>
              Median {fleetMedian}
              <button
                type="button"
                className="volume-linked-pill volume-linked-pill-action"
                disabled={pending}
                title={`Set ${scopeLabel.toLowerCase()} to median volume ${fleetMedian}`}
                onClick={() => {
                  setDragDraft(fleetMedian);
                  latestLevel.current = fleetMedian;
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
          value={display}
          disabled={pending}
          onChange={(level) => scheduleFlush(level)}
        />
        <label htmlFor={inputId}>Vol</label>
        <input
          id={inputId}
          type="range"
          min={0}
          max={100}
          value={display}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={display}
          aria-label={ariaLabel}
          onPointerDown={() => {
            draggingRef.current = true;
            setDragging(true);
            setDragDraft(fleetMedian);
            latestLevel.current = fleetMedian;
            holdVolumes(deviceIdsRef.current, 5000);
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onChange={(e) => scheduleFlush(Number(e.target.value))}
        />
        <span className="global-volume-value" title={`${display}%`}>
          {display}
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

  const showArt = status.hasDominantStream && !status.isIdle;
  const artHref = status.leadId ? `/player/${status.leadId}` : '/house';

  return (
    <section
      className="fleet-bar-panel house-remote"
      aria-labelledby="fleet-actions-heading"
      data-idle={status.isIdle ? 'true' : 'false'}
      data-art={showArt ? 'true' : 'false'}
      data-dominant={status.hasDominantStream ? 'true' : 'false'}
    >
      <div className="house-remote-body">
        {showArt ? (
          <Link
            to={artHref}
            className="house-remote-art"
            aria-label={
              status.image
                ? `Now playing artwork — open ${status.primary}`
                : `Open ${status.primary}`
            }
          >
            {status.image ? (
              <img
                key={status.image}
                src={status.image}
                alt=""
                className="house-remote-art-img"
              />
            ) : (
              <span className="house-remote-art-empty" aria-hidden="true">
                <span className="house-remote-art-glyph" />
              </span>
            )}
          </Link>
        ) : null}
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
        </div>
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

/** Grouped volume controls (left) + fleet-wide mute/pause/stop (right). */
export function FleetBar() {
  const devices = useFleetStore((s) => s.devices);
  const { residential, ciS2 } = useMemo(() => partitionVolumeGroups(devices), [devices]);
  if (devices.length === 0) return null;

  return (
    <div className="fleet-bar">
      <div className="fleet-bar-volumes">
        {residential.length > 0 ? (
          <GroupVolumePanel
            title="Global volume"
            scopeLabel="Rooms"
            devices={residential}
            inputId="global-vol"
            ariaLabel="Set volume on residential Bluesound players"
          />
        ) : null}
        {ciS2.length > 0 ? (
          <GroupVolumePanel
            title="CI S2 volume"
            scopeLabel="S2 zones"
            devices={ciS2}
            inputId="ci-s2-vol"
            ariaLabel="Set volume on NAD CI S2 zones"
          />
        ) : null}
      </div>
      <FleetActionsPanel />
    </div>
  );
}

/** @deprecated Use FleetBar — kept name for any lingering imports */
export function GlobalVolumeControl() {
  return <FleetBar />;
}
