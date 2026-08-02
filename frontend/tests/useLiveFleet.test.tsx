import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveFleet } from '@/hooks/useLiveFleet';
import { useFleetStore } from '@/store/fleetStore';

const load = vi.fn();
const getSync = vi.fn();

vi.mock('@/api/client', () => ({
  api: {
    getSync: (...args: unknown[]) => getSync(...args),
  },
}));

type HandlerMap = {
  onopen: ((ev?: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onerror: ((ev?: Event) => void) | null;
};

class MockEventSource {
  static instances: MockEventSource[] = [];
  onopen: HandlerMap['onopen'] = null;
  onmessage: HandlerMap['onmessage'] = null;
  onerror: HandlerMap['onerror'] = null;
  closed = false;

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

describe('useLiveFleet', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
    load.mockReset();
    getSync.mockReset();
    load.mockResolvedValue(undefined);
    getSync.mockResolvedValue({ groups: [], standalone_ids: [] });
    useFleetStore.setState({
      load,
      setFleet: vi.fn(),
      upsertDevice: vi.fn(),
      setConnection: vi.fn(),
      setSync: vi.fn(),
      connection: 'connecting',
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens a single EventSource and marks connection live', async () => {
    const setConnection = vi.fn();
    useFleetStore.setState({ setConnection });

    const { unmount } = renderHook(() => useLiveFleet());
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]?.url).toBe('/api/v1/events');

    await act(async () => {
      MockEventSource.instances[0]?.onopen?.(new Event('open'));
    });
    expect(setConnection).toHaveBeenCalledWith('live');

    unmount();
    expect(MockEventSource.instances[0]?.closed).toBe(true);
  });

  it('applies fleet SSE payloads to the store', async () => {
    const setFleet = vi.fn();
    const setSync = vi.fn();
    useFleetStore.setState({ setFleet, setSync });

    renderHook(() => useLiveFleet());
    const source = MockEventSource.instances[0];
    expect(source).toBeTruthy();

    await act(async () => {
      source?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'fleet',
            data: {
              devices: [{ id: 'a', name: 'A' }],
              discovered_at: 123,
              sync: { groups: [], standalone_ids: ['a'] },
            },
          }),
        }),
      );
    });

    expect(setFleet).toHaveBeenCalledWith([{ id: 'a', name: 'A' }], 123);
    expect(setSync).toHaveBeenCalledWith({ groups: [], standalone_ids: ['a'] });
  });

  it('starts REST fallback while reconnecting and clears it when live', async () => {
    const setConnection = vi.fn();
    useFleetStore.setState({ setConnection });

    renderHook(() => useLiveFleet());
    const source = MockEventSource.instances[0];

    await act(async () => {
      source?.onerror?.(new Event('error'));
    });
    expect(setConnection).toHaveBeenCalledWith('reconnecting');

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(load.mock.calls.length).toBeGreaterThanOrEqual(2);

    const reopened = MockEventSource.instances[1];
    await act(async () => {
      reopened?.onopen?.(new Event('open'));
    });
    expect(setConnection).toHaveBeenCalledWith('live');
  });

  it('marks offline after max reconnect attempts then retries SSE', async () => {
    const setConnection = vi.fn();
    useFleetStore.setState({ setConnection });

    renderHook(() => useLiveFleet());

    for (let i = 0; i < 8; i += 1) {
      const source = MockEventSource.instances[i];
      await act(async () => {
        source?.onerror?.(new Event('error'));
      });
      if (i < 7) {
        await act(async () => {
          vi.advanceTimersByTime(60_000);
        });
      }
    }
    expect(setConnection).toHaveBeenCalledWith('offline');

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    const resumed = MockEventSource.instances[8];
    expect(resumed).toBeTruthy();
    await act(async () => {
      resumed?.onopen?.(new Event('open'));
    });
    expect(setConnection).toHaveBeenCalledWith('live');
  });
});
