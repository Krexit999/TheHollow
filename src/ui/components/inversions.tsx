/**
 * THE INVERSIONS (§20.2) — the room a challenge is started from.
 *
 * LAW 3, which is the whole reason this panel reads the way it does: it names
 * PLACES AND CONSTRAINTS, never recipes. Every row says what the run is LIKE —
 * "your hands are not part of this run", "a lamp, a pick and a hole" — and what
 * the world will be willing to do afterwards. Not one of them says which
 * upgrade to buy, which materials to bring, or in what order. The constraint is
 * the content.
 *
 * And the abandon line is ABOVE the button, not behind it. A cost you find out
 * about after you have paid it is a trap, and this layer's whole promise is
 * that a run under a seal never takes anything from you.
 */
import { useGame, dispatch } from '../store';
import { challengesRead } from '../../engine/systems/challenges';
import type { GameState } from '../../engine';

export function InversionsPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;
  const r = challengesRead(st);
  if (!r.open) return null;

  return (
    <div className="panel mt-2 p-3" data-testid="inversions-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#9fc4dd]">
          The Inversions
        </span>
        <span className="tnum text-[10px] text-cave-400" data-testid="inversions-kept">
          {r.kept}/{r.rows.length} kept
        </span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        Ten worlds that run by a different rule. Each one starts where you stand and takes
        nothing you earned under it — what it costs is the ground, and what it leaves behind
        is a thing the world will do for you from then on.
      </p>

      {/* WHAT IS RUNNING, AND WHAT WALKING AWAY WOULD MEAN */}
      {r.running && (
        <div
          className="mt-2 rounded-md border border-[#7a6a3a]/60 bg-[#1c1a10]/60 p-2"
          data-testid="inversion-running"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-semibold text-[#d8c98a]">{r.running.name}</span>
            <span className="tnum shrink-0 text-[10px] text-cave-400" data-testid="inversion-progress">
              {r.running.at} / {r.running.target}
            </span>
          </div>
          <div className="mt-1 text-[10px] leading-snug text-cave-400" data-testid="inversion-abandon-line">
            {r.running.abandon}
          </div>
          <button
            className="btn mt-1.5 w-full py-0.5 text-[10px]"
            onClick={() => dispatch({ type: 'abandonChallenge' })}
            data-testid="inversion-abandon"
          >
            Let go of it
          </button>
        </div>
      )}

      <div className="mt-2 space-y-1" data-testid="inversion-rows">
        {r.rows.map((row) => (
          <div
            key={row.id}
            className="rounded-md border border-cave-800 p-1.5"
            data-testid={`inversion-${row.id}`}
            data-done={row.done ? '1' : '0'}
            data-running={row.running ? '1' : '0'}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span
                className="text-[11px] font-semibold text-cave-200"
                data-testid={`inversion-${row.id}-name`}
              >
                {row.name}
              </span>
              <span className="tnum shrink-0 text-[9px] text-cave-500">
                {row.done ? 'kept' : `carry it ${row.descend} down`}
              </span>
            </div>
            <div className="mt-0.5 text-[10px] leading-snug text-cave-400">{row.line}</div>
            {/* WHAT THE WORLD WILL DO AFTERWARDS. Shown before you run it — a
                reward you cannot see is not a reason to do anything. */}
            <div
              className="mt-0.5 text-[10px] leading-snug text-[#9fc4dd]"
              data-testid={`inversion-${row.id}-grant`}
            >
              ▸ {row.grant}
            </div>
            {/* THE BUTTON DISAPPEARS WHILE SOMETHING ELSE IS RUNNING, rather
                than repeating its refusal nine times. The first draft rendered
                a full-width disabled button on every other row carrying the
                same sentence — "X is already under way. One set of rules at a
                time." — which is nine identical paragraphs of noise stacked
                down a 380px column, and it doubled the panel's height to say
                one thing. The running card at the top already says it once. */}
            {!row.done && !row.running && !r.running && (
              <button
                className="btn mt-1 w-full py-0.5 text-[10px]"
                disabled={row.blocked !== null}
                title={row.blocked ?? ''}
                onClick={() => dispatch({ type: 'startChallenge', id: row.id })}
                data-testid={`inversion-${row.id}-start`}
              >
                {row.blocked ?? 'Run it'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
