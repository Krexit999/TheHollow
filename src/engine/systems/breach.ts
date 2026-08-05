/**
 * THE BREACH — the second reset layer and the game's largest beat. Reaching
 * a shell's floor lets you fall through it. You lose Cores, the Core tree,
 * and every shell system; you keep what is truly yours: depth records, the
 * Lattice, the Delver, achievements, materials, tools, gems — and, from any
 * shell that HAS one, its signature mechanic, carried forever.
 *
 *   Echoes = floor(3 * (CoresEarnedThisBreach / 200)^0.6)   (divisor re-rated A.44)
 *
 * (Stale-comment fix, Part B: Loam DOES have a signature — Seepage was
 * promoted in Phase 5 and carries down like any other. The registry is the
 * truth; this header once said otherwise.)
 */
import { D } from '../decimal';
import type { ModifierCache } from '../modifiers';
import { addCurrency, allCurrencies } from '../resources';
import { allUpgrades } from '../upgrades';
import type { ActionResult, EngineCtx, GameState } from '../types';
import { echoesForCores } from '../prestigeMath';
import { currentShell, nextShell } from '../shells';
import { runFaceReset } from '../signatures';
import { applyFieldSize, cellCap, dpsMax } from './face';
import { logScar, resetShaftRun, surfaceCaches } from './shaftSys';
import { addToolMark } from './heirloom';
import { faceWhole } from './absence';
import { keystoneSatisfied } from './keystones';
import { grantXP } from './xp';
import { clearOres } from './ores';
import { resetCompaction } from './compaction';
import { START_H, START_W } from '../state';
import { keptLaw } from '../laws';
import { bands, driftDepth } from './shoring';
import { ensureRoll } from './roll';

/** Upgrades that are cross-shell infrastructure and survive the fall. */
const SURVIVES_BREACH = new Set(['forgeBuild']);

export function canBreach(state: GameState): boolean {
  return (
    state.depth >= currentShell(state).floorDepth &&
    nextShell(state) !== null &&
    // The Floor WARDEN gate went with `combat/*` at A.7x — a wall with no door
    // dropped rather than left standing. Wardens did NOT come back with THE
    // STANDOFF (§27 ships one enemy, at hazard stations, optional), so there is
    // still nothing to fight at a floor and this stays a keystone gate.
    // THE KEYSTONE (Part B): the floor must be shored — by the shell's own
    // system, or the Guild's slow haul. No def, no gate (stubs III–VII).
    keystoneSatisfied(state) &&
    // The Hollow's own gate: the face must be WHOLE before the Core opens.
    (currentShell(state).id !== 'hollow' || faceWhole(state))
  );
}

export function breachEchoPreview(state: GameState) {
  return echoesForCores(state.shell.coresEarnedThisBreach);
}

export function doBreach(state: GameState, mods: ModifierCache, ctx: EngineCtx): ActionResult {
  if (!canBreach(state)) {
    // Name the actual blocker — a gate that won't say its name is a wall.
    // (The Hollow's face gate had no branch here, so it reported the floor and
    // read as "Reach the floor first" while standing ON the floor.)
    const shell = currentShell(state);
    const atFloor = state.depth >= shell.floorDepth;
    if (atFloor && !keystoneSatisfied(state)) {
      return { ok: false, reason: 'The floor is open but unshored — set the keystone first.' };
    }
    if (atFloor && shell.id === 'hollow' && !faceWhole(state)) {
      const have = state.hollow.rebuilt.length;
      const need = state.face.cells.length;
      return {
        ok: false,
        reason: `The face is not whole — ${have} of ${need} cells remember being rock. The Core does not open onto an absence.`,
      };
    }
    if (atFloor && nextShell(state) === null) {
      return { ok: false, reason: 'There is nothing below this. The way on is a Recursion.' };
    }
    return { ok: false, reason: 'The floor holds. Descend to it first.' };
  }
  const from = currentShell(state);
  const to = nextShell(state)!;
  const echoes = echoesForCores(state.shell.coresEarnedThisBreach);
  // Mark the floor you broke through — the deepest scar this shell will keep.
  logScar(state, ctx, 'breach', from.floorDepth);
  // Empty the caches back to the Hold before the shell resets — a Breach never
  // strands a cure. (The rail and lift are per-shell records; they simply stay.)
  surfaceCaches(state, ctx, from.id);

  // TWIN DESCENT (law): snapshot the pace of the world being left — a
  // quarter of its ceiling, in its own coin, forever (until the next fall).
  state.recursion.leftBehind = {
    chipCurrencyId: from.chipCurrencyId,
    ratePerSec: dpsMax(state, mods).mul(0.25),
  };

  // The signature of the shell you fall THROUGH is yours forever.
  if (from.signatureId && !state.shell.signatures.includes(from.signatureId)) {
    state.shell.signatures.push(from.signatureId);
  }

  // Everything shell-local washes away — currencies of every tier marked
  // resetsOnCollapse (shell-local), plus Cores and the Core tree.
  for (const cur of allCurrencies()) {
    if (cur.resetsOnCollapse) state.currencies[cur.id] = D(0);
  }
  state.currencies['core'] = D(0);
  state.collapse.nodes = {};

  // Every scaffold upgrade resets; cross-shell infrastructure survives.
  for (const def of allUpgrades()) {
    if (!SURVIVES_BREACH.has(def.id)) state.upgrades[def.id] = 0;
  }
  state.kiln = { built: false, heat: 0, feeding: false, progress: D(0) };
  // The BAY is scaffolding and goes with the rest of it. What you LEARNED
  // about drill alloys does not: knowing a mix makes an ability is knowledge,
  // and knowledge crosses a Breach the way every other codex does. The alloy
  // itself was physical and is gone — re-pour it from this world's materials
  // (every signature is forgeable in every shell, which is the reach rule).
  state.drills = {
    bayBuilt: false, units: [], alloys: state.drills.alloys ?? [],
    huntOres: state.drills.huntOres ?? true,
  };
  // NEW WORLD, NEW ROCK. Whatever pockets were in the old face went with it —
  // but the RECORD of which types you have opened is knowledge, and crosses
  // like the alloys above. The next shell will seed its own within the minute
  // (the drought floor guarantees it), so nothing strands here.
  clearOres(state);
  state.assay.active = null;
  state.assay.boostChips = 0;
  state.assay.reportDepth = null;

  /*
   * THE LONG FALL (§20.2 #2) — the reward leg, blocked since A.86 and measured
   * before it was built.
   *
   * THE PREMISE THREE PASSES QUOTED WAS HALF WRONG. "A drift dies at the
   * Breach" is not what the code does: `roll.shored` is never cleared, so the
   * old station ids survive verbatim. What dies is the BENEFIT — `bands()`
   * reads the CURRENT shell's Roll, so a Loam station id in the list is a name
   * the Ferrite ladder has never heard of, and `driftDepth` breaks on the first
   * band and returns zero. The data lived; the drift did not.
   *
   * So the reward cannot be "stop wiping it" — nothing was wiping it. It has to
   * TRANSLATE, which is what §20.2's promise ("drifts survive Breach") means
   * once you know that the two shells do not share a ladder. The fall you had
   * is carried as a FRACTION OF THE FLOOR and re-timbered onto the new shell's
   * own bands. Ninety of Loam's hundred and fifty is three-fifths of the way
   * down; three-fifths of Ferrite is where you come in.
   *
   * WHAT MAKES IT BOUNDED. It carries `driftDepth` — the leading UNBROKEN
   * chain — and never the stranded bands above it, so it can only ever hand
   * back ground that was actually walkable. It is measured against the floor
   * you just broke, so it cannot compound: a fifth of a shell is a fifth of
   * every shell after it, never more. And `shaftPeak` already refuses to pay
   * Cores on drift ground, so the fall it hands you is reach, never income.
   */
  const carried = keptLaw(state, 'longfall') ? driftDepth(state) : 0;
  const carriedShare = carried > 0 ? Math.min(1, carried / from.floorDepth) : 0;

  if (echoes.gt(0)) addCurrency(state, 'echo', echoes);
  state.shell.coresEarnedThisBreach = D(0);
  state.shell.current = to.id;
  state.shell.breachCount += 1;
  state.depth = 0;
  resetShaftRun(state); // the new shell's column starts unbroken (its rail is its own)
  state.maxDepthRecord = state.depthRecords[to.id] ?? 0;

  // ...and the drift is re-timbered on the new ladder. AFTER the shell switch,
  // because `bands()` is only the new shell's once `shell.current` has moved.
  if (carriedShare > 0) {
    const reach = carriedShare * to.floorDepth;
    ensureRoll(state);
    const shored = (state.roll!.shored ??= []);
    let carriedBands = 0;
    for (const band of bands(state)) {
      if (band.to > reach) break;              // the chain stops where the fall did
      if (!shored.includes(band.def.id)) shored.push(band.def.id);
      carriedBands += 1;
    }
    if (carriedBands > 0) {
      ctx.emit({ type: 'shored', stationId: 'thelongfall', depth: driftDepth(state) });
    }
  }

  // A fresh face under different physics.
  state.face.w = START_W;
  state.face.h = START_H;
  ctx.dirty();
  applyFieldSize(state, mods);
  state.face.cells = new Array(state.face.w * state.face.h).fill(cellCap(state, mods));
  runFaceReset(state, 'breach');
  resetCompaction(state); // a fresh face is unworked rock

  addToolMark(state, 'breach'); // the tool carried through — a mark it keeps (heirloom)
  grantXP(state, mods, ctx, D(500));
  ctx.emit({ type: 'breach', from: from.id, to: to.id, echoes });
  return { ok: true, data: { to: to.id, echoes } };
}

// ---------------------------------------------------------------------------
// Resonant Memory — the Echo sink that strengthens carried signatures.
// ---------------------------------------------------------------------------

export function resonantMemoryCost(state: GameState) {
  return D(1 + state.shell.resonantMemory);
}

export function buyResonantMemory(state: GameState, ctx: EngineCtx): ActionResult {
  const cost = resonantMemoryCost(state);
  if (!(state.currencies['echo'] ?? D(0)).gte(cost)) {
    return { ok: false, reason: 'Not enough Echoes' };
  }
  state.currencies['echo'] = state.currencies['echo']!.sub(cost);
  state.shell.resonantMemory += 1;
  ctx.dirty();
  return { ok: true, data: { level: state.shell.resonantMemory } };
}
