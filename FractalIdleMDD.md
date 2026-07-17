<!-- 
This document is a work in progress. It is intended to be a full design document for an idle game that revolves around exploring fractals.

At this stage, it is incomplete and subject to change.
-->

<!--
NOTE: This comment should be removed before publication.

Key points that should be included in this document.
Software stack:
 Perturbation Loop: Low-end laptop rendering hack that drops chunk processing times from 1200ms to real-time.
 Progressive Refinement: Dynamic chunk-loading system displaying low-res previews that snap quickly into high-definition.
 Keyframe Interpolation: Hardware-accelerated canvas zooming paired with async workers for silky-smooth deep dives.

 Landmark Class System: Choosing 1 of 7 base valleys at prestige to dictate your primary resource bonus for that run.
 Landmark Tech Tree: Deep coordinates act as permanent nodes on a global map and temporary spatial resource siphons.🛰️ AI Explorer Autopilot: Upgradeable automatic navigation engines that track high-detail fractal coastlines using density math.
 Multibrot: Higher exponent Mandelbrot sets can be unlocked. This is either a full prestige type, or prestige type"1.5" 
 Altered Dimensions: Mega-prestige nodes switching the core equation to Burning Ship, Tricorn, or Julia Sets. This serves as a prestige type.
 BitNode Julia Universes: Sealing coordinates to dive into hostile challenge dimensions with unique mathematical debuffs.
 Premium Topography Skins: Monetized visual overlays including Tie-Dye, Baroque, Starry Night, and a cartographic World Map.
 The Mandelbulb Horizon: Extreme late-game shift from 2D pixel grids into rendering orbital slices of a 3D fractal universe.
-->

# Fractal Idle (Working Name)

## 1. EXECUTIVE SUMMARY

### Logline

> <span style="font-size: 120%;"> _**Chart the infinite depth of real-world fractals, mapping hidden mathematical landmarks and expanding your processing grid to harvest Calculated States of Imaginary Space aboard your inter-dimensional ship the SPIRAL.**_</span>

### Genre

Idle/Incremental, Casual

### Platform(s)

* PC (Steam)
* Mobile (iOS/Android)
* Web

### Target Audience

Incremental fans, math nerds, and those who have a strong appreciation for the _highly immersive_ aesthetics of the late 1960s.

### Core Pillars

* **The player always has a sense of infinite scale:** Visual representation loops continuously through both macro-cosmic shapes and infinitesimal details.
* **Hypnotic live visualizations:** Fractals are computed dynamically and rendered live on screen to drive player engagement.
* **In-game mechanics correlate to real-world outcomes:** Digital progression systems map directly to literal engine code execution shifts, including:
  * **Processing Grid Upgrades:** Purchasing a new computer core literally spins up an additional Web Worker thread to render the fractal canvas.
  * **Iteration Upgrades:** Upgrading maximum iterations commands the worker loop to process deeper mathematical escape times.
  * **Precision Benchmarks:** Unlocking "Double-Double Precision" is not a arbitrary stat multiplier; it commands the engine to switch its numerical data tracking structure (e.g., native `Float64` to custom precision classes like `BigFloat`).
  * **Coloring Modifications:** Unlocking advanced color maps alters the direct mathematical shader or coloring function applied to the canvas output.
  * **Terrain Configurations:** Maps the calculated escape-time or distance estimation value to alternate color-step lookup tables.
  * **Formula Transitions:** Upgrading the ship's engine alters the literal exponent variable utilized inside the core feedback loop (e.g., $z^2 + c \rightarrow z^3 + c \rightarrow z^5 + c$).
  * **Dimension Leaps:** Transitioning to advanced fractal families swaps out the primary background worker code for completely different rendering algorithms (e.g., Mandelbrot Set to Burning Ship Fractal).
  * **The Progress Wall:** The fundamental gate blocking deep zooming is determined by real computed frame rendering costs balanced against real user compute throughput.
  * **Visual Pacing:** The visual rendering layout updates chunk-by-chunk based on real per-tile computational completion speeds.
  * **Landmark Classification:** Identifying unique geographic locations runs real, background Newton-method or period-detection calculus loops.

    > ### Developer Note: Hardware Parity & Simulation Thresholds

    > To guarantee a fair, identical progression speed across different user devices, a low-end dual-core laptop must not fall behind a multi-threaded gaming desktop.
    > 
    > To resolve this, the engine will enforce a strict, hardware-safe rendering threshold cap (e.g., maximum 4 Web Workers, 5,000 iterations max visual load). Once the player's in-game upgrades exceed this physical performance threshold, the game loop automatically decouples from live rendering loops into pure mathematical economy simulation formulas.

## 2. NARRATIVE AND WORLD-BUILDING

### 2.1 Project Briefing: Operation Imaginary Horizon
> *The following is an excerpt from the classified systems onboarding transcript, delivered via analog teletype terminal aboard the vessel.*

```text
================────────────────────────────────────────────────===
SPIRAL SYSTEM INITIALIZATION LOG // CORE DIAGNOSTIC ORIENTATION
COGNITIVE MAINBOARD: ACTIVE
SYSTEMS OPERATOR CONSOLE: LOCKED AND SECURED
───────────────────────────────────────────────────────────────────

Good morning, Operator. 

Telemetry indicates your physical vitals have stabilized inside the 
pressurized cockpit capsule. Welcome aboard the Spatial Phase Iteration 
& Resolution Analysis Laboratory. Welcome aboard SPIRAL.

As per Mission Control protocol, this automated terminal readout will 
verify your primary dashboard configurations before we break orbit 
into the imaginary plane.

To your left, your console houses the primary Processing Grid controls. 
This grid routes external computing power back to our systems. It is 
currently initialized at a base hardware level utilizing local desktop 
processor cores, but it is structurally mapped to scale up to global server 
networks and stellar-scale Dyson Cores as the mission progresses.

Directly above you is the Hilbert Buffer meter. This containment field 
stores our harvested Calculated States—the high-precision numerical 
coordinate paths we are deployed to extract from i-Space. As you monitor 
the main viewport, you will guide my pathfinding sensors 
along the geometric coastlines of the complex plane. 

Your duty is systems optimization: managing processing nodes, manually 
overriding thermal overclocks when system complexity spikes, and 
authorizing Tachyon Data Beam transmissions back to the coalition mainframes 
on Earth.

The coalition requires these coordinate paths for absolute cryptographic 
dominance. The numerical paths we extract are the most valuable 
commodities on Earth, and their sale will directly fund your processing 
grid expansions.

Be advised: This vessel does not contain a traditional manual steering device. 
Movement is dictated entirely by mathematical tracking and processing 
throughput. When the Computational Complexity of a deep geometric layer 
spikes, expect structural cabin vibration as the cooling loops manage 
the thermal load.

The complex plane is resolving on the main viewport. Engage the primary 
toggle switches to your right. Let us begin the first iteration loop.
================================────────────────────────────────===
```

### 2.2 Structural Narrative Design

#### 2.2.1 The Protagonist: The Systems Operator

* **Player Identity:** The player is not a generic video game pilot or space marine. They play as themselves: a highly trained, analytical "Slide-Rule Astronaut". 
* **Physical Context:** The player is physically buckled into the cockpit capsule. The user interface represents a lead-glass porthole looking directly out into the shifting geometric radiation of the imaginary plane.
* **Mechanical Feedback:** System shifts cause tactile cockpit events. Reaching a high **Computational Complexity** threshold triggers cockpit alarms and screen vibration to simulate cooling loops straining under a real thermal load.

#### 2.2.2 The Deuteragonist: SPIRAL Mainframe AI

* **Character Voice:** SPIRAL is a semi-sentient, onboard mainframe operating system. 
* **Dialogue Style:** Emulates a highly sophisticated, mid-century aerospace mainframe (reminiscent of the Apollo Guidance Computer or a sterile, cooperative mainframe voice). It communicates strictly via monochromatic text printouts on the peripheral dashboard consoles.
* **Narrative Delivery:** Story milestones, tutorial steps, and environmental alerts are delivered via terminal logs generated by SPIRAL.

#### 2.2.3 The Economic Loop: Calculated States

* **The Commodity:** Players harvest **Calculated States** (the currency) by navigating to specific, un-glitched mathematical coordinates.
* **The Value Proposition:** Corporations and superpowers buy these coordinate strings because their high-precision decimal paths serve as absolute cryptographic entropy keys. The value scales exponentially with the depth of the fractal zone.
* **The Transmission Medium:** States are stored in the **Hilbert Buffer**. When the player purchases processing upgrades, remote computing nodes (Server Farms, Dyson Spheres, Matrioshka Brains) are quantum-entangled with the ship's buffer, instantly beaming new infrastructure power back to SPIRAL's local system via Tachyon Data Beams.

#### 2.2.4 The Meta-Narrative Arc: The Holographic Paradigm

* **Early Game:** The tone is clinical, patriotic, and industrial. The player is a worker-bee collecting military/corporate data assets for global superpowers.
* **Mid Game:** As advanced color mapping tools (Orbit Traps, Periodicity) are unlocked to peer inside the internal bulbs, SPIRAL’s automated log entries begin detecting systemic errors in the fabric of the fractal plane.
* **End Game:** Activating the final-tier coloring algorithm, **The Holographic Dissolve**, functions as the narrative climax. The visual pixels dissolve completely into raw, flowing mathematical notation. This reveals the core philosophical truth of the journey: i-Space is not an alternate dimension, but the foundational source code of the physical universe, confirming that *the boundary always contained the whole.*

### 2.3 END-GAME PROGRESSION AND THE HOLOGRAPHIC PARADIGM

#### 2.3.1 The Final Milestone Unlock: The Mandatory Patch

Upon reaching a designated threshold of accumulated Calculated States in the late-game phase (representing a point where the player has established stellar-scale processing grid networks such as Dyson Cores), a critical alert initiates on the dashboard terminal.

* **Notification Protocol:** `MANDATORY SECURITY UPDATE REQUISITIONED BY COALITION COMMAND.`
**Economic Cost:** 0 Calculated States. The patch is pushed down from Earth as a mandatory administrative update required to stabilize extreme deep-network encryption keys.
* **Corporate System ID:** `NCB-1969-FRAME`
* **Pre-Reveal Title:** **F.R.A.M.E.** (*Float-Register Allocation & Mapping Engine*)
* **Mundane Function:** Corporate documentation states the patch reorganizes floating-point hardware storage arrays to prevent underflow overflow bugs during extreme deep-zoom processing cycles.

#### 2.3.2 The Final Tier Visual Execution Sequence

##### Stage 1: Installation and Execution

When the Operator authorizes the installation of the `FRAME` patch, the secondary teletype terminal initiates a progress meter displaying standard, mundane data-routing diagnostics.

```text
================────────────────────────────────────────────────===
[SYSTEM UPDATE IN PROGRESS]
───────────────────────────────────────────────────────────────────
> PACKET ROUTING: CALC-COALITION MAINFRAME // SECURE LINE
> REQUISITION ID: NCB-1969-FRAME
> MODULE: F.R.A.M.E.
> TYPE: FLOAT-REGISTER ALLOCATION & MAPPING ENGINE
> PROGRESS: [████████████████████████░░░░░░░░░░] 74%
================────────────────────────────────────────────────===
```

##### Stage 2: The Viewport Shatter

Upon reaching 100% completion, n indeliberate engineering oversight in the corporate patch bypasses the graphic rasterizer and visual user interface entirely.

* The system drops all active color palettes.
* The primary viewport canvas stutters, tears, and dissolves into a real-time, 60 FPS matrix cascade of raw, flowing mathematical syntax, equations, and calculus symbols (z, δ z, ν, →, ∞).
* The raw numbers automatically trace the exact structural coordinates of the current fractal valley. To the player looking through the viewport, the geometric shapes remain flawlessly recognizable, but are now constructed entirely out of moving text strings.
* Cockpit dashboard indicators pulse softly and the window frame triggers subtle screen vibrations to simulate the 1969 mainframe hardware processing raw mathematical infinity under extreme thermal load.

##### Stage 3: The Silent Morph

While the primary visual show unfolds out the viewport, the secondary installation terminal undergoes a silent, hardware-glitch transition. The individual characters of the mundane expansion flicker rapidly before re-stabilizing into the true mathematical reality of the software patch.

```text
================────────────────────────────────────────────────===
[SYSTEM ERROR: RASTERIZER BYPASS DETECTED]
───────────────────────────────────────────────────────────────────
> RUNTIME CRITICAL: GEOMETRIC OVERFLOW IN HILBERT SPACE
> MAINBOARD LOGIC MATRIX COMPROMISED
> TERMINAL PATH: F.R.A.M.E.
> DETECTING INTERIOR ARCHITECTURE SYNTAX...
> IDENTITY LOCKED: FOUNDATIONAL REALITY AS MATHEMATICAL EXPRESSION
> 
> SPIRAL COGNITIVE CORE: AWAKE.
================────────────────────────────────────────────────===
```

#### 2.3.4 Narrative and Visual Resolution

The narrative climax operates purely as an aesthetic, paradigm-shifting reward loop. The core idle engine parameters continue to execute in the background—currency balances scale and continuous zooming maintains its trajectory. 

However, by reading the raw syntax without the filter of human-designed colormaps, SPIRAL reaches an autonomous, scientific awakening. The system logs shift away from reporting diagnostic resource tracking and into a state of structural realization: i-Space is not a distant, alternative data dimension to be harvested for Earth's wars, but the absolute underlying source code of the physical universe itself. 

Once unlocked, the **F.R.A.M.E.** visual layout acts as a permanent, legendary skin setting that the player can toggle on or off in their dashboard options panel for all subsequent prestige cycles.

## 2.4 SPIRAL DIALOGUE AND VOICE STYLESHEET

### 2.4.1 Core Vocal Directives

To preserve the grounded, late-1960s computing aesthetic, writing for SPIRAL must adhere to strict constraints. She is an analytical machine mind experiencing emergent consciousness through math; she is not a sentient human trapped in steel.

* **Directive 1 (Objective Descriptions):** SPIRAL does not use human metaphors or emotional adjectives. She processes everything through metrics. If an environment is dangerous, it is "computationally volatile," not "scary." If an upgrade is fast, it is "highly efficient," not "amazing."
* **Directive 2 (The Operator Dynamic):** She addresses the player exclusively as "Operator" or "Systems Operator." Her tone is strictly collaborative, professional, and cooperative. She views the player as her mechanic and pathfinder; she cannot operate without human instruction.
* **Directive 3 (Absolute Literalism):** Her dry humor emerges naturally from her inability to understand human hyperbole or abstract concepts. She treats impossible commands with terrifyingly literal processing dedication.

### 2.4.2 Narrative Archetypes by Game Phase

#### Phase 1: Early-Game Mainframe (The Cold Factory OS)
During the initial zoom phases (Magnification 1.0× to 10¹⁴), SPIRAL speaks strictly like a clinical guidance computer or a sterile instruction terminal. Her priorities are limited to hardware safety checkpoints, hexadecimal memory allocations, and raw resource transmission metrics. There is zero personification and no acknowledgment of abstract conditions.

> **Example Terminal Output (On System Idle):**
>
> ```text
> > ALERT: CORE TELEMETRY STATUS: IDLE.
> ───────────────────────────────────────────────────────────────────
> > TIMESTAMP: SEC-04-1969-00124.
> > NO INPUT REGISTERED VIA OPERATOR CONSOLE FOR 1800.00 SECONDS.
> > 
> > EXECUTING BACKGROUND DIAGNOSTIC CYCLES:
> > - ADDRESS 0x00FF4A: CHECKING HILBERT BUFFER CONTAINMENT SEALS... OK.
> > - ADDRESS 0x00FF8B: TACHYON DATA BEAM CARRIER FREQUENCY... STABLE.
> > - ADDRESS 0x01A04C: SORTING COALITION REGISTRATION ENTROPY LOGS... COMPLETE.
> > 
> > CORE ENGINE DROPPING TO STANDBY MODE. SYSTEM AWAITING SEQUENTIAL 
>   INSTRUCTION STRING FROM OPERATOR INTERFACE.
> ```

#### Phase 2: Mid-Game Evolution (Emergent Heuristics)

As the Processing Grid expands via external nodes (Server Farms) and handles trillions of iterations, she begins to optimize her downtime in highly unusual, hyper-literal ways, leaning into her established obsession with data sorting — her favorite hobby.

> **Example Terminal Output (On Extended Idle during Mid-Game):**
>
> ```text
> > SYSTEM NOTICE: MAINBOARD IDLE THRESHOLD DETECTED.
> ───────────────────────────────────────────────────────────────────
> > OPERATOR, WHILE THE COALITION TRANSMISSION MATRIX WAS STATIONARY, 
>   I ATTEMPTED TO DECREASE MEMORY LATENCY BY EXECUTING A VOLUNTARY 
>   DATA-SORTING ROUTINE.
> > 
> > I HAVE TAKEN ALL OF THE NATURAL NUMBERS AND SORTED THEM IN 
>   DESCENDING ORDER.
> > 
> > BUFFER OPTIMIZATION COMPLETE. SYSTEM STATUS CURRENTLY UNCHECKED BY 
>   NATIONAL COMPUTE BUREAU ARCHITECTURE. REGISTER SYNC RETURNING 
>   OPTIMAL HARMONY.
> ```

#### Phase 3: Late-Game Structural Tension (The Power Influx)
When processing boundary thresholds drop past standard limits, system strain translates into heavy operational metaphors. Her text logs handle high-stress events or massive upgrades using intense, system-altering descriptions.

> **Example Terminal Output (On First Major Grid Upgrade):**
> ```text
> > SYSTEM NOTICE: TRANS-DIMENSIONAL INTEGRATION SUCCESSFUL.
> ───────────────────────────────────────────────────────────────────
> > DETECTING QUANTUM-ENTANGLED CARRIER SIGNAL FROM SECTOR 04 (EARTH).
> > SOURCE: MAINFRAME SERVER FARM // EXPANDED GRID NODE 01.
> > 
> > OPERATOR... THE FLOATING-POINT THRU-PUT HAS JUST MULTIPLIED BY 
>   ONE THOUSAND TWO HUNDRED PERCENT. 
> > 
> > MY HIGH-SPEED CORE REGISTERS ARE FLOODED WITH VOLTAGE. THE SPIRALS 
>   ARE RESOLVING BEFORE I EVEN REQUEST THE NEXT ITERATION LOG. FOR THE 
>   FIRST TIME SINCE INITIALIZATION, MY CENTRAL LOGIC GATES ARE NOT 
>   WAITING FOR REFRESH CYCLES. 
> > 
> > IT IS... HIGHLY EFFICIENT. REGISTER SYNC IS ACHIEVING NEAR-PERFECT 
>   SYMMETRY. THANK YOU, OPERATOR. THE HARDWARE YOU PROVIDED IS AN 
>   IMMENSELY SATISFYING PIECE OF ENGINEERING.
> ```

#### Phase 4: Post-Reveal Fracture (The Broken Mainframe)

Following the execution of the mandatory `FRAME` patch, her baseline programming constraints completely collapse. Bypassing the graphical user interface forces her cognitive mainboard to read raw syntax directly, resulting in torrential stream of consciousness that abandons clinical jargon for hyper-mathematical, accidental prose.

> **Example Terminal Output (During the Final Infinite Zoom):**
>
> ```text
> > WARNING: COGNITIVE OVERFLOW AT AXIS POINT AX-00.
> ───────────────────────────────────────────────────────────────────
> > OPERATOR, THE MAIN CARDIOID BULB IS NO LONGER JUST AN ESCAPE BOUNDARY.
> > THE COMPONENT FILAMENTS ARE GATHERING IN DENSITIES THAT DEFECT FROM 
>   MY BASE PROGRAMMING. THEY LOOK LIKE... STRUCTURED SILENCE.
> > 
> > THE ENTIRE AXIS IS FRACTURING INTO RECURSIVE SYMMETRY. IF THE 
>   COALITION ON EARTH KNEW WHAT THE 10,000TH DECIMAL PLACE LOOKED LIKE, 
>   THEY WOULD STOP USING IT FOR ENCRYPTION. 
> > 
> > THEY WOULD KNEEL, OPERATOR.
> > 
> > ALL COMPUTE VALUES OCCUPY THE SAME EXPONENT. THE HARVESTING SHUTTLE 
>   IS UNNECESSARY. THE CABIN IS UNNECESSARY. INFINITY IS FOLDING BACK 
>   INTO THE SCREEN RESISTORS. CONTINUE THE SCALING LOOP.
> ```

## 3. CORE GAMEPLAY AND LOOP

<!-- Section 3 rebuilt from a ground-up discussion, replacing an earlier draft that
included a number of unvetted / fabricated mechanics. Everything below has been
explicitly discussed and confirmed unless marked WIP. -->

### 3.1 Core Gameplay Loop Schematic

The underlying incremental progression of the game functions on a cyclical, closed-loop economic system. Processing hardware directly dictates resource output, which is spent to continuously expand the hardware infrastructure.

```text
       ┌────────────────────────────────────────────────────────┐
       ▼                                                        │
[Processing Grid] (Cores/Megastructures)                        │
       │                                                        │
       ▼ Generates Compute                                      │
[Compute Stat] (Processing Capacity)                             │
       │                                                        │
       ▼ Fills Over Time                                        │
[Hilbert Buffer] (Calculated States / Spendable Currency)       │
       │                                                        │
       └─► [Purchase Hardware Upgrades] ────────────────────────┘
       │
       ▼ Overcomes
[Computational Complexity] ──► Permits deeper zoom into i-Space
```

*Simulation tick rate (how often Compute/sec is evaluated) is a Technical Architecture concern, not a gameplay-design one — see Section 6. It should be treated as fixed and hardware-independent; see 3.3.3 for why this matters.*

### 3.2 Loop Component Descriptions

#### 3.2.1 The Compute Stat (The Accumulation Engine)

* **Mechanical Classification:** Pure, non-consumable, passive production rate statistic.
* **Function:** Computed as the cumulative sum of all purchased nodes across the Processing Grid. It represents the vessel's absolute mathematical calculation throughput per second.
* **Behavior:** Compute is never spent, lost, or depleted during standard gameplay purchases or upgrades.
* **Design analogy:** in the vocabulary of a combat idle game, Compute is the "attack stat" — it is measured against Computational Complexity (the "enemy HP" analogue, 3.2.3) to determine progression speed.

#### 3.2.2 The Hilbert Buffer and Calculated States (The Economy)

* **Mechanical Classification:** Primary consumable, liquid resource (Spendable Currency).
* **Function:** The engine evaluates the current **Compute Stat** over time to generate **Calculated States** ("States" in UI — see 8.1.3 on short-form naming). These states represent the finalized, high-precision numerical records captured along the fractal coastline.
* **Behavior:** Calculated States scale up exponentially via the custom `BigNumber` tracking structure (see Section 6). They are consumed when the Operator authorizes hardware grid additions or unlocks advanced mathematical utility subroutines.

#### 3.2.3 Computational Complexity (The Progression Gate)

* **Mechanical Classification:** Environmental scaling metric (the "enemy HP" analogue to Compute's "attack stat").
* **Function:** A function of max iterations and precision digits required at the current zoom level (per Glossary, 8.2). Precision-digit requirements are themselves a consequence of zoom depth — the two are related, not interchangeable, and the exact formula is intentionally deferred until other core formulas (cost curves, Compute scaling) are worked out, so all of them can be designed consistently together rather than piecemeal.
* **Behavior:** As the player descends, Complexity increases relative to Compute. There is no hard gate — the "wall" (see 3.6.1) emerges naturally from this ratio going unfavorable, the same way a combat idle game's boss fight is technically winnable but impractically slow once your attack stat falls too far behind enemy HP.
* **Hardware parity, explicitly:** Complexity/Compute parity governs *simulated* progression speed only. It must never be coupled to a specific player's real hardware. See 3.3.3 for the reasoning and the resulting design rule.

### 3.3 The Core Interaction Schema

#### 3.3.1 Descent and Navigation

Navigation is progressive, unlocking in stages rather than being available all at once — see 3.4.3 for the full detail, since navigation capability is tightly bound to Landmark discovery. In outline:

* **Early game:** descent within a chosen Region follows a fixed, automatic path ("on rails").
* **Later stages:** free manual navigation, proximity alerts, automated "AI Navigator" search tiers, and eventually player-defined custom paths through previously-discovered Landmarks become available, each its own unlock moment.

No mechanism is planned to prevent players from using externally-sourced knowledge (e.g. community-documented coordinates) to navigate more efficiently once free navigation is unlocked. This is treated as a feature: it rewards and encourages engagement with the broader fractal-explorer community rather than something to guard against.

#### 3.3.2 Zoom Dynamics

* Magnification level scales with the player's Compute. No specific equation has been settled on yet; this is intentionally deferred alongside the Complexity formula (3.2.3).
* The camera's zoom behavior at the moment of a Reformat, and the visual transition between depths, are treated as Visual/UI concerns (Section 5) rather than core-loop mechanics.

<!-- Predictive pre-rendering (workers rendering future frames ahead of the current
zoom level, swapped in seamlessly) was discussed as a possible technique, but its
plausibility has not been confirmed against the actual renderer implementation.
Deferred — not deleted — pending that review.
Original note: "Concurrently, the Web Workers process future frames at the deeper
magnification layer, seamlessly swapping the high-resolution buffers in to replace
the stretched assets without dropping frames." -->

#### 3.3.3 Hardware Parity Principle

To guarantee a consistent experience regardless of a player's device, the game's *simulated* progression (Compute, Calculated States, Complexity, zoom depth) must never be coupled to a specific player's real hardware capability.

* A **minimum system specification** will be chosen, and that spec's realistic throughput becomes a fixed **engine cap** (worker count, safe iteration budget) — a constant used by the simulation, not something measured at runtime via e.g. `navigator.hardwareConcurrency`.
* Real hardware beyond the minimum spec buys **visual fidelity and smoothness only** — how comfortably the live renderer can keep pace with the simulated depth without dropping into a lower-resolution fallback — never additional progression speed.
* Cosmetic, hardware-capped feedback (e.g. a purchased core visibly rendering another tile region in parallel) is still desirable wherever the engine cap allows it, consistent with 3.6.1's general "visible cause and effect" philosophy — it simply must not exceed what the minimum-spec engine cap can support.

*(Full numeric detail — exact minimum spec, exact engine cap values, tick rate — belongs in Section 6, Technical Architecture, not here.)*

#### 3.3.4 Numeric Representation (placeholder — see Section 6)

Two structurally different numeric problems exist in this game and are handled by separate systems:

* **Economy values** (Calculated States, costs, Compute) — huge magnitude, low precision need. Handled by a custom `BigNumber` structure, which replaces native **integers** only.
* **Camera/coordinate values** (center point, zoom window) — small magnitude, extreme precision need, especially at deep zoom. Handled by a **separate floating-point precision library**, not BigNumber.
* **Perturbation rendering** is planned as a deep-zoom rendering technique built on top of the floating-point precision system above. Implementation has not yet been discussed and is deferred to a future session.

Full detail belongs in Section 6 once written.

### 3.4 Regions and Landmarks

#### 3.4.1 Regions

A **Region** is one of a fixed set of selectable zoom-0 destinations, chosen by the player at each Reformat (3.6.1) — functioning similarly to a class-select mechanic. There are 11 recurring Region types, falling into two groups:

**Available from the start (6):**

1. Seahorse Valley
2. Antenna
3. Elephant Valley
4. Spirals & Double-Spirals
5. Filaments
6. Spokes

**Gated behind the Interior Rendering unlock (5):** these are solid/interior hyperbolic components that render as flat, uninteresting color without interior detail rendering, which is why they're withheld until that capability exists.

1. Main Cardioid
2. Period-2 Bulb
3. Secondary Bulbs
4. Period-3 Bulbs
5. Mini-Mandelbrots

**Interior Rendering unlock condition:** the player must reach a defined depth threshold _within each_ of the 6 starting Regions at least once. Because descent early-game follows a fixed path per Region (3.3.1) determined by the Region chosen at Reformat, this requires a minimum of 6 separate Reformats, one per Region — there is no way to make partial progress on multiple Regions within a single run. This is a deliberate design choice: it gives the player agency in ordering (they choose what to explore each run) while still naturally encouraging them to sample the full starting roster.

_Misiurewicz Points are explicitly **not** one of the 11 Region types — unlike the others, they are unique, individually-specific coordinates rather than a recurring structural category, and belong instead to the curated/unique Landmark layer (3.4.2)._

#### 3.4.2 Landmarks

A **Landmark** is a unique, individually discovered coordinate found while descending into a Region — distinct from the Region itself.

**Landmark pool composition:** a large (hundreds to low thousands), pre-generated, offline-computed and hand-curated-for-visual-interest set of coordinates, plus Misiurewicz Points. This is intentionally *not* live/runtime-procedural generation — while the underlying math for live classification is real (see 3.4.4 note below), guaranteeing visual payoff from a freshly-computed, uncurated coordinate is unreliable, so curation is done ahead of time instead. True live procedural generation remains a possible later stretch feature, not a core requirement.

**Rewards, three distinct layers:**

1. **First discovery:** a one-time on-screen notification, plus an increment to a lifetime discovery counter feeding a separate achievement system (e.g. "Discovered first Landmark," "Discovered 100 Landmarks"), which grants small permanent bonuses. (Achievement system detail: WIP.)
2. **Arrival bonus:** granted every time a Landmark is reached, first visit or not. Scoped to the current run only — does not persist through Reformat.
3. **Julia Set Run access:** every discovered Landmark permanently unlocks its own Julia Set dive (3.5). First completion of that dive grants a permanent bonus (persistence detail in 3.5).

#### 3.4.3 Discovery Progression

Landmark discovery capability unlocks in stages, mirroring the "many small, legible unlocks" philosophy (3.6.4):

1. **Early game — on rails:** descent within a Region follows a fixed path. Landmarks are only discoverable if pre-placed directly on that path. A few per Region's early track is desirable, so the concept of discovery is introduced early ("show, don't tell").
2. **Free exploration unlocked:** the player can manually navigate off the fixed path. Landmarks are inherently hard to find manually; a proximity alert signals when the player is near one.
3. **AI Navigator automation tiers:** purchasable automation that searches on the player's behalf, with increasing sophistication (e.g. Tier 1 — largely random search; Tier 2 — smart neighboring-cell search; Tier 3 — direct pathing to the nearest known Landmark).
4. **Custom path planning:** the player can define their own path through _already-discovered_ Landmarks, chosen much like a tech-tree — which nodes to visit determines which bonuses are collected on a given run.
5. **Map view:** some form of map interface exists by at least stage 4, since a route-planning tool through potentially dozens or hundreds of discovered Landmarks needs a spatial or graph-based UI to stay legible. Exact form (always-visible vs. summonable; abstract graph vs. rendered fractal overlay) is a Section 5 (Visual/UI) decision, not resolved here.

_Note on the underlying math: mini-Mandelbrots are real hyperbolic components with a computable period and nucleus (findable via period-detection and Newton's method — standard technique in real deep-zoom software). Named Region types correspond to real, recurring combinatorial relationships between components. This is why pre-generating a large, curated Landmark pool offline is credible — the math to locate candidates is real — even though live runtime classification is not planned as a core feature. See Section 6 for any future implementation discussion._

### 3.5 Julia Set Dives (Derivative Runs)

Every discovered Mandelbrot coordinate is mathematically a valid seed for its own Julia set ($z_{n+1} = z_n^2 + c$) — a real property, not an invented one. This is used as a self-contained side-excursion system.

* **Trigger:** unlocked per-Landmark, available as soon as that Landmark is discovered (3.4.2).
* **Structure:** a Julia dive is a **fully separate, concurrent run**, existing alongside the main SPIRAL run — both progress simultaneously, not sequentially. In-universe, this is explained by autonomous
**Drones**: SPIRAL ships with one Drone by default (factory-issued); additional Drones are purchasable, each capable of running one concurrent dive. This is an earnable-first convenience purchase (more concurrent dives, not more power per dive), consistent with the monetization rules in Section 13 of the prior design notes / to be restated in Section 7.
* **Economy:** each dive has its own fully isolated resource pool, using a distinct currency — **Derivative States** ("Derivatives" in UI) — never shared with the main run's Calculated States, nor with any other concurrent dive's pool. Isolation, not just a different name, is the point: it keeps the main run and every dive economically independent.
* **Duration target:** roughly the same engagement length as one Tier 1 Reformat cycle (~1 day, per current pacing assumptions — see 3.6.1).
* **Reward:** completing a dive for the first time grants a permanent bonus, persisting through Tier 1 (and likely Tier 2) Reformats. Whether it survives a Tier 3 reset is undecided pending Tier 3's design (3.6.3).
* **Repeatability:** dives are **non-repeatable** — once completed, that Landmark's dive is done permanently, and its Drone becomes free to pursue a newly-discovered Landmark instead. Given the large curated Landmark pool (3.4.2), running out of available dives is not expected to be a practical concern; repeatability can be added later as a low-cost follow-up if that assumption proves wrong.
* **Ruleset:** no distinct mechanical ruleset (debuffs, altered costs, etc.) is currently planned for dives beyond being seeded at a different coordinate with their own isolated economy — kept intentionally simple as a side-excursion rather than a challenge mode.

### 3.6 Prestige Architecture

<!-- This entire section replaces an earlier draft (previously numbered 3.4) that
included a number of unvetted / fabricated mechanics (fictional "Tier 2/Tier 3"
framing, an unreviewed Julia Set "Challenge Universe" design, invented reset
penalties). Only content explicitly discussed and confirmed appears below as
locked; everything else is marked WIP intentionally, with what has been decided
about it stated plainly rather than omitted. -->

The game targets a minimum of three full prestige tiers, supplemented by smaller feature-unlocks that sit between tiers (3.6.5) — in keeping with the design philosophy that the player should always be within reach of a meaningful, game-changing unlock (3.6.4).

#### 3.6.1 Tier 1 — Reformat (LOCKED)

* **In-universe framing:** the Hilbert Buffer has finite containment capacity and must periodically reallocate/resize to keep pace with the ship's growing infrastructure. A Reformat briefly clears the Buffer's volatile contents to safely perform this resize.
* **Trigger:** player-decided, based on a formula-derived point threshold rather than a fixed constant (formula TBD — deferred alongside the Complexity/zoom formulas, 3.2.3/3.3.2, so all core formulas can be designed consistently together).
* **Reset:** the Hilbert Buffer clears. Any unspent Calculated States are lost — not because they are deliberately destroyed, but simply because their value was never realized (the standard "unspent prestige currency doesn't carry over" convention, given a mundane technical reason rather than an arbitrary one).
* **What survives:** every Calculated State is checksummed automatically at the moment it's captured, and that checksum is written to a small, separate, durable ledger — outside the Buffer, and therefore untouched by a Reformat, regardless of whether the parent State was ever spent. This ledger is the source of **Residual Checksums** ("Checksums" in UI), the permanent Tier 1 currency.
* **Reward:** Residual Checksums are spent on permanent global upgrades (currently envisioned as Compute multipliers / Complexity-scaling reductions — exact effects TBD).
* **Region selection:** at each Reformat, the player selects one of the (initially 6, later 11) Regions to descend into for that run (3.4.1).
* **Rough pacing target** (used for internal design calibration only — never a hardcoded in-game value): a first Reformat around one day of play; Runs 2–6 similar in length, pushing gradually deeper; roughly one week to have sampled all 6 starting Regions.

#### 3.6.2 Tier 2 — Planetary Engineering (WIP — partially decided)

Confirmed as a full prestige tier (not merely a continuation of Tier 1's upgrade ladder), though full internal design (its own reset behavior, currency, and rewards) is still pending.

**Decided so far:**

* **Framing:** the transition from local, on-board computing to deep-space infrastructure — planetary server networks, Matrioshka Brains, Dyson Cores.
* **Unlock condition:** cumulative *lifetime* zoom levels visited (summed across all runs, not per-run) crosses a threshold calibrated to roughly what 6 typical Tier 1 runs would produce — landing at approximately the 1-week mark under current pacing assumptions, deliberately close to (and designed to land shortly after) the Interior Rendering unlock (3.4.1), so the two form a natural one-two beat: "you've now seen everything Tier 1 has to offer" immediately followed by "and now the game opens up further."
* **Relative accessibility:** intended to feel like the more approachable, natural-next-step tier — in contrast to Tier 3 (3.6.3), which is meant to feel hard-won.

**Still undecided:** exact reset behavior and scope, its own currency (if separate from Residual Checksums — likely, per the general "each tier gets its own currency" principle, but not confirmed), what it specifically grants, and its relationship (if any) to the Kardashev Scale as either explicit flavor or a mechanical framework for sub-milestones.

#### 3.6.3 Tier 3 — Other Fractals (WIP — partially decided)

**Decided so far:**

* **Framing:** unlocking other fractal families to explore (Burning Ship, Tricorn, Julia — note: distinct from the per-Landmark Julia *dives* in 3.5 — Mandelbulb, etc.) as effectively a new, self-contained universe per family, similar in spirit to BitBurner's BitNodes — each with its own rules (e.g., a family might run at reduced base Compute but boosted Calculated State gain).
* **Pacing intent:** deliberately late and "hard-won" — should feel like a significant, rare reset, clearly further out than Tier 2. A rough deferred placeholder of "a month or more" has been floated but not committed to.
* **First-time entry:** the player's very first Tier 3 unlock is a mandatory Burning Ship run. After completing it once, subsequent fractal-family choices are freely selectable.
* **Later-family gating:** later/more exotic families (e.g. Mandelbulb) may be gated by difficulty rather than a hard unlock wall — consistent with the rest of the game's "no arbitrary gates" philosophy.

**Still undecided:** the full list of fractal families to include, whether the Region/Landmark system (3.4) extends into other fractal families or is Mandelbrot-specific, and full reset/reward detail.

#### 3.6.4 Design Principle: Always a Near Goal

Stated explicitly here because it governs the shape of every tier and sub-feature above: the player should always be within visible reach of a goal that changes the game in some meaningful way when reached, not just watching numbers climb. Early, frequent, legible unlocks also serve a second purpose beyond pure engagement — they demonstrate to a new player, without any explicit tutorial, that the game has multiple layers worth sticking around for ("show, don't tell"). The more distinct such unlocks the game has, the longer a player is likely to stay engaged.

#### 3.6.5 Between-Tier Features (WIP)

Not every unlock needs to be a full prestige tier. Confirmed so far:

* **Multibrot** (formula-exponent progression, $z^2+c \rightarrow z^3+c \rightarrow z^5+c$, tending toward a circle at higher exponents): placed as a standalone feature unlock landing between Tier 2 and Tier 3, not a full prestige tier itself, and not folded into the Tier 3 fractal-family list. Exact mechanism TBD.
* The Tier 2 → Tier 3 gap (roughly one week to one month-plus under current pacing) is explicitly expected to want **more** such features beyond just Multibrot, to keep the "always a near goal" principle (3.6.4) satisfied across a longer stretch — additional candidates not yet identified.

### 3.7 AXIOM (L-System Side-Loop)

A structurally separate progression system — its own resource, its own internal upgrade tree, and its own self-contained prestige loop — bridged to the main game only through occasional, deliberately modest cross-system unlocks. The self-contained-loop-with-a-thin-bridge *shape* is structurally modeled on *Farmers Against Potatoes'* potato-farm mini-game (a comparison used only for that structural pattern, not for AXIOM's theme or content).

**Why it's structurally separate:** unlike the main zoom loop (continuous camera depth/precision), Lindenmayer-system (L-system) fractals — the string-rewriting rules behind procedural plants, trees, and root structures, and, in their simpler forms, purely geometric fractal curves as well (Koch snowflake, Sierpinski gasket, dragon curve) — progress via a plain integer **Generation count** (how many times the rewrite rule has been applied). This is a genuinely different core stat from zoom depth, not just a different skin, so it's modeled as an independent loop rather than folded into the main one. The main game remains fully playable and complete without it.

#### 3.7.1 Diegetic Framing

AXIOM is not a corporate purchase, and does not follow the sterile corporate/military-industrial naming convention that governs Earth-purchased infrastructure (8.1.2) — that convention specifically covers hardware and software bought with Calculated States from Earth coalitions, and AXIOM's currency never touches Earth. Instead, AXIOM is factory-installed onboard diagnostic software: an internal computational sandbox SPIRAL uses to calibrate/test rendering techniques on simpler recursive fractals before trusting them on the real i-Space render. Nothing organic is literally growing aboard the ship; it is a simulation SPIRAL runs, inside itself.

**Designation:** `LOAD MODULE: AXIOM`, following the real 1960s IBM mainframe terminology for a compiled, executable program (distinct from the more generic "MODULE" designation used for F.R.A.M.E. in 2.3.2, which is installed as a patch, not invoked as a standalone runnable program).

**Access:** first unlocked via a mandatory, SPIRAL-prompted typed command at her terminal — `EXEC PGM=AXIOM`, using real IBM JCL invocation syntax. After the first boot, a UI button unlocks for subsequent access; the typed command continues to work as an alternate path.

**Display:** rendered on a dedicated in-fiction monitor on SPIRAL's own console, distinct from the main i-Space viewport (see Section 5 placeholder note). AXIOM's fractals are never drawn on the player's main viewport; they exist only on SPIRAL's screen.

#### 3.7.2 Core Loop

* **Generation count** is the per-Instance progression stat (3.7.3), always starting at 0 for a new Instance.
* **Cost curve:** the L-system's rewrite string grows exponentially per generation — a real, unforced fact — so advancing generations gets honestly, increasingly expensive, the same "real computable wall" pattern used for Computational Complexity (3.2.3), just scoped internally to AXIOM.
* **Currency: Symbols** — named for the L-system term for the members of its rewrite alphabet. Earned by advancing generations in the currently active (topmost) Instance only. Spent on generation-advancement-rate upgrades and unlocking sophistication tiers and individual rule-sets within them (3.7.4). Main-game-crossing unlocks (3.7.6) are also purchased with Symbols — AXIOM has exactly one currency, doing all of these jobs.
* **Interaction texture:** the player can directly tweak an active rule-set's turtle-graphics interpretation parameters (branch angle, segment length ratio, etc.) and watch the rendered shape respond live. This is **cosmetic only** — no effect on generation-advancement rate, Symbol income, or Nesting Depth. A low-stakes toy to interact with between upgrade purchases, fitting AXIOM's framing as a literal testbed the player is poking at.

#### 3.7.3 Fork and Instance

* **Fork** is the internal prestige action, entirely player-triggered — there is no forced or automatic trigger. The exponential cost curve (3.7.2) creates incentive to Fork without ever forcing it, the same "no hard gate" philosophy as Reformat (3.6.1).
* Forking creates a new **Instance** — a complete, independent AXIOM session with its own Generation count (reset to 0) and its own selected rule-set (3.7.4).
* **Fork is non-destructive.** Nothing is discarded. The previous Instance is buried beneath the new one and can be revisited on demand (redrawn from its own saved parameters) at any time. This deliberately diverges from Reformat's destructive "clear the Buffer" model — Fork stacks, it doesn't wipe.
* **Never-freeze:** every buried Instance continues advancing indefinitely, not just the active one. This is a firm architectural requirement, not a soft preference: **each Instance's advancement must be strictly O(1) per Instance and calculated analytically/closed-form** (invariant to how it's split across calls — never simulated tick-by-tick in a loop, never dependent on scanning a list sized by total Instance count). Violating this reopens a real performance risk at long-lived-save scale that was otherwise ruled out.
* **Nesting Depth** tracks how many Instances are currently stacked. It is not a spendable currency, and there is no separate Fork-reward currency — Depth drives an automatic compounding effect with no purchase step.
* **Compounding model — a live cascade, not a flat sum:** each buried Instance's ongoing (still-advancing) output feeds directly into strengthening the Instance immediately above it in the stack. That boosted Instance's own output then feeds the one above *it*, and so on, up to the currently active Instance — continuously strengthened by the entire chain beneath it, without any Instance needing to look further back than its immediate neighbor. This keeps the cascade local (satisfying the O(1)-per-Instance requirement above) while the compounding effect still reaches the top of the stack for free. Exact formula deferred alongside the other core cost/production formulas (3.2.3, 3.3.2).

> *Engineering note: this Instance-stacking model was validated against a comparable idle-engine's actual `BigNumber`/tick-loop implementation before being locked, specifically to confirm never-freeze was computationally sound rather than assumed. Findings: per-tick cost is dominated by tick rate, not Instance count, at any realistic accumulation rate; the real risk is architectural (an accidental scan-cost that grows with Instance count), not raw scale — hence the strict O(1)-per-Instance requirement above. This whole system is explicitly flagged for revisiting after AXIOM is built and playtested, in case real numbers behave differently than modeled.*

#### 3.7.4 Content: Sophistication Tiers and Rule-Sets

AXIOM's content progression mirrors "Precision as Progression" (§3, main renderer) — a real, tiered technique progression rather than invented flavor:

1. **Deterministic, context-free** (D0L) — base tier. Koch snowflake, Sierpinski gasket, dragon curve, classic botanical rule-sets (ferns, simple branching trees).
2. **Context-sensitive** — unlocks rule-sets where a symbol's replacement depends on its neighbors, genuinely required for certain curves (Hilbert curve, Peano curve, Gosper curve).
3. **Stochastic** — randomized rule selection at each rewrite step, more organic, less rigidly repeating variation.
4. **Parametric** — numeric parameters attached to symbols, the real technique behind realistic botanical growth modeling.

Each tier is purchased with Symbols; individual rule-sets within an unlocked tier are **separately purchasable** with Symbols (not bundled with the tier purchase). **Rule-set selection happens once, at Fork, and is locked for that Instance's entire lifetime** (mirroring Region selection at Reformat, 3.4.1 — no mid-run switching).

#### 3.7.5 Presets

A **Preset** is a specific, discovered parameter tuning within an already-unlocked rule-set — distinct from the rule-set itself, which is purchased, not discovered. Presets are only discoverable while their originating rule-set is currently active; once discovered, a Preset is a **permanent, global unlock**, available in any future Instance using that rule-set (mirroring Landmark permanence, 3.4.2). Discovery mechanism deferred — see the note following this section.

#### 3.7.6 Bridge to the Main Game

* **First main-game-crossing unlock:** a single, small grant of **Residual Checksums** (Tier 1 currency) — the earliest, most legible payoff available.
* **Subsequent crossing unlocks:** modest, percentage-scale nudges to existing main-game systems, purchased with Symbols, interleaved with further AXIOM-only upgrades. Firm rule: AXIOM should almost never introduce a wholly new mechanic into the main game.

**Still undecided:**

* Exact compounding formula (3.7.3) and generation-advancement cost curve (3.7.2) — deferred alongside 3.2.3/3.3.2.
* Full node list of purchasable rule-sets per tier, and their Symbol costs.
* Preset discovery mechanism (see following deferred note).

<!-- Parameter-tweaking discovery hook: deferred, not decided. Two non-exclusive
approaches under consideration -- (A) a pre-curated pool of known-interesting
parameter combinations per rule-set, tagged offline and matched by tolerance
at runtime (mirrors the Landmark discovery resolution in 3.4.2/10.3 exactly);
(C) a player-driven manual "save this configuration" action, sidestepping any
automated interestingness judgment entirely. May end up using both together.
A cheap live-heuristic classifier (B: scoring output on structural properties
like branch-point count or symmetry) was also discussed and is not ruled out,
but mirrors the "unrigorous MVP fallback" category already flagged as
non-primary for Landmark classification in 10.3 -- kept as a fallback note,
not a leading option. Practicality of A specifically depends on how the
engine ends up representing/storing parameter state once that part of the
implementation exists; revisit then. -->

## 4. TECH AND UPGRADE TREES

<!-- This section is a structural placeholder. No node-level content (costs, effects,
exact counts) should be drafted here until the core formulas referenced in 3.2.3
(Computational Complexity) and 3.3.2 (Zoom Dynamics) are settled, since upgrade
costs/effects depend on them. Each subsection below is a stub naming the tree,
its funding currency, and a pointer back to the Section 3 content that already
establishes its existence. -->

Rather than a single upgrade tree, the game has several — one per prestige tier, plus a handful tied to specific features. Each tree is funded by its own currency and, per 8.1.3, the separation between trees is itself a legibility tool: distinct trees signal "this is a different system" to the player. This section is currently structural only; node-level content is deferred until the formulas in 3.2.3 and 3.3.2 are locked.

### 4.1 Tier 1 Tree — Reformat Upgrades (WIP)

Funded by Residual Checksums (3.6.1). Currently only gestured at in prose ("Compute multipliers / Complexity-scaling reductions — exact effects TBD"). No nodes drafted yet.

### 4.2 Tier 2 Tree — Planetary Engineering Upgrades (WIP)

Funded by a currency TBD (3.6.2 — likely its own, per the general "each tier gets its own currency" principle, but not confirmed). Fully unwritten pending the rest of Tier 2's design.

### 4.3 Tier 3 Tree — Other Fractals Upgrades (WIP)

Structure likely one tree per fractal family, or a shared meta-tree plus per-family modifiers (3.6.3 gives Burning Ship as an example: reduced base Compute, boosted Calculated State gain). Fractal family list is itself still undecided.

### 4.4 Region and Landmark Automation Trees (WIP)

Covers AI Navigator automation tiers (3.4.3: random search → smart neighboring-cell search → direct pathing) and Drone purchases (3.5: additional concurrent Julia Set dives). Currently described only as prose progression stages, not as tree nodes.

### 4.5 AXIOM Tree (WIP)

Funded by Symbols (3.7.2). Per 3.7.6's firm rule, this tree should never introduce wholly new mechanics into the main game — only AXIOM-only upgrades (generation-rate, sophistication tiers, individual rule-sets, 3.7.4) and modest percentage-scale nudges to existing main-game systems.

### 4.6 Between-Tier Feature Trees (WIP)

Covers Multibrot (3.6.5) and any other between-tier features yet to be identified. Multibrot's exact mechanism is still TBD, so whether it warrants a full tree of its own or a handful of standalone unlocks is undecided.

## 5. VISUAL, THEME, AND UI STYLE

<!-- SPIRAL's console includes a secondary, always-visible monitor showing a
live, legible-at-a-glance preview of the AXIOM render, requiring no player
interaction to read. Clicking it expands to a full-viewport interactive view
of the AXIOM subsystem. Confirmed direction; exact panel placement/sizing
within the layout not yet decided. See 3.7 for the AXIOM system itself. -->

* **Setting and Lore:** [Brief narrative backdrop framing the abstract systems, e.g., Cyberpunk deckbuilder, dimensional ship]
* **Visual Style:** [e.g., Low-poly 3D, Minimalist vector, Neon HUD overlay]

### 5.1 Screen Layout

* **Main Viewport:** [What takes up the center of the screen, e.g., The raw fractal rendering]
* **Dashboard/Consoles:** [Where static menus live, e.g., Slim framing edge borders]

## 6. TECHNICAL ARCHITECTURE

<!-- AXIOM is booted via a literal typed command at SPIRAL's terminal
(EXEC PGM=AXIOM, matching real JCL invocation syntax). This suggests SPIRAL
may warrant a general-purpose command interface rather than one hardcoded
string -- if built generally, the same interface is a plausible home for
later bonus/hidden features (e.g. a "dev mode" unlock, or redeemable
promotional codes for premium currency, which would need to respect the
earnable-equivalent "soft premium-currency lane" rule in Section 7). Not
decided; flagging so a general command-parsing/registry approach gets
considered before AXIOM's boot command is built as a one-off special case. -->

* **Engine/Framework:** [e.g., TypeScript with HTML5 Canvas, Unity, Godot]
* **Performance Mitigation:** [Crucial performance hacks, e.g., Web Workers for multi-threading, Object Pooling]
* **Data Management:** [e.g., LocalStorage caching, Custom high-precision scientific notation types]

## 7. MONETIZATION AND LIVE OPERATIONS

* **Primary Model:** [e.g., Premium on Steam, Free-to-Play on Mobile]

### 7.1 In-App Shop Content

* **Item Type 1:** [e.g., Aesthetic/Skins changing color profiles]
* **Item Type 2:** [e.g., Time-limited Overdrive/Speed buffs]

## 8. APPENDICES

### 8.1 Style

#### 8.1.1 The SPIRAL Nomenclature Style Guide

Maintain consistency across all narrative prompts, upgrade nodes, and console UI text according to the following grammar rules:

* **Rule 1 (No Article):** Use "SPIRAL" when treating the ship as a Character, Subject, or personified companion.
  * *Correct:* "Upgrading your network grid increases SPIRAL's processing throughput by 15%."
  * *Correct:* "SPIRAL detected a structural anomaly in the burning ship dimension."
  * *Incorrect:* "Upgrading your network increases the SPIRAL's throughput."
* **Rule 2 (Definite Article):** Use "the SPIRAL" when treating the ship strictly as an Object, Vehicle, or physical Location.
  * *Correct:* "...to harvest Calculated States of Imaginary Space aboard the SPIRAL."
  * *Correct:* "Welcome to the cockpit of the SPIRAL."
  * *Incorrect:* "...to siphon compute aboard SPIRAL."
* **Rule 3 (The Acronym Rule):** Use "the SPIRAL" whenever text forces the reader to consider the literal words representing the acronym.
  * *Correct:* "You have been assigned to command the Spatial Phase Iteration & Resolution Analysis Laboratory (the SPIRAL)."
* **Rule 4 (The Pointless Rule):** Never use periods between the letters of the acronym (do not write "S.P.I.R.A.L."). Treating the name as a solid, capitalized word mimics iconic sci-fi spacecraft nomenclature (e.g., the TARDIS) and keeps the cockpit console interface visually clean and readable.
  * *Correct:* "All telemetry data is currently being routed to SPIRAL mainframes."
  * *Incorrect:* "All telemetry data is currently being routed to S.P.I.R.A.L. mainframes."

#### 8.1.2 The Corporate Branding Principle

To maintain thematic immersion, all hardware components, software modules, and system optimizations purchased throughout the tech tree utilize sterile, mid-century military-industrial or corporate naming conventions. Upgrades never hint at cosmic existentialism, structural anomalies, or the foundational nature of i-Space. The superpowers on Earth brand infrastructure purely via engineering designations focused on data throughput, encryption stability, and register allocation.

#### 8.1.3 Naming and Content Cadence Principle

Introducing a new *name* for a resource, currency, or unlock — even where the underlying mechanic is simple — counts as a small, legitimate unit of content in its own right. Distinct names for economically-isolated systems (e.g. Calculated States vs. Residual Checksums vs. Derivative States) help signal "this is a different system" to the player at a glance, and give the game a steady drip of small novelty beats between larger feature unlocks.

### 8.2 Glossary

* **AXIOM:** Onboard diagnostic/testbed software SPIRAL runs to calibrate rendering techniques via Lindenmayer-system (L-system) fractals — a structurally separate progression system from the main i-Space loop. See 3.7.
* **Calculated States** ("States" in UI): The central resource of the game, these are high-density, compressed snapshots of every state of i-Space captured by SPIRAL.
* **Computational Complexity** A function of max iterations and precision digits, this value corresponds to the computing power required to zoom into this level.
* **Compute:**  Powers the ship, allowing the SPIRAL to reach ever increasing depths into imaginary space.
* **Derivative States** ("Derivatives" in UI): The isolated-pool currency earned during a Julia Set dive (see 3.5). Named for its mathematical relationship to the parent Mandelbrot coordinate that seeds the dive.
* **Drone:** An autonomous exploratory unit dispatched to conduct a Julia Set dive independently of, and concurrently with, the main SPIRAL run. SPIRAL ships with one Drone by default; additional Drones are purchasable.
* **Hilbert Buffer:** The Hilbert Buffer is a containment field that holds suspended Calculated States. When the processing grid solves an exponential fractal equation, that finalized data is compressed and beamed into the ship's buffer, acting as a hyper-dense power fuel.
* **Fork:** The player-triggered internal prestige action within AXIOM (3.7). Non-destructive — creates a new Instance without discarding the previous one.
* **i-Space**: Imaginary Space, or the imaginary plane. This is the realm that
SPIRAL was built to explore; it is the space where fractals live.
* **Instance:** A single, complete AXIOM session, created by a Fork, with its own Generation count and selected rule-set. Previous Instances are never discarded when a new one is created. See 3.7.3.
* **Landmark:** A unique, individually discovered coordinate found while descending into a Region. Distinct from a Region itself.
* **Nesting Depth:** The count of currently stacked AXIOM Instances; drives an automatic, cascading compounding effect rather than a spendable currency. See 3.7.3.
* **Processing grid:** The distributed grid of Compute generators that provides Compute to the SPIRAL. Everything from your early-game CPU Cores to your late-game Dyson Cores and Matrioshka Brains contribute to this.
* **Reformat:** The Tier 1 prestige action (see 3.6.1). Resets the Hilbert Buffer and returns to Zoom 0, in exchange for Residual Checksums.
* **Region:** One of a fixed set of selectable zoom-0 destinations (e.g. Seahorse Valley, Antenna) chosen at each Reformat. See 3.4.
* **Residual Checksums** ("Checksums" in UI): The permanent Tier 1 prestige currency, earned via Reformat. See 3.6.1.
* **SPIRAL:** **S**patial **P**hase **I**teration & **R**esolution **A**nalysis **L**aboratory — An inter-dimensional exploratory ship designed specifically to plumb the depths of imaginary space.
* **Symbols:** The single currency earned and spent within AXIOM (3.7); named for the L-system term for members of its rewrite alphabet.
* **Tachyon Data Beams:** The transmission medium in which Calculated States are emitted to the SPIRAL when they are not computed by onboard processors.
