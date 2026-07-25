# THE HOLLOW — System Improvements (v2: bigger, connected)

Rethought with a bigger appetite. The goal is a large, entertaining, interconnected game —
so the filter is **only the pillars**, not "is this too ambitious."

**The four hard rules an idea must not break:**
1. **Pillar 1 — idle stays viable.** Nothing may *require* active play. Active can pay
   *more*; idle can never be *blocked*.
2. **Pillar 2 — the ceiling holds.** Nothing generates raw income outside the regen
   ceiling. Timed multipliers, unlocks, recipes, and *things* are fine; free-money faucets
   are not.
3. **Pillar 4 — nothing mandatory.** Engaging pays more; ignoring is slower, never walled.
4. **Pillar 5 — discovery stays discovery.** Recipes/combos are found, never listed.

Everything that survives those four is on the table now — including the big connective
systems I cut too eagerly before (relic history, museum exhibits, NPC community, world
reactivity). The only things still cut are genuine **pillar breaks** and genuine
**genre-swaps** (an economy/colony sim so big the mining game disappears).

Format per system: **PROBLEM · FIX · CONNECTIONS · CHANGE-or-CUT.**

**The spine v2 wires toward:** you dig → the world produces materials → materials feed
craft → craft feeds tools, relics, exhibits → those feed NPCs, expeditions, economy →
which feed prestige → which changes what the next dig produces. Today most systems only
touch the modifier pipeline. v2's job is to wire them to *each other* so the game feels
like one living place.

---

# TIER 1 — Identity systems. Build first; they define each shell.

## PRESSURE (Cinder)
**Problem.** A thermometer. Watch it rise, lower it, mastered. Governor, vents, hold-line,
yield bonus are four disconnected parts. The scary shell is a number.

**Fix.**
- **Vent types** as a toolkit: Emergency (fast, wastes fuel) · Recovery (slow, efficient) ·
  Recycling (excess → bankable charge spent elsewhere) · Cooling (heat → feeds another
  system).
- **Pressure Profiles** — modes (Stable/Burst/Overdrive/Efficient-Idle) setting vents,
  governor, hold-line in one switch. Idle picks Efficient-Idle, safe forever.
- **Physical feedback** — pipes shake, gauges climb, building groans, alarm grows. Feel
  danger without the number. Reduced-motion = static danger states.
- **Real builds** — permanent-95% (doubled bonuses, one slip from flood) vs safe-40% vs
  burst-cycler. Opt-in, never forced.
- **Pressure Crystals** — a late material that only forms in overpressurized pipes. Running
  hot becomes the way to get a specific input. Ceiling-safe (a drop gated on a chosen state).

**Connections.** ← Kiln (makes pressure) · Vent Network (routes) · → Greenhouse (cooling
steam, real cross-shell feed) · → Forge (overpressure rolls better stats) · → Ember Array
(overcharge) · → Beam (stabilize without venting) · → Collapse (lifetime-pressure record →
small prestige bonus). Becomes Cinder's production hub.

**Cut.** Turbines/electricity/power grids (income outside ceiling). Forced pressure storms
(idle punish). Engineer-management sim.

## THE BEAM (Glassmere)
**Problem.** Rich (routing/mirrors/wavelengths) but you *read* it, not play it. Solve once,
never changes, never return.

**Fix.**
- **Beam Presets / "where do I send it today"** — save named routes (Growth/Mining/
  Pressure-stabilize/Exposure), swap them. Passing through a system = *timed* boost
  (multiplier inside the ceiling, never permanent income). Best single upgrade in the doc;
  already half-built in the Bench.
- **Mirror types** — Polished (perfect) · Bronze (dims per bounce) · Crystal (splits) ·
  Living (rotates while active). "Which mirror here," not "place mirror."
- **Wavelengths with behavior** — Red rewards long paths (compounds) · Blue short · Green
  leaves a consumable trail · White harmonizes. Each color a different small game.
- **Board drift** — cells slowly change over a run; a perfect route decays; you return to
  re-optimize. Gentle, idle-safe.

**Connections.** Glassmere's cross-system router: → Greenhouse/Mycelium (bursts) · → Forge
(timed cheaper forging) · → Pressure (stabilize) · → Observatory (better exposure). Bench ↔
Beam (solve a puzzle → unlock a wavelength; charged cells power the Bench). → Collapse
re-seeds the chamber each reset (new nodes/wavelengths).

**Cut.** Beam literally powering all production (ceiling). Global Harmony state. Forced
beam-event interrupts.

## THE DRILL BAY
**Problem (yours).** Same 5 heads since Loam; pick best material, clone across 24. A lookup.

**Fix.** Heads **trade not rank** (lean on the 4 targeting behaviors) · **bits specialize by
context** (a bit great in Ferrite underperforms in Verdance) · **reward a varied bay** (a
synergy a cloned fleet can't get) · **named drills develop preference** through use (reuse
tools-that-learn). Legible tradeoffs, reason don't guess.

**Connections.** → Relics (which drill uncovered a relic = its history) · → Materials (the
idle producer feeding the spine) · → Shaft (heads/bits interact with Rerouting/Cave-Ins) ·
→ Expeditions (send a configured drill as equipment).

**Cut.** Breakage as a *requirement* (foreseeable-wear-with-floor is fine). Personalities
gating output.

## THE FORGE
**Problem (yours).** One menu, drag slider to green, done. Gems/runes show no payoff.

**Fix.** **Kill the timing slider** — the real skill is parts+materials+traits (tools-from-
parts is built; finish it so the forge screen *is* that choice). **Forging stages you
influence** (heat/fold/quench as sub-choices shifting the spread, discovered). **Show every
contribution** (gem/rune/temper/alloy numbers in the breakdown). **Signature outputs**
behind trait+temper+rune combos, discovered not listed.

**Connections.** ← Refinery (materials) · ← Crucible (bindings) · ← Still (quench) · ←
Pressure (overpressure rolls) · → Museum (a legendary tool = an exhibit) · → Economy
(Blacksmith pays for purity) · → Relics (resonance modifies a forge). The convergence point
of the material spine.

**Cut.** Reflex minigame (the slider in costume).

## THE ECONOMY / CARAVAN / MERCHANTS
**Problem.** Flat "+X currency." One NPC, one price, no decision.

**Fix.** **Merchant personalities** — Miner pays for raw ore, Collector for relics,
Scientist for unidentified materials, Blacksmith for high-purity alloys. *Who* you sell to
is a decision tying Hold/relics/Forge to the sell screen. **Rep moves price.** **Slow,
action-driven price drift** — discover a big deposit and its local price softens; the
Lamphouse growing lifts demand. You read the world, you don't day-trade it. **Merchant
discovery** via expeditions.

**Connections.** ← Hold/Refinery/Forge · ← Expeditions (finds merchants, moves supply) · →
Contracts (trade orders — extend the existing board) · → Museum (identifying multiplies
value) · → Lamphouse (shared rep).

**Change from v1.** Reinstated moving prices as *slow/legible* drift. **Still cut:** multi-
region market sim, black-market faction, mandatory trading (Pillar 4).

---

# TIER 2 — Collection & identity. Where "big" comes from.

## RELICS
**Problem (yours + source).** 200 commons, infinite scroll, infinite fusing, nothing
matters. And they're stat-modifiers with rarity colors — you remember "I got a rare," not a
story.

**Fix — two halves.**
*Economy (your complaint):* 6 equipped slots are the whole game; unequipped = raw material.
Curb infinite stacking (hold cap forcing salvage/fusion, or auto-collapse dupes into fusion
material). Fusion costs something real (non-destructive but not free). Visible rising floor.

*Identity (the source's good idea, reinstated):*
- **Every relic has history** — the game knows where/when/how/which-drill; surface it. "The
  Compass of Foreman Ellis — collapsed East Lift, Run 6, depth 428, your Prospector drill."
  Near-zero cost, huge attachment.
- **Relics awaken** — dormant → small effect → bigger effect + story + a real unlock (a
  route, a Lamphouse line). One relic = a small progression path. Discovery + idle-friendly.
- **Relics adapt to use** — an expedition relic gets better at expeditions; a high-Pressure
  relic grows pressure bonuses. You *shape* relics through play.
- **Equipped-set resonance** — some relics recognize each other; set bonuses. Real build-
  building.

**Connections.** ← Drills/Warrens/Expeditions/Wells (source *becomes* the story) · → Museum
(display; sets = exhibits) · → Lamphouse (awakened relics unlock dialogue) · → Expeditions
(relics unlock routes) · → Forge/Pressure/Beam (relics modify systems). The biggest reason
to explore.

**Change from v1.** Reinstated the whole identity half — flavor + light unlocks, pillar-
safe, and where the "memorable big game" feeling lives. **Still cut:** relics with full AI
that "talk," mood-management chores.

## THE MUSEUM
**Problem.** Cases with a flat bonus. Low reason to engage.

**Fix.** **Build actual exhibits** — you choose where a relic goes; some look/work better
together. **Exhibit synergy = a discovery system** — the right items together form a hidden
named exhibit ("The Last Shift") with a real global bonus, discovered by arranging, never
listed (Pillar 5). **Identify → value** — research identifies an unknown, tells its story,
multiplies worth. **Curation gates relic fusion tiers** (planned edge).

**Connections.** ← Relics/Warrens/Expeditions · → Economy (identified sells for more) · →
Lamphouse (community discusses exhibits; standing rises) · → Collapse (exhibits persist).
Turns a 20-hour collection into a payoff + a second discovery layer.

**Change from v1.** Reinstated exhibits + synergy + identify — a discovery system for near-
free. **Still cut:** museum-tycoon (ticketed visitors on schedules, curator staff, traveling
exhibitions, restoration jobs).

## THE LAMPHOUSE / NPCs
**Problem (yours).** Quests make no sense; UI packed. (Source: NPCs static.)

**Fix.** **Legible quests** (plain objective + pay; declutter). **A community that changes**
— evolving dialogue as you hit milestones ("you found something down there?" → later → "no
one's explored more than you"). **Shared rep** unlocking real recipes/discounts/routes/relic
dialogue. **NPCs care about different things** — Historian↔artifacts, Miner↔discoveries,
Explorer↔depth — so different play earns different allies.

**Connections.** ← Relics/Museum/Expeditions/Economy (everything is noticed here) · →
Contracts (NPCs post the good jobs) · → Expeditions (NPCs join as crew) · → Merchants
(shared rep). The social hub where progress reflects back.

**Change from v1.** Reinstated reactivity + meaningful rep. **Still cut:** settlement social-
sim (mood management, rooms to furnish, arguments to mediate).

## RUNE INSCRIPTION
**Problem (yours).** You barely notice runes. No felt payoff.
**Fix.** Make effects visible and worth it. Keep positional grammar (adjacency+order,
discovered); surface *that the rules exist*. **Runes read the tool's temper/alloy** — a rune
means something different on ember-quenched vs frost.
**Connections.** ↔ Forge/Temper/Alloy · → Relics (relic boosts an inscription) · → mining &
combat (where effects land).
**Cut.** Bricking items (ruled out).

## THE LATTICE
**Problem (yours).** Max it, place shapes, done.
**Fix.** A real second half — new motifs, new adjacency rules, Progressions at scale so the
board keeps asking new questions. Show chord scaling as a goal.
**Connections.** ↔ Confluences (a chord that changes a cross-system interaction) so it plugs
into the interlock spine.
**Cut.** Nothing — the bones are good, it just stops halfway.

## BREWING / THE STILL
**Problem.** Forgettable spikes, no identity.
**Fix.** **Combos** (two brews → a third, discovered) · **failed brews → byproducts** ·
**recipes discovered by doing.** Locked: spikes not sustains.
**Connections.** ← Greenhouse/Mycelium · → Forge (quench) · → Expeditions/combat · → Beam (a
brew that shifts a wavelength).
**Cut.** Master-Distiller tree, potion personalities, forced events.

---

# TIER 3 — World-feel. Cheap, high charm, makes it feel big.

## GREENHOUSE / MYCELIUM / LOOM (Verdance)
**Problem (yours).** Confusing, little info, useless-feeling.
**Fix.** Each payoff a *produced thing*, not a % (Growth feeds the spine — surface it). Loom
solves for emergent shapes (show the rules). Mycelium as a spreading board you shape,
connected nodes sharing a visible bonus, a completed network as a goal.
**Connections.** → Brewing (ingredients) · → Beam (growth bursts) · → Pressure (cooling
steam) · → export spine (feeds Glassmere).
**Cut.** Farming/ecology sim. *(Flag: Mycelium's payoff is currently unmeasurable in sim —
ledgered. Verify before heavy investment.)*

## ALLOY CRUCIBLE
**Problem (yours).** Select amounts + catalyst + click. Should feel like a crucible.
**Fix.** Physical pour — drag ores in, watch them combine — without losing sparse-ratio
discovery (Pillar 5). Alloys carry input traits.
**Connections.** ← Hold/Refinery · → Forge (bindings) · → Economy (Blacksmith).
**Cut.** Nothing structural — feel + legibility rebuild.

## OBSERVATORY
**Problem.** Long timers, flat payout.
**Fix.** Star charts as a *structured collection* completing into real unlocks (routes,
recipes, wavelengths).
**Connections.** ↔ Beam/Bench · → Expeditions (charts reveal routes) · → Relics (identify
origin).
**Cut.** Predicting cut mechanics.

## MAGMA WELLS
**Problem.** A lone slot machine.
**Fix.** Keep the opt-in gamble; legible honest odds; a "read the well" tell that slightly
rewards attention.
**Connections.** → Relics/Materials (rare drops) · → Pressure (hot changes well behavior).
**Cut.** Mandatory income engine.

## EXPEDITIONS
**Problem (yours).** Good but too simple.
**Fix.** Customizable routes (behavior, optional intercept/assist), named crew with traits,
AFK-first, encounters with remembered choices.
**Connections.** ← Lamphouse (crew) · ← Drills (equipment) · → Relics/Merchants (finds
both) · → Economy (moves supply) · → Museum (brings exhibits).
**Cut.** Crew-management sim; permadeath/injury as a requirement.

## BESTIARY
**Problem.** A stat sheet.
**Fix.** Notes earned by fighting/observing; collection with completion rewards; watch/
track/photograph as light actions.
**Connections.** → combat (known creatures telegraph clearer) · → Museum (trophies) · →
Contracts (hunt orders).
**Cut.** Combat-farming optimal; info overload.

## WARRENS
**Problem (yours).** The quizzes are "EHH."
**Fix.** Keep the hand-built dungeon + unique + discovery→investigation→choice→reward.
**Replace the quiz** with a short puzzle or fight. The end choice (restore/extract/preserve)
has a remembered consequence.
**Connections.** → Relics (a Warren's flavor of relic) · → Museum/Lamphouse (choice
discussed) · → Rune/Echo Language (inscriptions to decode).
**Cut.** Multi-Warren meta-archive.

## DELVER (SKILL TREE)
**Problem (yours).** Maxed in Loam; 24/66 nodes authored.
**Fix.** Author the full tree (points always have a home across shells). A few real cross-
system nodes (Delver+Forge/+Bestiary/+Expeditions). Gate depth behind shells.
**Connections.** Touches every system by design — make the cross-nodes real.
**Cut.** Everything-at-once presentation.

## COLLAPSE
**Problem (yours).** The most-repeated screen is insignificant.
**Fix.** A real run summary (earned/depth/vs last), a felt reward, a clear "what this
bought." Optional Collapse types. Persistent shaft traces (rails, memorials, an old drill
core) that survive and make the column feel lived-in.
**Connections.** ← everything · → Core tree/meta · → Shaft (traces).
**Cut.** Heavy ceremony (fires 30-60×/shell — keep fast).

## ACHIEVEMENTS
**Problem (yours).** Should be a cool interactive art menu.
**Fix.** A real screen; row/column bonuses as goals; tiered feats (Spark→Flame→Beacon→
Legend) unlocking titles/museum pieces/NPC reactions.
**Connections.** → Titles/Lamphouse/Museum.
**Cut.** Grind-mandatory achievements.

## KILN / VENT NETWORK / EMBER ARRAY
Under Pressure's hub. Kiln: fuel types, overstoke, bank heat. Ember Array: consume Bench
lenses, feed the Beam.

---

# BUILD ORDER (fun-per-cost, pillar-safe)
1. **Pressure** — makes Cinder an identity.
2. **Beam presets** — biggest single upgrade, half-built.
3. **Relics (both halves)** — fixes your #1 complaint + the biggest "big game" layer, cheap.
4. **Drills** — kills the worst lookup.
5. **Museum** — collection → discovery payoff.
6. **Merchants + Lamphouse reactivity** — the world feels alive.
7. **Forge** — fixes the core-craft loop.
8. **Lattice second half / Rune legibility / Brewing combos** — finish the halfway systems.
9. **Tier 3 world-feel pass** — batch the charm.

# THE PRINCIPLE
Stop making the player watch a number. Give them a thing to do, a choice to make, a reward
they can see — and wire it to two other systems so the world feels like one place. The only
cuts are pillar breaks (free income, idle-mandatory) and genre-swaps (a sim so big the
mining game disappears). Everything else that makes the game *big* is in.
