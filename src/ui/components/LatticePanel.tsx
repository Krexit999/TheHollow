import { useEffect, useRef, useState } from 'react';
import { allUpgrades, fmt, getCurrency, type MotifShape } from '../../engine';
import { hexKey, cellCount } from '../../engine/systems/lattice/hex';
import {
  currentHint,
  latticeGhost,
  latticeSystem,
  maxMotifRank,
  placementCost,
  REMOVE_REFUND,
  ringCost,
  upgradeCost,
  MAX_RINGS,
  PASSIVE_RANK_CAP,
} from '../../engine/content/shell1/latticeSystem';
import { skillRank } from '../../engine/content/shell1/skillTree';
import { LatticeView } from '../lattice/LatticeView';
import { dispatch, useGame } from '../store';
import { Amount } from './shared';
import { UpgradeRow } from './UpgradeRow';

const SHAPE_META: { shape: MotifShape; glyph: string; hint: string }[] = [
  { shape: 'circle', glyph: '●', hint: 'Circle — wells and springs' },
  { shape: 'square', glyph: '■', hint: 'Square — masonry and industry' },
  { shape: 'triangle', glyph: '▲', hint: 'Triangle — wedges and extraction' },
  { shape: 'hex', glyph: '⬢', hint: 'Hex — seals and deeper things' },
];

export function LatticePanel() {
  const state = useGame((s) => s.state);
  const engine = useGame((s) => s.engine);
  const reducedMotion = useGame((s) => s.reducedMotion);
  useGame((s) => s.rev);

  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<LatticeView | null>(null);
  const [brush, setBrush] = useState<{ shape: MotifShape; rank: number }>({ shape: 'triangle', rank: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [ghostMode, setGhostMode] = useState(false);
  const [layoutName, setLayoutName] = useState('');

  const brushRef = useRef(brush);
  brushRef.current = brush;
  // Ghost mode: tap an empty socket to preview it instead of placing at once.
  const ghostRef = useRef(ghostMode);
  ghostRef.current = ghostMode;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !engine) return;
    let cancelled = false;
    let view: LatticeView | null = null;
    void LatticeView.create(host, engine, reducedMotion, {
      brush: brushRef.current,
      selected: null,
      patternGhost: 0,
      onTap: (q, r) => {
        const s = engine.getState();
        const key = hexKey(q, r);
        if (s.lattice.cells[key]) {
          setSelected((cur) => (cur === key ? null : key));
        } else if (ghostRef.current) {
          // Preview the empty socket rather than committing to it.
          setSelected((cur) => (cur === key ? null : key));
        } else {
          setSelected(null);
          dispatch({ type: 'placeMotif', q, r, shape: brushRef.current.shape, rank: brushRef.current.rank });
        }
      },
    }).then((v) => {
      if (cancelled) v.destroy();
      else viewRef.current = view = v;
    });
    return () => {
      cancelled = true;
      view?.destroy();
      viewRef.current = null;
    };
  }, [engine, reducedMotion]);

  useEffect(() => {
    const view = viewRef.current;
    if (view && state) {
      view.props.brush = brush;
      view.props.selected = selected;
      view.props.patternGhost = skillRank(state, 'patternGhost');
    }
  });

  if (!state || !engine) return null;
  const lat = state.lattice;
  if (!lat.unlocked) return null;

  const motifs = getCurrency(state, 'motif');
  const maxRank = maxMotifRank(state);
  const sel = selected ? lat.cells[selected] : undefined;
  const hint = currentHint(state);
  const codex = latticeSystem.codex(state);
  const chordEntries = codex.filter((e) => e.kind === 'chord');
  const progEntries = codex.filter((e) => e.kind === 'progression');
  const chiselsDef = allUpgrades().find((u) => u.id === 'chisels')!;
  const nextRingCost = lat.rings < MAX_RINGS ? ringCost(lat.rings) : null;
  const ringLocked = lat.rings === MAX_RINGS - 1 && !lat.doors.ring4;

  return (
    <div className="space-y-2">
      {/* The board */}
      <div
        ref={hostRef}
        className="h-[300px] w-full overflow-hidden rounded-xl border border-[#2b3a32] bg-[#0c100e] sm:h-[340px]"
        aria-label="The Lattice — tap an empty socket to place the selected motif"
      />

      {/* Brush + balance */}
      <div className="panel space-y-2 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-cave-400">
            Motifs: <Amount value={motifs} color="#9fd8c0" className="text-sm" />
          </span>
          <span className="text-cave-400">
            Passive Rank{' '}
            <span className="tnum text-[#9fd8c0]">
              {lat.passiveRank}
              <span className="opacity-60">/{PASSIVE_RANK_CAP}</span>
            </span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {SHAPE_META.map((m) => (
            <button
              key={m.shape}
              title={m.hint}
              onClick={() => setBrush((b) => ({ ...b, shape: m.shape }))}
              className={`h-9 w-9 rounded-md border text-lg leading-none transition-colors ${
                brush.shape === m.shape
                  ? 'border-[#9fd8c0] bg-[#16211c] text-[#cfc9b4]'
                  : 'border-cave-700 text-cave-400 hover:text-cave-200'
              }`}
            >
              {m.glyph}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1">
            <button
              className="btn btn-cell h-7 w-7 p-0 text-sm leading-none"
              disabled={brush.rank <= 1}
              onClick={() => setBrush((b) => ({ ...b, rank: Math.max(1, b.rank - 1) }))}
            >
              −
            </button>
            <span className="tnum w-14 text-center text-xs text-cave-300">
              Rank {brush.rank}
              <span className="block text-[9px] text-cave-400">{fmt(placementCost(brush.rank))} Motifs</span>
            </span>
            <button
              className="btn btn-cell h-7 w-7 p-0 text-sm leading-none"
              disabled={brush.rank >= maxRank}
              onClick={() => setBrush((b) => ({ ...b, rank: Math.min(maxRank, b.rank + 1) }))}
            >
              +
            </button>
          </div>
        </div>
        {Object.keys(lat.cells).length === 0 && (
          <p className="text-[11px] italic leading-snug text-cave-400">
            Worn sockets, carved long before you. The wear runs in straight lines — three sockets
            at a stride. Tap to set a stone; removing one returns {REMOVE_REFUND * 100}% of its cost.
          </p>
        )}
        <label className="flex cursor-pointer items-center justify-between text-[11px] text-cave-400">
          <span>Ghost mode — tap an empty socket to weigh it before you set it</span>
          <button
            role="switch"
            aria-checked={ghostMode}
            onClick={() => { setGhostMode((g) => !g); setSelected(null); }}
            className={`ml-2 h-5 w-9 shrink-0 rounded-full border transition-colors ${ghostMode ? 'border-[#9fd8c0] bg-[#16211c]' : 'border-cave-700 bg-cave-900'}`}
          >
            <span className={`block h-3.5 w-3.5 rounded-full transition-transform ${ghostMode ? 'translate-x-4 bg-[#9fd8c0]' : 'translate-x-0.5 bg-cave-500'}`} />
          </button>
        </label>
      </div>

      {/* Selected motif */}
      {sel && selected && (
        <div className="panel flex items-center gap-3 p-3">
          <span className="text-xl text-[#cfc9b4]">
            {SHAPE_META.find((m) => m.shape === sel.shape)?.glyph}
          </span>
          <div className="min-w-0 flex-1 text-xs">
            <div className="font-semibold capitalize text-cave-200">
              {sel.shape} · Rank {sel.rank}
            </div>
            <div className="text-[10px] text-cave-400">Placed {sel.seq + 1}ᵗʰ — order matters, later.</div>
          </div>
          {sel.rank < maxRank && (
            <button
              className="btn px-2 py-1 text-[11px]"
              disabled={motifs.lt(upgradeCost(sel.rank, sel.rank + 1))}
              onClick={() => dispatch({ type: 'upgradeMotif', ...keyToQR(selected) })}
            >
              Rank up · {fmt(upgradeCost(sel.rank, sel.rank + 1))}
            </button>
          )}
          <button
            className="btn px-2 py-1 text-[11px]"
            onClick={() => {
              dispatch({ type: 'removeMotif', ...keyToQR(selected) });
              setSelected(null);
            }}
          >
            Remove · +{fmt(placementCost(sel.rank).mul(REMOVE_REFUND))}
          </button>
        </div>
      )}

      {/* Ghost preview — geometry and arithmetic only. What it would touch, and
          the rank total of each run through it. It never names a chord: an
          undiscovered one stays as silent here as it is on the board (pillar 5). */}
      {selected && !sel && ghostMode && (() => {
        const { q, r } = keyToQR(selected);
        const ghost = latticeGhost(state, q, r, brush.rank);
        const cost = placementCost(brush.rank);
        const canPlace = motifs.gte(cost);
        return (
          <div className="panel space-y-1.5 border-[#3a4a40] p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold text-[#9fd8c0]">Weighing this socket</span>
              <span className="text-[10px] capitalize text-cave-400">{brush.shape} · Rank {brush.rank}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-cave-300">
              <span>Touches <span className="tnum font-semibold text-cave-200">{ghost.adjacency}</span> stone{ghost.adjacency === 1 ? '' : 's'}</span>
              <span>
                Runs through it:{' '}
                <span className="tnum font-semibold text-cave-200">{ghost.lines.map((n) => n).join(' · ')}</span>
              </span>
            </div>
            <div className="text-[10px] italic leading-snug text-cave-500">
              Each number is the rank total of an unbroken line through this socket, this stone included.
            </div>
            <div className="flex gap-1.5">
              <button
                className={`btn flex-1 py-1.5 text-[11px] ${canPlace ? 'btn-warm' : ''}`}
                disabled={!canPlace}
                onClick={() => {
                  dispatch({ type: 'placeMotif', q, r, shape: brush.shape, rank: brush.rank });
                  setSelected(null);
                }}
              >
                Set it here · {fmt(cost)} Motifs
              </button>
              <button className="btn px-2 py-1.5 text-[11px]" onClick={() => setSelected(null)}>
                Not yet
              </button>
            </div>
          </div>
        );
      })()}

      {/* Expansion + the Press */}
      <div className="panel space-y-2 p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-cave-400">
            Board: <span className="tnum text-cave-200">{cellCount(lat.rings)}</span> sockets
            <span className="opacity-60"> / {cellCount(MAX_RINGS)}</span>
          </div>
          {nextRingCost && (
            <button
              className="btn px-2.5 py-1 text-xs"
              disabled={ringLocked || getCurrency(state, 'brick').lt(nextRingCost)}
              title={ringLocked ? 'The outer ring does not answer. Something must be set first.' : undefined}
              onClick={() => dispatch({ type: 'buyLatticeRing' })}
            >
              {ringLocked ? 'Sealed' : <>Widen · <Amount value={nextRingCost} color="#c96f4a" /> Brick</>}
            </button>
          )}
        </div>
        {lat.doors.press && (
          <button
            className={`btn w-full py-1.5 text-xs ${lat.pressOn ? '' : 'btn-warm'}`}
            onClick={() => dispatch({ type: 'setLatticePress', on: !lat.pressOn })}
          >
            {lat.pressOn ? 'The Press: running (Brick → Motifs) — halt it' : 'Start the Press (Brick → Motifs)'}
          </button>
        )}
        <UpgradeRow def={chiselsDef} />
      </div>

      {/* Saved layouts — remember an arrangement, restore it into empty sockets
          (each placement pays the ordinary Motif cost through the usual path). */}
      <div className="panel space-y-2 p-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-cave-300">Saved layouts</div>
        <div className="flex items-center gap-1.5">
          <input
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value)}
            placeholder="Name this board…"
            maxLength={28}
            className="min-w-0 flex-1 rounded border border-cave-700 bg-cave-950 px-2 py-1 text-[11px] text-cave-200 placeholder:text-cave-600"
          />
          <button
            className="btn px-2 py-1 text-[11px]"
            disabled={Object.keys(lat.cells).length === 0}
            title={Object.keys(lat.cells).length === 0 ? 'The board is empty' : 'Remember this arrangement'}
            onClick={() => { dispatch({ type: 'saveLatticeLayout', name: layoutName }); setLayoutName(''); }}
          >
            Save
          </button>
        </div>
        {state.qol.latticeLayouts.length === 0 ? (
          <div className="text-[10px] italic text-cave-500">No saved boards yet.</div>
        ) : (
          <div className="space-y-1">
            {state.qol.latticeLayouts.map((l) => (
              <div key={l.id} className="flex items-center gap-1.5 rounded border border-cave-800 px-2 py-1">
                <div className="min-w-0 flex-1">
                  <span className="truncate text-[11px] font-semibold text-cave-200">{l.name}</span>
                  <span className="tnum ml-1.5 text-[9px] text-cave-500">{l.motifs.length} stones</span>
                </div>
                <button
                  className="btn px-2 py-0.5 text-[10px]"
                  title="Place this layout into empty sockets, paying the usual cost"
                  onClick={() => dispatch({ type: 'restoreLatticeLayout', id: l.id })}
                >
                  Restore
                </button>
                <button
                  className="shrink-0 px-1 text-cave-600 hover:text-red-400"
                  aria-label={`Delete ${l.name}`}
                  onClick={() => dispatch({ type: 'deleteLatticeLayout', id: l.id })}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hints */}
      {hint && (
        <div className="panel border-[#3a4a40] p-3">
          <div className="text-[10px] uppercase tracking-widest text-[#9fd8c0]">Sable's marginalia</div>
          <div className="mt-1 text-xs italic leading-snug text-cave-300">“{hint}”</div>
        </div>
      )}

      {/* Codex — discovered only, always */}
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-cave-300">Codex</span>
          <span className="tnum text-[10px] text-cave-400">
            {chordEntries.length} chord{chordEntries.length === 1 ? '' : 's'}
            {lat.doors.progressions ? ` · ${progEntries.length} progressions` : ''}
          </span>
        </div>
        {codex.length === 0 && (
          <p className="mt-2 text-[11px] italic text-cave-400">
            Empty pages. Whatever this board can say, no one has heard it yet.
          </p>
        )}
        <div className="mt-2 space-y-2">
          {progEntries.map((e) => (
            <CodexRow key={e.id} entry={e} strong />
          ))}
          {chordEntries.map((e) => (
            <CodexRow
              key={e.id}
              entry={e}
              locked={state.qol.lockedChords.includes(e.id)}
              onToggleLock={e.active ? () => dispatch({ type: 'toggleChordLock', id: e.id }) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function keyToQR(key: string): { q: number; r: number } {
  const [q, r] = key.split(',').map(Number);
  return { q: q!, r: r! };
}

function CodexRow({
  entry, strong, locked, onToggleLock,
}: {
  entry: ReturnType<typeof latticeSystem.codex>[number];
  strong?: boolean;
  locked?: boolean;
  onToggleLock?: () => void;
}) {
  return (
    <div className={`border-l-2 pl-2 ${entry.active ? 'border-[#9fd8c0]' : 'border-cave-700'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-xs font-semibold ${strong ? 'text-[#e4d69c]' : 'text-cave-200'}`}>
          {entry.name}
        </span>
        <span className="flex items-center gap-2">
          {onToggleLock && (
            <button
              onClick={onToggleLock}
              aria-pressed={!!locked}
              title={locked ? 'Locked — its sockets are guarded from removal' : 'Lock this chord against a misclick'}
              className={`text-[11px] leading-none ${locked ? 'text-[#e4d69c]' : 'text-cave-600 hover:text-cave-300'}`}
            >
              {locked ? '🔒' : '🔓'}
            </button>
          )}
          <span className={`text-[9px] uppercase tracking-wider ${entry.active ? 'text-[#9fd8c0]' : 'text-cave-400/60'}`}>
            {entry.active ? 'sounding' : 'silent'}
          </span>
        </span>
      </div>
      <div className="text-[10px] italic leading-snug text-cave-400">{entry.flavor}</div>
      <div className="text-[10px] text-cave-300">{entry.effect}</div>
    </div>
  );
}
