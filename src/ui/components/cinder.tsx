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
