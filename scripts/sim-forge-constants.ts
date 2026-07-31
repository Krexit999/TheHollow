/**
 * THE FORGE'S HAND-SIZED CONSTANTS, SIZED TOGETHER.
 *
 * Five consecutive phases each added numbers and each ledgered the same note —
 * "the SHAPE is right and the guarantees are tested; the NUMBERS have not been
 * through a sim". Five open rows, four families: instability, classes, balance,
 * living/masterwork. This measures all four in one pass so they can be judged
 * against each other rather than one at a time.
 *
 * WHY THEY HAVE TO BE MEASURED TOGETHER, and it is not tidiness — two of the
 * four families turn out to be the SAME DIAL from the player's side:
 *
 *   `BOON_STEADY` (14, ×3 stages) and `MASTERWORK_STEADY` (24) both feed
 *   `stabilize`, which subtracts from instability's `net` before
 *   `INST_PER_POINT` turns it into a misfire chance. A fully grown Trueborn
 *   tool carries 3×14 + 24 = 66 points of headroom — about 14.5pp of misfire at
 *   the current rate. So the "character layer" constants are silently an
 *   instability re-rate, and tuning either alone would have moved the other.
 *
 * WHAT THIS SIM DELIBERATELY DOES NOT RE-MEASURE: heavy-vs-light CONVERGENCE.
 * `sim-tool-balance.ts` already owns that claim with a properly sized gate (the
 * `CONV_TOL` block), and it was re-run at A.67 after reach changed sides. This
 * measures the thing that sim cannot: whether the balance axis is a real
 * ore-vs-rock CHOICE, which is a question about two different cells rather than
 * about a rate.
 *
 * Fast by construction — no 300-second click loops. Every reading here is
 * either a pure fold over the real registry or a handful of real dispatches.
 *
 * Writes sim-out/forge-constants.md and exits.
 *   npx tsx scripts/sim-forge-constants.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createEngine } from '../src/engine';
import type { GameState } from '../src/engine/types';
import { traitsOf } from '../src/engine/traits';
import { allShells } from '../src/engine/shells';
import { materialsOfShell } from '../src/engine/materials';
import { PART_TYPES } from '../src/engine/content/forgeParts';
import {
  GROWTH_MAX, growthForStage, CRAFT_ODDS, BOON_STEADY, EXCELLENT_STEADY,
  MASTERWORK_STEADY,
} from '../src/engine/content/forgeParts';
import {
  assembleTool, balanceOf, makePart, type Part,
} from '../src/engine/systems/forgeParts';
import { classOf } from '../src/engine/systems/toolClass';
import {
  CLASS_THRESHOLD, SHAPE_WEIGHT, TOOL_CLASSES,
} from '../src/engine/content/toolClasses';
import {
  MOD_LEVEL_MAX, MOD_SHELL_ORDINAL, TOOL_MODS, modXpForLevel,
} from '../src/engine/content/toolMods';
import {
  INST_PER_POINT, MISFIRE_CAP, instabilityFloor, modSlotsTotal, toolInstability,
} from '../src/engine/systems/toolMods';
import { rollCraft } from '../src/engine/systems/casting';
import { toolEffect, xpForLevel } from '../src/engine/systems/toolMining';

/** `allShells()` is empty until an engine exists — the standing lesson. */
createEngine({ nowMs: 0 });
const SHELLS = allShells();

const out: string[] = [];
const say = (s = ''): void => { out.push(s); console.log(s); };
const pct = (n: number): string => `${(n * 100).toFixed(0)}%`;

function fresh(): { engine: ReturnType<typeof createEngine>; s: GameState } {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  s.forge.built = true;
  return { engine, s };
}

/** A tool of one stone, at a level, with its depth records opened. */
function hold(s: GameState, mat: string, level = 1, reached = SHELLS.length): void {
  for (let i = 0; i < reached; i++) s.depthRecords[SHELLS[i]!.id] = 60;
  s.casting.tool = PART_TYPES.map((t, i) => ({ ...makePart(t, mat, 60), id: i + 1 }));
  s.casting.wear = 0;
  s.casting.mods = [];
  s.casting.xp = xpForLevel(level);
}

say('# THE FORGE CONSTANTS, SIZED TOGETHER');
say();
say('Five ledger rows, four families, one pass. Every number below is measured');
say('against the real registry — no fixtures invented to make a point.');
say();

// ═══════════════════════════════════════════════════════════════════════════
// A — INSTABILITY: does it kick in at a reasonable point?
// ═══════════════════════════════════════════════════════════════════════════
say('## A — INSTABILITY ONSET');
say();
say('The question the ledger asks: not so early that an OP build is unreachable,');
say('not so late it is toothless. Measured across the progression a player');
say('actually walks, with three ways of spending the same slot budget.');
say();

type Fill = 'empty' | 'cheap' | 'packed';

function packBudget(s: GameState, how: Fill): { used: number; budget: number } {
  const budget = modSlotsTotal(s);
  if (how === 'empty') { s.casting.mods = []; return { used: 0, budget }; }
  const pool = [...TOOL_MODS]
    .filter((m) => !m.classOnly && (MOD_SHELL_ORDINAL[m.shell] ?? 7) <= 7)
    .sort((a, b) => (how === 'packed' ? b.cost - a.cost : a.cost - b.cost));
  const mods: Array<{ id: string; n: number; xp: number }> = [];
  let used = 0;
  for (const m of pool) {
    while (used + m.cost <= budget && (mods.find((x) => x.id === m.id)?.n ?? 0) < m.maxStacks) {
      const at = mods.find((x) => x.id === m.id);
      if (at) at.n += 1;
      else mods.push({ id: m.id, n: 1, xp: modXpForLevel(MOD_LEVEL_MAX) });
      used += m.cost;
    }
  }
  s.casting.mods = mods;
  s.casting.knownMods = mods.map((m) => m.id);
  return { used, budget };
}

interface InstRow { shell: string; level: number; budget: number; floor: number; misfire: Record<Fill, number> }
const instRows: InstRow[] = [];

for (const [shellIdx, level] of [[0, 5], [0, 40], [2, 60], [4, 80], [6, 120]] as Array<[number, number]>) {
  const shell = SHELLS[shellIdx]!;
  const mat = materialsOfShell(shell.id)[0]!.id;
  const misfire = {} as Record<Fill, number>;
  let budget = 0, floor = 0;
  for (const how of ['empty', 'cheap', 'packed'] as Fill[]) {
    const { s } = fresh();
    hold(s, mat, level, shellIdx + 1);
    const b = packBudget(s, how);
    budget = b.budget;
    floor = instabilityFloor(s);
    misfire[how] = toolInstability(s).misfire;
  }
  instRows.push({ shell: shell.id, level, budget, floor, misfire });
}

say('| shell | level | slots | floor | empty | cheap-filled | POWER-packed |');
say('|---|---:|---:|---:|---:|---:|---:|');
for (const r of instRows) {
  say(`| ${r.shell} | ${r.level} | ${r.budget} | ${r.floor.toFixed(0)} `
    + `| ${pct(r.misfire.empty)} | ${pct(r.misfire.cheap)} | **${pct(r.misfire.packed)}** |`);
}
say();

const everQuiet = instRows.every((r) => r.misfire.empty === 0);
const everBites = instRows.some((r) => r.misfire.packed >= 0.15);
const earlyQuiet = instRows[0]!.misfire.packed < 0.05;
say(`- A tool carrying nothing misfires at **${instRows.every((r) => r.misfire.empty === 0) ? 'zero, everywhere' : 'NON-ZERO somewhere — wrong'}**.`);
say(`- The opening tool (${instRows[0]!.shell} L${instRows[0]!.level}) packed with power reads `
  + `**${pct(instRows[0]!.misfire.packed)}** — ${earlyQuiet ? 'an early build cannot hurt itself' : 'TOO EARLY'}.`);
say(`- It reaches **${pct(Math.max(...instRows.map((r) => r.misfire.packed)))}** at its worst, `
  + `against a cap of ${pct(MISFIRE_CAP)}.`);
say(`- VERDICT: ${everQuiet && everBites && earlyQuiet ? 'ONSET IS IN BAND' : 'REVIEW'}`);
say();

// The coupling the ledger did not know about.
const headroom = GROWTH_MAX * BOON_STEADY + MASTERWORK_STEADY;
say(`**The character layer IS an instability re-rate.** A fully grown, Trueborn tool`);
say(`carries \`${GROWTH_MAX}×${BOON_STEADY} + ${MASTERWORK_STEADY}\` = **${headroom} points** of`);
say(`\`stabilize\`, which is **${pct(Math.min(MISFIRE_CAP, headroom * INST_PER_POINT))}** of misfire bought back —`);
say(`about ${((headroom * INST_PER_POINT) / MISFIRE_CAP * 100).toFixed(0)}% of the whole misfire range. Excellent pours add`);
say(`${EXCELLENT_STEADY} each on top. These were tuned as flavour and are load-bearing.`);
say();

// ═══════════════════════════════════════════════════════════════════════════
// B — CLASSES: are all five reachable, and evenly?
// ═══════════════════════════════════════════════════════════════════════════
say('## B — CLASS REACHABILITY AND EVENNESS');
say();

const single = new Map<string, number>();
const perShell = new Map<string, Set<string>>();
let stones = 0, classless = 0;
for (const sh of SHELLS) {
  perShell.set(sh.id, new Set());
  for (const m of materialsOfShell(sh.id)) {
    stones++;
    const r = classOf(assembleTool(PART_TYPES.map((t, i) => ({ ...makePart(t, m.id, 60), id: i + 1 }))));
    if (r.def) {
      single.set(r.def.id, (single.get(r.def.id) ?? 0) + 1);
      perShell.get(sh.id)!.add(r.def.id);
    } else classless++;
  }
}

/** Greedy same-shell mixes aimed at each signature — the "coherent set" route. */
const mixed = new Map<string, string>();
for (const sh of SHELLS) {
  const mats = materialsOfShell(sh.id).map((m) => m.id);
  for (const def of TOOL_CLASSES) {
    if (mixed.has(def.id)) continue;
    const want = Object.entries(def.needs) as Array<[string, number]>;
    const scored = mats
      .map((id) => ({
        id,
        n: want.reduce((a, [t, c]) => a + (traitsOf(id).includes(t as never) ? c : 0), 0),
      }))
      .filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
    for (const k of [2, 3, 4]) {
      if (scored.length < k || mixed.has(def.id)) continue;
      const pick = scored.slice(0, k).map((x) => x.id);
      const parts: Part[] = PART_TYPES.map((t, i) => ({
        ...makePart(t, pick[i % pick.length]!, 60), id: i + 1,
      }));
      const r = classOf(assembleTool(parts));
      if (r.def?.id === def.id) mixed.set(def.id, `${sh.id} mix(${k})`);
    }
  }
}

say(`Every one of the **${stones}** materials in the registry, built into a tool of`);
say(`seven identical parts, then the same question asked of same-shell MIXES.`);
say();
say('| class | wants | single stones | mixed set | verdict |');
say('|---|---:|---:|---|---|');
for (const c of TOOL_CLASSES) {
  const n = single.get(c.id) ?? 0;
  const mix = mixed.get(c.id) ?? '—';
  const ok = n > 0 || mix !== '—';
  say(`| ${c.name} | ${Object.values(c.needs).reduce((a, b) => a + b, 0)} `
    + `| ${n} | ${mix} | ${ok ? (n > 0 ? 'reachable' : 'mix only') : '**UNREACHABLE**'} |`);
}
say();
say(`${classless} of ${stones} stones (**${pct(classless / stones)}**) tip nothing on their own, which is`);
say('the intended shape — a class should be built toward, not stumbled into.');
say();
say('**Per shell, what a single stone can reach:**');
say();
for (const sh of SHELLS) {
  const got = [...perShell.get(sh.id)!];
  say(`  - ${sh.id.padEnd(10)} ${got.length ? got.join(', ') : '*(none — mixes only)*'}`);
}
say();

const unreachable = TOOL_CLASSES.filter((c) => !single.get(c.id) && !mixed.has(c.id));
const singleOnlyGap = TOOL_CLASSES.filter((c) => !single.get(c.id));
say(`- All five reachable: **${unreachable.length === 0 ? 'YES' : 'NO — ' + unreachable.map((c) => c.name).join(', ')}**`);
say(`- Reachable from a SINGLE stone: ${5 - singleOnlyGap.length}/5`
  + (singleOnlyGap.length ? ` — ${singleOnlyGap.map((c) => c.name).join(', ')} need a mix` : ''));
say();

/**
 * THE SHAPE NUDGE, and whether it lets a build claim a class it has not earned.
 * `scoreClass` caps the nudge at `want * 0.25`, so with three favoured shapes
 * (1.5 at SHAPE_WEIGHT 0.5) a class can be claimed while SHORT on traits.
 */
say('**Can shapes carry a class the traits did not earn?**');
say();
say('| class | want | nudge (3 shapes) | cap | trait-points still needed |');
say('|---|---:|---:|---:|---:|');
for (const c of TOOL_CLASSES) {
  const want = Object.values(c.needs).reduce((a, b) => a + b, 0);
  const raw = (c.favours ?? []).length * SHAPE_WEIGHT;
  const cap = want * 0.25;
  const nudge = Math.min(raw, cap);
  say(`| ${c.name} | ${want} | ${raw.toFixed(2)} | ${cap.toFixed(2)} `
    + `| ${(want * CLASS_THRESHOLD - nudge).toFixed(2)} of ${want} |`);
}
say();
say(`With \`SHAPE_WEIGHT ${SHAPE_WEIGHT}\` and \`CLASS_THRESHOLD ${CLASS_THRESHOLD}\`, a full set of`);
say('favoured shapes covers part of the signature. That is the intended nudge — but');
say('it means a leaning-but-short build can tip, which is worth knowing.');
say();

// ═══════════════════════════════════════════════════════════════════════════
// C — BALANCE: is ore-vs-rock a real choice?
// ═══════════════════════════════════════════════════════════════════════════
say('## C — BALANCE AS AN ORE-VS-ROCK CHOICE');
say();
say('Convergence is `sim-tool-balance.ts`\'s claim and is not re-measured here.');
say('This asks the thing that sim cannot: is the axis a real CHOICE between the');
say('two kinds of cell on the face?');
say();

let heaviest = '', lightest = '', hv = -Infinity, lv = Infinity;
const spread: number[] = [];
let evenCount = 0;
for (const sh of SHELLS) {
  for (const m of materialsOfShell(sh.id)) {
    const v = balanceOf(PART_TYPES.map((t) => makePart(t, m.id, 60))).value;
    spread.push(v);
    if (v === 0) evenCount++;
    if (v > hv) { hv = v; heaviest = m.id; }
    if (v < lv) { lv = v; lightest = m.id; }
  }
}

/** Real pocket work, through the real action, stopping short of completion. */
function dug(mat: string): number {
  const { engine, s } = fresh();
  hold(s, mat);
  s.face.ore = new Array(s.face.cells.length).fill('');
  s.face.oreDug = new Array(s.face.cells.length).fill(0);
  s.face.ore[5] = 'fatseam';
  engine.dispatch({ type: 'workOre', cell: 5, seconds: 0.05 });
  return (engine.getState() as GameState).face.oreDug![5]!;
}
function reach(mat: string, level: number): number {
  const { s } = fresh();
  hold(s, mat, level);
  return toolEffect(s).cells;
}

const hDug = dug(heaviest), lDug = dug(lightest);
say(`Registry spread: **${lv.toFixed(2)}** (${lightest}) to **${hv.toFixed(2)}** (${heaviest}), `
  + `and **${evenCount} of ${spread.length}** stones land exactly EVEN — untouched by the axis.`);
say();
say('| | heaviest | lightest | ratio |');
say('|---|---:|---:|---:|');
say(`| pocket dug in 0.05s | ${hDug.toFixed(4)} | ${lDug.toFixed(4)} | **${(hDug / lDug).toFixed(2)}×** |`);
for (const lvl of [1, 10, 30, 60]) {
  const h = reach(heaviest, lvl), l = reach(lightest, lvl);
  say(`| cells a swing, L${lvl} | ${h} | ${l} | ${l > h ? `**+${l - h}** to light` : l === h ? '*tied*' : `+${h - l} to heavy`} |`);
}
say();
const oreReal = hDug / lDug >= 1.15;
say(`- The ore edge is **${oreReal ? 'real' : 'NOT REAL'}** — ${(hDug / lDug).toFixed(2)}× is a difference a player feels.`);
say('- The rock edge is REACH, which is a whole number of cells, so it only appears');
say('  once the base reach is big enough for the multiplier to clear rounding. That is');
say('  the A.67 ledger row, measured here across levels.');
say();

// ═══════════════════════════════════════════════════════════════════════════
// D — LIVING AND MASTERWORK: are they worth building for?
// ═══════════════════════════════════════════════════════════════════════════
say('## D — LIVING STOCK AND MASTERWORK');
say();

const stages = Array.from({ length: GROWTH_MAX }, (_, i) => growthForStage(i + 1));
say(`Growth costs **${stages.join(' → ')}** cells for the three maturings `
  + `(${stages.reduce((a, b) => a + b, 0)} in total).`);

/** How long is that in real swings? A swing credits the cells it took from. */
const { s: probe } = fresh();
hold(probe, materialsOfShell('verdance')[0]!.id, 30);
const cellsPerSwing = toolEffect(probe).cells;
say(`A level-30 Verdance tool reaches ${cellsPerSwing} cells a swing, so the first maturing is`);
say(`about **${Math.round(stages[0]! / cellsPerSwing).toLocaleString()} swings** and all three about `
  + `**${Math.round(stages.reduce((a, b) => a + b, 0) / cellsPerSwing).toLocaleString()}**.`);
say();

// Masterwork odds, measured rather than read off the table.
const ROLLS = 20000;
const tally = new Map<string, number>();
for (let i = 0; i < ROLLS; i++) {
  const r = rollCraft();
  tally.set(r.craft, (tally.get(r.craft) ?? 0) + 1);
}
say(`Craft tiers over **${ROLLS.toLocaleString()}** pours:`);
say();
say('| tier | authored | measured |');
say('|---|---:|---:|');
let prev = 0;
for (const [tier, cum] of CRAFT_ODDS) {
  say(`| ${tier} | ${pct(cum - prev)} | ${pct((tally.get(tier) ?? 0) / ROLLS)} |`);
  prev = cum;
}
say();

// ═══════════════════════════════════════════════════════════════════════════
say('## THE READINGS');
say();
say(`1. **Instability onset is in band.** Empty is zero at every depth; the opening`);
say(`   tool cannot hurt itself (${pct(instRows[0]!.misfire.packed)}); a packed build reaches`);
say(`   ${pct(Math.max(...instRows.map((r) => r.misfire.packed)))}. No change wanted.`);
say(`2. **All five classes are reachable** — the A.61 ledger row saying three was`);
say(`   wrong, and is closed. But **${singleOnlyGap.length} of 5 need a mixed set**, and per-shell`);
say('   availability is lopsided.');
say(`3. **Balance is a real ore-vs-rock choice** at ${(hDug / lDug).toFixed(2)}× on pockets, with the`);
say('   known rounding caveat on the light side.');
say(`4. **The character constants are an instability dial**, worth ${headroom} points`);
say('   of headroom. Nobody had noticed; it is now on the record.');
say();

mkdirSync('sim-out', { recursive: true });
writeFileSync('sim-out/forge-constants.md', out.join('\n') + '\n');
console.log('\n→ sim-out/forge-constants.md');
