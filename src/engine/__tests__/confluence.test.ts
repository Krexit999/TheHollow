/**
 * CONFLUENCES — the cross-system layer.
 *
 * The interesting tests here are not "does the bonus apply" but the two
 * PROPERTIES that make a cross-system bonus safe to ship:
 *
 *   - it is a bonus for having both, NEVER a requirement to have both;
 *   - it pays only while its condition holds, so finding one is not a
 *     permanent tax on everyone who has not found it.
 *
 * Plus the usual reachability question the project learned the hard way: is
 * anything actually CALLING the notice function.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createEngine } from '../index';
import type { GameState } from '../types';
import {
  CONFLUENCES, CONFLUENCE_BY_ID, activeConfluences, confluenceBonus, noticeConfluences,
  type ConfluenceDef,
} from '../systems/confluence';
import { ModifierCache, computeBucket, isBucket } from '../modifiers';
import { isOre, plantOre } from '../systems/ores';
import { CLUSTERS } from '../../ui/nav';
import { allShells } from '../shells';

const fresh = () => {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState };
};
const ctx = { emit: () => {}, dirty: () => {} };

describe('confluences are well-formed', () => {
  it('every one is authored, targets a real bucket, and names two systems', () => {
    for (const c of CONFLUENCES) {
      expect(c.name.length, c.id).toBeGreaterThan(3);
      expect(c.flavor.length, c.id).toBeGreaterThan(40);
      expect(isBucket(c.bucket), `${c.id} → '${c.bucket}'`).toBe(true);
      expect(c.systems.length, c.id).toBe(2);
      expect(c.systems[0], c.id).not.toBe(c.systems[1]);
      expect(c.bonus, c.id).toBeGreaterThan(0);
    }
  });

  it('ids are unique', () => {
    expect(CONFLUENCE_BY_ID.size).toBe(CONFLUENCES.length);
  });

  // A confluence that quietly doubles something is not a bonus, it is a
  // balance change wearing a costume. Ceiling-moving buckets stay modest.
  it('no single confluence is worth more than +40%', () => {
    for (const c of CONFLUENCES) {
      expect(c.bonus, `${c.id} pays +${c.bonus}`).toBeLessThanOrEqual(0.4);
    }
  });
});

describe('a confluence is a bonus for having both, never a requirement', () => {
  it('a fresh state has none active and the game still works', () => {
    const { engine, s } = fresh();
    expect(activeConfluences(s)).toHaveLength(0);
    for (let i = 0; i < 30; i++) engine.tick(1);
    expect(engine.getState().confluences.found).toHaveLength(0);
    /**
     * THE FACE STILL PAYS — nothing is gated behind a confluence.
     *
     * CHIP A CELL VERIFIED TO BE PLAIN ROCK, not cell 0. This asserted cell 0
     * and flaked for the whole life of the project: `tickOres` runs on
     * `Math.random` every tick, so across 30 simulated seconds it can seed a
     * pocket anywhere on the face including cell 0, and a pocket CORRECTLY
     * refuses an ordinary chip (you hold it to work it out, or a drill opens
     * it). The failure was the ore system behaving exactly as designed and the
     * test naming a cell it had no claim on.
     *
     * Picking the cell by inspection rather than seeding the RNG keeps the test
     * on the real tick path — a seeded run would also stop exercising the ore
     * spawn it is meant to coexist with.
     */
    const st = engine.getState() as GameState;
    const plain = st.face.cells.findIndex((_, i) => !isOre(st, i));
    expect(plain, 'the face cannot be entirely pocket — the cap forbids it').toBeGreaterThanOrEqual(0);
    expect(engine.dispatch({ type: 'chip', cell: plain }).ok).toBe(true);
  });

  /**
   * THE FLAKE, PINNED. The test above passed ~4 runs in 5 for the whole life of
   * the project and nobody could name the cause, because reproducing it meant
   * winning the ore lottery on cell 0. This states the mechanism directly and
   * deterministically, so the next person who sees that test fail has the
   * answer in the file rather than a coin-flip to re-run.
   *
   * A pocket refusing an ordinary chip is CORRECT (you hold it to work it out,
   * or a drill opens it) — the bug was ever asserting on a fixed index.
   */
  it('a pocket refuses an ordinary chip — which is why cell 0 was never a safe assertion', () => {
    const { engine, s: st } = fresh();
    for (let i = 0; i < st.face.cells.length; i++) st.face.cells[i] = 8;
    // Through the real spawn path, not by writing the array.
    expect(plantOre(st, new ModifierCache(), ctx, 0)).toBe(true);
    expect(isOre(st, 0)).toBe(true);
    expect(engine.dispatch({ type: 'chip', cell: 0 }).ok).toBe(false);
    // ...and a plain cell on the same face pays perfectly well.
    const plain = st.face.cells.findIndex((_: number, i: number) => !isOre(st, i));
    expect(engine.dispatch({ type: 'chip', cell: plain }).ok).toBe(true);
  });

  it('every bucket a confluence touches sits at its NEUTRAL value with none active', () => {
    const { s } = fresh();
    for (const c of CONFLUENCES) {
      expect(confluenceBonus(s, c.bucket)).toBe(0);
    }
    // And the pipeline agrees: an unfound confluence costs nothing.
    expect(computeBucket(s, 'dustYield').toNumber()).toBeGreaterThan(0);
  });

  // The constraint from the brief, as a property: nothing anywhere in the
  // engine may READ confluences to decide whether something is allowed.
  // A confluence may only ever add.
  it('nothing gates on a confluence — the module is read for bonuses only', () => {
    const root = join(__dirname, '..');
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) { if (entry !== '__tests__') walk(p); continue; }
        if (!entry.endsWith('.ts')) continue;
        const src = readFileSync(p, 'utf8');
        if (p.includes('confluence.ts')) continue;
        // A gate would look like `confluences.found.includes(...)` guarding an
        // action, or an `if` on activeConfluences. Bonus reads go through
        // confluenceBonus, which is registered into the modifier pipeline.
        if (/confluences\.found\.includes|if\s*\(\s*activeConfluences/.test(src)) {
          hits.push(p.slice(root.length + 1));
        }
      }
    };
    walk(root);
    expect(hits, `these files gate behaviour on a confluence: ${hits.join(', ')}`).toEqual([]);
  });
});

describe('a confluence pays only while it holds', () => {
  it('found is a record, not a retainer', () => {
    const { s } = fresh();
    // Force one true: salvaged tools plus refined finds.
    s.forge.salvaged = 3;
    s.refinery.found = ['a', 'b'];
    const live = activeConfluences(s).map((c) => c.id);
    expect(live).toContain('nothingWasted');
    expect(confluenceBonus(s, 'brickYield')).toBeGreaterThan(0);

    noticeConfluences(s, ctx);
    expect(s.confluences.found).toContain('nothingWasted');

    // Take the salvage away: still FOUND, no longer PAYING.
    s.forge.salvaged = 0;
    expect(s.confluences.found).toContain('nothingWasted');
    expect(confluenceBonus(s, 'brickYield')).toBe(0);
  });

  it('records each one once', () => {
    const { s } = fresh();
    s.forge.salvaged = 3;
    s.refinery.found = ['a', 'b'];
    noticeConfluences(s, ctx);
    noticeConfluences(s, ctx);
    noticeConfluences(s, ctx);
    expect(s.confluences.found.filter((id) => id === 'nothingWasted')).toHaveLength(1);
  });

  it('survives a state slice that is mid-migration rather than throwing the tick', () => {
    const { s } = fresh();
    // A v12 save being read before its slices hydrate.
    delete (s as unknown as Record<string, unknown>)['runes'];
    expect(() => activeConfluences(s)).not.toThrow();
  });
});

describe('confluences are reachable', () => {
  // The Phase 13 lesson: a test that a function works is not a test that
  // anything calls it.
  it('the engine tick calls noticeConfluences', () => {
    const src = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');
    expect(src).toMatch(/noticeConfluences\(state, ctx\)/);
  });

  it('the modifiers are registered at content load', () => {
    const src = readFileSync(join(__dirname, '..', 'content', 'index.ts'), 'utf8');
    expect(src).toMatch(/registerConfluenceModifiers\(\)/);
  });

  it('every system a confluence names really exists', () => {
    // Three legitimate vocabularies, each checked against its own registry so
    // a TYPO in any of them still fails:
    //   - rooms, from nav.ts
    //   - shell SIGNATURES, from the shell content (polarity, growth, ...)
    //   - a short list of mechanics that are real but are not rooms
    const rooms = new Set(CLUSTERS.flatMap((c) => c.systems).map((s) => String(s.id)));
    const signatures = new Set(allShells().map((sh) => sh.signatureId).filter(Boolean) as string[]);
    // 'forge' JOINED THIS LIST AT A.71, and it belongs here rather than in the
    // room set: the Forge TAB was retired (its tool shelf folded into the
    // Refinery, its gear bench became its own room), but the forged TOOL is
    // still a real mechanic — `state.forge.tools`, its alloys and its runes —
    // and that is what all five of these confluences actually read. Relabelling
    // them to a room whose condition they do not check would have been the
    // wrong repair: the name was never a room, it was a thing you own.
    const mechanics = new Set(['gems', 'combat', 'weather', 'forge']);
    for (const c of CONFLUENCES) {
      for (const sys of c.systems) {
        expect(
          rooms.has(sys) || signatures.has(sys) || mechanics.has(sys),
          `confluence '${c.id}' names unknown system '${sys}'`,
        ).toBe(true);
      }
    }
  });

  // The whole point is PAIRS. The failure this guards against is not a hub
  // system — runes touches everything, legitimately — but the same two systems
  // paired twice, which is one bonus with two names.
  /**
   * A pair may appear TWICE — lattice×weather legitimately has two entries for
   * two different weathers, and runes×crucible has a small and a large version.
   * What it may not do is appear twice with the SAME BUCKET, which would be one
   * bonus with two names, or three times at all.
   */
  it('a pair is never reused for the same effect', () => {
    const byPair = new Map<string, ConfluenceDef[]>();
    for (const c of CONFLUENCES) {
      const key = [...c.systems].sort().join('+');
      byPair.set(key, [...(byPair.get(key) ?? []), c]);
    }
    for (const [pair, list] of byPair) {
      expect(list.length, `${pair} is used ${list.length} times: ${list.map((c) => c.id).join(', ')}`)
        .toBeLessThanOrEqual(2);
      const buckets = new Set(list.map((c) => c.bucket));
      expect(
        buckets.size,
        `${pair} pays into the same bucket twice — that is one bonus with two names`,
      ).toBe(list.length);
    }
  });

  it('the layer is spread across the game', () => {
    const involved = new Map<string, number>();
    for (const c of CONFLUENCES) {
      for (const sys of c.systems) involved.set(sys, (involved.get(sys) ?? 0) + 1);
    }
    // A.72 cut the Verdance/Glassmere/Cinder craft-system producers (and
    // weather), which took eleven confluences with them; the speed-run cut
    // (A.7x) took 'temperedGrammar' and 'setInAlloy' (both named the now-gone
    // crucible) on top of that — the coverage floor shrank along with the
    // layer it measures.
    expect(involved.size).toBeGreaterThanOrEqual(7);
    // A hub may be busy, but never more than a bit over half of a now much
    // smaller layer — refinery/forge picked up relative share as the
    // craft-system and crucible confluences around them were cut.
    const busiest = Math.max(...involved.values());
    expect(busiest / CONFLUENCES.length, 'one system dominates the layer').toBeLessThanOrEqual(0.6);
  });
});
