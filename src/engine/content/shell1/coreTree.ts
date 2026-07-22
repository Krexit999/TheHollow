/**
 * The Core tree — 6 nodes for Phase 1 (the full game grows to 28).
 * Locked cost curve: base 2, r = 1.55, max 10 levels per node.
 * Nodes are chosen to change the *shape* of the next run, not just its speed.
 */
import { D, Decimal } from '../../decimal';
import { registerModifier } from '../../modifiers';
import type { GameState } from '../../types';

export interface CoreNodeDef {
  id: string;
  name: string;
  description: (level: number) => string;
  maxLevel: number;
  /** Tranche 2 ("Echo-scarred") opens after the first Breach — the ladder's
   * deep rungs, added by the Phase-8 macro-tuning pass. Loam untouched. */
  tranche?: 2;
}

export const CORE_NODE_BASE = 2;
export const CORE_NODE_RATIO = 1.55;

export const CORE_NODES: CoreNodeDef[] = [
  {
    id: 'persistence',
    name: 'Persistence',
    maxLevel: 10,
    description: (l) =>
      `The dig continues without you. Offline efficiency +3% per level (now +${3 * l}%, base 55%, cap 95%).`,
  },
  {
    id: 'grit',
    name: 'Grit',
    maxLevel: 10,
    description: (l) => `Old hands, harder swings. +10% Dust from every chip per level (now +${10 * l}%).`,
  },
  {
    id: 'momentum',
    name: 'Momentum',
    maxLevel: 10,
    description: (l) =>
      `Collapse cannot take what you know by heart. Keep up to ${4 * l} levels of each face upgrade through Collapse (+4 per level).`,
  },
  {
    id: 'faultLines',
    name: 'Fault Lines',
    maxLevel: 10,
    description: (l) =>
      `You read the cracks before you make them. Manual chips have a ${4 * l}% chance to fracture, chipping every adjacent cell for half its charge (+4% per level).`,
  },
  {
    id: 'emberMemory',
    name: 'Ember Memory',
    maxLevel: 10,
    description: (l) =>
      `The Kiln remembers fire. Keeps ${10 * l}% of its heat through Collapse and gains +12% throughput per level (now +${12 * l}%).`,
  },
  {
    id: 'overseer',
    name: 'Overseer',
    maxLevel: 10,
    description: (l) => `The bay runs a tighter shift. Drills strike +12% faster per level (now +${12 * l}%).`,
  },
  // ---- Tranche 2: the Echo-scarred ring (opens after the first Breach). ----
  // The macro-tuning pass found the ladder saturating mid-Ferrite (Blade
  // capped, six nodes maxed) against a cost curve spanning ×5,529 per 100
  // depths. These are the DESIGNED rungs (the doc budgets core-tree ×500 by
  // Shell V): multiplicative per level, so collapsing stays the engine of
  // the deep game instead of a memory of the early one.
  {
    id: 'deepGrit', name: 'Grit of the Second Shell', maxLevel: 15, tranche: 2,
    description: (l) => `The swing that broke one world breaks the next easier. Chip yield ×1.12 per level (now ×${Math.pow(1.12, l).toFixed(2)}).`,
  },
  {
    id: 'ballast', name: 'Ballast', maxLevel: 12, tranche: 2,
    description: (l) => `You descend like something that belongs down there. Descend cost ×0.97 per level (now ×${Math.pow(0.97, l).toFixed(2)}).`,
  },
  {
    id: 'wellspring', name: 'Wellspring', maxLevel: 12, tranche: 2,
    description: (l) => `The rock remembers being fuller. Cell regen ×1.06 per level (now ×${Math.pow(1.06, l).toFixed(2)}).`,
  },
  {
    id: 'resonantCore', name: 'Resonant Core', maxLevel: 12, tranche: 2,
    description: (l) => `The fall rings louder each time. +10% Cores from every Collapse per level (now +${10 * l}%).`,
  },
  {
    id: 'millstone', name: 'Millstone', maxLevel: 10, tranche: 2,
    description: (l) => `The converter turns like it means it. Output ×1.08 per level (now ×${Math.pow(1.08, l).toFixed(2)}).`,
  },
  {
    id: 'keenEye', name: 'Keen Eye', maxLevel: 10, tranche: 2,
    description: (l) => `You see what the rubble hides. Drop rate ×1.06 per level (now ×${Math.pow(1.06, l).toFixed(2)}).`,
  },
  {
    id: 'farsight', name: 'Farsight', maxLevel: 10, tranche: 2,
    description: (l) => `Every fall teaches faster than the climb did. XP ×1.08 per level (now ×${Math.pow(1.08, l).toFixed(2)}).`,
  },
  {
    id: 'secondWind', name: 'Second Wind', maxLevel: 10, tranche: 2,
    description: (l) => `What the deep took, the deep returns. Strike power ×1.08 per level (now ×${Math.pow(1.08, l).toFixed(2)}).`,
  },
];

export function coreNodeAvailable(state: GameState, id: string): boolean {
  const def = coreNodeDef(id);
  return def.tranche !== 2 || state.shell.breachCount >= 1;
}

export function coreNodeDef(id: string): CoreNodeDef {
  const def = CORE_NODES.find((n) => n.id === id);
  if (!def) throw new Error(`Unknown core node: ${id}`);
  return def;
}

export function coreNodeLevel(state: GameState, id: string): number {
  return state.collapse.nodes[id] ?? 0;
}

/** Cost of the next level: 2 * 1.55^level (locked tree-node curve). */
export function coreNodeCost(level: number): Decimal {
  return D(CORE_NODE_BASE).mul(Decimal.pow(CORE_NODE_RATIO, level));
}

export function registerCoreTreeModifiers(): void {
  registerModifier({
    id: 'core.grit',
    label: 'Grit (Core)',
    bucket: 'dustYield',
    value: (s) => 1 + 0.1 * coreNodeLevel(s, 'grit'),
  });
  registerModifier({
    id: 'core.emberMemory',
    label: 'Ember Memory (Core)',
    bucket: 'kilnRate',
    value: (s) => 1 + 0.12 * coreNodeLevel(s, 'emberMemory'),
  });
  registerModifier({
    id: 'core.overseer',
    label: 'Overseer (Core)',
    bucket: 'drillSpeed',
    value: (s) => 1 + 0.12 * coreNodeLevel(s, 'overseer'),
  });
  registerModifier({
    id: 'core.persistence',
    label: 'Persistence (Core)',
    bucket: 'offlineEffAdd',
    value: (s) => 0.03 * coreNodeLevel(s, 'persistence'),
  });
  // momentum and faultLines are consumed directly by collapse/face logic.
  // ---- Tranche 2 ----
  registerModifier({
    id: 'core.deepGrit', label: 'Grit of the Second Shell (Core)', bucket: 'dustYield',
    value: (s) => Math.pow(1.12, coreNodeLevel(s, 'deepGrit')),
  });
  registerModifier({
    id: 'core.ballast', label: 'Ballast (Core)', bucket: 'descendCost',
    value: (s) => Math.pow(0.97, coreNodeLevel(s, 'ballast')),
  });
  registerModifier({
    id: 'core.wellspring', label: 'Wellspring (Core)', bucket: 'regen',
    value: (s) => Math.pow(1.06, coreNodeLevel(s, 'wellspring')),
  });
  registerModifier({
    id: 'core.millstone', label: 'Millstone (Core)', bucket: 'brickYield',
    value: (s) => Math.pow(1.08, coreNodeLevel(s, 'millstone')),
  });
  registerModifier({
    id: 'core.keenEye', label: 'Keen Eye (Core)', bucket: 'dropRate',
    value: (s) => Math.pow(1.06, coreNodeLevel(s, 'keenEye')),
  });
  registerModifier({
    id: 'core.farsight', label: 'Farsight (Core)', bucket: 'xpGain',
    value: (s) => Math.pow(1.08, coreNodeLevel(s, 'farsight')),
  });
  registerModifier({
    id: 'core.secondWind', label: 'Second Wind (Core)', bucket: 'strikePower',
    value: (s) => Math.pow(1.08, coreNodeLevel(s, 'secondWind')),
  });
  // resonantCore is consumed by the collapse payout directly.
}
