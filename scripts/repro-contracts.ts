/**
 * Reproduce the duplicate contract-board entry before fixing it (Phase 11b).
 * A contract's player-visible identity is kind + issuer + target + subject;
 * `id` is a sequence number, so two slots can be byte-identical to the reader
 * while being "different" to the code.
 */
import { createEngine } from '../src/engine';
import { refillBoard } from '../src/engine/guild/contracts';
import type { GameState } from '../src/engine';

const identity = (c: { kind: string; npcId: string; target?: number; materialId?: string; speciesId?: string }) =>
  [c.kind, c.npcId, c.target, c.materialId ?? '', c.speciesId ?? ''].join('|');

function run(slots: number, present: string[], label: string): void {
  const engine = createEngine({ nowMs: Date.now() });
  const state = engine.getState() as GameState;
  state.guild.discovered = true;
  state.guild.contracts.slots = slots;
  state.guild.contracts.board = new Array(slots).fill(null);

  refillBoard(state, new Set(present));

  const board = state.guild.contracts.board.filter(Boolean) as Array<Parameters<typeof identity>[0] & { desc: string }>;
  const counts = new Map<string, number>();
  for (const c of board) counts.set(identity(c), (counts.get(identity(c)) ?? 0) + 1);
  const dupes = [...counts.entries()].filter(([, n]) => n > 1);

  console.log(`\n${label}: ${board.length} filled of ${slots}`);
  if (dupes.length === 0) {
    console.log('  no duplicates');
  } else {
    console.log(`  DUPLICATE IDENTITIES: ${dupes.length}`);
    for (const [key, n] of dupes.slice(0, 4)) {
      const sample = board.find((c) => identity(c) === key)!;
      console.log(`   ×${n}  "${sample.desc}"`);
    }
  }
}

run(20, ['prill', 'brakka'], 'depth-only issuers, 20 slots');
run(6, ['prill', 'brakka'], 'depth-only issuers, 6 slots (realistic)');
run(6, ['prill', 'brakka', 'vess', 'marrow', 'ashka', 'ruta', 'nock'], 'many issuers, 6 slots');
