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
 *   npx tsx scripts/material-audit.ts [--no-chains]
 *
 * `--no-chains` excludes the chain registry from the scan. THIS IS THE AUDIT'S
 * BLIND SPOT, and it hid a real question for several phases: a stone consumed
 * only by a transmutation chain reads exactly like a stone that was never an
 * orphan, so "how many orphans did the chains actually rescue" could not be
 * asked of this instrument. Run it both ways and diff — the difference IS the
 * rescue list. (`refinery.test.ts` has excluded chains.ts from its own scan
 * since the rule was written, for the same reason: a chain must not vouch for
 * itself.)
 */
import { ensureContentLoaded } from '../src/engine/content';
ensureContentLoaded();
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MATERIALS } from '../src/engine/materials';
import { isRollSource } from '../src/engine/content/rolls';
import { allShells } from '../src/engine/shells';
import { CHAINS } from '../src/engine/systems/refinery';

const root = join(process.cwd(), 'src', 'engine');
const NO_CHAINS = process.argv.includes('--no-chains');

/** Every .ts file under src/engine, EXCLUDING the ones that NAME without WANTING. */
function engineSource(dropChains = NO_CHAINS): string {
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
      /**
       * THE ROLL NAMES STONE IT DOES NOT WANT. A station's `seams` pool says
       * what you might FIND there — the opposite of a consumer. Counting it
       * un-orphaned every stone the geography mentions is a fake rescue, and it
       * is the exact trap `refinery.test.ts` already documents at its own
       * exclusion list. Added here when the Loam remains were seamed: without
       * it, five stones would have "gained a consumer" by being written into a
       * place where they DROP.
       */
      // BY REGISTRY (A.88). Naming `shell1` (A.84) meant Ferrite's Roll read as
      // a consumer the moment it was written; a path pattern (A.87) fixed that
      // and was still a second list that could fall behind. `isRollSource` is
      // derived from `ROLL_SOURCES`, so registering a Roll registers its
      // exclusion and there is exactly one list.
      if (isRollSource(p)) continue;
      // --no-chains: see the header. A chain must not vouch for itself.
      if (dropChains && p.endsWith('chains.ts')) continue;
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

console.log(`\nMATERIAL AUDIT${NO_CHAINS ? '  (chains EXCLUDED — chain-rescued stones read as orphans)' : ''}\n`);
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

/**
 * WHAT THE CHAINS ACTUALLY RESCUED — the question the blind spot hid.
 *
 * Re-scan with chains.ts out, so a chain cannot vouch for itself, then ask of
 * every chain which of its two inputs was an orphan by every OTHER route. A
 * chain whose inputs were all already busy rescued nothing; a chain taking an
 * orphan another chain already takes DUPLICATES a rescue. Both are printed,
 * because §16.4's rule is about coverage and both failures leave a stone dead.
 */
const srcNoChains = engineSource(true);
const wasOrphan = (id: string): boolean =>
  !new RegExp(`['"\`]${id}['"\`]|\\b${id}\\s*:`).test(srcNoChains);

console.log('  CHAIN RESCUE ATTRIBUTION (orphan = orphaned by every route except chains)\n');
const claimed = new Map<string, string[]>();
for (const c of CHAINS) {
  const pulls = [c.a, c.b].filter(wasOrphan);
  for (const id of pulls) claimed.set(id, [...(claimed.get(id) ?? []), c.id]);
}
let rescues = 0, dupes = 0, none = 0;
for (const c of CHAINS) {
  const pulls = [c.a, c.b].filter(wasOrphan);
  const first = pulls.filter((id) => claimed.get(id)![0] === c.id);
  const dup = pulls.filter((id) => claimed.get(id)![0] !== c.id);
  const verdict = first.length > 0 ? `RESCUES ${first.join(',')}`
    : dup.length > 0 ? `duplicate of ${dup.map((i) => claimed.get(i)![0]).join(',')}`
      : 'rescues nothing';
  if (first.length > 0) rescues += first.length; else if (dup.length > 0) dupes += 1; else none += 1;
  console.log(`    ${c.id.padEnd(24)} ${c.a}+${c.b} -> ${c.out}   ${verdict}`);
}
console.log(`\n    chains ${CHAINS.length} · stones rescued ${rescues} · duplicate rescues ${dupes} · rescue nothing ${none}`);
const stranded = MATERIALS.filter((m) => wasOrphan(m.id) && !claimed.has(m.id));
console.log(`    still with ZERO consumers after chains: ${stranded.length}`);
console.log('');
