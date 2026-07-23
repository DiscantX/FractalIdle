import { WorkerTask, WorkerResponse } from '../../types';
import {
  escapeIterations,
  isInMainCardioidOrBulb,
  PERIODICITY_EPSILON,
} from '../../core/strategies/mandelbrot';
// Color mapping (palette lookup + HSL adjustments) now happens on the main
// thread in Stage 2; the worker only emits the scalar field. See
// color-stage-split-handoff.md.
import { clamp01 } from '../../utils/math';
import { perturbationEscapeIterations } from '../../core/strategies/mandelbrot';

// -----------------------------------------------------
// Solid-guessing heuristic
// -----------------------------------------------------
function isPixelInSet(payload: WorkerTask, x: number, y: number): boolean {
  const cRe = payload.centerRe + (payload.flipX ? -1 : 1) * (x - payload.width / 2) * payload.scaleRe;
  const cIm = payload.centerIm + (payload.flipY ? -1 : 1) * (y - payload.height / 2) * payload.scaleIm;
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

// Solid interior is uniform: the interior scalar (maxIterations). Stage 2 maps it
// to the correct color for the current palette/adjustments.
function getSolidInteriorValue(payload: WorkerTask): number {
  return payload.maxIterations;
}

function fillSolidTile(data: Float32Array, value: number) {
  for (let offset = 0; offset < data.length; offset += 1) {
    data[offset] = value;
  }
}

// -----------------------------------------------------
// Main worker entry point
// -----------------------------------------------------
self.onmessage = (event: MessageEvent<WorkerTask>) => {
  const payload = event.data;
  const pixelCount =
    (payload.rowEnd - payload.rowStart) * (payload.colEnd - payload.colStart);
  const data = new Float32Array(pixelCount);
  let steps = 0;
  let culledPixels = 0;
  let periodicityShortCircuits = 0;

  const canSolidGuess =
    payload.solidGuessing &&
    !payload.referenceOrbit &&
    payload.colorMode !== 'distance-estimation' &&
    (payload.colEnd - payload.colStart) > 2 &&
    (payload.rowEnd - payload.rowStart) > 2;

  if (canSolidGuess && isTileBorderFullyInSet(payload)) {
    fillSolidTile(data, getSolidInteriorValue(payload));
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
      const cRe = centerRe + (payload.flipX ? -1 : 1) * (x - payload.width / 2) * scaleRe;
      const cIm = centerIm + (payload.flipY ? -1 : 1) * (y - payload.height / 2) * scaleIm;

let zRe = 0,
        zIm = 0,
        iter = 0,
        escapeRadiusSquared = 0;

      if (payload.referenceOrbit) {
        const orbit = payload.referenceOrbit;
        const deltaRe = cRe - orbit.cRe;
        const deltaIm = cIm - orbit.cIm;
        const result = perturbationEscapeIterations(
          orbit,
          deltaRe,
          deltaIm,
          payload.maxIterations,
          payload.geometricCulling,
          payload.periodicityChecking,
          payload.seriesCoefficients,
          payload.skipIteration,
        );
        iter = result.iterations;
        escapeRadiusSquared = result.escapeRadiusSquared;
        steps += iter;
      } else if (payload.geometricCulling && isInMainCardioidOrBulb(cRe, cIm)) {
        iter = payload.maxIterations;
        culledPixels += 1;
      } else {
        let checkRe = 0,
          checkIm = 0,
          checkCounter = 0,
          checkPeriod = 10;

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
      }

      // --- Scalar output (no color) ---
      // valueForPalette drives Stage 2's palette lookup. Palette-range
      // normalization and the palette/adjustment mapping happen on the main
      // thread, so the worker only emits the raw scalar.
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

      data[offset++] = valueForPalette;
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