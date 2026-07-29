/**
 * DRILL ABILITIES — the runtime. Defs live in content/drillAlloys.ts, geometry
 * in systems/abilityPlans.ts; this is the meter, the loadout budget, the firing,
 * and the three verbs at the bench.
 *
 * ONE FUNNEL, AND PILLAR 2 LIVES IN IT. `applyPlan` is the only thing in the
 * game that turns an ability into charge leaving the field, and it does it by
 * calling the same `strike()` every ordinary drill bite goes through
 * (`take = min(power, cellCharge)`). Twenty-nine abilities, one path. That is
 * why the ceiling proof is a property of the code rather than a claim about it:
 * an explosion spends the charge that was in the cells it cleared, and the
 * field then has more to refill.
 *
 * THE CHARGE METER does both jobs the brief asked for with one mechanism.
 * Strokes fill it; a `roll` can fill it outright; striking a nearly-full cell
 * fills it faster for the abilities whose flavour is "mining a charged cell
 * releases…". When it is full the ability is READY and the drill fires it on
 * its next stroke — so an idle player receives every ability without ever
 * opening a screen (pillar 1). A player who is present may click a ready
 * ability to fire it NOW at a cell of their choosing. Clicking never pays more.
 * It pays timing, which is the only thing worth paying for.
 *
 * THE LOADOUT BUDGET is the "you can only run so many broken things" rule.
 * Every ability costs its POWER tier out of a bay-wide budget, and the budget
 * grows with each shell reached. Loam runs one big thing or three small ones;
 * Aleph runs five of the worst things in the game at once.
 */
import type { ActionResult, DrillState, EngineCtx, GameState } from '../types';
import { D } from '../decimal';
import type { ModifierCache } from '../modifiers';
import { spendCurrency, getCurrency } from '../resources';
import { convCurrencyId, currentShell } from '../shells';
import { consumeMaterial, materialCount } from './forge';
import { materialDef } from '../materials';
import {
  ABILITY_BY_ID, DRILL_ABILITIES, META_ABILITIES, abilityParams, alloyHint,
  dominantTrait, gradeStep, matchDrillAlloy, shellOrdinal,
  type DrillAbilityDef,
} from '../content/drillAlloys';
import { buildPlan, stepToward, type AbilityPlan } from './abilityPlans';

export const ALLOY_POUR_BASE = 80;
export const POUR_SLOTS = 3;
export const GRADE_PRICE_STEP = 0.6;

/**
 * THE LOADOUT BUDGET. Base at Loam, plus this much for every shell after it.
 *
 * Sized against the power tiers rather than by feel: Loam's five abilities cost
 * 1+2+3+2+1 = 9 against a budget of 5, so a Loam bay runs a bit over half of
 * what it knows and has to choose. Aleph's budget of 29 runs all four Aleph
 * abilities (5 each) with 9 left over for the shells above — which is the power
 * fantasy the brief asked for, arrived at by descending rather than by buying.
 */
export const BUDGET_BASE = 5;
export const BUDGET_PER_SHELL = 4;

/**
 * THE READY WINDOW — how many strokes a full meter waits before firing itself.
 *
 * FOUND IN PLAY, AND IT IS A DESIGN FIX RATHER THAN A HARNESS ONE. The first
 * cut auto-fired the instant the meter filled, which meant the brief's other
 * half — "when charged, the player CAN manually click to fire it early, or let
 * it fire on its own" — was unreachable: there was no moment at which an
 * ability was charged AND had not already gone off. The FIRE button read 0%
 * forever, because by the time React rendered, the engine had spent it.
 *
 * So a full meter goes READY and holds for three strokes (~6s at base speed).
 * A player who is watching gets a real window to set it off where they want it;
 * a player who is not loses nothing but those three strokes. Pillar 1 is
 * untouched — it still fires itself, every time, with nobody there.
 */
export const READY_GRACE = 3;

/**
 * THE HAND IS A CARRIER TOO (the tool-abilities phase).
 *
 * Everything below this line was written for a drill and reads `state.drills.
 * units[i]`. The tool needs the same meter, the same firing, the same plan and
 * the same funnel — so rather than a second copy of all of it, a carrier is now
 * an INDEX, and one index is not a drill: `TOOL_CARRIER` resolves to the thing
 * in your hand.
 *
 * That is the whole of the reuse. `fireAbility`, `applyPlan`, `advanceCharges`
 * and `fireNow` are unchanged in substance; they just stopped assuming the array
 * they were indexing was the bay. Pillar 2 is untouched by construction, because
 * the funnel they all end in is the same one — the tool's `hit` harvests through
 * `harvestCell` exactly as a manual swing does, and a drill's through `strike`.
 *
 * The resolver is WIRED rather than imported for the usual reason: the tool side
 * reads this module, so this module may not read it back.
 */
export const TOOL_CARRIER = -1;

let handOf: (state: GameState) => DrillState | null = () => null;
export function wireHandCarrier(fn: typeof handOf): void { handOf = fn; }

/** The machine — or the hand — at this index. Null if there is nothing there. */
export function carrierOf(state: GameState, index: number): DrillState | null {
  if (index === TOOL_CARRIER) return handOf(state);
  return state.drills.units[index] ?? null;
}

export interface AlloyPrice {
  conv: number;
  materials: number;
  drills: number;
  grade: number;
}

/** One fitted ability: what it is, what metal it was poured from, and how full
 *  its meter is. `ch` is play-strokes, not seconds. */
export interface DrillFit {
  id: string;
  grade: number;
  ch?: number;
}

export interface Fit {
  def: DrillAbilityDef;
  grade: number;
  p: Record<string, number>;
  /** Index in the drill's `fits` array — the UI fires by (drill, slot). */
  slot: number;
  charge: number;
  ready: boolean;
}

function shellMult(state: GameState): number {
  return 1 + 0.5 * (currentShell(state).ordinal - 1);
}

/** The deepest shell any material in the pour came from. */
export function mixGrade(materialIds: string[]): number {
  let best = 1;
  for (const id of materialIds) best = Math.max(best, shellOrdinal(materialDef(id).shellId));
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

export function slagCost(state: GameState): AlloyPrice {
  return { conv: Math.round(ALLOY_POUR_BASE * shellMult(state)), materials: 2, drills: 1, grade: 1 };
}

/**
 * HOW DEEP THE PLAYER HAS BEEN. Read from the permanent depth RECORDS, so a
 * Recursion (which puts you back in Loam) does not take the pool — or the
 * budget — away: you learned what Cinder metal does and that does not un-happen.
 */
export function reachedOrdinal(state: GameState): number {
  let best = 1;
  for (const [shellId, depth] of Object.entries(state.depthRecords ?? {})) {
    if ((depth ?? 0) > 0) best = Math.max(best, shellOrdinal(shellId));
  }
  return Math.max(best, Math.min(7, 1 + (state.shell?.breachCount ?? 0)));
}

export function abilitiesReached(state: GameState): DrillAbilityDef[] {
  const reached = reachedOrdinal(state);
  return DRILL_ABILITIES.filter((a) => shellOrdinal(a.shell) <= reached);
}

// --- the loadout budget ----------------------------------------------------

/** What the bay may run at once. Grows one step per shell reached. */
export function abilityBudget(state: GameState): number {
  return BUDGET_BASE + BUDGET_PER_SHELL * (reachedOrdinal(state) - 1);
}

/** What the bay is running now, in power tiers. */
export function loadoutUsed(state: GameState): number {
  let n = 0;
  for (const u of state.drills.units) {
    for (const f of u.fits ?? []) n += ABILITY_BY_ID.get(f.id)?.power ?? 0;
  }
  return n;
}

/** What a pour would cost the budget, accounting for what it replaces. */
export function loadoutDelta(
  state: GameState, def: DrillAbilityDef, targets: number[], slot: number,
): number {
  let delta = 0;
  for (const i of targets) {
    const drill = state.drills.units[i];
    if (!drill) continue;
    const fits = drill.fits ?? [];
    if (fits.some((f) => f.id === def.id)) continue; // already carrying it
    const max = drillSlots(drill);
    const at = fits.length < max ? fits.length : Math.min(slot, max - 1);
    const replaced = fits[at] ? ABILITY_BY_ID.get(fits[at]!.id)?.power ?? 0 : 0;
    delta += def.power - replaced;
  }
  return delta;
}

// --- reading what the bay is carrying --------------------------------------

export function drillSlots(drill: DrillState): number {
  return Math.max(1, drill.slots ?? 1);
}

/** Resolved fits with meter state. Allocates — for the UI and for firing, not
 *  for the per-cell scan. */
export function drillFits(drill: DrillState): Fit[] {
  const out: Fit[] = [];
  const fits = drill.fits ?? [];
  for (let i = 0; i < fits.length; i++) {
    const def = ABILITY_BY_ID.get(fits[i]!.id);
    if (!def) continue;
    const charge = fits[i]!.ch ?? 0;
    out.push({
      def, grade: fits[i]!.grade, p: abilityParams(def, fits[i]!.grade),
      slot: i, charge, ready: charge >= def.charge.need,
    });
  }
  return out;
}

export function drillAbility(drill: DrillState): DrillAbilityDef | null {
  for (const f of drill.fits ?? []) {
    const def = ABILITY_BY_ID.get(f.id);
    if (def) return def;
  }
  return null;
}

export function knownAbilities(state: GameState): DrillAbilityDef[] {
  return DRILL_ABILITIES.filter((a) => state.drills.alloys.includes(a.id));
}

export function drillsCarrying(state: GameState, id: string): number[] {
  const out: number[] = [];
  state.drills.units.forEach((u, i) => { if ((u.fits ?? []).some((f) => f.id === id)) out.push(i); });
  return out;
}

export function bestGradeOf(state: GameState, id: string): number {
  let best = 0;
  for (const u of state.drills.units) {
    for (const f of u.fits ?? []) if (f.id === id) best = Math.max(best, f.grade);
  }
  return best;
}

/** 0..1 for the fullest meter of this ability anywhere in the bay — the panel's
 *  charge bar, and what the face draws on the chassis. */
export function chargeLevel(_state: GameState, drill: DrillState, slot: number): number {
  const f = drill.fits?.[slot];
  if (!f) return 0;
  const def = ABILITY_BY_ID.get(f.id);
  if (!def) return 0;
  return Math.min(1, (f.ch ?? 0) / Math.max(1, def.charge.need));
}

/** Does this machine have anything ready to go? The face draws a halo. */
export function drillReady(drill: DrillState): boolean {
  for (const f of drill.fits ?? []) {
    const def = ABILITY_BY_ID.get(f.id);
    if (def && (f.ch ?? 0) >= def.charge.need) return true;
  }
  return false;
}

// --- per-cell marks --------------------------------------------------------

type CellKey = 'rot' | 'burn';

function cellArray(state: GameState, key: CellKey): number[] {
  const want = state.face.cells.length;
  let arr = state.drills[key];
  if (!Array.isArray(arr) || arr.length !== want) {
    arr = new Array(want).fill(0);
    state.drills[key] = arr;
  }
  return arr;
}

/** PARASITE: rotted rock gives up a bigger share of what it holds. A bigger
 *  bite of the same charge — never a bigger yield, which would move the
 *  ceiling. Capped so a stacked rot cannot exceed a whole cell. */
export const ROT_BITE = 0.6;
export function rotBite(state: GameState, cell: number): number {
  return (state.drills.rot?.[cell] ?? 0) > 0 ? 1 + ROT_BITE : 1;
}

export function rotLevel(state: GameState, cell: number): number {
  const v = state.drills.rot?.[cell] ?? 0;
  return v > 0 ? Math.min(1, v / 12) : 0;
}

export function burnLevel(state: GameState, cell: number): number {
  const v = state.drills.burn?.[cell] ?? 0;
  return v > 0 ? Math.min(1, v / 10) : 0;
}

/** BURNING ROCK KEEPS GIVING, on the one-second beat, and rot cools. Both take
 *  charge that regen already put in a cell, so neither can lift the ceiling —
 *  the same arithmetic as a drill bite, spread over seconds. */
export const BURN_RATE = 0.08;

export function tickAlloys(
  state: GameState, mods: ModifierCache, _ctx: EngineCtx, dt: number,
): void {
  const rot = state.drills.rot;
  if (Array.isArray(rot)) {
    for (let i = 0; i < rot.length; i++) if (rot[i]! > 0) rot[i] = Math.max(0, rot[i]! - dt);
  }
  const burn = state.drills.burn;
  if (!Array.isArray(burn)) return;
  const ore = state.face.ore;
  for (let i = 0; i < burn.length; i++) {
    if (burn[i]! <= 0) continue;
    burn[i] = Math.max(0, burn[i]! - dt);
    if (ore?.[i]) continue;
    const charge = state.face.cells[i] ?? 0;
    if (charge <= 0.01) continue;
    harvestBurn(state, mods, i, Math.min(0.9, BURN_RATE * dt));
  }
}

let harvestBurn: (s: GameState, m: ModifierCache, cell: number, frac: number) => void =
  () => { /* wired by drills.ts to avoid a cycle */ };
export function wireBurnHarvest(fn: typeof harvestBurn): void { harvestBurn = fn; }

// --- firing ----------------------------------------------------------------

/** How the plan is turned into the world. Wired by drills.ts, again to keep the
 *  module graph acyclic: abilities need `strike`, and `strike` needs abilities. */
export interface FireDeps {
  /** Harvest `share` of a full bite from `cell`, with drop weight scaled. */
  hit: (state: GameState, mods: ModifierCache, ctx: EngineCtx, drill: DrillState,
        drillIndex: number, cell: number, share: number) => void;
  /** Open an ore pocket outright. */
  openPocket: (state: GameState, mods: ModifierCache, ctx: EngineCtx,
               cell: number, drill: DrillState) => void;
  /** Plant a pocket. */
  plant: (state: GameState, mods: ModifierCache, ctx: EngineCtx, cell: number) => void;
  /** A cell this drill may not work. */
  blocked: (state: GameState, drill: DrillState, cell: number) => boolean;
  /** The cell this drill would work next. */
  pick: (state: GameState, drill: DrillState) => number;
}
let deps: FireDeps | null = null;
export function wireFireDeps(d: FireDeps): void { deps = d; }

/**
 * FIRE ONE ABILITY. The whole of what an ability does to the world.
 *
 * `depth` guards the two Aleph abilities that fire other abilities — Cataclysm
 * fires everything and Cascade chains — so a bay carrying both cannot recurse
 * without bound. Three is generous and finite.
 *
 * A FIRING THAT FINDS NOTHING DOES NOT SPEND THE METER. An ability whose meter
 * emptied because the face happened to be bare would read as broken, and the
 * player would be right.
 */
export function fireAbility(
  state: GameState, mods: ModifierCache, ctx: EngineCtx,
  drillIndex: number, slot: number, at?: number, depth = 0,
): boolean {
  if (!deps || depth > 3) return false;
  const drill = carrierOf(state, drillIndex);
  if (!drill) return false;
  const raw = drill.fits?.[slot];
  if (!raw) return false;
  const def = ABILITY_BY_ID.get(raw.id);
  if (!def) return false;
  const p = abilityParams(def, raw.grade);

  const blocked = (i: number): boolean => deps!.blocked(state, drill, i);
  let target = at !== undefined && !blocked(at) ? at : deps.pick(state, drill);
  if (target < 0) target = drill.lastCell;
  if (target < 0 || target >= state.face.cells.length) return false;

  // ── THE THREE THAT READ THE BAY INSTEAD OF THE ROCK ────────────────────
  if (def.id === 'cataclysm') return fireCataclysm(state, mods, ctx, drill, drillIndex, slot, target, depth);
  if (def.id === 'genesis') return fireGenesis(state, mods, ctx, drill, drillIndex, slot, target, p, depth);
  // CASCADE fires as a plain single-cell hit AND chains — see `chainOthers`.

  const plan = buildPlan(state, mods, def, p, target, blocked);
  if (!plan) return false;
  applyPlan(state, mods, ctx, drill, drillIndex, plan, def.id);
  spend(drill, slot);
  chainOthers(state, mods, ctx, drillIndex, depth);
  return true;
}

/** Clear the meter after a firing. */
function spend(drill: DrillState, slot: number): void {
  const f = drill.fits?.[slot];
  if (f) f.ch = 0;
}

/**
 * APPLY — the single funnel. Every cell an ability touches goes through
 * `deps.hit`, which is `strike()` with the drop weight scaled by the share.
 * Nothing in this function can create charge; it can only move charge that was
 * already in the rock into the player's pocket, which is the whole of pillar 2.
 */
export function applyPlan(
  state: GameState, mods: ModifierCache, ctx: EngineCtx,
  drill: DrillState, drillIndex: number, plan: AbilityPlan, id: string,
): void {
  if (!deps) return;
  for (const h of plan.hits) deps.hit(state, mods, ctx, drill, drillIndex, h.cell, h.share);
  for (const c of plan.openOre ?? []) deps.openPocket(state, mods, ctx, c, drill);
  for (const c of plan.plantAt ?? []) deps.plant(state, mods, ctx, c);
  if (plan.rot) {
    const arr = cellArray(state, 'rot');
    for (const c of plan.rot.cells) arr[c] = Math.max(arr[c] ?? 0, plan.rot.sec);
  }
  if (plan.burn) {
    const arr = cellArray(state, 'burn');
    for (const c of plan.burn.cells) arr[c] = Math.max(arr[c] ?? 0, plan.burn.sec);
  }
  if (plan.pullOre && plan.pullOre.length > 0) {
    const ore = state.face.ore;
    if (ore) {
      for (const from of plan.pullOre) {
        const to = stepToward(state, from, plan.from);
        if (to < 0) continue;
        ore[to] = ore[from]!;
        ore[from] = '';
        if (state.face.oreDug) {
          state.face.oreDug[to] = state.face.oreDug[from] ?? 0;
          state.face.oreDug[from] = 0;
        }
      }
    }
  }
  // ECHO MINE remembers the last shape so it can happen again elsewhere.
  state.drills.lastShape = plan.cells.slice(0, 24);
  // THE ID IS THE NAME ON SCREEN. The first cut read it off the plan, which
  // never carried one — so every firing emitted `id: ''`, the face popped no
  // name, and the "both slots fire" test could not tell two abilities apart.
  // An invisible ability with a working mechanism is the exact failure this
  // phase exists to fix, and it very nearly shipped again in the event layer.
  ctx.emit({
    type: 'abilityFire',
    id,
    figure: plan.figure,
    color: plan.color,
    from: plan.from,
    cells: plan.cells,
    path: plan.path,
    shake: plan.shake,
    drill: drillIndex,
  });
}

/** CATACLYSM: every other ability the bay carries, at the same moment. */
function fireCataclysm(
  state: GameState, mods: ModifierCache, ctx: EngineCtx,
  drill: DrillState, drillIndex: number, slot: number, target: number, depth: number,
): boolean {
  let fired = 0;
  for (let d = 0; d < state.drills.units.length; d++) {
    const u = state.drills.units[d]!;
    for (let s = 0; s < (u.fits?.length ?? 0); s++) {
      if (d === drillIndex && s === slot) continue;
      if (META_ABILITIES.has(u.fits![s]!.id)) continue; // no cataclysm of cataclysms
      if (fireAbility(state, mods, ctx, d, s, undefined, depth + 1)) fired++;
    }
  }
  if (fired === 0) return false;
  ctx.emit({
    type: 'abilityFire', id: 'cataclysm', figure: 'cataclysm', color: 0xfff0b0,
    from: target, cells: [target], shake: 14, drill: drillIndex,
  });
  spend(drill, slot);
  return true;
}

/**
 * GENESIS: the face briefly forgets which world it is in. N scattered cells,
 * each getting a randomly chosen ability's figure at a reduced share — so a
 * single firing throws lightning, vines, a beam and a void across the grid at
 * once. Bounded by the same `share` clamp as everything else.
 */
function fireGenesis(
  state: GameState, mods: ModifierCache, ctx: EngineCtx,
  drill: DrillState, drillIndex: number, slot: number, target: number,
  p: Record<string, number>, depth: number,
): boolean {
  if (!deps) return false;
  const blocked = (i: number): boolean => deps!.blocked(state, drill, i);
  const pool = DRILL_ABILITIES.filter((a) => !META_ABILITIES.has(a.id));
  const n = Math.max(2, Math.round(p['n'] ?? 8));
  let fired = 0;
  for (let k = 0; k < n; k++) {
    const borrowed = pool[Math.floor(Math.random() * pool.length)]!;
    const cell = Math.floor(Math.random() * state.face.cells.length);
    if (blocked(cell)) continue;
    const bp = { ...abilityParams(borrowed, 1), share: (p['share'] ?? 0.8) * 0.5 };
    const plan = buildPlan(state, mods, borrowed, bp, cell, blocked);
    if (!plan) continue;
    applyPlan(state, mods, ctx, drill, drillIndex, plan, borrowed.id);
    fired++;
  }
  if (fired === 0) return false;
  ctx.emit({
    type: 'abilityFire', id: 'genesis', figure: 'cataclysm', color: 0xffffff,
    from: target, cells: [target], shake: 10, drill: drillIndex,
  });
  spend(drill, slot);
  void depth;
  return true;
}

/**
 * CASCADE: when something goes off, something else has a habit of going off
 * too. Rolls once per firing per cascade carrier, and the chain is depth-capped
 * by `fireAbility` itself.
 */
function chainOthers(
  state: GameState, mods: ModifierCache, ctx: EngineCtx, drillIndex: number, depth: number,
): void {
  if (depth > 1) return;
  for (let d = 0; d < state.drills.units.length; d++) {
    const u = state.drills.units[d]!;
    const slot = (u.fits ?? []).findIndex((f) => f.id === 'cascade');
    if (slot < 0) continue;
    const def = ABILITY_BY_ID.get('cascade')!;
    const p = abilityParams(def, u.fits![slot]!.grade);
    if (Math.random() >= (p['chance'] ?? 0.45)) continue;
    // Somebody else's ability, chosen at random — never the cascade itself.
    const opts: Array<[number, number]> = [];
    for (let dd = 0; dd < state.drills.units.length; dd++) {
      const uu = state.drills.units[dd]!;
      for (let ss = 0; ss < (uu.fits?.length ?? 0); ss++) {
        if (uu.fits![ss]!.id === 'cascade') continue;
        opts.push([dd, ss]);
      }
    }
    if (opts.length === 0) continue;
    const pickOne = opts[Math.floor(Math.random() * opts.length)]!;
    fireAbility(state, mods, ctx, pickOne[0], pickOne[1], undefined, depth + 1);
    void drillIndex;
  }
}

/**
 * THE METER, filled per stroke. Called once per drill stroke by `tickDrills`.
 * Returns the slots that just became ready-and-fired, so the caller can see
 * whether the drill spent its stroke on an ability.
 */
export function advanceCharges(
  state: GameState, mods: ModifierCache, ctx: EngineCtx,
  drillIndex: number, cellWasFull: boolean,
): void {
  const drill = carrierOf(state, drillIndex);
  if (!drill?.fits) return;
  for (let slot = 0; slot < drill.fits.length; slot++) {
    const raw = drill.fits[slot]!;
    const def = ABILITY_BY_ID.get(raw.id);
    if (!def) continue;
    let ch = raw.ch ?? 0;
    ch += 1;
    if (cellWasFull && def.charge.onFull) ch += def.charge.onFull;
    if (def.charge.roll && Math.random() < def.charge.roll) ch = def.charge.need;
    raw.ch = ch;
    // AUTO-FIRE, after the ready window. This is the half of the trigger design
    // that pillar 1 rests on: an away player gets every ability, always, with
    // no click anywhere — three strokes later than a player who was watching
    // and chose the moment, which is the entire advantage of watching.
    if (ch >= def.charge.need + READY_GRACE) fireAbility(state, mods, ctx, drillIndex, slot);
  }
}

// --- the verbs -------------------------------------------------------------

export interface PourOpts {
  prefer?: string | null;
  slot?: number;
}

/**
 * POUR. Materials and fee are spent on a miss too — that is the Crucible's
 * established bargain and the reason experimenting is a decision rather than a
 * free scan. A miss NAMES what the mix leaned toward, so nothing is learned
 * from nothing.
 *
 * A.57 adds the budget check, and it happens BEFORE anything is spent: being
 * told "that would put the bay over its limit" after paying for the alloy would
 * be the worst possible order to discover it in.
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

  // THE LIMIT, CHECKED BEFORE THE SPEND — but only for a KNOWN ability. An
  // unknown mix cannot be budget-checked without telling the player what it is,
  // which would be the free scanner the price withholding exists to prevent.
  // An unknown pour that would overflow is refused AFTER the fact instead: it
  // still discovers the ability, it simply does not fit.
  if (match && state.drills.alloys.includes(match.id)) {
    const delta = loadoutDelta(state, match, targets, opts.slot ?? 0);
    if (loadoutUsed(state) + delta > abilityBudget(state)) {
      return {
        ok: false,
        reason: `The bay cannot run that much at once — ${loadoutUsed(state)}/${abilityBudget(state)} used, and this wants ${delta} more. Strip something, or go deeper.`,
      };
    }
  }

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
        reason: dom
          ? `Slag. It leaned ${dom}, and not hard enough to become anything.`
          : 'Slag. Nothing in that mix was reaching for anything.',
      },
    };
  }

  const known = state.drills.alloys.includes(match.id);
  if (!known) {
    state.drills.alloys.push(match.id);
    ctx.emit({ type: 'drillAlloyFound', id: match.id });
  }

  // A newly-discovered ability that will not fit is still DISCOVERED — you made
  // the thing, you know it exists, and the codex records it. It just does not
  // go on the rails yet.
  const delta = loadoutDelta(state, match, targets, opts.slot ?? 0);
  if (loadoutUsed(state) + delta > abilityBudget(state)) {
    ctx.dirty();
    return {
      ok: true,
      data: {
        alloy: match.id, known, drills: 0, grade, step: gradeStep(match, grade),
        overBudget: true,
        reason: `${match.name}. The bay cannot carry it yet — ${loadoutUsed(state)}/${abilityBudget(state)} used and it wants ${match.power}.`,
      },
    };
  }

  for (const i of targets) {
    const drill = state.drills.units[i]!;
    const max = drillSlots(drill);
    const fits = (drill.fits ?? []).filter(Boolean).slice(0, max);
    const slot = Math.max(0, Math.min(max - 1, opts.slot ?? 0));
    const already = fits.findIndex((f) => f.id === match.id);
    const seated: DrillFit = { id: match.id, grade, ch: 0 };
    if (already >= 0) fits[already] = seated;
    else if (fits.length < max) fits.push(seated);
    else fits[slot] = seated;
    drill.fits = fits;
  }
  ctx.dirty();
  return { ok: true, data: { alloy: match.id, known, drills: targets.length, grade, step: gradeStep(match, grade) } };
}

/** Pulling an alloy out is free. You can always stop doing a thing. */
export function clearDrillAlloy(state: GameState, index: number, slot?: number): ActionResult {
  const drill = carrierOf(state, index);
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

/** MANUAL FIRE. Never required — it is the same firing the meter would do on
 *  its own, taken early and aimed. Refused unless the meter is actually full,
 *  so it can never be spammed into a free extra ability. */
export function fireNow(
  state: GameState, mods: ModifierCache, ctx: EngineCtx,
  index: number, slot: number, cell?: number,
): ActionResult {
  const drill = carrierOf(state, index);
  const raw = drill?.fits?.[slot];
  if (!drill || !raw) return { ok: false, reason: 'Nothing in that slot' };
  const def = ABILITY_BY_ID.get(raw.id);
  if (!def) return { ok: false, reason: 'Nothing in that slot' };
  if ((raw.ch ?? 0) < def.charge.need) return { ok: false, reason: `${def.name} is not charged yet` };
  const ok = fireAbility(state, mods, ctx, index, slot, cell);
  if (!ok) return { ok: false, reason: `${def.name} found nothing to work on` };
  ctx.dirty();
  return { ok: true, data: { id: def.id, name: def.name } };
}

export { alloyHint };
