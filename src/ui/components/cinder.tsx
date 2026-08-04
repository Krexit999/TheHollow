/**
 * CINDER UI — what survived A.72's craft-system cut.
 *
 * The Ember Array and the Magma Wells were Cinder's two craft rooms; both are
 * gone. The Pressure card, the OVERPRESSURE/flood states and the Vent Network
 * — Cinder's actual signature mechanic — survive untouched.
 */
import { useEffect, useRef, useState } from 'react';
import { getCurrency } from '../../engine';
import type { GameState } from '../../engine';
import {
  MAX_PIPES, OVERPRESSURE_SEC, VENT_OUTLETS, VENT_SHAFT_CELL,
  VENT_W, VENT_H, heatCeiling, holdLine, networkCapacity, nextPipeCost, ventRate, yieldMult,
} from '../../engine/systems/pressure';
import {
  TIER_CAPABILITY_BOILER, boilerFound, boilerRead, boilerStation, nextBoilerTierCost,
} from '../../engine/systems/boiler';
import {
  TIER_CAPABILITY_VENTS, answersTheKlaxon, choosesTheLine, nextVentTierCost, ventArrayFound,
  ventRead, ventStation,
} from '../../engine/systems/vents';
import { HOLD_LINE_BASE } from '../../engine/systems/pressure';
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
  return (
    <div className="pointer-events-auto absolute inset-x-0 top-10 z-30 mx-auto w-full max-w-md px-3">
      <div className="rounded-lg border-2 border-[#ff4a2a] bg-[#1a0b07]/95 p-3 text-center shadow-2xl">
        <div className="text-sm font-bold tracking-widest text-[#ff6a4a]">OVERPRESSURE</div>
        <div className="tnum mt-0.5 text-2xl font-bold text-[#ffb36a]">{Math.ceil(left)}s</div>
        <div className="mt-1 text-[11px] leading-snug text-[#e8b8a0]">
          The shaft floods when this reaches zero — the run, not your things.
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
        </div>
      </div>
    </div>
  );
}

export function FloodModal() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);
  const [flood, setFlood] = useState<{ depth: number } | null>(null);
  const lastSeq = useRef(-1);
  useEffect(() => {
    if (!state) return;
    for (const entry of state.feed) {
      if (entry.seq <= lastSeq.current) continue;
      lastSeq.current = entry.seq;
      const ev = entry.event;
      if (ev.type === 'flood') setFlood({ depth: ev.depth });
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
// The Vent Network — plumbing as a hobby, headroom as the payoff.
// ---------------------------------------------------------------------------

/**
 * THE BOILER — Cinder's PLANT (§3.2, §13). It draws nothing and powers
 * everything: without it the shell has no Flow at all, which is what §13 means
 * by "blocks ALL Cinder power".
 */
export function BoilerCard() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;
  const found = boilerFound(st);
  const r = boilerRead(st);
  if (!found && !r.built) return null;
  const cost = nextBoilerTierCost(st);
  const rack = st.casting?.rack?.length ?? 0;

  return (
    <div className="panel mt-2 p-3" data-testid="boiler-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#ff8a5a]">The Boiler</span>
        <span className="tnum text-[10px] text-cave-400">{r.built ? `tier ${r.tier}` : 'in the wreck'}</span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        {r.built
          ? 'It runs on the shaft. Everything the plant does down here comes out of this.'
          : `Cold iron the size of a room${boilerStation() ? `, at ${boilerStation()!.name}` : ''}. Nothing else here makes power.`}
      </p>
      <div className="mt-2 space-y-0.5">
        {TIER_CAPABILITY_BOILER.slice(1).map((line, i) => (
          <div
            key={i}
            className="text-[10px] leading-snug"
            style={{ color: r.tier >= i + 1 ? '#9ac07a' : '#6c6459' }}
            data-testid={`boiler-tier-${i + 1}`}
          >
            <span className="tnum mr-1">{['I', 'II', 'III'][i]}</span>{line}
          </div>
        ))}
      </div>
      {cost !== null && (
        <button
          className="btn mt-2 w-full py-1.5 text-xs"
          disabled={!found || rack < cost}
          onClick={() => dispatch({ type: 'buildBoiler' })}
          data-testid="boiler-build"
        >
          {r.tier === 0 ? 'Light it' : `Deepen the Boiler — tier ${r.tier + 1}`} · {cost} cast parts ({rack} on the rack)
        </button>
      )}
      {r.built && (
        <div className="tnum mt-2 border-t border-cave-800 pt-2 text-[10px] text-cave-400">
          heat {r.heat.toFixed(0)}° · line {r.line.toFixed(0)}° · risking {r.risked.toFixed(0)}°
          <div className="mt-0.5" style={{ color: '#e0955c' }}>
            Flow {r.flow.toFixed(2)}/s · Surge bank +{r.surge.toFixed(1)}
          </div>
        </div>
      )}
    </div>
  );
}

export function VentsPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [valveMode, setValveMode] = useState(false);
  if (!state) return null;
  if (state.shell.current !== 'cinder' && !state.shell.signatures.includes('pressure')) {
    return <div className="panel p-4 text-center text-xs italic text-cave-400">The gallery above the shaft is bare rock, for now.</div>;
  }
  const cap = networkCapacity(state as GameState);
  const pipes = state.pressure.pipes.filter((x) => x > 0).length;
  const cost = nextPipeCost(state as GameState);
  const vr = ventRead(state as GameState);
  const arrayFound = ventArrayFound(state as GameState);
  const arrayCost = nextVentTierCost(state as GameState);
  const rack = state.casting?.rack?.length ?? 0;

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
        <div className="mt-2 inline-block">
          {Array.from({ length: VENT_H }, (_, r) => (
            <div key={r} className="flex gap-0.5" style={{ marginTop: r > 0 ? 2 : 0 }}>
              {Array.from({ length: VENT_W }, (_, c) => {
                const cell = r * VENT_W + c;
                const laid = state.pressure.pipes[cell] === 1;
                const shaft = cell === VENT_SHAFT_CELL;
                const outlet = VENT_OUTLETS.includes(cell);
                const valve = vr.valves.includes(cell);
                return (
                  <button
                    key={c}
                    className={`h-8 w-8 rounded-[3px] border text-[13px] leading-none ${
                      valve ? 'border-[#9fc4dd] bg-[#16242e] text-[#bcd8ee]'
                      : laid ? 'border-[#e0955c] bg-[#3a2418] text-[#ffb36a]'
                      : shaft ? 'border-[#ff6a4a] bg-[#2a120a] text-[#ff8a5a]'
                      : outlet ? 'border-cave-500 bg-cave-900 text-cave-300'
                      : 'border-cave-700 bg-cave-950 text-cave-600'
                    }`}
                    title={valve ? 'A cast valve — it vents where it stands. Tap to pull it (free)'
                      : shaft ? 'The shaft mouth — heat starts here'
                      : outlet ? 'An outlet — reach it with pipe'
                      : laid ? 'Tap to pull the pipe (free)'
                      : valveMode ? 'Set a cast valve here' : `Lay pipe · ${cost} Obsidian`}
                    onClick={() => dispatch(valveMode || valve ? { type: 'setValve', cell } : { type: 'layPipe', cell })}
                  >
                    {valve ? '◈' : shaft ? '▣' : outlet ? '◍' : laid ? '━' : '·'}
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

      {/* THE VENT ARRAY (§13) — cast valves, the line, and the klaxon. */}
      {(arrayFound || vr.built) && (
        <div className="panel p-3" data-testid="vent-array-panel">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#bcd8ee]">The Vent Array</span>
            <span className="tnum text-[10px] text-cave-400">{vr.built ? `tier ${vr.tier}` : 'in the wreck'}</span>
          </div>
          <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
            {vr.built
              ? 'Cast brass on the gallery wall, and every one of them breathes on its own.'
              : `Valves, still crated${ventStation() ? `, at ${ventStation()!.name}` : ''}.`}
          </p>
          <div className="mt-2 space-y-0.5">
            {TIER_CAPABILITY_VENTS.slice(1).map((line, i) => (
              <div
                key={i}
                className="text-[10px] leading-snug"
                style={{ color: vr.tier >= i + 1 ? '#9ac07a' : '#6c6459' }}
                data-testid={`vents-tier-${i + 1}`}
              >
                <span className="tnum mr-1">{['I', 'II', 'III'][i]}</span>{line}
              </div>
            ))}
          </div>
          {arrayCost !== null && (
            <button
              className="btn mt-2 w-full py-1.5 text-xs"
              disabled={!arrayFound || rack < arrayCost}
              onClick={() => dispatch({ type: 'buildVentArray' })}
              data-testid="vents-build"
            >
              {vr.tier === 0 ? 'Stand it up' : `Deepen the Array — tier ${vr.tier + 1}`} · {arrayCost} cast parts ({rack} on the rack)
            </button>
          )}
          {vr.built && (
            <>
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-cave-800 pt-2">
                <span className="tnum text-[10px] text-cave-400">
                  valves {vr.valves.length}/{vr.slots} · +{vr.valveVent.toFixed(2)}°/s
                </span>
                <button
                  className={`btn px-2 py-1 text-[10px] ${valveMode ? 'btn-warm' : ''}`}
                  onClick={() => setValveMode((v) => !v)}
                  data-testid="valve-mode"
                >
                  {valveMode ? 'Setting valves' : 'Set a valve'}
                </button>
              </div>
              {choosesTheLine(state as GameState) && (
                <div className="mt-2" data-testid="hold-line">
                  <div className="tnum flex items-baseline justify-between text-[10px] text-cave-400">
                    <span>Hold the shaft at</span>
                    <span style={{ color: '#bcd8ee' }}>
                      {(vr.asked ?? vr.ceiling).toFixed(0)}° {vr.asked === null ? '(as the plumbing falls)' : ''}
                    </span>
                  </div>
                  <input
                    type="range"
                    className="mt-1 w-full"
                    min={HOLD_LINE_BASE}
                    max={Math.round(vr.ceiling)}
                    value={Math.round(vr.asked ?? vr.ceiling)}
                    aria-label="Hold line"
                    onChange={(e) => dispatch({ type: 'setHoldLine', line: Number(e.target.value) })}
                  />
                  <button
                    className="btn mt-1 w-full py-1 text-[10px]"
                    onClick={() => dispatch({ type: 'setHoldLine', line: null })}
                  >
                    Let it find its own line
                  </button>
                </div>
              )}
              {answersTheKlaxon(state as GameState) && (
                <div className="mt-2 text-[10px] leading-snug" style={{ color: vr.answered ? '#8a7f70' : '#9ac07a' }}>
                  {vr.answered
                    ? 'The array has already thrown itself open once this run.'
                    : 'It will throw itself open at the klaxon, once, whether or not you are here.'}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
