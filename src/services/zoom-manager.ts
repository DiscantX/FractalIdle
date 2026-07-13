import { ViewState, CompletedFrame, ZoomAnimationState } from '../types';
import { state, renderContext, PREVIEW_PLACEHOLDER_COLOR, MAX_COMPLETED_FRAME_CACHE } from '../state';
import { canvas, drawingContext } from '../ui/dom';
import { clamp } from '../utils/math';
import { markDebug } from '../utils/debug';

export const zoomCallbacks = {
  onZoomStart: () => {},
  onZoomChange: () => {},
};

export function cacheCompletedFrame(view: ViewState) {
  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = state.width;
  frameCanvas.height = state.height;
  const frameContext = frameCanvas.getContext('2d');
  if (!frameContext) {
    return;
  }

  frameContext.imageSmoothingEnabled = false;
  frameContext.drawImage(canvas, 0, 0, state.width, state.height);
  renderContext.completedFrames.push({
    canvas: frameCanvas,
    view: { ...view },
    width: state.width,
    height: state.height,
  });

  while (renderContext.completedFrames.length > MAX_COMPLETED_FRAME_CACHE) {
    renderContext.completedFrames.shift();
  }
}

export function getMatchingCompletedFrames() {
  return renderContext.completedFrames.filter((frame) => frame.width === state.width && frame.height === state.height);
}

export function findBestPreviewFrame(targetView: ViewState) {
  const matchingFrames = getMatchingCompletedFrames();
  if (matchingFrames.length === 0) {
    return null;
  }

  const widerFrames = matchingFrames.filter((frame) => frame.view.zoom <= targetView.zoom);
  if (widerFrames.length > 0) {
    return widerFrames.reduce((best, frame) => (frame.view.zoom > best.view.zoom ? frame : best));
  }

  return matchingFrames[matchingFrames.length - 1];
}

export function drawViewProjection(
  targetContext: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  sourceView: ViewState,
  targetView: ViewState
) {
  const targetViewWidth = 4 / targetView.zoom;
  const targetViewHeight = targetViewWidth * (state.height / state.width);
  const targetScaleRe = targetViewWidth / state.width;
  const targetScaleIm = targetViewHeight / state.height;
  const scale = targetView.zoom / sourceView.zoom;
  const offsetX = state.width / 2
    + (sourceView.centerRe - targetView.centerRe) / targetScaleRe
    - (state.width / 2) * scale;
  const offsetY = state.height / 2
    + (sourceView.centerIm - targetView.centerIm) / targetScaleIm
    - (state.height / 2) * scale;

  targetContext.save();
  targetContext.imageSmoothingEnabled = false;
  targetContext.fillStyle = PREVIEW_PLACEHOLDER_COLOR;
  targetContext.fillRect(0, 0, state.width, state.height);
  targetContext.drawImage(sourceCanvas, offsetX, offsetY, state.width * scale, state.height * scale);
  targetContext.restore();
}

export function drawZoomPreview(scale: number, originX: number, originY: number, previewCanvas: HTMLCanvasElement) {
  drawingContext.save();
  drawingContext.imageSmoothingEnabled = false;
  drawingContext.fillStyle = PREVIEW_PLACEHOLDER_COLOR;
  drawingContext.fillRect(0, 0, state.width, state.height);
  drawingContext.translate(originX, originY);
  drawingContext.scale(scale, scale);
  drawingContext.translate(-originX, -originY);
  drawingContext.drawImage(previewCanvas, 0, 0, state.width, state.height);
  drawingContext.restore();
}

export function drawFallbackPreview() {
  if (state.previewMode === 'legacy') {
    drawingContext.save();
    drawingContext.fillStyle = PREVIEW_PLACEHOLDER_COLOR;
    drawingContext.fillRect(0, 0, state.width, state.height);
    drawingContext.restore();
    return;
  }

  const previousFrame = drawingContext.getImageData(0, 0, state.width, state.height);
  drawingContext.putImageData(previousFrame, 0, 0);
}

export function createSmoothPreviewCanvas(from: ViewState, previewFrame: CompletedFrame | null) {
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = state.width;
  previewCanvas.height = state.height;
  const previewContext = previewCanvas.getContext('2d');
  if (!previewContext) {
    return previewCanvas;
  }

  previewContext.imageSmoothingEnabled = false;
  if (previewFrame !== null) {
    drawViewProjection(previewContext, previewFrame.canvas, previewFrame.view, from);
  } else {
    previewContext.drawImage(canvas, 0, 0, state.width, state.height);
  }

  return previewCanvas;
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
  const viewWidth = 4 / baseView.zoom;
  const viewHeight = viewWidth * (state.height / state.width);
  const scaleRe = viewWidth / state.width;
  const scaleIm = viewHeight / state.height;

  const worldX = baseView.centerRe + (screenX - state.width / 2) * scaleRe;
  const worldY = baseView.centerIm + (screenY - state.height / 2) * scaleIm;

  const nextZoom = baseView.zoom * factor;
  const nextViewWidth = 4 / nextZoom;
  const nextViewHeight = nextViewWidth * (state.height / state.width);
  const nextScaleRe = nextViewWidth / state.width;
  const nextScaleIm = nextViewHeight / state.height;

  return {
    centerRe: worldX - (screenX - state.width / 2) * nextScaleRe,
    centerIm: worldY - (screenY - state.height / 2) * nextScaleIm,
    zoom: nextZoom,
  };
}

export function beginSmoothZoom(factor: number, screenX: number, screenY: number) {
  cancelZoomAnimation();
  zoomCallbacks.onZoomStart(); // triggers cancelActiveRender()
  
  const animationToken = renderContext.zoomAnimationGeneration + 1;
  renderContext.zoomAnimationGeneration = animationToken;
  const from = { ...state.view };
  const to = computeTargetView(factor, screenX, screenY, from);
  const isZoomingOut = to.zoom < from.zoom;
  const previewFrame = isZoomingOut ? findBestPreviewFrame(to) : null;
  const previewCanvas = createSmoothPreviewCanvas(from, previewFrame);
  markDebug('zoom:smooth-begin', {
    factor: Number(factor.toPrecision(8)),
    screenX,
    screenY,
    fromZoom: Number(from.zoom.toPrecision(8)),
    toZoom: Number(to.zoom.toPrecision(8)),
    isZoomingOut,
    previewFrameZoom: previewFrame === null ? null : Number(previewFrame.view.zoom.toPrecision(8)),
    completedFrameCount: getMatchingCompletedFrames().length,
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
    previewFrame,
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
    
    if (state.previewMode === 'legacy') {
      if (animation.previewFrame !== null && animation.to.zoom < animation.from.zoom) {
        drawViewProjection(drawingContext, animation.previewFrame.canvas, animation.previewFrame.view, state.view);
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
        zoomCallbacks.onZoomChange(); // triggers requestRender()
      }
    }
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
  zoomCallbacks.onZoomChange(); // triggers requestRender()
}

export function resetView() {
  cancelZoomAnimation();
  state.view.centerRe = 0;
  state.view.centerIm = 0;
  state.view.zoom = 1;
  zoomCallbacks.onZoomChange(); // triggers requestRender()
}

export function getWheelZoomFactor(deltaY: number) {
  const baseFactor = deltaY < 0 ? 1.1 : 1 / 1.1;
  return Math.pow(baseFactor, state.zoomSensitivity);
}

export function getClickZoomFactor(direction: 'in' | 'out') {
  const baseFactor = direction === 'in' ? 1.25 : 1 / 1.25;
  return Math.pow(baseFactor, state.zoomSensitivity);
}
