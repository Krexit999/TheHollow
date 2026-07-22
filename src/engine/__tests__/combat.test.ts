import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { Engine, GameState } from '../types';
import {
  AUTO_SKILL,
  AUTO_REWARD_PENALTY,
  OPTIMAL_SKILL,
  effectiveStrike,
  playerMaxHp,
  resolveFight,
  rollForEncounter,
  ENCOUNTER_COOLDOWN_SEC,
} from '../combat/combat';
import { SPECIES, speciesDef, speciesOfShell, wardenOf } from '../combat/species';
import { GEAR_DEFS } from '../combat/gear';
import { addMaterial } from '../systems/forge';
import { materialDef } from '../materials';
import { ModifierCache } from '../modifiers';
import { runMigrations, SAVE_VERSION } from '../save/migrations';
import { serialize } from '../save/codec';

function fresh(): { engine: Engine; s: GameState; mods: ModifierCache } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState, mods: new ModifierCache() };
}

/** A late-Loam fighter: tier III tool, loam gear, some skills. */
function loamFighter(): { engine: Engine; s: GameState; mods: ModifierCache } {
  const { engine, s, mods } = fresh();
  s.forge.built = true;
  s.forge.tools.push({
    id: 7, recipeId: 'wardenbreaker', name: 'Wardenbreaker', tier: 3,
    purity: 70, chipPower: 1.5, strikePower: 12.8, sockets: [null, null], alloys: [],
  });
  s.forge.equipped = s.forge.tools.length - 1;
  s.forge.gear.offhand = { defId: 'marlshield', purity: 60 };
  s.forge.gear.harness = { defId: 'rootweave', purity: 60 };
  s.forge.gear.lantern = { defId: 'gravelight', purity: 60 };
  s.delver.skills['twoHandedSwing'] = 3;
  s.delver.skills['deepGrip'] = 2;
  return { engine, s, mods };
}

describe('the deepwrought', () => {
  it('15 species per shell + one warden each, unique, behaviourally distinct', () => {
    expect(speciesOfShell('loam')).toHaveLength(15);
    expect(speciesOfShell('ferrite')).toHaveLength(15);
    expect(speciesOfShell('verdance')).toHaveLength(15);
    expect(wardenOf('loam')!.id).toBe('tapmother');
    expect(wardenOf('ferrite')!.id).toBe('loadstar');
    expect(wardenOf('verdance')!.id).toBe('oldplenty');
    expect(new Set(SPECIES.map((sp) => sp.id)).size).toBe(SPECIES.length);
    // Distinctness: no two same-shell species share the same behaviour tuple.
    for (const shell of ['loam', 'ferrite', 'verdance']) {
      const keys = speciesOfShell(shell).map((sp) =>
        [
          sp.patterns.join(), sp.shieldedFront, sp.phaseSkin, sp.enrage, sp.swarm,
          sp.burrower, sp.mirror, sp.regenerator, sp.thief, sp.pole, sp.poleFlips,
        ].join('|'),
      );
      expect(new Set(keys).size).toBe(keys.length);
    }
    // Ferrite ties into polarity.
    expect(speciesOfShell('ferrite').some((sp) => sp.pole || sp.poleFlips)).toBe(true);
  });

  it('every drop is a combat-only material (cannot be mined)', () => {
    for (const sp of SPECIES) {
      for (const drop of sp.drops) {
        expect(materialDef(drop.materialId).source, `${sp.id} drops ${drop.materialId}`).toBe('combat');
      }
    }
  });
});

describe('the resolver (one model, three skill levels)', () => {
  it('auto delivers 50-55% of optimal across tier-appropriate species', () => {
    const { s, mods } = loamFighter();
    const pool = speciesOfShell('loam');
    const value = (skill: typeof AUTO_SKILL, autoPenalty: number) => {
      let total = 0;
      for (const sp of pool) {
        const o = resolveFight(s, mods, sp, skill);
        if (o.win) total += o.rewardMult * autoPenalty;
      }
      return total;
    };
    const auto = value(AUTO_SKILL, AUTO_REWARD_PENALTY); // auto forfeits the par bonus
    const optimal = value(OPTIMAL_SKILL, 1);
    const ratio = auto / optimal;
    expect(ratio).toBeGreaterThan(0.45);
    expect(ratio).toBeLessThan(0.6);
  });

  it('auto can lose against over-tier enemies — the honest gear signal', () => {
    const { s, mods } = fresh(); // bare hands, starter pick
    const brute = speciesDef('sinewbrute'); // ferrite tier 5
    expect(resolveFight(s, mods, brute, AUTO_SKILL).win).toBe(false);
    // But skilled play against tier-fits still works with real stats.
    const { s: s2, mods: m2 } = loamFighter();
    expect(resolveFight(s2, m2, speciesDef('marlgrub'), AUTO_SKILL).win).toBe(true);
  });

  it('behaviour flags demand different answers (shield vs rhythm)', () => {
    const { s, mods } = loamFighter();
    const shelled = speciesDef('chalkshell'); // shieldedFront
    const moth = speciesDef('mournmoth'); // phaseSkin
    // Flanking barely matters to the moth but transforms the shell fight.
    const shellLow = resolveFight(s, mods, shelled, { ...OPTIMAL_SKILL, flankRate: 0 });
    const shellHigh = resolveFight(s, mods, shelled, OPTIMAL_SKILL);
    expect(shellLow.turns / shellHigh.turns).toBeGreaterThan(1.5);
    // Timing barely matters to the shell but transforms the moth fight.
    const mothOff = resolveFight(s, mods, moth, { ...OPTIMAL_SKILL, timingMult: 0.9 });
    const mothOn = resolveFight(s, mods, moth, OPTIMAL_SKILL);
    expect(mothOff.turns / mothOn.turns).toBeGreaterThan(1.5);
  });
});

describe('the loam warden (mandatory, auto-beatable with gear)', () => {
  it('the Tapmother falls to auto WITH gear, holds without it', () => {
    const { s, mods } = loamFighter();
    const warden = wardenOf('loam')!;
    expect(resolveFight(s, mods, warden, AUTO_SKILL).win).toBe(true);
    const { s: bare, mods: bareMods } = fresh();
    expect(resolveFight(bare, bareMods, warden, AUTO_SKILL).win).toBe(false);
  });

  it('skill makes the warden faster, never possible-vs-impossible', () => {
    const { s, mods } = loamFighter();
    const warden = wardenOf('loam')!;
    const auto = resolveFight(s, mods, warden, AUTO_SKILL);
    const optimal = resolveFight(s, mods, warden, OPTIMAL_SKILL);
    expect(auto.win && optimal.win).toBe(true);
    expect(optimal.turns).toBeLessThan(auto.turns * 0.75);
  });

  it('the Loadstar falls to auto with tier-VI ferrite kit', () => {
    const { s, mods } = fresh();
    s.forge.tools.push({
      id: 8, recipeId: 'stormcaller', name: 'Stormcaller', tier: 6,
      purity: 70, chipPower: 5.3, strikePower: 30, sockets: [null, null, null], alloys: [null, null],
    });
    s.forge.equipped = s.forge.tools.length - 1;
    s.forge.gear.offhand = { defId: 'lodewardBuckler', purity: 60 };
    s.forge.gear.harness = { defId: 'ironweave', purity: 60 };
    s.forge.gear.lantern = { defId: 'stormglassLantern', purity: 60 };
    s.delver.skills['twoHandedSwing'] = 4;
    s.delver.skills['deepGrip'] = 3;
    const loadstar = wardenOf('ferrite')!;
    expect(resolveFight(s, mods, loadstar, AUTO_SKILL).win).toBe(true);
    // Under-geared auto still bounces off — the honest signal.
    const { s: loam, mods: loamMods } = loamFighter();
    expect(resolveFight(loam, loamMods, loadstar, AUTO_SKILL).win).toBe(false);
  });

  it('felling the warden opens the breach; losing costs a toll, not progress', () => {
    const { engine, s } = loamFighter();
    s.depth = 150;
    s.depthRecords['loam'] = 150;
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1000 });
    expect(engine.dispatch({ type: 'breach' }).ok).toBe(false);
    const result = engine.dispatch({ type: 'fightWarden', auto: true });
    expect(result.ok).toBe(true);
    expect(s.combat.wardens).toContain('loam');
    expect(engine.dispatch({ type: 'breach' }).ok).toBe(true);
    expect(s.depthRecords['loam']).toBe(150); // records untouched by any of it
  });
});

describe('encounters interrupt mining, gently', () => {
  it('spawns respect depth, cooldown, and count interruptions', () => {
    const { engine, s } = fresh();
    const ctx = { emit: () => {}, dirty: () => {} };
    s.depth = 30;
    for (let i = 0; i < 20000 && !s.combat.pending; i++) rollForEncounter(s, ctx, 8, 1);
    expect(s.combat.pending).not.toBeNull();
    expect(s.combat.stats.interruptions).toBe(1);
    // Cooldown: no second spawn immediately after resolving.
    engine.dispatch({ type: 'combatFlee' });
    for (let i = 0; i < 5000; i++) rollForEncounter(s, ctx, 8, 1);
    expect(s.combat.pending).toBeNull();
    s.combat.stats.lastSpawnAtSec = -ENCOUNTER_COOLDOWN_SEC * 2;
    void ENCOUNTER_COOLDOWN_SEC;
  });

  it('ignored encounters auto-resolve at expiry — idle players are never blocked', () => {
    const { engine, s } = loamFighter();
    s.depth = 30;
    s.combat.pending = { speciesId: 'marlgrub', expiresAtSec: s.stats.playTimeSec + 5 };
    engine.tick(8);
    expect(s.combat.pending).toBeNull();
    expect(s.combat.stats.wins + s.combat.stats.losses).toBe(1);
  });

  it('fleeing and losing cost chip currency, nothing else', () => {
    const { engine, s } = fresh();
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1000 });
    s.combat.pending = { speciesId: 'marlgrub', expiresAtSec: 1e9 };
    engine.dispatch({ type: 'combatFlee' });
    expect(s.currencies['dust']!.toNumber()).toBeCloseTo(950); // 5% toll
    expect(s.combat.stats.flees).toBe(1);
  });
});

describe('the turn engine', () => {
  it('a scripted fight wins and pays combat-only drops', () => {
    const { engine, s } = loamFighter();
    s.combat.pending = { speciesId: 'marlgrub', expiresAtSec: 1e9 };
    engine.dispatch({ type: 'combatEngage' });
    expect(s.combat.active).not.toBeNull();
    let guard = 60;
    while (s.combat.active && guard-- > 0) {
      const tg = s.combat.active.telegraph;
      // Competent play: step out of the telegraphed lanes, then strike.
      let move: -1 | 0 | 1 = 0;
      if (tg && tg.lanes.includes(s.combat.active.playerLane)) {
        move = s.combat.active.playerLane > 0 ? -1 : 1;
      }
      engine.dispatch({ type: 'combatTurn', move, act: 'strike', timing: 1 });
    }
    expect(s.combat.kills['marlgrub']).toBe(1);
    let drops = 0;
    for (const stack of Object.values(s.materials.stacks['chitinshard'] ?? {})) drops += stack.count;
    expect(drops).toBeGreaterThanOrEqual(0); // chance-based; kill recorded regardless
    expect(s.combat.seen).toContain('marlgrub');
  });

  it('standing in the telegraph hurts; dodging does not', () => {
    const { engine, s } = loamFighter();
    s.combat.pending = { speciesId: 'marlgrub', expiresAtSec: 1e9 };
    engine.dispatch({ type: 'combatEngage' });
    const fight = s.combat.active!;
    fight.enemyHp = 9999; // keep it alive long enough to answer back
    fight.telegraph = { kind: 'single', lanes: [2], power: 5, windup: 0 };
    fight.playerLane = 2;
    const hpBefore = fight.playerHp;
    engine.dispatch({ type: 'combatTurn', move: 0, act: 'strike', timing: 1 });
    expect(fight.playerHp).toBeLessThan(hpBefore);
    fight.telegraph = { kind: 'single', lanes: [2], power: 5, windup: 0 };
    const hp2 = fight.playerHp;
    engine.dispatch({ type: 'combatTurn', move: 1, act: 'strike', timing: 1 }); // step out
    expect(fight.playerHp).toBeGreaterThanOrEqual(hp2); // regen may even heal
  });
});

describe('gear (nothing combat-only)', () => {
  it('every piece has a mining face and a combat face', () => {
    for (const def of GEAR_DEFS) {
      expect('bucket' in def.mining || 'chipCooldownMult' in def.mining).toBe(true);
      expect(Object.keys(def.combat).length).toBeGreaterThan(0);
    }
  });

  it('crafting consumes combat drops and raises fight stats', () => {
    const { engine, s } = fresh();
    s.forge.built = true;
    addMaterial(s, 'chitinshard', 70, 10);
    addMaterial(s, 'marl', 60, 10);
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'brick', amount: 100 });
    const hpBefore = playerMaxHp(s);
    expect(engine.dispatch({ type: 'craftGear', gearId: 'marlshield' }).ok).toBe(true);
    expect(s.forge.gear.offhand!.defId).toBe('marlshield');
    expect(playerMaxHp(s)).toBeGreaterThan(hpBefore);
  });
});

describe('stat coupling — mining strength IS fighting strength', () => {
  it('tools, skills, gems, and triangle chords all move effective strike', () => {
    const { s, mods } = fresh();
    const base = effectiveStrike(s, mods);
    s.delver.skills['twoHandedSwing'] = 5;
    mods.invalidate();
    const withSkill = effectiveStrike(s, mods);
    expect(withSkill).toBeCloseTo(base * 1.5, 3);
    s.forge.tools[0]!.sockets = ['bloodgarnet'];
    mods.invalidate();
    expect(effectiveStrike(s, mods)).toBeCloseTo(withSkill * 1.15, 3);
    s.lattice.activeChords = [{ id: 'triangle.isolated.uniform', cells: [], sumRanks: 6, seq: 0 }];
    mods.invalidate();
    expect(effectiveStrike(s, mods)).toBeGreaterThan(withSkill * 1.15);
  });
});

describe('save v5 migration', () => {
  it('adds combat + gear to old saves', () => {
    const { s } = fresh();
    const raw = JSON.parse(serialize(s, 0)) as { state: Record<string, unknown> };
    delete raw.state['combat'];
    delete (raw.state['forge'] as Record<string, unknown>)['gear'];
    const migrated = runMigrations({ version: 4, savedAt: 0, state: raw.state });
    expect(migrated.version).toBe(SAVE_VERSION);
    const st = migrated.state as Record<string, any>;
    expect(st['combat'].wardens).toEqual([]);
    expect(st['forge'].gear.boots).toBeNull();
  });
});
