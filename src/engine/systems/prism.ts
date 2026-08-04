/**
 * THE PRISM — THE SPECTRUM (§13, §6, keystone at Prism Fall 20).
 *
 * §13: "allocate intensity — and light the face at all · blocks MINING IN
 * GLASSMERE."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SPEC COLLIDES WITH WHAT IS BUILT, AND THIS IS THE REPORT RATHER THAN A
 * RE-AUTHORING.
 *
 * "Light the face at all" and "blocks mining in Glassmere" describe a shell
 * where nothing works until a wreck is looted. **That is not this game.**
 * `systems/refraction.ts` has shipped since Phase 10: the beam enters at a row
 * you choose, walks the mirrors you place, and lights the cells it crosses,
 * with no machine anywhere in the path. Glassmere is playable from its first
 * metre and has been for dozens of phases.
 *
 * Making the spec true would mean taking a shipped shell away from every save
 * that has one — the "gate, not tax" line this codebase has reverted two
 * systems for crossing. So the beam is untouched, and what the Prism actually
 * delivers is the OTHER half of §13's line, which is the half that was missing:
 * ALLOCATION.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHAT IT UNLOCKS IS A VERB (LAW 4): you decide what the light IS.
 *
 * `refraction.ts` already holds six wavelengths and six rules, and the player
 * has never had a say in them — `traceBeam` assigns
 * `color = 1 + ((out.length / 3) | 0) % 5`, i.e. the colours walk the path in
 * fixed thirds, forever, in that order. Six authored rules nobody could aim.
 *
 * The Prism is the machine that aims them. ONE SYSTEM, NOT TWO: this file adds
 * no beam, no path and no second renderer. It holds an ALLOCATION, and
 * `traceBeam` reads it where it used to read a modulo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AND IT IS THE ANSWER TO A.90's UNLIT FINDING.
 *
 * A.90 shipped Glassmere's E2 rule (UNLIT — half speed, and the purity band
 * survives whatever tier the machine is) and recorded that it COULD NOT FIRE:
 * `litBands` returns all six whenever the beam is white, and the beam is white
 * until Shell Mastery 25 opens THE SPLIT. A rule that cannot happen for
 * twenty-five mastery levels is a rule the player will never meet.
 *
 * A standing Prism is what changes that. The allocation — not the beam — is
 * what `litBands` reads once the machine exists, so a player who puts their
 * intensity into three bands has left three DARK, and every machine sitting in
 * one goes UNLIT. That works from the first tier, long before the Split, which
 * makes the Prism the thing that turns an unreachable rule into a decision.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * TIERS ARE CAPABILITY (§15.4), and each is a different sentence:
 *   I    WHICH bands the light carries — one point each, and there are fewer
 *        points than bands, so it is a choice from the first second
 *   II   HOW MUCH of each — the points stack, so a band can be leaned on
 *   III  WHITE IN THE MIX — the whole gift at once, on part of the path
 *
 * PILLAR 2. The allocation decides WHICH of six authored rules applies at each
 * segment of a path whose LENGTH it cannot change. It cannot add a segment,
 * cannot light a cell the beam does not cross, and there is no path from this
 * file to `cellCap`, `cellRegen` or `chipYield`.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { MAX_MACHINE_TIER, TIER_PART_COST, ensurePlant, noteBuiltOf, tierOf } from './plant';
import { conditionOf } from './condition';
import { isLooted } from './roll';
import { allAuthoredStations } from '../content/rolls';
import { WAVELENGTH_NAMES, WAVELENGTH_RULES } from './refraction';

/** The wreck it is found in — Glassmere, Prism Fall 20 (§6). */
export const PRISM_WRECK = 'THE PRISM';

/**
 * HOW MANY POINTS OF INTENSITY THERE ARE TO SPEND. Three, against five colour
 * bands (six with white), so the very first setting is a CHOICE and not a
 * form to fill in. It never grows: a tier buys a different KIND of freedom,
 * never a bigger budget, because a bigger budget is the multiplier §15.4
 * forbids wearing a hat.
 */
export const INTENSITY = 3;

/** Bands 1..5 are the colours; 0 is white and only a tier-III Prism reaches it. */
export const BAND_COUNT = 6;

export const TIER_CAPABILITY_PRISM = [
  'not built',
  'which bands the light carries',
  '...and how much of each',
  '...and white in the mix',
] as const;

export interface PrismState {
  /** Points on each of the six bands. Sums to at most INTENSITY. */
  intensity: number[];
}

export function defaultPrismState(): PrismState {
  // Three colours, one point each — the shape `traceBeam` had before this
  // machine existed, so a Prism raised and never touched changes nothing.
  return { intensity: [0, 1, 1, 1, 0, 0] };
}

export function ensurePrism(state: GameState): PrismState {
  const p = (state.prism ??= defaultPrismState());
  if (!Array.isArray(p.intensity) || p.intensity.length !== BAND_COUNT) {
    p.intensity = defaultPrismState().intensity;
  }
  return p;
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

export function prismStation(): { shellId: string; depth: number; name: string } | null {
  const f = allAuthoredStations().find((s) => s.def.wreck === PRISM_WRECK);
  return f ? { shellId: f.shellId, depth: f.def.depth, name: f.def.name } : null;
}

export function prismFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === PRISM_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

export function prismBuilt(state: GameState): boolean {
  return tierOf(state, 'prism') > 0;
}

/** Tier II: the points stack, so a band can be leaned on. */
export function weighted(state: GameState): boolean {
  return tierOf(state, 'prism') >= 2;
}

/** Tier III: white is a legal target. */
export function reachesWhite(state: GameState): boolean {
  return tierOf(state, 'prism') >= 3;
}

export function nextPrismTierCost(state: GameState): number | null {
  const t = tierOf(state, 'prism');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildPrism(state: GameState, ctx: EngineCtx): ActionResult {
  if (!prismFound(state)) {
    const at = prismStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Prism.' };
  }
  const cost = nextPrismTierCost(state);
  if (cost === null) return { ok: false, reason: 'The Prism is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'prism', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['prism'] = tierOf(state, 'prism') + 1;
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'prism', tier: plant.tiers['prism']! });
  return { ok: true, data: { tier: plant.tiers['prism'] } };
}

// ---------------------------------------------------------------------------
// The allocation
// ---------------------------------------------------------------------------

export function intensityOf(state: GameState, band: number): number {
  if (!prismBuilt(state)) return 0;
  return ensurePrism(state).intensity[band] ?? 0;
}

export function spent(state: GameState): number {
  return ensurePrism(state).intensity.reduce((n, x) => n + x, 0);
}

export function allocateBlocker(state: GameState, band: number, points: number): string | null {
  if (!prismBuilt(state)) return 'The Prism is not standing.';
  if (conditionOf(state, 'prism')?.seized) return 'It has cracked. Re-cast it before it will run.';
  if (band < 0 || band >= BAND_COUNT) return 'No such band.';
  if (band === 0 && points > 0 && !reachesWhite(state)) {
    return 'This Prism splits the light. It cannot put it back together.';
  }
  if (points < 0) return 'Nothing below nothing.';
  if (points > 1 && !weighted(state)) {
    return 'This Prism carries a band or it does not. Leaning on one comes later.';
  }
  const p = ensurePrism(state);
  const after = spent(state) - (p.intensity[band] ?? 0) + points;
  if (after > INTENSITY) {
    return `There are ${INTENSITY} points of intensity and that would spend ${after}.`;
  }
  return null;
}

/**
 * PUT THE LIGHT SOMEWHERE. The only verb this machine has, and it costs
 * nothing — the budget is the cost, and it was always spent somewhere.
 */
export function allocate(
  state: GameState, ctx: EngineCtx, band: number, points: number,
): ActionResult {
  const blocked = allocateBlocker(state, band, points);
  if (blocked) return { ok: false, reason: blocked };
  const p = ensurePrism(state);
  p.intensity[band] = points;
  // The beam's colours are read off this, so the traced path is now stale.
  state.refraction.pathDirty = true;
  ctx.emit({ type: 'allocated', band, points });
  ctx.dirty();
  return { ok: true, data: { band, points, spent: spent(state) } };
}

/**
 * THE BANDS THE LIGHT IS ACTUALLY CARRYING, as a flat list of band indices one
 * entry per point — which is exactly the shape `traceBeam` wants, because a
 * band with two points should occupy twice as much of the path.
 *
 * Empty when no Prism stands, and `traceBeam` keeps its old modulo in that
 * case. That is what makes this file a pure addition.
 */
export function carriedBands(state: GameState): number[] {
  if (!prismBuilt(state)) return [];
  const out: number[] = [];
  const p = ensurePrism(state);
  for (let b = 0; b < BAND_COUNT; b++) {
    for (let i = 0; i < (p.intensity[b] ?? 0); i++) out.push(b);
  }
  return out;
}

/** One row per band for the panel: its name, its rule, and its points. */
export function spectrum(
  state: GameState,
): { band: number; name: string; rule: string; points: number; lit: boolean }[] {
  const p = ensurePrism(state);
  return Array.from({ length: BAND_COUNT }, (_, b) => ({
    band: b,
    name: WAVELENGTH_NAMES[b] ?? `Band ${b}`,
    rule: WAVELENGTH_RULES[b] ?? '',
    points: p.intensity[b] ?? 0,
    lit: (p.intensity[b] ?? 0) > 0,
  }));
}
