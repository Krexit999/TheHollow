/**
 * THE ASSAY BENCH + THE ASSAY CALL — plain panels (§9.3, §40.3).
 *
 * LAW 3 IS THE WHOLE CONSTRAINT HERE, and an information system is the easiest
 * place in the game to break it. So:
 *
 *   - Nothing lists a station's contents until it has been SAMPLED. There is no
 *     greyed preview, no "?" row with a price on it, no "reach tier III to see
 *     this". A station you have not read simply is not described.
 *   - The tier ladder is printed as CAPABILITY ("reads the deep-entry a station
 *     would pay"), never as a requirement to unlock something named.
 *   - The deep-entry reading at tier III names materials the gates actually
 *     drop, read off DEEP_GATES — a prediction, not a printed sheet.
 */
import { useGame, dispatch } from '../store';
import {
  BENCH_CAPABILITY, MAX_BENCH_TIER, SAMPLE_SURGE, assayCall, benchTier, fogBurnt,
  isSampled, sampleReport, sampleSecondsLeft, sampleRunning, sampleable,
} from '../../engine/systems/assayBench';
import { shellRoll } from '../../engine/systems/roll';
import { materialDef, BAND_LABELS } from '../../engine/materials';
import { traitsOf } from '../../engine/traits';
import type { GameState } from '../../engine';

const TYPE_WORD: Record<string, string> = {
  seam: 'a seam', wall: 'a wall', wreck: 'a wreck', works: 'a works',
  chamber: 'a chamber', hazard: 'a hazard', rest: 'a rest', floor: 'the floor',
};

function safeName(id: string): string {
  try { return materialDef(id).name; } catch { return id; }
}

/**
 * THE CALL — one line, and it is the most re-read line in the panel.
 *
 * It says what the band favours and, crucially, that it will not last. A
 * favour the player thinks is permanent is a stat; a favour they know expires
 * at the next Collapse is a reason to go now.
 */
export function AssayCallStrip() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;
  const call = assayCall(st);
  if (!call) return null;
  const traits = traitsOf(call);
  return (
    <div className="panel p-2.5" data-testid="assay-call">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-cave-400">
          The call
        </span>
        <span className="text-[9px] text-cave-600">until the next fall</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-[12px] font-semibold text-[#e0b054]" data-testid="assay-call-material">
          {safeName(call)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[9px] text-cave-500">
          {traits.join(' · ')}
        </span>
      </div>
      <div className="mt-1 text-[9px] leading-snug text-cave-500">
        The band is running to it today. It comes up oftener than its neighbours until the
        roof comes down — then the loam favours something else.
      </div>
    </div>
  );
}

/** One sampled station's reading. Never rendered for an unsampled one. */
function Reading({ st, stationId }: { st: GameState; stationId: string }) {
  const r = sampleReport(st, stationId);
  if (!r) return null;
  return (
    <div className="mt-1 rounded border border-cave-800 p-1.5" data-testid={`sample-${stationId}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold text-cave-200">{r.name}</span>
        <span className="tnum text-[9px] text-cave-500">{r.depth}m · {TYPE_WORD[r.rockClass] ?? r.rockClass}</span>
      </div>
      <div className="mt-1 space-y-0.5">
        {r.seams.map((s) => (
          <div key={s.materialId} className="flex items-baseline gap-1.5 text-[10px]">
            <span className="min-w-0 flex-1 truncate text-cave-300">{s.name}</span>
            <span className="shrink-0 text-cave-500">{BAND_LABELS[s.band]}</span>
            <span className="shrink-0 truncate text-[9px] text-cave-600">{s.traits.join('·')}</span>
          </div>
        ))}
        {r.seams.length === 0 && (
          <div className="text-[9px] italic text-cave-600">No seam in it. The place is the thing.</div>
        )}
      </div>
      {/* TIER III. Absent below it — not greyed, not priced, not named. */}
      {r.deepEntry && (
        <div className="mt-1 border-t border-cave-900 pt-1" data-testid={`deep-entry-${stationId}`}>
          <div className="text-[9px] uppercase tracking-wider text-cave-600">If you work it down</div>
          {r.deepEntry.map((d) => (
            <div key={d.materialId} className="flex items-baseline gap-1.5 text-[10px]">
              <span className="tnum w-5 shrink-0 text-right text-cave-500">{d.at}</span>
              <span className="min-w-0 flex-1 truncate text-[#c9a6e0]">{d.name}</span>
              <span className="shrink-0 truncate text-[9px] text-cave-600">{d.traits.join('·')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AssayBenchPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;
  const tier = benchTier(st);
  const rack = st.casting.rack?.length ?? 0;
  const nextCost = 2 + tier;
  const running = sampleRunning(st);
  const left = sampleSecondsLeft(st);
  const fog = fogBurnt(st);
  const surge = st.plant?.surge ?? 0;
  const targets = sampleable(st);
  const read = shellRoll(st).filter((d) => isSampled(st, d.id));

  return (
    <div className="panel p-3" data-testid="assay-bench">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-cave-400">
          The Assay Bench
        </span>
        <span className="text-[10px] text-[#e0b25a]">pure Surge</span>
      </div>
      <div className="text-[10px] leading-snug text-cave-500">
        {tier > 0
          ? <>Tier {'I'.repeat(tier)} — {BENCH_CAPABILITY[tier]}.</>
          : 'Not built. The Roll goes grey three rows down and stays grey.'}
      </div>

      {tier < MAX_BENCH_TIER && (
        <button
          className="btn mt-1.5 w-full py-1 text-[11px]"
          disabled={rack < nextCost}
          data-testid="build-assay-bench"
          onClick={() => dispatch({ type: 'buildAssayBench' })}
        >
          {tier === 0 ? 'Build' : `Tier ${'I'.repeat(tier + 1)}`} · {nextCost} cast parts
          {rack < nextCost && <span className="text-cave-500"> (rack has {rack})</span>}
        </button>
      )}

      {tier > 0 && (
        <>
          <div className="mt-2 flex items-baseline justify-between border-t border-cave-800 pt-1.5">
            <span className="text-[9px] uppercase tracking-widest text-cave-500">Fog burnt</span>
            <span className="tnum text-[10px] text-cave-400" data-testid="fog-burnt">
              {fog.read} of {fog.total} stations
            </span>
          </div>

          {running ? (
            <div className="mt-1 text-[10px] text-[#9ad4e8]" data-testid="sample-running">
              Reading {shellRoll(st).find((d) => d.id === running.stationId)?.name ?? 'the rock'} —{' '}
              <span className="tnum">{Math.ceil(left)}s</span>
            </div>
          ) : (
            <>
              <div className="mt-1 text-[9px] text-cave-600">
                A sample costs {SAMPLE_SURGE} Surge and takes a while. You hold {surge.toFixed(0)}.
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {targets.slice(0, 8).map((d) => (
                  <button
                    key={d.id}
                    className="rounded border border-cave-800 px-1.5 py-1 text-[10px] text-cave-300 hover:bg-cave-800 disabled:opacity-40"
                    disabled={surge < SAMPLE_SURGE}
                    data-testid={`sample-btn-${d.id}`}
                    onClick={() => dispatch({ type: 'beginSample', stationId: d.id })}
                  >
                    {d.name} <span className="tnum text-cave-600">{d.depth}m</span>
                  </button>
                ))}
                {targets.length === 0 && (
                  <span className="text-[9px] italic text-cave-600">
                    Nothing left on this Roll that this bench can reach.
                  </span>
                )}
              </div>
            </>
          )}

          {read.length > 0 && (
            <div className="mt-2 border-t border-cave-800 pt-1.5" data-testid="sample-readings">
              <div className="text-[9px] uppercase tracking-widest text-cave-500">What you read</div>
              {read.map((d) => <Reading key={d.id} st={st} stationId={d.id} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
