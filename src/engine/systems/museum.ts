/**
 * THE MUSEUM and THE EXPEDITIONS — the surface camp, and what leaves from it.
 *
 * Camp-building was CUT in Phase 12 (A.22) and folded in here as SETTING
 * rather than a system: the game already has six spatial-adjacency boards, and
 * a seventh whose payoff is adjacency multipliers would have been repetition
 * with the weakest possible answer to "why would a finished player open it?".
 * What was worth keeping from it — a physical surface place that houses the
 * endgame — is this: the cases line its walls and the crews leave from its gate.
 *
 * THE MUSEUM is the only screen in the game that shows what you DID rather than
 * what you CAN DO. Its cases are CURATED, not shelves: a case asks for specific
 * things, so completing one is a directed hunt rather than passive accumulation.
 * Case bonuses land in modifier buckets and are breakdown-able like everything
 * else; none of them grants flat income.
 *
 * EXPEDITIONS pay in what digging cannot give you. Never chip income — that
 * would hollow out the face and make the ceiling irrelevant. Instead they
 * return LEFT-BEHIND SHELL MATERIALS (the one-way stair means you cannot go
 * back for them, the exact class of problem that caused the P9 softlock),
 * relic material, and museum pieces. They resolve on the GAME CLOCK like the
 * Wells and the Observatory, so they run while the tab is shut and their
 * results wait forever — nothing missable, nothing expiring.
 */
import type { ActionResult, EngineCtx, ExpeditionsState, GameState, MuseumPiece, MuseumState } from '../types';
import { registerModifier, foldBonus, type Bucket } from '../modifiers';
import { spendCurrency } from '../resources';
import { D } from '../decimal';
import { grantRelic } from './relics';
import { addMaterial } from './forge';
import { noteMaterialSeen } from './drops';
import { MATERIALS } from '../materials';
import { allShells, currentShell } from '../shells';
import { HIRELING_BY_NPC, hirelingLevel } from '../guild/hirelings';

// ---------------------------------------------------------------------------
// The Museum
// ---------------------------------------------------------------------------

export interface MuseumCaseDef {
  id: string;
  name: string;
  /** What the case is for, in the game's voice. */
  blurb: string;
  /** What it asks for — a directed hunt, not a shelf. */
  wants: string;
  /** How many distinct items complete it. */
  need: number;
  /** Which collection supplies it. */
  from: 'relic' | 'bestiary' | 'codex' | 'gem';
  /** TYPED, not string: a typo is now a compile error, not a silent no-op. */
  bucket: Bucket;
  /** Permanent bonus when complete. */
  bonus: number;
}

export const CASES: MuseumCaseDef[] = [
  {
    id: 'firstFinds', name: 'The First Finds', from: 'relic', need: 3, bucket: 'dropRate', bonus: 0.08,
    blurb: 'Three things you carried up before you knew what they were worth.',
    wants: 'Any three relics.',
  },
  {
    id: 'teeth', name: 'A Case of Teeth', from: 'bestiary', need: 8, bucket: 'xpGain', bonus: 0.1,
    blurb: 'Eight jaws, labelled in Ashka\'s hand. She spells two of them wrong and will not be told.',
    wants: 'Trophies from eight species.',
  },
  {
    id: 'sevenWardens', name: 'The Seven Wardens', from: 'bestiary', need: 7, bucket: 'dustYield', bonus: 0.15,
    blurb: 'One from each floor. The last plinth stayed empty for a long time.',
    wants: 'A trophy from every warden.',
  },
  {
    id: 'colourOfStone', name: 'The Colour of Stone', from: 'gem', need: 6, bucket: 'cap', bonus: 0.12,
    blurb: 'Six gems, lit from behind. Dovekin comes to look at these on his day off.',
    wants: 'Six kinds of gem.',
  },
  {
    id: 'whatWasWritten', name: 'What Was Written', from: 'codex', need: 20, bucket: 'regen', bonus: 0.12,
    blurb: 'Chords, alloys, weaves, shapes — the discoveries, mounted as pages.',
    wants: 'Twenty Codex discoveries.',
  },
  {
    id: 'deepHoard', name: 'The Deep Hoard', from: 'relic', need: 10, bucket: 'dustYield', bonus: 0.18,
    blurb: 'Ten relics, and a note from Sable that reads only: "so it was worth it, then."',
    wants: 'Any ten relics.',
  },
  // --- Phase 14: six more, so the walls are a museum and not a corridor -----
  // Spread deliberately across FOUR sources and TEN distinct buckets, with a
  // rung in each collection early enough to complete before the endgame. The
  // ceiling on each was checked against the real pools, not guessed: there are
  // only six gems in the entire game, so no gem case may ask for more.
  {
    id: 'lampRoom', name: 'The Lamp Room', from: 'gem', need: 3, bucket: 'assaySpeed', bonus: 0.15,
    blurb: 'Three stones that keep the light after you take the lamp away. Dovekin turns the wick down when visitors come, just to watch their faces.',
    wants: 'Three kinds of gem.',
  },
  {
    id: 'brokenTools', name: 'The Broken Tools', from: 'relic', need: 6, bucket: 'strikePower', bonus: 0.15,
    blurb: 'Six that failed underground and came up anyway. Ashka says this is the most honest case in the building and will not have it moved somewhere quieter.',
    wants: 'Any six relics.',
  },
  {
    id: 'census', name: 'A Census of the Dark', from: 'bestiary', need: 20, bucket: 'dropRate', bonus: 0.12,
    blurb: 'Twenty species, arranged by the floor that made them. The room gets quieter the further along the wall you walk.',
    wants: 'Trophies from twenty species.',
  },
  {
    id: 'firstPrinciples', name: 'First Principles', from: 'codex', need: 6, bucket: 'kilnRate', bonus: 0.12,
    blurb: 'The first six things you worked out with nobody telling you. Mounted before anyone knew there would be more.',
    wants: 'Six Codex discoveries.',
  },
  {
    id: 'longShelf', name: 'The Long Shelf', from: 'codex', need: 50, bucket: 'brickYield', bonus: 0.2,
    blurb: 'Fifty. Somewhere around thirty Sable stopped writing cards for them and simply signed the shelf.',
    wants: 'Fifty Codex discoveries.',
  },
  {
    id: 'cameBack', name: 'The Ones That Came Back', from: 'relic', need: 20, bucket: 'offlineEffAdd', bonus: 0.05,
    blurb: 'Twenty. The case is deeper than the wall it is set into, which Dovekin insists is a trick of the light.',
    wants: 'Any twenty relics.',
  },
  // --- Phase 15: eight more --------------------------------------------
  // Every ceiling re-checked against the real pools (6 gems, 97 species,
  // 131+ codex entries, relics unbounded). The gem line stops at 6 because
  // that is how many gems the game contains.
  {
    id: 'quietRoom', name: 'The Quiet Room', from: 'bestiary', need: 3, bucket: 'regen', bonus: 0.08,
    blurb: 'Three, mounted low, with the lamp kept dim. It is where Ashka sends people who have just seen their first one up close.',
    wants: 'Trophies from three species.',
  },
  {
    id: 'wardensTeeth', name: "The Warden's Teeth", from: 'bestiary', need: 40, bucket: 'strikePower', bonus: 0.2,
    blurb: 'Forty jaws and no labels at all. Ashka says the labels were the part people looked at.',
    wants: 'Trophies from forty species.',
  },
  {
    id: 'shallowShelf', name: 'The Shallow Shelf', from: 'codex', need: 12, bucket: 'drillSpeed', bonus: 0.12,
    blurb: 'The first dozen, kept at eye height by the door. Every visitor reads these and no visitor reads the rest.',
    wants: 'Twelve Codex discoveries.',
  },
  {
    id: 'hundredHand', name: 'A Hundred by Hand', from: 'codex', need: 100, bucket: 'motifGain', bonus: 0.25,
    blurb: 'One hundred. There is a chair in front of this case and it is always warm.',
    wants: 'One hundred Codex discoveries.',
  },
  {
    id: 'strangersRow', name: "The Stranger's Row", from: 'relic', need: 14, bucket: 'chainPower', bonus: 0.16,
    blurb: 'Fourteen that nobody can identify, arranged by how wrong they feel to hold. The order has been argued about twice.',
    wants: 'Any fourteen relics.',
  },
  {
    id: 'lastCase', name: 'The Last Case', from: 'relic', need: 30, bucket: 'xpGain', bonus: 0.22,
    blurb: 'Thirty. It was built for twenty and extended twice, both times by Dovekin, both times overnight, both times without asking.',
    wants: 'Any thirty relics.',
  },
  {
    id: 'litFromWithin', name: 'Lit From Within', from: 'gem', need: 5, bucket: 'kilnHeatRamp', bonus: 0.18,
    blurb: 'Five, set in a ring with a candle at the centre. It is the only exhibit that has ever made someone cry, and Dovekin will not say who.',
    wants: 'Five kinds of gem.',
  },
  {
    id: 'everyColour', name: 'Every Colour There Is', from: 'gem', need: 6, bucket: 'scripGain', bonus: 0.2,
    blurb: 'All six. There is no seventh. People still ask, and the museum has a small printed card that says so.',
    wants: 'Every kind of gem.',
  },
];

export const CASE_BY_ID = new Map(CASES.map((c) => [c.id, c]));

export function caseProgress(state: GameState, caseId: string): { have: number; need: number } {
  const def = CASE_BY_ID.get(caseId);
  if (!def) return { have: 0, need: 1 };
  return { have: (state.museum.donated[caseId] ?? []).length, need: def.need };
}

export function caseComplete(state: GameState, caseId: string): boolean {
  const p = caseProgress(state, caseId);
  return p.have >= p.need;
}

/** The halls a relic can actually stand in. */
export const RELIC_HALLS = CASES.filter((c) => c.from === 'relic');

/**
 * IDENTIFY -> VALUE, made real (A.48). Studying used to buy story and exhibit
 * eligibility and nothing you could point at on the bonus line, which read as
 * "pay Scrip for flavour". A studied piece now makes the hall it stands in
 * worth more, permanently and visibly: the case's own bonus grows with the
 * research done inside it.
 */
export const STUDY_BONUS = 0.03;

/** A case's live bonus — its authored figure plus the research standing in it. */
export function caseBonusNow(state: GameState, def: MuseumCaseDef): number {
  return def.bonus + STUDY_BONUS * piecesInCase(state, def.id).length;
}

/** Completed cases' contribution to a bucket. */
export function museumBonus(state: GameState, bucket: Bucket): number {
  let total = 0;
  for (const id of state.museum.completed) {
    const def = CASE_BY_ID.get(id);
    if (def && def.bucket === bucket) total += caseBonusNow(state, def);
  }
  return total;
}

/** Museum completion feeds the relic rarity floor — collection lifts luck. */
// ---------------------------------------------------------------------------
// EXHIBITS — what the arrangement means (A.47)
// ---------------------------------------------------------------------------
/**
 * A case is a HALL, and which hall you put a relic in is the choice. An exhibit
 * forms when the pieces standing together in one hall say something — three
 * from the same run, three out of one drill's work, three from the deep.
 *
 * This is the light spatial decision the brief asked for without a grid puzzle:
 * "where does this belong" is a real question at 380px, and a coordinate grid is
 * not. Every predicate reads the A.46 find-record, so the identity layer feeds
 * this one instead of being restated by it.
 *
 * PILLAR 5: nothing here is listed before it forms. The player arranges, and
 * the museum notices — which is the whole difference between a discovery and a
 * checklist. An UNIDENTIFIED piece is a shape under a cloth and counts for
 * nothing here: the hall cannot recognise what has not been studied.
 */
export interface ExhibitDef {
  id: string;
  name: string;
  line: string;
  /** How many identified pieces in ONE hall must satisfy it. */
  need: number;
  bucket: Bucket;
  bonus: number;
  /** Read over the identified pieces of a single hall. */
  holds: (pieces: MuseumPiece[]) => boolean;
}

/** Pieces sharing a value, biggest group first. */
function biggestGroup<T>(pieces: MuseumPiece[], key: (p: MuseumPiece) => T | undefined): number {
  const counts = new Map<T, number>();
  for (const p of pieces) {
    const k = key(p);
    if (k === undefined) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best = 0;
  for (const n of counts.values()) best = Math.max(best, n);
  return best;
}

export const EXHIBITS: ExhibitDef[] = [
  {
    id: 'lastShift', name: 'The Last Shift', need: 3, bucket: 'dropRate', bonus: 0.1,
    line: 'Three things that came up on the same run. Whatever that day was, it was a long one.',
    holds: (ps) => biggestGroup(ps, (p) => p.relic.found?.run) >= 3,
  },
  {
    id: 'oneHandsWork', name: "One Hand's Work", need: 3, bucket: 'drillSpeed', bonus: 0.12,
    line: 'All turned up by the same drill. Somebody should put its name on the card.',
    holds: (ps) => biggestGroup(ps, (p) => p.relic.found?.by) >= 3,
  },
  {
    id: 'outOfTheDeep', name: 'Out of the Deep', need: 3, bucket: 'dustYield', bonus: 0.12,
    line: 'Nothing here was found in the light. The labels all read the same, past four hundred.',
    holds: (ps) => ps.filter((p) => (p.relic.found?.depth ?? 0) >= 200).length >= 3,
  },
  {
    id: 'wanderingLife', name: 'A Wandering Life', need: 4, bucket: 'scripGain', bonus: 0.14,
    line: 'A warren, a well, a warden, the deep shaft. One case, four different lives.',
    holds: (ps) => new Set(ps.map((p) => p.relic.source)).size >= 4,
  },
  {
    id: 'wokenTogether', name: 'Woken Together', need: 3, bucket: 'regen', bonus: 0.12,
    line: 'Three that were awake when you gave them up. They have not gone back to sleep.',
    holds: (ps) => ps.filter((p) => (p.relic.waking ?? 0) >= 2).length >= 3,
  },
  {
    id: 'firstHundred', name: 'The First Hundred', need: 3, bucket: 'xpGain', bonus: 0.12,
    line: 'Everything here was found in the first stretch, before you knew what any of it meant.',
    holds: (ps) => ps.filter((p) => (p.relic.found?.depth ?? 1e9) < 100).length >= 3,
  },
];

/** Identified pieces standing in one hall. */
export function piecesInCase(state: GameState, caseId: string): MuseumPiece[] {
  return state.museum.pieces.filter((p) => p.caseId === caseId && p.identified);
}

/** Which exhibits the current arrangement forms, with the hall each stands in. */
export function activeExhibits(state: GameState): Array<{ def: ExhibitDef; caseId: string }> {
  const out: Array<{ def: ExhibitDef; caseId: string }> = [];
  for (const c of CASES) {
    const ps = piecesInCase(state, c.id);
    for (const def of EXHIBITS) {
      if (ps.length >= def.need && def.holds(ps)) out.push({ def, caseId: c.id });
    }
  }
  return out;
}

/** Write down anything the arrangement has newly formed. The bonus applies the
 *  first time regardless; this only records that it was SEEN. */
export function noteExhibits(state: GameState, ctx: EngineCtx): void {
  for (const { def } of activeExhibits(state)) {
    if (state.museum.exhibitsFound.includes(def.id)) continue;
    state.museum.exhibitsFound.push(def.id);
    ctx.emit({ type: 'exhibitFormed', id: def.id });
    ctx.dirty();
  }
}

/** What identifying a piece costs — rarity is most of it. */
export function identifyCost(piece: MuseumPiece): number {
  return 40 * (piece.relic.rarity + 1);
}

/**
 * IDENTIFY -> VALUE. Studying a piece is what lets the hall recognise it: an
 * unidentified relic counts toward its case (you did give it) but is invisible
 * to every exhibit, and its story stays unread. Scrip is the price, which gives
 * the Guild's currency a use that is not another purchase.
 */
/**
 * THE SECOND INPUT (A.48, the standing reach rule). Scrip is meta-tier and
 * earnable in every shell, but a player who has just Breached and spent their
 * purse would find the Museum's only verb live-but-dead. Relic SHARDS pay for
 * the same work, and shards come out of the player's own pile in any world.
 * Never a dead button: if you have relics at all, you can study one.
 *
 * Priced in the SHARD economy, not as a multiple of the Scrip price. A Rare
 * renders down for 6 shards, so 8 per rarity step puts a study at three or four
 * spare relics — comparable to a first fusion. Converting the Scrip figure
 * instead (the first attempt) asked 240 shards for the same work, which is
 * forty rendered relics: a second input that exists and cannot be paid is the
 * same dead button in a different colour.
 */
export function identifyShardCost(piece: MuseumPiece): number {
  return 8 * (piece.relic.rarity + 1);
}

export function identifyPiece(state: GameState, ctx: EngineCtx, uid: number): ActionResult {
  const piece = state.museum.pieces.find((p) => p.relic.uid === uid);
  if (!piece) return { ok: false, reason: 'Nothing of that name is on display' };
  if (piece.identified) return { ok: false, reason: 'That one has been studied already' };
  const cost = identifyCost(piece);
  const shardCost = identifyShardCost(piece);
  if (!spendCurrency(state, 'scrip', D(cost))) {
    if (state.relics.shards < shardCost) {
      return { ok: false, reason: `The work wants ${cost} Scrip, or ${shardCost} shards the hard way.` };
    }
    state.relics.shards -= shardCost;
  }
  piece.identified = true;
  state.relics.floorBonus = museumFloorBonus(state);
  noteExhibits(state, ctx);
  ctx.dirty();
  return { ok: true, data: { uid } };
}

/** Move a studied piece to another hall — the arrangement is the whole verb,
 *  so it must be reversible or it is a trap rather than a decision. */
export function movePiece(state: GameState, ctx: EngineCtx, uid: number, caseId: string): ActionResult {
  const piece = state.museum.pieces.find((p) => p.relic.uid === uid);
  if (!piece) return { ok: false, reason: 'Nothing of that name is on display' };
  const def = CASE_BY_ID.get(caseId);
  if (!def) return { ok: false, reason: 'No such hall' };
  if (def.from !== 'relic') return { ok: false, reason: 'That hall is not for relics' };
  if (piece.caseId === caseId) return { ok: false, reason: 'It already stands there' };
  const from = piece.caseId;
  // The case lists move with it, so `donated` and `pieces` cannot drift apart.
  const key = `relic:${piece.relic.uid}`;
  state.museum.donated[from] = (state.museum.donated[from] ?? []).filter((k) => k !== key);
  const target = (state.museum.donated[caseId] ??= []);
  if (target.length >= def.need) return { ok: false, reason: 'That hall is full' };
  target.push(key);
  piece.caseId = caseId;
  // Completion can change in BOTH directions when a piece walks out of a hall.
  for (const id of [from, caseId]) {
    const cdef = CASE_BY_ID.get(id);
    const full = cdef ? (state.museum.donated[id]?.length ?? 0) >= cdef.need : false;
    const at = state.museum.completed.indexOf(id);
    if (full && at < 0) state.museum.completed.push(id);
    if (!full && at >= 0) state.museum.completed.splice(at, 1);
  }
  state.relics.floorBonus = museumFloorBonus(state);
  noteExhibits(state, ctx);
  ctx.dirty();
  return { ok: true };
}

/** Every formed exhibit's contribution to a bucket. */
export function exhibitBonus(state: GameState, bucket: Bucket): number {
  return activeExhibits(state)
    .filter(({ def }) => def.bucket === bucket)
    .reduce((sum, { def }) => sum + def.bonus, 0);
}

export function museumFloorBonus(state: GameState): number {
  // Research lifts luck too (A.48), so studying is worth doing before a hall
  // is anywhere near full — the old rule paid nothing until a case closed.
  const studied = state.museum.pieces.filter((p) => p.identified).length;
  return Math.min(0.5, state.museum.completed.length * 0.08 + studied * 0.01);
}

// ---------------------------------------------------------------------------
// Expeditions
// ---------------------------------------------------------------------------

export interface ExpeditionRouteDef {
  id: string;
  name: string;
  blurb: string;
  minutes: number;
  /** Which left-behind shell it draws from ('any' = the deepest you've left). */
  shell: string;
  /** Chance of returning relic material, 0..1. */
  relicChance: number;
}

export const ROUTES: ExpeditionRouteDef[] = [
  { id: 'shortWalk', name: 'The Short Walk', minutes: 2, shell: 'any', relicChance: 0.05,
    blurb: 'Out past the lamp-line and back before the kettle boils.' },
  { id: 'oldSeam', name: 'The Old Seam', minutes: 30, shell: 'any', relicChance: 0.18,
    blurb: 'A worked-out seam in a shell you have already left. It still owes you.' },
  { id: 'backStair', name: 'The Back Stair', minutes: 120, shell: 'any', relicChance: 0.35,
    blurb: 'The long way down to a world you closed behind you. Bring rope.' },
  { id: 'nightHaul', name: 'The Night Haul', minutes: 480, shell: 'any', relicChance: 0.6,
    blurb: 'Eight hours. They will be gone when you sleep and back when you are not looking.' },
];

export const ROUTE_BY_ID = new Map(ROUTES.map((r) => [r.id, r]));

/**
 * What a specific crew does to a route. Crews used to be interchangeable, so
 * the roster of named characters was decoration on a dropdown; now Pell hauls,
 * Jib is fast, and Fenn finds the odd thing.
 *
 * The trait is authored on the hireling def and scaled by their level, which
 * means it is DERIVED — no new save state, and every crew on an existing save
 * has its trait the moment the game loads.
 */
export interface CrewEffect {
  trait: string;
  note: string;
  /** The veteran trait, once they have grown into it. */
  second?: { trait: string; note: string };
  haulMult: number;
  relicAdd: number;
  speedMult: number;
}

/** The level at which a hand's second trait shows up. */
export const SECOND_TRAIT_LEVEL = 5;

export function crewEffect(state: GameState, crewId: string): CrewEffect | null {
  const def = HIRELING_BY_NPC.get(crewId);
  const held = state.guild.hirelings[crewId];
  if (!def?.expedition || !held) return null;
  const e = def.expedition;
  const level = hirelingLevel(held.xp);
  // Experience deepens what they were already good at rather than adding a new
  // talent: at level 10 a trait is half again as strong as on day one.
  const lv = 1 + level * 0.05;

  // THE SECOND TRAIT (Phase 15). A veteran hand develops a second thing they
  // are good at, authored per person and revealed at level 5. This is depth
  // without new NPCs and, because it is derived from the def plus their level,
  // WITHOUT SAVE STATE — every existing crew grows into theirs on load.
  const second = level >= SECOND_TRAIT_LEVEL ? def.expedition2 : undefined;

  return {
    trait: e.trait,
    note: e.note,
    second: second ? { trait: second.trait, note: second.note } : undefined,
    haulMult: (1 + ((e.haulMult ?? 1) - 1) * lv) * (second?.haulMult ?? 1),
    relicAdd: (e.relicAdd ?? 0) * lv + (second?.relicAdd ?? 0),
    // A speed trait sharpens with level in whichever direction it points.
    speedMult: (1 + ((e.speedMult ?? 1) - 1) * lv) * (second?.speedMult ?? 1),
  };
}

/** How long this crew would actually be gone on this route. */
export function routeDurationMs(state: GameState, crewId: string, route: ExpeditionRouteDef): number {
  const eff = crewEffect(state, crewId);
  return Math.round(route.minutes * 60_000 * (eff?.speedMult ?? 1));
}

/** Resolve anything whose time has come. Pure function of the GAME CLOCK, so
 * it behaves identically online, offline, and in the sim. Results move to
 * `ready` and wait there forever. */
export function tickExpeditions(state: GameState): number {
  const now = state.guild.clockMs;
  let resolved = 0;
  const stillOut: ExpeditionsState['active'] = [];
  for (const e of state.expeditions.active) {
    if (now >= e.startedMs + e.durationMs) {
      state.expeditions.ready.push({ crewId: e.crewId, routeId: e.routeId, seed: Math.floor(e.startedMs) % 100000, fromDepth: e.fromDepth ?? 0 });
      state.expeditions.completed += 1;
      resolved += 1;
    } else {
      stillOut.push(e);
    }
  }
  if (resolved > 0) state.expeditions.active = stillOut;
  return resolved;
}

/** Donate an item to a case. A donated relic leaves your hands — the case is
 * where it lives now — which is why cases pay a permanent bonus. */
export function donateToCase(
  state: GameState,
  ctx: EngineCtx,
  caseId: string,
  key: string,
  relicUid?: number,
): ActionResult {
  const def = CASE_BY_ID.get(caseId);
  if (!def) return { ok: false, reason: 'No such case' };
  const list = (state.museum.donated[caseId] ??= []);
  if (list.includes(key)) return { ok: false, reason: 'That one is already in the case' };
  if (list.length >= def.need) return { ok: false, reason: 'That case is full' };

  if (relicUid !== undefined) {
    const relic = state.relics.held.find((r) => r.uid === relicUid);
    if (!relic) return { ok: false, reason: 'You do not hold that' };
    // A case takes the relic for good, so the lock refuses here too.
    if (relic.locked) return { ok: false, reason: 'That one is locked — unlock it first' };
    state.relics.held = state.relics.held.filter((r) => r.uid !== relicUid);
    state.relics.equipped = state.relics.equipped.filter((u) => u !== relicUid);
    // THE PIECE IS KEPT WHOLE (A.47). This used to be the end of the relic:
    // filtered out of `held` and gone. A.46 had just given every relic a story
    // — where, when, which drill — so donating one destroyed the only record
    // of it and the museum became a wall of anonymous plinths. The instance
    // moves to the hall instead, which is also what lets an exhibit recognise
    // anything about the things standing in it.
    state.museum.pieces.push({ relic, caseId, identified: false });
  }
  list.push(key);

  if (list.length >= def.need && !state.museum.completed.includes(caseId)) {
    state.museum.completed.push(caseId);
    // Collection lifts luck: a completed case raises the relic rarity floor.
    state.relics.floorBonus = museumFloorBonus(state);
    ctx.emit({ type: 'caseCompleted', caseId });
  }
  ctx.dirty();
  return { ok: true };
}

/** Claim a returned crew's haul. Results wait forever, so this is never timed. */
export function claimExpedition(state: GameState, ctx: EngineCtx, crewId: string): ActionResult {
  const idx = state.expeditions.ready.findIndex((r) => r.crewId === crewId);
  if (idx < 0) return { ok: false, reason: 'That crew is not back yet' };
  const [done] = state.expeditions.ready.splice(idx, 1);
  const route = ROUTE_BY_ID.get(done!.routeId);
  if (!route) return { ok: false, reason: 'No such route' };

  // Pays in what digging cannot give you: material from shells you have left
  // behind, and relic material. NEVER chip income — that would hollow out the
  // face and make the ceiling irrelevant.
  // ...and it actually PAYS. Until Phase 13 this function built a haul object
  // and discarded it: crews walked, returned, and handed over nothing.
  const eff = crewEffect(state, crewId);
  const haul = Math.max(1, Math.round((route.minutes / 2) * (eff?.haulMult ?? 1)));

  // Material from a shell the one-way stair has already closed behind you —
  // the job only expeditions can do. Never chip income.
  //
  // DEPARTURE DEPTH (Phase 19): a crew that set off from a cache deep in the
  // column starts nearer the worlds below, so it reaches a DEEPER left-behind
  // shell (indexed by how far down it left, sorted by ordinal) and comes back
  // with better odds of a relic. It changes WHICH world and the luck, never the
  // income — pillar 2 is untouched, the same as a surface send.
  const fromDepth = done!.fromDepth ?? 0;
  const reach = Math.max(0, Math.min(1, fromDepth / Math.max(1, currentShell(state).floorDepth)));
  const behind = allShells()
    .filter((sh) => (state.depthRecords[sh.id] ?? 0) > 0 && sh.id !== state.shell.current)
    .sort((a, b) => a.ordinal - b.ordinal);
  let from = currentShell(state);
  if (behind.length > 0) {
    // Surface sends spread across the left-behind shells; a deep send biases
    // toward the deeper (later-ordinal) end of that list.
    const base = done!.seed % behind.length;
    const idx = Math.min(behind.length - 1, Math.round(base * (1 - reach) + (behind.length - 1) * reach));
    from = behind[idx]!;
  }
  // Never the worked set: refined intermediates, cured stones, and the export
  // spine can only ever be MADE (or hauled by Serra, deliberately) — a crew
  // with shovels does not dig up a Lodeframe. Same law as rollDrop and the
  // guild stalls.
  const pool = MATERIALS.filter((m) => m.shellId === from.id && !m.worked);
  let granted = 0;
  for (let i = 0; i < haul && pool.length > 0; i++) {
    const mat = pool[(done!.seed + i * 13) % pool.length]!;
    addMaterial(state, mat.id, 40 + ((done!.seed + i * 7) % 45));
    noteMaterialSeen(state, mat.id);
    granted += 1;
  }

  const gotRelic = ((done!.seed % 100) / 100) < Math.min(0.95, route.relicChance + (eff?.relicAdd ?? 0) + reach * 0.2);
  if (gotRelic) grantRelic(state, ctx, 'expedition');

  ctx.emit({ type: 'expeditionReturned', crewId, haul: granted });
  ctx.dirty();
  return { ok: true, data: { haul: granted, relic: gotRelic, from: from.name, routeId: route.id } };
}

/**
 * Completed cases pay through named modifier sources, breakdown-able like
 * everything else. Same pillar-2 argument as relics: these buckets move the
 * ceiling the way an upgrade does, or sit outside the income path. A case
 * never grants flat income.
 */
export function registerMuseumModifiers(): void {
  // Exhibits ride the same registration, so a formed exhibit shows up in the
  // breakdown popover by name like every other source rather than being an
  // invisible multiplier the player has to take on trust.
  for (const bucket of new Set(EXHIBITS.map((e) => e.bucket))) {
    registerModifier({
      id: `exhibits.${bucket}`,
      label: 'Exhibits',
      bucket,
      value: (s) => foldBonus(bucket, exhibitBonus(s, bucket)),
    });
  }
  const buckets = new Set(CASES.map((c) => c.bucket));
  for (const bucket of buckets) {
    // Same two structural guards as the relic registration. This site is why
    // they exist: it named two buckets that were not in the union at all
    // (`dropChance`, `cellCap`) and paid nothing for a phase, and then carried
    // the `1 + bonus` additive bug latently because no case had used an
    // additive bucket yet. Both classes are now unwritable here.
    registerModifier({
      id: `museum.${bucket}`,
      label: 'The Museum',
      bucket,
      value: (s) => foldBonus(bucket, museumBonus(s, bucket)),
    });
  }
}

export function defaultMuseumState(): MuseumState {
  return { donated: {}, completed: [], pieces: [], exhibitsFound: [] };
}

export function defaultExpeditionsState(): ExpeditionsState {
  return { active: [], ready: [], completed: 0 };
}
