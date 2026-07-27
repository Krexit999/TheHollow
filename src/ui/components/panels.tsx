import { useEffect, useRef, useState } from 'react';
import {
  allUpgrades,
  fmt,
  fmtNum,
  getCurrency,
  D,
} from '../../engine';
import { ModifierCache } from '../../engine/modifiers';
import { lawFlag } from '../../engine/laws';
import { cellCap, cellRegen, chipYield, dpsMax } from '../../engine/systems/face';
import { kilnRate, kilnEfficiency, KILN_DUST_PER_BRICK, overstokeActive, overstokeReady, overstokeCost } from '../../engine/systems/kiln';
import { KILN_FUELS, kilnFuel, OVERSTOKE_EFF_MULT, OVERSTOKE_WINDOW_SEC } from '../../engine/content/kilnFuel';
import {
  drillInterval, drillPower, MAX_DRILLS, BOUGHT_DRILLS, PRIZE_POWER, drillPriority,
  type DrillPriority,
} from '../../engine/systems/drills';
import {
  drillsCarrying, knownAbilities, drillFits, drillSlots, bestGradeOf,
  abilityBudget, loadoutUsed,
} from '../../engine/systems/drillAlloys';
import { PRIZE_SOURCES } from '../../engine/systems/prizeDrills';
import { ROMAN as ROMAN_G } from '../../engine/content/drillAlloys';
import { oreCount } from '../../engine/systems/ores';
import { oreDef, oreOddsHint } from '../../engine/content/ores';
import { materialCount } from '../../engine/systems/forge';
import type { GameState } from '../../engine';
import { dispatch, useGame } from '../store';
import { Amount, BucketInfo } from './shared';
import { Select } from './Select';
import { UpgradeRow, BulkControl, type PreviewStat } from './UpgradeRow';
import { MagnetCard } from './ferrite';
import { OpticsCard } from './glassmere';
import { PressureCard } from './cinder';
import { chipCurrencyId, convCurrencyId, currencyDef, currentShell } from '../../engine';

/** The four field stats, previewed before purchase — pillar 2 made legible. */
const FIELD_PREVIEW: PreviewStat[] = [
  { label: 'Yield', color: '#d4a86a', compute: (s, m) => fmt(chipYield(s, m)) },
  { label: 'Regen', color: '#9ab87a', compute: (s, m) => fmtNum(cellRegen(s, m), 3) },
  { label: 'Cap', compute: (s, m) => fmtNum(cellCap(s, m)) },
  { label: 'Ceiling', color: '#fbbf24', compute: (s, m) => fmt(dpsMax(s, m)) },
];

/** The Field — the most important information in the game, given real presence.
 * Field ceiling is pillar 2: income can never outrun it. */
function FieldStats({ state, m }: { state: GameState; m: ModifierCache }) {
  return (
    <div className="panel p-3">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-cave-400">The Field</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div className="flex items-baseline justify-between">
          <BucketInfo bucket="dustYield"><span className="text-xs text-cave-400">Yield / charge</span></BucketInfo>
          <span className="tnum font-semibold text-dust">{fmt(chipYield(state, m))}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <BucketInfo bucket="regen"><span className="text-xs text-cave-400">Regen / cell</span></BucketInfo>
          <span className="tnum font-semibold text-moss">{fmtNum(cellRegen(state, m), 3)}/s</span>
        </div>
        <div className="flex items-baseline justify-between">
          <BucketInfo bucket="cap"><span className="text-xs text-cave-400">Cell capacity</span></BucketInfo>
          <span className="tnum font-semibold text-cave-200">{fmtNum(cellCap(state, m))}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="cursor-help border-b border-dotted border-cave-600 text-xs text-cave-400" title="Width × Height × Regen × Yield — the hard ceiling on income. Nothing you do can beat it; systems raise the ceiling itself.">
            Field ceiling
          </span>
          <span className="tnum font-semibold text-lamp-400">{fmt(dpsMax(state, m))}/s</span>
        </div>
      </div>
      <div className="mt-2 border-t border-cave-800 pt-1.5 text-[10px] leading-snug text-cave-500">
        The ceiling is the most you can ever earn per second. Drills and idle income press up against it; to earn more, raise it.
      </div>
      <OreReadout state={state} />
    </div>
  );
}

/**
 * WHAT IS IN THE ROCK. Deliberately part of THE FIELD rather than a room of its
 * own: a pocket is not a system you visit, it is a property the face has, and
 * the number that matters is "is there anything out there right now".
 *
 * PILLAR 5 lives in what this does NOT say. Types appear here only after one
 * has been opened, the odds are a sentence rather than a table, and nothing
 * hints that there are more to find — a counter reading "2 of 4" would be the
 * locked list with extra steps.
 */
function OreReadout({ state }: { state: GameState }) {
  const pockets = oreCount(state);
  const seen = (state.face.oreSeen ?? []).map(oreDef).filter(Boolean);
  if (pockets === 0 && seen.length === 0) return null;
  return (
    <div className="mt-2 border-t border-cave-800 pt-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[#c8a45a]">In the rock</span>
        <span className="tnum text-[10px] text-cave-400">
          {pockets === 0 ? 'nothing right now' : `${pockets} pocket${pockets === 1 ? '' : 's'}`}
        </span>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-cave-500">
        {pockets > 0
          ? 'Hold on one to work it out by hand — slower, but you take it clean. A drill will open it faster and leave a little behind.'
          : oreOddsHint(state.shell.current, state.depth)}
      </p>
      {seen.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {seen.map((o) => (
            <div key={o!.id} className="flex items-baseline gap-1.5">
              <span className="mt-[3px] h-2 w-2 shrink-0 rounded-sm" style={{ background: `#${o!.colour.toString(16).padStart(6, '0')}` }} />
              <span className="shrink-0 text-[10px] font-semibold" style={{ color: `#${o!.colour.toString(16).padStart(6, '0')}` }}>{o!.name}</span>
              <span className="min-w-0 flex-1 truncate text-[9px] italic text-cave-600">{o!.line}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const mods = new ModifierCache();

function useFreshMods() {
  useGame((s) => s.rev);
  mods.invalidate();
  return mods;
}

// ---------------------------------------------------------------------------
// Dig — face upgrades + production stats
// ---------------------------------------------------------------------------

export function DigPanel() {
  const state = useGame((s) => s.state);
  const m = useFreshMods();
  if (!state) return null;

  // The two ORE rows sit with the face upgrades because that is what they are —
  // they change the rock, not a machine. Both carry their own `visible` gate
  // (nothing until a pocket has actually been opened), so listing them here
  // does not put them on screen before the player knows what ore is.
  const ids = ['kilnBuild', 'latticeUncover', 'forgeBuild', 'blade', 'soil', 'roots', 'lantern', 'prospect', 'deepsense', 'expand'];
  const defs = allUpgrades().filter(
    (u) => ids.includes(u.id) && (!u.visible || u.visible(state)) && !(u.id === 'kilnBuild' && state.kiln.built),
  );
  defs.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

  const spammable = defs.some((d) => d.maxLevel > 1);

  return (
    <div className="space-y-2">
      <FieldStats state={state as GameState} m={m} />
      {spammable && (
        <div className="flex justify-end">
          <BulkControl />
        </div>
      )}
      {defs.map((def) => (
        <UpgradeRow key={def.id} def={def} preview={FIELD_PREVIEW} />
      ))}
      <ShellBand state={state as GameState} />
      <PressureCard />
      <MagnetCard />
      <OpticsCard />
      {!state.kiln.built && (
        <p className="px-1 text-center text-xs italic text-cave-400">
          Something in the dark wants to be built. Save your {currencyDef(chipCurrencyId(state)).name}.
        </p>
      )}
    </div>
  );
}

/**
 * THE SHELL BAND (Part B) — the expanded tree, one section per shell, priced
 * through the spine and discovery-gated. Rows appear because you DID the
 * thing (felt a break, rigged a magnet, held the ore) — never a locked list.
 * Shells without an authored band (III–VII until the creative pass) render
 * nothing here.
 */
function ShellBand({ state }: { state: GameState }) {
  const rows = allUpgrades().filter((u) => u.band === 'shell' && (!u.visible || u.visible(state)));
  if (rows.length === 0) return null;
  return (
    <>
      <div className="mt-3 px-1 text-[9px] font-semibold uppercase tracking-widest text-cave-400">
        Fittings — bought from what this shell gives, kept through every collapse
      </div>
      {rows.map((def) => (
        <UpgradeRow key={def.id} def={def} preview={FIELD_PREVIEW} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Kiln
// ---------------------------------------------------------------------------

export function KilnPanel() {
  const state = useGame((s) => s.state);
  const m = useFreshMods();
  const reducedMotion = useGame((s) => s.reducedMotion);
  if (!state || !state.kiln.built) return null;

  const shell = currentShell(state);
  const chipName = currencyDef(chipCurrencyId(state)).name;
  const convName = currencyDef(convCurrencyId(state)).name;
  const convColor = currencyDef(convCurrencyId(state)).color;
  const heat = state.kiln.heat;
  const eff = kilnEfficiency(state);
  const rate = kilnRate(state, m);
  const brickPerMin = rate.mul(eff * 60 / KILN_DUST_PER_BRICK);
  const progressPct = state.kiln.progress.div(KILN_DUST_PER_BRICK).mul(100).toNumber();
  const defs = allUpgrades().filter((u) => ['bellows', 'firebrick'].includes(u.id));


  return (
    <div className="space-y-2">
      <div className="panel overflow-hidden p-4">
        {/* The kiln itself — it should visibly run. */}
        <div className="relative mx-auto h-28 w-40">
          <div className="absolute inset-x-4 bottom-0 top-2 rounded-t-full border-2 border-cave-600 bg-gradient-to-b from-cave-800 to-cave-900" />
          <div
            className={`absolute inset-x-9 bottom-0 top-9 rounded-t-full transition-colors ${heat > 0.05 && state.kiln.feeding && !reducedMotion ? 'kiln-fire' : ''}`}
            style={{
              background: `radial-gradient(ellipse at 50% 100%, rgba(251,146,60,${0.15 + heat * 0.8}), rgba(180,60,20,${heat * 0.5}) 55%, transparent 75%)`,
            }}
          />
          {!reducedMotion && heat > 0.25 && state.kiln.feeding && (
            <>
              <div className="ember absolute bottom-7 left-1/2 h-1 w-1 rounded-full bg-lamp-400" />
              <div className="ember absolute bottom-6 left-[42%] h-1 w-1 rounded-full bg-orange-500" style={{ animationDelay: '0.5s' }} />
              <div className="ember absolute bottom-8 left-[58%] h-0.5 w-0.5 rounded-full bg-lamp-300" style={{ animationDelay: '0.9s' }} />
            </>
          )}
          <div className="absolute inset-x-12 bottom-0 h-3 rounded-t border border-cave-600 bg-cave-950" />
        </div>
        <div className="mt-3 space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-cave-400">Heat</span>
            <div className="ml-3 h-2 flex-1 overflow-hidden rounded-full bg-cave-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-red-900 via-orange-600 to-lamp-300 transition-all"
                style={{ width: `${heat * 100}%` }}
              />
            </div>
            <span className="tnum ml-2 w-10 text-right text-cave-300">{Math.round(heat * 100)}%</span>
          </div>
          <div className="flex justify-between">
            <BucketInfo bucket="kilnRate">
              <span className="text-cave-400">Intake</span>
            </BucketInfo>
            <span className="tnum text-dust">{fmt(rate)}/s {chipName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-cave-400">Firing efficiency</span>
            <span className="tnum text-cave-200">{Math.round(eff * 100)}%</span>
          </div>
          <div className="flex justify-between">
            <BucketInfo bucket="brickYield">
              <span className="text-cave-400">Output</span>
            </BucketInfo>
            <span className="tnum" style={{ color: convColor }}>{fmt(brickPerMin)} {convName}/min</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-cave-400">Next {convName}</span>
            <div className="ml-3 h-1.5 flex-1 overflow-hidden rounded-full bg-cave-800">
              <div className="h-full rounded-full bg-brick" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>
        <button
          className={`btn mt-3 w-full py-2 text-sm ${state.kiln.feeding ? '' : 'btn-warm'}`}
          onClick={() => dispatch({ type: 'setKilnFeeding', feeding: !state.kiln.feeding })}
        >
          {state.kiln.feeding
            ? 'Bank the fire (stop feeding)'
            : `Stoke ${shell.converterName} (feed ${chipName})`}
        </button>

        {/* FUEL (v21) — a burn profile is a trade, not a ladder. Only the fuels
            you can actually feed (a material you hold) are offered. */}
        <div className="mt-2 flex items-center gap-1.5">
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-cave-500">Fuel</span>
          <Select
            className="flex-1"
            ariaLabel="Kiln fuel"
            title="Each fuel trades how fast it heats against how well it holds — no strictly-best"
            value={state.kiln.fuel ?? ''}
            onChange={(v) => dispatch({ type: 'setKilnFuel', fuelId: v || null })}
            options={[
              { value: '', label: 'Bare fire (no fuel)' },
              ...KILN_FUELS.map((f) => {
                const held = materialCount(state, f.materialId);
                return { value: f.id, label: `${f.name} ×${held}`, disabled: held < 1 && state.kiln.fuel !== f.id };
              }),
            ]}
          />
        </div>
        {kilnFuel(state.kiln.fuel) && (
          <p className="mt-1 text-[10px] italic leading-snug text-cave-500">{kilnFuel(state.kiln.fuel)!.note}</p>
        )}

        {/* OVERSTOKE — the deliberate burst. Opt-in, foreseeable, never accidental. */}
        {(() => {
          const active = overstokeActive(state as GameState);
          const ready = overstokeReady(state as GameState);
          const cost = overstokeCost(state as GameState, m);
          const secsLeft = active ? Math.ceil((state.kiln.overstokeUntil ?? 0) - state.stats.playTimeSec) : 0;
          const cdLeft = !ready ? Math.ceil((state.kiln.overstokeReadyAt ?? 0) - state.stats.playTimeSec) : 0;
          return (
            <button
              className={`btn mt-2 w-full py-1.5 text-xs ${active ? 'btn-warm' : ''}`}
              disabled={!ready || active}
              title="Force the fire to full for a short window — a burst of output for Dust up front"
              onClick={() => dispatch({ type: 'overstoke' })}
            >
              {active ? `Overstoked — ${secsLeft}s of ×${OVERSTOKE_EFF_MULT} output`
                : ready ? <>Overstoke (×{OVERSTOKE_EFF_MULT} for {OVERSTOKE_WINDOW_SEC}s · <Amount value={cost} color="#c96f4a" />)</>
                : `Recovering — ${cdLeft}s`}
            </button>
          );
        })()}
        {/* THE REVERSED KILN (Axiom). This control did not exist until Phase 13:
            the law could be written and then never used, because nothing
            dispatched setKilnReverse. An Axiom you cannot operate is not a rule
            rewrite, it is a dead purchase. */}
        {lawFlag(state as GameState, 'kilnReverse') && (
          <button
            className={`btn mt-2 w-full py-1.5 text-xs ${state.kiln.reverse ? 'btn-warm' : ''}`}
            onClick={() => dispatch({ type: 'setKilnReverse', on: !state.kiln.reverse })}
          >
            {state.kiln.reverse
              ? `Running backwards — ${shell.converterName} melting to ${chipName}`
              : 'Throw it into reverse'}
          </button>
        )}
      </div>
      {defs.length > 0 && <div className="flex justify-end"><BulkControl /></div>}
      {defs.map((def) => (
        <UpgradeRow key={def.id} def={def} preview={KILN_PREVIEW} />
      ))}
    </div>
  );
}

/** Kiln upgrades preview their effect on intake and Brick output. */
const KILN_PREVIEW: PreviewStat[] = [
  { label: 'Intake', color: '#d4a86a', compute: (s, m) => `${fmt(kilnRate(s, m))}/s` },
  { label: 'Brick/min', color: '#c96f4a', compute: (s, m) => fmt(kilnRate(s, m).mul(kilnEfficiency(s) * 60 / KILN_DUST_PER_BRICK)) },
];

// ---------------------------------------------------------------------------
// Drills
// ---------------------------------------------------------------------------

/**
 * THE DRILL BAY (A.53) — buy more, they mine. That is the whole panel.
 *
 * A.52 put a shared feed, a seam reading, a bit grain and five head archetypes
 * on this screen; before that, v21 put heads, bits and a wear bar on it. All of
 * it is gone. The bay is the IDLE layer, and every knob here was a chore on the
 * screen a player is least often looking at.
 *
 * What the bay DOES is now decided at the Forge: one drill alloy, equipped
 * bay-wide, granting an ability you can watch happen on the face. This panel
 * only says which one is running and what it does.
 */
export const PRIORITY_LABEL: Record<DrillPriority, string> = {
  both: 'rock and ore',
  oresFirst: 'ore first',
  ores: 'ore only',
  rock: 'rock only',
};

const PRIORITY_BLURB: Record<DrillPriority, string> = {
  both: 'Works the fullest rock it can reach, and takes a pocket once it is worth the trip — about seven-tenths full.',
  oresFirst: 'Goes for pockets at a THIRD full instead of seven-tenths, and gets first refusal on them. More pockets, less in each — a trade, not a bargain.',
  ores: 'Pockets and nothing else. It will stand idle rather than chip — that is the trade.',
  rock: 'Never touches a pocket, so yours keep until you dig them by hand.',
};

/**
 * THE ROUTING GUI — paint the squares, pick what it prefers, done.
 *
 * PLAIN HTML, and that is a standing ruling in this project, not a shortcut:
 * canvas UI has been tried twice on this codebase and reverted twice. The grid
 * below is a CSS grid of buttons over the live face dimensions, so it reads the
 * same shape the renderer draws without going near the renderer.
 *
 * PAINTING IS A DRAG, not twenty clicks. `pointerdown` sets the brush from
 * whatever the first cell was (down on a selected cell erases, down on a bare
 * one fills), and `pointerenter` while held continues it — the standard
 * minesweeper/spreadsheet gesture, and the only one that makes a 20×20 face
 * tolerable.
 *
 * NOTHING IS COMMITTED UNTIL DONE. The draft lives in component state, so a
 * player can scrub a selection about without the bay reacting mid-gesture.
 */
function RoutePicker({ index, onClose }: { index: number; onClose: () => void }) {
  const state = useGame((s) => s.state)!;
  const unit = state.drills.units[index]!;
  const w = state.face.w;
  const h = state.face.h;
  const [draft, setDraft] = useState<Set<number>>(() => new Set(unit.zone ?? []));
  const paint = useRef<null | boolean>(null);
  const box = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const prio = drillPriority(state, unit);

  /**
   * BRING ITSELF INTO VIEW. The painter renders at the BOTTOM of the room,
   * below every drill row — and with twenty-four machines each carrying a name
   * row, an alloy row, a charge row per fitted ability and a routing row, that
   * is thousands of pixels below the button that opened it. Clicking ROUTE
   * therefore looked like it did nothing at all: a brief pause while React
   * built a grid of up to four hundred buttons, and then no visible change.
   *
   * It is not a bug in the picker, which mounts and works perfectly. It is a
   * control that opens where the player is not looking, which amounts to the
   * same thing from the chair. The driver script needed a
   * `scrollIntoViewIfNeeded` to test it at all — and by this project's own
   * working rule, a harness that has to route around the layout is a bug
   * report about the layout.
   */
  useEffect(() => {
    /**
     * SCROLL THE GRID, NOT THE PANEL — and measure against the SCROLLING
     * ANCESTOR, which is the whole of what was wrong here.
     *
     * At 380x900 the face canvas, the depth panel, the hint strip and the room
     * selector eat the top ~590px, leaving the room's own scroll viewport about
     * 290px tall. Centring the PANEL therefore put its header in view and
     * pushed the first row of the grid up out of the container — clipped, not
     * off-window. `getBoundingClientRect` still reported the cell at y=536, so
     * a check written against the WINDOW said "visible" while
     * `elementFromPoint` at those exact coordinates returned the room selector.
     * Every pointer event went to the wrong element and the painter looked dead.
     *
     * So: bring the GRID into view, and let the header scroll off if it must.
     * The thing the player has to be able to touch is the squares.
     */
    // CENTRE THE GRID, not the panel and not the panel's top edge. Tried both:
    // centring the PANEL clipped the first grid row above the container, and
    // 'start' on the panel pushed the LAST row five pixels below the fold —
    // the room only has ~294px once the face canvas has taken its share. The
    // grid is the part that has to be reachable, so the grid is what is aimed.
    grid.current?.scrollIntoView({ block: 'center' });
  }, []);

  const apply = (cell: number, on: boolean) => {
    setDraft((cur) => {
      const next = new Set(cur);
      if (on) next.add(cell); else next.delete(cell);
      return next;
    });
  };

  const done = () => {
    // A full selection IS no selection — the engine stores nothing, so the
    // drill keeps the whole face even after an expansion renumbers the grid.
    dispatch({ type: 'setDrillZone', index, cells: [...draft] });
    onClose();
  };

  return (
    <div ref={box} className="panel border-[#9ad4e8]/40 p-3" data-testid="route-picker">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#9ad4e8]">
          Route · {unit.name ?? `Drill ${index + 1}`}
        </span>
        <span className="tnum text-[10px] text-cave-500" data-testid="route-count">
          {draft.size === 0 || draft.size >= w * h ? 'whole face' : `${draft.size} squares`}
        </span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        Drag across the squares it may work. None — or all — means anywhere.
      </p>

      {/* CAPPED, so the whole grid fits the ~290px the room actually has on a
          phone. Uncapped, a 6-wide face gave 47px cells and a 300px-tall grid
          that could not be shown all at once — and a painter you have to scroll
          WHILE dragging is not a painter. */}
      <div
        ref={grid}
        className="mx-auto mt-2 grid gap-[2px] rounded border border-cave-800 bg-cave-900/60 p-1"
        style={{ gridTemplateColumns: `repeat(${w}, minmax(0, 1fr))`, maxWidth: 'min(100%, 232px)' }}
        onPointerUp={() => { paint.current = null; }}
        onPointerLeave={() => { paint.current = null; }}
      >
        {Array.from({ length: w * h }, (_, c) => {
          const on = draft.has(c);
          const hasOre = !!state.face.ore?.[c];
          return (
            <button
              key={c}
              data-testid={`zone-cell-${c}`}
              aria-pressed={on}
              aria-label={`Cell ${c % w + 1}, ${Math.floor(c / w) + 1}`}
              className={`aspect-square rounded-[2px] border ${
                on ? 'border-[#9ad4e8]/70 bg-[#9ad4e8]/30' : 'border-cave-800 bg-cave-800/40'
              } ${hasOre ? 'ring-1 ring-inset ring-[#e8d48f]/60' : ''}`}
              onPointerDown={(e) => {
                e.preventDefault();
                paint.current = !on;
                apply(c, !on);
              }}
              onPointerEnter={() => { if (paint.current !== null) apply(c, paint.current); }}
            />
          );
        })}
      </div>

      <div className="mt-1.5 flex gap-1">
        <button
          className="flex-1 rounded border border-cave-700 py-1 text-[10px] uppercase tracking-wider text-cave-300 hover:bg-cave-800"
          data-testid="zone-all"
          onClick={() => setDraft(new Set(Array.from({ length: w * h }, (_, c) => c)))}
        >
          All
        </button>
        <button
          className="flex-1 rounded border border-cave-700 py-1 text-[10px] uppercase tracking-wider text-cave-300 hover:bg-cave-800"
          data-testid="zone-none"
          onClick={() => setDraft(new Set())}
        >
          None
        </button>
      </div>

      {/* PRIORITY. Four states, plain words, applied immediately — unlike the
          zone there is nothing to scrub, so waiting for Done would just be a
          step. */}
      <div className="mt-2 text-[10px] uppercase tracking-widest text-cave-500">And it prefers</div>
      <div className="mt-1 grid grid-cols-2 gap-1">
        {(['both', 'oresFirst', 'ores', 'rock'] as DrillPriority[]).map((p) => (
          <button
            key={p}
            data-testid={`priority-${p}`}
            aria-pressed={prio === p}
            className={`rounded border px-1.5 py-1 text-[10px] ${
              prio === p ? 'border-[#9ad4e8]/60 bg-[#9ad4e8]/10 text-[#9ad4e8]' : 'border-cave-800 text-cave-300 hover:bg-cave-800'
            }`}
            onClick={() => dispatch({ type: 'setDrillPriority', index, priority: p })}
          >
            {PRIORITY_LABEL[p]}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[10px] leading-snug text-cave-500">{PRIORITY_BLURB[prio]}</p>

      <button className="btn btn-warm mt-2 w-full py-1 text-[11px]" data-testid="route-done" onClick={done}>
        Done
      </button>
    </div>
  );
}

export function DrillsPanel() {
  const state = useGame((s) => s.state);
  const openAlloyBench = useGame((s) => s.openAlloyBench);
  const [routing, setRouting] = useState<number | null>(null);
  /** One entry per drill row, so DONE can put the player back where they were.
   *  Closing the painter shortens the room by several hundred pixels, so the
   *  scroll has to happen AFTER the unmount or it lands on the wrong thing. */
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const closeRouting = () => {
    const back = routing === null ? null : rowRefs.current.get(routing) ?? null;
    setRouting(null);
    requestAnimationFrame(() => back?.scrollIntoView({ block: 'center' }));
  };
  const m = useFreshMods();
  if (!state) return null;

  const bayDef = allUpgrades().find((u) => u.id === 'bayBuild')!;
  if (!state.drills.bayBuilt) {
    return (
      <div className="space-y-2">
        <UpgradeRow def={bayDef} />
      </div>
    );
  }

  const countDef = allUpgrades().find((u) => u.id === 'drillCount')!;
  const conv = convCurrencyId(state);
  const convName = currencyDef(conv).name;
  const convColor = currencyDef(conv).color;
  const throughput = state.drills.units.reduce(
    (sum, u) => sum + drillPower(state, m, u) / drillInterval(state, m, u), 0,
  );
  // THE BAY'S MIX (A.54): one line per ability actually on the rails. This is
  // the readout that replaced "the alloy" — there is no single answer any more,
  // and a bay running three things should say so.
  const fitted = knownAbilities(state)
    .map((a) => ({ def: a, on: drillsCarrying(state, a.id), grade: bestGradeOf(state, a.id) }))
    .filter((x) => x.on.length > 0);
  const bare = state.drills.units.filter((u) => (u.fits?.length ?? 0) === 0).length;
  const budget = abilityBudget(state);
  const used = loadoutUsed(state);
  const prizes = state.drills.units.filter((u) => u.prize).length;
  const nextPrize = PRIZE_SOURCES.find((p) => !state.drills.units.some((u) => u.prize === p.id));
  const hunting = state.drills.huntOres !== false;
  const pockets = oreCount(state);
  const orePocket = pockets === 0 ? 'Nothing' : `${pockets} pocket${pockets === 1 ? '' : 's'}`;

  return (
    <div className="space-y-2">
      {/* ══ HOW DO I GET ONE AT ALL ═══════════════════════════════════════
          Shown until the player has made their first ability, because until
          then NOTHING on this screen says where abilities come from. The bay
          had a "go to the alloy bench" button buried under a paragraph and
          that was the entire signpost — a player who did not already know the
          Forge made drill alloys had no way to find out. Three numbered steps
          and a button; it disappears the moment it is no longer needed. */}
      {knownAbilities(state).length === 0 && (
        <div className="panel border-lamp-500/40 p-3" data-testid="ability-howto">
          <div className="text-xs font-semibold uppercase tracking-wider text-lamp-300">
            Your drills can do more than chip
          </div>
          <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
            An ALLOY poured into a drill gives it something it does on its own — a blast, an arc
            that walks the face, a beam through a whole row. Nobody wrote down which mix makes
            which. The materials&apos; TRAITS are the clue.
          </p>
          <ol className="mt-1.5 space-y-1 text-[11px] text-cave-300">
            <li><span className="text-lamp-300">1.</span> Go to the Forge&apos;s alloy bench.</li>
            <li><span className="text-lamp-300">2.</span> Pick a drill, then two or three materials that lean hard on ONE trait.</li>
            <li><span className="text-lamp-300">3.</span> Pour. If it takes, that drill has it from then on and fires it by itself.</li>
          </ol>
          <button
            className="btn btn-warm mt-2 w-full py-1 text-[11px]"
            data-testid="goto-bench"
            onClick={() => openAlloyBench(state.drills.units.length > 0 ? [0] : [])}
          >
            Open the alloy bench
          </button>
        </div>
      )}

      <div className="panel p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-cave-300">The bay</span>
          <span className="tnum text-[10px] text-cave-400">
            {state.drills.units.length}/{MAX_DRILLS} drills · {fmtNum(throughput, 1)} charge/s
          </span>
        </div>
        <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
          They work the fullest cell on their own and never need telling. What each one DOES to
          the rock is decided at the Forge — an alloy poured into that drill, and no two need
          be the same.
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <BucketInfo bucket="drillSpeed"><span className="text-[10px] text-cave-400">Speed bonuses</span></BucketInfo>
          <span className="text-cave-700">·</span>
          <BucketInfo bucket="drillPower"><span className="text-[10px] text-cave-400">Bite bonuses</span></BucketInfo>
        </div>

        {/* SEND THEM AT THE POCKETS — the whole of drill routing, on purpose.
            One switch, no areas, no per-drill anything: A.52 proved what a
            configuration screen does to the idle layer. It defaults ON so an
            idle player never has to find it (pillar 1); turning it OFF is the
            interesting move, because a pocket is richer worked by hand. */}
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-cave-800 pt-2">
          <div className="min-w-0">
            <div className="text-[11px] text-cave-200">Send them at the pockets</div>
            <div className="text-[10px] leading-snug text-cave-500">
              {hunting
                ? `They open ore on their own — faster than you can, and they leave a little in the rock. ${orePocket} in the face now.`
                : `They leave ore alone, so it keeps until you work it yourself. ${orePocket} waiting.`}
            </div>
          </div>
          <button
            role="switch"
            aria-checked={hunting}
            aria-label="Send drills at ore pockets"
            className={`shrink-0 rounded border px-2 py-1 text-[10px] uppercase tracking-wider ${
              hunting ? 'border-[#8fd8c0]/60 bg-[#8fd8c0]/10 text-[#8fd8c0]' : 'border-cave-700 text-cave-400 hover:bg-cave-800'
            }`}
            onClick={() => dispatch({ type: 'setHuntOres', on: !hunting })}
          >
            {hunting ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      {/* ══ THE LOADOUT ══════════════════════════════════════════════════
          You can only run so many broken things at once, and the limit grows
          with every shell you have reached. Shown as a bar because the
          interesting state is "how much room is left", not a number — and
          because a pour that would overflow is REFUSED, so a player needs to
          see the wall before they hit it. */}
      <div className="panel p-3" data-testid="loadout">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#e8d48f]">The limit</span>
          <span className="tnum text-[10px] text-cave-400" data-testid="loadout-count">
            {used}/{budget} carried
          </span>
        </div>
        <div className="mt-1.5 flex h-2 gap-[2px] overflow-hidden rounded-sm">
          {Array.from({ length: budget }, (_, i) => (
            <div
              key={i}
              className="h-full flex-1"
              style={{ background: i < used ? '#e8d48f' : 'rgba(255,255,255,0.07)' }}
            />
          ))}
        </div>
        <p className="mt-1.5 text-[11px] italic leading-snug text-cave-400">
          The rails will only carry so much at once, and the worse an ability is the more of the
          limit it eats. Every shell you reach buys room for more of them — {budget} now.
        </p>
      </div>

      {/* THE MIX. Alloys are made at the Forge and poured into named drills;
          this is the readout of what the bay is actually running. */}
      <div className={`panel p-3 ${fitted.length > 0 ? 'border-[#8fd8c0]/40' : ''}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#8fd8c0]">The mix</span>
          <span className="text-[10px] text-cave-500">
            {fitted.length === 0
              ? 'nothing fitted'
              : `${fitted.length} ${fitted.length === 1 ? 'ability' : 'abilities'} · ${bare} bare`}
          </span>
        </div>
        {fitted.length > 0 ? (
          <>
            {fitted.map(({ def, on, grade }) => (
              <div key={def.id} data-testid={`mix-${def.id}`} className="mt-1.5 border-t border-cave-800 pt-1.5 first:border-t-0 first:pt-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-semibold text-[#8fd8c0]">
                    {def.name}
                    <span className="ml-1 text-[10px] font-semibold text-[#e8d48f]">grade {ROMAN_G[grade]}</span>
                  </span>
                  <span className="tnum shrink-0 text-[10px] text-cave-500">×{on.length}</span>
                </div>
                <div className="mt-0.5 text-[10px] leading-snug text-cave-300">{def.effect}</div>
                <div className="mt-0.5 text-[9px] uppercase tracking-wider text-cave-600">
                  {on.map((i) => state.drills.units[i]?.name ?? `Drill ${i + 1}`).join(' · ')}
                </div>
              </div>
            ))}
            <button
              className="mt-1.5 w-full rounded border border-cave-700 py-1 text-[10px] text-cave-300 hover:bg-cave-800"
              title="Pour another alloy at the Forge"
              onClick={() => openAlloyBench([])}
            >
              Change the mix at the Forge
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-[11px] italic leading-snug text-cave-500">
              Every drill runs bare. Pour an alloy at the Forge and the drill you pour it into
              takes its behaviour — nothing here is required, and a bare bay mines perfectly well.
            </p>
            <button
              className="mt-1.5 w-full rounded border border-cave-700 py-1 text-[10px] text-cave-300 hover:bg-cave-800"
              onClick={() => openAlloyBench([])}
            >
              Go to the alloy bench
            </button>
          </>
        )}
      </div>

      {state.drills.units.length < MAX_DRILLS && <UpgradeRow def={countDef} />}

      {/* WHERE THE OTHER RAILS COME FROM (A.56). Sixteen chassis are bought at
          a structural price; the last eight are earned, and they are better.
          Showing what is next is not a pillar-5 problem — a milestone reward is
          not a recipe, and a player who cannot see that a better machine exists
          has no reason to go and get it. */}
      <div className="panel border-[#e8d48f]/30 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#e8d48f]">Not for sale</span>
          <span className="tnum text-[10px] text-cave-500" data-testid="prize-count">
            {prizes}/{PRIZE_SOURCES.length} earned · {Math.min(state.drills.units.length, BOUGHT_DRILLS)}/{BOUGHT_DRILLS} bought
          </span>
        </div>
        <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
          Sixteen rails you can buy. The rest arrive from somewhere else — and those are bigger
          machines: they bite harder and they hold more than one alloy at a time.
        </p>
        {nextPrize ? (
          <div className="mt-1.5 flex items-baseline justify-between gap-2 border-t border-cave-800 pt-1.5">
            <span className="min-w-0 text-[11px] text-cave-300">
              {nextPrize.requirement}
            </span>
            <span className="shrink-0 text-[10px] text-[#e8d48f]">◆ {nextPrize.slots} slots</span>
          </div>
        ) : (
          <p className="mt-1.5 border-t border-cave-800 pt-1.5 text-[11px] text-[#e8d48f]">
            Every one of them is down here.
          </p>
        )}
      </div>

      {/* One compact row per chassis: a name, a level, a buy button. */}
      <div className="panel p-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-cave-300">On the rails</div>
        {state.drills.units.map((unit, i) => {
          const upCost = D(5).mul(Math.pow(1.25, unit.level));
          const canUp = unit.level < 25 && getCurrency(state, conv).gte(upCost);
          const fits = drillFits(unit);
          const slots = drillSlots(unit);
          const carried = fits[0]?.def ?? null;
          const zoned = unit.zone?.length ?? 0;
          const prio = drillPriority(state, unit);
          return (
            <div
              key={i}
              data-testid={`drill-row-${i}`}
              ref={(el) => {
                if (el) rowRefs.current.set(i, el);
                else rowRefs.current.delete(i);
              }}
              className={`mt-1 border-t pt-1 first:border-t-0 first:pt-0 ${unit.prize ? 'border-[#e8d48f]/30' : 'border-cave-800'}`}
            >
              <div className="flex items-center gap-2">
                <button
                  className="min-w-0 flex-1 text-left"
                  title="Rename this drill"
                  onClick={() => {
                    const name = window.prompt('Name this drill', unit.name ?? '')?.trim();
                    if (name !== undefined) dispatch({ type: 'renameDrill', index: i, name });
                  }}
                >
                  {/* A PRIZE READS AS A PRIZE from the row, not just on the
                      face: gold name, the source it came from, and the slot
                      count that is the actual reason it is better. */}
                  <span className={`truncate text-[11px] ${unit.prize ? 'font-semibold text-[#e8d48f]' : 'text-cave-200'}`}>
                    {unit.prize && '★ '}{unit.name ?? `Drill ${i + 1}`}
                  </span>
                  <span className="tnum ml-1.5 text-[10px] text-cave-500">Lv {unit.level}</span>
                  {unit.prize && (
                    <span className="ml-1.5 text-[9px] uppercase tracking-wider text-[#e8d48f]/80">
                      prize · {slots} slots · ×{PRIZE_POWER} bite
                    </span>
                  )}
                </button>
                <span className="tnum shrink-0 text-[10px] text-cave-500">
                  {fmtNum(drillPower(state, m, unit), 1)} / {fmtNum(drillInterval(state, m, unit), 2)}s
                </span>
                <button
                  className={`btn shrink-0 px-2 py-1 text-[11px] ${canUp ? 'btn-warm' : ''}`}
                  disabled={!canUp}
                  title={unit.level >= 25 ? 'This drill is at its ceiling' : `Upgrade — costs ${fmtNum(upCost.toNumber(), 0)} ${convName}`}
                  onClick={() => dispatch({ type: 'upgradeDrill', index: i })}
                >
                  {unit.level >= 25 ? 'Max' : <>▲ <Amount value={upCost} color={convColor} /></>}
                </button>
              </div>
              {/* THE ALLOY LINE (A.54). What this ONE machine is running, and
                  the way to change it: the button carries the drill through to
                  the Forge's bench with this drill already picked, so the two
                  screens are one gesture apart rather than a hunt. */}
              <div className="mt-0.5 flex items-center gap-1.5">
                <button
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${
                    carried
                      ? 'border-[#8fd8c0]/50 bg-[#8fd8c0]/10 text-[#8fd8c0]'
                      : 'border-cave-700 text-cave-400 hover:bg-cave-800'
                  }`}
                  title={carried ? `Running ${carried.name} — re-pour at the Forge` : 'Pour an alloy into this drill at the Forge'}
                  onClick={() => openAlloyBench([i])}
                >
                  Alloy{slots > 1 ? ` ${fits.length}/${slots}` : ''}
                </button>
                <span className="min-w-0 flex-1 truncate text-[10px] text-cave-500" data-testid={`drill-fits-${i}`}>
                  {fits.length === 0
                    ? 'runs bare'
                    : fits.map((f) => `${f.def.name} ${ROMAN_G[f.grade]}`).join(' + ')}
                </span>
                {fits.length > 0 && (
                  <button
                    className="shrink-0 text-[9px] uppercase tracking-wider text-cave-600 hover:text-cave-300"
                    title="Take the alloys out. Free — but putting one back is another pour."
                    onClick={() => dispatch({ type: 'clearDrillAlloy', index: i })}
                  >
                    strip
                  </button>
                )}
              </div>

              {/* ══ THE CHARGE METERS ═══════════════════════════════════════
                  One row per fitted ability: what it is, how full it is, and —
                  once it is full — a button to set it off NOW instead of
                  waiting for the next stroke to do it.

                  CLICKING IS NEVER REQUIRED. The meter fires itself the moment
                  it fills, so an away player receives every ability without
                  ever seeing this row (pillar 1). What the button buys is
                  TIMING, which is the only thing worth paying for. */}
              {fits.map((f) => {
                const pct = Math.min(1, f.charge / Math.max(1, f.def.charge.need));
                return (
                  <div key={f.slot} className="mt-0.5" data-testid={`charge-${i}-${f.slot}`}>
                    {/* WHAT IT IS, WHEN IT GOES OFF, AND HOW FAR ALONG IT IS.
                        The first cut showed a coloured bar and a percentage and
                        nothing else, so a player could see SOMETHING filling
                        without knowing what it was for or what would happen at
                        the end of it. The line now says the ability, its firing
                        rule, and the count — "SLAGBURST · every 30 strokes ·
                        12/30" — which is the whole of what there is to know. */}
                    <div className="flex items-baseline gap-1.5">
                      <span
                        className="shrink-0 text-[9px] font-semibold uppercase tracking-wider"
                        style={{ color: `#${f.def.color.toString(16).padStart(6, '0')}` }}
                      >
                        {f.def.name}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[9px] text-cave-500">
                        every {f.def.charge.need} strokes
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
                        data-testid={`charge-bar-${i}-${f.slot}`}
                        style={{
                          width: `${Math.round(pct * 100)}%`,
                          background: f.ready ? '#ffffff' : `#${f.def.color.toString(16).padStart(6, '0')}`,
                        }}
                      />
                    </div>
                    <button
                      data-testid={`fire-${i}-${f.slot}`}
                      disabled={!f.ready}
                      className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${
                        f.ready
                          ? 'border-white/70 bg-white/10 text-white'
                          : 'border-cave-800 text-cave-700'
                      }`}
                      title={f.ready ? `Set ${f.def.name} off now` : `${f.def.name} charges as the drill works — it fires itself when it is full`}
                      onClick={() => dispatch({ type: 'fireAbility', index: i, slot: f.slot })}
                    >
                      {f.ready ? '▶ Fire' : `${Math.round(pct * 100)}%`}
                    </button>
                    </div>
                    {/* What it will DO, once — a player who has just poured
                        their first alloy has no idea, and the Forge card that
                        said so is two rooms away. */}
                    <div className="mt-0.5 text-[9px] leading-snug text-cave-600">{f.def.effect}</div>
                  </div>
                );
              })}

              {/* ROUTING (A.56). One button, and it says the current state on
                  its face — "whole face · both" is the default and reads as a
                  default, so nobody has to open it to find out nothing is set. */}
              <div className="mt-0.5 flex items-center gap-1.5">
                <button
                  data-testid={`route-${i}`}
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${
                    zoned > 0 || unit.priority
                      ? 'border-[#9ad4e8]/50 bg-[#9ad4e8]/10 text-[#9ad4e8]'
                      : 'border-cave-700 text-cave-400 hover:bg-cave-800'
                  }`}
                  title="Choose which squares this drill works, and what it prefers"
                  onClick={() => (routing === i ? closeRouting() : setRouting(i))}
                >
                  {routing === i ? 'Editing' : 'Routing'}
                </button>
                <span className="min-w-0 flex-1 truncate text-[10px] text-cave-500" data-testid={`route-state-${i}`}>
                  {zoned > 0 ? `${zoned} squares` : 'whole face'} · {PRIORITY_LABEL[prio]}
                </span>
              </div>

              {/* ══ THE PAINTER, UNDER THE MACHINE IT BELONGS TO ═══════════
                  It used to render at the BOTTOM of the room, below every
                  drill row, and that was two separate defects wearing one
                  symptom ("clicking Route does nothing but hang").

                  1  IT OPENED WHERE NOBODY WAS LOOKING. With eight machines it
                     was ~1,500px below the button; with twenty-four, far more.
                     The mount and the paint logic were fine the whole time.
                  2  IT WALKED UNDER THE POINTER. Measured, not guessed: cell 0
                     sat at y=523 and 1.2 seconds later at y=720. PRIZE DRILLS
                     ARRIVE ON THE ONE-SECOND BEAT and are appended to the list
                     ABOVE the painter, so every one that landed shoved the grid
                     ~65px down mid-drag. A real player routing a drill while an
                     achievement lands gets the same thing.

                  Rendering it under its OWN row fixes both: the scroll is short,
                  and a drill appended to the END of the list cannot move a
                  painter that sits above the end. (This is the same class as the
                  hover-flicker note — a live-data control that walks under the
                  cursor is not a control.) */}
              {routing === i && <RoutePicker index={i} onClose={closeRouting} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}