/**
 * THE EXPORT SPINE (Part B, A.39) — the full Loam→Aleph chain, walked.
 *
 * The Part A ruling: one export per shell, made by that shell's own craft,
 * demanded by the next shell's signature infrastructure — and the curriculum
 * law must hold across shells or a player softlocks. These tests walk every
 * edge in both directions (blocked without the export, paid with it), pin the
 * no-softlock construction (every toll starts no earlier than its producer;
 * Serra's shelf carries everything left behind), and pin the v23 grandfather
 * migration so no standing infrastructure is confiscated.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { Engine, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import { addMaterial, materialCount } from '../systems/forge';
import { materialDef, workedMaterials, rollDrop, crackGeodeRolls } from '../materials';
import { traitsOf } from '../traits';
import { SHELL_EXPORTS } from '../content/exports';
import { CHAINS, transmute } from '../systems/refinery';
import { allBridges } from '../systems/reaction';

function fresh(): { engine: Engine; s: GameState; mods: ModifierCache } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState, mods: new ModifierCache() };
}

const ctx = { dirty: () => {}, emit: () => {}, replaceState: () => {} } as never;

describe('the registry: one export per shell, made never dug', () => {
  it('covers loam and hollow, and every material export is worked with traits', () => {
    // A.72: Verdance/Glassmere/Cinder's craft-system producers (Greenhouse,
    // Loom, Bench, Ember Array) are gone, so the spine that ran through them
    // shrank to its two ends — the Kiln's Kilnflux and the Hollow's Resonance.
    const shells = new Set(SHELL_EXPORTS.map((e) => e.shellId));
    for (const id of ['loam', 'hollow']) {
      expect(shells.has(id), `${id} exports something`).toBe(true);
    }
    for (const e of SHELL_EXPORTS) {
      if (!e.materialId) continue; // the Hollow's export is Resonance, a currency
      const def = materialDef(e.materialId);
      expect(def.worked, `${e.materialId} never drops from mining`).toBe(true);
      expect(def.shellId).toBe(e.shellId);
      expect(traitsOf(e.materialId).length, `${e.materialId} has traits`).toBeGreaterThanOrEqual(2);
    }
    // And they are counted among the made-not-found.
    const workedIds = new Set(workedMaterials().map((m) => m.id));
    for (const e of SHELL_EXPORTS) if (e.materialId) expect(workedIds.has(e.materialId)).toBe(true);
  });

  it('no back door: the ROCK never yields a worked material (rollDrop + crackGeodeRolls)', () => {
    // The second leak the export-spine sim caught: crackGeodeRolls filtered
    // combat-only but NOT worked, so a rich Loam geode rolled Kilnflux and a
    // Verdance one Fibercloth — bench exports appearing in the seam. Brute the
    // rollers across every shell and depth band; nothing worked may fall out,
    // and the empty-pool fallback must never be a worked material either.
    let rngState = 12345;
    const rng = () => { rngState = (rngState * 1103515245 + 12345) & 0x7fffffff; return rngState / 0x7fffffff; };
    const shells = ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph'];
    /**
     * ONE ASSERTION, NOT THIRTY THOUSAND. This used to `expect` inside the
     * innermost loop with a template-literal message, so ~30,000 messages were
     * BUILT whether or not anything was wrong — 6.9 seconds against a 5-second
     * limit, and the engine work under it is 131ms. Collecting the offenders
     * and asserting once is both faster and a better report: it names every
     * leak rather than the first.
     */
    const leaks: string[] = [];
    for (const shell of shells) {
      for (const depth of [0, 20, 50, 90, 140, 200, 320]) {
        for (let i = 0; i < 400; i++) {
          const d = rollDrop(shell, depth, rng);
          if (d.materialId && materialDef(d.materialId).worked) {
            leaks.push(`rollDrop ${shell}@${depth} -> ${d.materialId}`);
          }
          for (const g of crackGeodeRolls(shell, depth, rng)) {
            if (g.materialId && materialDef(g.materialId).worked) {
              leaks.push(`geode ${shell}@${depth} -> ${g.materialId}`);
            }
          }
        }
      }
    }
    expect([...new Set(leaks)]).toEqual([]);
  });
});

describe('Loam → Ferrite: Kilnflux fires every pour', () => {
  it('the Kiln Firing is a registered chain that batches six flux per firing', () => {
    const { s } = fresh(); // content (incl. chains) registers on engine boot
    const chain = CHAINS.find((c) => c.out === 'kilnflux');
    expect(chain).toBeDefined();
    expect(chain!.yield).toBe(6);
    s.shell.breachCount = 1;
    s.depthRecords['ferrite'] = 300; // transmute bench open
    addMaterial(s, chain!.a, 60, chain!.cost * 2);
    addMaterial(s, chain!.b, 60, chain!.cost * 2);
    // A.94: palegold and marl PULL AGAINST EACH OTHER (dense vs light), so the
    // firing is a violent pour and wants something between them (§17). The
    // catalyst is handed back on a hit, and the batch comes out one heavier.
    const cat = allBridges(chain!.a, chain!.b).find((id) => !materialDef(id).worked)!;
    addMaterial(s, cat, 60, 1);
    const r = transmute(s, ctx, chain!.a, chain!.b, cat);
    expect(r.ok).toBe(true);
    expect(materialCount(s, 'kilnflux')).toBe(7);
    expect(materialCount(s, cat), 'the catalyst survives a hit').toBe(1);
  });

});
