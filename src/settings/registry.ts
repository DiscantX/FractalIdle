import type { SettingDefinition, SettingSectionDefinition } from './types';

export const SECTIONS: SettingSectionDefinition[] = [
  { id: 'canvas', title: 'Canvas' },
  { id: 'fractal', title: 'Fractal' },
  { id: 'rendering', title: 'Rendering' },
  { id: 'zoom', title: 'Zoom' },
  { id: 'view', title: 'View' },
  { id: 'color-palette', title: 'Color palette' },
  { id: 'palette-range', title: 'Palette range' },
  { id: 'adjust-colors', title: 'Adjust colors' },
];

export const coreSettings: SettingDefinition[] = [
  // --- Canvas ---
  {
    id: 'width', kind: 'number', label: 'Canvas width', section: 'canvas',
    default: 1280, min: 200, max: 2000, step: 50, rerender: true,
    onChange: (_value, api) => {
      api.setValue('fillViewport', false);
      api.syncCanvasSize();
    },
  },
  {
    id: 'height', kind: 'number', label: 'Canvas height', section: 'canvas',
    default: 928, min: 200, max: 2000, step: 50, rerender: true,
    onChange: (_value, api) => {
      api.setValue('fillViewport', false);
      api.syncCanvasSize();
    },
  },
  {
    id: 'fillViewport', kind: 'checkbox', label: 'Canvas fill', section: 'canvas',
    default: false, rerender: true,
    onChange: (_value, api) => {
      api.syncCanvasSize();
     },
  },

  // --- Fractal ---
  {
    id: 'fractalType', kind: 'select', label: 'Fractal type', section: 'fractal', default: 'mandelbrot', rerender: false,
    options: [
      { value: 'mandelbrot', label: 'Mandelbrot' },
      { value: 'julia', label: 'Julia' },
      { value: 'burning-ship', label: 'Burning Ship' },
      { value: 'buffalo', label: 'Buffalo' },
    ],
    // Switching fractal also recenters to that fractal's default view (which
    // itself triggers the re-render), so we opt out of the automatic rerender.
    onChange: (_value, api) => {
      api.resetView();
    },
  },

  // --- Rendering ---
  { id: 'maxIterations', kind: 'slider', label: 'Max iterations', section: 'rendering', default: 256, min: 32, max: 2000, step: 8, rerender: true },
  { id: 'gridColumns', kind: 'slider', label: 'Grid columns', section: 'rendering', default: 4, min: 1, max: 8, step: 1, rerender: true },
  { id: 'gridRows', kind: 'slider', label: 'Grid rows', section: 'rendering', default: 4, min: 1, max: 8, step: 1, rerender: true },
  { id: 'workerCount', kind: 'slider', label: 'Worker count', section: 'rendering', default: 4, min: 1, max: 8, step: 1, rerender: true },
  {
    id: 'chunkMode', kind: 'select', label: 'Chunk mode', section: 'rendering', default: 'rectangles', rerender: true,
    options: [{ value: 'rectangles', label: 'Rectangles' }, { value: 'none', label: 'No chunking' }],
  },
  { id: 'solidGuessing', kind: 'checkbox', label: 'Solid interior guessing', section: 'rendering', default: true, rerender: true },
  { id: 'geometricCulling', kind: 'checkbox', label: 'Geometric culling', section: 'rendering', default: true, rerender: true },
  { id: 'periodicityChecking', kind: 'checkbox', label: 'Periodicity checking', section: 'rendering', default: true, rerender: true },

  // --- Zoom ---
  {
    id: 'zoomMode', kind: 'select', label: 'Zoom mode', section: 'zoom', default: 'smooth', rerender: false,
    options: [{ value: 'smooth', label: 'Smooth' }, { value: 'instant', label: 'Instant' }],
  },
  { id: 'zoomSensitivity', kind: 'slider', label: 'Zoom sensitivity', section: 'zoom', default: 3, min: 0.01, max: 5, step: 0.01, rerender: false, format: (v) => v.toFixed(1) },
  {
    id: 'previewMode', kind: 'select', label: 'Preview mode', section: 'zoom', default: 'legacy', rerender: false,
    options: [{ value: 'legacy', label: 'Legacy preview' }, { value: 'current', label: 'Current' }],
  },

  // --- View ---
  { id: 'flipX', kind: 'checkbox', label: 'Flip horizontally', section: 'view', default: false, rerender: true },
  { id: 'flipY', kind: 'checkbox', label: 'Flip vertically', section: 'view', default: false, rerender: true },

  // --- Color palette ---
  {
    id: 'colorMode', kind: 'select', label: 'Color mode', section: 'color-palette', default: 'escape-time', rerender: true,
    options: [
      { value: 'escape-time', label: 'Escape-time' },
      { value: 'smooth', label: 'Smooth' },
      { value: 'distance-estimation', label: 'Distance estimation' },
      { value: 'black-white', label: 'Black & white' },
    ],
  },
  {
    id: 'palette', kind: 'select', label: 'Color palette', section: 'color-palette', default: 'viridis', rerender: true,
    options: [
      { value: 'viridis', label: 'Viridis' },
      { value: 'plasma', label: 'Plasma' },
      { value: 'inferno', label: 'Inferno' },
      { value: 'magma', label: 'Magma' },
      { value: 'turbo', label: 'Turbo' },
      { value: 'rainbow', label: 'Rainbow' },
      { value: 'cividis', label: 'Cividis' },
      { value: 'cool', label: 'Cool' },
      { value: 'warm', label: 'Warm' },
      { value: 'grayscale', label: 'Grayscale' },
    ],
  },
  { id: 'colorCycles', kind: 'slider', label: 'Color cycles', section: 'color-palette', default: 1, min: 1, max: 8, step: 1, rerender: true },
  { id: 'reverseColors', kind: 'checkbox', label: 'Reverse colors', section: 'color-palette', default: false, rerender: true },
  { id: 'smoothColoring', kind: 'checkbox', label: 'Smooth coloring', section: 'color-palette', default: true, rerender: true },

  // --- Palette range ---
  { id: 'autoAdjustColors', kind: 'checkbox', label: 'Auto-adjust palette', section: 'palette-range', default: true, rerender: true },
    {
    id: 'paletteMinIterations', kind: 'slider', label: 'Palette min iterations', section: 'palette-range',
    default: 0, min: 0, max: 2000, step: 8, rerender: true,
    rangeLink: { role: 'min', pairedWith: 'paletteMaxIterations' },
    },
    {
    id: 'paletteMaxIterations', kind: 'slider', label: 'Palette max iterations', section: 'palette-range',
    default: 199, min: 1, max: 2000, step: 8, rerender: true,
    rangeLink: { role: 'max', pairedWith: 'paletteMinIterations' },
    },

  // --- Adjust colors ---
  { id: 'hueShift', kind: 'slider', label: 'Hue shift', section: 'adjust-colors', default: 0, min: 0, max: 360, step: 1, rerender: true },
  { id: 'saturation', kind: 'slider', label: 'Saturation', section: 'adjust-colors', default: 1, min: 0, max: 2, step: 0.05, rerender: true, format: (v) => v.toFixed(2) },
  { id: 'lightness', kind: 'slider', label: 'Lightness', section: 'adjust-colors', default: 1, min: 0, max: 2, step: 0.05, rerender: true, format: (v) => v.toFixed(2) },
  {
    id: 'colorSpace', kind: 'select', label: 'Color space', section: 'adjust-colors', default: 'hsl', rerender: true,
    options: [
      { value: 'hsl', label: 'HSL' }, { value: 'hsluv', label: 'HSLuv' },
      { value: 'lch', label: 'LCh' }, { value: 'okhsl', label: 'Okhsl' },
    ],
  },
];