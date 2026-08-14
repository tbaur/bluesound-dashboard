import { describe, expect, it } from 'vitest';
import { formatPlayerUptime, parseBluosUptime } from '@/lib/uptime';

describe('formatPlayerUptime', () => {
  it('formats CI diagnostics compact strings', () => {
    expect(formatPlayerUptime('37h13m24s')).toBe('1d 13h');
    expect(formatPlayerUptime('12h3m')).toBe('12h 3m');
    expect(formatPlayerUptime('9d4h')).toBe('9d 4h');
    expect(formatPlayerUptime('1h')).toBe('1h');
    expect(formatPlayerUptime('45s')).toBe('0m');
  });

  it('passes through unknown shapes and empty values', () => {
    expect(formatPlayerUptime('2 days')).toBe('2 days');
    expect(formatPlayerUptime(null)).toBe('');
    expect(formatPlayerUptime('')).toBe('');
  });
});

describe('parseBluosUptime', () => {
  it('rejects empty optional-only matches', () => {
    expect(parseBluosUptime('')).toBeNull();
    expect(parseBluosUptime('nope')).toBeNull();
  });
});
