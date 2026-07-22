/**
 * Export/import saves as a compressed base64 string (lz-string is pure JS —
 * no DOM). The string is safe to paste anywhere.
 */
import { compressToBase64, decompressFromBase64 } from 'lz-string';
import type { GameState } from '../types';
import { deserialize, serialize } from './codec';

export function exportSave(state: GameState, nowMs: number): string {
  return compressToBase64(serialize(state, nowMs));
}

export function importSave(encoded: string): GameState {
  const raw = decompressFromBase64(encoded.trim());
  if (!raw) throw new Error('Could not decompress — is this a Hollow save string?');
  return deserialize(raw);
}
