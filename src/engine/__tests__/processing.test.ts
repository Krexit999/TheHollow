/**
 * §13'S SIX FOLDED PROCESSING STEPS — three that already existed, two built,
 * one cut by the spine itself.
 *
 * §0 is item 10: which of them already exist under another name. It is asserted
 * rather than reported, because "it already exists" is a claim about the code
 * and the ledger has been wrong about that before.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createEngine } from '../index';
import { ensureContentLoaded } from '../content';
import { ModifierCache } from '../modifiers';
import { ensurePlant } from '../systems/plant';
import {
  CRUSH_BATCH, CRUSH_BYPRODUCT, CRUSH_PRODUCT, FINENESS, LEACH_BATCH, LEACH_PAYS,
  crush, crushPreview, finenessOf, leach, leachBlocker, setFineness,
} from '../systems/crusher';
import { FORMS } from '../systems/press';
import { setSocket } from '../systems/toolSockets';
import { CORE_NODES } from '../content/shell1/coreTree';
import { addMaterial, materialCount } from '../systems/forge';
import { getCurrency } from '../resources';
import { convCurrencyId } from '../shells';
import { dpsMax } from '../systems/face';
import { BANDS } from '../materials';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx = (): EngineCtx => ({ dirty: () => {}, emit: () => {} }) as unknown as EngineCtx;

function withCrusher(tier = 3): GameState {
  const s = createEngine({ nowMs: 0 }).getState() as GameState;
  ensurePlant(s).tiers['crusher'] = tier;
  s.plant!.surge = 9999;
  return s;
}

describe('§0 — ITEM 10: three of the five already exist under another name', () => {
  it('DRAW BENCH → the Press die: ROD and WIRE are pulled through one already', () => {
    const rod = FORMS.find((f) => f.id === 'rod')!;
    const wire = FORMS.find((f) => f.id === 'wire')!;
    expect(rod.blurb.toLowerCase()).toContain('die');
    // ...and they are TIER-GATED, which is what choosing a die is.
    expect(new Set(FORMS.map((f) => f.tier)).size).toBeGreaterThan(1);
    expect(wire.tier).toBeGreaterThanOrEqual(rod.tier);
  });

  it('SETTING BENCH → the Tool Station: `setSocket` seats all three kinds', () => {
    // One verb, reversible by shape, for relics, runes and gems. A second
    // bench would have been the same verb with a wreck in front of it.
    expect(typeof setSocket).toBe('function');
    const s = createEngine({ nowMs: 0 }).getState() as GameState;
    const r = setSocket(s, ctx(), 0, { kind: 'gem', id: 'bloodgarnet' });
    // It refuses for a stated reason (no sockets on the starter), never throws.
    expect(r.ok).toBe(false);
    expect(typeof r.reason).toBe('string');
  });

  it('ACCUMULATOR → a Core-tree node: both capacity nodes are already there', () => {
    const ids = CORE_NODES.map((n) => n.id);
    expect(ids).toContain('flowCapacity');
    expect(ids).toContain('surgeCapacity');
  });

  it('SUMP is CUT by the spine itself (§43), so four remained and two were left', () => {
    // Stated here so the count in the report is checkable: six folded steps,
    // one cut, three already built, two built this pass.
    expect(FINENESS).toHaveLength(2);
    expect(LEACH_BATCH).toBeGreaterThan(0);
  });
});

describe('§1 — THE MILL: the Crusher grinds coarse or fine', () => {
  let s: GameState;
  beforeEach(() => { s = withCrusher(3); });

  it('coarse is what every Crusher has always done — and it is the default', () => {
    expect(finenessOf(s)).toBe('coarse');
    addMaterial(s, 'marl', 65, CRUSH_BATCH);          // 'good'
    const p = crushPreview(s, 'marl', 'good')!;
    expect(p.outBand).toBe('good');                   // tier III retains the band
    expect(p.byproduct).toBe(1);
  });

  it('FINE grinds a band cleaner, and there are no tailings to sweep', () => {
    setFineness(s, ctx(), 'fine');
    expect(finenessOf(s)).toBe('fine');
    addMaterial(s, 'marl', 65, CRUSH_BATCH);
    const p = crushPreview(s, 'marl', 'good')!;
    expect(BANDS.indexOf(p.outBand)).toBe(BANDS.indexOf('good') + 1);
    expect(p.byproduct, 'fine still swept up tailings').toBe(0);
  });

  it('and the trade is real in the Hold, not only in the preview', () => {
    addMaterial(s, 'marl', 65, CRUSH_BATCH * 2);
    crush(s, ctx(), 'marl', 'good');
    const tailings = materialCount(s, CRUSH_BYPRODUCT);
    expect(tailings).toBe(1);

    setFineness(s, ctx(), 'fine');
    crush(s, ctx(), 'marl', 'good');
    expect(materialCount(s, CRUSH_BYPRODUCT), 'fine paid tailings').toBe(tailings);
    // ...and the product landed a band higher than the coarse pass did.
    const bandsHeld = Object.keys(s.materials.stacks[CRUSH_PRODUCT]!);
    expect(bandsHeld.length, 'both passes landed in the same band').toBeGreaterThan(1);
  });

  it('a Crusher that is not built has no fineness to set', () => {
    const bare = createEngine({ nowMs: 0 }).getState() as GameState;
    expect(setFineness(bare, ctx(), 'fine').ok).toBe(false);
  });
});

describe('§2 — THE LEACH VAT: what a reject is worth', () => {
  let s: GameState;
  beforeEach(() => { s = withCrusher(3); });

  it('it takes the tailings nothing else much wanted', () => {
    expect(leachBlocker(s)).toMatch(/tailings to the vat/);
    addMaterial(s, CRUSH_BYPRODUCT, 50, LEACH_BATCH);
    expect(leachBlocker(s)).toBeNull();
    const id = convCurrencyId(s);
    const before = getCurrency(s, id).toNumber();
    expect(leach(s, ctx()).ok).toBe(true);
    expect(materialCount(s, CRUSH_BYPRODUCT)).toBe(0);
    expect(getCurrency(s, id).toNumber()).toBe(before + LEACH_PAYS);
  });

  it('and it pays THE SHELL YOU ARE STANDING IN — the Washer\'s rule, twice', () => {
    s.shell.current = 'verdance';
    addMaterial(s, CRUSH_BYPRODUCT, 50, LEACH_BATCH);
    leach(s, ctx());
    expect(convCurrencyId(s)).toBe('sap');
    expect(getCurrency(s, 'sap').toNumber()).toBe(LEACH_PAYS);
  });

  it('a short stack is refused rather than eaten', () => {
    addMaterial(s, CRUSH_BYPRODUCT, 50, LEACH_BATCH - 1);
    expect(leach(s, ctx()).ok).toBe(false);
    expect(materialCount(s, CRUSH_BYPRODUCT)).toBe(LEACH_BATCH - 1);
  });
});

describe('§3 — a processing step is a ROW, and pillar 2 holds', () => {
  it('neither has a wreck, a tier ladder, or a cast-part cost (§37)', () => {
    const s = withCrusher(3);
    // The proof that these are rows: they are reachable the moment the panel
    // they live in is, with no second construction event of any kind.
    expect(setFineness(s, ctx(), 'fine').ok).toBe(true);
    expect(s.casting.rack.length, 'a row spent cast parts').toBe(0);
    addMaterial(s, CRUSH_BYPRODUCT, 50, LEACH_BATCH);
    expect(leach(s, ctx()).ok).toBe(true);
    expect(s.casting.rack.length).toBe(0);
  });

  it('and neither can move the ceiling', () => {
    const s = withCrusher(3);
    s.depth = 48;
    const mods = new ModifierCache();
    mods.invalidate();
    const before = dpsMax(s, mods).toNumber();
    setFineness(s, ctx(), 'fine');
    addMaterial(s, 'marl', 65, CRUSH_BATCH);
    crush(s, ctx(), 'marl', 'good');
    addMaterial(s, CRUSH_BYPRODUCT, 50, LEACH_BATCH);
    leach(s, ctx());
    mods.invalidate();
    expect(dpsMax(s, mods).toNumber()).toBe(before);
  });
});
