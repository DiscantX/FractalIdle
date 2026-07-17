// Core Buffalo fractal strategy – a variation of the Burning Ship formula
// that takes absolute values of both real and imaginary components after squaring.

export const PERIODICITY_EPSILON = 1e-12;

/**
 * Buffalo fractal iteration. The rule is:
 *   z' = (|Re(z)| + i|Im(z)|)² + c  (or similar variant) – see worker.
 */
export function escapeIterations(
  cRe: number,
  cIm: number,
  zRe: number,
  zIm: number,
  maxIterations: number,
  _geometricCulling: boolean,
  periodicityChecking: boolean
): number {
  let iter = 0;
  const escapeRadiusSquared = 4;

  let checkRe = zRe;
  let checkIm = zIm;
  let checkCounter = 0;
  let checkPeriod = 10;

  while (iter < maxIterations && (zRe * zRe + zIm * zIm) < escapeRadiusSquared) {
    // Buffalo formula: square then take abs of both parts.
    const nextRe = Math.abs(zRe * zRe - zIm * zIm) + cRe;
    const nextIm = Math.abs(2 * zRe * zIm) + cIm;
    zRe = nextRe;
    zIm = nextIm;

    iter += 1;

    if (periodicityChecking) {
      if (Math.abs(zRe - checkRe) < PERIODICITY_EPSILON && Math.abs(zIm - checkIm) < PERIODICITY_EPSILON) {
        return maxIterations;
      }
      checkCounter += 1;
      if (checkCounter === checkPeriod) {
        checkCounter = 0;
        checkPeriod *= 2;
        checkRe = zRe;
        checkIm = zIm;
      }
    }
  }

  return iter;
}

export function isPixelInSet(
  cRe: number,
  cIm: number,
  real: number,
  imag: number,
  maxIterations: number,
  geometricCulling: boolean,
  periodicityChecking: boolean
): boolean {
  const iter = escapeIterations(cRe, cIm, real, imag, maxIterations, geometricCulling, periodicityChecking);
  return iter === maxIterations;
}