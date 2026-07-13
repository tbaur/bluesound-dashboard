import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { AudioInput, Preset, QueueResponse } from '@/api/types';
import { useFleetStore } from '@/store/fleetStore';
import { useLiveFleet } from '@/hooks/useLiveFleet';

export function PlayerDetailPage() {
  useLiveFleet();
  const { id = '' } = useParams();
  const device = useFleetStore((s) => s.devices.find((d) => d.id === id));
  const devices = useFleetStore((s) => s.devices);
  const control = useFleetStore((s) => s.control);
  const toggleMute = useFleetStore((s) => s.toggleMute);
  const reloadStatus = useFleetStore((s) => s.reloadStatus);

  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [inputs, setInputs] = useState<AudioInput[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [bluetooth, setBluetooth] = useState<string>('');
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.allSettled([
        api.getQueue(id),
        api.getInputs(id),
        api.getPresets(id),
        api.getBluetooth(id),
      ]);
      if (cancelled) return;
      const failures: string[] = [];
      const [q, i, p, b] = results;
      if (q.status === 'fulfilled') setQueue(q.value);
      else failures.push('queue');
      if (i.status === 'fulfilled') setInputs(i.value);
      else failures.push('inputs');
      if (p.status === 'fulfilled') setPresets(p.value);
      else failures.push('presets');
      if (b.status === 'fulfilled') setBluetooth(b.value.mode);
      else failures.push('bluetooth');
      setDetailError(
        failures.length
          ? `Failed to load: ${failures.join(', ')}`
          : null,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [id, device?.state, device?.track]);

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

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <Link to="/" className="card-meta">
            ← Fleet
          </Link>
          <h1 className="brand" style={{ fontSize: '2rem', marginTop: 8 }}>
            {device.name}
          </h1>
          <p className="brand-sub">
            {device.full_model || device.model} · {device.ip} · fw {device.fw || 'n/a'}
          </p>
        </div>
        <div className="header-actions">
          {device.sync_role !== 'standalone' && (
            <span className="badge" data-role={device.sync_role}>
              {device.sync_role}
            </span>
          )}
        </div>
      </header>

      {detailError && <div className="error-banner">{detailError}</div>}

      <div className="detail-layout">
        <section className="panel">
          <h2>Now playing</h2>
          <p>
            <strong>{device.track || 'Nothing playing'}</strong>
            <br />
            <span className="card-meta">
              {[device.artist, device.album, device.service, device.state]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </p>
          <div className="transport">
            <button
              type="button"
              className="btn"
              onClick={() => void control(device.id, () => api.back(device.id))}
            >
              Prev
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                void control(
                  device.id,
                  () =>
                    device.state === 'play' || device.state === 'stream'
                      ? api.pause(device.id)
                      : api.play(device.id),
                  {
                    state:
                      device.state === 'play' || device.state === 'stream' ? 'pause' : 'play',
                  },
                )
              }
            >
              {device.state === 'play' || device.state === 'stream' ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                void control(device.id, () => api.stop(device.id), { state: 'stop' })
              }
            >
              Stop
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void control(device.id, () => api.skip(device.id))}
            >
              Next
            </button>
          </div>
          <div className="volume-row" style={{ marginTop: 16 }}>
            <label htmlFor="detail-vol">Volume</label>
            <input
              id="detail-vol"
              type="range"
              min={0}
              max={100}
              value={device.volume}
              onPointerDown={() => useFleetStore.getState().holdVolume(device.id)}
              onChange={(e) => {
                const level = Number(e.target.value);
                void control(device.id, () => api.setVolume(device.id, level), {
                  volume: level,
                });
              }}
            />
            <button
              type="button"
              className="btn"
              onClick={() => void toggleMute(device.id)}
            >
              {device.muted ? 'Unmute' : 'Mute'}
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Queue</h2>
          {!queue || queue.count === 0 ? (
            <div className="empty">Queue is empty</div>
          ) : (
            <ul className="list">
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

        <section className="panel">
          <h2>Inputs</h2>
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

        <section className="panel">
          <h2>Presets</h2>
          <ul className="list">
            {presets.map((preset) => (
              <li key={preset.id}>
                <span>{preset.name || `Preset ${preset.id}`}</span>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    void control(device.id, () => api.playPreset(device.id, preset.id))
                  }
                >
                  Play
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Bluetooth</h2>
          <p className="card-meta">Current mode: {bluetooth || 'Unknown'}</p>
          <div className="transport">
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
                className="btn"
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

        <section className="panel">
          <h2>Sync</h2>
          <p className="card-meta">
            Role: {device.sync_role}
            {device.group ? ` · ${device.group}` : ''}
          </p>
          {device.sync_role === 'synced' && device.master && (
            <div className="transport" style={{ marginBottom: 12 }}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const primary = devices.find((d) => d.ip === device.master);
                  if (!primary) return;
                  void control(device.id, async () => {
                    await api.syncRemove(primary.id, device.id);
                    await reloadStatus();
                  });
                }}
              >
                Leave group
              </button>
            </div>
          )}
          <label htmlFor="sync-target">Add player as slave</label>
          <div className="transport" style={{ marginTop: 8 }}>
            <select
              id="sync-target"
              defaultValue=""
              onChange={(e) => {
                const slaveId = e.target.value;
                if (!slaveId) return;
                void control(device.id, async () => {
                  await api.syncAdd(device.id, slaveId);
                  await reloadStatus();
                });
                e.target.value = '';
              }}
            >
              <option value="">Select player…</option>
              {devices
                .filter((d) => d.id !== device.id)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </div>
        </section>
      </div>
    </div>
  );
}
