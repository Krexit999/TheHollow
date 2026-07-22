/**
 * SABLE'S JOURNAL — the archive. Pages carry her numbering with the gaps
 * showing; the hand degrades with depth (clear → stained → ciphered), and
 * ciphered pages render Quill's survey glyphs until his fee is paid.
 * Reading is always optional and never stops the dig.
 */
import { useEffect, useRef, useState } from 'react';
import { getCurrency } from '../../engine';
import type { GameState } from '../../engine';
import {
  cipherText,
  FRAGMENTS,
  fragmentDef,
  translationFee,
  type FragmentDef,
} from '../../engine/guild/sable';
import { dispatch, useGame } from '../store';
import { activeConfluences, CONFLUENCE_BY_ID } from '../../engine/systems/confluence';
import { BUCKET_NAME } from './shared';

const SHELL_LABEL: Record<string, string> = { loam: 'THE LOAM PAGES', ferrite: 'THE FERRITE PAGES' };

/**
 * YOUR OWN MARGINS — the confluence codex.
 *
 * Sable wrote a survey of the under-shells; this is the player writing one
 * beside it. A confluence is recorded the first time its two systems are both
 * true, and the entry says what it IS and never how it was reached — the
 * finding is the reward, and re-deriving it is the point.
 *
 * Live-vs-dormant is shown because a confluence pays only while it holds: this
 * is the only place that distinction is visible.
 */
function ConfluenceCodex() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const found = state.confluences.found;
  if (found.length === 0) return null;
  const live = new Set(activeConfluences(state as GameState).map((c) => c.id));

  return (
    <div className="panel p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#c8b48a]">Your own margins</span>
        <span className="tnum text-[10px] text-cave-400">
          {found.length} noticed · {live.size} true right now
        </span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        Things that only happen when two parts of the world are true at once. They pay while they
        hold and stop when they stop — the note stays either way.
      </p>
      <div className="mt-2 space-y-1.5">
        {found.map((id) => {
          const def = CONFLUENCE_BY_ID.get(id);
          if (!def) return null;
          const on = live.has(id);
          return (
            <div key={id} className={`border-l-2 pl-2 ${on ? 'border-[#c8b48a]' : 'border-cave-700'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-xs font-semibold ${on ? 'text-cave-200' : 'text-cave-400'}`}>{def.name}</span>
                <span className="shrink-0 text-[9px] uppercase tracking-wider text-cave-500">
                  {on ? <span className="text-[#c8b48a]">holding</span> : 'quiet'}
                </span>
              </div>
              <div className="text-[10px] italic leading-snug text-cave-400">{def.flavor}</div>
              <div className="mt-0.5 text-[10px] text-cave-500">
                {def.systems[0]} × {def.systems[1]}
                {on && <span className="ml-1.5 text-[#c8b48a]">+{Math.round(def.bonus * 100)}% {BUCKET_NAME[def.bucket]}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function JournalPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [openId, setOpenId] = useState<string | null>(null);
  if (!state) return null;
  const found = state.guild.sable.found;
  if (found.length === 0) {
    return (
      <div className="space-y-2">
        <div className="panel p-4 text-center text-xs italic text-cave-400">
          A journal cover, water-swollen, found near the winch: “S—— · survey of the under-shells ·
          vol. I.” The pages have been torn out and scattered below. They will surface as you dig.
        </div>
        {/* Your own notes exist whether or not you have found any of hers. */}
        <ConfluenceCodex />
      </div>
    );
  }

  const shells = ['loam', 'ferrite'].filter((sh) => FRAGMENTS.some((f) => f.shellId === sh));
  const open = openId && found.includes(openId) ? fragmentDef(openId) : null;

  return (
    <div className="space-y-2">
      <div className="panel p-3 text-[11px] leading-snug text-cave-400">
        Her pages, in her numbering — the gaps are pages the rock still keeps. Old Quill translates
        the ciphered hand for a fee.
        <span className="tnum ml-1 text-cave-300">
          {found.length}/{FRAGMENTS.length} found · {state.guild.sable.read.length} read
        </span>
      </div>

      <ConfluenceCodex />

      {open && <PageReader def={open} onClose={() => setOpenId(null)} />}

      {shells.map((sh) => {
        const pages = FRAGMENTS.filter((f) => f.shellId === sh).sort((a, b) => a.page - b.page);
        const heldHere = pages.filter((f) => found.includes(f.id));
        if (heldHere.length === 0 && sh === 'ferrite') return null;
        return (
          <div key={sh}>
            <div className="flex items-baseline justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-cave-400">{SHELL_LABEL[sh]}</span>
              <span className="tnum text-[10px] text-cave-400">{heldHere.length}/{pages.length}</span>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              {pages.map((f) => {
                const held = found.includes(f.id);
                const legible = state.guild.sable.translated.includes(f.id);
                const read = state.guild.sable.read.includes(f.id);
                if (!held) {
                  return (
                    <div key={f.id} className="rounded-md border border-dashed border-cave-800 p-2 text-center">
                      <span className="tnum text-[10px] text-cave-600">p.{f.page} — still below</span>
                    </div>
                  );
                }
                return (
                  <button
                    key={f.id}
                    className={`rounded-md border p-2 text-left transition-colors ${
                      openId === f.id ? 'border-[#e0b054]/70 bg-cave-800' : read ? 'border-cave-700' : 'border-[#9fd8c0]/50'
                    } hover:border-cave-500`}
                    onClick={() => {
                      setOpenId(openId === f.id ? null : f.id);
                      if (legible) dispatch({ type: 'markFragmentRead', fragmentId: f.id });
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="tnum text-[10px] font-semibold text-cave-200">p.{f.page}</span>
                      {!read && legible && <span className="text-[8px] uppercase tracking-widest text-[#9fd8c0]">unread</span>}
                      {!legible && <span className="text-[8px] uppercase tracking-widest text-[#c9a86a]">ciphered</span>}
                      {f.legibility === 'stained' && legible && (
                        <span className="text-[8px] uppercase tracking-widest text-cave-500">stained</span>
                      )}
                    </div>
                    <div className={`truncate text-[10px] italic ${legible ? 'text-cave-400' : 'text-cave-600'}`}>
                      {legible ? f.heading : cipherText(f.heading)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PageReader({ def, onClose }: { def: FragmentDef; onClose: () => void }) {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The reader sits at the top of the archive — bring it to the eye.
    hostRef.current?.scrollIntoView({ block: 'nearest' });
  }, [def.id]);
  if (!state) return null;
  const legible = state.guild.sable.translated.includes(def.id);
  const fee = translationFee(state, def.id);
  const handClass =
    def.legibility === 'clear' ? 'sable-hand' : def.legibility === 'stained' ? 'sable-hand sable-stained' : 'sable-hand sable-deep';

  return (
    <div ref={hostRef} className="panel sable-page p-4">
      <div className="flex items-baseline justify-between">
        <span className="tnum text-[10px] uppercase tracking-widest text-[#7a6a52]">
          page {def.page} · {legible ? def.heading : 'in the survey cipher'}
        </span>
        <button className="text-[10px] text-cave-400 hover:text-cave-200" onClick={onClose}>
          fold it away
        </button>
      </div>
      {legible ? (
        <p className={`mt-2 text-[13px] leading-relaxed ${handClass}`}>{def.text}</p>
      ) : (
        <>
          <p className="sable-hand sable-cipher mt-2 select-none text-[13px] leading-relaxed" aria-hidden>
            {cipherText(def.text.slice(0, 420))}
            {def.text.length > 420 ? ' …' : ''}
          </p>
          <button
            className="btn btn-warm mt-2 w-full py-1.5 text-xs"
            disabled={getCurrency(state, 'scrip').lt(fee)}
            onClick={() => {
              const r = dispatch({ type: 'translateFragment', fragmentId: def.id });
              if (r.ok) dispatch({ type: 'markFragmentRead', fragmentId: def.id });
            }}
          >
            Quill will read it · {fee} Scrip
          </button>
        </>
      )}
      <div className="mt-2 text-right text-[10px] italic text-[#7a6a52]">— S.</div>
    </div>
  );
}
