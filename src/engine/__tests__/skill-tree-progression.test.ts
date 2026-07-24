/**
 * THE DELVER SKILL TREE OPENS ACROSS ALL SEVEN SHELLS.
 *
 * The bug: the tree shipped ~13 real nodes (~47 points to max) plus twelve
 * permanently-sealed stubs that no code ever opened. A player maxed the real
 * tree in Loam and every skill point after had nowhere to go. These tests pin
 * the fix: nodes open PROGRESSIVELY as you breach into deeper shells, so there
 * is always somewhere for a point to land until the last shell — and a formerly
 * sealed node is really buyable once its shell is reached.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { GameState } from '../types';
import { SKILL_NODES, skillNodeUnlocked, skillNodeDef } from '../content/shell1/skillTree';

function fresh(): { engine: ReturnType<typeof createEngine>; s: GameState } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState };
}
const unlockedCount = (s: GameState) => SKILL_NODES.filter((n) => skillNodeUnlocked(s, n)).length;

describe('skill tree — progressive unlock across shells', () => {
  it('the tree does not finish in Loam: there are locked nodes ahead of a breach-0 player', () => {
    const { s } = fresh();
    s.shell.breachCount = 0;
    const open = unlockedCount(s);
    const total = SKILL_NODES.length;
    expect(open).toBeLessThan(total); // something is still to come
    // And there are genuinely more points behind the wall than a Loam player can spend.
    const lockedPoints = SKILL_NODES
      .filter((n) => !skillNodeUnlocked(s, n))
      .reduce((a, n) => a + n.maxRank * n.costPerRank, 0);
    expect(lockedPoints).toBeGreaterThan(20);
  });

  it('each deeper breach opens strictly more of the tree', () => {
    const { s } = fresh();
    let prev = -1;
    for (let breach = 0; breach <= 6; breach++) {
      s.shell.breachCount = breach;
      const open = unlockedCount(s);
      expect(open).toBeGreaterThan(prev); // more opens at every shell
      prev = open;
    }
    // By the last shell, the whole tree is open.
    expect(unlockedCount(s)).toBe(SKILL_NODES.length);
  });

  it('a formerly-sealed node is un-buyable in Loam and buyable once its shell is reached', () => {
    const { engine, s } = fresh();
    const node = skillNodeDef('veinMemory'); // opens at Ferrite (breach 1)
    expect(node.unlockBreach).toBe(1);
    s.delver.skillPoints = 10;

    s.shell.breachCount = 0;
    expect(engine.dispatch({ type: 'buySkillNode', id: 'veinMemory' }).ok).toBe(false);

    s.shell.breachCount = 1;
    expect(engine.dispatch({ type: 'buySkillNode', id: 'veinMemory' }).ok).toBe(true);
    expect(s.delver.skills['veinMemory']).toBe(1);
  });

  it('no node is permanently sealed — every node opens by the deepest shell', () => {
    const { s } = fresh();
    s.shell.breachCount = 6;
    for (const n of SKILL_NODES) expect(skillNodeUnlocked(s, n)).toBe(true);
  });
});
