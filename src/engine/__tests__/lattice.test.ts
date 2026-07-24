import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { Engine, GameState, MotifShape } from '../types';
import {
  boardResonance,
  cellScores,
  cellContribution,
  chordId,
  detectChords,
  matchProgression,
  nearChordLines,
} from '../systems/lattice/latticeCore';
import { boardCells, cellCount, hexKey } from '../systems/lattice/hex';
import { CHORD_DEFS, PROGRESSION_DEFS } from '../content/shell1/latticeChords';
import { latticeSystem, PASSIVE_RANK_CAP, PASSIVE_RANK_SEC } from '../content/shell1/latticeSystem';
import { deserialize, serialize } from '../save/codec';
import { runMigrations, SAVE_VERSION } from '../save/migrations';

function ready(): { engine: Engine; s: GameState } {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  s.lattice.unlocked = true;
  s.lattice.rings = 4;
  engine.dispatch({ type: 'debug', op: 'grant', currency: 'motif', amount: 1000 });
  return { engine, s };
}

function place(engine: Engine, q: number, r: number, shape: MotifShape, rank = 1): void {
  const result = engine.dispatch({ type: 'placeMotif', q, r, shape, rank });
  if (!result.ok) throw new Error(`place(${q},${r}) failed: ${result.reason}`);
}

describe('cellContribution — the arithmetic the player is shown', () => {
  it('net always equals the cell resonance score, relation by relation', () => {
    const { engine, s } = ready();
    // A square with a same-shape neighbour (harmony), a wheel-successor feeder
    // (flow), and a wheel-opposite (discord). Off-centre — the Navel is fused.
    place(engine, 2, 0, 'square', 1);
    place(engine, 3, 0, 'square', 1);   // harmony: min(1,1)=1 into (2,0)
    place(engine, 2, 1, 'circle', 1);   // circle→square flow: 1/2=0.5 into (2,0)
    place(engine, 1, 0, 'hex', 1);      // square↔hex discord: -1 into (2,0)
    const key = hexKey(2, 0);
    const c = cellContribution(s.lattice, key);
    // net must match the authoritative score.
    expect(c.net).toBe(cellScores(s.lattice)[key]);
    // and the sum of the shown lines must equal net (nothing hidden or invented).
    expect(c.relations.reduce((a, rel) => a + rel.value, 0)).toBe(c.net);
    // the three relation kinds are all present and correctly valued.
    const byKind = Object.fromEntries(c.relations.map((r) => [r.kind, r.value]));
    expect(byKind['harmony']).toBe(1);
    expect(byKind['flow']).toBe(0.5);
    expect(byKind['discord']).toBe(-1);
  });

  it('a lone motif carries nothing and lists no relations', () => {
    const { engine, s } = ready();
    place(engine, 2, 0, 'triangle', 1);
    const c = cellContribution(s.lattice, hexKey(2, 0));
    expect(c.net).toBe(0);
    expect(c.relations).toHaveLength(0);
  });
});

describe('hex board', () => {
  it('ring sizes: 7 / 19 / 37 / 61', () => {
    expect(cellCount(1)).toBe(7);
    expect(cellCount(2)).toBe(19);
    expect(cellCount(3)).toBe(37);
    expect(cellCount(4)).toBe(61);
    expect(boardCells(4)).toHaveLength(61);
  });
});

describe('the 40 chords', () => {
  it('exactly 40 defined, ids unique, exactly 3 doors', () => {
    expect(CHORD_DEFS).toHaveLength(40);
    expect(new Set(CHORD_DEFS.map((c) => c.id)).size).toBe(40);
    expect(CHORD_DEFS.filter((c) => c.door).map((c) => c.door).sort()).toEqual([
      'press', 'progressions', 'ring4',
    ]);
  });

  it('a line of three same shapes forms a chord; mixed shapes do not', () => {
    const { s } = ready();
    s.lattice.cells = {
      [hexKey(-1, 0)]: { shape: 'triangle', rank: 1, seq: 0 },
      [hexKey(0, 0)]: { shape: 'triangle', rank: 1, seq: 1 },
      [hexKey(1, 0)]: { shape: 'triangle', rank: 1, seq: 2 },
    };
    const chords = detectChords(s.lattice);
    expect(chords).toHaveLength(1);
    expect(chords[0]!.id).toBe(chordId('triangle', 'isolated', true));
    expect(chords[0]!.sumRanks).toBe(3);
    expect(chords[0]!.seq).toBe(2);

    s.lattice.cells[hexKey(1, 0)]!.shape = 'circle';
    expect(detectChords(s.lattice)).toHaveLength(0);
  });

  it('context classification: supported / flowing / opposed / attended', () => {
    const { s } = ready();
    const base = () => ({
      [hexKey(-1, 0)]: { shape: 'triangle' as const, rank: 2, seq: 0 },
      [hexKey(0, 0)]: { shape: 'triangle' as const, rank: 1, seq: 1 },
      [hexKey(1, 0)]: { shape: 'triangle' as const, rank: 1, seq: 2 },
    });
    // Same shape adjacent -> supported.
    s.lattice.cells = { ...base(), [hexKey(0, 1)]: { shape: 'triangle', rank: 1, seq: 3 } };
    expect(detectChords(s.lattice).map((c) => c.id)).toContain(chordId('triangle', 'supported', false));
    // Successor (hex follows triangle) -> flowing.
    s.lattice.cells = { ...base(), [hexKey(0, 1)]: { shape: 'hex', rank: 1, seq: 3 } };
    expect(detectChords(s.lattice)[0]!.id).toBe(chordId('triangle', 'flowing', false));
    // Opposite (circle) -> opposed, and it outranks flowing.
    s.lattice.cells = {
      ...base(),
      [hexKey(0, 1)]: { shape: 'hex', rank: 1, seq: 3 },
      [hexKey(1, -1)]: { shape: 'circle', rank: 1, seq: 4 },
    };
    expect(detectChords(s.lattice)[0]!.id).toBe(chordId('triangle', 'opposed', false));
    // Square neither follows nor opposes triangle -> attended.
    s.lattice.cells = { ...base(), [hexKey(0, 1)]: { shape: 'square', rank: 1, seq: 3 } };
    expect(detectChords(s.lattice)[0]!.id).toBe(chordId('triangle', 'attended', false));
  });

  it('a fourth motif extends the run into one stronger chord, not two', () => {
    const { s } = ready();
    s.lattice.cells = {};
    for (let q = -1; q <= 2; q++) {
      s.lattice.cells[hexKey(q, 0)] = { shape: 'triangle', rank: 1, seq: q + 1 };
    }
    const chords = detectChords(s.lattice);
    expect(chords).toHaveLength(1);
    expect(chords[0]!.cells).toHaveLength(4);
    expect(chords[0]!.sumRanks).toBe(4);
  });

  it('two crossing lines through one motif are two chords', () => {
    const { s } = ready();
    s.lattice.cells = {};
    const cells: [number, number][] = [
      [-1, 0], [0, 0], [1, 0], // horizontal
      [0, -1], [0, 1], // vertical through centre
    ];
    cells.forEach(([q, r], i) => {
      s.lattice.cells[hexKey(q, r)] = { shape: 'square', rank: 1, seq: i };
    });
    const chords = detectChords(s.lattice);
    expect(chords).toHaveLength(2);
    // Each line neighbours the other -> both supported.
    expect(chords.every((c) => c.id === chordId('square', 'supported', true))).toBe(true);
  });
});

describe('discovery', () => {
  it('placing a line discovers the chord once, fires events, writes the codex', () => {
    const { engine, s } = ready();
    engine.subscribe(() => {}); // the juice feed only runs with a subscriber
    place(engine, -1, 1, 'triangle');
    place(engine, 0, 1, 'triangle');
    expect(s.lattice.discovered).toHaveLength(0);
    place(engine, 1, 1, 'triangle');
    expect(s.lattice.discovered).toEqual([chordId('triangle', 'isolated', true)]);
    expect(s.feed.some((f) => f.event.type === 'chordDiscovered')).toBe(true);
    const codex = latticeSystem.codex(s);
    expect(codex).toHaveLength(1);
    expect(codex[0]!.name).toBe('Clean Split');
    expect(codex[0]!.active).toBe(true);
  });

  it('the codex never lists the undiscovered (pillar 5)', () => {
    const { s } = ready();
    expect(latticeSystem.codex(s)).toHaveLength(0);
  });

  it('breaking the line keeps the codex entry but ends the effect', () => {
    const { engine, s } = ready();
    place(engine, -1, 1, 'triangle');
    place(engine, 0, 1, 'triangle');
    place(engine, 1, 1, 'triangle');
    engine.dispatch({ type: 'removeMotif', q: 0, r: 1 });
    expect(s.lattice.activeChords).toHaveLength(0);
    const codex = latticeSystem.codex(s);
    expect(codex).toHaveLength(1);
    expect(codex[0]!.active).toBe(false);
  });

  it('doors discover at any rank but only open at combined rank 9+', () => {
    const { engine, s } = ready();
    // The Keystone: hex.isolated.uniform — rank-1 stones discover it...
    place(engine, 2, -2, 'hex');
    place(engine, 2, -1, 'hex');
    place(engine, 2, 0, 'hex');
    expect(s.lattice.discovered).toContain('hex.isolated.uniform');
    expect(s.lattice.doors.ring4).toBe(false); // ...but the seal resists.
    for (const r of [-2, -1, 0]) engine.dispatch({ type: 'removeMotif', q: 2, r });
    // Rank-3 stones (Finer Chisels 1) carry the weight: 3+3+3 = 9.
    s.upgrades['chisels'] = 1;
    place(engine, 2, -2, 'hex', 3);
    place(engine, 2, -1, 'hex', 3);
    place(engine, 2, 0, 'hex', 3);
    expect(s.lattice.doors.ring4).toBe(true);
    // And once open, breaking the chord cannot re-close it.
    engine.dispatch({ type: 'removeMotif', q: 2, r: -1 });
    expect(s.lattice.doors.ring4).toBe(true);
  });

  it('near-chord lines are reported for the ambient hum', () => {
    const { engine, s } = ready();
    place(engine, -1, 1, 'circle');
    place(engine, 0, 1, 'circle');
    const near = nearChordLines(s.lattice);
    expect(near.some((n) => n.missing === hexKey(1, 1) && n.shape === 'circle')).toBe(true);
    expect(near.some((n) => n.missing === hexKey(-2, 1))).toBe(true);
  });

  it('the Navel is sealed: ring 1 cannot form any line', () => {
    const { engine } = ready();
    const result = engine.dispatch({ type: 'placeMotif', q: 0, r: 0, shape: 'circle', rank: 1 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/sealed|Navel/i);
    // With the centre gone, no three of ring 1's six sockets are collinear:
    // every line through radius-1 cells passes through (0,0).
    const ring1 = boardCells(1).filter((c) => !(c.q === 0 && c.r === 0));
    for (const a of ring1) {
      for (const b of ring1) {
        for (const c of ring1) {
          if (a === b || b === c || a === c) continue;
          const collinear =
            (b.q - a.q) * (c.r - a.r) === (c.q - a.q) * (b.r - a.r) &&
            Math.abs(a.q - c.q) <= 2 && Math.abs(a.r - c.r) <= 2;
          const consecutive =
            b.q - a.q === c.q - b.q && b.r - a.r === c.r - b.r;
          expect(collinear && consecutive).toBe(false);
        }
      }
    }
  });
});

describe('resonance rules', () => {
  it('harmony: same shapes gain min(rank); discord: opposites lose 1', () => {
    const { s } = ready();
    s.lattice.cells = {
      [hexKey(0, 0)]: { shape: 'circle', rank: 3, seq: 0 },
      [hexKey(1, 0)]: { shape: 'circle', rank: 2, seq: 1 },
      [hexKey(0, 1)]: { shape: 'triangle', rank: 5, seq: 2 }, // circle's opposite
    };
    const scores = cellScores(s.lattice);
    // The triangle at (0,1) neighbours BOTH circles. Each circle:
    // +min(3,2)=2 harmony, -1 discord = 1. Triangle: -1 from each circle = -2.
    expect(scores[hexKey(0, 0)]).toBeCloseTo(1);
    expect(scores[hexKey(1, 0)]).toBeCloseTo(1);
    expect(scores[hexKey(0, 1)]).toBeCloseTo(-2);
    expect(boardResonance(s.lattice)).toBeCloseTo(2); // only positives count
  });

  it('flow: a shape feeds its successor half its rank', () => {
    const { s } = ready();
    s.lattice.cells = {
      [hexKey(0, 0)]: { shape: 'circle', rank: 4, seq: 0 },
      [hexKey(1, 0)]: { shape: 'square', rank: 1, seq: 1 }, // circle -> square
    };
    const scores = cellScores(s.lattice);
    expect(scores[hexKey(1, 0)]).toBeCloseTo(2); // fed 4/2
    expect(scores[hexKey(0, 0)]).toBeCloseTo(0); // giving costs nothing
  });
});

describe('motif economy', () => {
  it('placement costs rank²+1; removal refunds 60%', () => {
    const { engine, s } = ready();
    const before = s.currencies['motif']!.toNumber();
    place(engine, 0, 1, 'circle', 2); // 2² + 1 = 5
    expect(s.currencies['motif']!.toNumber()).toBeCloseTo(before - 5);
    engine.dispatch({ type: 'removeMotif', q: 0, r: 1 });
    expect(s.currencies['motif']!.toNumber()).toBeCloseTo(before - 5 + 3);
  });

  it('rank is gated by Finer Chisels', () => {
    const { engine, s } = ready();
    expect(engine.dispatch({ type: 'placeMotif', q: 0, r: 1, shape: 'circle', rank: 3 }).ok).toBe(false);
    s.upgrades['chisels'] = 1;
    expect(engine.dispatch({ type: 'placeMotif', q: 0, r: 1, shape: 'circle', rank: 3 }).ok).toBe(true);
  });

  it('in-place upgrade keeps the placement seq (order is where it stood)', () => {
    const { engine, s } = ready();
    s.upgrades['chisels'] = 3;
    place(engine, 0, 1, 'circle', 1);
    const seqBefore = s.lattice.cells[hexKey(0, 1)]!.seq;
    engine.dispatch({ type: 'upgradeMotif', q: 0, r: 1 });
    expect(s.lattice.cells[hexKey(0, 1)]!.rank).toBe(2);
    expect(s.lattice.cells[hexKey(0, 1)]!.seq).toBe(seqBefore);
  });

  it('ring 4 stays shut until the Keystone opens it', () => {
    const { engine, s } = ready();
    s.lattice.rings = 3;
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'brick', amount: 1000 });
    expect(engine.dispatch({ type: 'buyLatticeRing' }).ok).toBe(false);
    s.lattice.doors.ring4 = true;
    expect(engine.dispatch({ type: 'buyLatticeRing' }).ok).toBe(true);
    expect(s.lattice.rings).toBe(4);
  });
});

describe('progressions', () => {
  it('matches patterns as an ordered subsequence of chord seq', () => {
    const active = [
      { id: 'circle.isolated.mixed', cells: [], sumRanks: 3, seq: 10 },
      { id: 'hex.isolated.mixed', cells: [], sumRanks: 3, seq: 5 },
    ];
    // Root Before Crown requires circle BEFORE hex.
    const steps = PROGRESSION_DEFS.find((p) => p.id === 'rootBeforeCrown')!.steps;
    expect(matchProgression(active, steps)).toBe(false);
    active[1]!.seq = 20; // hex now completed after the circle
    expect(matchProgression(active, steps)).toBe(true);
  });

  it('progressions stay hidden until the Grammar door opens', () => {
    const { engine, s } = ready();
    // Three triangle chords, placed in order -> would match The Long Descent.
    const lines: [number, number][][] = [
      [[-1, 1], [0, 1], [1, 1]],
      [[-3, 2], [-2, 2], [-1, 2]],
      [[2, -3], [3, -3], [4, -3]],
    ] as [number, number][][];
    for (const line of lines) for (const [q, r] of line) place(engine, q, r, 'triangle');
    expect(s.lattice.discoveredProgressions).toHaveLength(0); // door shut
    s.lattice.doors.progressions = true;
    engine.dispatch({ type: 'removeMotif', q: 4, r: -3 });
    place(engine, 4, -3, 'triangle'); // recompute with the door open
    expect(s.lattice.discoveredProgressions).toContain('longDescent');
    expect(s.lattice.activeProgressions).toContain('longDescent');
  });
});

describe('persistence', () => {
  it('the board, motifs, and discoveries survive Collapse', () => {
    const { engine, s } = ready();
    place(engine, -1, 1, 'triangle');
    place(engine, 0, 1, 'triangle');
    place(engine, 1, 1, 'triangle');
    const motifs = s.currencies['motif']!.toNumber();
    s.depth = 40;
    engine.dispatch({ type: 'collapse' });
    expect(Object.keys(s.lattice.cells)).toHaveLength(3);
    expect(s.lattice.discovered).toHaveLength(1);
    expect(s.currencies['motif']!.toNumber()).toBeCloseTo(motifs);
    expect(s.currencies['dust']!.toNumber()).toBe(0); // shell currency still wipes
  });

  it('round-trips through the save codec', () => {
    const { engine, s } = ready();
    place(engine, 0, 1, 'square', 2);
    place(engine, 1, 1, 'square', 1);
    const back = deserialize(serialize(s, 0));
    expect(back.lattice.cells[hexKey(0, 1)]!.shape).toBe('square');
    expect(back.lattice.cells[hexKey(0, 1)]!.rank).toBe(2);
    expect(back.lattice.placeSeq).toBe(s.lattice.placeSeq);
  });

  it('v1 saves migrate: the lattice arrives buried but intact', () => {
    const { s } = ready();
    const raw = JSON.parse(serialize(s, 0)) as { version: number; state: Record<string, unknown> };
    delete raw.state['lattice'];
    raw.version = 1;
    const migrated = runMigrations({ version: 1, savedAt: 0, state: raw.state });
    expect(migrated.version).toBe(SAVE_VERSION);
    const lat = (migrated.state as Record<string, unknown>)['lattice'] as { unlocked: boolean; rings: number };
    expect(lat.unlocked).toBe(false);
    expect(lat.rings).toBe(1);
  });
});

describe('passive rank + optionality (pillar 4)', () => {
  it('accrues one rank per 12 minutes, capped', () => {
    const { engine, s } = ready();
    engine.dispatch({ type: 'debug', op: 'warp', seconds: PASSIVE_RANK_SEC * 3 + 1 });
    expect(s.lattice.passiveRank).toBe(3);
    engine.dispatch({ type: 'applyOffline', seconds: PASSIVE_RANK_SEC * 1000 });
    expect(s.lattice.passiveRank).toBe(PASSIVE_RANK_CAP);
  });

  it('offline passive accrual respects efficiency', () => {
    const { engine, s } = ready();
    engine.dispatch({ type: 'applyOffline', seconds: PASSIVE_RANK_SEC / 0.55 + 5 });
    expect(s.lattice.passiveRank).toBe(1);
    expect(s.offline!.passiveRanks).toBe(1);
    expect(s.offline!.motifs.gt(0)).toBe(true);
  });
});
