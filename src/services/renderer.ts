import { ViewState, TileTask, WorkerResponse } from '../types';
import { state, renderContext } from '../state';
import { drawingContext } from '../ui/dom';
import { markDebug } from '../utils/debug';

export const renderCallbacks = {
  onRenderStart: (_renderId: number) => {},
  onRenderComplete: (_view: ViewState, _lastRenderMs: number, _totalSteps: number) => {},
  onRenderCancel: () => {},
};

export function terminateWorkers() {
  for (const worker of renderContext.activeWorkers) {
    worker.terminate();
  }
  renderContext.activeWorkers = [];
}

export function cancelActiveRender() {
  markDebug('render:cancel-active', {
    workerCount: renderContext.activeWorkers.length,
    nextActiveRenderId: state.activeRenderId + 1,
  });
  state.activeRenderId += 1;
  terminateWorkers();
  renderCallbacks.onRenderCancel();
}

export function requestRender() {
  state.activeRenderId += 1;
  markDebug('render:request', {
    nextRenderId: state.activeRenderId,
  });
  renderFrame(state.activeRenderId);
}

export function renderFrame(renderId: number) {
  renderCallbacks.onRenderStart(renderId);
  terminateWorkers();

  const previousFrame = drawingContext.getImageData(0, 0, state.width, state.height);
  const start = performance.now();
  const imageData = new ImageData(new Uint8ClampedArray(previousFrame.data), state.width, state.height);
  const data = imageData.data;
  const renderView = { ...state.view };
  let totalSteps = 0;
  let completedChunks = 0;
  markDebug('render:start', {
    width: state.width,
    height: state.height,
    maxIterations: state.maxIterations,
    chunkMode: state.chunkMode,
    previewMode: state.previewMode,
    zoomMode: state.zoomMode,
  }, renderId);

  const viewWidth = 4 / renderView.zoom;
  const viewHeight = viewWidth * (state.height / state.width);
  const scaleRe = viewWidth / state.width;
  const scaleIm = viewHeight / state.height;
  const chunkWidth = Math.max(1, state.tileWidth);
  const chunkHeight = Math.max(1, state.tileHeight);
  const queue: TileTask[] = [];

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
      markDebug('render:finalize-stale', undefined, renderId);
      return;
    }

    drawingContext.putImageData(imageData, 0, 0);
    state.lastRenderMs = performance.now() - start;
    state.lastSteps = totalSteps;
    terminateWorkers();
    markDebug('render:finish', {
      completedChunks,
      totalChunks,
      ms: Number(state.lastRenderMs.toFixed(2)),
    }, renderId);

    renderCallbacks.onRenderComplete(renderView, state.lastRenderMs, totalSteps);
  };

  const scheduleTask = (worker: Worker) => {
    if (renderId !== state.activeRenderId) {
      markDebug('render:schedule-stale', undefined, renderId);
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
      centerRe: renderView.centerRe,
      centerIm: renderView.centerIm,
      zoom: renderView.zoom,
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
    const worker = new Worker(new URL('../mandelbrot-worker.ts', import.meta.url), { type: 'module' });
    renderContext.activeWorkers.push(worker);

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (renderId !== state.activeRenderId) {
        markDebug('render:tile-stale', {
          responseRenderId: event.data.renderId,
        }, renderId);
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

      if (completedChunks === 1 || completedChunks === totalChunks) {
        markDebug('render:tile-paint', {
          completedChunks,
          totalChunks,
          rowStart: response.rowStart,
          rowEnd: response.rowEnd,
          colStart: response.colStart,
          colEnd: response.colEnd,
        }, renderId);
      }

      if (completedChunks === totalChunks) {
        finalizeRender();
        return;
      }

      scheduleTask(worker);
    };

    worker.onerror = () => {
      if (renderId !== state.activeRenderId) {
        markDebug('render:error-stale', undefined, renderId);
        return;
      }
      activeChunkCount -= 1;
      scheduleTask(worker);
    };

    scheduleTask(worker);
  }
}
