import type { ReferenceOrbit, SeriesCoefficients } from '../perturbation/types';

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
    cRe,
    cIm,
    re,
    im,
    length: iter + 1,
    escaped: iter < maxIterations,
  };
}

/**
 * Computes series-approximation coefficients A_n, B_n (order-2 approximation
 * of delta as a power series in deltaC), plus C_n (the next, untrusted term —
 * kept only as a formal truncation-error estimate). Derived by substituting
 * delta_n = A_n*deltaC + B_n*deltaC^2 + C_n*deltaC^3 + ... into the
 * perturbation recurrence delta_{n+1} = 2*Z_n*delta_n + delta_n^2 + deltaC
 * and matching same-power terms:
 *
 *   A_{n+1} = 2*Z_n*A_n + 1
 *   B_{n+1} = 2*Z_n*B_n + A_n^2
 *   C_{n+1} = 2*Z_n*C_n + 2*A_n*B_n
 *
 * All complex; all start at 0 (mirrors delta_0 = 0 for every pixel — see
 * perturbationEscapeIterations). Runs once per layer, alongside
 * computeReferenceOrbit — same per-layer-not-per-pixel cost profile.
 */
export function computeSeriesCoefficients(orbit: ReferenceOrbit): SeriesCoefficients {
  const n = orbit.length;
  const aRe = new Float64Array(n);
  const aIm = new Float64Array(n);
  const bRe = new Float64Array(n);
  const bIm = new Float64Array(n);
  const cRe = new Float64Array(n);
  const cIm = new Float64Array(n);

  // Index 0 is already correctly all-zero (Float64Array default-initializes).
  for (let i = 0; i < n - 1; i++) {
    const zRe = orbit.re[i];
    const zIm = orbit.im[i];
    const aRe_i = aRe[i], aIm_i = aIm[i];
    const bRe_i = bRe[i], bIm_i = bIm[i];
    const cRe_i = cRe[i], cIm_i = cIm[i];

    // 2*Z_n*A_n (complex multiply, doubled)
    const twoZA_re = 2 * (zRe * aRe_i - zIm * aIm_i);
    const twoZA_im = 2 * (zRe * aIm_i + zIm * aRe_i);
    aRe[i + 1] = twoZA_re + 1; // the "+1" is deltaC's own coefficient — real-valued
    aIm[i + 1] = twoZA_im;

    // 2*Z_n*B_n + A_n^2
    const twoZB_re = 2 * (zRe * bRe_i - zIm * bIm_i);
    const twoZB_im = 2 * (zRe * bIm_i + zIm * bRe_i);
    const aSq_re = aRe_i * aRe_i - aIm_i * aIm_i;
    const aSq_im = 2 * aRe_i * aIm_i;
    bRe[i + 1] = twoZB_re + aSq_re;
    bIm[i + 1] = twoZB_im + aSq_im;

    // 2*Z_n*C_n + 2*A_n*B_n
    const twoZC_re = 2 * (zRe * cRe_i - zIm * cIm_i);
    const twoZC_im = 2 * (zRe * cIm_i + zIm * cRe_i);
    const twoAB_re = 2 * (aRe_i * bRe_i - aIm_i * bIm_i);
    const twoAB_im = 2 * (aRe_i * bIm_i + aIm_i * bRe_i);
    cRe[i + 1] = twoZC_re + twoAB_re;
    cIm[i + 1] = twoZC_im + twoAB_im;
  }

  return { aRe, aIm, bRe, bIm, cRe, cIm, length: n };
}

/**
 * Evaluates the order-2 series approximation (A_n*deltaC + B_n*deltaC^2) at
 * a specific iteration n, for a specific pixel's deltaC. This is the
 * skip-ahead: instead of iterating delta from n=0, a pixel can start here.
 */
export function evaluateSeriesApproximation(
  coeffs: SeriesCoefficients,
  deltaRe: number,
  deltaIm: number,
  n: number
): { deltaRe: number; deltaIm: number } {
  const aRe = coeffs.aRe[n], aIm = coeffs.aIm[n];
  const bRe = coeffs.bRe[n], bIm = coeffs.bIm[n];

  // A_n * deltaC (complex multiply)
  const termA_re = aRe * deltaRe - aIm * deltaIm;
  const termA_im = aRe * deltaIm + aIm * deltaRe;

  // deltaC^2, then B_n * deltaC^2
  const deltaCSq_re = deltaRe * deltaRe - deltaIm * deltaIm;
  const deltaCSq_im = 2 * deltaRe * deltaIm;
  const termB_re = bRe * deltaCSq_re - bIm * deltaCSq_im;
  const termB_im = bRe * deltaCSq_im + bIm * deltaCSq_re;

  return {
    deltaRe: termA_re + termB_re,
    deltaIm: termA_im + termB_im,
  };
}

/**
 * Formal error bound: the magnitude of the first UNTRUSTED term (C_n *
 * deltaC^3) — a worst-case estimate of how much the order-2 truncation could
 * be wrong by at iteration n, for this pixel's deltaC. This is a standard,
 * conservative bound (the true error is the sum of ALL higher-order terms,
 * but for a well-behaved, converging series each successive term is smaller
 * than the last, so the first dropped term dominates the estimate).
 *
 * Does not itself decide validity — callers compare this against a
 * tolerance (see determineSkipIteration in the next step).
 */
export function estimateSeriesError(
  coeffs: SeriesCoefficients,
  deltaRe: number,
  deltaIm: number,
  n: number
): number {
  const cRe = coeffs.cRe[n], cIm = coeffs.cIm[n];

  // deltaC^3 = deltaC^2 * deltaC
  const deltaCSq_re = deltaRe * deltaRe - deltaIm * deltaIm;
  const deltaCSq_im = 2 * deltaRe * deltaIm;
  const deltaCCube_re = deltaCSq_re * deltaRe - deltaCSq_im * deltaIm;
  const deltaCCube_im = deltaCSq_re * deltaIm + deltaCSq_im * deltaRe;

  // C_n * deltaC^3 (complex multiply), then its magnitude.
  const termC_re = cRe * deltaCCube_re - cIm * deltaCCube_im;
  const termC_im = cRe * deltaCCube_im + cIm * deltaCCube_re;

  return Math.sqrt(termC_re * termC_re + termC_im * termC_im);
}

/**
 * Per-pixel delta iteration against a precomputed reference orbit.
 * geometricCulling / periodicityChecking mirror escapeIterations's contract,
 * applied to the pixel's actual reconstructed z/c — see notes below.
 *
 * If the reference orbit runs out before this pixel escapes or maxIterations
 * is reached (the reference point itself escaped early), falls back to
 * direct iteration from the last known z, continuing the iteration count
 * rather than restarting it. This is a narrower, deterministic case of the
 * general "glitch fallback" pattern production perturbation renderers use —
 * it doesn't require the general glitch-detection machinery deferred earlier,
 * since "ran out of orbit data" is a simple length check, not a heuristic.
 */
export function perturbationEscapeIterations(
  orbit: ReferenceOrbit,
  deltaRe: number,
  deltaIm: number,
  maxIterations: number,
  geometricCulling: boolean,
  periodicityChecking: boolean
): { iterations: number; escapeRadiusSquared: number } {
  const pixelCre = orbit.cRe + deltaRe;
  const pixelCim = orbit.cIm + deltaIm;

  if (geometricCulling && isInMainCardioidOrBulb(pixelCre, pixelCim)) {
    return { iterations: maxIterations, escapeRadiusSquared: 0 };
  }

  // δ_0 = 0 for every pixel — NOT deltaRe/deltaIm. Both the reference point
  // and every pixel start their Mandelbrot orbit at z=0 regardless of c, so
  // there is no initial offset between them. δc (deltaRe/deltaIm) only enters
  // as the additive term inside the iteration formula below. Starting dRe/dIm
  // at deltaRe/deltaIm instead of 0 is the single most common perturbation
  // implementation bug — worth internalizing why it's wrong, not just avoiding it.
  let dRe = 0;
  let dIm = 0;
  let iter = 0;
  const escapeRadiusSquared = 4;

  let checkRe = 0;
  let checkIm = 0;
  let checkCounter = 0;
  let checkPeriod = 10;

  while (iter < maxIterations && iter < orbit.length - 1) {
    const zRefRe = orbit.re[iter];
    const zRefIm = orbit.im[iter];

    // δ_{n+1} = 2·Z_n·δ_n + δ_n² + δc
    const nextDre = 2 * (zRefRe * dRe - zRefIm * dIm) + (dRe * dRe - dIm * dIm) + deltaRe;
    const nextDim = 2 * (zRefRe * dIm + zRefIm * dRe) + 2 * dRe * dIm + deltaIm;
    dRe = nextDre;
    dIm = nextDim;
    iter += 1;

    const zRe = orbit.re[iter] + dRe;
    const zIm = orbit.im[iter] + dIm;
    const mag = zRe * zRe + zIm * zIm;

    if (mag >= escapeRadiusSquared) {
      return { iterations: iter, escapeRadiusSquared: mag };
    }

    if (periodicityChecking) {
      if (Math.abs(zRe - checkRe) < PERIODICITY_EPSILON && Math.abs(zIm - checkIm) < PERIODICITY_EPSILON) {
        return { iterations: maxIterations, escapeRadiusSquared: mag };
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

  if (iter >= maxIterations) {
    return { iterations: maxIterations, escapeRadiusSquared: 0 };
  }

  // Orbit exhausted — the reference point escaped before this pixel did (or
  // before maxIterations was reached for an interior-looking pixel). Continue
  // iterating directly from the last known z, using the pixel's own real c —
  // the ordinary Mandelbrot formula, just picking up mid-orbit.
  let zRe = orbit.re[iter] + dRe;
  let zIm = orbit.im[iter] + dIm;
  let mag = zRe * zRe + zIm * zIm;

  while (iter < maxIterations && mag < escapeRadiusSquared) {
    const nextRe = zRe * zRe - zIm * zIm + pixelCre;
    const nextIm = 2 * zRe * zIm + pixelCim;
    zRe = nextRe;
    zIm = nextIm;
    mag = zRe * zRe + zIm * zIm;
    iter += 1;

    if (periodicityChecking) {
      if (Math.abs(zRe - checkRe) < PERIODICITY_EPSILON && Math.abs(zIm - checkIm) < PERIODICITY_EPSILON) {
        return { iterations: maxIterations, escapeRadiusSquared: mag };
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

  return { iterations: iter, escapeRadiusSquared: mag };
}