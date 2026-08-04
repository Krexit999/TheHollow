/**
 * THE LINE — CHAINING (§14.5), plain HTML, in THE PLANT cluster.
 *
 * LAW 3: it lists MACHINES YOU HAVE BUILT and what each would do unattended,
 * never a catalogue of the forty-one. The efficiency and the draw are shown
 * BEFORE the press, because a mismatched Line costs more than doing it by hand
 * and the player is entitled to know that without pressing it.
 */
import { useGame, dispatch } from '../store';
import {
  TIER_CAPABILITY_LINE, efficiency, ensureLine, lineBlocker, lineBuilt, lineDraw, lineFound,
  lineSlots, lineStation, linkable, skipsIdle,
} from '../../engine/systems/line';
import { MAX_MACHINE_TIER, tierOf } from '../../engine/systems/plant';
import type { GameState } from '../../engine';

const MACHINE_NAME: Record<string, string> = {
  crusher: 'The Crusher', refinery: 'The Refinery', still: 'The Still', breaker: 'The Breaker',
};

export function LinePanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;

  const found = lineFound(st);
  const built = lineBuilt(st);
  if (!found && !built) return null;

  const tier = tierOf(st, 'line');
  const cost = (['', 2, 3, 5] as const)[Math.min(tier + 1, 3)];
  const rack = st.casting?.rack?.length ?? 0;
  const at = lineStation();
  const l = ensureLine(st);
  const slots = lineSlots(st);
  const blocked = lineBlocker(st);
  const eff = efficiency(l.members);
  const draw = lineDraw(l.members);

  const toggle = (id: string): void => {
    const next = l.members.includes(id)
      ? l.members.filter((m) => m !== id)
      : [...l.members, id].slice(0, slots);
    dispatch({ type: 'setLine', members: next });
  };

  return (
    <div className="panel mt-2 p-3" data-testid="line-panel">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-cave-300">The Line</span>
        <span className="text-[10px] text-cave-500" data-testid="line-tier">
          {TIER_CAPABILITY_LINE[Math.min(tier, MAX_MACHINE_TIER)]}
        </span>
      </div>

      {!built ? (
        <>
          <p className="text-[10px] leading-snug text-cave-500">
            It is still in the wreck at {at?.name ?? 'the deep'}. Standing, three machines run
            as one press and one draw — which is your attention back, not your bank.
          </p>
          <button
            className="btn mt-1.5 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
            disabled={rack < Number(cost)}
            data-testid="build-line"
            onClick={() => dispatch({ type: 'buildLine' })}
          >
            Raise it — {cost} cast parts <span className="text-cave-600">(rack holds {rack})</span>
          </button>
        </>
      ) : (
        <>
          <div className="space-y-1">
            {linkable(st).map((s) => {
              const on = l.members.includes(s.machineId);
              const idle = !s.can(st);
              return (
                <button
                  key={s.machineId}
                  className={`btn flex w-full items-baseline gap-2 px-1.5 py-1 text-left text-[10px] ${on ? 'border-[#c9a86a]/70' : ''}`}
                  data-testid={`link-${s.machineId}`}
                  onClick={() => toggle(s.machineId)}
                >
                  <span className={`w-4 shrink-0 ${on ? 'text-[#c9a86a]' : 'text-cave-700'}`}>
                    {on ? String(l.members.indexOf(s.machineId) + 1) : '·'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-cave-200">
                    {MACHINE_NAME[s.machineId] ?? s.machineId}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-right text-[9px] text-cave-500">
                    {idle ? <span className="text-[#e0885a]">nothing to do</span> : s.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* THE RATING AND THE PRICE, before the press. */}
          <div className="mt-1.5 flex items-baseline justify-between text-[10px]" data-testid="line-rating">
            <span className="text-cave-500">
              {l.members.length} of {slots} · efficiency {Math.round(eff * 100)}%
            </span>
            <span className="tnum text-[#e0b25a]">{draw} Surge</span>
          </div>
          {l.members.length >= 2 && eff < 1 && (
            <div className="text-[9px] leading-snug text-cave-600">
              A mismatched Line pays more than the machines would separately. It never pays less.
            </div>
          )}
          {skipsIdle(st) && (
            <div className="text-[9px] leading-snug text-cave-600">
              A member with nothing to do is skipped rather than stalling the press.
            </div>
          )}

          <button
            className="btn mt-1.5 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
            disabled={blocked !== null}
            title={blocked ?? undefined}
            data-testid="run-line"
            onClick={() => dispatch({ type: 'runLine' })}
          >
            Fire the Line
          </button>
          {blocked && <div className="mt-0.5 text-[9px] leading-snug text-cave-600">{blocked}</div>}

          <div className="mt-1 flex items-baseline justify-between text-[9px] text-cave-600">
            <button
              className="btn px-1.5 py-[2px] text-[9px]"
              data-testid="hold-line"
              onClick={() => dispatch({ type: 'holdLine', held: !l.held })}
            >
              {l.held ? 'Let it run' : 'Hold it'}
            </button>
            <span className="tnum">{l.fired} fired · {l.stalled} stalled</span>
          </div>

          {tier < MAX_MACHINE_TIER && (
            <button
              className="btn mt-2 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
              disabled={rack < Number(cost)}
              data-testid="build-line"
              onClick={() => dispatch({ type: 'buildLine' })}
            >
              {TIER_CAPABILITY_LINE[tier + 1]} — {cost} cast parts
              <span className="text-cave-600"> (rack holds {rack})</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
