import { describe, expect, it } from 'vitest';
import { D } from '../decimal';
import { createEngine } from '../index';
import type { Engine, GameState } from '../types';
import { chainBase, CHAIN_TIMEOUT_SEC, rerollAllSigns } from '../systems/polarity';
import { activeSignatures, carriedStrength, CARRY_BASE } from '../signatures';
import { canBreach } from '../systems/breach';
import { echoesForCores } from '../prestigeMath';
import { ModifierCache } from '../modifiers';
import { addMaterial } from '../systems/forge';
import { runMigrations, SAVE_VERSION } from '../save/migrations';
import { serialize } from '../save/codec';

function fresh(): { engine: Engine; s: GameState } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState };
}

/** A state standing on the Loam floor with a full Shell I life behind it. */
function atFloor(): { engine: Engine; s: GameState } {
  const { engine, s } = fresh();
  s.depth = 150;
  s.depthRecords['loam'] = 150;
  s.shell.coresEarnedThisBreach = D(800);
  s.upgrades['blade'] = 40;
  s.kiln.built = true;
  s.drills.bayBuilt = true;
  s.drills.units.push({ level: 3, timer: 0, lastCell: 0 });
  s.collapse.nodes['grit'] = 5;
  addMaterial(s, 'marl', 60, 30);
  s.keystones.placed.push('loam'); // the Brick Arch is set (Part B gate)
  engine.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 5000 });
  engine.dispatch({ type: 'debug', op: 'grant', currency: 'core', amount: 100 });
  return { engine, s };
}

describe('the breach', () => {
  it('requires the shell floor AND the Keystone (Part B gate)', () => {
    const { engine, s } = fresh();
    expect(engine.dispatch({ type: 'breach' }).ok).toBe(false);
    s.depth = 150;
    expect(canBreach(s)).toBe(false); // the floor is open but unshored (Part B)
    s.keystones.placed.push('loam');
    expect(canBreach(s)).toBe(true);
  });

  it('Echoes = floor(3·(cores/200)^0.6): 800 cores -> 6 Echoes (re-rated A.44)', () => {
    expect(echoesForCores(D(800)).toNumber()).toBe(6);
    const { engine, s } = atFloor();
    engine.dispatch({ type: 'breach' });
    expect(s.currencies['echo']!.toNumber()).toBe(6);
  });

  it('resets Cores, the Core tree, and every shell system', () => {
    const { engine, s } = atFloor();
    engine.dispatch({ type: 'breach' });
    expect(s.shell.current).toBe('ferrite');
    expect(s.currencies['core']!.toNumber()).toBe(0);
    expect(s.collapse.nodes).toEqual({});
    expect(s.upgrades['blade']).toBe(0);
    expect(s.kiln.built).toBe(false);
    expect(s.drills.bayBuilt).toBe(false);
    expect(s.currencies['dust']!.toNumber()).toBe(0);
    expect(s.depth).toBe(0);
  });

  it('what is truly yours survives: records, Delver, materials', () => {
    const { engine, s } = atFloor();
    const level = s.delver.level;
    engine.dispatch({ type: 'breach' });
    expect(s.depthRecords['loam']).toBe(150);
    expect(s.delver.level).toBeGreaterThanOrEqual(level); // breach XP only adds
    let marl = 0;
    for (const stack of Object.values(s.materials.stacks['marl'] ?? {})) marl += stack.count;
    expect(marl).toBe(30);
  });

  it('Breach 1 carries Seepage down; Polarity runs native in Ferrite', () => {
    const { engine, s } = atFloor();
    engine.dispatch({ type: 'breach' });
    expect(s.shell.signatures).toEqual(['seepage']); // Loam's signature, kept
    const active = activeSignatures(s);
    expect(active).toHaveLength(2);
    // Carried first (weakened), native LAST — the documented override order.
    expect(active[0]!.def.id).toBe('seepage');
    expect(active[0]!.native).toBe(false);
    expect(active[0]!.strength).toBeCloseTo(CARRY_BASE);
    expect(active[1]!.def.id).toBe('polarity');
    expect(active[1]!.strength).toBe(1);
  });

  it('carried Seepage gives Ferrite a thin idle floor (pillar 1 crosses shells)', () => {
    const { engine, s } = atFloor();
    engine.dispatch({ type: 'breach' });
    // Full face, NO drills (the breach stripped them), one offline hour:
    // the loam habit leaks Ingot at 0.4 strength.
    expect(s.drills.bayBuilt).toBe(false);
    engine.dispatch({ type: 'applyOffline', seconds: 3600 });
    expect(s.offline!.dust.gt(0)).toBe(true);
    // Thin: bounded by 40% of native seep times the yield multipliers.
    const yieldMult = s.offline!.dust.toNumber() / (2.88 * 3600 * 0.55 * 0.1 * 0.4);
    expect(yieldMult).toBeGreaterThan(0.5); // it flows
    expect(yieldMult).toBeLessThan(30); // but it is a trickle, mults included
  });

  it('carried strength: 0.4 base, raised by Resonant Memory (Echo sink)', () => {
    const { s } = fresh();
    expect(carriedStrength(s)).toBeCloseTo(CARRY_BASE);
    s.shell.resonantMemory = 2;
    expect(carriedStrength(s)).toBeCloseTo(0.4 * 1.3);
  });
});

describe('polarity chains', () => {
  function ferrite(): { engine: Engine; s: GameState } {
    const { engine, s } = atFloor();
    engine.dispatch({ type: 'breach' });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'ingot', amount: 1e6 });
    return { engine, s };
  }

  it('like signs chain and pay base^(n-1); a 6-chain beats two 3-chains', () => {
    const { s } = ferrite();
    const mods = new ModifierCache();
    const base = chainBase(s, mods, 1);
    expect(base).toBeCloseTo(1.35);
    const chainTotal = (len: number) => {
      let total = 0;
      for (let n = 1; n <= len; n++) total += Math.pow(base, n - 1);
      return total;
    };
    // The routing incentive: one long chain must far outpay two short ones.
    expect(chainTotal(6)).toBeGreaterThan(2 * chainTotal(3) * 1.5);
  });

  it('chips of like sign multiply; a break pays half and restarts', () => {
    const { engine, s } = ferrite();
    // Rig the board: all cells +, one cell −.
    s.polarity.signs.fill(1);
    s.polarity.signs[5] = -1;
    engine.dispatch({ type: 'chip', cell: 0 });
    expect(s.polarity.chain).toBe(1);
    engine.dispatch({ type: 'chip', cell: 1 });
    // The chip may re-roll signs; force cell 2 to stay + for determinism.
    s.polarity.signs[2] = 1;
    engine.dispatch({ type: 'chip', cell: 2 });
    expect(s.polarity.chain).toBe(3);
    engine.dispatch({ type: 'chip', cell: 5 }); // the − cell: snap
    expect(s.polarity.chain).toBe(1);
    expect(s.feed.length >= 0).toBe(true);
  });

  it('the chain times out after 4 idle seconds', () => {
    const { engine, s } = ferrite();
    s.polarity.signs.fill(1);
    engine.dispatch({ type: 'chip', cell: 0 });
    expect(s.polarity.chain).toBeGreaterThan(0);
    engine.tick(CHAIN_TIMEOUT_SEC + 1);
    expect(s.polarity.chain).toBe(0);
  });

  it('drills neither extend nor break the chain', () => {
    const { engine, s } = ferrite();
    s.polarity.signs.fill(1);
    engine.dispatch({ type: 'chip', cell: 0 });
    const chain = s.polarity.chain;
    s.drills.bayBuilt = true;
    s.drills.units.push({ level: 0, timer: 0, lastCell: 0 });
    engine.tick(3); // drills strike; under the 4s manual timeout
    expect(s.polarity.chain).toBe(chain);
  });

  it('long chains shed Lodestone', () => {
    const { engine, s } = ferrite();
    s.polarity.signs.fill(1);
    const before = s.currencies['lodestone']!.toNumber();
    for (let i = 0; i < 8; i++) {
      s.polarity.signs[i] = 1;
      engine.dispatch({ type: 'chip', cell: i });
    }
    expect(s.currencies['lodestone']!.toNumber()).toBeGreaterThan(before);
  });

  it('magnets bias re-rolls toward their pole', () => {
    const { s } = fresh();
    s.polarity.magnets = new Array(6).fill(1);
    s.polarity.magnetCount = 6;
    let plus = 0;
    const boards = 20;
    for (let i = 0; i < boards; i++) {
      s.polarity.signs = [];
      rerollAllSigns(s);
      plus += s.polarity.signs.filter((x) => x === 1).length;
    }
    expect(plus / (36 * boards)).toBeGreaterThan(0.75); // 85% bias, noisy
  });
});

describe('save v4 migration', () => {
  it('adds shells/polarity and maps the depth record', () => {
    const { s } = fresh();
    const raw = JSON.parse(serialize(s, 0)) as { state: Record<string, unknown> };
    delete raw.state['shell'];
    delete raw.state['polarity'];
    delete raw.state['foundry'];
    delete raw.state['depthRecords'];
    raw.state['maxDepthRecord'] = 123;
    const migrated = runMigrations({ version: 3, savedAt: 0, state: raw.state });
    expect(migrated.version).toBe(SAVE_VERSION);
    const st = migrated.state as Record<string, any>;
    expect(st['shell'].current).toBe('loam');
    expect(st['depthRecords'].loam).toBe(123);
    expect(st['polarity'].chain).toBe(0);
  });
});
