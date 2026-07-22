/**
 * Save serialization. Decimals round-trip via a "D#" string prefix; the
 * transient fields (offline summary, event feed) are stripped. The payload
 * is versioned and passed through the migration chain on load.
 */
import { D, Decimal } from '../decimal';
import type { GameState } from '../types';
import { runMigrations, SAVE_VERSION } from './migrations';

const DECIMAL_TAG = 'D#';

export interface SavePayload {
  version: number;
  savedAt: number;
  state: unknown;
}

// Decimal defines its own toJSON, which JSON.stringify applies BEFORE the
// replacer sees the value — so we must read the original off the holder.
function replacer(this: Record<string, unknown>, key: string, value: unknown): unknown {
  const original = this[key];
  if (original instanceof Decimal) return DECIMAL_TAG + original.toString();
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && value.startsWith(DECIMAL_TAG)) {
    return D(value.slice(DECIMAL_TAG.length));
  }
  return value;
}

export function serialize(state: GameState, nowMs: number): string {
  const { offline: _offline, feed: _feed, ...rest } = state;
  const payload: SavePayload = {
    version: SAVE_VERSION,
    savedAt: nowMs,
    state: { ...rest, offline: null, feed: [] },
  };
  return JSON.stringify(payload, replacer);
}

/**
 * Parse + migrate a raw save string into a current-version GameState.
 * Throws on malformed input — callers decide whether that means "fresh save"
 * (storage) or "reject import" (UI).
 */
export function deserialize(raw: string): GameState {
  const payload = JSON.parse(raw, reviver) as SavePayload;
  if (typeof payload !== 'object' || payload === null || typeof payload.version !== 'number') {
    throw new Error('Not a save payload');
  }
  const migrated = runMigrations(payload);
  const state = migrated.state as GameState;
  state.offline = null;
  state.feed = [];
  return state;
}
