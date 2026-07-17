import { ViewState, ColorParams } from '../types';
import { settingsEngine } from '../settings/instance';
import { markDebug } from '../utils/debug';
import { renderScalarTileToCanvas, colorizeScalarField } from '../utils/color';

export type TileCanvas = HTMLCanvasElement;

// A single cached tile at Stage 1: the raw per-pixel scalar field (valueForPalette)
// the workers emit. Independent of palette/adjustments — those are Stage 2.
export type ScalarTile = { data: Float32Array; w: number; h: number; maxIterations: number };

// Tier 1 — precious scalar-field cache (compute-signature keyed). Holds the raw
// per-pixel `valueForPalette` from the workers; never invalidated by a palette or
// adjustment change.
const scalarCache = new Map<string, ScalarTile>();
// Tier 2 — cheap derived color cache (compute-signature + color-signature keyed).
// The colorized canvas for a given color state; rebuilt on demand from Tier 1
// whenever the color signature changes. See color-stage-split-handoff.md.
const colorCache = new Map<string, TileCanvas>();
// computeKey -> set of colorSig values present in colorCache, for cascade eviction.
const colorChildren = new Map<string, Set<string>>();

// Coverage index: how many Tier-1 tiles exist per zoom level (keyed by zoomKey
// string). Maintained incrementally in putScalarTile/eviction/clear so the
// zoom-out preview can enumerate cached levels in O(levels). The cache only holds
// tiles for a single compute signature at a time (cleared on any compute change),
// so no signature bookkeeping is needed here.
const zoomLevelCounts = new Map<string, number>();

// Extract the zoomKey substring from a compute key of the form
// `${computeSig}#${zoomKey}#${col}#${row}`. The compute sig never contains '#'
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

// --- Signature split -------------------------------------------------------
// Compute signature: changing any of these invalidates Tier 1 (re-runs the
// expensive escape-time iteration). Includes colorMode/smoothColoring because they
// change HOW the scalar is computed during iteration.
const COMPUTE_SIGNATURE_KEYS: string[] = [
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
  'smoothColoring',
  'flipX',
  'flipY',
];

// Color signature: changing any of these only invalidates Tier 2 (the cheap
// palette lookup + adjustment stage). paletteMin/Max and autoAdjust are here
// because they are pure normalization of the scalar — cheap to redo in Stage 2.
const COLOR_SIGNATURE_KEYS: string[] = [
  'palette',
  'reverseColors',
  'colorCycles',
  'autoAdjustColors',
  'paletteMinIterations',
  'paletteMaxIterations',
  'hueShift',
  'saturation',
  'lightness',
  'colorSpace',
];

function computeComputeSignature(): string {
  return COMPUTE_SIGNATURE_KEYS.map((id) => `${id}=${settingsEngine.getValue(id)}`).join('|');
}

export function getCurrentColorSignature(): string {
  return COLOR_SIGNATURE_KEYS.map((id) => `${id}=${settingsEngine.getValue(id)}`).join('|');
}

export function getCurrentColorParams(): ColorParams {
  return {
    colorMode: settingsEngine.getValue('colorMode') as ColorParams['colorMode'],
    palette: settingsEngine.getValue('palette') as ColorParams['palette'],
    reverseColors: settingsEngine.getValue('reverseColors') as boolean,
    smoothColoring: settingsEngine.getValue('smoothColoring') as boolean,
    colorCycles: settingsEngine.getValue('colorCycles') as number,
    autoAdjustColors: settingsEngine.getValue('autoAdjustColors') as boolean,
    paletteMinIterations: settingsEngine.getValue('paletteMinIterations') as number,
    paletteMaxIterations: settingsEngine.getValue('paletteMaxIterations') as number,
    hueShift: settingsEngine.getValue('hueShift') as number,
    saturation: settingsEngine.getValue('saturation') as number,
    lightness: settingsEngine.getValue('lightness') as number,
    colorSpace: settingsEngine.getValue('colorSpace') as ColorParams['colorSpace'],
  };
}

let lastComputeSig = '';
let lastColorSig = '';

/**
 * Clear caches as needed for any pixel-affecting or color-affecting change since
 * the last call. A compute-signature change clears BOTH tiers (the expensive
 * scalar field is invalid). A color-signature change clears ONLY Tier 2 — Tier 1
 * (the precious compute) survives, so color swaps are non-destructive and cheap.
 */
export function ensureSignatureCurrent(): void {
  const computeSig = computeComputeSignature();
  const colorSig = getCurrentColorSignature();
  if (computeSig !== lastComputeSig) {
    if (scalarCache.size > 0) {
      markDebug('tilecache:signature-change-clear', { size: scalarCache.size });
    }
    clearCompute();
    lastComputeSig = computeSig;
    lastColorSig = colorSig;
  } else if (colorSig !== lastColorSig) {
    clearColor();
    lastColorSig = colorSig;
  }
}

/** Current COMPUTE signature, clearing caches first if it changed. */
export function getRenderSignature(): string {
  ensureSignatureCurrent();
  return computeComputeSignature();
}

function zoomKey(zoom: number): string {
  // Round-trip through toPrecision so equal zooms — which panning preserves
  // exactly — produce identical keys even across separate renders.
  return zoom.toPrecision(12);
}

export function keyFor(signature: string, zoom: number, col: number, row: number): string {
  return `${signature}#${zoomKey(zoom)}#${col}#${row}`;
}

// Color cache key = compute key + '@' + color sig. The compute key contains '#'
// but never '@'; the color sig contains neither. We never run keyZoomKey on a
// color key, so the extra segment is harmless.
function colorKeyFor(computeKey: string, colorSig: string): string {
  return `${computeKey}@${colorSig}`;
}
function computeKeyOf(colorKey: string): string {
  const at = colorKey.indexOf('@');
  return at < 0 ? colorKey : colorKey.slice(0, at);
}
function colorSigOf(colorKey: string): string {
  const at = colorKey.indexOf('@');
  return at < 0 ? '' : colorKey.slice(at + 1);
}

function capCompute(): number {
  const v = settingsEngine.getValue('tileCacheSize');
  return typeof v === 'number' ? v : 2000;
}
function capColor(): number {
  const v = settingsEngine.getValue('colorCacheSize');
  return typeof v === 'number' ? v : 2000;
}

/**
 * Stage 2 entry point used by all assembly paths. Returns the colorized canvas
 * for a tile under a given color state:
 *  - Tier-2 hit: return the cached canvas (LRU-touch Tier 2, and refresh the
 *    Tier-1 parent so a displayed tile can't lose its scalar to eviction).
 *  - Tier-1 hit: colorize the scalar tile, cache it in Tier 2, return.
 *  - miss: return undefined (caller dispatches a worker for the scalar tile).
 */
export function getTile(computeKey: string, colorSig: string, params: ColorParams): TileCanvas | undefined {
  const colorKey = colorKeyFor(computeKey, colorSig);
  const existing = colorCache.get(colorKey);
  if (existing) {
    colorCache.delete(colorKey);
    colorCache.set(colorKey, existing);
    const scalar = scalarCache.get(computeKey);
    if (scalar) {
      scalarCache.delete(computeKey);
      scalarCache.set(computeKey, scalar);
    }
    return existing;
  }
  const scalar = scalarCache.get(computeKey);
  if (!scalar) return undefined;
  // LRU touch Tier 1 (this path colorizes, so the scalar is in active use).
  scalarCache.delete(computeKey);
  scalarCache.set(computeKey, scalar);
  const canvas = renderScalarTileToCanvas(scalar.data, scalar.w, scalar.h, scalar.maxIterations, params);
  colorCache.set(colorKey, canvas);
  let children = colorChildren.get(computeKey);
  if (!children) {
    children = new Set();
    colorChildren.set(computeKey, children);
  }
  children.add(colorSig);
  evictColorIfNeeded();
  return canvas;
}

/** Store a computed scalar tile in Tier 1. Evicts (with cascade) if over cap. */
export function putScalarTile(computeKey: string, tile: ScalarTile): void {
  const existed = scalarCache.has(computeKey);
  scalarCache.delete(computeKey);
  scalarCache.set(computeKey, tile);
  if (!existed) indexAdd(computeKey);
  const limit = capCompute();
  let overshoot = scalarCache.size - limit;
  if (overshoot > 0) {
    for (const oldKey of scalarCache.keys()) {
      evictScalar(oldKey);
      overshoot -= 1;
      if (overshoot <= 0) break;
    }
  }
}

function evictScalar(computeKey: string): void {
  scalarCache.delete(computeKey);
  indexRemove(computeKey);
  const children = colorChildren.get(computeKey);
  if (children) {
    for (const colorSig of children) {
      colorCache.delete(colorKeyFor(computeKey, colorSig));
    }
    colorChildren.delete(computeKey);
  }
}

// Tier-2 LRU eviction driven by colorCacheSize. Drop from the head; cascade-remove
// from the children index so an evicted color tile isn't tracked as a child.
function evictColorIfNeeded(): void {
  const limit = capColor();
  let overshoot = colorCache.size - limit;
  if (overshoot <= 0) return;
  for (const colorKey of colorCache.keys()) {
    colorCache.delete(colorKey);
    const ck = computeKeyOf(colorKey);
    const children = colorChildren.get(ck);
    if (children) {
      children.delete(colorSigOf(colorKey));
      if (children.size === 0) colorChildren.delete(ck);
    }
    overshoot -= 1;
    if (overshoot <= 0) break;
  }
}

export function clearCache(): void {
  clearCompute();
  clearColor();
}

function clearCompute(): void {
  scalarCache.clear();
  zoomLevelCounts.clear();
  colorChildren.clear();
  colorCache.clear(); // every color tile is orphaned once its scalar is gone
}

function clearColor(): void {
  colorCache.clear();
  colorChildren.clear();
}

export function cacheSize(): number {
  return scalarCache.size;
}

export function colorCacheCount(): number {
  return colorCache.size;
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
 * tile (i,j) is world tile (range.colStart+i, range.rowStart+j). Tiles are read
 * through `getTile`, so they are colorized (Stage 2) on demand and the assembly
 * is already in final color.
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
  const computeSig = computeComputeSignature();
  const colorSig = getCurrentColorSignature();
  const params = getCurrentColorParams();
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

  const zoom = view.zoom;
  const misses: AssembledView['misses'] = [];
  for (let j = 0; j < range.numTilesY; j += 1) {
    for (let i = 0; i < range.numTilesX; i += 1) {
      const col = range.colStart + i;
      const row = range.rowStart + j;
      const key = keyFor(computeSig, zoom, col, row);
      const tile = getTile(key, colorSig, params);
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
// which tiles to compute (they are cached via putScalarTile, never painted), so
// the per-level canvas allocation that assembleFromCache does would be pure waste.
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
  const computeSig = computeComputeSignature();
  const { scaleRe, scaleIm } = scaleForView(view, width, height);
  const { tw, th } = tilePixelSize(width, height);
  const range = visibleTileRange(view, width, height, tw, th);
  const assemblyWidth = range.numTilesX * tw;
  const assemblyHeight = range.numTilesY * th;

  const zoom = view.zoom;
  const misses: LayerMisses['misses'] = [];
  for (let j = 0; j < range.numTilesY; j += 1) {
    for (let i = 0; i < range.numTilesX; i += 1) {
      const col = range.colStart + i;
      const row = range.rowStart + j;
      // Peek only (no getTile) so this selection pass does not churn LRU order.
      if (!scalarCache.has(keyFor(computeSig, zoom, col, row))) {
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
// rather than scanning the whole cache.
function listCachedZoomLevels(): number[] {
  const levels: number[] = [];
  for (const zk of zoomLevelCounts.keys()) {
    const z = Number(zk);
    if (Number.isFinite(z)) levels.push(z);
  }
  return levels;
}

// Fraction of the target viewport covered by cached tiles at `candidateZoom`.
// Peek-only (no draw, no LRU churn) so the selection pass stays cheap. Coverage is
// about TIER-1 presence — any computed tile can be colorized on demand.
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
      if (scalarCache.has(keyFor(signature, candidateZoom, r.colStart + i, r.rowStart + j))) {
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
  const signature = computeComputeSignature();
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
  const computeSig = computeComputeSignature();
  const colorSig = getCurrentColorSignature();
  const params = getCurrentColorParams();
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
      const key = keyFor(computeSig, candidateZoom, r.colStart + i, r.rowStart + j);
      const tile = getTile(key, colorSig, params);
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

// --- Uniform-color (single-hue) viewport assembly -------------------------
// Colorize the visible frame from raw Tier-1 scalar tiles in single hue passes,
// so a moving hue stays uniform across the whole viewport during animation. Two
// layers are composited (both colorized at the same `params`, so still one hue):
//   1. a soft BASE from the nearest fully-cached level (guarantees no gaps), and
//   2. a crisp OVERLAY of the exact level's available tiles (partial ok), with
//      missing tiles left transparent so the base shows through.
// The overlay is what lets the frame RESOLVE progressively while the user is
// interacting: exact tiles appear the instant they compute, instead of waiting
// for the whole level to finish (the deep-dive-only behavior before).

// Colorize one cached zoom level into a `width×height` canvas at a single hue,
// scaled/placed for `view`. With allowGaps, tiles not yet cached are left
// transparent (for the crisp overlay); without it, missing tiles take the
// palette's zero color (only used for a base layer that is already near-complete).
// Returns null when the level has zero cached coverage.
function assembleUniformLayer(
  view: ViewState,
  width: number,
  height: number,
  candidateZoom: number,
  params: ColorParams,
  allowGaps: boolean,
): HTMLCanvasElement | null {
  const computeSig = computeComputeSignature();
  const { scaleRe, scaleIm } = scaleForView(view, width, height);
  const r = candidateTileRange(view, width, height, candidateZoom);
  const maxIterations = settingsEngine.getValue('maxIterations') as number;
  const nativeW = r.numTilesX * r.tw;
  const nativeH = r.numTilesY * r.th;

  const data = new Float32Array(nativeW * nativeH);
  const missing: Array<{ i: number; j: number }> = [];
  let covered = 0;
  for (let j = 0; j < r.numTilesY; j += 1) {
    for (let i = 0; i < r.numTilesX; i += 1) {
      const key = keyFor(computeSig, candidateZoom, r.colStart + i, r.rowStart + j);
      const tile = scalarCache.get(key);
      if (tile) {
        covered += 1;
        for (let ty = 0; ty < r.th; ty += 1) {
          const srcOff = ty * r.tw;
          const dstOff = (j * r.th + ty) * nativeW + i * r.tw;
          for (let tx = 0; tx < r.tw; tx += 1) data[dstOff + tx] = tile.data[srcOff + tx];
        }
      } else {
        missing.push({ i, j });
      }
    }
  }
  if (covered === 0) return null;

  const native = document.createElement('canvas');
  native.width = nativeW;
  native.height = nativeH;
  const nctx = native.getContext('2d');
  if (!nctx) return null;
  const img = colorizeScalarField(data, nativeW, nativeH, maxIterations, params);
  nctx.putImageData(img, 0, 0);
  if (allowGaps) {
    // Punch out uncomputed tiles so the base layer below shows through.
    for (const m of missing) nctx.clearRect(m.i * r.tw, m.j * r.th, r.tw, r.th);
  }

  const screenX = (r.colStart * r.tileWorldW - (view.centerRe - (width / 2) * scaleRe)) / scaleRe;
  const screenY = (r.rowStart * r.tileWorldH - (view.centerIm - (height / 2) * scaleIm)) / scaleIm;
  const drawW = (r.numTilesX * r.tileWorldW) / scaleRe;
  const drawH = (r.numTilesY * r.tileWorldH) / scaleIm;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(native, Math.round(screenX), Math.round(screenY), Math.round(drawW), Math.round(drawH));
  return canvas;
}

/**
 * Assemble a `width×height` canvas depicting `view`, colorized uniformly at a
 * single hue, resolving progressively: a soft complete base (upscaled nearest
 * fully-cached level, never gappy) with the exact level's available tiles
 * composited crisply on top. Returns null when nothing is cached yet, so callers
 * fall back / keep the last frame.
 */
export function assembleUniformColorViewport(
  view: ViewState,
  width: number,
  height: number,
  params: ColorParams,
): HTMLCanvasElement | null {
  const exactZoom = view.zoom;
  // Soft base: nearest COMPLETE level (guarantees full coverage → no gaps/black).
  const baseZoom = pickBestCachedZoom(view, width, height, {
    depthMode: 'unlimited',
    maxOctaves: 32,
    minCoverage: 0.999,
  });

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const octx = out.getContext('2d');
  if (!octx) return null;
  octx.imageSmoothingEnabled = true;

  let painted = false;
  if (baseZoom !== null) {
    const base = assembleUniformLayer(view, width, height, baseZoom, params, false);
    if (base) {
      octx.drawImage(base, 0, 0);
      painted = true;
    }
  }

  // Crisp overlay: the exact level's available tiles (partial ok) for progressive
  // resolution. Skip when the base already IS the exact level. Gaps are allowed
  // only when a base is under it; with no base, fill gaps opaquely (last resort,
  // only right after a cache clear) so nothing stale shows through.
  if (baseZoom === null || zoomKey(baseZoom) !== zoomKey(exactZoom)) {
    const exact = assembleUniformLayer(view, width, height, exactZoom, params, painted);
    if (exact) {
      octx.drawImage(exact, 0, 0);
      painted = true;
    }
  }

  return painted ? out : null;
}

// --- Base scalar-frame capture ----------------------------------------------
// Assemble the scalar field for `view` (mirroring assembleFromCache's geometry)
// into a single Float32Array. Used to capture renderContext.baseScalarField so a
// color change can be repainted (or an animation recolored) without re-iterating.
export type AssembledScalar = {
  data: Float32Array;
  width: number;
  height: number;
  canvasWidth: number;
  canvasHeight: number;
  sx0: number;
  sy0: number;
  maxIterations: number;
  view: ViewState;
};

export function assembleScalarField(
  view: ViewState,
  width: number,
  height: number,
): AssembledScalar | null {
  const computeSig = computeComputeSignature();
  const { scaleRe, scaleIm } = scaleForView(view, width, height);
  const { tw, th } = tilePixelSize(width, height);
  const range = visibleTileRange(view, width, height, tw, th);
  const assemblyWidth = range.numTilesX * tw;
  const assemblyHeight = range.numTilesY * th;
  const maxIterations = settingsEngine.getValue('maxIterations') as number;
  const data = new Float32Array(assemblyWidth * assemblyHeight);

  const zoom = view.zoom;
  let covered = 0;
  for (let j = 0; j < range.numTilesY; j += 1) {
    for (let i = 0; i < range.numTilesX; i += 1) {
      const col = range.colStart + i;
      const row = range.rowStart + j;
      const key = keyFor(computeSig, zoom, col, row);
      const tile = scalarCache.get(key);
      if (tile) {
        covered += 1;
        for (let ty = 0; ty < th; ty += 1) {
          const srcOff = ty * tw;
          const dstOff = (j * th + ty) * assemblyWidth + i * tw;
          for (let tx = 0; tx < tw; tx += 1) {
            data[dstOff + tx] = tile.data[srcOff + tx];
          }
        }
      } else {
        // Missing tile within a captured frame: fill with the interior scalar so
        // Stage 2 maps it to the interior color (avoid leaving a black hole). In
        // practice the base frame is only captured once a frame is fully resolved.
        for (let ty = 0; ty < th; ty += 1) {
          const dstOff = (j * th + ty) * assemblyWidth + i * tw;
          for (let tx = 0; tx < tw; tx += 1) {
            data[dstOff + tx] = maxIterations;
          }
        }
      }
    }
  }
  if (covered === 0) return null;

  const tileWorldW = tw * scaleRe;
  const tileWorldH = th * scaleIm;
  // Offset must match presentAssembly exactly, or the recolored buffer lands at
  // the wrong screen position and the assembly's margin tiles (neighboring world
  // positions) bleed over the viewport.
  const assemblyCenterRe = ((range.colStart + range.numTilesX) * tileWorldW + range.colStart * tileWorldW) / 2;
  const assemblyCenterIm = ((range.rowStart + range.numTilesY) * tileWorldH + range.rowStart * tileWorldH) / 2;
  const sx0 = (assemblyCenterRe - view.centerRe) / scaleRe + (width - assemblyWidth) / 2;
  const sy0 = (assemblyCenterIm - view.centerIm) / scaleIm + (height - assemblyHeight) / 2;

  return {
    data,
    width: assemblyWidth,
    height: assemblyHeight,
    canvasWidth: width,
    canvasHeight: height,
    sx0,
    sy0,
    maxIterations,
    view: { ...view },
  };
}
