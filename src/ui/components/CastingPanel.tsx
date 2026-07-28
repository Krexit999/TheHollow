/**
 * THE CASTING FLOOR — the new Forge.
 *
 * Four boards, one room, and the order is the loop: THE CRUCIBLE (melt), THE
 * MOULDS (pour), THE RACK (what you have made), THE STATION (build).
 *
 * PLAIN PANELS AND CSS, NO CANVAS. The one visual that matters — watching a
 * stone become liquid — is two divs whose widths come off `crucibleFill` and
 * whose COLOUR is the material's own palette, the same three shades its ore
 * chunk is drawn from. A canvas UI on this codebase has been tried and reverted
 * twice; nothing here needs one.
 *
 * WHAT THIS PANEL LEARNED THE HARD WAY:
 *
 *  - A TWELVE-NUMBER STAT WALL TELLS A PLAYER NOTHING. The headline is now
 *    three things the tool DOES, each with a bar and a word; the raw stat block
 *    is folded away for anyone who wants it. `Bite 155449` is not information.
 *  - EVERY NUMBER GOES THROUGH `fmt`, so it obeys the player's suffix /
 *    scientific / engineering setting. Nineteen raw digits is not a number, it
 *    is a wall.
 *  - A COHERENCE FIGURE WITHOUT THE LEVER IS JUST A SCOLDING. "29% — seven
 *    strangers" tells you that you are wrong, not what to do. It now names the
 *    world the set mostly belongs to and the exact parts pulling against it.
 *  - THE RACK IS AN INVENTORY, NOT A CHECKLIST. A vertical list of every part
 *    you have ever poured stops being readable at about a dozen.
 */
import { useState } from 'react';
import type { GameState } from '../../engine';
import { fmt } from '../../engine';
import { BANDS, bandOf, BAND_LABELS, materialDef, type PurityBand } from '../../engine/materials';
import {
  PART_DEFS, PART_TYPES, STAT_LABEL, TOOL_STATS, type PartType,
} from '../../engine/content/forgeParts';
import { partMelt, type ToolStats } from '../../engine/systems/forgeParts';
import {
  MELT_BACK_SHARE, MELT_PER_UNIT, QUEUE_MAX, TUB_CAPACITY, FULL_SET_MELT,
  benchComplete, benchPreview, canCast, crucibleFill, currentTool, frontCharge,
  meltBackValue, queued, rackPart, tubHeld, unitsThatFit, type RackPart,
} from '../../engine/systems/casting';
import {
  MAX_EXTRA_CELLS, ORE_RATE_CAP, REACH_EVERY, REPAIR_UNITS, SLOT_EVERY,
  castingToolTier, effectOf, grantsFor, isBroken, levelProgress, modSlotsOf,
  repairShare, toolLevel, usesLeft, usesOf, wear01, wornPart,
} from '../../engine/systems/toolMining';
import { materialCount } from '../../engine/systems/forge';
import { shellOrdinal } from '../../engine/content/drillAlloys';
import { dispatch, useGame } from '../store';
import { MaterialIcon } from './MaterialIcon';
import { Select } from './Select';

const useLive = () => {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  return state;
};

const cap1 = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Every material the Hold actually has, for the charge picker. */
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
      <YourTool state={state as GameState} />
      <Crucible state={state as GameState} />
      <Casts state={state as GameState} />
      <Rack state={state as GameState} />
      <Station state={state as GameState} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared: the "what does this number mean" language
// ---------------------------------------------------------------------------

const RATINGS = ['weak', 'fair', 'good', 'strong', 'exceptional'] as const;
const RATING_COLOR = ['#8a7f70', '#b0a494', '#9ab87a', '#e0b054', '#e0902a'];

function rate01(x: number): number {
  return Math.max(0, Math.min(RATINGS.length - 1, Math.floor(x * RATINGS.length * 0.999)));
}

/**
 * ONE THING THE TOOL DOES, WITH SOMETHING TO JUDGE IT AGAINST. A bar for
 * where it sits in the possible range, a word for what that means, and the
 * number last — because the number is the part a player cannot use.
 */
function Gauge(
  { label, value, frac, note, testid }:
  { label: string; value: string; frac: number; note?: string; testid?: string },
) {
  const i = rate01(frac);
  return (
    <div className="py-1" data-testid={testid}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[11px] text-cave-300">{label}</span>
        <span className="shrink-0 tnum text-[11px]">
          <span className="text-cave-200">{value}</span>
          <span className="ml-1 text-[9px] uppercase tracking-wider" style={{ color: RATING_COLOR[i] }}>
            {RATINGS[i]}
          </span>
        </span>
      </div>
      <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-cave-950">
        <div
          className="h-full transition-[width] duration-300"
          style={{ width: `${Math.min(1, Math.max(0.02, frac)) * 100}%`, background: RATING_COLOR[i] }}
        />
      </div>
      {note && <div className="mt-0.5 text-[10px] italic text-cave-500">{note}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1 — THE CRUCIBLE
// ---------------------------------------------------------------------------

/** The melt wears the material's own three shades — the ore chunk, liquefied. */
function moltenStyle(materialId: string): React.CSSProperties {
  if (!materialId) return { background: '#241f1b' };
  const p = materialDef(materialId).palette;
  return {
    backgroundImage:
      `linear-gradient(100deg, ${p[0]} 0%, ${p[1]} 30%, ${p[2]} 48%, ${p[1]} 66%, ${p[0]} 100%)`,
  };
}

function Crucible({ state }: { state: GameState }) {
  const held = heldMaterials(state);
  const c = state.casting.crucible;
  const front = frontCharge(c);
  const q = queued(c);
  const [pick, setPick] = useState<string>('');
  const [note, setNote] = useState<string | null>(null);
  const fill = crucibleFill(c);
  const fits = unitsThatFit(c);
  // NO LOCK ANY MORE. The tub used to hold one stone and the picker was pinned
  // to it; the queue is exactly the removal of that restriction.
  const target = (pick || held[0]?.id) ?? '';
  const haveTarget = target ? held.find((m) => m.id === target)?.count ?? 0 : 0;

  const charge = (units: number): void => {
    const r = dispatch({ type: 'chargeCrucible', materialId: target, units });
    setNote(r.ok ? null : r.reason ?? 'It would not take.');
  };

  return (
    <div className="panel p-3" data-testid="crucible">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#e0902a]">The crucible</span>
        <span className="tnum text-[10px] text-cave-400" data-testid="melt-readout">
          {fmt(Math.floor(front?.molten ?? 0))} / {TUB_CAPACITY} melt
          {q.length > 1 && <span className="text-cave-600"> · {fmt(Math.floor(tubHeld(c)))} in the tub</span>}
        </span>
      </div>

      {/* THE TUB. Two flat divs; the molten one wears the FRONT stone's own
          colours, because the front stone is what the next pour comes out as. */}
      <div className="mt-2 h-7 w-full overflow-hidden rounded-md border border-cave-700 bg-cave-950">
        <div className="flex h-full w-full">
          <div
            className="melt-sheen h-full transition-[width] duration-200 ease-linear"
            style={{ width: `${fill.molten01 * 100}%`, ...moltenStyle(front?.materialId ?? '') }}
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
          {front ? (
            <>
              <MaterialIcon id={front.materialId} size={16} />
              <span className="truncate text-[11px] text-cave-300">{materialDef(front.materialId).name}</span>
              <span className="tnum shrink-0 text-[10px] text-cave-500">
                {BAND_LABELS[bandOf(front.purity)]} · {Math.round(front.purity)}
              </span>
            </>
          ) : (
            <span className="text-[11px] italic text-cave-500">Cold and empty.</span>
          )}
        </div>
        {front && front.solid > 0 ? (
          <span className="shrink-0 text-[10px] uppercase tracking-wider text-cave-400" data-testid="melting">
            melting · {fmt(Math.ceil(front.solid))}
          </span>
        ) : front ? (
          <button
            className="btn shrink-0 px-1.5 py-0.5 text-[10px]"
            onClick={() => dispatch({ type: 'drainCrucible', index: 0 })}
          >
            Tip it out
          </button>
        ) : null}
      </div>

      {/* ── THE QUEUE ──────────────────────────────────────────────────────
          Several stones sit in the tub at once. The FIRST is what pours; tap
          any other and it comes forward, which is the whole verb. Chips rather
          than a list, because the question here is "which is next" — a glance,
          not a read — and the tub's colour answers it too. */}
      {q.length > 0 && (
        <div className="mt-2 border-t border-cave-800 pt-2" data-testid="queue">
          <div className="flex items-baseline justify-between">
            <span className="text-[9px] uppercase tracking-widest text-cave-500">
              In the tub · {q.length}/{QUEUE_MAX}
            </span>
            {q.length > 1 && <span className="text-[9px] italic text-cave-600">tap one to pour it next</span>}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {q.map((ch, i) => (
              <button
                key={ch.materialId}
                className={`flex items-center gap-1 rounded border px-1.5 py-1 text-[10px] ${
                  i === 0
                    ? 'border-[#e0902a]/70 bg-cave-800/60 text-cave-100'
                    : 'border-cave-800 text-cave-400 hover:border-cave-600'
                }`}
                data-testid={`queue-${i}`}
                title={`${materialDef(ch.materialId).name} · ${Math.floor(ch.molten)} melt ready`
                  + (i === 0 ? ' · pouring next' : ' · tap to bring it forward')}
                onClick={() => dispatch({ type: 'bringToFront', index: i })}
              >
                <MaterialIcon id={ch.materialId} size={14} />
                <span className="max-w-[64px] truncate">{materialDef(ch.materialId).name}</span>
                <span className="tnum text-cave-500">{Math.floor(ch.molten)}</span>
                {i === 0 && <span className="text-[8px] uppercase tracking-wider text-[#e0902a]">next</span>}
                {ch.solid > 0 && <span className="text-[8px] text-cave-600">…</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2 border-t border-cave-800 pt-2">
        <Select
          className="w-full"
          ariaLabel="Material to melt"
          value={target}
          onChange={(v) => setPick(v)}
          options={held.length === 0
            ? [{ value: '', label: '— the Hold is empty —' }]
            : held.map((m) => ({
              value: m.id,
              label: `${materialDef(m.id).name} ×${fmt(m.count)} · ${BAND_LABELS[m.band]}`,
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
// 2 — THE MOULDS
// ---------------------------------------------------------------------------

function Casts({ state }: { state: GameState }) {
  const c = state.casting.crucible;
  const [last, setLast] = useState<string | null>(null);

  return (
    <div className="panel p-3" data-testid="casts">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#c9a86a]">The moulds</span>
        <span className="tnum text-[10px] text-cave-400">{fmt(state.casting.cast)} poured</span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        Pick a shape and pour. Nothing here can be botched — you already know what you want.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-1">
        {PART_TYPES.map((t) => {
          const ok = canCast(c, t);
          return (
            <button
              key={t}
              className={`btn flex items-baseline justify-between gap-1 px-2 py-1 text-[11px] ${ok ? '' : 'opacity-45'}`}
              disabled={!ok}
              title={PART_DEFS[t].governs}
              data-testid={`cast-${t}`}
              onClick={() => {
                // Read the stone BEFORE the pour: a charge that empties leaves
                // the queue, so afterwards the front is already the next one.
                const was = frontCharge(c)?.materialId;
                const r = dispatch({ type: 'castPart', partType: t });
                setLast(r.ok && was
                  ? `${PART_DEFS[t].name} cast in ${materialDef(was).name}.`
                  : r.reason ?? null);
              }}
            >
              <span>{PART_DEFS[t].name}</span>
              <span className="tnum shrink-0 text-[10px] text-cave-500">{partMelt(t)}</span>
            </button>
          );
        })}
      </div>
      {last && <div className="mt-1.5 text-center text-[11px] text-cave-300" data-testid="cast-note">{last}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3 — THE RACK, as an inventory
// ---------------------------------------------------------------------------

/**
 * A GRID YOU CAN SCAN, not a list you have to read. Every part is one tile:
 * the material's own chunk art, the shape in three letters, the purity. It
 * stays readable at fifty parts, which the vertical list it replaced did not.
 *
 * TAPPING A TILE DOES ONE THING, and which thing is a MODE rather than a second
 * button on every tile. Melting is destructive and 40% lossy, so it should take
 * a deliberate switch rather than sit one mis-tap away from "set on station" on
 * a 380px screen.
 */
function Rack({ state }: { state: GameState }) {
  const onBench = new Set(Object.values(state.casting.bench));
  const all = state.casting.rack.filter((p) => !onBench.has(p.id));
  const [mode, setMode] = useState<'set' | 'melt'>('set');
  const [filter, setFilter] = useState<PartType | 'all'>('all');
  const [note, setNote] = useState<string | null>(null);

  const counts = new Map<PartType, number>();
  for (const p of all) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  const rack = (filter === 'all' ? all : all.filter((p) => p.type === filter))
    .slice()
    .sort((a, b) => PART_TYPES.indexOf(a.type) - PART_TYPES.indexOf(b.type)
      || materialDef(a.materialId).name.localeCompare(materialDef(b.materialId).name)
      || b.purity - a.purity);

  const tap = (p: RackPart): void => {
    if (mode === 'set') { dispatch({ type: 'benchPlace', partId: p.id }); setNote(null); return; }
    const r = dispatch({ type: 'meltBack', partId: p.id });
    setNote(r.ok
      ? `${PART_DEFS[p.type].name} back to ${fmt((r.data as { molten: number }).molten)} melt.`
      : r.reason ?? null);
  };

  return (
    <div className="panel p-3" data-testid="rack">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#9fc4dd]">The rack</span>
        <span className="tnum text-[10px] text-cave-400">{fmt(all.length)} spare</span>
      </div>

      {all.length === 0 ? (
        <p className="mt-1 text-[11px] italic text-cave-500">Nothing cooling on it. Pour something.</p>
      ) : (
        <>
          <div className="mt-1.5 flex gap-1">
            {(['set', 'melt'] as const).map((m) => (
              <button
                key={m}
                className={`flex-1 rounded border px-2 py-1 text-[10px] uppercase tracking-wider ${
                  mode === m ? 'border-[#9fc4dd]/60 bg-cave-800 text-cave-200' : 'border-cave-800 text-cave-500'
                }`}
                data-testid={`rack-mode-${m}`}
                onClick={() => { setMode(m); setNote(null); }}
              >
                {m === 'set' ? 'Tap to set' : `Tap to melt · ${Math.round(MELT_BACK_SHARE * 100)}% back`}
              </button>
            ))}
          </div>

          {counts.size > 1 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(['all', ...PART_TYPES.filter((t) => counts.has(t))] as Array<PartType | 'all'>).map((t) => (
                <button
                  key={t}
                  className={`rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${
                    filter === t ? 'border-cave-500 text-cave-200' : 'border-cave-800 text-cave-500'
                  }`}
                  data-testid={`rack-filter-${t}`}
                  onClick={() => setFilter(t)}
                >
                  {t === 'all' ? `All ${all.length}` : `${PART_DEFS[t].name} ${counts.get(t)}`}
                </button>
              ))}
            </div>
          )}

          <div
            className="mt-1.5 grid max-h-64 grid-cols-4 gap-1 overflow-y-auto scroll-thin"
            data-testid="rack-grid"
          >
            {rack.map((p) => (
              <button
                key={p.id}
                className={`flex flex-col items-center rounded-md border p-1 hover:border-cave-500 ${
                  mode === 'melt' ? 'border-[#d8a0a0]/40' : 'border-cave-800'
                }`}
                data-testid={`rack-${p.id}`}
                title={`${PART_DEFS[p.type].name} · ${materialDef(p.materialId).name} · purity ${p.purity}`
                  + (mode === 'melt' ? ` · melts back to ${meltBackValue(p.type)}` : '')}
                onClick={() => tap(p)}
              >
                <MaterialIcon id={p.materialId} size={22} />
                <span className="mt-0.5 w-full truncate text-center text-[9px] uppercase tracking-wide text-cave-300">
                  {PART_DEFS[p.type].name.slice(0, 4)}
                </span>
                <span className="tnum text-[9px] text-cave-500">{p.purity}</span>
              </button>
            ))}
          </div>
          {note && <div className="mt-1 text-center text-[11px] text-cave-300" data-testid="rack-note">{note}</div>}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4 — COHERENCE, WITH THE LEVER
// ---------------------------------------------------------------------------

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

/**
 * WHICH PARTS ARE PULLING, AND TOWARD WHAT. A percentage tells a player they
 * are wrong; this tells them what to change. The set has a HOME — the world
 * most of its parts come from — and everything else is named with the world it
 * came from instead, so the fix is a sentence rather than an inference.
 */
function outliers(tool: ToolStats): { home: string; strays: Array<{ type: PartType; shell: string }> } {
  const byShell = new Map<string, number>();
  for (const p of tool.parts) {
    const s = materialDef(p.materialId).shellId;
    byShell.set(s, (byShell.get(s) ?? 0) + 1);
  }
  let home = '';
  let best = -1;
  for (const [s, n] of byShell) {
    // Ties go to the DEEPER world: it is the one worth keeping and the cheaper
    // instruction ("bring the rest down to it" beats "throw away your best part").
    if (n > best || (n === best && shellOrdinal(s) > shellOrdinal(home))) { best = n; home = s; }
  }
  const strays = tool.parts
    .filter((p) => materialDef(p.materialId).shellId !== home)
    .map((p) => ({ type: p.type, shell: materialDef(p.materialId).shellId }));
  return { home, strays };
}

function CoherenceReadout({ tool, testid }: { tool: ToolStats; testid: string }) {
  const c = tool.coherence;
  const pct = Math.round(c.factor * 100);
  const { home, strays } = outliers(tool);
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

      {/* THE LEVER. Never just the diagnosis. */}
      {strays.length > 0 ? (
        <div className="mt-1 rounded border-l-2 border-[#e0b054]/60 bg-cave-950/50 py-1 pl-2 pr-1"
          data-testid={`${testid}-fix`}>
          <div className="text-[10px] leading-snug text-cave-300">
            <span className="text-[#e0b054]">To raise it: </span>
            this set is mostly <span className="text-cave-100">{cap1(home)}</span>.{' '}
            {strays.length === 1 ? 'One part is not: ' : `${strays.length} parts are not: `}
            {strays.map((s, i) => (
              <span key={s.type}>
                {i > 0 && ', '}
                <span className="text-cave-100">{PART_DEFS[s.type].name}</span>
                <span className="text-cave-500"> ({cap1(s.shell)})</span>
              </span>
            ))}
            . Re-cast {strays.length === 1 ? 'it' : 'them'} in {cap1(home)} stock and the whole tool
            sits better — or lean the other way and put a <span className="text-cave-100">trueseated</span> stone
            in the Binding, which forgives mismatch.
          </div>
        </div>
      ) : tool.parts.length > 1 && (
        <div className="mt-1 text-[10px] leading-snug text-[#9ab87a]" data-testid={`${testid}-fix`}>
          Every part is {cap1(home)}. Parts from one world sit together — this is as well-matched
          as a set gets.
        </div>
      )}

      <div className="mt-1 tnum text-[10px] text-cave-500">
        shell spread {c.shellSpread.toFixed(2)} · variety {c.variety.toFixed(2)}
        {c.relief > 0 && (
          <span className="text-[#9ab87a]"> · stability forgives {Math.round(c.relief * 100)}%</span>
        )}
      </div>
      {c.factor < 1 && (
        <div className="mt-1 tnum text-[10px] text-cave-400" data-testid={`${testid}-loss`}>
          Rock rate {fmt(tool.rawStats.bite * tool.rawStats.cadence)}
          <span className="text-cave-600"> → </span>
          <span style={{ color: coherenceColor(c.factor) }}>{fmt(tool.rockRate)}</span>
          <span className="text-cave-600"> · what the mismatch costs you</span>
        </div>
      )}
    </div>
  );
}

/** The raw block, folded away. Kept because a builder eventually wants it. */
function RawStats({ tool, testid }: { tool: ToolStats; testid: string }) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-cave-500">
        Every number
      </summary>
      <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5" data-testid={testid}>
        {TOOL_STATS.map((s) => (
          <div key={s} className="flex items-baseline justify-between gap-1 border-b border-cave-850 py-0.5">
            <span className="truncate text-[10px] text-cave-400">{STAT_LABEL[s]}</span>
            <span className="tnum shrink-0 text-[10px] text-cave-200" data-testid={`${testid}-${s}`}>
              {fmt(tool.stats[s])}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// 5 — THE STATION
// ---------------------------------------------------------------------------

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
          {ready && <WhatItWouldDo tool={preview} testid="bench-does" />}
          <RawStats tool={preview} testid="bench-stats" />
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
// 6 — YOUR TOOL
// ---------------------------------------------------------------------------

/**
 * THE THREE THINGS A TOOL DOES. This is the headline and everything else is
 * folded behind it, because a player glancing at a tool needs to know whether
 * it is good — not to parse ten figures in four different units.
 */
function WhatItWouldDo({ tool, testid }: { tool: ToolStats; testid: string }) {
  const e = effectOf(tool, false);
  return (
    <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid={testid}>
      <div className="text-[10px] uppercase tracking-widest text-cave-500">What it would do</div>
      <Gauge
        label="Reach — cells a swing touches"
        value={`${e.cells}`}
        frac={(e.cells - 1) / MAX_EXTRA_CELLS}
        testid={`${testid}-reach`}
      />
      <Gauge
        label="Ore — how fast it opens a pocket"
        value={`${e.oreRate.toFixed(1)}×`}
        frac={(e.oreRate - 1) / (ORE_RATE_CAP - 1)}
        testid={`${testid}-ore`}
      />
      <Gauge
        label="Lasts — swings before re-seating"
        value={fmt(usesOf(tool))}
        frac={Math.min(1, usesOf(tool) / 8000)}
        testid={`${testid}-lasts`}
      />
    </div>
  );
}

/**
 * WHAT USE HAS EARNED — the readout for the one thing that makes a tool yours.
 *
 * Three things, in the order a player asks them: what level am I, how far to
 * the next, and what have the levels actually given me. The last is the part
 * that is usually missing from a levelling system and the part that makes it
 * feel earned: "+30% swings, +20% pocket work, 1 modifier slot" is a record of
 * your own hours, where "Level 6" on its own is a number.
 */
function LevelCard({ state, tool }: { state: GameState; tool: ToolStats }) {
  const p = levelProgress(state);
  const g = grantsFor(p.level);
  const slots = modSlotsOf(state, tool);
  const toNextSlot = SLOT_EVERY - ((p.level - 1) % SLOT_EVERY);
  const toNextReach = REACH_EVERY - ((p.level - 1) % REACH_EVERY);

  return (
    <div className="mt-2 rounded-md border border-[#e0b054]/30 bg-cave-900/60 p-2" data-testid="tool-level">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">Level</span>
        <span className="tnum text-sm font-semibold text-[#e0b054]" data-testid="tool-level-n">
          {p.level}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-cave-950">
        <div
          className="h-full bg-[#e0b054] transition-[width] duration-300"
          style={{ width: `${p.frac * 100}%` }}
          data-testid="tool-level-bar"
        />
      </div>
      <div className="mt-0.5 tnum text-[10px] text-cave-500" data-testid="tool-level-progress">
        {fmt(p.into)} / {fmt(p.need)} cells to level {p.level + 1} · {fmt(p.xp)} mined with it
      </div>

      {p.level > 1 ? (
        <div className="mt-1 text-[10px] leading-snug text-cave-300" data-testid="tool-level-grants">
          <span className="text-[#e0b054]">Earned: </span>
          +{Math.round((g.durability - 1) * 100)}% swings
          {g.oreRate > 1 && <> · +{Math.round((g.oreRate - 1) * 100)}% pocket work</>}
          {g.cells > 0 && <> · +{g.cells} cell{g.cells === 1 ? '' : 's'} of reach</>}
          {g.slots > 0 && <> · {g.slots} modifier slot{g.slots === 1 ? '' : 's'}</>}
        </div>
      ) : (
        <div className="mt-1 text-[10px] italic leading-snug text-cave-500">
          Mine with it. A tool you have worked is better than the same tool fresh off the station.
        </div>
      )}
      <div className="mt-0.5 tnum text-[10px] text-cave-600">
        {slots.total} modifier slot{slots.total === 1 ? '' : 's'}
        <span className="text-cave-700"> ({slots.fromParts} from its parts{slots.fromUse > 0 ? `, ${slots.fromUse} earned` : ''})</span>
        {' · '}next slot at level {p.level + toNextSlot} · next cell at {p.level + toNextReach}
      </div>
    </div>
  );
}

function AtTheFace({ state, tool }: { state: GameState; tool: ToolStats }) {
  const broken = isBroken(state, tool);
  const e = effectOf(tool, broken, toolLevel(state));
  const tier = castingToolTier(state);
  return (
    <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid="at-the-face">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">At the face</span>
        <span className="text-[9px] uppercase tracking-wider text-cave-600">bare hands reach 1</span>
      </div>
      <Gauge
        label="Reach — cells a swing touches"
        value={`${e.cells}`}
        frac={(e.cells - 1) / MAX_EXTRA_CELLS}
        note={e.cells > 1 ? `taking ${Math.round(e.splash * 100)}% of each extra` : 'the cell you hit, and nothing else'}
        testid="face-reach"
      />
      <Gauge
        label="Ore — how fast it opens a pocket"
        value={`${e.oreRate.toFixed(1)}×`}
        frac={(e.oreRate - 1) / (ORE_RATE_CAP - 1)}
        testid="face-ore"
      />
      <div className="mt-1 flex items-baseline justify-between border-t border-cave-850 pt-1">
        <span className="text-[10px] text-cave-400">Hard rock it can pass</span>
        <span className="tnum text-[10px] text-cave-200" data-testid="face-tier">Tier {tier}</span>
      </div>
      <p className="mt-1 text-[10px] italic leading-snug text-cave-500">
        It clears the face faster. It cannot make the face hold more — the rock grows what it
        grows, and a swing only ever takes what is there.
      </p>
    </div>
  );
}

function Durability({ state, tool }: { state: GameState; tool: ToolStats }) {
  const broken = isBroken(state, tool);
  const w = wear01(state, tool);
  const worn = wornPart(tool);
  const left = usesLeft(state, tool);
  const part = worn ? tool.parts.find((p) => p.type === worn) : undefined;
  const have = part ? materialCount(state, part.materialId) : 0;
  const canRepair = !!part && have >= REPAIR_UNITS && state.casting.wear > 0;
  const back = worn ? Math.round(repairShare(tool, worn) * 100) : 0;

  return (
    <div className="mt-2 rounded-md border border-cave-800 bg-cave-900/60 p-2" data-testid="durability">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">Condition</span>
        <span
          className="tnum text-[11px] font-semibold"
          style={{ color: broken ? '#d8a0a0' : w > 0.7 ? '#e0b054' : '#9ab87a' }}
          data-testid="durability-state"
        >
          {broken ? 'BROKEN' : `${fmt(left)} swings left`}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full border border-cave-700 bg-cave-950">
        <div
          className="h-full transition-[width] duration-300"
          style={{
            width: `${(1 - w) * 100}%`,
            background: broken ? '#7a4a4a' : w > 0.7 ? '#e0b054' : '#9ab87a',
          }}
          data-testid="durability-bar"
        />
      </div>
      <div className="mt-1 tnum text-[10px] text-cave-500">
        {fmt(usesOf(tool, toolLevel(state)))} swings when whole
        {worn && <> · the <span className="text-cave-300">{PART_DEFS[worn].name}</span> is what is giving</>}
      </div>
      {broken && (
        <p className="mt-1 text-[10px] italic leading-snug text-[#d8a0a0]" data-testid="broken-note">
          It still works — heavily penalised, never worse than your hands. It is not lost. It
          wants seeing to.
        </p>
      )}
      {part && (
        <button
          className="btn mt-1.5 w-full py-1 text-[11px]"
          disabled={!canRepair}
          data-testid="repair"
          onClick={() => dispatch({ type: 'repairTool', partType: part.type })}
        >
          {state.casting.wear <= 0
            ? 'Nothing to put right'
            : have < REPAIR_UNITS
              ? `Needs ${REPAIR_UNITS} ${materialDef(part.materialId).name} — you have ${fmt(have)}`
              : `Re-seat the ${PART_DEFS[part.type].name} · ${REPAIR_UNITS} ${materialDef(part.materialId).name} · gives back ${back}%`}
        </button>
      )}
    </div>
  );
}

function YourTool({ state }: { state: GameState }) {
  const tool = currentTool(state);
  if (!tool) {
    return (
      <div className="panel p-3 text-center text-[11px] italic text-cave-500" data-testid="your-tool-empty">
        You have not built one yet. Melt a stone, pour seven parts, and it is yours.
      </div>
    );
  }
  return (
    <div className="panel p-3" data-testid="your-tool">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#e0b054]">Your tool</span>
        <span className="tnum text-[10px] text-cave-400">built {fmt(state.casting.built)}×</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {tool.parts.map((p) => (
          <span key={p.type} className="rounded border border-cave-800 px-1 py-0.5 text-[9px] text-cave-400">
            {PART_DEFS[p.type as PartType].name.slice(0, 4)} · {materialDef(p.materialId).name}
          </span>
        ))}
      </div>
      <LevelCard state={state} tool={tool} />
      <AtTheFace state={state} tool={tool} />
      <Durability state={state} tool={tool} />
      <CoherenceReadout tool={tool} testid="tool-coherence" />
      <RawStats tool={tool} testid="tool-stats" />
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
