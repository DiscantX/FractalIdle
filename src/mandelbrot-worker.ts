import { WorkerTask, WorkerResponse } from './types';
import { Rgb, getPaletteColor, getWorldMapColor, applyAdjustments } from './utils/color';
import { clamp01, lerp } from './utils/math';

// Tolerance for declaring two z values "the same" during periodicity
// checking. Small enough to avoid false positives on slowly-diverging
// orbits, large enough to actually catch periodic cycles despite floating
// point drift over many iterations.
const PERIODICITY_EPSILON = 1e-12;

// How many noise lattice cells span one unit of the complex plane. Larger =
// finer/busier terrain features, smaller = broader/smoother ones. Tune this
// by eye once you're looking at real output — it interacts with how large
// the bulb you're viewing is.
const NOISE_SCALE = 25;
const FRACTAL_NOISE_OCTAVES = 4;

self.onmessage = (event: MessageEvent<WorkerTask>) => {
  const payload = event.data;
  const pixelCount = (payload.rowEnd - payload.rowStart) * (payload.colEnd - payload.colStart);
  const data = new Uint8ClampedArray(pixelCount * 4);
  let steps = 0;

  const canSolidGuess = payload.solidGuessing
    && payload.colorMode !== 'distance-estimation'
    && !(payload.palette === 'world-map' && payload.interiorDetail)
    && (payload.colEnd - payload.colStart) > 2
    && (payload.rowEnd - payload.rowStart) > 2;

  if (canSolidGuess && isTileBorderFullyInSet(payload)) {
    fillSolidTile(data, getSolidInteriorColor(payload));

    const response: WorkerResponse = {
      renderId: payload.renderId,
      rowStart: payload.rowStart,
      rowEnd: payload.rowEnd,
      colStart: payload.colStart,
      colEnd: payload.colEnd,
      data,
      steps: pixelCount * payload.maxIterations,
      solidGuessed: true,
    };
    self.postMessage(response);
    return;
  }

  const centerRe = payload.centerRe;
  const centerIm = payload.centerIm;
  const scaleRe = payload.scaleRe;
  const scaleIm = payload.scaleIm;

  let offset = 0;
  let culledPixels = 0;
  let periodicityShortCircuits = 0;
  

  for (let y = payload.rowStart; y < payload.rowEnd; y += 1) {
    for (let x = payload.colStart; x < payload.colEnd; x += 1) {
      const cRe = centerRe + (x - payload.width / 2) * scaleRe;
      const cIm = centerIm + (y - payload.height / 2) * scaleIm;

let zRe = 0;
      let zIm = 0;
      let iter = 0;
      let escapeRadiusSquared = 0;

      // Interior-elevation proxy (world-map palette only, see color.ts).
      // Left undefined for exterior/escaping pixels -- only ever meaningful
      // when the pixel turns out to be interior (iter reaches maxIterations).
      let interiorProgress: number | undefined;

      if (payload.geometricCulling && isInMainCardioidOrBulb(cRe, cIm)) {
        iter = payload.maxIterations;
        culledPixels += 1;
        // Exact algebraic membership (not a heuristic) -- these are the two
        // largest, deepest interior regions of the set, so treat them as
        // minimum elevation (before noise) without spending any iterations
        // to find out.
        if (payload.interiorDetail) {
          interiorProgress = applyInteriorNoise(0, cRe, cIm, payload);
        }
      } else {
        let checkRe = 0;
        let checkIm = 0;
        let checkCounter = 0;
        let checkPeriod = 10;
        let periodicityHit = false;
        // Defaults to maxIterations: if periodicity is never detected before
        // the budget runs out, treat that as the slowest-converging (and
        // therefore closest-to-boundary) case we can measure.
        let detectionIter = payload.maxIterations;

        while (iter < payload.maxIterations && escapeRadiusSquared < 4) {
          const nextRe = zRe * zRe - zIm * zIm + cRe;
          const nextIm = 2 * zRe * zIm + cIm;
          zRe = nextRe;
          zIm = nextIm;
          escapeRadiusSquared = zRe * zRe + zIm * zIm;
          iter += 1;

          if (payload.periodicityChecking) {
            if (Math.abs(zRe - checkRe) < PERIODICITY_EPSILON && Math.abs(zIm - checkIm) < PERIODICITY_EPSILON) {
              detectionIter = iter;
              iter = payload.maxIterations;
              periodicityHit = true;
              break;
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

        steps += iter;
        if (periodicityHit) {
          periodicityShortCircuits += 1;
        }

        // STOPGAP PROXY, not true interior distance estimation -- see
        // idle-fractal-game-design.md. Cycle-multiplier magnitude near 1
        // (i.e. near a bulb's boundary) converges slowly, so periodicity
        // takes longer to detect there than deep inside a bulb. We reuse
        // that convergence speed as a cheap stand-in for true distance.
        if (payload.interiorDetail && iter === payload.maxIterations) {
          const baseProgress = clamp01(detectionIter / payload.maxIterations);
          interiorProgress = applyInteriorNoise(baseProgress, cRe, cIm, payload);
        }
      }
      
      let valueForPalette: number;

      if (payload.colorMode === 'distance-estimation') {
        const dist = Math.sqrt(escapeRadiusSquared || 0);
        const t = clamp01(1 - 1 / (dist + 1));
        valueForPalette = t * payload.maxIterations;
      } else {
        let baseIter = iter;
        if ((payload.colorMode === 'smooth') || (payload.smoothColoring && payload.colorMode === 'escape-time')) {
          if (iter < payload.maxIterations && escapeRadiusSquared > 0) {
            const logZn = Math.log(escapeRadiusSquared) / 2;
            const nu = iter + 1 - Math.log(logZn) / Math.log(2);
            baseIter = nu;
          }
        }
        valueForPalette = baseIter;
      }

      const minIterations = payload.autoAdjustColors ? 0 : Math.min(payload.paletteMinIterations, payload.paletteMaxIterations);
      const maxIterations = payload.autoAdjustColors ? Math.max(1, payload.maxIterations) : Math.max(1, Math.max(payload.paletteMinIterations, payload.paletteMaxIterations));
      const denom = Math.max(1, maxIterations - minIterations);
      const palettePosition = clamp01((valueForPalette - minIterations) / denom);

      let color: Rgb;
      if (payload.colorMode === 'black-white') {
        const gray = iter >= payload.maxIterations ? 0 : 255;
        color = { r: gray, g: gray, b: gray };
      } else if (payload.palette === 'world-map') {
        color = getWorldMapColor(iter, payload.maxIterations, interiorProgress);
      } else {
        color = getPaletteColor(palettePosition, payload.palette, payload.reverseColors, payload.colorCycles);
      }

      const adjusted = applyAdjustments(color, payload.hueShift, payload.saturation, payload.lightness, payload.colorSpace);

      data[offset] = adjusted.r;
      data[offset + 1] = adjusted.g;
      data[offset + 2] = adjusted.b;
      data[offset + 3] = 255;
      offset += 4;
    }
  }

const response: WorkerResponse = {
    renderId: payload.renderId,
    rowStart: payload.rowStart,
    rowEnd: payload.rowEnd,
    colStart: payload.colStart,
    colEnd: payload.colEnd,
    data,
    steps,
    culledPixels,
    periodicityShortCircuits
  };

// Exact algebraic membership tests for the two largest "always solid"
// regions of the Mandelbrot set. Not a heuristic like solid-guessing —
// these are closed-form guarantees, so this is always safe to apply.
function isInMainCardioidOrBulb(cRe: number, cIm: number): boolean {
  const shiftedRe = cRe - 0.25;
  const q = shiftedRe * shiftedRe + cIm * cIm;
  if (q * (q + shiftedRe) <= 0.25 * cIm * cIm) {
    return true; // main cardioid
  }

  const bulbRe = cRe + 1;
  if (bulbRe * bulbRe + cIm * cIm <= 0.0625) {
    return true; // period-2 bulb
  }

  return false;
}

function escapeIterations(cRe: number, cIm: number, maxIterations: number, geometricCulling: boolean, periodicityChecking: boolean): number {
  if (geometricCulling && isInMainCardioidOrBulb(cRe, cIm)) {
    return maxIterations;
  }

  let zRe = 0;
  let zIm = 0;
  let iter = 0;
  let escapeRadiusSquared = 0;

  let checkRe = 0;
  let checkIm = 0;
  let checkCounter = 0;
  let checkPeriod = 10;

  while (iter < maxIterations && escapeRadiusSquared < 4) {
    const nextRe = zRe * zRe - zIm * zIm + cRe;
    const nextIm = 2 * zRe * zIm + cIm;
    zRe = nextRe;
    zIm = nextIm;
    escapeRadiusSquared = zRe * zRe + zIm * zIm;
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

// Deterministic pseudo-random hash for an integer lattice point. Same inputs
// always produce the same output, which is what makes the noise "coherent"
// (stable across renders) rather than flickering static.
function hashLattice(ix: number, iy: number): number {
  let h = ix * 374761393 + iy * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

// Classic 2D value noise: hash the four lattice points surrounding (x, y),
// then smoothly interpolate between them. Smoothstep easing (the cubic u/v
// below) avoids visible creases at cell boundaries that plain linear
// interpolation would leave. Returns a value in [0, 1].
function valueNoise2D(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const sx = x - x0;
  const sy = y - y0;

  const u = sx * sx * (3 - 2 * sx);
  const v = sy * sy * (3 - 2 * sy);

  const n00 = hashLattice(x0, y0);
  const n10 = hashLattice(x1, y0);
  const n01 = hashLattice(x0, y1);
  const n11 = hashLattice(x1, y1);

  const nx0 = lerp(n00, n10, u);
  const nx1 = lerp(n01, n11, u);
  return lerp(nx0, nx1, v);
}

// Fractal Brownian motion: sum several octaves of value noise at doubling
// frequency and halving amplitude. Produces more irregular, ridge-like
// detail than a single octave, at a proportional cost in extra noise calls.
function fractalNoise2D(x: number, y: number): number {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let maxAmplitude = 0;

  for (let i = 0; i < FRACTAL_NOISE_OCTAVES; i += 1) {
    sum += valueNoise2D(x * frequency, y * frequency) * amplitude;
    maxAmplitude += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return sum / maxAmplitude;
}

function getInteriorNoise(cRe: number, cIm: number, mode: 'single' | 'fractal'): number {
  const nx = cRe * NOISE_SCALE;
  const ny = cIm * NOISE_SCALE;
  return mode === 'fractal' ? fractalNoise2D(nx, ny) : valueNoise2D(nx, ny);
}

// Perturbs a smooth base elevation value with noise, so equal-elevation
// contours stop being perfect rings. strength=0 leaves baseProgress
// untouched; strength=1 lets noise swing it by a full +/-1 before clamping.
function applyInteriorNoise(baseProgress: number, cRe: number, cIm: number, payload: WorkerTask): number {
  if (payload.interiorNoiseStrength <= 0) {
    return baseProgress;
  }
  const noise = getInteriorNoise(cRe, cIm, payload.interiorNoiseMode);
  const perturbed = baseProgress + (noise - 0.5) * 2 * payload.interiorNoiseStrength;
  return clamp01(perturbed);
}

function isPixelInSet(payload: WorkerTask, x: number, y: number): boolean {
  const cRe = payload.centerRe + (x - payload.width / 2) * payload.scaleRe;
  const cIm = payload.centerIm + (y - payload.height / 2) * payload.scaleIm;
  return escapeIterations(cRe, cIm, payload.maxIterations, payload.geometricCulling, payload.periodicityChecking) === payload.maxIterations;
}

// Heuristic "solid guessing": if a tile's entire outer perimeter is inside
// the set, assume the interior is too and skip computing it pixel-by-pixel.
// Not a mathematical guarantee, but a well-established technique in
// real-world fractal explorers (Fractint, Kalles Fraktaler, etc.).
function isTileBorderFullyInSet(payload: WorkerTask): boolean {
  for (let x = payload.colStart; x < payload.colEnd; x += 1) {
    if (!isPixelInSet(payload, x, payload.rowStart)) return false;
    if (!isPixelInSet(payload, x, payload.rowEnd - 1)) return false;
  }

  for (let y = payload.rowStart; y < payload.rowEnd; y += 1) {
    if (!isPixelInSet(payload, payload.colStart, y)) return false;
    if (!isPixelInSet(payload, payload.colEnd - 1, y)) return false;
  }

  return true;
}

// Mirrors the "in-set" branch of the main per-pixel color logic below, for
// the case where iter === maxIterations. Every fully-interior pixel resolves
// to this same color in escape-time/smooth/black-white modes (smoothing
// only applies when iter < maxIterations).
function getSolidInteriorColor(payload: WorkerTask): Rgb {
  if (payload.colorMode === 'black-white') {
    return { r: 0, g: 0, b: 0 };
  }

  if (payload.palette === 'world-map') {
    return getWorldMapColor(payload.maxIterations, payload.maxIterations);
  }

  const valueForPalette = payload.maxIterations;
  const minIterations = payload.autoAdjustColors
    ? 0
    : Math.min(payload.paletteMinIterations, payload.paletteMaxIterations);
  const maxIterationsForPalette = payload.autoAdjustColors
    ? Math.max(1, payload.maxIterations)
    : Math.max(1, Math.max(payload.paletteMinIterations, payload.paletteMaxIterations));
  const denom = Math.max(1, maxIterationsForPalette - minIterations);
  const palettePosition = clamp01((valueForPalette - minIterations) / denom);

  const color = getPaletteColor(palettePosition, payload.palette, payload.reverseColors, payload.colorCycles);
  return applyAdjustments(color, payload.hueShift, payload.saturation, payload.lightness, payload.colorSpace);
}

function fillSolidTile(data: Uint8ClampedArray, color: Rgb) {
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = color.r;
    data[offset + 1] = color.g;
    data[offset + 2] = color.b;
    data[offset + 3] = 255;
  }
}

  self.postMessage(response);
};
