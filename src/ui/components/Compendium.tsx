/**
 * THE COMPENDIUM overlay. Reachable from anywhere — including inside rooms,
 * modals and challenges — via a persistent glyph in the header's left edge on
 * every viewport, plus a floating button on desktop.
 *
 * Placement note: the brief asked for bottom-left, which on a phone is exactly
 * where the cluster bar lives. Putting it in the header instead costs the
 * bottom bar nothing, so the five-cluster model and the 0px-overflow guarantee
 * at 380px are untouched, and the header is already present on every screen.
 *
 * Geometry is load-bearing here for the same reason it was in the disclosure
 * gate: this is a full-screen overlay, so its close control must never be able
 * to fall below the fold. The panel is a capped flex column, only the LIST and
 * the READER scroll, and Escape always closes.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState } from '../../engine';
import { dispatch, useGame } from '../store';
import {
  allEntries, entryById, entryForTab, isGated, search,
  KIND_LABEL, KIND_ORDER, type CompendiumEntry, type EntryKind,
} from '../compendium/data';

/**
 * An entry's "read signature" (Phase 21). Bodies are static; what changes is
 * whether the page has UNLOCKED. So 2 = open, 1 = still gated. A page is NEW or
 * CHANGED when its current signature is higher than the one stored at last read
 * (or nothing is stored) — i.e. you've never read it, or it has since opened up.
 */
function entrySig(e: CompendiumEntry, state: GameState | null): number {
  return isGated(e, state) ? 1 : 2;
}

export function CompendiumButton({ variant }: { variant: 'header' | 'fab' }) {
  const open = useGame((s) => s.openCompendium);
  const tab = useGame((s) => s.tab);
  if (variant === 'fab') {
    return (
      <button
        onClick={() => open(entryForTab(tab))}
        className="btn fixed bottom-4 left-4 z-30 hidden items-center gap-2 rounded-full px-4 py-2 text-xs shadow-2xl lg:flex"
        aria-label="Open the Compendium"
      >
        <span aria-hidden>❦</span> Compendium
      </button>
    );
  }
  return (
    <button
      onClick={() => open(entryForTab(tab))}
      className="btn shrink-0 rounded-md px-2 py-1 text-sm leading-none"
      aria-label="Open the Compendium"
      title="The Compendium — everything, explained"
    >
      <span aria-hidden>❦</span>
    </button>
  );
}

export function Compendium() {
  const state = useGame((s) => s.state);
  const isOpen = useGame((s) => s.compendiumOpen);
  const entryId = useGame((s) => s.compendiumEntry);
  const close = useGame((s) => s.closeCompendium);
  const openAt = useGame((s) => s.openCompendium);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<EntryKind | 'all'>('all');
  const [shell, setShell] = useState<string>('all');
  const [bookmarkOnly, setBookmarkOnly] = useState(false);
  useGame((s) => s.rev);
  const inputRef = useRef<HTMLInputElement>(null);

  const qol = state?.qol;
  const bookmarks = qol?.bookmarks ?? [];
  const readAt = qol?.readAt ?? {};
  const isFresh = (e: CompendiumEntry) => (readAt[e.id] ?? 0) < entrySig(e, (state as GameState) ?? null);

  // Escape always closes. A full-screen overlay with one exit is one layout
  // bug away from trapping the player; this is the belt to that brace.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  const current = entryId ? entryById(entryId) : undefined;

  // Opening an entry marks it read at its current signature, clearing its dot.
  useEffect(() => {
    if (!isOpen || !current) return;
    dispatch({ type: 'markRead', entryId: current.id, sig: entrySig(current, (state as GameState) ?? null) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, current?.id]);

  const listed = useMemo(() => {
    let all = query.trim() ? search(query, (state as GameState) ?? null) : allEntries();
    if (!query.trim()) {
      if (kind !== 'all') all = all.filter((e) => e.kind === kind);
      if (shell !== 'all') all = all.filter((e) => e.group === shell);
    }
    if (bookmarkOnly) all = all.filter((e) => bookmarks.includes(e.id));
    return all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, kind, shell, state, bookmarkOnly, bookmarks.join(',')]);

  const groups = useMemo(() => {
    const g = new Map<string, CompendiumEntry[]>();
    for (const e of listed) {
      const arr = g.get(e.group) ?? [];
      arr.push(e);
      g.set(e.group, arr);
    }
    return [...g.entries()];
  }, [listed]);

  const shellOptions = useMemo(() => {
    const s = new Set(allEntries().filter((e) => e.kind === 'material' || e.kind === 'species').map((e) => e.group));
    return [...s];
  }, []);

  if (!isOpen) return null;

  const gated = current ? isGated(current, (state as GameState) ?? null) : false;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="The Compendium"
    >
      <div className="panel flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden">
        {/* Head — never scrolls away */}
        <div className="flex shrink-0 items-center gap-2 border-b border-cave-700 p-3">
          <span className="font-display text-base font-semibold text-lamp-300" aria-hidden>❦</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search — a material, a system, or a question"
            className="min-w-0 flex-1 rounded-md border border-cave-700 bg-cave-950 px-2 py-1.5 text-sm text-cave-200 placeholder:text-cave-500 focus:border-lamp-500/60 focus:outline-none"
            aria-label="Search the Compendium"
          />
          <button className="btn shrink-0 px-2 py-1 text-xs" onClick={close} aria-label="Close the Compendium">
            Close
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* Index */}
          <div className={`flex min-h-0 flex-col border-cave-800 sm:w-64 sm:border-r ${current ? 'hidden sm:flex' : 'flex'}`}>
            <div className="flex shrink-0 flex-wrap gap-1 border-b border-cave-800 p-2">
              <FilterChip active={kind === 'all' && !bookmarkOnly} onClick={() => { setKind('all'); setShell('all'); setBookmarkOnly(false); }}>All</FilterChip>
              <FilterChip active={bookmarkOnly} onClick={() => setBookmarkOnly((b) => !b)}>
                ★ Saved{bookmarks.length > 0 ? ` ${bookmarks.length}` : ''}
              </FilterChip>
              {KIND_ORDER.map((k) => (
                <FilterChip key={k} active={kind === k && !bookmarkOnly} onClick={() => { setKind(k); setShell('all'); setBookmarkOnly(false); }}>
                  {KIND_LABEL[k]}
                </FilterChip>
              ))}
            </div>
            {(kind === 'material' || kind === 'species') && (
              <div className="flex shrink-0 flex-wrap gap-1 border-b border-cave-800 p-2">
                <FilterChip active={shell === 'all'} onClick={() => setShell('all')}>Every shell</FilterChip>
                {shellOptions.map((s) => (
                  <FilterChip key={s} active={shell === s} onClick={() => setShell(s)}>{s}</FilterChip>
                ))}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto p-2 scroll-thin">
              {groups.length === 0 && (
                <p className="p-2 text-xs italic text-cave-500">
                  Nothing by that name. Try a material, a system, or plain words — "why is my income capped" works.
                </p>
              )}
              {groups.map(([group, entries]) => (
                <div key={group} className="mb-2">
                  <div className="px-1 py-1 text-[10px] font-semibold uppercase tracking-widest text-cave-500">{group}</div>
                  {entries.map((e) => {
                    const locked = isGated(e, (state as GameState) ?? null);
                    const fresh = isFresh(e);
                    const marked = bookmarks.includes(e.id);
                    return (
                      <button
                        key={e.id}
                        onClick={() => openAt(e.id)}
                        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-cave-800 ${
                          current?.id === e.id ? 'bg-cave-700 text-lamp-300' : 'text-cave-300'
                        }`}
                      >
                        {fresh && !locked && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lamp-400" aria-label="new or changed" title="New or changed since you last read it" />}
                        <span className={`min-w-0 flex-1 truncate ${locked ? 'opacity-60' : ''}`}>{e.title}</span>
                        {marked && <span aria-hidden className="shrink-0 text-[10px] text-lamp-500">★</span>}
                        {locked && <span className="shrink-0 text-[9px] uppercase tracking-wider text-cave-600">not yet</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Reader */}
          <div className={`min-h-0 flex-1 overflow-y-auto p-4 scroll-thin ${current ? 'block' : 'hidden sm:block'}`}>
            {!current && (
              <div className="text-xs italic leading-relaxed text-cave-400">
                <p className="mb-2">Everything this game knows about itself, written down.</p>
                <p>
                  It explains how every system works and never what to do with it — the Chords, alloys, weaves,
                  rune orderings, brews and beam solutions stay yours to find. Read the whole thing and you will
                  understand the machinery with every discovery still ahead of you.
                </p>
              </div>
            )}
            {current && (
              <article>
                <button className="btn mb-2 px-2 py-1 text-[11px] sm:hidden" onClick={() => openAt(null)}>← Index</button>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-display text-lg font-semibold text-lamp-300">{current.title}</h2>
                  <button
                    onClick={() => dispatch({ type: 'setBookmark', entryId: current.id, on: !bookmarks.includes(current.id) })}
                    aria-pressed={bookmarks.includes(current.id)}
                    aria-label={bookmarks.includes(current.id) ? 'Remove bookmark' : 'Bookmark this page'}
                    className={`shrink-0 text-lg leading-none ${bookmarks.includes(current.id) ? 'text-lamp-400' : 'text-cave-600 hover:text-cave-300'}`}
                  >
                    {bookmarks.includes(current.id) ? '★' : '☆'}
                  </button>
                </div>
                <div className="mt-0.5 text-[10px] uppercase tracking-widest text-cave-500">
                  {KIND_LABEL[current.kind]} · {current.group}
                </div>

                {gated ? (
                  // Progressive honesty: say plainly that it is gated rather
                  // than pretending the page does not exist.
                  <p className="mt-3 rounded-md border border-cave-700 bg-cave-950 p-3 text-xs italic leading-relaxed text-cave-400">
                    {current.gateNote ?? 'You have not reached this yet.'} The page is here and will fill in when you do —
                    this book does not spoil a shell you have not stood in.
                  </p>
                ) : (
                  <>
                    {current.body.paragraphs.map((p, i) => (
                      <p key={i} className="mt-2.5 text-[13px] leading-relaxed text-cave-300">{p}</p>
                    ))}
                    {current.body.facts && current.body.facts.length > 0 && (
                      <div className="mt-3 rounded-md border border-cave-700 bg-cave-950 p-2.5">
                        {current.body.facts.map(([k, v]) => (
                          <div key={k} className="flex items-baseline justify-between gap-3 py-0.5 text-[11px]">
                            <span className="text-cave-500">{k}</span>
                            <span className="tnum text-right text-cave-200">{v}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {/* Your own margin — a private note, kept in the save. */}
                <NoteEditor key={current.id} entryId={current.id} initial={qol?.notes[current.id] ?? ''} />
              </article>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A private note on an entry — local while typing, committed to the save on blur. */
function NoteEditor({ entryId, initial }: { entryId: string; initial: string }) {
  const [text, setText] = useState(initial);
  const [editing, setEditing] = useState(false);
  const commit = () => {
    setEditing(false);
    if (text !== initial) dispatch({ type: 'setNote', entryId, note: text });
  };
  if (!editing && !text) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="mt-4 w-full rounded-md border border-dashed border-cave-700 px-3 py-2 text-left text-[11px] italic text-cave-500 hover:border-cave-500 hover:text-cave-400"
      >
        + Add a note of your own…
      </button>
    );
  }
  return (
    <div className="mt-4">
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-cave-500">Your note</div>
      <textarea
        value={text}
        autoFocus={editing}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setEditing(true)}
        onBlur={commit}
        placeholder="What you worked out, or want to remember…"
        className="h-20 w-full rounded-md border border-cave-700 bg-cave-950 p-2 text-[12px] leading-relaxed text-cave-200 placeholder:text-cave-600 focus:border-lamp-500/50 focus:outline-none"
      />
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
        active ? 'bg-cave-700 text-lamp-300' : 'text-cave-400 hover:bg-cave-800'
      }`}
    >
      {children}
    </button>
  );
}
