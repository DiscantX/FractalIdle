import { PaletteName, ColorSpace } from '../types';
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

export function getWorldMapColor(iteration: number, maxIterations: number): Rgb {
  if (iteration === maxIterations) {
    return worldMapColors.continent;
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
  continent: { r: 102, g: 157, b: 99 },
  mountainHigh: { r: 161, g: 105, b: 83 },
  mountainLow: { r: 196, g: 161, b: 124 },
  plains: { r: 138, g: 186, b: 131 },
  oceanShallow: { r: 158, g: 191, b: 223 },
  oceanMid: { r: 137, g: 172, b: 203 },
  oceanDeep: { r: 116, g: 152, b: 185 },
  oceanTrench: { r: 87, g: 124, b: 158 },
};

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
