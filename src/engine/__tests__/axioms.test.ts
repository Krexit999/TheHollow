/**
 * THE AXIOM ENGINE — RULE EDITING (§13), and the fourteen rules `laws.ts` has
 * been waiting for since Phase 10.
 *
 * The assertions that matter are structural, because the failure this replaces
 * was structural: a registry with live readers and no writer. So the tests
 * below check that every Axiom lands in a slot SOMETHING READS, that the world
 * actually behaves differently afterward, and that the ceiling does not move.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createEngine } from '../index';
import { D } from '../decimal';
import { AXIOMS, AXIOM_BY_ID } from '../content/axioms';
import { NUM_LAWS, lawFlag, lawNum, registerLawContribution } from '../laws';
import { dpsMax } from '../systems/face';
import { ModifierCache } from '../modifiers';
import {
  axiomEngineBuilt, axiomRead, canRedraft, offered, redraft, sittingLimit, showsTheChange,
  writeBlocker, writeRule,
} from '../systems/axiomEngine';
import type { GameState } from '../types';

function fresh(): GameState {
  return createEngine({ nowMs: 0 }).getState() as GameState;
}
const ctx = () => ({ emit: () => {}, dirty: () => {} }) as never;

/** An Engine at a given tier, with Axioms in the bank. */
function engineAt(tier: number, banked = 40): GameState {
  const s = fresh();
  (s.plant ??= { tiers: {}, builtOf: {} } as never);
  s.plant!.tiers['axiomEngine'] = tier;
  s.currencies['axiom'] = D(banked);
  return s;
}

/** Every source file the engine ships, for the live-reader sweep. */
function engineSources(): string[] {
  const root = join(process.cwd(), 'src');
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === '__tests__') continue;
        walk(p);
      } else if (/\.tsx?$/.test(e.name) && e.name !== 'laws.ts') {
        out.push(readFileSync(p, 'utf8'));
      }
    }
  };
  walk(root);
  return out;
}

describe('every Axiom writes a slot something actually reads', () => {
  it('...and the sweep is red-tested against a slot nothing reads', () => {
    const src = engineSources();
    const reads = (slot: string) =>
      src.some((f) => f.includes(`'${slot}'`) && (f.includes('lawNum(') || f.includes('lawFlag(')));
    for (const a of AXIOMS) {
      expect(reads(a.slot), `${a.id} → ${a.slot}`).toBe(true);
    }
    // RED TEST: `tapeSteps` is a real slot in `laws.ts` with no reader, and the
    // sweep must be able to say so — otherwise the check above is vacuous.
    expect(reads('tapeSteps')).toBe(false);
    expect(AXIOMS.some((a) => a.slot === 'tapeSteps')).toBe(false);
  });

  it('no two Axioms share an id, and every declared slot matches its payload', () => {
    expect(new Set(AXIOMS.map((a) => a.id)).size).toBe(AXIOMS.length);
    for (const a of AXIOMS) {
      const declared = [...Object.keys(a.num ?? {}), ...(a.flags ?? [])];
      expect(declared, a.id).toEqual([a.slot]);
    }
  });

  it('THE HERESY IS DELIBERATELY UNWRITTEN — no Axiom touches the regen ceiling', () => {
    expect(NUM_LAWS.regenCeilingMult.base).toBe(1);
    expect(AXIOMS.some((a) => a.slot === 'regenCeilingMult')).toBe(false);
    const s = fresh();
    s.recursion.axioms = AXIOMS.map((a) => a.id);
    expect(lawNum(s, 'regenCeilingMult')).toBe(1);
  });
});

describe('the registry has a writer at last', () => {
  it('a bare save reads every slot at its base — the pre-Axiom hot path', () => {
    const s = fresh();
    expect(s.recursion.axioms).toEqual([]);
    expect(lawNum(s, 'regenFloorShare')).toBe(0);
    expect(lawNum(s, 'drillStrokes')).toBe(1);
    expect(lawFlag(s, 'kilnReverse')).toBe(false);
  });

  it('a written rule reaches the slot, which is the thing that was broken', () => {
    const s = engineAt(1);
    expect(writeRule(s, ctx(), 'unemptying').ok).toBe(true);
    expect(lawNum(s, 'regenFloorShare')).toBe(0.2);
  });

  it('...and a written FLAG reaches its reader, so the world behaves differently', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.kiln.built = true;
    // Before: the Kiln refuses to run backwards, by name.
    const before = engine.dispatch({ type: 'setKilnReverse', on: true } as never);
    expect(before.ok).toBe(false);
    expect(String(before.reason)).toMatch(/only runs one way/);

    (s.plant ??= { tiers: {}, builtOf: {} } as never);
    s.plant!.tiers['axiomEngine'] = 1;
    s.currencies['axiom'] = D(10);
    expect(writeRule(s, ctx(), 'reverseKiln').ok).toBe(true);
    expect(lawFlag(s, 'kilnReverse')).toBe(true);
    expect(engine.dispatch({ type: 'setKilnReverse', on: true } as never).ok).toBe(true);
  });
});

describe('the menu is drawn from what this world has shown you', () => {
  it('a fresh Engine offers fewer rules than exist, and says how many are hidden', () => {
    const s = engineAt(1);
    const menu = offered(s);
    expect(menu.length).toBeGreaterThan(0);
    expect(menu.length).toBeLessThan(AXIOMS.length);
    expect(axiomRead(s).hidden).toBe(AXIOMS.length - menu.length);
  });

  it('running the system puts its rule on the menu', () => {
    const s = engineAt(1);
    expect(offered(s).some((a) => a.id === 'reverseKiln')).toBe(false);
    s.kiln.built = true;
    expect(offered(s).some((a) => a.id === 'reverseKiln')).toBe(true);
  });

  it('an unbuilt Engine offers nothing at all', () => {
    const s = fresh();
    expect(axiomEngineBuilt(s)).toBe(false);
    expect(offered(s)).toEqual([]);
    expect(writeBlocker(s, 'unemptying')).toMatch(/not standing/);
  });

  it('a rule about a system you have not met is refused by name', () => {
    const s = engineAt(1);
    expect(writeBlocker(s, 'reverseKiln')).toMatch(/has not shown you/);
  });
});

describe('tiers are five different sentences', () => {
  it('I writes one rule a Recursion; IV writes two; V is unbounded', () => {
    expect(sittingLimit(fresh())).toBe(0);
    expect(sittingLimit(engineAt(1))).toBe(1);
    expect(sittingLimit(engineAt(3))).toBe(1);
    expect(sittingLimit(engineAt(4))).toBe(2);
    expect(sittingLimit(engineAt(5))).toBe(Infinity);
  });

  it('a tier-I Engine refuses the second rule of a Recursion', () => {
    const s = engineAt(1);
    s.kiln.built = true;
    expect(writeRule(s, ctx(), 'unemptying').ok).toBe(true);
    expect(writeRule(s, ctx(), 'reverseKiln')).toMatchObject({ ok: false, reason: /One rule a Recursion/ });
  });

  it('...and a Recursion opens the sitting again', () => {
    const s = engineAt(1);
    s.kiln.built = true;
    expect(writeRule(s, ctx(), 'unemptying').ok).toBe(true);
    s.recursion.count += 1;                       // detected, not hooked
    expect(writeRule(s, ctx(), 'reverseKiln').ok).toBe(true);
  });

  it('II says what a rule will change before you commit; I does not', () => {
    expect(showsTheChange(engineAt(1))).toBe(false);
    expect(showsTheChange(engineAt(2))).toBe(true);
    expect(axiomRead(engineAt(1)).rows[0]!.preview).toBeNull();
    expect(axiomRead(engineAt(2)).rows[0]!.preview).toBe(AXIOM_BY_ID.get('unemptying')!.rule);
  });

  it('III takes one rule back and returns its Axioms; I cannot', () => {
    const low = engineAt(1);
    expect(writeRule(low, ctx(), 'unemptying').ok).toBe(true);
    expect(canRedraft(low)).toBe(false);
    expect(redraft(low, ctx(), 'unemptying')).toMatchObject({ ok: false, reason: /does not take a rule back/ });

    const s = engineAt(3, 5);
    expect(writeRule(s, ctx(), 'unemptying').ok).toBe(true);
    expect(s.currencies['axiom']!.toNumber()).toBe(4);
    expect(redraft(s, ctx(), 'unemptying').ok).toBe(true);
    expect(s.currencies['axiom']!.toNumber()).toBe(5);
    expect(lawNum(s, 'regenFloorShare')).toBe(0);
    // ...once.
    expect(writeRule(s, ctx(), 'unemptying').ok).toBe(true);
    expect(redraft(s, ctx(), 'unemptying')).toMatchObject({ ok: false, reason: /it is spent/ });
  });
});

describe('a rule costs Axioms and is permanent', () => {
  it('an empty bank refuses, and names the price', () => {
    const s = engineAt(1, 0);
    expect(writeBlocker(s, 'unemptying')).toMatch(/It costs 1 Axiom/);
  });

  it('writing spends exactly the cost, and a written rule cannot be written twice', () => {
    const s = engineAt(5, 10);
    expect(writeRule(s, ctx(), 'insomniacCamp').ok).toBe(false); // not shown: never been away
    s.stats.longestOfflineSec = 60;
    expect(writeRule(s, ctx(), 'insomniacCamp').ok).toBe(true);
    expect(s.currencies['axiom']!.toNumber()).toBe(7);
    expect(writeRule(s, ctx(), 'insomniacCamp')).toMatchObject({ ok: false, reason: /already true/ });
    expect(lawNum(s, 'offlineEffCap')).toBe(1);
  });

  it('the rules ride the Recursion, because §21 says the Rewrite is permanent', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    (s.plant ??= { tiers: {}, builtOf: {} } as never);
    s.plant!.tiers['axiomEngine'] = 1;
    s.currencies['axiom'] = D(10);
    expect(writeRule(s, ctx(), 'unemptying').ok).toBe(true);
    s.shell.current = 'aleph';
    s.aleph.coreTouched = true;
    expect(engine.dispatch({ type: 'recurse' }).ok).toBe(true);
    expect((engine.getState() as GameState).recursion.axioms).toContain('unemptying');
    expect(lawNum(engine.getState() as GameState, 'regenFloorShare')).toBe(0.2);
  });
});

describe('PILLAR 2 — every rule live, and the ceiling has not moved', () => {
  it('all fourteen written, dpsMax identical at the same depth', () => {
    const mods = new ModifierCache();
    const bare = fresh();
    bare.depth = 48;
    mods.invalidate();
    const before = dpsMax(bare, mods).toNumber();

    const s = fresh();
    s.depth = 48;                                  // THE SAME DEPTH BOTH ARMS
    s.recursion.axioms = AXIOMS.map((a) => a.id);
    mods.invalidate();
    expect(dpsMax(s, mods).toNumber()).toBe(before);
    // Not vacuous: the laws really are in force.
    expect(lawNum(s, 'regenFloorShare')).toBe(0.2);
    expect(lawNum(s, 'drillStrokes')).toBe(2);
    expect(lawFlag(s, 'kilnReverse')).toBe(true);

    // RED TEST: the harness CAN see the ceiling move.
    s.upgrades['blade'] = 1;
    mods.invalidate();
    expect(dpsMax(s, mods).toNumber()).not.toBe(before);
  });

  it('and the one slot that WOULD move it is the one nobody wrote', () => {
    const mods = new ModifierCache();
    const s = fresh();
    s.depth = 48;
    s.recursion.axioms = AXIOMS.map((a) => a.id);
    mods.invalidate();
    const withAll = dpsMax(s, mods).toNumber();
    // Prove the slot is wired by hand-registering into it — which is what an
    // authored heresy would do — and watch the ceiling move.
    registerLawContribution('__heresy__', { num: { regenCeilingMult: 1.15 } });
    s.recursion.axioms = [...s.recursion.axioms, '__heresy__'];
    mods.invalidate();
    expect(dpsMax(s, mods).toNumber()).toBeGreaterThan(withAll);
  });
});
