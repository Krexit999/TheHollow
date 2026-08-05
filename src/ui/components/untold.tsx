/**
 * THE UNTOLD (§47/§49) — what you fell into, and where it points.
 *
 * ONLY WHAT YOU KNOW. There is no list of six with five greyed out and no
 * denominator, because a denominator turns an accident into a checklist and
 * tells you there are five more things to go and look up. `untoldRows` filters
 * in the engine so this panel cannot be the place that leaks it.
 *
 * WHAT YOU DID IS SHOWN AFTER, NEVER BEFORE. The `did` line is a description of
 * something already in the past — "you left a corner alone for a very long
 * time" — not an instruction. Read before the fact it would be a quest step;
 * read after, it is the game telling you what it was you had done.
 */
import { useGame } from '../store';
import { untoldRows } from '../../engine/systems/untold';
import type { GameState } from '../../engine';

export function UntoldPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const rows = untoldRows(state as GameState);
  if (rows.length === 0) return null;

  return (
    <div className="panel mt-2 p-3" data-testid="untold-panel">
      <span className="text-xs font-semibold uppercase tracking-wider text-[#a89bc4]">
        Things nobody told you
      </span>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        You were doing something else at the time.
      </p>

      <div className="mt-2 space-y-2">
        {rows.map((r) => (
          <div
            key={r.def.id}
            className="rounded-md border border-[#4a4260]/70 bg-[#16141c]/60 p-2"
            data-testid={`untold-${r.def.id}`}
          >
            <div className="text-[11px] font-semibold tracking-wide text-[#c3b6dd]">{r.def.name}</div>
            <p className="mt-0.5 text-[10px] leading-snug text-cave-500 italic">{r.def.did}</p>
            <p className="mt-1 text-[10px] leading-snug text-cave-300">{r.def.points}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
