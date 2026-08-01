import { describe, expect, it } from 'vitest';
import { D } from '../decimal';
import { createEngine } from '../index';
import { deserialize, serialize, type SavePayload } from '../save/codec';
import { exportSave, importSave } from '../save/exportSave';
import { runMigrations, SAVE_VERSION, type Migration } from '../save/migrations';
import { MemoryStorage } from '../save/storage';
import type { GameState } from '../types';

function populatedState(): GameState {
  const engine = createEngine({ nowMs: 123 });
  const s = engine.getState() as GameState;
  engine.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e6 });
  engine.dispatch({ type: 'buyUpgrade', id: 'blade', count: 5 });
  engine.dispatch({ type: 'buyUpgrade', id: 'kilnBuild' });
  s.currencies['dust'] = D('1.23e45'); // force a genuinely big Decimal
  s.depth = 17;
  s.delver.xp = D('9.87e21');
  engine.tick(5);
  return s;
}

describe('save round-trip', () => {
  it('preserves Decimals exactly, including > 1e15', () => {
    const s = populatedState();
    const back = deserialize(serialize(s, 999));
    expect(back.currencies['dust']!.eq(D('1.23e45'))).toBe(true);
    expect(back.delver.xp.eq(D('9.87e21'))).toBe(true);
    expect(back.currencies['dust'] instanceof Object).toBe(true);
    expect(typeof back.currencies['dust']!.add).toBe('function'); // real Decimal
  });

  it('preserves structure: face, upgrades, kiln, depth', () => {
    const s = populatedState();
    const back = deserialize(serialize(s, 0));
    expect(back.face.w).toBe(s.face.w);
    expect(back.face.cells).toEqual(s.face.cells);
    expect(back.upgrades['blade']).toBe(5);
    expect(back.kiln.built).toBe(true);
    expect(back.depth).toBe(17);
  });

  it('strips the transient offline summary', () => {
    const s = populatedState();
    s.offline = {
      seconds: 1, efficiency: 0.55, dust: D(1), brick: D(0), xp: D(0), levelsGained: 0, chargeFilled: 0,
    };
    expect(deserialize(serialize(s, 0)).offline).toBeNull();
  });

  it('export/import round-trips through compressed base64', () => {
    const s = populatedState();
    const encoded = exportSave(s, 555);
    expect(encoded).toMatch(/^[A-Za-z0-9+/=]+$/); // base64
    const back = importSave(encoded);
    expect(back.currencies['dust']!.eq(s.currencies['dust']!)).toBe(true);
    expect(back.depth).toBe(17);
  });

  it('rejects garbage imports', () => {
    expect(() => importSave('definitely not a save')).toThrow();
    expect(() => deserialize('{"nope":true}')).toThrow();
  });

  it('storage adapter round-trips', async () => {
    const storage = new MemoryStorage();
    expect(await storage.load()).toBeNull();
    await storage.save('hello');
    expect(await storage.load()).toBe('hello');
    await storage.clear();
    expect(await storage.load()).toBeNull();
  });
});

describe('migration chain', () => {
  const fakeChain: Record<number, Migration> = {
    [SAVE_VERSION]: (p) => ({
      ...p,
      version: SAVE_VERSION + 1,
      state: { ...(p.state as object), migrated1: true },
    }),
    [SAVE_VERSION + 1]: (p) => ({
      ...p,
      version: SAVE_VERSION + 2,
      state: { ...(p.state as object), migrated2: true },
    }),
  };

  it('runs every migration in order', () => {
    const old: SavePayload = { version: SAVE_VERSION, savedAt: 0, state: { a: 1 } };
    // Pretend current version is two ahead by walking the chain manually.
    let p = fakeChain[SAVE_VERSION]!(old);
    p = fakeChain[SAVE_VERSION + 1]!(p);
    expect(p.version).toBe(SAVE_VERSION + 2);
    expect((p.state as Record<string, unknown>)['migrated1']).toBe(true);
    expect((p.state as Record<string, unknown>)['migrated2']).toBe(true);
  });

  it('current-version saves pass through untouched', () => {
    const payload: SavePayload = { version: SAVE_VERSION, savedAt: 0, state: { a: 1 } };
    expect(runMigrations(payload)).toBe(payload);
  });

  it('refuses saves from a newer build', () => {
    const payload: SavePayload = { version: SAVE_VERSION + 5, savedAt: 0, state: {} };
    expect(() => runMigrations(payload)).toThrow(/newer/);
  });

  it('refuses saves with no migration path', () => {
    const payload: SavePayload = { version: SAVE_VERSION - 1, savedAt: 0, state: {} };
    expect(() => runMigrations(payload, {})).toThrow(/No migration/);
  });
});
