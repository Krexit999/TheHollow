/**
 * DISCOVERY BY FORGING — the source the modifier tab was missing.
 *
 * The mechanism was never absent: `applyToolMod` has discovered modifiers since
 * A.59. What was absent was a way IN — that verb needs a built tool and is a
 * deliberate trip to a second bench, so a fresh save saw an empty library and
 * had to spend stone on blind mixes to fill it. These tests pin the second
 * source: forging itself teaches, gated by depth, and it mirrors the ability
 * grammar rather than inventing one.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createEngine } from '..';
import type { EngineCtx, GameState } from '../types';
import { runMigrations, SAVE_VERSION } from '../save/migrations';
import { allShells } from '../shells';
import { materialsOfShell } from '../materials';
import { TRAIT_IDS } from '../traits';
import { PART_TYPES } from '../content/forgeParts';
import { makePart } from '../systems/forgeParts';
import { addMaterial } from '../systems/forge';
import {
  MOD_SHELL_ORDINAL, TOOL_MODS, matchToolMod, pointedAtBy, traitFamilies, traitPointsAt,
} from '../content/toolMods';
import { forgeDiscover, knownMods, modRevealedBy } from '../systems/toolMods';
import { effectOf } from '../systems/toolMining';
import { currentTool } from '../systems/casting';

let engine: ReturnType<typeof createEngine>;
const st = (): GameState => engine.getState() as GameState;
const ctx: EngineCtx = { emit: () => {}, dirty: () => {} };

function ready(reached = 1): void {
  const s = st();
  s.forge.built = true;
  const shells = allShells();
  for (let i = 0; i < reached; i++) s.depthRecords[shells[i]!.id] = 60;
  for (let i = 0; i < reached; i++) {
    for (const m of materialsOfShell(shells[i]!.id)) addMaterial(s, m.id, 60, 400);
  }
  s.casting.knownMods = [];
  s.casting.modFrom = {};
}

beforeEach(() => {
  engine = createEngine({ nowMs: 0 });
});

// ---------------------------------------------------------------------------
// 1 — A TRAIT NAMES A DIRECTION, NEVER A DESTINATION
// ---------------------------------------------------------------------------

describe('a trait says where it leans', () => {
  it('every trait has something to say, or says it has nothing', () => {
    for (const t of TRAIT_IDS) {
      const line = traitPointsAt(t, 7);
      expect(line.length, `${t} said nothing`).toBeGreaterThan(10);
    }
  });

  it('and never names an actual modifier — the list stays unlocked', () => {
    const names = TOOL_MODS.map((m) => m.name);
    for (const t of TRAIT_IDS) {
      const line = traitPointsAt(t, 7);
      for (const n of names) {
        expect(line.includes(n), `${t} named ${n} outright`).toBe(false);
      }
    }
  });

  it('the direction is DERIVED from the registry, not authored beside it', () => {
    /**
     * The guard that matters: if a trait's families were a hand-written table it
     * would drift the first time a modifier changed its signature. So for every
     * trait some modifier demands, the families it reports must be exactly the
     * families of the modifiers that demand it.
     */
    for (const t of TRAIT_IDS) {
      const demanders = TOOL_MODS.filter((m) => (m.needs[t] ?? 0) > 0);
      const fams = traitFamilies(t, 7);
      if (demanders.length === 0) {
        expect(fams, `${t} reports families with no modifier wanting it`).toEqual([]);
      } else {
        expect(fams.length, `${t} is wanted by ${demanders.length} mods and reports nothing`)
          .toBeGreaterThan(0);
      }
    }
  });

  it('and it is gated by depth — a Loam player is told about Loam', () => {
    const shallow = new Set(TRAIT_IDS.flatMap((t) => traitFamilies(t, 1)));
    const deep = new Set(TRAIT_IDS.flatMap((t) => traitFamilies(t, 7)));
    for (const f of shallow) expect(deep.has(f), `${f} vanished with depth`).toBe(true);
    expect(deep.size).toBeGreaterThanOrEqual(shallow.size);
  });
});

// ---------------------------------------------------------------------------
// 2 — POINTING IS LOOSER THAN MAKING, DELIBERATELY
// ---------------------------------------------------------------------------

describe('what a stone points at', () => {
  it('a single stone points at something — the bug that made pouring inert', () => {
    /**
     * THE FIRST CUT USED THE MAKING MATCHER and a fresh save could pour all day
     * without the library moving: one stone pools ONE of each trait, and a
     * modifier wanting `{dense: 2}` is not satisfied by one dense stone. Pouring
     * has to teach on PRESENCE.
     */
    ready(1);
    let taught = 0;
    for (const m of materialsOfShell('loam')) {
      if (pointedAtBy([m.id], { reached: 1 }).length > 0) taught++;
    }
    expect(taught, 'no single Loam stone points at anything').toBeGreaterThan(0);
  });

  it('but pointing at a thing is not being able to make it', () => {
    /**
     * THE SPLIT THIS WHOLE PHASE RESTS ON, asserted rather than described: there
     * must EXIST a stone that teaches you a modifier it cannot on its own become.
     * That is what turns a blind mix into a goal — you learn Heavy Head is out
     * there from one dense stone, and you still have to bring two.
     *
     * (The first version of this test was `expect(points || true).toBe(true)`,
     * which cannot fail. Caught on re-read; it is the exact shape of vacuous
     * assertion this ledger has three rows about.)
     */
    let proved = '';
    outer: for (const sh of allShells()) {
      for (const m of materialsOfShell(sh.id)) {
        const points = pointedAtBy([m.id], { reached: 7 });
        const makes = new Set(
          matchToolMod([m.id], { reached: 7 }) ? [matchToolMod([m.id], { reached: 7 })!.id] : [],
        );
        const teaches = points.find((p) => !makes.has(p.id)
          && Object.values(p.needs).some((n) => n >= 2));
        if (teaches) { proved = `${m.id} teaches ${teaches.id} it cannot alone make`; break outer; }
      }
    }
    expect(proved, 'no stone teaches anything beyond what it can make alone').not.toBe('');
  });

  it('and nothing deeper than the player has been is ever pointed at', () => {
    for (let reached = 1; reached <= allShells().length; reached++) {
      const mats = allShells().slice(0, reached).flatMap((sh) => materialsOfShell(sh.id));
      for (const m of mats.slice(0, 12)) {
        for (const hit of pointedAtBy([m.id], { reached })) {
          expect(MOD_SHELL_ORDINAL[hit.shell]!, `${hit.id} leaked at reach ${reached}`)
            .toBeLessThanOrEqual(reached);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3 — FORGING FILLS THE LIBRARY
// ---------------------------------------------------------------------------

describe('the library fills by forging', () => {
  it('starts empty', () => {
    ready(1);
    expect(knownMods(st())).toEqual([]);
  });

  it('a POUR teaches, and records what taught it', () => {
    ready(1);
    const s = st();
    const stone = materialsOfShell('loam')[0]!.id;
    engine.dispatch({ type: 'chargeCrucible', materialId: stone, units: 30 });
    for (let i = 0; i < 40; i++) engine.tick(0.5);
    const r = engine.dispatch({ type: 'castPart', partType: 'head' });
    expect(r.ok).toBe(true);
    const learned = knownMods(s);
    expect(learned.length, 'the pour taught nothing').toBeGreaterThan(0);
    for (const m of learned) {
      expect(modRevealedBy(s, m.id), `${m.id} has no provenance`).toMatch(/Head/);
    }
  });

  it('ASSEMBLING teaches too, over all seven at once', () => {
    ready(1);
    const s = st();
    const stone = materialsOfShell('loam')[0]!.id;
    let id = 1;
    for (const t of PART_TYPES) {
      const part = { ...makePart(t, stone, 70), id: id++ };
      s.casting.rack.push(part);
      engine.dispatch({ type: 'benchPlace', partId: part.id });
    }
    const r = engine.dispatch({ type: 'buildTool' });
    expect(r.ok).toBe(true);
    expect(knownMods(s).length).toBeGreaterThan(0);
  });

  it('and it never teaches the same thing twice', () => {
    ready(1);
    const s = st();
    const stone = materialsOfShell('loam')[0]!.id;
    const first = forgeDiscover(s, ctx, [stone], 'a test');
    const again = forgeDiscover(s, ctx, [stone], 'a test');
    expect(first.length).toBeGreaterThan(0);
    expect(again, 'a second identical pour re-taught something').toEqual([]);
    expect(new Set(s.casting.knownMods).size).toBe(s.casting.knownMods!.length);
  });

  it('the tab GROWS WITH DESCENT, monotonically', () => {
    let last = 0;
    for (let reached = 1; reached <= allShells().length; reached++) {
      engine = createEngine({ nowMs: 0 });
      ready(reached);
      const s = st();
      for (const sh of allShells().slice(0, reached)) {
        for (const m of materialsOfShell(sh.id)) forgeDiscover(s, ctx, [m.id], 'a probe');
      }
      const n = knownMods(s).length;
      expect(n, `reach ${reached} learned fewer than reach ${reached - 1}`).toBeGreaterThanOrEqual(last);
      last = n;
    }
    expect(last, 'the deepest player still knows almost nothing').toBeGreaterThan(10);
  });

  it('and a shallow player is never taught a deep modifier', () => {
    ready(1);
    const s = st();
    for (const m of materialsOfShell('loam')) forgeDiscover(s, ctx, [m.id], 'a probe');
    for (const known of knownMods(s)) {
      expect(MOD_SHELL_ORDINAL[known.shell]!, `${known.id} leaked into a Loam save`)
        .toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// 4 — PILLAR 2 AND THE SAVE
// ---------------------------------------------------------------------------

describe('discovery changes nothing about the tool', () => {
  it('knowing a modifier does not apply it', () => {
    /**
     * The whole point of the split: the library is KNOWLEDGE. Learning twenty
     * modifiers by pouring must not move the swing by a hair — only the bench
     * seating one does.
     */
    ready(7);
    const s = st();
    s.casting.tool = PART_TYPES.map((t, i) => ({ ...makePart(t, 'marl', 60), id: i + 1 }));
    s.casting.wear = 0;
    s.casting.mods = [];
    const before = effectOf(currentTool(s), false, 1);
    for (const sh of allShells()) {
      for (const m of materialsOfShell(sh.id)) forgeDiscover(s, ctx, [m.id], 'a probe');
    }
    expect(knownMods(s).length).toBeGreaterThan(5);
    expect(effectOf(currentTool(s), false, 1)).toEqual(before);
  });
});

describe('the save', () => {
  it('is at v46 and hands nobody a modifier they did not earn', () => {
    expect(SAVE_VERSION).toBe(46);
    const out = runMigrations({
      version: 45,
      state: { casting: { knownMods: ['longarm'], rack: [], tool: [] } },
    } as never);
    const casting = (out.state as Record<string, unknown>)['casting'] as Record<string, unknown>;
    expect(casting['knownMods'], 'an existing library was altered').toEqual(['longarm']);
    expect(casting['modFrom'], 'provenance was invented for something already known').toEqual({});
  });
});
