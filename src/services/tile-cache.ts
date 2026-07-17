import { ViewState } from '../types';
import { settingsEngine } from '../settings/instance';
import { markDebug } from '../utils/debug';

export type TileCanvas = HTMLCanvasElement;

// LRU cache. Map preserves insertion order; a hit re-inserts the entry at the
// tail (most-recent), and eviction drops from the head (oldest).
const cache = new Map<string, TileCanvas>();

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
  cache.delete(key);
  cache.set(key, tile);
  const limit = cap();
  let overshoot = cache.size - limit;
  if (overshoot > 0) {
    for (const oldKey of cache.keys()) {
      cache.delete(oldKey);
      overshoot -= 1;
      if (overshoot <= 0) break;
    }
  }
}

export function clearCache(): void {
  cache.clear();
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

export type ZoomPreviewDepthMode = 'exact' | 'limited' | 'unlimited';

export type ZoomPreviewOptions = {
  /** How far from the target zoom a reused level may be. */
  depthMode: ZoomPreviewDepthMode;
  /** Max |zoom octaves| when depthMode === 'limited' (1 octave = 2× zoom). */
  maxOctaves: number;
  /** Minimum fraction (0..1) of the viewport a candidate must cover. */
  minCoverage: number;
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

// Distinct cached zoom levels for the current signature (cheap key scan).
function listCachedZoomLevels(signature: string): number[] {
  const prefix = `${signature}#`;
  const levels = new Set<number>();
  for (const key of cache.keys()) {
    if (!key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    const hash = rest.indexOf('#');
    if (hash < 0) continue;
    const z = Number(rest.slice(0, hash));
    if (Number.isFinite(z)) levels.add(z);
  }
  return [...levels];
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
  const candidates = opts.depthMode === 'exact'
    ? [targetZoom]
    : listCachedZoomLevels(signature).filter((z) => {
        if (opts.depthMode === 'unlimited') return true;
        return Math.abs(Math.log2(z / targetZoom)) <= opts.maxOctaves;
      });

  let bestZoom: number | null = null;
  let bestDist = Infinity;
  for (const z of candidates) {
    const { covered, total } = candidateCoverage(view, width, height, z, signature);
    if (total === 0 || covered / total < opts.minCoverage) continue;
    const dist = Math.abs(Math.log2(z / targetZoom));
    if (dist < bestDist) {
      bestDist = dist;
      bestZoom = z;
    }
  }
  return bestZoom;
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
