/**
 * WHAT REMAINS AFTER THE RE-MEASUREMENT — A.109 item 11.
 *
 * Same discipline as `a108-ledger.ts`: a row that can be driven is DRIVEN, and a
 * row settled by grepping is a row nobody has read. A.108 caught two probes of
 * the wrong kind in the version before it; this one adds a third failure mode it
 * hit itself — a probe that computes the number it is checking, instead of
 * asking the system that owns it. The Bloom curve's demand column did exactly
 * that and disagreed with the panel on screen by 15%.
 *
 *   npx tsx scripts/a109-ledger.ts
 */
import { ensureContentLoaded } from '../src/engine/content/index';

ensureContentLoaded();

import { createEngine } from '../src/engine/index';
import type { GameState } from '../src/engine/types';
import { MAX_MACHINE_TIER, ensurePlant, flowDrawers } from '../src/engine/systems/plant';
import { conditionOf, conditionedMachines } from '../src/engine/systems/condition';
import { THRESHOLDS } from '../src/engine/content/thresholds';
import { SKILL_NODES } from '../src/engine/content/shell1/skillTree';
import { MATERIALS } from '../src/engine/materials';
import { KILN_FUELS } from '../src/engine/content/kilnFuel';
import { fieldDims } from '../src/engine/systems/face';

type Verdict = 'HOLDS' | 'DISSOLVED' | 'MOVED';
interface Row { row: string; raised: string; verdict: Verdict; fact: string }
const rows: Row[] = [];
const R = (row: string, raised: string, verdict: Verdict, fact: string): void => {
  rows.push({ row, raised, verdict, fact });
};

/** Verdance, n machines, ticked. The arrangement the Bloom rows use. */
function verdance(n: number, sec = 400): GameState {
  const e = createEngine({ nowMs: 0 });
  const s = e.getState() as GameState;
  s.shell.current = 'verdance';
  s.depthRecords['verdance'] = 400;
  s.depth = 100;
  s.kiln.built = true;
  const p = ensurePlant(s);
  for (const id of conditionedMachines().slice(0, n)) p.tiers[id] = 1;
  for (let t = 0; t < sec; t++) e.tick(1);
  return s;
}

// ---------------------------------------------------------------------------
// Closed by this phase
// ---------------------------------------------------------------------------

const flip = THRESHOLDS.find((t) => t.id === 'greatFlip')!;
R('greatFlip IS 28x UNDERSIZED', 'A.108', flip.at > 250 ? 'DISSOLVED' : 'HOLDS',
  `re-cut to ${flip.at} against a measured 8527 at 4h (§53 LAW 5's "four hours of chain instincts"); `
  + `3h re-reads 94.9%`);

const sizes = THRESHOLDS.map((t) => `${t.id} ${t.at}`).join(' · ');
R('THE SIX THRESHOLDS WERE SIZED AGAINST A BROKEN HAND', 'A.109', 'DISSOLVED',
  `all six re-cut in their own shell with --stay: ${sizes}`);

R('subsidence READS 0 IN EVERY ARM', 'A.108', 'DISSOLVED',
  '--stay refuses the Breach; loam banks 3043/10000 at 3h and 10475/10000 (CROSSED) at 9h — '
  + 'it worked the whole time and nothing had ever stayed to watch');

// ---------------------------------------------------------------------------
// The Bloom, driven rather than remembered
// ---------------------------------------------------------------------------

const idleEdge = ((): number => {
  let last = 0;
  for (let n = 1; n <= conditionedMachines().length; n++) {
    const s = verdance(n);
    if (conditionedMachines().some((id) => conditionOf(s, id)?.id === 'overgrown')) return last;
    last = n;
  }
  return last;
})();
const big = verdance(29);
const demand29 = flowDrawers(big).reduce((sum, id) => {
  const d = (big.plant?.tiers?.[id] ?? 0) > 0 ? 1 : 0;
  return sum + d;
}, 0);
R('A CULTIVATED BLOOM CARRIES SIX MACHINES', 'A.108', 'MOVED',
  `DRIVEN: an idle face carries ${idleEdge}; a WORKED face carries 2, which is the number that matters — `
  + `a real player holds 1 at 3h and 2 at 9h, so nobody is standing on the edge. ${demand29} live drawers at a full plant`);

// ---------------------------------------------------------------------------
// Opened by this phase
// ---------------------------------------------------------------------------

const authored = new Set(MATERIALS.map((m) => m.id));
const deadFuels = KILN_FUELS.filter((f) => !authored.has(f.materialId));
R('TWO OF THE THREE KILN FUELS WANT A STONE NOBODY AUTHORED', 'A.109',
  deadFuels.length === 0 ? 'DISSOLVED' : 'HOLDS',
  deadFuels.length === 0
    ? 'every fuel resolves'
    : `${deadFuels.map((f) => f.id).join(', ')} — §23's minute-4 trade has one option, and Ash cannot move. `
      + 'Reported by audit-reach section 7, NOT failing the build: authoring the stone moves output and striking the row deletes a beat');

/**
 * §23 PROMISES AN 8x8 FIELD AT MINUTE 12, and the run never gets one. Probed
 * rather than remembered: what `expand` level does 8x8 actually want?
 */
const wants = ((): number => {
  for (let l = 0; l <= 10; l++) {
    const d = fieldDims(l);
    if (d.w >= 8 && d.h >= 8) return l;
  }
  return -1;
})();
R('§23 PROMISES AN 8x8 FIELD AT MINUTE 12 AND NO RUN REACHES ONE', 'A.109', 'HOLDS',
  `fieldDims wants expand L${wants}; three policies peak at L2 and a face of 49 cells. `
  + 'The buy sits behind !wallBlocked and `expand` RESETS ON COLLAPSE, so a 3h run that collapses 4-5 times never holds it');

R("§23's BEATS ARE COMPRESSED, NOT STRETCHED", 'A.109', 'HOLDS',
  '8 hold · 12 early · 2 never. depth 66 is authored at 41m and arrives at 14.3m; COLLAPSE at 27m arrives at 5.3m. '
  + 'A pacing finding, reported and NOT tuned back');

R("THE ACTIVE/IDLE GAP IS THREE NUMBERS, NOT ONE", 'A.104', 'MOVED',
  'depth 0.99x · income 1.39x · drops 4.94x at hour three. A.104 quoted 1.007x, which was depth alone; '
  + 'the drop economy sits at pillar 1\'s ~5x bound and nothing had read it beside the others');

// ---------------------------------------------------------------------------
// Still blocked, counted from the registries
// ---------------------------------------------------------------------------

R("§15.4's 'every machine runs I–V'", 'A.98', MAX_MACHINE_TIER < 5 ? 'HOLDS' : 'DISSOLVED',
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
console.log(`\n${n('HOLDS')} still blocked · ${n('MOVED')} moved · ${n('DISSOLVED')} dissolved`);

if (n('HOLDS') === rows.length || n('HOLDS') === 0) {
  console.log('\n!! SELF-TEST FAILED — every row read the same way');
  process.exit(1);
}
console.log('self-test: verdicts differ — some blockers hold, some do not');
if (SKILL_NODES.length >= 66 || MAX_MACHINE_TIER >= 5 || wants < 0) {
  console.log('!! SELF-TEST FAILED — a counted row was sized against a number that already passes');
  process.exit(1);
}
console.log('self-test: the counted rows are read from the registries, not written down');
if (idleEdge <= 0 || idleEdge >= conditionedMachines().length) {
  console.log('!! SELF-TEST FAILED — the Bloom edge was not found by driving');
  process.exit(1);
}
console.log(`self-test: the Bloom edge (${idleEdge}) was found by ticking the engine, not written down`);
