/**
 * The engine facade. Pure TypeScript — imports nothing from React, Pixi, or
 * the DOM. The entire external surface is:
 *
 *   tick(dtSeconds)  — advance simulation (fixed 100ms steps inside)
 *   getState()       — read-only state
 *   dispatch(action) — the only mutation path
 *   subscribe(fn)    — change notification
 *
 * Introspection helpers (breakdown, formulas) are pure functions exported
 * from engine modules; they take state and compute — the facade stays four
 * methods.
 */
import { ModifierCache } from './modifiers';
import { EventBus } from './events';
import type {
  ActionResult,
  Engine,
  EngineCtx,
  GameAction,
  GameEvent,
  GameState,
  Unsubscribe,
} from './types';
import { ensureContentLoaded } from './content';
import { initialState } from './state';
import { ensureStateShape } from './save/shape';
import { handleAction } from './actions';
import { allCraftSystems } from './craft';
import { tickFace } from './systems/face';
import { tickKiln } from './systems/kiln';
import { tickDrills } from './systems/drills';
import { tickAssay } from './systems/drops';
import { tickCombat } from './combat/combat';
import { tickGuild } from './guild/guild';
import { tickExpeditions } from './systems/museum';
import { noticeConfluences } from './systems/confluence';
import { tickAutoRefine } from './systems/refinery';
import { doCollapse } from './systems/collapseSys';
import { automationRate } from './content/shell7/gridModules';
import { tickParallelShells, checkChallengeGoal } from './systems/spiral';
import { tickWeather } from './systems/weather';
import { tickGreenhouse } from './content/shell3/greenhouse';
import { tickMycelium } from './content/shell3/mycelium';
import { tickBrewing } from './content/shell3/brews';
import { tickAnomalies } from './systems/anomalies';
import { RESONANCE_PER_STEP, TAPE_WHITELIST, replayInterval, tapeLabel } from './content/shell6/chamber';
import { lawFlag, lawNum } from './laws';
import { addCurrency, getTotal, spendCurrency } from './resources';
import { chipCurrencyId } from './shells';
import { D } from './decimal';
import { runFaceTick } from './signatures';
import { checkAchievements } from './content/shell1/achievements';
import { tickRelics, noteResonances } from './systems/relics';
import { applyOfflineProgress } from './systems/offline';
import { tickSettle } from './systems/settle';
import { serialize, deserialize } from './save/codec';

export const SIM_STEP = 0.1; // 100ms fixed timestep (locked)

/**
 * UNDO (Phase 21). A short window to reverse a SPEND or a CRAFT you did not mean.
 * The snapshot is a serialize of the pre-action state, held in memory only (undo
 * is a device convenience, not player data). It is set for the whitelisted spend/
 * craft actions below and CLEARED by any reset — Collapse, Breach, Recursion,
 * Spiral, a challenge start/abandon, a hard reset — because a reset is a decision,
 * never an accident, and an undoable prestige is a broken prestige.
 */
const UNDO_WINDOW_MS = 12_000;
const UNDOABLE = new Set<string>([
  'buyUpgrade', 'upgradeDrill', 'buyLatticeRing', 'placeMotif', 'upgradeMotif',
  'craftTool', 'craftFromParts', 'replacePart', 'beginCraft', 'delegateCraft', 'craftGear',
  'crackGeode', 'buyResonantMemory', 'confluenceBuySlot', 'confluenceBuyRank',
  'buyMagnet', 'pourAlloy', 'castBinding', 'socketAlloy', 'socketGem',
  'buyFoundrySlot', 'installModule', 'buyStock', 'hire', 'plantSeed', 'inoculate',
  'feedMycelium', 'brewExperiment', 'drinkBrew', 'commitWeave', 'spinThread', 'buyMirror',
  'benchAttempt', 'grindChartLens', 'inscribe', 'buyFuel', 'placeFuel', 'refine', 'transmute', 'salvageTool',
  'temperTool', 'commitWell', 'rebuildCell', 'buyAxiom', 'buyGridSlot', 'buyLicence',
  'placeModule', 'fuseRelics', 'donateRelic', 'donateItem', 'buyCoreNode', 'buySkillNode',
  'extendRail', 'installCache', 'depositCache', 'installLift', 'workExcavation',
  'sendExpedition', 'caravanTrade', 'spendCharter', 'discardTool', 'sellMaterial', 'respecSkills',
]);
const UNDO_CLEARS = new Set<string>([
  'collapse', 'breach', 'recurse', 'spiral', 'startChallenge', 'abandonChallenge', 'hardReset',
]);
const UNDO_LABELS: Record<string, string> = {
  buyUpgrade: 'the purchase', upgradeDrill: 'the drill', buyLatticeRing: 'the ring',
  craftTool: 'the forge', craftFromParts: 'the forge', beginCraft: 'the craft',
  craftGear: 'the gear', pourAlloy: 'the pour', fuseRelics: 'the fusion', refine: 'the refine',
  transmute: 'the transmute', salvageTool: 'the salvage', temperTool: 'the temper',
  installCache: 'the cache', depositCache: 'the deposit', extendRail: 'the rail',
  installLift: 'the lift', buyCoreNode: 'the Core node', buySkillNode: 'the skill',
  donateRelic: 'the donation', donateItem: 'the donation', drinkBrew: 'the brew',
  commitWeave: 'the weave', sellMaterial: 'the sale', sendExpedition: 'the expedition',
  buyStock: 'the buy', hire: 'the hire', workExcavation: 'the dig', inscribe: 'the carving',
};
function undoLabel(type: string): string { return UNDO_LABELS[type] ?? 'that'; }

/**
 * Catch-up budget per tick() call. Beyond this the remainder routes through
 * the offline calculation — a throttled background tab can never spiral into
 * minutes of frame-time stepping.
 */
const MAX_STEPS_PER_TICK = 3000; // 5 simulated minutes

const FEED_CAP = 128;

export interface CreateEngineOptions {
  state?: GameState;
  nowMs?: number;
}

export function createEngine(options: CreateEngineOptions = {}): Engine {
  ensureContentLoaded();

  let state: GameState = options.state ?? initialState(options.nowMs ?? 0);
  for (const cs of allCraftSystems()) cs.ensureState(state);
  const mods = new ModifierCache();
  const bus = new EventBus();
  const subscribers = new Set<(s: Readonly<GameState>) => void>();

  // Resume past the loaded feed's tail — seqs key the UI's toast list, and a
  // restart at 0 would collide with entries restored from a save.
  let feedSeq = state.feed.length > 0 ? state.feed[state.feed.length - 1]!.seq + 1 : 0;

  const ctx: EngineCtx = {
    emit(event: GameEvent) {
      // The feed exists for UI juice — skip the bookkeeping when headless.
      if (subscribers.size > 0) {
        const feed = state.feed;
        feed.push({ seq: feedSeq++, event });
        if (feed.length > FEED_CAP) feed.splice(0, feed.length - FEED_CAP);
      }
      bus.emit(event);
    },
    dirty() {
      mods.invalidate();
    },
  };

  // Achievements react to events immediately (cross-system reactions), and
  // are also swept once per simulated second for pure state conditions.
  bus.on('*', () => {
    achCheckDue = true;
  });

  let accumulator = 0;
  let achTimer = 0;
  let achCheckDue = false;
  let verdAcc = 0;
  let refineAcc = 0;

  function step(dt: number): void {
    tickFace(state, mods, ctx, dt);
    runFaceTick(state, mods, ctx, dt); // signature mechanics (chain timeouts...)
    tickDrills(state, mods, ctx, dt);
    tickKiln(state, mods, ctx, dt);
    for (const cs of allCraftSystems()) {
      if (cs.unlocked(state)) cs.tick(state, mods, ctx, dt);
    }
    tickAssay(state, mods, ctx);
    tickCombat(state, mods, ctx);
    tickGuild(state, mods, ctx, dt);
    // Expeditions resolve off the GAME CLOCK (advanced by tickGuild), so this
    // one call covers online play, a shut tab and the offline reconciliation
    // alike — and a crew's haul waits in `ready` forever once it lands.
    tickExpeditions(state);
    // Confluences: notice anything newly true across two systems and write it
    // down. Runs on the 1Hz block below, not every frame — the conditions are
    // cheap but there is no reason to ask 12 times a second.
    // Worlds that run without you (Spiral). Abstracted: each carries its own
    // ceiling and is capped by automationRate, which never exceeds a good
    // idle player — so hands keep their edge.
    tickParallelShells(state, mods, dt);
    verdAcc += dt;
    if (verdAcc >= 1) {
      tickWeather(state, ctx);
      tickGreenhouse(state, ctx, verdAcc * 1000);
      tickMycelium(state, ctx);
      tickBrewing(state, ctx);
      noticeConfluences(state, ctx);
      tickAnomalies(state, mods, ctx);
      // Auto-refine standing rules (the Hold) — a gentle 5s cadence, converts
      // strictly at a loss (pillar 2), never touches the field.
      refineAcc += verdAcc;
      if (refineAcc >= 5) {
        tickAutoRefine(state, ctx);
        refineAcc = 0;
      }
      // Auto-collapse (Phase 21): part of the automation suite, so it is gated on
      // the Grid running — and paced by it, since reaching the threshold depth is
      // itself Grid-paced. It only automates the tap a player would make anyway.
      const acd = state.qol.autoCollapseDepth;
      if (acd != null && state.depth >= acd && automationRate(state.spiral?.grid ?? {}) > 0) {
        doCollapse(state, mods, ctx, true);
      }
      // TWIN DESCENT (Axiom): the shell you left keeps producing at the
      // pace you left it — a closed-form stream, ceilings intact.
      const left = state.recursion.leftBehind;
      if (left && lawFlag(state, 'twinDescent')) {
        addCurrency(state, left.chipCurrencyId, left.ratePerSec);
      }
      verdAcc = 0;
    }
    // THE ECHO CHAMBER's replay head: the tape runs through the REAL action
    // handler — the engine cannot tell a program from a hand, which is the
    // whole law-compliance argument. Each step pays its Resonance keep.
    const tape = state.chamber;
    if (tape.running && tape.tape.length > 0) {
      tape.stepTimer += dt;
      const interval = replayInterval(state);
      if (tape.stepTimer >= interval) {
        tape.stepTimer -= interval;
        if (!spendCurrency(state, 'resonance', D(RESONANCE_PER_STEP))) {
          tape.running = false; // out of keep: the program halts, loses nothing
        } else {
          const step = tape.tape[tape.cursor]!;
          const before = getTotal(state, chipCurrencyId(state)).add(getTotal(state, 'void'));
          handleAction(state, step.action as GameAction, { mods, ctx, replaceState: () => {} });
          const gained = getTotal(state, chipCurrencyId(state)).add(getTotal(state, 'void')).sub(before).toNumber();
          tape.trace[tape.cursor] = Math.max(0, Math.min(1e300, Number.isFinite(gained) ? gained : 1e300));
          ctx.emit({ type: 'tapeStep', index: tape.cursor, label: step.label });
          tape.cursor += 1;
          if (tape.cursor >= tape.tape.length) {
            tape.cursor = 0;
            tape.loops += 1;
            const yieldSum = tape.trace.reduce((a, b) => a + b, 0);
            const efficiency = yieldSum / Math.max(1, tape.tape.length);
            if (efficiency > tape.bestEfficiency) tape.bestEfficiency = efficiency;
          }
        }
      }
    }
    state.stats.playTimeSec += dt;
    // THE SETTLING: the shaft banks quiet while no hand is on the face. Reads
    // the manual-chip counter, so it needs no hook in the chip path.
    tickSettle(state, dt);
    // A challenge ends the moment its goal is true. This call site did not
    // exist until Phase 13: every challenge could be STARTED and none could be
    // WON, so no Grid module could ever unlock and the whole automation half of
    // the Spiral was dead content behind a passing test suite.
    checkChallengeGoal(state, ctx, (next) => { state = next; });
    achTimer += dt;
    if (achTimer >= 1 || achCheckDue) {
      achTimer = 0;
      achCheckDue = false;
      // Relics wake on CARRY TIME, so this rides the same one-second beat the
      // achievements do: six numbers, no allocation, and idle-friendly by
      // construction (wearing one is the whole requirement — pillar 1).
      tickRelics(state, ctx, 1);
      noteResonances(state, ctx);
      checkAchievements(state, ctx);
    }
  }

  function notify(): void {
    for (const fn of subscribers) fn(state);
  }

  // Undo snapshot — in memory only (a device convenience, never in the save).
  let undoSnap: { raw: string; label: string; atMs: number } | null = null;
  function liveUndo(): typeof undoSnap {
    if (undoSnap && Date.now() - undoSnap.atMs > UNDO_WINDOW_MS) undoSnap = null;
    return undoSnap;
  }

  const engine: Engine = {
    tick(dtSeconds: number): void {
      if (!(dtSeconds > 0) || !Number.isFinite(dtSeconds)) return;
      accumulator += dtSeconds;
      let steps = 0;
      while (accumulator >= SIM_STEP && steps < MAX_STEPS_PER_TICK) {
        accumulator -= SIM_STEP;
        step(SIM_STEP);
        steps++;
      }
      // Anything beyond the live-step budget resolves as offline progress —
      // rate-limited math, no spiral of death.
      if (accumulator > MAX_STEPS_PER_TICK * SIM_STEP) {
        const overflow = accumulator;
        accumulator = 0;
        state.offline = applyOfflineProgress(state, mods, ctx, overflow);
      }
      notify();
    },

    getState(): Readonly<GameState> {
      return state;
    },

    dispatch(action: GameAction): ActionResult {
      if (action.type === 'debug' && action.op === 'warp') {
        // Time warp: fast-forward through the live sim (debug/sim only).
        let remaining = action.seconds;
        while (remaining > 0) {
          const chunk = Math.min(remaining, MAX_STEPS_PER_TICK * SIM_STEP);
          for (let t = 0; t < chunk; t += SIM_STEP) step(SIM_STEP);
          remaining -= chunk;
        }
        notify();
        return { ok: true };
      }
      // UNDO: reverse the last spend/craft inside a short window. Restores the
      // serialized pre-action state (the Decimal-aware clone). Handled here in
      // the facade because the snapshot lives in this closure, not in game state.
      if (action.type === 'undo') {
        const snap = liveUndo();
        if (!snap) return { ok: false, reason: 'Nothing to undo' };
        state = deserialize(snap.raw);
        undoSnap = null;
        mods.invalidate();
        notify();
        return { ok: true };
      }
      // THE TAPE HEAD (recording): the Chamber watches the dispatch itself.
      if (
        state.chamber?.recording &&
        TAPE_WHITELIST.includes(action.type) &&
        state.chamber.tape.length < lawNum(state, 'tapeSteps')
      ) {
        state.chamber.tape.push({ action: JSON.parse(JSON.stringify(action)), label: tapeLabel(action) });
      }
      // THE SHAPE NET (A.39): every save enters the engine through hydrate —
      // fill any slice a long-lived save is missing (an array added after the
      // record was created, a migration that missed one spot) from the current
      // default shape, BEFORE any code can `.push` into a hole. Additive only.
      if (action.type === 'hydrate' && action.state) {
        ensureStateShape(action.state, initialState(0));
      }
      // Snapshot BEFORE an undoable spend/craft (serialize is only paid for those).
      const snapBefore = UNDOABLE.has(action.type) ? serialize(state, Date.now()) : null;
      const result = handleAction(state, action, {
        mods,
        ctx,
        replaceState(next) {
          state = next;
        },
      });
      if (result.ok) {
        if (snapBefore) undoSnap = { raw: snapBefore, label: undoLabel(action.type), atMs: Date.now() };
        else if (UNDO_CLEARS.has(action.type)) undoSnap = null;
        notify();
      }
      return result;
    },

    undoInfo(): { label: string; atMs: number } | null {
      const snap = liveUndo();
      return snap ? { label: snap.label, atMs: snap.atMs } : null;
    },

    subscribe(fn: (s: Readonly<GameState>) => void): Unsubscribe {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };

  return engine;
}

// Re-exports: the pure introspection/content surface the UI and sim use.
export { breakdown, computeBucket } from './modifiers';
export type { Bucket, BreakdownEntry } from './modifiers';
export * from './types';
export { D, Decimal, fmt, fmtNum, fmtDuration, log10D, setNumberFormat, getNumberFormat } from './decimal';
export type { NumberFormat } from './decimal';
export {
  allUpgrades,
  upgradeDef,
  upgradeLevel,
  nextCost,
  totalCost,
  costForLevels,
  maxAffordable,
} from './upgrades';
export type { UpgradeDef } from './upgrades';
export { allCurrencies, currencyDef, getCurrency, getTotal } from './resources';
export type { CurrencyDef } from './resources';
export { allCraftSystems, craftSystem } from './craft';
export type { CodexEntry, CraftSystem } from './craft';
export {
  allShells,
  chipCurrencyId,
  convCurrencyId,
  currentShell,
  depthRecord,
  maxToolTier,
  nextShell,
  resolveCurrencyId,
  shellDef,
} from './shells';
export type { ShellContentDef } from './shells';
export { activeSignatures, carriedStrength } from './signatures';
export { masteryLevel, nextGate, MASTERY_GATES } from './systems/mastery';
export { canBreach, breachEchoPreview, resonantMemoryCost } from './systems/breach';
export * from './prestigeMath';
export { initialState } from './state';
export { ensureContentLoaded } from './content';
