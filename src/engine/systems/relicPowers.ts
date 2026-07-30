/**
 * RELIC POWERS (A.48) — the half of a relic that is not a percentage.
 *
 * A.46 gave relics a story, a waking and a set resonance, and every one of
 * those landed as a MULTIPLIER on top of affixes that were already
 * multipliers. Play reported it exactly right: six slots, six numbers, and the
 * correct answer is "wear the six biggest". That is not a build.
 *
 * A POWER is what makes the slot a decision. Four kinds, and the kinds matter
 * more than the list:
 *
 *  - RULE     changes HOW a system works, not how much. A drill that works two
 *             cells a stroke at reduced bite is a different machine, not a
 *             faster one.
 *  - TRADE    buys a bigger upside with a real downside. A negative
 *             contribution to a real bucket, not a smaller positive.
 *  - SCALING  reads something you have actually been doing. Its number is not
 *             on the card; it is on the board.
 *  - PAIR     does nothing on its own. It is worth a slot only because of what
 *             is in another slot.
 *
 * WHY POWERS ARE DERIVED, NOT STORED. `powerOf` computes from (uid, source,
 * rarity), so every relic already in a save has its power the moment the game
 * loads — no migration, no back-fill, and no relic that "should" have one and
 * does not. `relic.power` exists only as an override, which is what lets a
 * fusion carry a power across.
 *
 * PILLAR 2. Every bucket here either moves the ceiling the way a face upgrade
 * does (yield / regen / cap) or sits outside the income path entirely. The one
 * RULE power that touches production — the twin bite — splits one stroke's
 * power across two cells and is still bounded by regen, exactly like the
 * 'Two Hands' Axiom it borrows its shape from.
 *
 * PILLAR 5. A dormant relic names its power and says nothing about what it
 * does. The line and the live readout arrive when it wakes. Nothing anywhere
 * lists a power the player does not hold.
 */
import type { GameState, RelicInstance } from '../types';
import type { Bucket } from '../modifiers';

export type PowerKind = 'rule' | 'trade' | 'scaling' | 'pair';

export const KIND_NAME: Record<PowerKind, string> = {
  rule: 'It changes the rule',
  trade: 'It trades something away',
  scaling: 'It grows with what you do',
  pair: 'It needs company',
};

export interface RelicPowerDef {
  id: string;
  name: string;
  kind: PowerKind;
  /** The relic's own voice — shown once it has woken. */
  line: string;
  /** Which find-contexts can carry it. */
  sources: string[];
  /** What it is doing RIGHT NOW, in words with the live number in them. */
  readout: (state: GameState) => string;
  /** Live bucket contribution. Absent for powers that are pure rule changes. */
  bonus?: (state: GameState, bucket: Bucket) => number;
}

/** Rarity index at which a relic carries a power at all (2 = Rare). */
export const POWER_RARITY = 2;

const pct = (n: number): string => `${n >= 0 ? '+' : ''}${Math.round(n * 100)}%`;

/** How many OTHER worn relics are fully awake. */
function otherAwake(state: GameState, self: number): number {
  return state.relics.equipped.filter((uid) => {
    if (uid === self) return false;
    const r = state.relics.held.find((x) => x.uid === uid);
    return !!r && (r.waking ?? 0) >= 2;
  }).length;
}

/** How many OTHER worn relics carry a power at all (woken or not). */
function otherPowered(state: GameState, self: number): number {
  return state.relics.equipped.filter((uid) => {
    if (uid === self) return false;
    const r = state.relics.held.find((x) => x.uid === uid);
    return !!r && !!powerOf(r);
  }).length;
}

/** Halls the collection has filled. (A.49: was studied pieces, and studying
 *  went away with the donation verb — this is the same idea, still collection-
 *  driven, still something the player did rather than something they own.) */
const namedHalls = (state: GameState): number => state.museum.completed.length;

export const POWERS: RelicPowerDef[] = [
  // --- RULE — the system works differently ------------------------------
  {
    id: 'twinBite', name: 'The Second Bite', kind: 'rule',
    sources: ['depth', 'well'],
    line: 'It wants the rock hit twice. It does not care that you only have the one arm.',
    readout: () => 'Every drill stroke works TWO cells instead of one, at 65% bite each.',
  },
  {
    id: 'patientStone', name: 'The Patient Stone', kind: 'rule',
    sources: ['warren', 'anomaly'],
    line: 'It kept its own time down there for a long while before you turned up.',
    readout: () => 'Relics you are NOT carrying still wake, at half rate. The drawer stops being dead.',
  },
  {
    id: 'deepPockets', name: 'Deep Pockets', kind: 'rule',
    sources: ['expedition', 'warden'],
    line: 'Whatever it was carried in, it was carrying a great deal more than this.',
    readout: () => 'The hold takes 25 more before the pile starts rendering itself down.',
  },

  // --- TRADE — a real downside for a bigger upside -----------------------
  {
    id: 'glassLung', name: 'Glass Lung', kind: 'trade',
    sources: ['anomaly', 'well'],
    line: 'The seam gives quicker and holds less. You will be back here sooner than you meant.',
    readout: () => `${pct(0.45)} dust yield, ${pct(-0.3)} cell capacity.`,
    bonus: (_s, b) => (b === 'dustYield' ? 0.45 : b === 'cap' ? -0.3 : 0),
  },
  {
    id: 'shortFuse', name: 'The Short Fuse', kind: 'trade',
    sources: ['depth', 'warden'],
    line: 'It only ever points down. Everything it passes on the way, it passes.',
    readout: () => `${pct(-0.22)} descent cost, ${pct(-0.25)} find rate.`,
    bonus: (_s, b) => (b === 'descendCost' ? -0.22 : b === 'dropRate' ? -0.25 : 0),
  },
  {
    id: 'openHand', name: 'The Open Hand', kind: 'trade',
    sources: ['warren', 'expedition'],
    line: 'Somebody carried this one for the people above, not for the seam below.',
    readout: () => `${pct(0.4)} Scrip and ${pct(0.4)} Delver XP, ${pct(-0.15)} dust yield.`,
    bonus: (_s, b) => (b === 'scripGain' || b === 'xpGain' ? 0.4 : b === 'dustYield' ? -0.15 : 0),
  },

  // --- SCALING — the number is on the board, not on the card -------------
  {
    id: 'deepLedger', name: 'The Deep Ledger', kind: 'scaling',
    sources: ['depth', 'warden'],
    line: 'Every stair you take, it writes down. It has better handwriting than you.',
    readout: (s) => `${pct(deepLedgerAt(s))} dust yield — 1% per 15 of current depth (${Math.floor(s.depth)}), to +60%.`,
    bonus: (s, b) => (b === 'dustYield' ? deepLedgerAt(s) : 0),
  },
  {
    id: 'longTally', name: 'The Long Tally', kind: 'scaling',
    sources: ['warren', 'expedition'],
    line: 'It counts the ones that got named. The ones still in the dark, it will not look at.',
    readout: (s) => `${pct(longTallyAt(s))} find rate — 4% per filled Museum hall (${namedHalls(s)}), to +45%.`,
    bonus: (s, b) => (b === 'dropRate' ? longTallyAt(s) : 0),
  },
  {
    id: 'emberCount', name: 'The Ember Count', kind: 'scaling',
    sources: ['well', 'anomaly'],
    line: 'It has watched this world end before. It is keeping a running total.',
    readout: (s) => `${pct(emberCountAt(s))} converter intake — 2% per Collapse this world (${s.collapse.count}), to +50%.`,
    bonus: (s, b) => (b === 'kilnRate' ? emberCountAt(s) : 0),
  },

  // --- PAIR — worth a slot only because of another slot ------------------
  {
    id: 'leftHand', name: 'The Left Hand', kind: 'pair',
    sources: ['warren', 'depth'],
    line: 'It was half of something. It has not stopped being half of something.',
    readout: (s) => {
      const n = leftHandCount(s);
      return n >= 2
        ? `Two others are Awake — every relic you carry gives ${pct(0.3)} more.`
        : `Nothing, alone. Carry TWO other Awake relics and every relic you carry gives ${pct(0.3)} more. (${n}/2)`;
    },
  },
  {
    id: 'twinFlame', name: 'Twin Flame', kind: 'pair',
    sources: ['expedition', 'anomaly', 'well', 'warden'],
    line: 'It burns brighter next to its own kind, and it can tell its own kind at a distance.',
    readout: (s) =>
      twinFlameOn(s)
        ? `Another powered relic is carried — ${pct(0.35)} Delver XP and ${pct(0.35)} Motifs.`
        : `Nothing, alone. Carry one other relic that has a power of its own.`,
    bonus: (s, b) => (twinFlameOn(s) && (b === 'xpGain' || b === 'motifGain') ? 0.35 : 0),
  },
];

export const POWER_BY_ID = new Map(POWERS.map((p) => [p.id, p]));

// The scaling readouts and the bonuses must never drift, so each is one
// function used by both.
const deepLedgerAt = (s: GameState): number => Math.min(0.6, Math.floor(s.depth / 15) * 0.01);
const longTallyAt = (s: GameState): number => Math.min(0.45, namedHalls(s) * 0.04);
const emberCountAt = (s: GameState): number => Math.min(0.5, s.collapse.count * 0.02);

/** Pair powers read the worn set, so they need a self to exclude. Both are
 *  resolved against the relic that CARRIES the power, found by scanning. */
function carrierOf(state: GameState, powerId: string): number | null {
  for (const uid of state.relics.equipped) {
    const r = state.relics.held.find((x) => x.uid === uid);
    if (r && powerOf(r)?.id === powerId && (r.waking ?? 0) >= 1) return uid;
  }
  return null;
}
const leftHandCount = (s: GameState): number => {
  const self = carrierOf(s, 'leftHand');
  return self === null ? 0 : otherAwake(s, self);
};
const twinFlameOn = (s: GameState): boolean => {
  const self = carrierOf(s, 'twinFlame');
  return self !== null && otherPowered(s, self) >= 1;
};

/**
 * WHICH POWER A RELIC CARRIES. Derived from what the relic already is, so it
 * needs no save field and no migration: a relic minted three phases ago has
 * had this power the whole time, it simply had nowhere to say so.
 *
 * Below Rare there is no power at all — which is what makes a fusion that
 * raises rarity feel like more than a bigger number.
 */
export function powerOf(relic: RelicInstance): RelicPowerDef | null {
  if (relic.power) return POWER_BY_ID.get(relic.power) ?? null;
  if (relic.rarity < POWER_RARITY) return null;
  const pool = POWERS.filter((p) => p.sources.includes(relic.source));
  if (pool.length === 0) return null;
  return pool[(relic.uid * 13 + relic.rarity * 7) % pool.length] ?? null;
}

/**
 * A POWER IS ASLEEP UNTIL THE RELIC IS. This is the whole "a relic visibly
 * changes over time" beat: dormant it is a name and a rarity, and at Stirring
 * the power turns on and the relic starts saying what it is for.
 */
export function powerLive(relic: RelicInstance): boolean {
  return (relic.waking ?? 0) >= 1 && !!powerOf(relic);
}

/**
 * Every power currently doing anything: worn, past Dormant, and DISTINCT.
 *
 * The de-duplication is load-bearing, not tidiness. Powers are derived, so
 * nothing stops six worn relics all deriving Glass Lung — and six of those
 * stacking would be +270% yield out of one authored line, which is both a
 * pillar-2 problem and the exact opposite of the design goal ("six slots are an
 * agonising choice", not "wear six of the same"). A power is a rule the worn
 * set either has or does not have.
 */
/**
 * RELICS SET IN THE TOOL (A.64 sockets) contribute their power exactly as a worn
 * one does — the brief's "a socketed relic applies its power to the tool".
 *
 * The de-duplication below is what makes this safe to widen: powers are DERIVED
 * from (uid, source, rarity), so nothing stops a socketed relic deriving the
 * same power as a worn one, and six copies of Glass Lung would be a pillar-2
 * problem. `seen` already refuses that, and it now refuses it across both sets.
 *
 * And the socket does not smuggle a power past its gate: `powerLive` wants
 * Stirring, and `tickRelics` only wakes what is WORN. So a relic put straight
 * into a socket has no power and will never grow one — wear it first. That is
 * the trade the socket phase is priced on, and it is enforced here by doing
 * nothing special.
 *
 * WIRED for the same reason as `wireSocketed` in `relics.ts`: the socket module
 * reads `currentTool`. Fallback is the empty list, i.e. the old behaviour.
 */
let socketedUids: (state: GameState) => number[] = () => [];
export function wireSocketedPowers(fn: typeof socketedUids): void { socketedUids = fn; }

export function activePowers(state: GameState): Array<{ relic: RelicInstance; def: RelicPowerDef }> {
  const out: Array<{ relic: RelicInstance; def: RelicPowerDef }> = [];
  const seen = new Set<string>();
  for (const uid of [...state.relics.equipped, ...socketedUids(state)]) {
    const r = state.relics.held.find((x) => x.uid === uid);
    if (!r || !powerLive(r)) continue;
    const def = powerOf(r);
    if (!def || seen.has(def.id)) continue;
    seen.add(def.id);
    out.push({ relic: r, def });
  }
  return out;
}

/** Is this named rule in force? The choke points ask this, not the relic list. */
export function relicRule(state: GameState, id: string): boolean {
  return activePowers(state).some(({ def }) => def.id === id);
}

/**
 * The worn set's POWER contribution to a bucket, live. Clamped so a stack of
 * trades can never drive a multiplicative bucket to zero or below — a downside
 * is a cost, not a brick.
 */
export function relicPowerBonus(state: GameState, bucket: Bucket): number {
  let total = 0;
  for (const { def } of activePowers(state)) total += def.bonus?.(state, bucket) ?? 0;
  return Math.max(-0.85, total);
}

/** THE LEFT HAND's multiplier on every worn relic's affixes. 1 when idle. */
export function pairMultiplier(state: GameState): number {
  return relicRule(state, 'leftHand') && leftHandCount(state) >= 2 ? 1.3 : 1;
}

/** Buckets any power can touch — the registration loop's domain. */
export const POWER_BUCKETS: Bucket[] = [
  'dustYield', 'cap', 'descendCost', 'dropRate', 'scripGain', 'xpGain', 'kilnRate', 'motifGain',
];
