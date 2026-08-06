/**
 * WHAT REMAINS AFTER THE TWO RULED FIXES — A.110 item 8.
 *
 * Same discipline as `a108-ledger.ts` and `a109-ledger.ts`: a row that can be
 * driven is DRIVEN, and a row settled by grepping is a row nobody has read.
 * A.109 added a third probe failure mode it hit itself (a probe that computes
 * the number it is checking instead of asking the system that owns it); this
 * one adds a fourth, which cost most of item 4 —
 *
 *   A PROBE THAT MEASURES THROUGH A BLOCKER READS THE BLOCKER, NOT THE THING.
 *   `--expand-keep` reported "the Collapse reset makes no difference" across
 *   three seeds, and it was true and it meant nothing: the run never reached L2,
 *   so the reset had nothing to take. Remove the blocker and the same flag
 *   separates by eleven minutes in one direction. A null result is only
 *   evidence once you have shown the mechanism could have moved.
 *
 *   npx tsx scripts/a110-ledger.ts
 */
import { ensureContentLoaded } from '../src/engine/content/index';

ensureContentLoaded();

import { MAX_MACHINE_TIER } from '../src/engine/systems/plant';
import { SKILL_NODES } from '../src/engine/content/shell1/skillTree';
import { MATERIALS } from '../src/engine/materials';
import { KILN_FUELS } from '../src/engine/content/kilnFuel';
import { LOAM_ROLL } from '../src/engine/content/shell1/roll';
import { fieldDims } from '../src/engine/systems/face';
import { allUpgrades, nextCost } from '../src/engine/upgrades';
import { decayRate, tickCompaction, ensureCompaction } from '../src/engine/systems/compaction';
import { createEngine } from '../src/engine/index';
import type { GameState } from '../src/engine/types';

type Verdict = 'HOLDS' | 'DISSOLVED' | 'MOVED' | 'RULING';
interface Row { row: string; raised: string; verdict: Verdict; fact: string }
const rows: Row[] = [];
const R = (row: string, raised: string, verdict: Verdict, fact: string): void => {
  rows.push({ row, raised, verdict, fact });
};

// ---------------------------------------------------------------------------
// Closed by this phase
// ---------------------------------------------------------------------------

const authored = new Set(MATERIALS.map((m) => m.id));
const dead = KILN_FUELS.filter((f) => !authored.has(f.materialId));
const placed = (id: string): string[] =>
  LOAM_ROLL.filter((st) => (st.remains ?? []).includes(id)).map((st) => `${st.name}@${st.depth}`);
R('TWO OF THE THREE KILN FUELS WANT A STONE NOBODY AUTHORED', 'A.109',
  dead.length === 0 ? 'DISSOLVED' : 'HOLDS',
  dead.length === 0
    ? `all ${KILN_FUELS.length} profiles resolve · ash at ${placed('ash').join(' + ')} `
      + `· loam at ${placed('loam').join(' + ')} · bound to PLACE, so neither dilutes the four Loam commons`
    : `${dead.map((f) => f.id).join(', ')} still dangle`);

const wants = ((): number => {
  for (let l = 0; l <= 10; l++) {
    const d = fieldDims(l);
    if (d.w >= 8 && d.h >= 8) return l;
  }
  return -1;
})();
R('§23 PROMISES AN 8x8 FIELD AT MINUTE 12 AND NO RUN REACHES ONE', 'A.109', 'MOVED',
  `it arrives — measured at 80.1min (78.3/80.1/81.3, three seeds), against an authored 12. `
  + `fieldDims wants L${wants}; the blockers were the Forge hoard (4-12% of shop ticks) and a `
  + 'greedy cheapest-first shopper, NOT the Collapse reset. Reachable and nowhere near its beat.');

R("§23's BEATS ARE COMPRESSED, NOT STRETCHED", 'A.109', 'MOVED',
  're-cut into the doc: §23 is now THE FIRST TWENTY-FIVE MINUTES and every clock is measured. '
  + '8 hold · 15 off · ZERO never. The residual is §23.1 — the ORDER inverts in three places, '
  + 'which is a defect rather than a reading.');

// ---------------------------------------------------------------------------
// Opened by this phase
// ---------------------------------------------------------------------------

R('THE FUEL TRADE IS LEGIBLE AND INERT', 'A.110', 'HOLDS',
  'burn rates run 20-500x above what the world hands over. At 3h marl covers 5.7% of the kiln\'s '
  + 'feeding, ash 0.2%, packed loam 0.0%; heat at minute 4 is 0.928-0.931 whichever you pick, with '
  + 'per-seed ranges that overlap completely. Marl is a pool common that falls everywhere, so the '
  + 'Kiln has burned bare for essentially every second of every game since the profiles were written '
  + '— the dangling reference was the VISIBLE half. Lowering a burn rate makes fuel matter, which '
  + 'moves output. SIZE: three numbers in kilnFuel.ts, but it is a ruling, not a fix.');

R('§23 ASKS FOR CAST PARTS BEFORE CASTING EXISTS', 'A.110', 'HOLDS',
  'the Crusher wreck lands at 7:42 and CAST at 11:18. §23\'s [13.4] argument is that the capability '
  + 'PRECEDES the demand ("you know how to cast parts, because you did it at minute 20 for an '
  + 'unrelated reason"); compression reversed it. Two more inversions in §23.1: the Hold opens '
  + 'before the descent, and the drill bay and second drill have merged into one beat.');

R('BOTH WALLS STAND UNANSWERED AT ONCE', 'A.110', 'HOLDS',
  'wall one at 3:30, wall two at 13:36, the tool that breaks either at 24:36. §23\'s authored line '
  + 'at depth 66 — "You already have the answer" — is false for eleven minutes. The largest single '
  + 'consequence of the compression, and it is structure, not a clock.');

const expandDef = allUpgrades().find((u) => u.id === 'expand')!;
const toL4 = [0, 1, 2, 3].reduce((sum, l) => sum + nextCost(expandDef, l).toNumber(), 0);
R('SHOULD `expand` SURVIVE A COLLAPSE?', 'A.110', 'RULING',
  `both arms measured, neither chosen. RESET (shipped) 78.3/80.1/81.3min · KEEP 67.5/69.2/70.4min `
  + `— about 11 minutes, 14% earlier, and peak width is L4 either way, so the reset changes WHEN and `
  + `never WHETHER. Driven separately: stand L4 up, collapse, read L0; flip the tag, collapse, read L4. `
  + `Context: L0->L4 costs ${toL4.toFixed(0)} cumulative with a dearest step of `
  + `${nextCost(expandDef, 3).toNumber().toFixed(0)}, against a Brick bank that peaks at 47-80 and is `
  + 'itself zeroed by every Collapse.');

/**
 * THE FLAKY GATE, PROBED RATHER THAN DISMISSED. `compaction.test.ts` failed once
 * during this phase and passed on every re-run, and "it was a flake" is a claim.
 * So: how often does that assertion actually fail? It wants FEWER THAN two cells
 * still at 20 after 601 seconds, on a per-cell `Math.random()` decay.
 */
const flake = ((): {
  fails: number; trials: number; rate: number; n: number; room: number; meanSurv: number; maxSurv: number;
} => {
  const e = createEngine({ nowMs: 0 });
  const s = e.getState() as GameState;
  ensureCompaction(s);
  const n = s.face.cells.length;
  let fails = 0, survSum = 0, maxSurv = 0;
  const trials = 1500;
  for (let t = 0; t < trials; t++) {
    s.face.compaction = s.face.cells.map(() => 20);
    for (let i = 0; i < 601; i++) tickCompaction(s, 1);
    const surv = s.face.compaction.filter((c) => c >= 20).length;
    survSum += surv;
    if (surv > maxSurv) maxSurv = surv;
    if (!(n - surv > n * 0.95)) fails++;
  }
  /**
   * `room` is the ARITHMETIC, and it is what the row actually rests on: how many
   * survivors the assertion tolerates. A first cut self-tested on the failure
   * RATE being non-zero — a tail event at ~0.5%, so with 400 trials the probe's
   * own guard failed about one run in seven, which is the defect this row is
   * about, inside the probe that reports it. Mean survivors is stable; the
   * tolerance is deterministic; the rate is reported and asserted on neither.
   */
  const room = Math.ceil(n - n * 0.95) - 1;
  return { fails, trials, rate: fails / trials, n, room, meanSurv: survSum / trials, maxSurv };
})();
// The row's TITLE is written from the roll, not from memory. The first cut of
// this said "about one run in twenty-five" — a number nobody had measured, sitting
// in a probe whose whole job is to measure it.
R(`A COMPACTION GATE THAT GOES RED ON CORRECT CODE ABOUT 1 RUN IN ${Math.round(1 / Math.max(flake.rate, 1e-9))}`,
  'A.110', 'HOLDS',
  `driven ${flake.trials} times: ${flake.fails} failures, ${(100 * flake.rate).toFixed(2)}%. `
  + `The assertion wants >95% of ${flake.n} cells off the terminal gate after 601s at `
  + `decayRate(20)=${decayRate(20).toFixed(4)}/s, so it TOLERATES ${flake.room} survivor(s) — against a `
  + `measured mean of ${flake.meanSurv.toFixed(2)} and a worst case of ${flake.maxSurv}. Its own comment `
  + 'predicts "about two of them will", and the threshold leaves no room for two. Not this phase\'s to '
  + 're-cut — it is a tolerance on an unrelated system — but a gate that goes red on correct code is '
  + 'how a suite stops being believed. SIZE: one number.');

// ---------------------------------------------------------------------------
// Still blocked, counted from the registries
// ---------------------------------------------------------------------------

R("§15.4's 'every machine runs I-V'", 'A.98', MAX_MACHINE_TIER < 5 ? 'HOLDS' : 'DISSOLVED',
  `MAX_MACHINE_TIER = ${MAX_MACHINE_TIER}, spec wants 5`);
R('DELVER SKILL TREE — 24 of the locked 66', 'A.36', SKILL_NODES.length < 66 ? 'HOLDS' : 'DISSOLVED',
  `SKILL_NODES = ${SKILL_NODES.length}`);

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

console.log('\nWHAT REMAINS, RE-READ BY DRIVING IT\n');
for (const r of rows) {
  console.log(`  ${r.verdict.padEnd(9)} ${r.row}`);
  console.log(`            raised ${r.raised} — ${r.fact}`);
}
const n = (v: Verdict): number => rows.filter((r) => r.verdict === v).length;
console.log(`\n${n('HOLDS')} still open · ${n('MOVED')} moved · ${n('DISSOLVED')} dissolved · ${n('RULING')} awaiting a ruling`);

if (n('HOLDS') === rows.length || n('HOLDS') === 0) {
  console.log('\n!! SELF-TEST FAILED — every row read the same way');
  process.exit(1);
}
console.log('self-test: verdicts differ — some rows hold, some do not');
if (SKILL_NODES.length >= 66 || MAX_MACHINE_TIER >= 5 || wants < 0) {
  console.log('!! SELF-TEST FAILED — a counted row was sized against a number that already passes');
  process.exit(1);
}
console.log('self-test: the counted rows are read from the registries, not written down');
/**
 * SELF-TESTED ON THE STABLE HALF. `meanSurv > 0` says the decay really is a
 * per-cell probability and cells really do survive it — if that is 0 the whole
 * row is vacuous. `room` is arithmetic and cannot roll. The failure RATE is
 * reported and asserted on NOWHERE, because guarding a ~0.5% tail event is how
 * this probe's first version failed about one run in seven: the exact defect
 * the row is about, inside the instrument that reports it.
 */
if (!(flake.meanSurv > 0) || flake.trials < 500) {
  console.log('!! SELF-TEST FAILED — no cell ever survived, so the tolerance question is vacuous');
  process.exit(1);
}
if (flake.room >= 2) {
  console.log('!! SELF-TEST FAILED — the threshold does tolerate two survivors, so the row is wrong');
  process.exit(1);
}
console.log(`self-test: survivors were ROLLED (mean ${flake.meanSurv.toFixed(2)}, worst ${flake.maxSurv}) `
  + `against a tolerance of ${flake.room} that is arithmetic`);
if (dead.length > 0) {
  console.log('!! SELF-TEST FAILED — a fuel still dangles, and the audit should already have caught it');
  process.exit(1);
}
console.log('self-test: every fuel resolves, agreeing with audit-reach section 7');
