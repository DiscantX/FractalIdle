import type { ReferenceOrbit, SeriesCoefficients } from './core/perturbation/types';

export type ViewState = {
  centerRe: number;
  centerIm: number;
  zoom: number;
};

export type ZoomAnimationState = {
  from: ViewState;
  to: ViewState;
  duration: number;
  originX: number;
  originY: number;
  previewCanvas: HTMLCanvasElement;
  // Zoom-out only: a fully-cached snapshot of the target (`to`) viewport, and
  // the view it was assembled for. When present, it's projected as the base
  // layer during the animation so revealed border area shows real cached pixels
  // instead of placeholder (no pop-in). Null when the target isn't fully cached.
  targetPreviewCanvas: HTMLCanvasElement | null;
  previewView: ViewState | null;
};

export type ChunkMode = 'none' | 'rectangles';

export type FractalType = 'mandelbrot' | 'julia' | 'burning-ship' | 'buffalo';

export type ColorMode = 'black-white' | 'escape-time' | 'smooth' | 'distance-estimation';
export type PaletteName = 'viridis' | 'plasma' | 'inferno' | 'magma' | 'turbo' | 'rainbow' | 'cividis' | 'cool' | 'warm' | 'grayscale' | 'world-map';
export type ColorSpace = 'hsl' | 'hsluv' | 'lch' | 'okhsl';

export type RenderState = {
  view: ViewState;
  zoomAnimation: ZoomAnimationState | null;
  lastRenderMs: number;
  lastSteps: number;
  activeRenderId: number;
};

export type DragState = {
  active: boolean;
  moved: boolean;
  startX: number;
  startY: number;
  startCenterRe: number;
  startCenterIm: number;
};

export type TileTask = {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
};

// All inputs to Stage 2 (the main-thread color stage). Computed once per render
// from the settings engine and passed to the colorize functions. Kept separate
// from WorkerTask because these no longer cross the worker boundary — the worker
// only computes the scalar field, and Stage 2 owns the entire palette + adjustment
// mapping. See color-stage-split-handoff.md.
export type ColorParams = {
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

export type WorkerTask = {
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
  // colorMode and smoothColoring stay in Stage 1: they change HOW the scalar is
  // computed during iteration (smooth needs escape radius at escape time), so
  // they remain part of the compute signature and still trigger a re-render.
  colorMode: ColorMode;
  smoothColoring: boolean;
  solidGuessing: boolean;
  geometricCulling: boolean;
  periodicityChecking: boolean;
  // Present only when perturbationMode is 'on' for a fractal type that
  // supports it (Mandelbrot only, for now). Computed once per render layer on
  // the main thread — see renderer.ts — and cloned into every tile task for
  // that layer. Its absence is how the worker decides direct vs. perturbation
  // iteration; there's no separate boolean.
  referenceOrbit?: ReferenceOrbit;
  // Present only when seriesApproximation is also on. skipIteration is the
  // shared, per-layer "safe to skip to" iteration from determineSkipIteration
  // — 0 means no safe skip was found (falls through to normal perturbation,
  // same as series approximation being off for this layer).
  seriesCoefficients?: SeriesCoefficients;
  skipIteration?: number;
  interiorDetail: boolean;
  interiorNoiseMode: 'single' | 'fractal';
  interiorNoiseStrength: number;
  flipX: boolean;
  flipY: boolean;
};

export type WorkerResponse = {
  renderId: number;
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
  // Per-pixel scalar field (valueForPalette), NOT final RGB. Stage 2 turns this
  // into color on the main thread. Transferred as a Float32Array.
  data: Float32Array;
  steps: number;
  solidGuessed?: boolean;
  culledPixels?: number;
  periodicityShortCircuits?: number;
};

export type RenderLogEntry = {
  timestamp: string;
  scenario?: string;
  width: number;
  height: number;
  maxIterations: number;
  gridColumns: number;
  gridRows: number;
  workerCount: number;
  chunkMode: ChunkMode;
  zoomMode: 'instant' | 'smooth';
  zoom: number;
  lastRenderMs: number;
  lastSteps: number;
};

export type BenchmarkCase = {
  label: string;
  width: number;
  height: number;
  maxIterations: number;
  gridColumns: number;
  gridRows: number;
  workerCount: number;
  chunkMode: ChunkMode;
  zoomMode: 'instant' | 'smooth';
};

export type DebugEvent = {
  index: number;
  time: number;
  label: string;
  renderId: number;
  activeRenderId: number;
  zoomGeneration: number;
  view: ViewState;
  details?: Record<string, number | string | boolean | null>;
};

declare global {
  interface Window {
    mandelbrotDebug?: {
      enabled: boolean;
      events: DebugEvent[];
      clear: () => void;
      dump: () => DebugEvent[];
      table: () => void;
    };
  }
}
