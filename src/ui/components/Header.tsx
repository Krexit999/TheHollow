import { useState } from 'react';
import { allCurrencies, currentShell, fmt, getCurrency, xpToLevel } from '../../engine';
import { chipCurrencyId, convCurrencyId } from '../../engine';
import { useGame } from '../store';
import { Amount } from './shared';
import { CompendiumButton } from './Compendium';

/** The reset/meta currencies always worth surfacing when held. */
const KEY_META = ['core', 'echo', 'axiom', 'scrip'];

export function Header() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [purseOpen, setPurseOpen] = useState(false);
  if (!state) return null;

  const held = allCurrencies().filter((c) => getCurrency(state, c.id).gt(0) || (state.totals[c.id]?.gt(0) ?? false) || c.id === 'dust');
  const chip = chipCurrencyId(state);
  const conv = convCurrencyId(state);
  // The bar shows the current shell's coin + a couple of key meta; the rest go
  // to the purse — so it never overflows, at one currency or fifty.
  const primaryIds = [chip, conv, ...KEY_META.filter((id) => getCurrency(state, id).gt(0))];
  const primary = held.filter((c) => primaryIds.includes(c.id)).sort((a, b) => primaryIds.indexOf(a.id) - primaryIds.indexOf(b.id));
  const rest = held.filter((c) => !primaryIds.includes(c.id));

  const need = xpToLevel(state.delver.level + 1);
  const xpPct = Math.min(100, state.delver.xp.div(need).mul(100).toNumber());

  return (
    <header className="relative flex items-center gap-3 px-3 py-2 sm:px-4">
      <CompendiumButton variant="header" />
      {/* The title yields first: in a deep run the currency strip carries several
          long-named coins (Slag, Caravan Scrip), and on a 380px phone the two
          together used to push the document ~38px wide. min-w-0 + truncate lets
          the title give up space so the fixed-width strip and Purse always fit. */}
      <h1 className="min-w-0 shrink truncate font-display text-base font-semibold tracking-[0.16em] text-lamp-400 sm:text-xl">THE&nbsp;HOLLOW</h1>
      <div className="ml-1 hidden text-[10px] uppercase tracking-widest text-cave-400 sm:block">
        {currentShell(state).title}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2.5 sm:gap-4">
        {/* Show two on phone, four on desktop; the rest live in the purse. */}
        {/* Reserved width: these values grow a character at a time ("9.9K" →
            "10.0K") and every widening pushed the Purse button leftward out
            from under the cursor. Right-aligned inside a fixed box instead. */}
        {primary.slice(0, 2).map((c) => (
          <div key={c.id} className="min-w-[4.25rem] text-right sm:min-w-[5rem]" title={c.name}>
            <div className="text-[10px] uppercase tracking-wider text-cave-400">{c.name}</div>
            <Amount value={getCurrency(state, c.id)} color={c.color} className="text-sm sm:text-base" />
          </div>
        ))}
        {primary.slice(2, 4).map((c) => (
          <div key={c.id} className="hidden text-right sm:block sm:min-w-[5rem]" title={c.name}>
            <div className="text-[10px] uppercase tracking-wider text-cave-400">{c.name}</div>
            <Amount value={getCurrency(state, c.id)} color={c.color} className="text-sm sm:text-base" />
          </div>
        ))}
        {(rest.length > 0 || primary.length > 2) && (
          <button
            onClick={() => setPurseOpen((o) => !o)}
            className="rounded-md border border-cave-700 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-cave-400 hover:border-lamp-500/50 hover:text-lamp-300"
            aria-expanded={purseOpen}
            aria-label="Show all currencies"
          >
            Purse
          </button>
        )}
        <div className="hidden w-24 sm:block sm:w-36" title={`${fmt(state.delver.xp)} / ${fmt(need)} XP`}>
          <div className="flex justify-between text-[10px] uppercase tracking-wider text-cave-400">
            <span>Delver {state.delver.level}</span>
            <span>{state.delver.skillPoints > 0 ? `${state.delver.skillPoints} pts` : ''}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-cave-800">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-600 to-lamp-400" style={{ width: `${xpPct}%` }} />
          </div>
        </div>
      </div>

      {/* The purse — every held currency, named, no guessing at abbreviations. */}
      {purseOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPurseOpen(false)} aria-hidden />
          <div className="absolute right-2 top-full z-50 mt-1 max-h-[60vh] w-64 overflow-y-auto rounded-lg border border-cave-600 bg-cave-900 p-3 shadow-2xl scroll-thin sm:right-4">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-cave-400">The Purse</div>
            <div className="space-y-1">
              {held.map((c) => (
                <div key={c.id} className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs" style={{ color: c.color }}>{c.name}</span>
                  <Amount value={getCurrency(state, c.id)} color={c.color} className="text-xs" />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </header>
  );
}
