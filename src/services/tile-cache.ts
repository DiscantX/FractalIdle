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

/**
 * If `view`'s entire viewport is already cached, return a `width×height` canvas
 * holding exactly that viewport (used as a zoom-out preview so a previously
 * visited level appears instantly with no pop-in). Returns null when any tile
 * is missing, so callers can fall back to scaling the current frame instead.
 */
export function assembleCachedViewport(view: ViewState, width: number, height: number): HTMLCanvasElement | null {
  const assembled = assembleFromCache(view, width, height, false);
  if (assembled.misses.length > 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  const sx0 =
    (assembled.assemblyCenterRe - view.centerRe) / assembled.scaleRe +
    (width - assembled.assemblyWidth) / 2;
  const sy0 =
    (assembled.assemblyCenterIm - view.centerIm) / assembled.scaleIm +
    (height - assembled.assemblyHeight) / 2;
  ctx.drawImage(assembled.assembly, Math.round(sx0), Math.round(sy0));
  return canvas;
}
