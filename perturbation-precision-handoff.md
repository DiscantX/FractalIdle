# Handoff: Arbitrary Precision & Perturbation Rendering

## Context

This document captures a design conversation about adding **perturbation rendering**
to the standalone Mandelbrot Canvas renderer project, to push past the precision
wall that plain `number` (IEEE-754 double) coordinates hit at deep zoom. It picks
up from a much older brainstorm (`idle-fractal-game-design.md`) that first raised
the idea and sketched a rough `IFractalNumber` interface, and turns it into a
concrete, benchmarked implementation plan.

**Reminder of project convention:** in the fractal-game codebase specifically,
Claude writes code directly (unlike the idle-engine project, which uses a
tutoring/step-by-step pattern). This doc is written for that direct-implementation
context.

---

## 1. The core problem

`ViewState.centerRe` / `centerIm` (`src/types.ts`) and the per-pixel offset math in
each worker (e.g. `cRe = centerRe + (x - width/2) * scaleRe`) all use plain JS
`number`. A `number` has ~15-16 significant decimal digits of precision, full stop,
regardless of exponent. Past roughly zoom `10^15`, adjacent pixels round to the same
coordinate and the render breaks down. Real deep-zoom software solves this with
**perturbation theory**: compute one point's orbit at very high precision (the
"reference orbit"), then compute every other pixel as a cheap, ordinary-precision
*delta* from that shared reference.

---

## 2. Decision: fixed-point BigInt, not a floating "BigFloat"

We need a new numeric type for camera coordinates (`centerRe`/`centerIm`) and the
reference-orbit computation. Two options were weighed:

- **External arbitrary-precision decimal library** (decimal.js, big.js, etc.) — battle
  tested, but general-purpose (division, string parsing, etc. we don't need) and an
  external dependency, which cuts against this codebase's pattern of hand-rolling
  core numeric types (see the idle engine's `BigNumber`).
- **Roll our own, BigInt-backed, fixed-point** (chosen direction) — a `BigInt`
  mantissa plus an *agreed, fixed* number of fractional bits (a "scale"), rather than
  a floating exponent. Rationale:
  - The reference orbit only ever needs **add, subtract, multiply, compare** — never
    division, which is the hardest operation to implement correctly in
    arbitrary-precision math. Avoiding it removes the single biggest risk of
    "roll your own."
  - Camera coordinates always live in a small, bounded magnitude range
    (`centerRe`/`centerIm` roughly in `[-2, 2]`) no matter how deep the zoom — what
    grows is *digits after the leading digit*, not magnitude. That's exactly what
    fixed-point represents; a floating exponent would be solving a problem we don't
    have.
  - Performance is a non-issue for the reference orbit itself: at most
    `maxIterations` high-precision multiplications per render (see benchmark below),
    vastly cheaper than the per-pixel tile work.

**Why NOT the idle engine's `BigNumber`:** `BigNumber` and this new type solve
*opposite* problems, despite both being "JS number isn't enough" fixes:

| | Idle engine `BigNumber` | Camera precision type |
|---|---|---|
| What grows | **Magnitude** (10 → 10^300 → 10^10000...) | **Digit count**, magnitude stays tiny (`[-2,2]`) |
| Shape | Mantissa (plain `number`, ~16 digits) + exponent | Fixed-point `BigInt` (unbounded digits, no exponent) |
| Why it works | Exponent does the useful work; mantissa doesn't need to grow, nobody reads digit #17 of a Compute stat | There's no useful exponent to have (always near zero); we need the mantissa itself to hold hundreds/thousands of digits, which a `number`-based mantissa structurally cannot do at any exponent |

`BigNumber`'s mantissa is secretly a `number` underneath, capped at ~16 significant
digits regardless of exponent — that cap is exactly what breaks for camera
coordinates. Conversely, `BigInt` is expensive when magnitude (digit count) is huge
even for *ordinary*-precision numbers — which is why the idle engine correctly
does NOT use raw BigInt for Compute stats (`10^10000` as a literal BigInt is a
10,001-digit integer; every operation scales with that).

**Side note, not needed now but worth remembering:** a "precise BigNumber" (BigInt
mantissa + exponent, giving both huge range AND huge precision) is a real, named
technique — used by libraries like MPFR — and *would* be possible to build. We don't
need it anywhere in this project; flagging only so it isn't reinvented by accident
later.

---

## 3. Decision: precision must scale with zoom, not be one fixed constant

Worked the math against the deepest verified real-world zoom record found via
search (~**10^218,831**, an Oct 2025 fractal-explorer render, 22+ hours,
non-real-time). Viewport width at zoom `Z` is `4/Z` (see `renderer.ts`), so
resolving individual pixels needs roughly as many correct decimal digits as the
zoom exponent. At `10^218,831` that's ~218,831 digits ≈ 727,000 bits ≈ 91 KB per
coordinate — storage is trivial, but naive BigInt multiplication cost grows
roughly with bit-count squared, so a fixed budget sized for that record would make
*shallow* zoom absurdly slow, while a budget sized for speed would wall off at a
shallow, easily-reachable depth.

**Conclusion:** the fractional-bit budget must be computed per-render from the
current zoom level, not hardcoded.

---

## 4. Benchmark: is precision actually going to be the bottleneck?

Built and ran a Node benchmark (`bigint-orbit-benchmark.mjs`, sandbox-only, not
committed to the repo) simulating the real cost shape: repeated
`z = z² + c` on a fixed-point BigInt, truncating back to the target bit-width after
each multiply — i.e., the actual reference-orbit recurrence.

**Two bugs hit and fixed along the way (worth knowing if this gets re-run/rebuilt):**
1. First version used a **purely random** `z`/`c`. Almost any random point on the
   plane escapes to infinity under real Mandelbrot iteration — once `|z| > 2`,
   squaring roughly doubles bit-length each step, blowing past BigInt's internal
   size limit within ~30 iterations. Real reference points are chosen specifically
   because they *don't* escape. Fixed by iterating from a known-bounded point
   (`c = -0.5`, inside the main cardioid, `z` starts at `0`) — the actual shape of a
   real reference-orbit computation.
2. Converting the scale factor (`2^bits`) through a JS `number` to build the
   fixed-point representation overflows to `Infinity` past ~1024 bits (double's max
   exponent). Fixed by computing the fixed-point value via pure `BigInt` shifts
   (`-0.5` == `-(2^(bits-1))` at scale `2^bits`), never routing through `number`.

**Results** (Node/V8, single reference orbit, 1000 iterations; ×3 column adjusts for
real complex-number iteration needing 3 real multiplications per step — squaring
`z²` plus the multiply against the reference orbit — vs. the 1 squaring actually
benchmarked):

| bits | ~zoom depth | measured (1 mult) | ×3 (real complex math) |
|---|---|---|---|
| 1024 | 10^308 | 2 ms | ~6 ms |
| 4096 | 10^1233 | 10 ms | ~30 ms |
| 16384 | 10^4932 | 79 ms | ~237 ms |
| 65536 | 10^19728 | 712 ms | ~2.1 s |
| 131072 | 10^39457 | 1.2 s | ~3.6 s |

**Conclusion:** thanks to V8's native BigInt using sub-quadratic multiplication
internally, reference-orbit cost stays sub-second out to roughly `10^4000`-ish and
doesn't cross a "clearly slow" threshold (~1-2s) until roughly `10^19000+`.
Extrapolating, even the real-world `10^218,831` record would likely land in
single-digit seconds for the orbit alone.

**Implication:** the reference-orbit BigInt cost is very unlikely to be what
creates "the Wall" the MDD's Computational Complexity (3.2.3) leans on for pacing —
players are unlikely to ever reach depths where this cost is felt. The wall is far
more likely to come from **per-pixel iteration count** and/or **glitch
detection/rebasing frequency** at extreme depth, neither of which has been
benchmarked yet. **This is good news for game design** (we're not fighting physics,
we can tune difficulty deliberately) but means the *actual* bottleneck is still an
open question — see §7.

---

## 5. Tile rendering architecture under perturbation

**Key point: the expensive part (reference orbit) happens once per render, not once
per tile or per pixel.** The existing tile grid / worker pool / dispatch queue in
`renderer.ts` doesn't need to change shape — it needs one new shared input.

Planned module layout:

- **`src/core/precision/FixedPointBigInt.ts`** — the type itself. `add`, `subtract`,
  `multiply` (double-width result, truncate back to the fixed bit-width — this is
  the operation benchmarked above), conversions to/from `number`. Lives alongside
  `core/strategies/`, not inside it (foundational math, not a fractal-specific
  strategy).
- **`src/core/perturbation/referenceOrbit.ts`** — one-time, main-thread computation.
  Takes a center coordinate (as `FixedPointBigInt`) and `maxIterations`, runs the
  real per-fractal-type formula at full precision, returns `Float64Array`s of
  `Z_n.re` / `Z_n.im` (deliberately downgraded to doubles — fine, because the delta
  recurrence only needs ordinary precision from here on). **Open question:** one
  function per fractal type (mirroring `core/strategies/*.ts`) vs. a
  strategy-function parameter (mirroring `fractalWorkerMap`'s dispatch pattern in
  `renderer.ts`) — not decided.
- **`src/core/perturbation/deltaIteration.ts`** — the cheap per-pixel recurrence,
  replacing `escapeIterations` inside each worker when perturbation is active.
  `δz_{n+1} = 2·Z_n·δz_n + δz_n² + δc`, all in ordinary doubles.

**Wiring into existing files:**
- `renderer.ts`: before the worker-dispatch loop in `renderFrame`, compute the
  reference orbit once; attach the resulting `Float64Array`s to every worker's
  `postMessage` payload (small — a few KB even at iteration counts in the
  thousands).
- `types.ts`: `WorkerTask` gains reference-orbit array fields.
- Each `src/workers/*/worker.ts`: swap `escapeIterations` for the delta recurrence,
  gated behind a setting (see below).

**Important architectural shift:** today every pixel is fully independent (no
shared state). Perturbation introduces one shared dependency (the orbit) that all
tiles must wait on before dispatch — cheap, but a new synchronization point that
doesn't exist today.

**Gating decision:** plain delta iteration has **no shallow-zoom benefit** and is
actually slightly *more* expensive per step than direct iteration (see §6) — so it
should be an additive mode behind a settings toggle, not a wholesale replacement of
the existing direct-iteration strategies, at least initially.

---

## 6. Series Approximation (SA) — must be designed around from the start

**This was flagged late in discussion but is a firm requirement for the eventual
design**, not a someday-maybe. Important correction made mid-discussion:

Plain delta iteration (§5) is **not** inherently cheaper than direct iteration per
step — it's roughly **double** the real multiplications (a complex square, `δz²`,
plus a complex multiply against the reference orbit, `2·Z_n·δz_n`: ~6-7 real
multiplications vs. direct iteration's 3). Any claim that "perturbation is faster
even at shallow zoom" almost certainly refers to **series approximation**, a
distinct technique usually bundled under the same name in real implementations
(confirmed via search — e.g. `rust-fractal-core` explicitly separates "perturbation
based iteration" from "series approximation... to skip (and approximate) large
amounts of perturbation iterations").

**What SA actually does:** since the delta recurrence is a polynomial in `δc`, you
can precompute the polynomial's coefficients once alongside the reference orbit.
For any pixel whose `δz` is still well-approximated by that polynomial, you
**evaluate the polynomial directly to jump straight to iteration N**, skipping the
step-by-step loop entirely for however long the approximation stays valid. This is
where the real speedup comes from, per multiple sources — one deep-zoom writeup
describes render time becoming "largely independent of depth and iteration count"
once this is in place. Unlike plain delta iteration, this mechanism is **not
inherently zoom-dependent** — it can plausibly speed up shallow zoom too, wherever
the local orbit is "boring" enough for a low-order polynomial to track it.

**Design implication:** `referenceOrbit.ts` shouldn't just emit `Z_n` arrays — it
needs to also compute/emit the SA polynomial coefficients derived from the orbit.
Each pixel then needs a **validity-radius check** (how far can I trust the
polynomial before falling back to full delta iteration?) — this check is not yet
designed. Planned as a genuinely separate module:

- **`src/core/perturbation/seriesApproximation.ts`** — coefficient computation
  (alongside/inside `referenceOrbit.ts`'s output) + the per-pixel validity check +
  the "jump to iteration N" evaluation, with fallback to `deltaIteration.ts` when
  the approximation breaks down.

---

## 7. A second, separate precision problem (flagged, not solved)

Per-pixel offset math (`δc = (x - width/2) * scaleRe`) has its own failure mode,
distinct from "not enough digits": `scaleRe` (`4 / zoom`) becomes a **vanishingly
small** number at deep zoom, and past roughly zoom `10^308` an ordinary `number`
can't represent it at all — it underflows to exactly `0`. This isn't a precision
problem, it's a *range* problem.

Interesting reversal worth remembering: this specific sub-problem is actually where
something shaped like the idle engine's `BigNumber` (mantissa + exponent) **would**
be the right tool — we only need to preserve `scaleRe`'s magnitude, not add digits
to it. Not designed yet; flagged for a dedicated future conversation.

---

## 8. "Could we precompute a whole zoom level?" — resolved

Two different questions got asked and answered differently:

- **A single full frame at extreme depth, precomputed ahead of the live zoom
  level:** plausible and likely *cheap*, because under perturbation the per-pixel,
  per-tile cost doesn't grow with depth at all — only the one-time reference orbit
  does, and §4's benchmark shows that staying cheap out to absurd depths. This is
  good evidence for revisiting the predictive-pre-rendering idea that's currently
  flagged as deferred/unverified in `FractalIdleMDD.md`'s HTML comments (3.3.2).
- **The entire spatial extent visible at a given magnification** (a full map, not
  one viewport): **not** primarily a precision-speed problem, and not something
  perturbation fixes. A single reference orbit's delta approximation is only valid
  near the viewport it was computed for — covering a wide area means many reference
  orbits over many sub-regions, and total data volume becomes intractable well
  before compute cost does. Confirmed as infeasible in general (plausible only at
  shallow zoom where the area is small to begin with).

---

## 9. Open questions to resolve before/during implementation

Roughly in the order they'll likely come up:

1. **`referenceOrbit.ts` shape per fractal type** — one function per type vs. a
   shared function taking a strategy parameter.
2. **SA validity-radius check** — the actual algorithm for "how many iterations can
   I trust the polynomial for, at this pixel" is not designed at all yet.
3. **Glitch detection & rebasing** — mentioned early as "the genuinely hard part"
   of perturbation, not designed. Needed once pixels start producing visibly wrong
   results from a reference orbit that's no longer a good local approximation.
4. **`ViewState` migration to `FixedPointBigInt`** — deliberately deferred as its
   own big, invasive step (touches `zoom-manager.ts`'s `computeTargetView`,
   `state.ts`, pan/drag math). Everything above can be built and tested first using
   a manually-specified deep coordinate, without touching how the camera itself
   stores state.
5. **The `scaleRe`/`scaleIm` underflow problem** (§7) — separate design
   conversation, likely wants a `BigNumber`-shaped (mantissa+exponent) fix.
6. **Where the real "Wall" comes from**, now that reference-orbit cost is
   provisionally ruled out (§4) — likely per-pixel iteration count and/or glitch
   frequency at depth, unbenchmarked so far.
7. **Settings/gating** — a toggle for perturbation mode, and eventually an
   automatic threshold for when to switch (mirroring the "shallow zoom = direct,
   deep = perturbation" split seen in real implementations during research).

## 10. Suggested build order (updated with SA in scope from the start)

1. `FixedPointBigInt` in isolation — pure math, fully unit-testable without
   touching the rendering pipeline.
2. `referenceOrbit.ts` for Mandelbrot only — prove the concept end-to-end before
   generalizing to Burning Ship / Buffalo / Julia.
3. `deltaIteration.ts` + wire one worker (`mandelbrot/worker.ts`) behind a settings
   toggle, using a manually-specified deep coordinate (not yet touching
   `ViewState`).
4. `seriesApproximation.ts` — coefficient computation + validity check + fallback
   to step 3's delta iteration. This is where the real, broadly-applicable speedup
   lives, so don't treat it as optional polish.
5. Glitch detection/rebasing.
6. `ViewState`/camera-coordinate migration to `FixedPointBigInt` (the big,
   separate step).
7. Generalize `referenceOrbit.ts` to the other three fractal types.
8. Revisit the `scaleRe`/`scaleIm` underflow problem (§7).

---

## Reference material surfaced during research

- Reference-orbit + delta recurrence + SA overview, with the "render time
  independent of depth" claim: DinkydauSet, *Perturbation for the Mandelbrot set*
  (DeviantArt journal, 2014).
- Explicit perturbation-vs-series-approximation separation in a real
  implementation: `rust-fractal/rust-fractal-core` (GitHub).
- Deep zoom theory writeup covering both techniques formally, including extension
  to Burning Ship / "abs variations": mathr.co.uk, *Deep zoom theory and practice*.
- Real-world deep-zoom app using a depth-gated split (direct iteration below
  `10^-7`, perturbation beyond): Mandelscope (korovatron.co.uk).
- GPU-oriented perturbation writeup (Double-Double reference orbit, Taylor-series
  delta update): Michael Stebel, *How Perturbation Theory and the Taylor Series
  Make Extreme Fractal Zooms Possible* (Medium).
- Deepest verified zoom record referenced for the bit-width stress test:
  ~10^218,831 (Oct 2025 fractal-explorer render).
