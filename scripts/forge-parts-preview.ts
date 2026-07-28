/**
 * THE NEW FORGE, STEP 1 — what the mapping actually produces.
 *
 * A tuning instrument, not a test. The tests assert the RULES (depth dominates,
 * traits trade off, grades match their numbers); this prints the NUMBERS, which
 * is the only way to judge whether they feel right. Run it after touching any
 * constant in content/forgeParts.ts.
 *
 *   npx tsx scripts/forge-parts-preview.ts
 */
import { createEngine } from '../src/engine';
import { TOOL_STATS, STAT_BASE, PART_TYPES, type ToolStat } from '../src/engine/content/forgeParts';
import { derivePart, makePart, assembleTool, gradeBonusOf } from '../src/engine/systems/forgeParts';
import { FORGE_TRAITS } from '../src/engine/content/forgeParts';
import { materialDef, bandOf } from '../src/engine/materials';
createEngine({ nowMs: 0 });

const f = (n: number) => (n >= 1000 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2));
const show = (id: string, purity: number) => {
  const d = derivePart(makePart('head', id, purity));
  const m = materialDef(id);
  const grades = d.traits.map((t) => `${t}(${FORGE_TRAITS[t].grade[0]})`).join(' ');
  const worth = TOOL_STATS.reduce((n, s: ToolStat) => n + d.stats[s] / STAT_BASE[s], 0);
  console.log(`\n${m.name}  —  ${m.shellId} ${m.rarity}, purity ${purity} (${bandOf(purity)})`);
  console.log(`  traits ${grades}   grade bonus x${gradeBonusOf(m).toFixed(2)}   magnitude ${f(d.magnitude)}   worth ${f(worth)}`);
  console.log('  ' + TOOL_STATS.map((s) => `${s.slice(0, 4)} ${f(d.stats[s]).padStart(7)}`).join('  '));
};
console.log('══ SIX HEADS ══');
show('graveclay', 60);
show('umberjade', 60);
show('starmarl', 95);
show('lodestone', 60);
show('heartflame', 60);
show('lacuna', 20);
show('firstiron', 45);

console.log('\n\n══ SAME MATERIAL, ALL SEVEN SHAPES (marl, purity 60) ══');
for (const t of PART_TYPES) {
  const d = derivePart(makePart(t, 'marl', 60));
  console.log(`${t.padEnd(9)} ` + TOOL_STATS.map((s) => `${s.slice(0, 4)} ${f(d.stats[s]).padStart(6)}`).join('  '));
}

console.log('\n\n══ THREE WHOLE TOOLS ══');
const tools: Array<[string, ReturnType<typeof assembleTool>]> = [
  ['all Loam marl', assembleTool(PART_TYPES.map((t) => makePart(t, 'marl', 50)))],
  ['all Aleph firstiron', assembleTool(PART_TYPES.map((t) => makePart(t, 'firstiron', 50)))],
  ['mixed build', assembleTool([
    makePart('head', 'heartflame', 80),   // cinder: bite
    makePart('core', 'graveclay', 60),    // loam: tough
    makePart('edge', 'umberjade', 60),
    makePart('binding', 'sporewood', 60),
    makePart('handle', 'lacuna', 70),     // hollow: fast
    makePart('grip', 'lodestone', 60),    // ferrite: fortune
    makePart('sockets', 'hushmetal', 60),
  ])],
];
for (const [name, t] of tools) {
  console.log(`\n${name}  (depth ${t.depth})`);
  console.log('  ' + TOOL_STATS.map((s) => `${s.slice(0, 4)} ${f(t.stats[s]).padStart(8)}`).join('  '));
  console.log(`  throughput ${f(t.throughput)}   traits: ${t.traits.join(', ')}`);
}
