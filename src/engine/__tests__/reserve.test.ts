/**
 * RESERVE (§25.5) — "any stack marked reserved in one tap is untouchable".
 *
 * The assertion that carries this is the ENUMERATION. A safety primitive that
 * eleven machines honour and one does not is worse than none, because it reads
 * as protection — which is exactly what A.85 shipped: `qol.pins` was checked in
 * one act of one machine and ignored by the other thirteen.
 *
 * So the table below is the test. Every consumer that eats named stock appears
 * in it, each is driven with a reserved stack, and each must refuse BY NAME.
 * The last test in the file is the one that keeps it honest: it greps for
 * machine blockers that take a material and are not in the table.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createEngine } from '../index';
import { ModifierCache } from '../modifiers';
import { dpsMax } from '../systems/face';
import { addMaterial } from '../systems/forge';
import { isReserved, reservedBlocker, toggleReserve, unreserved } from '../systems/reserve';
import type { GameState } from '../types';

const ctx = () => ({ emit: () => {}, dirty: () => {} }) as never;

function fresh(): GameState {
  return createEngine({ nowMs: 0 }).getState() as GameState;
}

/** A Hold with a stack of marl in it, and every machine standing. */
function stocked(): GameState {
  const s = fresh();
  (s.plant ??= { tiers: {}, builtOf: {} } as never);
  for (const m of [
    'crusher', 'washer', 'refinery', 'centrifuge', 'still', 'infuser', 'press',
    'balance', 'retort', 'witness', 'crucible', 'sieve', 'line',
  ]) s.plant!.tiers[m] = 3;
  s.forge.built = true;                    // the tub only takes stock at a lit floor
  addMaterial(s, 'marl', 50, 40);
  return s;
}

/**
 * EVERY CONSUMER THAT EATS NAMED STOCK. One row per machine, each calling the
 * machine's OWN blocker — not a shared helper — so the test proves the guard is
 * wired at each site rather than that the helper works.
 */
const CONSUMERS: Array<{
  name: string;
  blocker: (s: GameState, materialId: string) => Promise<string | null>;
}> = [
  {
    name: 'the Crusher',
    blocker: async (s, id) => {
      const { crush } = await import('../systems/crusher');
      return crush(s, ctx(), id, 'poor').reason ?? null;
    },
  },
  {
    name: 'the Washer',
    blocker: async (s, id) => (await import('../systems/washer')).washBlocker(s, id, 'poor'),
  },
  {
    name: 'the Centrifuge',
    blocker: async (s, id) => (await import('../systems/centrifuge')).spinBlocker(s, id, 'poor'),
  },
  {
    name: 'the Still',
    blocker: async (s, id) => (await import('../systems/still')).distilBlocker(s, id, 'poor', 'keen'),
  },
  {
    name: 'the Infuser',
    blocker: async (s, id) => (await import('../systems/infuser'))
      .infuseBlocker(s, { trait: 'keen', purity: 50 } as never, id, 'poor'),
  },
  {
    name: 'the Press',
    blocker: async (s, id) => (await import('../systems/press')).pressBlocker(s, id, 'poor', 'plate'),
  },
  {
    name: 'the Balance',
    blocker: async (s, id) => (await import('../systems/balance')).balanceBlocker(s, id, 'grit', 1),
  },
  {
    name: 'the Retort',
    blocker: async (s, id) => (await import('../systems/retort')).reduceBlocker(s, id, 'poor'),
  },
  {
    name: 'the Witness',
    blocker: async (s, id) => (await import('../systems/witness')).witnessBlocker(s, id, 'poor', 'grit'),
  },
  {
    name: 'the Crucible',
    blocker: async (s, id) => (await import('../systems/crucible'))
      .pourBlocker(s, [{ materialId: id, count: 2 }]),
  },
  {
    name: 'the crucible tub (the melt)',
    blocker: async (s, id) => {
      const { chargeCrucible } = await import('../systems/casting');
      return chargeCrucible(s, ctx(), id, 1).reason ?? null;
    },
  },
];

describe('one tap, and it is untouchable', () => {
  it('the tap reserves, and the same tap releases — no cost either way', () => {
    const s = fresh();
    const purse = () => JSON.stringify(
      Object.entries(s.currencies).map(([k, v]) => [k, v.toString()]).sort());
    const before = purse();
    expect(isReserved(s, 'marl')).toBe(false);
    expect(toggleReserve(s, 'marl')).toBe(true);
    expect(isReserved(s, 'marl')).toBe(true);
    expect(toggleReserve(s, 'marl')).toBe(false);
    expect(isReserved(s, 'marl')).toBe(false);
    // LAW 9 — a reserve that costs to set is a toll.
    expect(purse()).toBe(before);
  });

  it('the refusal names the stone and the way out', () => {
    const s = fresh();
    expect(reservedBlocker(s, 'marl')).toBeNull();
    toggleReserve(s, 'marl');
    const said = reservedBlocker(s, 'marl')!;
    expect(said).toContain('Marl');
    expect(said).toMatch(/Tap it in the Hold/);
  });
});

describe('EVERY consumer refuses a reserved stack, by name', () => {
  for (const consumer of CONSUMERS) {
    it(`${consumer.name} refuses`, async () => {
      const s = stocked();
      // FREE FIRST — whatever it says about a free stack, it is not about the
      // reserve. Without this arm a machine that refuses everything would pass.
      const free = await consumer.blocker(s, 'marl');
      expect(free ?? '').not.toMatch(/is reserved/);

      toggleReserve(s, 'marl');
      const held = await consumer.blocker(s, 'marl');
      expect(held, `${consumer.name} did not refuse a reserved stack`).toBeTruthy();
      expect(held!).toMatch(/Marl is reserved/);
    });
  }

  it('...and the table covers every machine blocker that names a material', () => {
    /**
     * THE GUARD ON THE GUARD. A new machine that takes a `materialId` and does
     * not ask about the reserve is exactly the A.85 failure returning, so the
     * table above cannot be allowed to go stale by omission.
     */
    const dir = join('src', 'engine', 'systems');
    const missing: string[] = [];
    let checked = 0;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      // A blocker whose second parameter is a material id.
      const re = /export function (\w*[Bb]locker)\(\s*state: GameState,\s*(materialId|fromId)\b/g;
      for (const m of src.matchAll(re)) {
        checked += 1;
        if (!src.includes('reservedBlocker') && !src.includes('anyReserved')) {
          missing.push(`${f}:${m[1]}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(5);      // it really found blockers
    expect(missing, 'machine blockers that never ask about the reserve').toEqual([]);
  });
});

describe('automation never picks one up in the first place', () => {
  it('the Crusher picker skips a reserved stack rather than failing on it', async () => {
    const { crushable } = await import('../systems/crusher');
    const s = stocked();
    expect(crushable(s).some((c) => c.materialId === 'marl')).toBe(true);
    toggleReserve(s, 'marl');
    expect(crushable(s).some((c) => c.materialId === 'marl')).toBe(false);
  });

  it('...which is what keeps the Circuit from spending its cycle refusing', async () => {
    const { ACTS } = await import('../systems/circuit');
    const run = ACTS.find((a) => a.id === 'run' && a.machine === 'crusher')!;
    const s = stocked();
    toggleReserve(s, 'marl');
    // Nothing else is in the Hold, so the act declines cleanly rather than
    // throwing or burning Surge on a stack it may not have.
    expect(run.apply(s, ctx(), new ModifierCache())).toBe(false);
  });

  it('the picker helper is generic and red-tested', () => {
    const s = fresh();
    const rows = [{ materialId: 'marl' }, { materialId: 'grit' }];
    expect(unreserved(s, rows)).toHaveLength(2);
    toggleReserve(s, 'marl');
    expect(unreserved(s, rows).map((r) => r.materialId)).toEqual(['grit']);
  });
});

describe('the pin is REPLACED, not doubled', () => {
  it('there is exactly one reserve array, and only reserve.ts writes it', () => {
    const dir = join('src', 'engine');
    const writers: string[] = [];
    const walk = (d: string): void => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) {
          if (e.name === '__tests__') continue;
          walk(p);
        } else if (/\.ts$/.test(e.name) && e.name !== 'reserve.ts') {
          const src = readFileSync(p, 'utf8');
          // A write into the pins array anywhere but reserve.ts.
          if (/pins\.(push|splice)\(/.test(src)) writers.push(p);
        }
      }
    };
    walk(dir);
    expect(writers, 'only reserve.ts may write the reserve list').toEqual([]);
  });

  it('and no second flag was added beside it', () => {
    const src = readFileSync(join('src', 'engine', 'types.ts'), 'utf8');
    // A `reserved` array on QolState would be the second flag the brief forbids.
    expect(/reserved\??:\s*string\[\]/.test(src)).toBe(false);
  });

  it('the Circuit no longer reaches into qol for it', () => {
    // CODE, NOT PROSE. The first version of this failed on the file's own
    // comment explaining what A.85 used to do — the same trap the crews guard
    // hit at A.99, which is twice now that a grep has caught a sentence.
    const code = readFileSync(join('src', 'engine', 'systems', 'circuit.ts'), 'utf8')
      .split('\n')
      .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l));
    expect(code.some((l) => /qol\??\.pins/.test(l))).toBe(false);
  });
});

describe('PILLAR 2 — a reserve withholds and never produces', () => {
  it('a fully reserved Hold does not move the ceiling, at the SAME depth', () => {
    const mods = new ModifierCache();
    const bare = stocked();
    bare.depth = 30;
    mods.invalidate();
    const before = dpsMax(bare, mods).toNumber();

    const s = stocked();
    s.depth = 400;
    for (const id of Object.keys(s.materials.stacks)) toggleReserve(s, id);
    expect(s.qol.pins.length).toBeGreaterThan(0);   // it really reserved something
    s.depth = 30;                                    // THE SAME DEPTH BOTH ARMS
    mods.invalidate();
    expect(dpsMax(s, mods).toNumber()).toBe(before);

    // RED ARM: the instrument can see a ceiling move.
    s.upgrades['blade'] = 1;
    mods.invalidate();
    expect(dpsMax(s, mods).toNumber()).not.toBe(before);
  });

  it('reserving grants nothing — no currency, no stack, no drop', () => {
    const s = stocked();
    const shot = () => JSON.stringify({
      c: Object.entries(s.currencies).map(([k, v]) => [k, v.toString()]).sort(),
      m: s.materials.stacks,
      d: s.materials.totalDrops,
    });
    const before = shot();
    for (const id of Object.keys(s.materials.stacks)) toggleReserve(s, id);
    expect(shot()).toBe(before);
  });

  it('and the module has no route to a currency or the face', () => {
    const src = readFileSync(join('src', 'engine', 'systems', 'reserve.ts'), 'utf8');
    for (const forbidden of ['addCurrency(', 'addMaterial(', 'spendCurrency(', 'state.face']) {
      expect(src.includes(forbidden), `reserve.ts must not reach ${forbidden}`).toBe(false);
    }
  });
});
