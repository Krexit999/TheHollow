/**
 * THE ALLOY CRUCIBLE — Ferrite's craft-system, registered through the
 * Phase 2 CraftSystem interface with zero changes to that interface.
 *
 * Pour metals (currencies) in ratios over ONE Ferrite-ore catalyst from the
 * inventory; the catalyst's purity seeds the alloy (Phase 3 purity rule).
 * A miss returns half the metals and keeps the catalyst. Duplicates fuse
 * upward (rank 1-5). Discovered alloys are patterns, bindable into tier IV+
 * tool alloy slots.
 */
import { D } from '../../decimal';
import { registerCraftSystem, type CodexEntry, type CraftSystem } from '../../craft';
import type { ModifierCache } from '../../modifiers';
import { registerModifier } from '../../modifiers';
import { getCurrency, spendCurrency, addCurrency } from '../../resources';
import type { ActionResult, EngineCtx, GameState } from '../../types';
import { materialDef } from '../../materials';
import { consumeMaterial, equippedTool, materialCount, purityMult } from '../../systems/forge';
import { transmuteUnlocked } from '../../systems/refinery';
import { masteryLevel } from '../../systems/mastery';
import { grantXP } from '../../systems/xp';
import {
  ALLOY_DEFS,
  alloyDef,
  matchAlloy,
  METALS,
  normalizeRatio,
  ratioDistance,
} from './alloys';

export const POUR_UNIT = 20; // currency per ratio point
export const MISS_REFUND = 0.5;
export const MAX_ALLOY_RANK = 5;
export const CRUCIBLE_MASTERY = 2;
export const CRUCIBLE_PASSIVE_RANK_SEC = 1200; // 20 min
export const CRUCIBLE_PASSIVE_RANK_CAP = 20;

export function defaultCrucibleState(): GameState['crucible'] {
  return {
    discovered: [],
    ranks: {},
    purities: {},
    pours: 0,
    fails: 0,
    passiveRank: 0,
    passiveProgressSec: 0,
    lastHint: null,
  };
}

export function crucibleUnlocked(state: GameState): boolean {
  return state.shell.breachCount >= 1 && masteryLevel(state, 'ferrite') >= CRUCIBLE_MASTERY;
}

/** rank 1-5 -> x1 .. x2 effect. */
export function rankMult(rank: number): number {
  return 1 + 0.25 * (rank - 1);
}

/** The live percentage an alloy contributes when bound. */
export function alloyLivePct(state: GameState, id: string): number {
  const def = alloyDef(id);
  const purity = state.crucible.purities[id] ?? 50;
  const rank = state.crucible.ranks[id] ?? 1;
  return def.basePct * purityMult(purity) * rankMult(rank);
}

function updateHint(state: GameState, lastPour: number[]): void {
  const norm = normalizeRatio(lastPour);
  if (!norm) return;
  let best: { def: (typeof ALLOY_DEFS)[number]; dist: number } | null = null;
  for (const def of ALLOY_DEFS) {
    if (state.crucible.discovered.includes(def.id)) continue;
    const dist = ratioDistance(norm, def.ratio);
    if (!best || dist < best.dist) best = { def, dist };
  }
  if (!best) {
    state.crucible.lastHint = 'The margins are clean. Sixty pours, sixty answers.';
    return;
  }
  // Point at the largest single difference — a direction, not an answer.
  let idx = 0;
  let delta = 0;
  best.def.ratio.forEach((v, i) => {
    const d = v - (norm[i] ?? 0);
    if (Math.abs(d) > Math.abs(delta)) {
      delta = d;
      idx = i;
    }
  });
  const metal = METALS[idx]!;
  state.crucible.lastHint =
    delta === 0
      ? 'Close. The Codex margin suggests the same metals in a different proportion.'
      : `The Codex margin notes a blend ${delta > 0 ? 'richer' : 'leaner'} in ${metal[0]!.toUpperCase() + metal.slice(1)}.`;
}

export function pourAlloy(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  amounts: number[],
  catalystId: string,
): ActionResult {
  if (!crucibleUnlocked(state)) return { ok: false, reason: 'The Crucible is cold' };
  const clean = [0, 1, 2, 3, 4].map((i) => Math.max(0, Math.min(6, Math.floor(amounts[i] ?? 0))));
  const sum = clean.reduce((a, b) => a + b, 0);
  if (sum < 2) return { ok: false, reason: 'A pour needs at least two measures' };

  const catalyst = materialDef(catalystId);
  if (catalyst.shellId !== 'ferrite') {
    return { ok: false, reason: 'The Crucible only accepts Ferrite ore as catalyst' };
  }
  if (materialCount(state, catalystId) < 1) return { ok: false, reason: 'No catalyst held' };

  // THE EXPORT SPINE (Part B): every pour burns one Kilnflux — Loam's export,
  // the powder that makes the metals agree to melt. The bill starts exactly
  // when the player can pay it: transmutation (which fires the flux) unlocks
  // at Ferrite Mastery 6, so earlier pours are the Crucible teaching itself.
  // No softlock by construction — and Serra sells flux from her ferrite
  // arrival on, so the fallback predates the toll as well.
  const wantsFlux = transmuteUnlocked(state);
  if (wantsFlux && materialCount(state, 'kilnflux') < 1) {
    return { ok: false, reason: 'A pour wants 1 Kilnflux — fire it at the Refinery (The Kiln Firing) or buy it from Serra' };
  }

  // Full metals up front.
  for (let i = 0; i < 5; i++) {
    if (clean[i]! > 0 && getCurrency(state, METALS[i]!).lt(clean[i]! * POUR_UNIT)) {
      return { ok: false, reason: `Not enough ${METALS[i]!}` };
    }
  }
  for (let i = 0; i < 5; i++) {
    if (clean[i]! > 0) spendCurrency(state, METALS[i]!, D(clean[i]! * POUR_UNIT));
  }
  // The flux burns whether the pour hits or misses — it made the melt happen.
  if (wantsFlux) consumeMaterial(state, 'kilnflux', 1);

  state.crucible.pours += 1;
  const match = matchAlloy(clean);

  if (!match) {
    // Slag: half the metals come back; the catalyst survives the mess.
    for (let i = 0; i < 5; i++) {
      if (clean[i]! > 0) addCurrency(state, METALS[i]!, D(clean[i]! * POUR_UNIT * MISS_REFUND));
    }
    state.crucible.fails += 1;
    updateHint(state, clean);
    ctx.emit({ type: 'pourFailed', refund: `${MISS_REFUND * 100}%` });
    return { ok: true, data: { result: 'slag', hint: state.crucible.lastHint } };
  }

  const purity = consumeMaterial(state, catalystId, 1)!;
  const cru = state.crucible;
  if (!cru.discovered.includes(match.id)) {
    cru.discovered.push(match.id);
    cru.ranks[match.id] = 1;
    cru.purities[match.id] = Math.round(purity);
    grantXP(state, mods, ctx, D(60));
    ctx.emit({ type: 'alloyDiscovered', id: match.id, purity: Math.round(purity) });
  } else {
    const rank = Math.min(MAX_ALLOY_RANK, (cru.ranks[match.id] ?? 1) + 1);
    cru.ranks[match.id] = rank;
    cru.purities[match.id] = Math.max(cru.purities[match.id] ?? 0, Math.round(purity));
    grantXP(state, mods, ctx, D(20));
    ctx.emit({ type: 'alloyFused', id: match.id, rank });
  }
  updateHint(state, clean);
  ctx.dirty();
  return { ok: true, data: { result: match.id, hint: cru.lastHint } };
}

// ---------------------------------------------------------------------------
// CraftSystem registration — the Phase 2 interface, untouched.
// ---------------------------------------------------------------------------

export const crucibleSystem: CraftSystem = {
  id: 'crucible',
  name: 'The Alloy Crucible',
  currencyId: 'ingot',

  unlocked: crucibleUnlocked,

  ensureState: (state) => {
    state.crucible ??= defaultCrucibleState();
  },

  tick: (state, _mods, ctx, dt) => {
    const cru = state.crucible;
    if (cru.passiveRank >= CRUCIBLE_PASSIVE_RANK_CAP) return;
    cru.passiveProgressSec += dt;
    while (cru.passiveProgressSec >= CRUCIBLE_PASSIVE_RANK_SEC && cru.passiveRank < CRUCIBLE_PASSIVE_RANK_CAP) {
      cru.passiveProgressSec -= CRUCIBLE_PASSIVE_RANK_SEC;
      cru.passiveRank += 1;
      ctx.dirty();
    }
  },

  offlineTick: (state, mods, ctx, seconds, efficiency) => {
    crucibleSystem.tick(state, mods, ctx, seconds * efficiency);
  },

  passiveRank: (state) => state.crucible.passiveRank,

  codex: (state): CodexEntry[] =>
    state.crucible.discovered.map((id) => {
      const def = alloyDef(id);
      const rank = state.crucible.ranks[id] ?? 1;
      const pct = alloyLivePct(state, id);
      return {
        id,
        name: `${def.name}${rank > 1 ? ` ★${rank}` : ''}`,
        flavor: def.flavor ?? `${def.ratio.map((v, i) => (v ? `${v} ${METALS[i]}` : null)).filter(Boolean).join(' : ')}.`,
        effect: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}% ${def.bucket} when bound to the held tool`,
        active: equippedTool(state).alloys.includes(id),
        kind: 'recipe',
      };
    }),
};

export function registerCrucible(): void {
  registerCraftSystem(crucibleSystem);
  // One modifier per bucket the alloy table touches, reading the held tool.
  const buckets = [...new Set(ALLOY_DEFS.map((a) => a.bucket))];
  for (const bucket of buckets) {
    const additive = bucket === 'offlineEffAdd';
    registerModifier({
      id: `alloy.${bucket}`,
      label: 'Bound alloys',
      bucket,
      value: (s) => {
        let v = additive ? 0 : 1;
        for (const id of equippedTool(s).alloys) {
          if (!id) continue;
          const def = alloyDef(id);
          if (def.bucket !== bucket) continue;
          const pct = alloyLivePct(s, id);
          if (additive) v += pct / 100;
          else v *= Math.max(0.4, 1 + pct / 100);
        }
        return v;
      },
    });
  }
  registerModifier({
    id: 'crucible.passiveRank',
    label: 'Crucible: Temper (Passive Rank)',
    bucket: 'dustYield',
    value: (s) => 1 + 0.008 * s.crucible.passiveRank,
  });
}
