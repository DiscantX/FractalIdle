/**
 * A single shared engine instance, so renderer.ts, zoom-manager.ts, and ui-manager.ts
 * all read the same state without passing it through props everywhere.
 * 
 * Note/warning: This creates a circular import — instance.ts imports from ui-manager.ts and renderer.ts,
 * and in 3b those files will import settingsEngine back from instance.ts.
 * ES modules can survive circular imports if nothing is used at module-evaluation time (only inside function bodies,
 * which is the case here — requestRender/syncCanvasSize are only called later, inside callbacks).
 * But it's fragile: if anyone later hoists a top-level call, it'll break in a confusing way. 
 */

import { SettingsEngine } from './engine';
import { syncCanvasSize } from '../ui/ui-manager';
import { requestRender } from '../services/renderer';
import { resetView } from '../services/zoom-manager';

export const settingsEngine = new SettingsEngine({
  requestRender: () => requestRender(),
  syncCanvasSize: () => syncCanvasSize(),
  resetView: () => resetView(),
});