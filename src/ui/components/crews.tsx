/**
 * CREWS (§25.4) — plain HTML, in the Shaft room beside the drifts they walk.
 *
 * §25.4: "The fleet screen is not a log. It is a QUEUE OF JOBS THAT NEED YOUR
 * HANDS." So the findings are the panel and the crews are the header — not the
 * other way round — and every finding says what resolving it wants, which is
 * always some version of "you, down there".
 */
import { useGame, dispatch } from '../store';
import { MAX_CREWS, crewBlocker, crewsRead, readsNow } from '../../engine/systems/crews';
import type { GameState } from '../../engine';

export function CrewsPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;
  const r = crewsRead(st);
  // Nothing to say until there is a drift to walk. Shoring is the gate.
  if (r.drifts.length === 0 && r.rows.length === 0) return null;

  return (
    <div className="panel mt-2 p-3" data-testid="crews-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#9fc4dd]">Crews</span>
        <span className="tnum text-[10px] text-cave-400" data-testid="crews-count">
          {r.rows.length}/{r.slots} out · {r.open} finding{r.open === 1 ? '' : 's'}
        </span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        A crew carries the tool you built, the circuit you wrote and the kit you were wearing.
        It walks a drift alone and stops at everything a decision cannot cover.
      </p>

      {/* WHO IS DOWN THERE */}
      {r.rows.length > 0 && (
        <div className="mt-2 space-y-1" data-testid="crew-rows">
          {r.rows.map((row) => (
            <div
              key={row.id}
              className="rounded-md border border-cave-800 p-1.5"
              data-testid={`crew-${row.id}`}
              data-walking={row.walking ? '1' : '0'}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold text-cave-200" data-testid={`crew-${row.id}-name`}>
                  {row.name}
                </span>
                <span className="tnum shrink-0 text-[9px] text-cave-500">
                  tool {row.tier} · {row.reads} read{row.reads === 1 ? '' : 's'}
                </span>
              </div>
              {/* THE LOADOUT it walked out with — §25.4's third thing. */}
              <div className="mt-0.5 flex flex-wrap gap-1" data-testid={`crew-${row.id}-gear`}>
                {row.gear.length === 0 && (
                  <span className="text-[9px] text-cave-600">no kit — it went as it was</span>
                )}
                {row.gear.map((g) => (
                  <span
                    key={g.slot}
                    className="rounded border border-cave-800 px-1 py-0.5 text-[9px] text-cave-400"
                  >
                    {g.name}
                  </span>
                ))}
              </div>
              <div className="mt-0.5 text-[10px] leading-snug text-cave-400">
                {row.drift} — {row.at}
                {row.recalled && !row.walking ? ' · recalled' : ''}
                {row.recalled && row.walking ? ' · recalled, still working' : ''}
              </div>
              <div className="mt-1 flex gap-1">
                {!row.recalled && (
                  <button
                    className="btn flex-1 py-0.5 text-[10px]"
                    onClick={() => dispatch({ type: 'recallCrew', id: row.id })}
                    data-testid={`crew-${row.id}-recall`}
                  >
                    Call them up
                  </button>
                )}
                <button
                  className="btn flex-1 py-0.5 text-[10px]"
                  onClick={() => dispatch({ type: 'dismissCrew', id: row.id })}
                  data-testid={`crew-${row.id}-dismiss`}
                >
                  Stand them down
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* THE QUEUE. This is the panel; the rest is context. */}
      {r.open > 0 && (
        <div className="mt-2 border-t border-cave-800 pt-2" data-testid="findings">
          <div className="text-[9px] uppercase tracking-widest text-cave-500">
            What needs your hands
          </div>
          <div className="mt-1 space-y-1">
            {r.rows.flatMap((row) =>
              row.findings.map((f) => (
                <div
                  key={`${row.id}-${f.stationId}-${f.kind}`}
                  className="rounded border border-[#7a6a3a]/50 bg-[#1c1a10]/50 px-1.5 py-1"
                  data-testid={`finding-${f.kind}`}
                >
                  <div className="text-[10px] leading-snug text-[#d8c98a]">▸ {f.line}</div>
                  <div className="text-[9px] leading-snug text-cave-500">→ {f.wants}</div>
                </div>
              )),
            )}
          </div>
          <div className="mt-1 text-[9px] text-cave-500">
            Go and stand there. Nothing here is cleared by a button.
          </div>
        </div>
      )}

      {/* SENDING ONE */}
      {r.rows.length < MAX_CREWS && r.drifts.length > 0 && (
        <div className="mt-2 border-t border-cave-800 pt-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[9px] uppercase tracking-widest text-cave-500">Send one down</span>
            <span className="tnum text-[9px] text-cave-500" data-testid="crew-carries">
              carries your kit · {readsNow(st)} reads
            </span>
          </div>
          <div className="mt-1 space-y-1" data-testid="drift-rows">
            {r.drifts.map((d) => {
              const blocked = crewBlocker(st, d.id);
              return (
                <button
                  key={d.id}
                  className="w-full rounded-md border border-cave-800 p-1.5 text-left"
                  disabled={blocked !== null}
                  title={blocked ?? ''}
                  onClick={() => dispatch({ type: 'dispatchCrew', driftId: d.id })}
                  data-testid={`drift-${d.id}`}
                >
                  <div className="text-[11px] font-semibold text-cave-200">{d.name}</div>
                  <div className="text-[10px] leading-snug text-cave-400">
                    {blocked ?? 'Timbered. A crew can walk it.'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {r.resolved > 0 && (
        <div className="mt-1.5 text-[9px] text-cave-500" data-testid="crews-resolved">
          findings you have gone down and settled: {r.resolved}
        </div>
      )}
    </div>
  );
}
