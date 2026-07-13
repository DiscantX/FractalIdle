type ViewState = {
  centerRe: number;
  centerIm: number;
  zoom: number;
};

type ZoomAnimationState = {
  from: ViewState;
  to: ViewState;
  startTime: number;
  duration: number;
  frameId: number | null;
  originX: number;
  originY: number;
  previewCanvas: HTMLCanvasElement;
};

type ChunkMode = 'none' | 'rectangles';

type ColorMode = 'black-white' | 'escape-time' | 'smooth' | 'distance-estimation';
type PaletteName = 'viridis' | 'plasma' | 'inferno' | 'magma' | 'turbo' | 'rainbow' | 'cividis' | 'cool' | 'warm' | 'grayscale';
type ColorSpace = 'hsl' | 'hsluv' | 'lch' | 'okhsl';

type RenderState = {
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

type DragState = {
  active: boolean;
  startX: number;
  startY: number;
  startCenterRe: number;
  startCenterIm: number;
};

type WorkerTask = {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
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

type RenderLogEntry = {
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

type BenchmarkCase = {
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

const canvas = document.querySelector<HTMLCanvasElement>('#fractalCanvas')!;
const widthInput = document.querySelector<HTMLInputElement>('#widthInput')!;
const heightInput = document.querySelector<HTMLInputElement>('#heightInput')!;
const iterationsInput = document.querySelector<HTMLInputElement>('#iterationsInput')!;
const tileWidthInput = document.querySelector<HTMLInputElement>('#tileWidthInput')!;
const tileHeightInput = document.querySelector<HTMLInputElement>('#tileHeightInput')!;
const workerCountInput = document.querySelector<HTMLInputElement>('#workerCountInput')!;
const chunkModeInput = document.querySelector<HTMLSelectElement>('#chunkModeInput')!;
const zoomModeInput = document.querySelector<HTMLSelectElement>('#zoomModeInput')!;
const zoomSensitivityInput = document.querySelector<HTMLInputElement>('#zoomSensitivityInput')!;
const fillViewportInput = document.querySelector<HTMLInputElement>('#fillViewportInput')!;
const previewModeInput = document.querySelector<HTMLSelectElement>('#previewModeInput')!;
const colorModeInput = document.querySelector<HTMLSelectElement>('#colorModeInput')!;
const paletteInput = document.querySelector<HTMLSelectElement>('#paletteInput')!;
const colorCyclesInput = document.querySelector<HTMLInputElement>('#colorCyclesInput')!;
const reverseColorsInput = document.querySelector<HTMLInputElement>('#reverseColorsInput')!;
const smoothColoringInput = document.querySelector<HTMLInputElement>('#smoothColoringInput')!;
const autoAdjustColorsInput = document.querySelector<HTMLInputElement>('#autoAdjustColorsInput')!;
const paletteMinInput = document.querySelector<HTMLInputElement>('#paletteMinInput')!;
const paletteMaxInput = document.querySelector<HTMLInputElement>('#paletteMaxInput')!;
const hueShiftInput = document.querySelector<HTMLInputElement>('#hueShiftInput')!;
const saturationInput = document.querySelector<HTMLInputElement>('#saturationInput')!;
const lightnessInput = document.querySelector<HTMLInputElement>('#lightnessInput')!;
const colorSpaceInput = document.querySelector<HTMLSelectElement>('#colorSpaceInput')!;
const iterationsOutput = document.querySelector<HTMLOutputElement>('#iterationsOutput')!;
const tileWidthOutput = document.querySelector<HTMLOutputElement>('#tileWidthOutput')!;
const tileHeightOutput = document.querySelector<HTMLOutputElement>('#tileHeightOutput')!;
const workerCountOutput = document.querySelector<HTMLOutputElement>('#workerCountOutput')!;
const zoomSensitivityOutput = document.querySelector<HTMLOutputElement>('#zoomSensitivityOutput')!;
const colorCyclesOutput = document.querySelector<HTMLOutputElement>('#colorCyclesOutput')!;
const paletteMinOutput = document.querySelector<HTMLOutputElement>('#paletteMinOutput')!;
const paletteMaxOutput = document.querySelector<HTMLOutputElement>('#paletteMaxOutput')!;
const hueShiftOutput = document.querySelector<HTMLOutputElement>('#hueShiftOutput')!;
const saturationOutput = document.querySelector<HTMLOutputElement>('#saturationOutput')!;
const lightnessOutput = document.querySelector<HTMLOutputElement>('#lightnessOutput')!;
const logCountOutput = document.querySelector<HTMLElement>('#logCountOutput')!;
const lastRenderOutput = document.querySelector<HTMLElement>('#lastRenderOutput')!;
const zoomOutput = document.querySelector<HTMLElement>('#zoomOutput')!;
const activeIterationsOutput = document.querySelector<HTMLElement>('#activeIterationsOutput')!;
const stepOutput = document.querySelector<HTMLElement>('#stepOutput')!;
const renderButton = document.querySelector<HTMLButtonElement>('#renderButton')!;
const resetButton = document.querySelector<HTMLButtonElement>('#resetButton')!;
const exportLogsButton = document.querySelector<HTMLButtonElement>('#exportLogsButton')!;
const benchmarkButton = document.querySelector<HTMLButtonElement>('#benchmarkButton')!;

const ctx = canvas.getContext('2d');

if (!ctx) {
  throw new Error('Canvas 2D context is not available.');
}

const drawingContext = ctx;
let activeWorkers: Worker[] = [];
const renderLogs: RenderLogEntry[] = [];
const STORAGE_KEY = 'mandelbrot-render-logs';
let benchmarkTimer: number | null = null;

const state: RenderState = {
  width: Number(widthInput.value),
  height: Number(heightInput.value),
  maxIterations: Number(iterationsInput.value),
  tileWidth: Number(tileWidthInput.value),
  tileHeight: Number(tileHeightInput.value),
  workerCount: Number(workerCountInput.value),
  chunkMode: chunkModeInput.value as ChunkMode,
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

const dragState: DragState = {
  active: false,
  startX: 0,
  startY: 0,
  startCenterRe: 0,
  startCenterIm: 0,
};

function formatMs(value: number) {
  return `${value.toFixed(1)} ms`;
}

function updateStats() {
  lastRenderOutput.textContent = formatMs(state.lastRenderMs);
  zoomOutput.textContent = `${state.view.zoom.toFixed(2)}×`;
  activeIterationsOutput.textContent = `${state.maxIterations}`;
  stepOutput.textContent = `${state.lastSteps.toLocaleString()}`;
}

function syncCanvasSize() {
  if (state.fillViewport) {
    const viewportWidth = Math.max(320, window.innerWidth - 340);
    const viewportHeight = Math.max(240, window.innerHeight - 32);
    state.width = viewportWidth;
    state.height = viewportHeight;
    widthInput.value = String(state.width);
    heightInput.value = String(state.height);
  }

  canvas.width = state.width;
  canvas.height = state.height;
  canvas.style.width = `${state.width}px`;
  canvas.style.height = `${state.height}px`;
}

function syncControlValues() {
  widthInput.value = String(state.width);
  heightInput.value = String(state.height);
  iterationsInput.value = String(state.maxIterations);
  tileWidthInput.value = String(state.tileWidth);
  tileHeightInput.value = String(state.tileHeight);
  workerCountInput.value = String(state.workerCount);
  chunkModeInput.value = state.chunkMode;
  zoomModeInput.value = state.zoomMode;
  zoomSensitivityInput.value = String(state.zoomSensitivity);
  fillViewportInput.checked = state.fillViewport;
  previewModeInput.value = state.previewMode;
  colorModeInput.value = state.colorMode;
  paletteInput.value = state.palette;
  colorCyclesInput.value = String(state.colorCycles);
  reverseColorsInput.checked = state.reverseColors;
  smoothColoringInput.checked = state.smoothColoring;
  autoAdjustColorsInput.checked = state.autoAdjustColors;
  paletteMinInput.value = String(state.paletteMinIterations);
  paletteMaxInput.value = String(state.paletteMaxIterations);
  hueShiftInput.value = String(state.hueShift);
  saturationInput.value = String(state.saturation);
  lightnessInput.value = String(state.lightness);
  colorSpaceInput.value = state.colorSpace;
  iterationsOutput.value = String(state.maxIterations);
  tileWidthOutput.value = String(state.tileWidth);
  tileHeightOutput.value = String(state.tileHeight);
  workerCountOutput.value = String(state.workerCount);
  zoomSensitivityOutput.value = state.zoomSensitivity.toFixed(1);
  colorCyclesOutput.value = String(state.colorCycles);
  paletteMinOutput.value = String(state.paletteMinIterations);
  paletteMaxOutput.value = String(state.paletteMaxIterations);
  hueShiftOutput.value = `${state.hueShift}°`;
  saturationOutput.value = state.saturation.toFixed(2);
  lightnessOutput.value = state.lightness.toFixed(2);
}

function terminateWorkers() {
  for (const worker of activeWorkers) {
    worker.terminate();
  }
  activeWorkers = [];
}

function loadSavedLogs() {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return;
  }

  try {
    const parsed = JSON.parse(saved) as RenderLogEntry[];
    renderLogs.push(...parsed);
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

function saveLogs() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(renderLogs));
}

function updateLogStats() {
  logCountOutput.textContent = `${renderLogs.length}`;
}

function appendRenderLog(scenario?: string) {
  renderLogs.push({
    timestamp: new Date().toISOString(),
    scenario,
    width: state.width,
    height: state.height,
    maxIterations: state.maxIterations,
    tileWidth: state.tileWidth,
    tileHeight: state.tileHeight,
    workerCount: state.workerCount,
    chunkMode: state.chunkMode,
    zoomMode: state.zoomMode,
    zoom: state.view.zoom,
    lastRenderMs: state.lastRenderMs,
    lastSteps: state.lastSteps,
  });
  saveLogs();
  updateLogStats();
}

function exportLogs() {
  const blob = new Blob([JSON.stringify(renderLogs, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'mandelbrot-render-log.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

function computeTargetView(factor: number, screenX: number, screenY: number, baseView: ViewState): ViewState {
  const viewWidth = 4 / baseView.zoom;
  const viewHeight = viewWidth * (state.height / state.width);
  const scaleRe = viewWidth / state.width;
  const scaleIm = viewHeight / state.height;

  const worldX = baseView.centerRe + (screenX - state.width / 2) * scaleRe;
  const worldY = baseView.centerIm + (screenY - state.height / 2) * scaleIm;

  const nextZoom = baseView.zoom * factor;
  const nextViewWidth = 4 / nextZoom;
  const nextViewHeight = nextViewWidth * (state.height / state.width);
  const nextScaleRe = nextViewWidth / state.width;
  const nextScaleIm = nextViewHeight / state.height;

  return {
    centerRe: worldX - (screenX - state.width / 2) * nextScaleRe,
    centerIm: worldY - (screenY - state.height / 2) * nextScaleIm,
    zoom: nextZoom,
  };
}

function renderFrame(renderId: number) {
  terminateWorkers();

  const previousFrame = drawingContext.getImageData(0, 0, state.width, state.height);
  const start = performance.now();
  const imageData = new ImageData(new Uint8ClampedArray(previousFrame.data), state.width, state.height);
  const data = imageData.data;
  let totalSteps = 0;
  let completedChunks = 0;

  const viewWidth = 4 / state.view.zoom;
  const viewHeight = viewWidth * (state.height / state.width);
  const scaleRe = viewWidth / state.width;
  const scaleIm = viewHeight / state.height;
  const chunkWidth = Math.max(1, state.tileWidth);
  const chunkHeight = Math.max(1, state.tileHeight);
  const queue: WorkerTask[] = [];

  if (state.chunkMode === 'none') {
    queue.push({ rowStart: 0, rowEnd: state.height, colStart: 0, colEnd: state.width });
  } else {
    for (let rowStart = 0; rowStart < state.height; rowStart += chunkHeight) {
      const rowEnd = Math.min(rowStart + chunkHeight, state.height);
      for (let colStart = 0; colStart < state.width; colStart += chunkWidth) {
        const colEnd = Math.min(colStart + chunkWidth, state.width);
        queue.push({ rowStart, rowEnd, colStart, colEnd });
      }
    }
  }

  const totalChunks = queue.length;
  const workerCount = state.chunkMode === 'none' ? 1 : Math.max(1, Math.min(8, state.workerCount));
  let activeChunkCount = 0;

  const finalizeRender = () => {
    if (renderId !== state.activeRenderId) {
      return;
    }

    drawingContext.putImageData(imageData, 0, 0);
    state.lastRenderMs = performance.now() - start;
    state.lastSteps = totalSteps;
    updateStats();
    appendRenderLog();
    terminateWorkers();
  };

  const scheduleTask = (worker: Worker) => {
    if (renderId !== state.activeRenderId) {
      return;
    }

    const nextTask = queue.shift();
    if (!nextTask) {
      if (activeChunkCount === 0) {
        finalizeRender();
      }
      return;
    }

    activeChunkCount += 1;
    worker.postMessage({
      renderId,
      width: state.width,
      height: state.height,
      maxIterations: state.maxIterations,
      centerRe: state.view.centerRe,
      centerIm: state.view.centerIm,
      zoom: state.view.zoom,
      rowStart: nextTask.rowStart,
      rowEnd: nextTask.rowEnd,
      colStart: nextTask.colStart,
      colEnd: nextTask.colEnd,
      scaleRe,
      scaleIm,
      colorMode: state.colorMode,
      palette: state.palette,
      reverseColors: state.reverseColors,
      smoothColoring: state.smoothColoring,
      colorCycles: state.colorCycles,
      autoAdjustColors: state.autoAdjustColors,
      paletteMinIterations: state.paletteMinIterations,
      paletteMaxIterations: state.paletteMaxIterations,
      hueShift: state.hueShift,
      saturation: state.saturation,
      lightness: state.lightness,
      colorSpace: state.colorSpace,
    });
  };

  for (let i = 0; i < workerCount; i += 1) {
    const worker = new Worker(new URL('./mandelbrot-worker.ts', import.meta.url), { type: 'module' });
    activeWorkers.push(worker);

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (renderId !== state.activeRenderId) {
        return;
      }

      const response = event.data;
      const rectangleWidth = response.colEnd - response.colStart;
      let sourceOffset = 0;

      for (let y = response.rowStart; y < response.rowEnd; y += 1) {
        const rowOffset = (y * state.width + response.colStart) * 4;
        for (let x = 0; x < rectangleWidth; x += 1) {
          data.set(response.data.subarray(sourceOffset, sourceOffset + 4), rowOffset + x * 4);
          sourceOffset += 4;
        }
      }

      totalSteps += response.steps;
      completedChunks += 1;
      activeChunkCount -= 1;
      drawingContext.putImageData(imageData, 0, 0);

      if (completedChunks === totalChunks) {
        finalizeRender();
        return;
      }

      scheduleTask(worker);
    };

    worker.onerror = () => {
      if (renderId !== state.activeRenderId) {
        return;
      }
      activeChunkCount -= 1;
      scheduleTask(worker);
    };

    scheduleTask(worker);
  }
}

function requestRender() {
  state.activeRenderId += 1;
  renderFrame(state.activeRenderId);
}

function applyZoom(factor: number, screenX: number, screenY: number) {
  const targetView = computeTargetView(factor, screenX, screenY, state.view);
  state.view = targetView;
  requestRender();
}

function drawZoomPreview(scale: number, originX: number, originY: number, previewCanvas: HTMLCanvasElement) {
  drawingContext.save();
  drawingContext.imageSmoothingEnabled = false;
  drawingContext.clearRect(0, 0, state.width, state.height);
  drawingContext.translate(originX, originY);
  drawingContext.scale(scale, scale);
  drawingContext.translate(-originX, -originY);
  drawingContext.drawImage(previewCanvas, 0, 0, state.width, state.height);
  drawingContext.restore();
}

function drawFallbackPreview() {
  if (state.previewMode === 'legacy') {
    drawingContext.save();
    drawingContext.fillStyle = '#0f172a';
    drawingContext.fillRect(0, 0, state.width, state.height);
    drawingContext.restore();
    return;
  }

  const previousFrame = drawingContext.getImageData(0, 0, state.width, state.height);
  drawingContext.putImageData(previousFrame, 0, 0);
}

function cancelZoomAnimation() {
  if (state.zoomAnimation?.frameId !== null && state.zoomAnimation?.frameId !== undefined) {
    cancelAnimationFrame(state.zoomAnimation.frameId);
  }
  state.zoomAnimation = null;
}

function beginSmoothZoom(factor: number, screenX: number, screenY: number) {
  cancelZoomAnimation();
  const from = { ...state.view };
  const to = computeTargetView(factor, screenX, screenY, from);
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = state.width;
  previewCanvas.height = state.height;
  const previewContext = previewCanvas.getContext('2d');
  if (previewContext) {
    previewContext.imageSmoothingEnabled = false;
    previewContext.drawImage(canvas, 0, 0, state.width, state.height);
  }

  const animation: ZoomAnimationState = {
    from,
    to,
    startTime: performance.now(),
    duration: 220,
    frameId: null,
    originX: screenX,
    originY: screenY,
    previewCanvas,
  };

  const step = (currentTime: number) => {
    const progress = Math.min(1, (currentTime - animation.startTime) / animation.duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const scaleRatio = animation.to.zoom / animation.from.zoom;
    const currentScale = 1 + (scaleRatio - 1) * eased;

    state.view = {
      centerRe: animation.from.centerRe + (animation.to.centerRe - animation.from.centerRe) * eased,
      centerIm: animation.from.centerIm + (animation.to.centerIm - animation.from.centerIm) * eased,
      zoom: animation.from.zoom + (animation.to.zoom - animation.from.zoom) * eased,
    };
    if (state.previewMode === 'legacy') {
      drawZoomPreview(currentScale, animation.originX, animation.originY, animation.previewCanvas);
    } else {
      drawFallbackPreview();
    }

    if (progress < 1) {
      animation.frameId = requestAnimationFrame(step);
    } else {
      state.view = animation.to;
      state.zoomAnimation = null;
      requestRender();
    }
  };

  animation.frameId = requestAnimationFrame(step);
  state.zoomAnimation = animation;
}

function resetView() {
  cancelZoomAnimation();
  state.view.centerRe = 0;
  state.view.centerIm = 0;
  state.view.zoom = 1;
  requestRender();
}

function handlePointerDown(event: MouseEvent) {
  dragState.active = true;
  dragState.startX = event.clientX;
  dragState.startY = event.clientY;
  dragState.startCenterRe = state.view.centerRe;
  dragState.startCenterIm = state.view.centerIm;
  canvas.style.cursor = 'grabbing';
}

function handlePointerMove(event: MouseEvent) {
  if (!dragState.active) {
    return;
  }

  const dx = event.clientX - dragState.startX;
  const dy = event.clientY - dragState.startY;
  const viewWidth = 4 / state.view.zoom;
  const viewHeight = viewWidth * (state.height / state.width);
  const scaleRe = viewWidth / state.width;
  const scaleIm = viewHeight / state.height;

  state.view.centerRe = dragState.startCenterRe - dx * scaleRe;
  state.view.centerIm = dragState.startCenterIm - dy * scaleIm;
  requestRender();
}

function handlePointerUp() {
  dragState.active = false;
  canvas.style.cursor = 'grab';
}

function getWheelZoomFactor(deltaY: number) {
  const baseFactor = deltaY < 0 ? 1.1 : 1 / 1.1;
  return Math.pow(baseFactor, state.zoomSensitivity);
}

function getClickZoomFactor(direction: 'in' | 'out') {
  const baseFactor = direction === 'in' ? 1.25 : 1 / 1.25;
  return Math.pow(baseFactor, state.zoomSensitivity);
}

function handleWheel(event: WheelEvent) {
  event.preventDefault();
  const factor = getWheelZoomFactor(event.deltaY);
  if (state.zoomMode === 'smooth') {
    beginSmoothZoom(factor, event.offsetX, event.offsetY);
  } else {
    applyZoom(factor, event.offsetX, event.offsetY);
  }
}

function handleClick(event: MouseEvent) {
  if (event.button !== 0) {
    const factor = getClickZoomFactor('out');
    if (state.zoomMode === 'smooth') {
      beginSmoothZoom(factor, event.offsetX, event.offsetY);
    } else {
      applyZoom(factor, event.offsetX, event.offsetY);
    }
    return;
  }

  const factor = getClickZoomFactor('in');
  if (state.zoomMode === 'smooth') {
    beginSmoothZoom(factor, event.offsetX, event.offsetY);
  } else {
    applyZoom(factor, event.offsetX, event.offsetY);
  }
}

function applyBenchmarkCase(testCase: BenchmarkCase) {
  state.width = testCase.width;
  state.height = testCase.height;
  state.maxIterations = testCase.maxIterations;
  state.tileWidth = testCase.tileWidth;
  state.tileHeight = testCase.tileHeight;
  state.workerCount = testCase.workerCount;
  state.chunkMode = testCase.chunkMode;
  state.zoomMode = testCase.zoomMode;
  syncControlValues();
  syncCanvasSize();
  requestRender();
}

function runBenchmarkSweep() {
  const cases: BenchmarkCase[] = [
    { label: 'baseline', width: 800, height: 600, maxIterations: 220, tileWidth: 256, tileHeight: 256, workerCount: 4, chunkMode: 'rectangles', zoomMode: 'instant' },
    { label: 'high-iterations', width: 1000, height: 700, maxIterations: 440, tileWidth: 256, tileHeight: 256, workerCount: 4, chunkMode: 'rectangles', zoomMode: 'instant' },
    { label: 'no-chunking', width: 1000, height: 700, maxIterations: 440, tileWidth: 512, tileHeight: 512, workerCount: 1, chunkMode: 'none', zoomMode: 'instant' },
    { label: 'larger-chunks', width: 1250, height: 850, maxIterations: 440, tileWidth: 512, tileHeight: 512, workerCount: 8, chunkMode: 'rectangles', zoomMode: 'instant' },
  ];

  let index = 0;

  const nextCase = () => {
    if (index >= cases.length) {
      benchmarkTimer = null;
      return;
    }

    const next = cases[index];
    index += 1;
    applyBenchmarkCase(next);
    benchmarkTimer = window.setTimeout(nextCase, 1400);
  };

  if (benchmarkTimer !== null) {
    window.clearTimeout(benchmarkTimer);
  }
  nextCase();
}

function wireControls() {
  widthInput.addEventListener('change', () => {
    state.width = Math.max(200, Number(widthInput.value));
    state.fillViewport = false;
    fillViewportInput.checked = false;
    widthInput.value = String(state.width);
    syncCanvasSize();
    requestRender();
  });

  heightInput.addEventListener('change', () => {
    state.height = Math.max(200, Number(heightInput.value));
    state.fillViewport = false;
    fillViewportInput.checked = false;
    heightInput.value = String(state.height);
    syncCanvasSize();
    requestRender();
  });

  iterationsInput.addEventListener('input', () => {
    state.maxIterations = Number(iterationsInput.value);
    iterationsOutput.value = String(state.maxIterations);
    requestRender();
  });

  tileWidthInput.addEventListener('input', () => {
    state.tileWidth = Number(tileWidthInput.value);
    tileWidthOutput.value = String(state.tileWidth);
    requestRender();
  });

  tileHeightInput.addEventListener('input', () => {
    state.tileHeight = Number(tileHeightInput.value);
    tileHeightOutput.value = String(state.tileHeight);
    requestRender();
  });

  workerCountInput.addEventListener('input', () => {
    state.workerCount = Number(workerCountInput.value);
    workerCountOutput.value = String(state.workerCount);
    requestRender();
  });

  chunkModeInput.addEventListener('change', () => {
    state.chunkMode = chunkModeInput.value as ChunkMode;
    requestRender();
  });

  zoomModeInput.addEventListener('change', () => {
    state.zoomMode = zoomModeInput.value as 'instant' | 'smooth';
  });

  zoomSensitivityInput.addEventListener('input', () => {
    state.zoomSensitivity = Number(zoomSensitivityInput.value);
    zoomSensitivityOutput.value = state.zoomSensitivity.toFixed(1);
  });

  colorModeInput.addEventListener('change', () => {
    state.colorMode = colorModeInput.value as ColorMode;
    requestRender();
  });

  paletteInput.addEventListener('change', () => {
    state.palette = paletteInput.value as PaletteName;
    requestRender();
  });

  colorCyclesInput.addEventListener('input', () => {
    state.colorCycles = Number(colorCyclesInput.value);
    colorCyclesOutput.value = String(state.colorCycles);
    requestRender();
  });

  reverseColorsInput.addEventListener('change', () => {
    state.reverseColors = reverseColorsInput.checked;
    requestRender();
  });

  smoothColoringInput.addEventListener('change', () => {
    state.smoothColoring = smoothColoringInput.checked;
    requestRender();
  });

  autoAdjustColorsInput.addEventListener('change', () => {
    state.autoAdjustColors = autoAdjustColorsInput.checked;
    requestRender();
  });

  paletteMinInput.addEventListener('input', () => {
    state.paletteMinIterations = Number(paletteMinInput.value);
    paletteMinOutput.value = String(state.paletteMinIterations);
    requestRender();
  });

  paletteMaxInput.addEventListener('input', () => {
    state.paletteMaxIterations = Number(paletteMaxInput.value);
    paletteMaxOutput.value = String(state.paletteMaxIterations);
    requestRender();
  });

  hueShiftInput.addEventListener('input', () => {
    state.hueShift = Number(hueShiftInput.value);
    hueShiftOutput.value = `${state.hueShift}°`;
    requestRender();
  });

  saturationInput.addEventListener('input', () => {
    state.saturation = Number(saturationInput.value);
    saturationOutput.value = state.saturation.toFixed(2);
    requestRender();
  });

  lightnessInput.addEventListener('input', () => {
    state.lightness = Number(lightnessInput.value);
    lightnessOutput.value = state.lightness.toFixed(2);
    requestRender();
  });

  colorSpaceInput.addEventListener('change', () => {
    state.colorSpace = colorSpaceInput.value as ColorSpace;
    requestRender();
  });

  fillViewportInput.addEventListener('change', () => {
    state.fillViewport = fillViewportInput.checked;
    syncCanvasSize();
    requestRender();
  });

  previewModeInput.addEventListener('change', () => {
    state.previewMode = previewModeInput.value as 'current' | 'legacy';
  });

  renderButton.addEventListener('click', () => requestRender());
  resetButton.addEventListener('click', () => resetView());
  exportLogsButton.addEventListener('click', () => exportLogs());
  benchmarkButton.addEventListener('click', () => runBenchmarkSweep());

  canvas.addEventListener('mousedown', handlePointerDown);
  window.addEventListener('mousemove', handlePointerMove);
  window.addEventListener('mouseup', handlePointerUp);
  canvas.addEventListener('wheel', handleWheel, { passive: false });
  canvas.addEventListener('click', handleClick);
}

function init() {
  loadSavedLogs();
  updateLogStats();
  syncControlValues();
  syncCanvasSize();
  updateStats();
  wireControls();
  canvas.style.cursor = 'grab';
  requestRender();
}

window.addEventListener('resize', () => {
  if (state.fillViewport) {
    syncCanvasSize();
    requestRender();
  }
});

init();
