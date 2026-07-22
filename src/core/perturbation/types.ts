// A reference orbit: the iterated path of one point (the "reference"), sampled
// down to float64 for use by the per-pixel delta iteration, which is always
// float64 regardless of how the orbit itself was computed. See
// perturbation-precision-handoff.md.
export type ReferenceOrbit = {
  // Z_n values, index = iteration number.
  re: Float64Array;
  im: Float64Array;
  // Iterations actually computed (<= maxIterations — stops early if the
  // reference point itself escapes).
  length: number;
  escaped: boolean;
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