/**
 * THE FLOODGATE (§36.1) — plain HTML, on the SHAFT screen, under the Drifts.
 *
 * It sits beside shoring because they are the same verb pointed two ways: both
 * do something permanent TO a station on the Roll three inches above, and both
 * pay for it with the same thing — the re-roll that keeps the ladder from
 * becoming scenery.
 *
 * LAW 3. Nothing here until the gate's wreck has been walked to, and then only
 * the stations that will actually take the heat — never a list of everything
 * that might one day. The DESTINATION is the trade, and the panel states both
 * halves of it before you can press anything: what the place becomes, and what
 * it stops being.
 */
import { useState } from 'react';
import { useGame, dispatch } from '../store';
import { allUpgrades } from '../../engine/upgrades';
import { UpgradeRow } from './UpgradeRow';
import { Amount } from './shared';
import {
  floodBlocker, floodCost, floodable, floodgateBuilt, floodgateFound, floodgateStation,
  isFlooded,
} from '../../engine/systems/flood';
import { contentsOf, shellRoll } from '../../engine/systems/roll';
import { materialDef } from '../../engine/materials';
import { convCurrencyId } from '../../engine/shells';
import { currencyDef } from '../../engine/resources';
import type { GameState } from '../../engine';

function seamName(state: GameState, id: string): string {
  const seam = contentsOf(state, id).seam;
  if (!seam) return 'nothing';
  try { return materialDef(seam).name; } catch { return 'nothing'; }
}

export function FloodPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!state) return null;
  const st = state as GameState;

  const gateStation = floodgateStation(st);
  const raised = floodgateBuilt(st);
  // A shell that authors no flood station has no business showing this at all.
  const eligible = shellRoll(st).filter((d) => d.type === 'flood');
  if (eligible.length === 0) return null;
  if (!raised && !floodgateFound(st)) return null;

  const gateDef = allUpgrades().find((u) => u.id === 'floodgate');
  const drowned = eligible.filter((d) => isFlooded(st, d.id));
  const open = floodable(st);
  const convId = convCurrencyId(st);

  return (
    <div className="panel mt-2 p-3" data-testid="flood-panel">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-cave-300">The Floodgate</span>
        <span className="tnum text-[10px] text-cave-500" data-testid="flood-count">
          {drowned.length} of {eligible.length} drowned
        </span>
      </div>

      {!raised ? (
        <>
          <p className="text-[10px] leading-snug text-cave-500">
            It is still in the wreck at {gateStation?.name ?? 'the deep'}. Standing, it gives a
            station the whole bank at once — and that station is never the same place again.
          </p>
          {gateDef && <div className="mt-1.5"><UpgradeRow def={gateDef} /></div>}
        </>
      ) : (
        <>
          <p className="text-[10px] leading-snug text-cave-500">
            A drowned station keeps one seam forever and stops re-rolling. It also reads as a
            hazard for the rest of the game. There is no undoing it.
          </p>

          <div className="mt-2 space-y-1">
            {open.map((def) => {
              const cost = floodCost(def.depth);
              const blocked = floodBlocker(st, def.id);
              const armed = confirm === def.id;
              return (
                <div key={def.id} className="rounded border border-[#e0885a]/40 px-1.5 py-1"
                  data-testid={`flood-station-${def.id}`}>
                  <div className="flex items-baseline gap-2">
                    <span className="tnum w-9 shrink-0 text-right text-[10px] text-cave-500">{def.depth}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-cave-200">{def.name}</span>
                  </div>
                  {/*
                    BOTH HALVES OF THE TRADE, before the button. What it holds now
                    is what you are giving up (it will never roll again); what it
                    becomes is the hazard you are buying.
                  */}
                  <div className="mt-0.5 flex items-baseline gap-2 text-[9px]">
                    <span className="w-9 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-cave-500">
                      holds {seamName(st, def.id)} · becomes <span className="text-[#e0885a]">a hazard, forever</span>
                    </span>
                  </div>
                  <button
                    className="btn mt-1 flex w-full items-baseline gap-1.5 px-1.5 py-1 text-[10px] disabled:opacity-50"
                    disabled={blocked !== null}
                    title={blocked ?? undefined}
                    data-testid={`flood-${def.id}`}
                    onClick={() => {
                      if (!armed) { setConfirm(def.id); return; }
                      dispatch({ type: 'floodStation', stationId: def.id });
                      setConfirm(null);
                    }}
                  >
                    <span className="shrink-0">{armed ? 'Drown it — there is no undo' : 'Drown it'}</span>
                    <span className="min-w-0 flex-1 truncate text-right text-cave-400">
                      <Amount value={cost.conv} color={currencyDef(convId).color} className="text-[10px]" />
                      <span className="text-cave-600"> + {cost.parts} cast</span>
                    </span>
                  </button>
                  {blocked && <div className="mt-0.5 text-[9px] leading-snug text-cave-600">{blocked}</div>}
                </div>
              );
            })}
            {open.length === 0 && (
              <p className="text-[10px] italic text-cave-600">Everything that would take it has taken it.</p>
            )}
          </div>

          {drowned.length > 0 && (
            <div className="mt-2 border-t border-cave-800 pt-1.5">
              <div className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-cave-500">Drowned</div>
              {drowned.map((def) => (
                <div key={def.id} className="flex items-baseline gap-2 py-[1px] text-[10px]"
                  data-testid={`drowned-${def.id}`}>
                  <span className="tnum w-9 shrink-0 text-right text-cave-500">{def.depth}</span>
                  <span className="min-w-0 flex-1 truncate text-[#e0885a]">{def.name}</span>
                  <span className="shrink-0 text-[9px] text-cave-500">{seamName(st, def.id)} · fixed</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
