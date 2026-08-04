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
import { CRUSH_BATCH, crushPreview, crushable, nextCrusherTierCost } from '../../engine/systems/crusher';
import { materialDef, BAND_LABELS } from '../../engine/materials';
import {
  RECAST_PART_COST, bandOfMachine, conditionLine, conditionedMachines, litBands,
  observePlant, recastBlocker, ruleFor,
} from '../../engine/systems/condition';
import { WAVELENGTH_NAMES } from '../../engine/systems/refraction';
import { currentShell } from '../../engine/shells';
import type { GameState } from '../../engine';

const MACHINE_NAME: Record<string, string> = {
  kiln: 'The Kiln',
  crusher: 'The Crusher',
  refinery: 'The Refinery',
  assayBench: 'The Assay Bench',
};

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
  if (!st.kiln.built) return null; // the Hearth is the Kiln; no kiln, no plant

  const cap = flowCap(st);
  const want = flowDemand(st);
  const surge = st.plant?.surge ?? 0;
  const sCap = surgeCap(st);

  return (
    <div className="panel p-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-cave-400">The Hearth</span>
        <span className="text-[10px] text-cave-500">pure Flow, small</span>
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
          return (
            <div key={id} className="flex items-baseline gap-2 py-[2px] text-[10px]" data-testid={`plant-${id}`}>
              <span className={`w-[68px] shrink-0 truncate ${built ? 'text-cave-200' : 'text-cave-600'}`}>
                {MACHINE_NAME[id]}
              </span>
              <span className="w-[74px] shrink-0 text-cave-500">
                {d.flow > 0 && <span className="text-[#9ad4e8]">{d.flow}/s</span>}
                {d.flow > 0 && d.surge > 0 && <span className="text-cave-700"> + </span>}
                {d.surge > 0 && <span className="text-[#e0b25a]">{d.surge}</span>}
              </span>
              <span className="min-w-0 flex-1 truncate text-right text-cave-500">
                {!built ? 'not built'
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
  if (!rule) return null;
  const glassmere = rule.id === 'unlit';
  const lit = litBands(st);
  const machines = conditionedMachines()
    .filter((id) => (id === 'kiln' ? st.kiln.built : tierOf(st, id) > 0));
  if (machines.length === 0) return null;

  return (
    <div className="panel mt-2 p-3" data-testid="condition-panel">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-cave-400">
          What the shell is doing to it
        </span>
        <span className="text-[10px] text-cave-500">{rule.label}</span>
      </div>
      <p className="mb-1.5 text-[9px] leading-snug text-cave-500">{rule.effect}</p>

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
        </div>
      )}
    </div>
  );
}
