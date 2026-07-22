import type { ReferenceOrbit } from '../perturbation/types';

// Core Mandelbrot strategy – pure mathematical helpers that can be shared
// with other fractal implementations (Julia, Burning Ship, Buffalo, …).

// How close two complex numbers must be to be considered equal when testing
// for periodicity. Small enough to avoid false positives, large enough to
// tolerate floating‑point drift over many iterations.
export const PERIODICITY_EPSILON = 1e-12;

/**
 * Exact algebraic test for membership in the two largest interior regions of
 * the Mandelbrot set: the main cardioid and the period‑2 bulb.
 * This is a deterministic, closed‑form test – not a heuristic.
 */
export function isInMainCardioidOrBulb(
  cRe: number,
  cIm: number
): boolean {
  const shiftedRe = cRe - 0.25;
  const q = shiftedRe * shiftedRe + cIm * cIm;
  // Main cardioid test
  if (q * (q + shiftedRe) <= 0.25 * cIm * cIm) {
    return true;
  }
  // Period‑2 bulb test
  const bulbRe = cRe + 1;
  if (bulbRe * bulbRe + cIm * cIm <= 0.0625) {
    return true;
  }
  return false;
}

/**
 * Perform the classic Mandelbrot escape‑time iteration for a single point.
 *
 * @param cRe Real part of the constant c.
 * @param cIm Imaginary part of the constant c.
 * @param maxIterations Maximum number of iterations allowed.
 * @param geometricCulling Whether to use the fast‑path geometric test.
 * @param periodicityChecking Whether to use periodicity detection.
 *
 * @returns Number of iterations before the point escaped (or maxIterations).
 */
export function escapeIterations(
  cRe: number,
  cIm: number,
  maxIterations: number,
  geometricCulling: boolean,
  periodicityChecking: boolean
): number {
  // Fast geometric test for points known to be inside the set.
  if (geometricCulling && isInMainCardioidOrBulb(cRe, cIm)) {
    return maxIterations;
  }

  let zRe = 0;
  let zIm = 0;
  let iter = 0;

  // For periodicity checking we need a reference pair of (zRe, zIm).
  let checkRe = 0;
  let checkIm = 0;
  let checkCounter = 0;
  let checkPeriod = 10;

  const escapeRadiusSquared = 4; // radius^2 = 4

  while (iter < maxIterations && (zRe * zRe + zIm * zIm) < escapeRadiusSquared) {
    const nextRe = zRe * zRe - zIm * zIm + cRe;
    const nextIm = 2 * zRe * zIm + cIm;
    zRe = nextRe;
    zIm = nextIm;
    iter += 1;

    if (periodicityChecking) {
      // Detect a repeated state that signals a cycle.
      if (
        Math.abs(zRe - checkRe) < PERIODICITY_EPSILON &&
        Math.abs(zIm - checkIm) < PERIODICITY_EPSILON
      ) {
        return maxIterations; // treat as if it never escaped
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

/**
 * Iterates a single reference point through the full Mandelbrot loop,
 * recording every Z value (not just the final count) for use as the
 * reference orbit in perturbation rendering.
 *
 * Unlike escapeIterations, this runs once per frame rather than once per
 * pixel, so the per-pixel speed optimizations (geometric culling,
 * periodicity checking) are deliberately omitted — their cost doesn't matter
 * here, and omitting them keeps the recorded orbit simple.
 */
export function computeReferenceOrbit(
  cRe: number,
  cIm: number,
  maxIterations: number
): ReferenceOrbit {
  const re = new Float64Array(maxIterations + 1);
  const im = new Float64Array(maxIterations + 1);
  let zRe = 0;
  let zIm = 0;
  re[0] = zRe;
  im[0] = zIm;

  let iter = 0;
  const escapeRadiusSquared = 4;

  while (iter < maxIterations && (zRe * zRe + zIm * zIm) < escapeRadiusSquared) {
    const nextRe = zRe * zRe - zIm * zIm + cRe;
    const nextIm = 2 * zRe * zIm + cIm;
    zRe = nextRe;
    zIm = nextIm;
    iter += 1;
    re[iter] = zRe;
    im[iter] = zIm;
  }

  return {
    re,
    im,
    length: iter + 1, // includes index 0
    escaped: iter < maxIterations,
  };
}