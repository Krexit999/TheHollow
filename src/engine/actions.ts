/**
 * Action dispatch — the only way anything outside the engine mutates state.
 * Every handler validates, mutates, and returns an ActionResult; the engine
 * facade wraps this with cache-invalidation and subscriber notification.
 */
import { D, Decimal } from './decimal';
import type { ModifierCache } from './modifiers';
import { addCurrency, allCurrencies, getCurrency, spendCurrency } from './resources';
import { doSpiral, gridSlotCost, licenceCost, startChallenge, abandonChallenge } from './systems/spiral';
import { GRID_CELLS } from './content/shell7/gridModules';
import { equipRelic, fuseRelics, toggleRelicLock, renderRelic, RARITIES } from './systems/relics';
import { claimExpedition, ROUTE_BY_ID, routeDurationMs } from './systems/museum';
import { allUpgrades, costForLevels, maxAffordable, upgradeDef, upgradeLevel } from './upgrades';
import type { ActionResult, EngineCtx, GameAction, GameState } from './types';
import { applyFieldSize, manualChip, sweep } from './systems/face';
import { descend, descendMany } from './systems/depthSys';
import {
  climb, extendRail, installCache, removeCache, depositCache, collectCache,
  installLift, hasLift, railDepth, workExcavation,
} from './systems/shaftSys';
import { doCollapse } from './systems/collapseSys';
import { applyOfflineProgress } from './systems/offline';
import { coreNodeAvailable, coreNodeCost, coreNodeDef, coreNodeLevel } from './content/shell1/coreTree';
import { skillNodeDef, skillRank, spentSkillPoints, skillNodeUnlocked } from './content/shell1/skillTree';
import {
  buyLatticeRing,
  placeMotif,
  removeMotif,
  upgradeMotif,
} from './content/shell1/latticeSystem';
import { hexKey, parseKey } from './systems/lattice/hex';
import { allCraftSystems } from './craft';
import { craftTool, discardTool, socketAlloy, socketGem, craftFromParts, replacePart, consumeMaterial, materialCount, addMaterial } from './systems/forge';
import { forgeDrillAlloy, clearDrillAlloy, fireNow } from './systems/drillAlloys';
import { digComplete, openOre, workOre } from './systems/ores';
import { lightOverstoke } from './systems/kiln';
import { kilnFuel } from './content/kilnFuel';
import { crackGeode, startAssay } from './systems/drops';
import { buyResonantMemory, doBreach } from './systems/breach';
import { buyConfluenceSlot, buyConfluenceRank, setConfluenceSlot } from './systems/confluence';
import { buyMagnet, toggleMagnet } from './systems/polarity';
import { castBinding, pourAlloy } from './content/shell2/crucibleSystem';
import { buyFoundrySlot, installModule, uninstallModule } from './systems/foundry';
import {
  autoResolvePending,
  combatTurn,
  fightWarden,
  fleePending,
  startFight,
} from './combat/combat';
import { craftGear, unequipGear } from './combat/gear';
import { buyStock, presentIds, sellMaterial, spendCharter } from './guild/guild';
import { acceptContract, completeContract, rerollContract } from './guild/contracts';
import { hire, HIRELING_DEFS } from './guild/hirelings';
import { markFragmentRead, translateFragment, FRAGMENTS } from './guild/sable';
import { useTechnique } from './techniques';
import { placeKeystone } from './systems/keystones';
import { equipTitle } from './guild/titles';
import { caravanTrade } from './guild/caravan';
import { setMirror } from './systems/refraction';
import { collectObservation, startObservation } from './content/shell4/observatory';
import { benchAttempt, equipLens, grindChartLens } from './content/shell4/bench';
import { warrenAnswer, warrenClaim, warrenEnter, warrenLeave } from './content/shell4/warrens';
import { inscribe } from './content/shell4/runes';
import { RUNES } from './content/shell4/runes';
import { emergencyPurge, layPipe, setChoke } from './systems/pressure';
import { buyFuel, lightCell, placeFuel, setOverdrive, setDraw, installSocket } from './content/shell5/emberArray';
import { produceExport } from './content/exports';
import { refine, transmute } from './systems/refinery';
import {
  benchClear, benchPlace, breakDownTool, buildTool, castPart, chargeCrucible, drainCrucible,
} from './systems/casting';
import { PART_TYPES, type PartType } from './content/forgeParts';
import { repairTool } from './systems/toolMining';
import { salvageTool, bulkSalvage } from './systems/salvage';
import { beginCraft, craftStage, delegateCraft, abandonCraft, fuseGems } from './systems/workbenchActs';
import { practiceRunes } from './content/shell4/runes';
import { temperTool } from './systems/tempering';
import type { PurityBand } from './materials';
import { materialDef, MATERIALS, GEMS } from './materials';
import { collectWell, commitToWell } from './content/shell5/wells';
import { answerAnomaly } from './systems/anomalies';
import { listen, rebuildCell } from './systems/absence';
import { buyAxiom, doRecursion } from './systems/recursionSys';
import { wardenOf, SPECIES } from './combat/species';
import { lawFlag, sealed } from './laws';
import { harvestPlot, plantSeed, installFrame } from './content/shell3/greenhouse';
import { feedMycelium, inoculate } from './content/shell3/mycelium';
import { brewExperiment, drinkBrew } from './content/shell3/brews';
import { commitWeave, setThread, spinThread, installLoomFrame } from './content/shell3/loomSystem';
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

    case 'sweep': {
      // A sweep is active chipping, so The Unattended seals it like the tap.
      if (sealed(state, 'sealHand')) return { ok: false, reason: 'Not this run' };
      const r = sweep(state, mods, ctx, action.cells);
      if (r.swept.length === 0) return { ok: false, reason: 'Nothing to sweep', data: r };
      return { ok: true, data: r };
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
      state.stats.upgradesBought += count;
      def.onPurchase?.(state, count);
      ctx.dirty();
      applyFieldSize(state, mods); // no-op unless 'expand' changed dims
      grantXP(state, mods, ctx, D(2 * count));
      ctx.emit({ type: 'purchase', id: action.id, levels: count });
      return { ok: true, data: { levels: count, cost } };
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
      if (cells.length === 0 || cells.length >= size) delete drill.zone;
      else drill.zone = cells.sort((a, b) => a - b);
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
    case 'workExcavation':
      return workExcavation(state, ctx, action.id);

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

    case 'placeMotif':
      return placeMotif(state, mods, ctx, action.q, action.r, action.shape, action.rank);

    case 'removeMotif':
      return removeMotif(state, ctx, action.q, action.r);

    case 'upgradeMotif':
      return upgradeMotif(state, ctx, action.q, action.r);

    case 'buyLatticeRing':
      return buyLatticeRing(state, ctx);

    case 'setLatticePress': {
      if (!state.lattice.doors.press) return { ok: false, reason: 'The Press is not yet found' };
      state.lattice.pressOn = action.on;
      return { ok: true };
    }

    case 'craftTool':
      return craftTool(state, mods, ctx, action.recipeId, action.refined ?? false);

    case 'craftFromParts':
      return craftFromParts(state, mods, ctx, action.tier, action.head, action.haft, action.binding);

    case 'replacePart':
      return replacePart(state, ctx, action.toolId, action.slot, action.materialId);

    case 'beginCraft':
      return beginCraft(state, ctx, action.act, action.context);

    case 'craftStage':
      return craftStage(state, mods, ctx, action.execution, action.data);

    case 'delegateCraft':
      return delegateCraft(state, mods, ctx);

    case 'abandonCraft':
      return abandonCraft(state, ctx);

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

    case 'pourAlloy':
      return pourAlloy(state, mods, ctx, action.amounts, action.catalystId);

    case 'socketAlloy':
      return socketAlloy(state, ctx, action.toolId, action.slot, action.alloyId);

    case 'castBinding':
      return castBinding(state, ctx, action.alloyId);

    case 'buyFoundrySlot':
      return buyFoundrySlot(state, ctx);

    case 'installModule':
      return installModule(state, ctx, action.id);

    case 'uninstallModule':
      return uninstallModule(state, ctx, action.id);

    case 'combatEngage': {
      const pending = state.combat.pending;
      if (!pending) return { ok: false, reason: 'Nothing stirring' };
      return startFight(state, ctx, pending.speciesId);
    }

    case 'combatAuto':
      return autoResolvePending(state, mods, ctx);

    case 'combatFlee':
      // THE LOUD DARK (challenge): nothing lets you past.
      if (sealed(state, 'sealFlee')) {
        return { ok: false, reason: 'It is between you and the stair. There is no slipping away.' };
      }
      return fleePending(state, ctx);

    case 'combatTurn':
      return combatTurn(state, mods, ctx, { move: action.move, act: action.act, timing: action.timing });

    case 'fightWarden':
      return fightWarden(state, mods, ctx, action.auto);

    case 'setAutoResolve':
      state.combat.autoResolve = action.on;
      return { ok: true };

    case 'craftGear':
      return craftGear(state, mods, ctx, action.gearId);

    case 'unequipGear':
      return unequipGear(state, ctx, action.slot);

    case 'buyStock':
      return buyStock(state, mods, ctx, action.npcId, action.slot, action.stance);

    case 'sellMaterial':
      return sellMaterial(state, mods, ctx, action.materialId, action.count);

    case 'acceptContract':
      return acceptContract(state, action.slot);

    case 'completeContract':
      return completeContract(state, mods, ctx, action.slot, presentIds(state));

    case 'rerollContract':
      return rerollContract(state, action.slot, presentIds(state));

    case 'hire':
      return hire(state, ctx, action.npcId);

    case 'translateFragment':
      return translateFragment(state, ctx, action.fragmentId);

    case 'markFragmentRead':
      return markFragmentRead(state, ctx, action.fragmentId);

    case 'equipTitle':
      return equipTitle(state, ctx, action.titleId);

    case 'caravanTrade':
      return caravanTrade(state, mods, ctx, action.route, action.amount);

    case 'spendCharter':
      return spendCharter(state, ctx, action.sink);

    case 'plantSeed':
      return plantSeed(state, action.plot, action.speciesId);

    case 'harvestPlot':
      return harvestPlot(state, ctx, action.plot);

    case 'inoculate':
      return inoculate(state, ctx, action.siteId, action.nodeType);

    case 'feedMycelium':
      return feedMycelium(state, action.humus);

    case 'brewExperiment':
      return brewExperiment(state, ctx, action.sap, action.spore, action.resin);

    case 'drinkBrew':
      return drinkBrew(state, ctx, action.brewId);

    case 'setThread':
      return setThread(state, action.axis, action.index, action.threadId);

    case 'commitWeave':
      return commitWeave(state, ctx);

    case 'spinThread':
      return spinThread(state, ctx, action.threadId);

    case 'setBeamRow': {
      state.refraction.entryRow = Math.max(0, Math.min(state.face.h - 1, action.row));
      state.refraction.pathDirty = true;
      return { ok: true };
    }

    case 'setMirror':
      return setMirror(state, action.cell, action.kind);

    case 'buyMirror': {
      const cost = D(40).mul(Decimal.pow(1.5, state.refraction.mirrorStock - 2));
      // The export spine: mirrors past the fourth are silvered with Set Resin —
      // Verdance's export, rendered at the Still. Serra hauls it if you won't.
      const wantsResin = state.refraction.mirrorStock >= 4;
      if (wantsResin && materialCount(state, 'setresin') < 1) {
        return { ok: false, reason: 'Mirrors past the fourth want 1 Set Resin — render it at the Still in Verdance, or buy it from Serra' };
      }
      if (!spendCurrency(state, 'silica', cost)) return { ok: false, reason: `${cost.toFixed(0)} Silica for the next mirror` };
      if (wantsResin) consumeMaterial(state, 'setresin', 1);
      state.refraction.mirrorStock += 1;
      return { ok: true };
    }

    case 'startObservation':
      return startObservation(state, action.tier);

    case 'collectObservation':
      return collectObservation(state, ctx);

    case 'benchAttempt':
      return benchAttempt(state, ctx, action.puzzleId, action.mirrors);

    case 'equipLens':
      return equipLens(state, action.puzzleId, action.slot ?? 1);

    case 'grindChartLens':
      return grindChartLens(state, ctx, action.constellationId);

    case 'warrenEnter':
      return warrenEnter(state, action.id);

    case 'warrenAnswer':
      return warrenAnswer(state, ctx, action.id, action.answer);

    case 'warrenClaim':
      return warrenClaim(state, ctx);

    case 'warrenLeave':
      return warrenLeave(state);

    case 'inscribe':
      return inscribe(state, ctx, action.target, action.sequence as never);

    case 'setChoke':
      return setChoke(state, action.on);

    case 'emergencyPurge':
      return emergencyPurge(state, ctx);

    case 'layPipe':
      return layPipe(state, action.cell);

    case 'recallCrew': {
      state.guild.crewRecalled = true;
      ctx.emit({ type: 'crewRecalled' });
      return { ok: true };
    }

    case 'buyFuel':
      return buyFuel(state, action.fuelId, action.count ?? 1);

    case 'placeFuel':
      return placeFuel(state, action.cell, action.fuelId);

    case 'lightCell':
      return lightCell(state, action.cell);

    // --- Part B export spine: production + export-consuming installs -------
    case 'produceExport':
      return produceExport(state, action.id);

    case 'installFrame':
      return installFrame(state);

    case 'installLoomFrame':
      return installLoomFrame(state);

    case 'installSocket':
      return installSocket(state);

    case 'setOverdrive':
      return setOverdrive(state, action.on);

    case 'setDraw':
      return setDraw(state, action.on);

    case 'refine':
      return refine(state, ctx, action.materialId, action.band as PurityBand);

    case 'transmute':
      return transmute(state, ctx, action.a, action.b);

    // --- THE NEW FORGE (v36): casting and the tool station ----------------
    // `partType` crosses the action boundary as a plain string, so it is
    // validated against the registry here rather than cast — a bad id would
    // otherwise reach `partMelt` and read undefined.
    case 'chargeCrucible':
      return chargeCrucible(state, ctx, action.materialId, action.units);
    case 'drainCrucible':
      return drainCrucible(state, ctx);
    case 'castPart':
      return PART_TYPES.includes(action.partType as PartType)
        ? castPart(state, ctx, action.partType as PartType)
        : { ok: false, reason: 'No such cast' };
    case 'benchPlace':
      return benchPlace(state, ctx, action.partId);
    case 'benchClear':
      return PART_TYPES.includes(action.partType as PartType)
        ? benchClear(state, ctx, action.partType as PartType)
        : { ok: false, reason: 'No such slot' };
    case 'buildTool':
      return buildTool(state, ctx);
    case 'breakDownTool':
      return breakDownTool(state, ctx);
    case 'repairTool':
      return PART_TYPES.includes(action.partType as PartType)
        ? repairTool(state, ctx, action.partType as PartType)
        : { ok: false, reason: 'No such part' };

    case 'salvageTool':
      return salvageTool(state, ctx, action.toolId, action.extract);
    case 'bulkSalvage':
      return bulkSalvage(state, ctx, action.toolIds, action.extract);
    case 'fuseGems':
      return fuseGems(state, ctx, action.gemId);
    case 'practiceRunes':
      return practiceRunes(state, ctx, action.sequence);

    case 'temperTool':
      return temperTool(state, ctx, action.temperId);

    case 'commitWell':
      return commitToWell(state, action.wellId, D(action.amount));

    case 'collectWell':
      return collectWell(state, ctx, action.wellId);

    case 'answerAnomaly':
      return answerAnomaly(state, mods, ctx);

    case 'listen':
      return listen(state, mods, ctx);

    case 'setListenAt': {
      state.hollow.listenAt = Math.max(0, Math.min(100, action.stacks));
      return { ok: true };
    }

    case 'rebuildCell':
      return rebuildCell(state, ctx, action.cell);

    case 'tapeRecord': {
      if (action.on) {
        // The export spine: arming a recording burns 1 Emberglass — the tape
        // is CUT in Cinder's glass, which is why it survives being replayed
        // forever. Stopping is free; a new recording is a new plate.
        if (!state.chamber.recording) {
          if (materialCount(state, 'emberglass') < 1) {
            return { ok: false, reason: 'A recording is cut in 1 Emberglass — hold the Ember Array in the band, or buy it from Serra' };
          }
          consumeMaterial(state, 'emberglass', 1);
        }
        state.chamber.running = false;
        state.chamber.tape = [];
        state.chamber.trace = [];
        state.chamber.cursor = 0;
      }
      state.chamber.recording = action.on;
      return { ok: true };
    }

    case 'tapeRun': {
      if (state.chamber.tape.length === 0) return { ok: false, reason: 'The tape is blank' };
      state.chamber.recording = false;
      state.chamber.running = action.on;
      state.chamber.cursor = 0;
      state.chamber.stepTimer = 0;
      return { ok: true };
    }

    case 'tapeClear': {
      state.chamber.tape = [];
      state.chamber.trace = [];
      state.chamber.running = false;
      state.chamber.recording = false;
      state.chamber.cursor = 0;
      return { ok: true };
    }

    case 'touchCore': {
      if (state.shell.current !== 'aleph') return { ok: false, reason: 'The Core is at the bottom of everything, not here' };
      if (state.depth < 40) return { ok: false, reason: 'Deeper. It is always deeper' };
      const finalWarden = wardenOf('aleph');
      if (finalWarden && !state.combat.wardens.includes('aleph') && !lawFlag(state, 'wardenOptional')) {
        return { ok: false, reason: 'Something is standing between you and the first rock. It has been waiting the whole time' };
      }
      state.aleph.coreTouched = true;
      ctx.emit({ type: 'coreTouched' });
      return { ok: true };
    }

    case 'recurse':
      return doRecursion(state, ctx, deps.replaceState);

    case 'buyAxiom':
      return buyAxiom(state, ctx, action.id);

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

    case 'placeModule': {
      if (!state.spiral.modules.includes(action.id)) return { ok: false, reason: 'That module is not unlocked' };
      if (action.cell < 0 || action.cell >= GRID_CELLS) return { ok: false, reason: 'No such cell' };
      const used = Object.keys(state.spiral.grid).length;
      if (state.spiral.grid[action.cell] === undefined && used >= state.spiral.slots) {
        return { ok: false, reason: 'No free slot — buy one with Spiral' };
      }
      for (const [cell, id] of Object.entries(state.spiral.grid)) {
        if (id === action.id && Number(cell) !== action.cell) delete state.spiral.grid[Number(cell)];
      }
      state.spiral.grid[action.cell] = action.id;
      ctx.dirty();
      ctx.emit({ type: 'modulePlaced', id: action.id, cell: action.cell });
      return { ok: true };
    }

    case 'clearModule': {
      delete state.spiral.grid[action.cell];
      ctx.dirty();
      return { ok: true };
    }

    case 'startChallenge':
      return startChallenge(state, ctx, action.id, deps.replaceState);

    case 'abandonChallenge':
      return abandonChallenge(state, ctx, deps.replaceState);

    case 'licenseShell': {
      if (state.spiral.shells.length >= state.spiral.licences) {
        return { ok: false, reason: 'No licence free — buy one with Spiral' };
      }
      if (state.spiral.shells.some((s) => s.shellId === action.shellId)) {
        return { ok: false, reason: 'That world already runs' };
      }
      state.spiral.shells.push({ shellId: action.shellId, depth: 0, policy: null, runSec: 0, collapses: 0 });
      ctx.dirty();
      ctx.emit({ type: 'shellLicensed', shellId: action.shellId });
      return { ok: true };
    }

    case 'setShellPolicy': {
      const sh = state.spiral.shells.find((s) => s.shellId === action.shellId);
      if (!sh) return { ok: false, reason: 'That world does not run' };
      sh.policy = action.policy;
      ctx.dirty();
      return { ok: true };
    }

    case 'takeInHand': {
      state.spiral.inHand = action.shellId;
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

    case 'sendExpedition': {
      const route = ROUTE_BY_ID.get(action.routeId);
      if (!route) return { ok: false, reason: 'No such route' };
      if (state.expeditions.active.some((e) => e.crewId === action.crewId)) {
        return { ok: false, reason: 'That crew is already out' };
      }
      // A crew can set off from an installed point on the column — a cache — not
      // only the surface. A deeper start reaches a deeper world (see museum.ts).
      const fromDepth = action.fromDepth ?? 0;
      if (fromDepth > 0 && !state.shaft.caches.some((c) => c.shell === state.shell.current && c.depth === fromDepth)) {
        return { ok: false, reason: 'A crew departs the column only from a cache you have sunk.' };
      }
      state.expeditions.active.push({
        crewId: action.crewId,
        routeId: action.routeId,
        startedMs: state.guild.clockMs,
        durationMs: routeDurationMs(state, action.crewId, route),
        fromDepth,
      });
      ctx.dirty();
      return { ok: true };
    }

    case 'claimExpedition':
      return claimExpedition(state, ctx, action.crewId);

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
      // Migrated wells totals arrive as plain numbers.
      next.wells.totalCommitted = D(next.wells.totalCommitted ?? 0);
      next.wells.totalReturned = D(next.wells.totalReturned ?? 0);
      for (const w of next.wells.active) w.amount = D(w.amount ?? 0);
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
        state.lattice.unlocked = true;
        state.guild.discovered = true;
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
         * THE FOUR COLLECTION-GATED ROOMS. Runes, Bestiary, Journal and
         * Expeditions do not open on a structure or a depth — they open on
         * HAVING FOUND SOMETHING, so setting a flag does nothing and the first
         * pass of this left them shut (caught by the driver counting rooms,
         * which is why it counts rooms rather than trusting the list).
         *
         * Each is seeded with ONE real entry taken from its own registry, never
         * a fabricated id: a panel that renders a record with no definition
         * behind it is the def-lookup black screen from A.36 all over again.
         */
        if (!Object.values(state.runes.found).some((n) => n > 0)) {
          for (const r of RUNES) state.runes.found[r] = Math.max(1, state.runes.found[r] ?? 0);
        }
        if (state.combat.seen.length === 0) {
          for (const sp of SPECIES) if (!state.combat.seen.includes(sp.id)) state.combat.seen.push(sp.id);
        }
        if (state.guild.sable.found.length === 0) {
          for (const f of FRAGMENTS) if (!state.guild.sable.found.includes(f.id)) state.guild.sable.found.push(f.id);
        }
        if (Object.keys(state.guild.hirelings).length === 0) {
          // Berths first, or the crew loft refuses the hire it is being handed.
          state.guild.berths = Math.max(state.guild.berths, 4);
          for (const h of HIRELING_DEFS.slice(0, 2)) {
            state.guild.hirelings[h.npcId] = {
              level: 0, xp: 0, status: 'well', hiredAtMs: state.guild.clockMs,
            };
          }
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

    case 'saveBlueprint': {
      const id = nextQolId(state.qol.blueprints, 'bp');
      state.qol.blueprints.push({
        id,
        name: action.name.trim() || `Design ${state.qol.blueprints.length + 1}`,
        tier: action.tier,
        head: action.head,
        haft: action.haft,
        binding: action.binding,
      });
      return { ok: true, data: { id } };
    }

    case 'deleteBlueprint': {
      state.qol.blueprints = state.qol.blueprints.filter((b) => b.id !== action.id);
      return { ok: true };
    }

    case 'saveLatticeLayout': {
      const lat = state.lattice;
      if (!lat.unlocked) return { ok: false, reason: 'The Lattice is still buried' };
      const motifs = Object.entries(lat.cells).map(([key, m]) => {
        const { q, r } = parseKey(key);
        return { q, r, shape: m.shape, rank: m.rank };
      });
      if (motifs.length === 0) return { ok: false, reason: 'The board is empty — nothing to remember' };
      const id = nextQolId(state.qol.latticeLayouts, 'll');
      state.qol.latticeLayouts.push({
        id,
        name: action.name.trim() || `Layout ${state.qol.latticeLayouts.length + 1}`,
        motifs,
      });
      return { ok: true, data: { id } };
    }

    case 'restoreLatticeLayout': {
      const layout = state.qol.latticeLayouts.find((l) => l.id === action.id);
      if (!layout) return { ok: false, reason: 'No such layout' };
      const lat = state.lattice;
      if (!lat.unlocked) return { ok: false, reason: 'The Lattice is still buried' };
      // Fill empty sockets only; leave anything already placed alone. Placement
      // pays the ordinary Motif cost through the normal path, so no free boards.
      let placed = 0;
      for (const m of layout.motifs) {
        if (lat.cells[hexKey(m.q, m.r)]) continue;
        const res = placeMotif(state, mods, ctx, m.q, m.r, m.shape, m.rank);
        if (res.ok) placed++;
        else if (res.reason?.includes('Motif')) break; // out of currency — stop here
      }
      return placed > 0
        ? { ok: true, data: { placed } }
        : { ok: false, reason: 'Nothing to place — the board is already set, or not enough Motifs' };
    }

    case 'deleteLatticeLayout': {
      state.qol.latticeLayouts = state.qol.latticeLayouts.filter((l) => l.id !== action.id);
      return { ok: true };
    }

    case 'toggleChordLock': {
      const locked = state.qol.lockedChords;
      const idx = locked.indexOf(action.id);
      if (idx >= 0) locked.splice(idx, 1);
      else locked.push(action.id);
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
}

/** Deterministic, collision-free id for a saved-item list: prefix + (max+1). */
function nextQolId(items: { id: string }[], prefix: string): string {
  let max = 0;
  for (const it of items) {
    const n = parseInt(it.id.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

export { MAX_DRILLS };
