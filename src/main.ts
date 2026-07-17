import { canvas } from './ui/dom';
import { settingsEngine } from './settings/instance';
import { requestRender, cancelActiveRender, warmPool, renderCallbacks } from './services/renderer';
import { zoomCallbacks } from './services/zoom-manager';
import { loadSavedLogs, appendRenderLog, loggerCallbacks } from './services/logger';
import { installDebugTools } from './utils/debug';
import {
  wireControls,
  mountSettings,
  syncCanvasSize,
  updateStats,
  updateRenderStatus,
  updateLogCountText,
} from './ui/ui-manager';

// Link renderer callbacks to UI updates and frame caching
renderCallbacks.onRenderStart = () => {
  updateRenderStatus(true);
};

renderCallbacks.onRenderComplete = () => {
  appendRenderLog();
  updateStats();
  updateRenderStatus(false);
};

renderCallbacks.onRenderCancel = () => {
  updateRenderStatus(false);
};

// Link zoom actions to rendering lifecycle
zoomCallbacks.onZoomStart = () => {
  cancelActiveRender();
  // Optional: overlap any pool (re)build with the zoom animation. Safe to skip —
  // renderFrame ensures the pool regardless (see warmWorkersOnZoom setting).
  if (settingsEngine.getValue('warmWorkersOnZoom') as boolean) {
    warmPool();
  }
};

zoomCallbacks.onZoomChange = (focalX, focalY) => {
  requestRender(focalX, focalY);
};

// Link log persistence events to UI counters
loggerCallbacks.onLogUpdate = (count) => {
  updateLogCountText(count);
};

// Bootstrap the application
function init() {
  installDebugTools();
  // Create the worker pool as early as possible so its module-load cost happens
  // during startup, off the critical path of the first render below.
  warmPool();
  loadSavedLogs();
  mountSettings();
  syncCanvasSize();
  updateStats();
  updateRenderStatus(true);
  wireControls();
  canvas.style.cursor = 'grab';
  requestRender();
}

window.addEventListener('resize', () => {
  if (settingsEngine.getValue('fillViewport') as boolean) {
    syncCanvasSize();
    requestRender();
  }
});

init();
