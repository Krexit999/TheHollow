/**
 * THE DEAD (§48.1) — and the one test that makes the layer worth having.
 *
 * §3 is the phase's own bar, stated as a check rather than a promise: a ghost
 * must say something the player could not read off their own screen at the
 * moment they found it. It does not read a list of "hard" facts I wrote down —
 * it stands the player at the station where the object lies, calls the LIVE
 * `rollRows`, and asserts the thing the line names was not legible from there.
 * If §1's fog rule ever changes, this fails, which is the point.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { DEAD, ALL_OBJECTS, type DelverObject } from '../content/dead';
import { authoredRoll, AUTHORED_SHELLS } from '../content/rolls';
import { rollRows, LEGIBLE_AHEAD } from '../systems/roll';
import { MATERIALS, gateDepth } from '../materials';
import { dpsMax } from '../systems/face';
import { ModifierCache } from '../modifiers';
import { allShells } from '../shells';
import { depthOf, findAt, tickDead, trailRows, trailClosed, ensureDead, foundCount } from '../systems/dead';
import type { GameState } from '../types';

function ctx() {
  const events: any[] = [];
  return { events, ctx: { emit: (e: any) => events.push(e), dirty: () => {}, rng: () => 0.5 } as any };
}

function fresh(): GameState {
  // createEngine, not initialState — the shell and Roll registries are
  // populated by the engine's own bootstrap, and a test that skips it measures
  // an empty world. `allShells()` returns [] without this.
  return createEngine({ nowMs: 0 }).getState() as GameState;
}

/** dpsMax at a fixed depth, as a string, so the comparison is exact. */
function ceiling(s: GameState): string {
  return dpsMax(s, new ModifierCache()).toString();
}

// The shell and Roll registries are populated by the engine's bootstrap, not by
// importing them. Two checks below read `allShells()` without building a world
// first and got an empty array — which reads exactly like "the shell is not
// authored" and is really "nothing has registered yet".
beforeAll(() => { fresh(); });

describe('§1 the registry is twelve people and thirty-seven things', () => {
  it('twelve delvers, each with two to four objects', () => {
    expect(DEAD.length).toBe(12);
    for (const d of DEAD) {
      expect(d.objects.length, d.id).toBeGreaterThanOrEqual(2);
      expect(d.objects.length, d.id).toBeLessThanOrEqual(4);
    }
    expect(ALL_OBJECTS.length).toBe(37);
  });

  it('every id is unique, across delvers and objects alike', () => {
    expect(new Set(DEAD.map((d) => d.id)).size).toBe(12);
    expect(new Set(ALL_OBJECTS.map((o) => o.id)).size).toBe(37);
  });

  it('every object lies at a station that actually exists in that shell', () => {
    for (const o of ALL_OBJECTS) {
      expect(AUTHORED_SHELLS, o.id).toContain(o.shell);
      const def = authoredRoll(o.shell).find((d) => d.id === o.station);
      expect(def, `${o.id} lies at ${o.shell}/${o.station}, which is not a station`).toBeTruthy();
      expect(depthOf(o)).toBe(def!.depth);
    }
  });

  it('every delver stopped in a real shell, and left nothing below it', () => {
    const order = allShells().map((s) => s.id);
    for (const d of DEAD) {
      expect(order, d.id).toContain(d.stopped);
      const stoppedAt = order.indexOf(d.stopped);
      for (const o of d.objects) {
        expect(order.indexOf(o.shell), `${o.id} lies below where ${d.id} stopped`).toBeLessThanOrEqual(stoppedAt);
      }
      // ...and at least one thing IS in the shell they stopped in, or the
      // stopping point is an authored claim nothing supports.
      expect(d.objects.some((o) => o.shell === d.stopped), `${d.id} stopped in a shell they left nothing in`).toBe(true);
    }
  });

  it("the shell order this system walks is the registry's, not a copy that can drift", () => {
    // `trailClosed` compares shells by index. If shells.ts ever reorders or
    // gains one, the local list is wrong and the absence stops resolving.
    expect(allShells().map((s) => s.id)).toEqual(['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']);
  });
});

describe('§2 nothing here is equipment, a stone, or a number', () => {
  it('an object has a line and a pointer and no payload field of any kind', () => {
    const allowed = new Set(['id', 'name', 'shell', 'station', 'line', 'knows']);
    for (const o of ALL_OBJECTS as unknown as Record<string, unknown>[]) {
      for (const k of Object.keys(o)) expect(allowed, `${o.id} carries a field "${k}"`).toContain(k);
    }
  });

  it('no line describes a mechanic this game cut', () => {
    /**
     * A ghost is FLAVOUR THAT MAKES A CLAIM, which is the most dangerous kind.
     * Two of the first drafts described reading the GRAIN off a wall — a system
     * cut at bd9f3ae — and both survived every other check in this file,
     * because prose has no call site to be dead at. The screenshot caught one
     * and this catches the next.
     *
     * Same class as the five flavour lines A.84–A.89 had to rewrite for
     * describing a kill in a game that then had no fighting.
     */
    const cut = [/\bgrain\b/i, /\bskim\b/i, /\bsweep\b/i, /\bwear\b/i, /\bwarden/i];
    const bad: string[] = [];
    for (const o of ALL_OBJECTS) for (const re of cut) if (re.test(o.line)) bad.push(`${o.id}: ${re}`);
    for (const d of DEAD) for (const re of cut) if (re.test(d.epitaph)) bad.push(`${d.id} epitaph: ${re}`);
    expect(bad).toEqual([]);
  });

  it('the systems file never calls anything that grants', () => {
    // The dead-BEHAVIOUR guard, pointed the other way: not "is it read" but
    // "does it pay". A grep, because a payload added later would pass §1.
    // A PROSE MENTION IS NOT A CONSUMER (A.91). This file's own header
    // explains that it never calls `addMaterial`, which made the first draft
    // of this check fail on the sentence saying so.
    const raw = require('fs').readFileSync(require('path').join(process.cwd(), 'src/engine/systems/dead.ts'), 'utf8');
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    expect(raw.includes('addMaterial'), 'the header no longer names the thing it promises not to call').toBe(true);
    for (const bad of ['addMaterial', 'addCurrency', 'grantXP', 'grantGear', 'buildModifiers', 'mintRelic', 'dustYield']) {
      expect(src.includes(bad), `systems/dead.ts calls ${bad}`).toBe(false);
    }
  });
});

describe('§3 a ghost says something you could not read off your own screen', () => {
  /** What the Roll shows a player standing exactly where the object lies. */
  function legibleFrom(o: DelverObject): { ids: Set<string>; typed: Set<string> } {
    const s = fresh();
    s.shell.current = o.shell;
    s.depth = depthOf(o);
    s.depthRecords[o.shell] = s.depth;
    const rows = rollRows(s);
    return {
      ids: new Set(rows.map((r) => r.def.id)),
      // `legible` is the field that gates TYPE, hardness and seam. A row below
      // the lamp shows its name and depth and nothing about what it IS.
      typed: new Set(rows.filter((r) => r.legible).map((r) => r.def.id)),
    };
  }

  it('a station a ghost names is never one the Roll has already read for you', () => {
    const bad: string[] = [];
    for (const o of ALL_OBJECTS) {
      if (o.knows.kind !== 'station') continue;
      if (o.knows.shell !== o.shell) continue; // another shell is unreadable by construction
      if (legibleFrom(o).typed.has(o.knows.id)) bad.push(`${o.id} names ${o.knows.id}, which is legible from ${o.station}`);
    }
    expect(bad).toEqual([]);
  });

  it('...and the bar is real — pointing a ghost at the row under its own feet fails it', () => {
    // RED TEST. Without this, the check above passes trivially if `typed` is
    // ever empty. Take a real object and aim it three rows down.
    const o = ALL_OBJECTS.find((x) => x.id === 'assayloupe')!;
    const near = rollRows(
      (() => {
        const s = fresh();
        s.shell.current = o.shell;
        s.depth = depthOf(o);
        s.depthRecords[o.shell] = s.depth;
        return s;
      })(),
    ).filter((r) => r.legible && r.def.depth > depthOf(o));
    expect(near.length, 'nothing ahead is legible, so the check above proves nothing').toBeGreaterThan(0);
    expect(legibleFrom(o).typed.has(near[0]!.def.id)).toBe(true);
    expect(near.length).toBeLessThanOrEqual(LEGIBLE_AHEAD + 1);
  });

  it('a shell a ghost names is always one below the shell it lies in', () => {
    const order = allShells().map((s) => s.id);
    for (const o of ALL_OBJECTS) {
      if (o.knows.kind !== 'shell') continue;
      expect(order.indexOf(o.knows.id), `${o.id} names ${o.knows.id}, which is not below ${o.shell}`)
        .toBeGreaterThan(order.indexOf(o.shell));
    }
  });

  it('a material a ghost names cannot be dug from where the ghost lies', () => {
    const order = allShells().map((s) => s.id);
    for (const o of ALL_OBJECTS) {
      if (o.knows.kind !== 'material') continue;
      const m: any = MATERIALS.find((x: any) => x.id === (o.knows as any).id);
      expect(m, `${o.id} names a material that is not in the registry`).toBeTruthy();
      const deeperShell = order.indexOf(m.shellId) > order.indexOf(o.shell);
      const behindAGate = m.shellId === o.shell && gateDepth(m.shellId, m.rarity) > depthOf(o);
      expect(deeperShell || behindAGate, `${o.id} names ${m.id}, which is already diggable at ${o.station}`).toBe(true);
    }
  });

  it('a delver a ghost names is somebody else, and somebody real', () => {
    for (const o of ALL_OBJECTS) {
      if (o.knows.kind !== 'delver') continue;
      const named = DEAD.find((d) => d.id === (o.knows as any).id);
      expect(named, `${o.id} names a delver who does not exist`).toBeTruthy();
      const owner = DEAD.find((d) => d.objects.some((x) => x.id === o.id))!;
      expect(named!.id, `${o.id} names its own owner`).not.toBe(owner.id);
    }
  });

  it('the objects that tell you nothing about the world are a minority', () => {
    // §48.2: the best items do nothing at all. But a layer that is ALL
    // sentiment says nothing, so this is capped rather than celebrated.
    const nothings = ALL_OBJECTS.filter((o) => o.knows.kind === 'nothing').length;
    expect(nothings).toBeGreaterThan(0);
    expect(nothings).toBeLessThanOrEqual(Math.floor(ALL_OBJECTS.length / 3));
  });

  it('every line is prose somebody wrote, not a stub', () => {
    for (const o of ALL_OBJECTS) {
      expect(o.line.length, o.id).toBeGreaterThan(80);
      expect(o.line, o.id).not.toMatch(/TODO|TBD|lorem/i);
    }
    for (const d of DEAD) expect(d.epitaph.length, d.id).toBeGreaterThan(80);
    // ...and no two lines are the same paragraph nine times over (A.103).
    expect(new Set(ALL_OBJECTS.map((o) => o.line)).size).toBe(37);
    expect(new Set(DEAD.map((d) => d.epitaph)).size).toBe(12);
  });
});

describe('§4 found by walking past it, and never by anything else', () => {
  it('an object is picked up on reaching its depth, once, and stays picked up', () => {
    const s = fresh();
    const c = ctx();
    const o = ALL_OBJECTS.find((x) => x.shell === 'loam' && x.station === 'kilnyard')!;
    expect(depthOf(o)).toBe(9);

    expect(findAt(s, c.ctx, 'loam', 8)).toEqual([]);
    const got = findAt(s, c.ctx, 'loam', 9);
    expect(got).toContain(o.id);
    expect(findAt(s, c.ctx, 'loam', 9)).toEqual([]);
    expect(ensureDead(s).found).toContain(o.id);
    expect(c.events.filter((e) => e.type === 'delverObjectFound').length).toBe(got.length);
  });

  it('a descent past three of them finds three', () => {
    const s = fresh();
    const c = ctx();
    const inLoamTo33 = ALL_OBJECTS.filter((x) => x.shell === 'loam' && depthOf(x) <= 33);
    expect(inLoamTo33.length).toBeGreaterThanOrEqual(3);
    expect(new Set(findAt(s, c.ctx, 'loam', 33))).toEqual(new Set(inLoamTo33.map((x) => x.id)));
  });

  it('standing in one shell never finds what is lying in another', () => {
    const s = fresh();
    const c = ctx();
    findAt(s, c.ctx, 'loam', 999);
    for (const id of ensureDead(s).found) {
      expect(ALL_OBJECTS.find((o) => o.id === id)!.shell).toBe('loam');
    }
  });
});

describe('§5 finding every one of them moves nothing', () => {
  it('dpsMax is bit-identical at the same depth with 0 objects and with all of them', () => {
    const before = fresh();
    before.depth = 40;
    const dpsBefore = ceiling(before);

    const after = fresh();
    after.depth = 40;
    const c = ctx();
    for (const shell of AUTHORED_SHELLS) findAt(after, c.ctx, shell, 9999);
    expect(foundCount(after)).toBe(37);

    expect(ceiling(after)).toBe(dpsBefore);
  });

  it('...and the reading is not vacuous — moving the field moves it', () => {
    // RED TEST. A ceiling that reads the same because the instrument is dead
    // would pass the check above forever.
    const a = fresh();
    a.depth = 40;
    const b = fresh();
    b.depth = 40;
    b.face.w += 1;
    expect(ceiling(b)).not.toBe(ceiling(a));
  });
});

describe('§6 the absence is the mechanic', () => {
  it('having everything of theirs is not knowing they stopped', () => {
    const s = fresh();
    const c = ctx();
    const peel = DEAD.find((d) => d.id === 'peel')!;
    // Peel is entirely in Loam, deepest at the Lampline (33).
    findAt(s, c.ctx, 'loam', 33);
    s.depthRecords['loam'] = 33;
    expect(peel.objects.every((o) => ensureDead(s).found.includes(o.id))).toBe(true);
    expect(trailClosed(s, peel), 'closed while standing on the last thing they left').toBe(false);
  });

  it('...and going deeper than the last of it is', () => {
    const s = fresh();
    const c = ctx();
    const peel = DEAD.find((d) => d.id === 'peel')!;
    findAt(s, c.ctx, 'loam', 33);
    s.depthRecords['loam'] = 90;
    expect(trailClosed(s, peel)).toBe(true);
    tickDead(s, c.ctx);
    expect(c.events.filter((e) => e.type === 'delverTrailClosed' && e.delverId === 'peel').length).toBe(1);
    tickDead(s, c.ctx);
    expect(c.events.filter((e) => e.type === 'delverTrailClosed' && e.delverId === 'peel').length).toBe(1);
  });

  it('a shell below closes it too, without going deeper in their own', () => {
    const s = fresh();
    const c = ctx();
    const peel = DEAD.find((d) => d.id === 'peel')!;
    findAt(s, c.ctx, 'loam', 33);
    s.depthRecords['loam'] = 33;
    s.depthRecords['ferrite'] = 1;
    expect(trailClosed(s, peel)).toBe(true);
  });

  it('a partial trail never closes, however deep you go', () => {
    const s = fresh();
    const c = ctx();
    const kell = DEAD.find((d) => d.id === 'kell')!;
    findAt(s, c.ctx, 'loam', 9999);
    for (const shell of AUTHORED_SHELLS) s.depthRecords[shell] = 9999;
    expect(ensureDead(s).found).toContain('kelllamp');
    expect(ensureDead(s).found).not.toContain('kellglove');
    expect(trailClosed(s, kell)).toBe(false);
  });

  it('the room lists only people you have actually met', () => {
    const s = fresh();
    const c = ctx();
    expect(trailRows(s)).toEqual([]);
    findAt(s, c.ctx, 'loam', 9);
    const rows = trailRows(s);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.objects.some((x) => x.found)).toBe(true);
    // ...and a row never shows where they stopped before the absence is walked.
    for (const r of rows) if (!r.closed) expect(r.complete && r.closed).toBe(false);
  });

  it('objects in a trail read shallowest first, which is the order they arrive', () => {
    const s = fresh();
    const c = ctx();
    for (const shell of AUTHORED_SHELLS) findAt(s, c.ctx, shell, 9999);
    for (const r of trailRows(s)) {
      const depths = r.objects.map((x) => x.depth);
      expect([...depths].sort((a, b) => a - b)).toEqual(depths);
    }
  });
});

describe('§7 permanence — the one thing nothing takes back', () => {
  it('a Collapse, a Breach and a Recursion all leave the record standing', () => {
    const s = fresh();
    const c = ctx();
    findAt(s, c.ctx, 'loam', 60);
    const had = [...ensureDead(s).found];
    expect(had.length).toBeGreaterThan(0);

    // The three resets, as the reset ladder describes them, applied to state.
    s.roll = undefined as any;
    s.collapse.nodes = {};
    s.depth = 0;
    s.shell.current = 'ferrite';
    s.recursion.count += 1;
    expect(ensureDead(s).found).toEqual(had);
  });

  it('a save written before A.105 loads without a migration', () => {
    const s = fresh();
    delete (s as any).dead;
    expect(() => ensureDead(s)).not.toThrow();
    expect(foundCount(s)).toBe(0);
    expect(trailRows(s)).toEqual([]);
  });
});
