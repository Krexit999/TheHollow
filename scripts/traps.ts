/**
 * THE TRAP MEASUREMENT (§16.3) — the instrument that chose `content/traps.ts`.
 *
 * A trap is a MEASURED property, not a label: a pure+ stone where one trait is
 * holding it well below what its own material is worth at the part it looks
 * perfect for. For every pure+ material in every shell, this drops each trait
 * in turn, re-derives every part type through the Forge's own `derivePart`, and
 * reports where the stone would land against the best in its shell.
 *
 * Re-run it before trusting a row in `content/traps.ts` — a trait fix anywhere
 * in the registry can move these, and a number in a document is not evidence.
 *
 *   npx tsx scripts/traps.ts
 */
import { createEngine } from '../src/engine';
import { MATERIALS } from '../src/engine/materials';
import { derivePart, makePart } from '../src/engine/systems/forgeParts';
import { TOOL_STATS, STAT_BASE, PART_TYPES } from '../src/engine/content/forgeParts';
import { MATERIAL_TRAITS, traitsOf } from '../src/engine/traits';
import { TRAPS } from '../src/engine/content/traps';

createEngine({ nowMs: 0 });
const table = MATERIAL_TRAITS as Record<string, string[]>;
const worth = (id: string, type: string): number => {
  const d = derivePart(makePart(type as never, id, 80));
  return TOOL_STATS.reduce((n, s) => n + d.stats[s] / STAT_BASE[s], 0);
};
const HIGH = ['pure', 'flawless', 'starred', 'aberrant'];
// `source` excludes deep-entry, remains and STILLED forms — a stilled stone is
// what this produces, so counting one as a candidate would be circular.
const pool = MATERIALS.filter((m) => !m.worked && !m.source && HIGH.includes(m.rarity));

for (const shell of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
  const mine = pool.filter((x) => x.shellId === shell);
  const rows: { id: string; t: string; type: string; gain: number; from: number; to: number }[] = [];
  for (const m of mine) {
    const ts = traitsOf(m.id);
    if (ts.length < 2) continue;
    for (const type of PART_TYPES) {
      const best = Math.max(...mine.map((x) => worth(x.id, type)));
      const base = worth(m.id, type);
      for (const t of ts) {
        table[m.id] = ts.filter((x) => x !== t);
        const w = worth(m.id, type);
        table[m.id] = [...ts];
        if (w / base - 1 > 0.05) {
          rows.push({ id: m.id, t, type, gain: w / base - 1, from: base / best, to: w / best });
        }
      }
    }
  }
  rows.sort((a, b) => b.to - a.to || b.gain - a.gain);
  const chosen = TRAPS.find((x) => MATERIALS.find((m) => m.id === x.materialId)!.shellId === shell);
  console.log(`=== ${shell}   authored: ${chosen ? `${chosen.materialId} drop ${chosen.trait} (${chosen.part})` : 'NONE'}`);
  for (const r of rows.slice(0, 5)) {
    console.log(`   ${r.id.padEnd(15)} drop ${r.t.padEnd(11)} ${r.type.padEnd(8)} +${(r.gain * 100).toFixed(1)}%   ${(r.from * 100).toFixed(0)}% -> ${(r.to * 100).toFixed(0)}% of shell best${r.to >= 1 ? '  BEST' : ''}`);
  }
}
