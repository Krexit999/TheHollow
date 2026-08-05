/**
 * THE READING — and above all, that every sentence it sells is WIRED.
 *
 * The cautionary case is in this repo: `registerChallengeLaws` has no callers,
 * so nine seals read at fourteen live guard sites are permanently false and
 * every one of those guards is dead code (LEDGER.md). Nobody noticed for several
 * phases because each guard was individually correct. A proposition layer is the
 * same shape — a predicate consulted from far away — so the first describe block
 * here is a STRUCTURAL check against the source, not a behavioural one.
 */
import { describe, expect, it } from 'vitest';
import { raiseWreck } from './wrecks';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createEngine } from '../index';
import type { Engine, EngineCtx, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import { NOTES, PROPOSITIONS } from '../content/shell1/reading';
import {
  PROPOSITION_SITES, ensureReading, note, noteCount, noteTally, proven,
  tickReading, visiblePropositions,
} from '../systems/reading';
import { cellCap, dpsMax, manualChip } from '../systems/face';
import { decayRate, showCompactionFrom } from '../systems/compaction';
import { drillInterval, newDrill, tickDrills } from '../systems/drills';

const ctx: EngineCtx = { emit() {}, dirty() {} };
function fresh(): { engine: Engine; s: GameState; m: ModifierCache } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState, m: new ModifierCache() };
}
/** Prove a row outright, for the rule tests below. */
function give(s: GameState, id: string): void {
  ensureReading(s).proven.push(id);
}

/** Every .ts under src/, minus this test's own directory. */
function sourceFiles(dir = 'src', out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__') continue;
      sourceFiles(p, out);
    } else if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      out.push(p);
    }
  }
  return out;
}

describe('EVERY PROPOSITION HAS A LIVE CALL SITE', () => {
  const files = sourceFiles();
  const bodies = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

  it('...outside systems/reading.ts and outside the tests', () => {
    const missing: string[] = [];
    for (const p of PROPOSITIONS) {
      const readers = [...bodies.entries()].filter(([f, src]) =>
        !f.endsWith(join('systems', 'reading.ts'))
        && new RegExp(`proven\\(\\s*state\\s*,\\s*'${p.id}'`).test(src));
      if (readers.length === 0) missing.push(p.id);
    }
    expect(missing, `unwired propositions: ${missing.join(', ')}`).toEqual([]);
  });

  it('and PROPOSITION_SITES names one for every row, with nothing left over', () => {
    // The map is what a reader consults; if it drifts from the content file it
    // becomes the same kind of stale documentation the ledger warns about.
    expect(Object.keys(PROPOSITION_SITES).sort()).toEqual(PROPOSITIONS.map((p) => p.id).sort());
  });

  it('every NOTE id is granted somewhere outside this file', () => {
    const missing = NOTES.filter((n) => ![...bodies.values()].some(
      (src) => new RegExp(`'${n.id}'`).test(src) && /note\(/.test(src),
    )).map((n) => n.id);
    expect(missing, `notes nothing grants: ${missing.join(', ')}`).toEqual([]);
  });

  it('and every proof reads a tally something WRITES', () => {
    // A proof gated on a counter no call site increments is unprovable, which
    // is a dead row wearing a live one's clothes.
    const written = new Set<string>();
    for (const src of bodies.values()) {
      for (const m of src.matchAll(/noteTally\(state,\s*'(\w+)'/g)) written.add(m[1]!);
    }
    // Every Tally key the content file's proofs actually ask for.
    const asked = ['terminal', 'barSet', 'chainWithHand', 'routed', 'handPockets', 'drillPockets', 'bankedHot', 'sampled'];
    expect([...asked].filter((k) => !written.has(k))).toEqual([]);
  });
});

describe('notes are novelty, never repetition', () => {
  it('a note fires once and never again', () => {
    const { s } = fresh();
    expect(note(s, ctx, 'firstGate')).toBe(true);
    expect(note(s, ctx, 'firstGate')).toBe(false);
    expect(noteCount(s)).toBe(1);
  });

  it('an unauthored id is refused rather than silently stored', () => {
    const { s } = fresh();
    expect(note(s, ctx, 'notARealNote')).toBe(false);
    expect(noteCount(s)).toBe(0);
  });

  it('LAW 3 — a question is hidden until its notes are held', () => {
    const { s } = fresh();
    expect(visiblePropositions(s)).toHaveLength(0);
    note(s, ctx, 'firstGate');
    /**
     * ...AND UNTIL THE DESK IS FOUND (A.106). Quillrest, Loam 98, carries THE
     * READING and was read by nothing. A note is something you NOTICED and
     * needs no desk; a proposition is a sentence that changes a rule, and you
     * cannot have one until you have found the desk somebody wrote it at.
     * Holding the note is now necessary and not sufficient.
     */
    expect(visiblePropositions(s), 'a question arrived before its desk').toHaveLength(0);
    raiseWreck(s, 'THE READING');
    const shown = visiblePropositions(s);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((p) => p.notes <= 1)).toBe(true);
  });
});

describe('a proof is behavioural, and only the one being worked is checked', () => {
  it('nothing proves itself while the desk is closed', () => {
    const { s } = fresh();
    for (const n of NOTES) note(s, ctx, n.id);
    noteTally(s, 'terminal', 5);
    tickReading(s, ctx);
    expect(proven(s, 'gateSight')).toBe(false); // nobody chose it
  });

  it('...and proves the moment the behaviour has happened', () => {
    const { engine, s } = fresh();
    for (const n of NOTES) note(s, ctx, n.id);
    expect(engine.dispatch({ type: 'workProposition', id: 'gateSight' }).ok).toBe(true);
    tickReading(s, ctx);
    expect(proven(s, 'gateSight')).toBe(false); // the deed is not done yet
    noteTally(s, 'terminal');
    tickReading(s, ctx);
    expect(proven(s, 'gateSight')).toBe(true);
    expect(s.reading!.working).toBeNull(); // the desk clears for the next one
  });

  it('a question you cannot afford is refused', () => {
    const { engine } = fresh();
    const r = engine.dispatch({ type: 'workProposition', id: 'readStays' });
    expect(r.ok).toBe(false);
  });
});

describe('each proved rule actually FIRES', () => {
  it('shallowHolds — shallow rock stops relaxing', () => {
    const { s } = fresh();
    expect(decayRate(4, s)).toBeGreaterThan(0);
    give(s, 'shallowHolds');
    expect(decayRate(4, s)).toBe(0);
    // ...and the deep end still relaxes, or the rule would be "decay is off".
    expect(decayRate(22, s)).toBeGreaterThan(0);
  });

  it('gateSight — the digit shows from the first blow', () => {
    const { s } = fresh();
    expect(showCompactionFrom(s)).toBe(8);
    give(s, 'gateSight');
    expect(showCompactionFrom(s)).toBe(1);
  });

  it('patientBank — a machine held under its bar keeps the stroke', () => {
    const strikesAfterRockReturns = (withRule: boolean): number => {
      const { s, m } = fresh();
      s.drills.bayBuilt = true;
      s.drills.units = [newDrill('D')];
      s.drills.units[0]!.minCharge = 0.85;
      if (withRule) give(s, 'patientBank');
      const cap = cellCap(s, m);
      s.face.cells = s.face.cells.map(() => cap * 0.1); // everything under the bar
      const step = drillInterval(s, m, s.drills.units[0]!);
      for (let i = 0; i < 6; i++) { s.face.ore = []; tickDrills(s, m, ctx, step); }
      const before = s.stats.drillStrikes;
      // The rock comes back, and only a HALF interval passes.
      s.face.cells = s.face.cells.map(() => cap);
      s.face.ore = [];
      tickDrills(s, m, ctx, step * 0.4);
      return s.stats.drillStrikes - before;
    };
    expect(strikesAfterRockReturns(false)).toBe(0); // the stroke was lost
    expect(strikesAfterRockReturns(true)).toBeGreaterThan(0); // it was banked
  });

  it('handLed — a chaining machine follows the player, not itself', () => {
    const landed = (withRule: boolean): number => {
      const { s, m } = fresh();
      s.drills.bayBuilt = true;
      s.drills.units = [newDrill('D')];
      const d = s.drills.units[0]!;
      d.behavior = 'chain';
      d.lastCell = 0;          // the machine's own corner
      s.face.lastHandCell = 30; // ...and the player, far away
      if (withRule) give(s, 'handLed');
      const cap = cellCap(s, m);
      s.face.cells = s.face.cells.map(() => cap);
      s.face.ore = [];
      d.timer = 0;
      tickDrills(s, m, ctx, drillInterval(s, m, d));
      return d.lastCell;
    };
    const w = fresh().s.face.w;
    const near = (a: number, b: number): boolean =>
      Math.max(Math.abs((a % w) - (b % w)), Math.abs(Math.floor(a / w) - Math.floor(b / w))) <= 1;
    expect(near(landed(false), 0)).toBe(true);   // beside its own last cell
    expect(near(landed(true), 30)).toBe(true);   // beside the player's
  });

  it('pocketPatience — machines leave a pocket the hand has started', () => {
    const claimed = (withRule: boolean): boolean => {
      const { s, m } = fresh();
      s.drills.bayBuilt = true;
      s.drills.units = [newDrill('D')];
      if (withRule) give(s, 'pocketPatience');
      const cap = cellCap(s, m);
      // Far over any richness-scaled "worth the trip" bar, so the BASELINE arm
      // definitely claims — otherwise both arms read false and the test passes
      // by measuring nothing.
      s.face.cells = s.face.cells.map(() => cap * 40);
      // A REAL ore id. The first cut invented one, `oreAt` returned null, and
      // the run threw on `digSec` — which is the fixture guard working: an
      // unrecognised pocket must not quietly behave like plain rock.
      s.face.ore = s.face.cells.map((_, i) => (i === 5 ? 'fatseam' : ''));
      s.face.oreDug = s.face.cells.map((_, i) => (i === 5 ? 1 : 0)); // hand-started
      // ONE SHORT TICK. Four whole seconds finishes the dig (digSec x
      // DRILL_ORE_SPEED) and `oreCell` is deleted on completion, so the claim
      // had already been released by the time it was read — the machine took
      // the pocket and the check said it had not.
      tickDrills(s, m, ctx, 0.2);
      return s.drills.units.some((u) => u.oreCell === 5);
    };
    // Guarded: if the fixture's ore id is wrong neither arm claims and the test
    // would pass by measuring nothing.
    expect(claimed(false)).toBe(true);
    expect(claimed(true)).toBe(false);
  });

  it('heldBreath — a Kiln you close keeps its heat; a starved one does not', () => {
    const heatAfter = (withRule: boolean, feeding: boolean): number => {
      const { s, m } = fresh();
      s.kiln.built = true;
      s.kiln.feeding = feeding;
      s.kiln.heat = 1;
      if (withRule) give(s, 'heldBreath');
      // Feeding with no Dust is STARVATION; feeding=false is the player's hand.
      s.currencies['dust'] = s.currencies['dust']!.mul(0);
      for (let i = 0; i < 60; i++) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        (globalThis as never as Record<string, never>);
        tickKilnRef(s, m, 1);
      }
      return s.kiln.heat;
    };
    expect(heatAfter(false, false)).toBeLessThan(0.5); // closed, no rule: cools
    expect(heatAfter(true, false)).toBe(1);            // closed, proven: holds
    expect(heatAfter(true, true)).toBeLessThan(0.5);   // STARVED, proven: cools
  });
});

// Imported down here so the kiln test above reads as one thought.
import { tickKiln } from '../systems/kiln';
function tickKilnRef(s: GameState, m: ModifierCache, dt: number): void {
  tickKiln(s, m, ctx, dt);
}

describe('PILLAR 2 — a fully proved Reading cannot move the ceiling', () => {
  it('every proposition proved reads the same dpsMax as none', () => {
    const bare = createEngine({ nowMs: 0 }).getState() as GameState;
    const ceiling = dpsMax(bare, new ModifierCache()).toNumber();
    const { s, m } = fresh();
    for (const p of PROPOSITIONS) give(s, p.id);
    for (const n of NOTES) note(s, ctx, n.id);
    m.invalidate();
    expect(dpsMax(s, m).toNumber()).toBeCloseTo(ceiling, 6);
  });

  it('and a proved Reading does not change what one chip pays', () => {
    const paid = (withRules: boolean): number => {
      const { s, m } = fresh();
      if (withRules) for (const p of PROPOSITIONS) give(s, p.id);
      s.face.cells[0] = cellCap(s, m);
      // Crits are the only stochastic term; rank 0 means none.
      return manualChip(s, m, ctx, 0).charge;
    };
    expect(paid(true)).toBeCloseTo(paid(false), 6);
  });
});

describe('OFF THE FLOOR GATES (§10.2)', () => {
  it('nothing in the Reading is consulted by the descent', () => {
    // Structural: the descent path must not read `proven`. A proposition that
    // gates depth is the Optimizer hard-stop §10.2 exists to prevent.
    for (const f of ['src/engine/systems/depthSys.ts', 'src/engine/systems/breach.ts']) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/proven\(/);
    }
  });
});
