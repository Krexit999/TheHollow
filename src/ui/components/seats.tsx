/**
 * THE SEVEN SEATS (§4) — plain HTML, at the Tool Station.
 *
 * §4's first sight, kept: seven rows, and before you have stood on a shell's
 * floor its row is a NUMERAL AND A DASH. No name, no material, no condition.
 * That is LAW 3 at full strength, and it is why the engine returns `known` per
 * row instead of letting this file decide what to hide.
 */
import { useGame, dispatch } from '../store';
import { seatsRead, recordReady, type SeatId } from '../../engine/systems/seats';
import type { GameState } from '../../engine';

export function SeatsPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;
  const r = seatsRead(st);
  if (!r.open) return null;

  return (
    <div className="panel mt-2 p-3" data-testid="seats-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#d8c98a]">The Seven Seats</span>
        <span className="tnum text-[10px] text-cave-400" data-testid="seats-filled">{r.filled}/7</span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        The world is an unfinished tool. Seven outlines, and nothing tells you what one wants
        until you are standing on it.
      </p>

      <div className="mt-2 space-y-1" data-testid="seat-rows">
        {r.rows.map((row) => (
          <div
            key={row.id}
            className={`rounded-md border p-1.5 ${
              row.seated ? 'border-[#d8c98a] bg-[#22200f]' : row.known ? 'border-cave-800' : 'border-cave-900'
            }`}
            data-testid={`seat-${row.id}`}
            data-known={row.known ? '1' : '0'}
            data-seated={row.seated ? '1' : '0'}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span
                className="text-[11px] font-semibold"
                style={{ color: row.seated ? '#e8dcae' : row.known ? '#c9c2b6' : '#5c564c' }}
                data-testid={`seat-${row.id}-name`}
              >
                {row.name}
              </span>
              {row.known && (
                <span className="tnum shrink-0 text-[9px] text-cave-500" data-testid={`seat-${row.id}-material`}>
                  {row.material}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[10px] leading-snug text-cave-400" data-testid={`seat-${row.id}-sits`}>
              {row.seated ? row.flavor : row.sits}
            </div>
            {row.seated && (
              <div className="mt-0.5 text-[10px] leading-snug text-[#9ac07a]" data-testid={`seat-${row.id}-keeps`}>
                {row.keeps}
              </div>
            )}
            {!row.seated && row.known && (
              <button
                className="btn mt-1 w-full py-1 text-[10px]"
                disabled={row.waiting !== null}
                title={row.waiting ?? ''}
                onClick={() => dispatch({ type: 'seatPart', seat: row.id as SeatId })}
                data-testid={`seat-${row.id}-seat`}
              >
                {row.waiting ?? `Seat it — ${row.ready} on the rack`}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* THE RECORD. The one part that is not cast — §4's "the last component of
          the longest craft in the game is HAVING PLAYED". */}
      {!r.record && (
        <div className="mt-2 border-t border-cave-800 pt-2" data-testid="record-card">
          <div className="text-[9px] uppercase tracking-widest text-cave-500">The Record</div>
          <div className="mt-0.5 text-[10px] leading-snug text-cave-400">
            It cannot be mined, refined, reacted or transmuted. It is made out of what you have done.
          </div>
          {r.recordShort.length > 0 && (
            <div className="mt-1 space-y-0.5" data-testid="record-short">
              {r.recordShort.map((line) => (
                <div key={line} className="text-[10px] text-cave-500">{line}</div>
              ))}
            </div>
          )}
          <button
            className="btn mt-1 w-full py-1 text-[10px]"
            disabled={!recordReady(st)}
            onClick={() => dispatch({ type: 'makeRecord' })}
            data-testid="record-make"
          >
            {recordReady(st) ? 'Write it down' : 'Not yet'}
          </button>
        </div>
      )}
    </div>
  );
}
