/**
 * HEIRLOOM HISTORY (v22) — a tool remembers what it did.
 *
 * An implement carried long enough earns MARKS: it felled a Warden, survived a
 * Recursion, cracked a hundred geodes, carried through a Breach. Flavour first — a
 * record you can read on the tool — with a LIGHT mechanical edge: each distinct mark
 * adds a small, capped bonus, so a storied tool is a touch luckier without ever being
 * a power spike. It pairs with OPINIONS: a tool with history has both a record and a
 * temperament.
 *
 * PILLAR 2: the edge lands in `dropRate` (not income), so a decorated tool finds a
 * little more in the rock, it does not raise the ceiling.
 * PILLAR 1: marks are earned by things a player does; an idle player simply never
 * earns them and is not disadvantaged for it.
 */
import type { GameState, ToolInstance } from '../types';
import { registerModifier } from '../modifiers';
import { equippedTool } from './forge';

export interface HeirloomMark {
  id: string;
  label: string;
  note: string;
}

export const HEIRLOOM_MARKS: HeirloomMark[] = [
  { id: 'warden', label: 'Warden-slayer', note: 'Stood in the hand that felled a Floor Warden.' },
  { id: 'recursion', label: 'Recursion-worn', note: 'Carried whole through the unmaking of a world.' },
  { id: 'geodes', label: 'Geode-breaker', note: 'Cracked a hundred geodes and asked for a hundred more.' },
  { id: 'breach', label: 'Breach-borne', note: 'Fell through a shell floor into the next world, still swinging.' },
];

/** Threshold-earned marks: a deed counter must reach this to earn the mark. */
const DEED_THRESHOLD: Record<string, number> = { geodes: 100 };

/** Per distinct mark, into dropRate. Small and capped — a record, not a build. */
const PER_MARK = 0.01;
const MARK_CAP = 0.06;

export function heirloomBonus(tool: ToolInstance): number {
  const n = tool.history?.length ?? 0;
  return Math.min(MARK_CAP, n * PER_MARK);
}

/** Give the EQUIPPED tool a mark (idempotent — a deed is recorded once). */
export function addToolMark(state: GameState, markId: string): void {
  const tool = equippedTool(state);
  if (tool.id < 0) return; // bare hands earn nothing
  const hist = (tool.history ??= []);
  if (!hist.includes(markId)) hist.push(markId);
}

/** Advance a deed counter on the equipped tool; award the mark once it crosses. */
export function logToolDeed(state: GameState, deedId: string, n = 1): void {
  const tool = equippedTool(state);
  if (tool.id < 0) return;
  const deeds = (tool.deeds ??= {});
  deeds[deedId] = (deeds[deedId] ?? 0) + n;
  const need = DEED_THRESHOLD[deedId];
  if (need !== undefined && deeds[deedId]! >= need) addToolMark(state, deedId);
}

export function markLabel(id: string): string {
  return HEIRLOOM_MARKS.find((m) => m.id === id)?.label ?? id;
}

export function registerHeirloomModifier(): void {
  registerModifier({
    id: 'heirloom',
    label: 'A tool with history',
    bucket: 'dropRate',
    value: (s) => 1 + heirloomBonus(equippedTool(s)),
  });
}
