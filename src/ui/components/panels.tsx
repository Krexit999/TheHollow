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
  drillInterval, drillPower, MAX_DRILLS, drillCondition, drillRepairCost,
  bayDraw, baySupply, bayLoadFactor, bayStaleness, seamOf, headFit, FIT_LOW, FIT_HIGH,
  bitGrainMult, grainWork, grainShare, GRAIN_SETTLE, recutCost,
  BAY_SYNERGIES, activeSynergies,
} from '../../engine/systems/drills';
import { DRILL_HEADS, drillHead, drillDraw } from '../../engine/content/drillParts';
import { affinityLevel, AFFINITY_MAX_BONUS } from '../../engine/systems/affinity';
import { materialCount } from '../../engine/systems/forge';
import { materialDef, MATERIALS } from '../../engine/materials';
import { MaterialIcon } from './MaterialIcon';
import type { DrillBehavior } from '../../engine';
import type { SeamProfile } from '../../engine/types';
import type { GameState } from '../../engine';
import { dispatch, useGame } from '../store';
import { Amount, BucketInfo, BUCKET_NAME } from './shared';
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

  const ids = ['kilnBuild', 'latticeUncover', 'forgeBuild', 'blade', 'soil', 'roots', 'lantern', 'expand'];
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

const BEHAVIOR_META: Record<DrillBehavior, { label: string; hint: string; color: string; glyph: string }> = {
  fullest: { label: 'Rich', hint: 'Strikes the fullest cell', color: '#fbbf24', glyph: '◆' },
  sweep: { label: 'Sweep', hint: 'Marches across the face in order', color: '#5eead4', glyph: '➤' },
  random: { label: 'Roam', hint: 'Wanders at random', color: '#c4b5fd', glyph: '∴' },
  chain: { label: 'Seam', hint: 'Follows adjacent charged cells', color: '#fb7185', glyph: '∞' },
};

/** A labelled 0..1 bar — the seam reads as three of these. */
function Gauge({ label, value, note, color = '#c7a35a' }: {
  label: string; value: number; note: string; color?: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[9px] uppercase tracking-[0.12em] text-cave-500">{label}</span>
        <span className="tnum text-[9px] text-cave-400">{Math.round(value * 100)}%</span>
      </div>
      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-cave-800">
        <div className="h-full rounded-full" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
      </div>
      <div className="mt-0.5 truncate text-[9px] text-cave-600" title={note}>{note}</div>
    </div>
  );
}

/**
 * THE BAY (A.52) — a shared feed, a live read of the rock, and whatever the
 * arrangement as a whole has turned out to be worth.
 *
 * Everything here is a READOUT of state the engine already computes. The panel
 * deliberately shows the FIT of every head against the current seam rather
 * than making the player infer it: the puzzle is meant to be solvable by
 * reasoning, not by trial (SYSTEM_IMPROVEMENTS: "legible tradeoffs, reason
 * don't guess"). What is NOT shown is any arrangement that has not fired yet
 * — those are found, never listed (pillar 5).
 */
export function DrillsPanel() {
  const state = useGame((s) => s.state);
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
  const feedDef = allUpgrades().find((u) => u.id === 'baySupply')!;
  const draw = bayDraw(state);
  const supply = baySupply(state);
  const load = bayLoadFactor(state);
  const seam = seamOf(state);
  const stale = bayStaleness(state);
  const found = BAY_SYNERGIES.filter((s) => state.drills.synergiesFound.includes(s.id));
  const live = new Set(activeSynergies(state).map((s) => s.id));

  return (
    <div className="space-y-2">
      {/* THE FEED — one budget, and what the bay is currently asking of it. */}
      <div className="panel p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-cave-300">The feed</span>
          <span className="tnum text-[10px] text-cave-400">
            <span className={draw > supply ? 'text-amber-400' : 'text-cave-200'}>{draw.toFixed(1)}</span>
            {' / '}{supply.toFixed(0)} drawn · {state.drills.units.length}/{MAX_DRILLS} chassis
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-cave-800">
          <div
            className="h-full rounded-full transition-[width]"
            style={{
              width: `${Math.min(100, (draw / Math.max(1, supply)) * 100)}%`,
              background: draw > supply ? '#e08a4a' : '#9ab87a',
            }}
          />
        </div>
        <p className="mt-1 text-[10px] leading-snug text-cave-500">
          {draw > supply
            ? <span className="text-amber-400">Browning out — every drill is running at {Math.round(load * 100)}% until the feed catches up, or something comes off.</span>
            : `Headroom for ${(supply - draw).toFixed(1)} more draw. A heavier head or a finer bit takes it out of what the rest can have.`}
        </p>
        <div className="mt-2"><UpgradeRow def={feedDef} /></div>
      </div>

      {/* THE SEAM — what the rock is doing, and what a re-solve is worth. */}
      <div className={`panel p-3 ${stale.gain > 0.04 ? 'border-lamp-500/40' : ''}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-cave-300">The seam</span>
          <span className="tnum text-[10px] text-cave-400">fit {Math.round(stale.now * 100)}%</span>
        </div>
        <div className="mt-1.5 flex gap-3">
          <Gauge label="Spread" value={seam.spread} note={seam.spread > 0.6 ? 'even across the face' : 'concentrated in a few cells'} />
          <Gauge label="Cluster" value={seam.cluster} note={seam.cluster > 0.6 ? 'rich cells touching' : 'rich cells scattered'} />
          <Gauge label="Hardness" value={seam.hardness} note={seam.hardness > 0.6 ? 'deep and hard' : 'near the roof'} />
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-cave-500">
          {stale.gain > 0.04
            ? <span className="text-lamp-300">The rock has turned under this bay. Re-fitting heads for what it is doing now is worth about {Math.round(stale.gain * 100)}% more.</span>
            : 'The heads suit what the face is doing. It will not stay that way as you go down.'}
        </p>
      </div>

      {/* WHAT THE BAY AS A WHOLE TURNED OUT TO BE. Only what has fired. */}
      {found.length > 0 && (
        <div className="panel p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#9ab87a]">The bay together</span>
            <span className="tnum text-[10px] text-cave-400">{live.size}/{found.length} holding</span>
          </div>
          {found.map((s) => (
            <div key={s.id} className={`mt-1.5 rounded-md border px-2 py-1.5 ${live.has(s.id) ? 'border-[#9ab87a]/40 bg-[#9ab87a]/5' : 'border-cave-800 opacity-60'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-[12px] font-semibold ${live.has(s.id) ? 'text-[#9ab87a]' : 'text-cave-400'}`}>{s.name}</span>
                <span className="shrink-0 text-[10px] text-cave-500">
                  {live.has(s.id)
                    ? <span className="text-lamp-400">+{Math.round(s.bonus * 100)}% {BUCKET_NAME[s.bucket]}</span>
                    : 'not holding'}
                </span>
              </div>
              <div className="mt-0.5 text-[10px] italic leading-snug text-cave-400">{s.line}</div>
            </div>
          ))}
        </div>
      )}

      {state.drills.units.length < MAX_DRILLS && <UpgradeRow def={countDef} />}
      <div className="space-y-1.5">
        {state.drills.units.map((unit, i) => (
          <DrillRow key={i} state={state} m={m} unit={unit} i={i} seam={seam} />
        ))}
      </div>
    </div>
  );
}

const CONDITION_META: Record<string, { label: string; color: string }> = {
  ok: { label: 'Sound', color: '#9ab87a' },
  strained: { label: 'Strained', color: '#d9b64a' },
  failing: { label: 'Failing', color: '#e08a4a' },
  broken: { label: 'BROKEN', color: '#e0604a' },
};

/** One drill — an individual: name, condition, affinity, and how it is configured. */
function DrillRow({ state, m, unit, i, seam }: {
  state: GameState; m: ModifierCache; unit: GameState['drills']['units'][number]; i: number; seam: SeamProfile;
}) {
  const upCost = D(5).mul(Math.pow(1.25, unit.level));
  const behavior = drillHead(unit.head)?.behavior ?? unit.behavior;
  const meta = BEHAVIOR_META[behavior];
  const cond = drillCondition(unit);
  const cm = CONDITION_META[cond]!;
  const wear = unit.wear ?? 0;
  const shell = currentShell(state);
  const aff = affinityLevel(unit, shell.id);
  // Both upgrade AND repair are paid in the shell's converted currency (Brick in
  // Loam, its own coin deeper). The old code checked BRICK for the upgrade, so
  // past Loam the button read the wrong purse. Name it, and check the real one.
  const conv = convCurrencyId(state);
  const convName = currencyDef(conv).name;
  const convColor = currencyDef(conv).color;
  const canUp = unit.level < 25 && getCurrency(state, conv).gte(upCost);
  const repairCost = D(drillRepairCost(unit));
  const canRepair = wear > 0 && getCurrency(state, conv).gte(repairCost);
  // Materials the player actually holds — the pool a bit can be cut from.
  const ownedBits = MATERIALS.filter((mm) => materialCount(state, mm.id) > 0).slice(0, 40);

  // A.52 per-drill readouts: what it asks of the feed, how its head suits the
  // rock, and what shape its bit has taken.
  const draw = drillDraw(unit);
  const fit = headFit(unit.head, seam);
  const grain = bitGrainMult(unit, shell.id);
  const settled = unit.bit ? grainWork(unit.bit) >= GRAIN_SETTLE : false;
  const share = unit.bit ? grainShare(unit.bit, shell.id) : 0;
  const recut = D(recutCost(unit));
  const canRecut = settled && getCurrency(state, conv).gte(recut);

  return (
    <div className="panel space-y-1.5 px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="text-base" style={{ color: meta.color }} title={meta.hint}>{meta.glyph}</span>
        <button
          className="min-w-0 flex-1 text-left"
          title="Rename this drill"
          onClick={() => {
            const name = window.prompt('Name this drill', unit.name ?? '')?.trim();
            if (name !== undefined) dispatch({ type: 'renameDrill', index: i, name });
          }}
        >
          <span className="truncate text-xs font-semibold text-cave-100">{unit.name ?? `Drill ${i + 1}`}</span>
          <span className="tnum ml-1.5 text-[10px] font-normal text-cave-400">Lv {unit.level}</span>
        </button>
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide" style={{ color: cm.color, background: `${cm.color}22` }}>{cm.label}</span>
        <button
          className={`btn shrink-0 px-2 py-1 text-[11px] ${canUp ? 'btn-warm' : ''}`}
          disabled={!canUp}
          title={unit.level >= 25 ? 'This drill is at its ceiling' : `Upgrade — costs ${fmtNum(upCost.toNumber(), 0)} ${convName}`}
          onClick={() => dispatch({ type: 'upgradeDrill', index: i })}
        >
          {unit.level >= 25 ? 'Max' : <>▲ <Amount value={upCost} color={convColor} /> <span className="text-[9px] font-normal text-cave-400">{convName}</span></>}
        </button>
      </div>

      <div className="tnum flex flex-wrap items-center gap-x-3 text-[10px] text-cave-400">
        <span>{fmtNum(drillPower(state, m, unit), 1)} charge / {fmtNum(drillInterval(state, m, unit), 2)}s</span>
        <span title="What this chassis asks of the shared feed">draw {draw.toFixed(2)}</span>
        <span
          title={`How well this head suits the seam right now (${FIT_LOW.toFixed(2)}–${FIT_HIGH.toFixed(2)})`}
          style={{ color: fit >= 1.05 ? '#9ab87a' : fit <= 0.9 ? '#e08a4a' : undefined }}
        >
          fit ×{fit.toFixed(2)}
        </span>
        {aff > 0.005 && (
          <span title={`This drill knows ${shell.name} — +${Math.round(aff * AFFINITY_MAX_BONUS * 100)}% power here`} style={{ color: '#c7a35a' }}>
            knows {shell.name} {Math.round(aff * 100)}%
          </span>
        )}
      </div>

      {/* Wear + repair — a drill in trouble is visibly in trouble. */}
      {wear > 0.001 && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cave-800">
            <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.round(wear * 100)}%`, background: cm.color }} />
          </div>
          <button
            className={`min-h-[28px] shrink-0 rounded border px-2 text-[10px] ${canRepair ? 'border-lamp-500/50 text-lamp-200 hover:bg-cave-800' : 'border-cave-800 text-cave-500'}`}
            disabled={!canRepair}
            title={`Repair to pristine — costs ${fmtNum(repairCost.toNumber(), 0)} ${convName}`}
            onClick={() => dispatch({ type: 'repairDrill', index: i })}
          >
            Repair <Amount value={repairCost} color={convColor} /> <span className="text-[9px] text-cave-400">{convName}</span>
          </button>
        </div>
      )}

      {/* THE GRAIN — what shape the bit has taken, and the way back. */}
      {unit.bit && settled && (
        <div className="flex items-center gap-2 rounded border border-cave-800 px-2 py-1">
          <span className="min-w-0 flex-1 text-[10px] leading-snug text-cave-400">
            <span style={{ color: grain >= 1.02 ? '#9ab87a' : grain <= 0.95 ? '#e08a4a' : '#c7a35a' }}>
              {grain >= 1.02 ? 'Shaped for here' : grain <= 0.95 ? 'Shaped for somewhere else' : 'Taking a shape'}
            </span>
            <span className="tnum"> ×{grain.toFixed(2)}</span>
            <span className="text-cave-600"> · {Math.round(share * 100)}% of its work was in {shell.name}</span>
          </span>
          <button
            className={`min-h-[28px] shrink-0 rounded border px-2 text-[10px] ${canRecut ? 'border-lamp-500/50 text-lamp-200 hover:bg-cave-800' : 'border-cave-800 text-cave-500'}`}
            disabled={!canRecut}
            title={`Grind the bit back to a flat edge — costs ${recut.toNumber()} ${convName}. It starts taking this world's shape from nothing.`}
            onClick={() => dispatch({ type: 'recutBit', index: i })}
          >
            Re-cut <Amount value={recut} color={convColor} />
          </button>
        </div>
      )}

      {/* Configuration: a head (targeting archetype) and a bit (material). */}
      <div className="flex flex-wrap items-center gap-1.5">
        {!unit.head && (
          <div className="flex gap-0.5">
            {(Object.keys(BEHAVIOR_META) as DrillBehavior[]).map((b) => (
              <button
                key={b}
                title={`${BEHAVIOR_META[b].label} — ${BEHAVIOR_META[b].hint}`}
                className={`h-6 w-6 rounded border text-[11px] leading-none ${unit.behavior === b ? 'border-transparent bg-cave-700' : 'border-cave-700 opacity-40 hover:opacity-80'}`}
                style={{ color: BEHAVIOR_META[b].color }}
                onClick={() => dispatch({ type: 'setDrillBehavior', index: i, behavior: b })}
              >{BEHAVIOR_META[b].glyph}</button>
            ))}
          </div>
        )}
        {/* Each head names its FIT against the live seam and its DRAW, so the
            allocation is reasoned rather than guessed. */}
        <Select
          className="min-w-[6.5rem] flex-1"
          ariaLabel="Drill head"
          title="Fit a head — it sets how the drill targets, what it draws, and what rock it suits"
          value={unit.head ?? ''}
          onChange={(v) => dispatch({ type: 'fitDrillHead', index: i, head: v || null })}
          options={[
            { value: '', label: 'No head (behaviour)' },
            ...DRILL_HEADS.map((h) => ({
              value: h.id,
              label: `${h.name} — fit ×${headFit(h.id, seam).toFixed(2)} · draw ${h.draw.toFixed(2)} · ${h.wants}`,
            })),
          ]}
        />
        <Select
          className="min-w-[6.5rem] flex-1"
          ariaLabel="Drill bit"
          title="Cut a bit from a material — its traits tune power, speed, and wear, and it takes the shape of the rock it works"
          value={unit.bit?.materialId ?? ''}
          onChange={(v) => dispatch({ type: 'fitDrillBit', index: i, materialId: v || null })}
          options={[
            { value: '', label: 'No bit' },
            ...(unit.bit && !ownedBits.some((b) => b.id === unit.bit!.materialId)
              ? [{ value: unit.bit.materialId, label: `${materialDef(unit.bit.materialId).name} (fitted)` }]
              : []),
            ...ownedBits.map((b) => ({ value: b.id, label: `${b.name} ×${materialCount(state, b.id)}` })),
          ]}
        />
        {unit.bit && <MaterialIcon id={unit.bit.materialId} size={16} />}
      </div>
    </div>
  );
}