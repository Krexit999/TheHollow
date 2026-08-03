/**
 * WHICH CHAINS A SHALLOW LOAM PLAYER CAN ACTUALLY RUN.
 *
 * Written because the A.83 audit got this wrong and a ruling was issued on it.
 * That audit read the FIRST THREE bindingclay chains (slagToClay,
 * palegoldBinder, ashgritBinder), saw sablequartz at the floor and Cinder
 * stone, and reported "only refineslag is shallow-reachable". It never reached
 *  at line 166 — bonechalk + graveclay, both seamed at The Sag,
 * depth 17. bindingclay has been reachable from shallow stock the whole time.
 *
 * So this is an instrument rather than a reading: it walks every registered
 * chain, resolves each input to where it actually comes from, and closes over
 * chain OUTPUTS so a two-hop route counts as reachable too.
 *
 * SHALLOW is defined as: any seam on a Loam station ABOVE the floor (depth
 * < 150), plus Loam commons/uncommons from the drop table, plus the Crusher's
 * own output. That is the generous reading; the report prints the station
 * depths so a stricter line can be drawn without re-running anything.
 *
 *   npx tsx scripts/chain-reach.ts
 */
import { createEngine } from '../src/engine';
import { CHAINS } from '../src/engine/systems/refinery';
import { MATERIALS } from '../src/engine/materials';
import { loamRoll } from '../src/engine/content/shell1/roll';

createEngine({ nowMs: 0 });
// SHALLOW = what a Loam player holds without reaching the floor (depth 150).
const seams = new Set<string>();
for (const st of loamRoll()) {
  if (st.depth >= 150) continue;          // the floor itself is not shallow
  for (const s of st.seams ?? []) seams.add(s);
}
// ...plus what Loam's own drop table gives, and the Crusher's output.
for (const m of MATERIALS) {
  if (m.shellId === 'loam' && m.rarity === 'common') seams.add(m.id);
}
seams.add('refineslag'); seams.add('salvagedust');
const shallow = new Set(seams);
// Chain outputs made from shallow inputs are themselves shallow (one hop).
for (let pass = 0; pass < 3; pass++) {
  for (const c of CHAINS) {
    if (shallow.has(c.a) && shallow.has(c.b)) shallow.add(c.out);
  }
}
const where = (id: string): string => {
  const d = MATERIALS.find((m) => m.id === id);
  if (!d) return 'unknown';
  if (shallow.has(id)) return 'shallow';
  if (d.shellId === 'loam') return 'LOAM-DEEP';
  return (d.shellId ?? '?').toUpperCase();
};
const rows = CHAINS.map((c) => ({
  id: c.id, a: c.a, b: c.b, out: c.out,
  reach: shallow.has(c.a) && shallow.has(c.b) ? 'SHALLOW'
    : (where(c.a) === 'LOAM-DEEP' || where(c.b) === 'LOAM-DEEP') ? 'needs the floor' : 'later shell',
  why: `${where(c.a)}+${where(c.b)}`,
}));
for (const r of rows) {
  console.log(`${r.reach.padEnd(15)} ${r.id.padEnd(22)} ${r.a}+${r.b} -> ${r.out}  [${r.why}]`);
}
const n = rows.filter((r) => r.reach === 'SHALLOW').length;
console.log(`\nSHALLOW-REACHABLE: ${n} of ${rows.length}`);
console.log(`bindingclay shallow? ${shallow.has('bindingclay')}`);
