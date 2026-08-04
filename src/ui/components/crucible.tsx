/**
 * THE ALLOY CRUCIBLE — ALLOYING (§14.2), plain HTML, in THE PLANT cluster.
 *
 * LAW 3: it lists METALS YOU HOLD and shows the DESTINATION of the pour you
 * have built — what it would be, and what it would be made of — never a recipe
 * book. A ratio that will come out grog says so before you press it, because
 * the lesson §14.2 wants is "that was not a ratio", not "that was not on the
 * list".
 */
import { useState } from 'react';
import { useGame, dispatch } from '../store';
import {
  POUR_MAX_UNITS, TIER_CAPABILITY_CRUCIBLE, alloysFound, crucibleBuilt, crucibleFound,
  crucibleStation, ensureCrucible, metalLimit, nextCrucibleTierCost, pourBlocker, pourPreview,
  type PourPart,
} from '../../engine/systems/crucible';
import { MAX_MACHINE_TIER, tierOf } from '../../engine/systems/plant';
import { materialDef } from '../../engine/materials';
import { materialCount } from '../../engine/systems/forge';
import { traitsOf } from '../../engine/traits';
import type { GameState } from '../../engine';

function nameOf(id: string): string {
  try { return materialDef(id).name; } catch { return id; }
}

/** Ordinary stone the Hold is actually holding — never a catalogue. */
function metalsHeld(st: GameState): string[] {
  return Object.keys(st.materials?.stacks ?? {})
    .filter((id) => {
      try {
        const d = materialDef(id);
        return !d.worked && d.source !== 'alloy' && materialCount(st, id) > 0
          && traitsOf(id).length > 0;
      } catch { return false; }
    })
    .sort((a, b) => materialCount(st, b) - materialCount(st, a))
    .slice(0, 10);
}

export function CruciblePanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [parts, setParts] = useState<PourPart[]>([]);
  if (!state) return null;
  const st = state as GameState;

  const found = crucibleFound(st);
  const built = crucibleBuilt(st);
  if (!found && !built) return null;

  const tier = tierOf(st, 'crucible');
  const cost = nextCrucibleTierCost(st);
  const rack = st.casting?.rack?.length ?? 0;
  const at = crucibleStation();
  const limit = metalLimit(st);
  const preview = parts.length >= 2 ? pourPreview(st, parts) : null;
  const blocked = parts.length >= 2 ? pourBlocker(st, parts) : 'Pick two metals.';
  const c = ensureCrucible(st);
  const known = alloysFound(st);

  const bump = (id: string, by: number): void => {
    setParts((prev) => {
      const next = prev.map((p) => ({ ...p }));
      const at2 = next.findIndex((p) => p.materialId === id);
      if (at2 < 0) {
        if (by <= 0 || next.length >= limit) return prev;
        next.push({ materialId: id, count: 1 });
        return next;
      }
      next[at2]!.count += by;
      return next.filter((p) => p.count > 0);
    });
  };

  return (
    <div className="panel mt-2 p-3" data-testid="crucible-panel">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-cave-300">The Alloy Crucible</span>
        <span className="text-[10px] text-cave-500" data-testid="crucible-tier">
          {TIER_CAPABILITY_CRUCIBLE[Math.min(tier, MAX_MACHINE_TIER)]}
        </span>
      </div>

      {!built ? (
        <>
          <p className="text-[10px] leading-snug text-cave-500">
            It is still in the wreck at {at?.name ?? 'the deep'}. Standing, it pours two metals
            into a third that is not in the ground anywhere.
          </p>
          <button
            className="btn mt-1.5 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
            disabled={cost === null || rack < cost}
            data-testid="build-crucible"
            onClick={() => dispatch({ type: 'buildCrucible' })}
          >
            Raise it — {cost ?? 0} cast parts <span className="text-cave-600">(rack holds {rack})</span>
          </button>
        </>
      ) : (
        <>
          <div className="rounded border border-cave-800 px-1.5 py-1">
            <div className="mb-1 flex items-baseline justify-between text-[9px] uppercase tracking-widest text-cave-500">
              <span>The pour</span>
              <span className="text-cave-600">{limit} metals · {POUR_MAX_UNITS} units</span>
            </div>
            {metalsHeld(st).map((id) => {
              const inPour = parts.find((p) => p.materialId === id)?.count ?? 0;
              return (
                <div key={id} className="flex items-baseline gap-1 py-[1px]" data-testid={`metal-${id}`}>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-cave-300">{nameOf(id)}</span>
                  <span className="shrink-0 text-[9px] text-cave-600">{traitsOf(id).join('+')}</span>
                  <span className="tnum w-6 shrink-0 text-right text-[10px] text-cave-200">{inPour}</span>
                  <button className="btn shrink-0 px-1 py-0 text-[10px]" data-testid={`less-${id}`}
                    onClick={() => bump(id, -1)}>−</button>
                  <button className="btn shrink-0 px-1 py-0 text-[10px]" data-testid={`more-${id}`}
                    onClick={() => bump(id, +1)}>+</button>
                </div>
              );
            })}
          </div>

          {/* THE DESTINATION, both halves, before the button. */}
          {preview && (
            <div className="mt-1.5 rounded border border-cave-800 px-1.5 py-1 text-[10px]"
              data-testid="pour-preview">
              {preview.ok ? (
                <>
                  <span className="text-cave-200">{preview.name}</span>
                  <span className="text-cave-500"> · {preview.traits.join(' + ')}</span>
                  <div className="text-[9px] text-cave-600">
                    {preview.units} units in, one out · {preview.rarity} (the worst metal's)
                  </div>
                </>
              ) : (
                <span className="text-[#e0885a]">{preview.reason}</span>
              )}
            </div>
          )}

          <button
            className="btn mt-1.5 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
            disabled={blocked !== null}
            title={blocked ?? undefined}
            data-testid="pour"
            onClick={() => { dispatch({ type: 'pour', parts }); setParts([]); }}
          >
            Pour it
          </button>
          {blocked && parts.length >= 2 && (
            <div className="mt-0.5 text-[9px] leading-snug text-cave-600">{blocked}</div>
          )}

          {(known.length > 0 || c.grog > 0) && (
            <div className="mt-2 border-t border-cave-800 pt-1.5" data-testid="alloys-found">
              <div className="mb-1 flex items-baseline justify-between text-[9px] uppercase tracking-widest text-cave-500">
                <span>Poured</span>
                <span className="text-cave-600">{c.grog} grog</span>
              </div>
              {known.map((a) => (
                <div key={a.id} className="flex items-baseline gap-2 py-[1px] text-[10px]">
                  <span className="min-w-0 flex-1 truncate text-cave-200">{a.name}</span>
                  <span className="shrink-0 text-[9px] text-cave-500">{a.traits.length} traits</span>
                </div>
              ))}
            </div>
          )}

          {cost !== null && (
            <button
              className="btn mt-2 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
              disabled={rack < cost}
              data-testid="build-crucible"
              onClick={() => dispatch({ type: 'buildCrucible' })}
            >
              {TIER_CAPABILITY_CRUCIBLE[tier + 1]} — {cost} cast parts
              <span className="text-cave-600"> (rack holds {rack})</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
