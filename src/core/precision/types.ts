/**
 * A single arbitrary-precision real number, produced by one of the precision
 * backends (bigint-fixed.ts, decimal-js.ts). Immutable — every operation
 * returns a new HighPrecisionValue rather than mutating in place, matching
 * the functional style the rest of core/ already uses (e.g. enforceRangeLink
 * returning a correction rather than mutating settings in place).
 *
 * Deliberately minimal: only what computeReferenceOrbit's high-precision loop
 * actually needs. Z_{n+1} = Z_n^2 + C, expanded into real/imaginary parts, is
 * add/sub/mul only — no division, comparison, or trig. Add those only when a
 * real caller needs them, not speculatively.
 */
export interface HighPrecisionValue {
  add(other: HighPrecisionValue): HighPrecisionValue;
  sub(other: HighPrecisionValue): HighPrecisionValue;
  mul(other: HighPrecisionValue): HighPrecisionValue;
  /** Collapse back to float64 — the one-way, last-possible-moment downcast
   * from the Slice B design conversation. Called once per iteration, to
   * write each Z_n into the (still-float64) ReferenceOrbit array. */
  toNumber(): number;
}

/**
 * Constructs HighPrecisionValues at a fixed working precision. Precision is
 * pinned at construction time (see PrecisionBackendFactory below) rather than
 * being a global/mutable setting — so two different digit counts (comparing
 * backends side by side, or two render layers at different zoom depths) can
 * coexist without fighting over shared state.
 */
export interface PrecisionBackend {
  fromNumber(value: number): HighPrecisionValue;
  fromString(value: string): HighPrecisionValue;
}

/** Mirrors the precisionMode setting's option values (added once this wires
 * into rendering — not yet, at this isolated-proof stage). */
export type PrecisionBackendKind = 'bigint-fixed' | 'decimal-js';

/**
 * Build a backend pinned to a specific number of significant decimal digits.
 * How many digits a given zoom depth actually needs is a real, separate
 * design question (roughly: digits ≳ log10(zoom) + a safety margin) —
 * deferred deliberately. For this isolated-proof step, callers just pass a
 * number and we observe what happens.
 */
export type PrecisionBackendFactory = (digits: number) => PrecisionBackend;