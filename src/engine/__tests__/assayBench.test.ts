/**
 * THE ASSAY BENCH AND THE ASSAY CALL (§9.3, §16.3, §40.3).
 *
 * The claims: information NARROWS and nothing SETTLES, the Bench burns fog off
 * the Roll rather than printing a recipe, the trap material is genuinely
 * tempting and genuinely wrong, and none of it moves the field ceiling.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { Engine, EngineCtx, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import {
  MAX_BENCH_TIER, SAMPLE_SECONDS, SAMPLE_SURGE, assayCall, beginSample, callPool,
  clearSamples, ensureAssayBench, ensureCall, fogBurnt, isSampled, sampleReport,
  sampleable, tickAssayBench,
} from '../systems/assayBench';
import { rollRows, shellRoll } from '../systems/roll';
import { ensurePlant, surgeCap, demandOf } from '../systems/plant';
import { dpsMax } from '../systems/face';
import { rollDrop } from '../materials';
import { traitsOf } from '../traits';
import { DEEP_GATES } from '../systems/compaction';

const ctx: EngineCtx = { emit() {}, dirty() {} };
function fresh(): { engine: Engine; s: () => GameState } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: () => engine.getState() as GameState };
}

/** A bench at `tier` with a full bank behind it. */
function withBench(st: GameState, tier: number): void {
  ensureAssayBench(st).tier = tier;
  ensurePlant(st).surge = surgeCap(st);
}

describe('PILLAR 2 — information never moves the ceiling', () => {
  it('no bench tier, no sample and no Call moves dpsMax by one unit', () => {
    const { s } = fresh();
    const st = s();
    const m = new ModifierCache();
    st.kiln.built = true;
    const before = dpsMax(st, m).toNumber();
    withBench(st, MAX_BENCH_TIER);
    for (const def of shellRoll(st)) ensureAssayBench(st).sampled.push(def.id);
    ensureAssayBench(st).call = { materialId: 'marl', rolls: st.roll?.rolls ?? 0 };
    m.invalidate();
    expect(dpsMax(st, m).toNumber()).toBe(before);
    // ...and the systems really are on, so this is not a vacuous pass.
    expect(fogBurnt(st).read).toBeGreaterThan(0);
    expect(assayCall(st)).toBe('marl');
  });

  it('THE CALL REDISTRIBUTES DROPS, IT DOES NOT MINT THEM', () => {
    // Same rng, same depth, same number of rolls, with and without a favour.
    // The favoured material must come up MORE and something else LESS — the
    // total is fixed at exactly the number of rolls either way.
    // MULBERRY32, not a hand-rolled LCG. The first cut used
    // `x*1103515245+12345 % 2^31`, which overflows 2^53 in JS and degenerates —
    // it is why the millstone check below originally read as a game bug.
    const seq = (seed: number) => {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    const N = 4000;
    const count = (favoured: string | null): Map<string, number> => {
      const rng = seq(99);
      const out = new Map<string, number>();
      for (let i = 0; i < N; i++) {
        const d = rollDrop('loam', 20, rng, favoured);
        if (d.kind === 'material' && d.materialId) out.set(d.materialId, (out.get(d.materialId) ?? 0) + 1);
      }
      return out;
    };
    const plain = count(null);
    const favoured = count('marl');
    const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
    expect(total(favoured)).toBe(total(plain)); // nothing minted
    expect(favoured.get('marl') ?? 0).toBeGreaterThan(plain.get('marl') ?? 0);
  });
});

describe('THE ASSAY CALL — narrowed by information, settled by nothing (§40.3)', () => {
  it('names a material the shell can actually produce', () => {
    const { s } = fresh();
    const st = s();
    const call = ensureCall(st);
    expect(call).not.toBeNull();
    expect(callPool(st)).toContain(call);
  });

  it('is STABLE within a run — re-reading it does not re-roll it', () => {
    const { s } = fresh();
    const st = s();
    const first = ensureCall(st);
    for (let i = 0; i < 50; i++) ensureCall(st);
    expect(assayCall(st)).toBe(first);
  });

  it('MOVES WHEN THE STATIONS DO — it is keyed to the re-roll counter', () => {
    // Not "moves on a Collapse" by coincidence: keyed to `roll.rolls`, so it
    // cannot drift out of step with the contents it is a claim about.
    const { s } = fresh();
    const st = s();
    ensureCall(st);
    const before = assayCall(st);
    st.roll!.rolls += 1;
    ensureCall(st);
    expect(ensureAssayBench(st).call!.rolls).toBe(st.roll!.rolls);
    // With a pool this size a single re-roll may repeat by chance; what must be
    // true is that it RE-ROLLED, which the counter proves. Over many rolls it
    // must actually land somewhere else at least once.
    let moved = false;
    for (let i = 0; i < 40 && !moved; i++) {
      st.roll!.rolls += 1;
      ensureCall(st);
      if (assayCall(st) !== before) moved = true;
    }
    expect(moved).toBe(true);
  });
});

describe('THE BENCH BURNS FOG OFF THE ROLL (§9.3)', () => {
  it('a sample costs SURGE, all at once, and refuses on a short bank', () => {
    const { s } = fresh();
    const st = s();
    withBench(st, 2);
    const target = sampleable(st)[0]!;
    ensurePlant(st).surge = SAMPLE_SURGE - 0.01;
    const r = beginSample(st, ctx, target.id);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Surge|short/i);
    // Nothing was half-spent: the sample did not happen at all.
    expect(ensureAssayBench(st).running).toBeNull();
  });

  it('demand is pure Surge — a sustained plant buys nothing here', () => {
    expect(demandOf('assayBench').flow).toBe(0);
    expect(demandOf('assayBench').surge).toBe(SAMPLE_SURGE);
  });

  it('BURNS THE FOG: a station beyond the lamp becomes legible', () => {
    const { s } = fresh();
    const st = s();
    withBench(st, 2);
    // A station well past the three-ahead window.
    const far = shellRoll(st)[9]!;
    expect(rollRows(st).find((r) => r.def.id === far.id)!.legible).toBe(false);
    expect(beginSample(st, ctx, far.id).ok).toBe(true);
    st.stats.playTimeSec += SAMPLE_SECONDS[2]! + 1;
    tickAssayBench(st, ctx);
    expect(isSampled(st, far.id)).toBe(true);
    const row = rollRows(st).find((r) => r.def.id === far.id)!;
    expect(row.legible).toBe(true);
    expect(row.sampled).toBe(true); // ...and the row can say WHY
  });

  it('TIER I reads only where you stand; TIER II reads ahead', () => {
    const { s } = fresh();
    const st = s();
    st.depth = 40;
    withBench(st, 1);
    const one = sampleable(st);
    expect(one).toHaveLength(1);
    expect(one[0]!.depth).toBeLessThanOrEqual(40);
    withBench(st, 2);
    expect(sampleable(st).length).toBeGreaterThan(1);
  });

  it('TIER III, AND ONLY TIER III, PREDICTS DEEP ENTRY', () => {
    const { s } = fresh();
    const st = s();
    withBench(st, 2);
    const target = sampleable(st)[0]!;
    ensureAssayBench(st).sampled.push(target.id);
    expect(sampleReport(st, target.id)!.deepEntry).toBeNull();
    ensureAssayBench(st).tier = 3;
    const deep = sampleReport(st, target.id)!.deepEntry;
    expect(deep).not.toBeNull();
    // It reads the gates that exist rather than restating a table.
    expect(deep!.map((d) => d.at).sort((a, b) => a - b))
      .toEqual(DEEP_GATES.map((g) => g.at).sort((a, b) => a - b));
  });

  it('LAW 3 — an unsampled station is not described at all', () => {
    const { s } = fresh();
    const st = s();
    withBench(st, 3);
    const far = shellRoll(st)[9]!;
    // Not a greyed preview, not a priced teaser: NOTHING.
    expect(sampleReport(st, far.id)).toBeNull();
  });

  it('a Collapse closes the fog again — the reading it took is stale', () => {
    const { s } = fresh();
    const st = s();
    withBench(st, 2);
    for (const def of shellRoll(st)) ensureAssayBench(st).sampled.push(def.id);
    expect(fogBurnt(st).read).toBe(fogBurnt(st).total);
    clearSamples(st);
    expect(fogBurnt(st).read).toBe(0);
    // The BENCH survives: a machine is not what a Collapse takes.
    expect(ensureAssayBench(st).tier).toBe(2);
  });
});

describe('THE TRAP MATERIAL (§16.3)', () => {
  it('millstone is genuinely tempting AND genuinely wrong', () => {
    const t = traitsOf('millstone');
    // The temptation: `dense` is exactly what a Core wants.
    expect(t).toContain('dense');
    // The trap: `brittle` is the one trait a Core must not have.
    expect(t).toContain('brittle');
  });

  it('and it exists from era I, so the Still\'s lesson is waiting', () => {
    const { s } = fresh();
    const st = s();
    expect(st.shell.current).toBe('loam');
    expect(st.shell.breachCount).toBe(0);
    // It is a LOAM material and it is mineable — not gated behind a breach, a
    // machine or a skill. DEPTH 80, not 60: `flawless` opens at 70
    // (RARITY_GATES), so a run at 60 can never roll one and would have proved
    // nothing. Loam's floor is 150, so 70 is comfortably inside era I —
    // §16.3's "waiting when the machine arrives" holds.
    const rolled = new Set<string>();
    for (let i = 0; i < 20000; i++) {
      const d = rollDrop('loam', 80, Math.random);
      if (d.kind === 'material' && d.materialId) rolled.add(d.materialId);
    }
    expect(rolled.has('millstone')).toBe(true);
  });
});

describe('MAX TIER', () => {
  it('is three, and the capability list covers every one', () => {
    expect(MAX_BENCH_TIER).toBe(3);
    expect(SAMPLE_SECONDS).toHaveLength(MAX_BENCH_TIER + 1);
  });
});
