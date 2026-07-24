/**
 * THE SHAFT — the takeover. Mounts the Pixi cross-section into the hero, and
 * hangs the interaction HUD over it: a readout at the top, a contextual action
 * row at the bottom, and a detail sheet that slides up when you tap a marker on
 * the wall. Every action dispatches the SAME engine action the old panel did —
 * this is a presentation rebuild, not a mechanics change.
 *
 * Mount-and-hide discipline (like the Lattice/Face): the Pixi view is created
 * once and its ticker paused while the Shaft is not the active tab. Destroying a
 * renderer while the Face renders poisons Pixi's shared batch pools.
 */
import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../../engine';
import { fmt } from '../../engine';
import { currentShell } from '../../engine/shells';
import { materialDef } from '../../engine/materials';
import { materialCount } from '../../engine/systems/forge';
import {
  cachesOf, cacheInstallCost, cacheProgress, cacheReady, hasLift, railDepth, railExtendCost,
  digShifts, excavationDone, MAX_CACHES_PER_SHELL, CACHE_CAP, LIFT_CORE_COST, RAIL_DISCOUNT,
} from '../../engine/systems/shaftSys';
import { cureFor, CURE_RECIPES } from '../../engine/systems/curing';
import { EXCAVATION_BY_ID } from '../../engine/content/excavations';
import { WALL_BY_SHELL, wallReading } from '../../engine/content/shellWalls';
import { getCurrency } from '../../engine/resources';
import { requiredTier, equippedTool } from '../../engine/systems/forge';
import { descendCost } from '../../engine';
import { computeBucket } from '../../engine/modifiers';
import { getCurrency as getCur } from '../../engine';
import { ShaftView, DEFAULT_TUNING, type ShaftMarker, type ShaftScrollInfo, type ShaftTuning } from './ShaftView';
import { SHELL_ACCENT } from './shaftThemes';
import { MaterialIcon } from '../components/MaterialIcon';
import { dispatch, useGame } from '../store';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];

function fmtLeft(hoursLeft: number): string {
  if (hoursLeft <= 0) return 'ready';
  if (hoursLeft < 1) return `${Math.ceil(hoursLeft * 60)}m`;
  if (hoursLeft < 24) return `${Math.ceil(hoursLeft)}h`;
  const d = Math.floor(hoursLeft / 24), h = Math.ceil(hoursLeft % 24);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

export function ShaftCanvas({ active }: { active: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ShaftView | null>(null);
  const engine = useGame((s) => s.engine);
  const reducedMotion = useGame((s) => s.reducedMotion);
  const [selected, setSelected] = useState<ShaftMarker | null>(null);
  const [hereOpen, setHereOpen] = useState(false);
  const [scroll, setScroll] = useState<ShaftScrollInfo | null>(null);
  const lastTop = useRef(1e9);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !engine) return;
    let view: ShaftView | null = null;
    let cancelled = false;
    void ShaftView.create(
      host, engine, reducedMotion,
      (m) => { setSelected(m); if (m) setHereOpen(false); },
      // The depth ruler is HTML for crisp serif small-caps; re-render only when
      // the visible tick set could change (a depth crossed), not every frame.
      (info) => {
        if (Math.abs(info.top - lastTop.current) >= 0.5) { lastTop.current = info.top; setScroll(info); }
      },
    ).then((v) => {
      if (cancelled) v.destroy();
      else {
        view = v; viewRef.current = v; v.setActive(active);
        if (import.meta.env.DEV) (window as unknown as { __shaftView?: unknown }).__shaftView = v;
      }
    });
    return () => { cancelled = true; view?.destroy(); viewRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, reducedMotion]);

  useEffect(() => { viewRef.current?.setActive(active); if (!active) { setSelected(null); setHereOpen(false); } }, [active]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-cave-700 bg-black" aria-label="The Shaft — the column you have dug">
      <div ref={hostRef} className="absolute inset-0" style={{ touchAction: 'none' }} />
      <DepthRuler scroll={scroll} />
      <CornerTicks />
      <ShaftHud
        onHere={() => { setSelected(null); setHereOpen((v) => !v); }}
        hereOpen={hereOpen}
        onCloseSheets={() => { setSelected(null); setHereOpen(false); }}
        selected={selected}
      />
      {import.meta.env.DEV
        && typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).has('shafttune')
        && <ShaftTunePanel viewRef={viewRef} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dev-only tuning panel (?shafttune) — DEV-gated so it is stripped from prod.
// Live sliders write straight into the renderer; the JSON readout is the set of
// numbers to hard-code back into ShaftView's DEFAULT_TUNING.
// ---------------------------------------------------------------------------

const TUNE_KNOBS: { key: keyof ShaftTuning; label: string; min: number; max: number; step: number }[] = [
  { key: 'veinBright', label: 'vein brightness', min: 0, max: 3, step: 0.05 },
  { key: 'veinWidth', label: 'vein width', min: 0.4, max: 3, step: 0.05 },
  { key: 'rockValue', label: 'rock value', min: 0.3, max: 2.5, step: 0.05 },
  { key: 'rimBright', label: 'wall rim glow', min: 0, max: 3, step: 0.05 },
  { key: 'texScale', label: 'texture scale', min: 0.3, max: 3, step: 0.05 },
  { key: 'texStrength', label: 'texture strength', min: 0, max: 1, step: 0.02 },
  { key: 'mineralVar', label: 'mineral variation', min: 0, max: 1.5, step: 0.05 },
  { key: 'sediment', label: 'sediment banding', min: 0, max: 2.5, step: 0.05 },
  { key: 'crackDensity', label: 'crack density', min: 0, max: 1, step: 0.02 },
  { key: 'crackBright', label: 'crack brightness', min: 0, max: 3, step: 0.05 },
  { key: 'lampRadius', label: 'lantern radius', min: 0.3, max: 3, step: 0.05 },
  { key: 'lampFalloff', label: 'lantern falloff', min: 0.15, max: 0.95, step: 0.02 },
  { key: 'vignette', label: 'vignette', min: 0, max: 1, step: 0.02 },
];

function ShaftTunePanel({ viewRef }: { viewRef: React.RefObject<ShaftView | null> }) {
  const [tuning, setTuning] = useState<ShaftTuning>(() => viewRef.current?.getTuning() ?? { ...DEFAULT_TUNING });
  // The view is created async; once it exists, seed from it (in case defaults changed).
  useEffect(() => {
    const t = setTimeout(() => { if (viewRef.current) setTuning(viewRef.current.getTuning()); }, 400);
    return () => clearTimeout(t);
  }, [viewRef]);

  const set = (key: keyof ShaftTuning, value: number) => {
    setTuning((prev) => ({ ...prev, [key]: value }));
    viewRef.current?.setTuning({ [key]: value });
  };

  return (
    <div className="absolute right-1.5 top-8 z-20 max-h-[86%] w-56 overflow-y-auto rounded-md border border-lamp-500/40 bg-black/85 p-2 text-[10px] text-cave-200 shadow-2xl scroll-thin">
      <div className="mb-1.5 font-semibold uppercase tracking-wider text-lamp-300">Shaft tuning · dev</div>
      {TUNE_KNOBS.map((k) => (
        <label key={k.key} className="mb-1.5 block">
          <div className="flex justify-between">
            <span>{k.label}</span>
            <span className="tnum text-lamp-300">{tuning[k.key].toFixed(2)}</span>
          </div>
          <input
            type="range" min={k.min} max={k.max} step={k.step} value={tuning[k.key]}
            onChange={(e) => set(k.key, parseFloat(e.target.value))}
            className="w-full accent-lamp-400"
          />
        </label>
      ))}
      <div className="mt-1 border-t border-cave-700 pt-1">
        <div className="mb-0.5 text-cave-500">copy into DEFAULT_TUNING:</div>
        <textarea
          readOnly
          className="h-24 w-full resize-none rounded bg-cave-950 p-1 font-mono text-[9px] text-cave-300"
          value={JSON.stringify(tuning, null, 2)}
          onFocus={(e) => e.currentTarget.select()}
        />
      </div>
    </div>
  );
}

/**
 * The depth ruler — engraved down the left edge, gold hairlines and serif
 * small-caps, in step with the Pixi scroll. Ticks land on round depths; the
 * count adapts so it never crowds. Restrained: this is engraving, not glowing UI.
 */
function DepthRuler({ scroll }: { scroll: ShaftScrollInfo | null }) {
  if (!scroll) return null;
  const { top, bottom } = scroll;
  const span = Math.max(1, bottom - top);
  // A round step that keeps ~5–8 ticks in view.
  const raw = span / 6;
  const step = raw <= 5 ? 5 : raw <= 12 ? 10 : raw <= 30 ? 20 : 50;
  const first = Math.ceil(top / step) * step;
  const ticks: number[] = [];
  for (let d = first; d <= bottom; d += step) if (d >= 0) ticks.push(d);

  return (
    <div className="pointer-events-none absolute inset-y-0 left-0 z-[5] w-14 select-none">
      {ticks.map((d) => {
        const y = ((d - top) / span) * 100;
        return (
          <div key={d} className="absolute left-0 flex items-center gap-1" style={{ top: `${y}%`, transform: 'translateY(-50%)' }}>
            <span className="ml-2 font-serif text-[10px] tracking-[0.12em] text-lamp-300/55" style={{ fontVariant: 'small-caps' }}>
              {d}
            </span>
            <span className="h-px w-2.5 bg-lamp-400/30" />
          </div>
        );
      })}
    </div>
  );
}

/** Engraved L-hairlines at the four corners — a framed instrument, not a box. */
function CornerTicks() {
  const base = 'pointer-events-none absolute h-4 w-4 border-lamp-500/25';
  return (
    <>
      <span className={`${base} left-1.5 top-1.5 border-l border-t`} />
      <span className={`${base} right-1.5 top-1.5 border-r border-t`} />
      <span className={`${base} bottom-1.5 left-1.5 border-b border-l`} />
      <span className={`${base} bottom-1.5 right-1.5 border-b border-r`} />
    </>
  );
}

/** The HUD reads live state each publish, but it is a handful of nodes. */
function ShaftHud(props: {
  onHere: () => void; hereOpen: boolean; onCloseSheets: () => void; selected: ShaftMarker | null;
}) {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  return <Hud {...props} state={state as GameState} />;
}

function Hud({ state, onHere, hereOpen, onCloseSheets, selected }: {
  state: GameState; onHere: () => void; hereOpen: boolean; onCloseSheets: () => void; selected: ShaftMarker | null;
}) {
  const shell = currentShell(state);
  const accent = SHELL_ACCENT[shell.id] ?? '#e0b054';
  const depth = state.depth;
  const reached = state.shaft.reached;
  const record = state.depthRecords[shell.id] ?? 0;
  const rail = railDepth(state);

  return (
    <>
      {/* Readout — top-left, unobtrusive. */}
      <div className="pointer-events-none absolute left-2 top-2 select-none">
        <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: accent }}>{shell.name}</div>
        <div className="tnum mt-0.5 text-[10px] leading-tight text-cave-300/90">
          depth <span className="text-cave-100">{depth}</span>
          {reached > 0 && <> · reached {reached}</>}
          {record > reached && <> · record {record}</>}
          {rail > 0 && <> · rail {rail}</>}
        </div>
      </div>

      {/* Bottom action row — climb, descend, and "here". */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-1.5 pt-6">
        <MultiDescendRow state={state} />
        <div className="flex items-stretch gap-1">
          <button
            className="btn min-h-[44px] flex-1 text-sm"
            disabled={depth <= 0}
            onClick={() => dispatch({ type: 'climb' })}
            aria-label="Climb up one"
          >↑<span className="ml-1 hidden text-xs sm:inline">Climb</span></button>
          <DescendButton state={state} />
          <button
            className={`btn min-h-[44px] flex-1 text-sm ${hereOpen ? 'btn-warm' : ''}`}
            onClick={onHere}
            aria-label="What can I do here"
          >⚒<span className="ml-1 hidden text-xs sm:inline">Here</span></button>
        </div>
      </div>

      {/* Sheets, over the column. */}
      {hereOpen && <Sheet onClose={onCloseSheets}><HereActions state={state} /></Sheet>}
      {selected && <Sheet onClose={onCloseSheets}><MarkerDetail state={state} marker={selected} /></Sheet>}
    </>
  );
}

/**
 * Multi-descend — go down several at once. Each button dispatches `descendMany`,
 * which is a loop of single descents, so it spends EXACTLY what that many taps
 * would and stops at the first wall or empty purse. Shown only when there is new
 * ground to dig and the rock ahead is not walled.
 */
function MultiDescendRow({ state }: { state: GameState }) {
  const shell = currentShell(state);
  const tool = equippedTool(state);
  const needed = requiredTier(state, state.depth + 1);
  const atFloor = state.depth >= shell.floorDepth;
  const walled = tool.tier < needed;
  const newGround = state.depth >= state.shaft.reached;
  // Only meaningful when there is fresh ground and the tool can take it.
  if (atFloor || walled || !newGround) return null;
  const toFloor = Math.max(0, shell.floorDepth - state.depth);
  const options: { label: string; count: number }[] = [
    { label: '×5', count: 5 },
    { label: '×25', count: 25 },
    { label: 'To floor', count: toFloor },
  ];
  return (
    <div className="mb-1 flex items-stretch gap-1">
      <span className="flex items-center pl-1 pr-0.5 text-[9px] uppercase tracking-wider text-cave-500">Dig</span>
      {options.map((o) => (
        <button
          key={o.label}
          className="btn min-h-[36px] flex-1 text-[11px]"
          title={`Descend up to ${o.count} — pays exactly that many single descents, stopping at the next wall or when the purse runs out`}
          onClick={() => dispatch({ type: 'descendMany', count: o.count })}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DescendButton({ state }: { state: GameState }) {
  const shell = currentShell(state);
  const tool = equippedTool(state);
  const needed = requiredTier(state, state.depth + 1);
  const atFloor = state.depth >= shell.floorDepth;
  const walled = tool.tier < needed;
  const cost = descendCost(state.depth + 1).mul(computeBucket(state, 'descendCost'));
  const chip = getCur(state, shell.chipCurrencyId);
  const canPay = chip.gte(cost);
  // Re-treading cleared rock is free (climb handles that); the button digs new ground.
  const newGround = state.depth >= state.shaft.reached;
  const disabled = atFloor || (newGround && (walled || !canPay));
  const label = atFloor ? 'Floor' : !newGround ? '↓ Down' : walled ? `Tier ${ROMAN[needed] ?? needed}` : '↓ Dig';
  return (
    <button
      className={`btn min-h-[44px] flex-1 text-sm ${!disabled && newGround ? 'btn-warm' : ''}`}
      disabled={disabled}
      title={atFloor ? 'The floor of this world — Breach from the Collapse' : walled && newGround ? `The rock below needs a Tier ${ROMAN[needed] ?? needed} tool` : undefined}
      onClick={() => dispatch({ type: 'descend' })}
      aria-label="Descend"
    >
      {label}
      {newGround && !atFloor && !walled && <span className="ml-1 hidden text-[10px] text-cave-400 sm:inline">{fmt(cost, 0)}</span>}
    </button>
  );
}

/** A bottom sheet that floats over the column; tap the scrim to dismiss. */
function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative max-h-[78%] overflow-y-auto rounded-t-xl border-t border-cave-700 bg-cave-950/97 p-2.5 shadow-2xl scroll-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-1.5 h-1 w-10 rounded-full bg-cave-700" />
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Here" — what you can do at the depth you're standing on
// ---------------------------------------------------------------------------

function HereActions({ state }: { state: GameState }) {
  const shell = currentShell(state);
  const depth = state.depth;
  const rail = railDepth(state);
  const cores = getCurrency(state, 'core');
  const caches = cachesOf(state);
  const railCost = railExtendCost(state);
  const canRail = depth > rail && depth > 0 && cores.gte(railCost);
  const installCost = cacheInstallCost(state);
  const cacheHere = state.shaft.caches.some((c) => c.shell === shell.id && c.depth === depth);
  const canInstall = depth > 0 && caches.length < MAX_CACHES_PER_SHELL && !cacheHere && cores.gte(installCost);
  const liftFitted = hasLift(state);
  const canFitLift = !liftFitted && rail > 0 && cores.gte(LIFT_CORE_COST);
  const canRide = liftFitted && depth < rail;

  return (
    <div className="space-y-1.5">
      <div className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-cave-300">Here · depth {depth}</div>

      <ActionRow
        label={depth <= rail ? 'The rail already reaches here' : `Lay rail to ${depth}`}
        sub={`survives Collapse · −${Math.round((1 - RAIL_DISCOUNT) * 100)}% on the climb back`}
        cost={depth <= rail ? undefined : `${railCost.toString()} Cores`}
        enabled={canRail} onClick={() => dispatch({ type: 'extendRail' })}
      />
      <ActionRow
        label={cacheHere ? 'A cache already sits here' : depth <= 0 ? 'Descend to sink a cache' : `Sink a cache at ${depth}`}
        sub="storage that outlives the Collapse — leave a stone to change"
        cost={canInstall ? `${installCost.toString()} Cores` : undefined}
        enabled={canInstall} onClick={() => dispatch({ type: 'installCache' })}
      />
      {(rail > 0 || liftFitted) && (
        liftFitted ? (
          <ActionRow
            label={`Ride the lift to the rail head (${rail})`}
            sub="one move down the track you laid — the toll, in one go"
            enabled={canRide} onClick={() => dispatch({ type: 'rideLift' })}
          />
        ) : (
          <ActionRow
            label="Fit the lift to the rail"
            sub="then ride to the rail head in one move"
            cost={`${LIFT_CORE_COST} Cores`}
            enabled={canFitLift} onClick={() => dispatch({ type: 'installLift' })}
          />
        )
      )}
      {caches.length === 0 && (
        <p className="px-0.5 pt-0.5 text-[10px] italic text-cave-500">Tap a stone alcove on the wall to leave or take a cure.</p>
      )}
    </div>
  );
}

function ActionRow({ label, sub, cost, enabled, onClick }: {
  label: string; sub?: string; cost?: string; enabled: boolean; onClick: () => void;
}) {
  return (
    <button
      className={`flex min-h-[44px] w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors ${
        enabled ? 'border-lamp-500/40 bg-cave-900 hover:bg-cave-800' : 'border-cave-800 bg-cave-950 opacity-55'
      }`}
      disabled={!enabled} onClick={onClick}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] text-cave-100">{label}</span>
        {sub && <span className="block text-[10px] leading-tight text-cave-500">{sub}</span>}
      </span>
      {cost && <span className="tnum shrink-0 text-[11px] text-lamp-300">{cost}</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Marker detail — cache / unmineable / dig / wall / floor
// ---------------------------------------------------------------------------

function MarkerDetail({ state, marker }: { state: GameState; marker: ShaftMarker }) {
  if (marker.kind === 'cache') return <CacheDetail state={state} depth={marker.depth} />;
  if (marker.kind === 'unmineable') return <UnmineableDetail state={state} />;
  if (marker.kind === 'dig') return <DigDetail state={state} id={marker.id} />;
  if (marker.kind === 'wall') return <WallDetail tier={marker.tier} depth={marker.depth} state={state} />;
  if (marker.kind === 'floor') return <FloorDetail depth={marker.depth} />;
  return null;
}

function CacheDetail({ state, depth }: { state: GameState; depth: number }) {
  const shell = currentShell(state);
  const idx = state.shaft.caches.findIndex((c) => c.shell === shell.id && c.depth === depth);
  const cache = state.shaft.caches[idx];
  if (!cache) return null;
  if (cache.material) {
    const recipe = cureFor(cache.material);
    const p = cacheProgress(state, cache);
    const ready = cacheReady(state, cache);
    const known = recipe ? state.shaft.curesFound.includes(recipe.id) : false;
    const hoursLeft = recipe ? recipe.hours * (1 - p) : 0;
    return (
      <div>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-cave-300">Cache · depth {depth}</div>
        <div className="flex items-center gap-2">
          <MaterialIcon id={cache.material} size={22} />
          <span className="min-w-0 flex-1 text-[13px] text-cave-100">
            {materialDef(cache.material).name} <span className="tnum text-cave-500">×{cache.qty}</span>
            {known && recipe ? <span className="text-cave-400"> → {materialDef(recipe.to).name}</span> : <span className="text-cave-600"> → changing…</span>}
          </span>
          <span className={`text-[11px] ${ready ? 'font-semibold text-[#9fd8c0]' : 'text-cave-400'}`}>{fmtLeft(hoursLeft)}</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded bg-cave-800">
          <div className="h-full bg-[#9fd8c0] transition-all" style={{ width: `${Math.round(p * 100)}%` }} />
        </div>
        <button className={`btn mt-2 min-h-[44px] w-full text-xs ${ready ? 'btn-warm' : ''}`} onClick={() => dispatch({ type: 'collectCache', index: idx })}>
          {ready ? 'Take it — it is ready' : 'Pull it out early (uncured, nothing lost)'}
        </button>
      </div>
    );
  }
  // empty — the candidates that will change at this depth
  const candidates = CURE_RECIPES
    .filter((r) => depth >= r.minDepth && materialCount(state, r.from) > 0)
    .map((r) => ({ r, held: materialCount(state, r.from), known: state.shaft.curesFound.includes(r.id) }));
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-cave-300">Empty cache · depth {depth}</div>
      {candidates.length === 0 ? (
        <p className="text-[11px] italic text-cave-500">Nothing you hold will change at this depth. Some stones want it deeper. Tap the wall elsewhere, or leave.</p>
      ) : (
        <div className="space-y-1">
          {candidates.map(({ r, held, known }) => (
            <button
              key={r.id}
              className="flex min-h-[44px] w-full items-center gap-2 rounded-md border border-cave-800 px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-cave-800"
              onClick={() => dispatch({ type: 'depositCache', index: idx, materialId: r.from, qty: Math.min(held, CACHE_CAP) })}
            >
              <MaterialIcon id={r.from} size={18} />
              <span className="min-w-0 flex-1 truncate text-cave-100">{materialDef(r.from).name} <span className="tnum text-cave-500">×{held}</span></span>
              <span className="shrink-0 text-[10px] text-cave-500">{known ? `→ ${materialDef(r.to).name} · ${fmtLeft(r.hours)}` : '→ ? · leave it to see'}</span>
            </button>
          ))}
        </div>
      )}
      <button className="mt-1.5 w-full py-1 text-[10px] text-cave-600 hover:text-cave-400" onClick={() => dispatch({ type: 'removeCache', index: idx })}>
        pull this empty cache
      </button>
    </div>
  );
}

function UnmineableDetail({ state }: { state: GameState }) {
  const shell = currentShell(state);
  const wall = WALL_BY_SHELL.get(shell.id);
  const r = wall ? wallReading(state, shell.id) : null;
  if (!wall || !r) return null;
  return (
    <div className="text-cave-300">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#cfc6e0]">{wall.name}</span>
        <span className="text-[9px] text-cave-500">depth {wall.depth} · unmineable</span>
      </div>
      {r.mirror.map((line, i) => <p key={`m${i}`} className="mb-1 text-[11px] leading-snug text-cave-300">{line}</p>)}
      {r.marks.length > 0 && (
        <div className="mt-2 border-t border-[#cfc6e0]/15 pt-2">
          <div className="mb-1 text-[9px] uppercase tracking-widest text-cave-600">scratched into the stone</div>
          {r.marks.map((line, i) => <p key={`s${i}`} className="mb-1 text-[11px] italic leading-snug text-[#b7aed0]">“{line}”</p>)}
        </div>
      )}
      {r.law.length > 0 && (
        <div className="mt-2 border-t border-[#cfc6e0]/15 pt-2">
          <div className="mb-1 text-[9px] uppercase tracking-widest text-cave-600">the only thing that ever changed it</div>
          {r.law.map((line, i) => <p key={`l${i}`} className="mb-0.5 text-[10px] leading-snug text-[#e0d6a8]">{line}</p>)}
        </div>
      )}
    </div>
  );
}

function DigDetail({ state, id }: { state: GameState; id: string }) {
  const site = EXCAVATION_BY_ID.get(id);
  if (!site) return null;
  const shifts = digShifts(state, id);
  const done = excavationDone(state, id);
  const onSite = state.depth === site.depth && state.shell.current === site.shell;
  const workedHere = state.shaft.lastDigDepth === site.depth;
  const revealed = site.stages.slice(0, shifts);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#e8c878]">{done ? site.name : 'Something is buried here'}</span>
        <span className="tnum text-[10px] text-cave-500">{shifts}/{site.stages.length} · depth {site.depth}</span>
      </div>
      {revealed.length === 0
        ? <p className="text-[11px] italic text-cave-400">Too big to chip out. Clear around it — a shift at a time, coming back as you pass.</p>
        : revealed.map((line, i) => <p key={i} className={`mb-1 text-[11px] leading-snug ${i === revealed.length - 1 ? 'text-cave-100' : 'text-cave-400'}`}>{line}</p>)}
      {!done && (
        <button
          className={`btn mt-1 min-h-[44px] w-full text-xs ${onSite && !workedHere ? 'btn-warm' : ''}`}
          disabled={!onSite || workedHere}
          title={!onSite ? 'Travel here to work it' : workedHere ? 'Move off it and come back for the next shift' : undefined}
          onClick={() => dispatch({ type: 'workExcavation', id })}
        >
          {!onSite ? `Travel to depth ${site.depth} to dig` : workedHere ? 'Come back for the next shift' : 'Clear a shift'}
        </button>
      )}
      {done && <div className="mt-1 text-[10px] italic text-[#b8a06a]">Fully uncovered. It is not going anywhere.</div>}
    </div>
  );
}

function WallDetail({ tier, depth, state }: { tier: number; depth: number; state: GameState }) {
  const passed = equippedTool(state).tier >= tier;
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#d8a080]">A hardness seam · depth {depth}</div>
      <p className="text-[11px] leading-snug text-cave-300">
        The rock hardens here. It takes a <span className="text-cave-100">Tier {ROMAN[tier] ?? tier}</span> tool to break past — {passed ? 'and yours does. This seam is behind you.' : 'more than yours can manage. Forge a better head to go deeper.'}
      </p>
    </div>
  );
}

function FloorDetail({ depth }: { depth: number }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-lamp-300">The floor · depth {depth}</div>
      <p className="text-[11px] leading-snug text-cave-300">
        The bottom of this world. Reach it and there is nowhere left to dig — you Breach from the Collapse, and fall through into the next shell.
      </p>
    </div>
  );
}
