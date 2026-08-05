/**
 * THE UNTOLD (§47/§49) — six accidents, and the check that each can happen.
 *
 * §2 IS THE ONE THAT MATTERS AND IT IS WHY THIS FILE EXISTS. A discovery whose
 * condition can never be true is the dead-BEHAVIOUR class arriving through a
 * new door: live code, a live tick, and a predicate that is false forever. It
 * bit once already in this very phase — §47's Cinder row asks for the gauge to
 * reach 100 unchoked, and THE GOVERNOR caps unchoked heat at 90. So every
 * condition here is DRIVEN to true from a plausible world, and every one is
 * shown false first.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { EngineCtx, GameState } from '../types';
import { UNTOLD } from '../content/untold';
import {
  ensureUntold, isKnown, progressOf, tickUntold, untoldRows, untoldOpen,
  NEAR_AT, FALLOW_SEC, CHAIN_FOR_BREAK, UNHEARD_SEC,
} from '../systems/untold';
import { MAX_COMPACTION } from '../systems/compaction';
import { GOVERNOR_MAX } from '../systems/pressure';
import { dpsMax } from '../systems/face';
import { ModifierCache } from '../modifiers';
import { allShells } from '../shells';

function events() {
  const seen: any[] = [];
  return { seen, ctx: { emit: (e: any) => seen.push(e), dirty: () => {} } as unknown as EngineCtx };
}

function fresh(shell = 'loam'): GameState {
  const s = createEngine({ nowMs: 0 }).getState() as GameState;
  s.shell.current = shell;
  return s;
}

/** Put the state exactly on `id`'s condition. One arrangement per entry — the
 *  plausible one, not the minimal one. */
function arrange(s: GameState, id: string): void {
  const a = s as GameState & Record<string, any>;
  switch (id) {
    case 'patientcell':
      a.face.compaction = new Array(a.face.w * a.face.h).fill(0);
      a.face.compaction[3] = MAX_COMPACTION;
      a.face.lastHandCell = 3;
      break;
    case 'markedbreak':
      a.polarity.magnets = [2];
      a.polarity.chain = CHAIN_FOR_BREAK;
      break;
    case 'fallowcorner':
      a.growth.fullSince = new Array(a.face.w * a.face.h).fill(0);
      a.growth.fullSince[0] = FALLOW_SEC;
      break;
    case 'darkface':
      a.refraction.beamHarvests = 12;   // the beam HAS run — darkness you made
      a.refraction.mirrors = {};
      a.refraction.path = [];
      break;
    case 'fullgauge':
      a.pressure.choke = true;
      a.pressure.floods = 1;
      break;
    case 'unheardstack':
      a.hollow.silence = 5;
      a.hollow.listenAt = 0;
      a.stats.playTimeSec = UNHEARD_SEC;
      break;
    default:
      throw new Error(`no arrangement for ${id}`);
  }
}

beforeAll(() => { fresh(); });

describe('§1 six, one per shell, and Aleph is CUT rather than stubbed', () => {
  it('every entry names a shell that exists, and no shell carries two', () => {
    const ids = allShells().map((x) => x.id);
    const shells = UNTOLD.map((u) => u.shell);
    for (const sh of shells) expect(ids).toContain(sh);
    expect(new Set(shells).size).toBe(shells.length);
  });

  it('Aleph has none, and that is a cut with a reason, not an omission', () => {
    expect(UNTOLD.some((u) => u.shell === 'aleph')).toBe(false);
    // The blocker, asserted so it fails the day it dissolves ("a cut is
    // provisional, and its reason can dissolve"). AlephState is two fields; if
    // it grows one the shell has something that can be fumbled.
    const s = fresh('aleph');
    expect(Object.keys(s.aleph).sort()).toEqual(['coreTouched', 'sigils']);
  });

  it('every entry is prose, and points at a destination rather than a recipe', () => {
    for (const u of UNTOLD) {
      expect(u.did.length, u.id).toBeGreaterThan(40);
      expect(u.points.length, u.id).toBeGreaterThan(120);
      expect(u.tell.length, u.id).toBeGreaterThan(30);
      // LAW 3: no recipe words. A secret that says what to build is a quest.
      expect(u.points, u.id).not.toMatch(/\brecipe\b|\bcraft\b|\bcosts?\b \d|\bbuy\b/i);
    }
    expect(new Set(UNTOLD.map((u) => u.tell)).size).toBe(UNTOLD.length);
    expect(new Set(UNTOLD.map((u) => u.points)).size).toBe(UNTOLD.length);
  });
});

describe('§2 every condition can actually become true', () => {
  for (const u of UNTOLD) {
    it(`${u.id}: false in a fresh ${u.shell}, true once arranged`, () => {
      const s = fresh(u.shell);
      expect(progressOf(s, u), `${u.id} starts satisfied — the condition is vacuous`).toBeLessThan(1);
      arrange(s, u.id);
      expect(progressOf(s, u), `${u.id} cannot be reached from a plausible world`).toBeGreaterThanOrEqual(1);
    });
  }

  it('THE GOVERNOR is why the Cinder row is not the one §47 wrote', () => {
    /**
     * The finding, kept as a check. §47 asks for heat at exactly 100 with the
     * choke never touched; `GOVERNOR_MAX` is the ceiling on unchoked heat and
     * it is below the flood line. If this ever passes 100, §47's original row
     * becomes buildable and this cut dissolves.
     */
    expect(GOVERNOR_MAX).toBeLessThan(100);
    const s = fresh('cinder');
    (s as any).pressure.choke = false;
    (s as any).pressure.heat = GOVERNOR_MAX;
    (s as any).pressure.floods = 0;
    const cinder = UNTOLD.find((u) => u.shell === 'cinder')!;
    expect(progressOf(s, cinder), 'an unchoked gauge at the Governor ceiling satisfies nothing').toBe(0);
  });

  it('owning the Floodgate disqualifies the Cinder accident', () => {
    const s = fresh('cinder');
    arrange(s, 'fullgauge');
    expect(progressOf(s, UNTOLD.find((u) => u.id === 'fullgauge')!)).toBe(1);
    (s.roll as any).floodgate = true;
    expect(progressOf(s, UNTOLD.find((u) => u.id === 'fullgauge')!), 'you cannot stumble into a thing you bought').toBe(0);
  });
});

describe('§3 the tell fires before the thing, once, and names nothing', () => {
  it('a near miss says one strange line and does not repeat', () => {
    const s = fresh('verdance');
    const e = events();
    (s as any).growth.fullSince = new Array(s.face.w * s.face.h).fill(0);
    (s as any).growth.fullSince[0] = FALLOW_SEC * NEAR_AT;
    tickUntold(s, e.ctx);
    const told = e.seen.filter((x) => x.type === 'untoldTell');
    expect(told.length).toBe(1);
    expect(isKnown(s, 'fallowcorner'), 'the tell handed over the discovery').toBe(false);
    tickUntold(s, e.ctx);
    expect(e.seen.filter((x) => x.type === 'untoldTell').length).toBe(1);
  });

  it('...and the line names nothing it is about', () => {
    for (const u of UNTOLD) {
      const words = u.name.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      for (const w of words) expect(u.tell.toLowerCase(), `${u.id}'s tell says "${w}"`).not.toContain(w);
    }
  });

  it('a tell never fires for a shell you are not standing in', () => {
    const s = fresh('loam');
    const e = events();
    arrange(s, 'fullgauge');   // Cinder's condition, satisfied, in Loam
    tickUntold(s, e.ctx);
    expect(e.seen).toEqual([]);
    expect(isKnown(s, 'fullgauge')).toBe(false);
  });

  it('the beat finds it, once, and it stays found', () => {
    const s = fresh('loam');
    const e = events();
    arrange(s, 'patientcell');
    tickUntold(s, e.ctx);
    expect(isKnown(s, 'patientcell')).toBe(true);
    expect(e.seen.filter((x) => x.type === 'untoldFound').length).toBe(1);
    tickUntold(s, e.ctx);
    expect(e.seen.filter((x) => x.type === 'untoldFound').length).toBe(1);
    // ...and the condition going away does not take it back.
    (s as any).face.compaction[3] = 0;
    tickUntold(s, e.ctx);
    expect(isKnown(s, 'patientcell')).toBe(true);
  });
});

describe('§4 knowing all six moves nothing', () => {
  it('dpsMax is identical at one depth with none known and with all', () => {
    const a = fresh();
    a.depth = 40;
    const m = new ModifierCache();
    const before = String(dpsMax(a, m));
    ensureUntold(a).known = UNTOLD.map((u) => u.id);
    m.invalidate();
    expect(String(dpsMax(a, m))).toBe(before);
  });

  it('...and the reading is not dead — widening the face moves it', () => {
    const a = fresh();
    a.depth = 40;
    const m = new ModifierCache();
    const before = String(dpsMax(a, m));
    a.face.w += 1;
    m.invalidate();
    expect(String(dpsMax(a, m))).not.toBe(before);
  });

  it('the systems file never calls anything that grants', () => {
    const raw = require('fs').readFileSync(require('path').join(process.cwd(), 'src/engine/systems/untold.ts'), 'utf8');
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    for (const bad of ['addMaterial', 'addCurrency', 'grantXP', 'grantGear', 'mintRelic']) {
      expect(src.includes(bad), `systems/untold.ts calls ${bad}`).toBe(false);
    }
  });
});

describe('§5 the record is never a locked list', () => {
  it('nothing known means no room and no rows', () => {
    const s = fresh();
    expect(untoldOpen(s)).toBe(false);
    expect(untoldRows(s)).toEqual([]);
  });

  it('one known means exactly one row — never six with five greyed', () => {
    const s = fresh();
    ensureUntold(s).known = ['patientcell'];
    const rows = untoldRows(s);
    expect(rows.length).toBe(1);
    expect(rows[0]!.def.id).toBe('patientcell');
  });

  it('a save written before A.105 loads without a migration', () => {
    const s = fresh();
    delete (s as any).untold;
    expect(() => ensureUntold(s)).not.toThrow();
    expect(untoldRows(s)).toEqual([]);
  });
});
