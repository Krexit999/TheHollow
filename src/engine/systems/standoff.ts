/**
 * THE STANDOFF — the minimum version that can prove or kill it (§27).
 *
 * Combat is the largest untested claim in the document, so this is deliberately
 * the smallest build that puts the claim on screen. Two stances, one enemy, one
 * shell. If the loop is boring at this size it will be boring at six stances,
 * and cutting it here costs a file rather than a subsystem.
 *
 * THE CLAIM, STATED SO IT CAN FAIL: a Standoff is your hand played AROUND a
 * machine you configured in advance, against something that punishes repetition
 * and gets richer the longer you stay. Three things carry it and nothing else
 * does:
 *
 *   INTENT IS FREE (§27.1). No SIGHT gate, no stat tax, from the very first
 *   fight. You always know what it will do next and you can still be wrong —
 *   which is only interesting if knowing costs nothing and the difficulty is
 *   somewhere else.
 *
 *   THE DRILL LINE IS A SECOND ACTOR (§27.2). Chosen BEFORE the fight, acts
 *   automatically every exchange, and cannot be changed once it starts. The
 *   question stops being "which button" — there are only two — and becomes "did
 *   I bring the right machine, and can I play around what it is doing".
 *
 *   IT READS YOUR LAST STANCE (§27.3). The same stance twice running is HALVED
 *   and its next intent COUNTERS you. With two stances that is the whole tension:
 *   STRIKE is the only stance that does anything, so a player who only strikes
 *   is fighting at half power into a counter, and the free stance — WITHDRAW —
 *   is the one that resets it, at the cost of the drop.
 *
 * LOAM'S DEEPWROUGHT COMPACTS (§27.5): it hardens every exchange, taking less
 * and dropping richer. The exam is "how long do you keep hitting something that
 * is getting tougher and richer", and the answer has to be a real decision
 * rather than "always" or "never" — which is exactly what the drill lines pull
 * on from three directions.
 *
 * NOT BUILT, ON PURPOSE: GUARD, PRY, VENT, FEED · Wardens · gear · linings ·
 * any shell but Loam. §27.4's FEED is the interesting stance and it is not here,
 * because a mid-fight override is only interesting once the drill line has
 * proved it is worth overriding.
 *
 * NOTHING IS LOST PERMANENTLY (§27.7). Losing costs the fight's haul and sends
 * you up one station. NEVER THE TOOL — there is no path in this file to
 * `forge.tools`, `casting`, or any equipment, and a test asserts it.
 */
import type { EngineCtx, GameState } from '../types';
import { shellRoll } from './roll';
import { contentsOf } from './roll';
import { effectiveToolTier } from './toolMining';
import { addMaterial } from './forge';
import type { StationDef } from '../content/shell1/roll';

// ---------------------------------------------------------------------------
// The two stances (§27.4, minimum set)
// ---------------------------------------------------------------------------

/**
 * TWO, and WITHDRAW is free and often correct.
 *
 * That second clause is load-bearing. If leaving were a punishment there would
 * be one stance and no decision; because it costs only the drop, "this one has
 * got too hard, take what I have" is a legitimate line of play rather than a
 * failure state. It is also the only thing that clears a repeat.
 */
export type Stance = 'strike' | 'withdraw';

export const STANCE_LABEL: Record<Stance, string> = {
  strike: 'STRIKE',
  withdraw: 'WITHDRAW',
};

// ---------------------------------------------------------------------------
// Intents (§27.1) — always visible, never paid for
// ---------------------------------------------------------------------------

export type Intent = 'strike' | 'compact' | 'counter';

export const INTENT_LABEL: Record<Intent, string> = {
  strike: 'it will swing',
  compact: 'it will settle harder',
  counter: 'it has your number',
};

// ---------------------------------------------------------------------------
// The drill line (§27.2) — the second actor
// ---------------------------------------------------------------------------

/**
 * THREE LINES, AND THEY ARE A TRIANGLE AGAINST A THING THAT COMPACTS.
 *
 * The spine lists five; two of them (FOLLOW, MARKED) need a face grain that was
 * cut and a PRY stance that is not built, so shipping them as names with no
 * behaviour would be the locked-list-with-extra-steps this project keeps
 * refusing. Three that all work:
 *
 *   FULLEST-FIRST  steady chip damage. The honest baseline: no ramp, no trick,
 *                  and it does not care what the fight is doing.
 *   SWEEP          less damage, and strips one stack of what it is accumulating
 *                  — here, COMPACTION. Keeps the thing soft so your strikes keep
 *                  landing, at the price of the richer drop hardness buys.
 *   CHAIN          damage that GROWS while you do not interrupt it, and a
 *                  counter interrupts it. Enormous if you can keep it going;
 *                  worthless to a player who strikes twice in a row.
 *
 * So the pre-fight choice is a real one: SWEEP fights the enemy's mechanic,
 * CHAIN races it, FULLEST-FIRST ignores it.
 */
export type DrillLine = 'fullest' | 'sweep' | 'chain';

export interface DrillLineDef {
  id: DrillLine;
  name: string;
  /** What it does every exchange, in one line the panel can print. */
  does: string;
}

export const DRILL_LINES: DrillLineDef[] = [
  { id: 'fullest', name: 'Fullest-first', does: 'steady chip damage, every exchange' },
  { id: 'sweep', name: 'Sweep', does: 'less damage, and strips a stack of what it is packing on' },
  { id: 'chain', name: 'Adjacency chain', does: 'damage that grows while nothing interrupts it' },
];

export function drillLineDef(id: DrillLine): DrillLineDef {
  return DRILL_LINES.find((d) => d.id === id) ?? DRILL_LINES[0]!;
}

// ---------------------------------------------------------------------------
// The numbers
// ---------------------------------------------------------------------------

/** Your pool. Not a stat tax — it is the same for every player at a tier. */
export const WIND_BASE = 24;
export const WIND_PER_TIER = 6;

/** Its pool, scaled by how bad the hazard rolled this run (§1.1). */
export const DEEPWROUGHT_HP_BASE = 30;
export const DEEPWROUGHT_HP_PER_HAZARD = 14;

/** What a clean STRIKE is worth before compaction eats into it. */
export const STRIKE_BASE = 7;
export const STRIKE_PER_TIER = 3;

/** What its own swing takes off you. */
export const ITS_STRIKE = 5;
export const COUNTER_STRIKE = 9;

/** Every exchange it settles. Each point of compaction absorbs this much. */
export const COMPACTION_PER_EXCHANGE = 1;
export const ABSORB_PER_COMPACTION = 0.55;
/**
 * IT NEVER GOES FULLY IMMUNE. A thing you cannot hurt is not a decision about
 * when to leave, it is a timer — so a strike always lands for at least this
 * fraction, and the player is choosing between "slower and richer" and "now".
 */
export const MIN_STRIKE_FRACTION = 0.15;

/**
 * THE TOOL'S OWN STRIKE, WIRED (A.106 ruling: "`strikePower` is computed,
 * displayed and read by nothing. Wire it or cut it — say which.").
 *
 * WIRED, HERE, AND NOWHERE ELSE. The Standoff was already the only place in the
 * game where the fiction is "you hit something", and it read the tool's TIER
 * while the tool shelf printed a Strike number beside its Chip number that
 * nothing anywhere consulted. Two displayed stats, one of them scenery.
 *
 * IT IS A LEAN, NOT A LADDER. What is read is the RATIO of the tool's strike to
 * its chip against the base pick's 3:1 — so a tool forged strike-heavy hits
 * harder here and one forged chip-heavy hits softer, and the total is
 * zero-sum-ish rather than a second power curve. Clamped hard in both
 * directions, because an unclamped ratio is a balance change wearing a
 * legibility hat: the Deepwrought's HP, the compaction curve and every drop
 * number underneath it were tuned against `STRIKE_BASE + 3·tier`, and this may
 * shift that by a quarter at the very most.
 *
 * PILLAR 2 IS UNTOUCHED — there is no path from this file to `cellCap`,
 * `cellRegen` or `chipYield`, which is the same thing this file's header has
 * said about equipment since it shipped.
 */
export const STRIKE_LEAN_BASE = 3;
export const STRIKE_LEAN_MIN = 0.8;
export const STRIKE_LEAN_MAX = 1.25;

/** How this particular tool fights, against a plain one of any tier. */
export function strikeLean(state: GameState): number {
  const t = state.forge?.tools?.[state.forge.equipped ?? 0];
  if (!t || !(t.chipPower > 0) || !(t.strikePower > 0)) return 1;
  const ratio = (t.strikePower / t.chipPower) / STRIKE_LEAN_BASE;
  return Math.max(STRIKE_LEAN_MIN, Math.min(STRIKE_LEAN_MAX, ratio));
}

/** The drill line's own contribution, per exchange. */
export const LINE_DAMAGE: Record<DrillLine, number> = { fullest: 4, sweep: 2, chain: 1 };
/** CHAIN adds this much per uninterrupted exchange, on top of its base. */
export const CHAIN_STEP = 2.5;

/** The drop scales with how hard it got before it went down (§27.5). */
export const DROP_BASE = 3;
export const DROP_PER_COMPACTION = 1;
export const PURITY_BASE = 42;
export const PURITY_PER_COMPACTION = 4;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface StandoffState {
  /** The station being fought at; '' when no fight is live. */
  stationId: string;
  wind: number;
  maxWind: number;
  hp: number;
  maxHp: number;
  /** How hard it has packed itself. Rises every exchange (§27.5). */
  compaction: number;
  /** What it will do NEXT. Always readable, always free (§27.1). */
  intent: Intent;
  /** The stance you played last exchange — what it reads (§27.3). */
  lastStance: Stance | null;
  /** Locked at the start of the fight and unchangeable (§27.2). */
  line: DrillLine;
  /** Uninterrupted exchanges, for CHAIN. */
  chain: number;
  exchange: number;
  /** What is riding on the fight — forfeited on a loss, kept on a win. */
  haul: number;
  /** Newest last. The panel prints this; it is also how a driver reads a fight. */
  log: string[];
  /** null while live. */
  outcome: null | 'won' | 'lost' | 'withdrew';
  /** The line chosen for the NEXT fight — the pre-fight decision (§27.2). */
  nextLine: DrillLine;
}

export function defaultStandoffState(): StandoffState {
  return {
    stationId: '', wind: 0, maxWind: 0, hp: 0, maxHp: 0, compaction: 0,
    intent: 'strike', lastStance: null, line: 'fullest', chain: 0, exchange: 0,
    haul: 0, log: [], outcome: null, nextLine: 'fullest',
  };
}

export function ensureStandoff(state: GameState): StandoffState {
  const s = (state.standoff ??= defaultStandoffState());
  s.log ??= [];
  s.nextLine ??= 'fullest';
  return s;
}

export function standoffLive(state: GameState): boolean {
  const s = ensureStandoff(state);
  return s.stationId !== '' && s.outcome === null;
}

// ---------------------------------------------------------------------------
// Where it happens (§27.7) — hazard stations, and engaging is optional
// ---------------------------------------------------------------------------

/**
 * THE STATION YOU ARE STANDING AT, if it is a hazard. Danger is texture: the
 * Roll shows it before you arrive and walking past is always allowed. Nothing
 * here forces a fight, which is what keeps §27.7's "preparation always works"
 * honest — the preparation includes not going.
 */
export function hazardHere(state: GameState): StationDef | null {
  let best: StationDef | null = null;
  for (const def of shellRoll(state)) {
    if (def.type !== 'hazard') continue;
    if (def.depth > state.depth) continue;
    if (!best || def.depth > best.depth) best = def;
  }
  return best;
}

/** The station immediately above a given depth — where a loss puts you. */
function stationAbove(state: GameState, depth: number): StationDef | null {
  let best: StationDef | null = null;
  for (const def of shellRoll(state)) {
    if (def.depth >= depth) continue;
    if (!best || def.depth > best.depth) best = def;
  }
  return best;
}

/** The name Loam's hazard Deepwrought answers to. */
export const DEEPWROUGHT_NAME = 'THE DEADFALL';

// ---------------------------------------------------------------------------
// Starting one
// ---------------------------------------------------------------------------

export interface ActionResult { ok: boolean; reason?: string }

/** The pre-fight decision, and the ONLY moment it can be made (§27.2). */
export function setDrillLine(state: GameState, line: DrillLine): ActionResult {
  const s = ensureStandoff(state);
  if (standoffLive(state)) {
    return { ok: false, reason: 'The line is set. It cannot be changed mid-fight.' };
  }
  s.nextLine = line;
  return { ok: true };
}

export function beginStandoff(state: GameState, ctx: EngineCtx): ActionResult {
  const s = ensureStandoff(state);
  if (standoffLive(state)) return { ok: false, reason: 'Already in one' };
  const here = hazardHere(state);
  if (!here) return { ok: false, reason: 'Nothing is waiting here' };

  const tier = effectiveToolTier(state);
  const hazard = Math.max(1, contentsOf(state, here.id).hazard);
  s.stationId = here.id;
  s.maxWind = WIND_BASE + WIND_PER_TIER * tier;
  s.wind = s.maxWind;
  s.maxHp = DEEPWROUGHT_HP_BASE + DEEPWROUGHT_HP_PER_HAZARD * hazard;
  s.hp = s.maxHp;
  s.compaction = 0;
  s.intent = 'strike';
  s.lastStance = null;
  s.line = s.nextLine; // LOCKED HERE. Nothing below this line reassigns it.
  s.chain = 0;
  s.exchange = 0;
  s.haul = 0;
  s.outcome = null;
  s.log = [`${DEEPWROUGHT_NAME} settles into ${here.name}. It is not going anywhere.`];
  ctx.dirty();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// One exchange
// ---------------------------------------------------------------------------

/** What a strike is worth right now, after compaction has eaten into it. */
export function strikeDamage(state: GameState, halved: boolean): number {
  const s = ensureStandoff(state);
  const base = (STRIKE_BASE + STRIKE_PER_TIER * effectiveToolTier(state)) * strikeLean(state);
  const landed = Math.max(base * MIN_STRIKE_FRACTION, base - ABSORB_PER_COMPACTION * s.compaction);
  return halved ? landed / 2 : landed;
}

/** What the drill line contributes this exchange — it acts on its own (§27.2). */
export function lineDamage(state: GameState): number {
  const s = ensureStandoff(state);
  const base = LINE_DAMAGE[s.line];
  const raw = s.line === 'chain' ? base + CHAIN_STEP * s.chain : base;
  return Math.max(raw * MIN_STRIKE_FRACTION, raw - ABSORB_PER_COMPACTION * s.compaction);
}

/**
 * ONE EXCHANGE, IN THE ORDER THE FICTION IMPLIES: you act, your machine acts
 * whatever you did, then it acts, then it decides what it will do next and says
 * so out loud.
 */
export function exchange(state: GameState, ctx: EngineCtx, stance: Stance): ActionResult {
  const s = ensureStandoff(state);
  if (!standoffLive(state)) return { ok: false, reason: 'No standoff' };

  // ── WITHDRAW: free, and often correct. Keep what you took, lose the drop.
  if (stance === 'withdraw') {
    s.outcome = 'withdrew';
    s.lastStance = 'withdraw';
    s.log.push(`You back off. You keep what you were carrying; the drop stays in the dark.`);
    ctx.dirty();
    return { ok: true };
  }

  // ── §27.3: IT READS YOUR LAST STANCE. A repeat is halved.
  const repeated = s.lastStance === stance;
  const dealt = strikeDamage(state, repeated);
  const line = lineDamage(state);
  s.hp -= dealt + line;
  s.exchange += 1;
  s.log.push(
    repeated
      ? `You strike the same way twice. It was ready: ${dealt.toFixed(1)} lands where ${(dealt * 2).toFixed(1)} should have.`
      : `You strike for ${dealt.toFixed(1)}.`,
  );
  s.log.push(`${drillLineDef(s.line).name} works for ${line.toFixed(1)}.`);

  if (s.hp <= 0) return finish(state, ctx, 'won');

  // ── ITS TURN. The intent you were shown is the intent it plays.
  if (s.intent === 'counter') {
    s.wind -= COUNTER_STRIKE;
    s.chain = 0; // a counter INTERRUPTS the chain — that is what "uninterrupted" means
    s.log.push(`It counters, hard. ${COUNTER_STRIKE} off your wind, and your chain breaks.`);
  } else if (s.intent === 'strike') {
    s.wind -= ITS_STRIKE;
    s.chain += 1;
    s.log.push(`It swings. ${ITS_STRIKE} off your wind.`);
  } else {
    s.compaction += COMPACTION_PER_EXCHANGE;
    s.chain += 1;
    s.log.push(`It settles. Harder to hurt now, and worth more when it goes.`);
  }
  // COMPACTS: it hardens every exchange whatever else it did (§27.5).
  s.compaction += COMPACTION_PER_EXCHANGE;
  s.haul = DROP_BASE + DROP_PER_COMPACTION * s.compaction;

  if (s.wind <= 0) return finish(state, ctx, 'lost');

  // ── §27.3, the other half: a repeat sets up the counter.
  s.lastStance = stance;
  s.intent = repeated ? 'counter' : (s.exchange % 2 === 0 ? 'compact' : 'strike');
  ctx.dirty();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Ending
// ---------------------------------------------------------------------------

function finish(state: GameState, ctx: EngineCtx, outcome: 'won' | 'lost'): ActionResult {
  const s = ensureStandoff(state);
  s.outcome = outcome;

  if (outcome === 'won') {
    // RICHER THE LONGER YOU STAYED — the whole exam, paid out (§27.5).
    const def = shellRoll(state).find((d) => d.id === s.stationId);
    const seam = contentsOf(state, s.stationId).seam || def?.seams?.[0] || '';
    const count = Math.max(1, Math.round(DROP_BASE + DROP_PER_COMPACTION * s.compaction));
    const purity = Math.min(95, PURITY_BASE + PURITY_PER_COMPACTION * s.compaction);
    if (seam) addMaterial(state, seam, purity, count);
    s.log.push(`It comes apart. ${count} out of it, and it packed itself rich doing that.`);
    ctx.dirty();
    return { ok: true };
  }

  // LOSING COSTS YOUR HAUL AND ONE STATION. NEVER THE TOOL.
  s.haul = 0;
  const up = stationAbove(state, state.depth);
  if (up) state.depth = up.depth;
  s.log.push(`Your wind goes. You come up to ${up?.name ?? 'the surface'} with nothing off it.`);
  ctx.dirty();
  return { ok: true };
}

/** Clear a finished fight so the station can be engaged again. */
export function dismissStandoff(state: GameState, ctx: EngineCtx): ActionResult {
  const s = ensureStandoff(state);
  if (s.outcome === null && s.stationId !== '') return { ok: false, reason: 'Still in it' };
  s.stationId = '';
  s.outcome = null;
  s.log = [];
  ctx.dirty();
  return { ok: true };
}
