import { RenderState, DragState, RenderLogEntry, DebugEvent, FractalType, ViewState } from './types';

export const STORAGE_KEY = 'mandelbrot-render-logs';
export const PREVIEW_PLACEHOLDER_COLOR = '#0f172a';

// Sensible initial framing for each fractal type. Switching types (or hitting
// the Reset View button) returns to these rather than a hardcoded origin so
// the interesting region is on-screen immediately.
export const fractalDefaultViews: Record<FractalType, ViewState> = {
  mandelbrot: { centerRe: 0, centerIm: 0, zoom: 1 },
  julia: { centerRe: 0, centerIm: 0, zoom: 1 },
  'burning-ship': { centerRe: -0.5, centerIm: -0.5, zoom: 1 },
  buffalo: { centerRe: -0.5, centerIm: -0.5, zoom: 1 },
};

export const state: RenderState = {
  view: {
    centerRe: 0,
    centerIm: 0,
    zoom: 1,
  },
  zoomAnimation: null,
  lastRenderMs: 0,
  lastSteps: 0,
  activeRenderId: 0,
};

export const dragState: DragState = {
  active: false,
  moved: false,
  startX: 0,
  startY: 0,
  startCenterRe: 0,
  startCenterIm: 0,
};

export const renderContext = {
  activeWorkers: [] as Worker[],
  renderLogs: [] as RenderLogEntry[],
  debugEvents: [] as DebugEvent[],
  zoomAnimationGeneration: 0,
  benchmarkTimer: null as number | null,
  renderTimerStart: null as number | null,
  renderTimerFrame: null as number | null,
  // Whether an interactive pan (pointer drag) is in progress. The actual
  // pixels come from the tile cache via the assembly canvas; these flags just
  // gate render scheduling during a drag.
  panActive: false,
  panRenderScheduled: false,
};