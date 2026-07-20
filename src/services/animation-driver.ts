import { clamp } from '../utils/math';

// Shared animation-loop plumbing. Both the smooth-zoom animation and the fly-to
// flight need "drive t 0→1 with easing, call a per-frame callback, own a
// requestAnimationFrame loop, support cancellation" — that part is identical and
// lives here. The interpolation math itself stays in each caller (smooth zoom is
// anchor-constrained; fly-to is a free-endpoint lerp), so there is exactly one
// RAF loop implementation but no forced unification of two genuinely different
// curves. See nav-locations-trips-handoff.md §3.2.
export type AnimationHandle = { cancel: () => void };

// easeOutCubic — the curve beginSmoothZoom used inline before this was factored
// out, so the smooth-zoom feel is unchanged by the refactor.
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// Runs a single animation: schedules RAF frames until `t` reaches 1, passing each
// frame the raw progress `t` and the eased value. Calls `onComplete` once at the
// end. The returned handle's `cancel()` stops the loop and guarantees no further
// `onFrame`/`onComplete` calls.
export function runAnimation(
  durationMs: number,
  onFrame: (t: number, eased: number) => void,
  onComplete: () => void,
): AnimationHandle {
  let frameId: number | null = null;
  let cancelled = false;
  const start = performance.now();

  const step = (now: number): void => {
    if (cancelled) return;
    // A zero/negative duration collapses to a single final frame rather than
    // dividing by zero — a pure pan at identical zoom can legitimately hit this.
    const t = durationMs <= 0 ? 1 : clamp((now - start) / durationMs, 0, 1);
    onFrame(t, easeOutCubic(t));
    if (t < 1) {
      frameId = requestAnimationFrame(step);
    } else {
      onComplete();
    }
  };

  frameId = requestAnimationFrame(step);

  return {
    cancel(): void {
      cancelled = true;
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
    },
  };
}
