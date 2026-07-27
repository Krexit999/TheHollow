/**
 * The Forge — tools I-III craftable in Shell I, IV-XV shown locked with the
 * reason visible: a preview of the whole game. One item, two stat blocks;
 * strike power is displayed but sleeps until combat arrives.
 */
import { useEffect, useRef, useState } from 'react';
import { convCurrencyId, currencyDef, fmtNum, getCurrency, maxToolTier } from '../../engine';
import type { GameState, Stack } from '../../engine';
import { GEMS, gemDef, materialDef, MATERIALS } from '../../engine/materials';
import {
  ABILITY_BY_ID, alloyHint, matchDrillAlloy, gradeStep, shellOrdinal, traitPool,
} from '../../engine/content/drillAlloys';
import {
  POUR_SLOTS, alloyCost, drillsCarrying, knownAbilities, slagCost,
  drillFits, drillSlots, mixGrade, reachedOrdinal, abilitiesReached, bestGradeOf,
  abilityBudget, loadoutUsed,
} from '../../engine/systems/drillAlloys';
import {
  equippedTool,
  materialCount,
  REFINED_SPREAD,
  TIER_BASE,
  TOOL_RECIPES,
  type ToolRecipe,
} from '../../engine/systems/forge';
import { headTierCap } from '../../engine/systems/toolParts';
import { markLabel } from '../../engine/systems/heirloom';
import { opinionRead } from '../../engine/systems/opinions';
import { traitsOf, TRAITS, type TraitId } from '../../engine/traits';
import { dispatch, useGame } from '../store';
import { GemIcon, MaterialIcon } from './MaterialIcon';
import { Amount, TraitTag } from './shared';
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
                  {/* Only the tool in hand feeds the totals — so name what its
                      gems are doing, right here, instead of only on hover. */}
                  {isEquipped && tool.sockets.some(Boolean) && (
                    <div className="mt-1 space-y-0.5">
                      {tool.sockets.map((gemId, slot) => gemId ? (
                        <div key={slot} className="flex items-center gap-1.5 text-[9px] text-cave-400">
                          <GemIcon id={gemId} size={10} />
                          <span className="text-[#9fd8c0]">{gemDef(gemId).effectText}</span>
                          {state.workbench.gemCuts[gemId] && (
                            <span className="text-lamp-400" title="A learned cut sharpens this gem's effect">✦</span>
                          )}
                        </div>
                      ) : null)}
                      <div className="text-[8px] italic text-cave-600">Live while this tool is in hand — folded into the totals above.</div>
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
                                <TraitTag key={t} id={t} size="xs" />
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
                    <div className="flex flex-col gap-1">
                      {gemsHeld.map((g) => {
                        const cut = state.workbench.gemCuts[g.id];
                        return (
                          <button
                            key={g.id}
                            className="btn flex items-center gap-2 px-2 py-1 text-left text-[10px]"
                            onClick={() => {
                              dispatch({ type: 'socketGem', toolId: tool.id, slot: socketPicker.slot, gemId: g.id });
                              setSocketPicker(null);
                            }}
                          >
                            <GemIcon id={g.id} size={16} />
                            <span className="min-w-0 flex-1">
                              <span className="text-cave-200">{g.name}</span>
                              <span className="block text-[9px] leading-tight text-[#9fd8c0]">{g.effectText}</span>
                            </span>
                            {cut && (
                              <span className="shrink-0 text-[8px] uppercase tracking-wide text-lamp-400" title={`Cut ${cut.lean}-lean, quality ${Math.round(cut.quality * 100)}% — its effect is sharpened`}>
                                cut ✦
                              </span>
                            )}
                          </button>
                        );
                      })}
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

      {/* THE ALLOY BENCH — a subsection of the Forge, not a floating panel of
          its own. It sits with the other benches because that is what it is:
          another thing this room does. (A.54 moved it down here from the top,
          where it was the first thing a player saw on a screen that is mostly
          about tools.) */}
      <AlloyBench state={state} />

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

/** Average purity across every held band of a material — what the recipe rolls
 *  its stats from. Null when none is held. */
function heldAvgPurity(state: GameState, id: string): number | null {
  const perMat = state.materials.stacks[id];
  if (!perMat) return null;
  let count = 0;
  let sum = 0;
  for (const st of Object.values(perMat) as (Stack | undefined)[]) {
    if (!st) continue;
    count += st.count;
    sum += st.puritySum;
  }
  return count > 0 ? sum / count : null;
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
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            className={`btn px-2.5 py-1 text-xs ${canCraft ? 'btn-warm' : ''}`}
            disabled={!canCraft}
            onClick={() => dispatch({ type: 'craftTool', recipeId: recipe.id })}
          >
            Forge · <Amount value={recipe.brick} color={conv.color} />
          </button>
          {/* B4: the refined form — the Refinery's worked material buys +12%
              on both stats. The raw button above always stands (pillar 4). */}
          {recipe.refined && (
            <button
              className="btn px-2 py-0.5 text-[10px]"
              disabled={!canCraft || materialCount(state, recipe.refined.workedId) < recipe.refined.count}
              title={`+${Math.round((REFINED_SPREAD - 1) * 100)}% chip & strike · consumes ${recipe.refined.count} ${materialDef(recipe.refined.workedId).name} on top of the raw inputs — the Refinery renders it`}
              onClick={() => dispatch({ type: 'craftTool', recipeId: recipe.id, refined: true })}
            >
              Refined · {recipe.refined.count} {materialDef(recipe.refined.workedId).name}
              <span className="tnum ml-1 text-cave-500">
                ({materialCount(state, recipe.refined.workedId)}/{recipe.refined.count})
              </span>
            </button>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {inputs.map((input) => {
          const name = materialDef(input.id).name;
          const purity = heldAvgPurity(state as GameState, input.id);
          const short = Math.max(0, input.need - input.have);
          return (
            <span
              key={input.id}
              className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${
                input.have >= input.need ? 'border-cave-700 text-cave-300' : 'border-red-900/60 text-red-400/90'
              }`}
              title={`${name}${purity !== null ? ` · purity ~${Math.round(purity)}% (rolls into the tool's stats)` : ''} — you hold ${input.have}, this recipe needs ${input.need}${short > 0 ? ` (short ${short})` : ''}`}
            >
              <MaterialIcon id={input.id} size={16} />
              <span className="max-w-[6rem] truncate">{name}</span>
              <span className="tnum text-cave-500">{input.have}/{input.need}</span>
            </span>
          );
        })}
      </div>
      <div className="mt-1 text-[9px] italic leading-snug text-cave-400">{recipe.flavor}</div>
    </div>
  );
}

/**
 * THE ALLOY BENCH — where a drill's ability is decided.
 *
 * The discovery loop, in three moves, and the panel is built around them:
 *   HINT     — pick materials and the bench reads their TRAITS back at you. It
 *              describes the MIX, never the outcome, so you have a reason to
 *              try a thing without being told what it makes (pillar 5).
 *   TRY      — pour. Materials and the fee are spent either way; a miss names
 *              what the mix leaned toward, which is the teaching move.
 *   CONFIRM  — a hit names the ability, states what it does, and records it
 *              forever. After that it is readable, not a secret.
 *
 * AND ONE MORE MOVE SINCE A.54: pick WHO GETS IT. An alloy goes into named
 * drills, not into the bay, so this bench has a target row. Both entry paths
 * land here — the ALLOY button on a drill's card in the bay preselects that
 * one, and you can also just pick the drills from this screen.
 *
 * THE PRICE IS NOT QUOTED FOR A MIX NOBODY HAS MADE. A known ability shows what
 * it costs, because you know what you are buying. An unknown mix says so and
 * pours at whatever it turns out to want — quoting it would be a free scanner
 * (read the price, learn whether it is slag, and never pay to find out).
 */
/**
 * SHELL TIER COLOURS — the one thing this bench needed most.
 *
 * The complaint that opened A.56: "mixing 100+ materials blind is confusing".
 * It was. The pool listed every material the player owned in registry order,
 * with traits and a count, and NOTHING that said which of them were new. A
 * hundred rows of undifferentiated stone is not a puzzle, it is a wall.
 *
 * So every row now carries its shell as a roman numeral in that shell's own
 * colour, the list is grouped newest-first under a shell header, and the
 * deepest group the player owns is called out as NEWEST. This is a first pass
 * and deliberately scoped to this bench — the Hold and the Compendium want the
 * same treatment and that is a later phase.
 *
 * Pillar 5 is untouched: a shell ordinal is a PROPERTY of a material, in the
 * same class as its traits (traits.ts rule 3). What a mix MAKES is still found.
 */
const RARITY_RANK = ['common', 'rich', 'pure', 'flawless', 'starred', 'aberrant'];

const SHELL_TIER_COLOR: Record<string, string> = {
  loam: '#b08968', ferrite: '#9aa6b2', verdance: '#8fd8a0', glassmere: '#9ad4e8',
  cinder: '#e8956a', hollow: '#c0a8e0', aleph: '#e8d48f',
};

function TierChip({ shellId, newest }: { shellId: string; newest?: boolean }) {
  const color = SHELL_TIER_COLOR[shellId] ?? '#8a8074';
  return (
    <span
      className="tnum shrink-0 rounded-sm border px-1 text-[9px] font-semibold leading-tight"
      style={{ borderColor: `${color}66`, color, background: `${color}14` }}
      title={`${SHELL_NAMES[shellId] ?? shellId} — tier ${shellOrdinal(shellId)} of 7${newest ? ' · the newest metal you hold' : ''}`}
    >
      {ROMAN[shellOrdinal(shellId)]}{newest ? '▲' : ''}
    </span>
  );
}

function AlloyBench({ state }: { state: GameState }) {
  const [picks, setPicks] = useState<string[]>([]);
  const [aim, setAim] = useState<string | null>(null);
  /** THE FIX FOR "guess blind across 100 materials". */
  const [traitFilter, setTraitFilter] = useState<TraitId | null>(null);
  const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null);
  const targets = useGame((s) => s.alloyTargets);
  const setTargets = useGame((s) => s.setAlloyTargets);
  const box = useRef<HTMLDivElement>(null);

  const units = state.drills.units;
  const conv = convCurrencyId(state);
  const convName = currencyDef(conv).name;
  const hint = alloyHint(picks);
  const known = knownAbilities(state);
  const reached = reachedOrdinal(state);
  const inWorld = abilitiesReached(state);
  const budget = abilityBudget(state);
  const used = loadoutUsed(state);

  // NEWEST FIRST. The pool is sorted by shell descending, then rarity, so the
  // metal that just started dropping is at the top of the list rather than
  // buried under eighty rows of Loam commons.
  const ownedAll = MATERIALS.filter((m) => materialCount(state, m.id) > 0);
  /** Which traits the player actually HOLDS, and how many materials carry each.
   *  A filter offering traits you own nothing of is just more noise. */
  const traitCounts = new Map<TraitId, number>();
  for (const m of ownedAll) for (const t of traitsOf(m.id)) traitCounts.set(t, (traitCounts.get(t) ?? 0) + 1);
  const owned = ownedAll
    .filter((m) => !traitFilter || traitsOf(m.id).includes(traitFilter))
    .sort((a, b) => shellOrdinal(b.shellId) - shellOrdinal(a.shellId)
      || RARITY_RANK.indexOf(b.rarity) - RARITY_RANK.indexOf(a.rarity)
      || a.name.localeCompare(b.name));
  const newestOwned = owned.length > 0 ? shellOrdinal(owned[0]!.shellId) : 1;

  const jumpSeq = useGame((s) => s.alloyJumpSeq);
  // Arriving from a drill's ALLOY button: bring the bench into view. It lives
  // below the tools now, so a jump that only switched tabs would land the
  // player at the top of a long screen with nothing obviously different. Keyed
  // on the JUMP, not on targets.length — that used to re-fire on every manual
  // toggle inside the bench too, so picking a second or third drill kept
  // yanking the screen back to the same spot it was already sitting at.
  useEffect(() => {
    if (jumpSeq > 0) box.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpSeq]);

  // Only a KNOWN mix shows its price — see the note above.
  const grade = mixGrade(picks);
  const wouldMake = matchDrillAlloy(picks, { reached, prefer: aim });
  const priced = wouldMake && state.drills.alloys.includes(wouldMake.id) ? wouldMake : null;
  const price = priced ? alloyCost(state, priced, Math.max(1, targets.length), grade) : null;
  const affordable = price
    ? getCurrency(state, conv).gte(price.conv) && picks.every((id) => materialCount(state, id) >= price.materials)
    : getCurrency(state, conv).gte(slagCost(state).conv);
  const ready = picks.length > 0 && targets.length > 0 && affordable;

  const toggle = (id: string) => {
    setLast(null);
    setPicks((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= POUR_SLOTS) return cur;
      return [...cur, id];
    });
  };
  const toggleDrill = (i: number) => {
    setLast(null);
    setTargets(targets.includes(i) ? targets.filter((x) => x !== i) : [...targets, i]);
  };

  const pour = () => {
    const r = dispatch({ type: 'forgeDrillAlloy', materialIds: picks, drills: targets, prefer: aim });
    if (!r.ok) { setLast({ ok: false, text: r.reason ?? 'The pour would not take' }); return; }
    const data = r.data as {
      alloy: string | null; known?: boolean; drills?: number; reason?: string;
      grade?: number; step?: number;
    } | undefined;
    if (!data?.alloy) {
      setLast({ ok: false, text: data?.reason ?? 'Slag.' });
    } else {
      const def = ABILITY_BY_ID.get(data.alloy)!;
      const n = data.drills ?? 1;
      const step = data.step ?? 0;
      setLast({
        ok: true,
        text: `${data.known ? 'Poured again' : 'It took'} — ${def.name} · grade ${ROMAN[data.grade ?? 1]}`
          + `, into ${n} drill${n === 1 ? '' : 's'}. ${def.effect}`
          + (step > 0 ? ` The newer metal took: ${step} grade${step === 1 ? '' : 's'} above what this ability was made for, and it shows.` : ''),
      });
    }
    setPicks([]);
  };

  return (
    <div ref={box} className="panel p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#8fd8c0]">Drill alloys</span>
        <span className="tnum text-[10px] text-cave-400" data-testid="alloys-known">
          {known.length}/{inWorld.length} known
        </span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        Pour two or three materials together and the drill you pour it into takes whatever
        behaviour the mix sets into. Nobody wrote down which mixes make what — the traits are
        the clue, and the deeper the metal, the stronger whatever comes out.
      </p>
      {/* THE LIMIT, at the bench as well as at the bay — because this is where
          a player finds out they cannot fit the thing they just paid for, and
          finding that out AFTER the spend would be the wrong order. */}
      <div className="mt-1.5 flex items-baseline justify-between gap-2 rounded border border-[#e8d48f]/30 bg-[#e8d48f]/5 px-2 py-1 text-[10px]">
        <span className="uppercase tracking-wider text-cave-500">The rails carry</span>
        <span className="tnum font-semibold text-[#e8d48f]" data-testid="bench-loadout">
          {used}/{budget}
          <span className="ml-1 text-cave-500">· more with every shell you reach</span>
        </span>
      </div>

      {units.length === 0 ? (
        <p className="mt-2 text-[11px] italic text-cave-600">
          No drills on the rails yet. Assemble the bay first — an alloy needs somewhere to go.
        </p>
      ) : (
        <>
          {/* WHO GETS IT. The bay's current mix is written on these chips, so
              the decision is made while looking at what is already fitted. */}
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-[10px] uppercase tracking-widest text-cave-500">
              Into which drill · {targets.length} picked
            </span>
            {units.length > 1 && (
              <button
                className="text-[10px] text-cave-400 underline decoration-dotted hover:text-cave-200"
                onClick={() => setTargets(targets.length === units.length ? [] : units.map((_, i) => i))}
              >
                {targets.length === units.length ? 'none' : 'all'}
              </button>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {units.map((u, i) => {
              const on = targets.includes(i);
              const fitted = drillFits(u);
              const slots = drillSlots(u);
              return (
                <button
                  key={i}
                  className={`min-w-0 rounded border px-1.5 py-1 text-left text-[10px] ${
                    on ? 'border-[#8fd8c0]/60 bg-[#8fd8c0]/10 text-[#8fd8c0]'
                      : u.prize ? 'border-[#e8d48f]/40 text-cave-300 hover:bg-cave-800'
                      : 'border-cave-800 text-cave-300 hover:bg-cave-800'
                  }`}
                  title={fitted.length > 0
                    ? `${u.name ?? `Drill ${i + 1}`} — running ${fitted.map((f) => f.def.name).join(' + ')}`
                    : `${u.name ?? `Drill ${i + 1}`} — bare${u.prize ? ` · a prize chassis, ${slots} slots` : ''}`}
                  onClick={() => toggleDrill(i)}
                >
                  <span className="block truncate">{u.name ?? `Drill ${i + 1}`}</span>
                  <span className={`block truncate text-[9px] ${fitted.length > 0 ? 'text-[#c7a35a]' : 'text-cave-600'}`}>
                    {fitted.length > 0
                      ? fitted.map((f) => `${f.def.name} ${ROMAN[f.grade]}`).join(' + ')
                      : 'bare'}
                  </span>
                  {slots > 1 && (
                    <span className="block text-[9px] text-[#e8d48f]">
                      ◆ {fitted.length}/{slots} slots
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* AIM (A.56). With fifteen signatures live, a generous mix in a deep
          shell resolves to the deepest thing it satisfies — which would make an
          old favourite progressively harder to re-pour. So you can aim at
          something you have ALREADY made. Never at something you have not:
          undiscovered abilities are not on this row at all. */}
      {known.length > 1 && (
        <>
          <div className="mt-2 text-[10px] uppercase tracking-widest text-cave-500">Aim the pour</div>
          <div className="mt-1 flex flex-wrap gap-1">
            <button
              className={`rounded border px-1.5 py-0.5 text-[10px] ${
                aim === null ? 'border-lamp-500/50 bg-lamp-500/10 text-lamp-200' : 'border-cave-800 text-cave-400 hover:bg-cave-800'
              }`}
              onClick={() => setAim(null)}
            >
              whatever it makes
            </button>
            {known.map((a) => (
              <button
                key={a.id}
                data-testid={`aim-${a.id}`}
                className={`rounded border px-1.5 py-0.5 text-[10px] ${
                  aim === a.id ? 'border-lamp-500/50 bg-lamp-500/10 text-lamp-200' : 'border-cave-800 text-cave-400 hover:bg-cave-800'
                }`}
                title={`Make ${a.name} if the mix will carry it`}
                onClick={() => setAim(aim === a.id ? null : a.id)}
              >
                {a.name}
              </button>
            ))}
          </div>
        </>
      )}

      {/* PICK — the pool is everything you actually hold, traits on the card. */}
      <div className="mt-2 text-[10px] uppercase tracking-widest text-cave-500">
        In the crucible · {picks.length}/{POUR_SLOTS}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {picks.length === 0 && <span className="text-[11px] italic text-cave-600">Nothing yet.</span>}
        {picks.map((id, n) => (
          <button
            key={`${id}-${n}`}
            className="flex items-center gap-1 rounded border border-lamp-500/50 bg-lamp-500/10 px-1.5 py-0.5 text-[10px] text-lamp-200"
            title="Take it back out"
            onClick={() => toggle(id)}
          >
            <TierChip shellId={materialDef(id).shellId} />
            {materialDef(id).name} ✕
          </button>
        ))}
      </div>

      {/* THE GRADE. The deepest metal in the crucible sets it, and it is the
          whole of "an old ability forged with newer materials is stronger". */}
      {picks.length > 0 && (
        <div
          className="mt-1.5 flex items-baseline justify-between gap-2 rounded border border-[#e8d48f]/30 bg-[#e8d48f]/5 px-2 py-1 text-[10px]"
          data-testid="pour-grade"
        >
          <span className="uppercase tracking-wider text-cave-500">This pours at</span>
          <span className="tnum font-semibold text-[#e8d48f]">
            GRADE {ROMAN[grade]}
            {priced && gradeStep(priced, grade) > 0 && (
              <span className="ml-1 text-[#8fd8c0]">
                (+{gradeStep(priced, grade)} over {priced.name}&apos;s own metal)
              </span>
            )}
          </span>
        </div>
      )}

      {/* ══ WHAT YOU HAVE PUT IN, IN TRAITS ═══════════════════════════════
          The pooled trait counts of the current crucible. This is a PROPERTY
          of what the player selected, not a recipe — the same class as showing
          traits on a material row (traits.ts rule 3) — and it is the difference
          between "I am mixing rocks" and "I am holding two brittle". Every
          signature in the game is a count of traits, so this is the number the
          player is actually playing with, and until now it was invisible. */}
      {picks.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-baseline gap-1.5 rounded border border-cave-800 px-2 py-1.5" data-testid="pool-traits">
          <span className="text-[9px] uppercase tracking-widest text-cave-500">In the mix</span>
          {Object.entries(traitPool(picks))
            .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
            .map(([t, n]) => (
              <span
                key={t}
                className={`rounded px-1 text-[10px] ${(n ?? 0) >= 2 ? 'bg-lamp-500/20 text-lamp-200' : 'text-cave-400'}`}
                title={TRAITS[t as TraitId].blurb}
              >
                {t} ×{n}
              </span>
            ))}
        </div>
      )}

      {/* HINT — reads the MIX, never the answer. */}
      {hint && (
        <p className="mt-1.5 rounded border border-cave-800 px-2 py-1.5 text-[11px] italic leading-snug text-[#c7a35a]">
          {hint}
        </p>
      )}

      {/* WHAT IT WILL COST, when the player already knows what they are making. */}
      {picks.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2 text-[10px]">
          <span className="text-cave-500">The pour wants</span>
          {price ? (
            <span className="tnum text-cave-300">
              <span className={getCurrency(state, conv).gte(price.conv) ? 'text-lamp-300' : 'text-red-400'}>
                {fmtNum(price.conv, 0)} {convName}
              </span>
              {' · '}
              {price.materials} of each material
              {price.drills > 1 && <span className="text-cave-500"> (×{price.drills} drills)</span>}
            </span>
          ) : (
            <span className="italic text-cave-500">no telling, until you have made one</span>
          )}
        </div>
      )}

      <button
        className={`btn mt-2 w-full py-1 text-[11px] ${ready ? 'btn-warm' : ''}`}
        disabled={!ready}
        title={
          targets.length === 0 ? 'Pick a drill to pour it into'
            : picks.length === 0 ? 'Put something in the crucible'
            : affordable ? 'Fire the bench'
            : 'You cannot cover this pour'
        }
        onClick={pour}
      >
        {targets.length === 0 ? 'Pick a drill first' : `Pour it into ${targets.length} drill${targets.length === 1 ? '' : 's'}`}
      </button>
      {last && (
        <p className={`mt-1 text-[11px] leading-snug ${last.ok ? 'text-[#8fd8c0]' : 'text-cave-400'}`}>{last.text}</p>
      )}

      {/* THE POOL you can draw from. Traits are shown because a trait is a
          property, not a solution (traits.ts rule 3) — this is the reasoning. */}
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">What you hold</span>
        <span className="text-[9px] text-cave-600">
          {traitFilter ? `${owned.length} carry ${traitFilter}` : 'newest metal first'}
        </span>
      </div>
      {/* ══ FILTER BY TRAIT ═══════════════════════════════════════════════
          The single biggest thing standing between a player and their first
          ability. Every signature is "N of trait X", the traits were printed on
          every row, and the player still had to eyeball a hundred rows to find
          two that shared one. Now: tap BRITTLE, and see only brittle.

          It gives away nothing. Which traits exist is already public (the
          Compendium glossary, every material row); what a COMBINATION does is
          still found by pouring. This turns a search problem into a decision,
          which is what pillar 5 wanted in the first place. */}
      <div className="mt-1 flex flex-wrap gap-1" data-testid="trait-filter">
        <button
          className={`rounded border px-1.5 py-0.5 text-[10px] ${
            traitFilter === null ? 'border-lamp-500/50 bg-lamp-500/10 text-lamp-200' : 'border-cave-800 text-cave-400 hover:bg-cave-800'
          }`}
          onClick={() => setTraitFilter(null)}
        >
          everything
        </button>
        {[...traitCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([t, n]) => (
            <button
              key={t}
              data-testid={`trait-${t}`}
              title={TRAITS[t].blurb}
              className={`rounded border px-1.5 py-0.5 text-[10px] ${
                traitFilter === t ? 'border-lamp-500/50 bg-lamp-500/10 text-lamp-200' : 'border-cave-800 text-cave-400 hover:bg-cave-800'
              }`}
              onClick={() => setTraitFilter(traitFilter === t ? null : t)}
            >
              {t} <span className="tnum text-cave-600">{n}</span>
            </button>
          ))}
      </div>
      <div className="mt-1 max-h-52 space-y-1 overflow-y-auto scroll-thin">
        {owned.length === 0 && (
          <p className="text-[11px] italic text-cave-600">Nothing in the hold to pour. Dig something up.</p>
        )}
        {owned.map((mm, idx) => {
          const ord = shellOrdinal(mm.shellId);
          const first = idx === 0 || shellOrdinal(owned[idx - 1]!.shellId) !== ord;
          return (
            <div key={mm.id}>
              {first && (
                <div
                  className="mb-0.5 mt-1.5 flex items-baseline gap-1.5 border-t border-cave-800 pt-1 first:mt-0 first:border-t-0 first:pt-0"
                  data-testid={`tier-head-${mm.shellId}`}
                >
                  <TierChip shellId={mm.shellId} newest={ord === newestOwned} />
                  <span className="text-[9px] uppercase tracking-widest text-cave-500">
                    {SHELL_NAMES[mm.shellId] ?? mm.shellId}
                  </span>
                  {ord === newestOwned && (
                    <span className="text-[9px] uppercase tracking-widest text-[#8fd8c0]">newest</span>
                  )}
                </div>
              )}
              <button
                data-testid={`pool-${mm.id}`}
                className={`flex w-full items-center gap-2 rounded border px-2 py-1 text-left transition-colors ${
                  picks.includes(mm.id) ? 'border-lamp-500/50 bg-cave-800' : 'border-cave-800 hover:bg-cave-800'
                }`}
                disabled={!picks.includes(mm.id) && picks.length >= POUR_SLOTS}
                onClick={() => toggle(mm.id)}
              >
                <TierChip shellId={mm.shellId} newest={ord === newestOwned} />
                <MaterialIcon id={mm.id} size={16} />
                <span className="min-w-0 flex-1 truncate text-[11px] text-cave-200">{mm.name}</span>
                <span className="shrink-0 text-[9px] uppercase tracking-wider text-cave-500">
                  {traitsOf(mm.id).join(' · ')}
                </span>
                <span className="tnum shrink-0 text-[10px] text-cave-500">×{materialCount(state, mm.id)}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* WHAT YOU HAVE MADE. Nothing appears here until it has been poured
          once — the list IS the discovery record. Once it is on the list the
          SIGNATURE is shown too: re-pouring a known alloy for a second drill is
          ordinary work, not a memory test. */}
      {known.length > 0 && (
        <>
          <div className="mt-2 text-[10px] uppercase tracking-widest text-cave-500">Made</div>
          {known.map((a) => {
            const carrying = drillsCarrying(state, a.id);
            const cost = alloyCost(state, a, 1);
            const at = bestGradeOf(state, a.id);
            return (
              <div key={a.id} data-testid={`made-${a.id}`} className={`mt-1 rounded border px-2 py-1.5 ${carrying.length > 0 ? 'border-[#8fd8c0]/50 bg-[#8fd8c0]/5' : 'border-cave-800'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-[12px] font-semibold ${carrying.length > 0 ? 'text-[#8fd8c0]' : 'text-cave-200'}`}>
                    {a.name}
                    <span className="ml-1 text-[9px] uppercase tracking-wider text-cave-500">
                      shell {ROMAN[shellOrdinal(a.shell)]}
                    </span>
                    <span className="ml-1 text-[9px] uppercase tracking-wider text-[#e8d48f]" title="What it costs of the bay's limit">
                      {'◆'.repeat(a.power)}
                    </span>
                    {at > 0 && (
                      <span className="ml-1 text-[9px] font-semibold text-[#e8d48f]">
                        fitted at grade {ROMAN[at]}
                      </span>
                    )}
                  </span>
                  <span className="tnum shrink-0 text-[10px] text-cave-500">
                    {fmtNum(cost.conv, 0)} {convName} + {cost.materials} each
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] leading-snug text-cave-300">{a.effect}</div>
                <div className="mt-0.5 text-[10px] italic leading-snug text-cave-500">{a.line}</div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[9px]">
                  <span className="uppercase tracking-wider text-cave-600">
                    from {Object.entries(a.needs).map(([t, n]) => `${n}× ${t}`).join(' + ')}
                  </span>
                  <span className={carrying.length > 0 ? 'text-[#8fd8c0]' : 'text-cave-600'}>
                    {carrying.length === 0
                      ? 'in no drill'
                      : `in ${carrying.map((i) => units[i]?.name ?? `Drill ${i + 1}`).join(', ')}`}
                  </span>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
