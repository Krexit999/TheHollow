/**
 * DRILL ABILITIES — twenty-nine of them, and every one is a THING THAT HAPPENS
 * ON THE GRID.
 *
 * A.57 REPLACES THE WHOLE SET. A.53 built the framework with three abilities
 * and A.56 filled it to fifteen, and the verdict on all fifteen was that they
 * were abstract: "the strike takes a bigger share", "the drop rolls deeper",
 * "the stroke reaches further". Correct, bounded, invisible. A player watching
 * the face could not tell an alloyed bay from a bare one without reading a
 * tooltip, which means the system was a stat block wearing a costume — exactly
 * what the drill bay was rebuilt twice to stop being.
 *
 * THE RULE THIS FILE IS BUILT ON: an ability is a NAMED EVENT WITH A PICTURE.
 * It fires at a moment you can point at, it clears a shape you can see, and it
 * draws a figure on the face while it does. If you cannot describe what it
 * looks like in one sentence, it does not go in.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PILLAR 2, AND IT IS STRUCTURAL RATHER THAN ARGUED.
 *
 * Every ability resolves to a PLAN: a list of `{cell, share}` harvests, plus
 * optional world effects (ore, growth, marks) and a figure to draw. The plan
 * goes through `strike()`, which is `take = min(power, cellCharge)`. There is
 * no other path by which charge leaves the field.
 *
 * So an explosion clearing nine cells spends the charge that was IN those nine
 * cells, and the field then refills them at regen — slower, because there is
 * more to refill. `dpsMax = W·H·regen·Y` has no term any of this touches. An
 * ability changes HOW EXPLOSIVELY you arrive at the ceiling and never where the
 * ceiling is, and `drills-a57.test.ts` proves it with regen switched off:
 * everything fitted at once, at maximum grade, cannot take more than the field
 * was holding.
 *
 * The two places a faucet COULD hide, both closed:
 *  - DROP ROLLS. `rollForDrop` rolls fragments and relics on the WEIGHT, not on
 *    the charge, so an ability touching twenty cells would multiply the drop
 *    economy twentyfold on a term pillar 2 cannot see. Every plan hit passes
 *    `DRILL_DROP_FACTOR × share`, so the drop weight of a whole explosion sums
 *    to roughly one stroke's worth.
 *  - ORE AND GROWTH. Seed Spread plants and Vein Miner harvests pockets. An ore
 *    raises a cell's CAP and nothing else (A.55 proved `dpsMax` has no cap
 *    term), and growth is already a regen-capture system. Both move WHERE and
 *    WHAT, never HOW MUCH.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE LOADOUT LIMIT. Every ability carries a POWER tier 1–5, and the bay has a
 * budget it may not exceed. The budget grows with every shell you have reached,
 * so descending is what buys the right to run more broken things at once. See
 * `abilityBudget` in systems/drillAlloys.ts.
 *
 * TRIGGERING is one mechanism doing both jobs the brief asked for. Every
 * ability has a CHARGE METER. Strokes fill it; some abilities fill faster on
 * their own condition (a roll, a full cell, a pocket). When it is full the
 * ability is READY, and the drill fires it on its next stroke — so an idle
 * player gets every ability, always, without ever opening a screen (pillar 1).
 * A player who is watching can click a ready ability to fire it NOW, at the
 * cell they choose, without waiting for the stroke. Clicking is never required
 * and never pays more; it pays TIMING.
 *
 * DISCOVERY (pillar 5) is unchanged: which mix makes which ability is hinted by
 * trait, never listed, and recorded the moment you make it.
 *
 * REACH. A.56 required every signature to be forgeable from every shell's own
 * rock, which forced all fifteen onto the five traits that exist everywhere and
 * is a large part of why they read as interchangeable. A.57 trades that for
 * THEMATIC signatures — Cinder abilities want `warm`, Verdance wants `springy`,
 * Hollow wants `hollow` — and keeps reach with a weaker but real guarantee,
 * asserted in test: every ability is forgeable from its OWN shell's rock, and
 * every shell can forge at least four abilities from local rock alone. Nothing
 * is ever ability-starved, and materials cross a Breach besides.
 */
import type { TraitId } from '../traits';
import { traitsOf } from '../traits';

/**
 * WHAT SHAPE THE ABILITY CLEARS. Twenty-nine abilities, sixteen shapes: the
 * geometry is shared, the parameters and the figure are not. Generators live in
 * systems/abilityPlans.ts.
 */
export type PlanShape =
  | 'single'        // the target alone, taken whole
  | 'block'         // a square r cells out — the 3x3 and friends
  | 'radius'        // everything within a euclidean radius
  | 'ring'          // the shell of cells at radius r, expanding
  | 'line'          // a straight run from the target
  | 'row'           // the target's whole row
  | 'split'         // n cells fanning out from the target
  | 'behind'        // the target and the cells beyond it on one axis
  | 'bounce'        // a ricochet path of n hops
  | 'chain'         // a roll-continued random walk — 1 cell, or twenty
  | 'charged'       // the n fullest cells within r
  | 'weak'          // cells UNDER a fraction of cap within r
  | 'vein'          // the connected ore pocket the target sits in
  | 'vines'         // the connected vined region
  | 'mature'        // grown plants within r
  | 'scatter';      // n cells anywhere on the face

/** WHAT IT LOOKS LIKE. The renderer switches on this; see ui/face/abilityFx.ts. */
export type PlanFigure =
  | 'burst'         // ring + shards at every cell
  | 'slam'          // one heavy impact ring, screen shake
  | 'bolt'          // jagged forked lightning along a path, with a trail
  | 'beam'          // straight bright lines from a point
  | 'ring'          // an expanding circle
  | 'implode'       // streaks dragged inward to a point
  | 'push'          // streaks driven outward from a point
  | 'sequence'      // the cells go off one after another — a domino
  | 'outline'       // a border drawn around the whole set, then a sweep
  | 'arcs'          // parabolas thrown from the target to each cell
  | 'blot'          // organic spreading stain
  | 'hole'          // a dark disc that pulls the cells into it
  | 'plume'         // an upward eruption
  | 'ghost'         // a translucent replay of a shape
  | 'blink'         // a teleport streak between two points
  | 'cataclysm';    // everything at once — reserved for Aleph

export interface DrillAbilityDef {
  id: string;
  name: string;
  /** Which shell's materials this belongs to — gates when it can be forged. */
  shell: string;
  /** What it does, in the game's voice. Shown only AFTER discovery. */
  effect: string;
  /** Flavour. Shown only after discovery. */
  line: string;

  /** The geometry it clears, and its parameters. */
  shape: PlanShape;
  /** How it draws. */
  figure: PlanFigure;
  /** The figure's colour, as a hex int the renderer uses directly. */
  color: number;

  /**
   * POWER TIER 1–5 — what it costs of the bay's loadout budget. This is the
   * "you can only run so many broken things at once" dial, and it is sized by
   * how much of the face the ability touches per firing, not by feel.
   */
  power: number;
  /** Pricing weight for the pour (systems/drillAlloys.ts `alloyCost`). */
  weight: number;

  /**
   * THE CHARGE METER. `need` strokes to fill. `roll` is a per-stroke chance to
   * fill it outright (the "sometimes it just happens" abilities). `onFull` adds
   * this much extra whenever the drill strikes a cell at 70%+ of cap, which is
   * how "mining a charged cell releases lightning" becomes a meter rule rather
   * than a special case.
   */
  charge: { need: number; roll?: number; onFull?: number };

  /** Shape parameters — radius, count, share, whatever the generator reads. */
  params: Record<string, number>;
  /** Which params a better GRADE improves, and how. */
  grow?: Record<string, 'add' | 'mult' | 'shrink'>;

  /** The trait signature. Matched against the POOLED traits of the pour. */
  needs: Partial<Record<TraitId, number>>;
}

export const SHELL_ORDINAL: Record<string, number> = {
  loam: 1, ferrite: 2, verdance: 3, glassmere: 4, cinder: 5, hollow: 6, aleph: 7,
};

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

export const GRADE_STEP_GAIN = 0.30;

export function shellOrdinal(shellId: string): number {
  return SHELL_ORDINAL[shellId] ?? 1;
}

// Shell palettes — a bay running four shells' abilities should read as four
// different weathers on the rock, not four shades of amber.
const LOAM = 0xf0b429;
const FERRITE = 0x9fd8ff;
const VERDANCE = 0x7fe08a;
const GLASSMERE = 0xa8e8ff;
const CINDER = 0xff8a3c;
const HOLLOW = 0xc0a8ff;
const ALEPH = 0xfff0b0;

/**
 * THE TWENTY-NINE.
 *
 * (The brief asked for "28 abilities" and then listed twenty-nine — five in
 * Loam and four in each of the other six. The LIST is what was built, because
 * a list is a specification and a count is a summary of one.)
 */
export const DRILL_ABILITIES: DrillAbilityDef[] = [
  // ══ SHELL I · LOAM ══════════════════════════════════════════════════════
  {
    id: 'veinminer', name: 'Vein Miner', shell: 'loam',
    effect: 'It finds the whole vein and will not let go until every last cell of it is out.',
    line: 'Follows the seam like it can smell where it goes.',
    shape: 'vein', figure: 'outline', color: LOAM,
    power: 1, weight: 2,
    charge: { need: 10 },
    params: { max: 10, share: 1 },
    grow: { max: 'add' },
    needs: { dense: 2 },
  },
  {
    id: 'slagburst', name: 'Slagburst', shell: 'loam',
    effect: 'Every so often a strike goes off instead of landing — three cells by three, all at once.',
    line: 'Something in the head has been waiting thirty swings to do that.',
    shape: 'block', figure: 'burst', color: LOAM,
    power: 2, weight: 3,
    charge: { need: 30 },
    params: { r: 1, share: 0.85 },
    grow: { r: 'add', share: 'mult' },
    needs: { brittle: 2 },
  },
  {
    id: 'chainbreaker', name: 'Chainbreaker', shell: 'loam',
    effect: 'A strike arcs to the next cell, and the next, and keeps going until the luck runs out. Sometimes one. Sometimes twenty.',
    line: 'You never know how far it is going to go. That is most of the pleasure.',
    shape: 'chain', figure: 'bolt', color: 0xfff2b0,
    power: 3, weight: 4,
    charge: { need: 14, roll: 0.06 },
    params: { keep: 0.72, cap: 24, share: 0.8 },
    grow: { keep: 'mult', cap: 'add' },
    needs: { charged: 2, brittle: 1 },
  },
  {
    id: 'tunnelbore', name: 'Tunnel Bore', shell: 'loam',
    effect: 'It stops chipping and bores — a straight tunnel driven clean through five cells of rock.',
    line: 'Line it up and let it run. The rock is not consulted.',
    shape: 'line', figure: 'beam', color: 0xd9a441,
    power: 2, weight: 3,
    charge: { need: 16 },
    params: { len: 5, share: 0.9 },
    grow: { len: 'add' },
    needs: { tough: 1, dense: 1 },
  },
  {
    id: 'heavystrike', name: 'Heavy Strike', shell: 'loam',
    effect: 'Every tenth swing comes down empowered and takes the cell whole, however hard it was.',
    line: 'Nine to set the feet. The tenth is the one that counts.',
    shape: 'single', figure: 'slam', color: 0xffd27f,
    power: 1, weight: 2,
    charge: { need: 10 },
    params: { share: 1 },
    needs: { tough: 2 },
  },

  // ══ SHELL II · FERRITE ══════════════════════════════════════════════════
  {
    id: 'arclightning', name: 'Arc Lightning', shell: 'ferrite',
    effect: 'Break a full cell and the charge comes out of it — lightning leaping between every charged cell nearby.',
    line: 'The whole face lights up for half a second and you can see where the good rock is.',
    shape: 'charged', figure: 'bolt', color: FERRITE,
    power: 3, weight: 4,
    charge: { need: 12, onFull: 3 },
    params: { n: 5, r: 3, share: 0.7 },
    grow: { n: 'add', share: 'mult' },
    needs: { charged: 2, keen: 1 },
  },
  {
    id: 'magneticpull', name: 'Magnetic Pull', shell: 'ferrite',
    effect: 'The ore in the rock around it slides in and clumps up against the drill.',
    line: 'It does not go to the seam. The seam comes to it.',
    shape: 'radius', figure: 'implode', color: 0xbfd8e8,
    power: 2, weight: 3,
    charge: { need: 22 },
    params: { r: 3, share: 0.35, pull: 1 },
    grow: { r: 'add', pull: 'add' },
    needs: { dense: 2, charged: 1 },
  },
  {
    id: 'staticoverload', name: 'Static Overload', shell: 'ferrite',
    effect: 'It banks the charge while it works and then lets the whole lot go at once, into everything around it.',
    line: 'Your hair stands up a second before it happens.',
    shape: 'radius', figure: 'push', color: 0xdff0ff,
    power: 4, weight: 5,
    charge: { need: 28, onFull: 2 },
    params: { r: 2, share: 0.95 },
    grow: { r: 'add', share: 'mult' },
    needs: { charged: 3 },
  },
  {
    id: 'repulsor', name: 'Repulsor', shell: 'ferrite',
    effect: 'A flat blast outward — everything touching the drill is thrown off the wall.',
    line: 'It clears its own elbow room.',
    shape: 'block', figure: 'push', color: 0x9fb8c8,
    power: 2, weight: 3,
    charge: { need: 14 },
    params: { r: 1, share: 0.7 },
    grow: { r: 'add', share: 'mult' },
    needs: { tough: 1, charged: 1, dense: 1 },
  },

  // ══ SHELL III · VERDANCE ════════════════════════════════════════════════
  {
    id: 'rootbreaker', name: 'Rootbreaker', shell: 'verdance',
    effect: 'Tear one vine and the whole connected root goes with it, cell after cell, all the way to the end.',
    line: 'They were never separate plants. You just could not see the join.',
    shape: 'vines', figure: 'sequence', color: VERDANCE,
    power: 3, weight: 4,
    charge: { need: 18 },
    params: { max: 14, share: 1 },
    grow: { max: 'add' },
    needs: { springy: 2 },
  },
  {
    id: 'bloomharvest', name: 'Bloom Harvest', shell: 'verdance',
    effect: 'A ripe plant bursts, and the burst sets off every ripe plant near it.',
    line: 'One goes, and then the whole bank of them goes.',
    shape: 'mature', figure: 'burst', color: 0xa8f0a0,
    power: 3, weight: 4,
    charge: { need: 20 },
    params: { r: 3, share: 1 },
    grow: { r: 'add' },
    needs: { springy: 1, keen: 1, light: 1 },
  },
  {
    id: 'seedspread', name: 'Seed Spread', shell: 'verdance',
    effect: 'What it harvests, it throws — seed arcs out across the face and something new comes up where it lands.',
    line: 'You clear a patch and find you have planted three more.',
    shape: 'scatter', figure: 'arcs', color: 0x8fe0b0,
    power: 2, weight: 3,
    charge: { need: 18 },
    params: { n: 3, share: 0.5, plant: 1 },
    grow: { n: 'add', plant: 'add' },
    needs: { springy: 1, light: 1 },
  },
  {
    id: 'parasite', name: 'Parasite', shell: 'verdance',
    effect: 'A rot crawls out from the strike, cell to connected cell, and everything it reaches gives up easier.',
    line: 'You can watch it going. It takes its time and it does not stop.',
    shape: 'chain', figure: 'blot', color: 0x9fd07f,
    power: 2, weight: 3,
    charge: { need: 22 },
    params: { keep: 0.6, cap: 10, share: 0.4, rot: 12 },
    grow: { cap: 'add', rot: 'mult' },
    needs: { springy: 1, hollow: 1, brittle: 1 },
  },

  // ══ SHELL IV · GLASSMERE ════════════════════════════════════════════════
  {
    id: 'prismshot', name: 'Prism Shot', shell: 'glassmere',
    effect: 'The stroke goes through a facet and comes out as three, and three cells break at once.',
    line: 'One swing. Three holes. It should not work and it does.',
    shape: 'split', figure: 'beam', color: GLASSMERE,
    power: 3, weight: 4,
    charge: { need: 8 },
    params: { n: 3, len: 2, share: 0.75 },
    grow: { n: 'add', share: 'mult' },
    needs: { brittle: 2, keen: 1 },
  },
  {
    id: 'ricochet', name: 'Ricochet', shell: 'glassmere',
    effect: 'It does not stop where it lands — it comes off at an angle and finds the next one, and the next.',
    line: 'Straight lines are for people who have not tried this.',
    shape: 'bounce', figure: 'bolt', color: 0xcdf0ff,
    power: 3, weight: 4,
    charge: { need: 12, roll: 0.05 },
    params: { hops: 4, share: 0.7 },
    grow: { hops: 'add' },
    needs: { keen: 2, springy: 1 },
  },
  {
    id: 'refraction', name: 'Refraction', shell: 'glassmere',
    effect: 'The beam goes straight through the first cell without stopping and breaks the one behind it.',
    line: 'The front of the rock is not the point. It never was.',
    shape: 'behind', figure: 'beam', color: 0xb0e0f0,
    power: 2, weight: 3,
    charge: { need: 10 },
    params: { depth: 2, share: 0.8 },
    grow: { depth: 'add', share: 'mult' },
    needs: { brittle: 1, hollow: 1, keen: 1 },
  },
  {
    id: 'overchargebeam', name: 'Overcharge Beam', shell: 'glassmere',
    effect: 'It brightens while it works, and brightens, and then puts a beam through everything in the line.',
    line: 'The whole row, gone, and a white line burnt on your eye for a second after.',
    shape: 'row', figure: 'beam', color: 0xffffff,
    power: 5, weight: 6,
    charge: { need: 34, onFull: 2 },
    params: { share: 1 },
    needs: { charged: 2, brittle: 2 },
  },

  // ══ SHELL V · CINDER ════════════════════════════════════════════════════
  {
    id: 'magmaburst', name: 'Magma Burst', shell: 'cinder',
    effect: 'The floor opens under it and the rock around it goes soft and runs.',
    line: 'It comes up, not down. Nobody expects that the first time.',
    shape: 'radius', figure: 'plume', color: CINDER,
    power: 3, weight: 4,
    charge: { need: 14 },
    params: { r: 1.6, share: 0.8, burn: 6 },
    grow: { r: 'add', share: 'mult', burn: 'mult' },
    needs: { warm: 2 },
  },
  {
    id: 'heatwave', name: 'Heat Wave', shell: 'cinder',
    effect: 'A ring of heat goes out from the drill and everything the edge of it touches lets go.',
    line: 'You can see it travelling. You can see exactly where it is going to reach.',
    shape: 'ring', figure: 'ring', color: 0xffb066,
    power: 4, weight: 5,
    charge: { need: 24 },
    params: { r: 3, share: 0.9 },
    grow: { r: 'add', share: 'mult' },
    needs: { warm: 2, brittle: 1 },
  },
  {
    id: 'pressureblast', name: 'Pressure Blast', shell: 'cinder',
    effect: 'It builds and builds and then the whole face jumps.',
    line: 'Hold on to something.',
    shape: 'radius', figure: 'burst', color: 0xff7043,
    power: 4, weight: 5,
    charge: { need: 30 },
    params: { r: 2.4, share: 1, shake: 9 },
    grow: { r: 'add' },
    needs: { warm: 1, dense: 1, tough: 1 },
  },
  {
    id: 'moltencore', name: 'Molten Core', shell: 'cinder',
    effect: 'It runs too hot and stays too hot, and for a while everything near it just keeps melting.',
    line: 'Nothing to do but stand back and let it finish.',
    shape: 'radius', figure: 'plume', color: 0xff5722,
    power: 4, weight: 5,
    charge: { need: 26 },
    params: { r: 1.6, share: 0.5, burn: 14 },
    grow: { burn: 'mult', r: 'add' },
    needs: { warm: 2, dense: 1 },
  },

  // ══ SHELL VI · HOLLOW ═══════════════════════════════════════════════════
  {
    id: 'voidconsumption', name: 'Void Consumption', shell: 'hollow',
    effect: 'A small absence opens beside the drill, and the rock nearest it stops being there.',
    line: 'It is not broken and it is not taken. It is just not there any more.',
    shape: 'radius', figure: 'hole', color: HOLLOW,
    power: 4, weight: 5,
    charge: { need: 20 },
    params: { r: 2, share: 1 },
    grow: { r: 'add' },
    needs: { hollow: 2 },
  },
  {
    id: 'realityskip', name: 'Reality Skip', shell: 'hollow',
    effect: 'It skips the next few cells entirely and is suddenly working one much further on.',
    line: 'It did not travel. It was here and then it was there.',
    shape: 'line', figure: 'blink', color: 0xd0b8ff,
    power: 3, weight: 4,
    charge: { need: 12 },
    params: { len: 3, skip: 3, share: 1 },
    grow: { skip: 'add', len: 'add' },
    needs: { hollow: 1, light: 1, trueseated: 1 },
  },
  {
    id: 'echomine', name: 'Echo Mine', shell: 'hollow',
    effect: 'Whatever shape it broke last time happens again, somewhere else, on its own.',
    line: 'The face remembers being hit and does it to itself.',
    shape: 'scatter', figure: 'ghost', color: 0xb0a0d8,
    power: 4, weight: 5,
    charge: { need: 16 },
    params: { n: 6, share: 0.75 },
    grow: { n: 'add' },
    needs: { hollow: 1, trueseated: 2 },
  },
  {
    id: 'nullpulse', name: 'Null Pulse', shell: 'hollow',
    effect: 'A dark wave goes out, and every cell too weak to hold together simply goes.',
    line: 'It only takes what was nearly gone anyway. It takes all of it.',
    shape: 'weak', figure: 'ring', color: 0x8f7ab8,
    power: 3, weight: 4,
    charge: { need: 18 },
    params: { r: 3.5, under: 0.45, share: 1 },
    grow: { r: 'add', under: 'mult' },
    needs: { hollow: 2, light: 1 },
  },

  // ══ SHELL VII · ALEPH ═══════════════════════════════════════════════════
  {
    id: 'cataclysm', name: 'Cataclysm', shell: 'aleph',
    effect: 'Every ability the bay is carrying fires at the same moment.',
    line: 'There is no describing it. Set it off and watch.',
    shape: 'radius', figure: 'cataclysm', color: ALEPH,
    power: 5, weight: 8,
    charge: { need: 44 },
    params: { r: 2, share: 0.6 },
    needs: { charged: 2, trueseated: 2 },
  },
  {
    id: 'cascade', name: 'Cascade', shell: 'aleph',
    effect: 'One ability going off has a habit of setting off another. Occasionally that one sets off a third.',
    line: 'It is very hard to stop once it has decided to start.',
    shape: 'single', figure: 'ghost', color: 0xffe08a,
    power: 5, weight: 8,
    charge: { need: 26 },
    params: { chance: 0.45, depth: 2, share: 0.5 },
    grow: { chance: 'mult', depth: 'add' },
    needs: { charged: 1, trueseated: 1, keen: 1, dense: 1 },
  },
  {
    id: 'singularity', name: 'Singularity', shell: 'aleph',
    effect: 'Everything within reach is dragged to one point, held there for a moment, and then is not.',
    line: 'The pause before it goes off is the worst part.',
    shape: 'radius', figure: 'hole', color: 0xfff4c0,
    power: 5, weight: 8,
    charge: { need: 32 },
    params: { r: 3, share: 1 },
    grow: { r: 'add' },
    needs: { dense: 2, trueseated: 2 },
  },
  {
    id: 'genesis', name: 'Genesis', shell: 'aleph',
    effect: 'For a moment the face forgets which world it is in — lightning, vines, pressure, beams, absence, whatever it feels like.',
    line: 'All seven of them, briefly, in the wrong place.',
    shape: 'scatter', figure: 'cataclysm', color: 0xffffff,
    power: 5, weight: 8,
    charge: { need: 36 },
    params: { n: 8, share: 0.8 },
    grow: { n: 'add' },
    needs: { charged: 2, dense: 1, trueseated: 1 },
  },
];

export const ABILITY_BY_ID = new Map(DRILL_ABILITIES.map((a) => [a.id, a]));

/** ALEPH abilities that read the rest of the bay rather than the rock. */
export const META_ABILITIES = new Set(['cataclysm', 'cascade', 'genesis']);

/** How far past its own shell this alloy was poured. Never negative. */
export function gradeStep(def: DrillAbilityDef, grade: number): number {
  return Math.max(0, Math.min(7, Math.round(grade)) - shellOrdinal(def.shell));
}

/**
 * HOW A GRADE READS ON A PARAM. `add` gains one per step (a cell, a hop, a
 * radius), `mult` gains GRADE_STEP_GAIN per step, `shrink` divides. A `share`
 * is clamped at 1 — an ability may take a whole cell and never more, which is
 * where pillar 2 is enforced at the data layer rather than at the call site.
 */
export function abilityParams(def: DrillAbilityDef, grade: number): Record<string, number> {
  const step = gradeStep(def, grade);
  const out: Record<string, number> = { ...def.params };
  if (step > 0) {
    for (const [key, how] of Object.entries(def.grow ?? {})) {
      const base = out[key];
      if (base === undefined) continue;
      if (how === 'add') out[key] = base + step;
      else if (how === 'mult') out[key] = base * (1 + GRADE_STEP_GAIN * step);
      else out[key] = Math.max(1, base / (1 + GRADE_STEP_GAIN * step));
    }
  }
  if (out['share'] !== undefined) out['share'] = Math.min(1, out['share']);
  if (out['keep'] !== undefined) out['keep'] = Math.min(0.93, out['keep']);
  if (out['chance'] !== undefined) out['chance'] = Math.min(0.85, out['chance']);
  if (out['under'] !== undefined) out['under'] = Math.min(0.9, out['under']);
  return out;
}

/** Every trait the fed materials carry, counted. */
export function traitPool(materialIds: string[]): Partial<Record<TraitId, number>> {
  const pool: Partial<Record<TraitId, number>> = {};
  for (const id of materialIds) {
    for (const t of traitsOf(id)) pool[t] = (pool[t] ?? 0) + 1;
  }
  return pool;
}

function satisfies(pool: Partial<Record<TraitId, number>>, def: DrillAbilityDef): boolean {
  for (const [trait, n] of Object.entries(def.needs)) {
    if ((pool[trait as TraitId] ?? 0) < (n as number)) return false;
  }
  return true;
}

export interface MatchOpts {
  /** The deepest shell ordinal the player has reached. */
  reached?: number;
  /** A KNOWN ability the player is aiming at. */
  prefer?: string | null;
}

/**
 * WHICH ABILITY THIS EXACT MIX MAKES, or null for slag.
 *
 * Most-demanding signature first, then deepest shell on a tie: by the time two
 * fit, the newer one is the one the player descended for. `prefer` lets the
 * bench aim at something ALREADY DISCOVERED, because with twenty-nine
 * signatures live a generous mix in a deep shell satisfies several and an old
 * favourite would otherwise become impossible to re-pour. It is not a pillar-5
 * hole: you cannot aim at what you have never made, a known ability already
 * prints its signature, and an aimed pour the mix cannot carry falls through.
 */
export function matchDrillAlloy(
  materialIds: string[], opts: MatchOpts = {},
): DrillAbilityDef | null {
  return matchAllAbilities(materialIds, opts)[0] ?? null;
}

/**
 * EVERY ability this mix satisfies, best first — the same ranking `matchDrillAlloy`
 * has always used, lifted out so a second carrier can read it.
 *
 * A POUR takes the head of this list and nothing else: three materials go in the
 * crucible and one ability comes out, which is what makes a pour a decision.
 * A TOOL reads the whole list, because its ability-bearing parts are a standing
 * mix rather than a one-shot pour — what it CAN do is a property of the build,
 * and how many of them it may carry at once is a separate question the slots
 * answer (`systems/toolAbilities.ts`).
 *
 * One matcher, one `satisfies`, one ranking. A second copy of this arithmetic is
 * how the tool and the bay would drift into disagreeing about what a signature
 * means, and this project has shipped a shadowed twin formula before (A.44).
 */
export function matchAllAbilities(
  materialIds: string[], opts: MatchOpts = {},
): DrillAbilityDef[] {
  if (materialIds.length === 0) return [];
  const pool = traitPool(materialIds);
  const reached = opts.reached ?? 7;
  const live = DRILL_ABILITIES.filter((a) => shellOrdinal(a.shell) <= reached);

  const ranked = [...live].sort((a, b) => {
    const da = Object.values(a.needs).reduce((x, y) => x + (y as number), 0);
    const db = Object.values(b.needs).reduce((x, y) => x + (y as number), 0);
    if (db !== da) return db - da;
    return shellOrdinal(b.shell) - shellOrdinal(a.shell);
  });
  const out = ranked.filter((def) => satisfies(pool, def));

  // AIMING moves a known ability to the head without changing the set.
  if (opts.prefer) {
    const at = out.findIndex((a) => a.id === opts.prefer);
    if (at > 0) out.unshift(...out.splice(at, 1));
  }
  return out;
}

/** The trait the pool leans on hardest, for the hint and the miss message. */
export function dominantTrait(materialIds: string[]): TraitId | null {
  const pool = traitPool(materialIds);
  let best: TraitId | null = null;
  let bestN = 0;
  for (const [t, n] of Object.entries(pool)) {
    if ((n ?? 0) > bestN) { bestN = n ?? 0; best = t as TraitId; }
  }
  return best;
}

/**
 * WHAT THE BENCH SAYS BEFORE YOU POUR — the MIX, never the ability.
 *
 * A.57 note: all ten traits are read by something now, so none of these lines
 * can say "and nothing in it reaches past that" any more. Each one describes
 * the BEHAVIOUR the trait tends toward without naming a single ability, which
 * is what makes a first pour a reasoned guess rather than a coin.
 */
const TRAIT_HINT: Record<TraitId, string> = {
  charged: 'It will not settle. Whatever is in this is looking for somewhere to jump to.',
  dense: 'Heavy out of all proportion. Set it down and things nearby lean toward it.',
  warm: 'It holds the heat long after the fire is out, and passes it on to whatever it touches.',
  keen: 'It takes an edge and keeps it, and what it cuts tends to carry on being cut.',
  tough: 'It will not break, so whatever it hits does the breaking instead.',
  light: 'Almost nothing in the hand. It goes further than you meant it to.',
  springy: 'It gives and comes back, and it does not seem to know when to stop.',
  brittle: 'It wants to come apart — and it wants to take whatever is beside it along.',
  hollow: 'There is a space inside it, and the space goes further than the piece does.',
  trueseated: 'It sits exactly where you put it, and holds a line further than you would think.',
};

/** A reasoning aid, not an answer. */
export function alloyHint(materialIds: string[]): string | null {
  if (materialIds.length === 0) return null;
  const dom = dominantTrait(materialIds);
  if (!dom) return null;
  const pool = traitPool(materialIds);
  const n = pool[dom] ?? 0;
  const base = TRAIT_HINT[dom];
  return n >= 2 ? `${base} Strongly — there is a lot of it in here.` : base;
}

/** Legacy kind alias — nothing reads it now, kept so old imports fail loudly
 *  rather than silently resolving to `any`. */
export type DrillAbilityKind = never;
