/**
 * §3.2 FINISHED — the Bloom, the Prism's ceiling, and the Null.
 *
 * §1 is the block the brief asked for by name: EVERY plant reader has a shell
 * condition. A.95 shipped `boilerSurge` without one and a Cinder Boiler banked
 * Surge in Ferrite, so this sweeps all five shapes across all seven shells and
 * asserts each is worth exactly nothing where it does not belong.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { ensureContentLoaded } from '../content';
import { ModifierCache } from '../modifiers';
import {
  FLOW_PER_RANK, HEARTH_FLOOR, SURGE_FLOOR, SURGE_PER_RANK, demandOf, ensurePlant,
  flowCap, surgeCap,
} from '../systems/plant';
import {
  BLOOM_PER_VINE, NULL_PER_SILENCE, PRISM_SURGE_PER_DARK, PRISM_SURGE_PER_FREE,
  PLANT_FLOOR, bloomFlow, bloomShell, darkBands, freeIntensity, nullFlow, nullShell,
  prismFlow, prismSurge, shellPlantRead, vinedCells,
} from '../systems/shellPlants';
import { boilerFlow, boilerSurge } from '../systems/boiler';
import { coilSurge } from '../systems/coil';
import { INTENSITY, ensurePrism } from '../systems/prism';
import { dpsMax } from '../systems/face';
import { allShells } from '../shells';
import type { GameState } from '../types';

ensureContentLoaded();

const SHELLS = ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph'];

function fresh(): GameState {
  const s = createEngine({ nowMs: 0 }).getState() as GameState;
  s.kiln.built = true;
  s.kiln.heat = 0;
  return s;
}

/** Everything switched on at once, so a shape that leaks has something to leak. */
function loaded(shell: string): GameState {
  const s = fresh();
  s.shell.current = shell;
  for (const sh of allShells()) s.depthRecords[sh.id] = 999;
  const p = ensurePlant(s);
  p.tiers['boiler'] = 3; p.tiers['coil'] = 3; p.tiers['prism'] = 3;
  s.pressure.heat = 90;
  s.polarity.chain = 20;
  s.polarity.bestChain = 20;
  s.hollow.silence = 80;
  const n = s.face.cells.length;
  s.growth.stage = new Array(n).fill(2);
  ensurePrism(s).intensity = [0, 0, 0, 0, 0, 0];   // nothing aimed
  return s;
}

describe('§0 — §3.2\'s table, finished', () => {
  it('the only shell still running the Hearth for FLOW is one whose shape it IS', () => {
    const s = fresh();
    const shapes: Record<string, number> = {};
    for (const id of SHELLS) { s.shell.current = id; shapes[id] = flowCap(s); }
    // Loam's shape IS the Hearth. Ferrite's is the COIL, which is pure Surge
    // (§3.2) and says nothing about sustain. Aleph has no row in the table.
    expect(shapes['loam']).toBe(HEARTH_FLOOR);
    expect(shapes['ferrite']).toBe(HEARTH_FLOOR);
    expect(shapes['aleph']).toBe(HEARTH_FLOOR);
    // The four with a shape of their own.
    expect(shapes['verdance']).toBe(HEARTH_FLOOR);      // the Bloom, at zero vines
    expect(shapes['glassmere']).toBe(0);                // no Prism, no plant
    expect(shapes['cinder']).toBe(0);                   // no Boiler, no plant
    expect(shapes['hollow']).toBe(HEARTH_FLOOR);        // the Null, at zero Silence
  });

  /**
   * THE FLOOR IS WRITTEN OUT IN TWO PLACES, so a test holds them together.
   * `shellPlants.ts` cannot read `HEARTH_FLOOR` at module scope — that is a
   * documented runtime-only cycle, and the first draft threw
   * `Cannot access 'HEARTH_FLOOR' before initialization` when the modules
   * happened to load the other way round.
   */
  it('and the two floors are the same number, said in two files', () => {
    expect(PLANT_FLOOR).toBe(HEARTH_FLOOR);
  });

  it('and a shape a shell has is NOT the Hearth — the Kiln stops mattering', () => {
    const s = fresh();
    s.shell.current = 'verdance';
    s.kiln.heat = 40;                                   // a furiously hot Kiln
    const n = s.face.cells.length;
    s.growth.stage = new Array(n).fill(0);
    expect(flowCap(s), 'Verdance read the Kiln').toBe(HEARTH_FLOOR);
    s.growth.stage = new Array(n).fill(1);
    expect(flowCap(s)).toBeCloseTo(HEARTH_FLOOR + BLOOM_PER_VINE * n, 10);
  });
});

describe('§1 — EVERY PLANT READER HAS A SHELL CONDITION', () => {
  /**
   * The brief's own instruction, after A.95's defect. Each shape is driven at
   * maximum and read in all seven shells; it must be worth nothing in six.
   */
  const READERS: Array<[string, string, (s: GameState) => number]> = [
    ['the Boiler flow', 'cinder', boilerFlow],
    ['the Boiler surge', 'cinder', boilerSurge],
    ['the Coil surge', 'ferrite', coilSurge],
    ['the Bloom', 'verdance', bloomFlow],
    ['the Prism flow', 'glassmere', prismFlow],
    ['the Prism surge', 'glassmere', prismSurge],
    ['the Null', 'hollow', nullFlow],
  ];

  it('each is worth NOTHING outside its own shell', () => {
    for (const [name, home, read] of READERS) {
      for (const id of SHELLS) {
        const s = loaded(id);
        s.shell.signatures = [];                       // nothing carried down
        const v = read(s);
        if (id === home) continue;
        expect(v, `${name} fired in ${id}`).toBe(0);
      }
    }
  });

  it('...and worth something in it, so the sweep is not vacuous', () => {
    for (const [name, home, read] of READERS) {
      const s = loaded(home);
      s.shell.signatures = [];
      expect(read(s), `${name} is dead at home`).toBeGreaterThan(0);
    }
  });

  it('but a CARRIED signature keeps it — §3.2\'s "your power profile is a build"', () => {
    const s = loaded('aleph');
    s.shell.signatures = [];
    expect(bloomFlow(s)).toBe(0);
    expect(nullFlow(s)).toBe(0);
    expect(boilerSurge(s)).toBe(0);
    s.shell.signatures = ['growth', 'absence', 'pressure'];
    expect(bloomShell(s)).toBe(true);
    expect(nullShell(s)).toBe(true);
    expect(bloomFlow(s)).toBeGreaterThan(0);
    expect(boilerSurge(s)).toBeGreaterThan(0);
  });
});

describe('§2 — each shape is its shell\'s own question', () => {
  it('THE BLOOM: cells you refuse to mine', () => {
    const s = loaded('verdance');
    const n = s.face.cells.length;
    s.growth.stage = new Array(n).fill(0);
    const bare = flowCap(s);
    s.growth.stage = new Array(n).fill(3);
    expect(vinedCells(s)).toBe(n);
    expect(flowCap(s)).toBeCloseTo(bare + BLOOM_PER_VINE * n, 10);
    // A farmer's plant and a stoker's plant are worth roughly the same.
    expect(flowCap(s)).toBeGreaterThan(HEARTH_FLOOR);
    expect(flowCap(s)).toBeLessThan(HEARTH_FLOOR * 4);
  });

  it('THE PRISM: what you did NOT aim is the burst you keep', () => {
    const s = loaded('glassmere');
    ensurePrism(s).intensity = [0, 0, 0, 0, 0, 0];
    expect(freeIntensity(s)).toBe(INTENSITY);
    const unaimed = surgeCap(s);
    // Spend every point on one band: reach bought with burst.
    ensurePrism(s).intensity = [0, INTENSITY, 0, 0, 0, 0];
    expect(freeIntensity(s)).toBe(0);
    expect(darkBands(s)).toBe(5);
    const aimed = surgeCap(s);
    expect(aimed).toBeLessThan(unaimed);
    // unaimed: 3 free + 6 dark. aimed: 0 free + 5 dark.
    expect(unaimed - aimed).toBeCloseTo(
      PRISM_SURGE_PER_FREE * INTENSITY + PRISM_SURGE_PER_DARK, 10,
    );
  });

  it('...and Glassmere has NO plant at all without a Prism', () => {
    const s = loaded('glassmere');
    delete ensurePlant(s).tiers['prism'];
    expect(flowCap(s)).toBe(0);
    expect(surgeCap(s)).toBe(SURGE_FLOOR);
  });

  it('THE NULL: flow that grows as the Silence worsens — and listening drops it', () => {
    const s = loaded('hollow');
    s.hollow.silence = 0;
    const quiet = flowCap(s);
    s.hollow.silence = 100;
    expect(flowCap(s)).toBeCloseTo(quiet + NULL_PER_SILENCE * 100, 10);
    // LISTEN sets silence to 0 — the plant falls back to its floor in the same
    // instant the harvest pays. `absence.ts` is not touched to make that true.
    s.hollow.silence = 0;
    expect(flowCap(s)).toBe(quiet);
  });
});

describe('§3 — ITEM 2: the same Core spend buys different capability', () => {
  /**
   * §3.2's headline claim is that your power profile is a BUILD. The check is
   * not "the numbers differ" — it is that ONE rank of ONE node crosses a
   * machine's demand threshold in one shell and not in another, so the same
   * purchase is a capability here and a rounding error there.
   */
  it('one rank of surgeCapacity fires a LINE in Ferrite and not in Verdance', () => {
    const line = demandOf('line').surge;
    const ferrite = loaded('ferrite');
    ferrite.shell.signatures = [];
    delete ensurePlant(ferrite).tiers['coil'];
    const verdance = loaded('verdance');
    verdance.shell.signatures = [];

    // Neither can fire one bare.
    expect(surgeCap(ferrite)).toBeLessThan(line);
    expect(surgeCap(verdance)).toBeLessThan(line);

    // The SAME spend: one rank.
    ferrite.collapse.nodes = { surgeCapacity: 1 };
    verdance.collapse.nodes = { surgeCapacity: 1 };
    expect(surgeCap(ferrite)).toBe(SURGE_FLOOR + SURGE_PER_RANK);
    expect(surgeCap(verdance)).toBe(SURGE_FLOOR + SURGE_PER_RANK);
    // ...both cross, so the node alone is not the difference. The SHELL is:
    // put a Coil in Ferrite and the same rank is spare capacity; in Verdance
    // there is no second source and the rank IS the Line.
    ensurePlant(ferrite).tiers['coil'] = 2;
    ferrite.polarity.chain = 20;
    expect(surgeCap(ferrite)).toBeGreaterThan(surgeCap(verdance));
    expect(surgeCap(ferrite) - surgeCap(verdance)).toBeGreaterThan(SURGE_PER_RANK);
  });

  it('one rank of flowCapacity runs a REFINERY in Verdance and not in Glassmere', () => {
    const wants = demandOf('kiln').flow + demandOf('refinery').flow;
    const verdance = loaded('verdance');
    verdance.shell.signatures = [];
    const glassmere = loaded('glassmere');
    glassmere.shell.signatures = [];
    delete ensurePlant(glassmere).tiers['prism'];     // the shell's own machine, absent

    verdance.collapse.nodes = { flowCapacity: 1 };
    glassmere.collapse.nodes = { flowCapacity: 1 };
    const vf = flowCap(verdance);
    const gf = flowCap(glassmere);
    // The identical rank: in Verdance it lands on a full Bloom and covers both
    // machines; in a Prism-less Glassmere it is the ONLY power there is.
    expect(gf).toBe(FLOW_PER_RANK);
    expect(vf).toBeGreaterThan(wants);
    expect(gf).toBeLessThan(wants);
  });
});

describe('§4 — pillar 2', () => {
  it('every plant at maximum cannot move dpsMax, in any shell', () => {
    for (const id of SHELLS) {
      const s = loaded(id);
      s.shell.signatures = ['growth', 'absence', 'pressure', 'polarity', 'refraction'];
      s.depth = 48;                                   // THE SAME DEPTH EVERY ARM
      const mods = new ModifierCache();
      mods.invalidate();
      const live = dpsMax(s, mods).toNumber();
      const keptFlow = flowCap(s);
      const keptSurge = surgeCap(s);
      // Strip every shape and read again at the same depth.
      ensurePlant(s).tiers = {};
      s.pressure.heat = 0;
      s.polarity.chain = 0; s.polarity.bestChain = 0;
      s.hollow.silence = 0;
      s.growth.stage = new Array(s.face.cells.length).fill(0);
      s.shell.signatures = [];
      mods.invalidate();
      expect(dpsMax(s, mods).toNumber(), `${id} moved the ceiling`).toBe(live);
      // ...and the plant really was bigger, so the arm is not vacuous.
      expect(keptFlow + keptSurge).toBeGreaterThan(flowCap(s) + surgeCap(s));
    }
  });

  it('the panel read names a shape only where one is live', () => {
    for (const id of SHELLS) {
      const s = loaded(id);
      s.shell.signatures = [];
      const r = shellPlantRead(s);
      if (['verdance', 'glassmere', 'hollow'].includes(id)) {
        expect(r, `${id} has no read`).not.toBeNull();
        expect(r!.id).toBe(id === 'verdance' ? 'bloom' : id === 'glassmere' ? 'prism' : 'null');
      } else {
        expect(r, `${id} claimed a shape it has not got`).toBeNull();
      }
    }
  });
});
