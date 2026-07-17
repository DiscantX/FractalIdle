import { BenchmarkCase } from '../types';
import { state, dragState, renderContext } from '../state';
import { settingsEngine } from '../settings/instance';
import { requestRender, startPanPreview, updatePanPreview, endPanPreview } from '../services/renderer';
import {
  beginSmoothZoom,
  applyZoom,
  resetView,
  getWheelZoomFactor,
  getClickZoomFactor,
} from '../services/zoom-manager';
import { exportLogs } from '../services/logger';
import { markDebug } from '../utils/debug';
import {
  canvas,
  settingsContainer,
  logCountOutput,
  lastRenderOutput,
  zoomOutput,
  activeIterationsOutput,
  stepOutput,
  renderButton,
  resetButton,
  exportLogsButton,
  benchmarkButton,
  renderStatusDot,
  renderStatusText,
  renderStatusTimer,
} from './dom';

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

export function wireControls() {
  renderButton.addEventListener('click', () => requestRender());
  resetButton.addEventListener('click', () => resetView());
  exportLogsButton.addEventListener('click', () => exportLogs());
  benchmarkButton.addEventListener('click', () => runBenchmarkSweep());

  canvas.addEventListener('mousedown', handlePointerDown);
  window.addEventListener('mousemove', handlePointerMove);
  window.addEventListener('mouseup', handlePointerUp);
  canvas.addEventListener('wheel', handleWheel, { passive: false });
  canvas.addEventListener('click', handleClick);
}