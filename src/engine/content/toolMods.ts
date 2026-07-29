/**
 * THE MODIFIER LIBRARY — what you stack onto a tool to build toward broken.
 *
 * The doc's step 5: "after building, add modifiers by combining the tool with
 * materials — Tinkers-style. Binding material sets how many modifier slots.
 * Modifiers are where the tool grows late-game — discovered, not fully listed."
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PILLAR 2 IS IN THE TYPE, NOT IN THE REVIEWER.
 *
 * `ModEffectDef` has a field for every axis a modifier is allowed to touch —
 * reach, splash, ore speed, drops, durability, xp, ability behaviour — and NO
 * FIELD for yield-per-charge. A modifier that multiplied dust per charge is not
 * something you have to remember not to write; it is unrepresentable, and
 * `toolMods.test.ts` asserts the key set so that stays true when someone adds
 * the thirty-third entry.
 *
 * That is this project's own working rule ("put the invariant in the type, not
 * in the reviewer"), applied to the system with the most reason to break it: a
 * library built explicitly to make the player overpowered.
 *
 * The two axes that look yield-shaped and are not:
 *  - `splash` and `paramMult.share` decide what FRACTION of a cell a hit takes.
 *    Both end at `harvestCell`, which takes `min(fraction × held, held − floor)`
 *    — so a share of 5 is a share of 1, and `abilityParams` clamps it there
 *    anyway. Taking all of a cell is the ceiling, and it always was.
 *  - `dropWeight` is outside the charge economy entirely (A.56 established drop
 *    rolls fire on WEIGHT), which is exactly why it is the one multiplier the
 *    tool has ever been allowed and why it stays bounded.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE OP ARC, and why it is earned rather than handed over.
 *
 * Slots come from the Binding stone and from levels, and both are measured:
 * a Loam tool has 2–3 modifier slots, an Aleph one 10–18, and levelling adds
 * one per five levels (+15 by level 80). So an opening tool takes ONE cheap
 * modifier and a late tool takes fifteen, including the four- and five-slot
 * capstones. Tinkers hands you the stacking on day one; here the stacking IS
 * the game, and the library grows as you descend (`shell` gates every entry
 * behind having BEEN there).
 *
 * COMBO modifiers are the point of the whole file. They do nothing at all on
 * their own and multiply what is already on the tool — so the broken build is
 * something you assemble, notice, and then deliberately go and finish.
 */
import type { TraitId } from '../traits';
import { traitPool } from './drillAlloys';

export type ModCategory = 'stat' | 'ability' | 'utility' | 'combo';

/**
 * EVERY AXIS A MODIFIER MAY TOUCH. Adding a field here is a pillar-2 decision
 * and should be argued for in the commit that does it.
 */
export interface ModEffectDef {
  // ── THE TOOL ──────────────────────────────────────────────────────────
  /** Extra cells one swing reaches. Additive; still clamped to the 3x3. */
  cells?: number;
  /** Fraction of each EXTRA cell taken. Additive; `harvestCell` bounds it. */
  splash?: number;
  /** Multiplier on hold-gesture pocket work. */
  oreRate?: number;
  /** Multiplier on drop-roll weight — outside the charge economy. */
  dropWeight?: number;
  /** Multiplier on swings before re-seating. */
  uses?: number;
  /** Multiplier on cells-mined credited toward the next level. */
  xpRate?: number;
  /** Fraction of the wear pool put right each second, unattended. */
  repairPerSec?: number;
  /** Additive room for abilities. Never modifier slots — see the note below. */
  abilitySlots?: number;

  // ── WHAT IT IS CARRYING ───────────────────────────────────────────────
  /** Additive swings-worth of meter per swing. Base is 1. */
  chargePerSwing?: number;
  /** Additive grade steps on every seated ability. */
  abilityGrade?: number;
  /** Additive on named ability params — `r` widens a blast, `hops` lengthens
   *  a ricochet, `cap` lets a chain run further. */
  paramAdd?: Record<string, number>;
  /** Multiplicative on named ability params. */
  paramMult?: Record<string, number>;

  // ── BEHAVIOURS ────────────────────────────────────────────────────────
  /** A swing also works any ore pocket inside its reach. */
  oreReach?: boolean;
  /** Chance a firing happens a second time, somewhere else on the face. */
  refire?: number;
  /** Fraction of the wear pool put right by each firing. */
  repairOnFire?: number;
  /** Meter given to the tool's OTHER seated abilities when one fires. */
  chargeOnFire?: number;

  /** COMBO ONLY: multiplies what every other modifier contributes. */
  amplify?: number;

  /**
   * RELIABILITY, not power — the counterweight axis.
   *
   * Instability is what a tool accrues for carrying powerful things, and a
   * `stabilize` term takes it back off. It is on the allowed list because it is
   * the OPPOSITE of a faucet: it buys no reach, no speed and no drops, only the
   * chance that what you already have does what you told it to. A tool with
   * every stabiliser in the game and nothing else is a perfectly reliable tool
   * that mines exactly like bare hands.
   */
  stabilize?: number;
}

/**
 * THE ALLOWED SET, as data. `toolMods.test.ts` walks every def and asserts no
 * key outside this appears — the registry cannot grow a yield term by accident,
 * and a cast at a call site cannot smuggle one in either (the P14 lesson: the
 * name can be wrong, the name can be read by nothing, or the SHAPE can be
 * wrong, and each needs its own guard).
 */
export const MOD_AXES = [
  'cells', 'splash', 'oreRate', 'dropWeight', 'uses', 'xpRate', 'repairPerSec',
  'abilitySlots', 'chargePerSwing', 'abilityGrade', 'paramAdd', 'paramMult',
  'oreReach', 'refire', 'repairOnFire', 'chargeOnFire', 'amplify', 'stabilize',
] as const;

// ---------------------------------------------------------------------------
// LEVELS — a modifier grows into what it does
// ---------------------------------------------------------------------------

/**
 * A MODIFIER LEARNS THE WORK, the same way the tool carrying it does.
 *
 * Five levels, and the level multiplies what the modifier CONTRIBUTES — a
 * level-V Wider Blast adds more radius than a level-I one. It never touches an
 * axis the modifier does not already have, so levelling cannot introduce a term
 * pillar 2 has not already cleared: it scales a vector, it does not rotate it.
 *
 * XP is the same currency the tool levels on — cells that actually gave
 * something up — so a modifier is paced by field regen exactly as everything
 * else is, and cannot be tapped for. ABILITY-facing modifiers count FIRINGS
 * instead, weighted up because a firing is much rarer than a cell.
 */
export const MOD_LEVEL_MAX = 5;
export const MOD_XP_BASE = 900;
export const MOD_XP_EXP = 1.7;
/** What each level past the first adds to the modifier's contribution. */
export const MOD_LEVEL_STEP = 0.375;
/** A firing is worth this many cells to an ability-facing modifier. */
export const MOD_FIRE_WEIGHT = 40;

export function modXpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(MOD_XP_BASE * Math.pow(level - 1, MOD_XP_EXP));
}

export function modLevelOf(xp: number): number {
  let n = 1;
  while (n < MOD_LEVEL_MAX && xp >= modXpForLevel(n + 1)) n++;
  return n;
}

/** The multiplier a level puts on everything the modifier contributes. */
export function modLevelScale(level: number): number {
  return 1 + MOD_LEVEL_STEP * (Math.max(1, Math.min(MOD_LEVEL_MAX, level)) - 1);
}

/**
 * AN ABILITY LEVELS TOO, and the brief's example is the reason: "Slagburst
 * I→V, starts small, ends screen-clearing".
 *
 * It reuses the GRADE machinery rather than adding a second scale — a level is
 * worth a grade step, which `abilityParams` already knows how to spend on `r`,
 * `hops`, `share` and the rest, and which `share`'s clamp at 1 already bounds.
 * So a level-V Slagburst is a five-by-five (r 1 → 2 at level III, → 3 at V) and
 * every guarantee the grade ladder carries carries over untouched.
 *
 * XP is FIRINGS. An ability that never goes off learns nothing.
 */
export const ABILITY_LEVEL_MAX = 5;
export const ABILITY_XP_PER_LEVEL = [0, 12, 40, 110, 260];

export function abilityLevelOf(fires: number): number {
  let n = 1;
  while (n < ABILITY_LEVEL_MAX && fires >= ABILITY_XP_PER_LEVEL[n]!) n++;
  return n;
}

export function abilityXpForLevel(level: number): number {
  return ABILITY_XP_PER_LEVEL[Math.max(0, Math.min(ABILITY_LEVEL_MAX - 1, level - 1))] ?? 0;
}

/** What a combo modifier waits for. Unmet = seated, visible, and INERT. */
export interface ModRequires {
  /** Other modifiers that must be on the tool. */
  mods?: string[];
  /** How many other modifiers of any kind. */
  others?: number;
  /** How many abilities must be seated. */
  abilities?: number;
}

export interface ToolModDef {
  id: string;
  name: string;
  /** Which shell's materials this belongs to — gates when it can be found. */
  shell: string;
  category: ModCategory;
  /** What it does, in the game's voice. Shown only AFTER discovery. */
  effect: string;
  /** Flavour. Shown after discovery. */
  line: string;
  /** Slots it eats, per stack. Rarer and stronger cost more. */
  cost: number;
  /** How many times it may be applied to one tool. */
  maxStacks: number;
  /** Units of EACH fed material consumed per application. */
  units: number;
  /** The trait signature, matched against the pooled traits of what you feed. */
  needs: Partial<Record<TraitId, number>>;
  fx: ModEffectDef;
  requires?: ModRequires;
  color: number;
}

const LOAM = 0xf0b429;
const FERRITE = 0x8fb8d8;
const VERDANCE = 0x86c06a;
const GLASSMERE = 0xb9a8e8;
const CINDER = 0xe8703a;
const HOLLOW = 0x9a90a8;
const ALEPH = 0xf2e9d0;

/**
 * THIRTY-TWO OF THEM, and the shape of the list is the design: cheap
 * single-axis modifiers early, expensive multi-axis ones deep, and four combos
 * that are worth nothing alone.
 */
export const TOOL_MODS: ToolModDef[] = [
  // ═══ STAT — reach, speed, durability, drops ═══════════════════════════
  {
    id: 'longarm', name: 'Long Arm', shell: 'loam', category: 'stat',
    effect: 'One more cell falls to every swing.',
    line: 'You are not reaching further. The rock is closer.',
    cost: 2, maxStacks: 2, units: 4, needs: { light: 2 },
    fx: { cells: 1 }, color: LOAM,
  },
  {
    id: 'heavyhead', name: 'Heavy Head', shell: 'loam', category: 'stat',
    effect: 'The cells around the strike give up more of what they are holding.',
    line: 'It wants to fall. You only have to point it.',
    cost: 1, maxStacks: 3, units: 3, needs: { dense: 2 },
    fx: { splash: 0.08 }, color: LOAM,
  },
  {
    id: 'quarryjaw', name: 'Quarry Jaw', shell: 'loam', category: 'stat',
    effect: 'Pockets come open faster under the hand.',
    line: 'It finds the seam before you do.',
    cost: 1, maxStacks: 3, units: 3, needs: { keen: 2 },
    fx: { oreRate: 1.3 }, color: LOAM,
  },
  {
    id: 'deepbite', name: 'Deep Bite', shell: 'loam', category: 'stat',
    effect: 'It goes longer between re-seatings.',
    line: 'Whatever is in this does not seem to notice the work.',
    cost: 1, maxStacks: 3, units: 3, needs: { tough: 2 },
    fx: { uses: 1.4 }, color: LOAM,
  },
  {
    id: 'luckyseam', name: 'Lucky Seam', shell: 'loam', category: 'stat',
    effect: 'The rock gives up more besides charge.',
    line: 'Same rock. It just seems to be having a better week.',
    cost: 2, maxStacks: 2, units: 5, needs: { trueseated: 2 },
    fx: { dropWeight: 1.2 }, color: LOAM,
  },
  {
    id: 'secondwind', name: 'Second Wind', shell: 'ferrite', category: 'stat',
    effect: 'Considerably longer between re-seatings.',
    line: 'It has decided it is not finished.',
    cost: 2, maxStacks: 2, units: 4, needs: { tough: 1, trueseated: 1 },
    fx: { uses: 1.8 }, color: FERRITE,
  },
  {
    id: 'widearc', name: 'Wide Arc', shell: 'ferrite', category: 'stat',
    effect: 'Another cell again, and the swing carries further round.',
    line: 'The arm goes where it was going anyway. More is in the way.',
    cost: 3, maxStacks: 2, units: 5, needs: { light: 1, springy: 1 },
    fx: { cells: 1, splash: 0.05 }, color: FERRITE,
  },
  {
    id: 'veinsense', name: 'Vein Sense', shell: 'ferrite', category: 'stat',
    effect: 'Pockets open much faster, and it seems to know where they are.',
    line: 'A pull in the wrist, half a second before you see it.',
    cost: 2, maxStacks: 2, units: 4, needs: { keen: 1, charged: 1 },
    fx: { oreRate: 1.6 }, color: FERRITE,
  },
  {
    id: 'shatterface', name: 'Shatterface', shell: 'verdance', category: 'stat',
    effect: 'Everything the swing touches comes away nearly whole.',
    line: 'It does not so much break the rock as convince it.',
    cost: 2, maxStacks: 3, units: 5, needs: { brittle: 2 },
    fx: { splash: 0.14 }, color: VERDANCE,
  },
  {
    id: 'truegrain', name: 'True Grain', shell: 'glassmere', category: 'stat',
    effect: 'What the rock is hiding comes out with it.',
    line: 'Cut along the grain and the world is tidier than you thought.',
    cost: 2, maxStacks: 2, units: 6, needs: { trueseated: 2, keen: 1 },
    fx: { dropWeight: 1.35 }, color: GLASSMERE,
  },
  {
    id: 'farreach', name: 'Far Reach', shell: 'cinder', category: 'stat',
    effect: 'Two more cells to every swing.',
    line: 'There is more of it than there is of you, and it does not care.',
    cost: 4, maxStacks: 2, units: 8, needs: { light: 2, hollow: 1 },
    fx: { cells: 2 }, color: CINDER,
  },
  {
    id: 'unbreaking', name: 'Unbreaking', shell: 'cinder', category: 'stat',
    effect: 'It lasts a very long time indeed.',
    line: 'You will get bored before it does.',
    cost: 3, maxStacks: 2, units: 7, needs: { tough: 2, dense: 1 },
    fx: { uses: 2.5 }, color: CINDER,
  },
  {
    id: 'voidbite', name: 'Void Bite', shell: 'hollow', category: 'stat',
    effect: 'The cells around a strike are all but emptied.',
    line: 'The swing lands where the rock is not, and the rock agrees.',
    cost: 4, maxStacks: 2, units: 8, needs: { hollow: 2, brittle: 1 },
    fx: { splash: 0.25 }, color: HOLLOW,
  },
  {
    id: 'firstform', name: 'First Form', shell: 'aleph', category: 'stat',
    effect: 'Reach, life and luck, all of it, all at once.',
    line: 'This is what a tool was before anyone decided what one was for.',
    cost: 5, maxStacks: 1, units: 10, needs: { trueseated: 2, dense: 1 },
    fx: { cells: 1, splash: 0.12, uses: 2, oreRate: 1.5, dropWeight: 1.25 },
    color: ALEPH,
  },

  // ═══ ABILITY — what the thing it carries does ═════════════════════════
  {
    id: 'widerblast', name: 'Wider Blast', shell: 'loam', category: 'ability',
    effect: 'Everything it sets off covers a step more ground — a three-by-three goes five-by-five.',
    line: 'You packed it too full. It went off too big. Do that again.',
    cost: 2, maxStacks: 2, units: 4, needs: { brittle: 1, dense: 1 },
    fx: { paramAdd: { r: 1 } }, color: LOAM,
  },
  {
    id: 'quickcharge', name: 'Quick Charge', shell: 'loam', category: 'ability',
    effect: 'Everything it carries comes round twice as often.',
    line: 'It has stopped waiting for you to be ready.',
    cost: 2, maxStacks: 3, units: 4, needs: { springy: 2 },
    fx: { chargePerSwing: 1 }, color: LOAM,
  },
  {
    id: 'longchain', name: 'Long Chain', shell: 'ferrite', category: 'ability',
    effect: 'Anything that travels — a chain, a ricochet, a run — goes further before it stops.',
    line: 'It has not run out. It is deciding.',
    cost: 2, maxStacks: 2, units: 5, needs: { charged: 2 },
    fx: { paramAdd: { hops: 2, n: 2, len: 2, cap: 6 } }, color: FERRITE,
  },
  {
    id: 'deepshare', name: 'Deep Share', shell: 'verdance', category: 'ability',
    effect: 'What it sets off takes far more out of every cell it touches.',
    line: 'Nothing left worth coming back for.',
    cost: 3, maxStacks: 2, units: 6, needs: { dense: 2, keen: 1 },
    fx: { paramMult: { share: 1.4 } }, color: VERDANCE,
  },
  {
    id: 'secondseat', name: 'Second Seat', shell: 'verdance', category: 'ability',
    effect: 'Room for one more of the things it was built to do.',
    line: 'There was a space in it all along. You just had not been down far enough to find it.',
    cost: 3, maxStacks: 2, units: 6, needs: { hollow: 2 },
    fx: { abilitySlots: 1 }, color: VERDANCE,
  },
  {
    id: 'graded', name: 'Tempered Intent', shell: 'glassmere', category: 'ability',
    effect: 'Everything it carries behaves as though it were poured from deeper stone.',
    line: 'The metal did not change. Its opinion of itself did.',
    cost: 4, maxStacks: 2, units: 7, needs: { charged: 2, trueseated: 1 },
    fx: { abilityGrade: 1 }, color: GLASSMERE,
  },
  {
    id: 'widerblast2', name: 'Detonation', shell: 'cinder', category: 'ability',
    effect: 'Two more steps of ground on everything it sets off.',
    line: 'The far wall is not far enough away.',
    cost: 4, maxStacks: 2, units: 8, needs: { warm: 2, brittle: 1 },
    fx: { paramAdd: { r: 2 } }, color: CINDER,
  },
  {
    id: 'thirdseat', name: 'Hollow Seat', shell: 'hollow', category: 'ability',
    effect: 'Room for another again.',
    line: 'The space inside it goes further than the piece does.',
    cost: 4, maxStacks: 2, units: 9, needs: { hollow: 3 },
    fx: { abilitySlots: 1 }, color: HOLLOW,
  },
  {
    id: 'overgrade', name: 'First Intent', shell: 'aleph', category: 'ability',
    effect: 'Everything it carries goes off as though it came from two worlds down.',
    line: 'It remembers being made somewhere that has not happened yet.',
    cost: 5, maxStacks: 1, units: 10, needs: { charged: 2, dense: 2 },
    fx: { abilityGrade: 2 }, color: ALEPH,
  },

  // ═══ UTILITY ═════════════════════════════════════════════════════════
  {
    id: 'selfmending', name: 'Self-Mending', shell: 'loam', category: 'utility',
    effect: 'It puts itself right, slowly, while you are doing something else.',
    line: 'You have never seen it happen. It is always a little better than you left it.',
    cost: 2, maxStacks: 3, units: 4, needs: { warm: 2 },
    fx: { repairPerSec: 0.004 }, color: LOAM,
  },
  {
    id: 'quicklearner', name: 'Quick Study', shell: 'ferrite', category: 'utility',
    effect: 'It learns from the work considerably faster.',
    line: 'Twice through and it has the shape of it.',
    cost: 2, maxStacks: 2, units: 5, needs: { springy: 1, hollow: 1 },
    fx: { xpRate: 1.6 }, color: FERRITE,
  },
  {
    id: 'oremagnet', name: 'Lodestone Head', shell: 'verdance', category: 'utility',
    effect: 'A swing works every pocket it reaches, not only the one you hit.',
    line: 'Things come to it. You stopped noticing when.',
    cost: 2, maxStacks: 1, units: 6, needs: { dense: 1, charged: 1 },
    fx: { oreReach: true, oreRate: 1.2 }, color: VERDANCE,
  },
  {
    id: 'restless', name: 'Restless', shell: 'cinder', category: 'utility',
    effect: 'It builds toward going off much faster, and never quite settles.',
    line: 'Set it down and it is still going.',
    cost: 3, maxStacks: 2, units: 7, needs: { warm: 1, springy: 1 },
    fx: { chargePerSwing: 2 }, color: CINDER,
  },
  {
    id: 'echoform', name: 'Echoform', shell: 'hollow', category: 'utility',
    effect: 'What it sets off sometimes happens again, somewhere else on the wall.',
    line: 'It happened twice. It only happened once.',
    cost: 4, maxStacks: 2, units: 9, needs: { hollow: 2, charged: 1 },
    fx: { refire: 0.3 }, color: HOLLOW,
  },

  // ═══ STABILISERS — the counterweight, and the reason OP is engineering ══
  // These buy NOTHING. No reach, no speed, no drops — only the chance that
  // what you have already stacked does what you told it to. They are what
  // turns "pile everything on" into a build with a shape.
  {
    id: 'trueseat', name: 'True Seat', shell: 'loam', category: 'utility',
    effect: 'Everything on it sits a little straighter. Less goes wrong.',
    line: 'It was always going to fit. It just needed telling once.',
    // SIGNATURE PICKED TO BE UNSHADOWABLE, and the first one was not: with
    // `{trueseated: 1, tough: 1}` it was byte-identical to Ferrite's Second
    // Wind, which is deeper and therefore always won the tie — so this entry
    // was in the registry, tested, and unreachable by any mix at any depth.
    // The reach test caught it on the first run. Demand THREE outranks every
    // Loam signature, so it is the answer whenever it fits at all.
    cost: 1, maxStacks: 3, units: 4, needs: { trueseated: 2, tough: 1 },
    fx: { stabilize: 9 }, color: LOAM,
  },
  {
    id: 'deadhand', name: 'Dead Hand', shell: 'glassmere', category: 'utility',
    effect: 'It stops arguing with itself, and lasts longer for it.',
    line: 'No shake in it at all. You have checked twice.',
    cost: 2, maxStacks: 3, units: 6, needs: { trueseated: 2, dense: 2 },
    fx: { stabilize: 22, uses: 1.2 }, color: GLASSMERE,
  },
  {
    id: 'theanchor', name: 'The Anchor', shell: 'aleph', category: 'utility',
    effect: 'Whatever you have done to this thing, it holds.',
    line: 'Every world it has been in agrees about where it is.',
    cost: 4, maxStacks: 2, units: 10, needs: { trueseated: 3 },
    fx: { stabilize: 55 }, color: ALEPH,
  },

  // ═══ COMBO — worth nothing alone, which is the point ══════════════════
  {
    id: 'resonance', name: 'Resonance', shell: 'ferrite', category: 'combo',
    effect: 'Every other modifier on the tool counts for half again as much.',
    line: 'Three things in the metal found the same note.',
    cost: 3, maxStacks: 2, units: 6, needs: { charged: 1, trueseated: 1 },
    requires: { others: 2 },
    fx: { amplify: 1.5 }, color: FERRITE,
  },
  {
    id: 'conduction', name: 'Conduction', shell: 'glassmere', category: 'combo',
    effect: 'Every firing mends the tool. Needs something to fire, and something to mend with.',
    line: 'The going-off and the getting-better turned out to be the same motion.',
    cost: 3, maxStacks: 2, units: 7, needs: { charged: 2, keen: 1 },
    requires: { mods: ['selfmending'], abilities: 1 },
    fx: { repairOnFire: 0.05 }, color: GLASSMERE,
  },
  {
    id: 'sympathy', name: 'Sympathy', shell: 'cinder', category: 'combo',
    effect: 'When one of the things it carries goes off, the others come most of the way round. Needs two.',
    line: 'They have started finishing each other.',
    cost: 4, maxStacks: 2, units: 8, needs: { warm: 1, charged: 1, dense: 1 },
    requires: { abilities: 2 },
    fx: { chargeOnFire: 8 }, color: CINDER,
  },
  {
    id: 'theswarm', name: 'The Whole Note', shell: 'aleph', category: 'combo',
    effect: 'Everything on the tool again, and everything it carries deeper still. Needs Resonance and Tempered Intent already seated.',
    line: 'You built this over a whole world. It knows.',
    cost: 5, maxStacks: 1, units: 12, needs: { hollow: 1, charged: 1, trueseated: 1 },
    requires: { mods: ['resonance', 'graded'] },
    fx: { amplify: 2, abilityGrade: 2 }, color: ALEPH,
  },
];

// ---------------------------------------------------------------------------
// SYNERGIES — what two modifiers turn out to be, together
// ---------------------------------------------------------------------------

/**
 * THE THING YOU FIND BY STACKING.
 *
 * A synergy is not applied. It AWAKENS: put both parents on one tool, at level
 * two or better, and a third thing appears that neither of them was. It costs
 * no slots, because you did not spend anything on it — you arranged the things
 * you already had, which is the entire fantasy this phase exists to deliver.
 *
 * DISCOVERED, NEVER LISTED (pillar 5). Nothing anywhere shows the pairs. What
 * the bench shows is a DIRECTION — `hint` describes the shape of the pairing in
 * the game's voice without naming either parent or the result — and it only
 * appears once you are carrying one half of it. So the tool tells you there is
 * something there and makes you find what.
 *
 * The parents STAY. A synergy is not a fusion that eats its inputs; take one
 * parent off and the synergy sleeps again, which makes the arrangement itself
 * the thing you are protecting.
 */
export interface SynergyDef {
  id: string;
  name: string;
  shell: string;
  /** The two modifiers that wake it. Order is irrelevant. */
  from: [string, string];
  /** Both parents must be at least this level. */
  minLevel: number;
  /**
   * The direction, shown when the player carries ONE parent. Names no modifier
   * and no result — it describes what the half they are holding is reaching for.
   */
  hint: string;
  effect: string;
  line: string;
  fx: ModEffectDef;
  color: number;
}

export const SYNERGIES: SynergyDef[] = [
  {
    id: 'stormbreaker', name: 'Stormbreaker', shell: 'ferrite',
    from: ['widerblast', 'longchain'], minLevel: 2,
    hint: 'Something in the way this one goes off is looking for somewhere to go afterwards.',
    effect: 'The blast stops being a place and starts being a direction — it goes off, and then it travels.',
    line: 'It did not stop at the edge of the hole. It has not stopped yet.',
    fx: { paramAdd: { r: 1, hops: 3, cap: 8 }, refire: 0.15 }, color: FERRITE,
  },
  {
    id: 'cleaver', name: 'Cleaver', shell: 'verdance',
    from: ['heavyhead', 'shatterface'], minLevel: 2,
    hint: 'All that weight wants something that will come apart when it lands.',
    effect: 'Weight and a fault line, in the same swing. What it touches does not survive being touched.',
    line: 'You are not chipping any more.',
    fx: { splash: 0.18, dropWeight: 1.2 }, color: VERDANCE,
  },
  {
    id: 'avalanche', name: 'Avalanche', shell: 'cinder',
    from: ['farreach', 'voidbite'], minLevel: 2,
    hint: 'It reaches a long way, and what it reaches for is barely there when it arrives.',
    effect: 'Everything within the swing empties at once, whether or not you meant it.',
    line: 'The wall went. All of it went.',
    fx: { cells: 1, splash: 0.2 }, color: CINDER,
  },
  {
    id: 'perpetual', name: 'Perpetual', shell: 'ferrite',
    from: ['selfmending', 'quicklearner'], minLevel: 2,
    hint: 'It mends itself, and it is starting to mend itself better than it did.',
    effect: 'It learns from mending and mends from learning. You have stopped maintaining it.',
    line: 'You have not put a hand to this in a week.',
    fx: { repairPerSec: 0.006, xpRate: 1.5, stabilize: 10 }, color: FERRITE,
  },
  {
    id: 'overdrive', name: 'Overdrive', shell: 'cinder',
    from: ['quickcharge', 'restless'], minLevel: 2,
    hint: 'This one never settles, and something else on here is already impatient.',
    effect: 'It comes round almost every swing. It is also extremely hard to keep pointed.',
    line: 'It is going off. It is going to keep going off.',
    fx: { chargePerSwing: 3, stabilize: -18 }, color: CINDER,
  },
  {
    id: 'deepvein', name: 'Deep Vein', shell: 'verdance',
    from: ['quarryjaw', 'oremagnet'], minLevel: 2,
    hint: 'It finds pockets, and it is beginning to find them before you get there.',
    effect: 'Every pocket in reach opens to it at once, and quickly.',
    line: 'You stopped looking for them a while ago. They are just where you are.',
    fx: { oreRate: 1.8, oreReach: true }, color: VERDANCE,
  },
  {
    id: 'theanvil', name: 'The Anvil', shell: 'cinder',
    from: ['unbreaking', 'deepbite'], minLevel: 2,
    hint: 'It refuses to wear, and something else in it refuses along with it.',
    effect: 'It does not wear and it does not shift. Everything else on it steadies too.',
    line: 'Older than the shaft. Same shape as the day it was poured.',
    fx: { uses: 2, stabilize: 34 }, color: CINDER,
  },
  {
    id: 'harmonic', name: 'Harmonic', shell: 'aleph',
    from: ['resonance', 'sympathy'], minLevel: 3,
    hint: 'Two things on here have found the same note and are looking for a third.',
    effect: 'Everything on the tool feeds everything else. It is one thing now, not a stack of them.',
    line: 'You built this out of parts. It has stopped being parts.',
    fx: { amplify: 1.6, chargeOnFire: 6 }, color: ALEPH,
  },
  {
    id: 'firstlight', name: 'First Light', shell: 'aleph',
    from: ['graded', 'overgrade'], minLevel: 3,
    hint: 'It behaves as though it came from deeper than it did, and it wants to go further.',
    effect: 'Everything it carries goes off as though poured at the bottom of the world.',
    line: 'It is not remembering a deeper world. It is insisting on one.',
    fx: { abilityGrade: 2, stabilize: -25 }, color: ALEPH,
  },
];

export const SYNERGY_BY_ID = new Map(SYNERGIES.map((s) => [s.id, s]));

/** Which synergies a given modifier is half of. Used for the hint, never to
 *  list the other half. */
export function synergiesTouching(modId: string): SynergyDef[] {
  return SYNERGIES.filter((s) => s.from.includes(modId));
}

export const MOD_BY_ID = new Map(TOOL_MODS.map((m) => [m.id, m]));

export const MOD_CATEGORY_LABEL: Record<ModCategory, string> = {
  stat: 'The tool itself',
  ability: 'What it carries',
  utility: 'Living with it',
  combo: 'Only together',
};

function satisfies(pool: Partial<Record<TraitId, number>>, def: ToolModDef): boolean {
  for (const [trait, n] of Object.entries(def.needs)) {
    if ((pool[trait as TraitId] ?? 0) < (n as number)) return false;
  }
  return true;
}

/**
 * WHICH MODIFIER THIS MIX MAKES, or null.
 *
 * Same ranking rule as the alloy bench — most demanding signature first, then
 * deepest shell — for the same reason: by the time two fit, the newer one is
 * the one the player descended for. `prefer` aims at something ALREADY KNOWN,
 * which is not a pillar-5 hole (you cannot aim at what you have never made).
 */
export function matchToolMod(
  materialIds: string[], opts: { reached?: number; prefer?: string | null } = {},
): ToolModDef | null {
  if (materialIds.length === 0) return null;
  const pool = traitPool(materialIds);
  const reached = opts.reached ?? 7;
  const live = TOOL_MODS.filter((m) => MOD_SHELL_ORDINAL[m.shell]! <= reached);

  if (opts.prefer) {
    const aim = live.find((m) => m.id === opts.prefer);
    if (aim && satisfies(pool, aim)) return aim;
  }
  const ranked = [...live].sort((a, b) => {
    const da = Object.values(a.needs).reduce((x, y) => x + (y as number), 0);
    const db = Object.values(b.needs).reduce((x, y) => x + (y as number), 0);
    if (db !== da) return db - da;
    return MOD_SHELL_ORDINAL[b.shell]! - MOD_SHELL_ORDINAL[a.shell]!;
  });
  for (const def of ranked) if (satisfies(pool, def)) return def;
  return null;
}

export const MOD_SHELL_ORDINAL: Record<string, number> = {
  loam: 1, ferrite: 2, verdance: 3, glassmere: 4, cinder: 5, hollow: 6, aleph: 7,
};
