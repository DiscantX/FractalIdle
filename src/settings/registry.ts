import type { SettingDefinition, SettingSectionDefinition } from './types';
import { cheapRecolorRepaint } from '../services/renderer';
import { renderAnimationControls } from '../ui/animation-controls';

export const SECTIONS: SettingSectionDefinition[] = [
  { id: 'canvas', title: 'Canvas' },
  { id: 'fractal', title: 'Fractal' },
  { id: 'perturbation', title: 'Perturbation' },
  { id: 'precision', title: 'Precision' },
  { id: 'rendering', title: 'Rendering' },
  { id: 'cache', title: 'Tile cache' },
  { id: 'zoom', title: 'Zoom' },
  { id: 'view', title: 'View' },
  { id: 'fly-to', title: 'Fly to' },
  { id: 'color-palette', title: 'Color palette' },
  { id: 'palette-range', title: 'Palette range' },
  { id: 'adjust-colors', title: 'Adjust colors' },
  { id: 'color-animation', title: 'Color animation' },
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
    default: true, rerender: true,
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

  // --- Perturbation ---
  {
    id: 'perturbationMode', kind: 'select', label: 'Perturbation', section: 'perturbation',
    default: 'off', rerender: true,
    options: [
      { value: 'off', label: 'Off (direct iteration)' },
      { value: 'on', label: 'On (reference orbit + delta)' },
    ],
  },

{
    id: 'seriesApproximation', kind: 'checkbox', label: 'Series approximation', section: 'perturbation',
    default: false, rerender: true,
    visibleWhen: (s) => s.perturbationMode === 'on',
  },

  {
  id: 'seriesValidityMode', kind: 'select', label: 'Series approx. validity check', section: 'perturbation',
  default: 'formal', rerender: true,
  visibleWhen: (s) => s.perturbationMode === 'on' && s.seriesApproximation === true && s.seriesValidityMode === 'formal',
  options: [
    { value: 'formal', label: 'Formal error bound (recommended)' },
    { value: 'heuristic', label: 'Periodic recheck (cheaper to compute, less rigorous)' },
    { value: 'none', label: 'Always trust (unsafe — testing only)' },
  ],
},

{
    id: 'seriesToleranceMode', kind: 'select', label: 'Series tolerance basis', section: 'perturbation',
    default: 'escape-fraction', rerender: true,
    visibleWhen: (s) => s.perturbationMode === 'on' && s.seriesApproximation === true && s.seriesValidityMode === 'formal',
    options: [
      { value: 'escape-fraction', label: 'Fraction of escape radius' },
      { value: 'delta-fraction', label: 'Fraction of current |delta|' },
      { value: 'absolute', label: 'Absolute epsilon' },
    ],
  },
  {
    id: 'seriesTolerance', kind: 'slider', label: 'Series tolerance value', section: 'perturbation',
    default: 0.01, min: 0.0001, max: 1, step: 0.0001, rerender: true,
    visibleWhen: (s) => s.perturbationMode === 'on' && s.seriesApproximation === true && s.seriesValidityMode === 'formal',
    format: (v) => v.toExponential(2),
  },

  // --- Precision ---
  // Governs how the reference orbit's arithmetic is done once perturbation
  // is on (perturbationMode === 'on'). 'auto' tiers by required digit count
  // (float64 <=15, double-double 16-28, decimal.js 29+) — see
  // perturbation-precision benchmarking notes. The three forced options run
  // that backend at EVERY digit count regardless of whether it's favorable
  // there — useful for direct comparison/testing, not intended for real use
  // (e.g. forced bigint-fixed will hit its known ~500-digit cliff; forced
  // double-double silently caps at its ~30-digit ceiling past that point).
  {
    id: 'precisionMode', kind: 'select', label: 'Precision backend', section: 'precision',
    default: 'auto', rerender: true,
    visibleWhen: (s) => s.perturbationMode === 'on',
    options: [
      { value: 'auto', label: 'Auto (float64 / double-double / decimal.js by depth)' },
      { value: 'double-double', label: 'Double-double (forced, all depths)' },
      { value: 'decimal-js', label: 'Decimal.js (forced, all depths)' },
      { value: 'bigint-fixed', label: 'BigInt fixed-point (forced, all depths)' },
    ],
  },

  // --- Rendering ---
  { id: 'maxIterations', kind: 'slider', label: 'Max iterations', section: 'rendering', default: 256, min: 32, max: 10000, step: 8, rerender: true },
  { id: 'gridColumns', kind: 'slider', label: 'Grid columns', section: 'rendering', default: 8, min: 1, max: 64, step: 1, rerender: true },
  { id: 'gridRows', kind: 'slider', label: 'Grid rows', section: 'rendering', default: 8, min: 1, max: 64, step: 1, rerender: true },
  { id: 'workerCount', kind: 'slider', label: 'Worker count', section: 'rendering', default: 4, min: 1, max: 8, step: 1, rerender: true },
  {
    id: 'tileCacheSize', kind: 'number', label: 'Max cached tiles', section: 'cache',
    default: 2000, min: 64, max: 20000, step: 64, rerender: false,
    // The derived color cache can never exceed the compute cache (every colored
    // tile is derived from a scalar tile), so this is the max end of the pair.
    rangeLink: { role: 'max', pairedWith: 'colorCacheSize' },
  },
  {
    // Tier-2 (derived/colored) tile cap. Clamped so it can never exceed
    // tileCacheSize — see color-stage-split-handoff.md.
    id: 'colorCacheSize', kind: 'number', label: 'Max colored (derived) tiles', section: 'cache',
    default: 2000, min: 64, max: 20000, step: 64, rerender: false,
    rangeLink: { role: 'min', pairedWith: 'tileCacheSize' },
  },
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
  {
    id: 'zoomPreviewDepthMode', kind: 'select', label: 'Zoom-out preview depth', section: 'zoom', default: 'limited', rerender: false,
    options: [
      { value: 'exact', label: 'Exact level only' },
      { value: 'limited', label: 'Nearest (limited)' },
      { value: 'unlimited', label: 'Nearest (unlimited)' },
    ],
  },
  {
    id: 'zoomPreviewDepthOctaves', kind: 'number', label: 'Max depth (octaves)', section: 'zoom',
    default: 4, min: 1, max: 32, step: 1, rerender: false,
    visibleWhen: (s) => s.zoomPreviewDepthMode === 'limited',
  },
  {
    id: 'zoomPreviewMinCoverage', kind: 'slider', label: 'Zoom-out preview min coverage', section: 'zoom',
    default: 100, min: 0, max: 100, step: 5, rerender: false, format: (v) => `${v}%`,
  },
  {
    id: 'panPreviewFill', kind: 'checkbox', label: 'Pan preview fill', section: 'zoom', default: true, rerender: false,
  },
  {
    // Pre-cache the next zoom levels during a smooth zoom (on spare worker
    // capacity) so continuous scrolling keeps landing on already-rendered tiles.
    id: 'zoomLookAhead', kind: 'checkbox', label: 'Zoom look-ahead', section: 'zoom', default: true, rerender: false,
  },
  {
    id: 'zoomLookAheadLevels', kind: 'number', label: 'Look-ahead levels', section: 'zoom',
    default: 3, min: 0, max: 12, step: 1, rerender: false,
    visibleWhen: (s) => s.zoomLookAhead === true,
  },
  {
    id: 'zoomLookBehind', kind: 'checkbox', label: 'Zoom look-behind', section: 'zoom', default: true, rerender: false,
  },
  {
    id: 'zoomLookBehindLevels', kind: 'number', label: 'Look-behind levels', section: 'zoom',
    default: 2, min: 0, max: 12, step: 1, rerender: false,
    visibleWhen: (s) => s.zoomLookBehind === true,
  },
  {
    id: 'zoomLookAheadSpacing', kind: 'select', label: 'Look-ahead / behind spacing', section: 'zoom', default: 'step', rerender: false,
    options: [
      { value: 'step', label: 'Per scroll step' },
      { value: 'octave', label: 'Per octave (×2)' },
    ],
    visibleWhen: (s) => s.zoomLookAhead === true || s.zoomLookBehind === true,
  },
  {
    id: 'zoomLookPriority', kind: 'select', label: 'Speculative order', section: 'zoom', default: 'direction', rerender: false,
    options: [
      { value: 'direction', label: 'Direction-aware (boost + interleave)' },
      { value: 'ahead', label: 'Look-ahead first' },
      { value: 'behind', label: 'Look-behind first' },
      { value: 'distance', label: 'Balanced (distance interleave)' },
    ],
    visibleWhen: (s) => s.zoomLookAhead === true || s.zoomLookBehind === true,
  },
  {
    // During a smooth zoom, overlay real cached tiles (from look-ahead / visited
    // levels) on top of the blurry preview so detail snaps in mid-scroll.
    id: 'crispInScroll', kind: 'checkbox', label: 'Crisp detail while zooming', section: 'zoom', default: true, rerender: false,
  },
  {
    // Optional optimization: re-warm the (persistent) worker pool at zoom start
    // so any pool rebuild — e.g. after a fractal-type change — overlaps the zoom
    // animation instead of blocking the render that lands after it. Safe to turn
    // off: renderFrame always ensures the pool exists before dispatching.
    id: 'warmWorkersOnZoom', kind: 'checkbox', label: 'Warm workers on zoom', section: 'zoom', default: true, rerender: false,
  },

  // --- View ---
  { id: 'flipX', kind: 'checkbox', label: 'Flip horizontally', section: 'view', default: false, rerender: true },
  { id: 'flipY', kind: 'checkbox', label: 'Flip vertically', section: 'view', default: false, rerender: true },

  // --- Fly to ---
  // Fly-to is the animated flight from the current view to a staged destination
  // (the Destination block's "Fly To" button). It renders the fractal along the
  // path, so the flight must be paced slowly enough for renders to keep up —
  // hence the generous defaults below. Duration is a swappable strategy, not a
  // hardcoded formula: 'clamped-linear' gives predictable per-octave pacing (a
  // fixed time per zoom level, capped), 'clamped-sqrt' front-loads speed with
  // diminishing returns, and 'linear' (uncapped) is the idle-game pacing preview
  // where a 60-octave dive really takes 60× a 1-octave one. All rerender:false —
  // they only affect animation timing, not the render pipeline.
  //
  // Duration model: total ms = base + perOctave × octaves (clamped for the two
  // 'clamped-*' curves). "Duration per octave" is the primary speed slider —
  // higher = slower travel = more time for the fractal to resolve at each depth.
  {
    // How center (Re/Im) moves relative to zoom. 'smart' pans early so you
    // descend onto the target instead of diving into the start-center (black)
    // then panning at the end; 'pan-then-zoom' pans first at the start zoom then
    // zooms straight in; 'linear' is the naive world-space pan (has the artifact,
    // kept for comparison). See fly-to.ts.
    id: 'flyToPathMode', kind: 'select', label: 'Path', section: 'fly-to', default: 'smart', rerender: false,
    options: [
      { value: 'smart', label: 'Smart (pan + zoom, target-locked)' },
      { value: 'pan-then-zoom', label: 'Pan, then zoom' },
      { value: 'linear', label: 'Linear (naive — for comparison)' },
    ],
  },
  {
    id: 'flyToDurationCurve', kind: 'select', label: 'Duration curve', section: 'fly-to', default: 'clamped-linear', rerender: false,
    options: [
      { value: 'clamped-linear', label: 'Clamped linear (fixed time / octave)' },
      { value: 'clamped-sqrt', label: 'Clamped √ (front-loaded, diminishing)' },
      { value: 'linear', label: 'Linear (no cap — idle-game pacing)' },
    ],
  },
  {
    id: 'flyToPerOctaveMs', kind: 'slider', label: 'Duration per octave (ms)', section: 'fly-to',
    default: 900, min: 0, max: 8000, step: 50, rerender: false, format: (v) => `${(v / 1000).toFixed(2)} s`,
  },
  {
    id: 'flyToBaseMs', kind: 'slider', label: 'Base duration (ms)', section: 'fly-to',
    default: 400, min: 0, max: 10000, step: 50, rerender: false, format: (v) => `${(v / 1000).toFixed(2)} s`,
  },
  {
    id: 'flyToMinMs', kind: 'slider', label: 'Min duration (ms)', section: 'fly-to',
    default: 400, min: 0, max: 20000, step: 50, rerender: false, format: (v) => `${(v / 1000).toFixed(2)} s`,
  },
  {
    // Caps the two 'clamped-*' curves; ignored by 'linear'. High so long dives
    // aren't cut short — lower it if you want a hard ceiling on flight time.
    id: 'flyToMaxMs', kind: 'slider', label: 'Max duration (ms)', section: 'fly-to',
    default: 120000, min: 1000, max: 300000, step: 1000, rerender: false, format: (v) => `${(v / 1000).toFixed(0)} s`,
    visibleWhen: (s) => s.flyToDurationCurve !== 'linear',
  },

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
    id: 'palette', kind: 'select', label: 'Color palette', section: 'color-palette', default: 'viridis', rerender: false,
    onChange: () => cheapRecolorRepaint(),
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
  { id: 'colorCycles', kind: 'slider', label: 'Color cycles', section: 'color-palette', default: 1, min: 1, max: 8, step: 1, rerender: false, onChange: () => cheapRecolorRepaint() },
  { id: 'reverseColors', kind: 'checkbox', label: 'Reverse colors', section: 'color-palette', default: false, rerender: false, onChange: () => cheapRecolorRepaint() },
  { id: 'smoothColoring', kind: 'checkbox', label: 'Smooth coloring', section: 'color-palette', default: true, rerender: true },

  // --- Palette range ---
  { id: 'autoAdjustColors', kind: 'checkbox', label: 'Auto-adjust palette', section: 'palette-range', default: true, rerender: false, onChange: () => cheapRecolorRepaint() },
    {
    id: 'paletteMinIterations', kind: 'slider', label: 'Palette min iterations', section: 'palette-range',
    default: 0, min: 0, max: 2000, step: 8, rerender: false,
    onChange: () => cheapRecolorRepaint(),
    rangeLink: { role: 'min', pairedWith: 'paletteMaxIterations' },
    },
    {
    id: 'paletteMaxIterations', kind: 'slider', label: 'Palette max iterations', section: 'palette-range',
    default: 199, min: 1, max: 2000, step: 8, rerender: false,
    onChange: () => cheapRecolorRepaint(),
    rangeLink: { role: 'max', pairedWith: 'paletteMinIterations' },
    },

  // --- Adjust colors ---
  { id: 'hueShift', kind: 'slider', label: 'Hue shift', section: 'adjust-colors', default: 0, min: 0, max: 360, step: 1, rerender: false, onChange: () => cheapRecolorRepaint() },
  { id: 'saturation', kind: 'slider', label: 'Saturation', section: 'adjust-colors', default: 1, min: 0, max: 2, step: 0.05, rerender: false, onChange: () => cheapRecolorRepaint(), format: (v) => v.toFixed(2) },
  { id: 'lightness', kind: 'slider', label: 'Lightness', section: 'adjust-colors', default: 1, min: 0, max: 2, step: 0.05, rerender: false, onChange: () => cheapRecolorRepaint(), format: (v) => v.toFixed(2) },
  {
    id: 'colorSpace', kind: 'select', label: 'Color space', section: 'adjust-colors', default: 'hsl', rerender: false,
    onChange: () => cheapRecolorRepaint(),
    options: [
      { value: 'hsl', label: 'HSL' }, { value: 'hsluv', label: 'HSLuv' },
      { value: 'lch', label: 'LCh' }, { value: 'okhsl', label: 'Okhsl' },
    ],
  },

  // --- Color animation ---
  {
    id: 'animationType', kind: 'select', label: 'Animation', section: 'color-animation', default: 'hue-cycle', rerender: false,
    options: [
      { value: 'hue-cycle', label: 'Hue Cycle' },
    ],
  },
  {
    id: 'animationSpeed', kind: 'slider', label: 'Speed (cycles/sec)', section: 'color-animation',
    default: 0.2, min: 0.01, max: 2, step: 0.01, rerender: false, format: (v) => v.toFixed(2),
  },
  {
    id: 'animationControls', kind: 'custom', section: 'color-animation',
    render: (_api) => renderAnimationControls(_api),
  },
];