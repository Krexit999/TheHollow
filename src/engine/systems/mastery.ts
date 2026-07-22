/**
 * SHELL MASTERY — per-shell level 1-50 from depth records only. Never
 * resets (records are permanent). Gates each shell's advanced systems.
 */
import type { GameState } from '../types';
import { depthRecord } from '../shells';

export const MASTERY_CAP = 50;
export const DEPTH_PER_LEVEL = 10;

export function masteryLevel(state: GameState, shellId: string): number {
  return Math.min(MASTERY_CAP, Math.floor(depthRecord(state, shellId) / DEPTH_PER_LEVEL));
}

/** Ferrite gates (Loam's mastery gates arrive with its advanced systems). */
export const MASTERY_GATES: { shellId: string; level: number; what: string }[] = [
  { shellId: 'ferrite', level: 2, what: 'The Alloy Crucible' },
  { shellId: 'ferrite', level: 4, what: 'The Magnet Array' },
  { shellId: 'ferrite', level: 6, what: 'Alloy slots on tools' },
];

export function nextGate(state: GameState, shellId: string): { level: number; what: string } | null {
  const level = masteryLevel(state, shellId);
  for (const gate of MASTERY_GATES) {
    if (gate.shellId === shellId && level < gate.level) return gate;
  }
  return null;
}
