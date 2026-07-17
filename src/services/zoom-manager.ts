import { ViewState, ZoomAnimationState, FractalType } from '../types';
import { state, renderContext, PREVIEW_PLACEHOLDER_COLOR, fractalDefaultViews } from '../state';
import { canvas, drawingContext } from '../ui/dom';
import { clamp } from '../utils/math';
import { markDebug } from '../utils/debug';
import { settingsEngine } from '../settings/instance';

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
  targetContext.fillStyle = PREVIEW_PLACEHOLDER_COLOR;
  targetContext.fillRect(0, 0, width, height);
  targetContext.drawImage(sourceCanvas, offsetX, offsetY, width * scale, height * scale);
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
  drawingContext.drawImage(previewCanvas, 0, 0, width, height);
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
  drawingContext.putImageData(previousFrame, 0, 0);
}

export function cancelZoomAnimation() {
  if (state.zoomAnimation?.frameId !== null && state.zoomAnimation?.frameId !== undefined) {
    markDebug('zoom:animation-cancel', {
      frameId: state.zoomAnimation.frameId,
    });
    cancelAnimationFrame(state.zoomAnimation.frameId);
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
  zoomCallbacks.onZoomStart(); // triggers cancelActiveRender()
  
  const animationToken = renderContext.zoomAnimationGeneration + 1;
  renderContext.zoomAnimationGeneration = animationToken;
  const from = { ...state.view };
  const to = computeTargetView(factor, screenX, screenY, from);
  const isZoomingOut = to.zoom < from.zoom;
  // Snapshot the current on-screen frame (which is composited from the tile
  // cache) at viewport resolution. Scaling this during the animation gives the
  // low-res-preview-snaps-to-high-res effect.
  const previewCanvas = createSmoothPreviewCanvas();
  markDebug('zoom:smooth-begin', {
    factor: Number(factor.toPrecision(8)),
    screenX,
    screenY,
    fromZoom: Number(from.zoom.toPrecision(8)),
    toZoom: Number(to.zoom.toPrecision(8)),
    isZoomingOut,
  });

  const animation: ZoomAnimationState = {
    from,
    to,
    startTime: performance.now(),
    duration: 220,
    frameId: null,
    originX: screenX,
    originY: screenY,
    previewCanvas,
  };

  const step = (currentTime: number) => {
    if (renderContext.zoomAnimationGeneration !== animationToken || state.zoomAnimation !== animation) {
      return;
    }

    const progress = clamp((currentTime - animation.startTime) / animation.duration, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const scaleRatio = animation.to.zoom / animation.from.zoom;
    const currentScale = 1 + (scaleRatio - 1) * eased;

    state.view = computeTargetView(currentScale, animation.originX, animation.originY, animation.from);

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
        drawViewProjection(drawingContext, animation.previewCanvas, animation.from, state.view);
      } else {
        drawZoomPreview(currentScale, animation.originX, animation.originY, animation.previewCanvas);
      }
    } else {
      drawFallbackPreview();
    }

    if (progress < 1) {
      animation.frameId = requestAnimationFrame(step);
    } else {
      if (renderContext.zoomAnimationGeneration === animationToken) {
        state.view = animation.to;
        state.zoomAnimation = null;
        markDebug('zoom:smooth-end', {
          targetZoom: Number(animation.to.zoom.toPrecision(8)),
        });
        zoomCallbacks.onZoomChange(animation.originX, animation.originY); // triggers requestRender()      
      } // <- Closes the inner 'if'
    } // <- Closes the outer 'else'
  };

  animation.frameId = requestAnimationFrame(step);
  state.zoomAnimation = animation;
}


export function applyZoom(factor: number, screenX: number, screenY: number) {
  const targetView = computeTargetView(factor, screenX, screenY, state.view);
  markDebug('zoom:instant', {
    factor: Number(factor.toPrecision(8)),
    screenX,
    screenY,
    targetZoom: Number(targetView.zoom.toPrecision(8)),
  });
  state.view = targetView;
  zoomCallbacks.onZoomChange(screenX, screenY); // triggers requestRender()
}

export function resetView() {
  cancelZoomAnimation();
  const fractalType = settingsEngine.getValue('fractalType') as FractalType;
  const defaultView = fractalDefaultViews[fractalType];
  state.view.centerRe = defaultView.centerRe;
  state.view.centerIm = defaultView.centerIm;
  state.view.zoom = defaultView.zoom;
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

