/**
 * THE LINE THAT CARRIES A THIRD OF THE MATERIAL ECONOMY.
 *
 * Hand-chipping is the only route to c≥14 and c≥20 for anybody — machines never
 * compact, ruled permanent — and a hand that takes the fullest cell reaches
 * neither, ever (0 units in eighteen simulated hours). So the face has to say
 * what the digit is for, and these are the rules that line has to obey.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../engine';
import type { GameState } from '../../engine/types';
import { SYSTEM_COPY } from '../systemCopy';
import { noteTally } from '../../engine/systems/reading';

const line = (s: GameState): string | null => SYSTEM_COPY.dig!.next!(s);

function opened(): GameState {
  const s = createEngine({ nowMs: 0 }).getState() as GameState;
  // Past the opening beats: descended once, Kiln up, no windfall waiting.
  s.maxDepthRecord = 3;
  s.kiln.built = true;
  s.face.compaction = s.face.cells.map(() => 0);
  return s;
}

describe('the face says what the number is for', () => {
  it('says nothing until the rock carries a number', () => {
    const s = opened();
    expect(line(s)).toBeNull();
  });

  it('...and speaks the moment it does', () => {
    const s = opened();
    s.face.compaction![4] = 1;
    expect(line(s)).toMatch(/work one square/i);
  });

  it('names the BEHAVIOUR and never a threshold or a material (LAW 3)', () => {
    const s = opened();
    s.face.compaction![4] = 3;
    const said = line(s)!;
    // The destination is the digit the player can already see move.
    expect(said).toMatch(/one square/i);
    // No recipe, no table, no name of a thing they have not met.
    for (const leak of ['8', '14', '20', 'umberjade', 'graveclay', 'deepgrave', 'deep-entry', 'gate']) {
      expect(said.toLowerCase(), leak).not.toContain(leak.toLowerCase());
    }
  });

  it('stops forever once a gate has been crossed', () => {
    const s = opened();
    s.face.compaction![4] = 6;
    expect(line(s)).not.toBeNull();
    noteTally(s, 'gates');
    expect(line(s)).toBeNull();
  });

  it('never displaces §23\'s opening beats', () => {
    // Before the first descent the two tutorial lines own the screen, and the
    // Kiln line outranks everything — a hint that crowds the opening is a
    // regression in the most measured 45 minutes in the game.
    const s = createEngine({ nowMs: 0 }).getState() as GameState;
    s.face.compaction = s.face.cells.map(() => 4);
    expect(line(s)).toMatch(/tap the rock/i);
    s.maxDepthRecord = 3;
    s.currencies['dust'] = s.currencies['dust']!.add(600);
    expect(line(s)).toMatch(/kiln/i);
  });
});
