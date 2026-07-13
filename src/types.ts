export type ViewState = {
  centerRe: number;
  centerIm: number;
  zoom: number;
};

export type CompletedFrame = {
  canvas: HTMLCanvasElement;
  view: ViewState;
  width: number;
  height: number;
};

export type ZoomAnimationState = {
  from: ViewState;
  to: ViewState;
  startTime: number;
  duration: number;
  frameId: number | null;
  originX: number;
  originY: number;
  previewCanvas: HTMLCanvasElement;
  previewFrame: CompletedFrame | null;
};

export type ChunkMode = 'none' | 'rectangles';

export type ColorMode = 'black-white' | 'escape-time' | 'smooth' | 'distance-estimation';
export type PaletteName = 'viridis' | 'plasma' | 'inferno' | 'magma' | 'turbo' | 'rainbow' | 'cividis' | 'cool' | 'warm' | 'grayscale';
export type ColorSpace = 'hsl' | 'hsluv' | 'lch' | 'okhsl';

export type RenderState = {
  width: number;
  height: number;
  maxIterations: number;
  tileWidth: number;
  tileHeight: number;
  workerCount: number;
  chunkMode: ChunkMode;
  zoomMode: 'instant' | 'smooth';
  previewMode: 'current' | 'legacy';
  fillViewport: boolean;
  zoomSensitivity: number;
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
  view: ViewState;
  zoomAnimation: ZoomAnimationState | null;
  lastRenderMs: number;
  lastSteps: number;
  activeRenderId: number;
};

export type DragState = {
  active: boolean;
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

export type WorkerResponse = {
  renderId: number;
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
  data: Uint8ClampedArray;
  steps: number;
};

export type RenderLogEntry = {
  timestamp: string;
  scenario?: string;
  width: number;
  height: number;
  maxIterations: number;
  tileWidth: number;
  tileHeight: number;
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
  tileWidth: number;
  tileHeight: number;
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
