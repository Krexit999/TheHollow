# THE HOLLOW — SPEC (read only the sections a phase touches)

> Split from DESIGN.md. Shells, systems, currencies, world, pacing, stack.
> Pillars/rules/formulas live in PILLARS.md.

## The seven shells

Each shell = 3-4 interlocking systems + 1 craft-system. Signature mechanic carries
down permanently on Breach.

**I — LOAM** · Dust, Brick, Ash, Loam, Marl
- The Face: grid of cells with charge; click/drag to chip; cells refill from below
- The Kiln: Dust -> Brick converter, throughput-limited, own fuel curve
- Drill Bay: up to 24 drills, each upgradeable, each with targeting behavior
  (fullest-cell / sweep / random / adjacency-chain). Loadout matters.
- Craft-system: THE LATTICE

**II — FERRITE** · Ingot, Flux, Scale, Lodestone, Rime
- Signature: POLARITY. Every cell is + or -. Chipping like-charged cells
  consecutively multiplies exponentially; breaking the chain penalizes. Clicking
  becomes a routing problem.
- The Forge: tool tiers, hardness gating, tool affixes
- Magnet Array: placement puzzle over the face that pre-arranges polarity
- Craft-system: ALLOY CRUCIBLE

**III — VERDANCE** · Spore, Sap, Chlorophyll, Humus, Resin
- Signature: GROWTH. Cells you DON'T mine sprout into vines that generate passively
  and spread to neighbors. Harvest now vs. let a quadrant go feral.
- The Greenhouse: 12 species, cross-breeding, ~80 hybrids
- Mycelium Network: spreading node graph; connected nodes share bonuses
- Craft-system: THE LOOM

**IV — GLASSMERE** · Prism, Lumen, Silica, Spectrum, Frost
- Signature: REFRACTION. A beam enters the face; place mirrors to route it. Every
  cell it crosses is multiplied.
- The Observatory: 10min-12hr observations returning Spectrum + star charts (AFK)
- Wavelength Split: late-shell, beam splits into 6 colors affecting different cells
- Craft-system: REFRACTION BENCH

**V — CINDER** · Slag, Ember, Obsidian, Pyre, Cinder
- Signature: PRESSURE. Heat accumulates as you mine. Don't vent it and the shaft
  floods — you lose the run. First real failure state, highest yields in the game.
- Vent Network: pipe-routing layer, built once, tuned constantly
- Magma Wells: commit currency, wait, roll 3x-40x or total loss
- Craft-system: EMBER ARRAY

**VI — HOLLOW** · Void, Resonance, Null, Hush, Umbra
- Signature: ABSENCE. There is no rock. No face. All income comes from systems
  carried down from the five shells above. A hard check on Breach investment.
- The Silence: a stacking debuff you manage rather than remove; managing it well
  IS the income source
- Reconstruction: rebuild a phantom face from Void, one cell at a time
- Craft-system: ECHO CHAMBER

**VII — ALEPH** · Axiom Fragment, Sigil, Aleph
- Parallel View: all six shells above, live, on one screen, all running
- The Rewrite: spend Axioms to alter generation rules permanently
- Craft-system: AXIOM SOLITAIRE

## Craft-systems
Not score-attack minigames. Persistent boards returned to for the entire game, each
with its own currency, rank track, and Codex.

- **THE LATTICE** (I) — Hex board. Place Motifs (shape: circle/square/triangle/hex
  + rank). Adjacency causes resonance. Three same-shape in a line = a **Chord** with
  a named permanent effect. Chords are DISCOVERED by experimenting, not listed.
  40 chords. Later: **Progressions** (chord sequences read in placement order) —
  rarer, far stronger. Board grows 7 -> 61 hexes with Brick.
- **ALLOY CRUCIBLE** (II) — Pour metals in ratios (e.g. 3 Ingot : 1 Flux :
  2 Lodestone) -> named alloy with rolled stats. Valid ratios are a sparse set in a
  large space; Codex hints narrow the search. ~60 alloys, slot into tools,
  duplicates fuse upward.
- **THE LOOM** (III) — Assign thread types to warp rows and weft columns; the
  intersection grid produces a pattern. Effects come from tetromino-like SHAPES
  emerging in the pattern. 8 threads, 6x6 grid. Solving for emergent shape.
- **REFRACTION BENCH** (IV) — Place optics, route beam through targets. Every solved
  config is saved as an equippable **Lens**. 50 authored puzzles + generator.
- **EMBER ARRAY** (V) — Real-time. Place fuel in a furnace grid; it burns and spreads
  heat to neighbors. Sustain a target temperature band. Best duration = persistent
  multiplier.
- **ECHO CHAMBER** (VI) — Record a sequence of your own actions (up to N steps); the
  Chamber replays it forever. Shorter + more efficient scores higher. This is a
  programming language for your own automation. Deepest system in the game.
- **AXIOM SOLITAIRE** (VII) — Card game where the deck is built from your owned
  upgrades. Run-based, roguelike-adjacent, feeds Axiom Fragments.

## Cross-shell systems
- **The Foundry** — permanent modules in a limited slot grid, slots Echo-gated
  (3 -> 12). Modules conflict and synergize. ~70 modules.
- **Expeditions** — send crews into side tunnels, 2 min - 8 hrs. Pure AFK. Returns
  currency bundles and relics. Makes overnight worth logging in for.
- **The Caravan** — trade currencies between shells at rates drifting on a real
  clock. Rewards checking in; never punishes not checking in.
- **Relics** — ~80, Common -> Mythic, rolled affixes, fusable, 6 slots.
- **Depth Records** — max depth per shell is permanent, survives Recursion, feeds
  every prestige formula. A bad run still moves you forward.
- **Achievements** — 250 in a 25x10 grid. Each gives a real bonus; completing a full
  row or column gives a large one. Grid completion is an endgame goal.
- **The Codex** — ~250 discoveries across all craft-systems. Longest tail in the game.

## World, story, combat, NPCs

**Ore taxonomy** — **139 materials**, each carrying 2-3 of ten TRAITS (Phase 17)
that make it a character rather than a tier: 100 mineable, 32 dropped only by the
Deepwrought, and 7 WORKED (made at the Refinery, never found — byproducts,
transmutation intermediates and the quench medium), 6 rarity tiers: Common / Rich / Pure / Flawless / Starred /
Aberrant. Each has a rolled purity 0-100% that carries into anything crafted
from it. Gems are separate and socketed rather than smelted — **6 of them**:
Bloodgarnet, Voidopal, Hearthstone, Cinderquartz, Mourningpearl, Axiomite.
Geodes are unidentified until cracked.

**Currencies — 39**: 29 shell-local (each shell's chip + converter coin and its
craft currencies), 3 meta, 4 reset-layer. The reset ladder decides what each one
survives; the Compendium generates a page per currency from the registry.

> Counts in this document are the REGISTRY's, re-measured in Phase 14. They had
> drifted (the doc said ~90 materials while the game shipped 132). Where a
> number here and a number in `src/engine/` disagree, the registry is right and
> this document is the bug.

**The Deepwrought** — things live in the shells. Combat is turn-based-with-timing:
swing on a rhythm, enemies telegraph, positioning on a small lane grid. ~15 species
per shell plus a **Floor Warden** boss guarding each Breach. Drops materials that
cannot be mined.

**Tools are weapons** — one item, two stat blocks (chip power / strike power), so
every choice is a tradeoff. ~140 craftable across 15 tiers. Named, not generic:
Marlsplitter, Cinder Maul, Lodestone Rake, Nullpick, Verdant Scythe, Aleph Edge.
Plus off-hands, lanterns, harnesses, boots that change movement on the face.

**Rune Inscription** — separate layer from alloying. Etch runes in sequences where
adjacent runes interact (Kel-Thur-Kel != Kel-Kel-Thur). Runes are found, not bought.
Bad sequences ruin the INSCRIPTION, never the piece — the etched runes are lost and
the surface must be re-prepped at a real material cost. (AMENDED at Phase 8 kickoff,
by instruction: "Keep the stakes, remove the trap." Original read "can brick a piece";
the softening is recorded in A.17.)

**The Guild** — surface hub. ~30 named NPCs with schedules, moods, and stock that
rotates on a real clock. **Marrow**, the smith who won't work with impure ore.
**Vess**, the merchant who haggles and remembers if you lowballed her. **Old Quill**,
the archivist who translates lore fragments for a fee. Reputation per NPC unlocks
recipes, discounts, personal questlines.

**Story** — **Sable** went ahead of you and left journals at depth. You find them out
of order and they get less coherent the deeper you go. Seven shells of slow reveal
about what the Core actually is and why the world is built in layers. Delivered in
fragments while mining. Never cutscenes.

**Contracts Board** — rotating NPC jobs (bring 400 Flawless Ingot / kill 12
Rimewraiths / reach depth 180 without collapsing). Pays Scrip, Renown, recipes.
Stacks with what you were already doing.

**Hirelings** — recruit NPCs to run drills, auto-sell, auto-craft, or fight beside
you. They level, have personalities, can die permanently in Cinder.

**The Warrens** — optional side-tunnels off the main shaft. Hand-built mini-dungeons:
fixed layout, a puzzle, a fight, a guaranteed unique. ~4 per shell.

**Brewing** — alchemy from Sap, Spore, Resin. Timed consumables: Longlight (+regen),
Ironblood (combat), Sable's Draught (see through rock one screen ahead). Recipes
discovered by experimenting.

**The Museum** — display relics, gems, bestiary trophies in camp. Completed cases
give permanent global bonuses.

**Anomalies** — random while mining: a vein that screams, a cell that refills instead
of depleting, a hostile crystal, a merchant who shouldn't be down here.

**Shell Weather** — each shell cycles conditions on a real clock. Ferrite magnetic
storms double chain bonuses; Verdance bloom seasons; Cinder eruptions.

**Titles & Renown** — ~60 earned titles that are equippable modifiers, not
cosmetics. Ashwalker. The Unbroken. Sable's Heir.

**Camp Building** — surface base you physically lay out: forge, kiln, greenhouse,
workshop, vault. Adjacency bonuses between buildings.

**The Assay Table** — pre-identify what a vein contains before committing time.
Its cost is time and Insight, not wear. Gates behind Insight. (Tool durability was
CUT in Phase 2: wear punishes chipping — against pillar 1 — and punishes being
away — against idle-ability. Tools trade off stats, never break.)

## Currencies (~50, every one has >= 2 sinks, none decorative)
Shell-local (30): Dust, Brick, Ash, Loam, Marl / Ingot, Flux, Scale, Lodestone, Rime
/ Spore, Sap, Chlorophyll, Humus, Resin / Prism, Lumen, Silica, Spectrum, Frost /
Slag, Ember, Obsidian, Pyre, Cinder / Void, Resonance, Null, Hush, Umbra
Craft (7): Motif, Alloy Mark, Thread, Ray, Fuel Rod, Echo Token, Card
Reset (4): Core, Echo, Axiom, Spiral
Meta (9): XP, Skill Point, Relic Dust, Renown, Caravan Scrip, Charter, Mastery
Token, Axiom Fragment, Sigil


## Pacing map (Phase 13 — the honest one)

This map has been re-baselined three times and the previous version still
carried fiction. This is what the build actually does, with every number marked
by how it was obtained. It supersedes every earlier map in this document.

**How to read the marks.** ✓ MEASURED = observed in a sim run or a timed
playthrough of this build. ≈ DERIVED = computed from measured segments that were
never run end to end in one session. ? UNMEASURED = a projection nobody has
verified; treat as a guess.

**The single most important caveat: NOTHING PAST ~48 HOURS HAS EVER BEEN
MEASURED.** Not once, not partially. Every figure below the Recursion line is
arithmetic on shorter runs. The endgame's pacing is, honestly, unknown.

| Time | Beat | Confidence |
|---|---|---|
| ~4 s | First upgrade purchased | ✓ MEASURED |
| ~4 min | Kiln raised; two currencies live | ✓ MEASURED |
| 8-12 min | First Collapse ~depth 40 · the Lamphouse opens | ✓ MEASURED |
| ~25 min | Lattice uncovered; first Chord shortly after | ✓ MEASURED |
| ~50 min | Drill Bay + behaviours | ✓ MEASURED |
| 1.5-3 h | Core tree working, Forge II/III, contracts flowing | ✓ MEASURED |
| 7.6-8.8 h | Loam floor · the Tapmother · FIRST BREACH | ✓ MEASURED (3 runs) |
| +30-45 min | Ferrite d150 · return-to-peak ≤10% (one run at 30%) | ✓ MEASURED |
| 9.5-11 h | Ferrite floor · the Loadstar · BREACH 2 | ✓ MEASURED |
| 12-14 h | Verdance floor 290 · Old Plenty · BREACH 3 (arc ~2.3 h) | ✓ MEASURED |
| ~15 h | Glassmere · BREACH 4 · Cinder entered | ✓ MEASURED |
| 15-30 h | **Cinder — the long one.** Vents, the choke, the Smolder ~29 h | ✓ MEASURED |
| 30-45 h | Hollow — the inversion · the face rebuilt cell by cell | ≈ DERIVED |
| ~42-48 h | Aleph · the Core · the Author · FIRST RECURSION | ≈ DERIVED (segments only) |
| 70-110 h | Recursions 2-4 · Axioms filling · the Spiral opens | ? UNMEASURED |
| 130-180 h | Codex, the 190-cell grid, Museum cases, relic fusion | ? UNMEASURED |

**Where the Verdance systems actually land, and why that is a problem.** The old
map claimed "Verdance systems mature at 12-15 hr" with a footnote admitting they
are "now a post-Breach-3 beat, played from below". The footnote was the real
content and the line was fiction. The truth: the Greenhouse, the Mycelium, the
Loom and the Still open on Verdance depth records, which a player crosses on the
way DOWN to Breach 3 — but they have no reason to go back up and use them until
Cinder demands the materials. So the systems arrive at ~12 h, sit unused for
several hours, and become relevant somewhere in the 15-30 h Cinder stretch,
played retroactively from a shell below the one they belong to.

That is a genuine structural flaw, not a labelling error, and it is NOT fixed in
this build. Fixing it means either moving the unlocks or giving Verdance's craft
outputs a Verdance-era sink, both of which are balance changes to shells I-VII —
out of scope for a hardening phase. Recorded here so the next person does not
rediscover it as a surprise.

**Reset cadence, measured.**
- Collapse: 4-12 min, 30-60 times per shell. ✓
- Breach: 7.6-8.8 h for the first, 25-40 min for later ones. ✓
- Recursion: ~42-48 h to the first. ≈ DERIVED — never run end to end.
- Spiral: requires a Recursion behind it. ? UNMEASURED entirely.

**Total playtime.** The doc has always claimed ~110 hours. Measured content
reaches roughly 45 hours with confidence. Beyond that the number rests on
Recursions 2-4 and a Spiral loop nobody has played to completion, so "110 hours"
should be read as an intention rather than a measurement. An honest statement
of what exists: **~45 hours measured, with an endgame of unverified length after
it.**

**Tab/system count.** 3 at Shell I → 13 by Shell III (✓ measured) → 35 systems
total across five clusters at full endgame (✓ counted, Phase 13). The Craft
cluster carries 10 of them: 3 wrapped rows and 80px of chrome at 380px, with
zero horizontal overflow (✓ measured).

**Shell floors** (unchanged, locked): Loam 150 · Ferrite 250 · Verdance 290 ·
Glassmere 380 · Cinder 470 · Hollow 560 · Aleph 40.

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript, strict |
| Build | Vite |
| UI | React + Tailwind |
| Canvas | PixiJS (face, combat, craft-systems, particles) |
| Numbers | break_infinity.js — Decimal from day one, NOT a retrofit |
| State | Zustand |
| Saves | IndexedDB (localStorage caps ~5MB; save will exceed it) |

## Art direction
Procedural stylized-geometric, generated in Pixi. No asset packs.
Ores = faceted polygons, palette-driven gradients. Cells = beveled hexes/tiles.
Enemies = animated silhouettes. Particles do the heavy lifting.
A material is defined as: palette + facet count + shimmer profile — so 139 materials
scale for free and stay visually coherent.
"Good graphics" here means crisp characterful UI + a face that feels physical +
juice: particles, screen shake, number pops, eased transitions.
Dark, subterranean, warm lamplight against cold stone. Respect prefers-reduced-motion.

## Build phases
0. Engine skeleton (headless, no gameplay)
1. Vertical slice: Shell I face, Dust, upgrades, Kiln, Drill Bay, Collapse, Core
   tree, Delver XP, save/offline
2. The Lattice
3. Ore taxonomy + inventory + the Forge
4. Ferrite + the Breach (proves shell architecture; after this, shells are content)
5. Combat + bestiary + Floor Warden
6. The Guild: NPCs, merchants, contracts, Sable's journals
7+. Shells III-VII, relics, expeditions, camp, museum, Recursion, Spiral

---
