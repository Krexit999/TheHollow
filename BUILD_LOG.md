# THE HOLLOW — BUILD LOG (Appendix A. Never read whole; jump to the appendix you need)

# APPENDIX A — Phase 0/1 build record (everything invented, per the Freedom clause)

Everything below was open under the Freedom clause and is now canon unless a
later phase deliberately revises it. Locked formulas were implemented exactly;
deviations and interpretations are called out explicitly.

## A.1 Spec interpretations & flags (not silent deviations)

1. **Core node max cost.** The doc quotes "10 levels = 296 Cores"; the locked
   formula `2·(1.55^10−1)/0.55` gives **287.4**. The formula wins; 296 was a
   rounding artifact.
2. **"2.88 dust/sec idle" at open** is the field's regen ceiling, not literal
   income. Until the Drill Bay exists nothing auto-harvests: idle play fills
   storage (288 at full) that the player smashes on return. True hands-off
   income begins with drills — which matches "active play matters most when
   the player has least." Verified by the sim: a pure-idle run stalls exactly
   as designed until drills come online.
3. **Collapse resets "face upgrades, shell currencies, depth" — read
   literally.** The Kiln stays built (it re-lights cold) and the Drill Bay
   keeps its drills and their levels. At 30–60 collapses per shell, re-buying
   24 individually-leveled drills each cycle would be misery and would fight
   pillar 6. Structures are marked `resetsOnCollapse: false` in data, so this
   is reversible if wrong.
4. **Phase-1 pacing hole (RESOLVED in Phase 2):** the Lattice now fills the
   25-minute beat, and the Drill Bay is gated behind depth record 55 ("the
   rails need deeper anchoring"), which balanced play crosses at ~35–45min.
   The gate is progression-anchored, not clock-anchored — optimal players
   reach it sooner.
5. **Descending does NOT refill the face.** A refill would be income outside
   the regen ceiling (violates pillar 2), even though it would feel great.
6. **Cells start full on a fresh save** — required for the 4-second first
   upgrade (7 chips × 8 dust ≥ 50), and it opens the game on the best verb.

## A.2 Shell I numbers (invented, sim-tuned)

**Upgrades** (`cost class` → base, ratio, max):

| id | Name | Class | Cost | Effect |
|---|---|---|---|---|
| blade | Whetted Blades | spam | 50 Dust ×1.15, L120 | the Blade stat in Y |
| soil | Rich Soil | spam | 80 Dust ×1.15, L120 | the Soil stat in regen |
| roots | Deep Roots | standard | 300 Dust ×1.25, L40 | the Roots stat in cap |
| lantern | Warmer Lantern | standard | 150 Dust ×1.25, L30 | +8% XP/level |
| expand | Widen the Face | structural | 12 Brick ×1.75, L10 | +1 column, then +1 row (6x6→11x11); new cells spawn full |
| kilnBuild | Raise the Kiln | one-off | 500 Dust | builds the Kiln, starts feeding |
| bellows | Twin Bellows | standard | 4 Brick ×1.25, L40 | +20% kiln intake/level |
| firebrick | Firebrick Lining | standard | 6 Brick ×1.25, L30 | +10% brick output/level |
| bayBuild | Assemble the Drill Bay | one-off | 12 Brick | builds the bay + first drill |
| drillCount | Drill Chassis | standard | 6 Brick ×1.25, L23 | +1 drill (24 cap incl. the free one) |

Per-drill upgrade: 5 Brick ×1.25, L25 (each drill individually).

**The Kiln** (fuel curve): consumes up to `2 dust/s × kilnRate bucket`. Heat
0→1 with ~25s time constant while fed (Stoker skill speeds it), decays ~40s
when starved. Firing efficiency `0.25 + 0.75·heat` — a cold kiln wastes most
of its feed, so keeping it lit matters. **25 effective dust = 1 Brick.** At 2/s
base the kiln takes ~70% of opening idle income or ~12% of active income:
feeding it is a real decision, not a tax.

**Drills:** strike every `2.0s / (1 + 0.04·level) / drillSpeed`, take
`(2 + 0.75·level) × drillPower` charge (bounded by the cell — regen stays the
hard ceiling). Behaviors: fullest-cell / sweep / random / adjacency-chain
(chain re-anchors on the fullest cell when its neighborhood runs dry).

**Depth Pressure** (new): +2% dust yield per depth, as a named modifier. This
is what makes each descent immediately worth its rising cost and lets a run
snowball toward Collapse.

**Delver XP grants** (all scale with production so XP tracks progression):
manual chip `0.7·(1+0.08·depth)·(charge/8)` · drill strike
`0.12·(1+0.08·depth)·(take/8)` · brick fired `1` · upgrade bought `2/level` ·
descend `1.5·depth` · collapse `15·cores`. Balanced-play sim lands ~L25 at 3h
against the map's L20.

## A.3 Core tree — first 6 of the eventual 28 nodes

All: base 2, r=1.55, 10 levels (locked). Chosen to change the next run's
shape, not just its speed.

| Node | Effect per level |
|---|---|
| **Persistence** | +3% offline efficiency (the stat the locked offline formula names) |
| **Grit** | +10% dust from every chip |
| **Momentum** | keep up to 4 levels of each face upgrade through Collapse |
| **Fault Lines** | manual chips: +4% chance to fracture, chipping all adjacent cells for half their charge |
| **Ember Memory** | Kiln keeps 10% heat through Collapse; +12% throughput |
| **Overseer** | drills strike +12% faster |

## A.4 Skill tree — 6 real nodes, 18 sealed stubs

Extraction: **Sharpened Edge** (+5% dust/rank, 5) · **Heavy Hands** (+10%
crit chance/rank for 3x chips, 3). Industry: **Stoker** (+15% heat ramp, +5%
intake/rank, 5) · **Drill Logic** (+8% drill speed/rank, 5). Insight:
**Scholar** (+10% XP/rank, 5) · **Cartographer** (−4% descend cost/rank, 5).
Sealed stub names are placed so each branch's flavor reads on screen (Splinter
Sense, Vein Memory, The Long Pick / Surplus Doctrine, Closed Loop, The Great
Engine / Marginalia, Pattern Ghost, The Core's Grammar, ...).

## A.5 Achievement grid

25 wide × 10 tall. Rows are themes: Dust / Kiln / Depth / Collapse / Delver /
Drills / The Face / Rituals / Patronage / Tonnage. 24 real achievements ship
in Phase 1, each with a real modifier bonus (+1–5% themed). **Column 1 is
fully populated** so the first column bonus (+10% Dust, "The First of
Everything") is earnable inside Shell I. Row bonuses (+25% themed) exist but
no row is completable until later shells fill columns 4–25 — the emptiness is
deliberate.

## A.6 Offline model

`efficiency = 0.55 + 0.03·Persistence` (cap 0.95; the achievement "The Dig
Went On" adds +1%). Closed-form, uncapped duration: (1) cells fill from regen
at full rate — the rock is physical storage, efficiency applies to harvest,
not geology; (2) drill income = `min(bay throughput, W·H·regen) · Y ·
efficiency · seconds` — zero without drills, pillar 2 intact; (3) the Kiln
eats from bank + income at `rate · efficiency` converting at 85% (it banks
down and re-stokes untended), and is warm (80% heat) when you return; (4)
drill XP at the same per-charge rate; (5) depth never advances. Live tab
catch-up beyond 5 sim-minutes in one tick routes through the same math, so
throttled tabs and closed tabs are treated identically.

## A.7 Visual language (Shell I)

Warm lamplight against cold stone, literally: drained cells are cold
blue-grey slate with hairline edge-in cracks; charge is warm light held inside
the rock (layered radial glow), with per-cell seeded tone jitter and angular
strata facets so no two cells are twins. Chips throw faceted shards, light
number pops, and a screen shake scaled by yield (crits hit harder). Drills are
hex-chassis bots with behavior-coded glyph + color (◆ amber rich / ➤ teal
sweep / ∴ violet roam / ∞ rose seam) that visibly chase their targets with a
strike beam. The Kiln panel shows a stone arch whose fire breathes with heat.
Deliberate actions (Descend, Collapse, hard reset) are hold-to-confirm with a
fill bar. New tabs pulse amber when a system first unlocks.
`prefers-reduced-motion` disables shake, particles, flicker, and shortens
holds.

## A.8 Currency flavor

Dust — "Pulverized loam. The first thing the dark gives up." · Brick — "Dust,
fired until it remembers being stone." · Cores — "What survives a collapse.
Cold, dense, patient." · Motifs — "Shapes the Lattice will accept. It is
particular."

## A.9 THE LATTICE (Phase 2 build record)

**Unlock:** the first Collapse breaks through into it ("Clear the Rubble",
25 Brick, visible after Collapse #1; grants 6 Motifs). Lands ~18–25min.

**Board:** axial hex grid, rings 1→4 (7/19/37/61 sockets). Ring price is
structural: 25 Brick × 1.75^(ring−1) → 25 / 43.75 / 76.6. Ring 4 additionally
requires the Keystone chord. The board, Motif balance, discoveries, and doors
persist through Collapse (and will persist through Breach — craft tier).

**Motif economy:** placement costs rank² Motifs (1/4/9/16/25); removal
refunds 60%; in-place rank-up costs the rank² difference ×1.25 (second sink).
Ranks 1–2 free; 3/4/5 gated by Finer Chisels (30 Brick ×1.75). Accrual:
0.75/min passive + 1 Motif per 350 charge chipped (any source), both through
the `motifGain` bucket. The Press (door): converts Brick → Motifs at 0.1
Brick/s, 2 Motifs per Brick, toggleable.

**Resonance (the observable rule set):**
1. HARMONY — same shape adjacent: both gain min(rankA, rankB).
2. FLOW — the shape wheel circle→square→triangle→hex→circle; a motif adjacent
   to its successor feeds it rank/2 (one-way, shown with a chevron).
3. DISCORD — wheel opposites (circle↔triangle, square↔hex): −1 each.
A cell's glow is its score; the board bonus = +0.5% Dust per point of summed
positive resonance, capped +100%.

**The 40 chords are combinatorial:** shape (4) × line context (5) × rank
uniformity (2). Context, judged on motifs adjacent to the line (priority
order): isolated / opposed / flowing / supported / attended. A maximal
same-shape run of ≥3 is ONE chord using the whole run — a 4th motif extends
and strengthens (sumRanks grows), it does not duplicate. Magnitude =
per-rank% × summed ranks, live only while the geometry holds. Shape families:
circle=face/waters, square=industry, triangle=extraction, hex=seals/meta.
Uniform variants are the stronger siblings. Full name/effect table lives in
`src/engine/content/shell1/latticeChords.ts`.

**The three doors (permanent once discovered, even if the chord breaks):**
- **The Keystone** (hex · isolated · uniform) — opens the fourth ring.
- **The Grammar** (circle · flowing · mixed) — reveals the Progression
  system; until then placement order isn't even shown.
- **The Press** (square · supported · mixed) — unlocks the Brick→Motif
  converter.

**Progressions (8):** each motif stores its placement index; a chord's order
stamp is its last-placed motif's index. Active chords sorted by stamp are
matched against ordered patterns as a subsequence. The Long Descent
(tri,tri,tri → ×1.75 Dust) · Round of Coals (sq,sq → ×2 Brick) · The Turning
Wheel (ci,sq,tri,hex → ×1.5 Dust & XP) · Root Before Crown (ci,hex → ×1.6
regen) · March of Courses (2 uniform sq → ×1.75 kiln) · The Quiet Scale
(hex,hex → +5% offline) · Vein Song (flowing tri, ci → ×1.75 drill power) ·
Sable's Cadence (any five → ×2 Motifs, ×1.3 Dust).

**Passive Rank:** +1 per 12 min (online or offline×eff), cap 30. Grants
+2.5% Dust and +1% XP per rank — the ~50% floor for a player who never opens
the tab. Engaged boards (resonance + chords + progressions) run ~2–4× that.

**Discovery aids:** near-chord lines (2-in-line + empty completing cell)
shimmer faintly on the board. Insight skills: Marginalia (3 ranks — Sable's
notes name an undiscovered chord's shape, then rank-uniformity, then
context), Pattern Ghost (2 ranks — stronger shimmer, then the missing shape
ghosted into its socket). The Codex lists discovered entries only, ever.

**Visual language:** carved and quiet, nothing like the face — verdigris,
jade, and bone on dark basalt. Recessed hex sockets with engraved inner
lines; motifs are weighted solids (disc/slab/wedge/seal) with rank notches;
harmony/flow/discord are colored connection lines (jade/teal/dull ember);
an active chord is a slow-breathing pale-gold beam that reads across the
board; discovery bursts light along the line and writes the Codex entry in.

**Pacing measured after Phase 2 (balanced policy, optimal-ish play):** first
upgrade ~4s · Kiln 5m12 · Collapse #1 8m02 (target 12m — left untuned per
instruction; re-measured, unchanged, the Lattice now absorbs the 17–26min
window) · Lattice uncovered 17m46 · first chord within ~6s of uncovering ·
2nd ring 21m34 · 17 chords + 3 progressions and all three doors by ~23m
(the scripted hunter is faster than a curious human; the ~12-chord target
remains the human expectation) · Drill Bay 38m24 (target 45m) · 12 collapses,
depth 132, Delver L30 at 3h. 100 sim-hours run in ~22s wall.

## A.10 Phase 2 engineering notes

- `CraftSystem` (src/engine/craft.ts) is now a real registered interface:
  unlocked / ensureState / tick / offlineTick / passiveRank / codex. The
  engine's step loop and the offline calculation iterate all registered
  systems; the Alloy Crucible slots in without engine changes.
- Save version 2; the v1→v2 migration adds a buried default Lattice.
- Pixi v8 note: renderers must not be destroyed while others render (shared
  batcher pools poison). Panels therefore hide rather than unmount, and
  StrictMode is off in main.tsx.

## A.11 ORE TAXONOMY + INVENTORY + THE FORGE (Phase 3 build record)

**Materials are possessions, not shell currency: they survive Collapse.** So
do gems, geodes, and tools. This is canon.

**The taxonomy:** 139 materials declared (`src/engine/materials.ts`), 15 live
in Loam — Marl, Ochre, Bonechalk, Graveclay / Loamiron, Rootglass, Duskflint /
Umberjade, Hollowamber, Wormsteel / Palegold, Chthonite / Starmarl,
Sablequartz / Weepstone — the other 117 tagged to their own shells. A
material is data: palette (3 gradient stops) + facet count + shimmer profile
(none / soft / crystalline / aberrant); the icon is generated SVG, rarity
read from frame treatment (plain → bronze ring → silver glow → gold glow →
star badge → hue-shifting aberrance). Gems are a different silhouette
language entirely: cut stones with a bright table.

**Purity:** every drop rolls 0-100. Normal distributions, tight low / wide
high: common μ45 σ7 · rich μ50 σ10 · pure μ55 σ14 · flawless μ58 σ20 ·
starred μ62 σ24 · aberrant uniform. A bad Flawless roll stings by design.
Purity propagates: tool stats scale ×(0.75 + purity/200).

**Drops (pillar-2-safe by construction):** chance per chip =
`1.2% × (charge/8) × (1 + 0.4%·depth) × dropRate bucket` (×2 while an assay
vein is marked); drills roll the same at 40% weight. Chance rides charge,
charge rides regen — drops can never become a second income rate. Rarity
gates by depth: rich 10+ / pure 40+ / flawless 70+ / starred 110+ / aberrant
150+. Geodes are 2% of drops; direct gems 0.4% at depth 60+ (Shell I drops
Bloodgarnet and Hearthstone; the other four gems wait for their shells).
Geodes crack (deliberate hold) into 2-4 rolls at +40 effective depth with an
8%-per-roll gem chance.

**Inventory:** stacks by material × five purity bands (Poor 0-39 / Fair
40-59 / Good 60-79 / Fine 80-94 / Exalted 95-100), each stack keeping a
running purity average — crafting consumes best bands first and inherits the
weighted average. Banding trades per-unit identity for a legible screen; the
average preserves what crafting actually uses.

**The Forge** (structure, 15 Brick, appears at the first drop): tools are one
item, two stat blocks. Chip power = a named dustYield modifier while
equipped; strike power is computed, stored, displayed, and DORMANT until
Phase 5 (labeled so). Tier bases: I ×1.0/3 · II ×1.35/5 · III ×1.8/8, with
per-recipe chip/strike spreads so every tier ≥ II offers a real choice
(Deepcutter vs Wardenbreaker at III). Sockets by tier: 0/1/2. Recipes name
tools — Marlsplitter, Gravewedge / Loamiron Pick, Duskcleaver, Rootglass
Rake / Deepcutter, Wardenbreaker — and tiers IV-XV are declared with
cross-shell inputs (Lodestone Rake, Rimefang, Sporecaller, Verdant Scythe,
Prismpick, Lightwright's Edge, Slagbreaker, Cinder Maul, Pyreheart Pick,
Nullpick, Hushhammer, Aleph Edge), shown locked with the reason: "needs
FERRITE — a shell you have not reached." Tools never wear out. Everyone
carries the free Tier I Delver's Pick; it cannot be scrapped.

**Hardness walls:** depth 45 needs Tier II, 110 needs Tier III. The wall is
announced in the depth bar 8 depths early, and descending past one without
the tier is blocked outright — a legible gate, never a chip-less trap.
(Walls sit above the first-collapse depth of 40 so run #1 is untouched.)

**The Assay Table** (Insight: Assayer's Hunch, 3 ranks): a 20s survey of the
current depth — no cost but time — revealing its rarity profile (naming only
materials the player has SEEN) and marking the vein: drop chance ×2 for the
next 80 chips (160 at rank 3). Rank 2/3 cut survey time 25%/50%.

**Lattice ↔ materials:** three chord effects now speak to the material game —
Quarry Chorus (+1.0% drop rate /rank) · Counsel of Six (+0.9% drop rate
/rank) · Old Seal (+1.0% assay speed /rank). Flavor updated in place.

**New Insight/Extraction skills:** Splinter Sense (+8% drop rate /rank, 3) ·
Assayer's Hunch (above). Achievements: column 3 completable; rows gained
Read the Rock, Brimming, Something in the Dust, Without Flaw, The Long
Watch, Smith of One, What's Inside, Set in Stone, Third Tier.

**Pacing measured (balanced policy):** Forge 10m54 · Tier II forged 44m at
depth 44 (wall at 45) · Drill Bay 51m38 · Tier III forged 152m at depth 109
(wall at 110) · ~1270 drops, 18 geodes, ~5 gems, 12 collapses, depth 140,
L36 at 3h. Save version is now 3 (the v2→v3 migration adds the materials,
forge, and assay slices). 100 sim-hours still run in ~30s wall.

## A.12 FERRITE + THE BREACH (Phase 4 build record)

**Carry-forwards applied (Step Zero):** (1) The Navel — the Lattice's centre
socket is fused shut; with it sealed no three ring-1 sockets are collinear,
so the opening board cannot form a chord (ring 1 teaches resonance; lines
arrive with ring 2). (2) Motif economy: 0.25/min passive, 1 Motif per 1,200
charge, uncover grant 4, placement costs rank²+1, and door chords DISCOVER
at any rank but OPEN only at combined rank 9+ (three rank-3 stones — needs
Finer Chisels). (3) SEEPAGE — cells at cap leak 10% of further regen as chip
currency: the pillar-1 idle floor, thin and never absent, still under the
ceiling. (4) The 8-minute first Collapse stands untouched.

**The Shell abstraction** (src/engine/shells.ts): a shell is data — chip
currency, converter identity, hardness walls, floor depth, signature id,
drill/deep byproducts. Face, converter, drills, depth, and collapse are
universal scaffolding; upgrade costs written as CHIP/CONV resolve per shell
(Blade costs Dust in Loam, Ingot in Ferrite). Depth and its records are
per-shell; the descend curve restarts each shell in its chip currency.
Loam: floor 150, walls 45/II · 110/III. Ferrite: floor 250, walls 40/IV ·
100/V · 170/VI; the Bloomery converts Ingot→Flux; drills scrape Scale
(0.03/charge); chips below depth 200 carry Rime (0.02/charge).

**Signature registry** (src/engine/signatures.ts), designed for five:
`chipMult` hooks compose multiplicatively (commutative — cannot contradict);
state-mutating hooks run carried-oldest-first, NATIVE LAST (the documented
override order); each mechanic owns a disjoint state slice. Carried strength
0.4, +15% per Resonant Memory level (Echo sink #2). Loam has no signature —
the first Breach carries nothing; Polarity is Ferrite-native and will carry
from the SECOND breach.

**POLARITY:** every cell + or − (etched cross / bar — readable without
color). The Nth consecutive like-signed MANUAL chip pays base^(N−1), base =
1 + 0.35·strength·chainPower-bucket (native 1.35), cap 12; a 6-chain pays
~1.9× two 3-chains. Breaking pays ×0.5 and restarts on the breaking chip;
4 idle seconds drop the chain; chipped cells re-roll their sign. Drills
neither extend nor break chains (automation must not trash the route).
Chains ≥5 shed Lodestone (scaled by strength — carried polarity keeps old
currencies alive in later shells). **The Magnet Array** (Ferrite Mastery 4):
column magnets (40 Scale ×1.75 each, left to right) bias every re-roll in
their column 85% toward the chosen pole; poles toggle + / − / off by tapping
the magnet above the face.

**THE BREACH:** at the shell floor. Echoes = ⌊3·(cores this breach/500)^0.6⌋
(~800 Shell-I cores → 3). Resets Cores, the Core tree, all scaffold upgrades,
converter, bay, drills, and shell-local currencies of every shell tier.
Survives: depth records, Lattice + Codex, Delver, achievements, materials,
tools, gems, the Forge, Finer Chisels. The transition is a staged sequence
(quake → fracture → the fall → SHELL II · FERRITE), reduced-motion safe.

**Shell Mastery:** ⌊depth record / 10⌋ per shell, cap 50, never resets.
Ferrite gates: Crucible at 2, Magnet Array at 4, alloy slots at 6.

**ALLOY CRUCIBLE** (CraftSystem #2 — the Phase 2 interface, zero changes):
pour the five metals in ratios (POUR_UNIT 20 currency per point, max 6) over
ONE Ferrite-ore catalyst whose purity seeds the alloy (the Phase 3 rule; the
metals are currencies and carry none). 60 recipes as primitive ratios in
`content/shell2/alloys.ts` — steels/brazes/laminates/magnetics/cryosteels
plus 16 strong triples (Sable's Steel is 2:1:1:1:1, straight from her
journals). A miss returns 50% of the metals, keeps the catalyst, and writes
a margin hint pointing at the nearest undiscovered blend's largest
difference. Duplicates fuse upward (rank 1-5, ×1.25 effect each). Discovered
alloys are PATTERNS bound into tier IV+ tool alloy slots (IV/V: 1, VI: 2) —
this IS the tool-affix system. Passive rank: +1/20min, cap 20, +0.8% chip
yield each.

**THE FOUNDRY** (minimal, architecture proof): 3 slots → 12, next slot costs
1, 2, 3... Echoes. Eight modules with tag conflicts (Ballast Furnace vs Dream
Boiler share a flue; Cold Rails vs Chain Capstan share a rail-bed).
Uninstalling is free but the fitting cost is gone.

**Tool ladder reshuffle:** VI is now Stormcaller (Ferrite+Loam:
stormcore/voltglass/sablequartz); Sporecaller (Verdance) was deleted;
tier IV/V flawless loads lightened (Lodestone Rake: 10/2/1; Rimefang
starmarl ×1) so walls gate on effort, not lottery.

**Pacing measured (balanced policy, 16h):** BREACH at 5.5h with 3 Echoes
(map: ~5h ✓) · Crucible + Foundry live ~5.6h (map said 9h — both gate on the
Breach, which arrived on time; the map's 9h was written when Breach was
assumed later; flagged, not tuned) · tier IV 7min after breach at ferrite 39
· V at ferrite 99 · VI at ferrite 169 · ferrite floor 250 by 16h · best
chain 12 · 11 magnets · 18 chords, 4 progressions, all three doors across
the run. **PILLAR 6: return-to-peak = 6.8% (target ≤25%)** — Ferrite reaches
depth 150 in 22 min against Loam's 5.5 h first climb. Balance flags: Delver
XP runs hot (L138 at 16h; cap 200 will bite in Shell III — revisit then);
Shell-I core total lands ~500-600 vs the doc's ~800 (the sim breaches at
500; humans linger — acceptable band).

## A.13 COMBAT + BESTIARY + FLOOR WARDENS (Phase 5 build record)

**Step Zero (corrections to this doc):** (1) SEEPAGE is promoted from
scaffold behavior to **Loam's native signature** (`signatureId: 'seepage'`,
registered like Polarity). The first Breach now demonstrates carry-down
instead of describing it: Seepage follows you into Ferrite at 0.4× (× Resonant
Memory), leaking Ingot off capped cells. (2) **Delver XP rescaled**:
`XP_SCALE = 0.35` multiplies every grant. Measured L76 at 20h balanced
(was L138 at 16h); the L200 cap now projects to land near end-of-content
(~110h) instead of a third of the way in. Accepted un-tuned: return-to-peak
6.8% (re-measure at Breaches 2-3), Crucible/Foundry at 5.6h, core totals
500-600.

**The combat model — one resolver, two frontends** (`src/engine/combat/`):
combat resolves from stats mining already built, nothing else. Effective
strike = tool strikePower × the `strikePower` modifier bucket, which is fed
by: Two-Handed Swing skill (+10%/rank ×5), Deep Grip (+6 HP/rank ×3), gem
combat faces (Bloodgarnet ×1.15 strike, Hearthstone +8 HP...), triangle stat
chords (half their edge % — geometry reaches into the dark), achievement
columns 6-7 (+15% strike, +15% XP), and gear. Player HP = 24 + 6·tool tier +
gear + gems + Deep Grip. NO combat levels, NO combat currency.

- *The closed form* (`resolveFight`): deterministic given stats +
  `SkillParams {timingMult, dodgeRate, flankRate}`. AUTO .95/.65/.2,
  COMPETENT 1.1/.8/.5, OPTIMAL 1.32/.95/.9. Behavior flags bend it
  (shieldedFront halves unflanked strike; phaseSkin reads timing;
  regenerators punish hesitation; poles read your last chain sign...).
  Auto also forfeits the par bonus (`AUTO_REWARD_PENALTY 0.75`). Unit-tested:
  auto rewards land at **50-55% of competent-manual** across the roster
  (asserted band 45-60%), and auto LOSES over-tier — the honest signal to
  gear up. Auto-resolve is a Vault toggle; unanswered encounters resolve
  through the same math after 30s. Pillar 1 holds.
- *The turn engine* (`combatTurn`): five lanes, telegraphs
  single/sweep/cross/allbut/charge (charge winds up one free beat and hits
  double). Singles are dodged; sweeps/crosses/all-buts are GUARDED (or
  outrun over two beats) — pattern, not reflex. Timing bar sweeps a full
  beat (2.2s): 0.6 / 1.0 / 1.5×; flanking lanes ×1.25; polarity signs carry
  in (match its pole ×1.5, oppose ×0.75); phase 2 at 2/3 hp, phase 3 at 1/3
  (+18% power each, enrage +40%). Reduced motion: no sweep, strikes land at
  1.0 — timing is set aside entirely, never punished.

**The Deepwrought — 30 species, behavior-distinct** (15/shell; every one a
different answer, asserted by test): Loam runs Marlgrub → Marlwidow through
swarms (guard is weak), mirrors (feint the last beat), shielded fronts
(flank), phase skins (swing on ITS beat), regenerators (kill briskly),
thieves (they skim the bank), burrowers (flanks deny). Ferrite adds poles:
fixed-pole species reward routing your chain sign before engaging;
`poleFlips` species (Polarwisp, Compasswight, Polar Reaver) walk their pole
every 3 beats. Encounters roll off harvested charge (cooldown 360s, never
during a fight, never above depth 5; drills spawn at ×0.25; Seepage rolls
at ×0.5 — idle meets the bestiary too). Species haunt depth windows;
weights shift with depth.

**Materials that cannot be mined** (12, `source: 'combat'`): chitinshard,
gravemote, wormsilk, burrowertooth, marrowglass, taproot / scalebackplate,
ironsinew, voltgland, magnetheart, nullquill, loadstarcore. They feed the
Forge's second bench and future Crucible/Brewing lines.

**GEAR — every piece has two faces** (8 pieces, 4 slots): Marlshield
(+4% dust · +12 HP, guard .35), Gravelight (+8% drops · reads the next
telegraph), Rootweave (+2% offline · +8 HP regen 1), Delver's Treads (15%
faster chip hand · sure feet) — then Lodeward Buckler, Stormglass Lantern,
Ironweave, Polar Soles at tier V. Forged from combat drops + mined ore;
purity scales both faces. Mining faces are ordinary modifier-bucket sources.

**FLOOR WARDENS — the one mandatory fight**, and it still bows to pillar 1:
`canBreach` now ALSO requires the shell's Warden felled, and the Warden card
offers "Send the crew" (pure auto) beside "Face it yourself". **The
Tapmother** (Loam, 260hp): regenerator + shielded front + a 5-beat guard
cycle that punishes greed — strikes into her guard feed her; patience is the
lesson. Auto-beatable with loam gear + tier III (unit-tested; scenario sim
fells her in one attempt). **The Loadstar** (Ferrite, 1800hp): pole walks
every 3 beats, cross/allbut/charge — the fight IS the routing problem.
Auto-beatable with tier VI + ferrite gear (unit-tested); under-geared auto
bounces off. Losing anywhere: 10% of the CHIP bank (flee: 5%), time, never
progress. Warden materials (Taproot, Loadstar Core) are guaranteed drops.

**Bestiary**: a discovery record — only species you have met, silhouettes
drawn procedurally from six archetype grammars (grub/swarm/stalker/
sentinel/flyer/coil), flavor on sight, the behavior NOTE earned at 3 kills,
drops shown once you've culled one. Wins/losses/perfect-strikes ledger.

**Achievements**: columns 6-7 filled with combat + late-arc rows (It Bit
First, Cull, Field Notes, On the Beat, Warden of Loam/Ferrite, full kit...)
— completable, granting the +15% strike / +15% XP column bonuses.

**Save v5** migrates combat state + gear slots into old saves.

**Pacing measured:** 20h balanced/competent — interruptions **5.9/hr**
(target 4-6): engaged fights 38W-14L, 67 slip-aways from over-tier spawns
(the sizing-up is real); Tapmother + BREACH at 7.6h; tiers IV/V/VI at
ferrite 39/99/169; ferrite depth 233; L76; pillar-6 return-to-peak 6.9%.
Fresh 16h FULLY IDLE (auto-resolve, no taps): Seepage's drop/encounter
rolls carry it — tier III forged idle, depth 133, 2.3 encounters/hr all
auto-handled, zero deadlocks. Warden scenario (idle from the Loam floor
with gear): Tapmother felled at once, Breach immediate, ferrite 151 by 16h
idle with losses correctly rising as spawns out-tier the kit. Flags:
active:idle stays ~5:1, so one fresh save cannot idle to BOTH floors inside
16h — pillar 1 is verified as "idle never blocks, wardens fall to pure
auto with period-appropriate gear"; Breach drifted 5.5h → 7.6h under
combat interruptions + the XP rescale (slower skill points) — flagged, not
tuned.

## A.14 THE GUILD (Phase 6 build record)

**Step Zero — the spawn mix reads your kit.** Two mechanisms: `tierAffinity`
weights the encounter roll toward the player's tool tier (over-tier ×0.3 at
+1, ×0.05 at +2; under-tier fades without vanishing), and species windows
gained SOFT TAILS — minDepth stays hard, but past maxDepth a species lingers
at exp(−Δ/40) weight (the shallows' creatures follow the warm shafts down;
page 33 agrees). Without the tails the deep pools go homogeneous-top-tier
and no weighting can fix the mix. Measured: engageable-at-COMPETENT spawns
59-61% (target 60-70, run σ ≈ ±5); distribution pinned by test at a fixed
point (tier-4 kit, Ferrite 200: tier-6 ≈ 19% of spawns, ≤ tier-5 ≈ 81%).
Slip-aways fell from 67-vs-38 to ~24-51 per 20h against 43-49 engaged wins.

**THE LAMPHOUSE** opens at the FIRST COLLAPSE (~8-12 min — the fall shakes
the old stair loose) and deepens on existing beats: 12 souls at opening, +6
when the Forge is built (the stalls), +6 at the first tier-III tool (the
crews — hirelings unlock), +6 after the Breach (the Ferrite folk, the
Caravan). 30 named NPCs in `guild/npcs.ts`, portraits procedural-geometric
(hue/hat/eyes/extra grammar), each with a job touching a live system —
Fenn reads geodes, Brakka tends drills, Moth knows the Lattice, Ashka buys
what bit you, Ilma cuts gems, Sal keeps the book of names, Neev turned back
at the Breach and complicates Sable.

**The game clock.** Schedules, moods, stock windows (6h), and caravan drift
run on `guild.clockMs` = played + away time, advanced by the tick and the
offline calculation — never the wall clock (unit-tested: no guild read
calls Date.now). Anti-patterns held structurally: schedules move people
around the hall and recolor dialogue ("in the back — Cully minds the
stall"), never availability; stock rotation is convenience (per-window
quantities, materials/gems/geodes/currency packs — NOTHING unique ever
rotates); no contract carries a deadline field at the type level; "Forget
it" is free and applies even to accepted jobs (the board rotates when the
player chooses); caravan holdings never decay.

**Reputation** per NPC: Stranger/Known/Trusted/Sworn at 0/30/100/250; tier
crossings pay Renown (5/15/40). Renown is STANDING — earned, never spent
(flagged reading). Scrip is the working money (contracts, stalls, fees,
hires). Charter is the rare structural spend: 5 exist in the two-shell arc
(Marrow/Vess/Quill/Serra/Neev capstones), sunk into crew berths (max +3)
and board pegs (max +2) at Nan Verge's desk.

**Vess's ledger**: trust (+1/fair deal, −0.25%/point off her prices, cap
8%) and grudge (+1/failed lowball, +0.5 even when it lands; +1%/point on
her prices, cap +25%, NEVER decays). Haggling is a stance per purchase —
fair / press (65% for ×0.9) / lowball (35% for ×0.72). Her dialogue reads
the ledger back to you.

**Marrow** raises the quality pressure: his questline runs entirely on
purity (80+ tool, tier IV at 75+) and ends in the Marrowplate pattern —
guild-locked gear, clean inputs only. **Old Quill** is the gate on Sable:
ciphered pages render in his survey glyphs (deterministic substitution,
shape preserved) until his fee is paid (20 + 2·page Scrip, −15%/rep tier).

**SABLE — 28 pages authored** (13 Loam, 15 Ferrite), her numbering with
gaps showing, surfaced by the drop path while mining (never a modal; pity
ramps as a band empties so nothing is missable). Loam: method, delight,
first wrongness — the rock regrows, seepage breathes, drops are STOCKED,
walls are graded like a curriculum, the Tapmother prunes; she passes the
warden by offering nothing. Ferrite: the compasses are loyal, polarity is
syntax, and on page 26 — clear, uncomfortably legible — she falsifies the
Guild survey and splits her crew; Neev carried the lie up. The cipher
begins at p.29. By p.41 she has TUNED the Loadstar rather than felled it
("It isn't a wall. It's a valve"), and p.44 ends mid-word: the shells are
layers of a thing still being made, and the Core is its author. Later
shells add rows to FRAGMENTS; the mechanism is finished.

**Contracts** generate against the live state only: deliver counts sit
under the hawker's keep-line; cull targets come from the actual spawn roll
at the player's depth AND tier; depth pushes are record+10..25; forge/pour/
chain/geode/assay read the systems. Issuers must be in the hall. Pays
Scrip + Renown + rep. 3 pegs, +2 by Charter.

**Hirelings** (10 of the 30) — the pillar-2-proof idle payoff: nobody
mines. Sef hawks an 8-item basket of surplus commons every 3 min for Scrip
(a PARALLEL economy — zero chip income), online and offline; Tally files
surveys; Fenn cracks a geode a minute; Pell adds offline efficiency inside
the 0.95 cap; Grist/Brakka/Moth/Hob are single-digit % on regen-bounded
systems; Ruta stands in the lanes (+HP/regen); Jib cuts caravan fees. No
wages — recurring costs punish being away. They level by working (cap 10).
DEATH: `status: well|hurt|fallen` + `HIRELING_DEATH_ENABLED = false` +
`harmHireling()` — the interface exists, Cinder flips the switch, and
until then bruises fade on the next tick.

**THE CARAVAN — a flagged pivot.** The Breach RESETS shell-local
currencies, so the literal "trade Dust for Ingot" is structurally empty —
you never hold both. Serra's road instead trades the LIVE shell's
chip↔conv pair (CHIP/CONV sentinels, like every scaffold cost) at
totals-ratio fair rates, plus Ferrite byproduct crates (Scale/Lodestone/
Rime → Scrip, fixed crate sizes so holdings can't become a fountain).
Drift ∈ [0.85, 1.2] on a ~7h clock breath, paired legs get the inverse,
fee 12% both ways (−Jib, −Serra rep) → every round trip provably lossy
(unit-tested at 8 phases). Conversions move wealth WITHOUT counting as
earned (achievements can't be traded into).

**Titles**: 62 in Sal's book, every one a modifier, one worn. Ashwalker
(25 collapses), The Unbroken (a warden on the first attempt —
`wardenAttempts` ledger added), Sable's Heir (all 28 pages legible, +10%
XP), Keeper of the Ratio, The Drummer, Roadwise... Buckets span
dust/xp/drops/strike/chain/motif/regen/drill/kiln/brick/offline/descend/
scrip — choosing a name is choosing a build.

**Integration**: `scripGain` bucket added; achievement columns 8-9 filled
and completable (+15% Scrip / +15% drops column bonuses) plus extras
seeding column 10; save v6 migration (sleeping guild + wardenAttempts);
guild events → toasts; offline summary shows the hawker's night. Two
guild-locked gear patterns (Marrowplate, Wyrmlight).

**Sim measured (20h balanced/competent):** Guild opens 8.0m; contracts
80 done at 4.0/hr for 4.6K Scrip vs ~1.2K hawker (the board out-earns
convenience); Renown 424; crew 6/6; all 28 pages found & translated; 41
titles earned; 27 road trades; 19 quest steps; rerolls 42 (stall-watch,
free). Breach 7.5-8h band unchanged; pillar-6 return-to-peak 8-9%. IDLE
16h: guild opens 71.8m on the first idle collapse, 23 contracts complete
UNTOUCHED, 13 pages surface, 2 hirelings hired by the policy, and
**PILLAR 2: sustained idle chip income ≤ 100% of the W·H·regen·Y ceiling
in every untouched window** (max window 115% — collapse-adjacent STORAGE
drains: a fresh field spawns full and drills drain the bank; sustained
windows hold under).

**ACCEPTED BEHAVIOR (Phase 7 ruling — do not "fix"):** windows adjacent to
a Collapse may read up to ~115% of the instantaneous ceiling because a
fresh field SPAWNS FULL (a deliberate reward) and drills then drain that
stored charge. Pillar 2 bounds sustained PRODUCTION, not the draining of
storage the ceiling already paid for. Any future phase that "fixes" this
number is breaking a reward, not closing an exploit.

## A.15 VERDANCE + BREWING + SHELL WEATHER (Phase 7 build record)

**Step Zero resolved:** (1) Run-level engageable% proved chaotic (spawn
timing dominates); the honest instrument is a FIXED-POINT AUDIT: at every
gear-appropriate ladder state (T2/d60 … T9/d300 with the period kit) the
offer is majority-engageable — measured 100/100/100/100/100/86% and pinned
by unit test — and the 40h full run now samples **66-71%, in band**. Dips
below the band only occur while out-digging your gear, which is the honest
"gear up" signal, softened 4-7× by affinity. (2) The 115% ruling above.
(3) Six more questlines authored (Fenn, Tally, Grist, Magda, Ilma, Sal) —
14 of 30 now, accruing.

**GROWTH — the signature.** A cell held at cap for 25s sprouts; vines age
sprout→creeper→bloom→feral on a 30/60/90s clock (sized to FIT BETWEEN
COLLAPSES — a crop the reset button always kills is not a strategy).
**PILLAR 2, stated for the record: vines never add generation. A vined
cell's overflow regen — which Seepage would leak — is CAPTURED at 0.8×
(× strength) into fruit, and the stage bonus tops at ×1.2, so max recovery
is 96% of overflow the ceiling already produced. Vines move charge and
change how it is collected; the ceiling never moves.** Harvesting returns
the fruit as a chip MULTIPLIER, so crits, Grit, chords — the player's
build — pay the farmer exactly as they pay the clearer. Feral vines DRIP
once heavy (the idle farmer's floor; attentive farmers harvest first and
keep the crit). Feral vines colonize near-full neighbors; drills SKIP
vined cells (automation must not trash a cultivation — the chain law).
Blooms shed Chlorophyll and SEED (the Greenhouse's only gate). Carried
down at 0.4×: slower, thinner, and the interplay with carried Polarity is
EMERGENT — unharvested cells never re-roll their sign, so vines freeze the
routing map while bare rock churns under you.

**INTERFACE CHANGE, declared (the Crucible rule):** `onFaceReset` gained a
`cause: 'descend'|'collapse'|'breach'|'expand'` parameter. Growth SURVIVES
descend and expansion — the green rides down with you; the core loop must
not destroy the strategy — and dies on collapse/breach. Mechanics ignoring
the cause behave exactly as before.

**Convergence, measured and ruled:** at equal robot-attention extremes
(active 2 chips/sec for 6h), cultivate lands at ~64% of the clearer's raw
chip TOTALS but 97% of depth, ~equal collapses, and it won on cores in one
run — the exponential cost curve compresses income into progression, which
is where "end up within ~20%" is MET (depth 232 vs 237; L68 vs 74). The
raw-currency gap is what a tireless 2/s robot buys with ~6× the clicks; no
human is that robot. Under the humane balanced policy the ranking INVERTS:
letting the board green over between check-ins out-earned pre-vine play by
~30% — cultivation is the best low-attention strategy in the game, which
is pillar 1 wearing flowers. Flagged as the honest reading rather than
tuned into a lie.

**Shell def:** Verdance, floor 350, walls VII/45 · VIII/120 · IX/210. The
RENDERY presses Spore→Sap. Chlorophyll from bloom harvests, Humus from
drills (0.03/charge), Resin below 250 (0.02/charge). Tier VIII/IX recipes
re-homed to Verdance loads (Bloomsteel Mattock, Wildstar Falx — Prismpick
and Lightwright return as Glassmere content in Phase 8, same rule as the
A.12 reshuffle).

**THE GREENHOUSE:** 12 base strains on a legible 4-FORM × 3-HUMOR grammar
(moss/vine/fern/cap × bright/iron/chill); adjacent flowering beds breed
the pair ONCE — hybrid takes the slower parent's form, humors blend, name
derives (Dawnfrost Fern, Coldiron Cap...). 12 + 66 pairwise = 78 codex
entries ("~80" — exhaustive beats padded), discovery-only. Harvest yields
by humor (bright→Spore, iron→Sap, chill→Chlorophyll); MATURE HYBRIDS left
standing work as cultivars (small humor-typed modifiers, cap 3).

**THE MYCELIUM:** 3 lanes × 14 depth-rows of sites; inoculate with Humus
(cost ×1.3 each), five node cultures (Marrowcap/Dewthread/Lanterngill/
Burrowlace/Sporefather — small typed bonuses); connected clusters amplify
every node ×(1+0.15(n−1), cap ×3). FED mycelium wanders on its own — one
site per cluster per 20 clock-minutes, 15 Humus from the reserve,
catch-up-looped so a night away spreads a night's worth. Survives
Collapse AND Breach.

**THE LOOM (CraftSystem #3 — interface untouched, verified):** 8 threads =
4 fibers × 2 twists. A knot forms where twists OPPOSE, so the lit grid is
the outer product of the player's twist choices — reasoned, never
memorized. Tetromino shapes among the knots (chirality preserved: S≠Z,
L≠J) grant bucket effects per instance, scaled by dominant fiber
(root/silk/iron/ghost = 1/1.15/1.3/1.5, warp counts double); discovered on
first emergence. Threads spin from combat fiber-drops + Sap; committing
consumes stock; 'Thread' is the registered craft currency. Passive rank
+1/25min cap 20.

**BREWING:** 12 brews on ratio-discovery with Crucible-style margin hints;
misses refund half. Longlight (regen ×2, 90s), Ironblood (strike ×1.5 +20hp,
120s), Sable's Draught (drops ×1.5 + seer, 90s — her own margin recipe),
Quickroot, Moth's-Wake, Hawk's-Blood, Emberdraught, Greenmantle (hastens
vines), Stormtongue, Forgefire, Warden's Milk, Goldrender. **Spikes, not
sustains, by ECONOMY:** no stacking, 60-180s durations, doses paced by the
Resin trickle — measured uptime 5.6% in the scenario runs. No cooldown
timers; if uptime creeps in later phases, tighten cost, not lockouts.

**SHELL WEATHER** (retrofit to Loam + Ferrite; Cinder registered, stubbed):
~50-minute segments on the GAME clock. Loam: Stillness / Damp Bloom
(+25% drops) / Warm Seams (+20% regen) / Singing Grit (+20% XP). Ferrite:
Calm Field / MAGNETIC STORM (chain bonuses ×2, per the doc) / Aurora on
the Rails (+25% drill) / Null Lull (+50% assay). Verdance: Green Overcast /
Bloom Season (vines age ×2, +15% drops) / Spore Wind (greenhouse ×1.5) /
Amber Heat (+15% regen). Anti-patterns are STRUCTURAL: every value ≥ 1
(unit-tested), neutral is the floor, nothing exists only under a weather,
and no guild read touches the wall clock. One invented rule: **weather
does not exist until the Guild opens — the Lamphouse folk are the ones who
name the wind** (keeps the opening hour calm and every baseline clean).

**Deepwrought:** 15 Verdance species (tiers 7-9, distinct tuples) — vine-
eaters, feral-nesters (`feralAffinity`: spawn weight rises with your feral
count — the wilder your face, the bolder the reavers), phase-skinned
wireworms and palemoths whose drops (Throatroot, Mothspool, Wireweed,
Palefiber, Mawpith) ARE the Loom's fibers. **OLD PLENTY**, the Floor
Warden (coil, 3800hp, `abundance` — one new resolver term + one turn-engine
mechanic): fruit lanes set the table every 4 beats; striking while standing
in plenty HEALS it; waiting rots the offering. Patience under abundance —
the shell's thesis in one fight. Auto-beatable with the period kit
(Wildstar Falx + the new VERDANCE GEAR: Plentyshell, Canopyweave, Verdant
Loop — the tier-8 defensive wall the audit exposed as missing); a tier-6
kit bounces off. Stats calibrated to TRACK TIER_BASE strike growth
(t8 ≈ t7×1.5, t9 ≈ t7×2.1) — the first draft scaled by fantasy and failed
the audit twice; the audit is the law now.

**Pacing measured:** verdance-scenario (breach-2 start): tier VIII at
71m, IX at 317m, depth 240 by 8h; brews discovered organically; 27
mycelium nodes; greenhouse breeding live. **BREACH 2 sits beyond a 40h
balanced sim** — ferrite record 249 of 250 at hour 40; the whole arc runs
~2× the pacing map's clock (flagged and accepted piecewise since the
Phase-5 XP rescale; the map's 14h-Verdance beat is now ~a-weekend beat).
Return-to-peak 1 re-measured 7.5%; return-to-peak 2, scenario-measured
(fresh Verdance entry → d150 ≈ 3.3h vs a ≥30h Ferrite arc) ≤ ~10%.
**Per the Phase-7 instruction, the ceiling TIGHTENS: return-to-peak ≤ 15%
is the standard from Breach 3 onward** (measured values have never
exceeded 10%; the old ≤25% no longer constrains anything).

**Save v7** migrates growth/greenhouse/mycelium/brewing/loom/weatherSeg
and the in-fight fruitLanes field.

## A.16 THE MACRO-TUNING PASS (Breach cadence restored)

**Diagnosis (instrumented, ranked):**
1. *The sim's floor-push latch disabled Collapse forever* once 500 cores
   banked: hours 9-40 showed cores frozen at 17.9, zero collapses, zero
   node buys — the whole collapse→cores→nodes ladder off while one descend
   cost 9,380 seconds of ceiling income.
2. *The permanent ladder saturated mid-Ferrite*: Blade capped at 120
   (hour 8), the six Phase-1 core nodes offer ~×2, and the ceiling then
   grew +4% over 32 hours against a span costing ×5,529 per 100 depths.
   The doc's own Shell-IV budget line assumes Blade 200 and core-tree ×500.
3. *The uniform 1.09 curve outruns one shell's machinery*: a shell accrues
   ~×10³ of multipliers; Loam's 150-depth span (×4×10⁵ with cycling) fits,
   Ferrite's 250-depth span (×2.3×10⁹) cannot.
4. Warden-weapon recipes gated on STARRED-rarity drops (Sablequartz ×2)
   stalled a 60h run for 50 hours on pure lottery.
XP rescale and hardness walls: measured non-factors.

**Changes (cause-first, no new faucets):**
- Sim latch fixed: push the floor only while the frontier is within ~2
  minutes of ceiling income; otherwise keep cycling.
- CORE TREE TRANCHE 2 — "the Echo-scarred ring," 8 nodes, opens after the
  first Breach (Loam's locked beats untouched): Grit of the Second Shell
  (chip ×1.12/lv ×15), Ballast (descend ×0.97/lv ×12), Wellspring (regen
  ×1.06/lv ×12), Resonant Core (+10% Cores/Collapse /lv ×12), Millstone,
  Keen Eye, Farsight, Second Wind. Same locked node-cost curve.
- Blade maxLevel 120 → 200 (the doc's own budget; the 1.15 curve self-paces).
- THE DEEP TAPER — the descend curve amendment, made openly:
  `dustCost(d) = 25 · 1.09^min(d,150) · 1.035^min(d−150,150)⁺ · 1.02^(d−300)⁺`.
  The 1.09 spine is bit-identical through depth 150 (every early beat, the
  8-minute Collapse, the whole Loam arc unchanged); the deep compounds at
  1.035, the abyss past 300 at 1.02.
- Verdance floor 350 → 290; shell spans are sized to per-shell machinery
  (future floors: Glassmere ~380, then ~+90 per shell).
- Warden weapons never require starred-lottery inputs (Stormcaller now
  stormcore/voltglass/polarite; Falx needs one Wildstar).

**Verified (60h balanced/competent):** first upgrade ~4s ✓ · new system
every 10-15 min for 3h ✓ (Guild 8m, Lattice 25m, Hold/Forge/board on
schedule) · Breach 1 at 7.6h ✓ · BREACH 2 at 9.7h — the Ferrite arc took
2.1h ✓ (band 1-3h) · return-to-peak 5.5-9.4% ✓ in band · Verdance floor +
Old Plenty felled inside 60h — positioned for Breach 3 ✓.

**KNOWN RESIDUAL, reported not absorbed:** the Verdance arc runs 15-25h
with high run variance. Diagnosed direction: Growth×automation — drills
lawfully refuse vined cells, so idle-phase income sags in the green shell
specifically. Needs a dedicated look (a cultivation-designation the drills
respect, or drip retuning); parked rather than knob-twisted at the end of
a macro pass. The "return-to-peak 2" metric also needs redefinition now
that the Ferrite arc is ~1-2h (its denominator collapsed; the ≤15%
standard applies to the SPINE return, which measures 5-10% ✓).

## A.17 GLASSMERE + THE WARRENS + RUNE INSCRIPTION (Phase 8 build record)

**Step Zero, reported before building:** the macro pass held with Glassmere
content live. Phase-8 60h run: Breach 1 at 8.2h (band 5-8h ✓), Breach 2 at
10.2h (+2.0h, band 1-3h ✓), Breach 3 at 20.5h (+10.3h — the Verdance arc,
the A.16 known residual, unchanged by this phase and still parked, not
absorbed). Glassmere d150 at 22.1h; the floor (380) reached inside 60h.
Questlines: 6 more written (Nock, Ruta, Sef, Hob, Pell, Brine) — Guild at
20 of 30.

**REFRACTION** — the first purely spatial signature. A beam enters the face
from the left at a chosen row and walks its path without you; mirrors '/'
and '\' turn it; every crossed cell harvests ×(1+0.6·strength), cells
holding ≥90% charge are full lenses that amplify everything downstream
(+0.5·strength). Composition with three carried signatures is one rule
each, resolved by HIERARCHY not effects: young vines (stage 1-2) BEND the
beam down, bloom+ vines BLOCK it; Polarity signs render above beam tint,
untouched; Seepage unchanged. WAVELENGTH SPLIT at Mastery 25: the one beam
becomes six colors in 3-cell bands, one printable rule per color (Red +50%
on charged · Amber echoes 25% as CONV · Green ages vines ×1.5 · Cyan +chain
grace · Violet +30% drop roll). Carried down at the standard 0.4 it is the
same routing, dimmer (rendered at 0.45 alpha). Mirrors survive descend and
expand, are swept by collapse/breach (the A.15 `onFaceReset` cause
parameter, reused — no new interface).

**THE OBSERVATORY** (Mastery 2) — four exposures on the game clock (10m /
1h / 4h / 12h) returning Spectrum + star-chart pieces. Charts are a
collection WITH STRUCTURE: 32 pieces assemble eight constellations (Pick,
Lamp, Wheel, Moth, Stair, Vein, Warden, Door), each a permanent named
bonus. Piece rolls bias 70% toward missing pieces — collections complete,
never taunt. Nothing expires, nothing is missable, no o'clock matters.
Verified: with Observatory + drills, the 16h idle window returns without
breaching pillar 2 (max window 104%, inside the accepted 115%).

**THE REFRACTION BENCH** (Mastery 4, craft system #4) — 7×7 optics puzzles;
fire a beam through your mirror layout to cross every target. FIFTY
authored puzzles (ten named, hand-annotated lessons; forty curated in
rising difficulty, the last ten color-matched for Split) plus an endless
constructive generator (walk a beam with k turns, pick targets ON the
path — solvable by construction, quality-gated by simulation). Every first
solve grinds an equippable LENS — the solution is a possession. Registers
through the unchanged CraftSystem interface; currency Ray; passive rank
like the Crucible's.

**THE WARRENS** — sixteen hand-built side-tunnels, four per shell,
retrofit to Loam/Ferrite/Verdance (the Quiet Ossuary, Halden's Root-Cellar,
Sable's Cache, the Null Chapel, Old Plenty's Orchard, the Eye of the
Mere...). Each: a described layout, one puzzle (echo / weights / gates), one
real fight through the combat engine, a guaranteed unique that drops ONCE
(rune, gem, or gear), repeatable materials. Entrances are depth-record
gated, never missable; entering pauses the descent; leaving is free — a
detour, not a cost. Primary source of runes.

**RUNE INSCRIPTION** — eight found runes, three slots per gear surface,
fourteen ORDERED pairs (Kel→Thur is the Weighted Edge; Thur→Kel is the
Sharpened Load) discovered only by etching them; nine dissonant pairs.
THE SOFTENED RULING, as instructed at kickoff: dissonance ruins the
inscription — runes lost, surface fouled until a 30-Silica re-prep — but
the item is NEVER destroyed. Stakes without the trap. Main-body text
amended to match.

**Combat:** 15 Glassmere species, tiers 10-12, thesis SIGHT — punish
acting without looking. New species flag `veiled` (declared): telegraphs
render hidden unless equipped gear has `reveal`; veiled foes take a 0.45×
dodge-window penalty on blind strikes. Floor Warden: THE UNBLINKING
(glasswarden, d380) — veiled + mirror; the fight is unwinnable-in-practice
blind and clean with the Unblinking Monocle (the Eye of the Mere's unique)
or Farsight gear. Forge X-XII rehomed to Glassmere materials — Prismpick
and Lightwright return to the shell that names them; the Cinder ladder
rides one shell deeper. Warren-unique gear (Gardener's Knot, Sable's
Satchel, Orchardkeeper's Hood, Unblinking Monocle) gates on the warren
clear, not recipes.

**Art:** frozen light — palette `#232833/#a8c8e8/#eef8ff` on near-black;
the beam is the only saturated line on the face and is drawn as ONE
polyline per wavelength color with a soft glow underlay, mirror glyphs as
diagonal strokes in sockets, amplifier sparkles at full lenses. Legibility
by hierarchy: charge-glow beneath, beam above, sign glyphs on top, one
rule per vine stage. Weather: Still Air (neutral) / Split Light /
Hoarfrost / Long Exposure — floor stays neutral, variance stays upside.

**Numbers:** currencies Prism/Lumen/Silica/Spectrum(non-collapse)/Frost +
craft Ray · converter the Lenswork X-XII · walls 50/160/270 (tiers
10-12) · floor 380 · achievements columns 12-13 · save v8 (migration
fills five new state blocks) · 178 tests green · sim `glassmerePlay`
policy exposes always, solves the Bench, clears Warrens, etches runes.
Phase-8 run: 8/8 constellations by 60h, 50 lenses, 13/16 warrens cleared,
pillar-6 at 7.5%, first-3h cadence and ≤6-min upgrade rules re-verified.

## A.18 CINDER + ANOMALIES (Phase 9 build record)

**Step Zero, part 1 — the Verdance residual: diagnosed, and the parked
hypothesis was WRONG.** Instrumented 60h runs (hourly realized-income vs
ceiling, vined share, drip ledger) showed income at 500-830% of the ceiling
straight through every stall — the drip was never the problem and Growth
was not touched. The dominant cause was RECIPE MATERIAL GATING: the tier-7
Verdant Scythe (wall at d45) demanded Ironheartwood, whose rarity band
opens at d70 — unfarmable from where the wall stops you (measured: 5.75h
stalled at d44); and the tier-10 Prismpick demanded Springvein, a VERDANCE
material that never drops in Glassmere at all — one run softlocked 40
HOURS at d49 on a bank shortfall the stair cannot fix (descent is one-way).
Six recipes carried the defect (T4, T5, T7, T10, T11, T12).

**THE CURRICULUM LAW (amendment, stated in forge.ts and here):** every
input of a wall-tier tool is mineable in the wall's own shell at or before
the wall itself. No recipe may ask for a material from a shell the stair
no longer reaches, or from a rarity band that only opens past the wall the
tool exists to break. All fifteen recipes now audited against it
(scripts/audit-recipes.ts).

**Verified after the fix (60h balanced, two runs):** Breach 1 at 8.7-8.8h;
Breach 2 +0.9-2.3h; **Breach 3 +1.4-2.3h — the Verdance arc is inside the
1-3h band** (was +10.3h). No dwell was trimmed: the stall WAS the residual.
Full Phase-9 ladder: BREACH 4 at 14.9h (+2.5h, in band), Cinder d150 at
15.2h, all five wardens felled by 29.2h, return-to-peak 7.7%.

**Step Zero, part 2 — gear-axis headroom (audited in code):** alloys are
at authored saturation (60/60; depth remains in rank-fusing x2 and
catalysts — Phase 10 should not count on new recipes). Runes: 33 of 56
orderings still silent — the widest room. Gems: three shells' worth
authored but not yet live. Lenses: generator-unbounded, single equip slot.
Part 3: five questlines written (Dovekin, Ossian, Jib, Cully, Rane) —
Guild at 25 of 30.

**PRESSURE — the failure state, built on four laws that are unit tests:**
1. *A flood costs the run, never permanent progress.* floodRun() is a
   Collapse that pays zero Cores and does not advance the collapse count;
   records, materials, tools, boards, rep all survive (tested field by
   field).
2. *An idle player can never flood.* The Damper converges an untended
   shaft to the hold-line from either side, with idle sources clamped
   under vent capacity in the same code branch — 16h idle sim: heat flat
   at the line, floods 0, overpressures 0.
3. *A flood is always foreseeable.* One number, a face that glows with it,
   a 45-second named countdown with a 2-second fuse (grazing 100 while
   riding the band must not cry wolf, or the klaxon stops meaning), and an
   emergency purge that always works (-60 heat for a quarter of held
   Slag).
4. *The tension is voluntary — THE GOVERNOR.* With the vents open, heat
   physically cannot pass holdLine+15 (never above 90): ordinary mining,
   however furious, never floods. Only CHOKING THE VENTS (one labeled
   switch) or Array overdrive defeats the relief valve; releasing them
   mid-klaxon sheds 3 heat/s — always an escape. The choke releases
   itself after 45s without a manual chip: the crew will not tend a fire
   you abandoned. Flooding therefore requires two explicit acts plus
   ignoring a 45-second alarm. (This law was ADDED when the first sim
   pass showed a "safe" active player flooding 174 times — the charter
   said opt-in; the first model wasn't; the governor makes it literal.)

**Yield:** x(1 + (heat/100)^3 * 1.9) — convex on purpose; the last ten
degrees hold most of the money. Measured (6h active, scenario kit): safe
stance 8.6T slag, greedy stance 20.5T — **2.4x, in the charter's "roughly
2x" band** — both with zero floods. Carried down (Hollow/Aleph): heat
accrues and pays at 0.4 strength, hard-capped at 90 — matters, cannot
flood.

**THE VENT NETWORK** — a 7x5 Obsidian pipe grid; BFS from the shaft mouth,
five outlets, 8% capacity falloff per path cell. Capacity raises the vent
rate AND the Damper hold-line (idle yield) AND the governor ceiling
(active-safe yield): headroom is one purchase serving all three lines.
Pulling pipe is free — re-routing is the tuning loop.

**MAGMA WELLS** (Mastery 6) — commit at most 10% of holdings (hard cap),
three ropes at once, 20/75/240-minute waits on the game clock, results
wait forever. THE ODDS ARE THE INTERFACE, posted verbatim: 80% x0, 15% x3,
4% x8, 1% x40 (EV 1.17, honestly positive for the variance, never an
engine — the greedy sim's well net was under 1% of its income). One
uniform draw; the result screen names the line hit and nothing else.

**THE EMBER ARRAY** (Mastery 3, craft system #5, no interface change) —
real-time 6x6 furnace: fuel burns and ignites neighbors as it dies, so a
layout is a fuse you design and then ride. Hold 45-70 degrees as long as
you can; best-ever duration is permanent. Engaged is ~2x passive BY
ARITHMETIC: passive rank caps at +0.16 and a 30-minute best burn adds
+0.16 — equal halves. Overdrive feeds the shaft +0.8 heat/s (an opt-in
that defeats the governor) and shuts itself off at the klaxon.

**ANOMALIES** — twelve authored, all five shells, on PLAYED time only
(2.5-4h apart; being away never consumes one), none before the first
Breach. Unanswered anomalies settle harmlessly after 30 min and still
count as seen; answering is strictly upside (the screaming vein, the
bottomless cell — a bounded gift, not a faucet — the hostile crystal, the
merchant who should not be down here, the cold bubble...). Rane and Jib
run questlines on them.

**HIRELING PERMADEATH — on, here only, and never a roll.** The casualty
is the longest-serving hand still stationed, NAMED on the Pressure card
from 85 heat and on the OVERPRESSURE banner; recall is one free tap that
always works and auto-restations under 70 heat; a death occurs only when
a flood completes with crew deliberately left on the floor. The fallen
berth stays dark — permanent means permanent.

**Combat:** 15 Cinder species with heat as ecology — stokers (hits heat
the shaft), venters (kills cool it), and hot-only spawns (Magmalurk and
the Molten Choir exist only above 50/65 heat: the greedy line's own
predators, unmet on the safe line). Floor Warden: THE SMOLDER (d470,
thesis RESTRAINT) — her strike power scales with YOUR heat (x0.6 cool to
x1.8 greedy); the period-kit audit passes cool and fails greedy, which is
the shell's argument made executable. Forge XIII-XV (Slagbreaker,
Pyreheart Pick, Cinder Maul): **the ladder ends at the Fifteenth by
ruling** — the old Hollow-flavored T13-15 placeholder recipes are
replaced; Hollow has no rock and Aleph needs no tools. Four Warrens (the
Cooling Gallery, the Bellows Grave, the First Furnace, the Salamander's
Bed). Eruption weather is live and interacts with Pressure FAVORABLY
ONLY (Updraft: vents x1.5; Ember Rain: drops; Annealing Wind: converter)
— an eruption that added heat would violate the weather anti-pattern, so
none does.

**Numbers:** currencies Slag/Ember/Obsidian/Pyre/Cinder(non-collapse) +
craft use of Pyre; walls 55/175/300 (XIII-XV); floor 470; achievements
columns 14-15 (none rewards a flood); save v9; sim: three heat stances
+ scenario cinder + cross-shell gear ladder (the macro-fast arcs made
current-shell-only gear crafting starve the kit — the Unblinking sat
unfaceable for 44h in one run until the sim, like a human, wore what the
bank could pay for regardless of provenance).

**KNOWN RESIDUAL, reported not absorbed:** run-to-run variance on the
early ladder is real — Breach 1 measured 7.6-8.8h and one run's Ferrite
return-to-peak hit 30.5% against the standard while others measured
7.3-19.7%. The variance source is combat-drop RNG feeding the gear
economy. Parked for a dedicated look, not knob-twisted at the end of a
feature phase.

## A.19 HOLLOW + ALEPH + RECURSION + AXIOMS (Phase 10 build record — the ending)

By the end of this phase the game has an ending. This is the last phase of
deep architectural work; the rest (a UI/legibility pass, relics, museum,
expeditions) is presentation and content.

**Step Zero — the game-side gear fix, and the residual re-measured.** The
Phase-9 residual was combat drops lagging a shell behind while gear
crafting was current-shell-only. The SIM was patched; the GAME was not.
Fix (guild.ts): once the stair leaves a shell, its rock stops falling — so
the Lamphouse now STOCKS it. Vess's ore stall rotates the two most-recently-
left shells' wall-band materials; Nock's gear stall rotates their
combat-drop hides. The caravan road runs up as well as down. No
multipliers — a supply fix, cause-shaped. Re-measured across three 12h
runs: **Breach 1 at 8.05h / 8.42h / 8.04h — a ~5% spread** (was 7.6-8.8h),
and return-to-peak measured **6.9% and 23.9%, both now under 25%**. The
parked 30.5% worst case is gone. Questlines: the last five written (Lark,
Prill, Verge, Ferro, Anders) — **the Guild is complete at 30 of 30**,
several threaded into the ending (Verge stamps a blank page for the shell
no charter can name; Ferro's asking is to carry a tool through a Recursion).

**THE LAW REGISTRY (laws.ts) — the phase's architectural spine, and the
honest way to let the engine mutate its own rules without a conditional
thicket.** The ~14 places where the engine decides HOW THE WORLD WORKS
(does a cell empty? how many cells does a drill stroke touch? which way
does the Kiln run? does a wall block or slow? what caps offline?) each now
consult a typed LAW SLOT instead of a constant. The choke points do not
know Axioms exist; they know law slots exist. An Axiom is a named,
permanent override registered into one or more slots. COMPOSITION, documented
like signature stacking: numeric slots declare a mode ('max' strongest-wins /
'mult' compound / 'add'), commutative by construction so acquisition order
can never contradict; flag slots are single-owner by design, with intended
pairs documented pairwise on the Axioms. No law consults another law —
slots are leaves. A fast-path returns the base when no Axioms are owned,
so the pre-Axiom world pays nothing for the machinery.

**THE TWENTY AXIOMS (axioms.ts) — each rewrites a rule, none is a
multiplier in a costume.** Every one is noticeable in the first five
minutes and the noticing is written down (`felt`), verified by the
no-softlock matrix (every Axiom solo + eight documented/random pairs, each
asserted to still earn and descend). Highlights: The Unemptying (cells
never deplete below a floor — a FLOOR not a well; income stays regen-bound,
unit-tested); Two Hands (drills strike two cells); The Reversed Kiln (Brick
melts back to Dust at a 25% premium); Twin Descent (the shell you left keeps
producing at a quarter of the pace you left it, closed-form, ceilings
intact); The Sealed Seam (choked heat caps at 97 — you can never flood, and
never touch the top of the gauge, a real trade); The First Word +
The Early Door (Recursions begin with structures standing / the Guild open);
The Mirrored Grammar (every rune pair and Progression also reads backwards).
**PILLAR 2:** exactly ONE Axiom touches the regen ceiling — Heresy of the
Ceiling, +15%, flagged `heresy`, and it announces itself in the UI as a
deliberate break. Every other slot is ceiling-neutral by construction.
Acquisition (`Axioms = floor((TotalEchoes/25)^0.8)`, on lifetime Echoes)
budgets ~4-8 across a full playthrough — you finish owning a QUARTER of the
list, and scarcity is the playstyle divergence: two players' third descents
share almost nothing.

**RECURSION (recursionSys.ts) — reset layer 3, implemented as a controlled
rebirth:** a fresh initialState() with the survive-ledger copied across —
the one honest way to reset "all shells" without a hundred hand-written
field resets drifting out of sync. SURVIVES: depth records (every prestige
formula feeds on them), Delver XP/skills, achievements, the Guild wholesale
(rep, ledger, titles, hirelings — the fallen stay fallen — Sable's pages),
every Codex (bestiary, chords/progressions, alloys+ranks, strains, brews,
loom shapes, lenses, star charts, rune grammar, warren uniques, Array
best-burn, Chamber best program), meta currencies (Scrip/Renown/Charter/
Axioms), and the Axioms owned. **TOOLS SURVIVE AS HEIRLOOMS (the ruling):**
name, purity, gems, and alloys kept; tier blunted to the Shell I ladder
with a whisper of the former edge. RESETS: shells, Breaches, carried
signatures, Echoes, Resonant Memory, all run currencies, materials, gear,
face upgrades, boards' physical state. Verified in-sim: The Author felled,
Core touched, RECURSION 1 with +3 Axioms, firstWord written, 2 heirlooms
carried — and the ledger is unit-tested field by field. It dwarfs a Breach.

**VI — THE HOLLOW.** ABSENCE (absence.ts): there is no rock, no face,
nothing to click. All income is the five carried signatures' meaning-in-
nothing, summed. **THE DECLARED INTERFACE COMPLETION (the honest finding,
written down not patched around):** the Phase-4 hooks are FACE-parameterized
and do not define what a signature means with zero cells. Each mechanic now
answers that in its OWN module via a new `voidTick` hook — Seepage: the loam
always gives a little, even here (the floor every minimal-carry run stands
on); Polarity: the silence strata carry your best chain's rhythm; Growth:
entropy RIPENS (highest when the Silence is loud); Refraction: the beam
lights motes in the dark; Pressure: heat still pays, capped at 90.
Contributions SUM (income streams). THE SILENCE: a 0-100 stack that mutes
carried strength as it climbs and converts CONVEXLY into Void when you
LISTEN — you farm entropy by choosing how loud to let the quiet get; an
auto-listener holds the idle floor. RECONSTRUCTION: buy back the face one
phantom cell at a time on a curve (250·1.62^k) that totals more than
everything before it; a rebuilt cell is a REAL cell (real regen, real
ceiling, pillar 2 binds), and only rebuilt cells regenerate — absence does
not. A whole face opens the Core. MINIMAL-CARRY VIABILITY (the softlock
check): sim'd a zero-Resonant-Memory, low-mastery carry — it reached 34/42
cells rebuilt in 8h, clearly progressing, never softlocked. Genuinely hard,
never a wall. Floor 560.

**THE ECHO CHAMBER (chamber.ts, craft system #6) — the deepest system in
the game, designed as a real programming model.** Record up to N of your
own dispatched actions; the Chamber replays the tape THROUGH THE REAL
ENGINE DISPATCH — which is the architecture win: a replayed program obeys
every ceiling, law, and cost automatically and forever, because the engine
cannot tell it from a hand. It buys your ATTENTION back, never your limits.
Cost model: each replayed step burns Resonance, so shorter programs score
higher; a legible execution TRACE records each step's yield so you can
watch your own program run and see where it wastes its keep. Best efficiency
is permanent. The tape length is itself a LAW (The Long Echo extends it).
Needed a small engine-facade addition (a dispatch-tape recorder + replay
head) — NO CraftSystem interface change.

**VII — ALEPH.** Short shell, large idea. The Core (depth 40) triggers
Recursion. The Rewrite spends Axioms on law overrides, permanently. THE
PARALLEL VIEW: all six worlds above on one screen, every number real
(every system already ticks globally) — structurally complete; its beauty
is left to the interface pass, per the scope note.

**Sable's ending.** The journals have degraded for six shells; page 44 cut
off mid-word ("we are marginal—"). The later books (Verdance→Hollow→the
Core) deliver it: the shells are not layers of a world but drafts of one;
the wardens are its edits; the Core is a desk, and the chair is warm. THE
CUT-OFF WORD COMPLETES AS THE FIRST WORD OF PAGE ONE (Aleph): "Marginalia."
She has sat at that desk before — the world resets and the writing survives,
and the pen is offered to whoever finishes the reading. Every Axiom you
write is a rule she (and now you) wrote into the world. The reading, and the
game, end where they began.

**Combat:** 15 faceless Hollow species (tier 16-17; the lane engine never
needed rock) — Nullwisp, Hushmoth, Echoshade (mirrors your rhythm), Lacunae,
The Waiting. Floor Warden THE UNATTENDED (thesis PRESENCE — it grows SOLID
under observation; reveal gear FEEDS it, +60% power; fight it half-blind, the
way you fought your first marlgrub — the whole curriculum inverted once).
Aleph's Warden THE AUTHOR is the final boss: every thesis at once (veiled +
phaseSkin + mirror + regenerator + shieldedFront + enrage), tuned to be
optimal-winnable-but-brutal with a full endgame kit (the hardest fight;
when it yields it does not die — it offers you the chair). Both final
wardens are fought through the REAL turn engine in the sim, not auto — a
player who reached the Core is a skilled hand, and "treat it as such." 8
Warrens (4 Hollow: the Last Lamp Room, Sable's Last Camp; 4 Aleph: the
Proof Room, the Inkwell, the Errata, the Reading Desk). Weather both shells,
favorable-only. Achievement COLUMNS 16-19 filled — the grid is completable
in principle (its last cell is "the fourth Recursion"). Gear deepening: a
SECOND LENS SLOT (Hollow Mastery 5), ten new harmonic rune orderings (24 of
56 now speak), Voidopal/Axiomite live, no tool tiers past XV (the ladder's
cap is enforced: requiredTier clamps at 15, so Hollow and Aleph are fought
with heirloom-age kit, not tools that do not exist).

**Numbers:** currencies Void/Null/Hush/Umbra (Hollow) + Resonance (craft) /
Fragment/Sigil/Axiom (Aleph) · floors Hollow 560, Aleph 40 (the Core) ·
save v10 · 214 tests green (16 new Phase-10 architecture tests: law
composition, the recursion ledger field-by-field, heirlooms, voidTick, the
Silence, reconstruction under pillar 2, the Chamber's law-compliance, the
axiom no-softlock matrix, save v10 migration).

**Cadence, measured against reality (not the doc's ~30h):** the ladder has
re-baselined repeatedly; the whole seven-shell descent now fits far tighter
than the original map. Cinder floor ~29h (P9 measured); the Hollow
reconstruction arc adds ~10-14h (segment-measured: 34/42 cells in 8h at
minimal carry); Aleph is short. RECURSION 1 projects to ~42-48h — reported
as a projection from measured segments, since a single continuous 48h run
to the Core needs optimal-skill manual final-boss play the balanced policy
does not do mid-run, and the engine correctness of Recursion is proven by
unit test + scenario rather than one heroic wall-clock run.

**Flags reported at kickoff, resolved:** (1) the registry finding — voidTick
is a declared interface completion, built as such; (2) minimal carry means
minimal INVESTMENT (all five signatures always present by breach order) —
softlock check targets zero-Echo states, passed; (3) Parallel View shows
live SYSTEMS not six live faces — one face exists at a time, the thesis is
real because the systems genuinely all run; (4) tools survive as heirlooms
per the ruling; (5) Parallel View built structurally-right, beauty deferred;
(6) the Spiral stays a stub (later-phase content); (7) cadence measured, not
doc-quoted. One thing NOT flagged at kickoff and found during build: the
final boss needed real-turn-engine play to be verifiable and The Author
needed tuning from 150000hp (unwinnable even optimal) to 88000hp
(optimal-winnable, still the hardest fight) — recorded here.

## A.20 THE LEGIBILITY PASS (Phase 11 build record — no new mechanics)

The game was mechanically complete and, in the player's words, "kinda mid"
to navigate and "LOWKEY don't make sense." This phase added no systems,
changed no formula, and touched no balance. It made ten phases of systems
comprehensible. The brief was three lines: "I have NO idea what the Kiln
does." / "The UI is just all clumped together." / "Should be different
menus and shit, not just a small toolbar on the right." Everything served
those.

**Part 1 — the right toolbar is dead.** The old layout was a face and one
420px scrolling strip holding all twenty-eight destinations — a filing
cabinet with the drawers welded shut, showing five tabs of twenty-eight on
a phone with the rest off-screen. Replaced with a ROOMS MODEL: five fixed
clusters (THE FACE / THE CRAFT / THE HOLD / THE WORLD / PROGRESS — a count
that can never overflow, at any state, on any viewport), each opening a real
screen. Desktop: a left section rail, the face persistent as the hero, and
the active cluster's room widened past 420px to ~560px+ (the Lattice, the
Crucible, the Guild finally breathe). Phone (the design driver): the face is
the home screen, a fixed bottom bar of five clusters, and tapping one opens a
full-screen room with a "shell · depth" context strip and a back to the
face. The nav (`ui/nav.ts`) is data — a cluster owns its systems and their
visibility predicates, moved out of App.tsx; a cluster shows when any of its
systems does. Justification: nineteen-to-twenty-eight destinations in ANY
single list is the disease; grouping into five and giving big systems a full
screen is the cure, and it is the same solution phone and desktop.

**Part 2 — every system explains itself, in three layers.** A `SystemHeader`
component renders: Layer 1, the PURPOSE in the game's own voice (authored
UI-side in `ui/systemCopy.ts` — engine stays headless, content frozen);
Layer 2, a dynamic NEXT ACTION computed from state; Layer 3, the number
breakdown (the pre-existing `breakdown()` popover, the modifier pipeline made
visible — what it was built for in Phase 0). The KILN was built first as the
reference: it now says "It eats Dust and gives back Brick — and Brick is what
you build with... a cold kiln wastes most of what it swallows," with a live
line that reads "It sits cold and idle — set it feeding" / "Barely warm —
most of the Dust is going up the flue" / "Running hot — Brick is banking."
The pattern then propagated centrally: the room region renders `SystemHeader`
for every system NOT in a `SELF_EXPLAINING` set (the P9/P10 panels self-explain
already and are excluded), so all the old instrumentation-only screens gained
purpose at one code site.

**Part 3 — the panel's specific defects, fixed.** `UpgradeRow` now reads as
THREE kinds instantly: OPENS (a one-time system unlock, badged and
bordered), BUILD (a structural one-off), and a plain repeatable (level pill).
The unlabeled "Buy 34" is gone: a persistent BULK control (×1 / ×10 / MAX,
stored in localStorage) sits once per panel and every buy button labels its
actual amount ("Buy ×10 · 1.2K"). Every upgrade PREVIEWS its effect before
purchase ("Field ceiling 13.1 → 17.7") — computed with zero engine change by
recomputing the pure stat functions against a shallow-cloned state with the
level bumped. The orphaned stat strip became `FieldStats`, a hero card with
real presence: Yield, Regen, Capacity, and — spelled out — the Field ceiling
as "the most you can ever earn per second," which is pillar 2 made legible.
The Header's fifty-currency overflow became a bounded purse (current shell's
coin + key meta, the rest behind a named "Purse" popover, every currency
titled). Smaller fixes: "Vess's asking · 0/4" reads "Vess wants · favour 1 of
4"; the Delver's sealed nodes say "Not yet — a deeper delve opens this branch"
instead of a broken padlock.

**Part 4 — "what next."** `NextHint`: a quiet, Guild-voiced line at the foot
of the face that notices what you're close to — unspent skill points, Dust
enough to raise the Kiln, a warden at the floor, a cold idle Kiln, an
affordable ceiling-raise. A pure state heuristic; ignorable by an old hand,
reliable for a new one.

**Part 5 — progressive disclosure.** New systems no longer sprout silently,
especially the wall of them after a Breach. A single "something opened" card
(`DisclosureGate`) names the arrivals with their cluster and purpose, the
player acknowledges, and the rail-glow then leads them in one at a time.
**seenSystems moved into the SAVE (v11, migration added)** — per the change
on kickoff flag 4: the game has export/import, so localStorage would misfire
the gate for all twenty-eight systems on a restored device; the save carries
it, and an existing (non-fresh) save silently backfills everything already
visible on first load so the gate never fires retroactively. Save v11 is the
ONLY schema change in the phase (one field: `seenSystems: string[]`).

**Parts 6-8 — first ten minutes, coming back, the audit.** The fresh-save
path was walked first and steered the rest: the fresh face now shows the
NextHint, the Field with its ceiling explained, and the Kiln one tap away
with its purpose stated. The OfflineModal became re-orientation — it leads
with WHERE you are ("SHELL V · CINDER · depth 214") and WHAT YOU WERE DOING
("mid-reconstruction" / "at the floor, warden still to fell") before the
resource ledger.

> **CORRECTION (A.21).** The original text of this paragraph ended "Every
> screen was walked; failures fixed." That was not true and is retracted.
> Four of thirty screens were verified by direct evidence (Dig, Kiln,
> Lattice, Delver); the other twenty-six were assumed correct because they
> shared one code path. Part 6 likewise produced no itemised findings — only
> the assertion that a walkthrough had happened. A.21 records the pass that
> actually did both, and what it found.

**Part 9 — the Parallel View, the deferred beauty pass (from A.19 flag 5).**
The last image the game shows: seven shell-miniatures in a grid, each with its
own signature mark drawn over a shell-tinted backdrop (Loam's warm leak,
Ferrite's ± chain, Verdance's creeping vines, Glassmere's bent beam, Cinder's
rising heat, the Hollow's faint motes, Aleph's warm Core), live depth bars and
currencies, "here" and "warden felled" states, and — after a Recursion —
Sable's line about the offered pen. Reduced-motion loses only a slow drift;
every shell still reads by its mark.

**Constraints honored:** no mechanical change (everything is pure-UI: preview
via recompute, bulk via the existing count param, grouping is presentation);
the art direction preserved (warm lamplight on cold stone, each shell its own
temperature — a clarity pass, not a restyle); PHONE FIRST (the worst case
drove the layout); reduced-motion, visible keyboard-focus rings
(`:focus-visible`), and ARIA roles/labels on nav, tablists, dialogs, and
controls.

**Verified:** all 214 tests green; production build clean; save v11 migrates
(the migration chain is unit-tested). Screenshots at four progression states
— fresh, mid-Ferrite, mid-Cinder, post-Recursion — on a 380px phone and
desktop (`scripts/shot-ui.ts`); NO horizontal navigation scroll at any state
on the 380px viewport (five fixed clusters cannot overflow). The Kiln
before/after is the phase's own test: before, a heat bar and four numbers and
no idea what it is; after, "It eats Dust and gives back Brick, and a cold one
wastes most of it."

**Build-time gotcha (recorded):** the shot harness must dismiss the
DisclosureGate deterministically — its seeds reveal ~28 systems at once, and
the acknowledge button sits below a list too tall to reach on a 380px phone,
so a `getByRole('button').click()` silently times out and the gate covers the
shot. Fix: dispatch `markSystemsSeen` with every system id after seeding.

## A.21 THE HONESTY PASS (Phase 11b — finishing what A.20 claimed)

A.20 overstated its coverage. This pass fixed the overstatement by doing the
work: every screen shot and judged, every copy gap filled, the two items that
were described but never written actually written, and the first ten minutes
walked with the findings written down instead of asserted.

**0 — The hover flicker (done first, because it made the game feel broken in
the hand).** Reported as "buttons flash on hover and are hard to click."
Diagnosis corrected at the outset: NO hover state in the codebase changes
geometry — `.btn:hover` is colour-only and there is not one geometry-changing
`hover:` utility in any component. The real mechanism was that the controls
resize THEMSELVES from live data. `buyN` and `cost` recompute every 80ms
store tick, so a buy label walks from "Buy ×34 · 1.2K" to "×35 · 1.3K"; the
button sits at the end of a flex row, so a wider label pushes its LEFT EDGE
under the stationary pointer. Hover is lost, reverts, re-acquires — the
flicker — and a click lands where the button no longer is. Measured across
the realistic label range: **33.8px of left-edge travel; 0px after the fix**
(tabular-nums plus a reserved min-width). Two more of the same class: the
effect-preview block mounted and unmounted as currency crossed the
affordability line, changing card height and shoving every row below it
(now always reserved — card height constant at 102px across broke/affordable/
rich); and the Header's currency chips widened as values grew, walking the
Purse button (now right-aligned in a reserved box). `BucketInfo`'s popover
also opened directly under the cursor with no `pointer-events: none` and
swallowed the click behind it — fixed, verified by hit-testing through it.
Touch targets: 44px minimum on coarse pointers, scoped to `.btn`, `[role=tab]`
and nav buttons. The sub-tabs were 24px and are now 44px. Deliberately NOT
applied to the craft boards' dense adjacency grids (Lattice hexes, vent pipes,
Ember Array, achievement grid) where a cell growing past its neighbour would
steal the tap next to it; the small fixed-size `.btn` steppers opt out with
`.btn-cell`.

**1 — `SELF_EXPLAINING` deleted.** The exclusion set was decided before a
player said "I have NO idea what the Kiln does" — and the Kiln would have
qualified under exactly the same assumption. All thirty systems now render
the header, no exceptions. To make that possible the header became fully
self-contained: `status?(s)` joined `SystemCopy`, so the live readout (the
Kiln's "running hot · 79% heat", the Face's depth) comes from the copy table
rather than being passed in by each panel, and the inline headers in
`panels.tsx` were removed. Thirteen panels gained a header they never had;
their existing inline titles were absorbed so nothing double-titles — a stat
bar that used to repeat the system's name now labels its own numbers
("Venting", "Your record", "Findings", "Solved", "Drip", "Upkeep",
"Written", "Your standing", "The beds", "The network", "The weave", "The
mash"). The Parallel View's centred title block was deleted outright and its
best line folded into the copy.

**2 — Layer 2 coverage: 30/30, no gaps.** Eleven systems had no next-action
at all (Foundry, Mycelium, Hold, Lamphouse, Bestiary, Journal, Wells,
Rewrite, Parallel, Achievements, Vault) and are now authored. Six that
returned a constant were converted to read state (Vents, Greenhouse, Array,
Warrens, Still, Runes). The four DISCOVERY BOARDS — Crucible, Loom, Bench,
Chamber — were deliberately left board-state only: "0 found in 17 pours",
"no thread in hand", "solved but not equipped", "the tape is blank". They
never name a ratio, a shape, a mirror or a step. Pillar 5 is discovery over
unlocking, and selling the solution is the Insight branch's job — a Layer 2
line that solves the puzzle is worse than a static one. The Parallel View
keeps a deliberately static line ("Nothing to do here — it is a view") because
that screen genuinely has no action and saying so beats inventing one.
Verified by `scripts/copy-coverage.ts`, which prints the 30-row table and
exits non-zero on a gap.

**3 — The two items that were claimed but never written.**
*Contract-board duplicates: reproduced before fixing.* `generateContract`
picked kind and issuer at random with no reference to the board, so two pegs
could be byte-identical to the reader while distinct to the code (`id` is a
sequence number). Worst for kinds with a DETERMINISTIC target: a `forge` job
is always "next tier", so every one generated in the same moment matched —
"Forge a Tier II tool" appeared three times on a six-slot board in every
repro run. Fixed at generation time on the player-visible identity
(kind + issuer + target + subject), retrying up to twelve times and leaving a
peg empty rather than posting a twin; `refillBoard` also tracks identities
within a single pass so two pegs filled together cannot match each other.
Boards still fill completely. Three regression tests added.
*Newly-affordable signalling* is the false→true edge and only that — not
"is affordable" (already the button's warm styling) and not the MAX count
ticking (which would strobe the panel constantly). Previous affordability is
remembered per upgrade id; a row's first sighting records silently so opening
a panel never flashes everything you happen to be able to afford. Verified:
silent while broke, four rows flash on the crossing, expires, silent through
MAX-count churn.

**4 — All thirty screens shot and judged** (`scripts/audit-30.ts`, contact
sheets in `sim-out/audit-30`). All thirty are only simultaneously visible
POST-RECURSION, so that is the state used. Six defects found and fixed: four
sub-labels still duplicating their system title (The Greenhouse, The
Mycelium, The Loom, The Still), the Warrens panel repeating its own purpose
verbatim in its body, and the Rewrite's Layer 2 printing a raw unformatted
balance ("500000000 Axioms", now "500M").
*Harness trap worth recording:* injecting FAKE content ids into a seed
('m1', 'a1', 'b1') sails through the engine and then crashes the panel that
looks them up in its registry, unmounting the whole React root — after which
every later shot fails with a useless locator timeout. Only real ids may be
seeded, and the shot harness now listens for `pageerror`. Also: an element
screenshot waits for the element to stop moving, and this app re-renders at
12Hz with live animations, so it never settles — clip a page screenshot to the
element's box instead.

**5 — The first ten minutes, with findings this time**
(`scripts/first-ten.ts` walks the opening beats on a 380px phone and prints
what the screen actually says). Two real confusions found, both fixed:
- **"Buy ×0 · 50".** When you can afford nothing, `buyN` clamps to zero and
  every repeatable button offered to buy ZERO of a thing — on the very first
  screen of the game, where all four buttons read that way. Now labels the
  one you would get; the price shown was already the price of one, so the two
  now agree.
- **A next-action frozen for the whole opening.** The Face's Layer 2 read
  "Tap the rock. Keep tapping" at 1,200 Dust with the Kiln affordable,
  because it was one string gated only on `maxDepthRecord === 0`. It now
  moves through the real beats: tap → "you can afford your first upgrade" →
  "enough to raise the Kiln" → silent once you are descending.

**Verified:** 217 tests (214 + 3 new); tsc clean; production build clean; no
horizontal scroll at 380px in any of the four states (0px, programmatic);
copy coverage 30/30 with zero gaps.

## A.22 THE LONG TAIL (Phase 12 build record)

Five systems remained in the doc, all optional depth on a finished game. Four
were built; one was cut on its merits.

**CAMP BUILDING — CUT, and folded into the Museum as setting.** It could not
answer "why would a player who has finished the game open this?". The game
already carries six spatial-adjacency boards (Lattice, Vent Network, Ember
Array, Mycelium, Loom, Bench); a seventh whose payoff is adjacency multipliers
is repetition, not depth, and "for another multiplier" is the weakest answer on
the list. Its one good idea — a physical surface place that houses the endgame —
survives as the Museum's setting: the long room off the back of the Lamphouse,
where the crews muster and the cases line the walls.

**THE SPIRAL — reset layer 4, and a change of VERB.** The ladder reads
numbers -> mechanics -> rules: Collapse pays Cores, Breach carries a signature
mechanic forever, Recursion rewrites rules through the law registry. The only
honest thing above "rules" is not a bigger number but a different job: below
the Spiral you PLAY a world; at the Spiral you ADMINISTRATE many. A Spiral
spends every law you wrote and the Axiom bank, and pays back CAPACITY.

Interpretations of the locked reset-ladder row, flagged and approved at kickoff:

- `Spiral = floor(sqrt(TotalAxioms) * RecursionCount)` yields a SMALL LIFETIME
  TOTAL, so Spiral is a slot-gating currency spent once per node, never a
  renewable resource. Capacity is bought with Spiral; the CONTENT that fills it
  is unlocked by challenges. Two axes, so the player who loves challenges is not
  automatically the player with the most capacity.
- "Resets: Axioms" = the owned laws and banked Axiom currency wash. Lifetime
  biography (records, Delver, Guild, every Codex, totals, recursion COUNT and
  axiomsEarned) survives exactly as a Recursion preserves it — and so do
  relics, the Museum and the expeditions, because what you COLLECTED is the
  point of the layer.
- Awarded on a high-water mark, so repeat Spirals never double-pay.

**PARALLEL SHELLS — abstracted, deliberately (flagged, approved).** A.19 flag 3
recorded that one face exists at a time; face/depth/collapse are singletons
keyed off `currentShell()`. Six live faces would be a rewrite of the layer
everything else sits on. So a parallel world runs a REDUCED model: its own
depth, its own field ceiling, no interactive face, income through the same
modifier buckets at `PARALLEL_IDLE_SHARE` (0.55) times the board's rate. Exactly
one shell is "in hand" and fully playable; you swap whenever you like. Pillar 2
binds each world separately and explicitly, because its own ceiling is
literally the term in its income.

**THE AUTOMATION GRID — the Echo Chamber, grown up.** The Chamber proved a
program replayed through the real dispatch path obeys every ceiling a hand
does. The Grid generalises it from a linear tape to a board of DECISIONS in
Spiral-gated slots, with orthogonal adjacency the way every other board in this
game works. Eight modules, one per challenge. `automationRate` is CAPPED AT 1.0
by construction: a full board plays a world exactly as well as a good idle
player and never better. That cap is pillar 1 written into code rather than
into a comment.

**THE CHALLENGES — the part you still play by hand.** With parallel shells and
the Grid, the endgame risks becoming a dashboard you watch; challenges are the
counterweight, and they were authored with the care the Warrens got. Each is a
SPECIFIC IDEA ABOUT THIS GAME, not a difficulty slider — it removes a pillar or
a system the player has stopped noticing so that what it was doing becomes
visible. One Cell (width was never income — regen was). Cold Iron (feel where
the converter sits by its absence). The Unattended (pillar 1 is not a slogan;
the shaft really does run without you). The Empty Hand (the tool ladder IS the
pacing). Sable's Walk (the core loop stands alone — pillar 4, proved rather
than trusted). The Held Breath (the Governor was doing more than you noticed).
The Long Silence (Absence pays on its own terms, without five signatures
propping it up). Two Worlds (capacity without a policy is two shafts starving
each other — the argument for the Grid).

Each states a premise before you commit and a LESSON only after you finish. A
challenge runs in a SEPARATE WORLD: your run is serialized through the save
codec, put down whole, and picked back up on finish or abandon, so it can never
cost you anything but the time you chose to spend.

CHALLENGE SEALS are a second, small law registry beside the Axiom one. Axiom
slots are all max/mult off a base by design, so composition order can never
contradict; bending them to subtract would have broken that. Seals take things
away instead, need no composition rule (exactly one challenge is ever active),
and register from content the same way Axioms do — `laws.ts` still imports
nothing from content.

**RELICS — the treadmill killed by construction, not by tuning.** Three rules:
affixes come from CONTEXT not a blind roll (a Warren relic carries the Warren's
pool), so the hunt is steerable and the SHAPE never surprises you; FUSION keeps
the better of each affix and never destroys, so a duplicate is always progress
and there is no such thing as a bad roll, only material; and the rarity FLOOR
RISES with Museum completion, so a late Mythic can never roll worse than an
early one. Six slots. Every affix lands in a modifier bucket that moves the
ceiling the way an upgrade does, or sits outside the income path — no flat
income anywhere.

**THE MUSEUM** is the only screen that shows what you DID rather than what you
CAN DO. Six CURATED cases (not shelves) — a case asks for specific things, so
filling one is a directed hunt. Completed cases pay through named modifier
sources and lift the relic floor: collection lifts luck.

**EXPEDITIONS** pay in what digging cannot give you — material out of shells the
one-way stair has already closed behind you (the exact class of problem that
caused the P9 softlock), plus relic material. Never chip income, which would
hollow out the face. They resolve on the GAME CLOCK like the Wells and the
Observatory, so they run with the tab shut, and results wait in `ready`
FOREVER — verified by a test that advances the clock a year and finds the haul
still sitting at the gate.

**MEASURED (sim, not the pacing map):**

| lifetime state | Spiral | buys | board plays |
|---|---|---|---|
| 5 axioms, R1 | 2 | 1 licence, 0 slots | — |
| 12 axioms, R2 | 6 | 1 licence, 2 slots | 42% of idle |
| 20 axioms, R4 | 17 | 1 licence, 4 slots | 76% of idle |
| 20 axioms, R6 | 26 | 1 licence, 5 slots | 88% of idle |

PILLAR 1 AT THE TOP OF THE LADDER: measured on two independent engines from an
identical state over a 600s window after settling — active 188 dust/min vs idle
92, a **2.05x** edge. A fully automated parallel world earns 0.55x idle, i.e.
**27% of what an attentive hand earns**. Automation never threatens hands.
(The first version of this measurement reported 0.41x and was WRONG: it ran
both windows on one engine, so the idle window harvested a pre-charged face and
handed the active window a drained one. Recorded because the artifact is easy
to reproduce and looks exactly like a pillar violation.)

**FLAG FOR PHASE 13 — the grid promises more than the formula funds.** The board
is 4x4 = 16 cells and eight modules exist, but the realistic lifetime budget
buys about FIVE slots. The RATE is healthy (76-88% of idle at the deep
endgame — a working machine, not a starved one), so this is not a balance
problem; it is a PRESENTATION problem. Sixteen visible cells with five
affordable reads as poverty even when the automation is good. Phase 13 should
either shrink the board to 3x3 or lower `gridSlotCost` (which is invented, not
locked — unlike the Spiral formula, which was not touched). Flagged rather than
fixed because "does five-of-sixteen FEEL starved" is a judgment that wants the
screen in front of a player, not a number in a script.

**SAVE v12** — four slices (`spiral`, `relics`, `museum`, `expeditions`), all
empty on an existing save, which is exactly true of a returning player.

**Also fixed here (a Phase 11 bug, found by playing):** the DisclosureGate
rendered a 777px card in a 720px viewport with `overflow: visible`, putting its
only dismiss button below the fold. The modal covers the screen at z-50, so the
game became genuinely unplayable with no way out — the nav visible through the
backdrop and dead to the touch. The card is now a capped flex column, only the
list scrolls, the button is a shrink-0 footer, and Escape always dismisses.
Verified at 29 systems at once: 612px card, button reachable. This is the
working rule in the main body earning its place — the shot harness had routed
around this exact geometry in Phase 11b instead of reporting it.

**THE HOVER FLICKER — the real cause, found on the third attempt.** Reported as
"hover over the tabs on left and top right, it flickers and is impossible to
click". Two earlier diagnoses were wrong and both were wrong for the same
reason: the probe was not actually hovering. Synthetic `MouseEvent`s do NOT
trigger the CSS `:hover` pseudo-class, so a geometry probe using them measures
a page nobody is pointing at, and reports "stable".

With a REAL pointer (Playwright `mouse.move`), holding still over a rail button
and sampling: the box stayed at ONE distinct value — nothing moved, which is why
every layout-shift hunt came up empty — but the computed colour took TEN OR
ELEVEN distinct values. The active tab showed exactly one.

Cause: `SystemSelector` and `ClusterButton` were declared INSIDE `App()`'s body.
A component defined in a render body gets a new function identity every render,
so React treats it as a different component type and unmounts + remounts its
entire subtree — here twelve times a second, because the store publishes at
~12Hz. The DOM node under the pointer was being destroyed and rebuilt
continuously: `transition-colors` restarted from its base colour on every
remount and `:hover` was dropped and re-acquired. The active tab did not flicker
because its styling does not depend on hover.

Fixed by hoisting both to module scope with explicit props. Verified with the
same real-pointer probe: 10-11 distinct colours -> 1, on every rail button and
every sub-tab.

THE LESSON, which generalises: a hover bug that a geometry probe cannot see is
probably not a layout bug. Sample the COMPUTED STYLE as well as the box, and
make sure the pointer is real — `dispatchEvent(new MouseEvent('mouseenter'))`
proves nothing about `:hover`.

## A.23 THE SHIPPING PASS (Phase 13 build record)

The last phase. No new systems; this one made the game something a stranger can
open and play. Four of the findings below are things the previous twelve phases
shipped while reporting themselves green.

**THE FINDING OF THE PROJECT: 233 tests passed while five systems were
unreachable.** Relics never dropped (nothing called `mintRelic`), so the Relics
room never appeared, so the Museum never appeared. Challenges could be started
and never won (`checkChallengeGoal` had zero call sites), so no Grid module ever
unlocked and the automation half of the Spiral was dead. Parallel shells could
not be created (no UI dispatched `licenseShell`). Expeditions built a haul object
and discarded it. Every one of those functions was individually correct and
individually tested. Nothing asserted that anything CALLED them.

All six wired and verified in play: 3 relics found in an hour of drilling at
depth 200; Relics and Museum rooms both visible; a challenge started, hit its
goal, auto-completed and unlocked `autoBuyFace`.

**THE REACHABILITY TEST CLASS**, added so it cannot recur. It reads the source as
text and asserts that every dispatchable action has a dispatch site outside
types.ts and actions.ts, every content-granting function has a caller outside its
own module, and every counter that gates a room is written somewhere. Crude on
purpose — the failure it prevents is crude. It found SIX MORE dead paths the
moment it was written:
- `donateItem` had no UI, so FOUR OF SIX MUSEUM CASES could never be filled —
  only relic cases had a button.
- `setKilnReverse` had no UI: the Reversed Kiln Axiom could be bought and never
  operated. An Axiom you cannot switch on is a dead purchase.
- `unequipRelic` had no UI: equip-only, no way to take one off.
All three fixed. It also cried wolf once, on `spiral.count`, which IS written but
through the object-spread idiom the regex did not know; the check was widened
rather than the code changed.

**PERFORMANCE — one real defect, found by measuring.** On a 390x780 viewport at
4x CPU throttle, Shell VII with every system running, 24 drills, 120 relics and a
running Chamber tape:

| | before | after |
|---|---|---|
| mean frame | 125.2 ms | 20.4 ms |
| median | 26.5 ms | 10.5 ms |
| p95 | 694.8 ms | 68.7 ms |
| worst | 1190 ms | 89.9 ms |
| frames >100ms (visible hitch) | 119 / 600 | **0 / 600** |
| cold load (nav -> canvas) | 2680 ms | 2207 ms |
| heap baseline | 147.8 MB | 79.9 MB |

Cause: `PanelHost` mounted ALL 35 panels and hid the inactive ones with a CSS
`hidden` class. React still builds a hidden tree, so at the store's 12Hz publish
a late-game save was re-rendering 120 relic cards, the achievement grid and every
craft board continuously while the player looked at the Face. Now only the active
panel renders. The Lattice remains the documented exception — it owns a Pixi
application and destroying renderers poisons Pixi's shared pools — so it stays
mounted and CSS-hidden as before.

Engine cost was never the problem and is not now: 60 s of simulation in ~195 ms
(0.325 ms/step). Heap grew 9.9 MB over ten simulated minutes from a halved
baseline; the feed ring stays capped at 128. Save size at full endgame: ~38 KB.

**SAVE HARDENING.** Twelve migrations, previously never tested end to end. Now:
every historical version 1-11 migrates to v12, hydrates, and is TICKED — a
migration that leaves a slice undefined type-checks fine and throws on the first
frame, so "does it load" was never the right question. Export/import round-trips
at fresh, mid-Ferrite and post-Recursion states with Decimal values compared as
strings (they have their own toJSON and are the fragile part). Eight kinds of
garbage — empty, truncated, wrong shape, null state, future version, array —
all throw rather than returning a half-built state.

The real gap was not detection but DESTRUCTION: `boot()` already caught a corrupt
save and started fresh, and then the autosave overwrote the damaged file ten
seconds later. A recoverable problem became a permanent loss of the player's
entire run. Saves that fail to load are now QUARANTINED to a separate key the
autosave never touches, with a test that lets the autosave fire and asserts the
damaged copy survives.

**THE ACHIEVEMENT GRID: 250 -> 190, honestly.** Columns 0-18 were full, ten each;
columns 19-24 were entirely empty and never would have been authored — the game
ran out of things worth asking for before it ran out of grid. Sixty permanently
unfillable cells is not a hook, it is a defect that tells a completionist the
game is broken. `ACH_COLS` 25 -> 19. No content lost, no bonus lost, no row or
column bonus changed.

**THE FACE GLOW.** Reported as cells "stretching outside the boxes". Arithmetic,
not taste: at full charge the outer glow ring reached 0.693w from centre against a
tile half-width of 0.5w, so charged cells bulged 19.3% of a tile past each edge
and the grid read as overlapping circles. Worst at full charge — exactly what a
new player looks at first. Outer ring clamped inside the slab; the growth curve
at low charge is untouched.

**ANOMALIES now follow the pillar-4 convention** (ruling): an ignored anomaly
pays a quarter-minute of the player's OWN ceiling — ceiling-bound by
construction, so pillar 2 is untouched. It does NOT increment `resolved`: a test
asserted "settled != answered" and was right. Free to ignore is the same as not
there; small-but-never-nothing is how every other optional system here works.

**THE FIRST SPIRAL** grants one grid slot and one module, so the Automation Grid
is visibly alive on first sight rather than sixteen locked cells above eight
locked modules. Board held at 4x4 (ruling): 3x3 would flatten the orthogonal
adjacency synergies to two neighbours at the corners. If it reads sparse after
real play, `gridSlotCost` is the tunable — the Spiral formula was not touched.

**PLAYED BY HAND**, not screenshotted: a real pointer at fresh, mid-Ferrite,
mid-Cinder and post-Recursion, walking all 35 rooms and clicking the first
enabled control in each — 140 room-visits. Zero crashes, zero overflow, zero
missing headers, no undismissable modals. Worth stating plainly: this proves
nothing breaks, not that the game is good. A harness the author wrote reporting
zero findings is weaker evidence than it looks.

**Not done, and honestly so:** the Verdance-systems pacing flaw is diagnosed in
the pacing map and NOT fixed — fixing it is a balance change to shells I-VII and
out of scope for a hardening phase. Nothing past ~48 h has ever been measured,
which the map now states outright.

**Verified:** 381 tests green (233 + 123 reachability + 25 save hardening) · tsc
clean · production build clean · copy-coverage 35/35 · 0px horizontal overflow at
380px across all four states · save v12 migrates from every historical version.
Built locally; not deployed, by instruction.

---

## A.24 THE DEPTH PASS + THE COMPENDIUM (Phase 14 build record)

Two halves. **Part A** was ten ranked refinements to systems that already
shipped — depth where there was breadth. **Part B** was THE COMPENDIUM: an
in-game wiki, on the standing rule that *a player should never need a browser
tab open beside the game*.

### The governing rule of Part B

**Pillar 5 is not suspended. The Compendium explains mechanics, never
solutions.** It says a Chord is three motifs of the same shape in a line and
that order matters to a rune pair; it does not list the 40 Chords, the 60 alloy
ratios, the weave shapes, the rune orderings, the brews, or the Bench answers.
The test it was built against: *read it cover to cover and you understand
exactly how every system works, with every discovery still ahead of you.*

This is enforced mechanically, not by good intentions —
`scripts/compendium-coverage.ts` scans the rendered corpus for Chord names and
rune orderings and fails the build if answers leak.

### Built from data, not prose

315 entries, and only 12 of them are hand-written:

| Kind | Count | Source |
|---|---|---|
| Systems | 35 / 35 | `ui/nav.ts` + `systemCopy.ts` + an authored essay per major system |
| Materials | 132 / 132 | `engine/materials.ts` — filterable by shell, rarity, mineable vs combat-only |
| Currencies | 39 / 39 | `engine/resources.ts` — what makes it, spends it, and what it survives |
| The Deepwrought | 97 / 97 | `combat/species.ts`, gated on having actually met one |
| Concepts | 12 | hand-authored (`ui/compendium/pages.ts`) |

Generating from the registries means the wiki **cannot drift from the game**,
which is the failure mode every wiki has. The coverage checker exits non-zero on
a gap, an orphan, an empty body, or a spoiler.

**Placement:** a persistent glyph in the header's left edge on every viewport,
plus a desktop FAB. The brief asked for bottom-left, which on a phone is exactly
where the cluster bar lives; the header is reachable from every room, modal and
challenge and costs the bottom bar nothing. Opening it from a room lands on that
room's page. Gated pages are **listed and say so plainly** rather than hiding —
progressive disclosure without pretending the page does not exist.

**No save bump.** Search history and last-page are UI state; they live in
`localStorage` beside bulk-buy mode. Save stays at **v12**.

### Part A — what shipped

1. **The rune grammar speaks.** All 64 orderings now say something: 55 harmonic,
   9 dissonant, **0 silent** (was 32 silent). `nix|nix` and `vey|vey` stay
   dissonant — a rune doubled on itself is the one shape the grammar refuses.
2. **The Foundry, 8 → 31 modules.** New tags (`field`, `ledger`, `vigil`,
   `chain`, `motif`) plus fills for the existing ones, so every tag has ≥2
   claimants and conflict-by-tag actually bites.
3. **Relic affixes, 7 → 17**, all keyed to REAL modifier buckets, plus a sixth
   source (`warden`).
4. **A fusion target chooser.** Fusion was directed in the engine and *blind in
   the UI* — it fed whichever relic sat first in the list. It now shows every
   candidate with what it would contribute (gained / improved / already beaten,
   rarity change) before it eats one. `fusionPreview()` lives beside
   `fuseRelics()` and a test replays one against the other so they cannot drift.
5. **The Museum, 6 → 12 cases**, spread across four collections and ten distinct
   buckets, each ceiling checked against the real pools.
6. **The Automation Grid, 4×4 → 3×3**, and locked/available cell contrast fixed.
7. **Crucible and Loom ergonomics.** The Crucible gets repeat-last-pour, three
   saved mixes and clear; the Loom gets a real undo stack on the placements
   before commit. None of it hints at an answer — it only replays what the
   player already chose, which is the line between ergonomics and a solution.
8. **Expedition crew traits.** Crews were interchangeable, so a roster of named
   characters was decoration on a dropdown. Ten authored traits (Pell hauls, Jib
   is fast, Fenn finds the odd thing), derived from the def plus level — **no
   save state**, so every existing crew has one the moment the game loads.
9. **THE DRAW** (Cinder's back half). Cinder was the shell fighting itself: the
   shaft's whole problem is heat you cannot shed, and the Array — the shell's own
   craft system — only ever made *more* of it. The Draw reverses the pipe: held
   shaft heat becomes furnace temperature. The thing you were desperate to be rid
   of is now fuel. Sim-verified on four axes (`scripts/draw-verify.ts`).

### Three things that were wrong, and are recorded as wrong

**The Verdance retroactive-unlock flaw does not exist.** It was ruled in as Tier
3 on my own Part A report. Measured, it does not reproduce: the three gates fire
at depth records 20/40/60 of a **290-deep** shell (the first fifth, not the back
half), a Collapse does not touch `depthRecords`, and you cannot Breach out of
Verdance before the last gate opens — so the one-way stair cannot strand anyone
with a dead system. **The gates were left alone** and the properties that make
them safe are now pinned by tests, so a later phase cannot quietly break them.
Building the "fix" would have been motion without a defect.

**Two counts I reported were wrong.** I said Foundry 8→30 (it is **31**) and
relic affixes 7→20 (it is **17** — the `cellCap`→`cap` and `dropChance`→`dropRate`
renames collided with keys that already existed and deduped). The registry is
right; my report was not.

**The combat-only material count** was corrected during the build: 32
combat-only, 100 mineable, 0 orphaned — not the 0 I claimed in Part A, which
came from filtering on a field (`m.combatOnly`) that does not exist. The spec's
promised 12 was already exceeded, so that item was dropped as padding.

### Two latent bugs the work exposed

- **The Museum registered into a non-existent bucket.** Cases named `dropChance`
  and `cellCap`; neither is a member of the `Bucket` union. They registered into
  nothing and paid nothing — silently, because `registerModifier` accepts any
  string. Remapped, plus tests asserting every bonus in the game names a bucket
  that exists.
- **`1 + bonus` on an ADDITIVE bucket.** Fixed in the relic affixes when it broke
  five offline tests, then found latent in the Museum's identical registration —
  invisible only because no case had yet used `offlineEffAdd`. The Ones That Came
  Back does, and would have granted +105% offline efficiency.

### Working rule added

A number in this document is not evidence. The doc claimed ~90 materials while
the game shipped 132, for several phases, with no test able to notice. Counts
here are now the registry's, and where the two disagree **the registry is right
and the document is the bug**.

### Verification

393 tests green (was 381) · `tsc --noEmit` clean · copy-coverage 35/35 ·
compendium-coverage 315/315 with no gaps, orphans or spoilers · the Compendium
verified in a real browser on desktop and at 380px, with search resolving
"Weepstone" → the material, "Breach" → the reset ladder, and "why is my income
capped" → **The field ceiling** · 0px horizontal overflow at 380px with the new
header glyph, index, and reader · THE DRAW sim-verified · production build
clean. **Built locally; not deployed, by instruction.**

---

## A.25 EXPANSION + THE CONFLUENCE LAYER (Phase 15 build record)

Two halves. **Step Zero** closed the modifier hole for good. **Part 2** — the
protected part — built the cross-system layer the game had never had.

### Step Zero — the hole, and what was actually wrong

`registerModifier` was blamed for accepting a `string`. It did not: its
`bucket` field was already typed `Bucket`. **The hole was one layer up.** The
CONTENT definitions typed their own bucket as `string` and then wrote
`bucket: bucket as Bucket` at the registration site. The cast is what let
`dropChance` and `cellCap` through, and no amount of hardening the registry
would have caught it.

Three failures hide in that one sentence, and each needed its own guard,
because passing one says nothing about the others:

| Failure | Guard |
|---|---|
| The NAME is wrong | Content bucket fields are now `Bucket`. A typo is a compile error. |
| The name is right but NOTHING READS IT | `assertModifierIntegrity()` at boot, against a declared consumer map. |
| The SHAPE is wrong (`1 + bonus` on an additive bucket) | `foldBonus(bucket, n)` — registrars no longer write the arithmetic. |

Plus `registerModifierChecked()` for registrars that genuinely hold a string:
it **throws** on an unknown name rather than registering into nothing.

**The audit found no other bad names** — `tsc` passing after the casts were
removed is itself the proof, since every literal bucket now type-checks. Three
further loose spots were tightened: `GemDef.bucket`, `forge.ts`'s `GEM_LOOKUP`
(which widened `Bucket` back to `string`), and two redundant `as Bucket` casts
in the UI. `src/engine/stubs/index.ts` also held a `bucket: string`; **that file
is dead — nothing imports it** — so its type was fixed in place and it is
flagged for deletion rather than deleted (no VCS in this working copy).

The consumer map is a claim, so a test checks it against the engine source. All
17 buckets are genuinely read; none is decorative.

### Part 2 — CONFLUENCES (the heart of the phase)

**16 confluences across 23 systems.** A confluence is a condition over two
systems plus what it pays. It is not a new system: no room, no currency, no
board, no upkeep. It is the space between things that already exist.

Rune × alloy, gem × rune, chord × weather, five signature × craft-board pairs,
hybrid → downstream, brew × combat, warren × relic, anomaly × bestiary,
museum × expedition.

**Three rules make it safe:**

1. **A bonus for having both, never a requirement to have both.** Nothing is
   gated behind one. A test walks the whole engine source asserting nothing
   reads `confluences.found` to *permit* anything — a confluence may only add.
2. **Discovered, not announced.** The first time it holds it writes itself into
   *Your own margins* in the Journal — the player's notes beside Sable's.
3. **It pays only while it holds.** The note stays; the bonus stops. That makes
   a confluence something you arrange on purpose, not a trophy you banked.

Sim-verified in `scripts/confluence-verify.ts`: the loop closes on a running
engine, every confluence is reachable, a player who ignores a system loses
nothing, and the whole layer at once is worth at most +40% on one bucket.

**Save v13** — discovery is a record of play, so it belongs in the save beside
the other Codex lists. An established save starts with none found and
re-discovers them the moment its conditions hold, which is correct: the
confluence was always true, nobody had written it down.

### Part 1 — expansions, and what was cut

| System | Was | Now | Note |
|---|---|---|---|
| Challenges | 8 | **16** | each takes away exactly one thing |
| Grid modules | 8 | **16** | nine cells is now a choice, not a filling-in |
| Relic affixes | 17 | **30** | multiple affixes per bucket, so fusion has real winners |
| Museum cases | 12 | **20** | ceilings re-checked against the real pools |
| Anomalies | 12 | **24** | scenes with a decision, not payouts with names |
| Hireling traits | 10 | **20** | a SECOND trait at level 5, derived — no save cost |

**Every new challenge seal is enforced at a real choke point** — `sealDrops`,
`sealCollapse`, `sealFlee`, `sealOffline`, `sealWeather`, `sealPurity`,
`depthCap`, `regenMult` — and each has a test that drives the engine and
asserts the world CHANGED, not that a flag reads true.

**Cut, and why:** brews, axioms, progressions, strains, titles and warrens were
NOT expanded. The counts were reachable; the ideas were not. Twelve brews that
each do something and twelve more that are "the first twelve but larger" is a
worse system than twelve. Axioms in particular are the strictest case — the
brief says *rule rewrites only, and if it is a multiplier in a costume, do not
ship it* — and after the eight new challenge laws there was no honest twelfth
rule left to rewrite. **Padding is worse than sparse**, so these stayed sparse.
Part 2 was protected as instructed; these are where the budget came from.

### The pillar-5 checker was wrong, and is now stricter

The Compendium's spoiler check used `corpus.includes(name)` with a
three-strikes threshold. Both halves were wrong. Substring matching fired
INSIDE longer words — the Chord "The Press" matched inside "The **Press**ured
Fire", the rune ordering `ur-kel` inside "th**ur-kel**" — and the threshold
existed only to absorb those false positives, which meant it would also have
absorbed two REAL leaks.

It now matches on word boundaries and is a **tripwire again: one genuine leak
fails the build.** The single real collision (a Chord named "The Grammar" vs
the runes page correctly saying order is the grammar) is a named, documented
exemption rather than a tolerance band. A negative test confirms it still fires
on a real chord name, stays quiet on clean mechanics text, and does not fire
inside a longer word.

### Two of my own tests were passing for the wrong reason

Worth recording, because they are the same disease as the bucket hole:

- A challenge test called `engine.applyOffline?.(...)`. **That method does not
  exist**; the optional chain made it a no-op and the assertion passed because
  nothing happened. It now calls the real function and asserts the UNSEALED
  case pays, which is what makes the sealed case mean anything.
- The confluence verifier measured a bucket's "before" value *after* setting up
  the condition, so it compared an active bucket with itself.

Both were caught by asking what the green actually proved. That question is the
only reliable defence against this class, and it has now paid for itself four
times in this project.

### Verification

449 tests green (was 400) · `tsc --noEmit` clean · copy-coverage 35/35 ·
compendium-coverage **332 entries**, no gaps, orphans or spoilers ·
confluence layer sim-verified · Compendium re-verified in a real browser with
search resolving and **0px overflow at 380px** · production build clean.
**Built locally; not deployed, by instruction.**

---

## A.26 THE SMITHING DEPTH (Phase 16 build record)

The measurement that shaped the whole phase, taken first
(`scripts/material-audit.ts`):

> **49 of 132 materials had ZERO consumers.** Not one recipe, catalyst, brew,
> contract or museum case asked for them. All 49 were mineable; 20 were
> commons; the Hollow alone accounted for 16. They dropped, they stacked, and
> the game never once wanted them.

That is the real reason the chain from "material in the Hold" to "tool in your
hand" felt thinner than 132 materials implies. It was thinner: 83 materials
wide, not 132.

**After this phase: 18 orphans of 139.**

### Part 1 — THE REFINERY (the protected half)

One room, three benches.

**REFINING** makes purity workable. Three units of a band cook down to ONE of
the band above, landing at the BOTTOM of the new band — refining is worth doing
and never better than finding a clean stone. The two lost units come back as
Slag, which is itself an input.

The point is the anti-treadmill rule this project has held since relic fusion:
**a bad roll is now slow rather than wasted.** You never have to re-mine a seam
to fix luck.

**TRANSMUTATION** makes the materials a graph. **18 chains**, each taking two
materials and giving a third, discovered by trying. A miss costs the inputs and
pays Slag, so the discovery verb has a price and never a dead end.

Order does not matter — a chain is a SET. That is deliberate and it is the
reason the system is not the rune wall again: two systems that both take two
inputs must not both care about sequence.

**The rule that makes the chains worth shipping, enforced by a test:** every
chain consumes at least one material that had no consumer. The test rebuilds
the consumed-set *without* the chains file, so the chains cannot vouch for
themselves. It caught a real violation while I was writing it — `slagToClay`
originally used two already-busy materials and added no reach. The content was
fixed, not the rule.

**BYPRODUCTS.** Nothing here is a pure sink: refining and transmuting throw off
Slag, salvage throws off Salvage Dust, and both are inputs.

### Part 2 — SALVAGE

Fifteen tiers of dead inventory now have an exit. A tool breaks back into about
half its recipe **at the tool's own purity** — a tool made of clean stone
salvages into clean stone — plus residue. The decision is whether to pay to
draw the runes and gems out intact, or take the extra material and lose them.
The game refuses to break your equipped tool or your last one.

### Part 3 — TEMPERING

The brief's constraint was the interesting part: it must not be runes again.

- **Runes** are a positional grammar — sequence and adjacency, order is meaning.
- **Alloys** accumulate — slot three in, get three effects.
- **A TEMPER IS A CONDITION.** It pays when your situation matches it and idles
  when it does not.

Six media, and the conditions are deliberately different SHAPES of situation —
a carried signature, a live gauge (shaft heat), a place (the deep half of a
shell), and a weather state — so the choice is never "which shell am I in" six
times over. **Lumen and Frost are exact inverses**: one wants eventful weather,
the other wants the quiet seasons, and a test asserts they can never both hold.

An idle temper is weak, never dead. Re-tempering is CHEAPER than the first
quench, because you are meant to change your mind when you move. **There is no
roll anywhere in it** — a temper is chosen, so there is nothing to farm and no
bad outcome to re-roll away.

### Part 5 — SEVEN new materials, each for a new ROLE

The brief's bar was "only where a new one does a job no existing one does".
Seven qualified, all of them WORKED (made, never found): Slag and Salvage Dust
(byproducts), Binding Clay and Truesilver (transmutation intermediates), Temper
Ash (the quench medium), Void Residue and Law Filing (deep intermediates).

`worked: true` keeps them out of every drop table, and `materialsOfShell` now
excludes them — otherwise they would have shown up as Loam ore in the Crucible's
catalyst list, in merchant stock, and in the Compendium's shell filter. The
existing materials test caught that the moment I added them.

### Confluences extended

The brief named three and they were the natural fit: **temper × signature**
(a tool cooled in the medium of the ghost you carry), **rune × temper**
(letters that set INTO the metal rather than onto it), and **gem × alloy**.
Plus **refinery × forge** — a tool forged out of what an older tool used to be.
20 confluences now, all re-verified.

### What I cut, and why

**Part 4 entirely** — rune slots, rune extraction, gem cutting, gem fusion,
heirloom history. The brief named it the first cut and I am taking it, but the
honest reason is not only budget: Parts 1–3 already added three new verbs to
the smithing chain (refine, transmute, temper) plus salvage. A fourth and fifth
axis on the same tool in the same phase would arrive undigested. Rune extraction
in particular is now *partly* done — salvage recovers runes if you pay — and the
rest deserves a phase where it is the headline rather than the tail.

**Tool variants within a tier** — cut, and this one I want to flag properly. The
brief is right that a tier-VIII pick should not be one item, and the
Deepcutter/Wardenbreaker split proves the shape. But doing it across fifteen
tiers means authoring ~40 recipes and re-checking the curriculum law (every
wall-tool input mineable in the wall's own shell at or before the wall) for
every one. Half-doing it would leave the ladder lopsided — some tiers a choice,
some not — which is worse than the current uniform state. It wants its own pass.

**Input materials shaping the output** — cut for the same reason: it is the same
work as variants, approached from the other side.

### Verification

481 tests green (was 449) · `tsc --noEmit` clean · copy-coverage 36/36 ·
compendium-coverage **348 entries**, no gaps, orphans or spoilers — and the
pillar-5 checker now guards transmutation chains too, both by NAME and by PAIR
(two materials named within one sentence of each other would be handing over a
recipe) · confluence layer re-verified at 20 · Compendium re-verified in a real
browser with **0px overflow at 380px** · production build clean.
**Save v14.** Built locally; **not deployed**, by instruction.

---

## A.27 MATERIALS WITH SOULS (Phase 17 build record)

The player critique this phase answers, in full:

> "There's a lot of materials but they feel soulless. All you do is randomly get
> them when you mine, they sit in inventory, and you buy tools with them. It just
> exists, it has no real meaning. And if the first stages are boring then the
> rest are boring."

Phase 16 made the material CHAIN deeper and never touched this. A material was a
rarity tier and a purity roll — 139 materials that were one material with 139
names. This phase gives each a character and makes forging the act of combining
them.

### Part 1 — MATERIAL TRAITS (the foundation)

**Ten traits, and every one of the 139 materials carries two or three.** Keen,
Tough, Dense, Light, Springy, Brittle, Charged, Warm, Hollow, Trueseated. Each
is one plain sentence a player can have an opinion about.

The four rules, each a test in `traits.test.ts`:

- **LEARNABLE** — one sentence per trait.
- **TRADEOFF-SHAPED** — every trait helps at one thing and hurts at another. A
  test asserts it; it caught Trueseated shipping as pure upside, and I gave it
  the honest cost (rigid, low flex). This is the rule that keeps a common
  relevant at hour 80: a keen common still out-edges a tough rare, and a test
  asserts every trait lives at more than one rarity.
- **VISIBLE** — traits show in the Hold, the Compendium and the bench. The one
  place pillar 5 does not apply, because a trait is a property, not a solution.
- **INTERACTING** — **ten trait pairs** (shatters and songs) are the discovery.
  A tool carrying both halves of a pair fires it. These are NEVER in the
  Compendium — guarded by name and by sentence in `compendium-coverage.ts`.

The two materials the brief named are matched exactly: Loamiron is keen and
springy ("soft but takes an edge"); Umberjade is brittle and charged.

### Part 2 — TOOLS FROM PARTS (the headline)

**A tool is a HEAD, a HAFT and a BINDING**, each a material you choose, each
reading DIFFERENT traits: the head reads edge and force, the haft reads heft and
cadence, the binding reads grip and hold. The archetype EMERGES — a keen head on
a light haft is a fast Pick, a dense head on a dense haft a heavy Cleaver.

- Same tier, different composition, meaningfully different tool.
- Parts replaceable one at a time (`replacePart`).
- **The head gates the tier** — it meets the rock, so its material decides the
  hardest wall the tool can break. The curriculum law, restated. Haft and
  binding are free.
- Variants are emergent, so the ladder cannot go lopsided — the Phase 16
  objection, dissolved. Every tier gets composition choice for free.
- **Salvage recovers the parts** — the head is spent meeting the rock, the haft
  and binding come back whole at their own purity.

**The Phase 16 tool-variants cut is reversed here, as the brief instructed.** My
objection was ~40 authored recipes and a lopsided ladder; that was true for
authored variants and false for composition. Authored once, every tier is a
choice.

**This reworks a shipped axis and touches balance in shells I-VII.** Sim-verified
in `scripts/parts-verify.ts`: a NEUTRAL build lands within 0.76-1.05× of the old
recipe midpoint at every tier (`COMPOSITION_NORM = 1.12` holds the ladder),
chip-max and strike-max are 0.87-0.89 symmetric, specialising pays 2-3×, and the
head gate holds so composition never skips a wall. Pillar 2 is untouched: chip
multiplies dustYield, bounded by regen.

**Migration (save v15) loses nothing.** Every existing tool — named, socketed,
inscribed, and above all every heirloom — gains a composition derived from a
FROZEN snapshot of its recipe's inputs, and keeps its stored stats. A test forges
"Old Faithful" through the migration and checks its name, heirloom flag, socket
and stats all survive.

### Part 5 — THE SHELL I ACCEPTANCE TEST

The brief made this the pass/fail bar, and it passes **in a real browser**
(`scripts/shell1-test.ts`): from Loam materials alone, a Loamiron Pick (chip
×2.84, strike 5.2) and a Duskflint Cleaver (chip ×1.49, strike 8.7) — a 1.91×
chip swing and a 1.67× strike swing, different names, traits visible on the
bench. Two Tier-II tools that feel nothing alike, and the player can read why.

### Confluences extended

The three the brief named: trait × signature (a charged tool + the polarity
ghost), trait × temper (a warm-trait tool ember-quenched in a hot shaft), trait
× weather (a charged tool in a magnetic storm). 23 confluences now, re-verified.

### Step Zero — the orphan count, honestly

The narrow audit still reports **18 of 139 materials with no NAMED consumer** (no
recipe, catalyst, brew or case demands them by id). But the parts system changes
what "orphan" means: **every material is now a valid forge part** — any can be a
haft or binding, and any can head some tier — so none is truly unwanted, and
every one has a trait profile that gives it a character. The 18 are not orphans
any more; they are materials the forge accepts without naming. I am calling them
what they are rather than inventing recipes to pad the audit green.

### What I cut, and why

**Part 3 (crafting as an act — hand-craft vs delegate, rune carving, casting
runes) and Part 4 (sound and trait-driven visuals) are cut.** The brief named
them the first and second cuts and made Parts 1, 2 and 5 the phase; those are
done and verified, and I stopped at the green checkpoint rather than half-build
two more large systems.

Two honest notes on the cuts:

- **Sound (Part 4) is the one I most regret cutting**, because the critique
  explicitly ties early boredom to everything after it, and a game silent for
  seventeen phases is a real gap. But sound done badly — a global audio context
  fighting `prefers-reduced-motion`, autoplay before opt-in — is worse than
  silence, and it deserves a pass where it is the headline, not the tail.
- **Rune casting from materials (Part 3)** now has a natural home: traits exist,
  so a cast rune could read its inputs' traits. That is a better version of the
  feature than I could have built before this phase, which is a reason to wait.

### Verification

505 tests green (was 481) · `tsc --noEmit` clean · copy-coverage 36/36 ·
compendium-coverage **353 entries**, no gaps, orphans or spoilers (trait pairs
guarded by name AND by sentence) · parts balance sim-verified across shells
I-XV · the Shell I test passes in a real browser · confluence layer re-verified
at 23 · production build clean. **Save v15.** Built locally; **not deployed**.


## A.28 THE HAND AND THE COLUMN (Phase 18 build record)

Two headlines. **Crafting became a process** (protected — it had been cut once,
so it went first), and **the shaft became a place**. Both shipped.

### Part 1 — CRAFTING IS A PROCESS, NOT A PURCHASE (protected)

The ruling this phase enforces: making a thing is something you DO, in stages,
each stage a real interaction and a DIFFERENT verb — never four timing bars with
different labels. Built as ONE system (`workbench.ts` headless + `workbenchActs.ts`
+ `CraftWorkbench.tsx`), four acts sharing a staged-job model, so a fifth act
later is content, not engineering.

The five rules, each a property test in `workbench.test.ts` (15 tests):

- **STAGED, NOT INSTANT.** A `CraftJob` runs stage by stage; the piece is
  produced on the last. `ACT_STAGES` gives each act its stages: forge heat→
  shape→set, carve steady→stroke, cut read→cleave, cast mix→pour.
- **DIFFERENT VERBS.** The UI routes each stage to its signature interaction, and
  they were built to feel unlike each other: FORGE is FORCE (press-hold to build
  a strike, release to match the metal; three strikes), CARVE is TRACE (drag
  along the rune's line in one steady pass, an SVG path), CUT is PLACEMENT (set
  facet planes on a dial, then choose how the stone reads), CAST is PROPORTION
  (choose the mix; the traits decide the rune). A shared hold-gauge serves only
  the lighter supporting stages (heat/set/steady/pour), never as the whole act.
- **TRAITS CHANGE THE PROCESS.** `stageProfile(stage, traits)` returns the
  difficulty the UI renders AND the numbers that feed quality — so the doing and
  the result can never disagree. Brittle is unforgiving and fragile; tough
  forgives; springy fights the shape back. The bench says which before you start.
- **QUALITY IS EARNED, NO RNG.** The UI produces one 0..1 execution per stage;
  `jobQuality` is their weighted sum; `craftsmanship(q)` maps it to a bounded
  **0.88..1.16** on tool stats — skill pays ~+9% over delegating and never
  dominates (pillar 2 safe: chip stays regen-bounded). Same inputs, same play,
  same result — a test asserts determinism.
- **FAILURE COSTS MATERIAL, NEVER THE ITEM.** Nothing is consumed until FINISH,
  so setting a job down mid-way is free. A botched carve burns its runes and
  fouls the surface; the tool is untouched (the softened-rune ruling, generalized).

**Delegation is the fourth pillar, and it is SOCIAL.** Every act hands to a named
NPC — Marrow forges, Old Quill carves, Ilma cuts, Ossian casts — for a result
that is safe, guaranteed, and a shade short of a clean hand-craft. `delegateQuality`
rises with standing (`rep/250`), so who you know is part of the price.

**CAST is the trait-only act, and the newest discovery system.** Eight recipes
(`CAST_RECIPES`) map a mix's trait signature to a rune; you find them by trying,
and they write into the Codex. Pillar 5 holds: the Compendium says casting exists
and never lists a mapping — guarded mechanically in `compendium-coverage.ts` by
recipe NAME and by any two input traits named together in concept prose.

Every interaction is one-handed (pointer/touch, no two-finger anything) and every
one offers a STEADY HAND button — a single competent craft without the tactile
challenge. That button is the `prefers-reduced-motion` path AND the accessibility
path at once, so nobody is shut out.

### Part 2 — THE SHAFT

The column stopped being a one-way chute. `shaftSys.ts` adds three things on one
`state.shaft` slice (`reached`, `rail`, `scars`), verified by `shaft.test.ts` (10
tests) and `scripts/shaft-verify.ts`:

- **GO BACK UP YOUR COLUMN.** `state.depth` is now a working position you can
  `climb` to any depth you have cleared this run — up or down, free. Re-treading
  cleared rock grants no XP and counts no descent (so climb+descend cannot farm);
  only NEW ground past `reached` pays the locked `descendCost`. Income is still
  the face at your working depth, so climbing shallow earns LESS — going up is
  access, never a farm.
- **INFRASTRUCTURE SURVIVES COLLAPSE.** A RAIL, laid per shell with Cores,
  DISCOUNTS re-descent to railed rock by half and outlives the cave-in when face
  upgrades reset. It is the "return to peak" after a fall.
- **THE COLUMN REMEMBERS.** Scars — floods weathered, Wardens felled, the floor
  once broken through — are logged at their depth. The Shaft view (`ShaftPanel.tsx`,
  an SVG cross-section, O(walls+scars) not O(depth)) draws them alongside the
  strata gradient, hardness walls, your record, the rail, and a "you are here"
  lamp you tap to move. A long-running player reads their own history off the
  wall without a legend.

**THE RISK, SIM-VERIFIED.** The brief warned that infrastructure could destroy the
Collapse loop. `scripts/shaft-verify.ts` proves against the real engine formulas
that it does not, and reports the numbers:

- The cost of setting a NEW record (peak→peak+1) is **bit-identical** railed or
  not, at depths 40/80/120/200/300 — the rail never touches new ground, so the
  loop's floor is untouched.
- With a full rail to peak, re-descent costs **exactly 0.5×** at every depth — a
  flat, non-compounding **2.00× cap** on recovery speed, never instant, never
  unbounded.
- With income pinned at the field ceiling (pillar 2, the fastest the loop can
  legally turn), railed Cores/hour is **exactly 2.00×** un-railed at depths 40/80/
  120 — a bounded convenience, no blowup.

Pillar 2 holds throughout: revisiting a cleared depth is a door, never a second
till. A Collapse (and a flood, and a Breach) resets the run's cleared floor; the
rail alone persists. Collapse now pays on the deepest point reached this run, so
climbing up to fetch something never costs you the fall.

### What I chose, and what I did not build

- **The Shaft shows the CURRENT shell's column**, not a stacked tour of all seven.
  The per-shell shaft is where you act (climb, rail, descend), and it already
  passes the "read your history" test — walls, floods, wardens, rail, record. A
  cross-shell grand tour is a view-only extension, not this phase's engineering.
- **One infrastructure type (the rail), not four.** The brief listed rails, lifts,
  waystations, caches. The rail is the sim-critical mechanism — it touches the
  loop — and it is built cleanly and proven bounded. Caches (a stored trickle)
  were left unbuilt on purpose: a capped store is pillar-2-safe but it is a second
  income surface to reason about, and it earns its own pass rather than riding in
  as a footnote. The `station` scar already marks a rail head, so the vocabulary
  is there for more.

### Verification

**538 tests green** (was 510) · `tsc --noEmit` clean · compendium-coverage
**355 entries**, no gaps, orphans or spoilers (cast recipes now guarded by name
AND by input-trait pairing) · confluence + parts sims re-verified · the Shaft
loop sim-verified (marginal cost untouched, recovery capped at 2.00×, cadence
bounded at the ceiling) · Shaft view **frame mean ~5.6ms** at 380px, **0px
overflow**, no console errors · every craft interaction has a Steady-hand
reduced-motion path · production build clean. **Save v17** (v16 Workbench, v17
Shaft; neither orphans — old tools read as craftsmanship 1.0, an established save
seeds `reached` from live depth and starts with no rail, so descent is unchanged
until the first track is laid). Built locally; **not deployed**.


## A.29 THE COLUMN IS A PLACE (Phase 19 build record)

Phase 18 built the Shaft's substrate — the view, the strata, the scars, the rail —
and proved a re-traversable descent does not break the Collapse loop. This phase
puts the things in the column that it was built to hold, and finishes it. All five
parts shipped.

### Step Zero — the frame-time number was not comparable

Phase 18 reported the Shaft at ~5.6ms against Phase 13's 20.4ms. Those are not the
same measurement: Phase 13 measures Shell VII, 4× CPU throttle, 24 drills, 120
relics, the Chamber running; the ~5.6ms was a light save. Re-measured under the
HEAVY load with a full 90-scar, fully-railed hollow column, the Shaft was **21.1ms
mean, 64.6ms p95, 95.3ms worst** — right at the line and about to get heavier.

So the render was fixed first: the cross-section is now a `memo`'d child fed
PRIMITIVE props, computed in a `useMemo` keyed on change-signals (never the face
cells), so the 12Hz regen publish — which changes nothing on the column — skips
its whole reconciliation. Rail rungs are capped at ~22. That dropped it to **16.5ms
mean, 35.7ms p95** — the periodic spikes gone, and headroom for the additions. A
second pass late in the phase memoised `MaterialIcon`/`GemIcon` (used app-wide),
which removed the tail hitches the caches panel had reintroduced.

### Part 1 — CACHES + LIFTS (protected)

**Caches** (`shaftSys.ts`): storage sunk at a depth with Cores, capped at four per
shell and 25 of one stone each. A cache MOVES material in space (Hold → the deep)
and never changes the count, so it is a convenience, never a yield. It SURVIVES
Collapse; a Breach surfaces its contents to the Hold rather than stranding them.

**Lifts**: the rail carries a car. Fitted with Cores, the lift rides you to the
rail head in one action, paying every depth its (rail-discounted) toll on the way
and stopping dead at the rail head. It is BATCHED DESCENT — `scripts/shaft-verify.ts`
runs it against tapping `descend` the same path and they spend to the coin (1857.2
vs 1857.2): the lift is convenience, not a shortcut, and never touches new ground.
I chose this over player fast-travel because free climb already covers within-run
movement, and any post-Collapse jump onto uncleared depth would be the loop-break
the brief warned about.

### Part 2 — CURING (protected, the payoff for caches)

Some stones improve if you leave them alone. `curing.ts` holds seven recipes across
the first five shells — ochre reddens, sap becomes amber over three real days —
each turning a mined stone into one of seven new CURED materials (`worked: true`,
so they never drop). The rules, each a test in `curing.test.ts`:

- It **converts, never produces**: a batch of N cures into N of the result, better
  in character and never more in count. A test asserts every recipe holds N→N. No
  path increases quantity, and nothing mints currency — curing is upside on
  patience, not a second income rate. Pillar 2 untouched.
- **Nothing is missable or spoils**: a finished cure waits forever (a year is
  bit-identical to a week, tested), and pulling a stone early returns exactly what
  you put in, uncured.
- **Discovery, not a list** (pillar 5): which stone cures into what, and how long,
  is found by leaving things at depth and written to a Codex. The cured material's
  Compendium entry — flavour and all — stays SEALED until you make it, and the
  coverage checker guards a concept page naming a cure's source-and-result together.
- The **depth requirement** ties curing to the column: a stone needs the deep to
  change, so the cache must be sunk deep enough.

One interpretation flagged: the deposit screen reveals WHICH held stones are
curable (not into-what), because a real-time system that let you gamble three days
on a blind deposit would violate "absence is never punished." Curability is shown
as a property, like a trait; the outcome remains the discovery.

### Part 5 — EXPEDITIONS FROM DEPTH

A crew can now set off from an installed point on the column — a cache — instead of
the surface. A deeper departure starts nearer the worlds below, so it reaches a
DEEPER left-behind shell (indexed by how far down it left) and returns with better
odds of a relic. It changes WHICH world and the luck, never the income — the same
pillar-2 guarantee expeditions always had. A departure-point selector on the gate
panel; `fromDepth` threads through active → ready → claim, optional so no save bump.

### Part 4 — THE UNMINEABLE (the cheapest, and the one I would have cut last)

One per shell, at a fixed depth, that no tool has ever marked (`shellWalls.ts`,
`SHELL_WALLS` × 7). It is the wall of the shell — the premise of shells-inside-
shells, made somewhere you can lay a hand on it. It does three things, each a test:

- It **reads you**. The deeper you have been, the more Recursions you have run, the
  more Axioms you have written — the more of it is legible. A mirror, not a reward.
- **Sable's marks are on it**, and they return in a DIFFERENT ORDER each Recursion
  (rotated by the count) — her ending is that the world resets and the writing
  survives, so her marks belong on the one thing that persists.
- **Axioms act on it**: every law you have written has reached this deep, and THE
  FIRST WORD (the Axiom named for her cutoff line) reads the whole writing at once.
  A law is the only thing that has ever changed the wall.

Reading it writes no state (tested); the Compendium says almost nothing.

### Part 3 — EXCAVATION (the most expensive, built lean and honestly scoped)

Objects too big to chip (`excavations.ts`): eight hand-authored sites across the
first four shells — a fossil spine, a sealed door, a stopped engine, a great seed,
a living arch, a buried lens — at fixed depths, like small Warrens. You clear
AROUND them a shift at a time, and only ONE shift per visit: working a site sets a
depth-stamp that moving off (climb or descend) clears, so you finish a big dig by
returning to it as you pass — the Shaft's own climb-and-return, given a reason.
Each shift reveals the SHAPE; the last reveals the NAME and yields a one-time
keepsake (scrip, renown, or a relic) — never income, never repeatable, and the
progress survives Collapse. The reveal is the reward. Tested in `excavation.test.ts`.

**Scoped honestly**: eight sites across four shells, not a full handful across all
seven. The system is content-not-engineering to extend (add a row to the registry),
and the brief named Part 3 the first cut if short — this is the lean, real version
of it rather than the full spread, and it is flagged as such so a later phase can
finish the set.

### Verification

**573 tests green** (was 538) · `tsc --noEmit` clean · compendium-coverage **365
entries**, no gaps/orphans/spoilers (cures guarded by source-and-result; cured
materials sealed until discovered; three new concept pages) · confluence + parts
sims re-verified · the Shaft loop re-verified WITH all infrastructure installed —
new-record cost bit-identical, recovery capped at 2.00×, the lift spends exactly
what tapping does, caches/curing mint nothing · Shaft view under Phase 13's HEAVY
load **~19ms mean, ~14ms median, ~42ms p95, ~65ms worst, 0 frames >100ms** · **0px
overflow at 380px** · production build clean. **Save v18** (all Phase 19 slices
default-empty; an established save is unchanged until the first cache is sunk).
Built locally; **not deployed**.


## A.30 THE SHAFT IS A PLACE (Phase 20 build record — presentation rebuild)

The Shaft shipped in Phases 18–19 as an SVG schematic: a flat brown rectangle,
axis ticks at 0/25/50/75/100, horizontal rules with text labels, hollow circles
for caches. It read as a spreadsheet chart of a mine. Every other screen in the
game renders as somewhere you ARE; this one rendered as a graph of somewhere you
had been. This phase rebuilds the VIEW — **no mechanic changed, no balance
changed, the save schema is untouched (still v18)** — into a place.

### What it is now

- **A full takeover.** Opening the Shaft replaces the Face: the 6×6 grid gives
  way to the column in the same hero position, taller on phone (66vh). Both Pixi
  canvases stay mounted and CSS-hidden — a renderer destroyed mid-flight poisons
  Pixi's shared batch pools, the documented reason the Lattice stays mounted, so
  the Shaft obeys the same discipline and pauses its ticker while hidden.
- **A pixel cave in Pixi** (`ShaftView.ts`), the same visual language as the Face:
  warm lamplight on cold stone, per-shell palettes echoing the Face themes. Not
  SVG, not divs, not a chart — the same world, seen sideways.
- **One hand-carved channel**, walls wandering by deterministic per-depth noise,
  flecked with the tool marks of how you got down, scrolling through the shell's
  full depth.
- **Darkness is the medium.** Everything outside the shaft is black. The lantern
  lights the block you stand on and falls off; rock you cleared this run glows
  faintly warm, rock dug in a past run reads cold, and below your record is
  entirely unknown — a thin thread of light through an enormous dark.
- **Markers are things, not labels.** A hardness wall is a seam of denser stone
  across the channel; a cache is an alcove cut in the wall with a stone in it
  (bright when the cure is ready); the unmineable is a smooth face light slides
  off; the rail is track laid down the wall; the floor is the Breach, a void that
  falls away; excavations are big shapes half-exposed; scars are marks on the rock.
- **Interactive on the place itself.** Tap a cleared depth to travel there (the
  lantern eases along the column); drag to look; tap a marker for its detail sheet
  (deposit/collect a cure, read the unmineable, work a dig); a "Here" sheet holds
  the actions for the depth you stand on (sink a cache, lay rail, fit/ride the
  lift). Marker taps are row-based — tap the DEPTH, not a 15px alcove — because
  precise poking on a phone is unkind. Climb/Descend are a HUD row over the canvas.

The old panel's paragraph moved to where prose belongs: the system's Layer-1/2
copy (`systemCopy.ts`) and the Compendium concept. The view no longer needs a
sentence to explain it.

### Every mechanic, exactly as it was

Rail, caches, curing, the lift, climb/descend, the unmineable, excavations, and
expeditions-from-depth all dispatch the SAME engine actions the old panel did —
`scripts/shaft-verify.ts` still proves the lift spends exactly what tapping
descend spends. The rebuild deleted `ShaftPanel.tsx`/`ShaftCaches.tsx` and routed
every one of those dispatches through the new canvas HUD; the reachability test
confirms none went dark.

### The number, with its load

Measured under Phase 13's HEAVY load — Shell VII, 4× CPU throttle, 24 drills, 120
relics, the Chamber running, a fully-railed 90-scar Hollow column with caches —
the Shaft is **9.7ms mean / 7.7ms median / 27.9ms p95 / 40.6ms worst, 0 frames
over 100ms**, against the Dig face's 13.3ms on the same machine. The Pixi rebuild
is FASTER than the old SVG (~19ms) and faster than the Face itself: the static
column is drawn once and repainted only on a change-signal (a step, a scar, a
rail), while travel just eases a lamp sprite. The palette + noise math lives in a
Pixi-free `shaftThemes.ts` so a headless test pins that every shell has its own
channel colours — no silent Loam fallback in the Hollow.

### Verification

**576 tests green** (was 573; +3 for the shaft palette/noise) · `tsc --noEmit`
clean · copy-coverage 37/37 · compendium-coverage 365 entries, no gaps/orphans/
spoilers · shaft-loop re-verified (the lift is still batched descent to the coin)
· frame **~9.7ms mean, 0 frames >100ms** under HEAVY load · **0px overflow at
380px**, touch targets ≥44px, the column fully legible with `prefers-reduced-
motion` (static lamp, no scroll easing) · production build clean · **save v18,
unchanged** — this touched no engine state. Built locally; **not deployed**.

## A.31 THE CONSIDERED HAND (Phase 21 build record — quality-of-life, no new systems)

A phase with a single question behind every item: *would a player notice, and be
glad?* No new currencies, shells, or craft systems — only the machine remembering
what you already chose, and catching what you did not mean. Six parts, ordered so
the two worth protecting came first and the first cut came last. Nothing was cut:
every part shipped.

### The persistence line (the Phase 11 lesson, honoured)

Bookmarks, notes, blueprints, saved layouts, pins, presets, auto-collapse depth,
the carry mark, and the confirm-spend fraction all ride the save — a single new
`qol` slice, `save v18 → v19` with an `??=` migration that leaves an established
save with every field empty and nothing changed until the player authors
something. `seenSystems` had to be moved once for exactly this reason; a
handwritten note is a far worse thing to lose on a restore. Only the number-format
preference and the ephemeral undo snapshot stay device-local (localStorage and an
in-memory serialize, respectively) — those are device state, not player data.

### Part 1 — EVERYWHERE (protected)

- **Undo**, in the engine facade: a 12-second window that restores a `serialize`
  of the pre-action state (the Decimal-aware clone) for a whitelist of spends and
  crafts. **Never** Collapse/Breach/Recursion/Spiral — those are decisions, so a
  reset CLEARS the snapshot. A toast offers it; the snapshot is spent on use.
- **Confirm-on-big-spend**, relative to holdings and toggleable (Off/½/¾/90%,
  default ¾). Fires *only* on a repeatable upgrade's ×10 or MAX buy that eats the
  chosen share of the bank — never on a single spam-tier tap. Undo has the small
  stuff; the confirm has the drains.
- **Run summary at Collapse** — a logbook page: cores, depth, run length, and a
  ▲/▼ against your last fall (a new `collapse.lastRun` ledger). Auto-collapses
  skip the modal for a quiet toast so an idle run is never interrupted.
- **Number formatting**, toggleable suffix/scientific/engineering, applied through
  a module-level flag every `fmt` reads — so it lands everywhere at once, the
  Compendium and breakdown popovers included, with zero effect on the headless sim
  (default `suffix`).
- **Offline "what you were mid-doing"** — the re-orientation card now lists the
  threads left hanging: unspent skill points, expeditions out or back, a challenge
  underway, caches curing, the Lattice mid-arrangement, a warden still to fell.

### Part 2 — THE HOLD (protected)

- **Auto-refine presets** — a standing rule per material ("keep it refined up to
  *good*"), ticking on a gentle 5-second clock through the ordinary `refine`, same
  loss ratio, same slag: it can only ever REDUCE the count you hold (pillar 2),
  and never touches the field. Gated on the Refinery being open.
- **Pinned materials** — surfaced above the Hold's filter (so a pin survives any
  filter choice) and glanceable on the face home as a compact strip.
- **"What you're short of"** — reads back deficits from tool recipes at or below
  your current tool tier, the ones the Forge already shows. PILLAR 5: it never
  names a material from a recipe you have not unlocked, and says so plainly when
  there is nothing to gather.

### Part 3 — THE FORGE

- **Named blueprints** — save a head/haft/binding composition, recall it to the
  bench, re-forge with whatever stone you now hold (a blueprint is a design, not
  material).
- **Side-by-side** against the tool in your hand — chip/strike/socket deltas, up
  green, down red.
- **Marrow's eye** — the forge-master critiques a build before you spend: a haft
  too soft for its head, a poor grade of stone, a pairing that drags. PILLAR 5: an
  interaction you have not discovered he can FEEL but will not NAME ("something in
  this fights itself"), exactly as the bench preview says "something grinds"; a
  pairing already in the Codex he names, because it is no longer a secret.

### Part 4 — THE LATTICE (the pillar-5 risk, handled)

- **Saved layouts** — remember a board, restore it into empty sockets paying the
  ordinary Motif cost through the normal path (no free boards).
- **Ghost preview** — the most dangerous item, built so it *cannot* leak. Tap an
  empty socket in ghost mode and it reports only what you can already see and
  count: how many stones it neighbours, and the rank total of each contiguous run
  through it. `latticeGhost` never inspects chords at all, discovered or not — its
  output does not depend on discovery state, so an undiscovered chord stays exactly
  as silent in the preview as it is on the board. A test asserts the two are equal.
- **Lock a chord** against a misclick — `removeMotif` refuses to unmake a socket
  that holds a locked active chord.

### Part 5 — COLLAPSE (the one balance change, flagged and sim-verified)

- **Auto-collapse depth** — part of the automation suite, so gated on the Grid
  running and paced by it (reaching the threshold is itself Grid-paced); it only
  automates the tap a good player would make.
- **Compare vs last run** — inline on the Collapse page, plus the run-summary modal.
- **Carry one thing** — the balance change, called out as such. One face upgrade
  keeps its full level through the next fall; non-stacking, and the mark is spent
  on the collapse. `scripts/carry-verify.ts` plays a greedy run to a collapse-ready
  state and measures the single most valuable carry target as a share of the whole
  face-upgrade rebuild: **33.6%** at depth 40 (`blade`), which multiplies
  return-to-peak by ~0.66 → **~13.3% from a 20% base, above the 10% floor** — and
  the share only shrinks in deeper shells (more upgrades, smaller maximum). Before:
  RTP ~20–25% (pillar 6). After, worst case: ~13%. Within band, no constraint
  beyond the "one upgrade, non-stacking" the design already carries.

### Part 6 — THE COMPENDIUM (the first cut — shipped whole)

- **Bookmarks** (a ★ filter and a per-page toggle), **personal notes** on any
  entry (committed to the save on blur), and a **"new or changed"** dot. Bodies are
  static and gating is dynamic, so "changed" cleanly means *newly available or
  never read*: opening a page marks it read at its current signature (2 = open,
  1 = gated); the dot returns if the page later unlocks.

### A pre-existing fix, flagged

The 380px overflow check found a **38px horizontal overflow in deep-game states
(cinder/recursion)** — NOT introduced by this phase. The cause was the Header's
currency strip: in a deep run several long-named coins (Slag, Caravan Scrip)
become primary and, beside the title, pushed the document ~38px wide on a phone.
The strip's own comment claimed it "never overflows"; it did. Fixed minimally —
the title now yields space (`min-w-0 truncate`) so the fixed-width strip and Purse
always fit. All four progression states are back to 0px.

### Verification

**617 tests green** (was 576; +24 new `qol.test.ts` covering undo/carry/auto-
collapse/run-summary/auto-refine/Marrow-pillar-5/Lattice-ghost-pillar-5/lock/
layouts/formatting, +17 the reachability suite now passes for the new actions) ·
`tsc --noEmit` clean · reachability green (every one of the 16 new QoL actions has
a live dispatch site) · copy-coverage 37/37 · compendium-coverage 365 entries, no
gaps/orphans/spoilers · **carry-verify PASS** (RTP floor held) · **0px overflow at
380px** across fresh/ferrite/cinder/recursion, touch targets ≥44px, all new
controls legible with `prefers-reduced-motion` (no animated affordances) ·
production build clean · **save v19** with a defaults-only migration. Built
locally; **not deployed** — the host is the user's to name.

## A.32 THE SHAFT, PROPERLY RENDERED (Phase 22 build record — the renderer, no mechanics)

The Shaft became a place in A.29–A.30, but it still read as a *diagram* of a cave.
This phase is the renderer only — no mechanic, balance, or schema change; every
existing dispatch keeps working and reachability stays green. A reference mockup
set the art direction; its data model (shells as depth bands of one column) was
ignored, because shells are separate worlds reached by Breach.

### The art direction, and how it was hit

Near-black rock, one warm light per shell, gold fracture networks lit from within,
a bright rim at the channel edge falling off fast, a heavy vignette, and engraved
gold chrome. Built in Pixi, procedurally — no raster art (the pipeline has none,
and one painted image can't serve seven differently-lit worlds).

- **Silhouette with grammar, not noise-amplitude** (`shaftGrammar.ts`, pure/
  headless/tested). The channel is a continuous function of depth with EVENTS —
  chambers, pinches, ledges, overhangs, long narrows — rolled on a GLOBAL depth
  grid (not per chunk) so the walls join seamlessly across chunk boundaries.
  Per-style character (soft/angular/organic/crystalline/jagged/void/sacred) sets
  jitter, corner treatment (round vs quantised facets), asymmetry, and the event
  mix, so the seven shells genuinely diverge — Hollow is a wide ragged void,
  Glassmere a tight faceted crystal, Cinder a jagged molten crack — not a re-tint.
  A test pins determinism (a re-entered place is byte-identical) AND divergence
  (the widest shell's channel is ≥40% wider than the tightest; crack density and
  drift differ).
- **Edge shading = the ambient occlusion**, baked. Rock is drawn in 3 distance
  bands from the channel — bright rim, mid, near-black — a painter's-order gradient
  hugging the (wandering) silhouette. No normal maps: the light is the player, in
  a fixed place, so a baked gradient gets ~90% of the look for ~1% of the cost.
- **Crack networks** — the single biggest contributor. Branching polylines seeded
  per chunk, drawn additively in two passes (a wide faint bloom + a narrow bright
  core), brightest where they meet the channel and fading into the mass.
- **Texture**, low contrast, tinted per shell, rotated per tile so the tiling
  never reads. **Depth drift**: channel width, roughness, crack density, palette
  temperature, and grain interpolate continuously over depth — shallow Loam and
  deep Loam are visibly different rock.
- **Chunked infinite scroll**: a chunk is 16 depths, baked ONCE into a
  RenderTexture from the deterministic grammar, cached in an LRU (cap 6) that
  evicts the rest; scrolling is then just moving sprites. Chunks bake with a
  0.75-depth overlap so the seam where two textures meet is covered.
- **The lantern**: a radial additive gradient at the player, fast intimate
  falloff, a 2–3% slow flicker — off under `prefers-reduced-motion`. **Dust**
  (budget 180) and a 0.7× parallax layer are the last, subtle touches, also off
  under reduced motion. **The surface**: a headframe silhouette against a dim
  horizon at depth 0 — the only sky in the game.
- **Engraved chrome** (`ShaftCanvas.tsx`): a depth ruler down the left in gold
  hairlines and serif small-caps, stepping with the Pixi scroll via an `onScroll`
  callback (HTML, so the text stays crisp), plus corner L-ticks. Restrained, not
  glowy. The reference's invented side-panels and stats (Stability, Density, the
  wrong shell-band list) were dropped as instructed.

### Performance

Chunk-bake, never per-frame filters; LRU with a hard cap; a stated particle
budget; mounted-and-hidden, never destroyed under the live Face. Re-measured
under the Phase-13 HEAVY load (Shell VII, 24 drills, 120 relics, the Chamber
running, rail + caches + scars loaded) at a 4× CPU-throttled phone, ON THE SHAFT
TAB (`scripts/perf-shaft.ts`): **~10ms mean / 6ms median / ~41ms p95 / ~70ms
worst, 0 frames >100ms** steady state; a monotonic scroll sweep that bakes and
evicts across every chunk holds ~10ms mean, 0 hitches, and the session LRU hit
rate is ~100% (bakes only on first visit or after an eviction). Within the ≤16ms
guardrail; marginally above the 9.7ms baseline of the simpler A.30 renderer, and
the higher worst-frame is a single chunk bake under throttle, never a hitch.

### Verification

**625 tests green** (was 617; +8 `shaftGrammar.test.ts`) · `tsc --noEmit` clean ·
reachability green (no action changed; the tap-travel still dispatches `climb`) ·
**0px overflow at 380px** across all four states, the takeover full-bleed on
phone, touch ≥44px · **fully legible under `prefers-reduced-motion`** (static, no
flicker, no dust) · perf within budget · production build clean · **no save bump**
— this touched no engine state. Screenshots: the same depth (40) across all seven
shells to show the grammar diverges, plus shallow vs deep Cinder to show the
drift. Built locally; **not deployed**.

### The value/lighting correction (a review pass, same architecture)

The first cut shipped the VALUES INVERTED: a slow screen-wide lantern lit the
rock to a brown wash and the channel read as a black stripe with a gold outline —
a ribbon on a wall, not a hole in the ground. The review was right on every point;
fixed, no architecture change (chunk baking, LRU, determinism, the seam fix, the
perf budget all kept):

- **Rock is near-black everywhere** (`#0a0807`). Light is the exception. The old
  three brown distance-bands became one flat dark field.
- **The lantern is a small intense pool** — a fast falloff that dies to black by
  ~0.3 radius, sized to ~1.8 channel-widths. You see a few depths; the rest is
  swallowed, and the cracks carry the frame.
- **The rim is a baked gradient BAND of lit rock** — non-overlapping additive
  rings, brightest at the very edge, stepping through values into black over a
  short distance. No constant-width vector stroke anywhere.
- **Grain is real** — high-contrast noise (mostly dark, a scatter of bright
  flecks), masked to the rock, pushed harder in the bake than feels right because
  it loses contrast once dark.
- **The grammar reads** — events fire ~1 per 3 depths and swing the width ~3–4×
  (a chamber roughly triples it, a pinch closes it to a slot); the smooth sine
  jitter was cut back so events dominate, not one wave.
- **Cracks are rooted at the channel edge**, brightest at the mouth, dead within a
  short distance — many more, much shorter, a two-pass additive bloom+core reading
  as light leaking out of the hole through fractures.
- **Depth drift is aggressive** — depth 5 Loam (wide chamber, sparse cracks, light
  grain) and depth 140 Loam (a tight fractured slot, heavy grain) are obviously
  different rock at a glance.
- **The headframe is a real silhouette** — an A-frame derrick, the winding wheel, a
  hoist house with one lit window, spoil heaps, solid black against a dim horizon
  glow. The only sky in the game.

Re-verified: **625 tests green**, `tsc` clean, **0px overflow at 380px**, reduced
motion static, production build clean, and perf **9.74ms mean / 0 frames >100ms**
under heavy load. Screenshots re-taken: all seven shells at depth 40, plus depth 5
vs depth 140 in Loam.

### The stone-texture pass (review: "the rock has no texture")

The rock was still a smooth gradient — the review was right. Fixed:

- **Real stone tiles, procedural, at boot** (`makeStoneTextures`): three seamless
  512px greyscale tiles, each layering a wrapping value-noise COARSE BLOTCH ×
  MID GRAIN × FINE SPECKLE, then dark SCRATCHES and PITS stamped on top. High
  contrast — the raw tile looks almost too noisy on its own, because it gets
  eaten once composited near black.
- **Applied by MULTIPLY** over the rock only, so the grain, blotch and pits read
  IN the lit band and fade with it into black — dark rock with texture in the lit
  stone, exactly the value structure.
- Verified at 100% zoom: grain, blotching and pitting are visible in the lit band
  beside the channel, fading into the mass.

> **Superseded by the value-inversion pass below.** The multiply began as a single
> per-frame world-space overlay; when the channel became the bright light source
> it had to move BACK into the per-chunk bake (over the rock only) so it can never
> darken the channel. It is a boot-time tile plus one multiply draw per chunk bake
> — cached, so still no per-frame cost.

**A note on the perf numbers, honestly:** while iterating I saw the shaft measure
~47ms mean, which looked like a regression. It was the measurement MACHINE, not
the code — on that same loaded machine the **Face** (unchanged, the shipped
baseline) measured **62ms**, i.e. the shaft rendered FASTER than the Face, and an
A/B with the stone overlay toggled on/off was identical (47.3 vs 46.7ms), proving
the texture is free per-frame. Everything was uniformly ~5× inflated by a long dev
session with several servers and browser instances open; the representative number
on an unloaded machine is the **9.74ms** above. The stone texture is a boot-time
generation plus one multiply draw a frame — no per-chunk cost, no regression.

### The value-inversion pass (review: "the channel is the light source")

The structure was still backwards: the channel was painted BLACK and re-blacked
last, the rock was a near-flat near-black field with an additive rim, and the
cracks were sparse. The review gave exact numbers; they were implemented, not
interpreted:

- **THE CHANNEL IS THE LIGHT SOURCE.** It is now filled, painted LAST so it stays
  clean, with a warm vertical gradient — loam `#6b3a10` (wall contact) →
  `#c47a2a` (mid) → `#ffd89a` (centre), drawn as six nested bands that FOLLOW the
  channel's varying width, so it reads as light pouring up the shaft and is the
  brightest region in the frame at all times. (`channelStops` in `shaftThemes.ts`.)
- **The rock is graded by distance from the edge and NEVER pure black:** opaque
  bands `#4a3520` (0-8px, the lit lip) → `#2e2115` (8-25) → `#1a130c` (25-60) →
  `#0e0a06` (60px+), drawn far→near so the brighter lip sits on top. It stays
  visible across the whole viewport. (`rockBands`.)
- **The stone grain moved back into the per-chunk bake** (a multiply at ~0.68,
  fine tileScale 0.42) so it textures the rock — clearly breaking up the bands —
  without ever touching the bright channel painted over it.
- **Cracks are now a DENSE web** (`crackNetwork` rebuilt): origins every 2-4
  depths along BOTH walls, each trunk throwing 2-3 branches that sometimes
  sub-branch, drawn per-segment so each fracture tapers 2px→hairline and cools
  `crackWarm`→dark from mouth to tip. No patch of rock near the channel is
  crack-free.
- **The lantern lost its white core:** a soft warm swell (`#ffe4b0`, no hard inner
  radius, modest alpha) that lifts the player's depth within the column rather
  than sitting on top as a bulb. The "you" bead was de-cored the same way.
- **The vignette was pulled back to the outer ~15%** so the rock reads to the frame
  edges.

**The one deliberate deviation from the literal numbers:** the exact colour values
are loam's. The other six shells keep the same LUMINANCE structure in their own
hue (ferrite's channel is cold blue-white, verdance's green, etc.) rather than all
glowing gold — the renderer's whole point is that the seven worlds diverge, and
hard-coding loam gold everywhere would erase that. The warm lantern SWELL stays
warm in every shell, because a lantern flame is warm regardless of the rock.
Verified by screenshot across all seven shells + a 100% zoom crop; 625 tests green,
`tsc` and production build clean, 380px 0px overflow, reduced-motion static.

### The render-model pass (review: "concentric bands, too wide, texture invisible")

The value-inversion pass got the colours right but the RENDER MODEL wrong on three
counts; the review named all three with fixes, implemented exactly:

- **The channel was six nested filled shapes** — you could count the contour lines,
  and a chamber read as a candle flame. Replaced with ONE horizontal gradient
  texture built at boot (`channelTexture`: `#ffd89a` centre → `#c47a2a` → `#6b3a10`
  edge, per shell) stretched over the vein and MASKED to the channel polygon. It is
  a single continuous gradient — no discrete bands anywhere.
- **The lit channel filled a third of the frame at every chamber.** The glowing
  vein is now HARD-CAPPED at ~8% of viewport width (`CAP = viewW*0.042` half-width).
  Where the grammar opens a chamber the wall pulls back past the cap and that gap is
  DARK VOID (a `0x070505` base), with the lit rock lip on the far chamber wall —
  the chamber reads as the rock pulling back into darkness, only the thin vein
  glows. (See ferrite: the vein threads a diamond of black void.)
- **The multiply-only stone texture was invisible** — multiply can only darken, and
  0.68× of `#1a130c` is a difference no one can see. Rebuilt as a BOTH-DIRECTIONS
  pass: `makeStoneTextures` now emits a DARK tile (multiply, darkens where noise <
  mid) and a LIGHT tile (additive, warm-tinted, brightens where noise > mid) from
  the same field, masked to the rock. Grain now sits both lighter AND darker than
  the base band and is plainly visible at 100% zoom on the 8-25 and 25-60px bands.

The lantern shrank to match (a swell a few vein-widths across, not channel-width).
Chunk baking, LRU, determinism and the seam fix are untouched; the two masks per
chunk bake once and cache. 625 tests green, build clean, verified 7 shells + zoom.

### The opaque-canvas rebuild + a dev tuning panel (review: four bugs + "let me dial it")

The Pixi-primitive bake was still wrong on four counts, and the reviewer — five
rounds in on eye-tuning values I can't judge from a description — asked for a tuning
panel to dial them directly. Both delivered.

**One architecture change fixed three of the four bugs.** `bakeChunk` now composites
the WHOLE cross-section onto ONE opaque offscreen `<canvas>` per chunk (rock + grain
+ channel + cracks), then `Texture.from(canvas)` → the chunk sprite; decals stay Pixi
on top. Because the canvas is opaque and every layer is a pure function of GLOBAL
coordinates, the PAD chunk overlap draws identical pixels — **no seam is possible**
(bug 4: the seam had returned through the additive/multiply grain tiles doubling in
the overlap). Grain is now **global per-pixel value-noise** (`stoneNoise`), 3 octaves
at ~4/12/40px with the finest weighted most — **fine granite, not 100px clouds**
(bug 2), and being a continuous global function it has **no tile period** (bug 3: the
repeating grid is gone by construction). The rock band value is modulated ± by the
noise in plain canvas math (visible on near-black). Computed at HALF-res then bilinear-
upscaled to bound bake cost.

**Bug 1 — the straight-rectangle channel — fixed by clipping the light to the REAL
cave polygon.** The width cap is gone; the lit channel per row spans the actual
`lx..rx`, so the light bulges left/right with the walls — no straight vertical edge.
Per the reviewer's model, a chamber is not a black void: it is wider lit channel that
**dims toward the middle**. The channel is a per-row horizontal gradient with a
~constant-px BRIGHT RIM at each wall falling fast to a dark centre — narrow rows glow
(the rims overlap), wide chambers read as dark voids ringed by lit wall-rims (the walls
are the light). Matches the reference: a dark shaft with glowing gold wall-rims.

**The dev tuning panel** (`ShaftTunePanel` in `ShaftCanvas.tsx`): gated on
`import.meta.env.DEV && ?shafttune`, so it is stripped from prod (verified: no
panel string in `dist`). Thirteen live `<input type=range>` sliders — channel
brightness/width, the four rock bands, texture scale/strength, crack density/
brightness, lantern radius/falloff, vignette — write straight into a `ShaftTuning`
object via `ShaftView.setTuning()`, which merges and re-bakes live; a JSON readout
gives the numbers to hard-code back into `DEFAULT_TUNING`. **The point: stop guessing
eye-values from prose — the reviewer dials them and sends back the finals.**

Acceptance verified by screenshot (7 shells + 100% zoom + phone 380px + reduced-
motion): no straight channel edge, no tile repeat, no chunk seam, grain present,
per-shell hue divergence intact.

### The continuous-vein pass (review: "glowing eggs, not a mine")

The dark-void-chamber model was wrong: chambers read as glowing cocoons, the walls
were pixel staircases, and the grammar made caverns. Four fixes:

- **The vein is now the THROUGH-LINE.** A constant-width lit thread runs down the
  centre at EVERY depth — never widening, dimming, or breaking. It is decoupled from
  the wall polygon (one additive soft-edged strip). A chamber adds *dark space*
  around it, not a gap in the light. This is the single change that made it read as a
  shaft.
- **Smooth walls.** The cave silhouette is a SMOOTH quadratic-bezier path through the
  profile points, filled + stroked antialiased — no per-pixel-row classification, so
  no stair steps at any zoom. The lit lip on the walls is a soft additive stroke on
  each wall curve (open paths, so no horizontal connector line at chunk ends).
- **Gentle grammar** (`shaftGrammar.ts`): events are rarer (`drift.events*0.2`) and
  subtler (`mag 0.3-0.75`), and each wall is hard-clamped to `[0.6, 1.7]×base` — the
  widest chamber is at most ~2× the tightest pinch. A hand-dug shaft that breathes,
  not a chain of caverns.
- **Rock colour variation.** The rock is textured full-canvas (walls come from the
  path, not per-pixel), and its colour varies: a low-frequency MINERAL field
  (precomputed on a coarse global-aligned grid, bilinear-sampled) shifts hue ±15°/
  saturation ±20% (redder clay, greyer stone); horizontal SEDIMENT strata modulate
  value, per-shell (thick in Loam, absent in Cinder — `SEDIMENT_BY_SHELL`); a
  depth-driven hue drift cools/greys the rock as you descend (`driftParams.temp`);
  and rare high-frequency ore GLINTS read as a find, not sparkle. All within the
  shell palette.

The tuning panel's knobs were re-labelled to match (vein brightness/width, rock
value, wall rim glow, texture scale/strength, mineral variation, sediment, …).

**Perf — measured with a same-session control** (the lesson from the earlier red
herring, applied right): a separate-launch Face read 9ms while the Shaft read 31ms,
which *looked* like a regression — but an A/B measuring FACE then SHAFT in the SAME
browser session under identical load gave **Face 45.8ms mean / 107 frames >100ms vs
Shaft 35.9ms mean / 1 frame >100ms**: the Shaft is at parity with (slightly faster
than) the unchanged Face. Both were inflated ~4-5× by transient machine load; the
representative unloaded steady-state is ~10ms (the historical baseline). The per-pixel
colour bake did make each chunk heavier, so the mineral field was moved to a coarse
grid and the ore glint to a direct hash — a safety margin for cache-miss frames.
**The control must be measured in the SAME session — a separately-launched baseline
catches a different machine-load moment and lies.** 625 tests green, build clean,
panel stripped from prod.

## A.33 THE FACE CLUSTER (Phase build record — interaction depth on the Face)

The three screens a player lives in — Face, Kiln, Drill Bay — deepened with
INTERACTION, not content. No new shells, systems, or currencies. **Shipped: Part 1
(The Face), whole.** Parts 2 (Kiln) and 3 (Drill Bay) are **deferred** at a green
checkpoint (see the honest-status note at the end) — this phase was ~10 interaction
features across engine+UI+save+tests+Compendium each, several times a single-turn
deliverable, and the brief itself names Part 1 as the part to protect and Part 3 as
the first cut. **Save v19 → v20** (defaults-only: an established save gets full
stamina, no marks, an empty FIGURES Codex, and behaves exactly as before until the
player tags a cell, sweeps, or traces a shape).

**HOLD-TO-CHIP.** `FaceView` repeats the chip under the finger each frame while the
pointer is down (the existing per-cell 170ms cooldown paces it). Pure ergonomics and
a repetitive-strain fix — regen still bounds throughput, holding just spares the
tapping.

**FIGURES** (`systems/figures.ts`) — cell-shape chords, DISTINCT from Lattice Chords
(a Figure is a gesture the hand makes on the face, not a board arrangement). Chipping
cells that trace a shape fires a bonus: **THE FURROW** (3 in a line), **THE FAULT** (3
on a diagonal), **THE PIT** (a 2×2 block), **THE COLLAR** (4 around a centre). Found
by doing, kept in `state.figures.found` (a Codex, permanent, survives Collapse), NEVER
listed in the Compendium (pillar 5). The face glows faintly at a cell one chip from
completing a figure (`figureHintCells`) — a POSITION, never a shape; the hint is
provably independent of what's discovered (a test asserts identical output with the
Codex empty vs full). **PILLAR-2 INTERPRETATION, FLAGGED:** "pays a bonus" is paid as
XP + a bonus DROP roll + a STAMINA refill — NEVER Dust and never a yield multiplier,
because either would have raised `dpsMax` (the ceiling). A figure changes engagement,
not throughput. A test asserts a completed figure mints zero currency while XP and
stamina move.

**MARK CELLS** (`face.marks`, action `toggleMark`/`clearMarks`) — tag cells and the
drills route around them, exactly the way they already refuse a vined cell (a shared
`skip(i)` predicate in `tickDrills`, applied to the target re-aim AND the Two-Hands
second cell). Marks are a saved preference on the grid, filtered when the field
resizes so a stale index never points at the wrong cell. A test drives a fullest
drill past a marked-but-richest cell.

**THE SWEEP + STAMINA** (`face.stamina`/`staminaMax`, action `sweep`) — the one new
tracked value, scoped to Part 1. A drag clears a swathe; each cell is harvested exactly
as a manual chip harvests it, so a sweep can never take more than the field produced
(pillar 2). **The stamina risk, handled:** it regenerates fast (`STAMINA_REGEN` 5/s,
full in ~20s), gates ONLY how many cells one gesture clears (ordinary chipping ignores
it entirely — a test asserts a chip succeeds at 0 stamina), and an idle player is
untouched (stamina just sits full). It was generous enough to keep, not cut.

Invented numbers appended: figure payout scales 1 / 1.2 / 1.5 / 1.7; stamina 0-100,
regen 5/s, sweep 6/cell (~16 cells a full bar); figure trail window 3.5s, 9 cells.

UI (`FaceCanvas` + `FaceView`): a Chip/Mark/Sweep segmented control (≥44px), a sweep
stamina bar shown in sweep mode, a "clear N" when marks exist, teal keep-tags drawn on
marked cells in every mode, the figure hint drawn as a faint pulse (static under
reduced-motion), and a first-time figure toast. `faceMode` is UI-only (localStorage-
free device state); everything the player authors (marks, stamina, figures) rides the
save. **644 tests** (+15 figures), reachability green (the three new actions dispatch
from the Face UI), compendium-coverage + copy-coverage clean, `tsc` + production build
clean, **0px overflow at 380px**, touch targets ≥44px, reduced-motion respected. Built
locally, not deployed.

**HONEST STATUS — deferred, with the reasons recorded (a cut is provisional):**
- **Part 2, The Kiln** — fuel types with burn profiles (a choice, not a ladder),
  overstoke for a burst (opt-in, foreseeable, the Cinder greedy-line design), bank heat
  overnight (idle QoL, must not raise the ceiling). Not started. Fuel types are the
  large item (new fuel content + placement UI, echoing Cinder's `fuelOwned`/`buyFuel`);
  bank-heat and overstoke are small. None blocked — deferred purely for scope.
- **Part 3, The Drill Bay** — named/breakable drills (foreseeable + repairable, the
  hireling-permadeath standard), material preference (reuse the tools-that-learn
  machinery — note: tools do NOT currently "learn" from use; the affinity would be new
  or would extend `toolParts`, worth confirming before building), drill heads + bits
  (configured not levelled, reading traits like tool parts). The brief's designated
  first cut; not started.

> **Both deferrals above are now BUILT (see A.34).** The Kiln and Drill Bay were
> completed in the follow-up, and the "tools that learn" flag was ruled on: build the
> mechanism generically now (`systems/affinity.ts`), shared by tools and drills.

## A.34 THE FACE CLUSTER — Kiln + Drill Bay + shared affinity (build record)

The follow-up finished the phase: Part 3 (The Drill Bay), then Part 2 (The Kiln), on
top of a shared learning mechanism ruled in from the "tools that learn" flag. **Save
v20 → v21** (defaults-only: existing tools/drills gain empty history, start unworn,
and behave exactly as before until they log use). 668 tests (+24), reachability green
(6 new actions dispatch from the Drill Bay + Kiln panels), modifier-integrity green
(the new `affinity` source has a declared consumer), compendium + copy coverage clean,
`tsc` + production build clean, 0px overflow at 380px, ≥44px targets. No render hot-path
changed (all new UI is HTML panels), so no frame numbers apply this round.

**AFFINITY — the one shared mechanism** (`systems/affinity.ts`). An IMPLEMENT (a
`ToolInstance` or a `DrillState`) accumulates a use-history keyed by the shell it works
(`impl.use`), and develops affinity from it: a slow saturating curve (`u/(u+80000)`),
capped at `+15%`, that **never decays**. On the implement, not a parallel stat; through
the modifier pipeline as a named source (the equipped tool registers `affinity` into
`dropRate`; a drill's affinity is the same curve applied to its own `drillPower`, which
per-drill state cannot be a global source but is the identical function, so it composes
with traits/alloys/runes/gems). **Pillar 2:** it feeds `drillPower` (reach the regen
ceiling sooner, never exceed it) and `dropRate` (drops are not income) — never
`dustYield`, so it changes how you reach the ceiling, not what it is (a test asserts a
worked tool moves `dropRate` and leaves `dustYield` untouched). It reads as history, not
a grind, and switching is never punished (each implement keeps its own).

**THE DRILL BAY.** Each drill is an INDIVIDUAL: a default name from a pool (`Bess`,
`Old Tom`, `The Mole`, …), renamable, saved. **Breakable:** strikes add `wear`
(`3.4e-5`/strike × head/bit `wearMult` × level), visible as a condition (ok → strained
→ failing → broken) long before failure; at wear 1 the drill does not stop but **limps
at a floor** (`BROKEN_FLOOR` 0.15) until repaired, so idle income never craters
(pillar 1). Wear accrues **only in `tickDrills` (online)** — the closed-form offline
path never runs it, so an away player never wears a drill. Repair costs the shell's
converted currency, scaled by level. **Material preference** is the shared affinity on
`drillPower`. **Heads + bits** (`content/drillParts.ts`): a HEAD (auger/harrow/scatter/
seeker/maul) sets targeting behaviour and a power/speed/wear lean — no strictly-best;
a BIT is a material whose traits tune the drill the way tool parts read traits (EDGE →
power, CADENCE → speed, HEFT → wear resistance). An unconfigured drill keeps its legacy
`behavior` and neutral stats — fully backward compatible.

**THE KILN.** **Fuel** (`content/kilnFuel.ts`): a burn profile is a trade, not a ladder
— every fuel trades heat-up speed against holding heat, so none dominates on both axes
(a test asserts it). Feeding one burns a trickle of a material you already gather (no new
currency), consumed a whole unit at a time so stacks stay integer; when it runs out the
kiln burns bare. It bends the heat DYNAMICS, never the efficiency cap (pillar 2).
**Overstoke:** an opt-in, foreseeable burst — pay Dust up front, get a short `×1.6`
window, then a cooldown; it is the one thing that pushes past the heat cap, but only when
you light it, and the Dust it burns was field-bound already, so it moves when bricks land,
not how many the field can feed. **Banked heat:** heat already persists across an away
period (the closed-form offline path preserves it and a returning fed kiln comes back
warm); made explicit and tested, and a banked fuel now also slows the online cool-down.

## A.35 IMPLEMENTS AND INSCRIPTION — the tool becomes yours (build record)

Phase 21 finished the "implements" thread: a tool stops being a stat block and becomes a
thing with a temperament, a record, and inscriptions cut across whole sessions. **Save v21
→ v22** (defaults-only: `forge.equippedAt=0`, `tool.history=[]`, and four new empty `runes`
slices — every existing save behaves exactly as before until the player earns something).
**687 tests (+15 in `implements-v22.test.ts`)**, reachability green (three new actions —
`fuseGems`, `bulkSalvage`, `practiceRunes` — each dispatch from a live control),
modifier-integrity green (`heirloom` and the triple/temporal rune buckets all declare
consumers), compendium (367 entries, +2 concept pages) + copy coverage clean, `tsc` +
production build clean. No render hot-path changed (all new UI is HTML), so no frame numbers.

**The mid-phase finding — the ledger was wrong, and that is itself the result.** The first
pass of this phase treated the UNBUILT ledger as a to-do list and started to build **gem
cutting** and **rune casting** — both of which had already shipped in the P18 Workbench
(`finishCut`/`gemCuts`, `finishCast`/`CAST_RECIPES`). The rows were written from memory of
what P16/P17 *intended to cut* and never re-checked against what P18 built. The ledger was
rebuilt against the codebase (every row now carries a `Verified against` symbol+file), and a
new standing rule was added — **"the ledger is a claim, not evidence"** — in the same family
as "a number in this document is not evidence."

**PART 1 — OPINIONS** (`systems/opinions.ts`). A tool carried long enough grows a
personality out of the SAME affinity history — NO second stat. `opinionation = t/(t+120000)`
(a longer relationship than affinity's saturation, so a rotated set never earns one), read
from `impl.use`; a `settleFactor` from `forge.equippedAt` makes a switched-to tool SULK
briefly (a settling-in, capped ~150s, and a tool that already knows the shell settles almost
at once). `opinionMult = 1 + settle·(bonus − penalty)`: it favours a rock it knows (+) and
works a stranger rock a little worse (−), and it only ever bends the small affinity bonus,
injected into the SAME `dropRate` source. **Pillar 1:** an idle player gets the base and is
untouched by sulking. **Pillar 2:** `dropRate`, not income. The tension the brief named is
held by construction: rotate three tools freely (low opinionation → neutral, no switch
penalty), or carry one forty hours (a favourite that reads like one).

**PART 2 — INSCRIPTION DEPTH** (`content/shell4/runes.ts`). **Practice on scrap**
(`practiceRunes`): spend a little Silica to learn only the SHAPE of a join — how many pairs
rang, how many fought — never which, never the effect, never a word to `pairsSeen`, never
spending real runes (**pillar 5**). **Tier slots** (`runeSlots`): a tool earns room as its
tier climbs (I–V:3, VI–X:4, XI–XV:5); gear stays at 3. **Triples** (`RUNE_TRIPLES`, 8): a run
of three consecutive runes says a third thing on top of its two pairs — only possible once a
tool is long enough. **Order-over-time** (`TEMPORAL_COMBOS`, 3): a carve appends its lead
rune to a trail with the play-second; a combo completes only when its runes are carved in
order, each ≥30 real play-minutes apart — meant to span sessions, the slowest discovery in
the game.

**PART 3 — CASTING** was already built (P18); A.35 added `runes.castKinds` so a rune cast at
the bench is counted apart from one the Warrens gave up (same rune to a socket; the tool
remembers the difference).

**PART 4 — THE LEDGER, CLEARED.** **Heirloom history** (`systems/heirloom.ts`): a tool earns
MARKS (warden / recursion / geodes×100 / breach) from deeds it was in the hand for — hooks in
combat, drops, breach, recursion — each a small capped touch of `dropRate` (per-mark 0.01,
cap 0.06); flavour first, pairs with opinions. **Gem fusion** (`fuseGems`): two duplicates
raise a type's cut quality non-destructively (never falls), diminishing to a 0.7 cap below a
clean hand-cut so skill still wins. **Bulk salvage** (`bulkSalvage`): break down every tool
below the equipped tool's tier at once, optionally paying to keep runes/gems; never touches
the equipped or the last tool. **Deeper tempering**: a temper's active bonus now scales by
`1 + 0.4·affinity` for the shell in hand — temper × where you are × the tool's history, a new
interaction in the same bucket (not a third flat stat).

## A.36 THE LIVE-PLAYTEST FIXES — seven reported bugs, root-caused (build record)

A player reached Glassmere and reported seven broken things. Each was fixed to its **real
cause**, not just its symptom, with regression tests where a recurrence was likely. **713 tests
(+18)**, reachability green (two new dispatchable actions have live sites), copy + compendium
coverage clean, `tsc` + production build clean, 0px overflow at 380px. No save bump — one
optional field (`SkillNodeDef.unlockBreach`) and defaults-only behaviour.

1. **The Refinery black-screened the game.** ROOT CAUSE: `salvage.ts`'s "legacy tool" fallback
   called `recipeDef(tool.recipeId)`, which THROWS on the starter tool's `delversPick` (not a
   craftable recipe). A throw in a render path unmounts the whole React root — the exact
   Phase 11b failure class. FIX: a non-throwing `recipeById`; `salvagePreview` returns null for
   an unresolvable recipe (the starter can't be salvaged), so the panel skips it. **Plus the
   structural defence the brief asked for: a `PanelErrorBoundary` around every room, keyed by
   tab**, so any future render throw degrades to an in-place message instead of a black screen.
   Regression test: `salvagePreview`/`salvageTool` on the starter never throw.
2. **Delver skill points stalled past Loam.** ROOT CAUSE (reported honestly): not an XP
   rescale, not a broken condition — **unauthored content**. 13 real nodes (~47 points) shipped
   alongside 12 permanently-sealed `stub` nodes that *nothing* ever opened, despite the UI
   promising "opens in deeper shells". FIX: the twelve are now real nodes with real effects,
   gated by `unlockBreach` and opening two per shell II–VII; `buySkillNode` checks the gate.
   Regression test: strictly more nodes open at each breach, and none stays sealed by Aleph.
3. **No way to remove gear; slots not shown.** FIX: `unequipGear` action + a "Take off" button
   on every worn piece, and a `{worn}/4 slots worn` count on the bench.
4. **The Museum showed raw keys** (`hex.supported.mixed`). ROOT CAUSE: `museumCandidates` used
   the raw id as the label in all three branches. FIX: one throw-safe `keyDisplayName(key)`
   resolver (`content/keyNames.ts`) that maps every `kind:id` to its authored name and
   humanises unknowns rather than crashing or leaking. Audit: the Museum was the sole leak
   (per-system panels already use their def accessors).
5. **The Lattice board overflowed its container.** ROOT CAUSE: `LatticeView.layout` fit the hex
   *centre span*, but `drawSockets` draws a background CIRCLE larger than that span, so at ring
   4 the circle clipped; a `max(10,…)` floor forced oversize on small screens. FIX: fit the
   circle (the largest drawn element) into the smaller dimension with a rim, floor lowered to
   6px. Verified full board at ring 4 on desktop and 380px.
6. **Couldn't descend multiple times at once.** FIX: `descendMany`, implemented as a LOOP of
   single `descend` calls so it spends EXACTLY what N taps would and obeys every per-step gate
   — the lift's cost-identical guarantee, here true by construction. Shaft controls gained
   ×5 / ×25 / To-floor. Regression test: batched vs by-hand spend and depth are Decimal-equal,
   and it stops at a wall / floor / empty purse without overspending.
7. **The Foundry price didn't name its material, and the card read as "random text".** REPORT:
   the flavour copy is genuine, not placeholder or misrouted — it read as random because it was
   the *only* text and the module's actual effect was never shown. FIX: render the effect
   (`+30% Kiln rate`, …) and name the currency on the price (`Fit · 200 Flux`).


## A.37 THE LEGIBILITY & AUTHORING PASS — the game explains itself (build record)

**The finding that drove it.** The prior pass found the Delver tree wasn't *broken* — it was
*unauthored*: 12 permanently-sealed stubs behind a UI that promised they would open. It
shipped looking finished. Played to Glassmere, a large share of the game read as "boring,
confusing, makes no sense, useless." Two suspects: systems that never explain what they do,
and systems half-stubbed the same way the skill tree was.

### Part 0 — the stub audit (done first, reported before fixing)

**Conclusion: the game is NOT riddled with stubs.** Every content registry was audited against
its spec. Nearly all are at or above target (139 materials, 97 species, 55 harmonic rune
pairs + 8 triples, 66 loom-adjacent shapes, 23 confluences, 365-entry Compendium). The typed
modifier pipeline (`assertModifierIntegrity`, P15) *guarantees* no inert effect can ship — a
bucket with sources but no consumer fails boot. **The "boring/confusing" feeling is an
INFORMATION problem, not a content one.** That is why the value of this phase is Part 1.

Two honest shortfalls (both now ledgered above, not hidden): the **skill tree** (24 of a
spec'd 66 — the deceptive sealed-stub UI was already resolved at A.36; the remaining gap is
just length) and the **core tree** (14 of ~28 — real tranche-gated nodes, no fake UI). Also
found and fixed: a **stale comment** in `meta.tsx` claiming the achievement grid is "25 × 10,
mostly empty" — it is 19 × 10 and authored full (shrunk in P13). Comments are documentation;
a lie in one is a small stub of its own.

**False alarms worth remembering** (all verified real, NOT stubs): transmute `CHAINS` reads
`.length === 0` at import time because it is populated at runtime via `registerChain` (18
authored); a grep for greenhouse strains matched interface lines (actual: 12 base + 66
hybrids). *An import-time `.length` is not a content count.*

### Part 1 — the information layer (each system now says what it does)

Rule 5 held throughout: **explain the mechanic, never the solution.** Pairings (trait, rune),
undiscovered chords, and untried results stay discovered; only the *rules* and *current
contributions* became legible.

- **Lattice** — a selected motif now shows its resonance breakdown: net value + each neighbour
  relation named ("harmony with the square (r2) to the left: +1"), colour-coded by kind, plus
  a board-wide Resonance readout. Engine: `cellContribution()` in `latticeCore.ts` (tested).
- **Material traits** — three layers. (1) Every trait tag everywhere (Hold, both forge pickers,
  Craft bench) is the shared `TraitTag` with a tooltip = blurb + which stat axis it pushes and
  the direction ("raises chip yield · lowers edge & rune hold"). (2) A generated glossary folded
  into the Compendium `traits` page — all ten, name → sentence + direction, `traitGlossaryFacts()`
  from the registry so it can't drift. (3) The forge preview now reads the whole tool's LEAN
  ("These three lean toward strike power · away from chip speed"), netted live as parts swap.
  Engine: `traitFactorLines` / `traitLeanText` / `compositionLean` in `traits.ts` (tested).
- **Gems / cutting** — the socket picker shows each gem's `effectText` (and a "cut ✦" badge);
  the equipped tool lists each socketed gem's effect inline with "folded into the totals above";
  the gem-cut FacetPlacer shows live cut-quality % and the exact numeric effect of the chosen
  lean ("mining face +21%, combat −6%"), matched to `gemCutMult` to the point.
- **Runes** — the inscription grammar readout replaced a raw bucket id (`strikePower`) with the
  player name + signed magnitude ("strike power +5%"); fixed a **stale `/14`** counter (there
  are 55 discoverable pairs — now computed from `RUNE_PAIRS`); added a live "what the tool
  carries now" readout naming discovered active joins with effects and honestly flagging that
  unnamed active joins are "already in your totals." **Also fixed an authoring gap:** the
  inscription editor was hard-capped at 3 slots even though a tier-VI+ tool earns 4–5
  (`runeSlots`) and the engine already accepted them — the extra slots (and the triples that
  live in a longer line) were UI-unreachable. The editor now offers the tool's true slot count.
- **Serra's caravan** — rewrote each route to name the from→to currencies, the live all-in rate
  (`routeRate`), and a send-preview ("send ~X Scrip → get ~Y Ingot"); added a plain sentence on
  what the road does (moves wealth, never makes it; rates drift; nothing rots).
- **Buy / sell / caravan toasts** — a reusable self-fading micro-toast (`useCoinToast` /
  `CoinToast`, `coin-float` / reduced-motion `coin-fade`) rises off any NPC transaction:
  "Bought — Ironblood · −340 Scrip", "+180 Scrip · Ferroslag ×5", "+12 Ingot".
- **Weather** — the chip now reads its effects from the actual `mods` values ("Dust yield +10%
  · vines age ×2"), inline (touch-friendly) and in the hover, not from re-typed prose.
- **Drill upgrades past Loam** — the currency is named on the upgrade AND repair buttons. This
  also fixed a **real bug**: the affordability check hard-coded `getCurrency(state,'brick')`
  while the engine charged `convCurrencyId(state)` — so past Loam the button read the wrong
  purse. Now both use the shell's converted currency and name it.
- **Greenhouse / Mycelium / Loom** — all three already had the P11 three-layer SystemHeader
  (0 gaps in `copy-coverage`), so the gap was the interactive body: the Loom's "Woven now" now
  shows each shape's live +% bonus; Mycelium node buttons name the bucket (`BUCKET_NAME`) and
  per-node %; the Greenhouse shows what each strain YIELDS (Spore/Sap/Chlorophyll) on plots,
  seeds, and the codex, mirroring `harvestPlot` exactly.
- **Foundry** — re-checked; the A.36 fix holds (effect named via `moduleEffectText`, cost via
  `currencyDef`, complete tooltip). No change needed.
- **NPC quests** — the objective was shown but the REWARD (in the data all along) was not.
  Now "pays 40 Scrip · Marrowplate · advances on its own when done."

### Part 2 — one dropdown in the game's language

Six native `<select>`s (kiln fuel, drill head/bit, forge tier, carry-upgrade, refinery ×2)
became one `Select` (`src/ui/components/Select.tsx`): a real ARIA **select-only combobox** —
focus stays on the trigger and the active option rides `aria-activedescendant`, so Tab in/out
never traps; ↑/↓ move, Enter/Space pick, Esc closes, Home/End jump, typeahead; trigger and every
option ≥44px tall; the menu is **portalled to `<body>` and fixed-positioned from the trigger's
rect** so no panel's `overflow` can clip it and it flips above when there's no room below;
reduced-motion drops the open fade. No native OS chrome breaking the cave's dark palette.

### Verification

713→**718 tests** green (+5: `cellContribution` ×2, trait legibility ×3). Both coverage
checkers clean (Compendium 367 entries, no spoilers; copy 37 systems, 0 gaps). `tsc` clean;
production build clean. **0px horizontal overflow at 380px** on every reached screen. App boots
with **zero console/page errors** across all navigated screens. One self-inflicted defect was
caught and fixed mid-verification: the trait glossary was first added as a *new* Compendium
page with `id:'traits'`, colliding with the pre-existing hand-authored `traits` page (a
duplicate-React-key warning) — resolved by folding the generated `facts` into that one page.
No deployment.

**A note on the Select's live proof.** The component is verified statically (tsc, build,
clean boot, ARIA/keyboard/44px/portal by construction) and mounts without error. A full
headless *interaction* screenshot was blocked by the game's progressive-disclosure gate, which
makes reaching a `<Select>` in a fresh scripted browser costly and flaky — a harness
limitation, not a code defect. Recorded here honestly rather than claimed.

## A.38 THE SECOND LIVE-PLAYTEST FIXES — the Glassmere freeze, root-caused (build record)

Played to Glassmere; six reports, the first one severe: the core screen went black-and-frozen,
recoverable only by refresh. All six were reproduced before a line was changed. `scripts/`
temp harnesses (a Glassmere state seed built like `playthrough.ts`'s, plus an injected-throw
probe) drove the diagnosis; they were deleted after.

### Item 1 — the Face freeze / vanish (the worst; two reports, one cause)

**The report:** after buying an upgrade the grid stopped responding (no chip, no animation) yet
currency kept moving in state; separately, returning from the Shaft could vanish the grid to
black. Only a refresh recovered either.

**Root cause — no top-level error boundary.** `main.tsx` mounted `<App/>` bare, and the
`PanelErrorBoundary` added at A.36 wrapped only the room panels — NOT the hero (the Face/Shaft
Pixi canvases and the chips floating over them), and nothing wrapped the nav, Header, or
modals. So an uncaught render throw anywhere up there unmounted the ENTIRE React root. The
unmount ran every `useEffect` cleanup, which call `FaceView.destroy()` / `ShaftView.destroy()`,
which call `app.destroy()` and **stop the Pixi tickers for good.** The engine kept running on
its own `startLoop` (hence "currency IS being spent and gained in state"), but the screen was
dead until a manual reload. This is the SAME family as the A.36 Refinery crash — the fix there
was correct but incomplete: it covered the rooms and left the hero exposed, exactly as the
report suspected ("check whether it needs to cover the Pixi canvases too" — it did).

*Ruled out, with evidence:* Pixi's ticker does NOT die on a listener throw — a reproduced Pixi
batcher error (`Cannot read properties of null (reading 'clear')`, the documented multi-
Application "batcher pool poisoning", transiently triggered by creating a second renderer while
the Face renders) was survived: chipping kept working after it. So a render throw alone can't
freeze permanently. Only the React unmount → `destroy()` → ticker-stop is permanent, and it
fits every symptom.

**The fix** (defence in depth, all three layers):
- **`AppErrorBoundary`** (new, in `ErrorBoundary.tsx`) wraps `<App/>` in `main.tsx`. A throw it
  catches shows a full-screen, honest "reload" card (the save is written to IndexedDB
  continuously, so a reload loses nothing) instead of a silent black root — and it logs the
  throw in dev, so the specific culprit is surfaced, never hidden.
- **A hero-overlay boundary** in `App.tsx` wraps the chips/banners (`WeatherChip`, `GrowthChip`,
  `EncounterBanner`, `OverpressureOverlay`, `AnomalyBanner`) with `fallback={null}`, APART from
  the Face canvas. Now a throwing overlay simply vanishes and the Face keeps rendering — no
  freeze at all. **Proved live:** with a throw injected into `WeatherChip`, the root stayed
  mounted, the canvas survived, and chipping still paid — where before the whole app blanked.
- **`FaceView.frame` wrapped in try/catch** (logs once, keeps ticking) so a bad frame can't
  abort the loop's later work either.

Regression guard: `src/engine/__tests__/face-resilience.test.ts` — the engine invariant (a chip
still pays after any purchase; the engine accrues independent of the UI) plus STRUCTURAL checks
that the three boundaries stay wired (a refactor that drops them silently reintroduces the
catastrophe, and nothing else would catch it).

### Item 2 — the "stuck white beam" — a symptom of item 1

The beam re-traces at least every 2s (`pathDirty` on every optics change, plus a periodic
retrace) and `drawBeam` clears+redraws every frame — so a LIVE ticker can never show a stale
beam. A screenshot confirmed a live beam follows the mirrors correctly. "Stuck white lines that
don't follow the path" is a FROZEN frame of an old beam, held on screen because the ticker
died (item 1). Fixed by the item-1 boundaries; no separate beam-logic defect exists.

### Item 3 — the "random green cell" — not a defect, it is carried Growth

Confirmed via `signatures.ts`: carried signatures run at `carriedStrength` (0.4 base), so the
GROWTH signature — carried from Verdance — actively vines cells in Glassmere at 40% strength.
It is NOT stale/uninitialized state: `ensureSized` keeps the growth arrays exactly face-length,
and `breach.ts` calls `runFaceReset(state, 'breach')` which zeroes growth on entering Glassmere,
so any green there is FRESH. It is also load-bearing — the Growth×Refraction confluence needs
it visible (a young vine bends the beam; a green cell amplifies wavelength 3). Reported as
working-as-designed; the confusion is a legibility gap, not a bug, so the mechanic and its
render were left intact.

### Item 4 — the Beam (Optics) card gets its three layers + centred, tappable row buttons

`OpticsCard` had no explanation of what the Beam is or does, and its entry-row buttons were
24px `btn-cell` pads (opting out of the 44px touch floor) with off-centre digits. Rewritten:
Layer 1 (what it is — light enters a row and walks the face; a lit cell pays more), Layer 2
(what to do — pick the row, place `/`\`\` mirrors, chip the lit cells), Layer 3 (where the
numbers live — mirrors placed, lit-cell/amplify rules). The row buttons are now a centred row
of proper flex-centred 44px-touch targets with `aria-pressed`.

### Item 5 — forge recipe chips now name their material

The active-recipe input chips showed an icon + "40/1" with only a hover title of the bare name
— unreadable at a glance. Now each chip shows the material NAME inline, and a rich tooltip:
name · ~purity% (it rolls into the tool's stats) · you hold N, this recipe needs M (short K).
Held purity is the average across the material's held bands (`heldAvgPurity`).

### Item 6 — carry-one: diagnosed INVISIBLE, not under-powered

`scripts/carry-verify.ts` settles the power question: the single best carry target is worth
**33.6% of a whole face-upgrade rebuild** (implied return-to-peak ~13.3%, comfortably inside
pillar 6's 10–25% band, floor held). The saving is large and correctly bounded — the choice was
just impossible to SEE. Fixed with legibility on both sides, no balance change:
- **Before:** each carry option in the Select now prices itself ("saves 18.9K Dust"), and the
  picked one gets a highlighted readout — "skips re-buying N levels ≈ X Dust of the climb back;
  the rest fall to Lv R; the mark is spent on the fall." Priced with `collapseRetained` (newly
  exported so UI and engine share one number) × `costForLevels`.
- **After:** the run-summary modal and the persistent last-fall strip confirm "Carried through:
  NAME · N levels kept," recorded through a new optional `RunSummary.carried` field (no
  migration — absent on old saves).

### Verification

718→**723 tests** green (+5 face-resilience). Both coverage checkers clean. `tsc` clean;
production build clean; **0px horizontal overflow at 380px** across every seeded state; the
error-boundary fix proved live (injected hero throw → game survives, canvas alive, chip works).
No save-schema break (the one new field is optional). No deployment.

### A.38 ADDENDUM — the freeze was NOT fixed; the real mechanism, reproduced and closed

The live playtest came back: Shaft → dig down → back to Dig still killed the grid. Two things
in the first A.38 pass were wrong and are corrected here:

1. **The earlier "proof" measured the wrong signal.** "Chipping still pays" is NOT liveness —
   Pixi's event system is DOM-driven, so a dead canvas keeps dispatching chips while frozen
   (that is literally the original report: currency moved, screen didn't). The repro harness
   now measures `ticker.lastTime` advancing plus DRAWN PIXELS on the face canvas (dev handles
   `__faceView`/`__shaftView`).
2. **The React boundaries were necessary but not sufficient.** The killing throw is not a React
   render throw at all — it is a throw inside PIXI'S OWN render listener, and Pixi v8's ticker
   reschedules its RAF *after* the listener loop, so that throw kills the app's loop for good
   (or leaves the batcher executing poisoned instructions = a black stage).

**Reproduced:** a Glassmere seed digging ×25 through many chunks, cycling Shaft↔Dig at 380px,
produced **11 uncaught page errors** — `Batcher.break → null.clear` at instruction build, then
`BatcherPipe.execute → null.geometry` repeating every frame after. The poison: THREE live Pixi
Applications (Face, Shaft, Lattice — the Face and Lattice tickers never paused) interleaving
renders while the Shaft **created and `destroy(true)`ed RenderTextures** (LRU eviction, bake
scaffolding, and `layout()`'s `clearChunks()` — which the ResizeObserver fires on every phone
hero height swap 66vh↔42vh, i.e. on every single "back to Dig"). Pixi v8's shared batch pools
do not survive that; the codebase even documented the rule and the hero path violated it.

**The fix (four parts, `pixiGuard.ts` + the three views):**
- **One live renderer at a time.** `FaceView.setActive` — the Face's ticker STOPS while the
  Shaft owns the hero and wakes with every tile invalidated (a full repaint, deferred to its
  first RAF tick so it can't overlap the Shaft's same-commit deactivation). The Lattice —
  whose ticker had free-run under every tab since P3 — now pauses unless its tab is showing.
- **The Shaft defers `layout()` while hidden** (`pendingLayout`, run on wake) — no more
  `clearChunks()` RT destruction fired by the ResizeObserver on "back to Dig".
- **RenderTextures are recycled, not destroyed**: evicted chunks return their RT to a pool and
  the next bake renders over it; bake scaffolding and evicted sprites are destroyed at the TOP
  of the next frame (`pendingDispose`), never while a batch still references them.
- **`guardPixiRender`** wraps `renderer.render` on all three apps (covers stage renders AND
  chunk bakes): a poisoned frame is logged and SKIPPED — the ticker survives, instruction sets
  rebuild next pass, the view self-heals. `ShaftView.frame` got the same try/catch FaceView had.

**Proof, same stress harness:** uncaught page errors **11 → 0**; face ticker ALIVE and drawn-
pixel count at full value through every Shaft↔Dig cycle and the refresh variant; the six
residual poison events across the whole run are all *caught* (`render recovered … ticker
alive`) and invisible on screen (lit-pixel count never dipped at any checkpoint). 723→**727
tests** (4 new structural guards pin the lifecycle: guarded renders ×3, Face-sleeps-under-
Shaft, deferred Shaft layout, RT recycling). tsc + build clean.

## A.39 THE INTERLOCK PHASE, PART B — checkpoint one: the base is sound (build record)

Part A's audit was ruled on: the export spine, Echoes→confluences, the Forge pull-through,
and the folds (with two amendments) were all approved. This appendix records checkpoint one
of the build: the two live-playtest bugs that had to land first — both of the class that
would have poisoned everything built on top — and the honest ledger of what remains.

### Bug 1 — "Cannot read properties of undefined (reading 'push')" → THE SHAPE NET

The reported flow (upgrade a drill → select a head) reproduces CLEAN in both engine and
browser, even with pre-P-Face drill records — the crash is not in that flow. It is the
stale-save class: an array slice added in some later version that one record in a
long-lived save never received (the user's own diagnosis — "an uninitialized slice…
created before a recent migration" — was right). Hunting the exact field is whack-a-mole;
A.36 and A.38 each fixed single instances of this class.

**The class fix: `save/shape.ts` — `ensureStateShape`.** At the hydrate choke point (the
only door a save enters through, storage load and Vault import both), the loaded state is
deep-walked against `initialState(0)` and anything missing is filled: absent key → deep
copy of the default; non-array where an array belongs → `[]`; plain objects recurse.
Additive only — real data is never overwritten; Decimals are shared by reference (the
engine reassigns, never mutates). Three tests in `save-shape.test.ts`, including a save
with nine slices of five different vintages deleted → loads, fills, and runs the reported
sequence clean. Found in passing: `face.marks` in migrations is vestigial (no live reader).

### Bug 2 — the blank band in the Shaft → a failed bake must never be cached

A regression risk I created in A.38 and the report caught: `guardPixiRender` SWALLOWS a
poisoned render — so a chunk bake whose RenderTexture render threw would cache a blank
texture forever (cache hit thereafter = a permanent black band exactly as screenshotted).
Fix: the guard now records per-app failure (`lastRenderFailed`), `bakeChunk` returns null
on a swallowed bake (texture back to the pool), and `ensureChunks` skips caching and
retries next frame. **Proved live**: three forced bake failures mid-column → every frame
recovered, blank-run 0px at baseline, during sabotage, and after. Structural tests pin the
wiring.

### Verification at this checkpoint

727→**731 tests** green (+3 shape net, +1 blank-band structural). tsc clean; production
build clean; both coverage checkers clean. No save-schema change (the shape net makes old
saves MORE valid, not different).

### THE PART B LEDGER — approved, ruled, and queued (not cut)

The two bugs were mandatory and consumed this checkpoint's budget. Per the ruling ("I'd
rather have half of it correct than all of it thin"), the approved plan is pinned here
VERBATIM so the next checkpoint builds exactly what was ruled, in the ruled order:

| # | Item | Status | The ruled spec |
|---|---|---|---|
| B1 | **The export spine (Axis 2)** — FIRST | **BUILT** (checkpoint two, below) | One export per shell, consumed by the next shell's signature infrastructure, Loam→Aleph: Loam Kilnflux (Refinery chain) → Ferrite Crucible pours; Ferrite Lodeframe (Crucible) → Verdance Greenhouse plots 4-6 + Loom frame; Verdance Resin (Still) + Fibercloth (Loom weaves become items) → Glassmere mirrors past stock 4 + Observatory exposures; Glassmere Groundlens + Glasseal (Bench) → Cinder Array sockets + vents past N; Cinder Emberglass (Ember Array output) → Hollow reconstruction past 8 cells + Echo Chamber; Hollow resonance → Aleph Rewrite drafts. Serra's stall gains an EXPORT SHELF selling prior shells' exports (she hauls the stair). Exports are materials (ride the Hold, survive Breach), `source:'worked'`, never drop from mining. |
| B2 | Export spine curriculum audit | **BUILT** (checkpoint two, below) | Extend `audit-recipes.ts` to the export graph: every export producible in its home shell at reachable depth before its consumer needs it; Serra's shelf lists it once past that shell. The curriculum law holds across shells or a player softlocks. |
| B3 | **Echoes → confluences (Axis 3)** — SECOND | UNBUILT (approved) | Echo tiers buy CONFLUENCE SLOTS (choose which of the 23 are active — the decision a Breach pays) and ranks amplifying chosen ones ×(2+rank·0.5) capped ~3×; ambient confluences stay ×1 baseline (no nerf to current saves). Target: echo layer 15-25% of engaged power post-Breach-2. Sim gates: Breach RTP stays 10-25%; all four reset layers re-verified. |
| B4 | **Forge pull-through (Axis 1)** — THIRD | UNBUILT (approved) | Refinery worked materials named in mid+ tool recipes with raw fallbacks at worse spreads (pillar 4); Crucible alloys as Tier X+ bindings with trait sets; tempering consumes a Still brew dose (the quench catalog); Museum curated sets gate relic-fusion tiers; Bench lenses→Array covered by B1. |
| B5 | **Folds** — FOURTH | UNBUILT (approved, two amendments) | Observatory→Bench (charts are lens blueprints); Wells→Vent Network (a pressure-tap mode); Museum→Relics (curation gates fusion, one collection screen); **Titles: acquisition folds into Guild rep, the EQUIP STAYS A CHOICE** (ruled amendment); Bestiary + Parallel View reclassified codex surfaces. **Journal gets a mechanical incentive** (ruled amendment): reading pages unlocks something real — planned: first-reads reveal confluence hints and cure recipes (knowledge that feeds B3's choices), never a free ambient bonus. |
| B6 | Payoff floor rule | UNBUILT (approved) | Engaged ≥2× passive AND (≥5% power at home era OR a consumed output) — anything that can't clear it after B1-B5 gets folded, with a sim reading per system. |

Every row keeps its Compendium/coverage/380px/44px/reduced-motion obligations from the
ruling. Nothing here is cut — it is sequenced behind a sound base.

## A.39 (continued) THE INTERLOCK PHASE, PART B — checkpoint two: the export spine (B1+B2 build record)

The headline of the ruling, built whole: **one export per shell, made by that shell's own
craft, demanded by the next shell's signature infrastructure, Loam→Aleph** — with Serra
hauling every left-behind export down the stair so the spine can gate but never softlock.
"A partially-wired spine is worse than none" — so nothing shipped until every edge had its
producer, its consumer, its Serra fallback, its UI surface, and its test, in one motion.

### The chain as built

| Home | Export | Made by | Demanded by |
|---|---|---|---|
| Loam | **Kilnflux** | Refinery chain "The Kiln Firing" (a true-orphan input + marl, YIELDS 6/firing) | EVERY Crucible pour, hit or miss — once `transmuteUnlocked` |
| Ferrite | **Lodeframe** | `produceExport`: 60 Scale + 60 Lodestone at the Crucible | Greenhouse plots past four (`installFrame`) + the Loom's iron frame (`installLoomFrame`, one-time; no commit without it) |
| Verdance | **Set Resin** | `produceExport`: 150 Sap + 60 Resin at the Still | every mirror past the fourth |
| Verdance | **Fibercloth** | every committed weave yields 1 | Observatory exposures: tiers 1-2 want 1, tier 3 wants 2; the 10-min glance stays free |
| Glassmere | **Ground Lens** | `produceExport`: 90 Silica + 45 Prism at the Bench | Ember Array rows past the first (`installSocket`, one lens per row) |
| Glassmere | **Glasseal** | `produceExport`: 70 Silica + 30 Rime at the Bench | vent pipe sections 13-24 (`FREE_PIPES = 12`) |
| Cinder | **Emberglass** | THE ANNEAL: every 90 cumulative in-band seconds of a LIVE Array burn (`ANNEAL_SEC`; work keeps across band exits, unlike the sustain streak; the banked fire anneals nothing) | Hollow rebuilds past eight cells + arming every Echo Chamber recording ("the tape is cut in glass") |
| Hollow | **Resonance** (already a currency) | listening | writing any Axiom: `AXIOM_RESONANCE = 25` per law |

Deviations from the pinned wording, each forced by a fact in the code and preserving the
ruled intent (A.36 rule: the ledger is a claim, the codebase is the evidence):

- **"plots 4-6"** — the greenhouse base was already 4 free plots (mastery-gated 4/6/8), so
  the iron gate lands on plots FIVE onward: `plotCount = min(masteryCap, 4 + frames)`.
  Mastery reveals the room; Ferrite iron builds the bed. Nothing a save already had is lost
  (grandfather below).
- **"Resin"** — `resin` is already a Verdance CURRENCY (the brew leg). The export material
  is **Set Resin** (`setresin`), rendered FROM that economy at the Still, so the
  Hold-riding, Breach-surviving material never collides with the currency.
- **"vents past N"** — the heat sim's every stance lays the same three-outlet route, and it
  is **11 unique cells** (cell 17 sits in both the spine and the spur), so N = 12 free
  sections: the full standard gallery joins dry, and the idle-never-floods guarantees never
  meet the gate (export-spine.test.ts pins the route ≤ FREE_PIPES).
- **"Kilnflux (Refinery chain)"** vs the unlock order — the crucible opens at Ferrite
  mastery 2 but transmutation (which fires the flux) at mastery 6. THE CURRICULUM LAW IS
  HELD BY CONSTRUCTION: the pour's flux toll begins exactly when `transmuteUnlocked` flips
  — the bill starts the moment the player can pay it, and a softlock window cannot exist
  (tested). Serra sells flux from her ferrite arrival as the second road.
- **`source:'worked'`** — implemented as the existing `worked: true` mechanism (the thing
  that already keeps materials out of every drop table); a new source union member would
  have silently changed `pickMats` filtering in the guild.
- **Resonance rides Recursion** — a law is written in 25 Resonance, and most Axioms are
  bought right after recursing, when the world (and its Resonance) would have washed. So
  Resonance joins the meta currencies that survive Recursion: the toll sequences writing
  after listening and can never wall off the Rewrite it feeds (p10.test.ts pins the carry).
  Serra bottles 25-measure packs once the Hollow is behind you (breachCount ≥ 6).

Chain-law compliance: the firing consumes a true regex-orphan (the refinery test's own
standard) — and because every loam orphan is rare-tier, the chain got the one mechanism
extension of the phase: `TransmuteChain.yield` (default 1). One flawless stone is a BATCH
of six flux, an outing rather than a per-pour toll.

### Serra's export shelf

`stall: { kind: 'exports' }` on Serra; a new deterministic branch in `stockFor`: every
export whose home shell ordinal < breachCount, qty 4 at 70% purity, priced 26 + 12/shell of
haul — NEVER rotated (the shelf is the no-softlock guarantee, so it must not roll away),
plus the bottled Resonance pack at breach 6. Worked materials cannot leak into the ore
stalls because `materialsOfShell` already filters `worked`.

### Grandfathering (save v22 → v23)

The spine gates infrastructure; a save that already BUILT that infrastructure keeps every
stick of it. The migration reads the evidence: greenhouse beds beyond four → that many
frames granted; a loom that ever committed → framed; fuel standing in a deeper Array row →
that many sockets. Fresh saves start with none of it (tested both ways).

### UI (rule 5: systems say what they do)

Two shared pieces in `ui/components/exports.tsx` — `ExportProduceRow` (name, held count,
costs, who wants it, one Make button) and `InstallButton` (the consuming verb with the
export named, held count shown, engine refusal surfaced verbatim). Wired: Crucible (flux
line on the pour + failed pours now surface their reason + Cast Lodeframe), Greenhouse
(Frame bed n of cap), Loom (Brace the frame; the commit button names its Fibercloth
yield), Still (Render Set Resin), Bench (grind/cast rows), Observatory (per-tier cloth
costs on the buttons), Array (closed rows drawn dark with ×, socket install, live anneal
progress line), Vents (seal note past twelve), Hollow (rebuild button prices the glass;
Record a tape · 1 Emberglass), Rewrite (write · 1 Axiom + 25 Res). Every consumer's
refusal names the export AND both roads to one (make it at home / buy it from Serra).

### Verification

- **756 tests green** (731 + the new export-spine.test.ts suite of 20 + adjusted
  neighbors), tsc clean, production build clean.
- **export-spine.test.ts** walks every edge both ways (blocked dry with the reason naming
  the export; paid with it), pins the curriculum-by-construction rule, the anneal, the
  Serra shelf at every breach count, the v23 grandfather, and the free-route ≤ 12 fact.
- **audit-recipes.ts extended to the export graph** (B2): LAW 1 never dug (worked), LAW 2
  producible at home (chain inputs at-or-above home shell; recipe currencies from the home
  shell's own chip/conv/byproduct/signature set — polarity's Lodestone documented), LAW 3
  Serra lists it at every later rung. Exit 1 on violation. Run: clean. The compendium
  checker also caught one real authoring bug before any test did: the Kilnflux flavor text
  originally NAMED both chain inputs — a pillar-5 spoiler — and the flavor now keeps the
  discovery.
- **Live UI proof** (playwright, `sim-out/spine-shots/`): 16/16 surfaces present across
  ferrite/verdance/glassmere/cinder/hollow/guild seeds, including a real click on the
  Cast Lodeframe button producing 0→1, and Serra's shelf listing "hauled up from" rows.
- **380px**: 0px document and nav overflow in all four progression states.
- **Both coverage checkers clean**: 37/37 systems with 3-layer copy; Compendium 374
  entries (the 7 exports flow in via the registries), no gaps, no orphans, no spoilers.
- **Sims**: the play policy gained `provisionSpine` — a competent player provisions the
  shell below before leaving (fires flux when short, casts frames, renders resin, grinds
  lenses, sockets the grate) and falls back to Serra where the stair left them short —
  which is exactly the sim-side proof of the curriculum law: if a gate were unpayable, the
  run would stall and the harness would show it. Collapse layer: carry-verify PASS (33.6%
  worst share ≤ 50%, implied return-to-peak ~13.3% ≥ the 10% floor). Full-ladder (60h
  active) and cinder-scenario (8h balanced) runs recorded below.

### The leaks the sim caught (TWO free-materials faucets, found not regressed)

The moment materials became LOAD-BEARING, the sim's material counts exposed faucets that had
been quietly minting worked materials for phases — the export spine doing exactly its job.

**Faucet 1 — Museum expeditions.** The first 12h run held 9 Kilnflux / 12 Fibercloth with
ZERO firings and one weave. Root cause: expedition hauls drew from an UNFILTERED shell pool
(`MATERIALS.filter(m => m.shellId === from.id)`), so it could hand out any worked material of
the shell. Fixed with `&& !m.worked` (the law rollDrop/materialsOfShell/the stalls already
obey).

**Faucet 2 — cracked geodes.** The re-run STILL held 17 Kilnflux / 29 Fibercloth. Root
cause: `crackGeodeRolls` filtered combat-only (`!m.source`) but NOT worked — so a rich Loam
geode rolled Kilnflux and a rich Verdance geode rolled Fibercloth, both bench exports
appearing in the seam. (`rollDrop` had the filter; its geode sibling had drifted.) BOTH
functions also fell back to `MATERIALS[0]` on an empty pool — and `MATERIALS[0]` is
`refineslag`, itself worked — so the fallback was a third latent leak. Fixed: `!m.worked` on
the geode pool, and a shared `FALLBACK_DROP` = the first MINEABLE material instead of
`MATERIALS[0]`. Pinned by a brute-force test rolling both functions across every shell ×
depth band (nothing worked may fall out). The honest re-run's numbers are recorded below.

The lesson (A.36 again): the ledger is a claim, the codebase is the evidence — and a
sim reading materials is a sharper evidence-gatherer than a test suite that never thought to
ask "can you dig up a Lodeframe?"

SIM RESULTS (12h active, both faucets closed — the numbers that prove the gate):
- **Materials track ONLY their producers now.** Leaky run (pre-fix): flux 17, cloth 29 with
  0 firings and ~1 weave. Clean run (both faucets closed): **flux 6** (one Kiln Firing ×
  yield 6, nothing from a faucet), **cloth 1 held** (1 weave + 4 hauled by Serra − 4 spent on
  Observatory exposures), **lenses ground 4** at the Bench, **frames cast 1** + Serra-hauled,
  **glass 0** (no sustained Array burn reached this run). Every count reconciles to a real
  producer or a Serra purchase — the export gate holds.
- **Pacing unaffected:** loam floor / Breach-1 at 430m, Ferrite d150 at 470m, Breach-2 at
  479m, Verdance d150 at 541m, Breach-3 at 569m, Glassmere d150 at 659m — the same healthy
  cadence as before the spine. **Breach RTP 9.1%** (≤25% target; a second run read 13.2%,
  both in band).
- **Collapse layer:** carry-verify PASS independently (33.6% worst-share ≤ 50%, implied
  return-to-peak ~13.3% ≥ the 10% floor).
- **Serra's fallback exercised:** 6 fallback buys (4 Fibercloth) — the anti-softlock road is
  live in play, not just present in the registry.
- The provisioning policy reaches Glassmere by 11h and never stalls on a spine gate: the
  curriculum law holds in play exactly as the static audit and export-spine.test.ts assert.
