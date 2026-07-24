/**
 * GEAR — off-hands, lanterns, harnesses, boots. Nothing here is combat-only:
 * every piece changes how you MINE and how you FIGHT (boots speed your chip
 * hand and buy a free move; lanterns find ore and read telegraphs early).
 * Forged from combat drops + mined materials; purity scales both faces.
 */
import { D } from '../decimal';
import type { Bucket } from '../modifiers';
import { registerModifier } from '../modifiers';
import { spendCurrency } from '../resources';
import type { ActionResult, EngineCtx, GameState, GearInstance } from '../types';
import { convCurrencyId } from '../shells';
import { consumeMaterial, materialCount, purityMult } from '../systems/forge';
import { materialDef } from '../materials';
import { grantXP } from '../systems/xp';
import type { ModifierCache } from '../modifiers';

export type GearSlot = 'offhand' | 'lantern' | 'harness' | 'boots';

/** The four gear slots, one piece each — this IS the gear limit. */
export const GEAR_SLOTS: GearSlot[] = ['offhand', 'lantern', 'harness', 'boots'];

/** How many slots currently hold a piece — the "used" of used/total. */
export function gearWornCount(state: GameState): number {
  return GEAR_SLOTS.filter((slot) => state.forge.gear[slot]).length;
}

export interface GearDef {
  id: string;
  slot: GearSlot;
  name: string;
  tier: number;
  inputs: Record<string, number>;
  conv: number; // Brick/Flux cost
  /** The mining face. */
  mining: { bucket: Bucket; value: number } | { chipCooldownMult: number };
  /** The combat face. */
  combat: { hp?: number; regen?: number; guard?: number; reveal?: boolean; freeMove?: boolean };
  flavor: string;
  /** Guild questline recipe — craftable only once its patron unlocks it. */
  guildLock?: string;
}

export const GEAR_DEFS: GearDef[] = [
  {
    id: 'marlshield', slot: 'offhand', name: 'Marlshield', tier: 2,
    inputs: { chitinshard: 6, marl: 8 }, conv: 15,
    mining: { bucket: 'dustYield', value: 1.04 },
    combat: { hp: 12, guard: 0.35 },
    flavor: 'Chitin over clay. It has already survived worse than you will ask of it.',
  },
  {
    id: 'lodewardBuckler', slot: 'offhand', name: 'Lodeward Buckler', tier: 5,
    inputs: { scalebackplate: 8, ironsinew: 4, loamiron: 6 }, conv: 60,
    mining: { bucket: 'chainPower', value: 1.05 },
    combat: { hp: 22, guard: 0.3 },
    flavor: 'Turns blows aside on principle and polarity alike.',
  },
  {
    id: 'gravelight', slot: 'lantern', name: 'Gravelight', tier: 2,
    inputs: { gravemote: 5, hollowamber: 2 }, conv: 15,
    mining: { bucket: 'dropRate', value: 1.08 },
    combat: { reveal: true },
    flavor: 'Burns cold. Shows what glitters — and what is about to move.',
  },
  {
    id: 'stormglassLantern', slot: 'lantern', name: 'Stormglass Lantern', tier: 5,
    inputs: { voltgland: 6, duskflint: 6 }, conv: 60,
    mining: { bucket: 'xpGain', value: 1.08 },
    combat: { reveal: true, regen: 1 },
    flavor: 'The storm inside is very small and very committed.',
  },
  {
    id: 'rootweave', slot: 'harness', name: 'Rootweave Harness', tier: 2,
    inputs: { wormsilk: 5, rootglass: 4 }, conv: 15,
    mining: { bucket: 'offlineEffAdd', value: 0.02 },
    combat: { hp: 8, regen: 1 },
    flavor: 'The silk holds you; the roots hold the silk; the dark holds everything.',
  },
  {
    id: 'ironweave', slot: 'harness', name: 'Ironweave Harness', tier: 5,
    inputs: { ironsinew: 6, wormsilk: 6, bluesteel: 4 }, conv: 60,
    mining: { bucket: 'offlineEffAdd', value: 0.03 },
    combat: { hp: 16, regen: 2 },
    flavor: 'Sinew that flexes once a day, woven so the flexes line up with yours.',
  },
  {
    id: 'delversTreads', slot: 'boots', name: "Delver's Treads", tier: 2,
    inputs: { burrowertooth: 4, graveclay: 6 }, conv: 15,
    mining: { chipCooldownMult: 0.85 },
    combat: { freeMove: true },
    flavor: 'Toothed soles. The face stops arguing about where you stand.',
  },
  {
    id: 'polarSoles', slot: 'boots', name: 'Polar Soles', tier: 5,
    inputs: { magnetheart: 2, scalebackplate: 6, rootglass: 4 }, conv: 60,
    mining: { chipCooldownMult: 0.72 },
    combat: { freeMove: true, hp: 6 },
    flavor: 'They grip the field lines themselves. Walking feels like being dealt.',
  },
  // --- Verdance kit (Phase 7): the green shell hits harder; wear the shell.
  {
    id: 'plentyshell', slot: 'offhand', name: 'Plentyshell', tier: 8,
    inputs: { mawpith: 6, barkiron: 8, wireweed: 4 }, conv: 220,
    mining: { bucket: 'dustYield', value: 1.07 },
    combat: { hp: 45, guard: 0.26 },
    flavor: 'Grown to fit the arm. It flinches a half-beat before you do.',
  },
  {
    id: 'canopyweave', slot: 'harness', name: 'Canopyweave', tier: 8,
    inputs: { mothspool: 8, palefiber: 6, throatroot: 5 }, conv: 220,
    mining: { bucket: 'offlineEffAdd', value: 0.035 },
    combat: { hp: 34, regen: 4 },
    flavor: 'Woven from things that lived in the high green. It remembers how to hold on.',
  },
  {
    id: 'verdantLoop', slot: 'lantern', name: 'Verdant Loop', tier: 8,
    inputs: { palefiber: 5, resinpearl: 4, chlorite: 5 }, conv: 200,
    mining: { bucket: 'dropRate', value: 1.1 },
    combat: { reveal: true, regen: 2 },
    flavor: 'Not a flame — a ring of living light. It leans toward what is about to move.',
  },
  // --- Glassmere kit (Phase 8) --------------------------------------------
  {
    id: 'frostward', slot: 'offhand', name: 'Frostward', tier: 11,
    inputs: { glasschitin: 8, coldsinew: 6, prismheart: 2 }, conv: 600,
    mining: { bucket: 'dustYield', value: 1.08 },
    combat: { hp: 80, guard: 0.24 },
    flavor: 'A pane of patient cold. Blows arrive tired.',
  },
  {
    id: 'prismweave', slot: 'harness', name: 'Prismweave', tier: 11,
    inputs: { coldsinew: 8, lenswing: 5, palefiber: 4 }, conv: 600,
    mining: { bucket: 'offlineEffAdd', value: 0.04 },
    combat: { hp: 60, regen: 6 },
    flavor: 'Light woven on the bias. Wounds close along the seams.',
  },
  // --- Cinder kit (Phase 9) -----------------------------------------------
  {
    id: 'slagward', slot: 'offhand', name: 'Slagward', tier: 14,
    inputs: { emberplate: 8, charsinew: 6, pyregland: 2 }, conv: 1500,
    mining: { bucket: 'dustYield', value: 1.09 },
    combat: { hp: 220, guard: 0.26 },
    flavor: 'A shield poured, not forged. It remembers being liquid and refuses to again.',
  },
  {
    id: 'emberweave', slot: 'harness', name: 'Emberweave', tier: 14,
    inputs: { charsinew: 8, magmaduct: 5, pyregland: 3 }, conv: 1500,
    mining: { bucket: 'offlineEffAdd', value: 0.04 },
    combat: { hp: 160, regen: 16 },
    flavor: 'Woven warm and worn warmer. Wounds cauterize along the threads.',
  },
  // --- Warren uniques (Phase 8): patterns found, never bought -------------
  {
    id: 'gardenersKnot', slot: 'harness', name: "The Gardener's Knot", tier: 3,
    inputs: { taproot: 1, wormsilk: 6, rootglass: 4 }, conv: 40,
    mining: { bucket: 'regen', value: 1.05 },
    combat: { hp: 14, regen: 2 },
    flavor: "The Tapmother's own harness pattern, from her first garden. It holds you like something planted.",
    guildLock: 'warren',
  },
  {
    id: 'sablesSatchel', slot: 'boots', name: "Sable's Satchel", tier: 6,
    inputs: { ironsinew: 5, wormsilk: 5, scalebackplate: 4 }, conv: 170,
    mining: { chipCooldownMult: 0.8 },
    combat: { freeMove: true, hp: 12 },
    flavor: 'Slung low, packed right. You move like someone who has already decided.',
    guildLock: 'warren',
  },
  {
    id: 'orchardkeepersHood', slot: 'lantern', name: "The Orchardkeeper's Hood", tier: 9,
    inputs: { mawpith: 5, plentyheart: 1, mothspool: 6 }, conv: 450,
    mining: { bucket: 'dropRate', value: 1.14 },
    combat: { reveal: true, regen: 3 },
    flavor: 'It shades your eyes the way the boughs did. You see what is ripe, and what is about to fall.',
    guildLock: 'warren',
  },
  {
    id: 'unblinkingMonocle', slot: 'lantern', name: 'The Unblinking Monocle', tier: 12,
    inputs: { unblinkingTear: 1, lenswing: 6, prismheart: 3 }, conv: 800,
    mining: { bucket: 'dropRate', value: 1.16 },
    combat: { reveal: true, regen: 4 },
    flavor: 'Ground from the Eye of the Mere. Nothing winds up unseen again.',
    guildLock: 'warren',
  },
  {
    id: 'quietshroud', slot: 'lantern', name: 'The Quiet Shroud', tier: 16,
    inputs: { quietsinew: 6, voidglass: 3, absencia: 1 }, conv: 3000,
    mining: { bucket: 'dropRate', value: 1.18 },
    combat: { regen: 22 }, // NO reveal — deliberately. The Unattended is fought half-blind.
    flavor: "Sable's last lantern, hooded on purpose. Some things only exist while you look; this is for choosing not to.",
    guildLock: 'warren',
  },
  {
    id: 'authorsRule', slot: 'offhand', name: "The Author's Rule", tier: 16,
    inputs: { alephite: 1, firstiron: 6, axiomite2: 3 }, conv: 4000,
    mining: { bucket: 'dustYield', value: 1.12 },
    combat: { hp: 400, guard: 0.3 },
    flavor: 'A straightedge that has drawn horizons. Blows arrive exactly as long as it permits.',
    guildLock: 'warren',
  },
  {
    id: 'stokersGauntlet', slot: 'boots', name: "The Stoker's Treads", tier: 15,
    inputs: { pyregland: 4, emberplate: 6, magmaduct: 5 }, conv: 2200,
    mining: { chipCooldownMult: 0.85 },
    combat: { freeMove: true, hp: 120 },
    flavor: "From the Salamander's Bed. Whoever tended the sleeper's fire walked its floor barefoot-quiet and never once hurried.",
    guildLock: 'warren',
  },
  // --- Guild questline patterns (Phase 6) ---------------------------------
  {
    id: 'marrowplate', slot: 'offhand', name: 'Marrowplate', tier: 3,
    inputs: { loamiron: 8, chthonite: 2, marrowglass: 4 }, conv: 40,
    mining: { bucket: 'dustYield', value: 1.06 },
    combat: { hp: 18, guard: 0.28 },
    flavor: 'Marrow\'s own pattern, released to exactly one person. Clean metal only — it will not hold otherwise.',
    guildLock: 'marrow',
  },
  {
    id: 'wyrmlight', slot: 'lantern', name: 'Wyrmlight', tier: 4,
    inputs: { voltgland: 4, hollowamber: 3, gravemote: 6 }, conv: 45,
    mining: { bucket: 'dropRate', value: 1.12 },
    combat: { reveal: true, regen: 0.5 },
    flavor: 'Ashka renders lantern-oil from things with opinions. It shines toward what\'s worth taking.',
    guildLock: 'ashka',
  },
];

export function gearDef(id: string): GearDef {
  const def = GEAR_DEFS.find((g) => g.id === id);
  if (!def) throw new Error(`Unknown gear: ${id}`);
  return def;
}

export function equippedGearDefs(state: GameState): GearDef[] {
  const out: GearDef[] = [];
  for (const slot of ['offhand', 'lantern', 'harness', 'boots'] as GearSlot[]) {
    const inst = state.forge.gear[slot];
    if (inst) out.push(gearDef(inst.defId));
  }
  return out;
}

/** Combat totals from worn gear, purity-scaled. */
export function gearCombatTotals(state: GameState): { hp: number; regen: number; guard: number | null } {
  let hp = 0;
  let regen = 0;
  let guard: number | null = null;
  for (const slot of ['offhand', 'lantern', 'harness', 'boots'] as GearSlot[]) {
    const inst = state.forge.gear[slot];
    if (!inst) continue;
    const def = gearDef(inst.defId);
    const mult = purityMult(inst.purity);
    if (def.combat.hp) hp += Math.round(def.combat.hp * mult);
    if (def.combat.regen) regen += def.combat.regen * mult;
    if (def.combat.guard !== undefined) {
      guard = guard === null ? def.combat.guard / mult : Math.min(guard, def.combat.guard / mult);
    }
  }
  return { hp, regen, guard };
}

/** Manual chip cooldown multiplier from boots (the UI reads this). */
export function chipCooldownMult(state: GameState): number {
  const boots = state.forge.gear.boots;
  if (!boots) return 1;
  const def = gearDef(boots.defId);
  return 'chipCooldownMult' in def.mining ? def.mining.chipCooldownMult : 1;
}

export function craftGear(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  gearId: string,
): ActionResult {
  if (!state.forge.built) return { ok: false, reason: 'No forge' };
  const def = gearDef(gearId);
  if (def.guildLock === 'warren' && !state.warrens.gearUnlocked.includes(gearId)) {
    return { ok: false, reason: 'That pattern waits in a Warren, once' };
  }
  if (def.guildLock && def.guildLock !== 'warren' && !state.guild.unlockedGear.includes(gearId)) {
    return { ok: false, reason: 'That pattern belongs to someone at the Lamphouse' };
  }
  const inputs = Object.entries(def.inputs).filter(([, n]) => n > 0);
  for (const [matId, count] of inputs) {
    if (materialCount(state, matId) < count) {
      return { ok: false, reason: `Short of ${materialDef(matId).name}` };
    }
  }
  if (!spendCurrency(state, convCurrencyId(state), D(def.conv))) {
    return { ok: false, reason: 'Not enough to pay the fitting' };
  }
  let puritySum = 0;
  let n = 0;
  for (const [matId, count] of inputs) {
    puritySum += consumeMaterial(state, matId, count)! * count;
    n += count;
  }
  const purity = Math.round(puritySum / Math.max(1, n));
  const inst: GearInstance = { defId: def.id, purity };
  state.forge.gear[def.slot] = inst; // replaces — old kit goes to the pile
  ctx.dirty();
  grantXP(state, mods, ctx, D(20 * def.tier));
  ctx.emit({ type: 'gearForged', gearId: def.id, slot: def.slot, purity });
  return { ok: true, data: inst };
}

/**
 * Take a piece off. The slot goes empty and its bonuses stop — you can re-fit a
 * piece to it any time. (Fitting always crafts fresh, so nothing is stored in a
 * bag; unequip is simply the "off" the bench never had.)
 */
export function unequipGear(state: GameState, ctx: EngineCtx, slot: GearSlot): ActionResult {
  if (!state.forge.gear[slot]) return { ok: false, reason: 'Nothing worn there' };
  state.forge.gear[slot] = null;
  ctx.dirty();
  return { ok: true };
}

/** Mining-face modifiers for worn gear, purity-scaled. */
export function registerGearModifiers(): void {
  for (const def of GEAR_DEFS) {
    if (!('bucket' in def.mining)) continue;
    const { bucket, value } = def.mining;
    const additive = bucket === 'offlineEffAdd';
    registerModifier({
      id: `gear.${def.id}`,
      label: `Gear: ${def.name}`,
      bucket,
      value: (s) => {
        const inst = s.forge.gear[def.slot];
        if (!inst || inst.defId !== def.id) return additive ? 0 : 1;
        const mult = purityMult(inst.purity);
        return additive ? value * mult : 1 + (value - 1) * mult;
      },
    });
  }
}
