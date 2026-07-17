import { ColorMode, PaletteName, ColorSpace, ViewState, FractalType, WorkerTask, WorkerResponse } from '../types';
import { settingsEngine } from '../settings/instance';
import { state, renderContext, PREVIEW_PLACEHOLDER_COLOR } from '../state';
import { drawingContext } from '../ui/dom';
import { markDebug } from '../utils/debug';
import {
  assembleFromCache,
  assembleBestCachedViewport,
  ensureSignatureCurrent,
  putTile,
  keyFor,
  getRenderSignature,
} from './tile-cache';

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

// --- Persistent worker pool ------------------------------------------------
// A `type: 'module'` worker cannot process its first message until its whole
// import graph has been fetched, compiled, and its top-level code has run to
// register `self.onmessage`. Creating N fresh workers per render (and killing
// them on completion, as we used to) meant every zoom/pan paid that cold-start
// before the first tile could resolve — a large, roughly fixed slice of each
// render's wall-clock time.
//
// Instead we keep a persistent pool: created once (ideally warmed at startup),
// reused across renders. Cancellation no longer terminates workers — it bumps
// the render id so any in-flight tiles are recognized as stale and dropped on
// arrival, and the freed worker immediately picks up the next render's work.

let poolWorkers: Worker[] = [];
let poolFractalType: FractalType | null = null;
const idleWorkers = new Set<Worker>();

type Miss = { col: number; row: number; i: number; j: number };

// The render currently accepting tile results. Each render installs a fresh job
// here; the pool's persistent message handlers route completed tiles to it.
type ActiveRender = {
  renderId: number;
  queue: Miss[];
  outstanding: number;
  buildTask: (m: Miss) => WorkerTask;
  handleResult: (resp: WorkerResponse) => void;
  finalize: () => void;
};

let activeRender: ActiveRender | null = null;

function handleWorkerMessage(worker: Worker, event: MessageEvent<WorkerResponse>) {
  idleWorkers.add(worker);
  const ar = activeRender;
  const resp = event.data;
  // Accept a tile only if it belongs to the current, still-active render. A
  // pooled worker may deliver a tile from a cancelled or superseded render (it
  // was still computing when we moved on); those results are dropped here.
  if (ar && resp.renderId === ar.renderId && ar.renderId === state.activeRenderId) {
    ar.outstanding -= 1;
    ar.handleResult(resp);
  } else {
    markDebug('render:tile-stale', { responseRenderId: resp.renderId });
  }
  pump();
}

function handleWorkerError(worker: Worker) {
  idleWorkers.add(worker);
  const ar = activeRender;
  // We can't tell which task failed from an error event, so conservatively drop
  // one outstanding task for the active render (the tile is skipped) so the
  // render can still reach completion. This matches the prior behavior of not
  // re-queuing failed tiles.
  if (ar && ar.renderId === state.activeRenderId && ar.outstanding > 0) {
    ar.outstanding -= 1;
  }
  pump();
}

// Feed queued tiles to idle workers, then finalize once the render is drained.
// Exactly one task is outstanding per worker at any time (a worker is removed
// from `idleWorkers` when dispatched, re-added when it replies), so no backlog
// accumulates under rapid cancel/restart cycles.
function pump() {
  const ar = activeRender;
  if (!ar || ar.renderId !== state.activeRenderId) return;
  while (idleWorkers.size > 0 && ar.queue.length > 0) {
    const worker = idleWorkers.values().next().value as Worker;
    idleWorkers.delete(worker);
    const m = ar.queue.shift() as Miss;
    ar.outstanding += 1;
    worker.postMessage(ar.buildTask(m));
  }
  if (ar.queue.length === 0 && ar.outstanding === 0) {
    ar.finalize();
  }
}

// Ensure the pool holds exactly `count` workers for `fractalType`. Creates the
// pool on first use (or rebuilds it after a fractal-type change, since workers
// bake in their fractal's script), and grows/shrinks to track the worker-count
// setting. Idempotent and cheap when the pool already matches.
function ensurePool(fractalType: FractalType, count: number) {
  if (poolFractalType !== fractalType) {
    for (const worker of poolWorkers) worker.terminate();
    poolWorkers = [];
    idleWorkers.clear();
    poolFractalType = fractalType;
  }

  let created = 0;
  while (poolWorkers.length < count) {
    const worker = new Worker(new URL(fractalWorkerMap[fractalType], import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => handleWorkerMessage(worker, event);
    worker.onerror = () => handleWorkerError(worker);
    poolWorkers.push(worker);
    idleWorkers.add(worker);
    created += 1;
  }
  while (poolWorkers.length > count) {
    const worker = poolWorkers.pop() as Worker;
    idleWorkers.delete(worker);
    worker.terminate();
  }

  if (created > 0) {
    markDebug('pool:create', { fractalType, created, size: poolWorkers.length });
  }
}

// Create/prepare the worker pool ahead of the first render so its module-load
// cost overlaps idle time (app startup, or a zoom animation) rather than
// blocking the render. Purely an optimization: renderFrame always calls
// ensurePool itself, so rendering stays correct even if this is never invoked.
export function warmPool() {
  const fractalType = settingsEngine.getValue('fractalType') as FractalType;
  const count = Math.max(1, Math.min(8, settingsEngine.getValue('workerCount') as number));
  ensurePool(fractalType, count);
}

// Destroy the entire pool. Kept for explicit teardown; NOT called on cancel
// (cancellation keeps the pool warm).
export function terminateWorkers() {
  for (const worker of poolWorkers) worker.terminate();
  poolWorkers = [];
  idleWorkers.clear();
  poolFractalType = null;
}

export function cancelActiveRender() {
  markDebug('render:cancel-active', {
    workerCount: poolWorkers.length,
    nextActiveRenderId: state.activeRenderId + 1,
  });
  state.activeRenderId += 1;
  // Do NOT terminate the pool. Bumping the render id makes any in-flight tiles
  // stale (they are dropped when they arrive), and the workers stay warm and
  // become available for the next render as soon as they finish their current
  // tile.
  activeRender = null;
  renderCallbacks.onRenderCancel();
}

// --- Pan preview ---------------------------------------------------------
// During a drag the current view is composited directly from the tile cache:
// every tile ever rendered at this zoom is stored, so panning back over seen
// ground is instant. Only genuinely-new area shows the placeholder until its
// tiles compute. Zoom is constant during a pan, so cached tiles align exactly.

export function startPanPreview() {
  renderContext.panActive = true;
  renderContext.panRenderScheduled = false;
}

export function updatePanPreview() {
  if (!renderContext.panActive) {
    requestRender();
    return;
  }

  const width = settingsEngine.getValue('width') as number;
  const height = settingsEngine.getValue('height') as number;

  // Clear to placeholder, then build the frame in two layers:
  //  1. Base: the nearest OTHER cached zoom level, scaled to this view, filling
  //     newly-exposed area with real (if lower-res) pixels instead of the bare
  //     placeholder — the same idea as the zoom-out preview, applied to panning.
  //  2. Top: crisp cached tiles at the current exact zoom, drawn opaquely as a
  //     single image over the base. Because the base covers the whole viewport
  //     and the crisp tiles composite on top, there are no seams or gaps at the
  //     boundary — the base only ever shows through where no exact tile exists.
  drawingContext.fillStyle = PREVIEW_PLACEHOLDER_COLOR;
  drawingContext.fillRect(0, 0, width, height);

  if (settingsEngine.getValue('panPreviewFill') as boolean) {
    const depthMode = settingsEngine.getValue('zoomPreviewDepthMode') as
      'exact' | 'limited' | 'unlimited';
    const maxOctaves = settingsEngine.getValue('zoomPreviewDepthOctaves') as number;
    const minCoverage = (settingsEngine.getValue('zoomPreviewMinCoverage') as number) / 100;
    const base = assembleBestCachedViewport(state.view, width, height, {
      depthMode,
      maxOctaves,
      minCoverage,
      excludeZoom: state.view.zoom,
    });
    if (base) {
      drawingContext.imageSmoothingEnabled = false;
      drawingContext.drawImage(base, 0, 0);
    }
  }

  const assembled = assembleFromCache(state.view, width, height, false);
  presentAssembly(assembled, state.view);

  if (!renderContext.panRenderScheduled) {
    renderContext.panRenderScheduled = true;
    requestRender();
  }
}

export function endPanPreview() {
  renderContext.panActive = false;
  renderContext.panRenderScheduled = false;
  requestRender();
}

export function requestRender(focalX?: number, focalY?: number) {
  state.activeRenderId += 1;
  markDebug('render:request', { nextRenderId: state.activeRenderId });
  renderFrame(state.activeRenderId, focalX, focalY);
}

// Draw the assembled canvas (cached tiles) onto the live canvas at the correct
// screen position for `view`. Drawn as a single image at an integer offset with
// smoothing off, so adjacent tiles never show sub-pixel seams during progress.
function presentAssembly(assembled: ReturnType<typeof assembleFromCache>, view: ViewState) {
  const sx0 =
    (assembled.assemblyCenterRe - view.centerRe) / assembled.scaleRe +
    (assembled.width - assembled.assemblyWidth) / 2;
  const sy0 =
    (assembled.assemblyCenterIm - view.centerIm) / assembled.scaleIm +
    (assembled.height - assembled.assemblyHeight) / 2;
  drawingContext.imageSmoothingEnabled = false;
  drawingContext.drawImage(assembled.assembly, Math.round(sx0), Math.round(sy0));
}

export function renderFrame(renderId: number, focalX?: number, focalY?: number) {
  // Clear cached tiles if a pixel-affecting setting changed since last render.
  ensureSignatureCurrent();

  const width = settingsEngine.getValue('width') as number;
  const height = settingsEngine.getValue('height') as number;
  const maxIterations = settingsEngine.getValue('maxIterations') as number;
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

  const signature = getRenderSignature();
  const renderView = { ...state.view };
  const focusX = focalX ?? width / 2;
  const focusY = focalY ?? height / 2;

  const start = performance.now();

  // Ensure the persistent pool is ready for this fractal and worker count. This
  // is the universal fallback: even if warmPool() was never called, the pool is
  // created (or reused, at ~zero cost) here before any tiles are dispatched.
  const workerCount = Math.max(1, Math.min(8, workerCountSetting));
  ensurePool(fractalType, workerCount);

  const assembled = assembleFromCache(renderView, width, height, true);
  const { assembly, assemblyCenterRe, assemblyCenterIm, assemblyWidth, assemblyHeight, tileW, tileH } = assembled;
  const aScaleRe = assembled.scaleRe;
  const aScaleIm = assembled.scaleIm;
  const range = assembled.range;

  // Screen offset of the assembly for the render-time view (used to place
  // the focal point in assembly-local coordinates for prioritization).
  const renderSx0 =
    (assemblyCenterRe - renderView.centerRe) / aScaleRe + (width - assemblyWidth) / 2;
  const renderSy0 =
    (assemblyCenterIm - renderView.centerIm) / aScaleIm + (height - assemblyHeight) / 2;
  const focalLocalX = focusX - renderSx0;
  const focalLocalY = focusY - renderSy0;

  // Prioritize tiles nearest the focal point (zoom/click center) so the
  // interesting region resolves first; dispatch is FCFS so ordering the
  // queue here is sufficient.
  const queue = assembled.misses.slice().sort((a, b) => {
    const da = (a.i * tileW + tileW / 2 - focalLocalX) ** 2 + (a.j * tileH + tileH / 2 - focalLocalY) ** 2;
    const db = (b.i * tileW + tileW / 2 - focalLocalX) ** 2 + (b.j * tileH + tileH / 2 - focalLocalY) ** 2;
    return da - db;
  });

  const hasWork = queue.length > 0;

  // No tiles to compute: present cached tiles immediately, no workers.
  if (!hasWork) {
    activeRender = null;
    if (!renderContext.panActive) {
      state.lastRenderMs = performance.now() - start;
      renderCallbacks.onRenderComplete(renderView, state.lastRenderMs, 0);
    } else {
      renderContext.panRenderScheduled = false;
    }
    presentAssembly(assembled, state.view);
    return;
  }

  // Do NOT clear the canvas: the existing content (a zoom preview, the prior
  // frame, or the pan composite) stays as the backdrop and is progressively
  // replaced by crisp tiles — this is the "low-res preview snaps to high-res"
  // effect. Cached tiles are painted immediately on top.
  presentAssembly(assembled, state.view);

  renderCallbacks.onRenderStart(renderId);

  const totalChunks = queue.length;
  let completedChunks = 0;
  let totalSteps = 0;
  let solidGuessedChunks = 0;
  let culledPixels = 0;
  let periodicityShortCircuits = 0;

  const actx = assembly.getContext('2d');
  if (actx) actx.imageSmoothingEnabled = false;

  const buildTask = (m: Miss): WorkerTask => ({
    renderId,
    width: assemblyWidth,
    height: assemblyHeight,
    maxIterations,
    centerRe: assemblyCenterRe,
    centerIm: assemblyCenterIm,
    zoom: renderView.zoom,
    rowStart: m.j * tileH,
    rowEnd: m.j * tileH + tileH,
    colStart: m.i * tileW,
    colEnd: m.i * tileW + tileW,
    scaleRe: aScaleRe,
    scaleIm: aScaleIm,
    solidGuessing,
    geometricCulling,
    periodicityChecking,
    interiorDetail: false,
    interiorNoiseMode: 'single',
    interiorNoiseStrength: 0,
    colorMode,
    palette,
    reverseColors,
    smoothColoring,
    colorCycles,
    autoAdjustColors,
    paletteMinIterations,
    paletteMaxIterations,
    hueShift,
    saturation,
    lightness,
    colorSpace,
    flipX,
    flipY,
  });

  const finalize = () => {
    if (renderId !== state.activeRenderId) {
      markDebug('render:finalize-stale', undefined, renderId);
      return;
    }
    // Draw the now-complete assembly as the final frame.
    presentAssembly(assembled, state.view);
    if (!renderContext.panActive) {
      state.lastRenderMs = performance.now() - start;
      state.lastSteps = totalSteps;
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
      // Re-open the scheduling gate so the next pan move can request a fill for
      // whatever new tiles it exposes.
      renderContext.panRenderScheduled = false;
    }
    if (activeRender && activeRender.renderId === renderId) activeRender = null;
  };

  const handleResult = (response: WorkerResponse) => {
    const i = Math.round(response.colStart / tileW);
    const j = Math.round(response.rowStart / tileH);
    const col = range.colStart + i;
    const row = range.rowStart + j;

    // Store the tile in the cache (world-keyed) for instant reuse on return,
    // and blit it into the assembly at its integer grid slot.
    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = tileW;
    tileCanvas.height = tileH;
    const tctx = tileCanvas.getContext('2d');
    if (tctx) {
      tctx.putImageData(new ImageData(new Uint8ClampedArray(response.data), tileW, tileH), 0, 0);
      putTile(keyFor(signature, renderView.zoom, col, row), tileCanvas);
      if (actx) actx.drawImage(tileCanvas, i * tileW, j * tileH);
    }

    // Repaint the whole assembly as a single image so adjacent tiles never
    // show sub-pixel seams while the frame is still filling in.
    presentAssembly(assembled, state.view);

    if (completedChunks === 0) {
      // Time from render start to the first resolved tile — the "delay before
      // anything appears" that a warm pool is meant to eliminate.
      markDebug('render:first-tile', { ms: Number((performance.now() - start).toFixed(2)) }, renderId);
    }

    totalSteps += response.steps;
    completedChunks += 1;
    if (response.solidGuessed) solidGuessedChunks += 1;
    culledPixels += response.culledPixels ?? 0;
    periodicityShortCircuits += response.periodicityShortCircuits ?? 0;
  };

  activeRender = { renderId, queue, outstanding: 0, buildTask, handleResult, finalize };
  pump();
}
