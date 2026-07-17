import { WorkerTask, WorkerResponse } from '../../types';
import { escapeIterations } from '../../core/strategies/burning-ship';
import { clamp01 } from '../../utils/math';
// Color mapping now happens on the main thread in Stage 2; the worker only emits
// the scalar field. See color-stage-split-handoff.md.

// Burning Ship fractal worker
// Uses the modified iteration: zₙ₊₁ = (|x| + |y|)² + c
// (implemented as absolute values before squaring)
self.onmessage = (event: MessageEvent<WorkerTask>) => {
  const payload = event.data;
  const pixelCount = (payload.rowEnd - payload.rowStart) * (payload.colEnd - payload.colStart);
  const data = new Float32Array(pixelCount);
  let steps = 0;

  const centerRe = payload.centerRe;
  const centerIm = payload.centerIm;
  const scaleRe = payload.scaleRe;
  const scaleIm = payload.scaleIm;

  let offset = 0;

  for (let y = payload.rowStart; y < payload.rowEnd; y += 1) {
    for (let x = payload.colStart; x < payload.colEnd; x += 1) {
      const cRe = centerRe + (payload.flipX ? -1 : 1) * (x - payload.width / 2) * scaleRe;
      const cIm = centerIm + (payload.flipY ? -1 : 1) * (y - payload.height / 2) * scaleIm;
      let zRe = 0;
      let zIm = 0;

      const iter = escapeIterations(
        cRe,
        cIm,
        zRe,
        zIm,
        payload.maxIterations,
        payload.geometricCulling,
        payload.periodicityChecking
      );

      steps += iter;

      let valueForPalette: number;
      if (payload.colorMode === 'distance-estimation') {
        const mag = Math.sqrt(zRe * zRe + zIm * zIm);
        valueForPalette = clamp01(1 - 1 / (mag + 1)) * payload.maxIterations;
      } else {
        valueForPalette = iter;
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
  };
  self.postMessage(response);
};