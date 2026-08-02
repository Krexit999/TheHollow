/**
 * THE DRILL BAY — dumb auto-miners. Buy more, they mine. That is the whole bay.
 *
 * A.53 STRIPPED THE CONFIGURATION LAYER, and the reason is worth keeping: the
 * bay is the IDLE layer, and every knob put on it was a chore on the screen a
 * player is least often looking at. Heads and bits (v21), the shared feed, the
 * seam reading, the bit grain and the bay synergies (A.52) are all gone —
 * along with per-drill wear and repair, which was the same mistake one phase
 * earlier: an upkeep button on a machine whose entire job is to work while you
 * are elsewhere.
 *
 * What the bay DOES is decided at the Forge. You pour an alloy into a drill and
 * that drill gains an ABILITY — and since A.57 an ability is a thing that
 * HAPPENS: an explosion, an arc that walks across the face, a beam through a
 * whole row, a void. It fires on its own meter so an idle player gets all of
 * it, and a present player can set it off early and aim it.
 *
 * PILLAR 2 IS ENFORCED HERE, at `strike`. Every bite in the game — an ordinary
 * stroke, a nine-cell detonation, a twenty-cell chain — is `min(power,
 * cellCharge)` against a cell the field filled. Abilities change how many cells
 * a stroke reaches and how explosively; the rock still only makes W·H·regen a
 * second, and the more cells an explosion empties, the more the field has to
 * refill afterwards.
 *
 * Invented numbers (appended to DESIGN.md):
 *   - Strike interval: 2.0s / (1 + 0.04 * level) / drillSpeed-bucket
 *   - Strike power:    (2 + 0.75 * level) charge * drillPower-bucket
 */
import { D } from '../decimal';
import type { ModifierCache } from '../modifiers';
import type { DrillState, EngineCtx, GameState } from '../types';
import { cellCap, harvestCell, neighbors } from './face';
import { grantXP } from './xp';
import { DRILL_DROP_FACTOR, rollForDrop } from './drops';
import { addCurrency } from '../resources';
import { currentShell } from '../shells';
import { runChipMult } from '../signatures';
import { affinityMult, logImplementUse } from './affinity';
import { lawNum } from '../laws';
import { relicRule } from './relicPowers';
import { advanceCharges, rotBite, wireBurnHarvest, wireFireDeps, TOOL_CARRIER } from './drillAlloys';
import { isHandCarrier, toolHit } from './toolAbilities';
import {
  DRILL_ORE_SPEED, ORE_EAGER_OPENING, ORE_WORTH_OPENING, oreAt, openOre, plantOre,
} from './ores';
import { oreRichness } from '../content/ores';
import { ACROSS_TIME_MULT, FRONT_COMPACTION, seedCompaction } from './grain';

/** Twenty-four rails, and A.56 split how you fill them: `BOUGHT_DRILLS` come
 *  off the shop at a steep escalating curve, the rest are PRIZES from other
 *  systems (systems/prizeDrills.ts). The cap itself is unchanged. */
export const MAX_DRILLS = 24;
export const BOUGHT_DRILLS = 16;
export const DRILL_BASE_INTERVAL = 2.0;

export function drillInterval(state: GameState, mods: ModifierCache, drill: DrillState): number {
  const base = DRILL_BASE_INTERVAL / (1 + 0.04 * drill.level) / mods.get(state, 'drillSpeed').toNumber();
  // ACROSS THE GRAIN IS SLOW, for the machine exactly as for the hand — and the
  // machine gets NO dust bonus for it, because the thing it is buying is
  // compaction on cells the player will come back and finish. A bay set to
  // `across` earns strictly less dust than one set to `with`; what it buys is
  // reach into the deep-entry gates, which is drop-table and not income.
  return base * (grainModeOf(drill) === 'across' ? ACROSS_TIME_MULT : 1);
}

/** Absent = 'with', which is what every drill did before the grain existed. */
export function grainModeOf(drill: DrillState): 'with' | 'across' | 'follow' {
  return drill.grainMode ?? 'with';
}

/**
 * A PRIZE chassis bites harder than a bought one. Same argument as affinity:
 * it is a `drillPower` term, so it reaches the regen ceiling sooner and can
 * never go past it.
 */
export const PRIZE_POWER = 1.6;

export function drillPower(state: GameState, mods: ModifierCache, drill: DrillState): number {
  const aff = affinityMult(drill, currentShell(state).id);
  const prize = drill.prize ? PRIZE_POWER : 1;
  return (2 + 0.75 * drill.level) * mods.get(state, 'drillPower').toNumber() * aff * prize;
}

/** Default names so a drill arrives as an individual, not "drill 3". */
const DRILL_NAMES = ['Bess', 'Old Tom', 'The Mole', 'Gnash', 'Patience', 'Grinder', 'Sunday', 'Whistler', 'The Badger', 'Nib', 'Molly', 'Crib', 'Digby', 'The Ferret', 'Auntie', 'Rasp', 'Cinders', 'The Terrier', 'Nub', 'Gravel', 'The Toad', 'Pip', 'Quarry', 'Muncher'];
export function defaultDrillName(index: number): string {
  return DRILL_NAMES[index] ?? `Drill ${index + 1}`;
}

export function newDrill(name?: string): DrillState {
  return { level: 0, timer: 0, lastCell: 0, use: {}, name };
}

export function newPrizeDrill(name: string, source: string, slots: number): DrillState {
  return { level: 0, timer: 0, lastCell: 0, use: {}, name, prize: source, slots };
}

// ---------------------------------------------------------------------------
// ROUTING (A.56) — where a drill works, and what it would rather work
// ---------------------------------------------------------------------------

/**
 * A.52 put a configuration screen on the idle layer and it was a chore because
 * a drill NEEDED setting up before it did its job properly. This does not: a
 * drill with no zone works the whole face and a drill with no priority takes
 * whatever the bay offers, which is exactly what every drill did before this
 * existed. Pillar 1 is untouched by construction — the defaults ARE the old
 * behaviour, byte for byte.
 *
 *  zone      — explicit cell indices. Absent = the whole face.
 *  priority  — both / oresFirst / ores / rock.
 */
export type DrillPriority = 'both' | 'oresFirst' | 'ores' | 'rock';

export function drillPriority(state: GameState, drill: DrillState): DrillPriority {
  return drill.priority ?? (state.drills.huntOres === false ? 'rock' : 'both');
}

/** Cheap membership test for a drill's zone. `null` when it works everywhere. */
export function zoneSet(drill: DrillState): Set<number> | null {
  const z = drill.zone;
  if (!z || z.length === 0) return null;
  return new Set(z);
}

/**
 * ONE TARGETING RULE: the cell this bay would get the most out of — charge ×
 * what this bite would actually take. ROT is in the score for the reason THE
 * SET had to be in A.53's: a rule that always picks the FULLEST cell can never
 * come back to one it has softened, so an ability whose whole point is "this
 * rock gives up easier now" would never get a second bite.
 */
/**
 * HOW MUCH A CELL IS WORTH LESS FOR HAVING A MACHINE ON OR BESIDE IT.
 *
 * THE SWARM WAS NEVER TWO DRILLS ON ONE CELL — that was measured and ruled out.
 * Five machines already took five DIFFERENT cells (4.98 distinct of 5 over 240
 * ticks), because each strike drains its cell below its neighbours and the next
 * drill therefore picks the next one along. A simple "don't take a claimed
 * cell" rule was written, measured, and found to change nothing at all.
 *
 * What a player actually sees is a MARCHING BLOCK: five drills on cells 0,1,2,
 * 3,4, then 5,6,7,8,9 — distinct, adjacent, and moving as one lump across the
 * top-left of the grid. On a full face every cell scores identically, so the
 * tie goes to the lowest index every time and the fleet crowds into a corner.
 *
 * So crowding is priced instead of forbidden. Taking a cell discounts it and
 * its neighbours for the rest of the tick, which on a flat face pushes the next
 * machine at least two cells away — but a genuinely richer cell still wins,
 * because this is a preference and not a rule. It is a soft term on the same
 * score, so the bay still works the best rock it can reach.
 *
 * Pillar 2 is untouched: this changes WHICH cell each drill empties, never how
 * much charge the field made.
 */
const CROWD_SELF = 0.55;
const CROWD_NEAR = 0.3;

function crowdOut(state: GameState, crowd: number[], cell: number): void {
  crowd[cell] = Math.max(crowd[cell] ?? 0, CROWD_SELF);
  for (const n of neighbors(state, cell)) crowd[n] = Math.max(crowd[n] ?? 0, CROWD_NEAR);
}

function pickTarget(
  state: GameState, skip: (i: number) => boolean, zone: Set<number> | null, rotted: boolean,
  crowd?: number[],
): number {
  const cells = state.face.cells;
  const ore = state.face.ore;
  let best = -1;
  let bestScore = -1;
  for (let i = 0; i < cells.length; i++) {
    if (skip(i)) continue;
    if (zone && !zone.has(i)) continue;
    // A pocket is never an ordinary target: it will not come away in one bite.
    if (ore?.[i]) continue;
    let score = rotted ? cells[i]! * rotBite(state, i) : cells[i]!;
    if (crowd) score *= 1 - (crowd[i] ?? 0);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

/**
 * SEND THEM AT THE POCKETS. `huntOres` defaults ON, so an idle player harvests
 * pockets without ever opening the panel (pillar 1); turning it off is the
 * interesting choice, because a pocket is richer by hand.
 *
 * The FULLEST unclaimed pocket that is worth the trip, so two drills never
 * crowd one cell while another sits open and none of them wastes the job on a
 * pocket that has barely started filling.
 */
function openPockets(
  state: GameState, mods: ModifierCache, skip: (i: number) => boolean,
): number[] | null {
  const ore = state.face.ore;
  if (!ore) return null;
  if (state.drills.huntOres === false
    && !state.drills.units.some((u) => u.priority === 'ores' || u.priority === 'oresFirst' || u.priority === 'both')) {
    return null;
  }
  // BUILT ONCE FOR THE WHOLE BAY. The per-drill version scanned the face for
  // every machine on every 100ms step — twelve drills over a two-hour catch-up
  // is thirty-one million iterations, and it doubled the cost of a warp.
  const claimedBy = new Set<number>();
  for (const u of state.drills.units) if (u.oreCell !== undefined) claimedBy.add(u.oreCell);

  let out: number[] | null = null;
  const base = cellCap(state, mods);
  // The list is built on the LOWEST bar any machine in this bay uses, and each
  // drill applies its OWN bar when it claims — so one eager machine does not
  // force half-full pockets on everybody else.
  const floor = state.drills.units.some((u) => drillPriority(state, u) === 'oresFirst')
    ? ORE_EAGER_OPENING : ORE_WORTH_OPENING;
  for (let i = 0; i < ore.length; i++) {
    const id = ore[i];
    if (!id || claimedBy.has(i) || skip(i)) continue;
    // A MACHINE WILL NOT SPEND SIX SECONDS ON AN EMPTY POCKET. Without this the
    // sim's ore-heavy arm ran 0.82x of the control: pockets spawned faster than
    // they filled, and buying the spawn-rate upgrade made income go DOWN.
    if ((state.face.cells[i] ?? 0) < base * oreRichness(id) * floor) continue;
    (out ??= []).push(i);
  }
  out?.sort((a, b) => (state.face.cells[b] ?? 0) - (state.face.cells[a] ?? 0));
  return out;
}

/** Ore-routed machines pick from a full list; everyone else takes what is left. */
function claimRank(state: GameState, i: number): number {
  const p = drillPriority(state, state.drills.units[i]!);
  return p === 'ores' ? 0 : p === 'oresFirst' ? 1 : 2;
}

/**
 * HOW FULL A POCKET HAS TO BE BEFORE THIS MACHINE WILL TAKE IT.
 *
 * THIS IS WHAT "ORE FIRST" WAS MISSING, and why it measured IDENTICAL to
 * "rock and ore" — 140 pockets and 248 strikes for both, to the unit. All the
 * setting did was sort the claim queue, and a queue only matters when two
 * drills want the same pocket in the same tick, which almost never happens. So
 * the option existed, read as a real choice in the menu, and changed nothing.
 *
 * Now it also lowers the bar: an ore-first machine goes for a pocket at 35%
 * where everyone else waits for 70%. That is a TRADE, not a buff — a pocket
 * taken at 35% pays 35% and costs the same six seconds — and the panel says so.
 */
function worthTheTrip(p: DrillPriority): number {
  return p === 'oresFirst' ? ORE_EAGER_OPENING : ORE_WORTH_OPENING;
}

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

export function tickDrills(state: GameState, mods: ModifierCache, ctx: EngineCtx, dt: number): void {
  if (!state.drills.bayBuilt || state.drills.units.length === 0) return;
  // A drill never works a cultivated (vined) cell — the Growth automation law
  // leaves those for their own harvest.
  const skip = (i: number): boolean => (state.growth.stage[i] ?? 0) > 0;
  const shellId = currentShell(state).id;
  const offered = openPockets(state, mods, skip);
  const capNow = cellCap(state, mods);
  // Is ANY rot on the rock? One array read, so the targeting scan does not have
  // to ask per cell — the A.56 lesson about the per-cell hot path.
  const rotted = (state.drills.rot?.some((v) => v > 0)) ?? false;
  // WHERE THIS TICK'S MACHINES HAVE ALREADY GONE. Allocated once per tick and
  // only when there is more than one machine to keep apart — a single drill has
  // nobody to crowd, and the bay spends most of a long warp with the array
  // untouched.
  const crowd: number[] | undefined = state.drills.units.length > 1
    ? new Array<number>(state.face.cells.length).fill(0) : undefined;

  // Only SORT when somebody actually asked to be served first. A bay with no
  // routing set — every bay, until a player opens the menu — keeps plain index
  // order and allocates one array instead of two plus a comparator pass.
  const routed = state.drills.units.some((u) => u.priority !== undefined);
  const claimOrder = state.drills.units.map((_, i) => i);
  if (routed) claimOrder.sort((a, b) => claimRank(state, a) - claimRank(state, b));

  for (const d of claimOrder) {
    const drill = state.drills.units[d]!;
    const zone = zoneSet(drill);
    const priority = drillPriority(state, drill);

    // --- THE POCKET JOB -----------------------------------------------------
    // A drill on an ore is doing NOTHING ELSE for the duration, and that is the
    // cost the player weighs when they leave one to the machines.
    //
    // ONCE IT STARTS, IT FINISHES. A drill releases a pocket for exactly one
    // reason — the pocket is not there any more, because something else opened
    // it first. Half-mined ore abandoned because a machine changed its mind is
    // the worst kind of waste: the time was already spent and bought nothing.
    if (drill.oreCell !== undefined && !oreAt(state, drill.oreCell)) {
      delete drill.oreCell;
      delete drill.oreProgress;
    }
    if (drill.oreCell === undefined && offered && offered.length > 0 && priority !== 'rock') {
      // A zoned drill takes the best pocket INSIDE its zone and leaves the rest
      // for somebody who can reach them — and every machine applies its own bar
      // for how full is full enough.
      const bar = capNow * worthTheTrip(priority);
      const at = offered.findIndex((c) => (!zone || zone.has(c))
        && (state.face.cells[c] ?? 0) >= bar * oreRichness(state.face.ore?.[c]));
      if (at >= 0) {
        const claim = offered.splice(at, 1)[0]!;
        drill.oreCell = claim;
        drill.oreProgress = 0;
        drill.lastCell = claim;
        // A machine settling onto a pocket crowds the rock around it too, so
        // the rest of the bay does not park on top of the one that is digging.
        if (crowd) crowdOut(state, crowd, claim);
      }
    }
    if (drill.oreCell !== undefined) {
      const cell = drill.oreCell;
      const need = oreAt(state, cell)!.digSec * DRILL_ORE_SPEED;
      drill.oreProgress = (drill.oreProgress ?? 0) + dt;
      if (drill.oreProgress >= need) {
        openOre(state, mods, ctx, cell, 'drill', DRILL_DROP_FACTOR, drill.name);
        state.stats.drillStrikes += 1;
        logImplementUse(drill, shellId, 1);
        delete drill.oreCell;
        delete drill.oreProgress;
      }
      continue; // busy either way
    }

    // ORES ONLY: this machine does not chip rock. It waits — a real cost the
    // player chose, and per-drill, so a bay never stalls as a whole.
    if (priority === 'ores') continue;

    drill.timer += dt;
    const interval = drillInterval(state, mods, drill);
    // ── THE GRAIN MODE (Proof #1) ────────────────────────────────────────────
    // Three behaviours on the existing dropdown, built ON TOP of the existing
    // claiming, crowding and zone routing rather than beside it: the mode picks
    // a preferred cell and decides what the strike SEEDS, and everything else
    // — pockets, priority, crowd-out, the second hand — runs exactly as before.
    const grainMode = grainModeOf(drill);
    const seeds = grainMode !== 'with';
    let strikes = 0;
    while (drill.timer >= interval && strikes < 4) {
      drill.timer -= interval;
      strikes++;
      // FOLLOW: chase the live front's head and extend it. It DIES WITH THE
      // FRONT in the sense that matters — the chasing stops — but the machine
      // falls back to ordinary targeting rather than standing still, because a
      // drill that idles while you are away is worse than one that mines badly.
      let target = -1;
      if (grainMode === 'follow') {
        const head = state.face.front;
        if (head?.alive && !skip(head.cell) && (!zone || zone.has(head.cell))
          && !state.face.ore?.[head.cell]) {
          target = head.cell;
        }
      }
      if (target < 0) target = pickTarget(state, skip, zone, rotted, crowd);
      if (target < 0) continue; // every cell vined or out of zone — it idles
      if (crowd) crowdOut(state, crowd, target);

      // THE SECOND BITE (A.48 relic power). Deliberately NOT the 'Two Hands'
      // Axiom in cheaper clothes: the Axiom gives a second cell at FULL power,
      // this splits the stroke and gives two at 65% each.
      const secondBite = relicRule(state, 'twinBite');
      const power = drillPower(state, mods, drill) * (secondBite ? 0.65 : 1);
      const handCells: number[] = [target];
      const hands = Math.max(lawNum(state, 'drillStrokes'), secondBite ? 2 : 1);
      if (hands > 1) {
        let second = -1;
        let secondCharge = 0;
        // The second hand is crowded away from the first on the same term.
        for (let i = 0; i < state.face.cells.length; i++) {
          if (i === target || skip(i)) continue;
          if (zone && !zone.has(i)) continue;
          const c = state.face.cells[i]! * (1 - (crowd?.[i] ?? 0));
          if (c > secondCharge) { secondCharge = c; second = i; }
        }
        if (second >= 0) {
          handCells.push(second);
          if (crowd) crowdOut(state, crowd, second);
        }
      }

      // Was the cell nearly full? Several abilities charge faster off a full
      // one — "mining a charged cell releases lightning", as a meter rule.
      const wasFull = (state.face.cells[target] ?? 0) >= capNow * 0.7;

      for (const hit of handCells) {
        strike(state, mods, ctx, drill, hit, power * rotBite(state, hit), d);
        // A SEEDING MACHINE LEAVES COMPACTION AND COLLECTS NOTHING. The
        // deep-entry gates are hand-only (grain.ts): a machine parked on a deep
        // cell would otherwise roll the terminal material every stroke, which is
        // a faucet wearing a drop table's clothes.
        if (seeds) seedCompaction(state, hit, FRONT_COMPACTION);
      }

      // THE METER. Every fitted ability advances, and anything that fills FIRES
      // ITSELF — which is the half of the trigger design pillar 1 rests on.
      if (drill.fits && drill.fits.length > 0) {
        advanceCharges(state, mods, ctx, d, wasFull);
      }

      logImplementUse(drill, shellId, 1);
    }
    if (drill.timer > interval) drill.timer = interval; // don't bank strikes
  }
}

/**
 * ONE HIT ON ONE CELL: harvest, byproduct, XP, drop and encounter rolls.
 *
 * `weightShare` scales the DROP weight for an ability hit. `rollForDrop` rolls
 * fragments and relics on the weight regardless of how much charge came out, so
 * an ability that touches twenty cells would multiply the material economy
 * twentyfold on a term pillar 2 cannot see. Scaling by the share makes a whole
 * explosion worth about one stroke of drop weight, which is the honest reading:
 * it is ONE stroke, spread wide.
 */
function strike(
  state: GameState, mods: ModifierCache, ctx: EngineCtx,
  drill: DrillState, hit: number, power: number, d: number, weightShare = 1,
): void {
  const cellCharge = state.face.cells[hit] ?? 0;
  const take = Math.min(power, cellCharge);
  drill.lastCell = hit;
  if (take <= 0) return;
  const sigMult = runChipMult(state, mods, ctx, hit, false);
  const { dust } = harvestCell(state, mods, hit, take / cellCharge, D(sigMult));
  state.stats.drillStrikes += 1;
  const by = currentShell(state).drillByproduct;
  if (by) addCurrency(state, by.currencyId, D(take * by.perCharge));
  grantXP(state, mods, ctx, D(0.12 * (1 + 0.08 * state.depth) * (take / 8)));
  rollForDrop(state, mods, ctx, take, DRILL_DROP_FACTOR * weightShare, drill.name, hit);
  ctx.emit({ type: 'drillStrike', drill: d, cell: hit, dust });
}

/**
 * WIRING. `drillAlloys` needs `strike`, and `strike`'s module needs the
 * abilities — so the dependency is injected once at load rather than imported
 * in a cycle. Everything an ability can do to the world is in this object, and
 * that is deliberate: it is the list you audit when asking whether an ability
 * could ever create charge. It cannot; every entry either harvests an existing
 * cell, opens a pocket the rock already filled, or moves a pocket about.
 */
wireFireDeps({
  hit: (state, mods, ctx, drill, drillIndex, cell, share) => {
    // THE ONE PLACE A HAND DIFFERS FROM A MACHINE. A drill's bite is a POWER —
    // an absolute amount of charge it can shift per stroke — while a swing takes
    // a FRACTION of whatever the cell is holding (`harvestCell`, the manual
    // funnel). Both end in `take = min(want, held)` and neither can exceed it,
    // so the two branches are the same guarantee written in the two units the
    // two carriers actually work in.
    if (drillIndex === TOOL_CARRIER) { toolHit(state, mods, ctx, cell, share); return; }
    // AN ABILITY HIT IS A FRACTION OF A FULL BITE, and the bite is still
    // min(power, cellCharge). `share` is clamped at 1 by `abilityParams`.
    const power = drillPower(state, mods, drill) * rotBite(state, cell) * share;
    strike(state, mods, ctx, drill, cell, power, drillIndex, share);
  },
  openPocket: (state, mods, ctx, cell, drill) => {
    if (!oreAt(state, cell)) return;
    // A pocket opened BY HAND pays whole rolls; by machine, a fraction (A.55).
    // The hand is slower at it, so it is not a way around the trade.
    const byHand = isHandCarrier(state, drill);
    openOre(state, mods, ctx, cell, byHand ? 'hand' : 'drill', DRILL_DROP_FACTOR, drill.name);
  },
  plant: (state, mods, ctx, cell) => { plantOre(state, mods, ctx, cell); },
  blocked: (state, drill, cell) => {
    if ((state.growth.stage[cell] ?? 0) > 0) return true;
    const z = drill.zone;
    return !!z && z.length > 0 && !z.includes(cell);
  },
  // A SWING AIMS ITSELF AT THE ROCK IT JUST HIT. Returning -1 for the hand lets
  // `fireAbility` fall through to `lastCell`, which the meter stamps every
  // swing — a tool that fired at the fullest cell on the far side of the face
  // would not read as the thing in your hand going off.
  pick: (state, drill) => (isHandCarrier(state, drill) ? -1 : pickTarget(
    state,
    (i) => (state.growth.stage[i] ?? 0) > 0,
    zoneSet(drill),
    (state.drills.rot?.some((v) => v > 0)) ?? false,
  )),
});

wireBurnHarvest((state, mods, cell, frac) => { harvestCell(state, mods, cell, frac, D(1)); });

/** Steady-state charge/sec the bay can consume — used by the offline calc. */
export function drillThroughput(state: GameState, mods: ModifierCache): number {
  let total = 0;
  for (const drill of state.drills.units) {
    total += drillPower(state, mods, drill) / drillInterval(state, mods, drill);
  }
  return total * lawNum(state, 'drillStrokes');
}

export { neighbors };
