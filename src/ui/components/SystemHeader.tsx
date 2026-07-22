/**
 * The three-layer answer every system owes the player (Phase 11, Part 2):
 *  Layer 1 — the purpose, in the game's voice, always visible.
 *  Layer 2 — the single most useful next action, computed from state.
 * (Layer 3 — the number breakdown — lives inline in each panel via BucketInfo.)
 *
 * Drop <SystemHeader system="kiln" /> at the top of a panel. An optional
 * `status` slot shows a live readout on the right (heat %, running, etc.).
 */
import type { ReactNode } from 'react';
import type { GameState } from '../../engine';
import { systemCopy } from '../systemCopy';
import { useGame } from '../store';
import type { TabId } from '../store';

export function SystemHeader({ system, status }: { system: TabId; status?: ReactNode }) {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const copy = systemCopy(system);
  if (!copy) return null;
  const next = state && copy.next ? copy.next(state as GameState) : null;
  // An explicit `status` prop still wins; otherwise the copy table supplies it.
  const readout = status ?? (state && copy.status ? copy.status(state as GameState) : null);

  return (
    <header className="panel mb-2 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-semibold tracking-wide text-lamp-300">{copy.title}</h2>
        {readout && <span className="tnum shrink-0 text-[11px] text-cave-400">{readout}</span>}
      </div>
      {/* Layer 1 — what this is and why you care. */}
      <p className="mt-1 text-xs italic leading-relaxed text-cave-300">{copy.purpose}</p>
      {/* Layer 2 — do this now. */}
      {next && (
        <div className="mt-2 flex items-start gap-1.5 rounded-md border border-lamp-500/25 bg-amber-950/25 px-2.5 py-1.5">
          <span className="mt-px shrink-0 text-lamp-400" aria-hidden>→</span>
          <span className="text-[11px] font-medium leading-snug text-lamp-200">{next}</span>
        </div>
      )}
    </header>
  );
}
