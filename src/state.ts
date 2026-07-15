import { RenderState, DragState, CompletedFrame, RenderLogEntry, DebugEvent } from './types';

export const STORAGE_KEY = 'mandelbrot-render-logs';
export const PREVIEW_PLACEHOLDER_COLOR = '#0f172a';
export const MAX_COMPLETED_FRAME_CACHE = 24;

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
  startX: 0,
  startY: 0,
  startCenterRe: 0,
  startCenterIm: 0,
};

export const renderContext = {
  activeWorkers: [] as Worker[],
  completedFrames: [] as CompletedFrame[],
  renderLogs: [] as RenderLogEntry[],
  debugEvents: [] as DebugEvent[],
  zoomAnimationGeneration: 0,
  benchmarkTimer: null as number | null,
  renderTimerStart: null as number | null,
  renderTimerFrame: null as number | null,
};