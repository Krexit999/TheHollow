/**
 * Phase 11b verification: systemCopy coverage, one row per system.
 * Layer 1 = purpose. Layer 2 = next(). "dynamic" means next() actually reads
 * state (arity > 0) rather than returning a constant.
 * Usage: npx tsx scripts/copy-coverage.ts
 */
import { CLUSTERS } from '../src/ui/nav';
import { SYSTEM_COPY } from '../src/ui/systemCopy';

const rows: string[][] = [];
let gaps = 0;
let statics = 0;
let codexCount = 0;

for (const c of CLUSTERS) {
  for (const sys of c.systems) {
    const copy = SYSTEM_COPY[sys.id];
    const l1 = copy?.purpose ? 'yes' : 'MISSING';
    const hasNext = !!copy?.next;
    const dynamic = hasNext && (copy!.next!.length > 0);
    const l2 = !hasNext ? 'MISSING' : dynamic ? 'dynamic' : 'static';
    const status = copy?.status ? (copy.status.length > 0 ? 'dynamic' : 'static') : '—';
    if (l1 === 'MISSING' || l2 === 'MISSING') gaps++;
    if (l2 === 'static') statics++;
    if (sys.codex) codexCount++;
    rows.push([c.label, (sys.codex ? '◫ ' : '') + (copy?.title ?? sys.id), l1, l2, status]);
  }
}

const head = ['CLUSTER', 'SYSTEM', 'LAYER 1', 'LAYER 2', 'STATUS'];
const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
const line = (r: string[]) => r.map((cell, i) => cell.padEnd(w[i]!)).join('  ');
console.log(line(head));
console.log(w.map((n) => '-'.repeat(n)).join('  '));
for (const r of rows) console.log(line(r));
// B5: codex surfaces (◫) are references, not systems — they keep their copy
// obligations but sit outside the counted-system number and the payoff floor.
console.log(`\n${rows.length - codexCount} counted systems (+${codexCount} codex surfaces) · ${gaps} gaps · ${statics} static Layer 2`);
process.exit(gaps === 0 ? 0 : 1);
