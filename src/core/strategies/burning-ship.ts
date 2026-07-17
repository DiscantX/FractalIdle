// Core Burning Ship strategy (used by Burning Ship fractal).
// This mirrors the Mandelbrot strategy but uses the Burning Ship iteration rule.

export const PERIODICITY_EPSILON = 1e-12;

// Burning Ship does not have a simple interior region test like the Mandelbrot set,
// but we can define a helper function if needed. For now we just expose the classic
// iteration and periodicity helpers.

export function escapeIterations(
  cRe: number,
  cIm: number,
  zRe: number,
  zIm: number,
  maxIterations: number,
  _geometricCulling: boolean,
  periodicityChecking: boolean
): number {
  // Burning Ship uses absolute values before squaring.
  let iter = 0;
  const escapeRadiusSquared = 4;
  let checkRe = zRe;
  let checkIm = zIm;
  let checkCounter = 0;
  let checkPeriod = 10;

  while (iter < maxIterations && (zRe * zRe + zIm * zIm) < escapeRadiusSquared) {
    const nextRe = (Math.abs(zRe) * Math.abs(zRe) - Math.abs(zIm) * Math.abs(zIm) + cRe);
    const nextIm = (Math.abs(zRe) * Math.abs(zIm) - Math.abs(zRe) * Math.abs(zIm) + cIm);
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

// Simple containment test for Burning Ship (no known analytic interior)
// – just use periodicity or max iterations.
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