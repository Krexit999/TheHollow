/**
 * THE FACE'S SIGNATURE VERBS — a plain HTML row in the Dig panel.
 *
 * THERE IS ONE CHIP VERB NOW. Chip and Sweep were a mode toggle between a tap
 * and a drag that did the same thing at a different rate, and SKIM collected a
 * pool that existed to give Skim something to collect. Grain briefly gave the
 * pair distinct jobs (§2.4 — SKIM with-grain, HOLD across); grain is cut, and
 * neither verb had a job after it. All three are gone: the actions, the
 * stamina, the pool, the mode switching.
 *
 * WHAT IS LEFT IS THE TECHNIQUE FRAMEWORK, and it is left because POLESHIFT
 * (Ferrite) still uses it — a targeted verb you arm here and then land on a
 * cell. In Loam this component renders NOTHING, which is correct: the shell no
 * longer has a verb beyond the tap.
 */
import { useGame, dispatch } from '../store';
import { availableTechniques } from '../../engine/techniques';
import type { GameState } from '../../engine';

export function FaceVerbs() {
  const mode = useGame((s) => s.faceMode);
  const armedTechnique = useGame((s) => s.armedTechnique);
  const armTechnique = useGame((s) => s.armTechnique);
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;

  const techniques = availableTechniques(st);
  // No verb, no panel. A row reading "Chip" with one button in it is furniture.
  if (techniques.length === 0) return null;

  return (
    <div className="panel p-2.5" data-testid="face-verbs">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-cave-400">
        What the rock grants
      </div>
      <div className="flex flex-wrap gap-1">
        {techniques.map((t) => {
          const cooling = t.readyInSec > 0;
          if (!t.def.targeted) {
            return (
              <button
                key={t.def.id}
                className="min-h-[36px] flex-1 rounded-md px-2 text-xs font-semibold text-cave-300 transition-colors hover:bg-cave-800 disabled:opacity-50"
                title={t.def.describe(st, t.strength)}
                disabled={cooling}
                data-testid={`verb-${t.def.id}`}
                onClick={() => dispatch({ type: 'useTechnique', id: t.def.id })}
              >
                {cooling ? `${t.def.name} ${Math.ceil(t.readyInSec)}s` : t.def.name}
              </button>
            );
          }
          // A targeted verb (Poleshift): arm it, then tap the cell.
          const armed = armedTechnique === t.def.id && mode === 'technique';
          return (
            <button
              key={t.def.id}
              className={`min-h-[36px] flex-1 rounded-md px-2 text-xs font-semibold transition-colors ${
                armed ? 'bg-lamp-500/25 text-lamp-200' : cooling ? 'text-cave-500' : 'text-cave-300 hover:bg-cave-800'
              }`}
              title={t.def.describe(st, t.strength)}
              aria-pressed={armed}
              data-testid={`verb-${t.def.id}`}
              onClick={() => armTechnique(armed ? null : t.def.id)}
            >
              {cooling ? `${t.def.name} ${Math.ceil(t.readyInSec)}s` : t.def.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
