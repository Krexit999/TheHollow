/**
 * THE GOVERNOR — OVERCLOCKING (§13), plain HTML, in THE PLANT cluster.
 *
 * LAW 3: the machines you have BUILT, each with a setting, and for the one you
 * are pushing, all three halves of the trade stated before you touch it — how
 * much faster it converts, how much more of the plant's Draw it takes, and how
 * often what comes off it will be spoiled.
 *
 * The off-spec count is shown because it is the whole point: a gamble whose
 * losses you cannot see is a tax you have not noticed paying.
 */
import { useState } from 'react';
import { useGame, dispatch } from '../store';
import {
  MAX_OVERCLOCK, OFFSPEC_PER_STEP, TIER_CAPABILITY_GOVERNOR, ensureGovernor, governorBuilt,
  governorFound, governorStation, machineLimit, nextGovernorTierCost, overclockDraw,
  overclockSpeed, regulates, setOverclockBlocker, stepsLive, stepsSet,
} from '../../engine/systems/governor';
import { MAX_MACHINE_TIER, tierOf } from '../../engine/systems/plant';
import { conditionedMachines } from '../../engine/systems/condition';
import type { GameState } from '../../engine';

export function GovernorPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [pick, setPick] = useState('');
  if (!state) return null;
  const st = state as GameState;

  const found = governorFound(st);
  const built = governorBuilt(st);
  if (!found && !built) return null;

  const tier = tierOf(st, 'governor');
  const cost = nextGovernorTierCost(st);
  const rack = st.casting?.rack?.length ?? 0;
  const g = ensureGovernor(st);
  const machines = conditionedMachines().filter(
    (id) => id !== 'governor' && (tierOf(st, id) > 0 || (id === 'kiln' && st.kiln.built)),
  );
  const on = machines.includes(pick) ? pick : (machines[0] ?? '');
  const set = on ? stepsSet(st, on) : 0;
  const live = on ? stepsLive(st, on) : 0;

  return (
    <div className="panel mt-2 p-3" data-testid="governor-panel">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-cave-300">The Governor</span>
        <span className="text-[10px] text-cave-500" data-testid="governor-tier">
          {TIER_CAPABILITY_GOVERNOR[Math.min(tier, MAX_MACHINE_TIER)]}
        </span>
      </div>

      {!built ? (
        <>
          <p className="text-[10px] leading-snug text-cave-500">
            It is still in the wreck at {governorStation()?.name ?? 'the deep'}. Standing, it will
            hold a machine above its rating — faster, hungrier, and not always right.
          </p>
          <button
            className="btn mt-1.5 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
            disabled={cost === null || rack < cost}
            data-testid="build-governor"
            onClick={() => dispatch({ type: 'buildGovernor' })}
          >
            Raise it — {cost ?? 0} cast parts <span className="text-cave-600">(rack holds {rack})</span>
          </button>
        </>
      ) : (
        <>
          {machines.length === 0 ? (
            <p className="text-[10px] italic text-cave-600">
              Nothing built for it to push.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1" data-testid="governor-machines">
                {machines.map((id) => (
                  <button
                    key={id}
                    className={`btn px-1.5 py-0.5 text-[10px] ${id === on ? 'ring-1 ring-[#e0885a]' : ''}`}
                    data-testid={`gov-pick-${id}`}
                    onClick={() => setPick(id)}
                  >
                    {id}
                    {stepsSet(st, id) > 0 && (
                      <span className="text-[#e0885a]"> +{stepsSet(st, id)}</span>
                    )}
                  </button>
                ))}
              </div>

              <div className="mt-1.5 flex items-baseline gap-1">
                <span className="text-[9px] text-cave-600">steps past rating</span>
                {Array.from({ length: MAX_OVERCLOCK + 1 }, (_, n) => (
                  <button
                    key={n}
                    className={`btn px-1.5 py-0 text-[10px] disabled:opacity-40 ${n === set ? 'ring-1 ring-[#e0885a]' : ''}`}
                    disabled={setOverclockBlocker(st, on, n) !== null}
                    title={setOverclockBlocker(st, on, n) ?? undefined}
                    data-testid={`gov-step-${n}`}
                    onClick={() => dispatch({ type: 'setOverclock', machineId: on, steps: n })}
                  >
                    {n}
                  </button>
                ))}
              </div>

              {/* ALL THREE HALVES OF THE TRADE, before the button that sets it. */}
              <div className="mt-1.5 rounded border border-cave-800 px-1.5 py-1 text-[10px]"
                data-testid="governor-trade">
                <div className="flex items-baseline justify-between">
                  <span className="text-cave-500">converts</span>
                  <span className="tnum text-cave-200">×{overclockSpeed(st, on).toFixed(2)}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-cave-500">takes from the plant</span>
                  <span className="tnum text-cave-200">×{overclockDraw(st, on).toFixed(2)}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-cave-500">comes off spoiled</span>
                  <span className="tnum text-[#e0885a]" data-testid="offspec-chance">
                    {Math.round(Math.min(1, OFFSPEC_PER_STEP * live) * 100)}%
                  </span>
                </div>
                <div className="mt-0.5 text-[9px] leading-snug text-cave-600">
                  Spoiled means a band lower — the thing a tier-II machine was bought to stop.
                </div>
              </div>

              {live < set && (
                <div className="mt-1 text-[9px] leading-snug text-[#e0885a]" data-testid="regulated">
                  The plant cannot carry {set} steps. It is holding {live}.
                </div>
              )}
              {!regulates(st) && (
                <div className="mt-1 text-[9px] leading-snug text-cave-600">
                  This Governor holds {machineLimit(st) === Infinity ? 'the whole plant' : 'one machine'} and
                  will not back off on its own.
                </div>
              )}
              {g.offSpec > 0 && (
                <div className="mt-1 flex items-baseline justify-between text-[9px] text-cave-600"
                  data-testid="offspec-count">
                  <span>gone off-spec</span>
                  <span className="tnum">{g.offSpec}{g.lastOffSpec ? ` · last: ${g.lastOffSpec}` : ''}</span>
                </div>
              )}
            </>
          )}

          {cost !== null && (
            <button
              className="btn mt-2 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
              disabled={rack < cost}
              data-testid="build-governor"
              onClick={() => dispatch({ type: 'buildGovernor' })}
            >
              {TIER_CAPABILITY_GOVERNOR[tier + 1]} — {cost} cast parts
              <span className="text-cave-600"> (rack holds {rack})</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
