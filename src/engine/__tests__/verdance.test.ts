import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { Engine, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import { getCurrency } from '../resources';
import { CAPTURE, GROW_DELAY_SEC, HARVEST_BONUS, feralCellCount, vineStage } from '../systems/growth';
import { AUTO_SKILL, resolveFight } from '../combat/combat';
import { wardenOf } from '../combat/species';
import { runMigrations, SAVE_VERSION } from '../save/migrations';
import { serialize } from '../save/codec';
import { cellCap, cellRegen } from '../systems/face';

function fresh(): { engine: Engine; s: GameState; mods: ModifierCache } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState, mods: new ModifierCache() };
}

/** A Verdance state. */
function verdant(): { engine: Engine; s: GameState; mods: ModifierCache } {
  const { engine, s, mods } = fresh();
  s.shell.current = 'verdance';
  s.collapse.count = 1;
  s.guild.discovered = true;
  s.depth = 30;
  return { engine, s, mods };
}

describe('growth: not acting is a strategy', () => {
  it('a cell held at cap sprouts, ages, banks overflow — and NEVER beats the ceiling (pillar 2)', () => {
    const { engine, s, mods } = verdant();
    // Fill every cell and wait.
    const cap = cellCap(s, mods);
    s.face.cells.fill(cap);
    engine.tick(GROW_DELAY_SEC + 2);
    expect(vineStage(s, 0)).toBeGreaterThanOrEqual(1);
    const fruitBefore = s.growth.fruit[0]!;
    const T = 60;
    engine.tick(T);
    const gained = s.growth.fruit[0]! - fruitBefore;
    const regen = cellRegen(s, mods);
    // Capture is strictly a share of the overflow regen the ceiling already
    // produced; even with the best harvest bonus it stays under it.
    expect(gained).toBeLessThanOrEqual(regen * T * CAPTURE * 1.001);
    expect(gained * Math.max(...HARVEST_BONUS)).toBeLessThanOrEqual(regen * T * 1.001);
    expect(gained).toBeGreaterThan(0);
  });

  it('harvesting a bloom pays banked fruit and sheds chlorophyll; the vine clears', () => {
    const { engine, s } = verdant();
    s.growth.stage = s.face.cells.map(() => 0);
    s.growth.fruit = s.face.cells.map(() => 0);
    s.growth.age = s.face.cells.map(() => 0);
    s.growth.fullSince = s.face.cells.map(() => 0);
    s.growth.stage[5] = 3;
    s.growth.fruit[5] = 40;
    const sporeBefore = getCurrency(s, 'spore').toNumber();
    const chloroBefore = getCurrency(s, 'chlorophyll').toNumber();
    engine.dispatch({ type: 'chip', cell: 5 });
    expect(getCurrency(s, 'spore').toNumber()).toBeGreaterThan(sporeBefore);
    expect(getCurrency(s, 'chlorophyll').toNumber()).toBeGreaterThan(chloroBefore);
    expect(vineStage(s, 5)).toBe(0);
    expect(s.growth.fruitHarvested).toBeGreaterThan(0);
  });

  it('feral vines spread to near-full neighbors and auto-drop when ripe', () => {
    const { engine, s, mods } = verdant();
    const cap = cellCap(s, mods);
    s.face.cells.fill(cap);
    s.growth.stage = s.face.cells.map(() => 0);
    s.growth.fruit = s.face.cells.map(() => 0);
    s.growth.age = s.face.cells.map(() => 0);
    s.growth.fullSince = s.face.cells.map(() => 0);
    s.growth.stage[0] = 4;
    s.growth.fruit[0] = cap * 32; // at the feral fruit cap -> ripe drops
    const sporeBefore = getCurrency(s, 'spore').toNumber();
    engine.tick(50);
    expect(feralCellCount(s)).toBeGreaterThanOrEqual(1);
    expect(s.growth.stage.filter((st) => st > 0).length).toBeGreaterThan(1); // spread
    expect(getCurrency(s, 'spore').toNumber()).toBeGreaterThan(sporeBefore); // ripe drop
    expect(s.growth.autoDropped).toBeGreaterThan(0);
  });

  it('drills never harvest a vined cell (automation must not trash a garden)', () => {
    const { engine, s, mods } = verdant();
    s.drills.bayBuilt = true;
    s.drills.units.push({ level: 0, timer: 0, lastCell: 0 });
    const cap = cellCap(s, mods);
    s.face.cells.fill(0.2);
    s.face.cells[3] = cap; // fullest — but vined
    s.growth.stage = s.face.cells.map(() => 0);
    s.growth.fruit = s.face.cells.map(() => 0);
    s.growth.age = s.face.cells.map(() => 0);
    s.growth.fullSince = s.face.cells.map(() => 0);
    s.growth.stage[3] = 2;
    engine.tick(10);
    expect(s.face.cells[3]).toBeGreaterThanOrEqual(cap * 0.99); // untouched
  });
});

describe('old plenty: patience under abundance', () => {
  it('falls to pure auto with a period kit; a ferrite kit bounces off', () => {
    const { s, mods } = verdant();
    s.forge.tools.push({
      id: 11, recipeId: 'wildstarFalx', name: 'Wildstar Falx', tier: 9,
      purity: 70, chipPower: 10, strikePower: 100, sockets: ['bloodgarnet', 'cinderquartz', null], alloys: [null, null],
    });
    s.forge.equipped = s.forge.tools.length - 1;
    s.forge.gear.offhand = { defId: 'plentyshell', purity: 60 };
    s.forge.gear.harness = { defId: 'canopyweave', purity: 60 };
    s.delver.skills['twoHandedSwing'] = 5;
    s.delver.skills['deepGrip'] = 3;
    for (const id of ['firstKill', 'wardenLoam', 'kills25']) s.achievements.unlocked[id] = true;
    mods.invalidate();
    const plenty = wardenOf('verdance')!;
    expect(resolveFight(s, mods, plenty, AUTO_SKILL).win).toBe(true);
    // Impatience feeds it: lower dodge (auto) faces more effective hp than optimal.
    s.forge.tools[s.forge.tools.length - 1]!.tier = 6;
    s.forge.tools[s.forge.tools.length - 1]!.strikePower = 30;
    mods.invalidate();
    expect(resolveFight(s, mods, plenty, AUTO_SKILL).win).toBe(false);
  });
});

describe('save v7', () => {
  it('migrates v6 saves with a sleeping green shell', () => {
    const { s } = fresh();
    const raw = JSON.parse(serialize(s, 0)) as { state: Record<string, unknown> };
    for (const k of ['growth']) delete raw.state[k];
    const migrated = runMigrations({ version: 6, savedAt: 0, state: raw.state } as never);
    expect(migrated.version).toBe(SAVE_VERSION);
    const st = migrated.state as Record<string, Record<string, unknown>>;
    expect(st['growth']!['stage']).toEqual([]);
  });
});
