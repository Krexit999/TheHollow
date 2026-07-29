/** What the balance dial actually reads across real materials — the HEFT_SCALE
 *  is measured from this, not chosen. Not a test; a tuning dump. */
import { createEngine } from '../src/engine';
import { PART_TYPES } from '../src/engine/content/forgeParts';
import { makePart, balanceOf } from '../src/engine/systems/forgeParts';
import { materialsOfShell } from '../src/engine/materials';
import { allShells } from '../src/engine/shells';
import { traitsOf } from '../src/engine/traits';

createEngine({ nowMs: 0 });
const rows: Array<{ id: string; shell: string; raw: number; value: number; label: string; traits: string }> = [];
for (const sh of allShells()) {
  for (const m of materialsOfShell(sh.id)) {
    const b = balanceOf(PART_TYPES.map((t) => makePart(t, m.id, 60)));
    rows.push({ id: m.id, shell: sh.id, raw: b.raw, value: b.value, label: b.label, traits: traitsOf(m.id).join('+') });
  }
}
rows.sort((a, b) => a.raw - b.raw);
console.log('LIGHTEST FIVE');
for (const r of rows.slice(0, 5)) console.log(`  ${r.id.padEnd(14)} raw ${r.raw.toFixed(2).padStart(5)} → ${r.value.toFixed(2).padStart(5)} ${r.label.padEnd(8)} ${r.traits}`);
console.log('HEAVIEST FIVE');
for (const r of rows.slice(-5)) console.log(`  ${r.id.padEnd(14)} raw ${r.raw.toFixed(2).padStart(5)} → ${r.value.toFixed(2).padStart(5)} ${r.label.padEnd(8)} ${r.traits}`);
const counts: Record<string, number> = {};
for (const r of rows) counts[r.label] = (counts[r.label] ?? 0) + 1;
console.log(`\nof ${rows.length} single-material tools: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`raw span ${rows[0]!.raw.toFixed(2)} .. ${rows[rows.length - 1]!.raw.toFixed(2)}`);
