import { useEffect, useRef } from 'react';
import type { FleetHealthResponse, PlayerStatus, SyncState } from '@/api/types';
import { useFleetStore } from '@/store/fleetStore';
import { api } from '@/api/client';
import { apiToken } from '@/api/auth';

interface FleetEvent {
  type: string;
  data: unknown;
}

const MAX_RECONNECT_ATTEMPTS = 8;
const OFFLINE_RETRY_MS = 60_000;

function eventsUrl(): string {
  if (!apiToken) return '/api/v1/events';
  return `/api/v1/events?token=${encodeURIComponent(apiToken)}`;
}

function connectWithBackoff(
  onMessage: (event: FleetEvent) => void,
  onState: (state: 'connecting' | 'live' | 'reconnecting' | 'offline') => void,
  signal: AbortSignal,
): void {
  let attempt = 0;
  let source: EventSource | null = null;
  let timer: number | undefined;

  const cleanup = () => {
    if (timer) window.clearTimeout(timer);
    source?.close();
  };

  signal.addEventListener('abort', cleanup);

  const open = () => {
    if (signal.aborted) return;
    onState(attempt === 0 ? 'connecting' : 'reconnecting');
    source = new EventSource(eventsUrl());
    source.onopen = () => {
      attempt = 0;
      onState('live');
    };
    source.onmessage = (msg) => {
      try {
        onMessage(JSON.parse(msg.data) as FleetEvent);
      } catch {
        // ignore malformed
      }
    };
    source.onerror = () => {
      source?.close();
      attempt += 1;
      if (attempt >= MAX_RECONNECT_ATTEMPTS) {
        onState('offline');
        // Keep REST fallback running; retry SSE periodically instead of giving up.
        attempt = 0;
        timer = window.setTimeout(open, OFFLINE_RETRY_MS);
        return;
      }
      onState('reconnecting');
      const delay = Math.min(30_000, 1000 * 2 ** (attempt - 1)) + Math.random() * 250;
      timer = window.setTimeout(open, delay);
    };
  };

  open();
}

export function useLiveFleet(): void {
  const setFleet = useFleetStore((s) => s.setFleet);
  const upsertDevice = useFleetStore((s) => s.upsertDevice);
  const setConnection = useFleetStore((s) => s.setConnection);
  const setSync = useFleetStore((s) => s.setSync);
  const setHealth = useFleetStore((s) => s.setHealth);
  const load = useFleetStore((s) => s.load);
  const pollFallback = useRef<number | undefined>(undefined);

  useEffect(() => {
    void load();
    const controller = new AbortController();

    connectWithBackoff(
      (event) => {
        if (event.type === 'fleet') {
          const data = event.data as {
            devices: PlayerStatus[];
            discovered_at?: number | null;
            sync?: SyncState;
            health?: FleetHealthResponse;
          };
          setFleet(data.devices, data.discovered_at ?? null);
          if (data.sync) {
            setSync(data.sync);
          } else {
            void api.getSync().then(setSync).catch(() => undefined);
          }
          if (data.health) setHealth(data.health);
        } else if (event.type === 'device') {
          upsertDevice(event.data as PlayerStatus);
        }
      },
      (state) => {
        setConnection(state);
        if (state === 'reconnecting' || state === 'offline') {
          if (!pollFallback.current) {
            pollFallback.current = window.setInterval(() => {
              void load();
            }, 5000);
          }
        } else if (state === 'live' && pollFallback.current) {
          window.clearInterval(pollFallback.current);
          pollFallback.current = undefined;
        }
      },
      controller.signal,
    );

    return () => {
      controller.abort();
      if (pollFallback.current) window.clearInterval(pollFallback.current);
    };
  }, [load, setConnection, setFleet, setHealth, setSync, upsertDevice]);
}
