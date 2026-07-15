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

### 3.1 Core Gameplay Loop Schematic

The underlying incremental progression of the game functions on a cyclical, closed-loop economic system. Processing hardware directly dictates resource output, which is spent to continuously scale the hardware infrastructure.

```text
       ┌────────────────────────────────────────────────────────┐
       ▼                                                        │
[Processing Grid] (Cores/Megastructures)                        │
       │                                                        │
       ▼ Generates at 60 Ticks/Second                           │
[Compute Stat] (GigaFLOPS Processing Capacity)                  │
       │                                                        │
       ▼ Fills Over Time                                        │
[Hilbert Buffer] (Calculated States / Spendable Currency)       │
       │                                                        │
       └─► [Purchase Hardware Updates] ─────────────────────────┘
       │
       ▼ Overcomes
[Computational Complexity] ──► Pushes Camera Deeper into i-Space
```

### 3.2 Loop Component Descriptions

#### 3.2.1 The Compute Stat (The Accumulation Engine)

* **Mechanical Classification:** Pure, non-consumable, passive production rate statistic.
* **Function:** Computed as the cumulative sum of all purchased nodes across the Processing Grid. It represents the vessel's absolute mathematical calculation throughput per second.
* **Behavior:** Compute is never spent, lost, or depleted during standard gameplay purchases or upgrades.

#### 3.2.2 The Hilbert Buffer and Calculated States (The Economy)

* **Mechanical Classification:** Primary consumable, liquid resource (Spendable Currency).
* **Function:** Every frame, the engine evaluates the current **Compute Stat** and multiplies it by time delta metrics to generate **Calculated States**. These states represent the finalized, highly dense numerical records captured along the fractal coastline.
* **Behavior:** Calculated States scale up exponentially via the custom `BigNumber` tracking structure. They are completely consumed when the Operator authorizes the purchase of hardware grid additions or unlocking advanced mathematical utility subroutines.

#### 3.2.3 Computational Complexity (The Progression Gate)

* **Mechanical Classification:** Environmental scaling metric (The Value Scalar).
* **Function:** Calculated dynamically as an exponential function of the current **Zoom Level Exponent** and the matching required **Max Iterations**.
* **Behavior:** As the player descends into i-Space, the Computational Complexity increases. 
  * **The Parity State ($Compute \ge Complexity$):** The background Web Workers instantly resolve tiles, and the currency generation loop operates at 100% baseline capability.
  * **The Underflow State ($Compute < Complexity$):** The game’s tile-rendering pipeline cannot calculate real-time frames instantly. The engine drops into the *Progressive Refinement* phase, displaying low-resolution pixel grids that take real hardware seconds to snap into high-definition definition blocks. Currency accumulation rates are temporarily throttled until higher-tier hardware is added to match the depth requirements.

---

### 3.3 The Core Interaction Schema

#### 3.3.1 Active Navigation (Panning & Scouting)

* **Input Mechanics:** Left-Click and Drag (Desktop) or Single-Touch Drag (Mobile) utilizes Pointer Events to seamlessly shift the viewport coordinates across the complex plane ($c = x + yi$).

* **The Hunting Loop:** The player manually pans away from the automated trajectory to locate high-density filament strands. Moving close to hidden, hardcoded landmark coordinate thresholds triggers the *Proximity Sensor*, permanently locking the location into the ship’s log and granting a regional stat bonus.

#### 3.3.2 Continuous Zoom Dynamics

* **The Visual Engine:** By default, the camera continuously descends exponentially into the current landmark vector. The magnification factor scales automatically based on your active resource generation.
* **The Canvas Loop:** The main execution thread applies a hardware-accelerated 2D scale transformation to the current canvas at 60 FPS, stretching the existing pixels cleanly. Concurrently, the Web Workers process future frames at the deeper magnification layer, seamlessly swapping the high-resolution buffers in to replace the stretched assets without dropping frames.

#### 3.3.3 The Custom BigNumber Specification

Because standard JavaScript numbers experience mathematical breakdown past $10^{308}$ and native floats lose fractional accuracy at $10^{15}$, all resource tracking, cost variables, and modifier variables utilize a custom scientific notation class:

```typescript
interface BigNumber {
  mantissa: number; // 64-bit native floating-point tracking core values (1.0 to 9.999...)
  exponent: number; // 64-bit integer tracking the scale magnitude (up to 10^9000000000)
}
```

* **Gameplay Benefit:** This structure completely handles the vast financial scaling standard to late-stage idle games. The player's balance can climb to values like $6.23 \times 10^{14,000}$ Calculated States smoothly, matching the infinite, exponential zoom scales of the underlying fractal universe.

## 4. METAGAME AND PROGRESSION SYSTEMS

### 4.1 Core Currencies and Resources

* **Resource A (Soft):** [Name] — How it is earned, what it buys.
* **Resource B (Premium):** [Name] — Milestone reward or microtransaction currency.

### 4.2 Prestige and Reset Tiers

* **Tier 1 Reset:** [Trigger conditions, what resets, what permanent currency/stat is gained.]
* **Tier 2 Reset:** [The macro-reset loop, major milestones unlocked.]

### 4.3 The Tech and Upgrade Tree

* **Node Category 1:** [e.g., Active Speed Upgrades]
* **Node Category 2:** [e.g., Passive/Automation Infrastructure]

## 5. VISUAL, THEME, AND UI STYLE

* **Setting and Lore:** [Brief narrative backdrop framing the abstract systems, e.g., Cyberpunk deckbuilder, dimensional ship]
* **Visual Style:** [e.g., Low-poly 3D, Minimalist vector, Neon HUD overlay]

### 5.1 Screen Layout

* **Main Viewport:** [What takes up the center of the screen, e.g., The raw fractal rendering]
* **Dashboard/Consoles:** [Where static menus live, e.g., Slim framing edge borders]

## 6. TECHNICAL ARCHITECTURE

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

### 8.2 Glossary

* **Calculated States:** The central resource of the game, these are high-density, compressed snapshots of every state of i-Space that captured by SPIRAL.
* **Computational Complexity** A function of max iterations and precision digits, this value corresponds to the computing power required to zoom into this level.
* **Compute:**  Powers the ship, allowing the SPIRAL to reach ever increasing depths into imaginary space.
* **Hilbert Buffer:** The Hilbert Buffer is a containment field that holds suspended Calculated States. When the processing grid solves an exponential fractal equation, that finalized data is compressed and beamed into the ship's buffer, acting as a hyper-dense power fuel.
* **i-Space**: Imaginary Space, or the imaginary plane. This is the realm that
SPIRAL was built to explore; it is the space where fractals live.
* **Processing grid:** The distributed grid of Compute generators that provides Compute to the SPIRAL. Everything from your early-game CPU Cores to your late-game Dyson Cores and Matrioshka Brains contribute to this.
* **SPIRAL:** **S**patial **P**hase **I**teration & **R**esolution **A**nalysis **L**aboratory — An inter-dimensional exploratory ship designed specifically to plumb the depths of imaginary space.
* **Tachyon Data Beams:** The transmission medium in which Calculated States are emitted to the SPIRAL when they are not computed by onboard processors.
