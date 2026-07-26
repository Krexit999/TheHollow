/**
 * Progressive disclosure (Phase 11, Part 5). New systems don't sprout silently
 * — especially after a Breach, when a wall of them arrives at once. Instead a
 * single "something opened" card names them, the player acknowledges, and the
 * rail-glow then leads them in one at a time.
 *
 * seenSystems lives in the SAVE (v11), so a restored export doesn't misfire the
 * gate for all twenty-eight systems. On the FIRST load of an existing (non-fresh)
 * save after this update, we silently backfill everything already visible.
 */
import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../../engine';
import { ALL_SYSTEMS, clusterOf } from '../nav';
import { systemCopy } from '../systemCopy';
import { dispatch, useGame, type TabId } from '../store';

function isEstablished(s: GameState): boolean {
  return s.maxDepthRecord > 0 || s.collapse.count > 0 || s.shell.breachCount > 0 || s.kiln.built;
}

export function DisclosureGate() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);
  const runSummaryOpen = useGame((s) => s.runSummaryOpen);
  const setTab = useGame((s) => s.setTab);
  const [pending, setPending] = useState<TabId[]>([]);
  const backfilled = useRef(false);

  useEffect(() => {
    if (!state) return;
    const seen = new Set(state.seenSystems ?? []);
    const visible = ALL_SYSTEMS.filter((sys) => sys.visible(state as GameState)).map((sys) => sys.id);
    const fresh = visible.filter((id) => !seen.has(id));
    // Nothing new: close the card if it was open (systems can be marked seen by
    // another path — acknowledging, navigating in, or a restored save's backfill).
    if (fresh.length === 0) {
      setPending((cur) => (cur.length ? [] : cur));
      return;
    }

    // Silent backfill: an existing save (pre-v11) arriving with unseen systems
    // it clearly already owns — mark them all, show nothing, once.
    if (!backfilled.current && (state.seenSystems?.length ?? 0) === 0 && isEstablished(state as GameState)) {
      backfilled.current = true;
      dispatch({ type: 'markSystemsSeen', ids: fresh });
      return;
    }
    // Otherwise queue the genuinely-new arrivals for the card.
    setPending((cur) => {
      const merged = [...new Set([...cur, ...fresh])];
      return merged.length === cur.length && merged.every((x, i) => x === cur[i]) ? cur : merged;
    });
  }, [rev, state]);

  // Escape always dismisses. A modal that can only be closed by one button is
  // one layout bug away from locking the player out of the whole game, which
  // is exactly what happened; this is the belt to the braces above.
  useEffect(() => {
    if (pending.length === 0) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      dispatch({ type: 'markSystemsSeen', ids: pending });
      setPending([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  // WAIT YOUR TURN. A Collapse that also opens a room raises two full-screen
  // z-50 dialogs at once, each with its own bg-black/70 — the screen goes
  // double-dark and which one you can actually press is decided by nothing more
  // than which was rendered second in App.tsx. This gate is the one that can
  // afford to wait: the fall's payout is the thing the player just earned, and
  // what it opened reads better after it. The pending list is held, not
  // dropped, so nothing is lost by deferring.
  if (runSummaryOpen) return null;
  if (pending.length === 0 || !state) return null;

  const acknowledge = () => {
    dispatch({ type: 'markSystemsSeen', ids: pending });
    setPending([]);
  };
  const go = (id: TabId) => {
    dispatch({ type: 'markSystemsSeen', ids: pending });
    setPending([]);
    setTab(id);
  };

  return (
    /* GEOMETRY IS LOAD-BEARING HERE. This is a full-screen modal at z-50: if
       its acknowledge button falls below the fold, the whole game becomes
       unclickable with no way out — the nav is visible through the translucent
       backdrop but dead to the touch, which reads to a player as "everything
       flickers and nothing works". That happened for real: nine systems opening
       at once made a 777px card in a 720px viewport with `overflow: visible`.
       So: the CARD is capped and is a flex column, only the LIST scrolls, and
       the button is a shrink-0 footer that cannot be pushed anywhere. */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="New systems opened">
      <div className="panel flex max-h-[85vh] w-full max-w-sm flex-col p-5">
        <div className="shrink-0 font-display text-lg font-semibold text-lamp-400">
          {pending.length === 1 ? 'Something opened.' : `${pending.length} things opened.`}
        </div>
        <p className="mt-1 shrink-0 text-xs italic text-cave-400">
          {pending.length === 1 ? 'A new way down there is yours now.' : 'New rooms, all at once. Take them one at a time.'}
        </p>
        <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 scroll-thin">
          {pending.map((id) => {
            const copy = systemCopy(id);
            const c = clusterOf(id);
            return (
              <button
                key={id}
                onClick={() => go(id)}
                className="flex w-full items-start gap-2 rounded-md border border-cave-700 bg-cave-850 p-2.5 text-left transition-colors hover:border-lamp-500/50 hover:bg-cave-800"
              >
                <span className="mt-px shrink-0 text-cave-500" aria-hidden>{c.glyph}</span>
                <span className="min-w-0">
                  <span className="text-sm font-semibold text-cave-200">{copy?.title ?? id}</span>
                  <span className="ml-1.5 text-[10px] uppercase tracking-wider text-cave-500">{c.label}</span>
                  {copy && <span className="mt-0.5 block truncate text-[11px] text-cave-400">{copy.purpose}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <button className="btn btn-warm mt-3 w-full shrink-0 py-2 text-sm" onClick={acknowledge} autoFocus>
          {pending.length === 1 ? 'Go on, then' : 'One at a time'}
        </button>
      </div>
    </div>
  );
}
