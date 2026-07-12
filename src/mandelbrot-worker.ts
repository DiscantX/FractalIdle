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
      const brightness = iter === payload.maxIterations ? 0 : Math.floor((iter / payload.maxIterations) * 255);

      data[offset] = brightness;
      data[offset + 1] = brightness;
      data[offset + 2] = brightness;
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
