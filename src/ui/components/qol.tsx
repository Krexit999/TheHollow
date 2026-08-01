/**
 * THE CONSIDERED HAND (Phase 21) — the everywhere layer.
 *
 * Undo toast, the Collapse run-summary, the big-spend confirm, and the two
 * comfort settings (number format, confirm threshold). None of these change a
 * rate or a yield; they only catch a mistake or remember a preference.
 */
import { useEffect, useRef, useState } from 'react';
import { fmt, fmtDuration, maxToolTier, chipCurrencyId, currencyDef, type NumberFormat, type RunSummary } from '../../engine';
import { BAND_LABELS, materialDef, type PurityBand } from '../../engine/materials';
import { materialCount, TOOL_RECIPES } from '../../engine/systems/forge';
import { refineryUnlocked } from '../../engine/systems/refinery';
import { allUpgrades, upgradeLevel, costForLevels } from '../../engine/upgrades';
import { collapseRetained } from '../../engine/systems/collapseSys';
import { dispatch, useGame } from '../store';
import { Select } from './Select';

// ---------------------------------------------------------------------------
// Undo — a short window to reverse the last spend or craft.
// ---------------------------------------------------------------------------

export function UndoToast() {
  const engine = useGame((s) => s.engine);
  const rev = useGame((s) => s.rev);
  const [, tick] = useState(0);

  // The undo window closes on its own; nothing bumps rev when it does, so we
  // re-check on a light timer as well as on every dispatch (rev).
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 700);
    return () => window.clearInterval(t);
  }, []);

  const info = engine?.undoInfo?.() ?? null;
  // Read rev so the toast refreshes the instant an undoable action lands.
  void rev;
  if (!info) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[104px] z-40 flex justify-center px-3 lg:inset-x-auto lg:bottom-[118px] lg:left-4 lg:justify-start lg:px-0">
      <div className="toast-in panel pointer-events-auto flex items-center gap-3 px-3 py-2 shadow-2xl">
        <span className="text-xs text-cave-300">Undo {info.label}?</span>
        <button
          className="btn btn-warm px-3 py-1 text-xs font-semibold"
          onClick={() => dispatch({ type: 'undo' })}
        >
          Undo
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run summary — a logbook page when the shaft falls.
// ---------------------------------------------------------------------------

interface RunLedger {
  key: number;
  depth: number;
  cores: string;
  sec: number;
  prev: RunSummary | null;
  carried?: { name: string; levels: number };
}

export function RunSummaryModal() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);
  const [ledger, setLedger] = useState<RunLedger | null>(null);
  const lastSeq = useRef(-1);

  useEffect(() => {
    if (!state) return;
    for (const entry of state.feed) {
      if (entry.seq <= lastSeq.current) continue;
      lastSeq.current = entry.seq;
      const ev = entry.event;
      // A hand-pulled Collapse gets the full ledger page; an auto-collapse stays
      // out of the way (a quiet toast covers it) so an idle run isn't interrupted.
      if (ev.type === 'collapse' && !ev.auto) {
        // The carry mark was just spent — read what it saved from the run the
        // engine just banked, so the fall CONFIRMS the choice you made before it.
        const carried = state.collapse.lastRun?.carried;
        setLedger({ key: entry.seq, depth: ev.depth, cores: fmt(ev.cores), sec: ev.sec, prev: ev.prev, carried });
      }
    }
  }, [rev, state]);

  // Tell the stack a page is up, so the DisclosureGate waits its turn instead
  // of stacking a second full-screen backdrop behind this one.
  const setRunSummaryOpen = useGame((s) => s.setRunSummaryOpen);
  useEffect(() => {
    setRunSummaryOpen(ledger !== null);
    return () => setRunSummaryOpen(false);
  }, [ledger, setRunSummaryOpen]);

  if (!ledger) return null;

  const prev = ledger.prev;
  const deltaDepth = prev ? ledger.depth - prev.depth : null;
  const coresD = prev ? prev.cores : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="panel w-full max-w-sm p-5 text-center">
        <div className="text-[10px] uppercase tracking-widest text-cave-400">The shaft fell — run closed</div>
        {/*
          REPORT, DON'T RESTATE (A.45). This page used to print the payout twice
          — the headline and a "Cores pulled" line one gap below it — and then
          repeat the depth and run length the Collapse panel had previewed
          moments earlier. The pre-fall panel INFORMS the choice; this page's
          job is to confirm the result and close the loop the panel opened, so
          the delta moved onto the headline and the duplicate line is gone.
        */}
        <div className="mt-2 font-display text-3xl font-bold text-core tnum">
          +{ledger.cores} <span className="text-base font-normal">Cores</span>
          {coresD && (
            <span className="ml-1 align-middle text-sm font-normal text-cave-400">
              {relCores(coresD, ledger.cores)}
            </span>
          )}
        </div>
        <div className="mt-4 space-y-1.5 text-sm">
          <Line label="Deepest point" value={`depth ${ledger.depth}`} delta={deltaDepth} color="#8be9fd" />
          <Line label="Run length" value={fmtDuration(ledger.sec)} color="#c9a86a" />
          {ledger.carried && ledger.carried.levels > 0 && (
            <Line label="Carried through" value={`${ledger.carried.name} · ${ledger.carried.levels} levels kept`} color="#9fd8c0" />
          )}
        </div>
        {!prev && (
          <div className="mt-3 text-[11px] italic text-cave-400">
            Your first collapse recorded. The next fall will measure itself against this one.
          </div>
        )}
        <button
          className="btn btn-warm mt-5 w-full py-2 text-sm"
          onClick={() => setLedger(null)}
        >
          Begin again
        </button>
      </div>
    </div>
  );
}

/** Human "vs last run" note for Cores, comparing display strings' magnitudes. */
function relCores(prev: RunSummary['cores'], nowText: string): string | null {
  const prevText = fmt(prev);
  if (prevText === nowText) return 'same as last';
  return `last run ${prevText}`;
}

function Line({
  label, value, delta, deltaText, color,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaText?: string | null;
  color: string;
}) {
  const arrow = delta == null ? null : delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : '— even';
  const arrowColor = delta == null ? '#8a7f70' : delta > 0 ? '#9ab87a' : delta < 0 ? '#e07a6a' : '#8a7f70';
  return (
    <div className="flex items-baseline justify-between border-b border-cave-800 pb-1">
      <span className="text-xs text-cave-400">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="tnum font-semibold" style={{ color }}>{value}</span>
        {arrow && <span className="tnum text-[10px]" style={{ color: arrowColor }}>{arrow}</span>}
        {deltaText && <span className="tnum text-[10px] text-cave-500">{deltaText}</span>}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirm-on-big-spend — a single nod before a bulk buy drains your bank.
// ---------------------------------------------------------------------------

export function SpendConfirmModal() {
  const pending = useGame((s) => s.pendingSpend);
  const resolveSpend = useGame((s) => s.resolveSpend);
  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="panel w-full max-w-xs p-5 text-center">
        <div className="text-[10px] uppercase tracking-widest text-cave-400">That's a big one</div>
        <div className="mt-2 text-sm font-semibold text-cave-200">{pending.title}</div>
        <div className="mt-1 tnum text-sm text-lamp-400">{pending.detail}</div>
        <div className="mt-4 flex gap-2">
          <button className="btn flex-1 py-2 text-sm" onClick={() => resolveSpend(false)}>
            Wait
          </button>
          <button className="btn btn-warm flex-1 py-2 text-sm font-semibold" onClick={() => resolveSpend(true)}>
            Spend it
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pinned materials — surfaced first in the Hold, and glanceable outside it.
// ---------------------------------------------------------------------------

export function PinnedStrip({ compact }: { compact?: boolean }) {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const pins = state.qol.pins;
  if (pins.length === 0) return null;

  return (
    <div className={`panel flex flex-wrap items-center gap-1.5 ${compact ? 'p-1.5' : 'p-2'}`}>
      <span className="text-[9px] font-semibold uppercase tracking-widest text-lamp-400/80">Pinned</span>
      {pins.map((id) => {
        let name = id;
        try { name = materialDef(id).name; } catch { /* keep id */ }
        const count = materialCount(state, id);
        return (
          <button
            key={id}
            onClick={() => dispatch({ type: 'togglePin', materialId: id })}
            title="Unpin"
            className="tnum flex items-center gap-1 rounded-md border border-cave-700 bg-cave-950/50 px-1.5 py-0.5 text-[10px] text-cave-300 hover:border-cave-500"
          >
            <span aria-hidden className="text-lamp-500">★</span>
            <span className="truncate">{name}</span>
            <span className="font-semibold text-cave-200">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auto-refine — a standing rule per material: keep it refined up to a band.
// ---------------------------------------------------------------------------

const REFINE_TARGETS: PurityBand[] = ['fair', 'good', 'fine', 'exalted'];

export function AutoRefineControl({ materialId }: { materialId: string }) {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state || !refineryUnlocked(state)) return null;
  const preset = state.qol.refinePresets.find((p) => p.materialId === materialId);

  return (
    <div className="mt-1.5 border-t border-cave-800 pt-1.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-widest text-cave-400">Auto-refine up to</span>
        {preset && (
          <button
            onClick={() => dispatch({ type: 'toggleRefinePreset', materialId })}
            className="text-[9px] uppercase tracking-wider text-cave-400 hover:text-cave-200"
          >
            {preset.enabled ? '⏸ pause' : '▶ resume'}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => dispatch({ type: 'setRefinePreset', materialId, toBand: null })}
          aria-pressed={!preset}
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${!preset ? 'bg-cave-700 text-cave-200' : 'text-cave-400 hover:bg-cave-800'}`}
        >
          Off
        </button>
        {REFINE_TARGETS.map((b) => {
          const on = !!preset && preset.enabled && preset.toBand === b;
          const set = !!preset && preset.toBand === b;
          return (
            <button
              key={b}
              onClick={() => dispatch({ type: 'setRefinePreset', materialId, toBand: b })}
              aria-pressed={on}
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                on ? 'bg-moss/30 text-moss' : set ? 'bg-cave-800 text-cave-400' : 'text-cave-400 hover:bg-cave-800'
              }`}
            >
              {BAND_LABELS[b]}
            </button>
          );
        })}
      </div>
      {preset && !preset.enabled && (
        <div className="mt-1 text-[9px] italic text-cave-500">Paused — the rule is remembered, just idle.</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// "What am I short of" — read back from the recipes you can already see.
//
// PILLAR 5: only tool recipes at or below your current tool tier — the ones the
// Forge already shows and whose inputs are in-era materials by the curriculum
// law. It never names a material from a recipe you have not unlocked, and when
// nothing qualifies it says so rather than inventing a shopping list.
// ---------------------------------------------------------------------------

export function ShortfallReadout() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;

  const tier = maxToolTier(state);
  const visible = TOOL_RECIPES.filter((r) => r.tier <= tier);
  // Largest single-recipe shortfall per material — "the tool that wants the most
  // of this leaves you N short." Summing across recipes would over-count.
  const short = new Map<string, number>();
  for (const r of visible) {
    for (const [mat, need] of Object.entries(r.inputs)) {
      const deficit = need - materialCount(state, mat);
      if (deficit > 0) short.set(mat, Math.max(short.get(mat) ?? 0, deficit));
    }
  }
  const rows = [...short.entries()]
    .map(([mat, deficit]) => ({ mat, deficit }))
    .sort((a, b) => b.deficit - a.deficit)
    .slice(0, 6);

  return (
    <div className="panel p-2.5">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-cave-300">
        What you're short of
      </div>
      {tier < 1 || visible.length === 0 ? (
        <p className="text-[10px] italic leading-snug text-cave-400">
          No recipes to read from yet. Build the Forge and unlock a tool, and this
          will tell you what to gather.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-[10px] italic leading-snug text-cave-400">
          You have the stone for every tool you can make. Nothing to gather — go deeper.
        </p>
      ) : (
        <div className="space-y-0.5">
          {rows.map(({ mat, deficit }) => {
            let name = mat;
            try { name = materialDef(mat).name; } catch { /* keep id */ }
            return (
              <div key={mat} className="flex items-baseline justify-between text-[11px]">
                <span className="truncate text-cave-300">{name}</span>
                <span className="tnum text-lamp-400">need {deficit} more</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapse controls — last-run compare, carry-one, and auto-collapse depth.
// ---------------------------------------------------------------------------

export function CollapseControls() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [acdInput, setAcdInput] = useState('');
  if (!state) return null;

  const last = state.collapse.lastRun;
  const carry = state.qol.carryUpgradeId;
  // Only resetting face upgrades the player actually has levels in can be carried.
  const carriable = allUpgrades().filter((u) => u.resetsOnCollapse && upgradeLevel(state, u.id) > 0);
  const carryDef = carry ? allUpgrades().find((u) => u.id === carry) : null;
  // What carrying an upgrade SAVES — the rebuild you skip, priced in the chip
  // currency the fall would make you re-earn. This is the whole value of the
  // choice, and it was invisible; showing it is the fix (the power was fine).
  const retained = collapseRetained(state);
  const chipCur = currencyDef(chipCurrencyId(state));
  const carryValue = (id: string) => {
    const def = allUpgrades().find((u) => u.id === id);
    const lvl = upgradeLevel(state, id);
    const levels = Math.max(0, lvl - retained);
    return { levels, cost: def ? costForLevels(def, retained, levels) : null };
  };
  const acd = state.qol.autoCollapseDepth;

  return (
    <div className="panel space-y-3 p-3">
      {/*
        THE THIRD SURFACE, FOLDED (A.45).
        This card used to restate the last fall's depth, Cores and run length —
        and by then all three had been said twice: the RunSummaryModal reports
        them the moment the fall lands, and the Collapse panel now shows the
        live run WITH deltas against exactly these numbers, which is the same
        comparison in the form that actually informs the next decision.
        What survives is the one line neither of those covers usefully: whether
        the carry you chose last time did anything. It belongs HERE, directly
        above the control that picks the next one, and nowhere else.
      */}
      {last?.carried && last.carried.levels > 0 && (
        <div className="rounded-md border border-[#9fd8c0]/25 bg-[#9fd8c0]/5 px-2 py-1.5 text-[11px] text-[#9fd8c0]">
          Last fall carried <span className="font-semibold">{last.carried.name}</span>
          {' '}— {last.carried.levels} levels kept.
        </div>
      )}

      {/* Carry one thing */}
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-widest text-cave-400">Carry one upgrade through the next fall</div>
        {carriable.length === 0 ? (
          <div className="text-[10px] italic text-cave-500">No face upgrades to carry yet.</div>
        ) : (
          <>
            <Select
              className="w-full"
              ariaLabel="Upgrade to carry through the next fall"
              value={carry ?? ''}
              onChange={(v) => dispatch({ type: 'setCarryUpgrade', upgradeId: v || null })}
              options={[
                { value: '', label: '— carry nothing —' },
                ...carriable.map((u) => {
                  const v = carryValue(u.id);
                  const worth = v.cost && v.levels > 0 ? ` · saves ${fmt(v.cost)} ${chipCur.name}` : '';
                  return { value: u.id, label: `${u.name} · Lv ${upgradeLevel(state, u.id)}${worth}` };
                }),
              ]}
            />
            {(() => {
              if (!carryDef) {
                return (
                  <div className="mt-1 text-[10px] italic leading-snug text-cave-500">
                    One upgrade rides the fall at full level while the rest drop to Lv {retained} — pick the one
                    that cost you the most to build. The value of each is shown above; the mark is spent on the fall.
                  </div>
                );
              }
              const v = carryValue(carryDef.id);
              return (
                <div className="mt-1 rounded border border-[#9fd8c0]/25 bg-[#9fd8c0]/5 px-2 py-1 text-[10px] leading-snug text-cave-300">
                  Carrying <span className="text-[#9fd8c0]">{carryDef.name}</span> skips re-buying{' '}
                  <span className="text-cave-100">{v.levels} levels</span> next run —
                  {v.cost ? <> about <span className="tnum text-[#9fd8c0]">{fmt(v.cost)} {chipCur.name}</span> of the climb back.</> : ' its full level.'}{' '}
                  Everything else falls to Lv {retained}. The mark is spent on the fall.
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* Auto-collapse depth */}
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-widest text-cave-400">Auto-collapse</div>
        {acd != null ? (
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-cave-300">Collapsing itself at depth <span className="tnum font-semibold text-[#8be9fd]">{acd}</span>.</span>
            <button className="btn px-2 py-1 text-[10px]" onClick={() => dispatch({ type: 'setAutoCollapseDepth', depth: null })}>
              Turn off
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={26}
              value={acdInput}
              onChange={(e) => setAcdInput(e.target.value)}
              placeholder="depth ≥ 26"
              className="min-w-0 flex-1 rounded border border-cave-700 bg-cave-950 px-2 py-1 text-[11px] text-cave-200 placeholder:text-cave-600"
            />
            <button
              className="btn px-2 py-1 text-[11px]"
              disabled={!(Number(acdInput) >= 1)}
              onClick={() => { dispatch({ type: 'setAutoCollapseDepth', depth: Number(acdInput) }); setAcdInput(''); }}
            >
              Set
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comfort settings — number format + confirm threshold (lives in the Vault).
// ---------------------------------------------------------------------------

const FORMAT_OPTS: { id: NumberFormat; label: string; sample: string }[] = [
  { id: 'suffix', label: 'Suffix', sample: '1.25M' },
  { id: 'scientific', label: 'Scientific', sample: '1.25e6' },
  { id: 'engineering', label: 'Engineering', sample: '1.25e6' },
];

const CONFIRM_OPTS: { frac: number; label: string }[] = [
  { frac: 0, label: 'Off' },
  { frac: 0.5, label: 'Half' },
  { frac: 0.75, label: '¾' },
  { frac: 0.9, label: '90%' },
];

export function ComfortSettings() {
  const state = useGame((s) => s.state);
  const numberFormat = useGame((s) => s.numberFormat);
  const setNumberFormat = useGame((s) => s.setNumberFormat);
  useGame((s) => s.rev);
  if (!state) return null;
  const frac = state.qol.confirmSpendFrac;

  return (
    <div className="panel space-y-3 p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-cave-300">Comfort</div>

      <div>
        <div className="mb-1 text-[11px] text-cave-400">Big numbers read as</div>
        <div className="flex overflow-hidden rounded-md border border-cave-700" role="group" aria-label="Number format">
          {FORMAT_OPTS.map((o) => (
            <button
              key={o.id}
              onClick={() => setNumberFormat(o.id)}
              aria-pressed={numberFormat === o.id}
              className={`flex-1 px-2 py-1 text-[11px] font-semibold transition-colors ${
                numberFormat === o.id ? 'bg-cave-700 text-lamp-300' : 'text-cave-400 hover:bg-cave-800'
              }`}
            >
              {o.label}
              <span className="ml-1 tnum text-[9px] opacity-60">{o.sample}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-[11px] text-cave-400">
          Ask before a bulk buy costs this share of your bank
        </div>
        <div className="flex overflow-hidden rounded-md border border-cave-700" role="group" aria-label="Confirm threshold">
          {CONFIRM_OPTS.map((o) => (
            <button
              key={o.frac}
              onClick={() => dispatch({ type: 'setConfirmSpendFrac', frac: o.frac })}
              aria-pressed={frac === o.frac}
              className={`flex-1 px-2 py-1 text-[11px] font-semibold transition-colors ${
                frac === o.frac ? 'bg-cave-700 text-lamp-300' : 'text-cave-400 hover:bg-cave-800'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="mt-1 text-[10px] italic leading-snug text-cave-500">
          Only ×10 and MAX buys of a repeatable upgrade — never a single tap.
        </div>
      </div>
    </div>
  );
}
