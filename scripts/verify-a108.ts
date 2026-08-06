/**
 * A.108 DRIVEN IN THE REAL GAME.
 *
 *   A  OVERGROWN firing in a real Verdance run — and the reason, read live
 *   B  ...and healing on its own when nobody is clearing, which is the rule
 *   C  §55.4 on screen: it STOPS, it spreads one band, it traces to a first failure
 *   D  ...and HARVEST is the recovery, paying a strain that cannot be farmed
 *   E  the firing rate of every condition, per shell, from the sim
 *   F  the audit FAILING on a planted never-firing rule, then green again
 *   G  dpsMax unmoved at the SAME depth with every condition live
 *   H  §23's opening beats, on a state nothing has touched
 *   I  380px, 0 overflow, panels bounded, every row NAMED, 0 page errors
 *
 * NO NAMED FUNCTION MAY BE DECLARED INSIDE A `page.evaluate` BODY — esbuild's
 * `keepNames` rewrites `const f = () => {}` into `__name(...)`, which does not
 * exist in the page. It has cost ten runs across A.90–A.105.
 *
 *   npx tsx scripts/verify-a108.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { setup, tab, dismiss, SEL, hold } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots-a108';
const W = 380, H = 1700;

const problems: string[] = [];

function check<T>(actual: T, want: T, bad: T, label: string): void {
  if (JSON.stringify(bad) === JSON.stringify(want)) {
    console.log(`  VACUOUS  ${label} — the known-bad value equals the expected one`);
    problems.push(`${label} (vacuous)`);
    return;
  }
  const ok = JSON.stringify(actual) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    console.log(`        got  ${JSON.stringify(actual)}`);
    console.log(`        want ${JSON.stringify(want)}`);
    problems.push(label);
  }
}

/**
 * A VERDANCE PLANT AND A HAND THAT IS CLEARING. Nothing is held up the way
 * §55.1 needs a hot shaft held: a starved Bloom is the DEFAULT once machines
 * stand on it. What the loop DOES do is chip, because a face left alone vines
 * over and lifts the Bloom back above what the plant draws — which is block B.
 *
 * `chipCell` walks a cell that is not a pocket; `manualChip` refuses a pocket
 * outright, and a hand that swings at one forever was the harness bug this
 * phase opened with.
 */
const GREEN = `
  const s = engine.getState();
  s.shell.current = 'verdance';
  s.depthRecords['verdance'] = 400;
  s.depth = 100;
  s.kiln.built = true;
  s.plant.condition = {}; s.plant.dragged = {}; s.plant.broken = {}; s.plant.ripe = {};
  // ...AND THE PLANT AND THE BED. \`setup\` runs against the LIVE engine and does
  // not reload, so a block that only ADDS tiers inherits every machine the block
  // before it stood up — which is how a plant of six first measured as fourteen
  // overgrown. Each block earns its own state.
  s.plant.tiers = {};
  if (s.growth) {
    s.growth.stage = s.face.cells.map(() => 0);
    s.growth.age = s.face.cells.map(() => 0);
    s.growth.fullSince = s.face.cells.map(() => 0);
  }
  window.__probe.machines().forEach((id, i) => { s.plant.tiers[id] = 1; });
  for (let t = 0; t < 340; t++) {
    for (let k = 0; k < 4; k++) {
      let best = -1, bestCharge = 0;
      for (let i = 0; i < s.face.cells.length; i++) {
        if (s.face.ore && s.face.ore[i]) continue;
        if (s.face.cells[i] > bestCharge) { bestCharge = s.face.cells[i]; best = i; }
      }
      if (best >= 0 && bestCharge >= 1) engine.dispatch({ type: 'chip', cell: best });
    }
    engine.tick(1);
  }
`;

/**
 * ...and a plant NOBODY is clearing. The face vines over and the Bloom lifts.
 *
 * SIX MACHINES, not twenty-nine, and the number is measured rather than chosen.
 * A fully vined face is 36 vines — `PLANT_FLOOR` 2.4 plus 0.14 each — so a
 * cultivated Verdance covers a plant of about seven and no more. Six is inside
 * that; a 3h `--plant` run stands up ONE. Past the crossover a cultivated face
 * cannot cover the plant at all and the condition is permanent, which is
 * measured in block B2 rather than hidden by picking a kind number.
 */
const IDLE_N = 6;
const IDLE = `
  const s = engine.getState();
  s.shell.current = 'verdance';
  s.depthRecords['verdance'] = 400;
  s.depth = 100;
  s.kiln.built = true;
  s.plant.condition = {}; s.plant.dragged = {}; s.plant.broken = {}; s.plant.ripe = {};
  // ...AND THE PLANT AND THE BED. \`setup\` runs against the LIVE engine and does
  // not reload, so a block that only ADDS tiers inherits every machine the block
  // before it stood up — which is how a plant of six first measured as fourteen
  // overgrown. Each block earns its own state.
  s.plant.tiers = {};
  if (s.growth) {
    s.growth.stage = s.face.cells.map(() => 0);
    s.growth.age = s.face.cells.map(() => 0);
    s.growth.fullSince = s.face.cells.map(() => 0);
  }
  for (const id of window.__probe.machines().slice(0, ${IDLE_N})) s.plant.tiers[id] = 1;
  for (let t = 0; t < 340; t++) engine.tick(1);
`;

/** The same, one machine past what a cultivated face can carry. */
const IDLE_OVER = IDLE.replace(`slice(0, ${IDLE_N})`, `slice(0, ${IDLE_N + 6})`);

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

  // ═══ H — §23, READ FIRST, BEFORE ANYTHING HAS TOUCHED THE STATE ═══════════
  // Out of order on purpose: the opening is only the opening on a state nothing
  // has written to, so it is read before any block sets one up.
  console.log('\n== H — §23, on a state nothing has touched =====================');
  await dismiss(page);
  const open = await page.evaluate(() => {
    const s = (window as unknown as Record<string, any>)['__engine'].getState();
    return {
      cells: s.face.w * s.face.h, depth: s.depth, kiln: s.kiln.built,
      broken: Object.keys(s.plant?.broken ?? {}).length,
      conditioned: Object.keys(s.plant?.condition ?? {}).length,
    };
  });
  check(open.cells, 36, 0, 'H1 §23 opens on 36 cells');
  check(open.depth, 0, 1, 'H2 §23 opens at depth 0');
  check(open.kiln, false, true, 'H3 ...and with no Kiln');
  check(open.broken, 0, 1, 'H4 ...nothing is broken on the first screen');
  check(open.conditioned, 0, 1, 'H5 ...and no machine is under a condition');

  // ═══ A — OVERGROWN, FIRING, IN A RUN ══════════════════════════════════════
  console.log('\n== A — the green gets in, and the panel says why ===============');
  await setup(page, GREEN);
  await tab(page, 'kiln');
  await dismiss(page);
  const green = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    const ids = w['__probe']['machines']() as string[];
    const under = ids.filter((id) => (w['__probe']['condition'](s, id) ?? {})['id'] === 'overgrown');
    const short = ids.filter((id) => (w['__probe']['served'](s, id) as number) < 1);
    return {
      under: under.length, short: short.length, total: ids.length,
      // The reason, read LIVE off the same function the rule reads.
      worst: Math.min(...ids.map((id) => w['__probe']['served'](s, id) as number)),
      level: Math.max(...ids.map((id) => ((w['__probe']['condition'](s, id) ?? {})['level'] as number) ?? 0)),
    };
  });
  console.log(`  ${green.under}/${green.total} machines overgrown · ${green.short} short of Flow · worst served ${green.worst.toFixed(3)}`);
  check(green.under > 0, true, false, 'A1 OVERGROWN is written in a real Verdance run');
  check(green.short > 0, true, false, 'A2 ...because the Bloom cannot cover what is built');
  check(green.worst < 1, true, false, 'A3 ...and the supply ratio says so, read live');
  check(green.level, 1, 0, 'A4 ...and it reached full, not a flicker');
  await page.screenshot({ path: `${OUT}/a-overgrown-380.png`, fullPage: true });

  // ═══ B — ...AND IT LETS GO WHEN NOBODY IS CLEARING ════════════════════════
  console.log('\n== B — an idle Verdance heals itself, which IS the rule ========');
  await setup(page, IDLE);
  await tab(page, 'kiln');
  await dismiss(page);
  const idle = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    const ids = w['__probe']['machines']() as string[];
    return {
      under: ids.filter((id) => (w['__probe']['condition'](s, id) ?? {})['id'] === 'overgrown').length,
      vined: (s.growth?.stage ?? []).filter((x: number) => x > 0).length,
      worst: Math.min(...ids.map((id) => w['__probe']['served'](s, id) as number)),
    };
  });
  console.log(`  ${idle.vined} cells vined over · worst served ${idle.worst.toFixed(3)} · ${idle.under} overgrown`);
  check(idle.vined > 0, true, false, 'B1 an uncleared face vines over');
  check(idle.worst, 1, 0.5, 'B2 ...which lifts the Bloom back over what the plant draws');
  check(idle.under, 0, 1, 'B3 ...and nothing is overgrown. Clearing writes it; letting be clears it');

  /**
   * ...AND THE OTHER SIDE OF THE CROSSOVER, stated rather than avoided. Past
   * about seven machines a fully cultivated face cannot cover the plant, so the
   * condition does not let go however long you leave it. That is the rule's
   * pressure working — build past what the Bloom can feed and the green takes
   * it — but it is a real edge and it is measured here, not assumed away.
   */
  await setup(page, IDLE_OVER);
  await tab(page, 'kiln');
  await dismiss(page);
  const over = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    const ids = w['__probe']['machines']() as string[];
    return {
      under: ids.filter((id) => (w['__probe']['condition'](s, id) ?? {})['id'] === 'overgrown').length,
      vined: (s.growth?.stage ?? []).filter((x: number) => x > 0).length,
      worst: Math.min(...ids.map((id) => w['__probe']['served'](s, id) as number)),
    };
  });
  console.log(`  a plant of ${IDLE_N + 6}: ${over.vined} vined, worst served ${over.worst.toFixed(3)}, ${over.under} overgrown`);
  check(over.under > 0, true, false, 'B4 past the crossover a cultivated face cannot cover it, and it stays');
  check(over.worst < 1, true, false, 'B5 ...because the vines have run out of Bloom to give');

  // ═══ C — §55.4 ON SCREEN ══════════════════════════════════════════════════
  console.log('\n== C — WHAT GREW IN THE WASHER, on screen ======================');
  await setup(page, GREEN);
  await tab(page, 'kiln');
  await dismiss(page);
  const grew = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    const broken = w['__probe']['broken'](s) as Record<string, { id: string }>;
    const dragged = Object.keys(s.plant?.dragged ?? {});
    const ids = Object.keys(broken);
    return {
      kinds: [...new Set(Object.values(broken).map((b) => b.id))],
      count: ids.length,
      stopped: ids.filter((id) => w['__probe']['stopped'](s, id)).length,
      dragged: dragged.length,
      // Every drag: one band along, and walking back reaches a machine nobody
      // handed to. There is more than one head here and that is the rule's shape.
      hops: [...new Set(dragged.map((id) => Math.abs(
        (w['__probe']['band'](s, id) as number)
        - (w['__probe']['band'](s, (s.plant.dragged[id] || {}).from) as number))))],
      headsBroken: dragged.every((id) => {
        const chain = w['__probe']['chain'](s, id) as string[];
        return (w['__probe']['condition'](s, chain[0]) ?? null) !== null;
      }),
    };
  });
  console.log(`  ${grew.count} broken ${JSON.stringify(grew.kinds)} · ${grew.stopped} stopped · ${grew.dragged} dragged · hops ${JSON.stringify(grew.hops)}`);
  check(grew.kinds, ['overgrowth'], [], 'C1 §55.4 fired, and only §55.4');
  check(grew.stopped, grew.count, 0, 'C2 ...and every one of them STOPPED');
  check(grew.dragged > 0, true, false, 'C3 the vines spread');
  check(grew.hops, [1], [0], 'C4 ...exactly one band along, never the same band');
  check(grew.headsBroken, true, false, 'C5 ...and every drag walks back to a first failure');

  const said = await page.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll('[data-testid^="broke-"]'));
    const harvest = Array.from(document.querySelectorAll('[data-testid^="harvest-"]'));
    return {
      text: (boxes[0]?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      boxes: boxes.length,
      buttons: harvest.length,
      label: (harvest[0]?.textContent ?? '').trim(),
    };
  });
  console.log(`  the panel says: ${said.text.slice(0, 150)}`);
  check(said.boxes > 0, true, false, 'C6 the panel shows what broke');
  check(/[Bb]loom/.test(said.text), true, false, 'C7 ...and names the reason, not just the effect');
  check(/[Hh]arvest/.test(said.text), true, false, 'C8 ...and says what to do about it');
  check(said.buttons > 0, true, false, 'C9 ...with a button that does it');
  await page.screenshot({ path: `${OUT}/c-overgrowth-380.png`, fullPage: true });
  for (const sel of ['condition-panel']) {
    const el = page.locator(`[data-testid="${sel}"]`).first();
    if (await el.count()) await el.screenshot({ path: `${OUT}/c-panel.png` }).catch(() => {});
  }
  const brokeEl = page.locator('[data-testid^="broke-"]').first();
  if (await brokeEl.count()) await brokeEl.screenshot({ path: `${OUT}/c-broke-block.png` }).catch(() => {});

  // ═══ D — THE FIX IS THE REWARD ════════════════════════════════════════════
  console.log('\n== D — harvest it, and keep what grew ==========================');
  const harvested = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    const id = Object.keys(w['__probe']['broken'](s))[0];
    const before = (s.cultivar?.cropped ?? []).length;
    const r = w['__engine'].dispatch({ type: 'harvestMachine', machineId: id });
    const n = w['__engine'].getState();
    return {
      id, ok: Boolean(r?.ok), reason: String(r?.reason ?? ''),
      strain: (r?.data ?? {}).strainId ?? null,
      before, after: (n.cultivar?.cropped ?? []).length,
      stillBroken: Object.keys(w['__probe']['broken'](n)).length,
      stopped: w['__probe']['stopped'](n, id),
    };
  });
  console.log(`  harvested ${harvested.id} -> strain ${harvested.strain} · cropped ${harvested.before} -> ${harvested.after}`);
  check(harvested.ok, true, false, 'D1 the harvest was accepted');
  check(harvested.after, harvested.before + 1, harvested.before, 'D2 ...and paid one strain into the Codex');
  check(harvested.strain !== null, true, false, 'D3 ...and said which');
  check(harvested.stopped, false, true, 'D4 ...and the machine runs again');

  // ...and it CANNOT be farmed. Same verb, on a save that knows every strain.
  const farmed = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    const id = Object.keys(w['__probe']['broken'](s))[0];
    if (id === undefined) return { skipped: true, ok: false, strain: null, after: 0, known: 0 };
    // Everything this save could ever find, already found.
    s.cultivar.cropped = [...new Set([...s.cultivar.cropped, 'creeper', 'hardwood', 'lantern', 'hollowreed'])];
    const full = s.cultivar.cropped.length;
    const r = w['__engine'].dispatch({ type: 'harvestMachine', machineId: id });
    const n = w['__engine'].getState();
    return {
      skipped: false, ok: Boolean(r?.ok), strain: (r?.data ?? {}).strainId ?? null,
      after: (n.cultivar?.cropped ?? []).length, known: full,
    };
  });
  if (farmed.skipped) {
    console.log('  (only one machine broke — the farming check needs a second, skipped)');
  } else {
    console.log(`  a save holding ${farmed.known} strains harvests again -> ${JSON.stringify(farmed.strain)}`);
    check(farmed.ok, true, false, 'D5 a save that knows every strain still fixes its machine');
    check(farmed.after, farmed.known, farmed.known + 1, 'D6 ...and the Codex does not grow past its registry');
  }

  // ═══ E — THE RATE OF EVERY RULE, PER SHELL ════════════════════════════════
  console.log('\n== E — what each rule managed in a real run ====================');
  /**
   * ONE ARM PER SHELL, and the row that counts is the arm's OWN rule. Every arm
   * prints all five rules, so a flat scan of the file collects the shells a run
   * merely passed through and reads their low rates as the shell's own — which
   * is how the first cut of this block counted seven rules out of five.
   */
  const cond = readFileSync('sim-out/a108-cond-3h.md', 'utf8');
  const own: { shell: string; rule: string; resident: number; writes: string; bites: string }[] = [];
  for (const block of cond.split(/^=== /m).slice(1)) {
    const arm = block.slice(0, block.indexOf(' '));
    for (const m of block.matchAll(/^ {2}(\w+) +(\w+) +resident +(\d+)s +writes +(<?[\d.]+)% +bites +(<?[\d.]+)%/gm)) {
      if (m[1] !== arm || ownShell(m[2]!) !== arm) continue;
      own.push({ shell: m[1]!, rule: m[2]!, resident: Number(m[3]), writes: m[4]!, bites: m[5]! });
    }
  }
  for (const r of own) {
    console.log(`  ${r.shell.padEnd(10)} ${r.rule.padEnd(11)} resident ${String(r.resident).padStart(5)}s  writes ${r.writes.padStart(5)}%  bites ${r.bites.padStart(5)}%`);
  }
  check(own.length, 5, 0, 'E1 all five rules were measured in their own shell');
  check(own.filter((r) => Number(r.writes.replace('<', '')) > 0).length, 5, 0, 'E2 ...every one of them WROTE');
  check(own.filter((r) => Number(r.bites.replace('<', '')) > 0).length, 5, 0, 'E3 ...and every one of them BIT');

  // ═══ G — PILLAR 2 ═════════════════════════════════════════════════════════
  console.log('\n== G — dpsMax at ONE depth, with every condition live ==========');
  const ceiling = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    s.depth = 30;
    s.plant.condition = {}; s.plant.broken = {}; s.plant.dragged = {};
    w['__engine'].tick(0.001);
    const cleanDps = w['__probe']['dps']();
    // Every rule, at full, on every machine — the same depth, nothing else moved.
    for (const id of w['__probe']['machines']()) {
      s.plant.condition[id] = { id: 'overgrown', level: 1, seized: true, fullFor: 999 };
    }
    w['__engine'].tick(0.001);
    const writtenDps = w['__probe']['dps']();
    return { cleanDps, writtenDps, depth: s.depth };
  });
  console.log(`  depth ${ceiling.depth}: ${ceiling.cleanDps} clean · ${ceiling.writtenDps} with the table written`);
  check(ceiling.writtenDps, ceiling.cleanDps, 'moved', 'G1 dpsMax is bit-identical at the same depth');

  // ═══ I — THE SHAPE ════════════════════════════════════════════════════════
  console.log('\n== I — 380px, bounded, named ===================================');
  await setup(page, GREEN);
  await tab(page, 'kiln');
  await dismiss(page);
  const shape = await page.evaluate(() => {
    const de = document.documentElement;
    const panel = document.querySelector('[data-testid="condition-panel"]') as HTMLElement | null;
    const list = Array.from(document.querySelectorAll(
      '[data-testid^="broke-"], [data-testid^="drag-"], [data-testid^="ripe-"], [data-testid^="harvest-"]'));
    return {
      overflow: de.scrollWidth - de.clientWidth,
      panelH: panel ? Math.round(panel.getBoundingClientRect().height) : -1,
      rows: list.length,
      unnamed: list.filter((r) => (r.textContent ?? '').replace(/\s+/g, ' ').trim().length < 6).length,
      doubled: list.filter((r) => /\bthe [Tt]he\b/.test(r.textContent ?? '')).length,
      midCaps: list.filter((r) => /\b(at|beside|than|from)\s+The\b/.test(r.textContent ?? '')).length,
      dashOnly: list.filter((r) => /(^|\s)—\s*(m|%)?\s*$/.test((r.textContent ?? '').trim())).length,
    };
  });
  console.log(`  overflow ${shape.overflow}px · panel ${shape.panelH}px · ${shape.rows} rows`);
  check(shape.overflow, 0, 12, 'I1 0 horizontal overflow at 380px');
  check(shape.rows > 0, true, false, 'I2 the panel has rows to check');
  check(shape.unnamed, 0, 1, 'I3 every row says something');
  check(shape.doubled, 0, 1, 'I4 ...and no row says "the The"');
  check(shape.midCaps, 0, 1, 'I5 ...nor "at The Washer" mid-sentence');
  check(shape.dashOnly, 0, 1, 'I6 ...and none is a bare dash with a unit after it');
  await page.screenshot({ path: `${OUT}/i-plant-380.png`, fullPage: true });

  // The face, to prove nothing new mounted on it.
  await tab(page, 'dig');
  await dismiss(page);
  await hold(page, SEL.descend, 200).catch(() => false);
  await page.screenshot({ path: `${OUT}/i-face-380.png`, fullPage: true });
  check(errors.length, 0, 1, 'I7 0 page errors across the whole run');
  if (errors.length) console.log('  ' + errors.slice(0, 5).join('\n  '));

  // ═══ F — THE AUDIT, FAILING ON A RULE THAT CANNOT FIRE ════════════════════
  /**
   * LAST, because it EDITS A SOURCE FILE and the dev server is watching: the
   * restore reloads the page mid-run and every later `page.evaluate` dies with
   * "execution context was destroyed". Found by it happening.
   *
   * THE ANCHOR IS THE PREDICATE, NOT THE TEXT. The first cut planted
   * `'flowSatisfaction(s, id) < 1'` and the audit stayed green — because the
   * A.108 rationale comment above the rule QUOTES the predicate verbatim, so
   * `String.replace` rewrote the COMMENT and left the rule alone. That is the
   * brief's own warning ("a ledger probe that greps a comment reads a rewording
   * as a fix") landing on the instrument written to catch it. So this anchors on
   * `writing:`, and refuses to draw a conclusion if the anchor is not unique.
   */
  console.log('\n== F — the gate: plant a dead rule, the build must break =======');
  const RULE = 'src/engine/systems/condition.ts';
  const ANCHOR = 'writing: (s, id) => flowSatisfaction(s, id) < 1';
  copyFileSync(RULE, `${OUT}/condition.bak`);
  let planted = '';
  let anchored = 0;
  try {
    const src = readFileSync(RULE, 'utf8');
    anchored = src.split(ANCHOR).length - 1;
    writeFileSync(RULE, src.replace(ANCHOR, 'writing: (s, id) => flowSatisfaction(s, id) < 0'));
    try {
      execFileSync('npx', ['tsx', 'scripts/audit-reach.ts'], { encoding: 'utf8', shell: process.platform === 'win32' });
      planted = 'PASSED';
    } catch (e: unknown) {
      planted = String((e as { stdout?: string }).stdout ?? '');
    }
  } finally {
    copyFileSync(`${OUT}/condition.bak`, RULE);
  }
  check(anchored, 1, 0, 'F0 the planted edit hit the predicate, and exactly once');
  check(/CANNOT BE WRITTEN/.test(planted), true, false, 'F1 a planted never-firing rule FAILS the audit');
  check(planted === 'PASSED', false, true, 'F2 ...and it is a build failure, not a printed note');
  const clean = execFileSync('npx', ['tsx', 'scripts/audit-reach.ts'], {
    encoding: 'utf8', shell: process.platform === 'win32',
  });
  for (const line of clean.split('\n').filter((l) => /writes with/.test(l))) console.log('  ' + line.trim());
  check(/0 UNREACHABLE OR UNAUDITED/.test(clean), true, false, 'F3 ...and the real tree is green again');

  console.log(`\nscreenshots -> ${OUT}`);
  console.log(problems.length === 0 ? '\nALL PASS' : `\n${problems.length} PROBLEM(S):\n  ${problems.join('\n  ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

/** Which shell each rule belongs to — read from the id, not a table to drift. */
function ownShell(ruleId: string): string {
  return ({
    baked: 'cinder', overgrown: 'verdance', unlit: 'glassmere',
    undecided: 'hollow', magnetised: 'ferrite',
  } as Record<string, string>)[ruleId] ?? '';
}

main().catch((e) => { console.error(e); process.exit(1); });
