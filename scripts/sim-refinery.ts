/**
 * THE REFINERY IS A SINK, NOT A FAUCET — measured.
 *
 * The machine has shipped and been unit-tested since Ferrite, but nobody had
 * ever put a number on the claim its whole design rests on. A unit test can say
 * "three went in and one came out"; it cannot say whether a player who refines
 * everything they own ends up with MORE than one who refines nothing. That is
 * the faucet question and it needs a measurement.
 *
 * THREE CLAIMS, EACH MEASURED SEPARATELY:
 *
 *  1. UNITS ONLY EVER FALL. Refining is a strict 3:1, so no sequence of refines
 *     can produce more material than it consumed. Walked over the whole ladder.
 *  2. WORTH DOES NOT RUN AWAY EITHER. Units falling would be meaningless if the
 *     quality gain outran it — so the real question is what a refined stack is
 *     WORTH as parts, against the same stock left alone. Measured through
 *     `derivePart`, which is where purity actually cashes out.
 *  3. IT CANNOT TOUCH THE CEILING. Purity moves `magnitude` and `intensity`,
 *     both bounded and neither anywhere near the charge path — asserted against
 *     the shell step, which is the guarantee "ruling 1" rests on.
 *
 * Writes sim-out/refinery.md and exits.
 *   npx tsx scripts/sim-refinery.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createEngine } from '../src/engine';
import type { EngineCtx, GameState } from '../src/engine/types';
import { BANDS, BAND_RANGES, materialsOfShell, type PurityBand } from '../src/engine/materials';
import { addMaterial } from '../src/engine/systems/forge';
import { refine, refinePreview, REFINE_RATIO } from '../src/engine/systems/refinery';
import { derivePart, makePart } from '../src/engine/systems/forgeParts';
import { SHELL_STEP, LINEAR_STATS, PART_TYPES } from '../src/engine/content/forgeParts';
import { allShells } from '../src/engine/shells';

const ctx: EngineCtx = { emit: () => {}, dirty: () => {} };
createEngine({ nowMs: 0 });

const out: string[] = [];
const say = (s = ''): void => { out.push(s); console.log(s); };

function bench(): GameState {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  s.forge.built = true;
  s.depthRecords['ferrite'] = 100;
  return s;
}
const held = (s: GameState, id: string, b: PurityBand): number =>
  s.materials.stacks[id]?.[b]?.count ?? 0;
const total = (s: GameState, id: string): number =>
  BANDS.reduce((n, b) => n + held(s, id, b), 0);

say('# THE REFINERY IS A SINK, NOT A FAUCET');
say();
say(`\`REFINE_RATIO\` is **${REFINE_RATIO}** — three units in, one out, one band up.`);
say(`The ladder is **${BANDS.join(' → ')}**.`);
say();

// ═══ 1. UNITS ONLY EVER FALL ═══════════════════════════════════════════════
say('## 1 — units only ever fall');
say();

const STOCK = 3 ** (BANDS.length - 1);
const s1 = bench();
const mat = materialsOfShell('loam')[0]!.id;
addMaterial(s1, mat, BAND_RANGES['poor'][0], STOCK);

say(`Start: **${STOCK}** units of the bottom band — exactly enough to walk the whole`);
say('ladder if nothing were lost, which is the point of choosing it.');
say();
say('| step | band | spent | got | units left |');
say('|---|---|---:|---:|---:|');
say(`| — | start | — | — | **${total(s1, mat)}** |`);
let step = 0;
for (const b of BANDS.slice(0, -1)) {
  const p = refinePreview(s1, mat, b);
  if (!p) continue;
  refine(s1, ctx, mat, b);
  say(`| ${++step} | ${b} → ${p.toBand} | ${p.from} | ${p.to} | **${total(s1, mat)}** |`);
}
const survived = total(s1, mat);
say();
say(`**${STOCK} → ${survived} units.** ${((survived / STOCK) * 100).toFixed(1)}% survives the full climb, `
  + `and the loss comes back as **${held(s1, 'refineslag', 'poor') || 0} slag** — deferred, not destroyed.`);
say();

// ═══ 2. WORTH DOES NOT RUN AWAY ════════════════════════════════════════════
say('## 2 — and the WORTH does not run away either');
say();
say('Units falling proves nothing on its own: if quality outran quantity, refining');
say('would still be a faucet in the only currency that matters — what the stock is');
say('worth as PARTS. So this measures the stack through `derivePart`, summed over');
say('the linear stats, which is where purity actually cashes out.');
say();

/** What one unit at this purity is worth as a part, summed over the real stats. */
function worth(materialId: string, purity: number): number {
  const p = derivePart(makePart('head', materialId, purity));
  return LINEAR_STATS.reduce((n, k) => n + p.stats[k], 0);
}

say('| stock | units | purity | worth each | TOTAL worth |');
say('|---|---:|---:|---:|---:|');
const rows: Array<{ label: string; units: number; purity: number }> = [];
{
  const s2 = bench();
  addMaterial(s2, mat, BAND_RANGES['poor'][0], STOCK);
  rows.push({ label: 'left alone', units: STOCK, purity: BAND_RANGES['poor'][0] });
  let cur = STOCK;
  for (const b of BANDS.slice(0, -1)) {
    const p = refinePreview(s2, mat, b);
    if (!p) break;
    refine(s2, ctx, mat, b);
    cur = p.to;
    rows.push({ label: `refined to ${p.toBand}`, units: cur, purity: p.purity });
  }
}
let bestTotal = 0, baseTotal = 0;
for (const r of rows) {
  const each = worth(mat, r.purity);
  const tot = each * r.units;
  // THE BASELINE IS NOT A CANDIDATE. The first draft took a max over ALL rows
  // including 'left alone', so `bestTotal` was the baseline itself and the
  // ratio came out at exactly 100% — a gate that could not fail, printing
  // REVIEW on a table that plainly showed worth falling. Same family as every
  // instrument row in this ledger.
  if (r.label === 'left alone') baseTotal = tot;
  else bestTotal = Math.max(bestTotal, tot);
  say(`| ${r.label} | ${r.units} | ${r.purity} | ${each.toFixed(1)} | **${tot.toFixed(0)}** |`);
}
say();
const ratio = bestTotal / baseTotal;
say(`The best any refined stack is worth is **${(ratio * 100).toFixed(1)}%** of what the raw stock`);
say(`was worth. ${ratio < 1 ? 'Refining trades TOTAL worth for CONCENTRATED worth — which is exactly what a sink does.' : 'REFINING GAINS TOTAL WORTH — that is a faucet, do not ship.'}`);
say();
say('That is the whole design: you cannot get richer by refining, you can only get');
say('a BETTER SINGLE PART out of stock you were never going to use otherwise.');
say();

// ═══ 3. IT CANNOT TOUCH THE CEILING ════════════════════════════════════════
say('## 3 — and purity cannot cross a shell step');
say();
say('Ruling 1: shell is the only term that compounds. Purity is bounded, so the');
say('worst stone of a deeper shell must still beat the best stone of a shallower');
say('one — otherwise refining would be a way to skip the ladder.');
say();

const perShell: Array<{ shell: string; lo: number; hi: number }> = [];
for (const sh of allShells()) {
  let lo = Infinity, hi = -Infinity;
  for (const m of materialsOfShell(sh.id)) {
    for (const pur of [1, BAND_RANGES[BANDS[BANDS.length - 1]!][1]]) {
      const w = worth(m.id, pur);
      lo = Math.min(lo, w); hi = Math.max(hi, w);
    }
  }
  perShell.push({ shell: sh.id, lo, hi });
}
say('| shell | worst stone at purity 1 | best stone, fully refined | ratio to next shell |');
say('|---|---:|---:|---:|');
let crossings = 0;
for (let i = 0; i < perShell.length; i++) {
  const r = perShell[i]!;
  const next = perShell[i + 1];
  const crosses = next ? r.hi > next.lo : false;
  if (crosses) crossings++;
  say(`| ${r.shell} | ${r.lo.toFixed(0)} | ${r.hi.toFixed(0)} `
    + `| ${next ? `${(next.lo / r.hi).toFixed(2)}×${crosses ? ' **CROSSES**' : ''}` : '—'} |`);
}
say();
say(`\`SHELL_STEP\` is ${SHELL_STEP}. Shell boundaries crossed by refining: **${crossings}**.`);
say(crossings === 0
  ? 'A fully refined stone never beats the worst stone one shell deeper. The ladder holds.'
  : 'REFINING SKIPS THE LADDER — do not ship.');
say();

// ═══ VERDICT ═══════════════════════════════════════════════════════════════
const sink = survived < STOCK;
const noGain = ratio < 1;
say('## VERDICT');
say();
say(`- units fall: **${sink ? 'yes' : 'NO'}** (${STOCK} → ${survived})`);
say(`- total worth falls: **${noGain ? 'yes' : 'NO'}** (${(ratio * 100).toFixed(1)}%)`);
say(`- shell ladder intact: **${crossings === 0 ? 'yes' : 'NO'}**`);
say();
say(`VERDICT: ${sink && noGain && crossings === 0 ? 'A SINK. NOT A FAUCET.' : 'REVIEW'}`);

void PART_TYPES;
mkdirSync('sim-out', { recursive: true });
writeFileSync('sim-out/refinery.md', out.join('\n') + '\n');
console.log('\n→ sim-out/refinery.md');
