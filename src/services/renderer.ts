import { ChunkMode, ColorMode, PaletteName, ColorSpace, ViewState, TileTask, WorkerResponse, FractalType, PanRegion } from '../types';
import { settingsEngine } from '../settings/instance';
import { state, renderContext, PREVIEW_PLACEHOLDER_COLOR } from '../state';
import { drawingContext } from '../ui/dom';
import { markDebug } from '../utils/debug';

export const renderCallbacks = {
  onRenderStart: (_renderId: number) => {},
  onRenderComplete: (_view: ViewState, _lastRenderMs: number, _totalSteps: number) => {},
  onRenderCancel: () => {},
};

const fractalWorkerMap: Record<FractalType, string> = {
  mandelbrot: '../workers/mandelbrot/worker.ts',
  julia: '../workers/julia/worker.ts',
  'burning-ship': '../workers/burning-ship/worker.ts',
  buffalo: '../workers/buffalo/worker.ts',
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

// --- Pan preview ---------------------------------------------------------
// During a drag we translate the last completed frame with drawImage for
// instant, smooth motion, and only dispatch workers for the strip that scrolled
// into view. The view mapping is isotropic (scaleRe === scaleIm), so a screen
// translation is an exact world translation — the shifted base pixels are
// already correct for the new view, so they never need recomputing.

function snapshotPanBase(imageData: ImageData, view: ViewState, width: number, height: number) {
  if (!renderContext.panBaseCanvas) {
    renderContext.panBaseCanvas = document.createElement('canvas');
  }
  renderContext.panBaseCanvas.width = width;
  renderContext.panBaseCanvas.height = height;
  const ctx = renderContext.panBaseCanvas.getContext('2d');
  if (!ctx) return;
  ctx.putImageData(imageData, 0, 0);
  renderContext.panBaseView = { ...view };
}

function exposedRegions(dxPx: number, dyPy: number, width: number, height: number): PanRegion[] {
  // The base, shifted by (dxPx, dyPy), fails to cover the destination along the
  // axes it moved. For a pure translation the uncovered area is an L: one
  // full-height strip on the leading horizontal edge plus one full-width strip
  // on the leading vertical edge. Return each arm (1 or 2 rects) so the renderer
  // fills exactly the newly-exposed cells - not the whole canvas, not a corner.
  const regions: PanRegion[] = [];
  if (dxPx === 0 && dyPy === 0) return regions;

  if (dxPx > 0) {
    regions.push({ x0: 0, y0: 0, x1: Math.ceil(dxPx), y1: height });
  } else if (dxPx < 0) {
    regions.push({ x0: Math.floor(width + dxPx), y0: 0, x1: width, y1: height });
  }

  if (dyPy > 0) {
    regions.push({ x0: 0, y0: 0, x1: width, y1: Math.ceil(dyPy) });
  } else if (dyPy < 0) {
    regions.push({ x0: 0, y0: Math.floor(height + dyPy), x1: width, y1: height });
  }

  return regions;
}

export function startPanPreview() {
  renderContext.panActive = true;
  renderContext.panRenderScheduled = false;
  const width = settingsEngine.getValue('width') as number;
  const height = settingsEngine.getValue('height') as number;
  snapshotPanBase(drawingContext.getImageData(0, 0, width, height), { ...state.view }, width, height);
}

export function updatePanPreview() {
  if (!renderContext.panActive || !renderContext.panBaseCanvas || !renderContext.panBaseView) {
    requestRender();
    return;
  }

  const width = settingsEngine.getValue('width') as number;
  const height = settingsEngine.getValue('height') as number;
  const scaleRe = (4 / state.view.zoom) / width; // isotropic: scaleRe === scaleIm
  const dxPx = (renderContext.panBaseView.centerRe - state.view.centerRe) / scaleRe;
  const dyPx = (renderContext.panBaseView.centerIm - state.view.centerIm) / scaleRe;

  // Instant, smooth translation of the last completed frame.
  drawingContext.drawImage(renderContext.panBaseCanvas, dxPx, dyPx);

  const regions = exposedRegions(dxPx, dyPx, width, height);
  if (regions.length > 0) {
    // Clear the uncovered strips to the placeholder colour so still-rendering
    // cells never show stale fractal content (which reads as ghost trails).
    drawingContext.fillStyle = PREVIEW_PLACEHOLDER_COLOR;
    for (const r of regions) {
      drawingContext.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    }
    if (!renderContext.panRenderScheduled) {
      renderContext.panRenderScheduled = true;
      requestRender(undefined, undefined, regions);
    }
  }
}

export function endPanPreview() {
  renderContext.panActive = false;
  if (!renderContext.panBaseCanvas || !renderContext.panBaseView) {
    return;
  }
  const width = settingsEngine.getValue('width') as number;
  const height = settingsEngine.getValue('height') as number;
  const scaleRe = (4 / state.view.zoom) / width;
  const dxPx = (renderContext.panBaseView.centerRe - state.view.centerRe) / scaleRe;
  const dyPx = (renderContext.panBaseView.centerIm - state.view.centerIm) / scaleRe;
  const regions = exposedRegions(dxPx, dyPx, width, height);
  if (regions.length > 0) {
    requestRender(undefined, undefined, regions);
  }
}

export function requestRender(focalX?: number, focalY?: number, regions?: PanRegion[]) {
  state.activeRenderId += 1;
  markDebug('render:request', {
    nextRenderId: state.activeRenderId,
    regionCount: regions ? regions.length : 0,
  });
  renderFrame(state.activeRenderId, focalX, focalY, regions);
}

function tileDistanceSquared(tile: TileTask, x: number, y: number) {
  const centerX = (tile.colStart + tile.colEnd) / 2;
  const centerY = (tile.rowStart + tile.rowEnd) / 2;
  const dx = centerX - x;
  const dy = centerY - y;
  return dx * dx + dy * dy;
}

export function renderFrame(renderId: number, focalX?: number, focalY?: number, regions?: PanRegion[]) {
  // Region renders are incremental pan fills: no start/complete callbacks, no
  // log spam — just compute the newly-exposed strip and composite it.
  const hasRegions = regions !== undefined && regions.length > 0;
  if (!hasRegions) {
    renderCallbacks.onRenderStart(renderId);
  }
  terminateWorkers();

  const width = settingsEngine.getValue('width') as number;
  const height = settingsEngine.getValue('height') as number;
  const maxIterations = settingsEngine.getValue('maxIterations') as number;
  const chunkMode = settingsEngine.getValue('chunkMode') as ChunkMode;
  const previewMode = settingsEngine.getValue('previewMode') as 'current' | 'legacy';
  const zoomMode = settingsEngine.getValue('zoomMode') as 'instant' | 'smooth';
  const gridColumns = settingsEngine.getValue('gridColumns') as number;
  const gridRows = settingsEngine.getValue('gridRows') as number;
  const workerCountSetting = settingsEngine.getValue('workerCount') as number;
  const fractalType = settingsEngine.getValue('fractalType') as FractalType;
  const solidGuessing = settingsEngine.getValue('solidGuessing') as boolean;
  const geometricCulling = settingsEngine.getValue('geometricCulling') as boolean;
  const periodicityChecking = settingsEngine.getValue('periodicityChecking') as boolean;
  const colorMode = settingsEngine.getValue('colorMode') as ColorMode;
  const palette = settingsEngine.getValue('palette') as PaletteName;
  const reverseColors = settingsEngine.getValue('reverseColors') as boolean;
  const smoothColoring = settingsEngine.getValue('smoothColoring') as boolean;
  const colorCycles = settingsEngine.getValue('colorCycles') as number;
  const autoAdjustColors = settingsEngine.getValue('autoAdjustColors') as boolean;
  const paletteMinIterations = settingsEngine.getValue('paletteMinIterations') as number;
  const paletteMaxIterations = settingsEngine.getValue('paletteMaxIterations') as number;
  const hueShift = settingsEngine.getValue('hueShift') as number;
  const saturation = settingsEngine.getValue('saturation') as number;
  const lightness = settingsEngine.getValue('lightness') as number;
  const colorSpace = settingsEngine.getValue('colorSpace') as ColorSpace;
  const flipX = settingsEngine.getValue('flipX') as boolean;
  const flipY = settingsEngine.getValue('flipY') as boolean;

  const previousFrame = drawingContext.getImageData(0, 0, width, height);
  const start = performance.now();
  const imageData = new ImageData(new Uint8ClampedArray(previousFrame.data), width, height);
  const data = imageData.data;
  const renderView = { ...state.view };
  const focusX = focalX ?? width / 2;
  const focusY = focalY ?? height / 2;
  let totalSteps = 0;
  let completedChunks = 0;
  let solidGuessedChunks = 0;
  let culledPixels = 0;
  let periodicityShortCircuits = 0;

  markDebug('render:start', {
    width: width,
    height: height,
    maxIterations: maxIterations,
    chunkMode: chunkMode,
    previewMode: previewMode,
    zoomMode: zoomMode,
    focusX: Number(focusX.toFixed(1)),
    focusY: Number(focusY.toFixed(1)),
  }, renderId);

  const viewWidth = 4 / renderView.zoom;
  const viewHeight = viewWidth * (height / width);
  const scaleRe = viewWidth / width;
  const scaleIm = viewHeight / height;
  const queue: TileTask[] = [];

  if (hasRegions) {
    // Incremental pan fill: build the normal grid of chunks and keep only those
    // intersecting a newly-exposed strip, so cells render exactly as in a full
    // render - never the whole canvas, never a custom shape.
    const columns = Math.max(1, gridColumns);
    const rows = Math.max(1, gridRows);
    const chunkWidth = width / columns;
    const chunkHeight = height / rows;

    for (let row = 0; row < rows; row += 1) {
      const rowStart = Math.floor(row * chunkHeight);
      const rowEnd = Math.min(height, Math.floor((row + 1) * chunkHeight));
      for (let col = 0; col < columns; col += 1) {
        const colStart = Math.floor(col * chunkWidth);
        const colEnd = Math.min(width, Math.floor((col + 1) * chunkWidth));
        const intersects = regions!.some(
          (r) => colEnd > r.x0 && colStart < r.x1 && rowEnd > r.y0 && rowStart < r.y1,
        );
        if (intersects) {
          queue.push({ rowStart, rowEnd, colStart, colEnd });
        }
      }
    }
  } else if (chunkMode === 'none') {
      queue.push({ rowStart: 0, rowEnd: height, colStart: 0, colEnd: width });
    } else {
      const columns = Math.max(1, gridColumns);
      const rows = Math.max(1, gridRows);

      // Snap to the largest region that divides evenly into the grid, so every
      // tile is an identical whole-pixel rectangle with zero seam error. Any
      // leftover pixels on the right/bottom edge (a few px at most) are left
      // untouched by workers for this render; they retain the previous frame's
      // pixels since `imageData` was seeded from getImageData() above.
      const griddedWidth = Math.floor(width / columns) * columns;
      const griddedHeight = Math.floor(height / rows) * rows;
      const chunkWidth = griddedWidth / columns;
      const chunkHeight = griddedHeight / rows;

      for (let row = 0; row < rows; row += 1) {
        const rowStart = row * chunkHeight;
        const rowEnd = rowStart + chunkHeight;
        for (let col = 0; col < columns; col += 1) {
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
  const workerCount = chunkMode === 'none' ? 1 : Math.max(1, Math.min(8, workerCountSetting));
  let activeChunkCount = 0;

  const finalizeRender = () => {
    if (renderId !== state.activeRenderId) {
      markDebug('render:finalize-stale', undefined, renderId);
      return;
    }

    if (!hasRegions) {
      // Keep the last completed frame as the pan base so successive pans can
      // translate it instead of recomputing the whole canvas.
      snapshotPanBase(imageData, renderView, width, height);

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
    } else {
      // Incremental pan fill: the live canvas now holds the composited frame
      // (drag-translated base + just-filled strip). Adopt it as the pan base
      // and sync the base view to the live view so the *next* drag move only
      // exposes the strip revealed since this fill — no cumulative re-render.
      // Re-open the scheduling gate so a follow-up strip can be requested.
      snapshotPanBase(drawingContext.getImageData(0, 0, width, height), { ...state.view }, width, height);
      renderContext.panRenderScheduled = false;
    }
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
      width: width,
      height: height,
      maxIterations: maxIterations,
      centerRe: renderView.centerRe,
      centerIm: renderView.centerIm,
      zoom: renderView.zoom,
      rowStart: nextTask.rowStart,
      rowEnd: nextTask.rowEnd,
      colStart: nextTask.colStart,
      colEnd: nextTask.colEnd,
      scaleRe,
      scaleIm,
      solidGuessing: solidGuessing,
      geometricCulling: geometricCulling,
      periodicityChecking: periodicityChecking,
      // TODO(Slice 5 - palette plugins): interior-detail settings belong to
      // the world-map palette, not core settings. Hardcoded to "off" until
      // they're re-homed as palette-owned settings.
      interiorDetail: false,
      interiorNoiseMode: 'single',
      interiorNoiseStrength: 0,
      colorMode: colorMode,
      palette: palette,
      reverseColors: reverseColors,
      smoothColoring: smoothColoring,
      colorCycles: colorCycles,
      autoAdjustColors: autoAdjustColors,
      paletteMinIterations: paletteMinIterations,
      paletteMaxIterations: paletteMaxIterations,
      hueShift: hueShift,
      saturation: saturation,
      lightness: lightness,
      colorSpace: colorSpace,
      flipX: flipX,
      flipY: flipY,
    });
  };

  for (let i = 0; i < workerCount; i += 1) {
    const worker = new Worker(new URL(fractalWorkerMap[fractalType], import.meta.url), { type: 'module' });
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
        const rowOffset = (y * width + response.colStart) * 4;
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
      if (hasRegions) {
        // Incremental pan fill: paint only the cells just computed onto the
        // live canvas (dirty-rectangle form). Shift the painted image by the
        // screen delta between the view this render was requested for and the
        // live view, so cells land at their current position even though the
        // canvas kept moving while the worker was busy (no ghost trails).
        const paintDx = (renderView.centerRe - state.view.centerRe) / scaleRe;
        const paintDy = (renderView.centerIm - state.view.centerIm) / scaleRe;
        drawingContext.putImageData(
          imageData,
          paintDx,
          paintDy,
          response.colStart,
          response.rowStart,
          response.colEnd - response.colStart,
          response.rowEnd - response.rowStart,
        );
      } else {
        drawingContext.putImageData(imageData, 0, 0);
      }

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
