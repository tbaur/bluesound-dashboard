import { describe, expect, it } from 'vitest';
import { streamQualityLabel } from '@/lib/streamQuality';

describe('streamQualityLabel', () => {
  it('formats BluOS bps quality as kbps with stream format', () => {
    expect(streamQualityLabel('320000', 'Ogg Vorbis')).toBe('Ogg Vorbis / 320 kbps');
  });

  it('keeps small numeric values as kbps', () => {
    expect(streamQualityLabel('320', '')).toBe('320 kbps');
  });

  it('uppercases named quality tiers', () => {
    expect(streamQualityLabel('cd', 'FLAC')).toBe('FLAC / CD');
    expect(streamQualityLabel('mqa', '')).toBe('MQA');
  });

  it('returns empty when nothing is available', () => {
    expect(streamQualityLabel('', '')).toBe('');
    expect(streamQualityLabel(null, undefined)).toBe('');
  });
});
