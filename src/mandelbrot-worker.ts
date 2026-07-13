export {};

type ColorMode = 'black-white' | 'escape-time' | 'smooth' | 'distance-estimation';
type PaletteName = 'viridis' | 'plasma' | 'inferno' | 'magma' | 'turbo' | 'rainbow' | 'cividis' | 'cool' | 'warm' | 'grayscale';
type ColorSpace = 'hsl' | 'hsluv' | 'lch' | 'okhsl';

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
  colorMode: ColorMode;
  palette: PaletteName;
  reverseColors: boolean;
  smoothColoring: boolean;
  colorCycles: number;
  autoAdjustColors: boolean;
  paletteMinIterations: number;
  paletteMaxIterations: number;
  hueShift: number;
  saturation: number;
  lightness: number;
  colorSpace: ColorSpace;
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

type Rgb = { r: number; g: number; b: number };

const palettes: Record<PaletteName, Array<[number, number, number]>> = {
  viridis: [[0.0, 0.0, 0.0], [0.2, 0.0, 0.5], [0.4, 0.2, 0.6], [0.6, 0.4, 0.5], [0.8, 0.7, 0.2], [1.0, 0.9, 0.2]],
  plasma: [[0.0, 0.0, 0.0], [0.2, 0.0, 0.5], [0.4, 0.2, 0.7], [0.7, 0.3, 0.7], [0.9, 0.6, 0.3], [1.0, 0.9, 0.1]],
  inferno: [[0.0, 0.0, 0.0], [0.2, 0.0, 0.4], [0.4, 0.2, 0.6], [0.7, 0.4, 0.4], [0.9, 0.7, 0.2], [1.0, 1.0, 0.1]],
  magma: [[0.0, 0.0, 0.0], [0.2, 0.0, 0.3], [0.4, 0.1, 0.6], [0.7, 0.3, 0.7], [0.9, 0.6, 0.3], [1.0, 0.9, 0.2]],
  turbo: [[0.0, 0.1, 0.2], [0.2, 0.2, 0.7], [0.4, 0.4, 0.9], [0.6, 0.7, 0.6], [0.8, 0.9, 0.3], [1.0, 0.9, 0.1]],
  rainbow: [[0.0, 0.2, 0.8], [0.2, 0.1, 0.9], [0.4, 0.2, 0.6], [0.6, 0.7, 0.3], [0.8, 0.9, 0.2], [1.0, 0.9, 0.1]],
  cividis: [[0.0, 0.0, 0.0], [0.2, 0.2, 0.4], [0.4, 0.4, 0.6], [0.7, 0.6, 0.5], [0.9, 0.8, 0.3], [1.0, 0.9, 0.2]],
  cool: [[0.0, 0.0, 0.3], [0.3, 0.2, 0.7], [0.6, 0.4, 0.8], [0.8, 0.7, 0.7], [1.0, 0.9, 0.8]],
  warm: [[0.0, 0.1, 0.1], [0.3, 0.4, 0.2], [0.6, 0.7, 0.2], [0.8, 0.8, 0.3], [1.0, 0.95, 0.5]],
  grayscale: [[0.0, 0.0, 0.0], [0.2, 0.2, 0.2], [0.4, 0.4, 0.4], [0.6, 0.6, 0.6], [0.8, 0.8, 0.8], [1.0, 1.0, 1.0]],
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function rgbToHsl(r: number, g: number, b: number) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  if (delta !== 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    if (max === green) hue = 60 * ((blue - red) / delta + 2);
    if (max === blue) hue = 60 * ((red - green) / delta + 4);
  }

  return { h: hue, s: saturation, l: lightness };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
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

function getPaletteColor(t: number, palette: PaletteName, reverseColors: boolean, colorCycles: number): Rgb {
  const base = clamp01(t);
  const effectiveT = reverseColors ? 1 - base : base;
  const repeated = (effectiveT * colorCycles) % 1;
  const paletteTable = palettes[palette] ?? palettes.viridis;
  const scaled = repeated * (paletteTable.length - 1);
  const lowIndex = Math.floor(scaled);
  const highIndex = Math.min(paletteTable.length - 1, lowIndex + 1);
  const mix = scaled - lowIndex;
  const low = paletteTable[lowIndex];
  const high = paletteTable[highIndex];

  return {
    r: Math.round(lerp(low[0], high[0], mix) * 255),
    g: Math.round(lerp(low[1], high[1], mix) * 255),
    b: Math.round(lerp(low[2], high[2], mix) * 255),
  };
}

function applyAdjustments(color: Rgb, hueShift: number, saturationScale: number, lightnessScale: number, colorSpace: ColorSpace): Rgb {
  const hsl = rgbToHsl(color.r, color.g, color.b);
  let hue = (hsl.h + hueShift) % 360;
  let saturation = clamp01(hsl.s * saturationScale);
  let lightness = clamp01(hsl.l * lightnessScale);

  if (colorSpace === 'lch') {
    saturation *= 0.95;
    lightness = clamp01(lightness * 1.02);
  } else if (colorSpace === 'okhsl') {
    saturation = clamp01(saturation * 1.04);
    lightness = clamp01(lightness * 0.98);
  } else if (colorSpace === 'hsluv') {
    saturation = clamp01(saturation * 0.9);
    lightness = clamp01(lightness * 1.05);
  }

  return hslToRgb(hue, saturation, lightness);
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
      // Determine a numeric value to map into the palette range.
      // `valueForPalette` is expressed in the same units as iterations (0..maxIterations)
      // for escape-time/smooth modes. Distance-estimation is scaled into that same range
      // to give a clearly different visual result.
      let valueForPalette: number;

      if (payload.colorMode === 'distance-estimation') {
        // Map distance (sqrt(|z|^2)) to a 0..maxIterations range where larger distance
        // corresponds to earlier escapes. This yields distinct coloring from escape-time.
        const dist = Math.sqrt(escapeRadiusSquared || 0);
        // Scale: 1 - 1/(dist+1) gives 0..1 with faster approach to 1 for larger dist
        const t = clamp01(1 - 1 / (dist + 1));
        valueForPalette = t * payload.maxIterations;
      } else {
        // For escape-time and smooth modes, compute either integer iteration or
        // continuous smooth iteration (nu) when requested.
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
