/**
 * THE FORGE — tool tiers I-XV. Shell I supports I-III; IV+ are declared with
 * their cross-shell requirements and shown locked (the preview of the whole
 * game). Tools are weapons: one item, two stat blocks — chip power (live) and
 * strike power (computed, stored, displayed; combat is Phase 5). Tools NEVER
 * wear out — durability was cut from the design.
 *
 * Tool tier hard-gates cell hardness: depth 45+ needs tier II, 110+ tier III
 * (Shell I). Descending past a wall without the tier is blocked — a legible
 * wall, not a trap.
 */
import { D } from '../decimal';
import { registerModifier, type Bucket } from '../modifiers';
import { spendCurrency } from '../resources';
import type { ActionResult, EngineCtx, GameState, Stack, ToolInstance } from '../types';
import type { ModifierCache } from '../modifiers';
import { BANDS, bandOf, GEMS, materialDef } from '../materials';
import { grantXP } from './xp';
import { convCurrencyId, currentShell, maxToolTier } from '../shells';
import { masteryLevel } from './mastery';
import { sealed } from '../laws';
import { computePartStats, headTierCap, type PartSlot } from './toolParts';
import { gemCutMult } from './workbench';

const GEM_LOOKUP: Record<string, { bucket: Bucket; value: number }> = Object.fromEntries(
  GEMS.map((g) => [g.id, { bucket: g.bucket, value: g.value }]),
);

// ---------------------------------------------------------------------------
// Hardness walls — per shell, from shell content data.
// ---------------------------------------------------------------------------

export type { HardnessWall } from '../shells';

/** Tool tier required to chip at a depth in the CURRENT shell. */
/** The tool ladder ends at XV by ruling (Cinder). Hollow and Aleph add no
 * tiers, so their hardness gate is capped at the ladder's top — the last two
 * shells are fought with heirloom-age kit, not a tool that does not exist. */
export const MAX_TOOL_TIER = 15;

export function requiredTier(state: GameState, depth: number): number {
  const shell = currentShell(state);
  let tier = Math.min(MAX_TOOL_TIER, Math.max(1, 3 * (shell.ordinal - 1))); // entering a shell needs the prior shell's top tier, capped at XV
  for (const wall of shell.walls) if (depth >= wall.depth) tier = wall.tier;
  return tier;
}

/** The next wall at or below a depth, for the depth bar's warning. */
export function nextWall(state: GameState, depth: number): { depth: number; tier: number } | null {
  for (const wall of currentShell(state).walls) if (depth < wall.depth) return wall;
  return null;
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

export interface ToolRecipe {
  id: string;
  name: string;
  tier: number; // I-XV
  /** Multipliers over the tier base — the chip/strike tradeoff. */
  chipSpread: number;
  strikeSpread: number;
  /** materialId -> count. Dormant-shell ids lock the recipe (the preview). */
  inputs: Record<string, number>;
  brick: number;
  flavor: string;
}

/** Tier base stats. chip is a dustYield multiplier; strike is inert until Phase 5. */
export const TIER_BASE: Record<number, { chip: number; strike: number; sockets: number }> = {
  1: { chip: 1.0, strike: 3, sockets: 0 },
  2: { chip: 1.35, strike: 5, sockets: 1 },
  3: { chip: 1.8, strike: 8, sockets: 2 },
  4: { chip: 2.4, strike: 12, sockets: 2 },
  5: { chip: 3.2, strike: 18, sockets: 2 },
  6: { chip: 4.2, strike: 26, sockets: 3 },
  7: { chip: 5.5, strike: 38, sockets: 3 },
  8: { chip: 7.2, strike: 55, sockets: 3 },
  9: { chip: 9.5, strike: 80, sockets: 3 },
  10: { chip: 12.5, strike: 115, sockets: 4 },
  11: { chip: 16.5, strike: 165, sockets: 4 },
  12: { chip: 21.5, strike: 240, sockets: 4 },
  13: { chip: 28, strike: 350, sockets: 5 },
  14: { chip: 37, strike: 500, sockets: 5 },
  15: { chip: 48, strike: 720, sockets: 6 },
};

export const TOOL_RECIPES: ToolRecipe[] = [
  // --- Tier I — anyone with a bench can make these -------------------------
  {
    id: 'marlsplitter', name: 'Marlsplitter', tier: 1, chipSpread: 1.1, strikeSpread: 0.8,
    inputs: { marl: 6, ochre: 2 }, brick: 4,
    flavor: 'The first tool anyone makes down here. Yours will be no different, except that it is yours.',
  },
  {
    id: 'gravewedge', name: 'Gravewedge', tier: 1, chipSpread: 0.85, strikeSpread: 1.3,
    inputs: { bonechalk: 5, graveclay: 4 }, brick: 4,
    flavor: 'Weighted wrong for digging and right for something else.',
  },
  // --- Tier II — the depth-45 wall answers to these ------------------------
  {
    id: 'loamironPick', name: 'Loamiron Pick', tier: 2, chipSpread: 1.15, strikeSpread: 0.8,
    inputs: { loamiron: 8, marl: 10, ochre: 4 }, brick: 12,
    flavor: 'Root-grown iron holds an edge the way roots hold a hillside.',
  },
  {
    id: 'duskcleaver', name: 'Duskcleaver', tier: 2, chipSpread: 0.85, strikeSpread: 1.35,
    inputs: { duskflint: 6, bonechalk: 8, graveclay: 6 }, brick: 12,
    flavor: 'Sparks fall upward off the blade. Whatever it hits will have time to wonder why.',
  },
  {
    id: 'rootglassRake', name: 'Rootglass Rake', tier: 2, chipSpread: 1.0, strikeSpread: 1.0,
    inputs: { rootglass: 7, loamiron: 4, marl: 8 }, brick: 14,
    flavor: 'Rings softly with every stroke. The drills seem to keep time with it.',
  },
  // --- Tier III — the depth-110 wall, and a real choice --------------------
  {
    id: 'deepcutter', name: 'Deepcutter', tier: 3, chipSpread: 1.2, strikeSpread: 0.75,
    inputs: { umberjade: 6, wormsteel: 5, loamiron: 12 }, brick: 30,
    flavor: 'Made for one thing. Does that one thing the way water does downhill.',
  },
  {
    id: 'wardenbreaker', name: 'Wardenbreaker', tier: 3, chipSpread: 0.75, strikeSpread: 1.45,
    inputs: { hollowamber: 5, wormsteel: 6, duskflint: 8 }, brick: 30,
    flavor: 'Named for a thing you have not met yet. It is waiting at the shell floor.',
  },
  // --- Tiers IV-XV — the locked preview of the whole game ------------------
  // A.18 CURRICULUM LAW: every input of a wall-tier tool is mineable in the
  // wall's own shell at or before the wall itself. No recipe may ask for a
  // material from a shell the stair no longer reaches, or from a rarity band
  // that only opens past the wall the tool exists to break.
  {
    id: 'lodestoneRake', name: 'Lodestone Rake', tier: 4, chipSpread: 1.1, strikeSpread: 0.95,
    inputs: { lodestone: 10, bluesteel: 6, magnetile: 2 }, brick: 60,
    flavor: 'Drags the charged grains to itself. Ferrite work, tooth to tail.',
  },
  {
    id: 'rimefang', name: 'Rimefang', tier: 5, chipSpread: 0.9, strikeSpread: 1.3,
    inputs: { rimeiron: 12, polarite: 6, nullsilver: 2 }, brick: 100,
    flavor: 'Cold enough to cut before it touches.',
  },
  {
    id: 'stormcaller', name: 'Stormcaller', tier: 6, chipSpread: 1.15, strikeSpread: 1.05,
    // A.16: no starred-lottery inputs on warden-tier weapons — effort, not luck.
    inputs: { stormcore: 5, voltglass: 8, polarite: 4 }, brick: 170,
    flavor: 'Swings with a static hum. On long chains it starts to sing along.',
  },
  {
    id: 'verdantScythe', name: 'Verdant Scythe', tier: 7, chipSpread: 1.0, strikeSpread: 1.2,
    inputs: { verdantine: 10, bloomsteel: 8, resinpearl: 8 }, brick: 280,
    flavor: 'Harvests rock the way a scythe harvests wheat: all at once, with a sound like rain.',
  },
  {
    id: 'bloomsteelMattock', name: 'Bloomsteel Mattock', tier: 8, chipSpread: 1.25, strikeSpread: 0.8,
    inputs: { bloomsteel: 10, feralglass: 8, springvein: 4 }, brick: 450,
    flavor: 'The head was grown, not cast. It remembers being a seed and digs accordingly.',
  },
  {
    id: 'wildstarFalx', name: 'Wildstar Falx', tier: 9, chipSpread: 1.05, strikeSpread: 1.25,
    inputs: { wildstar: 1, heartwood: 8, springvein: 6 }, brick: 700,
    flavor: 'Curved like the question it answers. The bloom in the steel still opens at dawn.',
  },
  // Glassmere X-XII: Prismpick and Lightwright return here as planned (A.17);
  // the Cinder ladder moves up one shell to XIII-XIV.
  {
    id: 'prismpick', name: 'Prismpick', tier: 10, chipSpread: 1.25, strikeSpread: 0.8,
    inputs: { prismite: 12, coldspar: 8, beamiron: 5 }, brick: 1100,
    flavor: 'Splits light and stone along the same clean line.',
  },
  {
    id: 'lightwright', name: "Lightwright's Edge", tier: 11, chipSpread: 1.1, strikeSpread: 1.1,
    inputs: { spectralite: 10, starlens: 6, beamiron: 8 }, brick: 1800,
    flavor: 'Forged at the exact moment a beam crossed the anvil. It kept the moment.',
  },
  {
    id: 'meridianEdge', name: 'Meridian Edge', tier: 12, chipSpread: 1.0, strikeSpread: 1.35,
    inputs: { starlens: 8, sunglass: 6, spectrum: 1 }, brick: 3000,
    flavor: 'Ground to the exact angle at which light gives up and cooperates.',
  },
  // Cinder XIII-XV — THE LADDER ENDS HERE, by ruling. Hollow has no rock to
  // swing at and Aleph needs no tools; the Fifteenth is the last one forged.
  {
    id: 'slagbreaker', name: 'Slagbreaker', tier: 13, chipSpread: 1.3, strikeSpread: 0.9,
    inputs: { pyroclast: 12, cindersteel: 8, obsidianheart: 6 }, brick: 5000,
    flavor: 'Built to argue with rock that has already been through a fire and won.',
  },
  {
    id: 'pyreheartPick', name: 'Pyreheart Pick', tier: 14, chipSpread: 1.1, strikeSpread: 1.25,
    inputs: { magmajade: 10, heartflame: 6, ventglass: 5 }, brick: 8000,
    flavor: 'The head holds an ember that has never gone out. It digs toward its relatives.',
  },
  {
    id: 'cinderMaul', name: 'Cinder Maul', tier: 15, chipSpread: 1.2, strikeSpread: 1.35,
    inputs: { heartflame: 10, coronaite: 1, pyrite: 8 }, brick: 15000,
    flavor: 'The Fifteenth. Marrow says there is nothing to teach past it, and Marrow would know.',
  },
];

export function recipeDef(id: string): ToolRecipe {
  const def = TOOL_RECIPES.find((r) => r.id === id);
  if (!def) throw new Error(`Unknown recipe: ${id}`);
  return def;
}

/** Highest tier craftable in Shell I (see shells.maxToolTier for the live rule). */
export const SHELL1_MAX_TIER = 3;

// ---------------------------------------------------------------------------
// Tool instances (ToolInstance/Stack shapes live in types.ts)
// ---------------------------------------------------------------------------

/** purity 0-100 -> 0.75x .. 1.25x stat multiplier. */
export function purityMult(purity: number): number {
  return 0.75 + purity / 200;
}

/** Alloy slots by tier — the affix system (alloys slot into tools). */
export function alloySlotsForTier(tier: number): number {
  return tier >= 6 ? 2 : tier >= 4 ? 1 : 0;
}

/** Alloy slots usable only at Ferrite Mastery 6 (gate, not capacity). */
export function alloySlotsUsable(state: GameState): boolean {
  return masteryLevel(state, 'ferrite') >= 6;
}

export function computeStats(recipe: ToolRecipe, purity: number): { chip: number; strike: number } {
  const base = TIER_BASE[recipe.tier]!;
  const mult = purityMult(purity);
  return {
    chip: Math.round(base.chip * recipe.chipSpread * mult * 100) / 100,
    strike: Math.round(base.strike * recipe.strikeSpread * mult * 10) / 10,
  };
}

/** The free starting implement — always present, cannot be discarded. */
export function starterTool(): ToolInstance {
  return {
    id: 0,
    recipeId: 'delversPick',
    name: "Delver's Pick",
    tier: 1,
    purity: 50,
    chipPower: 1,
    strikePower: 3,
    sockets: [],
    alloys: [],
  };
}

export function equippedTool(state: GameState): ToolInstance {
  // THE EMPTY HAND (challenge): nothing in them. Whatever you learned to do
  // with a tool, do it with none — and feel exactly what the ladder buys.
  if (sealed(state, 'sealTools')) return bareHands();
  return state.forge.tools[state.forge.equipped] ?? state.forge.tools[0] ?? starterTool();
}

/** No tool at all: the floor the tool ladder is measured from. */
function bareHands(): ToolInstance {
  return {
    id: -1, recipeId: 'bareHands', name: 'Bare Hands', tier: 0, purity: 0,
    chipPower: 0.4, strikePower: 1, sockets: [], alloys: [],
  };
}

// ---------------------------------------------------------------------------
// Inventory helpers (stacks by material + purity band, avg purity per stack)
// ---------------------------------------------------------------------------

export type { Stack, ToolInstance };

export function addMaterial(state: GameState, materialId: string, purity: number, count = 1): void {
  const band = bandOf(purity);
  const perMat = (state.materials.stacks[materialId] ??= {});
  const stack = (perMat[band] ??= { count: 0, puritySum: 0 });
  stack.count += count;
  stack.puritySum += purity * count;
  state.materials.totalDrops += count;
}

export function stackAvg(stack: Stack): number {
  return stack.count > 0 ? stack.puritySum / stack.count : 0;
}

export function materialCount(state: GameState, materialId: string): number {
  const perMat = state.materials.stacks[materialId];
  if (!perMat) return 0;
  let total = 0;
  for (const band of BANDS) total += perMat[band]?.count ?? 0;
  return total;
}

/**
 * Consume `count` of a material, best bands first, returning the weighted
 * average purity of what was taken. Returns null (no change) if short.
 */
export function consumeMaterial(state: GameState, materialId: string, count: number): number | null {
  if (materialCount(state, materialId) < count) return null;
  const perMat = state.materials.stacks[materialId]!;
  let remaining = count;
  let puritySum = 0;
  for (const band of [...BANDS].reverse()) {
    const stack = perMat[band];
    if (!stack || stack.count === 0) continue;
    const take = Math.min(remaining, stack.count);
    const avg = stackAvg(stack);
    stack.count -= take;
    stack.puritySum -= avg * take;
    puritySum += avg * take;
    remaining -= take;
    if (stack.count === 0) delete perMat[band];
    if (remaining === 0) break;
  }
  return puritySum / count;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function craftTool(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  recipeId: string,
): ActionResult {
  if (!state.forge.built) return { ok: false, reason: 'No forge' };
  const recipe = recipeDef(recipeId);
  if (recipe.tier > maxToolTier(state)) {
    return { ok: false, reason: 'Its materials belong to a shell you have not reached.' };
  }
  for (const [matId, count] of Object.entries(recipe.inputs)) {
    if (materialCount(state, matId) < count) {
      return { ok: false, reason: `Short of ${materialDef(matId).name}` };
    }
  }
  // The brick figure is a CONV cost: Brick in Loam, Flux in Ferrite.
  if (!spendCurrency(state, convCurrencyId(state), D(recipe.brick))) {
    return { ok: false, reason: `Not enough ${convCurrencyId(state) === 'brick' ? 'Brick' : 'Flux'}` };
  }
  let puritySum = 0;
  let inputCount = 0;
  for (const [matId, count] of Object.entries(recipe.inputs)) {
    const avg = consumeMaterial(state, matId, count)!;
    puritySum += avg * count;
    inputCount += count;
  }
  const purity = Math.round(puritySum / inputCount);
  const stats = computeStats(recipe, purity);
  const tool: ToolInstance = {
    id: state.forge.nextId++,
    recipeId: recipe.id,
    name: recipe.name,
    tier: recipe.tier,
    purity,
    chipPower: stats.chip,
    strikePower: stats.strike,
    sockets: new Array(TIER_BASE[recipe.tier]!.sockets).fill(null),
    alloys: new Array(alloySlotsForTier(recipe.tier)).fill(null),
    // Even the recipe path carries a composition now, so every tool has parts
    // to show, to replace, and to salvage. Stats here stay recipe-derived so
    // legacy recipes behave exactly as before.
    parts: partsFromRecipe(recipe, purity),
  };
  state.forge.tools.push(tool);
  state.forge.equipped = state.forge.tools.length - 1; // auto-equip fresh work
  state.forge.equippedAt = state.stats.playTimeSec;     // a new tool settles in from scratch
  state.stats.toolsForged += 1;
  ctx.dirty();
  grantXP(state, mods, ctx, D(15 * recipe.tier));
  ctx.emit({ type: 'toolForged', toolId: tool.id, name: tool.name, tier: tool.tier, purity });
  return { ok: true, data: tool };
}

export function socketGem(
  state: GameState,
  ctx: EngineCtx,
  toolId: number,
  slot: number,
  gemId: string,
): ActionResult {
  const tool = state.forge.tools.find((t) => t.id === toolId);
  if (!tool) return { ok: false, reason: 'No such tool' };
  if (slot < 0 || slot >= tool.sockets.length) return { ok: false, reason: 'No such socket' };
  if (tool.sockets[slot]) return { ok: false, reason: 'Socket is set' };
  if ((state.materials.gems[gemId] ?? 0) < 1) return { ok: false, reason: 'No such gem held' };
  state.materials.gems[gemId] = (state.materials.gems[gemId] ?? 0) - 1;
  tool.sockets[slot] = gemId;
  ctx.dirty();
  return { ok: true };
}

export function discardTool(state: GameState, ctx: EngineCtx, toolId: number): ActionResult {
  if (toolId === 0) return { ok: false, reason: "The Delver's Pick stays with you" };
  const idx = state.forge.tools.findIndex((t) => t.id === toolId);
  if (idx < 0) return { ok: false, reason: 'No such tool' };
  // Socketed gems come back out — gems are forever. (Alloys are bound: the
  // pour fused them to the metal; scrapping the tool loses them.)
  for (const gemId of state.forge.tools[idx]!.sockets) {
    if (gemId) state.materials.gems[gemId] = (state.materials.gems[gemId] ?? 0) + 1;
  }
  state.forge.tools.splice(idx, 1);
  if (state.forge.equipped >= state.forge.tools.length) state.forge.equipped = 0;
  ctx.dirty();
  return { ok: true };
}

/** Bind a discovered alloy into an alloy slot (Ferrite Mastery 6). */
export function socketAlloy(
  state: GameState,
  ctx: EngineCtx,
  toolId: number,
  slot: number,
  alloyId: string,
): ActionResult {
  if (!alloySlotsUsable(state)) {
    return { ok: false, reason: 'Alloy work answers to Ferrite Mastery 6' };
  }
  const tool = state.forge.tools.find((t) => t.id === toolId);
  if (!tool) return { ok: false, reason: 'No such tool' };
  if (slot < 0 || slot >= tool.alloys.length) return { ok: false, reason: 'No alloy slot there' };
  if (tool.alloys[slot]) return { ok: false, reason: 'The slot is already bound' };
  if (!state.crucible.discovered.includes(alloyId)) {
    return { ok: false, reason: 'The Crucible has not poured that' };
  }
  // A discovered alloy is a pattern, not a consumable — binding it to a
  // second tool is allowed; its rank/purity live in the Crucible record.
  tool.alloys[slot] = alloyId;
  ctx.dirty();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Modifiers — the equipped tool and its gems, by name, in the pipeline.
// ---------------------------------------------------------------------------

export function registerForgeModifiers(): void {
  registerModifier({
    id: 'tool.chipPower',
    label: 'Equipped tool',
    bucket: 'dustYield',
    value: (s) => equippedTool(s).chipPower,
  });
  // One modifier per gem definition; value depends on socketed state.
  for (const bucket of ['dustYield', 'kilnRate', 'motifGain', 'drillSpeed', 'xpGain'] as const) {
    registerModifier({
      id: `gem.${bucket}`,
      label: 'Socketed gems',
      bucket,
      value: (s) => {
        let v = 1;
        for (const gemId of equippedTool(s).sockets) {
          if (!gemId) continue;
          const def = GEM_LOOKUP[gemId];
          if (def && def.bucket === bucket) {
            const cut = gemCutMult(s.workbench.gemCuts[gemId], 'mine');
            v *= 1 + (def.value - 1) * cut;
          }
        }
        return v;
      },
    });
  }
  registerModifier({
    id: 'gem.offlineEffAdd',
    label: 'Socketed gems',
    bucket: 'offlineEffAdd',
    value: (s) => {
      let v = 0;
      for (const gemId of equippedTool(s).sockets) {
        if (!gemId) continue;
        const def = GEM_LOOKUP[gemId];
        if (def && def.bucket === 'offlineEffAdd') v += def.value * gemCutMult(s.workbench.gemCuts[gemId], 'mine');
      }
      return v;
    },
  });
  // Every gem has a combat face (Phase 5): strike multipliers stack here;
  // HP faces are summed by playerMaxHp directly.
  registerModifier({
    id: 'gem.strikePower',
    label: 'Socketed gems (edge)',
    bucket: 'strikePower',
    value: (s) => {
      let v = 1;
      for (const gemId of equippedTool(s).sockets) {
        if (!gemId) continue;
        const strike = GEMS.find((g) => g.id === gemId)?.combat.strikeMult;
        if (strike) v *= 1 + (strike - 1) * gemCutMult(s.workbench.gemCuts[gemId], 'fight');
      }
      return v;
    },
  });
}

/** Gem HP faces on the equipped tool (combat reads this). */
export function gemHpBonus(state: GameState): number {
  let hp = 0;
  for (const gemId of equippedTool(state).sockets) {
    if (!gemId) continue;
    hp += GEMS.find((g) => g.id === gemId)?.combat.hp ?? 0;
  }
  return hp;
}

// ---------------------------------------------------------------------------
// PARTS — tools built from head / haft / binding (Phase 17)
// ---------------------------------------------------------------------------

/**
 * Derive a sensible composition from a recipe's ordered inputs. Used by the
 * recipe path and by the v15 migration, so a tool forged the old way — or one
 * already in a save — has a head/haft/binding a player can inspect and salvage.
 * First input is the head (it met the rock), then haft, then binding; a recipe
 * with fewer than three inputs repeats its primary material.
 */
export function partsFromRecipe(
  recipe: ToolRecipe,
  purity: number,
): NonNullable<ToolInstance['parts']> {
  const ids = Object.keys(recipe.inputs);
  const head = ids[0] ?? 'marl';
  const haft = ids[1] ?? head;
  const binding = ids[2] ?? haft;
  return {
    head: { materialId: head, purity },
    haft: { materialId: haft, purity },
    binding: { materialId: binding, purity },
  };
}

/**
 * FORGE FROM PARTS — the compositional path. Pick a tier and a material for
 * each of head/haft/binding; the tool's archetype emerges from their traits.
 *
 * The HEAD gates the tier (curriculum law): its material must be able to head a
 * tool of this tier. Haft and binding are free — a Marl haft on a high tool is
 * a legitimate, very fast, very weak choice.
 */
export function craftFromParts(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  tier: number,
  headMat: string,
  haftMat: string,
  bindingMat: string,
  /** CRAFTSMANSHIP (Phase 18): a multiplier on the finished tool's stats,
   * earned at the Workbench. 1.0 = the quick-button path (unchanged). A
   * hand-forge or a good delegate beats it; a botch trails it, never ruinously.
   * Kept multiplicative and outside the parts maths so pillar 2 still holds —
   * chip is bounded by regen however well the tool is made. */
  craft = 1,
): ActionResult {
  if (!state.forge.built) return { ok: false, reason: 'No forge' };
  if (tier < 1 || tier > 15) return { ok: false, reason: 'No such tier' };
  if (tier > maxToolTier(state)) {
    return { ok: false, reason: 'That tier belongs to a shell you have not reached.' };
  }

  const headDef = materialDef(headMat);
  if (headTierCap(headDef.shellId, headDef.rarity) < tier) {
    return { ok: false, reason: `${headDef.name} cannot head a Tier ${tier} tool — it meets the rock, and this rock is too hard for it.` };
  }

  // One unit of each part material.
  for (const id of [headMat, haftMat, bindingMat]) {
    if (materialCount(state, id) < 1) return { ok: false, reason: `Short of ${materialDef(id).name}` };
  }
  const brick = 4 + tier * 6;
  if (!spendCurrency(state, convCurrencyId(state), D(brick))) {
    return { ok: false, reason: `${brick} ${convCurrencyId(state) === 'brick' ? 'Brick' : 'Flux'} to fire the forge` };
  }

  const hp = consumeMaterial(state, headMat, 1)!;
  const fp = consumeMaterial(state, haftMat, 1)!;
  const bp = consumeMaterial(state, bindingMat, 1)!;
  const parts = {
    head: { materialId: headMat, purity: Math.round(hp) },
    haft: { materialId: haftMat, purity: Math.round(fp) },
    binding: { materialId: bindingMat, purity: Math.round(bp) },
  };
  const stats = computePartStats(tier, parts);

  const tool: ToolInstance = {
    id: state.forge.nextId++,
    recipeId: `forged-${tier}`,
    name: partName(tier, parts),
    tier,
    purity: Math.round(hp * 0.5 + fp * 0.3 + bp * 0.2),
    chipPower: Math.round(stats.chip * craft * 100) / 100,
    strikePower: Math.round(stats.strike * craft * 10) / 10,
    /** The craftsmanship this tool was made with — shown, and remembered so a
     * part swap keeps the maker's mark. */
    craft: Math.round(craft * 1000) / 1000,
    sockets: new Array(stats.sockets).fill(null),
    alloys: new Array(alloySlotsForTier(tier)).fill(null),
    parts,
  };
  state.forge.tools.push(tool);
  state.forge.equipped = state.forge.tools.length - 1;
  state.forge.equippedAt = state.stats.playTimeSec;
  state.stats.toolsForged += 1;

  // Record any trait pairs the build discovered — the Codex, guarded from the
  // Compendium by pillar 5.
  for (const p of stats.pairs) {
    const key = [p.a, p.b].sort().join('|');
    if (!state.forge.pairsFound.includes(key)) {
      state.forge.pairsFound.push(key);
      ctx.emit({ type: 'traitPairFound', name: p.name });
    }
  }

  ctx.dirty();
  grantXP(state, mods, ctx, D(15 * tier));
  ctx.emit({ type: 'toolForged', toolId: tool.id, name: tool.name, tier, purity: tool.purity });
  return { ok: true, data: { tool, pairs: stats.pairs } };
}

/**
 * Replace one part of an existing tool with a new material — upgrade the head,
 * keep the haft you like. Recomputes stats from the new composition. Costs one
 * unit of the new material and a small fee; the old part's material is not
 * recovered (salvage is where you get materials back).
 */
export function replacePart(
  state: GameState,
  ctx: EngineCtx,
  toolId: number,
  slot: PartSlot,
  materialId: string,
): ActionResult {
  const tool = state.forge.tools.find((t) => t.id === toolId);
  if (!tool) return { ok: false, reason: 'No such tool' };
  if (!tool.parts) return { ok: false, reason: 'This tool predates parts — salvage and re-forge it.' };
  if (materialCount(state, materialId) < 1) return { ok: false, reason: `Short of ${materialDef(materialId).name}` };

  // The head still gates the tier.
  if (slot === 'head') {
    const def = materialDef(materialId);
    if (headTierCap(def.shellId, def.rarity) < tool.tier) {
      return { ok: false, reason: `${def.name} cannot head a Tier ${tool.tier} tool.` };
    }
  }
  const fee = 3 + tool.tier * 3;
  if (!spendCurrency(state, convCurrencyId(state), D(fee))) {
    return { ok: false, reason: `${fee} to re-fit the ${slot}` };
  }
  const purity = Math.round(consumeMaterial(state, materialId, 1)!);
  tool.parts[slot] = { materialId, purity };

  const stats = computePartStats(tool.tier, tool.parts);
  // The maker's mark carries: a swapped part keeps the craftsmanship the tool
  // was forged with, so re-heading a masterwork does not silently reset it.
  const craft = tool.craft ?? 1;
  tool.chipPower = Math.round(stats.chip * craft * 100) / 100;
  tool.strikePower = Math.round(stats.strike * craft * 10) / 10;
  tool.purity = Math.round(
    tool.parts.head.purity * 0.5 + tool.parts.haft.purity * 0.3 + tool.parts.binding.purity * 0.2,
  );
  // Growing the socket count keeps existing sockets; shrinking drops the tail.
  while (tool.sockets.length < stats.sockets) tool.sockets.push(null);
  tool.sockets.length = Math.max(stats.sockets, tool.sockets.filter((g) => g !== null).length);
  tool.name = partName(tool.tier, tool.parts);

  for (const p of stats.pairs) {
    const key = [p.a, p.b].sort().join('|');
    if (!state.forge.pairsFound.includes(key)) {
      state.forge.pairsFound.push(key);
      ctx.emit({ type: 'traitPairFound', name: p.name });
    }
  }
  ctx.dirty();
  return { ok: true, data: { tool, pairs: stats.pairs } };
}

/**
 * A name that reads the tool's character: the dominant axis (chip vs strike vs
 * balanced) plus the head material. "Loamiron Cleaver", "Marl Pick".
 */
export function partName(tier: number, parts: NonNullable<ToolInstance['parts']>): string {
  const stats = computePartStats(tier, parts);
  const base = TIER_BASE[tier] ?? TIER_BASE[1]!;
  const chipRatio = stats.chip / (base.chip / 1);
  const strikeRatio = stats.strike / (base.strike / 1);
  const headName = materialDef(parts.head.materialId).name.split(' ')[0];
  const kind = chipRatio > strikeRatio * 1.25 ? 'Pick'
    : strikeRatio > chipRatio * 1.25 ? 'Cleaver'
      : 'Hammer';
  return `${headName} ${kind}`;
}
