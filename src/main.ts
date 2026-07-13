import { state } from './state';
import { canvas } from './ui/dom';
import { requestRender, cancelActiveRender, renderCallbacks } from './services/renderer';
import { cacheCompletedFrame, zoomCallbacks } from './services/zoom-manager';
import { loadSavedLogs, appendRenderLog, loggerCallbacks } from './services/logger';
import { installDebugTools } from './utils/debug';
import {
  wireControls,
  syncControlValues,
  syncCanvasSize,
  updateStats,
  updateRenderStatus,
  updateLogCountText,
} from './ui/ui-manager';

// Link renderer callbacks to UI updates and frame caching
renderCallbacks.onRenderStart = () => {
  updateRenderStatus(true);
};

renderCallbacks.onRenderComplete = (view) => {
  cacheCompletedFrame(view);
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
};

zoomCallbacks.onZoomChange = () => {
  requestRender();
};

// Link log persistence events to UI counters
loggerCallbacks.onLogUpdate = (count) => {
  updateLogCountText(count);
};

// Bootstrap the application
function init() {
  installDebugTools();
  loadSavedLogs();
  syncControlValues();
  syncCanvasSize();
  updateStats();
  updateRenderStatus(true);
  wireControls();
  canvas.style.cursor = 'grab';
  requestRender();
}

window.addEventListener('resize', () => {
  if (state.fillViewport) {
    syncCanvasSize();
    requestRender();
  }
});

init();
