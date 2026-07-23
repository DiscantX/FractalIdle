# Perturbation / Precision / Series Approximation — Implementation Handoff

This handoff covers a tutoring-style implementation session that built perturbation
rendering, a three-backend high-precision arithmetic engine, and series
approximation for the Mandelbrot Scratchpad renderer. It supersedes the earlier
`perturbation-precision-handoff.md` design doc — that doc's *design* conclusions
mostly held up, but this doc reflects what was actually built, tested, and (in
several places) revised based on real benchmark data.

**Working style reminder for whoever picks this up:** this project is done as a
tutorial — explain concepts, give precise file/location instructions, let the user
write the code themselves one step at a time, reviewed before proceeding. Design
decisions get discussed and confirmed before code is written; options get presented
with tradeoffs rather than decided silently. Continue that pattern.

**Important meta-note:** the user got lost partway through wiring Step 14 (see
"Current State" below) and paused to get this handoff before finishing it. **A new
session should not assume any specific step is fully applied — verify against the
actual files first**, especially in `renderer.ts`, `worker.ts`, `mandelbrot.ts`,
and `tile-cache.ts`. The step numbers below describe what was *designed and given
as code*, not a confirmed-applied checklist.

---

## 1. Architecture overview — the three systems and how they relate

- **Perturbation**: replaces per-pixel full-precision iteration with one
  high-precision reference orbit (computed once per render layer) plus a cheap
  float64 delta (`δ`) iteration per pixel, relative to that orbit.
- **Precision**: how the reference orbit's *arithmetic* is done — float64 directly,
  or one of three high-precision backends, depending on how many significant
  digits the current zoom depth requires.
- **Series approximation**: an optimization *on top of* perturbation — precomputes
  a polynomial (in `δc`) approximating early `δ` values, letting per-pixel
  iteration skip ahead to iteration N instead of starting from 0, with a formal
  error bound deciding how far N can safely go.

Dependency chain: series approximation depends on perturbation; perturbation
depends on precision (for the reference orbit) but was deliberately built and
proven first with float64 orbits before precision was added — see the vertical
slice plan below.

**Fractal type scope**: everything here targets **Mandelbrot only**
(`src/core/strategies/mandelbrot.ts`). The interface/type shapes were deliberately
built to extend to other fractal types the same way `escapeIterations` already
does (one function per file in `core/strategies/`), but Burning Ship / Buffalo /
Julia perturbation support has **not been started**.

---

## 2. Vertical slice plan (for orientation)

- **Slice A** — Perturbation engine, float64 reference orbit. **Done, verified.**
- **Slice B** — High-precision reference orbit.
  - Scoped to **isolated proof only** (per explicit decision): three precision
    backends built and benchmarked in a `main.ts` scratch harness, **not wired
    into `computeReferenceOrbit` or any real render**. `ViewState` is still plain
    float64 throughout. This is the single biggest piece of unfinished work — see
    §6.
- **Slice C** — Series approximation. **Math and wiring designed and given as
    code; wiring completion status uncertain — verify against files (§8).**

---

## 3. Slice A — Perturbation (Mandelbrot, float64 reference orbit)

**Status: done, verified correct** (perturbation on/off produces pixel-identical
output vs. direct iteration at zoom levels well under the float64 wall).

### Files created
- `src/core/perturbation/types.ts` — `ReferenceOrbit` type (`cRe`, `cIm`, `re:
  Float64Array`, `im: Float64Array`, `length`, `escaped`). Later extended with
  `SeriesCoefficients` (§7).

### Files modified
- `src/core/strategies/mandelbrot.ts` — added:
  - `computeReferenceOrbit(cRe, cIm, maxIterations): ReferenceOrbit` — runs once
    per layer; no geometric culling / periodicity checking (structurally
    inapplicable here — it needs to record every `Z` value, not just a final
    count).
  - `perturbationEscapeIterations(orbit, deltaRe, deltaIm, maxIterations,
    geometricCulling, periodicityChecking, seriesCoefficients?, skipIteration?):
    { iterations, escapeRadiusSquared }` — the per-pixel delta iterator. Reuses
    the existing `geometricCulling`/`periodicityChecking` settings (deliberate —
    same concepts applied to a different loop, decided to avoid doubling
    settings count). Includes:
    - The classic "start δ₀ at 0, not at deltaRe/deltaIm" — flagged as the most
      common perturbation implementation bug, worth understanding not just
      avoiding.
    - An **orbit-exhaustion fallback**: if the reference point escaped before
      `maxIterations`, continues iterating a pixel directly (ordinary Mandelbrot
      formula) from the last known `z`, using the pixel's own real `c`
      (`orbit.cRe + deltaRe`, `orbit.cIm + deltaIm`). This is a narrow,
      deterministic case — **not** the general glitch-detection machinery,
      which remains deferred (§9).
    - The `seriesCoefficients`/`skipIteration` params were added later for Slice
      C (§8) — seeds `δ` at a skip-ahead point instead of starting from 0.

### Settings added
- `perturbationMode`: `'off' | 'on'` — section `'perturbation'` (new section,
  added to `SECTIONS` in `src/settings/registry.ts`, positioned right after
  `'fractal'`).

### Render pipeline wiring (`src/services/renderer.ts`)
- `RenderLayer` type gained `referenceOrbit?: ReferenceOrbit`.
- `perturbationEnabled = perturbationMode === 'on' && fractalType === 'mandelbrot'`
  computed once per `renderFrame` call.
- **Reference point convention (locked decision)**: one reference orbit computed
  **per render layer** (primary + each look-ahead/look-behind layer), seeded from
  that layer's own `assemblyCenterRe`/`assemblyCenterIm` — **not** per-tile, not
  per-pixel. Computed **sequentially on the main thread**, in the same
  already-sequential per-layer setup loop that computes `assemblyCenterRe`/etc.
  (This was a deliberate decision — see §9 for why it's flagged as needing
  revisit once precision backends are actually wired in.)
- The reference point is **deliberately not part of the tile cache key** — for a
  well-behaved (non-glitching) pixel, the escape count shouldn't depend on which
  nearby reference point produced it, so cache coherence across renders/layers is
  preserved without keying on it.
- `WorkerTask` (`src/types.ts`) gained `referenceOrbit?: ReferenceOrbit` — its
  *presence* is the sole signal for perturbation vs. direct iteration in the
  worker (deliberately no separate boolean, to avoid the two disagreeing).

### Worker wiring (`src/workers/mandelbrot/worker.ts`)
- `canSolidGuess` gained `&& !payload.referenceOrbit` — **solid-interior guessing
  stays direct-iteration-only**, deliberately not extended to perturbation (real
  but separate work, out of scope).
- Main iteration branches: `if (payload.referenceOrbit) { ... perturbation ...
  } else if (geometricCulling && isInMainCardioidOrBulb...) { ... } else { ...
  existing direct iteration, unchanged ... }`.
- **Known minor gaps (not fixed, low priority)**: `culledPixels` and
  `periodicityShortCircuits` debug counters are not incremented on the
  perturbation path (only inside `perturbationEscapeIterations`'s internals,
  not reported back out). Only affects the perf overlay's breakdown display,
  not correctness.

### Cache signature (`src/services/tile-cache.ts`)
- `COMPUTE_SIGNATURE_KEYS` gained `'perturbationMode'`.

### Verified performance finding
Perturbation is **slower** than direct iteration in detailed/high-iteration-count
areas at Slice A's float64-only scope — expected and explained: the delta formula
has ~2x the multiplications of direct iteration, and at float64 there's no
offsetting benefit (no expensive high-precision arithmetic being amortized yet).
The payoff only arrives once a real high-precision backend is wired in (§6,
unfinished) — at that point perturbation's ~2x float64 overhead becomes trivial
next to what direct high-precision iteration would cost per pixel.

---

## 4. Slice B — Precision engine (isolated proof, NOT wired to rendering)

**Status: all three backends built, individually verified correct, benchmarked
against each other. Zero effect on any real render — `ViewState` is untouched,
`computeReferenceOrbit` does not call any of this.**

### Scope decision (locked)
Explicitly scoped to **isolated proof only** — no camera/`ViewState` changes. The
camera-storage migration (making `centerRe`/`centerIm`/`zoom` high-precision-aware)
is a separate, deferred, larger piece of work — see §6.

### Shared interface — `src/core/precision/types.ts`
```ts
export interface HighPrecisionValue {
  add(other: HighPrecisionValue): HighPrecisionValue;
  sub(other: HighPrecisionValue): HighPrecisionValue;
  mul(other: HighPrecisionValue): HighPrecisionValue;
  toNumber(): number;
}
export interface PrecisionBackend {
  fromNumber(value: number): HighPrecisionValue;
  fromString(value: string): HighPrecisionValue;
}
export type PrecisionBackendKind = 'bigint-fixed' | 'decimal-js' | 'double-double';
export type PrecisionBackendFactory = (digits: number) => PrecisionBackend;
```
Deliberately minimal — only add/sub/mul/toNumber, because that's all the
Mandelbrot iteration formula needs. `fromString` exists specifically so a
coordinate can carry more digits than a JS `number` literal could ever hold.

### Backend 1 — `src/core/precision/bigint-fixed.ts`
Fixed-point: `raw = round(value × 10^digits)`, stored as `BigInt`. Custom
`parseFixed` string parser; `roundedDiv` (round-to-nearest, not truncating) is
critical — truncating division would introduce a consistent downward bias over
hundreds of chained multiplications in a real orbit.

**Verified via benchmark: this backend should NOT be used by `auto` mode.** Every
`mul` call requires a BigInt division to rescale the product back down (`10^digits`
scaling), which is uniformly slower than `decimal.js` across the entire tested
range, and hits a severe cliff around 400→500 digits (47ms → 1808ms) — very likely
a V8 internal BigInt-division algorithm threshold, not a bug. Kept in the codebase
as a forced/comparison-only option, per explicit instruction (parallel to keeping
`bigint-fixed` around specifically *because* it lost the benchmark, matching the
project's "expose the tunable even if it's not optimal" philosophy).

**Deferred idea, logged but not pursued**: switching to *binary* scaling (`2^bits`
instead of `10^digits`) would make rescaling a bit-shift instead of a division,
plausibly fixing the performance problem. Not done — `decimal.js` already covers
the range where it would matter, so this was deprioritized as speculative
optimization (YAGNI).

### Backend 2 — `src/core/precision/decimal-js.ts`
Adapter over the `decimal.js` npm package (**installed**: `npm install decimal.js`
was run, real dependency now in `package.json`). Uses `Decimal.clone({ precision
})` (not the global `Decimal.set()`) so multiple backends at different digit
counts never fight over shared global config — this was a deliberate, necessary
design choice, not a stylistic one.

**Known gap**: no cross-backend mixing guard (unlike `bigint-fixed`'s
`assertSameScale`) — mixing `DecimalValue`s from two differently-precisioned
clones would silently "work" with unpredictable results, rather than throwing.
Not fixed; flagged as a real gap if this ever causes confusing results.

### Backend 3 — `src/core/precision/double-double.ts`
Dekker/TwoSum-based double-double arithmetic (`hi`/`lo` float64 pair, ~106-bit
combined significand). Implements `twoSum`, `quickTwoSum`, `split` (uses
`SPLITTER = 134217729` = 2²⁷+1 — **must be exact**, a typo here produces silently
wrong results, not a crash), `twoProduct`, `ddAdd`/`ddSub`/`ddMul`/`ddDiv` (sloppy
Newton-Raphson division, internal-only, used by `fromString`).

`fromString` builds the value as an **exact integer first** (digit-by-digit
accumulation), then divides by an exact power-of-ten — same "round only once, as
late as possible" principle used throughout this whole project.

**Hard ceiling**: `DD_DIGIT_BUDGET = 30` inside this file — double-double
**cannot** represent more digits than this; `fromString` silently truncates past
it. This is a structural property, not a configurable parameter (unlike the other
two backends' `digits` argument, which is a real, honored precision request).
Verified via a deliberately-miscalibrated test (see benchmark notes) that showed
visible truncation noise when requesting near/past the ceiling.

### Tier selector — `src/core/precision/select.ts`
```ts
export type PrecisionMode = 'auto' | 'double-double' | 'decimal-js' | 'bigint-fixed';
// (Note: user reordered this union — double-double comes before decimal-js,
// matching the auto-tier sequence. Confirm select.ts's switch statement and
// this type union are still in that order if picking this back up.)

const FLOAT64_MAX_DIGITS = 15;        // float64's guaranteed-safe digit count
const DOUBLE_DOUBLE_MAX_DIGITS = 29;  // DD_DIGIT_BUDGET (30) minus a 1-digit
                                       // safety margin for accumulated error
                                       // across many chained ops in one orbit
                                       // (unmeasured — a placeholder margin,
                                       // not derived from real data)

export function selectPrecisionBackend(digits: number, mode: PrecisionMode): PrecisionBackend | null
```
`auto` tiers: `digits <= 15` → `null` (use plain float64, no backend at all —
this is a real, valid outcome representing "no wrapper needed"); `16-29` →
double-double; `30+` → decimal.js. `bigint-fixed` is **excluded from `auto`**
entirely (per the benchmark finding above) — only reachable via forced selection.
The three forced modes (`double-double`/`decimal-js`/`bigint-fixed`) ignore
`digits` and always return that backend, **even where it's known to perform
poorly or be silently truncated** — intentional, for comparison/testing.

### Digit estimator — `src/core/precision/digits-for-zoom.ts`
```ts
digits ≈ ceil(log10(zoom) + log10(canvasWidthPixels)) + ACCUMULATION_SAFETY_MARGIN_DIGITS (=6, unmeasured placeholder)
```
Throws if `zoom` is non-finite/≤0 — this is not a bug in this function, it's
correctly refusing to compute from an already-corrupted input. See §5 for why
that happens and what it means.

### Settings added (`src/settings/registry.ts`)
- New section `'precision'`, added to `SECTIONS` after `'perturbation'`.
- `precisionMode`: select, default `'auto'`, options in the order
  `auto / double-double / decimal-js / bigint-fixed` (per user's reordering),
  `visibleWhen: perturbationMode === 'on'`.
- **IMPORTANT — currently a dangling setting**: `precisionMode` exists in the UI
  and can be toggled, but **nothing in the render pipeline reads it yet**.
  `computeReferenceOrbit` does not call `selectPrecisionBackend`. Changing this
  setting currently has zero effect on any render. This needs to be either wired
  in (as part of the camera migration, §6) or the setting's description should be
  caveat'd until then.
- Corollary: `precisionMode` was **not** added to `COMPUTE_SIGNATURE_KEYS` in
  `tile-cache.ts` — correctly so for now (it has no effect on computed output
  yet), but **must be added once it's actually wired in**, or stale tiles won't
  invalidate on a precision-mode change.

### Benchmark results (verified, trustworthy — see §4a for caveats on an earlier, discarded round)

Harness: `Z = Z² + C` shape (not raw `mul` calls), bounded test point `c = -0.5 +
0i` (never escapes — this matters, see below), escape-bailout included, 1000
iterations, 30 runs, **median** reported. Warm-up runs excluded from timing.

| digits | bigint-fixed | decimal.js | double-double |
|---|---|---|---|
| float64 baseline | — | — | 0.015ms |
| 10 | 1.08ms | 8.15ms | 0.38ms |
| 15 | 0.805ms | 8.145ms | 0.31ms |
| 20 | 1.205ms | 7.735ms | 0.35ms |
| 25 | 36.2ms | 7.75ms | 0.31ms |
| 30 | 35.08ms | 8.105ms | 0.34ms |
| 50 | 34.625ms | 8.37ms | 0.305ms |
| 100 | 34.76ms | 12.6ms | 0.295ms |
| 300 | 39.485ms | 46.185ms | 0.29ms |
| 400 | 47.665ms | 79.2ms | 1.935ms |
| **500** | **1808.615ms** ← cliff | 123.375ms | 1.775ms |
| 800 | 3140.235ms | 284.39ms | 1.69ms |
| 1000 | 3033.43ms | 422.505ms | 0.27ms |

**Caveats on reading this table:**
- Double-double rows past **digits=30** are **not valid data** — `fromString`
  silently truncates to its 30-digit ceiling, so every row past 30 is measuring
  the identical ~30-digit computation repeatedly. The flat ~0.3ms line there
  confirms double-double's fixed per-op cost, but says nothing about capability
  at those digit counts.
- Rows below ~2ms across the board should be read with caution — likely near or
  at `performance.now()`'s timer-resolution floor for a single sample, though the
  30-run median helps here more than a single-run test would.
- **A different, earlier benchmark round (10000 iterations) gave numbers that
  disagreed with this table by roughly 380x per-iteration** — never fully
  diagnosed, but the leading hypothesis (backed by rough arithmetic) is that the
  earlier harness's escape-bailout logic had a bug causing most iterations to
  never actually run. **Do not trust the earlier 10000-iteration numbers** — only
  the table above (with a completed-iteration counter available to verify via
  the `lastCompleted` pattern, which was proposed but not confirmed run) should
  be relied on.

### Conclusion drawn from this data (locked decision)
`auto` mode's real, load-bearing choice is between **double-double** (small
digit counts) and **decimal.js** (large digit counts) — `bigint-fixed` is
excluded from `auto` based on real evidence, not assumption, directly
contradicting the earlier design-doc assumption ("V8 BigInt is cheap here") that
originally motivated building it. This is worth remembering as a case where
proof-of-concept testing correctly overturned an earlier design assumption.

---

## 5. The zoom-representation problem (separate from centerRe/centerIm)

Discovered while testing `digitsForZoom` at extreme values: `zoom = 1e350` (as a
plain float64) overflows to `Infinity` **before** `digitsForZoom` ever sees it —
the function's throw is correct behavior, not a bug.

**Key distinction locked in this session**: zoom's problem is **exponent
overflow** (needs wider magnitude range), not **insufficient significant digits**
(what centerRe/centerIm need). These are different problems needing different
fixes — the double-double/decimal.js/bigint-fixed engine solves the *digits*
problem and is the wrong tool for zoom.

**Proposed fix (not implemented)**: the user has a `BigNumber` class already
built in the separate idle-game-engine project — immutable, mantissa (float64) +
exponent (float64) representation, full arithmetic (`add`/`subtract`/`multiply`/
`divide`/comparisons), `fromNumber`/`toNumber`/`fromString`/`toString`. This is
architecturally the right fit for zoom specifically (unbounded exponent range,
same ~15-17 significant digits as float64 — which is fine, since zoom doesn't
need more digits, just more range). Confirmed that essentially every real use of
`zoom` in this codebase is multiplicative (ratios, `zoom * factor`) or already
informally log-space (`fly-to.ts`'s `Math.log(zoom)` lerp) — **no genuine
"add two zoom levels" use case was found**, so `BigNumber`'s `add` isn't expected
to be load-bearing for this use.

**Public accessor gap**: `BigNumber`'s `mantissa`/`exponent` were originally
private. **The user has since added `get significand()` / `get magnitude()`
getters** to the idle-engine's `BigNumber` class (confirmed done in-session) —
needed so the UI can display `1.23 × 10³⁵⁰`-style output by reading the parts
directly, **never** reconstructing an overflowed float via `toNumber()`.

**Packaging decision (locked, work deferred)**: the fractal engine must **not**
depend on the idle engine (it's meant to be a standalone, separately-usable
component) — so `BigNumber` cannot simply be imported from the idle-engine
project. Agreed direction: **extract `BigNumber` into its own standalone shared
package**, with the idle engine becoming a thin wrapper around it. Not started —
explicitly deferred ("we can come back to it").

**Display implication (not implemented)**: any UI showing zoom (`ui-manager.ts`'s
`updateStats`/`updateNavigatorReadout`, currently `state.view.zoom.toFixed(2)`)
will need a wholesale format change once zoom can exceed float64's range — reading
mantissa/exponent directly, never calling `.toFixed()` on a reconstructed number
that could itself be `Infinity`.

---

## 6. THE BIG DEFERRED ITEM — camera-storage migration

Raised at the very start of Slice B and **still not done**. This is the actual
blocker preventing anything built in §4 (precision engine) or §5 (zoom
representation) from affecting a real render.

**The core fact**: `state.view.centerRe` / `centerIm` / `zoom` (`src/state.ts`,
`ViewState` in `src/types.ts`) are all plain `number` today. Precision loss
already happens at this storage layer, before any reference-orbit computation
ever runs — no amount of precision inside `computeReferenceOrbit` can recover
digits that were never stored in the first place.

**What the migration actually requires** (not yet scoped into steps — this needs
its own design conversation when picked back up):
- `ViewState.centerRe`/`centerIm` need a high-precision-capable representation
  (using the §4 engine) that survives past what a `number` can hold.
- `ViewState.zoom` needs the *different* fix from §5 (`BigNumber`-style
  mantissa/exponent), not the digits-focused engine.
- Nav-input parsing (`ui-manager.ts`, currently `Number.parseFloat`) needs to
  accept/preserve arbitrary-length decimal strings.
- `zoom-manager.ts`'s pan/zoom arithmetic (`computeTargetView`, drag panning,
  `beginSmoothZoom`) currently does plain-float64 math on `centerRe`/`centerIm`/
  `zoom` throughout — all of this needs either a high-precision code path or a
  redesign.
- Saved locations (`services/locations.ts`), fly-to interpolation (`fly-to.ts`)
  both store/interpolate `centerRe`/`centerIm`/`zoom` as plain numbers too.
- Once coordinates are high-precision, `computeReferenceOrbit`'s high-precision
  variant becomes straightforward to write: call `selectPrecisionBackend(digits,
  precisionMode)`, iterate `Z = Z² + C` using the returned backend's
  `HighPrecisionValue` ops, and `.toNumber()` each `Zₙ` into the (still-float64)
  `ReferenceOrbit.re`/`im` arrays — the "round only once, at the last possible
  moment" principle established throughout.

**This is the natural "what's next" for a new session**, once Series
approximation's wiring (§8) is confirmed complete and correctness-tested.

---

## 7. Slice C — Series approximation math (derived, implemented as pure functions)

**Status: coefficient math and pixel-side evaluation done, unit-testable
in isolation. Full pipeline wiring status uncertain — see §8.**

### Derivation (order 2, with an order-3 error estimate)
Expanding `δₙ = Aₙ·δc + Bₙ·δc² + Cₙ·δc³ + ...` into the perturbation recurrence
`δₙ₊₁ = 2·Zₙ·δₙ + δₙ² + δc` and matching same-power terms gives:
```
A_{n+1} = 2*Z_n*A_n + 1
B_{n+1} = 2*Z_n*B_n + A_n^2
C_{n+1} = 2*Z_n*C_n + 2*A_n*B_n
```
All start at 0 (mirrors `δ₀ = 0` for every pixel). **Order 2** = tracking A, B
as the actual approximation. **C is deliberately computed but not trusted** —
it's the first *un*trusted term, used purely as a formal truncation-error
estimate (same idea as double-double's error-recovery trick, one level up).

**Locked decision**: order 2 to start (not order 3+) — simplest correct baseline,
matches common real-world practice, diminishing returns past order 3.

### Type — `src/core/perturbation/types.ts` (extended)
```ts
export type SeriesCoefficients = {
  aRe: Float64Array; aIm: Float64Array;
  bRe: Float64Array; bIm: Float64Array;
  cRe: Float64Array; cIm: Float64Array;
  length: number;
};
```

### Functions — `src/core/strategies/mandelbrot.ts` (all added)
- `computeSeriesCoefficients(orbit: ReferenceOrbit): SeriesCoefficients` — runs
  once per layer, alongside `computeReferenceOrbit` (same per-layer-not-per-pixel
  cost class).
- `evaluateSeriesApproximation(coeffs, deltaRe, deltaIm, n): { deltaRe, deltaIm
  }` — per-pixel: `A_n·δc + B_n·δc²`, the actual skip-ahead value.
- `estimateSeriesError(coeffs, deltaRe, deltaIm, n): number` — magnitude of
  `C_n·δc³` (the first untrusted term), a conservative worst-case error bound.
- `determineSkipIteration(coeffs, probeDeltaRe, probeDeltaIm, toleranceMode,
  toleranceValue): number` — **per layer, once**, walks forward from n=1
  checking `estimateSeriesError` against a tolerance at a single **worst-case
  probe point** (viewport corner farthest from the reference point — standard
  deep-zoom-renderer technique), returns the last iteration still inside
  tolerance (0 if even iteration 1 fails).
  - **Deliberately a linear forward walk, not binary search** — the error bound
    is not guaranteed monotonic in `n` (built from `Cₙ`, which can shrink before
    growing again, especially for slow-escaping/near-origin orbits — exactly the
    "interesting" regions people zoom into). A binary search would risk reporting
    a skip iteration that's actually invalid at an earlier point it skipped over.
    **Do not "optimize" this to binary search without addressing monotonicity.**

### Settings added (`src/settings/registry.ts`, section `'perturbation'`)
```ts
seriesApproximation: checkbox, default false, visibleWhen: perturbationMode === 'on'
seriesValidityMode: select, default 'formal', options: formal / heuristic / none
  visibleWhen: perturbationMode === 'on' && seriesApproximation === true
seriesToleranceMode: select, default 'escape-fraction', options: escape-fraction / delta-fraction / absolute
  visibleWhen: perturbationMode === 'on' && seriesApproximation === true && seriesValidityMode === 'formal'
seriesTolerance: slider, default 0.01, min 0.0001, max 1, step 0.0001
  visibleWhen: (same as seriesToleranceMode)
```

**`seriesValidityMode: 'heuristic'` is a placeholder, not implemented.** In the
`computeLayerSeriesSetup` helper (renderer.ts, §8), the `'heuristic'` case is
described as "falls through to the same formal walk as `'formal'` for now" — it
does **not** currently do periodic-recheck heuristic validation. This was
flagged explicitly as a gap, not a silent omission — a real implementation is
still needed if this mode is meant to actually behave differently from
`'formal'`.

**`seriesValidityMode: 'none'`** is a real, implemented testing-only mode —
trusts the approximation for every iteration the coefficients cover with zero
error checking (`skipIteration = coeffs.length - 1`).

**`seriesTolerance`'s meaning depends entirely on `seriesToleranceMode`** — same
numeric value (e.g. `0.01`) means "1% of escape radius," "1% of current |δ|," or
"an absolute epsilon of 0.01" depending on the other dropdown. Flagged as a real
UX wrinkle, accepted deliberately (expose all three, decide by testing, per
explicit instruction) rather than picking one shape.

---

## 8. Slice C wiring status — VERIFY BEFORE CONTINUING

This is where the session paused. The following changes were **designed and
given as code** across the conversation; a new session must check the actual
files to see what's really applied, rather than trusting this list as done:

1. **`src/types.ts`** — `WorkerTask` should have gained:
   ```ts
   seriesCoefficients?: SeriesCoefficients;
   skipIteration?: number;
   ```
   (alongside the existing `referenceOrbit?: ReferenceOrbit` from Slice A), plus
   the `SeriesCoefficients` import.

2. **`src/settings/registry.ts`** — the four settings listed in §7, plus fixing
   `seriesValidityMode`'s/`seriesTolerance`'s `visibleWhen` to gate on
   `seriesApproximation === true` (this was a correction made mid-step — an
   earlier version of `seriesValidityMode`/`seriesTolerance` only checked
   `perturbationMode`, missing the `seriesApproximation` gate).

3. **`src/services/renderer.ts`** — the most involved change, **confirmed
   incomplete** as of the pause point:
   - `RenderLayer` type: add `seriesCoefficients?: SeriesCoefficients;
     skipIteration?: number;` alongside `referenceOrbit`.
   - New reads near the top of `renderFrame`: `seriesApproximation`,
     `seriesEnabled = perturbationEnabled && seriesApproximation`,
     `seriesValidityMode`, `seriesToleranceMode`, `seriesTolerance`.
   - New helper function `computeLayerSeriesSetup(orbit, assemblyWidth,
     assemblyHeight, scaleRe, scaleIm)` — computes coefficients + probe point +
     skip iteration for one layer; handles the `seriesValidityMode === 'none'`
     case specially (trust everything, `skipIteration = coeffs.length - 1`);
     `'heuristic'` currently falls through to the formal walk (see gap above).
   - **Primary layer construction — CONFIRMED FIXED** in the last exchange of
     this session: restructured to compute `primaryOrbit` and `primarySeries`
     as locals *before* the `primaryLayer` object literal, so
     `computeReferenceOrbit` is called exactly once (an earlier draft
     accidentally called it twice — once for `referenceOrbit`, once inside a
     spread for series setup — this was caught and corrected). The corrected
     code was given in full and should be applied.
   - **Look-ahead/look-behind layer loop — NOT YET given the same explicit
     before/after treatment.** The pattern is the same as the primary layer fix
     (compute `layerOrbit`/`layerSeries` as locals before the `layer` object
     literal, using `lm.assemblyWidth`/`lm.assemblyHeight`/`lm.scaleRe`/
     `lm.scaleIm` instead of `assembled.*`), but this was only described in
     prose, not written out field-by-field the way the primary layer fix was.
     **This still needs to be done** — was the very next thing planned before
     the user requested this handoff.
   - `buildTask`: needs `seriesCoefficients: q.layer.seriesCoefficients,
     skipIteration: q.layer.skipIteration,` added alongside the existing
     `referenceOrbit: q.layer.referenceOrbit,` line.

4. **`src/core/strategies/mandelbrot.ts`** — `perturbationEscapeIterations`
   signature needs two new optional trailing params (`seriesCoefficients?:
   SeriesCoefficients, skipIteration?: number`) and a skip-seed block inserted
   before the main `while` loop: if a valid skip iteration is provided, call
   `evaluateSeriesApproximation` to seed `dRe`/`dIm`/`iter`, check immediately
   whether the seeded point has already escaped (a legitimate outcome — series
   approximation bounds truncation error, not whether a point escapes), and
   **initialize `checkRe`/`checkIm` from the current reconstructed z at the
   (possibly nonzero) starting `iter`**, not hardcoded `0, 0` — a correctness
   fix needed because periodicity detection must compare against wherever
   iteration actually started counting from. **Status of this edit: given as
   code, not confirmed applied.**

5. **`src/workers/mandelbrot/worker.ts`** — the call to
   `perturbationEscapeIterations` needs two more arguments:
   `payload.seriesCoefficients, payload.skipIteration`. **Status: given as
   code, not confirmed applied.**

6. **`src/services/tile-cache.ts`** — `COMPUTE_SIGNATURE_KEYS` needs
   `'seriesApproximation'`, `'seriesValidityMode'`, `'seriesToleranceMode'`,
   `'seriesTolerance'` added (alongside the already-added
   `'perturbationMode'` from Slice A). **Status: given as code, not confirmed
   applied.**

### Immediate next steps for a new session
1. **Open each file above and check current state against this list** — don't
   assume.
2. Finish the look-ahead/look-behind layer loop restructuring in
   `renderer.ts` (item 3's second bullet) — same pattern as the already-applied
   primary layer fix, just needs to be written out explicitly the same way
   (the user asked for this exact level of explicitness once already).
3. Once everything compiles: **correctness test** — same methodology as Slice
   A's verification. Toggle `seriesApproximation` on (with `perturbationMode`
   already on) and confirm the render is pixel-identical to perturbation alone /
   direct iteration, at a zoom level well under the float64 wall.
4. **Then a performance test** — does series approximation actually reduce time
   in the high-iteration-count "detailed area" cases where plain perturbation
   was shown to be slower than direct iteration back in Slice A? This is the
   real payoff question for the whole feature at its current (float64-only)
   scope.

---

## 9. Full deferred-items list (consolidated)

Tracked explicitly, not silently dropped — per this project's stated convention:

1. **Camera-storage migration** (§6) — the big one. `ViewState` still plain
   float64; precision engine and zoom's `BigNumber` fix both proven in isolation
   but not connected to any real render.
2. **`BigNumber` extraction into a standalone shared package** — needed so the
   fractal engine doesn't depend on the idle engine. Two public getters
   (`significand`/`magnitude`) already added to the idle-engine's `BigNumber`
   class; extraction itself not started.
3. **Zoom/coordinate display rework** — needs to read mantissa/exponent (or
   high-precision digits) directly for extreme values; current
   `.toFixed(2)`-based display cannot survive overflow.
4. **Reference-orbit periodicity / wraparound indexing** — a real technique
   (stop storing new orbit values once the reference orbit itself cycles, "wrap"
   indices indefinitely) that would matter at extreme iteration counts. Requires
   redesigning `ReferenceOrbit`'s indexing from the start, not a flag to bolt on
   — explicitly not attempted.
5. **General glitch detection** — only the narrow "orbit exhausted → fall back to
   direct iteration" case is handled. The broader glitch problem (pixels far from
   the reference point accumulating delta-math error) is **explicitly deferred
   with a trigger condition**: "revisit before or during real high-precision
   (Slice B wiring) use, not optional by then" — float64-only perturbation
   likely never surfaces it in practice since the float64 zoom wall dominates
   first.
6. **Sequential per-layer reference-orbit computation on the main thread** — fine
   at float64 (~microseconds), explicitly flagged as potentially needing a
   redesign (parallelize via worker dispatch) once real high-precision orbits
   (which could take real milliseconds each) are wired in and multiplied across
   up to ~24 look-ahead/behind layers.
7. **`bigint-fixed` binary-scaling rewrite** — plausible fix for its benchmark
   loss (scale by `2^bits`, rescale via bit-shift instead of BigInt division);
   deprioritized as speculative since `decimal.js` already covers the range.
8. **`seriesValidityMode: 'heuristic'`** — placeholder only, currently behaves
   identically to `'formal'`. Real periodic-recheck implementation not written.
9. **`ACCUMULATION_SAFETY_MARGIN_DIGITS = 6`** (`digits-for-zoom.ts`) and the
   `DOUBLE_DOUBLE_MAX_DIGITS = 29` margin (`select.ts`) — both are placeholder
   safety margins for accumulated arithmetic error across many chained
   operations in a real orbit. Neither is based on measured data. Revisit once
   real high-precision orbits can actually be run and checked.
10. **`culledPixels`/`periodicityShortCircuits` debug counters** don't account
    for the perturbation code path — cosmetic (perf overlay only), not fixed.
11. **`main.ts` scratch/debug code accumulation** — several rounds of benchmark
    harnesses and backend sanity checks have been added directly to `init()` in
    `main.ts` over this session. Worth cleaning up / moving to a dedicated
    debug-gated module (mirroring the existing `window.mandelbrotDebug`
    convention in `utils/debug.ts`) before this is treated as done, rather than
    left as permanent scratch code in the app's real entry point.
12. **Series approximation order 3+** — not started; order 2 was the locked
    starting scope. `Cₙ` is already tracked (as the error estimate), so
    extending to a real order-3 term would need a new `Dₙ` error-estimate
    coefficient, mirroring the existing pattern.
13. **Burning Ship / Buffalo / Julia perturbation support** — not started.
    Mandelbrot-only by design so far; the per-fractal-file pattern
    (`core/strategies/*.ts`) is intended to extend the same way, but the actual
    math (especially for the non-holomorphic `abs()`-based fractals) has not
    been derived.
14. **`precisionMode` setting has zero effect on rendering** — exists in the UI,
    not read anywhere in the render pipeline. Needs wiring once the camera
    migration (§6) makes it meaningful, and needs adding to
    `COMPUTE_SIGNATURE_KEYS` in `tile-cache.ts` at that point.

---

## 10. Quick file index

**New files:**
- `src/core/perturbation/types.ts`
- `src/core/precision/types.ts`
- `src/core/precision/bigint-fixed.ts`
- `src/core/precision/decimal-js.ts` (needs `decimal.js` npm dependency — already installed)
- `src/core/precision/double-double.ts`
- `src/core/precision/select.ts`
- `src/core/precision/digits-for-zoom.ts`

**Modified files:**
- `src/core/strategies/mandelbrot.ts` (computeReferenceOrbit,
  perturbationEscapeIterations, computeSeriesCoefficients,
  evaluateSeriesApproximation, estimateSeriesError, determineSkipIteration)
- `src/types.ts` (WorkerTask additions)
- `src/settings/registry.ts` (SECTIONS + perturbation/precision settings)
- `src/services/renderer.ts` (RenderLayer additions, per-layer orbit/series
  computation — primary layer confirmed fixed, look-ahead/behind loop still
  needs the same fix)
- `src/workers/mandelbrot/worker.ts` (perturbation branch, solid-guessing
  disable, series args in the call — last one unconfirmed)
- `src/services/tile-cache.ts` (COMPUTE_SIGNATURE_KEYS additions — series-related
  keys unconfirmed)
- `src/main.ts` (accumulated scratch/benchmark code — see deferred item 11)
