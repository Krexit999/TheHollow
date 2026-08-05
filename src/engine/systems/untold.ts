/**
 * THE UNTOLD, in play — the conditions, and the strange thing said first.
 *
 * EVERY CONDITION IS READ OFF STATE THE PLAYER ALREADY PRODUCED. Not one of
 * them is a counter this file writes: `face.compaction`, `polarity.chain`,
 * `growth.fullSince`, `refraction.path`, `pressure.heat` and `hollow.silence`
 * are all written by the systems they belong to, for their own reasons. That is
 * what makes these ACCIDENTS rather than objectives — there is nothing to farm,
 * because there is no counter pointed at them.
 *
 * PAYS NOTHING, LIKE THE DEAD. Finding all six changes what you know and moves
 * no number; `untold.test.ts` §4 reads dpsMax at one depth either side. What an
 * entry hands over is a paragraph naming a destination (LAW 3).
 *
 * THE NEAR-MISS IS THE TELL (§49.1). A player who gets within reach of a
 * condition gets ONE strange line, once, forever — not a hint, not a
 * percentage, not the name of the thing. §49.1's honest audit was that eleven
 * of seventeen secrets had no tell at all and that "accidental" therefore meant
 * "never found"; this is the cheapest mechanism that answers it for all six at
 * once, and it is `suspicious behaviour`, the category §49.1 uses most.
 *
 * TICKED ON THE ONE-SECOND BEAT, not on every action. Six predicates over small
 * arrays, once a second, is cheaper than hooking six systems and cannot drift
 * out of sync with them.
 */
import type { EngineCtx, GameState } from '../types';
import { UNTOLD, type UntoldDef } from '../content/untold';
import { MAX_COMPACTION } from './compaction';
import { currentShell } from '../shells';

export interface UntoldState {
  /** Ids known. Permanent through every reset layer — you cannot un-notice. */
  known: string[];
  /** Ids whose tell has been spoken. Also permanent: the world is odd once. */
  told: string[];
}

export function defaultUntoldState(): UntoldState {
  return { known: [], told: [] };
}

export function ensureUntold(state: GameState): UntoldState {
  const u = (state.untold ??= defaultUntoldState());
  if (!Array.isArray(u.known)) u.known = [];
  if (!Array.isArray(u.told)) u.told = [];
  return u;
}

export function isKnown(state: GameState, id: string): boolean {
  return state.untold?.known?.includes(id) === true;
}

// ---------------------------------------------------------------------------
// The six conditions
// ---------------------------------------------------------------------------

/** How far along a condition is, 0..1. At 1 it has happened; NEAR_AT is the
 *  point the world says something. One function per entry, both readings from
 *  the same expression, so a tell can never fire for a condition that cannot. */
export const NEAR_AT = 0.75;

/** THE FALLOW CORNER's patience, in seconds of a cell sitting full untouched.
 *  §47 says "an entire arc"; this is ten minutes, which a player who forgets a
 *  corner clears without noticing and a player farming it would have to sit
 *  through doing nothing else. */
export const FALLOW_SEC = 600;

/** THE MARKED BREAK — long enough that breaking it is a real loss. */
export const CHAIN_FOR_BREAK = 8;

/** THE UNHEARD — the Silence has to be at the top and left there. */
export const UNHEARD_SEC = 480;

export function progressOf(state: GameState, def: UntoldDef): number {
  const s = state as GameState & Record<string, any>;
  switch (def.id) {
    case 'patientcell': {
      // A cell packed to the top, by a hand rather than a drum. `lastHandCell`
      // is the face's own record of who touched what last.
      const comp = s.face.compaction;
      if (!Array.isArray(comp)) return 0;
      const i = s.face.lastHandCell;
      if (typeof i !== 'number') return 0;
      return Math.min(1, (comp[i] ?? 0) / MAX_COMPACTION);
    }
    case 'markedbreak': {
      // A long chain standing on a cell that is already magnetised. The break
      // is what the player does next; being here is the whole condition.
      const p = s.polarity;
      if (!p || !Array.isArray(p.magnets) || p.magnets.length === 0) return 0;
      return Math.min(1, (p.chain ?? 0) / CHAIN_FOR_BREAK);
    }
    case 'fallowcorner': {
      const f = s.growth?.fullSince;
      if (!Array.isArray(f) || f.length === 0) return 0;
      return Math.min(1, Math.max(...f.map((x: number) => x ?? 0)) / FALLOW_SEC);
    }
    case 'darkface': {
      // Mirrors in hand and the beam allocated to nothing. Owning none is not
      // darkness, it is not having started — hence the stock check.
      const r = s.refraction;
      if (!r) return 0;
      /**
       * NOT "the path is empty" — A FRESH GLASSMERE SATISFIES THAT. The first
       * draft handed the discovery over on arrival, because a player who has
       * not placed a mirror yet has no path either, and the test caught it as
       * vacuous. The accident is DARKNESS YOU MADE, so it needs light you had:
       * `beamHarvests` is the shell's own record that the beam has ever run.
       *
       * `mirrors` is a Record<cell, '/' | '\'>, not an array. tsc caught the
       * first draft treating it as one; a cast would have shipped it silent.
       */
      if ((r.beamHarvests ?? 0) <= 0) return 0;
      const placed = Object.keys(r.mirrors ?? {}).length;
      const lit = r.path?.length ?? 0;
      if (lit === 0) return 1;
      return placed > 0 && lit <= 1 ? NEAR_AT : 0;
    }
    case 'fullgauge': {
      /**
       * §47's Cinder row is "do not vent until the gauge reads exactly 100",
       * AND THAT CANNOT HAPPEN IN THIS BUILD. THE GOVERNOR caps unchoked heat
       * at `GOVERNOR_MAX` = 90 against a flood line of 100 — A.104 measured
       * unchoked ceilings of 40 and 57 across six arms and zero floods in any
       * of them. A condition on "heat reaches 100 while unchoked" would have
       * been a predicate that can never be true, which is the exact
       * dead-BEHAVIOUR class A.103 existed to close.
       *
       * So the accident is the one the shell can actually produce, and it is
       * still §47's: you CHOKED to bank heat, forgot, and the station drowned
       * itself. The Floodgate is the paid version of the same outcome, which is
       * why owning it disqualifies this — you cannot stumble into a thing you
       * bought.
       */
      const p = s.pressure;
      if (!p) return 0;
      if (s.roll?.floodgate) return 0;
      if ((p.floods ?? 0) >= 1) return 1;
      return p.choke ? Math.min(NEAR_AT, ((p.heat ?? 0) / 100) * NEAR_AT * 1.1) : 0;
    }
    case 'unheardstack': {
      const h = s.hollow;
      if (!h) return 0;
      const since = (s.stats?.playTimeSec ?? 0) - (h.listenAt ?? 0);
      if ((h.silence ?? 0) <= 0) return 0;
      return Math.min(1, since / UNHEARD_SEC);
    }
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// The beat
// ---------------------------------------------------------------------------

/**
 * Only the shell you are standing in. Six predicates run per tick either way,
 * but a Loam player must never be told something strange about Cinder — the
 * tell is the world being odd where you are, and a cross-shell one would read
 * as a hint about a place you have not seen.
 */
export function tickUntold(state: GameState, ctx: EngineCtx): void {
  const u = ensureUntold(state);
  const here = currentShell(state).id;
  for (const def of UNTOLD) {
    if (def.shell !== here) continue;
    if (u.known.includes(def.id)) continue;
    const p = progressOf(state, def);
    if (p >= 1) {
      u.known.push(def.id);
      ctx.emit({ type: 'untoldFound', id: def.id });
      ctx.dirty();
      continue;
    }
    if (p >= NEAR_AT && !u.told.includes(def.id)) {
      u.told.push(def.id);
      ctx.emit({ type: 'untoldTell', id: def.id, tell: def.tell });
      ctx.dirty();
    }
  }
}

// ---------------------------------------------------------------------------
// Reading the record
// ---------------------------------------------------------------------------

export interface UntoldRow {
  def: UntoldDef;
  known: boolean;
}

/**
 * ONLY WHAT YOU KNOW. There is no list of six with five greyed out — that is
 * the locked list pillar 5 forbids, and it would turn an accident into a
 * checklist with a denominator. A tell that has been spoken and not resolved
 * shows as nothing at all; it was a line in the feed and it is gone.
 */
export function untoldRows(state: GameState): UntoldRow[] {
  const u = ensureUntold(state);
  return UNTOLD.filter((d) => u.known.includes(d.id)).map((def) => ({ def, known: true }));
}

export function untoldOpen(state: GameState): boolean {
  return (state.untold?.known?.length ?? 0) > 0;
}
