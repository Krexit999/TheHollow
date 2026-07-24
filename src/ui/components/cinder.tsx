/**
 * Phase 9 UI: heat and threat. The Pressure card (the gauge and its two
 * levers), the OVERPRESSURE and flood states (calm, legible, motionless),
 * the Vent Network, the Ember Array, the Magma Wells, and the anomaly
 * banner. The boldness budget is spent on heat; everything else is quiet.
 */
import { useEffect, useRef, useState } from 'react';
import { fmt, getCurrency } from '../../engine';
import type { GameState } from '../../engine';
import {
  MAX_PIPES, OVERPRESSURE_SEC, VENT_OUTLETS, VENT_SHAFT_CELL,
  VENT_W, VENT_H, FREE_PIPES, heatCeiling, holdLine, networkCapacity, nextPipeCost, ventRate, yieldMult,
} from '../../engine/systems/pressure';
import {
  ARRAY_SIZE, BAND_HIGH, BAND_LOW, FUELS, FUEL_BY_ID, arrayUnlocked, DRAW_RATE, DRAW_FLOOR,
  openRows, ANNEAL_SEC,
} from '../../engine/content/shell5/emberArray';
import { materialCount } from '../../engine/systems/forge';
import { InstallButton } from './exports';
import { WELLS, WELL_ODDS, wellProgress, wellsUnlocked, wellTapLive } from '../../engine/content/shell5/wells';
import { ANOMALY_BY_ID } from '../../engine/systems/anomalies';
import { floodCasualty } from '../../engine/systems/pressure';
import { npcDef } from '../../engine/guild/npcs';
import { dispatch, useGame } from '../store';
import { Amount } from './shared';

const heatColor = (heat: number): string =>
  heat >= 95 ? '#ff4a2a' : heat >= 85 ? '#f07038' : heat >= 70 ? '#e09a4a' : heat >= 40 ? '#c9a86a' : '#8a97a8';

// ---------------------------------------------------------------------------
// The Pressure card — lives in the Dig panel while the shaft can burn.
// ---------------------------------------------------------------------------

export function PressureCard() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const native = state.shell.current === 'cinder';
  const carried = state.shell.signatures.includes('pressure');
  if (!native && !carried) return null;
  const p = state.pressure;
  const line = holdLine(state as GameState);
  const ceiling = heatCeiling(state as GameState, native);
  const mult = yieldMult(state as GameState, native ? 1 : 0.4);
  const crew = Object.entries(state.guild.hirelings).filter(([, h]) => h.status === 'well');
  const casualty = native ? floodCasualty(state as GameState) : null;

  return (
    <div className="panel p-3" style={p.heat >= 85 ? { borderColor: heatColor(p.heat) } : undefined}>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold" style={{ color: '#e0955c' }}>Pressure</span>
        <span className="tnum text-[10px] text-cave-400">
          yield ×{mult.toFixed(2)} · vents {ventRate(state as GameState).toFixed(1)}°/s
        </span>
      </div>
      {/* The gauge: hold-line and governor marked — the whole law, visible. */}
      <div className="relative mt-2 h-3 overflow-hidden rounded-full border border-cave-700 bg-cave-950">
        <div className="h-full" style={{ width: `${p.heat}%`, background: heatColor(p.heat), opacity: 0.85 }} />
        <div className="absolute top-0 h-full w-0.5 bg-cave-400/70" style={{ left: `${line}%` }} title={`The Damper holds an idle shaft here (${line.toFixed(0)})`} />
        {native && !p.choke && (
          <div className="absolute top-0 h-full w-0.5 bg-[#e0955c]" style={{ left: `${ceiling}%` }} title={`The governor: open vents cannot pass ${ceiling.toFixed(0)}`} />
        )}
      </div>
      <div className="tnum mt-0.5 flex justify-between text-[9px] text-cave-400">
        <span>heat {p.heat.toFixed(0)} / 100</span>
        <span>{p.choke ? 'VENTS CHOKED — the governor is off' : `governor at ${ceiling.toFixed(0)} · hold-line ${line.toFixed(0)}`}</span>
      </div>
      {native && (
        <div className="mt-2 flex gap-1.5">
          <button
            className={`btn flex-1 py-1.5 text-xs ${p.choke ? 'btn-warm' : ''}`}
            title="Choke the vents: heat can reach 100 and FLOOD. The whole gamble, one switch. It releases itself if you walk away."
            onClick={() => dispatch({ type: 'setChoke', on: !p.choke })}
          >
            {p.choke ? 'Open the vents' : 'Choke the vents'}
          </button>
          <button
            className="btn flex-1 py-1.5 text-xs"
            title="Always works: −60 heat for a quarter of held Slag."
            onClick={() => dispatch({ type: 'emergencyPurge' })}
          >
            Purge (¼ Slag)
          </button>
        </div>
      )}
      {native && crew.length > 0 && (
        <div className="mt-1.5 flex items-center justify-between border-t border-cave-800 pt-1.5 text-[10px]">
          <span className={state.guild.crewRecalled ? 'text-cave-400' : p.heat >= 85 ? 'text-[#f07038]' : 'text-cave-400'}>
            {state.guild.crewRecalled
              ? 'Crew recalled — safe, idle, restation under 70 heat'
              : p.heat >= 85 && casualty
                ? `${npcDef(casualty).name} would not outrun a flood`
                : `${crew.length} crew on the floor`}
          </span>
          {!state.guild.crewRecalled && (
            <button className="btn px-2 py-0.5 text-[10px]" onClick={() => dispatch({ type: 'recallCrew' })}>
              Recall crew
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OVERPRESSURE + the flood — the failure state, legible standing still.
// ---------------------------------------------------------------------------

export function OverpressureOverlay() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state || state.pressure.overpressureAtSec === null) return null;
  const left = Math.max(0, OVERPRESSURE_SEC - (state.stats.playTimeSec - state.pressure.overpressureAtSec));
  const casualty = floodCasualty(state as GameState);
  return (
    <div className="pointer-events-auto absolute inset-x-0 top-10 z-30 mx-auto w-full max-w-md px-3">
      <div className="rounded-lg border-2 border-[#ff4a2a] bg-[#1a0b07]/95 p-3 text-center shadow-2xl">
        <div className="text-sm font-bold tracking-widest text-[#ff6a4a]">OVERPRESSURE</div>
        <div className="tnum mt-0.5 text-2xl font-bold text-[#ffb36a]">{Math.ceil(left)}s</div>
        <div className="mt-1 text-[11px] leading-snug text-[#e8b8a0]">
          The shaft floods when this reaches zero — the run, not your things.
          {casualty ? ` ${npcDef(casualty).name} is still down here.` : ''}
        </div>
        <div className="mt-2 flex gap-1.5">
          <button className="btn btn-warm flex-1 py-1.5 text-xs" onClick={() => dispatch({ type: 'emergencyPurge' })}>
            PURGE — always works (¼ Slag)
          </button>
          {state.pressure.choke && (
            <button className="btn flex-1 py-1.5 text-xs" onClick={() => dispatch({ type: 'setChoke', on: false })}>
              Open the vents
            </button>
          )}
          {casualty && (
            <button className="btn px-2 py-1.5 text-xs" onClick={() => dispatch({ type: 'recallCrew' })}>
              Recall crew
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function FloodModal() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);
  const [flood, setFlood] = useState<{ depth: number; lost: string | null } | null>(null);
  const lastSeq = useRef(-1);
  const pendingLost = useRef<string | null>(null);
  useEffect(() => {
    if (!state) return;
    for (const entry of state.feed) {
      if (entry.seq <= lastSeq.current) continue;
      lastSeq.current = entry.seq;
      const ev = entry.event;
      // The casualty is announced first; the flood card collects it.
      if (ev.type === 'hirelingLost') pendingLost.current = ev.npcId;
      if (ev.type === 'flood') {
        setFlood({ depth: ev.depth, lost: pendingLost.current });
        pendingLost.current = null;
      }
    }
  }, [rev, state]);
  if (!flood) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="panel w-full max-w-sm border-[#7c3020] p-5 text-center">
        <div className="font-display text-xl font-semibold text-[#ff6a4a]">The shaft flooded.</div>
        <div className="mt-2 text-xs leading-relaxed text-cave-300">
          The run ends at depth {flood.depth}, paying nothing. Your records, tools, materials,
          boards, and standing all survive — the mountain took the descent, not your life's work.
        </div>
        {flood.lost && (
          <div className="mt-2 rounded-md border border-[#7c3020] p-2 text-xs text-[#e8b8a0]">
            {npcDef(flood.lost).name} did not come back up. The Lamphouse will keep the berth dark.
          </div>
        )}
        <div className="mt-3 text-[10px] italic text-cave-400">
          It flooded because the vents were held shut through the whole countdown. It will only ever happen that way.
        </div>
        <button className="btn btn-warm mt-3 w-full py-2 text-sm" onClick={() => setFlood(null)}>
          Back to the dig
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The anomaly banner — an event, not a chore. Ignoring it is always free.
// ---------------------------------------------------------------------------

export function AnomalyBanner() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state?.anomalies.active) return null;
  const def = ANOMALY_BY_ID.get(state.anomalies.active.id);
  if (!def) return null;
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-2 z-20 mx-auto w-full max-w-md px-3">
      <div className="rounded-lg border border-[#8a6aa8] bg-cave-900/95 p-2.5 shadow-xl">
        <div className="text-xs font-semibold text-[#c9a8e8]">{def.name}</div>
        <div className="mt-0.5 text-[11px] leading-snug text-cave-300">{def.banner}</div>
        <div className="mt-1.5 flex items-center gap-2">
          <button className="btn btn-warm flex-1 py-1 text-xs" onClick={() => dispatch({ type: 'answerAnomaly' })}>
            {def.answerLabel}
          </button>
          <span className="text-[9px] italic text-cave-400">or ignore it — it settles harmlessly</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Vent Network — plumbing as a hobby, headroom as the payoff.
// ---------------------------------------------------------------------------

export function VentsPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  if (state.shell.current !== 'cinder' && !state.shell.signatures.includes('pressure')) {
    return <div className="panel p-4 text-center text-xs italic text-cave-400">The gallery above the shaft is bare rock, for now.</div>;
  }
  const cap = networkCapacity(state as GameState);
  const pipes = state.pressure.pipes.filter((x) => x > 0).length;
  const cost = nextPipeCost(state as GameState);

  return (
    <div className="space-y-2">
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#e0955c]">Venting</span>
          <span className="tnum text-[10px] text-cave-400">
            +{cap.toFixed(2)}°/s · hold-line {holdLine(state as GameState).toFixed(0)} · pipes {pipes}/{MAX_PIPES}
          </span>
        </div>
        <div className="mt-1 text-[10px] leading-snug text-cave-400">
          Route pipe from the shaft mouth (left) to the outlets (◍). Shorter runs vent harder.
          Better routing is how you run hotter SAFELY — for the idle line and the greedy one alike.
          Pulling pipe back up is free; re-routing is the whole game here.
        </div>
        {pipes >= FREE_PIPES && pipes < MAX_PIPES && (
          <div className="mt-1 text-[10px] leading-snug text-[#a2b8a8]">
            Sections past the twelfth want <span className="font-semibold">1 Glasseal</span> each
            (held {materialCount(state as GameState, 'glasseal')}) — Glassmere's export. Cast at the
            Bench, or from Serra.
          </div>
        )}
        <div className="mt-2 inline-block">
          {Array.from({ length: VENT_H }, (_, r) => (
            <div key={r} className="flex gap-0.5" style={{ marginTop: r > 0 ? 2 : 0 }}>
              {Array.from({ length: VENT_W }, (_, c) => {
                const cell = r * VENT_W + c;
                const laid = state.pressure.pipes[cell] === 1;
                const shaft = cell === VENT_SHAFT_CELL;
                const outlet = VENT_OUTLETS.includes(cell);
                return (
                  <button
                    key={c}
                    className={`h-8 w-8 rounded-[3px] border text-[13px] leading-none ${
                      laid ? 'border-[#e0955c] bg-[#3a2418] text-[#ffb36a]'
                      : shaft ? 'border-[#ff6a4a] bg-[#2a120a] text-[#ff8a5a]'
                      : outlet ? 'border-cave-500 bg-cave-900 text-cave-300'
                      : 'border-cave-700 bg-cave-950 text-cave-600'
                    }`}
                    title={shaft ? 'The shaft mouth — heat starts here' : outlet ? 'An outlet — reach it with pipe' : laid ? 'Tap to pull the pipe (free)' : `Lay pipe · ${cost} Obsidian`}
                    onClick={() => dispatch({ type: 'layPipe', cell })}
                  >
                    {shaft ? '▣' : outlet ? '◍' : laid ? '━' : '·'}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="tnum mt-1.5 text-[10px] text-cave-400">
          Next section: {cost} Obsidian (held <Amount value={getCurrency(state, 'obsidian')} color="#a89ec0" />)
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Ember Array — the one board that wants your hands on it.
// ---------------------------------------------------------------------------

export function EmberPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [fuelPick, setFuelPick] = useState<string>('emberbillet');
  if (!state) return null;
  if (!arrayUnlocked(state as GameState)) {
    return <div className="panel p-4 text-center text-xs italic text-cave-400">A furnace grate the size of a room, cold since the first delvers. It answers to Cinder Mastery 3.</div>;
  }
  const e = state.ember;
  const inBand = e.temp >= BAND_LOW && e.temp <= BAND_HIGH;

  return (
    <div className="space-y-2">
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#e0955c]">Your record</span>
          <span className="tnum text-[10px] text-cave-400">
            best {Math.floor(e.bestSustainSec / 60)}m{Math.floor(e.bestSustainSec % 60)}s · rank {e.passiveRank}/20
          </span>
        </div>
        {/* Temperature and the band. */}
        <div className="relative mt-2 h-3 overflow-hidden rounded-full border border-cave-700 bg-cave-950">
          <div className="absolute h-full bg-[#4a3020]" style={{ left: `${BAND_LOW}%`, width: `${BAND_HIGH - BAND_LOW}%` }} />
          <div className="h-full" style={{ width: `${Math.min(100, e.temp)}%`, background: inBand ? '#e0955c' : '#8a6248', opacity: 0.9 }} />
        </div>
        <div className="tnum mt-0.5 flex justify-between text-[9px] text-cave-400">
          <span>{e.temp.toFixed(0)}° {inBand ? `· IN BAND ${Math.floor(e.sustainSec)}s` : ''}</span>
          <span>band {BAND_LOW}-{BAND_HIGH}° · a record never cools</span>
        </div>
        {/* The anneal: in-band work becomes the Hollow's glass (Part B spine). */}
        <div className="tnum mt-1 text-[9px] text-cave-400">
          Anneal: {Math.floor((e.annealSec ?? 0) % ANNEAL_SEC)}/{ANNEAL_SEC}s in band →{' '}
          <span className="text-[#c8642e]">1 Emberglass</span> (held {materialCount(state as GameState, 'emberglass')}) — work done keeps; only a live fire anneals.
        </div>
        {/* The grate. */}
        <div className="mt-2 inline-block">
          {Array.from({ length: ARRAY_SIZE }, (_, r) => (
            <div key={r} className="flex gap-0.5" style={{ marginTop: r > 0 ? 2 : 0 }}>
              {Array.from({ length: ARRAY_SIZE }, (_, c) => {
                const cell = r * ARRAY_SIZE + c;
                const rowClosed = r >= openRows(state as GameState);
                const fuelId = e.grid[cell];
                const burning = (e.burn[cell] ?? 0) > 0;
                const fuel = fuelId ? FUEL_BY_ID.get(fuelId) : null;
                return (
                  <button
                    key={c}
                    className={`h-7 w-7 rounded-[3px] border text-[11px] leading-none ${
                      burning ? 'border-[#ff8a4a] bg-[#3a1c0e] text-[#ffb36a]'
                      : fuelId ? 'border-[#8a6248] bg-[#241a12] text-[#c9a86a]'
                      : rowClosed ? 'border-cave-800 bg-cave-950/60 text-cave-700'
                      : 'border-cave-700 bg-cave-950 text-cave-600'
                    }`}
                    title={burning ? `${fuel?.name} — ${Math.ceil(e.burn[cell]!)}s left`
                      : fuelId ? `${fuel?.name} (tap to light, long-press logic: place empties)`
                      : rowClosed ? 'No lens over this row — socket a Ground Lens to open it'
                      : 'Place the selected fuel'}
                    onClick={() => {
                      if (burning) return;
                      if (fuelId) dispatch({ type: 'lightCell', cell });
                      else dispatch({ type: 'placeFuel', cell, fuelId: fuelPick });
                    }}
                  >
                    {burning ? '🔥' : fuelId ? '▪' : rowClosed ? '×' : '·'}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {openRows(state as GameState) < ARRAY_SIZE && (
          <div className="mt-1.5">
            <InstallButton
              action={{ type: 'installSocket' }}
              label={`Socket row ${openRows(state as GameState) + 1} of ${ARRAY_SIZE}`}
              exportId="groundlens"
            />
            <div className="mt-1 text-[10px] leading-snug text-cave-500">
              Each Ground Lens — Glassmere's export — steadies one more row's draft. The Bench
              grinds them; Serra hauls them.
            </div>
          </div>
        )}
        {/* Fuel rack. */}
        <div className="mt-2 flex flex-wrap gap-1">
          {FUELS.map((f) => (
            <button
              key={f.id}
              className={`btn px-2 py-1 text-[10px] ${fuelPick === f.id ? 'btn-warm' : ''}`}
              title={`${f.flavor} · ${f.heatPerSec}°/s for ${f.burnSec}s · ${f.cost} ${f.costCurrency}`}
              onClick={() => setFuelPick(f.id)}
            >
              {f.name} <span className="tnum text-cave-400">×{e.fuelOwned[f.id] ?? 0}</span>
            </button>
          ))}
          <button className="btn px-2 py-1 text-[10px]" onClick={() => dispatch({ type: 'buyFuel', fuelId: fuelPick, count: 4 })}>
            buy 4
          </button>
        </div>
        {/* The two couplings, side by side, because they are opposites: one
            pushes the furnace into the shaft, the other pulls the shaft into
            the furnace. Setting either one clears the other. */}
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button
            className={`btn py-1.5 text-[11px] ${e.overdrive ? 'btn-warm' : ''}`}
            title="Feed the furnace into the shaft: +50% burn heat, +0.8 shaft heat/s, and the governor comes OFF while it runs. It shuts itself down at the klaxon."
            onClick={() => dispatch({ type: 'setOverdrive', on: !e.overdrive })}
          >
            {e.overdrive ? 'OVERDRIVE — running' : 'Overdrive'}
            <span className="block text-[9px] font-normal opacity-70">feeds shaft heat</span>
          </button>
          <button
            className={`btn py-1.5 text-[11px] ${e.draw ? 'btn-warm' : ''}`}
            title={`Run the pipe the other way: the shaft's held heat becomes furnace temperature at ${DRAW_RATE}/s, down to a floor of ${DRAW_FLOOR}. Costs nothing but standing here.`}
            onClick={() => dispatch({ type: 'setDraw', on: !e.draw })}
          >
            {e.draw ? 'THE DRAW — running' : 'The Draw'}
            <span className="block text-[9px] font-normal opacity-70">
              {e.draw && state.pressure.heat > DRAW_FLOOR
                ? `pulling ${DRAW_RATE}/s from the shaft`
                : 'burns shaft heat'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Magma Wells — the odds ARE the interface. One draw, no drama.
// ---------------------------------------------------------------------------

export function WellsPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  if (!wellsUnlocked(state as GameState)) {
    return <div className="panel p-4 text-center text-xs italic text-cave-400">Three ropes coiled by three holes in the floor. They answer to Cinder Mastery 6.</div>;
  }
  return (
    <div className="space-y-2">
      <div className="panel p-3 text-[10px] leading-snug text-cave-400">
        <span className="font-semibold uppercase tracking-widest text-[#e0955c]">The odds, as posted at the mouth</span>
        <div className="tnum mt-1 space-y-0.5">
          {WELL_ODDS.map((l) => (
            <div key={l.label} className="flex justify-between">
              <span>{(l.p * 100).toFixed(0)}%</span>
              <span className={l.mult === 0 ? 'text-cave-500' : 'text-[#ffb36a]'}>{l.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-1 italic">
          A tenth of your holdings at most, three ropes at once, results wait forever. A player who
          never touches a Well misses stories, not progress.
        </div>
        {/* B5: the pressure tap — the gallery's flow stirs the rope. */}
        <div className={`mt-1 ${wellTapLive(state as GameState) ? 'text-[#ffb36a]' : 'text-cave-500'}`}>
          THE TAP: a well fed while the gallery vents hot (heat 50+, a route laid) resolves 25%
          faster. {wellTapLive(state as GameState) ? 'It is flowing now.' : 'It is not flowing now.'}
        </div>
      </div>
      {WELLS.map((w) => {
        const active = state.wells.active.find((a) => a.wellId === w.id);
        const progress = wellProgress(state as GameState, w.id);
        const held = getCurrency(state, w.currencyId);
        const commit = held.mul(0.1).floor();
        return (
          <div key={w.id} className="panel p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold text-cave-200">{w.name}</span>
              <span className="tnum text-[9px] text-cave-400">{w.minutes}m · takes {w.currencyId}</span>
            </div>
            <div className="text-[10px] italic text-cave-400">{w.flavor}</div>
            {active ? (
              <div className="mt-1.5">
                <div className="h-2 overflow-hidden rounded-full border border-cave-700 bg-cave-950">
                  <div className="h-full bg-[#e0955c]/70" style={{ width: `${progress * 100}%` }} />
                </div>
                <button
                  className="btn btn-warm mt-1.5 w-full py-1.5 text-xs"
                  disabled={progress < 1}
                  onClick={() => dispatch({ type: 'collectWell', wellId: w.id })}
                >
                  {progress < 1 ? `${fmt(active.amount)} committed — the well does not hurry` : 'Haul the rope up'}
                </button>
              </div>
            ) : (
              <button
                className="btn mt-1.5 w-full py-1.5 text-xs"
                disabled={commit.lt(w.minCommit)}
                onClick={() => dispatch({ type: 'commitWell', wellId: w.id, amount: commit.toNumber() })}
              >
                Commit a tenth ({fmt(commit)})
              </button>
            )}
          </div>
        );
      })}
      <div className="tnum px-1 text-center text-[9px] text-cave-500">
        lifetime: {state.wells.rolls} draws · {state.wells.wins} paid · {state.wells.losses} kept by the well
      </div>
    </div>
  );
}
