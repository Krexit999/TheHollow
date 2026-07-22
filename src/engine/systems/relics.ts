/**
 * RELICS — the one system where the things you already did become gear.
 *
 * The brief was explicit: rolled affixes must NOT create a re-roll treadmill
 * that punishes bad luck. Three rules make that structurally impossible rather
 * than merely unlikely:
 *
 *  1. AFFIXES COME FROM CONTEXT, NOT FROM A BLIND ROLL. What a relic can carry
 *     is decided by where and how you found it — a relic pulled out of Cinder
 *     at heat carries heat-flavoured affixes; one from a Warren carries that
 *     Warren's. The roll is therefore STEERABLE: you farm the context you want
 *     instead of rerolling a slot machine. Magnitude still varies; the SHAPE
 *     never surprises you.
 *
 *  2. FUSION KEEPS THE BETTER OF EACH AFFIX AND NEVER DESTROYS. Feeding a relic
 *     into another raises the keeper toward the best of both. A duplicate is
 *     therefore always progress and never waste, which converts variance from a
 *     punishment into a supply of upgrade material. There is no "bad roll",
 *     only material.
 *
 *  3. THE FLOOR RISES. Each rarity's minimum roll climbs with museum/codex
 *     completion, so a late Mythic can never roll worse than an early one.
 *
 * PILLAR 2: no affix grants flat income. Every one lands in a modifier bucket
 * that raises yield / regen / capacity — which moves the ceiling exactly the
 * way a face upgrade does — or touches something outside the income path
 * entirely (drop rates, combat, craft ranks). Nothing bypasses the field.
 */
import type { EngineCtx, GameState, RelicInstance, RelicsState } from '../types';
import { registerModifier, foldBonus, type Bucket } from '../modifiers';

export const RELIC_SLOTS = 6;
export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Fabled', 'Mythic'] as const;
export type Rarity = (typeof RARITIES)[number];

/** Affix pools by CONTEXT. The context you farm decides the shape you get. */
export interface RelicAffixDef {
  /** TYPED, not string: a typo is now a compile error, not a silent no-op. */
  bucket: Bucket;
  label: string;
  /** Magnitude per rarity step, before the floor and the roll. */
  per: number;
}

/**
 * Twenty affixes across every bucket the modifier layer owns (Phase 14; shipped
 * with seven). Seven meant a player had seen the entire possibility space
 * inside an hour, which quietly undercuts the anti-treadmill design: variance is
 * only interesting when the shape you are hunting is one of many.
 *
 * Bucket ids here are the REAL modifier buckets — these strings are what the
 * registration loop feeds to registerModifier, so a typo would silently create
 * a bucket nothing reads.
 */
export const AFFIXES: Record<string, RelicAffixDef> = {
  // The field — these move the ceiling, exactly as an upgrade does.
  dustYield: { bucket: 'dustYield', label: 'Yield', per: 0.04 },
  regen: { bucket: 'regen', label: 'Regen', per: 0.04 },
  cap: { bucket: 'cap', label: 'Capacity', per: 0.05 },
  // The machines.
  drillSpeed: { bucket: 'drillSpeed', label: 'Drill speed', per: 0.05 },
  drillPower: { bucket: 'drillPower', label: 'Drill bite', per: 0.05 },
  kilnRate: { bucket: 'kilnRate', label: 'Converter intake', per: 0.05 },
  kilnHeatRamp: { bucket: 'kilnHeatRamp', label: 'Heat-up', per: 0.07 },
  brickYield: { bucket: 'brickYield', label: 'Converter output', per: 0.04 },
  // Outside the income path entirely.
  dropRate: { bucket: 'dropRate', label: 'Find rate', per: 0.06 },
  scripGain: { bucket: 'scripGain', label: 'Scrip', per: 0.07 },
  xpGain: { bucket: 'xpGain', label: 'Delver XP', per: 0.06 },
  assaySpeed: { bucket: 'assaySpeed', label: 'Survey speed', per: 0.1 },
  motifGain: { bucket: 'motifGain', label: 'Motifs', per: 0.06 },
  strikePower: { bucket: 'strikePower', label: 'Strike', per: 0.06 },
  chainPower: { bucket: 'chainPower', label: 'Chain', per: 0.05 },
  descendCost: { bucket: 'descendCost', label: 'Cheaper descent', per: -0.02 },
  offlineEff: { bucket: 'offlineEffAdd', label: 'Offline', per: 0.008 },
  // --- Phase 15: thirteen more, so a pool is a hunt and not a list -------
  // Each bucket now carries MULTIPLE affixes at different magnitudes, which is
  // what makes a fused relic interesting: two relics can both roll 'yield' and
  // one still be the better keeper.
  deepYield: { bucket: 'dustYield', label: 'Deep yield', per: 0.07 },
  surgeRegen: { bucket: 'regen', label: 'Surge', per: 0.07 },
  deepCap: { bucket: 'cap', label: 'Deep capacity', per: 0.08 },
  hardDrill: { bucket: 'drillPower', label: 'Hard bite', per: 0.08 },
  quickDrill: { bucket: 'drillSpeed', label: 'Quick bay', per: 0.08 },
  bankedHeat: { bucket: 'kilnHeatRamp', label: 'Banked heat', per: 0.11 },
  fatSeam: { bucket: 'dropRate', label: 'Fat seam', per: 0.1 },
  keenEdge: { bucket: 'strikePower', label: 'Keen edge', per: 0.1 },
  longChain: { bucket: 'chainPower', label: 'Long chain', per: 0.08 },
  richLedger: { bucket: 'scripGain', label: 'Rich ledger', per: 0.11 },
  fastStudy: { bucket: 'xpGain', label: 'Fast study', per: 0.1 },
  brightMotif: { bucket: 'motifGain', label: 'Bright motif', per: 0.09 },
  shortStair: { bucket: 'descendCost', label: 'Short stair', per: -0.035 },
};

/** Where a relic came from, and what that context lets it carry. */
export interface RelicSourceDef {
  id: string;
  name: string;
  pool: string[];
}

/**
 * Each context carries a WIDER pool now, but still a CHARACTERISTIC one — the
 * whole anti-treadmill argument is that you can steer the hunt, which requires
 * the pools to stay recognisably different from each other.
 */
export const SOURCES: RelicSourceDef[] = [
  { id: 'depth', name: 'the deep shaft', pool: ['dustYield', 'regen', 'cap', 'drillPower', 'descendCost', 'deepYield', 'deepCap', 'hardDrill', 'shortStair'] },
  { id: 'warren', name: 'a Warren', pool: ['dropRate', 'xpGain', 'cap', 'strikePower', 'motifGain', 'fatSeam', 'keenEdge', 'brightMotif', 'fastStudy'] },
  { id: 'anomaly', name: 'an anomaly', pool: ['dustYield', 'dropRate', 'xpGain', 'motifGain', 'chainPower', 'brightMotif', 'longChain', 'surgeRegen'] },
  { id: 'well', name: 'a Magma Well', pool: ['dustYield', 'drillSpeed', 'scripGain', 'kilnRate', 'brickYield', 'quickDrill', 'bankedHeat', 'richLedger'] },
  { id: 'expedition', name: 'an expedition', pool: ['dropRate', 'scripGain', 'drillSpeed', 'assaySpeed', 'offlineEff', 'richLedger', 'fatSeam', 'quickDrill'] },
  { id: 'warden', name: 'a felled warden', pool: ['strikePower', 'dustYield', 'chainPower', 'kilnHeatRamp', 'offlineEff', 'keenEdge', 'deepYield', 'longChain'] },
];

export const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s]));

/** Deterministic 0..1 from an integer seed — relics never re-roll, so the
 * seed IS the relic and a save round-trip cannot change what you found. */
function rand01(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** The rising floor: completion raises the minimum roll, never the maximum. */
export function rollFloor(state: GameState): number {
  return Math.min(0.6, state.relics.floorBonus);
}

/**
 * Mint a relic from a CONTEXT plus a seed. Rarity and magnitudes vary; which
 * affixes can appear does not — that is the anti-treadmill guarantee.
 */
export function mintRelic(state: GameState, sourceId: string, seed: number): RelicInstance {
  const src = SOURCE_BY_ID.get(sourceId) ?? SOURCES[0]!;
  const r0 = rand01(seed);
  // Rarity: weighted low, but the floor lifts the whole curve as you complete.
  const lift = rollFloor(state);
  const rarity = Math.min(4, Math.floor((r0 ** 2.2) * 5 + lift * 2));
  const count = 1 + Math.min(2, Math.floor(rarity / 2)); // 1..3 affixes
  const affixes: Record<string, number> = {};
  for (let i = 0; i < count; i++) {
    const key = src.pool[(seed + i * 7) % src.pool.length]!;
    const def = AFFIXES[key]!;
    const roll = lift + (1 - lift) * rand01(seed * 31 + i * 17);
    // Magnitude scales with rarity and the roll; floor guarantees a minimum.
    const mag = def.per * (rarity + 1) * (0.5 + 0.5 * roll);
    affixes[key] = Math.max(affixes[key] ?? 0, Math.round(mag * 1000) / 1000);
  }
  return {
    uid: state.relics.nextUid,
    defId: `${sourceId}-${rarity}`,
    rarity,
    affixes,
    source: sourceId,
    fusedFrom: 0,
  };
}

export function addRelic(state: GameState, relic: RelicInstance): RelicInstance {
  const held = { ...relic, uid: state.relics.nextUid };
  state.relics.nextUid += 1;
  state.relics.held.push(held);
  state.relics.found += 1;
  return held;
}

/**
 * FUSION — the keeper takes the better of each affix from both, and gains any
 * affix it lacked. The fed relic is consumed; nothing is ever lost, because
 * everything it carried is now on the keeper (or already beaten by it).
 */
export function fuseRelics(state: GameState, keepUid: number, feedUid: number): { ok: boolean; reason?: string } {
  if (keepUid === feedUid) return { ok: false, reason: 'A relic cannot be fused into itself' };
  const keep = state.relics.held.find((r) => r.uid === keepUid);
  const feed = state.relics.held.find((r) => r.uid === feedUid);
  if (!keep || !feed) return { ok: false, reason: 'No such relic' };
  // A LOCKED relic is never consumed. Note it is only ever the FED one that is
  // eaten, so a locked relic can still be the KEEPER and be improved by a fusion.
  if (feed.locked) return { ok: false, reason: 'That one is locked — unlock it first' };

  for (const [k, v] of Object.entries(feed.affixes)) {
    keep.affixes[k] = Math.max(keep.affixes[k] ?? 0, v);
  }
  // The keeper's rarity rises to the better of the two; fusing never demotes.
  keep.rarity = Math.max(keep.rarity, feed.rarity);
  keep.fusedFrom += 1 + feed.fusedFrom;

  state.relics.held = state.relics.held.filter((r) => r.uid !== feedUid);
  state.relics.equipped = state.relics.equipped.filter((u) => u !== feedUid);
  state.relics.fused += 1;
  return { ok: true };
}

/**
 * What a given fusion would actually do, computed from the SAME rules
 * fuseRelics applies. It lives here rather than in the panel so the two cannot
 * drift: if the fusion rule changes and this is not updated, the test that
 * replays a preview against a real fusion fails.
 *
 * Needed because the Relics panel used to feed whichever relic happened to sit
 * first in the list — fusion was directed in the engine and blind in the UI, so
 * the player could not tell which of two relics was about to be eaten.
 */
export interface FusionPreview {
  /** Lines the keeper does not have at all and would gain. */
  gained: Array<{ key: string; label: string; value: number }>;
  /** Lines both carry, where the fed relic is stronger. */
  improved: Array<{ key: string; label: string; from: number; to: number }>;
  /** Lines the keeper already beats — carried in, but changing nothing. */
  wasted: Array<{ key: string; label: string }>;
  /** Whether the keeper's rarity would rise. */
  rarityUp: boolean;
}

export function fusionPreview(state: GameState, keepUid: number, feedUid: number): FusionPreview | null {
  if (keepUid === feedUid) return null;
  const keep = state.relics.held.find((r) => r.uid === keepUid);
  const feed = state.relics.held.find((r) => r.uid === feedUid);
  if (!keep || !feed) return null;

  const out: FusionPreview = { gained: [], improved: [], wasted: [], rarityUp: feed.rarity > keep.rarity };
  for (const [key, value] of Object.entries(feed.affixes)) {
    const label = AFFIXES[key]?.label ?? key;
    const have = keep.affixes[key];
    if (have === undefined) out.gained.push({ key, label, value });
    else if (value > have) out.improved.push({ key, label, from: have, to: value });
    else out.wasted.push({ key, label });
  }
  return out;
}

/**
 * THE LOCK. A player-set keep-forever mark on one relic. It guards the only two
 * paths that ever consume a relic — being FED into a fusion, and being given to a
 * Museum case — so a good roll can never be spent by a mis-tap. It is purely
 * protective: it costs nothing, blocks no bonus, and is not a stat. Wearing,
 * taking off, and fusing INTO a locked relic all still work, because none of
 * those destroy it.
 */
export function toggleRelicLock(state: GameState, uid: number): { ok: boolean; reason?: string; data?: { locked: boolean } } {
  const relic = state.relics.held.find((r) => r.uid === uid);
  if (!relic) return { ok: false, reason: 'You do not hold that' };
  relic.locked = !relic.locked;
  return { ok: true, data: { locked: !!relic.locked } };
}

export function equipRelic(state: GameState, uid: number, slot: number): { ok: boolean; reason?: string } {
  if (slot < 0 || slot >= RELIC_SLOTS) return { ok: false, reason: 'No such slot' };
  if (!state.relics.held.some((r) => r.uid === uid)) return { ok: false, reason: 'You do not hold that' };
  state.relics.equipped = state.relics.equipped.filter((u) => u !== uid);
  const next = [...state.relics.equipped];
  while (next.length < RELIC_SLOTS) next.push(-1);
  next[slot] = uid;
  state.relics.equipped = next.filter((u) => u >= 0);
  return { ok: true };
}

/** The equipped set's contribution to a bucket — read by the modifier layer. */
export function relicBonus(state: GameState, bucket: Bucket): number {
  let total = 0;
  for (const uid of state.relics.equipped) {
    const r = state.relics.held.find((x) => x.uid === uid);
    if (r) total += r.affixes[bucket] ?? 0;
  }
  return total;
}

/**
 * Relic affixes enter the game the same way every other bonus does: as named
 * modifier sources the breakdown popover can show. PILLAR 2 holds because each
 * bucket here either raises yield/regen/capacity — which moves the ceiling
 * exactly as a face upgrade does — or sits outside the income path entirely
 * (find rate, Scrip, XP). Nothing grants flat income.
 */
export function registerRelicModifiers(): void {
  const buckets = new Set(Object.values(AFFIXES).map((a) => a.bucket));
  for (const bucket of buckets) {
    // Two guards, both structural. `bucket` is typed, so a misspelled name is
    // a compile error rather than a source registering into nothing. And
    // foldBonus knows which buckets sum and which multiply, so the `1 + bonus`
    // mistake — which adds a flat 1.0 to an ADDITIVE bucket and detonates the
    // offline formula — cannot be written here at all.
    registerModifier({
      id: `relics.${bucket}`,
      label: 'Relics',
      bucket,
      value: (s) => foldBonus(bucket, relicBonus(s, bucket)),
    });
  }
}

/**
 * THE SOURCES. Everything above this line was written in Phase 12 and called by
 * nothing: relics never dropped, so the Relics room never appeared, so the
 * Museum never appeared either. Two finished systems sat unreachable behind a
 * missing call site. This is the function that makes them exist.
 *
 * Deliberately thin: a small chance riding the harvest rhythm the drop table
 * already uses, plus explicit grants from the places that should obviously give
 * one. Deep rock is the common source; the rest are flavoured by context, which
 * is the whole anti-treadmill argument.
 */
export function maybeDropRelic(
  state: GameState,
  ctx: EngineCtx,
  sourceId: string,
  chance: number,
): RelicInstance | null {
  if (chance <= 0 || Math.random() >= chance) return null;
  return grantRelic(state, ctx, sourceId);
}

/** An unconditional relic from a named context (a cleared Warren, a won Well). */
export function grantRelic(state: GameState, ctx: EngineCtx, sourceId: string): RelicInstance {
  // The seed IS the relic: a save round-trip can never re-roll what you found.
  const seed = state.relics.nextUid * 7919 + Math.floor(state.stats.playTimeSec);
  const held = addRelic(state, mintRelic(state, sourceId, seed));
  ctx.emit({ type: 'relicFound', relicId: String(held.uid), rarity: RARITIES[held.rarity] ?? 'Common', source: sourceId });
  ctx.dirty();
  return held;
}

/** Depth is the common source: rarer than an ore drop, and it scales with how
 * deep the rock is rather than how hard you are working it. */
export function relicChanceForDepth(state: GameState): number {
  return Math.min(0.02, 0.0008 + state.depth * 0.00004);
}

export function defaultRelicsState(): RelicsState {
  return { held: [], equipped: [], nextUid: 1, found: 0, fused: 0, floorBonus: 0 };
}
