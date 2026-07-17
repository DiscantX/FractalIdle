# Handoff: Split Color from Compute — Scalar-Field Tiles + Two-Tier Cache

## The problem

Every color-related setting currently triggers a full re-render and wipes the tile cache.
Two groups are affected:

- **Adjustments** — `hueShift`, `saturation`, `lightness`, `colorSpace`.
- **Palette / palette-range** — `palette`, `reverseColors`, `colorCycles`, `autoAdjustColors`,
  `paletteMinIterations`, `paletteMaxIterations`.

All of these are `rerender: true` in `src/settings/registry.ts` and all appear in `SIGNATURE_KEYS`
in `src/services/tile-cache.ts`. Two consequences:

1. **Perf:** dragging any of these re-runs escape-time iteration for every visible pixel across all
   workers — the expensive part of the pipeline — just to change a cheap per-pixel color lookup.
2. **Destructive to navigation state:** because these keys are in `SIGNATURE_KEYS`, changing any of
   them changes the render signature, `ensureSignatureCurrent()` calls `cache.clear()`, and *every
   tile from every zoom/pan step taken so far is gone*. A color tweak silently erases the whole
   exploration history at the current fractal settings.

## Why the split point matters (and why the naive version fails)

The obvious fix — "cache the finished RGB pixel, re-apply adjustments at paint time" — works for
hue/sat/lightness/colorSpace, because those are a per-pixel `Rgb → Rgb` transform
(`applyAdjustments`, `src/utils/color.ts`). **It does not work for palette swapping.** A palette swap
(viridis → plasma) needs the per-pixel *scalar* — the normalized iteration value that indexes the
palette (`palettePosition`, mandelbrot `worker.ts`) — and you cannot recover that scalar from a baked
RGB pixel. Viridis→plasma is not an RGB→RGB function.

So the cut has to move one stage earlier than "cache final RGB":

```
Stage 1 (expensive, workers, cached):  escape-time iteration  →  per-pixel scalar value
Stage 2 (cheap, main thread):          scalar  →  palette lookup  →  adjustments  →  RGBA
```

Everything in **both** color groups above becomes a Stage-2 operation. Only settings that change the
*scalar itself* stay in Stage 1 (see the signature split below).

This also directly serves the stated long-term goal: "recolor the current frame" becomes a
first-class cheap operation, and because Stage 2 owns the palette lookup too, the future animated-color
feature gets **palette cycling and palette cross-fades**, not just hue cycling — with no new
architecture.

## The hard part the naive plan skipped: tiles are canvases

The entire assembly/preview pipeline relies on tiles being `HTMLCanvasElement` and
compositing/scaling them via `drawImage`:

- `assembleFromCache` (`tile-cache.ts`) — `drawImage` each tile into the viewport assembly.
- `assembleScaledViewport` (`tile-cache.ts`) — scales a whole cached-level assembly with one
  `drawImage` for the zoom-out preview.
- pan-fill (`updatePanPreview`, `renderer.ts`) and `assembleBestCachedViewport` — same.

You cannot `drawImage` a `Float32Array`. A scalar-field cache therefore needs a colorization step
before any blit. The solution is a **two-tier cache** that keeps all of the above `drawImage` code
working unchanged:

- **Tier 1 — compute cache (precious):** scalar-field tiles (`Float32Array` per tile), keyed by the
  **compute signature** only. Never invalidated by a color change.
- **Tier 2 — color cache (cheap, derived):** the current canvas tiles, keyed by **compute signature +
  color signature**. Produced by running Stage 2 over a Tier-1 scalar tile. This is what the existing
  assembly/preview code consumes via `getTile`.

`getTile` becomes: hit Tier 2 → return; else hit Tier 1 → colorize → store in Tier 2 → return; else
real miss → dispatch a worker. On a **color-signature change we clear only Tier 2**; Tier 1 (the
expensive compute) survives, so pan/zoom over previously-visited ground re-colors instantly with no
workers. On a **compute-signature change we clear both.**

## Cache capacity and the color-cap invariant

A Tier-2 (color) tile is only ever created from a Tier-1 (scalar) tile that already exists, so the
color cache can never legitimately exceed the compute cache. Enforce this two ways:

- **Setting clamp (mirrors the palette `min`/`max` `rangeLink`):** add an explicit `colorCacheSize`
  setting in the `cache` section, `rerender: false`, with `rangeLink: { role: 'min', pairedWith:
  'tileCacheSize' }` so it can never be set above `tileCacheSize`. Add the symmetric
  `rangeLink: { role: 'max', pairedWith: 'colorCacheSize' }` to `tileCacheSize` so lowering the
  compute cap also pulls the color cap down. (User intent: the derived cache is always bounded by the
  source cache — `colorCacheSize ≤ tileCacheSize`.)
- **Runtime invariant `|Tier2| ≤ |Tier1|`:** when a Tier-1 scalar tile is evicted, also evict its
  Tier-2 color child (cascade). Without this, an evicted scalar could leave a stale color tile whose
  source can no longer be re-derived. Tier-2 LRU eviction is driven by `colorCacheSize`; Tier-1 LRU
  eviction by `tileCacheSize`.
- **LRU touch, not peek, on the Tier-1 lookup:** the two tiers have independent LRU orderings, and a
  tile can be a Tier-2 hit while its Tier-1 parent is old and near eviction. To keep a
  displayed-but-recency-stale scalar alive, `getTile`'s Tier-1 lookup must **touch** (move to the
  tail) the Tier-1 entry on a Tier-2 colorize, not just read it. Otherwise an actively-displayed
  color tile could lose its scalar parent to eviction and silently become unrecoverable.

**Memory:** each tier is ~4 bytes/px (scalar `Float32` and RGBA canvas are both one 4-byte word/pixel),
so a fully-populated cache is ≤ 2× the memory of today's single `tileCacheSize`, and the
`colorCacheSize ≤ tileCacheSize` clamp keeps it there.

## The scalar representation

Cache **one `Float32Array` per tile: `valueForPalette`** — the raw, pre-normalization value the
worker already computes (mandelbrot `worker.ts`, the `valueForPalette` block). This is `iter`, or the
smooth `nu` value, or the distance-estimation value, depending on `colorMode`/`smoothColoring` (both
Stage-1, so the *kind* of value is fixed within a compute signature).

- Storage: 4 bytes/px — same as the current RGBA canvas tile. Tier 1 ≈ neutral vs today; Tier 2 adds
  the derived canvases (evict Tier 2 more aggressively; it's cheap to regenerate).
- **Interior detection** for `black-white` and the `world-map` palette uses `value >= maxIterations`.
  This is exact for the common modes: interior pixels are never smoothed (smoothing only applies when
  `iter < maxIterations`) and culled/interior pixels set `iter = maxIterations` exactly.
  `maxIterations` is part of the compute signature, so store it alongside the field (tile metadata or
  passed into Stage 2).
- **Known nuance (document, don't over-engineer):** under `colorMode: 'distance-estimation'`,
  `valueForPalette` is not `iter`, so `>= maxIterations` interior detection doesn't hold — the
  distance-mode + world-map/black-white combination is already a quirky overlay. Under
  `smoothColoring` + `world-map`, thresholds shift by `< 1/maxIterations` (invisible). If pixel-exact
  fidelity for those combos is ever required, add a second `Uint16` `iter` field; not needed now.

## Signature split

Split `SIGNATURE_KEYS` into two lists in `tile-cache.ts`:

**Compute signature** (changing any of these invalidates Tier 1 → clear both tiers):
```
fractalType, maxIterations, width, height, gridColumns, gridRows,
solidGuessing, geometricCulling, periodicityChecking,
colorMode, smoothColoring, flipX, flipY
```
`colorMode` and `smoothColoring` stay here because they change how the scalar is computed *during*
iteration (smooth needs `escapeRadiusSquared` at escape time; distance-estimation is a different
quantity). `colorMode: 'black-white'` also stays Stage-1 for simplicity — it's a rare toggle and
keeping the mixed `colorMode` setting whole avoids a partial-key split.

**Color signature** (changing any of these invalidates Tier 2 only → clear color cache, keep compute):
```
palette, reverseColors, colorCycles, autoAdjustColors,
paletteMinIterations, paletteMaxIterations,
hueShift, saturation, lightness, colorSpace
```

`autoAdjustColors` / `paletteMin` / `paletteMax` are here because they only affect the
*normalization* of the scalar (`minIt`/`maxIt`), which Stage 2 does — this is why we cache the raw
`valueForPalette` rather than the already-normalized `palettePosition`.

## Files affected and what changes in each

| File | Change |
|---|---|
| `src/types.ts` | `WorkerResponse.data`: `Uint8ClampedArray` → `Float32Array` (scalar field, not RGBA). `WorkerTask`: **remove** the color-only fields (`palette`, `reverseColors`, `colorCycles`, `autoAdjustColors`, `paletteMinIterations`, `paletteMaxIterations`, `hueShift`, `saturation`, `lightness`, `colorSpace`). **Keep** `colorMode`, `smoothColoring` (they shape the scalar). Consider a shared `ColorParams` type for the Stage-2 inputs. |
| `src/utils/color.ts` | Add `scalarToRgb(value, maxIterations, params: ColorParams): Rgb` — the full mapping currently in the worker's color block (normalize → branch black-white / world-map / gradient → `applyAdjustments`). Add `colorizeScalarField(scalar, w, h, maxIterations, params): ImageData` (full-frame pass) and `renderScalarTileToCanvas(scalar, w, h, maxIterations, params): HTMLCanvasElement` (per-tile, for Tier-2). Early-out is *not* available here (palette lookup is always needed). Keep `applyAdjustments`, `getPaletteColor`, `getWorldMapColor`, etc. |
| `src/workers/mandelbrot/worker.ts` | Remove the entire color-mapping section (palette lookup + `applyAdjustments`). Per pixel, write `valueForPalette` into a `Float32Array` output. `getSolidInteriorColor` → `getSolidInteriorValue` returning the interior scalar (`maxIterations`); `fillSolidTile` fills the `Float32Array` with it. Post the buffer as a transferable. Workers get materially simpler and stop importing palette code. |
| `src/workers/julia/worker.ts` | Same. |
| `src/workers/burning-ship/worker.ts` | Same. |
| `src/workers/buffalo/worker.ts` | Same. |
| `src/services/tile-cache.ts` | Two-tier cache. Tier 1 `Map<string, {data: Float32Array, w, h, maxIterations}>` (scalar, compute-signature keyed); Tier 2 `Map<string, HTMLCanvasElement>` (color, compute+color-signature keyed). Split `SIGNATURE_KEYS` into `COMPUTE_SIGNATURE_KEYS` / `COLOR_SIGNATURE_KEYS` with `computeComputeSignature()` / `computeColorSignature()`. `ensureSignatureCurrent()`: compute-sig change → clear both; color-sig change → clear Tier 2 only. `getTile` (keyed by color sig) colorizes lazily from Tier 1 on Tier-2 miss (needs the current color params + maxIterations); real miss → dispatch a worker. **Cascade eviction:** evicting a Tier-1 tile also drops its Tier-2 child, holding `\|Tier2\| ≤ \|Tier1\|`. Two caps via `cap()`: Tier-1 ≤ `tileCacheSize`, Tier-2 ≤ `colorCacheSize` (which a setting clamp keeps ≤ `tileCacheSize` — see Capacity section). `keyFor` variants per tier. `zoomLevelCounts` (coverage index) tracks **Tier 1** — preview coverage is about what's *computed*, since any computed tile can be colored on demand. Add `assembleScalarField(view, w, h)` mirroring `assembleFromCache` but producing a `Float32Array` viewport buffer (for the base-frame capture below). |
| `src/services/renderer.ts` | `handleResult`: store the `Float32Array` scalar tile in Tier 1, then colorize it (`renderScalarTileToCanvas`) for the assembly `drawImage` (and cache the canvas in Tier 2). `presentAssembly` is unchanged (still blits canvases). At primary-complete, capture `renderContext.baseScalarField` (via `assembleScalarField`) for the current view. Add `cheapRecolorRepaint()` (below). Assembly/preview paths are otherwise transparent if `getTile` handles lazy colorization. |
| `src/state.ts` | Add `renderContext.baseScalarField: { data: Float32Array, width, height, maxIterations, view: ViewState } | null`. This is what instant color repaints and (future) animation read from. |
| `src/settings/registry.ts` | For all ten color-signature settings: `rerender: true` → `rerender: false`, and an `onChange` that calls the cheap repaint. Leave `colorMode`, `smoothColoring` as `rerender: true`. Add a new `colorCacheSize` setting in the `cache` section (default 2000, min 64, max 20000, step 64, `rerender: false`) with `rangeLink: { role: 'min', pairedWith: 'tileCacheSize' }` so it can never exceed `tileCacheSize`; add the symmetric `rangeLink: { role: 'max', pairedWith: 'colorCacheSize' }` to `tileCacheSize`. |
| `src/services/zoom-manager.ts` | **No change.** `createSmoothPreviewCanvas` snapshots the live (post-color) canvas. And **do not touch** `drawFallbackPreview`'s `getImageData` call — load-bearing for zoom-resolution behavior, unrelated to this task. Flagged so it isn't "cleaned up." |

## The cheap repaint path

`cheapRecolorRepaint()` (called from the ten `onChange`s):

1. `ensureSignatureCurrent()` — this clears Tier 2 (color cache) because the color signature changed;
   Tier 1 survives.
2. If `renderContext.baseScalarField` is valid for the current `state.view` (same width/height/view):
   `colorizeScalarField(...)` → `putImageData` to the canvas. Done — no workers.
3. If it's **not** valid (view moved since capture, mid/post-pan, etc.): fall back to
   `requestRender()`. This re-runs the present path, which lazily colorizes visible Tier-1 tiles into
   Tier-2 and blits — still no re-iteration, since Tier 1 is intact.

Reusing `baseScalarField` + `colorizeScalarField` for step 2 avoids the pixel-alignment hazard of
reading back the live canvas (which is post-color and has placeholder pixels at the margins): the
scalar buffer is assembled with the same geometry as the render, so recolor lines up exactly.

## Suggested implementation order

1. `types.ts`: reshape `WorkerResponse.data` to `Float32Array`; trim `WorkerTask`; add `ColorParams`.
2. `color.ts`: add `scalarToRgb`, `colorizeScalarField`, `renderScalarTileToCanvas` (move the mapping
   out of the worker verbatim first, then delete it from the worker).
3. Workers (all four): output the scalar field; convert the solid-guess path to a scalar fill.
4. `tile-cache.ts`: two-tier cache + signature split + lazy colorization in `getTile` +
   `assembleScalarField`. (This is the largest single change; do it in one pass.)
5. `renderer.ts`: store scalar tiles in Tier 1, colorize for the assembly, capture `baseScalarField`.
6. `state.ts`: add the `baseScalarField` slot.
7. `registry.ts`: flip the ten color settings to `rerender: false` + wire `cheapRecolorRepaint`.

Steps 3–4 are where correctness lives; steps that are easy to under-scope: the **solid-guess scalar
fill** (all four workers), the **color-sig-only Tier-2 clear** (the whole point of non-destructive
swaps), and **lazy colorization inside the preview/scale paths** (`assembleScaledViewport`,
`assembleBestCachedViewport`) — those also go through `getTile`, so if `getTile` colorizes, they're
covered, but verify.

## Performance notes

- Stage 2 moves adjustment work from *parallel workers* to the *main thread*. The two-tier cache is
  what keeps this cheap: colorization runs per-tile only on a Tier-2 miss (color change, or first
  visit), not every frame. A color-slider drag re-colors only the visible viewport once per change,
  no workers.
- Confirm acceptable **main-thread frame time** with a non-default color config set — "no worker
  activity" is necessary but not sufficient. At 1280×928 (~1.19M px) a full-frame `colorizeScalarField`
  is a per-pixel normalize + palette lookup + `applyAdjustments`; measure it.
- **Animation (future):** a `requestAnimationFrame` loop with time-varying color params should NOT go
  through Tier 2 (a changing hue would bust the color cache every frame). It should call
  `colorizeScalarField` on `renderContext.baseScalarField` straight to the canvas each frame. The
  buffer + function are designed for exactly this — keep `colorizeScalarField` a pure
  `(scalarField, maxIterations, params) → ImageData` so an animation loop can call it unmodified.

## Testing checklist

- Dragging any adjustment slider (`hueShift`/`saturation`/`lightness`/`colorSpace`): instant visual
  change, **no** worker activity (render status badge / `window.mandelbrotDebug`), **no**
  `tilecache:signature-change-clear` event, tile cache size unchanged.
- Swapping `palette`, toggling `reverseColors`, changing `colorCycles`: same — instant, no workers, no
  cache wipe. (This is the new capability vs. the RGB-only design.)
- Changing `autoAdjustColors` / `paletteMinIterations` / `paletteMaxIterations`: same — Stage-2 cheap,
  no re-iteration.
- Changing `colorMode` or `smoothColoring`: **does** re-render and clear both tiers (expected — these
  are compute-signature keys).
- Pan/zoom after a color change shows correctly-colored tiles, **including tiles computed before the
  change** (proves Tier 1 is color-invariant and Tier 2 re-derives correctly).
- Zoom-out smooth preview and pan-preview-fill (both via `assembleBestCachedViewport` → `getTile`)
  show correctly-colored pixels immediately, no flash of stale/uncolored color.
- Solid-guessed interior tiles ("continent" fills) respond to color changes exactly like iterated
  tiles (exercises the scalar solid-fill path in all four workers).
- `world-map` palette still renders correctly and swaps cheaply to/from gradient palettes; interior
  ("continent") pixels are correct.
- `black-white` mode still renders correctly (mapped from the scalar via `value >= maxIterations`).

## Out of scope (noted, not this task)

- `colorSpace`'s `lch`/`okhsl`/`hsluv` are currently fudge-factor multipliers on HSL, not real
  color-space conversions. Fixing this is on the owner's separate to-do list; here it stays a
  Stage-2 param and behaves as it does today.
- Interior-detail / world-map noise settings remain hardcoded off (the existing
  `TODO(Slice 5 - palette plugins)`); this task does not re-home them. The scalar design leaves room
  for it later (add the `iter`/`interiorProgress` channel then).
```
