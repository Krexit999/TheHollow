/**
 * THE SHELL ABSTRACTION — the Phase 4 deliverable. A shell is DATA: its chip
 * currency, its converter's identity, its hardness walls, its floor, its
 * signature. The face, converter, drills, depth, and collapse systems are
 * universal scaffolding that read the current shell; adding Verdance is a
 * content module + a signature module + a craft-system registration + a save
 * migration. Nothing structural.
 */
import type { GameState } from './types';

export interface HardnessWall {
  depth: number;
  tier: number;
}

export interface ShellContentDef {
  id: string;
  ordinal: number; // I = 1 ... VII = 7
  name: string; // 'Loam'
  title: string; // 'SHELL I · LOAM'
  /** What chipping yields here (the dust-analog). */
  chipCurrencyId: string;
  /** What the converter produces (the brick-analog). */
  convCurrencyId: string;
  /** The converter's identity — same machine, different face. */
  converterName: string;
  converterFlavor: string;
  /** Depth of the shell floor — reaching it enables the Breach. */
  floorDepth: number;
  /** Tool-tier hardness walls within this shell. */
  walls: HardnessWall[];
  /** Signature mechanic id (registered in signatures.ts), if any. */
  signatureId?: string;
  /** Drills scrape a byproduct here (per point of charge taken). */
  drillByproduct?: { currencyId: string; perCharge: number };
  /** Deep chips carry a byproduct below minDepth (per point of charge). */
  deepByproduct?: { currencyId: string; minDepth: number; perCharge: number };
}

const registry = new Map<string, ShellContentDef>();
const order: string[] = [];

export function registerShell(def: ShellContentDef): void {
  if (registry.has(def.id)) throw new Error(`Duplicate shell: ${def.id}`);
  registry.set(def.id, def);
  order.push(def.id);
  order.sort((a, b) => registry.get(a)!.ordinal - registry.get(b)!.ordinal);
}

export function clearShells(): void {
  registry.clear();
  order.length = 0;
}

export function shellDef(id: string): ShellContentDef {
  const def = registry.get(id);
  if (!def) throw new Error(`Unknown shell: ${id}`);
  return def;
}

/**
 * THE SAME LOOKUP THAT DOES NOT THROW, for callers on a hot path that have a
 * sensible answer for "not registered yet".
 *
 * `RARITY_GATES` needs a shell's floor twelve times per drop roll (A.91), and
 * the shell registry is EMPTY until an engine is created — the `allShells()`
 * trap, ledgered at A.58. Asking through `shellDef` meant a THROW per ask in
 * any context with no engine: `export-spine.test.ts` went from 130ms to 5.3
 * seconds and timed out, on a change that made the engine no slower at all.
 * An exception is not a control-flow primitive on a path taken 200,000 times.
 */
export function shellDefOrNull(id: string): ShellContentDef | null {
  return registry.get(id) ?? null;
}

export function allShells(): ShellContentDef[] {
  return order.map((id) => registry.get(id)!);
}

export function currentShell(state: GameState): ShellContentDef {
  return shellDef(state.shell.current);
}

export function nextShell(state: GameState): ShellContentDef | null {
  const idx = order.indexOf(state.shell.current);
  return idx >= 0 && idx + 1 < order.length ? registry.get(order[idx + 1]!)! : null;
}

export function chipCurrencyId(state: GameState): string {
  return currentShell(state).chipCurrencyId;
}

export function convCurrencyId(state: GameState): string {
  return currentShell(state).convCurrencyId;
}

/** Tool tiers craftable: 3 per shell reached (I-III in Loam, IV-VI in Ferrite). */
export function maxToolTier(state: GameState): number {
  return 3 * currentShell(state).ordinal;
}

/** Per-shell permanent depth record (feeds every prestige formula; never resets). */
export function depthRecord(state: GameState, shellId: string): number {
  return state.depthRecords[shellId] ?? 0;
}

/**
 * Upgrade costs written as 'CHIP'/'CONV' resolve to the current shell's
 * currencies — the same Blade that cost Dust in Loam costs Ingot in Ferrite.
 */
export function resolveCurrencyId(currency: string, state: GameState): string {
  if (currency === 'CHIP') return chipCurrencyId(state);
  if (currency === 'CONV') return convCurrencyId(state);
  return currency;
}
