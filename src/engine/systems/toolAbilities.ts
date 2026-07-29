/**
 * MATERIAL ABILITIES ON TOOLS — the forge, the drills and the abilities become
 * one system.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE IS NOT. It is not a second ability system.
 *
 * A.57 built twenty-nine abilities as PLANS — a list of `{cell, share}` harvests
 * plus a figure — with `buildPlan` for the geometry, `applyPlan` for the funnel,
 * `advanceCharges` for the meter and `fireAbility` for the firing. Every one of
 * those already worked on "a thing that carries fits and strikes rock", and a
 * drill was only ever the first such thing. So the reuse here is literal: the
 * tool became a CARRIER (`TOOL_CARRIER`), and this file supplies what a carrier
 * needs that the bay supplies for itself — where the fits come from, how many
 * there may be, and when the meter ticks.
 *
 * The parts that are genuinely new are three:
 *
 *  1. WHERE THE ABILITY COMES FROM. A drill is POURED an ability at the bench.
 *     A tool is BUILT with one: its three rock-facing parts are its mix, and
 *     what they are made of decides what it can do.
 *  2. HOW MANY IT MAY CARRY. The bay has a power budget; the tool has SLOTS,
 *     off the Binding/Sockets stone and the levels the tool has earned.
 *  3. WHEN THE METER FILLS. A drill's stroke fills it. A tool's SWING does.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE THREE PARTS THAT CARRY IT, and why it is three.
 *
 * HEAD, EDGE and SOCKETS — the parts that meet the rock and the part the doc
 * gives to "relics, runes and gems", i.e. the ones that were always about what
 * a tool DOES rather than how long it lasts. Core/Handle are the durability
 * story, Binding/Grip are slots and control; none of those four should have to
 * be spent on an ability the player wants.
 *
 * It is three because a POUR is three (`POUR_SLOTS`), and the signatures were
 * sized against a pour: `{charged: 2, brittle: 1}` is a demanding mix out of
 * three materials and a near-certainty out of seven. Reading all seven parts
 * would have handed a mixed tool most of the ability list at once and made the
 * choice of stone stop mattering — which is the failure this system exists to
 * avoid, one layer up.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PILLAR 2. Nothing here needs its own argument, and that is the point of doing
 * it this way. A tool ability resolves to a plan and the plan goes through
 * `applyPlan` → `deps.hit` → (for the hand) `harvestCell`, which is the very
 * same call an ordinary swing makes: `take = min(share × held, held − floor)`.
 * There is no path by which an explosion in the hand can take charge the field
 * did not grow. A Slagburst clearing nine cells spends the regen those nine
 * cells had banked, and the face then has nine cells to refill.
 *
 * PILLAR 1. The tool is the ACTIVE layer by the doc's own framing, so a tool
 * ability firing only while you mine by hand is correct rather than a gap — and
 * the idle player's abilities are the bay's, which are untouched. Within active
 * play the meter still AUTO-FIRES after the ready window, so a player who only
 * clicks rock receives every ability they have built for without ever opening
 * this panel. Clicking pays timing and aim, never damage.
 *
 * PILLAR 5. Which stone makes which ability is hinted and never listed:
 * `alloyHint` describes what the mix LEANS toward on the bench before you
 * commit, the ability is named the moment you build it, and the codex is the
 * same one the bay writes to — learning what Slagburst is at the crucible or in
 * the hand is the same knowledge either way.
 */
import type { DrillState, EngineCtx, GameState, ActionResult } from '../types';
import type { ModifierCache } from '../modifiers';
import type { PartType } from '../content/forgeParts';
import {
  ABILITY_BY_ID, abilityParams, alloyHint, matchAllAbilities,
  type DrillAbilityDef,
} from '../content/drillAlloys';
import {
  READY_GRACE, TOOL_CARRIER, fireAbility, mixGrade, reachedOrdinal,
  wireHandCarrier, type Fit,
} from './drillAlloys';
import { currentTool } from './casting';
import { modSlotsOf } from './toolMining';
import type { ToolStats } from './forgeParts';

/**
 * THE ROCK-FACING PARTS. Change this and you change what a build means, so it
 * is one list read by everything: the matcher, the grade, the hint and the UI.
 */
export const ABILITY_PARTS: PartType[] = ['head', 'edge', 'sockets'];

/**
 * THE MOST A TOOL MAY EVER CARRY. Four, and the reason is legibility rather
 * than balance: past four the strip stops being readable at 380px and a player
 * can no longer tell which meter belongs to what.
 *
 * NOTE THAT THE TOOL DOES NOT USE THE BAY'S POWER BUDGET, deliberately. That
 * budget exists because a bay has up to twenty-four machines and a seat on one
 * of them is nearly free, so something had to make carrying everything a
 * choice. A tool has one to four seats in total — the scarcity is already
 * there, and a second limiter on top of it would be two dials doing one job.
 */
export const TOOL_SLOT_CAP = 4;

// ---------------------------------------------------------------------------
// The carrier
// ---------------------------------------------------------------------------

/**
 * THE HAND, SHAPED LIKE A DRILL. Everything in `systems/drillAlloys.ts` reads a
 * `DrillState`, so the tool presents as one: `fits` is the seated abilities,
 * `lastCell` is where the last swing landed (which is where an auto-fire goes),
 * and `level` and `timer` are inert here. It is stored rather than synthesised
 * because the meters have to survive a save — an ability three strokes from
 * ready is state the player earned.
 */
export function handCarrier(state: GameState): DrillState {
  const c = state.casting;
  let h = c.hand;
  if (!h) {
    h = { level: 1, timer: 0, lastCell: -1, name: 'your tool', fits: [] };
    c.hand = h;
  }
  h.fits ??= [];
  h.slots = toolAbilitySlots(state);
  return h;
}

/** Is this carrier the hand rather than a machine? Used where the wired deps
 *  have the object but not the index. */
export function isHandCarrier(state: GameState, drill: DrillState): boolean {
  return state.casting?.hand !== undefined && drill === state.casting.hand;
}

// The resolver `carrierOf` needs. Wired, not imported: drillAlloys is read by
// this file, so it may not read this one back.
wireHandCarrier((state) => (state.casting ? handCarrier(state) : null));

// ---------------------------------------------------------------------------
// What the build grants
// ---------------------------------------------------------------------------

/** The materials the three rock-facing parts are cast from, in part order. */
export function abilityMaterials(tool: ToolStats | null): string[] {
  if (!tool) return [];
  const out: string[] = [];
  for (const type of ABILITY_PARTS) {
    const part = tool.parts.find((p) => p.type === type);
    if (part) out.push(part.materialId);
  }
  return out;
}

/**
 * EVERY ability this build satisfies, best first. Gated by how deep the player
 * has BEEN (`reachedOrdinal`), the same gate the bench pours under — a Loam
 * player cannot build a Cinder ability out of Loam stone that happens to lean
 * the right way, because they have never seen what it does.
 */
export function toolGrants(state: GameState): DrillAbilityDef[] {
  const mats = abilityMaterials(currentTool(state));
  if (mats.length === 0) return [];
  return matchAllAbilities(mats, { reached: reachedOrdinal(state) });
}

/**
 * THE GRADE OF EVERYTHING THIS TOOL CARRIES — the deepest shell among its three
 * rock-facing stones, exactly as a pour's grade is the deepest stone in it.
 * Re-cast the Head in deeper rock and every ability on the tool steps up, which
 * is the doc's "rarity → magnitude" reaching a system it did not used to touch.
 */
export function toolGrade(state: GameState): number {
  const mats = abilityMaterials(currentTool(state));
  return mats.length === 0 ? 1 : mixGrade(mats);
}

/**
 * HOW MANY IT MAY CARRY AT ONCE.
 *
 * The brief's two sources, both in: the BUILD (Binding sets `modSlots`, and the
 * Sockets stone leans it) and USE (a slot every five levels). One is subtracted
 * so that a first tool carries exactly ONE — the moment a tool first does
 * something violent should be a moment, not a pair of them — and everything
 * after that is earned by building better or by mining more.
 */
export function toolAbilitySlots(state: GameState): number {
  const tool = currentTool(state);
  if (!tool) return 0;
  const m = modSlotsOf(state, tool);
  return Math.max(1, Math.min(TOOL_SLOT_CAP, m.fromParts - 1 + m.fromUse));
}

/**
 * THE SAME ABILITY, DESCRIBED FOR THE THING HOLDING IT.
 *
 * The twenty-nine effect lines were authored when a drill was the only carrier,
 * so six of them name one: "a small absence opens beside THE DRILL", "a ring of
 * heat goes out from THE DRILL". Read on a tool that is simply wrong, and it
 * was wrong on screen in the first driven screenshot of this phase.
 *
 * Rewriting the defs would break the drill panel the other way, and authoring a
 * second line per ability is thirty strings to keep in sync for one pronoun. So
 * the carrier is substituted at the point of reading. It is a small list and it
 * is exact — no clever pluralisation, no regex over prose it was not written
 * for; anything not in the map is left alone, because a line that does not
 * mention a machine reads correctly in either hand.
 */
const FOR_THE_HAND: Array<[RegExp, string]> = [
  [/\bagainst the drill\b/g, 'against the head of it'],
  [/\btouching the drill\b/g, 'touching it'],
  [/\bbeside the drill\b/g, 'beside the strike'],
  [/\bfrom the drill\b/g, 'from the strike'],
  [/\bthe bay is carrying\b/g, 'you are carrying'],
  [/\bThe stroke\b/g, 'The swing'],
  [/\bthe stroke\b/g, 'the swing'],
];

export function effectInHand(effect: string): string {
  let out = effect;
  for (const [from, to] of FOR_THE_HAND) out = out.replace(from, to);
  return out;
}

/** Resolved seated abilities with meter state — what the strip draws. */
export function toolFits(state: GameState): Fit[] {
  const h = state.casting?.hand;
  const out: Fit[] = [];
  if (!h?.fits) return out;
  for (let i = 0; i < h.fits.length; i++) {
    const raw = h.fits[i]!;
    const def = ABILITY_BY_ID.get(raw.id);
    if (!def) continue;
    const charge = raw.ch ?? 0;
    out.push({
      def, grade: raw.grade, p: abilityParams(def, raw.grade),
      slot: i, charge, ready: charge >= def.charge.need,
    });
  }
  return out;
}

/** What the bench says about the three stones BEFORE you commit — the lean,
 *  never the ability (pillar 5). Reads the parts on the station, so it moves as
 *  you slot them. */
export function toolAbilityHint(materialIds: string[]): string | null {
  return alloyHint(materialIds.filter(Boolean));
}

// ---------------------------------------------------------------------------
// Building the tool decides what it can do
// ---------------------------------------------------------------------------

/**
 * RECONCILE THE SEATED ABILITIES WITH THE BUILD. Called whenever the tool
 * changes — built, re-seated, broken down.
 *
 * Four things, in order:
 *  - DISCOVER. Anything this build grants that the player has never made is
 *    recorded now, in the SAME codex the crucible writes to. You made the
 *    thing; it exists; the Compendium knows it. (It does not follow that you
 *    can pour it into a drill for free — that is still a pour.)
 *  - DROP what the build no longer grants. Re-cast the Head in dull stone and
 *    the lightning goes with it, which is what makes the stone matter.
 *  - RE-STAMP the grade, because the build is what sets it.
 *  - FILL empty slots with the best of what is granted, so a player who never
 *    opens the panel still gets what they built for.
 */
export function syncToolAbilities(state: GameState, ctx?: EngineCtx): void {
  if (!state.casting) return;
  const h = handCarrier(state);
  const granted = toolGrants(state);
  const grade = toolGrade(state);
  const live = new Set(granted.map((a) => a.id));

  if (granted.length === 0) {
    h.fits = [];
    return;
  }

  for (const def of granted) {
    if (!state.drills.alloys.includes(def.id)) {
      state.drills.alloys.push(def.id);
      ctx?.emit({ type: 'drillAlloyFound', id: def.id });
    }
  }

  const slots = toolAbilitySlots(state);
  // KEEP THE METERS of anything still granted. A re-seat of the Handle should
  // not empty a charge the player has been filling for a minute.
  const kept = (h.fits ?? []).filter((f) => live.has(f.id));
  for (const f of kept) f.grade = grade;

  const seatedIds = new Set(kept.map((f) => f.id));
  for (const def of granted) {
    if (kept.length >= slots) break;
    if (seatedIds.has(def.id)) continue;
    kept.push({ id: def.id, grade, ch: 0 });
    seatedIds.add(def.id);
  }
  h.fits = kept.slice(0, slots);
}

/** Put a granted ability in a slot by hand, or empty the slot with `null`. */
export function setToolAbility(
  state: GameState, ctx: EngineCtx, slot: number, id: string | null,
): ActionResult {
  const tool = currentTool(state);
  if (!tool) return { ok: false, reason: 'You are not carrying one' };
  const slots = toolAbilitySlots(state);
  if (slot < 0 || slot >= slots) return { ok: false, reason: 'No such slot on it' };
  const h = handCarrier(state);
  const fits = [...(h.fits ?? [])];

  if (id === null) {
    if (!fits[slot]) return { ok: false, reason: 'Nothing in that slot' };
    fits.splice(slot, 1);
    h.fits = fits;
    ctx.dirty();
    return { ok: true };
  }

  const granted = toolGrants(state);
  const def = granted.find((a) => a.id === id);
  if (!def) return { ok: false, reason: 'This one was not built to do that' };
  const already = fits.findIndex((f) => f.id === id);
  if (already >= 0 && already !== slot) fits.splice(already, 1);

  const seated = { id, grade: toolGrade(state), ch: 0 };
  if (slot < fits.length) fits[slot] = seated;
  else fits.push(seated);
  h.fits = fits.slice(0, slots);
  ctx.dirty();
  return { ok: true, data: { id, name: def.name } };
}

// ---------------------------------------------------------------------------
// The meter, and the firing
// ---------------------------------------------------------------------------

/**
 * A SWING FILLS THE METER. The tool's analogue of `advanceCharges`, and
 * deliberately its twin rather than a call into it: a drill's version reads the
 * bay's `fits` and auto-fires at `pick`ed rock, while the hand's fires at the
 * cell the player just hit, which is the only sensible aim for a swing.
 *
 * `cell` is where the swing landed. `cellWasFull` feeds the `onFull` rule that
 * makes "mining a charged cell releases lightning" a meter behaviour rather
 * than a special case — the same rule, on the same abilities.
 */
export function advanceToolCharges(
  state: GameState, mods: ModifierCache, ctx: EngineCtx,
  cell: number, cellWasFull: boolean, swings = 1,
): void {
  const h = state.casting?.hand;
  if (!h?.fits || h.fits.length === 0) return;
  if (!currentTool(state)) return;
  h.lastCell = cell;
  for (let slot = 0; slot < h.fits.length; slot++) {
    const raw = h.fits[slot]!;
    const def = ABILITY_BY_ID.get(raw.id);
    if (!def) continue;
    let ch = (raw.ch ?? 0) + swings;
    if (cellWasFull && def.charge.onFull) ch += def.charge.onFull;
    if (def.charge.roll && Math.random() < def.charge.roll) ch = def.charge.need;
    raw.ch = ch;
    // AUTO-FIRE after the ready window, exactly as the bay does. A player who
    // only ever clicks rock gets everything their tool can do; the window is
    // the whole of what watching buys you.
    if (ch >= def.charge.need + READY_GRACE) {
      fireAbility(state, mods, ctx, TOOL_CARRIER, slot, cell);
    }
  }
}

/**
 * THE HAND'S HIT — what one cell of a tool's plan does.
 *
 * Wired from `face.ts` rather than imported, because `face.ts` reads this
 * module for the meter and the cycle would close. The body is a manual harvest
 * and a drop roll weighted by the share: an explosion is ONE swing spread wide,
 * so its drop weight sums to about one swing's worth (the A.56 rule, which
 * exists because `rollForDrop` fires on weight and would otherwise multiply the
 * material economy by however many cells the figure covered).
 */
let handHarvest: (
  state: GameState, mods: ModifierCache, ctx: EngineCtx, cell: number, share: number,
) => void = () => { /* wired by face.ts */ };

export function wireHandHarvest(fn: typeof handHarvest): void { handHarvest = fn; }

export function toolHit(
  state: GameState, mods: ModifierCache, ctx: EngineCtx, cell: number, share: number,
): void {
  handHarvest(state, mods, ctx, cell, Math.max(0, Math.min(1, share)));
}
