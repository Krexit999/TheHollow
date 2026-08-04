/**
 * SOCKETS — the doc's step 5, and the one part of the Forge that was a stub.
 *
 * `FORGE_design.md` gives the Sockets part one job: "hold relics, runes and
 * gems — the existing systems plug straight into the tool", and calls it "the
 * tie-in". Until now the part contributed an `attunement` stat that NOTHING
 * READ — the only one of ten stats with no consumer anywhere in the engine —
 * and the three systems it was supposed to connect stayed connected to the
 * LEGACY tool instead. This is that connection, built.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NOTHING HERE IS A SECOND COPY OF ANYTHING.
 *
 * The rule this module is written to is the one the tool-abilities phase set:
 * a relic, a rune and a gem already exist, already have effects, and already
 * have a way of reaching the modifier layer. So a socket does not re-implement
 * any of them — it reaches into the real system and asks it the same question a
 * belt slot or an inscription asks:
 *
 *   RELICS  `effectiveAffixes` + `wakingStep` + `activeResonances`, the exact
 *           terms `relicBonus` folds for a WORN relic. Powers come through
 *           `activePowers`, which this module widens rather than duplicates.
 *   RUNES   THE SOCKET ROW IS A SEQUENCE. Sockets are adjacent, so the row is
 *           read by `sequencePairs`/`sequenceTriples` against `RUNE_PAIRS` and
 *           `RUNE_TRIPLES` — the same positional grammar an inscription uses,
 *           unchanged. Order matters in a socket row because order already
 *           mattered in the alphabet.
 *   GEMS    `gemDef(id).bucket/value` scaled by `gemCutMult`, which is how the
 *           legacy tool has always read a socketed gem.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PILLAR 2, AND WHY IT IS STRUCTURAL RATHER THAN ARGUED.
 *
 * Every socketed contribution leaves this module through `registerModifier`
 * into an EXISTING `Bucket`. There is no new bucket, no flat grant, and no path
 * from a socket to `harvestCell` — so a socket cannot make the rock hold more
 * than `W x H x regen`, and the charge-over-charge measure A.42 settled on
 * cannot move.
 *
 * Some of these effects DO touch `dustYield`, `regen` and `cap`, and that is
 * correct rather than a hole: those three are terms IN the ceiling formula, and
 * a relic moving them is doing exactly what a face upgrade does — which is why
 * `registerRelicModifiers` has been allowed to do it since Phase 12. Raising
 * regen raises the measure's denominator by the same factor; `cap` is storage
 * and `dpsMax` has no cap term (the A.55 ruling). What pillar 2 forbids is a
 * SECOND source of charge, and a socket is not one.
 *
 * THE ONE REAL HAZARD WAS DOUBLE-COUNTING, and it is closed by the shared pool
 * below: a relic is worn OR socketed, never both, enforced at all four verbs
 * that can move one.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY SOCKETING IS A DECISION AND NOT FREE POWER.
 *
 * A socket is capacity, and capacity bought with a deeper stone is how every
 * other axis in this forge works. But it would still be a flat gain if the only
 * thing socketing cost you was a belt slot you got back — so the trade is
 * this, and it needed no new machinery at all:
 *
 *   A SOCKETED RELIC DOES NOT WAKE. `tickRelics` accrues carry-time for the
 *   WORN set only, and this module deliberately does not touch it. A dormant
 *   relic in a socket gives its affixes and stays dormant forever, and
 *   `powerLive` wants Stirring — so a socketed dormant relic has NO POWER.
 *
 * Wear it to grow it, socket it once it is grown. That is a real ordering
 * decision over a long game, and it falls out of two systems already saying
 * what they said.
 */
import type { ActionResult, EngineCtx, GameState, RelicInstance } from '../types';
import { registerModifier, foldBonus, isAdditiveBucket, type Bucket } from '../modifiers';
import { GEMS, gemDef } from '../materials';
import {
  RUNES, RUNE_NAMES, RUNE_PAIRS, RUNE_TRIPLES, DISSONANT,
  sequencePairs, sequenceTriples, type RuneId,
} from '../content/shell4/runes';
import {
  AFFIXES, RARITIES, activeResonances, affixBucketBonus, wakingStep, wireSocketed,
} from './relics';
import { POWER_BUCKETS, wireSocketedPowers } from './relicPowers';
import { currentTool, wireEmptySockets } from './casting';
import { tierOf } from './toolMining';
import { derivePart, type ToolStats } from './forgeParts';
import { aimedByNeighbours, calmsTheRow, cutOf, paysItsOwn, readsThrough } from './lapidary';

// ---------------------------------------------------------------------------
// What a socket can hold
// ---------------------------------------------------------------------------

export type SocketFill =
  | { kind: 'relic'; uid: number }
  | { kind: 'rune'; id: RuneId }
  | { kind: 'gem'; id: string };

export const SOCKET_KINDS = ['relic', 'rune', 'gem'] as const;
export type SocketKind = (typeof SOCKET_KINDS)[number];

/**
 * THE CEILING ON SOCKETS, and it is the rune grammar's number rather than a new
 * one. A tool rune-sequence maxes at five (`runeSlots`), and three in a row is
 * what a TRIPLE needs — so five sockets is "a triple plus two", which is the
 * shape that makes the row worth arranging rather than filling.
 */
export const SOCKET_MAX = 5;

/** The attunement a Loam COMMON sockets part reads, from `STAT_BASE`. */
export const SOCKET_REF = 2;

/**
 * HOW ATTUNEMENT BECOMES SLOTS — measured against the real registry, not
 * guessed. `attunement` is a DAMPED stat (`STAT_MAGNITUDE_EXP` 0.15), so it
 * spans only 2.0 (marl) to 15.2 (axiomdust) across seven shells; in shell steps
 * that is 0.00 to 1.13, and 3.5 steps-to-slots turns it into a clean 1..5:
 *
 *   marl        2.01  -> 1     the starter stone holds exactly one
 *   weepstone   3.20  -> 2     charged+hollow, in LOAM — a first-shell choice
 *   wildstar    4.59  -> 3
 *   unlight     7.30  -> 4
 *   voidstar   15.10  -> 5     hollow+charged+trueseated
 *
 * So the doc's "hollow/charged materials give more" is true by measurement, and
 * the standing reach rule holds at the bottom: EVERY shell can build a tool
 * that sockets something, because the floor is one and not zero.
 */
export const SOCKET_PER_TIER = 3.5;

/**
 * "HOW WELL A RUNE SITS" — the other half of what `STAT_BLURB.attunement` has
 * promised since step 2. A deeper socket stone holds more AND holds them
 * better, and 0.25 a shell step means the deepest stone in the game focuses by
 * 28% rather than by a multiple. Deliberately small: the interesting part of a
 * socket is WHICH relic, not how hard this number pushes.
 */
export const FOCUS_PER_TIER = 0.25;

// ---------------------------------------------------------------------------
// Reading the tool
// ---------------------------------------------------------------------------

/**
 * THE SOCKETS PART'S OWN ATTUNEMENT — not the tool's.
 *
 * The first cut read `tool.stats.attunement`, and two tests caught it in the
 * same breath: a marl tool came out with TWO sockets and a focus of 1.08 when
 * the starter stone is supposed to be one and exactly 1.00. `assembleTool` SUMS
 * every stat across all seven parts, so tool-wide attunement is the Sockets
 * stone plus Binding's secondary plus every `hollow` and `charged` trait
 * anywhere in the build — which would have meant a hollow GRIP silently buying
 * sockets, and the brief says the Sockets part's material decides.
 *
 * Reading the part also matches the constants: the 1..5 ladder documented above
 * was measured per-part, so a tool-wide read was calibrated against numbers it
 * was not measuring.
 */
function attunementOf(tool: ToolStats | null): number {
  const part = tool?.parts.find((p) => p.type === 'sockets');
  if (!part) return 0;
  return derivePart(part).stats.attunement;
}

/** How many sockets this tool has. 0 for bare hands or a tool with no Sockets. */
export function socketCount(tool: ToolStats | null): number {
  const att = attunementOf(tool);
  if (att <= 0) return 0;
  const steps = tierOf(att, SOCKET_REF);
  return Math.max(1, Math.min(SOCKET_MAX, 1 + Math.round(SOCKET_PER_TIER * steps)));
}

/** How hard a socket presses what it holds. 1 at the starter stone. */
export function socketFocus(tool: ToolStats | null): number {
  const att = attunementOf(tool);
  if (att <= 0) return 1;
  return 1 + FOCUS_PER_TIER * tierOf(att, SOCKET_REF);
}

/**
 * THE ROW, always exactly `socketCount` long. Stored sparse and clamped on
 * read, so shrinking the tool's Sockets part cannot orphan a fill into a slot
 * nothing renders — anything past the end is INERT but still stored, and comes
 * back if a deeper Sockets stone is poured again. Same reasoning as the
 * over-budget modifier going dormant rather than being deleted: throwing away
 * what the player put in would be much worse than not counting it.
 */
export function socketRow(state: GameState): Array<SocketFill | null> {
  const n = socketCount(currentTool(state));
  const stored = state.casting?.sockets ?? [];
  const out: Array<SocketFill | null> = [];
  for (let i = 0; i < n; i++) out.push(stored[i] ?? null);
  return out;
}

/** Everything held in a LIVE socket, in row order. */
export function socketed(state: GameState): SocketFill[] {
  return socketRow(state).filter((f): f is SocketFill => f !== null);
}

/** Fills that are stored but outside the current row — held, not counted. */
export function socketOverflow(state: GameState): SocketFill[] {
  const n = socketCount(currentTool(state));
  return (state.casting?.sockets ?? []).slice(n).filter((f): f is SocketFill => !!f);
}

/** Relic uids currently in a live socket. The shared pool reads this. */
export function socketedRelicUids(state: GameState): number[] {
  return socketed(state).filter((f) => f.kind === 'relic').map((f) => f.uid);
}

/**
 * A socketed relic uid INCLUDING one sitting in overflow. The pool guards use
 * this rather than `socketedRelicUids`, because a relic the player put in a
 * socket must not be scrappable just because a shallower Sockets stone stopped
 * counting it — it is still in the tool.
 */
export function relicIsSocketed(state: GameState, uid: number): boolean {
  return (state.casting?.sockets ?? []).some((f) => f?.kind === 'relic' && f.uid === uid);
}

export function socketedRelics(state: GameState): RelicInstance[] {
  const out: RelicInstance[] = [];
  for (const uid of socketedRelicUids(state)) {
    const r = state.relics.held.find((x) => x.uid === uid);
    if (r) out.push(r);
  }
  return out;
}

/** The row as a rune sequence — non-rune sockets read as gaps, which is what
 *  `sequencePairs` already means by `null`.
 *
 *  PER-SLOT AND INDEX-STABLE. Everything that WRITES a slot reads this, so it
 *  must stay the same length as the row; the READING below is a different
 *  shape and lives in its own function. */
export function runeSequence(state: GameState): Array<RuneId | null> {
  return socketRow(state).map((f) => (f?.kind === 'rune' ? f.id : null));
}

/**
 * WHAT THE ROW ACTUALLY SAYS — the sequence the grammar is read against.
 *
 * A gem in a socket has always read as a gap, which means it silently kills the
 * pair it sits between (§13's "blocks binding at scale", sitting in the code
 * unexplained). A CUT stone is transparent: it drops out of the reading
 * entirely, so the runes on either side become adjacent and speak.
 *
 * The Lapidary is asked what shape a stone is (`readsThrough`); nothing about
 * cutting is decided here.
 */
export function rowReading(
  state: GameState, row: Array<SocketFill | null> = socketRow(state),
): Array<RuneId | null> {
  const out: Array<RuneId | null> = [];
  for (const f of row) {
    if (f?.kind === 'rune') { out.push(f.id); continue; }
    if (f?.kind === 'gem' && readsThrough(cutOf(state, f.id))) continue; // transparent
    out.push(null);
  }
  return out;
}

export function socketRunePairs(state: GameState): string[] {
  return sequencePairs(rowReading(state));
}

export function socketRuneTriples(state: GameState): string[] {
  return sequenceTriples(rowReading(state));
}

// ---------------------------------------------------------------------------
// The three plugs — each one asks the real system
// ---------------------------------------------------------------------------

/**
 * A SOCKETED RELIC'S AFFIX CONTRIBUTION. Term for term what `relicBonus` folds
 * for a worn one — `effectiveAffixes`, the waking step, its source resonances —
 * times the tool's focus. `pairMultiplier` (The Left Hand) is deliberately NOT
 * applied: that power's own text is about what the WORN hand is holding, and
 * reaching it through a socket would be inventing behaviour rather than
 * plugging in.
 */
export function socketRelicBonus(state: GameState, bucket: Bucket): number {
  const relics = socketedRelics(state);
  if (relics.length === 0) return 0;
  const focus = socketFocus(currentTool(state));
  const active = activeResonances(state);
  let total = 0;
  for (const r of relics) {
    // THE SAME RESOLVED READ THE BELT USES. Sharing it is the point: a socketed relic
    // must be worth exactly what a worn one is worth, term for term.
    const base = affixBucketBonus(r, bucket);
    if (base === 0) continue;
    const res = active.filter((x) => x.source === r.source).reduce((m, x) => m * x.mult, 1);
    total += base * wakingStep(r).mult * res * focus;
  }
  return total;
}

/**
 * A socketed gem's contribution — its own value, aimed by its CUT, then focus.
 *
 * The Workbench took cutting with it when it was culled and this read `const
 * cut = 1` for several passes. The Lapidary (A.94) brings it back as a SHAPE
 * rather than a quality number, so the three answers here are where the stone
 * pays, not how much:
 *
 *   uncut / table   its own bucket, as before
 *   star            the bucket of the PAIR reading through it — not more, elsewhere
 *   water           nothing; it is spending itself holding the row together
 */
export function socketGemBonus(state: GameState, bucket: Bucket): number {
  const row = socketRow(state);
  const gems = socketed(state).filter((f) => f.kind === 'gem');
  if (gems.length === 0) return 0;
  const focus = socketFocus(currentTool(state));
  const additive = isAdditiveBucket(bucket);
  let total = 0;
  for (const g of gems) {
    const def = GEMS.find((x) => x.id === g.id);
    if (!def) continue;
    const shape = cutOf(state, g.id);
    if (!paysItsOwn(shape)) continue;
    let target: Bucket = def.bucket;
    if (aimedByNeighbours(shape)) {
      const aimed = pairThrough(state, row, g.id);
      if (aimed) target = aimed;
    }
    if (target !== bucket) continue;
    // A gem states a MULTIPLIER (1.15) except on an additive bucket, where it
    // states the addend (0.05). Same split the legacy registration makes.
    total += (additive ? def.value : def.value - 1) * focus;
  }
  return total;
}

/**
 * THE BUCKET OF THE PAIR READING THROUGH THIS STONE — a Star cut's whole
 * sentence. The runes either side of it became adjacent because it is
 * transparent, so it takes the colour of what passes.
 *
 * Nothing if it is not between two runes, or if that pair says nothing.
 */
export function pairThrough(
  state: GameState, row: Array<SocketFill | null>, gemId: string,
): Bucket | null {
  const at = row.findIndex((f) => f?.kind === 'gem' && f.id === gemId);
  if (at < 0) return null;
  let left: RuneId | null = null;
  for (let i = at - 1; i >= 0; i--) {
    const f = row[i];
    if (f?.kind === 'rune') { left = f.id; break; }
    if (f?.kind === 'gem' && readsThrough(cutOf(state, f.id))) continue;
    break;
  }
  let right: RuneId | null = null;
  for (let i = at + 1; i < row.length; i++) {
    const f = row[i];
    if (f?.kind === 'rune') { right = f.id; break; }
    if (f?.kind === 'gem' && readsThrough(cutOf(state, f.id))) continue;
    break;
  }
  if (!left || !right) return null;
  return RUNE_PAIRS[`${left}|${right}`]?.bucket ?? null;
}

/**
 * WHAT THE ROW SAYS. The rune grammar unchanged: adjacent pairs speak, three in
 * a row can say a third thing, and the LEFT rune feeds the RIGHT. Focus scales
 * the bonus above 1 rather than the multiplier itself, so a focused Weighted
 * Edge is 1.05 -> 1.06 and never 1.05^1.28.
 */
export function socketRuneBonus(state: GameState, bucket: Bucket): number {
  const seq = rowReading(state);
  if (!seq.some(Boolean)) return 0;
  const focus = socketFocus(currentTool(state));
  const additive = isAdditiveBucket(bucket);
  let total = 0;
  const add = (v: number): void => { total += (additive ? v : v - 1) * focus; };
  for (const p of sequencePairs(seq)) {
    const def = RUNE_PAIRS[p];
    if (def && def.bucket === bucket) add(def.value);
  }
  for (const t of sequenceTriples(seq)) {
    const def = RUNE_TRIPLES[t];
    if (def && def.bucket === bucket) add(def.value);
  }
  return total;
}

/** Every bucket any socketable thing can reach — the registration domain. */
export function socketBuckets(): Bucket[] {
  const out = new Set<Bucket>();
  for (const g of GEMS) out.add(g.bucket);
  for (const p of Object.values(RUNE_PAIRS)) out.add(p.bucket);
  for (const t of Object.values(RUNE_TRIPLES)) out.add(t.bucket);
  return [...out];
}

// ---------------------------------------------------------------------------
// The verb — one function sockets AND unsockets, so it is reversible by shape
// ---------------------------------------------------------------------------

/** Is this rune adjacency one the grammar refuses? Returns the pair if so. */
export function dissonantWith(seq: Array<RuneId | null>): string | null {
  for (const p of sequencePairs(seq)) if (DISSONANT.has(p)) return p;
  return null;
}

/**
 * HOW MANY QUARRELS THIS ROW IS ALLOWED — the Water cut's whole sentence, and
 * the only thing in the game that softens the rune grammar.
 *
 * One per water-cut stone in the row, so a second dissonance still refuses. The
 * price is stated where the cut is: a Water stone gives up its own effect.
 */
export function quarrelsAllowed(state: GameState, row: Array<SocketFill | null>): number {
  let n = 0;
  for (const f of row) if (f?.kind === 'gem' && calmsTheRow(cutOf(state, f.id))) n += 1;
  return n;
}

/** Every refused adjacency in a reading, in order. */
export function dissonancesIn(seq: Array<RuneId | null>): string[] {
  return sequencePairs(seq).filter((p) => DISSONANT.has(p));
}

export function runeName(id: string): string {
  return RUNE_NAMES[id as RuneId] ?? id;
}

/** How a pair or triple key reads on the card. */
export function pairLabel(key: string): string {
  return (RUNE_PAIRS[key] ?? RUNE_TRIPLES[key])?.name ?? key;
}

export function fillLabel(state: GameState, fill: SocketFill): string {
  if (fill.kind === 'rune') return runeName(fill.id);
  if (fill.kind === 'gem') return gemDef(fill.id).name;
  const r = state.relics.held.find((x) => x.uid === fill.uid);
  return r ? relicName(r) : 'a relic';
}

/** A relic has no authored name — it is identified by where it came from and
 *  how good it is, which is the same reading the Reliquary prints. */
export function relicName(r: RelicInstance): string {
  return `${RARITIES[r.rarity] ?? '?'} ${r.source}`;
}

/**
 * SET OR CLEAR ONE SOCKET. `fill: null` pulls whatever is there back out, which
 * is why there is no second verb — reversibility is the shape of the function
 * rather than a feature bolted beside it, and the legacy `socketGem` (which has
 * no way out at all except scrapping the tool) is the mistake this avoids.
 *
 * NOTHING IS CONSUMED. A rune and a gem go back to their piles, a relic goes
 * back to the hold. That is the only honest reading of "socketing is
 * reversible", and it is also what makes a dissonant refusal safe: an
 * inscription that fails EATS the runes, and a socket you can undo must not.
 */
export function setSocket(
  state: GameState, ctx: EngineCtx, slot: number, fill: SocketFill | null,
): ActionResult {
  const tool = currentTool(state);
  if (!tool) return { ok: false, reason: 'You are not carrying one' };
  const n = socketCount(tool);
  if (n <= 0) return { ok: false, reason: 'This tool has no sockets — pour a Sockets part that will hold something' };
  if (slot < 0 || slot >= n) return { ok: false, reason: 'No such socket' };

  const row = (state.casting.sockets ??= []);
  while (row.length < n) row.push(null);
  const had = row[slot] ?? null;

  // TAKE IT OUT. Everything goes back where it came from.
  if (fill === null) {
    if (!had) return { ok: false, reason: 'That socket is empty' };
    row[slot] = null;
    returnFill(state, had);
    ctx.emit({ type: 'socketCleared', slot, kind: had.kind });
    ctx.dirty();
    return { ok: true, data: { removed: had } };
  }

  // ── the three checks that it is a real thing the player actually has ──
  if (fill.kind === 'relic') {
    const r = state.relics.held.find((x) => x.uid === fill.uid);
    if (!r) return { ok: false, reason: 'You do not hold that' };
    if (relicIsSocketed(state, fill.uid) && !(had?.kind === 'relic' && had.uid === fill.uid)) {
      return { ok: false, reason: 'That one is already set in this tool' };
    }
  } else if (fill.kind === 'rune') {
    if (!RUNES.includes(fill.id)) return { ok: false, reason: 'No such rune' };
    if ((state.runes?.found?.[fill.id] ?? 0) < 1) return { ok: false, reason: 'You have none of that rune' };
    /**
     * DISSONANCE IS REFUSED, NOT PUNISHED. The inscription verb destroys the
     * runes on a dissonant sequence, and that is right for a permanent etching
     * with a Silica re-prep behind it. A socket comes back out, so the same
     * failure here would be a free way to delete your own runes. It names the
     * pair, because the pair is the thing the player needs to know.
     */
    const prospective = [...socketRow(state)];
    prospective[slot] = fill;
    const bad = dissonancesIn(rowReading(state, prospective));
    if (bad.length > quarrelsAllowed(state, prospective)) {
      const [a, b] = bad[0]!.split('|');
      return {
        ok: false,
        reason: `${runeName(a!)} will not sit beside ${runeName(b!)} — they fight. Try another order.`,
      };
    }
  } else {
    if (!GEMS.some((g) => g.id === fill.id)) return { ok: false, reason: 'No such gem' };
    if ((state.materials.gems[fill.id] ?? 0) < 1) return { ok: false, reason: 'You hold no such gem' };
    /**
     * A CUT STONE IS TRANSPARENT, so dropping one into a row can make two
     * runes ADJACENT that were not — and the grammar refuses some of those.
     * The same guard has to run on this side or a gem becomes the back door
     * into a dissonant row.
     */
    const prospective = [...socketRow(state)];
    prospective[slot] = fill;
    const bad = dissonancesIn(rowReading(state, prospective));
    if (bad.length > quarrelsAllowed(state, prospective)) {
      const [a, b] = bad[0]!.split('|');
      return {
        ok: false,
        reason: `Set here, the stone lets ${runeName(a!)} see ${runeName(b!)}, and they fight.`,
      };
    }
  }

  // Whatever was in the slot comes out first, then the new thing goes in.
  if (had) returnFill(state, had);
  takeFill(state, fill);
  row[slot] = fill;

  /**
   * THE SHARED POOL, HALF ONE. A relic in a socket is out of the belt — the
   * brief's requirement and the thing that stops a socketed relic being counted
   * twice by two different registrars reading the same affixes.
   */
  if (fill.kind === 'relic') {
    state.relics.equipped = state.relics.equipped.filter((u) => u !== fill.uid);
  }

  /**
   * THE SAME CODEX AN INSCRIPTION WRITES TO. A pair discovered by arranging
   * sockets is the same knowledge as one discovered by etching, so it lands in
   * `runes.pairsSeen` and fires the same event — otherwise a player who does all
   * their rune work at the Forge would have an empty rune codex, and pillar 5's
   * "found, not listed" would quietly mean "found only one way".
   */
  if (fill.kind === 'rune') noteSocketRunes(state, ctx);
  ctx.emit({ type: 'socketSet', slot, kind: fill.kind });
  ctx.dirty();
  return { ok: true };
}

/** Any pair or triple the row now says, recorded once, ever. */
function noteSocketRunes(state: GameState, ctx: EngineCtx): void {
  const seq = runeSequence(state);
  const seen = (state.runes.pairsSeen ??= []);
  for (const key of [...sequencePairs(seq), ...sequenceTriples(seq)]) {
    if (!(RUNE_PAIRS[key] ?? RUNE_TRIPLES[key])) continue;
    if (seen.includes(key)) continue;
    seen.push(key);
    ctx.emit({ type: 'pairDiscovered', pair: key });
  }
}

/** Runes and gems are counted stock; a relic is an instance and stays held. */
function takeFill(state: GameState, fill: SocketFill): void {
  if (fill.kind === 'rune') {
    state.runes.found[fill.id] = (state.runes.found[fill.id] ?? 0) - 1;
  } else if (fill.kind === 'gem') {
    state.materials.gems[fill.id] = (state.materials.gems[fill.id] ?? 0) - 1;
  }
}

function returnFill(state: GameState, fill: SocketFill): void {
  if (fill.kind === 'rune') {
    state.runes.found[fill.id] = (state.runes.found[fill.id] ?? 0) + 1;
  } else if (fill.kind === 'gem') {
    state.materials.gems[fill.id] = (state.materials.gems[fill.id] ?? 0) + 1;
  }
}

/**
 * TAKING THE TOOL APART returns everything in every socket, including anything
 * sitting in overflow. Called from `breakDownTool`, which already promises
 * "every piece comes back" on its own button.
 */
export function emptySockets(state: GameState): SocketFill[] {
  const row = state.casting?.sockets ?? [];
  const out = row.filter((f): f is SocketFill => !!f);
  for (const f of out) returnFill(state, f);
  state.casting.sockets = [];
  return out;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * THREE SOURCES, NOT ONE, so the breakdown popover can say which of the three
 * a number came from — the same reason `relicPowers.*` registers apart from
 * `relics.*`. Every one goes through `foldBonus`, which knows that
 * `offlineEffAdd` sums while everything else multiplies; writing `1 + bonus`
 * by hand here is the bug that has already shipped twice in this engine.
 */
export function registerSocketModifiers(): void {
  /**
   * THE RELIC DOMAIN IS DERIVED FROM `AFFIXES`, NOT LISTED HERE.
   *
   * The first cut hand-wrote the seventeen bucket names and cast the array into
   * place, and `modifierIntegrity` failed it on the spot — that suite forbids
   * asserting a bucket name's type anywhere in engine source, because such an
   * assertion is how a typo becomes a source registering into a bucket nothing
   * reads. It was right to, and the fix is better than the assertion: reading
   * `AFFIXES` means a new relic affix extends the socket's reach automatically
   * rather than silently falling outside it, which is the same class of failure
   * this module exists to end.
   *
   * (That test greps SOURCE TEXT, so it cannot tell code from prose — which is
   * why this comment describes the mistake instead of quoting it.)
   */
  const relicBucketSet = new Set<Bucket>(socketBuckets());
  for (const a of Object.values(AFFIXES)) relicBucketSet.add(a.bucket);
  for (const b of POWER_BUCKETS) relicBucketSet.add(b);

  for (const bucket of relicBucketSet) {
    registerModifier({
      id: `sockets.relics.${bucket}`,
      label: 'Socketed relics',
      bucket,
      value: (s) => foldBonus(bucket, socketRelicBonus(s, bucket)),
    });
  }
  for (const bucket of new Set(GEMS.map((g) => g.bucket))) {
    registerModifier({
      id: `sockets.gems.${bucket}`,
      label: 'Socketed gems',
      bucket,
      value: (s) => foldBonus(bucket, socketGemBonus(s, bucket)),
    });
  }
  const runeBuckets = new Set<Bucket>([
    ...Object.values(RUNE_PAIRS).map((p) => p.bucket),
    ...Object.values(RUNE_TRIPLES).map((t) => t.bucket),
  ]);
  for (const bucket of runeBuckets) {
    registerModifier({
      id: `sockets.runes.${bucket}`,
      label: 'Socketed runes',
      bucket,
      value: (s) => foldBonus(bucket, socketRuneBonus(s, bucket)),
    });
  }
}

/**
 * THE TWO WIRES. `relics.ts` and `relicPowers.ts` both need to know what is in
 * a socket — the first to keep the pool shared, the second so a socketed
 * relic's POWER is live — and neither may import this module: `toolSockets`
 * reads `currentTool`, so `casting` and everything it pulls would come with it.
 * Same pattern as `wireHandCarrier`, and for the same reason.
 */
wireSocketed((state, uid) => relicIsSocketed(state, uid));
wireSocketedPowers((state) => socketedRelicUids(state));
wireEmptySockets((state) => { emptySockets(state); });
