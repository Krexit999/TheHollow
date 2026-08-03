import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { D } from '../decimal';
import type { GameState } from '../types';
import { spiralFromLifetime, spiralPending, gridSlotCost, licenceCost } from '../systems/spiral';
import { mintRelic, addRelic, fuseRelics, relicBonus, equipRelic, RELIC_SLOTS, AFFIXES, SOURCE_BY_ID, SOURCES, fusionPreview } from '../systems/relics';
import { runMigrations, SAVE_VERSION } from '../save/migrations';

const fresh = (): { engine: ReturnType<typeof createEngine>; s: GameState } => {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState };
};

describe('the Spiral — reset layer 4', () => {
  it('pays on the locked formula, past a high-water mark', () => {
    // Spiral = floor( sqrt(TotalAxioms) * RecursionCount )
    expect(spiralFromLifetime(20, 4)).toBe(Math.floor(Math.sqrt(20) * 4));
    expect(spiralFromLifetime(5, 1)).toBe(2);
    expect(spiralFromLifetime(0, 3)).toBe(0);

    const { s } = fresh();
    s.recursion.axiomsEarned = 20;
    s.recursion.count = 4;
    const first = spiralPending(s);
    expect(first).toBe(17);
    // Having taken it once, the same lifetime figures pay nothing more.
    s.spiral.earned = first;
    expect(spiralPending(s)).toBe(0);
  });

  it('needs a Recursion behind it', () => {
    const { engine, s } = fresh();
    s.recursion.axiomsEarned = 100;
    s.recursion.count = 0;
    expect(engine.dispatch({ type: 'spiral' }).ok).toBe(false);
  });

  /**
   * THE ASSERTION THIS REPLACES WAS THE BUG (A.44). It pinned "40 Spiral must
   * buy fewer than 16 slots" to keep capacity scarce — but never asked whether
   * 40 Spiral was a number anyone could HOLD. Lifetime supply is
   * sqrt(Axioms)·Recursions ≈ 21 across the spec's six Recursions, against a
   * full board that cost 192. The test enforced scarcity on top of famine and
   * read green, which is how sixteen authored modules stayed unreachable.
   *
   * The invariant that matters is REACHABILITY AGAINST THE ACTUAL SUPPLY, at
   * both ends: a full board must fit a lifetime, and must not fit an evening.
   */
  const boardCost = (n: number): number => {
    let spent = 0;
    for (let i = 0; i < n; i++) spent += gridSlotCost(i);
    return spent;
  };
  const slotsFor = (bank: number): number => {
    let spent = 0, slots = 0;
    while (slots < 16 && spent + gridSlotCost(slots) <= bank) { spent += gridSlotCost(slots); slots++; }
    return slots;
  };

  it('a full Grid fits a lifetime Spiral budget, and only just', () => {
    // Six Recursions holding ~13 Axioms — the re-rated ladder's own output.
    const lifetime = spiralFromLifetime(13, 6);
    expect(boardCost(16)).toBeLessThanOrEqual(lifetime);
    // ...but it is still most of the purse: no full board without commitment.
    expect(boardCost(16)).toBeGreaterThan(lifetime * 0.75);
  });

  it('a second Recursion seats a meaningful, partial board', () => {
    const atR2 = spiralFromLifetime(5, 2);
    expect(slotsFor(atR2)).toBeGreaterThanOrEqual(3); // enough to feel like a system
    expect(slotsFor(atR2)).toBeLessThan(16); // and nowhere near done
  });

  it('licences trade against Grid depth for the same purse', () => {
    expect(licenceCost(0)).toBeLessThan(licenceCost(3));
    expect(licenceCost(0)).toBeGreaterThan(0);
  });
});

describe('relics cannot punish bad luck', () => {
  it('affix SHAPE is fixed by context; only magnitude rolls', () => {
    const { s } = fresh();
    const seen = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      const r = mintRelic(s, 'warren', seed);
      for (const k of Object.keys(r.affixes)) seen.add(k);
    }
    // Everything a Warren relic can carry comes from the Warren pool.
    const warrenPool = SOURCE_BY_ID.get('warren')!.pool;
    for (const k of seen) expect(warrenPool).toContain(k);
  });

  it('fusion keeps the better of each affix and never destroys value', () => {
    const { s } = fresh();
    s.relics.shards = 999; // A.46: a fusion costs shards now
s.currencies['core'] = D(9999); // A.48: and Cores — the price that escalates
    const a = addRelic(s, mintRelic(s, 'depth', 3));
    const b = addRelic(s, mintRelic(s, 'depth', 9));
    const bestBefore: Record<string, number> = {};
    for (const r of [a, b]) {
      for (const [k, v] of Object.entries(r.affixes)) bestBefore[k] = Math.max(bestBefore[k] ?? 0, v);
    }
    expect(fuseRelics(s, a.uid, b.uid).ok).toBe(true);
    const kept = s.relics.held.find((r) => r.uid === a.uid)!;
    // Nothing either relic carried was lost.
    for (const [k, v] of Object.entries(bestBefore)) expect(kept.affixes[k]).toBeGreaterThanOrEqual(v);
    expect(s.relics.held.some((r) => r.uid === b.uid)).toBe(false);
    expect(kept.rarity).toBeGreaterThanOrEqual(Math.max(a.rarity, b.rarity));
  });

  it('a rising floor means late finds are never worse than early ones', () => {
    const { s } = fresh();
    const early = mintRelic(s, 'depth', 7);
    s.relics.floorBonus = 0.5;
    const late = mintRelic(s, 'depth', 7);
    const sum = (r: typeof early) => Object.values(r.affixes).reduce((a, b) => a + b, 0);
    expect(sum(late)).toBeGreaterThanOrEqual(sum(early));
  });

  it('equips at most six and sums into buckets', () => {
    const { s } = fresh();
    for (let i = 0; i < 8; i++) addRelic(s, mintRelic(s, 'depth', i + 1));
    for (let i = 0; i < 8; i++) {
      const r = s.relics.held[i]!;
      // slots beyond the sixth are refused
      const res = equipRelic(s, r.uid, i);
      if (i >= RELIC_SLOTS) expect(res.ok).toBe(false);
    }
    expect(s.relics.equipped.length).toBeLessThanOrEqual(RELIC_SLOTS);
    expect(relicBonus(s, 'dustYield')).toBeGreaterThanOrEqual(0);
  });
});

describe('save v12', () => {
  it('migrates a v11 save by adding the four long-tail slices', () => {
    const payload = { version: 11, savedAtMs: 0, state: { seenSystems: ['dig'] } } as never;
    const out = runMigrations(payload);
    expect(out.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(48); // A.76 seeds the Reading desk
    const st = out.state as Record<string, unknown>;
    // The casting slices arrive on a save that predates them by twenty-seven
    // versions, which is the whole point of the chain. A returning player's
    // tool arrives FRESH — they are not billed for swings taken before the
    // pool existed, nor credited for cells mined before levels did.
    const casting = st['casting'] as {
      rack: unknown[]; wear: number; repairs: number; xp: number;
      crucible: { queue: unknown[] };
    };
    expect(casting).toBeDefined();
    expect(casting.rack).toHaveLength(0);
    expect(casting.wear).toBe(0);
    expect(casting.repairs).toBe(0);
    expect(casting.xp).toBe(0);
    expect(casting.crucible.queue).toEqual([]);
    expect(st['spiral']).toBeDefined();
    expect(st['relics']).toBeDefined();
    // A returning player has done none of it.
    expect((st['spiral'] as { count: number }).count).toBe(0);
    expect((st['relics'] as { held: unknown[] }).held).toHaveLength(0);
    // A.49: the standing order arrives OFF, so a load can never eat a find.
    expect((st['relics'] as { autoScrap: { on: boolean } }).autoScrap.on).toBe(false);
  });

  it('migrates a v12 save by adding the confluence ledger', () => {
    const payload = { version: 12, savedAtMs: 0, state: { seenSystems: ['dig'] } } as never;
    const out = runMigrations(payload);
    expect(out.version).toBe(SAVE_VERSION);
    const st = out.state as Record<string, unknown>;
    // Found-nothing is correct: the confluences were always true, nobody had
    // written them down. They re-discover the moment their conditions hold.
    expect((st['confluences'] as { found: string[] }).found).toEqual([]);
  });
});

describe('bonus definitions point at REAL modifier buckets', () => {
  // Cases shipped with `dropChance` and `cellCap`, which are not buckets the
  // modifier layer knows. They registered into nothing and paid nothing —
  // silent, because registerModifier happily accepts any string. This asserts
  // every bucket a bonus names is one the game actually reads.
  const REAL: string[] = [
    'dustYield', 'brickYield', 'regen', 'cap', 'kilnRate', 'kilnHeatRamp',
    'drillSpeed', 'drillPower', 'xpGain', 'descendCost', 'dropRate',
    'assaySpeed', 'chainPower', 'offlineEffAdd',
  ];

  it('every relic affix targets a real bucket', () => {
    for (const [key, def] of Object.entries(AFFIXES)) {
      expect(REAL, `relic affix '${key}' targets unknown bucket '${def.bucket}'`).toContain(def.bucket);
    }
  });

  it('every relic source pool names affixes that exist', () => {
    for (const src of SOURCES) {
      for (const key of src.pool) {
        expect(Object.keys(AFFIXES), `source '${src.id}' lists unknown affix '${key}'`).toContain(key);
      }
    }
  });

  // The fusion chooser shows the player what a fusion WOULD do before it eats
  // a relic. If the preview and the real thing ever disagree, the chooser is
  // lying — so replay one against the other rather than testing them apart.
  it('fusionPreview matches what fuseRelics actually does', () => {
    const eng = createEngine();
    const s = eng.getState() as GameState;
    const a = addRelic(s, { uid: 0, defId: 'test', rarity: 1, source: 'shaft', affixes: { dustYield: 0.10, regen: 0.05 }, fusedFrom: 0 });
    const b = addRelic(s, { uid: 0, defId: 'test', rarity: 3, source: 'warren', affixes: { dustYield: 0.25, xpGain: 0.12 }, fusedFrom: 0 });

    // The Museum is gone (A.7x); fusion rarity is never gated now — see the
    // fusionGate() rewire in systems/relics.ts.
    const pv = fusionPreview(s, a.uid, b.uid)!;
    expect(pv.gained.map((g) => g.key)).toEqual(['xpGain']);       // a lacks it
    expect(pv.improved.map((i) => i.key)).toEqual(['dustYield']);  // b is stronger
    expect(pv.wasted).toEqual([]);                                 // b has no weaker line
    expect(pv.rarityUp).toBe(true);                                // 3 > 1
    expect(pv.gatedBy).toBeUndefined();                            // never gated

    const before = { ...a.affixes };
    s.relics.shards = 999; // A.46: a fusion costs shards now
s.currencies['core'] = D(9999); // A.48: and Cores — the price that escalates
    expect(fuseRelics(s, a.uid, b.uid).ok).toBe(true);
    const after = s.relics.held.find((r) => r.uid === a.uid)!;

    for (const g of pv.gained) expect(after.affixes[g.key]).toBe(g.value);
    for (const i of pv.improved) {
      expect(before[i.key]).toBe(i.from);
      expect(after.affixes[i.key]).toBe(i.to);
    }
    expect(after.rarity).toBe(3);
  });

  it('fusionPreview reports a fusion that would add nothing', () => {
    const eng = createEngine();
    const s = eng.getState() as GameState;
    const strong = addRelic(s, { uid: 0, defId: 'test', rarity: 4, source: 'shaft', affixes: { dustYield: 0.30 }, fusedFrom: 0 });
    const weak = addRelic(s, { uid: 0, defId: 'test', rarity: 1, source: 'shaft', affixes: { dustYield: 0.05 }, fusedFrom: 0 });
    const pv = fusionPreview(s, strong.uid, weak.uid)!;
    expect(pv.gained).toEqual([]);
    expect(pv.improved).toEqual([]);
    expect(pv.wasted.map((w) => w.key)).toEqual(['dustYield']);
    expect(pv.rarityUp).toBe(false);
  });
});
