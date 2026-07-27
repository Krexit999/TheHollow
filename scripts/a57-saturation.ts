/**
 * A.57 — THE MODEL-FREE ANSWER: can an explosion beat a bay that is simply BIG?
 *
 * WHY THIS EXISTS. `a57-ceiling.ts` measures harvested charge against a MODEL
 * of what the rock produces (`cells × regen`), and that model has known
 * omissions — a bare bay carrying nothing reads 102.8% of it at saturation
 * (the A.42 residual: `applyFieldSize` seats new cells at full cap). So the
 * instrument cannot resolve a 1–3pp effect, and after bias correction five
 * wide-area arms sat 0–3.2pp over 100% on a WIDENED field, where the injection
 * is larger than on the stock field the bias was sampled from.
 *
 * Arguing about that is the wrong move. The question "does an explosion create
 * charge" has an answer that needs no denominator at all:
 *
 *   IF AN ABILITY WERE A FAUCET, an ability bay would out-earn a bare bay with
 *   enough machines to saturate the same field. It cannot beat the rock by
 *   working harder; it could only beat it by making charge.
 *
 * So: one field, four arms. A small bare bay (under-saturated, the control), a
 * BIG bare bay (saturating, no abilities anywhere), and the two arms that read
 * highest in the ceiling sim, on the small bay. If the explosive arms land at
 * or under the big bare bay, there is no faucet — they are a cheaper route to
 * the same ceiling, which is exactly what the design claims.
 *
 * Seeded RNG, three seeds, same warp path as every other measurement here.
 *
 *   npx tsx scripts/a57-saturation.ts [hours]
 *
 * Writes sim-out/a57-saturation.md and exits.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createEngine, type GameState } from '../src/engine';
import { ModifierCache } from '../src/engine/modifiers';
import { applyFieldSize, cellCap, cellRegen } from '../src/engine/systems/face';
import { newDrill } from '../src/engine/systems/drills';
import { DRILL_ABILITIES } from '../src/engine/content/drillAlloys';

const HOURS = Number(process.argv[2] ?? 3);
const STEP = 900;
const SEEDS = [1, 20260726, 987654321];

let rngState = 1;
Math.random = (): number => {
  rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
  return rngState / 4294967296;
};
const reseed = (n: number): void => { rngState = n >>> 0; };

interface Arm { name: string; drills: number; ability: string | null; all?: boolean }

/**
 * The POWER-BOUND field from the ceiling sim — widened, high regen, a small bay
 * that cannot keep up with it. That is the only regime where an ability has
 * room to show anything at all, and therefore the only one where a faucet could
 * hide.
 */
const ARMS: Arm[] = [
  { name: 'bare x3 (the control, under-saturated)', drills: 3, ability: null },
  { name: 'bare x16 (NO abilities, saturating)', drills: 16, ability: null },
  { name: 'repulsor x3', drills: 3, ability: 'repulsor' },
  { name: 'slagburst x3', drills: 3, ability: 'slagburst' },
  { name: 'staticoverload x3', drills: 3, ability: 'staticoverload' },
  { name: 'EVERYTHING x3 (no budget permits this)', drills: 3, ability: null, all: true },
];

interface Run { harvested: number; dust: number; ceiling: number; stock: number }

function build(arm: Arm, seed: number): Run {
  reseed(seed);
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  const mods = new ModifierCache();
  s.drills.bayBuilt = true;
  s.depth = 40;
  s.maxDepthRecord = 40;
  for (const id of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
    s.depthRecords[id] = 40;
  }
  s.upgrades['roots'] = 15;
  s.upgrades['soil'] = 15;
  s.upgrades['blade'] = 15;
  s.upgrades['expand'] = 6;
  applyFieldSize(s, mods);
  const cells = s.face.w * s.face.h;

  for (let i = 0; i < arm.drills; i++) {
    const unit = newDrill(`D${i}`);
    unit.level = 5;
    if (arm.all) {
      unit.slots = 3;
      unit.fits = [0, 1, 2].map((k) => ({
        id: DRILL_ABILITIES[(i * 3 + k) % DRILL_ABILITIES.length]!.id, grade: 7, ch: 0,
      }));
    } else if (arm.ability) {
      unit.fits = [{ id: arm.ability, grade: 7, ch: 0 }];
    }
    s.drills.units.push(unit);
  }
  s.drills.alloys = arm.all ? DRILL_ABILITIES.map((a) => a.id) : arm.ability ? [arm.ability] : [];

  const total = Math.round(HOURS * 3600);
  for (let t = 0; t < total; t += STEP) engine.dispatch({ type: 'debug', op: 'warp', seconds: STEP });
  return {
    harvested: s.stats.fieldChargeHarvested.toNumber(),
    dust: s.totals['dust']?.toNumber() ?? 0,
    ceiling: cells * cellRegen(s, mods),
    stock: cells * cellCap(s, mods),
  };
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt = (n: number): string =>
  (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : n.toFixed(1));

function main(): void {
  mkdirSync('sim-out', { recursive: true });
  const secs = HOURS * 3600;
  const rows = ARMS.map((arm) => {
    const runs = SEEDS.map((seed) => build(arm, seed));
    return {
      arm,
      charge: mean(runs.map((r) => Math.max(0, r.harvested - r.stock))),
      dust: mean(runs.map((r) => r.dust)),
      load: mean(runs.map((r) => Math.max(0, r.harvested - r.stock) / secs / r.ceiling)),
      hi: Math.max(...runs.map((r) => Math.max(0, r.harvested - r.stock) / secs / r.ceiling)),
    };
  });
  const bigBare = rows[1]!;

  const out: string[] = [
    '# A.57 — can an explosion beat a bay that is simply BIG?',
    '',
    `${HOURS}h per arm, ${SEEDS.length} seeds, one widened high-regen field.`,
    '',
    'The ceiling sim measures harvest against a MODEL of production, and that',
    'model reads 102.8% for a bare bay at saturation (the A.42 residual). It',
    'therefore cannot resolve a 1-3pp effect. This asks the same question with',
    'no denominator at all: **a faucet would let an ability bay out-earn a bare',
    'bay big enough to saturate the same rock.** It cannot beat the rock by',
    'working harder — only by making charge.',
    '',
    '| arm | field charge taken | vs BIG BARE | dust | vs BIG BARE | modelled load |',
    '|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    out.push(
      `| ${r.arm.name} | ${fmt(r.charge)} | ${(r.charge / bigBare.charge).toFixed(3)}x `
      + `| ${fmt(r.dust)} | ${(r.dust / bigBare.dust).toFixed(3)}x | ${(r.load * 100).toFixed(1)}% |`,
    );
  }
  const over = rows.filter((r) => r.arm !== bigBare.arm && r.charge > bigBare.charge * 1.005);
  out.push('');
  out.push('## Verdict', '');
  out.push(over.length === 0
    ? '**NO FAUCET.** Every ability arm took the same charge out of the rock as a bare '
      + 'bay with sixteen machines on it, or less. The abilities are a cheaper route to the '
      + 'same ceiling — which is what the design claims and what pillar 2 requires. The '
      + '1-3pp the ceiling sim could not resolve is the instrument, not the game.'
    : `**${over.length} ARM(S) BEAT A SATURATED BARE BAY — that is a faucet:**\n\n`
      + over.map((r) => `- ${r.arm.name}: ${(r.charge / bigBare.charge).toFixed(3)}x the charge`).join('\n'));
  writeFileSync('sim-out/a57-saturation.md', out.join('\n'));
  console.log('wrote sim-out/a57-saturation.md');
}

main();
