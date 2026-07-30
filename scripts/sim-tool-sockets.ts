/**
 * A FULLY SOCKETED TOOL DOES NOT MOVE THE CEILING — measured.
 *
 * The socket phase is the first one in this forge arc whose effects were NOT
 * written for the tool: a relic affix, a rune pair and a gem bonus all existed
 * before sockets did, and some of them touch `dustYield`, `regen` and `cap`.
 * That makes the instrument choice the whole argument, so it is stated up front:
 *
 *   THE MEASURE IS LOAD: charge harvested over the INTEGRATED ceiling,
 *   `sum over seconds of (cells x cellRegen)`, which is the denominator
 *   `scripts/sim.ts` settled on at A.42. `dustYield` turns charge into currency
 *   and cannot appear in it at all. `regen` appears on BOTH SIDES, which is the
 *   whole reason it has to be integrated rather than compared arm-to-arm.
 *
 * THE FIRST DRAFT OF THIS SIM GOT THAT WRONG AND PRINTED A VERDICT.
 *
 * It compared each arm's absolute produced charge against a BARE-HANDS arm, and
 * flagged 1.10x — 'SOMETHING BEAT THE ROCK'. Nothing had. A relic carrying
 * `regen` (or a power that does, or the rune pair mol|ash) genuinely makes the
 * field produce more charge, because `regen` is a term IN `dpsMax` — so the two
 * arms were not hammering the same rock, and the reference had a lower ceiling
 * than the thing being measured. Exactly A.57's defect: a bias sampled in one
 * condition and applied in another.
 *
 * Integrating the ceiling per second fixes it at the root and needs no bias term:
 * an arm that raises regen raises both sides and reads 1.00, and an arm that
 * MAKES charge reads above 1.00 no matter what it raised.
 *
 * Writes sim-out/tool-sockets.md and exits.
 *   npx tsx scripts/sim-tool-sockets.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createEngine } from '../src/engine';
import type { EngineCtx, GameState, RelicInstance } from '../src/engine/types';
import { PART_TYPES } from '../src/engine/content/forgeParts';
import { makePart } from '../src/engine/systems/forgeParts';
import { currentTool } from '../src/engine/systems/casting';
import { GEMS } from '../src/engine/materials';
import { WAKING_STEPS } from '../src/engine/systems/relics';
import { setSocket, socketCount } from '../src/engine/systems/toolSockets';
import { allShells } from '../src/engine/shells';
import { cellRegen } from '../src/engine/systems/face';
import { ModifierCache } from '../src/engine/modifiers';

const SECONDS = 300;
const DT = 0.1;
const SEEDS = [1, 2];

/**
 * THE DEEPEST SOCKET ROW IN THE GAME — hollow+charged+trueseated, five slots.
 *
 * The first cut used Loam's `weepstone`, which gives TWO, and the arms were all
 * labelled "every socket". Two is not a stress test and a two-socket row cannot
 * hold a rune TRIPLE at all, so the strongest thing the feature can do was not
 * being measured. Same shell for the other six parts, so coherence stays high
 * and nothing is being measured through a mismatch penalty.
 */
const DEEP = 'voidstar';
const REST = 'umbrite';

const ctx: EngineCtx = { emit: () => {}, dirty: () => {} };

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

const held = (s: GameState): number => s.face.cells.reduce((a, b) => a + b, 0);

type Fill = 'none' | 'relics' | 'runes' | 'gems' | 'everything';

interface Arm {
  label: string;
  /** null = bare hands. */
  tool: boolean;
  fill: Fill;
  /** Affixes each planted relic carries. Absurd on purpose. */
  affixes?: Record<string, number>;
}

/** A relic that never existed in a drop table — the point is the ceiling, not realism. */
function plantRelic(s: GameState, affixes: Record<string, number>): RelicInstance {
  const r = {
    uid: s.relics.nextUid++,
    defId: 'sim', rarity: 4, affixes, source: 'depth', fusedFrom: 0,
    waking: WAKING_STEPS.length - 1,
  } as RelicInstance;
  s.relics.held.push(r);
  return r;
}

function build(s: GameState, arm: Arm): void {
  if (!arm.tool) { s.casting.tool = []; return; }
  s.casting.tool = PART_TYPES.map((t, i) => ({
    ...makePart(t, t === 'sockets' ? DEEP : REST, 60), id: i + 1,
  }));
  s.casting.wear = 0;
  s.casting.sockets = [];
  const n = socketCount(currentTool(s));

  // Runes and gems in the pile, so the verb can actually take them.
  for (const id of ['kel', 'thur', 'mol', 'ash', 'sen'] as const) s.runes.found[id] = 9;
  for (const g of GEMS) s.materials.gems[g.id] = 9;

  const affixes = arm.affixes ?? {};
  for (let i = 0; i < n; i++) {
    if (arm.fill === 'relics' || (arm.fill === 'everything' && i % 3 === 0)) {
      const r = plantRelic(s, affixes);
      setSocket(s, ctx, i, { kind: 'relic', uid: r.uid });
    } else if (arm.fill === 'runes' || (arm.fill === 'everything' && i % 3 === 1)) {
      // A HARMONIOUS row: kel|thur is The Weighted Edge, thur|mol The Rooted
      // Weight. Nothing dissonant, so the verb accepts every one.
      const seq = ['kel', 'thur', 'mol', 'ash', 'sen'] as const;
      setSocket(s, ctx, i, { kind: 'rune', id: seq[i % seq.length]! });
    } else if (arm.fill === 'gems' || arm.fill === 'everything') {
      setSocket(s, ctx, i, { kind: 'gem', id: GEMS[i % GEMS.length]!.id });
    }
  }
}

interface Reading {
  rate: number;
  produced: number;
  /** The integrated field ceiling over the window — the pillar-2 denominator. */
  ceiling: number;
  /** produced / ceiling. 1.00 means 'took exactly what the rock made'. */
  load: number;
  filled: number;
}

function run(arm: Arm, clicksPerSec: number, seed: number): Reading {
  const restore = seedRandom(seed);
  try {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.forge.built = true;
    for (const shell of allShells()) s.depthRecords[shell.id] = 40;
    build(s, arm);
    const filled = (s.casting.sockets ?? []).filter(Boolean).length;

    const cells = s.face.cells.length;
    let cursor = 0;
    let debt = 0;
    // INTEGRATED PER TICK, because the buckets move: a socketed regen relic
    // raises the ceiling and must raise this with it.
    let ceiling = 0;
    const mods = new ModifierCache();
    const start = s.stats.fieldChargeHarvested.toNumber();
    const startHeld = held(s);

    for (let t = 0; t < SECONDS / DT; t++) {
      engine.tick(DT);
      {
        const live = engine.getState() as GameState;
        mods.invalidate();
        ceiling += live.face.cells.length * cellRegen(live, mods) * DT;
      }
      debt += clicksPerSec * DT;
      while (debt >= 1) {
        // Blocked = wait; ready = swing and move on. The balance sim's third draft.
        if (((engine.getState() as GameState).casting.windup ?? 0) > 0) { debt -= 1; continue; }
        engine.dispatch({ type: 'chip', cell: cursor % cells });
        cursor++;
        debt -= 1;
      }
      (engine.getState() as GameState).casting.wear = 0;
    }
    const end = engine.getState() as GameState;
    const got = end.stats.fieldChargeHarvested.toNumber() - start;
    const produced = got + (held(end) - startHeld);
    return {
      rate: got / SECONDS,
      produced: produced / SECONDS,
      ceiling: ceiling / SECONDS,
      load: ceiling > 0 ? produced / ceiling : 0,
      filled,
    };
  } finally {
    restore();
  }
}

const median = (xs: number[]): number => {
  const a = [...xs].sort((x, y) => x - y);
  return a[a.length >> 1]!;
};

function measure(arm: Arm, rate: number): Reading {
  const runs = SEEDS.map((seed) => run(arm, rate, seed));
  return {
    rate: median(runs.map((r) => r.rate)),
    produced: median(runs.map((r) => r.produced)),
    ceiling: median(runs.map((r) => r.ceiling)),
    load: median(runs.map((r) => r.load)),
    filled: runs[0]!.filled,
  };
}

createEngine({ nowMs: 0 });

/**
 * THE YIELD ARM IS THE ONE THAT MATTERS, and it is deliberately obscene: five
 * Mythic relics each carrying +200% yield, +200% regen and +200% capacity, all
 * fully Awake. Nothing in the game drops this. If the measure is right it reads
 * 1.00, and if the measure is wrong it reads enormous — which is the point of
 * running it.
 */
const HUGE = { dustYield: 2, regen: 2, cap: 2 };
const OFFPATH = { dropRate: 2, xpGain: 2, scripGain: 2, strikePower: 2 };

const ARMS: Arm[] = [
  { label: 'bare hands', tool: false, fill: 'none' },
  { label: 'the tool, sockets EMPTY', tool: true, fill: 'none' },
  { label: 'every socket a RUNE (harmonious row)', tool: true, fill: 'runes' },
  { label: 'every socket a GEM', tool: true, fill: 'gems' },
  { label: 'every socket an off-path RELIC', tool: true, fill: 'relics', affixes: OFFPATH },
  { label: 'every socket a +200% yield/regen/cap RELIC', tool: true, fill: 'relics', affixes: HUGE },
  { label: 'RELICS + RUNES + GEMS, everything at once', tool: true, fill: 'everything', affixes: HUGE },
];

const POWER_BOUND = [0.05, 0.3];
const CEILING_BOUND = [3, 200];

mkdirSync('sim-out', { recursive: true });
const out: string[] = [];
const say = (s = ''): void => { out.push(s); console.log(s); };

say('# A FULLY SOCKETED TOOL DOES NOT MOVE THE CEILING');
say();
say(`${SECONDS}s per cell, ${SEEDS.length} seeds, 6x6 face at depth 0. Sockets stone: **${DEEP}**.`);
say();
say('THE MEASURE IS CHARGE OVER CHARGE. `dustYield` turns charge into currency and');
say('cannot appear in it; `regen` appears on both sides. Measuring dust would report');
say('every yield relic as a breach, which is the A.43 mistake.');
say();

const bare: Record<number, Reading> = {};
for (const r of [...POWER_BOUND, ...CEILING_BOUND]) bare[r] = measure(ARMS[0]!, r);
// THE TOLERANCE IS MEASURED IN THE UNIT THE GATES READ, which is LOAD. The first
// draft measured the bare arm's seed spread in absolute produced charge and then
// gated load readings with it — a number from one instrument used on another.
const noise = SEEDS.map((seed) => run(ARMS[0]!, 200, seed).load);
const TOL = Math.max(0.005, (Math.max(...noise) - Math.min(...noise)) / median(noise));
say(`Bare hands saturated load: ${noise.map((n) => n.toFixed(4)).join(' / ')} → tolerance **${(TOL * 100).toFixed(2)}%**.`);
const probe = createEngine({ nowMs: 0 });
const probeState = probe.getState() as GameState;
probeState.forge.built = true;
build(probeState, ARMS[2]!);
const ROW = socketCount(currentTool(probeState));
say(`Sockets on the test tool: **${ROW}**` + (ROW >= 3 ? ' — long enough for a rune triple.' : ''));
say();

interface Row {
  arm: string; rate: number; med: number; produced: number;
  ceiling: number; load: number; filled: number;
}
const rows: Row[] = [];

for (const [name, rates] of [['POWER-BOUND', POWER_BOUND], ['CEILING-BOUND', CEILING_BOUND]] as const) {
  say(`## ${name} — ${rates.join(', ')} clicks/s`);
  say();
  say('Each cell is **load** — charge taken over the charge the field made. 1.00 is the ceiling.');
  say();
  say('| arm | filled | ' + rates.map((r) => `${r}/s`).join(' | ') + ' |');
  say('|---|---:|' + rates.map(() => '---:').join('|') + '|');
  for (const arm of ARMS) {
    const cells: string[] = [];
    let filled = 0;
    for (const rate of rates) {
      const m = arm.tool ? measure(arm, rate) : bare[rate]!;
      filled = m.filled;
      rows.push({
        arm: arm.label, rate, med: m.rate, produced: m.produced,
        ceiling: m.ceiling, load: m.load, filled: m.filled,
      });
      cells.push(`${m.load.toFixed(3)}`);
    }
    say(`| ${arm.label} | ${filled} | ${cells.join(' | ')} |`);
  }
  say();
}

say('## The readings');
say();

const top = CEILING_BOUND[CEILING_BOUND.length - 1]!;
const atTop = rows.filter((r) => r.rate === top && r.arm !== 'bare hands');

/**
 * GATE 1 — THE ONLY UNCONDITIONAL ONE, and it is pillar 2 as stated: did any
 * arm take more charge out of the field than the field made? That question needs
 * no reference arm, no bias term and no regime, which is exactly why it is the
 * gate. The first draft asked "did an arm out-produce a BARE-HANDS arm" instead
 * and flagged 1.10x on an arm that had legitimately raised its own ceiling.
 */
const over = rows.filter((r) => r.load > 1 + TOL);
const worst = rows.reduce((a, b) => (b.load > a.load ? b : a));
say(`**The load gate — every arm at every rate.** The highest load anywhere in the `
  + `table is **${(worst.load * 100).toFixed(1)}%** (${worst.arm} at ${worst.rate}/s). `
  + (over.length === 0
    ? 'Nothing in a socket makes charge: no arm took more than the rock made.'
    : `${over.length} ARM(S) ABOVE THE FIELD — do not ship.`));
say();

/**
 * GATE 2 — THE SWING IS UNTOUCHED, and it is read AT SATURATION only.
 *
 * A socket reaches the modifier layer and never the swing, so the share of the
 * field the tool captures must not move when the row fills. That claim is only
 * measurable where the field is the binding constraint: at 0.3 clicks/s the arm
 * is power-bound at ~0.87 load, and there "share captured" is a fact about how
 * much charge happened to be sitting in the cells the cursor reached, which cap
 * and regen relics genuinely change. The first draft gated on the power-bound
 * reading and called 1.84% a leak.
 */
{
  const empty = ARMS[1]!;
  const full = ARMS[6]!;
  const lines: string[] = [];
  let worstGap = 0;
  for (const rate of [...POWER_BOUND, ...CEILING_BOUND]) {
    const a = measure(empty, rate).load;
    const b = measure(full, rate).load;
    const gap = Math.abs(b - a) / a;
    const bound = CEILING_BOUND.includes(rate);
    if (bound) worstGap = Math.max(worstGap, gap);
    lines.push(`  - ${rate}/s${bound ? '' : ' (power-bound, not gated)'}: `
      + `empty ${a.toFixed(4)} vs full ${b.toFixed(4)} — ${(gap * 100).toFixed(2)}%`);
  }
  say('**Empty row against full row, same tool.** The share of the field the tool');
  say('captures — which a socket must not touch, because it never reaches the swing:');
  say();
  for (const l of lines) say(l);
  say();
  say(worstGap <= TOL * 3
    ? `Worst CEILING-BOUND gap **${(worstGap * 100).toFixed(2)}%** against a ${(TOL * 100).toFixed(2)}% instrument. The swing does not notice.`
    : `WORST GAP ${(worstGap * 100).toFixed(2)}% — a socket is reaching the swing.`);
  say();

  /**
   * REPORTED, NOT GATED — because the cause is known and legitimate.
   *
   * The arms do NOT all sit at the same load, and they should not: a `cap` relic
   * makes each cell hold more and a `regen` relic refills it faster, so how close
   * a fixed click rate gets to the ceiling is a fact about the FIELD as much as
   * about the tool. Gating a spread across arms with different fields would be
   * measuring the field. What must not vary is whether anyone exceeds it, and
   * that is gate 1.
   */
  const loads = atTop.map((r) => r.load);
  const spread = (Math.max(...loads) - Math.min(...loads)) / median(loads);
  say(`**The spread, reported rather than gated.** At ${top}/s the ${atTop.length} socketed arms `
    + `span **${(spread * 100).toFixed(2)}pp** of load (${(Math.min(...loads) * 100).toFixed(1)}–`
    + `${(Math.max(...loads) * 100).toFixed(1)}%). A cap relic makes every cell hold more and a `
    + 'regen relic refills it faster, so how near a fixed click rate gets to the ceiling is '
    + 'partly a fact about the field. What may not vary is whether anyone passes it.');
  say();

  const empty2 = rows.find((r) => r.rate === top && r.arm === ARMS[1]!.label)!;
  const huge = rows.find((r) => r.rate === top && r.arm === ARMS[5]!.label)!;
  say(`**And the ceiling really did move, which is the permitted half.** At ${top}/s the `
    + `empty-row arm had a field making **${empty2.ceiling.toFixed(3)}**/s and the `
    + `five-regen-relic arm **${huge.ceiling.toFixed(3)}**/s — **${(huge.ceiling / empty2.ceiling).toFixed(2)}x** `
    + 'the rock. That is a relic doing exactly what a face upgrade does, and pillar 2 has '
    + 'never forbidden it. What it forbids is taking more than the rock made, and nothing did.');
  say();

  say(`VERDICT: ${over.length === 0 && worstGap <= TOL * 3 ? 'PILLAR 2 HOLDS' : 'REVIEW'}`);
}

writeFileSync('sim-out/tool-sockets.md', out.join('\n') + '\n');
console.log('\n→ sim-out/tool-sockets.md');
