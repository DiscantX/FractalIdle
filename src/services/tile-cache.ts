import { ViewState } from '../types';
import { settingsEngine } from '../settings/instance';
import { markDebug } from '../utils/debug';

export type TileCanvas = HTMLCanvasElement;

// LRU cache. Map preserves insertion order; a hit re-inserts the entry at the
// tail (most-recent), and eviction drops from the head (oldest).
const cache = new Map<string, TileCanvas>();

// Index of how many cached tiles exist per zoom level (keyed by the zoomKey
// string). Maintained incrementally in putTile/eviction/clear so enumerating
// cached zoom levels is O(levels) instead of a full O(tiles) key scan — this is
// on the hot path of the zoom-out preview, which runs every wheel tick. The
// cache only ever holds tiles for a single signature at a time (it is cleared
// on any signature change), so no signature bookkeeping is needed here.
const zoomLevelCounts = new Map<string, number>();

// Extract the zoomKey substring from a cache key of the form
// `${signature}#${zoomKey}#${col}#${row}`. The signature never contains '#'
// (it joins with '|' and '='), so the first two '#' delimit the zoomKey.
function keyZoomKey(key: string): string | null {
  const first = key.indexOf('#');
  if (first < 0) return null;
  const second = key.indexOf('#', first + 1);
  if (second < 0) return null;
  return key.slice(first + 1, second);
}

function indexAdd(key: string): void {
  const zk = keyZoomKey(key);
  if (zk === null) return;
  zoomLevelCounts.set(zk, (zoomLevelCounts.get(zk) ?? 0) + 1);
}

function indexRemove(key: string): void {
  const zk = keyZoomKey(key);
  if (zk === null) return;
  const next = (zoomLevelCounts.get(zk) ?? 0) - 1;
  if (next <= 0) zoomLevelCounts.delete(zk);
  else zoomLevelCounts.set(zk, next);
}

// Signature of every setting that affects the rendered pixels OR the tile
// geometry. Changing any of these makes cached tiles invalid; we clear the
// whole map on change (and the signature is also part of each key).
const SIGNATURE_KEYS: string[] = [
  'fractalType',
  'maxIterations',
  'width',
  'height',
  'gridColumns',
  'gridRows',
  'solidGuessing',
  'geometricCulling',
  'periodicityChecking',
  'colorMode',
  'palette',
  'reverseColors',
  'smoothColoring',
  'colorCycles',
  'autoAdjustColors',
  'paletteMinIterations',
  'paletteMaxIterations',
  'hueShift',
  'saturation',
  'lightness',
  'colorSpace',
  'flipX',
  'flipY',
];

function computeSignature(): string {
  return SIGNATURE_KEYS.map((id) => `${id}=${settingsEngine.getValue(id)}`).join('|');
}

let lastSignature = '';

/** Clear the cache if a pixel-affecting setting changed since last render. */
export function ensureSignatureCurrent(): void {
  const sig = computeSignature();
  if (sig !== lastSignature) {
    if (cache.size > 0) {
      markDebug('tilecache:signature-change-clear', { size: cache.size });
    }
    cache.clear();
    zoomLevelCounts.clear();
    lastSignature = sig;
  }
}

/** Current render signature, clearing the cache first if it changed. */
export function getRenderSignature(): string {
  ensureSignatureCurrent();
  return computeSignature();
}

function zoomKey(zoom: number): string {
  // Round-trip through toPrecision so equal zooms — which panning preserves
  // exactly — produce identical keys even across separate renders.
  return zoom.toPrecision(12);
}

export function keyFor(signature: string, zoom: number, col: number, row: number): string {
  return `${signature}#${zoomKey(zoom)}#${col}#${row}`;
}

function cap(): number {
  const v = settingsEngine.getValue('tileCacheSize');
  return typeof v === 'number' ? v : 2000;
}

export function getTile(key: string): TileCanvas | undefined {
  const tile = cache.get(key);
  if (tile === undefined) return undefined;
  // LRU touch: move to the tail so recently-used tiles survive eviction.
  cache.delete(key);
  cache.set(key, tile);
  return tile;
}

export function putTile(key: string, tile: TileCanvas): void {
  const existed = cache.has(key);
  cache.delete(key);
  cache.set(key, tile);
  if (!existed) indexAdd(key);
  const limit = cap();
  let overshoot = cache.size - limit;
  if (overshoot > 0) {
    for (const oldKey of cache.keys()) {
      cache.delete(oldKey);
      indexRemove(oldKey);
      overshoot -= 1;
      if (overshoot <= 0) break;
    }
  }
}

export function clearCache(): void {
  cache.clear();
  zoomLevelCounts.clear();
}

export function cacheSize(): number {
  return cache.size;
}

function tilePixelSize(width: number, height: number): { tw: number; th: number } {
  const cols = Math.max(1, settingsEngine.getValue('gridColumns') as number);
  const rows = Math.max(1, settingsEngine.getValue('gridRows') as number);
  return {
    tw: Math.max(8, Math.floor(width / cols)),
    th: Math.max(8, Math.floor(height / rows)),
  };
}

export type TileRange = {
  colStart: number;
  colEnd: number;
  rowStart: number;
  rowEnd: number;
  numTilesX: number;
  numTilesY: number;
};

export type AssembledView = {
  assembly: HTMLCanvasElement;
  assemblyCenterRe: number;
  assemblyCenterIm: number;
  scaleRe: number;
  scaleIm: number;
  width: number;
  height: number;
  assemblyWidth: number;
  assemblyHeight: number;
  tileW: number;
  tileH: number;
  range: TileRange;
  misses: Array<{ col: number; row: number; i: number; j: number }>;
};

function scaleForView(view: ViewState, width: number, height: number) {
  const viewWidth = 4 / view.zoom;
  const viewHeight = viewWidth * (height / width);
  const scaleRe = viewWidth / width;
  const scaleIm = viewHeight / height;
  return { scaleRe, scaleIm };
}

export function visibleTileRange(
  view: ViewState,
  width: number,
  height: number,
  tw: number,
  th: number,
): TileRange {
  const { scaleRe, scaleIm } = scaleForView(view, width, height);
  const tileW = tw * scaleRe;
  const tileH = th * scaleIm;
  const worldLeft = view.centerRe - (width / 2) * scaleRe;
  const worldRight = view.centerRe + (width / 2) * scaleRe;
  const worldTop = view.centerIm - (height / 2) * scaleIm;
  const worldBottom = view.centerIm + (height / 2) * scaleIm;
  const colStart = Math.floor(worldLeft / tileW) - 1;
  const colEnd = Math.floor(worldRight / tileW) + 1;
  const rowStart = Math.floor(worldTop / tileH) - 1;
  const rowEnd = Math.floor(worldBottom / tileH) + 1;
  return {
    colStart,
    colEnd,
    rowStart,
    rowEnd,
    numTilesX: colEnd - colStart + 1,
    numTilesY: rowEnd - rowStart + 1,
  };
}

/**
 * Build an offscreen assembly canvas from cached tiles for `view`. The assembly
 * is a whole-world-tile-aligned grid (with a 1-tile margin) covering the
 * viewport; its pixel (0,0) sits exactly on a world-tile boundary, so assembly
 * tile (i,j) is world tile (range.colStart+i, range.rowStart+j). Tiles not in
 * the cache are reported as misses so the caller can dispatch workers for them.
 *
 * Screen position of the assembly's top-left under a live view is:
 *   (assemblyCenterRe - live.centerRe) / scaleRe + (width - assemblyWidth) / 2
 * (and the analogue for Y).
 */
export function assembleFromCache(
  view: ViewState,
  width: number,
  height: number,
  includeMisses: boolean,
): AssembledView {
  const { scaleRe, scaleIm } = scaleForView(view, width, height);
  const { tw, th } = tilePixelSize(width, height);
  const range = visibleTileRange(view, width, height, tw, th);
  const assemblyWidth = range.numTilesX * tw;
  const assemblyHeight = range.numTilesY * th;

  const assembly = document.createElement('canvas');
  assembly.width = assemblyWidth;
  assembly.height = assemblyHeight;
  const actx = assembly.getContext('2d');
  if (actx) actx.imageSmoothingEnabled = false;

  const signature = computeSignature();
  const zoom = view.zoom;

  const misses: AssembledView['misses'] = [];
  for (let j = 0; j < range.numTilesY; j += 1) {
    for (let i = 0; i < range.numTilesX; i += 1) {
      const col = range.colStart + i;
      const row = range.rowStart + j;
      const key = keyFor(signature, zoom, col, row);
      const tile = getTile(key);
      if (tile && actx) {
        actx.drawImage(tile, i * tw, j * th);
      } else if (includeMisses) {
        misses.push({ col, row, i, j });
      }
    }
  }

  const tileWorldW = tw * scaleRe;
  const tileWorldH = th * scaleIm;
  const assemblyCenterRe = ((range.colStart + range.numTilesX) * tileWorldW + range.colStart * tileWorldW) / 2;
  const assemblyCenterIm = ((range.rowStart + range.numTilesY) * tileWorldH + range.rowStart * tileWorldH) / 2;

  return {
    assembly,
    assemblyCenterRe,
    assemblyCenterIm,
    scaleRe,
    scaleIm,
    width,
    height,
    assemblyWidth,
    assemblyHeight,
    tileW: tw,
    tileH: th,
    range,
    misses,
  };
}

// Geometry + uncached-tile list for a view, WITHOUT allocating or blitting an
// assembly canvas. Used for look-ahead prerender layers, which only need to know
// which tiles to compute (they are cached via putTile, never painted), so the
// per-level canvas allocation that assembleFromCache does would be pure waste.
export type LayerMisses = {
  assemblyCenterRe: number;
  assemblyCenterIm: number;
  scaleRe: number;
  scaleIm: number;
  assemblyWidth: number;
  assemblyHeight: number;
  tileW: number;
  tileH: number;
  range: TileRange;
  misses: Array<{ col: number; row: number; i: number; j: number }>;
};

export function collectLayerMisses(view: ViewState, width: number, height: number): LayerMisses {
  const { scaleRe, scaleIm } = scaleForView(view, width, height);
  const { tw, th } = tilePixelSize(width, height);
  const range = visibleTileRange(view, width, height, tw, th);
  const assemblyWidth = range.numTilesX * tw;
  const assemblyHeight = range.numTilesY * th;

  const signature = computeSignature();
  const zoom = view.zoom;

  const misses: LayerMisses['misses'] = [];
  for (let j = 0; j < range.numTilesY; j += 1) {
    for (let i = 0; i < range.numTilesX; i += 1) {
      const col = range.colStart + i;
      const row = range.rowStart + j;
      // Peek only (no getTile) so this selection pass does not churn LRU order.
      if (!cache.has(keyFor(signature, zoom, col, row))) {
        misses.push({ col, row, i, j });
      }
    }
  }

  const tileWorldW = tw * scaleRe;
  const tileWorldH = th * scaleIm;
  const assemblyCenterRe = ((range.colStart + range.numTilesX) * tileWorldW + range.colStart * tileWorldW) / 2;
  const assemblyCenterIm = ((range.rowStart + range.numTilesY) * tileWorldH + range.rowStart * tileWorldH) / 2;

  return {
    assemblyCenterRe,
    assemblyCenterIm,
    scaleRe,
    scaleIm,
    assemblyWidth,
    assemblyHeight,
    tileW: tw,
    tileH: th,
    range,
    misses,
  };
}

export type ZoomPreviewDepthMode = 'exact' | 'limited' | 'unlimited';

export type ZoomPreviewOptions = {
  /** How far from the target zoom a reused level may be. */
  depthMode: ZoomPreviewDepthMode;
  /** Max |zoom octaves| when depthMode === 'limited' (1 octave = 2× zoom). */
  maxOctaves: number;
  /** Minimum fraction (0..1) of the viewport a candidate must cover. */
  minCoverage: number;
  /**
   * Zoom level to exclude from candidate selection. Used by the pan-fill
   * preview: the current exact zoom's crisp tiles are drawn on top separately,
   * so the scaled base layer must come from a *different* cached level to fill
   * the newly-exposed area rather than re-selecting the (gappy) current level.
   */
  excludeZoom?: number;
  /**
   * Only consider cached levels at or deeper than this zoom. Used by the
   * crisp-in-scroll overlay: a level deeper than the live view downscales into
   * place (crisp), while a shallower level would upscale (blocky) — so we forbid
   * the latter, which otherwise pops a pixelated image over the smooth preview.
   */
  minZoom?: number;
};

type CandidateTileRange = {
  colStart: number;
  colEnd: number;
  rowStart: number;
  rowEnd: number;
  numTilesX: number;
  numTilesY: number;
  tileWorldW: number;
  tileWorldH: number;
  tw: number;
  th: number;
};

// Tile grid (in `candidateZoom` tile coordinates) spanning the target viewport's
// world bounds. Used both to measure a candidate level's coverage and to draw it.
function candidateTileRange(
  view: ViewState,
  width: number,
  height: number,
  candidateZoom: number,
): CandidateTileRange {
  const { tw, th } = tilePixelSize(width, height);
  const targetScale = scaleForView(view, width, height);
  const candidateScale = scaleForView({ centerRe: 0, centerIm: 0, zoom: candidateZoom }, width, height);
  const tileWorldW = tw * candidateScale.scaleRe;
  const tileWorldH = th * candidateScale.scaleIm;

  const worldLeft = view.centerRe - (width / 2) * targetScale.scaleRe;
  const worldRight = view.centerRe + (width / 2) * targetScale.scaleRe;
  const worldTop = view.centerIm - (height / 2) * targetScale.scaleIm;
  const worldBottom = view.centerIm + (height / 2) * targetScale.scaleIm;

  const colStart = Math.floor(worldLeft / tileWorldW);
  const colEnd = Math.floor(worldRight / tileWorldW);
  const rowStart = Math.floor(worldTop / tileWorldH);
  const rowEnd = Math.floor(worldBottom / tileWorldH);

  return {
    colStart,
    colEnd,
    rowStart,
    rowEnd,
    numTilesX: colEnd - colStart + 1,
    numTilesY: rowEnd - rowStart + 1,
    tileWorldW,
    tileWorldH,
    tw,
    th,
  };
}

// Distinct cached zoom levels. Reads the maintained zoom-level index (O(levels))
// rather than scanning the whole cache. The cache holds a single signature at a
// time, so every indexed level belongs to the current signature.
function listCachedZoomLevels(): number[] {
  const levels: number[] = [];
  for (const zk of zoomLevelCounts.keys()) {
    const z = Number(zk);
    if (Number.isFinite(z)) levels.push(z);
  }
  return levels;
}

// Fraction of the target viewport covered by cached tiles at `candidateZoom`.
// Peek-only (no draw, no LRU churn) so the selection pass stays cheap.
function candidateCoverage(
  view: ViewState,
  width: number,
  height: number,
  candidateZoom: number,
  signature: string,
): { covered: number; total: number } {
  const r = candidateTileRange(view, width, height, candidateZoom);
  let covered = 0;
  let total = 0;
  for (let j = 0; j < r.numTilesY; j += 1) {
    for (let i = 0; i < r.numTilesX; i += 1) {
      total += 1;
      if (cache.has(keyFor(signature, candidateZoom, r.colStart + i, r.rowStart + j))) {
        covered += 1;
      }
    }
  }
  return { covered, total };
}

// Nearest cached zoom level (by octave distance) that covers at least the
// configured fraction of the viewport. null when nothing qualifies.
function pickBestCachedZoom(
  view: ViewState,
  width: number,
  height: number,
  opts: ZoomPreviewOptions,
): number | null {
  const signature = computeSignature();
  const targetZoom = view.zoom;
  const excludeKey = opts.excludeZoom !== undefined ? zoomKey(opts.excludeZoom) : null;
  const notExcluded = (z: number) => excludeKey === null || zoomKey(z) !== excludeKey;
  // Small tolerance so a level at (approximately) the current zoom still counts
  // as "deep enough" — floating-point interpolation never lands exactly on it.
  const deepEnough = (z: number) => opts.minZoom === undefined || z >= opts.minZoom * 0.999;
  const candidates = (opts.depthMode === 'exact'
    ? [targetZoom]
    : listCachedZoomLevels().filter((z) => {
        if (opts.depthMode === 'unlimited') return true;
        return Math.abs(Math.log2(z / targetZoom)) <= opts.maxOctaves;
      })
  ).filter((z) => notExcluded(z) && deepEnough(z));

  // Check candidates nearest-first (by octave distance) and return the first one
  // that meets the coverage threshold. The nearest qualifying level is always
  // the best, so there is no need to measure coverage for farther levels — this
  // avoids an O(levels × tiles) scan on every zoom-out wheel tick.
  candidates.sort(
    (a, b) => Math.abs(Math.log2(a / targetZoom)) - Math.abs(Math.log2(b / targetZoom)),
  );
  for (const z of candidates) {
    const { covered, total } = candidateCoverage(view, width, height, z, signature);
    if (total === 0 || covered / total < opts.minCoverage) continue;
    return z;
  }
  return null;
}

// Assemble a `width×height` canvas depicting `view` from cached tiles at
// `candidateZoom`, scaled to the target view. Returns null if no cached tiles
// from that level cover the viewport. Native-resolution assembly then a single
// scale avoids per-tile sub-pixel seams.
function assembleScaledViewport(
  view: ViewState,
  width: number,
  height: number,
  candidateZoom: number,
): HTMLCanvasElement | null {
  const signature = computeSignature();
  const { scaleRe, scaleIm } = scaleForView(view, width, height);
  const r = candidateTileRange(view, width, height, candidateZoom);

  const assembly = document.createElement('canvas');
  assembly.width = r.numTilesX * r.tw;
  assembly.height = r.numTilesY * r.th;
  const actx = assembly.getContext('2d');
  if (!actx) return null;
  actx.imageSmoothingEnabled = false;

  let covered = 0;
  for (let j = 0; j < r.numTilesY; j += 1) {
    for (let i = 0; i < r.numTilesX; i += 1) {
      const tile = getTile(keyFor(signature, candidateZoom, r.colStart + i, r.rowStart + j));
      if (tile) {
        actx.drawImage(tile, i * r.tw, j * r.th);
        covered += 1;
      }
    }
  }
  if (covered === 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;

  // Range top-left in world coords -> target-view screen coords, then draw the
  // whole assembly scaled to the target.
  const screenX = (r.colStart * r.tileWorldW - (view.centerRe - (width / 2) * scaleRe)) / scaleRe;
  const screenY = (r.rowStart * r.tileWorldH - (view.centerIm - (height / 2) * scaleIm)) / scaleIm;
  const drawW = (r.numTilesX * r.tileWorldW) / scaleRe;
  const drawH = (r.numTilesY * r.tileWorldH) / scaleIm;
  ctx.drawImage(assembly, Math.round(screenX), Math.round(screenY), Math.round(drawW), Math.round(drawH));
  return canvas;
}

/**
 * Return a `width×height` canvas depicting `view` assembled from the nearest
 * cached zoom level that covers the viewport (used as a smooth zoom-out preview
 * so previously-visited levels — or the nearest neighbor — appear instantly with
 * no pop, while the real render lands). Falls back to null when no cached level
 * meets the depth/coverage constraints, so callers can use the prior behavior.
 */
export function assembleBestCachedViewport(
  view: ViewState,
  width: number,
  height: number,
  opts: ZoomPreviewOptions,
): HTMLCanvasElement | null {
  const bestZoom = pickBestCachedZoom(view, width, height, opts);
  if (bestZoom === null) return null;
  return assembleScaledViewport(view, width, height, bestZoom);
}
