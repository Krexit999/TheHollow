/**
 * THE PRISM — THE SPECTRUM (§13), plain HTML, in THE PLANT cluster.
 *
 * LAW 3: six rows, one per wavelength, each carrying the rule it already
 * publishes in the Optics card and the points you have put on it. The player is
 * shown WHAT THE LIGHT DOES and how much of it there is — never a table of the
 * modulo it replaced.
 *
 * The dark bands are stated as plainly as the lit ones, because a dark band is
 * the interesting half: it is what makes a Glassmere machine go UNLIT.
 */
import { useGame, dispatch } from '../store';
import {
  BAND_COUNT, INTENSITY, TIER_CAPABILITY_PRISM, allocateBlocker, prismBuilt, prismFound,
  prismStation, reachesWhite, spectrum, spent, weighted,
} from '../../engine/systems/prism';
import { MAX_MACHINE_TIER, tierOf } from '../../engine/systems/plant';
import { bandOfMachine, conditionedMachines } from '../../engine/systems/condition';
import type { GameState } from '../../engine';

const TINT = ['#d8d8d8', '#d06a5a', '#d09a4a', '#7aa85a', '#5a9ab0', '#8a6ab8'];

export function PrismPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;

  const found = prismFound(st);
  const built = prismBuilt(st);
  if (!found && !built) return null;

  const tier = tierOf(st, 'prism');
  const cost = nextCost(st);
  const rack = st.casting?.rack?.length ?? 0;
  const rows = spectrum(st);
  const used = spent(st);

  return (
    <div className="panel mt-2 p-3" data-testid="prism-panel">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-cave-300">The Prism</span>
        <span className="text-[10px] text-cave-500" data-testid="prism-tier">
          {TIER_CAPABILITY_PRISM[Math.min(tier, MAX_MACHINE_TIER)]}
        </span>
      </div>

      {!built ? (
        <>
          <p className="text-[10px] leading-snug text-cave-500">
            It is still in the wreck at {prismStation()?.name ?? 'the deep'}. The beam already
            walks your mirrors; standing, this decides what the light IS along the way.
          </p>
          <button
            className="btn mt-1.5 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
            disabled={cost === null || rack < cost}
            data-testid="build-prism"
            onClick={() => dispatch({ type: 'buildPrism' })}
          >
            Raise it — {cost ?? 0} cast parts <span className="text-cave-600">(rack holds {rack})</span>
          </button>
        </>
      ) : (
        <>
          <div className="mb-1 flex items-baseline justify-between text-[9px] text-cave-500">
            <span>intensity</span>
            <span className="tnum" data-testid="prism-spent">{used} / {INTENSITY}</span>
          </div>

          <div className="space-y-1">
            {rows.map((r) => {
              const canAdd = allocateBlocker(st, r.band, r.points + 1) === null;
              const canSub = allocateBlocker(st, r.band, r.points - 1) === null;
              const machines = conditionedMachines().filter(
                (id) => tierOf(st, id) > 0 && bandOfMachine(st, id) === r.band,
              );
              return (
                <div
                  key={r.band}
                  className={`rounded border px-1.5 py-1 ${r.lit ? 'border-cave-700' : 'border-cave-800/60'}`}
                  data-testid={`band-${r.band}`}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="mt-[3px] h-2 w-2 shrink-0 rounded-sm"
                      style={{ background: TINT[r.band], opacity: r.lit ? 1 : 0.25 }} />
                    <span className={`shrink-0 text-[11px] ${r.lit ? 'text-cave-200' : 'text-cave-600'}`}>
                      {r.name}
                    </span>
                    <span className="min-w-0 flex-1" />
                    <button className="btn px-1 py-0 text-[10px] disabled:opacity-30"
                      disabled={!canSub} data-testid={`band-${r.band}-less`}
                      onClick={() => dispatch({ type: 'allocate', band: r.band, points: r.points - 1 })}>−</button>
                    <span className="tnum w-4 text-center text-[11px] text-cave-200"
                      data-testid={`band-${r.band}-points`}>{r.points}</span>
                    <button className="btn px-1 py-0 text-[10px] disabled:opacity-30"
                      disabled={!canAdd} data-testid={`band-${r.band}-more`}
                      onClick={() => dispatch({ type: 'allocate', band: r.band, points: r.points + 1 })}>+</button>
                  </div>
                  <div className={`mt-0.5 text-[9px] leading-snug ${r.lit ? 'text-cave-500' : 'text-cave-600'}`}>
                    {r.rule}
                  </div>
                  {!r.lit && machines.length > 0 && (
                    <div className="mt-0.5 text-[9px] leading-snug text-[#e0885a]"
                      data-testid={`band-${r.band}-unlit`}>
                      Dark — {machines.join(', ')} will run at half, and keep the band.
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!weighted(st) && (
            <div className="mt-1 text-[9px] leading-snug text-cave-600">
              This Prism carries a band or it does not. Leaning on one comes later.
            </div>
          )}
          {weighted(st) && !reachesWhite(st) && (
            <div className="mt-1 text-[9px] leading-snug text-cave-600">
              It splits the light. Putting it back together — white, the whole gift at once —
              comes later.
            </div>
          )}

          {cost !== null && (
            <button
              className="btn mt-2 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
              disabled={rack < cost}
              data-testid="build-prism"
              onClick={() => dispatch({ type: 'buildPrism' })}
            >
              {TIER_CAPABILITY_PRISM[tier + 1]} — {cost} cast parts
              <span className="text-cave-600"> (rack holds {rack})</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}

function nextCost(st: GameState): number | null {
  const t = tierOf(st, 'prism');
  if (t >= MAX_MACHINE_TIER) return null;
  return [0, 2, 3, 5][t + 1] ?? null;
}

export const PRISM_BANDS = BAND_COUNT;
