/**
 * Separator for compact meta lines (volume/dB, service/format, status chips).
 * Slash stays legible next to signed values like ``-28.9 dB``; middots do not.
 */
export const META_SEP = ' / ';

export function joinMeta(
  ...parts: Array<string | number | null | undefined | false>
): string {
  return parts.filter((part): part is string | number => Boolean(part)).join(META_SEP);
}
