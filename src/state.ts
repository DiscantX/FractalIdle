import {
  RenderState,
  DragState,
  CompletedFrame,
  RenderLogEntry,
  DebugEvent,
  ChunkMode,
  ColorMode,
  PaletteName,
  ColorSpace
} from './types';
import {
  widthInput,
  heightInput,
  iterationsInput,
  gridColumnsInput,
  gridRowsInput,
  workerCountInput,
  chunkModeInput,
  solidGuessingInput,
  geometricCullingInput,
  periodicityCheckingInput,
  zoomModeInput,
  previewModeInput,
  fillViewportInput,
  zoomSensitivityInput,
  colorModeInput,
  paletteInput,
  colorCyclesInput,
  reverseColorsInput,
  smoothColoringInput,
  autoAdjustColorsInput,
  paletteMinInput,
  paletteMaxInput,
  hueShiftInput,
  saturationInput,
  lightnessInput,
  colorSpaceInput
} from './ui/dom';

export const STORAGE_KEY = 'mandelbrot-render-logs';
export const PREVIEW_PLACEHOLDER_COLOR = '#0f172a';
export const MAX_COMPLETED_FRAME_CACHE = 24;

export const state: RenderState = {
  width: Number(widthInput.value),
  height: Number(heightInput.value),
  maxIterations: Number(iterationsInput.value),
  gridColumns: Number(gridColumnsInput.value),
  gridRows: Number(gridRowsInput.value),
  workerCount: Number(workerCountInput.value),
  chunkMode: chunkModeInput.value as ChunkMode,
  solidGuessing: solidGuessingInput.checked,
  geometricCulling: geometricCullingInput.checked,
  periodicityChecking: periodicityCheckingInput.checked,
  zoomMode: zoomModeInput.value as 'instant' | 'smooth',
  previewMode: previewModeInput.value as 'current' | 'legacy',
  fillViewport: fillViewportInput.checked,
  zoomSensitivity: Number(zoomSensitivityInput.value),
  colorMode: colorModeInput.value as ColorMode,
  palette: paletteInput.value as PaletteName,
  reverseColors: reverseColorsInput.checked,
  smoothColoring: smoothColoringInput.checked,
  colorCycles: Number(colorCyclesInput.value),
  autoAdjustColors: autoAdjustColorsInput.checked,
  paletteMinIterations: Number(paletteMinInput.value),
  paletteMaxIterations: Number(paletteMaxInput.value),
  hueShift: Number(hueShiftInput.value),
  saturation: Number(saturationInput.value),
  lightness: Number(lightnessInput.value),
  colorSpace: colorSpaceInput.value as ColorSpace,
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
