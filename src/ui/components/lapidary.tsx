/**
 * THE LAPIDARY — CUTTING (§13), plain HTML, in THE PLANT cluster.
 *
 * LAW 3: the stones YOU HOLD, the shapes this wheel can grind, and what each
 * shape does to the row — never a table of every gem in the game or a preview
 * of what some pair would pay. The interesting question ("which of my stones
 * should be a window and which should be a jewel") is asked with what is in
 * front of the player.
 */
import { useGame, dispatch } from '../store';
import {
  CUTS, CUT_BY_ID, TIER_CAPABILITY_LAPIDARY, cutCost, cuttable, lapidaryBuilt,
  lapidaryFound, lapidaryStation, nextLapidaryTierCost, shapesAvailable,
  type CutShape,
} from '../../engine/systems/lapidary';
import { MAX_MACHINE_TIER, tierOf } from '../../engine/systems/plant';
import { convCurrencyId } from '../../engine/shells';
import type { GameState } from '../../engine';

export function LapidaryPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;

  const found = lapidaryFound(st);
  const built = lapidaryBuilt(st);
  if (!found && !built) return null;

  const tier = tierOf(st, 'lapidary');
  const cost = nextLapidaryTierCost(st);
  const rack = st.casting?.rack?.length ?? 0;
  const stones = cuttable(st);
  const shapes = shapesAvailable(st);
  const conv = st.currencies?.[convCurrencyId(st)]?.toNumber() ?? 0;

  return (
    <div className="panel mt-2 p-3" data-testid="lapidary-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#bcd8ee]">The Lapidary</span>
        <span className="tnum text-[10px] text-cave-400">
          {tier > 0 ? `tier ${tier}` : 'in the wreck'}
        </span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        {tier > 0
          ? 'A wheel, a tray of grit, and a lamp behind the stone. What you take off decides what passes through.'
          : `Ground glass and a warm patch on the floor${lapidaryStation() ? `, at ${lapidaryStation()!.name}` : ''}.`}
      </p>

      {/* WHAT THIS WHEEL CAN DO — the tier ladder, as three sentences. */}
      <div className="mt-2 space-y-0.5">
        {TIER_CAPABILITY_LAPIDARY.slice(1).map((line, i) => (
          <div
            key={i}
            className="text-[10px] leading-snug"
            style={{ color: tier >= i + 1 ? '#9ac07a' : '#6c6459' }}
            data-testid={`lapidary-tier-${i + 1}`}
          >
            <span className="tnum mr-1">{['I', 'II', 'III'][i]}</span>{line}
          </div>
        ))}
      </div>

      {cost !== null && (
        <button
          className="btn mt-2 w-full py-1.5 text-xs"
          disabled={!found || rack < cost}
          onClick={() => dispatch({ type: 'buildLapidary' })}
          data-testid="lapidary-build"
        >
          {tier === 0 ? 'Stand it up' : `Deepen the wheel — tier ${tier + 1}`} · {cost} cast parts ({rack} on the rack)
        </button>
      )}
      {cost === null && tier >= MAX_MACHINE_TIER && (
        <div className="mt-2 text-center text-[10px] text-cave-500">It will not go finer than this.</div>
      )}

      {built && (
        <div className="mt-2 border-t border-cave-800 pt-2">
          <div className="text-[9px] uppercase tracking-widest text-cave-500">On the tray</div>
          {stones.length === 0 && (
            <p className="mt-1 text-[11px] italic text-cave-500">
              No stones to work. Geodes carry them.
            </p>
          )}
          <div className="mt-1 space-y-1.5">
            {stones.map((g) => {
              const c = cutCost(st, g.gemId);
              const current = g.cut ? CUT_BY_ID.get(g.cut) : null;
              return (
                <div key={g.gemId} className="rounded-md border border-cave-800 p-1.5" data-testid={`lapidary-row-${g.gemId}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[11px] font-semibold text-cave-200">{g.name}</span>
                    <span className="tnum shrink-0 text-[10px] text-cave-500">×{g.count}</span>
                  </div>
                  <div className="text-[10px] leading-snug" style={{ color: current ? '#bcd8ee' : '#8a7f70' }}>
                    {current ? `${current.name} — ${current.does}` : 'Uncut. It stops the row where it sits.'}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {CUTS.map((s) => {
                      const have = shapes.some((x) => x.id === s.id);
                      const isNow = g.cut === s.id;
                      const canPay = g.count >= c.gems + 1 && conv >= c.conv;
                      return (
                        <button
                          key={s.id}
                          className="btn px-1.5 py-0.5 text-[10px]"
                          disabled={!have || isNow || !canPay}
                          title={have ? s.does : 'A deeper wheel grinds this one.'}
                          onClick={() => dispatch({ type: 'cutGem', gemId: g.gemId, shape: s.id as CutShape })}
                          data-testid={`lapidary-cut-${g.gemId}-${s.id}`}
                        >
                          {isNow ? `${s.name} ✓` : s.name}
                        </button>
                      );
                    })}
                  </div>
                  <div className="tnum mt-0.5 text-[9px] text-cave-500">
                    {c.conv} to turn the wheel · {c.gems} ground away
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
