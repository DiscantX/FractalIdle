import { WorkerTask, WorkerResponse } from './types';
import { Rgb, getPaletteColor, applyAdjustments } from './utils/color';
import { clamp01 } from './utils/math';

self.onmessage = (event: MessageEvent<WorkerTask>) => {
  const payload = event.data;
  const pixelCount = (payload.rowEnd - payload.rowStart) * (payload.colEnd - payload.colStart);
  const data = new Uint8ClampedArray(pixelCount * 4);
  let steps = 0;

  const centerRe = payload.centerRe;
  const centerIm = payload.centerIm;
  const scaleRe = payload.scaleRe;
  const scaleIm = payload.scaleIm;

  let offset = 0;

  for (let y = payload.rowStart; y < payload.rowEnd; y += 1) {
    for (let x = payload.colStart; x < payload.colEnd; x += 1) {
      const cRe = centerRe + (x - payload.width / 2) * scaleRe;
      const cIm = centerIm + (y - payload.height / 2) * scaleIm;

      let zRe = 0;
      let zIm = 0;
      let iter = 0;
      let escapeRadiusSquared = 0;

      while (iter < payload.maxIterations && escapeRadiusSquared < 4) {
        const nextRe = zRe * zRe - zIm * zIm + cRe;
        const nextIm = 2 * zRe * zIm + cIm;
        zRe = nextRe;
        zIm = nextIm;
        escapeRadiusSquared = zRe * zRe + zIm * zIm;
        iter += 1;
      }

      steps += iter;
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
  };

  self.postMessage(response);
};
