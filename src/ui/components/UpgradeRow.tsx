import { useEffect, useState, type ReactNode } from 'react';
import {
  currencyDef,
  fmt,
  getCurrency,
  maxAffordable,
  nextCost,
  costForLevels,
  resolveCurrencyId,
  upgradeLevel,
  type GameState,
  type UpgradeDef,
} from '../../engine';
import { ModifierCache } from '../../engine/modifiers';
import { dispatch, useGame, type BulkMode } from '../store';
import { Amount } from './shared';

/** A field stat previewed before purchase — "Field ceiling 25.7 → 31.2". */
export interface PreviewStat {
  label: string;
  color?: string;
  compute: (s: GameState, m: ModifierCache) => string;
}

const scratch = new ModifierCache();

/** Which one-off upgrades OPEN a whole new system (vs. a plain structural build). */
const UNLOCK_IDS = new Set(['kilnBuild', 'latticeUncover', 'forgeBuild', 'bayBuild']);

type Kind = 'unlock' | 'structural' | 'spam';
function kindOf(def: UpgradeDef): Kind {
  if (def.maxLevel !== 1) return 'spam';
  return UNLOCK_IDS.has(def.id) ? 'unlock' : 'structural';
}

/**
 * NEWLY AFFORDABLE — the false→true edge, and only that.
 *
 * Deliberately NOT "is affordable" (that is already the button's warm styling)
 * and NOT the MAX-mode count changing (which ticks constantly and would strobe
 * the whole panel). We remember the previous answer per upgrade id across
 * renders; the very first sighting of a row records silently, so opening a
 * panel never flashes everything you happen to be able to afford.
 */
const affordPrev = new Map<string, boolean>();

function BuyButton({
  id,
  afford,
  oneOff,
  label,
  cost,
  onBuy,
  ariaLabel,
}: {
  id: string;
  afford: boolean;
  oneOff: boolean;
  label: string;
  cost: ReactNode;
  onBuy: () => void;
  ariaLabel: string;
}) {
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    const prev = affordPrev.get(id);
    affordPrev.set(id, afford);
    if (prev === false && afford) {
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), 3200);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [id, afford]);

  return (
    /* STABLE GEOMETRY. `buyN` and `cost` recompute every store tick, so this
       label changes width constantly ("Buy ×34 · 1.2K" → "×35 · 1.3K"). The
       button sits at the end of a flex row, so a wider label pushed its LEFT
       edge under the pointer — hover was lost, reverted, re-acquired, and
       clicks landed where the button no longer was. `tnum` equalises digit
       widths and the reserved min-width absorbs the rest. */
    <button
      className={`btn tnum flex shrink-0 select-none items-center justify-center self-center ${
        afford ? 'btn-warm' : ''
      } ${flash && afford ? 'just-affordable' : ''} ${
        oneOff ? 'min-w-[5rem]' : 'min-w-[8.25rem]'
      } px-3 py-1.5 text-xs`}
      disabled={!afford}
      onClick={onBuy}
      aria-label={ariaLabel}
    >
      {label}
      {cost}
    </button>
  );
}

/** The persistent bulk-buy control — one per panel, not one per row. */
export function BulkControl() {
  const bulkMode = useGame((s) => s.bulkMode);
  const setBulkMode = useGame((s) => s.setBulkMode);
  const opts: BulkMode[] = [1, 10, 'max'];
  return (
    <div className="flex items-center gap-1.5 px-1 text-[10px] text-cave-400">
      <span className="uppercase tracking-wider">Buy</span>
      <div className="flex overflow-hidden rounded-md border border-cave-700" role="group" aria-label="Bulk buy amount">
        {opts.map((o) => (
          <button
            key={String(o)}
            onClick={() => setBulkMode(o)}
            aria-pressed={bulkMode === o}
            className={`px-2 py-0.5 text-[11px] font-semibold transition-colors ${
              bulkMode === o ? 'bg-cave-700 text-lamp-300' : 'text-cave-400 hover:bg-cave-800'
            }`}
          >
            {o === 'max' ? 'MAX' : `×${o}`}
          </button>
        ))}
      </div>
    </div>
  );
}

export function UpgradeRow({ def, preview }: { def: UpgradeDef; preview?: PreviewStat[] }) {
  const state = useGame((s) => s.state);
  const bulkMode = useGame((s) => s.bulkMode);
  const askSpend = useGame((s) => s.askSpend);
  useGame((s) => s.rev);
  if (!state) return null;

  const level = upgradeLevel(state, def.id);
  const maxed = level >= def.maxLevel;
  const currencyId = resolveCurrencyId(def.currency, state);
  const bank = getCurrency(state, currencyId);
  const cur = currencyDef(currencyId);
  const kind = kindOf(def);
  const oneOff = kind !== 'spam';

  // How many this click buys, given the bulk mode (clamped to affordable + cap).
  const affordable = maxed ? 0 : maxAffordable(def, level, bank);
  const wanted = oneOff ? 1 : bulkMode === 'max' ? affordable : Math.min(bulkMode as number, def.maxLevel - level);
  const buyN = Math.max(0, Math.min(wanted, def.maxLevel - level, affordable));
  const cost = maxed ? null : buyN >= 1 ? costForLevels(def, level, buyN) : nextCost(def, level);
  const afford = buyN >= 1;
  // What the LABEL says. When you can afford nothing, buyN is 0 — and the
  // button read "Buy ×0 · 50", offering to buy zero of a thing, on the very
  // first screen of the game. Show the one you'd get instead; `cost` is
  // already the price of one in that branch, so the two agree.
  const labelN = buyN >= 1 ? buyN : 1;

  // Effect preview: recompute the given field stats with the buy applied.
  // Always previews at least ONE level even when you can't afford it yet —
  // partly so you can see what you're saving toward, but mainly so this block
  // never mounts/unmounts as currency crosses the affordability line. A block
  // that appears and disappears changes the card's height and shoves every row
  // below it, which walks buttons out from under the cursor.
  const previewRows = (() => {
    if (!preview || maxed) return [];
    const n = Math.max(buyN, 1);
    const bumped = { ...(state as GameState), upgrades: { ...state.upgrades, [def.id]: level + n } };
    const live = new ModifierCache();
    scratch.invalidate();
    const out: { label: string; from: string; to: string; color?: string }[] = [];
    for (const p of preview) {
      const from = p.compute(state as GameState, live);
      const to = p.compute(bumped, scratch);
      if (from !== to) out.push({ label: p.label, from, to, color: p.color });
    }
    return out;
  })();

  // Confirm-on-big-spend: only a repeatable upgrade's ×10 / MAX buy, and only
  // when it eats the chosen share of the bank. A single tap never asks — that's
  // the spam-tier the toggle promises to leave alone; undo has the small stuff.
  const frac = state.qol.confirmSpendFrac;
  const bigBulk = kind === 'spam' && (bulkMode === 'max' || buyN >= 10);
  const handleBuy = () => {
    const action = { type: 'buyUpgrade' as const, id: def.id, count: oneOff ? 1 : bulkMode };
    if (frac > 0 && cost && afford && bigBulk && bank.gt(0) && cost.gte(bank.mul(frac))) {
      const pct = Math.min(100, Math.round(cost.div(bank).toNumber() * 100));
      askSpend({
        action,
        title: `Buy ×${buyN} ${def.name}`,
        detail: `${fmt(cost)} ${cur.name} — ${pct}% of your ${cur.name}`,
      });
    } else {
      dispatch(action);
    }
  };

  const badge =
    kind === 'unlock' ? { text: 'OPENS', cls: 'border-lamp-500/50 bg-amber-950/40 text-lamp-300' } :
    kind === 'structural' ? { text: 'BUILD', cls: 'border-cave-500 bg-cave-800 text-cave-300' } :
    null;

  const border =
    kind === 'unlock' ? 'border-lamp-500/40' :
    kind === 'structural' ? 'border-cave-500' :
    'border-cave-700';

  return (
    <div className={`panel border ${border} p-3 ${maxed ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {badge && (
              <span className={`rounded border px-1.5 py-px text-[9px] font-bold uppercase tracking-wider ${badge.cls}`}>
                {badge.text}
              </span>
            )}
            <span className="text-sm font-semibold text-cave-200">{def.name}</span>
            {kind === 'spam' && (
              <span className="tnum text-[11px] text-cave-400">Lv {level}<span className="opacity-60">/{def.maxLevel}</span></span>
            )}
          </div>
          <div className="mt-0.5 text-xs leading-snug text-cave-400">{def.description(level)}</div>
          {/* The effect preview — pillar 2 made legible before you spend. */}
          {previewRows.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
              {previewRows.map((r) => (
                <span key={r.label} className="tnum text-[10px] text-cave-400">
                  {r.label} <span className="text-cave-500">{r.from}</span>
                  <span className="text-lamp-400"> → {r.to}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        {maxed ? (
          <span className="shrink-0 self-center text-xs font-semibold uppercase tracking-wider text-lamp-400">Max</span>
        ) : (
          <BuyButton
            id={def.id}
            afford={afford}
            oneOff={oneOff}
            label={oneOff ? (kind === 'unlock' ? 'Open' : 'Build') : `Buy ×${labelN}`}
            cost={cost ? <> · <Amount value={cost} color={cur.color} /></> : null}
            onBuy={handleBuy}
            ariaLabel={`${oneOff ? (kind === 'unlock' ? 'Open' : 'Build') : `Buy ${labelN}`} ${def.name} for ${cost ? cur.name : ''}`}
          />
        )}
      </div>
    </div>
  );
}
