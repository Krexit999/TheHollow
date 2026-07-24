/**
 * THE LAMPHOUSE, wired: discovery and arrival beats, reputation, Renown,
 * rotating stock, Vess's ledger, questlines, and the once-a-second guild
 * tick that runs the crew.
 *
 * The clock here is the GAME clock: played time plus away time, advanced by
 * the tick and by the offline calculation. Stock windows, moods, schedules
 * and caravan drift all read it — nothing reads the wall clock, nothing can
 * make 4 a.m. worse than noon, and the sim can test all of it.
 */
import { D } from '../decimal';
import type { ActionResult, EngineCtx, GameState, GuildState } from '../types';
import { addCurrency, getCurrency, spendCurrency } from '../resources';
import type { ModifierCache } from '../modifiers';
import { registerModifier } from '../modifiers';
import { addMaterial, materialCount, consumeMaterial } from '../systems/forge';
import { materialDef, materialsOfShell, GEMS } from '../materials';
import { SHELL_EXPORTS } from '../content/exports';
import { npcDef, npcsPresent, NPCS, repTier, type NpcDef, type StallKind } from './npcs';
import { refillBoard } from './contracts';
import { tickHirelings } from './hirelings';
import { sweepTitles } from './titles';
import { rollForFragment, FRAGMENTS } from './sable';

export const STOCK_WINDOW_MS = 6 * 3600_000; // stock turns every ~6 clock-hours
export const MOOD_WINDOW_MS = 4 * 3600_000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function defaultGuildState(nowMs: number): GuildState {
  return {
    discovered: false,
    clockMs: nowMs,
    gatesSeen: [],
    npcs: {},
    vess: { trust: 0, grudge: 0, deals: 0 },
    contracts: { board: [], slots: 3, completed: 0, seq: 1 },
    hirelings: {},
    berths: 1,
    caravan: { trades: 0 },
    titles: { earned: [], equipped: null },
    sable: { found: [], translated: [], read: [] },
    charterSpent: {},
    unlockedGear: [],
    stock: { window: -1, bought: {} },
    timers: {},
    crewRecalled: false,
  };
}

export function guildFlags(state: GameState): { forgeBuilt: boolean; tier3: boolean; breached: boolean } {
  return {
    forgeBuilt: state.forge.built,
    tier3: state.forge.tools.some((t) => t.tier >= 3),
    breached: state.shell.breachCount >= 1,
  };
}

export function presentNpcs(state: GameState): NpcDef[] {
  if (!state.guild.discovered) return [];
  return npcsPresent(guildFlags(state));
}

export function presentIds(state: GameState): Set<string> {
  return new Set(presentNpcs(state).map((n) => n.id));
}

export function ensureNpc(state: GameState, npcId: string): { rep: number; met: boolean; questStep: number } {
  let n = state.guild.npcs[npcId];
  if (!n) {
    n = { rep: 0, met: false, questStep: 0 };
    state.guild.npcs[npcId] = n;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Reputation and Renown
// ---------------------------------------------------------------------------

const TIER_RENOWN = [0, 5, 15, 40];

export function repAdd(state: GameState, ctx: EngineCtx, npcId: string, amount: number): void {
  const n = ensureNpc(state, npcId);
  const before = repTier(n.rep);
  n.rep += amount;
  const after = repTier(n.rep);
  if (after > before) {
    addCurrency(state, 'renown', D(TIER_RENOWN[after] ?? 0));
    ctx.dirty();
    ctx.emit({ type: 'repTier', npcId, tier: after });
  }
}

// ---------------------------------------------------------------------------
// Schedules and moods — texture, never gates.
// ---------------------------------------------------------------------------

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clockHour(state: GameState): number {
  return (state.guild.clockMs / 3600_000) % 24;
}

/** On the floor, or "in the back" — either way, the stall still serves. */
export function onFloor(state: GameState, npcId: string): boolean {
  const def = npcDef(npcId);
  const h = clockHour(state);
  const [a, b] = def.floorHours;
  return a <= b ? h >= a && h < b : h >= a || h < b;
}

export type Mood = 'bright' | 'level' | 'sour';

export function moodOf(state: GameState, npcId: string): Mood {
  const window = Math.floor(state.guild.clockMs / MOOD_WINDOW_MS);
  const r = mulberry32(hash(npcId) ^ (window * 2654435761))();
  return r < 0.25 ? 'bright' : r < 0.8 ? 'level' : 'sour';
}

export function npcLine(state: GameState, npcId: string): string {
  const def = npcDef(npcId);
  if (npcId === 'vess') {
    const { trust, grudge } = state.guild.vess;
    if (grudge >= 5) return 'You again. My ledger has a page with your name on it, and it isn\'t the nice ledger.';
    if (trust >= 15) return 'For you? The good shelf. Don\'t make me regret owning a good shelf.';
  }
  if (npcId === 'neev') {
    const step = state.guild.npcs['neev']?.questStep ?? 0;
    if (step >= 3) return 'Now you know what I knew, and you stayed anyway. So did she. Light a lamp for both of you.';
    if (step >= 1) return 'You read page twenty-six. Then you know what she sealed. Ask me nothing until you\'re deeper.';
  }
  return moodOf(state, npcId) === 'sour' ? def.sourLine : def.line;
}

// ---------------------------------------------------------------------------
// Stock — rotation changes what's CONVENIENT, never what's obtainable.
// ---------------------------------------------------------------------------

export interface StockSlot {
  key: string;
  kind: 'material' | 'gem' | 'geode' | 'currency';
  id: string;
  qty: number;
  purity?: number;
  price: number;
  label: string;
}

const RARITY_PRICE: Record<string, number> = { common: 3, rich: 7, pure: 18, flawless: 45 };

export function stockWindow(state: GameState): number {
  return Math.floor(state.guild.clockMs / STOCK_WINDOW_MS);
}

export function stockFor(state: GameState, npcId: string): StockSlot[] {
  const def = npcDef(npcId);
  if (!def.stall) return [];
  const rng = mulberry32(hash(npcId) ^ (stockWindow(state) * 2246822519));
  const slots: StockSlot[] = [];
  const kind: StallKind = def.stall.kind;

  const pickMats = (shellId: string, rarities: string[], count: number, combat = false) => {
    const pool = materialsOfShell(shellId).filter((m) => (combat ? m.source === 'combat' : !m.source) && rarities.includes(m.rarity));
    for (let i = 0; i < count && pool.length > 0; i++) {
      const m = pool[Math.floor(rng() * pool.length)]!;
      const purity = 40 + Math.floor(rng() * 35);
      const qty = m.rarity === 'common' ? 12 + Math.floor(rng() * 9) : m.rarity === 'rich' ? 8 + Math.floor(rng() * 5) : 4 + Math.floor(rng() * 3);
      slots.push({
        key: `${npcId}.${slots.length}`, kind: 'material', id: m.id, qty, purity,
        price: Math.round((RARITY_PRICE[m.rarity] ?? 3) * (0.8 + purity / 100) * (combat ? 2 : 1)),
        label: `${m.name} (${purity}%)`,
      });
    }
  };

  // Shells the stair has left behind — their rock stops falling, so the
  // Lamphouse stocks it (A.19 Step Zero: gear must stay craftable from what
  // a player can actually get; the caravan road runs UP as well as down).
  const leftBehind = ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder'].slice(
    0,
    Math.min(5, state.shell.breachCount),
  );

  if (kind === 'ore') {
    pickMats('loam', ['common', 'rich', 'pure'], leftBehind.length > 0 ? 2 : 3);
    for (const shellId of leftBehind.slice(-2)) {
      pickMats(shellId, ['rich', 'pure', 'flawless'], 1);
    }
    if (state.shell.breachCount >= 1) pickMats('ferrite', ['common', 'rich'], 1);
  } else if (kind === 'geodes') {
    slots.push({ key: `${npcId}.0`, kind: 'geode', id: 'geode', qty: 2 + Math.floor(rng() * 2), price: 30, label: 'A sealed geode (she listened to it)' });
    pickMats('loam', ['common', 'rich'], 1);
  } else if (kind === 'gems') {
    const gem = GEMS[Math.floor(rng() * GEMS.length)]!;
    slots.push({ key: `${npcId}.0`, kind: 'gem', id: gem.id, qty: 1, price: 120, label: `${gem.name}, cut and set-ready` });
    pickMats('loam', ['pure'], 2);
  } else if (kind === 'gear') {
    pickMats('loam', ['common', 'rich'], 2);
    // Nock keeps hides and sinew off the beasts you can no longer meet.
    for (const shellId of leftBehind.slice(-2)) {
      pickMats(shellId, ['common', 'rich', 'pure'], 1, true);
    }
  } else if (kind === 'provisions') {
    slots.push({ key: `${npcId}.0`, kind: 'currency', id: 'rime', qty: 3, price: 22, label: 'Bottled rime, 50 measures' });
  } else if (kind === 'ferrite') {
    slots.push({ key: `${npcId}.0`, kind: 'currency', id: 'scale', qty: 3, price: 20, label: 'A crate of Scale, 150 count' });
    slots.push({ key: `${npcId}.1`, kind: 'currency', id: 'lodestone', qty: 3, price: 24, label: 'Lodestone shot, 150 count' });
    pickMats('ferrite', ['common', 'rich'], 2);
  } else if (kind === 'exports') {
    // THE EXPORT SHELF (Part B spine) — Serra hauls every left-behind shell's
    // export down the stair. Deterministic, not rotated: the shelf is the
    // spine's no-softlock guarantee, so it must never roll away. Prices rise
    // with the length of the haul.
    const ordinal = Math.min(state.shell.breachCount, SPINE_SHELLS.length);
    for (const e of SHELL_EXPORTS) {
      if (!e.materialId) continue;
      const home = SPINE_SHELLS.indexOf(e.shellId);
      if (home < 0 || home >= ordinal) continue; // only shells the stair left behind
      slots.push({
        key: `${npcId}.x.${e.materialId}`, kind: 'material', id: e.materialId,
        qty: 4, purity: 70, price: EXPORT_SHELF_PRICE + home * 12,
        label: `${materialDef(e.materialId).name} — hauled up from ${e.shellId}`,
      });
    }
    if (state.shell.breachCount >= 6) {
      slots.push({
        key: `${npcId}.x.resonance`, kind: 'currency', id: 'resonance',
        qty: 3, price: 45, label: 'Bottled Resonance, 25 measures (she will not say how)',
      });
    }
  }
  return slots;
}

/** The stair's shell order — a material's home index gates Serra's shelf. */
const SPINE_SHELLS = ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow'];
const EXPORT_SHELF_PRICE = 26;

const CURRENCY_PACKS: Record<string, number> = { rime: 50, scale: 150, lodestone: 150, resonance: 25 };

/** Rep + ledger discount/penalty on a stall's prices. */
export function priceFactor(state: GameState, npcId: string): number {
  const tier = repTier(state.guild.npcs[npcId]?.rep ?? 0);
  let f = 1 - 0.04 * tier;
  if (npcId === 'vess') {
    const { trust, grudge } = state.guild.vess;
    f *= 1 - Math.min(0.08, trust * 0.0025);
    f *= 1 + Math.min(0.25, grudge * 0.01); // she remembers.
  }
  return f;
}

export function buyStock(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  npcId: string,
  slotIdx: number,
  stance?: 'fair' | 'press' | 'lowball',
): ActionResult {
  void mods;
  if (!presentIds(state).has(npcId)) return { ok: false, reason: 'Not in the hall yet' };
  const slots = stockFor(state, npcId);
  const slot = slots[slotIdx];
  if (!slot) return { ok: false, reason: 'Bare shelf' };
  // Per-window purchase limit — convenience rotates; nothing unique ever sits here.
  const w = stockWindow(state);
  if (state.guild.stock.window !== w) state.guild.stock = { window: w, bought: {} };
  const bought = state.guild.stock.bought[slot.key] ?? 0;
  if (bought >= slot.qty) return { ok: false, reason: 'Sold through this shipment — the stock turns soon' };

  let price = slot.price * priceFactor(state, npcId);
  let haggleNote: string | null = null;
  if (npcId === 'vess' && stance && stance !== 'fair') {
    const roll = Math.random();
    if (stance === 'press') {
      if (roll < 0.65) { price *= 0.9; haggleNote = 'She sighs and shaves it.'; }
      else { price *= 1.05; haggleNote = 'She counters higher, on principle.'; }
    } else {
      if (roll < 0.35) { price *= 0.72; state.guild.vess.grudge += 0.5; haggleNote = 'She takes the deal. Her pen does not forgive it.'; }
      else { price *= 1.15; state.guild.vess.grudge += 1; haggleNote = 'The ledger opens. Your page grows.'; }
    }
  } else if (npcId === 'vess') {
    state.guild.vess.trust += 1;
  }
  const cost = Math.max(1, Math.round(price));
  if (!spendCurrency(state, 'scrip', D(cost))) return { ok: false, reason: `${cost} Scrip` };
  state.guild.stock.bought[slot.key] = bought + 1;
  if (npcId === 'vess') state.guild.vess.deals += 1;

  if (slot.kind === 'material') addMaterial(state, slot.id, slot.purity ?? 50);
  else if (slot.kind === 'gem') state.materials.gems[slot.id] = (state.materials.gems[slot.id] ?? 0) + 1;
  else if (slot.kind === 'geode') state.materials.geodes += 1;
  else if (slot.kind === 'currency') addCurrency(state, slot.id, D(CURRENCY_PACKS[slot.id] ?? 1));

  repAdd(state, ctx, npcId, 0.5);
  ctx.dirty();
  return { ok: true, data: { cost, haggleNote } };
}

// ---------------------------------------------------------------------------
// Selling — Vess buys ore, Ashka buys what bit you.
// ---------------------------------------------------------------------------

const SELL_BASE: Record<string, number> = { common: 1, rich: 3, pure: 8, flawless: 20, starred: 50, aberrant: 50 };

export function sellPrice(state: GameState, mods: ModifierCache, materialId: string, count: number): { total: number; buyer: string } {
  const def = materialDef(materialId);
  const buyer = def.source === 'combat' ? 'ashka' : 'vess';
  const tier = repTier(state.guild.npcs[buyer]?.rep ?? 0);
  const per = (SELL_BASE[def.rarity] ?? 1) * (def.source === 'combat' ? 2 : 1) * (1 + 0.1 * tier);
  const total = Math.max(1, Math.round(per * count * mods.get(state, 'scripGain').toNumber()));
  return { total, buyer };
}

export function sellMaterial(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  materialId: string,
  count: number,
): ActionResult {
  if (!state.guild.discovered) return { ok: false, reason: 'No market yet' };
  const def = materialDef(materialId);
  const { total, buyer } = sellPrice(state, mods, materialId, count);
  if (def.source === 'combat' && !presentIds(state).has('ashka')) {
    return { ok: false, reason: 'Nobody here trades in teeth yet' };
  }
  if (materialCount(state, materialId) < count) return { ok: false, reason: 'Short of goods' };
  consumeMaterial(state, materialId, count);
  addCurrency(state, 'scrip', D(total));
  repAdd(state, ctx, buyer, Math.min(2, 0.05 * count));
  if (buyer === 'vess') state.guild.vess.deals += 1;
  ctx.dirty();
  return { ok: true, data: { total, buyer } };
}

// ---------------------------------------------------------------------------
// Questlines — eight authored arcs; the rest of the hall runs on rep.
// ---------------------------------------------------------------------------

export interface QuestStep {
  note: string;
  check: (s: GameState) => boolean;
  reward: { scrip?: number; renown?: number; charter?: number; gearId?: string };
}

const bestPurityTool = (s: GameState, tier: number) => s.forge.tools.some((t) => t.tier >= tier && t.purity >= 75);

export const QUESTLINES: Record<string, QuestStep[]> = {
  marrow: [
    { note: 'Forge two tools he can stand to look at.', check: (s) => s.stats.toolsForged >= 2, reward: { scrip: 20 } },
    { note: 'Hold a Flawless-or-better material.', check: (s) => s.achievements.unlocked['flawlessFind'] === true, reward: { scrip: 30, renown: 3 } },
    { note: 'Forge a tool at 80 purity or better.', check: (s) => s.forge.tools.some((t) => t.purity >= 80), reward: { scrip: 50 } },
    { note: 'Forge Tier IV or deeper at 75+ purity.', check: (s) => bestPurityTool(s, 4), reward: { gearId: 'marrowplate', charter: 1, renown: 8 } },
  ],
  vess: [
    { note: 'Three deals across her counter.', check: (s) => s.guild.vess.deals >= 3, reward: { scrip: 15 } },
    { note: 'Ten deals, and a clean ledger page.', check: (s) => s.guild.vess.deals >= 10 && s.guild.vess.trust >= 5, reward: { scrip: 30, renown: 3 } },
    { note: 'Move three hundred Scrip through the Lamphouse.', check: (s) => s.totals['scrip']?.gte(300) ?? false, reward: { scrip: 40 } },
    { note: 'Twenty entries in the good ledger.', check: (s) => s.guild.vess.trust >= 20, reward: { charter: 1, renown: 10 } },
  ],
  quill: [
    { note: 'Bring him three of Sable\'s pages.', check: (s) => s.guild.sable.found.length >= 3, reward: { scrip: 15 } },
    { note: 'Eight pages on his desk.', check: (s) => s.guild.sable.found.length >= 8, reward: { scrip: 30, renown: 3 } },
    { note: 'Pay three ciphered pages into the light.', check: (s) => FRAGMENTS.filter((f) => f.legibility === 'ciphered' && s.guild.sable.translated.includes(f.id)).length >= 3, reward: { scrip: 40 } },
    { note: 'Recover every Loam page she left.', check: (s) => FRAGMENTS.filter((f) => f.shellId === 'loam').every((f) => s.guild.sable.found.includes(f.id)), reward: { charter: 1, renown: 10 } },
  ],
  brakka: [
    { note: 'Six drills on the rails at once.', check: (s) => s.drills.units.length >= 6, reward: { scrip: 20 } },
    { note: 'Forty drill levels under the whistle.', check: (s) => s.drills.units.reduce((a, d) => a + d.level, 0) >= 40, reward: { scrip: 30, renown: 3 } },
    { note: 'Twelve drills singing in tune.', check: (s) => s.drills.units.length >= 12, reward: { scrip: 30, renown: 5 } },
  ],
  ashka: [
    { note: 'Put down ten of the Deepwrought.', check: (s) => s.combat.stats.wins >= 10, reward: { scrip: 25 } },
    { note: 'Forty put down. She starts saving the good crates.', check: (s) => s.combat.stats.wins >= 40, reward: { scrip: 40, renown: 4 } },
    { note: 'Record fifteen species in the book of teeth.', check: (s) => s.combat.seen.length >= 15, reward: { gearId: 'wyrmlight', renown: 6 } },
  ],
  moth: [
    { note: 'Ring five chords on the board.', check: (s) => s.lattice.discovered.length >= 5, reward: { scrip: 20 } },
    { note: 'Widen the board to its third ring.', check: (s) => s.lattice.rings >= 3, reward: { scrip: 30, renown: 3 } },
    { note: 'Read two progressions in order.', check: (s) => s.lattice.discoveredProgressions.length >= 2, reward: { renown: 6 } },
  ],
  serra: [
    { note: 'Three loads over the Breach stair.', check: (s) => s.guild.caravan.trades >= 3, reward: { scrip: 20 } },
    { note: 'Ten loads. The road learns your name.', check: (s) => s.guild.caravan.trades >= 10, reward: { scrip: 40, renown: 4 } },
    { note: 'Twenty-five loads, both directions.', check: (s) => s.guild.caravan.trades >= 25, reward: { charter: 1, renown: 8 } },
  ],
  neev: [
    { note: 'Read page twenty-six. Then come back.', check: (s) => s.guild.sable.translated.includes('p26') && s.guild.sable.read.includes('p26'), reward: { renown: 3 } },
    { note: 'Go deeper than she thought you would. Ferrite 150.', check: (s) => (s.depthRecords['ferrite'] ?? 0) >= 150, reward: { scrip: 40 } },
    { note: 'Read what she wrote to you. Page thirty-eight.', check: (s) => s.guild.sable.translated.includes('p38') && s.guild.sable.read.includes('p38'), reward: { charter: 1, renown: 15 } },
  ],
  // Phase 7 accrual — the hall keeps deepening, six more askings at a time.
  fenn: [
    { note: 'Crack ten geodes at her bench.', check: (s) => s.materials.geodesCracked >= 10, reward: { scrip: 20 } },
    { note: 'Hold three gems at once — she wants to hear them together.', check: (s) => Object.values(s.materials.gems).reduce((a, b) => a + b, 0) >= 3, reward: { scrip: 30, renown: 3 } },
    { note: 'Fifty geodes. She starts calling you "the opener".', check: (s) => s.materials.geodesCracked >= 50, reward: { renown: 8 } },
  ],
  tally: [
    { note: 'File ten surveys.', check: (s) => s.assay.surveysDone >= 10, reward: { scrip: 20 } },
    { note: 'Know forty materials by name in the ledger.', check: (s) => s.assay.knownMaterials.length >= 40, reward: { scrip: 30, renown: 3 } },
    { note: 'Fifty surveys. The depth ledger balances for the first time in years.', check: (s) => s.assay.surveysDone >= 50, reward: { renown: 8 } },
  ],
  grist: [
    { note: 'Fire a thousand converter units.', check: (s) => s.stats.bricksFired.gte(1000), reward: { scrip: 20 } },
    { note: 'Come back to a kiln that never went cold: collect 8 hours away.', check: (s) => s.stats.longestOfflineSec >= 8 * 3600, reward: { scrip: 30, renown: 3 } },
    { note: 'Twenty thousand firings. He nods at the flue like a proud parent.', check: (s) => s.stats.bricksFired.gte(20000), reward: { renown: 8 } },
  ],
  magda: [
    { note: 'Rig four magnets on the Array.', check: (s) => s.polarity.magnetCount >= 4, reward: { scrip: 25 } },
    { note: 'Ride a chain to ten.', check: (s) => s.polarity.bestChain >= 10, reward: { scrip: 35, renown: 4 } },
    { note: 'The full circuit: chain twelve with six magnets set.', check: (s) => s.polarity.bestChain >= 12 && s.polarity.magnetCount >= 6, reward: { renown: 10 } },
  ],
  ilma: [
    { note: 'Socket a gem into a tool.', check: (s) => s.forge.tools.some((t) => t.sockets.some((g) => g !== null)), reward: { scrip: 20 } },
    { note: 'Hold five gems — a working collection.', check: (s) => Object.values(s.materials.gems).reduce((a, b) => a + b, 0) >= 5, reward: { scrip: 30, renown: 3 } },
    { note: 'Fill every socket on a three-socket tool.', check: (s) => s.forge.tools.some((t) => t.sockets.length >= 3 && t.sockets.every((g) => g !== null)), reward: { renown: 8 } },
  ],
  sal: [
    { note: 'Earn ten names in her book.', check: (s) => s.guild.titles.earned.length >= 10, reward: { scrip: 25 } },
    { note: 'Wear one. Commit to it a while.', check: (s) => s.guild.titles.equipped !== null, reward: { scrip: 25, renown: 3 } },
    { note: 'Thirty names earned. She starts a second volume.', check: (s) => s.guild.titles.earned.length >= 30, reward: { renown: 10 } },
  ],
  // Phase 8 accrual — six more askings.
  nock: [
    { note: 'Wear gear in all four slots.', check: (s) => !!(s.forge.gear.offhand && s.forge.gear.lantern && s.forge.gear.harness && s.forge.gear.boots), reward: { scrip: 25 } },
    { note: 'Fit a piece at 70+ purity.', check: (s) => ['offhand', 'lantern', 'harness', 'boots'].some((k) => (s.forge.gear[k as 'offhand']?.purity ?? 0) >= 70), reward: { scrip: 30, renown: 3 } },
    { note: 'Own kit from three different shells.', check: (s) => s.shell.breachCount >= 2 && !!s.forge.gear.offhand && !!s.forge.gear.harness, reward: { renown: 8 } },
  ],
  ruta: [
    { note: 'Survive twenty fights.', check: (s) => s.combat.stats.wins >= 20, reward: { scrip: 20 } },
    { note: 'Fell a Warden with her on the crew.', check: (s) => Object.keys(s.guild.hirelings).includes('ruta') && s.combat.wardens.length >= 1, reward: { scrip: 35, renown: 4 } },
    { note: 'A hundred wins. She stops counting your dents.', check: (s) => s.combat.stats.wins >= 100, reward: { renown: 8 } },
  ],
  sef: [
    { note: 'Let him move five hundred Scrip of goods.', check: (s) => (s.totals['scrip']?.gte(500)) ?? false, reward: { scrip: 20 } },
    { note: 'Keep him hired through a Breach.', check: (s) => Object.keys(s.guild.hirelings).includes('sef') && s.shell.breachCount >= 1, reward: { scrip: 30, renown: 3 } },
    { note: 'Five thousand lifetime Scrip. He buys the round.', check: (s) => (s.totals['scrip']?.gte(5000)) ?? false, reward: { renown: 8 } },
  ],
  hob: [
    { note: 'Reach Delver 30 (a fed delver learns).', check: (s) => s.delver.level >= 30, reward: { scrip: 15 } },
    { note: 'Collect a full night away — the stew keeps.', check: (s) => s.stats.longestOfflineSec >= 8 * 3600, reward: { scrip: 25, renown: 3 } },
    { note: 'Delver 120. He claims full credit.', check: (s) => s.delver.level >= 120, reward: { renown: 8 } },
  ],
  pell: [
    { note: 'Haul a thousand drops up the stair.', check: (s) => s.materials.totalDrops >= 1000, reward: { scrip: 20 } },
    { note: 'Two hundred descents.', check: (s) => s.stats.descents >= 200, reward: { scrip: 30, renown: 3 } },
    { note: 'Ten thousand drops. His back files a grievance.', check: (s) => s.materials.totalDrops >= 10000, reward: { renown: 8 } },
  ],
  brine: [
    { note: 'Pour ten times, true or slag.', check: (s) => s.crucible.pours >= 10, reward: { scrip: 20 } },
    { note: 'Discover eight alloys.', check: (s) => s.crucible.discovered.length >= 8, reward: { scrip: 35, renown: 4 } },
    { note: "Pour Sable's Steel. He goes quiet for a while.", check: (s) => s.crucible.discovered.includes('sablesteel'), reward: { renown: 10 } },
  ],
  // Phase 9 accrual — five more askings; the hall smells of ash now.
  dovekin: [
    { note: 'Read three plates off the Observatory — skies are lamps too.', check: (s) => (s.observatory?.completed ?? 0) >= 3, reward: { scrip: 20 } },
    { note: 'Two hundred harvests inside the beam. Light that WORKS.', check: (s) => (s.refraction?.beamHarvests ?? 0) >= 200, reward: { scrip: 30, renown: 3 } },
    { note: 'Stand in Cinder, where the lamps light themselves.', check: (s) => (s.depthRecords['cinder'] ?? 0) >= 10, reward: { renown: 8 } },
  ],
  ossian: [
    { note: 'Fire five thousand converter units. The god of small flames counts.', check: (s) => s.stats.bricksFired.gte(5000), reward: { scrip: 20 } },
    { note: 'Hold the Ember Array in its band for three unbroken minutes.', check: (s) => (s.ember?.bestSustainSec ?? 0) >= 180, reward: { scrip: 35, renown: 4 } },
    { note: 'Vent a thousand heat and flood nothing. Devotion is restraint.', check: (s) => (s.pressure?.ventedTotal ?? 0) >= 1000 && (s.pressure?.floods ?? 0) === 0, reward: { renown: 10 } },
  ],
  jib: [
    { note: 'Chase down three anomalies. He wants the details RUNNING order.', check: (s) => (s.anomalies?.resolved ?? 0) >= 3, reward: { scrip: 20 } },
    { note: 'Meet the merchant who should not be down there.', check: (s) => (s.anomalies?.merchantMeets ?? 0) >= 1, reward: { scrip: 30, renown: 3 } },
    { note: 'Twelve anomalies answered. Jib retires the word "unconfirmed".', check: (s) => (s.anomalies?.resolved ?? 0) >= 12, reward: { renown: 8 } },
  ],
  cully: [
    { note: 'Forge a Tier X tool. Cully takes notes over your shoulder.', check: (s) => s.forge.tools.some((t) => t.tier >= 10), reward: { scrip: 20 } },
    { note: 'Tier XIII. Marrow pretends not to watch either of you.', check: (s) => s.forge.tools.some((t) => t.tier >= 13), reward: { scrip: 35, renown: 4 } },
    { note: 'Forge the Fifteenth. The ladder ends; the apprenticeship does too.', check: (s) => s.forge.tools.some((t) => t.tier >= 15), reward: { charter: 1, renown: 12 } },
  ],
  rane: [
    { note: 'Witness five anomalies. Every rumor was true, which ruins her.', check: (s) => (s.anomalies?.seen ?? 0) >= 5, reward: { scrip: 20 } },
    { note: 'Ride a Magma Well to a payout she can misquote.', check: (s) => (s.wells?.wins ?? 0) >= 1, reward: { scrip: 30, renown: 3 } },
    { note: 'Meet the merchant twice. Now SHE owes YOU a story.', check: (s) => (s.anomalies?.merchantMeets ?? 0) >= 2, reward: { renown: 8 } },
  ],
  // Phase 10 accrual — the last five askings. The book of the hall closes.
  lark: [
    { note: 'Know half the hall by name — meet fifteen of the thirty.', check: (s) => Object.values(s.guild.npcs).filter((n) => n.met).length >= 15, reward: { scrip: 25 } },
    { note: 'Five hundred Renown. The lamp burns on stories.', check: (s) => (s.totals['renown']?.gte(500)) ?? false, reward: { scrip: 30, renown: 4 } },
    { note: 'Come back from the far side of a Recursion. She kept it lit.', check: (s) => (s.recursion?.count ?? 0) >= 1, reward: { charter: 1, renown: 12 } },
  ],
  prill: [
    { note: 'Hold hundred-deep records in three shells.', check: (s) => Object.values(s.depthRecords).filter((d) => d >= 100).length >= 3, reward: { scrip: 25 } },
    { note: 'Stand on four different floors. She is redrawing the section view.', check: (s) => s.combat.wardens.length >= 4, reward: { scrip: 35, renown: 4 } },
    { note: 'Survey a hundred deep into the place with nothing to survey.', check: (s) => (s.depthRecords['hollow'] ?? 0) >= 100, reward: { renown: 10 } },
  ],
  verge: [
    { note: 'Spend two Charters. She files the stubs like relics.', check: (s) => Object.values(s.guild.charterSpent).reduce((a, b) => a + b, 0) >= 2, reward: { scrip: 25 } },
    { note: 'Earn five Charters lifetime. Nan Verge does not print many.', check: (s) => (s.totals['charter']?.gte(5)) ?? false, reward: { scrip: 35, renown: 4 } },
    { note: 'Reach the shell no charter can name. She stamps a blank page for you.', check: (s) => s.shell.breachCount >= 5, reward: { renown: 12 } },
  ],
  ferro: [
    { note: 'Run three Foundry modules at once.', check: (s) => s.foundry.installed.length >= 3, reward: { scrip: 25 } },
    { note: 'Three hundred tools forged, lifetime. He remembers every one.', check: (s) => s.stats.toolsForged >= 300, reward: { scrip: 35, renown: 4 } },
    { note: 'Carry a tool through a Recursion. An heirloom, he says, is a tool that outlived its world.', check: (s) => s.forge.tools.some((t) => t.heirloom === true), reward: { renown: 12 } },
  ],
  anders: [
    { note: 'Move five hundred Rime through your hands.', check: (s) => (s.totals['rime']?.gte(500)) ?? false, reward: { scrip: 25 } },
    { note: 'A hundred Frost from below three hundred. Colder than his best stock.', check: (s) => (s.totals['frost']?.gte(100)) ?? false, reward: { scrip: 35, renown: 4 } },
    { note: 'Stand in the Hollow. He always said the cold came from somewhere.', check: (s) => s.shell.breachCount >= 5, reward: { renown: 10 } },
  ],
};

function sweepQuestlines(state: GameState, ctx: EngineCtx): void {
  for (const [npcId, steps] of Object.entries(QUESTLINES)) {
    if (!presentIds(state).has(npcId)) continue;
    const n = ensureNpc(state, npcId);
    while (n.questStep < steps.length && steps[n.questStep]!.check(state)) {
      const step = steps[n.questStep]!;
      n.questStep += 1;
      if (step.reward.scrip) addCurrency(state, 'scrip', D(step.reward.scrip));
      if (step.reward.renown) addCurrency(state, 'renown', D(step.reward.renown));
      if (step.reward.charter) addCurrency(state, 'charter', D(step.reward.charter));
      if (step.reward.gearId && !state.guild.unlockedGear.includes(step.reward.gearId)) {
        state.guild.unlockedGear.push(step.reward.gearId);
      }
      repAdd(state, ctx, npcId, 10);
      ctx.dirty();
      ctx.emit({ type: 'questAdvanced', npcId, step: n.questStep, note: step.note });
    }
  }
}

// ---------------------------------------------------------------------------
// Charter — the rare structural spend.
// ---------------------------------------------------------------------------

export const CHARTER_SINKS: Record<string, { label: string; max: number }> = {
  berth: { label: 'Another crew berth in the loft', max: 3 },
  boardSlot: { label: 'Another peg on the contracts board', max: 2 },
};

export function spendCharter(state: GameState, ctx: EngineCtx, sink: 'berth' | 'boardSlot'): ActionResult {
  const def = CHARTER_SINKS[sink]!;
  const spent = state.guild.charterSpent[sink] ?? 0;
  if (spent >= def.max) return { ok: false, reason: 'Nan Verge is out of forms for that' };
  if (!spendCurrency(state, 'charter', D(1))) return { ok: false, reason: 'It takes a Charter' };
  state.guild.charterSpent[sink] = spent + 1;
  if (sink === 'berth') state.guild.berths += 1;
  else state.guild.contracts.slots += 1;
  ctx.dirty();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The guild tick
// ---------------------------------------------------------------------------

let guildAcc = 0;

export function tickGuild(state: GameState, mods: ModifierCache, ctx: EngineCtx, dt: number): void {
  state.guild.clockMs += dt * 1000;
  guildAcc += dt;
  if (guildAcc < 1) return;
  guildAcc = 0;

  // Discovery: the first Collapse opens the old stair.
  if (!state.guild.discovered) {
    if (state.collapse.count >= 1) {
      state.guild.discovered = true;
      ctx.dirty();
      ctx.emit({ type: 'guildOpened' });
    } else {
      return;
    }
  }

  // Arrival beats — the hall deepens with the dig.
  const flags = guildFlags(state);
  const gates: Array<[string, boolean, number]> = [
    ['open', true, 0],
    ['stalls', flags.forgeBuilt, 0],
    ['crews', flags.tier3, 2],
    ['ferrite', flags.breached, 3],
  ];
  for (const [gate, isOpen, berthFloor] of gates) {
    if (isOpen && !state.guild.gatesSeen.includes(gate)) {
      state.guild.gatesSeen.push(gate);
      state.guild.berths = Math.max(state.guild.berths, berthFloor || state.guild.berths);
      const count = NPCS.filter((n) => n.arrives === gate).length;
      ctx.emit({ type: 'npcsArrived', gate, count });
    }
  }
  for (const n of presentNpcs(state)) ensureNpc(state, n.id);

  // Stock window turnover.
  const w = stockWindow(state);
  if (state.guild.stock.window !== w) state.guild.stock = { window: w, bought: {} };

  refillBoard(state, presentIds(state));
  sweepQuestlines(state, ctx);
  sweepTitles(state, ctx);
  tickHirelings(state, mods, ctx);
  void rollForFragment; // surfacing rides the drop path (drops.ts), not the tick
}

// ---------------------------------------------------------------------------
// Structural quest bonuses (the two that are modifiers, named for their people)
// ---------------------------------------------------------------------------

export function registerGuildModifiers(): void {
  registerModifier({
    id: 'guild.brakkaTuneup',
    label: "Brakka's tune-up (questline)",
    bucket: 'drillSpeed',
    value: (s) => ((s.guild.npcs['brakka']?.questStep ?? 0) >= 3 ? 1.05 : 1),
  });
  registerModifier({
    id: 'guild.mothsBlessing',
    label: "Moth's blessing (questline)",
    bucket: 'motifGain',
    value: (s) => ((s.guild.npcs['moth']?.questStep ?? 0) >= 3 ? 1.06 : 1),
  });
}

/** Convenience for the UI: total scrip on hand. */
export function scripBalance(state: GameState): number {
  return getCurrency(state, 'scrip').toNumber();
}
