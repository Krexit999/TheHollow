/**
 * THE REACTION BENCH — the catalyst slot, and the rule §17 promised the player
 * they could infer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS ALREADY HERE, MEASURED BEFORE ANYTHING WAS WRITTEN.
 *
 * §17 gives the Reaction Bench "two inputs, one catalyst slot, REACT", no recipe
 * list ever, and one heuristic:
 *
 *   > Materials sharing a trait react. Opposed traits react violently (higher
 *   > yield, needs a catalyst). Nothing in common gives grog.
 *
 * Everything in that paragraph except the catalyst was already built, in
 * `systems/refinery.ts`: two slots, a REACT verb, twenty-nine authored chains,
 * no list anywhere, a Codex that fills in as you find them, and (A.70) a PAIR
 * reading that tells you whether these two have something to make together
 * before you spend. §13's map of forty-one machines does not contain a Reaction
 * Bench at all — CHEMISTRY is the Refinery's deeper half, which is why three
 * passes have treated it as shipped.
 *
 * THE PART THAT WAS MISSING IS NOT THE MACHINE. IT IS THE RULE.
 *
 * Measured across the twenty-nine authored chains: **sixteen share a trait and
 * thirteen have nothing in common.** So the one heuristic §17 says every player
 * works out in an hour is FORTY-FIVE PERCENT FALSE in this codebase. A player
 * who correctly infers it stops trying thirteen real chains — including three of
 * the five the A.71 shallow board exists to hand them.
 *
 * Re-authoring thirteen chains to fit the sentence would be re-authoring content
 * to match a spec. The other repair is the one §17 itself names: those thirteen
 * are the VIOLENT class, and violence needs a catalyst.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * SO A POUR HAS THREE CLASSES, and the reading names which one before you spend:
 *
 *   SHARES     the pair holds a trait in common — it goes on its own.
 *   OPPOSED    a trait on one side pushes a stat the other side pulls
 *              (`traitsOppose`, derived from the factor table). It goes
 *              VIOLENTLY: it wants a catalyst, and it pays one extra unit.
 *   STRANGERS  neither. It wants a catalyst and pays nothing extra.
 *
 * AND A CATALYST IS THE GO-BETWEEN. Not a special material, not a currency:
 * **a third stone that shares a trait with each of the two.** That is what a
 * catalyst is for — the pair cannot talk, so you put something in that both of
 * them will talk to. It makes the heuristic true rather than nearly-true: every
 * reaction in the game now happens through a shared trait, and when the pair has
 * none you supply one.
 *
 * **A CATALYST IS SPENT ONLY WHEN THE POUR FAILS** (§17, verbatim). Being right
 * costs you nothing but the holding of it; guessing burns stone. Which is the
 * exact incentive §17 wants — "reasoning is nearly free".
 *
 * PILLAR 2. Nothing here reaches the face. A pour is a lateral conversion of
 * units already dug and stays strictly lossy in units even at the violent yield
 * (`bonemeal` is four and four for two), and the catalyst is a SINK on failure
 * and a no-op on success — it can never be a source.
 */
import { MATERIALS, materialDef } from '../materials';
import type { GameState } from '../types';
import { traitsOf, traitsOppose, type TraitId } from '../traits';
import { materialCount } from './forge';

export type PairClass = 'shares' | 'opposed' | 'strangers';

/** One extra unit out of a violent pour — §17's "higher yield". */
export const VIOLENT_BONUS = 1;

/** Which of the three a pair is. Pure trait arithmetic; no state, no chains. */
export function pairClass(aId: string, bId: string): PairClass {
  const ta = traitsOf(aId);
  const tb = traitsOf(bId);
  if (ta.some((t) => tb.includes(t))) return 'shares';
  for (const x of ta) for (const y of tb) if (traitsOppose(x, y)) return 'opposed';
  return 'strangers';
}

/** The stat the two sides pull against, when they do — for the reading line. */
export function opposedAxis(aId: string, bId: string): string | null {
  for (const x of traitsOf(aId)) for (const y of traitsOf(bId)) {
    const axis = traitsOppose(x, y);
    if (axis) return axis;
  }
  return null;
}

/** Does this pour need something in the third slot at all? */
export function needsCatalyst(aId: string, bId: string): boolean {
  return pairClass(aId, bId) !== 'shares';
}

/**
 * DOES THIS STONE BRIDGE THESE TWO. One trait in common with each side, and it
 * cannot be one of the two — a thing does not catalyse itself.
 */
export function bridges(catalystId: string, aId: string, bId: string): boolean {
  if (catalystId === aId || catalystId === bId) return false;
  const t = traitsOf(catalystId);
  if (t.length === 0) return false;
  const ta = traitsOf(aId);
  const tb = traitsOf(bId);
  return t.some((x) => ta.includes(x)) && t.some((x) => tb.includes(x));
}

/** The trait it shares with each side, for the line the bench prints. */
export function bridgeTraits(
  catalystId: string, aId: string, bId: string,
): { with: TraitId; and: TraitId } | null {
  const t = traitsOf(catalystId);
  const withA = t.find((x) => traitsOf(aId).includes(x));
  const withB = t.find((x) => traitsOf(bId).includes(x));
  return withA && withB ? { with: withA, and: withB } : null;
}

/**
 * WHAT IN YOUR HOLD WOULD BRIDGE THIS PAIR. LAW 3: it lists what you are
 * ALREADY HOLDING, never a catalogue of every stone that would have worked.
 */
export function catalystsHeld(
  state: GameState, aId: string, bId: string,
): Array<{ id: string; name: string; count: number }> {
  const out: Array<{ id: string; name: string; count: number }> = [];
  for (const id of Object.keys(state.materials?.stacks ?? {})) {
    if (!bridges(id, aId, bId)) continue;
    const count = materialCount(state, id);
    if (count <= 0) continue;
    let name = id;
    try { name = materialDef(id).name; } catch { /* an id with no def cannot be shown */ }
    out.push({ id, name, count });
  }
  return out.sort((x, y) => y.count - x.count);
}

/** Every stone in the registry that would bridge — tests and audits only. */
export function allBridges(aId: string, bId: string): string[] {
  return MATERIALS.filter((m) => bridges(m.id, aId, bId)).map((m) => m.id);
}

/**
 * THE CATALYST VERDICT, said before anything is spent. Three sentences, and
 * none of them names the output — what the pour MAKES is still only found by
 * pouring, which is the half of pillar 5 worth keeping.
 */
export interface CatalystRead {
  needed: boolean;
  ok: boolean;
  line: string;
}

export function catalystReading(
  _state: GameState, aId: string | null, bId: string | null, catId: string | null,
): CatalystRead {
  if (!aId || !bId) return { needed: false, ok: true, line: '' };
  const klass = pairClass(aId, bId);
  if (klass === 'shares') {
    return {
      needed: false, ok: true,
      line: catId
        ? 'These two already have something in common. The third stone will not be touched.'
        : '',
    };
  }
  const name = (id: string): string => { try { return materialDef(id).name; } catch { return id; } };
  if (!catId) {
    const axis = opposedAxis(aId, bId);
    return {
      needed: true, ok: false,
      line: klass === 'opposed'
        ? `These two pull against each other on ${axis}. It will not go without something between them.`
        : 'These two have nothing to say to each other. They would need something that talks to both.',
    };
  }
  const b = bridgeTraits(catId, aId, bId);
  if (!b) {
    return {
      needed: true, ok: false,
      line: `${name(catId)} has nothing in common with one of them either.`,
    };
  }
  return {
    needed: true, ok: true,
    line: `${name(catId)} is ${b.with} like ${name(aId)} and ${b.and} like ${name(bId)}. It will hold. You get it back if the pour goes.`,
  };
}
