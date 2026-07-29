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
  BOON_BY_ID, CRAFT_COLOR, CRAFT_LABEL, GROWTH_BOONS, GROWTH_MAX, LAYER_NAMES,
  MASTERWORK_BY_ID, PART_DEFS, PART_TYPES, STAT_LABEL, TOOL_STATS, defaultShape,
  shapeDef, shapesFor,
  type PartShape, type PartType,
} from '../../engine/content/forgeParts';
import {
  balanceOf, craftFold, growthFold, growthProgress, isLiving, partMaterials,
  shapeFold, type ToolStats,
} from '../../engine/systems/forgeParts';
import { readBio } from '../../engine/systems/toolBio';
import { allShells } from '../../engine/shells';
import {
  MELT_BACK_SHARE, MELT_PER_UNIT, QUEUE_MAX, TUB_CAPACITY, FULL_SET_MELT,
  benchComplete, benchPreview, canCast, crucibleFill, currentTool, frontCharge,
  castMelt, layerDraw, meltBackValue, queued, rackPart, tubHeld, unitsThatFit,
  type RackPart,
} from '../../engine/systems/casting';
import { TOOL_CLASSES } from '../../engine/content/toolClasses';
import { toolClass } from '../../engine/systems/toolClass';
import {
  MAX_EXTRA_CELLS, ORE_RATE_CAP, REACH_EVERY, REPAIR_UNITS, SLOT_EVERY,
  castingToolTier, effectOf, grantsFor, isBroken, levelProgress, modSlotsOf,
  repairShare, toolEffect, toolLevel, usesLeft, usesOf, wear01, wornPart,
} from '../../engine/systems/toolMining';
import { materialCount } from '../../engine/systems/forge';
import { ROMAN, shellOrdinal } from '../../engine/content/drillAlloys';
import { TOOL_CARRIER } from '../../engine/systems/drillAlloys';
import {
  ABILITY_PARTS, abilityMaterials, effectInHand, toolAbilityHint, toolAbilitySlots,
  toolFits, toolGrade, toolGrants,
} from '../../engine/systems/toolAbilities';
import { MOD_BY_ID, SYNERGY_BY_ID, abilityLevelOf } from '../../engine/content/toolMods';
import {
  MOD_FEED_MAX, knownMods, modCache, modHint, modProgress, modSlotsTotal,
  modSlotsUsed, modStacks, synergyHints, toolInstability, whyDormant,
  type ModCache, type ToolModStack,
} from '../../engine/systems/toolMods';
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

/**
 * THE MOULDS — now two questions instead of one.
 *
 * It used to be seven buttons: pick a part, pour. A shape is a second axis and
 * it needs room to be read, so the pour is a two-step now — choose the PART,
 * then choose the MOULD, with the shape's blurb under it. That is more clicks
 * for a plain pour, and it buys the thing the phase exists for: you can see
 * what a Needle is before you commit stock to one.
 *
 * The blurb says what the shape IS; the effect line says what it does. Both are
 * shown up front — a cast shape is not a pillar-5 discovery, it is a decision,
 * and a decision you cannot read is a coin toss.
 */
function Casts({ state }: { state: GameState }) {
  const c = state.casting.crucible;
  const [last, setLast] = useState<string | null>(null);
  const [part, setPart] = useState<PartType>('head');
  const [shapes, setShapes] = useState<Partial<Record<PartType, PartShape>>>({});
  const [layers, setLayers] = useState(1);

  const chosen = shapes[part] ?? defaultShape(part);
  const options = shapesFor(part);
  const cast = shapeDef(chosen, part);
  const want = castMelt(part, chosen, layers);
  const ok = canCast(c, part, chosen, layers);

  return (
    <div className="panel p-3" data-testid="casts">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#c9a86a]">The moulds</span>
        <span className="tnum text-[10px] text-cave-400">{fmt(state.casting.cast)} poured</span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        Pick a part, pick the mould it goes in, and pour. Nothing here can be botched.
      </p>

      <div className="mt-2 grid grid-cols-2 gap-1">
        {PART_TYPES.map((t) => {
          const sel = t === part;
          const s = shapes[t] ?? defaultShape(t);
          return (
            <button
              key={t}
              className={`flex items-baseline justify-between gap-1 rounded border px-2 py-1 text-[11px] ${
                sel ? 'border-[#e0902a]/70 bg-cave-800/60 text-cave-100' : 'border-cave-800 text-cave-400'
              }`}
              title={PART_DEFS[t].governs}
              data-testid={`cast-part-${t}`}
              onClick={() => setPart(t)}
            >
              <span>{PART_DEFS[t].name}</span>
              <span className="tnum shrink-0 text-[9px] text-cave-500">
                {shapesFor(t).length > 1 ? shapeDef(s, t).name : castMelt(t, s)}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── DAMASCUS. Only offered once there is more than one stone in the
          heat, because that is literally the requirement — each layer draws
          from its own charge, outer first. */}
      {queued(c).length > 1 && (
        <div className="mt-2 border-t border-cave-800 pt-1.5">
          <div className="text-[9px] uppercase tracking-wider text-cave-600">
            Layers — outer first, from the tub in order
          </div>
          <div className="mt-1 flex flex-wrap gap-1" data-testid="layer-picker">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                disabled={queued(c).length < n}
                className={`rounded border px-1.5 py-0.5 text-[9px] ${
                  n === layers
                    ? 'border-[#e0902a]/70 bg-cave-800/60 text-cave-100'
                    : queued(c).length < n ? 'border-cave-900 text-cave-700' : 'border-cave-800 text-cave-400'
                }`}
                data-testid={`layers-${n}`}
                onClick={() => setLayers(n)}
              >
                {n === 1 ? 'Solid' : `${n} layers`}
              </button>
            ))}
          </div>
          {layers > 1 && (
            <div className="mt-1 space-y-0.5" data-testid="layer-plan">
              {queued(c).slice(0, layers).map((ch, i) => (
                <div key={ch.materialId} className="flex items-center gap-1 text-[9px]">
                  <span className="w-12 shrink-0 uppercase tracking-wider text-cave-600">
                    {/* THE LAST LAYER IS ALWAYS THE CORE, however many there
                        are. Indexing LAYER_NAMES straight through called the
                        second of two "middle", which is not a thing a
                        two-layer part has. */}
                    {i === layers - 1 ? 'core' : LAYER_NAMES[i]}
                  </span>
                  <MaterialIcon id={ch.materialId} size={12} />
                  <span className="min-w-0 flex-1 truncate text-cave-300">
                    {materialDef(ch.materialId).name}
                  </span>
                  <span className="tnum shrink-0 text-cave-500">
                    {layerDraw(part, chosen, layers)[i]}
                  </span>
                </div>
              ))}
              <div className="text-[9px] leading-snug text-cave-600">
                {layers === 2 ? 'It will be both at once' : 'It will be all three at once'} — a
                tough outside over a keen core makes a part no single stone makes. Where a
                stone sits decides how hard it pulls.
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-2 border-t border-cave-800 pt-1.5">
        <div className="text-[9px] uppercase tracking-wider text-cave-600">
          {PART_DEFS[part].name} — the mould
        </div>
        <div className="mt-1 flex flex-wrap gap-1" data-testid="shape-picker">
          {options.map((s) => (
            <button
              key={s.id}
              className={`rounded border px-1.5 py-0.5 text-[9px] ${
                s.id === chosen
                  ? 'border-[#e0902a]/70 bg-cave-800/60 text-cave-100'
                  : 'border-cave-800 text-cave-400'
              }`}
              data-testid={`shape-${s.id}`}
              onClick={() => setShapes((m) => ({ ...m, [part]: s.id }))}
            >
              {s.name}
              <span className="tnum ml-1 text-cave-600">{castMelt(part, s.id)}</span>
            </button>
          ))}
        </div>
        <div className="mt-1 text-[10px] italic leading-snug text-cave-400" data-testid="shape-blurb">
          {cast.blurb}
        </div>
        <div className="mt-0.5 text-[10px] leading-snug text-cave-300" data-testid="shape-effect">
          {cast.effect}
        </div>
      </div>

      <button
        className="btn btn-warm mt-2 w-full py-1.5 text-xs"
        disabled={!ok}
        data-testid="cast-pour"
        onClick={() => {
          // Read the stone BEFORE the pour: a charge that empties leaves the
          // queue, so afterwards the front is already the next one.
          const was = frontCharge(c)?.materialId;
          const r = dispatch({ type: 'castPart', partType: part, shape: chosen, layers });
          setLast(r.ok && was
            ? `${cast.name} ${PART_DEFS[part].name} cast in ${materialDef(was).name}.`
            : r.reason ?? null);
        }}
      >
        {ok
          ? `Pour — ${layers > 1 ? `${layers}-layer ` : ''}${cast.name} ${PART_DEFS[part].name} · ${want}`
          : layers > 1 ? `${layers} stones, ${want} melt between them` : `Needs ${want} melt`}
      </button>
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
          <BenchLean state={state} />
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

/**
 * WHAT THE THREE STONES ON THE BENCH LEAN TOWARD — pillar 5's whole job here.
 *
 * It reads the Head, Edge and Sockets as they are slotted and describes the
 * BEHAVIOUR the pooled traits tend toward. It never names an ability, so the
 * first build in a new stone is a reasoned guess rather than a coin, and it
 * moves as you swap parts so the guess can be revised before you commit.
 */
function BenchLean({ state }: { state: GameState }) {
  const mats: string[] = [];
  for (const t of ABILITY_PARTS) {
    const id = state.casting.bench[t];
    const part = id === undefined ? undefined : rackPart(state, id);
    if (part) mats.push(part.materialId);
  }
  if (mats.length === 0) return null;
  const hint = toolAbilityHint(mats);
  if (!hint) return null;
  return (
    <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid="bench-lean">
      <div className="text-[10px] uppercase tracking-widest text-cave-500">
        The head, the edge and the sockets
      </div>
      <div className="mt-0.5 text-[11px] italic leading-snug text-cave-400" data-testid="bench-lean-text">
        {hint}
      </div>
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

/**
 * WHAT THE ROCK-FACING STONES REACH FOR — the card that makes a tool more than
 * a stat block.
 *
 * The seated abilities each get a name in their own colour, what they DO, a
 * charge meter and a Fire button, which is the drill panel's layout on purpose:
 * they are the same abilities and the player should not have to learn a second
 * vocabulary for the version in their hand.
 *
 * Anything the build GRANTS but has no room for is offered underneath, so the
 * decision ("which of these three does my one slot carry?") is on screen rather
 * than buried in a rebuild. Nothing here lists an ability the tool cannot do —
 * a locked list is the one thing pillar 5 forbids.
 */
function AbilitiesCard({ state }: { state: GameState }) {
  const fits = toolFits(state);
  const grants = toolGrants(state);
  const slots = toolAbilitySlots(state);
  const grade = toolGrade(state);
  const mats = abilityMaterials(currentTool(state));

  if (grants.length === 0) {
    // NOT A LOCKED LIST — the hint says what the stones LEAN toward and never
    // what they would make, so a first build is a reasoned guess.
    const hint = toolAbilityHint(mats);
    return (
      <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid="tool-abilities">
        <div className="text-[10px] uppercase tracking-widest text-cave-500">What it reaches for</div>
        <div className="mt-1 text-[11px] leading-snug text-cave-500" data-testid="tool-abilities-none">
          {hint ?? 'Nothing in this one is reaching for anything.'} Nothing in the
          Head, the Edge or the Sockets wants to do more than mine.
        </div>
      </div>
    );
  }

  const spare = grants.filter((g) => !fits.some((f) => f.def.id === g.id));

  return (
    <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid="tool-abilities">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">What it reaches for</span>
        <span className="tnum text-[10px] text-cave-500" data-testid="tool-ability-slots">
          {fits.length}/{slots} carried{grade > 1 ? ` · grade ${ROMAN[grade] ?? grade}` : ''}
        </span>
      </div>

      {fits.map((f) => {
        const pct = Math.min(1, f.charge / Math.max(1, f.def.charge.need));
        const hex = `#${f.def.color.toString(16).padStart(6, '0')}`;
        return (
          <div key={f.slot} className="mt-1.5" data-testid={`tool-ability-${f.slot}`}>
            <div className="flex items-baseline gap-1.5">
              <span
                className="shrink-0 text-[9px] font-semibold uppercase tracking-wider"
                style={{ color: hex }}
                data-testid={`tool-ability-name-${f.slot}`}
              >
                {f.def.name} {ROMAN[abilityLevelOf(
                  state.casting.hand?.fits?.[f.slot]?.fired ?? 0,
                )]}
              </span>
              <span className="min-w-0 flex-1 truncate text-[9px] text-cave-500">
                every {f.def.charge.need} swings
                {f.def.charge.roll ? ' · or whenever it feels like it' : ''}
              </span>
              <span className={`tnum shrink-0 text-[9px] ${f.ready ? 'text-white' : 'text-cave-500'}`}>
                {f.ready ? 'READY' : `${Math.min(f.charge, f.def.charge.need)}/${f.def.charge.need}`}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-cave-800">
                <div
                  className="h-full transition-[width] duration-150"
                  data-testid={`tool-charge-${f.slot}`}
                  style={{ width: `${Math.round(pct * 100)}%`, background: f.ready ? '#ffffff' : hex }}
                />
              </div>
              <button
                data-testid={`tool-fire-${f.slot}`}
                disabled={!f.ready}
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${
                  f.ready ? 'border-white/70 bg-white/10 text-white' : 'border-cave-800 text-cave-700'
                }`}
                title={f.ready
                  ? `Set ${f.def.name} off now, where you last swung`
                  : `${f.def.name} charges as you mine — it goes off by itself when it is full`}
                onClick={() => dispatch({ type: 'fireAbility', index: TOOL_CARRIER, slot: f.slot })}
              >
                {f.ready ? '▶ Fire' : `${Math.round(pct * 100)}%`}
              </button>
              <button
                data-testid={`tool-unseat-${f.slot}`}
                className="btn shrink-0 px-1 py-0.5 text-[9px]"
                title="Take it off. You can always stop doing a thing."
                onClick={() => dispatch({ type: 'setToolAbility', slot: f.slot, id: null })}
              >
                ✕
              </button>
            </div>
            <div className="mt-0.5 text-[9px] leading-snug text-cave-600">
              {effectInHand(f.def.effect)}
            </div>
          </div>
        );
      })}

      {spare.length > 0 && (
        <div className="mt-2 border-t border-cave-800 pt-1.5" data-testid="tool-ability-spare">
          <div className="text-[9px] uppercase tracking-wider text-cave-600">
            {fits.length >= slots
              ? 'Also built for — no room until it has more'
              : 'Also built for'}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {spare.map((def) => (
              <button
                key={def.id}
                className="rounded border border-cave-800 px-1.5 py-0.5 text-[9px] hover:border-cave-600"
                style={{ color: `#${def.color.toString(16).padStart(6, '0')}` }}
                data-testid={`tool-seat-${def.id}`}
                title={effectInHand(def.effect)}
                onClick={() => dispatch({
                  type: 'setToolAbility',
                  slot: fits.length < slots ? fits.length : slots - 1,
                  id: def.id,
                })}
              >
                {def.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-1.5 text-[9px] leading-snug text-cave-600">
        Off the Head, the Edge and the Sockets — re-cast one of those in different
        stone and this changes. Room to carry them comes from the Binding and from
        the swings you have put in.
      </div>
    </div>
  );
}

/**
 * THE MODIFIER BENCH — where the OP build gets assembled, and where it has to
 * be legible enough to be worth assembling.
 *
 * Three parts, in the order a player uses them:
 *
 *  1. THE STACK. What is on the tool, what each one is doing, and — the part
 *     that makes combos work at all — which ones are ASLEEP and what they are
 *     waiting for. An inert modifier the player cannot see is a slot they have
 *     lost with no explanation.
 *  2. WHAT IT ADDS UP TO. The whole stack folded into one line of plain
 *     numbers. Stacking is only fun if you can see the total move.
 *  3. THE WORKBENCH. Feed up to three stones. The lean is hinted, never the
 *     modifier (pillar 5); a known one can be AIMED at, because with thirty-two
 *     signatures live a generous mix would otherwise make an old favourite
 *     progressively harder to re-make.
 */
function ModBench({ state }: { state: GameState }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [aim, setAim] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const tool = currentTool(state);
  if (!tool) return null;

  const stacks = modStacks(state);
  const total = modSlotsTotal(state);
  const used = modSlotsUsed(state);
  const abilities = toolFits(state).length;
  const cache = modCache(state, abilities);
  const library = knownMods(state);
  const held = heldMaterials(state);

  const toggle = (id: string): void => {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MOD_FEED_MAX ? p : [...p, id]));
  };

  const hint = modHint(picked);
  const frac = total > 0 ? used / total : 0;

  return (
    <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid="mod-bench">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">Worked into it</span>
        <span
          className={`tnum text-[10px] ${used > total ? 'text-[#d8a0a0]' : 'text-cave-400'}`}
          data-testid="mod-slots"
        >
          {used}/{total} slots{used > total ? ' — over' : ''}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-sm bg-cave-900">
        <div
          className="h-full transition-[width] duration-150"
          style={{ width: `${Math.min(1, frac) * 100}%`, background: frac >= 1 ? '#e0902a' : '#7f8f6a' }}
        />
      </div>

      {/* ── 1. THE STACK ─────────────────────────────────────────────── */}
      {stacks.length === 0 ? (
        <div className="mt-1.5 text-[11px] italic text-cave-600" data-testid="mod-stack-empty">
          Nothing worked into it yet. Feed it stone below and see what takes.
        </div>
      ) : (
        <div className="mt-1.5 space-y-1" data-testid="mod-stack">
          {stacks.map((s) => {
            const def = MOD_BY_ID.get(s.id);
            if (!def) return null;
            const dormant = whyDormant(state, def, abilities);
            const hex = `#${def.color.toString(16).padStart(6, '0')}`;
            return (
              <div
                key={s.id}
                className={`rounded border p-1.5 ${dormant ? 'border-dashed border-cave-800 opacity-70' : 'border-cave-700 bg-cave-850/40'}`}
                data-testid={`mod-${s.id}`}
              >
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="shrink-0 text-[9px] font-semibold uppercase tracking-wider"
                    style={{ color: dormant ? '#6d6459' : hex }}
                    data-testid={`mod-name-${s.id}`}
                  >
                    {def.name} {ROMAN[modProgress(s).level]}{s.n > 1 ? ` ×${s.n}` : ''}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[9px] text-cave-600">
                    {def.cost * s.n} slot{def.cost * s.n === 1 ? '' : 's'}
                  </span>
                  <button
                    className="btn shrink-0 px-1 py-0.5 text-[9px]"
                    data-testid={`mod-strip-${s.id}`}
                    title="Take one back off. Free — the room comes back, the stone does not."
                    onClick={() => dispatch({ type: 'stripToolMod', id: s.id })}
                  >
                    ✕
                  </button>
                </div>
                <ModLevelBar stack={s} hex={hex} dim={!!dormant} />
                <div className="mt-0.5 text-[9px] leading-snug text-cave-500">{def.effect}</div>
                {dormant && (
                  <div className="mt-0.5 text-[9px] font-semibold text-[#c8a15a]" data-testid={`mod-dormant-${s.id}`}>
                    {dormant}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── 2. WHAT IT ADDS UP TO ────────────────────────────────────── */}
      {stacks.length > 0 && <StackTotal cache={cache} state={state} />}
      <SynergyCard state={state} />
      <InstabilityCard state={state} />

      {/* ── 3. THE WORKBENCH ─────────────────────────────────────────── */}
      <div className="mt-2 border-t border-cave-800 pt-1.5">
        <div className="text-[9px] uppercase tracking-wider text-cave-600">
          Work stone into it — up to {MOD_FEED_MAX}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {held.slice(0, 14).map((m) => (
            <button
              key={m.id}
              className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] ${
                picked.includes(m.id) ? 'border-[#e0902a]/70 bg-cave-800/60 text-cave-100' : 'border-cave-800 text-cave-400'
              }`}
              data-testid={`mod-feed-${m.id}`}
              onClick={() => toggle(m.id)}
            >
              <MaterialIcon id={m.id} size={12} />
              <span>{materialDef(m.id).name}</span>
              <span className="tnum text-cave-600">{fmt(m.count)}</span>
            </button>
          ))}
        </div>

        {hint && (
          <div className="mt-1 text-[10px] italic leading-snug text-cave-400" data-testid="mod-lean">
            {hint}
          </div>
        )}

        {library.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="shrink-0 text-[9px] uppercase tracking-wider text-cave-600">Aim at</span>
            <Select
              value={aim ?? ''}
              onChange={(v) => setAim(v || null)}
              className="min-w-0 flex-1 text-[10px]"
              data-testid="mod-aim"
              options={[
                { value: '', label: 'whatever it turns out to be' },
                ...library.map((m) => ({ value: m.id, label: m.name })),
              ]}
            />
          </div>
        )}

        <button
          className="btn btn-warm mt-1.5 w-full py-1 text-[11px]"
          disabled={picked.length === 0}
          data-testid="mod-apply"
          onClick={() => {
            const r = dispatch({ type: 'applyToolMod', materialIds: picked, prefer: aim });
            const d = r.data as { mod: string | null; reason?: string; seated?: boolean } | undefined;
            setNote(r.ok
              ? d?.reason ?? (d?.mod ? `${MOD_BY_ID.get(d.mod)?.name ?? d.mod} — worked in.` : 'It took nothing.')
              : r.reason ?? null);
            setPicked([]);
          }}
        >
          {picked.length === 0 ? 'Pick stone to work in' : `Work it in (${picked.length})`}
        </button>
        {note && (
          <div className="mt-1 text-center text-[11px] text-cave-300" data-testid="mod-note">{note}</div>
        )}

        <div className="mt-1 text-[9px] leading-snug text-cave-600">
          {library.length} of what there is to find, found. Room comes from the
          Binding stone and from the swings you have put in.
        </div>
      </div>
    </div>
  );
}

/** WHAT THIS ONE HAS LEARNED. A thin bar under the name, because the level is
 *  a per-modifier fact and belongs beside the modifier, not in a summary. */
function ModLevelBar({ stack, hex, dim }: { stack: ToolModStack; hex: string; dim: boolean }) {
  const p = modProgress(stack);
  return (
    <div className="mt-0.5" data-testid={`mod-level-${stack.id}`}>
      <div className="h-[3px] w-full overflow-hidden rounded-sm bg-cave-900">
        <div
          className="h-full transition-[width] duration-150"
          style={{ width: `${p.frac * 100}%`, background: dim ? '#4a453e' : hex, opacity: p.max ? 1 : 0.75 }}
        />
      </div>
      <div className="mt-0.5 text-[8px] text-cave-600" data-testid={`mod-level-text-${stack.id}`}>
        {p.max
          ? `${ROMAN[p.level]} — as far as it goes`
          : `${ROMAN[p.level]} · ${fmt(p.into)} / ${fmt(p.need)} to ${ROMAN[p.level + 1]}`}
      </div>
    </div>
  );
}

/**
 * WHAT IT HAS TURNED OUT TO BE, and what it is reaching for.
 *
 * Two halves, and the second is the pillar-5 one. AWAKE lists arrangements the
 * tool is currently running — named, because you found them. DIRECTIONS shows
 * the hint for anything the tool is carrying HALF of, and names neither the
 * other half nor the result: it says there is something there and makes you
 * find what.
 */
function SynergyCard({ state }: { state: GameState }) {
  const cache = modCache(state, toolFits(state).length);
  const hints = synergyHints(state);
  if (cache.awake.length === 0 && hints.length === 0) return null;
  return (
    <div className="mt-1.5 rounded border border-cave-800 bg-cave-900/40 p-1.5" data-testid="synergies">
      {cache.awake.length > 0 && (
        <>
          <div className="text-[9px] uppercase tracking-wider text-cave-600">What it turned into</div>
          {cache.awake.map((id) => {
            const syn = SYNERGY_BY_ID.get(id);
            if (!syn) return null;
            return (
              <div key={id} className="mt-0.5" data-testid={`synergy-${id}`}>
                <span
                  className="text-[9px] font-semibold uppercase tracking-wider"
                  style={{ color: `#${syn.color.toString(16).padStart(6, '0')}` }}
                >
                  {syn.name}
                </span>
                <div className="text-[9px] leading-snug text-cave-400">{syn.effect}</div>
              </div>
            );
          })}
        </>
      )}
      {hints.length > 0 && (
        <div className={cache.awake.length > 0 ? 'mt-1.5 border-t border-cave-800 pt-1' : ''}>
          <div className="text-[9px] uppercase tracking-wider text-cave-600">
            Something on it is reaching
          </div>
          {hints.slice(0, 3).map((h) => (
            <div key={h} className="mt-0.5 text-[9px] italic leading-snug text-cave-500" data-testid="synergy-hint">
              {h}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * THE COUNTERWEIGHT, ON SCREEN. A meter, what is driving it, and what it costs
 * — because "your abilities misfire 12% of the time" is only a decision if the
 * player can see the number and see which thing on the tool is buying it.
 */
function InstabilityCard({ state }: { state: GameState }) {
  const i = toolInstability(state);
  if (i.raw <= 0) return null;
  const frac = Math.min(1, i.net / 200);
  const hot = i.misfire > 0;
  return (
    <div className="mt-1.5 rounded border border-cave-800 p-1.5" data-testid="instability">
      <div className="flex items-baseline justify-between">
        <span className="text-[9px] uppercase tracking-wider text-cave-600">Instability</span>
        <span
          className={`tnum text-[9px] ${hot ? 'text-[#d8a0a0]' : 'text-cave-500'}`}
          data-testid="instability-n"
        >
          {Math.round(i.net)}{hot ? ` · ${Math.round(i.misfire * 100)}% misfire` : ' · steady'}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-sm bg-cave-900">
        <div
          className="h-full transition-[width] duration-150"
          data-testid="instability-bar"
          style={{ width: `${frac * 100}%`, background: hot ? '#c86a5a' : '#7f8f6a' }}
        />
      </div>
      <div className="mt-0.5 text-[9px] leading-snug text-cave-600" data-testid="instability-from">
        {i.from.length > 0
          ? `Mostly ${i.from.slice(0, 3).map((f) => f.label).join(', ')}`
          : 'Nothing much.'}
        {i.steady > 0 ? ` · steadied by ${Math.round(i.steady)}` : ''}
      </div>
      {hot && (
        <div className="mt-0.5 text-[9px] leading-snug text-[#c8a15a]">
          It still mines exactly as it did. It is what it CARRIES that has started
          going off in the wrong place. Work a stabiliser in, or take something off.
        </div>
      )}
    </div>
  );
}

/** THE WHOLE STACK AS ONE LINE. Stacking is only fun if the total is visible —
 *  this is what makes a build feel like a build rather than a list. */
function StackTotal({ cache, state }: { cache: ModCache; state: GameState }) {
  const bits: string[] = [];
  /**
   * THE CLAMPED NUMBERS, NOT THE RAW SUM.
   *
   * A driven screenshot read "+16 reach · +205% off each cell" on a fully
   * stacked tool. Both are lies the engine correctly refuses to tell: reach is
   * floored into the 3x3 by `effectOf` and splash cannot exceed a whole cell.
   * The card was reading `cache`, which is the sum BEFORE those clamps — so it
   * promised roughly twice what the tool does, and the player's next stack of
   * reach modifiers would have bought nothing while the readout said otherwise.
   *
   * So it reports what a swing ACTUALLY does, and says when a term has stopped
   * paying — which is exactly the information a build needs at that point.
   */
  const tool = currentTool(state);
  const e = tool ? effectOf(tool, false, toolLevel(state), cache) : null;
  const bare = tool ? effectOf(tool, false, toolLevel(state)) : null;
  if (e && bare) {
    const dCells = e.cells - bare.cells;
    if (dCells > 0) {
      bits.push(`+${dCells} reach${e.cells >= 1 + MAX_EXTRA_CELLS ? ' (full 3×3)' : ''}`);
    } else if (cache.cells > 0) {
      bits.push('reach already at the full 3×3');
    }
    const dSplash = e.splash - bare.splash;
    if (dSplash > 0) {
      bits.push(`+${Math.round(dSplash * 100)}% off each cell${e.splash >= 1 ? ' (all of it)' : ''}`);
    } else if (cache.splash > 0) {
      bits.push('already takes all of every cell it reaches');
    }
  } else {
    if (cache.cells > 0) bits.push(`+${cache.cells.toFixed(1)} reach`);
    if (cache.splash > 0) bits.push(`+${Math.round(cache.splash * 100)}% off each cell`);
  }
  if (cache.oreRate > 1) bits.push(`${cache.oreRate.toFixed(2)}× pockets`);
  if (cache.uses > 1) bits.push(`${cache.uses.toFixed(2)}× swings`);
  if (cache.dropWeight > 1) bits.push(`${cache.dropWeight.toFixed(2)}× drops`);
  if (cache.xpRate > 1) bits.push(`${cache.xpRate.toFixed(2)}× learning`);
  if (cache.chargePerSwing > 0) bits.push(`${(1 + cache.chargePerSwing).toFixed(1)}× charge`);
  if (cache.abilityGrade > 0) bits.push(`+${Math.floor(cache.abilityGrade)} grade`);
  for (const [k, v] of Object.entries(cache.paramAdd)) {
    if (k === 'r' && v > 0) bits.push(`+${Math.round(v)} blast radius`);
  }
  if (cache.abilitySlots > 0) bits.push(`+${Math.floor(cache.abilitySlots)} ability seat`);
  if (cache.repairPerSec > 0) bits.push('mends itself');
  if (cache.repairOnFire > 0) bits.push('mends when it fires');
  if (cache.chargeOnFire > 0) bits.push('one firing feeds the rest');
  if (cache.refire > 0) bits.push(`${Math.round(cache.refire * 100)}% it happens twice`);
  if (cache.oreReach) bits.push('works pockets it reaches');

  return (
    <div className="mt-1.5 rounded border border-cave-800 bg-cave-900/40 p-1.5" data-testid="mod-total">
      <div className="text-[9px] uppercase tracking-wider text-cave-600">All told</div>
      <div className="mt-0.5 text-[10px] leading-snug text-cave-200" data-testid="mod-total-text">
        {bits.length > 0 ? bits.join(' · ') : 'Nothing awake yet.'}
      </div>
      {cache.amplify > 1 && (
        <div className="mt-0.5 text-[9px] font-semibold text-[#c8a15a]" data-testid="mod-amplify">
          ...and everything else on it counts {cache.amplify.toFixed(2)}× over.
        </div>
      )}
    </div>
  );
}

/**
 * WHAT IT TURNED OUT TO BE.
 *
 * Three states, and all three say something useful:
 *
 *  IN A CLASS      the name, what tipped it, and what it unlocked. The tipped
 *                  line is the pillar-5 half — it names TRAITS, which every
 *                  material row already prints, so a player who wants to build
 *                  toward this can reason their way there without a recipe.
 *  SCATTERED       says the parts do not belong together, which is the same
 *                  coherence number the stat penalty already shows, now with a
 *                  second consequence attached.
 *  LEANING NOWHERE a coherent tool that is just a tool. Not a failure, and the
 *                  copy says so — plus the nearest thing it ALMOST is, which is
 *                  a direction without being an instruction.
 */
function ClassCard({ state }: { state: GameState }) {
  const read = toolClass(state);
  const known = state.casting.knownClasses ?? [];

  if (!read.def) {
    return (
      <div className="mt-2 rounded-md border border-dashed border-cave-800 p-2" data-testid="tool-class">
        <div className="text-[10px] uppercase tracking-widest text-cave-500">What it is</div>
        <div className="mt-0.5 text-[11px] leading-snug text-cave-500" data-testid="tool-class-none">
          {read.why ?? 'Not enough of it to say.'}
        </div>
        {read.nextBest && read.score > 0 && (
          <div className="mt-0.5 text-[9px] leading-snug text-cave-600" data-testid="tool-class-near">
            Closest to something at {Math.round(read.score * 100)}% of the way there.
          </div>
        )}
      </div>
    );
  }

  const hex = `#${read.def.color.toString(16).padStart(6, '0')}`;
  const unlocked = read.def.unlocks.map((id) => MOD_BY_ID.get(id)).filter(Boolean);
  return (
    <div className="mt-2 rounded-md border border-cave-700 bg-cave-850/40 p-2" data-testid="tool-class">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">What it is</span>
        <span className="tnum text-[9px] text-cave-600">
          {known.length}/{TOOL_CLASSES.length} ever found
        </span>
      </div>
      <div
        className="mt-0.5 text-xs font-semibold uppercase tracking-wider"
        style={{ color: hex }}
        data-testid="tool-class-name"
      >
        {read.def.name}
      </div>
      <div className="mt-0.5 text-[10px] leading-snug text-cave-300">{read.def.blurb}</div>
      <div className="mt-1 text-[9px] leading-snug text-cave-500" data-testid="tool-class-tipped">
        Tipped by {read.tipped.slice(0, 3).map((t) => `${t.trait} ×${t.have}`).join(', ')}
        {/* No article — "nearly a Excavation" was on screen in the first run,
            and picking a/an per class name is more machinery than the line is
            worth. */}
        {read.nextBest ? ` · next closest, ${read.nextBest.def.name}` : ''}
      </div>
      {unlocked.length > 0 && (
        <div className="mt-1 border-t border-cave-800 pt-1" data-testid="tool-class-unlocks">
          <div className="text-[9px] uppercase tracking-wider text-cave-600">Only this one can carry</div>
          {unlocked.map((m) => (
            <div key={m!.id} className="mt-0.5">
              <span
                className="text-[9px] font-semibold uppercase tracking-wider"
                style={{ color: `#${m!.color.toString(16).padStart(6, '0')}` }}
              >
                {m!.name}
              </span>
              <span className="ml-1 text-[9px] text-cave-500">{m!.effect}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * HOW HEAVY THE STONE MADE IT — a dial, not a slider.
 *
 * The player never set this. It is the sum of what the parts are made of, and
 * the card says so out loud: the label, where it sits on the line, WHICH TRAITS
 * put it there, and both halves of the trade in the units they land in. An even
 * tool renders nothing at all, because there is nothing to say.
 */
function BalanceCard({ state, tool }: { state: GameState; tool: ToolStats }) {
  const b = balanceOf(tool.parts);
  const e = toolEffect(state);
  if (b.value === 0) {
    return (
      <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid="tool-balance">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-widest text-cave-500">Balance</span>
          <span className="tnum text-[9px] text-cave-500" data-testid="tool-balance-label">even</span>
        </div>
        <div className="mt-0.5 text-[9px] leading-snug text-cave-600">
          Nothing in this leans heavy or light. It swings as fast as you do.
        </div>
      </div>
    );
  }
  const heavy = b.value > 0;
  const hex = heavy ? '#d08a4a' : '#9ac0d8';
  // −1 .. +1 mapped onto the bar, with the marker at the value.
  const at = (b.value + 1) / 2;
  return (
    <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid="tool-balance">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">Balance</span>
        <span
          className="tnum text-[9px] font-semibold uppercase tracking-wider"
          style={{ color: hex }}
          data-testid="tool-balance-label"
        >
          {b.label}
        </span>
      </div>
      <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded-sm bg-cave-900">
        <span className="absolute inset-y-0 left-1/2 w-px bg-cave-700" />
        <span
          className="absolute inset-y-0 w-1.5 rounded-sm"
          style={{ left: `calc(${at * 100}% - 3px)`, background: hex }}
          data-testid="tool-balance-marker"
        />
      </div>
      <div className="mt-1 flex justify-between text-[8px] uppercase tracking-wider text-cave-700">
        <span>light</span><span>heavy</span>
      </div>
      <div className="mt-0.5 text-[9px] leading-snug text-cave-300" data-testid="tool-balance-trade">
        {heavy
          ? `${e.cells} cells a swing and ${Math.round(e.splash * 100)}% off each — and it will not `
            + `come round again for ${b.windup.toFixed(2)}s.`
          : `${e.cells} cells a swing and ${Math.round(e.splash * 100)}% off each — but it swings as `
            + `fast as you do, spends ${Math.round((1 - b.wear) * 100)}% less of itself doing it, and `
            + `builds what it carries ${(1 + b.charge).toFixed(1)}× as quickly.`}
      </div>
      <div className="mt-0.5 text-[9px] leading-snug text-cave-600" data-testid="tool-balance-from">
        {b.from.length > 0
          ? `Mostly ${b.from.slice(0, 3).map((f) => f.trait).join(', ')} in the stone.`
          : ''}
      </div>
    </div>
  );
}

/**
 * WHAT IS STILL GROWING, and the choice it offers when it has done the work.
 *
 * Absent entirely for a tool with no Verdance stock in it — which is most tools,
 * and is the point: this is the reason to build with living material, and a
 * permanently empty card would read as a missing requirement rather than a road
 * not taken.
 *
 * The CHOICE is the feature. Three things it could become, one taken, and the
 * card says what each does before you commit — a maturation you cannot read is
 * a coin toss, and this is meant to be the moment you decide what your pickaxe
 * has been turning into for the last few hours.
 */
function LivingCard({ tool }: { tool: ToolStats }) {
  const [note, setNote] = useState<string | null>(null);
  const living = tool.parts.filter((p) => isLiving(p));
  if (living.length === 0) return null;
  const fold = growthFold(tool.parts);

  return (
    <div className="mt-2 rounded-md border border-[#4c6a3a]/50 p-2" data-testid="tool-living">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">Still growing</span>
        <span className="tnum text-[9px] text-cave-500" data-testid="tool-living-count">
          {living.length} living part{living.length === 1 ? '' : 's'}
        </span>
      </div>

      {living.map((p) => {
        const prog = growthProgress(p);
        const taken = p.grown ?? [];
        return (
          <div key={p.type} className="mt-1.5" data-testid={`living-${p.type}`}>
            <div className="flex items-baseline gap-1.5">
              <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-[#9ac07a]">
                {PART_DEFS[p.type as PartType].name}
              </span>
              <span className="min-w-0 flex-1 truncate text-[9px] text-cave-600">
                {taken.length > 0
                  ? taken.map((b) => BOON_BY_ID.get(b)?.name ?? b).join(' · ')
                  : 'nothing yet'}
              </span>
              <span className="tnum shrink-0 text-[9px] text-cave-500">
                {prog.grown ? 'grown' : `${prog.stage}/${GROWTH_MAX}`}
              </span>
            </div>
            {!prog.grown && (
              <>
                <div className="mt-0.5 h-1 w-full overflow-hidden rounded-sm bg-cave-900">
                  <div
                    className="h-full transition-[width] duration-150"
                    data-testid={`living-bar-${p.type}`}
                    style={{ width: `${prog.frac * 100}%`, background: prog.ready ? '#c8e0a0' : '#4c6a3a' }}
                  />
                </div>
                <div className="mt-0.5 text-[8px] text-cave-600" data-testid={`living-progress-${p.type}`}>
                  {prog.ready
                    ? 'It has done the work. It is waiting to be told what to become.'
                    : `${fmt(prog.into)} / ${fmt(prog.need)} cells`}
                </div>
              </>
            )}
            {prog.ready && (
              <div className="mt-1 space-y-1" data-testid={`living-choice-${p.type}`}>
                {GROWTH_BOONS.map((b) => (
                  <button
                    key={b.id}
                    className="w-full rounded border border-cave-700 px-1.5 py-1 text-left hover:border-[#9ac07a]/70"
                    data-testid={`living-take-${p.type}-${b.id}`}
                    onClick={() => {
                      const r = dispatch({
                        type: 'matureLivingPart', partType: p.type, boon: b.id,
                      });
                      setNote(r.ok
                        ? `The ${PART_DEFS[p.type as PartType].name} became ${b.name}.`
                        : r.reason ?? null);
                    }}
                  >
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-[#9ac07a]">
                      {b.name}
                    </span>
                    <span className="mt-0.5 block text-[9px] leading-snug text-cave-400">{b.effect}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {(fold.cells > 0 || fold.repairPerSec > 0 || fold.stabilize > 0) && (
        <div className="mt-1.5 border-t border-cave-800 pt-1 text-[9px] leading-snug text-cave-300"
          data-testid="tool-living-total">
          All told: {[
            fold.cells > 0 ? `+${fold.cells} reach` : null,
            fold.repairPerSec > 0 ? 'closes its own wear' : null,
            fold.stabilize > 0 ? `steadier by ${Math.round(fold.stabilize)}` : null,
            fold.wear < 1 ? `${Math.round((1 - fold.wear) * 100)}% less wear a swing` : null,
          ].filter(Boolean).join(' · ')}
        </div>
      )}
      {note && <div className="mt-1 text-center text-[10px] text-cave-300" data-testid="living-note">{note}</div>}
    </div>
  );
}

/**
 * HOW WELL THE POURS CAME OUT. Only rendered when there is something to say —
 * a tool of Good parts has no craftsmanship story, which is most tools.
 */
function CraftCard({ tool }: { tool: ToolStats }) {
  const fold = craftFold(tool.parts);
  const notable = tool.parts.filter((p) => p.craft === 'masterwork' || p.craft === 'excellent');
  if (notable.length === 0) return null;
  return (
    <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid="tool-craft">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">The pours</span>
        <span
          className="tnum text-[9px] uppercase tracking-wider"
          style={{ color: `#${CRAFT_COLOR[fold.best].toString(16).padStart(6, '0')}` }}
          data-testid="tool-craft-best"
        >
          {CRAFT_LABEL[fold.best]}
          {fold.masterworks > 0 ? ` ×${fold.masterworks}` : ''}
        </span>
      </div>
      {notable.map((p) => {
        const tier = p.craft ?? 'good';
        const work = p.work ? MASTERWORK_BY_ID.get(p.work) : undefined;
        return (
          <div key={p.type} className="mt-1" data-testid={`craft-${p.type}`}>
            <div className="flex items-baseline gap-1.5">
              <span className="shrink-0 text-[9px] uppercase tracking-wider text-cave-500">
                {PART_DEFS[p.type as PartType].name}
              </span>
              <span
                className="shrink-0 text-[9px] font-semibold uppercase tracking-wider"
                style={{ color: `#${CRAFT_COLOR[tier].toString(16).padStart(6, '0')}` }}
              >
                {work ? work.name : CRAFT_LABEL[tier]}
              </span>
            </div>
            <div className="mt-0.5 text-[9px] leading-snug text-cave-400">
              {work ? work.effect : 'A touch steadier under load. Nothing more than that.'}
            </div>
          </div>
        );
      })}
      <div className="mt-1 text-[8px] leading-snug text-cave-600">
        None of this is stats. A Masterwork Head has the numbers a Poor one has.
      </div>
    </div>
  );
}

/**
 * THE BIOGRAPHY. Information, and it says so — the last line is load-bearing
 * copy, because a history panel in a game with stat screens will be read as a
 * stat screen unless it tells you otherwise.
 */
function BiographyCard({ state }: { state: GameState }) {
  const bio = readBio(state);
  if (!bio) return null;
  const shell = (id: string): string => {
    const s = allShells().find((x) => x.id === id);
    return s ? s.name : id;
  };
  const rows: Array<[string, string]> = [
    ['Cells broken', fmt(bio.cells)],
    ['Swings', fmt(bio.swings)],
    ['Hours in hand', bio.hours < 1 ? `${Math.round(bio.hours * 60)} min` : bio.hours.toFixed(1)],
    ['Deepest', `${shell(bio.deepestShell)} · ${fmt(bio.deepestDepth)}m`],
    ['Abilities set off', fmt(bio.fired)],
    ['Collapses survived', fmt(bio.collapses)],
    ['Relics turned up', fmt(bio.relics)],
  ];
  if (bio.breaches > 0) rows.push(['Worlds left behind', fmt(bio.breaches)]);
  if (bio.rebuilds > 0) rows.push(['Rebuilt', `${fmt(bio.rebuilds)}×`]);

  return (
    <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid="tool-bio">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">Its history</span>
        <span className="tnum text-[9px] text-cave-600" data-testid="tool-bio-age">
          {bio.shells.length} shell{bio.shells.length === 1 ? '' : 's'} worked
        </span>
      </div>
      <div className="mt-1 space-y-0.5" data-testid="tool-bio-rows">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-1 text-[9px]">
            <span className="min-w-0 flex-1 truncate text-cave-600">{k}</span>
            <span className="tnum shrink-0 text-cave-300">{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 text-[8px] leading-snug text-cave-600">
        None of this makes it stronger. It is what the tool has done.
      </div>
    </div>
  );
}

/** WHAT THE SWING LOOKS LIKE — the head's mould, on the tool it was built into. */
function ShapeCard({ state, tool }: { state: GameState; tool: ToolStats }) {
  const fold = shapeFold(tool.parts);
  const head = shapeDef(fold.head, 'head');
  const e = toolEffect(state);
  const odd = tool.parts.filter((p) => p.shape && p.shape !== defaultShape(p.type));
  return (
    <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid="tool-shape">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">How it swings</span>
        <span className="tnum text-[9px] text-cave-600" data-testid="tool-shape-pattern">
          {head.name} · {e.cells} cell{e.cells === 1 ? '' : 's'}
        </span>
      </div>
      <div className="mt-0.5 text-[10px] leading-snug text-cave-300" data-testid="tool-shape-effect">
        {head.effect}
      </div>
      {odd.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1" data-testid="tool-shape-parts">
          {odd.map((p) => (
            <span key={p.type} className="rounded border border-cave-800 px-1 py-0.5 text-[9px] text-cave-500">
              {shapeDef(p.shape, p.type).name} {PART_DEFS[p.type as PartType].name}
            </span>
          ))}
        </div>
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
        {tool.parts.map((p) => {
          // A LAYERED PART SAYS SO, outer first — otherwise the chip would name
          // only the surface and a Damascus tool would look solid.
          const mats = partMaterials(p);
          return (
            <span
              key={p.type}
              className={`rounded border px-1 py-0.5 text-[9px] ${
                mats.length > 1 ? 'border-cave-600 text-cave-300' : 'border-cave-800 text-cave-400'
              }`}
              title={mats.length > 1
                ? mats.map((m, i) => `${LAYER_NAMES[i]}: ${materialDef(m).name}`).join(' · ')
                : undefined}
            >
              {PART_DEFS[p.type as PartType].name.slice(0, 4)} ·{' '}
              {mats.map((m) => materialDef(m).name).join('/')}
            </span>
          );
        })}
      </div>
      <ClassCard state={state} />
      <ShapeCard state={state} tool={tool} />
      <BalanceCard state={state} tool={tool} />
      <LivingCard tool={tool} />
      <CraftCard tool={tool} />
      <AbilitiesCard state={state} />
      <ModBench state={state} />
      <LevelCard state={state} tool={tool} />
      <AtTheFace state={state} tool={tool} />
      <Durability state={state} tool={tool} />
      <CoherenceReadout tool={tool} testid="tool-coherence" />
      <RawStats tool={tool} testid="tool-stats" />
      <BiographyCard state={state} />
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
