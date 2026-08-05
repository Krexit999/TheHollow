/**
 * THE CASTING FLOOR — SPECIFYING (§31.2), plain HTML, on the floor that casts.
 *
 * Three bands, one defect, and a Codex of the grammar the Floor has refused
 * you. LAW 3 — the grammar is never listed up front; a line only appears here
 * once the Floor has said it to your face.
 */
import { useGame, dispatch } from '../store';
import {
  DEFECT_DEFS, GRAMMAR, specRead, specifyingOpen, type DefectId,
} from '../../engine/systems/specify';
import type { GameState } from '../../engine';

export function SpecifyPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;
  if (!specifyingOpen(st)) return null;
  const r = specRead(st);

  return (
    <div className="panel mt-2 p-3" data-testid="specify-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#9fc4dd]">Specifying</span>
        <span className="tnum text-[10px] text-cave-400" data-testid="specify-state">
          {r.live ? 'a world is live' : `${r.poured} poured`}
        </span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        Three depths, and whose physics run in each. It will be wrong somewhere — that is the
        price of it being yours.
      </p>

      <div className="mt-2 space-y-1" data-testid="specify-bands">
        {r.rows.map((row) => (
          <div key={row.band} className="rounded-md border border-cave-800 p-1.5" data-testid={`band-${row.band}`}>
            <div className="flex items-baseline justify-between">
              <span className="tnum text-[10px] text-cave-500">{row.from}–{row.to}</span>
              <span
                className="text-[11px] font-semibold"
                style={{ color: row.shellId ? '#bcd8ee' : '#6c6459' }}
                data-testid={`band-${row.band}-shell`}
              >
                {row.name}
              </span>
            </div>
            {!r.live && (
              <div className="mt-1 flex flex-wrap gap-1">
                {r.assignable.map((sh) => (
                  <button
                    key={sh.id}
                    className={`rounded border px-1 py-0.5 text-[9px] ${
                      row.shellId === sh.id ? 'border-[#9fc4dd] text-[#bcd8ee]' : 'border-cave-800 text-cave-500'
                    }`}
                    onClick={() => dispatch({
                      type: 'setSpecBand', band: row.band,
                      shellId: row.shellId === sh.id ? null : sh.id,
                    })}
                    data-testid={`band-${row.band}-${sh.id}`}
                  >
                    {sh.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 border-t border-cave-800 pt-2">
        <div className="text-[9px] uppercase tracking-widest text-cave-500">One thing wrong with it</div>
        <div className="mt-1 space-y-1" data-testid="specify-defects">
          {r.defects.length === 0 && (
            <div className="text-[10px] text-cave-500">
              Nothing you do can be made worse yet. Run some machines.
            </div>
          )}
          {r.defects.map((d) => (
            <button
              key={d.id}
              className={`w-full rounded-md border p-1.5 text-left ${
                d.on ? 'border-[#9fc4dd] bg-[#16242e]' : 'border-cave-800'
              }`}
              disabled={r.live}
              onClick={() => dispatch({ type: 'setSpecDefect', defect: (d.on ? null : d.id) as DefectId | null })}
              data-testid={`defect-${d.id}`}
            >
              <div className="text-[11px] font-semibold" style={{ color: d.on ? '#bcd8ee' : '#c9c2b6' }}>
                {d.name}{d.on ? ' ✓' : ''}
              </div>
              <div className="text-[10px] leading-snug text-cave-400">{d.costs}</div>
            </button>
          ))}
          {DEFECT_DEFS.length > r.defects.length && (
            <div className="text-[9px] text-cave-500" data-testid="defect-hidden">
              {DEFECT_DEFS.length - r.defects.length} more, about things you do not do.
            </div>
          )}
        </div>
      </div>

      {r.live ? (
        <button
          className="btn mt-2 w-full py-1.5 text-xs"
          onClick={() => dispatch({ type: 'endSpecified' })}
          data-testid="specify-end"
        >
          Walk out of it — the specification stays written
        </button>
      ) : (
        <button
          className="btn btn-warm mt-2 w-full py-1.5 text-xs"
          disabled={r.pour !== null}
          title={r.pour ?? ''}
          onClick={() => dispatch({ type: 'pourSpecified' })}
          data-testid="specify-pour"
        >
          {r.pour ?? 'POUR IT — and go and stand in it'}
        </button>
      )}

      {/* THE GRAMMAR, learned by being refused. Never listed before then. */}
      <div className="mt-2 border-t border-cave-800 pt-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[9px] uppercase tracking-widest text-cave-500">What it will not do</span>
          <span className="tnum text-[9px] text-cave-500" data-testid="grammar-count">
            {r.learned.length}/{GRAMMAR.length}
          </span>
        </div>
        {r.learned.length === 0 ? (
          <div className="mt-1 text-[10px] text-cave-500">Nothing yet. It has not had to tell you.</div>
        ) : (
          <div className="mt-1 space-y-0.5" data-testid="grammar-rows">
            {r.learned.map((line) => (
              <div key={line} className="text-[10px] leading-snug text-cave-400">{line}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
