import type { PrecisionBackend } from './types';
import { doubleDoubleBackend } from './double-double';
import { decimalJsBackend } from './decimal-js';
import { bigIntFixedBackend } from './bigint-fixed';

/** Mirrors the precisionMode setting's option values exactly. */
export type PrecisionMode = 'auto' | 'double-double' | 'decimal-js' | 'bigint-fixed';

// Verified boundaries — see the benchmarking notes in this project's
// perturbation-precision discussion. 15 is float64's guaranteed-safe digit
// count (round-trips exactly; 16-17 often but not always do). 29 is
// double-double's storage ceiling (~30 digits) minus a safety margin for
// accumulated error across the many chained operations one reference orbit
// performs — not double-double's raw capacity itself.
const FLOAT64_MAX_DIGITS = 15;
const DOUBLE_DOUBLE_MAX_DIGITS = 29;

/**
 * Selects the precision backend for a given required digit count and mode.
 * Returns null to mean "no backend — use plain float64 arithmetic", which is
 * a real, valid outcome (the float64 tier of 'auto'), not an error case.
 *
 * The three forced modes (decimal-js / bigint-fixed / double-double) ignore
 * digits entirely and always return that backend — including at digit counts
 * where it's known to perform poorly or be silently truncated (forced
 * double-double past its ~30-digit ceiling; forced bigint-fixed past its
 * ~500-digit cliff). This is intentional: forced modes exist for direct
 * comparison/testing, not for picking the best choice automatically — that's
 * what 'auto' is for.
 */
export function selectPrecisionBackend(digits: number, mode: PrecisionMode): PrecisionBackend | null {
  switch (mode) {
    case 'double-double':
      return doubleDoubleBackend(digits);
    case 'decimal-js':
      return decimalJsBackend(digits);
    case 'bigint-fixed':
      return bigIntFixedBackend(digits);
    case 'auto':
      if (digits <= FLOAT64_MAX_DIGITS) return null;
      if (digits <= DOUBLE_DOUBLE_MAX_DIGITS) return doubleDoubleBackend(digits);
      return decimalJsBackend(digits);
  }
}