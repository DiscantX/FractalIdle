import { WorkerTask, WorkerResponse } from '../../types';
import {
  escapeIterations,
  isInMainCardioidOrBulb,
  PERIODICITY_EPSILON,
} from '../../core/strategies/mandelbrot';
import { Rgb, getPaletteColor, getWorldMapColor, applyAdjustments } from '../../utils/color';
import { clamp01, lerp } from '../../utils/math';

// TODO(Slice 5 - palette plugins): interior-detail settings belong to
// the world-map palette, not core settings. Hardcoded to "off" until
// they're re-homed as palette-owned settings.
const NOISE_SCALE = 25;
const FRACTAL_NOISE_OCTAVES = 4;

// -----------------------------------------------------
// Noise utilities for interior-detail (world-map palette)
// -----------------------------------------------------
function hashLattice(ix: number, iy: number): number {
  let h = ix * 374761393 + iy * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

function valueNoise2D(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const sx = x - x0;
  const sy = y - y0;
  const u = sx * sx * (3 - 2 * sx);
  const v = sy * sy * (3 - 2 * sy);
  return lerp(
    lerp(hashLattice(x0, y0), hashLattice(x1, y0), u),
    lerp(hashLattice(x0, y1), hashLattice(x1, y1), u),
    v
  );
}

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

function getInteriorNoise(
  cRe: number,
  cIm: number,
  mode: 'single' | 'fractal'
): number {
  const nx = cRe * NOISE_SCALE;
  const ny = cIm * NOISE_SCALE;
  return mode === 'fractal' ? fractalNoise2D(nx, ny) : valueNoise2D(nx, ny);
}

function applyInteriorNoise(
  baseProgress: number,
  cRe: number,
  cIm: number,
  payload: WorkerTask
): number {
  if (payload.interiorNoiseStrength <= 0) return baseProgress;
  const noise = getInteriorNoise(cRe, cIm, payload.interiorNoiseMode);
  const perturbed = baseProgress + (noise - 0.5) * 2 * payload.interiorNoiseStrength;
  return clamp01(perturbed);
}

// -----------------------------------------------------
// Solid-guessing heuristic
// -----------------------------------------------------
function isPixelInSet(payload: WorkerTask, x: number, y: number): boolean {
  const cRe = payload.centerRe + (x - payload.width / 2) * payload.scaleRe;
  const cIm = payload.centerIm + (y - payload.height / 2) * payload.scaleIm;
  return (
    escapeIterations(
      cRe,
      cIm,
      payload.maxIterations,
      payload.geometricCulling,
      payload.periodicityChecking
    ) === payload.maxIterations
  );
}

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

function getSolidInteriorColor(payload: WorkerTask): Rgb {
  if (payload.colorMode === 'black-white') {
    return { r: 0, g: 0, b: 0 };
  }
  if (payload.palette === 'world-map') {
    return getWorldMapColor(payload.maxIterations, payload.maxIterations);
  }
  const minI = payload.autoAdjustColors ? 0 : Math.min(payload.paletteMinIterations, payload.paletteMaxIterations);
  const maxI = payload.autoAdjustColors
    ? Math.max(1, payload.maxIterations)
    : Math.max(1, Math.max(payload.paletteMinIterations, payload.paletteMaxIterations));
  const pos = clamp01((payload.maxIterations - minI) / Math.max(1, maxI - minI));
  const color = getPaletteColor(pos, payload.palette, payload.reverseColors, payload.colorCycles);
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

// -----------------------------------------------------
// Main worker entry point
// -----------------------------------------------------
self.onmessage = (event: MessageEvent<WorkerTask>) => {
  const payload = event.data;
  const pixelCount =
    (payload.rowEnd - payload.rowStart) * (payload.colEnd - payload.colStart);
  const data = new Uint8ClampedArray(pixelCount * 4);
  let steps = 0;
  let culledPixels = 0;
  let periodicityShortCircuits = 0;

  const canSolidGuess =
    payload.solidGuessing &&
    payload.colorMode !== 'distance-estimation' &&
    !(payload.palette === 'world-map' && payload.interiorDetail) &&
    (payload.colEnd - payload.colStart) > 2 &&
    (payload.rowEnd - payload.rowStart) > 2;

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

  for (let y = payload.rowStart; y < payload.rowEnd; y += 1) {
    for (let x = payload.colStart; x < payload.colEnd; x += 1) {
      const cRe = centerRe + (x - payload.width / 2) * scaleRe;
      const cIm = centerIm + (y - payload.height / 2) * scaleIm;

      let zRe = 0,
        zIm = 0,
        iter = 0,
        escapeRadiusSquared = 0;
      let interiorProgress: number | undefined;

      if (payload.geometricCulling && isInMainCardioidOrBulb(cRe, cIm)) {
        iter = payload.maxIterations;
        culledPixels += 1;
        if (payload.interiorDetail) {
          interiorProgress = applyInteriorNoise(0, cRe, cIm, payload);
        }
      } else {
        let checkRe = 0,
          checkIm = 0,
          checkCounter = 0,
          checkPeriod = 10;
        let detectionIter = payload.maxIterations;

        while (iter < payload.maxIterations && escapeRadiusSquared < 4) {
          const nextRe = zRe * zRe - zIm * zIm + cRe;
          const nextIm = 2 * zRe * zIm + cIm;
          zRe = nextRe;
          zIm = nextIm;
          escapeRadiusSquared = zRe * zRe + zIm * zIm;
          iter += 1;

          if (payload.periodicityChecking) {
            if (
              Math.abs(zRe - checkRe) < PERIODICITY_EPSILON &&
              Math.abs(zIm - checkIm) < PERIODICITY_EPSILON
            ) {
              detectionIter = iter;
              iter = payload.maxIterations;
              periodicityShortCircuits += 1;
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

        if (payload.interiorDetail && iter === payload.maxIterations) {
          const baseProgress = clamp01(detectionIter / payload.maxIterations);
          interiorProgress = applyInteriorNoise(baseProgress, cRe, cIm, payload);
        }
      }

      // --- Color mapping (unchanged) ---
      let valueForPalette: number;
      if (payload.colorMode === 'distance-estimation') {
        const dist = Math.sqrt(escapeRadiusSquared || 0);
        valueForPalette = clamp01(1 - 1 / (dist + 1)) * payload.maxIterations;
      } else {
        let baseIter = iter;
        if (
          (payload.colorMode === 'smooth') ||
          (payload.smoothColoring && payload.colorMode === 'escape-time')
        ) {
          if (iter < payload.maxIterations && escapeRadiusSquared > 0) {
            const logZn = Math.log(escapeRadiusSquared) / 2;
            const nu = iter + 1 - Math.log(logZn) / Math.log(2);
            baseIter = nu;
          }
        }
        valueForPalette = baseIter;
      }

      const minIt = payload.autoAdjustColors
        ? 0
        : Math.min(payload.paletteMinIterations, payload.paletteMaxIterations);
      const maxIt = payload.autoAdjustColors
        ? Math.max(1, payload.maxIterations)
        : Math.max(1, Math.max(payload.paletteMinIterations, payload.paletteMaxIterations));
      const palettePosition = clamp01((valueForPalette - minIt) / Math.max(1, maxIt - minIt));

      let color: Rgb;
      if (payload.colorMode === 'black-white') {
        const gray = iter >= payload.maxIterations ? 0 : 255;
        color = { r: gray, g: gray, b: gray };
      } else if (payload.palette === 'world-map') {
        color = getWorldMapColor(iter, payload.maxIterations, interiorProgress);
      } else {
        color = getPaletteColor(
          palettePosition,
          payload.palette,
          payload.reverseColors,
          payload.colorCycles
        );
      }

      const adjusted = applyAdjustments(
        color,
        payload.hueShift,
        payload.saturation,
        payload.lightness,
        payload.colorSpace
      );

      data[offset++] = adjusted.r;
      data[offset++] = adjusted.g;
      data[offset++] = adjusted.b;
      data[offset++] = 255;
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
    periodicityShortCircuits,
  };

  self.postMessage(response);
};