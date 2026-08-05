/**
 * CINDER'S GEOGRAPHY AND THE FLOODGATE (A.89, §36.1).
 *
 * The SHAPE rules run across every authored shell in `ferrite-roll.test.ts`.
 * This holds Cinder's own ladder and orphans, and the whole of the new station
 * type — including the two things that decide whether a FLOOD is a real verb or
 * a HAZARD with a new word:
 *
 *   IT CHANGES WHAT YOU DO THERE. Before: the seam re-rolls every Collapse and
 *   nothing waits in the station. After: one seam forever, and a hazard forever.
 *   IT DOES NOT PAY. The drop table is bit-identical either side of a flood.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { D } from '../decimal';
import { ModifierCache } from '../modifiers';
import { ensureContentLoaded } from '../content';
import { dpsMax } from '../systems/face';
import { MATERIALS, gateDepth, materialDef, remainsAt, rollDrop } from '../materials';
import { AUTHORED_SHELLS, NO_SUCH_SHELL, authoredRoll } from '../content/rolls';
import { contentsOf, ensureRoll, rerollRoll, shellRoll, typeOf } from '../systems/roll';
import { deepGatesFor, rollDeepEntry } from '../systems/compaction';
import {
  floodBlocker, floodCost, floodStation, floodable, floodgateBuilt, floodgateStation, isFlooded,
} from '../systems/flood';
import { bands, driftDepth, shoreBand } from '../systems/shoring';
import { availableReads, stationHere } from '../systems/circuit';
import { atRest } from '../systems/gear';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx: EngineCtx = { emit() {}, dirty() {} } as unknown as EngineCtx;
let s: GameState;

function inCinder(): GameState {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  st.shell.current = 'cinder';
  ensureRoll(st);
  return st;
}

/** A player who has walked the whole shell and raised the gate. */
function withGate(): GameState {
  const st = inCinder();
  st.depthRecords['cinder'] = 470;
  st.roll!.floodgate = true;
  st.currencies['ember'] = D('1e40');
  st.casting.rack = Array.from({ length: 12 }, (_, i) =>
    ({ id: `p${i}`, materialId: 'charstone', shape: 'head', purity: 50, traits: [] } as never));
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

const REMAINS = ['emberplate', 'charsinew', 'magmaduct', 'pyregland', 'smolderheart'];

beforeEach(() => { s = inCinder(); });

describe('the fixture is real', () => {
  it('twenty stations, floor at 470 — the registry\'s number', () => {
    // TWENTY at A.94: The Slake (96) carries §13's QUENCH TANK, which §6 gives
    // no wreck. TWENTY-TWO at A.101: the Sluice (196) and the Overflow (224),
    // authored either side of the Bank so §36.1's HEAT CORRIDOR is reachable at
    // all — see `corridor-reach.test.ts` for what those two rows fixed.
    const roll = authoredRoll('cinder');
    expect(roll.length).toBe(22);
    expect(roll[roll.length - 1]!.name).toBe('FLASHPOINT');
    expect(roll[roll.length - 1]!.depth).toBe(470);
  });

  it('and the four names the spine DOES author are kept exactly', () => {
    const at = (d: number) => authoredRoll('cinder').find((x) => x.depth === d);
    expect([at(40)?.name, at(40)?.wreck]).toEqual(['Boilerworks', 'THE BOILER']);
    expect([at(58)?.name, at(58)?.wreck]).toEqual(['Vent Row', 'THE VENT ARRAY']);
    expect([at(120)?.name, at(120)?.wreck]).toEqual(['Retort Hall', 'THE RETORT']);
    expect(at(470)?.name).toBe('FLASHPOINT');
  });
});

// ---------------------------------------------------------------------------
// THE FLOOD STATION TYPE
// ---------------------------------------------------------------------------

describe('the FLOOD type', () => {
  it('Cinder authors exactly four, and NO other shell has one', () => {
    const byShell = Object.fromEntries(AUTHORED_SHELLS.map((id) =>
      [id, authoredRoll(id).filter((d) => d.type === 'flood').map((d) => d.name)]));
    // THE HEATWORKS (196 · 210 · 224) and then the Choke, alone at 355.
    expect(byShell['cinder']).toEqual(['The Sluice', 'The Bank', 'The Overflow', 'The Choke']);
    for (const id of AUTHORED_SHELLS) {
      if (id === 'cinder') continue;
      expect(byShell[id], `${id} should author no flood station`).toEqual([]);
    }
  });

  it('and every one carries a deep-stock pool the permanent seam is drawn from', () => {
    for (const def of authoredRoll('cinder').filter((d) => d.type === 'flood')) {
      expect((def.floodSeams ?? []).length, def.name).toBeGreaterThan(0);
      for (const id of def.floodSeams!) expect(materialDef(id).shellId).toBe('cinder');
    }
  });

  it('the gate is a PLACE then a price, and it is not in this shell by accident', () => {
    expect(floodgateStation(s)?.name).toBe('The Purge');
    expect(floodgateStation(s)?.depth).toBe(430);
    expect(floodgateBuilt(s)).toBe(false);
    expect(floodBlocker(s, 'thebank')).toBe('The Floodgate is not standing.');
  });

  it('a station that is not FLOOD-typed refuses, whatever you pay', () => {
    const st = withGate();
    expect(floodBlocker(st, 'boilerworks')).toBe('That place will not take the heat.');
  });

  it('and you cannot drown a place you have not stood in', () => {
    const st = withGate();
    st.depthRecords['cinder'] = 220;
    expect(floodBlocker(st, 'thebank')).toBeNull();
    expect(floodBlocker(st, 'heatchoke')).toBe('You have not been down there yet.');
  });
});

describe('WHAT A FLOOD CHANGES — the question that makes it not a hazard', () => {
  it('BEFORE: the station re-rolls with everything else, and reads as FLOOD', () => {
    const def = shellRoll(s).find((d) => d.id === 'thebank')!;
    expect(typeOf(s, def)).toBe('flood');
    const rng = seeded(101);
    let moved = 0;
    let prev = JSON.stringify(contentsOf(s, 'thebank'));
    for (let i = 0; i < 30; i++) {
      rerollRoll(s, rng);
      const now = JSON.stringify(contentsOf(s, 'thebank'));
      if (now !== prev) moved += 1;
      prev = now;
    }
    expect(moved, 'an unflooded flood station holds still — the control is dead')
      .toBeGreaterThan(10);
  });

  it('AFTER: one seam forever, and a HAZARD forever', () => {
    const st = withGate();
    const r = floodStation(st, ctx, 'thebank', seeded(7));
    expect(r.ok).toBe(true);
    const def = shellRoll(st).find((d) => d.id === 'thebank')!;
    // The seam came from the DEEP-STOCK pool, not the ordinary one.
    const held = contentsOf(st, 'thebank');
    expect(def.floodSeams).toContain(held.seam);
    // It reads as a hazard, at full intensity, for the rest of the game.
    expect(typeOf(st, def)).toBe('hazard');
    expect(held.hazard).toBe(3);
    // And thirty Collapses do not move it, while the rest of the shell turns.
    const frozen = JSON.stringify(held);
    const rng = seeded(202);
    let others = 0;
    for (let i = 0; i < 30; i++) {
      const was = shellRoll(st).map((d) => JSON.stringify(contentsOf(st, d.id)));
      rerollRoll(st, rng);
      const now = shellRoll(st).map((d) => JSON.stringify(contentsOf(st, d.id)));
      others += now.filter((v, j) => v !== was[j]).length;
      expect(JSON.stringify(contentsOf(st, 'thebank')), 'a drowned station re-rolled').toBe(frozen);
    }
    expect(others, 'nothing else re-rolled either — the control is dead').toBeGreaterThan(60);
  });

  it('there is NO undo — it is not in the action union and not in the module', () => {
    const st = withGate();
    floodStation(st, ctx, 'thebank', seeded(7));
    expect(isFlooded(st, 'thebank')).toBe(true);
    expect(floodBlocker(st, 'thebank')).toBe('Already drowned.');
    // Everything else in the shell is still floodable; the drowned one is not.
    expect(floodable(st).map((d) => d.id))
      .toEqual(['thesluice', 'theoverflow', 'heatchoke']);
  });

  it('it costs the climb to it, and takes cast parts off the rack', () => {
    const st = withGate();
    const before = st.casting.rack!.length;
    const cost = floodCost(210);
    expect(cost.parts).toBe(4);
    expect(cost.conv.gt(0)).toBe(true);
    floodStation(st, ctx, 'thebank', seeded(7));
    expect(st.casting.rack!.length).toBe(before - cost.parts);
  });
});

describe('AND IT DOES NOT PAY — a flood is not a yield event', () => {
  it('the drop table is BIT-IDENTICAL either side of a flood', () => {
    // `rollDrop` is a pure read of the AUTHORED table plus `remainsAt`, so it
    // takes no state — which is itself the point: a flood cannot reach it.
    const sweep = (): string => {
      const rng = seeded(20260808);
      const out: string[] = [];
      for (let i = 0; i < 6000; i++) {
        const r = rollDrop('cinder', 200 + (i % 21), rng);
        out.push(r.kind === 'material' ? r.materialId! : r.kind);
      }
      return out.join(',');
    };
    const st = withGate();
    const before = sweep();
    expect(floodStation(st, ctx, 'thebank', seeded(7)).ok).toBe(true);
    expect(sweep(), 'flooding changed what fell out of the rock').toBe(before);
  });

  it('and dpsMax at the SAME depth is untouched by it', () => {
    const read = (flood: boolean): number => {
      const st = withGate();
      if (flood) floodStation(st, ctx, 'thebank', seeded(7));
      st.depth = 210; // THE SAME DEPTH IN BOTH ARMS
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    expect(read(true)).toBe(read(false));
  });

  it('what it DOES buy is legibility: the Circuit\'s seam read stops moving', () => {
    const st = withGate();
    st.depth = 210;
    st.kiln.built = true;
    const m = new ModifierCache(); m.invalidate();
    const seamRead = () => {
      const r = (availableReads(st).find((x) => x.id === 'seam'))!;
      return String(r.read(st, m, 'kiln'));
    };
    floodStation(st, ctx, 'thebank', seeded(7));
    const fixed = seamRead();
    const rng = seeded(303);
    for (let i = 0; i < 20; i++) rerollRoll(st, rng);
    expect(seamRead(), 'a rule written on this seam came untrue').toBe(fixed);
  });
});

// ---------------------------------------------------------------------------
// CINDER'S OWN CONTENT
// ---------------------------------------------------------------------------

describe('the ladder (§16.2) — Cinder needed only its terminal', () => {
  it('charstone and slagrock are its own commons, and both predate this pass', () => {
    expect(deepGatesFor('cinder').map((g) => [g.at, g.materialId]))
      .toEqual([[20, 'slagglass'], [14, 'slagrock'], [8, 'charstone']]);
    for (const id of ['charstone', 'slagrock']) {
      expect(materialDef(id).shellId, id).toBe('cinder');
      expect(materialDef(id).rarity, id).toBe('common');
      expect(materialDef(id).source, `${id} is an ordinary pool stone`).toBeUndefined();
    }
    expect(materialDef('slagglass').source).toBe('deep');
  });

  it('all three gates pay, and only at their own rung', () => {
    const got: Record<number, Set<string>> = { 8: new Set(), 14: new Set(), 20: new Set() };
    const real = Math.random;
    Math.random = seeded(67);
    try {
      for (const c of [8, 14, 20] as const) {
        for (let i = 0; i < 3000; i++) {
          const id = rollDeepEntry(s, ctx, c);
          if (id) got[c]!.add(id);
        }
      }
    } finally { Math.random = real; }
    expect([...got[8]!]).toEqual(['charstone']);
    expect([...got[14]!]).toEqual(['slagrock']);
    expect([...got[20]!]).toEqual(['slagglass']);
  });
});

describe('the five combat orphans drop, by place (§16.4)', () => {
  it('none of them still says combat, and each is buried somewhere', () => {
    const placed = new Set(authoredRoll('cinder').flatMap((d) => d.remains ?? []));
    for (const id of REMAINS) {
      expect(materialDef(id).source, id).toBe('remains');
      expect(placed.has(id), `${id} is buried nowhere`).toBe(true);
    }
    expect(MATERIALS.filter((m) => m.shellId === 'cinder' && m.source === 'combat')).toHaveLength(0);
  });

  it('45,000 rolls across 0-470 produce ALL FIVE, at their places, above their gates', () => {
    const rng = seeded(20260809);
    const at = new Map<string, number[]>();
    for (let i = 0; i < 45_000; i++) {
      const d = i % 471;
      const r = rollDrop('cinder', d, rng);
      if (r.kind !== 'material') continue;
      at.set(r.materialId!, [...(at.get(r.materialId!) ?? []), d]);
    }
    expect(REMAINS.filter((id) => !at.has(id)), 'never dropped').toEqual([]);
    for (const id of REMAINS) {
      const stations = authoredRoll('cinder').filter((st) => (st.remains ?? []).includes(id));
      const stray = at.get(id)!.filter((d) => !stations.some((st) => Math.abs(st.depth - d) <= 4));
      expect(stray, `${id} came up at ${stray.slice(0, 5).join(',')}`).toEqual([]);
      const gate = gateDepth('cinder', materialDef(id).rarity);
      expect(at.get(id)!.filter((d) => d < gate), `${id} under its gate`).toEqual([]);
    }
  });

  it('and a barren depth rolls what it did', () => {
    // 320: THE WHITE HEAT is at 299 and The Choke at 355.
    expect(remainsAt('cinder', 320)).toEqual([]);
  });
});

describe('PILLAR 2 and what the shell supports', () => {
  it('dpsMax at the SAME depth is identical with the Roll and without it', () => {
    const read = (shell: string): number => {
      const st = createEngine({ nowMs: 0 }).getState() as GameState;
      st.shell.current = shell;
      ensureRoll(st);
      st.depth = 58;
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    // A.90: seven authored geographies, one depth, one ceiling.
    const all = AUTHORED_SHELLS.map((id) => [id, read(id)] as const);
    for (const [id, v] of all) expect(v, `${id} reads a different ceiling`).toBe(all[0]![1]);
    expect(authoredRoll(NO_SUCH_SHELL)).toEqual([]);
  });

  it('SHORING: a band can be timbered, and the purse is EMBER', () => {
    const st = withGate();
    st.roll!.rig = true;
    st.currencies['ember'] = D(0);
    expect(shoreBand(st, ctx, 'cinderfall').reason).toBe('Not enough Ember.');
    st.currencies['ember'] = D('1e40');
    expect(shoreBand(st, ctx, 'cinderfall').ok).toBe(true);
    expect(driftDepth(st)).toBe(16);
    expect(bands(st)[0]!.def.id).toBe('cinderfall');
  });

  it('THE CIRCUIT: a Cinder station reads, including a drowned one', () => {
    const st = withGate();
    st.depth = 210;
    expect(availableReads(st).map((r) => r.id)).toContain('station');
    expect(stationHere(st)?.type).toBe('flood');
    floodStation(st, ctx, 'thebank', seeded(7));
    expect(stationHere(st)?.type, 'a drowned station reads as a hazard').toBe('hazard');
  });

  it('GEAR: both RESTs are stood at', () => {
    s.depth = 80;
    expect(atRest(s)).toEqual({ ok: true, station: 'The Ashfield' });
    s.depth = 380;
    expect(atRest(s)).toEqual({ ok: true, station: 'The Quiet Kiln' });
    s.depth = 250;
    expect(atRest(s).ok).toBe(false);
  });
});
