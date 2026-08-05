/**
 * THE DEAD (§48.1) — the record, not a location.
 *
 * §48.3 is explicit that the Long Shelf is a RECORD: finding something enters
 * it permanently, using it never removes it, and display costs nothing because
 * what is displayed is the FACT that you found it. So there is no case to buy,
 * no slot, no set, and no completion bonus. There is a list of people you kept
 * running into and the things they left where they stopped.
 *
 * LAW 3 AND PILLAR 5 TOGETHER: a delver you have never met is not on this
 * screen at all. Not greyed, not "???", not a locked row with a silhouette —
 * absent. `trailRows` filters them out in the engine so the panel cannot be the
 * place that leaks the list, and the count reads "N found" rather than "N/37",
 * because a denominator turns a record into a checklist.
 *
 * WHERE THEY STOPPED IS NEVER PRINTED UNTIL THE ABSENCE IS WALKED. A closed
 * trail earns the epitaph; an open one shows only what is in hand and says
 * nothing about whether there is more. That is the mechanic, and putting the
 * shell name in a header would give it away in one glance.
 */
import { useGame } from '../store';
import { trailRows, foundCount } from '../../engine/systems/dead';
import type { GameState } from '../../engine';

export function DeadPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;
  const rows = trailRows(st);
  if (rows.length === 0) return null;

  return (
    <div className="panel mt-2 p-3" data-testid="dead-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#9fc4dd]">
          The Dead
        </span>
        <span className="tnum text-[10px] text-cave-400" data-testid="dead-found">
          {foundCount(st)} found
        </span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        You are not the first one down. Some of them got further than you have.
      </p>

      <div className="mt-2 space-y-2">
        {rows.map((r) => (
          <div
            key={r.delver.id}
            className="rounded-md border border-cave-700/70 bg-black/20 p-2"
            data-testid={`delver-${r.delver.id}`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold tracking-wide text-[#d8c98a]">
                {r.delver.name}
              </span>
              <span className="tnum shrink-0 text-[10px] text-cave-500">
                {r.objects.filter((o) => o.found).length}/{r.objects.length}
              </span>
            </div>
            <div className="text-[10px] leading-snug text-cave-500">— {r.delver.trade}</div>

            <div className="mt-1.5 space-y-1.5">
              {r.objects.map((x) =>
                x.found ? (
                  <div key={x.o.id} data-testid={`object-${x.o.id}`}>
                    <div className="flex items-baseline gap-1.5">
                      <span className="tnum shrink-0 text-[10px] text-cave-500">{x.depth}m</span>
                      <span className="text-[10px] font-medium text-cave-200">{x.o.name}</span>
                    </div>
                    <p className="pl-1 text-[10px] leading-snug text-cave-400">{x.o.line}</p>
                  </div>
                ) : (
                  /*
                   * A GAP, NOT A ROW. An object you have not found shows the
                   * depth it is lying at and nothing else — no name, no
                   * silhouette, no "undiscovered". You know there is more of
                   * this person somewhere and you are not told what or where.
                   */
                  <div
                    key={x.o.id}
                    className="flex items-baseline gap-1.5 text-cave-600"
                    data-testid={`object-gap-${x.o.id}`}
                  >
                    {/* NOT "— m". The first draft printed the depth's unit with
                        no depth in front of it, which read as a broken row
                        rather than a withheld one. Only the screenshot caught
                        it; every automated check passed. */}
                    <span className="shrink-0 text-[10px]">·</span>
                    <span className="text-[10px] italic">something else of theirs, somewhere</span>
                  </div>
                ),
              )}
            </div>

            {/* THE ABSENCE, once it has been walked. Never before. */}
            {r.closed && (
              <p
                className="mt-1.5 border-t border-cave-700/60 pt-1.5 text-[10px] leading-snug text-[#b9a98a] italic"
                data-testid={`epitaph-${r.delver.id}`}
              >
                {r.delver.epitaph}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
