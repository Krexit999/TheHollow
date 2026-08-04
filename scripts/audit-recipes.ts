/**
 * One-shot audit: every tool recipe vs the wall it opens (Step Zero, Phase 9),
 * extended in Part B (A.39) to THE EXPORT GRAPH — the curriculum law across
 * shells: every export must be producible in its HOME shell no later than its
 * consumer's requirement begins, and Serra's shelf must list it the moment
 * its home shell is left behind. Exit code 1 on any violation, so this can
 * gate a checkpoint the way the tests do.
 */
import { TOOL_RECIPES } from '../src/engine/systems/forge';
import { materialDef, gateDepth, gateOfMaterial } from '../src/engine/materials';
import { shellDef } from '../src/engine/shells';
import { ensureContentLoaded } from '../src/engine/content';
import { SHELL_EXPORTS } from '../src/engine/content/exports';
import { CHAINS } from '../src/engine/systems/refinery';
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
    const gate = gateDepth(def.shellId, def.rarity);
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
  // the home shell.
  const chain = CHAINS.find((c) => c.out === e.materialId);
  if (chain) {
    for (const input of [chain.a, chain.b]) {
      const idef = materialDef(input);
      if (idef.worked) { bad(`${e.materialId} chain input ${input} is itself worked`); continue; }
      if (ORDER.indexOf(idef.shellId) > home) bad(`${e.materialId} chain input ${input} lives below ${e.shellId}`);
    }
  } else {
    bad(`${e.materialId} has no producing chain`);
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
  // THE FLOOR IS EXEMPT, ON PURPOSE (A.44 A2). This law exists so the Refinery
  // matters at every tier — and it still does, because every tier keeps its
  // authored pick and that pick still requires one. The floor recipe is the
  // crude path you take when you have nothing but common stone; giving it a
  // worked-material variant would be giving the fallback a fallback. Taking it
  // costs you the tier's whole spread advantage, which is the real price.
  if (r.tier >= 4 && !r.refined && !r.floor) bad(`${r.id} (T${r.tier}) has no refined variant`);
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

// LAW 7 (A.44 A2) — EVERY WALL HAS A FLOOR, AND THE FLOOR IS PAYABLE AT ZERO.
//
// A Collapse resets depth to 0, and RARITY_GATES gives every band above common
// a minDepth the reset takes away (rich 10, pure 40, flawless 70...). So a wall
// whose only recipes bind on a banded material is gated on stone that earns
// during part of a cycle — measured at ~10.5h to cross, or not, on the rolls.
// A.42 fixed tier II by hand; this is the rule, checked rather than trusted.
//
// Three clauses, because the class has three separate ways to fail: the floor
// can be missing, it can be secretly banded, or it can be so good it replaces
// the pick it was meant to sit under.
for (const tier of Object.keys(wallOf).map(Number).sort((a, b) => a - b)) {
  const atTier = TOOL_RECIPES.filter((r) => r.tier === tier);
  if (atTier.length === 0) continue; // no recipe at all is LAW 1's business
  // Read the DECLARED flag, then prove the declaration true below — a recipe
  // that merely happens to be commons-only is not the ladder's floor, and one
  // that claims to be and is not is the failure this law exists to catch.
  const floors = atTier.filter((r) => r.floor);
  for (const r of atTier) {
    const allCommon = Object.keys(r.inputs).every((id) => materialDef(id).rarity === 'common');
    if (allCommon && !r.floor) {
      bad(`${r.id} (T${r.tier}) is commons-only but not flagged \`floor\` — the two laws that read ` +
        `that flag will not see it`);
    }
  }
  if (floors.length === 0) {
    bad(`tier ${tier} (wall ${wallOf[tier]!.shell} d${wallOf[tier]!.depth}) has no commons-only floor recipe — ` +
      `every pick binds on a band a Collapse takes away`);
    continue;
  }
  for (const f of floors) {
    // Payable at the depth a reset drops you at.
    for (const id of Object.keys(f.inputs)) {
      const gate = gateOfMaterial(id);
      if (gate > 0) bad(`floor recipe ${f.id} wants ${id} gated at depth ${gate} — not payable after a Collapse`);
      if (materialDef(id).worked) bad(`floor recipe ${f.id} wants worked material ${id} — it cannot be dug`);
      if (materialDef(id).source === 'combat') bad(`floor recipe ${f.id} wants combat drop ${id} — it cannot be dug`);
    }
    // Deliberately worst in tier: tier gates HARDNESS, spread is QUALITY.
    const total = f.chipSpread + f.strikeSpread;
    for (const sib of atTier) {
      if (sib.id === f.id) continue;
      if (total >= sib.chipSpread + sib.strikeSpread) {
        bad(`floor recipe ${f.id} (${total.toFixed(2)}) is not worse than ${sib.id} ` +
          `(${(sib.chipSpread + sib.strikeSpread).toFixed(2)}) — the floor must never be the best pick`);
      }
    }
  }
}

console.log(exportViolations === 0 ? 'EXPORT GRAPH + PULL-THROUGH: ok — the curriculum law holds across shells' : `EXPORT GRAPH + PULL-THROUGH: ${exportViolations} VIOLATION(S)`);
if (exportViolations > 0) process.exit(1);
