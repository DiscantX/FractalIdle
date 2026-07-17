import { canvas } from './ui/dom';
import { settingsEngine } from './settings/instance';
import { requestRender, cancelActiveRender, warmPool, renderCallbacks, promoteActiveRenderToPresent } from './services/renderer';
import { zoomCallbacks } from './services/zoom-manager';
import { loadSavedLogs, appendRenderLog, loggerCallbacks, enableLogging } from './services/logger';
import { installDebugTools } from './utils/debug';
import {
  wireControls,
  mountSettings,
  syncCanvasSize,
  updateStats,
  updateRenderStatus,
  updateLogCountText,
  updateNavigatorReadout,
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

// Start a background render of the smooth-zoom destination *during* the
// animation so its tiles are cached by the time it lands. It also pre-caches the
// look-ahead and look-behind levels on spare worker capacity (spaced on this
// gesture's step factor). The render does not paint — the animation keeps the
// screen — and onZoomEnd promotes it once the gesture ends.
zoomCallbacks.onZoomTargetChange = (view, stepFactor, focalX, focalY) => {
  if (view) {
    requestRender(focalX, focalY, { view, present: false, stepFactor });
  }
};

// Present the destination render that was started during the animation, adopting
// the in-flight render rather than discarding it. If it already completed, a
// normal render presents the now-cached frame immediately.
zoomCallbacks.onZoomEnd = (focalX, focalY) => {
  if (!promoteActiveRenderToPresent()) {
    requestRender(focalX, focalY);
  }
};

// Keep the navigator's coordinate read-out in sync with the live view on every
// view change (smooth-zoom frames, instant zooms, jumps, resets), not only when
// a render finishes.
zoomCallbacks.onViewUpdate = () => {
  updateNavigatorReadout(true);
};

// Link log persistence events to UI counters
loggerCallbacks.onLogUpdate = (count) => {
  updateLogCountText(count);
};

// Bootstrap the application
function init() {
  installDebugTools();
  // Render logging is off by default (it re-serializes the whole log to
  // localStorage on every completed render — a real cost during a deep dive).
  // Turn it on from the console when needed: `enableRenderLogging()` then reload.
  (window as unknown as { enableRenderLogging: () => void }).enableRenderLogging = enableLogging;
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
