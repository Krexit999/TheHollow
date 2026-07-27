/**
 * DRILL ALLOYS — the runtime half. Defs and matching live in
 * content/drillAlloys.ts; this is what the drill tick and the drop roll
 * actually call, plus the verbs (forge one into a drill, pull one out, and
 * price the pour).
 *
 * ONE ALLOY PER DRILL (A.54, was bay-wide in A.53). The bay is still furniture
 * — a drill with no alloy needs nothing and mines fine — but a drill that HAS
 * one carries it alone, so a bay of eight can be running three different
 * abilities at once and the interesting question is which drill gets which.
 *
 * A.56 MAKES THAT A LIST, NOT A FIELD. `DrillState.fits` is an array of
 * `{ id, grade }`, and `DrillState.slots` says how many it may hold. Every
 * bought chassis has ONE slot and behaves exactly as before; a PRIZE drill —
 * earned from a system rather than bought (systems/prizeDrills.ts) — has two or
 * three, which is most of what makes it a prize. The grade is stamped at the
 * pour and never changes afterwards: it is a property of the metal, so making a
 * better one means pouring a better one.
 *
 * THE PER-CELL MARKS ARE ON THE ROCK. `residue`, `richness` and `burn` are
 * written by whichever drill carries the ability that writes them, and read by
 * ANY drill that comes to that cell afterwards. This is the mechanism that
 * makes a mix worth assembling: one emberset drill softens rock for the seven
 * around it. They are kept here rather than on `face.cells` because they are
 * owned by this feature — created lazily, decayed on their own beat, resized
 * with the face.
 *
 * FITTING AN ALLOY IS ALWAYS A POUR. There is no free equip toggle: putting an
 * ability into a drill spends the materials and the bench fee every time, so
 * swapping is a decision. Pulling one OUT is free — you can always stop.
 */
import type { ActionResult, DrillState, EngineCtx, GameState } from '../types';
import { D } from '../decimal';
import type { ModifierCache } from '../modifiers';
import { spendCurrency, getCurrency } from '../resources';
import { convCurrencyId, currentShell } from '../shells';
import { consumeMaterial, materialCount } from './forge';
import { harvestCell, neighbors } from './face';
import { materialDef } from '../materials';
import {
  ABILITY_BY_ID, DRILL_ABILITIES, abilityParams, alloyHint, dominantTrait, gradeStep,
  matchDrillAlloy, shellOrdinal,
  type DrillAbilityDef, type DrillAbilityKind,
} from '../content/drillAlloys';

/** How much of a full bite an arced cell takes when the alloy is grade I. The
 *  ability's own `share` param carries it now (so grade can move it); this stays
 *  exported because the sim and two tests name it. */
export const ARC_SHARE = 0.5;

/**
 * WHAT A POUR COSTS, and why it is no longer a flat 20.
 *
 * A.53 priced every alloy at 20 of the shell's coin, which is three drill
 * upgrades — trivial for an ability that changes how the whole grid behaves,
 * and it made swapping a free toggle rather than a decision. The price reads
 * four things:
 *
 *   THE ABILITY'S WEIGHT   from the sim for the Loam three (`def.weight`),
 *                          hand-sized on that scale for the rest.
 *   THE SHELL              deeper worlds pay more, on the same shape the
 *                          quench trough uses (tempering.ts `temperCost`).
 *   HOW MANY DRILLS        each drill is its own pour. Alloying a full bay with
 *                          the strongest ability costs roughly what the chassis
 *                          cost, which is the point: a MIX is cheaper than
 *                          cloning, and cheaper is also better.
 *   THE GRADE (A.56)       a deeper-shell pour is a stronger ability and is
 *                          priced as one. Deeper materials are scarcer anyway,
 *                          so this is the second half of the same pressure.
 *
 * A miss costs ONE pour regardless of how many drills were selected — you
 * poured once and it failed, and experimenting should not be priced like
 * committing.
 */
export const ALLOY_POUR_BASE = 80;

/** How many materials a pour takes. Three is enough to express a signature and
 *  few enough that the space stays reasonable to explore. */
export const POUR_SLOTS = 3;

/** What each grade step adds to the price. */
export const GRADE_PRICE_STEP = 0.6;

export interface AlloyPrice {
  /** Shell currency, for the whole pour (already multiplied by drill count). */
  conv: number;
  /** Units consumed of EACH material fed in, for the whole pour. */
  materials: number;
  drills: number;
  /** The grade this pour would come out at, I..VII. */
  grade: number;
}

export interface DrillFit {
  id: string;
  /** The deepest shell any material in the pour came from, 1..7. */
  grade: number;
}

/** Deeper shells pay more, on the quench trough's shape rather than a new one. */
function shellMult(state: GameState): number {
  return 1 + 0.5 * (currentShell(state).ordinal - 1);
}

/**
 * THE GRADE OF A MIX: the deepest shell any material in it came from.
 *
 * The MAX rather than the mean, on purpose. A player who has one Ferrite stone
 * and two Loam ones has genuinely brought newer metal to the pour, and the
 * alternative (an average) would make the good material feel diluted — which is
 * the opposite of the thing this is meant to teach.
 */
export function mixGrade(materialIds: string[]): number {
  let best = 1;
  for (const id of materialIds) {
    const def = materialDef(id);
    best = Math.max(best, shellOrdinal(def.shellId));
  }
  return best;
}

export function alloyCost(
  state: GameState, def: DrillAbilityDef, drills = 1, grade = shellOrdinal(def.shell),
): AlloyPrice {
  const n = Math.max(1, drills);
  const step = gradeStep(def, grade);
  const gradeMult = 1 + GRADE_PRICE_STEP * step;
  return {
    conv: Math.round(ALLOY_POUR_BASE * def.weight * shellMult(state) * gradeMult) * n,
    materials: Math.round((1 + def.weight) * (1 + 0.25 * step)) * n,
    drills: n,
    grade,
  };
}

/** What a pour that turns out to be slag costs. One bench firing, no ability. */
export function slagCost(state: GameState): AlloyPrice {
  return { conv: Math.round(ALLOY_POUR_BASE * shellMult(state)), materials: 2, drills: 1, grade: 1 };
}

/**
 * HOW DEEP THE PLAYER HAS BEEN, as a shell ordinal. An ability belongs to a
 * shell and does not exist before you get there — the pool GROWS as you
 * descend, which is the whole of the A.56 unlock rule.
 *
 * Read from the permanent depth RECORDS rather than the current shell, so a
 * Recursion (which puts you back in Loam) does not take the pool away: you
 * learned what Cinder metal does, and that does not un-happen. Breach count is
 * taken as a floor for the same reason.
 */
export function reachedOrdinal(state: GameState): number {
  let best = 1;
  for (const [shellId, depth] of Object.entries(state.depthRecords ?? {})) {
    if ((depth ?? 0) > 0) best = Math.max(best, shellOrdinal(shellId));
  }
  return Math.max(best, Math.min(7, 1 + (state.shell?.breachCount ?? 0)));
}

/** The abilities of this shell that are in the world at all — the UI reads it
 *  to say how many are still to find without naming any of them. */
export function abilitiesReached(state: GameState): DrillAbilityDef[] {
  const reached = reachedOrdinal(state);
  return DRILL_ABILITIES.filter((a) => shellOrdinal(a.shell) <= reached);
}

// --- reading what the bay is carrying --------------------------------------

/** How many alloys this chassis can hold. One, unless it was a prize. */
export function drillSlots(drill: DrillState): number {
  return Math.max(1, drill.slots ?? 1);
}

/** A resolved fitting: the def, the grade it was poured at, and the params
 *  that grade produces. `p` is built lazily, because these reads sit on the
 *  hottest path in the engine — see the allocation note on `bayFit`. */
export interface Fit {
  def: DrillAbilityDef;
  grade: number;
  p: Record<string, number>;
}

/** Everything fitted to this drill, defs resolved, unknown ids dropped. For the
 *  UI, which reads it once per render — NOT for the tick. */
export function drillFits(drill: DrillState): { def: DrillAbilityDef; grade: number }[] {
  const out: { def: DrillAbilityDef; grade: number }[] = [];
  for (const fit of drill.fits ?? []) {
    const def = ABILITY_BY_ID.get(fit.id);
    if (def) out.push({ def, grade: fit.grade });
  }
  return out;
}

/** The first fitted ability, or null. Kept for the callers that only want to
 *  know whether the machine is bare (the livery, the bay readout). */
export function drillAbility(drill: DrillState): DrillAbilityDef | null {
  for (const fit of drill.fits ?? []) {
    const def = ABILITY_BY_ID.get(fit.id);
    if (def) return def;
  }
  return null;
}

/**
 * This drill's fit of a given kind, with its grade — the strike loop's read.
 *
 * ALLOCATION-FREE UNLESS IT MATCHES, and that is not micro-optimisation: the
 * first cut of this went through `drillFits`, which builds an array per call,
 * and `tickDrills` calls it about ten times per drill per tick while
 * `residueBite` calls `bayFit` ONCE PER CELL inside the targeting scan. A
 * twelve-drill bay over a two-hour warp turned that into millions of throwaway
 * objects and pushed a 5-second test past its timeout. The bare path now
 * allocates nothing at all.
 */
export function drillCarries(drill: DrillState, kind: DrillAbilityKind): Fit | null {
  const fits = drill.fits;
  if (!fits) return null;
  for (let i = 0; i < fits.length; i++) {
    const def = ABILITY_BY_ID.get(fits[i]!.id);
    if (def?.kind === kind) {
      return { def, grade: fits[i]!.grade, p: abilityParams(def, fits[i]!.grade) };
    }
  }
  return null;
}

/**
 * The strongest fitted ability of a given kind anywhere in the bay, or null.
 * The per-cell marks are written by one drill and read by all of them, so the
 * READ has to find the ability whose params govern — it cannot ask "the
 * equipped one". Strongest counts the GRADE as well as the weight, so a
 * grade-IV Emberset governs over a grade-I one.
 *
 * The scan is written out longhand rather than through `drillCarries` so that a
 * bay carrying nothing of this kind — overwhelmingly the common case, and the
 * one the per-cell targeting scan hits — costs a few map lookups and allocates
 * NOTHING. Only the winner's params are built.
 */
export function bayFit(state: GameState, kind: DrillAbilityKind): Fit | null {
  const units = state.drills.units;
  let bestDef: DrillAbilityDef | null = null;
  let bestGrade = 0;
  let bestScore = -1;
  for (let u = 0; u < units.length; u++) {
    const fits = units[u]!.fits;
    if (!fits) continue;
    for (let i = 0; i < fits.length; i++) {
      const def = ABILITY_BY_ID.get(fits[i]!.id);
      if (def?.kind !== kind) continue;
      const grade = fits[i]!.grade;
      const score = def.weight * (1 + gradeStep(def, grade));
      if (score > bestScore) { bestScore = score; bestDef = def; bestGrade = grade; }
    }
  }
  if (!bestDef) return null;
  return { def: bestDef, grade: bestGrade, p: abilityParams(bestDef, bestGrade) };
}

/** Back-compat read for the two callers that only want the def. */
export function bayAbility(state: GameState, kind: DrillAbilityKind): DrillAbilityDef | null {
  return bayFit(state, kind)?.def ?? null;
}

/** Abilities the player has actually made. The discovery record (pillar 5). */
export function knownAbilities(state: GameState): DrillAbilityDef[] {
  return DRILL_ABILITIES.filter((a) => state.drills.alloys.includes(a.id));
}

/** Which drills are carrying this ability right now — the bay's mix, for the UI. */
export function drillsCarrying(state: GameState, id: string): number[] {
  const out: number[] = [];
  state.drills.units.forEach((u, i) => {
    if ((u.fits ?? []).some((f) => f.id === id)) out.push(i);
  });
  return out;
}

/** The best grade this ability is fitted at anywhere in the bay — the UI's
 *  "×3 · grade IV" line. 0 when nothing carries it. */
export function bestGradeOf(state: GameState, id: string): number {
  let best = 0;
  for (const u of state.drills.units) {
    for (const f of u.fits ?? []) if (f.id === id) best = Math.max(best, f.grade);
  }
  return best;
}

// --- per-cell state --------------------------------------------------------

type CellKey = 'residue' | 'richness' | 'burn';

function cellArray(state: GameState, key: CellKey): number[] {
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
export function residueBite(
  state: GameState, cell: number,
  /** THE BAY'S RESIDUE FIT, HOISTED. `pickTarget` calls this once per CELL, so
   *  resolving the fit inside would re-scan the whole bay for every square of
   *  the face on every strike. The tick passes it in once; every other caller
   *  gets the convenient default. */
  fit: Fit | null | undefined = bayFit(state, 'residue'),
): number {
  if (!fit) return 1;
  const r = state.drills.residue?.[cell] ?? 0;
  return r > 0 ? 1 + (fit.p['bite'] ?? 0.5) : 1;
}

/** Written only by a drill that carries the ability — hence the explicit fit. */
export function markResidue(
  state: GameState, cell: number, fit: { def: DrillAbilityDef; p: Record<string, number> } | null,
): void {
  if (fit?.def.kind !== 'residue') return;
  cellArray(state, 'residue')[cell] = fit.p['decay'] ?? 9;
}

export function markRichness(
  state: GameState, cell: number, fit: { def: DrillAbilityDef } | null,
): void {
  if (fit?.def.kind !== 'attract') return;
  const arr = cellArray(state, 'richness');
  arr[cell] = (arr[cell] ?? 0) + 1;
}

/** CINDERHOLD: the struck cell catches and keeps giving for `burn` seconds. */
export function markBurn(
  state: GameState, cell: number, fit: { def: DrillAbilityDef; p: Record<string, number> } | null,
): void {
  if (fit?.def.kind !== 'kindle') return;
  const arr = cellArray(state, 'burn');
  arr[cell] = Math.max(arr[cell] ?? 0, fit.p['burn'] ?? 6);
}

/**
 * THE CALL: what this cell's drop rolls as. Every `every` strikes the cell has
 * gathered enough to roll as if it were `depthBonus` deeper — richer rarities,
 * same drop CHANCE. Reading it resets the gather, so it is a periodic reward
 * for working one cell rather than a permanent tilt.
 */
export function attractDepthBonus(state: GameState, cell: number | undefined): number {
  const fit = bayFit(state, 'attract');
  if (!fit || cell === undefined) return 0;
  const arr = cellArray(state, 'richness');
  const every = Math.max(1, Math.round(fit.p['every'] ?? 6));
  if ((arr[cell] ?? 0) < every) return 0;
  arr[cell] = 0;
  return fit.p['depthBonus'] ?? 30;
}

/** How full this cell's gather is, 0..1 — the face draws it. */
export function richnessLevel(state: GameState, cell: number): number {
  const fit = bayFit(state, 'attract');
  if (!fit) return 0;
  const every = Math.max(1, fit.p['every'] ?? 6);
  return Math.min(1, (state.drills.richness?.[cell] ?? 0) / every);
}

/** How soft this cell still is, 0..1 — the face draws it. */
export function residueLevel(state: GameState, cell: number): number {
  const fit = bayFit(state, 'residue');
  if (!fit) return 0;
  const decay = fit.p['decay'] ?? 9;
  return Math.min(1, (state.drills.residue?.[cell] ?? 0) / decay);
}

/** How hard this cell is still burning, 0..1 — the face draws it. */
export function burnLevel(state: GameState, cell: number): number {
  const fit = bayFit(state, 'kindle');
  if (!fit) return 0;
  const burn = fit.p['burn'] ?? 6;
  return Math.min(1, (state.drills.burn?.[cell] ?? 0) / burn);
}

/** THE ARC: which neighbours this strike jumps to. Only cells with charge in
 *  them — an arc into dead rock is not a thing anyone would see happen. */
export function arcTargets(
  state: GameState, from: number, skip: (i: number) => boolean,
  fit: { def: DrillAbilityDef; p: Record<string, number> } | null,
): number[] {
  if (fit?.def.kind !== 'arc') return [];
  const jumps = Math.round(fit.p['jumps'] ?? 2);
  return neighbors(state, from)
    .filter((i) => !skip(i) && (state.face.cells[i] ?? 0) > 0.5)
    .sort((a, b) => (state.face.cells[b] ?? 0) - (state.face.cells[a] ?? 0))
    .slice(0, jumps);
}

/**
 * THE REACH FAMILY (A.56) — every ability whose stroke lands on cells the drill
 * is not standing on, in ONE function, because they are one idea with five
 * different shapes drawn on the face.
 *
 * Returns the extra cells and the SHARE of the bite each takes. Never includes
 * the primary cell, never a vined one, never an ore pocket (a pocket does not
 * come away in a bite — that is the whole of A.55's rule).
 *
 * Pillar 2: every one of these takes charge that regen already put in a cell.
 * The face empties faster and produces exactly as much as it always did.
 */
const NO_REACH: { cell: number; share: number }[] = [];

export function reachTargets(
  state: GameState, capNow: number, drill: DrillState, from: number, skip: (i: number) => boolean,
): { cell: number; share: number }[] {
  // A BARE MACHINE PAYS NOTHING FOR THIS. Without the guard, every stroke of
  // every drill did five map lookups and allocated a result array to discover
  // that it carries no reach ability — which is the case for almost every
  // stroke in almost every save, and it showed up as a two-hour warp doubling
  // in cost. The shared empty array is never mutated by callers.
  if (!drill.fits || drill.fits.length === 0) return NO_REACH;
  const out: { cell: number; share: number }[] = [];
  const w = state.face.w;
  const h = state.face.h;
  const cells = state.face.cells;
  const ore = state.face.ore;
  const live = (i: number): boolean =>
    i >= 0 && i < cells.length && i !== from && !skip(i) && !ore?.[i] && (cells[i] ?? 0) > 0.5;

  // HALFMARK — a half-real copy, somewhere else entirely. The fullest cell that
  // is not this one, so the ghost is always worth seeing land.
  const phantom = drillCarries(drill, 'phantom');
  if (phantom) {
    const n = Math.round(phantom.p['hits'] ?? 1);
    const pool: number[] = [];
    for (let i = 0; i < cells.length; i++) if (live(i)) pool.push(i);
    pool.sort((a, b) => (cells[b] ?? 0) - (cells[a] ?? 0));
    for (const c of pool.slice(0, n)) out.push({ cell: c, share: phantom.p['share'] ?? 0.5 });
  }

  // PRISMCUT — the stroke splits along the ROW. A straight bright line, which
  // is deliberately not the arc's forked scatter: same family, different shape.
  const refract = drillCarries(drill, 'refract');
  if (refract) {
    const reach = Math.round(refract.p['reach'] ?? 2);
    const x = from % w;
    for (let d = 1; d <= reach; d++) {
      for (const nx of [x - d, x + d]) {
        if (nx < 0 || nx >= w) continue;
        const c = from - x + nx;
        if (live(c)) out.push({ cell: c, share: refract.p['share'] ?? 0.4 });
      }
    }
  }

  // SLAGBURST — only when the rock was nearly full. The condition is the point:
  // it makes a full face dangerous to touch and an empty one quiet.
  const burst = drillCarries(drill, 'burst');
  if (burst) {
    if ((cells[from] ?? 0) >= capNow * (burst.p['at'] ?? 0.7)) {
      for (const c of neighbors(state, from)) {
        if (live(c)) out.push({ cell: c, share: burst.p['share'] ?? 0.55 });
      }
    }
  }

  // THROUGHLINE — straight through the middle and out the other side.
  const phase = drillCarries(drill, 'phase');
  if (phase) {
    const x = from % w;
    const y = Math.floor(from / w);
    const c = (h - 1 - y) * w + (w - 1 - x);
    if (live(c)) out.push({ cell: c, share: phase.p['share'] ?? 0.75 });
  }

  // EVERYWHEN — faintly, on everything it can still feel. Capped, and the cap
  // is the reason this is affordable: an uncapped full-face stroke would run a
  // drop roll per cell per strike and quietly become a material faucet.
  const disperse = drillCarries(drill, 'disperse');
  if (disperse) {
    const n = Math.round(disperse.p['cells'] ?? 12);
    const pool: number[] = [];
    for (let i = 0; i < cells.length; i++) if (live(i)) pool.push(i);
    pool.sort((a, b) => (cells[b] ?? 0) - (cells[a] ?? 0));
    for (const c of pool.slice(0, n)) out.push({ cell: c, share: disperse.p['share'] ?? 0.12 });
  }

  return out;
}

/**
 * THE BURN BEAT, and residue cooling. Both run on the engine's one-second tick.
 *
 * Residue cools whether or not anything is still fitted — a mark that outlived
 * the alloy that made it is a stain. The burn HARVESTS, which is why this now
 * needs mods and ctx: a burning cell gives up a fraction of what it is holding
 * every second, which is charge the field already produced, taken later and
 * more slowly. It cannot lift the ceiling for the same reason a drill cannot.
 */
export function tickAlloys(
  state: GameState, mods: ModifierCache, _ctx: EngineCtx, dt: number,
): void {
  const res = state.drills.residue;
  if (Array.isArray(res)) {
    for (let i = 0; i < res.length; i++) if (res[i]! > 0) res[i] = Math.max(0, res[i]! - dt);
  }

  const burn = state.drills.burn;
  if (!Array.isArray(burn)) return;
  const fit = bayFit(state, 'kindle');
  const rate = fit?.p['rate'] ?? 0;
  const ore = state.face.ore;
  for (let i = 0; i < burn.length; i++) {
    if (burn[i]! <= 0) continue;
    burn[i] = Math.max(0, burn[i]! - dt);
    // A pocket never burns: it is not ordinary rock and only opens by digging.
    if (rate <= 0 || ore?.[i]) continue;
    const charge = state.face.cells[i] ?? 0;
    if (charge <= 0.01) continue;
    harvestCell(state, mods, i, Math.min(0.9, rate * dt), D(1));
  }
}

// --- the verbs -------------------------------------------------------------

export interface PourOpts {
  /** A known ability to aim at — see `matchDrillAlloy`. */
  prefer?: string | null;
  /** Which slot on each drill to fill. Clamped to the drill's slot count; a
   *  slot already holding something is overwritten, which is the swap. */
  slot?: number;
}

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
  opts: PourOpts = {},
): ActionResult {
  const picked = materialIds.filter(Boolean);
  if (picked.length === 0) return { ok: false, reason: 'Nothing in the crucible' };
  if (picked.length > POUR_SLOTS) return { ok: false, reason: 'Too much in the crucible' };

  const targets = [...new Set(drillIndices)].filter((i) => state.drills.units[i] !== undefined);
  if (targets.length === 0) return { ok: false, reason: 'No drill to pour it into' };

  const grade = mixGrade(picked);
  const match = matchDrillAlloy(picked, { reached: reachedOrdinal(state), prefer: opts.prefer });
  // A hit is priced per drill; a miss is one firing of the bench.
  const price = match ? alloyCost(state, match, targets.length, grade) : slagCost(state);
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
  const step = gradeStep(match, grade);
  for (const i of targets) {
    const drill = state.drills.units[i]!;
    const max = drillSlots(drill);
    const fits = (drill.fits ?? []).filter(Boolean).slice(0, max);
    const slot = Math.max(0, Math.min(max - 1, opts.slot ?? 0));
    // The SAME ability twice on one drill does nothing a player would want, so
    // a second pour of it lands on the slot that already holds it rather than
    // silently eating a slot. (Two DIFFERENT abilities is the prize's point.)
    const already = fits.findIndex((f) => f.id === match.id);
    if (already >= 0) fits[already] = { id: match.id, grade };
    else if (fits.length < max) fits.push({ id: match.id, grade });
    else fits[slot] = { id: match.id, grade };
    drill.fits = fits;
  }
  ctx.dirty();
  return { ok: true, data: { alloy: match.id, known, drills: targets.length, grade, step } };
}

/** Pulling an alloy out is free. You can always stop doing a thing. */
export function clearDrillAlloy(state: GameState, index: number, slot?: number): ActionResult {
  const drill = state.drills.units[index];
  if (!drill) return { ok: false, reason: 'No such drill' };
  const fits = drill.fits ?? [];
  if (fits.length === 0) return { ok: false, reason: 'That one is running bare already' };
  if (slot === undefined) drill.fits = [];
  else {
    if (!fits[slot]) return { ok: false, reason: 'Nothing in that slot' };
    drill.fits = fits.filter((_, i) => i !== slot);
  }
  return { ok: true };
}

export { alloyHint };
