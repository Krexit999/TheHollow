import { useState } from 'react';
/**
 * THE LONG TAIL (Phase 12) — the Spiral, the Automation Grid, Relics, the
 * Museum, and the Expeditions. Five rooms, built to the Phase 11 pattern: the
 * central SystemHeader supplies Layer 1 and Layer 2, so these panels carry the
 * numbers and the controls and never repeat their own title.
 */
import { getCurrency } from '../../engine';
import {
  spiralPending, gridSlotCost, licenceCost, canSpiral, PARALLEL_IDLE_SHARE,
} from '../../engine/systems/spiral';
import { CHALLENGES, availableChallenges, CHALLENGE_BY_ID } from '../../engine/content/shell7/challenges';
import { GRID_MODULES, MODULE_BY_ID, GRID_W, GRID_CELLS, automationRate } from '../../engine/content/shell7/gridModules';
import {
  RARITIES, RELIC_SLOTS, AFFIXES, SOURCE_BY_ID, fusionPreview,
  RESONANCES, activeResonances, rollFloor, shardValue, holdCap,
  wakingOf, wakingStep, wakingNeed, fusionCost, fusionAfford,
} from '../../engine/systems/relics';
import { powerOf, powerLive, KIND_NAME } from '../../engine/systems/relicPowers';
import {
  CASES, CASE_BY_ID, caseProgress, ROUTES, ROUTE_BY_ID, crewEffect, routeDurationMs,
  EXHIBITS, activeExhibits, identifyCost, RELIC_HALLS, caseBonusNow,
  identifyShardCost, piecesInCase,
} from '../../engine/systems/museum';
import { HIRELING_BY_NPC } from '../../engine/guild/hirelings';
import { keyDisplayName } from '../../engine/content/keyNames';
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

/** What a non-relic case can be fed, drawn from what you actually own. */
function museumCandidates(
  state: NonNullable<ReturnType<typeof useGame.getState>['state']>,
  from: 'bestiary' | 'codex' | 'gem' | 'relic',
): Array<{ key: string; label: string }> {
  // Every branch used to leak the raw id as its label (`triangle.flowing.mixed`).
  // keyDisplayName resolves each `kind:id` to its real, authored name.
  if (from === 'bestiary') {
    return state.combat.seen.map((id) => ({ key: `species:${id}`, label: keyDisplayName(`species:${id}`) }));
  }
  if (from === 'gem') {
    return Object.entries(state.materials.gems)
      .filter(([, n]) => (n ?? 0) > 0)
      .map(([id]) => ({ key: `gem:${id}`, label: keyDisplayName(`gem:${id}`) }));
  }
  if (from === 'codex') {
    const all = [
      ...state.lattice.discovered.map((d) => `chord:${d}`),
      ...state.crucible.discovered.map((d) => `alloy:${d}`),
      ...state.loom.discoveredShapes.map((d) => `shape:${d}`),
      ...state.greenhouse.codex.map((d) => `strain:${d}`),
      ...state.brewing.discovered.map((d) => `brew:${d}`),
      ...state.bench.solved.map((d) => `lens:${d}`),
    ];
    return all.map((k) => ({ key: k, label: keyDisplayName(k) }));
  }
  return [];
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
// Relics
// ---------------------------------------------------------------------------

export function RelicsPanel() {
  const state = useLive();
  const [fusingInto, setFusingInto] = useState<number | null>(null);
  if (!state) return null;
  const held = state.relics.held;

  return (
    <div className="space-y-2">
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#d8b8ee]">Carried</span>
          <span className="tnum text-[10px] text-cave-400">
            {state.relics.equipped.length}/{RELIC_SLOTS} worn · {held.length} held · {state.relics.fused} fused
          </span>
        </div>
        <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
          What a relic can carry is decided by where you found it, so the hunt is steerable.
          Fusing keeps the better of each line and never destroys — a duplicate is always
          progress, never waste. Carry one long enough and it wakes.
        </p>
        {/* THE PILE IS THE RESOURCE. Shards, the cap, and the rising floor —
            the three things that used to be invisible while the hold grew to
            two hundred commons in an infinite scroll. */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          <span className="text-cave-400">
            Shards <span className="tnum font-semibold text-[#d8b8ee]">{Math.floor(state.relics.shards)}</span>
          </span>
          <span className="text-cave-500">·</span>
          {/* The second price. A fusion is bought out of the same purse as the
              Core tree, which is what stops it being a button you hold down. */}
          <span className="text-cave-400">
            Cores <span className="tnum font-semibold text-[#e8c98a]">{Math.floor(getCurrency(state, 'core').toNumber())}</span>
          </span>
          <span className="text-cave-500">·</span>
          <span className={held.length >= holdCap(state) ? 'text-amber-400' : 'text-cave-400'}>
            Hold <span className="tnum">{held.length}/{holdCap(state)}</span>
            {held.length >= holdCap(state) && ' — the weakest render themselves down'}
          </span>
          {state.relics.floorBonus > 0 && (
            <>
              <span className="text-cave-500">·</span>
              <span className="text-cave-400" title="Completion raises the MINIMUM roll. A late relic can never be worse than an early one.">
                Floor <span className="tnum text-emerald-400/80">+{Math.round(rollFloor(state) * 100)}%</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* RESONANCE — found by wearing, never listed before it fires (pillar 5).
          The LIVE state is the headline now: a set bonus that is currently
          firing has to be readable at a glance, not inferred from a border. */}
      {(activeResonances(state).length > 0 || state.relics.resonancesFound.length > 0) && (
        <div className={`panel p-3 ${activeResonances(state).length > 0 ? 'border-[#d8b8ee]/50' : ''}`}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#d8b8ee]">They recognise each other</span>
            {activeResonances(state).length > 0 && (
              <span className="shrink-0 rounded bg-[#d8b8ee]/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#d8b8ee]">
                Resonating · {activeResonances(state).length}
              </span>
            )}
          </div>
          {RESONANCES.filter((res) => state.relics.resonancesFound.includes(res.id)).map((res) => {
            const on = activeResonances(state).some((a) => a.id === res.id);
            const wearing = state.relics.equipped
              .map((uid) => held.find((h) => h.uid === uid))
              .filter((h) => h?.source === res.source).length;
            return (
              <div key={res.id} className={`mt-1.5 rounded-md border px-2 py-1.5 ${
                on ? 'border-[#d8b8ee]/40 bg-[#d8b8ee]/5' : 'border-cave-800 opacity-60'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-[12px] font-semibold ${on ? 'text-[#d8b8ee]' : 'text-cave-400'}`}>
                    {on && <span className="mr-1">◆</span>}{res.name}
                  </span>
                  <span className={`tnum shrink-0 text-[10px] ${on ? 'text-[#d8b8ee]' : 'text-cave-500'}`}>
                    {on
                      ? `FIRING · +${Math.round((res.mult - 1) * 100)}% to every line on those ${wearing}`
                      : `${wearing}/${res.need} from ${SOURCE_BY_ID.get(res.source)?.name ?? res.source} worn`}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] italic leading-snug text-cave-400">{res.line}</div>
              </div>
            );
          })}
        </div>
      )}

      {held.length === 0 && (
        <div className="panel p-3 text-[11px] italic text-cave-400">
          Nothing yet. They come up out of the deep shaft, out of Warrens, out of anomalies and
          wells, and back with the crews.
        </div>
      )}

      {held.map((r) => {
        const worn = state.relics.equipped.includes(r.uid);
        const src = SOURCE_BY_ID.get(r.source);
        return (
          <div key={r.uid} className={`panel p-3 ${worn ? 'border-lamp-500/40' : ''}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-cave-200">
                {r.locked && <span className="mr-1 text-[#e6c15a]" title="Locked — cannot be fused away or given to a case">🔒</span>}
                {RARITIES[r.rarity]} relic
                {r.fusedFrom > 0 && <span className="ml-1 text-[10px] text-cave-500">·{r.fusedFrom} fused in</span>}
              </span>
              <span className="shrink-0 text-[10px] text-cave-500">from {src?.name ?? r.source}</span>
            </div>
            {/* WHERE IT CAME FROM. Every field was already in state at the
                moment it was minted and used to be thrown away for a rarity
                colour. Relics found before A.46 have no story and say nothing
                — inventing one would be worse than the silence. */}
            {r.found && (
              <div className="mt-1 text-[10px] leading-snug text-cave-500">
                Found at depth <span className="tnum text-cave-400">{r.found.depth}</span>
                {' '}in {r.found.shell}, run <span className="tnum text-cave-400">{r.found.run + 1}</span>
                {r.found.by && <> — turned up by <span className="text-cave-400">{r.found.by}</span></>}
              </div>
            )}

            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {Object.entries(r.affixes).map(([k, v]) => {
                const step = wakingStep(r);
                const res = activeResonances(state)
                  .filter((x) => x.source === r.source).reduce((m, x) => m * x.mult, 1);
                const live = v * step.mult * res;
                return (
                  <span key={k} className="tnum text-[11px] text-cave-400">
                    {AFFIXES[k]?.label ?? k} <span className="text-lamp-400">+{Math.round(live * 100)}%</span>
                    {live > v + 1e-9 && (
                      <span className="ml-0.5 text-[9px] text-cave-500">(base {Math.round(v * 100)}%)</span>
                    )}
                  </span>
                );
              })}
            </div>

            {/* WAKING — carried time, so an idle player wakes theirs at the
                same rate simply by wearing them (pillar 1). A dormant relic
                never advertises what it becomes (pillar 5). */}
            <div className="mt-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-[10px] uppercase tracking-wider ${
                  wakingOf(r) === 0 ? 'text-cave-500' : 'text-[#9fd8c0]'}`}>
                  {wakingStep(r).name}
                  {wakingStep(r).mult > 1 && <span className="ml-1 tnum">×{wakingStep(r).mult.toFixed(2)}</span>}
                </span>
                {wakingNeed(r) !== null && (
                  <span className="tnum shrink-0 text-[9px] text-cave-500">
                    {Math.ceil(wakingNeed(r)! / 60)}m carried to go
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[10px] italic leading-snug text-cave-400">{wakingStep(r).line}</div>
            </div>

            {/* THE POWER (A.48) — the half of a relic that is not a percentage,
                and the reason six slots is a build rather than a sort. It is
                INERT while the relic is Dormant and turns on at Stirring, which
                is the visible change-over-time the waking bar was promising and
                never delivering. Dormant names it and says nothing else
                (pillar 5): what it does arrives when it wakes. */}
            {(() => {
              const pw = powerOf(r);
              if (!pw) return null;
              const live = powerLive(r);
              return (
                <div className={`mt-1.5 rounded-md border px-2 py-1.5 ${
                  live ? 'border-[#e8c98a]/50 bg-[#e8c98a]/5' : 'border-cave-800 border-dashed'}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`text-[11px] font-semibold ${live ? 'text-[#e8c98a]' : 'text-cave-500'}`}>
                      {pw.name}
                    </span>
                    <span className="shrink-0 text-[9px] uppercase tracking-wider text-cave-500">
                      {live ? KIND_NAME[pw.kind] : 'sleeping'}
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
            })()}
            <div className="mt-2 flex gap-1.5">
              {!worn ? (
                <button
                  className="btn flex-1 py-1 text-[11px]"
                  disabled={state.relics.equipped.length >= RELIC_SLOTS}
                  onClick={() => dispatch({ type: 'equipRelic', uid: r.uid, slot: state.relics.equipped.length })}
                >
                  Wear it
                </button>
              ) : (
                <button
                  className="btn flex-1 py-1 text-[11px]"
                  onClick={() => dispatch({ type: 'unequipRelic', slot: state.relics.equipped.indexOf(r.uid) })}
                >
                  Take it off
                </button>
              )}
              {held.length > 1 && (
                <button
                  className="btn flex-1 py-1 text-[11px]"
                  title="Keeps the better of each line from both. Nothing is lost."
                  onClick={() => setFusingInto(fusingInto === r.uid ? null : r.uid)}
                >
                  {fusingInto === r.uid ? 'Never mind' : 'Fuse one in…'}
                </button>
              )}
              {/* THE LOCK: keep-forever. Guards the only two paths that consume a
                  relic — being fed into a fusion, and being given to a case. */}
              <button
                className={`btn shrink-0 px-2 py-1 text-[11px] ${r.locked ? 'btn-warm' : ''}`}
                title={r.locked
                  ? 'Locked — it cannot be fused away or given to a Museum case. Click to unlock.'
                  : 'Lock it — it can never be fused away or given to a Museum case.'}
                aria-pressed={!!r.locked}
                onClick={() => dispatch({ type: 'toggleRelicLock', uid: r.uid })}
              >
                {r.locked ? '🔒' : '🔓'}
              </button>
              {/* RENDER IT DOWN. The manual version of what the cap does on its
                  own — turns a relic you will not miss into the shards a fusion
                  costs. Never offered for a locked or worn one; the engine
                  refuses both, so this can never present a choice that fails. */}
              {!worn && !r.locked && (
                <button
                  className="btn shrink-0 px-2 py-1 text-[11px]"
                  title={`Render it down for ${shardValue(r)} shards. Gone for good.`}
                  onClick={() => dispatch({ type: 'renderRelic', uid: r.uid })}
                >
                  ⚒ {shardValue(r)}
                </button>
              )}
            </div>

            {/* The chooser. Fusion eats a relic, so the player picks WHICH one
                and sees what it would actually contribute first. */}
            {fusingInto === r.uid && (
              <div className="mt-2 space-y-1 border-t border-cave-700 pt-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-widest text-cave-500">
                    Feed into this one — the fed relic is consumed
                  </span>
                </div>
                {/* THE PRICE, where the decision is. Two of them: shards climb
                    with what has already been fused into THIS relic, Cores climb
                    with every fusion you have ever done. The next-price line is
                    the whole point — the player must be able to see the wall
                    coming before they hit it. */}
                {(() => {
                  const af = fusionAfford(state, r);
                  const next = fusionCost({ ...state, relics: { ...state.relics, fused: state.relics.fused + 1 } }, { ...r, fusedFrom: r.fusedFrom + 1 });
                  return (
                    <div className={`rounded-md border px-2 py-1.5 ${
                      af.ok ? 'border-cave-700' : 'border-amber-500/40 bg-amber-500/5'}`}>
                      <div className="flex flex-wrap items-baseline gap-x-3 text-[11px]">
                        <span className={af.ok ? 'text-[#d8b8ee]' : 'text-amber-400'}>
                          <span className="tnum font-semibold">{af.price.shards}</span> shards
                        </span>
                        <span className={af.ok ? 'text-[#e8c98a]' : 'text-amber-400'}>
                          <span className="tnum font-semibold">{af.price.cores}</span> Cores
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10px] leading-snug text-cave-500">
                        {af.ok
                          ? <>After this one, the next fusion into it wants <span className="tnum text-cave-400">{next.shards}</span> shards and <span className="tnum text-cave-400">{next.cores}</span> Cores. Every fusion makes the next dearer.</>
                          : <span className="text-amber-400">Short {af.short.join(' and ')}. Render something down, or collapse the world for Cores.</span>}
                      </div>
                    </div>
                  );
                })()}
                {/* A LOCKED relic is never offered as food — the engine refuses it
                    too, so this list can never present a choice that would fail. */}
                {held.filter((o) => o.uid !== r.uid && !o.locked).map((o) => {
                  const pv = fusionPreview(state, r.uid, o.uid);
                  const worthIt = pv && (pv.gained.length > 0 || pv.improved.length > 0 || pv.rarityUp);
                  const oWorn = state.relics.equipped.includes(o.uid);
                  const broke = !fusionAfford(state, r).ok;
                  return (
                    <button
                      key={o.uid}
                      className={`block w-full rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${
                        worthIt && !pv?.gatedBy && !broke
                          ? 'border-cave-700 hover:border-lamp-500/50 hover:bg-cave-800'
                          : 'border-cave-800 opacity-60 hover:bg-cave-800'
                      }`}
                      disabled={!!pv?.gatedBy || broke}
                      onClick={() => {
                        dispatch({ type: 'fuseRelics', keepUid: r.uid, feedUid: o.uid });
                        setFusingInto(null);
                      }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-cave-200">
                          {RARITIES[o.rarity]} · from {SOURCE_BY_ID.get(o.source)?.name ?? o.source}
                        </span>
                        {oWorn && <span className="shrink-0 text-[9px] uppercase tracking-wider text-amber-400">worn</span>}
                      </div>
                      <div className="mt-0.5 text-[10px] leading-snug text-cave-400">
                        {!pv || (pv.gained.length === 0 && pv.improved.length === 0 && !pv.rarityUp) ? (
                          <span className="italic">Adds nothing this one does not already beat.</span>
                        ) : (
                          <>
                            {pv.rarityUp && !pv.gatedBy && <span className="mr-2 text-lamp-400">rarity up</span>}
                            {pv.powerGained && (
                              <span className="mr-2 text-[#e8c98a]">takes its power · {pv.powerGained}</span>
                            )}
                            {/* B4: the museum gate, said BEFORE the attempt. */}
                            {pv.gatedBy && (
                              <span className="mr-2 text-[#d4a86a]">
                                rarity up needs {pv.gatedBy.need} Museum cases ({pv.gatedBy.have} done)
                              </span>
                            )}
                            {pv.gained.map((g) => (
                              <span key={g.key} className="mr-2 text-lamp-400">
                                +{g.label} {Math.round(g.value * 100)}%
                              </span>
                            ))}
                            {pv.improved.map((i) => (
                              <span key={i.key} className="mr-2 text-lamp-300">
                                {i.label} {Math.round(i.from * 100)}→{Math.round(i.to * 100)}%
                              </span>
                            ))}
                            {pv.wasted.length > 0 && (
                              <span className="text-cave-600">({pv.wasted.length} already beaten)</span>
                            )}
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
                {held.every((o) => o.uid === r.uid || o.locked) && (
                  <p className="text-[10px] italic text-cave-500">
                    Every other relic you hold is locked. Unlock one to feed it in.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Museum
// ---------------------------------------------------------------------------

/**
 * THE MUSEUM (rebuilt A.48) — the arrangement IS the verb.
 *
 * A.47 kept the donated relic whole and gave the halls exhibits to notice, and
 * play still reported "a donate button", correctly: the panel picked WHICH
 * relic to give (`held.find(r => !r.locked)`) and offered three arbitrary halls
 * to move it to afterwards. The player was never asked the question the system
 * is built around.
 *
 * So the halls are now a board. Each one shows its plinths — filled and empty —
 * and placing is two deliberate choices: which piece, and where it stands. An
 * exhibit forms out of what ends up next to what, is never listed before it
 * forms (pillar 5), and is undone by moving a piece back out, which is what
 * makes an arrangement a decision rather than a one-way donation.
 */
export function MuseumPanel() {
  const state = useLive();
  const [placingIn, setPlacingIn] = useState<string | null>(null);
  const [movingUid, setMovingUid] = useState<number | null>(null);
  if (!state) return null;

  const pieceOf = (uid: number) => state.museum.pieces.find((p) => p.relic.uid === uid);

  return (
    <div className="space-y-2">
      {/* A.47 FOLLOW-UP: no panel-owned title card here. Museum has its own
          SystemHeader now (title, purpose, "X/Y cases" status, and the same
          next-hint text this card used to restate). */}

      {/* WHAT THE ARRANGEMENT MEANS. Only formed exhibits appear — nothing is
          listed before it happens (pillar 5), so this whole panel is absent
          until the player's own placing makes one. */}
      {state.museum.exhibitsFound.length > 0 && (
        <div className={`panel p-3 ${activeExhibits(state).length > 0 ? 'border-[#e8c98a]/50' : ''}`}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#e8c98a]">
              Exhibits · {state.museum.exhibitsFound.length} found
            </span>
            {activeExhibits(state).length > 0 && (
              <span className="shrink-0 rounded bg-[#e8c98a]/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#e8c98a]">
                Standing · {activeExhibits(state).length}
              </span>
            )}
          </div>
          {EXHIBITS.filter((e) => state.museum.exhibitsFound.includes(e.id)).map((e) => {
            const live = activeExhibits(state).find((a) => a.def.id === e.id);
            return (
              <div key={e.id} className={`mt-1.5 rounded-md border px-2 py-1.5 ${
                live ? 'border-[#e8c98a]/40 bg-[#e8c98a]/5' : 'border-cave-800 opacity-60'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-[12px] font-semibold ${live ? 'text-[#e8c98a]' : 'text-cave-400'}`}>
                    {live && <span className="mr-1">◆</span>}{e.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-cave-500">
                    {live
                      ? `in ${CASE_BY_ID.get(live.caseId)?.name ?? live.caseId} · +${Math.round(e.bonus * 100)}% ${BUCKET_NAME[e.bucket]}`
                      : 'taken apart — the pieces no longer stand together'}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] italic leading-snug text-cave-400">{e.line}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* THE HALLS. A relic case is a room with plinths in it, and which plinth
          a thing stands on is the only question the Museum asks. */}
      <div className="panel p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#e8c98a]">The halls</span>
          <span className="tnum shrink-0 text-[10px] text-cave-400">
            {state.museum.pieces.filter((p) => p.identified).length}/{state.museum.pieces.length} studied
          </span>
        </div>
        <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
          Where a thing stands is the choice. Some arrangements are noticed; nobody will tell
          you which. A piece under a cloth counts for its hall and is invisible to everything
          else — study it and the hall grows worth as well as a story.
        </p>
      </div>

      {RELIC_HALLS.map((c) => {
        const p = caseProgress(state, c.id);
        const done = state.museum.completed.includes(c.id);
        const standing = state.museum.pieces.filter((x) => x.caseId === c.id);
        const room = p.have < p.need;
        const here = activeExhibits(state).filter((a) => a.caseId === c.id);
        return (
          <div key={c.id} className={`panel p-3 ${here.length > 0 ? 'border-[#e8c98a]/50' : done ? 'border-lamp-500/40' : ''}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-cave-200">{c.name}</span>
              <span className="tnum shrink-0 text-[10px] text-cave-400">{p.have}/{p.need}</span>
            </div>
            <p className="mt-1 text-[11px] italic leading-snug text-cave-400">{c.blurb}</p>

            {/* THE PLINTHS. Filled and empty both drawn, because an empty
                plinth is the thing that makes the room ask a question. */}
            <div className="mt-1.5 flex flex-wrap gap-1">
              {Array.from({ length: c.need }, (_, i) => {
                const piece = standing[i];
                if (!piece) {
                  return (
                    <span key={`e${i}`} className="rounded border border-dashed border-cave-800 px-1.5 py-0.5 text-[10px] text-cave-600">
                      empty
                    </span>
                  );
                }
                return (
                  <button
                    key={piece.relic.uid}
                    className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                      piece.identified
                        ? 'border-[#e8c98a]/50 text-[#e8c98a] hover:bg-[#e8c98a]/10'
                        : 'border-cave-700 text-cave-400 hover:bg-cave-800'
                    }`}
                    title={piece.identified ? 'Studied — click for its story' : 'Under a cloth — click to study or move it'}
                    onClick={() => setMovingUid(movingUid === piece.relic.uid ? null : piece.relic.uid)}
                  >
                    {piece.identified ? RARITIES[piece.relic.rarity] : '▨ unstudied'}
                  </button>
                );
              })}
            </div>

            {/* What the room is currently paying, research included. */}
            <div className="mt-1.5 text-[10px] text-cave-500">
              {done ? 'Filled — ' : 'When filled — '}
              <span className="text-lamp-400">
                +{Math.round(caseBonusNow(state, c) * 100)}% {BUCKET_NAME[c.bucket]}
              </span>
              {piecesInCase(state, c.id).length > 0 && (
                <span className="text-cave-500">
                  {' '}(+{Math.round(c.bonus * 100)}% base, +{Math.round((caseBonusNow(state, c) - c.bonus) * 100)}% from {piecesInCase(state, c.id).length} studied)
                </span>
              )}
            </div>
            {here.map((a) => (
              <div key={a.def.id} className="mt-1 text-[10px] text-[#e8c98a]">
                ◆ {a.def.name} stands here — +{Math.round(a.def.bonus * 100)}% {BUCKET_NAME[a.def.bucket]}
              </div>
            ))}

            {/* PLACE — the player picks WHICH relic. This used to pick for them
                (`held.find(r => !r.locked)`), which is exactly why a system
                built on arrangement played as a donate button. */}
            {room && (
              <button
                className="btn mt-2 w-full py-1 text-[11px]"
                disabled={state.relics.held.filter((r) => !r.locked).length === 0}
                onClick={() => { setPlacingIn(placingIn === c.id ? null : c.id); setMovingUid(null); }}
              >
                {state.relics.held.some((r) => !r.locked)
                  ? placingIn === c.id ? 'Never mind' : 'Stand something here…'
                  : 'Nothing unlocked to place'}
              </button>
            )}
            {placingIn === c.id && (
              <div className="mt-1.5 space-y-1 border-t border-cave-700 pt-1.5">
                <div className="text-[10px] uppercase tracking-widest text-cave-500">
                  Which one stands in {c.name}
                </div>
                {state.relics.held.filter((r) => !r.locked).map((r) => (
                  <button
                    key={r.uid}
                    className="block w-full rounded-md border border-cave-700 px-2 py-1.5 text-left text-[11px] transition-colors hover:border-lamp-500/50 hover:bg-cave-800"
                    onClick={() => { dispatch({ type: 'donateRelic', uid: r.uid, caseId: c.id }); setPlacingIn(null); }}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-cave-200">{RARITIES[r.rarity]} · from {SOURCE_BY_ID.get(r.source)?.name ?? r.source}</span>
                      {state.relics.equipped.includes(r.uid) && (
                        <span className="shrink-0 text-[9px] uppercase tracking-wider text-amber-400">worn</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[10px] leading-snug text-cave-500">
                      {r.found
                        ? <>depth {r.found.depth} · {r.found.shell} · run {r.found.run + 1}{r.found.by ? ` · ${r.found.by}` : ''}</>
                        : <span className="italic">no record of where this came from</span>}
                      {(r.waking ?? 0) >= 2 && <span className="ml-1 text-[#9fd8c0]">awake</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* The piece detail, opened from its plinth. Study and re-place both
                live here, so the arrangement is reversible by construction. */}
            {standing.some((x) => x.relic.uid === movingUid) && (() => {
              const piece = pieceOf(movingUid!)!;
              const cost = identifyCost(piece);
              const shardCost = identifyShardCost(piece);
              const canScrip = getCurrency(state, 'scrip').gte(cost);
              const canShard = state.relics.shards >= shardCost;
              return (
                <div className="mt-1.5 rounded-md border border-cave-700 px-2 py-1.5">
                  <div className="text-[11px] text-cave-200">
                    {piece.identified ? `${RARITIES[piece.relic.rarity]} relic` : 'Unidentified piece'}
                    {piece.identified && (piece.relic.waking ?? 0) >= 2 && (
                      <span className="ml-1 text-[10px] text-[#9fd8c0]">awake</span>
                    )}
                  </div>
                  {piece.identified ? (
                    piece.relic.found ? (
                      <div className="mt-0.5 text-[10px] leading-snug text-cave-500">
                        Found at depth <span className="tnum text-cave-400">{piece.relic.found.depth}</span>
                        {' '}in {piece.relic.found.shell}, run <span className="tnum text-cave-400">{piece.relic.found.run + 1}</span>
                        {piece.relic.found.by && <> — turned up by <span className="text-cave-400">{piece.relic.found.by}</span></>}
                      </div>
                    ) : (
                      <div className="mt-0.5 text-[10px] italic leading-snug text-cave-500">
                        Nobody wrote down where this came from.
                      </div>
                    )
                  ) : (
                    <div className="mt-0.5 text-[10px] italic leading-snug text-cave-500">
                      Under a cloth until somebody does the reading. It counts for this hall, and
                      no exhibit can recognise it.
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {!piece.identified && (
                      <button
                        className="btn px-2 py-1 text-[11px]"
                        disabled={!canScrip && !canShard}
                        title={canScrip ? `Study it — ${cost} Scrip` : `Study it the hard way — ${shardCost} shards`}
                        onClick={() => dispatch({ type: 'identifyPiece', uid: piece.relic.uid })}
                      >
                        {canScrip ? `Study · ${cost} Scrip` : `Study · ${shardCost} shards`}
                      </button>
                    )}
                    {/* Every hall with room, not an arbitrary three. */}
                    {RELIC_HALLS.filter((h) => h.id !== c.id
                      && (state.museum.donated[h.id]?.length ?? 0) < h.need).map((h) => (
                      <button
                        key={h.id}
                        className="btn px-2 py-1 text-[11px]"
                        title={`Move it to ${h.name}`}
                        onClick={() => { dispatch({ type: 'movePiece', uid: piece.relic.uid, caseId: h.id }); setMovingUid(null); }}
                      >
                        → {h.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })}

      {/* The cases that want something other than a relic. These are shelves,
          not halls — there is nothing to arrange, so they keep the plain
          mount-the-next-thing control they have always had. */}
      {CASES.filter((c) => c.from !== 'relic').map((c) => {
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
            </div>
            {!done && (() => {
              const owned = museumCandidates(state, c.from);
              const given = state.museum.donated[c.id] ?? [];
              const next = owned.find((k) => !given.includes(k.key));
              return (
                <button
                  className="btn mt-2 w-full py-1 text-[11px]"
                  disabled={!next}
                  onClick={() => next && dispatch({ type: 'donateItem', caseId: c.id, key: next.key })}
                >
                  {next ? `Mount ${next.label}` : 'Nothing new to mount yet'}
                </button>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expeditions
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
