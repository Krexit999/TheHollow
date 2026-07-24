/**
 * MATERIAL TRAITS — the foundation of "materials with souls."
 *
 * The critique this phase answers: 139 materials that were one material with
 * 139 names. Traits make each a character. These tests hold the vocabulary to
 * the four rules the brief set — learnable, tradeoff-shaped, visible,
 * interacting — as PROPERTIES, not vibes.
 */
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../materials';
import {
  ALL_TRAITS, TRAIT_PAIRS, MATERIAL_TRAITS, traitsOf, traitDef,
  activePairs, traitPair,
  traitFactorLines, traitLeanText, compositionLean,
} from '../traits';

describe('every material has a character', () => {
  it('carries 2-3 traits, all real', () => {
    for (const m of MATERIALS) {
      const t = traitsOf(m.id);
      expect(t.length, `${m.id} has ${t.length} traits`).toBeGreaterThanOrEqual(2);
      expect(t.length, `${m.id} has ${t.length} traits`).toBeLessThanOrEqual(3);
      for (const id of t) expect(ALL_TRAITS, `${m.id} → '${id}'`).toContain(id);
      // No material repeats a trait.
      expect(new Set(t).size, `${m.id} repeats a trait`).toBe(t.length);
    }
  });

  it('the trait map names no material that does not exist', () => {
    const ids = new Set(MATERIALS.map((m) => m.id));
    for (const id of Object.keys(MATERIAL_TRAITS)) {
      expect(ids.has(id), `trait map has stale id '${id}'`).toBe(true);
    }
  });

  it('the two materials the brief names by trait match it', () => {
    // "Loamiron is soft but takes an edge" → springy + keen.
    expect(traitsOf('loamiron')).toEqual(expect.arrayContaining(['keen', 'springy']));
    // "Umberjade is brittle and hums with charge" → brittle + charged.
    expect(traitsOf('umberjade')).toEqual(expect.arrayContaining(['brittle', 'charged']));
  });
});

describe('the vocabulary obeys its four rules', () => {
  it('LEARNABLE: every trait is one plain sentence', () => {
    for (const id of ALL_TRAITS) {
      const d = traitDef(id);
      expect(d.blurb.length, id).toBeGreaterThan(15);
      expect(d.name.length, id).toBeGreaterThan(2);
    }
  });

  // TRADEOFF-SHAPED: every trait must be good at SOMETHING and bad at SOMETHING.
  // A trait that only helps is a stat bonus, not a character.
  it('TRADEOFF-SHAPED: every trait both helps and hurts', () => {
    for (const id of ALL_TRAITS) {
      const f = traitDef(id).factors;
      const values = Object.values(f).filter((v): v is number => v !== undefined);
      const helps = values.some((v) => v > 1);
      const hurts = values.some((v) => v < 1);
      // charged and warm are the two "reach" traits — they help a stat and pay
      // outward rather than hurting, which is their whole point. Everything
      // else must genuinely trade.
      if (id === 'charged' || id === 'warm') {
        expect(traitDef(id).reach, `${id} must reach outward`).toBeTruthy();
      } else {
        expect(helps, `${id} helps nothing`).toBe(true);
        expect(hurts, `${id} costs nothing — it is a stat, not a trait`).toBe(true);
      }
    }
  });

  // The rule that keeps early materials relevant at hour 80: no material is
  // strictly better than a lower-tier one at everything. If a keen common
  // exists, a keen head is always an option regardless of tier.
  it('specialisation, not superiority: each trait lives at multiple rarities', () => {
    for (const id of ALL_TRAITS) {
      const rarities = new Set(
        MATERIALS.filter((m) => traitsOf(m.id).includes(id)).map((m) => m.rarity),
      );
      expect(rarities.size, `trait '${id}' only appears at one rarity`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('trait pairs are the discovered layer', () => {
  it('every pair is authored and order-independent', () => {
    for (const p of TRAIT_PAIRS) {
      expect(ALL_TRAITS).toContain(p.a);
      expect(ALL_TRAITS).toContain(p.b);
      expect(p.a).not.toBe(p.b);
      expect(p.name.length).toBeGreaterThan(3);
      expect(p.flavor.length).toBeGreaterThan(20);
      expect(traitPair(p.a, p.b)).toBe(p);
      expect(traitPair(p.b, p.a)).toBe(p);
    }
  });

  it('has both shatters and songs', () => {
    expect(TRAIT_PAIRS.some((p) => p.mult < 1), 'no penalty pairs').toBe(true);
    expect(TRAIT_PAIRS.some((p) => p.mult > 1), 'no bonus pairs').toBe(true);
  });

  it('no single pair dominates a build', () => {
    for (const p of TRAIT_PAIRS) {
      expect(Math.abs(p.mult - 1), `${p.name} swings too hard`).toBeLessThanOrEqual(0.25);
    }
  });

  it('finds pairs in a combined trait set, deduped', () => {
    // brittle + dense is The Shatter; a tool carrying both should surface it.
    const found = activePairs(['brittle', 'dense', 'light']);
    expect(found.map((p) => p.name)).toContain('The Shatter');
    // A duplicate trait does not invent a self-pair.
    expect(activePairs(['keen', 'keen'])).toHaveLength(0);
  });

  it('every named pair is reachable from real materials', () => {
    // A pairing nobody can assemble is content that does not exist. For each
    // pair, at least one material must carry each half.
    for (const p of TRAIT_PAIRS) {
      const hasA = MATERIALS.some((m) => traitsOf(m.id).includes(p.a));
      const hasB = MATERIALS.some((m) => traitsOf(m.id).includes(p.b));
      expect(hasA && hasB, `pair '${p.name}' needs a material for each half`).toBe(true);
    }
  });
});

// The legibility layer: the words the UI shows so a trait reads as a direction,
// not a mystery. Same rule 3 as the vocabulary — a fact about the stone, never a
// solution; combinations (pairs) are still nowhere in this output.
describe('trait directions are legible', () => {
  it('VISIBLE: each factor becomes a labelled +/- line, raises first', () => {
    expect(traitFactorLines('keen')).toEqual([
      { axis: 'edge', label: 'chip yield', dir: 1, pct: 32 },
      { axis: 'hold', label: 'edge & rune hold', dir: -1, pct: 18 },
    ]);
    // A neutral factor (=1) never produces a line, and no line is 0%.
    for (const id of ALL_TRAITS) {
      for (const l of traitFactorLines(id)) {
        expect(l.pct, `${id} → ${l.label}`).toBeGreaterThan(0);
        expect([1, -1]).toContain(l.dir);
      }
    }
  });

  it('reads as a one-line "raises A · lowers B" for every trait', () => {
    expect(traitLeanText('keen')).toBe('raises chip yield · lowers edge & rune hold');
    // Dense moves two axes that both read as strike power — they dedupe to one.
    expect(traitLeanText('dense')).toBe('raises strike power · lowers chip speed');
    for (const id of ALL_TRAITS) {
      expect(traitLeanText(id).length, `${id} has no lean`).toBeGreaterThan(0);
    }
  });

  it('composition lean multiplies, groups by player label, and nets', () => {
    // Empty tool leans nowhere.
    expect(compositionLean([])).toEqual([]);
    // force + heft both read "strike power": Dense yields ONE strike line
    // (1.38 × 1.18 = 1.6284 → +63%), not two.
    const dense = compositionLean(['dense']);
    const strike = dense.filter((l) => l.label === 'strike power');
    expect(strike).toHaveLength(1);
    expect(strike[0]!.dir).toBe(1);
    expect(strike[0]!.pct).toBe(63);
    // Duplicate traits multiply: two Keen heads → 1.32² on chip yield.
    expect(compositionLean(['keen', 'keen']).find((l) => l.label === 'chip yield')!.pct).toBe(74);
    // Opposing factors net across the set: Dense cuts chip speed (0.78), Light
    // raises it more (1.34) → 1.0452, a small net RAISE.
    const dl = compositionLean(['dense', 'light']);
    expect(dl.find((l) => l.label === 'chip speed')!.dir).toBe(1);
    // Sorted strongest-first.
    for (let i = 1; i < dl.length; i++) expect(dl[i - 1]!.pct).toBeGreaterThanOrEqual(dl[i]!.pct);
  });
});
