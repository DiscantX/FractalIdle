import type { ViewState } from '../types';
import { state, renderContext } from '../state';
import { lerp, clamp } from '../utils/math';
import { markDebug } from '../utils/debug';
import { settingsEngine } from '../settings/instance';
import { runAnimation, type AnimationHandle } from './animation-driver';
import { requestRender, isRenderActive, paintUniformColorFrame } from './renderer';
import { zoomCallbacks, cancelZoomAnimation } from './zoom-manager';

// Fly-to: a finite animated flight from the current view to an arbitrary
// (centerRe, centerIm, zoom). This is a "travel through A→B so you can observe
// how the fractal changes along the path" tool, NOT a get-from-A-to-B jump.
// Center is interpolated by linear world-space lerp; zoom by log-lerp (zoom is
// multiplicative — linear-lerping it would barely move for ~99% of the flight
// then jump at the end). See nav-locations-trips-handoff.md §3.
//
// Rendering along the path: each frame warms the actual fractal tiles for the
// current view (a self-paced present:false render, gated so we don't cancel
// in-flight tiles every frame) and paints from the scalar cache via
// paintUniformColorFrame — whose base upscales the nearest COMPLETE level
// (gap-free) while its overlay sharpens as deeper tiles land. So the fractal
// visibly resolves as the camera descends. This is the same proven path the
// earlier continuous "deep dive" prototype used (that prototype was removed;
// fly-to is the only such camera flight now).
//
// Because real renders drive the visible detail, the flight must be paced slowly
// enough for them to keep up — hence the duration is generous and user-tunable
// (see the "Fly to" settings section). Too fast and you get blur-then-snap;
// slower gives the renderer time to resolve each depth.

// The "right" duration curve is context-dependent, not a universal truth: this
// explorer can be tuned fast or slow, and the future idle game wants a deep dive
// to actually take a long time (the "wall" mechanic). So duration is a named,
// swappable strategy exposed as settings, not a hardcoded formula. See §3.3/§10.
export type DurationCurve = 'clamped-sqrt' | 'linear' | 'clamped-linear';

export type DurationCurveParams = {
  baseMs: number;
  perOctaveMs: number;
  minMs: number;
  maxMs: number; // ignored by 'linear'
};

// octaves = |log2(toZoom / fromZoom)| — the same octave-distance measure used
// elsewhere (tile-cache pickBestCachedZoom); don't invent a second one.
export function computeFlyToDuration(
  fromZoom: number,
  toZoom: number,
  curve: DurationCurve,
  params: DurationCurveParams,
): number {
  const octaves = Math.abs(Math.log2(toZoom / fromZoom));
  const { baseMs, perOctaveMs, minMs, maxMs } = params;
  switch (curve) {
    case 'clamped-sqrt': {
      // Diminishing returns: a 60-octave dive is only ~8× a 1-octave one.
      const ms = baseMs + perOctaveMs * Math.sqrt(octaves);
      return Math.min(maxMs, Math.max(minMs, ms));
    }
    case 'clamped-linear': {
      // Predictable: each octave adds a fixed time, capped at maxMs.
      const ms = baseMs + perOctaveMs * octaves;
      return Math.min(maxMs, Math.max(minMs, ms));
    }
    case 'linear': {
      // NOT capped — the "idle-game pacing preview" mode: a 60-octave dive
      // really does take ~60× a 1-octave dive.
      const ms = baseMs + perOctaveMs * octaves;
      return Math.max(minMs, ms);
    }
  }
}

// How center (Re/Im) is interpolated relative to zoom. The naive 'linear' mode
// pans in world space at a constant rate while zoom grows exponentially — so the
// pan lags badly and you dive into the start-center (often black) before a
// violent pan at the very end. The other two modes fix that. See the block
// comment on each case below.
export type FlyToPathMode = 'smart' | 'pan-then-zoom' | 'linear';

// Fraction of a 'pan-then-zoom' flight spent panning (at the start zoom) before
// zooming in. The rest zooms straight into the target.
const PAN_THEN_ZOOM_PAN_FRACTION = 0.5;

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}

// Compute the view at flight progress (`t` raw 0→1, `eased` = easeOutCubic(t)).
// `logFrom`/`logTo` are the natural logs of the endpoint zooms (precomputed once).
function interpolateFlyToView(
  from: ViewState,
  to: ViewState,
  logFrom: number,
  logTo: number,
  mode: FlyToPathMode,
  t: number,
  eased: number,
): ViewState {
  switch (mode) {
    case 'linear':
      // Baseline (kept for comparison): center linear in world space, zoom
      // log-lerp. This is the mode with the dive-into-black-then-pan artifact.
      return {
        centerRe: lerp(from.centerRe, to.centerRe, eased),
        centerIm: lerp(from.centerIm, to.centerIm, eased),
        zoom: Math.exp(lerp(logFrom, logTo, eased)),
      };

    case 'pan-then-zoom': {
      // Sequential: pan to the target at the START zoom (cheap, whole structure
      // visible), THEN zoom straight in while centered. Each phase is eased
      // independently so neither starts/stops abruptly.
      if (t < PAN_THEN_ZOOM_PAN_FRACTION) {
        const e = easeOutCubic(t / PAN_THEN_ZOOM_PAN_FRACTION);
        return {
          centerRe: lerp(from.centerRe, to.centerRe, e),
          centerIm: lerp(from.centerIm, to.centerIm, e),
          zoom: from.zoom,
        };
      }
      const e = easeOutCubic((t - PAN_THEN_ZOOM_PAN_FRACTION) / (1 - PAN_THEN_ZOOM_PAN_FRACTION));
      return {
        centerRe: to.centerRe,
        centerIm: to.centerIm,
        zoom: Math.exp(lerp(logFrom, logTo, e)),
      };
    }

    case 'smart':
    default: {
      // Simultaneous pan + zoom, coupled so the TARGET's screen offset shrinks
      // ~linearly while zoom proceeds log-linearly. The target's on-screen offset
      // from center is proportional to (distance-remaining-in-world) × zoom; with
      // center(u) = to − (to−from)·panFactor that offset ∝ panFactor·zoom. Setting
      // it linear in `eased` and solving gives panFactor = (1−eased)·(z0/z1)^eased,
      // i.e. (1−eased)·exp(eased·(logFrom−logTo)). Result: the pan is essentially
      // done by the time we're deep, so we descend onto the target instead of into
      // the start-center. Clamped to [0,1] so a zoom-OUT can't overshoot past the
      // start center. Degenerates correctly: no zoom change → linear pan; no pan
      // → pure zoom.
      const panFactor = clamp((1 - eased) * Math.exp(eased * (logFrom - logTo)), 0, 1);
      return {
        centerRe: to.centerRe - (to.centerRe - from.centerRe) * panFactor,
        centerIm: to.centerIm - (to.centerIm - from.centerIm) * panFactor,
        zoom: Math.exp(lerp(logFrom, logTo, eased)),
      };
    }
  }
}

let flyToHandle: AnimationHandle | null = null;

export function isFlyingTo(): boolean {
  return flyToHandle !== null;
}

// Cancel any in-flight fly-to. Safe to call when none is running.
export function cancelFlyTo(): void {
  if (flyToHandle) {
    flyToHandle.cancel();
    flyToHandle = null;
    markDebug('flyto:cancel', {});
  }
}

function readCurveParams(): DurationCurveParams {
  return {
    baseMs: settingsEngine.getValue('flyToBaseMs') as number,
    perOctaveMs: settingsEngine.getValue('flyToPerOctaveMs') as number,
    minMs: settingsEngine.getValue('flyToMinMs') as number,
    maxMs: settingsEngine.getValue('flyToMaxMs') as number,
  };
}

// Begin a flight to `target`. Cancels any in-flight camera animation first (only
// one owns the screen at a time). `onComplete` fires once the flight lands — trip
// playback (Phase 5) chains off this to advance to the next stop.
export function beginFlyTo(
  target: { centerRe: number; centerIm: number; zoom: number },
  onComplete?: () => void,
): void {
  // Single-owner: a smooth zoom and a fly-to must never both drive state.view.
  cancelZoomAnimation();
  cancelFlyTo();

  const from: ViewState = { ...state.view };
  const to: ViewState = {
    centerRe: target.centerRe,
    centerIm: target.centerIm,
    zoom: target.zoom,
  };

  // Bias the renderer's speculative (look-ahead) level ordering toward travel
  // direction so it pre-warms the depths we're descending into.
  renderContext.lastZoomDir = to.zoom >= from.zoom ? 'in' : 'out';

  const curve = settingsEngine.getValue('flyToDurationCurve') as DurationCurve;
  const duration = computeFlyToDuration(from.zoom, to.zoom, curve, readCurveParams());
  const pathMode = settingsEngine.getValue('flyToPathMode') as FlyToPathMode;

  // Log-space endpoints for the multiplicative zoom lerp.
  const logFrom = Math.log(from.zoom);
  const logTo = Math.log(to.zoom);

  markDebug('flyto:begin', {
    fromZoom: Number(from.zoom.toPrecision(8)),
    toZoom: Number(to.zoom.toPrecision(8)),
    curve,
    pathMode,
    durationMs: Number(duration.toFixed(1)),
  });

  const applyFrame = (t: number, eased: number): void => {
    state.view = interpolateFlyToView(from, to, logFrom, logTo, pathMode, t, eased);
    zoomCallbacks.onViewUpdate(); // live coordinate read-out

    // Render the ACTUAL fractal along the path. requestRender bumps activeRenderId
    // and drops the prior render's in-flight tiles as stale, so firing every frame
    // (60fps) would cancel work before any tile caches — nothing would resolve.
    // Gate on isRenderActive() for a self-paced chase: render the current view,
    // let it complete (its look-ahead also warms deeper levels), then aim the next
    // one at the now-deeper view. present:false — the flight owns the screen; the
    // uniform paint below is what's shown.
    if (!isRenderActive()) {
      requestRender(undefined, undefined, { view: { ...state.view }, present: false });
    }
    // Paint from the scalar cache: gap-free upscaled base + progressively
    // sharpening overlay. This is where the fractal is seen resolving mid-flight.
    paintUniformColorFrame(state.view);
  };

  const finish = (): void => {
    flyToHandle = null;
    state.view = to;
    zoomCallbacks.onViewUpdate();
    markDebug('flyto:end', { toZoom: Number(to.zoom.toPrecision(8)) });
    // Land on a crisp, fully-colored exact frame (flight frames were soft
    // upscales until their tiles resolved). A normal present render finishes it.
    requestRender();
    onComplete?.();
  };

  flyToHandle = runAnimation(duration, applyFrame, finish);
}
