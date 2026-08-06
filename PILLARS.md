# THE HOLLOW — PILLARS (read every session)

> Split from DESIGN.md. Locked pillars, reset ladder, spines, formulas, working rules.
> Detail lives in SPEC.md; deferrals in LEDGER.md; build records in BUILD_LOG.md.


> Read this file at the start of every session. Build only the phase you are asked to build.

## Premise
The world is a shell. Inside it is another shell. You dig down; at the bottom of one
shell you fall into the next. Seven shells, each with different physics, materials,
and systems. You are not the first one down.

Genre: incremental / idle with active depth. Browser. ~110 hours of content.

## Design pillars (LOCKED — never violate)
1. **Idle-able AND interactive — ACTIVE-FIRST (amended A.44).** The game is played
   ACTIVELY. Idle is a valid SLOWER fallback — "step away and come back to
   progress" — not "leave it running and win". Idle stays VIABLE and is never
   fully blocked; that half is locked and non-negotiable. But the economy is
   tuned for the active loop first, and **~5x is a ceiling on how much harsher a
   gate may be for an idle player, not a target to hit.** A gate running harsher
   than ~5x is a violation; one running at 2x is fine, not "undertuned".
   Convergence to ~1.3x by mid-game still describes the intended shape.

   The prior wording ("active play is ~5x idle at the start") read as a target
   and several phases tuned toward it, which is how the economy came to lean on
   the idle ratio as its design centre. It is a bound.

   **The ratio is not about income alone (amended A.42).** It binds every gate the
   player has to cross: income, the DESCENT CURVE (time-to-depth), and the MATERIAL
   DROP ECONOMY. A depth gate or a material gate that runs harsher than ~5x is a
   pillar violation even while income measures perfectly in band, because the player
   experiences the gate, not the income. A.41 measured time-to-depth at 8.3x (d35)
   and 18.7x (d44) and the drop economy at 11x while income sat where it should —
   three ratios, one pillar, and two of them silently out of band for a whole phase.
   Measure all three. `dustCost(d) = 25·1.09^d` is exponential and idle income is
   not, so the descent gate WIDENS by default: anything that gates on depth must be
   checked for that shape, not assumed to inherit income's ratio.
2. **Field regen is the hard ceiling on income.** Drills can only harvest what the
   field produces. This is what makes uncapped offline progress mathematically safe
   and forces engagement with external multiplier systems.
3. **No offline cap. Ever.** Production is rate-limited, not exponential.
   `offlineEfficiency = 0.55 + 0.03 * Persistence`, cap 0.95 (1.00 via Axiom).
   Depth does NOT advance offline until Auto-Descend is purchased.
4. **Craft-systems are never mandatory grinds, but are not skippable either.**
   Each has a Passive Rank giving ~50% of engaged play (~75% with Autoplay).
   They gate *unlocks* (specific recipes/doors), not just multipliers. Player goes
   in, finds the 3 things they need, leaves.
5. **Discovery over unlocking.** Chords, alloys, weaves, brews are found by
   experimenting. The Codex fills in as you find them. Never show a locked list.
6. **After any reset, return to prior peak in <= 20-25% of the original time.**
7. **New system, tab, or mechanic every 10-15 min for the first 3 hours.**
   No upgrade takes more than ~6 min to afford at its intended stage.
8. **The engine is headless.** Pure TS, no React/Pixi/DOM knowledge. UI is a dumb
   renderer. This is non-negotiable — it is what allows 40 systems to coexist.

## Working rule: a harness workaround is a bug report, not a fix
If the screenshot harness, the sim, or a test has to route around a layout, a
selector, or a state to do its job, THAT THING IS BROKEN FOR THE PLAYER TOO.
Fix the component, not the tool. The workaround is evidence; treating it as a
solution hides the defect behind green output.

This has cost twice, both times found from the harness and both times patched
there instead of in the game:

- The DISCLOSURE GATE overflowed its viewport and put its only dismiss button
  below the fold. The shot harness dismissed it by dispatching state instead.
  The real game was unplayable — a full-screen modal, no way out.
- The SELF_EXPLAINING exclusion set let thirteen panels skip the header. The
  audit skipped them too, so a coverage number read green while the screens it
  counted were the ones already known to be fine.

The test for whether you are doing this: if you find yourself writing "the
harness needs to X because the UI does Y" — Y is the bug.

## Working rule: a test that a function works is not a test that anything calls it
Phase 12 shipped 233 passing tests while relics never dropped, challenges could
never be won, parallel shells could never be created, and expeditions paid
nothing. Every one of those functions was individually correct and individually
tested. Nothing asserted that anything CALLED them, so five finished systems sat
unreachable behind green output.

Unit tests answer "does this work". They cannot answer "is this in the game".
For anything a player is meant to receive — a drop, an unlock, a payout, a room —
the test that matters is that a live call site exists outside the module and
outside the tests. `src/engine/__tests__/reachability.test.ts` enforces this
structurally: every dispatchable action must have a dispatch site, every
granting function must have a caller, every counter that gates a room must be
written somewhere. It found six more dead paths the moment it was written.

## Working rule: the spec is not exempt from review
This document sat backslash-escaped and unreadable for ELEVEN PHASES and nobody
noticed, because it was being read as context rather than looked at as a
document. Every session began by loading it and no session ever rendered it.

Documents rot silently and the master spec rots worst, because it is the thing
everyone trusts and nobody inspects. Re-read the locked half occasionally as a
READER — check that it renders, that its numbers still match the build, that its
claims are still true. A spec nobody audits becomes a spec that describes a game
nobody built.

## Working rule: a number in this document is not evidence
The corollary of the rule above, found in Phase 14. This document said "~90
materials" in three places while the game shipped **132**, and had done for
several phases. No test could notice, because a prose number is not connected to
anything — the registry grew and the sentence did not.

So: **counts here are the registry's, and where a number here disagrees with
`src/engine/`, the registry is right and this document is the bug.** Do not
"fix" the code to match a sentence. Measure first, then correct the sentence.

The same rule applies to a number in a *report*: three counts in the Phase 14
Part A analysis were wrong (one of them describing a flaw that did not exist),
and each was caught only by measuring it again before acting on it. A finding
you have not re-measured is a hypothesis, including your own.

## Working rule: put the invariant in the type, not in the reviewer
`dropChance` and `cellCap` were bucket names that do not exist. They passed
review, passed tests, registered into nothing and paid nothing for a whole
phase. The registry could not catch them because the CONTENT definitions typed
their bucket as `string` and cast at the call site — and a cast is a promise
the compiler is required to believe.

So: when a value must come from a fixed set, **type it as that set at the point
it is authored**, not at the point it is used. If a call site genuinely holds a
string, give it a checked constructor that THROWS on a bad name — never a cast.
A cast is how you tell the compiler to stop helping.

And note that this class has three separate failures which look identical in a
green test run: the name can be wrong, the name can be right but read by
nothing, and the SHAPE can be wrong (additive vs multiplicative). Each needs
its own guard. Passing one proves nothing about the others.

## Working rule: a cut is provisional, and its reason can dissolve
Phase 16 cut tool-variants-within-a-tier for a specific reason: ~40 authored
recipes re-checked against the curriculum law, with a lopsided ladder if
half-done. Phase 17 reversed the cut — not because the reason was wrong, but
because it dissolved. It was true for AUTHORED variants and false for
COMPOSITION: author the part system once, and every tier gets choice uniformly,
for free.

So when you cut something, record WHY in enough detail that a later phase can
check whether the reason still holds. A cut justified by "too much authored
content" falls the moment someone finds the emergent version. Do not treat a
past cut as settled; treat its stated reason as a claim to re-test.

The mirror of the Phase 14 lesson (a reported FLAW that did not reproduce): here,
a reported cost that a different approach did not incur. Both are the same
discipline — re-measure the claim before you act on it, including your own.

## Working rule: a structural unlock must never gate behind the wall it is needed to cross
Added A.42. The general form of the worst bug this project has shipped, and the
one nothing could see: **the DRILL BAY — the only thing that lifts an idle
player off the ~10% seepage floor to near the field ceiling — unlocked at Loam
depth record 55, while the tier-II hardness wall sits at depth 44.** The system
that makes the crossing possible was locked behind the crossing.

An active player passes 55 in minutes, so the gate read as a 45-minute beat and
the code comment said so. An idle player sat at a tenth of ceiling income for
**eight and a half hours**, forging a tier-II tool at a tenth of ceiling income,
in order to unlock the machines that would have made the tool. Every downstream
measurement — descent time-to-depth, drop rate, the whole idle/active ratio —
was reading that one inversion and blaming a curve.

So, before shipping any gate:

- **Name what the unlock is FOR.** If a system exists to make some stretch of
  the game passable, its gate must sit BEFORE that stretch, not inside it.
- **Check the gate against both players.** A depth, a currency total or a
  material count means two very different things to a hands-on player and an
  idle one; pillar 1 says both paths must exist. A gate tuned on one is
  untested, not fine.
- **Look for the cycle.** Draw the arrow: bay needs depth 55 → depth 45 needs
  tier II → tier II needs materials → materials need the bay. Any such loop is
  a structural bug, not a balance number, and no amount of tuning opens it.

The tell is a system whose whole purpose is to make progress possible, gated on
progress. When you find one, the fix is ordering, not cost.

## EVERY PACING NUMBER MEASURED BEFORE A.42 IS VOID
Not "suspect" — void. The sim's collapse policy fired at the first profitable
depth (40) instead of when a run stopped making ground, so **every run in this
project's history reset four steps short of Loam's first hardness wall**, over
and over, for both policies. It was not an idle-only distortion: correcting the
rule moved the ACTIVE player's Loam-floor beat from ~490 minutes to ~115.

That policy produced the numbers in SPEC.md's pacing map, in BUILD_LOG's phase
reports, and in the "settled" active family this project has quoted for several
phases. They measured a player who does not exist. The map's own marks — ✓
MEASURED, ≈ DERIVED, ? UNMEASURED — are all downgraded by one: a ✓ from before
A.42 means "measured against a broken policy", which is weaker than derived.

Re-baselining is in flight (`sim-out/descent-a42.md` and the A.42 ledger rows).
Until a row carries a post-A.42 reading, do not quote it, do not tune against
it, and do not treat a discrepancy with it as a regression.

The general lesson is the one below, in its most expensive form: the harness had
been wrong the whole time, and every green number it produced agreed with every
other green number it produced.

## ...AND EVERY ACTIVE-ARM NUMBER MEASURED BEFORE A.108 IS VOID TOO
It happened again, the same shape, six years of commits later — which is why
this heading sits directly under the last one rather than replacing it.

**Both sim hands swung at a pocket the engine refuses.** `manualChip` returns
nothing for an ore cell, and a pocket's regen floor rides its RICHER cap, so an
ore cell settles above every plain cell and wins "fullest" permanently. From a
fresh save: first pocket at **11 seconds**, then **17923 of 17971 strokes —
99.7%** — dispatched at a cell the engine had already refused. `chipConcentrated`
had the softer half: its window-advance gate asks whether every cell is
compacted, and a cell that cannot be chipped never compacts.

**And no simulated player had ever built a machine.** 27 build actions exist and
the harness dispatched none, so the plant, Flow contention, all five condition
rules, the §55 cascade and every break sat behind a gate no arm had opened.

So every number describing an ACTIVE player is void — the idle arm barely
chipped and is much less affected, which is exactly why the two looked
convergent. Measured after the fix:

- The active/idle gap was quoted as **1.007x**. That was DEPTH alone, and depth
  really has converged (0.99x). The other two gates pillar 1 binds had never
  been read next to it: **income 1.39x, drops 4.94x** — the drop economy sits at
  the ~5x bound while depth sits at parity. One ratio was standing in for three.
- All six §53 thresholds were mis-sized; five crossed on the way in.
  `greatFlip`'s recorded six-to-one seed spread was not "the nature of the only
  rolled measure" — it was chain-banking being rare enough that a lucky layout
  dominated. It now reads inside one unit across seeds.
- §23's beats are COMPRESSED, not stretched: depth 66 is authored at minute 41
  and arrives at 14.3.
- `patientcell` was recorded as peaking at 8/50/73% and "never reaching its
  tell". It now reads 31% idle and **100% FOUND** on balanced and active.

A number from before A.108 that describes chipping, depth-over-time, drops, or a
threshold is not evidence. Re-measure it before quoting it, and do not treat a
disagreement with it as a regression.

## Working rule: a sim result is a claim until the harness is verified
Added A.42, after this failure bit three times in one session. The sim is the
only instrument that can see pacing, which makes it the only instrument nobody
checks — a number that arrives with a CSV attached reads as measurement even
when it is an artifact of the play policy.

Three from A.40–A.41, each of which looked like a game problem and was not:
- Idle "could not cross the first hardness wall." The policy did attempt the
  forge; the run crossed. The two 12h runs differed only by RNG — one ended at
  depth 44, the other at 109. **One run is an anecdote.** Median across seeds.
- The refusal that named no cause. `forgePlay` logged "wall-blocked" without
  saying which input was short, so the diagnosis was guesswork for a phase.
  A harness that cannot name its own failure produces confident wrong answers.
- The policy that never upgraded within a tier. It crossed a wall on the
  ladder's floor recipe and then ran a whole shell on a 0.95 spread instead of
  1.15 — worth ~14% of the loam-floor beat. The sim was modelling a player who
  does not exist.
- **The collapse rule that never asked what the reset costs (A.42, the fourth).**
  It fired on "is the payout worth it" and never on "what do I lose". While the
  drill bay opened late that was invisible — an idle player had no machines to
  lose. The moment the bay opened early, the same rule collapsed **49 times at
  depth 39**, wiping the drills each cycle, so the arm under measurement could
  never keep the bay it had just unlocked and the fix measured as a regression.
  A harness bug can make a correct change look wrong, not only a wrong one look
  right — which is the more dangerous direction, because nobody re-checks a
  negative result.

So: before a sim number becomes a finding, verify the harness produced it for
the reason you think. Ask what the policy does at the moment being measured,
whether the reading survives a re-run with different RNG, and whether the
instrument can name its own failure. This is the same discipline as "the ledger
is a claim" and "a number in this document is not evidence", pointed at the one
source that feels most like evidence. It is also why the A.42 baseline arm is
produced by the SAME binary as the treatment arm, one flag apart: a baseline
measured by different code is not a baseline.

## Working rule: the ledger is a claim, not evidence
Found at A.35, and the same family as the two rules above ("a number in this
document is not evidence"; "a comment claiming an invariant is not a test of it").
The UNBUILT ledger listed **gem cutting** and **rune casting** as UNBUILT while
both had already shipped in the P18 Workbench (`finishCut`/`gemCuts`,
`finishCast`/`CAST_RECIPES`). The rows were written from memory of what a phase
*intended to cut*, and never re-checked against what later phases actually built.
Acting on them would have meant re-building two systems that already existed.

So: **a row in the UNBUILT ledger is a hypothesis about the code, not a fact about
it.** Before you build, extend, or "finish" anything a row calls UNBUILT or
PARTIAL, verify it against `src/engine/` with an actual reference check — the way
you would verify a bug report before fixing it. Every row now carries a
`Verified against` column naming the symbol and file its status was checked at;
keep that column honest, and re-check it, do not trust it. The ledger tells you
where to *look*, never what you'll *find*.

## Freedom clause
LOCKED: the pillars above, the reset ladder, the seven shells and their signature
mechanics, the formulas in this doc, the headless architecture.

OPEN — invent freely, then append what you invented to this doc:
names, flavor text, enemy designs and behaviors, Chord/alloy/weave/brew recipes and
effects, NPC personalities and dialogue, journal text, achievement list, relic
affixes, visual style details, UI micro-interactions, extra systems that serve the
pillars. If a spec detail conflicts with fun, propose the change in comments — do
not silently ignore it.

## Reset ladder

| Layer | Trigger | Resets | Gains | Cadence |
|---|---|---|---|---|
| Collapse | Any time | Face upgrades, shell currencies, depth | Cores | ~~30-60x/shell, 4-12 min~~ **VOID — see below** |
| Breach | Reach shell floor | Cores, all shell systems, Core tree | Echoes + permanent carry of shell's signature mechanic | 7 per Recursion; 2-6h first, 25-40m later |
| Recursion | Reach Core of the World | All shells, all Echoes, back to Shell I | Axioms (rewrite generation rules) | 4-6 total; 30h first, 5-8h later |
| Spiral | Post-Recursion | Axioms | Spiral: challenges, parallel shells, Automation Grid | Endgame |

**The Collapse cadence column is VOID (A.42).** "30-60×/shell, 4-12 min" was
derived from a run that is limited by how fast you can descend. This build's run
is limited by the SHOP: only 29-56% of a run's earnings reach the stair, the
rest rebuilds the face upgrades the Collapse just wiped, and income climbs
1.36-1.53× across a single run because of it. The corrected model —
`run ≈ 12·T·(I_final/I_mean)/f` — predicts 29.2 min against a measured 29.2 for
an active player, exactly. Measured Loam: **7-11 collapses at ~25-35 min.**

The corrected TARGET lives in SPEC.md's pacing section. The ladder's STRUCTURE
(what resets, what it pays, the formulas below) is untouched and still locked;
only the empirical cadence figure was wrong, and it was wrong because its model
was, not because the game drifted. Do not tune the game toward the void number.

```
Cores  = floor( 2 * (Depth / 40)^1.5 )
Echoes = floor( 3 * (CoresEarnedThisBreach / 200)^0.6 )   // was /500 — A.44
Axioms = floor( (TotalEchoes / 8)^0.8 )                   // was /25  — A.44
Spiral = floor( sqrt(TotalAxioms) * RecursionCount )
```

**THE RATE CONSTANTS ARE RE-RATED TO THE REAL CADENCE (A.44). The STRUCTURE is
still locked.** Four layers, what each resets, what each pays, and the SHAPE of
every formula (the exponents — diminishing returns on farming a rung) are
unchanged and remain locked. Only the divisors moved, and they moved because
they were sized against the **voided 30-60 collapses/shell**. At the real
cadence of 7-11 they starved the two rungs above Collapse:

- 3·(508/500)^0.6 = 3 echoes at the measured Breach 1, × 7 breaches = 21
  echoes, and floor((21/25)^0.8) = **0 Axioms for a complete first Recursion**.
  At natural play (breach on reaching the floor, ~130 cores) the first Axiom
  arrived at **Recursion FOUR**. Twenty Axioms are authored; four were
  reachable in an entire playthrough.
- A full 16-slot Automation Grid cost **192 Spiral against a lifetime supply of
  ~12** — the mechanism that makes a re-climb fast, priced 16x out of reach.

The Axioms are where the fold-down lives (`firstWord` starts a Recursion with
Kiln/Bay/Forge standing; `gentleFall` keeps twenty levels of every face upgrade
through a Collapse), so **the layer that makes re-climbing fast was the layer
nobody could reach.** Sized in `scripts/a44-ladder.ts` against a RANGE of
cores-per-breach, not one assumed rate. Grid slots re-rated to
`1+floor(n/12)` (full board 20) and licences to `1+n`, so a full board is an
endgame commitment that competes with parallel worlds for one purse.

**If the cadence moves again, these divisors move with it.** They are not
taste; they are a function of collapses-per-shell, and that number has been
wrong twice.

**The Breach is the emotional core.** You permanently keep that shell's signature
mechanic, weakened, in every future world. By Shell VI the mining face runs five
stacked mechanics at once. The payoff is qualitative, not a multiplier.

**Axioms are rule rewrites, not multipliers.** ~20 of them: cells never fully
deplete / drills chip two cells per stroke / the Kiln runs in reverse / Collapse no
longer resets the Core tree / offline runs at 100% / occupy two shells at once.

## The four progression spines (run under everything, never conflict)

- **Delver XP** — all actions grant XP. Never resets, not even on Recursion.
  `xpToLevel(L) = 100 * L^1.9`, cap L200. 1 skill point/level, +3 every 10th.
- **Delver Skill Tree** — 3 branches x 22 nodes, free respec.
  Extraction (face, tools, chip yield) / Industry (converters, throughput,
  automation) / Insight (discovery rate, craft-systems, prestige formulas).
  ~200 pts to max, so builds diverge.
- **Shell Mastery** — per-shell level 1-50 from depth records only. Gates that
  shell's advanced systems. Never resets.
- **Tool Tiers** — I-XV. Each tier needs materials from the current shell AND one
  shell above, forcing older shells to stay alive. Tier hard-gates cell hardness.


## The math

```
cap     = 8 * (1 + 0.50 * Roots)
regen   = 0.08 * (1 + 0.25 * Soil)         // charge/sec/cell
Y       = (1 + 0.35 * Blade) * PROD(globalMults)
DPS_max = W * H * regen * Y                 // hard ceiling
```

Opening: 6x6 = 36 cells, cap 8, regen 0.08 -> 2.88 dust/sec idle, 288 stored at full.
Manual chipping at 2 clicks/sec on full cells ~16 dust/sec.
First upgrade costs 50 Dust ~ 7 clicks ~ 4 seconds in.

Cost curves — `totalCost(n) = base * (r^n - 1) / (r - 1)`

| Class | Ratio | Target levels | Example |
|---|---|---|---|
| Spam | 1.15 | 40-120 | Blade, Soil |
| Standard | 1.25 | 20-45 | Drill count, Kiln rate |
| Structural | 1.75 | 6-15 | Field expansion, Foundry slots |
| Tree node | ~~1.55~~ **1.40** (A.44) | 10 | Core tree |

**Core tree — CORRECTED A.44. The old passage described a tree this game does
not have.** It read: "node base 2, r=1.55, 10 levels = 296 Cores. 28 nodes ~
6,000 Cores to max. Player earns ~800 in Shell I, ~2,400 in Shell III -> tree
completes around Shell V." Three things were wrong, and the third is structural:

- **14 nodes, not 28** (`CORE_NODES`), costing **7,562** at the old ratio, not 6,000.
- **A Loam arc pays 478 Cores, not ~800** (measured, `sim-out/a44-confirm`).
- **The tree CANNOT "complete around Shell V", because `doBreach` wipes it**
  (`state.collapse.nodes = {}`, breach.ts:106). The reset ladder above says so;
  this passage assumed accumulation across shells and contradicted it.

The Core tree is a **PER-SHELL build**, rebought in every world out of that
world's Cores, and tranche 2 is gated on `breachCount >= 1` so the first shell
can only spend on tranche 1. At r=1.55 a Loam arc bought **26% of tranche 1** —
not enough to max one node — while the descend curve compounded at 1.09/depth.
Within a shell the Core tree IS the permanent income growth, which is why this
was the deep-end residual after A.44's horizon fix took ~29%.

Re-rated to **r = 1.40**: a Loam arc affords ~56% of tranche 1 (a real build,
still a choice), rising to the full tree only in the last shell. Because
`coresForDepth` scales with depth while this price is flat, any change here
must be checked at BOTH ends — see `scripts/a44-coretree.ts`.

Depth (**corrected A.44 — this document was stale, the code was right**):

```
dustCost(d) = 25 · 1.09^min(d,150) · 1.035^clamp(d−150, 0, 150) · 1.02^max(0, d−300)
```

The 1.09 spine holds for a shell's first 150 depths, then the DEEP TAPER (1.035)
and the ABYSS TAPER (1.02) take over — amended in the code at A.16 and openly
recorded there, while this file went on printing the un-tapered `25 · 1.09^d`
for the better part of thirty phases. `prestigeMath.ts` is the authority.

d=40 -> 785 / d=100 -> 138K. Cumulative ~ 12x the final step, so the last
stretch always dominates.

**Loam is on the raw 1.09 spine for its whole arc** (floor 150), which makes it
the steepest shell in the game — and it is the shell every pacing number in this
project comes from. A beat measured in Loam is an upper bound on the shells
below it, not a representative sample.

Sanity check (Shell IV, depth 300, 10-min run): need ~5e13 dust in 600s -> 8.3e10 DPS.
Field 20x20 with Soil 80 = 680 charge/sec, so need Y ~ 1.2e8. Available:
Blade 200 (x71) * Lattice chords (x50) * Core tree (x500) * Echoes (x20) *
Alloys (x15) * Relics (x10) * Achievements (x5) = 2.7e10. Comfortable headroom —
the player should feel overpowered right before the next wall.

