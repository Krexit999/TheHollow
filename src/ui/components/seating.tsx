/**
 * THE SEATING — THE TERMINAL CRAFT (§13), plain HTML, in the Rewrite panel.
 *
 * Three things, in the order they matter: what each empty seat still wants
 * (tier I, and the reason tier I is not a bequest), what will come with you,
 * and the pour.
 */
import { useGame, dispatch } from '../store';
import {
  BEQUEST_DEFS, TIER_CAPABILITY_SEATING, bequestBlocker, nextSeatingTierCost,
  seatingFound, seatingRead, seatingStation, type BequestId,
} from '../../engine/systems/seating';
import { MAX_MACHINE_TIER, tierOf } from '../../engine/systems/plant';
import { MACHINE_DEMAND } from '../../engine/systems/plant';
import type { GameState } from '../../engine';

export function SeatingPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;

  const found = seatingFound(st);
  const r = seatingRead(st);
  if (!found && !r.built) return null;

  const cost = nextSeatingTierCost(st);
  const rack = st.casting?.rack?.length ?? 0;
  const built = Object.keys(MACHINE_DEMAND).filter((m) => tierOf(st, m) > 0);

  return (
    <div className="panel p-3" data-testid="seating-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#d8c98a]">The Seating</span>
        <span className="tnum text-[10px] text-cave-400" data-testid="seating-tier">
          {r.built ? `tier ${r.tier} · ${r.seated}/7 seated` : 'in the wreck'}
        </span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        {r.built
          ? 'Seven seats around a table, and you have sat in one of them for a very long time.'
          : `Seven seats, six of them pushed in${seatingStation() ? `, at ${seatingStation()!.name}` : ''}.`}
      </p>

      <div className="mt-2 space-y-0.5">
        {TIER_CAPABILITY_SEATING.slice(1).map((line, i) => (
          <div
            key={i}
            className="text-[10px] leading-snug"
            style={{ color: r.tier >= i + 1 ? '#9ac07a' : '#6c6459' }}
            data-testid={`seating-tier-${i + 1}`}
          >
            <span className="tnum mr-1">{['I', 'II', 'III', 'IV', 'V'][i]}</span>{line}
          </div>
        ))}
      </div>

      {cost !== null && (
        <button
          className="btn mt-2 w-full py-1.5 text-xs"
          disabled={!found || rack < cost}
          onClick={() => dispatch({ type: 'buildSeating' })}
          data-testid="seating-build"
        >
          {r.tier === 0 ? 'Sit down' : `Deepen the Seating — tier ${r.tier + 1}`} · {cost} cast parts ({rack} on the rack)
        </button>
      )}
      {cost === null && r.tier >= MAX_MACHINE_TIER && (
        <div className="mt-2 text-center text-[10px] text-cave-500">It carries everything it will ever carry.</div>
      )}

      {r.built && r.missing.length > 0 && (
        <div className="mt-2 border-t border-cave-800 pt-2">
          <div className="text-[9px] uppercase tracking-widest text-cave-500">What is still missing</div>
          <div className="mt-1 space-y-0.5" data-testid="seating-missing">
            {r.missing.map((m) => (
              <div key={m.seat} className="text-[10px] leading-snug text-cave-400" data-testid={`seating-missing-${m.seat}`}>
                <span className="tnum mr-1 text-cave-500">{m.seat}</span>{m.want}
              </div>
            ))}
          </div>
        </div>
      )}

      {r.built && (
        <div className="mt-2 border-t border-cave-800 pt-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[9px] uppercase tracking-widest text-cave-500">What comes with you</span>
            <span className="tnum text-[9px] text-cave-500" data-testid="seating-slots">
              {r.bequests.length}/{r.slots}
            </span>
          </div>
          <div className="mt-1 space-y-1" data-testid="bequest-rows">
            {BEQUEST_DEFS.map((b) => {
              const on = r.bequests.includes(b.id);
              const blocked = bequestBlocker(st, b.id);
              return (
                <button
                  key={b.id}
                  className={`w-full rounded-md border p-1.5 text-left ${
                    on ? 'border-[#d8c98a] bg-[#22200f]' : 'border-cave-800'
                  }`}
                  disabled={blocked !== null && !on}
                  title={blocked ?? b.flavor}
                  onClick={() => dispatch({ type: 'setBequest', bequest: b.id as BequestId })}
                  data-testid={`bequest-${b.id}`}
                >
                  <div className="text-[11px] font-semibold" style={{ color: on ? '#e8dcae' : '#c9c2b6' }}>
                    {b.name}{on ? ' ✓' : ''}
                  </div>
                  <div className="text-[10px] leading-snug text-cave-400">{b.does}</div>
                </button>
              );
            })}
          </div>

          {r.bequests.includes('standing') && (
            <div className="mt-1.5 flex flex-wrap gap-1" data-testid="bequest-machines">
              {built.length === 0 && (
                <span className="text-[9px] text-cave-500">You have not built a machine to leave standing.</span>
              )}
              {built.map((m) => (
                <button
                  key={m}
                  className={`rounded border px-1 py-0.5 text-[9px] ${
                    r.machine === m ? 'border-[#d8c98a] text-[#e8dcae]' : 'border-cave-800 text-cave-500'
                  }`}
                  onClick={() => dispatch({ type: 'setBequestMachine', machineId: r.machine === m ? null : m })}
                  data-testid={`bequest-machine-${m}`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          <button
            className="btn btn-warm mt-2 w-full py-2 text-xs"
            disabled={r.pour !== null}
            title={r.pour ?? ''}
            onClick={() => dispatch({ type: 'pourWorld' })}
            data-testid="seating-pour"
          >
            {r.pour ?? 'POUR A WORLD — the tool is finished'}
          </button>
          {r.poured > 0 && (
            <div className="mt-1 text-center text-[9px] text-cave-500" data-testid="seating-poured">
              worlds poured: {r.poured}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
