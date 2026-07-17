# Handoff: Split Color Adjustment from Escape-Time Computation

## The problem

The four "adjust colors" settings — `hueShift`, `saturation`, `lightness`, `colorSpace` — currently
trigger a full re-render on every change (`rerender: true` in `src/settings/registry.ts`). Dragging
a slider re-runs escape-time iteration for every visible pixel across all workers, which is the
expensive part of the pipeline, just to get a cheap HSL tweak.

Worse than the perf cost: **it's destructive to navigation state.** `SIGNATURE_KEYS` in
`src/services/tile-cache.ts` includes all four adjustment settings. Changing any of them changes
the render signature, which triggers `ensureSignatureCurrent()` to `cache.clear()` the *entire*
tile cache — every tile from every zoom/pan step taken so far, gone. So a hue slider drag doesn't
just feel slow, it silently erases the player's/tester's whole exploration history at the current
fractal settings.

## Why this matters beyond the immediate fix

The project owner wants this split not just as an optimization but as a **core engine primitive**,
because a planned future feature — animated color (flashing, color wipes, cycling effects) — needs
the ability to reapply color to an already-computed frame on every animation tick, cheaply and
non-destructively. If we only patch the slider-lag symptom, we'd build something that doesn't
generalize. The goal is: "recolor the current frame" becomes a first-class cheap operation the
renderer supports, independent of "recompute the fractal."

## Architecture: current vs. proposed

**Current (fused):** each worker, per pixel, does escape-time iteration → palette lookup →
`applyAdjustments()` (hue/sat/lightness/colorSpace) → writes final RGBA into the tile. Tiles are
stored in the tile cache (`tile-cache.ts`) as *final*, post-adjustment pixels. `presentAssembly()`
just blits cached tile canvases straight to the live canvas.

**Proposed (split into two stages):**

- **Stage 1 (expensive, worker-side, cached):** escape-time iteration → palette lookup only. No
  `applyAdjustments()` call. This is what gets stored in tiles going forward — tiles become
  *adjustment-invariant* base color.
- **Stage 2 (cheap, main-thread, applied at paint time):** a new function that walks a full
  `ImageData` buffer and applies `applyAdjustments()` per pixel, no iteration math, no workers, no
  `postMessage`. This runs whenever a frame is painted to the canvas — both for normal renders
  *and* for slider-only repaints, which read from a cached base-frame buffer instead of
  recomputing anything.

This is not "the same work, split into two calls" — it's a real reduction. Sliders go from
"re-run escape-time for every pixel" to "re-run one HSL transform pass over already-computed
pixels, no workers involved." And because adjustment settings drop out of `SIGNATURE_KEYS`,
the tile cache stops being wiped by slider changes at all.

## Files affected and what changes in each

| File | Change |
|---|---|
| `src/workers/mandelbrot/worker.ts` | Remove the `applyAdjustments(...)` call in the main per-pixel loop. **Also** remove it from `getSolidInteriorColor()` (the solid-guessing fast path) — both are color-output paths and both must stop baking in adjustments. |
| `src/workers/julia/worker.ts` | Remove the `applyAdjustments(...)` call in the per-pixel loop. |
| `src/workers/burning-ship/worker.ts` | Same. |
| `src/workers/buffalo/worker.ts` | Same. |
| `src/utils/color.ts` | Add new exported function `applyAdjustmentsToImageData(base: ImageData, hueShift, saturation, lightness, colorSpace): ImageData`. Loops `base.data` in RGBA stride-4, builds an `Rgb`, calls the existing `applyAdjustments()`, writes into a *new* `ImageData` (never mutate `base` — it's the cache). Copy alpha through unchanged. Worth an early-out: if all four params are at their default/no-op values, skip the loop and return a copy of `base` directly. |
| `src/services/tile-cache.ts` | Remove `'hueShift'`, `'saturation'`, `'lightness'`, `'colorSpace'` from `SIGNATURE_KEYS`. This is the change that stops slider drags from wiping the tile cache. |
| `src/state.ts` | Add a base-frame cache slot to `renderContext` (e.g. `baseImageData: ImageData | null` plus whatever view/geometry metadata is needed to know it's still valid — width/height/view at minimum). This is what slider-only repaints read from. |
| `src/services/renderer.ts` | Two changes: (1) `presentAssembly()` (or wherever the assembly is actually blitted to the live canvas) must now run the assembly's pixel buffer through `applyAdjustmentsToImageData()` before drawing — this is required for *every* normal render now, not just slider changes, since tiles no longer carry final color. (2) On real render completion (`finalize()`/`paintLive()`), stash the pre-adjustment `ImageData` for the current view into `renderContext.baseImageData` so slider changes have something to read. |
| `src/services/tile-cache.ts` (`assembleBestCachedViewport`) | This function draws directly from cached tile canvases for the zoom-out preview / pan-preview-fill paths. Its output must also be routed through `applyAdjustmentsToImageData()` before use, or the instant cached preview will flash unadjusted color for a moment during zoom-out/pan until the real frame lands. |
| `src/services/zoom-manager.ts` (`createSmoothPreviewCanvas`) | **No change needed.** This snapshots the literal on-screen canvas via `drawImage(canvas, ...)`, which is already post-adjustment by the time it's captured. Flagged here only so it isn't "fixed" unnecessarily. |
| `src/settings/registry.ts` | Change `rerender: true` → `rerender: false` for `hueShift`, `saturation`, `lightness`, `colorSpace`. Give each an `onChange` that calls a new cheap repaint function (reads `renderContext.baseImageData`, runs Stage 2, paints) instead of `api.requestRender()`. |

## Suggested implementation order

1. Strip `applyAdjustments()` out of all four workers, including the mandelbrot solid-guess path.
2. Remove the four color keys from `SIGNATURE_KEYS` in `tile-cache.ts`.
3. Add `applyAdjustmentsToImageData()` to `color.ts`.
4. Add the base-frame cache slot to `renderContext` in `state.ts`; capture it at paint time in `renderer.ts`.
5. Make the real paint path (`presentAssembly`) run Stage 2 before drawing — needed for every render now, not just slider changes, since tiles are unadjusted.
6. Fix up `assembleBestCachedViewport()`'s preview output the same way.
7. Wire the four color settings in `registry.ts` to the new cheap repaint path.

Steps 1–2 and 6 are the ones that are easy to forget/skip if only thinking about "make sliders
fast" rather than "stop the tile cache from being invalidated" — both matter and are somewhat
independent fixes that happen to share the same root cause.

## Testing checklist once implemented

- Dragging any of the four adjustment sliders should produce an instant visual change with **no**
  worker activity (check via the render status badge / debug tools — `window.mandelbrotDebug`) and
  should **not** trigger a `tilecache:signature-change-clear` debug event.
- Pan and zoom after adjusting a slider should show correctly-adjusted color, including on tiles
  that were cached *before* the adjustment was made (proves tiles are correctly adjustment-invariant
  and Stage 2 is applied uniformly regardless of tile age).
- Zoom-out smooth preview and pan-preview-fill (both go through `assembleBestCachedViewport`)
  should show correctly adjusted color immediately, not a flash of unadjusted color before the
  real frame lands.
- Solid-guessed tiles (interior "continent" fills) should respond to slider changes exactly like
  iterated tiles — this exercises the `getSolidInteriorColor()` fix specifically.
- World-map palette mode should still work correctly, since `getWorldMapColor()` produces a base
  color that then still needs adjustment applied on top, same as any other palette.

## Note on an unrelated but nearby landmine

`src/services/zoom-manager.ts` → `drawFallbackPreview()` contains a `drawingContext.getImageData(...)`
call. This is **unrelated to this task and must not be touched or removed** — it was previously
established as load-bearing for correct zoom resolution behavior, for reasons that took significant
prior effort to work out. If this task's diff touches `zoom-manager.ts` at all, double check that
call is untouched.

## Future extension this unlocks (not part of this task, context only)

Once Stage 2 exists as `applyAdjustmentsToImageData()` operating on a cached base buffer, animated
color effects (hue cycling, flashing, wipes) become: run Stage 2 on a `requestAnimationFrame` loop
with a time-varying `hueShift` (or a per-pixel mask for wipes), reading the same
`renderContext.baseImageData`, with no new architecture required. Worth keeping the Stage 2
function's signature generic enough (operating on a plain `ImageData` in, `ImageData` out) that an
animation loop can call it every frame without modification.
