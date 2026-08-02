/**
 * THE STANDOFF — plain panels (§27).
 *
 * Two things have to be on screen or the design does not exist:
 *
 *   THE INTENT, unconditionally and for free (§27.1). It is printed at the top
 *   in the enemy's own colour before you have chosen anything. There is no cost
 *   to reading it and nothing to unlock.
 *
 *   THE DRILL LINE ACTING (§27.2). Its line appears in the log every single
 *   exchange, whatever you did — a second actor you configured and can no longer
 *   touch. While a fight is live its buttons are disabled and say why.
 */
import { useGame, dispatch } from '../store';
import {
  DEEPWROUGHT_NAME, DRILL_LINES, INTENT_LABEL, drillLineDef, ensureStandoff,
  hazardHere, standoffLive,
} from '../../engine/systems/standoff';
import { contentsOf } from '../../engine/systems/roll';
import type { GameState } from '../../engine';

function Bar({ pct, tone }: { pct: number; tone: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-cave-800">
      <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: tone }} />
    </div>
  );
}

/**
 * THE PRE-FIGHT DECISION, and it only exists before the fight. §27.2's whole
 * point is that the second actor is configured in advance and then plays itself,
 * so the buttons go dead the moment a Standoff starts and say so rather than
 * silently doing nothing.
 */
function LinePicker({ st }: { st: GameState }) {
  const s = ensureStandoff(st);
  const live = standoffLive(st);
  return (
    <div className="mt-2 border-t border-cave-800 pt-1.5">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-cave-500">The drill line</span>
        {live && <span className="text-[9px] text-[#e0885a]">set — it cannot be changed now</span>}
      </div>
      {DRILL_LINES.map((d) => {
        const on = (live ? s.line : s.nextLine) === d.id;
        return (
          <button
            key={d.id}
            className={`mt-1 w-full rounded border px-1.5 py-1 text-left text-[10px] disabled:opacity-50 ${
              on ? 'border-lamp-500/50 bg-lamp-500/10' : 'border-cave-800 hover:bg-cave-800'
            }`}
            disabled={live}
            data-testid={`line-${d.id}`}
            onClick={() => dispatch({ type: 'setDrillLine', line: d.id })}
          >
            <span className={`font-semibold ${on ? 'text-lamp-200' : 'text-cave-200'}`}>{d.name}</span>
            <span className="text-cave-500"> — {d.does}</span>
          </button>
        );
      })}
    </div>
  );
}

export function StandoffPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;
  const here = hazardHere(st);
  const s = ensureStandoff(st);
  const live = standoffLive(st);
  // Nothing at all until there is something to fight. Danger is texture (§27.7):
  // a permanently visible empty combat room would make it a chore.
  if (!here && !live && s.outcome === null) return null;

  const hazard = here ? contentsOf(st, here.id).hazard : 0;

  return (
    <div className="panel p-3" data-testid="standoff">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-cave-400">The Standoff</span>
        <span className="text-[10px] text-[#e0885a]">{here?.name ?? ''}</span>
      </div>

      {!live && s.outcome === null && (
        <>
          <div className="text-[10px] leading-snug text-cave-500">
            {DEEPWROUGHT_NAME} is in there, packing itself down. Hazard {hazard}.
            It hardens every exchange — less to hurt, more to take. Walking past costs nothing.
          </div>
          <LinePicker st={st} />
          <button
            className="btn mt-2 w-full py-1 text-[11px]"
            data-testid="engage"
            onClick={() => dispatch({ type: 'beginStandoff' })}
          >
            Engage · {drillLineDef(s.nextLine).name}
          </button>
        </>
      )}

      {live && (
        <>
          {/* INTENT, FREE, FIRST (§27.1). Nothing gates this line. */}
          <div className="rounded border border-[#e0885a]/40 bg-[#e0885a]/10 px-2 py-1" data-testid="intent">
            <span className="text-[9px] font-semibold uppercase tracking-widest text-[#e0885a]">Next</span>
            <span className="ml-1.5 text-[11px] text-[#f0c8a8]">{INTENT_LABEL[s.intent]}</span>
          </div>

          <div className="mt-2 space-y-1.5">
            <div>
              <div className="flex items-baseline justify-between text-[10px]">
                <span className="text-cave-300">Your wind</span>
                <span className="tnum text-cave-400">{Math.max(0, s.wind).toFixed(0)} / {s.maxWind}</span>
              </div>
              <Bar pct={(s.wind / s.maxWind) * 100} tone="#9ad4e8" />
            </div>
            <div>
              <div className="flex items-baseline justify-between text-[10px]">
                <span className="text-[#e0885a]">{DEEPWROUGHT_NAME}</span>
                <span className="tnum text-cave-400" data-testid="compaction">
                  {Math.max(0, s.hp).toFixed(0)} / {s.maxHp} <span className="text-cave-600">· packed {s.compaction}</span>
                </span>
              </div>
              <Bar pct={(s.hp / s.maxHp) * 100} tone="#e0885a" />
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button className="btn py-1 text-[11px]" data-testid="strike"
              onClick={() => dispatch({ type: 'exchange', stance: 'strike' })}>
              STRIKE
            </button>
            <button className="btn py-1 text-[11px]" data-testid="withdraw"
              onClick={() => dispatch({ type: 'exchange', stance: 'withdraw' })}>
              WITHDRAW
            </button>
          </div>
          <div className="mt-1 text-[9px] leading-snug text-cave-500">
            The same stance twice running lands for half, and it will have your number after.
            Withdrawing is free — you keep what you carried and lose the drop.
          </div>
          <LinePicker st={st} />
        </>
      )}

      {s.outcome !== null && (
        <div className="mt-1">
          <div className={`text-[11px] font-semibold ${
            s.outcome === 'won' ? 'text-[#a8d8a0]' : s.outcome === 'lost' ? 'text-[#e0885a]' : 'text-cave-300'
          }`}>
            {s.outcome === 'won' ? 'It came apart.' : s.outcome === 'lost' ? 'You lost your wind.' : 'You backed off.'}
          </div>
          <button className="btn mt-1.5 w-full py-1 text-[11px]" data-testid="dismiss"
            onClick={() => dispatch({ type: 'dismissStandoff' })}>
            Done
          </button>
        </div>
      )}

      {s.log.length > 0 && (
        <div className="mt-2 border-t border-cave-800 pt-1.5" data-testid="standoff-log">
          {s.log.slice(-6).map((l, i) => (
            <div key={`${i}-${l.slice(0, 12)}`} className="text-[10px] leading-snug text-cave-500">{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}
