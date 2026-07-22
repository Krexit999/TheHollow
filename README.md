# THE HOLLOW

An incremental mining game. Seven shells, each with different physics; you dig
down through all of them, reach the Core, and start over knowing what's down
there. **The game is complete: Phases 0-20.** Phases 0-10 built it; the Phase-11
legibility pass gave it a rooms-model interface; Phase 12 added THE LONG TAIL;
Phase 13 shipped it; and **Phase 14 added depth to the systems that already
existed plus THE COMPENDIUM — an in-game wiki, so a player never needs a
browser tab open beside the game; Phase 15 built THE CONFLUENCE LAYER, the
things that only happen when two systems are true at once; Phase 16 added
THE SMITHING DEPTH — the Refinery, transmutation, salvage and tempering;
Phase 17 gave MATERIALS SOULS — ten traits per material and tools built from
head/haft/binding parts; Phase 18, THE HAND AND THE COLUMN, made crafting
a PROCESS (four acts, each a different hand-verb, quality earned across stages,
failure that costs material and never the item, every act delegable to a named
NPC) and made THE SHAFT a place — climb back up your own column, and a rail laid
with Cores that outlives the Collapse; Phase 19, THE COLUMN IS A PLACE, put
things IN the column — caches that survive the Collapse, CURING that turns real
time into an ingredient (a stone left at depth becomes something better), lifts
that ride the rail, expeditions that set off from deep, one UNMINEABLE wall per
shell that reads you back and carries Sable's marks, and hand-built EXCAVATIONS
you clear a shift at a time; Phase 20 rebuilt THE SHAFT VIEW from a schematic
into a Pixi pixel-cave that takes over the whole stage — the hand-carved column
seen sideways, a lantern falling off into black, markers you can touch, faster
than the SVG chart it replaced; and Phase 21, THE CONSIDERED HAND, added the
quality-of-life layer with no new systems — UNDO on a spend or craft, a
CONFIRM before a bulk buy drains your bank, a run-summary LOGBOOK at each
Collapse, toggleable number formatting, AUTO-REFINE standing rules and PINNED
materials in the Hold, named BLUEPRINTS with a side-by-side and Marrow's
critique at the Forge, saved Lattice LAYOUTS with a leak-proof GHOST PREVIEW and
lockable chords, AUTO-COLLAPSE and a sim-verified CARRY-ONE at the Collapse, and
BOOKMARKS + private NOTES + a "what changed" marker in the Compendium — all of it
in the save, so an exported run keeps your notes; and Phase 22, THE SHAFT PROPERLY
RENDERED, rebuilt the Shaft from a diagram of a cave into a lit one — near-black
rock, a warm lantern, gold FRACTURE NETWORKS lit from within, a silhouette with
grammar (chambers, pinches, overhangs) that DIVERGES per shell (Hollow a wide
void, Glassmere a faceted crystal, Cinder a jagged molten crack), chunk-baked and
depth-drifting so shallow and deep read as different rock, an engraved gold depth
ruler down the side, ~10ms/frame under heavy load; and THE FACE CLUSTER,
which deepened the three screens you live in with INTERACTION and no new content: on
the FACE, HOLD to chip, a stamina-costed
SWEEP, and FIGURES — shapes you cut into the rock that pay XP + a drop + stamina,
never Dust, found by doing and kept in a Codex the Compendium never lists (pillar 5).
The DRILL BAY gained individuals — named, breakable-and-repairable drills that WEAR
with use and never die, configured by swappable HEADS and material BITS. The KILN
gained FUEL profiles (a trade, not a ladder), an opt-in OVERSTOKE burst, and banked
heat. Under both: one shared AFFINITY mechanism — a tool or drill LEARNS the shell it
works, a small capped edge that reads as history and never touches the ceiling; and
IMPLEMENTS AND INSCRIPTION finished the thread — a carried tool grows OPINIONS out of
that same history (it favours the rock it knows, sulks a breath when you first pick it
up, and a rotated set never earns one, so a favourite feels like a favourite and
switching is never punished), earns HEIRLOOM MARKS for the deeds it was in the hand for,
and holds deeper inscription: PRACTICE on scrap that teaches the shape of a join and
never the answer, more rune-SLOTS on a better tool, three-rune TRIPLES, and
ORDER-OVER-TIME carvings that complete only across whole sessions — plus GEM FUSION,
BULK SALVAGE, and a temper that now resonates with the tool's own shell affinity. The
phase also rebuilt the UNBUILT ledger against the codebase after two rows (gem cutting,
rune casting) were found already-shipped, and added the standing rule that the ledger is
a claim, not evidence.** This repository contains:
the headless engine, the Shell I slice, THE LATTICE, ore + THE FORGE,
**FERRITE + THE BREACH** (the shell architecture proof: signatures, Polarity,
the Alloy Crucible, the Foundry, Shell Mastery), **COMBAT + BESTIARY +
FLOOR WARDENS** (the Deepwrought, telegraph-lane fights, gear, the Tapmother
and the Loadstar), **THE GUILD** (the Lamphouse: 30 named NPCs, Sable's
journals, the contracts board, hirelings, Serra's caravan, titles),
**VERDANCE + BREWING + SHELL WEATHER** (Growth — the shell where not acting
is a strategy — the Greenhouse, the Mycelium, the Loom, the Still, and
weather on every shell), and **GLASSMERE + THE WARRENS + RUNE INSCRIPTION**
(Refraction — the purely spatial signature: route a light beam with mirrors;
the Observatory's star charts, the Refraction Bench where solved puzzles
become equippable Lenses, twenty hand-built Warrens, and a positional rune
grammar), and **CINDER + ANOMALIES** (Pressure — the game's first failure
state, built on four laws: floods cost the run and never permanent progress,
an idle shaft can never flood, the klaxon is always escapable, and the
tension is strictly opt-in via the choke; the Vent Network, Magma Wells with
their odds posted at the mouth, the real-time Ember Array, anomalies across
all five shells, and hireling permadeath — deterministic, named in advance,
always recallable), and finally **THE HOLLOW + ALEPH + RECURSION + AXIOMS**
(the ending: Absence — there is no rock, all income is the five carried
signatures operating on emptiness; the Silence you farm instead of fight;
Reconstruction, rebuilding the face one cell at a time; the Echo Chamber, a
programming language whose only primitive is a recording of your own hands;
the Core; Recursion, which resets the world but not you and hands you Axioms;
and the ~20 Axioms, each of which rewrites a *rule* of the engine rather than
a number, composing through a typed law registry). Read [Design.md](Design.md)
— it is the master spec; the appendix records everything invented during this
build, ending with Sable's ending.

## Running it

```bash
npm install
npm run dev        # vite dev server (localhost:5173) — debug panel in the Vault tab
npm run build      # typecheck + production build to dist/
npm test           # vitest — cost curves, prestige math, offline, save round-trip
npm run sim -- --hours 3 --policy balanced --log 5 --out sim-out/run.csv
```

## Architecture

The one non-negotiable rule (DESIGN pillar 8): **the engine is headless.**
`src/engine/` imports nothing from React, Pixi, or the DOM. The UI is a dumb
renderer over four functions:

```ts
const engine = createEngine();
engine.tick(dtSeconds);        // advance simulation (fixed 100ms steps inside)
engine.getState();             // Readonly<GameState>
engine.dispatch(action);       // the only mutation path -> ActionResult
engine.subscribe(fn);          // change notification
```

```
src/
  engine/
    index.ts          engine facade + re-exports (the only import the UI needs)
    types.ts          GameState, GameAction, events
    decimal.ts        break_infinity Decimal + formatting (every big number is Decimal)
    state.ts          initialState()
    actions.ts        dispatch handlers
    resources.ts      currency REGISTRY — currencies are data, not fields
    upgrades.ts       generic upgrade system: totalCost(n) = base·(r^n−1)/(r−1)
    modifiers.ts      named-multiplier buckets; breakdown() feeds UI tooltips
    events.ts         typed bus for cross-system reactions
    prestigeMath.ts   locked formulas: Cores/Echoes/Axioms/Spiral/xp/descend
    craft.ts          CraftSystem registry — persistent boards (the Lattice, ...)
    materials.ts      ore taxonomy: ~90 mineable + 12 combat-only materials, gems,
                      geodes, purity, drop tables
    combat/           species.ts (30 Deepwrought + 2 Wardens as behavior data),
                      combat.ts (one resolver: closed form for auto/sim + the
                      5-lane turn engine), gear.ts (two-faced gear, 4 slots)
    guild/            npcs.ts (the thirty), guild.ts (rep, stock, ledger, the
                      game clock, questlines), sable.ts (28 authored pages +
                      the cipher), contracts.ts (state-generated jobs),
                      hirelings.ts (the crew; death interface OFF until
                      Cinder), caravan.ts (drifting lossy routes), titles.ts
    systems/growth.ts GROWTH: vines capture overflow regen (pillar-2-proof),
                      spread, drip when feral, survive descend via the
                      cause-aware onFaceReset
    systems/weather.ts game-clock shell weather; every value >= 1; the Guild
                      names the wind (neutral until it opens)
    content/shell3/   greenhouse.ts (12 strains x form/humor grammar -> 78),
                      mycelium.ts (site graph, fed self-spread, survives
                      everything), loomSystem.ts (CraftSystem #3: twist outer
                      product -> tetromino shapes), brews.ts (12 ratio-found
                      spikes)
    systems/refraction.ts  REFRACTION: trace the beam (mirrors turn it, young
                      vines bend it, canopy blocks it, full cells amplify),
                      Wavelength Split at Mastery 25 — one rule per color
    content/shell4/   observatory.ts (game-clock exposures -> Spectrum + eight
                      constellations), bench.ts (CraftSystem #4: 50 authored
                      optics puzzles + constructive generator; solutions are
                      equippable Lenses), warrens.ts (20 hand-built rooms:
                      puzzle + fight + one unique each), runes.ts (8 found
                      runes, 14 ordered pairs, dissonance fouls the
                      inscription, never the item)
    systems/pressure.ts  PRESSURE: heat 0-100, the Damper (idle converges to
                      the hold-line, provably below flooding), THE GOVERNOR
                      (open vents cap heat at holdLine+15 — flooding requires
                      choking them, an explicit act), the Vent Network BFS,
                      OVERPRESSURE with a 2s fuse + 45s countdown + always-
                      available purge, floodRun (a Collapse that pays zero)
    systems/anomalies.ts  rare events on played-time across all five shells;
                      unanswered ones settle harmlessly, always
    content/shell5/   emberArray.ts (CraftSystem #5: real-time furnace grid,
                      fire spreads as fuel dies, best sustained band-time is
                      a permanent record; engaged ≈ 2× passive by arithmetic),
                      wells.ts (commit ≤10%, published odds, EV 1.17, results
                      wait forever)
    laws.ts           THE LAW REGISTRY: ~14 typed law slots the engine consults
                      instead of constants; Axioms register overrides into them.
                      The choke points know slots, not Axioms — no conditional
                      thicket. Numeric slots compose max/mult/add; flags single-own
    systems/absence.ts  ABSENCE: income from nothing (the carried signatures'
                      voidTick sum — the declared interface completion), the
                      Silence (farm entropy), Reconstruction (rebuild the face
                      cell by cell, real ceilings, pillar 2 binds)
    systems/recursionSys.ts  reset layer 3: a controlled rebirth (fresh
                      initialState + survive-ledger), Axioms=floor((ΣEchoes/25)^.8),
                      tools survive as heirlooms (blunted to Shell I, kept whole)
    content/shell6/   chamber.ts (CraftSystem #6, THE ECHO CHAMBER: record your
                      own dispatches, replay through the REAL engine — a program
                      obeys every ceiling a hand does; Resonance upkeep + trace)
    content/shell7/   axioms.ts (the 20 rule-rewrites, each `felt` in 5 minutes;
                      exactly one heresy touches pillar 2, and announces it)
    systems/          face, kiln, drills, depth, collapse, xp, offline,
                      forge (tools/inventory/walls), drops (drop rolls + Assay Table)
    systems/lattice/  hex math + resonance/chord/progression rules (pure)
    content/shell1/   currencies, upgrades, core tree, skills, achievements,
                      latticeChords (the 40 + 8), latticeSystem (CraftSystem impl)
    save/             codec (Decimal-aware), migrations, lz-string export, storage iface
    stubs/            Phase 2+ interfaces: Shell, Breach, CraftSystem, Material, Relic, NPC
  platform/           browser glue: IndexedDB adapter, autosave controller, rAF loop
  ui/                 React + Tailwind panels; ui/face/FaceView.ts is the Pixi renderer
    nav.ts            the IA: 5 clusters + per-system visibility predicates
    systemCopy.ts     UI-side authored Layer-1/2 copy (game voice; keeps engine headless)
    components/SystemHeader.tsx  the 3-layer self-explanation header
scripts/
  sim.ts              headless pacing harness (CSV out; 100 sim-hours in seconds)
  shot.ts             dev screenshot helper (drives headless Chrome via playwright)
  shot-ui.ts          Phase-11 UI verification: 4 states x phone/desktop + Kiln ref
```

### The tick

`tick(dt)` accumulates real time and steps the sim at a fixed 100ms. A tick may
run at most 3000 steps (5 sim-minutes); anything beyond that resolves through
the **offline calculation** — so a throttled background tab catches up in
milliseconds instead of spiraling, and the player gets the same offline
efficiency they'd get for closing the tab. `visibilitychange` handles the
common case explicitly (save on hide, offline-reconcile on return > 60s).

### The modifier pipeline

Every bonus in the game is a **named source registered into a bucket**
(`dustYield`, `regen`, `drillSpeed`, ...). Systems read the bucket product;
the UI calls `breakdown(state, bucket)` to show the player exactly where a
number comes from (hover any dotted-underline stat). Nothing multiplies a
number inline — if it isn't in a bucket, it doesn't exist.

### Saves

- IndexedDB, autosave every 10s + on tab-hide. **Save v18.** Versioned payload,
  migration chain in `save/migrations.ts` (`MIGRATIONS[fromVersion]`, run in
  sequence); recent steps add the long-tail slices (v12), material traits and
  tools-from-parts (v15), the crafting-as-process Workbench (v16), the Shaft
  — go-up-your-column + a Collapse-surviving rail (v17) — and THE COLUMN IS A
  PLACE: caches, curing, lifts, and excavations (v18). A save that fails to load is QUARANTINED to a separate key so the autosave cannot overwrite it.
- Decimals round-trip via a `D#` string tag (the codec reads originals off the
  JSON holder because Decimal has its own `toJSON`).
- Export/import = same payload, lz-string compressed to base64.
- Engine sees only the `StorageAdapter` interface; tests/sim use MemoryStorage.

## The interface

The engine grew for ten phases; the UI was the last thing to catch up (Phase
11 — a pure-presentation pass, no mechanical change). Its rules:

- **Rooms, not a toolbar.** `ui/nav.ts` groups all 35 systems into FIVE fixed
  clusters (THE FACE / THE CRAFT / THE HOLD / THE WORLD / PROGRESS) — a count
  that never overflows, at any state, on any viewport. A cluster owns its
  systems and their visibility predicates (moved out of `App.tsx`). Desktop is
  a section rail + the persistent face-hero + a wide room; phone is the face as
  home + a fixed five-cluster bottom bar + full-screen rooms. The `lg:`
  breakpoint is the only switch.
- **Every system explains itself in three layers — all 30, no exceptions.**
  `SystemHeader` renders Layer 1 (PURPOSE, always visible, authored in
  `ui/systemCopy.ts` in the game's voice — the engine stays headless), Layer 2
  (a NEXT action computed from state) and an optional live `status`; Layer 3 is
  the pre-existing `breakdown()` popover. The four discovery boards (Crucible,
  Loom, Bench, Chamber) deliberately report BOARD STATE only and never hint a
  solution — pillar 5 is discovery over unlocking. `npx tsx
  scripts/copy-coverage.ts` prints the 30-row coverage table and exits
  non-zero on any gap.
- **Controls hold still.** Anything whose label is live data (buy buttons,
  currency chips) uses tabular-nums and a reserved min-width, and blocks never
  mount/unmount on a threshold. A control that resizes itself walks out from
  under the cursor — that, not hover CSS, is what makes a UI feel broken in
  the hand. Touch targets are 44px on coarse pointers, scoped away from the
  dense craft-board grids.
- **The panel reads at a glance.** `UpgradeRow` shows three visual kinds
  (OPENS / BUILD / repeatable), a persistent ×1/×10/MAX bulk control (in
  localStorage), and an effect preview computed by re-running the pure stat
  functions against a level-bumped shallow clone (zero engine change).
- **Nothing sprouts silently.** `DisclosureGate` names newly-opened systems on
  a single card; `seenSystems` lives in the **save (v11)**, not localStorage,
  so a restored export doesn't misfire the gate for all 28 systems at once (an
  established pre-v11 save silently backfills once on first load).
- **Accessibility:** reduced-motion honored, a visible `:focus-visible` ring,
  ARIA roles/labels on nav, tablists, dialogs, and controls.

Verify the interface with `npx tsx scripts/shot-ui.ts <tag>` (dev server
running) — four progression states × phone(380)/desktop, plus the Kiln
reference; it dispatches `markSystemsSeen` to keep the disclosure gate off a
seeded shot.

## How to add things

**A currency** — one call in a content file:

```ts
registerCurrency({ id: 'ash', name: 'Ash', tier: 'shell', color: '#9aa',
  description: '...', resetsOnCollapse: true });
```

Balances, lifetime totals, saves, the header currency bar, and collapse resets
all pick it up from the registry.

**An upgrade** — one `registerUpgrade({...})` with id/currency/baseCost/ratio
(cost classes: spam 1.15 / standard 1.25 / structural 1.75 / tree 1.55),
maxLevel, `resetsOnCollapse`, and either a modifier registration for its effect
or an `onPurchase` hook for structural effects. Add a `<UpgradeRow def={...}>`
to whichever panel it belongs in (the Dig panel picks up face upgrades by id
list).

**A craft-system** (the Lattice is the template — `content/shell1/latticeSystem.ts`):
1. Implement the `CraftSystem` interface from `src/engine/craft.ts`:
   `unlocked / ensureState / tick / offlineTick / passiveRank / codex`.
2. Give it a GameState slice + a currency (`registerCurrency`) + content data.
3. `registerCraftSystem(...)` in `content/index.ts` and bump the save version
   with a migration that adds the default slice. The engine's step loop and
   the offline calc pick it up automatically; effects go through the modifier
   buckets so breakdown tooltips name them.

**A shell** — proven by Ferrite (Phase 4). Adding Verdance is exactly:
1. **A content module**: `registerShell({...})` in `content/shells.ts` — id,
   ordinal, chip/conv currency ids, converter name, floor depth, hardness
   walls, byproducts, `signatureId` — plus `registerCurrency` calls for its
   five currencies. Scaffolding upgrades (Blade, converter, bay, drills)
   re-price themselves via the CHIP/CONV sentinels; the face, depth, collapse,
   drops, and offline systems pick the shell up from `currentShell(state)`.
2. **A signature-mechanic module**: `registerSignature({id, hooks})` with
   `chipMult` / `onFaceTick` / `onFaceReset` (see `systems/polarity.ts`).
   Yield hooks compose multiplicatively; state hooks run carried-oldest-first
   with the current shell's native mechanic LAST (the documented override
   order); own your state in a dedicated GameState slice.
3. **A craft-system registration**: implement `CraftSystem` and
   `registerCraftSystem` (see `content/shell2/crucibleSystem.ts`).
4. **A save migration**: bump `SAVE_VERSION`, add defaults for the new slices.
Then content: 15 materials flip live automatically (they're already declared
with the shell tag), tool recipes extend `TOOL_RECIPES`, achievements extend
the grid, and a face theme entry in `FaceView`'s `FACE_THEMES` plus a sim
policy stanza finish the job. Nothing structural.

## The sim harness

Pacing is checked, not guessed:

```bash
npm run sim -- --hours 3 --policy balanced --log 5 --out sim-out/run.csv
```

Policies: `active` (chips 2/sec forever), `idle` (2 min bootstrap, then hands
off), `balanced` (active 20 min, then idle). The policy shops greedily, descends
with a buffer, collapses when the core yield beats a rising threshold, and
spends core/skill points. Stderr gets an event log (structures built, collapses)
plus a wall-time report; 100 simulated hours run in ~2s idle / ~30s balanced.

The policy also plays the Lattice: it builds discovery "projects" (a clear
line, a context motif, an uniformity-breaking upgrade), recycles old
experiments when cramped, and hoards Brick for rings when space-blocked.

Current pacing (balanced policy): first upgrade ~4s · Kiln ~5min · first
Collapse ~8min at depth 40 · Forge ~11min · Lattice ~23min · Tier II tool at
~44min (hardness wall at depth 45) · Drill Bay ~52min · Tier III at ~2.5h
(wall at 110) · depth ~140 and Delver ~L36 at 3h — against the DESIGN targets
of 20s / 4min / 12min / 25min / 45min / L20.

The combat policy plays at three skill levels (`--combat auto|competent|optimal`)
through the same resolver the game uses: auto lets encounters self-resolve;
competent/optimal drive the real turn engine (dodge singles, brace sweeps,
walk out of charges, flee hopeless spawns at the 5% toll) and always attempt
Wardens on pure auto — the worst case the spec requires to work. The report
line prints interruptions/hr, W/L/flee, species seen, and wardens felled.
`--scenario wardens` seeds a Loam-floor kit to verify the warden→breach→ferrite
arc idle. Measured: interruptions 5.9/hr balanced; auto rewards 50-55% of
competent (unit-asserted); fully-idle 16h runs never block on combat.

The guild policy takes every board job (they're generated to stack with the
dig), forgets stalled ones after 40 min (free, always), hires the crew in
order, pays Quill when flush, wears the best chip title, and rides favorable
caravan drift. The report line prints contracts/hr, Renown, Scrip by source,
crew, pages, titles, and the **pillar-2 audit**: sustained idle chip income
vs the W·H·regen·Y ceiling over untouched windows (storage drains after a
collapse legitimately spike; sustained windows must hold ≤100%).

**A material** — one `M(...)` line in `src/engine/materials.ts` (palette +
facets + shimmer make its icon for free). **A tool** — one entry in
`TOOL_RECIPES` in `src/engine/systems/forge.ts`; tiers above the current
shell's ceiling automatically render as the locked preview. **A species** —
one `S({...})` line in `src/engine/combat/species.ts` (behavior flags +
patterns + depth window + drops; the silhouette archetype draws it). **Gear**
— one entry in `GEAR_DEFS` in `src/engine/combat/gear.ts` (a mining face in a
modifier bucket + a combat face; both scale with purity). **An NPC** — one
`N({...})` in `src/engine/guild/npcs.ts` (portrait grammar draws the face).
**A journal page** — one `F(...)` in `src/engine/guild/sable.ts`; later
shells only author text, the surfacing/cipher/translation mechanism is done.
**A title** — one `T(...)` in `src/engine/guild/titles.ts`.

## Testing

`npm test` covers: the locked cost formula incl. bulk-buy edge cases and the
r=1 degenerate case; every prestige formula against DESIGN anchor points;
face cap/regen/yield opening math (2.88/s ceiling, 50-dust first upgrade in ~7
chips); kiln conservation and fuel curve; drill regen-bounding (pillar 2);
collapse resets + Momentum/Ember Memory retention; XP/skill points; offline
efficiency clamp, uncapped duration, and the tick-overflow path; save
round-trip with >1e15 Decimals, export/import, and the migration chain.

## THE COMPENDIUM

The in-game wiki (`src/ui/compendium/`, opened by the ❦ glyph in the header on
every viewport, plus a desktop button). **353 entries, and only 39 are written
by hand** — systems, materials, currencies and species are GENERATED FROM THE
REGISTRIES, so the wiki cannot drift from the game:

| Kind | Count | Generated from |
|---|---|---|
| Systems | 35 | `ui/nav.ts` + `systemCopy.ts` + `SYSTEM_ESSAYS` |
| Materials | 139 | `engine/materials.ts` |
| Currencies | 39 | `engine/resources.ts` |
| The Deepwrought | 97 | `combat/species.ts`, gated on having met one |
| Concepts | 39 | hand-authored in `ui/compendium/pages.ts` |
| Confluences | 16 | `engine/systems/confluence.ts`, each gated on having found it |

**It explains mechanics and never solutions** (pillar 5). It will tell you a
Chord is three motifs of the same shape in a line; it will not list the forty
Chords, the alloy ratios, the weave shapes, the rune orderings, the brews, or
the Bench answers. `scripts/compendium-coverage.ts` enforces this mechanically —
it fails on a missing entry, an orphan, an empty body, **or a discovery answer
leaking into the text** — and is the reason to add a page for anything new:

```
npx tsx scripts/compendium-coverage.ts   # 353 entries, exits non-zero on a gap
npx tsx scripts/shot-compendium.ts       # renders + searches it in a real browser
```

Adding a material or currency needs no wiki work; adding a *concept* does.
Search is deliberately forgiving — "Weepstone", "Breach" and "why is my income
capped" all land somewhere sensible.

## Confluences

Some things only happen when two systems are true at once — a rune cut into an
alloy, the Lattice in particular weather, a relic hoard all pulled from the same
Warren. `src/engine/systems/confluence.ts` holds all 16 as data: a condition
over two systems plus what it pays.

Three rules keep the layer safe, and each is enforced by a test:

- **A bonus for having both, never a requirement to have both.** Nothing is
  gated behind a confluence. A test walks the engine source asserting nothing
  reads `confluences.found` to *permit* anything.
- **Discovered, not announced.** Found ones appear in *Your own margins* in the
  Journal. The Compendium explains the mechanic and never lists the pairs.
- **It pays only while it holds.** The note stays; the bonus stops.

```
npx tsx scripts/confluence-verify.ts   # reachability + the safety properties
```

Adding one is a single entry in `CONFLUENCES` — the modifier registration,
Codex surfacing and Compendium page all follow from the data.

## The modifier pipeline is typed end to end

Bucket names are a closed union (`Bucket`, 17 members). **Author bucket fields
as `Bucket`, never as `string`** — `dropChance` and `cellCap` were bucket names
that did not exist, and they registered into nothing and paid nothing for a
whole phase because the content types were `string` and cast at the call site.

- `registerModifier` — typed. A wrong name is a compile error.
- `registerModifierChecked` — for a genuinely dynamic name; **throws** rather
  than registering into nothing.
- `assertModifierIntegrity()` — runs at content load; fails the boot if
  anything registered into a bucket no system reads.
- `foldBonus(bucket, n)` — knows which buckets sum and which multiply, so
  `1 + bonus` on an additive bucket cannot be written by hand again.

## The smithing chain

Everything between a material in the Hold and a tool in your hand.
`src/engine/systems/refinery.ts`, `salvage.ts` and `tempering.ts`, surfaced as
one room (`ui/components/refinery.tsx`).

**Before building here, run the audit:**

```
npx tsx scripts/material-audit.ts   # how many materials nothing consumes
```

It found **49 of 132 materials with zero consumers** — no recipe, catalyst,
brew, contract or case wanted them. That number is the reason transmutation
exists, and there is a test asserting **every chain consumes at least one
material that had no consumer**, so a new chain cannot be authored out of two
materials that were already busy. The test rebuilds the consumed-set without
`chains.ts`, so the chains cannot vouch for themselves.

The three verbs are deliberately distinct, and adding a fourth should respect it:

| System | Verb | Shape |
|---|---|---|
| Runes | positional grammar | sequence and adjacency — order IS meaning |
| Alloys | accumulation | slot three in, get three effects |
| **Tempers** | **condition** | pays when your situation matches, idles otherwise |
| Transmutation | set | two inputs, order-independent — NOT the rune wall |

**WORKED materials** (`worked: true`) are made, never found. `rollDrop` filters
them out and `materialsOfShell` excludes them — without that they appear as ore
in the Crucible's catalyst list, in merchant stock, and in the Compendium's
shell filter.

## Materials with souls

Every material carries **2-3 of ten traits** (`src/engine/traits.ts`) — Keen,
Tough, Dense, Light, Springy, Brittle, Charged, Warm, Hollow, Trueseated. Traits
are the one place pillar 5 does not apply: they are visible everywhere. What they
do IN COMBINATION (ten trait pairs) is discovered and guarded from the Compendium
by name and by sentence.

**Tools are built from parts.** A tool is a HEAD, a HAFT and a BINDING
(`src/engine/systems/toolParts.ts`), each a material reading different traits:

| Part | Reads | Makes |
|---|---|---|
| Head | edge, force | chip and strike — and gates the tier |
| Haft | heft, cadence | strike and chip |
| Binding | grip, hold | sockets and rune-hold |

The tool's archetype emerges from the composition — variants are not authored,
so the ladder cannot go lopsided. Two verification scripts guard it:

```
npx tsx scripts/parts-verify.ts   # balance across shells I-XV, head-tier gate
npx tsx scripts/shell1-test.ts    # the acceptance test, in a real browser
```

**The head gates the tier** (the curriculum law): its material decides the
hardest wall the tool can break. Haft and binding are free. Adding a material
needs no forge work — it is immediately a valid part; adding a *trait* to the
vocabulary is the deliberate act.
