/**
 * VERDANCE'S GEOGRAPHY (A.88) — the third authored Roll.
 *
 * The SHAPE rules — one floor at the shell floor, walls facing the gates that
 * exist, a narrow re-roll band, seams inside their rarity gates, no worked stone
 * in a pool, remains from the shell's own taxonomy — are asserted across every
 * authored shell in `ferrite-roll.test.ts` and are not repeated here. This file
 * holds what is Verdance's alone:
 *
 *   1  the ladder — two of its three deep-entry stones are stones that already
 *      existed, and only the terminal is new
 *   2  the six combat orphans, by place, under their own gates
 *   3  PILLAR 2 — none of it is income
 *   4  what the shell can now support
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { D } from '../decimal';
import { ModifierCache } from '../modifiers';
import { ensureContentLoaded } from '../content';
import { dpsMax } from '../systems/face';
import { MATERIALS, RARITY_GATES, materialDef, remainsAt, rollDrop } from '../materials';
import { anUnauthoredShell, authoredRoll } from '../content/rolls';
import { ensureRoll, shellRoll } from '../systems/roll';
import { deepGatesFor, rollDeepEntry } from '../systems/compaction';
import { bands, driftDepth, shoreBand } from '../systems/shoring';
import { availableReads, stationHere } from '../systems/circuit';
import { atRest, nearestRest } from '../systems/gear';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx: EngineCtx = { emit() {}, dirty() {} } as unknown as EngineCtx;
let s: GameState;

function inVerdance(): GameState {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  st.shell.current = 'verdance';
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

const REMAINS = ['throatroot', 'mothspool', 'wireweed', 'palefiber', 'mawpith', 'plentyheart'];

beforeEach(() => { s = inVerdance(); });

describe('the fixture is real', () => {
  it('Verdance is authored, twenty stations, floor at 290', () => {
    const roll = authoredRoll('verdance');
    expect(roll.length).toBe(20);
    expect(roll[0]!.name).toBe('The Greenfall');
    expect(roll[roll.length - 1]!.name).toBe('THORNWALL');
    expect(roll[roll.length - 1]!.depth).toBe(290);
  });

  it('and the four names the spine DOES author are kept exactly', () => {
    const at = (d: number) => authoredRoll('verdance').find((x) => x.depth === d);
    expect(at(30)?.name).toBe("Stillwright's Bower");
    expect(at(30)?.wreck).toBe('THE STILL');
    expect(at(120)?.name).toBe('Pressyard');
    expect(at(120)?.wreck).toBe('THE PRESS');
    expect(at(172)?.name).toBe("Linewright's Fall");
    expect(at(172)?.wreck).toBe('THE LINE');
    expect(at(290)?.name).toBe('THORNWALL');
  });

  it('two RESTs, so the far half of a 290m shell can swap gear too', () => {
    const rests = authoredRoll('verdance').filter((d) => d.type === 'rest');
    expect(rests.map((d) => d.depth)).toEqual([88, 145]);
  });
});

describe('1 — the deep-entry ladder reuses what exists (§16.2)', () => {
  it('sapstone and bindingclay are the c>=8 and c>=14 stones, and both predate this pass', () => {
    expect(deepGatesFor('verdance').map((g) => [g.at, g.materialId]))
      .toEqual([[20, 'thornwall'], [14, 'bindingclay'], [8, 'sapstone']]);
    // Neither is new, and neither is `deep`-flagged — they are ordinary stone
    // the gate gives you a SECOND way to find, exactly as `umberjade` is Loam's
    // and `wormsteel` is Ferrite's.
    expect(materialDef('sapstone').source).toBeUndefined();
    expect(materialDef('bindingclay').source).toBeUndefined();
    expect(materialDef('sapstone').shellId).toBe('verdance');
    expect(materialDef('bindingclay').shellId).toBe('loam');
  });

  it('only the TERMINAL is new, and it comes out of the gate and nowhere else', () => {
    const t = materialDef('thornwall');
    expect(t.shellId).toBe('verdance');
    expect(t.rarity).toBe('starred');
    expect(t.source, 'a terminal must never be pool-eligible').toBe('deep');
    const rng = seeded(3);
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      const r = rollDrop('verdance', i % 291, rng);
      if (r.kind === 'material') seen.add(r.materialId!);
    }
    expect(seen.has('thornwall')).toBe(false);
    // ...while the two REUSED ones do still come out of the ordinary table.
    expect(seen.has('sapstone'), 'sapstone should still be diggable').toBe(true);
  });

  it('all three gates pay, and only at their own rung', () => {
    const got: Record<number, Set<string>> = { 8: new Set(), 14: new Set(), 20: new Set() };
    const real = Math.random;
    Math.random = seeded(41);
    try {
      for (const c of [8, 14, 20] as const) {
        for (let i = 0; i < 3000; i++) {
          const id = rollDeepEntry(s, ctx, c);
          if (id) got[c]!.add(id);
        }
      }
    } finally { Math.random = real; }
    expect([...got[8]!]).toEqual(['sapstone']);
    expect([...got[14]!]).toEqual(['bindingclay']);
    expect([...got[20]!]).toEqual(['thornwall']);
  });

  it('and a Loam player is untouched by any of it', () => {
    const loam = createEngine({ nowMs: 0 }).getState() as GameState;
    const real = Math.random;
    Math.random = seeded(9);
    const got = new Set<string>();
    try {
      for (let i = 0; i < 3000; i++) {
        const id = rollDeepEntry(loam, ctx, 20);
        if (id) got.add(id);
      }
    } finally { Math.random = real; }
    expect([...got]).toEqual(['deepgrave']);
  });
});

describe('2 — the six combat orphans drop, by place (§16.4)', () => {
  it('none of them still says combat, and each is buried somewhere', () => {
    const placed = new Set(authoredRoll('verdance').flatMap((d) => d.remains ?? []));
    for (const id of REMAINS) {
      expect(materialDef(id).source, id).toBe('remains');
      expect(placed.has(id), `${id} is buried nowhere`).toBe(true);
    }
    expect(MATERIALS.filter((m) => m.shellId === 'verdance' && m.source === 'combat')).toHaveLength(0);
  });

  it('45,000 rolls across depths 0-290 produce ALL SIX, at their places, above their gates', () => {
    const rng = seeded(20260806);
    const at = new Map<string, number[]>();
    for (let i = 0; i < 45_000; i++) {
      const d = i % 291;
      const r = rollDrop('verdance', d, rng);
      if (r.kind !== 'material') continue;
      at.set(r.materialId!, [...(at.get(r.materialId!) ?? []), d]);
    }
    const missing = REMAINS.filter((id) => !at.has(id));
    expect(missing, `never dropped: ${missing.join(', ')}`).toEqual([]);

    for (const id of REMAINS) {
      const stations = authoredRoll('verdance').filter((st) => (st.remains ?? []).includes(id));
      const stray = at.get(id)!.filter((d) => !stations.some((st) => Math.abs(st.depth - d) <= 4));
      expect(stray, `${id} came up at ${stray.slice(0, 5).join(',')} — no station there`).toEqual([]);
      const gate = RARITY_GATES[materialDef(id).rarity].minDepth;
      expect(at.get(id)!.filter((d) => d < gate), `${id} under its gate (${gate})`).toEqual([]);
    }
  });

  it('and nothing was added to the rarity pool — a barren depth rolls what it did', () => {
    // Depth 230: Old Plenty's Round is at 240 and The Split at 209, both out of
    // the +-4 reach.
    expect(remainsAt('verdance', 230)).toEqual([]);
  });
});

describe('3 — PILLAR 2: geography is not income', () => {
  it('dpsMax at the SAME depth is identical with the Roll and without it', () => {
    const read = (shell: string): number => {
      const st = createEngine({ nowMs: 0 }).getState() as GameState;
      st.shell.current = shell;
      ensureRoll(st);
      st.depth = 56; // THE SAME DEPTH IN BOTH ARMS — Depth Pressure is a yield term
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    const none = anUnauthoredShell();
    expect(read('verdance')).toBe(read(none));
    expect(authoredRoll(none), 'the control arm really has no Roll').toEqual([]);
    expect(authoredRoll('verdance').length).toBe(20);
  });
});

describe('4 — what the shell can now support', () => {
  it('SHORING: Verdance has bands, and one can be timbered — in SAP, not Brick', () => {
    expect(bands(s).length).toBe(19); // twenty stations, and The Greenfall has no band
    expect(bands(s)[0]!.def.id).toBe('rootbind');
    s.depthRecords['verdance'] = 290;
    s.roll!.rig = true;
    s.currencies['sap'] = D('1e16');
    s.casting.rack = Array.from({ length: 8 }, (_, i) =>
      ({ id: `p${i}`, materialId: 'sporewood', shape: 'head', purity: 50, traits: [] } as never));
    expect(shoreBand(s, ctx, 'rootbind').ok).toBe(true);
    expect(driftDepth(s)).toBe(12);
  });

  it('THE CIRCUIT: its world reads are live in Verdance', () => {
    const ids = availableReads(s).map((r) => r.id);
    expect(ids).toContain('seam');
    expect(ids).toContain('station');
    expect(ids).toContain('hazard');
    s.depth = 72;
    expect(stationHere(s)?.name).toBe('The Cankerworks');
    expect(stationHere(s)?.type).toBe('hazard');
  });

  it('GEAR: both Verdance RESTs are stood at, and nowhere else is', () => {
    s.depth = 88;
    expect(atRest(s)).toEqual({ ok: true, station: 'Wick Row' });
    s.depth = 145;
    expect(atRest(s)).toEqual({ ok: true, station: 'The Quiet Quarter' });
    s.depth = 200;
    expect(atRest(s).ok).toBe(false);
    expect(nearestRest(s)?.name).toBe('The Quiet Quarter');
  });

  it('THE ASSAY BENCH: the shell has fog to burn — rows beyond the lamp', () => {
    s.depth = 0;
    expect(shellRoll(s).filter((d) => d.depth > 60).length).toBeGreaterThan(10);
  });
});
