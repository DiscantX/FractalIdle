import { canvas } from './ui/dom';
import { settingsEngine } from './settings/instance';
import { requestRender, cancelActiveRender, renderCallbacks } from './services/renderer';
import { cacheCompletedFrame, zoomCallbacks } from './services/zoom-manager';
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
