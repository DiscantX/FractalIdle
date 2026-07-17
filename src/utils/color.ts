import { PaletteName, ColorSpace, ColorParams } from '../types';
import { clamp01, lerp } from './math';

export type Rgb = { r: number; g: number; b: number };

export const palettes: Partial<Record<PaletteName, Array<[number, number, number]>>> = {
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


export function getWorldMapColor(iteration: number, maxIterations: number, interiorProgress?: number): Rgb {
  if (iteration === maxIterations) {
    // interiorProgress is only present when the interiorDetail toggle is on
    // (see mandelbrot-worker.ts). Undefined means either the toggle is off,
    // or this pixel came from the solid-guessing fast path -- both cases
    // fall back to the original flat "continent" behavior.
    if (interiorProgress === undefined) {
      return worldMapColors.continent;
    }

// STOPGAP PROXY -- not derived from a true distance value, see the
    // comment where interiorProgress is computed in mandelbrot-worker.ts
    // and idle-fractal-game-design.md. Continuously interpolated (rather
    // than hard-cutoff banded) so the noise perturbation applied in the
    // worker produces soft gradients instead of banded rings.
    return interpolateWorldMapStops(interiorProgress);
  }

  const progress = iteration / maxIterations;

  if (progress > 0.85) return worldMapColors.mountainHigh;
  if (progress > 0.65) return worldMapColors.mountainLow;
  if (progress > 0.45) return worldMapColors.plains;
  if (progress > 0.22) return worldMapColors.oceanShallow;
  if (progress > 0.10) return worldMapColors.oceanMid;
  if (progress > 0.04) return worldMapColors.oceanDeep;
  return worldMapColors.oceanTrench;
}

export const worldMapColors = {
  // continent: { r: 92, g: 171, b: 114 },
  mountainPeak: { r: 255, g: 255, b: 255 },
  mountainTransition: { r: 255, g: 255, b: 255 },
  mountainHigh: { r: 109, g: 187, b: 123 },
  mountainLow: { r: 196, g: 196, b: 196 },
  plains: { r: 138, g: 186, b: 131 },
  oceanShallow: { r: 158, g: 191, b: 223 },
  oceanMid: { r: 137, g: 172, b: 203 },
  oceanDeep: { r: 116, g: 152, b: 185 },
  oceanTrench: { r: 87, g: 124, b: 158 },
  continent: { r: 243, g: 224, b: 166 },
  contour: { r:214, g:200, b:158 }
};

const worldMapInteriorStops: Array<[number, Rgb]> = [
  // [0, worldMapColors.continent],
  // [0.00001, worldMapColors.plains],
  // [0.29, worldMapColors.plains],
  // [0.30, worldMapColors.mountainLow],
  // // [0.45, worldMapColors.mountainHigh],
  // [0.70, worldMapColors.mountainTransition],
  // [0.94, worldMapColors.mountainTransition],
  // [0.98, worldMapColors.mountainPeak],
  // [1, worldMapColors.mountainPeak],
  [0, worldMapColors.continent],
  [.00001, worldMapColors.continent],
  [.8, worldMapColors.contour],
  [.9, worldMapColors.contour],
  [.9999999, worldMapColors.continent],
  [1, worldMapColors.continent],
];

function interpolateWorldMapStops(t: number): Rgb {
  const clamped = clamp01(t);
  for (let i = 0; i < worldMapInteriorStops.length - 1; i += 1) {
    const [t0, c0] = worldMapInteriorStops[i];
    const [t1, c1] = worldMapInteriorStops[i + 1];
    if (clamped <= t1) {
      const localT = t1 === t0 ? 0 : (clamped - t0) / (t1 - t0);
      return {
        r: Math.round(lerp(c0.r, c1.r, localT)),
        g: Math.round(lerp(c0.g, c1.g, localT)),
        b: Math.round(lerp(c0.b, c1.b, localT)),
      };
    }
  }
  return worldMapInteriorStops[worldMapInteriorStops.length - 1][1];
}

export function rgbToHsl(r: number, g: number, b: number) {
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

export function hslToRgb(h: number, s: number, l: number): Rgb {
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

export function getPaletteColor(t: number, palette: PaletteName, reverseColors: boolean, colorCycles: number): Rgb {
  const base = clamp01(t);
  const effectiveT = reverseColors ? 1 - base : base;
  const repeated = (effectiveT * colorCycles) % 1;
  // Non-null assertion is safe here: 'viridis' is always present in the
  // `palettes` object literal above. Only the *type* was loosened (to
  // Partial) to allow 'world-map', which intentionally has no gradient
  // stops and never reaches this function.
  const paletteTable = palettes[palette] ?? palettes.viridis!;
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

export function applyAdjustments(color: Rgb, hueShift: number, saturationScale: number, lightnessScale: number, colorSpace: ColorSpace): Rgb {
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

// --- Stage 2 (main-thread color stage) -------------------------------------
// The worker now emits a per-pixel scalar field (valueForPalette). These
// functions turn that field into final, palette-lookup + HSL-adjusted RGB on the
// main thread. See color-stage-split-handoff.md.

// Single pixel: scalar value -> final adjusted RGB. Mirrors the mapping the
// workers used to do inline. `value` is valueForPalette (raw, pre-normalization;
// palette-range normalization happens here). Interior test `value >= maxIterations`
// is exact for escape-time / smooth modes (interior pixels are never smoothed).
export function scalarToRgb(
  value: number,
  maxIterations: number,
  p: ColorParams,
): Rgb {
  const isInterior = value >= maxIterations;
  const minIt = p.autoAdjustColors ? 0 : Math.min(p.paletteMinIterations, p.paletteMaxIterations);
  const maxIt = p.autoAdjustColors
    ? Math.max(1, maxIterations)
    : Math.max(1, Math.max(p.paletteMinIterations, p.paletteMaxIterations));
  const palettePosition = clamp01((value - minIt) / Math.max(1, maxIt - minIt));

  let color: Rgb;
  if (p.colorMode === 'black-white') {
    const gray = isInterior ? 0 : 255;
    color = { r: gray, g: gray, b: gray };
  } else if (p.palette === 'world-map') {
    color = getWorldMapColor(value, maxIterations);
  } else {
    color = getPaletteColor(palettePosition, p.palette, p.reverseColors, p.colorCycles);
  }
  return applyAdjustments(color, p.hueShift, p.saturation, p.lightness, p.colorSpace);
}

// --- Color LUT (the fast path) ---------------------------------------------
// Colorizing a full frame per pixel via scalarToRgb means ~1.19M rgbToHsl ->
// adjust -> hslToRgb round-trips per repaint — far too slow for interactive
// slider drags or animation. But every pixel's color is a pure function of a
// single normalized parameter u in [0,1] (palettePosition, or value/maxIterations
// for world-map), and the palette + adjustments are constant across the frame.
// So we build a 1-D lookup table ONCE per repaint (4096 adjusted RGB entries),
// then the per-pixel loop is just: normalize -> index -> copy. This turns the
// expensive trig/HSL work from O(pixels) into O(4096), a ~5-10x speedup that
// makes recoloring cheap enough to animate.

const LUT_SIZE = 4096;

type ColorLut = {
  table: Uint8Array; // LUT_SIZE * 3, adjusted RGB per normalized position
  mode: 'gradient' | 'world-map' | 'black-white';
  minIt: number;
  maxIt: number;
  // black-white only: the two adjusted endpoints (interior/exterior).
  bwInterior: Rgb;
  bwExterior: Rgb;
};

export function buildColorLut(maxIterations: number, p: ColorParams): ColorLut {
  const minIt = p.autoAdjustColors ? 0 : Math.min(p.paletteMinIterations, p.paletteMaxIterations);
  const maxIt = p.autoAdjustColors
    ? Math.max(1, maxIterations)
    : Math.max(1, Math.max(p.paletteMinIterations, p.paletteMaxIterations));

  let mode: ColorLut['mode'];
  if (p.colorMode === 'black-white') mode = 'black-white';
  else if (p.palette === 'world-map') mode = 'world-map';
  else mode = 'gradient';

  const table = new Uint8Array(LUT_SIZE * 3);
  const n1 = LUT_SIZE - 1;
  if (mode !== 'black-white') {
    for (let i = 0; i < LUT_SIZE; i += 1) {
      const u = i / n1;
      const base = mode === 'world-map'
        ? getWorldMapColor(u * maxIterations, maxIterations)
        : getPaletteColor(u, p.palette, p.reverseColors, p.colorCycles);
      const c = applyAdjustments(base, p.hueShift, p.saturation, p.lightness, p.colorSpace);
      const o = i * 3;
      table[o] = c.r;
      table[o + 1] = c.g;
      table[o + 2] = c.b;
    }
  }

  const bwInterior = applyAdjustments({ r: 0, g: 0, b: 0 }, p.hueShift, p.saturation, p.lightness, p.colorSpace);
  const bwExterior = applyAdjustments({ r: 255, g: 255, b: 255 }, p.hueShift, p.saturation, p.lightness, p.colorSpace);

  return { table, mode, minIt, maxIt, bwInterior, bwExterior };
}

// Core hot loop: fill an RGBA buffer from a scalar field using a prebuilt LUT.
// `out` must be at least w*h*4 long. Shared by the tile and full-frame paths.
function fillRgbaFromLut(
  scalar: Float32Array,
  count: number,
  maxIterations: number,
  lut: ColorLut,
  out: Uint8ClampedArray,
): void {
  const n1 = LUT_SIZE - 1;
  const { table } = lut;

  if (lut.mode === 'black-white') {
    const inC = lut.bwInterior;
    const exC = lut.bwExterior;
    for (let i = 0; i < count; i += 1) {
      const interior = scalar[i] >= maxIterations;
      const c = interior ? inC : exC;
      const o = i * 4;
      out[o] = c.r;
      out[o + 1] = c.g;
      out[o + 2] = c.b;
      out[o + 3] = 255;
    }
    return;
  }

  // gradient: u = (value - minIt) / (maxIt - minIt)
  // world-map: u = value / maxIterations
  const worldMap = lut.mode === 'world-map';
  const offset = worldMap ? 0 : lut.minIt;
  const invSpan = worldMap
    ? 1 / Math.max(1, maxIterations)
    : 1 / Math.max(1, lut.maxIt - lut.minIt);

  for (let i = 0; i < count; i += 1) {
    let u = (scalar[i] - offset) * invSpan;
    if (u <= 0) u = 0;
    else if (u >= 1) u = 1;
    const idx = ((u * n1 + 0.5) | 0) * 3;
    const o = i * 4;
    out[o] = table[idx];
    out[o + 1] = table[idx + 1];
    out[o + 2] = table[idx + 2];
    out[o + 3] = 255;
  }
}

// Colorize one tile (a tile-sized scalar field) into a canvas, for storage in the
// Tier-2 derived cache and blitting into the assembly.
export function renderScalarTileToCanvas(
  scalar: Float32Array,
  w: number,
  h: number,
  maxIterations: number,
  params: ColorParams,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(w, h);
    const lut = buildColorLut(maxIterations, params);
    fillRgbaFromLut(scalar, w * h, maxIterations, lut, img.data);
    ctx.putImageData(img, 0, 0);
  }
  return canvas;
}

// Colorize a full-frame scalar field into a caller-provided ImageData. Reusing a
// scratch ImageData across repaints avoids a multi-MB allocation every frame,
// which matters for smooth slider drags and animation. `img` must be w*h.
export function colorizeScalarFieldInto(
  scalar: Float32Array,
  w: number,
  h: number,
  maxIterations: number,
  params: ColorParams,
  img: ImageData,
): void {
  const lut = buildColorLut(maxIterations, params);
  fillRgbaFromLut(scalar, w * h, maxIterations, lut, img.data);
}

// Colorize a full-frame scalar field into a fresh ImageData. Pure convenience
// wrapper (used where no scratch buffer is available).
export function colorizeScalarField(
  scalar: Float32Array,
  w: number,
  h: number,
  maxIterations: number,
  params: ColorParams,
): ImageData {
  const img = new ImageData(w, h);
  colorizeScalarFieldInto(scalar, w, h, maxIterations, params, img);
  return img;
}
