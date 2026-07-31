/**
 * Phase 8 UI: frozen light. The Optics card (the beam's controls), the
 * Observatory, the Refraction Bench, the Warrens, and Rune Inscription.
 */
import { useState } from 'react';
import { getCurrency } from '../../engine';
import type { GameState, Bucket } from '../../engine';
import { WAVELENGTH_RULES, splitUnlocked } from '../../engine/systems/refraction';
import {
  CONSTELLATIONS, OBSERVATION_TIERS, observationProgress, observatoryUnlocked,
} from '../../engine/content/shell4/observatory';
import {
  AUTHORED_PUZZLES, BENCH_SIZE, benchUnlocked, CHART_GRIND_SILICA, lensFor, puzzleById, simulateBench,
} from '../../engine/content/shell4/bench';
import { WARRENS, puzzleData, warrenAvailable } from '../../engine/content/shell4/warrens';
import {
  INSCRIPTION_TARGETS, RUNES, RUNE_GLYPHS, RUNE_NAMES, RUNE_PAIRS, RUNE_SLOTS, RUNE_TRIPLES,
  runeSlots, sequencePairs, sequenceTriples,
  type RuneId,
} from '../../engine/content/shell4/runes';
import { dispatch, useGame } from '../store';
import { Amount, BUCKET_NAME } from './shared';
import { materialCount } from '../../engine/systems/forge';
import { D, Decimal } from '../../engine/decimal';
import { ExportProduceRow } from './exports';

/**
 * A rune join's effect in the player's own words: the bucket it feeds and by how
 * much. Cost buckets (value < 1) read as a reduction. This is a RULE made legible
 * (rule 5), never a hint about which joins pay — that stays discovered.
 */
function runeEffectText(def: { bucket: Bucket; value: number }): string {
  const name = BUCKET_NAME[def.bucket];
  if (def.bucket === 'offlineEffAdd') return `${name} +${Math.round(def.value * 100)}%`;
  const pct = Math.round(Math.abs(def.value - 1) * 100);
  return `${name} ${def.value >= 1 ? '+' : '−'}${pct}%`;
}

// ---------------------------------------------------------------------------
// The Optics card — lives in the Dig panel while the beam is yours.
// ---------------------------------------------------------------------------

export function OpticsCard() {
  const state = useGame((s) => s.state);
  const opticsMode = useGame((s) => s.opticsMode);
  const setOpticsMode = useGame((s) => s.setOpticsMode);
  useGame((s) => s.rev);
  if (!state) return null;
  const native = state.shell.current === 'glassmere';
  const carried = state.shell.signatures.includes('refraction');
  if (!native && !carried) return null;
  const placed = Object.keys(state.refraction.mirrors).length;
  const mirrorCost = D(40).mul(Decimal.pow(1.5, state.refraction.mirrorStock - 2));
  const wantsResin = state.refraction.mirrorStock >= 4;
  const resinHeld = materialCount(state as GameState, 'setresin');

  return (
    <div className="panel p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-[#bcd8ee]">The Beam</span>
        <span className="tnum text-[10px] text-cave-400">
          mirrors {placed}/{state.refraction.mirrorStock}
        </span>
      </div>
      {/* Layer 1 — what it IS. Layer 2 — what to DO now. (Layer 3, where the
          numbers come from, is the readout line below the controls.) */}
      <p className="mt-1 text-[11px] leading-snug text-cave-400">
        A shaft of light enters one row of the face and walks straight across it. Mirrors bend it;
        a cell the beam passes through is <span className="text-[#bcd8ee]">lit</span>, and a lit cell
        pays more when you chip it.
      </p>
      <p className="mt-1 text-[11px] leading-snug text-cave-300">
        Pick the entry row, tap <span className="text-[#bcd8ee]">place mirrors</span> and set
        <span className="text-cave-200"> /</span> or <span className="text-cave-200">\</span> on the
        face to steer the beam across your richest cells — then chip the lit ones.
      </p>

      {/* Entry row — its own centred row of proper tap targets (not a 24px pad
          with an off-centre digit). */}
      <div className="mt-2">
        <div className="text-center text-[10px] uppercase tracking-wider text-cave-500">Enters at row</div>
        <div className="mt-1 flex flex-wrap justify-center gap-1.5">
          {Array.from({ length: state.face.h }, (_, r) => (
            <button
              key={r}
              aria-label={`Beam enters at row ${r + 1}`}
              aria-pressed={state.refraction.entryRow === r}
              className={`btn flex w-10 items-center justify-center px-0 py-1.5 text-xs ${state.refraction.entryRow === r ? 'btn-warm' : ''}`}
              onClick={() => dispatch({ type: 'setBeamRow', row: r })}
            >
              {r + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          className={`btn flex-1 px-2 py-1 text-[11px] ${opticsMode ? 'btn-warm' : ''}`}
          title="While placing: tapping the face cycles a mirror ( / then \ then none ) instead of chipping."
          onClick={() => setOpticsMode(!opticsMode)}
        >
          {opticsMode ? 'placing mirrors…' : 'place mirrors'}
        </button>
        <button
          className="btn px-2 py-1 text-[11px]"
          disabled={getCurrency(state, 'silica').lt(mirrorCost) || (wantsResin && resinHeld < 1)}
          title={wantsResin
            ? `Mirrors past the fourth are silvered with Set Resin (held ${resinHeld}) — the Still in Verdance, or Serra`
            : 'Buy another mirror to place'}
          onClick={() => dispatch({ type: 'buyMirror' })}
        >
          + mirror · <Amount value={mirrorCost} color="#c8c2b8" /> Silica
          {wantsResin && <span className="text-[#bd9a44]"> + 1 Set Resin ({resinHeld})</span>}
        </button>
      </div>

      {/* Layer 3 — where the numbers live. */}
      <div className="mt-2 border-t border-cave-800 pt-1.5 text-[10px] text-cave-500">
        {placed} of {state.refraction.mirrorStock} mirrors placed · lit cells harvest brighter, and
        a full-charge cell on the path <span className="text-cave-400">amplifies</span> the beam onward.
      </div>
      {splitUnlocked(state) && (
        <div className="mt-1.5 text-[9px] leading-relaxed text-cave-400">
          <span className="font-semibold text-[#bcd8ee]">Wavelength Split.</span>{' '}
          {WAVELENGTH_RULES.slice(1).join(' ')}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Observatory
// ---------------------------------------------------------------------------

export function ObservatoryPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [obsNote, setObsNote] = useState<string | null>(null);
  if (!state) return null;
  if (!observatoryUnlocked(state)) {
    return (
      <div className="panel p-4 text-center text-xs italic text-cave-400">
        A dome of ground glass above the Lamphouse, aimed at skies nobody here has stood under.
        It answers to Glassmere Mastery 2.
      </div>
    );
  }
  const active = state.observatory.active;
  const prog = observationProgress(state as GameState);

  return (
    <div className="space-y-2">
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#d8b8ee]">Findings</span>
          <span className="tnum text-[10px] text-cave-400">
            {state.observatory.completed} exposures · Spectrum <Amount value={getCurrency(state, 'spectrum')} color="#d8b8ee" />
          </span>
        </div>
        {active ? (
          <div className="mt-2">
            <div className="text-[11px] text-cave-200">{OBSERVATION_TIERS[active.tier]!.name}</div>
            <div className="mt-1 h-2 overflow-hidden rounded-full border border-cave-700 bg-cave-950">
              <div className="h-full bg-[#d8b8ee]/70" style={{ width: `${prog * 100}%` }} />
            </div>
            <button
              className="btn btn-warm mt-2 w-full py-1.5 text-xs"
              disabled={prog < 1}
              onClick={() => dispatch({ type: 'collectObservation' })}
            >
              {prog < 1 ? 'Exposing — it finishes with or without you' : 'Read the plate'}
            </button>
          </div>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {OBSERVATION_TIERS.map((t) => {
              const cloth = materialCount(state as GameState, 'fibercloth');
              const short = t.cloth > cloth;
              return (
                <button
                  key={t.id}
                  className="btn py-1.5 text-[11px]"
                  disabled={short}
                  onClick={() => setObsNote(dispatch({ type: 'startObservation', tier: t.id }).reason ?? null)}
                >
                  {t.name}
                  <span className="block text-[9px] text-cave-400">
                    {t.minutes}m · ~{t.spectrum} Spectrum
                    {t.cloth > 0 && <> · {t.cloth} Fibercloth ({cloth} held)</>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {obsNote && <div className="mt-1.5 text-[10px] text-[#d4a86a]">{obsNote}</div>}
      </div>
      {/* Star charts — a collection with structure. */}
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[9px] uppercase tracking-widest text-cave-400">Star charts</span>
          <span className="tnum text-[10px] text-cave-400">{state.observatory.constellations.length}/8 skies closed</span>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {CONSTELLATIONS.map((con) => {
            const done = state.observatory.constellations.includes(con.id);
            const held = con.pieces.filter((p) => (state.observatory.pieces[p] ?? 0) > 0).length;
            return (
              <div key={con.id} className={`rounded-md border p-2 ${done ? 'border-[#d8b8ee]/60' : 'border-cave-700'}`}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-semibold text-cave-200">{con.name}</span>
                  <span className="tnum text-[9px] text-cave-400">{held}/4</span>
                </div>
                <div className="mt-0.5 flex gap-1">
                  {con.pieces.map((p) => (
                    <span key={p} className={`text-[11px] ${(state.observatory.pieces[p] ?? 0) > 0 ? 'text-[#e8d8f8]' : 'text-cave-700'}`}>✦</span>
                  ))}
                </div>
                <div className="text-[9px] italic text-cave-400">{done ? con.bonus.label : con.flavor}</div>
              </div>
            );
          })}
        </div>
        {/* B5 — the chart's second life, said where the chart closes. */}
        {state.observatory.constellations.length > 0 && (
          <div className="mt-1.5 text-[10px] italic text-cave-400">
            A closed sky is a blueprint: the Bench can grind it into a lens.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Refraction Bench
// ---------------------------------------------------------------------------

export function BenchPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [puzzleId, setPuzzleId] = useState<string | null>(null);
  const [mirrors, setMirrors] = useState<Record<number, '/' | '\\'>>({});
  const [result, setResult] = useState<string | null>(null);
  if (!state) return null;
  if (!benchUnlocked(state)) {
    return (
      <div className="panel p-4 text-center text-xs italic text-cave-400">
        A workbench of chalk-lines and clamps for light. It answers to Glassmere Mastery 4.
      </div>
    );
  }
  const nextUnsolved = AUTHORED_PUZZLES.find((p) => !state.bench.solved.includes(p.id));
  const current = puzzleId ? puzzleById(puzzleId) : nextUnsolved ?? AUTHORED_PUZZLES[0]!;
  const sim = current ? simulateBench(current, mirrors) : null;

  return (
    <div className="space-y-2">
      {/* The exports: ground and cast for the fire below (Part B spine) */}
      <ExportProduceRow materialId="groundlens" />
      <ExportProduceRow materialId="glasseal" />
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#bcd8ee]">Solved</span>
          <span className="tnum text-[10px] text-cave-400">
            {state.bench.solved.length} solved · Ray <Amount value={getCurrency(state, 'ray')} color="#eef6ff" />
          </span>
        </div>
        {current && (
          <>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-[11px] font-semibold text-cave-200">{current.name}</span>
              <span className="tnum text-[9px] text-cave-400">≤{current.mirrorsAllowed} mirrors · {current.targets.length} targets</span>
            </div>
            {current.lesson && <div className="text-[10px] italic text-cave-400">{current.lesson}</div>}
            {/* The board: tap cycles / then \ then clear. */}
            <div className="mt-2 inline-block">
              {Array.from({ length: BENCH_SIZE }, (_, r) => (
                <div key={r} className="flex gap-0.5" style={{ marginTop: r > 0 ? 2 : 0 }}>
                  {Array.from({ length: BENCH_SIZE }, (_, c) => {
                    const cell = r * BENCH_SIZE + c;
                    const wall = current.walls.includes(cell);
                    const target = current.targets.includes(cell);
                    const hit = sim?.hit.includes(cell);
                    const m = mirrors[cell];
                    const entry = c === 0 && r === current.entryRow;
                    return (
                      <button
                        key={c}
                        disabled={wall}
                        className={`h-7 w-7 rounded-[3px] border text-[12px] leading-none ${
                          wall ? 'border-cave-800 bg-cave-950 text-cave-700'
                          : target ? (hit ? 'border-[#9ee07a] bg-[#22331f] text-[#cfe89a]' : 'border-[#d8b8ee]/70 bg-cave-900 text-[#d8b8ee]')
                          : 'border-cave-700 bg-cave-900 text-[#bcd8ee]'
                        }`}
                        title={wall ? 'Opaque' : target ? `Target${current.colorTargets?.[cell] !== undefined ? ` (wavelength ${current.colorTargets[cell]})` : ''}` : entry ? 'The beam enters here' : 'Tap: / then \\ then clear'}
                        onClick={() => {
                          setResult(null);
                          setMirrors((mm) => {
                            const next = { ...mm };
                            if (next[cell] === '/') next[cell] = '\\';
                            else if (next[cell] === '\\') delete next[cell];
                            else next[cell] = '/';
                            return next;
                          });
                        }}
                      >
                        {wall ? '▦' : m ?? (target ? '◎' : entry ? '→' : '·')}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <button
              className="btn btn-warm mt-2 w-full py-1.5 text-xs"
              onClick={() => {
                const r = dispatch({ type: 'benchAttempt', puzzleId: current.id, mirrors });
                if (r.ok) {
                  const d = r.data as { solved: boolean; hit?: number; of?: number; first?: boolean };
                  setResult(d.solved ? (d.first ? 'Solved — a Lens is ground and kept.' : 'Solved again. The Lens remembers.') : `The light missed: ${d.hit}/${d.of} targets.`);
                } else setResult(r.reason ?? null);
              }}
            >
              Fire the beam (15 Silica)
            </button>
            {result && <div className="mt-1 text-center text-[10px] text-cave-300">{result}</div>}
          </>
        )}
        {/* Puzzle picker */}
        <div className="mt-2 flex flex-wrap gap-1 border-t border-cave-800 pt-2">
          {AUTHORED_PUZZLES.slice(0, 12).map((p) => (
            <button
              key={p.id}
              className={`btn px-1.5 py-0.5 text-[9px] ${state.bench.solved.includes(p.id) ? 'opacity-50' : ''} ${current?.id === p.id ? 'btn-warm' : ''}`}
              onClick={() => { setPuzzleId(p.id); setMirrors({}); setResult(null); }}
            >
              {p.name}
            </button>
          ))}
          <button className="btn px-1.5 py-0.5 text-[9px]" onClick={() => {
            setPuzzleId(`gen${state.bench.nextGenSeed + Math.floor(Math.random() * 10000)}`);
            setMirrors({});
            setResult(null);
          }}>
            an endless exercise…
          </button>
        </div>
      </div>
      {/* B5 — Observatory→Bench: a finished chart is a blueprint. */}
      {state.observatory.constellations.length > 0 && (
        <div className="panel p-3">
          <div className="text-[9px] uppercase tracking-widest text-cave-400">Star charts — the sky's own blueprints</div>
          <div className="mt-1 text-[10px] italic leading-snug text-cave-400">
            A completed constellation is a solved configuration. Grind it and the chart becomes
            a lens that echoes its theme.
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {state.observatory.constellations.map((conId) => {
              const ground = state.bench.solved.includes(`chart:${conId}`);
              const lens = lensFor(`chart:${conId}`);
              return (
                <button
                  key={conId}
                  className={`btn px-1.5 py-0.5 text-[9px] ${ground ? 'opacity-50' : 'btn-warm'}`}
                  disabled={ground || getCurrency(state, 'silica').lt(CHART_GRIND_SILICA)}
                  title={ground ? 'Already in the case below' : `+${Math.round((lens.value - 1) * 100)}% ${lens.bucket} · ${CHART_GRIND_SILICA} Silica`}
                  onClick={() => dispatch({ type: 'grindChartLens', constellationId: conId })}
                >
                  {ground ? `${lens.name} ✓` : `Grind ${lens.name} · ${CHART_GRIND_SILICA} Silica`}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {/* The lens case */}
      {state.bench.solved.length > 0 && (
        <div className="panel p-3">
          <div className="text-[9px] uppercase tracking-widest text-cave-400">The lens case — solutions are possessions</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {state.bench.solved.map((id) => {
              const lens = lensFor(id);
              const on = state.bench.equippedLens === id;
              return (
                <button
                  key={id}
                  className={`btn px-1.5 py-0.5 text-[9px] ${on ? 'btn-warm' : ''}`}
                  title={`+${Math.round((lens.value - 1) * 100)}% ${lens.bucket}`}
                  onClick={() => dispatch({ type: 'equipLens', puzzleId: on ? null : id })}
                >
                  {lens.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Warrens
// ---------------------------------------------------------------------------

export function WarrensPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [answer, setAnswer] = useState<number[]>([]);
  if (!state) return null;
  const active = state.warrens.active;
  const activeDef = active ? WARRENS.find((w) => w.id === active.id) : null;

  if (active && activeDef) {
    const data = puzzleData(activeDef);
    return (
      <div className="panel p-3">
        <div className="text-sm font-semibold text-[#bcd8ee]">{activeDef.name}</div>
        <div className="mt-1 text-[10px] italic leading-snug text-cave-400">{activeDef.layout}</div>
        {active.stage === 'puzzle' && (
          <div className="mt-2">
            <div className="text-[11px] text-cave-200">{activeDef.puzzle.prompt}</div>
            {activeDef.puzzle.kind === 'echo' && (
              <div className="mt-1.5">
                <div className="tnum text-[10px] text-cave-400">It shows: {data.sequence!.join(' · ')}</div>
                <div className="mt-1 flex gap-1">
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <button key={n} className="btn btn-cell h-8 w-8 p-0 text-xs" onClick={() => setAnswer((a) => [...a, n])}>{n}</button>
                  ))}
                </div>
                <div className="tnum mt-1 text-[10px] text-cave-300">Your answer: {answer.join(' · ') || '—'}</div>
              </div>
            )}
            {activeDef.puzzle.kind === 'weights' && (
              <div className="mt-1.5">
                <div className="tnum text-[10px] text-cave-400">The mark asks: {data.target}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {data.weights!.map((wt, i) => (
                    <button
                      key={i}
                      className={`btn px-2 py-1 text-xs ${answer.includes(i) ? 'btn-warm' : ''}`}
                      onClick={() => setAnswer((a) => (a.includes(i) ? a.filter((x) => x !== i) : [...a, i]))}
                    >
                      {wt}
                    </button>
                  ))}
                </div>
                <div className="tnum mt-1 text-[10px] text-cave-300">
                  Loaded: {answer.reduce((a, i) => a + data.weights![i]!, 0)}
                </div>
              </div>
            )}
            {activeDef.puzzle.kind === 'gates' && (
              <div className="mt-1.5">
                <div className="text-[10px] text-cave-400">
                  {data.gates!.map((g, i) => (
                    <div key={i}>gate {i + 1}: wants {g.on.map((l) => l + 1).join(',')} lit{g.off.length > 0 ? `; ${g.off.map((l) => l + 1).join(',')} dark` : ''}</div>
                  ))}
                </div>
                <div className="mt-1 flex gap-1">
                  {[0, 1, 2, 3, 4].map((l) => (
                    <button
                      key={l}
                      className={`btn btn-cell h-8 w-8 p-0 text-xs ${answer.includes(l) ? 'btn-warm' : ''}`}
                      onClick={() => setAnswer((a) => (a.includes(l) ? a.filter((x) => x !== l) : [...a, l]))}
                    >
                      {answer.includes(l) ? '☀' : '○'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-2 flex gap-1.5">
              <button
                className="btn btn-warm flex-1 py-1.5 text-xs"
                onClick={() => {
                  const r = dispatch({ type: 'warrenAnswer', id: active.id, answer });
                  if (r.ok && !(r.data as { solved: boolean }).solved) setAnswer([]);
                }}
              >
                Answer
              </button>
              <button className="btn px-3 py-1.5 text-xs opacity-70" onClick={() => { dispatch({ type: 'warrenLeave' }); setAnswer([]); }}>
                Walk out
              </button>
            </div>
          </div>
        )}
        {active.stage === 'fight' && (
          <div className="mt-2 text-center text-[11px] text-cave-300">
            {state.combat.active
              ? 'The keeper is upon you — the lanes decide it.'
              : (
                <button className="btn btn-warm w-full py-1.5 text-xs" onClick={() => { dispatch({ type: 'warrenClaim' }); setAnswer([]); }}>
                  Claim what the tunnel keeps
                </button>
              )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {['loam', 'ferrite', 'verdance', 'glassmere'].map((sh) => (
        <div key={sh}>
          <div className="px-1 text-xs font-semibold uppercase tracking-wider text-cave-400">{sh.toUpperCase()}</div>
          <div className="mt-1 space-y-1.5">
            {WARRENS.filter((w) => w.shellId === sh).map((w) => {
              const open = warrenAvailable(state, w);
              const cleared = state.warrens.cleared[w.id] ?? 0;
              const unique = state.warrens.uniques.includes(w.id);
              return (
                <div key={w.id} className={`panel p-2.5 ${open ? '' : 'opacity-50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-cave-200">{w.name}</span>
                      <span className="tnum ml-1.5 text-[9px] text-cave-400">
                        d{w.depth}{cleared > 0 ? ` · cleared ×${cleared}` : ''}{unique ? ' · unique claimed' : ''}
                      </span>
                      <div className="text-[10px] italic text-cave-400">{w.flavor}</div>
                    </div>
                    <button
                      className="btn shrink-0 px-2 py-1 text-[10px]"
                      disabled={!open}
                      onClick={() => dispatch({ type: 'warrenEnter', id: w.id })}
                    >
                      {open ? 'Step in' : `at depth ${w.depth}`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rune Inscription
// ---------------------------------------------------------------------------

export function RunesPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [target, setTarget] = useState<(typeof INSCRIPTION_TARGETS)[number]>('tool');
  const [seq, setSeq] = useState<(RuneId | null)[]>([null, null, null]);
  const [practice, setPractice] = useState<{ harmonic: number; dissonant: number; silent: number } | null>(null);
  if (!state) return null;
  const anyRunes = Object.values(state.runes.found).some((n) => n > 0) || state.runes.pairsSeen.length > 0;
  if (!anyRunes) {
    return (
      <div className="panel p-4 text-center text-xs italic text-cave-400">
        Old marks turn up on Warren walls — letters that do something. Find one and bring it back
        under your fingernails.
      </div>
    );
  }
  const current = state.runes.inscriptions[target] ?? [null, null, null];
  // The tool earns MORE rune room the higher its tier (up to 5); gear stays at 3.
  // The editor must offer exactly that many, or the extra slots — and the triples
  // that only fit in a longer sequence — are unreachable.
  const slots = runeSlots(state, target);
  const view = Array.from({ length: slots }, (_, i) => seq[i] ?? null);

  return (
    <div className="space-y-2">
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#bcd8ee]">Inscription</span>
          <span className="tnum text-[10px] text-cave-400">{state.runes.pairsSeen.length}/{Object.keys(RUNE_PAIRS).length} pairs known</span>
        </div>
        <div className="mt-1 text-[10px] italic leading-snug text-cave-400">
          Adjacent runes interact, IN ORDER — Kel-Thur is not Thur-Kel. A dissonant pair ruins the
          inscription (never the item); the surface re-preps for Silica.
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {INSCRIPTION_TARGETS.map((t) => (
            <button key={t} className={`btn px-2 py-0.5 text-[10px] ${target === t ? 'btn-warm' : ''}`} onClick={() => { setTarget(t); setSeq(Array(runeSlots(state, t)).fill(null)); }}>
              {t}{state.runes.fouled[t] ? ' (fouled)' : ''}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {view.map((slot, i) => (
            <button
              key={i}
              className="h-10 w-10 rounded-md border border-cave-600 bg-cave-950 text-lg text-[#bcd8ee]"
              title="Tap to clear"
              onClick={() => setSeq(view.map((x, j) => (j === i ? null : x)))}
            >
              {slot ? RUNE_GLYPHS[slot as keyof typeof RUNE_GLYPHS] : '·'}
            </button>
          ))}
          <span className="text-[10px] text-cave-400">
            now: {current.filter(Boolean).map((r) => RUNE_GLYPHS[r as keyof typeof RUNE_GLYPHS]).join(' ') || 'bare'}
          </span>
        </div>
        {slots > RUNE_SLOTS && (
          <div className="mt-1 text-[9px] italic leading-snug text-cave-500">
            This tool holds {slots} runes — a longer line, where three in a row can say a third thing.
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1">
          {RUNES.map((r) => (
            <button
              key={r}
              className="btn px-2 py-1 text-xs"
              disabled={(state.runes.found[r] ?? 0) <= view.filter((x) => x === r).length}
              title={RUNE_NAMES[r]}
              onClick={() => {
                const i = view.findIndex((x) => x === null);
                if (i < 0) return;
                setSeq(view.map((x, j) => (j === i ? r : x)));
              }}
            >
              {RUNE_GLYPHS[r]} <span className="tnum text-[9px] text-cave-400">×{state.runes.found[r] ?? 0}</span>
            </button>
          ))}
        </div>
        {/*
          PRACTISE ON SCRAP — re-homed from the Workbench (A.70).
          The Workbench was stripped as redundant with the Casting station, and
          it was, for TOOLS. But it also carried this, which has nothing to do
          with casting: try a join for a little Silica and learn its SHAPE — how
          many rang, how many fought — never which, and never spending a real
          rune. Deleting the room would have deleted the feature, so it moves to
          the screen it was always about.
        */}
        <div className="mt-2 flex gap-1">
          <button
            className="btn flex-1 py-1.5 text-[11px]"
            data-testid="rune-practice"
            disabled={view.filter(Boolean).length < 2}
            title="Practise this join on scrap for a little Silica — learn if it rings, not what it does"
            onClick={() => {
              const r = dispatch({ type: 'practiceRunes', sequence: view });
              if (r.ok) setPractice(r.data as { harmonic: number; dissonant: number; silent: number });
            }}
          >
            Practise on scrap
          </button>
          <button
            className="btn btn-warm flex-1 py-1.5 text-xs"
            disabled={!view.some(Boolean)}
            onClick={() => dispatch({ type: 'inscribe', target, sequence: view })}
          >
            Etch the sequence
          </button>
        </div>
        {practice && (
          <div className="mt-1 text-[10px] leading-snug text-cave-400" data-testid="rune-practice-out">
            The scrap says: <span className="text-[#9ab87a]">{practice.harmonic} rang</span>
            {practice.dissonant > 0 && <>, <span className="text-[#e0604a]">{practice.dissonant} fought</span></>}
            {practice.silent > 0 && <>, <span className="text-cave-500">{practice.silent} stayed silent</span></>}.
            What they mean is yours to find.
          </div>
        )}
        {/* What the ETCHED inscription is doing right now — named where you have
            found it, honest that the rest is already in your totals (rule 5). */}
        {(() => {
          const activeP = sequencePairs(current).filter((p) => RUNE_PAIRS[p]);
          const activeT = sequenceTriples(current).filter((t) => RUNE_TRIPLES[t]);
          if (activeP.length === 0 && activeT.length === 0) return null;
          const all = [...activeP, ...activeT];
          const named = all.filter((k) => state.runes.pairsSeen.includes(k));
          const unnamed = all.length - named.length;
          return (
            <div className="mt-2 rounded border border-cave-800 bg-cave-950/60 p-2 text-[10px]">
              <div className="mb-0.5 uppercase tracking-widest text-cave-500">What the {target} carries now</div>
              {named.map((k) => {
                const def = RUNE_PAIRS[k] ?? RUNE_TRIPLES[k];
                return def ? (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-cave-200">{def.name}</span>
                    <span className="shrink-0 text-[#9fd8c0]">{runeEffectText(def)}</span>
                  </div>
                ) : null;
              })}
              {unnamed > 0 && (
                <div className="italic leading-snug text-cave-500">
                  {unnamed} more {unnamed > 1 ? 'joins are' : 'join is'} speaking, still unnamed — the effect is already in your totals; watch which number moved to name it.
                </div>
              )}
            </div>
          );
        })()}
      </div>
      {/* The grammar, as discovered. */}
      <div className="panel p-3">
        <div className="text-[9px] uppercase tracking-widest text-cave-400">The grammar (as you have found it)</div>
        {state.runes.pairsSeen.length === 0 && <div className="mt-1 text-[10px] italic text-cave-400">No pair has spoken yet. Experiment.</div>}
        <div className="mt-1 space-y-1">
          {state.runes.pairsSeen.map((p) => {
            const def = RUNE_PAIRS[p];
            const [a, b] = p.split('|');
            if (!def) return null;
            return (
              <div key={p} className="flex items-baseline justify-between gap-2 border-l-2 border-[#3c4658] pl-2 text-[11px]">
                <span className="text-cave-200">
                  {RUNE_GLYPHS[a as keyof typeof RUNE_GLYPHS]}→{RUNE_GLYPHS[b as keyof typeof RUNE_GLYPHS]} {def.name}
                </span>
                <span className="shrink-0 text-right text-[9px] text-[#9fd8c0]">{runeEffectText(def)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
