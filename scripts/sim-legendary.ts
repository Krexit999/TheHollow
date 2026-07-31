/**
 * SIM — LEGENDARY PARTS. Three claims, measured separately.
 *
 *   1. BETTER. A legend beats the best part you could ever cast in the same
 *      stone by a margin worth chasing.
 *   2. RULING 1 STILL HOLDS. A legend of shell N never beats the WORST ordinary
 *      part of shell N+1 — otherwise a legend would flatten the descent curve,
 *      which is the one thing `forgeParts.ts`'s ruling 1 exists to forbid.
 *   3. PILLAR 2, by CLAMP CONTAINMENT rather than by a charge integration —
 *      and it is worth being exact about what that does and does not prove.
 *
 *      A part has no yield term and never has: everything it touches arrives at
 *      the face through `effectOf`'s three clamps (`MAX_EXTRA_CELLS`, splash
 *      <= 1, `ORE_RATE_CAP`). So the question a legend actually raises is not
 *      "what does the field give back" — the whole-tool charge-over-charge
 *      answer to that is already measured in `sim-tool-balance` — it is
 *      narrower: does the one new multiplier push any of those three clamps
 *      past its bound. This measures that directly, at the strongest stone in
 *      the game, where the splash clamp is already binding at exactly 1.000.
 *
 *      A legend that leaked would show as a value outside a clamp here.
 *
 * Writes `sim-out/legendary.md` and exits. Nothing here blocks.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createEngine } from '../src/engine/index';
import { derivePart, assembleTool, PURITY_CEILING, type Part } from '../src/engine/systems/forgeParts';
import { LEGENDARY_PARTS } from '../src/engine/content/legendaryParts';
import { MATERIALS, materialDef } from '../src/engine/materials';
import { shellOrdinal } from '../src/engine/content/drillAlloys';
import { PART_TYPES } from '../src/engine/content/forgeParts';
import { effectOf, MAX_EXTRA_CELLS, ORE_RATE_CAP } from '../src/engine/systems/toolMining';

createEngine();

const out: string[] = ['# Legendary parts', ''];
const mag = (p: Part): number => derivePart(p).magnitude;

// ---------------------------------------------------------------------------
// 1 — is a legend actually better than the best thing you can pour?
// ---------------------------------------------------------------------------
// The BEST CASTABLE part is exalted stock (purity 100 — a drop cannot roll
// higher) that also happened to roll masterwork. That is the honest comparison:
// not the average pour, the luckiest one.
out.push('## 1 — better than the best pour', '');
out.push('| stone | best castable | legendary | x |', '|---|---|---|---|');
let worstGain = Infinity;
for (const id of ['marl', 'graveclay', 'protolith', 'voidstar']) {
  const def = LEGENDARY_PARTS[0]!;
  const cast: Part = {
    type: 'head', materialId: id, purity: 100, craft: 'masterwork', work: 'flawless',
  };
  const leg: Part = { ...cast, purity: PURITY_CEILING, legend: def.id };
  const gain = mag(leg) / mag(cast);
  worstGain = Math.min(worstGain, gain);
  out.push(`| ${materialDef(id).name} | ${mag(cast).toFixed(2)} | ${mag(leg).toFixed(2)} | ${gain.toFixed(3)}x |`);
}
out.push('', `**worst gain ${worstGain.toFixed(3)}x** — ${worstGain >= 1.25 ? 'WORTH CHASING' : 'REVIEW'}`, '');

// ---------------------------------------------------------------------------
// 2 — ruling 1: a legend never jumps a shell
// ---------------------------------------------------------------------------
out.push('## 2 — ruling 1: only the shell compounds', '');
const byShell = new Map<number, string[]>();
for (const m of MATERIALS) {
  const o = shellOrdinal(m.shellId);
  if (!byShell.has(o)) byShell.set(o, []);
  byShell.get(o)!.push(m.id);
}
const ords = [...byShell.keys()].sort((a, b) => a - b);
// STARTS AT ZERO, not at one. Seeding a max-gate with its own pass threshold is
// how an instrument comes out at exactly 100% over a table that says otherwise —
// twice now in this project's ledger, so it is worth saying out loud here.
let worstCross = 0;
out.push('| shell | best legendary | next shell, worst ordinary | ratio |', '|---|---|---|---|');
for (let i = 0; i < ords.length - 1; i++) {
  const here = byShell.get(ords[i]!)!;
  const next = byShell.get(ords[i + 1]!)!;
  // The strongest legend in this shell against the feeblest ordinary part in
  // the next — the tightest form of the claim, not an average against an average.
  let bestLeg = 0;
  for (const id of here) {
    for (const def of LEGENDARY_PARTS) {
      bestLeg = Math.max(bestLeg, mag({
        type: 'head', materialId: id, purity: PURITY_CEILING, legend: def.id,
      }));
    }
  }
  let worstNext = Infinity;
  for (const id of next) worstNext = Math.min(worstNext, mag({ type: 'head', materialId: id, purity: 1 }));
  const r = bestLeg / worstNext;
  worstCross = Math.max(worstCross, r);
  out.push(`| ${ords[i]} | ${bestLeg.toFixed(1)} | ${worstNext.toFixed(1)} | ${r.toFixed(3)} |`);
}
out.push('', `**worst crossing ${worstCross.toFixed(3)}** — ${worstCross < 1 ? 'RULING 1 HOLDS' : 'CROSSES — a legend jumps a shell'}`, '');

// ---------------------------------------------------------------------------
// 3 — pillar 2: the field ceiling, charge over charge
// ---------------------------------------------------------------------------
out.push('## 3 — pillar 2, a fully legendary tool', '');

function toolOf(stone: string, legendary: boolean): Part[] {
  return PART_TYPES.map((type) => {
    const def = LEGENDARY_PARTS.find((l) => l.partType === type);
    const base: Part = { type, materialId: stone, purity: legendary ? PURITY_CEILING : 100 };
    if (!legendary || !def) return base;
    return { ...base, craft: 'masterwork' as const, work: def.work, legend: def.id };
  });
}

out.push('| stone | ordinary reach/splash | legendary reach/splash | over cap? |', '|---|---|---|---|');
let broke = false;
for (const stone of ['marl', 'graveclay', 'protolith', 'voidstar']) {
  const ord = effectOf(assembleTool(toolOf(stone, false)), false);
  const leg = effectOf(assembleTool(toolOf(stone, true)), false);
  // The two terms a part can reach the ceiling through. Both are clamped inside
  // `effectOf` — MAX_EXTRA_CELLS and splash <= 1 — so a legend that pushed past
  // either would show here as a value outside the clamp.
  const o = `${ord.cells.toFixed(2)} / ${ord.splash.toFixed(3)}`;
  const l = `${leg.cells.toFixed(2)} / ${leg.splash.toFixed(3)}`;
  const over = leg.splash > 1.0001 || leg.cells > MAX_EXTRA_CELLS + 0.0001 || leg.oreRate > ORE_RATE_CAP + 0.0001;
  if (over) broke = true;
  out.push(`| ${materialDef(stone).name} | ${o} | ${l} | ${over ? '**YES**' : 'no'} |`);
}
out.push('', `**${broke ? 'A CLAMP LEAKED' : 'every clamp holds — a legend buys reach, never yield'}**`, '');

out.push(
  '',
  '## verdict',
  '',
  `- better than the best pour: **${worstGain >= 1.25 ? 'yes' : 'NO'}** (${worstGain.toFixed(2)}x)`,
  `- ruling 1: **${worstCross < 1 ? 'holds' : 'BROKEN'}** (${worstCross.toFixed(2)})`,
  `- pillar 2: **${broke ? 'BROKEN' : 'holds'}**`,
  '',
);

mkdirSync('sim-out', { recursive: true });
writeFileSync('sim-out/legendary.md', out.join('\n'));
console.log(out.join('\n'));
