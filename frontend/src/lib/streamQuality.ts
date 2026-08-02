import { joinMeta } from '@/lib/meta';

/**
 * Format BluOS quality + streamFormat for UI.
 * Lossy bitrates usually arrive as bits/sec (e.g. 320000 → 320 kbps).
 * Named tiers stay as labels (cd → CD, mqa → MQA).
 */
export function streamQualityLabel(
  quality: string | undefined | null,
  streamFormat: string | undefined | null,
): string {
  const parts: string[] = [];
  const format = streamFormat?.trim() ?? '';
  if (format) parts.push(format);

  const raw = quality?.trim() ?? '';
  if (!raw) return joinMeta(...parts);

  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n >= 1000) {
      parts.push(`${Math.round(n / 1000)} kbps`);
    } else if (n > 0) {
      parts.push(`${n} kbps`);
    }
  } else {
    parts.push(raw.toUpperCase());
  }

  return joinMeta(...parts);
}
