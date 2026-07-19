# Handoff: Navigator Redesign, Deep Dive, Saved Locations, and Trips

## Status

Design/brainstorm complete. No implementation has started beyond a `SavedLocation`
type sketch (not yet committed to a file). This document captures everything
decided in the design session, for a fresh implementer (human or AI) with no
prior context on the conversation that produced it.

Written for the standalone Mandelbrot Scratchpad codebase (`src/`), not the idle
game. Nothing here assumes the idle game engine; see "Relationship to the idle
game" at the end for the one place that connects.

---

## 1. Scope Summary

Four related features, buildable mostly independently but with real dependency
order (see §8, Build Order):

1. **Nav card redesign** — the existing `#coordNav` card (`index.html`,
   `ui-manager.ts`) gets a "Current" row and a "Destination" row, Google-Maps-style.
   Each row is collapsible to a single compact line and expandable to the current
   full field layout. Destination row can both **jump** (instant/existing
   behavior) and **deep dive** (new animated flight, see §3).
2. **Deep dive** — a new animated camera flight from the current view to an
   arbitrary `(centerRe, centerIm, zoom)`, independent of the existing
   screen-anchored zoom animation. Duration scales with zoom-octave distance,
   via a **selectable, swappable duration curve** (not a hardcoded formula).
3. **Saved locations** — a persisted list of named coordinates (optionally with a
   color-settings snapshot), shown in a popout panel.
4. **Trips** — an ordered, freely-reorderable sequence of saved locations, with
   both manual (Next/Previous) and optional auto-advance playback, driving deep
   dive from stop to stop.

---

## 2. Nav Card Redesign

### 2.1 Current behavior (baseline)

`index.html` has `#coordNav` with three always-expanded `nav-field` rows (Re, Im,
Zoom) plus Jump/Origin/Copy/Paste buttons. Logic lives in `ui-manager.ts`
(`performJump`, `copyCoordinates`, `pasteCoordinates`, `syncNavField`,
`updateNavigatorReadout`). Styling in `style.css` under `.nav-card` /
`.nav-field` / `.nav-button-row`.

### 2.2 Target layout

Two logical blocks inside the same `.nav-card`:

- **Current** — read-only-ish (editable the way it is today; editing + Jump
  still works), reflects `state.view` live.
- **Destination** — a separate staged `{re, im, zoom}` the user is composing,
  with two actions: **Jump** (existing instant `jumpTo`) and **Deep Dive** (new,
  see §3).

Each block has a **collapsed** and **expanded** state:

- Collapsed: single line, abbreviated. Suggested format:
  `Re -0.7269…  Im 0.1889…  Z 1.2e4×` (see §4.3 for the truncation rule —
  reuse the same truncation helper here, not a separate one-off).
- Expanded: today's three stacked `nav-field` rows.

Toggle mechanism: reuse the existing `.is-stuck` CSS-class-toggle pattern
already used for the sticky-card shadow (`initNavigatorSticky` in
`ui-manager.ts`) — i.e. a plain class toggle + CSS `max-height`/`grid-template-rows`
transition, no animation library needed. A chevron button or clicking the
collapsed summary line toggles state. No new dependency.

### 2.3 Compactness constraint

The whole point of collapsing is to keep the card near its current footprint
even with two blocks (Current + Destination) instead of one. Both blocks should
default to **collapsed**, expanding only on user interaction. Verify this
against the existing `.nav-card` `position: sticky` behavior — a card that
grows/shrinks height while stuck at the top of the scrolling sidebar needs the
`IntersectionObserver` sentinel logic in `initNavigatorSticky` to keep working;
it should (it only watches `#navSentinel`'s visibility, not the card's height),
but confirm visually once built.

### 2.4 Files touched

- `index.html` — restructure `#coordNav` into Current/Destination sub-blocks.
- `src/ui/dom.ts` — add element references for the new destination fields,
  collapse toggle buttons, and (later) the Deep Dive button.
- `src/ui/ui-manager.ts` — collapse/expand handlers; destination field state
  (mirrors the existing `navDirtyFields` pattern — a staged destination is
  conceptually identical to "dirty" nav fields, just permanently staged until
  Jump/Deep-Dive/clear).
- `src/style.css` — collapsed/expanded row styles, reuse `.nav-field` primitives.

---

## 3. Deep Dive

### 3.1 Why this is not just an animated `jumpTo`

The existing smooth-zoom animation (`beginSmoothZoom` in `zoom-manager.ts`) is
**screen-anchored**: every frame it calls

```ts
state.view = computeTargetView(currentScale, animation.originX, animation.originY, animation.from);
```

`originX/originY` is a fixed **screen pixel**, and `computeTargetView` solves
for a `centerRe/centerIm` such that the world point under that pixel stays
under that pixel as zoom changes. This is what gives wheel/click zoom its
"zoom into the cursor" feel, and it's why center and zoom aren't independently
interpolated today — center is a *function of* zoom via the anchor.

Deep dive has no such anchor — the destination can be anywhere on the plane, at
any depth, unrelated to the current view. There's no `screenX/screenY` that
makes the anchor math produce the right path. Deep dive needs its own,
independent interpolation:

- `centerRe`, `centerIm`: linear lerp (world space). *(Noted for later: for
  very large jumps, log-zoom-normalized lerp might feel better than raw linear
  — not required for v1; flag as a possible follow-up if long-distance dives
  feel like they "cross the whole plane" before diving.)*
- `zoom`: **log-lerp**, not linear — zoom is multiplicative, so linear-lerping
  it would spend ~99% of the animation barely moving before a sudden jump at
  the end. Use `zoom(t) = fromZoom * (toZoom/fromZoom) ** t`.

### 3.2 Shared animation scaffolding vs. separate curves

Decision: **keep the math separate, share only the driver plumbing.**
`beginSmoothZoom` and the new `beginDeepDive` both need "drive `t` 0→1 with
easing, call a per-frame callback, own a `requestAnimationFrame` loop, support
cancellation" — that part is identical and should be factored out:

```ts
// src/services/animation-driver.ts (new file)
export type AnimationHandle = { cancel: () => void };

export function runAnimation(
  durationMs: number,
  onFrame: (t: number, eased: number) => void,
  onComplete: () => void,
): AnimationHandle
```

`beginSmoothZoom` keeps its anchor-based `onFrame` body; the new
`beginDeepDive` supplies an independent-lerp `onFrame` body. Do **not** try to
unify the interpolation math itself — they are genuinely different curves
(anchor-constrained vs. free endpoint lerp), and forcing one function to do
both invites subtle bugs (see design-session discussion: this was explicitly
evaluated and rejected in favor of shared scaffolding + separate curves).

Refactor `beginSmoothZoom` to use `runAnimation` as part of this work (low
risk — the frame body doesn't change, just how the RAF loop is driven), so
there's exactly one animation-loop implementation in the codebase.

### 3.3 Duration: configurable curve, not a constant

The existing smooth-zoom duration (`220` ms, hardcoded in `beginSmoothZoom`)
was tuned for a narrow input range (one wheel tick). Deep dive's input range is
unbounded (adjacent point at the same zoom, or a coordinate 60 octaves deeper),
so a fixed duration is wrong for it.

**Important product note:** the "right" duration curve is context-dependent,
not a universal truth. In this explorer, fast/responsive is the goal, so
duration should have diminishing returns at large octave counts. In the
future idle game, a 60-octave dive is *supposed* to take a long time (see
`FractalIdleMDD.md` §3.6.1, §7.3 — the "wall" mechanic is built on real
felt time at depth). Do not bake in diminishing returns as if it were a fixed
truth — implement it as a **named, swappable strategy**, and expose the choice
as a setting (mirrors how `zoomSensitivity` is already a tunable setting).

```ts
// src/services/animation-driver.ts (or a dedicated duration.ts)
export type DurationCurve = 'clamped-sqrt' | 'linear' | 'clamped-linear';

export type DurationCurveParams = {
  baseMs: number;
  perOctaveMs: number;
  minMs: number;
  maxMs: number; // ignored by 'linear'
};

export function computeDeepDiveDuration(
  fromZoom: number,
  toZoom: number,
  curve: DurationCurve,
  params: DurationCurveParams,
): number {
  const octaves = Math.abs(Math.log2(toZoom / fromZoom));
  // 'clamped-sqrt': baseMs + perOctaveMs * sqrt(octaves), clamped [minMs, maxMs]
  // 'clamped-linear': baseMs + perOctaveMs * octaves, clamped [minMs, maxMs]
  // 'linear': baseMs + perOctaveMs * octaves, NOT clamped — this is the
  //           "idle-game pacing preview" mode; a 60-octave dive really does
  //           take ~60x a 1-octave dive.
  // ...
}
```

Add settings entries (`src/settings/registry.ts`, new `deep-dive` section):
`deepDiveDurationCurve` (select: clamped-sqrt / linear / clamped-linear),
`deepDiveBaseMs`, `deepDivePerOctaveMs`, `deepDiveMinMs`, `deepDiveMaxMs`. All
`rerender: false` (they don't affect the render pipeline, only animation
timing).

`octaves = |log2(toZoom / fromZoom)|` mirrors the existing octave-distance
concept already used in `tile-cache.ts`'s `pickBestCachedZoom` — same
vocabulary, don't invent a second way to measure zoom distance.

### 3.4 New file: `src/services/deep-dive.ts`

```ts
export function beginDeepDive(target: { centerRe: number; centerIm: number; zoom: number }): void
export function cancelDeepDive(): void
```

Responsibilities:
- Cancel any in-flight smooth-zoom animation and vice versa (only one camera
  animation owns the screen at a time — check `state.zoomAnimation` and add an
  analogous `state.deepDiveAnimation` slot, or generalize to one
  `state.cameraAnimation` field; implementer's call, but pick one and be
  consistent — don't let both slots be independently non-null).
- Compute duration via `computeDeepDiveDuration`.
- Drive via `runAnimation`, `onFrame` doing independent lerp/log-lerp as in
  §3.1, updating `state.view` and calling `zoomCallbacks.onViewUpdate()` each
  frame (same as smooth zoom does, for live coordinate readout).
- On completion, call `requestRender()` (or the look-ahead/present machinery
  the existing zoom path uses — check whether deep dive should also warm
  look-ahead tiles along the flight path; **out of scope for v1**, plain
  `requestRender()` at each frame or just at completion is fine to start).
- Wire the "Deep Dive" button (added in §2) in `ui-manager.ts` to call this
  with the staged destination fields.

### 3.5 Testing checklist for this section

- Deep dive to a point at the same zoom (pure pan) — no jarring zoom pop.
- Deep dive to a much deeper point — check the log-lerp actually feels like
  continuous zoom, not a slow-then-sudden jump (would indicate linear-lerp
  leaked in somewhere).
- Cancel a deep dive mid-flight by starting a wheel zoom — should not fight or
  crash; whichever animation type is confirmed the "owner" pattern (single
  `state.cameraAnimation` slot recommended above) should make this automatic.
- Switch `deepDiveDurationCurve` to `linear` with a large `perOctaveMs` and
  confirm a deep dive can be made to take many seconds — this is the "preview
  idle-game pacing" use case, worth eyeballing once before shipping.

---

## 4. Saved Locations

### 4.1 Data model

New file: `src/services/locations.ts`.

```ts
import type { FractalType, ColorParams } from '../types';

export type SavedLocation = {
  id: string;                    // crypto.randomUUID()
  name: string | null;           // null => display falls back to coordinate string (see §4.3)
  centerRe: number;
  centerIm: number;
  zoom: number;
  fractalType: FractalType;
  colorParams: ColorParams | null; // null => don't restore colors on visit
  createdAt: string;              // ISO timestamp
};
```

Design decisions locked in:
- **Name is optional.** Blank name displays the truncated coordinate string
  instead (§4.3). No seeded name-generation in v1 — noted as a nice future
  feature (coordinate-seeded name generator), not built now. Leave a comment
  at the display-fallback call site marking this as the extension point.
- **Color snapshot is optional, off by default.** A "Save current colors too"
  checkbox at save time populates `colorParams` from
  `getCurrentColorParams()` (`tile-cache.ts`); otherwise `null`. On visiting a
  location with `colorParams` set, apply them via `settingsEngine.setValue`
  calls (snap, not fade — see §4.5 for why fading is out of scope).
- **Coordinates are stored at full precision always**, regardless of any
  display truncation — truncation (§4.3) is a display-layer-only concern, same
  principle as `formatCoord` in `ui-manager.ts` already follows.

### 4.2 Persistence

Mirror the existing pattern in `src/services/logger.ts` (`loadSavedLogs` /
`saveLogs`, `window.localStorage` + `JSON.parse`/`stringify`, wrapped in
try/catch clearing the key on parse failure). New storage key, e.g.
`mandelbrot-saved-locations`. Suggested exports:

```ts
export function loadSavedLocations(): SavedLocation[]
export function saveLocations(locations: SavedLocation[]): void
export function addLocation(loc: Omit<SavedLocation, 'id' | 'createdAt'>): SavedLocation
export function removeLocation(id: string): void
export function updateLocation(id: string, patch: Partial<SavedLocation>): void
```

Keep an in-memory array (module-level, like `renderContext.renderLogs`) synced
to storage on every mutation, same as `logger.ts` does — no need for a
different pattern here.

### 4.3 Display truncation

Long coordinates collide under naive length-based truncation (many nearby
points share leading digits). Rule: truncate **per numeric field**, head +
ellipsis + tail, not the whole composed string at once (composing first then
truncating risks cutting off the Zoom field entirely).

New shared helper — `src/utils/format.ts` (new file, small):

```ts
/** e.g. truncateNumericString("-0.74362819...", 5, 3) => "-0.743…819" */
export function truncateNumericString(value: string, headLen = 5, tailLen = 3): string {
  if (value.length <= headLen + tailLen + 1) return value;
  return `${value.slice(0, headLen)}…${value.slice(-tailLen)}`;
}
```

Use this for: the collapsed nav-card summary line (§2.2), saved-location list
rows (§5), and any future display site — one implementation, shared. Truncate
`centerRe`, `centerIm`, `zoom` independently, then join with the existing
separators (`Re … Im … Z …`).

### 4.4 Deletion safety (trip cross-reference)

Since a `SavedLocation` may be referenced by one or more `Trip`s (§6), deleting
one needs a warning, not a silent cascade or a hard block. Add:

```ts
// src/services/locations.ts or trips.ts — implementer's call on which file
export function findTripsReferencing(locationId: string, trips: Trip[]): Trip[]
```

Delete flow (wherever the delete button lives, likely in the popout list
component built in §5): call `findTripsReferencing` first. If non-empty, show
a confirm dialog naming the affected trip(s) by name before proceeding. If the
user confirms anyway, delete the location; trips keep a dangling id.

**Trip playback must independently handle a missing location id gracefully**
(skip that stop) as a second line of defense — see §6.3. The warning reduces
surprise in normal use; the skip logic handles edge cases (storage corruption,
future import/export, etc.) without crashing playback.

### 4.5 Explicitly out of scope for v1

- Fading/lerping between two saved `ColorParams` states during trip playback.
  Real engine work (hue wraparound at 360°, palette-to-palette isn't even a
  continuous function unless both stops use the same palette). Snap-only for
  now. Note the extension point in trip-playback code but don't build it.
- Seeded coordinate → name generator. Noted in §4.1.

---

## 5. Locations Popout Panel

### 5.1 Behavior

A floating panel toggled by a button (placed in the nav card or sidebar
header — implementer's call on exact placement, but it should be reachable
without scrolling the sidebar). Must be able to visually **hover over both the
canvas and the sidebar's scrollbar** — i.e. it must not be clipped by
`.controls-panel`'s `overflow-y: auto`.

Mechanically this means the panel **cannot be a DOM descendant of
`.controls-panel`**. Two viable approaches:
1. A `position: fixed` element, a sibling of `.app-shell` (or appended
   directly under `<body>`), manually positioned relative to the sidebar's
   right edge on mount/resize.
2. A native `<dialog>` or a simple top-level `<div>` added in `index.html`
   alongside `.app-shell`.

Recommend (1) for simplicity given the codebase's existing plain-DOM style (no
portal/component framework is in use anywhere else in this project — don't
introduce one just for this).

Toggle mechanism: same class-toggle pattern as everything else in this
codebase (`hidden` / `.is-open` class flip on click), not a new pattern.

### 5.2 Contents — two tabs

- **Saved** tab: list of `SavedLocation`s. Each row: name-or-truncated-coords
  (§4.3), a **Jump** button (instant, existing `jumpTo`), a **Deep Dive**
  button (§3.4), a **Delete** button (§4.4 warning flow), maybe an **Edit
  name** affordance.
- **Trips** tab: see §6.

### 5.3 Files touched

- `index.html` — add the popout container markup (empty shell) as a sibling of
  `.app-shell`, plus the toggle button somewhere in the sidebar.
- `src/ui/dom.ts` — element references.
- New file `src/ui/locations-panel.ts` — mount/render/toggle logic, list
  rendering, wiring to `locations.ts` service functions. Keep this separate
  from `ui-manager.ts` (which is already large) rather than growing that file
  further.
- `src/style.css` — `.locations-popout` styles: `position: fixed`, sizing,
  `z-index` above canvas and sidebar, tab styles.

---

## 6. Trips

### 6.1 Data model

New file `src/services/trips.ts` (or colocated in `locations.ts` — implementer's
call; they're closely related but conceptually distinct, so a separate file is
probably cleaner once both exist).

```ts
export type Trip = {
  id: string;
  name: string;
  locationIds: string[];       // ordered; free-form order, no forced depth sort
  autoAdvance: boolean;
  autoAdvancePauseMs: number;
};
```

Persistence: same `localStorage` pattern as `locations.ts` (§4.2), separate
storage key (e.g. `mandelbrot-trips`).

### 6.2 Ordering — explicitly unconstrained

**Decision:** a trip's stops can be in any order — zoom can go both deeper and
shallower between consecutive stops. This is intentional: this codebase is the
*explorer/engine* tool, not the idle game, so user agency takes priority over
any authenticity constraint the eventual game might want. Do not add
depth-monotonicity validation.

A **"Sort by depth" button** (one-click reorder of `locationIds` by each
location's `zoom` value, ascending or descending) is a good, cheap follow-up
feature — noted, not required for v1.

Reordering UI: drag-and-drop is the nicer UX but more implementation work;
simple **up/down move buttons** per row are an acceptable, much cheaper v1 —
implementer's call, but build the simpler version first if time-constrained.

### 6.3 Playback

Playback state (where it lives — likely a small module-level object in
`trips.ts`, mirroring `renderContext`'s pattern):

```ts
type TripPlaybackState = {
  tripId: string;
  currentIndex: number;
  playing: boolean;   // relevant only when autoAdvance is on
};
```

Controls needed in the Trips tab UI (§5.2):
- **Start trip** (begins deep dive to stop 0).
- **Next** / **Previous** (manual advance — always available, regardless of
  `autoAdvance`).
- **Auto-advance toggle** with a pause-duration field, **per trip** (matches
  the `Trip.autoAdvance` / `autoAdvancePauseMs` fields above). When on,
  arriving at a stop (deep-dive `onComplete`) starts a timer that, after
  `autoAdvancePauseMs`, advances to the next stop automatically — unless the
  user has manually navigated away in the meantime (guard against fighting a
  manual Next/Previous click or an unrelated pan/zoom during the pause; check
  playback state hasn't been invalidated before firing the timer callback,
  same defensive pattern `renderer.ts` uses for stale-render checks via
  `renderId`).
- **Stop/exit playback**.

**Missing-location skip (ties to §4.4):** when advancing to
`locationIds[currentIndex]`, if `loadSavedLocations()` no longer contains that
id, skip it (advance the index again) rather than erroring. If the entire
remaining trip is missing locations, stop playback cleanly.

### 6.4 Files touched

- `src/services/trips.ts` — new, as above.
- `src/services/deep-dive.ts` — no changes needed if `beginDeepDive` already
  takes a plain `{centerRe, centerIm, zoom}` target and exposes an `onComplete`
  hook (via `runAnimation`'s `onComplete` param) that trip playback can chain
  off of. Confirm this hook is exposed when building §3.4 — trips need it.
- `src/ui/locations-panel.ts` — Trips tab rendering + controls.

---

## 7. File Inventory (New / Touched)

| File | New/Touched | Purpose |
|---|---|---|
| `src/services/animation-driver.ts` | New | Shared `runAnimation` RAF driver |
| `src/services/deep-dive.ts` | New | Deep dive flight logic, duration curve |
| `src/services/locations.ts` | New | `SavedLocation` model + persistence |
| `src/services/trips.ts` | New | `Trip` model + persistence + playback state |
| `src/utils/format.ts` | New | `truncateNumericString` shared helper |
| `src/ui/locations-panel.ts` | New | Popout panel (Saved + Trips tabs) |
| `src/services/zoom-manager.ts` | Touched | Refactor `beginSmoothZoom` onto `runAnimation` |
| `src/ui/ui-manager.ts` | Touched | Nav card collapse/expand, destination staging, Deep Dive button wiring |
| `src/ui/dom.ts` | Touched | New element refs |
| `src/settings/registry.ts` | Touched | New `deep-dive` settings section |
| `index.html` | Touched | Nav card restructure, popout container, toggle button |
| `src/style.css` | Touched | Collapse/expand styles, popout panel styles |

---

## 8. Build Order

Dependency-driven, each phase independently testable before the next builds on
it:

1. **`locations.ts`** (§4) — pure data layer, no UI. Easiest to verify in
   isolation (console-testable).
2. **Nav card collapse/expand** (§2) — pure UI/CSS on existing state, no new
   animation or storage concepts. Visible progress early.
3. **`animation-driver.ts` + `deep-dive.ts`** (§3) — the highest-risk piece;
   de-risk it before building UI that depends on it. Refactor
   `beginSmoothZoom` onto the shared driver as part of this phase.
4. **Locations popout, Saved tab** (§5.1–5.2 partial) — wires phases 1 and 3
   together via Jump/Deep-Dive buttons per row.
5. **`trips.ts` + Trips tab** (§6) — depends on everything above.

---

## 9. Explicitly Deferred / Out of Scope

- Color-state fade/lerp between trip stops (§4.5).
- Seeded name generation from coordinates (§4.1).
- "Sort by depth" trip button (§6.2) — cheap follow-up, not required for v1.
- Look-ahead tile warming along a deep-dive flight path (§3.4) — plain
  render-on-completion is sufficient for v1.
- Log-zoom-normalized center lerp for very long-distance dives (§3.1) — plain
  linear lerp for v1; revisit only if long dives feel wrong in practice.

---

## 10. Relationship to the Idle Game

None of this is required by or blocking the idle game. The one intentional
connection: the deep-dive duration curve being a swappable, settings-exposed
strategy (§3.3) means this scratchpad can be used to **preview** idle-game
pacing decisions (e.g. "does a 60-octave wall-adjacent dive at real duration
feel right?") by switching `deepDiveDurationCurve` to `linear` with a large
`perOctaveMs` — without writing any idle-game code. Worth doing once trips are
built, as an informal pacing sanity check against `FractalIdleMDD.md` §3.6.1's
"grinding to a crawl near the wall" design intent.
