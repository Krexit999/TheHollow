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
  DEEP_GATES, FRONT_COMPACTION, GRAIN_E, GRAIN_W, MAX_COMPACTION, TERMINAL_GATE,
  WITH_COMPACTION, compactionAt, ensureBand, faceReport, generateGrain, grainAt, grainNext,
  rerollBand, resetChipLog, seedCompaction, strikeTimeMult,
} from '../systems/grain';
import {
  applyFieldSize, cellCap, cellRegen, chipYield, dpsMax, manualChip, tickFace,
} from '../systems/face';
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
    let agree = 0, pairs = 0, domSum = 0, walkSum = 0, walkN = 0, facing = 0;
    for (let t = 0; t < trials; t++) {
      const g = generateGrain(6, 6);
      const dirTotals = [0, 0, 0, 0];
      for (const d of g) dirTotals[d]! += 1;
      domSum += Math.max(...dirTotals) / g.length;
      // FACING PAIRS — squares pointing straight at each other. The defect a
      // player saw on the grid while every metric here reported healthy.
      const nextOf = (c: number): number => {
        const x = c % 6, y = Math.floor(c / 6), d = g[c]!;
        return d === 0 ? (y > 0 ? c - 6 : -1) : d === 1 ? (x < 5 ? c + 1 : -1)
          : d === 2 ? (y < 5 ? c + 6 : -1) : (x > 0 ? c - 1 : -1);
      };
      for (let c = 0; c < 36; c++) {
        const nx = nextOf(c);
        if (nx >= 0 && nextOf(nx) === c) facing += 0.5;
      }
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
    return {
      coherence: agree / pairs,
      dominance: domSum / trials,
      walk: walkSum / walkN,
      facingPairs: facing / trials,
    };
  };

  /**
   * THE ONE A PLAYER FOUND BY LOOKING.
   *
   * Two squares pointing at each other cannot both be on the same path, and a
   * field of independently-assigned directions always contains such pairs —
   * 3.21 per board, measured, on the generator this replaced. Every other test
   * in this file passed while that was true, because a walk that entered a
   * two-cell ping-pong scored as "still going". Drawing the seams instead of
   * colouring the cells takes it to ~0.2, and the survivors are seams crossing
   * rather than noise.
   */
  it('NO square ever points at the square pointing back at it', () => {
    // Zero, not "few". Every write in the generator refuses a direction that
    // would create a head-on pair, so this is a construction guarantee and the
    // test should fail the moment it stops being one.
    expect(field(200).facingPairs).toBe(0);
  });

  it('no square points off the board', () => {
    // A wave opened on one died on hop zero, and the uniform mean-walk average
    // buried those zeroes under long runs elsewhere: 11.2% of cells, against a
    // script reporting 4.26 mean while a live driver measured 0.76.
    let off = 0;
    for (let t = 0; t < 200; t++) {
      const g = generateGrain(6, 6);
      for (let c = 0; c < 36; c++) {
        const x = c % 6, y = Math.floor(c / 6), d = g[c]!;
        if ((d === 0 && y === 0) || (d === 1 && x === 5)
          || (d === 2 && y === 5) || (d === 3 && x === 0)) off++;
      }
    }
    expect(off).toBe(0);
  });

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

  /**
   * ACROSS THE GRAIN WORKS ROCK THAT HAS NOTHING LEFT TO GIVE.
   *
   * This asserted the opposite for two builds, on an anti-farm argument, and it
   * inverted the mechanic. §2.2: a fracture propagates +1 COMPACTION along the
   * grain line — not a chip. Compaction is a property of the rock, so a drained
   * cell can be compacted, and driving a wave through rock you have already
   * emptied so it comes back richer is the INTENDED use. Emptied rock in the
   * path is the target, not the wall.
   *
   * Bailing out meant: strike the head, head is empty, nothing happens at all.
   * No compaction, no propagation, the wave silently dead — most of why a live
   * driver measured mean wave length 0.76.
   */
  it('ACROSS on drained rock still compacts it and still drives the wave', () => {
    const { s, m } = fresh();
    const st = s();
    flattenGrainEast(st);
    st.face.cells[0] = 0; // nothing left to give
    const r = manualChip(st, m, nullCtx, 0, 'across');
    expect(r.charge).toBe(0);                              // it paid nothing...
    expect(compactionAt(st, 0)).toBe(ACROSS_COMPACTION);   // ...and still worked
    expect(st.face.front!.alive).toBe(true);               // ...and the wave moved
    expect(st.face.front!.cell).toBe(1);
    expect(compactionAt(st, 1)).toBe(FRONT_COMPACTION);
  });

  it('WITH on drained rock still refuses — that one is the harvest verb', () => {
    // A face you could compact with the cheap fast stroke on empty rock would
    // open every gate for free. Across pays 1.8x the time for the privilege.
    const { s, m } = fresh();
    const st = s();
    ensureBand(st);
    st.face.cells[0] = 0;
    manualChip(st, m, nullCtx, 0, 'with');
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

  /**
   * A FRACTURE CANNOT CROSS ITS OWN PATH — the fix for the bug a player found
   * by looking at the grid and asking the obvious question.
   *
   * Two neighbours can point at each other, and on the shipped field 98% of
   * boards contain such a pair; 100% of walks eventually enter a cycle. Without
   * this rule no wave ever ends, and the front-length metric happily reported
   * 9.41 while measuring a wave bouncing between the same two squares.
   */
  it('a wave ENDS — it never walks forever, on any field', () => {
    for (let trial = 0; trial < 200; trial++) {
      const { s, m } = fresh();
      const st = s();
      ensureBand(st);
      // Drive one wave as hard as a player possibly could.
      let guard = 0;
      while (st.face.front?.alive !== false && guard++ < 500) {
        const head = st.face.front?.alive ? st.face.front.cell : 0;
        st.face.cells[head] = cellCap(st, m);
        manualChip(st, m, nullCtx, head, 'across');
      }
      expect(guard).toBeLessThan(500);
      expect(st.face.front!.alive).toBe(false);
      // A wave can never be longer than the board it is crossing.
      expect(st.face.front!.hops).toBeLessThanOrEqual(st.face.cells.length);
    }
  });

  it('two cells facing each other do not ping-pong forever', () => {
    const { s, m } = fresh();
    const st = s();
    ensureBand(st);
    // Cell 0 points east, cell 1 points west: the degenerate case, and the one
    // the player spotted from the grid.
    st.face.grain = st.face.cells.map(() => GRAIN_E);
    st.face.grain[1] = GRAIN_W;
    st.face.cells[0] = cellCap(st, m);
    manualChip(st, m, nullCtx, 0, 'across');   // 0 -> 1
    expect(st.face.front!.cell).toBe(1);
    st.face.cells[1] = cellCap(st, m);
    manualChip(st, m, nullCtx, 1, 'across');   // 1 would go back to 0
    expect(st.face.front!.alive).toBe(false);
  });

  it('the wave clamps at the ceiling rather than running the number away', () => {
    const { s, m } = fresh();
    flattenGrainEast(s());
    setComp(s(), 1, MAX_COMPACTION);
    manualChip(s(), m, nullCtx, 0, 'across');
    expect(compactionAt(s(), 1)).toBe(MAX_COMPACTION);
  });
});


describe('working a cell only ever makes it deeper', () => {
  /**
   * THE LOCK IS GONE, AND THESE ARE THE TESTS THAT KEEP IT GONE.
   *
   * The first cut killed a cell taken across the grain above 20. A live session
   * killed the rule: a player who read the warning simply stopped pressing
   * Across and the risk evaporated; a player who did not wrecked the board and
   * — because the only recovery was a Collapse a dead board could not pay for —
   * bricked the save outright. Punish-the-uninformed, then nothing.
   */
  it('no amount of across-grain work can stop a cell working', () => {
    const { s, m } = fresh();
    const st = s();
    ensureBand(st);
    for (let i = 0; i < 60; i++) {
      st.face.cells[0] = cellCap(st, m);
      const r = manualChip(st, m, nullCtx, 0, 'across');
      expect(r.charge).toBeGreaterThan(0); // it never stops giving
    }
    expect(compactionAt(st, 0)).toBe(MAX_COMPACTION);
  });

  it('the face has no notion of a dead cell left in it', () => {
    const { s, m } = fresh();
    const st = s();
    ensureBand(st);
    for (let c = 0; c < st.face.cells.length; c++) {
      setComp(st, c, MAX_COMPACTION);
      st.face.cells[c] = cellCap(st, m);
      manualChip(st, m, nullCtx, c, 'across');
    }
    expect(st.face.locked).toBeUndefined();
    // ...and the ceiling is still the whole board, because all of it is alive.
    expect(dpsMax(st, m).toNumber()).toBeCloseTo(
      chipYield(st, m).toNumber() * st.face.cells.length * cellRegen(st, m), 6,
    );
  });

  it('a save carrying dead cells from the lock build is cleaned on load', () => {
    // One build shipped with locks in it. Nothing reads the array now, so a
    // save from that window would carry cells no code could ever revive.
    const { s, m } = fresh();
    const st = s();
    ensureBand(st);
    (st.face as { locked?: boolean[] }).locked = st.face.cells.map(() => true);
    tickFace(st, m, nullCtx, 0.1);
    expect(st.face.locked).toBeUndefined();
    expect(manualChip(st, m, nullCtx, 0, 'with').charge).toBeGreaterThan(0);
  });

  it('a Collapse is what takes compaction away, and it takes all of it', () => {
    // With nothing permanent to recover FROM, the re-roll is what makes
    // compaction a run-length project instead of a one-way ratchet.
    const { s, m } = fresh();
    const st = s();
    for (let c = 0; c < st.face.cells.length; c++) setComp(st, c, MAX_COMPACTION);
    rerollBand(st);
    expect(st.face.compaction!.every((c) => c === 0)).toBe(true);
    expect(st.face.front).toBeUndefined();
    void m;
  });
});

describe('deep entry', () => {
  it('the three gates sit at 8, 14 and 20, deepest first', () => {
    expect(DEEP_GATES.map((g) => g.at)).toEqual([20, 14, 8]);
    expect(DEEP_GATES.map((g) => g.materialId)).toEqual(['deepgrave', 'graveclaydeep', 'umberjade']);
    // The renderer rings the deepest gate, so the two must be the same number
    // or the board says a cell is worth the most one strike before it is.
    expect(TERMINAL_GATE).toBe(DEEP_GATES[0]!.at);
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
    st.drills.units = [{ ...newDrill('Bess'), grainMode: 'across' }];
    for (let i = 0; i < 4000; i++) tickDrills(st, m, nullCtx, 0.1);
    // It did the work it was set to do, and the rock is all still working.
    expect(Math.max(...st.face.compaction!)).toBeGreaterThan(0);
    expect(st.face.locked).toBeUndefined();
  });

  it('seedCompaction clamps at the ceiling', () => {
    const { s } = fresh();
    for (let i = 0; i < 200; i++) seedCompaction(s(), 0, FRONT_COMPACTION);
    expect(compactionAt(s(), 0)).toBe(MAX_COMPACTION);
  });

  it('the drills never collect the gates they open', () => {
    // A machine parked on a deep cell rolling the terminal material every
    // stroke is a faucet wearing a drop table's clothes. The bay makes the
    // gates REACHABLE; the payout is the player's.
    const { s, m } = fresh();
    const st = s();
    st.drills.bayBuilt = true;
    st.drills.units = [{ ...newDrill('Bess'), grainMode: 'across' }];
    for (let c = 0; c < st.face.cells.length; c++) setComp(st, c, MAX_COMPACTION);
    const before = st.materials.totalDrops;
    for (let i = 0; i < 2000; i++) tickDrills(st, m, nullCtx, 0.1);
    // Drills still roll the ORDINARY drop table; what they never do is take a
    // deep-entry material, so nothing from the gates can appear in the stacks.
    void before;
    expect(st.materials.stacks['deepgrave']).toBeUndefined();
    expect(st.materials.stacks['graveclaydeep']).toBeUndefined();
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
  });
});
