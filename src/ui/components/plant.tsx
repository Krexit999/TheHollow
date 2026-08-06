/**
 * THE PLANT — Flow, Surge, and the machines drawing on them (§3).
 *
 * Plain panels. The whole point of splitting Draw in two is that a player can
 * SEE why a machine is slow, so the two numbers are shown as what they are: a
 * rate against a demand, and a bank against a cost. A single "power" bar would
 * put the design back where it started.
 */
import { useEffect } from 'react';
import { useGame, dispatch } from '../store';
import {
  MACHINE_DEMAND, TIER_CAPABILITY, demandOf, flowCap, flowDemand, flowSatisfaction,
  surgeCap, surgeRegen, tierOf, MAX_MACHINE_TIER,
} from '../../engine/systems/plant';
import { shellPlantRead } from '../../engine/systems/shellPlants';
import { boilerRead, boilerShell } from '../../engine/systems/boiler';
import {
  CRUSH_BATCH, FINENESS, LEACH_BATCH, LEACH_PAYS, crushPreview, crushable, finenessOf,
  leachBlocker, nextCrusherTierCost,
} from '../../engine/systems/crusher';
import { materialDef, BAND_LABELS } from '../../engine/materials';
import {
  DRAG_SPEED, RECAST_PART_COST, bandOfMachine, cascadeChain, cascadedFrom, conditionLine,
  conditionedMachines, litBands, leakedHeat, leakingStations,
  observePlant, recastBlocker, ruleFor,
} from '../../engine/systems/condition';
import {
  breakDef, breakLine, brokenAs, isBroken, recipeHidden, ripeLine, ripeness,
  witnessMachineBlocker,
} from '../../engine/systems/breaks';
import {
  SOLVENT_COST, TIER_CAPABILITY_WASHER, WASH_BATCH, nextWasherTierCost, solventOf, washBlocker,
  washRows,
} from '../../engine/systems/washer';
import { currencyDef } from '../../engine';
import { WAVELENGTH_NAMES } from '../../engine/systems/refraction';
import { convCurrencyId, currentShell } from '../../engine/shells';
import type { GameState } from '../../engine';

/**
 * EVERY MACHINE THE PLANT KNOWS, NAMED.
 *
 * This held FOUR names while `MACHINE_DEMAND` grew to twenty-seven, so the
 * demand profile rendered twenty-three rows with a BLANK label and two numbers
 * beside them — a list of anonymous draws. Caught in a driven SCREENSHOT, not
 * by the height check, because the panel was never too tall; it was too empty.
 * The fallback turns an id into words, so the next machine added to the demand
 * table is a readable row rather than a blank one.
 */
const MACHINE_NAME: Record<string, string> = {
  kiln: 'The Kiln', crusher: 'The Crusher', refinery: 'The Refinery',
  assayBench: 'The Assay Bench', sieve: 'The Sieve', breaker: 'The Breaker',
  crucible: 'The Crucible', line: 'The Line', balance: 'The Balance',
  still: 'The Still', infuser: 'The Infuser', press: 'The Press',
  condenser: 'The Condenser', witness: 'The Witness', prism: 'The Prism',
  pattern: 'The Pattern Bench', centrifuge: 'The Centrifuge', washer: 'The Washer',
  governor: 'The Governor', lapidary: 'The Lapidary', quench: 'The Quench Tank',
  boiler: 'The Boiler', vents: 'The Vent Array', retort: 'The Retort',
  cultivar: 'The Cultivar Bench', coil: 'The Coil', frame: 'The Frame',
  axiomEngine: 'The Axiom Engine', seating: 'The Seating',
};

const machineName = (id: string): string =>
  MACHINE_NAME[id] ?? id.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

/**
 * The same name with its article in the middle of a sentence.
 *
 * A.106 found "at the The Kiln" and fixed it by dropping the "the", which left
 * "It started at The Boiler" — a capital in the middle of a sentence, found the
 * same way, in a screenshot, after every automated check on this panel had
 * passed again. The name owns its article; only its CASE depends on where it
 * sits, so that is the only thing this changes.
 */
const midSentence = (id: string): string => machineName(id).replace(/^The /, 'the ');

function Bar({ pct, tone }: { pct: number; tone: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-cave-800">
      <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: tone }} />
    </div>
  );
}

/**
 * THE TWO NUMBERS. Flow reads as a rate against what the running machines want;
 * Surge reads as a bank against what the next batch costs. A machine short of
 * Flow is SLOW and says so; a machine short of Surge is WAITING and says that
 * instead — the asymmetry is the feature, so the panel states it in two
 * different vocabularies on purpose.
 */
export function PlantPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;
  /**
   * §3.2 — THE CARD NAMES THE SHELL'S OWN PLANT (A.96). It used to say THE
   * HEARTH everywhere and return null without a Kiln, which was right while all
   * seven shells ran the Hearth and is wrong now: a Verdance player has never
   * needed a Kiln to have a Bloom.
   */
  const own = shellPlantRead(st);
  const boiler = boilerShell(st) ? boilerRead(st) : null;
  if (!own && !boiler && !st.kiln.built) return null;

  const title = own ? own.name : boiler ? 'The Boiler' : 'The Hearth';
  const shape = own
    ? own.line
    : boiler
      ? (boiler.built ? `heat ${boiler.heat.toFixed(0)}° · risking ${boiler.risked.toFixed(0)}°` : 'No Boiler. Nothing here makes power.')
      : 'pure Flow, small';

  const cap = flowCap(st);
  const want = flowDemand(st);
  const surge = st.plant?.surge ?? 0;
  const sCap = surgeCap(st);

  return (
    <div className="panel p-3" data-testid="plant-card" data-plant={own?.id ?? (boiler ? 'boiler' : 'hearth')}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-cave-400">{title}</span>
        <span className="truncate text-[10px] text-cave-500">{shape}</span>
      </div>

      <div className="space-y-2">
        <div>
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="text-[#9ad4e8]">Flow</span>
            <span className="tnum text-cave-400">
              {cap.toFixed(1)}/s <span className="text-cave-600">of</span> {want.toFixed(1)} wanted
            </span>
          </div>
          <Bar pct={want > 0 ? (cap / want) * 100 : 100} tone="#9ad4e8" />
          <div className="mt-0.5 text-[9px] leading-snug text-cave-500">
            Sustained. Machines short of Flow run SLOW — they never stop.
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="text-[#e0b25a]">Surge</span>
            <span className="tnum text-cave-400">
              {surge.toFixed(0)} <span className="text-cave-600">/</span> {sCap.toFixed(0)}
              <span className="text-cave-600"> · +{surgeRegen(st).toFixed(1)}/s</span>
            </span>
          </div>
          <Bar pct={sCap > 0 ? (surge / sCap) * 100 : 0} tone="#e0b25a" />
          <div className="mt-0.5 text-[9px] leading-snug text-cave-500">
            A bank. Machines short of Surge WAIT — they do not run slow.
          </div>
        </div>
      </div>

      <div className="mt-2 border-t border-cave-800 pt-1.5">
        <div className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-cave-500">Demand profile</div>
        {Object.keys(MACHINE_DEMAND).map((id) => {
          const d = demandOf(id);
          const tier = tierOf(st, id);
          const built = id === 'kiln' ? st.kiln.built : tier > 0;
          const sat = flowSatisfaction(st, id);
          const waiting = d.surge > 0 && surge < d.surge;
          /**
           * §55.5 — THE SILENCE TOOK IT (A.107). The machine is still there,
           * still named, still running at exactly the rate it was running at.
           * What is gone is the WORKING: what it draws and how well it is being
           * served. LAW 3 in its purest form, pointed at the player's own plant
           * — the destination is visible and the recipe is not — and it costs
           * nothing in yield, which is the only reason a §55 row is allowed to
           * take something away at all.
           */
          const hidden = recipeHidden(st, id);
          return (
            <div key={id} className="flex items-baseline gap-2 py-[2px] text-[10px]" data-testid={`plant-${id}`}>
              <span className={`w-[68px] shrink-0 truncate ${built ? 'text-cave-200' : 'text-cave-600'}`}>
                {machineName(id)}
              </span>
              <span className="w-[74px] shrink-0 text-cave-500">
                {hidden ? <span className="text-[#8a7fb0]" data-testid={`forgot-${id}`}>it will not say</span> : (<>
                  {d.flow > 0 && <span className="text-[#9ad4e8]">{d.flow}/s</span>}
                  {d.flow > 0 && d.surge > 0 && <span className="text-cave-700"> + </span>}
                  {d.surge > 0 && <span className="text-[#e0b25a]">{d.surge}</span>}
                </>)}
              </span>
              <span className="min-w-0 flex-1 truncate text-right text-cave-500">
                {hidden ? <span className="text-[#8a7fb0]">—</span>
                  : !built ? 'not built'
                    : waiting ? <span className="text-[#e0b25a]">waiting on Surge</span>
                      : d.flow > 0 && sat < 0.999 ? <span className="text-[#e0885a]">{Math.round(sat * 100)}% speed</span>
                        : 'running'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * THE CONDITION — E2 (§7.2), what the world has done to each machine.
 *
 * Plain rows under the demand profile, in the same panel and not in a new one:
 * a condition is a fact ABOUT a machine, so it belongs beside the machine's
 * other facts. LAW 3 — a machine with nothing wrong with it says nothing, and
 * a shell with no rule shows no block at all.
 *
 * HOLLOW'S RULE IS SETTLED BY LOOKING, and this is where the looking happens.
 * `observePlant` runs on mount rather than behind a button, because attention
 * IS the mechanic: an UNDECIDED machine is one nobody has been to see, and
 * making a present player press "settle" would turn a rule about absence into
 * a chore for someone who is not absent.
 */
export function ConditionPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  useEffect(() => {
    if (state) observePlant(state as GameState);
  });
  if (!state) return null;
  const st = state as GameState;
  if (!st.kiln.built) return null;

  const rule = ruleFor(currentShell(st).id);
  const machines = conditionedMachines()
    .filter((id) => (id === 'kiln' ? st.kiln.built : tierOf(st, id) > 0));
  /**
   * A CASCADE OUTLIVES THE SHELL THAT STARTED IT, so the panel cannot be gated
   * on there being a rule here. A player who carries a dragged plant into a
   * shell with no rule would otherwise watch their Kiln run at 60% with no
   * panel anywhere that says why — which is the exact "random debuff" §55's
   * item 7 forbids.
   */
  const anyDrag = machines.some((id) => cascadedFrom(st, id) !== null);
  if (!rule && !anyDrag) return null;
  const glassmere = rule?.id === 'unlit';
  const lit = litBands(st);
  if (machines.length === 0) return null;

  return (
    <div className="panel mt-2 p-3" data-testid="condition-panel">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-cave-400">
          What the shell is doing to it
        </span>
        <span className="text-[10px] text-cave-500">{rule?.label ?? '—'}</span>
      </div>
      <p className="mb-1.5 text-[9px] leading-snug text-cave-500">
        {rule?.effect ?? 'Nothing, in this shell. What is left came from somewhere else.'}
      </p>

      {/**
        * THE FLOOD LEAK, SAID OUT LOUD (§36.1, A.99). A drowned station makes
        * the band it sits in read hotter than the shaft is, and a player whose
        * plant is suddenly baking at heat 40 deserves to be told why rather
        * than left to infer a corridor. LAW 3 — show the destination.
        */}
      {leakingStations(st).length > 0 && (
        <div
          className="mb-1.5 rounded border border-[#7a4426]/60 bg-[#1c1210]/60 px-1.5 py-1 text-[9px] leading-snug text-[#c98a5e]"
          data-testid="flood-leak-line"
        >
          {leakingStations(st).length} drowned station
          {leakingStations(st).length === 1 ? '' : 's'} in this band.
          The plant works as though the shaft were at {Math.round(leakedHeat(st))}, not{' '}
          {Math.round(st.pressure?.heat ?? 0)}.
        </div>
      )}

      <div className="space-y-1">
        {machines.map((id) => {
          const line = conditionLine(st, id);
          const blocked = recastBlocker(st, id);
          const band = bandOfMachine(st, id);
          return (
            <div key={id} className="rounded border border-cave-800 px-1.5 py-1" data-testid={`condition-${id}`}>
              <div className="flex items-baseline gap-2">
                <span className="w-[68px] shrink-0 truncate text-[10px] text-cave-200">{MACHINE_NAME[id] ?? id}</span>
                <span className="min-w-0 flex-1 truncate text-[10px] text-cave-500" data-testid={`condition-line-${id}`}>
                  {line ?? 'in good order'}
                </span>
              </div>
              {/*
                GLASSMERE ONLY: which wavelength this machine sits in. It is the
                one condition a player can aim, so it is the one that gets a
                control — half speed to keep a band is a trade worth offering.
              */}
              {glassmere && (
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="w-[68px] shrink-0 text-[9px] text-cave-600">band</span>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-0.5">
                    {WAVELENGTH_NAMES.map((name, i) => (
                      <button
                        key={name}
                        className={`btn px-1 py-[1px] text-[9px] ${i === band ? 'border-[#c9a86a]/70 text-cave-100' : 'text-cave-500'}`}
                        data-testid={`condition-band-${id}-${i}`}
                        title={lit.has(i) ? 'the beam is carrying this' : 'unlit — half speed, band kept'}
                        onClick={() => dispatch({ type: 'setMachineBand', machineId: id, band: i })}
                      >
                        {name}{lit.has(i) ? '' : ' ·'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {line && (
                <button
                  className="btn mt-1 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
                  disabled={blocked !== null}
                  title={blocked ?? undefined}
                  data-testid={`recast-${id}`}
                  onClick={() => dispatch({ type: 'recastMachine', machineId: id })}
                >
                  Re-cast it — {RECAST_PART_COST} cast parts
                </button>
              )}
              {line && blocked && (
                <div className="mt-0.5 text-[9px] leading-snug text-cave-600">{blocked}</div>
              )}
              {/**
                * THE CASCADE, TRACED (§55, item 7). Not a sentence saying a
                * cascade happened — the actual links, in the order they went,
                * ending at this machine. The player reads left to right and the
                * leftmost name is the one to go and fix; fixing it lifts the
                * rest one machine per tick, in the same order, which is what
                * makes the trace something they can check rather than trust.
                *
                * LAW 3: it names the destination. There is no re-cast button
                * here on purpose — this machine is not the problem, and
                * offering to re-cast it would sell the player a fix for the
                * wrong machine.
                */}
              {/*
                §55 (A.107) — WHAT ACTUALLY BROKE, and what to do about it.
                Above the drag block on purpose: this machine is the FIRST
                failure, and the drag rows below it are its consequences. A
                player reading top to bottom reads the cause before the effects.
              */}
              {isBroken(st, id) && (
                <div
                  className="mt-1 rounded border border-[#7a4426]/70 bg-[#1c1210]/70 px-1.5 py-1"
                  data-testid={`broke-${id}`}
                >
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-[#c98a5e]">
                    {breakDef(brokenAs(st, id)!)?.name}
                  </div>
                  <div className="mt-0.5 text-[9px] leading-snug text-cave-300">{breakLine(st, id)}</div>
                  {brokenAs(st, id) === 'silence' && (
                    <button
                      className="btn mt-1 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
                      disabled={witnessMachineBlocker(st, id) !== null}
                      title={witnessMachineBlocker(st, id) ?? undefined}
                      data-testid={`witness-${id}`}
                      onClick={() => dispatch({ type: 'witnessMachine', machineId: id })}
                    >
                      Witness it
                    </button>
                  )}
                  {brokenAs(st, id) === 'silence' && witnessMachineBlocker(st, id) && (
                    <div className="mt-0.5 text-[9px] leading-snug text-cave-500">
                      {witnessMachineBlocker(st, id)}
                    </div>
                  )}
                  {/*
                    §55.4's recovery, and the only one in the table that PAYS.
                    No blocker line under it the way the Witness has one: the
                    harvest is free and cannot be refused on a machine the green
                    took, so a disabled-reason row would never have anything to
                    say. LAW 3 — this names the destination (the strain goes to
                    the Cultivar Codex) and not the working.
                  */}
                  {brokenAs(st, id) === 'overgrowth' && (
                    <button
                      className="btn mt-1 w-full px-1.5 py-1 text-[10px]"
                      data-testid={`harvest-${id}`}
                      onClick={() => dispatch({ type: 'harvestMachine', machineId: id })}
                    >
                      Harvest it
                    </button>
                  )}
                </div>
              )}
              {/*
                ...AND THE WARNING. §55's recoveries are "interesting, not
                waiting", and the interesting version of a boiler explosion is
                the one you watched coming and chose to ride. Deliberately the
                opposite call from §53's thresholds, which are never announced:
                a world changing underneath you is not the same thing as a
                machine you are over-driving on purpose.
              */}
              {!isBroken(st, id) && ripeness(st, id) > 0 && (
                <div
                  className="mt-1 rounded border border-[#7a6a26]/60 bg-[#1a1710]/60 px-1.5 py-1 text-[9px] leading-snug text-[#c9b86a]"
                  data-testid={`ripe-${id}`}
                >
                  {ripeLine(st, id)}
                </div>
              )}
              {cascadedFrom(st, id) && (
                <div
                  className="mt-1 rounded border border-[#6a5030]/60 bg-[#17140e]/60 px-1.5 py-1"
                  data-testid={`drag-${id}`}
                >
                  <div className="text-[9px] leading-snug text-[#c9a86a]">
                    Dragged — {Math.round((1 - DRAG_SPEED) * 100)}% slower because something
                    beside it is failing.
                  </div>
                  <div className="mt-0.5 text-[9px] leading-snug text-cave-500">
                    {cascadeChain(st, id).map((m, i, all) => (
                      <span key={m}>
                        {i > 0 && <span className="text-cave-700"> → </span>}
                        <span className={i === 0 ? 'text-cave-200' : undefined}>
                          {i === all.length - 1 ? 'this one' : machineName(m)}
                        </span>
                      </span>
                    ))}
                  </div>
                  {/*
                    `machineName` already carries the article — "The Kiln", not
                    "Kiln" — so "at the {name}" printed "at the The Kiln" (A.106),
                    and dropping the "the" left "at The Kiln" (A.107). It is
                    `midSentence` for the same reason both times: the name owns
                    its article and the sentence owns its case.
                  */}
                  <div className="mt-0.5 text-[9px] leading-snug text-cave-400">
                    It started at {midSentence(cascadeChain(st, id)[0]!)}. Put that right and this
                    comes back.
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * THE CRUSHER — built from cast parts, fired by hand, paid for in Surge.
 *
 * Its tier is printed as a CAPABILITY (§15.4) rather than a number, because
 * that is what a tier is: tier II retains the input's purity band, and a player
 * looking at "II" learns nothing without being told so.
 */
export function CrusherPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;
  const tier = tierOf(st, 'crusher');
  const rack = st.casting.rack?.length ?? 0;
  const cost = nextCrusherTierCost(st);
  const surge = st.plant?.surge ?? 0;
  const need = demandOf('crusher').surge;
  const stock = crushable(st).slice(0, 4);

  return (
    <div className="panel p-3">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-cave-400">The Crusher</span>
        <span className="text-[10px] text-[#e0b25a]">pure Surge</span>
      </div>
      <div className="text-[10px] leading-snug text-cave-500">
        {tier > 0
          ? <>Tier {'I'.repeat(tier)} — {TIER_CAPABILITY[tier]}</>
          : 'Not built. It does nothing at all, and then it does everything at once.'}
      </div>

      {/*
        THE MILL and THE LEACH VAT — §13's two folded processing steps (A.96).
        Rows inside this panel, not construction events (§37): no wreck, no
        tier ladder, no cast parts.
      */}
      {tier > 0 && (
        <div className="mt-1.5 border-t border-cave-800 pt-1.5" data-testid="mill-row">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] uppercase tracking-widest text-cave-500">Fineness</span>
            <div className="flex gap-1">
              {FINENESS.map((f) => (
                <button
                  key={f.id}
                  className={`btn px-1.5 py-0.5 text-[10px] ${finenessOf(st) === f.id ? 'btn-warm' : ''}`}
                  title={f.does}
                  onClick={() => dispatch({ type: 'setFineness', how: f.id })}
                  data-testid={`fineness-${f.id}`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-0.5 text-[9px] leading-snug text-cave-500">
            {FINENESS.find((f) => f.id === finenessOf(st))!.does}
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2" data-testid="leach-row">
            <span className="min-w-0 flex-1 truncate text-[9px] text-cave-500">
              Reject row · {LEACH_BATCH} tailings → {LEACH_PAYS} {currencyDef(convCurrencyId(st)).name}
            </span>
            <button
              className="btn shrink-0 px-1.5 py-0.5 text-[10px]"
              disabled={leachBlocker(st) !== null}
              title={leachBlocker(st) ?? 'Leach the tailings down'}
              onClick={() => dispatch({ type: 'leach' })}
              data-testid="leach-do"
            >
              Leach
            </button>
          </div>
        </div>
      )}

      {cost !== null && (
        <button
          className="btn mt-1.5 w-full py-1 text-[11px]"
          disabled={rack < cost}
          data-testid="build-crusher"
          onClick={() => dispatch({ type: 'buildCrusher' })}
        >
          {tier === 0 ? 'Build' : `Tier ${'I'.repeat(tier + 1)}`} · {cost} cast parts
          {rack < cost && <span className="text-cave-500"> (rack has {rack})</span>}
        </button>
      )}
      {cost === null && (
        <div className="mt-1.5 text-[10px] text-cave-500">At its last tier ({MAX_MACHINE_TIER}).</div>
      )}

      {tier > 0 && (
        <div className="mt-2 border-t border-cave-800 pt-1.5">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-widest text-cave-500">
              Batch · {CRUSH_BATCH} stone
            </span>
            <span className={`tnum text-[10px] ${surge >= need ? 'text-[#e0b25a]' : 'text-cave-600'}`}>
              {need} Surge
            </span>
          </div>
          {stock.length === 0 && (
            <div className="text-[10px] text-cave-600">Nothing held in fours yet.</div>
          )}
          {stock.map((s) => {
            const p = crushPreview(st, s.materialId, s.band);
            const ready = surge >= need;
            return (
              <button
                key={`${s.materialId}-${s.band}`}
                className="mt-1 flex w-full items-baseline gap-2 rounded border border-cave-800 px-1.5 py-1 text-[10px] hover:bg-cave-800 disabled:opacity-50"
                disabled={!ready}
                data-testid={`crush-${s.materialId}`}
                onClick={() => dispatch({ type: 'crush', materialId: s.materialId, band: s.band })}
              >
                <span className="min-w-0 flex-1 truncate text-left text-cave-200">
                  {materialDef(s.materialId).name}
                </span>
                <span className="shrink-0 text-cave-500">{BAND_LABELS[s.band]}</span>
                <span className="shrink-0 text-cave-600">→</span>
                <span className={`shrink-0 ${p && p.outBand === s.band ? 'text-[#a8d8a0]' : 'text-[#e0885a]'}`}>
                  {p ? BAND_LABELS[p.outBand] : '—'}
                </span>
              </button>
            );
          })}
          {!(surge >= need) && (
            <div className="mt-1 text-[10px] text-[#e0b25a]">
              The bank is short. It waits for the charge.
            </div>
          )}
          {/* THE WASHER — a PROCESSING STEP (§13, §37): a row in the panel of
              the machine whose output it eats, never a construction event of
              its own. */}
          <WasherRow />
        </div>
      )}
    </div>
  );
}

/**
 * THE WASHER (§13) — grit + solvent → concentrate + silt.
 *
 * §37: a processing step is "a row inside an existing panel", so this is a
 * fragment of the Crusher's card rather than a machine with a home. It states
 * the solvent it will spend and the band the wash reaches, because both are the
 * decision — the Refinery does the same job for UNITS, and this one does it for
 * the shell's own currency.
 */
function WasherRow() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;
  const tier = tierOf(st, 'washer');
  const cost = nextWasherTierCost(st);
  const rack = st.casting.rack?.length ?? 0;
  const rows = washRows(st).slice(0, 3);
  const sol = solventOf(st);
  let solName = sol.id;
  try { solName = currencyDef(sol.id).name; } catch { /* unknown */ }

  return (
    <div className="mt-2 border-t border-cave-800 pt-1.5" data-testid="washer-row">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-cave-500">
          The Washer
        </span>
        <span className="text-[9px] text-cave-600" data-testid="washer-tier">
          {TIER_CAPABILITY_WASHER[Math.min(tier, MAX_MACHINE_TIER)]}
        </span>
      </div>
      {tier === 0 ? (
        <p className="text-[10px] leading-snug text-cave-600">
          Grit is the end of the line until something washes it. Add the drum and it comes back
          a band cleaner, for solvent instead of for stone.
        </p>
      ) : (
        <>
          <div className="mb-1 flex items-baseline justify-between text-[9px] text-cave-600">
            <span>{WASH_BATCH} grit + {SOLVENT_COST} {solName}</span>
            <span className="tnum">{Math.floor(sol.have)} held</span>
          </div>
          {rows.length === 0 && (
            <div className="text-[10px] text-cave-600">No grit held in fours.</div>
          )}
          {rows.map((r) => {
            const blocked = washBlocker(st, r.materialId, r.band);
            return (
              <button
                key={`${r.materialId}-${r.band}`}
                className="mt-1 flex w-full items-baseline gap-2 rounded border border-cave-800 px-1.5 py-1 text-[10px] hover:bg-cave-800 disabled:opacity-50"
                disabled={blocked !== null}
                title={blocked ?? undefined}
                data-testid={`wash-${r.materialId}`}
                onClick={() => dispatch({ type: 'wash', materialId: r.materialId, band: r.band })}
              >
                <span className="min-w-0 flex-1 truncate text-left text-cave-200">{r.name}</span>
                <span className="shrink-0 text-cave-500">{BAND_LABELS[r.band]}</span>
                <span className="shrink-0 text-cave-600">→</span>
                <span className="shrink-0 text-[#a8d8a0]">{BAND_LABELS[r.into]}</span>
                <span className="shrink-0 text-cave-600">+ silt</span>
              </button>
            );
          })}
        </>
      )}
      {cost !== null && (
        <button
          className="btn mt-1 w-full py-1 text-[10px] disabled:opacity-50"
          disabled={rack < cost}
          data-testid="build-washer"
          onClick={() => dispatch({ type: 'buildWasher' })}
        >
          {tier === 0 ? 'Add the drum' : TIER_CAPABILITY_WASHER[tier + 1]} · {cost} cast parts
        </button>
      )}
    </div>
  );
}
