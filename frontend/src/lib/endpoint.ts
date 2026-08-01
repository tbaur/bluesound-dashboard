import type { PlayerStatus } from '@/api/types';

const DEFAULT_BLUOS_PORT = 11000;

/** Canonical ``ip:port`` for BluOS API / sync membership. */
export function deviceEndpoint(device: Pick<PlayerStatus, 'ip' | 'port'>): string {
  const port = device.port ?? DEFAULT_BLUOS_PORT;
  return `${device.ip}:${port}`;
}

/** Display host; include port when it is not the primary BluOS port. */
export function formatDeviceHost(device: Pick<PlayerStatus, 'ip' | 'port'>): string {
  const port = device.port ?? DEFAULT_BLUOS_PORT;
  if (port === DEFAULT_BLUOS_PORT) return device.ip;
  return `${device.ip}:${port}`;
}

export function endpointsMatch(
  a: string | undefined | null,
  b: string | undefined | null,
): boolean {
  if (!a || !b) return false;
  const norm = (value: string) => (value.includes(':') ? value : `${value}:${DEFAULT_BLUOS_PORT}`);
  return norm(a) === norm(b);
}
