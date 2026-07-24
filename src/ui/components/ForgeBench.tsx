/**
 * THE BENCH — forging a tool from a HEAD, a HAFT and a BINDING.
 *
 * This is where "materials with souls" becomes a thing you do. Pick a tier, pick
 * three materials, and watch the tool's character emerge from their traits: a
 * keen head on a light haft reads as a fast Pick, a dense head on a dense haft
 * as a heavy Cleaver. The preview updates live, so the player learns the
 * vocabulary by moving the pieces.
 *
 * PILLAR 5: trait pairs the player has NOT yet found are folded into the preview
 * numbers but never NAMED — the stat moves, and forging reveals what did it. A
 * pair already in the Codex is named, because it is no longer a discovery.
 */
import { useMemo, useState } from 'react';
import { convCurrencyId, currencyDef, fmtNum, getCurrency, maxToolTier } from '../../engine';
import type { GameState } from '../../engine';
import { materialDef } from '../../engine/materials';
import { equippedTool, materialCount, partName } from '../../engine/systems/forge';
import {
  computePartStats, headTierCap, PART_SLOTS, type PartSlot, type ToolParts,
} from '../../engine/systems/toolParts';
import { marrowCritique } from '../../engine/systems/marrow';
import { traitsOf, activePairs, compositionLean, type TraitId } from '../../engine/traits';
import { dispatch, useGame } from '../store';
import { MaterialIcon } from './MaterialIcon';
import { Amount, TraitTag } from './shared';
import { Select } from './Select';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];

/** What each part cares about — shown on the picker so the choice is legible. */
const PART_WANTS: Record<PartSlot, string> = {
  head: 'meets the rock — wants EDGE (chip) and FORCE (strike)',
  haft: 'what you swing — wants HEFT (strike) and CADENCE (chip)',
  binding: 'holds it together — wants GRIP (sockets) and HOLD',
};

function TraitChips({ id, size = 'sm' }: { id: string; size?: 'sm' | 'xs' }) {
  return (
    <span className="flex flex-wrap gap-0.5">
      {traitsOf(id).map((t) => <TraitTag key={t} id={t} size={size} />)}
    </span>
  );
}

export function ForgeBench() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [tier, setTier] = useState(1);
  const [head, setHead] = useState<string | null>(null);
  const [haft, setHaft] = useState<string | null>(null);
  const [binding, setBinding] = useState<string | null>(null);
  const [open, setOpen] = useState<PartSlot | null>(null);
  const [bpName, setBpName] = useState('');

  const held = useMemo(
    () => (state ? Object.keys((state as GameState).materials.stacks).filter((id) => materialCount(state as GameState, id) > 0) : []),
    [state],
  );
  if (!state) return null;

  const cap = maxToolTier(state);
  // Head material must be able to head this tier; haft/binding are free.
  const headOptions = held.filter((id) => {
    const d = materialDef(id);
    return headTierCap(d.shellId, d.rarity) >= tier;
  });

  const pick = (slot: PartSlot) => (slot === 'head' ? head : slot === 'haft' ? haft : binding);
  const setPick = (slot: PartSlot, v: string | null) =>
    slot === 'head' ? setHead(v) : slot === 'haft' ? setHaft(v) : setBinding(v);

  const complete = head && haft && binding;
  const parts: ToolParts | null = complete
    ? {
        head: { materialId: head!, purity: 60 },
        haft: { materialId: haft!, purity: 60 },
        binding: { materialId: binding!, purity: 60 },
      }
    : null;
  const preview = parts ? computePartStats(tier, parts) : null;
  const combined = parts
    ? [...traitsOf(head!), ...traitsOf(haft!), ...traitsOf(binding!)]
    : [];
  const pairs = parts ? activePairs(combined) : [];
  // The whole tool's traits netted into a plain "leans toward X, away from Y"
  // verdict — teaches the vocabulary as parts swap (the numbers above are the
  // exact outcome; this is the reading of them).
  const lean = parts ? compositionLean(combined) : [];
  const leanUp = [...new Set(lean.filter((l) => l.dir > 0).map((l) => l.label))];
  const leanDown = [...new Set(lean.filter((l) => l.dir < 0).map((l) => l.label))];

  // Marrow's eye + a side-by-side against the tool in your hand (Phase 21).
  const marrowLines = complete ? marrowCritique(state as GameState, head, haft, binding) : [];
  const equipped = equippedTool(state);
  const cmp = preview && equipped
    ? {
        chip: preview.chip - equipped.chipPower,
        strike: preview.strike - equipped.strikePower,
        sockets: preview.sockets - equipped.sockets.length,
      }
    : null;
  const blueprints = state.qol.blueprints;

  const recall = (bp: { tier: number; head: string | null; haft: string | null; binding: string | null }) => {
    setTier(bp.tier);
    setHead(bp.head);
    setHaft(bp.haft);
    setBinding(bp.binding);
    setOpen(null);
  };

  const brick = 4 + tier * 6;
  const convId = convCurrencyId(state);
  const canForge = complete
    && getCurrency(state, convId).gte(brick)
    && [head, haft, binding].every((id) => materialCount(state as GameState, id!) >= 1);

  return (
    <div className="panel p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#e0b054]">The bench</span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-cave-400">Tier</span>
          <Select
            value={String(tier)}
            ariaLabel="Tool tier"
            className="w-20"
            options={Array.from({ length: cap }, (_, i) => i + 1).map((t) => ({ value: String(t), label: ROMAN[t]! }))}
            onChange={(v) => {
              const nt = Number(v);
              setTier(nt);
              if (head && headTierCap(materialDef(head).shellId, materialDef(head).rarity) < nt) setHead(null);
            }}
          />
        </div>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        A tool is a head, a haft and a binding. Each reads different traits from its material — the
        same stone is everything in one part and nothing in another. Build it and see.
      </p>

      {/* The three slots */}
      <div className="mt-2 space-y-1.5">
        {PART_SLOTS.map((slot) => {
          const chosen = pick(slot);
          const options = slot === 'head' ? headOptions : held;
          return (
            <div key={slot} className="rounded-md border border-cave-800 p-2">
              <button
                className="flex w-full items-center justify-between gap-2 text-left"
                onClick={() => setOpen(open === slot ? null : slot)}
              >
                <span className="min-w-0">
                  <span className="text-[10px] uppercase tracking-widest text-cave-500">{slot}</span>
                  {chosen ? (
                    <span className="ml-2 inline-flex items-center gap-1.5">
                      <MaterialIcon id={chosen} size={16} />
                      <span className="text-xs text-cave-200">{materialDef(chosen).name}</span>
                      <TraitChips id={chosen} size="xs" />
                    </span>
                  ) : (
                    <span className="ml-2 text-xs italic text-cave-500">choose a material</span>
                  )}
                </span>
                <span className="shrink-0 text-[9px] text-cave-500">{open === slot ? '▲' : '▼'}</span>
              </button>
              {open === slot && (
                <div className="mt-1.5 border-t border-cave-800 pt-1.5">
                  <div className="mb-1 text-[9px] italic text-cave-500">The {slot} {PART_WANTS[slot]}.</div>
                  {options.length === 0 ? (
                    <div className="text-[10px] italic text-cave-500">
                      {slot === 'head' ? 'No material you hold can head a Tier ' + ROMAN[tier] + ' tool.' : 'Nothing in the Hold yet.'}
                    </div>
                  ) : (
                    <div className="max-h-40 space-y-0.5 overflow-y-auto scroll-thin">
                      {options.map((id) => (
                        <button
                          key={id}
                          className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-cave-800 ${chosen === id ? 'bg-cave-700' : ''}`}
                          onClick={() => { setPick(slot, id); setOpen(null); }}
                        >
                          <MaterialIcon id={id} size={16} />
                          <span className="min-w-0 flex-1 truncate text-cave-200">{materialDef(id).name}</span>
                          <TraitChips id={id} size="xs" />
                          <span className="tnum shrink-0 text-cave-500">×{materialCount(state as GameState, id)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Live preview */}
      {preview && (
        <div className="mt-2 rounded-md border border-cave-700 bg-cave-950 p-2">
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="text-cave-300">This will be a</span>
            <span className="font-semibold text-lamp-300">{partName(tier, parts!)}</span>
          </div>
          <div className="mt-1 flex gap-4 text-[11px]">
            <span className="text-dust">Chip <span className="tnum font-semibold">×{fmtNum(preview.chip, 2)}</span></span>
            <span className="text-[#9fd8c0]">Strike <span className="tnum font-semibold">{fmtNum(preview.strike, 1)}</span></span>
            <span className="text-cave-400">Sockets <span className="tnum">{preview.sockets}</span></span>
          </div>
          {(leanUp.length > 0 || leanDown.length > 0) && (
            <div className="mt-1 text-[10px] leading-snug text-cave-400">
              These three lean{' '}
              {leanUp.length > 0 && <span className="text-[#9fd8c0]">toward {leanUp.join(' & ')}</span>}
              {leanUp.length > 0 && leanDown.length > 0 && <span className="text-cave-500"> · </span>}
              {leanDown.length > 0 && <span className="text-[#d8a0a0]">away from {leanDown.join(' & ')}</span>}
            </div>
          )}
          {pairs.length > 0 && (
            <div className="mt-1 text-[10px] leading-snug">
              {pairs.map((p) => {
                const key = [p.a, p.b].sort().join('|');
                const known = state.forge.pairsFound.includes(key);
                return (
                  <span key={key} className={p.mult >= 1 ? 'text-[#9fd8c0]' : 'text-[#d8a0a0]'}>
                    {known ? p.name : (p.mult >= 1 ? 'something sings' : 'something grinds')}
                    {' '}({p.mult >= 1 ? '+' : ''}{Math.round((p.mult - 1) * 100)}%){'  '}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Marrow looks it over before you spend — signal, not an oracle. */}
      {marrowLines.length > 0 && (
        <div className="mt-2 rounded-md border border-[#e0b054]/25 bg-[#1c1710]/60 p-2">
          <div className="mb-0.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-[#e0b054]">
            <span aria-hidden>⚒</span> Marrow eyes it
          </div>
          {marrowLines.map((line) => (
            <div key={line} className="text-[11px] italic leading-snug text-cave-300">"{line}"</div>
          ))}
        </div>
      )}

      {/* Side-by-side against the tool in your hand — the "should I?" answer. */}
      {complete && cmp && (
        <div className="mt-2 rounded-md border border-cave-800 bg-cave-950/50 p-2">
          <div className="mb-1 text-[9px] uppercase tracking-widest text-cave-500">
            vs. your {equipped.name}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]">
            <Delta label="Chip" value={cmp.chip} fmt={(v) => `×${fmtNum(Math.abs(v), 2)}`} />
            <Delta label="Strike" value={cmp.strike} fmt={(v) => fmtNum(Math.abs(v), 1)} />
            <Delta label="Sockets" value={cmp.sockets} fmt={(v) => String(Math.abs(v))} />
          </div>
        </div>
      )}

      {/* Two ways to make it: work it by hand at the bench for a better tool,
          or slap it together quickly. Handing it to Marrow is the third way,
          and lives on the bench once the work is on it. */}
      <div className="mt-2 flex gap-1.5">
        <button
          className={`btn flex-1 py-1.5 text-xs ${canForge ? 'btn-warm' : ''}`}
          disabled={!canForge}
          onClick={() => {
            const r = dispatch({ type: 'beginCraft', act: 'forge', context: { tier, head, haft, binding } });
            if (r.ok) { setHead(null); setHaft(null); setBinding(null); }
          }}
        >
          {!complete ? 'Choose all three parts' : 'Work it by hand →'}
        </button>
        <button
          className="btn px-2 py-1.5 text-[11px]"
          disabled={!canForge}
          title="Slap it together — a competent, unremarkable tool"
          onClick={() => {
            const r = dispatch({ type: 'craftFromParts', tier, head: head!, haft: haft!, binding: binding! });
            if (r.ok) { setHead(null); setHaft(null); setBinding(null); }
          }}
        >
          Quick · <Amount value={brick} color={currencyDef(convId).color} />
        </button>
      </div>

      {/* Blueprints — save a composition, recall it, re-forge with what you have.
          A blueprint is a design (tier + three parts), not stone: recalling it
          sets the bench, and you forge when you hold the materials. */}
      <div className="mt-3 border-t border-cave-800 pt-2">
        <div className="mb-1 flex items-center gap-1.5">
          <input
            value={bpName}
            onChange={(e) => setBpName(e.target.value)}
            placeholder="Name this design…"
            maxLength={28}
            className="min-w-0 flex-1 rounded border border-cave-700 bg-cave-950 px-2 py-1 text-[11px] text-cave-200 placeholder:text-cave-600"
          />
          <button
            className="btn px-2 py-1 text-[11px]"
            disabled={!complete}
            title={complete ? 'Save this design' : 'Choose all three parts first'}
            onClick={() => {
              dispatch({ type: 'saveBlueprint', name: bpName, tier, head, haft, binding });
              setBpName('');
            }}
          >
            Save design
          </button>
        </div>
        {blueprints.length === 0 ? (
          <div className="text-[10px] italic text-cave-500">
            No saved designs yet. Build one you like and keep it here.
          </div>
        ) : (
          <div className="space-y-1">
            {blueprints.map((bp) => (
              <div key={bp.id} className="flex items-center gap-1.5 rounded border border-cave-800 px-2 py-1">
                <button className="min-w-0 flex-1 text-left" onClick={() => recall(bp)} title="Recall to the bench">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-cave-500">{ROMAN[bp.tier]}</span>
                    <span className="truncate text-[11px] font-semibold text-cave-200">{bp.name}</span>
                  </div>
                  <div className="truncate text-[9px] text-cave-500">
                    {[bp.head, bp.haft, bp.binding].map((m) => (m ? materialDef(m).name : '—')).join(' · ')}
                  </div>
                </button>
                <button
                  className="shrink-0 px-1 text-cave-600 hover:text-red-400"
                  aria-label={`Delete ${bp.name}`}
                  onClick={() => dispatch({ type: 'deleteBlueprint', id: bp.id })}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One stat's delta vs the equipped tool: green up, red down, grey even. */
function Delta({ label, value, fmt }: { label: string; value: number; fmt: (v: number) => string }) {
  const eps = 0.005;
  const dir = value > eps ? 'up' : value < -eps ? 'down' : 'even';
  const color = dir === 'up' ? '#9ab87a' : dir === 'down' ? '#d8a0a0' : '#8a7f70';
  const glyph = dir === 'up' ? '▲ +' : dir === 'down' ? '▼ −' : '— ';
  return (
    <span className="tnum" style={{ color }}>
      {label} {glyph}{dir === 'even' ? '' : fmt(value)}
    </span>
  );
}

export { TraitChips, type TraitId };

