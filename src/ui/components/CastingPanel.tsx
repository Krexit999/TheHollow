/**
 * THE CASTING FLOOR — the new Forge, step 2.
 *
 * Four boards, one room, and the order is the loop: THE CRUCIBLE (melt), THE
 * CASTS (pour), THE RACK (what you have made), THE STATION (build).
 *
 * PLAIN PANELS AND CSS, NO CANVAS. The one visual that matters — watching a
 * stone become liquid — is two divs whose widths come off `crucibleFill`, with
 * the sheen and the un-melted hatching in `index.css`. A canvas UI on this
 * codebase has been tried and reverted twice; nothing here needs one, and step
 * 1 was written so that stayed true.
 *
 * THE MISMATCH PENALTY IS THE POINT OF THE STATION, so it is legible BEFORE
 * the commit and never only after: the station assembles whatever is on it as
 * you place parts, so COHERENCE moves live, the raw-vs-net loss is printed in
 * the same units, and the sentence under it says in words what the number
 * means. A penalty a player only meets after clicking Combine is a trap.
 */
import { useState } from 'react';
import type { GameState } from '../../engine';
import { BANDS, bandOf, BAND_LABELS, materialDef, type PurityBand } from '../../engine/materials';
import {
  PART_DEFS, PART_TYPES, STAT_LABEL, TOOL_STATS, type PartType, type ToolStat,
} from '../../engine/content/forgeParts';
import { partMelt, type ToolStats } from '../../engine/systems/forgeParts';
import {
  MELT_PER_UNIT, TUB_CAPACITY, FULL_SET_MELT, benchComplete, benchPreview, canCast,
  crucibleFill, currentTool, rackPart, unitsThatFit,
} from '../../engine/systems/casting';
import { dispatch, useGame } from '../store';
import { MaterialIcon } from './MaterialIcon';
import { Select } from './Select';

const useLive = () => {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  return state;
};

const n0 = (n: number): string => (n >= 1e6 ? n.toExponential(1) : n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2));

/** Every material the Hold actually has, best band first, for the charge picker. */
function heldMaterials(state: GameState): Array<{ id: string; count: number; band: PurityBand }> {
  return Object.entries(state.materials.stacks)
    .map(([id, perMat]) => {
      let count = 0;
      let band: PurityBand = 'poor';
      for (const b of BANDS) {
        const n = perMat?.[b]?.count ?? 0;
        if (n > 0) { count += n; band = b; }
      }
      return { id, count, band };
    })
    .filter((m) => m.count > 0)
    .sort((a, b) => materialDef(a.id).name.localeCompare(materialDef(b.id).name));
}

export function CastingPanel() {
  const state = useLive();
  if (!state) return null;
  if (!state.forge.built) {
    return (
      <div className="panel p-4 text-center text-xs italic text-cave-400">
        Sand moulds stacked against a cold wall, and a tub with nothing in it. The Forge has to
        be standing before anything gets poured here.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Crucible state={state as GameState} />
      <Casts state={state as GameState} />
      <Rack state={state as GameState} />
      <Station state={state as GameState} />
      <YourTool state={state as GameState} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1 — THE CRUCIBLE
// ---------------------------------------------------------------------------

function Crucible({ state }: { state: GameState }) {
  const held = heldMaterials(state);
  const c = state.casting.crucible;
  const [pick, setPick] = useState<string>('');
  const [note, setNote] = useState<string | null>(null);
  const fill = crucibleFill(c);
  const fits = unitsThatFit(c);
  const inTub = c.solid + c.molten;
  // Once something is in the tub it is the only thing that can go in — one
  // material per part, so the picker locks to it rather than offering a mix
  // the engine would refuse.
  const locked = inTub > 0 ? c.materialId : null;
  const target = locked ?? (pick || held[0]?.id) ?? '';
  const haveTarget = target
    ? held.find((m) => m.id === target)?.count ?? 0
    : 0;

  const charge = (units: number) => {
    const r = dispatch({ type: 'chargeCrucible', materialId: target, units });
    setNote(r.ok ? null : r.reason ?? 'It would not take.');
  };

  return (
    <div className="panel p-3" data-testid="crucible">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#e0902a]">The crucible</span>
        <span className="tnum text-[10px] text-cave-400" data-testid="melt-readout">
          {Math.floor(c.molten)} / {TUB_CAPACITY} melt
        </span>
      </div>

      {/* THE TUB. Two flat divs and a CSS sheen — this is the whole animation. */}
      <div className="mt-2 h-7 w-full overflow-hidden rounded-md border border-cave-700 bg-cave-950">
        <div className="flex h-full w-full">
          <div
            className="melt-molten h-full transition-[width] duration-200 ease-linear"
            style={{ width: `${fill.molten01 * 100}%` }}
            data-testid="tub-molten"
          />
          <div
            className="melt-solid h-full transition-[width] duration-200 ease-linear"
            style={{ width: `${fill.solid01 * 100}%` }}
            data-testid="tub-solid"
          />
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {c.materialId ? (
            <>
              <MaterialIcon id={c.materialId} size={16} />
              <span className="truncate text-[11px] text-cave-300">{materialDef(c.materialId).name}</span>
              <span className="tnum shrink-0 text-[10px] text-cave-500">
                {BAND_LABELS[bandOf(c.purity)]} · {Math.round(c.purity)}
              </span>
            </>
          ) : (
            <span className="text-[11px] italic text-cave-500">Cold and empty.</span>
          )}
        </div>
        {c.solid > 0 ? (
          <span className="shrink-0 text-[10px] uppercase tracking-wider text-cave-400" data-testid="melting">
            melting · {Math.ceil(c.solid)}
          </span>
        ) : inTub > 0 ? (
          <button
            className="btn shrink-0 px-1.5 py-0.5 text-[10px]"
            onClick={() => dispatch({ type: 'drainCrucible' })}
          >
            Drain it off
          </button>
        ) : null}
      </div>

      <div className="mt-2 border-t border-cave-800 pt-2">
        <Select
          className="w-full"
          ariaLabel="Material to melt"
          value={target}
          onChange={(v) => setPick(v)}
          options={held.length === 0
            ? [{ value: '', label: '— the Hold is empty —' }]
            : held
              .filter((m) => locked === null || m.id === locked)
              .map((m) => ({
                value: m.id,
                label: `${materialDef(m.id).name} ×${m.count} · ${BAND_LABELS[m.band]}`,
              }))}
        />
        <div className="mt-1.5 grid grid-cols-3 gap-1">
          {([['×1', 1], ['×5', 5], ['Fill it', fits]] as Array<[string, number]>).map(([label, units]) => (
            <button
              key={label}
              className="btn py-1 text-[11px]"
              disabled={!target || haveTarget < 1 || fits < 1}
              onClick={() => charge(units)}
              data-testid={`charge-${label === 'Fill it' ? 'fill' : label.slice(1)}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-1 tnum text-[10px] text-cave-500">
          1 unit melts to {MELT_PER_UNIT} · room for {fits} more · a whole tool wants {FULL_SET_MELT}
        </div>
        {note && <div className="mt-1 text-[10px] text-[#d8a0a0]">{note}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2 — THE CASTS
// ---------------------------------------------------------------------------

/**
 * NO PUZZLE, NO FAIL. Seven moulds, each with its price in melt. A cast either
 * has the melt or it does not, and the button says which — there is no window
 * to hit and nothing to spoil.
 */
function Casts({ state }: { state: GameState }) {
  const c = state.casting.crucible;
  const [last, setLast] = useState<string | null>(null);

  return (
    <div className="panel p-3" data-testid="casts">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#c9a86a]">The moulds</span>
        <span className="tnum text-[10px] text-cave-400">{state.casting.cast} poured</span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        Pick a shape and pour. It cools into that part, in whatever is in the tub. Nothing here
        can be botched — you already know what you want.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-1">
        {PART_TYPES.map((t) => {
          const cost = partMelt(t);
          const ok = canCast(c, t);
          return (
            <button
              key={t}
              className={`btn flex items-baseline justify-between gap-1 px-2 py-1 text-[11px] ${ok ? '' : 'opacity-45'}`}
              disabled={!ok}
              title={PART_DEFS[t].governs}
              data-testid={`cast-${t}`}
              onClick={() => {
                const r = dispatch({ type: 'castPart', partType: t });
                setLast(r.ok
                  ? `${PART_DEFS[t].name} cast in ${materialDef(c.materialId).name}.`
                  : r.reason ?? null);
              }}
            >
              <span>{PART_DEFS[t].name}</span>
              <span className="tnum shrink-0 text-[10px] text-cave-500">{cost}</span>
            </button>
          );
        })}
      </div>
      {last && <div className="mt-1.5 text-center text-[11px] text-cave-300" data-testid="cast-note">{last}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3 — THE RACK
// ---------------------------------------------------------------------------

function Rack({ state }: { state: GameState }) {
  const onBench = new Set(Object.values(state.casting.bench));
  const rack = state.casting.rack.filter((p) => !onBench.has(p.id));

  return (
    <div className="panel p-3" data-testid="rack">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#9fc4dd]">The rack</span>
        <span className="tnum text-[10px] text-cave-400">{rack.length} spare</span>
      </div>
      {rack.length === 0 ? (
        <p className="mt-1 text-[11px] italic text-cave-500">
          Nothing cooling on it. Pour something.
        </p>
      ) : (
        <div className="mt-1.5 max-h-52 space-y-1 overflow-y-auto scroll-thin">
          {rack.map((p) => (
            <button
              key={p.id}
              className="flex w-full items-center gap-2 rounded-md border border-cave-800 p-1.5 text-left hover:border-cave-600"
              data-testid={`rack-${p.id}`}
              onClick={() => dispatch({ type: 'benchPlace', partId: p.id })}
            >
              <MaterialIcon id={p.materialId} size={18} />
              <span className="min-w-0 flex-1 truncate text-[11px] text-cave-300">
                <span className="text-cave-200">{PART_DEFS[p.type].name}</span>
                <span className="text-cave-500"> · {materialDef(p.materialId).name}</span>
              </span>
              <span className="tnum shrink-0 text-[10px] text-cave-500">{p.purity}</span>
              <span className="shrink-0 text-[10px] uppercase tracking-wider text-[#9fc4dd]">set</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4 — THE STATION
// ---------------------------------------------------------------------------

/** What the coherence number MEANS, in words. The number alone teaches nobody. */
function coherenceLine(t: ToolStats): string {
  const f = t.coherence.factor;
  if (t.parts.length < PART_TYPES.length) return 'Not finished — this is what it reads so far.';
  if (f >= 0.97) return 'These belong together. Nothing is fighting anything.';
  if (f >= 0.88) return 'Near enough a set. A world or two apart, and it barely notices.';
  if (f >= 0.65) return 'Mixed. The parts cooperate, but you can feel where they do not.';
  if (f >= 0.45) return 'Badly matched. Good pieces, and most of them wasted on each other.';
  return 'Seven strangers. They will never sit right, whatever they cost you.';
}

function coherenceColor(f: number): string {
  if (f >= 0.9) return '#9ab87a';
  if (f >= 0.65) return '#e0b054';
  return '#d8a0a0';
}

function StatGrid({ stats, testid }: { stats: Record<ToolStat, number>; testid?: string }) {
  return (
    <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5" data-testid={testid}>
      {TOOL_STATS.map((s) => (
        <div key={s} className="flex items-baseline justify-between gap-1 border-b border-cave-850 py-0.5">
          <span className="truncate text-[10px] text-cave-400">{STAT_LABEL[s]}</span>
          <span className="tnum shrink-0 text-[10px] text-cave-200" data-testid={testid ? `${testid}-${s}` : undefined}>
            {n0(stats[s])}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * THE COHERENCE READOUT. Three things, because one is not enough to teach it:
 * the percentage, the raw-vs-net loss in the same units so the cost is a real
 * number, and the sentence. The two terms that drive it (shell spread and
 * material variety) are printed underneath so a player can see WHICH of the two
 * they are paying for and fix the right one.
 */
function CoherenceReadout({ tool, testid }: { tool: ToolStats; testid: string }) {
  const c = tool.coherence;
  const pct = Math.round(c.factor * 100);
  return (
    <div className="mt-2 rounded-md border border-cave-800 bg-cave-900/60 p-2" data-testid={testid}>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">Coherence</span>
        <span
          className="tnum text-sm font-semibold"
          style={{ color: coherenceColor(c.factor) }}
          data-testid={`${testid}-pct`}
        >
          {pct}%
        </span>
      </div>
      <div className="text-[11px] italic leading-snug text-cave-400">{coherenceLine(tool)}</div>
      <div className="mt-1 tnum text-[10px] text-cave-500">
        shell spread {c.shellSpread.toFixed(2)} · variety {c.variety.toFixed(2)}
        {c.relief > 0 && (
          <span className="text-[#9ab87a]"> · stability forgives {Math.round(c.relief * 100)}%</span>
        )}
      </div>
      {c.factor < 1 && (
        <div className="mt-1 tnum text-[10px] text-cave-400" data-testid={`${testid}-loss`}>
          Rock rate {n0(tool.rawStats.bite * tool.rawStats.cadence)}
          <span className="text-cave-600"> → </span>
          <span style={{ color: coherenceColor(c.factor) }}>{n0(tool.rockRate)}</span>
          <span className="text-cave-600"> · what the mismatch costs you</span>
        </div>
      )}
    </div>
  );
}

function Station({ state }: { state: GameState }) {
  const preview = benchPreview(state);
  const ready = benchComplete(state);
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="panel p-3" data-testid="station">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#d4c9b8]">The tool station</span>
        <span className="tnum text-[10px] text-cave-400">
          {PART_TYPES.filter((t) => state.casting.bench[t] !== undefined).length}/7
        </span>
      </div>

      <div className="mt-2 space-y-1">
        {PART_TYPES.map((t: PartType) => {
          const id = state.casting.bench[t];
          const part = id === undefined ? undefined : rackPart(state, id);
          return (
            <div
              key={t}
              className={`flex items-center gap-2 rounded-md border p-1.5 ${part ? 'border-cave-700 bg-cave-850/40' : 'border-dashed border-cave-800'}`}
              data-testid={`slot-${t}`}
            >
              <span className="w-14 shrink-0 text-[10px] uppercase tracking-wider text-cave-500">
                {PART_DEFS[t].name}
              </span>
              {part ? (
                <>
                  <MaterialIcon id={part.materialId} size={16} />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-cave-300">
                    {materialDef(part.materialId).name}
                  </span>
                  <span className="tnum shrink-0 text-[10px] text-cave-500">{part.purity}</span>
                  <button
                    className="btn shrink-0 px-1.5 py-0.5 text-[10px]"
                    data-testid={`clear-${t}`}
                    onClick={() => dispatch({ type: 'benchClear', partType: t })}
                  >
                    ✕
                  </button>
                </>
              ) : (
                <span className="flex-1 truncate text-[11px] italic text-cave-600">
                  {PART_DEFS[t].governs}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {preview && (
        <>
          <CoherenceReadout tool={preview} testid="bench-coherence" />
          <StatGrid stats={preview.stats} testid="bench-stats" />
          <div className="mt-1.5 flex items-baseline justify-between tnum text-[10px]">
            <span className="text-cave-500">Rock rate <span className="text-cave-200">{n0(preview.rockRate)}</span></span>
            <span className="text-cave-500">Ore rate <span className="text-cave-200">{n0(preview.oreRate)}</span></span>
          </div>
        </>
      )}

      <button
        className="btn btn-warm mt-2 w-full py-1.5 text-xs"
        disabled={!ready}
        data-testid="combine"
        onClick={() => {
          const r = dispatch({ type: 'buildTool' });
          const d = r.data as { returned?: number } | undefined;
          setNote(r.ok
            ? d?.returned
              ? `Built. The old tool's ${d.returned} parts are back on the rack.`
              : 'Built. It is yours.'
            : r.reason ?? null);
        }}
      >
        {ready ? 'Combine them' : 'Seven parts, one of each'}
      </button>
      {note && <div className="mt-1 text-center text-[11px] text-cave-300" data-testid="build-note">{note}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5 — YOUR TOOL
// ---------------------------------------------------------------------------

/**
 * ONE TOOL YOU GROW, per the doc's open question 1. Building a new one does not
 * consume the old — its parts go back on the rack — so swapping a head is a
 * decision you can take back, which is what "you never throw it away" has to
 * mean mechanically.
 */
function YourTool({ state }: { state: GameState }) {
  const tool = currentTool(state);
  if (!tool) {
    return (
      <div className="panel p-3 text-center text-[11px] italic text-cave-500" data-testid="your-tool-empty">
        You have not built one yet. Seven parts, and it is yours.
      </div>
    );
  }
  return (
    <div className="panel p-3" data-testid="your-tool">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#e0b054]">Your tool</span>
        <span className="tnum text-[10px] text-cave-400">built {state.casting.built}×</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {tool.parts.map((p) => (
          <span key={p.type} className="rounded border border-cave-800 px-1 py-0.5 text-[9px] text-cave-400">
            {PART_DEFS[p.type as PartType].name.slice(0, 4)} · {materialDef(p.materialId).name}
          </span>
        ))}
      </div>
      <CoherenceReadout tool={tool} testid="tool-coherence" />
      <StatGrid stats={tool.stats} testid="tool-stats" />
      <div className="mt-1.5 flex items-baseline justify-between tnum text-[10px]">
        <span className="text-cave-500">Rock rate <span className="text-cave-200">{n0(tool.rockRate)}</span></span>
        <span className="text-cave-500">Ore rate <span className="text-cave-200">{n0(tool.oreRate)}</span></span>
      </div>
      <p className="mt-1.5 text-[10px] italic leading-snug text-cave-500">
        It does not swing at anything yet — the tool meets the rock in a later step. What it is
        made of is settled here.
      </p>
      <button
        className="btn mt-1.5 w-full py-1 text-[11px]"
        data-testid="breakdown"
        onClick={() => dispatch({ type: 'breakDownTool' })}
      >
        Take it apart · every piece comes back
      </button>
    </div>
  );
}
