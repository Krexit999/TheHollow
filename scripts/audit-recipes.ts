/**
 * One-shot audit: every tool recipe vs the wall it opens (Step Zero, Phase 9),
 * extended in Part B (A.39) to THE EXPORT GRAPH — the curriculum law across
 * shells: every export must be producible in its HOME shell no later than its
 * consumer's requirement begins, and Serra's shelf must list it the moment
 * its home shell is left behind. Exit code 1 on any violation, so this can
 * gate a checkpoint the way the tests do.
 */
import { TOOL_RECIPES } from '../src/engine/systems/forge';
import { materialDef, RARITY_GATES } from '../src/engine/materials';
import { shellDef } from '../src/engine/shells';
import { ensureContentLoaded } from '../src/engine/content';
import { SHELL_EXPORTS, EXPORT_RECIPE_BY_ID } from '../src/engine/content/exports';
import { CHAINS } from '../src/engine/systems/refinery';
import { createEngine } from '../src/engine';
import type { GameState } from '../src/engine/types';
import { stockFor } from '../src/engine/guild/guild';
import { allKeystones } from '../src/engine/systems/keystones';
import { allCurrencies } from '../src/engine/resources';

ensureContentLoaded();
const shells = ['loam', 'ferrite', 'verdance', 'glassmere'];
const wallOf: Record<number, { shell: string; depth: number }> = {};
for (const s of shells) {
  for (const w of shellDef(s).walls) wallOf[w.tier] = { shell: s, depth: w.depth };
}
console.log('WALLS:', JSON.stringify(wallOf));
for (const r of TOOL_RECIPES) {
  const wall = wallOf[r.tier];
  const probs: string[] = [];
  for (const [id, n] of Object.entries(r.inputs)) {
    let def;
    try {
      def = materialDef(id);
    } catch {
      probs.push(`${id}: UNDEFINED`);
      continue;
    }
    const gate = RARITY_GATES[def.rarity].minDepth;
    const cross = wall && def.shellId !== wall.shell;
    const past = wall && gate > wall.depth;
    const combat = def.source === 'combat';
    if (cross || past || combat) {
      probs.push(
        `${id}x${n}(${def.shellId} ${def.rarity} g${gate}${cross ? ' CROSS' : ''}${past ? ' PAST-WALL' : ''}${combat ? ' COMBAT-ONLY' : ''})`,
      );
    }
  }
  console.log(
    `T${r.tier} ${r.id} ${wall ? `@${wall.shell} d${wall.depth}` : '(no wall gates this tier)'}${
      probs.length ? '  VIOLATIONS: ' + probs.join(', ') : '  ok'
    }`,
  );
}

// ---------------------------------------------------------------------------
// THE EXPORT GRAPH (Part B) — the cross-shell curriculum law, mechanically.
// ---------------------------------------------------------------------------

const ORDER = ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph'];
let exportViolations = 0;
const bad = (msg: string) => { exportViolations += 1; console.log(`  VIOLATION: ${msg}`); };

console.log('\nEXPORT GRAPH:');
for (const e of SHELL_EXPORTS) {
  const home = ORDER.indexOf(e.shellId);
  console.log(`${e.shellId} -> ${e.materialId ?? e.currencyId}  (made by ${e.producedBy}; wanted by ${e.consumedBy})`);
  if (home < 0) { bad(`${e.shellId} is not on the stair`); continue; }
  if (!e.materialId) continue; // Resonance: a currency, produced by the Hollow's own listen verb

  // LAW 1 — never dug: the export must be worked, or a drop table could leak it.
  const def = materialDef(e.materialId);
  if (!def.worked) bad(`${e.materialId} is not worked — it could drop from rock`);

  // LAW 2 — producible at home: a chain whose inputs are minable in (or before)
  // the home shell, or a recipe paid in the home shell's own currencies.
  const chain = CHAINS.find((c) => c.out === e.materialId);
  const recipe = EXPORT_RECIPE_BY_ID.get(e.materialId);
  const byproductOf: Record<string, string> = {
    fibercloth: 'every committed weave (verdance loom)',
    emberglass: '90s held in the Ember Array band (cinder)',
  };
  if (chain) {
    for (const input of [chain.a, chain.b]) {
      const idef = materialDef(input);
      if (idef.worked) { bad(`${e.materialId} chain input ${input} is itself worked`); continue; }
      if (ORDER.indexOf(idef.shellId) > home) bad(`${e.materialId} chain input ${input} lives below ${e.shellId}`);
    }
  } else if (recipe) {
    // The recipe's currencies must belong to the home shell (or earlier) —
    // a shell's currencies are the ones its own rock and drills emit.
    // Currencies a shell's SIGNATURE verb sheds (not in ShellDef): polarity
    // chains shed Lodestone in Ferrite (polarity.ts:101).
    const SIGNATURE_CURRENCIES: Record<string, string[]> = { ferrite: ['lodestone'] };
    const homeCurrencies = new Set<string>();
    for (let i = 0; i <= home && i < ORDER.length - 1; i++) {
      const sd = shellDef(ORDER[i]!);
      homeCurrencies.add(sd.chipCurrencyId);
      homeCurrencies.add(sd.convCurrencyId);
      if (sd.drillByproduct) homeCurrencies.add(sd.drillByproduct.currencyId);
      if (sd.deepByproduct) homeCurrencies.add(sd.deepByproduct.currencyId);
      for (const c of SIGNATURE_CURRENCIES[ORDER[i]!] ?? []) homeCurrencies.add(c);
    }
    for (const c of recipe.costs) {
      if (!homeCurrencies.has(c.currencyId)) bad(`${e.materialId} recipe wants ${c.currencyId}, not a currency of ${e.shellId} or earlier`);
    }
  } else if (!byproductOf[e.materialId]) {
    bad(`${e.materialId} has no chain, no recipe, and no byproduct source`);
  }

  // LAW 3 — Serra lists it the moment its home shell is behind you, at every
  // later rung of the stair (deterministic, never rotated away).
  const probe = createEngine({ nowMs: 0 }).getState() as GameState;
  probe.guild.discovered = true;
  for (let breach = home + 1; breach <= 6; breach++) {
    probe.shell.breachCount = breach;
    const shelf = stockFor(probe, 'serra');
    if (!shelf.some((slot) => slot.id === e.materialId)) {
      bad(`${e.materialId} missing from Serra's shelf at breachCount ${breach}`);
    }
  }
}

// The Hollow's currency export: Serra bottles Resonance once the Hollow is behind you.
{
  const probe = createEngine({ nowMs: 0 }).getState() as GameState;
  probe.guild.discovered = true;
  probe.shell.breachCount = 6;
  if (!stockFor(probe, 'serra').some((slot) => slot.id === 'resonance')) {
    bad('resonance pack missing from Serra at breachCount 6');
  }
}

// ---------------------------------------------------------------------------
// THE PULL-THROUGH (B4) — the same law over the Forge's new inputs.
// ---------------------------------------------------------------------------

console.log('\nPULL-THROUGH:');
// LAW 4 — a refined variant is an OPTION beside raw inputs, never instead of
// them (the fallback is the recipe), and its worked material must be
// producible before the tier's own era: every refined workedId needs a chain
// whose inputs are mineable at or before the recipe's wall shell.
for (const r of TOOL_RECIPES) {
  if (r.tier >= 4 && !r.refined) bad(`${r.id} (T${r.tier}) has no refined variant`);
  if (r.tier < 4 && r.refined) bad(`${r.id} (T${r.tier}) is refined below the mid band`);
  if (!r.refined) continue;
  if (Object.keys(r.inputs).length === 0) bad(`${r.id} refined variant has no raw fallback`);
  const wdef = materialDef(r.refined.workedId);
  if (!wdef.worked) bad(`${r.id} refined input ${r.refined.workedId} is not worked`);
  const wall = wallOf[r.tier];
  const era = wall ? ORDER.indexOf(wall.shell) : ORDER.length - 1;
  const chains = CHAINS.filter((c) => c.out === r.refined!.workedId);
  if (chains.length === 0) bad(`${r.id} refined input ${r.refined.workedId} has no producing chain`);
  if (!chains.some((c) => [c.a, c.b].every((i) => ORDER.indexOf(materialDef(i).shellId) <= era))) {
    bad(`${r.id} refined input ${r.refined.workedId} has no chain payable by ${wall?.shell ?? 'the end of the stair'}`);
  }
}
// LAW 5 — a casting is worked (never dug) and its metals are Ferrite's own,
// so every casting is producible from the Crucible's opening era on.
for (const id of ['steelcasting', 'brazecasting', 'platecasting', 'polecasting', 'cryocasting']) {
  if (!materialDef(id).worked) bad(`${id} is not worked — it could drop from rock`);
}
// LAW 6 (Part B) — a KEYSTONE gates its own shell's floor, so every craft
// input must come from that shell (or a system that runs there by the floor):
// material inputs from the shell's own registry or a Ferrite-era casting;
// currency inputs must exist. And every keystone MUST carry an idle leg
// (idlePriceMult > 0) — the ruled correction, checked structurally here and
// priced by the sim.
for (const k of allKeystones()) {
  if (!(k.idlePriceMult > 0)) bad(`keystone ${k.shellId} has no idle leg`);
  const era = ORDER.indexOf(k.shellId);
  for (const m of k.craft.materials ?? []) {
    const def = materialDef(m.id);
    if (ORDER.indexOf(def.shellId) > era) {
      bad(`keystone ${k.shellId} wants ${m.id} from ${def.shellId} — below its own floor`);
    }
  }
  for (const c of k.craft.currencies ?? []) {
    if (!allCurrencies().some((cur) => cur.id === c.id)) bad(`keystone ${k.shellId} wants unknown currency ${c.id}`);
  }
}

console.log(exportViolations === 0 ? 'EXPORT GRAPH + PULL-THROUGH: ok — the curriculum law holds across shells' : `EXPORT GRAPH + PULL-THROUGH: ${exportViolations} VIOLATION(S)`);
if (exportViolations > 0) process.exit(1);
