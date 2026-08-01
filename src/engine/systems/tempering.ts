/**
 * TEMPERING — the second axis of tool modification, and deliberately a
 * different VERB from the two that already exist.
 *
 *   RUNES are a positional grammar: sequence and adjacency, order is meaning.
 *   ALLOYS are accumulation: slot three in, add three effects.
 *   A TEMPER IS A CONDITION. It pays when your situation matches it and
 *   sits quiet when it does not.
 *
 * That distinction is the whole design. A third flat stat source would have
 * been runes with different art; what this adds instead is a reason to look at
 * WHERE YOU ARE — which shell, how hot the shaft is, what the weather is doing
 * — and match the tool to it. It is the only system in the game that rewards
 * changing your mind about a tool you already finished.
 *
 * Which is why re-tempering is cheap and expected. You do not re-temper because
 * you rolled badly; you re-temper because you moved. NO TREADMILL: there is no
 * roll here at all. A temper is chosen, not granted.
 *
 * PILLAR 2: every temper lands in a modifier bucket, so the ceiling still holds
 * and the breakdown popover still explains it.
 */
import { D } from '../decimal';
import type { ActionResult, EngineCtx, GameState } from '../types';
import { registerModifier, foldBonus, type Bucket } from '../modifiers';
import { spendCurrency } from '../resources';
import { convCurrencyId, currentShell } from '../shells';
import { consumeMaterial, materialCount, equippedTool } from './forge';
import { affinityLevel } from './affinity';
import { masteryLevel } from './mastery';

/** The quench trough opens with the Refinery's deeper half. */
export const TEMPER_MASTERY = 6;
/** Every quench wants ash plus the medium's own material. */
export const ASH_COST = 2;

export function temperingUnlocked(state: GameState): boolean {
  return masteryLevel(state, 'ferrite') >= TEMPER_MASTERY;
}

export interface TemperDef {
  id: string;
  name: string;
  /** The material that IS the medium, beyond the common ash. */
  medium: string;
  mediumCost: number;
  flavor: string;
  /** Said plainly on the card — the player must be able to plan around it. */
  when: string;
  /** Is the condition met right now? */
  active: (s: GameState) => boolean;
  bucket: Bucket;
  /** Paid while the condition holds. */
  bonus: number;
  /**
   * Paid always, condition or not. Small, and deliberately non-zero: a tool
   * tempered for a shell you have left should be weaker, never dead.
   */
  idle: number;
}

const wearing = (s: GameState, sig: string) => s.shell.signatures.includes(sig);
const inShell = (s: GameState, ...ids: string[]) => ids.includes(s.shell.current);

/**
 * Six media. The conditions are chosen to be genuinely different SHAPES of
 * situation — a place, a live gauge, a carried signature, and a weather state
 * — so the choice is never "which shell am I in" six times over.
 *
 * Lumen and Frost are deliberately INVERSES of each other. A player who plans
 * around eventful weather and one who plans around quiet weather should reach
 * for different tools, and neither should be wrong.
 */
export const TEMPERS: TemperDef[] = [
  {
    id: 'sap', name: 'Sap-quenched', medium: 'temperash', mediumCost: 0,
    flavor: 'Cooled in green sap that seals as it sets. The haft keeps a faint give, like a living branch.',
    when: 'While you carry Growth, or stand in Verdance.',
    active: (s) => wearing(s, 'growth') || inShell(s, 'verdance'),
    bucket: 'regen', bonus: 0.18, idle: 0.03,
  },
  {
    id: 'ember', name: 'Ember-quenched', medium: 'charstone', mediumCost: 3,
    flavor: 'Never actually cooled. Quenched in embers and pulled while still complaining about it.',
    when: 'While the shaft runs hot — heat above 50.',
    active: (s) => s.pressure.heat >= 50,
    bucket: 'dustYield', bonus: 0.22, idle: 0.04,
  },
  {
    id: 'void', name: 'Void-quenched', medium: 'voidresidue', mediumCost: 2,
    flavor: 'Cooled in nothing at all, which took some arranging. It is very slightly lighter than it should be.',
    when: 'While you carry Absence, or stand in the Hollow or Aleph.',
    active: (s) => wearing(s, 'absence') || inShell(s, 'hollow', 'aleph'),
    bucket: 'motifGain', bonus: 0.3, idle: 0.05,
  },
  {
    id: 'lumen', name: 'Lumen-quenched', medium: 'lumenshard', mediumCost: 3,
    flavor: 'Quenched in light held still long enough to be a liquid. Glassmere does this on purpose.',
    when: 'While you carry Refraction, or stand in Glassmere.',
    active: (s) => wearing(s, 'refraction') || inShell(s, 'glassmere'),
    bucket: 'dropRate', bonus: 0.25, idle: 0.04,
  },
  {
    id: 'frost', name: 'Frost-quenched', medium: 'frostsand', mediumCost: 3,
    flavor: 'The slow cool. Takes a full day and cannot be hurried, which is most of the point.',
    when: 'While you are nowhere near a working furnace — outside Cinder and the shells past it.',
    active: (s) => !inShell(s, 'cinder', 'hollow', 'aleph'),
    bucket: 'brickYield', bonus: 0.2, idle: 0.04,
  },
  {
    id: 'rime', name: 'Rime-quenched', medium: 'truesilver', mediumCost: 2,
    flavor: 'Cooled in the rime that forms on a shaft wall below the half-depth. Rare, and it knows.',
    when: 'While you are working the deep half of a shell.',
    active: (s) => s.depth >= currentShell(s).floorDepth * 0.5,
    bucket: 'drillPower', bonus: 0.22, idle: 0.04,
  },
];

export const TEMPER_BY_ID = new Map(TEMPERS.map((t) => [t.id, t]));

/** The temper on the tool in your hands, if any. */
export function currentTemper(state: GameState): TemperDef | null {
  const id = equippedTool(state).temper;
  return id ? TEMPER_BY_ID.get(id) ?? null : null;
}

/** What the equipped tool's temper is worth into a bucket right now. */
export function temperBonus(state: GameState, bucket: Bucket): number {
  const t = currentTemper(state);
  if (!t || t.bucket !== bucket) return 0;
  let value = t.active(state) ? t.bonus : t.idle;
  // DEEPER TEMPERING (v22): a temper is not just a condition now — it RESONATES with
  // the tool holding it. A tool that has earned affinity for this very shell holds its
  // quench better, scaling the ACTIVE bonus by up to +40%. This is the interaction the
  // ledger asked for — temper × the shell you're in × the history in your hand —
  // and it stays in the modifier bucket, so the ceiling and the breakdown both hold.
  if (t.active(state)) {
    const aff = affinityLevel(equippedTool(state), currentShell(state).id);
    value *= 1 + 0.4 * aff;
  }
  return value;
}

export function temperCost(state: GameState, temperId: string): { conv: number; ash: number; medium: number } | null {
  const def = TEMPER_BY_ID.get(temperId);
  if (!def) return null;
  const tool = equippedTool(state);
  // Re-tempering is CHEAPER than the first quench: this is a decision you are
  // meant to revisit, not a commitment you pay for twice.
  const again = tool.temper != null;
  return {
    conv: Math.round((40 + tool.tier * 12) * (again ? 0.6 : 1)),
    ash: ASH_COST,
    medium: def.mediumCost,
  };
}

export function temperTool(state: GameState, ctx: EngineCtx, temperId: string): ActionResult {
  if (!temperingUnlocked(state)) return { ok: false, reason: 'The quench trough is dry' };
  const def = TEMPER_BY_ID.get(temperId);
  if (!def) return { ok: false, reason: 'No such medium' };
  const tool = equippedTool(state);
  if (tool.temper === temperId) return { ok: false, reason: 'It is already cooled in that' };

  const cost = temperCost(state, temperId)!;
  if (materialCount(state, 'temperash') < cost.ash) {
    return { ok: false, reason: `${cost.ash} Temper Ash to line the trough` };
  }
  if (cost.medium > 0 && materialCount(state, def.medium) < cost.medium) {
    return { ok: false, reason: `${cost.medium} ${def.medium} for the quench` };
  }
  if (!spendCurrency(state, convCurrencyId(state), D(cost.conv))) {
    return { ok: false, reason: `${cost.conv} to fire the trough` };
  }

  consumeMaterial(state, 'temperash', cost.ash);
  if (cost.medium > 0) consumeMaterial(state, def.medium, cost.medium);

  const previous = tool.temper ?? null;
  tool.temper = temperId;
  if (!state.forge.tempersUsed.includes(temperId)) state.forge.tempersUsed.push(temperId);

  ctx.emit({ type: 'tempered', temperId, toolName: tool.name });
  ctx.dirty();
  return { ok: true, data: { previous, temperId } };
}

export function registerTemperModifiers(): void {
  const buckets = new Set(TEMPERS.map((t) => t.bucket));
  for (const bucket of buckets) {
    registerModifier({
      id: `temper.${bucket}`,
      label: 'Temper',
      bucket,
      value: (s) => foldBonus(bucket, temperBonus(s, bucket)),
    });
  }
}
