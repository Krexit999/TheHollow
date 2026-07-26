/**
 * DRILL ALLOYS — the runtime half. Defs and matching live in
 * content/drillAlloys.ts; this is what the drill tick and the drop roll
 * actually call, plus the three verbs (forge one into a drill, pull one out,
 * and price the pour).
 *
 * ONE ALLOY PER DRILL (A.54, was bay-wide in A.53). The bay is still furniture
 * — a drill with no alloy needs nothing and mines fine — but a drill that HAS
 * one carries it alone, so a bay of eight can be running three different
 * abilities at once and the interesting question is which drill gets which.
 *
 * THE PER-CELL MARKS ARE ON THE ROCK. `residue` and `richness` are written by
 * whichever drill carries the ability that writes them, and read by ANY drill
 * that comes to that cell afterwards. This is the mechanism that makes a mix
 * worth assembling: one emberset drill softens rock for the seven around it.
 * They are kept here rather than on `face.cells` because they are owned by this
 * feature — created lazily, decayed on their own beat, resized with the face.
 *
 * FITTING AN ALLOY IS ALWAYS A POUR. There is no free equip toggle: putting an
 * ability into a drill spends the materials and the bench fee every time, so
 * swapping is a decision. Pulling one OUT is free — you can always stop.
 */
import type { ActionResult, DrillState, EngineCtx, GameState } from '../types';
import { D } from '../decimal';
import { spendCurrency, getCurrency } from '../resources';
import { convCurrencyId, currentShell } from '../shells';
import { consumeMaterial, materialCount } from './forge';
import { neighbors } from './face';
import {
  ABILITY_BY_ID, DRILL_ABILITIES, alloyHint, dominantTrait, matchDrillAlloy,
  type DrillAbilityDef, type DrillAbilityKind,
} from '../content/drillAlloys';

/** How much of a full bite an arced cell takes. Half — the jump is a bonus on
 *  charge that was already sitting there, not a second full strike. */
export const ARC_SHARE = 0.5;

/**
 * WHAT A POUR COSTS, and why it is no longer a flat 20.
 *
 * A.53 priced every alloy at 20 of the shell's coin, which is three drill
 * upgrades — trivial for an ability that changes how the whole grid behaves,
 * and it made swapping a free toggle rather than a decision. The price now
 * reads three things:
 *
 *   THE ABILITY'S WEIGHT   from the sim, not from feel (`def.weight`).
 *   THE SHELL              deeper worlds pay more, on the same shape the
 *                          quench trough uses (tempering.ts `temperCost`).
 *   HOW MANY DRILLS        each drill is its own pour. Alloying a full bay of
 *                          24 with the strongest ability costs roughly what the
 *                          24 chassis cost, which is the point: a MIX is
 *                          cheaper than cloning, and cheaper is also better.
 *
 * A miss costs ONE pour regardless of how many drills were selected — you
 * poured once and it failed, and experimenting should not be priced like
 * committing.
 */
export const ALLOY_POUR_BASE = 80;

/** How many materials a pour takes. Two is enough to express a signature and
 *  few enough that the space stays reasonable to explore. */
export const POUR_SLOTS = 3;

export interface AlloyPrice {
  /** Shell currency, for the whole pour (already multiplied by drill count). */
  conv: number;
  /** Units consumed of EACH material fed in, for the whole pour. */
  materials: number;
  drills: number;
}

/** Deeper shells pay more, on the quench trough's shape rather than a new one. */
function shellMult(state: GameState): number {
  return 1 + 0.5 * (currentShell(state).ordinal - 1);
}

export function alloyCost(state: GameState, def: DrillAbilityDef, drills = 1): AlloyPrice {
  const n = Math.max(1, drills);
  return {
    conv: Math.round(ALLOY_POUR_BASE * def.weight * shellMult(state)) * n,
    materials: (1 + def.weight) * n,
    drills: n,
  };
}

/** What a pour that turns out to be slag costs. One bench firing, no ability. */
export function slagCost(state: GameState): AlloyPrice {
  return { conv: Math.round(ALLOY_POUR_BASE * shellMult(state)), materials: 2, drills: 1 };
}

// --- reading what the bay is carrying --------------------------------------

export function drillAbility(drill: DrillState): DrillAbilityDef | null {
  return drill.alloy ? ABILITY_BY_ID.get(drill.alloy) ?? null : null;
}

/**
 * The strongest fitted ability of a given kind, or null. The per-cell marks are
 * written by one drill and read by all of them, so the READ has to find the
 * ability whose params govern — it cannot ask "the equipped one" any more.
 * Strongest rather than first so a later, better alloy is what the rock obeys.
 */
export function bayAbility(state: GameState, kind: DrillAbilityKind): DrillAbilityDef | null {
  let best: DrillAbilityDef | null = null;
  for (const unit of state.drills.units) {
    const def = drillAbility(unit);
    if (def?.kind !== kind) continue;
    if (!best || def.weight > best.weight) best = def;
  }
  return best;
}

/** Abilities the player has actually made. The discovery record (pillar 5). */
export function knownAbilities(state: GameState): DrillAbilityDef[] {
  return DRILL_ABILITIES.filter((a) => state.drills.alloys.includes(a.id));
}

/** Which drills are carrying this ability right now — the bay's mix, for the UI. */
export function drillsCarrying(state: GameState, id: string): number[] {
  const out: number[] = [];
  state.drills.units.forEach((u, i) => { if (u.alloy === id) out.push(i); });
  return out;
}

// --- per-cell state --------------------------------------------------------

function cellArray(state: GameState, key: 'residue' | 'richness'): number[] {
  const want = state.face.cells.length;
  let arr = state.drills[key];
  if (!Array.isArray(arr) || arr.length !== want) {
    arr = new Array(want).fill(0);
    state.drills[key] = arr;
  }
  return arr;
}

/** THE SET: how much bigger this bite is for rock that is still soft. Any drill
 *  gets it — the rock is soft, and softness is not choosy about the machine. */
export function residueBite(state: GameState, cell: number): number {
  const ability = bayAbility(state, 'residue');
  if (!ability) return 1;
  const r = state.drills.residue?.[cell] ?? 0;
  return r > 0 ? 1 + (ability.params['bite'] ?? 0.5) : 1;
}

/** Written only by a drill that carries the ability — hence the explicit def. */
export function markResidue(state: GameState, cell: number, ability: DrillAbilityDef | null): void {
  if (ability?.kind !== 'residue') return;
  cellArray(state, 'residue')[cell] = ability.params['decay'] ?? 9;
}

export function markRichness(state: GameState, cell: number, ability: DrillAbilityDef | null): void {
  if (ability?.kind !== 'attract') return;
  const arr = cellArray(state, 'richness');
  arr[cell] = (arr[cell] ?? 0) + 1;
}

/**
 * THE CALL: what this cell's drop rolls as. Every `every` strikes the cell has
 * gathered enough to roll as if it were `depthBonus` deeper — richer rarities,
 * same drop CHANCE. Reading it resets the gather, so it is a periodic reward
 * for working one cell rather than a permanent tilt.
 */
export function attractDepthBonus(state: GameState, cell: number | undefined): number {
  const ability = bayAbility(state, 'attract');
  if (!ability || cell === undefined) return 0;
  const arr = cellArray(state, 'richness');
  const every = ability.params['every'] ?? 6;
  if ((arr[cell] ?? 0) < every) return 0;
  arr[cell] = 0;
  return ability.params['depthBonus'] ?? 30;
}

/** How full this cell's gather is, 0..1 — the face draws it. */
export function richnessLevel(state: GameState, cell: number): number {
  const ability = bayAbility(state, 'attract');
  if (!ability) return 0;
  const every = ability.params['every'] ?? 6;
  return Math.min(1, (state.drills.richness?.[cell] ?? 0) / every);
}

/** How soft this cell still is, 0..1 — the face draws it. */
export function residueLevel(state: GameState, cell: number): number {
  const ability = bayAbility(state, 'residue');
  if (!ability) return 0;
  const decay = ability.params['decay'] ?? 9;
  return Math.min(1, (state.drills.residue?.[cell] ?? 0) / decay);
}

/** THE ARC: which neighbours this strike jumps to. Only cells with charge in
 *  them — an arc into dead rock is not a thing anyone would see happen. */
export function arcTargets(
  state: GameState, from: number, skip: (i: number) => boolean, ability: DrillAbilityDef | null,
): number[] {
  if (ability?.kind !== 'arc') return [];
  const jumps = Math.round(ability.params['jumps'] ?? 2);
  return neighbors(state, from)
    .filter((i) => !skip(i) && (state.face.cells[i] ?? 0) > 0.5)
    .sort((a, b) => (state.face.cells[b] ?? 0) - (state.face.cells[a] ?? 0))
    .slice(0, jumps);
}

/** Residue cools on the one-second beat. It cools whether or not anything is
 *  still fitted — a mark that outlived the alloy that made it is a stain. */
export function tickAlloys(state: GameState, dt: number): void {
  const arr = state.drills.residue;
  if (!Array.isArray(arr)) return;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]! > 0) arr[i] = Math.max(0, arr[i]! - dt);
  }
}

// --- the verbs -------------------------------------------------------------

/**
 * POUR, into one drill or several.
 *
 * The materials and the bench fee are spent either way — a miss teaches you the
 * space, which is the Crucible's established bargain and the reason
 * experimenting is a decision rather than a free scan. A miss still NAMES what
 * the mix leaned toward, so nothing is ever learned from nothing.
 *
 * THE PRICE IS NOT QUOTED FOR A MIX YOU HAVE NEVER MADE. `alloyCost` is public
 * and the bench shows it for a KNOWN ability, but an unknown mix pours at
 * whatever it turns out to want. Quoting it beforehand would be a free scanner:
 * read the price, learn whether the mix is slag or which ability it is, and
 * never pay to find out. The only thing an unaffordable unknown pour leaks is
 * that the player is short, which is not a recipe.
 */
export function forgeDrillAlloy(
  state: GameState, ctx: EngineCtx, materialIds: string[], drillIndices: number[],
): ActionResult {
  const picked = materialIds.filter(Boolean);
  if (picked.length === 0) return { ok: false, reason: 'Nothing in the crucible' };
  if (picked.length > POUR_SLOTS) return { ok: false, reason: 'Too much in the crucible' };

  const targets = [...new Set(drillIndices)].filter((i) => state.drills.units[i] !== undefined);
  if (targets.length === 0) return { ok: false, reason: 'No drill to pour it into' };

  const match = matchDrillAlloy(picked);
  // A hit is priced per drill; a miss is one firing of the bench.
  const price = match ? alloyCost(state, match, targets.length) : slagCost(state);
  const conv = convCurrencyId(state);

  for (const id of picked) {
    if (materialCount(state, id) < price.materials) {
      return { ok: false, reason: 'Not enough of that in the hold for this pour' };
    }
  }
  if (getCurrency(state, conv).lt(price.conv)) {
    return { ok: false, reason: 'The bench wants more than you are carrying' };
  }

  spendCurrency(state, conv, D(price.conv));
  for (const id of picked) consumeMaterial(state, id, price.materials);

  if (!match) {
    const dom = dominantTrait(picked);
    ctx.dirty();
    return {
      ok: true,
      data: {
        alloy: null,
        // The miss is the teaching move: it says what the mix WAS, not what it
        // failed to be, so the next pour is reasoned rather than re-rolled.
        reason: dom
          ? `Slag. It leaned ${dom}, and not hard enough to become anything.`
          : 'Slag. Nothing in that mix was reaching for anything.',
      },
    };
  }

  // FIRST TIME IS THE DISCOVERY. Recorded permanently; re-pouring a known alloy
  // is the ordinary way to fit a second drill with it.
  const known = state.drills.alloys.includes(match.id);
  if (!known) {
    state.drills.alloys.push(match.id);
    ctx.emit({ type: 'drillAlloyFound', id: match.id });
  }
  for (const i of targets) state.drills.units[i]!.alloy = match.id;
  ctx.dirty();
  return { ok: true, data: { alloy: match.id, known, drills: targets.length } };
}

/** Pulling an alloy out is free. You can always stop doing a thing. */
export function clearDrillAlloy(state: GameState, index: number): ActionResult {
  const drill = state.drills.units[index];
  if (!drill) return { ok: false, reason: 'No such drill' };
  if (!drill.alloy) return { ok: false, reason: 'That one is running bare already' };
  delete drill.alloy;
  return { ok: true };
}

export { alloyHint };
