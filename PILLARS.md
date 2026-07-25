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
1. **Idle-able AND interactive.** Idle is always viable. Active play is ~5x idle at
   the start, converging to ~1.3x by mid-game. Active play matters most when the
   player has least.

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
| Collapse | Any time | Face upgrades, shell currencies, depth | Cores | 30-60x/shell, 4-12 min |
| Breach | Reach shell floor | Cores, all shell systems, Core tree | Echoes + permanent carry of shell's signature mechanic | 7 per Recursion; 2-6h first, 25-40m later |
| Recursion | Reach Core of the World | All shells, all Echoes, back to Shell I | Axioms (rewrite generation rules) | 4-6 total; 30h first, 5-8h later |
| Spiral | Post-Recursion | Axioms | Spiral: challenges, parallel shells, Automation Grid | Endgame |

```
Cores  = floor( 2 * (Depth / 40)^1.5 )
Echoes = floor( 3 * (CoresEarnedThisBreach / 500)^0.6 )
Axioms = floor( (TotalEchoes / 25)^0.8 )
Spiral = floor( sqrt(TotalAxioms) * RecursionCount )
```

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
| Tree node | 1.55 | 10 | Core tree |

Core tree: node base 2, r=1.55, 10 levels = 296 Cores. 28 nodes ~ 6,000 Cores to max.
Player earns ~800 in Shell I, ~2,400 in Shell III -> tree completes around Shell V.

Depth: `dustCost(d) = 25 * 1.09^d`
d=40 -> 785 / d=100 -> 138K / d=200 -> 7.6e8 / d=300 -> 4.2e12 / d=400 -> 2.3e16
Cumulative ~ 12x the final step, so the last stretch always dominates.

Sanity check (Shell IV, depth 300, 10-min run): need ~5e13 dust in 600s -> 8.3e10 DPS.
Field 20x20 with Soil 80 = 680 charge/sec, so need Y ~ 1.2e8. Available:
Blade 200 (x71) * Lattice chords (x50) * Core tree (x500) * Echoes (x20) *
Alloys (x15) * Relics (x10) * Achievements (x5) = 2.7e10. Comfortable headroom —
the player should feel overpowered right before the next wall.

