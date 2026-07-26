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
import { drillInterval, drillPower, MAX_DRILLS } from '../../engine/systems/drills';
import { drillsCarrying, knownAbilities } from '../../engine/systems/drillAlloys';
import { ABILITY_BY_ID } from '../../engine/content/drillAlloys';
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
export function DrillsPanel() {
  const state = useGame((s) => s.state);
  const openAlloyBench = useGame((s) => s.openAlloyBench);
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
    .map((a) => ({ def: a, on: drillsCarrying(state, a.id) }))
    .filter((x) => x.on.length > 0);
  const bare = state.drills.units.filter((u) => !u.alloy).length;

  return (
    <div className="space-y-2">
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
            {fitted.map(({ def, on }) => (
              <div key={def.id} className="mt-1.5 border-t border-cave-800 pt-1.5 first:border-t-0 first:pt-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-semibold text-[#8fd8c0]">{def.name}</span>
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

      {/* One compact row per chassis: a name, a level, a buy button. */}
      <div className="panel p-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-cave-300">On the rails</div>
        {state.drills.units.map((unit, i) => {
          const upCost = D(5).mul(Math.pow(1.25, unit.level));
          const canUp = unit.level < 25 && getCurrency(state, conv).gte(upCost);
          const carried = unit.alloy ? ABILITY_BY_ID.get(unit.alloy) : null;
          return (
            <div key={i} className="mt-1 border-t border-cave-800 pt-1 first:border-t-0 first:pt-0">
              <div className="flex items-center gap-2">
                <button
                  className="min-w-0 flex-1 text-left"
                  title="Rename this drill"
                  onClick={() => {
                    const name = window.prompt('Name this drill', unit.name ?? '')?.trim();
                    if (name !== undefined) dispatch({ type: 'renameDrill', index: i, name });
                  }}
                >
                  <span className="truncate text-[11px] text-cave-200">{unit.name ?? `Drill ${i + 1}`}</span>
                  <span className="tnum ml-1.5 text-[10px] text-cave-500">Lv {unit.level}</span>
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
                  Alloy
                </button>
                <span className="min-w-0 flex-1 truncate text-[10px] text-cave-500">
                  {carried ? carried.effect : 'runs bare'}
                </span>
                {carried && (
                  <button
                    className="shrink-0 text-[9px] uppercase tracking-wider text-cave-600 hover:text-cave-300"
                    title="Take the alloy out. Free — but putting one back is another pour."
                    onClick={() => dispatch({ type: 'clearDrillAlloy', index: i })}
                  >
                    strip
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}