/**
 * THE STILL — ESSENCE WORK (§14.1, §16.3), plain HTML, in THE PLANT cluster.
 *
 * LAW 3: it lists what is ON THE BENCH — stock you are holding that this Still
 * would take — and never a catalogue of every pair the machine will ever
 * handle. A trap's own named fault sorts to the top, because that is the lesson
 * §16.3 says has been waiting since era I.
 *
 * The row states the DESTINATION before the button: what the stone becomes, and
 * what it stops being.
 */
import { useGame, dispatch } from '../store';
import {
  TIER_CAPABILITY_STILL, distilBlocker, distillable, nextStillTierCost, stillBuilt,
  stillFound, stillStation, stilledHeld,
} from '../../engine/systems/still';
import { stilledId } from '../../engine/content/traps';
import { MAX_MACHINE_TIER, tierOf } from '../../engine/systems/plant';
import { BAND_LABELS, materialDef } from '../../engine/materials';
import { traitsOf } from '../../engine/traits';
import type { GameState } from '../../engine';

function nameOf(id: string): string {
  try { return materialDef(id).name; } catch { return id; }
}

export function StillPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;

  const found = stillFound(st);
  const built = stillBuilt(st);
  if (!found && !built) return null;

  const tier = tierOf(st, 'still');
  const cost = nextStillTierCost(st);
  const rack = st.casting?.rack?.length ?? 0;
  const at = stillStation();
  const bench = distillable(st).slice(0, 8);
  const made = stilledHeld(st);

  return (
    <div className="panel mt-2 p-3" data-testid="still-panel">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-cave-300">The Still</span>
        <span className="text-[10px] text-cave-500" data-testid="still-tier">
          {TIER_CAPABILITY_STILL[Math.min(tier, MAX_MACHINE_TIER)]}
        </span>
      </div>

      {!built ? (
        <>
          <p className="text-[10px] leading-snug text-cave-500">
            It is still in the wreck at {at?.name ?? 'the deep'}. Standing, it takes one thing
            out of a stone and leaves the rest — which is the answer to every stone that looks
            perfect and is not.
          </p>
          <button
            className="btn mt-1.5 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
            disabled={cost === null || rack < cost}
            data-testid="build-still"
            onClick={() => dispatch({ type: 'buildStill' })}
          >
            Raise it — {cost ?? 0} cast parts <span className="text-cave-600">(rack holds {rack})</span>
          </button>
        </>
      ) : (
        <>
          <div className="space-y-1">
            {bench.map((d) => {
              const blocked = distilBlocker(st, d.materialId, d.band, d.trait);
              const into = stilledId(d.materialId, d.trait);
              const left = traitsOf(d.materialId).filter((t) => t !== d.trait);
              return (
                <div
                  key={`${d.materialId}-${d.band}-${d.trait}`}
                  className={`rounded border px-1.5 py-1 ${d.named ? 'border-[#c9a86a]/50' : 'border-cave-800'}`}
                  data-testid={`distil-row-${d.materialId}-${d.trait}`}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-cave-200">
                      {nameOf(d.materialId)}
                    </span>
                    <span className="shrink-0 text-[9px] text-cave-500">
                      {BAND_LABELS[d.band]} · {d.count}
                    </span>
                  </div>
                  {/* BOTH HALVES OF THE TRADE, before the button. */}
                  <div className="mt-0.5 truncate text-[9px] text-cave-500">
                    loses <span className="text-[#e0885a]">{d.trait}</span> · keeps {left.join(' + ') || 'nothing'}
                    {d.named && <span className="text-[#c9a86a]"> · the one thing wrong with it</span>}
                  </div>
                  <button
                    className="btn mt-1 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
                    disabled={blocked !== null}
                    title={blocked ?? undefined}
                    data-testid={`distil-${d.materialId}-${d.trait}`}
                    onClick={() => dispatch({
                      type: 'distil', materialId: d.materialId, band: d.band, trait: d.trait,
                    })}
                  >
                    Take the {d.trait} out — becomes {nameOf(into)}
                  </button>
                  {blocked && <div className="mt-0.5 text-[9px] leading-snug text-cave-600">{blocked}</div>}
                </div>
              );
            })}
            {bench.length === 0 && (
              <p className="text-[10px] italic text-cave-600">
                Nothing on the bench this Still will take. It wants pure stone with something
                wrong with it.
              </p>
            )}
          </div>

          {made.length > 0 && (
            <div className="mt-2 border-t border-cave-800 pt-1.5" data-testid="stilled-held">
              <div className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-cave-500">Stilled</div>
              {made.map((m) => (
                <div key={m.id} className="flex items-baseline gap-2 py-[1px] text-[10px]">
                  <span className="min-w-0 flex-1 truncate text-cave-200">{nameOf(m.id)}</span>
                  <span className="tnum shrink-0 text-cave-500">{m.count}</span>
                </div>
              ))}
            </div>
          )}

          {cost !== null && (
            <button
              className="btn mt-2 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
              disabled={rack < cost}
              data-testid="build-still"
              onClick={() => dispatch({ type: 'buildStill' })}
            >
              {TIER_CAPABILITY_STILL[tier + 1]} — {cost} cast parts
              <span className="text-cave-600"> (rack holds {rack})</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
