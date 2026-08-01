/**
 * VERDANCE UI — what survived A.72's craft-system cut.
 *
 * The Greenhouse, the Loom, the Still and the Mycelium were Verdance's THREE
 * craft rooms; all three are gone, along with the weather chip that named
 * what the rock was doing today (weather.ts is cut). What is left is the
 * signature mechanic itself — growth, the vines — and its one strip of UI.
 */
import { useGame } from '../store';
import { vinedCellCount, feralCellCount } from '../../engine/systems/growth';

/** Growth strip over the face while in Verdance. */
export function GrowthChip() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state || state.shell.current !== 'verdance') return null;
  const vines = vinedCellCount(state);
  if (vines === 0) return null;
  return (
    <div className="pointer-events-none absolute right-2 top-2 z-20 rounded-lg border border-[#3f6b32]/70 bg-cave-900/85 px-2 py-1 text-[10px] text-[#9ee07a]">
      {vines} vined · {feralCellCount(state)} feral
    </div>
  );
}
