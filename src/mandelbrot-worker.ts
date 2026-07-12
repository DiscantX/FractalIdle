type WorkerTask = {
  renderId: number;
  width: number;
  height: number;
  maxIterations: number;
  centerRe: number;
  centerIm: number;
  zoom: number;
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
  scaleRe: number;
  scaleIm: number;
};

type WorkerResponse = {
  renderId: number;
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
  data: Uint8ClampedArray;
  steps: number;
};

function hslToRgb(h: number, s: number, l: number) {
  const hue = ((h % 360) + 360) % 360 / 360;
  const saturation = Math.max(0, Math.min(1, s));
  const lightness = Math.max(0, Math.min(1, l));

  const hueToRgb = (p: number, q: number, t: number) => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };

  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  return {
    r: Math.round(hueToRgb(p, q, hue + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, hue) * 255),
    b: Math.round(hueToRgb(p, q, hue - 1 / 3) * 255),
  };
}

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

      while (iter < payload.maxIterations && zRe * zRe + zIm * zIm < 4) {
        const nextRe = zRe * zRe - zIm * zIm + cRe;
        const nextIm = 2 * zRe * zIm + cIm;
        zRe = nextRe;
        zIm = nextIm;
        iter += 1;
      }

      steps += iter;
      const normalized = iter / payload.maxIterations;
      const hue = 220 + normalized * 320;
      const lightness = iter === payload.maxIterations ? 0.03 : 0.45 + 0.4 * Math.sin(normalized * Math.PI * 4);
      const color = hslToRgb(hue, 0.78, lightness);

      data[offset] = color.r;
      data[offset + 1] = color.g;
      data[offset + 2] = color.b;
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
