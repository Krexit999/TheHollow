/**
 * THE WASHER — a PROCESSING STEP (§13, §19), A.93.
 *
 *   0  ITEM 11, measured: are the Reaction Bench's solvents where this lands?
 *   1  it is a ROW, not a construction event — no wreck, built at the Crusher
 *   2  END TO END: grit + solvent → concentrate + silt, and the Refinery eats it
 *   3  §19's Verdance difference falls out rather than being authored
 *   4  PILLAR 2
 */
import { describe, expect, it } from 'vitest';
import { raiseWreck } from './wrecks';
import { createEngine } from '../index';
import { D } from '../decimal';
import { ModifierCache } from '../modifiers';
import { ensureContentLoaded } from '../content';
import { dpsMax } from '../systems/face';
import { BANDS, MATERIALS, materialDef } from '../materials';
import { addCurrency, getCurrency } from '../resources';
import { allShells, convCurrencyId } from '../shells';
import { addMaterial, materialCount } from '../systems/forge';
import { MAX_MACHINE_TIER, tierOf } from '../systems/plant';
import { ensureCondition } from '../systems/condition';
import { CRUSH_BYPRODUCT, CRUSH_PRODUCT } from '../systems/crusher';
import { refine } from '../systems/refinery';
import { allAuthoredStations } from '../content/rolls';
import {
  CONCENTRATE, SILT, SILT_PER_WASH, SOLVENT_COST, TIER_CAPABILITY_WASHER, WASH_BATCH,
  anySolvent, bandAbove, buildWasher, ensureWashProducts, solventOf, takesByproduct, wash,
  washBlocker, washRows, washable, washerBuilt,
} from '../systems/washer';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx: EngineCtx = { emit() {}, dirty() {} } as unknown as EngineCtx;

function racked(st: GameState, n: number): GameState {
  st.casting.rack = Array.from({ length: n }, (_, i) =>
    ({ id: 2200 + i, materialId: 'marl', type: 'head', purity: 50 } as never));
  st.casting.nextId = 2200 + n;
  return st;
}

/** A player with a Crusher — which is the only thing the Washer hangs off. */
function withCrusher(): GameState {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  st.plant!.tiers['crusher'] = 1;
  return racked(st, 24);
}

function withWasher(tier = 1): GameState {
  const st = withCrusher();
  for (let i = 0; i < tier; i++) buildWasher(st, ctx);
  addCurrency(st, convCurrencyId(st), D(999));
  return st;
}

// ---------------------------------------------------------------------------
// 0 — ITEM 11
// ---------------------------------------------------------------------------

/**
 * "The Reaction Bench's solvents were named at A.84 and never built — check
 * whether this is where they land."
 *
 * CHECKED, AND THEY DO NOT, because neither the bench nor the solvents exist.
 * The finding is pinned here so it cannot quietly stop being true.
 */
describe('0 — item 11: the Reaction Bench\'s solvents, measured', () => {
  it('there is NO solvent material in the registry — not Frit, not any', () => {
    // §15.1 names Frit "the Glassmere solvent"; §19 names Sap as Verdance's.
    expect(MATERIALS.find((m) => m.id === 'frit'), 'frit exists now').toBeUndefined();
    expect(MATERIALS.some((m) => /solvent/i.test(m.name)), 'a solvent material exists').toBe(false);
  });

  it('...and `sap` is a CURRENCY, not a stone — which is what the design uses', () => {
    expect(MATERIALS.find((m) => m.id === 'sap'), 'sap is a material now').toBeUndefined();
    const verdance = allShells().find((s) => s.id === 'verdance')!;
    expect(verdance.convCurrencyId).toBe('sap');
  });

  it('so the solvent is the SHELL\'S OWN converted currency, one rule for seven', () => {
    for (const s of allShells()) {
      const st = withWasher(1);
      st.shell.current = s.id;
      expect(solventOf(st).id, `${s.id} has no solvent`).toBe(s.convCurrencyId);
    }
  });
});

// ---------------------------------------------------------------------------
// 1 — A ROW, NOT A MACHINE
// ---------------------------------------------------------------------------

describe('1 — it is a processing step (§13, §37)', () => {
  it('IT HAS NO WRECK, and that is the point — §13 marks it *processing*', () => {
    const wrecks = allAuthoredStations().map((s) => s.def.wreck).filter(Boolean);
    expect(wrecks).not.toContain('THE WASHER');
  });

  it('it is built at the CRUSHER, and refuses without one', () => {
    const bare = racked(createEngine({ nowMs: 0 }).getState() as GameState, 24);
    expect(buildWasher(bare, ctx).reason).toContain('no Crusher');
    const st = withCrusher();
    expect(washerBuilt(st)).toBe(false);
    expect(buildWasher(st, ctx).ok).toBe(true);
    expect(st.plant!.builtOf!['washer']).toContain('marl');
  });

  it('the tiers are three different sentences, not three sizes', () => {
    expect(new Set(TIER_CAPABILITY_WASHER).size).toBe(TIER_CAPABILITY_WASHER.length);
    expect(washable(withWasher(1))).toEqual([CRUSH_PRODUCT]);
    expect(takesByproduct(withWasher(2))).toBe(true);
    expect(washable(withWasher(2))).toEqual([CRUSH_PRODUCT, CRUSH_BYPRODUCT]);
    expect(anySolvent(withWasher(2))).toBe(false);
    const three = withWasher(3);
    expect(anySolvent(three)).toBe(true);
    expect(tierOf(three, 'washer')).toBe(MAX_MACHINE_TIER);
  });

  it('a tier-I drum refuses the byproduct BY NAME', () => {
    const st = withWasher(1);
    addMaterial(st, CRUSH_BYPRODUCT, 50, 8);
    expect(washBlocker(st, CRUSH_BYPRODUCT, 'fair')).toContain('too fine');
  });

  it('a cracked drum will not run — E2 reaches it like every machine', () => {
    const st = withWasher(1);
    addMaterial(st, CRUSH_PRODUCT, 50, 8);
    expect(washBlocker(st, CRUSH_PRODUCT, 'fair')).toBeNull();
    ensureCondition(st)['washer'] = { id: 'baked', level: 1, seized: true };
    expect(washBlocker(st, CRUSH_PRODUCT, 'fair')).toContain('cracked');
  });
});

// ---------------------------------------------------------------------------
// 2 — END TO END
// ---------------------------------------------------------------------------

describe('2 — grit + solvent → concentrate + silt', () => {
  it('four grit and a measure of solvent, for one concentrate a band up', () => {
    const st = withWasher(1);
    addMaterial(st, CRUSH_PRODUCT, 50, 8);          // fair
    const solBefore = getCurrency(st, convCurrencyId(st)).toNumber();
    const r = wash(st, ctx, CRUSH_PRODUCT, 'fair');
    expect(r.ok, r.reason).toBe(true);
    expect(materialCount(st, CRUSH_PRODUCT)).toBe(8 - WASH_BATCH);
    expect(materialCount(st, CONCENTRATE)).toBe(1);
    expect(Object.keys(st.materials.stacks[CONCENTRATE]!)).toEqual(['good']);   // fair -> good
    expect(materialCount(st, SILT)).toBe(SILT_PER_WASH);
    expect(solBefore - getCurrency(st, convCurrencyId(st)).toNumber()).toBe(SOLVENT_COST);
  });

  it('the band rise never skips a rung and never passes the top', () => {
    for (let i = 0; i < BANDS.length; i++) {
      const b = BANDS[i]!;
      const up = bandAbove(b);
      expect(BANDS.indexOf(up)).toBe(Math.min(BANDS.length - 1, i + 1));
    }
    expect(bandAbove('pristine')).toBe('pristine');
  });

  it('no solvent, no wash, and the refusal counts it', () => {
    const st = withWasher(1);
    addMaterial(st, CRUSH_PRODUCT, 50, 8);
    st.currencies[convCurrencyId(st)] = D(1);
    const r = washBlocker(st, CRUSH_PRODUCT, 'fair');
    expect(r).toContain(String(SOLVENT_COST));
    expect(r).toContain('there is 1');
  });

  it('AND THE REFINERY EATS IT — §13\'s "everything the Refinery eats"', () => {
    // A.106: the bench opens at Sinter Row, Loam 60 — not at Ferrite mastery.
    const st = withWasher(1);
    addMaterial(st, CRUSH_PRODUCT, 50, 16);
    for (let i = 0; i < 4; i++) wash(st, ctx, CRUSH_PRODUCT, 'fair');
    expect(materialCount(st, CONCENTRATE)).toBe(4);
    raiseWreck(st, 'REFINERY');                       // Sinter Row, Loam 60 (A.106)
    const r = refine(st, ctx, CONCENTRATE, 'good');
    expect(r.ok, r.reason).toBe(true);
    expect(Object.keys(st.materials.stacks[CONCENTRATE] ?? {})).toContain('fine');
  });

  it('both products are worked, so neither joins the clone population', () => {
    ensureWashProducts();
    expect(materialDef(CONCENTRATE).worked).toBe(true);
    expect(materialDef(SILT).worked).toBe(true);
    expect(materialDef(CONCENTRATE).source).toBeUndefined();
  });

  it('and the rows list what you HOLD in fours, never a catalogue', () => {
    const st = withWasher(2);
    expect(washRows(st)).toEqual([]);
    addMaterial(st, CRUSH_PRODUCT, 50, 8);
    addMaterial(st, CRUSH_BYPRODUCT, 50, 2);          // not enough
    expect(washRows(st).map((r) => r.materialId)).toEqual([CRUSH_PRODUCT]);
    expect(washRows(st)[0]!.into).toBe('good');
  });
});

// ---------------------------------------------------------------------------
// 3 — §19's VERDANCE DIFFERENCE
// ---------------------------------------------------------------------------

/**
 * §19: "Verdance — the Washer's solvent must be GROWN, not made — the plant
 * runs on your gardening." Nothing was authored to make that true: the solvent
 * is the shell's converted currency, and Verdance's converted currency is Sap.
 */
describe('3 — §19\'s one authored Verdance difference, for free', () => {
  it('in Verdance the Washer spends SAP, which is the grown currency', () => {
    const st = withWasher(1);
    st.shell.current = 'verdance';
    expect(solventOf(st).id).toBe('sap');
    addMaterial(st, CRUSH_PRODUCT, 50, 8);
    addCurrency(st, 'sap', D(999));
    expect(washBlocker(st, CRUSH_PRODUCT, 'fair')).toBeNull();
    const before = getCurrency(st, 'sap').toNumber();
    expect(wash(st, ctx, CRUSH_PRODUCT, 'fair').ok).toBe(true);
    expect(before - getCurrency(st, 'sap').toNumber()).toBe(SOLVENT_COST);
  });

  it('a tier-III drum reaches a shell you have LEFT', () => {
    const st = withWasher(3);
    st.shell.current = 'verdance';
    st.currencies['sap'] = D(0);
    addCurrency(st, 'brick', D(500));               // Loam's, banked and left behind
    expect(solventOf(st).id).toBe('brick');
    addMaterial(st, CRUSH_PRODUCT, 50, 8);
    expect(washBlocker(st, CRUSH_PRODUCT, 'fair')).toBeNull();
    const before = getCurrency(st, 'brick').toNumber();
    expect(wash(st, ctx, CRUSH_PRODUCT, 'fair').ok).toBe(true);
    expect(before - getCurrency(st, 'brick').toNumber()).toBe(SOLVENT_COST);
  });

  it('...and a tier-II one does not — it spends where it stands', () => {
    const st = withWasher(2);
    st.shell.current = 'verdance';
    st.currencies['sap'] = D(0);
    addCurrency(st, 'brick', D(500));
    expect(solventOf(st).id).toBe('sap');
    addMaterial(st, CRUSH_PRODUCT, 50, 8);
    expect(washBlocker(st, CRUSH_PRODUCT, 'fair')).toContain('solvent');
  });
});

// ---------------------------------------------------------------------------
// 4 — PILLAR 2
// ---------------------------------------------------------------------------

describe('4 — PILLAR 2: it concentrates and makes nothing', () => {
  it('four units in, three out — strictly lossy, and not a find', () => {
    const st = withWasher(1);
    addMaterial(st, CRUSH_PRODUCT, 50, 8);
    const drops = st.materials.totalDrops;
    const before = Object.values(st.materials.stacks)
      .reduce((n, per) => n + Object.values(per).reduce((a, s) => a + (s?.count ?? 0), 0), 0);
    wash(st, ctx, CRUSH_PRODUCT, 'fair');
    const after = Object.values(st.materials.stacks)
      .reduce((n, per) => n + Object.values(per).reduce((a, s) => a + (s?.count ?? 0), 0), 0);
    expect(after).toBe(before - WASH_BATCH + 1 + SILT_PER_WASH);
    expect(after).toBeLessThan(before);
    expect(st.materials.totalDrops, 'a wash counted as a find').toBe(drops);
  });

  it('the only currency that moves is the solvent, and it only ever goes DOWN', () => {
    const st = withWasher(1);
    addMaterial(st, CRUSH_PRODUCT, 50, 8);
    const id = convCurrencyId(st);
    const before = { ...st.currencies };
    wash(st, ctx, CRUSH_PRODUCT, 'fair');
    for (const [k, v] of Object.entries(st.currencies)) {
      const was = before[k];
      if (k === id) {
        expect(v.toNumber()).toBeLessThan(was!.toNumber());
      } else {
        expect(v.toNumber(), `${k} moved`).toBe(was?.toNumber() ?? 0);
      }
    }
  });

  it('dpsMax at the SAME depth is identical before and after', () => {
    const read = (run: boolean): number => {
      const st = withWasher(3);
      st.depth = 62; // THE SAME DEPTH IN BOTH ARMS
      addMaterial(st, CRUSH_PRODUCT, 50, 8);
      if (run) wash(st, ctx, CRUSH_PRODUCT, 'fair');
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    expect(read(true)).toBe(read(false));
  });
});
