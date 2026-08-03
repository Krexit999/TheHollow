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
import { verdanceRoll } from './shell3/roll';
import { glassmereRoll } from './shell4/roll';
import { cinderRoll } from './shell5/roll';
import type { StationDef } from './shell1/roll';
import { allShells } from '../shells';

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
  verdance: verdanceRoll,
  glassmere: glassmereRoll,
  cinder: cinderRoll,
};

/** Shells whose geography is written. The rest return `[]`. */
export const AUTHORED_SHELLS = Object.keys(ROLLS);

/**
 * Shells whose geography is NOT written yet, in ordinal order.
 *
 * Exported because NAMING ONE BY HAND IS THE SAME TRAP AS NAMING A FILE. Five
 * tests across three files said `'ferrite'` and then `'verdance'` to mean "a
 * shell with no Roll", and every one of them broke — for the right reason, but
 * noisily — the moment that shell got one. Ask the registry and the fourth Roll
 * costs nothing.
 *
 * `shells.ts` is the currency/wall registry and imports nothing from `content`,
 * so this direction is safe.
 */
export function unauthoredShells(): string[] {
  return allShells().filter((s) => !AUTHORED_SHELLS.includes(s.id)).map((s) => s.id);
}

/** The first shell with no Roll — what a test means by "a shell with no Roll". */
export function anUnauthoredShell(): string {
  const id = unauthoredShells()[0];
  if (!id) throw new Error('every shell is authored — this helper has no meaning any more');
  return id;
}

/**
 * WHERE EACH ROLL LIVES ON DISK — and this is not bookkeeping, it is a fix.
 *
 * The consumer audits (`refinery.test.ts`'s orphan-rescue law, and
 * `scripts/material-audit.ts`) scan the engine's source text to work out which
 * materials nothing wants, and a station's `seams` pool NAMES stone it does not
 * consume. So every Roll has to be excluded from that scan — and both audits
 * excluded `shell1/roll.ts` BY FILENAME, which fired twice: once when Ferrite's
 * Roll was written and `trueFromPolestar` lost its only justification, and it
 * would have fired again here.
 *
 * Registering a Roll now registers its exclusion. There is one list, and it is
 * this one; an audit that reads it cannot fall behind the registry.
 */
export const ROLL_SOURCES: Record<string, string> = {
  loam: 'shell1/roll.ts',
  ferrite: 'shell2/roll.ts',
  verdance: 'shell3/roll.ts',
  glassmere: 'shell4/roll.ts',
  cinder: 'shell5/roll.ts',
};

/**
 * AND THE OTHER SOURCE REGISTRIES. A deep-entry gate NAMES a stone you find,
 * exactly as a seam pool does — it is not a consumer. The moment Glassmere's
 * `weepstone` gate was written it read as one and stripped
 * `weepstoneToLoamiron` of the only justification it had, which is the THIRD
 * instance of one bug (filename A.84 → path pattern A.87 → registry A.88, and
 * the registry only knew about Rolls). So the list is "things that name without
 * wanting", and `content/deepEntry.ts` exists because the table had to be
 * somewhere this list could point at.
 */
export const SOURCE_REGISTRIES = ['rolls.ts', 'deepEntry.ts'];

/** True if this path names materials without wanting them. */
export function isRollSource(path: string): boolean {
  const p = path.replace(/\\/g, '/');
  return SOURCE_REGISTRIES.some((f) => p.endsWith(`content/${f}`))
    || Object.values(ROLL_SOURCES).some((rel) => p.endsWith(`content/${rel}`));
}

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
