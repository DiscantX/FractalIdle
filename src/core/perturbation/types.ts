// A reference orbit: the iterated path of one point (the "reference"), sampled
// down to float64 for use by the per-pixel delta iteration, which is always
// float64 regardless of how the orbit itself was computed. See
// perturbation-precision-handoff.md.
export type ReferenceOrbit = {
  // The reference point's own c value — needed to reconstruct a pixel's
  // actual c (referenceC + deltaC) for geometric culling and for the
  // orbit-exhaustion fallback to direct iteration.
  cRe: number;
  cIm: number;
  re: Float64Array;
  im: Float64Array;
  length: number;
  escaped: boolean;
};

/**
 * Series-approximation coefficients for a reference orbit, computed once per
 * layer alongside the orbit itself (see computeSeriesCoefficients in
 * mandelbrot.ts). A/B are the order-2 approximation terms; C is one order
 * further than we trust for the approximation itself, kept purely as a
 * formal error estimate — see the derivation notes in mandelbrot.ts.
 *
 * Each coefficient is complex (Z_n is complex, so are A_n/B_n/C_n), hence
 * paired re/im arrays, mirroring ReferenceOrbit's own re/im shape.
 */
export type SeriesCoefficients = {
  aRe: Float64Array;
  aIm: Float64Array;
  bRe: Float64Array;
  bIm: Float64Array;
  cRe: Float64Array;
  cIm: Float64Array;
  length: number;
};

// A pixel's offset from the reference point, in world coordinates — always
// float64. This is the ONE place a precision backend hands off to the
// (always-float64) delta iteration below: float64 backend subtracts directly;
// a future high-precision backend subtracts at full precision and rounds down
// to float64 only here, at the last possible moment.
export type PixelDelta = {
  deltaRe: number;
  deltaIm: number;
};

// Per-fractal-type delta iteration. Mirrors escapeIterations in
// core/strategies/*.ts — same contract (returns an iteration count), same
// per-fractal-file placement. Mandelbrot's version goes in
// core/strategies/mandelbrot.ts alongside its existing escapeIterations.
export type PerturbationIterator = (
  orbit: ReferenceOrbit,
  delta: PixelDelta,
  maxIterations: number,
) => number;