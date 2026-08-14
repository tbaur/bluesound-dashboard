import { describe, expect, it } from 'vitest';
import type { DeviceSetting } from '@/api/types';
import {
  choiceOptionsForSetting,
  displayValue,
  isBooleanOn,
  isDualRangeValid,
  isTextValueValid,
  isVisible,
  orderChoiceOptions,
  selectedChoiceValue,
  writeStrategy,
} from '@/lib/deviceSettings';

function setting(partial: Partial<DeviceSetting> & Pick<DeviceSetting, 'id'>): DeviceSetting {
  return {
    name: partial.id,
    display_name: partial.id,
    kind: 'boolean',
    value: '',
    description: '',
    explanation: '',
    disabled: false,
    control_path: '',
    min_value: null,
    max_value: null,
    step: null,
    units: '',
    options: [],
    dependencies: [],
    depends_on: '',
    depends_value: '',
    hide_if_disabled: false,
    min_range: null,
    pattern: '',
    pattern_error: '',
    refresh_after_write: false,
    ...partial,
  };
}

describe('deviceSettings helpers', () => {
  it('orders binary options On before Off even when BluOS ships Off first', () => {
    const ordered = orderChoiceOptions([
      { name: 'default', label: 'Off' },
      { name: 'withsub', label: 'On' },
    ]);
    expect(ordered.map((o) => o.label)).toEqual(['On', 'Off']);
  });

  it('keeps multi-option lists in source order', () => {
    const options = [
      { name: 'none', label: 'Disabled' },
      { name: 'track', label: 'Track gain' },
      { name: 'album', label: 'Album gain' },
    ];
    expect(orderChoiceOptions(options)).toEqual(options);
  });

  it('selects Off for subwoofer default value using real option names', () => {
    const sub = setting({
      id: 'subwoofer',
      kind: 'boolean',
      value: 'default',
      control_path: '/audiomodes',
      options: [
        { name: 'default', display_name: 'Off' },
        { name: 'withsub', display_name: 'On' },
      ],
    });
    const choices = choiceOptionsForSetting(sub);
    expect(choices.map((c) => c.label)).toEqual(['On', 'Off']);
    expect(selectedChoiceValue(sub, 'default')).toBe('default');
    expect(displayValue(sub, 'default')).toBe('Off');
    expect(writeStrategy(sub)).toBe('bluos-get');
  });

  it('maps plain ON/OFF booleans and marks Off when value is not on-ish', () => {
    const tone = setting({
      id: 'eq-switch',
      kind: 'boolean',
      value: 'OFF',
      control_path: '/alsa_setting',
    });
    expect(choiceOptionsForSetting(tone).map((c) => c.name)).toEqual(['ON', 'OFF']);
    expect(selectedChoiceValue(tone, 'OFF')).toBe('OFF');
    expect(selectedChoiceValue(tone, '0')).toBe('OFF');
    expect(isBooleanOn('ON')).toBe(true);
    expect(isBooleanOn('default')).toBe(false);
  });

  it('uses audiomodes for channelMode and web UI for volumeLimits', () => {
    expect(
      writeStrategy(
        setting({
          id: 'channelMode',
          kind: 'list',
          control_path: '/audiomodes',
          options: [{ name: 'left', display_name: 'Left' }],
        }),
      ),
    ).toBe('bluos-get');
    expect(
      writeStrategy(
        setting({
          id: 'volumeLimits',
          kind: 'dual-range',
          value: '-90,0',
          control_path: '',
        }),
      ),
    ).toBe('web-ui-post');
  });

  it('hides dependent settings until parent matches', () => {
    const fixed = setting({
      id: 'fixedVolume',
      depends_on: 'mqaDisable',
      depends_value: 'OFF',
    });
    expect(isVisible(fixed, { mqaDisable: 'ON' })).toBe(false);
    expect(isVisible(fixed, { mqaDisable: 'OFF' })).toBe(true);
  });

  it('requires every dependsOn for Digital Passthrough', () => {
    const passthrough = setting({
      id: 'mqaDisable',
      dependencies: [
        { name: 'replayGainMode', value: 'none' },
        { name: 'fixedVolume', value: 'ON' },
        { name: 'eq-switch', value: 'OFF' },
      ],
    });
    expect(
      isVisible(passthrough, {
        replayGainMode: 'none',
        fixedVolume: 'OFF',
        'eq-switch': 'OFF',
      }),
    ).toBe(false);
    expect(
      isVisible(passthrough, {
        replayGainMode: 'none',
        fixedVolume: 'ON',
        'eq-switch': 'OFF',
      }),
    ).toBe(true);
  });

  it('hides settings that BluOS marks hideIfDisabled when disabled', () => {
    const hidden = setting({
      id: 'channelMode',
      disabled: true,
      hide_if_disabled: true,
    });
    expect(isVisible(hidden, {})).toBe(false);
    expect(isVisible(setting({ id: 'nodename', disabled: true }), {})).toBe(true);
  });

  it('rejects volume-limit drafts outside range or below min span', () => {
    const limits = setting({
      id: 'volumeLimits',
      kind: 'dual-range',
      min_value: -90,
      max_value: 0,
      min_range: 30,
      units: 'dB',
    });
    expect(isDualRangeValid(limits, '-90,0')).toBe(true);
    expect(isDualRangeValid(limits, '-20,0')).toBe(false);
    expect(isDualRangeValid(limits, '-100,-10')).toBe(false);
    expect(isDualRangeValid(limits, '-10,-40')).toBe(false);
  });

  it('validates room-name pattern from BluOS XML', () => {
    const name = setting({
      id: 'nodename',
      kind: 'text',
      pattern: '.{1,255}',
    });
    expect(isTextValueValid(name, 'Kitchen')).toBe(true);
    expect(isTextValueValid(name, '')).toBe(false);
  });

  it('formats dual-range and list labels for the dossier row', () => {
    expect(
      displayValue(
        setting({
          id: 'volumeLimits',
          kind: 'dual-range',
          units: 'dB',
          value: '-90,0',
        }),
        '-90,0',
      ),
    ).toBe('-90 … 0 dB');
    expect(
      displayValue(
        setting({
          id: 'channelMode',
          kind: 'list',
          options: [
            { name: 'default', display_name: 'Stereo' },
            { name: 'left', display_name: 'Left' },
          ],
        }),
        'default',
      ),
    ).toBe('Stereo');
  });
});
