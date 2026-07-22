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
  emergencyPurge, floodCasualty, floodRun, holdLine, layPipe, networkCapacity,
  setChoke, ventRate, yieldMult, VENT_SHAFT_CELL, VENT_W,
} from '../systems/pressure';
import { ARRAY_SIZE, BAND_LOW, buyFuel, lightCell, placeFuel, setDraw, setOverdrive, DRAW_FLOOR } from '../content/shell5/emberArray';
import { WELL_ODDS, WELLS, collectWell, commitToWell, wellProgress } from '../content/shell5/wells';
import { ANOMALIES, answerAnomaly, tickAnomalies } from '../systems/anomalies';
import { AUTO_SKILL, resolveFight } from '../combat/combat';
import { rollSpecies, speciesOfShell, wardenOf } from '../combat/species';
import { runMigrations, SAVE_VERSION } from '../save/migrations';
import { serialize } from '../save/codec';

const ctx = { emit: () => {}, dirty: () => {} };

function fresh(): { engine: Engine; s: GameState; mods: ModifierCache } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState, mods: new ModifierCache() };
}

function cindery(): { engine: Engine; s: GameState; mods: ModifierCache } {
  const { engine, s, mods } = fresh();
  s.shell.current = 'cinder';
  s.shell.breachCount = 4;
  s.guild.discovered = true;
  s.collapse.count = 1;
  s.depth = 60;
  s.depthRecords['cinder'] = 60;
  return { engine, s, mods };
}

describe('pressure: the four laws', () => {
  // A real 16-hour simulation (576k fixed steps) — allow the wall-clock room.
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
  }, 20000);

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
    for (let i = 0; i < 4; i++) {
      s.pressure.choke = true;
      s.ember.overdrive = true; // sources must actually outpace the choked vent
      s.pressure.heat = 100;
      s.pressure.lastStokeSec = s.stats.playTimeSec;
      engine.tick(1);
    }
    expect(s.pressure.overpressures).toBe(1);
    // The escape releases BOTH opt-ins — choke and overdrive each hold the
    // relief valve open on their own; that is what "opt-in" means here.
    s.pressure.choke = false;
    s.ember.overdrive = false;
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
    // Ride the klaxon for 30s (choked vents + a roaring Array outpace the
    // Damper — holding 100 takes REAL stoking, which is the point), then out.
    for (let i = 0; i < 30; i++) {
      s.pressure.heat = 100;
      s.pressure.choke = true;
      s.ember.overdrive = true;
      s.pressure.lastStokeSec = s.stats.playTimeSec;
      engine.tick(1);
    }
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
    for (let i = 0; i < 50 && s.pressure.floods === 0; i++) {
      s.pressure.heat = 100;
      s.pressure.choke = true;
      s.ember.overdrive = true;
      s.pressure.lastStokeSec = s.stats.playTimeSec;
      engine.tick(1);
    }
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

  it('the casualty is deterministic: longest-serving, named in advance, spared by recall', () => {
    const { s, mods } = cindery();
    s.guild.hirelings['pell'] = { level: 2, xp: 500, status: 'well', hiredAtMs: 0 };
    s.guild.hirelings['sef'] = { level: 1, xp: 200, status: 'well', hiredAtMs: 9999 };
    expect(floodCasualty(s)).toBe('pell'); // the eldest hand, knowable BEFORE
    s.guild.crewRecalled = true;
    expect(floodCasualty(s)).toBe(null); // recall always saves everyone
    s.guild.crewRecalled = false;
    floodRun(s, mods, ctx as never);
    expect(s.guild.hirelings['pell']!.status).toBe('fallen');
    expect(s.guild.hirelings['sef']!.status).toBe('well'); // exactly one
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

describe('the ember array: a fuse you design and then ride', () => {
  it('fuel burns, spreads to neighbors as it dies, and the best sustain never cools', () => {
    const { engine, s } = cindery();
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'ember', amount: 10000 });
    expect(buyFuel(s, 'emberbillet', 4).ok).toBe(true);
    expect(placeFuel(s, 14, 'emberbillet').ok).toBe(true);
    expect(placeFuel(s, 15, 'emberbillet').ok).toBe(true);
    expect(placeFuel(s, 16, 'emberbillet').ok).toBe(true);
    expect(lightCell(s, 14).ok).toBe(true);
    expect(lightCell(s, 15).ok).toBe(true);
    engine.dispatch({ type: 'debug', op: 'warp', seconds: 55 });
    expect(s.ember.temp).toBeGreaterThan(BAND_LOW - 10);
    expect(s.ember.bestSustainSec).toBeGreaterThan(5);
    // The dying billets lit their neighbor.
    expect(s.ember.burn[16]).toBeGreaterThan(0);
    const best = s.ember.bestSustainSec;
    engine.dispatch({ type: 'debug', op: 'warp', seconds: 400 }); // everything burns out
    expect(s.ember.temp).toBeLessThan(BAND_LOW);
    expect(s.ember.sustainSec).toBe(0);
    expect(s.ember.bestSustainSec).toBeGreaterThanOrEqual(best); // the record holds
    expect(s.ember.grid.every((g, i) => g === null || s.ember.burn[i]! > 0)).toBe(true);
  });

  it('engaged ≈ 2× passive by construction: the two bonus halves are equal at their caps', () => {
    // Passive cap: 20 ranks × 0.008 = +0.16. A 30-minute best burn:
    // 0.04 × log2(1 + 1800/120) = 0.04 × 4 = +0.16. Equal halves — engaged
    // (both) is exactly twice passive (rank only). The charter, arithmetic.
    expect(20 * 0.008).toBeCloseTo(0.16);
    expect(0.04 * Math.log2(1 + 1800 / 120)).toBeCloseTo(0.16, 2);
  });

  it('the array is a valid grid citizen', () => {
    const { s } = cindery();
    expect(s.ember.grid).toHaveLength(ARRAY_SIZE * ARRAY_SIZE);
    expect(placeFuel(s, 99, 'emberbillet').ok).toBe(false);
    expect(placeFuel(s, 0, 'nosuch').ok).toBe(false);
  });
});

describe('magma wells: published odds, capped commits, results that wait', () => {
  it('the table is honest and prints as written', () => {
    const pSum = WELL_ODDS.reduce((a, l) => a + l.p, 0);
    const ev = WELL_ODDS.reduce((a, l) => a + l.p * l.mult, 0);
    expect(pSum).toBeCloseTo(1.0);
    expect(ev).toBeGreaterThan(1.0); // honestly positive for the variance...
    expect(ev).toBeLessThan(1.3); // ...never an engine
  });

  it('commits cap at a tenth, wells resolve on the game clock, results wait forever', () => {
    const { engine, s } = cindery();
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'slag', amount: 10000 });
    expect(commitToWell(s, 'nearWell', D(2000)).ok).toBe(false); // over the cap
    expect(commitToWell(s, 'nearWell', D(100)).ok).toBe(false); // under the minimum
    expect(commitToWell(s, 'nearWell', D(900)).ok).toBe(true);
    expect(commitToWell(s, 'nearWell', D(300)).ok).toBe(false); // one rope per well
    expect(collectWell(s, ctx as never, 'nearWell').ok).toBe(false); // not yet
    engine.dispatch({ type: 'debug', op: 'warp', seconds: 25 * 60 });
    expect(wellProgress(s, 'nearWell')).toBe(1);
    engine.dispatch({ type: 'debug', op: 'warp', seconds: 3600 }); // it WAITS
    const before = getCurrency(s, 'slag').toNumber();
    const r = collectWell(s, ctx as never, 'nearWell');
    expect(r.ok).toBe(true);
    const mult = (r.data as { mult: number }).mult;
    expect([0, 3, 8, 40]).toContain(mult);
    expect(getCurrency(s, 'slag').toNumber()).toBeCloseTo(before + 900 * mult, 0);
    expect(s.wells.rolls).toBe(1);
  });

  it('three wells exist and all are Cinder currencies', () => {
    expect(WELLS).toHaveLength(3);
    expect(new Set(WELLS.map((w) => w.currencyId)).size).toBe(3);
  });
});

describe('anomalies: rare, optional, never a loss', () => {
  it('the teaching hours stay clean; afterwards they spawn, answer, and settle harmlessly', () => {
    const { engine, s } = fresh();
    engine.dispatch({ type: 'debug', op: 'warp', seconds: 3 * 3600 });
    expect(s.anomalies.seen).toBe(0); // pre-breach: nothing strange, ever
    s.shell.breachCount = 1;
    tickAnomalies(s, new ModifierCache(), ctx as never); // schedules
    expect(s.anomalies.nextAtPlaySec).toBeGreaterThan(s.stats.playTimeSec + 9000 - 1);
    s.anomalies.nextAtPlaySec = s.stats.playTimeSec + 1;
    engine.tick(3);
    expect(s.anomalies.active).not.toBe(null);
    expect(s.anomalies.seen).toBe(1);
    // Ignoring it costs NOTHING: it settles, still counted, nothing applied.
    s.anomalies.active!.startedAtPlaySec = s.stats.playTimeSec - 1801;
    engine.tick(2);
    expect(s.anomalies.active).toBe(null);
    expect(s.anomalies.resolved).toBe(0); // settled ≠ answered — no effect ran
    // Answering one pays.
    s.anomalies.active = { id: 'echoPocket', startedAtPlaySec: s.stats.playTimeSec };
    const motifs = getCurrency(s, 'motif').toNumber();
    const mods = new ModifierCache();
    expect(answerAnomaly(s, mods, ctx as never).ok).toBe(true);
    expect(getCurrency(s, 'motif').toNumber()).toBe(motifs + 12);
    expect(s.anomalies.resolved).toBe(1);
  });

  it('every anomaly is answerable without a crash, in its own shell', () => {
    for (const def of ANOMALIES) {
      const { s } = cindery();
      if (def.shellId && def.shellId !== 'cinder') {
        s.shell.current = def.shellId;
        s.depthRecords[def.shellId] = 60;
      }
      s.depth = 50;
      const mods = new ModifierCache();
      s.anomalies.active = { id: def.id, startedAtPlaySec: 0 };
      expect(answerAnomaly(s, mods, ctx as never).ok).toBe(true);
    }
  });
});

describe('the cinder bestiary: heat is the ecology', () => {
  it('fifteen species; the hot ones do not exist below their heat', () => {
    expect(speciesOfShell('cinder')).toHaveLength(15);
    for (let i = 0; i < 300; i++) {
      const sp = rollSpecies('cinder', 250, Math.random, 14, 0, 0);
      expect(sp && (sp.id === 'magmalurk' || sp.id === 'moltenchoir')).toBeFalsy();
    }
    let hotSeen = false;
    for (let i = 0; i < 300 && !hotSeen; i++) {
      const sp = rollSpecies('cinder', 250, Math.random, 14, 0, 80);
      if (sp?.id === 'magmalurk') hotSeen = true;
    }
    expect(hotSeen).toBe(true);
  });

  it('THE SMOLDER: your heat is her strength — the same kit wins cool and loses greedy', () => {
    const { s, mods } = cindery();
    const warden = wardenOf('cinder')!;
    expect(warden.wrathful).toBe(true);
    s.forge.tools.push({
      id: 31, recipeId: 'cinderMaul', name: 'Cinder Maul', tier: 15,
      purity: 70, chipPower: 60, strikePower: 950, sockets: ['bloodgarnet', 'cinderquartz', null, null], alloys: [null, null],
    });
    s.forge.equipped = s.forge.tools.length - 1;
    s.forge.gear.offhand = { defId: 'slagward', purity: 60 };
    s.forge.gear.harness = { defId: 'emberweave', purity: 60 };
    s.delver.skills['twoHandedSwing'] = 5;
    s.delver.skills['deepGrip'] = 3;
    for (const id of ['firstKill', 'wardenLoam', 'kills25']) s.achievements.unlocked[id] = true;
    s.pressure.heat = 15; // restraint: vent before the stair
    mods.invalidate();
    expect(resolveFight(s, mods, warden, AUTO_SKILL).win).toBe(true);
    s.pressure.heat = 95; // greed: she burns exactly as hot as you do
    mods.invalidate();
    expect(resolveFight(s, mods, warden, AUTO_SKILL).win).toBe(false);
  });
});

describe('save v9', () => {
  it('migrates v8 saves with the burnt shell asleep and the crew timestamped', () => {
    const { s } = fresh();
    s.guild.hirelings['pell'] = { level: 1, xp: 100, status: 'well' };
    const raw = JSON.parse(serialize(s, 0)) as { state: Record<string, unknown> };
    for (const k of ['pressure', 'ember', 'wells', 'anomalies']) delete raw.state[k];
    delete (raw.state['guild'] as Record<string, unknown>)['crewRecalled'];
    const migrated = runMigrations({ version: 8, savedAt: 0, state: raw.state } as never);
    expect(migrated.version).toBe(SAVE_VERSION);
    const st = migrated.state as Record<string, Record<string, unknown>>;
    expect(st['pressure']!['heat']).toBe(0);
    expect((st['pressure']!['pipes'] as number[]).length).toBe(35);
    expect(st['ember']!['bestSustainSec']).toBe(0);
    expect((st['guild'] as Record<string, unknown>)['crewRecalled']).toBe(false);
    const crew = (st['guild'] as Record<string, Record<string, Record<string, unknown>>>)['hirelings']!;
    expect(crew['pell']!['hiredAtMs']).toBe(0);
  });
});

describe('THE DRAW — the Array eats the shaft\'s problem (Phase 14)', () => {
  const hotShaft = (heat: number) => {
    const { engine, s } = fresh();
    s.shell.current = 'cinder';
    s.depth = 400;
    s.depthRecords['cinder'] = 400;
    s.pressure.heat = heat;
    return { engine, s };
  };

  it('pulls shaft heat into the furnace, down to its floor', () => {
    const { engine, s } = hotShaft(80);
    expect(setDraw(s, true).ok).toBe(true);
    for (let i = 0; i < 40; i++) engine.tick(1);
    const after = engine.getState();
    expect(after.pressure.heat).toBeLessThan(80);
    expect(after.pressure.heat).toBeGreaterThanOrEqual(DRAW_FLOOR - 0.001);
    expect(after.ember.temp).toBeGreaterThan(0); // it arrived somewhere
  });

  // The flood guarantees are the load-bearing promise of the whole shell, so
  // this asserts the direction of the coupling rather than a magic number.
  it('can never leave a shaft hotter than not drawing at all', () => {
    for (const start of [0, 30, 60, 90]) {
      const off = hotShaft(start);
      const on = hotShaft(start);
      setDraw(on.s, true);
      for (let i = 0; i < 60; i++) { off.engine.tick(1); on.engine.tick(1); }
      expect(on.engine.getState().pressure.heat)
        .toBeLessThanOrEqual(off.engine.getState().pressure.heat + 1e-9);
    }
  });

  it('is exclusive with Overdrive — they run the same pipe both ways', () => {
    const { s } = hotShaft(50);
    setDraw(s, true);
    expect(s.ember.draw).toBe(true);
    setOverdrive(s, true);
    expect(s.ember.draw).toBe(false);
    setDraw(s, true);
    expect(s.ember.overdrive).toBe(false);
  });

  it('does nothing while shut, and survives a save that predates it', () => {
    const { engine, s } = hotShaft(50);
    // A v12 save has no `draw` field at all.
    delete (s.ember as unknown as Record<string, unknown>)['draw'];
    for (let i = 0; i < 10; i++) engine.tick(1);
    expect(engine.getState().ember.draw ?? false).toBe(false);
  });
});
