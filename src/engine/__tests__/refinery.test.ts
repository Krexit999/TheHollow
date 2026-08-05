/**
 * THE REFINERY, TRANSMUTATION AND SALVAGE.
 *
 * The load-bearing tests here are not "does refine return a value" but the
 * three PROMISES this phase made:
 *
 *   1. NO TREADMILL — every path converts bad luck into progress. Nothing
 *      here may leave a player worse off for having tried it.
 *   2. THE CHAINS EARN THEIR KEEP — every chain must consume a material that
 *      had no consumer, or it is decoration on a solved problem.
 *   3. PILLAR 2 — none of this can produce income. It moves materials around.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createEngine } from '../index';
import { isRollSource } from '../content/rolls';
import type { GameState } from '../types';
import { MATERIALS, gateOfMaterial, materialDef, BANDS, BAND_RANGES, bandOf, workedMaterials, materialsOfShell, rollDrop } from '../materials';
import { addMaterial, materialCount, recipeDef, equippedTool } from '../systems/forge';
import { wreckStation } from '../systems/roll';
import {
  CHAINS, climbPreview, findChain, refine, refinePreview, refineTo, transmute, REFINE_RATIO,
  REFINERY_WRECK, refineryUnlocked, transmuteUnlocked, SLAG_MATERIAL,
} from '../systems/refinery';
import { allBridges, needsCatalyst } from '../systems/reaction';
import { salvageTool, salvagePreview, SALVAGE_RESIDUE } from '../systems/salvage';
import { TEMPERS, TEMPER_MASTERY, temperTool, temperBonus, temperCost, temperingUnlocked } from '../systems/tempering';

const ctx = { emit: () => {}, dirty: () => {} };
const fresh = () => {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState };
};
/** Open the whole bench. */
/**
 * THE BENCH OPENS AT ITS WRECK (A.106), not at Ferrite mastery. Sinter Row is
 * LOAM 60, and the gate used to read two shells away from it - so this fixture
 * used to stand the player in Ferrite to open a Loam station's room.
 */
const openBench = (s: GameState) => {
  const at = wreckStation(REFINERY_WRECK)!;
  (s.roll ??= { rolled: {}, cleared: [], looted: [], rolls: 0 }).looted.push(at.def.id);
};

describe('salvage never throws on the starter tool (the Refinery black-screen)', () => {
  // The Refinery/Salvage panel maps EVERY spare tool through salvagePreview.
  // The starter tool's recipeId ('delversPick') is not a craftable recipe, so
  // the old `recipeDef(tool.recipeId)` fallback threw "Unknown recipe" — and a
  // throw in a render path unmounts the whole React root (black screen, lost
  // session). salvagePreview must return null for it, and salvageTool refuse it,
  // never throw.
  it('salvagePreview returns null for the starter (no parts, no recipe) instead of throwing', () => {
    const { s } = fresh();
    // Craft-equip a spare so the starter (id 0) becomes a salvageable spare.
    s.forge.tools.push({ id: 1, recipeId: 'marlsplitter', name: 'Pick', tier: 3, purity: 60, chipPower: 2, strikePower: 8, sockets: [], alloys: [] });
    s.forge.equipped = 1;
    const starter = s.forge.tools.find((t) => t.id === 0)!;
    expect(starter.recipeId).toBe('delversPick');
    expect(() => salvagePreview(s, 0)).not.toThrow();
    expect(salvagePreview(s, 0)).toBeNull();
  });

  it('salvageTool refuses the starter with a reason, not a throw', () => {
    const { s } = fresh();
    s.forge.tools.push({ id: 1, recipeId: 'marlsplitter', name: 'Pick', tier: 3, purity: 60, chipPower: 2, strikePower: 8, sockets: [], alloys: [] });
    s.forge.equipped = 1;
    let r: ReturnType<typeof salvageTool>;
    expect(() => { r = salvageTool(s, ctx, 0, false); }).not.toThrow();
    expect(r!.ok).toBe(false);
    // The starter is still there — nothing was destroyed.
    expect(s.forge.tools.some((t) => t.id === 0)).toBe(true);
  });
});

describe('refining makes purity workable', () => {
  it('is shut until the smiths open it', () => {
    const { s } = fresh();
    expect(refineryUnlocked(s)).toBe(false);
    expect(refine(s, ctx, 'marl', 'poor').ok).toBe(false);
    // Ferrite mastery does NOT open it any more - the wreck does, and the wreck
    // is in LOAM. A world with maxed Ferrite and an unraised Sinter Row is shut.
    s.depthRecords['ferrite'] = 500;
    expect(refineryUnlocked(s), 'mastery still opens the bench').toBe(false);
    openBench(s);
    expect(refineryUnlocked(s)).toBe(true);
    // ...and it is LOAM 60, which is the whole point of the ruling.
    const at = wreckStation(REFINERY_WRECK)!;
    expect([at.shellId, at.def.depth]).toEqual(['loam', 60]);
  });

  it('turns three of a band into one of the band above', () => {
    const { s } = fresh();
    openBench(s);
    addMaterial(s, 'marl', 30, REFINE_RATIO); // 'poor'
    expect(materialCount(s, 'marl')).toBe(3);

    const res = refine(s, ctx, 'marl', 'poor');
    expect(res.ok).toBe(true);
    // One unit out, in 'fair', at the BOTTOM of fair.
    const fair = s.materials.stacks['marl']?.['fair'];
    expect(fair?.count).toBe(1);
    expect(fair!.puritySum / fair!.count).toBe(BAND_RANGES['fair'][0]);
    expect(s.materials.stacks['marl']?.['poor']).toBeUndefined();
  });

  it('refuses a short stack rather than eating it', () => {
    const { s } = fresh();
    openBench(s);
    addMaterial(s, 'marl', 30, REFINE_RATIO - 1);
    expect(refine(s, ctx, 'marl', 'poor').ok).toBe(false);
    expect(materialCount(s, 'marl')).toBe(REFINE_RATIO - 1); // untouched
  });

  it('nothing refines past the top band, whatever the top band is', () => {
    /**
     * READ THE TOP OFF THE LADDER rather than naming it. A.68 added `pristine`
     * above `exalted`, and this test previously asserted that `exalted` was the
     * end — so it failed the moment the ladder grew, correctly, and would have
     * gone on failing every time it grew again. The claim is about the LAST
     * band, not about a particular one.
     */
    const { s } = fresh();
    openBench(s);
    const top = BANDS[BANDS.length - 1]!;
    addMaterial(s, 'marl', BAND_RANGES[top][0], 9);
    expect(refinePreview(s, 'marl', top)).toBeNull();
    expect(refine(s, ctx, 'marl', top).ok).toBe(false);
  });

  it('a save that predates the band loads and behaves unchanged', () => {
    /**
     * NO MIGRATION, AND THAT IS PROVED RATHER THAN ASSUMED.
     *
     * A band is only ever a KEY on a material stack, `addMaterial` creates one
     * on demand, and every read is optional-chained — so a save written before
     * `pristine` existed simply has no such key, which reads as zero. Nothing
     * iterates raw stack keys, so nothing can trip over the gap. This asserts
     * that rather than trusting it: a stack with the OLD five bands counts,
     * refines and climbs exactly as it did.
     */
    const { s } = fresh();
    openBench(s);
    s.materials.stacks['marl'] = {
      poor: { count: 9, puritySum: 9 * 10 },
      fair: { count: 3, puritySum: 3 * 45 },
    } as GameState['materials']['stacks'][string];
    expect(materialCount(s, 'marl')).toBe(12);
    expect(s.materials.stacks['marl']?.pristine).toBeUndefined();
    const r = refine(s, ctx, 'marl', 'poor');
    expect(r.ok).toBe(true);
    expect(materialCount(s, 'marl')).toBe(6);
  });

  it('and a climb that would arrive with nothing is refused, not offered', () => {
    /**
     * 3:1 COMPOUNDING CAN CONSUME EVERYTHING AND LAND ZERO. Ninety poor is
     * thirty fair, ten good, three fine, one exalted — and nothing at all above
     * that. The first cut returned that as a valid plan, so the Casting floor
     * offered "would take 132 of these to 0 Pristine" and the trough drew a
     * button that spent everything for nothing. Caught in a driven screenshot.
     */
    const { s } = fresh();
    openBench(s);
    addMaterial(s, 'marl', BAND_RANGES['poor'][0], 90);
    expect(climbPreview(s, 'marl', 'pristine')).toBeNull();
    const near = climbPreview(s, 'marl', 'exalted');
    expect(near).not.toBeNull();
    expect(near!.got).toBeGreaterThan(0);
  });

  it('and the climb costs exactly what the rungs cost by hand', () => {
    // Refine-to-target removes taps, never loss.
    const byHand = fresh().s;
    openBench(byHand);
    addMaterial(byHand, 'marl', BAND_RANGES['poor'][0], 81);
    const startA = materialCount(byHand, 'marl');
    refine(byHand, ctx, 'marl', 'poor');
    refine(byHand, ctx, 'marl', 'fair');
    const handCost = startA - materialCount(byHand, 'marl');

    const climbed = fresh().s;
    openBench(climbed);
    addMaterial(climbed, 'marl', BAND_RANGES['poor'][0], 81);
    const startB = materialCount(climbed, 'marl');
    refineTo(climbed, ctx, 'marl', 'good');
    const climbCost = startB - materialCount(climbed, 'marl');

    expect(climbCost).toBe(handCost);
  });

  it('and the new top band is reachable, but only by making it', () => {
    /**
     * PRISTINE IS UNROLLABLE — no drop table produces it, so the only way in is
     * a refine. That is the point of adding it: the top of the ladder stops
     * being a dead end for surplus deep stock.
     */
    const { s } = fresh();
    openBench(s);
    addMaterial(s, 'marl', BAND_RANGES['exalted'][0], 9);
    const inBand = (): number => s.materials.stacks['marl']?.pristine?.count ?? 0;
    expect(inBand()).toBe(0);
    const r = refine(s, ctx, 'marl', 'exalted');
    expect(r.ok).toBe(true);
    expect(inBand()).toBe(3);
  });

  // THE ANTI-TREADMILL PROMISE, as a property.
  it('NEVER leaves the player worse off — the loss comes back as slag', () => {
    const { s } = fresh();
    openBench(s);
    addMaterial(s, 'marl', 30, 9);
    const before = materialCount(s, SLAG_MATERIAL);
    refine(s, ctx, 'marl', 'poor');
    // 9 poor → 3 fair, and the 6 units of loss are slag, not vapour.
    expect(materialCount(s, 'marl')).toBe(3);
    expect(materialCount(s, SLAG_MATERIAL)).toBe(before + 6);
  });

  it('a refined stone is the WORST of its new band, never a lucky find', () => {
    const { s } = fresh();
    openBench(s);
    addMaterial(s, 'marl', 55, 3); // top of 'fair'
    refine(s, ctx, 'marl', 'fair');
    const good = s.materials.stacks['marl']!['good']!;
    expect(good.puritySum / good.count).toBe(BAND_RANGES['good'][0]);
  });
});

describe('transmutation makes the 132 a graph', () => {
  it('is order-independent — a chain is a SET, unlike a rune pair', () => {
    for (const c of CHAINS) {
      expect(findChain(c.a, c.b)).toBe(c);
      expect(findChain(c.b, c.a)).toBe(c);
    }
  });

  it('every chain is authored and points at real materials', () => {
    const ids = new Set(MATERIALS.map((m) => m.id));
    for (const c of CHAINS) {
      expect(ids.has(c.a), `chain '${c.id}' input a='${c.a}'`).toBe(true);
      expect(ids.has(c.b), `chain '${c.id}' input b='${c.b}'`).toBe(true);
      expect(ids.has(c.out), `chain '${c.id}' output='${c.out}'`).toBe(true);
      expect(c.a).not.toBe(c.b);
      expect(c.name.length).toBeGreaterThan(3);
      expect(c.flavor.length).toBeGreaterThan(30);
      expect(c.cost).toBeGreaterThan(0);
    }
  });

  /**
   * THE RULE THAT MAKES THIS PHASE WORTH SHIPPING. The audit found 49
   * materials nothing consumed. A chain built out of two already-busy
   * materials would be decoration; this asserts each one pulls at least one
   * orphan back into the economy.
   */
  it('every chain consumes at least one material nothing else wanted', () => {
    // Rebuild the "who is consumed" picture WITHOUT the chains file, so the
    // chains cannot vouch for themselves.
    const root = join(process.cwd(), 'src', 'engine');
    const parts: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) { if (entry !== '__tests__') walk(p); continue; }
        if (!entry.endsWith('.ts')) continue;
        // traits.ts names every material, but a trait is a PROPERTY, not a
        // consumer — a material having a trait does not mean anything wants it.
        //
        // THE ROLL is the same case and it caught this test out: a station's
        // seam pool NAMES the stone you might find there and consumes nothing.
        // Listing sablequartz at DEEPGRAVE made it read as un-orphaned and
        // stripped `slagToClay` of the only justification it had, while nothing
        // about the economy had changed. A text scan cannot tell "wanted by a
        // system" from "mentioned in a list"; the exclusion list is where that
        // distinction is kept.
        //
        // EXCLUDED BY REGISTRY (A.88). This named `shell1/roll.ts` explicitly
        // and fired the moment Ferrite's Roll existed — `trueFromPolestar` lost
        // the only justification it had, which is the identical failure the
        // paragraph above describes, one shell later. A.87 replaced the name
        // with a path pattern, which is better and still a second list that can
        // fall behind. `isRollSource` is derived from `ROLL_SOURCES`, so
        // REGISTERING a Roll registers its exclusion and there is one list.
        if (p.endsWith('materials.ts') || p.endsWith('chains.ts') || p.endsWith('traits.ts')
          || isRollSource(p)) continue;
        parts.push(readFileSync(p, 'utf8'));
      }
    };
    walk(root);
    /**
     * COMMENTS ARE STRIPPED, and this is the FOURTH sighting of the "names
     * without wanting" class — the first three were fixed by excluding whole
     * FILES (a filename A.84, a path pattern A.87, a registry A.88/A.89).
     *
     * A.91 broke it again from a new direction: `systems/crucible.ts` explains
     * WHY the machine is mandatory by listing the seven three-trait stones in
     * its header — "(`voidstar`, `nothing`, `paradoxa`, `thornmind`, ...)" — and
     * `thornmind` instantly read as consumed, stripping `ashFromThorn` of the
     * only justification it had. Nothing about the economy had changed; a
     * sentence had.
     *
     * Excluding a FILE cannot fix that, because the file is a real consumer of
     * other things. A PROSE MENTION IS NOT A CONSUMER, so the scan stops
     * reading prose. That closes the whole class rather than its fourth
     * instance, and it means a comment can go on explaining itself.
     */
    const src = parts.join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^[ \t]*\/\/.*$/gm, ' ');
    const wasOrphan = (id: string) => !new RegExp(`['"\`]${id}['"\`]|\\b${id}\\s*:`).test(src);

    /**
     * ADDS REACH, BY EITHER ROUTE (widened A.44).
     *
     * The orphan check was a PROXY for "this chain is not decoration", and it
     * was exact while the Refinery was the only thing consuming commons. A.44's
     * floor recipes (one commons-only pick per tier, so a hardness wall is
     * passable at the depth a Collapse drops you at) gave several commons a
     * second consumer — and `ashgritBinder` failed as "adds no reach" while
     * doing exactly the job the phase wanted: ashgrit + slagrock, both common,
     * become bindingclay, which is RICH and otherwise gated at depth 10.
     *
     * So test the meaning, not the proxy. A chain earns its place if it pulls an
     * orphan back into the economy, OR if it reaches UP a band — turning cheap,
     * always-available stone into something the depth gates would otherwise
     * withhold. Both are reach; only one was being checked.
     */
    // Rank by the DEPTH GATE, not by a band index — `BANDS` is the PURITY axis
    // (poor..exalted) and rarity is a different one (common..aberrant), so
    // indexing rarity into it returns -1 for every material and the comparison
    // silently comes out false for all of them. Depth is also the honest
    // measure here: what a chain bypasses is the gate a Collapse re-imposes.
    const gateOf = (id: string): number => gateOfMaterial(id);
    for (const c of CHAINS) {
      const pullsOrphan = wasOrphan(c.a) || wasOrphan(c.b);
      const reachesUp = gateOf(c.out) > Math.max(gateOf(c.a), gateOf(c.b));
      expect(
        pullsOrphan || reachesUp,
        `chain '${c.id}' consumes ${c.a} + ${c.b} (neither orphaned) and outputs ${c.out} ` +
          `at or below their band — it adds no reach by either route`,
      ).toBe(true);
    }
  });

  it('a miss still pays, so trying is never a dead end', () => {
    const { s } = fresh();
    openBench(s);
    s.depthRecords['ferrite'] = 300;
    expect(transmuteUnlocked(s)).toBe(true);
    addMaterial(s, 'marl', 50, 4);
    addMaterial(s, 'ochre', 50, 4);
    // A.94: marl and ochre are STRANGERS (no trait in common), so the bench
    // will not pour them without something that talks to both. The miss still
    // pays slag — and now it eats the catalyst too (§17).
    const cat = allBridges('marl', 'ochre').find((id) => !materialDef(id).worked)!;
    addMaterial(s, cat, 50, 1);
    const before = materialCount(s, SLAG_MATERIAL);
    const res = transmute(s, ctx, 'marl', 'ochre', cat);
    expect(res.ok).toBe(true);
    expect(materialCount(s, cat), 'a miss eats the catalyst').toBe(0);
    expect((res.data as { found: string | null }).found).toBeNull();
    expect(materialCount(s, SLAG_MATERIAL)).toBeGreaterThan(before);
  });

  it('a hit records itself once and produces the output', () => {
    const { s } = fresh();
    openBench(s);
    s.depthRecords['ferrite'] = 300;
    const c = CHAINS[0]!;
    addMaterial(s, c.a, 50, c.cost * 3);
    addMaterial(s, c.b, 50, c.cost * 3);
    // A.94: whichever chain sits first, supply a catalyst if its pair needs one.
    const cat = needsCatalyst(c.a, c.b)
      ? allBridges(c.a, c.b).find((id) => !materialDef(id).worked)! : null;
    if (cat) addMaterial(s, cat, 50, 1);

    const first = transmute(s, ctx, c.a, c.b, cat);
    expect((first.data as { isNew: boolean }).isNew).toBe(true);
    expect(materialCount(s, c.out)).toBeGreaterThan(0);

    const second = transmute(s, ctx, c.a, c.b, cat);
    expect((second.data as { isNew: boolean }).isNew).toBe(false);
    expect(s.refinery.found.filter((id) => id === c.id)).toHaveLength(1);
  });

  it('refuses two of the same thing', () => {
    const { s } = fresh();
    openBench(s);
    s.depthRecords['ferrite'] = 300;
    addMaterial(s, 'marl', 50, 10);
    expect(transmute(s, ctx, 'marl', 'marl').ok).toBe(false);
  });
});

describe('salvage is an exit path, not a bin', () => {
  const twoTools = () => {
    const { engine, s } = fresh();
    s.forge.built = true;
    const recipe = recipeDef('marlsplitter');
    for (const [id, n] of Object.entries(recipe.inputs)) addMaterial(s, id, 70, n * 4);
    s.forge.tools.push({
      id: 99, recipeId: 'marlsplitter', name: 'Test Pick', tier: 1, purity: 70,
      chipPower: 1, strikePower: 1, sockets: [null, null], alloys: [],
    });
    return { engine, s };
  };

  it('refuses the last tool and the equipped one', () => {
    const { s } = fresh();
    const only = s.forge.tools[0]!;
    expect(salvageTool(s, ctx, only.id, false).ok).toBe(false);

    const { s: s2 } = twoTools();
    expect(salvageTool(s2, ctx, s2.forge.equipped, false).ok).toBe(false);
  });

  it('returns materials at the TOOL\'s purity and leaves residue', () => {
    const { s } = twoTools();
    const before = materialCount(s, 'marl');
    const res = salvageTool(s, ctx, 99, false);
    expect(res.ok).toBe(true);
    expect(materialCount(s, 'marl')).toBeGreaterThan(before);
    expect(materialCount(s, SALVAGE_RESIDUE)).toBeGreaterThan(0);
    // A purity-70 tool salvages into the band 70 belongs to.
    expect(Object.keys(s.materials.stacks['marl'] ?? {})).toContain(bandOf(70));
    expect(s.forge.tools.some((t) => t.id === 99)).toBe(false);
    expect(s.forge.salvaged).toBe(1);
  });

  it('extraction returns the gems that were set into it', () => {
    const { s } = twoTools();
    const tool = s.forge.tools.find((t) => t.id === 99)!;
    tool.sockets = ['bloodgarnet', null];
    const held = s.materials.gems['bloodgarnet'] ?? 0;
    const preview = salvagePreview(s, 99)!;
    expect(preview.recoverable.gems).toEqual(['bloodgarnet']);

    // Pay the fee.
    s.currencies['brick'] = s.currencies['brick']!.add(preview.fee + 10);
    expect(salvageTool(s, ctx, 99, true).ok).toBe(true);
    expect(s.materials.gems['bloodgarnet']).toBe(held + 1);
  });

  it('skipping extraction loses the settings — the actual decision', () => {
    const { s } = twoTools();
    const tool = s.forge.tools.find((t) => t.id === 99)!;
    tool.sockets = ['bloodgarnet', null];
    const held = s.materials.gems['bloodgarnet'] ?? 0;
    expect(salvageTool(s, ctx, 99, false).ok).toBe(true);
    expect(s.materials.gems['bloodgarnet'] ?? 0).toBe(held);
  });
});

describe('worked materials are made, never found', () => {
  it('there are twenty-seven — the twenty-six, plus the Retort Pyre-bath (A.95) — each made, never dug', () => {
    // Cured stones (Phase 19) are the second kind of made-not-found material,
    // the export spine (Part B) the third, and the alloy castings (B4
    // pull-through) the fourth: all `worked: true`, so all share every
    // guarantee below (never drop, never listed under a shell taxonomy).
    const worked = workedMaterials();
    expect(worked).toHaveLength(27);
    for (const id of ['refineslag', 'salvagedust', 'truesilver', 'rustochre', 'sunamber', 'cinderglass',
      'kilnflux', 'lodeframe', 'setresin', 'fibercloth', 'groundlens', 'glasseal', 'emberglass',
      'steelcasting', 'brazecasting', 'platecasting', 'polecasting', 'cryocasting',
      // §17's last quench medium, and the only STARRED material in the game
      // that is made rather than dug.
      'pyrebath']) {
      expect(worked.some((m) => m.id === id), `${id} is a worked material`).toBe(true);
    }
  });

  it('none of them belongs to a shell taxonomy', () => {
    // Otherwise they would appear as ore in the Crucible, the merchants, and
    // the Compendium's shell filter.
    for (const shell of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      for (const m of materialsOfShell(shell)) {
        expect(m.worked, `${m.id} is worked but listed under ${shell}`).toBeFalsy();
      }
    }
  });

  it('none of them can ever drop out of the rock', () => {
    // rollDrop filters on `worked`; this asserts the filter is really there by
    // rolling a lot and checking nothing worked ever comes back.
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      const rng = () => (i * 0.618033) % 1;
      const drop = rollDrop('loam', 100, rng) as { materialId?: string };
      if (drop.materialId) seen.add(drop.materialId);
    }
    for (const id of seen) {
      expect(materialDef(id).worked, `${id} dropped out of the rock`).toBeFalsy();
    }
  });
});

describe('tempering is a CONDITION, not a third stat source', () => {
  const openTrough = (s: GameState) => {
    s.depthRecords['ferrite'] = TEMPER_MASTERY * 10;
    addMaterial(s, 'temperash', 50, 20);
    for (const t of TEMPERS) if (t.mediumCost > 0) addMaterial(s, t.medium, 50, 20);
    s.currencies['brick'] = s.currencies['brick']!.add(100_000);
  };

  it('every temper states its condition and pays two different amounts', () => {
    for (const t of TEMPERS) {
      expect(t.when.length, t.id).toBeGreaterThan(15);
      expect(t.flavor.length, t.id).toBeGreaterThan(30);
      expect(t.bonus, t.id).toBeGreaterThan(t.idle);
      // A temper for a situation you have left must be weak, never dead.
      expect(t.idle, t.id).toBeGreaterThan(0);
    }
  });

  // THE VERB TEST. Runes care about ORDER; alloys ACCUMULATE; a temper must
  // depend on the world. If a temper's value never changed with state it would
  // be an alloy with different art.
  it('the same tool is worth different amounts in different situations', () => {
    const { s } = fresh();
    openTrough(s);
    expect(temperTool(s, ctx, 'ember').ok).toBe(true);

    s.pressure.heat = 10;
    const cold = temperBonus(s, 'dustYield');
    s.pressure.heat = 80;
    const hot = temperBonus(s, 'dustYield');
    expect(hot).toBeGreaterThan(cold);
    expect(cold).toBeGreaterThan(0); // idles, never dead
  });

  it('re-tempering is CHEAPER than the first quench', () => {
    const { s } = fresh();
    openTrough(s);
    const first = temperCost(s, 'sap')!.conv;
    temperTool(s, ctx, 'sap');
    const again = temperCost(s, 'ember')!.conv;
    expect(again).toBeLessThan(first);
  });

  it('refuses to re-quench in what it is already cooled in', () => {
    const { s } = fresh();
    openTrough(s);
    expect(temperTool(s, ctx, 'sap').ok).toBe(true);
    expect(temperTool(s, ctx, 'sap').ok).toBe(false);
  });

  it('there is no roll anywhere — a temper is chosen', () => {
    const { s } = fresh();
    openTrough(s);
    temperTool(s, ctx, 'void');
    expect(equippedTool(s).temper).toBe('void');
    // Same input, same result, every time: nothing to farm.
    const { s: s2 } = fresh();
    openTrough(s2);
    temperTool(s2, ctx, 'void');
    expect(equippedTool(s2).temper).toBe('void');
  });

  it('is shut until the trough is lit', () => {
    const { s } = fresh();
    addMaterial(s, 'temperash', 50, 20);
    expect(temperingUnlocked(s)).toBe(false);
    expect(temperTool(s, ctx, 'sap').ok).toBe(false);
  });
});
