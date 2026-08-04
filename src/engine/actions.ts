/**
 * Action dispatch — the only way anything outside the engine mutates state.
 * Every handler validates, mutates, and returns an ActionResult; the engine
 * facade wraps this with cache-invalidation and subscriber notification.
 */
import { D, Decimal } from './decimal';
import type { ModifierCache } from './modifiers';
import { addCurrency, allCurrencies, getCurrency, spendCurrency } from './resources';
import { doSpiral, gridSlotCost, licenceCost } from './systems/spiral';
import { equipRelic, fuseRelics, toggleRelicLock, renderRelic, RARITIES } from './systems/relics';
import { allUpgrades, costForLevels, maxAffordable, upgradeDef, upgradeLevel } from './upgrades';
import type { ActionResult, EngineCtx, GameAction, GameState } from './types';
import { applyFieldSize, manualChip } from './systems/face';
import { resetCompaction } from './systems/compaction';
import { buildCrusher, crush } from './systems/crusher';
import { setRow as setCircuitRow, moveRow as moveCircuitRow } from './systems/circuit';
import { shoreBand, unshoreBand } from './systems/shoring';
import { floodStation } from './systems/flood';
import { recastMachine, setMachineBand } from './systems/condition';
import { addFilter, assignFilter, buildSieve, removeFilter } from './systems/sieve';
import { buildStill, distil } from './systems/still';
import { buildInfuser, infuse } from './systems/infuser';
import { buildPress, press } from './systems/press';
import { buildCondenser, buildWitness, condense, witness } from './systems/witness';
import { buildGovernor, setOverclock } from './systems/governor';
import { breakPart, breakRack, buildBreaker, unbuildMachine } from './systems/breaker';
import { buildCrucible, pour } from './systems/crucible';
import { buildLine, holdLine, runLine, setLine } from './systems/line';
import { buildBalance, convert } from './systems/balance';
import { beginStandoff, dismissStandoff, exchange, setDrillLine } from './systems/standoff';
import { MAX_BENCH_TIER, beginSample, ensureAssayBench } from './systems/assayBench';
import { ensureShop, isForked } from './systems/shopFork';
import { descend, descendMany } from './systems/depthSys';
import {
  climb, extendRail, installCache, removeCache, depositCache, collectCache,
  installLift, hasLift, railDepth,
} from './systems/shaftSys';
import { doCollapse } from './systems/collapseSys';
import { applyOfflineProgress } from './systems/offline';
import { coreNodeAvailable, coreNodeCost, coreNodeDef, coreNodeLevel } from './content/shell1/coreTree';
import { skillNodeDef, skillRank, spentSkillPoints, skillNodeUnlocked } from './content/shell1/skillTree';
import { allCraftSystems } from './craft';
import { craftTool, craftFromParts, discardTool, socketGem, consumeMaterial, materialCount, addMaterial } from './systems/forge';
import { ensureReading, noteCount, note, noteTally } from './systems/reading';
import { propositionById } from './content/shell1/reading';
import { equipGear } from './systems/gear';
import { setSocket, type SocketFill } from './systems/toolSockets';
import { forgeDrillAlloy, clearDrillAlloy, fireNow } from './systems/drillAlloys';
import { digComplete, openOre, workOre } from './systems/ores';
import { lightOverstoke } from './systems/kiln';
import { kilnFuel } from './content/kilnFuel';
import { crackGeode, startAssay } from './systems/drops';
import { buyResonantMemory, doBreach } from './systems/breach';
import { buyConfluenceSlot, buyConfluenceRank, setConfluenceSlot } from './systems/confluence';
import { buyMagnet, toggleMagnet } from './systems/polarity';
import { useTechnique } from './techniques';
import { placeKeystone } from './systems/keystones';
import { setMirror } from './systems/refraction';
import { inscribe } from './content/shell4/runes';
import { RUNES } from './content/shell4/runes';
import { emergencyPurge, layPipe, setChoke } from './systems/pressure';
import { refine, refineTo, transmute } from './systems/refinery';
import { recastLegendary } from './systems/legendary';
import {
  benchClear, benchPlace, breakDownTool, buildTool, castPart, chargeCrucible, drainCrucible,
  meltBack, bringToFront, matureLivingPart,
} from './systems/casting';
import {
  PART_TYPES, type GrowthBoonId, type PartShape, type PartType,
} from './content/forgeParts';
import { repairTool } from './systems/toolMining';
import { noteSynergies, setToolAbility, syncToolAbilities } from './systems/toolAbilities';
import { noteToolClass } from './systems/toolClass';
import { startBio } from './systems/toolBio';
import { applyToolMod, stripToolMod } from './systems/toolMods';
import { salvageTool, bulkSalvage } from './systems/salvage';
import { practiceRunes } from './content/shell4/runes';
import { temperTool } from './systems/tempering';
import type { PurityBand } from './materials';
import { materialDef, MATERIALS, GEMS } from './materials';
import { listen, rebuildCell } from './systems/absence';
import { doRecursion } from './systems/recursionSys';
import { lawFlag, sealed } from './laws';
import { allShells, convCurrencyId, resolveCurrencyId } from './shells';
import { MAX_DRILLS, newDrill, defaultDrillName } from './systems/drills';
import { grantXP } from './systems/xp';
import { initialState } from './state';

/** 999Qa in this game's own suffix scale (decimal.ts SUFFIXES: Qa = 10^15) —
 *  the dev "Give All" cheat's flat amount for every wallet in the game. */
export const GIVE_ALL_AMOUNT = 999e15;

export interface DispatchDeps {
  mods: ModifierCache;
  ctx: EngineCtx;
  /** Replace the whole state (hydrate / hard reset). */
  replaceState: (next: GameState) => void;
}

export function handleAction(
  state: GameState,
  action: GameAction,
  deps: DispatchDeps,
): ActionResult {
  const { mods, ctx } = deps;

  switch (action.type) {
    case 'chip': {
      // THE UNATTENDED (challenge): your hands are not part of this run.
      if (sealed(state, 'sealHand')) {
        return { ok: false, reason: 'Not this run. The shaft works without you — that was the promise' };
      }
      const result = manualChip(state, mods, ctx, action.cell);
      if (result.charge <= 0) return { ok: false, reason: 'Nothing to chip', data: result };
      return { ok: true, data: result };
    }

    case 'buyUpgrade': {
      const def = upgradeDef(action.id);
      if (def.visible && !def.visible(state)) return { ok: false, reason: 'Locked' };
      const level = upgradeLevel(state, action.id);
      if (level >= def.maxLevel) return { ok: false, reason: 'Max level' };
      // 'CHIP'/'CONV' costs resolve to the current shell's currencies.
      const currencyId = resolveCurrencyId(def.currency, state);
      let count: number;
      if (action.count === 'max') {
        count = maxAffordable(def, level, state.currencies[currencyId] ?? D(0));
        if (count === 0) return { ok: false, reason: 'Cannot afford' };
      } else {
        count = Math.max(1, Math.min(action.count ?? 1, def.maxLevel - level));
      }
      // Spine-priced rows: material stock caps the buy alongside the currency.
      for (const m of def.materialCosts ?? []) {
        count = Math.min(count, Math.floor(materialCount(state, m.id) / m.count));
      }
      if (count === 0) {
        const short = (def.materialCosts ?? []).map((m) => `${m.count} ${materialDef(m.id).name}`).join(' + ');
        return { ok: false, reason: `Wants ${short} per level` };
      }
      const cost = costForLevels(def, level, count);
      if (!spendCurrency(state, currencyId, cost)) {
        return { ok: false, reason: 'Cannot afford' };
      }
      for (const m of def.materialCosts ?? []) consumeMaterial(state, m.id, m.count * count);
      state.upgrades[action.id] = level + count;
      // THE FORK (§40.2). Only Blade/Soil/Roots read this; every other row
      // ignores `branch` entirely and behaves exactly as it always has.
      if (isForked(action.id) && action.branch === 'packed') {
        const sh = ensureShop(state);
        sh.packed[action.id] = (sh.packed[action.id] ?? 0) + count;
      }
      state.stats.upgradesBought += count;
      def.onPurchase?.(state, count);
      ctx.dirty();
      applyFieldSize(state, mods); // no-op unless 'expand' changed dims
      grantXP(state, mods, ctx, D(2 * count));
      ctx.emit({ type: 'purchase', id: action.id, levels: count });
      return { ok: true, data: { levels: count, cost } };
    }

    case 'shoreBand':
      return shoreBand(state, ctx, action.stationId);

    case 'unshoreBand':
      return unshoreBand(state, ctx, action.stationId);

    case 'floodStation':
      return floodStation(state, ctx, action.stationId);

    case 'recastMachine':
      return recastMachine(state, ctx, action.machineId);

    case 'buildSieve':
      return buildSieve(state, ctx);

    case 'buildStill':
      return buildStill(state, ctx);

    case 'buildBreaker':
      return buildBreaker(state, ctx);

    case 'breakPart':
      return breakPart(state, ctx, action.partId);

    case 'breakRack':
      return breakRack(state, ctx);

    case 'unbuildMachine':
      return unbuildMachine(state, ctx, action.machineId);

    case 'buildCrucible':
      return buildCrucible(state, ctx);

    case 'pour':
      return pour(state, ctx, action.parts);

    case 'buildLine':
      return buildLine(state, ctx);

    case 'setLine':
      return setLine(state, action.members);

    case 'holdLine':
      return holdLine(state, action.held);

    case 'runLine':
      return runLine(state, ctx);

    case 'buildBalance':
      return buildBalance(state, ctx);

    case 'convert':
      return convert(state, ctx, action.fromId, action.toId, action.units);

    case 'distil':
      return distil(state, ctx, action.materialId, action.band, action.trait);

    case 'buildGovernor':
      return buildGovernor(state, ctx);

    case 'setOverclock':
      return setOverclock(state, ctx, action.machineId, action.steps);

    case 'buildCondenser':
      return buildCondenser(state, ctx);

    case 'condense':
      return condense(state, ctx);

    case 'buildWitness':
      return buildWitness(state, ctx);

    case 'witness':
      return witness(state, ctx, action.materialId, action.band, action.into);

    case 'buildPress':
      return buildPress(state, ctx);

    case 'press':
      return press(state, ctx, action.materialId, action.band, action.form);

    case 'buildInfuser':
      return buildInfuser(state, ctx);

    case 'infuse':
      return infuse(state, ctx, action.vial, action.materialId, action.band);

    case 'addFilter':
      return addFilter(state, action.clauses);

    case 'removeFilter':
      return removeFilter(state, action.filterId);

    case 'assignFilter':
      return assignFilter(state, action.machineId, action.filterId);

    case 'setMachineBand':
      return setMachineBand(state, action.machineId, action.band)
        ? { ok: true }
        : { ok: false, reason: 'No such machine' };

    case 'buildCrusher':
      return buildCrusher(state, ctx);

    case 'crush':
      return crush(state, ctx, action.materialId, action.band);

    // THE CIRCUIT (§7.3). Writing a strip is a plain edit — it costs nothing,
    // because LAW 9 forbids a toll and the price of a bad circuit is the bad
    // circuit. Both verbs clear the fire counters for that machine: a strip you
    // just changed has not been running, and carrying the old counts forward
    // would make the log lie about the rules it was collected under.
    case 'setCircuitRow': {
      const r = setCircuitRow(state, action.machine, action.index, action.row);
      if (r.ok) ctx.dirty();
      return r;
    }

    case 'moveCircuitRow': {
      const r = moveCircuitRow(state, action.machine, action.index, action.to);
      if (r.ok) ctx.dirty();
      return r;
    }

    case 'setDrillLine':
      return setDrillLine(state, action.line);

    case 'beginStandoff':
      return beginStandoff(state, ctx);

    case 'exchange':
      return exchange(state, ctx, action.stance);

    case 'dismissStandoff':
      return dismissStandoff(state, ctx);

    case 'beginSample':
      return beginSample(state, ctx, action.stationId);

    /**
     * THE BENCH IS BUILT FROM CAST PARTS, like every other machine in the
     * bootstrap (§5) — never bought with currency. Dearer at every tier.
     */
    case 'buildAssayBench': {
      const b = ensureAssayBench(state);
      if (b.tier >= MAX_BENCH_TIER) return { ok: false, reason: 'At its last tier' };
      const cost = 2 + b.tier;
      const rack = state.casting.rack ?? [];
      if (rack.length < cost) return { ok: false, reason: `Wants ${cost} cast parts` };
      rack.splice(0, cost);
      b.tier += 1;
      ctx.dirty();
      return { ok: true, data: { tier: b.tier } };
    }

    case 'setKilnFeeding': {
      if (!state.kiln.built) return { ok: false, reason: 'No kiln' };
      state.kiln.feeding = action.feeding;
      return { ok: true };
    }

    case 'setKilnFuel': {
      if (!state.kiln.built) return { ok: false, reason: 'No kiln' };
      if (action.fuelId !== null && !kilnFuel(action.fuelId)) return { ok: false, reason: 'No such fuel' };
      state.kiln.fuel = action.fuelId;
      state.kiln.fuelBurn = 0;
      ctx.dirty();
      return { ok: true };
    }

    case 'overstoke': {
      const r = lightOverstoke(state, mods);
      if (!r.ok) return { ok: false, reason: r.reason };
      note(state, ctx, 'firstOverstoke');
      ctx.dirty();
      return { ok: true };
    }

    case 'upgradeDrill': {
      const drill = state.drills.units[action.index];
      if (!drill) return { ok: false, reason: 'No such drill' };
      if (drill.level >= 25) return { ok: false, reason: 'Max level' };
      // Per-drill Standard curve: 5 * 1.25^level in the shell's converted currency.
      const cost = D(5).mul(Math.pow(1.25, drill.level));
      if (!spendCurrency(state, convCurrencyId(state), cost)) return { ok: false, reason: 'Cannot afford' };
      drill.level += 1;
      ctx.dirty();
      return { ok: true, data: { level: drill.level } };
    }

    case 'renameDrill': {
      const drill = state.drills.units[action.index];
      if (!drill) return { ok: false, reason: 'No such drill' };
      const name = action.name.trim().slice(0, 24);
      drill.name = name || undefined;
      ctx.dirty();
      return { ok: true };
    }

    // DRILL ALLOYS — pouring happens at the Forge and fits the result into the
    // named drills. There is deliberately no free equip verb: fitting an
    // ability is always a pour, so swapping is a decision (A.54). Pulling one
    // out costs nothing, because stopping should never be a purchase.
    case 'forgeDrillAlloy':
      return forgeDrillAlloy(state, ctx, action.materialIds, action.drills, {
        // Aiming is only honoured for something already discovered — the engine
        // checks, so a hand-built dispatch cannot use it as a scanner.
        prefer: action.prefer && state.drills.alloys.includes(action.prefer) ? action.prefer : null,
        slot: action.slot,
      });

    // FIRE IT NOW (A.57). The same firing the meter would do on its own, taken
    // early and aimed. Clicking is never required and never pays more — it pays
    // timing, which is the only thing worth paying for.
    case 'fireAbility':
      return fireNow(state, mods, ctx, action.index, action.slot, action.cell);

    case 'clearDrillAlloy': {
      const r = clearDrillAlloy(state, action.index, action.slot);
      if (r.ok) ctx.dirty();
      return r;
    }

    // ROUTING (A.56) — the player paints where a machine works and says what it
    // would rather be working. Both default to the old behaviour when unset, so
    // an idle player who never opens the menu is unaffected (pillar 1).
    case 'setDrillZone': {
      const drill = state.drills.units[action.index];
      if (!drill) return { ok: false, reason: 'No such drill' };
      const size = state.face.cells.length;
      const cells = [...new Set(action.cells)].filter((c) => c >= 0 && c < size);
      // A zone covering everything is not a zone — store nothing, so the drill
      // keeps working the whole face even after the grid widens.
      const hadZone = (drill.zone?.length ?? 0) > 0;
      if (cells.length === 0 || cells.length >= size) delete drill.zone;
      else drill.zone = cells.sort((a, b) => a - b);
      // THE DESK COUNTS MACHINES GIVEN A ZONE, not the act of painting — so
      // re-painting one drill nine times is one, which is what makes the
      // `zoneIsOrder` proof ("paint a zone on two machines") mean two machines.
      if (!hadZone && (drill.zone?.length ?? 0) > 0) {
        noteTally(state, 'routed');
        note(state, ctx, 'firstRoute');
      }
      ctx.dirty();
      return { ok: true, data: { cells: drill.zone?.length ?? 0 } };
    }

    case 'setDrillPriority': {
      const drill = state.drills.units[action.index];
      if (!drill) return { ok: false, reason: 'No such drill' };
      drill.priority = action.priority;
      ctx.dirty();
      return { ok: true };
    }

    /**
     * THE DESK. Choosing a question is the whole of the player's input to the
     * Reading — proofs are behavioural, so there is no "submit". Refusing an
     * unreachable or already-proved id keeps the panel honest rather than
     * letting it hold a working row that can never resolve.
     */
    /**
     * GEAR. The refusal IS the mechanic (§40.1: what you carry into a stretch is
     * a commitment), so it is returned with the place to go rather than a bare
     * no — a rule the player cannot act on reads as a bug.
     */
    case 'equipGear': {
      const r = equipGear(state, action.id, action.slot);
      if (!r.ok) return { ok: false, reason: r.reason };
      ctx.dirty();
      return { ok: true };
    }

    case 'workProposition': {
      const r = ensureReading(state);
      if (action.id === null) { r.working = null; ctx.dirty(); return { ok: true }; }
      const def = propositionById(action.id);
      if (!def) return { ok: false, reason: 'No such proposition' };
      if (r.proven.includes(def.id)) return { ok: false, reason: 'Already proved' };
      if (def.notes > noteCount(state)) return { ok: false, reason: 'Not enough notes yet' };
      r.working = def.id;
      ctx.dirty();
      return { ok: true };
    }

    // HOW IT HUNTS (t1) and WHAT IT WAITS FOR (t2). Both store NOTHING at their
    // default, so a bay nobody has opened carries no fields and behaves exactly
    // as it did before either existed.
    case 'setDrillBehaviour': {
      const drill = state.drills.units[action.index];
      if (!drill) return { ok: false, reason: 'No such drill' };
      if (action.behavior === 'fullest') delete drill.behavior;
      else { if (!drill.behavior) note(state, ctx, 'firstBehaviour'); drill.behavior = action.behavior; }
      ctx.dirty();
      return { ok: true };
    }

    case 'setDrillFilter': {
      const drill = state.drills.units[action.index];
      if (!drill) return { ok: false, reason: 'No such drill' };
      // Capped below 1: a bar AT full cap would be a machine that can never
      // strike on a face whose cells sit a hair under cap, i.e. a setting whose
      // only outcome is a dead drill.
      const bar = Math.max(0, Math.min(0.9, action.minCharge));
      const hadBar = (drill.minCharge ?? 0) > 0;
      if (bar <= 0) delete drill.minCharge;
      else drill.minCharge = bar;
      // Machines given a bar, counted once each — the `patientBank` proof.
      if (!hadBar && bar > 0) {
        noteTally(state, 'barSet');
        note(state, ctx, 'firstBar');
      }
      ctx.dirty();
      return { ok: true };
    }

    // ORES. The hold gesture sends seconds of work; the engine decides when
    // that is enough. Completing OPENS it here rather than in `workOre`, so
    // there is exactly one place a pocket can pay out and it is the same one
    // the drills go through.
    case 'workOre': {
      const r = workOre(state, ctx, action.cell, action.seconds);
      if (!r.ok) return r;
      if (!digComplete(state, action.cell)) return r;
      const opened = openOre(state, mods, ctx, action.cell, 'hand', 1);
      return opened ? { ok: true, data: { done: true, ...opened } } : r;
    }

    case 'setHuntOres':
      state.drills.huntOres = action.on;
      ctx.dirty();
      return { ok: true };

    case 'descend':
      return descend(state, mods, ctx);

    case 'descendMany':
      return descendMany(state, mods, ctx, action.count);

    case 'climb':
      return climb(state, ctx, action.to);

    case 'extendRail':
      return extendRail(state, ctx);

    case 'installCache':
      return installCache(state, ctx);
    case 'removeCache':
      return removeCache(state, ctx, action.index);
    case 'depositCache':
      return depositCache(state, ctx, action.index, action.materialId, action.qty);
    case 'collectCache':
      return collectCache(state, ctx, action.index);
    case 'installLift':
      return installLift(state, ctx);

    case 'rideLift': {
      // The lift rides the RAIL and no further: it descends through cleared/
      // railed rock in one action, paying every depth's (discounted) toll, and
      // stops dead at the rail head. It never touches new ground, so the first
      // descent is untouched — this is batched convenience, not a shortcut.
      if (!hasLift(state)) return { ok: false, reason: 'No lift is fitted here.' };
      const target = railDepth(state);
      if (state.depth >= target) return { ok: false, reason: 'You are already at the rail head or below it.' };
      let moved = 0;
      while (state.depth < target) {
        const r = descend(state, mods, ctx);
        if (!r.ok) break; // ran out of coin, or hit a wall — stop where you are
        moved++;
      }
      return moved > 0 ? { ok: true, data: { depth: state.depth } } : { ok: false, reason: 'Could not afford the ride.' };
    }

    case 'collapse':
      // NO SECOND CHANCE (challenge): one run, all the way down.
      if (sealed(state, 'sealCollapse')) {
        return { ok: false, reason: 'This world does not fall. You go on from where you are.' };
      }
      return doCollapse(state, mods, ctx, false, action.fall ?? 'clean');

    case 'equipTool': {
      const idx = state.forge.tools.findIndex((t) => t.id === action.toolId);
      if (idx < 0) return { ok: false, reason: 'No such tool' };
      const changed = state.forge.equipped !== idx;
      state.forge.equipped = idx;
      if (changed) state.forge.equippedAt = state.stats.playTimeSec; // it starts settling in
      ctx.dirty();
      return { ok: true };
    }

    case 'socketGem':
      return socketGem(state, ctx, action.toolId, action.slot, action.gemId);

    case 'craftTool':
      return craftTool(state, mods, ctx, action.recipeId, action.refined ?? false);

    case 'craftFromParts':
      return craftFromParts(state, mods, ctx, action.tier, action.head, action.haft, action.binding);

    case 'discardTool':
      return discardTool(state, ctx, action.toolId);

    case 'crackGeode':
      return crackGeode(state, mods, ctx);

    case 'startAssay':
      return startAssay(state, mods);

    case 'breach':
      return doBreach(state, mods, ctx);

    case 'buyResonantMemory':
      return buyResonantMemory(state, ctx);

    case 'confluenceBuySlot':
      return buyConfluenceSlot(state, ctx);

    case 'confluenceSetSlot':
      return setConfluenceSlot(state, ctx, action.slot, action.id);

    case 'confluenceBuyRank':
      return buyConfluenceRank(state, ctx, action.slot);

    case 'buyMagnet':
      return buyMagnet(state, ctx);

    case 'toggleMagnet':
      return toggleMagnet(state, action.col);

    case 'useTechnique':
      // A technique is active play — The Unattended seals it like the hand.
      if (sealed(state, 'sealHand')) return { ok: false, reason: 'Not this run' };
      return useTechnique(state, mods, ctx, action.id, action.cell);

    case 'placeKeystone':
      return placeKeystone(state, ctx, action.leg);

    case 'setBeamRow': {
      state.refraction.entryRow = Math.max(0, Math.min(state.face.h - 1, action.row));
      state.refraction.pathDirty = true;
      return { ok: true };
    }

    case 'setMirror':
      return setMirror(state, action.cell, action.kind);

    case 'buyMirror': {
      /**
       * THE EXPORT-SPINE GATE IS GONE (A.72). Mirrors past the fourth wanted
       * a Set Resin — Verdance's export, rendered at the Still — and both roads
       * to one (render it, or buy it from Serra) went with the Still and the
       * Guild. A requirement nothing can ever satisfy is not a decision, it is
       * a wall with no door; dropped rather than left standing.
       */
      const cost = D(40).mul(Decimal.pow(1.5, state.refraction.mirrorStock - 2));
      if (!spendCurrency(state, 'silica', cost)) return { ok: false, reason: `${cost.toFixed(0)} Silica for the next mirror` };
      state.refraction.mirrorStock += 1;
      return { ok: true };
    }

    case 'inscribe':
      return inscribe(state, ctx, action.target, action.sequence as never);

    case 'setChoke':
      return setChoke(state, action.on);

    case 'emergencyPurge':
      return emergencyPurge(state, ctx);

    case 'layPipe':
      return layPipe(state, action.cell);

    case 'refine':
      return refine(state, ctx, action.materialId, action.band as PurityBand);

    case 'recastLegendary':
      return recastLegendary(state, ctx, action.legend, action.materialId);

    case 'refineTo':
      return refineTo(state, ctx, action.materialId, action.band as PurityBand);

    case 'transmute':
      return transmute(state, ctx, action.a, action.b);

    // --- THE NEW FORGE (v36): casting and the tool station ----------------
    // `partType` crosses the action boundary as a plain string, so it is
    // validated against the registry here rather than cast — a bad id would
    // otherwise reach `partMelt` and read undefined.
    case 'chargeCrucible':
      return chargeCrucible(state, ctx, action.materialId, action.units);
    case 'drainCrucible':
      return drainCrucible(state, ctx, action.index ?? 0);
    case 'bringToFront':
      return bringToFront(state, ctx, action.index);
    case 'castPart':
      return PART_TYPES.includes(action.partType as PartType)
        ? castPart(state, ctx, action.partType as PartType, action.shape as PartShape | undefined, action.layers)
        : { ok: false, reason: 'No such cast' };
    case 'benchPlace':
      return benchPlace(state, ctx, action.partId);
    case 'benchClear':
      return PART_TYPES.includes(action.partType as PartType)
        ? benchClear(state, ctx, action.partType as PartType)
        : { ok: false, reason: 'No such slot' };
    // BUILDING IS WHAT DECIDES WHAT THE TOOL CAN DO. The three rock-facing
    // stones are its mix, so the abilities are reconciled here rather than read
    // lazily: discovery has to happen at the moment you make the thing (that is
    // the whole of pillar 5's "found by making"), and a seated ability the new
    // build no longer grants has to go with it.
    case 'buildTool': {
      const r = buildTool(state, ctx);
      if (r.ok) {
        // THE BIOGRAPHY STARTS, or counts a rebuild. Either way it survives.
        startBio(state);
        syncToolAbilities(state, ctx);
        // AND WHAT IT TURNED OUT TO BE. A class is read off the finished parts,
        // so building is the only moment it can change — and the first time a
        // build lands in one is the discovery worth marking.
        noteToolClass(state, ctx);
        noteSynergies(state, ctx);
      }
      return r;
    }
    case 'breakDownTool': {
      const r = breakDownTool(state, ctx);
      if (r.ok) syncToolAbilities(state, ctx);
      return r;
    }
    case 'setToolAbility':
      return setToolAbility(state, ctx, action.slot, action.id);

    // WORKING SOMETHING IN CAN WAKE AN ARRANGEMENT. Checked on both verbs,
    // because taking a modifier OFF can put a synergy back to sleep and the
    // readout has to follow either way.
    case 'applyToolMod': {
      const r = applyToolMod(state, ctx, action.materialIds, action.prefer);
      if (r.ok) noteSynergies(state, ctx);
      return r;
    }
    case 'stripToolMod': {
      const r = stripToolMod(state, ctx, action.id);
      if (r.ok) noteSynergies(state, ctx);
      return r;
    }

    case 'matureLivingPart':
      return matureLivingPart(
        state, ctx, action.partType as PartType, action.boon as GrowthBoonId,
      );
    case 'setSocket':
      return setSocket(state, ctx, action.slot, action.fill as SocketFill | null);
    case 'meltBack':
      return meltBack(state, ctx, action.partId);
    case 'repairTool':
      return PART_TYPES.includes(action.partType as PartType)
        ? repairTool(state, ctx, action.partType as PartType)
        : { ok: false, reason: 'No such part' };

    case 'salvageTool':
      return salvageTool(state, ctx, action.toolId, action.extract);
    case 'bulkSalvage':
      return bulkSalvage(state, ctx, action.toolIds, action.extract);
    case 'practiceRunes':
      return practiceRunes(state, ctx, action.sequence);

    case 'temperTool':
      return temperTool(state, ctx, action.temperId);

    case 'listen':
      return listen(state, mods, ctx);

    case 'setListenAt': {
      state.hollow.listenAt = Math.max(0, Math.min(100, action.stacks));
      return { ok: true };
    }

    case 'rebuildCell':
      return rebuildCell(state, ctx, action.cell);

    case 'touchCore': {
      if (state.shell.current !== 'aleph') return { ok: false, reason: 'The Core is at the bottom of everything, not here' };
      if (state.depth < 40) return { ok: false, reason: 'Deeper. It is always deeper' };
      // Combat is gone (A.7x) — the final Warden gate went with it.
      state.aleph.coreTouched = true;
      ctx.emit({ type: 'coreTouched' });
      return { ok: true };
    }

    case 'recurse':
      return doRecursion(state, ctx, deps.replaceState);

    // --- Phase 12: the long tail ------------------------------------------
    case 'spiral':
      return doSpiral(state, ctx, deps.replaceState);

    case 'buyGridSlot': {
      const cost = gridSlotCost(state.spiral.slots);
      const held = getCurrency(state, 'spiral');
      if (held.lt(cost)) return { ok: false, reason: `${cost} Spiral for the next slot` };
      spendCurrency(state, 'spiral', D(cost));
      state.spiral.slots += 1;
      ctx.dirty();
      return { ok: true };
    }

    case 'buyLicence': {
      const cost = licenceCost(state.spiral.licences);
      const held = getCurrency(state, 'spiral');
      if (held.lt(cost)) return { ok: false, reason: `${cost} Spiral for the next licence` };
      spendCurrency(state, 'spiral', D(cost));
      state.spiral.licences += 1;
      ctx.dirty();
      return { ok: true };
    }

    case 'equipRelic': {
      const r = equipRelic(state, action.uid, action.slot);
      if (r.ok) ctx.dirty();
      return r;
    }

    case 'unequipRelic': {
      state.relics.equipped = state.relics.equipped.filter((_, i) => i !== action.slot);
      ctx.dirty();
      return { ok: true };
    }

    case 'fuseRelics': {
      const r = fuseRelics(state, action.keepUid, action.feedUid);
      if (r.ok) {
        ctx.dirty();
        const keep = state.relics.held.find((x) => x.uid === action.keepUid);
        if (keep) ctx.emit({ type: 'relicFused', relicId: String(keep.uid), rarity: RARITIES[keep.rarity] ?? 'Common' });
      }
      return r;
    }

    // AUTO-SCRAP (A.49) — the standing order. Partial so each control writes
    // only its own field and cannot clobber the others.
    case 'setAutoScrap': {
      const rule = state.relics.autoScrap;
      if (action.on !== undefined) rule.on = action.on;
      if (action.maxRarity !== undefined) rule.maxRarity = Math.max(0, Math.min(4, action.maxRarity));
      if (action.keepPowered !== undefined) rule.keepPowered = action.keepPowered;
      ctx.dirty();
      return { ok: true };
    }

    case 'renderRelic': {
      const r = renderRelic(state, action.uid);
      if (r.ok) ctx.dirty();
      return r;
    }

    case 'toggleRelicLock': {
      const r = toggleRelicLock(state, action.uid);
      if (r.ok) ctx.dirty();
      return r;
    }

    case 'setKilnReverse': {
      if (!lawFlag(state, 'kilnReverse')) return { ok: false, reason: 'The Kiln only runs one way. So far' };
      state.kiln.reverse = action.on;
      return { ok: true };
    }

    case 'buyCoreNode': {
      const def = coreNodeDef(action.id);
      if (!coreNodeAvailable(state, action.id)) {
        return { ok: false, reason: 'The Echo-scarred ring answers only to those who have Breached' };
      }
      const level = coreNodeLevel(state, action.id);
      if (level >= def.maxLevel) return { ok: false, reason: 'Max level' };
      const cost = coreNodeCost(level);
      if (!spendCurrency(state, 'core', cost)) return { ok: false, reason: 'Not enough Cores' };
      state.collapse.nodes[action.id] = level + 1;
      ctx.dirty();
      return { ok: true, data: { level: level + 1 } };
    }

    case 'buySkillNode': {
      const def = skillNodeDef(action.id);
      if (!skillNodeUnlocked(state, def)) return { ok: false, reason: 'Breach deeper to open this' };
      const rank = skillRank(state, action.id);
      if (rank >= def.maxRank) return { ok: false, reason: 'Max rank' };
      if (state.delver.skillPoints < def.costPerRank) {
        return { ok: false, reason: 'Not enough skill points' };
      }
      state.delver.skillPoints -= def.costPerRank;
      state.delver.skills[action.id] = rank + 1;
      ctx.dirty();
      return { ok: true, data: { rank: rank + 1 } };
    }

    case 'respecSkills': {
      const refund = spentSkillPoints(state);
      state.delver.skills = {};
      state.delver.skillPoints += refund;
      ctx.dirty();
      return { ok: true, data: { refund } };
    }

    case 'hydrate': {
      deps.replaceState(action.state);
      const next = action.state;
      for (const cs of allCraftSystems()) cs.ensureState(next);
      next.shell.coresEarnedThisBreach = D(next.shell.coresEarnedThisBreach ?? 0);
      ctx.dirty();
      const awaySec = Math.max(0, (action.nowMs - next.stats.lastSavedAt) / 1000);
      if (awaySec > 60) {
        next.offline = applyOfflineProgress(next, mods, ctx, awaySec);
      }
      next.stats.lastSavedAt = action.nowMs;
      return { ok: true, data: { awaySec } };
    }

    case 'applyOffline': {
      if (action.seconds <= 0) return { ok: false, reason: 'No time passed' };
      state.offline = applyOfflineProgress(state, mods, ctx, action.seconds);
      return { ok: true, data: state.offline };
    }

    case 'dismissOffline':
      if (state.offline) {
        state.stats.offlineClaimed = true;
        state.stats.longestOfflineSec = Math.max(state.stats.longestOfflineSec, state.offline.seconds);
      }
      state.offline = null;
      return { ok: true };

    case 'markSaved':
      state.stats.lastSavedAt = action.nowMs;
      return { ok: true };

    case 'markSystemsSeen': {
      const set = new Set(state.seenSystems ?? []);
      for (const id of action.ids) set.add(id);
      state.seenSystems = [...set];
      ctx.dirty();
      return { ok: true };
    }

    case 'markExported':
      state.stats.saveExported = true;
      return { ok: true };

    case 'hardReset': {
      deps.replaceState(initialState(state.stats.lastSavedAt));
      ctx.dirty();
      return { ok: true };
    }

    case 'debug': {
      if (action.op === 'grant') {
        addCurrency(state, action.currency, D(action.amount));
        ctx.dirty();
        return { ok: true };
      }
      if (action.op === 'resetCompaction') {
        // Dev hook: wipe the worked rock without a whole descent. The REAL
        // reset is the Collapse — collapseSys calls the same function.
        resetCompaction(state);
        ctx.dirty();
        return { ok: true };
      }
      if (action.op === 'giveAll') {
        // EVERY currency (registry-driven — new ones need no update here), plus
        // the three wallets that live OUTSIDE the currency registry by design
        // (materials/gems are purity-banded stacks, not a flat balance; relic
        // shards and geodes are single fields on their own systems).
        for (const c of allCurrencies()) addCurrency(state, c.id, D(GIVE_ALL_AMOUNT));
        for (const m of MATERIALS) addMaterial(state, m.id, 99, GIVE_ALL_AMOUNT);
        for (const g of GEMS) state.materials.gems[g.id] = (state.materials.gems[g.id] ?? 0) + GIVE_ALL_AMOUNT;
        state.materials.geodes += GIVE_ALL_AMOUNT;
        state.relics.shards += GIVE_ALL_AMOUNT;
        ctx.dirty();
        return { ok: true };
      }
      if (action.op === 'unlockAll') {
        /**
         * UNLOCK EVERYTHING — a dev-build shortcut past the entire progression.
         *
         * WHAT IT SETS is driven by what the ROOMS actually gate on (`ui/nav.ts`
         * `CLUSTERS[].visible`) plus the `built`/`unlocked` flags the panels
         * read, because those two lists ARE the definition of "every system" in
         * this game. Anything gated on a depth record gets the record; anything
         * gated on a structure gets the structure.
         *
         * DEPTH RECORDS FOR ALL SEVEN SHELLS is the load-bearing line: the
         * ability pool, the tool-tier cap, the alloy loadout budget, the
         * Vents/Greenhouse/Bench/Array/Chamber rooms and the shell bands all
         * read `depthRecords`, so setting them opens most of the game at once.
         */
        for (const shell of allShells()) state.depthRecords[shell.id] = 200;
        state.maxDepthRecord = Math.max(state.maxDepthRecord, 200);
        // Every signature carried, as a full run of Breaches would leave them.
        for (const shell of allShells()) {
          if (shell.signatureId && !state.shell.signatures.includes(shell.signatureId)) {
            state.shell.signatures.push(shell.signatureId);
          }
        }
        state.shell.breachCount = Math.max(state.shell.breachCount, 6);
        // The structures, which are flags rather than records.
        state.kiln.built = true;
        state.forge.built = true;
        state.drills.bayBuilt = true;
        if (state.drills.units.length === 0) state.drills.units.push(newDrill(defaultDrillName(0)));
        // Rooms that open on a COUNTER rather than a flag. Each is nudged to
        // the smallest value its gate accepts — the point is to open the door,
        // not to hand out the contents.
        state.materials.totalDrops = Math.max(state.materials.totalDrops, 1);
        state.collapse.count = Math.max(state.collapse.count, 1);
        state.recursion.count = Math.max(state.recursion.count, 1);
        state.spiral.count = Math.max(state.spiral.count, 1);
        state.relics.found = Math.max(state.relics.found, 1);
        // Every one-off STRUCTURE upgrade, registry-driven so a new one added
        // later needs no edit here: anything that is a single level and does not
        // reset on Collapse is a thing you build once, and `onPurchase` is what
        // actually flips its flag.
        for (const def of allUpgrades()) {
          if (def.maxLevel !== 1 || def.resetsOnCollapse) continue;
          if ((state.upgrades[def.id] ?? 0) > 0) continue;
          state.upgrades[def.id] = 1;
          def.onPurchase?.(state, 1);
        }
        /**
         * COLLECTION-GATED ROOMS. Runes does not open on a structure or a
         * depth — it opens on HAVING FOUND SOMETHING, so setting a flag does
         * nothing and the first pass of this left it shut (caught by the
         * driver counting rooms, which is why it counts rooms rather than
         * trusting the list).
         *
         * Each is seeded with ONE real entry taken from its own registry, never
         * a fabricated id: a panel that renders a record with no definition
         * behind it is the def-lookup black screen from A.36 all over again.
         */
        if (!Object.values(state.runes.found).some((n) => n > 0)) {
          for (const r of RUNES) state.runes.found[r] = Math.max(1, state.runes.found[r] ?? 0);
        }
        ctx.dirty();
        return { ok: true };
      }
      // 'warp' is handled by the engine facade (it drives tick).
      return { ok: false, reason: 'Handled by engine' };
    }

    // -----------------------------------------------------------------------
    // THE CONSIDERED HAND (Phase 21) — quality-of-life. None of these change a
    // rate, a cost, or a yield; they remember choices the player already made.
    // -----------------------------------------------------------------------
    case 'undo':
      // The window's snapshot lives in the engine facade closure; it intercepts
      // 'undo' before this switch. Reached only if the facade is bypassed.
      return { ok: false, reason: 'Handled by engine' };

    case 'setConfirmSpendFrac': {
      state.qol.confirmSpendFrac = Math.max(0, Math.min(1, action.frac));
      return { ok: true };
    }

    case 'togglePin': {
      const pins = state.qol.pins;
      const idx = pins.indexOf(action.materialId);
      if (idx >= 0) pins.splice(idx, 1);
      else pins.push(action.materialId);
      return { ok: true };
    }

    case 'setRefinePreset': {
      const presets = state.qol.refinePresets;
      const idx = presets.findIndex((p) => p.materialId === action.materialId);
      if (action.toBand === null) {
        if (idx >= 0) presets.splice(idx, 1);
        return { ok: true };
      }
      const existing = presets[idx];
      if (existing) {
        existing.toBand = action.toBand;
        existing.enabled = true;
      } else {
        presets.push({ materialId: action.materialId, toBand: action.toBand, enabled: true });
      }
      return { ok: true };
    }

    case 'toggleRefinePreset': {
      const preset = state.qol.refinePresets.find((p) => p.materialId === action.materialId);
      if (preset) preset.enabled = !preset.enabled;
      return { ok: true };
    }

    case 'setAutoCollapseDepth': {
      state.qol.autoCollapseDepth =
        action.depth === null ? null : Math.max(1, Math.floor(action.depth));
      return { ok: true };
    }

    case 'setCarryUpgrade': {
      // Only a resetting face upgrade can be carried — carrying a structure or
      // a survivor-of-collapse would be meaningless. null clears the mark.
      if (action.upgradeId === null) {
        state.qol.carryUpgradeId = null;
        return { ok: true };
      }
      const def = allUpgrades().find((u) => u.id === action.upgradeId);
      if (!def || !def.resetsOnCollapse) return { ok: false, reason: 'That cannot be carried' };
      state.qol.carryUpgradeId = action.upgradeId;
      return { ok: true };
    }

    case 'setBookmark': {
      const bm = state.qol.bookmarks;
      const has = bm.includes(action.entryId);
      if (action.on && !has) bm.push(action.entryId);
      else if (!action.on && has) state.qol.bookmarks = bm.filter((x) => x !== action.entryId);
      return { ok: true };
    }

    case 'setNote': {
      if (action.note.trim() === '') delete state.qol.notes[action.entryId];
      else state.qol.notes[action.entryId] = action.note;
      return { ok: true };
    }

    case 'markRead': {
      // Store the UI-supplied signature of the entry as you saw it. "What changed
      // since you last read this" is then: the entry's current signature exceeds
      // the one on file (or there is none) — e.g. a page that has since unlocked.
      state.qol.readAt[action.entryId] = action.sig;
      return { ok: true };
    }
  }
  /**
   * AN UNKNOWN ACTION IS REFUSED, NOT A CRASH.
   *
   * The switch is exhaustive over `GameAction`, so TypeScript proves nothing
   * reaches here — but the type is a compile-time claim and `dispatch` is a
   * runtime door. Cutting SWEEP found this: with `case 'sweep'` gone, the
   * function fell off the end and returned `undefined`, and `dispatch` then
   * read `result.ok` and threw. Anything holding a stale action — an old queued
   * dispatch, a replayed log, a driver, a save from before a cut — took the
   * engine down instead of being told no.
   */
  return { ok: false, reason: `No such action: ${(action as { type: string }).type}` };
}

export { MAX_DRILLS };
