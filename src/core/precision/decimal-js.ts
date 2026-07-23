import Decimal from 'decimal.js';
import type { HighPrecisionValue, PrecisionBackend, PrecisionBackendFactory } from './types';

/**
 * Adapts decimal.js to the HighPrecisionValue/PrecisionBackend contract.
 *
 * decimal.js precision is normally global/mutable (Decimal.set({precision})
 * affects every Decimal from the default export). We use Decimal.clone()
 * instead, which returns an independent constructor with its own pinned
 * precision — so two backends built at different digit counts (e.g. for
 * comparing against bigint-fixed, or two render layers at different zoom
 * depths) never fight over shared global state. Mirrors bigint-fixed.ts's
 * `scale` field: there, an explicit field prevents cross-backend mixing;
 * here, the clone boundary prevents it structurally instead.
 */
class DecimalValue implements HighPrecisionValue {
  constructor(private readonly value: InstanceType<typeof Decimal>) {}

  add(other: HighPrecisionValue): HighPrecisionValue {
    return new DecimalValue(this.value.add((other as DecimalValue).value));
  }

  sub(other: HighPrecisionValue): HighPrecisionValue {
    return new DecimalValue(this.value.sub((other as DecimalValue).value));
  }

  mul(other: HighPrecisionValue): HighPrecisionValue {
    return new DecimalValue(this.value.mul((other as DecimalValue).value));
  }

  toNumber(): number {
    return this.value.toNumber();
  }
}

export const decimalJsBackend: PrecisionBackendFactory = (digits: number): PrecisionBackend => {
  // Clone at construction time, per the class comment above — every value
  // this backend produces is tied to this one isolated constructor.
  const ScopedDecimal = Decimal.clone({ precision: digits });
  return {
    fromNumber(value: number): HighPrecisionValue {
      return new DecimalValue(new ScopedDecimal(value));
    },
    fromString(value: string): HighPrecisionValue {
      return new DecimalValue(new ScopedDecimal(value));
    },
  };
};