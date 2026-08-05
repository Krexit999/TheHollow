/**
 * THE SEVEN SEATS — §4, THE TERMINAL CRAFT'S FRAME.
 *
 * "The world is an unfinished tool. You finish it." Each SEAT is a part cast
 * from a shell's terminal material at the top purity band, found at that
 * shell's FLOOR. Seven seats, seven shells, and the seven seats are the SEVEN
 * PART TYPES the Forge has cast since Phase 17 — §4's table maps onto
 * `PART_TYPES` one for one, in order, and nobody had noticed:
 *
 *   I Core · II Head · III Handle · IV Edge · V Binding · VI Sockets · VII Grip
 *
 * THIS IS A FRAME, NOT A MACHINE. §13's map of forty-one contains THE SEATING
 * and does not contain the Seats — the Seating is the machine that reads this
 * frame, and the frame is a place seven objects go. So there is no wreck, no
 * tier ladder and no cast-part price here; a seat is filled by a part you made,
 * which is the whole of §4's argument.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SEVEN OUTLINES, ZERO RECIPES, and that clause is load-bearing.
 *
 * §4: "at Breach 1 one tool slot gains a SEAT frame with your Loam Core in it,
 * and six empty outlines appear — unnamed, unexplained. Nothing tells you what
 * they want until you stand on that shell's floor."
 *
 * So `seatKnown` gates the whole ROW: before you have stood on that shell's
 * floor a seat has no name, no material and no condition — it is an outline
 * with a numeral. That is LAW 3 in its strongest form (hide recipes, show
 * destinations) and it is why `seatsRead` returns a `known` flag rather than
 * letting the panel decide.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PILLAR 2. A seated Seat grants REACH THROUGH A RESET and nothing else: the
 * shell's signature survives the Recursion that would otherwise wipe it. There
 * is no path from this file to `cellCap`, `cellRegen` or `chipYield`, no
 * currency is granted, and `seats.test.ts` seats all seven and reads the
 * ceiling unmoved. §31.1 calls the Seating era "the inheritance — what of this
 * survives me", and that is exactly and only what a Seat pays.
 *
 * THREE PLACES THIS BUILD DISAGREES WITH §4, measured rather than re-authored:
 *
 *  1. "Nought" (Seat VI, Hollow) is not in the registry. `nothingstar`
 *     ('Nothingstone ★', hollow, starred) is, and it is the shell's terminal
 *     stone by every other measure. The registry is right and the table is the
 *     bug — PILLARS, "a number in this document is not evidence".
 *  2. "at `aberrant` purity" names the RARITY ladder; a part carries a PURITY
 *     band, and the two ladders are different (`common…aberrant` vs
 *     `poor…pristine`). The top purity band is `pristine`, whose own comment
 *     reads "above what the world produces — only a refine reaches here", which
 *     is §4's "aberrant needs Refinery V" said in the other vocabulary. So the
 *     seats want `pristine`, and that is the same requirement.
 *  3. "a six-band Lens at full intensity" (Seat IV) CANNOT BE SATISFIED. The
 *     Prism holds `INTENSITY = 3` points across `BAND_COUNT = 6` bands, so six
 *     lit bands is arithmetically out of reach and no tier lifts it. The seat
 *     asks for the true reading — the Prism at its last tier with every point
 *     spent — and the gap is ledgered rather than papered over by inventing a
 *     Lens the build does not have.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import type { PartType } from '../content/forgeParts';
import type { RackPart } from './casting';
import { bandOf, materialDef } from '../materials';
import { traitsOf } from '../traits';
import { allShells, shellDefOrNull } from '../shells';
import { tierOf } from './plant';
import { MAX_COMPACTION } from './compaction';
import { INTENSITY, prismBuilt, spent } from './prism';
import { COIL_BANK, chainRead, coilBuilt } from './coil';
import { retortBuilt } from './retort';
import { valvesSet } from './vents';
import { carriedStrain } from './cultivar';
import { unitsFixed } from './witness';

export type SeatId = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | 'VII';

export interface SeatDef {
  id: SeatId;
  /** The part type it holds — §4's table, and `PART_TYPES` in order. */
  part: PartType;
  shellId: string;
  /** The shell's terminal stone. */
  materialId: string;
  /** §4's "sits at the end of", said to the player once the seat is known. */
  sits: string;
  /** What seating it buys, in one sentence. Never a number. */
  keeps: string;
  flavor: string;
}

/**
 * THE TOP PURITY BAND. §4's `aberrant`, in the ladder a part actually carries.
 */
export const SEAT_BAND = 'pristine';

/**
 * A WITNESS THAT HAS FIXED THIS MANY UNITS — §4's Seat VI condition, kept at
 * the number the table prints.
 */
export const WITNESS_FIXED_FOR_SEAT = 1000;

/** §4's Seat III: a strain carried across this many Collapses. */
export const STRAIN_COLLAPSES = 3;

export const SEATS: SeatDef[] = [
  {
    id: 'I', part: 'core', shellId: 'loam', materialId: 'deepgrave',
    sits: 'a cell worked to compaction 26, and a Refinery at its last tier',
    keeps: 'Loam\'s seepage is yours through the Recursion.',
    flavor: 'It is the heaviest thing you have ever picked up and it fits in one hand.',
  },
  {
    id: 'II', part: 'head', shellId: 'ferrite', materialId: 'poleiron',
    sits: 'a four-metal alloy, poured while the Coil sat saturated',
    keeps: 'Ferrite\'s polarity is yours through the Recursion.',
    flavor: 'Four metals went in. What came out points at something and will not say what.',
  },
  {
    id: 'III', part: 'handle', shellId: 'verdance', materialId: 'heartwood',
    sits: 'a strain that survived three Collapses in the same bed',
    keeps: 'Verdance\'s growth is yours through the Recursion.',
    flavor: 'Grown, not cut. It is still slightly warm and you have stopped finding that strange.',
  },
  {
    id: 'IV', part: 'edge', shellId: 'glassmere', materialId: 'truelight',
    sits: 'the Prism at its last tier with every point of intensity spent',
    keeps: 'Glassmere\'s refraction is yours through the Recursion.',
    flavor: 'You cannot see the edge. You can see what is behind it, slightly to the left.',
  },
  {
    id: 'V', part: 'binding', shellId: 'cinder', materialId: 'slagglass',
    sits: 'the Retort standing, the shaft at 96, and not one valve seated',
    keeps: 'Cinder\'s pressure is yours through the Recursion.',
    flavor: 'Poured at a heat nobody sensible stands next to, by somebody who was not.',
  },
  {
    id: 'VI', part: 'sockets', shellId: 'hollow', materialId: 'nothingstar',
    sits: `a Witness that has fixed ${WITNESS_FIXED_FOR_SEAT} units`,
    keeps: 'The Hollow\'s absence is yours through the Recursion.',
    flavor: 'Six holes in a piece of nothing. The holes are the part that is there.',
  },
  {
    id: 'VII', part: 'grip', shellId: 'aleph', materialId: 'record',
    sits: 'your own history — and it cannot be cast, mined, refined or traded',
    keeps: 'The last seat keeps nothing. It finishes the tool.',
    flavor: 'It is the shape your hand already is.',
  },
];

export const SEAT_BY_ID = new Map(SEATS.map((s) => [s.id, s]));
export const SEAT_BY_PART = new Map(SEATS.map((s) => [s.part, s]));

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface SeatedPart {
  seat: SeatId;
  materialId: string;
  purity: number;
  /** Which Recursion it was seated in — a seat is a date as well as a thing. */
  atRecursion: number;
}

export interface SeatsState {
  /** Filled seats, keyed by seat id. Permanent — §4, "seated permanently". */
  seated: Partial<Record<SeatId, SeatedPart>>;
  /** Seats whose outline has ever resolved into a name. A small Codex. */
  known: SeatId[];
  /** Seat VII only: the RECORD, once your history has minted it. */
  record: boolean;
}

export function defaultSeatsState(): SeatsState {
  return { seated: {}, known: [], record: false };
}

export function ensureSeats(state: GameState): SeatsState {
  const s = (state.seats ??= defaultSeatsState());
  s.seated ??= {};
  s.known ??= [];
  s.record ??= false;
  return s;
}

// ---------------------------------------------------------------------------
// The frame opens at Breach 1
// ---------------------------------------------------------------------------

/**
 * §4's first sight, kept exactly: the frame appears at the FIRST BREACH, with
 * the Loam seat's outline already resolved because you have stood on Loam's
 * floor to get here.
 */
export function frameOpen(state: GameState): boolean {
  return (state.shell?.breachCount ?? 0) >= 1;
}

/**
 * HAVE YOU STOOD ON THAT SHELL'S FLOOR. The one gate on knowing what a seat
 * wants — depth record against the shell's own floor depth, so it is the
 * standing-there that resolves the outline and nothing else can.
 */
export function seatKnown(state: GameState, id: SeatId): boolean {
  const def = SEAT_BY_ID.get(id);
  if (!def) return false;
  const shell = shellDefOrNull(def.shellId);
  if (!shell) return false;
  return (state.depthRecords?.[def.shellId] ?? 0) >= shell.floorDepth;
}

/** Resolve any outline you have earned. Called wherever the frame is read. */
export function noteKnownSeats(state: GameState): SeatId[] {
  const s = ensureSeats(state);
  const fresh: SeatId[] = [];
  for (const def of SEATS) {
    if (s.known.includes(def.id)) continue;
    if (!seatKnown(state, def.id)) continue;
    s.known.push(def.id);
    fresh.push(def.id);
  }
  return fresh;
}

// ---------------------------------------------------------------------------
// §4's conditions, each against a system that exists
// ---------------------------------------------------------------------------

/** Deepest compaction any cell has reached this run. */
function deepestCompaction(state: GameState): number {
  const c = state.face?.compaction ?? [];
  let n = 0;
  for (const v of c) if ((v ?? 0) > n) n = v ?? 0;
  return n;
}

/** How many distinct metals the deepest alloy you have poured was made of. */
function widestAlloy(state: GameState): number {
  let n = 0;
  for (const id of Object.keys(state.materials?.stacks ?? {})) {
    const traits = traitsOf(id);
    // An alloy is registered with its blend as traits; four traits is §14.2's
    // cap and a four-metal pour is the only thing that reaches it.
    if (id.startsWith('alloy') && traits.length > n) n = traits.length;
  }
  return n;
}

/**
 * WHAT THE SEAT IS WAITING FOR, or null when it is satisfied. Each reads a
 * system that already exists, and none of them writes to one.
 */
export function seatCondition(state: GameState, id: SeatId): string | null {
  switch (id) {
    case 'I': {
      if (deepestCompaction(state) < MAX_COMPACTION) {
        return `No cell has reached compaction ${MAX_COMPACTION}.`;
      }
      if (tierOf(state, 'refinery') < 5) return 'The Refinery is not at its last tier.';
      return null;
    }
    case 'II': {
      if (widestAlloy(state) < 4) return 'You have never poured a four-metal alloy.';
      if (!coilBuilt(state)) return 'No Coil.';
      if (chainRead(state) < COIL_BANK) return 'The Coil is not saturated.';
      return null;
    }
    case 'III': {
      const kept = carriedStrain(state);
      if (kept < STRAIN_COLLAPSES) {
        return `No strain has held a bed through ${STRAIN_COLLAPSES} Collapses (${kept}).`;
      }
      return null;
    }
    case 'IV': {
      if (!prismBuilt(state)) return 'No Prism.';
      if (tierOf(state, 'prism') < 5) return 'The Prism is not at its last tier.';
      if (spent(state) < INTENSITY) return 'The Prism is not at full intensity.';
      return null;
    }
    case 'V': {
      if (!retortBuilt(state)) return 'No Retort.';
      if ((state.pressure?.heat ?? 0) < 96) return 'The shaft is not at 96.';
      if (valvesSet(state).length > 0) return 'A valve is seated. Unvented means unvented.';
      return null;
    }
    case 'VI': {
      const fixed = unitsFixed(state);
      if (fixed < WITNESS_FIXED_FOR_SEAT) {
        return `A Witness has fixed ${Math.floor(fixed)} of ${WITNESS_FIXED_FOR_SEAT} units.`;
      }
      return null;
    }
    case 'VII': {
      const short = recordShortfall(state);
      return short.length === 0 ? null : short[0]!;
    }
  }
}

// ---------------------------------------------------------------------------
// SEAT VII — the RECORD, which is made rather than cast
// ---------------------------------------------------------------------------

/**
 * §4: "RECORD cannot be mined, refined, reacted or transmuted. It is made from
 * your own history — depth records, cleared walls, Codex entries, marks,
 * propositions, alloys. The last component of the longest craft in the game is
 * HAVING PLAYED."
 *
 * And the registry agrees without being asked: `record` is in no seam in any of
 * the seven Rolls, so there is genuinely no route to it but this one. Six
 * counters, each a fact about a life rather than a stock — and each already
 * kept by the engine for its own reasons.
 */
export const RECORD_MARKS: Array<{
  id: string; label: string; want: number; read: (s: GameState) => number;
}> = [
  {
    id: 'floors', label: 'shell floors stood on', want: 6,
    read: (s) => allShells().filter((sh) => (s.depthRecords?.[sh.id] ?? 0) >= sh.floorDepth).length,
  },
  { id: 'breaches', label: 'Breaches', want: 6, read: (s) => s.shell?.breachCount ?? 0 },
  { id: 'recursions', label: 'Recursions', want: 1, read: (s) => s.recursion?.count ?? 0 },
  { id: 'propositions', label: 'propositions proved', want: 4, read: (s) => (s.reading?.proven ?? []).length },
  { id: 'level', label: 'Delver level', want: 60, read: (s) => s.delver?.level ?? 1 },
  { id: 'seats', label: 'seats already filled', want: 6, read: (s) => Object.keys(s.seats?.seated ?? {}).length },
];

export function recordShortfall(state: GameState): string[] {
  const out: string[] = [];
  for (const m of RECORD_MARKS) {
    const have = m.read(state);
    if (have < m.want) out.push(`${m.label}: ${Math.floor(have)} of ${m.want}.`);
  }
  return out;
}

export function recordReady(state: GameState): boolean {
  return recordShortfall(state).length === 0;
}

/**
 * MAKE THE RECORD. The only verb in the game whose input is the save file.
 * It mints nothing tradeable — a flag that Seat VII will accept, and nothing
 * else in the engine reads it.
 */
export function makeRecord(state: GameState, ctx: EngineCtx): ActionResult {
  const s = ensureSeats(state);
  if (s.record) return { ok: false, reason: 'It is already made. It was always going to be.' };
  if (!frameOpen(state)) return { ok: false, reason: 'There is no frame yet.' };
  const short = recordShortfall(state);
  if (short.length > 0) return { ok: false, reason: short[0]! };
  s.record = true;
  ctx.dirty();
  ctx.emit({ type: 'recordMade' });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Seating a part
// ---------------------------------------------------------------------------

/** Parts on the rack that would fill this seat, ignoring the condition. */
export function candidates(state: GameState, id: SeatId): RackPart[] {
  const def = SEAT_BY_ID.get(id);
  if (!def) return [];
  if (id === 'VII') return [];        // the RECORD is not on a rack
  return (state.casting?.rack ?? []).filter(
    (p) => p.type === def.part && p.materialId === def.materialId && bandOf(p.purity) === SEAT_BAND,
  );
}

export function seatBlocker(state: GameState, id: SeatId): string | null {
  const def = SEAT_BY_ID.get(id);
  if (!def) return 'No such seat.';
  if (!frameOpen(state)) return 'The frame opens at the first Breach.';
  if (ensureSeats(state).seated[id]) return 'It is seated. It stays seated.';
  if (!seatKnown(state, id)) return 'An outline. Nothing has told you what it wants.';
  const cond = seatCondition(state, id);
  if (cond) return cond;
  if (id === 'VII') {
    return ensureSeats(state).record ? null : 'The Record is not made.';
  }
  if (candidates(state, id).length === 0) {
    const m = materialDef(def.materialId);
    return `Needs a ${def.part.toUpperCase()} of ${m.name}, refined past what the world makes.`;
  }
  return null;
}

/**
 * SEAT IT. Permanent — there is no unseat verb, by §4 and by design, and the
 * only remedy the document offers is a challenge's free re-pour, which is its
 * own layer.
 */
export function seatPart(state: GameState, ctx: EngineCtx, id: SeatId): ActionResult {
  const blocked = seatBlocker(state, id);
  if (blocked) return { ok: false, reason: blocked };
  const def = SEAT_BY_ID.get(id)!;
  const s = ensureSeats(state);

  let purity = 100;
  if (id !== 'VII') {
    // Take the LEAST pure part that qualifies — the same rule every other
    // spender in this codebase follows, so seating never eats your best stock.
    const pool = [...candidates(state, id)].sort((a, b) => a.purity - b.purity);
    const take = pool[0]!;
    purity = take.purity;
    state.casting.rack = (state.casting.rack ?? []).filter((p) => p.id !== take.id);
  }
  s.seated[id] = {
    seat: id, materialId: def.materialId, purity,
    atRecursion: state.recursion?.count ?? 0,
  };
  ctx.dirty();
  ctx.emit({ type: 'seatFilled', seat: id, filled: Object.keys(s.seated).length });
  return { ok: true, data: { seat: id, filled: Object.keys(s.seated).length } };
}

// ---------------------------------------------------------------------------
// What a seat pays
// ---------------------------------------------------------------------------

export function seatedCount(state: GameState): number {
  return Object.keys(state.seats?.seated ?? {}).length;
}

export function allSeven(state: GameState): boolean {
  return SEATS.every((d) => state.seats?.seated?.[d.id]);
}

/**
 * THE SIGNATURES A RECURSION MAY NOT TAKE. Called by `recursionSys` while it
 * builds the next world — a seated Seat hands that shell's signature forward
 * through the one reset that otherwise wipes every shell.
 *
 * REACH, NOT RATE. A carried signature is the mechanic, weakened, exactly as
 * the Breach grants it; nothing here changes what one pays. Aleph's seat keeps
 * no signature (§4's Grip finishes the tool and grants nothing), and the
 * mapping comes off `shellDef().signatureId` rather than a second list, so a
 * shell whose signature is renamed cannot leave a stale string here.
 */
export function keptSignatures(state: GameState): string[] {
  const out: string[] = [];
  for (const def of SEATS) {
    if (!state.seats?.seated?.[def.id]) continue;
    if (def.shellId === 'aleph') continue;
    const sig = shellDefOrNull(def.shellId)?.signatureId;
    if (sig && !out.includes(sig)) out.push(sig);
  }
  return out;
}

// ---------------------------------------------------------------------------
// What the panel says — the UI computes nothing
// ---------------------------------------------------------------------------

export interface SeatRow {
  id: SeatId;
  /** Always the numeral. The rest is null until the outline resolves. */
  numeral: SeatId;
  known: boolean;
  seated: boolean;
  name: string;
  part: string;
  material: string;
  sits: string;
  keeps: string;
  flavor: string;
  /** What it is waiting for, said plainly. Null when it can be seated now. */
  waiting: string | null;
  /** Parts on the rack that would fill it right now. */
  ready: number;
}

export function seatsRead(state: GameState): {
  open: boolean; filled: number; rows: SeatRow[]; record: boolean; recordShort: string[];
} {
  noteKnownSeats(state);
  const s = ensureSeats(state);
  const rows: SeatRow[] = SEATS.map((def) => {
    const known = seatKnown(state, def.id);
    const seated = !!s.seated[def.id];
    return {
      id: def.id,
      numeral: def.id,
      known, seated,
      name: known ? `${def.id} · the ${def.part}` : `${def.id} · —`,
      part: known ? def.part : '',
      material: known ? materialDef(def.materialId).name : '',
      sits: known ? def.sits : 'An outline. It will tell you when you are standing on it.',
      keeps: known ? def.keeps : '',
      flavor: seated ? def.flavor : '',
      waiting: seated ? null : seatBlocker(state, def.id),
      ready: known && !seated ? candidates(state, def.id).length : 0,
    };
  });
  return {
    open: frameOpen(state),
    filled: seatedCount(state),
    rows,
    record: s.record,
    recordShort: recordShortfall(state),
  };
}
