// Core Julia fractal strategy – provides iteration and membership detection
// for the Julia set given a fixed complex constant C.

export const PERIODICITY_EPSILON = 1e-12;

export function escapeIterations(
  cRe: number,  // constant (fixed, independent of pixel)
  cIm: number,
  zRe: number,  // starting point for this pixel (usually 0)
  zIm: number,
  maxIterations: number,
  _geometricCulling: boolean,
  periodicityChecking: boolean
): number {
  // In Julia sets, we only iterate the boundary line zₙ₊₁ = zₙ² + C
  // where C is constant (cRe/cIm). Geometric culling can use known,
  // analytic Julia set interior regions if those are derived elsewhere.
  // For now, just the classic iteration path.

  let zRe0 = zRe;
  let zIm0 = zIm;
  let iter = 0;

  // For periodicity checking in Julia – ensure both zRe and zIm are passed from caller.
  let checkRe = zRe;
  let checkIm = zIm;
  let checkCounter = 0;
  let checkPeriod = 10;

  const escapeRadiusSquared = 4;

  while (iter < maxIterations && (zRe0 * zRe0 + zIm0 * zIm0) < escapeRadiusSquared) {
    const nextRe = zRe0 * zRe0 - zIm0 * zIm0 + cRe;
    const nextIm = 2 * zRe0 * zIm0 + cIm;
    zRe0 = nextRe;
    zIm0 = nextIm;
    iter += 1;

    if (periodicityChecking) {
      if (
        Math.abs(zRe0 - checkRe) < PERIODICITY_EPSILON &&
        Math.abs(zIm0 - checkIm) < PERIODICITY_EPSILON
      ) {
        return maxIterations;
      }
      checkCounter += 1;
      if (checkCounter === checkPeriod) {
        checkCounter = 0;
        checkPeriod *= 2;
        checkRe = zRe0;
        checkIm = zIm0;
      }
    }
  }

  return iter;
}

// If geometric culling is needed, one could add a dedicated analytic test here.
// For now we rely on the user turning off geometric culling for Julia sets.
export function isPixelInSet(
  cRe: number,   // Julia constant
  cIm: number,
  real: number,  // pixel real part
  imag: number,  // pixel imaginary part
  maxIterations: number,
  geometricCulling: boolean,
  periodicityChecking: boolean
): boolean {
  if (geometricCulling) {
    // No built-in analytic interior test for Julia sets – they’re not as simple as M's cardioid/bulb.
    // Caller should turn off geometric culling for Julias.
    return false;
  }
  const iterations = escapeIterations(cRe, cIm, real, imag, maxIterations, false, periodicityChecking);
  return iterations === maxIterations;
}