import { BenchmarkCase } from '../types';
import { state, dragState, renderContext } from '../state';
import { settingsEngine } from '../settings/instance';
import { requestRender, startPanPreview, updatePanPreview, endPanPreview } from '../services/renderer';
import {
  beginSmoothZoom,
  applyZoom,
  resetView,
  jumpTo,
  getWheelZoomFactor,
  getClickZoomFactor,
} from '../services/zoom-manager';
import { exportLogs } from '../services/logger';
import { markDebug } from '../utils/debug';
import { truncateNumericString } from '../utils/format';
import {
  canvas,
  settingsContainer,
  logCountOutput,
  lastRenderOutput,
  zoomOutput,
  activeIterationsOutput,
  stepOutput,
  renderButton,
  exportLogsButton,
  benchmarkButton,
  renderStatusDot,
  renderStatusText,
  renderStatusTimer,
  navCard,
  navSentinel,
  navReInput,
  navImInput,
  navZoomInput,
  navOriginButton,
  navCopyButton,
  navPasteButton,
  navCurrentBlock,
  navCurrentToggle,
  navCurrentSummary,
  navDestinationBlock,
  navDestinationToggle,
  navDestinationSummary,
  destReInput,
  destImInput,
  destZoomInput,
  destJumpButton,
  destFlyToButton,
} from './dom';
import { showPerformanceOverlay } from './perf-overlay';
import { beginFlyTo } from '../services/fly-to';

function getWidth(): number {
  return settingsEngine.getValue('width') as number;
}

function getHeight(): number {
  return settingsEngine.getValue('height') as number;
}

function formatMs(value: number) {
  return `${value.toFixed(1)} ms`;
}

export function updateStats() {
  lastRenderOutput.textContent = formatMs(state.lastRenderMs);
  zoomOutput.textContent = `${state.view.zoom.toFixed(2)}×`;
  activeIterationsOutput.textContent = `${settingsEngine.getValue('maxIterations')}`;
  stepOutput.textContent = `${state.lastSteps.toLocaleString()}`;
  updateNavigatorReadout();
}

// Full-precision string for a coordinate. Doubles carry ~15-16 significant
// digits; toString() emits them without trailing noise, which is exactly the
// "long" value users want to read/copy at deep zoom.
function formatCoord(value: number): string {
  return Number.isFinite(value) ? String(value) : '';
}

// Live readout of the current view into the (read-only) Current fields. Skips
// the field under the caret, and preserves a pending edit unless the view moved.
const navDirtyFields = new Set<HTMLInputElement>();

function syncNavField(input: HTMLInputElement, value: number, force: boolean) {
  // Never write into the field under the caret, and skip user-edited fields
  // unless the view genuinely moved (force).
  if (document.activeElement === input) {
    return;
  }
  if (navDirtyFields.has(input) && !force) {
    return;
  }
  input.value = formatCoord(value);
  input.classList.remove('nav-invalid');
  navDirtyFields.delete(input);
}

// Mirror the live view into the navigator inputs. `force` (real view movement)
// overrides pending edits; the default (render-complete) preserves them.
export function updateNavigatorReadout(force = false) {
  syncNavField(navReInput, state.view.centerRe, force);
  syncNavField(navImInput, state.view.centerIm, force);
  syncNavField(navZoomInput, state.view.zoom, force);
  renderCurrentSummary();
}

// Build the one-line collapsed summary for a coordinate triple, e.g.
// "Re -0.7269…  Im 0.1889…  Z 1.2e4×". Each field is truncated independently
// (see truncateNumericString) so nearby points keep their distinguishing tail.
function buildCollapsedSummary(re: number, im: number, zoom: number): string {
  const reStr = truncateNumericString(formatCoord(re));
  const imStr = truncateNumericString(formatCoord(im));
  // Scientific notation for zoom, dropping the '+' so it reads "1.2e4×".
  const zoomStr = truncateNumericString(`${zoom.toExponential(1).replace('e+', 'e')}×`);
  return `Re ${reStr}  Im ${imStr}  Z ${zoomStr}`;
}

function renderCurrentSummary(): void {
  navCurrentSummary.textContent = buildCollapsedSummary(
    state.view.centerRe,
    state.view.centerIm,
    state.view.zoom,
  );
}

// Refresh the Destination block's collapsed summary from whatever is currently
// typed. Invalid/empty fields fall back to an em dash so the line stays aligned.
function renderDestinationSummary(): void {
  const re = Number.parseFloat(destReInput.value);
  const im = Number.parseFloat(destImInput.value);
  const zoom = Number.parseFloat(destZoomInput.value);
  if (!Number.isFinite(re) || !Number.isFinite(im) || !Number.isFinite(zoom)) {
    navDestinationSummary.textContent = '—';
    return;
  }
  navDestinationSummary.textContent = buildCollapsedSummary(re, im, zoom);
}

// Collapse/expand one nav block via a plain class toggle (mirrors the existing
// .is-stuck pattern — no animation library). The CSS `grid-template-rows`
// transition does the height animation; we only flip the class + aria state.
function setBlockCollapsed(block: HTMLElement, toggle: HTMLButtonElement, collapsed: boolean): void {
  block.classList.toggle('is-collapsed', collapsed);
  toggle.setAttribute('aria-expanded', String(!collapsed));
}

function toggleBlock(block: HTMLElement, toggle: HTMLButtonElement): void {
  setBlockCollapsed(block, toggle, !block.classList.contains('is-collapsed'));
}

// Parse a single coordinate field. Marks the field invalid (and returns null)
// when the value isn't a finite number, so Jump can bail without moving.
function readCoordField(input: HTMLInputElement, opts: { positive?: boolean } = {}): number | null {
  const parsed = Number.parseFloat(input.value.trim());
  const ok = Number.isFinite(parsed) && (!opts.positive || parsed > 0);
  input.classList.toggle('nav-invalid', !ok);
  return ok ? parsed : null;
}

// Reads the staged Destination fields — the coordinate the user is composing as
// a travel target, independent of the live view — and jumps there instantly.
function performDestinationJump() {
  const re = readCoordField(destReInput);
  const im = readCoordField(destImInput);
  const zoom = readCoordField(destZoomInput, { positive: true });
  if (re === null || im === null || zoom === null) {
    return;
  }
  destReInput.blur();
  destImInput.blur();
  destZoomInput.blur();
  jumpTo(re, im, zoom);
}

// Reads the staged Destination fields and flies there with the animated camera
// flight (beginFlyTo) — as opposed to performDestinationJump, which snaps
// instantly via jumpTo.
function performFlyTo(): void {
  const re = readCoordField(destReInput);
  const im = readCoordField(destImInput);
  const zoom = readCoordField(destZoomInput, { positive: true });
  if (re === null || im === null || zoom === null) {
    return;
  }
  beginFlyTo({ centerRe: re, centerIm: im, zoom });
}

async function copyCoordinates() {
  const text = `${formatCoord(state.view.centerRe)}, ${formatCoord(state.view.centerIm)}, ${formatCoord(state.view.zoom)}`;
  try {
    await navigator.clipboard.writeText(text);
    flashButton(navCopyButton, 'Copied');
  } catch {
    flashButton(navCopyButton, 'Failed');
  }
}

// Pull the first three finite numbers out of arbitrary pasted text (tolerates
// labels, parens, and scientific notation) and load them into the Destination
// block. The Destination block is the staged travel target, so pasting a
// coordinate you found elsewhere lands there — the user then Jump or Deep Dive.
async function pasteCoordinates() {
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch {
    flashButton(navPasteButton, 'Failed');
    return;
  }
  const matches = text.match(/-?\d+\.?\d*(?:[eE][-+]?\d+)?/g) ?? [];
  const nums = matches.map(Number).filter((n) => Number.isFinite(n));
  if (nums.length < 3 || !(nums[2] > 0)) {
    flashButton(navPasteButton, 'Bad data');
    return;
  }
  // Stage into the Destination fields and expand the block so the user sees the
  // pasted values before committing.
  destReInput.value = formatCoord(nums[0]);
  destImInput.value = formatCoord(nums[1]);
  destZoomInput.value = formatCoord(nums[2]);
  setBlockCollapsed(navDestinationBlock, navDestinationToggle, false);
  renderDestinationSummary();
  // Hand focus to the Destination Jump so the user can commit with a single
  // Enter/Space press instead of having to click the button.
  destJumpButton.focus();
}

function flashButton(button: HTMLButtonElement, label: string) {
  const original = button.textContent;
  button.textContent = label;
  // Named (not an inline arrow) so the label-restore timer stays identifiable
  // in the Jank profiler.
  function restoreButtonLabel(): void {
    button.textContent = original;
  }
  window.setTimeout(restoreButtonLabel, 1100);
}

// Toggle a shadow on the navigator once it pins to the top of the scrolling
// sidebar. The zero-height sentinel sits just above the card; when it leaves the
// panel's top edge the card is stuck.
function initNavigatorSticky() {
  if (typeof IntersectionObserver === 'undefined') {
    return;
  }
  // Toggle the stuck shadow when the zero-height sentinel leaves the panel's
  // top edge. Named (not an inline arrow) to stay identifiable in the Jank
  // profiler.
  function onNavigatorSentinelIntersection([entry]: IntersectionObserverEntry[]): void {
    navCard.classList.toggle('is-stuck', !entry.isIntersecting);
  }
  const observer = new IntersectionObserver(
    onNavigatorSentinelIntersection,
    { root: navCard.parentElement, threshold: 0 },
  );
  observer.observe(navSentinel);
}

export function formatRenderTimerValue(value: number) {
  return `${value.toFixed(1)} ms`;
}

export function stopRenderTimer() {
  if (renderContext.renderTimerFrame !== null) {
    cancelAnimationFrame(renderContext.renderTimerFrame);
    renderContext.renderTimerFrame = null;
  }
}

export function updateRenderStatus(isRendering: boolean) {
  renderStatusDot.classList.toggle('completed', !isRendering);
  renderStatusDot.classList.toggle('rendering', isRendering);
  renderStatusText.textContent = isRendering ? 'Rendering...' : 'Done';

  if (isRendering) {
    renderContext.renderTimerStart = performance.now();
    const tick = () => {
      if (renderContext.renderTimerStart === null) {
        return;
      }
      const elapsed = performance.now() - renderContext.renderTimerStart;
      renderStatusTimer.textContent = `| ${formatRenderTimerValue(elapsed)}`;
      renderContext.renderTimerFrame = requestAnimationFrame(tick);
    };
    stopRenderTimer();
    renderContext.renderTimerFrame = requestAnimationFrame(tick);
  } else {
    if (renderContext.renderTimerStart !== null) {
      const elapsed = performance.now() - renderContext.renderTimerStart;
      renderStatusTimer.textContent = `| ${formatRenderTimerValue(elapsed)}`;
    }
    stopRenderTimer();
  }
}

export function syncCanvasSize() {
  if (settingsEngine.getValue('fillViewport') as boolean) {
    const viewportWidth = Math.max(320, window.innerWidth - 340);
    const viewportHeight = Math.max(240, window.innerHeight - 32);
    settingsEngine.setValue('width', viewportWidth);
    settingsEngine.setValue('height', viewportHeight);
  }

  const width = getWidth();
  const height = getHeight();
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

export function mountSettings() {
  settingsEngine.mount(settingsContainer);
}

export function handlePointerDown(event: MouseEvent) {
  dragState.active = true;
  dragState.moved = false;
  dragState.startX = event.clientX;
  dragState.startY = event.clientY;
  dragState.startCenterRe = state.view.centerRe;
  dragState.startCenterIm = state.view.centerIm;
  canvas.style.cursor = 'grabbing';
  startPanPreview();
}

export function handlePointerMove(event: MouseEvent) {
  if (!dragState.active) {
    return;
  }

  const width = getWidth();
  const height = getHeight();
  const dx = event.clientX - dragState.startX;
  const dy = event.clientY - dragState.startY;

  // A drag past a small threshold counts as panning, not clicking — this
  // suppresses the zoom that would otherwise fire on the trailing `click`.
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
    dragState.moved = true;
  }

  const viewWidth = 4 / state.view.zoom;
  const viewHeight = viewWidth * (height / width);
  const scaleRe = viewWidth / width;
  const scaleIm = viewHeight / height;

  state.view.centerRe = dragState.startCenterRe - dx * scaleRe;
  state.view.centerIm = dragState.startCenterIm - dy * scaleIm;
  updatePanPreview();
  updateNavigatorReadout(true); // live pan feedback overrides any pending edits
}

export function handlePointerUp() {
  dragState.active = false;
  canvas.style.cursor = 'grab';
  endPanPreview();
}

export function handleWheel(event: WheelEvent) {
  event.preventDefault();
  const factor = getWheelZoomFactor(event.deltaY);
  markDebug('input:wheel', {
    deltaY: event.deltaY,
    factor: Number(factor.toPrecision(8)),
    offsetX: event.offsetX,
    offsetY: event.offsetY,
  });
  if ((settingsEngine.getValue('zoomMode') as 'instant' | 'smooth') === 'smooth') {
    beginSmoothZoom(factor, event.offsetX, event.offsetY);
  } else {
    applyZoom(factor, event.offsetX, event.offsetY);
  }
}

export function handleClick(event: MouseEvent) {
  // If the pointer was dragged (panned), the trailing `click` should not zoom.
  if (dragState.moved) {
    return;
  }

  const zoomMode = settingsEngine.getValue('zoomMode') as 'instant' | 'smooth';

  if (event.button !== 0) {
    const factor = getClickZoomFactor('out');
    markDebug('input:click-out', {
      button: event.button,
      factor: Number(factor.toPrecision(8)),
      offsetX: event.offsetX,
      offsetY: event.offsetY,
    });
    if (zoomMode === 'smooth') {
      beginSmoothZoom(factor, event.offsetX, event.offsetY);
    } else {
      applyZoom(factor, event.offsetX, event.offsetY);
    }
    return;
  }

  const factor = getClickZoomFactor('in');
  markDebug('input:click-in', {
    button: event.button,
    factor: Number(factor.toPrecision(8)),
    offsetX: event.offsetX,
    offsetY: event.offsetY,
  });
  if (zoomMode === 'smooth') {
    beginSmoothZoom(factor, event.offsetX, event.offsetY);
  } else {
    applyZoom(factor, event.offsetX, event.offsetY);
  }
}

export function applyBenchmarkCase(testCase: BenchmarkCase) {
  settingsEngine.setValue('width', testCase.width);
  settingsEngine.setValue('height', testCase.height);
  settingsEngine.setValue('maxIterations', testCase.maxIterations);
  settingsEngine.setValue('gridColumns', testCase.gridColumns);
  settingsEngine.setValue('gridRows', testCase.gridRows);
  settingsEngine.setValue('workerCount', testCase.workerCount);
  settingsEngine.setValue('chunkMode', testCase.chunkMode);
  settingsEngine.setValue('zoomMode', testCase.zoomMode);
  syncCanvasSize();
  requestRender();
}

export function runBenchmarkSweep() {
  const cases: BenchmarkCase[] = [
    { label: 'baseline', width: 800, height: 600, maxIterations: 220, gridColumns: 4, gridRows: 4, workerCount: 4, chunkMode: 'rectangles', zoomMode: 'instant' },
    { label: 'high-iterations', width: 1000, height: 700, maxIterations: 440, gridColumns: 4, gridRows: 4, workerCount: 4, chunkMode: 'rectangles', zoomMode: 'instant' },
    { label: 'no-chunking', width: 1000, height: 700, maxIterations: 440, gridColumns: 1, gridRows: 1, workerCount: 1, chunkMode: 'none', zoomMode: 'instant' },
    { label: 'larger-chunks', width: 1250, height: 850, maxIterations: 440, gridColumns: 2, gridRows: 2, workerCount: 8, chunkMode: 'rectangles', zoomMode: 'instant' },
  ];

  let index = 0;

  const nextCase = () => {
    if (index >= cases.length) {
      renderContext.benchmarkTimer = null;
      return;
    }

    const next = cases[index];
    index += 1;
    applyBenchmarkCase(next);
    renderContext.benchmarkTimer = window.setTimeout(nextCase, 1400);
  };

  if (renderContext.benchmarkTimer !== null) {
    window.clearTimeout(renderContext.benchmarkTimer);
  }
  nextCase();
}

export function updateLogCountText(count: number) {
  logCountOutput.textContent = String(count);
}

// --- Control-wiring helpers ------------------------------------------------
// Named handlers (rather than inline arrows) so every control's event stays
// identifiable in the Jank profiler instead of appearing as `(anonymous)`.

function handleRenderButtonClick(): void {
  requestRender();
}

function handleExportLogsButtonClick(): void {
  exportLogs();
}

function handleBenchmarkButtonClick(): void {
  runBenchmarkSweep();
}

// Right-click zooms out (native context menu suppressed). Mirrors the right-
// button branch of handleClick; ignored if the press was a drag (pan).
function handleCanvasContextMenu(event: MouseEvent): void {
  event.preventDefault();
  if (dragState.moved) return;
  const zoomMode = settingsEngine.getValue('zoomMode') as 'instant' | 'smooth';
  const factor = getClickZoomFactor('out');
  if (zoomMode === 'smooth') {
    beginSmoothZoom(factor, event.offsetX, event.offsetY);
  } else {
    applyZoom(factor, event.offsetX, event.offsetY);
  }
}

export function wireControls() {
  renderButton.addEventListener('click', handleRenderButtonClick);
  exportLogsButton.addEventListener('click', handleExportLogsButtonClick);
  benchmarkButton.addEventListener('click', handleBenchmarkButtonClick);

  canvas.addEventListener('mousedown', handlePointerDown);
  window.addEventListener('mousemove', handlePointerMove);
  window.addEventListener('mouseup', handlePointerUp);
  canvas.addEventListener('wheel', handleWheel, { passive: false });
  canvas.addEventListener('click', handleClick);
  // Disable default context menu and handle right-click to zoom out.
  canvas.addEventListener('contextmenu', handleCanvasContextMenu);

  navOriginButton.addEventListener('click', resetView);
  navCopyButton.addEventListener('click', copyCoordinates);
  navPasteButton.addEventListener('click', pasteCoordinates);

  // Current / Destination collapse toggles (both default to collapsed in HTML).
  navCurrentToggle.addEventListener('click', () => toggleBlock(navCurrentBlock, navCurrentToggle));
  navDestinationToggle.addEventListener('click', () => toggleBlock(navDestinationBlock, navDestinationToggle));

  // Destination block: staged travel target. Jump commits instantly; Fly To
  // animates the camera there (beginFlyTo).
  destJumpButton.addEventListener('click', performDestinationJump);
  destFlyToButton.addEventListener('click', performFlyTo);
  [destReInput, destImInput, destZoomInput].forEach((input) =>
    input.addEventListener('input', renderDestinationSummary),
  );
  navDestinationSummary.textContent = '—';

  initNavigatorSticky();

  // Performance overlay is on by default.
  showPerformanceOverlay();
}