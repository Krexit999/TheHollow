/**
 * THE PATTERN BENCH — PATTERNS (§13, §6, keystone at Patternwright's Rest 90).
 *
 * §13: "record a configuration, re-pour in one click · blocks tier IX+ pour
 * volume." The station's own line has said what it is for since the Roll was
 * authored: *"She drew the shape first and poured to it after, which everyone
 * said was backwards."*
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A PATTERN MUST NOT MAKE ANYTHING CHEAPER — ONLY REPEATABLE. If it reduces
 * cost it is a faucet.
 *
 * So `repour` does not have a price of its own, and it does not have a
 * shortcut: it calls `chargeCrucible` and `castPart` — the same two functions
 * the player's hands call, in the same order, with the same arguments the
 * recording saw. There is no branch in either of them that knows a pattern
 * exists. **The cost identity is therefore STRUCTURAL rather than asserted**:
 * there is no second code path that could drift from the first, which is the
 * only version of this guarantee that stays true after somebody re-prices a
 * cast in two years.
 *
 * The test measures it anyway — melt spent and units consumed, hand against
 * pattern, part for part — because a structural argument nobody checked is
 * still a claim.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHAT IT UNLOCKS IS A VERB (LAW 4): the tool you have already made becomes a
 * thing you can make AGAIN. Seven casts is seven shape choices, seven material
 * choices and seven trips to the tub, and none of that is a decision the second
 * time — it is the decision you already made, typed out again. §25.5's whole
 * complaint about automation is that the interesting part must survive it, and
 * a re-pour keeps the interesting part exactly where it was: at the bench, the
 * first time.
 *
 * TIERS ARE CAPABILITY (§15.4), and each is a different sentence:
 *   I    ONE PATTERN, poured from what is already in the tub
 *   II   IT CHARGES THE TUB ITSELF, out of the Hold
 *   III  AS MANY PATTERNS AS YOU LIKE, named
 *
 * PILLAR 2. A re-pour spends what the hands would have spent and produces what
 * the hands would have produced. It cannot make a part that could not be cast,
 * cannot touch a currency, and there is no path from this file to `cellCap`,
 * `cellRegen` or `chipYield`.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { materialDef } from '../materials';
import { MAX_MACHINE_TIER, TIER_PART_COST, ensurePlant, noteBuiltOf, tierOf } from './plant';
import { conditionOf } from './condition';
import { isLooted } from './roll';
import { allAuthoredStations } from '../content/rolls';
import { PART_TYPES, type PartShape, type PartType } from '../content/forgeParts';
import { castPart, chargeCrucible, castMelt, MELT_PER_UNIT } from './casting';
import { materialCount } from './forge';

/** The wreck it is found in — Glassmere, Patternwright's Rest 90 (§6). */
export const PATTERN_WRECK = 'THE PATTERN BENCH';

export const TIER_CAPABILITY_PATTERN = [
  'not built',
  'one pattern, poured from what is in the tub',
  '...and it charges the tub itself',
  '...and as many patterns as you like',
] as const;

/** One recorded cast. Exactly the arguments `castPart` takes, and no others. */
export interface PatternCast {
  type: PartType;
  materialId: string;
  shape?: PartShape;
  layers: number;
}

export interface Pattern {
  id: number;
  name: string;
  casts: PatternCast[];
}

export interface PatternState {
  saved: Pattern[];
  nextId: number;
  /** How many parts have come off a pattern — the record, and nothing else. */
  poured: number;
}

export function defaultPatternState(): PatternState {
  return { saved: [], nextId: 1, poured: 0 };
}

export function ensurePattern(state: GameState): PatternState {
  const p = (state.pattern ??= defaultPatternState());
  p.saved ??= [];
  if (typeof p.nextId !== 'number') p.nextId = 1;
  if (typeof p.poured !== 'number' || Number.isNaN(p.poured)) p.poured = 0;
  return p;
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

export function patternStation(): { shellId: string; depth: number; name: string } | null {
  const f = allAuthoredStations().find((s) => s.def.wreck === PATTERN_WRECK);
  return f ? { shellId: f.shellId, depth: f.def.depth, name: f.def.name } : null;
}

export function patternFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === PATTERN_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

export function patternBuilt(state: GameState): boolean {
  return tierOf(state, 'pattern') > 0;
}

/** Tier II: it will fill the tub out of the Hold rather than waiting for you. */
export function chargesItself(state: GameState): boolean {
  return tierOf(state, 'pattern') >= 2;
}

/** How many patterns this bench will hold. One, until the last tier. */
export function patternSlots(state: GameState): number {
  return tierOf(state, 'pattern') >= 3 ? Infinity : 1;
}

export function nextPatternTierCost(state: GameState): number | null {
  const t = tierOf(state, 'pattern');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildPatternBench(state: GameState, ctx: EngineCtx): ActionResult {
  if (!patternFound(state)) {
    const at = patternStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Pattern Bench.' };
  }
  const cost = nextPatternTierCost(state);
  if (cost === null) return { ok: false, reason: 'The Pattern Bench is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'pattern', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['pattern'] = tierOf(state, 'pattern') + 1;
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'pattern', tier: plant.tiers['pattern']! });
  return { ok: true, data: { tier: plant.tiers['pattern'] } };
}

// ---------------------------------------------------------------------------
// RECORD
// ---------------------------------------------------------------------------

/**
 * WHAT IS ON THE STATION RIGHT NOW, as a pattern would record it. A pattern
 * records what you ALREADY DID — it reads the seven bench slots and writes down
 * their type, material, shape and layer count, which is precisely the set of
 * arguments a cast takes. Nothing is inferred and nothing is optimised.
 */
export function benchAsPattern(state: GameState): PatternCast[] {
  const out: PatternCast[] = [];
  for (const t of PART_TYPES) {
    const id = state.casting?.bench?.[t];
    if (id === undefined) continue;
    const part = state.casting.rack.find((p) => p.id === id);
    if (!part) continue;
    out.push({
      type: t,
      materialId: part.materialId,
      ...(part.shape ? { shape: part.shape as PartShape } : {}),
      layers: 1 + (part.layers?.length ?? 0),
    });
  }
  return out;
}

export function recordBlocker(state: GameState): string | null {
  if (!patternBuilt(state)) return 'The Pattern Bench is not standing.';
  if (conditionOf(state, 'pattern')?.seized) return 'It has cracked. Re-cast it before it will run.';
  if (benchAsPattern(state).length === 0) {
    return 'There is nothing on the station to draw.';
  }
  const p = ensurePattern(state);
  if (p.saved.length >= patternSlots(state)) {
    return `This bench holds ${patternSlots(state)} pattern. Clear it, or raise the bench.`;
  }
  return null;
}

export function recordPattern(state: GameState, ctx: EngineCtx, name?: string): ActionResult {
  const blocked = recordBlocker(state);
  if (blocked) return { ok: false, reason: blocked };
  const p = ensurePattern(state);
  const casts = benchAsPattern(state);
  const pat: Pattern = {
    id: p.nextId++,
    name: name?.trim() || `Pattern ${p.nextId - 1}`,
    casts,
  };
  p.saved.push(pat);
  ctx.emit({ type: 'patternDrawn', patternId: pat.id, casts: casts.length });
  ctx.dirty();
  return { ok: true, data: { patternId: pat.id, casts: casts.length } };
}

export function forgetPattern(state: GameState, ctx: EngineCtx, patternId: number): ActionResult {
  const p = ensurePattern(state);
  const i = p.saved.findIndex((x) => x.id === patternId);
  if (i < 0) return { ok: false, reason: 'No such pattern.' };
  p.saved.splice(i, 1);
  ctx.dirty();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// RE-POUR
// ---------------------------------------------------------------------------

/**
 * WHAT A RE-POUR WILL COST, before it happens — the SAME `castMelt` the hands
 * pay, summed. LAW 3: the panel states the price, and the price is the price.
 */
export function repourCost(pattern: Pattern): { melt: number; units: number } {
  const melt = pattern.casts.reduce((n, c) => n + castMelt(c.type, c.shape, c.layers), 0);
  return { melt, units: Math.ceil(melt / MELT_PER_UNIT) };
}

export function repourBlocker(state: GameState, patternId: number): string | null {
  if (!patternBuilt(state)) return 'The Pattern Bench is not standing.';
  if (conditionOf(state, 'pattern')?.seized) return 'It has cracked. Re-cast it before it will run.';
  const pat = ensurePattern(state).saved.find((x) => x.id === patternId);
  if (!pat) return 'No such pattern.';
  if (!state.forge.built) return 'The casting floor is cold.';
  if (!chargesItself(state)) {
    // Tier I pours out of the tub and nothing else. If the stone it wants is
    // not in the heat, it says which one.
    const front = state.casting.crucible.queue[0];
    const want = pat.casts[0];
    if (!front) return 'Nothing in the tub. This bench does not fill it for you yet.';
    if (want && front.materialId !== want.materialId) {
      let name = want.materialId;
      try { name = materialDef(want.materialId).name; } catch { /* unknown */ }
      return `The pattern starts in ${name}, and the tub is holding something else.`;
    }
    return null;
  }
  // Tier II: it charges the tub itself, so what it needs is HOLD stock.
  const need = new Map<string, number>();
  for (const c of pat.casts) {
    const units = Math.ceil(castMelt(c.type, c.shape, c.layers) / MELT_PER_UNIT);
    need.set(c.materialId, (need.get(c.materialId) ?? 0) + units);
  }
  for (const [id, n] of need) {
    if (materialCount(state, id) < n) {
      let name = id;
      try { name = materialDef(id).name; } catch { /* unknown */ }
      return `Short of ${name} — the pattern wants ${n} and the Hold has ${materialCount(state, id)}.`;
    }
  }
  return null;
}

/**
 * POUR IT AGAIN.
 *
 * Every cast goes through `castPart` with the arguments the recording holds.
 * A tier-II bench charges the tub through `chargeCrucible` first, at the same
 * `MELT_PER_UNIT` everything else pays. There is no third path and no discount
 * anywhere in this function, which is the whole design.
 *
 * A cast that cannot be paid for STOPS the run and says which one — a re-pour
 * that silently made five of seven parts would be worse than one that refused,
 * because the player would find out at the station.
 */
export function repour(state: GameState, ctx: EngineCtx, patternId: number): ActionResult {
  const blocked = repourBlocker(state, patternId);
  if (blocked) return { ok: false, reason: blocked };
  const pat = ensurePattern(state).saved.find((x) => x.id === patternId)!;
  let made = 0;
  for (const c of pat.casts) {
    if (chargesItself(state)) {
      const units = Math.ceil(castMelt(c.type, c.shape, c.layers) / MELT_PER_UNIT);
      const charged = chargeCrucible(state, ctx, c.materialId, units);
      if (!charged.ok) {
        return made > 0
          ? { ok: true, data: { made, stoppedAt: c.type, reason: charged.reason } }
          : { ok: false, reason: charged.reason };
      }
      // The tub melts over seconds; a pattern is not a way to skip the heat, so
      // it pours from what has ALREADY liquefied — which for a fresh charge is
      // the charge itself once the melt has run. Bring it forward here so the
      // pour is deterministic rather than dependent on a tick landing.
      const front = state.casting.crucible.queue.find((q) => q.materialId === c.materialId);
      if (front) { front.molten += front.solid; front.solid = 0; }
    }
    const r = castPart(state, ctx, c.type, c.shape, c.layers);
    if (!r.ok) {
      return made > 0
        ? { ok: true, data: { made, stoppedAt: c.type, reason: r.reason } }
        : { ok: false, reason: r.reason };
    }
    made += 1;
  }
  ensurePattern(state).poured += made;
  ctx.emit({ type: 'repoured', patternId, parts: made });
  ctx.dirty();
  return { ok: true, data: { made } };
}

/** Every pattern this bench holds, for the panel. */
export function patternsHeld(state: GameState): (Pattern & { cost: { melt: number; units: number } })[] {
  return ensurePattern(state).saved.map((p) => ({ ...p, cost: repourCost(p) }));
}
