import { useState } from 'react';
import { allShells, fmt, getCurrency, masteryLevel, nextGate } from '../../engine';
import { D } from '../../engine/decimal';
import { FALLS, fallShape, collapsePreview, collapseRetained } from '../../engine/systems/collapseSys';
import type { CollapseType } from '../../engine/types';
import {
  CORE_NODES,
  coreNodeCost,
  coreNodeLevel,
} from '../../engine/content/shell1/coreTree';
import {
  SKILL_NODES,
  skillRank,
  skillNodeUnlocked,
  type SkillBranch,
} from '../../engine/content/shell1/skillTree';
import { dispatch, useGame } from '../store';
import { Amount, HoldButton } from './shared';
import { BreachCard } from './ferrite';
import { WardenChallenge } from './combat';
import { CollapseControls } from './qol';

// ---------------------------------------------------------------------------
// Collapse + Core tree
// ---------------------------------------------------------------------------

/** mm:ss for a run length — runs are minutes, so hours never appear. */
function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** A signed delta against the last run, coloured by direction. Neutral when
 *  there is nothing to compare against — the first fall has no "vs last". */
function Delta({ now, was, unit = '', lowerIsBetter = false }: {
  now: number; was: number | null; unit?: string; lowerIsBetter?: boolean;
}) {
  if (was === null || was === 0) return null;
  const d = now - was;
  if (d === 0) return <span className="text-cave-500"> · same</span>;
  const good = lowerIsBetter ? d < 0 : d > 0;
  return (
    <span className={good ? ' text-emerald-400/80' : ' text-amber-400/80'}>
      {' '}{d > 0 ? '+' : ''}{fmt(D(d))}{unit}
    </span>
  );
}

export function CollapsePanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [fall, setFall] = useState<CollapseType>('clean');
  if (!state) return null;

  const gain = collapsePreview(state);
  const cores = getCurrency(state, 'core');
  const canCollapse = gain.gte(1);
  const last = state.collapse.lastRun;
  const runSec = Math.max(0, Math.floor(state.stats.playTimeSec - state.collapse.runStartAt));
  const peak = Math.max(state.depth, state.shaft?.reached ?? 0);
  const shape = fallShape(fall);
  const retained = collapseRetained(state);

  // WHAT THIS BUYS — the cheapest core node this fall puts in reach. The fall
  // was a number with a button next to it; the reason to press it lived two
  // panels away in a tree the player had to price themselves.
  const after = cores.add(gain);
  const buys = CORE_NODES
    .filter((n) => (n.tranche !== 2 || state.shell.breachCount >= 1))
    .map((n) => ({ n, lvl: coreNodeLevel(state, n.id) }))
    .filter(({ n, lvl }) => lvl < n.maxLevel)
    .map(({ n, lvl }) => ({ name: n.name, cost: coreNodeCost(lvl), lvl }))
    .filter((x) => after.gte(x.cost) && cores.lt(x.cost))
    .sort((a, b) => (a.cost.gt(b.cost) ? 1 : -1))[0];

  const traces = state.collapse.traces ?? [];

  return (
    <div className="space-y-2">
      <WardenChallenge />
      <BreachCard />
      <div className="panel p-4">
        <div className="text-center text-[10px] uppercase tracking-widest text-cave-400">Let the shaft fall</div>
        <div className="mt-2 text-center font-display text-3xl font-bold text-core tnum">
          +{fmt(gain)} <span className="text-base font-normal">Cores</span>
          <Delta now={gain.toNumber()} was={last ? last.cores.toNumber() : null} />
        </div>

        {/* THE RUN, READ BACK. Every number here already existed in state and
            none of it was ever shown — the most repeated screen in the game
            told you a formula and nothing about the run you just made. */}
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-md border border-cave-800 bg-cave-900/40 p-2 text-center">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-cave-500">Depth</div>
            <div className="tnum text-sm text-cave-200">
              {peak}<Delta now={peak} was={last?.depth ?? null} />
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-cave-500">This run</div>
            <div className="tnum text-sm text-cave-200">
              {clock(runSec)}
              <Delta now={runSec} was={last?.sec ?? null} unit="s" lowerIsBetter />
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-cave-500">Fall no.</div>
            <div className="tnum text-sm text-cave-200">{state.collapse.count + 1}</div>
          </div>
        </div>

        {buys && (
          <div className="mt-2 rounded-md border border-core/25 bg-core/5 px-2 py-1.5 text-center text-[11px] text-core/90">
            This fall buys <span className="font-semibold">{buys.name}</span>{' '}
            <span className="text-cave-400">lv{buys.lvl + 1} · {fmt(buys.cost)} Cores</span>
          </div>
        )}

        {/* HOW IT COMES DOWN. Default is Clean, so the common path costs no
            extra input at all — this fires 24-37 times an arc and a choice
            that slows it down is a worse screen than no choice. */}
        <div className="mt-3 grid grid-cols-3 gap-1">
          {FALLS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFall(f.id)}
              className={`rounded-md border px-1 py-1.5 text-[11px] transition-colors ${
                fall === f.id
                  ? 'border-core/60 bg-core/10 text-core'
                  : 'border-cave-800 text-cave-400 hover:border-cave-700'
              }`}
            >
              {f.name.replace(' Fall', '')}
            </button>
          ))}
        </div>
        <div className="mt-1.5 min-h-[2.5rem] text-[11px] leading-relaxed text-cave-400">
          {shape.blurb}
          <div className="mt-0.5 text-cave-500">
            Keeps <span className="tnum text-cave-300">{Math.round(retained * shape.retainMult)}</span> levels
            of each face upgrade · kiln {shape.heatKeep === 'node' ? 'banks by Ember Memory' : shape.heatKeep === 1 ? 'keeps all heat' : 'goes cold'}
            {shape.faceFill < 1 && ' · rock returns half full'}
          </div>
        </div>

        <HoldButton
          onConfirm={() => dispatch({ type: 'collapse', fall })}
          disabled={!canCollapse}
          holdMs={900}
          className="btn mt-2 w-full border-core/40 py-2.5 text-sm font-semibold text-core hover:border-core"
        >
          {canCollapse ? `Hold for the ${shape.name}` : 'Descend to depth 26+ first'}
        </HoldButton>
        <div className="mt-2 text-center text-[11px] leading-relaxed text-cave-400">
          Resets face upgrades, Dust, Brick, and depth. The Kiln, Drill Bay, Delver,
          achievements, and your depth record all survive.
        </div>

        {/* THE COLUMN REMEMBERS. Bars at the depth each fall came down, so the
            shaft reads as one you dug rather than a fresh tube every time. */}
        {traces.length > 1 && (
          <div className="mt-3">
            <div className="text-[9px] uppercase tracking-wider text-cave-500">The column · last {traces.length} falls</div>
            <div className="mt-1 flex h-8 items-end gap-[2px]" role="img"
              aria-label={`Depth of your last ${traces.length} collapses, oldest first`}>
              {traces.map((t) => {
                const deepest = Math.max(...traces.map((x) => x.depth), 1);
                const colour = t.type === 'braced' ? 'bg-sky-500/50'
                  : t.type === 'ember' ? 'bg-amber-500/50' : 'bg-core/40';
                return (
                  <div key={t.count} className={`flex-1 rounded-sm ${colour}`}
                    style={{ height: `${Math.max(8, (t.depth / deepest) * 100)}%` }}
                    title={`Fall ${t.count} · depth ${t.depth} · ${fallShape(t.type).name}`} />
                );
              })}
            </div>
          </div>
        )}
        {state.collapse.count > 0 && (
          <div className="mt-1 text-center text-[11px] text-cave-400">
            Collapses so far: <span className="tnum text-cave-300">{state.collapse.count}</span>
          </div>
        )}
      </div>

      <CollapseControls />

      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-cave-400">Core Tree</span>
        <span className="text-xs text-cave-400">
          <Amount value={cores} color="#8be9fd" /> Cores
        </span>
      </div>
      {CORE_NODES.map((node) => {
        // Tranche 2 stays a sealed rumor until the first Breach.
        if (node.tranche === 2 && state.shell.breachCount < 1) return null;
        const level = coreNodeLevel(state, node.id);
        const maxed = level >= node.maxLevel;
        const cost = maxed ? null : coreNodeCost(level);
        const afford = cost !== null && cores.gte(cost);
        return (
          <div key={node.id} className="panel p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-cave-200">{node.name}</span>
              <div className="flex gap-0.5">
                {Array.from({ length: node.maxLevel }, (_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-1.5 rounded-full ${i < level ? 'bg-core' : 'bg-cave-700'}`}
                  />
                ))}
              </div>
            </div>
            <div className="mt-1 text-xs leading-snug text-cave-400">{node.description(level)}</div>
            {!maxed && (
              <button
                className={`btn mt-2 w-full py-1 text-xs ${afford ? 'border-core/50 text-core' : ''}`}
                disabled={!afford}
                onClick={() => dispatch({ type: 'buyCoreNode', id: node.id })}
              >
                Level {level + 1} · <Amount value={cost!} color="#8be9fd" /> Cores
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delver skill tree
// ---------------------------------------------------------------------------

const BRANCHES: { id: SkillBranch; name: string; blurb: string }[] = [
  { id: 'extraction', name: 'Extraction', blurb: 'The face, tools, chip yield' },
  { id: 'industry', name: 'Industry', blurb: 'Converters, throughput, automation' },
  { id: 'insight', name: 'Insight', blurb: 'Discovery, craft, prestige' },
];

export function DelverPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;

  const anySpent = Object.values(state.delver.skills).some((r) => r > 0);

  return (
    <div className="space-y-2">
      <div className="panel flex items-center justify-between p-3">
        <div className="text-xs text-cave-400">
          Skill points:{' '}
          <span className="tnum text-sm font-semibold text-lamp-400">{state.delver.skillPoints}</span>
          <span className="ml-2 opacity-70">+1 / level, +3 every 10th</span>
        </div>
        <button
          className="btn px-2.5 py-1 text-xs"
          disabled={!anySpent}
          onClick={() => dispatch({ type: 'respecSkills' })}
        >
          Respec (free)
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {BRANCHES.map((branch) => (
          <div key={branch.id} className="space-y-1.5">
            <div className="px-1 text-center">
              <div className="text-xs font-semibold uppercase tracking-wider text-cave-300">{branch.name}</div>
              <div className="text-[9px] leading-tight text-cave-400">{branch.blurb}</div>
            </div>
            {SKILL_NODES.filter((n) => n.branch === branch.id)
              .sort((a, b) => a.row - b.row)
              .map((node) => {
                const rank = skillRank(state, node.id);
                const maxed = rank >= node.maxRank;
                const unlocked = skillNodeUnlocked(state, node);
                const canBuy = unlocked && !maxed && state.delver.skillPoints >= node.costPerRank;
                // The shell that opens a still-locked node (loam 0, ferrite 1, …).
                const opensIn = !unlocked ? allShells()[node.unlockBreach ?? 0]?.name ?? 'a deeper shell' : null;
                return (
                  <button
                    key={node.id}
                    disabled={!canBuy}
                    onClick={() => dispatch({ type: 'buySkillNode', id: node.id })}
                    title={node.description(rank)}
                    className={`panel block w-full p-2 text-left transition-colors ${
                      !unlocked
                        ? 'opacity-40'
                        : maxed
                          ? 'border-lamp-500/40'
                          : canBuy
                            ? 'hover:border-lamp-500/60'
                            : 'opacity-70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-[11px] font-semibold text-cave-200">{node.name}</span>
                      {!unlocked && <span className="shrink-0 text-[8px] uppercase tracking-wide text-cave-500">🔒 {opensIn}</span>}
                    </div>
                    {!unlocked ? (
                      <div className="mt-1 text-[9px] italic leading-tight text-cave-500">Opens when you breach into {opensIn}.</div>
                    ) : (
                      <>
                        <div className="mt-1 flex gap-0.5">
                          {Array.from({ length: node.maxRank }, (_, i) => (
                            <span key={i} className={`h-1 w-full rounded-full ${i < rank ? 'bg-lamp-400' : 'bg-cave-700'}`} />
                          ))}
                        </div>
                        <div className="mt-1 text-[9px] leading-tight text-cave-400">{node.description(rank)}</div>
                      </>
                    )}
                  </button>
                );
              })}
          </div>
        ))}
      </div>
      {/* Shell Mastery — from depth records only; never resets. */}
      <div className="panel p-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-cave-300">Shell Mastery</div>
        {allShells()
          .filter((sh) => (state.depthRecords[sh.id] ?? 0) > 0 || sh.id === state.shell.current)
          .map((sh) => {
            const level = masteryLevel(state, sh.id);
            const gate = nextGate(state, sh.id);
            return (
              <div key={sh.id} className="flex items-baseline justify-between py-0.5 text-xs">
                <span className="text-cave-300">{sh.name}</span>
                <span className="tnum text-cave-200">
                  Lv {level}
                  <span className="ml-2 text-[10px] text-cave-400">
                    record {state.depthRecords[sh.id] ?? 0}
                    {gate ? ` · ${gate.what} at Lv ${gate.level}` : ''}
                  </span>
                </span>
              </div>
            );
          })}
        <div className="mt-1 text-[10px] italic text-cave-400">
          One level per ten depths of record. Records survive everything — even Recursion.
        </div>
      </div>
      <p className="px-1 text-center text-[11px] italic text-cave-400">
        Locked nodes open as you breach into deeper shells. The Delver never resets — not even at the end.
      </p>
    </div>
  );
}
