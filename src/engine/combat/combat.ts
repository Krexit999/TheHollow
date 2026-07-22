/**
 * COMBAT — an event inside a rate. One resolver, two frontends:
 *  - a parametric closed form (auto-resolve + the sim's skill levels), and
 *  - a real turn engine (the UI drives it one beat at a time).
 * Both read the SAME stats mining built: tool strike power × the strikePower
 * bucket (skills, gems, triangle chords, gear), HP/regen/guard from gear.
 * No separate combat levelling track.
 *
 * Losing costs a toll — time and resources, never progress.
 */
import { D } from '../decimal';
import type { ModifierCache } from '../modifiers';
import { getCurrency, spendCurrency } from '../resources';
import type { ActionResult, EngineCtx, GameState } from '../types';
import { currentShell } from '../shells';
import { addMaterial, equippedTool, gemHpBonus } from '../systems/forge';
import { logScar } from '../systems/shaftSys';
import { addToolMark } from '../systems/heirloom';
import { rollPurity, materialDef } from '../materials';
import { grantXP } from '../systems/xp';
import { skillRank } from '../content/shell1/skillTree';
import { rollSpecies, speciesDef, wardenOf, type SpeciesDef, type TelegraphKind } from './species';
import { equippedGearDefs, gearCombatTotals } from './gear';
import { hirelingCombat } from '../guild/hirelings';
import { brewCombat } from '../content/shell3/brews';

export const LANES = 5;
export const BEAT_SEC = 2.2;
export const ENCOUNTER_COOLDOWN_SEC = 360;
export const PENDING_EXPIRE_SEC = 30;
export const FLEE_TOLL = 0.05; // of chip bank
export const LOSS_TOLL = 0.1;

// ---------------------------------------------------------------------------
// Player stats — everything mining already built.
// ---------------------------------------------------------------------------

export function effectiveStrike(state: GameState, mods: ModifierCache): number {
  return equippedTool(state).strikePower * mods.get(state, 'strikePower').toNumber() * brewCombat(state).strikeMult;
}

export function playerMaxHp(state: GameState): number {
  const gear = gearCombatTotals(state);
  return Math.round(
    24 + equippedTool(state).tier * 6 + gear.hp + gemHpBonus(state) +
    6 * skillRank(state, 'deepGrip') + hirelingCombat(state).hp + brewCombat(state).hp,
  );
}

export function playerRegen(state: GameState): number {
  return gearCombatTotals(state).regen + hirelingCombat(state).regen + brewCombat(state).regen;
}

/** Damage taken while guarding (off-hands improve it). */
export function guardFactor(state: GameState): number {
  return gearCombatTotals(state).guard ?? 0.5;
}

// ---------------------------------------------------------------------------
// Skill parameterization — auto and manual share one model.
// ---------------------------------------------------------------------------

export interface SkillParams {
  label: string;
  timingMult: number; // avg strike timing multiplier (0.6 - 1.5)
  dodgeRate: number; // how often telegraphs are answered correctly
  flankRate: number; // how often positioning/pole advantages are held
}

export const AUTO_SKILL: SkillParams = { label: 'auto', timingMult: 0.95, dodgeRate: 0.65, flankRate: 0.2 };
export const COMPETENT_SKILL: SkillParams = { label: 'competent', timingMult: 1.1, dodgeRate: 0.8, flankRate: 0.5 };
export const OPTIMAL_SKILL: SkillParams = { label: 'optimal', timingMult: 1.32, dodgeRate: 0.95, flankRate: 0.9 };

/** Auto forfeits the par bonus — part of what holds it at ~50-55%. */
export const AUTO_REWARD_PENALTY = 0.75;

/** Timing normalized 0-1 — rhythm-tests (phase skins) read this. */
function tNorm(skill: SkillParams): number {
  return Math.max(0, Math.min(1, (skill.timingMult - 0.85) / 0.5));
}

export interface FightOutcome {
  win: boolean;
  turns: number;
  hpLost: number;
  /** Reward multiplier vs par — skill pays out, sloppiness pays in. */
  rewardMult: number;
}

/**
 * The closed-form resolver. Deterministic given stats + skill params, so the
 * sim can audit the 50-55% auto target and the UI can preview odds.
 */
export function resolveFight(
  state: GameState,
  mods: ModifierCache,
  sp: SpeciesDef,
  skill: SkillParams,
): FightOutcome {
  const t = tNorm(skill);
  let strike = effectiveStrike(state, mods) * skill.timingMult;
  let effHp = sp.hp;
  let flank = skill.flankRate;

  if (sp.burrower) flank *= 0.5; // it denies your positioning
  strike *= 1 + 0.25 * flank;
  if (sp.shieldedFront) strike *= 0.5 + 0.5 * flank;
  if (sp.phaseSkin) strike *= 0.5 + 0.5 * t; // the rhythm test
  if (sp.pole && !sp.poleFlips) strike *= 0.75 + 0.75 * flank; // set your sign first
  if (sp.poleFlips) strike *= 0.75 + 0.6 * t; // ride the flip
  if (sp.regenerator) effHp *= 1 + 0.5 * (1 - t); // hesitation feeds it
  if (sp.abundance) effHp *= 1 + 0.5 * (1 - skill.dodgeRate); // impatience feeds it more

  const turns = Math.max(1, Math.ceil(effHp / Math.max(strike, 0.1)));

  let dodge = skill.dodgeRate;
  if (sp.swarm) dodge *= 0.6; // many small teeth — guard/dodge blunt
  if (sp.mirror) dodge *= 0.8;
  // Veiled (Glassmere): unseen wind-ups. SIGHT is the counter — reveal gear
  // restores your reading; without it you are guessing.
  if (sp.veiled && !equippedGearDefs(state).some((g) => g.combat.reveal)) dodge *= 0.55;
  let power = sp.power;
  if (sp.enrage) power *= 1.15; // averaged over the fight
  // The Smolder's thesis: her strength is YOUR heat. Cool = embers.
  if (sp.wrathful) power *= 0.6 + (state.pressure.heat / 100) * 1.2;
  // The Unattended's thesis: it grows SOLID under observation — reveal gear
  // feeds it. Fight it half-blind, the way you fought your first marlgrub.
  if (sp.presence && equippedGearDefs(state).some((g) => g.combat.reveal)) power *= 1.6;
  const incoming = power * (1 - dodge) * (0.5 + 0.5 * guardFactor(state));
  const net = Math.max(0, incoming - playerRegen(state));
  const hpLost = net * turns;
  const win = hpLost < playerMaxHp(state);

  // Par: what a competent fight takes; beating par pays extra drops.
  const parStrike = effectiveStrike(state, mods) * COMPETENT_SKILL.timingMult;
  const par = Math.max(1, Math.ceil(sp.hp / Math.max(parStrike, 0.1)));
  const rewardMult = Math.max(0.5, Math.min(2, par / turns));

  return { win, turns, hpLost, rewardMult };
}

// ---------------------------------------------------------------------------
// Rewards + tolls
// ---------------------------------------------------------------------------

function awardKill(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  sp: SpeciesDef,
  rewardMult: number,
  auto: boolean,
): void {
  state.combat.kills[sp.id] = (state.combat.kills[sp.id] ?? 0) + 1;
  state.combat.stats.wins += 1;
  if (auto) state.combat.stats.autoWins += 1;
  // Cinder: some kills vent the shaft — the hot bestiary is live cooling.
  if (sp.ventsOnKill) {
    state.pressure.heat = Math.max(0, state.pressure.heat - sp.ventsOnKill);
    state.pressure.ventedTotal += sp.ventsOnKill;
  }
  const drops: { materialId: string; purity: number }[] = [];
  for (const drop of sp.drops) {
    if (Math.random() < Math.min(1, drop.chance * rewardMult)) {
      const purity = rollPurity(materialDef(drop.materialId).rarity);
      addMaterial(state, drop.materialId, purity);
      drops.push({ materialId: drop.materialId, purity });
    }
  }
  if (sp.isWarden && !state.combat.wardens.includes(sp.shellId)) {
    state.combat.wardens.push(sp.shellId);
    logScar(state, ctx, 'warden', state.depth); // the column remembers the fight
    addToolMark(state, 'warden'); // and so does the tool in your hand (heirloom history)
    ctx.emit({ type: 'wardenFelled', shellId: sp.shellId, speciesId: sp.id });
  }
  grantXP(state, mods, ctx, D(sp.xp));
  ctx.dirty();
  ctx.emit({ type: 'combatEnd', speciesId: sp.id, result: 'win', drops, auto });
}

function applyToll(state: GameState, ctx: EngineCtx, fraction: number): string {
  const chipId = currentShell(state).chipCurrencyId;
  const toll = getCurrency(state, chipId).mul(fraction);
  spendCurrency(state, chipId, toll);
  ctx.dirty();
  return chipId;
}

// ---------------------------------------------------------------------------
// Encounters — they rise out of the rock. Mining never stops.
// ---------------------------------------------------------------------------

export const ENCOUNTER_CHANCE_MANUAL = 0.0009; // per full-charge chip
export const ENCOUNTER_DRILL_FACTOR = 0.25;

export function rollForEncounter(
  state: GameState,
  ctx: EngineCtx,
  charge: number,
  weight: number,
): void {
  const combat = state.combat;
  if (combat.pending || combat.active) return;
  if (state.depth < 5) return;
  if (state.stats.playTimeSec - combat.stats.lastSpawnAtSec < ENCOUNTER_COOLDOWN_SEC) return;
  const chance = ENCOUNTER_CHANCE_MANUAL * (charge / 8) * (1 + 0.002 * state.depth) * weight;
  if (Math.random() >= chance) return;
  // Tier affinity reads your kit; feral affinity reads your garden.
  const feral = state.growth.stage.reduce((a, s) => a + (s >= 4 ? 1 : 0), 0);
  const sp = rollSpecies(
    currentShell(state).id,
    state.depth,
    Math.random,
    equippedTool(state).tier,
    feral,
    state.pressure.heat,
  );
  if (!sp) return;
  combat.pending = { speciesId: sp.id, expiresAtSec: state.stats.playTimeSec + PENDING_EXPIRE_SEC };
  combat.stats.lastSpawnAtSec = state.stats.playTimeSec;
  combat.stats.encounters += 1;
  combat.stats.interruptions += 1;
  if (!combat.seen.includes(sp.id)) combat.seen.push(sp.id);
  ctx.emit({ type: 'encounter', speciesId: sp.id, known: (combat.kills[sp.id] ?? 0) > 0 });
}

/** Pending expiry + auto-resolve setting; called each engine step. */
export function tickCombat(state: GameState, mods: ModifierCache, ctx: EngineCtx): void {
  const combat = state.combat;
  if (!combat.pending) return;
  const expired = state.stats.playTimeSec >= combat.pending.expiresAtSec;
  if (combat.autoResolve || expired) {
    autoResolvePending(state, mods, ctx);
  }
}

export function autoResolvePending(state: GameState, mods: ModifierCache, ctx: EngineCtx): ActionResult {
  const pending = state.combat.pending;
  if (!pending) return { ok: false, reason: 'Nothing stirring' };
  const sp = speciesDef(pending.speciesId);
  state.combat.pending = null;
  const outcome = resolveFight(state, mods, sp, AUTO_SKILL);
  if (outcome.win) {
    awardKill(state, mods, ctx, sp, outcome.rewardMult * AUTO_REWARD_PENALTY, true); // auto forfeits the par bonus
  } else {
    state.combat.stats.losses += 1;
    const chipId = applyToll(state, ctx, LOSS_TOLL);
    ctx.emit({ type: 'combatEnd', speciesId: sp.id, result: 'loss', drops: [], auto: true });
    void chipId;
  }
  return { ok: true, data: outcome };
}

export function fleePending(state: GameState, ctx: EngineCtx): ActionResult {
  const pending = state.combat.pending;
  if (!pending) return { ok: false, reason: 'Nothing to flee' };
  state.combat.pending = null;
  state.combat.stats.flees += 1;
  applyToll(state, ctx, FLEE_TOLL);
  ctx.emit({ type: 'combatEnd', speciesId: pending.speciesId, result: 'fled', drops: [], auto: false });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The turn engine — the UI's honest fight, one beat at a time.
// ---------------------------------------------------------------------------

export interface TelegraphState {
  kind: TelegraphKind;
  lanes: number[];
  power: number;
  /** charge attacks wind up one extra beat. */
  windup: number;
}

function rollTelegraph(sp: SpeciesDef, phase: number, playerLane: number, enemyLane: number): TelegraphState {
  const kind = sp.patterns[Math.floor(Math.random() * sp.patterns.length)]!;
  const powerMult = 1 + (phase - 1) * 0.18 + (sp.enrage && phase >= 3 ? 0.4 : 0);
  const base = Math.round(sp.power * powerMult);
  const lanes: number[] = [];
  switch (kind) {
    case 'single':
      lanes.push(playerLane); // aimed where you stand NOW — move.
      break;
    case 'sweep': {
      const c = Math.max(1, Math.min(LANES - 2, playerLane));
      lanes.push(c - 1, c, c + 1);
      break;
    }
    case 'cross':
      lanes.push(playerLane);
      if (playerLane > 0) lanes.push(playerLane - 1);
      if (playerLane < LANES - 1) lanes.push(playerLane + 1);
      break;
    case 'allbut': {
      const safe = Math.floor(Math.random() * LANES);
      for (let l = 0; l < LANES; l++) if (l !== safe) lanes.push(l);
      break;
    }
    case 'charge': {
      const half = enemyLane <= 2 ? [0, 1, 2] : [2, 3, 4];
      lanes.push(...half);
      break;
    }
  }
  return { kind, lanes, power: kind === 'charge' ? base * 2 : base, windup: kind === 'charge' ? 1 : 0 };
}

export function startFight(state: GameState, ctx: EngineCtx, speciesId: string): ActionResult {
  if (state.combat.active) return { ok: false, reason: 'Already fighting' };
  const sp = speciesDef(speciesId);
  state.combat.pending = null;
  if (!state.combat.seen.includes(sp.id)) state.combat.seen.push(sp.id);
  const enemyLane = 2;
  state.combat.active = {
    speciesId,
    enemyHp: sp.hp,
    enemyMaxHp: sp.hp,
    playerHp: playerMaxHp(state),
    playerLane: 2,
    enemyLane,
    turn: 0,
    phase: 1,
    // Flip-poled species start north — they have to start somewhere to flip.
    pole: sp.pole ?? (sp.poleFlips ? 1 : 0),
    guardUp: false,
    fruitLanes: [],
    telegraph: rollTelegraph(sp, 1, 2, enemyLane),
    nextTelegraph: null,
  };
  ctx.emit({ type: 'combatStart', speciesId, warden: !!sp.isWarden });
  return { ok: true };
}

export interface TurnInput {
  move: -1 | 0 | 1;
  act: 'strike' | 'guard';
  /** Timing quality from the beat bar: 0.6 early/late, 1 good, 1.5 perfect. */
  timing: number;
}

export function combatTurn(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  input: TurnInput,
): ActionResult {
  const fight = state.combat.active;
  if (!fight) return { ok: false, reason: 'No fight' };
  const sp = speciesDef(fight.speciesId);
  fight.turn += 1;

  // 1. Player moves.
  fight.playerLane = Math.max(0, Math.min(LANES - 1, fight.playerLane + input.move));

  // 2. Player acts.
  let dealt = 0;
  if (input.act === 'strike') {
    const timing = Math.max(0.6, Math.min(1.5, input.timing));
    if (timing >= 1.45) state.combat.stats.perfects += 1;
    let dmg = effectiveStrike(state, mods) * timing;
    const flanking = Math.abs(fight.playerLane - fight.enemyLane) === 1;
    if (flanking) dmg *= 1.25;
    if (sp.shieldedFront && fight.playerLane === fight.enemyLane) dmg *= 0.5;
    if (sp.phaseSkin && fight.turn % 2 === 0) dmg *= 0.3; // off-beat
    if (fight.pole !== 0) {
      const lastSign = state.polarity.lastSign || 1;
      dmg *= lastSign === fight.pole ? 1.5 : 0.75; // your chain sign carries in
    }
    if (fight.guardUp) {
      // The Tapmother's lesson: greed feeds her.
      dmg *= 0.25;
      fight.playerHp -= Math.round(sp.power * 0.5);
      if (sp.regenerator) fight.enemyHp = Math.min(fight.enemyMaxHp, fight.enemyHp + sp.power);
    }
    // Old Plenty's lesson: striking while standing in plenty FEEDS it.
    if (sp.abundance && fight.fruitLanes.includes(fight.playerLane)) {
      fight.enemyHp = Math.min(fight.enemyMaxHp, fight.enemyHp + Math.round(sp.power * 1.5));
    }
    dealt = Math.max(1, Math.round(dmg));
    fight.enemyHp -= dealt;
  }

  // 3. Enemy specials.
  if (sp.regenerator && fight.enemyHp > 0 && fight.turn % 2 === 0) {
    fight.enemyHp = Math.min(fight.enemyMaxHp, fight.enemyHp + Math.round(fight.enemyMaxHp * 0.03));
  }

  // 4. Win?
  if (fight.enemyHp <= 0) {
    const par = Math.max(
      1,
      Math.ceil(sp.hp / Math.max(effectiveStrike(state, mods) * COMPETENT_SKILL.timingMult, 0.1)),
    );
    const rewardMult = Math.max(0.5, Math.min(2, par / fight.turn));
    state.combat.active = null;
    awardKill(state, mods, ctx, sp, rewardMult, false);
    return { ok: true, data: { result: 'win', dealt } };
  }

  // 5. The telegraph resolves onto the player.
  let taken = 0;
  const tg = fight.telegraph;
  if (tg) {
    if (tg.windup > 0) {
      tg.windup -= 1; // the charge still winding — a free beat to reposition
    } else {
      if (tg.lanes.includes(fight.playerLane)) {
        let factor = input.act === 'guard' ? guardFactor(state) : 1;
        if (sp.swarm && input.act === 'guard') factor = Math.min(1, factor + 0.3);
        taken = Math.round(tg.power * factor);
        fight.playerHp -= taken;
        if (sp.thief) applyToll(state, ctx, 0.01);
        // Cinder stokers: every landed hit heats the shaft.
        if (sp.stokes) {
          state.pressure.heat = Math.min(100, state.pressure.heat + sp.stokes);
        }
      }
      fight.telegraph = null;
    }
  }
  fight.playerHp = Math.min(playerMaxHp(state), fight.playerHp + playerRegen(state));

  // 6. Lose?
  if (fight.playerHp <= 0) {
    state.combat.active = null;
    state.combat.stats.losses += 1;
    applyToll(state, ctx, LOSS_TOLL);
    ctx.emit({ type: 'combatEnd', speciesId: sp.id, result: 'loss', drops: [], auto: false });
    return { ok: true, data: { result: 'loss', taken } };
  }

  // 7. Enemy moves + phases + new telegraph.
  if (sp.mirror) fight.enemyLane = fight.playerLane;
  else if (sp.burrower && fight.turn % 3 === 0) fight.enemyLane = Math.floor(Math.random() * LANES);
  if (sp.poleFlips && fight.turn % 3 === 0 && fight.pole !== 0) fight.pole = -fight.pole as 1 | -1;
  const phase = fight.enemyHp < fight.enemyMaxHp / 3 ? 3 : fight.enemyHp < (2 * fight.enemyMaxHp) / 3 ? 2 : 1;
  if (phase !== fight.phase) {
    fight.phase = phase;
    ctx.emit({ type: 'combatPhase', speciesId: sp.id, phase });
  }
  // The Tapmother guards in long cycles — patience is the lesson.
  if (sp.isWarden && sp.shellId === 'loam') fight.guardUp = fight.turn % 5 < 2;
  // Old Plenty sets the table on a cycle: two lanes of fruit, two turns each.
  if (sp.abundance) {
    if (fight.turn % 4 === 0) {
      const a = Math.floor(Math.random() * LANES);
      let b = Math.floor(Math.random() * LANES);
      if (b === a) b = (b + 1) % LANES;
      fight.fruitLanes = [a, b];
    } else if (fight.turn % 4 === 2) {
      fight.fruitLanes = []; // the offering rots away, uneaten — good
    }
  }
  if (!fight.telegraph) {
    fight.telegraph = fight.nextTelegraph ?? rollTelegraph(sp, phase, fight.playerLane, fight.enemyLane);
    // Lanterns with reveal show one further ahead.
    fight.nextTelegraph = equippedGearDefs(state).some((g) => g.combat.reveal)
      ? rollTelegraph(sp, phase, fight.playerLane, fight.enemyLane)
      : null;
  }
  return { ok: true, data: { result: 'ongoing', dealt, taken } };
}

// ---------------------------------------------------------------------------
// Wardens
// ---------------------------------------------------------------------------

export function wardenDefeated(state: GameState, shellId: string): boolean {
  return state.combat.wardens.includes(shellId);
}

export function fightWarden(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  auto: boolean,
): ActionResult {
  const shell = currentShell(state);
  const warden = wardenOf(shell.id);
  if (!warden) return { ok: false, reason: 'No warden guards this floor' };
  if (state.depth < shell.floorDepth) return { ok: false, reason: 'The Warden waits at the floor' };
  if (wardenDefeated(state, shell.id)) return { ok: false, reason: 'The way is already open' };
  if (!state.combat.seen.includes(warden.id)) state.combat.seen.push(warden.id);
  state.combat.wardenAttempts[shell.id] = (state.combat.wardenAttempts[shell.id] ?? 0) + 1;
  if (!auto) return startFight(state, ctx, warden.id);
  const outcome = resolveFight(state, mods, warden, AUTO_SKILL);
  if (outcome.win) {
    awardKill(state, mods, ctx, warden, outcome.rewardMult * AUTO_REWARD_PENALTY, true);
  } else {
    state.combat.stats.losses += 1;
    applyToll(state, ctx, LOSS_TOLL);
    ctx.emit({ type: 'combatEnd', speciesId: warden.id, result: 'loss', drops: [], auto: true });
  }
  return { ok: true, data: outcome };
}

export function defaultCombatState(): GameState['combat'] {
  return {
    autoResolve: false,
    pending: null,
    active: null,
    kills: {},
    seen: [],
    wardens: [],
    wardenAttempts: {},
    stats: {
      encounters: 0,
      interruptions: 0,
      wins: 0,
      losses: 0,
      autoWins: 0,
      flees: 0,
      perfects: 0,
      lastSpawnAtSec: -1e9,
    },
  };
}
