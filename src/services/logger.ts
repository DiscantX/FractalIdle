import { RenderLogEntry } from '../types';
import { state, renderContext, STORAGE_KEY } from '../state';

export const loggerCallbacks = {
  onLogUpdate: (_count: number) => {},
};

export function loadSavedLogs() {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return;
  }

  try {
    const parsed = JSON.parse(saved) as RenderLogEntry[];
    renderContext.renderLogs.push(...parsed);
    loggerCallbacks.onLogUpdate(renderContext.renderLogs.length);
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function saveLogs() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(renderContext.renderLogs));
}

export function appendRenderLog(scenario?: string) {
  renderContext.renderLogs.push({
    timestamp: new Date().toISOString(),
    scenario,
    width: state.width,
    height: state.height,
    maxIterations: state.maxIterations,
    tileWidth: state.tileWidth,
    tileHeight: state.tileHeight,
    workerCount: state.workerCount,
    chunkMode: state.chunkMode,
    zoomMode: state.zoomMode,
    zoom: state.view.zoom,
    lastRenderMs: state.lastRenderMs,
    lastSteps: state.lastSteps,
  });
  saveLogs();
  loggerCallbacks.onLogUpdate(renderContext.renderLogs.length);
}

export function exportLogs() {
  const blob = new Blob([JSON.stringify(renderContext.renderLogs, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'mandelbrot-render-log.json';
  anchor.click();
  URL.revokeObjectURL(url);
}
