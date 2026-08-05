/**
 * The Hold — inventory. Opened thousands of times: fast, legible, filterable.
 * Stacks by material + purity band; gems and geodes are their own shelves;
 * the Assay Table lives at the bottom (Insight-gated).
 */
import { useState } from 'react';
import {
  BAND_LABELS,
  BANDS,
  GEMS,
  materialDef,
  materialsOfShell,
  RARITIES,
  type MaterialRarity,
} from '../../engine/materials';
import { materialCount, stackAvg } from '../../engine/systems/forge';
import {
  assayDuration,
  assayUnlocked,
  buildAssayReport,
} from '../../engine/systems/drops';
import { ModifierCache } from '../../engine/modifiers';
import { fmtNum } from '../../engine';
import { dispatch, useGame } from '../store';
import { GemIcon, GeodeIcon, MaterialIcon } from './MaterialIcon';
import { HoldButton, TraitTag } from './shared';
import { traitsOf } from '../../engine/traits';
import { AutoRefineControl, PinnedStrip, ShortfallReadout } from './qol';
import { reservedList } from '../../engine/systems/reserve';

const RARITY_LABEL: Record<MaterialRarity, string> = {
  common: 'Common', rich: 'Rich', pure: 'Pure', flawless: 'Flawless', starred: 'Starred', aberrant: 'Aberrant',
};

const RARITY_COLOR: Record<MaterialRarity, string> = {
  common: '#8a7f70', rich: '#a8763e', pure: '#b9c4cf', flawless: '#e2c76a', starred: '#9fb8ff', aberrant: '#c69fd8',
};

const mods = new ModifierCache();

export function HoldPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [filter, setFilter] = useState<MaterialRarity | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!state) return null;
  mods.invalidate();

  // RESERVE (§25.5, A.100). The star was a sort order; it is a safety primitive
  // now, and fourteen machines refuse a starred stack by name.
  const pinned = new Set(reservedList(state as never));
  const loam = materialsOfShell('loam');
  const owned = loam
    .map((def) => ({ def, count: materialCount(state, def.id) }))
    .filter((e) => e.count > 0 && (filter === 'all' || e.def.rarity === filter))
    .sort(
      (a, b) =>
        // Reserved first, then rarity, then count — a reserve outranks everything.
        (pinned.has(b.def.id) ? 1 : 0) - (pinned.has(a.def.id) ? 1 : 0) ||
        RARITIES.indexOf(b.def.rarity) - RARITIES.indexOf(a.def.rarity) ||
        b.count - a.count,
    );
  const gemsOwned = GEMS.filter((g) => (state.materials.gems[g.id] ?? 0) > 0);
  const hunch = assayUnlocked(state);
  const surveying = state.assay.active;
  const report = state.assay.reportDepth !== null ? buildAssayReport(state) : null;

  return (
    <div className="space-y-2">
      {/* Pinned — surfaced above the filter, so it survives any filter choice. */}
      <PinnedStrip />
      {/* Filter chips */}
      <div className="panel flex flex-wrap items-center gap-1 p-2">
        <button
          className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wider ${filter === 'all' ? 'bg-cave-700 text-cave-200' : 'text-cave-400 hover:text-cave-200'}`}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        {RARITIES.map((r) => (
          <button
            key={r}
            className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wider ${filter === r ? 'bg-cave-700' : 'opacity-60 hover:opacity-100'}`}
            style={{ color: RARITY_COLOR[r] }}
            onClick={() => setFilter(filter === r ? 'all' : r)}
          >
            {RARITY_LABEL[r]}
          </button>
        ))}
        <span className="tnum ml-auto pr-1 text-[10px] text-cave-400">
          {state.materials.totalDrops} found
        </span>
      </div>

      {/* Materials */}
      {owned.length === 0 && (
        <p className="px-2 py-4 text-center text-xs italic text-cave-400">
          Nothing yet but Dust. Keep chipping — the loam gives things up to those who look.
        </p>
      )}
      <div className="space-y-1">
        {owned.map(({ def, count }) => {
          const perBand = state.materials.stacks[def.id] ?? {};
          const open = expanded === def.id;
          const isPinned = pinned.has(def.id);
          return (
            <div key={def.id} className="panel px-2.5 py-1.5 transition-colors hover:border-cave-600">
              <div className="flex items-center gap-2">
                {/* RESERVE — one tap, separate control, never nested in the expand button. */}
                <button
                  onClick={() => dispatch({ type: 'togglePin', materialId: def.id })}
                  aria-pressed={isPinned}
                  data-testid={`reserve-${def.id}`}
                  title={isPinned
                    ? 'Reserved — no machine will take it. Tap to release.'
                    : 'Reserve it — nothing automatic will touch it.'}
                  aria-label={isPinned ? `Release ${def.name}` : `Reserve ${def.name}`}
                  className={`shrink-0 px-0.5 text-sm leading-none ${isPinned ? 'text-lamp-400' : 'text-cave-600 hover:text-cave-400'}`}
                >
                  {isPinned ? '★' : '☆'}
                </button>
                <button
                  onClick={() => setExpanded(open ? null : def.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <MaterialIcon id={def.id} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-xs font-semibold text-cave-200">{def.name}</span>
                      <span className="text-[9px] uppercase tracking-wider" style={{ color: RARITY_COLOR[def.rarity] }}>
                        {RARITY_LABEL[def.rarity]}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      {BANDS.map((band) => {
                        const stack = perBand[band];
                        if (!stack || stack.count === 0) return null;
                        return (
                          <span key={band} className="tnum text-[9px] text-cave-400" title={`${BAND_LABELS[band]} — avg purity ${fmtNum(stackAvg(stack), 0)}%`}>
                            {BAND_LABELS[band]} ×{stack.count}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <span className="tnum text-sm font-bold text-cave-200">{count}</span>
                </button>
              </div>
              {open && (
                <div className="mt-1.5 border-t border-cave-800 pt-1.5">
                  {traitsOf(def.id).length > 0 && (
                    <div className="mb-1 flex flex-wrap items-center gap-1">
                      <span className="text-[9px] uppercase tracking-wider text-cave-500">Traits</span>
                      {traitsOf(def.id).map((t) => <TraitTag key={t} id={t} size="xs" />)}
                    </div>
                  )}
                  {def.flavor && (
                    <div className="text-[10px] italic leading-snug text-cave-400">{def.flavor}</div>
                  )}
                </div>
              )}
              {open && <AutoRefineControl materialId={def.id} />}
            </div>
          );
        })}
      </div>

      {/* What you're short of — read back from the recipes you can already see. */}
      <ShortfallReadout />

      {/* Gems */}
      {gemsOwned.length > 0 && (
        <div className="panel p-2.5">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-cave-300">Gems</div>
          <div className="space-y-1.5">
            {gemsOwned.map((g) => (
              <div key={g.id} className="flex items-center gap-2.5">
                <GemIcon id={g.id} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold" style={{ color: g.color }}>
                    {g.name}
                    <span className="tnum ml-1.5 text-cave-300">×{state.materials.gems[g.id]}</span>
                  </div>
                  <div className="text-[9px] text-cave-400">{g.effectText} · socket at the Forge</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Geodes */}
      {(state.materials.geodes > 0 || state.materials.geodesCracked > 0) && (
        <div className="panel flex items-center gap-2.5 p-2.5">
          <GeodeIcon size={30} />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-cave-200">
              Geodes <span className="tnum text-cave-300">×{state.materials.geodes}</span>
            </div>
            <div className="text-[9px] leading-snug text-cave-400">
              Sealed until cracked. Whatever grew in the dark grew unsupervised.
            </div>
          </div>
          <HoldButton
            onConfirm={() => dispatch({ type: 'crackGeode' })}
            disabled={state.materials.geodes < 1}
            holdMs={550}
            className="btn btn-warm px-3 py-1.5 text-xs"
          >
            Crack one
          </HoldButton>
        </div>
      )}

      {/* The Assay Table */}
      <div className="panel p-2.5">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-cave-300">The Assay Table</div>
          {hunch && !surveying && (
            <button className="btn px-2.5 py-1 text-xs" onClick={() => dispatch({ type: 'startAssay' })}>
              Survey depth {state.depth} · {fmtNum(assayDuration(state, mods), 0)}s
            </button>
          )}
        </div>
        {!hunch && (
          <p className="mt-1 text-[10px] italic text-cave-400">
            A bare table with channels cut for samples. The Assayer's Hunch (Insight) would teach you to use it.
          </p>
        )}
        {surveying && (
          <div className="mt-1.5">
            <div className="text-[10px] text-cave-400">Surveying depth {surveying.depth}…</div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-cave-800">
              <div
                className="h-full rounded-full bg-moss transition-all"
                style={{
                  width: `${Math.min(100, 100 - ((surveying.endsAtPlaySec - state.stats.playTimeSec) / assayDuration(state, mods)) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}
        {state.assay.boostChips > 0 && (
          <div className="mt-1 text-[10px] text-moss">
            Vein marked: drop chance doubled for the next {state.assay.boostChips} chips.
          </div>
        )}
        {report && !surveying && (
          <div className="mt-1.5 space-y-0.5">
            <div className="text-[10px] text-cave-400">Depth {state.assay.reportDepth} reads:</div>
            {report.map((entry) => (
              <div key={entry.rarity} className="flex items-center gap-2 text-[10px]">
                <span className="w-14 uppercase tracking-wider" style={{ color: RARITY_COLOR[entry.rarity as MaterialRarity] }}>
                  {entry.rarity}
                </span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-cave-800">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${entry.share * 100}%`, background: RARITY_COLOR[entry.rarity as MaterialRarity] }}
                  />
                </div>
                <span className="w-24 truncate text-right text-cave-400">
                  {entry.materialIds.length > 0
                    ? entry.materialIds.map((id) => materialDef(id).name).join(', ')
                    : '— unseen —'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export { RARITY_COLOR, RARITY_LABEL };
