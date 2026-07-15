import { ViewState, CompletedFrame, ZoomAnimationState } from '../types';
import { state, renderContext, PREVIEW_PLACEHOLDER_COLOR, MAX_COMPLETED_FRAME_CACHE } from '../state';
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

export function cacheCompletedFrame(view: ViewState) {
  const width = getWidth();
  const height = getHeight();

  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = width;
  frameCanvas.height = height;
  const frameContext = frameCanvas.getContext('2d');
  if (!frameContext) {
    return;
  }

  frameContext.imageSmoothingEnabled = false;
  frameContext.drawImage(canvas, 0, 0, width, height);
  renderContext.completedFrames.push({
    canvas: frameCanvas,
    view: { ...view },
    width,
    height,
  });

  while (renderContext.completedFrames.length > MAX_COMPLETED_FRAME_CACHE) {
    renderContext.completedFrames.shift();
  }
}

export function getMatchingCompletedFrames() {
  const width = getWidth();
  const height = getHeight();
  return renderContext.completedFrames.filter((frame) => frame.width === width && frame.height === height);
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

export function createSmoothPreviewCanvas(from: ViewState, previewFrame: CompletedFrame | null) {
  const width = getWidth();
  const height = getHeight();

  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = width;
  previewCanvas.height = height;
  const previewContext = previewCanvas.getContext('2d');
  if (!previewContext) {
    return previewCanvas;
  }

  previewContext.imageSmoothingEnabled = false;
  if (previewFrame !== null) {
    drawViewProjection(previewContext, previewFrame.canvas, previewFrame.view, from);
  } else {
    previewContext.drawImage(canvas, 0, 0, width, height);
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
    
    if ((settingsEngine.getValue('previewMode') as 'current' | 'legacy') === 'legacy') {
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
  state.view.centerRe = 0;
  state.view.centerIm = 0;
  state.view.zoom = 1;
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

