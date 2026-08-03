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
import { tickPlant } from './systems/plant';
import { ensureRoll } from './systems/roll';
import { ensureCall, tickAssayBench } from './systems/assayBench';
import { tickDrills } from './systems/drills';
import { tickAlloys } from './systems/drillAlloys';
import { checkPrizeDrills } from './systems/prizeDrills';
import { checkLegendaryParts } from './systems/legendary';
import { tickOres } from './systems/ores';
import { tickReading } from './systems/reading';
import { tickAssay } from './systems/drops';
import { noticeConfluences } from './systems/confluence';
import { tickAutoRefine } from './systems/refinery';
import { tickCasting } from './systems/casting';
import { tickToolMods } from './systems/toolMods';
import { tickBio } from './systems/toolBio';
import { doCollapse } from './systems/collapseSys';
import { lawFlag } from './laws';
import { addCurrency } from './resources';
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
  'buyUpgrade', 'upgradeDrill',
  'craftTool', 'craftFromParts', 'beginCraft', 'delegateCraft',
  'crackGeode', 'buyResonantMemory', 'confluenceBuySlot', 'confluenceBuyRank',
  'buyMagnet', 'socketGem',
  'buyMirror',
  'inscribe', 'refine', 'transmute', 'salvageTool',
  'temperTool', 'rebuildCell', 'buyGridSlot', 'buyLicence',
  'fuseRelics', 'buyCoreNode', 'buySkillNode',
  'extendRail', 'installCache', 'depositCache', 'installLift',
  'discardTool', 'respecSkills',
]);
const UNDO_CLEARS = new Set<string>([
  'collapse', 'breach', 'recurse', 'spiral', 'hardReset',
]);
const UNDO_LABELS: Record<string, string> = {
  buyUpgrade: 'the purchase', upgradeDrill: 'the drill',
  craftTool: 'the forge', craftFromParts: 'the forge', beginCraft: 'the craft',
  fuseRelics: 'the fusion', refine: 'the refine',
  transmute: 'the transmute', salvageTool: 'the salvage', temperTool: 'the temper',
  installCache: 'the cache', depositCache: 'the deposit', extendRail: 'the rail',
  installLift: 'the lift', buyCoreNode: 'the Core node', buySkillNode: 'the skill',
  inscribe: 'the carving',
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
    // THE ROLL IS POPULATED BY THE ENGINE, not by whoever happens to render it.
    // It used to be filled lazily by `rollRows` — which was fine only while the
    // Roll panel was mounted on the Dig screen. The moment it moved to the
    // Shaft screen, every OTHER consumer read an empty table: the Standoff read
    // The Ashfall's hazard intensity as 0 and printed "Hazard 0" over a fight
    // that was really running at intensity 1. A system that is only correct
    // when a particular panel is on screen is not a system.
    ensureRoll(state);
    // THE CALL is keyed to the re-roll counter, so this only rolls when the
    // stations do. THE BENCH finishes a sample when its clock runs out.
    ensureCall(state);
    tickAssayBench(state, ctx);
    tickFace(state, mods, ctx, dt);
    runFaceTick(state, mods, ctx, dt); // signature mechanics (chain timeouts...)
    tickDrills(state, mods, ctx, dt);
    tickKiln(state, mods, ctx, dt);
    // THE PLANT last: the Surge bank refills after the machines have drawn on
    // it this step, so a batch fired this tick cannot be paid for twice.
    tickPlant(state, dt);
    for (const cs of allCraftSystems()) {
      if (cs.unlocked(state)) cs.tick(state, mods, ctx, dt);
    }
    // THE NEW FORGE, step 2: the crucible melting down. The only thing in that
    // system that takes time, and the one number its CSS fill bar draws.
    tickCasting(state, dt);
    // SELF-MENDING. The one modifier that does its work while nobody is
    // holding the tool — and it is the tool's own wear, never income, so the
    // idle layer gains nothing from it (pillar 1).
    tickToolMods(state, dt);
    // THE BIOGRAPHY'S CLOCK — hours held, and where it has been.
    tickBio(state, dt);
    tickAssay(state, mods, ctx);
    // Confluences: notice anything newly true across two systems and write it
    // down. Runs on the 1Hz block below, not every frame — the conditions are
    // cheap but there is no reason to ask 12 times a second.
    verdAcc += dt;
    if (verdAcc >= 1) {
      noticeConfluences(state, ctx);
      // Auto-refine standing rules (the Hold) — a gentle 5s cadence, converts
      // strictly at a loss (pillar 2), never touches the field.
      refineAcc += verdAcc;
      if (refineAcc >= 5) {
        tickAutoRefine(state, ctx);
        refineAcc = 0;
      }
      // Auto-collapse (Phase 21): a standing rule set by the player (the
      // Grid it used to be gated on is gone with gridModules.ts).
      const acd = state.qol.autoCollapseDepth;
      if (acd != null && state.depth >= acd) {
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
    state.stats.playTimeSec += dt;
    // THE SETTLING: the shaft banks quiet while no hand is on the face. Reads
    // the manual-chip counter, so it needs no hook in the chip path.
    tickSettle(state, dt);
    achTimer += dt;
    if (achTimer >= 1 || achCheckDue) {
      achTimer = 0;
      achCheckDue = false;
      // Relics wake on CARRY TIME, so this rides the same one-second beat the
      // achievements do: six numbers, no allocation, and idle-friendly by
      // construction (wearing one is the whole requirement — pillar 1).
      tickRelics(state, ctx, 1);
      noteResonances(state, ctx);
      // THE SET cools and CINDERHOLD burns on the same one-second beat.
      tickAlloys(state, mods, ctx, 1);
      // ORES form on the slow beat too — a trickle, a cap, and a floor that
      // will not let the grid sit dead for a whole minute (systems/ores.ts).
      tickOres(state, mods, ctx, 1);
      // THE DESK. Only the proposition being WORKED is evaluated, so this is one
      // predicate call a second and never a passive drip (systems/reading.ts).
      tickReading(state, ctx);
      checkAchievements(state, ctx);
      // A DRILL YOU DID NOT BUY. Checked right after the achievements, because
      // that is where three of the four sources come from (systems/prizeDrills).
      checkPrizeDrills(state, ctx);
      // A PART YOU DID NOT POUR. Same beat, same pure-read idempotence — a legend
      // earned with an empty Hold simply arrives on a later tick (legendary.ts).
      checkLegendaryParts(state, ctx);
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
