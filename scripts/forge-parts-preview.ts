/**
 * THE NEW FORGE, STEP 1 — what the mapping actually produces.
 *
 * A tuning instrument, not a test. The tests assert the RULES (depth dominates,
 * traits trade off, grades match their numbers, a coherent set wins); this
 * prints the NUMBERS, which is the only way to judge whether they feel right.
 * Run it after touching any constant in content/forgeParts.ts.
 *
 *   npx tsx scripts/forge-parts-preview.ts
 */
import { createEngine } from '../src/engine';
import {
  TOOL_STATS, STAT_BASE, PART_TYPES, PART_DEFS, FORGE_TRAITS, LINEAR_STATS,
  type ToolStat,
} from '../src/engine/content/forgeParts';
import {
  derivePart, makePart, assembleTool, gradeBonusOf, type Part, type ToolStats,
} from '../src/engine/systems/forgeParts';
import { materialDef, bandOf } from '../src/engine/materials';
createEngine({ nowMs: 0 });

const f = (n: number): string =>
  n >= 1e6 ? n.toExponential(2) : n >= 1000 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
const head = (s: string): void => console.log(`\n\n══ ${s} ${'═'.repeat(Math.max(0, 72 - s.length))}`);
const row = (stats: Record<ToolStat, number>, w = 8): string =>
  TOOL_STATS.map((s) => `${s.slice(0, 4)} ${f(stats[s]).padStart(w)}`).join('  ');

/** What a part is worth all in, in base units. Ruling 1 is measured on this. */
const worth = (p: Part): number => {
  const d = derivePart(p);
  return TOOL_STATS.reduce((n, s: ToolStat) => n + d.stats[s] / STAT_BASE[s], 0);
};

// ───────────────────────────────────────────────────────────────────────────
head('RULING 1 — SEVEN HEADS, ONE PER SHELL, SHALLOW TO DEEP');
for (const [id, purity] of [
  ['graveclay', 60], ['umberjade', 60], ['starmarl', 95], ['lodestone', 60],
  ['heartflame', 60], ['lacuna', 20], ['firstiron', 45],
] as Array<[string, number]>) {
  const part = makePart('head', id, purity);
  const d = derivePart(part);
  const m = materialDef(id);
  const grades = d.traits.map((t) => `${t}(${FORGE_TRAITS[t].grade[0]})`).join(' ');
  console.log(`\n${m.name}  —  ${m.shellId} ${m.rarity}, purity ${purity} (${bandOf(purity)})`);
  console.log(`  ${grades}   grade x${gradeBonusOf(m).toFixed(2)}   magnitude ${f(d.magnitude)}   WORTH ${f(worth(part))}`);
  console.log('  ' + row(d.stats, 7));
}

// ───────────────────────────────────────────────────────────────────────────
head("THE DOC'S PART TABLE — same material (marl), all seven shapes");
for (const t of PART_TYPES) {
  const d = derivePart(makePart(t, 'marl', 60));
  console.log(`${t.padEnd(8)} ${PART_DEFS[t].governs}`);
  console.log(`         ` + row(d.stats, 6));
}

// ───────────────────────────────────────────────────────────────────────────
// THE ORE-SPEED RULING, DEMONSTRATED.
//
// Both tools hold the SAME SEVEN MATERIALS — six Ferrite and one Cinder
// flawless. The only difference is which slot the good stock went into. That is
// the whole choice, and it has to read as two different tools or ore-speed did
// not need to be its own stat.
// ───────────────────────────────────────────────────────────────────────────
head('ORE-TUNED vs ROCK-TUNED — the same seven materials, assigned differently');
const FERRITE: Record<string, string> = {
  head: 'ironbloom', core: 'bluesteel', edge: 'polarite', binding: 'nullsilver',
  handle: 'rimeiron', grip: 'lodestone', sockets: 'stormcore',
};
const tuned = (deepSlot: 'head' | 'edge'): Part[] =>
  PART_TYPES.map((t) => makePart(t, t === deepSlot ? 'heartflame' : FERRITE[t]!, 70));

const rockTool = assembleTool(tuned('head'));   // the Cinder stock in the HEAD
const oreTool = assembleTool(tuned('edge'));    // the Cinder stock in the EDGE

const showTool = (name: string, t: ToolStats): void => {
  console.log(`\n${name}   depth ${t.depth}`);
  console.log('  ' + row(t.stats));
  console.log(`  ROCK RATE ${f(t.rockRate).padStart(10)}   ORE RATE ${f(t.oreRate).padStart(10)}`
    + `   coherence ${(t.coherence.factor * 100).toFixed(0)}%`);
};
showTool('ROCK-TUNED  (heartflame HEAD, ferrite elsewhere)', rockTool);
showTool('ORE-TUNED   (heartflame EDGE, ferrite elsewhere)', oreTool);
console.log(`\n  rock tool mines ROCK ${(rockTool.rockRate / oreTool.rockRate).toFixed(1)}x faster than the ore tool`);
console.log(`  ore tool mines ORE   ${(oreTool.oreRate / rockTool.oreRate).toFixed(1)}x faster than the rock tool`);
console.log(`  and their coherence is identical (${(rockTool.coherence.factor * 100).toFixed(1)}%), so this is the BUILD, not the set`);

// ───────────────────────────────────────────────────────────────────────────
// THE MISMATCH PENALTY, DEMONSTRATED.
// ───────────────────────────────────────────────────────────────────────────
head('COHERENT vs MISMATCHED — a matched Hollow set against one best part per shell');

const MISMATCHED: Part[] = [
  makePart('head', 'firstiron', 70),    // aleph    ordinal 7
  makePart('core', 'lacuna', 70),       // hollow   6
  makePart('edge', 'coronaite', 70),    // cinder   5
  makePart('binding', 'starlens', 70),  // glassmere 4
  makePart('handle', 'wildstar', 70),   // verdance 3
  makePart('grip', 'polestar', 70),     // ferrite  2
  makePart('sockets', 'starmarl', 70),  // loam     1
];
const COHERENT: Part[] = [
  makePart('head', 'umbralite', 70),
  makePart('core', 'hushslate', 70),
  makePart('edge', 'echograin', 70),
  makePart('binding', 'resonarium', 70),   // trueseated — the coherence binding
  makePart('handle', 'phantomsilver', 70),
  makePart('grip', 'voidmarl', 70),
  makePart('sockets', 'absencia', 70),
];

const rawWorth = (t: ToolStats): number =>
  LINEAR_STATS.reduce((n, s) => n + t.rawStats[s] / STAT_BASE[s], 0);
const netWorth = (t: ToolStats): number =>
  LINEAR_STATS.reduce((n, s) => n + t.stats[s] / STAT_BASE[s], 0);

for (const [name, parts] of [
  ['MISMATCHED  one best part from each of the seven shells', MISMATCHED],
  ['COHERENT    seven different Hollow materials', COHERENT],
] as Array<[string, Part[]]>) {
  const t = assembleTool(parts);
  const c = t.coherence;
  console.log(`\n${name}`);
  console.log(`  shell spread ${c.shellSpread.toFixed(2)}   variety ${c.variety.toFixed(2)}`
    + `   discord ${c.discord.toFixed(2)}`);
  console.log(`  stability index ${c.stabilityIndex.toFixed(2)}   relief ${(c.relief * 100).toFixed(0)}%`
    + `   →  COHERENCE ${(c.factor * 100).toFixed(0)}%`);
  console.log(`  raw worth ${f(rawWorth(t)).padStart(9)}   →   NET WORTH ${f(netWorth(t)).padStart(9)}`);
  console.log('  ' + row(t.stats));
}
const mis = assembleTool(MISMATCHED);
const coh = assembleTool(COHERENT);
console.log(`\n  the mismatched set has ${(rawWorth(mis) / rawWorth(coh)).toFixed(2)}x the RAW numbers`);
console.log(`  the coherent set is    ${(netWorth(coh) / netWorth(mis)).toFixed(2)}x the tool`);

// ───────────────────────────────────────────────────────────────────────────
// All three bindings are GLASSMERE, so the shell spread is identical across the
// row and the only thing moving is stability. Otherwise a deeper binding would
// change the discord too and the comparison would prove nothing.
head('AND WHAT STABILITY BUYS — the same scattered set, bound differently');
const bound = (bindingId: string): ToolStats =>
  assembleTool(MISMATCHED.map((p) => (p.type === 'binding' ? makePart('binding', bindingId, 70) : p)));
const careless = bound('frostsand');
for (const [id, note] of [
  ['frostsand', 'glassmere common — brittle/light, nothing steady'],
  ['spectralite', 'glassmere pure — charged/hollow, still no trueseated'],
  ['starlens', 'glassmere flawless — TRUESEATED'],
  ['spectrum', 'glassmere starred — TRUESEATED, and clean'],
] as Array<[string, string]>) {
  const t = bound(id);
  console.log(`  ${materialDef(id).name.padEnd(12)} ${note.padEnd(48)}`
    + ` spread ${t.coherence.shellSpread.toFixed(2)}`
    + `  index ${t.coherence.stabilityIndex.toFixed(2)}`
    + `  relief ${(t.coherence.relief * 100).toFixed(0).padStart(3)}%`
    + `  coherence ${(t.coherence.factor * 100).toFixed(0).padStart(3)}%`
    + `  tool x${(netWorth(t) / netWorth(careless)).toFixed(2)}`);
}

// ───────────────────────────────────────────────────────────────────────────
head('THE UPGRADE QUESTION — is one deep part worth breaking a set for?');
const cinderSet = (headId: string): ToolStats => assembleTool([
  makePart('head', headId, 70), makePart('core', 'magmajade', 70),
  makePart('edge', 'pyrite', 70), makePart('binding', 'cindersteel', 70),
  makePart('handle', 'charstone', 70), makePart('grip', 'obsidianheart', 70),
  makePart('sockets', 'brimshard', 70),
]);
const plain = cinderSet('slagrock');
const upgraded = cinderSet('firstiron');
console.log(`  all Cinder                coherence ${(plain.coherence.factor * 100).toFixed(0)}%   worth ${f(netWorth(plain))}`);
console.log(`  + one ALEPH head          coherence ${(upgraded.coherence.factor * 100).toFixed(0)}%   worth ${f(netWorth(upgraded))}`);
console.log(`  → ${(netWorth(upgraded) / netWorth(plain)).toFixed(1)}x. Slotting a deeper part is still an easy yes (ruling 1). Scatter is what costs.`);

// ───────────────────────────────────────────────────────────────────────────
head('COUNT STATS ARE DAMPED — modifier slots across the whole ladder');
for (const id of ['marl', 'lodestone', 'sporewood', 'frostsand', 'slagrock', 'lacuna', 'firstiron']) {
  const d = derivePart(makePart('binding', id, 70));
  console.log(`  ${materialDef(id).shellId.padEnd(10)} ${materialDef(id).name.padEnd(13)}`
    + ` magnitude ${f(d.magnitude).padStart(9)}   modSlots ${d.stats.modSlots.toFixed(2).padStart(6)}`
    + `   stability ${f(d.stats.stability).padStart(7)}`);
}
