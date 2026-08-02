/**
 * THE ROLL — the runtime (§1, §1.1).
 *
 * The shaft is a ladder of named places. This module holds the three things the
 * content file cannot: what each station is HOLDING right now, what the player
 * has permanently done to it, and who can see what.
 *
 * THREE RULES, AND THEY PULL AGAINST EACH OTHER ON PURPOSE:
 *
 *   THE RE-ROLL   A station keeps its name, depth, type and hardness forever.
 *                 Its seam, feature and hazard intensity roll fresh at every
 *                 Collapse. This is the fix for "the centrepiece is consumed in
 *                 one pass": measured cadence is 7-11 Collapses per Loam arc
 *                 against 15 stations, so without it a player walks the same
 *                 rows forty-plus times and the ladder becomes scenery.
 *
 *   CLEARANCE     Breaking a WALL is permanent, through Collapse and Breach.
 *                 You keep the road; you lose the tools.
 *
 *   THE BAND      is NARROW (§45.1 risk 3). Each station rolls from its own two
 *                 or three candidates, not from the shell's whole list. If the
 *                 contents change too much the name stops meaning anything, and
 *                 the legibility is the entire reason 15 authored rows are worth
 *                 their cost.
 */
import type { GameState } from '../types';
import {
  FEATURE_LABEL, ROLL_FEATURES, loamRoll, type RollFeature, type StationDef, type StationType,
} from '../content/shell1/roll';
import { currentShell } from '../shells';
import { isSampled } from './assayBench';

/** How many stations ahead are fully legible (§1: "the next three"). */
export const LEGIBLE_AHEAD = 3;

/** Hazard intensity rolls inside this band — narrow, like everything else. */
export const HAZARD_MIN = 1;
export const HAZARD_MAX = 3;

export interface RolledContents {
  /** Material id, or '' for a station that holds no seam (a WALL). */
  seam: string;
  feature: RollFeature;
  /** HAZARD only; 0 elsewhere. */
  hazard: number;
}

export interface RollState {
  /** stationId -> what it is holding this run. Re-rolled at every Collapse. */
  rolled: Record<string, RolledContents>;
  /** WALL stations broken. PERMANENT — survives Collapse and Breach. */
  cleared: string[];
  /** WRECK stations looted. PERMANENT; a looted wreck reads as a WORKS. */
  looted: string[];
  /** How many times the contents have been re-rolled. Lets the UI (and a test)
   *  tell "it rolled the same thing" apart from "it never rolled". */
  rolls: number;
}

export function defaultRollState(): RollState {
  return { rolled: {}, cleared: [], looted: [], rolls: 0 };
}

/** The Roll for the shell the player is standing in. Only Loam is authored. */
export function shellRoll(state: GameState): StationDef[] {
  return currentShell(state).id === 'loam' ? loamRoll() : [];
}

// ---------------------------------------------------------------------------
// The re-roll
// ---------------------------------------------------------------------------

function rollOne(def: StationDef, rng: () => number): RolledContents {
  const pool = def.seams ?? [];
  return {
    seam: pool.length > 0 ? pool[Math.floor(rng() * pool.length)]! : '',
    feature: ROLL_FEATURES[Math.floor(rng() * ROLL_FEATURES.length)]! as RollFeature,
    hazard: def.type === 'hazard'
      ? HAZARD_MIN + Math.floor(rng() * (HAZARD_MAX - HAZARD_MIN + 1))
      : 0,
  };
}

/**
 * Fill in anything unrolled without touching what is already there. Called on
 * every read, so a save from before the Roll existed — or a shell whose stations
 * were authored later — comes up populated rather than blank.
 */
export function ensureRoll(state: GameState, rng: () => number = Math.random): void {
  const r = (state.roll ??= defaultRollState());
  r.rolled ??= {};
  r.cleared ??= [];
  r.looted ??= [];
  r.rolls ??= 0;
  for (const def of shellRoll(state)) {
    if (!r.rolled[def.id]) r.rolled[def.id] = rollOne(def, rng);
  }
}

/**
 * THE COLLAPSE RE-ROLLS WHAT THE STATIONS HOLD, and nothing else. Names, depths,
 * types, hardness and every permanent record are untouched by construction —
 * this function cannot reach them.
 */
export function rerollRoll(state: GameState, rng: () => number = Math.random): void {
  ensureRoll(state, rng);
  const r = state.roll!;
  for (const def of shellRoll(state)) r.rolled[def.id] = rollOne(def, rng);
  r.rolls += 1;
}

/**
 * WHAT A STATION IS HOLDING — and it ROLLS IT if nobody has yet.
 *
 * This used to be `state.roll?.rolled[id] ?? { seam:'', feature:'nothing',
 * hazard:0 }` — a silent empty fallback that is indistinguishable, to every
 * caller, from a station that genuinely holds nothing. That is the same bug
 * shape as the hazard-0 read one layer up: the Standoff asked The Ashfall for
 * its intensity, got 0 because nothing had populated the table yet, and printed
 * "Hazard 0" over a fight running at intensity 1.
 *
 * Adding `ensureRoll` to the engine tick fixed the symptom and left the cause:
 * this reader was still correct only because of tick ORDERING, which is exactly
 * the kind of invariant that holds until someone moves a mount. It rolls for
 * itself now, so a cold state returns real contents rather than a plausible
 * zero, and the guarantee is local instead of ambient.
 *
 * `ensureRoll` only fills what is MISSING, so this cannot re-roll a station
 * that already has contents — calling it on every read is idempotent, and the
 * §1.1 re-roll stays exclusively `rerollRoll`'s job.
 */
export function contentsOf(state: GameState, id: string): RolledContents {
  const held = state.roll?.rolled[id];
  if (held) return held;
  ensureRoll(state);
  return state.roll?.rolled[id] ?? { seam: '', feature: 'nothing', hazard: 0 };
}

// ---------------------------------------------------------------------------
// What the player has permanently done
// ---------------------------------------------------------------------------

export function isCleared(state: GameState, id: string): boolean {
  return state.roll?.cleared.includes(id) ?? false;
}

export function isLooted(state: GameState, id: string): boolean {
  return state.roll?.looted.includes(id) ?? false;
}

/** What a station reads as NOW: a looted WRECK is a WORKS, forever. */
export function typeOf(state: GameState, def: StationDef): StationType {
  return def.type === 'wreck' && isLooted(state, def.id) ? 'works' : def.type;
}

/**
 * REACHING A DEPTH IS WHAT MARKS THE ROAD. Called from the descent: every
 * station at or above the new depth is passed, so a WALL you got through is
 * cleared and a WRECK you walked into is looted — both permanently.
 *
 * A WALL only counts as CLEARED if the tool could actually answer it. Descending
 * under-tier is possible (the wall is a price, not a door — A.70), and paying
 * the fare to squeeze past is not the same as breaking it.
 */
export function markReached(state: GameState, depth: number, toolTier: number): string[] {
  ensureRoll(state);
  const r = state.roll!;
  const newly: string[] = [];
  for (const def of shellRoll(state)) {
    if (def.depth > depth) continue;
    if (def.type === 'wall') {
      if (!isCleared(state, def.id) && toolTier >= (def.hardness ?? 1)) {
        r.cleared.push(def.id);
        newly.push(def.id);
      }
    } else if (def.type === 'wreck') {
      if (!isLooted(state, def.id)) {
        r.looted.push(def.id);
        newly.push(def.id);
      }
    }
  }
  return newly;
}

// ---------------------------------------------------------------------------
// Who can see what (§1)
// ---------------------------------------------------------------------------

export interface RollRow {
  def: StationDef;
  /** What it reads as now — WORKS for a looted wreck. */
  type: StationType;
  /** Name, depth, hardness, seam and type are all readable. */
  legible: boolean;
  /** Legible because the ASSAY BENCH burnt the fog off it, rather than because
   *  it is near the lamp — so the panel can say WHY it can read this row. */
  sampled: boolean;
  /** The player has already been this deep this run. */
  behind: boolean;
  /** The next station down — the one the descent is working toward. */
  current: boolean;
  contents: RolledContents;
  cleared: boolean;
  looted: boolean;
}

/**
 * THE VISIBILITY RULE, exactly as §1 states it: the next three are fully
 * legible; everything below shows NAME AND DEPTH ONLY; the floor is pinned at
 * the bottom from the moment you enter the shell.
 *
 * Stations you have already passed stay legible — fog is about what is ahead of
 * the lamp, and a road you have walked is not a rumour.
 */
export function rollRows(state: GameState): RollRow[] {
  ensureRoll(state);
  const defs = shellRoll(state);
  const depth = state.depth;
  let ahead = 0;
  return defs.map((def) => {
    const behind = def.depth <= depth;
    let legible = behind;
    let current = false;
    if (!behind) {
      current = ahead === 0;
      if (ahead < LEGIBLE_AHEAD) legible = true;
      ahead += 1;
    }
    // THE BENCH BURNS FOG (§9.3). A sampled station reads as though it were
    // under the lamp — which is the whole product the Bench sells. It is a
    // separate flag as well as an OR into `legible` so the row can say why.
    const sampled = isSampled(state, def.id);
    if (sampled) legible = true;
    return {
      def,
      type: typeOf(state, def),
      legible,
      sampled,
      behind,
      current,
      contents: contentsOf(state, def.id),
      cleared: isCleared(state, def.id),
      looted: isLooted(state, def.id),
    };
  });
}

/** The shell's terminus. Pinned at the bottom of the panel whatever the fog. */
export function floorRow(state: GameState): RollRow | null {
  return rollRows(state).find((r) => r.def.type === 'floor') ?? null;
}

export { FEATURE_LABEL };
