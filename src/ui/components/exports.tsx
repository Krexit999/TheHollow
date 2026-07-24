/**
 * THE EXPORT SPINE, on screen (Part B) — two small shared pieces:
 *
 *  - ExportProduceRow: a named production row for the four bench-made exports
 *    (Lodeframe, Set Resin, Ground Lens, Glasseal): what it costs, how many
 *    you hold, what downstream wants it, one button. Rule 5 (A.37): systems
 *    say what they do.
 *  - InstallButton: the consuming side's verb (frame a bed, brace the loom,
 *    socket a row) with the export named, the held count shown, and the
 *    engine's own refusal surfaced verbatim when it refuses.
 *
 * Every consumer's failure reason already names its export and BOTH roads to
 * one (make it in its home shell / buy it from Serra) — these components put
 * the same facts on screen before the refusal, not after.
 */
import { useState } from 'react';
import { getCurrency } from '../../engine';
import { materialDef } from '../../engine/materials';
import { materialCount } from '../../engine/systems/forge';
import { EXPORT_RECIPE_BY_ID, EXPORT_BY_MATERIAL } from '../../engine/content/exports';
import type { GameAction, GameState } from '../../engine/types';
import { dispatch, useGame } from '../store';
import { Amount } from './shared';
import { D } from '../../engine/decimal';

export function ExportProduceRow({ materialId }: { materialId: string }) {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [note, setNote] = useState<string | null>(null);
  if (!state) return null;
  const recipe = EXPORT_RECIPE_BY_ID.get(materialId);
  const meta = EXPORT_BY_MATERIAL.get(materialId);
  if (!recipe || !meta || !recipe.unlocked(state as GameState)) return null;
  const def = materialDef(materialId);
  const held = materialCount(state as GameState, materialId);
  const affordable = recipe.costs.every((c) => getCurrency(state as GameState, c.currencyId).gte(c.amount));

  return (
    <div className="rounded border border-cave-700/60 bg-cave-900/40 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-cave-200">
            {def.name} <span className="tnum font-normal text-cave-500">· held {held}</span>
          </div>
          <div className="mt-0.5 text-[10px] leading-snug text-cave-400">Wanted by {meta.consumedBy}.</div>
        </div>
        <button
          className="btn shrink-0 px-2.5 py-1 text-[11px]"
          disabled={!affordable}
          onClick={() => {
            const r = dispatch({ type: 'produceExport', id: materialId });
            setNote(r.ok ? null : (r.reason ?? null));
          }}
        >
          Make ·{' '}
          {recipe.costs.map((c, i) => (
            <span key={c.currencyId}>
              {i > 0 && ' + '}
              <Amount value={D(c.amount)} color="#b8c4d4" /> {c.currencyId}
            </span>
          ))}
        </button>
      </div>
      {note && <div className="mt-1 text-[10px] text-[#d4a86a]">{note}</div>}
    </div>
  );
}

/** The consuming verb: shows the export it will spend and how many are held;
 *  surfaces the engine's refusal (which names both roads to the export). */
export function InstallButton({
  action, label, exportId, count = 1, disabled,
}: {
  action: GameAction; label: string; exportId: string; count?: number; disabled?: boolean;
}) {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [note, setNote] = useState<string | null>(null);
  if (!state) return null;
  const held = materialCount(state as GameState, exportId);
  const def = materialDef(exportId);

  return (
    <div>
      <button
        className="btn w-full px-2.5 py-1.5 text-[11px]"
        disabled={disabled || held < count}
        onClick={() => {
          const r = dispatch(action);
          setNote(r.ok ? null : (r.reason ?? null));
        }}
      >
        {label} · {count} {def.name} <span className="tnum text-cave-500">(held {held})</span>
      </button>
      {note && <div className="mt-1 text-[10px] text-[#d4a86a]">{note}</div>}
    </div>
  );
}
