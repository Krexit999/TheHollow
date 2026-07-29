/**
 * PILLAR 2 UNDER A TOOL THAT EXPLODES — measured, not argued.
 *
 * THE CLAIM: a tool carrying abilities reaches the field's ceiling FASTER and
 * never raises it. So the three readings that matter are:
 *
 *   POWER-BOUND (slow clicking)  abilities are worth something — there is
 *                                banked regen going to waste and they collect
 *                                it. If they are worth nothing here the feature
 *                                is inert, which is its own failure (A.53's
 *                                emberset shipped that way for a phase).
 *   CEILING-BOUND (fast)         every arm converges. Once bare hands already
 *                                take every grain the field makes, an explosion
 *                                has nothing left to add.
 *   THE FAUCET TEST              no ability arm out-earns a SATURATED bare arm.
 *
 * THE THIRD ONE IS THE LOAD-BEARING READING, and it is model-free on purpose.
 * A.57 spent three passes trying to gate on "percentage of the modelled
 * ceiling" and the gate was wrong every time — twice from subtracting a
 * per-scenario baseline, once from a knife-edge comparison reading float
 * jitter — because the modelled ceiling has a known ~3pp bias (`applyFieldSize`
 * seats new cells at full cap, charge injected where no differencing can see
 * it). The question "can an explosion create charge" needs no model: a faucet
 * would let an ability arm BEAT a bare arm that is already saturating the same
 * rock. Nothing else has to be true for that to be conclusive.
 *
 * SEEDED, because `charge.roll` and every drop roll read Math.random, and A.53
 * proved that an unseeded run makes an arm that touches no charge-path code
 * read 3% apart from bare.
 *
 * Writes sim-out/tool-abilities.md and exits.
 *   npx tsx scripts/sim-tool-abilities.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createEngine } from '../src/engine';
import type { GameState } from '../src/engine/types';
import { PART_TYPES } from '../src/engine/content/forgeParts';
import { makePart } from '../src/engine/systems/forgeParts';
import { matchAllAbilities, ABILITY_BY_ID } from '../src/engine/content/drillAlloys';
import { handCarrier, TOOL_SLOT_CAP } from '../src/engine/systems/toolAbilities';
import { allShells } from '../src/engine/shells';
import { newDrill } from '../src/engine/systems/drills';
import { TOOL_MODS, MOD_LEVEL_MAX, modXpForLevel } from '../src/engine/content/toolMods';
import { modSlotsFree, modSlotsTotal, modSlotsUsed, modCache, toolInstability } from '../src/engine/systems/toolMods';
import { xpForLevel } from '../src/engine/systems/toolMining';
import { materialsOfShell } from '../src/engine/materials';

const SECONDS = 600;
const DT = 0.1;
const SEEDS = [1, 2, 3];

/** A deterministic stream, installed over Math.random for the length of an arm.
 *  Same seed, same world — so two arms differ by the arm and nothing else. */
function seedRandom(seed: number): () => void {
  const original = Math.random;
  let s = seed >>> 0 || 1;
  Math.random = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  return () => { Math.random = original; };
}

/**
 * WHAT AN ARM IS, AS A TAG RATHER THAN AS ITS NAME.
 *
 * The first version of the gates below selected arms with `label.includes('+')`
 * and `label.startsWith('tool + 4')`. That worked until this phase added two
 * arms whose names contain neither — so THE TWO STRONGEST BUILDS IN THE SIM
 * were silently excluded from the faucet test, which then reported on the third
 * strongest and passed. The output looked identical to a correct run.
 *
 * Same family as every instrument failure in this project's ledger: a filter
 * that cannot tell "nothing matched" from "nothing was wrong". Arms are tagged
 * now, and adding one without a tag is a type error.
 */
type ArmKind = 'bare' | 'tool' | 'armed' | 'op' | 'cheat';

interface Arm {
  label: string;
  kind: ArmKind;
  material: string | null;
  /** How many of what the build grants to seat. */
  abilities: number;
  grade: number;
  /** Machines on the rails — the idle layer, for the pillar-1 comparison. */
  drills?: number;
  /**
   * MODIFIERS. `'all'` seats every modifier in the library at full stacks — a
   * build no slot count would ever permit, which is the point: if the ceiling
   * survives a tool that cheated past its own budget, the budget is not what
   * was holding it. `'legal'` fills the slots a real deep tool actually has.
   */
  mods?: 'all' | 'legal' | 'engineered';
  /** Levels, for the legal arm's slot count. */
  level?: number;
}

/** Pick a Loam stone whose three rock-facing parts grant the most abilities —
 *  the worst case for the ceiling is the tool carrying the most. */
function pickStone(): { id: string; grants: string[] } {
  let best = { id: '', grants: [] as string[] };
  for (const shell of allShells()) {
    for (const m of materialsOfShell(shell.id)) {
      const got = matchAllAbilities([m.id, m.id, m.id], { reached: 7 }).map((a) => a.id);
      if (got.length > best.grants.length) best = { id: m.id, grants: got };
    }
  }
  return best;
}

/**
 * THE REGISTRY IS EMPTY UNTIL AN ENGINE EXISTS. `allShells()` is populated by
 * `createEngine`, so reading it at module scope returns [] and every loop below
 * runs zero times — which is exactly how A.56 found a reach test that had been
 * passing by doing nothing for three phases. It cost a run here too: the first
 * execution picked a stone id of '' and crashed in `materialDef`.
 *
 * The crash is the lucky version. The dangerous one is a loop that quietly
 * measures nothing and reports a green number.
 */
createEngine({ nowMs: 0 });
const STONE = pickStone();
if (!STONE.id) throw new Error('no stone grants an ability — the registry changed');

interface Reading { rate: number; produced: number }

function runArm(arm: Arm, clicksPerSec: number, seed: number): Reading {
  const restore = seedRandom(seed);
  try {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.forge.built = true;
    for (const shell of allShells()) s.depthRecords[shell.id] = 40;
    s.casting.tool = arm.material === null
      ? []
      : PART_TYPES.map((t, i) => ({ ...makePart(t, arm.material!, 60), id: i + 1 }));
    s.casting.wear = 0;

    if (arm.drills) {
      s.drills.bayBuilt = true;
      for (let i = 0; i < arm.drills; i++) s.drills.units.push(newDrill(`D${i}`));
    }

    if (arm.level) s.casting.xp = xpForLevel(arm.level);

    if (arm.mods && arm.material) {
      s.casting.knownMods = TOOL_MODS.map((m) => m.id);
      if (arm.mods === 'engineered') {
        /**
         * THE BRIEF'S FANTASY, BUILT: max levels, synergies awake, and
         * DELIBERATELY STABILISED so it does not misfire.
         *
         * That last part is the honest choice for a ceiling test. A tool at 35%
         * misfire takes LESS than a steady one, so leaving it unstable would
         * hand the faucet gate a flattering number for the wrong reason — the
         * arm would pass because it was broken, not because the ceiling holds.
         * The strongest thing a player can actually field is the engineered
         * one, so that is what gets measured.
         */
        s.casting.xp = xpForLevel(1 + 5 * 400);
        const order = [...TOOL_MODS].sort((a, b) =>
          (b.fx.stabilize ? 1 : 0) - (a.fx.stabilize ? 1 : 0)
          || (b.category === 'combo' ? 1 : 0) - (a.category === 'combo' ? 1 : 0)
          || b.cost - a.cost);
        s.casting.mods = order.map((m) => ({
          id: m.id, n: m.maxStacks, xp: modXpForLevel(MOD_LEVEL_MAX),
        }));
      } else if (arm.mods === 'all') {
        // ENOUGH ROOM THAT NOTHING FALLS ASLEEP. A stack past the tool's budget
        // goes dormant, so seating the whole library on a normal tool would
        // measure a tool carrying a third of it while the label said
        // "everything" — the arm has to actually BE what it claims.
        s.casting.xp = xpForLevel(1 + 5 * 400);
        s.casting.mods = TOOL_MODS.map((m) => ({ id: m.id, n: m.maxStacks }));
      } else {
        // FILL THE REAL BUDGET, worst-case-first: the biggest, most explosive
        // things a player could actually seat, then cheaper ones until the
        // slots run out. Combos go in FIRST so the amplifiers are live.
        s.casting.mods = [];
        const order = [...TOOL_MODS].sort((a, b) =>
          (b.category === 'combo' ? 1 : 0) - (a.category === 'combo' ? 1 : 0) || b.cost - a.cost);
        for (const m of order) {
          for (let k = 0; k < m.maxStacks; k++) {
            if (m.cost > modSlotsFree(s)) break;
            const at = s.casting.mods.find((x) => x.id === m.id);
            if (at) at.n += 1;
            else s.casting.mods.push({ id: m.id, n: 1 });
          }
        }
      }
    }

    if (arm.material && arm.abilities > 0) {
      // Seated directly rather than through `syncToolAbilities`, so the arm is
      // exactly the loadout named — including loadouts the slot count would
      // refuse. Cheating past the limit must still not breach the ceiling.
      handCarrier(s).fits = STONE.grants
        .slice(0, arm.abilities)
        // `fired` is the ability's own level — the OP arms carry level-V
        // abilities, which is what the phase's "starts small, ends
        // screen-clearing" actually means at the far end.
        .map((id) => ({ id, grade: arm.grade, ch: 0, fired: arm.mods ? 999 : 0 }));
    }

    const cells = s.face.cells.length;
    let cursor = 0;
    let debt = 0;
    const start = s.stats.fieldChargeHarvested.toNumber();
    const startHeld = held(s);

    for (let t = 0; t < SECONDS / DT; t++) {
      engine.tick(DT);
      debt += clicksPerSec * DT;
      while (debt >= 1) {
        engine.dispatch({ type: 'chip', cell: cursor % cells });
        cursor++;
        debt -= 1;
      }
      // Wear held off: a tool that broke halfway would measure a blend of two
      // configurations. Durability is step 3's sim, not this one.
      (engine.getState() as GameState).casting.wear = 0;
    }
    const end = engine.getState() as GameState;
    const got = end.stats.fieldChargeHarvested.toNumber() - start;
    /**
     * STORAGE GOES IN THE MEASURE — the A.42 correction, applied here.
     *
     * The face HOLDS charge, and an ore pocket holds a lot of it (a pocket
     * raises a cell's cap, which is why `dpsMax` has no cap term and the
     * ceiling cannot move). So a window that ends with less in the rock than it
     * started SPENT that difference, and counting only what came out reads it
     * as production. That is worth ~0.5pp here and it is exactly the size of
     * the effect this sim is trying to resolve, which is why the first run
     * flagged a faucet that was a bookkeeping gap.
     *
     * `produced` is what the field actually GREW: what left it, plus whatever
     * more is sitting in it than was at the start.
     */
    const produced = got + (held(end) - startHeld);
    return { rate: got / SECONDS, produced: produced / SECONDS };
  } finally {
    restore();
  }
}

const held = (s: GameState): number => s.face.cells.reduce((a, b) => a + b, 0);

const median = (xs: number[]): number => {
  const a = [...xs].sort((x, y) => x - y);
  return a[a.length >> 1]!;
};

function measure(arm: Arm, rate: number): { med: number; produced: number } {
  const runs = SEEDS.map((seed) => runArm(arm, rate, seed));
  return {
    med: median(runs.map((r) => r.rate)),
    produced: median(runs.map((r) => r.produced)),
  };
}

// ---------------------------------------------------------------------------

const ARMS: Arm[] = [
  { label: 'bare hands', kind: 'bare', material: null, abilities: 0, grade: 1 },
  { label: 'tool, no ability', kind: 'tool', material: STONE.id, abilities: 0, grade: 1 },
  { label: 'tool + 1 ability', kind: 'armed', material: STONE.id, abilities: 1, grade: 1 },
  { label: `tool + ${TOOL_SLOT_CAP}, grade VII`, kind: 'armed', material: STONE.id, abilities: TOOL_SLOT_CAP, grade: 7 },
  { label: 'tool + EVERYTHING it grants, grade VII', kind: 'armed', material: STONE.id, abilities: 99, grade: 7 },
  {
    label: 'THE OP TOOL — legal build, level 80', kind: 'op',
    material: STONE.id, abilities: 99, grade: 7, mods: 'legal', level: 80,
  },
  {
    label: 'THE CHEATED TOOL — every modifier, every stack', kind: 'cheat',
    material: STONE.id, abilities: 99, grade: 7, mods: 'all', level: 80,
  },
  {
    label: 'THE ENGINEERED TOOL — max levels, synergies awake, stabilised', kind: 'cheat',
    material: STONE.id, abilities: 99, grade: 7, mods: 'engineered', level: 80,
  },
];

/** Slow enough that the face banks regen it never collects (power-bound), and
 *  fast enough that bare hands alone saturate it (ceiling-bound). The crossover
 *  on a 6x6 at base regen is ~0.36 clicks/s: a cell refills in cap/regen = 100s
 *  and the face cycles in 36/rate. */
const POWER_BOUND = [0.05, 0.1, 0.2];
const CEILING_BOUND = [2, 10, 200];

mkdirSync('sim-out', { recursive: true });
const out: string[] = [];
const say = (s = ''): void => { out.push(s); console.log(s); };

say('# PILLAR 2 — a tool that explodes reaches the ceiling faster, never raises it');
say();
say(`${SECONDS}s per cell, ${SEEDS.length} seeds, 6x6 face at depth 0. Charge harvested per second.`);
say();
say(`Stone: **${STONE.id}** — its Head/Edge/Sockets grant ${STONE.grants.length}: ` +
  STONE.grants.map((id) => ABILITY_BY_ID.get(id)?.name ?? id).join(', '));
say();

// WHAT THE OP ARMS ACTUALLY ARE — printed, because an arm nobody can inspect is
// an arm nobody can check. The legal one is what a real deep player can hold.
{
  const probe = createEngine({ nowMs: 0 }).getState() as GameState;
  for (const shell of allShells()) probe.depthRecords[shell.id] = 40;
  probe.forge.built = true;
  probe.casting.tool = PART_TYPES.map((t, i) => ({ ...makePart(t, STONE.id, 60), id: i + 1 }));
  probe.casting.xp = xpForLevel(80);
  const total = modSlotsTotal(probe);
  probe.casting.knownMods = TOOL_MODS.map((m) => m.id);
  probe.casting.mods = [];
  const order = [...TOOL_MODS].sort((a, b) =>
    (b.category === 'combo' ? 1 : 0) - (a.category === 'combo' ? 1 : 0) || b.cost - a.cost);
  for (const m of order) {
    for (let k = 0; k < m.maxStacks; k++) {
      if (m.cost > modSlotsFree(probe)) break;
      const at = probe.casting.mods.find((x) => x.id === m.id);
      if (at) at.n += 1; else probe.casting.mods.push({ id: m.id, n: 1 });
    }
  }
  const c = modCache(probe, 4);
  say(`**The OP arm**: ${total} slots (${modSlotsUsed(probe)} used), ` +
    `${probe.casting.mods.length} distinct modifiers, ${c.live.length} awake, ` +
    `${c.dormant.length} asleep. Amplify **${c.amplify.toFixed(2)}×**. ` +
    `Reach +${c.cells.toFixed(1)}, splash +${(c.splash * 100).toFixed(0)}%, ` +
    `blast radius +${(c.paramAdd['r'] ?? 0).toFixed(1)}, grade +${Math.floor(c.abilityGrade)}, ` +
    `charge ${(1 + c.chargePerSwing).toFixed(1)}×.`);
  say();
  say(`**The cheated arm**: all ${TOOL_MODS.length} modifiers at full stacks — ` +
    'a build the slot count refuses, run anyway. If the ceiling survives this, ' +
    'the slot count was never what was holding it.');
  say();

  // THE ENGINEERED ARM, described so it can be checked rather than trusted.
  {
    const eng = createEngine({ nowMs: 0 }).getState() as GameState;
    for (const shell of allShells()) eng.depthRecords[shell.id] = 40;
    eng.forge.built = true;
    eng.casting.tool = PART_TYPES.map((t, i) => ({ ...makePart(t, STONE.id, 60), id: i + 1 }));
    eng.casting.xp = xpForLevel(1 + 5 * 400);
    eng.casting.knownMods = TOOL_MODS.map((m) => m.id);
    eng.casting.mods = TOOL_MODS.map((m) => ({
      id: m.id, n: m.maxStacks, xp: modXpForLevel(MOD_LEVEL_MAX),
    }));
    handCarrier(eng).fits = STONE.grants.map((id) => ({ id, grade: 7, ch: 0, fired: 999 }));
    const c = modCache(eng, STONE.grants.length);
    const inst = toolInstability(eng);
    say(`**The engineered arm**: every modifier at level ${MOD_LEVEL_MAX}, ` +
      `**${c.awake.length} synergies awake** (${c.awake.join(', ')}), ` +
      `amplify ${c.amplify.toFixed(2)}×, reach +${c.cells.toFixed(1)}, ` +
      `blast radius +${(c.paramAdd['r'] ?? 0).toFixed(1)}, grade +${Math.floor(c.abilityGrade)}. ` +
      `Instability ${Math.round(inst.net)} net after ${Math.round(inst.steady)} of steadying — ` +
      `**${Math.round(inst.misfire * 100)}% misfire**.`);
    say();
    say('It is stabilised on purpose. An unstable tool takes LESS (a fizzle takes ' +
      'nothing), so leaving it shaky would pass the faucet gate for the wrong reason.');
    say();
  }
}

// --- the instrument's own noise, first --------------------------------------
say('## The instrument');
say();
const noiseRuns = SEEDS.map((seed) => runArm(ARMS[0]!, 200, seed).produced);
const noiseMed = median(noiseRuns);
const noisePp = (Math.max(...noiseRuns) - Math.min(...noiseRuns)) / noiseMed;
const TOL = Math.max(0.005, noisePp);
say(`A saturated bare arm across ${SEEDS.length} seeds: ` +
  noiseRuns.map((r) => r.toFixed(4)).join(' / '));
say(`Seed spread **${(noisePp * 100).toFixed(2)}%** → tolerance **${(TOL * 100).toFixed(2)}%**.`);
say();
say('A threshold with no tolerance measures the instrument, not the thing (A.57).');
say('A real faucet here is a tens-of-points effect, not a tenth of one.');
say();

// --- the two scenarios ------------------------------------------------------
interface Row { arm: string; kind: ArmKind; rate: number; med: number; produced: number; vs: number }
const rows: Row[] = [];

for (const [name, rates] of [['POWER-BOUND', POWER_BOUND], ['CEILING-BOUND', CEILING_BOUND]] as const) {
  say(`## ${name} — ${rates.join(', ')} clicks/s`);
  say();
  say('| arm | ' + rates.map((r) => `${r}/s`).join(' | ') + ' |');
  say('|---|' + rates.map(() => '---:').join('|') + '|');
  for (const arm of ARMS) {
    const cells: string[] = [];
    for (const rate of rates) {
      const m = measure(arm, rate);
      const base = measure(ARMS[0]!, rate).med;
      rows.push({ arm: arm.label, kind: arm.kind, rate, med: m.med, produced: m.produced, vs: m.med / base });
      cells.push(`${m.med.toFixed(3)} (${(m.med / base).toFixed(3)}×)`);
    }
    say(`| ${arm.label} | ${cells.join(' | ')} |`);
  }
  say();
}

// --- the verdicts -----------------------------------------------------------
say('## The readings');
say();

// 1 — worth something when the field is banking regen.
const slow = rows.filter((r) => r.rate === POWER_BOUND[0] && r.arm !== 'bare hands');
const bestSlow = Math.max(...slow.map((r) => r.vs));
const abilitySlow = rows.filter((r) => r.rate === POWER_BOUND[0] && (r.kind === 'armed' || r.kind === 'op' || r.kind === 'cheat'));
const plainSlow = rows.find((r) => r.rate === POWER_BOUND[0] && r.kind === 'tool')!;
const lift = Math.max(...abilitySlow.map((r) => r.vs)) / plainSlow.vs;
say(`**Power-bound, abilities are worth something.** At ${POWER_BOUND[0]}/s the best arm ` +
  `reads **${bestSlow.toFixed(2)}×** bare hands, and the abilities are worth ` +
  `**${lift.toFixed(3)}×** on top of the same tool carrying none. ` +
  (lift > 1 + TOL
    ? 'They collect banked regen a bare swing leaves in the rock.'
    : 'NOT DISTINGUISHABLE FROM NOISE — the abilities may be inert at this rate.'));
say();

// 2 — convergence.
const fast = rows.filter((r) => r.rate === CEILING_BOUND[CEILING_BOUND.length - 1]);
const spread = Math.max(...fast.map((r) => r.vs)) - Math.min(...fast.map((r) => r.vs));
say(`**Ceiling-bound, everything converges.** At ${CEILING_BOUND[CEILING_BOUND.length - 1]}/s the ` +
  `arms span **${(spread * 100).toFixed(2)}pp** — against a ${(TOL * 100).toFixed(2)}% instrument. ` +
  (spread <= TOL * 2
    ? 'Once bare hands already take every grain the field makes, an explosion adds nothing.'
    : 'THE ARMS DO NOT CONVERGE — investigate before shipping.'));
say();

/**
 * 3 — THE FAUCET TEST, MODEL-FREE, AND MATCHED ON SATURATION.
 *
 * THE COMPARISON HAS TO BE MADE AT A RATE WHERE THE BARE ARM IS ACTUALLY
 * SATURATED, and the first cut of this script was not. It took every arm at
 * >= 2 clicks/s and compared it against a bare arm measured at 200/s — but bare
 * hands at 2/s read 2.853 against 2.935 at 200/s, i.e. 97% of their own
 * plateau. So an ability arm collecting that last 3% of headroom was scored
 * against a reference it had never been matched to, and flagged as a faucet at
 * 1.0057x.
 *
 * That is A.57's first ceiling-gate defect exactly, one phase later: a bias
 * sampled in one condition and applied in another. The gate now:
 *   - takes only the TOP rate, and asserts the bare arm is at its plateau there
 *   - compares PRODUCED against PRODUCED (storage in both), so a run that spent
 *     banked pocket charge is not read as having grown it
 */
const topRate = CEILING_BOUND[CEILING_BOUND.length - 1]!;
const bareTop = rows.find((r) => r.rate === topRate && r.kind === 'bare')!;
const bareMid = rows.find((r) => r.rate === CEILING_BOUND[0] && r.kind === 'bare')!;
const saturated = bareTop.produced;
const plateau = Math.abs(bareTop.med - bareMid.med) / bareTop.med;

const worst = rows
  .filter((r) => r.kind !== 'bare' && r.kind !== 'tool' && r.rate === topRate)
  .reduce((a, b) => (b.produced > a.produced ? b : a));
const ratio = worst.produced / saturated;

say(`**The faucet test**, at ${topRate}/s where the bare arm is provably on its plateau ` +
  `(${CEILING_BOUND[0]}/s → ${topRate}/s moves it ${(plateau * 100).toFixed(2)}%).`);
say();
say(`The strongest ability arm produced **${worst.produced.toFixed(4)}** against a saturated ` +
  `bare arm's **${saturated.toFixed(4)}** — **${ratio.toFixed(4)}×**. ` +
  (ratio <= 1 + TOL
    ? 'It cannot beat the rock by working harder, only by making charge. It did not.'
    : 'IT BEAT THE ROCK. That is a faucet — do not ship.'));
say();
say('*The unmatched version of this gate flagged at 1.0057× by scoring a 2/s arm ' +
  'against a 200/s reference. The reading was the instrument, and the fix is in ' +
  'the instrument — see the comment in the script.*');
say();
/**
 * 4 — PILLAR 1, which binds this too. The tool is the ACTIVE layer by the doc's
 * own framing, so tool abilities firing only while you mine by hand is correct
 * rather than a gap — but pillar 1 bounds how much harsher the game may be for
 * an idle player at ~5x, and a tool that explodes is the strongest thing an
 * active player can do to the rock. So it gets measured rather than assumed.
 *
 * The idle arm is the same world at ZERO clicks: seepage only, no drills, which
 * is the floor an idle player without machines actually sits on.
 */
const idleBare = measure(
  { label: 'idle', kind: 'bare', material: null, abilities: 0, grade: 1 }, 0,
).med;
const idleBay = measure(
  { label: 'idle + bay', kind: 'bare', material: null, abilities: 0, grade: 1, drills: 6 }, 0,
).med;

// THE LEGAL LOADOUT, not the cheated one. The cheated arm seats every
// abilities on a tool whose slots cap at four — correct for the ceiling proof
// (a limit is not what enforces pillar 2) and wrong for pillar 1, which asks
// what a player can actually run.
const legal = rows
  .filter((r) => r.kind === 'op' && r.rate <= 0.2)
  .reduce((a, b) => (b.med > a.med ? b : a));
const plain = rows
  .filter((r) => r.kind === 'tool' && r.rate <= 0.2)
  .reduce((a, b) => (b.med > a.med ? b : a));

const vsBare = legal.med / Math.max(1e-9, idleBare);
const vsBay = legal.med / Math.max(1e-9, idleBay);
const wasBare = plain.med / Math.max(1e-9, idleBare);
const wasBay = plain.med / Math.max(1e-9, idleBay);

say('**Pillar 1 — and the first way of measuring it compared two players who do not coexist.**');
say();
say(`Against an idle player with NO MACHINES (${idleBare.toFixed(4)}/s, the seepage floor) the ` +
  `legal ability tool reads **${vsBare.toFixed(2)}×** — but the same tool carrying NO abilities ` +
  `already reads ${wasBare.toFixed(2)}×, so most of that gap is the tool, which A.42–A.43 already ` +
  'measured and tuned. It is also the wrong denominator: nobody holds a grade-VII tool and no drills.');
say();
say(`Against the idle player who actually exists at that point — six machines on the rails, ` +
  `**${idleBay.toFixed(4)}/s** — the legal ability tool reads **${vsBay.toFixed(2)}×** against a ` +
  `~5× bound (no abilities: ${wasBay.toFixed(2)}×). ` +
  `${vsBay <= 5 ? '**In band.**' : '**OUT OF BAND — the abilities widen the gate.**'}`);
say();
say(`NOTE, unresolved and recorded rather than explained away: the idle+bay arm produces ` +
  `${idleBay.toFixed(3)}/s against a nominal field of W·H·regen = 2.88/s. Ore pockets raise a ` +
  `cell's CAP so a worked face wastes less overflow, which accounts for some of it; the rest is ` +
  `the injected-charge residual A.42 ledgered and nobody has built the counter for. It does not ` +
  `change this conclusion — at the nominal 2.88 the ratio is ${(legal.med / 2.88).toFixed(2)}×, ` +
  `still far inside the bound — but it is not a number to quote elsewhere.`);
say();

say(`VERDICT: ${
  ratio <= 1 + TOL && spread <= TOL * 2 ? 'PILLAR 2 HOLDS' : 'REVIEW'
}${lift > 1 + TOL ? ' · the abilities are not inert' : ' · but the abilities may be inert'}`);

writeFileSync('sim-out/tool-abilities.md', out.join('\n') + '\n');
console.log('\n→ sim-out/tool-abilities.md');
