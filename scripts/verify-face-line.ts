/**
 * THE FACE'S TEACHING LINE, VERIFIED IN PLAY.
 *
 * Hand-chipping is the only route to c>=14 and c>=20 for anybody (machines never
 * compact, ruled permanent), and a greedy hand reaches neither in eighteen
 * simulated hours. So this one sentence carries a third of the material economy.
 *
 * Every assertion is red-tested: `check` rejects a known-bad value before it
 * accepts the real one, and reports VACUOUS if the two are equal.
 *
 *   npx tsx scripts/verify-face-line.ts [port]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = `http://localhost:${process.argv[2] ?? '5173'}`;
const OUT = 'sim-out/shots-face-line';
const problems: string[] = [];

function check<T>(actual: T, want: T, bad: T, label: string): void {
  if (JSON.stringify(bad) === JSON.stringify(want)) {
    console.log(`  VACUOUS  ${label} — the known-bad value equals the expected one`);
    problems.push(`${label} (vacuous)`);
    return;
  }
  const ok = JSON.stringify(actual) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} — got ${JSON.stringify(actual)},`
    + ` want ${JSON.stringify(want)} (red against ${JSON.stringify(bad)})`);
  if (!ok) problems.push(label);
}

async function dismissGate(page: Page): Promise<void> {
  const gate = page.locator('[role="dialog"][aria-label="New systems opened"] button').last();
  for (let i = 0; i < 3 && await gate.count() > 0; i++) {
    await gate.click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(400);
  }
}

/**
 * Whatever the Face room is currently telling the player — THE SENTENCE, not
 * the block it sits in. The first cut returned the whole matched element's
 * innerText, which on a phone layout swept up the room header, the Kiln card
 * and an upgrade cost; the LAW 3 check then found "8" and "20" in *that* and
 * reported a leak the line does not have. A check on a bigger string than the
 * claim is a check on the wrong thing.
 */
const hint = (page: Page): Promise<string> => page.evaluate(() => {
  const RE = /(The rock remembers the cell[^\n]*|Tap the rock[^\n]*|You can afford your first upgrade[^\n]*|You have enough to raise the Kiln[^\n]*)/;
  for (const n of document.querySelectorAll('p, div')) {
    const m = RE.exec((n as HTMLElement).innerText ?? '');
    if (m) return m[1]!.trim();
  }
  return '';
});

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 380, height: 900 }, isMobile: true, hasTouch: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    (window as never as Record<string, unknown>)['__name'] = (f: unknown) => f;
  });
  await page.goto(URL);
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForTimeout(3000);
  await dismissGate(page);

  const stage = (fn: string): Promise<void> => page.evaluate((which) => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown };
    const s = e.getState() as unknown as {
      maxDepthRecord: number; kiln: { built: boolean };
      face: { cells: number[]; compaction?: number[] };
      reading?: { tally: Record<string, number> };
    };
    s.reading ??= { notes: [], proven: [], working: null, tally: {} } as never;
    s.reading.tally = {};
    s.face.compaction = s.face.cells.map(() => 0);
    if (which === 'opening') { s.maxDepthRecord = 0; s.kiln.built = false; }
    if (which === 'unworked') { s.maxDepthRecord = 3; s.kiln.built = true; }
    if (which === 'worked') {
      s.maxDepthRecord = 3; s.kiln.built = true;
      s.face.compaction[4] = 5;
    }
    if (which === 'understood') {
      s.maxDepthRecord = 3; s.kiln.built = true;
      s.face.compaction[4] = 9;
      s.reading.tally['gates'] = 1;
    }
    e.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1 });
  }, fn);

  console.log('A — where it reads in the first 45 minutes');
  await stage('opening'); await page.waitForTimeout(900);
  const opening = await hint(page);
  console.log(`      opening        : "${opening}"`);
  check(/tap the rock|first upgrade/i.test(opening), true, false,
    "§23's opening beats still own the screen before the first descent");

  await stage('unworked'); await page.waitForTimeout(900);
  const unworked = await hint(page);
  console.log(`      rock unmarked  : "${unworked}"`);
  check(/remembers the cell/i.test(unworked), false, true,
    'silent while no cell carries a number');

  await stage('worked'); await page.waitForTimeout(900);
  const worked = await hint(page);
  console.log(`      rock marked    : "${worked}"`);
  check(/remembers the cell/i.test(worked), true, false,
    'THE LINE APPEARS the first time the rock carries a number');
  // Building the Kiln in `stage` opens a room, so the disclosure gate is over
  // the line this shot exists to photograph. Dismissed by its own button.
  await dismissGate(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/face-line.png` });

  // LAW 3, read off the rendered string rather than off the source.
  const leaks = ['umberjade', 'graveclay', 'deepgrave', 'deep-entry', 'gate', ' 8', '14', '20'];
  const leaked = leaks.filter((l) => worked.toLowerCase().includes(l.toLowerCase()));
  check(leaked, [], ['gate'], 'LAW 3 — no threshold, no material, no recipe in the line');
  check(/one square/i.test(worked), true, false,
    '...it names the BEHAVIOUR — work one square');

  await stage('understood'); await page.waitForTimeout(900);
  const after = await hint(page);
  console.log(`      after a gate   : "${after}"`);
  check(/remembers the cell/i.test(after), false, true,
    'and it stops forever once a gate has been crossed');

  console.log('B — a machine still does not compact');
  const machine = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; tick: (n: number) => void };
    const s = e.getState() as unknown as {
      face: { cells: number[]; compaction?: number[]; ore?: string[] };
      drills: { bayBuilt: boolean; units: Record<string, unknown>[] };
    };
    s.drills.bayBuilt = true;
    s.drills.units = [0, 1, 2].map((i) => ({ level: 6, timer: 0, lastCell: 0, use: {}, name: `D${i}` }));
    s.face.compaction = s.face.cells.map(() => 0);
    s.face.cells = s.face.cells.map(() => 8);
    s.face.ore = [];
    for (let i = 0; i < 400; i++) { s.face.ore = []; e.tick(1); }
    return Math.max(...(s.face.compaction ?? [0]));
  });
  check(machine, 0, 1, 'four hundred machine-seconds pack the rock not at all');

  console.log('C — pillar 2, both arms at the same depth');
  const readCeiling = (): Promise<string> => page.evaluate(() => {
    const el = [...document.querySelectorAll('div')]
      .find((d) => d.textContent?.trim().startsWith('Field ceiling'));
    const txt = (el?.parentElement?.innerText ?? '').replace(/\s+/g, ' ').trim();
    return (/Field ceiling ([0-9.]+)/.exec(txt)?.[1]) ?? 'unread';
  });
  const setBoard = (marked: boolean): Promise<void> => page.evaluate((on) => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown };
    const s = e.getState() as unknown as {
      depth: number; face: { cells: number[]; compaction?: number[] };
      drills: { units: unknown[] };
    };
    s.drills.units = [];
    s.depth = 40; // BOTH arms here — depth pressure is a dustYield term
    s.face.compaction = s.face.cells.map(() => (on ? 26 : 0));
    e.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1 });
  }, marked);
  await setBoard(false); await page.waitForTimeout(900);
  const flat = await readCeiling();
  await setBoard(true); await page.waitForTimeout(900);
  const packed = await readCeiling();
  check(packed, flat, 'unread', 'a board packed to the ceiling reads the SAME field ceiling');
  check(flat !== 'unread' && packed !== 'unread', true, false,
    'and both reads found the number');

  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(overflow, 0, 1, 'no horizontal overflow at 380px');
  check(errors.length, 0, 1, `no page errors${errors.length ? ` — ${errors.join(' | ')}` : ''}`);
  console.log(problems.length === 0 ? '\nALL PASS' : `\nFAILURES: ${problems.join(', ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
