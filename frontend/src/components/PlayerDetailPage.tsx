import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { AudioInput, Preset, QueueResponse } from '@/api/types';
import { useFleetStore } from '@/store/fleetStore';
import { useLiveFleet } from '@/hooks/useLiveFleet';

function formatClock(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function qualityLabel(quality: string, streamFormat: string): string {
  const parts: string[] = [];
  if (streamFormat) parts.push(streamFormat);
  if (quality) {
    if (/^\d+$/.test(quality)) parts.push(`${quality} kbps`);
    else parts.push(quality.toUpperCase());
  }
  return parts.join(' · ');
}

export function PlayerDetailPage() {
  useLiveFleet();
  const { id = '' } = useParams();
  const device = useFleetStore((s) => s.devices.find((d) => d.id === id));
  const devices = useFleetStore((s) => s.devices);
  const control = useFleetStore((s) => s.control);
  const toggleMute = useFleetStore((s) => s.toggleMute);

  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [inputs, setInputs] = useState<AudioInput[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [bluetooth, setBluetooth] = useState('');
  const [uptime, setUptime] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [progressSecs, setProgressSecs] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.allSettled([
        api.getQueue(id),
        api.getInputs(id),
        api.getPresets(id),
        api.getBluetooth(id),
        api.diagnose(id),
      ]);
      if (cancelled) return;
      const failures: string[] = [];
      const [q, i, p, b, d] = results;
      if (q.status === 'fulfilled') setQueue(q.value);
      else failures.push('queue');
      if (i.status === 'fulfilled') setInputs(i.value);
      else failures.push('inputs');
      if (p.status === 'fulfilled') setPresets(p.value);
      else failures.push('presets');
      if (b.status === 'fulfilled') setBluetooth(b.value.mode);
      else failures.push('bluetooth');
      if (d.status === 'fulfilled') setUptime(d.value.uptime);
      else failures.push('diagnostics');
      setDetailError(failures.length ? `Failed to load: ${failures.join(', ')}` : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    setProgressSecs(device?.secs ?? 0);
  }, [device?.id, device?.secs, device?.track, device?.state]);

  useEffect(() => {
    if (!device || !['play', 'stream'].includes(device.state)) return;
    const timer = window.setInterval(() => {
      setProgressSecs((prev) => {
        if (device.totlen > 0) return Math.min(prev + 1, device.totlen);
        return prev + 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [device?.id, device?.state, device?.totlen]);

  if (!device) {
    return (
      <div className="app-shell">
        <Link to="/">← Fleet</Link>
        <div className="empty" style={{ marginTop: 16 }}>
          Player not found. It may have left the network.
        </div>
      </div>
    );
  }

  const primary = device.master
    ? devices.find((d) => d.ip === device.master)
    : null;
  const playing = ['play', 'stream', 'connecting'].includes(device.state);
  const progressPct =
    device.totlen > 0 ? Math.min(100, (progressSecs / device.totlen) * 100) : 0;
  const activeInput = inputs.find((input) => input.selected);
  const metaLine = qualityLabel(device.quality, device.stream_format);

  return (
    <div className="app-shell dossier">
      <header className="dossier-header">
        <div>
          <Link to="/" className="card-meta">
            ← Fleet
          </Link>
          <h1 className="brand dossier-title">{device.name}</h1>
          <p className="brand-sub">
            {[device.full_model || device.model, device.fw ? `fw ${device.fw}` : '']
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="dossier-header-badges">
          <span className="badge" data-role={device.status === 'online' ? 'primary' : undefined}>
            {device.status}
          </span>
          {device.sync_role !== 'standalone' && (
            <span className="badge" data-role={device.sync_role}>
              {device.sync_role}
            </span>
          )}
        </div>
      </header>

      {detailError && <div className="error-banner">{detailError}</div>}

      <section className="panel dossier-now">
        <div className="dossier-now-grid">
          <div className="dossier-art" aria-hidden={!device.image}>
            {device.image ? (
              <img src={device.image} alt="" />
            ) : (
              <div className="dossier-art-empty">No artwork</div>
            )}
          </div>
          <div className="dossier-now-copy">
            <p className="card-meta">Now playing</p>
            <h2>{device.track || 'Nothing playing'}</h2>
            <p className="dossier-now-meta">
              {[device.artist, device.album].filter(Boolean).join(' · ') || '—'}
            </p>
            <p className="card-meta">
              {[device.service || null, activeInput ? `Input ${activeInput.name}` : null, metaLine || null, device.state]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {device.totlen > 0 && (
              <div className="dossier-progress">
                <div className="dossier-progress-track">
                  <div className="dossier-progress-fill" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="dossier-progress-times">
                  <span>{formatClock(progressSecs)}</span>
                  <span>{formatClock(device.totlen)}</span>
                </div>
              </div>
            )}
            <div className="transport" style={{ marginTop: 14 }}>
              <button type="button" className="btn" onClick={() => void control(device.id, () => api.back(device.id))}>
                Prev
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  void control(
                    device.id,
                    () => api.toggle(device.id),
                    { state: playing ? 'pause' : 'play' },
                  )
                }
              >
                {playing ? 'Pause' : 'Play'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void control(device.id, () => api.stop(device.id), { state: 'stop' })}
              >
                Stop
              </button>
              <button type="button" className="btn" onClick={() => void control(device.id, () => api.skip(device.id))}>
                Next
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Device</h2>
        <dl className="dossier-metrics">
          <div>
            <dt>Volume</dt>
            <dd>
              {device.volume}%
              {device.db ? ` · ${device.db} dB` : ''}
              {device.muted ? ' · muted' : ''}
            </dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>
              {device.ip}
              {device.mac ? ` · ${device.mac}` : ''}
            </dd>
          </div>
          <div>
            <dt>Uptime</dt>
            <dd>{uptime || '—'}</dd>
          </div>
          <div>
            <dt>Sync</dt>
            <dd>
              {device.sync_role}
              {device.group ? ` · ${device.group}` : ''}
              {device.sync_role === 'synced' && primary ? ` · follows ${primary.name}` : ''}
              {device.sync_role === 'primary' && device.slaves.length > 0
                ? ` · ${device.slaves.length} follower${device.slaves.length === 1 ? '' : 's'}`
                : ''}
            </dd>
          </div>
          {device.battery != null && device.battery !== '' && (
            <div>
              <dt>Battery</dt>
              <dd>{device.battery}%</dd>
            </div>
          )}
          {device.input_type_index && (
            <div>
              <dt>Capture input</dt>
              <dd>{activeInput?.name || device.input_type_index}</dd>
            </div>
          )}
        </dl>
        <div className="volume-row" style={{ marginTop: 16 }}>
          <input
            type="range"
            min={0}
            max={100}
            value={device.volume}
            onPointerDown={() => useFleetStore.getState().holdVolume(device.id)}
            onChange={(e) => {
              const level = Number(e.target.value);
              void control(device.id, () => api.setVolume(device.id, level), { volume: level });
            }}
          />
          <button type="button" className="btn" onClick={() => void toggleMute(device.id)}>
            {device.muted ? 'Unmute' : 'Mute'}
          </button>
        </div>
      </section>

      <details className="panel panel-collapse">
        <summary>
          <h2>Advanced</h2>
          <span className="card-meta">
            queue {queue?.count ?? 0} · inputs {inputs.length} · presets {presets.length}
          </span>
        </summary>

        <div className="dossier-advanced">
          <section>
            <h3>Queue</h3>
            {!queue || queue.count === 0 ? (
              <div className="empty">Queue is empty</div>
            ) : (
              <ul className="list list-scroll">
                {queue.items.map((item, index) => (
                  <li key={`${item.title}-${index}`}>
                    <span>
                      {item.title}
                      <div className="card-meta">{item.artist}</div>
                    </span>
                    <span className="queue-move">
                      <button
                        type="button"
                        className="btn btn-compact"
                        disabled={index === 0}
                        aria-label={`Move ${item.title} up`}
                        onClick={() =>
                          void control(device.id, async () => {
                            await api.moveQueueItem(device.id, index, index - 1);
                            setQueue(await api.getQueue(device.id));
                          })
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn-compact"
                        disabled={index >= queue.items.length - 1}
                        aria-label={`Move ${item.title} down`}
                        onClick={() =>
                          void control(device.id, async () => {
                            await api.moveQueueItem(device.id, index, index + 1);
                            setQueue(await api.getQueue(device.id));
                          })
                        }
                      >
                        ↓
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="btn btn-danger"
              style={{ marginTop: 12 }}
              onClick={() => {
                if (window.confirm('Clear the queue on this player?')) {
                  void control(device.id, async () => {
                    await api.clearQueue(device.id);
                    setQueue(await api.getQueue(device.id));
                  });
                }
              }}
            >
              Clear queue
            </button>
          </section>

          <section>
            <h3>Inputs</h3>
            <ul className="list">
              {inputs.map((input) => (
                <li key={input.id || input.name} data-selected={String(input.selected)}>
                  <span>
                    {input.name}
                    <div className="card-meta">{input.id || input.type}</div>
                  </span>
                  <button
                    type="button"
                    className={input.selected ? 'btn btn-primary' : 'btn'}
                    disabled={input.selected}
                    onClick={() =>
                      void control(device.id, async () => {
                        await api.setInput(device.id, input.id || input.name);
                        setInputs(await api.getInputs(device.id));
                      })
                    }
                  >
                    {input.selected ? 'In use' : 'Select'}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3>Presets</h3>
            {presets.length === 0 ? (
              <div className="empty">No presets</div>
            ) : (
              <ul className="list">
                {presets.map((preset) => (
                  <li key={preset.id}>
                    <span>{preset.name || `Preset ${preset.id}`}</span>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void control(device.id, () => api.playPreset(device.id, preset.id))}
                    >
                      Play
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3>Bluetooth</h3>
            <p className="card-meta">Current mode: {bluetooth || 'Unknown'}</p>
            <div className="transport" style={{ marginTop: 8 }}>
              {(
                [
                  [0, 'Manual'],
                  [1, 'Automatic'],
                  [2, 'Guest'],
                  [3, 'Disabled'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={bluetooth === label ? 'btn btn-primary' : 'btn'}
                  onClick={() =>
                    void control(device.id, async () => {
                      await api.setBluetooth(device.id, mode);
                      setBluetooth((await api.getBluetooth(device.id)).mode);
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3>Maintenance</h3>
            <div className="transport">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (window.confirm(`Soft reboot ${device.name}?`)) {
                    void control(device.id, () => api.reboot(device.id, true));
                  }
                }}
              >
                Soft reboot
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  if (window.confirm(`Hard reboot ${device.name}?`)) {
                    void control(device.id, () => api.reboot(device.id, false));
                  }
                }}
              >
                Hard reboot
              </button>
            </div>
          </section>
        </div>
      </details>
    </div>
  );
}
