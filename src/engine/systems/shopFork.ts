/**
 * SHOP FORKS (§40.2) — the choice §40.2 calls the best one in the game, and the
 * replacement drip for the machine levels §20.1 cut.
 *
 * EVERY LEVEL OF BLADE, SOIL AND ROOTS IS BOUGHT DOWN ONE OF TWO SIDES. The row,
 * its cost curve, its cap and its Collapse behaviour are untouched — what
 * changes is where the level's effect lands:
 *
 *   INCOME  the locked formula term, exactly as it has always been.
 *           Blade → Y, Soil → regen, Roots → cap.
 *   PACKED  NOTHING in the formula. It feeds COMPACTION instead, and pays
 *           through the deep-entry gates that already exist at 8 / 14 / 20.
 *
 * THE THREE PACKED SIDES ARE THREE DIFFERENT BEHAVIOURS, not one bonus wearing
 * three names — that distinction is the whole of §40.2:
 *
 *   BLADE → BITE     a hand chip packs the cell harder, so you reach a gate in
 *                    fewer strikes. Changes HOW FAST you arrive.
 *   SOIL  → SETTLE   a better roll at whatever gate you are standing on.
 *                    Changes WHAT YOU GET when you arrive.
 *   ROOTS → HOLD     compaction SURVIVES THE COLLAPSE, up to a floor. Changes
 *                    whether arriving was worth it at all.
 *
 * PILLAR 2 IS TRIVIALLY SAFE HERE AND THAT IS BY CONSTRUCTION. A packed level is
 * subtracted from `stat()`, so it never reaches `cellCap`, `cellRegen` or
 * `chipYield` — the packed side cannot raise `dpsMax = W·H·regen·Y` because it
 * is not an input to it. Deep-entry drops are DROPS, which sit outside the
 * income path already. So the honest statement is not "the fork is balanced"
 * but "the fork cannot move the ceiling", and a test asserts a fully packed
 * shop reads a LOWER dpsMax than a fully income one, never a higher.
 *
 * WHY IT DOES NOT GO STALE (§40.3). The answer flips inside every Collapse
 * cycle, 7-11 times per Loam arc: early in a run you have no income and cannot
 * afford the stair, so INCOME compounds; late in a run the stair has outrun you
 * and the face is worked, so PACKED harvests it before the fall takes it back.
 * The state it depends on — how far into a run you are — changes several times
 * a session by construction, which is §40.2's stated specification for a real
 * choice. `scripts/sim-shop-fork.ts` is the falsification.
 */
import type { GameState } from '../types';

/** The rows that fork. Everything else is untouched by this module. */
export const FORKED_ROWS = ['blade', 'soil', 'roots'] as const;
export type ForkedRow = typeof FORKED_ROWS[number];

export type Branch = 'income' | 'packed';

export function isForked(id: string): id is ForkedRow {
  return (FORKED_ROWS as readonly string[]).includes(id);
}

export interface ShopState {
  /** How many of a row's owned levels went down the PACKED side. */
  packed: Record<string, number>;
}

export function defaultShopState(): ShopState {
  return { packed: {} };
}

export function ensureShop(state: GameState): ShopState {
  const s = (state.shop ??= defaultShopState());
  s.packed ??= {};
  return s;
}

/** Packed levels held on a row, never more than the row's owned level. */
export function packedLevels(state: GameState, id: string): number {
  if (!isForked(id)) return 0;
  const owned = state.upgrades[id] ?? 0;
  return Math.max(0, Math.min(owned, ensureShop(state).packed[id] ?? 0));
}

/** Levels on the INCOME side — what the locked formulas actually read. */
export function incomeLevels(state: GameState, id: string): number {
  const owned = state.upgrades[id] ?? 0;
  return Math.max(0, owned - packedLevels(state, id));
}

/**
 * A COLLAPSE CLAMPS THE PACKED COUNT TO WHAT SURVIVED. The fall keeps a floor
 * of each row's levels; without this the packed tally could exceed the level it
 * is a subset of and `stat()` would go negative.
 */
export function clampPacked(state: GameState): void {
  const s = ensureShop(state);
  for (const id of FORKED_ROWS) {
    const owned = state.upgrades[id] ?? 0;
    if ((s.packed[id] ?? 0) > owned) s.packed[id] = owned;
  }
}

// ---------------------------------------------------------------------------
// The three packed behaviours
// ---------------------------------------------------------------------------

/** BITE — extra compaction per hand chip. 4 levels buy one whole extra point. */
export const BITE_PER_LEVEL = 0.25;
/** SETTLE — better odds at a gate. Multiplicative on the gate's own chance. */
export const SETTLE_PER_LEVEL = 0.06;
/** HOLD — compaction the Collapse leaves behind, per level. */
export const HOLD_PER_LEVEL = 0.55;
/**
 * ...and the floor it can reach is capped AT THE FIRST GATE. HOLD is allowed to
 * hand you a face that is already paying umberjade; it is NOT allowed to hand
 * you one sitting on the terminal table, which would make the Collapse a way of
 * banking the deepest gate rather than a thing that takes the work back.
 */
export const HOLD_CAP = 8;

/**
 * MUTABLE so a harness can SWEEP the cap — §40.2's HOLD is the row that has to
 * reconcile compaction with the reset ladder, and "what cap makes this worth a
 * purchase line" is not a question you can ask of a frozen const. Same pattern
 * as `DECAY_TUNING` and `SETTLE_TUNING`; nothing in the game writes to it, and
 * it starts at the shipped value so default behaviour is byte-identical.
 */
export const HOLD_TUNING = { cap: HOLD_CAP };

/** Extra compaction a hand chip packs, from BITE. */
export function biteBonus(state: GameState): number {
  return BITE_PER_LEVEL * packedLevels(state, 'blade');
}

/** Multiplier on a deep gate's roll, from SETTLE. */
export function settleMult(state: GameState): number {
  return 1 + SETTLE_PER_LEVEL * packedLevels(state, 'soil');
}

/** Compaction a Collapse leaves in every cell, from HOLD. */
export function holdFloor(state: GameState): number {
  return Math.min(HOLD_TUNING.cap, Math.floor(HOLD_PER_LEVEL * packedLevels(state, 'roots')));
}

// ---------------------------------------------------------------------------
// What the panel says
// ---------------------------------------------------------------------------

export interface ForkCopy {
  income: { name: string; effect: string };
  packed: { name: string; effect: string };
}

/**
 * BOTH SIDES ARE CAPABILITIES AND THEY MATTER IN DIFFERENT PLACES (LAW 8). The
 * copy says what each side DOES, never what it is worth — a fork that reads as
 * "+35% vs +18%" is a stat pick with extra clicks.
 */
export const FORK_COPY: Record<ForkedRow, ForkCopy> = {
  blade: {
    income: { name: 'Keen', effect: 'Dust per point of charge. The edge does the work.' },
    packed: { name: 'Bite', effect: 'Every strike packs the cell harder. You reach the deep rock in fewer swings.' },
  },
  soil: {
    income: { name: 'Quick', effect: 'The rock comes back faster. More to take, sooner.' },
    packed: { name: 'Settle', effect: 'Worked rock gives up more when it finally breaks. A better answer at every gate.' },
  },
  roots: {
    income: { name: 'Wide', effect: 'Each cell holds more charge before it spills.' },
    packed: { name: 'Hold', effect: 'The cave-in leaves your packed rock packed. The work survives the fall.' },
  },
};
