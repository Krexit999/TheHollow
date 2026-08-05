/**
 * Phase 10 UI (deliberately minimal — a dedicated interface pass follows).
 * The Hollow (Silence + Reconstruction), the Echo Chamber, the Rewrite (the
 * Core, Recursion, Axioms), and the Parallel View — all real data, no polish.
 */
import { FramePanel } from './frame';
import { fmt, getCurrency } from '../../engine';
import type { GameState } from '../../engine';
import { ModifierCache } from '../../engine/modifiers';
import { D } from '../../engine/decimal';
import {
  HOLLOW_FLOOR, faceWhole, rebuildCost, silenceRatePerMin, voidRate,
} from '../../engine/systems/absence';
import { axiomsFromEchoes, canRecurse } from '../../engine/systems/recursionSys';
import { materialCount } from '../../engine/systems/forge';
import { dispatch, useGame } from '../store';
import { Amount } from './shared';

const uiMods = new ModifierCache();

// ---------------------------------------------------------------------------
// The Hollow — the Silence, and Reconstruction.
// ---------------------------------------------------------------------------

export function HollowPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  if (state.shell.current !== 'hollow') {
    return <div className="panel p-4 text-center text-xs italic text-cave-400">There is no rock here to speak of. The Hollow opens after the fifth Breach.</div>;
  }
  uiMods.invalidate();
  const h = state.hollow;
  const rate = voidRate(state as GameState, uiMods);
  const cost = rebuildCost(state as GameState);
  const rebuilt = h.rebuilt.length;
  const total = state.face.cells.length;
  const whole = faceWhole(state as GameState);
  const nextCell = state.face.cells.findIndex((_, i) => !h.rebuilt.includes(i));
  const depthGate = 14 * rebuilt;

  return (
    <div className="space-y-2">
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-[#b8b0e0]">Drip</span>
          <span className="tnum text-[10px] text-cave-400">
            drip {rate.toFixed(1)} Void/s · Void <Amount value={getCurrency(state, 'void')} color="#8a86a8" />
          </span>
        </div>
        {/* The stack: mutes as it climbs, pays convexly when you listen. */}
        <div className="mt-2 h-3 overflow-hidden rounded-full border border-cave-700 bg-cave-950">
          <div className="h-full bg-[#6a6490]/80" style={{ width: `${h.silence}%` }} />
        </div>
        <div className="tnum mt-0.5 flex justify-between text-[9px] text-cave-400">
          <span>silence {h.silence.toFixed(0)}/100 (+{silenceRatePerMin(state as GameState).toFixed(1)}/min)</span>
          <span>mutes the drip · farms into Void</span>
        </div>
        <button
          className="btn btn-warm mt-2 w-full py-1.5 text-xs"
          disabled={h.silence < 1}
          onClick={() => dispatch({ type: 'listen' })}
        >
          Listen — harvest the quiet ({h.silence.toFixed(0)} stacks)
        </button>
        {/* The auto-listener: the idle floor. */}
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-cave-400">
          <span>Auto-listen at</span>
          {[0, 40, 60, 80].map((n) => (
            <button
              key={n}
              className={`btn px-1.5 py-0.5 text-[10px] ${h.listenAt === n ? 'btn-warm' : ''}`}
              onClick={() => dispatch({ type: 'setListenAt', stacks: n })}
            >
              {n === 0 ? 'off' : n}
            </button>
          ))}
        </div>
      </div>

      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#b8b0e0]">Reconstruction</span>
          <span className="tnum text-[10px] text-cave-400">{rebuilt}/{total} cells · depth {state.depth}/{HOLLOW_FLOOR}</span>
        </div>
        <div className="mt-1 text-[10px] leading-snug text-cave-400">
          Buy back the face one phantom cell at a time. Each is a REAL cell — real
          regen, real ceiling — and the carried signatures get their medium back. A
          whole face opens the way down to the Core.
        </div>
        {whole ? (
          <div className="mt-2 rounded-md border border-[#8a82b0]/60 p-2 text-center text-[11px] text-[#c8bfe8]">
            The face is whole. The world is remembered. The stair to the Core is open.
          </div>
        ) : (
          <>
            <button
              className="btn btn-warm mt-2 w-full py-1.5 text-xs"
              disabled={nextCell < 0 || state.depth < depthGate || getCurrency(state, 'void').lt(cost)
                || (rebuilt >= 8 && materialCount(state as GameState, 'emberglass') < 1)}
              onClick={() => nextCell >= 0 && dispatch({ type: 'rebuildCell', cell: nextCell })}
            >
              {state.depth < depthGate
                ? `The ${rebuilt + 1}th cell wants depth ${depthGate}`
                : `Remember one cell — ${fmt(cost)} Void${rebuilt >= 8 ? ` + 1 Emberglass (${materialCount(state as GameState, 'emberglass')})` : ''}`}
            </button>
            {rebuilt >= 8 && (
              <div className="mt-1 text-[10px] leading-snug text-cave-500">
                Cells past the eighth are rebuilt IN Emberglass — Cinder's export, annealed by
                holding the Ember Array in the band. Serra bottles the haul if the fire is far.
              </div>
            )}
          </>
        )}
      </div>
      {/* §13's RECONSTRUCTION FRAME — what the next cell comes back AS. */}
      <FramePanel />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Rewrite — the Core, Recursion, and Axioms.
// ---------------------------------------------------------------------------

export function RewritePanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const atCore = state.shell.current === 'aleph';
  const nextAxioms = axiomsFromEchoes((state.totals['echo'] ?? D(0)).toNumber());
  const pending = Math.max(0, nextAxioms - state.recursion.axiomsEarned);

  return (
    <div className="space-y-2">
      {atCore && (
        <div className="panel border-[#8a7838] p-3">
          <div className="text-sm font-semibold text-[#e8d88c]">The Core</div>
          {!state.aleph.coreTouched ? (
            <>
              <div className="mt-1 text-[10px] leading-snug text-cave-300">
                A desk, a chair, a pen. Reach depth 40 and touch the Core.
              </div>
              <button
                className="btn btn-warm mt-2 w-full py-1.5 text-sm"
                disabled={state.depth < 40}
                onClick={() => dispatch({ type: 'touchCore' })}
              >
                {state.depth < 40 ? `Descend to the Core (depth ${state.depth}/40)` : 'Touch the Core'}
              </button>
            </>
          ) : (
            <>
              <div className="mt-1 text-[10px] leading-snug text-cave-300">
                The world will reset — shells, Echoes, materials, all of it. You keep your records,
                your Codex, your name, and your tools (blunted to heirlooms). And you keep{' '}
                <span className="text-[#e8d88c]">{pending} Axiom{pending === 1 ? '' : 's'}</span> banked for whatever writes on them next.
              </div>
              <button
                className="btn btn-warm mt-2 w-full py-2 text-sm"
                disabled={!canRecurse(state as GameState)}
                onClick={() => dispatch({ type: 'recurse' })}
              >
                Begin again, knowing — RECURSION {state.recursion.count + 1}
              </button>
            </>
          )}
        </div>
      )}

      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#e8d88c]">Recursion</span>
          <span className="tnum text-[10px] text-cave-400">
            recursions {state.recursion.count} · axioms earned {state.recursion.axiomsEarned}
          </span>
        </div>
        <div className="mt-1 text-[10px] italic leading-snug text-cave-400">
          Writing a law with them is gone with axioms.ts (A.7x) — the count still banks.
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Parallel View — everything you built, running at once. Structural: all
// real numbers (every system ticks globally), the beauty pass comes later.
// ---------------------------------------------------------------------------

interface ShellCard {
  id: string; name: string; chip: string; color: string; floor: number;
  /** Signature-tinted backdrop for the miniature — each shell its own weather. */
  bg: string;
  sig: 'seepage' | 'polarity' | 'growth' | 'refraction' | 'pressure' | 'absence' | 'core';
}

const SHELL_CARDS: ShellCard[] = [
  { id: 'loam', name: 'Loam', chip: 'dust', color: '#e0a860', floor: 150, sig: 'seepage', bg: 'radial-gradient(ellipse at 50% 120%, #4a3a24 0%, #1c1712 70%)' },
  { id: 'ferrite', name: 'Ferrite', chip: 'ingot', color: '#8fb8d8', floor: 250, sig: 'polarity', bg: 'radial-gradient(ellipse at 50% 120%, #2c3a48 0%, #12161c 70%)' },
  { id: 'verdance', name: 'Verdance', chip: 'spore', color: '#9fd070', floor: 290, sig: 'growth', bg: 'radial-gradient(ellipse at 50% 120%, #2a4020 0%, #10160c 70%)' },
  { id: 'glassmere', name: 'Glassmere', chip: 'prism', color: '#bcd8ee', floor: 380, sig: 'refraction', bg: 'radial-gradient(ellipse at 50% 120%, #2c3a4a 0%, #0c1016 70%)' },
  { id: 'cinder', name: 'Cinder', chip: 'slag', color: '#e8804c', floor: 470, sig: 'pressure', bg: 'radial-gradient(ellipse at 50% 130%, #5a2814 0%, #140b08 68%)' },
  { id: 'hollow', name: 'Hollow', chip: 'void', color: '#a89ed0', floor: 560, sig: 'absence', bg: 'radial-gradient(ellipse at 50% 50%, #16121e 0%, #080609 75%)' },
  { id: 'aleph', name: 'Aleph', chip: 'fragment', color: '#f0e6a8', floor: 40, sig: 'core', bg: 'radial-gradient(ellipse at 50% 100%, #4a3c1a 0%, #12100a 72%)' },
];

/** A tiny, static-friendly signature motif drawn over each miniature. Reduced
 * motion loses only the slow drift; every shell still reads by its own mark. */
function SignatureMark({ sig, color, reduced }: { sig: ShellCard['sig']; color: string; reduced: boolean }) {
  const anim = reduced ? '' : '';
  switch (sig) {
    case 'seepage': // warm cells, a soft leak of light rising
      return <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 90%, ${color}22, transparent 55%)` }} />;
    case 'polarity': // a chain across the middle, ± marks
      return (
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden>
          <line x1="12" y1="30" x2="88" y2="30" stroke={color} strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />
          {[20, 40, 60, 80].map((x, i) => <text key={x} x={x} y="33" fontSize="7" fill={color} opacity="0.7" textAnchor="middle">{i % 2 ? '−' : '+'}</text>)}
        </svg>
      );
    case 'growth': // vine dots creeping up
      return (
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 60" aria-hidden>
          {[[20, 48], [30, 40], [42, 46], [58, 38], [70, 44], [80, 36]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={2.2} fill={color} opacity={0.6} className={anim} />
          ))}
        </svg>
      );
    case 'refraction': // a bent beam
      return (
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 60" aria-hidden>
          <polyline points="0,22 50,22 50,42 100,42" fill="none" stroke={color} strokeWidth="1.4" opacity="0.75" />
          <circle cx="50" cy="22" r="2" fill={color} />
        </svg>
      );
    case 'pressure': // heat rising from the floor
      return <div className="absolute inset-x-0 bottom-0 h-2/3" style={{ background: `linear-gradient(0deg, ${color}44, transparent)` }} />;
    case 'absence': // faint motes in the void
      return (
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 60" aria-hidden>
          {[[18, 20], [40, 34], [64, 18], [78, 40], [30, 48], [88, 28]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={1.1} fill={color} opacity={0.55} />
          ))}
        </svg>
      );
    case 'core': // a warm point, the Core
      return <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 78%, ${color}55, transparent 40%)` }} />;
  }
}

export function ParallelView() {
  const state = useGame((s) => s.state);
  const reduced = useGame((s) => s.reducedMotion);
  useGame((s) => s.rev);
  if (!state) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {SHELL_CARDS.map((c) => {
          const rec = state.depthRecords[c.id] ?? 0;
          const reached = rec > 0 || state.shell.current === c.id;
          const held = getCurrency(state, c.chip);
          const here = state.shell.current === c.id;
          return (
            <div
              key={c.id}
              className={`relative overflow-hidden rounded-xl border p-2.5 ${here ? 'border-lamp-500/50' : 'border-cave-700'}`}
              style={{ background: c.bg, opacity: reached ? 1 : 0.4 }}
            >
              {reached && <SignatureMark sig={c.sig} color={c.color} reduced={reduced} />}
              <div className="relative">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-semibold" style={{ color: c.color }}>{c.name}</span>
                  {here && <span className="rounded bg-lamp-500/20 px-1 text-[8px] font-bold uppercase tracking-wider text-lamp-300">here</span>}
                </div>
                <div className="mt-8 flex items-end justify-between">
                  <span className="tnum text-[10px] text-cave-300">d{rec}<span className="text-cave-500">/{c.floor}</span></span>
                  {reached && <Amount value={held} color={c.color} className="text-[10px]" />}
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/40">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (rec / c.floor) * 100)}%`, background: c.color, opacity: 0.7 }} />
                </div>
                <div className="mt-1 text-[8px] uppercase tracking-wider" style={{ color: reached ? c.color : '#6a6258' }}>
                  {reached ? 'delved' : 'unreached'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {(state.recursion?.count ?? 0) > 0 && (
        <div className="text-center text-[10px] italic text-cave-500">
          Recursion {state.recursion.count}. You have started over knowing what is down there —
          and the pen, Sable says, is offered to whoever finishes the reading.
        </div>
      )}
    </div>
  );
}
