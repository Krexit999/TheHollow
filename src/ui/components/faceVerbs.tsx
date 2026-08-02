/**
 * THE FACE'S VERBS — a plain HTML row in the Dig panel.
 *
 * These used to be a floating pill drawn OVER the canvas, bottom-centre on a
 * phone and bottom-left on desktop. The player's word for it was "the chip
 * sweep skim thing", and they asked for it gone: a control strip parked on top
 * of the rock is in the way of the rock, and on desktop it stacked with the
 * Compendium button into a pile of floating chrome in one corner.
 *
 * SO THE BAR IS OFF THE CANVAS — BUT THE VERBS ARE NOT CUT. Sweep is a real
 * action with a stamina cost and Skim is Loam's signature technique; deleting
 * the only way to reach either would be deleting two mechanics under cover of a
 * UI complaint. They live here instead, in the room directly under the face,
 * as plain HTML like every other panel in the game.
 *
 * If the verbs themselves should go, that is a separate decision and a much
 * larger one — it reaches the signature layer.
 */
import { dispatch, useGame } from '../store';
import { SWEEP_COST_PER_CELL } from '../../engine/systems/face';
import { availableTechniques } from '../../engine/techniques';
import type { GameState } from '../../engine';

export function FaceVerbs() {
  const mode = useGame((s) => s.faceMode);
  const setFaceMode = useGame((s) => s.setFaceMode);
  const armedTechnique = useGame((s) => s.armedTechnique);
  const armTechnique = useGame((s) => s.armTechnique);
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;

  const stamina = st.face.stamina;
  const staminaMax = st.face.staminaMax || 100;
  const sweepCells = Math.floor(stamina / SWEEP_COST_PER_CELL);
  const techniques = availableTechniques(st);

  return (
    <div className="panel p-2.5" data-testid="face-verbs">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-cave-400">
          How you work it
        </span>
        {mode === 'sweep' && (
          <span className="tnum text-[10px] text-lamp-300" data-testid="sweep-budget">
            {sweepCells} cells of stamina
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        <button
          className={`min-h-[36px] flex-1 rounded-md px-2 text-xs font-semibold transition-colors ${
            mode === 'chip' ? 'bg-lamp-500/25 text-lamp-200' : 'text-cave-300 hover:bg-cave-800'
          }`}
          aria-pressed={mode === 'chip'}
          data-testid="verb-chip"
          onClick={() => setFaceMode('chip')}
        >
          Chip
        </button>
        <button
          className={`min-h-[36px] flex-1 rounded-md px-2 text-xs font-semibold transition-colors ${
            mode === 'sweep' ? 'bg-lamp-500/25 text-lamp-200' : 'text-cave-300 hover:bg-cave-800'
          }`}
          aria-pressed={mode === 'sweep'}
          data-testid="verb-sweep"
          onClick={() => setFaceMode('sweep')}
        >
          Sweep
        </button>
        {techniques.map((t) => {
          const cooling = t.readyInSec > 0;
          if (!t.def.targeted) {
            // A global verb (Skim): one press performs it.
            const pool = t.def.id === 'skim' ? st.face.seepPool : 0;
            return (
              <button
                key={t.def.id}
                className={`min-h-[36px] flex-1 rounded-md px-2 text-xs font-semibold transition-colors ${
                  pool >= 1 ? 'text-[#9fd8c0] hover:bg-cave-800' : 'text-cave-500'
                }`}
                title={t.def.describe(st, t.strength)}
                disabled={cooling}
                data-testid={`verb-${t.def.id}`}
                onClick={() => dispatch({ type: 'useTechnique', id: t.def.id })}
              >
                {t.def.name}{t.def.id === 'skim' && pool >= 1 ? ` ${Math.floor(pool)}` : ''}
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

      {mode === 'sweep' && (
        <div className="mt-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-cave-800">
            <div
              className="h-full rounded-full bg-lamp-400 transition-[width]"
              style={{ width: `${Math.round((stamina / staminaMax) * 100)}%` }}
            />
          </div>
          <div className="mt-0.5 text-[9px] leading-snug text-cave-500">
            Drag across the face to clear a swathe. It spends stamina, not charge.
          </div>
        </div>
      )}
    </div>
  );
}
