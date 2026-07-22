/**
 * MATERIAL AUDIT — how many of the 132 materials does anything actually WANT?
 *
 * The registry grew faster than the things that consume it. A material with no
 * consumer is not content, it is a number in a list: it drops, it stacks, and
 * nothing in the game ever asks for it. This counts them by scanning every
 * place a material id can be demanded — tool recipes, gear recipes, alloy
 * catalysts, thread spinning, brews, contracts, museum cases — and reports
 * what is left over.
 *
 *   npx tsx scripts/material-audit.ts
 */
import { ensureContentLoaded } from '../src/engine/content';
ensureContentLoaded();
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MATERIALS } from '../src/engine/materials';
import { allShells } from '../src/engine/shells';

const root = join(process.cwd(), 'src', 'engine');

/** Every .ts file under src/engine, EXCLUDING the registry itself. */
function engineSource(): string {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) {
        if (entry !== '__tests__') walk(p);
        continue;
      }
      if (!entry.endsWith('.ts')) continue;
      // materials.ts DECLARES; traits.ts assigns PROPERTIES. Neither consumes.
      if (p.endsWith('materials.ts') || p.endsWith('traits.ts')) continue;
      out.push(readFileSync(p, 'utf8'));
    }
  };
  walk(root);
  return out.join('\n');
}

const src = engineSource();
const shellName = (id: string) => allShells().find((s) => s.id === id)?.name ?? id;

const consumed: string[] = [];
const orphans: string[] = [];
for (const m of MATERIALS) {
  // A consumer names the id as a string literal or an object key.
  const re = new RegExp(`['"\`]${m.id}['"\`]|\\b${m.id}\\s*:`);
  (re.test(src) ? consumed : orphans).push(m.id);
}

console.log('\nMATERIAL AUDIT\n');
console.log(`  total          ${MATERIALS.length}`);
console.log(`  consumed       ${consumed.length}  (named by a recipe, catalyst, brew, contract or case)`);
console.log(`  ZERO CONSUMERS ${orphans.length}\n`);

// Break the orphans down so the answer is actionable rather than a number.
const byShell = new Map<string, string[]>();
const byRarity = new Map<string, string[]>();
for (const id of orphans) {
  const m = MATERIALS.find((x) => x.id === id)!;
  byShell.set(shellName(m.shellId), [...(byShell.get(shellName(m.shellId)) ?? []), id]);
  byRarity.set(m.rarity, [...(byRarity.get(m.rarity) ?? []), id]);
}

if (orphans.length > 0) {
  console.log('  orphans by shell:');
  for (const [shell, ids] of byShell) console.log(`    ${shell.padEnd(12)} ${ids.length}`);
  console.log('\n  orphans by rarity:');
  for (const [rarity, ids] of byRarity) console.log(`    ${rarity.padEnd(12)} ${ids.length}`);
  console.log('\n  combat-only among them: ' +
    orphans.filter((id) => MATERIALS.find((m) => m.id === id)!.source === 'combat').length);
}

console.log('\n  ORPHAN IDS BY SHELL:');
for (const [shell, ids] of byShell) console.log(`    ${shell}: ${ids.join(' ')}`);
console.log('');
