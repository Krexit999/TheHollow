/**
 * THE RETORT — REDUCTION (§13), plain HTML, in THE PLANT cluster.
 *
 * LAW 3: the media YOU HOLD enough of, and what each becomes. Never the table,
 * never the pyre stone as a shopping list — the row says what it wants only
 * when you are short of it, which is the one moment the answer is useful.
 */
import { useGame, dispatch } from '../store';
import {
  REDUCE_UNITS, TIER_CAPABILITY_RETORT, firedByShaft, nextRetortTierCost, reduceBlocker,
  reducible, retortBuilt, retortFound, retortStation, shaftIsTheFire,
} from '../../engine/systems/retort';
import { MAX_MACHINE_TIER, tierOf } from '../../engine/systems/plant';
import { riskedHeat } from '../../engine/systems/boiler';
import type { GameState } from '../../engine';

export function RetortPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;

  const found = retortFound(st);
  const built = retortBuilt(st);
  if (!found && !built) return null;

  const tier = tierOf(st, 'retort');
  const cost = nextRetortTierCost(st);
  const rack = st.casting?.rack?.length ?? 0;
  const rows = reducible(st);
  const byShaft = firedByShaft(st);

  return (
    <div className="panel mt-2 p-3" data-testid="retort-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#e0955c]">The Retort</span>
        <span className="tnum text-[10px] text-cave-400">{tier > 0 ? `tier ${tier}` : 'in the wreck'}</span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        {tier > 0
          ? 'Long glass necks over a low fire. Nothing here is made — things are taken down to what they were under.'
          : `A hall of long glass necks, one of them still dripping${retortStation() ? `, at ${retortStation()!.name}` : ''}.`}
      </p>

      <div className="mt-2 space-y-0.5">
        {TIER_CAPABILITY_RETORT.slice(1).map((line, i) => (
          <div
            key={i}
            className="text-[10px] leading-snug"
            style={{ color: tier >= i + 1 ? '#9ac07a' : '#6c6459' }}
            data-testid={`retort-tier-${i + 1}`}
          >
            <span className="tnum mr-1">{['I', 'II', 'III'][i]}</span>{line}
          </div>
        ))}
      </div>

      {cost !== null && (
        <button
          className="btn mt-2 w-full py-1.5 text-xs"
          disabled={!found || rack < cost}
          onClick={() => dispatch({ type: 'buildRetort' })}
          data-testid="retort-build"
        >
          {tier === 0 ? 'Stand it up' : `Deepen the Retort — tier ${tier + 1}`} · {cost} cast parts ({rack} on the rack)
        </button>
      )}
      {cost === null && tier >= MAX_MACHINE_TIER && (
        <div className="mt-2 text-center text-[10px] text-cave-500">There is nothing further down than this.</div>
      )}

      {built && (
        <div className="mt-2 border-t border-cave-800 pt-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[9px] uppercase tracking-widest text-cave-500">In the necks</span>
            {shaftIsTheFire(st) && (
              <span className="tnum text-[9px]" style={{ color: byShaft ? '#9ac07a' : '#8a7f70' }}>
                {byShaft ? `the shaft is the fire (+${riskedHeat(st).toFixed(0)}°)` : 'below the line — it wants a stone'}
              </span>
            )}
          </div>
          {rows.length === 0 && (
            <p className="mt-1 text-[11px] italic text-cave-500">
              Nothing here reduces. It takes {REDUCE_UNITS} of a quench medium at one band.
            </p>
          )}
          <div className="mt-1 max-h-72 space-y-1.5 overflow-y-auto scroll-thin">
            {rows.map((r) => {
              const blocked = reduceBlocker(st, r.fromId, r.band);
              return (
                <div key={`${r.fromId}-${r.band}`} className="rounded-md border border-cave-800 p-1.5" data-testid={`retort-row-${r.fromId}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[11px] font-semibold text-cave-200">
                      {r.name} → {r.toName}
                    </span>
                    <span className="tnum shrink-0 text-[10px] text-cave-500">×{r.count}</span>
                  </div>
                  <div className="text-[10px] italic leading-snug text-cave-400">{r.line}</div>
                  <button
                    className="btn mt-1 w-full py-1 text-[10px]"
                    disabled={blocked !== null}
                    title={blocked ?? `${REDUCE_UNITS} ${r.name} at ${r.band}`}
                    onClick={() => dispatch({ type: 'reduce', fromId: r.fromId, band: r.band })}
                    data-testid={`retort-do-${r.fromId}`}
                  >
                    {blocked ?? `Reduce ${REDUCE_UNITS} ${r.band} ${r.name}`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
