/**
 * THE HINT ROW IS NOT TRUNCATING — measured, not assumed.
 *
 * A.79 reported the face's teaching line as truncated, from a screenshot that
 * read "…Work one" and then stopped. It was wrong. `SystemHeader` has no
 * `truncate`, no `whitespace-nowrap` and no line clamp; the row wraps and the
 * container fits every line. What the screenshot showed was the DISCLOSURE GATE
 * sitting on top of it — `elementFromPoint` at the centre of the row returned a
 * modal reading "3 things opened", not the hint.
 *
 * So this script pins the thing that was doubted, for every hint the row shows:
 *
 *   1  the rendered string equals its source CHARACTER FOR CHARACTER
 *   2  scrollWidth === clientWidth  (nothing clipped sideways)
 *   3  scrollHeight === clientHeight (nothing clipped below)
 *
 * The gate is dismissed first — by pressing its own button — so the measurement
 * is of the row and not of what happens to be over it.
 *
 *   npx tsx scripts/verify-hint-row.ts [port]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = `http://localhost:${process.argv[2] ?? '5173'}`;
const OUT = 'sim-out/shots-hint-row';
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

async function dismissGate(page: Page): Promise<void> {
  const gate = page.locator('[role="dialog"] button').last();
  for (let i = 0; i < 4 && await gate.count() > 0; i++) {
    await gate.click({ timeout: 4000 }).catch(() => undefined);
    await page.waitForTimeout(400);
  }
}

/** The hint row's own span — scoped to the sentence, never the block it sits in. */
interface RowRead {
  found: boolean; text: string;
  clippedX: boolean; clippedY: boolean;
  lines: number; onTopIsSelf: boolean; onTop: string;
}
const readRow = (page: Page): Promise<RowRead> => page.evaluate(() => {
  const arrow = [...document.querySelectorAll('span')]
    .find((n) => (n as HTMLElement).innerText?.trim() === '→');
  const el = arrow?.parentElement?.querySelectorAll('span')[1] as HTMLElement | undefined;
  if (!el) return { found: false, text: '', clippedX: false, clippedY: false, lines: 0, onTopIsSelf: false, onTop: '' };
  const r = el.getBoundingClientRect();
  const lineH = parseFloat(getComputedStyle(el).lineHeight) || 14;
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    found: true,
    text: el.innerText,
    // A wrapped line has scrollWidth === clientWidth; a CLIPPED one does not.
    clippedX: el.scrollWidth > el.clientWidth,
    clippedY: el.scrollHeight > el.clientHeight,
    lines: Math.round(r.height / lineH),
    onTopIsSelf: top === el || el.contains(top),
    onTop: (top as HTMLElement | null)?.innerText?.slice(0, 40).replace(/\n/g, ' ') ?? '',
  };
});

/** Put the game in a state whose `next` returns the named sentence. */
const stage = (page: Page, which: string): Promise<void> => page.evaluate((w) => {
  const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
    { getState: () => never; dispatch: (a: unknown) => unknown };
  const s = e.getState() as unknown as {
    maxDepthRecord: number; depth: number; kiln: { built: boolean; feeding: boolean; heat: number };
    face: { cells: number[]; compaction?: number[] };
    drills: { bayBuilt: boolean; units: unknown[] };
    shaft: { reached: number }; collapse: { count: number };
    reading?: { tally: Record<string, number> };
    currencies: Record<string, { mul: (n: number) => unknown }>;
  };
  s.reading ??= { notes: [], proven: [], working: null, tally: {} } as never;
  s.reading.tally = {};
  s.face.compaction = s.face.cells.map(() => 0);
  s.maxDepthRecord = 3; s.kiln.built = true; s.kiln.feeding = true; s.kiln.heat = 0.8;
  if (w === 'openingTap') { s.maxDepthRecord = 0; s.kiln.built = false; }
  if (w === 'faceLine') { s.face.compaction[4] = 5; }
  if (w === 'kilnCold') { s.kiln.feeding = false; }
  if (w === 'kilnWarming') { s.kiln.feeding = true; s.kiln.heat = 0.1; }
  if (w === 'bayEmpty') { s.drills.bayBuilt = false; s.drills.units = []; }
  if (w === 'shaftUp') { s.shaft.reached = 40; s.depth = 10; }
  e.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1 });
}, which);

const setTab = (page: Page, tab: string): Promise<void> => page.evaluate((t) => {
  const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
  ui.getState().setTab(t);
}, tab);

/** Every sentence this pass checks, and the source it must match exactly. */
const CASES: { id: string; tab: string; stage: string; want: string }[] = [
  {
    id: 'THE FACE LINE', tab: 'dig', stage: 'faceLine',
    want: 'The rock remembers the cell, not the hand. Work one square instead of the fullest and watch its number climb — that is what the number is for.',
  },
  {
    id: 'opening tap', tab: 'dig', stage: 'openingTap',
    want: 'Tap the rock. Keep tapping — the first upgrade is only a few strokes away.',
  },
  {
    id: 'kiln cold', tab: 'kiln', stage: 'kilnCold',
    want: 'It sits cold and idle. Set it feeding to start turning Dust into Brick.',
  },
  {
    id: 'kiln warming', tab: 'kiln', stage: 'kilnWarming',
    want: 'Barely warm — most of the Dust is going up the flue. Keep feeding it until the heat rises.',
  },
  {
    id: 'bay empty', tab: 'drills', stage: 'bayEmpty',
    want: 'Build the bay, then buy your first drill. It works whether you watch or not.',
  },
  {
    id: 'shaft, up the column', tab: 'shaft', stage: 'shaftUp',
    want: 'You are up the shaft. Tap a cleared depth to move — walking your own column costs nothing.',
  },
];

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

  console.log('Every hint the row shows, at 380px — character for character\n');
  let shot = false;
  for (const c of CASES) {
    await stage(page, c.stage);
    await page.waitForTimeout(700);
    await dismissGate(page);
    await setTab(page, c.tab);
    await page.waitForTimeout(700);
    await dismissGate(page);
    const row = await readRow(page);
    console.log(`  ${c.id} — ${row.lines} line${row.lines === 1 ? '' : 's'}, ${row.text.length} chars`);
    // CHARACTER FOR CHARACTER. Not contains, not startsWith. The known-bad is
    // the truncation A.79 reported, so a row that really did clip fails here.
    check(row.text, c.want, c.want.slice(0, 50), `${c.id}: renders the whole sentence`);
    check(row.clippedX, false, true, `${c.id}: nothing clipped sideways`);
    check(row.clippedY, false, true, `${c.id}: nothing clipped below`);
    if (!row.onTopIsSelf) {
      console.log(`        NOTE the row is UNDER "${row.onTop}" — occlusion, not truncation`);
    }
    if (!shot && c.stage === 'faceLine') {
      // LET THE TOASTS GO FIRST. They are self-fading and they paint OVER the
      // panel — which is the whole of what A.79 photographed and called
      // truncation. Waiting for them is not hiding a defect; the DOM read above
      // already proved the text is complete and unclipped either way.
      await page.waitForTimeout(9000);
      await page.screenshot({ path: `${OUT}/hint-face-line.png` });
      shot = true;
    }
  }

  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(overflow, 0, 1, 'no horizontal overflow at 380px');
  check(errors.length, 0, 1, `no page errors${errors.length ? ` — ${errors.join(' | ')}` : ''}`);
  console.log(problems.length === 0 ? '\nALL PASS' : `\nFAILURES: ${problems.join(', ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
