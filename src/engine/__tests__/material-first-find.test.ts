/**
 * A material announces itself ONCE. The `materialFound` event carries `first`,
 * true only the very first time that stone ever reaches your hands — so the UI
 * can greet a discovery and stay silent for the hundredth of the same rock.
 *
 * The guarantee is computed at the drop site, BEFORE the material is marked
 * known; reading it after would make the answer always "no".
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { EngineCtx, GameEvent, GameState } from '../types';
import { applyDrop } from '../systems/drops';

function fresh(): { s: GameState; events: GameEvent[]; ctx: EngineCtx } {
  const engine = createEngine({ nowMs: 0 });
  const events: GameEvent[] = [];
  const ctx: EngineCtx = { emit: (e) => events.push(e), dirty() {} };
  return { s: engine.getState() as GameState, events, ctx };
}
const firstFlags = (events: GameEvent[]) =>
  events.filter((e) => e.type === 'materialFound').map((e) => (e as { first: boolean }).first);

describe('materialFound — first-ever finds only', () => {
  it('is first the first time and never again for that material', () => {
    const { s, events, ctx } = fresh();
    const drop = { kind: 'material' as const, materialId: 'marl', purity: 50 };
    applyDrop(s, ctx, drop);
    applyDrop(s, ctx, drop);
    applyDrop(s, ctx, drop);
    expect(firstFlags(events)).toEqual([true, false, false]);
  });

  it('tracks each material independently', () => {
    const { s, events, ctx } = fresh();
    applyDrop(s, ctx, { kind: 'material', materialId: 'marl', purity: 50 });
    applyDrop(s, ctx, { kind: 'material', materialId: 'loamiron', purity: 50 });
    applyDrop(s, ctx, { kind: 'material', materialId: 'marl', purity: 50 });
    expect(firstFlags(events)).toEqual([true, true, false]);
  });

  it('a material already known before the drop is never announced as new', () => {
    const { s, events, ctx } = fresh();
    s.assay.knownMaterials.push('marl'); // learned some other way first
    applyDrop(s, ctx, { kind: 'material', materialId: 'marl', purity: 50 });
    expect(firstFlags(events)).toEqual([false]);
  });

  it('the stone still lands either way — the flag is only about announcing', () => {
    const { s, ctx } = fresh();
    const drop = { kind: 'material' as const, materialId: 'marl', purity: 50 };
    applyDrop(s, ctx, drop);
    applyDrop(s, ctx, drop);
    const bands = Object.values(s.materials.stacks['marl'] ?? {});
    const total = bands.reduce((n, b) => n + (b?.count ?? 0), 0);
    expect(total).toBe(2);
  });
});
