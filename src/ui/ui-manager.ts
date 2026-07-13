import { BenchmarkCase, ChunkMode, ColorMode, PaletteName, ColorSpace } from '../types';
import { state, dragState, renderContext } from '../state';
import { requestRender } from '../services/renderer';
import {
  beginSmoothZoom,
  applyZoom,
  resetView,
  getWheelZoomFactor,
  getClickZoomFactor,
} from '../services/zoom-manager';
import { exportLogs } from '../services/logger';
import { markDebug } from '../utils/debug';
import { clamp } from '../utils/math';
import {
  canvas,
  widthInput,
  heightInput,
  iterationsInput,
  iterationsOutput,
  gridColumnsInput,
  gridColumnsOutput,
  gridRowsInput,
  gridRowsOutput,
  workerCountInput,
  workerCountOutput,
  chunkModeInput,
  geometricCullingInput,
  solidGuessingInput,
  zoomModeInput,
  zoomSensitivityInput,
  zoomSensitivityOutput,
  fillViewportInput,
  previewModeInput,
  colorModeInput,
  paletteInput,
  colorCyclesInput,
  colorCyclesOutput,
  reverseColorsInput,
  smoothColoringInput,
  autoAdjustColorsInput,
  paletteMinInput,
  paletteMinOutput,
  paletteMaxInput,
  paletteMaxOutput,
  hueShiftInput,
  hueShiftOutput,
  saturationInput,
  saturationOutput,
  lightnessInput,
  lightnessOutput,
  colorSpaceInput,
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

function formatMs(value: number) {
  return `${value.toFixed(1)} ms`;
}

export function updateStats() {
  lastRenderOutput.textContent = formatMs(state.lastRenderMs);
  zoomOutput.textContent = `${state.view.zoom.toFixed(2)}×`;
  activeIterationsOutput.textContent = `${state.maxIterations}`;
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
  if (state.fillViewport) {
    const viewportWidth = Math.max(320, window.innerWidth - 340);
    const viewportHeight = Math.max(240, window.innerHeight - 32);
    state.width = viewportWidth;
    state.height = viewportHeight;
    widthInput.value = String(state.width);
    heightInput.value = String(state.height);
  }

  canvas.width = state.width;
  canvas.height = state.height;
  canvas.style.width = `${state.width}px`;
  canvas.style.height = `${state.height}px`;
}

export function syncControlValues() {
  widthInput.value = String(state.width);
  heightInput.value = String(state.height);
  iterationsInput.value = String(state.maxIterations);
  gridColumnsInput.value = String(state.gridColumns);
  gridRowsInput.value = String(state.gridRows);
  workerCountInput.value = String(state.workerCount);
  chunkModeInput.value = state.chunkMode;
  solidGuessingInput.checked = state.solidGuessing;
  geometricCullingInput.checked = state.geometricCulling;
  zoomModeInput.value = state.zoomMode;
  zoomSensitivityInput.value = String(state.zoomSensitivity);
  fillViewportInput.checked = state.fillViewport;
  previewModeInput.value = state.previewMode;
  colorModeInput.value = state.colorMode;
  paletteInput.value = state.palette;
  colorCyclesInput.value = String(state.colorCycles);
  reverseColorsInput.checked = state.reverseColors;
  smoothColoringInput.checked = state.smoothColoring;
  autoAdjustColorsInput.checked = state.autoAdjustColors;
  paletteMinInput.value = String(state.paletteMinIterations);
  paletteMaxInput.value = String(state.paletteMaxIterations);
  hueShiftInput.value = String(state.hueShift);
  saturationInput.value = String(state.saturation);
  lightnessInput.value = String(state.lightness);
  colorSpaceInput.value = state.colorSpace;
  iterationsOutput.value = String(state.maxIterations);
  gridColumnsOutput.value = String(state.gridColumns);
  gridRowsOutput.value = String(state.gridRows);
  workerCountOutput.value = String(state.workerCount);
  zoomSensitivityOutput.value = state.zoomSensitivity.toFixed(1);
  colorCyclesOutput.value = String(state.colorCycles);
  paletteMinOutput.value = String(state.paletteMinIterations);
  paletteMaxOutput.value = String(state.paletteMaxIterations);
  hueShiftOutput.value = String(state.hueShift);
  saturationOutput.value = state.saturation.toFixed(2);
  lightnessOutput.value = state.lightness.toFixed(2);
}

export function handlePointerDown(event: MouseEvent) {
  dragState.active = true;
  dragState.startX = event.clientX;
  dragState.startY = event.clientY;
  dragState.startCenterRe = state.view.centerRe;
  dragState.startCenterIm = state.view.centerIm;
  canvas.style.cursor = 'grabbing';
}

export function handlePointerMove(event: MouseEvent) {
  if (!dragState.active) {
    return;
  }

  const dx = event.clientX - dragState.startX;
  const dy = event.clientY - dragState.startY;
  const viewWidth = 4 / state.view.zoom;
  const viewHeight = viewWidth * (state.height / state.width);
  const scaleRe = viewWidth / state.width;
  const scaleIm = viewHeight / state.height;

  state.view.centerRe = dragState.startCenterRe - dx * scaleRe;
  state.view.centerIm = dragState.startCenterIm - dy * scaleIm;
  requestRender();
}

export function handlePointerUp() {
  dragState.active = false;
  canvas.style.cursor = 'grab';
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
  if (state.zoomMode === 'smooth') {
    beginSmoothZoom(factor, event.offsetX, event.offsetY);
  } else {
    applyZoom(factor, event.offsetX, event.offsetY);
  }
}

export function handleClick(event: MouseEvent) {
  if (event.button !== 0) {
    const factor = getClickZoomFactor('out');
    markDebug('input:click-out', {
      button: event.button,
      factor: Number(factor.toPrecision(8)),
      offsetX: event.offsetX,
      offsetY: event.offsetY,
    });
    if (state.zoomMode === 'smooth') {
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
  if (state.zoomMode === 'smooth') {
    beginSmoothZoom(factor, event.offsetX, event.offsetY);
  } else {
    applyZoom(factor, event.offsetX, event.offsetY);
  }
}

export function applyBenchmarkCase(testCase: BenchmarkCase) {
  state.width = testCase.width;
  state.height = testCase.height;
  state.maxIterations = testCase.maxIterations;
  state.gridColumns = testCase.gridColumns;
  state.gridRows = testCase.gridRows;
  state.workerCount = testCase.workerCount;
  state.chunkMode = testCase.chunkMode;
  state.zoomMode = testCase.zoomMode;
  syncControlValues();
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
  widthInput.addEventListener('change', () => {
    state.width = Math.max(200, Number(widthInput.value));
    state.fillViewport = false;
    fillViewportInput.checked = false;
    widthInput.value = String(state.width);
    syncCanvasSize();
    requestRender();
  });

  heightInput.addEventListener('change', () => {
    state.height = Math.max(200, Number(heightInput.value));
    state.fillViewport = false;
    fillViewportInput.checked = false;
    heightInput.value = String(state.height);
    syncCanvasSize();
    requestRender();
  });

  geometricCullingInput.addEventListener('change', () => {
    state.geometricCulling = geometricCullingInput.checked;
    requestRender();
  });

  const syncRangePair = (
    slider: HTMLInputElement,
    valueInput: HTMLInputElement,
    min: number,
    max: number,
    updateState: (value: number) => void,
    rerender: boolean
  ) => {
    const syncFromSlider = () => {
      const nextValue = clamp(Number(slider.value), min, max);
      slider.value = String(nextValue);
      valueInput.value = String(nextValue);
      updateState(nextValue);
      if (rerender) {
        requestRender();
      }
    };

    const syncFromValue = () => {
      const nextValue = clamp(Number(valueInput.value), min, max);
      slider.value = String(nextValue);
      valueInput.value = String(nextValue);
      updateState(nextValue);
      if (rerender) {
        requestRender();
      }
    };

    slider.addEventListener('input', syncFromSlider);
    slider.addEventListener('change', syncFromSlider);
    valueInput.addEventListener('input', syncFromValue);
    valueInput.addEventListener('change', syncFromValue);
  };

  syncRangePair(iterationsInput, iterationsOutput, 32, 2000, (value) => {
    state.maxIterations = value;
  }, true);

  syncRangePair(gridColumnsInput, gridColumnsOutput, 1, 8, (value) => {
    state.gridColumns = value;
  }, true);

  syncRangePair(gridRowsInput, gridRowsOutput, 1, 8, (value) => {
    state.gridRows = value;
  }, true);

  syncRangePair(workerCountInput, workerCountOutput, 1, 8, (value) => {
    state.workerCount = value;
  }, true);

  chunkModeInput.addEventListener('change', () => {
    state.chunkMode = chunkModeInput.value as ChunkMode;
    requestRender();
  });

  zoomModeInput.addEventListener('change', () => {
    state.zoomMode = zoomModeInput.value as 'instant' | 'smooth';
  });

  syncRangePair(zoomSensitivityInput, zoomSensitivityOutput, 0.01, 5, (value) => {
    state.zoomSensitivity = value;
  }, false);

  colorModeInput.addEventListener('change', () => {
    state.colorMode = colorModeInput.value as ColorMode;
    requestRender();
  });

  paletteInput.addEventListener('change', () => {
    state.palette = paletteInput.value as PaletteName;
    requestRender();
  });

  syncRangePair(colorCyclesInput, colorCyclesOutput, 1, 8, (value) => {
    state.colorCycles = value;
  }, true);

  reverseColorsInput.addEventListener('change', () => {
    state.reverseColors = reverseColorsInput.checked;
    requestRender();
  });

  solidGuessingInput.addEventListener('change', () => {
    state.solidGuessing = solidGuessingInput.checked;
    requestRender();
  });

  smoothColoringInput.addEventListener('change', () => {
    state.smoothColoring = smoothColoringInput.checked;
    requestRender();
  });

  autoAdjustColorsInput.addEventListener('change', () => {
    state.autoAdjustColors = autoAdjustColorsInput.checked;
    requestRender();
  });

  syncRangePair(paletteMinInput, paletteMinOutput, 0, 2000, (value) => {
    state.paletteMinIterations = value;
  }, true);

  syncRangePair(paletteMaxInput, paletteMaxOutput, 1, 2000, (value) => {
    state.paletteMaxIterations = value;
  }, true);

  const ensurePaletteBounds = () => {
    const minVal = Number(paletteMinOutput.value);
    const maxVal = Number(paletteMaxOutput.value);
    if (minVal > maxVal) {
      paletteMaxOutput.value = String(minVal);
      paletteMaxInput.value = String(minVal);
      state.paletteMaxIterations = minVal;
    }
    if (Number(paletteMaxOutput.value) < Number(paletteMinOutput.value)) {
      paletteMinOutput.value = paletteMaxOutput.value;
      paletteMinInput.value = paletteMaxInput.value;
      state.paletteMinIterations = Number(paletteMinOutput.value);
    }
  };

  paletteMinOutput.addEventListener('change', () => { ensurePaletteBounds(); requestRender(); });
  paletteMinInput.addEventListener('change', () => { ensurePaletteBounds(); requestRender(); });
  paletteMaxOutput.addEventListener('change', () => { ensurePaletteBounds(); requestRender(); });
  paletteMaxInput.addEventListener('change', () => { ensurePaletteBounds(); requestRender(); });

  syncRangePair(hueShiftInput, hueShiftOutput, 0, 360, (value) => {
    state.hueShift = value;
  }, true);

  syncRangePair(saturationInput, saturationOutput, 0, 2, (value) => {
    state.saturation = value;
  }, true);

  syncRangePair(lightnessInput, lightnessOutput, 0, 2, (value) => {
    state.lightness = value;
  }, true);

  colorSpaceInput.addEventListener('change', () => {
    state.colorSpace = colorSpaceInput.value as ColorSpace;
    requestRender();
  });

  fillViewportInput.addEventListener('change', () => {
    state.fillViewport = fillViewportInput.checked;
    syncCanvasSize();
    requestRender();
  });

  previewModeInput.addEventListener('change', () => {
    state.previewMode = previewModeInput.value as 'current' | 'legacy';
  });

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
