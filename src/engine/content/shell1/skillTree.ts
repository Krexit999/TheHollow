/**
 * Delver skill tree — three branches, 22 nodes each at full size. Phase 1
 * implements 6 real nodes (2 per branch); the rest are visible stubs so the
 * shape of the tree is clear. Free respec (locked).
 */
import { registerModifier } from '../../modifiers';
import type { GameState } from '../../types';

export type SkillBranch = 'extraction' | 'industry' | 'insight';

export interface SkillNodeDef {
  id: string;
  branch: SkillBranch;
  /** Position within the branch column, 0 = top. */
  row: number;
  name: string;
  description: (rank: number) => string;
  maxRank: number;
  /** Skill points per rank. */
  costPerRank: number;
  /** Stubbed nodes render sealed and cannot be bought (later phases). */
  stub?: boolean;
}

export const SKILL_NODES: SkillNodeDef[] = [
  // --- Extraction: the face, tools, chip yield ---------------------------
  {
    id: 'sharpenedEdge',
    branch: 'extraction',
    row: 0,
    name: 'Sharpened Edge',
    maxRank: 5,
    costPerRank: 1,
    description: (r) => `+5% Dust from every chip per rank (now +${5 * r}%).`,
  },
  {
    id: 'heavyHands',
    branch: 'extraction',
    row: 1,
    name: 'Heavy Hands',
    maxRank: 3,
    costPerRank: 1,
    description: (r) => `Manual chips have a ${10 * r}% chance to crit for 3x Dust (+10% per rank).`,
  },
  // --- Industry: converters, throughput, automation ----------------------
  {
    id: 'stoker',
    branch: 'industry',
    row: 0,
    name: 'Stoker',
    maxRank: 5,
    costPerRank: 1,
    description: (r) => `The Kiln heats +15% faster and runs +5% hotter intake per rank (now +${15 * r}% / +${5 * r}%).`,
  },
  {
    id: 'drillLogic',
    branch: 'industry',
    row: 1,
    name: 'Drill Logic',
    maxRank: 5,
    costPerRank: 1,
    description: (r) => `Drills strike +8% faster per rank (now +${8 * r}%).`,
  },
  // --- Insight: discovery, craft-systems, prestige -----------------------
  {
    id: 'scholar',
    branch: 'insight',
    row: 0,
    name: 'Scholar',
    maxRank: 5,
    costPerRank: 1,
    description: (r) => `+10% Delver XP from all sources per rank (now +${10 * r}%).`,
  },
  {
    id: 'cartographer',
    branch: 'insight',
    row: 1,
    name: 'Cartographer',
    maxRank: 5,
    costPerRank: 1,
    description: (r) => `Sable's maps, half-legible. Descending costs -4% Dust per rank (now -${4 * r}%).`,
  },
  // --- Combat (Phase 5) — mining skills that swing ------------------------
  {
    id: 'twoHandedSwing',
    branch: 'extraction',
    row: 3,
    name: 'Two-Handed Swing',
    maxRank: 5,
    costPerRank: 1,
    description: (r) => `The pick is a weapon; it always was. +10% strike power per rank (now +${10 * r}%).`,
  },
  {
    id: 'deepGrip',
    branch: 'extraction',
    row: 4,
    name: 'Deep Grip',
    maxRank: 3,
    costPerRank: 1,
    description: (r) => `Feet planted like roots. +6 HP in a fight per rank (now +${6 * r}).`,
  },
  // --- Materials (Phase 3) ------------------------------------------------
  {
    id: 'splinterSense',
    branch: 'extraction',
    row: 2,
    name: 'Splinter Sense',
    maxRank: 3,
    costPerRank: 1,
    description: (r) => `You feel the ore before the pick does. +8% material drop chance per rank (now +${8 * r}%).`,
  },
  {
    id: 'assayersHunch',
    branch: 'insight',
    row: 4,
    name: "Assayer's Hunch",
    maxRank: 3,
    costPerRank: 1,
    description: (r) =>
      r === 0
        ? 'Unlocks the Assay Table — read a depth before you commit to it. Later ranks survey faster and mark richer veins.'
        : r === 1
          ? 'The Assay Table is yours. Surveys take 20s.'
          : r === 2
            ? 'Surveys run 25% faster.'
            : 'Surveys run 50% faster and mark twice the vein.',
  },
  // --- Lattice discovery aids (Phase 2) ----------------------------------
  {
    id: 'marginalia',
    branch: 'insight',
    row: 2,
    name: 'Marginalia',
    maxRank: 3,
    costPerRank: 1,
    description: (r) =>
      r === 0
        ? "Sable annotated the Lattice. Each rank makes her notes on an undiscovered chord more legible."
        : r === 1
          ? 'Her notes name the shape of an undiscovered chord.'
          : r === 2
            ? 'Shape, and whether its ranks must match.'
            : 'Shape, ranks, and the company it must keep.',
  },
  {
    id: 'patternGhost',
    branch: 'insight',
    row: 3,
    name: 'Pattern Ghost',
    maxRank: 2,
    costPerRank: 1,
    description: (r) =>
      r === 0
        ? 'See the board the way she did. Near-chords shimmer more insistently; at rank 2 the missing stone shows itself.'
        : r === 1
          ? 'Near-chord lines shimmer clearly.'
          : 'The missing stone appears as a ghost in its empty cell.',
  },
];

/** Sealed stubs — visible so the tree's eventual shape reads on screen. */
const STUB_NAMES: Record<SkillBranch, string[]> = {
  extraction: ['Vein Memory', 'Ruinous Arc', 'The Long Pick'],
  industry: ['Surplus Doctrine', 'Belt Discipline', 'Second Furnace', 'Foreman\'s Eye', 'Closed Loop', 'The Great Engine'],
  insight: ['Borrowed Light', 'Counting the Dark', 'The Core\'s Grammar'],
};

const FIRST_STUB_ROW: Record<SkillBranch, number> = { extraction: 5, industry: 2, insight: 5 };

for (const branch of ['extraction', 'industry', 'insight'] as const) {
  STUB_NAMES[branch].forEach((name, i) => {
    SKILL_NODES.push({
      id: `stub.${branch}.${i}`,
      branch,
      row: FIRST_STUB_ROW[branch] + i,
      name,
      maxRank: 5,
      costPerRank: 1,
      description: () => 'Sealed. Something in a later shell unlocks this.',
      stub: true,
    });
  });
}

export function skillNodeDef(id: string): SkillNodeDef {
  const def = SKILL_NODES.find((n) => n.id === id);
  if (!def) throw new Error(`Unknown skill node: ${id}`);
  return def;
}

export function skillRank(state: GameState, id: string): number {
  return state.delver.skills[id] ?? 0;
}

export function spentSkillPoints(state: GameState): number {
  let total = 0;
  for (const [id, rank] of Object.entries(state.delver.skills)) {
    const def = SKILL_NODES.find((n) => n.id === id);
    if (def) total += rank * def.costPerRank;
  }
  return total;
}

export function registerSkillModifiers(): void {
  registerModifier({
    id: 'skill.sharpenedEdge',
    label: 'Sharpened Edge (Skill)',
    bucket: 'dustYield',
    value: (s) => 1 + 0.05 * skillRank(s, 'sharpenedEdge'),
  });
  registerModifier({
    id: 'skill.stoker.ramp',
    label: 'Stoker (Skill)',
    bucket: 'kilnHeatRamp',
    value: (s) => 1 + 0.15 * skillRank(s, 'stoker'),
  });
  registerModifier({
    id: 'skill.stoker.rate',
    label: 'Stoker (Skill)',
    bucket: 'kilnRate',
    value: (s) => 1 + 0.05 * skillRank(s, 'stoker'),
  });
  registerModifier({
    id: 'skill.drillLogic',
    label: 'Drill Logic (Skill)',
    bucket: 'drillSpeed',
    value: (s) => 1 + 0.08 * skillRank(s, 'drillLogic'),
  });
  registerModifier({
    id: 'skill.scholar',
    label: 'Scholar (Skill)',
    bucket: 'xpGain',
    value: (s) => 1 + 0.1 * skillRank(s, 'scholar'),
  });
  registerModifier({
    id: 'skill.cartographer',
    label: 'Cartographer (Skill)',
    bucket: 'descendCost',
    value: (s) => 1 - 0.04 * skillRank(s, 'cartographer'),
  });
  registerModifier({
    id: 'skill.splinterSense',
    label: 'Splinter Sense (Skill)',
    bucket: 'dropRate',
    value: (s) => 1 + 0.08 * skillRank(s, 'splinterSense'),
  });
  registerModifier({
    id: 'skill.twoHandedSwing',
    label: 'Two-Handed Swing (Skill)',
    bucket: 'strikePower',
    value: (s) => 1 + 0.1 * skillRank(s, 'twoHandedSwing'),
  });
  // heavyHands is consumed directly by manualChip; assayersHunch by the
  // Table; deepGrip by playerMaxHp.
}
