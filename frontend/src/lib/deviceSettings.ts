import type { DeviceSetting } from '@/api/types';

export type ChoiceOption = { name: string; label: string };

export function isVisible(
  setting: DeviceSetting,
  values: Record<string, string>,
): boolean {
  if (!setting.depends_on) return true;
  return values[setting.depends_on] === setting.depends_value;
}

export function isBooleanOn(value: string): boolean {
  const normalized = value.trim().toUpperCase();
  return normalized === 'ON' || normalized === '1' || normalized === 'TRUE' || normalized === 'YES';
}

export function booleanOptions(): ChoiceOption[] {
  return [
    { name: 'ON', label: 'On' },
    { name: 'OFF', label: 'Off' },
  ];
}

function isOffishLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return normalized === 'off' || normalized === 'disabled' || normalized === 'no';
}

function isOnishLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return normalized === 'on' || normalized === 'enabled' || normalized === 'yes';
}

/** Keep binary toggles in a stable On → Off (or Enabled → Disabled) order. */
export function orderChoiceOptions(options: ChoiceOption[]): ChoiceOption[] {
  if (options.length !== 2) return options;
  const [a, b] = options;
  if (isOnishLabel(a.label) && isOffishLabel(b.label)) return options;
  if (isOffishLabel(a.label) && isOnishLabel(b.label)) return [b, a];
  return options;
}

export function choiceOptionsForSetting(setting: DeviceSetting): ChoiceOption[] {
  if (setting.options.length > 0) {
    return orderChoiceOptions(
      setting.options.map((option) => ({
        name: option.name,
        label: option.display_name || option.name,
      })),
    );
  }
  if (setting.kind === 'boolean') {
    return booleanOptions();
  }
  return [];
}

export function selectedChoiceValue(setting: DeviceSetting, value: string): string {
  if (setting.options.length > 0) {
    return value;
  }
  if (setting.kind === 'boolean') {
    return isBooleanOn(value) ? 'ON' : 'OFF';
  }
  return value;
}

export function displayValue(setting: DeviceSetting, value: string): string {
  if (setting.options.length > 0) {
    const option = setting.options.find((item) => item.name === value);
    if (option) return option.display_name || option.name;
  }
  if (setting.kind === 'boolean') {
    return isBooleanOn(value) ? 'On' : 'Off';
  }
  if (setting.kind === 'list') {
    const option = setting.options.find((item) => item.name === value);
    return option?.display_name || value || '—';
  }
  if (setting.kind === 'dual-range' && value.includes(',')) {
    const [low, high] = value.split(',');
    const unit = setting.units ? ` ${setting.units}` : '';
    return `${low} … ${high}${unit}`;
  }
  if (setting.kind === 'range' && setting.units) {
    return `${value} ${setting.units}`;
  }
  return value || '—';
}

/** Expected BluOS write target for tests and docs. */
export function writeStrategy(setting: DeviceSetting): 'bluos-get' | 'web-ui-post' {
  return setting.control_path ? 'bluos-get' : 'web-ui-post';
}
