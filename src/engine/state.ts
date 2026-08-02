/**
 * Initial state. A fresh save opens on a full 6x6 face — the first upgrade
 * (50 Dust) must be reachable in ~4 seconds, which requires charged rock to
 * smash immediately.
 */
import { D } from './decimal';
import { initialBalances } from './resources';
import type { GameState } from './types';
import { defaultQolState } from './types';
import { BASE_CAP } from './systems/face';
import { starterTool } from './systems/forge';
import { defaultPolarityState } from './systems/polarity';
import { defaultGrowthState } from './systems/growth';
import { defaultRefractionState } from './systems/refraction';
import { defaultRunesState } from './content/shell4/runes';
import { defaultPressureState } from './systems/pressure';
import { defaultHollowState } from './systems/absence';
import { defaultRecursionState } from './systems/recursionSys';
import { defaultSpiralState } from './systems/spiral';
import { defaultRelicsState } from './systems/relics';
import { defaultConfluenceState } from './systems/confluence';
import { defaultTechniquesState } from './techniques';
import { defaultKeystonesState } from './systems/keystones';
import { defaultRefineryState } from './systems/refinery';
import { defaultCastingState } from './systems/casting';
import { defaultShaftState } from './systems/shaftSys';
import { defaultRollState } from './systems/roll';
import { defaultPlantState } from './systems/plant';

export function defaultShellState(): GameState['shell'] {
  return {
    current: 'loam',
    breachCount: 0,
    coresEarnedThisBreach: D(0),
    signatures: [],
    resonantMemory: 0,
  };
}

export function defaultMaterialsState(): GameState['materials'] {
  return { stacks: {}, gems: {}, geodes: 0, geodesCracked: 0, totalDrops: 0 };
}

export function defaultForgeState(): GameState['forge'] {
  return {
    built: false,
    salvaged: 0,
    tempersUsed: [],
    pairsFound: [],
    tools: [starterTool()],
    equipped: 0,
    equippedAt: 0,
    nextId: 1,
  };
}

export function defaultAssayState(): GameState['assay'] {
  return { active: null, boostChips: 0, surveysDone: 0, reportDepth: null, knownMaterials: [] };
}

export const START_W = 6;
export const START_H = 6;

export function initialState(nowMs: number): GameState {
  return {
    currencies: initialBalances(),
    totals: {},
    upgrades: {},
    // The always-open systems are pre-seen so the disclosure card only fires
    // for the first thing you actually unlock (the Kiln), not on new-game boot.
    seenSystems: ['dig', 'delver', 'grid', 'vault'],
    face: {
      w: START_W,
      h: START_H,
      cells: new Array(START_W * START_H).fill(BASE_CAP),
      stamina: 100,
      staminaMax: 100,
      recentChips: [],
      seepPool: 0,
      // COMPACTION is not seeded here: `ensureCompaction` builds it on the
      // first tick, which is the same code path a save written before it
      // existed takes — so the fresh-game shape and the migrated shape are
      // produced by one function and cannot drift apart.
    },
    techniques: defaultTechniquesState(),
    keystones: defaultKeystonesState(),
    kiln: { built: false, heat: 0, feeding: false, progress: D(0) },
    drills: { bayBuilt: false, units: [], alloys: [], huntOres: true },
    depth: 0,
    maxDepthRecord: 0,
    depthRecords: {},
    shell: defaultShellState(),
    polarity: defaultPolarityState(),
    growth: defaultGrowthState(),
    refraction: defaultRefractionState(),
    runes: defaultRunesState(),
    pressure: defaultPressureState(),
    hollow: defaultHollowState(),
    aleph: { sigils: 0, coreTouched: false },
    recursion: defaultRecursionState(),
    spiral: defaultSpiralState(),
    relics: defaultRelicsState(),
    confluences: defaultConfluenceState(),
    figures: { found: [] },
    refinery: defaultRefineryState(),
    casting: defaultCastingState(),
    shaft: defaultShaftState(),
    qol: defaultQolState(),
    collapse: { count: 0, nodes: {}, lastRun: null, runStartAt: 0, traces: [] },
    roll: defaultRollState(),
    plant: defaultPlantState(),
    delver: { xp: D(0), level: 1, skillPoints: 1, skills: {} },
    achievements: { unlocked: {} },
    stats: {
      manualChips: 0,
      drillStrikes: 0,
      totalChargeChipped: D(0),
      fieldChargeHarvested: D(0),
      bricksFired: D(0),
      upgradesBought: 0,
      descents: 0,
      playTimeSec: 0,
      lastSavedAt: nowMs,
      saveExported: false,
      offlineClaimed: false,
      toolsForged: 0,
      longestOfflineSec: 0,
    },
    materials: defaultMaterialsState(),
    forge: defaultForgeState(),
    assay: defaultAssayState(),
    offline: null,
    feed: [],
  };
}
