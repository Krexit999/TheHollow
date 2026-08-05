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
/** §31.2's COLD ROLL defect. False outside a live poured world. Runtime-only. */
import { markedStations, subsided, unstableStation } from './thresholds';
import { thresholdFor } from '../content/thresholds';
import { rollFrozen } from './specify';
import {
  FEATURE_LABEL, ROLL_FEATURES, allAuthoredStations, authoredRoll, type RollFeature, type StationDef, type StationType,
} from '../content/rolls';
import { currentShell } from '../shells';
import { resolveFindings } from './crews';
import { isRemembered, isSampled } from './assayBench';
import { grantWreckGear, wearing } from './gear';

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
  /**
   * §53 SUBSIDENCE (A.106) — stations this world has LOST. The only permanent
   * loss in the game (§55 row 6), and it is a hole in your geography rather
   * than a punishment: you took enough out of the shell that it gave way.
   *
   * Per-world, like the threshold that writes it. It rides Collapse and Breach
   * with the rest of the Roll and washes with the world, because a Recursion
   * digs the shaft again and the new one has not been mined yet.
   */
  gone?: string[];
  /** WRECK stations looted. PERMANENT; a looted wreck reads as a WORKS. */
  looted: string[];
  /**
   * BANDS SHORED (§9.4). PERMANENT — this is the drift, and surviving the
   * Collapse is the entire mechanic. It is also what `rerollRoll` skips: a
   * shored band's contents are frozen, which is the price §1.1 names.
   */
  shored?: string[];
  /**
   * STATIONS DROWNED (§36.1). PERMANENT and IRREVERSIBLE — through every
   * Collapse and every Breach. A flooded station reads as a HAZARD forever
   * (`typeOf`) and its contents never re-roll again (`rerollRoll`).
   */
  flooded?: string[];
  /** THE FLOODGATE is standing. Found at a wreck, raised with the shell purse. */
  floodgate?: boolean;
  /** THE SHORING RIG is standing. Found at a wreck, raised with Brick. */
  rig?: boolean;
  /** How many times the contents have been re-rolled. Lets the UI (and a test)
   *  tell "it rolled the same thing" apart from "it never rolled". */
  rolls: number;
}

export function defaultRollState(): RollState {
  return { rolled: {}, cleared: [], looted: [], rolls: 0, gone: [] };
}

/**
 * The Roll for the shell the player is standing in.
 *
 * This used to be `currentShell(state).id === 'loam' ? loamRoll() : []` — one
 * of the two hardcoded Loam tests that stopped three consecutive passes at the
 * shell border. It asks the registry now (`content/rolls.ts`), so a shell is
 * authored in one place and every system that reads geography picks it up.
 */
export function shellRoll(state: GameState): StationDef[] {
  return authoredRoll(currentShell(state).id);
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
  r.gone ??= [];
  r.looted ??= [];
  r.shored ??= [];
  r.flooded ??= [];
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
  // §31.2 DEFECT — "nothing ever moves". A specified world can be poured with
  // its Roll frozen; what a station holds, it holds forever.
  if (rollFrozen(state)) return;
  const r = state.roll!;
  for (const def of shellRoll(state)) {
    /**
     * A SHORED BAND DOES NOT RE-ROLL (§9.4, §1.1). This is the price of the
     * drift and the reason shoring is a decision rather than an upgrade: you
     * have traded a permanent seam for a permanent shortcut, and the answer
     * depends entirely on whether this band's current roll is one worth
     * keeping. §8's bottleneck — "I froze a seam I didn't want" — is exactly
     * this line, and `unshoreBand` is its authored answer.
     *
     * Deliberately here and not in `rollOne`: the exemption belongs to the
     * COLLAPSE, so `ensureRoll` still populates a shored station that has never
     * rolled at all (a save from before shoring existed, or a shell authored
     * later), and no station can end up permanently blank.
     */
    if (r.shored?.includes(def.id)) continue;
    /**
     * AND A DROWNED STATION NEVER ROLLS AGAIN (§36.1). Its one seam was drawn
     * at the moment it flooded and that is the last time its contents moved —
     * which is the whole product: a place the Bench never has to be re-asked
     * and a Circuit row that stays true.
     */
    if (r.flooded?.includes(def.id)) continue;
    r.rolled[def.id] = rollOne(def, rng);
  }
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

/**
 * DROWNED (§36.1). Lives here rather than in `flood.ts` because it is ROLL
 * STATE and `typeOf` needs it — putting it in the system would make
 * roll -> flood -> roll, and an ESM cycle is how a binding arrives undefined.
 */
export function isFlooded(state: GameState, id: string): boolean {
  return state.roll?.flooded?.includes(id) ?? false;
}

export function isLooted(state: GameState, id: string): boolean {
  return state.roll?.looted.includes(id) ?? false;
}

/**
 * THE WRECK IS THE GATE (S22.5, A.106) - one mechanism, for all of them.
 *
 * Six wreck payloads named a machine and were read by NOTHING for the whole
 * project: THE KILN, A DRILL, CRUSHER, REFINERY, THE READING, THE RENDERY.
 * Three are S6 keystones. Every one of those systems was still reachable by a
 * different gate, so every structural check passed while six named places on
 * the Roll paid exactly nothing - S22.5 existing as scenery.
 *
 * The pattern was already here, written longhand in five separate files
 * (STILL_WRECK, PRESS_WRECK, LINE_WRECK, CULTIVAR_WRECK, SHORING_RIG_WRECK),
 * each with its own xFound. That duplication is why six more could be authored
 * without one: there was no single symbol to be missing from. There is now, and
 * audit-reach counts its call sites as a build failure rather than a report.
 *
 * SEARCHES EVERY AUTHORED SHELL, not the one you are standing in. A looted
 * wreck is permanent through Collapse, Breach and Recursion, so "have I ever
 * raised this" must not depend on where I happen to be.
 */
export function wreckFound(state: GameState, wreck: string): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === wreck);
  return at ? isLooted(state, at.def.id) : false;
}

/** Where it lies, for the refusal line. LAW 3: name the PLACE, never the price. */
export function wreckStation(wreck: string): { shellId: string; def: StationDef } | null {
  return allAuthoredStations().find((s) => s.def.wreck === wreck) ?? null;
}

/** "It is still in the wreck at Sinter Row, loam 60." Worded once. */
export function wreckBlocker(state: GameState, wreck: string): string | null {
  if (wreckFound(state, wreck)) return null;
  const at = wreckStation(wreck);
  return at ? `It is still in the wreck at ${at.def.name}, ${at.shellId} ${at.def.depth}.` : `No ${wreck}.`;
}

/** What a station reads as NOW: a looted WRECK is a WORKS, forever. */
export function typeOf(state: GameState, def: StationDef): StationType {
  // A looted WRECK is a WORKS, forever. A drowned FLOOD is a HAZARD, forever —
  // the same shape, and the reason  is the authored type rather than the
  // state: the row tells you it CAN be drowned before you drown it (LAW 3).
  if (def.type === 'flood') return isFlooded(state, def.id) ? 'hazard' : 'flood';
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
  /**
   * SUBSIDENCE'S OPPORTUNITY (§53). A cracked station has already given way, so
   * the wall at it is DOWN — no tool tier, no breaking. Reach, which is what
   * pillar 2 permits, and the shell handing it over rather than an upgrade
   * selling it. The cost is one station lower down; see `stationGaveWay`.
   */
  const cracked = new Set(crackedHere(state));
  for (const def of shellRoll(state)) {
    if (def.depth > depth) continue;
    if (def.type === 'wall') {
      if (!isCleared(state, def.id) && (cracked.has(def.id) || toolTier >= (def.hardness ?? 1))) {
        r.cleared.push(def.id);
        newly.push(def.id);
      }
    } else if (def.type === 'wreck') {
      if (!isLooted(state, def.id)) {
        r.looted.push(def.id);
        newly.push(def.id);
        // A WRECK HANDS YOU WHAT WAS IN IT, once. The one place a wreck becomes
        // looted is the one place kit appears — no second rule about when.
        grantWreckGear(state, def.id);
      }
    }
  }
  /**
   * ...AND A CREW'S FINDING IS RESOLVED BY BEING STOOD IN (§25.4, A.99).
   *
   * Hung here rather than given a verb of its own, because "go down there and
   * resolve it personally" is not a button — it is the same walking-into that
   * loots a wreck and clears a wall, three lines above. A finding cannot be
   * cleared by spending, waiting, or clicking, which is the entire loop.
   */
  resolveFindings(state);
  return newly;
}

/**
 * Which stations in this shell carry the mark (§53 rule 3). Derived, never
 * stored — every shell that has crossed its own threshold marks the deep half
 * of its Roll, and what the mark READS is the threshold's own word: CRACKED,
 * INVERTED, FERAL, BENT, BURNT, DEEP.
 */
export function markedHere(state: GameState): string[] {
  return markedStations(state, markable(state));
}

/**
 * WHAT CAN BE MARKED, AND WHY THE FLOOR CANNOT.
 *
 * The marks land on the deep half of the Roll and the unstable one is always
 * the deepest of them — which, unfiltered, is the FLOOR. Driven, that is
 * exactly what happened: SUBSIDENCE took Deepgrave, the way out of the shell,
 * and a Loam save that crossed its own threshold could no longer Breach.
 *
 * A threshold changes what the world DOES. Taking the exit is not a change, it
 * is a dead end, and §55's "a hole in your geography" is a hole you can walk
 * around. The floor is not geography; it is the door.
 */
function markable(state: GameState): Array<{ id: string; depth: number }> {
  return shellRoll(state)
    .filter((d) => d.type !== 'floor')
    .map((d) => ({ id: d.id, depth: d.depth }));
}

/**
 * ...and the subset that is SUBSIDENCE, which is a different question.
 *
 * A mark is universal; a wall that has already given way is Loam's opportunity
 * and Loam's alone (§53), as is the station that goes with you in it (§55 row
 * 6, "Loam subsidence"). Without this guard the Ferrite flip would drop every
 * wall in Ferrite, which is a threshold paying out somebody else's trade.
 */
export function crackedHere(state: GameState): string[] {
  if (!subsided(state) || thresholdFor(currentShell(state).id)?.id !== 'subsidence') return [];
  return markedStations(state, markable(state));
}

/** ...and the one that is unstable, if this world has one. Loam's, likewise. */
export function unstableHere(state: GameState): string | null {
  if (crackedHere(state).length === 0) return null;
  return unstableStation(state, markable(state));
}

export function isGone(state: GameState, id: string): boolean {
  return state.roll?.gone?.includes(id) ?? false;
}

/**
 * SUBSIDENCE'S COST — STATION COLLAPSE (§55 row 6), the only permanent loss in
 * the game, and the reason it gets a verb of its own rather than a branch
 * inside `markReached`: this is not a place you reached. You went in and it
 * was not there afterwards.
 *
 * IT IS NOT ROLLED FOR. `unstableStation` is always the deepest marked row, so
 * a player who has read their own Roll knows precisely which station will go
 * and can decide never to walk back into it. A hole you went into with your
 * eyes open is a story; one that fires on a die roll is a tax.
 *
 * Returns the depth to eject to — one station up — or null if nothing gave way.
 */
export function stationGaveWay(state: GameState, depth: number): { id: string; to: number } | null {
  const id = unstableHere(state);
  if (!id || isGone(state, id)) return null;
  const rows = shellRoll(state);
  const at = rows.find((d) => d.id === id);
  if (!at || depth < at.depth) return null;
  ensureRoll(state);
  state.roll!.gone!.push(id);
  const above = rows
    .filter((d) => d.depth < at.depth)
    .sort((a, b) => b.depth - a.depth)[0];
  return { id, to: above?.depth ?? 0 };
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
      // SABLE'S LAMP reads one station further down the ladder.
      if (ahead < LEGIBLE_AHEAD + (wearing(state, 'sableslamp') ? 1 : 0)) legible = true;
      ahead += 1;
    }
    // THE ASH LAMP reads the DANGEROUS rows at any distance — a different
    // capability from reading further, and strong in a different place: one is
    // for scouting a route, the other for picking through one.
    if (def.type === 'hazard' && wearing(state, 'ashlamp')) legible = true;
    // THE BENCH BURNS FOG (§9.3). A sampled station reads as though it were
    // under the lamp — which is the whole product the Bench sells. It is a
    // separate flag as well as an OR into `legible` so the row can say why.
    const sampled = isSampled(state, def.id);
    if (sampled) legible = true;
    // A PLACE YOU HAVE READ STAYS READ (proposition `readStays`). Legible, but
    // NOT `sampled` — the fall re-rolled what it holds, and only where it is
    // survived. See `clearSamples`.
    if (isRemembered(state, def.id)) legible = true;
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
