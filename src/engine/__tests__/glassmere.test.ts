import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { Engine, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import { D } from '../decimal';
import { addCurrency, getCurrency } from '../resources';
import { traceBeam, setMirror, splitUnlocked } from '../systems/refraction';
import { DISSONANT, RUNE_PAIRS, inscribe, sequencePairs } from '../content/shell4/runes';
import { cellCap } from '../systems/face';
import { runMigrations, SAVE_VERSION } from '../save/migrations';
import { serialize } from '../save/codec';

const ctx = { emit: () => {}, dirty: () => {} };

function fresh(): { engine: Engine; s: GameState; mods: ModifierCache } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState, mods: new ModifierCache() };
}

function glassy(): { engine: Engine; s: GameState; mods: ModifierCache } {
  const { engine, s, mods } = fresh();
  s.shell.current = 'glassmere';
  s.shell.breachCount = 3;
  s.collapse.count = 1;
  s.depth = 40;
  s.depthRecords['glassmere'] = 60;
  return { engine, s, mods };
}

describe('refraction: light walks a path you arranged', () => {
  it('the beam crosses the row, mirrors turn it, vines bend and block, full cells amplify', () => {
    const { s, mods } = glassy();
    s.refraction.entryRow = 2;
    const w = s.face.w;
    let path = traceBeam(s, mods);
    expect(path.length).toBe(w); // straight across row 2
    expect(path.every((b) => Math.floor(b.cell / w) === 2)).toBe(true);
    // A '\' mirror sends it down.
    expect(setMirror(s, 2 * w + 3, '\\').ok).toBe(true);
    path = traceBeam(s, mods);
    expect(path.some((b) => Math.floor(b.cell / w) > 2)).toBe(true);
    // Mirror stock is finite.
    expect(setMirror(s, 2 * w + 1, '/').ok).toBe(true);
    expect(setMirror(s, 0, '/').ok).toBe(false);
    // A bloom blocks; a sprout bends downward.
    setMirror(s, 2 * w + 3, null);
    setMirror(s, 2 * w + 1, null);
    s.growth.stage = s.face.cells.map(() => 0);
    s.growth.stage[2 * w + 2] = 3;
    path = traceBeam(s, mods);
    expect(path.length).toBe(2); // stopped at the canopy
    s.growth.stage[2 * w + 2] = 1;
    path = traceBeam(s, mods);
    expect(path.some((b) => b.dir === 1)).toBe(true); // bent down by the sprout
    // Amplification from a full cell marks downstream segments.
    s.growth.stage[2 * w + 2] = 0;
    const cap = cellCap(s, mods);
    s.face.cells[2 * w + 1] = cap;
    path = traceBeam(s, mods);
    const after = path.filter((b) => b.cell > 2 * w + 1 && Math.floor(b.cell / w) === 2);
    expect(after.every((b) => b.amplified)).toBe(true);
  });

  it('beam-lit cells harvest brighter; the split waits for mastery 25', () => {
    const { engine, s, mods } = glassy();
    expect(splitUnlocked(s)).toBe(false);
    s.depthRecords['glassmere'] = 250;
    expect(splitUnlocked(s)).toBe(true);
    s.refraction.entryRow = 0;
    s.refraction.pathDirty = true;
    const cap = cellCap(s, mods);
    s.face.cells[0] = cap;
    const before = getCurrency(s, 'prism').toNumber();
    engine.dispatch({ type: 'chip', cell: 0 });
    const litGain = getCurrency(s, 'prism').toNumber() - before;
    s.face.cells[5 * s.face.w] = cap; // off the beam
    const b2 = getCurrency(s, 'prism').toNumber();
    engine.dispatch({ type: 'chip', cell: 5 * s.face.w });
    const darkGain = getCurrency(s, 'prism').toNumber() - b2;
    expect(litGain).toBeGreaterThan(darkGain * 1.3);
  });
});

describe('runes: a positional grammar with soft stakes', () => {
  it('Kel-Thur is not Thur-Kel; dissonance ruins the inscription, never the item', () => {
    expect(RUNE_PAIRS['kel|thur']!.bucket).not.toBe(RUNE_PAIRS['thur|kel']!.bucket);
    expect(sequencePairs(['kel', 'thur', 'kel'])).toEqual(['kel|thur', 'thur|kel']);
    const { s } = glassy();
    s.runes.found = { kel: 4, thur: 2, vey: 2 };
    const good = inscribe(s, ctx, 'tool', ['kel', 'thur', 'kel']);
    expect((good.data as { dissonant: boolean }).dissonant).toBe(false);
    expect(s.runes.pairsSeen).toContain('kel|thur');
    expect(s.runes.inscriptions['tool']).toEqual(['kel', 'thur', 'kel']);
    // Dissonant: kel|vey. Runes lost, surface fouled, item untouched.
    const bad = inscribe(s, ctx, 'offhand', ['kel', 'vey', null]);
    expect((bad.data as { dissonant: boolean }).dissonant).toBe(true);
    expect(s.runes.fouled['offhand']).toBe(true);
    // Re-prep costs silica.
    expect(inscribe(s, ctx, 'offhand', ['thur', 'kel', null]).ok).toBe(false);
    addCurrency(s, 'silica', D(100));
    expect(inscribe(s, ctx, 'offhand', ['thur', 'kel', null]).ok).toBe(true);
    for (const p of DISSONANT) expect(RUNE_PAIRS[p]).toBeUndefined();
  });
});

describe('save v8', () => {
  it('migrates v7 saves with the cold shell asleep', () => {
    const { s } = fresh();
    const raw = JSON.parse(serialize(s, 0)) as { state: Record<string, unknown> };
    for (const k of ['refraction', 'runes']) delete raw.state[k];
    const migrated = runMigrations({ version: 7, savedAt: 0, state: raw.state } as never);
    expect(migrated.version).toBe(SAVE_VERSION);
    const st = migrated.state as Record<string, Record<string, unknown>>;
    expect(st['refraction']!['mirrorStock']).toBe(2);
  });
});
