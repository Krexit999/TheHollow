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
}

/** Five heads, each a real trade — no strictly-best. The default is the Auger. */
export const DRILL_HEADS: DrillHead[] = [
  { id: 'auger', name: 'Auger Head', note: 'Bores the fullest cell. Steady, patient, unremarkable — and it never lets you down.', behavior: 'fullest', power: 1.1, speed: 0.95, wear: 1.0 },
  { id: 'harrow', name: 'Harrow Head', note: 'Sweeps the face in even passes. Kind to itself; kind to the rock.', behavior: 'sweep', power: 0.9, speed: 1.15, wear: 0.8 },
  { id: 'scatter', name: 'Scatter Head', note: 'Strikes where it pleases. Fast and cheap and hard on itself.', behavior: 'random', power: 0.95, speed: 1.25, wear: 1.35 },
  { id: 'seeker', name: 'Seeker Head', note: 'Follows the seam from one cell to its richest neighbour. Clever, hungry, brittle.', behavior: 'chain', power: 1.05, speed: 1.05, wear: 1.15 },
  { id: 'maul', name: 'Maul Head', note: 'A blunt weight on the fullest cell. All force, slow, and it wears like a stone in a boot.', behavior: 'fullest', power: 1.35, speed: 0.75, wear: 1.3 },
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
}

/**
 * The drill's configuration, folding head archetype × bit traits. An unconfigured
 * drill (no head) keeps its legacy `behavior` and neutral stats — fully backward
 * compatible, so every existing drill behaves exactly as before until you fit a head.
 */
export function drillConfig(drill: DrillState): DrillConfig {
  const head = drillHead(drill.head);
  if (!head) {
    return { behavior: drill.behavior, powerMult: 1, speedMult: 1, wearMult: 1, configured: false };
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
  };
}
