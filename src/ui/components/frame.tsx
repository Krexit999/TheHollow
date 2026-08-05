/**
 * THE RECONSTRUCTION FRAME — REBUILDING (§13), plain HTML, in the Hollow room.
 *
 * The Hollow already has a rebuild button; this is the card that says what the
 * next cell will come back AS. LAW 3: three grains, each one sentence about
 * what the cell will be, and never a table of what that is worth.
 */
import { useGame, dispatch } from '../store';
import {
  GRAIN_DEFS, TIER_CAPABILITY_FRAME, frameFound, frameRead, frameStation, grainBlocker,
  holdsPattern, nextFrameTierCost, type GrainId,
} from '../../engine/systems/frame';
import { MAX_MACHINE_TIER } from '../../engine/systems/plant';
import type { GameState } from '../../engine';

export function FramePanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;

  const found = frameFound(st);
  const r = frameRead(st);
  if (!found && !r.built) return null;

  const cost = nextFrameTierCost(st);
  const rack = st.casting?.rack?.length ?? 0;

  return (
    <div className="panel mt-2 p-3" data-testid="frame-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#9fc4dd]">The Reconstruction Frame</span>
        <span className="tnum text-[10px] text-cave-400">{r.built ? `tier ${r.tier}` : 'in the wreck'}</span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        {r.built
          ? 'The Hollow decides whether a cell comes back. This decides what it comes back as.'
          : `Four cells were put back, and they are still here${frameStation() ? `, at ${frameStation()!.name}` : ''}.`}
      </p>

      <div className="mt-2 space-y-0.5">
        {TIER_CAPABILITY_FRAME.slice(1).map((line, i) => (
          <div
            key={i}
            className="text-[10px] leading-snug"
            style={{ color: r.tier >= i + 1 ? '#9ac07a' : '#6c6459' }}
            data-testid={`frame-tier-${i + 1}`}
          >
            <span className="tnum mr-1">{['I', 'II', 'III'][i]}</span>{line}
          </div>
        ))}
      </div>

      {cost !== null && (
        <button
          className="btn mt-2 w-full py-1.5 text-xs"
          disabled={!found || rack < cost}
          onClick={() => dispatch({ type: 'buildFrame' })}
          data-testid="frame-build"
        >
          {r.tier === 0 ? 'Set it up' : `Deepen the Frame — tier ${r.tier + 1}`} · {cost} cast parts ({rack} on the rack)
        </button>
      )}
      {cost === null && r.tier >= MAX_MACHINE_TIER && (
        <div className="mt-2 text-center text-[10px] text-cave-500">It will hold no more than two.</div>
      )}

      {r.built && (
        <div className="mt-2 border-t border-cave-800 pt-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[9px] uppercase tracking-widest text-cave-500">The next cell</span>
            <span className="tnum text-[9px] text-cave-500">{r.grains.length}/{r.slots}</span>
          </div>
          <div className="mt-1 space-y-1">
            {GRAIN_DEFS.map((g) => {
              const on = r.grains.includes(g.id);
              const blocked = grainBlocker(st, g.id);
              return (
                <button
                  key={g.id}
                  className={`w-full rounded-md border p-1.5 text-left ${
                    on ? 'border-[#9fc4dd] bg-[#16242e]' : 'border-cave-800'
                  }`}
                  disabled={blocked !== null && !on}
                  title={blocked ?? g.flavor}
                  onClick={() => dispatch({ type: 'setGrain', grain: g.id as GrainId })}
                  data-testid={`frame-grain-${g.id}`}
                >
                  <div className="text-[11px] font-semibold" style={{ color: on ? '#bcd8ee' : '#c9c2b6' }}>
                    {g.name}{on ? ' ✓' : ''}
                  </div>
                  <div className="text-[10px] leading-snug text-cave-400">{g.does}</div>
                </button>
              );
            })}
          </div>
          {holdsPattern(st) && (
            <button
              className={`btn mt-1.5 w-full py-1 text-[10px] ${r.hold ? 'btn-warm' : ''}`}
              onClick={() => dispatch({ type: 'setGrainHold', hold: !r.hold })}
              data-testid="frame-hold"
            >
              {r.hold ? 'Holding the pattern for every cell' : 'Spend it on the next cell only'}
            </button>
          )}
          {r.laid.length > 0 && (
            <div className="mt-1.5 text-[9px] text-cave-500">
              laid so far: {r.laid.join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
