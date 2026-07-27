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
 * The A.52 puzzle was not badly built; it was built in the wrong place. What
 * replaced it is DRILL ALLOYS (content/drillAlloys.ts): you pour an alloy into
 * a drill at the Forge and THAT DRILL gains an ABILITY that visibly changes how
 * it works the grid. The interesting decision moved to a screen you visit on
 * purpose, and the drills went back to being furniture — a drill with no alloy
 * needs nothing and mines fine, which is the line A.52 crossed and this does
 * not. A.54 moved the fitting from one bay-wide slot onto the individual
 * machine, so a bay can run three abilities at once and the question is which
 * drill gets which.
 *
 * Drills can only harvest what the field produces (pillar 2): they take charge
 * from cells, so regen is the ceiling. Every alloy ability obeys the same rule
 * — see drillAlloys.ts for the per-ability argument.
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
import { ENCOUNTER_DRILL_FACTOR, rollForEncounter } from '../combat/combat';
import { addCurrency } from '../resources';
import { currentShell } from '../shells';
import { runChipMult } from '../signatures';
import { affinityMult, logImplementUse } from './affinity';
import { lawNum } from '../laws';
import { relicRule } from './relicPowers';
import {
  arcTargets, residueBite, markResidue, markRichness, markBurn, reachTargets,
  drillCarries, bayFit, ARC_SHARE, type Fit,
} from './drillAlloys';

import { DRILL_ORE_SPEED, ORE_WORTH_OPENING, oreAt, openOre, plantOre } from './ores';
import { oreRichness } from '../content/ores';

/** The bay's residue fit, resolved once per tick and threaded through the
 *  targeting scan. `null` when nothing in the bay softens rock. */
type BayResidue = Fit | null;

/** Twenty-four rails, and A.56 splits how you fill them: `BOUGHT_DRILLS` come
 *  off the shop at a structural price curve, the rest are PRIZES from other
 *  systems (systems/prizeDrills.ts). The cap itself is unchanged. */
export const MAX_DRILLS = 24;
export const BOUGHT_DRILLS = 16;
export const DRILL_BASE_INTERVAL = 2.0;

export function drillInterval(state: GameState, mods: ModifierCache, drill: DrillState): number {
  return DRILL_BASE_INTERVAL / (1 + 0.04 * drill.level) / mods.get(state, 'drillSpeed').toNumber();
}

export function drillPower(state: GameState, mods: ModifierCache, drill: DrillState): number {
  // AFFINITY: a drill that has worked this shell a lot hits it a little harder —
  // and, being drillPower, only reaches the regen ceiling sooner, never past it.
  const aff = affinityMult(drill, currentShell(state).id);
  // A PRIZE chassis bites harder than a bought one. Same argument as affinity:
  // it is a `drillPower` term, so it reaches the regen ceiling sooner and can
  // never go past it.
  const prize = drill.prize ? PRIZE_POWER : 1;
  return (2 + 0.75 * drill.level) * mods.get(state, 'drillPower').toNumber() * aff * prize;
}

/** Default names so a drill arrives as an individual, not "drill 3". The player
 *  can rename any of them. Cycles, then falls back to a number past the pool. */
const DRILL_NAMES = ['Bess', 'Old Tom', 'The Mole', 'Gnash', 'Patience', 'Grinder', 'Sunday', 'Whistler', 'The Badger', 'Nib', 'Molly', 'Crib', 'Digby', 'The Ferret', 'Auntie', 'Rasp', 'Cinders', 'The Terrier', 'Nub', 'Gravel', 'The Toad', 'Pip', 'Quarry', 'Muncher'];
export function defaultDrillName(index: number): string {
  return DRILL_NAMES[index] ?? `Drill ${index + 1}`;
}

export function newDrill(name?: string): DrillState {
  return { level: 0, timer: 0, lastCell: 0, use: {}, name };
}

/**
 * A PRIZE DRILL is bigger than a bought one, in every sense the player can see.
 * More bite, more slots for alloys, and a chassis the renderer draws larger.
 * The multiplier is a `drillPower` term, so it reaches the regen ceiling sooner
 * and never past it — a prize is a better machine, not a bigger field.
 */
export const PRIZE_POWER = 1.6;

export function newPrizeDrill(name: string, source: string, slots: number): DrillState {
  return { level: 0, timer: 0, lastCell: 0, use: {}, name, prize: source, slots };
}

// ---------------------------------------------------------------------------
// ROUTING (A.56) — where a drill works, and what it would rather work
// ---------------------------------------------------------------------------

/**
 * THE ROUTING LAYER, and why it is not the thing A.52 got wrong.
 *
 * A.52 put a configuration screen on the idle layer and it was a chore because
 * a drill NEEDED setting up before it did its job properly. This does not: a
 * drill with no zone works the whole face and a drill with no priority takes
 * whatever the bay offers, which is exactly what every drill did before this
 * existed. Routing is opt-in spatial control for a player who wants to say
 * "these four stay in the top-left and leave my pockets alone", and it is
 * invisible to everyone else. Pillar 1 is untouched by construction: the
 * defaults are the old behaviour, byte for byte.
 *
 *  zone      — explicit cell indices. Absent = the whole face.
 *  priority  — what this machine wants:
 *                both      work rock, take a pocket when one is offered
 *                oresFirst first refusal on pockets, works rock between them
 *                ores      pockets only — it will stand idle rather than chip
 *                rock      never claims a pocket
 */
export type DrillPriority = 'both' | 'oresFirst' | 'ores' | 'rock';

export function drillPriority(state: GameState, drill: DrillState): DrillPriority {
  // The bay-wide hunt switch is still the DEFAULT, so turning it off keeps
  // doing what it always did for every drill that has not been told otherwise.
  return drill.priority ?? (state.drills.huntOres === false ? 'rock' : 'both');
}

/** Cheap membership test for a drill's zone. `null` when it works everywhere. */
export function zoneSet(drill: DrillState): Set<number> | null {
  const z = drill.zone;
  if (!z || z.length === 0) return null;
  return new Set(z);
}

/**
 * ONE TARGETING RULE: the cell this bay would get the most out of. The four
 * selectable behaviours went with the rest of the configuration — a dropdown
 * per drill was the definition of fiddling on the idle layer, and "hit the
 * richest rock" is the only one a player would ever have a reason to pick.
 *
 * The score is charge × what this bite would actually take, which is plain
 * charge for a bare bay. THE SET has to be in the score or it is a lie: the
 * first sim run had emberset reading 1.00x against bare, because a rule that
 * always picks the FULLEST cell can never return to the one it just softened,
 * so an ability whose whole text is "the next bite takes far more" never got a
 * next bite. Still regen-bound — this changes which charge is taken first,
 * never how much of it there is.
 */
function pickTarget(
  state: GameState, skip: (i: number) => boolean, zone: Set<number> | null,
  resFit: BayResidue,
): number {
  const cells = state.face.cells;
  const ore = state.face.ore;
  let best = -1;
  let bestScore = -1;
  for (let i = 0; i < cells.length; i++) {
    if (skip(i)) continue;
    // ZONE (A.56): a painted drill simply does not see the rest of the face.
    if (zone && !zone.has(i)) continue;
    // A pocket is never an ordinary target: it will not come away in one bite,
    // and a drill that kept picking it would stand there striking nothing.
    if (ore?.[i]) continue;
    const score = cells[i]! * (resFit ? residueBite(state, i, resFit) : 1);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/**
 * CREEPVINE's target rule: the fullest neighbour of where it already is, so the
 * machine crawls instead of teleporting. Falls back to the ordinary rule when
 * it has crawled into a dead end — a drill that stopped working because it
 * painted itself into a corner would be a bug, not a characterful ability.
 */
function creepTarget(
  state: GameState, drill: DrillState, skip: (i: number) => boolean, zone: Set<number> | null,
  resFit: BayResidue,
): { cell: number; ran: boolean } {
  const ore = state.face.ore;
  let best = -1;
  let bestCharge = 0.5;
  for (const i of neighbors(state, drill.lastCell)) {
    if (skip(i) || ore?.[i]) continue;
    if (zone && !zone.has(i)) continue;
    const c = state.face.cells[i] ?? 0;
    if (c > bestCharge) { bestCharge = c; best = i; }
  }
  if (best >= 0) return { cell: best, ran: true };
  return { cell: pickTarget(state, skip, zone, resFit), ran: false };
}

/**
 * SEND THEM AT THE POCKETS. The whole of drill routing, on purpose: one
 * bay-wide toggle, no per-drill areas, no pattern learning. A.52 proved what
 * happens when the idle layer gets a configuration screen, and "which cells
 * should the machines prefer" is exactly the shape of question that turns into
 * one. `huntOres` defaults ON, so an idle player harvests pockets without ever
 * opening the panel (pillar 1); turning it off is the interesting choice,
 * because a pocket is richer by hand.
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
  // The bay-wide switch is off AND nothing has been routed at ore explicitly:
  // then nobody is hunting and there is nothing to build a list for.
  if (state.drills.huntOres === false
    && !state.drills.units.some((u) => u.priority === 'ores' || u.priority === 'oresFirst' || u.priority === 'both')) {
    return null;
  }

  // BUILT ONCE FOR THE WHOLE BAY, not once per drill, and this is a real cost
  // rather than tidiness: the per-drill version scanned the face for every
  // machine on every 100ms step — twelve drills over a two-hour catch-up is
  // thirty-one million iterations, and it doubled the cost of a warp. Almost
  // all of that work found nothing, because on a typical step every pocket
  // worth taking is already claimed by somebody.
  const claimedBy = new Set<number>();
  for (const u of state.drills.units) if (u.oreCell !== undefined) claimedBy.add(u.oreCell);

  let out: number[] | null = null;
  const base = cellCap(state, mods);
  for (let i = 0; i < ore.length; i++) {
    const id = ore[i];
    if (!id || claimedBy.has(i) || skip(i)) continue;
    // A MACHINE WILL NOT SPEND SIX SECONDS ON AN EMPTY POCKET. Without this
    // the sim's ore-heavy arm ran 0.82x of the control: pockets spawned faster
    // than they filled, drills opened them barely started, and buying the
    // spawn-rate upgrade made income go DOWN — a trap sold as an improvement.
    // It also self-limits: crank spawning as hard as you like and the bay
    // simply waits for them to be worth the trip.
    if ((state.face.cells[i] ?? 0) < base * oreRichness(id) * ORE_WORTH_OPENING) continue;
    (out ??= []).push(i);
  }
  // Fullest first, so the best pocket goes to the first free machine.
  out?.sort((a, b) => (state.face.cells[b] ?? 0) - (state.face.cells[a] ?? 0));
  return out;
}

export function tickDrills(state: GameState, mods: ModifierCache, ctx: EngineCtx, dt: number): void {
  if (!state.drills.bayBuilt || state.drills.units.length === 0) return;
  // A drill never works a cultivated (vined) cell — the Growth automation law
  // leaves those for their own harvest.
  const skip = (i: number): boolean => (state.growth.stage[i] ?? 0) > 0;
  const shellId = currentShell(state).id;
  // ORE BOOKKEEPING, once for the whole bay rather than once per drill. The
  // claim set is mutated as drills take pockets, so two never crowd one.
  // Every pocket free and worth taking, in one pass for the whole bay. `null`
  // when there is nothing on offer, which is the overwhelmingly common case and
  // costs one array read to establish.
  const offered = openPockets(state, mods, skip);
  const capNow = cellCap(state, mods);
  // THE BAY'S RESIDUE FIT, ONCE. `pickTarget` weighs every cell by how soft it
  // is, so resolving this inside the scan would re-walk the whole bay for every
  // square of the face on every strike of every drill — which is exactly how
  // A.56's first cut pushed a two-hour warp past a five-second test timeout.
  const resFit = bayFit(state, 'residue');

  // WHO GETS FIRST REFUSAL ON A POCKET (A.56). Ore-routed machines are served
  // before the general pool, which is the whole substance of the priority
  // setting: 'ores' and 'oresFirst' drills pick from a full list, everyone else
  // takes what is left. Index order inside a band, so it stays deterministic.
  // Only SORT when somebody actually asked to be served first. A bay with no
  // routing set — every bay, until a player opens the menu — keeps plain index
  // order and allocates one array instead of two plus a comparator pass.
  const routed = state.drills.units.some((u) => u.priority !== undefined);
  const claimOrder = state.drills.units.map((_, i) => i);
  if (routed) claimOrder.sort((a, b) => claimRank(state, a) - claimRank(state, b));

  // GANGLOCK is a bay-level agreement, so it needs one cell decided for the
  // whole tick rather than per machine. The first bound drill to pick chooses;
  // the rest tether onto it.
  let bindTarget = -1;

  for (const d of claimOrder) {
    const drill = state.drills.units[d]!;
    // ONE ALLOY PER DRILL (A.54), now up to three on a prize chassis (A.56).
    // Read here rather than once for the bay: the machine next to this one may
    // be running something else entirely, which is the whole decision.
    // A BARE MACHINE SKIPS ALL ELEVEN LOOKUPS. Most drills in most saves carry
    // nothing, and eleven map probes per drill per tick across a multi-hour
    // warp is real time spent proving that.
    const armed = (drill.fits?.length ?? 0) > 0;
    const residueFit = armed ? drillCarries(drill, 'residue') : null;
    const attractFit = armed ? drillCarries(drill, 'attract') : null;
    const kindleFit = armed ? drillCarries(drill, 'kindle') : null;
    const arcFit = armed ? drillCarries(drill, 'arc') : null;
    // The rest of this machine's abilities, read ONCE rather than once per
    // strike: a drill carries at most three and they cannot change mid-tick.
    const lens = armed ? drillCarries(drill, 'lens') : null;
    const bind = armed ? drillCarries(drill, 'bind') : null;
    const creep = armed ? drillCarries(drill, 'creep') : null;
    const unmake = armed ? drillCarries(drill, 'unmake') : null;
    const recur = armed ? drillCarries(drill, 'recur') : null;
    const bloom = armed ? drillCarries(drill, 'bloom') : null;
    const zone = zoneSet(drill);
    const priority = drillPriority(state, drill);

    // --- THE POCKET JOB -----------------------------------------------------
    // A drill on an ore is doing NOTHING ELSE for the duration, and that is the
    // cost the player is weighing when they leave one to the machines. It is
    // also why this sits before the strike loop rather than inside it: the
    // drill's strike timer does not advance while it is digging.
    //
    // ONCE IT STARTS, IT FINISHES. A drill releases a pocket for exactly one
    // reason — the pocket is not there any more, because the player opened it
    // by hand first. Nothing else may interrupt a dig: half-mined ore left
    // behind because a machine changed its mind is the worst kind of waste,
    // since the time was already spent and bought nothing.
    //
    // It used to release on `skip(cell)` too, so a vine spreading onto the cell
    // threw the work away. That is fixed where it belongs instead (growth no
    // longer grows on a pocket), which leaves this rule with one clause and no
    // room for a second to creep back in.
    //
    // CLAIMING AND DIGGING HAPPEN IN THE SAME TICK on purpose — an earlier cut
    // spent the whole tick claiming, which is invisible at the engine's real
    // step size and very visible in one big catch-up tick, where a drill would
    // claim a pocket and then never touch it.
    if (drill.oreCell !== undefined && !oreAt(state, drill.oreCell)) {
      delete drill.oreCell;
      delete drill.oreProgress;
    }
    if (drill.oreCell === undefined && offered && offered.length > 0 && priority !== 'rock') {
      // ROUTING (A.56): a zoned drill takes the best pocket INSIDE its zone and
      // leaves the rest on the list for somebody who can reach them. The
      // unzoned case is still `shift()` — the fullest, first, as it always was.
      const at = zone ? offered.findIndex((c) => zone.has(c)) : 0;
      if (at >= 0) {
        const claim = offered.splice(at, 1)[0]!; // off the list, so nobody doubles up
        drill.oreCell = claim;
        drill.oreProgress = 0;
        drill.lastCell = claim; // the face draws the arm reaching for it
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

    // ORES ONLY: this machine does not chip rock. It waits for a pocket, which
    // is a real cost the player chose — and it is per-drill, so a bay never
    // stalls as a whole and pillar 1 never sees it.
    if (priority === 'ores') continue;

    drill.timer += dt;
    const interval = drillInterval(state, mods, drill);
    // A drill strikes at most a few times per tick even after catch-up; the
    // cells it would have hit are regen-limited anyway.
    let strikes = 0;
    while (drill.timer >= interval && strikes < 4) {
      drill.timer -= interval;
      strikes++;

      // ── TEMPO: LONGLENS ─────────────────────────────────────────────────
      // It holds its stroke and spends the lot at once. Implemented as skipped
      // strikes that bank into `hold`, so the ceiling argument is unchanged:
      // one bite of `hold × gain` power is still `min(power, cellCharge)`, and
      // on a cell that only regenerated a little it takes only what is there.
      // That is the trade — a big bite wastes more of it if you mistime the
      // face, which is why the gain is 1.35 and not 4.
      let lensMult = 1;
      if (lens) {
        const hold = Math.max(2, Math.round(lens.p['hold'] ?? 4));
        drill.hold = (drill.hold ?? 0) + 1;
        if (drill.hold < hold) { ctx.emit({ type: 'drillHold', drill: d, at: drill.hold / hold }); continue; }
        drill.hold = 0;
        lensMult = hold * (lens.p['gain'] ?? 1.35);
      }

      // ── TARGETING: GANGLOCK and CREEPVINE ───────────────────────────────
      let target: number;
      let creepMult = 1;
      if (bind && bindTarget >= 0 && (!zone || zone.has(bindTarget))) {
        target = bindTarget;
      } else if (creep) {
        const step = creepTarget(state, drill, skip, zone, resFit);
        target = step.cell;
        drill.creepRun = step.ran ? Math.min(24, (drill.creepRun ?? 0) + 1) : 0;
        creepMult = Math.min(
          creep.p['max'] ?? 2.4,
          1 + (creep.p['step'] ?? 0.22) * (drill.creepRun ?? 0),
        );
      } else {
        target = pickTarget(state, skip, zone, resFit);
      }
      if (target < 0) continue; // every cell is vined or out of zone — it idles
      if (bind && bindTarget < 0) bindTarget = target;

      // THE SECOND BITE (A.48 relic power) is the one rule change on this path.
      // It is deliberately NOT the 'Two Hands' Axiom in cheaper clothes: the
      // Axiom gives a second cell at FULL power, this splits the stroke and
      // gives two at 65% each. Net 1.3x on a full face, worse than the Axiom,
      // and worth MORE than the Axiom on a face where every cell is part-full,
      // because the ceiling is regen and two shallow bites waste less of it.
      // Still bounded by regen either way — pillar 2 is untouched.
      const secondBite = relicRule(state, 'twinBite');
      // UNMAKING takes the whole cell. `strike` is `min(power, cellCharge)`, so
      // an absurd power IS "all of it" and stays inside the ceiling by the same
      // arithmetic every other bite uses — the cell only ever held what regen
      // put in it. What it costs is the rest afterwards, applied below.
      const power = drillPower(state, mods, drill) * (secondBite ? 0.65 : 1)
        * lensMult * creepMult * (unmake ? 1e6 : 1);
      // TWO HANDS (law): a stroke works this many cells. The second cell is
      // the next-fullest bare one — same power each, still regen-bound.
      const handCells: number[] = [target];
      const hands = Math.max(lawNum(state, 'drillStrokes'), secondBite ? 2 : 1);
      if (hands > 1) {
        let second = -1;
        let secondCharge = 0;
        for (let i = 0; i < state.face.cells.length; i++) {
          if (i === target || skip(i)) continue;
          if (zone && !zone.has(i)) continue;
          if (state.face.cells[i]! > secondCharge) {
            secondCharge = state.face.cells[i]!;
            second = i;
          }
        }
        if (second >= 0) handCells.push(second);
      }

      // ── TEMPO: RECURRENCE ───────────────────────────────────────────────
      // The whole stroke, again, immediately, sometimes several times. Each
      // repeat is a fresh `min(power, cellCharge)` on a cell it has just
      // emptied, so it is self-limiting on a poor face and spectacular on a
      // full one — which is exactly what an Aleph ability should feel like.
      let repeats = 0;
      const recurCap = recur ? Math.round(recur.p['cap'] ?? 3) : 0;
      const recurChance = recur ? (recur.p['chance'] ?? 0.38) : 0;

      do {
        for (const hit of handCells) {
          // THE SET (alloy ability): rock a drill has recently worked stays
          // soft, so the next bite takes MORE OF THE CHARGE THAT IS THERE. A
          // bigger bite, never a bigger yield — the cell still only holds what
          // regen put in it, which is why this cannot lift the ceiling.
          strike(state, mods, ctx, drill, hit, power * residueBite(state, hit, resFit), d);
          // The MARKS are left by this drill's own alloys, but they are left on
          // the ROCK — the drill that comes to this cell next gets the benefit
          // whatever it is carrying. That is what makes a mixed bay worth
          // assembling instead of twenty-four of the same thing.
          markResidue(state, hit, residueFit);
          markRichness(state, hit, attractFit);
          markBurn(state, hit, kindleFit);
        }

        // THE ARC (A.53). Left exactly as it was, including its full-weight
        // drop rolls: it is the one ability whose income was actually measured
        // (1.74x, `sim-out/a53-alloy-rtp.md`) and re-weighting it here would
        // quietly invalidate that reading.
        if (arcFit) {
          const jumped = arcTargets(state, target, skip, arcFit);
          const share = arcFit.p['share'] ?? ARC_SHARE;
          for (const j of jumped) strike(state, mods, ctx, drill, j, power * share, d);
          if (jumped.length > 0) ctx.emit({ type: 'drillArc', from: target, to: jumped });
        }

        // ── REACH (A.56): halfmark, prismcut, slagburst, throughline,
        // everywhen. All five in one call, all bounded by the charge that is
        // already in the cells they touch.
        //
        // DROP WEIGHT SCALES WITH THE SHARE, and that is not tidiness: these
        // reach far more cells per stroke than the arc does, and `rollForDrop`
        // rolls fragments and relics on the WEIGHT regardless of charge. An
        // unscaled weight would turn Everywhen into a twelve-times material
        // faucet and break pillar 1's drop-economy bound while pillar 2 read
        // perfectly clean — the exact failure A.55 caught with guaranteed ore
        // rolls.
        const reached = reachTargets(state, capNow, drill, target, skip);
        if (reached.length > 0) {
          for (const r of reached) {
            strike(state, mods, ctx, drill, r.cell, power * r.share, d, r.share);
          }
          ctx.emit({ type: 'drillReach', from: target, to: reached.map((r) => r.cell) });
        }

        repeats++;
      } while (recur && repeats <= recurCap && Math.random() < recurChance);

      // ── SEEDSET: something takes in the hole it leaves ───────────────────
      if (bloom) {
        const every = Math.max(4, Math.round(bloom.p['every'] ?? 24));
        drill.bloom = (drill.bloom ?? 0) + 1;
        if (drill.bloom >= every) {
          drill.bloom = 0;
          plantOre(state, mods, ctx, target);
        }
      }

      // ── UNMAKING: it took the lot, and now it has to stand there ─────────
      if (unmake) drill.timer -= Math.max(0.5, unmake.p['rest'] ?? 4);

      // A stroke teaches the drill this shell a little.
      logImplementUse(drill, shellId, 1);
    }
    // Don't bank strikes — but an Unmaking drill's negative timer IS its rest,
    // so the clamp must not eat it.
    if (drill.timer > interval) drill.timer = interval;
  }
}

/** Ore-routed machines pick from a full list; everyone else takes what is left. */
function claimRank(state: GameState, i: number): number {
  const p = drillPriority(state, state.drills.units[i]!);
  return p === 'ores' ? 0 : p === 'oresFirst' ? 1 : 2;
}

/**
 * One drill hit on one cell: harvest, byproduct, XP, drop and encounter rolls.
 *
 * `weightShare` scales the DROP weight for a reach hit (A.56). `rollForDrop`
 * rolls fragments and relics on the weight regardless of how much charge came
 * out, so an ability that touches twelve cells per stroke would multiply the
 * material economy twelvefold on a term pillar 2 cannot see. The primary bite
 * and the arc pass 1 — the arc because its balance was measured at full weight
 * and re-weighting it now would silently void that reading.
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
  // Some shells' drills scrape a byproduct (Ferrite: Scale).
  const by = currentShell(state).drillByproduct;
  if (by) addCurrency(state, by.currencyId, D(take * by.perCharge));
  grantXP(state, mods, ctx, D(0.12 * (1 + 0.08 * state.depth) * (take / 8)));
  rollForDrop(state, mods, ctx, take, DRILL_DROP_FACTOR * weightShare, drill.name, hit);
  rollForEncounter(state, ctx, take, ENCOUNTER_DRILL_FACTOR * weightShare);
  ctx.emit({ type: 'drillStrike', drill: d, cell: hit, dust });
}

/** Steady-state charge/sec the bay can consume — used by the offline calc. */
export function drillThroughput(state: GameState, mods: ModifierCache): number {
  let total = 0;
  for (const drill of state.drills.units) {
    total += drillPower(state, mods, drill) / drillInterval(state, mods, drill);
  }
  return total * lawNum(state, 'drillStrokes');
}

export { neighbors };
