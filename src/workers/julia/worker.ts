import { WorkerTask, WorkerResponse } from '../../types';
import { escapeIterations } from '../../core/strategies/julia';
import { Rgb, getPaletteColor, applyAdjustments } from '../../utils/color';
import { clamp01 } from '../../utils/math';

// Julia fractal worker
// Complex constant C for the Julia set (could be set via UI later).
const JULIA_C_RE = -0.7269;
const JULIA_C_IM = 0.1889;

// The iteration starts from the pixel coordinate (z0 = pixel position), not from 0.
// For Julia sets, each pixel (real, imag) becomes the initial Z0.
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
      const cRe = centerRe + (payload.flipX ? -1 : 1) * (x - payload.width / 2) * scaleRe;
      const cIm = centerIm + (payload.flipY ? -1 : 1) * (y - payload.height / 2) * scaleIm;
      let zRe = cRe;
      let zIm = cIm;

      const iter = escapeIterations(
        JULIA_C_RE,
        JULIA_C_IM,
        zRe,
        zIm,
        payload.maxIterations,
        payload.geometricCulling,
        payload.periodicityChecking
      );

      steps += iter;

      let valueForPalette: number;
      if (payload.colorMode === 'distance-estimation') {
        const dist = Math.sqrt(zRe * zRe + zIm * zIm);
        valueForPalette = clamp01(1 - 1 / (dist + 1)) * payload.maxIterations;
      } else {
        valueForPalette = iter;
      }

      const minIt = payload.autoAdjustColors ? 0 : Math.min(payload.paletteMinIterations, payload.paletteMaxIterations);
      const maxIt = payload.autoAdjustColors ? Math.max(1, payload.maxIterations) : Math.max(1, Math.max(payload.paletteMinIterations, payload.paletteMaxIterations));
      const pos = clamp01((valueForPalette - minIt) / Math.max(1, maxIt - minIt));

      let color: Rgb;
      if (payload.colorMode === 'black-white') {
        const gray = iter >= payload.maxIterations ? 0 : 255;
        color = { r: gray, g: gray, b: gray };
      } else {
        color = getPaletteColor(pos, payload.palette, payload.reverseColors, payload.colorCycles);
      }

      const adjusted = applyAdjustments(color, payload.hueShift, payload.saturation, payload.lightness, payload.colorSpace);

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
  };
  self.postMessage(response);
};