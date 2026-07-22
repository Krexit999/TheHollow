/**
 * THE FOUNDRY — permanent cross-shell modules in a limited slot grid, slots
 * Echo-gated (3 base → 12). Shipped as an 8-module architecture proof in Phase 4
 * and FILLED OUT in Phase 14 to 30, spanning every shell's currency. Modules
 * conflict by tag (two of a tag cannot run) — the documented "conflict"
 * mechanic — and every tag now has at least two claimants, so the conflict is
 * a real choice rather than a rule with nothing to catch.
 */
import { D, Decimal } from '../decimal';
import type { Bucket } from '../modifiers';
import { registerModifier } from '../modifiers';
import { spendCurrency } from '../resources';
import type { ActionResult, EngineCtx, GameState } from '../types';

export const FOUNDRY_BASE_SLOTS = 3;
export const FOUNDRY_MAX_SLOTS = 12;

export interface FoundryModuleDef {
  id: string;
  name: string;
  cost: { currencyId: string; amount: number };
  bucket: Bucket;
  value: number; // multiplier, or +add for offlineEffAdd
  tag: string;
  flavor: string;
}

export const FOUNDRY_MODULES: FoundryModuleDef[] = [
  {
    id: 'ballastFurnace', name: 'Ballast Furnace', cost: { currencyId: 'flux', amount: 200 },
    bucket: 'kilnRate', value: 1.3, tag: 'heat',
    flavor: 'Runs hot enough to warm the whole camp. The converter approves.',
  },
  {
    id: 'dreamBoiler', name: 'Dream Boiler', cost: { currencyId: 'rime', amount: 80 },
    bucket: 'offlineEffAdd', value: 0.04, tag: 'heat',
    flavor: 'Keeps pressure up while you are elsewhere. Cannot share a flue with the Ballast Furnace.',
  },
  {
    id: 'coldRails', name: 'Cold Rails', cost: { currencyId: 'scale', amount: 150 },
    bucket: 'drillSpeed', value: 1.25, tag: 'rails',
    flavor: 'Frictionless track for the bay. The drills arrive before they leave.',
  },
  {
    id: 'chainCapstan', name: 'Chain Capstan', cost: { currencyId: 'lodestone', amount: 200 },
    bucket: 'chainPower', value: 1.1, tag: 'rails',
    flavor: 'Winds your momentum into the next stroke. Wants the same rail-bed as Cold Rails.',
  },
  {
    id: 'deepWinch', name: 'Deep Winch', cost: { currencyId: 'lodestone', amount: 120 },
    bucket: 'descendCost', value: 0.92, tag: 'winch',
    flavor: 'Lowers you gently. Gently is cheaper.',
  },
  {
    id: 'assayAnnex', name: 'Assay Annex', cost: { currencyId: 'flux', amount: 100 },
    bucket: 'assaySpeed', value: 1.4, tag: 'annex',
    flavor: 'A second table, a better lens, an unpaid apprentice.',
  },
  {
    id: 'oreWasher', name: 'Ore Washer', cost: { currencyId: 'scale', amount: 250 },
    bucket: 'dropRate', value: 1.15, tag: 'washer',
    flavor: 'What the water finds, you keep.',
  },
  {
    id: 'teachingHall', name: 'Teaching Hall', cost: { currencyId: 'flux', amount: 300 },
    bucket: 'xpGain', value: 1.15, tag: 'hall',
    flavor: 'Lessons chalked on slate: mostly what not to touch.',
  },

  // --- Phase 14: the workshop fills up -------------------------------------
  // The Foundry shipped as an architecture proof with eight modules and then
  // held a full room in the densest cluster on that strength for ten phases.
  // The slot economy, the conflict-by-tag rule and the registration path were
  // all finished; it was short of the one thing it needed, which was things to
  // install. Every shell's currency now buys something here, and every tag has
  // at least two claimants so the conflict mechanic actually bites.

  // Heat — the converter line (conflicts with Ballast Furnace / Dream Boiler)
  {
    id: 'slagRecuperator', name: 'Slag Recuperator', cost: { currencyId: 'slag', amount: 400 },
    bucket: 'brickYield', value: 1.25, tag: 'heat',
    flavor: 'Catches what the flue throws away and feeds it back in. Nothing is wasted twice.',
  },
  {
    id: 'emberBellows', name: 'Ember Bellows', cost: { currencyId: 'ember', amount: 220 },
    bucket: 'kilnHeatRamp', value: 1.5, tag: 'heat',
    flavor: 'Gets the fire honest in half the time. Loud. Everyone hates it.',
  },

  // Rails — the drill line
  {
    id: 'counterweightRig', name: 'Counterweight Rig', cost: { currencyId: 'obsidian', amount: 300 },
    bucket: 'drillPower', value: 1.3, tag: 'rails',
    flavor: 'Every stroke falls further than it was pushed. Nock designed it and will tell you so.',
  },
  {
    id: 'harmonicBearings', name: 'Harmonic Bearings', cost: { currencyId: 'prism', amount: 250 },
    bucket: 'drillSpeed', value: 1.2, tag: 'rails',
    flavor: 'The bay hums a fifth above the shaft. Nobody has explained why it goes faster.',
  },

  // Winch — the descent line
  {
    id: 'counterpoiseDrum', name: 'Counterpoise Drum', cost: { currencyId: 'lumen', amount: 200 },
    bucket: 'descendCost', value: 0.9, tag: 'winch',
    flavor: 'The rope pays for itself on the way down and asks nothing on the way up.',
  },
  {
    id: 'plumbLine', name: 'The Plumb Line', cost: { currencyId: 'void', amount: 5000 },
    bucket: 'descendCost', value: 0.85, tag: 'winch',
    flavor: 'Hangs true through six kinds of physics. Sable used one exactly like it.',
  },

  // Annex — the survey line
  {
    id: 'coreLibrary', name: 'Core Library', cost: { currencyId: 'spectrum', amount: 150 },
    bucket: 'assaySpeed', value: 1.6, tag: 'annex',
    flavor: 'Every survey anyone ever filed, shelved by depth. Quill is not allowed in.',
  },
  {
    id: 'samplersBench', name: "Sampler's Bench", cost: { currencyId: 'silica', amount: 280 },
    bucket: 'dropRate', value: 1.12, tag: 'annex',
    flavor: 'Sorts the interesting from the merely heavy, faster than you can.',
  },

  // Washer — the find line
  {
    id: 'sluiceCascade', name: 'Sluice Cascade', cost: { currencyId: 'sap', amount: 400 },
    bucket: 'dropRate', value: 1.22, tag: 'washer',
    flavor: 'Six troughs, each finer than the last. The last one catches things you cannot see.',
  },
  {
    id: 'sporeSieve', name: 'Spore Sieve', cost: { currencyId: 'spore', amount: 350 },
    bucket: 'dropRate', value: 1.18, tag: 'washer',
    flavor: 'The mycelium eats the tailings and spits out what it does not want. What it does not want is ore.',
  },

  // Hall — the learning line
  {
    id: 'lampwrightsSchool', name: "Lampwright's School", cost: { currencyId: 'lumen', amount: 320 },
    bucket: 'xpGain', value: 1.25, tag: 'hall',
    flavor: 'Dovekin teaches on his day off. Attendance is not optional and is not enforced.',
  },
  {
    id: 'quietRoom', name: 'The Quiet Room', cost: { currencyId: 'hush', amount: 600 },
    bucket: 'xpGain', value: 1.35, tag: 'hall',
    flavor: 'No lamps, no talking, no rock. People come out of it knowing things.',
  },

  // Field — a new line: the face itself
  {
    id: 'terraceCut', name: 'The Terrace Cut', cost: { currencyId: 'humus', amount: 300 },
    bucket: 'cap', value: 1.2, tag: 'field',
    flavor: 'Steps the face so every cell holds a little more before it spills.',
  },
  {
    id: 'weepingWall', name: 'The Weeping Wall', cost: { currencyId: 'resin', amount: 260 },
    bucket: 'regen', value: 1.18, tag: 'field',
    flavor: 'Kept damp on purpose. Damp rock remembers how to fill.',
  },
  {
    id: 'mirrorGallery', name: 'Mirror Gallery', cost: { currencyId: 'prism', amount: 400 },
    bucket: 'dustYield', value: 1.15, tag: 'field',
    flavor: 'Light hits every face twice. So does the pick, in a sense nobody can define.',
  },

  // Ledger — the Guild line
  {
    id: 'countingHouse', name: 'The Counting House', cost: { currencyId: 'scale', amount: 400 },
    bucket: 'scripGain', value: 1.3, tag: 'ledger',
    flavor: 'Vess keeps a desk here. She has never once been wrong about a number.',
  },
  {
    id: 'bondedWarehouse', name: 'Bonded Warehouse', cost: { currencyId: 'obsidian', amount: 450 },
    bucket: 'scripGain', value: 1.45, tag: 'ledger',
    flavor: 'Goods sit here untaxed until sold. The Guild pretends not to know.',
  },

  // Vigil — the offline line
  {
    id: 'nightShift', name: 'The Night Shift', cost: { currencyId: 'rime', amount: 200 },
    bucket: 'offlineEffAdd', value: 0.05, tag: 'vigil',
    flavor: 'Somebody is always down there. You have never met them and they are always paid.',
  },
  {
    id: 'standingOrder', name: 'Standing Order', cost: { currencyId: 'umbra', amount: 800 },
    bucket: 'offlineEffAdd', value: 0.07, tag: 'vigil',
    flavor: 'Written once, obeyed forever, by a crew that does not need telling twice.',
  },

  // Chain — the polarity line
  {
    id: 'poleTuner', name: 'Pole Tuner', cost: { currencyId: 'lodestone', amount: 350 },
    bucket: 'chainPower', value: 1.2, tag: 'chain',
    flavor: 'Keeps the needle honest so a long chain does not wander off its own sign.',
  },
  {
    id: 'resonantCoil', name: 'Resonant Coil', cost: { currencyId: 'pyre', amount: 300 },
    bucket: 'chainPower', value: 1.3, tag: 'chain',
    flavor: 'Stores the last stroke and lends it to the next. Runs warm. Runs warmer the longer you go.',
  },

  // Motif — the Lattice line
  {
    id: 'chordEngine', name: 'Chord Engine', cost: { currencyId: 'motif', amount: 500 },
    bucket: 'motifGain', value: 1.3, tag: 'motif',
    flavor: 'Turns slowly and listens. When the board rings it writes the shape down for you.',
  },
  {
    id: 'sympatheticFrame', name: 'Sympathetic Frame', cost: { currencyId: 'frost', amount: 240 },
    bucket: 'motifGain', value: 1.2, tag: 'motif',
    flavor: 'Rings in sympathy with anything that rings nearby. Cheaper than understanding why.',
  },
];

export function defaultFoundryState(): GameState['foundry'] {
  return { slots: FOUNDRY_BASE_SLOTS, installed: [] };
}

export function foundryUnlocked(state: GameState): boolean {
  return state.shell.breachCount >= 1;
}

export function moduleDef(id: string): FoundryModuleDef {
  const def = FOUNDRY_MODULES.find((m) => m.id === id);
  if (!def) throw new Error(`Unknown foundry module: ${id}`);
  return def;
}

export function nextSlotCost(state: GameState): Decimal {
  return D(state.foundry.slots - FOUNDRY_BASE_SLOTS + 1); // 1, 2, 3... Echoes
}

export function buyFoundrySlot(state: GameState, ctx: EngineCtx): ActionResult {
  if (!foundryUnlocked(state)) return { ok: false, reason: 'The Foundry waits below the first Breach' };
  if (state.foundry.slots >= FOUNDRY_MAX_SLOTS) return { ok: false, reason: 'The floor is full' };
  if (!spendCurrency(state, 'echo', nextSlotCost(state))) {
    return { ok: false, reason: 'Not enough Echoes' };
  }
  state.foundry.slots += 1;
  ctx.dirty();
  return { ok: true, data: { slots: state.foundry.slots } };
}

export function installModule(state: GameState, ctx: EngineCtx, id: string): ActionResult {
  if (!foundryUnlocked(state)) return { ok: false, reason: 'The Foundry waits below the first Breach' };
  const def = moduleDef(id);
  if (state.foundry.installed.includes(id)) return { ok: false, reason: 'Already installed' };
  if (state.foundry.installed.length >= state.foundry.slots) return { ok: false, reason: 'No free slot' };
  const clash = state.foundry.installed.find((other) => moduleDef(other).tag === def.tag);
  if (clash) {
    return { ok: false, reason: `Conflicts with ${moduleDef(clash).name} (${def.tag})` };
  }
  if (!spendCurrency(state, def.cost.currencyId, D(def.cost.amount))) {
    return { ok: false, reason: `Not enough ${def.cost.currencyId}` };
  }
  state.foundry.installed.push(id);
  ctx.dirty();
  ctx.emit({ type: 'foundryInstalled', id });
  return { ok: true };
}

export function uninstallModule(state: GameState, ctx: EngineCtx, id: string): ActionResult {
  const idx = state.foundry.installed.indexOf(id);
  if (idx < 0) return { ok: false, reason: 'Not installed' };
  state.foundry.installed.splice(idx, 1); // no refund — the fitting is the cost
  ctx.dirty();
  return { ok: true };
}

export function registerFoundryModifiers(): void {
  for (const def of FOUNDRY_MODULES) {
    const additive = def.bucket === 'offlineEffAdd';
    registerModifier({
      id: `foundry.${def.id}`,
      label: `Foundry: ${def.name}`,
      bucket: def.bucket,
      value: (s) =>
        s.foundry.installed.includes(def.id) ? def.value : additive ? 0 : 1,
    });
  }
}
