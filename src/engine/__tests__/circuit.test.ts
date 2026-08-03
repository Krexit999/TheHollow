/**
 * THE CIRCUIT (E3, §7.3) — what the strip must be true of.
 *
 * The claim under test is not "the evaluator works". It is the one the brief
 * names: A READ THAT CANNOT CHANGE AN ACTION IS A READOUT, NOT A CIRCUIT. So
 * §3 below walks EVERY read in the vocabulary, puts the world into two states
 * Loam can actually produce, and asserts the machine ends up doing two
 * different things. A read that fails that is a decoration and should be cut,
 * not shipped.
 *
 * The rest:
 *   1  the gate is a condition done once (LAW 9), and it LATCHES
 *   2  the vocabulary is only what this shell can supply — the cut reads are
 *      absent rather than stubbed, and a machine you have not built offers
 *      nothing
 *   4  top-down, first match, one action per machine per read
 *   5  PILLAR 2 — a full strip on every machine cannot move `dpsMax`
 *   6  four rows, hard; a rewrite clears the counters it invalidates
 *   7  the Crusher never eats a PINNED stack (§25.5's reserve flag)
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { ModifierCache } from '../modifiers';
import { ensureContentLoaded } from '../content';
import { dpsMax, cellCap } from '../systems/face';
import { addMaterial } from '../systems/forge';
import { contentsOf } from '../systems/roll';
import { surgeCap } from '../systems/plant';
import { newDrill } from '../systems/drills';
import { ensureCompaction } from '../systems/compaction';
import {
  ACTS, MAX_ROWS, READS, availableActs, availableMachines, availableReads,
  circuitGateOpen, circuitUnlocked, ensureCircuit, moveRow, setRow, stationHere,
  tickCircuit, winningRow, type CircuitRow, type MachineId,
} from '../systems/circuit';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx: EngineCtx = { emit() {}, dirty() {} } as unknown as EngineCtx;
let s: GameState;
let mods: ModifierCache;

/** A player who has earned the Circuit: a Kiln, and one drill routed by hand. */
function opened(): GameState {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  st.kiln.built = true;
  st.drills.bayBuilt = true;
  st.drills.units = [newDrill('One'), newDrill('Two')];
  st.drills.units[0]!.behavior = 'sweep';
  ensureCircuit(st).opened = true;
  return st;
}

/** Write a strip directly. The dispatch path is exercised separately (§6). */
function strip(st: GameState, machine: MachineId, rows: CircuitRow[]): void {
  ensureCircuit(st).strips[machine] = rows;
  ensureCircuit(st).fires[machine] = [];
  ensureCircuit(st).last[machine] = -1;
}

/** One full evaluation. The period is 1s, so 2 is unambiguously one read. */
function run(st: GameState): void {
  tickCircuit(st, mods, ctx, 2);
}

beforeEach(() => {
  s = opened();
  mods = new ModifierCache();
  mods.invalidate();
});

describe('the fixture is real', () => {
  it('the three machines carry strips, and every act belongs to one of them', () => {
    s.plant!.tiers['crusher'] = 1;
    expect(availableMachines(s).sort()).toEqual(['bay', 'crusher', 'kiln']);
    for (const a of ACTS) expect(['kiln', 'bay', 'crusher']).toContain(a.machine);
  });

  it('...and the reads it offers are the ones this shell supplies', () => {
    expect(availableReads(s).map((r) => r.id).sort()).toEqual(
      ['charge', 'compaction', 'depth', 'hazard', 'heat', 'seam', 'station', 'surge'],
    );
  });

  it('the station a read is taken at is one you have WALKED PAST, never ahead', () => {
    s.depth = 30;
    // The Undersill sits at 28; The Long Cut at 47. A read must not see 47.
    expect(stationHere(s)?.name).toBe('The Undersill');
    s.depth = 0;
    expect(stationHere(s)?.name).toBe('The Turnrow');
  });
});

describe('1 — the gate is a condition done once (LAW 9)', () => {
  it('a fresh player has no Circuit', () => {
    const fresh = createEngine({ nowMs: 0 }).getState() as GameState;
    expect(circuitGateOpen(fresh)).toBe(false);
    expect(circuitUnlocked(fresh)).toBe(false);
  });

  it('a Kiln alone is not enough — you must have ROUTED something by hand', () => {
    const st = createEngine({ nowMs: 0 }).getState() as GameState;
    st.kiln.built = true;
    st.drills.units = [newDrill('One')];
    expect(circuitGateOpen(st)).toBe(false);
    st.drills.units[0]!.priority = 'rock';
    expect(circuitGateOpen(st)).toBe(true);
  });

  it('and it LATCHES: putting the drill back does not take the Circuit away', () => {
    const st = createEngine({ nowMs: 0 }).getState() as GameState;
    st.kiln.built = true;
    st.drills.units = [newDrill('One')];
    st.drills.units[0]!.behavior = 'chain';
    run(st);
    expect(ensureCircuit(st).opened).toBe(true);
    delete st.drills.units[0]!.behavior;
    expect(circuitGateOpen(st)).toBe(false);
    expect(circuitUnlocked(st)).toBe(true);
  });
});

describe('2 — the vocabulary is only what exists', () => {
  /**
   * THE CUT READS. §7.3 sketches four lines and three of them name systems this
   * build does not have. They are absent, not stubbed — a name against no
   * mechanism is the deceptive stub PILLARS warns about, and this test is what
   * stops one being added back quietly.
   */
  it('grain, abrasive, pressure and the output band are NOT in the vocabulary', () => {
    const ids = READS.map((r) => r.id);
    for (const dead of ['grain', 'abrasive', 'pressure', 'output', 'filter']) {
      expect(ids, `${dead} has no source in this build`).not.toContain(dead);
    }
  });

  it('a shell with no authored Roll offers no world reads', () => {
    // Ferrite has an authored Roll as of A.87, so the shell that proves the
    // rule has to be one that genuinely does not.
    s.shell.current = 'verdance';
    const ids = availableReads(s).map((r) => r.id);
    expect(ids).not.toContain('seam');
    expect(ids).not.toContain('station');
    expect(ids).not.toContain('hazard');
    // The face is still a face.
    expect(ids).toContain('compaction');
  });

  it('a machine you have not built contributes no actions', () => {
    expect(availableActs(s, 'crusher')).toHaveLength(0);
    s.plant!.tiers['crusher'] = 1;
    expect(availableActs(s, 'crusher').map((a) => a.id).sort()).toEqual(['bank', 'run']);
  });

  it('and a bay with no drills offers none either', () => {
    const bare = opened();
    bare.drills.units = [];
    expect(availableActs(bare, 'bay')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3 — THE LOAD-BEARING ONE
// ---------------------------------------------------------------------------

/**
 * For each read: a world where the row is TRUE and one where it is FALSE, both
 * reachable in Loam, and a strip whose two rows disagree about the damper. If
 * the kiln does not end up in two different states, the read changed nothing
 * and is a readout.
 *
 * The fallback row is `depth > -1`, which no editor can write (values clamp to
 * 0) and which is the point: it is a row that ALWAYS matches, so the only thing
 * that can decide the outcome is whether the row above it did.
 */
const ALWAYS: CircuitRow = { read: 'depth', op: 'gt', value: -1, act: 'feed' };

const CASES: { read: string; row: CircuitRow; on: (st: GameState, m: ModifierCache) => void; off: (st: GameState, m: ModifierCache) => void }[] = [
  {
    read: 'seam',
    row: { read: 'seam', op: 'is', value: 'marl', act: 'damp' },
    on: (st) => { st.depth = 0; contentsOf(st, 'turnrow').seam = 'marl'; },
    off: (st) => { st.depth = 0; contentsOf(st, 'turnrow').seam = 'ochre'; },
  },
  {
    read: 'station',
    row: { read: 'station', op: 'is', value: 'hazard', act: 'damp' },
    on: (st) => { st.depth = 72; },   // The Ashfall
    off: (st) => { st.depth = 0; },   // The Turnrow, a seam
  },
  {
    read: 'hazard',
    row: { read: 'hazard', op: 'gt', value: 1, act: 'damp' },
    on: (st) => { st.depth = 72; contentsOf(st, 'ashfall').hazard = 3; },
    off: (st) => { st.depth = 72; contentsOf(st, 'ashfall').hazard = 1; },
  },
  {
    read: 'depth',
    // The always-row here reads something else, so `depth` is the only variable.
    row: { read: 'depth', op: 'gt', value: 50, act: 'damp' },
    on: (st) => { st.depth = 100; },
    off: (st) => { st.depth = 10; },
  },
  {
    read: 'compaction',
    row: { read: 'compaction', op: 'gt', value: 14, act: 'damp' },
    on: (st) => { ensureCompaction(st); st.face.compaction![0] = 20; },
    off: (st) => { ensureCompaction(st); st.face.compaction!.fill(0); },
  },
  {
    read: 'charge',
    row: { read: 'charge', op: 'gt', value: 50, act: 'damp' },
    on: (st, m) => { st.face.cells.fill(cellCap(st, m)); },
    off: (st) => { st.face.cells.fill(0); },
  },
  {
    read: 'heat',
    row: { read: 'heat', op: 'gt', value: 50, act: 'damp' },
    on: (st) => { st.kiln.heat = 1; },
    off: (st) => { st.kiln.heat = 0; },
  },
  {
    read: 'surge',
    row: { read: 'surge', op: 'gt', value: 50, act: 'damp' },
    on: (st) => { st.plant!.surge = surgeCap(st); },
    off: (st) => { st.plant!.surge = 0; },
  },
];

describe('3 — every read can change an action', () => {
  it('the case table covers the whole vocabulary', () => {
    expect(CASES.map((c) => c.read).sort()).toEqual(READS.map((r) => r.id).sort());
  });

  for (const c of CASES) {
    it(`${c.read}: the same strip throws the damper two different ways`, () => {
      const fallback: CircuitRow = c.read === 'depth'
        ? { read: 'compaction', op: 'gt', value: -1, act: 'feed' }
        : ALWAYS;

      const on = opened();
      strip(on, 'kiln', [c.row, fallback]);
      c.on(on, mods);
      on.kiln.feeding = true;
      run(on);

      const off = opened();
      strip(off, 'kiln', [c.row, fallback]);
      c.off(off, mods);
      off.kiln.feeding = false;
      run(off);

      expect(winningRow(on, mods, 'kiln'), `${c.read}: the row did not win when true`).toBe(0);
      expect(winningRow(off, mods, 'kiln'), `${c.read}: the row won when it was false`).toBe(1);
      expect(on.kiln.feeding, `${c.read}: the damper stayed open`).toBe(false);
      expect(off.kiln.feeding, `${c.read}: the damper stayed shut`).toBe(true);
    });
  }
});

describe('4 — top-down, first match', () => {
  it('a row above a matching row wins, and swapping them swaps the outcome', () => {
    s.depth = 72;
    contentsOf(s, 'ashfall').hazard = 3;
    const hazardRow: CircuitRow = { read: 'hazard', op: 'gt', value: 1, act: 'damp' };
    strip(s, 'kiln', [hazardRow, ALWAYS]);
    s.kiln.feeding = true;
    run(s);
    expect(s.kiln.feeding).toBe(false);

    strip(s, 'kiln', [ALWAYS, hazardRow]);
    run(s);
    expect(s.kiln.feeding).toBe(true);
  });

  it('a strip with nothing true does nothing at all', () => {
    s.depth = 0;
    strip(s, 'kiln', [{ read: 'depth', op: 'gt', value: 140, act: 'damp' }]);
    s.kiln.feeding = true;
    run(s);
    expect(winningRow(s, mods, 'kiln')).toBe(-1);
    expect(s.kiln.feeding).toBe(true);
    expect(ensureCircuit(s).acts['kiln'] ?? 0).toBe(0);
  });

  it('a row that wins but changes nothing is a FIRE and not an ACT', () => {
    strip(s, 'kiln', [ALWAYS]);
    s.kiln.feeding = true;   // `feed` already holds
    run(s);
    run(s);
    expect(ensureCircuit(s).fires['kiln']![0]).toBe(2);
    expect(ensureCircuit(s).acts['kiln'] ?? 0).toBe(0);
  });

  it('and the strip counts how often it changes its mind', () => {
    strip(s, 'kiln', [{ read: 'depth', op: 'gt', value: 50, act: 'damp' }, ALWAYS]);
    for (const d of [100, 10, 100, 10]) { s.depth = d; run(s); }
    expect(ensureCircuit(s).flips['kiln']).toBe(3);
  });
});

describe('5 — PILLAR 2: the Circuit routes and reacts, it does not produce', () => {
  it('dpsMax is identical at the SAME depth with a full strip live and none', () => {
    const read = (withStrip: boolean): number => {
      const st = opened();
      st.depth = 28;
      st.plant!.tiers['crusher'] = 1;
      addMaterial(st, 'marl', 50, 40);
      if (withStrip) {
        strip(st, 'kiln', [
          { read: 'heat', op: 'lt', value: 50, act: 'feed' },
          { read: 'seam', op: 'is', value: 'marl', act: 'fuel:marl' },
          { read: 'compaction', op: 'gt', value: 10, act: 'damp' },
          { read: 'depth', op: 'gt', value: 5, act: 'fuel:ash' },
        ]);
        strip(st, 'bay', [
          { read: 'compaction', op: 'gt', value: 5, act: 'behaviour:sweep' },
          { read: 'charge', op: 'lt', value: 90, act: 'priority:ores' },
          { read: 'depth', op: 'gt', value: 1, act: 'behaviour:chain' },
          { read: 'station', op: 'is', value: 'seam', act: 'priority:rock' },
        ]);
        strip(st, 'crusher', [
          { read: 'surge', op: 'gt', value: 10, act: 'run' },
          { read: 'depth', op: 'gt', value: 1, act: 'bank' },
        ]);
      }
      const m = new ModifierCache();
      m.invalidate();
      for (let i = 0; i < 30; i++) tickCircuit(st, m, ctx, 2);
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    expect(read(true)).toBe(read(false));
  });

  it('and the strip really did run — the assertion above is not vacuous', () => {
    s.depth = 28;
    s.kiln.feeding = false;
    strip(s, 'kiln', [{ read: 'depth', op: 'gt', value: 5, act: 'feed' }]);
    run(s);
    expect(s.kiln.feeding).toBe(true);
    expect(ensureCircuit(s).acts['kiln']).toBe(1);
  });
});

describe('6 — writing a strip', () => {
  it('four rows, hard', () => {
    const row: CircuitRow = { read: 'depth', op: 'gt', value: 10, act: 'feed' };
    for (let i = 0; i < MAX_ROWS; i++) {
      expect(setRow(s, 'kiln', i, row).ok, `row ${i}`).toBe(true);
    }
    expect(setRow(s, 'kiln', MAX_ROWS, row).ok).toBe(false);
    expect(ensureCircuit(s).strips['kiln']).toHaveLength(MAX_ROWS);
  });

  it('refuses a read this shell cannot supply, and an act the machine cannot do', () => {
    expect(setRow(s, 'kiln', 0, { read: 'grain', op: 'is', value: 'across', act: 'feed' }).ok).toBe(false);
    expect(setRow(s, 'kiln', 0, { read: 'depth', op: 'gt', value: 1, act: 'behaviour:sweep' }).ok).toBe(false);
    expect(setRow(s, 'kiln', 0, { read: 'depth', op: 'gt', value: 1, act: 'run' }).ok).toBe(false);
  });

  it('clamps a threshold into the read\'s own range', () => {
    setRow(s, 'kiln', 0, { read: 'compaction', op: 'gt', value: 900, act: 'feed' });
    expect(ensureCircuit(s).strips['kiln']![0]!.value).toBe(26);
    setRow(s, 'kiln', 0, { read: 'compaction', op: 'gt', value: -9, act: 'feed' });
    expect(ensureCircuit(s).strips['kiln']![0]!.value).toBe(0);
  });

  it('and a rewrite drops the counts collected under the old rules', () => {
    strip(s, 'kiln', [ALWAYS]);
    run(s); run(s);
    expect(ensureCircuit(s).fires['kiln']![0]).toBe(2);
    setRow(s, 'kiln', 0, { read: 'depth', op: 'gt', value: 1, act: 'damp' });
    expect(ensureCircuit(s).fires['kiln']).toEqual([]);
  });

  it('moving a row reorders the strip, which is the only priority there is', () => {
    setRow(s, 'kiln', 0, { read: 'depth', op: 'gt', value: 1, act: 'feed' });
    setRow(s, 'kiln', 1, { read: 'depth', op: 'gt', value: 2, act: 'damp' });
    moveRow(s, 'kiln', 1, 0);
    expect(ensureCircuit(s).strips['kiln']!.map((r) => r.act)).toEqual(['damp', 'feed']);
  });
});

describe('7 — the Crusher never eats what you were saving', () => {
  it('a PINNED stack is invisible to the circuit, an unpinned one is not', () => {
    s.plant!.tiers['crusher'] = 1;
    s.plant!.surge = surgeCap(s);
    addMaterial(s, 'marl', 50, 8);
    s.qol.pins = ['marl'];
    strip(s, 'crusher', [{ read: 'depth', op: 'gt', value: -1, act: 'run' }]);
    run(s);
    expect(s.materials.stacks['marl']!['fair']!.count).toBe(8);

    s.qol.pins = [];
    s.plant!.surge = surgeCap(s);
    run(s);
    expect(s.materials.stacks['marl']!['fair']!.count).toBe(4);
  });

  it('and BANK really is a full stop: the row wins and spends nothing', () => {
    s.plant!.tiers['crusher'] = 1;
    s.plant!.surge = surgeCap(s);
    addMaterial(s, 'marl', 50, 8);
    strip(s, 'crusher', [
      { read: 'depth', op: 'gt', value: -1, act: 'bank' },
      { read: 'depth', op: 'gt', value: -1, act: 'run' },
    ]);
    run(s);
    expect(winningRow(s, mods, 'crusher')).toBe(0);
    expect(s.materials.stacks['marl']!['fair']!.count).toBe(8);
    expect(s.plant!.surge).toBe(surgeCap(s));
  });
});
