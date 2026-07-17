import { RenderLogEntry, ChunkMode } from '../types';
import { state, renderContext, STORAGE_KEY } from '../state';
import { settingsEngine } from '../settings/instance';

// Logging is OFF by default. While on, every completed render appends an entry
// and (re)serializes the whole log to localStorage — fine for occasional
// benchmark runs, but during a continuous deep dive it grows without bound and
// does O(n) stringify+write work every render. Leave it disabled unless you
// actually want the log; enable via enableLogging().
let loggingEnabled = false;
const LOG_CAP = 200;

export function enableLogging(): void {
  loggingEnabled = true;
}

export const loggerCallbacks = {
  onLogUpdate: (_count: number) => {},
};

export function loadSavedLogs() {
  if (!loggingEnabled) return;
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
  if (!loggingEnabled) return;
  renderContext.renderLogs.push({
    timestamp: new Date().toISOString(),
    scenario,
    width: settingsEngine.getValue('width') as number,
    height: settingsEngine.getValue('height') as number,
    maxIterations: settingsEngine.getValue('maxIterations') as number,
    gridColumns: settingsEngine.getValue('gridColumns') as number,
    gridRows: settingsEngine.getValue('gridRows') as number,
    workerCount: settingsEngine.getValue('workerCount') as number,
    chunkMode: settingsEngine.getValue('chunkMode') as ChunkMode,
    zoomMode: settingsEngine.getValue('zoomMode') as 'instant' | 'smooth',
    zoom: state.view.zoom,
    lastRenderMs: state.lastRenderMs,
    lastSteps: state.lastSteps,
  });
  // Bound the array so a long dive can't grow it without limit.
  if (renderContext.renderLogs.length > LOG_CAP) {
    renderContext.renderLogs.splice(0, renderContext.renderLogs.length - LOG_CAP);
  }
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
