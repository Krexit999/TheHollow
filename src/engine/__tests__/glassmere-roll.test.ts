/**
 * GLASSMERE'S GEOGRAPHY (A.89) — the fourth authored Roll.
 *
 * The SHAPE rules run across every authored shell in `ferrite-roll.test.ts` and
 * are not repeated. This holds what is Glassmere's alone: its ladder, its five
 * orphans, pillar 2, and what the shell can now support.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { D } from '../decimal';
import { ModifierCache } from '../modifiers';
import { ensureContentLoaded } from '../content';
import { dpsMax } from '../systems/face';
import { MATERIALS, gateDepth, materialDef, remainsAt, rollDrop } from '../materials';
import { AUTHORED_SHELLS, NO_SUCH_SHELL, authoredRoll } from '../content/rolls';
import { ensureRoll } from '../systems/roll';
import { deepGatesFor, rollDeepEntry } from '../systems/compaction';
import { bands, driftDepth, shoreBand } from '../systems/shoring';
import { availableReads, stationHere } from '../systems/circuit';
import { atRest, nearestRest } from '../systems/gear';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx: EngineCtx = { emit() {}, dirty() {} } as unknown as EngineCtx;
let s: GameState;

function inGlassmere(): GameState {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  st.shell.current = 'glassmere';
  ensureRoll(st);
  return st;
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REMAINS = ['glasschitin', 'coldsinew', 'lenswing', 'prismheart', 'unblinkingTear'];

beforeEach(() => { s = inGlassmere(); });

describe('the fixture is real', () => {
  it('nineteen stations, floor at 380 — the registry\'s number, not the spine\'s', () => {
    const roll = authoredRoll('glassmere');
    expect(roll.length).toBe(19);
    expect(roll[0]!.name).toBe('The Silvering');
    expect(roll[roll.length - 1]!.name).toBe('THE DARK PANE');
    expect(roll[roll.length - 1]!.depth).toBe(380);
  });

  it('and the four names the spine DOES author are kept exactly', () => {
    const at = (d: number) => authoredRoll('glassmere').find((x) => x.depth === d);
    expect(at(20)?.name).toBe('Prism Fall');
    expect(at(20)?.wreck).toBe('THE PRISM');
    expect(at(90)?.name).toBe("Patternwright's Rest");
    expect(at(90)?.wreck).toBe('THE PATTERN BENCH');
    expect(at(130)?.name).toBe('The Balance House');
    expect(at(130)?.wreck).toBe('THE BALANCE');
    expect(at(380)?.name).toBe('THE DARK PANE');
  });

  it('two RESTs, spread across a 380m shell', () => {
    expect(authoredRoll('glassmere').filter((d) => d.type === 'rest').map((d) => d.depth))
      .toEqual([78, 232]);
  });
});

describe('1 — the deep-entry ladder (§16.2)', () => {
  it('weepstone is reused — a Loam aberrant the spine names as Glassmere\'s first gate', () => {
    expect(deepGatesFor('glassmere').map((g) => [g.at, g.materialId]))
      .toEqual([[20, 'truelight'], [14, 'truesilica'], [8, 'weepstone']]);
    expect(materialDef('weepstone').shellId, 'reused, not re-declared').toBe('loam');
    expect(materialDef('weepstone').source, 'and still an ordinary pool stone').toBeUndefined();
  });

  it('the two new ones are deep-flagged and pool-excluded', () => {
    for (const id of ['truesilica', 'truelight']) {
      expect(materialDef(id).shellId, id).toBe('glassmere');
      expect(materialDef(id).source, `${id} would be pool-eligible`).toBe('deep');
    }
    const rng = seeded(13);
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      const r = rollDrop('glassmere', i % 381, rng);
      if (r.kind === 'material') seen.add(r.materialId!);
    }
    expect(seen.has('truesilica')).toBe(false);
    expect(seen.has('truelight')).toBe(false);
  });

  it('all three gates pay, and only at their own rung', () => {
    const got: Record<number, Set<string>> = { 8: new Set(), 14: new Set(), 20: new Set() };
    const real = Math.random;
    Math.random = seeded(53);
    try {
      for (const c of [8, 14, 20] as const) {
        for (let i = 0; i < 3000; i++) {
          const id = rollDeepEntry(s, ctx, c);
          if (id) got[c]!.add(id);
        }
      }
    } finally { Math.random = real; }
    expect([...got[8]!]).toEqual(['weepstone']);
    expect([...got[14]!]).toEqual(['truesilica']);
    expect([...got[20]!]).toEqual(['truelight']);
  });
});

describe('2 — the five combat orphans drop, by place (§16.4)', () => {
  it('none of them still says combat, and each is buried somewhere', () => {
    const placed = new Set(authoredRoll('glassmere').flatMap((d) => d.remains ?? []));
    for (const id of REMAINS) {
      expect(materialDef(id).source, id).toBe('remains');
      expect(placed.has(id), `${id} is buried nowhere`).toBe(true);
    }
    expect(MATERIALS.filter((m) => m.shellId === 'glassmere' && m.source === 'combat')).toHaveLength(0);
  });

  it('45,000 rolls across 0-380 produce ALL FIVE, at their places, above their gates', () => {
    const rng = seeded(20260807);
    const at = new Map<string, number[]>();
    for (let i = 0; i < 45_000; i++) {
      const d = i % 381;
      const r = rollDrop('glassmere', d, rng);
      if (r.kind !== 'material') continue;
      at.set(r.materialId!, [...(at.get(r.materialId!) ?? []), d]);
    }
    expect(REMAINS.filter((id) => !at.has(id)), 'never dropped').toEqual([]);
    for (const id of REMAINS) {
      const stations = authoredRoll('glassmere').filter((st) => (st.remains ?? []).includes(id));
      const stray = at.get(id)!.filter((d) => !stations.some((st) => Math.abs(st.depth - d) <= 4));
      expect(stray, `${id} came up at ${stray.slice(0, 5).join(',')}`).toEqual([]);
      const gate = gateDepth('glassmere', materialDef(id).rarity);
      expect(at.get(id)!.filter((d) => d < gate), `${id} under its gate`).toEqual([]);
    }
  });

  it('and a barren depth rolls what it did — nothing was added to the pool', () => {
    // 320: The Unblinking's Round is at 300 and The White Room at 340.
    expect(remainsAt('glassmere', 320)).toEqual([]);
  });
});

describe('3 — PILLAR 2: geography is not income', () => {
  it('dpsMax at the SAME depth is identical with the Roll and without it', () => {
    const read = (shell: string): number => {
      const st = createEngine({ nowMs: 0 }).getState() as GameState;
      st.shell.current = shell;
      ensureRoll(st);
      st.depth = 62; // THE SAME DEPTH IN BOTH ARMS
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    // A.90: seven authored geographies, one depth, one ceiling. See the note
    // in `verdance-roll.test.ts` — the unauthored control arm no longer exists.
    const all = AUTHORED_SHELLS.map((id) => [id, read(id)] as const);
    for (const [id, v] of all) expect(v, `${id} reads a different ceiling`).toBe(all[0]![1]);
    expect(authoredRoll(NO_SUCH_SHELL)).toEqual([]);
  });
});

describe('4 — what the shell can now support', () => {
  it('SHORING: bands exist, one can be timbered, and the purse is LUMEN', () => {
    expect(bands(s)[0]!.def.id).toBe('dimglassreach');
    s.depthRecords['glassmere'] = 380;
    s.roll!.rig = true;
    s.casting.rack = Array.from({ length: 8 }, (_, i) =>
      ({ id: `p${i}`, materialId: 'silicash', shape: 'head', purity: 50, traits: [] } as never));
    // The refusal names the shell's own converter currency, never "Brick".
    s.currencies['lumen'] = D(0);
    expect(shoreBand(s, ctx, 'dimglassreach').reason).toBe('Not enough Lumen.');
    s.currencies['lumen'] = D('1e20');
    expect(shoreBand(s, ctx, 'dimglassreach').ok).toBe(true);
    expect(driftDepth(s)).toBe(14);
  });

  it('THE CIRCUIT: its world reads are live in Glassmere', () => {
    const ids = availableReads(s).map((r) => r.id);
    expect(ids).toContain('seam');
    expect(ids).toContain('station');
    s.depth = 130;
    expect(stationHere(s)?.name).toBe('The Balance House');
    expect(stationHere(s)?.type).toBe('wreck');
  });

  it('GEAR: both RESTs are stood at, and nowhere else is', () => {
    s.depth = 78;
    expect(atRest(s)).toEqual({ ok: true, station: 'The Quiet Gallery' });
    s.depth = 232;
    expect(atRest(s)).toEqual({ ok: true, station: 'The Long Focus' });
    s.depth = 300;
    expect(atRest(s).ok).toBe(false);
    expect(nearestRest(s)?.name).toBe('The Long Focus');
  });

  /**
   * §7.2's GLASSMERE RULE — "a machine in an unallocated band runs at half and
   * loses no purity" — needs TWO things. The BAND is Glassmere's own signature
   * and exists (`systems/refraction.ts`); the per-machine CONDITION is E2, and
   * E2 is not built. So the Roll supplies the place and the half that is
   * missing is the same one the Circuit is ledgered against.
   */
  it('§7.2: the band half exists, the machine half does not — stated, not implied', async () => {
    const refraction = await import('../systems/refraction');
    // THE BANDS ARE REAL: six wavelengths with their own rules, and a beam that
    // allocates across them. This is Glassmere's signature and is not touched.
    expect(refraction.WAVELENGTH_NAMES.length).toBe(6);
    expect(refraction.WAVELENGTH_RULES.length).toBe(6);
    const plant = await import('../systems/plant');
    // THE MACHINE HALF IS NOT: a machine has tiers, served-Flow and the parts it
    // was cast from, and NO condition a band could warp. That field is E2
    // (§7.2), ledgered unbuilt since A.85 — the same half the Circuit wants.
    expect(Object.keys(plant.defaultPlantState())).not.toContain('condition');
  });
});
