/**
 * THE AUTOMATION GRID — the Echo Chamber, generalised from a tape to a policy.
 *
 * The Chamber proved the load-bearing idea: a program replayed through the REAL
 * dispatch path obeys every ceiling a hand does. The Grid takes that and stops
 * being linear. Modules are DECISIONS, placed in Spiral-gated slots on a 4x4
 * board, and adjacency matters the way it does on every other board in this
 * game — a module reads the ones beside it.
 *
 * PILLAR 1 (bound deliberately, verified in sim): automation targets the IDLE
 * rate, never the active one. An automated shell plays like a good idle player,
 * never like an optimal active one — so active play keeps its ~1.3x edge and
 * the endgame does not make hands pointless. `rate` below is the share of an
 * idle player's throughput the module recovers, and the ceiling on the sum is
 * 1.0: perfect automation equals a good idle player, and nothing more.
 *
 * Modules are unlocked by CHALLENGES (hand-played), not bought with Spiral —
 * Spiral buys the slots to put them in. Two axes, so the player who loves
 * challenges is not automatically the player with the most capacity.
 */
export interface GridModuleDef {
  id: string;
  name: string;
  blurb: string;
  /** What it does, plainly, for the UI. */
  rule: string;
  /** Share of idle throughput this decision recovers when placed. */
  rate: number;
  /** Bonus applied per adjacent module this one is documented to work with. */
  synergy?: { with: string[]; add: number };
}

export const GRID_MODULES: GridModuleDef[] = [
  {
    id: 'autoBuyFace', name: 'The Steady Hand', rate: 0.22,
    blurb: 'It buys the cheapest thing that raises the ceiling, forever, and never gets bored.',
    rule: 'Buys the cheapest affordable face upgrade.',
    synergy: { with: ['autoCollapse'], add: 0.05 },
  },
  {
    id: 'autoKiln', name: 'The Stoker', rate: 0.18,
    blurb: 'Keeps the fire fed and the heat up. Notices when the Dust runs thin, which you did not.',
    rule: 'Keeps the converter running and banked when starved.',
    synergy: { with: ['autoBuyFace'], add: 0.04 },
  },
  {
    id: 'autoDescend', name: 'The Stair-Walker', rate: 0.2,
    blurb: 'Goes down when the field stops paying for standing still.',
    rule: 'Descends when the face is capped and the next step is affordable.',
    synergy: { with: ['autoCollapse'], add: 0.05 },
  },
  {
    id: 'autoCollapse', name: 'The Patient Fall', rate: 0.16,
    blurb: 'Drops the shaft at the point where the climb back is shorter than the wait.',
    rule: 'Collapses when the Cores earned beat a rising threshold.',
    synergy: { with: ['autoDescend', 'autoBuyFace'], add: 0.04 },
  },
  {
    id: 'autoForge', name: 'The Apprentice', rate: 0.12,
    blurb: 'Forges the next tier the moment the wall demands it, from whatever is cleanest.',
    rule: 'Forges the next tool tier when a hardness wall is near.',
  },
  {
    id: 'autoVent', name: 'The Governor\'s Clerk', rate: 0.1,
    blurb: 'Watches the gauge so you do not have to. Will not gamble; will not flood.',
    rule: 'Holds heat at the safe line and never chokes the vents.',
  },
  {
    id: 'autoListen', name: 'The Listener', rate: 0.1,
    blurb: 'Harvests the quiet before it gets loud enough to mute you.',
    rule: 'Listens at the auto-listen line in the Hollow.',
  },
  {
    id: 'autoBalance', name: 'The Ledger-Keeper', rate: 0.08,
    blurb: 'Splits the purse between running worlds so none of them starves.',
    rule: 'Balances spending across parallel shells.',
    synergy: { with: ['autoBuyFace', 'autoKiln'], add: 0.06 },
  },
  // --- Phase 15: eight more, so nine cells is a CHOICE --------------------
  // Eight modules on a nine-cell board was one build with a spare slot. These
  // are deliberately spread across rates and synergies so a board is an
  // argument about what this run is for, not a filling-in exercise.
  {
    id: 'autoAssay', name: 'The Filing Clerk', rate: 0.09,
    blurb: 'Starts a survey the moment the table is free, files the result, and starts another. Tally would approve, and does not.',
    rule: 'Runs the Assay Table continuously.',
    synergy: { with: ['autoSell'], add: 0.04 },
  },
  {
    id: 'autoCraft', name: 'The Journeyman', rate: 0.11,
    blurb: 'Works the boards you are not standing at. Never discovers anything — it only repeats what you already found.',
    rule: 'Re-runs known craft recipes when inputs allow.',
    synergy: { with: ['autoForge'], add: 0.05 },
  },
  {
    id: 'autoVault', name: 'The Nightwatch', rate: 0.14,
    blurb: 'Minds the shaft in the dark. Not as well as you, which is the entire point of the arrangement.',
    rule: 'Recovers a share of idle throughput while the tab is shut.',
    synergy: { with: ['autoCollapse'], add: 0.05 },
  },
  {
    id: 'autoRelic', name: 'The Sorter', rate: 0.1,
    blurb: 'Fuses duplicates into the best keeper it can find. It has never once destroyed anything, and reminds you of this.',
    rule: 'Fuses redundant relics into your strongest.',
    synergy: { with: ['autoSell'], add: 0.04 },
  },
  {
    id: 'autoFight', name: 'The Standing Order', rate: 0.13,
    blurb: 'Takes the fights the crew likes and waves off the ones it does not. Ruta wrote the rule and will not discuss it.',
    rule: 'Auto-resolves favourable encounters, slips the rest.',
    synergy: { with: ['autoDescend'], add: 0.06 },
  },
  {
    id: 'autoSell', name: 'The Standing Account', rate: 0.08,
    blurb: 'Moves surplus commons down Serra\'s road on a standing order. Sef takes a cut and is open about it.',
    rule: 'Sells surplus common materials for Scrip.',
    synergy: { with: ['autoAssay', 'autoRelic'], add: 0.04 },
  },
  {
    id: 'autoWeather', name: 'The Almanac', rate: 0.1,
    blurb: 'Reads the season and shifts the day\'s work to suit it. The one module that is doing arithmetic you could do and would not.',
    rule: 'Weights work toward whatever the current weather favours.',
    synergy: { with: ['autoBuyFace'], add: 0.05 },
  },
  {
    id: 'autoWiden', name: 'The Quarrymaster', rate: 0.15,
    blurb: 'Buys width and regen in whichever order the ceiling actually wants, which is rarely the order you would have picked.',
    rule: 'Buys the face upgrade that moves the ceiling most per Dust.',
    synergy: { with: ['autoBuyFace'], add: 0.06 },
  },
];

export const MODULE_BY_ID = new Map(GRID_MODULES.map((m) => [m.id, m]));

/**
 * THREE BY THREE, not four by four (Phase 14 — reversing the Phase 12 ruling).
 *
 * Eight modules in sixteen cells is structurally unfillable: even with infinite
 * Spiral the board could never exceed half full, and at 5/5 slots and 100% of
 * idle — MAXIMUM automation, the cap — it rendered five filled cells above
 * eleven empty ones. The screen said "two-thirds failed" at the exact moment
 * the player had finished. Nine cells for eight modules says "one to go".
 *
 * The original argument for 4x4 was that 3x3 would flatten adjacency by
 * dropping corners to two neighbours. Corners have exactly two neighbours in
 * BOTH layouts (right + down). 3x3 gives 4 corners / 4 edges / 1 centre for
 * eight modules; 4x4 gives 4 / 8 / 4 for the same eight — so 3x3 is strictly
 * denser in high-connectivity cells per module, not flatter.
 */
export const GRID_W = 3;
export const GRID_H = 3;
export const GRID_CELLS = GRID_W * GRID_H;

/** Cells orthogonally adjacent to `cell` on the 4x4 board. */
export function neighbours(cell: number): number[] {
  const x = cell % GRID_W;
  const y = Math.floor(cell / GRID_W);
  const out: number[] = [];
  if (x > 0) out.push(cell - 1);
  if (x < GRID_W - 1) out.push(cell + 1);
  if (y > 0) out.push(cell - GRID_W);
  if (y < GRID_H - 1) out.push(cell + GRID_W);
  return out;
}

/**
 * How well the placed grid plays a world, as a share of a good idle player's
 * throughput. CAPPED AT 1: automation equals idle, never beats it. That cap is
 * what keeps pillar 1 alive at the top of the ladder.
 */
export function automationRate(grid: Record<number, string>): number {
  let total = 0;
  for (const [cellStr, id] of Object.entries(grid)) {
    const def = MODULE_BY_ID.get(id);
    if (!def) continue;
    total += def.rate;
    if (def.synergy) {
      const near = neighbours(Number(cellStr))
        .map((n) => grid[n])
        .filter((x): x is string => x !== undefined);
      for (const n of near) if (def.synergy.with.includes(n)) total += def.synergy.add;
    }
  }
  return Math.min(1, total);
}
