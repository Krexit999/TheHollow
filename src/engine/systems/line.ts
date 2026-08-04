/**
 * THE LINE — CHAINING (§14.5, §13, keystone at Linewright's Fall 172).
 *
 * "Several machines run as one recipe. 3 → 6 slots. A line has an EFFICIENCY
 * RATING (how well members' throughputs match) and is a SINGLE ENORMOUS SURGE
 * DRAW, which is why the Coil and the Line are the same decision seen twice."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * §14.5 IS HONEST ABOUT WHAT THIS IS, and so is this file: "its skip test is
 * ERGONOMIC — you could hand-run everything. It is the one keystone justified
 * by operability rather than by a gate."
 *
 * So it must not become a gate by accident, and it must not become a DISCOUNT
 * either. THE DRAW IS THE SUM OF ITS MEMBERS, never less — and a badly matched
 * Line pays MORE. A well-matched Line is the same Surge you would have spent
 * firing each machine by hand, in one press instead of four; a mismatched one
 * is worse than doing it yourself, which is the puzzle.
 *
 * That is the whole reason the efficiency rating exists in §14.5, and it is why
 * this cannot move pillar 2 in either direction: no arrangement of members
 * makes a firing cheaper than the hand it replaces.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A MEMBER RUNS ITS OWN DEFAULT ACT — the same unattended choice the Circuit's
 * `run the Crusher` row makes, honouring the Hold's pins and the Sieve's
 * filters. A Line is not a second way to aim a machine; it is one press for
 * the four decisions you had already delegated.
 *
 * TIERS ARE CAPABILITY (§15.4), and §14.5's "3 → 6 slots" is the ladder:
 *   I    THREE machines run as one act
 *   II   FOUR, and the Line reports its own efficiency
 *   III  SIX, and a member with nothing to do no longer stalls the rest
 *
 * That last one is the real capability rather than a bigger number: at tiers I
 * and II a Line is ALL OR NOTHING — if any member cannot run, the press is
 * refused and no Surge is spent. At III it runs what it can.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { MAX_MACHINE_TIER, TIER_PART_COST, demandOf, ensurePlant, fire, noteBuiltOf, tierOf } from './plant';
import { machineSpeed } from './condition';
import { crush, crushable, crusherBuilt } from './crusher';
import { breakPart, breakable, breakerBuilt } from './breaker';
import { distil, distillable, stillBuilt } from './still';
import { refine, refineryUnlocked } from './refinery';
import { BANDS, type PurityBand } from '../materials';
import { isLooted } from './roll';
import { allAuthoredStations } from '../content/rolls';

/** The wreck it is found in — Verdance, Linewright's Fall 172 (§6). */
export const LINE_WRECK = 'THE LINE';

/** §14.5's "3 → 6 slots", as the three tiers this game's machines have. */
export const LINE_SLOTS = [0, 3, 4, 6];

export const TIER_CAPABILITY_LINE = [
  'not built',
  'three machines, one press',
  'four, and it reports its own efficiency',
  'six, and a member with nothing to do no longer stalls the rest',
] as const;

export interface LineState {
  /** Machine ids, in the order they fire. */
  members: string[];
  /** HELD — the Circuit can stop a Line without emptying it. */
  held: boolean;
  /** Times the Line has fired, and times it refused. The log §25.3 asks for. */
  fired: number;
  stalled: number;
}

export function defaultLineState(): LineState {
  return { members: [], held: false, fired: 0, stalled: 0 };
}

export function ensureLine(state: GameState): LineState {
  const l = (state.line ??= defaultLineState());
  l.members ??= [];
  if (typeof l.fired !== 'number') l.fired = 0;
  if (typeof l.stalled !== 'number') l.stalled = 0;
  return l;
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

export function lineStation(): { shellId: string; depth: number; name: string } | null {
  const f = allAuthoredStations().find((s) => s.def.wreck === LINE_WRECK);
  return f ? { shellId: f.shellId, depth: f.def.depth, name: f.def.name } : null;
}

export function lineFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === LINE_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

export function lineBuilt(state: GameState): boolean {
  return tierOf(state, 'line') > 0;
}

export function lineSlots(state: GameState): number {
  return LINE_SLOTS[Math.min(tierOf(state, 'line'), MAX_MACHINE_TIER)] ?? 0;
}

/** Tier III: a member with nothing to do is skipped instead of stalling. */
export function skipsIdle(state: GameState): boolean {
  return tierOf(state, 'line') >= 3;
}

export function nextLineTierCost(state: GameState): number | null {
  const t = tierOf(state, 'line');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildLine(state: GameState, ctx: EngineCtx): ActionResult {
  if (!lineFound(state)) {
    const at = lineStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Line.' };
  }
  const cost = nextLineTierCost(state);
  if (cost === null) return { ok: false, reason: 'The Line is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'line', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['line'] = tierOf(state, 'line') + 1;
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'line', tier: plant.tiers['line']! });
  return { ok: true, data: { tier: plant.tiers['line'] } };
}

// ---------------------------------------------------------------------------
// What a member does
// ---------------------------------------------------------------------------

export interface LineStep {
  machineId: string;
  label: string;
  built: (state: GameState) => boolean;
  /** Has this machine got something to do right now? */
  can: (state: GameState) => boolean;
  /** Do it. Returns false if it declined after all. */
  run: (state: GameState, ctx: EngineCtx) => boolean;
}

/**
 * THE FOUR MACHINES WITH AN UNATTENDED DEFAULT.
 *
 * A machine belongs on a Line only if "run it" has an answer that does not need
 * a decision — a Crusher takes the biggest stack it is allowed, a Breaker takes
 * the cheapest part, a Still takes the tutorial row, a Refinery takes the
 * biggest stack that can go up a band. The Sieve and the Crucible are ABSENT
 * and that is deliberate: a filter is a standing rule with nothing to fire, and
 * a pour without a ratio is not a default, it is a guess.
 */
export const LINE_STEPS: LineStep[] = [
  {
    machineId: 'crusher',
    label: 'crush the biggest stack it will take',
    built: crusherBuilt,
    can: (s) => pickCrush(s) !== null,
    run: (s, ctx) => {
      const pick = pickCrush(s);
      return pick ? crush(s, ctx, pick.materialId, pick.band).ok : false;
    },
  },
  {
    machineId: 'refinery',
    label: 'take a stack up a band',
    built: (s) => tierOf(s, 'refinery') > 0 && refineryUnlocked(s),
    can: (s) => pickRefine(s) !== null,
    run: (s, ctx) => {
      const pick = pickRefine(s);
      return pick ? refine(s, ctx, pick.materialId, pick.band).ok : false;
    },
  },
  {
    machineId: 'still',
    label: 'take the one thing wrong out of a trap',
    built: stillBuilt,
    can: (s) => distillable(s).length > 0,
    run: (s, ctx) => {
      const d = distillable(s)[0];
      return d ? distil(s, ctx, d.materialId, d.band, d.trait).ok : false;
    },
  },
  {
    machineId: 'breaker',
    label: 'break the cheapest part back to stone',
    built: breakerBuilt,
    can: (s) => breakable(s).length > 0,
    run: (s, ctx) => {
      const b = breakable(s)[0];
      return b ? breakPart(s, ctx, b.partId).ok : false;
    },
  },
];

function pickCrush(state: GameState): { materialId: string; band: PurityBand } | null {
  const pins = new Set(state.qol?.pins ?? []);
  const pick = crushable(state).find((c) => !pins.has(c.materialId));
  return pick ? { materialId: pick.materialId, band: pick.band } : null;
}

function pickRefine(state: GameState): { materialId: string; band: PurityBand } | null {
  const pins = new Set(state.qol?.pins ?? []);
  let best: { materialId: string; band: PurityBand; count: number } | null = null;
  for (const [materialId, per] of Object.entries(state.materials.stacks)) {
    if (pins.has(materialId)) continue;
    for (const band of BANDS) {
      const s = per[band];
      // The top band has nowhere to go, and a refine wants stock to work with.
      if (!s || s.count < 2 || band === BANDS[BANDS.length - 1]) continue;
      if (!best || s.count > best.count) best = { materialId, band, count: s.count };
    }
  }
  return best ? { materialId: best.materialId, band: best.band } : null;
}

export function stepFor(machineId: string): LineStep | undefined {
  return LINE_STEPS.find((s) => s.machineId === machineId);
}

/** Machines that could be put on a Line, right now. LAW 3: built ones only. */
export function linkable(state: GameState): LineStep[] {
  return LINE_STEPS.filter((s) => s.built(state));
}

// ---------------------------------------------------------------------------
// EFFICIENCY, and the draw
// ---------------------------------------------------------------------------

/**
 * HOW WELL THE MEMBERS' THROUGHPUTS MATCH, 0..1 (§14.5).
 *
 * Throughput is what a machine ASKS for — its Flow plus its Surge, which is the
 * plant's own measure of how big it is. A Line of machines that want the same
 * amount runs at 1; one that pairs the Crusher (14 Surge) with the Sieve (1.1
 * Flow) runs badly, and the number says so before you press anything.
 *
 * A one-member Line is perfectly efficient and perfectly pointless, which is
 * why the minimum is three.
 */
export function efficiency(members: string[]): number {
  const draws = members.map((id) => demandOf(id).flow + demandOf(id).surge).filter((n) => n > 0);
  if (draws.length < 2) return 1;
  const lo = Math.min(...draws);
  const hi = Math.max(...draws);
  return hi > 0 ? lo / hi : 1;
}

/**
 * WHAT ONE FIRING COSTS. The SUM of its members, and a mismatched Line pays a
 * penalty on top — never a discount. §14.5 calls it "a single enormous Surge
 * draw"; the enormity is the point, and the saving is your attention, not your
 * bank.
 */
export function lineDraw(members: string[]): number {
  const sum = members.reduce((n, id) => n + demandOf(id).surge, 0);
  const e = efficiency(members);
  return Math.ceil(sum * (2 - e));
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

export function setLine(state: GameState, members: string[]): ActionResult {
  if (!lineBuilt(state)) return { ok: false, reason: 'The Line is not standing.' };
  const slots = lineSlots(state);
  const clean = [...new Set(members)].filter((id) => stepFor(id) && linkable(state)
    .some((s) => s.machineId === id));
  if (clean.length > slots) return { ok: false, reason: `This Line holds ${slots} machines.` };
  ensureLine(state).members = clean;
  return { ok: true, data: { members: clean } };
}

export function holdLine(state: GameState, held: boolean): ActionResult {
  const l = ensureLine(state);
  if (l.held === held) return { ok: false, reason: held ? 'Already held.' : 'Already running.' };
  l.held = held;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Firing
// ---------------------------------------------------------------------------

export function lineBlocker(state: GameState, members = ensureLine(state).members): string | null {
  if (!lineBuilt(state)) return 'The Line is not standing.';
  if (machineSpeed(state, 'line') <= 0) return 'It has cracked. Re-cast it before it will run.';
  if (ensureLine(state).held) return 'The Line is held.';
  if (members.length < 3) return 'A Line wants three machines.';
  if (members.length > lineSlots(state)) return `This Line holds ${lineSlots(state)}.`;
  const missing = members.filter((id) => !stepFor(id)?.built(state));
  if (missing.length > 0) return `${missing.join(', ')} is not built.`;
  if (!skipsIdle(state)) {
    const idle = members.filter((id) => !stepFor(id)!.can(state));
    if (idle.length > 0) return `${idle.join(', ')} has nothing to do — the Line stalls.`;
  } else if (!members.some((id) => stepFor(id)!.can(state))) {
    return 'Nothing on the Line has anything to do.';
  }
  const need = lineDraw(members);
  if ((state.plant?.surge ?? 0) < need) {
    return `The bank holds ${Math.floor(state.plant?.surge ?? 0)} of the ${need} it wants.`;
  }
  return null;
}

/**
 * FIRE THE WHOLE LINE. One Surge draw, then every member in order.
 *
 * ALL OR NOTHING BELOW TIER III, and the refusal happens BEFORE the draw — a
 * stalled Line costs nothing, which is what makes "it stalls" a thing you
 * notice rather than a thing you pay for.
 */
export function runLine(state: GameState, ctx: EngineCtx): ActionResult {
  const l = ensureLine(state);
  const blocked = lineBlocker(state);
  if (blocked) { l.stalled += 1; return { ok: false, reason: blocked }; }

  const need = lineDraw(l.members);
  const p = ensurePlant(state);
  if (p.surge < need) { l.stalled += 1; return { ok: false, reason: 'The bank is short.' }; }
  p.surge -= need;

  const ran: string[] = [];
  /**
   * THE MEMBERS DO NOT DRAW AGAIN. Their ordinary verbs call `fire`, and the
   * Line has already paid for all of them — `plant.inLine` is the seam, set
   * here and cleared in a `finally` so a member that throws cannot leave the
   * plant permanently free.
   *
   * Found by this file's own test on its first run: a three-machine press cost
   * 68 Surge against a quoted 54, because the Line charged the sum and then
   * every member charged itself. A quoted price that is not the price is the
   * worst kind of readout.
   */
  p.inLine = true;
  try {
    for (const id of l.members) {
      const step = stepFor(id);
      if (!step || !step.can(state)) continue;
      if (step.run(state, ctx)) ran.push(id);
    }
  } finally {
    p.inLine = false;
  }
  l.fired += 1;
  ctx.emit({ type: 'lineFired', ran, draw: need });
  ctx.dirty();
  return { ok: true, data: { ran, draw: need, efficiency: efficiency(l.members) } };
}

export { fire };
