import { describe, expect, it } from 'vitest';
import { META_SEP, joinMeta } from '@/lib/meta';

describe('joinMeta', () => {
  it('joins with a slash that stays clear next to signed values', () => {
    expect(META_SEP).toBe(' / ');
    expect(joinMeta('64%', '-28.9 dB')).toBe('64% / -28.9 dB');
  });

  it('skips empty parts', () => {
    expect(joinMeta('AirPlay', '', 'FLAC')).toBe('AirPlay / FLAC');
    expect(joinMeta(null, 'Spotify')).toBe('Spotify');
  });
});
