import { ViewState, ZoomAnimationState, FractalType } from '../types';
import { state, renderContext, PREVIEW_PLACEHOLDER_COLOR, fractalDefaultViews } from '../state';
import { canvas, drawingContext } from '../ui/dom';
import { markDebug } from '../utils/debug';
import { settingsEngine } from '../settings/instance';
import { assembleBestCachedViewport } from './tile-cache';
import { paintUniformColorFrame, addPaintTime } from './renderer';
import { isAnimationPlaying } from './color-animation';
import { runAnimation, type AnimationHandle } from './animation-driver';
// Runtime-only cyclic import: fly-to imports cancelZoomAnimation/zoomCallbacks
// from here, and we import cancelFlyTo from there. Neither is called during
// module evaluation (only inside handlers/RAF), so the cycle is safe.
import { cancelFlyTo } from './fly-to';

function getWidth(): number {
  return settingsEngine.getValue('width') as number;
}

function getHeight(): number {
  return settingsEngine.getValue('height') as number;
}

function getZoomSensitivity(): number {
  return settingsEngine.getValue('zoomSensitivity') as number;
}


export const zoomCallbacks = {
  onZoomStart: () => {},
  onZoomChange: (_focalX?: number, _focalY?: number) => {},
  // Fires when a smooth-zoom's destination view is (re)computed — used to start
  // a background render of the destination *during* the animation so its tiles
  // are cached by the time the animation lands, instead of only after it ends.
  // `stepFactor` is the gesture's zoom factor; the renderer uses it to space the
  // pre-cached (look-ahead / look-behind) levels on the same per-scroll-step
  // grid during a gesture, so continued scrolling lands on cached tiles.
  onZoomTargetChange: (_view?: ViewState, _stepFactor?: number, _focalX?: number, _focalY?: number) => {},
  // Fires when a smooth-zoom animation completes — used to present the
  // in-flight destination render (promoting it) rather than starting a new one.
  onZoomEnd: (_focalX?: number, _focalY?: number) => {},
  // Fires whenever the live view changes (every smooth-zoom frame, each instant
  // zoom) so the UI can refresh the coordinate read-out in real time — not only
  // after a render completes.
  onViewUpdate: () => {},
};

// Projects `sourceCanvas` (rendered for `sourceView`) into the frame for
// `targetView`, scaling by the zoom ratio and offsetting by the center delta.
// Used for zoom-out, where the source (higher-zoom) frame shrinks into place
// within the wider target view.
export function drawViewProjection(
  targetContext: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  sourceView: ViewState,
  targetView: ViewState,
  fillPlaceholder = true,
) {
  const width = getWidth();
  const height = getHeight();
  const targetViewWidth = 4 / targetView.zoom;
  const targetViewHeight = targetViewWidth * (height / width);
  const targetScaleRe = targetViewWidth / width;
  const targetScaleIm = targetViewHeight / height;
  const scale = targetView.zoom / sourceView.zoom;
  const offsetX = width / 2
    + (sourceView.centerRe - targetView.centerRe) / targetScaleRe
    - (width / 2) * scale;
  const offsetY = height / 2
    + (sourceView.centerIm - targetView.centerIm) / targetScaleIm
    - (height / 2) * scale;

  targetContext.save();
  targetContext.imageSmoothingEnabled = false;
  if (fillPlaceholder) {
    targetContext.fillStyle = PREVIEW_PLACEHOLDER_COLOR;
    targetContext.fillRect(0, 0, width, height);
  }
  const paintStart = performance.now();
  targetContext.drawImage(sourceCanvas, offsetX, offsetY, width * scale, height * scale);
  addPaintTime(performance.now() - paintStart);
  targetContext.restore();
}

export function drawZoomPreview(scale: number, originX: number, originY: number, previewCanvas: HTMLCanvasElement) {
  const width = getWidth();
  const height = getHeight();
  drawingContext.save();
  drawingContext.imageSmoothingEnabled = false;
  drawingContext.fillStyle = PREVIEW_PLACEHOLDER_COLOR;
  drawingContext.fillRect(0, 0, width, height);
  drawingContext.translate(originX, originY);
  drawingContext.scale(scale, scale);
  drawingContext.translate(-originX, -originY);
  const paintStart = performance.now();
  drawingContext.drawImage(previewCanvas, 0, 0, width, height);
  addPaintTime(performance.now() - paintStart);
  drawingContext.restore();
}

export function drawFallbackPreview() {
  const width = getWidth();
  const height = getHeight();

  if ((settingsEngine.getValue('previewMode') as 'current' | 'legacy') === 'legacy') {
    drawingContext.save();
    drawingContext.fillStyle = PREVIEW_PLACEHOLDER_COLOR;
    drawingContext.fillRect(0, 0, width, height);
    drawingContext.restore();
    return;
  }

  const previousFrame = drawingContext.getImageData(0, 0, width, height);
  const paintStart = performance.now();
  drawingContext.putImageData(previousFrame, 0, 0);
  addPaintTime(performance.now() - paintStart);
}

// The smooth-zoom animation's RAF handle (from runAnimation). Held at module
// scope so cancelZoomAnimation can stop the loop regardless of which call started
// it. Distinct from state.zoomAnimation, which other modules read as a "is a zoom
// animation in progress" flag.
let activeZoomHandle: AnimationHandle | null = null;

export function cancelZoomAnimation() {
  if (activeZoomHandle) {
    markDebug('zoom:animation-cancel', {});
    activeZoomHandle.cancel();
    activeZoomHandle = null;
  }
  state.zoomAnimation = null;
  renderContext.zoomAnimationGeneration += 1;
}

export function computeTargetView(factor: number, screenX: number, screenY: number, baseView: ViewState): ViewState {
  const width = getWidth();
  const height = getHeight();

  const viewWidth = 4 / baseView.zoom;
  const viewHeight = viewWidth * (height / width);
  const scaleRe = viewWidth / width;
  const scaleIm = viewHeight / height;

  const worldX = baseView.centerRe + (screenX - width / 2) * scaleRe;
  const worldY = baseView.centerIm + (screenY - height / 2) * scaleIm;

  const nextZoom = baseView.zoom * factor;
  const nextViewWidth = 4 / nextZoom;
  const nextViewHeight = nextViewWidth * (height / width);
  const nextScaleRe = nextViewWidth / width;
  const nextScaleIm = nextViewHeight / height;

  return {
    centerRe: worldX - (screenX - width / 2) * nextScaleRe,
    centerIm: worldY - (screenY - height / 2) * nextScaleIm,
    zoom: nextZoom,
  };
}

// Snapshot the current live canvas at viewport resolution for use as the
// zoom-animation preview source.
export function createSmoothPreviewCanvas(): HTMLCanvasElement {
  const width = getWidth();
  const height = getHeight();
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = width;
  previewCanvas.height = height;
  const previewContext = previewCanvas.getContext('2d');
  if (previewContext) {
    previewContext.imageSmoothingEnabled = false;
    previewContext.drawImage(canvas, 0, 0, width, height);
  }
  return previewCanvas;
}

export function beginSmoothZoom(factor: number, screenX: number, screenY: number) {
  cancelZoomAnimation();
  cancelFlyTo(); // a fly-to and a smooth zoom must never both drive state.view
  zoomCallbacks.onZoomStart(); // triggers cancelActiveRender()
  
  const animationToken = renderContext.zoomAnimationGeneration + 1;
  renderContext.zoomAnimationGeneration = animationToken;
  // Each wheel tick's destination is computed from the current (possibly
  // interpolated) view, so as the gesture keeps scrolling the destination keeps
  // deepening — and onZoomTargetChange below starts rendering that destination
  // *during* the animation rather than waiting for the wheel to stop.
  const from = { ...state.view };
  const to = computeTargetView(factor, screenX, screenY, from);
  const isZoomingOut = to.zoom < from.zoom;

  // Record the travel direction so the renderer can bias its speculative
  // (look-ahead / look-behind) prerender ordering toward where the user is
  // heading — the nearest level in this direction gets a first-step boost.
  renderContext.lastZoomDir = isZoomingOut ? 'out' : 'in';

  // Snapshot the current on-screen frame (which is composited from the tile
  // cache) at viewport resolution. Scaling this during the animation gives the
  // low-res-preview-snaps-to-high-res effect.
  const previewCanvas = createSmoothPreviewCanvas();
  // Zooming out reveals area outside the current frame. If any cached level
  // covers that wider target (the exact level, or the nearest neighbor within
  // the configured depth), assemble it now and project it as the base layer
  // during the animation so the revealed area shows real pixels instantly
  // instead of popping in from placeholder when the render lands.
  const depthMode = settingsEngine.getValue('zoomPreviewDepthMode') as
    'exact' | 'limited' | 'unlimited';
  const maxOctaves = settingsEngine.getValue('zoomPreviewDepthOctaves') as number;
  const minCoverage = (settingsEngine.getValue('zoomPreviewMinCoverage') as number) / 100;
  const previewStart = performance.now();
  const targetPreviewCanvas = isZoomingOut
    ? assembleBestCachedViewport(to, getWidth(), getHeight(), { depthMode, maxOctaves, minCoverage })
    : null;
  const previewMs = performance.now() - previewStart;
  markDebug('zoom:smooth-begin', {
    factor: Number(factor.toPrecision(8)),
    screenX,
    screenY,
    fromZoom: Number(from.zoom.toPrecision(8)),
    toZoom: Number(to.zoom.toPrecision(8)),
    isZoomingOut,
    targetCached: targetPreviewCanvas !== null,
    previewMs: Number(previewMs.toFixed(2)),
    depthMode,
    minCoverage,
  });

  const animation: ZoomAnimationState = {
    from,
    to,
    duration: 220,
    originX: screenX,
    originY: screenY,
    previewCanvas,
    targetPreviewCanvas,
    previewView: targetPreviewCanvas ? to : null,
  };

  // Overlay real cached tiles from the nearest level that is at least as deep as
  // the live view (so they DOWNSCALE into place — crisp — rather than upscaling
  // into a blocky mess), on top of the blurry preview. During a zoom-in this is
  // the destination `to` (and, as we pass it, the look-ahead levels), whose tiles
  // fill in progressively via the background render — so detail sharpens in place
  // as you scroll. No-op when the setting is off or nothing suitable is cached
  // yet (then only the blurry preview shows, exactly as before).
  const drawCrispOverlay = () => {
    if (!(settingsEngine.getValue('crispInScroll') as boolean)) return;
    const crisp = assembleBestCachedViewport(state.view, getWidth(), getHeight(), {
      depthMode,
      maxOctaves,
      minCoverage,
      minZoom: state.view.zoom,
    });
    if (crisp) {
      drawingContext.save();
      drawingContext.imageSmoothingEnabled = false;
      drawingContext.drawImage(crisp, 0, 0);
      drawingContext.restore();
    }
  };

  // Per-frame body (was the RAF `step`; the loop itself is now runAnimation).
  // `eased` is the easeOutCubic value supplied by the driver — same curve as the
  // inline `1 - (1-progress)^3` this replaced, so the feel is unchanged.
  const applyFrame = (progress: number, eased: number) => {
    // Parity guard with the old generation check: bail if this animation was
    // superseded. (runAnimation already stops a cancelled loop, so this is
    // belt-and-braces.)
    if (renderContext.zoomAnimationGeneration !== animationToken || state.zoomAnimation !== animation) {
      return;
    }

    const scaleRatio = animation.to.zoom / animation.from.zoom;
    const currentScale = 1 + (scaleRatio - 1) * eased;

    state.view = computeTargetView(currentScale, animation.originX, animation.originY, animation.from);
    zoomCallbacks.onViewUpdate(); // keep the coordinate read-out in sync live

    // While the color animation is playing, draw the whole frame from scalar tiles
    // in ONE hue pass so the zooming frame stays uniformly colored (instead of
    // compositing the RGB preview snapshot + cached tiles, which would each carry
    // a different — and stale — hue). Falls back to the normal preview path if the
    // cache doesn't yet cover this view. Completion is handled by `finish` below.
    if (isAnimationPlaying() && paintUniformColorFrame(state.view)) {
      return;
    }

    if (progress === 0 || progress === 1 || progress < 0.08 || progress > 0.92) {
      markDebug('zoom:smooth-frame', {
        progress: Number(progress.toFixed(4)),
        eased: Number(eased.toFixed(4)),
        currentScale: Number(currentScale.toPrecision(8)),
      });
    }

    if ((settingsEngine.getValue('previewMode') as 'current' | 'legacy') === 'legacy') {
      if (animation.to.zoom < animation.from.zoom) {
        // Zoom out: project the (higher-zoom) start frame shrinking into place
        // within the wider view, so the previous image stays visible at the
        // correct size and position rather than a bare scale-around-origin.
        if (animation.targetPreviewCanvas && animation.previewView) {
          // Base layer: the fully-cached target viewport projected into the
          // current (narrower) view fills the whole screen with real pixels,
          // so no placeholder shows in the border being revealed.
          drawViewProjection(drawingContext, animation.targetPreviewCanvas, animation.previewView, state.view);
          // Top layer: the start frame shrinking in, drawn without clearing so
          // it composites over the cached base rather than replacing it.
          drawViewProjection(drawingContext, animation.previewCanvas, animation.from, state.view, false);
        } else {
          drawViewProjection(drawingContext, animation.previewCanvas, animation.from, state.view);
        }
      } else {
        drawZoomPreview(currentScale, animation.originX, animation.originY, animation.previewCanvas);
      }
      // Crisp-in-scroll: overlay real cached tiles at the nearest available level
      // (populated by look-ahead prerender) on TOP of the blurry preview, so
      // detail visibly snaps in as the zoom passes through each pre-rendered
      // level. Gaps fall through to the blurry layer below. Still just a scaled
      // drawImage per frame — no per-frame worker render, so motion stays smooth.
      drawCrispOverlay();
    } else {
      drawFallbackPreview();
      drawCrispOverlay();
    }
  };

  const finish = () => {
    if (renderContext.zoomAnimationGeneration !== animationToken) {
      return;
    }
    state.view = animation.to;
    state.zoomAnimation = null;
    activeZoomHandle = null;
    markDebug('zoom:smooth-end', {
      targetZoom: Number(animation.to.zoom.toPrecision(8)),
    });
    zoomCallbacks.onZoomEnd(animation.originX, animation.originY); // presents the destination render
  };

  activeZoomHandle = runAnimation(animation.duration, applyFrame, finish);
  state.zoomAnimation = animation;

  // Kick off (or re-aim) a background render of the destination view now, while
  // the 220 ms animation plays. Tiles compute + cache during the gesture, so the
  // animation lands on crisp pixels instead of waiting for the render to start
  // only after the wheel/click stops. The render also pre-caches the look-ahead
  // and look-behind levels (spaced on this gesture's step grid) on spare worker
  // capacity. The render does not paint to the canvas (it owns none of the
  // screen); onZoomEnd promotes it once the gesture ends.
  zoomCallbacks.onZoomTargetChange(to, factor, screenX, screenY);
}


export function applyZoom(factor: number, screenX: number, screenY: number) {
  cancelFlyTo(); // an instant zoom cancels any in-flight flight
  renderContext.lastZoomDir = factor < 1 ? 'out' : 'in';
  const targetView = computeTargetView(factor, screenX, screenY, state.view);
  markDebug('zoom:instant', {
    factor: Number(factor.toPrecision(8)),
    screenX,
    screenY,
    targetZoom: Number(targetView.zoom.toPrecision(8)),
  });
  state.view = targetView;
  zoomCallbacks.onViewUpdate(); // keep the coordinate read-out in sync live
  zoomCallbacks.onZoomChange(screenX, screenY); // triggers requestRender()
}

// Instantly relocate the view to an explicit coordinate/zoom (the navigator's
// "Jump"). Cancels any in-flight smooth-zoom so the animation doesn't overwrite
// the destination, then requests a fresh render.
export function jumpTo(centerRe: number, centerIm: number, zoom: number) {
  cancelZoomAnimation();
  cancelFlyTo();
  renderContext.lastZoomDir = 'none';
  state.view.centerRe = centerRe;
  state.view.centerIm = centerIm;
  state.view.zoom = zoom;
  markDebug('nav:jump', {
    centerRe: Number(centerRe.toPrecision(12)),
    centerIm: Number(centerIm.toPrecision(12)),
    zoom: Number(zoom.toPrecision(8)),
  });
  zoomCallbacks.onViewUpdate(); // reflect the committed coordinates immediately
  zoomCallbacks.onZoomChange(); // triggers requestRender()
}

export function resetView() {
  cancelZoomAnimation();
  cancelFlyTo();
  renderContext.lastZoomDir = 'none';
  const fractalType = settingsEngine.getValue('fractalType') as FractalType;
  const defaultView = fractalDefaultViews[fractalType];
  state.view.centerRe = defaultView.centerRe;
  state.view.centerIm = defaultView.centerIm;
  state.view.zoom = defaultView.zoom;
  zoomCallbacks.onViewUpdate(); // reflect the reset coordinates immediately
  zoomCallbacks.onZoomChange(); // triggers requestRender()
}

export function getWheelZoomFactor(deltaY: number) {
  const baseFactor = deltaY < 0 ? 1.1 : 1 / 1.1;
  return Math.pow(baseFactor, getZoomSensitivity());
}

export function getClickZoomFactor(direction: 'in' | 'out') {
  const baseFactor = direction === 'in' ? 1.25 : 1 / 1.25;
  return Math.pow(baseFactor, getZoomSensitivity());
}

