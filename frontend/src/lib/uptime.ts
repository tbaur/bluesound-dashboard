/** Parse BluOS diagnostics uptime (`37h13m24s`, `12h3m`, `9d4h`) to seconds. */
export function parseBluosUptime(raw: string): number | null {
  const compact = raw.trim().replace(/\s+/g, '');
  if (!compact) return null;
  const match = compact.match(/^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!match || (!match[1] && !match[2] && !match[3] && !match[4])) return null;
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

function formatDuration(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

/** Compact uptime for the player dossier; unknown shapes pass through. */
export function formatPlayerUptime(raw: string | null | undefined): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  const seconds = parseBluosUptime(value);
  return seconds == null ? value : formatDuration(seconds);
}
