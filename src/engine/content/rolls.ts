/**
 * THE AUTHORED ROLLS — one registry, read by everything that asks "what is the
 * geography of this shell".
 *
 * Before this there were TWO hardcoded `=== 'loam'` tests, one in
 * `systems/roll.ts` and one in `materials.ts::remainsAt`, and they were the
 * whole reason three separate passes had to stop at the Loam border: orphan
 * rescue by place (A.84), the Circuit's world reads (A.85) and shoring (A.86)
 * are each written against `shellRoll` and each silently did nothing anywhere
 * else. A shell is authored here or it is not, and every consumer asks the same
 * question in the same place.
 *
 * A shell with no entry returns `[]`, which every consumer already handles —
 * that is what those three passes were doing for six shells. What changes is
 * that adding the seventh Roll is now one line in this file.
 */
import { loamRoll } from './shell1/roll';
import { ferriteRoll } from './shell2/roll';
import type { StationDef } from './shell1/roll';

/**
 * The station TYPES live in `shell1/roll.ts` because that is where they were
 * written when Loam was the only Roll. They are the shared shape, not Loam
 * content, so they are re-exported from here — a second declaration would be
 * two copies of one type, and the copy always drifts.
 */
export type { StationDef, StationType } from './shell1/roll';
export { ROLL_FEATURES, FEATURE_LABEL, TYPE_LABEL, type RollFeature } from './shell1/roll';

const ROLLS: Record<string, () => StationDef[]> = {
  loam: loamRoll,
  ferrite: ferriteRoll,
};

/** Shells whose geography is written. The other five return `[]`. */
export const AUTHORED_SHELLS = Object.keys(ROLLS);

export function authoredRoll(shellId: string): StationDef[] {
  return ROLLS[shellId]?.() ?? [];
}

/** Every authored station in the game, for audits and cross-shell checks. */
export function allAuthoredStations(): { shellId: string; def: StationDef }[] {
  return AUTHORED_SHELLS.flatMap((shellId) =>
    authoredRoll(shellId).map((def) => ({ shellId, def })));
}

/**
 * Find a station by id across every authored shell. The old `stationDef` in
 * `shell1/roll.ts` searched Loam and only Loam — harmless while Loam was the
 * only Roll, and a silent wrong answer the moment it was not.
 */
export function stationById(id: string): { shellId: string; def: StationDef } | undefined {
  return allAuthoredStations().find((s) => s.def.id === id);
}
