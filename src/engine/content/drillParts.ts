/**
 * DRILL HEADS + BITS (THE FACE CLUSTER, v21) — a drill is CONFIGURED, not merely
 * levelled. A HEAD is an archetype that sets how the drill targets and where its
 * strength leans; a BIT is a material whose TRAITS tune the drill the way tool
 * parts read traits — EDGE sharpens power, CADENCE quickens the strike, HEFT
 * resists wear. Head type × bit material = a drill unlike the one beside it.
 *
 * PILLAR 2: every knob here feeds drillPower/drillSpeed (how fast a drill reaches
 * the regen ceiling) or wear (an upkeep texture). None of it multiplies dust —
 * a configured drill reaches the ceiling sooner, it does not lift it.
 */
import { TRAITS, traitsOf } from '../traits';
import type { DrillBehavior, DrillState } from '../types';
import { purityMult } from '../systems/forge';

export interface DrillHead {
  id: string;
  name: string;
  /** Codex note. */
  note: string;
  /** How it hunts the face — reuses the proven targeting behaviours. */
  behavior: DrillBehavior;
  /** Stat lean, before the bit: power, speed, wear-rate. Balanced around 1. */
  power: number;
  speed: number;
  /** Wear multiplier — a heavy head grinds itself faster. */
  wear: number;
  /**
   * DRAW (A.52) — what this head asks of the shared feed. This is the number
   * that stops "fit the best head to all 24": the good heads are the thirsty
   * ones, and the feed is one budget for the whole bay.
   */
  draw: number;
  /**
   * WHAT ROCK IT WANTS. The head is fitted against the live seam profile, so
   * a head is never simply better — it is better HERE, and here changes as you
   * descend and as the shell's signature rearranges the board.
   */
  likes: { spread: number; cluster: number; hardness: number };
  /** One line of why, for the panel. */
  wants: string;
}

/** Five heads, each a real trade — no strictly-best. The default is the Auger. */
export const DRILL_HEADS: DrillHead[] = [
  {
    id: 'auger', name: 'Auger Head', behavior: 'fullest', power: 1.1, speed: 0.95, wear: 1.0, draw: 1.0,
    note: 'Bores the fullest cell. Steady, patient, unremarkable — and it never lets you down.',
    likes: { spread: 0.35, cluster: 0.5, hardness: 0.5 }, wants: 'a face with one rich cell to bore',
  },
  {
    id: 'harrow', name: 'Harrow Head', behavior: 'sweep', power: 0.9, speed: 1.15, wear: 0.8, draw: 0.85,
    note: 'Sweeps the face in even passes. Kind to itself; kind to the rock.',
    likes: { spread: 0.9, cluster: 0.4, hardness: 0.3 }, wants: 'an even face, softly held',
  },
  {
    id: 'scatter', name: 'Scatter Head', behavior: 'random', power: 0.95, speed: 1.25, wear: 1.35, draw: 1.3,
    note: 'Strikes where it pleases. Fast and cheap and hard on itself.',
    likes: { spread: 0.8, cluster: 0.2, hardness: 0.2 }, wants: 'shallow, scattered rock',
  },
  {
    id: 'seeker', name: 'Seeker Head', behavior: 'chain', power: 1.05, speed: 1.05, wear: 1.15, draw: 1.15,
    note: 'Follows the seam from one cell to its richest neighbour. Clever, hungry, brittle.',
    likes: { spread: 0.5, cluster: 0.9, hardness: 0.5 }, wants: 'rich cells sitting together',
  },
  {
    id: 'maul', name: 'Maul Head', behavior: 'fullest', power: 1.35, speed: 0.75, wear: 1.3, draw: 1.65,
    note: 'A blunt weight on the fullest cell. All force, slow, and it wears like a stone in a boot.',
    likes: { spread: 0.25, cluster: 0.5, hardness: 0.9 }, wants: 'deep, hard, concentrated rock',
  },
];

export function drillHead(id: string | undefined): DrillHead | undefined {
  return id ? DRILL_HEADS.find((h) => h.id === id) : undefined;
}

/** Product of a bit material's traits' factor for a stat (default 1). */
function bitFactor(materialId: string, stat: keyof typeof TRAITS['keen']['factors']): number {
  let v = 1;
  for (const t of traitsOf(materialId)) {
    const f = TRAITS[t].factors[stat];
    if (f !== undefined) v *= f;
  }
  return v;
}

export interface DrillConfig {
  behavior: DrillBehavior;
  powerMult: number;
  speedMult: number;
  /** Multiplier on wear-per-strike (lower is tougher). */
  wearMult: number;
  configured: boolean;
  /** What the BIT alone contributes, 1 when bare. The feed is charged for it. */
  bitLift: number;
}

/**
 * WHAT ONE CHASSIS ASKS OF THE FEED (A.52).
 *
 * Three terms, and each is the thing it sounds like: the head's own appetite,
 * how much bit is on it, and how hard it has been driven. A bare unlevelled
 * drill draws exactly 1, so the opening bay reads as "one drill, one unit" and
 * the number is legible from the first minute.
 */
export function drillDraw(drill: DrillState): number {
  const head = drillHead(drill.head);
  const cfg = drillConfig(drill);
  return (head?.draw ?? 1) * cfg.bitLift * (1 + 0.05 * drill.level);
}

/**
 * The drill's configuration, folding head archetype × bit traits. An unconfigured
 * drill (no head) keeps its legacy `behavior` and neutral stats — fully backward
 * compatible, so every existing drill behaves exactly as before until you fit a head.
 */
export function drillConfig(drill: DrillState): DrillConfig {
  const head = drillHead(drill.head);
  if (!head) {
    return { behavior: drill.behavior, powerMult: 1, speedMult: 1, wearMult: 1, configured: false, bitLift: 1 };
  }
  const bit = drill.bit;
  const pm = bit ? purityMult(bit.purity) : 1;
  const bitPower = bit ? bitFactor(bit.materialId, 'edge') : 1;   // EDGE → power
  const bitSpeed = bit ? bitFactor(bit.materialId, 'cadence') : 1; // CADENCE → speed
  const bitHeft = bit ? bitFactor(bit.materialId, 'heft') : 1;    // HEFT → wear resistance
  return {
    behavior: head.behavior,
    powerMult: head.power * bitPower * pm,
    speedMult: head.speed * bitSpeed,
    // A hefty bit resists wear; divide the head's wear-rate by the heft factor.
    wearMult: head.wear / Math.max(0.5, bitHeft),
    configured: true,
    // The bit's own contribution, which is what the feed is billed for. A bare
    // head lifts nothing and costs nothing extra.
    bitLift: bit ? bitPower * bitSpeed * pm : 1,
  };
}
