import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { Engine, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import { D } from '../decimal';
import { addCurrency, getCurrency } from '../resources';
import { addMaterial } from '../systems/forge';
import { traceBeam, setMirror, splitUnlocked } from '../systems/refraction';
import {
  CONSTELLATIONS, OBSERVATION_TIERS, collectObservation, observationProgress, startObservation,
} from '../content/shell4/observatory';
import { AUTHORED_PUZZLES, buildPuzzle, lensFor, puzzleById, simulateBench } from '../content/shell4/bench';
import { WARRENS, checkAnswer, puzzleData, warrenAvailable } from '../content/shell4/warrens';
import { DISSONANT, RUNE_PAIRS, inscribe, sequencePairs } from '../content/shell4/runes';
import { AUTO_SKILL, resolveFight } from '../combat/combat';
import { speciesOfShell, wardenOf } from '../combat/species';
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
  s.guild.discovered = true;
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

describe('the observatory: AFK skies with structure', () => {
  it('exposes on the game clock, waits forever, completes constellations', () => {
    const { engine, s } = glassy();
    // The export spine: a held gaze wraps the lens in Verdance's cloth.
    expect(startObservation(s, 1).ok).toBe(false); // no fibercloth yet
    addMaterial(s, 'fibercloth', 70, 3);
    expect(startObservation(s, 1).ok).toBe(true);
    expect(collectObservation(s, ctx).ok).toBe(false); // still exposing
    s.guild.clockMs += OBSERVATION_TIERS[1]!.minutes * 60_000 + 1;
    expect(observationProgress(s)).toBe(1);
    s.guild.clockMs += 48 * 3600_000; // two days late — nothing expired
    const r = collectObservation(s, ctx);
    expect(r.ok).toBe(true);
    expect(getCurrency(s, 'spectrum').toNumber()).toBeGreaterThan(0);
    // Completing a constellation grants its permanent bonus.
    const con = CONSTELLATIONS[0]!;
    for (const p of con.pieces) s.observatory.pieces[p] = 1;
    startObservation(s, 0);
    s.guild.clockMs += 11 * 60_000;
    collectObservation(s, ctx);
    expect(s.observatory.constellations).toContain(con.id);
    void engine;
  });
});

describe('the bench: solutions are possessions', () => {
  it('50 authored puzzles, all solvable by their own construction', () => {
    expect(AUTHORED_PUZZLES).toHaveLength(50);
    for (const p of AUTHORED_PUZZLES) {
      const { solved } = simulateBench(p, p.solution);
      expect(solved, p.id).toBe(true);
      expect(p.targets.length).toBeGreaterThanOrEqual(2);
    }
    // The generator never runs out and stays solvable.
    for (let seed = 5000; seed < 5010; seed++) {
      const p = buildPuzzle(seed, 2, false);
      expect(simulateBench(p, p.solution).solved).toBe(true);
    }
  });

  it('solving grinds a Lens; equipping applies its modifier; failures refund nothing but teach', () => {
    const { engine, s } = glassy();
    s.depthRecords['glassmere'] = 60; // mastery 6 >= 4
    addCurrency(s, 'silica', D(1000));
    const p = AUTHORED_PUZZLES[0]!;
    const bad = engine.dispatch({ type: 'benchAttempt', puzzleId: p.id, mirrors: {} });
    expect(bad.ok).toBe(true);
    expect((bad.data as { solved: boolean }).solved).toBe(false);
    const good = engine.dispatch({ type: 'benchAttempt', puzzleId: p.id, mirrors: p.solution });
    expect((good.data as { solved: boolean }).solved).toBe(true);
    expect(s.bench.solved).toContain(p.id);
    expect(engine.dispatch({ type: 'equipLens', puzzleId: p.id }).ok).toBe(true);
    const lens = lensFor(p.id);
    expect(lens.value).toBeGreaterThan(1);
    expect(puzzleById('gen1234')).not.toBeNull();
  });
});

describe('the warrens: twenty handmade detours (Phase 9 added the burnt four)', () => {
  it('four per shell, gated by record, uniques once, runes as the reason', () => {
    const byShell = new Map<string, number>();
    for (const w of WARRENS) byShell.set(w.shellId, (byShell.get(w.shellId) ?? 0) + 1);
    expect([...byShell.values()]).toEqual([4, 4, 4, 4, 4, 4, 4]); // seven shells now — every world got its detours
    expect(WARRENS.filter((w) => w.unique.kind === 'rune').length).toBeGreaterThanOrEqual(8);
    for (const w of WARRENS) {
      expect(w.layout.length).toBeGreaterThan(60); // handmade, described
      // Every puzzle validates against its own data.
      const data = puzzleData(w);
      if (w.puzzle.kind === 'echo') expect(checkAnswer(w, data.sequence!)).toBe(true);
      if (w.puzzle.kind === 'weights') {
        // The constructed subset sums exist — brute-force one.
        const ws = data.weights!;
        let found = false;
        for (let mask = 1; mask < 1 << ws.length && !found; mask++) {
          const sum = ws.reduce((a, x, i) => a + ((mask >> i) & 1) * x, 0);
          if (sum === data.target) {
            found = checkAnswer(w, ws.map((_, i) => i).filter((i) => (mask >> i) & 1));
          }
        }
        expect(found, w.id).toBe(true);
      }
      if (w.puzzle.kind === 'gates') {
        const lit = new Set<number>();
        for (const g of data.gates!) for (const l of g.on) lit.add(l);
        for (const g of data.gates!) for (const l of g.off) lit.delete(l);
        expect(checkAnswer(w, [...lit]), w.id).toBe(true);
      }
    }
  });

  it('the flow: enter, answer, fight the keeper, claim; leaving costs nothing', () => {
    const { engine, s } = glassy();
    const w = WARRENS.find((x) => x.id === 'ossuary')!;
    s.depthRecords['loam'] = 150;
    expect(warrenAvailable(s, w)).toBe(true);
    expect(engine.dispatch({ type: 'warrenEnter', id: 'ossuary' }).ok).toBe(true);
    expect(engine.dispatch({ type: 'warrenLeave' }).ok).toBe(true); // a detour, not a trap
    engine.dispatch({ type: 'warrenEnter', id: 'ossuary' });
    const seq = puzzleData(w).sequence!;
    const r = engine.dispatch({ type: 'warrenAnswer', id: 'ossuary', answer: seq });
    expect((r.data as { solved: boolean }).solved).toBe(true);
    expect(s.combat.active?.speciesId).toBe(w.fight);
    // Cheat the fight down for the test; claim pays the unique exactly once.
    s.combat.active = null;
    s.combat.kills[w.fight] = (s.combat.kills[w.fight] ?? 0) + 1;
    expect(engine.dispatch({ type: 'warrenClaim' }).ok).toBe(true);
    expect(s.warrens.uniques).toContain('ossuary');
    expect((s.runes.found['kel'] ?? 0)).toBeGreaterThanOrEqual(2);
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
    expect(s.forge.gear).toBeDefined(); // nothing destroyed, ever
    // Re-prep costs silica.
    expect(inscribe(s, ctx, 'offhand', ['thur', 'kel', null]).ok).toBe(false);
    addCurrency(s, 'silica', D(100));
    expect(inscribe(s, ctx, 'offhand', ['thur', 'kel', null]).ok).toBe(true);
    for (const p of DISSONANT) expect(RUNE_PAIRS[p]).toBeUndefined();
  });
});

describe('the unblinking: sight is the whole fight', () => {
  it('blind auto bounces; reveal gear restores the reading; a period kit fells it', () => {
    const { s, mods } = glassy();
    expect(speciesOfShell('glassmere')).toHaveLength(15);
    const warden = wardenOf('glassmere')!;
    s.forge.tools.push({
      id: 21, recipeId: 'meridianEdge', name: 'Meridian Edge', tier: 12,
      purity: 70, chipPower: 21.5, strikePower: 300, sockets: ['bloodgarnet', 'cinderquartz', null, null], alloys: [null, null],
    });
    s.forge.equipped = s.forge.tools.length - 1;
    s.forge.gear.offhand = { defId: 'frostward', purity: 60 };
    s.forge.gear.harness = { defId: 'prismweave', purity: 60 };
    s.delver.skills['twoHandedSwing'] = 5;
    s.delver.skills['deepGrip'] = 3;
    for (const id of ['firstKill', 'wardenLoam', 'kills25']) s.achievements.unlocked[id] = true;
    mods.invalidate();
    // No reveal: it winds up unseen and the kit loses.
    expect(resolveFight(s, mods, warden, AUTO_SKILL).win).toBe(false);
    // Look before acting: reveal gear turns the same fight.
    s.forge.gear.lantern = { defId: 'unblinkingMonocle', purity: 60 };
    mods.invalidate();
    expect(resolveFight(s, mods, warden, AUTO_SKILL).win).toBe(true);
  });
});

describe('save v8', () => {
  it('migrates v7 saves with the cold shell asleep', () => {
    const { s } = fresh();
    const raw = JSON.parse(serialize(s, 0)) as { state: Record<string, unknown> };
    for (const k of ['refraction', 'observatory', 'bench', 'warrens', 'runes']) delete raw.state[k];
    const migrated = runMigrations({ version: 7, savedAt: 0, state: raw.state } as never);
    expect(migrated.version).toBe(SAVE_VERSION);
    const st = migrated.state as Record<string, Record<string, unknown>>;
    expect(st['refraction']!['mirrorStock']).toBe(2);
    expect(st['warrens']!['uniques']).toEqual([]);
  });
});
