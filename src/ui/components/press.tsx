/**
 * THE PRESS — DRAWING (§13), plain HTML, in THE PLANT cluster.
 *
 * LAW 3: the stone you HOLD enough of to make a billet, and the forms this
 * Press can draw. The destination is stated on the button — what the stock
 * becomes, and which shape it is the only route to — never a table of every
 * pair the machine will ever handle.
 */
import { useState } from 'react';
import { useGame, dispatch } from '../store';
import {
  BILLET_UNITS, FORMS, TIER_CAPABILITY_PRESS, drawable, formsAvailable, nextPressTierCost,
  pressBlocker, pressBuilt, pressFound, pressStation, stockHeld, type StockForm,
} from '../../engine/systems/press';
import { MAX_MACHINE_TIER, tierOf } from '../../engine/systems/plant';
import { BAND_LABELS, materialDef } from '../../engine/materials';
import { SHAPE_BY_ID } from '../../engine/content/forgeParts';
import type { GameState } from '../../engine';

function nameOf(id: string): string {
  try { return materialDef(id).name; } catch { return id; }
}

export function PressPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [form, setForm] = useState<StockForm>('plate');
  if (!state) return null;
  const st = state as GameState;

  const found = pressFound(st);
  const built = pressBuilt(st);
  if (!found && !built) return null;

  const tier = tierOf(st, 'press');
  const cost = nextPressTierCost(st);
  const rack = st.casting?.rack?.length ?? 0;
  const at = pressStation();
  const forms = formsAvailable(st);
  const pick = forms.some((f) => f.id === form) ? form : (forms[0]?.id ?? 'plate');
  const def = FORMS.find((f) => f.id === pick)!;
  const bench = drawable(st).slice(0, 6);
  const held = stockHeld(st);

  return (
    <div className="panel mt-2 p-3" data-testid="press-panel">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-cave-300">The Press</span>
        <span className="text-[10px] text-cave-500" data-testid="press-tier">
          {TIER_CAPABILITY_PRESS[Math.min(tier, MAX_MACHINE_TIER)]}
        </span>
      </div>

      {!built ? (
        <>
          <p className="text-[10px] leading-snug text-cave-500">
            It is still in the wreck at {at?.name ?? 'the deep'}. Standing, it works stone into
            plate, rod and wire — and three shapes in this game are worked, not poured.
          </p>
          <button
            className="btn mt-1.5 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
            disabled={cost === null || rack < cost}
            data-testid="build-press"
            onClick={() => dispatch({ type: 'buildPress' })}
          >
            Raise it — {cost ?? 0} cast parts <span className="text-cave-600">(rack holds {rack})</span>
          </button>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-1" data-testid="form-picker">
            {forms.map((f) => (
              <button
                key={f.id}
                className={`btn px-1.5 py-0.5 text-[10px] ${f.id === pick ? 'ring-1 ring-[#c9a86a]' : ''}`}
                data-testid={`form-${f.id}`}
                onClick={() => setForm(f.id)}
              >
                {f.name}
              </button>
            ))}
          </div>
          <div className="mt-1 text-[9px] leading-snug text-cave-500" data-testid="form-blurb">
            {def.blurb} It is the only route to the{' '}
            <span className="text-cave-300">{SHAPE_BY_ID.get(def.shape)?.name ?? def.shape}</span>{' '}
            {SHAPE_BY_ID.get(def.shape)?.part}.
          </div>

          <div className="mt-1.5 space-y-1">
            {bench.map((d) => {
              const blocked = pressBlocker(st, d.materialId, d.band, pick);
              return (
                <div
                  key={`${d.materialId}-${d.band}`}
                  className="rounded border border-cave-800 px-1.5 py-1"
                  data-testid={`press-row-${d.materialId}`}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-cave-200">{d.name}</span>
                    <span className="shrink-0 text-[9px] text-cave-500">
                      {BAND_LABELS[d.band]} · {d.count}
                    </span>
                  </div>
                  <button
                    className="btn mt-1 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
                    disabled={blocked !== null}
                    title={blocked ?? undefined}
                    data-testid={`press-${d.materialId}`}
                    onClick={() => dispatch({
                      type: 'press', materialId: d.materialId, band: d.band, form: pick,
                    })}
                  >
                    Draw {BILLET_UNITS} → one {d.name} {def.name}
                  </button>
                  {blocked && <div className="mt-0.5 text-[9px] leading-snug text-cave-600">{blocked}</div>}
                </div>
              );
            })}
            {bench.length === 0 && (
              <p className="text-[10px] italic text-cave-600">
                Nothing to draw. A billet is {BILLET_UNITS} units of one stone at one band.
              </p>
            )}
          </div>

          {held.length > 0 && (
            <div className="mt-2 border-t border-cave-800 pt-1.5" data-testid="stock-held">
              <div className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-cave-500">Stock</div>
              {held.map((s) => (
                <div key={s.id} className="flex items-baseline gap-2 py-[1px] text-[10px]">
                  <span className="min-w-0 flex-1 truncate text-cave-200">{nameOf(s.id)}</span>
                  <span className="tnum shrink-0 text-cave-500">{s.count}</span>
                </div>
              ))}
              <div className="mt-1 text-[9px] leading-snug text-cave-600">
                Charge it into the tub like any stone. The worked shapes will only take it.
              </div>
            </div>
          )}

          {cost !== null && (
            <button
              className="btn mt-2 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
              disabled={rack < cost}
              data-testid="build-press"
              onClick={() => dispatch({ type: 'buildPress' })}
            >
              {TIER_CAPABILITY_PRESS[tier + 1]} — {cost} cast parts
              <span className="text-cave-600"> (rack holds {rack})</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
