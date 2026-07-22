import { allShells, coresForDepth, fmt, getCurrency, masteryLevel, nextGate } from '../../engine';
import {
  CORE_NODES,
  coreNodeCost,
  coreNodeLevel,
} from '../../engine/content/shell1/coreTree';
import {
  SKILL_NODES,
  skillRank,
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

export function CollapsePanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;

  const gain = coresForDepth(state.depth);
  const cores = getCurrency(state, 'core');
  const canCollapse = gain.gte(1);

  return (
    <div className="space-y-2">
      <WardenChallenge />
      <BreachCard />
      <div className="panel p-4 text-center">
        <div className="text-[10px] uppercase tracking-widest text-cave-400">Let the shaft fall</div>
        <div className="mt-2 font-display text-3xl font-bold text-core tnum">
          +{fmt(gain)} <span className="text-base font-normal">Cores</span>
        </div>
        <div className="mt-1 text-[11px] text-cave-400 tnum">⌊2 · (depth {state.depth} / 40)^1.5⌋</div>
        <HoldButton
          onConfirm={() => dispatch({ type: 'collapse' })}
          disabled={!canCollapse}
          holdMs={900}
          className="btn mt-3 w-full border-core/40 py-2.5 text-sm font-semibold text-core hover:border-core"
        >
          {canCollapse ? 'Hold to Collapse' : 'Descend to depth 26+ first'}
        </HoldButton>
        <div className="mt-2 text-[11px] leading-relaxed text-cave-400">
          Resets face upgrades, Dust, Brick, and depth. The Kiln, Drill Bay, Delver,
          achievements, and your depth record all survive.
        </div>
        {state.collapse.count > 0 && (
          <div className="mt-1 text-[11px] text-cave-400">
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
                const canBuy = !node.stub && !maxed && state.delver.skillPoints >= node.costPerRank;
                return (
                  <button
                    key={node.id}
                    disabled={!canBuy}
                    onClick={() => dispatch({ type: 'buySkillNode', id: node.id })}
                    title={node.description(rank)}
                    className={`panel block w-full p-2 text-left transition-colors ${
                      node.stub
                        ? 'opacity-35'
                        : maxed
                          ? 'border-lamp-500/40'
                          : canBuy
                            ? 'hover:border-lamp-500/60'
                            : 'opacity-70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-[11px] font-semibold text-cave-200">{node.name}</span>
                    </div>
                    {node.stub ? (
                      <div className="mt-1 text-[9px] italic leading-tight text-cave-500">Not yet — a deeper delve opens this branch.</div>
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
        Sealed nodes open in deeper shells. The Delver never resets — not even at the end.
      </p>
    </div>
  );
}
