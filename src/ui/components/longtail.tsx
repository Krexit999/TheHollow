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
import {
  spiralPending, gridSlotCost, licenceCost, canSpiral, PARALLEL_IDLE_SHARE,
} from '../../engine/systems/spiral';
import { CHALLENGES, availableChallenges, CHALLENGE_BY_ID } from '../../engine/content/shell7/challenges';
import { GRID_MODULES, MODULE_BY_ID, GRID_W, GRID_CELLS, automationRate } from '../../engine/content/shell7/gridModules';
import {
  RARITIES, RELIC_SLOTS, AFFIXES, SOURCE_BY_ID, RESONANCES, activeResonances,
  shardValue, effectiveAffixes, fusionPreview, fusionAfford,
  WAKING_STEPS, wakingOf, wakingStep, wakingNeed,
} from '../../engine/systems/relics';
import { powerOf, powerLive } from '../../engine/systems/relicPowers';
import {
  CASES, caseProgress, EXHIBITS, activeExhibits,
  ROUTES, ROUTE_BY_ID, crewEffect, routeDurationMs,
} from '../../engine/systems/museum';
import { HIRELING_BY_NPC } from '../../engine/guild/hirelings';
import { cachesOf } from '../../engine/systems/shaftSys';
import { currentShell } from '../../engine/shells';
import { dispatch, useGame } from '../store';
import { Amount, HoldButton, BUCKET_NAME } from './shared';

/** Shells a licence can open beside the one in your hands. */
const LICENSABLE = ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder'];
const SHELL_NAMES: Record<string, string> = {
  loam: 'Loam', ferrite: 'Ferrite', verdance: 'Verdance',
  glassmere: 'Glassmere', cinder: 'Cinder', hollow: 'The Hollow', aleph: 'Aleph',
};
const shellName = (id: string) => SHELL_NAMES[id] ?? id;

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
  const open = availableChallenges(state);
  const active = state.spiral.activeChallenge;
  const activeDef = active ? CHALLENGE_BY_ID.get(active.id) : null;

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

      {/* Challenges — the hand-played half */}
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#c9b8f0' }}>By hand</span>
          <span className="tnum text-[10px] text-cave-400">
            {state.spiral.challengeDone.length}/{CHALLENGES.length} done
          </span>
        </div>
        <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
          Each one takes something away so you can see what it was doing. They run in their
          own world — the run you are playing is put down whole and picked back up after,
          won or not.
        </p>
      </div>

      {activeDef && (
        <div className="panel border-lamp-500/40 p-3">
          <div className="text-sm font-semibold text-lamp-300">{activeDef.name} — running</div>
          <div className="mt-1 text-[11px] text-cave-300">{activeDef.rule}</div>
          <div className="mt-1 text-[11px] text-lamp-200">{activeDef.goalText}</div>
          <button className="btn mt-2 w-full py-1.5 text-xs" onClick={() => dispatch({ type: 'abandonChallenge' })}>
            Put it down (your world comes back untouched)
          </button>
        </div>
      )}

      {!activeDef && open.map((c) => (
        <div key={c.id} className="panel p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-cave-200">{c.name}</span>
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-cave-500">
              unlocks {MODULE_BY_ID.get(c.reward)?.name ?? c.reward}
            </span>
          </div>
          <p className="mt-1 text-[11px] italic leading-relaxed text-cave-400">{c.premise}</p>
          <div className="mt-1.5 text-[11px] text-cave-300"><span className="text-cave-500">Rule · </span>{c.rule}</div>
          <div className="text-[11px] text-cave-300"><span className="text-cave-500">Win · </span>{c.goalText}</div>
          <button className="btn btn-warm mt-2 w-full py-1.5 text-xs" onClick={() => dispatch({ type: 'startChallenge', id: c.id })}>
            Take it on
          </button>
        </div>
      ))}

      {state.spiral.challengeDone.length > 0 && (
        <div className="panel p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-cave-400">What they taught</div>
          {state.spiral.challengeDone.map((id) => {
            const c = CHALLENGE_BY_ID.get(id);
            if (!c) return null;
            return (
              <div key={id} className="mt-1.5">
                <div className="text-[11px] font-semibold text-cave-300">{c.name}</div>
                <div className="text-[11px] italic leading-snug text-cave-400">{c.lesson}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Automation Grid
// ---------------------------------------------------------------------------

export function AutomationPanel() {
  const state = useLive();
  if (!state) return null;
  const rate = automationRate(state.spiral.grid);
  const used = Object.keys(state.spiral.grid).length;

  return (
    <div className="space-y-2">
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#9ad0c0]">The board</span>
          <span className="tnum text-[10px] text-cave-400">
            {used}/{state.spiral.slots} slots · plays at {Math.round(rate * 100)}% of idle
          </span>
        </div>
        <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
          Modules read the ones beside them. A full board plays a world exactly as well as a
          good idle player and never better — your hands keep their edge, always.
        </p>
        <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${GRID_W}, minmax(0,1fr))` }}>
          {Array.from({ length: GRID_CELLS }, (_, cell) => {
            const id = state.spiral.grid[cell];
            const def = id ? MODULE_BY_ID.get(id) : null;
            const locked = cell >= state.spiral.slots;
            return (
              /* LOCKED vs AVAILABLE must be legible at a glance. These were one
                 tiny glyph apart on near-black — a dot and a plus — which is
                 not a distinction. An open slot is now a dashed warm outline
                 that reads as "put something here"; a locked one is flat and
                 obviously inert. */
              <button
                key={cell}
                className={`h-14 rounded-[3px] border p-1 text-[9px] leading-tight transition-colors ${
                  def
                    ? 'border-[#9ad0c0] bg-[#16241f] text-[#9ad0c0]'
                    : locked
                      ? 'border-cave-800 bg-cave-950/60 text-cave-700'
                      : 'border-dashed border-lamp-500/60 bg-amber-950/20 text-lamp-400/80'
                }`}
                title={def ? `${def.name} — ${def.rule}` : locked ? 'No slot here yet — buy one with Spiral' : 'An open slot: place a module'}
                onClick={() => { if (def) dispatch({ type: 'clearModule', cell }); }}
              >
                {def ? def.name : locked ? <span className="opacity-50">locked</span> : '+ place'}
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel p-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-cave-400">Modules</div>
        {GRID_MODULES.map((m) => {
          const owned = state.spiral.modules.includes(m.id);
          const placed = Object.values(state.spiral.grid).includes(m.id);
          const freeCell = Array.from({ length: Math.min(state.spiral.slots, GRID_CELLS) }, (_, i) => i)
            .find((i) => state.spiral.grid[i] === undefined);
          return (
            <div key={m.id} className={`mt-1.5 rounded-md border p-2 ${owned ? 'border-cave-700' : 'border-cave-800 opacity-45'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold text-cave-200">{m.name}</span>
                <span className="tnum shrink-0 text-[10px] text-cave-500">+{Math.round(m.rate * 100)}%</span>
              </div>
              <div className="text-[10px] text-cave-400">{m.rule}</div>
              {owned ? (
                <button
                  className="btn mt-1.5 w-full py-1 text-[11px]"
                  disabled={placed || freeCell === undefined}
                  onClick={() => freeCell !== undefined && dispatch({ type: 'placeModule', id: m.id, cell: freeCell })}
                >
                  {placed ? 'On the board' : freeCell === undefined ? 'No free slot' : 'Place'}
                </button>
              ) : (
                <div className="mt-1 text-[10px] italic text-cave-500">
                  Locked — won by a challenge.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Worlds running beside yours. These controls did not exist until Phase
          13: licenseShell / setShellPolicy / takeInHand had handlers and no way
          to reach them, so no parallel world could ever be created and the tick
          that runs them never had anything to run. */}
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-cave-400">Worlds beside this one</span>
          <span className="tnum text-[10px] text-cave-400">
            {state.spiral.shells.length}/{state.spiral.licences} licensed
          </span>
        </div>
        {state.spiral.licences === 0 && (
          <div className="mt-1 text-[11px] italic text-cave-500">
            No licences yet. The Spiral sells them — one lets a second world run while you work this one.
          </div>
        )}
        {state.spiral.shells.map((sh) => (
          <div key={sh.shellId} className="mt-1.5 rounded-md border border-cave-700 p-2">
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="text-cave-300">{shellName(sh.shellId)}</span>
              <span className="tnum text-cave-400">
                depth {Math.floor(sh.depth)} · {sh.policy ? 'running' : 'banked'}
              </span>
            </div>
            <div className="mt-1 flex gap-1.5">
              <button
                className="btn flex-1 py-1 text-[11px]"
                onClick={() => dispatch({ type: 'setShellPolicy', shellId: sh.shellId, policy: sh.policy ? null : 'balanced' })}
              >
                {sh.policy ? 'Bank it' : 'Set it running'}
              </button>
              <button
                className="btn flex-1 py-1 text-[11px]"
                disabled={state.spiral.inHand === sh.shellId}
                onClick={() => dispatch({ type: 'takeInHand', shellId: sh.shellId })}
              >
                {state.spiral.inHand === sh.shellId ? 'In hand' : 'Take in hand'}
              </button>
            </div>
          </div>
        ))}
        {state.spiral.shells.length < state.spiral.licences && (
          <div className="mt-2">
            <div className="text-[10px] uppercase tracking-wider text-cave-500">Open a world</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {LICENSABLE.filter((id) => !state.spiral.shells.some((s) => s.shellId === id)).map((id) => (
                <button key={id} className="btn px-2 py-1 text-[11px]" onClick={() => dispatch({ type: 'licenseShell', shellId: id })}>
                  {shellName(id)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-1.5 text-[10px] italic text-cave-500">
          An unattended world earns at {Math.round(PARALLEL_IDLE_SHARE * 100)}% of the idle floor,
          times the board above. Its own field ceiling still binds it.
        </div>
      </div>
    </div>
  );
}

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

// ---------------------------------------------------------------------------
// The Museum — what the collection has filled, and what it has been named for
// ---------------------------------------------------------------------------
/**
 * A.49 removed donation: a hall fills from what you HOLD, and a set fires
 * because the collection says something. That model is kept — it is the
 * "sets you have completed" view this panel is meant to be. Nothing here is a
 * verb; the only way to change it is to go and dig.
 *
 * PILLAR 5: a set is listed ONLY after it has fired once. The halls are shown
 * because a hall states its own price up front (it always did); the sets are
 * the discovery layer and stay dark until found.
 */
export function MuseumPanel() {
  const state = useLive();
  if (!state) return null;
  const standing = new Set(activeExhibits(state).map((a) => a.def.id));
  const found = EXHIBITS.filter((e) => state.museum.exhibitsFound.includes(e.id));

  return (
    <div className="space-y-2">
      {/* No blurb here: the SystemHeader above already says what this room is,
          and this file's rule is that a panel carries the numbers and the
          controls and never repeats its own title. The first draft printed the
          same two sentences twice, one card apart. */}
      <div className="panel p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          <span className="text-cave-400">
            Halls <span className="tnum font-semibold text-[#e8c98a]">{state.museum.completed.length}/{CASES.length}</span>
          </span>
          <span className="text-cave-500">·</span>
          <span className="text-cave-400">
            Sets found <span className="tnum font-semibold text-[#e8c98a]">{found.length}</span>
            {standing.size > 0 && <span className="text-cave-500"> ({standing.size} standing)</span>}
          </span>
        </div>
      </div>

      {/* THE SETS — discovery, so nothing appears until it has happened once. */}
      {found.length > 0 && (
        <div className="panel p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#e8c98a]">Named by the room</div>
          {found.map((e) => {
            const live = standing.has(e.id);
            return (
              <div key={e.id} className={`mt-1.5 rounded-md border px-2 py-1.5 ${live ? 'border-[#e8c98a]/40 bg-[#e8c98a]/5' : 'border-cave-800 opacity-60'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-[12px] font-semibold ${live ? 'text-[#e8c98a]' : 'text-cave-400'}`}>{e.name}</span>
                  <span className="shrink-0 text-[10px] text-cave-500">
                    {live
                      ? <span className="text-lamp-400">+{Math.round(e.bonus * 100)}% {BUCKET_NAME[e.bucket]}</span>
                      : 'not standing — you no longer hold the pieces'}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] italic leading-snug text-cave-400">{e.line}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* THE HALLS — a directed hunt, and each states its own price. */}
      {CASES.map((c) => {
        const p = caseProgress(state, c.id);
        const done = state.museum.completed.includes(c.id);
        return (
          <div key={c.id} className={`panel p-3 ${done ? 'border-lamp-500/40' : ''}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-cave-200">{c.name}</span>
              <span className="tnum shrink-0 text-[10px] text-cave-400">{p.have}/{p.need}</span>
            </div>
            <p className="mt-1 text-[11px] italic leading-snug text-cave-400">{c.blurb}</p>
            <div className="mt-1 text-[11px] text-cave-300"><span className="text-cave-500">Wants · </span>{c.wants}</div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-cave-800">
              <div className="h-full rounded-full bg-lamp-500/70" style={{ width: `${Math.min(100, (p.have / p.need) * 100)}%` }} />
            </div>
            <div className="mt-1 text-[10px] text-cave-500">
              {done ? 'Filled — ' : 'When filled — '}
              <span className="text-lamp-400">+{Math.round(c.bonus * 100)}% {BUCKET_NAME[c.bucket]}</span>, permanently.
              {done && p.have < p.need && <span className="text-cave-600"> Kept: a hall that has been full stays paid.</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

function DepartChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className={`rounded px-2 py-0.5 text-[10px] transition-colors ${active ? 'bg-lamp-600/40 text-lamp-200' : 'bg-cave-800 text-cave-400 hover:text-cave-200'}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function ExpeditionsPanel() {
  const state = useLive();
  const [depart, setDepart] = useState(0); // 0 = surface; else a cache depth
  if (!state) return null;
  const crew = Object.keys(state.guild.hirelings);
  const out = state.expeditions.active;
  const ready = state.expeditions.ready;
  // Departure points on the column: the surface, plus every cache in this shell.
  const caches = cachesOf(state).slice().sort((a, b) => a.depth - b.depth);
  const departValid = depart === 0 || caches.some((c) => c.depth === depart);
  const fromDepth = departValid ? depart : 0;

  return (
    <div className="space-y-2">
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#e0b054]">The gate</span>
          <span className="tnum text-[10px] text-cave-400">
            {out.length} out · {ready.length} back · {state.expeditions.completed} run
          </span>
        </div>
        <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
          They bring back what the shaft cannot: material out of shells you have already left,
          and the odd thing nobody can name. A crew that lands while you are away waits at the
          gate — results never expire.
        </p>
        {caches.length > 0 && (
          <div className="mt-2 border-t border-cave-800 pt-2">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-cave-500">Set off from</div>
            <div className="flex flex-wrap gap-1">
              <DepartChip label="the surface" active={fromDepth === 0} onClick={() => setDepart(0)} />
              {caches.map((c) => (
                <DepartChip key={c.depth} label={`cache @${c.depth}`} active={fromDepth === c.depth} onClick={() => setDepart(c.depth)} />
              ))}
            </div>
            {fromDepth > 0 && (
              <p className="mt-1 text-[10px] italic text-cave-500">
                Departing deep in {currentShell(state).name} — a crew starts nearer the worlds below, and comes back from a deeper one with better odds of the odd find.
              </p>
            )}
          </div>
        )}
      </div>

      {ready.map((r) => (
        <div key={r.crewId} className="panel border-lamp-500/40 p-3">
          <div className="text-sm font-semibold text-lamp-300">{r.crewId} is back</div>
          <div className="text-[11px] text-cave-400">{ROUTE_BY_ID.get(r.routeId)?.name}</div>
          <button className="btn btn-warm mt-2 w-full py-1.5 text-xs" onClick={() => dispatch({ type: 'claimExpedition', crewId: r.crewId })}>
            Take the haul
          </button>
        </div>
      ))}

      {out.map((e) => {
        const route = ROUTE_BY_ID.get(e.routeId);
        const pct = Math.min(100, ((state.guild.clockMs - e.startedMs) / e.durationMs) * 100);
        return (
          <div key={e.crewId} className="panel p-3">
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="text-cave-300">{e.crewId} — {route?.name}</span>
              <span className="tnum text-cave-500">{Math.floor(pct)}%</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-cave-800">
              <div className="h-full rounded-full bg-lamp-500/60" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}

      {crew.length === 0 && (
        <div className="panel p-3 text-[11px] italic text-cave-400">
          Nobody to send. Hire a crew at the Lamphouse first.
        </div>
      )}

      {crew.length > 0 && ROUTES.map((route) => {
        const idle = crew.filter((c) => !out.some((e) => e.crewId === c) && !ready.some((r) => r.crewId === c));
        return (
          <div key={route.id} className="panel p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-cave-200">{route.name}</span>
              <span className="tnum shrink-0 text-[10px] text-cave-400">
                {route.minutes < 60 ? `${route.minutes}m` : `${route.minutes / 60}h`}
              </span>
            </div>
            <p className="mt-1 text-[11px] italic leading-snug text-cave-400">{route.blurb}</p>

            {/* Who you send now matters, so the panel names them and says what
                each is like on the road. This used to send whoever happened to
                sit first in the roster. */}
            {idle.length === 0 ? (
              <div className="mt-2 text-[11px] italic text-cave-500">Every crew is out.</div>
            ) : (
              <div className="mt-2 space-y-1">
                {idle.map((c) => {
                  const eff = crewEffect(state, c);
                  const mins = Math.round(routeDurationMs(state, c, route) / 60_000);
                  return (
                    <button
                      key={c}
                      className="block w-full rounded-md border border-cave-700 px-2 py-1.5 text-left text-[11px] transition-colors hover:border-lamp-500/50 hover:bg-cave-800"
                      onClick={() => dispatch({ type: 'sendExpedition', crewId: c, routeId: route.id, fromDepth })}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-cave-200">
                          Send {HIRELING_BY_NPC.get(c)?.title ?? c}
                          {eff && <span className="ml-1.5 text-[10px] text-lamp-400">{eff.trait}</span>}
                        </span>
                        <span className="tnum shrink-0 text-[10px] text-cave-400">
                          {mins < 60 ? `${mins}m` : `${(mins / 60).toFixed(1)}h`}
                        </span>
                      </div>
                      {eff?.second && (
                        <div className="mt-0.5 text-[10px] text-[#c8b48a]">
                          {eff.second.trait} <span className="italic text-cave-500">{eff.second.note}</span>
                        </div>
                      )}
                      {eff && (
                        <div className="mt-0.5 text-[10px] leading-snug text-cave-500">
                          {eff.haulMult !== 1 && (
                            <span className="mr-2">haul ×{eff.haulMult.toFixed(2)}</span>
                          )}
                          {eff.relicAdd > 0 && (
                            <span className="mr-2">+{Math.round(eff.relicAdd * 100)}% odd finds</span>
                          )}
                          <span className="italic">{eff.note}</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
