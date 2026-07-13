# Idle Fractal Game — Design Notes

Status: **blue-sky / exploratory.** No implementation has started. This document
captures everything discussed in a design brainstorm session, for continuity
into future conversations (including a separate prototyping thread building a
standalone Mandelbrot Canvas renderer as a performance proof-of-concept).

Relationship to the existing idle-engine project: intentionally loose for now.
This could eventually be built on that engine (it already has `BigNumber`,
`Value`/`Formula`, a Definitions/Purchasable content system, etc.), but nothing
here assumes or requires that. Treat this as an independent concept until a
decision is made to build it.

---

## 1. Core Pitch

An idle game about computing and exploring a fractal (Mandelbrot set, and
eventually other fractal families). The central design bet: **the numbers
going up should be honestly, mechanically tied to a real rendering process**,
not an arbitrary skin over a generic idle economy. Zoom depth, precision, and
render cost all mirror real fractal-rendering computer science, which gives
the game an authenticity hook most idle games don't have.

**Resource: Compute.** Everything is bought with Compute. Compute/sec scales
from small numbers (10/sec) into astronomical ranges (10^300+/sec) over the
course of the game.

---

## 2. Core Architecture Idea: Renderer/Simulation Split

This is the most load-bearing technical idea in the whole design.

- The **idle economy** (Compute/sec, costs, zoom depth as a stat, prestige
  currencies) can all use a `BigNumber`-style magnitude representation
  (mantissa + exponent) — great for huge *orders of magnitude*, not
  concerned with fine-grained precision.
- The **fractal renderer's camera** (center coordinates, window width) needs
  the opposite: not huge magnitude, but huge *precision* at a small, fixed
  scale — potentially thousands of stable decimal digits near a specific
  point once zoomed deep. This requires a fundamentally different numeric
  representation (arbitrary-precision / BigFloat-style, not
  mantissa+exponent).
- These two systems should be **kept separate**, connected only loosely: the
  simulation tells the renderer roughly how much precision to allocate
  (derived from the zoom-depth magnitude), without the renderer and
  simulation sharing a number representation.
- Proposed interface shape for the renderer side (not committed):
  ```ts
  interface IFractalNumber {
      add(other: IFractalNumber): IFractalNumber;
      subtract(other: IFractalNumber): IFractalNumber;
      multiply(other: IFractalNumber): IFractalNumber;
      square(): IFractalNumber;
      compare(other: IFractalNumber): number;
  }
  ```
  with swappable implementations (`DoubleNumber` → `DoubleDoubleNumber` →
  `BigFloatNumber`, etc.) representing precision-tier upgrades.

---

## 3. Precision as Progression

A real, well-known technical fact used as a genuine game mechanic: plain
JS/IEEE-754 doubles give ~15–16 decimal digits of precision, which breaks
down at deep zoom (roughly 10^15–10^16 and beyond). Real deep-zoom fractal
software solves this with a real sequence of techniques — which becomes the
game's precision tech tree, in authentic order:

1. Double precision (default/starting)
2. Double-double precision (~30 digits)
3. Quad precision
4. Arbitrary precision / BigFloat
5. Perturbation rendering
6. Series approximation

This is **not invented tech-tree flavor** — it mirrors real techniques used
by actual deep-zoom explorer software. Strong authenticity hook.

---

## 4. Threads / Cores — Real, But Decoupled Once It Stops Being Honest

Idea: player-purchased "cores" map to literal Web Workers rendering tiles in
parallel — buying a core visibly speeds up rendering, not just a stat.

**Known problem (raised and resolved):** literal 1:1 mapping breaks down
because (a) browsers cap useful worker count near real hardware core count,
and (b) different players have different hardware, which would make the game
unfair/inconsistent if taken literally to absurd tiers (10^20 threads is not
physically meaningful).

**Resolution — the same fix used elsewhere in this design:** decouple the
fiction from the implementation once it outgrows physical plausibility.
- Real worker count stays small and roughly hardware-proportional (e.g.
  `min(navigator.hardwareConcurrency, engineCap)`).
- "Cores owned" as an *economy stat* keeps climbing arbitrarily via
  BigNumber past that point, functioning as an abstracted multiplier on
  Compute/sec rather than a literal worker count.
- Early game: the coupling is real and visible (buy a core, watch another
  tile-region start rendering in parallel). Late game: it's honest economy
  math, same as zoom depth eventually decoupling from literally-rendered
  precision.

---

## 5. Coloring Algorithms as Upgrades

Coloring is a cheap, high-payoff idea — much less engineering cost than
precision work, but visually dramatic. Progression:

Black/white → escape coloring → smooth coloring → histogram coloring →
distance estimation → orbit traps → **terrain/elevation-style rendering**
(see §11, discovered via reference image) → **capstone: holographic reveal**
(see §9).

Also the primary intended **cosmetic monetization surface** (see §14).

---

## 6. Prestige Structure — Multi-Tier

### 6.1 Zoom is a *level track*, not prestige itself
Reframed from an earlier "zoom = prestige" idea. Zoom depth functions like
the stage/level counter in a combat idle game — continuous escalating
progression within a run. Prestige is the *reset action*, triggered by
hitting a wall, not the level track itself.

### 6.2 Tier 1 — Zoom Prestige
- Player zooms deeper (level track), buying Compute upgrades along the way.
- Hits a wall (see §7) at current precision tier.
- Prestiges: returns to zoom 0, converts depth reached into a permanent
  currency (working name: **Insight** or **Focus**) that buys a lasting
  Compute-production multiplier for the next run.
- This gives prestige an *honest mechanical reason* (the precision/render-cost
  wall) rather than an arbitrary "number got big enough" trigger.

### 6.3 Tier 2 — Ascension candidate: Fractal-family graduation
The existing multi-fractal chapter idea (see §8) naturally sits one level up
from zoom-prestige: once repeated zoom-prestiges within one fractal family
stop yielding meaningful gains, graduating to the next family (Mandelbrot →
Burning Ship → Julia → ...) is a bigger, rarer reset granting broader/longer-
lasting power.

### 6.4 Tier 3 — Transcendence candidate: Formula swap
Changing the generating formula itself (z²+c → z³+c → z⁵+c, i.e. Multibrot
sets) is a more fundamental change than switching fractal families — a
candidate for a third, rarer, even more consequential prestige tier.

### 6.5 Open questions (explicitly not decided)
- Does Insight (or equivalent) persist across ascension, or does each tier
  have its own separate currency?
- Do hardware tiers (Clock Speed → ... → Matrioshka Brain) belong to one
  specific prestige layer, or persist as a never-reset track across all tiers?

### 6.6 Landmark-linked prestige idea (Tier 1 destination select)
At each zoom-prestige (return to zoom 0), the player **chooses a destination**
from the 12 major zoom-0 landmark *types* (§10) to zoom into for that run —
directly analogous to Farmers Against Potatoes' class-select-at-prestige
mechanic (6 classes, each with own tech tree/stats/strengths).
- The 12 types are the right tier for this specifically because they are
  *recurring structural categories* (see §10.2), not one-off coordinates —
  you can't build a repeatable choice out of a single unique discovery point.
- Different landmark types have real, derivable mathematical differences
  (different periods, different local symmetry/attachment geometry) —
  potential grounding for genuinely distinct playstyles per destination,
  not just reskinned numbers.
- **Geometric wrinkle (flagged, not resolved):** the 12 aren't uniform in
  shape. Some (Seahorse Valley, Elephant Valley, Secondary/Period-3 Bulbs,
  Mini-Mandelbrots) are dense "zoom straight in" regions; others (Antenna,
  Filaments, Spokes) are thin traversal paths where the next mini-Mandelbrot
  sits at a tip/along a branch. Possible second axis of differentiation
  (e.g. dense regions → concentrated-multiplier playstyle; thin paths →
  exploration/discovery-rate playstyle) — worth leaning into deliberately
  rather than smoothing over, but not decided.
- **Open question:** does the zoom-0 destination choice flavor/commit the
  *entire* prestige run (effectively choosing your internal-address lineage
  for the whole dive), or can the player encounter any of the 12 again once
  nested inside a mini-Mandelbrot regardless of starting choice? Leaning
  toward "commits the whole run," since otherwise the choice may not matter
  much — not decided.

---

## 7. The "Wall" — Mechanism and Visual Feedback

### 7.1 What creates the wall (no hard gates, same as other idle games)
Direct analogy to combat idle games: "your damage is 2.4e3, the boss has
4.1e12 HP — technically beatable, but it'd take a year." No code-enforced
barrier; the wall emerges from a ratio going unfavorable.

- **HP analogue = total render cost at current depth.** A real, computable
  quantity: iteration-steps × precision-digits-required across however many
  pixels are being resolved. Grows steeply and *honestly* with depth (more
  iterations to resolve the boundary, more precision to stay numerically
  stable) — this is the same "iterations × precision" cost formula flagged
  early as a possible economy-cost curve, repurposed here as the actual wall
  mechanic instead.
- **Attack stat analogue = Compute/sec**, concretely expressible as
  iteration-steps-per-second the player's current hardware/precision tier
  can process.
- At shallow zoom, Compute/sec vastly exceeds render cost (fast resolve).
  As depth increases, render cost outpaces Compute/sec, and resolving a
  single depth level starts taking real, felt time — the wall, without any
  hard gate.

### 7.2 Visual feedback (revised after critique — see §7.3)
Original idea: progressive/tiled rendering (already a good technical fit for
idle pacing) doubles as the "combat" visual — image sharpens gradually,
fill-rate driven directly by Compute/sec vs. render cost. Zoom velocity
gated by resolve-completion (camera holds at current depth, advances to next
depth only once resolved) — "advance to next stage after clearing this one,"
same shape as combat idle games, but the clear condition falls out of real
cost math instead of a tuned HP number.

Also connects: worker/core count becomes visually apparent as how many tiles
resolve in parallel (more cores = more of the screen sharpening at once —
an idle-game "party of heroes" reskinned as tiles). Coloring-algorithm
upgrades make the in-progress resolve itself more visually interesting, not
just the final frame.

### 7.3 Critique and correction: "watching it resolve" is not exciting on its own
**Raised concern:** a smoothly sharpening image is roughly as exciting as
watching paint dry — valid critique, accepted.

**Diagnosis:** the excitement in combat idle games doesn't come from the
continuous HP bar itself, but from *discrete, punchy events* layered on top
of it (hit numbers, crits, mobs bursting on death). A smooth continuous fade
has no equivalent punctuation.

**Fix (mechanism unchanged, presentation changed):**
- Tiles should **pop** on completion (snap-in, maybe a hit number/combo
  counter), not gradually fade — same underlying rate, very different feel.
- The "grinding to a crawl" pace should be **reserved specifically for near
  the wall**, as a meaningful signal — not the constant baseline experience.
  Fast/punchy should be the default; slow should read as a specific,
  earned signal, the same way a slow-draining boss bar only works because
  normal fights are fast by contrast.
- The actual "kill" / payoff moment should be **landmark discovery firing**
  (a real banner/fanfare event) during the resolve — not the resolve
  finishing itself.
- Idle games are mostly *not* watched continuously — most engagement is
  check-in-and-leave. The bar to clear isn't "exciting to stare at for
  minutes," it's (a) satisfying cause-and-effect right after a purchase
  (buy a core, tiles visibly pop faster immediately) and (b) something
  visibly different on return-to-game.
- **Tile-completion "juice"** (pop/snap feedback, sound, escalating combo on
  completion) should be treated as a real design requirement doing actual
  work here, not a cosmetic polish pass.

---

## 8. Multi-Fractal Structure

Rather than one Mandelbrot forever, a sequence of fractal families functions
as game "chapters":

Mandelbrot → Burning Ship → Julia (parameterized — *which* Julia set is
itself discoverable) → Tricorn → Celtic → Phoenix → Newton → Multibrot →
Mandelbox → Mandelbulb (late game).

- **Formula swap** (z²+c → z³+c → z⁵+c, i.e. Multibrot sets) is a specific,
  mathematically legitimate mechanic for late-game variety — not invented.
  Candidate for the Tier 3 "transcendence" prestige layer (§6.4).
- **Flagged risk:** Newton fractals are defined by root-finding basins, not
  infinite continuous zoom — may need a genuinely different mechanic, not a
  reskin of the zoom loop. Real design cost to account for later, not a free
  unlock.
- Fractal-family graduation is the current best candidate for the Tier 2
  "ascension" prestige layer (§6.3).

---

## 9. Late-Game Capstone: Holographic Reveal

A final-tier render/coloring mode (not a new mechanical system — see the
rejected "redefine mathematics" idea below) where the rendered image visually
dissolves from pixels into the generating formula/notation itself — framed via
the holographic principle ("the boundary always contained the whole"). Sits
at the top of the coloring-algorithm progression (§5) as a visual/narrative
beat, deliberately **not** a new gameplay layer.

**Explicitly rejected:** an earlier "ascension → dimension → formula →
mathematics / transcension" idea (from an external brainstorm) was flagged as
filler — vague escalation vocabulary with no real mechanic underneath. The
"Formula" swap piece was salvaged (§8); "redefine mathematics itself" was not
— it's kept only as the *aesthetic* capstone described here, not a mechanic.

---

## 10. Landmark Discovery — Two Distinct Tiers

### 10.1 The 12 major zoom-0 features
Main Cardioid, Period-2 Bulb, Seahorse Valley, Antenna, Elephant Valley,
Secondary Bulbs, Period-3 Bulbs, Spirals & Double-Spirals, Mini-Mandelbrots,
Filaments, Spokes, Misiurewicz Points.

### 10.2 Key mathematical fact: these are recurring *types*, not a fixed catalog
The Mandelbrot set is quasi-self-similar: every mini-Mandelbrot (satellite
copy) found anywhere in the set is surrounded by its own miniature version of
essentially the whole picture — its own Seahorse Valley, Elephant Valley,
spokes, filaments, etc. Not identical (never exact self-similarity — each
copy is subtly deformed and differently embedded), but structurally the same
*kind* of feature. This recurs infinitely — no bottom.

**Separately**, Misiurewicz points and other individually-notable deep-zoom
coordinates are **unique, specific points** (not a recurring type) —
mathematically distinct from "just another instance of a category." Real
fractal-explorer communities have spent decades cataloging specific
individually-interesting coordinates deep in the set — an actual ongoing
practice, not something to invent.

**Resulting two-tier discovery structure:**
- **Procedural/guaranteed layer:** the 12 recurring types, findable
  anywhere, forever — genuinely infinite, no curation needed.
- **Curated/unique layer:** specific named real coordinates / Misiurewicz
  points — finite-but-huge, hand-selectable, usable as premium/milestone
  content (procedural filler + curated specials, a pattern borrowed from
  well-regarded exploration games, except here it falls directly out of the
  real math rather than being designed on top of it).

### 10.3 Can this be computed at arbitrary depth? Yes — and here's how
At zoom 0, feature identification is a trivial lookup (store 12 bounding
regions). At arbitrary depth (e.g. Seahorse Valley of a mini-Mandelbrot of a
mini-Mandelbrot), there's no finite table — but it's still **computable**,
not just visually pattern-matched:

- Every mini-Mandelbrot / bulb is a **hyperbolic component** — a region
  where the critical orbit settles into a stable periodic cycle. Each has a
  well-defined **period** (computable by iterating and detecting when the
  orbit locks into a near-cycle) and an exact **nucleus** (refinable via
  Newton's method on the "period-n cycle exists here" polynomial). This is
  standard technique in real deep-zoom software (e.g. Kalles Fraktaler-style
  tools use exactly this to auto-locate points).
- A component's **internal address** (e.g. "period 1 → period 7 satellite →
  period 23 satellite of that") describes precisely which lineage/branch a
  given mini-Mandelbrot belongs to and how deep — also computable from local
  orbit behavior.
- Named feature types correspond to **fixed points in this combinatorial
  structure**, not to specific coordinates — e.g. Seahorse Valley is "the
  junction where a period-1 cardioid meets its period-2 satellite bulb," a
  specific recurring rotation-number relationship, combinatorially identical
  at every mini-Mandelbrot regardless of numeric coordinates.
- **Practical implication:** a real-time classifier can compute period +
  internal-address signatures at the player's current view and match against
  known structural signatures for the 12 types — genuinely computed, works
  identically at any depth, not a lookup table and not faked.
- **Honest complexity flag:** full rigorous nucleus-finding/internal-address
  computation is real engineering work (Newton's method, period detection),
  a step up from rendering — not a weekend feature. A cheaper MVP fallback
  exists: approximate classification from local visual/statistical signatures
  (spiral count, local symmetry, escape-time gradient shape) instead of exact
  combinatorial addressing — much less rigorous, much cheaper, likely good
  enough for "tell the player what kind of thing they found."
- **Connects directly to the precision wall:** nucleus-finding at depth
  requires the same high-precision arithmetic that deep-zoom rendering does
  — landmark classification and the render-precision wall hit the same
  underlying constraint, not two separate problems.

### 10.4 Discovery UI concept
Minimap-as-search-UI, live render as payoff-view: a stylized, partially-fogged
overview map shows named/discoverable regions (revealed as found), player
clicks/travels to a region, the live high-detail render is the arrival payoff.
Resolves "is discovery live-panning or search-and-resolve" — it's both, split
across two views.

### 10.5 Automation
Manual search → assisted search → automated search ("AI" unlocks that find
landmarks for the player) — a natural, well-tolerated idle-game power curve.
Also a clean convenience-purchase monetization surface (§14).

### 10.6 Flavor detail
Named peaks referencing real mathematicians/concepts (Mount Feigenbaum,
Mount Mandel, Mount Julia) fit the project's self-aware/meta tone.

### 10.7 Explicitly deferred
The detailed discovery *process* (exact flow of searching, classifying, and
rewarding a find) still needs to be fleshed out in a future session.

---

## 11. Vehicle / Visual Identity — Four Live, Unresolved Options

No decision made. Options on the table, each with real tradeoffs:

1. **Submarine/probe** — depth metaphor, most legible ("deeper = further
   in"), pairs naturally with a clinical/compute-focused tone.
2. **Interdimensional vessel** — best *mechanical* fit: the only option that
   naturally explains both axes of progression (zoom depth *and*
   fractal-family switching as literal dimension travel), and gives
   "Formula" swaps a narrative excuse ("altering the laws of this
   dimension"). Currently the strongest fit if the metaphor needs to carry
   real explanatory weight.
3. **Nautical / old-world-map ship** — pulled in by real reference images of
   Mandelbrot-set "cartography" posters styled like antique maps (real named
   regions: Main Cardioid, Main Bulb, Seahorse Valley, Elephant Valley,
   Scepter Isthmus/Shallows, "Still Ocean," etc. — genuine documented
   fractal-explorer naming, not invented). Most tonally distinct from the
   compute/hardware theme; also the most art-production-expensive direction
   (hand-illustrated cartographic style, not derivable from the render
   itself).
4. **Fantasy-RPG-overworld terrain map** — surfaced from a further reference
   image: named regions + elevation/mountains/rivers styled like a fantasy
   campaign map (e.g. Skyrim-style). Terrain/elevation styling is plausibly
   **procedural, not hand-painted** — likely derivable by feeding an
   escape-time or distance-estimation value into a terrain colormap instead
   of a normal color palette (points near the boundary = "coastline," slow-
   escaping points = "mountains"). If so, this is mechanically just another
   entry in the coloring-algorithm upgrade ladder (§5), not a new art
   pipeline — a good candidate to co-exist with whichever vehicle theme is
   chosen, rather than competing with it. Named peaks in the reference image
   (Mount Feigenbaum, Mount Mandel, Mount Julia) directly inspired §10.6.

**Known non-collision:** *Fractal Sailor* (itch.io, by propagant) already
exists — a 3D horror tech demo piloting a hovercraft through raymarched
fractal SDF geometry. Overlap is thin: different genre (horror/survival vs.
idle), different rendering technique (real-time 3D raymarching vs. 2D
escape-time), no idle economy, no landmark discovery, no zoom-as-progression.
Worth remembering as a differentiation reference, not a design constraint.

**Underlying tension to resolve eventually:** the vehicle choice and the
map-art-style choice are pulling on the same thread — old-world cartography
pulls toward nautical; compute/hardware theme pulls toward something more
clinical (submarine or interdimensional); the fantasy-terrain reference
doesn't cleanly match either. Not decided.

---

## 12. Natural Fractals / L-Systems — Side-Loop, Not Merged System

### 12.1 Why they don't fit the main loop directly
Escape-time fractals (Mandelbrot etc.) are defined by continuous zoom into a
coordinate plane — infinite, precision-bound. **L-systems** (Lindenmayer
systems — string-rewriting rules interpreted as turtle-graphics drawing
instructions, e.g. the classic `F → F[+F]F[-F]F` plant rule) are fundamentally
different: progression is a plain integer **generation count** (how many
times the rewrite rule has been applied), not camera depth/precision. Real
natural/organic fractals (ferns, coastlines, branching trees) are generally
generated this way, not by escape-time iteration. This is a genuinely
different core stat, not a reskin — a structural mismatch with the main loop,
not just a tonal one.

### 12.2 Recursion-depth-as-progression, if built as its own loop
- Resource: Compute (or a themed variant) still spent, but on **advancing
  one more rewrite generation** rather than zooming deeper.
- Cost naturally, honestly steep: the rewrite string genuinely grows
  exponentially per generation, so the cost curve doesn't need fudging.
- Visual payoff: each generation is a full redraw, denser/more detailed than
  the last.
- Discovery angle translates: instead of hunting named *coordinates*, hunt
  named *rule/parameter variants* (a real practice in procedural-plant
  generation research) — same discovery shape, different search space.
- Automation angle also translates directly (automated rule-parameter
  search instead of coordinate search).

### 12.3 Resolution: separate loop, bridged economically
Chosen structural pattern, compared against three real references:
- **Farmers Against Potatoes' potato farm** (chosen model) — a fully
  separate mini-game/loop whose output feeds the main game via an economic
  bridge only; no shared mechanics or UI. Low coupling.
- AdVenture Capitalist's rotating weekly mini-games — rejected as the model;
  too temporary/bonus-feeling for a permanent second pillar.
- Idle Champions' side campaigns — rejected; shares underlying systems with
  the main game, which doesn't fit here since the core math (generation
  count vs. zoom depth) is genuinely incompatible.

**Why this is a good scope move, not just a compromise:** the main
compute/zoom/discovery loop can ship as a complete, playable game entirely on
its own — the L-system garden becomes an independent future vertical slice
that can be skipped entirely with zero loss to the core game. Also
resolves a real tonal tension (cold computation vs. organic growth) by not
forcing the two aesthetics to share a screen.

**Bridge mechanism — explicitly deferred, not decided.** Three honest options
noted, roughly increasing in design cost:
1. Passive trickle (garden idles, feeds a small permanent multiplier to main
   Compute) — lowest cost, risk of feeling like a tacked-on buff.
2. Discovery-flavored (garden progress unlocks landmark-hunting aids or
   coloring modes in the main game) — ties the two together thematically.
3. Prestige-flavored (garden has its own harvest/replant reset mirroring
   zoom-prestige structurally, without sharing its math).

**Cheap fallback if the side-loop is never built:** natural-fractal visuals
can still appear as just another entry in the coloring/render-style ladder
(§5) on the main loop — no new system required.

---

## 13. Monetization — Treated as a Cross-Cutting Design Property

### 13.1 Platform context
Targeting mobile, web (CrazyGames-style portals), and Steam — genuinely
different monetization norms per platform (mobile/web: ads + IAP expected;
Steam: IAP tolerated especially in F2P titles, but ads are not — norm is
ads-off with paid/cosmetic content instead).

**Design implication:** monetization should be a **swappable layer** over a
shared core game, not baked into core mechanics — e.g. Steam build disables
ads, web/mobile builds enable them, while the underlying game and its
balance stay identical. This is only achievable if nothing in core
progression *depends* on ads/IAP existing.

### 13.2 Hard rule
**Core progression power (Compute rate, zoom/precision depth) must stay
earnable-only — never directly purchasable.** This is a firm "not p2w"
constraint, explicitly reaffirmed. Protects the "authentic math" identity
that underlies most of this design's strongest ideas.

### 13.3 Sanctioned monetization categories
- Temporary boosts
- Convenience / QOL purchases
- Cosmetics
- A **soft premium-currency lane**: some upgrades purchasable with a premium
  currency that is *also* earnable for free (slower) — not exclusively
  cash-gated. (Not full-blown p2w-adjacent premium-only upgrades.)

### 13.4 Mapping onto existing systems
- **Coloring/render styles (§5):** primary cosmetic-monetization asset —
  structure as an earnable track (keeps F2P/Steam fairness) plus a separate
  purchasable premium track layered on top; earnable tier must never be
  paywall-blocked.
- **Automation/landmark-AI (§10.5):** clean convenience purchase — sell
  *faster access*, not exclusive access.
- **Offline-progress cap:** standard idle-game lever — base cap earnable/
  upgradeable through play, extendable per-session via ad or IAP. Bounded,
  doesn't compound into permanent advantage, well-tolerated genre-wide.
- **Precision tiers (§3):** flagged as risky if monetized directly (this is
  core progression power) — keep strictly earnable; monetize *around* them
  instead (e.g. a temporary preview of a not-yet-unlocked deeper zoom, not
  an actual unlock).
- **Multi-fractal chapters (§8):** plausible paid-content/DLC-style unlock
  for Steam (later/more exotic families as a paid pack), with a parallel
  earn-through-play path preserved on other platforms.
- **L-system side-garden (§12):** low-risk secondary IAP surface (speed-ups,
  cosmetic plant variants) — economically isolated from core balance by
  design, so purchases there can't affect main-game fairness.

---

## 14. Open Questions / Deferred Items (Consolidated)

- Vehicle metaphor: submarine vs. interdimensional vessel vs. nautical
  old-world-ship vs. fantasy-terrain-map style — unresolved, four live
  options (§11).
- Whether terrain/elevation-style rendering is confirmed procedural
  (strongly suspected, not yet verified) (§11).
- Prestige currency continuity across tiers (does Insight/Focus persist
  through ascension? separate currencies per tier?) (§6.5).
- Whether hardware tiers persist across all prestige layers or reset with a
  specific tier (§6.5).
- Whether zoom-0 landmark-type selection at prestige commits the entire run
  or can be re-encountered regardless of choice (§6.6).
- Whether to lean into or smooth over the dense-region vs. thin-path
  geometric difference among the 12 landmark types as a second
  differentiation axis (§6.6).
- Full landmark discovery process/flow — still needs detailed design (§10.7).
- Rigor level for landmark classification: full internal-address computation
  vs. cheaper approximate/statistical classification (§10.3).
- Newton fractals may need a genuinely different mechanic within the
  multi-fractal chapter sequence — not yet designed (§8).
- L-system side-loop bridge mechanism: passive trickle vs. discovery-flavored
  vs. prestige-flavored (§12.3).
- Exact tile-completion "juice" design (pop/snap feedback, sound, combo
  escalation) — identified as necessary, not yet specced (§7.3).

---

## 15. Explicitly Rejected / Parked Ideas

- **"Recursive recursion multiplier" / "zooms multiply zooms"** — identified
  as generic idle-game escalation vocabulary with no concrete mechanic
  underneath; parked.
- **"Mathematics" / "transcension" ascension layer ("redefine mathematics
  itself")** — identified as vague/grandiose filler; rejected as a mechanic.
  Salvaged only as the aesthetic holographic-reveal capstone (§9).
- **Literal 1:1 hardware-to-worker-count scaling at high tiers** — rejected
  for fairness/physical-plausibility reasons; replaced with the
  real-early/abstracted-late decoupling pattern (§4).
- **Progressive rendering as a smooth continuous "sharpening" visual** —
  rejected as insufficiently engaging on its own; replaced with discrete
  punchy tile-completion events (§7.3).

---

## 16. Session Meta-Notes

- A separate, throwaway prototyping thread has been started: a minimal
  standalone TypeScript + Canvas Mandelbrot renderer, explicitly *not*
  connected to any idle mechanics or the existing engine — pure performance/
  technique proof-of-concept (pan/zoom, progressive tiled rendering, basic
  escape-time coloring, performance readout, no Web Workers or arbitrary
  precision yet). Results from that prototype (render times, where precision
  artifacts visibly appear at deep zoom) should feed back into decisions
  around §3 (precision tiers) and §7 (the wall) once available.
- This document is a snapshot of a brainstorm, not a spec — nothing here is
  committed until deliberately decided in a future structuring pass.
