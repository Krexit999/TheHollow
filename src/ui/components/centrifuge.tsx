/**
 * THE CENTRIFUGE — SEPARATION (§13), plain HTML, in THE PLANT cluster.
 *
 * LAW 3: the ore you HOLD enough of, and what each one comes apart into. Never
 * the eleven-row split table — a player finds out what a stone is made of by
 * putting it in the drum, which is the only way anyone ever has.
 */
import { useGame, dispatch } from '../store';
import {
  TIER_CAPABILITY_CENTRIFUGE, centrifugeBuilt, centrifugeFound, centrifugeStation,
  fullSeparation, spinBlocker, spinnable, takesWorked,
} from '../../engine/systems/centrifuge';
import { MAX_MACHINE_TIER, TIER_PART_COST, tierOf } from '../../engine/systems/plant';
import { BAND_LABELS, materialDef } from '../../engine/materials';
import { SPLIT_BY_ORE } from '../../engine/content/splits';
import type { GameState } from '../../engine';

function nameOf(id: string): string {
  try { return materialDef(id).name; } catch { return id; }
}

export function CentrifugePanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;

  const found = centrifugeFound(st);
  const built = centrifugeBuilt(st);
  if (!found && !built) return null;

  const tier = tierOf(st, 'centrifuge');
  const cost = tier >= MAX_MACHINE_TIER ? null : (TIER_PART_COST[tier + 1] ?? null);
  const rack = st.casting?.rack?.length ?? 0;
  const rows = spinnable(st).slice(0, 6);

  return (
    <div className="panel mt-2 p-3" data-testid="centrifuge-panel">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-cave-300">The Centrifuge</span>
        <span className="text-[10px] text-cave-500" data-testid="centrifuge-tier">
          {TIER_CAPABILITY_CENTRIFUGE[Math.min(tier, MAX_MACHINE_TIER)]}
        </span>
      </div>

      {!built ? (
        <>
          <p className="text-[10px] leading-snug text-cave-500">
            It is still in the wreck at {centrifugeStation()?.name ?? 'the deep'}. It turned until
            things came apart into what they had been all along.
          </p>
          <button
            className="btn mt-1.5 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
            disabled={cost === null || rack < cost}
            data-testid="build-centrifuge"
            onClick={() => dispatch({ type: 'buildCentrifuge' })}
          >
            Raise it — {cost ?? 0} cast parts <span className="text-cave-600">(rack holds {rack})</span>
          </button>
        </>
      ) : (
        <>
          <div className="space-y-1">
            {rows.map((r) => {
              const blocked = spinBlocker(st, r.materialId, r.band);
              const def = SPLIT_BY_ORE.get(r.materialId);
              return (
                <div key={`${r.materialId}-${r.band}`} className="rounded border border-cave-800 px-1.5 py-1"
                  data-testid={`spin-row-${r.materialId}`}>
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-cave-200">{r.name}</span>
                    <span className="shrink-0 text-[9px] text-cave-500">
                      {BAND_LABELS[r.band]} · {r.count}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[9px] text-cave-500">
                    → <span className="text-[#8fb3c9]">{r.out.map(nameOf).join(' + ')}</span>
                    {!fullSeparation(st) && (def?.out.length ?? 0) > 1 && (
                      <span className="text-cave-600"> · the rest stays in the drum</span>
                    )}
                  </div>
                  <div className="text-[9px] italic leading-snug text-cave-600">{r.line}</div>
                  <button
                    className="btn mt-1 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
                    disabled={blocked !== null}
                    title={blocked ?? undefined}
                    data-testid={`spin-${r.materialId}`}
                    onClick={() => dispatch({ type: 'spin', materialId: r.materialId, band: r.band })}
                  >
                    Spin {def?.units ?? 3} {r.name}
                  </button>
                  {blocked && <div className="mt-0.5 text-[9px] leading-snug text-cave-600">{blocked}</div>}
                </div>
              );
            })}
            {rows.length === 0 && (
              <p className="text-[10px] italic text-cave-600">
                Nothing in the Hold this drum can take apart. It wants ore, three at a time, at
                one band.
              </p>
            )}
          </div>

          {!takesWorked(st) && (
            <div className="mt-1 text-[9px] leading-snug text-cave-600">
              This drum takes ore. Worked stock comes later.
            </div>
          )}

          {cost !== null && (
            <button
              className="btn mt-2 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
              disabled={rack < cost}
              data-testid="build-centrifuge"
              onClick={() => dispatch({ type: 'buildCentrifuge' })}
            >
              {TIER_CAPABILITY_CENTRIFUGE[tier + 1]} — {cost} cast parts
              <span className="text-cave-600"> (rack holds {rack})</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
