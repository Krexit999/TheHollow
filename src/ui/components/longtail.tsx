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
  rollFloor, shardValue, holdCap, effectiveAffixes, fusionPreview, fusionAfford,
  wakingOf, wakingStep, wakingNeed,
} from '../../engine/systems/relics';
import { powerOf, powerLive, KIND_NAME, pairMultiplier } from '../../engine/systems/relicPowers';
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
// Relics — a panel again (A.50)
// ---------------------------------------------------------------------------
/**
 * A.49 rebuilt these two screens as rendered Pixi surfaces and they came out
 * as grey blobs in boxes. The engine work under them was sound and is
 * untouched; only the presentation was thrown away. This is deliberately the
 * A.48 SHAPE — plain rows, plain buttons, every number written down — against
 * the A.49 API.
 *
 * The rule this file is now built to: FUNCTIONAL OVER FANCY. If something is
 * true about a relic, it says so in words. Nothing here is drawn.
 */

/** Rarity reads as a colour on the word, which is as far as decoration goes. */
const RARITY_TEXT = ['text-cave-300', 'text-[#9ab08a]', 'text-[#8fb4d8]', 'text-[#e2c76a]', 'text-[#cdd9ff]'];

/** One relic's live effect lines. A powered relic keeps only its best line
 *  (`effectiveAffixes`) — the panel must show what the ENGINE reads, not the
 *  raw roll, or the two disagree in front of the player. */
function EffectLines({ state, relic }: { state: GameState; relic: RelicInstance }) {
  const shown = effectiveAffixes(relic);
  const keys = Object.keys(shown);
  if (keys.length === 0) return null;
  const step = wakingStep(relic);
  const res = activeResonances(state)
    .filter((x) => x.source === relic.source)
    .reduce((m, x) => m * x.mult, 1);
  const pair = pairMultiplier(state);
  const worn = state.relics.equipped.includes(relic.uid);
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
      {keys.map((k) => {
        const base = shown[k]!;
        const live = worn ? base * step.mult * res * pair : base;
        return (
          <span key={k} className="tnum text-[11px] text-cave-400">
            {AFFIXES[k]?.label ?? k} <span className="text-lamp-400">+{Math.round(live * 100)}%</span>
            {live > base + 1e-9 && <span className="ml-0.5 text-[9px] text-cave-500">(base {Math.round(base * 100)}%)</span>}
          </span>
        );
      })}
      {Object.keys(relic.affixes).length > keys.length && (
        <span className="text-[10px] italic text-cave-600" title="A relic with a power keeps only its strongest line — the rest were noise beside it.">
          + {Object.keys(relic.affixes).length - keys.length} lesser line(s), not counted
        </span>
      )}
    </div>
  );
}

/** Waking state and what it is worth, in words. */
function WakingLine({ relic }: { relic: RelicInstance }) {
  const step = wakingStep(relic);
  const need = wakingNeed(relic);
  return (
    <div className="mt-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-[10px] uppercase tracking-wider ${wakingOf(relic) === 0 ? 'text-cave-500' : 'text-[#9fd8c0]'}`}>
          {step.name}
          {step.mult > 1 && <span className="ml-1 tnum">×{step.mult.toFixed(2)} to its lines</span>}
        </span>
        {need !== null && (
          <span className="tnum shrink-0 text-[9px] text-cave-500">{Math.ceil(need / 60)}m carried to go</span>
        )}
      </div>
      <div className="mt-0.5 text-[10px] italic leading-snug text-cave-400">{step.line}</div>
    </div>
  );
}

/** The named power, its kind, and what it is doing right now. */
function PowerBlock({ state, relic }: { state: GameState; relic: RelicInstance }) {
  const pw = powerOf(relic);
  if (!pw) return null;
  const live = powerLive(relic);
  return (
    <div className={`mt-1.5 rounded-md border px-2 py-1.5 ${live ? 'border-[#e8c98a]/50 bg-[#e8c98a]/5' : 'border-dashed border-cave-800'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-[11px] font-semibold ${live ? 'text-[#e8c98a]' : 'text-cave-500'}`}>{pw.name}</span>
        <span className="shrink-0 text-[9px] uppercase tracking-wider text-cave-500">
          {live ? KIND_NAME[pw.kind] : 'dormant'}
        </span>
      </div>
      {live ? (
        <>
          <div className="mt-0.5 text-[10px] leading-snug text-cave-300">{pw.readout(state)}</div>
          <div className="mt-0.5 text-[10px] italic leading-snug text-cave-500">{pw.line}</div>
        </>
      ) : (
        <div className="mt-0.5 text-[10px] italic leading-snug text-cave-500">
          Something in it has not woken. Carry it and find out what.
        </div>
      )}
    </div>
  );
}

/** Where it came up, and out of whose hand. Absent on pre-A.46 relics, and
 *  saying nothing is more honest than inventing a memory for them. */
function FoundLine({ relic }: { relic: RelicInstance }) {
  if (!relic.found) {
    return <div className="mt-1 text-[10px] italic leading-snug text-cave-600">Nobody wrote down where this came from.</div>;
  }
  return (
    <div className="mt-1 text-[10px] leading-snug text-cave-500">
      Found at depth <span className="tnum text-cave-400">{relic.found.depth}</span>
      {' '}in {relic.found.shell}, run <span className="tnum text-cave-400">{relic.found.run + 1}</span>
      {relic.found.by && <> — turned up by <span className="text-cave-400">{relic.found.by}</span></>}
    </div>
  );
}

function RelicTitle({ relic }: { relic: RelicInstance }) {
  return (
    <span className={`text-sm font-semibold ${RARITY_TEXT[relic.rarity] ?? 'text-cave-200'}`}>
      {relic.locked && <span className="mr-1 text-[#e6c15a]" title="Locked — a fusion can never eat it">🔒</span>}
      {RARITIES[relic.rarity]} relic
      {relic.fusedFrom > 0 && (
        <span className="ml-1 text-[10px] text-cave-500" title={`Fused from ${(relic.ate ?? []).join(', ') || 'earlier relics'}`}>
          ·{relic.fusedFrom} fused in
        </span>
      )}
    </span>
  );
}

export function RelicsPanel() {
  const state = useLive();
  const [fusingInto, setFusingInto] = useState<number | null>(null);
  const [showScrap, setShowScrap] = useState(false);
  if (!state) return null;
  const held = state.relics.held;
  const worn = state.relics.equipped
    .map((uid) => held.find((r) => r.uid === uid))
    .filter((r): r is RelicInstance => !!r);
  const spare = held.filter((r) => !state.relics.equipped.includes(r.uid));
  const cores = Math.floor(getCurrency(state, 'core').toNumber());

  return (
    <div className="space-y-2">
      {/* The three numbers everything else spends. */}
      <div className="panel p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          <span className="text-cave-400">
            Shards <span className="tnum font-semibold text-[#d8b8ee]">{Math.floor(state.relics.shards)}</span>
          </span>
          <span className="text-cave-500">·</span>
          <span className="text-cave-400">
            Cores <span className="tnum font-semibold text-[#e8c98a]">{cores}</span>
          </span>
          <span className="text-cave-500">·</span>
          <span className={held.length >= holdCap(state) ? 'text-amber-400' : 'text-cave-400'}>
            Hold <span className="tnum">{held.length}/{holdCap(state)}</span>
            {held.length >= holdCap(state) && ' — the weakest render themselves down'}
          </span>
          {state.relics.floorBonus > 0 && (
            <>
              <span className="text-cave-500">·</span>
              <span className="text-cave-400" title="Filled halls and formed sets raise the MINIMUM roll. A late relic can never be worse than an early one.">
                Floor <span className="tnum text-emerald-400/80">+{Math.round(rollFloor(state) * 100)}%</span>
              </span>
            </>
          )}
        </div>
        <button
          className={`btn mt-2 w-full py-1 text-[11px] ${state.relics.autoScrap.on ? 'btn-warm' : ''}`}
          aria-expanded={showScrap}
          onClick={() => setShowScrap((v) => !v)}
        >
          Standing order{state.relics.autoScrap.on
            ? ` · on, up to ${RARITIES[state.relics.autoScrap.maxRarity]}`
            : ' · off'}
        </button>
        {showScrap && <AutoScrapRules state={state} />}
      </div>

      {/* RESONANCE — found by wearing, never listed before it fires (pillar 5). */}
      {(activeResonances(state).length > 0 || state.relics.resonancesFound.length > 0) && (
        <div className={`panel p-3 ${activeResonances(state).length > 0 ? 'border-[#d8b8ee]/50' : ''}`}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#d8b8ee]">They recognise each other</span>
            {activeResonances(state).length > 0 && (
              <span className="shrink-0 rounded bg-[#d8b8ee]/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#d8b8ee]">
                Firing · {activeResonances(state).length}
              </span>
            )}
          </div>
          {RESONANCES.filter((res) => state.relics.resonancesFound.includes(res.id)).map((res) => {
            const on = activeResonances(state).some((a) => a.id === res.id);
            const wearing = worn.filter((r) => r.source === res.source).length;
            return (
              <div key={res.id} className={`mt-1.5 rounded-md border px-2 py-1.5 ${on ? 'border-[#d8b8ee]/40 bg-[#d8b8ee]/5' : 'border-cave-800 opacity-60'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-[12px] font-semibold ${on ? 'text-[#d8b8ee]' : 'text-cave-400'}`}>{res.name}</span>
                  <span className={`tnum shrink-0 text-[10px] ${on ? 'text-[#d8b8ee]' : 'text-cave-500'}`}>
                    {on
                      ? `+${Math.round((res.mult - 1) * 100)}% to every line on those ${wearing}`
                      : `${wearing}/${res.need} from ${SOURCE_BY_ID.get(res.source)?.name ?? res.source} worn`}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] italic leading-snug text-cave-400">{res.line}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* CARRIED — the six that actually do something. */}
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#d8b8ee]">Carried</span>
          <span className="tnum text-[10px] text-cave-400">{worn.length}/{RELIC_SLOTS} worn · {state.relics.fused} fused</span>
        </div>
        {worn.length === 0 && (
          <p className="mt-1 text-[11px] italic leading-snug text-cave-500">
            Nothing worn. An unworn relic does nothing at all — its power stays asleep and its
            lines pay nothing.
          </p>
        )}
        {worn.map((r, i) => (
          <div key={r.uid} className="mt-1.5 rounded-md border border-lamp-500/30 px-2 py-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <RelicTitle relic={r} />
              <span className="shrink-0 text-[10px] text-cave-500">from {SOURCE_BY_ID.get(r.source)?.name ?? r.source}</span>
            </div>
            <FoundLine relic={r} />
            <EffectLines state={state} relic={r} />
            <WakingLine relic={r} />
            <PowerBlock state={state} relic={r} />
            <div className="mt-2 flex gap-1.5">
              <button
                className="btn flex-1 py-1 text-[11px]"
                onClick={() => dispatch({ type: 'unequipRelic', slot: i })}
              >
                Take it off
              </button>
              <button className="btn flex-1 py-1 text-[11px]" onClick={() => setFusingInto(fusingInto === r.uid ? null : r.uid)}>
                {fusingInto === r.uid ? 'Never mind' : 'Fuse one in…'}
              </button>
              <LockButton relic={r} />
            </div>
            {fusingInto === r.uid && <FuseChooser state={state} keep={r} onDone={() => setFusingInto(null)} />}
          </div>
        ))}
      </div>

      {/* THE HOLD — everything else. */}
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-cave-300">In the hold</span>
          <span className="tnum text-[10px] text-cave-400">{spare.length}</span>
        </div>
        {spare.length === 0 && (
          <p className="mt-1 text-[11px] italic leading-snug text-cave-500">
            Nothing spare. They come up out of the deep shaft, out of Warrens, out of anomalies
            and wells, and back with the crews.
          </p>
        )}
      </div>

      {spare.map((r) => (
        <div key={r.uid} className="panel p-3">
          <div className="flex items-baseline justify-between gap-2">
            <RelicTitle relic={r} />
            <span className="shrink-0 text-[10px] text-cave-500">from {SOURCE_BY_ID.get(r.source)?.name ?? r.source}</span>
          </div>
          <FoundLine relic={r} />
          <EffectLines state={state} relic={r} />
          <WakingLine relic={r} />
          <PowerBlock state={state} relic={r} />
          <div className="mt-2 flex gap-1.5">
            <button
              className="btn flex-1 py-1 text-[11px]"
              disabled={state.relics.equipped.length >= RELIC_SLOTS}
              title={state.relics.equipped.length >= RELIC_SLOTS ? 'All six slots are full — take one off first' : undefined}
              onClick={() => dispatch({ type: 'equipRelic', uid: r.uid, slot: state.relics.equipped.length })}
            >
              Wear it
            </button>
            {held.length > 1 && (
              <button className="btn flex-1 py-1 text-[11px]" onClick={() => setFusingInto(fusingInto === r.uid ? null : r.uid)}>
                {fusingInto === r.uid ? 'Never mind' : 'Fuse one in…'}
              </button>
            )}
            <LockButton relic={r} />
            {!r.locked && (
              <button
                className="btn shrink-0 px-2 py-1 text-[11px]"
                title={`Render it down for ${shardValue(r)} shards. Gone for good.`}
                onClick={() => dispatch({ type: 'renderRelic', uid: r.uid })}
              >
                ⚒ {shardValue(r)}
              </button>
            )}
          </div>
          {fusingInto === r.uid && <FuseChooser state={state} keep={r} onDone={() => setFusingInto(null)} />}
        </div>
      ))}
    </div>
  );
}

function LockButton({ relic }: { relic: RelicInstance }) {
  return (
    <button
      className={`btn shrink-0 px-2 py-1 text-[11px] ${relic.locked ? 'btn-warm' : ''}`}
      title={relic.locked
        ? 'Locked — a fusion can never eat it. Click to unlock.'
        : 'Lock it — a fusion can never eat it.'}
      aria-pressed={!!relic.locked}
      aria-label={relic.locked ? 'Unlock this relic' : 'Lock this relic'}
      onClick={() => dispatch({ type: 'toggleRelicLock', uid: relic.uid })}
    >
      {relic.locked ? '🔒' : '🔓'}
    </button>
  );
}

/**
 * THE FUSE CHOOSER. Fusion eats a relic, so the player picks WHICH one and
 * sees the price and the outcome before committing. The price is stated PER
 * CANDIDATE because Cores are only charged on a fusion that lifts the keeper
 * into the top band — the same feed can be free or cost 12 depending on what
 * it is.
 */
function FuseChooser({ state, keep, onDone }: { state: GameState; keep: RelicInstance; onDone: () => void }) {
  const feeds = state.relics.held.filter((o) => o.uid !== keep.uid && !o.locked);
  return (
    <div className="mt-2 space-y-1 border-t border-cave-700 pt-2">
      <div className="text-[10px] uppercase tracking-widest text-cave-500">
        Feed one in — the fed relic is consumed, the keeper takes the better of every line
      </div>
      {feeds.length === 0 && (
        <p className="text-[10px] italic text-cave-500">
          Nothing spare and unlocked to feed it. Unlock one, or go and find another.
        </p>
      )}
      {feeds.map((o) => {
        const pv = fusionPreview(state, keep.uid, o.uid);
        const af = fusionAfford(state, keep, o);
        const blocked = !af.ok || !!pv?.gatedBy;
        return (
          <button
            key={o.uid}
            className={`block w-full rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${
              blocked ? 'border-cave-800 opacity-60' : 'border-cave-700 hover:border-lamp-500/50 hover:bg-cave-800'
            }`}
            disabled={blocked}
            onClick={() => { dispatch({ type: 'fuseRelics', keepUid: keep.uid, feedUid: o.uid }); onDone(); }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-cave-200">
                {RARITIES[o.rarity]} · {SOURCE_BY_ID.get(o.source)?.name ?? o.source}
                {state.relics.equipped.includes(o.uid) && <span className="ml-1 text-[9px] uppercase tracking-wider text-amber-400">worn</span>}
              </span>
              <span className="tnum shrink-0 text-[10px]">
                <span className={af.ok ? 'text-[#d8b8ee]' : 'text-amber-400'}>{af.price.shards} shards</span>
                {af.price.cores > 0 && (
                  <span className={af.ok ? ' text-[#e8c98a]' : ' text-amber-400'}> + {af.price.cores} Cores</span>
                )}
              </span>
            </div>
            <div className="mt-0.5 text-[10px] leading-snug text-cave-400">
              {pv?.gatedBy ? (
                <span className="text-[#d4a86a]">Rarity up needs {pv.gatedBy.need} filled halls ({pv.gatedBy.have} done).</span>
              ) : !af.ok ? (
                <span className="text-amber-400">Short {af.short.join(' and ')}.</span>
              ) : !pv || (pv.gained.length === 0 && pv.improved.length === 0 && !pv.rarityUp && !pv.powerGained) ? (
                <span className="italic">Adds nothing this one does not already beat — but it still marks it.</span>
              ) : (
                <>
                  {pv.rarityUp && <span className="mr-2 text-lamp-400">rarity up</span>}
                  {pv.powerGained && <span className="mr-2 text-[#e8c98a]">takes its power · {pv.powerGained}</span>}
                  {pv.gained.map((g) => <span key={g.key} className="mr-2 text-lamp-400">+{g.label} {Math.round(g.value * 100)}%</span>)}
                  {pv.improved.map((i) => <span key={i.key} className="mr-2 text-lamp-300">{i.label} {Math.round(i.from * 100)}→{Math.round(i.to * 100)}%</span>)}
                  {pv.wasted.length > 0 && <span className="text-cave-600">({pv.wasted.length} already beaten)</span>}
                </>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

const SCRAP_BANDS = ['Common', 'Uncommon', 'Rare', 'Fabled', 'Mythic'];

/** The standing order. Off by default, checked at the door, never retroactive. */
function AutoScrapRules({ state }: { state: GameState }) {
  const rule = state.relics.autoScrap;
  return (
    <div className="mt-2 border-t border-cave-700 pt-2">
      <p className="text-[10px] italic leading-snug text-cave-500">
        What to render down the moment it comes up, so the hold never becomes a list again. It
        only ever refuses a NEW find — turning it on cannot touch anything already here, and it
        never takes a locked one.
      </p>
      <button
        className={`btn mt-1.5 w-full py-1 text-[11px] ${rule.on ? 'btn-warm' : ''}`}
        aria-pressed={rule.on}
        onClick={() => dispatch({ type: 'setAutoScrap', on: !rule.on })}
      >
        {rule.on ? 'Standing order is ON' : 'Standing order is off'}
      </button>
      <div className="mt-2 text-[10px] uppercase tracking-widest text-cave-500">Render down anything up to</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {SCRAP_BANDS.map((name, i) => (
          <button
            key={name}
            className={`btn flex-1 px-1 py-1 text-[10px] ${rule.maxRarity === i ? 'btn-warm' : ''}`}
            aria-pressed={rule.maxRarity === i}
            onClick={() => dispatch({ type: 'setAutoScrap', maxRarity: i })}
          >
            {name}
          </button>
        ))}
      </div>
      <button
        className={`btn mt-1.5 w-full py-1 text-[11px] ${rule.keepPowered ? 'btn-warm' : ''}`}
        aria-pressed={rule.keepPowered}
        onClick={() => dispatch({ type: 'setAutoScrap', keepPowered: !rule.keepPowered })}
      >
        {rule.keepPowered ? 'Always keep one that has a power' : 'Powers get no exemption'}
      </button>
      {rule.keepPowered && rule.maxRarity >= 2 && (
        <p className="mt-1 text-[10px] italic leading-snug text-cave-500">
          Every Rare and above carries a power, so with this on the bands above Uncommon change
          nothing. Turn it off if you meant it.
        </p>
      )}
    </div>
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
