/**
 * THE NEW FORGE, STEP 3 — DRIVEN IN THE REAL GAME.
 *
 * Mine with the hands, mine with a tool, wear it down to broken, mine with it
 * broken, repair it. Every number is read off live state after a real dispatch
 * through the real engine tick; nothing is stipulated but the Hold, the Forge
 * being raised, and which tool is fitted.
 *
 * THE CLICK RATE MATTERS AND IS NOT ARBITRARY. A 6x6 cell refills in 100s and
 * the face cycles in 36/rate seconds, so above ~0.36 clicks/s bare hands
 * already take every grain the field grows and NO tool can help (that is
 * pillar 2, measured in sim-tool-ceiling.md). The comparison below therefore
 * runs where there is something to win.
 *
 *   npx tsx scripts/verify-tool.ts [port] [outDir]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5174';
const OUT = process.argv[3] ?? 'sim-out/shots';
const W = 380, H = 900;

const problems: string[] = [];
const shots: string[] = [];
const check = (ok: boolean, label: string, detail = ''): boolean => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(`${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

/**
 * WAIT FOR THE TOASTS TO GO. Driving hundreds of swings through the real engine
 * sets off achievements and first-find cards, and they stack over the middle of
 * the panel — the first pass of this produced two deliverable screenshots that
 * were mostly toast. They fade on their own; `dismiss` does not touch them
 * because they are not modal and there is nothing to click.
 */
async function settle(page: Page): Promise<void> {
  for (let i = 0; i < 30; i++) {
    if (await page.locator('.toast-in').count() === 0) return;
    await page.waitForTimeout(400);
  }
}

async function shot(page: Page, name: string, to?: string): Promise<void> {
  await dismiss(page);
  await settle(page);
  if (to) {
    await page.locator(to).first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: `${OUT}/tool-${name}.png` });
  shots.push(`${OUT}/tool-${name}.png`);
}

const txt = async (page: Page, sel: string): Promise<string> =>
  (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

/** Fit a tool of one material (or bare hands) through the live engine. */
async function fit(page: Page, materialId: string | null): Promise<void> {
  await page.evaluate(async ({ id }) => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const s = w['__engine'].getState();
    s.casting.tool = id === null
      ? []
      : cp.PART_TYPES.map((t: string, i: number) => ({ ...fp.makePart(t, id, 60), id: i + 1 }));
    s.casting.wear = 0;
  }, { id: materialId });
  await page.waitForTimeout(200);
}

/**
 * Mine for `seconds` at `clicksPerSec` through the REAL loop, and report the
 * charge the field actually gave up. Wear is left running — this is play.
 */
async function mine(page: Page, seconds: number, clicksPerSec: number): Promise<number> {
  return page.evaluate(async ({ secs, rate }) => {
    const w = window as unknown as Record<string, any>;
    const e = w['__engine'];
    const s = e.getState();
    s.face.cells = s.face.cells.map(() => 8);
    const cells = s.face.cells.length;
    const start = s.stats.fieldChargeHarvested.toNumber();
    let debt = 0;
    let cursor = 0;
    for (let t = 0; t < secs * 10; t++) {
      e.dispatch({ type: 'debug', op: 'warp', seconds: 0.1 });
      debt += rate * 0.1;
      while (debt >= 1) { e.dispatch({ type: 'chip', cell: cursor % cells }); cursor++; debt -= 1; }
    }
    return e.getState().stats.fieldChargeHarvested.toNumber() - start;
  }, { secs: seconds, rate: clicksPerSec });
}

const MINE_SECS = 300;
const RATE = 0.1; // one tap every ten seconds — below the crossover

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: W, height: H }, reducedMotion: 'no-preference' });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  const recovered: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (t.includes('render recovered')) { recovered.push(t.slice(0, 120)); return; }
    problems.push(`[console] ${t.slice(0, 200)}`);
  });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await setup(page, `engine.getState().forge.built = true;`);
  await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const s = w['__engine'].getState();
    for (const id of ['marl', 'graveclay', 'umberjade', 'firstiron']) forge.addMaterial(s, id, 60, 80);
  });

  // ═══ A. BARE HANDS ARE UNCHANGED, AND THE STRIP STAYS AWAY ══════════════
  console.log('\nA — bare hands');
  await fit(page, null);
  await tab(page, 'dig');
  await dismiss(page);
  check(await page.locator('[data-testid="in-hand"]').count() === 0,
    'no tool, no strip — bare hands are a complete way to play');
  /**
   * THE BASELINE IS SAMPLED, AND THE SPREAD IS THE TOLERANCE.
   *
   * A 300s mining run is not a precise instrument — ore pockets spawn on a die
   * roll and a pocket is a richer cell — so two identical runs differ by a few
   * percent. The first cut of this compared a broken tool against a single bare
   * sample with a hand-picked 0.98 tolerance, and flagged a 0.96 as a
   * regression when a broken Loam tool is MECHANICALLY IDENTICAL to bare hands
   * (`cells: 1`, so its splash never applies). Measure the noise, then judge
   * against it.
   */
  const bareRuns = [
    await mine(page, MINE_SECS, RATE),
    await mine(page, MINE_SECS, RATE),
    await mine(page, MINE_SECS, RATE),
  ];
  const bare = bareRuns.reduce((a, b) => a + b, 0) / bareRuns.length;
  const noise = Math.max(...bareRuns) / Math.min(...bareRuns);
  console.log(`    bare hands: ${bareRuns.map((r) => r.toFixed(1)).join(', ')} charge `
    + `in ${MINE_SECS}s at ${RATE}/s  (mean ${bare.toFixed(1)}, noise ${((noise - 1) * 100).toFixed(1)}%)`);
  check(bare > 0, 'and they still mine', `${bare.toFixed(1)} charge`);
  await shot(page, '1-bare-hands');

  // ═══ B. A TOOL IS FASTER ════════════════════════════════════════════════
  console.log('\nB — the same rock, with a tool in hand');
  await fit(page, 'firstiron');
  await tab(page, 'dig');
  await dismiss(page);
  check(await page.locator('[data-testid="in-hand"]').count() === 1,
    'the strip appears where you mine, not only where tools are made');
  const strip = await txt(page, '[data-testid="in-hand"]');
  console.log(`    strip: ${strip}`);
  check(/\d+ cells/.test(strip), 'and says what the tool reaches', strip);

  const withTool = await mine(page, MINE_SECS, RATE);
  const gain = withTool / bare;
  console.log(`    with tool:  ${withTool.toFixed(1)} charge  →  ${gain.toFixed(2)}x bare hands`);
  check(gain > 1.4, 'a tool is meaningfully better than bare clicking — far outside the noise',
    `${gain.toFixed(2)}x, noise ${((noise - 1) * 100).toFixed(1)}%`);
  await shot(page, '2-in-hand', '[data-testid="in-hand"]');

  await tab(page, 'casting');
  await dismiss(page);
  const face = await txt(page, '[data-testid="at-the-face"]');
  console.log(`    ${face}`);
  // Case-insensitive: the label is CSS-uppercased, and `innerText` returns what
  // is rendered, not what is in the source.
  check(/vs bare hands/i.test(face) && / \/ 1\b/.test(face),
    'the panel compares against bare hands, not just its own numbers');
  check(await page.locator('[data-testid="durability"]').count() > 0, 'and durability is on screen');
  const cond = await txt(page, '[data-testid="durability-state"]');
  check(/swings left/.test(cond), 'with the swings it has left', cond);
  await shot(page, '3-at-the-face', '[data-testid="at-the-face"]');

  // ═══ C. BRITTLE WEARS FASTER THAN TOUGH ═════════════════════════════════
  console.log('\nC — the maintenance tradeoff');
  const wearRun = async (mat: string): Promise<{ uses: number; worn: string }> => {
    await fit(page, mat);
    return page.evaluate(async ({ }) => {
      const w = window as unknown as Record<string, any>;
      const c = await import(/* @vite-ignore */ '/src/engine/systems/casting' + '.ts');
      const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMining' + '.ts');
      const s = w['__engine'].getState();
      const tool = c.currentTool(s);
      return { uses: tm.usesOf(tool), worn: tm.wornPart(tool) };
    }, {});
  };
  const tough = await wearRun('graveclay');   // dense/tough
  const brittle = await wearRun('umberjade'); // brittle/charged
  console.log(`    graveclay (dense/tough):    ${tough.uses} swings`);
  console.log(`    umberjade (brittle/charged): ${brittle.uses} swings`);
  check(tough.uses > brittle.uses * 1.8,
    'a brittle tool needs seeing to about twice as often',
    `${tough.uses} vs ${brittle.uses}`);

  // ═══ D. WEAR IT TO BROKEN, IN PLAY ══════════════════════════════════════
  console.log('\nD — wear it right through');
  await fit(page, 'umberjade');
  await tab(page, 'casting');
  await dismiss(page);
  const fresh = await txt(page, '[data-testid="durability-state"]');
  const swings = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const e = w['__engine'];
    const s = e.getState();
    s.face.cells = s.face.cells.map(() => 8);
    let n = 0;
    for (let i = 0; i < 4000; i++) {
      e.dispatch({ type: 'chip', cell: i % s.face.cells.length });
      n++;
      if (i % 40 === 0) e.dispatch({ type: 'debug', op: 'warp', seconds: 1 });
      const c = await import(/* @vite-ignore */ '/src/engine/systems/casting' + '.ts');
      const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMining' + '.ts');
      if (tm.isBroken(e.getState(), c.currentTool(e.getState()))) break;
    }
    return n;
  });
  await page.waitForTimeout(400);
  const brokeState = await txt(page, '[data-testid="durability-state"]');
  console.log(`    ${fresh}  →  ${swings} swings  →  ${brokeState}`);
  check(brokeState === 'BROKEN', 'it breaks, in play, from real swings', brokeState);
  check(await page.locator('[data-testid="broken-note"]').count() > 0,
    'and the panel says it is not lost');
  const note = await txt(page, '[data-testid="broken-note"]');
  check(/still works/.test(note), 'in those words', note);
  await shot(page, '4-broken', '[data-testid="durability"]');

  // STILL USABLE, AND STILL AHEAD OF THE HANDS.
  const brokenMine = await mine(page, MINE_SECS, RATE);
  console.log(`    broken tool: ${brokenMine.toFixed(1)} charge vs bare ${bare.toFixed(1)} (mean of 3)`);
  check(brokenMine > 0, 'a broken tool still mines');
  check(brokenMine >= bare / noise,
    'and mines at bare-hands rate or better, within the measured noise',
    `${(brokenMine / bare).toFixed(2)}x bare, noise band ${(1 / noise).toFixed(2)}x`);
  const brokenEffect = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const c = await import(/* @vite-ignore */ '/src/engine/systems/casting' + '.ts');
    const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMining' + '.ts');
    const s = w['__engine'].getState();
    const tool = c.currentTool(s);
    return { whole: tm.effectOf(tool, false), bust: tm.effectOf(tool, true) };
  });
  const b = brokenEffect.bust;
  console.log(`    whole ${brokenEffect.whole.cells} cells → broken ${b.cells} cells, `
    + `${(b.splash * 100).toFixed(0)}% splash, ${b.oreRate.toFixed(1)}x ore`);
  check(b.cells < brokenEffect.whole.cells, 'it is genuinely penalised');
  // THE EXACT VERSION of "never worse than bare hands" — noise-free, because it
  // reads the effect rather than the outcome of a 300s run.
  check(b.cells >= 1 && b.splash >= 0 && b.oreRate >= 1 && b.dropWeight >= 1,
    'and on EVERY axis it is at or above bare hands — a cost, not a punishment',
    `${b.cells} cells, ${b.oreRate.toFixed(1)}x ore, ${b.dropWeight.toFixed(2)}x drops`);

  // ═══ E. REPAIR ══════════════════════════════════════════════════════════
  console.log('\nE — put it right');
  await tab(page, 'casting');
  await dismiss(page);
  const repairLabel = await txt(page, '[data-testid="repair"]');
  console.log(`    ${repairLabel}`);
  check(/Re-seat the/.test(repairLabel), 'the repair names the part and its price', repairLabel);
  const held = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const f = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    return f.materialCount(w['__engine'].getState(), 'umberjade');
  });
  await page.locator('[data-testid="repair"]').click();
  await page.waitForTimeout(400);
  const after = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const f = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const s = w['__engine'].getState();
    return { mats: f.materialCount(s, 'umberjade'), wear: s.casting.wear, repairs: s.casting.repairs };
  });
  const cond2 = await txt(page, '[data-testid="durability-state"]');
  console.log(`    umberjade ${held} → ${after.mats}, condition now: ${cond2}`);
  check(after.mats < held, 'repair eats material — maintenance is a sink', `${held} → ${after.mats}`);
  check(cond2 !== 'BROKEN', 'and the tool is working again', cond2);
  check(after.repairs === 1, 'the bench counted it');
  await shot(page, '5-repaired', '[data-testid="durability"]');

  // ═══ F. THE FRAME ═══════════════════════════════════════════════════════
  console.log('\nF — the frame');
  const px = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(px === 0, `no horizontal overflow at ${W}px`, `${px}px`);
  await tab(page, 'dig');
  await dismiss(page);
  const px2 = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(px2 === 0, 'nor on the Face, with the strip in place', `${px2}px`);

  await browser.close();
  console.log(`\nshots: ${shots.length}`);
  for (const s of shots) console.log(`  ${s}`);
  if (recovered.length > 0) console.log(`\n${recovered.length} recovered frame(s) — the guard working`);
  if (problems.length > 0) {
    console.log(`\n${problems.length} PROBLEM(S):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  console.log('\nall checks passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
