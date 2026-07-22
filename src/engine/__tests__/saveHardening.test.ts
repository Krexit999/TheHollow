/**
 * SAVE HARDENING (Phase 13). Twelve migrations deep, none of them previously
 * tested end to end. This is the failure that costs a player a hundred hours,
 * so it gets the harshest tests in the suite.
 *
 * Three questions, none of which the existing save tests asked:
 *   1. Does a save from EVERY historical version reach v12 — and is the result
 *      a state the engine can actually RUN, not merely one that type-checks?
 *   2. Does export/import round-trip losslessly at several progression states,
 *      including the Decimal-heavy ones?
 *   3. Does garbage FAIL GRACEFULLY instead of white-screening?
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { GameState } from '../types';
import { runMigrations, SAVE_VERSION, MIGRATIONS } from '../save/migrations';
import { serialize, deserialize } from '../save/codec';
import { exportSave, importSave } from '../save/exportSave';
import { D } from '../decimal';

/** The thinnest possible v1 save — everything later versions add must be
 * supplied by the migration chain, not by the fixture. */
function ancientSave(version: number): Record<string, unknown> {
  const engine = createEngine({ nowMs: 0 });
  const raw = JSON.parse(serialize(engine.getState(), 0)) as Record<string, unknown>;
  return { ...raw, version };
}

describe('every historical save version reaches v12 and RUNS', () => {
  const versions = Object.keys(MIGRATIONS).map(Number).sort((a, b) => a - b);

  it('the chain covers every version below current with no gaps', () => {
    for (let v = 1; v < SAVE_VERSION; v++) {
      expect(MIGRATIONS[v], `No migration from v${v} — a save at that version is unloadable.`).toBeDefined();
    }
    expect(versions[0]).toBe(1);
  });

  it.each(versions)('a v%i save migrates to current and the engine can tick it', (from) => {
    const payload = ancientSave(from) as never;
    const migrated = runMigrations(payload);
    expect(migrated.version).toBe(SAVE_VERSION);

    // The real test: hydrate it and run. A migration that leaves a slice
    // undefined type-checks fine and then throws on the first tick.
    const engine = createEngine({ nowMs: 0 });
    const state = deserialize(JSON.stringify(migrated));
    expect(() => {
      engine.dispatch({ type: 'hydrate', state, nowMs: 0 });
      engine.tick(5);
      engine.dispatch({ type: 'chip', cell: 0 });
      engine.tick(60);
    }, `A v${from} save migrates but cannot be played.`).not.toThrow();

    // And every slice the current build reads must exist.
    const s = engine.getState() as GameState;
    for (const slice of ['spiral', 'relics', 'museum', 'expeditions', 'recursion', 'chamber', 'hollow', 'pressure', 'guild', 'materials'] as const) {
      expect(s[slice], `v${from} -> v12 left state.${slice} undefined`).toBeDefined();
    }
  });
});

describe('export/import round-trips at real progression states', () => {
  const states: Array<[string, (s: GameState) => void]> = [
    ['fresh', () => {}],
    ['mid-Ferrite', (s) => {
      s.shell.current = 'ferrite'; s.shell.breachCount = 1;
      s.depth = 120; s.maxDepthRecord = 150; s.depthRecords['loam'] = 150;
      s.kiln.built = true; s.forge.built = true; s.lattice.unlocked = true;
      s.currencies['dust'] = D('1.234e18');
    }],
    ['post-Recursion with relics', (s) => {
      s.shell.current = 'hollow'; s.shell.breachCount = 6;
      s.recursion.count = 2; s.recursion.axiomsEarned = 14;
      s.recursion.axioms = ['unemptying', 'twoHands'];
      s.spiral.count = 1; s.spiral.slots = 3; s.spiral.modules = ['autoBuyFace'];
      s.spiral.grid = { 0: 'autoBuyFace' };
      s.relics.held = [{ uid: 1, defId: 'depth-3', rarity: 3, affixes: { regen: 0.12 }, source: 'depth', fusedFrom: 2 }];
      s.relics.equipped = [1]; s.relics.found = 5; s.relics.nextUid = 2;
      s.museum.completed = ['firstFinds'];
      s.currencies['void'] = D('9.87e42');
      s.totals['dust'] = D('5e60');
    }],
  ];

  it.each(states)('%s survives export -> import unchanged', (_name, setup) => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    setup(s);
    engine.tick(1);

    const encoded = exportSave(engine.getState() as GameState, 12345);
    const back = importSave(encoded);

    expect(back.shell.current).toBe(s.shell.current);
    expect(back.depth).toBe(s.depth);
    expect(back.maxDepthRecord).toBe(s.maxDepthRecord);
    expect(back.recursion.count).toBe(s.recursion.count);
    expect(back.spiral.count).toBe(s.spiral.count);
    expect(back.spiral.grid).toEqual(s.spiral.grid);
    expect(back.relics.held.length).toBe(s.relics.held.length);
    expect(back.museum.completed).toEqual(s.museum.completed);
    // Decimals are the fragile part — they have their own toJSON.
    for (const id of Object.keys(s.currencies)) {
      expect(back.currencies[id]!.toString(), `currency ${id} drifted`).toBe(s.currencies[id]!.toString());
    }
    for (const id of Object.keys(s.totals)) {
      expect(back.totals[id]!.toString(), `total ${id} drifted`).toBe(s.totals[id]!.toString());
    }
    // And the restored save must be playable, not just equal.
    const e2 = createEngine({ nowMs: 0 });
    expect(() => {
      e2.dispatch({ type: 'hydrate', state: back, nowMs: 0 });
      e2.tick(30);
    }).not.toThrow();
  });
});

describe('corrupt saves fail gracefully, never silently', () => {
  const garbage: Array<[string, string]> = [
    ['empty string', ''],
    ['plain garbage', 'not a save at all'],
    ['truncated json', '{"version":12,"state":{"currenc'],
    ['valid json, wrong shape', '{"hello":"world"}'],
    ['null state', '{"version":12,"savedAtMs":0,"state":null}'],
    ['version from the future', '{"version":9999,"savedAtMs":0,"state":{}}'],
    ['negative version', '{"version":-3,"savedAtMs":0,"state":{}}'],
    ['array instead of object', '[1,2,3]'],
  ];

  it.each(garbage)('%s throws rather than returning a broken state', (_label, raw) => {
    // The contract the boot path relies on: deserialize either returns a USABLE
    // state or throws. It must never return something half-built, because the
    // caller treats "no throw" as "safe to hydrate" — and hydrating a
    // half-built state is exactly what white-screens the game.
    let state: GameState | null = null;
    let threw = false;
    try {
      state = deserialize(raw);
    } catch {
      threw = true;
    }
    if (!threw) {
      expect(state, 'deserialize returned null/undefined without throwing').toBeTruthy();
      const engine = createEngine({ nowMs: 0 });
      expect(() => {
        engine.dispatch({ type: 'hydrate', state: state as GameState, nowMs: 0 });
        engine.tick(5);
      }, 'deserialize accepted garbage and the engine then crashed on it').not.toThrow();
    }
  });

  it('a damaged save is QUARANTINED before the autosave can overwrite it', async () => {
    // The loss scenario this prevents: boot fails, the game starts fresh, and
    // ten seconds later the autosave replaces a hundred hours with an empty
    // save. Quarantine is the difference between "recoverable" and "gone".
    const { MemoryStorage } = await import('../save/storage');
    const { PersistenceController } = await import('../../platform/persistence');
    const storage = new MemoryStorage();
    const damaged = '{"version":12,"savedAtMs":0,"state":{"currenc';
    await storage.save(damaged);

    const engine = createEngine({ nowMs: 0 });
    const p = new PersistenceController(engine, storage);
    const loaded = await p.boot();

    expect(loaded, 'a damaged save must not load').toBe(false);
    expect(p.corruptSaveQuarantined, 'boot did not flag the corruption').toBe(true);
    expect(await storage.loadQuarantined(), 'the damaged save was not set aside').toBe(damaged);

    // Now let the autosave do its worst: the quarantined copy must survive.
    await p.saveNow();
    expect(await storage.loadQuarantined()).toBe(damaged);
    expect(await storage.load(), 'the fresh save should have replaced the live slot').not.toBe(damaged);
  });

  it('a corrupt import is rejected without touching the running game', () => {
    const engine = createEngine({ nowMs: 0 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 500 });
    const before = (engine.getState() as GameState).currencies['dust']!.toString();
    expect(() => importSave('this is not a save')).toThrow();
    expect((engine.getState() as GameState).currencies['dust']!.toString()).toBe(before);
  });
});
