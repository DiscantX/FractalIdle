import type { SettingsState, RangeLinkConfig } from './types';

/**
 * Checks whether a changed value has crossed its range-linked partner, and
 * if so, returns the correction needed to keep min <= max. Returns null
 * when no correction is needed.
 *
 * Symmetric by design: works whether the field being edited is the min or
 * the max end of the pair — the caller doesn't need to know which.
 */
export function enforceRangeLink(
  newValue: number,
  rangeLink: RangeLinkConfig,
  settings: SettingsState
): { id: string; value: number } | null {
  const pairedValue = settings[rangeLink.pairedWith] as number;

  if (rangeLink.role === 'min' && newValue > pairedValue) {
    return { id: rangeLink.pairedWith, value: newValue };
  }
  if (rangeLink.role === 'max' && newValue < pairedValue) {
    return { id: rangeLink.pairedWith, value: newValue };
  }
  return null;
}