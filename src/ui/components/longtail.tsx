import { useState } from 'react';
/**
 * THE LONG TAIL (Phase 12) — the Spiral, the Automation Grid, Relics, the
 * Museum and the Expeditions. Built to the Phase 11 pattern: the central
 * SystemHeader supplies Layer 1 and Layer 2, so these panels carry the numbers
 * and the controls and never repeat their own title.
 *
 * A.50: Relics and the Museum came BACK here. A.49 rebuilt them as rendered
 * Pixi surfaces and they played as grey shapes in boxes; the engine work under
 * them was sound and was kept whole, so this is a presentation-only reversal.
 */
import { getCurrency } from '../../engine';
import type { GameState, RelicInstance } from '../../engine/types';
import { spiralPending, gridSlotCost, licenceCost, canSpiral } from '../../engine/systems/spiral';
import {
  RARITIES, RELIC_SLOTS, AFFIXES, SOURCE_BY_ID, RESONANCES, activeResonances,
  shardValue, effectiveAffixes, fusionPreview, fusionAfford,
  WAKING_STEPS, wakingOf, wakingStep, wakingNeed,
} from '../../engine/systems/relics';
import { powerOf, powerLive } from '../../engine/systems/relicPowers';
import {
  activeConfluences, CONFLUENCE_BY_ID, CONFLUENCE_RANK_CAP, confluenceAmp,
  confluenceRankCost, confluenceSlotCap, confluenceSlotCost,
} from '../../engine/systems/confluence';
import { dispatch, useGame } from '../store';
import { Amount, HoldButton, BUCKET_NAME } from './shared';

/**
 * YOUR OWN MARGINS — the confluence codex. Used to live in Sable's Journal;
 * the guild's cut took the journal with it, but a confluence is not a guild
 * feature (relics/[[refinery]]/forge crossings), so its one surface moved
 * here rather than going down with the room that happened to host it.
 */
function ConfluenceCodex() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const found = state.confluences.found;
  const hinted = state.confluences.hinted.filter((id) => !found.includes(id));
  if (found.length === 0 && hinted.length === 0) return null;
  const live = new Set(activeConfluences(state as GameState).map((c) => c.id));

  const slots = state.confluences.slots;
  const cap = confluenceSlotCap(state as GameState);
  const echoes = getCurrency(state as GameState, 'echo');
  const emptyIdx = slots
    .map((sl, i) => ({ sl, i }))
    .filter(({ sl }) => sl.id === null)
    .sort((a, b) => b.sl.rank - a.sl.rank)[0]?.i;
  const slotOf = (id: string) => slots.findIndex((sl) => sl.id === id);
  const anyEchoesEver = state.shell.breachCount >= 2;

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

      {anyEchoesEver && (
        <div className="mt-2 border-l-2 border-[#d8ccf0]/50 pl-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 text-[11px] text-cave-400">
              <span className="font-semibold text-cave-200">Attention</span>
              <span className="tnum ml-2">{slots.filter((sl) => sl.id !== null).length}/{slots.length} held</span>
              <span className="ml-2 text-cave-500">Echoes: <Amount value={echoes} color="#d8ccf0" /></span>
            </div>
            {slots.length < cap ? (
              <button
                className="btn shrink-0 px-2 py-0.5 text-[10px]"
                disabled={echoes.lt(confluenceSlotCost(state as GameState))}
                onClick={() => dispatch({ type: 'confluenceBuySlot' })}
              >
                Widen · <Amount value={confluenceSlotCost(state as GameState)} color="#d8ccf0" /> Echo
              </button>
            ) : (
              <span className="shrink-0 text-[9px] uppercase tracking-wider text-cave-500">
                the next signature widens it
              </span>
            )}
          </div>
          <div className="text-[10px] leading-snug text-cave-500">
            A note you dwell on pays ×2 while it holds — deepened, up to ×3. One slot for
            yourself, one per carried signature. Re-choosing is free and keeps the depth.
          </div>
        </div>
      )}

      <div className="mt-2 space-y-1.5">
        {found.map((id) => {
          const def = CONFLUENCE_BY_ID.get(id);
          if (!def) return null;
          const on = live.has(id);
          const si = slotOf(id);
          const dwelt = si >= 0;
          const amp = confluenceAmp(state as GameState, id);
          return (
            <div key={id} className={`border-l-2 pl-2 ${on ? 'border-[#c8b48a]' : 'border-cave-700'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-xs font-semibold ${on ? 'text-cave-200' : 'text-cave-400'}`}>{def.name}</span>
                <span className="shrink-0 text-[9px] uppercase tracking-wider text-cave-500">
                  {dwelt && <span className="mr-1.5 text-[#d8ccf0]">dwelt ×{amp}</span>}
                  {on ? <span className="text-[#c8b48a]">holding</span> : 'quiet'}
                </span>
              </div>
              <div className="text-[10px] italic leading-snug text-cave-400">{def.flavor}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-cave-500">
                <span>{def.systems[0]} × {def.systems[1]}</span>
                {on && (
                  <span className="text-[#c8b48a]">
                    +{Math.round(def.bonus * amp * 100)}% {BUCKET_NAME[def.bucket]}
                  </span>
                )}
                {slots.length > 0 && (dwelt ? (
                  <>
                    {slots[si]!.rank < CONFLUENCE_RANK_CAP && (
                      <button
                        className="btn px-1.5 py-0 text-[9px]"
                        disabled={echoes.lt(confluenceRankCost(slots[si]!))}
                        onClick={() => dispatch({ type: 'confluenceBuyRank', slot: si })}
                      >
                        Deepen · <Amount value={confluenceRankCost(slots[si]!)} color="#d8ccf0" />
                      </button>
                    )}
                    <button
                      className="btn px-1.5 py-0 text-[9px]"
                      onClick={() => dispatch({ type: 'confluenceSetSlot', slot: si, id: null })}
                    >
                      Let go
                    </button>
                  </>
                ) : (
                  <button
                    className="btn px-1.5 py-0 text-[9px]"
                    disabled={emptyIdx === undefined}
                    title={emptyIdx === undefined ? 'Every slot is held — let one go first' : undefined}
                    onClick={() => emptyIdx !== undefined
                      && dispatch({ type: 'confluenceSetSlot', slot: emptyIdx, id })}
                  >
                    Dwell
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {hinted.map((id) => {
          const def = CONFLUENCE_BY_ID.get(id);
          if (!def) return null;
          return (
            <div key={id} className="border-l-2 border-dashed border-cave-700 pl-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs italic text-cave-400">{def.systems[0]} × {def.systems[1]}</span>
                <span className="shrink-0 text-[9px] uppercase tracking-wider text-cave-600">a margin note</span>
              </div>
              <div className="text-[10px] italic leading-snug text-cave-500">
                Something happens where these meet. It hasn't said what.
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const useLive = () => {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  return state;
};

// ---------------------------------------------------------------------------
// The Spiral — the reset itself, plus the challenges you play by hand
// ---------------------------------------------------------------------------

export function SpiralPanel() {
  const state = useLive();
  if (!state) return null;
  const pending = spiralPending(state);
  const held = getCurrency(state, 'spiral');

  return (
    <div className="space-y-2">
      {/* The wind itself */}
      <div className="panel p-4 text-center">
        <div className="text-[10px] uppercase tracking-widest text-cave-400">Wind the world</div>
        <div className="mt-2 font-display text-3xl font-bold tnum" style={{ color: '#c9b8f0' }}>
          +{pending} <span className="text-base font-normal">Spiral</span>
        </div>
        <div className="mt-1 text-[11px] text-cave-400 tnum">
          ⌊√(TotalAxioms) × Recursions⌋ — {state.recursion.axiomsEarned} axioms, {state.recursion.count} recursions
        </div>
        <HoldButton
          onConfirm={() => dispatch({ type: 'spiral' })}
          disabled={!canSpiral(state)}
          holdMs={1100}
          className="btn mt-3 w-full border-[#c9b8f0]/40 py-2.5 text-sm font-semibold text-[#c9b8f0]"
        >
          {canSpiral(state) ? 'Hold to Spiral' : 'Nothing more to wind'}
        </HoldButton>
        <div className="mt-2 text-[11px] leading-relaxed text-cave-400">
          The laws you wrote wash away and the Axiom bank empties. Records, the Delver, the
          Lamphouse, every Codex, your tools and everything in the Museum survive — as they
          do through a Recursion. You are trading rules for capacity.
        </div>
      </div>

      {/* Capacity */}
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#c9b8f0' }}>Capacity</span>
          <span className="tnum text-[10px] text-cave-400">
            <Amount value={held} color="#c9b8f0" /> Spiral held
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            className="btn py-2 text-xs"
            disabled={held.lt(gridSlotCost(state.spiral.slots))}
            onClick={() => dispatch({ type: 'buyGridSlot' })}
          >
            Grid slot · {gridSlotCost(state.spiral.slots)}
            <span className="ml-1 opacity-60">({state.spiral.slots} owned)</span>
          </button>
          <button
            className="btn py-2 text-xs"
            disabled={held.lt(licenceCost(state.spiral.licences))}
            onClick={() => dispatch({ type: 'buyLicence' })}
          >
            World licence · {licenceCost(state.spiral.licences)}
            <span className="ml-1 opacity-60">({state.spiral.licences} owned)</span>
          </button>
        </div>
      </div>

    </div>
  );
}

// Automation Grid and parallel-shells UI removed — their content
// (gridModules.ts) and licensing (spiral.ts's shell-licensing actions) are
// gone.

// ---------------------------------------------------------------------------
// Relics (A.51 restyle — same wiring, the reference layout)
// ---------------------------------------------------------------------------
/**
 * A.50 brought these back as a panel and it was legible but shapeless: a stack
 * of identical cards where nothing said which relic was the good one without
 * reading every word. This is a PRESENTATION pass over that panel and nothing
 * else — every control still dispatches the same engine action it did.
 *
 * What the layout is doing:
 *  - RARITY IS A COLOURED EDGE, not a word you have to find. The left border of
 *    a setting is the relic's band, so six settings read as a build at a
 *    glance.
 *  - THE POWER IS THE NAME. A relic's identity is its power ("Second Bite"),
 *    not its rarity, so that is the heading and its readout is the one line of
 *    body text. Powerless relics fall back to "<Rarity> relic" and their affix
 *    lines, because that is genuinely all they are.
 *  - AWAKENING IS A BAR AND A CLOCK. "30m carried to go" is a sentence you
 *    parse; a filling bar with 1:38:28 beside it is a thing you glance at.
 *  - FUSION IS A BENCH, not a menu that drops out of a card. Keeper and feeder
 *    sit in two slots and the difference between them is a table, so the
 *    decision is visible before the click instead of inside a list item.
 */

/** The rarity ramp: grey → moss → gold → violet → pale. Used for the edge, the
 *  word, and the glyph, so one relic is one colour everywhere it appears. */
const RARITY_HUE = ['#8a7f70', '#9ab87a', '#e2b35a', '#b98cd8', '#cdd9ff'];
const rarityHue = (r: number) => RARITY_HUE[Math.max(0, Math.min(4, r))]!;

/** A section rule: a tiny label, then a hairline to the right margin. */
function Rule({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="mt-3 mb-1.5 flex items-center gap-2">
      <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-cave-400">{label}</span>
      <span className="h-px min-w-2 flex-1 bg-cave-700" />
      {right}
    </div>
  );
}

/** h:mm:ss / m:ss — a clock reads faster than "30m carried to go". */
function clock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
    : `${m}:${String(r).padStart(2, '0')}`;
}

/** How far along this relic is toward its next waking step, 0..1. */
function wakingFill(relic: RelicInstance): number {
  const step = wakingOf(relic);
  const next = WAKING_STEPS[step + 1];
  if (!next) return 1;
  const from = WAKING_STEPS[step]!.at;
  return Math.max(0, Math.min(1, ((relic.charge ?? 0) - from) / Math.max(1, next.at - from)));
}

/** The one line that says what a relic DOES. Its power if it has one (that is
 *  the relic), otherwise its effect lines (that is all it has). */
function effectSummary(state: GameState, relic: RelicInstance): string {
  const pw = powerOf(relic);
  if (pw && powerLive(relic)) return pw.readout(state);
  if (pw) return 'Something in it has not woken. Carry it and find out what.';
  const lines = Object.entries(effectiveAffixes(relic))
    .map(([k, v]) => `${AFFIXES[k]?.label ?? k} +${Math.round(v * 100)}%`);
  return lines.length ? lines.join(' · ') : 'Nothing it will admit to.';
}

/** Where it came up, compressed to one dim line. */
function originLine(relic: RelicInstance): string {
  const src = SOURCE_BY_ID.get(relic.source)?.name ?? relic.source;
  if (!relic.found) return `${src} · unrecorded`;
  const by = relic.found.by ? ` · ${relic.found.by}` : '';
  return `${src} · depth ${relic.found.depth}${by}`;
}

const relicName = (relic: RelicInstance): string =>
  powerOf(relic)?.name ?? `${RARITIES[relic.rarity]} relic`;

// ---------------------------------------------------------------------------

export function RelicsPanel() {
  const state = useLive();
  const [keeper, setKeeper] = useState<number | null>(null);
  const [feeder, setFeeder] = useState<number | null>(null);
  const [sort, setSort] = useState<'rarity' | 'newest' | 'source'>('rarity');
  if (!state) return null;

  const held = state.relics.held;
  const equipped = state.relics.equipped;
  const spare = held.filter((r) => !equipped.includes(r.uid));
  const cores = Math.floor(getCurrency(state, 'core').toNumber());
  const live = (uid: number | null) => (uid === null ? null : held.find((r) => r.uid === uid) ?? null);

  // The bench drops anything that has left the hold (fused, scrapped, worn off).
  const keepRelic = live(keeper);
  const feedRelic = live(feeder);

  const sorted = [...spare].sort((a, b) => {
    if (sort === 'newest') return b.uid - a.uid;
    if (sort === 'source') return a.source.localeCompare(b.source) || b.rarity - a.rarity;
    return b.rarity - a.rarity || b.uid - a.uid;
  });

  /** FUSE on a held row fills the first empty slot on the bench. */
  const stage = (uid: number) => {
    if (keeper === null || keeper === uid) { setKeeper(uid); if (feeder === uid) setFeeder(null); return; }
    setFeeder(feeder === uid ? null : uid);
  };

  return (
    <div className="panel px-3 pb-3 pt-2.5">
      {/* EQUIPPED — six settings, filled or empty. The two purses ride this
          rule rather than a header of their own: the central SystemHeader
          already prints "Relics · 3/6 worn · 11 held" directly above, and
          this file's rule is that a panel never repeats its own title. */}
      <Rule
        label="Equipped"
        right={
          <div className="tnum flex shrink-0 items-baseline gap-2.5 text-[12px]">
            <span className="text-[#d8b8ee]" title="Shards — what a fusion costs">◆ {Math.floor(state.relics.shards).toLocaleString()}</span>
            <span className="text-[#e8c98a]" title="Cores — spent only on a fusion that lifts a rarity">✦ {cores}</span>
          </div>
        }
      />
      {Array.from({ length: RELIC_SLOTS }, (_, slot) => {
        const relic = live(equipped[slot] ?? null);
        if (!relic) {
          return (
            <div key={`empty${slot}`} className="mt-1.5 flex items-center gap-2 rounded-md border border-dashed border-cave-700 px-2.5 py-2">
              <span className="flex-1 text-[10px] uppercase tracking-[0.16em] text-cave-600">Empty setting</span>
              <span className="text-[10px] text-cave-600">
                {spare.length > 0 ? 'wear one from the hold below' : 'nothing spare to set'}
              </span>
            </div>
          );
        }
        return <Setting key={relic.uid} state={state} relic={relic} slot={slot} />;
      })}

      {/* RESONANCE — the rite card. Found by wearing, never listed first. */}
      {(activeResonances(state).length > 0 || state.relics.resonancesFound.length > 0) && (
        <>
          <Rule label="Resonance" />
          {RESONANCES.filter((res) => state.relics.resonancesFound.includes(res.id)).map((res) => {
            const wearing = equipped
              .map((uid) => held.find((r) => r.uid === uid))
              .filter((r) => r?.source === res.source).length;
            const on = wearing >= res.need;
            return (
              <div
                key={res.id}
                className="mt-1.5 rounded-md border px-2.5 py-2"
                style={{
                  borderColor: on ? 'rgba(226,179,90,0.45)' : 'var(--color-cave-700)',
                  background: on ? 'rgba(226,179,90,0.06)' : 'transparent',
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`font-display text-[13px] ${on ? 'text-[#e8c98a]' : 'text-cave-400'}`}>{res.name}</span>
                  <span className={`shrink-0 text-[9px] uppercase tracking-[0.16em] ${on ? 'text-[#e8c98a]' : 'text-cave-600'}`}>
                    {on ? 'Firing' : 'Not firing'}
                  </span>
                </div>
                {/* Segments, not a percentage: the requirement is a small count. */}
                <div className="mt-1 flex items-center gap-1.5">
                  {Array.from({ length: res.need }, (_, i) => (
                    <span
                      key={i}
                      className="h-0.5 w-5 rounded-full"
                      style={{ background: i < wearing ? '#e2b35a' : 'var(--color-cave-700)' }}
                    />
                  ))}
                  <span className="tnum ml-1 text-[10px] text-cave-500">{Math.min(wearing, res.need)} / {res.need}</span>
                </div>
                <div className="mt-1 text-[11px] text-cave-300">
                  +{Math.round((res.mult - 1) * 100)}% to every line on relics from {SOURCE_BY_ID.get(res.source)?.name ?? res.source}
                </div>
                <div className="mt-0.5 text-[10px] italic leading-snug text-cave-500">
                  {on ? res.line : `Wear ${res.need} from ${SOURCE_BY_ID.get(res.source)?.name ?? res.source} to complete the rite.`}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* HELD — the pile you draw from and feed the bench with. */}
      <Rule
        label="Held"
        right={
          <div className="flex shrink-0 gap-0.5">
            {(['rarity', 'newest', 'source'] as const).map((k) => (
              <button
                key={k}
                className={`rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] transition-colors ${
                  sort === k ? 'border-lamp-500/50 text-lamp-300' : 'border-transparent text-cave-500 hover:text-cave-300'
                }`}
                aria-pressed={sort === k}
                onClick={() => setSort(k)}
              >
                {k === 'newest' ? 'New' : k}
              </button>
            ))}
          </div>
        }
      />
      {sorted.length === 0 && (
        <p className="mt-1 text-[11px] italic leading-snug text-cave-500">
          Nothing spare. They come up out of the deep shaft, out of Warrens, out of
          wells, and back with the crews.
        </p>
      )}
      {sorted.map((r) => (
        <HeldRow
          key={r.uid}
          state={state}
          relic={r}
          staged={r.uid === keeper ? 'keeper' : r.uid === feeder ? 'feeder' : null}
          onFuse={() => stage(r.uid)}
        />
      ))}

      {/* THE BENCH — keeper, feeder, and the difference between them. */}
      <Rule label="Fusion" />
      <FusionBench
        state={state}
        keeper={keepRelic}
        feeder={feedRelic}
        onClear={() => { setKeeper(null); setFeeder(null); }}
        onFused={() => setFeeder(null)}
      />

      {/* AUTO-SCRAP — the standing order. */}
      <AutoScrap state={state} />

      <ConfluenceCodex />
    </div>
  );
}

/** One filled setting: the coloured edge, the power, the bar, the clock. */
function Setting({ state, relic, slot }: { state: GameState; relic: RelicInstance; slot: number }) {
  const hue = rarityHue(relic.rarity);
  const step = wakingStep(relic);
  const need = wakingNeed(relic);
  const fill = wakingFill(relic);
  return (
    <div
      className="mt-1.5 rounded-md border border-cave-700 bg-cave-900/60 px-2.5 py-2"
      style={{ borderLeft: `3px solid ${hue}` }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-display text-[14px] text-cave-100">
          {relic.locked && <span className="mr-1 text-[#e6c15a]" title="Locked — a fusion can never eat it">🔒</span>}
          {relicName(relic)}
        </span>
        <span className="shrink-0 text-[9px] uppercase tracking-[0.16em]" style={{ color: hue }}>
          {RARITIES[relic.rarity]}
        </span>
      </div>
      <div className="mt-1 text-[11px] leading-snug text-cave-300">{effectSummary(state, relic)}</div>
      <div className="mt-0.5 text-[10px] text-cave-500">{originLine(relic)}</div>

      {/* Awakening: state, bar, and either a countdown or "held" at the top. */}
      <div className="mt-1.5 flex items-center gap-2">
        <span
          className="shrink-0 text-[9px] uppercase tracking-[0.16em]"
          style={{ color: wakingOf(relic) === 0 ? 'var(--color-cave-600)' : '#9fd8c0' }}
        >
          {step.name}
        </span>
        <span className="h-0.5 flex-1 overflow-hidden rounded-full bg-cave-800">
          <span
            className="block h-full rounded-full"
            style={{ width: `${Math.round(fill * 100)}%`, background: wakingOf(relic) === 0 ? '#6b6152' : '#9fd8c0' }}
          />
        </span>
        <span className="tnum shrink-0 text-[10px] text-cave-500">{need === null ? 'held' : clock(need)}</span>
      </div>

      <div className="mt-1.5 flex justify-end gap-1.5">
        <LockButton relic={relic} />
        <button
          className="btn px-3 py-1 text-[10px] uppercase tracking-[0.12em]"
          onClick={() => dispatch({ type: 'unequipRelic', slot })}
        >
          Take off
        </button>
      </div>
    </div>
  );
}

/** One held relic: a compact row, and the three things you can do to it. */
function HeldRow({ state, relic, staged, onFuse }: {
  state: GameState; relic: RelicInstance; staged: 'keeper' | 'feeder' | null; onFuse: () => void;
}) {
  const hue = rarityHue(relic.rarity);
  const full = state.relics.equipped.length >= RELIC_SLOTS;
  return (
    <div className={`mt-1.5 rounded-md border px-2.5 py-1.5 ${staged ? 'border-lamp-500/50 bg-lamp-500/5' : 'border-cave-800'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[12px] text-cave-200">
          <span className="mr-1" style={{ color: hue }}>◆</span>
          {relic.locked && <span className="mr-1 text-[#e6c15a]">🔒</span>}
          {relicName(relic)}
        </span>
        <span className="shrink-0 text-[9px] uppercase tracking-[0.16em]" style={{ color: hue }}>
          {staged ?? RARITIES[relic.rarity]}
        </span>
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-2 text-[10px] text-cave-500">
        <span className="min-w-0 truncate">{originLine(relic)}</span>
        <span className="tnum shrink-0">
          {wakingStep(relic).name.toLowerCase()}
          {relic.fusedFrom > 0 && <span className="ml-1 text-cave-600">· {relic.fusedFrom} fused in</span>}
        </span>
      </div>
      <div className="mt-1.5 grid grid-cols-4 gap-1">
        <button
          className="btn px-1 py-1 text-[10px] uppercase tracking-[0.1em]"
          disabled={full}
          title={full ? 'All six settings are full — take one off first' : undefined}
          onClick={() => dispatch({ type: 'equipRelic', uid: relic.uid, slot: state.relics.equipped.length })}
        >
          Wear
        </button>
        <button
          className={`btn px-1 py-1 text-[10px] uppercase tracking-[0.1em] ${staged ? 'btn-warm' : ''}`}
          onClick={onFuse}
        >
          Fuse
        </button>
        <button
          className={`btn px-1 py-1 text-[10px] uppercase tracking-[0.1em] ${relic.locked ? 'btn-warm' : ''}`}
          aria-pressed={!!relic.locked}
          onClick={() => dispatch({ type: 'toggleRelicLock', uid: relic.uid })}
        >
          {relic.locked ? 'Unlock' : 'Lock'}
        </button>
        <button
          className="btn px-1 py-1 text-[10px] uppercase tracking-[0.1em]"
          disabled={!!relic.locked}
          title={relic.locked ? 'Locked' : `Render it down for ${shardValue(relic)} shards. Gone for good.`}
          onClick={() => dispatch({ type: 'renderRelic', uid: relic.uid })}
        >
          Scrap {shardValue(relic)}
        </button>
      </div>
    </div>
  );
}

/** One row of the keeper-vs-feeder table. */
function DiffRow({ label, value, warm }: { label: string; value: string; warm?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-t border-cave-800 py-1 first:border-t-0">
      <span className="shrink-0 text-[9px] uppercase tracking-[0.16em] text-cave-500">{label}</span>
      <span className={`min-w-0 truncate text-right text-[11px] ${warm ? 'text-lamp-300' : 'text-cave-400'}`}>{value}</span>
    </div>
  );
}

function Slot({ label, relic, placeholder }: { label: string; relic: RelicInstance | null; placeholder: string }) {
  return (
    <div className={`min-w-0 flex-1 rounded-md border px-2 py-1.5 ${relic ? 'border-cave-600 bg-cave-900/60' : 'border-dashed border-cave-700'}`}
      style={relic ? { borderLeft: `3px solid ${rarityHue(relic.rarity)}` } : undefined}>
      <div className="text-[9px] uppercase tracking-[0.16em] text-cave-500">{label}</div>
      {relic ? (
        <>
          <div className="mt-0.5 truncate text-[12px] text-cave-200">{relicName(relic)}</div>
          <div className="truncate text-[10px]" style={{ color: rarityHue(relic.rarity) }}>{RARITIES[relic.rarity]}</div>
        </>
      ) : (
        <div className="mt-0.5 text-[10px] italic leading-snug text-cave-600">{placeholder}</div>
      )}
    </div>
  );
}

/**
 * THE BENCH. Same `fuseRelics` dispatch the drop-down chooser made; the change
 * is that the keeper and the feeder are both on screen with the difference
 * between them spelled out, so the decision happens before the click.
 */
function FusionBench({ state, keeper, feeder, onClear, onFused }: {
  state: GameState;
  keeper: RelicInstance | null;
  feeder: RelicInstance | null;
  onClear: () => void;
  onFused: () => void;
}) {
  const pv = keeper && feeder ? fusionPreview(state, keeper.uid, feeder.uid) : null;
  const af = keeper ? fusionAfford(state, keeper, feeder ?? undefined) : null;
  const blocked = !keeper || !feeder || !af?.ok || !!pv?.gatedBy || !!feeder.locked;

  const linesLine = !pv ? '–'
    : [
      pv.gained.length ? `${pv.gained.length} gained` : '',
      pv.improved.length ? `${pv.improved.length} improved` : '',
      pv.wasted.length ? `${pv.wasted.length} already beaten` : '',
    ].filter(Boolean).join(' · ') || 'nothing it does not already beat';

  return (
    <div className="rounded-md border border-cave-800 px-2.5 py-2">
      <div className="flex items-stretch gap-1.5">
        <Slot label="Keeper" relic={keeper} placeholder="tap FUSE on a held relic" />
        <span className="self-center text-[13px] text-cave-600">+</span>
        <Slot label="Feeder" relic={feeder} placeholder="consumed on fuse" />
      </div>

      <div className="mt-2">
        <DiffRow
          label="Rarity"
          warm={!!pv?.rarityUp}
          value={!keeper ? '–' : !feeder ? RARITIES[keeper.rarity]!
            : pv?.rarityUp ? `${RARITIES[keeper.rarity]} → ${RARITIES[feeder.rarity]}` : `${RARITIES[keeper.rarity]} (no change)`}
        />
        <DiffRow label="Lines" value={linesLine} warm={!!pv && (pv.gained.length > 0 || pv.improved.length > 0)} />
        <DiffRow
          label="Power"
          warm={!!pv?.powerGained}
          value={pv?.powerGained ? `takes ${pv.powerGained}`
            : keeper ? (powerOf(keeper)?.name ?? 'none — a lift to Rare would give it one') : '–'}
        />
        <DiffRow
          label="Awakening"
          value={!keeper ? '–' : `keeps ${wakingStep(keeper).name}${feeder ? ' — the feeder\'s is lost' : ''}`}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="tnum text-[11px]">
          <span className={af && af.price.shards <= state.relics.shards ? 'text-[#d8b8ee]' : 'text-amber-400'}>
            ◆ {af ? af.price.shards : '–'}
          </span>
          <span className="mx-1.5 text-cave-700">·</span>
          <span className={!af || af.price.cores === 0 ? 'text-cave-500' : 'text-[#e8c98a]'}>
            ✦ {af ? af.price.cores : 0}
          </span>
        </span>
        <div className="flex shrink-0 gap-1.5">
          <button className="btn px-3 py-1 text-[10px] uppercase tracking-[0.12em]" disabled={!keeper && !feeder} onClick={onClear}>
            Clear
          </button>
          <button
            className={`btn px-4 py-1 text-[10px] uppercase tracking-[0.12em] ${blocked ? '' : 'btn-warm'}`}
            disabled={blocked}
            onClick={() => { dispatch({ type: 'fuseRelics', keepUid: keeper!.uid, feedUid: feeder!.uid }); onFused(); }}
          >
            Fuse
          </button>
        </div>
      </div>

      <p className="mt-1 text-[10px] italic leading-snug text-cave-500">
        {pv?.gatedBy
          ? `Raising it that far is learned from the halls — ${pv.gatedBy.need} filled (${pv.gatedBy.have} done).`
          : feeder?.locked
            ? 'That feeder is locked. Unlock it, or pick another.'
            : af && !af.ok
              ? `Short ${af.short.join(' and ')}.`
              : 'Cores are spent only when the feeder lifts the keeper a rarity.'}
      </p>
    </div>
  );
}

function LockButton({ relic }: { relic: RelicInstance }) {
  return (
    <button
      className={`btn px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] ${relic.locked ? 'btn-warm' : ''}`}
      title={relic.locked ? 'Locked — a fusion can never eat it. Click to unlock.' : 'Lock it — a fusion can never eat it.'}
      aria-pressed={!!relic.locked}
      onClick={() => dispatch({ type: 'toggleRelicLock', uid: relic.uid })}
    >
      {relic.locked ? 'Unlock' : 'Lock'}
    </button>
  );
}

/** Four-letter bands, so five of them fit a phone without wrapping. */
const SCRAP_BANDS = ['Comm', 'Unco', 'Rare', 'Fabl', 'Myth'];

/** The standing order. Off by default, checked at the door, never retroactive. */
function AutoScrap({ state }: { state: GameState }) {
  const rule = state.relics.autoScrap;
  return (
    <>
      <Rule
        label="Auto-scrap"
        right={
          <button
            className={`shrink-0 rounded border px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] transition-colors ${
              rule.on ? 'border-lamp-500/60 bg-lamp-500/15 text-lamp-300' : 'border-cave-700 text-cave-500 hover:text-cave-300'
            }`}
            aria-pressed={rule.on}
            onClick={() => dispatch({ type: 'setAutoScrap', on: !rule.on })}
          >
            {rule.on ? 'On' : 'Off'}
          </button>
        }
      />
      <div className="rounded-md border border-cave-800 px-2.5 py-2">
        <div className="text-[9px] uppercase tracking-[0.16em] text-cave-500">Scrap at or below</div>
        <div className="mt-1 grid grid-cols-5 gap-1">
          {SCRAP_BANDS.map((name, i) => (
            <button
              key={name}
              className={`btn px-1 py-1 text-[10px] uppercase tracking-[0.1em] ${rule.maxRarity === i ? 'btn-warm' : ''}`}
              aria-pressed={rule.maxRarity === i}
              aria-label={`Scrap at or below ${RARITIES[i]}`}
              onClick={() => dispatch({ type: 'setAutoScrap', maxRarity: i })}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-[11px] text-cave-300">Keep powered relics</span>
            <span className="block text-[10px] leading-snug text-cave-500">never scrap one that carries a power</span>
          </span>
          <button
            className={`shrink-0 rounded border px-3 py-1 text-[10px] uppercase tracking-[0.12em] transition-colors ${
              rule.keepPowered ? 'border-lamp-500/60 bg-lamp-500/15 text-lamp-300' : 'border-cave-700 text-cave-500'
            }`}
            aria-pressed={rule.keepPowered}
            onClick={() => dispatch({ type: 'setAutoScrap', keepPowered: !rule.keepPowered })}
          >
            {rule.keepPowered ? 'Kept' : 'No'}
          </button>
        </div>
        <p className="mt-1.5 text-[10px] italic leading-snug text-cave-500">
          {rule.on
            ? `Scrapping ${RARITIES[rule.maxRarity]} and below on pickup. It only ever refuses a NEW find, and locked relics are never scrapped.`
            : 'Off. Nothing is scrapped on pickup; the hold culls its own weakest only when it is full.'}
          {rule.on && rule.keepPowered && rule.maxRarity >= 2
            && ' Every Rare and above carries a power, so with Kept on the bands above Uncommon change nothing.'}
        </p>
      </div>
    </>
  );
}

// The Museum and Expeditions panels are gone with museum.ts.
