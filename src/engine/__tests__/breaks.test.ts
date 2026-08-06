/**
 * §55 — THE NAMED FAILURES (A.107).
 *
 * The bar was set before either of them was built: a cascade that cannot be
 * traced back to its first failure is a random debuff. So every row below is
 * driven through the ENGINE — never by writing `plant.broken` — and then asked
 * three things: did it break, does the chain name what broke it, and does
 * fixing that one machine give the plant back.
 *
 * ROWS 2, 3 AND 4 ARE NOT HERE. §3 drives the reason row 4 was pulled back out
 * after the scoping pass had passed it; §6 pins the other two, so a later phase
 * re-opening any of them has to do it on purpose.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { ModifierCache } from '../modifiers';
import type { EngineCtx, GameState } from '../types';
import {
  BLOWOUT_HEAT, BREAKS, RIPE_SEC, breakFor, brokenAs, ensureBroken, harvestMachine,
  isBroken, recipeHidden, ripeLine, ripeness, stopped, witnessMachine,
} from '../systems/breaks';
import { ensureCultivar } from '../systems/cultivar';
import { STRAINS } from '../content/strains';
import {
  CASCADE_SEC, CONDITION_FULL_SEC, bandOfMachine, cascadeChain, cascadedFrom, conditionOf, conditionedMachines, ensureCondition,
  ensureDrags, machineSpeed, recastMachine, ruleFor, setMachineBand,
} from '../systems/condition';
import { ensurePlant, flowSatisfaction } from '../systems/plant';
import { ensureWitness } from '../systems/witness';
import { dpsMax } from '../systems/face';
import { getCurrency } from '../resources';
import { chipCurrencyId } from '../shells';

const ctx: EngineCtx = { emit: () => {}, dirty: () => {} };

type Rig = { engine: ReturnType<typeof createEngine>; s: GameState };

/** A built plant in one shell, banded so a drag has somewhere to go. */
function plantIn(shellId: string): Rig {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  s.shell.current = shellId;
  s.depthRecords[shellId] = 400;
  s.depth = 100;
  s.kiln.built = true;
  const p = ensurePlant(s);
  conditionedMachines().forEach((id, i) => {
    p.tiers[id] = 1;
    setMachineBand(s, id, i % 4);
  });
  p.condition = {};
  p.dragged = {};
  p.broken = {};
  p.ripe = {};
  return { engine, s };
}

/**
 * Run the real engine. `hold` runs before each tick and is how the PLAYER's
 * hand is modelled — a shaft stays at 100° because somebody is choosing to keep
 * it there, which is the bet §55.1 is the other end of. Nothing in `hold`
 * touches a break, a condition or a drag.
 */
function run(r: Rig, sec: number, hold?: () => void): void {
  for (let i = 0; i < sec; i++) { hold?.(); r.engine.tick(1); }
}

/**
 * Long enough for the world to write a condition in full, plus the ripening,
 * and NOT long enough for the generic cascade underneath to start dragging on
 * its own (`CONDITION_FULL_SEC` 240 + `CASCADE_SEC` 120 = 360). Measured, not
 * chosen: the first break lands at t=329 and the second at t=420.
 */
const TO_BREAK = 340;

// ---------------------------------------------------------------------------

describe('§1 the registry, and what it refuses to hold', () => {
  it('three rows, one per shell, each with a recovery that is not waiting', () => {
    expect(BREAKS).toHaveLength(3);
    const shells = BREAKS.map((b) => b.shellId);
    expect(new Set(shells).size, 'two breaks in one shell').toBe(shells.length);
    for (const b of BREAKS) {
      expect(b.name.length, `${b.id} has no Codex line`).toBeGreaterThan(4);
      expect(b.recovery.length, `${b.id} has no recovery`).toBeGreaterThan(10);
      expect(b.recovery.toLowerCase(), `${b.id}'s recovery is waiting`).not.toMatch(/^wait\b/);
      expect(b.sec, `${b.id} goes with no warning`).toBeGreaterThan(0);
    }
  });

  it('and every candidate list is PROBED off the plant, not written down', () => {
    const { s } = plantIn('cinder');
    ensurePlant(s).tiers = {};
    s.kiln.built = false;
    for (const b of BREAKS) {
      expect(b.candidates(s), `${b.id} names a machine on an empty plant`).toEqual([]);
    }
  });
});

describe('§2 THE BOILER LET GO (§55.1)', () => {
  const hot = (s: GameState) => () => { s.pressure.heat = 100; };

  it('it does not go without warning, and the warning says how close', () => {
    const r = plantIn('cinder');
    run(r, 10, hot(r.s));
    expect(isBroken(r.s, 'boiler'), 'it blew with no warning at all').toBe(false);
    const at = ripeness(r.s, 'boiler');
    expect(at, 'nothing is counting').toBeGreaterThan(0);
    expect(at, 'ten seconds took it to the edge').toBeLessThan(0.5);
    expect(ripeLine(r.s, 'boiler')).toContain('%');
  });

  it('...and then it goes, and the vents fire themselves', () => {
    const r = plantIn('cinder');
    const chipId = chipCurrencyId(r.s);
    r.s.currencies[chipId] = getCurrency(r.s, chipId).add(1_000_000);
    const held = getCurrency(r.s, chipId).toNumber();

    run(r, RIPE_SEC + 10, hot(r.s));
    expect(isBroken(r.s, 'boiler'), 'it never blew').toBe(true);
    expect(brokenAs(r.s, 'boiler')).toBe('blowout');
    expect(getCurrency(r.s, chipId).toNumber(), 'the bank was never charged')
      .toBeLessThan(held);
  });

  it('the machine STOPS, and it takes ONE neighbour down with it', () => {
    const r = plantIn('cinder');
    run(r, RIPE_SEC + 10, hot(r.s));
    expect(stopped(r.s, 'boiler')).toBe(true);
    expect(machineSpeed(r.s, 'boiler'), 'a blown Boiler still runs').toBe(0);
    const dragged = Object.keys(ensureDrags(r.s));
    // ONE, not every machine within a band. A failure that arrives all at once
    // is an event; A.106 rejected the clique by name and this is the same call.
    expect(dragged.length, 'the blowout handed the plant to the drag in one tick').toBe(1);
    expect(machineSpeed(r.s, dragged[0]!), 'the dragged machine is not slowed').toBeLessThan(1);
    // ...and ONE BAND ALONG, which counting the links cannot tell you: the
    // same-band neighbourhood is a clique, and `nextAlong` returns exactly one
    // machine either way. Only the geometry says which rule is in force.
    expect(Math.abs(bandOfMachine(r.s, dragged[0]!) - bandOfMachine(r.s, 'boiler')),
      'the drag went sideways within the band — that is the clique A.106 cut').toBe(1);
  });

  it('...and it will NOT go sideways — the same band is a clique, not a chain', () => {
    /**
     * The decisive layout, and the reason it has to be built by hand: with the
     * default banding both rules happen to pick a machine one band along, so
     * loosening `=== 1` to `<= 1` changes nothing observable and a test that
     * counts links reads green either way.
     *
     * Here the Boiler has a same-band neighbour and NOTHING one band along. The
     * clique rule takes the neighbour; the chain rule takes nobody. A failure
     * that spreads sideways within its own band reaches every member of the band
     * directly, which is the STAR A.106 cut by name.
     */
    const r = plantIn('cinder');
    for (const id of conditionedMachines()) setMachineBand(r.s, id, 5);
    setMachineBand(r.s, 'boiler', 2);
    setMachineBand(r.s, 'crusher', 2);
    run(r, RIPE_SEC + 10, hot(r.s));

    expect(isBroken(r.s, 'boiler'), 'it never blew, so nothing is proven').toBe(true);
    expect(ensureDrags(r.s)['crusher'], 'the failure went sideways within the band').toBeUndefined();
    expect(Object.keys(ensureDrags(r.s)),
      'something was dragged with no machine one band along to drag').toEqual([]);
  });

  it('...and it TRAVELS — a link at a time, on the plant clock', () => {
    const r = plantIn('cinder');
    run(r, RIPE_SEC + 10, hot(r.s));
    const first = Object.keys(ensureDrags(r.s));
    expect(first.length).toBe(1);

    run(r, CASCADE_SEC + 5, hot(r.s));
    const second = Object.keys(ensureDrags(r.s));
    expect(second.length, 'the chain never grew').toBeGreaterThan(first.length);

    // ...and it is a CHAIN, not a star: something is dragged by a machine that
    // is not the Boiler, and every chain still starts at the Boiler.
    const parents = new Set(second.map((id) => cascadedFrom(r.s, id)));
    expect(parents.size, 'every link hangs straight off the Boiler — that is a star').toBeGreaterThan(1);
    for (const id of second) {
      expect(cascadeChain(r.s, id)[0], `${id} does not trace back to the Boiler`).toBe('boiler');
    }
    expect(Math.max(...second.map((id) => cascadeChain(r.s, id).length)),
      'no chain is longer than one hop').toBeGreaterThan(2);
  });

  it('TRACEABLE — every dragged machine names the Boiler as the head', () => {
    const r = plantIn('cinder');
    run(r, RIPE_SEC + 10, hot(r.s));
    const dragged = Object.keys(ensureDrags(r.s));
    expect(dragged.length).toBeGreaterThan(0);
    for (const id of dragged) {
      expect(cascadeChain(r.s, id)[0], `${id} does not trace back to the Boiler`).toBe('boiler');
      expect(cascadedFrom(r.s, id)).toBe('boiler');
    }
    expect(cascadedFrom(r.s, 'boiler'), 'the first failure claims a parent').toBeNull();
  });

  it('...and re-casting the valve gives the whole chain back', () => {
    const r = plantIn('cinder');
    run(r, RIPE_SEC + 10, hot(r.s));
    expect(Object.keys(ensureDrags(r.s)).length).toBeGreaterThan(0);

    r.s.casting.rack = [
      { id: 1, materialId: 'marl' }, { id: 2, materialId: 'marl' },
    ] as typeof r.s.casting.rack;
    const out = recastMachine(r.s, ctx, 'boiler');
    expect(out.ok, `the re-cast was refused: ${out.reason}`).toBe(true);
    expect(isBroken(r.s, 'boiler'), 'it reads fine and is still down').toBe(false);
    expect(machineSpeed(r.s, 'boiler'), 'a re-cast Boiler still will not run').toBeGreaterThan(0);

    run(r, 10);
    expect(Object.keys(ensureDrags(r.s)), 'the chain never let go').toEqual([]);
  });
});

describe('§3 WHAT GREW IN THE WASHER — the rule fires now', () => {
  /**
   * THE TRIPWIRE WENT OFF (A.108). A.107 sized §55.4 buildable, found the rule
   * underneath it could not fire, cut the break and left this describe block
   * behind — "kept as a test rather than as a paragraph so that the day somebody
   * makes Verdance's condition reachable, this goes red and says so."
   *
   * It went red. `overgrown` no longer asks whether `served` fell to zero — a
   * supply RATIO with a floor of 2.4 that no plant can drive to nothing — but
   * whether the Bloom covers what is built. A bare tier-I Refinery draws 4.0
   * against a bare Bloom's 2.4, so contention is the DEFAULT for anyone actually
   * clearing the face, and an idle player heals out of it in ~40s as untouched
   * cells vine over and lift the cap. Driven below, not written.
   */
  it("VERDANCE'S OVERGROWN CONDITION WRITES — the Bloom cannot cover what is built", () => {
    expect(ruleFor('verdance')?.id, 'the rule was renamed under us').toBe('overgrown');
    const r = plantIn('verdance');
    run(r, TO_BREAK * 2);

    const wrote = conditionedMachines().filter((id) => conditionOf(r.s, id) !== null);
    expect(wrote.length, 'the green got into nothing — §55.4 is unfoundable again')
      .toBeGreaterThan(0);
    for (const id of wrote) expect(conditionOf(r.s, id)?.id).toBe('overgrown');

    // ...and the reason, read off the same state rather than asserted about it:
    // the drawers are short, and §3 shares the shortfall proportionally.
    const short = conditionedMachines().filter((id) => flowSatisfaction(r.s, id) < 1);
    expect(short.length, 'nothing was short and yet something went overgrown')
      .toBeGreaterThan(0);
  });
});

describe('§3b WHAT GREW IN THE WASHER (§55.4)', () => {
  /**
   * NOTHING IS HELD HERE. §55.1 needs a hand on the shaft and §55.5 needs a
   * silence held up, but a starved Bloom is the DEFAULT state of a Verdance
   * plant with machines standing on it — a bare tier-I Refinery draws 4.0
   * against a floor of 2.4 — so the arrangement is the plant and the run.
   */
  it('it goes, it STOPS, and the machine it took is the one the Bloom failed', () => {
    const r = plantIn('verdance');
    run(r, TO_BREAK);
    const id = Object.keys(ensureBroken(r.s))[0]!;
    expect(id, 'nothing broke in a plant the Bloom cannot cover').toBeTruthy();
    expect(brokenAs(r.s, id)).toBe('overgrowth');
    // §55.4 says "it stops" — unlike the Silence, which costs information only.
    expect(stopped(r.s, id), 'the green took a machine and left it running').toBe(true);
    expect(machineSpeed(r.s, id), 'a seized machine still ran').toBe(0);
    expect(flowSatisfaction(r.s, id), 'it broke on a machine the plant was feeding')
      .toBeLessThan(1);
  });

  /**
   * THERE IS MORE THAN ONE HEAD HERE, and that is the rule's shape rather than a
   * fault in the cascade. §3 shares a shortfall PROPORTIONALLY, so a Bloom that
   * cannot cover the plant starves every drawer in the same second and each one
   * is a first failure on its own account — cinder-shaped, not chain-shaped.
   * (The one rule that singles a machine out is Glassmere's `unlit`, which reads
   * a band; `cascade.test.ts` uses it for exactly this reason.) So this asks what
   * is true of every drag: it came from the machine beside it, and walking back
   * far enough reaches a machine the WORLD broke and nobody handed to.
   */
  it('the vines spread ONE BAND ALONG, and every drag walks back to a first failure', () => {
    const r = plantIn('verdance');
    run(r, TO_BREAK + CASCADE_SEC + 10);
    const dragged = Object.keys(ensureDrags(r.s));
    expect(dragged.length, 'the green took a machine and spread to nothing').toBeGreaterThan(0);
    for (const d of dragged) {
      expect(Math.abs(bandOfMachine(r.s, d) - bandOfMachine(r.s, cascadedFrom(r.s, d)!)),
        `${d} was dragged from something that is not beside it`).toBe(1);
      const chain = cascadeChain(r.s, d);
      expect(chain[chain.length - 1]).toBe(d);
      expect(cascadedFrom(r.s, chain[0]!), `${d}'s chain has a parent above its head`).toBeNull();
      expect(conditionOf(r.s, chain[0]!), `${d} traces back to a machine nothing broke`).not.toBeNull();
      expect(new Set(chain).size, 'the chain repeats a machine').toBe(chain.length);
    }
  });

  it('HARVEST is the recovery, and the strain it leaves is the reward', () => {
    const r = plantIn('verdance');
    run(r, TO_BREAK);
    const id = Object.keys(ensureBroken(r.s))[0]!;
    const before = [...ensureCultivar(r.s).cropped];

    const out = harvestMachine(r.s, ctx, id);
    expect(out.ok, `the harvest was refused: ${out.reason}`).toBe(true);
    expect(isBroken(r.s, id), 'a harvested machine is still overgrown').toBe(false);
    expect(machineSpeed(r.s, id), 'a harvested machine still will not run').toBeGreaterThan(0);

    // THE FIX IS THE REWARD — one strain, into the same Codex `cropBed` writes.
    const after = ensureCultivar(r.s).cropped;
    expect(after.length, 'the harvest paid nothing').toBe(before.length + 1);
    expect(out.data?.strainId, 'it did not say what grew there').toBeTruthy();
  });

  it('...and it cannot be farmed — a save that knows every strain still recovers', () => {
    const r = plantIn('verdance');
    ensureCultivar(r.s).cropped = STRAINS.map((st) => st.id);
    run(r, TO_BREAK);
    const id = Object.keys(ensureBroken(r.s))[0]!;

    const out = harvestMachine(r.s, ctx, id);
    expect(out.ok, 'a save that knows every strain could not fix its own machine').toBe(true);
    expect(out.data?.strainId, 'it minted a strain that does not exist').toBeNull();
    expect(ensureCultivar(r.s).cropped.length, 'the Codex grew past its registry')
      .toBe(STRAINS.length);
    expect(isBroken(r.s, id), 'the machine stayed broken').toBe(false);
  });

  /**
   * ALL THREE OF THESE WERE FOUND BY LOOKING AT A SCREENSHOT of the plant panel
   * (A.108), not by a check — every automated check in this file was green over
   * them. They are checks now.
   */
  it('a re-cast is REFUSED on it — one break, one recovery, and no half-fixed state', () => {
    const r = plantIn('verdance');
    run(r, TO_BREAK);
    const id = Object.keys(ensureBroken(r.s))[0]!;
    r.s.casting.rack = [
      { id: 1, materialId: 'marl' }, { id: 2, materialId: 'marl' },
    ] as typeof r.s.casting.rack;

    const out = recastMachine(r.s, ctx, id);
    expect(out.ok, 'a new frame pulled the vines off').toBe(false);
    expect(out.reason, 'it refused without saying why').toMatch(/[Hh]arvest/);
    // THE SHAPE OF THE BUG IT PREVENTS: before this, the re-cast cleared the
    // CONDITION and not the BREAK, so the machine started running again while
    // the panel still read it stopped — and the parts were gone.
    expect(r.s.casting.rack.length, 'it charged for a fix it refused').toBe(2);
    expect(stopped(r.s, id), 'it reads stopped and the speed disagrees').toBe(true);
    expect(machineSpeed(r.s, id), 'a machine the panel calls stopped was running').toBe(0);
    // ...and the harvest still works, which is the point of refusing.
    expect(harvestMachine(r.s, ctx, id).ok).toBe(true);
  });

  it('...and the WARNING says what to do now, not what to do after it goes', () => {
    const r = plantIn('verdance');
    run(r, Math.round(CONDITION_FULL_SEC + RIPE_SEC * 0.2));
    const ripening = conditionedMachines().filter((id) => ripeness(r.s, id) > 0 && !isBroken(r.s, id));
    expect(ripening.length, 'nothing was ripening to read a warning off').toBeGreaterThan(0);
    const line = ripeLine(r.s, ripening[0]!)!;
    expect(line, 'a ripening machine says nothing').toBeTruthy();
    // The bug: the ripe line appended the RECOVERY, so a machine 15% of the way
    // to going was told to harvest something that is not there yet.
    expect(line, 'it offers a harvest on a machine with nothing in it')
      .not.toMatch(/[Hh]arvest it/);
    expect(line, 'the warning does not name what actually moves the Bloom')
      .toMatch(/Bloom|vine/);
  });

  it('and it refuses a machine nothing grew in', () => {
    const r = plantIn('verdance');
    const out = harvestMachine(r.s, ctx, 'refinery');
    expect(out.ok).toBe(false);
    expect(out.reason).toBeTruthy();
  });
});

describe('§4 WHAT THE PLANT FORGOT (§55.5)', () => {
  const quiet = (s: GameState) => () => { s.hollow.silence = 100; };

  it('the machine stops SAYING what it draws, and keeps drawing it', () => {
    const r = plantIn('hollow');
    run(r, TO_BREAK, quiet(r.s));
    const id = Object.keys(ensureBroken(r.s))[0]!;
    expect(brokenAs(r.s, id)).toBe('silence');
    expect(recipeHidden(r.s, id), 'the panel would still print its draw').toBe(true);
    // IT IS NOT A STOP. It costs information and nothing else.
    expect(stopped(r.s, id), 'the Silence stopped a machine').toBe(false);
    expect(machineSpeed(r.s, id), 'a forgotten machine stopped running').toBeGreaterThan(0);
    // ...and only the one that went is quiet.
    const others = conditionedMachines().filter((m) => m !== id);
    expect(others.filter((m) => recipeHidden(r.s, m)), 'the quiet spread to the panel').toEqual([]);
  });

  it('a Witness settles it, at the price a maybe-stone costs', () => {
    const r = plantIn('hollow');
    run(r, TO_BREAK, quiet(r.s));
    const id = Object.keys(ensureBroken(r.s))[0]!;

    ensureWitness(r.s).hush = 0;
    const refused = witnessMachine(r.s, ctx, id);
    expect(refused.ok, 'it settled for free').toBe(false);
    expect(refused.reason).toContain('hush');

    ensureWitness(r.s).hush = 1e6;
    const out = witnessMachine(r.s, ctx, id);
    expect(out.ok, `refused: ${out.reason}`).toBe(true);
    expect(ensureWitness(r.s).hush, 'the Witness cost nothing').toBeLessThan(1e6);
    expect(recipeHidden(r.s, id)).toBe(false);
    run(r, 10, quiet(r.s));
    expect(Object.keys(ensureDrags(r.s)), 'the chain never let go').toEqual([]);
  });
});

describe('§5 PILLAR 2 — a break costs, and cannot pay', () => {
  it('dpsMax at ONE depth is bit-identical with every break fired', () => {
    const { s } = plantIn('cinder');
    const mods = new ModifierCache();
    s.depth = 40;
    mods.invalidate();
    const clean = String(dpsMax(s, mods));

    const ids = conditionedMachines();
    const broken = ensureBroken(s);
    BREAKS.forEach((b, i) => { broken[ids[i]!] = { id: b.id, atSec: 0 }; });
    const table = ensureCondition(s);
    for (const id of ids) table[id] = { id: 'baked', level: 1, seized: true, fullFor: 0 };
    const drags = ensureDrags(s);
    for (const id of ids.slice(BREAKS.length)) drags[id] = { from: ids[0]!, sec: 0 };

    s.depth = 40;
    mods.invalidate();
    expect(String(dpsMax(s, mods)), 'a break moved the face ceiling').toBe(clean);
  });

  it('...and the reading is live — widening the face moves it', () => {
    const { s } = plantIn('cinder');
    const mods = new ModifierCache();
    s.depth = 40;
    mods.invalidate();
    const a = String(dpsMax(s, mods));
    s.face.w += 1;
    mods.invalidate();
    expect(String(dpsMax(s, mods)), 'dpsMax is not reading the face').not.toBe(a);
  });

  it('a blowout leaves the shell POORER than the same run that never blew', () => {
    // Two arms, one hand apart: the gauge is held up, or it is not.
    const blew = plantIn('cinder');
    const held = plantIn('cinder');
    const chipId = chipCurrencyId(blew.s);
    for (const r of [blew, held]) r.s.currencies[chipId] = getCurrency(r.s, chipId).add(1_000_000);

    run(blew, RIPE_SEC + 10, () => { blew.s.pressure.heat = 100; });
    run(held, RIPE_SEC + 10, () => { held.s.pressure.heat = 40; });

    expect(isBroken(blew.s, 'boiler'), 'the hot arm never blew').toBe(true);
    expect(isBroken(held.s, 'boiler'), 'the cool arm blew anyway').toBe(false);
    expect(getCurrency(blew.s, chipId).toNumber(), 'the blowout was free')
      .toBeLessThan(getCurrency(held.s, chipId).toNumber());
  });
});

describe('§6 the two that were NOT built, pinned', () => {
  it('no break claims a machine priority order — plant.ts rejected one', () => {
    for (const b of BREAKS) {
      expect(b.id, 'BROWNOUT shipped without reversing plant.ts').not.toBe('brownout');
    }
    expect(breakFor('ferrite'), 'a Ferrite break arrived unannounced').toBeUndefined();
  });

  it('...and no break touches the face, because dpsMax counts cells', () => {
    const r = plantIn('cinder');
    const cells = r.s.face.cells.length;
    const [w, h] = [r.s.face.w, r.s.face.h];
    run(r, RIPE_SEC + 10, () => { r.s.pressure.heat = 100; });
    expect(isBroken(r.s, 'boiler'), 'nothing broke, so nothing is proven').toBe(true);
    expect(r.s.face.cells.length, 'a break took a cell off the face').toBe(cells);
    expect([r.s.face.w, r.s.face.h], 'a break resized the face').toEqual([w, h]);
  });

  it('the ripeness readout is a WARNING — §53 thresholds are the opposite call', () => {
    const { s } = plantIn('cinder');
    expect(ripeness(s, 'boiler'), 'a cold Boiler is already ripening').toBe(0);
    s.pressure.heat = 100;
    expect(BLOWOUT_HEAT).toBeGreaterThan(0);
    ensurePlant(s).ripe = { boiler: RIPE_SEC / 2 };
    expect(ripeness(s, 'boiler')).toBeCloseTo(0.5, 6);
  });
});
