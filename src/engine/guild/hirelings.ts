/**
 * HIRELINGS — the phase's idle payoff, built to be constitutionally unable
 * to break pillar 2: nobody here mines. They handle, sort, sell, carry, and
 * stand between you and teeth. The hawker's sales pay SCRIP (a parallel
 * economy, not chip income); the porter raises offline efficiency inside its
 * existing 0.95 cap; the tender and stoker are small percentages on systems
 * already regen-bounded.
 *
 * No wages, no upkeep — recurring costs punish being away, and this game
 * doesn't do that. Hire once; they work.
 *
 * PERMANENT DEATH is a Cinder mechanic. The interface exists (status,
 * harmHireling), the switch is OFF, and nothing in Phases 0-6 flips it.
 */
import { D } from '../decimal';
import type { ActionResult, EngineCtx, GameState } from '../types';
import { addCurrency, spendCurrency } from '../resources';
import { registerModifier, type Bucket } from '../modifiers';
import { lawFlag } from '../laws';
import type { ModifierCache } from '../modifiers';
import { materialDef } from '../materials';
import { assayUnlocked, crackGeode, startAssay } from '../systems/drops';
import { consumeMaterial } from '../systems/forge';

/** Phase 9: the switch is ON. The ONLY fatal call site is floodRun() — a
 * hireling falls exactly when a flood completes with crew still stationed,
 * the casualty named on the OVERPRESSURE banner beforehand. Never a roll. */
export const HIRELING_DEATH_ENABLED = true;

export interface HirelingDef {
  npcId: string;
  title: string;
  desc: string;
  cost: number; // scrip
  /** A bark for the crew card. */
  bark: string;
  /** Passive modifier face, if any. */
  passive?: { bucket: Bucket; base: number; perLevel: number };
  /** Active behavior on a cadence (ms of game clock). */
  activeEveryMs?: number;
  /**
   * WHAT THIS HAND IS LIKE ON THE ROAD. Expeditions read this.
   *
   * Before Phase 14 crews were interchangeable — the panel let you pick one and
   * the pick changed nothing, which made a roster of named characters into a
   * dropdown. Traits are AUTHORED per person rather than rolled, and derived
   * from the def plus their level, so they need no save state and every
   * existing crew has one the moment the game loads.
   */
  expedition?: {
    /** Two or three words, shown on the crew card. */
    trait: string;
    /** Why they are like that, in their own register. */
    note: string;
    /** Multiplies material returned. */
    haulMult?: number;
    /** Added to the route's relic chance, 0..1. */
    relicAdd?: number;
    /** Multiplies time on the road — below 1 is faster. */
    speedMult?: number;
  };
  /**
   * THE SECOND TRAIT (Phase 15) — what a VETERAN hand develops, revealed at
   * level 5. A development of the person, never a second copy of their first
   * trait: Brakka starts reading the ground, Ruta starts walking the last mile
   * twice. Derived from level, so it costs no save state.
   */
  expedition2?: {
    trait: string;
    note: string;
    haulMult?: number;
    relicAdd?: number;
    speedMult?: number;
  };
}

export const HIRELING_DEFS: HirelingDef[] = [
  {
    npcId: 'brakka', title: 'Drill-tender', cost: 60,
    desc: 'Keeps the bay singing in tune. Drill speed up — still regen-bound, as all things are.',
    bark: 'Bay four\'s flat again. Not on my shift.',
    passive: { bucket: 'drillSpeed', base: 1.05, perLevel: 0.008 },
    expedition: { trait: "Keeps the pace", note: "Treats a march like a machine that has gone out of tune, and fixes it.", speedMult: 0.85 },
    expedition2: { trait: "Reads the ground", note: "Started keeping notes on which stretches ate boots. The notes turned out to be a map.", relicAdd: 0.06, speedMult: 0.95 },
  },
  {
    npcId: 'grist', title: 'Stoker', cost: 50,
    desc: 'Banks the kiln so it never runs cold. Converter intake up.',
    bark: 'Heat\'s a promise. I keep those.',
    passive: { bucket: 'kilnRate', base: 1.05, perLevel: 0.008 },
    expedition: { trait: "Burns long", note: "Walks after everyone else has stopped, on the theory that heat is a promise.", haulMult: 1.25 },
    expedition2: { trait: "Banks the fire", note: "Leaves a fire that is still going when the next crew arrives. Nobody asked for this.", haulMult: 1.1, speedMult: 0.95 },
  },
  {
    npcId: 'tally', title: 'Assay clerk', cost: 70,
    desc: 'Starts surveys the moment the table is free. The ledger fills itself.',
    bark: 'Filed. Next.',
    activeEveryMs: 8_000,
    expedition: { trait: "Catalogues everything", note: "Comes back with things nobody else thought were things.", haulMult: 1.15, relicAdd: 0.05 },
    expedition2: { trait: "Knows the worth", note: "Stopped bringing back everything and started bringing back the right things.", haulMult: 1.2 },
  },
  {
    npcId: 'fenn', title: 'Geode hand', cost: 70,
    desc: 'Cracks a geode from your stores every minute or so, and listens first.',
    bark: 'Ooh. This one\'s ARGUING.',
    activeEveryMs: 75_000,
    expedition: { trait: "An eye for the odd", note: "Stops for what the rest of the crew steps over. Usually right.", relicAdd: 0.15 },
    expedition2: { trait: "Listens first", note: "Holds a thing to their ear before deciding it is worth carrying. Success rate: irritating.", haulMult: 1.15, relicAdd: 0.06 },
  },
  {
    npcId: 'pell', title: 'Porter', cost: 80,
    desc: 'Hauls while you\'re gone. Offline efficiency up (inside its usual cap).',
    bark: 'Up, down. Down, up. The mountain and I have an understanding.',
    passive: { bucket: 'offlineEffAdd', base: 0.02, perLevel: 0.003 },
    expedition: { trait: "Carries impossible loads", note: "Nobody has worked out where it all goes. Pell will not be drawn.", haulMult: 1.5, speedMult: 1.1 },
    expedition2: { trait: "Packs the load", note: "Worked out that how you stack it matters more than how much. Walks faster now, carrying more.", haulMult: 1.1, speedMult: 0.85 },
  },
  {
    npcId: 'sef', title: 'Hawker', cost: 90,
    desc: 'Sells your surplus commons for Scrip while you dig. Takes a knowing cut.',
    bark: 'Sold the ugly ones first. Sentiment\'s bad shelving.',
    activeEveryMs: 180_000,
    expedition: { trait: "Comes back richer", note: "Left with rope and a grudge. Returned with neither and two crates.", haulMult: 1.3 },
    expedition2: { trait: "Knows a man", note: "There is somebody at every gate who owes Sef a favour, and Sef remembers all of them.", haulMult: 1.1, relicAdd: 0.05 },
  },
  {
    npcId: 'ruta', title: 'Shield-bearer', cost: 110,
    desc: 'Stands beside you in the lanes. More health, steady mending.',
    bark: 'You swing. I stand.',
    expedition: { trait: "Loses nothing", note: "Slower, because Ruta counts the packs at every rest and will not be hurried.", haulMult: 1.05, relicAdd: 0.08, speedMult: 1.15 },
    expedition2: { trait: "Walks it twice", note: "Goes back over the last mile before making camp. Has found three things that way, and one of them was a person.", haulMult: 1.1, relicAdd: 0.07 },
  },
  {
    npcId: 'moth', title: 'Lattice sweeper', cost: 80,
    desc: 'Dusts the board and hums to it. Motif accrual up.',
    bark: 'The stones like being remembered.',
    passive: { bucket: 'motifGain', base: 1.05, perLevel: 0.008 },
    expedition: { trait: "Misses nothing", note: "Sweeps the floor of a place the way the Lattice gets swept. Quietly.", haulMult: 1.1, relicAdd: 0.1 },
    expedition2: { trait: "Hums the way back", note: "Has never once needed the rope-line. Will not explain how, and hums the entire time.", relicAdd: 0.08, speedMult: 0.85 },
  },
  {
    npcId: 'hob', title: 'Camp cook', cost: 45,
    desc: 'A fed delver learns faster. XP up. Don\'t ask what\'s in it.',
    bark: 'Eat. EAT.',
    passive: { bucket: 'xpGain', base: 1.04, perLevel: 0.006 },
    expedition: { trait: "The crew goes further fed", note: "Hob's presence is worth a mile a day and everybody knows it.", haulMult: 1.1, speedMult: 0.9 },
    expedition2: { trait: "Feeds the road", note: "Cooks for whoever is at the fire, including strangers. The strangers tend to mention useful things.", haulMult: 1.15, relicAdd: 0.05 },
  },
  {
    npcId: 'jib', title: 'Caravan runner', cost: 90,
    desc: 'Runs Serra\'s road ahead of you. Caravan fees down.',
    bark: 'Beat my own time twice today. Both times were me.',
    expedition: { trait: "Runs the road", note: "Beat the Short Walk record three times. Twice it was against himself.", speedMult: 0.7 },
    expedition2: { trait: "Runs it blind", note: "Learned the route well enough to run it in the dark, which is the only time the route is quiet.", haulMult: 1.15, speedMult: 0.85 },
  },
];

export const HIRELING_BY_NPC = new Map(HIRELING_DEFS.map((h) => [h.npcId, h]));

export function hirelingLevel(xp: number): number {
  return Math.min(10, Math.floor(Math.sqrt(xp / 120)));
}

export function hiredCount(state: GameState): number {
  return Object.keys(state.guild.hirelings).length;
}

export function hireCost(state: GameState, def: HirelingDef): number {
  return Math.round(def.cost * Math.pow(1.35, hiredCount(state)));
}

export function hire(state: GameState, ctx: EngineCtx, npcId: string): ActionResult {
  const def = HIRELING_BY_NPC.get(npcId);
  if (!def) return { ok: false, reason: 'Not for hire' };
  if (state.guild.hirelings[npcId]) return { ok: false, reason: 'Already on the crew' };
  if (hiredCount(state) >= state.guild.berths) return { ok: false, reason: 'No free berth — the crew loft is full' };
  const cost = hireCost(state, def);
  if (!spendCurrency(state, 'scrip', D(cost))) return { ok: false, reason: `${cost} Scrip to sign on` };
  state.guild.hirelings[npcId] = { level: 0, xp: 0, status: 'well', hiredAtMs: state.guild.clockMs };
  ctx.dirty();
  ctx.emit({ type: 'hired', npcId });
  return { ok: true };
}

/** The Cinder interface. Until that shell exists this can only bruise. */
export function harmHireling(state: GameState, npcId: string, fatal: boolean): void {
  const h = state.guild.hirelings[npcId];
  if (!h) return;
  if (fatal && HIRELING_DEATH_ENABLED) h.status = 'fallen';
  else h.status = 'hurt'; // heals on next guild tick — no lasting harm before Cinder
}

function grantHirelingXp(state: GameState, npcId: string, xp: number): void {
  const h = state.guild.hirelings[npcId];
  if (!h) return;
  h.xp += xp;
  h.level = hirelingLevel(h.xp);
}

/** Combat contribution (Ruta). combat.ts reads this — no separate leveling. */
export function hirelingCombat(state: GameState): { hp: number; regen: number } {
  const h = state.guild.hirelings['ruta'];
  if (!h || h.status === 'fallen') return { hp: 0, regen: 0 };
  return { hp: 6 + 1.2 * h.level, regen: 0.5 + 0.05 * h.level };
}

/** Caravan fee reduction (Jib), in absolute points off the fee. */
export function runnerFeeCut(state: GameState): number {
  const h = state.guild.hirelings['jib'];
  if (!h) return 0;
  return 0.015 + 0.002 * h.level;
}

// ---------------------------------------------------------------------------
// The working tick — active hirelings act on the game clock.
// ---------------------------------------------------------------------------

/** Surplus threshold: the hawker never touches your working stock. */
export const HAWKER_KEEP = 30;
export const SELL_PRICE: Record<string, number> = { common: 1, rich: 3, pure: 8, flawless: 20, starred: 50, aberrant: 50 };

/** One hawker pass: a small basket off the top of the surplus, commons and
 * rich only, at a steep cut — Sef pays for CONVENIENCE, contracts pay for
 * work. He must never out-earn the board. */
export function hawkerPass(state: GameState, mods: ModifierCache): number {
  let scrip = 0;
  let basket = 0;
  for (const [matId, bands] of Object.entries(state.materials.stacks)) {
    if (basket >= 8) break;
    let def;
    try { def = materialDef(matId); } catch { continue; }
    if (def.source) continue; // combat drops are Ashka's trade, not Sef's
    if (def.rarity !== 'common' && def.rarity !== 'rich') continue;
    let count = 0;
    for (const band of Object.values(bands)) count += band?.count ?? 0;
    const surplus = count - HAWKER_KEEP;
    if (surplus <= 0) continue;
    const toSell = Math.min(surplus, 8 - basket);
    basket += toSell;
    consumeMaterial(state, matId, toSell);
    scrip += toSell * (SELL_PRICE[def.rarity] ?? 1) * 0.35; // the knowing cut
  }
  if (scrip > 0) {
    const paid = Math.max(1, Math.round(scrip * mods.get(state, 'scripGain').toNumber()));
    addCurrency(state, 'scrip', D(paid));
    grantHirelingXp(state, 'sef', 6);
    return paid;
  }
  return 0;
}

export function tickHirelings(state: GameState, mods: ModifierCache, ctx: EngineCtx): void {
  const now = state.guild.clockMs;
  const timers = state.guild.timers;
  // Recalled crew re-station themselves once the shaft cools under 70.
  if (state.guild.crewRecalled && state.pressure.heat < 70) {
    state.guild.crewRecalled = false;
    ctx.emit({ type: 'crewRestationed' });
  }
  // THE DEEP POST (law): recalled crew keep working from the stair.
  if (state.guild.crewRecalled && !lawFlag(state, 'crewAlwaysWorks')) return; // off the floor: nobody works, nobody dies
  for (const [npcId, h] of Object.entries(state.guild.hirelings)) {
    if (h.status === 'fallen') continue; // the wake is a quiet berth
    if (h.status === 'hurt') h.status = 'well'; // bruises fade
    const def = HIRELING_BY_NPC.get(npcId);
    if (!def) continue;
    // Passive workers learn slowly on the job.
    if (def.passive && now - (timers[`xp.${npcId}`] ?? 0) > 120_000) {
      timers[`xp.${npcId}`] = now;
      grantHirelingXp(state, npcId, 2);
    }
    if (!def.activeEveryMs) continue;
    if (now - (timers[npcId] ?? 0) < def.activeEveryMs) continue;
    timers[npcId] = now;
    if (npcId === 'tally') {
      if (assayUnlocked(state) && !state.assay.active) {
        startAssay(state, mods);
        grantHirelingXp(state, npcId, 4);
      }
    } else if (npcId === 'fenn') {
      if (state.materials.geodes > 0) {
        crackGeode(state, mods, ctx);
        grantHirelingXp(state, npcId, 5);
      }
    } else if (npcId === 'sef') {
      hawkerPass(state, mods);
    }
  }
}

/** Offline: the hawker keeps selling at his usual cadence (closed form). */
export function offlineHawkerScrip(state: GameState, mods: ModifierCache, seconds: number): number {
  if (!state.guild.hirelings['sef']) return 0;
  const passes = Math.floor(seconds / 180);
  let total = 0;
  for (let i = 0; i < passes; i++) {
    const paid = hawkerPass(state, mods);
    if (paid === 0) break; // surplus exhausted — he naps
    total += paid;
  }
  return total;
}

/** Passive modifier faces, registered once at content load. */
export function registerHirelingModifiers(): void {
  for (const def of HIRELING_DEFS) {
    if (!def.passive) continue;
    const { bucket, base, perLevel } = def.passive;
    const additive = bucket === 'offlineEffAdd';
    registerModifier({
      id: `hireling.${def.npcId}`,
      label: `${def.title} (crew)`,
      bucket,
      value: (s) => {
        const h = s.guild.hirelings[def.npcId];
        if (!h || h.status === 'fallen' || (s.guild.crewRecalled && !lawFlag(s, 'crewAlwaysWorks'))) return additive ? 0 : 1;
        return additive ? base + perLevel * h.level : base + perLevel * h.level;
      },
    });
  }
}
