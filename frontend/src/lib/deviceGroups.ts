import type { PlayerStatus } from '@/api/types';

function normalizeModelText(...parts: Array<string | undefined | null>): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** NAD CI S2 zones — different amp power / volume scale than residential BluOS. */
export function isCiS2Device(
  device: Pick<PlayerStatus, 'model' | 'brand' | 'full_model'>,
): boolean {
  const text = normalizeModelText(device.brand, device.model, device.full_model);
  if (!text) return false;
  const compact = text.replace(/\s+/g, '');
  return text.includes('ci s2') || compact.includes('cis2');
}

export function partitionVolumeGroups(devices: PlayerStatus[]): {
  residential: PlayerStatus[];
  ciS2: PlayerStatus[];
} {
  const residential: PlayerStatus[] = [];
  const ciS2: PlayerStatus[] = [];
  for (const device of devices) {
    if (isCiS2Device(device)) ciS2.push(device);
    else residential.push(device);
  }
  return { residential, ciS2 };
}
