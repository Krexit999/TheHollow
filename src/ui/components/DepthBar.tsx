import { currencyDef, currentShell, fmt, getCurrency } from '../../engine';
import { computeBucket } from '../../engine';
import { descendCost } from '../../engine';
import { equippedTool, nextWall, requiredTier } from '../../engine/systems/forge';
import { dispatch, useGame } from '../store';
import { Amount, HoldButton } from './shared';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];

export function DepthBar() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;

  const shell = currentShell(state);
  const cost = descendCost(state.depth + 1).mul(computeBucket(state, 'descendCost'));
  const afford = getCurrency(state, shell.chipCurrencyId).gte(cost);
  const tool = equippedTool(state);
  const atFloor = state.depth >= shell.floorDepth;
  const wallBlocked = !atFloor && requiredTier(state, state.depth + 1) > tool.tier;
  const wall = nextWall(state, state.depth);
  const wallNear = wall && wall.depth - state.depth <= 8;

  return (
    <div className="panel flex items-center gap-3 px-3 py-2">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-cave-400">Depth</div>
        <div className="font-display text-2xl font-bold text-cave-200 tnum">{state.depth}</div>
      </div>
      <div className="h-8 w-px bg-cave-700" />
      <div className="min-w-0 flex-1 text-xs text-cave-400">
        <div>
          Deepest: <span className="tnum text-cave-300">{state.maxDepthRecord}</span>
          <span className="hidden sm:inline"> — the record survives everything.</span>
        </div>
        <div>
          Depth Pressure: <span className="text-lamp-400">+{fmt(state.depth * 2)}% Dust</span>
        </div>
        {/* The wall is legible BEFORE you hit it. */}
        {atFloor ? (
          <div className="font-semibold text-[#8be9fd]">
            The floor of {shell.name}. It sounds hollow underfoot. (See Collapse.)
          </div>
        ) : wallBlocked ? (
          <div className="font-semibold text-red-400/90">
            The rock below is too hard — forge a Tier {ROMAN[requiredTier(state, state.depth + 1)]} tool.
          </div>
        ) : wallNear ? (
          <div className="text-lamp-400/90">
            The rock hardens at depth {wall.depth} — Tier {ROMAN[wall.tier]} needed.
          </div>
        ) : shell.floorDepth - state.depth <= 12 ? (
          <div className="text-[#8be9fd]/80">
            The floor of {shell.name} lies at {shell.floorDepth}.
          </div>
        ) : null}
      </div>
      <HoldButton
        onConfirm={() => dispatch({ type: 'descend' })}
        disabled={!afford || wallBlocked || atFloor}
        holdMs={650}
        className="btn btn-warm min-w-[7.5rem] py-2 text-center"
      >
        <span className="block text-sm font-semibold">
          {atFloor ? 'The Floor' : wallBlocked ? 'Too hard' : 'Descend'}
        </span>
        <span className="block text-[11px] opacity-80">
          <Amount value={cost} color={currencyDef(shell.chipCurrencyId).color} />{' '}
          {currencyDef(shell.chipCurrencyId).name}
        </span>
      </HoldButton>
    </div>
  );
}
