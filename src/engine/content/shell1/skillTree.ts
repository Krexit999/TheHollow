/**
 * Delver skill tree — three branches. Thirteen nodes open from the start (Loam);
 * twelve more OPEN PROGRESSIVELY as you breach into deeper shells, so the tree
 * keeps giving your skill points a home the whole way down rather than finishing
 * in Shell I. Free respec (locked). The Delver never resets.
 *
 * The old build shipped these twelve as permanently-sealed `stub` nodes with a
 * promise ("opens in deeper shells") that no code ever kept — so a player maxed
 * the ~47 points of real nodes in Loam and every point after had nowhere to go.
 * They are now real nodes with real effects, gated by `unlockBreach`.
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
  /**
   * Breaches (deeper shells) that must be reached before this node opens.
   * Undefined or 0 = available from the start. loam 0, ferrite 1, verdance 2,
   * glassmere 3, cinder 4, hollow 5, aleph 6.
   */
  unlockBreach?: number;
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
    description: (r) => `The pick is a weapon; it always was. +10% Dust per rank (now +${10 * r}%).`,
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

/**
 * The deeper nodes — real effects now, opening as you breach into each shell.
 * Two per shell II–VII, so every world you fall into hands the tree new ground.
 * Each keys off `unlockBreach` and routes its effect through the modifier
 * pipeline below, exactly as the starting nodes do.
 */
const DEEP_NODES: SkillNodeDef[] = [
  // --- Ferrite (breach 1) ---
  { id: 'veinMemory', branch: 'extraction', row: 5, unlockBreach: 1, maxRank: 3, costPerRank: 1,
    name: 'Vein Memory',
    description: (r) => `The rock remembers where it gave. +6% material drop chance per rank (now +${6 * r}%).` },
  { id: 'surplusDoctrine', branch: 'industry', row: 2, unlockBreach: 1, maxRank: 5, costPerRank: 1,
    name: 'Surplus Doctrine',
    description: (r) => `Nothing is spare. +8% Brick from the Kiln per rank (now +${8 * r}%).` },
  // --- Verdance (breach 2) ---
  { id: 'beltDiscipline', branch: 'industry', row: 3, unlockBreach: 2, maxRank: 5, costPerRank: 1,
    name: 'Belt Discipline',
    description: (r) => `The belts never stutter. Drills strike +6% faster per rank (now +${6 * r}%).` },
  { id: 'borrowedLight', branch: 'insight', row: 5, unlockBreach: 2, maxRank: 5, costPerRank: 1,
    name: 'Borrowed Light',
    description: (r) => `Read by someone else's lamp. +8% Delver XP per rank (now +${8 * r}%).` },
  // --- Glassmere (breach 3) ---
  { id: 'ruinousArc', branch: 'extraction', row: 6, unlockBreach: 3, maxRank: 5, costPerRank: 1,
    name: 'Ruinous Arc',
    description: (r) => `The pick's whole arc is a threat. +8% Dust per rank (now +${8 * r}%).` },
  { id: 'secondFurnace', branch: 'industry', row: 4, unlockBreach: 3, maxRank: 5, costPerRank: 1,
    name: 'Second Furnace',
    description: (r) => `A second throat on the fire. +10% Kiln intake per rank (now +${10 * r}%).` },
  // --- Cinder (breach 4) ---
  { id: 'foremansEye', branch: 'industry', row: 5, unlockBreach: 4, maxRank: 5, costPerRank: 1,
    name: "Foreman's Eye",
    description: (r) => `Someone is watching the line. +5% drill power per rank (now +${5 * r}%).` },
  { id: 'countingTheDark', branch: 'insight', row: 6, unlockBreach: 4, maxRank: 3, costPerRank: 1,
    name: 'Counting the Dark',
    description: (r) => `Every absence is data. +6% motif gain per rank (now +${6 * r}%).` },
  // --- Hollow (breach 5) ---
  { id: 'theLongPick', branch: 'extraction', row: 7, unlockBreach: 5, maxRank: 5, costPerRank: 1,
    name: 'The Long Pick',
    description: (r) => `Reach past the near seam. +6% Dust from every chip per rank (now +${6 * r}%).` },
  { id: 'closedLoop', branch: 'industry', row: 6, unlockBreach: 5, maxRank: 3, costPerRank: 1,
    name: 'Closed Loop',
    description: (r) => `The works feed themselves. +6% field regen per rank (now +${6 * r}%).` },
  // --- Aleph (breach 6) ---
  { id: 'theGreatEngine', branch: 'industry', row: 7, unlockBreach: 6, maxRank: 5, costPerRank: 1,
    name: 'The Great Engine',
    description: (r) => `The whole shell is one machine. +4% resource cap per rank (now +${4 * r}%).` },
  { id: 'coresGrammar', branch: 'insight', row: 7, unlockBreach: 6, maxRank: 5, costPerRank: 1,
    name: "The Core's Grammar",
    description: (r) => `You begin to read the rules. Descending costs -3% per rank (now -${3 * r}%).` },
];
for (const n of DEEP_NODES) SKILL_NODES.push(n);

export function skillNodeDef(id: string): SkillNodeDef {
  const def = SKILL_NODES.find((n) => n.id === id);
  if (!def) throw new Error(`Unknown skill node: ${id}`);
  return def;
}

/** Has this node opened yet? A node opens once you have breached deep enough. */
export function skillNodeUnlocked(state: GameState, node: SkillNodeDef): boolean {
  return (state.shell.breachCount ?? 0) >= (node.unlockBreach ?? 0);
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
    bucket: 'dustYield',
    value: (s) => 1 + 0.1 * skillRank(s, 'twoHandedSwing'),
  });
  // heavyHands is consumed directly by manualChip; assayersHunch by the
  // Table; deepGrip by playerMaxHp.

  // --- The deeper nodes (open across shells II–VII) ---------------------
  const deep: Array<{ id: string; bucket: Parameters<typeof registerModifier>[0]['bucket']; per: number; sign?: -1 }> = [
    { id: 'veinMemory', bucket: 'dropRate', per: 0.06 },
    { id: 'surplusDoctrine', bucket: 'brickYield', per: 0.08 },
    { id: 'beltDiscipline', bucket: 'drillSpeed', per: 0.06 },
    { id: 'borrowedLight', bucket: 'xpGain', per: 0.08 },
    { id: 'ruinousArc', bucket: 'dustYield', per: 0.08 },
    { id: 'secondFurnace', bucket: 'kilnRate', per: 0.1 },
    { id: 'foremansEye', bucket: 'drillPower', per: 0.05 },
    { id: 'countingTheDark', bucket: 'dropRate', per: 0.06 },
    { id: 'theLongPick', bucket: 'dustYield', per: 0.06 },
    { id: 'closedLoop', bucket: 'regen', per: 0.06 },
    { id: 'theGreatEngine', bucket: 'cap', per: 0.04 },
    { id: 'coresGrammar', bucket: 'descendCost', per: 0.03, sign: -1 },
  ];
  for (const d of deep) {
    registerModifier({
      id: `skill.${d.id}`,
      label: `${SKILL_NODES.find((n) => n.id === d.id)?.name ?? d.id} (Skill)`,
      bucket: d.bucket,
      value: (s) => 1 + (d.sign ?? 1) * d.per * skillRank(s, d.id),
    });
  }
}
