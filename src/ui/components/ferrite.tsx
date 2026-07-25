/**
 * Phase 4 UI: the Breach (the game's biggest beat — staged, not a dialog),
 * the Alloy Crucible, the Foundry, and the Magnet Array purchase card.
 */
import { useEffect, useState } from 'react';
import {
  breachEchoPreview,
  canBreach,
  carriedStrength,
  currencyDef,
  currentShell,
  fmt,
  getCurrency,
  nextShell,
  resonantMemoryCost,
} from '../../engine';
import { CARRY_BASE } from '../../engine/signatures';
import { keystoneFor, keystoneIdlePrice, keystonePlaced, keystoneSatisfied } from '../../engine/systems/keystones';
import { faceWhole } from '../../engine/systems/absence';
import { chipCurrencyId } from '../../engine/shells';
import type { GameState } from '../../engine';
import { materialsOfShell } from '../../engine/materials';
import { materialCount, equippedTool, alloySlotsUsable } from '../../engine/systems/forge';
import { transmuteUnlocked } from '../../engine/systems/refinery';
import { ExportProduceRow } from './exports';
import {
  buyMagnet as _bm, // typing anchor
  magnetArrayUnlocked,
  magnetCost,
  MAGNET_MASTERY,
} from '../../engine/systems/polarity';
import { METALS, alloyDef } from '../../engine/content/shell2/alloys';
import {
  alloyLivePct,
  castBindingCosts,
  castingForAlloy,
  crucibleSystem,
  crucibleUnlocked,
  CRUCIBLE_MASTERY,
  POUR_UNIT,
} from '../../engine/content/shell2/crucibleSystem';
import { CASTING_BIND_TIER, materialDef } from '../../engine/materials';
import {
  FOUNDRY_MODULES,
  foundryUnlocked,
  moduleDef,
  nextSlotCost,
  FOUNDRY_MAX_SLOTS,
} from '../../engine/systems/foundry';
import { dispatch, useGame } from '../store';
import { usePersisted } from '../usePersisted';
import { Amount, HoldButton, BUCKET_NAME } from './shared';
import { MaterialIcon } from './MaterialIcon';

void _bm;

// ---------------------------------------------------------------------------
// The Breach — card + full-screen sequence
// ---------------------------------------------------------------------------

export function BreachCard() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const shell = currentShell(state);
  const to = nextShell(state);
  if (!to || state.depth < shell.floorDepth - 10) return null;
  const ready = canBreach(state);
  const echoes = breachEchoPreview(state);

  return (
    <div className="panel border-[#8be9fd]/30 p-4 text-center">
      <div className="text-[10px] uppercase tracking-widest text-[#8be9fd]">The Floor of {shell.name}</div>
      <p className="mt-2 text-xs leading-relaxed text-cave-300">
        {ready
          ? 'It is thin here. You can hear another world through it — colder, and it hums. Everything you built in this one stays behind.'
          : `${shell.floorDepth - state.depth} depths above the floor. It sounds hollow already.`}
      </p>
      <div className="mt-2 text-xs text-cave-400">
        Breaching yields <span className="tnum font-bold text-[#d8ccf0]">{fmt(echoes)} Echoes</span>
        <span className="block text-[10px] opacity-80">⌊3 · (Cores earned this breach / 500)^0.6⌋ — collapse more first to raise it.</span>
      </div>
      <KeystoneCard />
      <HoldButton
        onConfirm={() => {
          window.dispatchEvent(new CustomEvent('hollow:breach'));
        }}
        disabled={!ready}
        holdMs={2000}
        className="btn mt-3 w-full border-[#8be9fd]/50 py-3 text-sm font-bold tracking-widest text-[#8be9fd]"
      >
        {breachBlockerLabel(state as GameState, ready)}
      </HoldButton>
    </div>
  );
}

/**
 * What the button SAYS when it is dead. Every gate in canBreach() gets a
 * branch here; the fallback is the floor, and only the floor.
 *
 * The bug this replaces: the Hollow's faceWhole() gate had no branch, so the
 * chain fell through to "Reach the floor first" — printed while the player
 * stood ON the floor at depth 560, with no hint that the face was the gate.
 */
function breachBlockerLabel(state: GameState, ready: boolean): string {
  if (ready) return 'HOLD — AND LET GO OF EVERYTHING';
  const shell = currentShell(state);
  if (state.depth < shell.floorDepth) return 'Reach the floor first';
  if (!state.combat.wardens.includes(shell.id)) return 'The Warden holds the floor';
  if (!keystoneSatisfied(state)) return 'The floor is open but unshored';
  if (shell.id === 'hollow' && !faceWhole(state)) {
    return `The face is not whole — ${state.hollow.rebuilt.length}/${state.face.cells.length} cells`;
  }
  return 'The floor holds';
}

/**
 * THE KEYSTONE (Part B) — the Breach gate, said plainly where the Breach
 * lives. Two legs, both printed: craft it from the shell's own system, or
 * pay the Guild's slow haul in chip currency. Shells with no keystone
 * (III–VII until the creative pass) render nothing.
 */
function KeystoneCard() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const shell = currentShell(state);
  const def = keystoneFor(shell.id);
  if (!def) return null;
  const placed = keystonePlaced(state, shell.id);
  if (placed) {
    return (
      <div className="mt-2 rounded-md border border-[#8be9fd]/20 p-2 text-[11px] text-cave-400">
        <span className="text-[#9fd8c0]">✓ {def.name} is set.</span> The floor is shored, this lap and every lap after.
      </div>
    );
  }
  const price = keystoneIdlePrice(state, def);
  const craftBits = [
    ...(def.craft.materials ?? []).map((m) => `${m.count} ${materialDef(m.id).name}`),
    ...(def.craft.currencies ?? []).map((c) => `${c.amount} ${c.id}`),
  ].join(' + ');
  return (
    <div className="mt-2 rounded-md border border-[#8be9fd]/20 p-2 text-left">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-cave-300">{def.name}</div>
      <div className="mt-0.5 text-[10px] italic leading-snug text-cave-500">{def.flavor}</div>
      <div className="mt-1.5 flex flex-col gap-1">
        <button
          className="btn min-h-[40px] w-full text-xs"
          onClick={() => dispatch({ type: 'placeKeystone', leg: 'craft' })}
        >
          Set it — {craftBits} <span className="text-cave-500">({def.craft.source})</span>
        </button>
        <button
          className="btn min-h-[40px] w-full text-xs text-cave-300"
          onClick={() => dispatch({ type: 'placeKeystone', leg: 'buy' })}
        >
          Or the Guild hauls one up — <Amount value={price} color="#8be9fd" /> {chipCurrencyId(state)}
        </button>
      </div>
    </div>
  );
}

type BreachStage = 'idle' | 'quake' | 'fall' | 'title';

export function BreachOverlay() {
  const reducedMotion = useGame((s) => s.reducedMotion);
  const [stage, setStage] = useState<BreachStage>('idle');
  const [title, setTitle] = useState('');

  useEffect(() => {
    const start = () => {
      if (reducedMotion) {
        // Quiet version: dispatch, fade, title, done.
        dispatch({ type: 'breach' });
        const s = useGame.getState().state;
        setTitle(s ? currentShell(s).title : '');
        setStage('title');
        window.setTimeout(() => setStage('idle'), 1600);
        return;
      }
      setStage('quake');
      window.setTimeout(() => {
        setStage('fall');
        dispatch({ type: 'breach' });
        const s = useGame.getState().state;
        setTitle(s ? currentShell(s).title : '');
      }, 1400);
      window.setTimeout(() => setStage('title'), 3100);
      window.setTimeout(() => setStage('idle'), 5200);
    };
    window.addEventListener('hollow:breach', start);
    return () => window.removeEventListener('hollow:breach', start);
  }, [reducedMotion]);

  if (stage === 'idle') return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[90]">
      {stage === 'quake' && (
        <div className="breach-quake absolute inset-0 bg-transparent">
          <div className="breach-cracks absolute inset-0" />
        </div>
      )}
      {stage === 'fall' && (
        <div className="absolute inset-0 bg-black">
          <div className="breach-motes absolute inset-0" />
        </div>
      )}
      {stage === 'title' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="breach-title text-center">
            <div className="font-display text-3xl font-bold tracking-[0.35em] text-[#9fc4dd] sm:text-5xl">
              {title.split('·')[0]?.trim()}
            </div>
            <div className="mt-3 text-sm uppercase tracking-[0.5em] text-[#5c7c94]">
              {title.split('·')[1]?.trim()}
            </div>
            <div className="mt-6 text-xs italic text-cave-400">The rock is colder here. And it is listening.</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Magnet Array purchase card (poles toggle on the face itself)
// ---------------------------------------------------------------------------

export function MagnetCard() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state || currentShell(state).id !== 'ferrite') return null;
  const unlocked = magnetArrayUnlocked(state);
  const cost = magnetCost(state);
  const full = state.polarity.magnetCount >= state.face.w;

  return (
    <div className="panel p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-cave-200">The Magnet Array</div>
          <div className="mt-0.5 text-xs leading-snug text-cave-400">
            {unlocked
              ? `Column magnets bias the rock's polarity 85% toward their pole. Rigged: ${state.polarity.magnetCount}/${state.face.w} — tap a magnet above the face to set + / − / off.`
              : `Answers to Ferrite Mastery ${MAGNET_MASTERY} (depth record ${MAGNET_MASTERY * 10}).`}
          </div>
        </div>
        {unlocked && !full && (
          <button
            className="btn shrink-0 px-3 py-1 text-xs"
            disabled={getCurrency(state, 'scale').lt(cost)}
            onClick={() => dispatch({ type: 'buyMagnet' })}
          >
            Rig · <Amount value={cost} color="#8a97a8" /> Scale
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Alloy Crucible
// ---------------------------------------------------------------------------

const METAL_COLORS = ['#9fb3c8', '#7fd4e0', '#8a97a8', '#7c8ede', '#cfeef7'];

/** A saved set of dials — five metal counts plus the catalyst. */
interface Mix { amounts: number[]; catalystId: string | null }

export function CruciblePanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [amounts, setAmounts] = useState<number[]>([2, 1, 0, 0, 0]);
  const [catalyst, setCatalyst] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  // Bench convenience, not game state — see usePersisted's header.
  const [lastMix, setLastMix] = usePersisted<Mix | null>('crucible.last', null);
  const [mixes, setMixes] = usePersisted<Array<Mix | null>>('crucible.mixes', [null, null, null]);
  if (!state) return null;

  if (!crucibleUnlocked(state)) {
    return (
      <div className="panel p-4 text-center text-xs italic text-cave-400">
        A crucible of black iron, found in the rubble of the fall. It wants Ferrite Mastery{' '}
        {CRUCIBLE_MASTERY} (depth record {CRUCIBLE_MASTERY * 10}) before it will hold a pour.
      </div>
    );
  }

  const catalysts = materialsOfShell('ferrite').filter((m) => materialCount(state, m.id) > 0);
  const chosen = catalyst && catalysts.some((c) => c.id === catalyst) ? catalyst : catalysts[0]?.id ?? null;
  const canPour = chosen !== null && amounts.reduce((a, b) => a + b, 0) >= 2;
  const codex = crucibleSystem.codex(state);
  const tool = equippedTool(state);
  const slotsUsable = alloySlotsUsable(state);

  return (
    <div className="space-y-2">
      {/* The pour */}
      <div className="panel space-y-2 p-3">
        <div className="text-[10px] uppercase tracking-widest text-cave-300">
          The Pour — {state.crucible.pours} poured, {state.crucible.fails} slag
        </div>
        {transmuteUnlocked(state) && (
          <div className="text-[10px] leading-snug text-cave-400">
            Every pour burns <span className="text-[#cbb072]">1 Kilnflux</span>{' '}
            <span className="tnum">(held {materialCount(state, 'kilnflux')})</span> — Loam's export.
            Fire it at the Refinery (The Kiln Firing) or buy it from Serra.
          </div>
        )}
        {METALS.map((metal, i) => (
          <div key={metal} className="flex items-center gap-2">
            <span className="w-20 text-xs capitalize" style={{ color: METAL_COLORS[i] }}>
              {metal}
            </span>
            <button
              className="btn btn-cell h-6 w-6 p-0 text-sm leading-none"
              disabled={(amounts[i] ?? 0) <= 0}
              onClick={() => setAmounts((a) => a.map((v, j) => (j === i ? v - 1 : v)))}
            >
              −
            </button>
            <span className="tnum w-6 text-center text-sm text-cave-200">{amounts[i]}</span>
            <button
              className="btn btn-cell h-6 w-6 p-0 text-sm leading-none"
              disabled={(amounts[i] ?? 0) >= 6}
              onClick={() => setAmounts((a) => a.map((v, j) => (j === i ? v + 1 : v)))}
            >
              +
            </button>
            <span className="tnum ml-auto text-[10px] text-cave-400">
              {(amounts[i] ?? 0) > 0 ? `${(amounts[i] ?? 0) * POUR_UNIT} ` : ''}
              {(amounts[i] ?? 0) > 0 && (
                <span style={{ color: METAL_COLORS[i] }}>
                  / {fmt(getCurrency(state, metal))}
                </span>
              )}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2 border-t border-cave-800 pt-2">
          <span className="text-xs text-cave-400">Catalyst</span>
          <div className="flex flex-1 flex-wrap gap-1">
            {catalysts.length === 0 && (
              <span className="text-[10px] italic text-cave-400">No Ferrite ore held — chip some first.</span>
            )}
            {catalysts.map((m) => (
              <button
                key={m.id}
                title={`${m.name} ×${materialCount(state, m.id)}`}
                className={`rounded border p-0.5 ${chosen === m.id ? 'border-[#9fc4dd]' : 'border-transparent opacity-60 hover:opacity-100'}`}
                onClick={() => setCatalyst(m.id)}
              >
                <MaterialIcon id={m.id} size={22} />
              </button>
            ))}
          </div>
        </div>
        {/* THE BENCH. Sixty alloys behind five dials means a lot of pours, and
            every one used to start by re-dialling the last mix from memory.
            None of this hints at an answer — it only replays what you already
            chose, which is the difference between ergonomics and a solution. */}
        <div className="flex flex-wrap items-center gap-1 border-t border-cave-800 pt-2">
          <button
            className="btn px-2 py-0.5 text-[10px]"
            disabled={!lastMix}
            title={lastMix ? 'Set the dials back to your last pour' : 'Nothing poured yet'}
            onClick={() => { if (lastMix) { setAmounts(lastMix.amounts); setCatalyst(lastMix.catalystId); } }}
          >
            ↺ Repeat last
          </button>
          <button
            className="btn px-2 py-0.5 text-[10px]"
            disabled={amounts.every((v) => v === 0)}
            onClick={() => setAmounts([0, 0, 0, 0, 0])}
          >
            Clear
          </button>
          <span className="ml-auto text-[9px] uppercase tracking-widest text-cave-500">Mixes</span>
          {[0, 1, 2].map((slot) => {
            const saved = mixes[slot];
            return (
              <span key={slot} className="flex items-center">
                <button
                  className={`btn px-1.5 py-0.5 text-[10px] tnum ${saved ? '' : 'opacity-60'}`}
                  title={saved ? 'Load this mix' : 'Save the current dials here'}
                  onClick={() => {
                    if (saved) { setAmounts(saved.amounts); setCatalyst(saved.catalystId); }
                    else setMixes(mixes.map((m, i) => (i === slot ? { amounts, catalystId: chosen } : m)));
                  }}
                >
                  {saved ? saved.amounts.join('·') : 'save'}
                </button>
                {saved && (
                  <button
                    className="px-0.5 text-[10px] leading-none text-cave-600 hover:text-cave-300"
                    aria-label={`Forget mix ${slot + 1}`}
                    onClick={() => setMixes(mixes.map((m, i) => (i === slot ? null : m)))}
                  >
                    ×
                  </button>
                )}
              </span>
            );
          })}
        </div>
        <button
          className="btn btn-warm w-full py-2 text-sm"
          disabled={!canPour}
          onClick={() => {
            const result = dispatch({ type: 'pourAlloy', amounts, catalystId: chosen! });
            if (result.ok) {
              const data = result.data as { result: string };
              setLastResult(data.result === 'slag' ? 'slag' : data.result);
              setLastMix({ amounts: [...amounts], catalystId: chosen });
            } else {
              setLastResult(`refused:${result.reason ?? 'The crucible refuses'}`);
            }
          }}
        >
          Pour
        </button>
        {lastResult && (
          <div className={`text-center text-xs ${lastResult === 'slag' ? 'text-cave-400' : lastResult.startsWith('refused:') ? 'text-[#d4a86a]' : 'text-[#9fc4dd]'}`}>
            {lastResult === 'slag'
              ? 'Slag. Half the metals drained off; the catalyst survived.'
              : lastResult.startsWith('refused:')
                ? lastResult.slice('refused:'.length)
                : `It poured true: ${alloyDef(lastResult).name}.`}
          </div>
        )}
        {state.crucible.lastHint && (
          <div className="border-t border-cave-800 pt-1.5 text-[11px] italic text-cave-300">
            “{state.crucible.lastHint}”
          </div>
        )}
      </div>

      {/* The export: iron cast for the shell below (Part B spine) */}
      <ExportProduceRow materialId="lodeframe" />

      {/* Codex — discovered alloys, bindable */}
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-cave-300">Alloy Codex</span>
          <span className="tnum text-[10px] text-cave-400">{codex.length} / 60</span>
        </div>
        {codex.length === 0 && (
          <p className="mt-1 text-[11px] italic text-cave-400">Nothing has poured true yet. The ratios are out there.</p>
        )}
        <div className="mt-1.5 space-y-1.5">
          {codex.map((entry) => {
            const openSlot = tool.alloys.findIndex((a) => a === null);
            const bound = tool.alloys.includes(entry.id);
            return (
              <div key={entry.id} className={`border-l-2 pl-2 ${entry.active ? 'border-[#9fc4dd]' : 'border-cave-700'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-cave-200">{entry.name}</span>
                  <span className="flex shrink-0 items-baseline gap-1.5">
                    {slotsUsable && !bound && openSlot >= 0 && (
                      <button
                        className="btn px-1.5 py-0 text-[10px]"
                        onClick={() => dispatch({ type: 'socketAlloy', toolId: tool.id, slot: openSlot, alloyId: entry.id })}
                      >
                        Bind · {fmt(alloyLivePct(state, entry.id))}%
                      </button>
                    )}
                    {bound && <span className="text-[9px] uppercase tracking-wider text-[#9fc4dd]">bound</span>}
                    {/* B4: the pattern made stock — its own ratio again buys a
                        casting that BINDS a Tier X+ tool (held count shown). */}
                    <button
                      className="btn px-1.5 py-0 text-[10px]"
                      disabled={!castBindingCosts(entry.id).every((c) => getCurrency(state, c.metal).gte(c.amount))}
                      title={`${materialDef(castingForAlloy(entry.id)).name} — a Tier ${CASTING_BIND_TIER}+ binding part. Costs ${castBindingCosts(entry.id).map((c) => `${c.amount} ${c.metal}`).join(' + ')}.`}
                      onClick={() => dispatch({ type: 'castBinding', alloyId: entry.id })}
                    >
                      Cast · {materialDef(castingForAlloy(entry.id)).name.split(' ')[0]}
                      <span className="tnum ml-1 text-cave-500">×{materialCount(state, castingForAlloy(entry.id))}</span>
                    </button>
                  </span>
                </div>
                <div className="text-[10px] italic text-cave-400">{entry.flavor}</div>
                <div className="text-[10px] text-cave-300">{entry.effect}</div>
              </div>
            );
          })}
        </div>
        {!slotsUsable && codex.length > 0 && (
          <p className="mt-2 text-[10px] italic text-cave-400">
            Binding alloys into tools answers to Ferrite Mastery 6 (tier IV+ tools carry the slots).
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Foundry
// ---------------------------------------------------------------------------

/** What a module actually does, in plain +/-% — the line the card was missing. */
function moduleEffectText(mod: { bucket: string; value: number }): string {
  const name = (BUCKET_NAME as Record<string, string>)[mod.bucket] ?? mod.bucket;
  if (mod.bucket === 'offlineEffAdd') return `+${Math.round(mod.value * 100)}% offline efficiency`;
  const pct = Math.round((mod.value - 1) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}% ${name}`;
}

export function FoundryPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state || !foundryUnlocked(state)) return null;
  const echoes = getCurrency(state, 'echo');

  return (
    <div className="space-y-2">
      <div className="panel flex items-center justify-between p-3">
        <div className="text-xs text-cave-400">
          Slots:{' '}
          <span className="tnum text-cave-200">
            {state.foundry.installed.length}/{state.foundry.slots}
          </span>
          <span className="opacity-60"> (max {FOUNDRY_MAX_SLOTS})</span>
          <span className="ml-3">
            Echoes: <Amount value={echoes} color="#d8ccf0" />
          </span>
        </div>
        {state.foundry.slots < FOUNDRY_MAX_SLOTS && (
          <button
            className="btn px-2.5 py-1 text-xs"
            disabled={echoes.lt(nextSlotCost(state))}
            onClick={() => dispatch({ type: 'buyFoundrySlot' })}
          >
            +Slot · <Amount value={nextSlotCost(state)} color="#d8ccf0" />
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        {FOUNDRY_MODULES.map((mod) => {
          const installed = state.foundry.installed.includes(mod.id);
          const clash = state.foundry.installed.find((o) => o !== mod.id && moduleDef(o).tag === mod.tag);
          const cur = currencyDef(mod.cost.currencyId);
          return (
            <div key={mod.id} className={`panel p-2.5 ${installed ? 'border-[#d8ccf0]/40' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-cave-200">{mod.name}</span>
                  <span className="ml-2 text-[9px] uppercase tracking-wider text-cave-400">[{mod.tag}]</span>
                  {/* The EFFECT, which the card never showed — only flavour. That
                      missing line is why a hovered module read as "random text". */}
                  <div className="text-[10px] font-medium text-[#c9b8f0]">{moduleEffectText(mod)}</div>
                  <div className="text-[10px] italic leading-snug text-cave-400">{mod.flavor}</div>
                </div>
                {installed ? (
                  <button className="btn shrink-0 px-2 py-0.5 text-[10px]" onClick={() => dispatch({ type: 'uninstallModule', id: mod.id })}>
                    Unbolt
                  </button>
                ) : (
                  <button
                    className="btn shrink-0 px-2 py-1 text-[10px]"
                    disabled={!!clash || getCurrency(state, mod.cost.currencyId).lt(mod.cost.amount)}
                    title={clash ? `Conflicts with ${moduleDef(clash).name}` : `${moduleEffectText(mod)} · costs ${fmt(mod.cost.amount)} ${cur.name}`}
                    onClick={() => dispatch({ type: 'installModule', id: mod.id })}
                  >
                    {clash ? 'Conflict' : <>Fit · <Amount value={mod.cost.amount} color={cur.color} /> {cur.name}</>}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Resonant Memory — the other Echo sink */}
      <div className="panel flex items-center justify-between p-3">
        <div className="min-w-0 text-xs text-cave-400">
          <span className="font-semibold text-cave-200">Resonant Memory</span>
          <span className="tnum ml-2">Lv {state.shell.resonantMemory}</span>
          <div className="text-[10px] leading-snug">
            Carried signatures run +15% stronger per level. Seepage came down with you;
            Polarity follows at the next breach.
          </div>
          {/* The Breach reward, attributed (B3 caveat): the carry IS most of
              what the echo layer is worth — say its strength out loud. */}
          {state.shell.signatures.length > 0 && (
            <div className="tnum mt-0.5 text-[10px] text-[#c9b8f0]">
              {state.shell.signatures.map((id) => id[0]!.toUpperCase() + id.slice(1)).join(' · ')} — each
              at {Math.round(carriedStrength(state as GameState) * 100)}% of native strength
              ({Math.round(CARRY_BASE * 100)}% base{state.shell.resonantMemory > 0
                ? ` + ${Math.round((carriedStrength(state as GameState) - CARRY_BASE) * 100)}% from your levels`
                : ''}).
            </div>
          )}
          <div className="mt-0.5 text-[10px] leading-snug text-cave-500">
            The third Echo sink — attention on your own margins — is spent in the Journal.
          </div>
        </div>
        <button
          className="btn shrink-0 px-2.5 py-1 text-xs"
          disabled={echoes.lt(resonantMemoryCost(state))}
          onClick={() => dispatch({ type: 'buyResonantMemory' })}
        >
          <Amount value={resonantMemoryCost(state)} color="#d8ccf0" /> Echo
        </button>
      </div>
    </div>
  );
}
