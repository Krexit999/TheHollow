/**
 * DRILL ALLOYS — the runtime half. Defs and matching live in
 * content/drillAlloys.ts; this is what the drill tick and the drop roll
 * actually call, plus the two verbs (forge one, equip one).
 *
 * ONE EQUIPPED SLOT, bay-wide. Not per drill: the whole point of A.53 is that
 * the drills are furniture, and a per-drill alloy would rebuild the
 * configuration screen that was just torn out.
 *
 * The per-cell state (`residue`, `richness`) is kept HERE rather than on
 * `face.cells` because it is owned by this feature: it is created lazily,
 * cleared when the ability changes, and resized with the face without the
 * core face code needing to know it exists.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { D } from '../decimal';
import { spendCurrency } from '../resources';
import { convCurrencyId } from '../shells';
import { consumeMaterial, materialCount } from './forge';
import { neighbors } from './face';
import {
  ABILITY_BY_ID, DRILL_ABILITIES, alloyHint, dominantTrait, matchDrillAlloy,
  type DrillAbilityDef,
} from '../content/drillAlloys';

/** How much of a full bite an arced cell takes. Half — the jump is a bonus on
 *  charge that was already sitting there, not a second full strike. */
export const ARC_SHARE = 0.5;

/** What pouring an alloy costs, on top of the materials fed in. Priced in the
 *  shell's own converted currency, so the bench works in every world. */
export const ALLOY_POUR_COST = 20;

/** How many materials a pour takes. Two is enough to express a signature and
 *  few enough that the space stays reasonable to explore. */
export const POUR_SLOTS = 3;

export function equippedAbility(state: GameState): DrillAbilityDef | null {
  const id = state.drills.equipped;
  return id ? ABILITY_BY_ID.get(id) ?? null : null;
}

/** Abilities the player has actually made. The discovery record (pillar 5). */
export function knownAbilities(state: GameState): DrillAbilityDef[] {
  return DRILL_ABILITIES.filter((a) => state.drills.alloys.includes(a.id));
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

/** THE SET: how much bigger this bite is for rock that is still soft. */
export function residueBite(state: GameState, cell: number): number {
  const ability = equippedAbility(state);
  if (ability?.kind !== 'residue') return 1;
  const r = cellArray(state, 'residue')[cell] ?? 0;
  return r > 0 ? 1 + (ability.params['bite'] ?? 0.5) : 1;
}

export function markResidue(state: GameState, cell: number): void {
  const ability = equippedAbility(state);
  if (ability?.kind !== 'residue') return;
  cellArray(state, 'residue')[cell] = ability.params['decay'] ?? 9;
}

export function markRichness(state: GameState, cell: number): void {
  const ability = equippedAbility(state);
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
  const ability = equippedAbility(state);
  if (ability?.kind !== 'attract' || cell === undefined) return 0;
  const arr = cellArray(state, 'richness');
  const every = ability.params['every'] ?? 6;
  if ((arr[cell] ?? 0) < every) return 0;
  arr[cell] = 0;
  return ability.params['depthBonus'] ?? 30;
}

/** How full this cell's gather is, 0..1 — the face draws it. */
export function richnessLevel(state: GameState, cell: number): number {
  const ability = equippedAbility(state);
  if (ability?.kind !== 'attract') return 0;
  const every = ability.params['every'] ?? 6;
  return Math.min(1, (state.drills.richness?.[cell] ?? 0) / every);
}

/** How soft this cell still is, 0..1 — the face draws it. */
export function residueLevel(state: GameState, cell: number): number {
  const ability = equippedAbility(state);
  if (ability?.kind !== 'residue') return 0;
  const decay = ability.params['decay'] ?? 9;
  return Math.min(1, (state.drills.residue?.[cell] ?? 0) / decay);
}

/** THE ARC: which neighbours this strike jumps to. Only cells with charge in
 *  them — an arc into dead rock is not a thing anyone would see happen. */
export function arcTargets(state: GameState, from: number, skip: (i: number) => boolean): number[] {
  const ability = equippedAbility(state);
  if (ability?.kind !== 'arc') return [];
  const jumps = Math.round(ability.params['jumps'] ?? 2);
  return neighbors(state, from)
    .filter((i) => !skip(i) && (state.face.cells[i] ?? 0) > 0.5)
    .sort((a, b) => (state.face.cells[b] ?? 0) - (state.face.cells[a] ?? 0))
    .slice(0, jumps);
}

/** Residue cools on the one-second beat. Nothing else here needs a tick. */
export function tickAlloys(state: GameState, dt: number): void {
  if (equippedAbility(state)?.kind !== 'residue') return;
  const arr = cellArray(state, 'residue');
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]! > 0) arr[i] = Math.max(0, arr[i]! - dt);
  }
}

// --- the two verbs ---------------------------------------------------------

/**
 * POUR. Consumes the materials and the bench fee either way — a miss teaches
 * you the space, which is the Crucible's established bargain and the reason
 * experimenting is a decision rather than a free scan. A miss still NAMES what
 * the mix leaned toward, so nothing is ever learned from nothing.
 */
export function forgeDrillAlloy(state: GameState, ctx: EngineCtx, materialIds: string[]): ActionResult {
  const picked = materialIds.filter(Boolean);
  if (picked.length === 0) return { ok: false, reason: 'Nothing in the crucible' };
  if (picked.length > POUR_SLOTS) return { ok: false, reason: 'Too much in the crucible' };
  for (const id of picked) {
    if (materialCount(state, id) <= 0) return { ok: false, reason: 'You do not hold all of that' };
  }
  const conv = convCurrencyId(state);
  if (!spendCurrency(state, conv, D(ALLOY_POUR_COST))) {
    return { ok: false, reason: `The pour wants ${ALLOY_POUR_COST} of the shell's coin` };
  }
  for (const id of picked) consumeMaterial(state, id, 1);

  const match = matchDrillAlloy(picked);
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
  // FIRST TIME IS THE DISCOVERY. Recorded permanently; re-pouring a known
  // alloy is fine and simply re-confirms it.
  const known = state.drills.alloys.includes(match.id);
  if (!known) {
    state.drills.alloys.push(match.id);
    ctx.emit({ type: 'drillAlloyFound', id: match.id });
  }
  // An alloy with nothing equipped goes straight in — a first alloy should
  // never need a second click to do anything.
  if (!state.drills.equipped) setEquippedAlloy(state, match.id);
  ctx.dirty();
  return { ok: true, data: { alloy: match.id, known } };
}

/** Swapping the alloy clears the per-cell marks the old one left. */
export function setEquippedAlloy(state: GameState, id: string | null): void {
  state.drills.equipped = id;
  state.drills.residue = [];
  state.drills.richness = [];
}

export function equipDrillAlloy(state: GameState, id: string | null): ActionResult {
  if (id !== null && !state.drills.alloys.includes(id)) {
    return { ok: false, reason: 'You have not made that' };
  }
  setEquippedAlloy(state, id);
  return { ok: true };
}

export { alloyHint };
