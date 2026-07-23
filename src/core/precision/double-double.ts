import type { HighPrecisionValue, PrecisionBackend, PrecisionBackendFactory } from './types';

// Returns [sum, error] such that a + b = sum + error EXACTLY — error is the
// rounding error ordinary float64 addition would silently discard. Works for
// any a, b in either order (Knuth's algorithm).
function twoSum(a: number, b: number): [number, number] {
  const sum = a + b;
  const v = sum - a;
  const error = (a - (sum - v)) + (b - v);
  return [sum, error];
}

// Same contract, but requires |a| >= |b| — cheaper, used once that ordering
// is already known (e.g. after a multiply, where the product always
// dominates its own rounding error).
function quickTwoSum(a: number, b: number): [number, number] {
  const sum = a + b;
  const error = b - (sum - a);
  return [sum, error];
}

// 2^27 + 1 — splits a float64 into two ~26-bit halves whose product never
// overflows float64's 53-bit mantissa (Dekker's algorithm).
const SPLITTER = 134217729;

function split(a: number): [number, number] {
  const t = SPLITTER * a;
  const hi = t - (t - a);
  const lo = a - hi;
  return [hi, lo];
}

// Returns [product, error] such that a * b = product + error EXACTLY.
function twoProduct(a: number, b: number): [number, number] {
  const product = a * b;
  const [aHi, aLo] = split(a);
  const [bHi, bLo] = split(b);
  const error = ((aHi * bHi - product) + aHi * bLo + aLo * bHi) + aLo * bLo;
  return [product, error];
}


/** A number represented as hi + lo (exact mathematical sum), where hi is the
 * best single-float64 approximation and lo is the leftover error — together
 * carrying ~31-32 significant decimal digits, double64's exponent range. */
type DD = { hi: number; lo: number };

function ddAdd(a: DD, b: DD): DD {
  const [s, e0] = twoSum(a.hi, b.hi);
  const e = e0 + a.lo + b.lo;
  const [hi, lo] = quickTwoSum(s, e);
  return { hi, lo };
}

function ddNegate(a: DD): DD {
  return { hi: -a.hi, lo: -a.lo };
}

function ddSub(a: DD, b: DD): DD {
  return ddAdd(a, ddNegate(b));
}

function ddMul(a: DD, b: DD): DD {
  const [p, e0] = twoProduct(a.hi, b.hi);
  const e = e0 + a.hi * b.lo + a.lo * b.hi;
  const [hi, lo] = quickTwoSum(p, e);
  return { hi, lo };
}

// Multiply by a plain float64 rather than another DD — used internally by
// fromString below, where one operand (a digit, or a power of ten) is always
// already an exact integer.
function ddMulByDouble(a: DD, b: number): DD {
  const [p, e0] = twoProduct(a.hi, b);
  const e = e0 + a.lo * b;
  const [hi, lo] = quickTwoSum(p, e);
  return { hi, lo };
}

// "Sloppy" Newton-Raphson division (the standard technique — see the QD
// library). NOT part of the public HighPrecisionValue contract (Step 5 scoped
// that to what the reference-orbit iteration formula needs: add/sub/mul) —
// this exists purely as an internal helper for fromString's decimal parsing
// below. Three refinement passes against the exact DD value is sufficient to
// recover full double-double accuracy from a single float64 starting guess.
function ddDiv(a: DD, b: DD): DD {
  const q1 = a.hi / b.hi;
  let r = ddSub(a, ddMulByDouble(b, q1));
  const q2 = r.hi / b.hi;
  r = ddSub(r, ddMulByDouble(b, q2));
  const q3 = r.hi / b.hi;
  const [hi, lo] = quickTwoSum(q1, q2);
  return ddAdd({ hi, lo }, { hi: q3, lo: 0 });
}

class DoubleDoubleValue implements HighPrecisionValue {
  constructor(private readonly dd: DD) {}

  add(other: HighPrecisionValue): HighPrecisionValue {
    return new DoubleDoubleValue(ddAdd(this.dd, (other as DoubleDoubleValue).dd));
  }
  sub(other: HighPrecisionValue): HighPrecisionValue {
    return new DoubleDoubleValue(ddSub(this.dd, (other as DoubleDoubleValue).dd));
  }
  mul(other: HighPrecisionValue): HighPrecisionValue {
    return new DoubleDoubleValue(ddMul(this.dd, (other as DoubleDoubleValue).dd));
  }
  toNumber(): number {
    // hi is already the correctly-rounded nearest-float64 approximation of
    // the full (hi+lo) value by construction — no further work needed here,
    // unlike bigint-fixed's toNumber (which builds a string) or decimal.js's
    // (which delegates to the library).
    return this.dd.hi;
  }
}

// Double-double's real capacity — ~31-32 significant decimal digits from its
// ~106-bit combined significand. Digits beyond this cannot be represented at
// all (unlike bigint-fixed/decimal-js, whose ceiling is a chosen `digits`
// parameter) — this is a hard property of the representation itself.
const DD_DIGIT_BUDGET = 30;

export const doubleDoubleBackend: PrecisionBackendFactory = (digits: number): PrecisionBackend => {
  if (digits > DD_DIGIT_BUDGET) {
    // console.warn(
    //   `doubleDoubleBackend: requested ${digits} digits exceeds double-double's ~${DD_DIGIT_BUDGET}-digit ceiling. ` +
    //   `Results will be capped, not extended — use bigint-fixed or decimal-js beyond this range.`
    // );
  }
  return {
    fromNumber(value: number): HighPrecisionValue {
      return new DoubleDoubleValue({ hi: value, lo: 0 });
    },
    fromString(value: string): HighPrecisionValue {
      const trimmed = value.trim();
      const negative = trimmed.startsWith('-');
      const unsigned = negative ? trimmed.slice(1) : trimmed;
      const [intStr, fracStrFull = ''] = unsigned.split('.');
      const fracStr = fracStrFull.slice(0, DD_DIGIT_BUDGET);

      // Accumulate the fractional digits as an EXACT double-double integer
      // (digit-by-digit: value = value*10 + digit). This stays exact the
      // whole way through, as long as the accumulated integer fits within
      // double-double's ~106-bit budget — which fracStr's length cap above
      // guarantees.
      let fracInt: DD = { hi: 0, lo: 0 };
      for (const ch of fracStr) {
        fracInt = ddAdd(ddMulByDouble(fracInt, 10), { hi: Number(ch), lo: 0 });
      }

      // 10^n for n within our digit budget is ALSO exactly representable as
      // a double-double — built here via repeated exact multiplication, not
      // approximated or looked up. This is what lets the final division
      // below be a division by an exact value rather than an approximate one.
      let powerOfTen: DD = { hi: 1, lo: 0 };
      for (let i = 0; i < fracStr.length; i++) {
        powerOfTen = ddMulByDouble(powerOfTen, 10);
      }

      const fracValue = fracStr.length > 0 ? ddDiv(fracInt, powerOfTen) : { hi: 0, lo: 0 };
      const intValue: DD = { hi: Number(intStr || '0'), lo: 0 };
      let result = ddAdd(intValue, fracValue);
      if (negative) result = ddNegate(result);
      return new DoubleDoubleValue(result);
    },
  };
};