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

export function requestRender(focalX?: number, focalY?: number) {
  state.activeRenderId += 1;
  markDebug('render:request', {
    nextRenderId: state.activeRenderId,
  });
  renderFrame(state.activeRenderId, focalX, focalY);
}

function tileDistanceSquared(tile: TileTask, x: number, y: number) {
  const centerX = (tile.colStart + tile.colEnd) / 2;
  const centerY = (tile.rowStart + tile.rowEnd) / 2;
  const dx = centerX - x;
  const dy = centerY - y;
  return dx * dx + dy * dy;
}

export function renderFrame(renderId: number, focalX?: number, focalY?: number) {
  renderCallbacks.onRenderStart(renderId);
  terminateWorkers();

  const previousFrame = drawingContext.getImageData(0, 0, state.width, state.height);
  const start = performance.now();
  const imageData = new ImageData(new Uint8ClampedArray(previousFrame.data), state.width, state.height);
  const data = imageData.data;
  const renderView = { ...state.view };
  const focusX = focalX ?? state.width / 2;
  const focusY = focalY ?? state.height / 2;
  let totalSteps = 0;
  let completedChunks = 0;
  let solidGuessedChunks = 0;
  let culledPixels = 0;
  let periodicityShortCircuits = 0;

  markDebug('render:start', {
    width: state.width,
    height: state.height,
    maxIterations: state.maxIterations,
    chunkMode: state.chunkMode,
    previewMode: state.previewMode,
    zoomMode: state.zoomMode,
    focusX: Number(focusX.toFixed(1)),
    focusY: Number(focusY.toFixed(1)),
  }, renderId);

  const viewWidth = 4 / renderView.zoom;
  const viewHeight = viewWidth * (state.height / state.width);
  const scaleRe = viewWidth / state.width;
  const scaleIm = viewHeight / state.height;
  const queue: TileTask[] = [];

    if (state.chunkMode === 'none') {
      queue.push({ rowStart: 0, rowEnd: state.height, colStart: 0, colEnd: state.width });
    } else {
      const gridColumns = Math.max(1, state.gridColumns);
      const gridRows = Math.max(1, state.gridRows);

      // Snap to the largest region that divides evenly into the grid, so every
      // tile is an identical whole-pixel rectangle with zero seam error. Any
      // leftover pixels on the right/bottom edge (a few px at most) are left
      // untouched by workers for this render; they retain the previous frame's
      // pixels since `imageData` was seeded from getImageData() above.
      const griddedWidth = Math.floor(state.width / gridColumns) * gridColumns;
      const griddedHeight = Math.floor(state.height / gridRows) * gridRows;
      const chunkWidth = griddedWidth / gridColumns;
      const chunkHeight = griddedHeight / gridRows;

      for (let row = 0; row < gridRows; row += 1) {
        const rowStart = row * chunkHeight;
        const rowEnd = rowStart + chunkHeight;
        for (let col = 0; col < gridColumns; col += 1) {
          const colStart = col * chunkWidth;
          const colEnd = colStart + chunkWidth;
          queue.push({ rowStart, rowEnd, colStart, colEnd });
        }
      }
    }
    
  // Prioritize tiles nearest the user's zoom/click focal point (or canvas
  // center as a sensible default for pan/slider-triggered renders). Because
  // dispatch is FCFS (scheduleTask() does queue.shift()), sorting the queue
  // here is sufficient to control dispatch order — no change to worker
  // scheduling logic is needed.
  if (queue.length > 1) {
    queue.sort((a, b) => tileDistanceSquared(a, focusX, focusY) - tileDistanceSquared(b, focusX, focusY));
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
      solidGuessedChunks,
      culledPixels,
      periodicityShortCircuits,
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
      solidGuessing: state.solidGuessing,
      geometricCulling: state.geometricCulling,
      periodicityChecking: state.periodicityChecking,
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
      if (response.solidGuessed) {
        solidGuessedChunks += 1;
      }

      culledPixels += response.culledPixels ?? 0;
      periodicityShortCircuits += response.periodicityShortCircuits ?? 0;

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
