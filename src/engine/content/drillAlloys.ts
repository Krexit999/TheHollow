/**
 * DRILL ALLOYS (A.53) — the bay's abilities, forged at the Forge.
 *
 * This replaces the per-drill configuration layer that A.52 built and A.53
 * stripped. The lesson from that reversal is the shape of this system: the
 * drills themselves are furniture and should stay that way, so the interesting
 * decision lives on a screen you go to ON PURPOSE, and what it produces is not
 * a stat but a VISIBLE CHANGE IN HOW THE GRID BEHAVES.
 *
 * AN ABILITY IS NEVER A NUMBER. "+8% drill power" is what the old heads did and
 * it is what made the bay a lookup. Every ability here changes the RULE the
 * drills work by, and every one of them is drawn on the face — the arc jumps
 * between cells you can see, the set leaves a mark on the rock, the call shows
 * ore gathering under a cell. If a proposed ability cannot be seen happening,
 * it does not belong in this file.
 *
 * PILLAR 2, and it is the constraint that shapes every row. There are exactly
 * three shapes an ability may take, and all three are bounded by regen:
 *  - REACH FURTHER PER STROKE (arc, phantom, refract, burst, phase, disperse).
 *    They harvest charge that is ALREADY IN other cells. The field empties
 *    faster; nothing is put into it.
 *  - TAKE A BIGGER BITE OF THE SAME CELL (residue, lens, unmake, creep, kindle).
 *    A larger share of what is there — deliberately NOT a yield multiplier,
 *    which WOULD move the ceiling (dpsMax = W·H·regen·Y).
 *  - CHANGE WHAT COMES OUT, NOT HOW MUCH (attract, bloom). Drop tables and ore
 *    CAP sit outside the income path (A.55 proved the cap term is absent from
 *    dpsMax), so these move rarity and concentration, never production.
 * The two exceptions that need care are bind (pure targeting — free) and recur
 * (a repeated stroke, which is still `min(power, cellCharge)` every time).
 *
 * PILLAR 5: which materials make which ability is NOT listed. Traits are
 * visible (traits.ts rule 3 — a trait is a property, not a solution), so the
 * bench can HINT at what a mix leans toward, and the ability is named and
 * recorded the moment you actually make it. Hint, try, confirm-and-remember.
 *
 * ONE ALLOY PER DRILL (A.54). The first cut fitted a single alloy bay-wide,
 * on the theory that anything per-drill would rebuild A.52's configuration
 * screen. That was the wrong lesson from the right reversal: what made A.52 a
 * chore was that every drill needed a SETUP before it would work properly.
 * Here a drill works fine bare, and an alloy is an optional thing you pour into
 * one — so the choice is which of your drills gets which ability, and the
 * answer is a MIX rather than a setting to clone across twenty-four rows.
 *
 * THE MARKS BELONG TO THE ROCK, NOT THE DRILL. A cell softened by an emberset
 * drill is soft for whatever bites it next, and a cell gathered under by a
 * lodecall drill drops richer whoever empties it. That is what makes a mix
 * worth assembling instead of a bay of clones, and it is the honest reading of
 * the copy — the ability changes the ROCK, and the rock does not know which
 * machine touched it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A.56 — THE POOL GROWS AND DEEPENS.
 *
 * A.53 shipped a framework and three Loam abilities and declared the rest
 * "stubs, deliberately" (LEDGER: "The later-shell ability kinds are declared
 * and unauthored"). Twelve more are authored here, two per shell for Ferrite
 * through Aleph, and the three stub kinds in the union are replaced by twelve
 * real ones. That closes the ledger row.
 *
 * TWO AXES, NOT ONE. An ability belongs to a shell and UNLOCKS when you reach
 * that shell — so the pool GROWS as you descend. Independently, an alloy has a
 * GRADE: the deepest shell any material in the pour came from. A Loam Arcvein
 * poured from Loam stone is grade I and works exactly as it always did; the
 * same Arcvein poured with Ferrite stone is grade II and throws another fork.
 * So the pool DEEPENS as well as grows, and nothing you learned early becomes
 * dead weight — it becomes something you re-pour better.
 *
 * The grade step is `grade − the ability's own shell ordinal`, floored at 0:
 * pouring a Ferrite ability from Ferrite stone is step 0, and you cannot make
 * an ability WEAKER than the shell that invented it by feeding it older rock.
 *
 * THE REACH RULE, AND AN HONEST NOTE ON IT. Every A.56 signature is drawn from
 * the five traits that exist on at least one MINEABLE material in all seven
 * shells — `charged`, `dense`, `brittle`, `trueseated`, `hollow` — so every one
 * of the twelve is forgeable from local rock in every world, checked by test
 * rather than asserted. The three ORIGINAL Loam signatures are not: `warm`
 * appears on no mineable Hollow or Aleph material and `dense` is thin in
 * Verdance and Glassmere. That gap is pre-existing, it is survivable because
 * materials cross a Breach, and it is now ledgered instead of claimed away.
 *
 * ADDING ONE IS STILL DATA. A row here plus a hook keyed on its `kind`.
 */
import type { TraitId } from '../traits';
import { traitsOf } from '../traits';

/**
 * Every kind has a live runtime hook in systems/drillAlloys.ts and
 * systems/drills.ts. A.53's three stubs (`bind`, `resonance`, `phantom`) are
 * gone: two were authored, and `resonance` was dropped rather than shipped
 * hollow — reading a shell's own signature is a real design problem and a
 * placeholder for it would be exactly the deceptive stub PILLARS warns about.
 *
 *  REACH      arc · phantom · refract · burst · phase · disperse
 *  BITE       residue · lens · unmake · creep · kindle
 *  WHAT DROPS attract · bloom
 *  TARGETING  bind
 *  TEMPO      recur
 */
export type DrillAbilityKind =
  | 'arc' | 'attract' | 'residue'
  | 'bind' | 'phantom'
  | 'creep' | 'bloom'
  | 'refract' | 'lens'
  | 'burst' | 'kindle'
  | 'phase' | 'unmake'
  | 'recur' | 'disperse';

/** Shell ordinals, held here rather than read from the shell registry so this
 *  content module stays loadable before the shells register (the alloy defs are
 *  evaluated at import time, the registry is populated at boot). */
export const SHELL_ORDINAL: Record<string, number> = {
  loam: 1, ferrite: 2, verdance: 3, glassmere: 4, cinder: 5, hollow: 6, aleph: 7,
};

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** How a param answers a better grade. `add` for things that are counts (you
 *  cannot have 2.4 forks); `mult` for everything continuous. */
export type Growth = 'add' | 'mult' | 'shrink';

export interface DrillAbilityDef {
  id: string;
  name: string;
  kind: DrillAbilityKind;
  /** Which shell's materials this belongs to — gates when it can be forged. */
  shell: string;
  /** What it does, in the game's voice. Shown only AFTER discovery. */
  effect: string;
  /** Flavour. Shown only after discovery. */
  line: string;
  /**
   * WHAT IT IS WORTH, AND THEREFORE WHAT IT COSTS. The Loam three were set from
   * the measured alloy-vs-bare readings in `sim-out/a53-alloy-rtp.md`, not by
   * feel: ARC ran 1.74x income in the power-bound regime, THE SET 1.24x, and
   * THE CALL moved the drop table rather than the income at all. The twelve
   * A.56 rows are hand-sized ON THAT SCALE and rise with the shell, which is
   * a claim, not a measurement — see the ledger row.
   */
  weight: number;
  /**
   * The trait signature. Matched against the POOLED traits of everything fed
   * in, so two `charged` materials and one three-trait `charged` material both
   * satisfy `{ charged: 2 }` — the player reasons about the mix, not a recipe.
   */
  needs: Partial<Record<TraitId, number>>;
  params: Record<string, number>;
  /** Which params a better grade improves, and how. Params absent here do not
   *  move with grade at all. */
  grow?: Record<string, Growth>;
}

/** How much better each grade step makes a `mult` param. */
export const GRADE_STEP_GAIN = 0.30;

export function shellOrdinal(shellId: string): number {
  return SHELL_ORDINAL[shellId] ?? 1;
}

/**
 * THE FIFTEEN. Three from A.53 (Loam, untouched) and twelve from A.56.
 *
 * The ordering within a shell is deliberate: the FIRST is the one whose
 * signature is easier to hit by accident, so the shell's opening discovery is
 * the gentler of its pair.
 */
export const DRILL_ABILITIES: DrillAbilityDef[] = [
  // ── SHELL I · LOAM ──────────────────────────────────────────────────────
  {
    id: 'arcvein', name: 'Arcvein', kind: 'arc', shell: 'loam',
    effect: 'A drill strike jumps to neighbouring cells and takes their charge too.',
    line: 'It will not sit still in the head. The stroke lands and then keeps going.',
    needs: { charged: 2 },
    params: { jumps: 2, share: 0.5 },
    grow: { jumps: 'add', share: 'mult' },
    weight: 3,
  },
  {
    id: 'lodecall', name: 'Lodecall', kind: 'attract', shell: 'loam',
    effect: 'Worked cells draw the richer seam toward them — what they drop gets better the more you work them.',
    line: 'The rock leans in. Whatever is down there would rather be here.',
    needs: { dense: 2 },
    params: { every: 6, depthBonus: 30 },
    grow: { every: 'shrink', depthBonus: 'mult' },
    weight: 2,
  },
  {
    id: 'emberset', name: 'Emberset', kind: 'residue', shell: 'loam',
    effect: 'Rock a drill has just worked stays soft, so the next bite takes far more of what is in it.',
    line: 'It leaves the heat behind in the stone. The stone gives up quicker for it.',
    needs: { warm: 2 },
    params: { bite: 0.5, decay: 9 },
    grow: { bite: 'mult', decay: 'mult' },
    weight: 2,
  },

  // ── SHELL II · FERRITE ──────────────────────────────────────────────────
  {
    id: 'ganglock', name: 'Ganglock', kind: 'bind', shell: 'ferrite',
    effect: 'Every drill carrying it locks onto the SAME cell and works it together, tethered rail to rail.',
    line: 'Bolt two of them to the same idea and they stop arguing about where to dig.',
    needs: { charged: 1, dense: 1, trueseated: 1 },
    params: {},
    weight: 3,
  },
  {
    id: 'halfmark', name: 'Halfmark', kind: 'phantom', shell: 'ferrite',
    effect: 'Each stroke throws a half-real copy of itself at another charged cell, anywhere on the face.',
    line: 'You hear it land twice. Only one of them is where the drill is.',
    needs: { charged: 2, hollow: 1 },
    params: { share: 0.5, hits: 1 },
    grow: { hits: 'add', share: 'mult' },
    weight: 4,
  },

  // ── SHELL III · VERDANCE ────────────────────────────────────────────────
  {
    id: 'creepvine', name: 'Creepvine', kind: 'creep', shell: 'verdance',
    effect: 'The drill stops jumping about — it crawls cell to cell, and the longer the crawl runs the deeper it bites.',
    line: 'It found a direction it liked and it is not going to be talked out of it.',
    needs: { charged: 1, dense: 1, hollow: 1 },
    params: { step: 0.22, max: 2.4 },
    grow: { step: 'mult', max: 'mult' },
    weight: 4,
  },
  {
    id: 'seedset', name: 'Seedset', kind: 'bloom', shell: 'verdance',
    effect: 'Now and then a worked cell is left seeded, and a fresh ore pocket grows where the drill was standing.',
    line: 'Something takes in the hole it leaves. That was never in the plan.',
    needs: { charged: 2, brittle: 1 },
    params: { every: 24 },
    grow: { every: 'shrink' },
    weight: 3,
  },

  // ── SHELL IV · GLASSMERE ────────────────────────────────────────────────
  {
    id: 'prismcut', name: 'Prismcut', kind: 'refract', shell: 'glassmere',
    effect: 'The stroke splits along the row — a bright line of cells, all worked at once.',
    line: 'It goes in as one and comes out as five, and none of them was bent.',
    needs: { charged: 1, brittle: 1, trueseated: 1 },
    params: { reach: 2, share: 0.4 },
    grow: { reach: 'add', share: 'mult' },
    weight: 5,
  },
  {
    id: 'longlens', name: 'Longlens', kind: 'lens', shell: 'glassmere',
    effect: 'It holds its stroke, gathering, and then spends the whole lot in one enormous bite.',
    line: 'Nothing for four beats. Then the rock is simply not there any more.',
    needs: { charged: 2, trueseated: 1 },
    params: { hold: 4, gain: 1.35 },
    grow: { gain: 'mult' },
    weight: 5,
  },

  // ── SHELL V · CINDER ────────────────────────────────────────────────────
  {
    id: 'slagburst', name: 'Slagburst', kind: 'burst', shell: 'cinder',
    effect: 'Strike rock that is nearly full and it goes off — a ring of every cell around it, all at once.',
    line: 'Full stone does not want to be hit. Hit it anyway and it tells everything nearby.',
    needs: { charged: 1, brittle: 1, hollow: 1 },
    // `at` is a FRACTION of cap and deliberately does not grade — `shrink`
    // floors at 1, which is meaningless for a 0..1 threshold, and a burst that
    // triggered on nearly-empty rock would stop being a thing you can see.
    params: { at: 0.7, share: 0.55 },
    grow: { share: 'mult' },
    weight: 6,
  },
  {
    id: 'cinderhold', name: 'Cinderhold', kind: 'kindle', shell: 'cinder',
    effect: 'Struck rock catches, and keeps giving up charge on its own for a while after the drill has moved on.',
    line: 'You can see which cells it has been at. They are still going.',
    needs: { charged: 2, dense: 1 },
    params: { burn: 6, rate: 0.09 },
    grow: { burn: 'mult', rate: 'mult' },
    weight: 6,
  },

  // ── SHELL VI · HOLLOW ───────────────────────────────────────────────────
  {
    id: 'throughline', name: 'Throughline', kind: 'phase', shell: 'hollow',
    effect: 'Every stroke also lands on the cell directly opposite it, straight through the middle of the face.',
    line: 'The face is thinner than it looks. Push hard enough and you come out the other side.',
    needs: { dense: 1, brittle: 1, hollow: 1 },
    params: { share: 0.75 },
    grow: { share: 'mult' },
    weight: 7,
  },
  {
    id: 'unmaking', name: 'Unmaking', kind: 'unmake', shell: 'hollow',
    effect: 'It takes everything the cell is holding in one bite — then stands there, spent, until it can do it again.',
    line: 'Not a strike. A subtraction.',
    needs: { dense: 1, hollow: 1, trueseated: 1 },
    params: { rest: 4 },
    grow: { rest: 'shrink' },
    weight: 7,
  },

  // ── SHELL VII · ALEPH ───────────────────────────────────────────────────
  {
    id: 'recurrence', name: 'Recurrence', kind: 'recur', shell: 'aleph',
    effect: 'A stroke has a habit of happening again immediately. And again. It has been known to go on.',
    line: 'The same second, several times, until it stops being the same second.',
    needs: { charged: 1, brittle: 1, dense: 1 },
    params: { chance: 0.38, cap: 3 },
    grow: { chance: 'mult', cap: 'add' },
    weight: 9,
  },
  {
    id: 'everywhen', name: 'Everywhen', kind: 'disperse', shell: 'aleph',
    effect: 'One stroke, landing faintly on every cell the drill can still feel — the whole face flinches.',
    line: 'It stopped picking. It works all of it, a little, all the time.',
    needs: { brittle: 1, hollow: 1, trueseated: 1 },
    params: { cells: 12, share: 0.12 },
    grow: { cells: 'add', share: 'mult' },
    weight: 9,
  },
];

export const ABILITY_BY_ID = new Map(DRILL_ABILITIES.map((a) => [a.id, a]));

/**
 * HOW A GRADE READS ON A PARAM. `add` gains one per step (a fork, a cell, a
 * repeat), `mult` gains GRADE_STEP_GAIN per step, `shrink` divides — a smaller
 * `every` or `rest` is a better one, and it never goes below 1.
 */
export function abilityParams(
  def: DrillAbilityDef, grade: number,
): Record<string, number> {
  const step = gradeStep(def, grade);
  if (step <= 0) return def.params;
  const out: Record<string, number> = { ...def.params };
  for (const [key, how] of Object.entries(def.grow ?? {})) {
    const base = out[key];
    if (base === undefined) continue;
    if (how === 'add') out[key] = base + step;
    else if (how === 'mult') out[key] = base * (1 + GRADE_STEP_GAIN * step);
    else if (how === 'shrink') out[key] = Math.max(1, base / (1 + GRADE_STEP_GAIN * step));
  }
  return out;
}

/** How far past its own shell this alloy was poured. Never negative — older
 *  rock cannot make an ability worse than the world that invented it. */
export function gradeStep(def: DrillAbilityDef, grade: number): number {
  return Math.max(0, Math.min(7, Math.round(grade)) - shellOrdinal(def.shell));
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
  /** The deepest shell ordinal the player has reached. Abilities from below it
   *  are not in the world yet and cannot come out of a crucible. */
  reached?: number;
  /** A KNOWN ability the player is aiming at. If the mix satisfies it, that is
   *  what comes out — see the note on shadowing in `matchDrillAlloy`. */
  prefer?: string | null;
}

/**
 * WHICH ABILITY THIS EXACT MIX MAKES, or null for slag.
 *
 * Ranked most-demanding-first so a rich pool resolves to the ability that
 * actually needed it, then DEEPEST-first on a tie, because by the time two
 * signatures both fit, the newer one is the one the player descended for.
 *
 * THE SHADOWING PROBLEM, AND WHY `prefer` EXISTS. With fifteen signatures in
 * play, a generous pool in Aleph satisfies half of them, and the deep ones win
 * — which would make an old favourite progressively harder to re-pour, exactly
 * the "your early discoveries become dead weight" failure this phase is meant
 * to fix. So the bench can AIM at something you have already made. It is not a
 * pillar-5 hole: you cannot aim at an ability you have never discovered, the
 * signature of a known ability is already printed on its card, and an aimed
 * pour that does not satisfy the signature still falls through to whatever the
 * mix really is.
 */
export function matchDrillAlloy(
  materialIds: string[], opts: MatchOpts = {},
): DrillAbilityDef | null {
  if (materialIds.length === 0) return null;
  const pool = traitPool(materialIds);
  const reached = opts.reached ?? 7;
  const live = DRILL_ABILITIES.filter((a) => shellOrdinal(a.shell) <= reached);

  if (opts.prefer) {
    const aim = live.find((a) => a.id === opts.prefer);
    if (aim && satisfies(pool, aim)) return aim;
  }

  const ranked = [...live].sort((a, b) => {
    const da = Object.values(a.needs).reduce((x, y) => x + (y as number), 0);
    const db = Object.values(b.needs).reduce((x, y) => x + (y as number), 0);
    if (db !== da) return db - da;
    return shellOrdinal(b.shell) - shellOrdinal(a.shell);
  });
  for (const def of ranked) if (satisfies(pool, def)) return def;
  return null;
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
 * WHAT THE BENCH WILL SAY BEFORE YOU POUR.
 *
 * Every line describes the MIX, never the ability — pillar 5 holds because a
 * player who reads "it wants to jump" has a reason to try it and still has to
 * make the thing to learn what it is. Traits that no ability reads yet get an
 * honest "nothing in this is reaching for anything", which is a real signal
 * rather than a shrug.
 *
 * A.56 note: six of the ten traits are now read by something, so six of these
 * lines had to stop saying "and nothing in it reaches past that". Only `keen`,
 * `light`, `springy` and `tough` are still inert, and they still say so.
 */
const TRAIT_HINT: Record<TraitId, string> = {
  charged: 'It will not settle. Whatever is in this is looking for somewhere to jump to.',
  dense: 'Heavy out of all proportion. Set it down and things nearby lean toward it.',
  warm: 'It holds the heat long after the fire is out. Whatever it touches stays warm.',
  keen: 'It takes an edge and keeps it. A cutting mix, but nothing in it reaches past the cut.',
  tough: 'It will not break. It will not do much else either.',
  light: 'Almost nothing in the hand. Nothing in it wants to act on the rock.',
  springy: 'It gives and comes back. A lively mix with nowhere to put the liveliness.',
  brittle: 'It wants to come apart — and it wants to take whatever is beside it along.',
  hollow: 'There is a space inside it, and the space goes further than the piece does.',
  trueseated: 'It sits exactly where you put it, and holds a line further than you would think.',
};

/** A reasoning aid, not an answer. Empty pool → the bench says nothing. */
export function alloyHint(materialIds: string[]): string | null {
  if (materialIds.length === 0) return null;
  const dom = dominantTrait(materialIds);
  if (!dom) return null;
  const pool = traitPool(materialIds);
  const n = pool[dom] ?? 0;
  const base = TRAIT_HINT[dom];
  // Two of a trait is the threshold every authored signature uses. Saying the
  // COUNT is honest and still not a recipe: the player is told the mix is
  // leaning hard, not what it leans into.
  return n >= 2 ? `${base} Strongly — there is a lot of it in here.` : base;
}
