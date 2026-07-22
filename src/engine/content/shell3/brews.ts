/**
 * BREWING — alchemy from Sap, Spore, Resin. Twelve brews found by
 * EXPERIMENTING with ratios (the Crucible's discovery standard: misses
 * refund half and leave a margin hint pointing at the nearest undiscovered
 * blend's largest difference).
 *
 * SPIKES, NOT SUSTAINS — enforced by economy, not lockout timers: durations
 * are 60-180s, brews never stack, and a dose costs ten-odd minutes of
 * Resin income, so unbuffed is the normal state and a brew is a decision.
 * The sim measures uptime; if it creeps, costs tighten — no cooldowns.
 */
import { D } from '../../decimal';
import type { ActionResult, EngineCtx, GameState } from '../../types';
import { getCurrency, spendCurrency } from '../../resources';
import { registerModifier, type Bucket } from '../../modifiers';
import { masteryLevel } from '../../systems/mastery';

export const BREW_UNIT = { sap: 12, spore: 30, resin: 5 };

export interface BrewDef {
  id: string;
  name: string;
  /** Ratio in lowest terms [sap, spore, resin]. */
  ratio: [number, number, number];
  durationSec: number;
  mods: Array<{ bucket: Bucket; value: number }>;
  /** Combat faces (Ironblood, Warden's Milk) read by combat.ts. */
  combat?: { strikeMult?: number; hp?: number; regen?: number };
  /** Sable's Draught: the seer flag — UI reveals ahead. */
  seer?: boolean;
  flavor: string;
}

const B = (
  id: string, name: string, ratio: [number, number, number], durationSec: number,
  mods: BrewDef['mods'], flavor: string, extra?: Partial<BrewDef>,
): BrewDef => ({ id, name, ratio, durationSec, mods, flavor, ...extra });

export const BREWS: BrewDef[] = [
  B('longlight', 'Longlight', [2, 1, 0], 90, [{ bucket: 'regen', value: 2 }],
    'The lamp behind your eyes trims itself. The rock refills like it\'s glad to.'),
  B('ironblood', 'Ironblood', [1, 2, 1], 120, [{ bucket: 'strikePower', value: 1.5 }],
    'Tastes of nails and certainty.', { combat: { strikeMult: 1.5, hp: 20 } }),
  B('sablesDraught', "Sable's Draught", [1, 1, 2], 90,
    [{ bucket: 'dropRate', value: 1.5 }],
    'Her own recipe, from a margin note. You see through rock one screen ahead, and wish you didn\'t.',
    { seer: true }),
  B('quickroot', 'Quickroot', [3, 1, 0], 60, [{ bucket: 'descendCost', value: 0.7 }],
    'Your legs get opinions about DOWN.'),
  B('mothswake', "Moth's-Wake", [0, 2, 1], 120, [{ bucket: 'motifGain', value: 2 }],
    'The board hums along before you set the stone.'),
  B('hawksblood', "Hawk's-Blood", [1, 3, 0], 120, [{ bucket: 'xpGain', value: 1.75 }],
    'Everything is a lesson. EVERYTHING.'),
  B('emberdraught', 'Emberdraught', [2, 0, 1], 120, [{ bucket: 'kilnRate', value: 1.6 }],
    'The converter drinks with you.'),
  B('greenmantle', 'Greenmantle', [1, 2, 2], 180, [{ bucket: 'dustYield', value: 1.15 }],
    'Vines take you for one of theirs. Growth hurries where you stand.'),
  B('stormtongue', 'Stormtongue', [0, 1, 2], 90, [{ bucket: 'chainPower', value: 1.6 }],
    'Static on the teeth. The rails answer questions you haven\'t asked.'),
  B('forgefire', 'Forgefire', [3, 0, 2], 120, [{ bucket: 'brickYield', value: 1.5 }],
    'The pour runs eager and the slag apologizes.'),
  B('wardensmilk', "Warden's Milk", [2, 2, 1], 120, [],
    'Thick, pale, patient. Wounds close like doors.', { combat: { regen: 3, hp: 10 } }),
  B('goldrender', 'Goldrender', [4, 1, 1], 60, [{ bucket: 'dustYield', value: 1.4 }],
    'For one held breath, everything is worth more.'),
];

export const BREW_BY_ID = new Map(BREWS.map((b) => [b.id, b]));

export function brewingUnlocked(state: GameState): boolean {
  return masteryLevel(state, 'verdance') >= 6;
}

function normalize(r: [number, number, number]): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = r.reduce((a, b) => gcd(a, b), 0) || 1;
  return r.map((x) => x / g).join(':');
}

export function matchBrew(sap: number, spore: number, resin: number): BrewDef | null {
  const key = normalize([sap, spore, resin]);
  return BREWS.find((b) => normalize(b.ratio) === key) ?? null;
}

/** Greenmantle reads as a growth hurry too. */
export function brewGrowthMult(state: GameState): number {
  return activeBrew(state)?.id === 'greenmantle' ? 2 : 1;
}

export function activeBrew(state: GameState): BrewDef | null {
  const a = state.brewing.active;
  if (!a) return null;
  if (state.stats.playTimeSec >= a.endsAtSec) return null;
  return BREW_BY_ID.get(a.brewId) ?? null;
}

export function brewCombat(state: GameState): { strikeMult: number; hp: number; regen: number } {
  const b = activeBrew(state);
  return {
    strikeMult: b?.combat?.strikeMult ?? 1,
    hp: b?.combat?.hp ?? 0,
    regen: b?.combat?.regen ?? 0,
  };
}

export function brewExperiment(
  state: GameState,
  ctx: EngineCtx,
  sap: number,
  spore: number,
  resin: number,
): ActionResult {
  if (!brewingUnlocked(state)) return { ok: false, reason: 'The still wants Verdance Mastery 6' };
  const units = sap + spore + resin;
  if (units < 2 || units > 12) return { ok: false, reason: 'Two to twelve measures' };
  const costSap = D(sap * BREW_UNIT.sap);
  const costSpore = D(spore * BREW_UNIT.spore);
  const costResin = D(resin * BREW_UNIT.resin);
  if (getCurrency(state, 'sap').lt(costSap) || getCurrency(state, 'spore').lt(costSpore) || getCurrency(state, 'resin').lt(costResin)) {
    return { ok: false, reason: 'Short of measures' };
  }
  spendCurrency(state, 'sap', costSap);
  spendCurrency(state, 'spore', costSpore);
  spendCurrency(state, 'resin', costResin);
  state.brewing.attempts += 1;
  const hit = matchBrew(sap, spore, resin);
  if (hit) {
    const first = !state.brewing.discovered.includes(hit.id);
    if (first) state.brewing.discovered.push(hit.id);
    state.brewing.doses[hit.id] = (state.brewing.doses[hit.id] ?? 0) + (first ? 2 : 1);
    state.brewing.lastHint = null;
    ctx.dirty();
    if (first) ctx.emit({ type: 'brewDiscovered', id: hit.id });
    return { ok: true, data: { result: hit.id, first } };
  }
  // A miss: half the measures drain back, and the still mutters a hint.
  state.brewing.fails += 1;
  const refund = (id: string, amt: number) => {
    if (amt > 0) state.currencies[id] = getCurrency(state, id).add(D(Math.floor(amt / 2)));
  };
  refund('sap', sap * BREW_UNIT.sap);
  refund('spore', spore * BREW_UNIT.spore);
  refund('resin', resin * BREW_UNIT.resin);
  const undiscovered = BREWS.filter((b) => !state.brewing.discovered.includes(b.id));
  if (undiscovered.length > 0) {
    let best: BrewDef = undiscovered[0]!;
    let bestDist = Infinity;
    const tried = [sap, spore, resin];
    for (const b of undiscovered) {
      const total = Math.max(1, tried[0]! + tried[1]! + tried[2]!);
      const btotal = b.ratio[0] + b.ratio[1] + b.ratio[2];
      let d = 0;
      for (let i = 0; i < 3; i++) d += Math.abs(tried[i]! / total - b.ratio[i]! / btotal);
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    const names = ['sap', 'spore', 'resin'];
    const total = Math.max(1, sap + spore + resin);
    const btotal = best.ratio[0] + best.ratio[1] + best.ratio[2];
    let worst = 0;
    let worstDiff = -1;
    for (let i = 0; i < 3; i++) {
      const diff = [sap, spore, resin][i]! / total - best.ratio[i]! / btotal;
      if (Math.abs(diff) > worstDiff) {
        worstDiff = Math.abs(diff);
        worst = i;
      }
    }
    const dir = [sap, spore, resin][worst]! / total > best.ratio[worst]! / btotal ? 'less' : 'more';
    state.brewing.lastHint = `The dregs smell almost right — ${dir} ${names[worst]}, perhaps.`;
  }
  ctx.dirty();
  return { ok: true, data: { result: 'dregs' } };
}

export function drinkBrew(state: GameState, ctx: EngineCtx, brewId: string): ActionResult {
  const def = BREW_BY_ID.get(brewId);
  if (!def) return { ok: false, reason: 'No such brew' };
  if ((state.brewing.doses[brewId] ?? 0) < 1) return { ok: false, reason: 'No dose bottled' };
  if (activeBrew(state)) return { ok: false, reason: 'One draught at a time — the body insists' };
  state.brewing.doses[brewId]! -= 1;
  state.brewing.active = { brewId, endsAtSec: state.stats.playTimeSec + def.durationSec };
  state.brewing.drunk += 1;
  ctx.dirty();
  ctx.emit({ type: 'brewDrunk', id: brewId });
  return { ok: true };
}

/** Expiry sweep (guild-tick cadence). */
export function tickBrewing(state: GameState, ctx: EngineCtx): void {
  const a = state.brewing.active;
  if (a && state.stats.playTimeSec >= a.endsAtSec) {
    state.brewing.active = null;
    ctx.dirty();
  }
}

export function registerBrewModifiers(): void {
  for (const b of BREWS) {
    for (const m of b.mods) {
      registerModifier({
        id: `brew.${b.id}.${m.bucket}`,
        label: `${b.name} (brew)`,
        bucket: m.bucket,
        value: (s) => (activeBrew(s)?.id === b.id ? m.value : 1),
      });
    }
  }
}

export function defaultBrewingState(): GameState['brewing'] {
  return { discovered: [], doses: {}, attempts: 0, fails: 0, lastHint: null, active: null, drunk: 0 };
}
