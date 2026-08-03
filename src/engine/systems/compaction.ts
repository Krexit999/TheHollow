/**
 * COMPACTION — working a cell makes it richer.
 *
 * Every hand chip packs the rock it lands on by one. At 8, 14 and 20 the cell
 * starts rolling a DEEP-ENTRY drop table: Umberjade, then Deep Graveclay, then
 * Deepgrave. The counter is per-cell, climbs to a ceiling, and is wiped by the
 * Collapse — so it is a run-length project, not a permanent ratchet, and the
 * question it asks is "how deep can I get this board before it comes down".
 *
 * WHY IT IS NOT A SECOND FAUCET (pillar 2). Nothing here touches charge, cap or
 * regen. Compaction moves what comes OUT of the drop table — rarity, not rate —
 * and drops have always sat outside the income path. `dpsMax = W·H·regen·Y` has
 * no term this file can reach.
 *
 * HAND ONLY, and that is the whole reason the numbers work. A drill parked on a
 * deep cell would roll the terminal material every stroke, which is a faucet
 * wearing a drop table's clothes — so machines never compact and never collect.
 * The gates are what your own attention buys.
 *
 * (This file is what survived GRAIN, cut after playtest against §44.1's kill
 * criterion. Compaction predates it and outlived it; the direction field, the
 * with/across strike, the travelling fracture and the lock are gone.)
 */
import type { EngineCtx, GameState } from '../types';
import { applyDrop } from './drops';
import { sealed } from '../laws';
import { currentShell } from '../shells';
import { biteBonus, settleMult } from './shopFork';
import { note, noteTally, proven } from './reading';

/** The ceiling on the counter. A cell climbs to here and stops; it keeps
 *  working forever, it is simply as deep as it goes. */
export const MAX_COMPACTION = 26;

/**
 * WHERE THE NUMBER APPEARS. Below this, compaction is background intensity only
 * and the early face stays quiet; at and above it, the digit is printed. Eight
 * is not a legibility guess — it is the FIRST DEEP-ENTRY GATE, so the number
 * becomes visible on precisely the chip where it starts paying.
 */
export const COMPACTION_SHOW_AT = 8;

/** What one hand chip packs into the cell it lands on. */
export const CHIP_COMPACTION = 1;

export interface DeepGate { at: number; materialId: string; chance: number }

/**
 * THE GATES. Deepest one met wins; one roll, one material.
 *
 * These three chances are UNVERIFIED BALANCE — set to make the first find
 * reachable inside an hour, never sim-checked. The thing to watch is the late
 * board, where every cell sits at the top gate and every chip rolls the
 * terminal table; the Collapse wipe is what is supposed to bound that, and
 * nobody has measured whether it does.
 */
export const DEEP_GATES: DeepGate[] = [
  { at: 20, materialId: 'deepgrave', chance: 0.06 },
  { at: 14, materialId: 'graveclaydeep', chance: 0.11 },
  { at: 8, materialId: 'umberjade', chance: 0.18 },
];

/**
 * THE LADDER IS PER SHELL (§16.2), and it was not.
 *
 * `DEEP_GATES` was one flat list of three LOAM materials applied in every
 * world, so a Ferrite player packing a cell to 20 dug Deepgrave out of iron.
 * §16.2 gives each shell its own three at the same 8/14/20 rungs; Ferrite's are
 * **wormsteel / lodestone-cored / Poleiron**, and `wormsteel` is deliberately a
 * stone that already exists — the `umberjade` pattern, a second way to find
 * something rather than a second thing that means the same.
 *
 * THE OTHER FIVE SHELLS KEEP LOAM'S TABLE, knowingly and ledgered. Their three
 * are named in §16.2 and most of those materials are not in the registry, so
 * writing them is a materials pass per shell — and silently switching five
 * shells to "no deep drops at all" inside a phase scoped to one is exactly the
 * kind of quiet content change this project keeps finding after the fact. The
 * fallback is wrong and it is the same wrong it has always been.
 */
export const DEEP_GATES_BY_SHELL: Record<string, DeepGate[]> = {
  loam: DEEP_GATES,
  ferrite: [
    { at: 20, materialId: 'poleiron', chance: 0.06 },
    { at: 14, materialId: 'lodestonecored', chance: 0.11 },
    { at: 8, materialId: 'wormsteel', chance: 0.18 },
  ],
  // Verdance reuses TWO of its three: `sapstone` is its own common and
  // `bindingclay` is a Loam rich, both already in the game. Only the terminal
  // is new, because a terminal must come out of the deepest gate and nowhere
  // else — see the note on `thornwall` in materials.ts.
  verdance: [
    { at: 20, materialId: 'thornwall', chance: 0.06 },
    { at: 14, materialId: 'bindingclay', chance: 0.11 },
    { at: 8, materialId: 'sapstone', chance: 0.18 },
  ],
};

export function deepGatesFor(shellId: string): DeepGate[] {
  return DEEP_GATES_BY_SHELL[shellId] ?? DEEP_GATES;
}

/** The deepest gate — what the renderer rings as "this one is worth the most". */
export const TERMINAL_GATE = DEEP_GATES[0]!.at;

/**
 * COMPACTION FALLS BACK, AND THIS IS A PHYSICS CHANGE TO THE SCARCEST RESOURCE
 * IN THE GAME.
 *
 * Before this, a packed cell was PARKED: you worked it to 20 once and it paid
 * the terminal table forever, so the dominant strategy was to stop playing —
 * `sim-shop-fork.ts` measured always-packed winning on 1-4 Collapses against a
 * normal player's 15, because nothing punished camping. A resource you can
 * bank permanently is not a resource you maintain, and compaction is supposed
 * to be a run-length project.
 *
 * So unworked rock relaxes. STEEPER WHEN DEEPER — the top of the ladder is the
 * part that will not hold, which is what makes a deep board something you keep
 * rather than something you own:
 *
 *   rate(c) = DECAY_AT_MAX · (c / MAX_COMPACTION)²   points per second
 *
 * At 26 that is one point a minute; at 20, one per ~1.7 minutes (so a cell
 * parked on the terminal gate falls off it in MINUTES, not seconds); at 8, one
 * per ~10 minutes, so the shallow end stays forgiving and §23's opening is not
 * a maintenance chore.
 *
 * IT STAYS AN INTEGER. `FaceView.drawTile` gates its redraw on compaction being
 * discrete, so a fractional counter would fail the equality check every frame
 * and repaint all 36 tiles forever. The fractional rate is resolved as a
 * PROBABILITY of losing one whole point — honest in expectation, integer by
 * construction, and the same treatment `applyChipCompaction` gives BITE.
 */
/**
 * MUTABLE so a sim can measure the world WITHOUT it — this is a physics change
 * to the scarcest resource in the game, and "before and after" is not a thing
 * you can measure against a frozen const. Same pattern as `SETTLE_TUNING`.
 * Nothing in the game writes to it; only harnesses do.
 */
export const DECAY_TUNING = {
  /** Points per second shed at MAX_COMPACTION. */
  atMax: 1 / 60,
  /** How much steeper the top of the ladder is than the bottom. */
  exponent: 2,
  /** Off = the old physics, where a packed cell stayed packed forever. */
  enabled: true,
};

/** Points per second a cell at this compaction sheds while nobody works it.
 *
 *  `state` is optional so the pure shape of the curve can still be asserted
 *  without one; passing it lets THE READING's `shallowHolds` apply. */
export function decayRate(compaction: number, state?: GameState): number {
  if (compaction <= 0 || !DECAY_TUNING.enabled) return 0;
  /**
   * SHALLOW ROCK DOES NOT RELAX (proposition `shallowHolds`). Below the first
   * gate the rock keeps what you put into it. Reach, not yield: it changes how
   * long a board stays worked, never what a cell pays.
   */
  if (state && compaction < DEEP_GATES[DEEP_GATES.length - 1]!.at && proven(state, 'shallowHolds')) return 0;
  return DECAY_TUNING.atMax * Math.pow(compaction / MAX_COMPACTION, DECAY_TUNING.exponent);
}

/**
 * WHERE THE DIGIT STARTS SHOWING on a cell. Normally the first gate, so the
 * early face stays quiet; `gateSight` drops it to 1, so a player who has taken
 * one cell to the bottom can afterwards feel a gate coming on every other.
 * Information only — LAW 3's "show the destination" rather than the recipe.
 */
export function showCompactionFrom(state: GameState): number {
  return proven(state, 'gateSight') ? 1 : COMPACTION_SHOW_AT;
}

/**
 * Relax every cell. Called from `tickFace`, which already owns the per-cell
 * loop and already runs in offline catch-up — a face left alone for an hour
 * comes back soft, which is the whole point.
 */
export function tickCompaction(state: GameState, dt: number): void {
  ensureCompaction(state);
  const comp = state.face.compaction!;
  for (let i = 0; i < comp.length; i++) {
    const c = comp[i] ?? 0;
    if (c <= 0) continue;
    // A long offline step can owe more than one point; pay the whole part
    // outright and roll for the remainder, so a big dt is not a free pass.
    const owed = decayRate(c, state) * dt;
    const whole = Math.floor(owed);
    const lost = whole + (Math.random() < owed - whole ? 1 : 0);
    if (lost > 0) comp[i] = Math.max(0, c - lost);
  }
}

/**
 * The array is never assumed. A save written before this existed has none, and
 * a face that was widened has one at the wrong length; both heal here rather
 * than in a migration, which is why this needs no save version bump.
 */
export function ensureCompaction(state: GameState): void {
  const n = state.face.cells.length;
  const f = state.face as unknown as Record<string, unknown>;
  if (!Array.isArray(state.face.compaction) || state.face.compaction.length !== n) {
    state.face.compaction = new Array<number>(n).fill(0);
  }
  /**
   * AND A SAVE FROM THE GRAIN BUILD SHEDS WHAT IT WAS CARRYING.
   *
   * Nothing reads these any more, so leaving them changes no behaviour — which
   * is exactly why it would have been missed. They persist in player data and
   * in every exported save string, so a cut that stops at the code is not a
   * cut. Deleted on load, the same way the grain layer used to delete `locked`.
   */
  for (const dead of ['grain', 'grainGen', 'grainScope', 'bandGrain', 'front', 'locked']) {
    if (f[dead] !== undefined) delete f[dead];
  }
}

export function compactionAt(state: GameState, cell: number): number {
  return state.face.compaction?.[cell] ?? 0;
}

/** Which gate this chip crossed, if any — the moment a cell starts paying a
 *  table it was not paying before. Deepest first, so one chip that jumps two
 *  gates names the better one. */
export function gateCrossed(before: number, after: number): number | null {
  for (const g of DEEP_GATES) {
    if (before < g.at && after >= g.at) return g.at;
  }
  return null;
}

export interface CompactionResult {
  before: number;
  after: number;
  /** Material ids the gates dropped on this chip. */
  deepDrops: string[];
}

/**
 * WHAT ONE HAND CHIP DOES TO THE ROCK, after the harvest has already succeeded.
 * A swing that found nothing did no work and packs nothing — otherwise a player
 * could walk every gate open by tapping empty cells.
 */
export function applyChipCompaction(
  state: GameState, ctx: EngineCtx, cell: number,
): CompactionResult {
  ensureCompaction(state);
  const comp = state.face.compaction!;
  const before = comp[cell] ?? 0;
  /**
   * BITE (the Blade fork's packed side) packs harder — and it must stay a WHOLE
   * number. `FaceView.drawTile` gates its redraw on compaction being discrete;
   * a fractional count would fail the equality check every frame and repaint
   * all 36 tiles forever. So a fractional bonus is resolved as a PROBABILITY of
   * one extra point, which is honest in expectation and integer by
   * construction — the same treatment the drill bay gives fractional rolls.
   */
  const bite = biteBonus(state);
  const extra = Math.floor(bite) + (Math.random() < bite - Math.floor(bite) ? 1 : 0);
  comp[cell] = Math.min(MAX_COMPACTION, before + CHIP_COMPACTION + extra);
  const after = comp[cell] ?? 0;
  /**
   * THE DESK LEARNS FROM THE ROCK. Novelty only: crossing your first gate is a
   * note, taking one cell to the bottom is another, and neither can happen
   * twice. The tally beside them is what the `gateSight` proof reads.
   */
  if (gateCrossed(before, after) !== null) {
    noteTally(state, 'gates');
    note(state, ctx, 'firstGate');
  }
  if (before < MAX_COMPACTION && after >= MAX_COMPACTION) {
    noteTally(state, 'terminal');
    note(state, ctx, 'terminalGate');
  }
  const deepDrops: string[] = [];
  const drop = rollDeepEntry(state, ctx, after);
  if (drop) deepDrops.push(drop);
  return { before, after, deepDrops };
}

export function rollDeepEntry(state: GameState, ctx: EngineCtx, compaction: number): string | null {
  // THE THIN SEAM (challenge) seals every drop, this one included.
  if (sealed(state, 'sealDrops')) return null;
  for (const gate of deepGatesFor(currentShell(state).id)) {
    if (compaction < gate.at) continue;
    // SETTLE (the Soil fork's packed side) improves the answer at whatever gate
    // you are standing on. It NEVER opens a gate you have not reached — the
    // `continue` above is untouched — so it changes what you get, not where.
    if (Math.random() >= Math.min(1, gate.chance * settleMult(state))) return null;
    applyDrop(state, ctx, {
      kind: 'material',
      materialId: gate.materialId,
      purity: 40 + Math.floor(Math.random() * 45),
    });
    return gate.materialId;
  }
  return null;
}

/**
 * THE COLLAPSE TAKES THE WORK BACK. Called from the reset that already existed
 * (collapseSys / breach / pressure) rather than being a reset of its own.
 */
/**
 * `floor` is HOLD (the Roots fork's packed side): compaction the fall leaves
 * behind. Zero everywhere except the Collapse — a Breach is a new world and a
 * flood is the rock going with it, and neither is a thing your shop can argue
 * with.
 */
export function resetCompaction(state: GameState, floor = 0): void {
  const keep = Math.max(0, Math.min(MAX_COMPACTION, Math.floor(floor)));
  state.face.compaction = new Array<number>(state.face.cells.length).fill(keep);
}

/** Called by applyFieldSize: a wider grid renumbers every row, so compaction is
 *  remapped by COORDINATE like the pockets. An index copy would slide the whole
 *  board sideways one cell per row. */
export function remapCompaction(
  state: GameState, w: number, h: number, remap: Map<number, number>,
): void {
  const comp = new Array<number>(w * h).fill(0);
  const old = state.face.compaction;
  for (const [from, to] of remap) {
    if (old?.[from] !== undefined) comp[to] = old[from]!;
  }
  state.face.compaction = comp;
}
