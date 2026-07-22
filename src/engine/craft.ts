/**
 * Craft-system registry — the real interface Phase 2 promised. A craft-system
 * is a persistent board with its own currency, passive rank, and Codex. The
 * engine iterates registered systems generically in tick() and the offline
 * calculation; adding the Alloy Crucible (Phase 4) is one registerCraftSystem
 * call plus content — no engine changes.
 */
import type { ModifierCache } from './modifiers';
import type { EngineCtx, GameState } from './types';

export interface CodexEntry {
  id: string;
  name: string;
  flavor: string;
  /** Human-readable effect line, e.g. "+12% Dust while formed". */
  effect: string;
  /** Currently delivering its effect (chord geometry intact, etc.)? */
  active: boolean;
  kind: 'chord' | 'progression' | 'recipe' | 'pattern';
}

export interface CraftSystem {
  id: string;
  name: string;
  /** Registry id of the system's own currency (Motif, Alloy Mark, ...). */
  currencyId: string;
  /** Visible/tickable? Craft-systems are uncovered, never pre-listed. */
  unlocked(state: GameState): boolean;
  /**
   * Guarantee the system's GameState slice exists (fresh saves, migrations,
   * imports). Must be idempotent.
   */
  ensureState(state: GameState): void;
  /** Live simulation step. Called only while unlocked. */
  tick(state: GameState, mods: ModifierCache, ctx: EngineCtx, dt: number): void;
  /** Closed-form offline accrual (passive rank, currency trickle). */
  offlineTick(
    state: GameState,
    mods: ModifierCache,
    ctx: EngineCtx,
    seconds: number,
    efficiency: number,
  ): void;
  /**
   * Passive Rank — the never-opened-the-tab floor, worth ~50% of engaged
   * play (pillar 4). Returned for UI display; its bonus is a modifier.
   */
  passiveRank(state: GameState): number;
  /** Discovered entries ONLY — never a locked list (pillar 5). */
  codex(state: GameState): CodexEntry[];
}

const registry = new Map<string, CraftSystem>();

export function registerCraftSystem(system: CraftSystem): void {
  if (registry.has(system.id)) throw new Error(`Duplicate craft system: ${system.id}`);
  registry.set(system.id, system);
}

export function clearCraftSystems(): void {
  registry.clear();
}

export function allCraftSystems(): CraftSystem[] {
  return [...registry.values()];
}

export function craftSystem(id: string): CraftSystem {
  const system = registry.get(id);
  if (!system) throw new Error(`Unknown craft system: ${id}`);
  return system;
}
