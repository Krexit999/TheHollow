/**
 * PHASE 2+ ARCHITECTURE STUBS — interfaces only, deliberately unimplemented.
 * These pin the shapes so Shells II–VII are data + one signature-mechanic
 * module, not a rewrite. Do not implement anything here in Phase 0/1.
 *
 * PHASE 15 NOTE: all seven shells now exist and NOTHING IMPORTS THIS FILE —
 * it is dead. Left in place rather than deleted (no VCS in this working copy)
 * but its bucket field is typed anyway, because a dead file with a loose type
 * is a landmine for whoever revives it. Safe to delete on your word.
 */
import type { Decimal } from '../decimal';
import type { Bucket } from '../modifiers';
import type { GameState } from '../types';

// ---------------------------------------------------------------------------
// Shells — a shell is content: currencies, systems, and a signature mechanic.
// ---------------------------------------------------------------------------

/**
 * A signature mechanic mutates face behavior (polarity, growth, refraction...).
 * On Breach it is carried down permanently in weakened form; by Shell VI the
 * face runs five of these stacked. Hooks are optional so mechanics implement
 * only what they touch.
 */
export interface SignatureMechanic {
  id: string;
  shellId: string;
  /** Full-strength behavior while inside its home shell. */
  native: SignatureHooks;
  /** Weakened behavior when carried down via Breach. */
  carried: SignatureHooks;
}

export interface SignatureHooks {
  /** Modify chip yield for a specific cell (polarity chains, beam crossing). */
  chipYieldMult?(state: GameState, cell: number): Decimal;
  /** Per-step face pass (vine growth, heat accumulation). */
  onFaceTick?(state: GameState, dtSeconds: number): void;
  /** React to a cell being chipped (break a chain, vent pressure). */
  onChip?(state: GameState, cell: number): void;
}

export interface ShellDef {
  id: string; // 'loam' | 'ferrite' | ...
  ordinal: number; // I = 1 ... VII = 7
  name: string;
  /** Currency ids registered by this shell (registerCurrency calls). */
  currencies: string[];
  /** Depth of the shell floor — reaching it enables Breach. */
  floorDepth: number;
  signature: SignatureMechanic;
  craftSystem: CraftSystem;
}

// ---------------------------------------------------------------------------
// Breach — the second reset layer. Echoes + permanent mechanic carry-down.
// ---------------------------------------------------------------------------

export interface BreachSystem {
  /** Locked: Echoes = floor(3 * (CoresEarnedThisBreach / 500)^0.6). */
  echoesFor(coresThisBreach: Decimal): Decimal;
  canBreach(state: GameState): boolean;
  /** Resets Cores/Core tree/shell systems; records the carried mechanic. */
  execute(state: GameState): void;
  /** Mechanics carried down so far, in shell order. */
  carriedMechanics(state: GameState): SignatureMechanic[];
}

// ---------------------------------------------------------------------------
// Craft-systems — persistent boards (the Lattice slots in here, Phase 2).
// ---------------------------------------------------------------------------

export interface CraftSystem {
  id: string; // 'lattice' | 'crucible' | 'loom' | ...
  name: string;
  currencyId: string; // Motif, Alloy Mark, ...
  /** Passive Rank: ~50% of engaged play, ~75% with Autoplay (locked). */
  passiveRankIncome(state: GameState): Decimal;
  /** Codex entries discovered (never a locked list — discovery only). */
  discoveries(state: GameState): string[];
  /** Board state serialization hooks for the save codec. */
  serialize(state: GameState): unknown;
  hydrate(state: GameState, data: unknown): void;
}

// ---------------------------------------------------------------------------
// Items & materials — Phase 3 (ore taxonomy, the Forge).
// ---------------------------------------------------------------------------

export type MaterialRarity = 'common' | 'rich' | 'pure' | 'flawless' | 'starred' | 'aberrant';

export interface MaterialDef {
  id: string;
  name: string;
  shellId: string;
  rarity: MaterialRarity;
  /** Visuals are data: palette + facet count + shimmer (90 materials free). */
  palette: [string, string, string];
  facets: number;
  shimmer: 'none' | 'soft' | 'crystalline' | 'aberrant';
}

export interface MaterialStack {
  materialId: string;
  amount: Decimal;
  /** Rolled 0–100; carries into anything crafted from it. */
  purity: number;
}

export interface ItemDef {
  id: string;
  name: string; // named, never generic: "Marlsplitter", not "Iron Pick II"
  tier: number; // I–XV
  /** Tools are weapons: one item, two stat blocks. */
  chipPower: Decimal;
  strikePower: Decimal;
  affixSlots: number;
  runeSlots: number;
}

// ---------------------------------------------------------------------------
// Relics — Phase 7+.
// ---------------------------------------------------------------------------

export type RelicRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'mythic';

export interface RelicAffix {
  id: string;
  /** Bucket id + magnitude, rolled at drop time. TYPED — see modifiers.ts. */
  bucket: Bucket;
  value: number;
}

export interface Relic {
  id: string;
  defId: string;
  rarity: RelicRarity;
  affixes: RelicAffix[];
  /** Duplicates fuse upward. */
  fuseCount: number;
}

// ---------------------------------------------------------------------------
// NPCs — Phase 6 (the Guild).
// ---------------------------------------------------------------------------

export interface NPCDef {
  id: string;
  name: string; // Marrow, Vess, Old Quill...
  role: 'smith' | 'merchant' | 'archivist' | 'hireling' | 'other';
  /** Real-clock schedule: hour-of-day presence windows. */
  schedule: Array<{ fromHour: number; toHour: number }>;
  /** Reputation gates recipes, discounts, questlines. */
  reputationTrack: string;
}
