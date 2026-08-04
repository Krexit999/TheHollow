/**
 * THE BREAKER — SALVAGE (§13), plain HTML, in THE PLANT cluster.
 *
 * LAW 3: it lists what is ON THE RACK and what each piece would hand back. The
 * bench is excluded, and the bulk press names what it will KEEP before it runs,
 * because a bulk verb that can eat the one good head you were saving is §25.5's
 * first automation problem wearing a button.
 */
import { useGame, dispatch } from '../store';
import {
  TIER_CAPABILITY_BREAKER, breakable, breakerBuilt, breakerFound, breakerStation,
  breaksInBulk, nextBreakerTierCost, returnsProps,
} from '../../engine/systems/breaker';
import { MAX_MACHINE_TIER, tierOf } from '../../engine/systems/plant';
import type { GameState } from '../../engine';

export function BreakerPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;

  const found = breakerFound(st);
  const built = breakerBuilt(st);
  if (!found && !built) return null;

  const tier = tierOf(st, 'breaker');
  const cost = nextBreakerTierCost(st);
  const rack = st.casting?.rack?.length ?? 0;
  const at = breakerStation();
  const rows = breakable(st).slice(0, 10);

  return (
    <div className="panel mt-2 p-3" data-testid="breaker-panel">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-cave-300">The Breaker</span>
        <span className="text-[10px] text-cave-500" data-testid="breaker-tier">
          {TIER_CAPABILITY_BREAKER[Math.min(tier, MAX_MACHINE_TIER)]}
        </span>
      </div>

      {!built ? (
        <>
          <p className="text-[10px] leading-snug text-cave-500">
            It is still in the wreck at {at?.name ?? 'the deep'}. Standing, a part you cast for
            a machine you never built stops being a part you are stuck with.
          </p>
          <button
            className="btn mt-1.5 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
            disabled={cost === null || rack < cost}
            data-testid="build-breaker"
            onClick={() => dispatch({ type: 'buildBreaker' })}
          >
            Raise it — {cost ?? 0} cast parts <span className="text-cave-600">(rack holds {rack})</span>
          </button>
        </>
      ) : (
        <>
          {returnsProps(st) && (
            <p className="mb-1.5 text-[9px] leading-snug text-[#c9a86a]" data-testid="breaker-props">
              Pulling props at a drift now hands its cast parts back.
            </p>
          )}
          <div className="space-y-1">
            {rows.map((r) => (
              <div key={r.partId} className="flex items-baseline gap-2" data-testid={`break-row-${r.partId}`}>
                <span className="min-w-0 flex-1 truncate text-[10px] text-cave-300">{r.name}</span>
                <span className="shrink-0 text-[9px] text-cave-500">{r.units} back</span>
                <button
                  className="btn shrink-0 px-1.5 py-[2px] text-[9px]"
                  data-testid={`break-${r.partId}`}
                  onClick={() => dispatch({ type: 'breakPart', partId: r.partId })}
                >
                  break
                </button>
              </div>
            ))}
            {rows.length === 0 && (
              <p className="text-[10px] italic text-cave-600">The rack is empty, or all of it is on the station.</p>
            )}
          </div>

          {breaksInBulk(st) && rows.length > 0 && (
            <button
              className="btn mt-2 w-full px-1.5 py-1 text-[10px]"
              data-testid="break-rack"
              onClick={() => dispatch({ type: 'breakRack' })}
            >
              Break the rack — it keeps the best of each type
            </button>
          )}

          {cost !== null && (
            <button
              className="btn mt-2 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
              disabled={rack < cost}
              data-testid="build-breaker"
              onClick={() => dispatch({ type: 'buildBreaker' })}
            >
              {TIER_CAPABILITY_BREAKER[tier + 1]} — {cost} cast parts
              <span className="text-cave-600"> (rack holds {rack})</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
