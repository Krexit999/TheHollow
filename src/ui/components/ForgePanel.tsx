/**
 * The Forge — tools I-III craftable in Shell I, IV-XV shown locked with the
 * reason visible: a preview of the whole game. One item, two stat blocks;
 * strike power is displayed but sleeps until combat arrives.
 */
import { useState } from 'react';
import { convCurrencyId, currencyDef, fmtNum, getCurrency, maxToolTier } from '../../engine';
import { GEMS, gemDef, materialDef } from '../../engine/materials';
import {
  equippedTool,
  materialCount,
  TIER_BASE,
  TOOL_RECIPES,
  type ToolRecipe,
} from '../../engine/systems/forge';
import { headTierCap } from '../../engine/systems/toolParts';
import { markLabel } from '../../engine/systems/heirloom';
import { opinionRead } from '../../engine/systems/opinions';
import { traitsOf, TRAITS } from '../../engine/traits';
import { dispatch, useGame } from '../store';
import { GemIcon, MaterialIcon } from './MaterialIcon';
import { Amount } from './shared';
import { GearBench } from './combat';
import { ForgeBench } from './ForgeBench';
import { CraftWorkbench } from './CraftWorkbench';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];

const SHELL_NAMES: Record<string, string> = {
  loam: 'LOAM', ferrite: 'FERRITE', verdance: 'VERDANCE', glassmere: 'GLASSMERE',
  cinder: 'CINDER', hollow: 'HOLLOW', aleph: 'ALEPH',
};

export function ForgePanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [socketPicker, setSocketPicker] = useState<{ toolId: number; slot: number } | null>(null);
  const [partSwap, setPartSwap] = useState<{ toolId: number; slot: 'head' | 'haft' | 'binding' } | null>(null);
  if (!state || !state.forge.built) return null;

  const equipped = equippedTool(state);
  const tierCap = maxToolTier(state); // 3 per shell reached: I-III Loam, IV-VI Ferrite
  const craftable = TOOL_RECIPES.filter((r) => r.tier <= tierCap);
  const locked = TOOL_RECIPES.filter((r) => r.tier > tierCap);
  const gemsHeld = GEMS.filter((g) => (state.materials.gems[g.id] ?? 0) > 0);

  // BULK SALVAGE (v22): everything below the equipped tool's tier, in one act.
  const obsolete = state.forge.tools.filter((t) => t.id !== 0 && t.id !== equipped.id && t.tier < equipped.tier);

  return (
    <div className="space-y-2">
      {obsolete.length > 1 && (
        <div className="panel flex flex-wrap items-center justify-between gap-2 p-2 text-[11px]">
          <span className="min-w-0 flex-1 text-cave-400">{obsolete.length} tools below Tier {ROMAN[equipped.tier]} sitting idle.</span>
          <div className="flex flex-wrap gap-1">
            <button
              className="min-h-[44px] rounded border border-cave-700 px-2 text-[10px] text-cave-300 hover:bg-cave-800"
              title="Break them all down for materials (settings lost)"
              onClick={() => dispatch({ type: 'bulkSalvage', toolIds: obsolete.map((t) => t.id), extract: false })}
            >Salvage all</button>
            <button
              className="min-h-[44px] rounded border border-lamp-500/50 px-2 text-[10px] text-lamp-200 hover:bg-cave-800"
              title="Break them all down, paying to keep runes and gems"
              onClick={() => dispatch({ type: 'bulkSalvage', toolIds: obsolete.map((t) => t.id), extract: true })}
            >Salvage, keep settings</button>
          </div>
        </div>
      )}
      {/* Tools owned */}
      <div className="space-y-1.5">
        {state.forge.tools.map((tool) => {
          const isEquipped = tool.id === equipped.id;
          return (
            <div key={tool.id} className={`panel p-2.5 ${isEquipped ? 'border-lamp-500/50' : ''}`}>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-cave-200">{tool.name}</span>
                    <span className="text-[10px] uppercase tracking-wider text-cave-400">
                      Tier {ROMAN[tool.tier]} · <span className="tnum">{tool.purity}%</span> purity
                    </span>
                    {isEquipped && (
                      <span className="text-[9px] uppercase tracking-widest text-lamp-400">in hand</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex gap-4 text-[10px]">
                    <span className="text-dust">
                      Chip <span className="tnum font-semibold">×{fmtNum(tool.chipPower, 2)}</span>
                    </span>
                    <span className="text-[#9fd8c0]" title="Your edge against what lives down here — scaled further by skills, gems, chords, and gear.">
                      Strike <span className="tnum font-semibold">{fmtNum(tool.strikePower, 1)}</span>
                    </span>
                  </div>
                  {/* HEIRLOOM HISTORY + OPINIONS (v22): the record and the temperament. */}
                  {(tool.history?.length ?? 0) > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {tool.history!.map((m) => (
                        <span key={m} className="rounded bg-[#3a3320] px-1 text-[8px] uppercase tracking-wide text-[#d9c25c]" title={`This tool: ${markLabel(m)}`}>{markLabel(m)}</span>
                      ))}
                    </div>
                  )}
                  {isEquipped && (
                    <div className="mt-0.5 text-[9px] italic text-cave-500">{opinionRead(state).mood}</div>
                  )}
                  {tool.parts && (
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[9px]">
                      {(['head', 'haft', 'binding'] as const).map((slot) => {
                        const part = tool.parts![slot];
                        return (
                          <button
                            key={slot}
                            className="flex items-center gap-1 rounded px-1 py-0.5 text-cave-400 hover:bg-cave-800 hover:text-cave-200"
                            title={`Swap the ${slot} — ${traitsOf(part.materialId).map((t) => TRAITS[t].name).join(', ')}`}
                            onClick={() => setPartSwap(partSwap?.toolId === tool.id && partSwap.slot === slot ? null : { toolId: tool.id, slot })}
                          >
                            <span className="uppercase tracking-wider opacity-70">{slot[0]}</span>
                            <MaterialIcon id={part.materialId} size={12} />
                            <span className="truncate">{materialDef(part.materialId).name.split(' ')[0]}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {tool.sockets.length > 0 && (
                    <div className="mt-1 flex gap-1">
                      {tool.sockets.map((gemId, slot) =>
                        gemId ? (
                          <span key={slot} title={`${gemDef(gemId).name} — ${gemDef(gemId).effectText}`}>
                            <GemIcon id={gemId} size={18} />
                          </span>
                        ) : (
                          <button
                            key={slot}
                            title="Empty socket"
                            className="h-[18px] w-[18px] rounded-full border border-dashed border-cave-600 text-[9px] text-cave-400 hover:border-lamp-500/60"
                            onClick={() => setSocketPicker({ toolId: tool.id, slot })}
                          >
                            +
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  {!isEquipped && (
                    <button className="btn px-2 py-0.5 text-[10px]" onClick={() => dispatch({ type: 'equipTool', toolId: tool.id })}>
                      Equip
                    </button>
                  )}
                  {tool.id !== 0 && (
                    <button className="btn px-2 py-0.5 text-[10px] opacity-60 hover:opacity-100" onClick={() => dispatch({ type: 'discardTool', toolId: tool.id })}>
                      Scrap
                    </button>
                  )}
                </div>
              </div>
              {partSwap?.toolId === tool.id && tool.parts && (
                <div className="mt-2 border-t border-cave-800 pt-2">
                  <div className="mb-1 text-[10px] uppercase tracking-widest text-cave-500">
                    New {partSwap.slot}
                  </div>
                  {(() => {
                    const held = Object.keys(state.materials.stacks).filter((id) => materialCount(state, id) > 0);
                    const opts = partSwap.slot === 'head'
                      ? held.filter((id) => headTierCap(materialDef(id).shellId, materialDef(id).rarity) >= tool.tier)
                      : held;
                    if (opts.length === 0) return <div className="text-[10px] italic text-cave-500">Nothing suitable in the Hold.</div>;
                    return (
                      <div className="max-h-36 space-y-0.5 overflow-y-auto scroll-thin">
                        {opts.map((id) => (
                          <button
                            key={id}
                            className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] hover:bg-cave-800"
                            onClick={() => {
                              dispatch({ type: 'replacePart', toolId: tool.id, slot: partSwap.slot, materialId: id });
                              setPartSwap(null);
                            }}
                          >
                            <MaterialIcon id={id} size={16} />
                            <span className="min-w-0 flex-1 truncate text-cave-200">{materialDef(id).name}</span>
                            <span className="flex gap-0.5">
                              {traitsOf(id).map((t) => (
                                <span key={t} className="rounded bg-cave-800 px-1 text-[8px] uppercase tracking-wide text-cave-300" title={TRAITS[t].blurb}>
                                  {TRAITS[t].name}
                                </span>
                              ))}
                            </span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
              {socketPicker?.toolId === tool.id && (
                <div className="mt-2 border-t border-cave-800 pt-2">
                  {gemsHeld.length === 0 ? (
                    <div className="text-[10px] italic text-cave-400">No gems held. The deep ones live in geodes.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {gemsHeld.map((g) => (
                        <button
                          key={g.id}
                          className="btn flex items-center gap-1.5 px-2 py-1 text-[10px]"
                          onClick={() => {
                            dispatch({ type: 'socketGem', toolId: tool.id, slot: socketPicker.slot, gemId: g.id });
                            setSocketPicker(null);
                          }}
                        >
                          <GemIcon id={g.id} size={16} /> {g.name}
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

      {/* THE BENCH — compose the parts, then WORK it (the process) */}
      <ForgeBench />

      {/* THE WORKBENCH — the active craft job, or the carve/cut/cast launchers */}
      <CraftWorkbench />

      {/* Quick patterns — the old fixed recipes, kept as a fast start */}
      <details className="panel px-2.5 py-1.5">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-cave-400">
          Quick patterns <span className="normal-case opacity-60">— fixed recipes, no choosing</span>
        </summary>
        <div className="mt-1.5 space-y-1.5">
          {craftable.map((recipe) => (
            <RecipeRow key={recipe.id} recipe={recipe} />
          ))}
        </div>
      </details>

      {/* Gear — the second bench (Phase 5) */}
      <GearBench />

      {/* The locked preview */}
      <div className="px-1 pt-1 text-xs font-semibold uppercase tracking-wider text-cave-400">
        Deeper patterns
      </div>
      <div className="panel divide-y divide-cave-800">
        {locked.map((recipe) => {
          const shells = [...new Set(Object.keys(recipe.inputs).map((id) => materialDef(id).shellId))]
            .filter((s) => s !== 'loam')
            .map((s) => SHELL_NAMES[s] ?? s);
          return (
            <div key={recipe.id} className="flex items-center gap-2 px-2.5 py-1.5 opacity-50">
              <span className="w-8 shrink-0 text-center font-display text-xs text-cave-400">{ROMAN[recipe.tier]}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-cave-300">{recipe.name}</div>
                <div className="truncate text-[9px] text-cave-400">
                  {Object.entries(recipe.inputs)
                    .map(([id, n]) => `${n} ${materialDef(id).name}`)
                    .join(' · ')}
                </div>
              </div>
              <span className="shrink-0 text-right text-[9px] uppercase tracking-wider text-cave-400">
                needs {shells.join(' + ')}
                <span className="block normal-case italic opacity-70">a shell you have not reached</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecipeRow({ recipe }: { recipe: ToolRecipe }) {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const base = TIER_BASE[recipe.tier]!;
  const convId = convCurrencyId(state);
  const conv = currencyDef(convId);
  const brickOk = getCurrency(state, convId).gte(recipe.brick);
  const inputs = Object.entries(recipe.inputs).map(([id, need]) => ({
    id,
    need,
    have: materialCount(state, id),
  }));
  const canCraft = brickOk && inputs.every((i) => i.have >= i.need);

  return (
    <div className="panel p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold text-cave-200">{recipe.name}</span>
            <span className="text-[9px] uppercase tracking-wider text-cave-400">Tier {ROMAN[recipe.tier]}</span>
          </div>
          <div className="text-[9px] text-cave-400">
            Chip ~×{fmtNum(base.chip * recipe.chipSpread, 2)} · Strike ~{fmtNum(base.strike * recipe.strikeSpread, 1)}
            {base.sockets > 0 && ` · ${base.sockets} socket${base.sockets > 1 ? 's' : ''}`}
            <span className="opacity-70"> · rolls with input purity</span>
          </div>
        </div>
        <button
          className={`btn shrink-0 px-2.5 py-1 text-xs ${canCraft ? 'btn-warm' : ''}`}
          disabled={!canCraft}
          onClick={() => dispatch({ type: 'craftTool', recipeId: recipe.id })}
        >
          Forge · <Amount value={recipe.brick} color={conv.color} />
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {inputs.map((input) => (
          <span
            key={input.id}
            className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${
              input.have >= input.need ? 'border-cave-700 text-cave-300' : 'border-red-900/60 text-red-400/90'
            }`}
            title={materialDef(input.id).name}
          >
            <MaterialIcon id={input.id} size={16} />
            <span className="tnum">
              {input.have}/{input.need}
            </span>
          </span>
        ))}
      </div>
      <div className="mt-1 text-[9px] italic leading-snug text-cave-400">{recipe.flavor}</div>
    </div>
  );
}
