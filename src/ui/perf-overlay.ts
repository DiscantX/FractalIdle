import { renderContext } from '../state';
import { settingsEngine } from '../settings/instance';
import {
  getWorkerComputeMs,
  getWorkerComputeBreakdown,
  getPrimaryTileCount,
  getTotalTileCount,
  getChunkBreakdown,
  getPaintMs,
} from '../services/renderer';
import { cacheSize, colorCacheCount } from '../services/tile-cache';
import { Sparkline } from './sparkline';

// Performance overlay element (module-level)
let perfOverlay: HTMLDivElement | null = null;

function createPerformanceOverlay(): void {
  perfOverlay = document.createElement('div');
  perfOverlay.id = 'performanceOverlay';
  // Static styling for #performanceOverlay and its .perf-* child classes lives
  // in style.css. We only set display inline here: show/hide toggles the inline
  // value, and the metrics loop idles on `style.display === 'none'`, so the
  // initial state must be inline rather than merely stylesheet-derived.
  perfOverlay.style.display = 'none';
  // Append into the canvas panel (not body) so the overlay and the
  // render-status badge share one containing block and therefore the same
  // `var(--hud-inset)` margin. The panel is position:relative, so the overlay's
  // absolute top/right resolve against the panel just like the badge's inset.
  (document.querySelector<HTMLElement>('.canvas-panel') ?? document.body).appendChild(perfOverlay);

  // Custom tooltip for the Jank culprit list. The overlay has pointer-events:
  // none (so it never blocks the canvas), which also suppresses the native
  // title tooltip — so we render our own element and drive it from a window
  // mousemove listener that checks whether the cursor is over the overlay.
  jankTooltipEl = document.createElement('div');
  jankTooltipEl.id = 'jankTooltip';
  jankTooltipEl.style.display = 'none';
  document.body.appendChild(jankTooltipEl);
}

// Performance metrics tracking
// ---------------------------------------------------------------------------
// NOTE ON PERFORMANCE IMPACT: gathering these metrics is intentionally cheap.
//  - FPS is derived from our own rAF loop (already running while the overlay is
//    visible), so it adds zero extra work.
//  - Renders/s increments a counter inside the existing render-complete
//    callback (no polling, no new timers).
//  - CPU% runs a single low-priority setTimeout every 100ms ONLY while the
//    overlay is visible, purely to measure main-thread latency. The cost is
//    negligible (~one timer wakeup / 100ms) and it is stopped when the overlay
//    is hidden. Browsers do not expose per-app CPU, so this is an *estimate* of
//    main-thread occupancy (worker-thread time is not counted).
//  - Memory reads performance.memory.usedJSHeapSize once per second.
// ---------------------------------------------------------------------------
let frameCount = 0;
let lastMetricsTime = performance.now();
let lastWorkerComputeMs = 0;
let lastWorkerBreakdown: number[] = [];
let lastPrimaryTiles = 0;
let lastTotalTiles = 0;
let lastChunkBreakdown: Record<string, number> = {};
let lastPaintMs = 0;
let metricsTimerId: number | null = null;

// --- CPU usage approximation (main thread) ---------------------------------
// Browsers don't expose per-app CPU. We approximate by measuring how late a
// fixed-cadence timer fires: when the main thread is busy, the wakeup is
// delayed. The delayed fraction over a 1s window estimates occupancy.
let cpuPercent = 0;
let cpuProbeLast = 0;
let cpuWindowStart = 0;
let cpuExpected = 0;
let cpuActual = 0;
let cpuProbeTimer: number | null = null;
const CPU_INTERVAL = 100;

function cpuProbe(): void {
  const now = performance.now();
  cpuActual += now - cpuProbeLast;
  cpuExpected += CPU_INTERVAL;
  cpuProbeLast = now;
  if (now - cpuWindowStart >= 1000) {
    const ratio = cpuExpected / Math.max(cpuActual, 1);
    cpuPercent = Math.max(0, Math.min(100, (1 - ratio) * 100));
    cpuWindowStart = now;
    cpuExpected = 0;
    cpuActual = 0;
  }
  cpuProbeTimer = window.setTimeout(cpuProbe, CPU_INTERVAL);
}

function startCpuProbe(): void {
  if (cpuProbeTimer !== null) return;
  cpuProbeLast = performance.now();
  cpuWindowStart = cpuProbeLast;
  cpuExpected = 0;
  cpuActual = 0;
  cpuProbeTimer = window.setTimeout(cpuProbe, CPU_INTERVAL);
}

function stopCpuProbe(): void {
  if (cpuProbeTimer !== null) {
    window.clearTimeout(cpuProbeTimer);
    cpuProbeTimer = null;
  }
}

// Memory measurement. Two sources, in preference order:
//  1. performance.measureUserAgentSpecificMemory() — total page/agent memory
//     (JS heap + DOM + workers). Chromium-only AND requires the page to be
//     cross-origin isolated (COOP: same-origin + COEP: require-corp response
//     headers). It is async and not free, so we sample it on a 1s interval —
//     aligned with the overlay's 1s metrics window so Mem tracks Est cache
//     closely (Mem is still inherently a touch behind, since the measurement is
//     async and the browser computes it on its own schedule).
//  2. performance.memory.usedJSHeapSize — main-thread JS heap only. Chromium-only.
//     We only land here if the page isn't cross-origin isolated (measure threw).
// In the overlay Mem is tagged (S) for the Specific (agent-wide) measurement and
// (M) for the Main-thread fallback — the latter excludes workers, so "Est cache"
// can legitimately read larger than it. Firefox/Safari have neither, so "n/a".
let agentMemoryMb: number | null = null;
// 'agent' = full page/agent memory via measureUserAgentSpecificMemory (incl. workers);
// 'main'  = fallback to main-thread JS heap only (workers NOT counted).
let agentMemorySource: 'agent' | 'main' | null = null;
let memorySamplerId: number | null = null;

interface MemoryMeasurement {
  bytes: number;
}

async function sampleMemory(): Promise<void> {
  const measure = (performance as unknown as {
    measureUserAgentSpecificMemory?: () => Promise<MemoryMeasurement>;
  }).measureUserAgentSpecificMemory;
  if (measure) {
    try {
      const sample = await measure.call(performance);
      agentMemoryMb = Math.round(sample.bytes / (1024 * 1024));
      agentMemorySource = 'agent';
      return;
    } catch {
      // Not cross-origin isolated, or measurement refused — fall through to the
      // main-thread heap, which we tag (M) in the overlay.
    }
  }
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  if (mem && typeof mem.usedJSHeapSize === 'number') {
    agentMemoryMb = Math.round(mem.usedJSHeapSize / (1024 * 1024));
    agentMemorySource = 'main';
  } else {
    agentMemoryMb = null;
    agentMemorySource = null;
  }
}

function startMemorySampler(): void {
  if (memorySamplerId !== null) return;
  sampleMemory();
  memorySamplerId = window.setInterval(sampleMemory, 1000);
}

function stopMemorySampler(): void {
  if (memorySamplerId !== null) {
    window.clearInterval(memorySamplerId);
    memorySamplerId = null;
  }
}

// --- Jank (main-thread blockage) -----------------------------------------
// Browsers hide raw system CPU %, so instead we measure main-thread blockage via
// Long Animation Frames (LoAF) — the modern, script-attributed standard — with
// the older Long Tasks API as fallback. We count jank events per 1s window, track
// durations, and attribute offenders so a hitch is debuggable.
// Unsupported browsers (Firefox/Safari lack LoAF; anything without either) show
// "n/a".

let jankObserver: PerformanceObserver | null = null;
let jankSupported: boolean | null = null; // null = not yet probed, false = n/a
let jankAccumCount = 0;
let jankAccumMaxMs = 0;
let jankAccumCulpritCurrent: string | null = null; // culprit for current frame only
let jankCulpritToShow: string | null = null; // persists, cleared after delay
let jankCulpritStale: boolean = false; // true when no new culprit for >= display ms
let jankStaleTimer: number | null = null;
const JANK_CULPRIT_DISPLAY_MS = 5000;

// Data structures for full offender tracking (for tooltip)
let jankOffenders = new Map<string, {count: number, totalMs: number}>();
let jankTooltipText = '';
let jankTooltipEl: HTMLDivElement | null = null;
let tooltipDirty = false; // set when jankOffenders changes; tooltip rebuilt lazily on show
let tooltipRect: DOMRect | null = null; // cached perfOverlay rect (avoids layout read per mousemove)
let tooltipRectStale = true; // true when the cached rect needs refresh
let tooltipBuilt = false; // true after first build; ensures placeholder is shown on first hover

function recordJank(entry: any): void {
  const dur = entry?.duration ?? 0;
  if (dur <= 0) return;
  jankAccumCount += 1;
  const key = worstScriptOf(entry);
  if (dur > jankAccumMaxMs) {
    jankAccumMaxMs = dur;
    // Skip unattributable entries ('unknown'/'anonymous') for the top-offender
    // line — they aren't actionable; the Jank count above still includes them.
    if (key !== 'unknown' && key !== '(anonymous)') {
      jankAccumCulpritCurrent = key;
    }
  }

  // Track all offenders with detailed stats (unattributable ones excluded)
  if (key !== '(anonymous)' && key !== 'unknown') {
    const entryData = jankOffenders.get(key) || {count: 0, totalMs: 0};
    entryData.count += 1;
    entryData.totalMs += dur;
    jankOffenders.set(key, entryData);
    tooltipDirty = true; // tooltip content needs rebuild
  }
}

// Pick the longest-running script in a long frame. LoAF gives precise per-script
// timing; Long Tasks only yields coarse attribution.
function worstScriptOf(entry: any): string {
  const scripts = entry?.scripts as Array<any> | undefined;
  if (Array.isArray(scripts) && scripts.length > 0) {
    let worst = scripts[0];
    for (const s of scripts) {
      if ((s.duration ?? 0) > (worst.duration ?? 0)) worst = s;
    }
    const fn = worst.sourceFunctionName || '(anonymous)';
    const url = worst.sourceURL || worst.invoker || 'unknown';
    // Return only the path portion of the URL (no origin, no query). The query
    // is Vite's HMR cache-busting `?t=<timestamp>` — not the function name.
    try {
      const u = new URL(url);
      return shortenSrc(`${fn} @ ${u.pathname}`);
    } catch {
      return shortenSrc(`${fn} @ ${url}`);
    }
  }
  const attr = entry?.attribution as Array<any> | undefined;
  if (Array.isArray(attr) && attr.length > 0) {
    const a = attr[0];
    // For attributions that are not full URLs, just return the name
    return a.containerSrc || a.containerType || a.name || 'unknown';
  }
  return 'unknown';
}

function shortenSrc(s: string): string {
  const max = 64;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Build the tooltip from all accumulated offenders. Each offender is a colored
// line: the fn@path identity and ×count stay neutral, while the total jank time
// is graded green→yellow→red by severity. Severity is adaptive across the
// offenders' own totalMs distribution (median = yellow midpoint, band = a
// fraction of the median) rather than absolute ms, since "bad" depends on run
// length — so the worst offenders read red and minor ones green.
//
// Early exit on clean state with no content to avoid work.
function buildJankTooltip(): void {
  const root = jankTooltipEl;
  if (!root) return;
  if (jankOffenders.size === 0) {
    root.replaceChildren(textSpan('No jank recorded this run.'));
    jankTooltipText = 'No jank recorded this run.';
    return;
  }
  const sorted = Array.from(jankOffenders.entries())
    .sort((a, b) => b[1].totalMs - a[1].totalMs);
  const totals = sorted.map(([, d]) => d.totalMs).sort((a, b) => a - b);
  const med = percentile(totals, 50);
  const spread = Math.max(med * BAND_FRACTION, BAND_FLOOR);
  root.replaceChildren();
  // Column widths for alignment: "@" at a fixed column (fn right-aligned to it), the count's
  // ones digit (count right-aligned), and the "(" of the time block (a fixed-
  // width numeric block). The block sits after a fixed-width left column, so the
  // "(" lines up regardless of how long the path is.
  let maxFnLen = 0;
  let maxSrcLen = 0;
  let maxCountW = 1;
  let maxTimeW = 1;
  for (const [key, data] of sorted) {
    const atIdx = key.indexOf(' @ ');
    const fn = atIdx >= 0 ? key.slice(0, atIdx) : key;
    const srcPath = atIdx >= 0 ? key.slice(atIdx + 3) : '';
    maxFnLen = Math.max(maxFnLen, fn.length);
    maxSrcLen = Math.max(maxSrcLen, srcPath.length);
    maxCountW = Math.max(maxCountW, String(data.count).length);
    maxTimeW = Math.max(maxTimeW, data.totalMs.toFixed(1).length);
  }
  const SRC_CAP = 36; // cap the path column so one long path can't blow out layout
  const srcCap = Math.min(maxSrcLen, SRC_CAP);
  for (const [key, data] of sorted) {
    const line = document.createElement('div');
    line.className = 'perf-line';
    // Split the "fn @ path" key so the function name and file path each get
    // their own uniform color (distinct from the totalMs severity gradient).
    const atIdx = key.indexOf(' @ ');
    const fn = atIdx >= 0 ? key.slice(0, atIdx) : key;
    let srcPath = atIdx >= 0 ? key.slice(atIdx + 3) : '';
    if (srcPath.length > srcCap) srcPath = '…' + srcPath.slice(-(srcCap - 1));
    // Lower totalMs is better → greener. Normalize against the offender set so
    // the worst (largest totalMs) reads red and the median reads yellow.
    let tNorm = spread > 0 ? (data.totalMs - med) / spread : 0;
    tNorm = Math.min(1, Math.max(-1, tNorm));
    let tColor = (tNorm + 1) / 2; // 0.5 at the median (yellow)
    tColor = 1 - tColor; // flip: lower totalMs = greener
    line.appendChild(textSpan(fn.padStart(maxFnLen), 'jank-fn'));
    line.appendChild(textSpan(' @ '));
    line.appendChild(textSpan(srcPath, 'jank-path'));
    line.appendChild(textSpan(' '.repeat(srcCap - srcPath.length)));
    line.appendChild(textSpan(` ×${String(data.count).padStart(maxCountW)} (`));
    const ms = document.createElement('span');
    ms.style.color = gradient(tColor);
    ms.textContent = `${data.totalMs.toFixed(1).padStart(maxTimeW)}ms total`;
    line.appendChild(ms);
    line.appendChild(textSpan(')'));
    root.appendChild(line);
  }
  jankTooltipText = ' '; // truthy gate; content lives in the element
}

function showJankTooltip(): void {
  if (tooltipDirty || !tooltipBuilt) {
    buildJankTooltip();
    tooltipDirty = false;
    tooltipBuilt = true;
  }
  if (jankTooltipEl && jankTooltipText) {
    jankTooltipEl.style.display = 'block';
  }
}

function hideJankTooltip(): void {
  if (jankTooltipEl) jankTooltipEl.style.display = 'none';
}

// Schedule the main-display culprit to clear JANK_CULPRIT_DISPLAY_MS after it was
// last set. Called when a new culprit arrives and NOT on every stale window — if
// we rescheduled here each second the expiry would drift forward forever and the
// culprit would never clear (it would persist as long as the overlay is open).
function scheduleJankCulpritClear(): void {
  if (jankStaleTimer !== null) clearTimeout(jankStaleTimer);
  jankStaleTimer = window.setTimeout(() => {
    jankCulpritToShow = null;
    jankCulpritStale = false;
    hideJankTooltip();
    jankStaleTimer = null;
  }, JANK_CULPRIT_DISPLAY_MS);
}

// Driven by a window mousemove listener (the overlay itself gets no pointer
// events). Shows the tooltip only while the cursor is over the overlay rect,
// and flips/clamps it to stay inside the viewport.
//
// Performance: cache the overlay rect and tooltip dimensions to avoid forcing
// layout on every mousemove. The rect is refreshed on scroll/resize or when
// the tooltip becomes visible after being hidden.
function onJankTooltipMouseMove(event: MouseEvent): void {
  if (!perfOverlay || perfOverlay.style.display === 'none' || !jankTooltipEl) {
    hideJankTooltip();
    return;
  }
  // Refresh cached rect if it was marked stale (by scroll/resize/visibility)
  if (tooltipRectStale) {
    tooltipRect = perfOverlay.getBoundingClientRect();
    tooltipRectStale = false;
  }
  const rect = tooltipRect;
  if (!rect) {
    hideJankTooltip();
    return;
  }
  const inside =
    event.clientX >= rect.left && event.clientX <= rect.right &&
    event.clientY >= rect.top && event.clientY <= rect.bottom;
  if (!inside) {
    hideJankTooltip();
    return;
  }
  // Build tooltip lazily if it's dirty OR if we've never built it before (to show placeholder)
  if (tooltipDirty || !tooltipBuilt) {
    buildJankTooltip();
    tooltipDirty = false;
    tooltipBuilt = true;
  }
  // Show first so offsetWidth/Height return correct values (0 when display:none)
  jankTooltipEl.style.display = 'block';
  // Cache tooltip dimensions to avoid repeated layout reads
  let tw = jankTooltipEl.offsetWidth;
  let th = jankTooltipEl.offsetHeight;
  // If tooltip has no content yet (first call), getBoundingClientRect may return
  // 0/0. Fall back to default size to avoid positioning issues.
  if (tw === 0 && th === 0) {
    tw = jankTooltipEl.getBoundingClientRect().width || 200;
    th = jankTooltipEl.getBoundingClientRect().height || 100;
  }
  const margin = 12;
  let left = event.clientX + margin;
  let top = event.clientY + margin;
  if (left + tw > window.innerWidth) left = Math.max(0, event.clientX - tw - margin);
  if (top + th > window.innerHeight) top = Math.max(0, event.clientY - th - margin);
  jankTooltipEl.style.left = `${left}px`;
  jankTooltipEl.style.top = `${top}px`;
}

function startJankObserver(): void {
  if (jankObserver !== null || jankSupported === false) return;
  if (typeof PerformanceObserver === 'undefined') {
    jankSupported = false;
    return;
  }
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) recordJank(entry);
  });
  try {
    observer.observe({ entryTypes: ['long-animation-frame'] });
    jankObserver = observer;
    jankSupported = true;
  } catch {
    try {
      observer.observe({ entryTypes: ['longtask'] });
      jankObserver = observer;
      jankSupported = true;
    } catch {
      observer.disconnect();
      jankSupported = false;
    }
  }
}

function stopJankObserver(): void {
  if (jankObserver !== null) {
    jankObserver.disconnect();
    jankObserver = null;
  }
  jankSupported = null;
  jankAccumCount = 0;
  jankAccumMaxMs = 0;
  jankAccumCulpritCurrent = null;
  jankCulpritToShow = null;
  jankCulpritStale = false;
  // Intentionally do NOT clear jankOffenders / jankTooltipText here: the tooltip
  // reflects all jank over the application's lifetime, so it must survive
  // overlay hide/show rather than being reset when the overlay is toggled off.
  hideJankTooltip();
  if (jankStaleTimer) {
    clearTimeout(jankStaleTimer);
    jankStaleTimer = null;
  }
}

// Estimated tile-cache memory footprint, derived from known state (tile counts
// + tile pixel size) rather than a browser API. This works in every browser
// and is shown as its own stat — it is NOT a Firefox fallback for `Mem`. It's a
// real (lower-bound) approximation of the dominant heap user in this app.
function estimateCacheMb(): number {
  const width = settingsEngine.getValue('width') as number;
  const height = settingsEngine.getValue('height') as number;
  const cols = Math.max(1, settingsEngine.getValue('gridColumns') as number);
  const rows = Math.max(1, settingsEngine.getValue('gridRows') as number);
  const tw = Math.max(8, Math.floor(width / cols));
  const th = Math.max(8, Math.floor(height / rows));
  const tileBytes = tw * th * 4; // per pixel-layer (steps Float32 OR RGBA)
  const estBytes =
    (cacheSize() + colorCacheCount()) * tileBytes + // scalar + color tiles
    width * height * 4; // live canvas
  return estBytes / (1024 * 1024);
}

// --- Overlay rendering helpers --------------------------------------------
// The overlay is built from child <span>s (one per title/value/unit) rather than
// a single textContent string, so each segment can be colored independently.
// Titles are bold + group-colored; values get a green→yellow→red gradient by
// "good/bad" direction; units/qualifiers are muted.

type StatDir = 'high' | 'low' | 'neutral';

interface StatTracker {
  dir: StatDir;
  history: number[];
  // Absolute good/bad anchors for stats with a natural ceiling/floor (FPS tops
  // out near the display refresh; CPU/jank are best near 0). When set, the
  // gradient is anchored to these fixed values instead of the rolling median,
  // so a great FPS or low CPU reads green immediately. When omitted, the stat
  // uses the adaptive median model (for stats without a meaningful absolute
  // target, e.g. chunks/s, which scale with settings).
  good?: number; // value at which the stat is fully green
  bad?: number; // value at which the stat is fully red
  // For adaptive stats: when true, the rolling median reads GREEN (typical is
  // good) and only the worse direction grades down to red — e.g. worker compute,
  // where "average" is healthy. When false (default), the median reads YELLOW
  // and both directions grade to red.
  greenMid?: boolean;
}

// Per-stat config for the value gradient. `high` = higher is better (green at
// the top); `low` = lower is better (green at the bottom); `neutral` = no gradient
// (Compute, Cache, Est cache, Mem aren't clearly good/bad). Worker/level
// trackers are registered dynamically in recordStat (dir 'high', no anchors).
const statTrackers: Record<string, StatTracker> = {
  fps: { dir: 'high', history: [], good: 60, bad: 20 },
  chunks: { dir: 'high', history: [] },
  allChunks: { dir: 'high', history: [] },
  cpu: { dir: 'low', history: [], good: 15, bad: 80 },
  paint: { dir: 'low', history: [] },
  jankCount: { dir: 'low', history: [], good: 0, bad: 10 },
  jankMax: { dir: 'low', history: [], good: 0, bad: 100 },
};
const VALUE_HISTORY_MAX = 60; // ~60s of 1s windows
const BAND_FRACTION = 0.75; // yellow-band half-width as a fraction of the median
const BAND_FLOOR = 3; // ...with an absolute floor so low/stable metrics still grade

function recordStat(key: string, value: number, dir?: StatDir, greenMid = false): void {
  let t = statTrackers[key];
  if (!t) {
    if (!dir) return; // unknown stat with no direction — skip (neutral)
    t = statTrackers[key] = { dir, history: [], greenMid };
  }
  if (t.dir === 'neutral') return;
  t.history.push(value);
  if (t.history.length > VALUE_HISTORY_MAX) t.history.shift();
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

// Green→yellow→red for t in [0,1] (0 = red, 0.5 = yellow, 1 = green).
function gradient(t: number): string {
  const red = [248, 81, 73];
  const yellow = [210, 153, 34];
  const green = [63, 185, 80];
  const k = Math.min(1, Math.max(0, t));
  const [a, b, f] = k < 0.5
    ? [red, yellow, k / 0.5]
    : [yellow, green, (k - 0.5) / 0.5];
  const r = Math.round(a[0] + (b[0] - a[0]) * f);
  const g = Math.round(a[1] + (b[1] - a[1]) * f);
  const bl = Math.round(a[2] + (b[2] - a[2]) * f);
  return `rgb(${r}, ${g}, ${bl})`;
}

// Returns a CSS color for a tracked stat's current value, or null when the stat
// is neutral. Stats with absolute `good`/`bad` anchors are graded against those
// fixed points (so a great FPS or low CPU reads green at once). Stats without
// anchors fall back to the adaptive model: the yellow midpoint is the window
// median (your "normal"), with a band-width above/below it grading green/red.
// The band is a fraction of the median with an absolute floor, so a stable
// metric still spans the full range instead of snapping between green and red
// with no yellow. `low`-direction stats flip the scale.
function valueColor(key: string, value: number): string | null {
  const t = statTrackers[key];
  if (!t || t.dir === 'neutral') return null;
  let goodness: number; // 0 = red, 1 = green
  if (t.good !== undefined && t.bad !== undefined) {
    // Absolute anchors.
    if (t.dir === 'high') {
      goodness = (value - t.bad) / (t.good - t.bad);
    } else {
      goodness = (t.bad - value) / (t.bad - t.good);
    }
    goodness = Math.min(1, Math.max(0, goodness));
  } else {
    // Adaptive: band = fraction of median (with floor).
    const h = t.history;
    if (h.length < 5) return null;
    const sorted = [...h].sort((a, b) => a - b);
    const med = percentile(sorted, 50);
    const spread = Math.max(med * BAND_FRACTION, BAND_FLOOR);
    if (t.greenMid) {
      // Green at the median (typical is good); only the worse direction grades
      // down to red. For 'high' stats, below-median is yellow→red and above
      // stays green; for 'low', above-median is yellow→red.
      if (t.dir === 'high') {
        goodness = Math.min(1, Math.max(0, (value - (med - spread)) / spread));
      } else {
        goodness = Math.min(1, Math.max(0, ((med + spread) - value) / spread));
      }
    } else {
      // Yellow at the median; both directions grade to red.
      let tNorm = spread > 0 ? (value - med) / spread : 0;
      tNorm = Math.min(1, Math.max(-1, tNorm));
      goodness = (tNorm + 1) / 2; // 0.5 at the median (yellow), 1 at +spread
      if (t.dir === 'low') goodness = 1 - goodness;
    }
  }
  return gradient(goodness);
}

// --- Sparklines -------------------------------------------------------------
// A persistent Sparkline per stat key. The registry survives the overlay's
// per-window replaceChildren() rebuild (we re-append each line's existing SVG
// node every window), and each Sparkline owns its own 1Hz ring buffer, so the
// history is fully independent of statTrackers (which only covers gradient
// stats). This keeps the Sparkline module decoupled from the perf stats.
const sparklines = new Map<string, Sparkline>();
// Group colors mirror the .grp-* CSS rules; used as the stroke for neutral
// stats that have no value gradient.
const GROUP_COLOR: Record<string, string> = {
  'grp-throughput': '#56d4dd',
  'grp-mainthread': '#f0883e',
  'grp-compute': '#bc8cff',
  'grp-memory': '#79c0ff',
  'grp-jank': '#ff7b9c',
};

function getSparkline(key: string): Sparkline {
  let s = sparklines.get(key);
  if (!s) {
    s = new Sparkline();
    sparklines.set(key, s);
  }
  return s;
}

// Record the latest sample for a stat and return its sparkline element. Each
// vertex is colored by its own value's gradient (low→red, high→green), falling
// back to the group color for neutral stats or before enough history has
// accumulated. Prepend the returned node as the first child of the line.
function sparklineFor(key: string, value: number, group: string): SVGSVGElement {
  const sl = getSparkline(key);
  sl.setColorize((v) => valueColor(key, v) ?? GROUP_COLOR[group] ?? '#8b949e');
  sl.setColor(GROUP_COLOR[group] ?? '#8b949e');
  sl.push(value);
  return sl.element;
}

function statLine(sub: boolean, children: Node[]): HTMLDivElement {
  const div = document.createElement('div');
  div.className = sub ? 'perf-line perf-sub' : 'perf-line';
  for (const c of children) div.appendChild(c);
  return div;
}

function titleSpan(group: string, text: string): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = `perf-title ${group}`;
  s.textContent = text;
  return s;
}

function unitSpan(text: string): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = 'perf-unit';
  s.textContent = text;
  return s;
}

// A value span: colored by the adaptive gradient for its stat key.
function valSpan(key: string, text: string): HTMLSpanElement {
  const s = document.createElement('span');
  s.textContent = text;
  const color = valueColor(key, parseFloat(text));
  if (color) s.style.color = color;
  return s;
}

function textSpan(text: string, cls?: string): HTMLSpanElement {
  const s = document.createElement('span');
  if (cls) s.className = cls;
  s.textContent = text;
  return s;
}

// Fixed label-column widths (chars) per group, so each group's values land in a
// shared column. Each width is the max of (label length + sub-indent) across
// that group's labeled value lines. Relies on the overlay's `white-space: pre`.
const THROUGHPUT_LABEL_W = 12; // FPS, Chunks/s, ahead/behind-N, All chunks/s
const MAINTHREAD_LABEL_W = 11; // CPU (main)
const COMPUTE_LABEL_W = 10; // Compute, Paint, Worker N
const MEMORY_LABEL_W = 9; // Cache, Est cache, Mem
const JANK_LABEL_W = 5; // Jank, Max

// Pad a label to a fixed width so its trailing ": value" aligns across lines in
// the same group. `subIndent` is the line's sub-indent in chars (2 for
// .perf-sub); we subtract it so sub-line values reach the same absolute column
// as top-level ones.
function padLabel(label: string, width: number, subIndent = 0): string {
  const pad = Math.max(0, width - subIndent - label.length);
  return label + ' '.repeat(pad);
}

// Order the per-level chunk breakdown (ahead-N / behind-N) to mirror the
// renderer's speculative prerender order for the current "Speculative order"
// setting (zoomLookPriority), reproducing orderSpeculative() in renderer.ts.
// For the 'direction' policy this also follows the live travel direction
// (renderContext.lastZoomDir), so the display tracks both the setting and the
// direction the user is currently zooming. Re-read each window, so the order
// refreshes within ~1s of a setting change.
function levelOf(k: string): number {
  const i = k.indexOf('-');
  return i >= 0 ? Number(k.slice(i + 1)) || 0 : 0;
}

function orderBreakdown(entries: { k: string; delta: number }[]): void {
  const policy = settingsEngine.getValue('zoomLookPriority') as string;
  const dir = renderContext.lastZoomDir;
  const ahead = entries.filter((e) => e.k.startsWith('ahead')).sort((a, b) => levelOf(a.k) - levelOf(b.k));
  const behind = entries.filter((e) => e.k.startsWith('behind')).sort((a, b) => levelOf(a.k) - levelOf(b.k));
  const aN = ahead.length;
  const bN = behind.length;
  const seq: string[] = [];
  let ai = 0;
  let bi = 0;
  if (policy === 'ahead') {
    for (let i = 0; i < aN; i++) seq.push(ahead[i].k);
    for (let i = 0; i < bN; i++) seq.push(behind[i].k);
  } else if (policy === 'behind') {
    for (let i = 0; i < bN; i++) seq.push(behind[i].k);
    for (let i = 0; i < aN; i++) seq.push(ahead[i].k);
  } else if (policy === 'distance') {
    const maxDist = Math.max(aN, bN);
    for (let d = 1; d <= maxDist; d += 1) {
      const aHere = ai === d - 1 && ai < aN;
      const bHere = bi === d - 1 && bi < bN;
      if (aHere) seq.push(ahead[ai++].k);
      if (bHere) seq.push(behind[bi++].k);
    }
  } else {
    // 'direction' (default): boost the nearest travel-side level, then interleave
    // by distance with the travel side first at each distance.
    if (dir === 'in' && aN > 0) { seq.push(ahead[ai++].k); }
    else if (dir === 'out' && bN > 0) { seq.push(behind[bi++].k); }
    const maxDist = Math.max(aN, bN);
    for (let d = 1; d <= maxDist; d += 1) {
      const aHere = ai === d - 1 && ai < aN;
      const bHere = bi === d - 1 && bi < bN;
      if (aHere && bHere) {
        if (dir === 'out') { seq.push(behind[bi++].k); seq.push(ahead[ai++].k); }
        else { seq.push(ahead[ai++].k); seq.push(behind[bi++].k); }
      } else if (aHere) { seq.push(ahead[ai++].k); }
      else if (bHere) { seq.push(behind[bi++].k); }
    }
  }
  const rank = new Map(seq.map((k, i) => [k, i]));
  entries.sort((a, b) => (rank.get(a.k) ?? 0) - (rank.get(b.k) ?? 0));
}

function startMetricsLoop(): void {
  if (metricsTimerId !== null) return;

  const updateMetrics = (): void => {
    if (!perfOverlay || perfOverlay.style.display === 'none') {
      metricsTimerId = requestAnimationFrame(updateMetrics);
      return;
    }

    frameCount++;
    const now = performance.now();

    if (now - lastMetricsTime >= 1000) {
      const windowMs = now - lastMetricsTime;
      const fps = (frameCount * 1000) / windowMs;
      // Primary-layer (on-screen) chunks fully computed AND painted this window.
      const chunksPerSec = ((getPrimaryTileCount() - lastPrimaryTiles) * 1000) / windowMs;
      lastPrimaryTiles = getPrimaryTileCount();
      // ALL completed chunks this window (primary + look-ahead + look-behind).
      const totalChunksPerSec = ((getTotalTileCount() - lastTotalTiles) * 1000) / windowMs;
      lastTotalTiles = getTotalTileCount();
      // Per-level chunk breakdown (screen / ahead-N / behind-N), ordered to
      // mirror the "Speculative order" setting (see orderBreakdown).
      const bd = getChunkBreakdown();
      const bdEntries = Object.keys(bd)
        .filter((k) => k !== 'screen')
        .map((k) => ({
          k,
          delta: (bd[k] - (lastChunkBreakdown[k] ?? 0)) * 1000 / windowMs,
        }));
      orderBreakdown(bdEntries);
      lastChunkBreakdown = bd;
      // Worker compute time in this window, normalized to ms-per-second. This is
      // the real, measured CPU proxy for the app — the fractal math runs in the
      // workers, so this dominates actual CPU usage.
      const computeMsPerSec = ((getWorkerComputeMs() - lastWorkerComputeMs) * 1000) / windowMs;
      lastWorkerComputeMs = getWorkerComputeMs();
      // Main-thread paint time (canvas compositing commands issued on the main
      // thread), normalized to ms-per-second — the counterpart to worker Compute.
      const paintMsPerSec = ((getPaintMs() - lastPaintMs) * 1000) / windowMs;
      lastPaintMs = getPaintMs();
      // Per-worker compute, diffed against the previous window.
      const breakdown = getWorkerComputeBreakdown();
      if (breakdown.length !== lastWorkerBreakdown.length) {
        lastWorkerBreakdown = breakdown.map(() => 0);
      }
      const workerEntries = breakdown
        .map((total, i) => ({
          i,
          perSec: (total - (lastWorkerBreakdown[i] ?? 0)) * 1000 / windowMs,
        }));
      lastWorkerBreakdown = breakdown;
      const memMb = agentMemoryMb;
      const memSource = agentMemorySource;
      const cacheTiles = cacheSize();
      const colorTiles = colorCacheCount();

      // Record this window's samples for the adaptive value gradient, then build
      // the overlay from colored spans: titles are bold + group-colored, values
      // are graded green→yellow→red by good/bad direction, units are muted. Neutral
      // stats (Compute/Worker/Cache/Est cache/Mem) are left uncolored.
      recordStat('fps', fps);
      recordStat('chunks', chunksPerSec);
      recordStat('allChunks', totalChunksPerSec);
      recordStat('cpu', cpuPercent);
      recordStat('paint', paintMsPerSec);
      recordStat('jankCount', jankAccumCount);
      recordStat('jankMax', jankAccumMaxMs);
      for (const w of workerEntries) recordStat(`worker${w.i}`, w.perSec, 'high', true);

      const overlay = perfOverlay;
      overlay.replaceChildren();

      // --- Throughput ---
      overlay.appendChild(statLine(false, [
        sparklineFor('fps', fps, 'grp-throughput'),
        titleSpan('grp-compute', padLabel('FPS', THROUGHPUT_LABEL_W)),
        textSpan(': '),
        valSpan('fps', fps.toFixed(1)),
      ]));
      overlay.appendChild(statLine(false, [
        sparklineFor('chunks', chunksPerSec, 'grp-throughput'),
        titleSpan('grp-throughput', padLabel('Chunks/s', THROUGHPUT_LABEL_W)),
        textSpan(': '),
        valSpan('chunks', chunksPerSec.toFixed(1)),
      ]));
      // Per-level chunk breakdown — subsection of Chunks/s. Each level gets its
      // own adaptive baseline (lazy tracker) since a single level's rate is
      // normally a fraction of the total chunks/s.
      for (const e of bdEntries) {
        recordStat(`level-${e.k}`, e.delta, 'high');
        overlay.appendChild(statLine(true, [
          sparklineFor(`level-${e.k}`, e.delta, 'grp-throughput'),
          titleSpan('grp-throughput', padLabel(e.k, THROUGHPUT_LABEL_W, 2)),
          textSpan(': '),
          valSpan(`level-${e.k}`, e.delta.toFixed(1)),
          unitSpan('/s'),
        ]));
      }
      overlay.appendChild(statLine(false, [
        sparklineFor('allChunks', totalChunksPerSec, 'grp-throughput'),
        titleSpan('grp-throughput', padLabel('All chunks/s', THROUGHPUT_LABEL_W)),
        textSpan(': '),
        valSpan('allChunks', totalChunksPerSec.toFixed(1)),
      ]));

      // --- Main-thread load ---
      overlay.appendChild(statLine(false, [
        sparklineFor('cpu', cpuPercent, 'grp-mainthread'),
        titleSpan('grp-mainthread', padLabel('CPU (main)', MAINTHREAD_LABEL_W)),
        textSpan(': '),
        valSpan('cpu', cpuPercent.toFixed(1)),
        unitSpan('%'),
      ]));

      // --- Compute (Paint + Worker are indented subsections) ---
      overlay.appendChild(statLine(false, [
        sparklineFor('compute', computeMsPerSec, 'grp-compute'),
        titleSpan('grp-compute', padLabel('Compute', COMPUTE_LABEL_W)),
        textSpan(': '),
        textSpan(`${computeMsPerSec.toFixed(0)}`),
        unitSpan(' ms/s'),
        textSpan(` (${(computeMsPerSec / 10).toFixed(0)}% of time)`),
      ]));
      overlay.appendChild(statLine(true, [
        sparklineFor('paint', paintMsPerSec, 'grp-compute'),
        titleSpan('grp-compute', padLabel('Paint', COMPUTE_LABEL_W, 2)),
        textSpan(': '),
        valSpan('paint', paintMsPerSec.toFixed(0)),
        unitSpan(' ms/s'),
        textSpan(` (${(paintMsPerSec / 10).toFixed(0)}% of time)`),
      ]));
      for (const w of workerEntries) {
        overlay.appendChild(statLine(true, [
          sparklineFor(`worker${w.i}`, w.perSec, 'grp-compute'),
          titleSpan('grp-compute', padLabel(`Worker ${w.i}`, COMPUTE_LABEL_W, 2)),
          textSpan(': '),
          valSpan(`worker${w.i}`, w.perSec.toFixed(0)),
          unitSpan(' ms/s'),
        ]));
      }

      // --- Memory ---
      const estCacheMb = estimateCacheMb();
      overlay.appendChild(statLine(false, [
        sparklineFor('cache', cacheTiles, 'grp-memory'),
        titleSpan('grp-memory', padLabel('Cache', MEMORY_LABEL_W)),
        textSpan(': '),
        textSpan(`${cacheTiles}`),
        unitSpan(` tiles (color: ${colorTiles})`),
      ]));
      overlay.appendChild(statLine(false, [
        sparklineFor('estcache', estCacheMb, 'grp-memory'),
        titleSpan('grp-memory', padLabel('Est cache', MEMORY_LABEL_W)),
        textSpan(': '),
        textSpan(`${estCacheMb.toFixed(1)}`),
        unitSpan(' MB'),
      ]));
      if (memMb !== null) {
        // (S) = Specific: measureUserAgentSpecificMemory, full agent memory (incl. workers).
        // (M) = Main: performance.memory fallback, main-thread JS heap only.
        const tag = memSource === 'agent' ? 'S' : 'M';
        overlay.appendChild(statLine(false, [
          sparklineFor('mem', memMb, 'grp-memory'),
          titleSpan('grp-memory', padLabel('Mem', MEMORY_LABEL_W)),
          textSpan(': '),
          textSpan(`${memMb}`),
          unitSpan(` MB (${tag})`),
        ]));
      } else {
        overlay.appendChild(statLine(false, [
          titleSpan('grp-memory', padLabel('Mem', MEMORY_LABEL_W)),
          textSpan(': n/a'),
        ]));
      }

      // --- Jank (main-thread blockage) ---
      if (jankSupported !== true) {
        overlay.appendChild(statLine(false, [
          titleSpan('grp-jank', padLabel('Jank', JANK_LABEL_W)),
          textSpan(': n/a'),
        ]));
      } else {
        overlay.appendChild(statLine(false, [
          sparklineFor('jankCount', jankAccumCount, 'grp-jank'),
          titleSpan('grp-jank', padLabel('Jank', JANK_LABEL_W)),
          textSpan(': '),
          valSpan('jankCount', String(jankAccumCount)),
        ]));
        // "max" is its own line (one sparkline per line), indented to align with
        // the Jank group's other sub-items.
        overlay.appendChild(statLine(true, [
          sparklineFor('jankMax', jankAccumMaxMs, 'grp-jank'),
          titleSpan('grp-jank', padLabel('Max', JANK_LABEL_W, 2)),
          textSpan(': '),
          valSpan('jankMax', jankAccumMaxMs.toFixed(0)),
          unitSpan('ms'),
        ]));
        if (jankCulpritToShow) {
          // Split "<fn> @ <path>" into lines: the "Main culprit" label line keeps
          // the optional "(stale)" tag, the function drops to its own line, and
          // the path drops to its own line after that — all indented under Jank.
          const atIdx = jankCulpritToShow.indexOf(' @ ');
          const fn = atIdx >= 0 ? jankCulpritToShow.slice(0, atIdx) : jankCulpritToShow;
          const srcPath = atIdx >= 0 ? jankCulpritToShow.slice(atIdx + 3) : '';
          overlay.appendChild(statLine(true, [
            titleSpan('grp-jank', 'Main culprit'),
            textSpan(jankCulpritStale ? ': (stale)' : ':'),
          ]));
          overlay.appendChild(statLine(true, [textSpan(fn, 'jank-fn')]));
          if (srcPath) {
            overlay.appendChild(statLine(true, [textSpan(srcPath, 'jank-path')]));
          }
        }
      }
      // Reset per-window accumulators. NOTE: jankOffenders / jankTooltipText are
      // intentionally NOT cleared here — they accumulate for the application
      // lifetime. The tooltip content is rebuilt lazily on hover (see onJankTooltipMouseMove:
      // buildJankTooltip runs only if tooltipDirty is true, which is set in recordJank).
      // Also mark tooltip rect stale since overlay content (height) changed.
      tooltipRectStale = true;
      frameCount = 0;
      lastMetricsTime = now;
      jankAccumCount = 0;
      jankAccumMaxMs = 0;
      const hasNewCulprit = jankAccumCulpritCurrent !== null && jankAccumCulpritCurrent !== jankCulpritToShow;
      if (hasNewCulprit) {
        jankCulpritToShow = jankAccumCulpritCurrent;
        jankAccumCulpritCurrent = null;
        jankCulpritStale = false;
        // Schedule clearing JANK_CULPRIT_DISPLAY_MS after this culprit was set.
        scheduleJankCulpritClear();
      } else if (!jankAccumCulpritCurrent && jankCulpritToShow) {
        // No new culprit this window – mark the existing culprit as stale (visual
        // only). We must NOT reschedule the clear timer here: doing so would push
        // the expiry forward each second and the culprit would never clear (it
        // would display for as long as the overlay stays open, far past the
        // intended JANK_CULPRIT_DISPLAY_MS). The timer set above expires the
        // display JANK_CULPRIT_DISPLAY_MS after the last culprit was shown.
        jankCulpritStale = true;
      }
    }

    metricsTimerId = requestAnimationFrame(updateMetrics);
  };

  metricsTimerId = requestAnimationFrame(updateMetrics);
}

// Show/hide the performance overlay. Starts the metric loops on show and stops
// the CPU probe on hide (the rAF loop idles cheaply while hidden).
export function showPerformanceOverlay(): void {
  if (!perfOverlay) createPerformanceOverlay();
  perfOverlay!.style.display = 'block';
  frameCount = 0;
  lastWorkerComputeMs = getWorkerComputeMs();
  lastWorkerBreakdown = getWorkerComputeBreakdown();
  lastPrimaryTiles = getPrimaryTileCount();
  lastTotalTiles = getTotalTileCount();
  lastChunkBreakdown = getChunkBreakdown();
  lastPaintMs = getPaintMs();
  lastMetricsTime = performance.now();
  startMetricsLoop();
  startCpuProbe();
  startMemorySampler();
  startJankObserver();
  jankCulpritStale = false; // fresh overlay = no stale indicator yet
  window.addEventListener('mousemove', onJankTooltipMouseMove);
  // Prep tooltip layout caching
  tooltipRect = null;
  tooltipRectStale = true; // need to measure after any layout change
  window.addEventListener('resize', () => { tooltipRectStale = true; });
  window.addEventListener('scroll', () => { tooltipRectStale = true; });
}

function hidePerformanceOverlay(): void {
  if (perfOverlay) perfOverlay.style.display = 'none';
  window.removeEventListener('mousemove', onJankTooltipMouseMove);
  hideJankTooltip();
  stopCpuProbe();
  stopMemorySampler();
  stopJankObserver();
}

// Key handler for performance overlay toggle (`` ` `` key)
window.addEventListener('keydown', (event) => {
  if (event.key === '`' && !event.repeat) {
    if (!perfOverlay || perfOverlay.style.display === 'none') {
      showPerformanceOverlay();
    } else {
      hidePerformanceOverlay();
    }
  }
});
