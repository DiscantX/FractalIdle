import type { HighPrecisionValue, PrecisionBackend, PrecisionBackendFactory } from './types';

/**
 * Fixed-point high-precision backend using native BigInt as the storage type.
 * A value is stored as `raw = round(value * 10^digits)` — an integer BigInt
 * scaled by a fixed power of ten. This is deliberately fixed-point, not
 * floating-point: Mandelbrot coordinates for this renderer always live in a
 * small, bounded range (~[-2, 2]), so a fixed count of post-decimal digits is
 * sufficient — there's no need for a separate tracked exponent. See the
 * perturbation-precision handoff for the "V8 BigInt is cheap here" finding
 * that motivated trying this approach at all.
 */
class BigIntFixedValue implements HighPrecisionValue {
  constructor(
    private readonly raw: bigint,
    private readonly scale: bigint,
    private readonly digits: number,
  ) {}

  private assertSameScale(other: BigIntFixedValue): void {
    if (other.scale !== this.scale) {
      // Mixing values from two differently-configured backends (different
      // digit counts) is a caller bug, not a recoverable case — the results
      // would be silently wrong (misaligned decimal points) rather than just
      // imprecise. Fail loudly.
      throw new Error(
        `BigIntFixedValue scale mismatch: ${this.digits} digits vs ${other.digits} digits`
      );
    }
  }

  add(other: HighPrecisionValue): HighPrecisionValue {
    const o = other as BigIntFixedValue;
    this.assertSameScale(o);
    return new BigIntFixedValue(this.raw + o.raw, this.scale, this.digits);
  }

  sub(other: HighPrecisionValue): HighPrecisionValue {
    const o = other as BigIntFixedValue;
    this.assertSameScale(o);
    return new BigIntFixedValue(this.raw - o.raw, this.scale, this.digits);
  }

  mul(other: HighPrecisionValue): HighPrecisionValue {
    const o = other as BigIntFixedValue;
    this.assertSameScale(o);
    // raw values are both scaled by `scale`, so their product is scaled by
    // scale^2 — divide back down by one factor of scale to return to the
    // single-scaled representation. Round-to-nearest (not truncate) so
    // repeated multiplications (hundreds of iterations) don't accumulate a
    // consistent downward bias.
    const product = this.raw * o.raw;
    return new BigIntFixedValue(roundedDiv(product, this.scale), this.scale, this.digits);
  }

  toNumber(): number {
    // Build a decimal string and let parseFloat do the final round-to-float64
    // — this avoids BigInt-to-Number conversion overflow/precision issues for
    // raw values whose magnitude exceeds 2^53, which a naive
    // `Number(raw) / Number(scale)` would hit.
    const negative = this.raw < 0n;
    const abs = negative ? -this.raw : this.raw;
    const intPart = abs / this.scale;
    const fracPart = abs % this.scale;
    const fracStr = fracPart.toString().padStart(this.digits, '0');
    const sign = negative ? '-' : '';
    return parseFloat(`${sign}${intPart}.${fracStr}`);
  }
}

// Round-to-nearest integer division for BigInt (which only has truncating
// division natively). Handles sign correctly by rounding away from zero at
// the halfway point, matching Math.round's convention.
function roundedDiv(numerator: bigint, denominator: bigint): bigint {
  const negative = (numerator < 0n) !== (denominator < 0n);
  const absNum = numerator < 0n ? -numerator : numerator;
  const absDen = denominator < 0n ? -denominator : denominator;
  const half = absDen / 2n;
  const result = (absNum + half) / absDen;
  return negative ? -result : result;
}

/**
 * Parses a decimal string into fixed-point raw form at the given digit count.
 * Extra fractional digits beyond `digits` are truncated (not rounded) —
 * acceptable here because this is the entry point from outside sources
 * (string literals, eventually user input), not an intermediate arithmetic
 * step where error would compound. Handles an optional leading '-' and an
 * optional fractional part; does not handle exponential notation ("1e10") —
 * not needed for coordinates in this renderer's bounded range.
 */
function parseFixed(value: string, digits: number, scale: bigint): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intStr, fracStr = ''] = unsigned.split('.');
  const paddedFrac = (fracStr + '0'.repeat(digits)).slice(0, digits);
  const combined = `${intStr || '0'}${paddedFrac}`;
  const raw = BigInt(combined);
  return negative ? -raw : raw;
}

export const bigIntFixedBackend: PrecisionBackendFactory = (digits: number): PrecisionBackend => {
  const scale = 10n ** BigInt(digits);
  return {
    fromNumber(value: number): HighPrecisionValue {
      // Route through fromString rather than multiplying value * 10^digits
      // directly in floating point — that multiplication would reintroduce
      // the exact float64 rounding error we're trying to escape, before the
      // BigInt conversion even happens. value.toString() gives the shortest
      // exact decimal round-tripping to that float64 (per the ECMAScript
      // spec), which is the most faithful string representation available
      // from a plain number.
      return this.fromString(value.toString());
    },
    fromString(value: string): HighPrecisionValue {
      return new BigIntFixedValue(parseFixed(value, digits, scale), scale, digits);
    },
  };
};