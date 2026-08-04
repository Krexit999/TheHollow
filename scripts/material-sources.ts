/**
 * WHERE DOES EVERY MATERIAL COME FROM? — the producer side of
 * `material-audit.ts`, which only ever asked about CONSUMERS.
 *
 * §13 says the CENTRIFUGE blocks "~10 split-only materials", and a claim like
 * that is only checkable against a list of what actually has no route. So this
 * walks every producing path in the engine and prints the materials nothing
 * reaches:
 *
 *   the rarity pools        (rollDrop — anything with no `source` and no `worked`)
 *   REMAINS                 (`remains` on a station)
 *   deep-entry              (`source: 'deep'`, the compaction gates)
 *   seams                   (`seams`/`floodSeams` on a station)
 *   transmutation chains    (`out` of a registered chain)
 *   the machines            (still / alloy / infused / pressed / maybe forms are
 *                            MADE from a source, so they are reachable iff their
 *                            source is)
 *   authored grants         (curing, tempering media, ore pockets, exports)
 *
 *   npx tsx scripts/material-sources.ts
 */
import { ensureContentLoaded } from '../src/engine/content';
import { MATERIALS } from '../src/engine/materials';
import { allAuthoredStations } from '../src/engine/content/rolls';
import { CHAINS } from '../src/engine/systems/refinery';
import { CURE_RECIPES } from '../src/engine/systems/curing';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

ensureContentLoaded();

const reached = new Map<string, string>();
const note = (id: string, how: string): void => {
  if (!reached.has(id)) reached.set(id, how);
};

// 1. The rarity pools: anything with no `source` and not `worked` can be dug.
for (const m of MATERIALS) {
  if (!m.source && !m.worked) note(m.id, 'the rock (rarity pool)');
}

// 2/3. Places: seams, remains, flood seams.
for (const { shellId, def } of allAuthoredStations()) {
  for (const id of def.seams ?? []) note(id, `seam at ${shellId}/${def.name}`);
  for (const id of def.remains ?? []) note(id, `remains at ${shellId}/${def.name}`);
  for (const id of def.floodSeams ?? []) note(id, `flood seam at ${shellId}/${def.name}`);
}

// 4. Deep-entry.
for (const m of MATERIALS) if (m.source === 'deep') note(m.id, 'deep-entry (compaction)');

// 5. Chains.
for (const c of CHAINS) note(c.out, `chain ${c.id}`);

// 6. Curing.
for (const c of CURE_RECIPES) note(c.to, `cure ${c.id}`);

// 7. Anything a source file GRANTS by name — `addMaterial(state, 'x'` and the
//    literal id in a grant table. Text-scanned, then verified against the
//    registry, because the alternative is running every system.
const ENGINE = join(process.cwd(), 'src', 'engine');
const files: string[] = [];
const walk = (dir: string): void => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== '__tests__') walk(p); }
    else if (p.endsWith('.ts')) files.push(p);
  }
};
walk(ENGINE);
const ids = new Set(MATERIALS.map((m) => m.id));
for (const f of files) {
  if (f.includes('materials.ts') || f.includes('traits.ts')) continue;
  const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const mm of src.matchAll(/addMaterial\(\s*[A-Za-z0-9_.]+\s*,\s*'([a-z0-9_]+)'/g)) {
    if (ids.has(mm[1]!)) note(mm[1]!, `addMaterial in ${f.split('src')[1]}`);
  }
  // Grant tables: `materialId: 'x'` and `out: 'x'` and `to: 'x'`.
  for (const mm of src.matchAll(/(?:materialId|out|to|drop|gives)\s*:\s*'([a-z0-9_]+)'/g)) {
    if (ids.has(mm[1]!)) note(mm[1]!, `granted in ${f.split('src')[1]}`);
  }
  /**
   * ...AND THROUGH A NAMED CONSTANT, which the first run of this instrument
   * missed. `crusher.ts` grants `addMaterial(state, CRUSH_PRODUCT, ...)`, so
   * `refineslag` and `salvagedust` — the output of a machine that has shipped
   * for many phases — both came out as "nothing produces this". A text scan
   * that only reads literals is a text scan that reports the codebase's own
   * good practice as a defect.
   */
  const consts = new Map<string, string>();
  for (const mm of src.matchAll(/const\s+([A-Z_][A-Z0-9_]*)\s*=\s*'([a-z0-9_]+)'/g)) {
    if (ids.has(mm[2]!)) consts.set(mm[1]!, mm[2]!);
  }
  for (const [name, id] of consts) {
    if (new RegExp(`addMaterial\\([^)]*\\b${name}\\b`).test(src)) {
      note(id, `addMaterial(${name}) in ${f.split('src')[1]}`);
    }
  }
}

// 8. Machine-made forms are reachable iff their SOURCE stone is.
for (const m of MATERIALS) {
  if (!m.source || m.source === 'deep' || m.source === 'remains' || m.source === 'combat') continue;
  note(m.id, `made from a stone (${m.source})`);
}

const orphans = MATERIALS.filter((m) => !reached.has(m.id));
console.log(`\n=== ${MATERIALS.length} materials, ${reached.size} with a route ===\n`);
console.log(`MATERIALS NOTHING PRODUCES: ${orphans.length}\n`);
for (const m of orphans) {
  console.log(`  ${m.id.padEnd(18)} ${m.shellId.padEnd(10)} ${m.rarity.padEnd(9)} ${m.worked ? 'worked' : ''} ${m.source ?? ''}`);
}
console.log('\n--- by shell ---');
const byShell = new Map<string, number>();
for (const m of orphans) byShell.set(m.shellId, (byShell.get(m.shellId) ?? 0) + 1);
console.log([...byShell.entries()].sort().map(([s, n]) => `${s} ${n}`).join(' · ') || '(none)');
