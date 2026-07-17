import { ColorMode, ViewState, FractalType, WorkerTask, WorkerResponse } from '../types';
import { settingsEngine } from '../settings/instance';
import { state, renderContext, PREVIEW_PLACEHOLDER_COLOR } from '../state';
import { drawingContext } from '../ui/dom';
import { markDebug } from '../utils/debug';
import { colorizeScalarFieldInto } from '../utils/color';
import {
  assembleFromCache,
  assembleBestCachedViewport,
  collectLayerMisses,
  ensureSignatureCurrent,
  putScalarTile,
  getTile,
  assembleScalarField,
  assembleUniformColorViewport,
  getCurrentColorSignature,
  getCurrentColorParams,
  keyFor,
  getRenderSignature,
} from './tile-cache';
import { isAnimationPlaying } from './color-animation';
import { computeTargetView } from './zoom-manager';

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

// A tile to compute, tagged with the render layer it belongs to. A single render
// spans one primary layer (the destination view, which paints) plus zero or more
// look-ahead / look-behind layers (anticipated zoom levels, which only populate
// the cache). Every queued tile carries its layer so a worker reply can be routed
// back to the right geometry — see the worker→task map below.
type QueuedTile = { layer: RenderLayer; col: number; row: number; i: number; j: number };

// Per-layer geometry. `primary` layers own an assembly canvas and paint to screen;
// look-ahead layers have no assembly and only putTile into the cache.
type RenderLayer = {
  primary: boolean;
  zoom: number;
  assemblyCenterRe: number;
  assemblyCenterIm: number;
  assemblyWidth: number;
  assemblyHeight: number;
  scaleRe: number;
  scaleIm: number;
  tileW: number;
  tileH: number;
  range: { colStart: number; rowStart: number };
  assembly?: HTMLCanvasElement;
  actx?: CanvasRenderingContext2D | null;
};

// The render currently accepting tile results. Each render installs a fresh job
// here; the pool's persistent message handlers route completed tiles to it.
type ActiveRender = {
  renderId: number;
  queue: QueuedTile[];
  outstanding: number;
  buildTask: (q: QueuedTile) => WorkerTask;
  handleResult: (q: QueuedTile, resp: WorkerResponse) => void;
  handleDropped: (q: QueuedTile) => void;
  finalize: () => void;
  // When false the render still computes + caches tiles (so the zoom animation
  // can own the screen) but does not paint the assembly to the canvas. Flipped
  // to true on zoom-animation completion to adopt the in-flight destination
  // render (see promoteActiveRenderToPresent) instead of restarting it.
  present: boolean;
  presentNow: () => void;
};

let activeRender: ActiveRender | null = null;

// Which tile each worker is currently computing. Set on dispatch in pump(), read
// on reply — this routes a WorkerResponse back to its layer without adding a layer
// id to the worker protocol (a worker holds exactly one task at a time, and is
// only re-dispatched after it replies, so this mapping is always 1:1 and current).
const workerTask = new Map<Worker, QueuedTile>();

function handleWorkerMessage(worker: Worker, event: MessageEvent<WorkerResponse>) {
  idleWorkers.add(worker);
  const ar = activeRender;
  const resp = event.data;
  const q = workerTask.get(worker);
  workerTask.delete(worker);
  // Accept a tile only if it belongs to the current, still-active render. A
  // pooled worker may deliver a tile from a cancelled or superseded render (it
  // was still computing when we moved on); those results are dropped here.
  if (ar && q && resp.renderId === ar.renderId && ar.renderId === state.activeRenderId) {
    ar.outstanding -= 1;
    ar.handleResult(q, resp);
  } else {
    markDebug('render:tile-stale', { responseRenderId: resp.renderId });
  }
  pump();
}

function handleWorkerError(worker: Worker) {
  idleWorkers.add(worker);
  const ar = activeRender;
  const q = workerTask.get(worker);
  workerTask.delete(worker);
  // The task failed; skip its tile but still account for it so the render can
  // reach completion (matches the prior behavior of not re-queuing failed tiles).
  if (ar && q && ar.renderId === state.activeRenderId && ar.outstanding > 0) {
    ar.outstanding -= 1;
    ar.handleDropped(q);
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
    const q = ar.queue.shift() as QueuedTile;
    ar.outstanding += 1;
    workerTask.set(worker, q);
    worker.postMessage(ar.buildTask(q));
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

// True while a render is dispatched and still resolving tiles. The deep-dive
// driver uses this to pace its prefetch: it must NOT fire a new render every
// frame (each requestRender bumps activeRenderId, which drops the previous
// render's in-flight tiles as stale — so at 60fps nothing would ever finish
// computing). Instead it waits for the current render to drain before aiming the
// next one at the now-deeper view.
export function isRenderActive(): boolean {
  return activeRender !== null;
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

  // While the color animation is playing, render the whole frame from the scalar
  // tiles in ONE hue pass instead of compositing cached color tiles — this keeps
  // the frame uniformly colored as it pans (rather than showing per-tile hues
  // frozen at their last colorize). Falls back to the normal path if nothing is
  // cached yet for this view.
  if (isAnimationPlaying() && paintUniformColorFrame(state.view)) {
    if (!renderContext.panRenderScheduled) {
      renderContext.panRenderScheduled = true;
      requestRender();
    }
    return;
  }

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

export function requestRender(
  focalX?: number,
  focalY?: number,
  opts?: { view?: ViewState; present?: boolean; stepFactor?: number },
) {
  state.activeRenderId += 1;
  markDebug('render:request', { nextRenderId: state.activeRenderId });
  renderFrame(state.activeRenderId, focalX, focalY, opts);
}

/**
 * Repaint the current frame with new color/adjustment settings WITHOUT
 * re-running escape-time. Coalesced onto a single requestAnimationFrame so a
 * rapid slider drag never blocks: each onChange just marks the frame dirty and
 * returns immediately (the slider stays responsive), and at most one repaint
 * runs per animation frame using the latest settings. The actual work happens in
 * performRecolor below.
 */
let recolorScheduled = false;

export function cheapRecolorRepaint(): void {
  if (recolorScheduled) return;
  recolorScheduled = true;
  requestAnimationFrame(() => {
    recolorScheduled = false;
    performRecolor();
  });
}

// A scratch ImageData reused across repaints so a color-slider drag or animation
// doesn't allocate a multi-MB buffer every frame. Rebuilt only when the assembly
// dimensions change.
let recolorScratch: ImageData | null = null;

/**
 * Colorize the captured base scalar frame with the CURRENT color params and blit
 * it straight to the canvas — no cache interaction, no worker dispatch. This is
 * the hot path shared by the cheap recolor and the color-animation loop: it
 * deliberately does NOT touch the tile cache, so an animation changing the hue
 * every frame doesn't thrash the Tier-2 color cache (see the animation note in
 * color-stage-split-handoff.md).
 *
 * Returns false (painting nothing) when the base frame is missing or no longer
 * valid for the live view — the caller decides whether to fall back to a render.
 */
export function paintBaseScalarFrame(): boolean {
  const base = renderContext.baseScalarField;
  const width = settingsEngine.getValue('width') as number;
  const height = settingsEngine.getValue('height') as number;
  const viewMatches =
    base !== null &&
    base.view.centerRe === state.view.centerRe &&
    base.view.centerIm === state.view.centerIm &&
    base.view.zoom === state.view.zoom &&
    base.canvasWidth === width &&
    base.canvasHeight === height;
  if (!viewMatches || !base) return false;

  const params = getCurrentColorParams();
  if (
    !recolorScratch ||
    recolorScratch.width !== base.width ||
    recolorScratch.height !== base.height
  ) {
    recolorScratch = new ImageData(base.width, base.height);
  }
  colorizeScalarFieldInto(base.data, base.width, base.height, base.maxIterations, params, recolorScratch);
  drawingContext.putImageData(recolorScratch, Math.round(base.sx0), Math.round(base.sy0));
  return true;
}

/**
 * Colorize the WHOLE visible frame at the current view and hue in a single pass,
 * assembling the nearest cached scalar level and coloring it uniformly. This is
 * the general present path used during color animation / deep-dive where the
 * view may be mid-zoom (not aligned to a cached level), so it scales the nearest
 * cached tier-1 scalar tiles rather than relying on the exact-view base frame.
 * Returns false when nothing is cached yet, so the caller can fall back to its
 * normal (Tier-2) path for that frame.
 */
export function paintUniformColorFrame(view: ViewState = state.view): boolean {
  const width = settingsEngine.getValue('width') as number;
  const height = settingsEngine.getValue('height') as number;
  const params = getCurrentColorParams();
  const canvas = assembleUniformColorViewport(view, width, height, params);
  if (!canvas) return false;
  drawingContext.imageSmoothingEnabled = true;
  drawingContext.drawImage(canvas, 0, 0);
  return true;
}

/**
 * The actual recolor. If the captured base scalar frame is still valid for the
 * current view, run Stage 2 over it directly — no workers, no cache wipe. Falls
 * back to a full render when the view has changed since the base frame was
 * captured (e.g. a mid/post-pan slider change).
 */
function performRecolor(): void {
  // Keep the derived Tier-2 color cache from holding stale, now-unkeyed canvases.
  ensureSignatureCurrent();
  if (paintBaseScalarFrame()) {
    markDebug('render:cheap-recolor', {});
  } else {
    requestRender();
  }
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

// True when `b` differs from `a` enough to warrant a fresh render — more than a
// pixel of pan in either axis, or a >2% zoom change. Used to decide whether a
// finished pan render is already stale (the user kept moving) and should be
// re-aimed at the current view.
function viewDrifted(a: ViewState, b: ViewState): boolean {
  const width = settingsEngine.getValue('width') as number;
  const height = settingsEngine.getValue('height') as number;
  const scaleRe = (4 / b.zoom) / width;
  const scaleIm = ((4 / b.zoom) * (height / width)) / height;
  const px = Math.abs(a.centerRe - b.centerRe) / scaleRe;
  const py = Math.abs(a.centerIm - b.centerIm) / scaleIm;
  const zoomRatio = Math.max(a.zoom, b.zoom) / Math.min(a.zoom, b.zoom);
  return px > 1 || py > 1 || zoomRatio > 1.02;
}

// Merge look-ahead (deeper) and look-behind (shallower) view lists into the
// speculative render order, per `policy`:
//   'direction' (default): boost the nearest level in the current travel direction
//     (zoom-in → nearest ahead; zoom-out → nearest behind), then interleave the
//     rest by increasing distance, travel-first at each distance.
//   'ahead' / 'behind': all of one side, then all of the other.
//   'distance': pure distance interleave (ahead-first tie-break), ignoring travel
//     direction — symmetric, for jumps where neither side is privileged.
// FCFS dispatch below keeps these on spare worker capacity only — the primary
// screen layer always comes first and consumes every worker before any of these.
type SpeculativePolicy = 'direction' | 'ahead' | 'behind' | 'distance';

function orderSpeculative(
  ahead: ViewState[],
  behind: ViewState[],
  dir: 'in' | 'out' | 'none',
  policy: SpeculativePolicy,
): ViewState[] {
  const ordered: ViewState[] = [];
  const aN = ahead.length;
  const bN = behind.length;

  if (policy === 'ahead') {
    for (const v of ahead) ordered.push(v);
    for (const v of behind) ordered.push(v);
    return ordered;
  }
  if (policy === 'behind') {
    for (const v of behind) ordered.push(v);
    for (const v of ahead) ordered.push(v);
    return ordered;
  }
  if (policy === 'distance') {
    // Symmetric interleave by distance, ahead-first tie-break, no boost.
    const maxDist = Math.max(aN, bN);
    let ai = 0;
    let bi = 0;
    for (let d = 1; d <= maxDist; d += 1) {
      const aHere = ai === d - 1 && ai < aN;
      const bHere = bi === d - 1 && bi < bN;
      if (aHere) ordered.push(ahead[ai++]);
      if (bHere) ordered.push(behind[bi++]);
    }
    return ordered;
  }

  // 'direction' (default): boost nearest travel-side level, then interleave.
  let ai = 0;
  let bi = 0;
  if (dir === 'in' && aN > 0) {
    ordered.push(ahead[0]);
    ai = 1;
  } else if (dir === 'out' && bN > 0) {
    ordered.push(behind[0]);
    bi = 1;
  }
  const maxDist = Math.max(aN, bN);
  for (let d = 1; d <= maxDist; d += 1) {
    const aHere = ai === d - 1 && ai < aN;
    const bHere = bi === d - 1 && bi < bN;
    if (aHere && bHere) {
      if (dir === 'out') {
        ordered.push(behind[bi++]);
        ordered.push(ahead[ai++]);
      } else {
        ordered.push(ahead[ai++]);
        ordered.push(behind[bi++]);
      }
    } else if (aHere) {
      ordered.push(ahead[ai++]);
    } else if (bHere) {
      ordered.push(behind[bi++]);
    }
  }
  return ordered;
}

export function renderFrame(
  renderId: number,
  focalX?: number,
  focalY?: number,
  opts?: { view?: ViewState; present?: boolean; stepFactor?: number },
) {
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
  const smoothColoring = settingsEngine.getValue('smoothColoring') as boolean;
  const flipX = settingsEngine.getValue('flipX') as boolean;
  const flipY = settingsEngine.getValue('flipY') as boolean;
  // Color state is no longer part of the worker task — it's Stage 2 (main
  // thread). Capture it once for the whole render so tile results can be
  // colorized consistently.
  const colorSig = getCurrentColorSignature();
  const colorParams = getCurrentColorParams();

  const signature = getRenderSignature();
  // A render may target an explicit view (the zoom animation's destination) that
  // differs from the live `state.view`, or run without painting to the canvas so
  // the zoom animation keeps screen ownership while tiles compute + cache.
  const renderView = opts?.view ? { ...opts.view } : { ...state.view };
  const present = opts?.present ?? true;
  const stepFactor = opts?.stepFactor;
  const focusX = focalX ?? width / 2;
  const focusY = focalY ?? height / 2;

  const start = performance.now();

  // Ensure the persistent pool is ready for this fractal and worker count. This
  // is the universal fallback: even if warmPool() was never called, the pool is
  // created (or reused, at ~zero cost) here before any tiles are dispatched.
  const workerCount = Math.max(1, Math.min(8, workerCountSetting));
  ensurePool(fractalType, workerCount);

  // Layer 0 is the primary (destination) view: it owns the assembly canvas and
  // paints to screen. Subsequent layers are look-ahead / look-behind prerender
  // targets — they only populate the cache (no assembly, no paint), using spare
  // worker capacity.
  const assembled = assembleFromCache(renderView, width, height, true);
  const primaryLayer: RenderLayer = {
    primary: true,
    zoom: renderView.zoom,
    assemblyCenterRe: assembled.assemblyCenterRe,
    assemblyCenterIm: assembled.assemblyCenterIm,
    assemblyWidth: assembled.assemblyWidth,
    assemblyHeight: assembled.assemblyHeight,
    scaleRe: assembled.scaleRe,
    scaleIm: assembled.scaleIm,
    tileW: assembled.tileW,
    tileH: assembled.tileH,
    range: { colStart: assembled.range.colStart, rowStart: assembled.range.rowStart },
    assembly: assembled.assembly,
    actx: assembled.assembly.getContext('2d'),
  };
  if (primaryLayer.actx) primaryLayer.actx.imageSmoothingEnabled = false;

  // Combined queue: primary tiles first (focal-sorted so the interesting region
  // resolves first and the screen view appears ASAP), then each look-ahead layer
  // in order. FCFS dispatch means the primary always consumes workers before any
  // look-ahead tile — look-ahead only runs on spare capacity. Declared up front
  // because the look-ahead layers built below push their misses into it as they
  // go, keeping the primary first.
  const queue: QueuedTile[] = [];

  // Screen offset of the primary assembly (used to place the focal point in
  // assembly-local coordinates for prioritization).
  const renderSx0 =
    (primaryLayer.assemblyCenterRe - renderView.centerRe) / primaryLayer.scaleRe +
    (width - primaryLayer.assemblyWidth) / 2;
  const renderSy0 =
    (primaryLayer.assemblyCenterIm - renderView.centerIm) / primaryLayer.scaleIm +
    (height - primaryLayer.assemblyHeight) / 2;
  const focalLocalX = focusX - renderSx0;
  const focalLocalY = focusY - renderSy0;

  // Paint the assembled (cached + resolved) tiles to the live canvas. `presentNow`
  // is invoked directly when a background zoom render is promoted to presenting at
  // animation completion. `paintLive` is used by handleResult/finalize (which run
  // after `activeRender` is assigned) and honors the live flag so a background
  // render (present=false) never paints — keeping the zoom animation on screen.
  const presentNow = () => {
    if (present) presentAssembly(assembled, state.view);
  };
  const paintLive = () => {
    if (activeRender?.present) presentAssembly(assembled, state.view);
  };

  // Primary (screen) layer goes FIRST in the queue, focal-sorted so the
  // interesting region resolves first. FCFS dispatch then gives the primary
  // every worker before any look-ahead tile — look-ahead only runs on spare
  // capacity. (Look-ahead is appended below, AFTER the primary, so it can never
  // starve the screen view.)
  const primaryMisses = assembled.misses.slice().sort((a, b) => {
    const da = (a.i * primaryLayer.tileW + primaryLayer.tileW / 2 - focalLocalX) ** 2 +
      (a.j * primaryLayer.tileH + primaryLayer.tileH / 2 - focalLocalY) ** 2;
    const db = (b.i * primaryLayer.tileW + primaryLayer.tileW / 2 - focalLocalX) ** 2 +
      (b.j * primaryLayer.tileH + primaryLayer.tileH / 2 - focalLocalY) ** 2;
    return da - db;
  });
  for (const m of primaryMisses) queue.push({ layer: primaryLayer, ...m });

  // Speculative prerender layers (look-ahead = deeper, look-behind = shallower)
  // appended AFTER the primary and consuming only spare worker capacity. Driven
  // here (not only during a zoom gesture) so plain renders — a jump to a fresh
  // location, a cache-clear, the initial load — also warm the surrounding levels,
  // which the zoom-out preview and pan-fill fall back on. Skipped while an
  // interactive pan is active (every drag frame is a plain render) to avoid churn.
  if (!renderContext.panActive) {
    const spacing = settingsEngine.getValue('zoomLookAheadSpacing') as 'step' | 'octave';
    const wantAhead = settingsEngine.getValue('zoomLookAhead') as boolean;
    const wantBehind = settingsEngine.getValue('zoomLookBehind') as boolean;
    const aheadLevels = wantAhead ? Math.max(0, settingsEngine.getValue('zoomLookAheadLevels') as number) : 0;
    const behindLevels = wantBehind ? Math.max(0, settingsEngine.getValue('zoomLookBehindLevels') as number) : 0;
    // Per-scroll-step spacing during a gesture; octave (×2) on plain renders
    // where no gesture factor is available.
    const factorStep = spacing === 'octave' ? 2 : (stepFactor ?? 2);
    const ahead: ViewState[] = [];
    const behind: ViewState[] = [];
    for (let n = 0; n < Math.max(aheadLevels, behindLevels); n += 1) {
      if (n < aheadLevels) {
        ahead.push(computeTargetView(factorStep, focusX, focusY, n === 0 ? renderView : ahead[n - 1]));
      }
      if (n < behindLevels) {
        behind.push(computeTargetView(1 / factorStep, focusX, focusY, n === 0 ? renderView : behind[n - 1]));
      }
    }
    // Order per the chosen policy — see orderSpeculative.
    const policy = settingsEngine.getValue('zoomLookPriority') as SpeculativePolicy;
    const ordered = orderSpeculative(ahead, behind, renderContext.lastZoomDir, policy);
    for (const v of ordered) {
      const lm = collectLayerMisses(v, width, height);
      const layer: RenderLayer = {
        primary: false,
        zoom: v.zoom,
        assemblyCenterRe: lm.assemblyCenterRe,
        assemblyCenterIm: lm.assemblyCenterIm,
        assemblyWidth: lm.assemblyWidth,
        assemblyHeight: lm.assemblyHeight,
        scaleRe: lm.scaleRe,
        scaleIm: lm.scaleIm,
        tileW: lm.tileW,
        tileH: lm.tileH,
        range: { colStart: lm.range.colStart, rowStart: lm.range.rowStart },
      };
      for (const m of lm.misses) queue.push({ layer, ...m });
    }
  }

  const primaryTotal = primaryMisses.length;
  const hasWork = queue.length > 0;

  // Build + paint the primary assembly up front (cached tiles show immediately;
  // the rest fill in progressively). Skipped for a background zoom render.
  if (present) presentAssembly(assembled, state.view);

  renderCallbacks.onRenderStart(renderId);

  let primaryDone = 0;
  let primaryComplete = false;
  let totalSteps = 0;
  let solidGuessedChunks = 0;
  let culledPixels = 0;
  let periodicityShortCircuits = 0;

  // Fire once when the primary (screen) layer is fully resolved: present it and
  // record timing. The render stays alive through any remaining look-ahead tiles
  // so they still land in the cache (and aren't dropped as stale).
  const firePrimaryComplete = () => {
    if (primaryComplete || renderId !== state.activeRenderId) return;
    primaryComplete = true;
    // Capture the resolved scalar frame so a later color/adjustment change can be
    // repainted (or animated) without re-iterating. Skip while a pan is still
    // drifting (view about to move) or during a smooth zoom (the background render
    // targets a different view than the live, interpolated one, so its frame is
    // partial/transient).
    if (!state.zoomAnimation && !(renderContext.panActive && viewDrifted(renderView, state.view))) {
      renderContext.baseScalarField = assembleScalarField(state.view, width, height);
    }
    if (!renderContext.panActive) {
      state.lastRenderMs = performance.now() - start;
      state.lastSteps = totalSteps;
      markDebug('render:finish', {
        primaryTotal,
        solidGuessedChunks,
        culledPixels,
        periodicityShortCircuits,
        ms: Number(state.lastRenderMs.toFixed(2)),
      }, renderId);
      renderCallbacks.onRenderComplete(renderView, state.lastRenderMs, totalSteps);
    } else if (renderContext.panActive && viewDrifted(renderView, state.view)) {
      // The user kept panning (or paused mid-drag) while this render was in
      // flight, so the live view has moved past what we just computed. Keep the
      // gate closed and immediately re-aim at the current view — a self-throttled
      // chase loop (one render at a time) that keeps leading-edge tiles resolving
      // during the drag instead of waiting for the button release. It terminates
      // on its own once the view stops drifting (the next finalize sees no drift).
      requestRender();
    } else {
      // Re-open the scheduling gate so the next pan move can request a fill for
      // whatever new tiles it exposes.
      renderContext.panRenderScheduled = false;
    }
  };

  const buildTask = (q: QueuedTile): WorkerTask => ({
    renderId,
    width: q.layer.assemblyWidth,
    height: q.layer.assemblyHeight,
    maxIterations,
    centerRe: q.layer.assemblyCenterRe,
    centerIm: q.layer.assemblyCenterIm,
    zoom: q.layer.zoom,
    rowStart: q.j * q.layer.tileH,
    rowEnd: q.j * q.layer.tileH + q.layer.tileH,
    colStart: q.i * q.layer.tileW,
    colEnd: q.i * q.layer.tileW + q.layer.tileW,
    scaleRe: q.layer.scaleRe,
    scaleIm: q.layer.scaleIm,
    solidGuessing,
    geometricCulling,
    periodicityChecking,
    interiorDetail: false,
    interiorNoiseMode: 'single',
    interiorNoiseStrength: 0,
    colorMode,
    smoothColoring,
    flipX,
    flipY,
  });

  const finalize = () => {
    if (renderId !== state.activeRenderId) {
      markDebug('render:finalize-stale', undefined, renderId);
      return;
    }
    // Last paint of the finished primary frame (a background zoom render skips it
    // until promoted). Look-ahead tiles were cache-only and need no paint.
    paintLive();
    if (activeRender && activeRender.renderId === renderId) activeRender = null;
  };

  const handleResult = (q: QueuedTile, response: WorkerResponse) => {
    const layer = q.layer;
    const col = layer.range.colStart + q.i;
    const row = layer.range.rowStart + q.j;

    // Store the scalar field in Tier 1 (world-keyed by its own zoom) for instant
    // reuse when the live zoom reaches this level. Then colorize it (Stage 2) into
    // a canvas for the assembly blit; the colored canvas is also cached in Tier 2.
    // Primary tiles also blit into the assembly and repaint; look-ahead tiles are
    // cache-only.
    const computeKey = keyFor(signature, layer.zoom, col, row);
    putScalarTile(computeKey, {
      data: response.data,
      w: layer.tileW,
      h: layer.tileH,
      maxIterations,
    });
    const tileCanvas = getTile(computeKey, colorSig, colorParams);
    if (tileCanvas && layer.primary && layer.actx) {
      layer.actx.drawImage(tileCanvas, q.i * layer.tileW, q.j * layer.tileH);
    }

    if (layer.primary) {
      paintLive();
      if (primaryDone === 0) {
        markDebug('render:first-tile', { ms: Number((performance.now() - start).toFixed(2)) }, renderId);
      }
      totalSteps += response.steps;
      solidGuessedChunks += response.solidGuessed ? 1 : 0;
      culledPixels += response.culledPixels ?? 0;
      periodicityShortCircuits += response.periodicityShortCircuits ?? 0;
      primaryDone += 1;
      if (primaryDone >= primaryTotal) firePrimaryComplete();
    }
  };

  const handleDropped = (q: QueuedTile) => {
    if (q.layer.primary) {
      primaryDone += 1;
      if (primaryDone >= primaryTotal) firePrimaryComplete();
    }
  };

  // No work at all (fully cached, no look-ahead): present + complete immediately.
  if (!hasWork) {
    paintLive();
    firePrimaryComplete();
    if (activeRender && activeRender.renderId === renderId) activeRender = null;
    return;
  }

  activeRender = { renderId, queue, outstanding: 0, buildTask, handleResult, handleDropped, finalize, present, presentNow };
  pump();
}

// Flip the in-flight render to presenting and paint its current assembly, so a
// zoom animation can adopt the destination render it started instead of
// discarding it and starting a fresh one. Returns false (and leaves the canvas
// untouched) when no render is in flight, so callers can fall back to a normal
// requestRender — which will find the just-computed tiles already cached.
export function promoteActiveRenderToPresent(): boolean {
  if (activeRender) {
    activeRender.present = true;
    activeRender.presentNow();
    return true;
  }
  return false;
}
