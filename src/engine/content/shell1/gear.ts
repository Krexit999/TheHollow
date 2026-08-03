/**
 * GEAR — three slots, and what you carry into a stretch is a commitment (§40.1).
 *
 * TWO ITEMS PER SLOT, AND THEY ARE STRONG IN DIFFERENT PLACES (LAW 8). Neither
 * lamp is the better lamp: one reads further down the ladder, the other reads
 * the dangerous rows however far off they are — so which you want depends on
 * whether you are scouting a route or picking your way through one. Same shape
 * for the gloves and the boots.
 *
 * PILLAR 2 BY CONSTRUCTION. Not one of the six touches `cellCap`, `cellRegen`
 * or `chipYield`. They change what is LEGIBLE, what your own hand does to the
 * rock, and where the machines will go — reach, behaviour and information. A
 * test asserts a fully kitted delver reads the bare `dpsMax`.
 *
 * FOUND, NOT BOUGHT (LAW 3). Each piece is somebody else's kit, left in a WRECK.
 * You never see a list of gear you could have; a wreck hands you what was in it
 * the first time you loot it, and the Codex fills in behind you.
 */

export type GearSlot = 'lamp' | 'gloves' | 'boots';

export const GEAR_SLOTS: GearSlot[] = ['lamp', 'gloves', 'boots'];

export interface GearDef {
  id: string;
  slot: GearSlot;
  name: string;
  /** What it DOES, never what it is worth. */
  effect: string;
  flavor: string;
  /** The wreck that holds it — the only way to it. */
  fromWreck: string;
}

export const GEAR: GearDef[] = [
  // ── LAMP — what you can see ───────────────────────────────────────────────
  {
    id: 'sableslamp', slot: 'lamp', name: "Sable's Lamp", fromWreck: 'kilnyard',
    effect: 'The ladder reads one station further ahead.',
    flavor: 'The wick is trimmed the way somebody trims a wick they expect to use again.',
  },
  {
    id: 'ashlamp', slot: 'lamp', name: 'Ash Lamp', fromWreck: 'longcut',
    effect: 'Every hazard on the ladder is legible, however far off it sits.',
    flavor: 'Burns dirty and low. What it is good for is seeing what is coming.',
  },
  // ── GLOVES — the hand at the rock ─────────────────────────────────────────
  {
    id: 'gravegloves', slot: 'gloves', name: 'Graveclay Gloves', fromWreck: 'undersill',
    effect: 'Pockets you dig by hand come open faster.',
    flavor: 'Stiff with dried clay, and moulded to somebody else\'s knuckles.',
  },
  {
    id: 'chalkgloves', slot: 'gloves', name: 'Chalked Grips', fromWreck: 'sinterrow',
    effect: 'A swing that finds nothing still leaves a mark on the rock.',
    flavor: 'You can tell how they held the haft from where the chalk wore off.',
  },
  // ── BOOTS — where you stand, and what stands near you ─────────────────────
  {
    id: 'feltboots', slot: 'boots', name: 'Felt Overboots', fromWreck: 'quillrest',
    effect: 'The machines leave alone the cell you last struck.',
    flavor: 'Silent on stone. The drills seem not to notice you at all.',
  },
  {
    id: 'marchboots', slot: 'boots', name: 'Marching Boots', fromWreck: 'shoringdeep',
    effect: 'A machine set to SWEEP covers two squares a stroke instead of one.',
    flavor: 'Hobnailed, and worn evenly — whoever had these walked the whole face, every shift.',
  },
];

export function gearDef(id: string): GearDef | undefined {
  return GEAR.find((g) => g.id === id);
}

/** What this wreck was carrying, if anything. */
export function gearInWreck(wreckId: string): GearDef | undefined {
  return GEAR.find((g) => g.fromWreck === wreckId);
}
