/**
 * Phase 9 — CINDER. The four laws of the failure state are TESTS here, not
 * intentions: idle can never flood, floods pay nothing and take nothing
 * permanent, the countdown is escapable, and the casualty is deterministic.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { Engine, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import { D } from '../decimal';
import { getCurrency } from '../resources';
import {
  emergencyPurge, floodRun, holdLine, layPipe, networkCapacity,
  setChoke, ventRate, yieldMult, VENT_SHAFT_CELL, VENT_W,
} from '../systems/pressure';
import { runMigrations, SAVE_VERSION } from '../save/migrations';
import { serialize } from '../save/codec';

const ctx = { emit: () => {}, dirty: () => {} };

function fresh(): { engine: Engine; s: GameState; mods: ModifierCache } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState, mods: new ModifierCache() };
}

/**
 * Ride the klaxon for one real second, choked. The engine integrates in fixed
 * 100ms substeps (SIM_STEP, index.ts), and each substep bleeds a little heat
 * (choked vent still exceeds bare ambient sources now that the Ember Array's
 * overdrive — the other heat source real "furious riding" used to add — is
 * gone). Re-priming heat above the ceiling before every substep is what a
 * player's continuous manual stoking would do in real play; a single
 * per-second nudge only survives the first substep and decays for the other
 * nine.
 */
function rideChokeSeconds(engine: Engine, s: GameState, seconds: number): void {
  for (let sec = 0; sec < seconds; sec++) {
    s.pressure.choke = true;
    s.pressure.lastStokeSec = s.stats.playTimeSec;
    for (let sub = 0; sub < 10; sub++) {
      s.pressure.heat = 150;
      engine.tick(0.1);
    }
  }
}

function cindery(): { engine: Engine; s: GameState; mods: ModifierCache } {
  const { engine, s, mods } = fresh();
  s.shell.current = 'cinder';
  s.shell.breachCount = 4;
  s.collapse.count = 1;
  s.depth = 60;
  s.depthRecords['cinder'] = 60;
  return { engine, s, mods };
}

describe('pressure: the four laws', () => {
  /**
   * A real 16-hour simulation (576k fixed steps) — allow the wall-clock room.
   * RAISED 20s → 60s at A.101: it took 31.9s under full-suite parallelism and
   * 4.6s alone, so the old budget was sized on a quiet machine and failed on a
   * busy one. A test that depends on how busy the machine is has a harness bug,
   * not a flaky subject — the same call A.100 made for the drill-hour test.
   */
  it('LAW 2 — an idle shaft NEVER floods: 16h untouched holds at the line', () => {
    const { engine, s } = cindery();
    s.depth = 300; // deep = hottest ambient; the worst case is the tested case
    s.pressure.heat = 60;
    engine.dispatch({ type: 'debug', op: 'warp', seconds: 16 * 3600 });
    expect(s.pressure.floods).toBe(0);
    expect(s.pressure.overpressures).toBe(0);
    expect(s.pressure.heat).toBeLessThanOrEqual(holdLine(s) + 1);
    // And the line itself is structurally below the flood line.
    expect(holdLine(s)).toBeLessThanOrEqual(75);
  }, 60_000);

  it("THE GOVERNOR — ordinary mining, however furious, can't flood: only the choke can", () => {
    const { engine, s } = cindery();
    // Chip relentlessly with the vents open: heat must wall at the governor.
    for (let i = 0; i < 240; i++) {
      s.pressure.lastStokeSec = s.stats.playTimeSec; // hands never leave the face
      s.pressure.heat = Math.min(100, s.pressure.heat + 1.2); // furious stoking...
      engine.tick(1); // ...but the relief valve is OPEN
    }
    expect(s.pressure.heat).toBeLessThanOrEqual(90);
    expect(s.pressure.overpressures).toBe(0);
    expect(s.pressure.floods).toBe(0);
    // And releasing the choke mid-klaxon is always a real escape. (The
    // klaxon has a 2s fuse — grazing 100 does not cry wolf; HOLDING it does.)
    rideChokeSeconds(engine, s, 4);
    expect(s.pressure.overpressures).toBe(1);
    // The escape releases the choke — the relief valve opens the moment you let go.
    s.pressure.choke = false;
    for (let i = 0; i < 10; i++) {
      s.pressure.lastStokeSec = s.stats.playTimeSec;
      engine.tick(1);
    }
    expect(s.pressure.heat).toBeLessThan(95); // shed under the clear line
    engine.tick(1);
    expect(s.pressure.overpressureAtSec).toBe(null);
    expect(s.pressure.floods).toBe(0);
  });

  it('LAW 4 — the tension is voluntary: choking is a choice that undoes itself when you leave', () => {
    const { engine, s } = cindery();
    expect(setChoke(s, true).ok).toBe(true);
    expect(ventRate(s)).toBeLessThan(0.3); // choked vents barely breathe
    // Stoke it hot, then walk away.
    s.pressure.heat = 85;
    s.pressure.lastStokeSec = s.stats.playTimeSec;
    engine.dispatch({ type: 'debug', op: 'warp', seconds: 300 });
    expect(s.pressure.choke).toBe(false); // the crew un-choked it
    expect(s.pressure.heat).toBeLessThanOrEqual(holdLine(s) + 1); // and it cooled
    expect(s.pressure.floods).toBe(0);
  });

  it('LAW 3 — overpressure is a 45s named countdown, and the purge always works', () => {
    const { engine, s } = cindery();
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'slag', amount: 10000 });
    // Ride the klaxon for 30s (choked vents held against — holding 100 takes
    // REAL stoking, which is the point), then out.
    rideChokeSeconds(engine, s, 30);
    expect(s.pressure.overpressures).toBe(1);
    expect(s.pressure.floods).toBe(0);
    const slagBefore = getCurrency(s, 'slag');
    expect(emergencyPurge(s, ctx as never).ok).toBe(true);
    expect(s.pressure.heat).toBeLessThanOrEqual(40);
    expect(getCurrency(s, 'slag').lt(slagBefore)).toBe(true); // a quarter, paid
    engine.tick(1);
    expect(s.pressure.overpressureAtSec).toBe(null); // cleared
  });

  it('a ridden countdown completes: the flood is real', () => {
    const { engine, s } = cindery();
    for (let i = 0; i < 50 && s.pressure.floods === 0; i++) rideChokeSeconds(engine, s, 1);
    expect(s.pressure.floods).toBe(1);
    expect(s.depth).toBe(0);
  });

  it('LAW 1 — a flood is a Collapse that pays NOTHING and takes nothing permanent', () => {
    const { s, mods } = cindery();
    s.depth = 200;
    s.currencies['slag'] = D(50000);
    s.materials.stacks['emberplate'] = { good: { count: 9, puritySum: 540 } };
    s.materials.gems['cinderquartz'] = 2;
    const coresBefore = getCurrency(s, 'core').toString();
    const collapses = s.collapse.count;
    floodRun(s, mods, ctx as never);
    expect(s.depth).toBe(0);
    expect(getCurrency(s, 'slag').eq(0)).toBe(true); // the run's purse, gone
    expect(getCurrency(s, 'core').toString()).toBe(coresBefore); // NO payout
    expect(s.collapse.count).toBe(collapses); // not a collapse on the ladder
    expect(s.depthRecords['cinder']).toBe(60); // records survive
    expect(s.materials.stacks['emberplate']!['good']!.count).toBe(9); // materials survive
    expect(s.materials.gems['cinderquartz']).toBe(2);
  });

  it('carried down, heat matters but cannot flood', () => {
    const { engine, s } = fresh();
    s.shell.current = 'glassmere';
    s.shell.breachCount = 5;
    s.shell.signatures = ['pressure'];
    s.depthRecords['glassmere'] = 60;
    s.pressure.heat = 100;
    engine.tick(3);
    expect(s.pressure.overpressureAtSec).toBe(null); // no countdown off-shell
    expect(s.pressure.floods).toBe(0);
    expect(yieldMult(s, 0.4)).toBeGreaterThan(1); // but the heat still pays
  });

  it('the vent network buys headroom: routed pipe raises capacity and the hold-line', () => {
    const { engine, s } = cindery();
    void engine;
    expect(networkCapacity(s)).toBe(0);
    const baseLine = holdLine(s);
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'obsidian', amount: 100000 });
    // A straight run from the shaft mouth to the right-edge outlet.
    for (let c = 0; c < VENT_W; c++) {
      expect(layPipe(s, VENT_SHAFT_CELL + c).ok).toBe(true);
    }
    expect(networkCapacity(s)).toBeGreaterThan(0.25);
    expect(holdLine(s)).toBeGreaterThan(baseLine);
    // Pulling pipe back up is free — re-routing is the whole game here.
    expect(layPipe(s, VENT_SHAFT_CELL + 3).ok).toBe(true);
    expect(networkCapacity(s)).toBe(0); // the line is cut
  });
});

describe('save v9', () => {
  it('migrates v8 saves with the burnt shell asleep', () => {
    const { s } = fresh();
    const raw = JSON.parse(serialize(s, 0)) as { state: Record<string, unknown> };
    delete raw.state['pressure'];
    const migrated = runMigrations({ version: 8, savedAt: 0, state: raw.state } as never);
    expect(migrated.version).toBe(SAVE_VERSION);
    const st = migrated.state as Record<string, Record<string, unknown>>;
    expect(st['pressure']!['heat']).toBe(0);
    expect((st['pressure']!['pipes'] as number[]).length).toBe(35);
  });
});
