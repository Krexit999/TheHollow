/**
 * THE INFUSER — INFUSION (§14.1), plain HTML, in THE PLANT cluster.
 *
 * LAW 3: the shelf of vials you are holding, and for the selected one, THE
 * STONES IT WILL GO INTO — destinations out of your own Hold, never the rule as
 * a table. The rule is stated once, in a sentence, and the refusals name it.
 *
 * The row states both halves of the trade before the button: what the stone
 * becomes, and whether it will end up carrying more than it was born with —
 * which is the thing that makes the tool shake (§11.4).
 */
import { useState } from 'react';
import { useGame, dispatch } from '../store';
import {
  TIER_CAPABILITY_INFUSER, infuseBlocker, infuserBuilt, infuserFound, infuserStation,
  infusedHeld, naturalTraits, nextInfuserTierCost, resultOf, targetsFor, vialsHeld,
} from '../../engine/systems/infuser';
import { MAX_MACHINE_TIER, tierOf } from '../../engine/systems/plant';
import { BAND_LABELS, materialDef } from '../../engine/materials';
import { traitsOf } from '../../engine/traits';
import type { GameState } from '../../engine';

function nameOf(id: string): string {
  try { return materialDef(id).name; } catch { return id; }
}

export function InfuserPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [pick, setPick] = useState(0);
  if (!state) return null;
  const st = state as GameState;

  const found = infuserFound(st);
  const built = infuserBuilt(st);
  if (!found && !built) return null;

  const tier = tierOf(st, 'infuser');
  const cost = nextInfuserTierCost(st);
  const rack = st.casting?.rack?.length ?? 0;
  const at = infuserStation();
  const vials = vialsHeld(st);
  const vial = vials[Math.min(pick, Math.max(0, vials.length - 1))];
  const targets = vial ? targetsFor(st, vial).slice(0, 8) : [];
  const made = infusedHeld(st);

  return (
    <div className="panel mt-2 p-3" data-testid="infuser-panel">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-cave-300">The Infuser</span>
        <span className="text-[10px] text-cave-500" data-testid="infuser-tier">
          {TIER_CAPABILITY_INFUSER[Math.min(tier, MAX_MACHINE_TIER)]}
        </span>
      </div>

      {!built ? (
        <>
          <p className="text-[10px] leading-snug text-cave-500">
            It is still in the wreck at {at?.name ?? 'the deep'}. Standing, it puts what a Still
            took out of one stone into another — which is the other half of every vial you are
            carrying.
          </p>
          <button
            className="btn mt-1.5 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
            disabled={cost === null || rack < cost}
            data-testid="build-infuser"
            onClick={() => dispatch({ type: 'buildInfuser' })}
          >
            Raise it — {cost ?? 0} cast parts <span className="text-cave-600">(rack holds {rack})</span>
          </button>
        </>
      ) : (
        <>
          {/* THE SHELF. */}
          {vials.length > 0 ? (
            <div className="flex flex-wrap gap-1" data-testid="vial-shelf">
              {vials.map((v, i) => (
                <button
                  key={`${v.trait}-${v.fromId}`}
                  className={`btn px-1.5 py-0.5 text-[10px] ${i === pick ? 'ring-1 ring-[#8fb3c9]' : ''}`}
                  data-testid={`vial-${v.trait}-${v.fromId}`}
                  onClick={() => setPick(i)}
                >
                  {v.trait} <span className="text-cave-600">×{v.count}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[10px] italic text-cave-600">
              No vials. The Still fills them — take something out of a stone first.
            </p>
          )}

          {vial && (
            <>
              <div className="mt-1 text-[9px] leading-snug text-cave-500" data-testid="vial-source">
                Drawn out of {nameOf(vial.fromId)}. Essence runs downhill: it will not go into
                anything rarer than that.
              </div>
              <div className="mt-1.5 space-y-1">
                {targets.map((t) => {
                  const blocked = infuseBlocker(st, vial, t.materialId, t.band);
                  const into = resultOf(t.materialId, vial.trait);
                  return (
                    <div
                      key={`${t.materialId}-${t.band}`}
                      className={`rounded border px-1.5 py-1 ${t.over ? 'border-[#e0885a]/50' : 'border-cave-800'}`}
                      data-testid={`infuse-row-${t.materialId}`}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-[11px] text-cave-200">{t.name}</span>
                        <span className="shrink-0 text-[9px] text-cave-500">
                          {BAND_LABELS[t.band]} · {t.count}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-[9px] text-cave-500">
                        {traitsOf(t.materialId).join(' + ') || 'nothing'} →{' '}
                        <span className="text-[#8fb3c9]">
                          {[...traitsOf(t.materialId), vial.trait].join(' + ')}
                        </span>
                        {t.over && (
                          <span className="text-[#e0885a]">
                            {' '}· more than it was born with ({naturalTraits(t.materialId)}) — the tool will shake
                          </span>
                        )}
                      </div>
                      <button
                        className="btn mt-1 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
                        disabled={blocked !== null}
                        title={blocked ?? undefined}
                        data-testid={`infuse-${t.materialId}`}
                        onClick={() => dispatch({
                          type: 'infuse', vial, materialId: t.materialId, band: t.band,
                        })}
                      >
                        Put the {vial.trait} in — becomes {nameOf(into)}
                      </button>
                    </div>
                  );
                })}
                {targets.length === 0 && (
                  <p className="text-[10px] italic text-cave-600" data-testid="infuse-empty">
                    Nothing in the Hold this vial will go into.
                  </p>
                )}
              </div>
            </>
          )}

          {made.length > 0 && (
            <div className="mt-2 border-t border-cave-800 pt-1.5" data-testid="infused-held">
              <div className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-cave-500">Infused</div>
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
              data-testid="build-infuser"
              onClick={() => dispatch({ type: 'buildInfuser' })}
            >
              {TIER_CAPABILITY_INFUSER[tier + 1]} — {cost} cast parts
              <span className="text-cave-600"> (rack holds {rack})</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
