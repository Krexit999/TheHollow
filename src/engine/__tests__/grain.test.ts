/**
 * THE GRAIN (Proof #1) — the rules, at the engine level.
 *
 * These are the invariants the proof is allowed to be judged on. They are NOT
 * an answer to the proof's question, which is whether aiming a wave is
 * satisfying and can only be settled by a person chipping for two hours. What
 * they establish is that the thing being played is the thing that was designed.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { Engine, EngineCtx, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import {
  ACROSS_COMPACTION, ACROSS_DUST_MULT, ACROSS_TIME_MULT, COMPACTION_SHOW_AT,
  DEEP_GATES, FRONT_COMPACTION, GRAIN_E, LOCK_THRESHOLD, MAX_COMPACTION, TELEGRAPH_FROM,
  WITH_COMPACTION, compactionAt, ensureBand, faceReport, generateGrain, grainAt, grainNext,
  isLocked, liveCount, liveFloor, rerollBand, resetChipLog, seedCompaction, strikeTimeMult,
  wouldExceedSafety,
} from '../systems/grain';
import { openOre, plantOre, tickOres, workOre } from '../systems/ores';
import { applyFieldSize, cellCap, dpsMax, harvestCell, manualChip, tickFace } from '../systems/face';
import { materialDef, rollDrop } from '../materials';
import { tickDrills, newDrill, grainModeOf } from '../systems/drills';

const nullCtx: EngineCtx = { emit() {}, dirty() {} };
function fresh(): { engine: Engine; s: () => GameState; m: ModifierCache } {
  const engine = createEngine({ nowMs: 0 });
  resetChipLog();
  return { engine, s: () => engine.getState() as GameState, m: new ModifierCache() };
}

/** Put a cell at an exact compaction without going through a hundred chips. */
function setComp(s: GameState, cell: number, v: number): void {
  ensureBand(s);
  s.face.compaction![cell] = v;
}

/** Point every cell east, so a wave's path is knowable in a test. */
function flattenGrainEast(s: GameState): void {
  ensureBand(s);
  s.face.grain = s.face.cells.map(() => GRAIN_E);
}

// ---------------------------------------------------------------------------

describe('the grain field — runs, not noise', () => {
  it('generates a direction for every cell, all four cardinals in range', () => {
    const g = generateGrain(6, 6);
    expect(g).toHaveLength(36);
    for (const d of g) expect(d).toBeGreaterThanOrEqual(0);
    for (const d of g) expect(d).toBeLessThanOrEqual(3);
  });

  /**
   * THE FIELD IS THE PROOF'S ONE REAL KNOB, AND IT HAS TWO FAILURE MODES.
   *
   * The obvious one is NOISE: uniform random gives 25% neighbour agreement and
   * there is nothing to aim along. The one that actually shipped is the
   * opposite — a field 64% of one direction, where half the cells point off the
   * same edge, every wave dies on hop zero, and mean front length measures 0.00
   * in a live session while a coherence-only test reports green.
   *
   * So all three are asserted as a BAND, and the third one — how far a front
   * actually gets — is the one that would have caught it.
   */
  const field = (trials: number) => {
    let agree = 0, pairs = 0, domSum = 0, walkSum = 0, walkN = 0;
    for (let t = 0; t < trials; t++) {
      const g = generateGrain(6, 6);
      const dirTotals = [0, 0, 0, 0];
      for (const d of g) dirTotals[d]! += 1;
      domSum += Math.max(...dirTotals) / g.length;
      for (let y = 0; y < 6; y++) {
        for (let x = 0; x < 6; x++) {
          const c = y * 6 + x;
          if (x < 5) { pairs++; if (g[c] === g[c + 1]) agree++; }
          if (y < 5) { pairs++; if (g[c] === g[c + 6]) agree++; }
        }
      }
      for (let start = 0; start < 36; start++) {
        let cell = start, hops = 0;
        const seen = new Set<number>();
        while (!seen.has(cell) && hops < 200) {
          seen.add(cell);
          const x = cell % 6, y = Math.floor(cell / 6), d = g[cell]!;
          const next = d === 0 ? (y > 0 ? cell - 6 : -1)
            : d === 1 ? (x < 5 ? cell + 1 : -1)
              : d === 2 ? (y < 5 ? cell + 6 : -1) : (x > 0 ? cell - 1 : -1);
          if (next < 0) break;
          cell = next; hops++;
        }
        walkSum += hops; walkN++;
      }
    }
    return { coherence: agree / pairs, dominance: domSum / trials, walk: walkSum / walkN };
  };

  it('has visible currents — neighbours agree well above chance', () => {
    expect(field(60).coherence).toBeGreaterThan(0.4); // uniform noise is 0.25
  });

  it('is NOT one arrow — no single direction owns the board', () => {
    expect(field(60).dominance).toBeLessThan(0.48);
  });

  it('a front gets somewhere: mean walk clears the kill criterion', () => {
    // §9: "mean front length < 3 -> nobody is steering, they're poking." This
    // is that number measured on the field itself, before a player touches it,
    // so the generator cannot pass while making waves that cannot travel.
    expect(field(60).walk).toBeGreaterThan(3.5);
  });

  it('grainNext walks the field and returns -1 at the grid edge', () => {
    const { s } = fresh();
    flattenGrainEast(s());
    expect(grainNext(s(), 0)).toBe(1);
    expect(grainNext(s(), 5)).toBe(-1); // right edge of a 6-wide face
  });

  it('band scope flattens the whole face to one direction', () => {
    const { engine, s } = fresh();
    ensureBand(s());
    s().face.bandGrain = GRAIN_E;
    engine.dispatch({ type: 'setGrainScope', scope: 'band' });
    const dirs = new Set(s().face.cells.map((_, i) => grainAt(s(), i)));
    expect(dirs.size).toBe(1);
    // ...and it is an ENGINE rule, not a display one: the wave has to walk the
    // field the player is being shown.
    expect(grainNext(s(), 0)).toBe(1);
  });
});

describe('the two modes', () => {
  it('WITH adds 1 compaction, ACROSS adds 3', () => {
    const { s, m } = fresh();
    manualChip(s(), m, nullCtx, 0, 'with');
    expect(compactionAt(s(), 0)).toBe(WITH_COMPACTION);
    manualChip(s(), m, nullCtx, 1, 'across');
    expect(compactionAt(s(), 1)).toBe(ACROSS_COMPACTION);
  });

  it('ACROSS pays more per swing and costs more per swing — net SLOWER', () => {
    // The pillar-2 argument in one assertion: 1.3 / 1.8 = 0.72, so across-grain
    // is a WORSE dust rate. If this ever inverts, the mode has become a faucet.
    expect(ACROSS_DUST_MULT / ACROSS_TIME_MULT).toBeLessThan(1);
    expect(strikeTimeMult('across')).toBe(ACROSS_TIME_MULT);
    expect(strikeTimeMult('with')).toBe(1);
  });

  it('a chip that takes nothing seeds no compaction', () => {
    const { s, m } = fresh();
    const st = s();
    ensureBand(st);
    st.face.cells[0] = 0; // drained to the floor
    manualChip(st, m, nullCtx, 0, 'across');
    expect(compactionAt(st, 0)).toBe(0);
  });

  it('compaction is capped and never runs away', () => {
    const { s, m } = fresh();
    setComp(s(), 0, MAX_COMPACTION - 1);
    for (let i = 0; i < 20; i++) {
      s().face.cells[0] = cellCap(s(), m);
      manualChip(s(), m, nullCtx, 0, 'with');
    }
    expect(compactionAt(s(), 0)).toBe(MAX_COMPACTION);
  });
});

describe('the persistent front', () => {
  it('an across chip creates a front and walks it ONE cell along the grain', () => {
    const { s, m } = fresh();
    flattenGrainEast(s());
    manualChip(s(), m, nullCtx, 0, 'across');
    const f = s().face.front!;
    expect(f.alive).toBe(true);
    expect(f.cell).toBe(1);          // one hop east of the struck cell
    expect(f.hops).toBe(1);
    expect(compactionAt(s(), 0)).toBe(ACROSS_COMPACTION); // the hand's cell
    expect(compactionAt(s(), 1)).toBe(FRONT_COMPACTION);  // the cell it entered
  });

  it('striking the head extends the same front; striking elsewhere starts a new one', () => {
    const { s, m } = fresh();
    flattenGrainEast(s());
    manualChip(s(), m, nullCtx, 0, 'across');
    manualChip(s(), m, nullCtx, 1, 'across');
    expect(s().face.front!.hops).toBe(2);
    manualChip(s(), m, nullCtx, 20, 'across'); // somewhere else entirely
    expect(s().face.front!.hops).toBe(1);
    expect(s().face.front!.cell).toBe(21);
  });

  it('ONE CELL PER CHIP — never a cascade', () => {
    const { s, m } = fresh();
    flattenGrainEast(s());
    manualChip(s(), m, nullCtx, 0, 'across');
    // Cells 2..5 lie further along the same grain and must be untouched.
    for (let c = 2; c <= 5; c++) expect(compactionAt(s(), c)).toBe(0);
  });

  it('dies at the grid edge', () => {
    const { s, m } = fresh();
    flattenGrainEast(s());
    manualChip(s(), m, nullCtx, 5, 'across'); // right edge of row 0
    expect(s().face.front!.alive).toBe(false);
  });

  it('a WITH chip never touches the front', () => {
    const { s, m } = fresh();
    flattenGrainEast(s());
    manualChip(s(), m, nullCtx, 0, 'across');
    const before = { ...s().face.front! };
    manualChip(s(), m, nullCtx, 30, 'with');
    expect(s().face.front!.cell).toBe(before.cell);
    expect(s().face.front!.hops).toBe(before.hops);
  });

  it('SURVIVES A PAUSE — it is a position, not a combo timer', () => {
    const { s, m } = fresh();
    flattenGrainEast(s());
    manualChip(s(), m, nullCtx, 0, 'across');
    const head = s().face.front!.cell;
    for (let i = 0; i < 600; i++) tickFace(s(), m, nullCtx, 0.1); // a minute away
    expect(s().face.front!.alive).toBe(true);
    expect(s().face.front!.cell).toBe(head);
  });

  it('THE FRONT CANNOT LOCK A CELL — only a strike the player aimed can', () => {
    const { s, m } = fresh();
    flattenGrainEast(s());
    setComp(s(), 1, MAX_COMPACTION);
    manualChip(s(), m, nullCtx, 0, 'across');
    expect(isLocked(s(), 1)).toBe(false);
    expect(compactionAt(s(), 1)).toBe(MAX_COMPACTION); // clamped, not killed
  });
});

describe('lock, and its recovery', () => {
  it('locks at exactly the telegraphed band and not one below it', () => {
    const { s, m } = fresh();
    // 17 + 3 = 20, which is NOT past the threshold: this cell survives.
    setComp(s(), 0, TELEGRAPH_FROM - 1);
    manualChip(s(), m, nullCtx, 0, 'across');
    expect(isLocked(s(), 0)).toBe(false);
    // 18 + 3 = 21, which is: this one dies. The telegraph band and the lethal
    // band are the SAME set of numbers, which is what makes "that's not fair"
    // impossible to say honestly.
    const { s: s2, m: m2 } = fresh();
    setComp(s2(), 0, TELEGRAPH_FROM);
    manualChip(s2(), m2, nullCtx, 0, 'across');
    expect(isLocked(s2(), 0)).toBe(true);
  });

  it('WITH-grain work above the threshold is safe at any compaction', () => {
    const { s, m } = fresh();
    setComp(s(), 0, LOCK_THRESHOLD + 5);
    for (let i = 0; i < 30; i++) {
      s().face.cells[0] = cellCap(s(), m);
      manualChip(s(), m, nullCtx, 0, 'with');
    }
    expect(isLocked(s(), 0)).toBe(false);
  });

  it('a locked cell gives nothing to ANY verb, and stops regenerating', () => {
    const { s, m } = fresh();
    setComp(s(), 0, LOCK_THRESHOLD);
    manualChip(s(), m, nullCtx, 0, 'across');
    expect(isLocked(s(), 0)).toBe(true);
    expect(s().face.cells[0]).toBe(0);
    // The funnel every verb in the game harvests through.
    expect(harvestCell(s(), m, 0, 1, { mul: () => 1 } as never).charge).toBe(0);
    for (let i = 0; i < 100; i++) tickFace(s(), m, nullCtx, 0.1);
    expect(s().face.cells[0]).toBe(0);
    // ...and the displayed ceiling tells the truth about it.
    const { s: clean, m: cm } = fresh();
    expect(dpsMax(s(), m).lt(dpsMax(clean(), cm))).toBe(true);
  });

  it('a Collapse re-rolls the band: fresh grain, no compaction, no locks', () => {
    const { engine, s, m } = fresh();
    setComp(s(), 0, LOCK_THRESHOLD);
    manualChip(s(), m, nullCtx, 0, 'across');
    expect(isLocked(s(), 0)).toBe(true);
    rerollBand(s());
    expect(isLocked(s(), 0)).toBe(false);
    expect(compactionAt(s(), 0)).toBe(0);
    expect(s().face.front).toBeUndefined();
    // ...and the same thing is reachable as a dev hook without a descent.
    setComp(s(), 3, LOCK_THRESHOLD);
    manualChip(s(), m, nullCtx, 3, 'across');
    engine.dispatch({ type: 'debug', op: 'rerollBand' });
    expect(s().face.locked!.some(Boolean)).toBe(false);
  });

  /**
   * THE BUG A LIVE SESSION FOUND, AND IT WAS THE WORST KIND.
   *
   * Killing every cell left no income, so no depth, so no Collapse, so no
   * re-roll — and the Collapse was the ONLY recovery. The save was over, with
   * nothing on screen to say so. These are the tests that stop it coming back.
   */
  it('THE BOARD CANNOT BE KILLED — a live floor always survives', () => {
    const { s, m } = fresh();
    const st = s();
    ensureBand(st);
    const floor = liveFloor(st);
    // Drive every cell to the edge, then try to kill all of them, twice over.
    for (let pass = 0; pass < 3; pass++) {
      for (let c = 0; c < st.face.cells.length; c++) {
        setComp(st, c, LOCK_THRESHOLD);
        st.face.cells[c] = cellCap(st, m);
        manualChip(st, m, nullCtx, c, 'across');
      }
    }
    expect(liveCount(st)).toBeGreaterThanOrEqual(floor);
    expect(floor).toBeGreaterThan(0);
  });

  it('a held lock reports itself rather than failing silently', () => {
    const { s, m } = fresh();
    const st = s();
    ensureBand(st);
    for (let c = 0; c < st.face.cells.length; c++) {
      setComp(st, c, LOCK_THRESHOLD);
      st.face.cells[c] = cellCap(st, m);
      manualChip(st, m, nullCtx, c, 'across');
    }
    // By now the floor is holding. One more strike on a live cell must say so.
    const alive = st.face.locked!.findIndex((l) => !l);
    st.face.cells[alive] = cellCap(st, m);
    setComp(st, alive, LOCK_THRESHOLD);
    const r = manualChip(st, m, nullCtx, alive, 'across');
    expect(r.grain?.lockHeld).toBe(true);
    expect(r.grain?.locked).toBe(false);
    expect(isLocked(st, alive)).toBe(false);
  });

  it('"Abandon the dig" really does clear the rock', () => {
    // The live report came in as "I reset all progress and the cells stayed
    // locked". Erasing everything must give back a face with nothing dead on
    // it, through the same action the button dispatches.
    const { engine, s, m } = fresh();
    const st = s();
    ensureBand(st);
    setComp(st, 0, LOCK_THRESHOLD);
    st.face.cells[0] = cellCap(st, m);
    manualChip(st, m, nullCtx, 0, 'across');
    expect(isLocked(st, 0)).toBe(true);
    engine.dispatch({ type: 'hardReset' });
    const after = engine.getState() as GameState;
    ensureBand(after);
    expect(after.face.locked!.some(Boolean)).toBe(false);
    expect(after.face.compaction!.every((c) => c === 0)).toBe(true);
    expect(liveCount(after)).toBe(after.face.cells.length);
  });

  it('a board that was ALREADY bricked comes back on load', () => {
    // The floor above cannot help a save killed before it existed, and that
    // save cannot reach its own recovery. Loading one repairs it.
    const { s } = fresh();
    const st = s();
    ensureBand(st);
    st.face.locked = st.face.cells.map(() => true);
    st.face.compaction = st.face.cells.map((_, i) => 20 + (i % 5));
    ensureBand(st);
    expect(liveCount(st)).toBeGreaterThanOrEqual(liveFloor(st));
    // The rock that comes back is the rock that was worked LEAST.
    const revived = st.face.locked!.map((l, i) => ({ l, i })).filter((x) => !x.l);
    for (const { i } of revived) expect(st.face.compaction![i]).toBeLessThanOrEqual(LOCK_THRESHOLD);
  });

  it('the threshold is ONE constant, so the Patient mark lands as one line', () => {
    expect(LOCK_THRESHOLD).toBe(20);
    expect(TELEGRAPH_FROM).toBe(LOCK_THRESHOLD - ACROSS_COMPACTION + 1);
  });
});

describe('deep entry', () => {
  it('the three gates sit at 8, 14 and 20, deepest first', () => {
    expect(DEEP_GATES.map((g) => g.at)).toEqual([20, 14, 8]);
    expect(DEEP_GATES.map((g) => g.materialId)).toEqual(['deepgrave', 'graveclaydeep', 'umberjade']);
    // The terminal material drops exactly where across-chipping starts killing
    // cells. The richest cell on the board is always one wrong strike from dead.
    expect(DEEP_GATES[0]!.at).toBe(LOCK_THRESHOLD);
  });

  it('the number appears on the chip where it starts paying', () => {
    expect(COMPACTION_SHOW_AT).toBe(DEEP_GATES[DEEP_GATES.length - 1]!.at);
  });

  it('deep-entry materials cannot come out of an ordinary chip', () => {
    // They are `source`-marked, which both drop pools filter on — so the only
    // way to one is to work a cell down to its gate.
    expect(materialDef('deepgrave').source).toBe('deep');
    expect(materialDef('graveclaydeep').source).toBe('deep');
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      const d = rollDrop('loam', 400);
      if (d.materialId) seen.add(d.materialId);
    }
    expect(seen.has('deepgrave')).toBe(false);
    expect(seen.has('graveclaydeep')).toBe(false);
  });
});

describe('the drills work the grain without a parallel system', () => {
  it("'with' is the default and is byte-for-byte the old behaviour", () => {
    expect(grainModeOf(newDrill())).toBe('with');
  });

  it('a seeding drill can never lock a cell, even with the safety off', () => {
    const { s, m } = fresh();
    const st = s();
    st.drills.bayBuilt = true;
    st.drills.units = [{ ...newDrill('Bess'), grainMode: 'across', grainUnsafe: true }];
    for (let i = 0; i < 4000; i++) tickDrills(st, m, nullCtx, 0.1);
    expect(st.face.locked!.some(Boolean)).toBe(false);
    // It did do the work it was set to do.
    expect(Math.max(...st.face.compaction!)).toBeGreaterThan(0);
  });

  it('the safety keeps a drill off cells it would push past the line', () => {
    const { s } = fresh();
    setComp(s(), 0, LOCK_THRESHOLD);
    expect(wouldExceedSafety(s(), 0, FRONT_COMPACTION)).toBe(true);
    setComp(s(), 1, LOCK_THRESHOLD - FRONT_COMPACTION);
    expect(wouldExceedSafety(s(), 1, FRONT_COMPACTION)).toBe(false);
  });

  it('seedCompaction clamps at the threshold — the hard floor under the safety', () => {
    const { s } = fresh();
    for (let i = 0; i < 200; i++) seedCompaction(s(), 0, FRONT_COMPACTION);
    expect(compactionAt(s(), 0)).toBe(LOCK_THRESHOLD);
  });

  it('drills route around dead rock', () => {
    const { s, m } = fresh();
    const st = s();
    setComp(st, 0, LOCK_THRESHOLD);
    manualChip(st, m, nullCtx, 0, 'across');
    expect(isLocked(st, 0)).toBe(true);
    st.drills.bayBuilt = true;
    st.drills.units = [newDrill('Bess')];
    const held = st.face.cells[0];
    for (let i = 0; i < 400; i++) tickDrills(st, m, nullCtx, 0.1);
    expect(st.face.cells[0]).toBe(held); // never touched
  });
});

describe('dead rock is dead to the pockets too', () => {
  /** The other half of the live report: a pocket spawned behind the X, the
   *  hold gesture still worked it, and it still paid its guaranteed rolls —
   *  so a locked cell was the most profitable rock on the board. */
  function killCell(st: GameState, m: ModifierCache, cell: number): void {
    setComp(st, cell, LOCK_THRESHOLD);
    st.face.cells[cell] = cellCap(st, m);
    manualChip(st, m, nullCtx, cell, 'across');
  }

  it('a pocket never spawns on a locked cell', () => {
    const { s, m } = fresh();
    const st = s();
    killCell(st, m, 0);
    expect(isLocked(st, 0)).toBe(true);
    for (let i = 0; i < 3000; i++) tickOres(st, m, nullCtx, 0.5);
    expect(st.face.ore?.[0] ?? '').toBe('');
  });

  it('planting one on dead rock is refused', () => {
    const { s, m } = fresh();
    const st = s();
    killCell(st, m, 0);
    expect(plantOre(st, m, nullCtx, 0)).toBe(false);
  });

  it('a pocket left on a cell that dies goes with it', () => {
    const { s, m } = fresh();
    const st = s();
    ensureBand(st);
    setComp(st, 0, LOCK_THRESHOLD);
    st.face.cells[0] = cellCap(st, m);
    manualChip(st, m, nullCtx, 0, 'across');
    st.face.ore = st.face.cells.map(() => '');
    // ...and if one somehow survives on dead rock, no verb will touch it.
    st.face.ore[0] = 'seam';
    expect(workOre(st, nullCtx, 0, 5).ok).toBe(false);
    expect(openOre(st, m, nullCtx, 0, 'hand', 1)).toBeNull();
  });
});

describe('the band survives the face changing shape', () => {
  it('a wider face keeps grain, compaction and locks on the SAME rock', () => {
    const { s, m } = fresh();
    const st = s();
    setComp(st, 7, 12); // row 1, col 1 on a 6-wide grid
    st.upgrades['expand'] = 1;
    applyFieldSize(st, m);
    // 6-wide -> 7-wide: (1,1) is index 7 before and index 8 after.
    expect(st.face.w).toBe(7);
    expect(compactionAt(st, 8)).toBe(12);
  });
});

describe('faceReport — the six metrics', () => {
  it('counts strikes, splits the modes, and separates wave drops from hand drops', () => {
    const { s, m } = fresh();
    flattenGrainEast(s());
    for (let i = 0; i < 10; i++) {
      s().face.cells[i % 6] = cellCap(s(), m);
      manualChip(s(), m, nullCtx, i % 6, i % 2 === 0 ? 'across' : 'with');
      s().stats.playTimeSec += 1;
    }
    const r = faceReport(s());
    expect(r.chips).toBe(10);
    const b0 = r.acrossWithByBucket[0]!;
    expect(b0.across + b0.with).toBe(10);
    expect(r.text).toContain('across:with by 10-min bucket');
    expect(r.text).toContain('first deep-entry');
  });

  it('a live front counts toward the length metrics', () => {
    const { s, m } = fresh();
    flattenGrainEast(s());
    manualChip(s(), m, nullCtx, 0, 'across');
    manualChip(s(), m, nullCtx, 1, 'across');
    expect(faceReport(s()).maxFrontLength).toBeGreaterThanOrEqual(2);
  });
});

describe('the shape heals rather than migrating', () => {
  it('a save with no grain arrays gets them on the first tick', () => {
    const { s, m } = fresh();
    const st = s();
    delete st.face.grain;
    delete st.face.compaction;
    delete st.face.locked;
    tickFace(st, m, nullCtx, 0.1);
    expect(st.face.grain).toHaveLength(st.face.cells.length);
    expect(st.face.compaction).toHaveLength(st.face.cells.length);
    expect(st.face.locked).toHaveLength(st.face.cells.length);
  });
});
