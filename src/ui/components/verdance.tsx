/**
 * Phase 7 UI: the living shell. The Greenhouse (breeding beds), the Loom
 * (warp/weft frame), the Still (brewing), the Mycelium (the long thread),
 * and the weather chip that names what the rock is doing today.
 */
import { useState } from 'react';
import { fmt, getCurrency } from '../../engine';
import type { GameState } from '../../engine';
import { greenhouseUnlocked, plotCount, plotCap, strainDef } from '../../engine/content/shell3/greenhouse';
import { ExportProduceRow, InstallButton } from './exports';
import {
  clusters, inoculate as _inoc, inoculateCost, MYC_LANES, MYC_NODE_TYPES, MYC_ROWS,
  mycUnlocked, siteDepth, siteId, siteReachable, SPREAD_COST,
} from '../../engine/content/shell3/mycelium';
import { activeBrew, BREW_BY_ID, brewingUnlocked, BREW_UNIT } from '../../engine/content/shell3/brews';
import {
  activeShapes, litGrid, loomUnlocked, SHAPE_EFFECTS, SPIN_INPUTS, THREAD_BY_ID, THREADS,
} from '../../engine/content/shell3/loomSystem';
import { currentWeather } from '../../engine/systems/weather';
import { vinedCellCount, feralCellCount } from '../../engine/systems/growth';
import { materialCount } from '../../engine/systems/forge';
import { dispatch, useGame } from '../store';
import { Amount, BUCKET_NAME } from './shared';
import { MaterialIcon } from './MaterialIcon';

void _inoc;

// ---------------------------------------------------------------------------
// The weather chip — over the face, glyph-first (never color alone).
// ---------------------------------------------------------------------------

export function WeatherChip() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state?.guild.discovered) return null;
  const w = currentWeather(state as GameState);
  // Built from the weather's ACTUAL modifier values, not a re-typed description —
  // so what the chip says is exactly what the pipeline is applying right now.
  const effects: string[] = w.mods.map((mm) => `${BUCKET_NAME[mm.bucket]} +${Math.round((mm.value - 1) * 100)}%`);
  if (w.growthAging && w.growthAging !== 1) effects.push(`vines age ×${w.growthAging}`);
  if (w.greenhouse && w.greenhouse !== 1) effects.push(`Greenhouse growth ×${w.greenhouse}`);
  const effectLine = effects.join(' · ');
  return (
    <div
      className="pointer-events-auto absolute right-2 top-2 z-20 max-w-[9.5rem] rounded-lg border border-cave-700 bg-cave-900/85 px-2 py-1"
      title={`${w.blurb}${effectLine ? `\n\nRight now: ${effectLine}.` : ''}\n\nWeather is only ever upside — the floor is neutral.`}
    >
      <div>
        <span className="mr-1">{w.glyph}</span>
        <span className={`text-[10px] uppercase tracking-wider ${w.neutral ? 'text-cave-400' : 'text-[#cfe89a]'}`}>
          {w.name}
        </span>
      </div>
      {effectLine ? (
        <div className="mt-0.5 text-[9px] leading-tight text-[#9fd8c0]">{effectLine}</div>
      ) : w.neutral ? (
        <div className="mt-0.5 text-[9px] leading-tight text-cave-500">no bonus, no penalty</div>
      ) : null}
    </div>
  );
}

/** Growth strip under the weather chip while in Verdance. */
export function GrowthChip() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state || state.shell.current !== 'verdance') return null;
  const vines = vinedCellCount(state as GameState);
  if (vines === 0) return null;
  return (
    <div className="pointer-events-none absolute right-2 top-[3.75rem] z-20 rounded-lg border border-[#3f6b32]/70 bg-cave-900/85 px-2 py-1 text-[10px] text-[#9ee07a]">
      {vines} vined · {feralCellCount(state as GameState)} feral
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Greenhouse
// ---------------------------------------------------------------------------

export function GreenhousePanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [selectedSeed, setSelectedSeed] = useState<string | null>(null);
  if (!state) return null;
  if (!greenhouseUnlocked(state)) {
    return (
      <div className="panel p-4 text-center text-xs italic text-cave-400">
        A glass-roofed terrace off the Lamphouse stair, fogged from inside. Something in there is
        growing without permission. It answers to Verdance Mastery 2.
      </div>
    );
  }
  const seeds = Object.entries(state.greenhouse.seeds).filter(([, n]) => n > 0);
  const chosen = selectedSeed && (state.greenhouse.seeds[selectedSeed] ?? 0) > 0 ? selectedSeed : seeds[0]?.[0] ?? null;
  const plots = state.greenhouse.plots.slice(0, plotCount(state));

  return (
    <div className="space-y-2">
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#9ee07a]">The beds</span>
          <span className="tnum text-[10px] text-cave-400">
            codex {state.greenhouse.codex.length}/78 · {state.greenhouse.harvests} harvests
          </span>
        </div>
        <div className="mt-1 text-[10px] italic leading-snug text-cave-400">
          Adjacent beds flowering together cross-breed — the slower parent sets the shape, the humors
          blend. Hypotheses welcome; the codex only records what you have actually grown.
        </div>
        {plotCount(state) < plotCap(state) && (
          <div className="mt-2">
            <InstallButton
              action={{ type: 'installFrame' }}
              label={`Frame bed ${plotCount(state) + 1} of ${plotCap(state)}`}
              exportId="lodeframe"
            />
            <div className="mt-1 text-[10px] leading-snug text-cave-500">
              Mastery revealed the room; the bed itself is Ferrite iron — cast a Lodeframe at the
              Crucible, or buy one from Serra.
            </div>
          </div>
        )}
        {/* Beds in a row — adjacency is left/right. */}
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {plots.map((p, i) => {
            if (!p) {
              return (
                <button
                  key={i}
                  className="flex h-20 flex-col items-center justify-center rounded-md border border-dashed border-cave-600 text-[9px] text-cave-400 hover:border-[#9ee07a]/60"
                  disabled={!chosen}
                  onClick={() => chosen && dispatch({ type: 'plantSeed', plot: i, speciesId: chosen })}
                >
                  {chosen ? <>plant<br />{strainName(chosen)}</> : 'bare bed'}
                </button>
              );
            }
            const def = strainDef(p.speciesId);
            const prog = Math.min(1, p.progressMs / def.growMs);
            const mature = prog >= 1;
            const flowering = prog >= 0.8;
            return (
              <button
                key={i}
                className={`flex h-20 flex-col items-center justify-between rounded-md border p-1 ${
                  mature ? 'border-[#e6f5aa]/70' : flowering ? 'border-[#9ee07a]/60' : 'border-cave-700'
                }`}
                title={`${def.name} — yields ${strainYieldText(p.speciesId)}${mature ? ' · ripe, tap to harvest' : ` · ${Math.round(prog * 100)}% grown`}\n${def.flavor}`}
                disabled={!mature}
                onClick={() => dispatch({ type: 'harvestPlot', plot: i })}
              >
                <PlantArt form={def.form} prog={prog} hybrid={p.speciesId.startsWith('hy.')} />
                <span className="w-full truncate text-center text-[8px] text-cave-300">{def.name}</span>
                <div className="h-1 w-full overflow-hidden rounded-full bg-cave-950">
                  <div className="h-full bg-[#9ee07a]" style={{ width: `${prog * 100}%` }} />
                </div>
              </button>
            );
          })}
        </div>
        {/* Seed pouch */}
        <div className="mt-2 border-t border-cave-800 pt-2">
          <div className="text-[9px] uppercase tracking-widest text-cave-400">Seed pouch</div>
          {seeds.length === 0 ? (
            <div className="mt-1 text-[10px] italic text-cave-400">
              Empty. Blooming vines shed seed when harvested — let the face go a little wild.
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap gap-1">
              {seeds.map(([id, n]) => (
                <button
                  key={id}
                  className={`rounded border px-1.5 py-0.5 text-[10px] ${chosen === id ? 'border-[#9ee07a] text-[#cfe89a]' : 'border-cave-700 text-cave-300'}`}
                  title={`${strainName(id)} — grows to yield ${strainYieldText(id)}`}
                  onClick={() => setSelectedSeed(id)}
                >
                  {strainName(id)} <span className="tnum text-cave-400">×{n}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Codex */}
      <div className="panel p-3">
        <div className="text-[9px] uppercase tracking-widest text-cave-400">The green book</div>
        {state.greenhouse.codex.length === 0 && (
          <div className="mt-1 text-[10px] italic text-cave-400">Nothing named yet.</div>
        )}
        <div className="mt-1 space-y-1">
          {state.greenhouse.codex.map((id) => {
            const def = strainDef(id);
            return (
              <div key={id} className="border-l-2 border-[#3f6b32] pl-2">
                <span className="text-[11px] font-semibold text-cave-200">{def.name}</span>
                <span className="ml-1.5 text-[9px] uppercase tracking-wider text-cave-400">
                  {def.form}{Array.isArray(def.humor) ? ` · ${def.humor.join('+')}` : ` · ${def.humor}`}
                </span>
                {def.parents && (
                  <span className="ml-1.5 text-[9px] text-cave-400">
                    ({strainName(def.parents[0])} × {strainName(def.parents[1])})
                  </span>
                )}
                <div className="text-[9px] text-[#9fd8c0]">yields {strainYieldText(id)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function strainName(id: string): string {
  try {
    return strainDef(id).name;
  } catch {
    return id;
  }
}

// A strain harvests into currency by its HUMOR (see harvestPlot): bright→Spore
// (×3), iron→Sap, chill→Chlorophyll; a hybrid splits its yield across both. This
// mirrors the engine exactly so the plot can say what it will pay before you tap.
const HUMOR_YIELD: Record<string, { name: string; mult: number }> = {
  bright: { name: 'Spore', mult: 3 },
  iron: { name: 'Sap', mult: 1 },
  chill: { name: 'Chlorophyll', mult: 1 },
};
function strainYieldText(id: string): string {
  try {
    const def = strainDef(id);
    const humors = Array.isArray(def.humor) ? def.humor : [def.humor];
    const per = (8 * def.yieldMult) / humors.length;
    return humors.map((h) => `${HUMOR_YIELD[h]!.name} ×${Math.round(per * HUMOR_YIELD[h]!.mult)}`).join(' · ');
  } catch {
    return '';
  }
}

function PlantArt({ form, prog, hybrid }: { form: string; prog: number; hybrid: boolean }) {
  const h = 8 + prog * 22;
  const col = hybrid ? '#cfe89a' : '#9ee07a';
  return (
    <svg viewBox="0 0 40 34" width={40} height={34} aria-hidden>
      <rect x="6" y="30" width="28" height="3" rx="1.5" fill="#4a3b2a" />
      {form === 'moss' && <ellipse cx="20" cy={31 - h / 3} rx={6 + prog * 8} ry={2 + h / 4} fill={col} opacity="0.85" />}
      {form === 'vine' && (
        <path d={`M20 30 q-6 -${h * 0.5} 0 -${h} q5 ${h * 0.2} 3 -${h * 0.4}`} stroke={col} strokeWidth="2.2" fill="none" />
      )}
      {form === 'fern' && (
        <g stroke={col} strokeWidth="1.6" fill="none">
          <path d={`M20 30 q0 -${h} 0 -${h}`} />
          <path d={`M20 ${30 - h * 0.4} l-6 -3 M20 ${30 - h * 0.4} l6 -3 M20 ${30 - h * 0.7} l-4.5 -2.5 M20 ${30 - h * 0.7} l4.5 -2.5`} />
        </g>
      )}
      {form === 'cap' && (
        <g>
          <rect x="18.4" y={30 - h * 0.7} width="3.2" height={h * 0.7} rx="1.4" fill="#c9c2a8" />
          <ellipse cx="20" cy={30 - h * 0.7} rx={5 + prog * 6} ry={3 + prog * 3} fill={col} />
        </g>
      )}
      {prog >= 0.8 && prog < 1 && <circle cx="27" cy={30 - h} r="2.2" fill="#eaf7c0" />}
      {prog >= 1 && <circle cx="20" cy={28 - h} r="3" fill="#f6ffd8" />}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The Loom
// ---------------------------------------------------------------------------

const FIBER_COLOR: Record<string, string> = { root: '#a8845c', silk: '#d8d2c0', iron: '#8a97a8', ghost: '#9c94c0' };

export function LoomPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [picking, setPicking] = useState<{ axis: 'warp' | 'weft'; index: number } | null>(null);
  const [undo, setUndo] = useState<Array<{ axis: 'warp' | 'weft'; index: number; prev: string | null }>>([]);

  /** Place a thread, remembering what was there so it can be stepped back. */
  const setThreadAt = (axis: 'warp' | 'weft', index: number, threadId: string | null) => {
    const s = useGame.getState().state;
    const prev = (axis === 'warp' ? s?.loom.warp[index] : s?.loom.weft[index]) ?? null;
    if (prev === threadId) return;
    setUndo((u) => [...u, { axis, index, prev }]);
    dispatch({ type: 'setThread', axis, index, threadId });
  };

  if (!state) return null;
  if (!loomUnlocked(state)) {
    return (
      <div className="panel p-4 text-center text-xs italic text-cave-400">
        A great frame of green wood stands folded in the Lamphouse loft, strung with nothing.
        It answers to Verdance Mastery 4.
      </div>
    );
  }
  const grid = litGrid(state.loom.warp, state.loom.weft);
  const shapes = activeShapes(state as GameState);

  return (
    <div className="space-y-2">
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#b8d09a]">The weave</span>
          <span className="tnum text-[10px] text-cave-400">
            {state.loom.weaves} weaves · Thread <Amount value={getCurrency(state, 'threadmark')} color="#b8d09a" />
          </span>
        </div>
        <div className="mt-1 text-[10px] italic leading-snug text-cave-400">
          A knot forms where twists OPPOSE (S over Z). Shapes among the knots carry the power —
          solve for the shape; nobody memorizes recipes here.
        </div>
        {/* The frame: weft picks across the top, warp down the left. */}
        <div className="mt-2 inline-block">
          <div className="ml-7 flex gap-0.5">
            {state.loom.weft.map((t, c) => (
              <ThreadPeg key={c} threadId={t} onClick={() => setPicking({ axis: 'weft', index: c })} />
            ))}
          </div>
          {grid.map((row, r) => (
            <div key={r} className="mt-0.5 flex items-center gap-0.5">
              <ThreadPeg threadId={state.loom.warp[r]!} onClick={() => setPicking({ axis: 'warp', index: r })} wide />
              {row.map((lit, c) => (
                <div
                  key={c}
                  className={`h-6 w-6 rounded-[3px] border ${
                    lit ? 'knot-lit border-[#cfe89a]/70' : 'border-cave-700 bg-cave-950'
                  }`}
                />
              ))}
            </div>
          ))}
        </div>
        {picking && (
          <div className="mt-2 flex flex-wrap gap-1 border-t border-cave-800 pt-2">
            {THREADS.map((t) => (
              <button
                key={t.id}
                className="btn px-1.5 py-0.5 text-[10px]"
                style={{ borderColor: FIBER_COLOR[t.fiber] }}
                title={`${t.name} — held ×${state.loom.threads[t.id] ?? 0}`}
                onClick={() => { setThreadAt(picking.axis, picking.index, t.id); setPicking(null); }}
              >
                {t.fiber} {t.twist} <span className="tnum text-cave-400">×{state.loom.threads[t.id] ?? 0}</span>
              </button>
            ))}
            <button className="btn px-1.5 py-0.5 text-[10px] opacity-60" onClick={() => {
              setThreadAt(picking.axis, picking.index, null);
              setPicking(null);
            }}>
              bare
            </button>
          </div>
        )}
        {/* Dressing the frame is several placements before anything is spent,
            and it was easy to lose the arrangement you were part-way through.
            Stepping back is free because threads are only consumed on commit —
            which is also why the stack is dropped the moment you commit. */}
        {undo.length > 0 && (
          <button
            className="btn mt-2 w-full py-1 text-[11px]"
            onClick={() => {
              const last = undo[undo.length - 1]!;
              dispatch({ type: 'setThread', axis: last.axis, index: last.index, threadId: last.prev });
              setUndo(undo.slice(0, -1));
            }}
          >
            ↶ Undo that placement <span className="text-cave-500">({undo.length} back)</span>
          </button>
        )}
        {!state.loom.framed && (
          <div className="mt-2">
            <InstallButton
              action={{ type: 'installLoomFrame' }}
              label="Brace the frame in iron"
              exportId="lodeframe"
            />
            <div className="mt-1 text-[10px] leading-snug text-cave-500">
              The wooden frame bows under a full warp — no commit until it is braced with a
              Lodeframe (Crucible in Ferrite, or Serra).
            </div>
          </div>
        )}
        <button
          className="btn btn-warm mt-2 w-full py-1.5 text-xs"
          disabled={!state.loom.framed}
          onClick={() => { dispatch({ type: 'commitWeave' }); setUndo([]); }}
        >
          Set the weave (consumes one of each assigned thread · yields 1 Fibercloth)
        </button>
        {shapes.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            <div className="text-[9px] uppercase tracking-widest text-cave-500">Woven now — each figure's bonus is live</div>
            {shapes.map((sh, k) => {
              const def = SHAPE_EFFECTS[sh.shape];
              return (
                <div key={`${sh.shape}-${sh.fiber}-${k}`} className="flex items-baseline justify-between gap-2 text-[10px]">
                  <span className="text-[#9fd8c0]">{def?.name ?? sh.shape} <span className="text-cave-500">({sh.fiber})</span></span>
                  {def && <span className="shrink-0 text-[#9fd8c0]">+{Math.round(def.pct * 100)}% {BUCKET_NAME[def.bucket]}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Spinning */}
      <div className="panel p-3">
        <div className="text-[9px] uppercase tracking-widest text-cave-400">The spinning bench</div>
        <div className="mt-1 space-y-1">
          {(Object.entries(SPIN_INPUTS) as Array<[string, (typeof SPIN_INPUTS)['root']]>).map(([fiber, recipe]) => (
            <div key={fiber} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="flex items-center gap-1.5 text-cave-200" style={{ color: FIBER_COLOR[fiber] }}>
                {fiber} fiber
                {Object.entries(recipe.materials).map(([m, n]) => (
                  <span key={m} className="flex items-center gap-0.5 text-[10px] text-cave-400">
                    <MaterialIcon id={m} size={14} /> {materialCount(state, m)}/{n}
                  </span>
                ))}
              </span>
              <span className="flex gap-1">
                {(['S', 'Z'] as const).map((tw) => (
                  <button
                    key={tw}
                    className="btn px-2 py-0.5 text-[10px]"
                    title={`Spin ${recipe.yields} ${fiber} (${tw}-twist) for ${recipe.sap} Sap`}
                    onClick={() => dispatch({ type: 'spinThread', threadId: `${fiber}${tw}` })}
                  >
                    {tw} · {recipe.sap} Sap
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ThreadPeg({ threadId, onClick, wide }: { threadId: string | null; onClick: () => void; wide?: boolean }) {
  const def = threadId ? THREAD_BY_ID.get(threadId) : null;
  return (
    <button
      className={`${wide ? 'mr-0.5 h-6 w-6' : 'h-6 w-6'} rounded-[3px] border text-[9px] font-bold`}
      style={{
        borderColor: def ? FIBER_COLOR[def.fiber] : '#4a4239',
        color: def ? FIBER_COLOR[def.fiber] : '#8a7f70',
        background: def ? '#1c1815' : 'transparent',
      }}
      title={def ? def.name : 'Assign a thread'}
      onClick={onClick}
    >
      {def ? def.twist : '·'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// The Still (brewing)
// ---------------------------------------------------------------------------

export function BrewPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [mix, setMix] = useState<[number, number, number]>([2, 1, 0]);
  if (!state) return null;
  if (!brewingUnlocked(state)) {
    return (
      <div className="panel p-4 text-center text-xs italic text-cave-400">
        A copper still, green with patience, dripping into nothing. It answers to Verdance Mastery 6.
      </div>
    );
  }
  const active = activeBrew(state as GameState);
  const left = active ? Math.max(0, Math.ceil(state.brewing.active!.endsAtSec - state.stats.playTimeSec)) : 0;
  const labels = ['Sap', 'Spore', 'Resin'];
  const units = [BREW_UNIT.sap, BREW_UNIT.spore, BREW_UNIT.resin];
  const currencies = ['sap', 'spore', 'resin'];

  return (
    <div className="space-y-2">
      {active && (
        <div className="panel border-[#cfe89a]/40 p-3 text-center">
          <div className="text-sm font-semibold text-[#cfe89a]">{active.name}</div>
          <div className="tnum text-[10px] text-cave-400">{left}s remaining — spikes, not sustains</div>
        </div>
      )}
      <div className="panel space-y-2 p-3">
        <div className="text-[10px] uppercase tracking-widest text-cave-300">
          The mash — {state.brewing.attempts} tried, {state.brewing.fails} dregs
        </div>
        {labels.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-16 text-xs text-cave-200">{label}</span>
            <button className="btn btn-cell h-6 w-6 p-0 text-sm leading-none" disabled={mix[i]! <= 0}
              onClick={() => setMix((m) => m.map((v, j) => (j === i ? v - 1 : v)) as [number, number, number])}>−</button>
            <span className="tnum w-6 text-center text-sm text-cave-200">{mix[i]}</span>
            <button className="btn btn-cell h-6 w-6 p-0 text-sm leading-none" disabled={mix[i]! >= 6}
              onClick={() => setMix((m) => m.map((v, j) => (j === i ? v + 1 : v)) as [number, number, number])}>+</button>
            <span className="tnum ml-auto text-[10px] text-cave-400">
              {mix[i]! > 0 && `${mix[i]! * units[i]!} / ${fmt(getCurrency(state, currencies[i]!))}`}
            </span>
          </div>
        ))}
        <button
          className="btn btn-warm w-full py-2 text-sm"
          disabled={mix[0]! + mix[1]! + mix[2]! < 2}
          onClick={() => dispatch({ type: 'brewExperiment', sap: mix[0]!, spore: mix[1]!, resin: mix[2]! })}
        >
          Run the still
        </button>
        {state.brewing.lastHint && (
          <div className="border-t border-cave-800 pt-1.5 text-[11px] italic text-cave-300">“{state.brewing.lastHint}”</div>
        )}
      </div>
      {/* The export: resin rendered down and set hard (Part B spine) */}
      <ExportProduceRow materialId="setresin" />
      {/* Cellar */}
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[9px] uppercase tracking-widest text-cave-400">The cellar</span>
          <span className="tnum text-[10px] text-cave-400">{state.brewing.discovered.length}/12 known</span>
        </div>
        {state.brewing.discovered.length === 0 && (
          <div className="mt-1 text-[10px] italic text-cave-400">Nothing bottled. The ratios are out there.</div>
        )}
        <div className="mt-1 space-y-1.5">
          {state.brewing.discovered.map((id) => {
            const def = BREW_BY_ID.get(id)!;
            const doses = state.brewing.doses[id] ?? 0;
            return (
              <div key={id} className="flex items-center justify-between gap-2 border-l-2 border-[#3f6b32] pl-2">
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-cave-200">{def.name}</span>
                  <span className="tnum ml-1.5 text-[9px] text-cave-400">{def.durationSec}s · ×{doses}</span>
                  <div className="text-[10px] italic leading-snug text-cave-400">{def.flavor}</div>
                </div>
                <button
                  className="btn shrink-0 px-2 py-0.5 text-[10px]"
                  disabled={doses < 1 || !!active}
                  onClick={() => dispatch({ type: 'drinkBrew', brewId: id })}
                >
                  Drink
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Mycelium
// ---------------------------------------------------------------------------

export function MyceliumPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [nodeType, setNodeType] = useState(MYC_NODE_TYPES[0]!.id);
  if (!state) return null;
  if (!mycUnlocked(state)) {
    return (
      <div className="panel p-4 text-center text-xs italic text-cave-400">
        Pale threads in the deep cracks, patient as arithmetic. They answer to Verdance Mastery 3.
      </div>
    );
  }
  const comps = clusters(state as GameState);
  const cost = inoculateCost(state as GameState);

  return (
    <div className="space-y-2">
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#9ee07a]">The network</span>
          <span className="tnum text-[10px] text-cave-400">
            {Object.keys(state.mycelium.nodes).length} nodes · {comps.length} clusters · reserve {state.mycelium.reserve}
          </span>
        </div>
        <div className="mt-1 text-[10px] italic leading-snug text-cave-400">
          Seed it with Humus; feed it and it wanders on its own ({SPREAD_COST} from the reserve per
          creep). Connected clusters amplify every node in them. It survives everything.
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {MYC_NODE_TYPES.map((t) => (
            <button
              key={t.id}
              className={`btn px-2 py-0.5 text-[10px] ${nodeType === t.id ? 'btn-warm' : ''}`}
              title={`${t.name}: +${((t.value - 1) * 100).toFixed(1)}% ${BUCKET_NAME[t.bucket]} per node, amplified by cluster size`}
              onClick={() => setNodeType(t.id)}
            >
              {t.glyph} {t.name}
            </button>
          ))}
          <button
            className="btn ml-auto px-2 py-0.5 text-[10px]"
            disabled={getCurrency(state, 'humus').lt(60)}
            onClick={() => dispatch({ type: 'feedMycelium', humus: 60 })}
          >
            Feed 60 Humus
          </button>
        </div>
        {/* The lattice of sites: 14 rows × 3 lanes. */}
        <div className="mt-2 space-y-0.5">
          {Array.from({ length: MYC_ROWS }, (_, r) => (
            <div key={r} className="flex items-center gap-0.5">
              <span className="tnum w-8 text-right text-[8px] text-cave-500">{siteDepth(r)}</span>
              {Array.from({ length: MYC_LANES }, (_, l) => {
                const id = siteId(r, l);
                const owned = state.mycelium.nodes[id];
                const reachable = siteReachable(state as GameState, r);
                const t = owned ? MYC_NODE_TYPES.find((x) => x.id === owned) : null;
                return (
                  <button
                    key={l}
                    className={`h-5 flex-1 rounded-[3px] border text-[9px] ${
                      owned
                        ? 'border-[#9ee07a]/70 bg-[#26331f] text-[#cfe89a]'
                        : reachable
                          ? 'border-cave-600 bg-cave-900 text-cave-500 hover:border-[#9ee07a]/50'
                          : 'border-cave-800 bg-cave-950 text-cave-700'
                    }`}
                    title={owned ? `${t?.name}${t ? ` · +${((t.value - 1) * 100).toFixed(1)}% ${BUCKET_NAME[t.bucket]} per node` : ''}` : reachable ? `Inoculate · ${cost} Humus` : `Wants depth ${siteDepth(r)}`}
                    disabled={!!owned || !reachable}
                    onClick={() => dispatch({ type: 'inoculate', siteId: id, nodeType })}
                  >
                    {t ? t.glyph : reachable ? '·' : ''}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
