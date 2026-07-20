import { settingsEngine } from '../settings/instance';
import { paintBaseScalarFrame, paintUniformColorFrame, requestRender } from './renderer';
import { clamp01 } from '../utils/math';
import { state } from '../state';
import { isFlyingTo } from './fly-to';

// --- Color animation ------------------------------------------------------
// Drives the Stage-2 color params over time to animate the frame WITHOUT
// re-running escape-time. The loop advances a normalized phase (0..1, one full
// cycle) each frame, maps it to the relevant color setting, then repaints the
// captured base scalar frame directly to the canvas (paintBaseScalarFrame — no
// tile-cache interaction, so changing the hue 60x/sec doesn't thrash the cache).
//
// "Hue Cycle" simply sweeps the existing `hueShift` setting through 0..360, which
// also moves the hue slider in the UI (via settingsEngine.setValue) — so the
// existing control doubles as a live read-out of the animation.

export type AnimationType = 'hue-cycle';

type AnimationState = {
  playing: boolean;
  phase: number; // 0..1, progress through one full cycle
  rafId: number | null;
  lastTs: number | null;
  // The hue value from before playback first began, so Stop can restore it
  // (rather than snapping to phase 0). Captured on the first Play and held
  // across Pause/Resume; cleared by Stop so the next Play captures fresh.
  hueAtStart: number;
  hasBaseline: boolean;
  // When a paint fails (base frame stale/missing) we ask for one render to
  // recapture the base, then wait for it rather than spamming render requests.
  pendingBaseRender: boolean;
};

const anim: AnimationState = {
  playing: false,
  phase: 0,
  rafId: null,
  lastTs: null,
  hueAtStart: 0,
  hasBaseline: false,
  pendingBaseRender: false,
};

// UI hooks. The animation controls subscribe to keep the transport buttons and
// scrubber in sync with the loop.
export const animationCallbacks = {
  onStateChange: (_playing: boolean) => {},
  onPhaseChange: (_phase: number) => {},
};

// True while the smooth-zoom animation owns the live canvas via its own rAF: the
// zoom step is tightly coupled to the per-frame view interpolation, so it paints
// the uniform frame itself and this loop must not double-paint. A fly-to flight
// likewise paints its own uniform frame each step, so it's excluded too. The loop
// still advances the hue so their present reads the live value. Panning is NOT
// included: the color loop paints pan frames (it reads the live state.view,
// updated by the drag) so detail keeps resolving between mouse moves —
// updatePanPreview defers painting to it while animating.
function interactionOwnsCanvas(): boolean {
  return state.zoomAnimation !== null || isFlyingTo();
}

// Map the current phase onto the active animation's target setting, then paint
// (unless an interaction owns the canvas — see interactionOwnsCanvas).
function applyPhase(): void {
  const type = settingsEngine.getValue('animationType') as AnimationType;

  if (type === 'hue-cycle') {
    // hueShift is an integer-degree slider (0..360). Round so the UI read-out is
    // clean; the wrap point (360) folds back to 0.
    const hue = Math.round(anim.phase * 360) % 360;
    settingsEngine.setValue('hueShift', hue);
  }

  // Paint only when nothing else owns the canvas. A gesture (zoom/pan) paints its
  // own uniform frame; the smooth-zoom step paints its own uniform frame too. In
  // both cases this loop just keeps the hue advancing (above) so their present
  // reads the live hue — it must not also paint here, or fire cache-canceling
  // renders.
  if (!interactionOwnsCanvas()) {
    // Fast path: exact-view base frame. Fall back to the general uniform path
    // (gap-free, any view) so the cycle keeps running through gesture
    // transitions where the captured base is momentarily stale — instead of
    // failing and stalling. Only ask for a render when nothing is cached at all.
    const painted = paintBaseScalarFrame() || paintUniformColorFrame();
    if (!painted) {
      if (!anim.pendingBaseRender) {
        anim.pendingBaseRender = true;
        requestRender();
      }
    } else {
      anim.pendingBaseRender = false;
    }
  }

  animationCallbacks.onPhaseChange(anim.phase);
}

function step(ts: number): void {
  if (!anim.playing) return;
  if (anim.lastTs === null) anim.lastTs = ts;
  const dt = (ts - anim.lastTs) / 1000; // seconds
  anim.lastTs = ts;

  // animationSpeed is in cycles per second.
  const speed = settingsEngine.getValue('animationSpeed') as number;
  let phase = anim.phase + speed * dt;
  phase -= Math.floor(phase); // wrap into [0,1)
  anim.phase = phase;

  applyPhase();
  anim.rafId = requestAnimationFrame(step);
}

export function playAnimation(): void {
  if (anim.playing) return;
  anim.playing = true;
  anim.lastTs = null;
  anim.pendingBaseRender = false;
  // Remember the pre-animation hue on the first Play so Stop can return to it.
  // Held across Pause/Resume; only re-captured after a Stop clears the baseline.
  if (!anim.hasBaseline) {
    anim.hueAtStart = settingsEngine.getValue('hueShift') as number;
    anim.hasBaseline = true;
  }
  animationCallbacks.onStateChange(true);
  anim.rafId = requestAnimationFrame(step);
}

export function pauseAnimation(): void {
  if (anim.rafId !== null) {
    cancelAnimationFrame(anim.rafId);
    anim.rafId = null;
  }
  if (!anim.playing) return;
  anim.playing = false;
  animationCallbacks.onStateChange(false);
}

// Stop = pause and restore the hue to whatever it was when playback began, then
// repaint once at that phase. The scrubber is set to the matching phase.
export function stopAnimation(): void {
  pauseAnimation();
  const restored = (anim.hasBaseline ? anim.hueAtStart : (settingsEngine.getValue('hueShift') as number)) % 360;
  anim.hasBaseline = false;
  settingsEngine.setValue('hueShift', restored);
  anim.phase = restored / 360;
  applyPhase();
}

// Manual scrub: jump to a phase and repaint. Callers pause first (the scrubber
// grabs control from the running loop).
export function setAnimationPhase(phase: number): void {
  anim.phase = clamp01(phase);
  applyPhase();
}

export function getAnimationPhase(): number {
  return anim.phase;
}

export function isAnimationPlaying(): boolean {
  return anim.playing;
}
