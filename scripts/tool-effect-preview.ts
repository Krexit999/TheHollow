/**
 * THE NEW FORGE, STEP 3 — what a tool actually does to a swing.
 *
 * A tuning instrument, not a test. It prints the ladder the reference constants
 * in `systems/toolMining.ts` were measured off: one full tool per shell, what
 * it reaches, what it takes, how fast it works a pocket, and how many swings it
 * has in it before it needs seeing to.
 *
 *   npx tsx scripts/tool-effect-preview.ts
 */
import { createEngine } from '../src/engine';
import { PART_TYPES } from '../src/engine/content/forgeParts';
import { assembleTool, makePart } from '../src/engine/systems/forgeParts';
import {
  BARE_HANDS, REF, effectOf, tierOf, toughnessIndex, usesOf, wornPart,
} from '../src/engine/systems/toolMining';
createEngine({ nowMs: 0 });

const tool = (id: string, purity = 60) =>
  assembleTool(PART_TYPES.map((p) => makePart(p, id, purity)));

console.log('══ THE LADDER — a full tool of each shell\'s common stock ═══════════════');
console.log('shell      cells  splash  oreRate  drops  uses   tough  worn part');
console.log(`bare hands   ${BARE_HANDS.cells}    ${(BARE_HANDS.splash * 100).toFixed(0)}%      1.0x   1.00     —      —      —`);
for (const [shell, id] of [
  ['loam', 'marl'], ['ferrite', 'ironbloom'], ['verdance', 'sporewood'],
  ['glassmere', 'frostsand'], ['cinder', 'slagrock'], ['hollow', 'nothingstone'],
  ['aleph', 'firstiron'],
] as Array<[string, string]>) {
  const t = tool(id);
  const e = effectOf(t, false);
  console.log(
    `${shell.padEnd(10)} ${String(e.cells).padStart(4)}  ${(e.splash * 100).toFixed(0).padStart(5)}%  `
    + `${e.oreRate.toFixed(1).padStart(6)}x  ${e.dropWeight.toFixed(2)}  `
    + `${String(usesOf(t)).padStart(4)}  ${toughnessIndex(t).toFixed(2)}   ${wornPart(t)}`,
  );
}

console.log('\n══ BROKEN — the same tools, at the floor of the pool ═══════════════════');
for (const [shell, id] of [['loam', 'marl'], ['cinder', 'slagrock'], ['aleph', 'firstiron']] as Array<[string, string]>) {
  const t = tool(id);
  const ok = effectOf(t, false);
  const bad = effectOf(t, true);
  console.log(`${shell.padEnd(10)} whole: ${ok.cells} cells, ${(ok.splash * 100).toFixed(0)}% splash, ${ok.oreRate.toFixed(1)}x ore`
    + `   →   BROKEN: ${bad.cells} cells, ${(bad.splash * 100).toFixed(0)}% splash, ${bad.oreRate.toFixed(1)}x ore`);
  if (bad.cells < BARE_HANDS.cells || bad.splash < 0 || bad.oreRate < 1) {
    console.log('  !! a broken tool is WORSE THAN BARE HANDS — that is a trap, not a cost');
  }
}

console.log('\n══ THE MAINTENANCE TRADEOFF — same shell, different stone ═════════════');
console.log('material      traits                        tough  uses   worn part');
for (const id of [
  'graveclay', 'wormsteel', 'ochre', 'marl', 'bonechalk', 'umberjade', 'rootglass',
]) {
  const t = tool(id);
  const traits = t.traits.join('/');
  console.log(`${id.padEnd(13)} ${traits.padEnd(29)} ${toughnessIndex(t).toFixed(2)}  ${String(usesOf(t)).padStart(4)}   ${wornPart(t)}`);
}

console.log('\n══ A MIXED TOOL — one brittle part in an otherwise tough set ══════════');
const tough = assembleTool(PART_TYPES.map((p) => makePart(p, 'graveclay', 60)));
const withBrittle = assembleTool(PART_TYPES.map((p) =>
  makePart(p, p === 'edge' ? 'umberjade' : 'graveclay', 60)));
console.log(`all graveclay (dense/tough)   uses ${usesOf(tough)}   worn part: ${wornPart(tough)}`);
console.log(`+ an umberjade EDGE (brittle) uses ${usesOf(withBrittle)}   worn part: ${wornPart(withBrittle)}`);

console.log('\n══ THE REFERENCE POINTS, as tiers ═════════════════════════════════════');
const loam = tool('marl');
const aleph = tool('firstiron');
for (const [k, ref] of Object.entries(REF)) {
  const a = tierOf(loam.stats[k as 'bite'], ref);
  const b = tierOf(aleph.stats[k as 'bite'], ref);
  console.log(`  ${k.padEnd(9)} ref ${String(ref).padStart(4)}   loam tier ${a.toFixed(2)}   aleph tier ${b.toFixed(2)}`);
}
