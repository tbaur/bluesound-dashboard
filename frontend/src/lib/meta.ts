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

const ROOM_SEP = ' · ';

/** One-line room list for tight chrome; extra names collapse to +N. */
export function compactRoomLine(rooms: string[], keep = 2): string {
  if (rooms.length === 0) return '';
  if (rooms.length <= keep) return rooms.join(ROOM_SEP);
  return `${rooms.slice(0, keep).join(ROOM_SEP)}${ROOM_SEP}+${rooms.length - keep}`;
}
