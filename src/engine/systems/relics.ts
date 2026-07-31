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
import { registerModifier, foldBonus, isBucket, type Bucket } from '../modifiers';
import { spendCurrency, getCurrency } from '../resources';
import { D } from '../decimal';
import {
  POWER_BUCKETS, pairMultiplier, powerOf, relicPowerBonus, relicRule,
} from './relicPowers';

export const RELIC_SLOTS = 6;
export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Fabled', 'Mythic'] as const;
export type Rarity = (typeof RARITIES)[number];

/**
 * IS THIS RELIC SET IN THE TOOL? (A.64 sockets.)
 *
 * The Forge's Sockets part can now hold a real relic, and a relic is worn OR
 * socketed and never both — otherwise two registrars would fold the same
 * affixes and the socket would be a straight double-count.
 *
 * WIRED rather than imported because `toolSockets` reads `currentTool`, so
 * importing it here would drag `casting` and everything under it into the relic
 * module. Same pattern and same reason as `wireHandCarrier`. The fallback is
 * `false`, which is exactly the pre-socket behaviour — so if this is ever left
 * unwired the relic system behaves as it always did rather than throwing.
 */
let socketedRelic: (state: GameState, uid: number) => boolean = () => false;
export function wireSocketed(fn: typeof socketedRelic): void { socketedRelic = fn; }
export function isSocketedRelic(state: GameState, uid: number): boolean {
  return socketedRelic(state, uid);
}

/** Worn OR set in the tool — the "you cannot destroy this" set. */
function spokenFor(state: GameState): Set<number> {
  const out = new Set(state.relics.equipped);
  for (const r of state.relics.held) if (socketedRelic(state, r.uid)) out.add(r.uid);
  return out;
}

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
    /*
     * KEEP THE BIGGEST BY MAGNITUDE, NOT THE BIGGEST NUMBER.
     *
     * `Math.max(affixes[key] ?? 0, mag)` was here to keep the better roll when
     * the same key comes up twice, and it silently destroyed every NEGATIVE
     * affix in the game: `descendCost` (-0.02) and `shortStair` (-0.035) are
     * cost REDUCTIONS, so `Math.max(0, negative)` is 0, and both have always
     * minted at exactly zero and done nothing. Both sit in the `depth` pool —
     * the one every relic from the shaft rolls out of.
     *
     * Same family as the `affixBucketBonus` bug (A.68, 44% of affixes inert),
     * and found the same way: by making the panel print the real magnitude
     * instead of a name, at which point a relic reading "0.0% Cheaper descent"
     * is impossible to miss.
     */
    const rounded = Math.round(mag * 1000) / 1000;
    const prev = affixes[key];
    affixes[key] = prev === undefined || Math.abs(rounded) > Math.abs(prev) ? rounded : prev;
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

/**
 * THE HOLD IS FINITE (A.46). Two hundred commons in an infinite scroll is not
 * a collection, it is a chore with a scrollbar — and it made the correct play
 * "fuse everything into everything", which is no play at all.
 *
 * The cap does NOT block a find. Losing the thing you just earned to a full
 * bag is the worst possible reading of a reward, so the pile renders itself
 * down instead: the weakest unlocked, unequipped relic becomes SHARDS, which
 * are what fusion costs. The clutter turns into the currency that improves
 * what you kept.
 */
export const RELIC_HOLD_CAP = 40;

/** DEEP POCKETS is a rule power: it moves the cap itself rather than paying a
 *  percentage of something. Every read of the cap goes through here. */
export function holdCap(state: GameState): number {
  return RELIC_HOLD_CAP + (relicRule(state, 'deepPockets') ? 25 : 0);
}

/** What a relic is worth rendered down. Rarity is most of it. */
export function shardValue(relic: RelicInstance): number {
  return (relic.rarity + 1) * 2 + relic.fusedFrom;
}

/** Weakest first: rarity, then affix weight, then age. Never locked or worn. */
function renderCandidates(state: GameState): RelicInstance[] {
  // SPOKEN FOR = worn or set in the tool. Auto-scrap runs unattended, so a
  // socketed relic missing from this set would be the worst possible bug: the
  // standing order quietly eating the relic in your pickaxe.
  const worn = spokenFor(state);
  return state.relics.held
    .filter((r) => !r.locked && !worn.has(r.uid))
    .sort((a, b) => {
      if (a.rarity !== b.rarity) return a.rarity - b.rarity;
      const wa = Object.values(a.affixes).reduce((x, y) => x + y, 0);
      const wb = Object.values(b.affixes).reduce((x, y) => x + y, 0);
      if (wa !== wb) return wa - wb;
      return a.uid - b.uid;
    });
}

/** Render one relic down by hand. Locked and equipped are never touched. */
export function renderRelic(state: GameState, uid: number): { ok: boolean; reason?: string; data?: { shards: number } } {
  const r = state.relics.held.find((x) => x.uid === uid);
  if (!r) return { ok: false, reason: 'No such relic' };
  if (r.locked) return { ok: false, reason: 'That one is locked — unlock it first' };
  if (state.relics.equipped.includes(uid)) return { ok: false, reason: 'It is being carried. Take it off first' };
  if (socketedRelic(state, uid)) return { ok: false, reason: 'It is set in your tool. Pull it out first' };
  const gained = shardValue(r);
  state.relics.held = state.relics.held.filter((x) => x.uid !== uid);
  state.relics.shards += gained;
  return { ok: true, data: { shards: gained } };
}

/**
 * AUTO-SCRAP (A.49) — the standing order, checked at the door.
 *
 * Deliberately a decision about the ARRIVING relic and nothing else: it never
 * sweeps the hold, so switching it on can never eat something you already
 * decided to keep. A relic that carries a power is spared by default, because
 * a power is the whole reason a relic is worth a slot and scrapping one by a
 * rarity rule would be the system fighting the player.
 */
export function autoScrapVerdict(state: GameState, relic: RelicInstance): boolean {
  const rule = state.relics.autoScrap;
  if (!rule?.on) return false;
  if (relic.locked) return false;
  if (rule.keepPowered && powerOf(relic)) return false;
  return relic.rarity <= rule.maxRarity;
}

export function addRelic(state: GameState, relic: RelicInstance): RelicInstance {
  const held = { ...relic, uid: state.relics.nextUid };
  state.relics.nextUid += 1;
  state.relics.found += 1;
  // Turned away at the door and rendered straight down. It still COUNTS as
  // found — the standing order is about the pile, not about the record.
  if (autoScrapVerdict(state, held)) {
    state.relics.shards += shardValue(held);
    return held;
  }
  state.relics.held.push(held);
  // Over the cap, the pile renders itself — weakest first, never the locked,
  // never what you are carrying, and never the one that just arrived.
  while (state.relics.held.length > holdCap(state)) {
    const victim = renderCandidates(state).find((r) => r.uid !== held.uid);
    if (!victim) break; // every spare is locked or worn — keep the overflow
    state.relics.shards += shardValue(victim);
    state.relics.held = state.relics.held.filter((x) => x.uid !== victim.uid);
  }
  return held;
}

/**
 * FUSION — the keeper takes the better of each affix from both, and gains any
 * affix it lacked. The fed relic is consumed; nothing is ever lost, because
 * everything it carried is now on the keeper (or already beaten by it).
 */
/**
 * B4 PULL-THROUGH: curation teaches fusion. RAISING a keeper's rarity through
 * a fusion needs the pattern understood — completed Museum cases, more of them
 * for higher work. Merging affixes at the keeper's own rarity is NEVER gated
 * (the raw fallback: fusion itself always works), and a rarity is never lost.
 * Index = the rarity the keeper would RISE TO (0 Common .. 4 Mythic).
 */
export const MUSEUM_FUSION_NEED = [0, 0, 1, 3, 5] as const;

/** Cases needed to fuse a keeper UP to `rarity`, and how many stand complete. */
export function fusionGate(state: GameState, rarity: number): { need: number; have: number } {
  return { need: MUSEUM_FUSION_NEED[rarity] ?? 0, have: state.museum.completed.length };
}

/**
 * WHAT A FUSION COSTS (A.46 · A.48 · RE-PRICED A.49).
 *
 * A.48 over-corrected and the correction was worse than the fault. It priced
 * Cores linearly in LIFETIME fusions, so the twentieth fusion wanted ~320
 * Cores against a Loam arc that pays 478 in total — which does not make fusion
 * a choice, it ends fusion. Shaping relics is supposed to be the thing you do
 * constantly and feel improve; a price that terminates the verb is not a wall,
 * it is a wall in the wrong place.
 *
 * So the price is re-cut around WHAT the fusion is, not how many you have done:
 *
 *  - SHARDS are the base cost, and they are CHEAP. A first fusion is about
 *    three rendered spares. The gentle 1.18 ramp on the keeper means stacking
 *    a dozen relics into one favourite is a project, not a free lunch — but
 *    the tenth fusion of your life into a fresh relic costs the same as the
 *    first, because it should.
 *  - CORES are a LATE SINK and are ZERO for almost every fusion. They are
 *    charged only when a fusion lifts a relic into the top band — Fabled or
 *    Mythic — which is the rare, deliberate act worth a prestige price.
 *
 * WHY CORES AND NOT RESONANCE (unchanged from A.48). Resonance is SHELL VI's
 * chip currency (`content/shell6/chamber.ts`) and is unobtainable before the
 * sixth world, so pricing fusion in it would strand the system for ~90% of a
 * playthrough — the exact shape of the standing reach rule (the Silica
 * problem). Cores come from the Collapse, which happens in EVERY shell.
 */
export interface FusionPrice {
  shards: number;
  cores: number;
}

/** The rarity a fusion would leave the keeper at. */
export const fusedRarity = (keep: RelicInstance, feed: RelicInstance): number =>
  Math.max(keep.rarity, feed.rarity);

/** Cores are charged only for a lift INTO the top band, and only for the lift. */
export function fusionCoreCost(keep: RelicInstance, feed: RelicInstance): number {
  const to = fusedRarity(keep, feed);
  if (to <= keep.rarity || to < 3) return 0;
  return to === 4 ? 12 : 4;
}

export function fusionCost(state: GameState, keep: RelicInstance, feed?: RelicInstance): FusionPrice {
  void state;
  return {
    shards: Math.round(6 * (keep.rarity + 1) * Math.pow(1.18, keep.fusedFrom)),
    cores: feed ? fusionCoreCost(keep, feed) : 0,
  };
}

/** Everything the price refuses, named. The panel shows this BEFORE the click. */
export function fusionAfford(state: GameState, keep: RelicInstance, feed?: RelicInstance): { ok: boolean; price: FusionPrice; short: string[] } {
  const price = fusionCost(state, keep, feed);
  const short: string[] = [];
  if (state.relics.shards < price.shards) {
    short.push(`${price.shards - Math.floor(state.relics.shards)} more shards`);
  }
  if (price.cores > 0 && getCurrency(state, 'core').lt(price.cores)) {
    short.push(`${price.cores - Math.floor(getCurrency(state, 'core').toNumber())} more Cores`);
  }
  return { ok: short.length === 0, price, short };
}

export function fuseRelics(state: GameState, keepUid: number, feedUid: number): { ok: boolean; reason?: string } {
  if (keepUid === feedUid) return { ok: false, reason: 'A relic cannot be fused into itself' };
  const keep = state.relics.held.find((r) => r.uid === keepUid);
  const feed = state.relics.held.find((r) => r.uid === feedUid);
  if (!keep || !feed) return { ok: false, reason: 'No such relic' };
  // A LOCKED relic is never consumed. Note it is only ever the FED one that is
  // eaten, so a locked relic can still be the KEEPER and be improved by a fusion.
  // Checked BEFORE the price (A.48): "you are short 20 shards" is a wrong answer
  // to "that one is locked", and the player would go and earn the shards.
  if (feed.locked) return { ok: false, reason: 'That one is locked — unlock it first' };
  // Only the FED relic is eaten, so only the fed one has to be free. A socketed
  // relic may still be the KEEPER and be improved while it sits in the tool.
  if (socketedRelic(state, feedUid)) return { ok: false, reason: 'That one is set in your tool. Pull it out first' };
  const afford = fusionAfford(state, keep, feed);
  if (!afford.ok) {
    const wants = afford.price.cores > 0
      ? `${afford.price.shards} shards and ${afford.price.cores} Cores`
      : `${afford.price.shards} shards`;
    return { ok: false, reason: `The bench wants ${wants}. You are short ${afford.short.join(' and ')}.` };
  }
  if (feed.rarity > keep.rarity) {
    const gate = fusionGate(state, feed.rarity);
    if (gate.have < gate.need) {
      return {
        ok: false,
        reason: `Raising a relic that far is learned from the cases — complete ${gate.need} Museum cases (${gate.have} done), or keep the finer relic and feed it the lesser.`,
      };
    }
  }

  for (const [k, v] of Object.entries(feed.affixes)) {
    keep.affixes[k] = Math.max(keep.affixes[k] ?? 0, v);
  }
  // THE POWER CROSSES OVER (A.48). A relic that had none takes the fed one's,
  // and a relic that already has one keeps its own — so a fusion can never
  // silently replace the power a build was chosen around. This is also the
  // only writer of `power`: everywhere else it is derived.
  const keepPower = powerOf(keep);
  const feedPower = powerOf(feed);
  if (!keepPower && feedPower) keep.power = feedPower.id;
  else if (keepPower) keep.power = keepPower.id;

  // THE MARK (A.49). The keeper carries what it ate — one notch per meal, in
  // the character of the thing eaten, so the reliquary can SHOW a much-fused
  // relic instead of printing a number next to it. Capped: past a dozen the
  // object is already unmistakably scarred and the array would only grow.
  keep.ate = [...(keep.ate ?? []), feed.source, ...(feed.ate ?? [])].slice(0, 12);
  // The keeper's rarity rises to the better of the two; fusing never demotes.
  keep.rarity = Math.max(keep.rarity, feed.rarity);
  keep.fusedFrom += 1 + feed.fusedFrom;

  state.relics.held = state.relics.held.filter((r) => r.uid !== feedUid);
  state.relics.equipped = state.relics.equipped.filter((u) => u !== feedUid);
  state.relics.shards -= afford.price.shards;
  spendCurrency(state, 'core', D(afford.price.cores));
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
  /** A power the keeper does not have and would take from the fed relic. */
  powerGained?: string;
  /** B4: set when the rise is museum-gated and the cases are short — the UI
   *  must say so BEFORE the attempt, not after. */
  gatedBy?: { need: number; have: number };
}

export function fusionPreview(state: GameState, keepUid: number, feedUid: number): FusionPreview | null {
  if (keepUid === feedUid) return null;
  const keep = state.relics.held.find((r) => r.uid === keepUid);
  const feed = state.relics.held.find((r) => r.uid === feedUid);
  if (!keep || !feed) return null;

  const out: FusionPreview = { gained: [], improved: [], wasted: [], rarityUp: feed.rarity > keep.rarity };
  const fedPower = powerOf(feed);
  if (!powerOf(keep) && fedPower) out.powerGained = fedPower.name;
  if (out.rarityUp) {
    const gate = fusionGate(state, feed.rarity);
    if (gate.have < gate.need) out.gatedBy = gate;
  }
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
  // THE SHARED POOL, HALF TWO. Socketing already pulls a relic off the belt;
  // this is the other direction, and without it the same relic would be folded
  // by both `relics.*` and `sockets.relics.*` at once.
  if (socketedRelic(state, uid)) return { ok: false, reason: 'That one is set in your tool. Pull it out first' };
  state.relics.equipped = state.relics.equipped.filter((u) => u !== uid);
  const next = [...state.relics.equipped];
  while (next.length < RELIC_SLOTS) next.push(-1);
  next[slot] = uid;
  state.relics.equipped = next.filter((u) => u >= 0);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// WAKING — a relic is a small progression path, not a stat sticker
// ---------------------------------------------------------------------------
/**
 * Dormant → stirring → awake, on CHARGE. Charge accrues from being CARRIED,
 * which makes the whole layer idle-friendly by construction: an idle player
 * wakes their relics at the full rate simply by wearing them, and an active
 * player only gets there sooner by doing deeds in the relic's own element
 * (pillar 1, and pillar 4 — engaging pays, ignoring is never walled).
 *
 * Nothing here is listed before it happens (pillar 5): a dormant relic does
 * not advertise what it will become.
 */
export const WAKING_STEPS = [
  { at: 0, name: 'Dormant', mult: 1.0, line: 'Cold in the hand. It has not decided about you.' },
  { at: 1800, name: 'Stirring', mult: 1.15, line: 'Warmer than the rock around it. Something in it is paying attention.' },
  { at: 7200, name: 'Awake', mult: 1.35, line: 'It answers before you ask. Whatever it was for, it is for you now.' },
] as const;

export const wakingOf = (r: RelicInstance): number => r.waking ?? 0;
export const wakingStep = (r: RelicInstance) => WAKING_STEPS[Math.min(WAKING_STEPS.length - 1, wakingOf(r))]!;
/** Charge still owed before the next step. null when fully awake. */
export function wakingNeed(r: RelicInstance): number | null {
  const next = WAKING_STEPS[wakingOf(r) + 1];
  return next ? Math.max(0, next.at - (r.charge ?? 0)) : null;
}

/**
 * Carry time, once a second, for the worn set only. Deeds add on top via
 * `relicDeed`. Kept off the hot path: six relics, one number each.
 */
export function tickRelics(state: GameState, ctx: EngineCtx, dt: number): void {
  // THE PATIENT STONE is a rule power: it changes WHERE waking happens, not
  // how fast. With it carried, the drawer wakes too, at half rate.
  const drawer = relicRule(state, 'patientStone');
  const worn = new Set(state.relics.equipped);
  for (const r of state.relics.held) {
    const share = worn.has(r.uid) ? 1 : drawer ? 0.5 : 0;
    if (share === 0 || wakingOf(r) >= WAKING_STEPS.length - 1) continue;
    r.charge = (r.charge ?? 0) + dt * share;
    const next = WAKING_STEPS[wakingOf(r) + 1];
    if (next && (r.charge ?? 0) >= next.at) {
      r.waking = wakingOf(r) + 1;
      ctx.emit({ type: 'relicWoke', uid: r.uid, step: r.waking });
      ctx.dirty();
    }
  }
}

/**
 * A deed in a relic's own element hurries it along — an expedition relic gets
 * better at expeditions because expeditions are what it is awake FOR. This is
 * the "relics adapt to use" half, folded into waking rather than built as a
 * second axis: one number the player can see move beats two they cannot.
 */
export function relicDeed(state: GameState, ctx: EngineCtx, sourceId: string, worth = 120): void {
  for (const uid of state.relics.equipped) {
    const r = state.relics.held.find((x) => x.uid === uid);
    if (!r || r.source !== sourceId || wakingOf(r) >= WAKING_STEPS.length - 1) continue;
    r.charge = (r.charge ?? 0) + worth;
    const next = WAKING_STEPS[wakingOf(r) + 1];
    if (next && (r.charge ?? 0) >= next.at) {
      r.waking = wakingOf(r) + 1;
      ctx.emit({ type: 'relicWoke', uid: r.uid, step: r.waking });
      ctx.dirty();
    }
  }
}

// ---------------------------------------------------------------------------
// RESONANCE — some of them recognise each other
// ---------------------------------------------------------------------------
/**
 * Carry two from the same place and they know it. Deliberately simple: the
 * build decision is which SIX to wear, and a rule you can hold in your head is
 * what makes that a decision rather than a spreadsheet.
 *
 * Found by wearing, never listed beforehand (pillar 5).
 */
export interface ResonanceDef {
  id: string;
  name: string;
  /** Equipped relics from this source needed. */
  source: string;
  need: number;
  /** Multiplier applied to every affix on the resonating relics. */
  mult: number;
  line: string;
}

export const RESONANCES: ResonanceDef[] = [
  { id: 'deepchord', source: 'depth', need: 2, mult: 1.12, name: 'The Deep Chord',
    line: 'Two stones out of the same dark. They hum at the same pitch.' },
  { id: 'warrenkin', source: 'warren', need: 2, mult: 1.12, name: 'Warren-Kin',
    line: 'Both were somebody\'s once, in the same rooms.' },
  { id: 'wandering', source: 'expedition', need: 2, mult: 1.12, name: 'The Wandering Set',
    line: 'They have been further than you have. Together they remember the way.' },
  { id: 'oathofash', source: 'warden', need: 2, mult: 1.15, name: 'Oath of Ash',
    line: 'Taken from things that guarded. They guard you now, and they are not gentle about it.' },
];

/**
 * A resonance you have never seen is not shown; one that has fired once is
 * remembered forever, so the Codex fills in by DOING (pillar 5). Recording it
 * is separate from applying it — the bonus works the first time regardless.
 */
export function noteResonances(state: GameState, ctx: EngineCtx): void {
  for (const res of activeResonances(state)) {
    if (state.relics.resonancesFound.includes(res.id)) continue;
    state.relics.resonancesFound.push(res.id);
    ctx.emit({ type: 'resonanceFound', id: res.id });
    ctx.dirty();
  }
}

/** Which resonances the worn set is currently satisfying. */
export function activeResonances(state: GameState): ResonanceDef[] {
  const worn = state.relics.equipped
    .map((uid) => state.relics.held.find((x) => x.uid === uid))
    .filter((r): r is RelicInstance => !!r);
  return RESONANCES.filter((res) => worn.filter((r) => r.source === res.source).length >= res.need);
}

/**
 * THE LINES THAT MATTER (A.49). A relic that carries a POWER keeps exactly one
 * affix line — its strongest — and the rest are noise.
 *
 * The test the brief set is "does cutting this change how the relic plays?".
 * On a relic whose whole identity is that drills now work two cells a stroke,
 * a stapled-on +3% converter intake changes nothing about how it plays; it
 * only makes the card longer and the comparison between two relics harder. A
 * relic with NO power is untouched, because its lines are all it has and
 * stripping those would be cutting to hit a count.
 *
 * This is a READ rule, applied in the one place the bonus is computed and the
 * one place it is drawn, so the panel can never disagree with the engine. It
 * deliberately does not mutate the relic: the roll is still the roll, and if
 * this rule is ever reversed nothing has been destroyed.
 */
export function effectiveAffixes(relic: RelicInstance): Record<string, number> {
  if (!powerOf(relic)) return relic.affixes;
  let bestKey: string | null = null;
  let best = -Infinity;
  for (const [k, v] of Object.entries(relic.affixes)) {
    if (v > best) { best = v; bestKey = k; }
  }
  return bestKey === null ? {} : { [bestKey]: relic.affixes[bestKey]! };
}

/**
 * AN AFFIX'S CONTRIBUTION TO A BUCKET, WITH THE KEY RESOLVED — and this closes a
 * bug that had been eating 44% of every relic in the game since Phase 15.
 *
 * `mintRelic` writes `affixes[key]` where `key` is the AFFIX ID (`hardDrill`,
 * `deepYield`, `fatSeam`), and every reader looked it up by BUCKET NAME
 * (`drillPower`, `dustYield`, `dropRate`). Fourteen of the thirty affixes have an
 * id that differs from their bucket — precisely the thirteen Phase 15 added "so a
 * pool is a hunt and not a list", plus `offlineEff` — so those fourteen landed in
 * a key nothing ever read.
 *
 * MEASURED, not estimated: over 3,000 mints from the `depth` pool, 1,903 of
 * 4,283 rolled affixes (**44.4%**) were inert. A relic could roll Deep Yield
 * +28%, print it on its card, and do nothing at all.
 *
 * Found by the SOCKET driver, which asked the live modifier bucket to move and
 * watched it refuse — a socketed relic inherited the bug verbatim because it
 * reuses this exact read, which is the intended design working correctly on a
 * broken foundation.
 *
 * This affects the BELT as much as the socket, so it is fixed here, once, where
 * both paths read it. `effectiveAffixes` is left keyed by affix id because the
 * cards display those names and the ids are the interesting half ("Deep Yield"
 * is a better thing to be told than "yield").
 */
export function affixBucketBonus(relic: RelicInstance, bucket: Bucket): number {
  let total = 0;
  for (const [key, mag] of Object.entries(effectiveAffixes(relic))) {
    const def = AFFIXES[key];
    // An unknown key is a relic from a build whose affix was since removed. Fall
    // back to reading the key AS a bucket, which is what old saves whose ids
    // happened to match were relying on — checked through the type guard rather
    // than asserted, because `modifierIntegrity` forbids asserting a bucket name
    // into place and is right to.
    const target = def ? def.bucket : isBucket(key) ? key : null;
    if (target === bucket) total += mag;
  }
  return total;
}

/** The equipped set's contribution to a bucket — read by the modifier layer.
 *  Waking and resonance both scale what a worn relic gives; neither creates a
 *  new source of income, so pillar 2's argument above is untouched. */
export function relicBonus(state: GameState, bucket: Bucket): number {
  const active = activeResonances(state);
  // THE LEFT HAND (A.48) is a PAIR power: it contributes nothing of its own and
  // instead multiplies what every other worn relic gives. It lands here rather
  // than in a bucket because that is literally what it does.
  const pair = pairMultiplier(state);
  let total = 0;
  for (const uid of state.relics.equipped) {
    const r = state.relics.held.find((x) => x.uid === uid);
    if (!r) continue;
    const base = affixBucketBonus(r, bucket);
    if (base === 0) continue;
    const res = active.filter((x) => x.source === r.source).reduce((m, x) => m * x.mult, 1);
    total += base * wakingStep(r).mult * res * pair;
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
  // POWERS register APART from affixes (A.48) so the breakdown popover can say
  // which of the two a number came from. A power's contribution is computed
  // live from state — a scaling power's value is whatever the board says right
  // now — and may be NEGATIVE, which is the whole point of a trade.
  for (const bucket of POWER_BUCKETS) {
    registerModifier({
      id: `relicPowers.${bucket}`,
      label: 'Relic powers',
      bucket,
      value: (s) => foldBonus(bucket, relicPowerBonus(s, bucket)),
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
  by?: string,
): RelicInstance | null {
  if (chance <= 0 || Math.random() >= chance) return null;
  return grantRelic(state, ctx, sourceId, by);
}

/** An unconditional relic from a named context (a cleared Warren, a won Well). */
export function grantRelic(
  state: GameState,
  ctx: EngineCtx,
  sourceId: string,
  by?: string,
): RelicInstance {
  // The seed IS the relic: a save round-trip can never re-roll what you found.
  const seed = state.relics.nextUid * 7919 + Math.floor(state.stats.playTimeSec);
  const minted = mintRelic(state, sourceId, seed);
  // THE STORY IS FREE. Every field here was already sitting in state at this
  // exact moment and was discarded; keeping it is the difference between "a
  // Rare" and "the one the Badger turned up at 428 on run six".
  minted.found = {
    depth: state.depth,
    shell: state.shell.current,
    run: state.collapse.count,
    playSec: Math.floor(state.stats.playTimeSec),
    ...(by ? { by } : {}),
  };
  const held = addRelic(state, minted);
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
  return {
    held: [], equipped: [], nextUid: 1, found: 0, fused: 0, floorBonus: 0, shards: 0,
    resonancesFound: [],
    // OFF, and set to the weakest band, so switching it on is a small step and
    // never a surprise. `keepPowered` on by default for the same reason.
    autoScrap: { on: false, maxRarity: 0, keepPowered: true },
  };
}
