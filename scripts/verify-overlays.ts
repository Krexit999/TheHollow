/**
 * THE OVERLAY LAYER — nothing a player must read sits under a toast.
 *
 * Two false reports came out of this: a screenshot taken while a toast was up
 * was read as the hint row TRUNCATING, and before that the disclosure gate was
 * read the same way. The row was correct both times. So the check is no longer
 * "does it look right" — it is `elementFromPoint` at the centre of the text,
 * WITH A TOAST LIVE, returning the text.
 *
 * RED-TESTED AGAINST A LIVE TOAST, not against a quiet screen: the script fires
 * real toasts through the engine's own event bus and asserts the row is still
 * on top while they are visible. A check run on an empty screen would pass
 * whatever the stacking did.
 *
 * READ THIS BEFORE TRUSTING SECTION A OR B. `elementFromPoint` IS VACUOUS
 * AGAINST THIS OVERLAY. The toast container carries `pointer-events-none`, so
 * hit-testing passes straight THROUGH a toast and returns whatever is painted
 * underneath — which means A and B report "the row is on top" whether or not a
 * toast is visually covering it. They were specified as the check for this
 * defect and they cannot see it. Section C — geometric intersection of the
 * rects — is the only part of this file that can, and it is the part that
 * caught a regression when the stack was moved.
 *
 *   npx tsx scripts/verify-overlays.ts [port]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = `http://localhost:${process.argv[2] ?? '5173'}`;
const OUT = 'sim-out/shots-overlays';
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
    await page.waitForTimeout(350);
  }
}

/** Fire real achievements so real toasts mount. */
const makeToasts = (page: Page): Promise<void> => page.evaluate(() => {
  const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
    { dispatch: (a: unknown) => unknown };
  // Dust milestones trip several achievement toasts at once.
  e.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e10 });
});

/** How many toasts are on screen right now. */
const toastCount = (page: Page): Promise<number> => page.evaluate(() =>
  document.querySelectorAll('.toast-in').length);

/**
 * Is `text` the thing painted at its own centre? Scoped to the element that
 * OWNS the sentence — never the block around it, which is the fault that
 * produced two false reports.
 */
const onTop = (page: Page, needle: string): Promise<{ found: boolean; self: boolean; over: string }> =>
  page.evaluate((n) => {
    const el = [...document.querySelectorAll('span, p, div')]
      .find((x) => {
        const t = (x as HTMLElement).innerText ?? '';
        return t.startsWith(n) && (x as HTMLElement).children.length === 0;
      }) as HTMLElement | undefined;
    if (!el) return { found: false, self: false, over: '' };
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      found: true,
      self: hit === el || el.contains(hit),
      over: (hit as HTMLElement | null)?.innerText?.slice(0, 44).replace(/\n/g, ' ') ?? '',
    };
  }, needle);

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

  // Put the face's teaching line on screen.
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown };
    const s = e.getState() as unknown as {
      maxDepthRecord: number; kiln: { built: boolean };
      face: { cells: number[]; compaction?: number[] };
      reading?: { tally: Record<string, number> };
    };
    s.reading ??= { notes: [], proven: [], working: null, tally: {} } as never;
    s.reading.tally = {};
    s.maxDepthRecord = 3;
    s.kiln.built = true;
    s.face.compaction = s.face.cells.map(() => 0);
    s.face.compaction[4] = 5;
  });
  await page.waitForTimeout(900);
  await dismissGate(page);
  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
    ui.getState().setTab('dig');
  });
  await page.waitForTimeout(700);
  await dismissGate(page);

  console.log('A — the hint row, WITH TOASTS LIVE');
  await makeToasts(page);
  await page.waitForTimeout(900);
  const live = await toastCount(page);
  console.log(`      toasts on screen: ${live}`);
  // THE RED TEST IS THE TOASTS THEMSELVES. With none up, the stacking check
  // passes whatever the layout does, which is exactly how this was missed.
  check(live > 0, true, false, 'toasts are actually on screen for this measurement');

  const hint = await onTop(page, 'The rock remembers the cell');
  console.log(`      at the row's centre: ${hint.self ? 'the row' : `"${hint.over}"`}`);
  check(hint.found, true, false, 'the hint row is on screen');
  check(hint.self, true, false, 'THE HINT ROW IS ON TOP while toasts are live');
  await page.screenshot({ path: `${OUT}/toast-over-hero.png` });

  console.log('B — the same, for the face panel and the Shaft');
  const facePurpose = await onTop(page, 'The rock in front of you');
  check(facePurpose.self, true, false, 'the Face panel\'s own copy is on top during a toast');

  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
    ui.getState().setTab('shaft');
  });
  await page.waitForTimeout(700);
  await dismissGate(page);
  await makeToasts(page);
  await page.waitForTimeout(800);
  const shaftLive = await toastCount(page);
  const shaft = await onTop(page, 'The column you have dug');
  console.log(`      toasts on screen: ${shaftLive}; at the Shaft copy's centre: ${shaft.self ? 'the copy' : `"${shaft.over}"`}`);
  check(shaftLive > 0, true, false, 'toasts are live for the Shaft measurement too');
  check(shaft.self, true, false, 'the Shaft panel\'s copy is on top during a toast');

  console.log('C — the stack never intersects the room header');
  /**
   * MEASURED AGAINST THE ROOM HEADER, not against the hero canvas. The first
   * cut asked whether the toast sat inside the hero's rect — and read it on the
   * SHAFT tab, where the canvas is zero-height, so it reported 'y 0..0' and
   * failed on a probe that was measuring nothing. The claim was never about the
   * hero anyway: it is that no panel text is ever underneath a toast.
   */
  const clash = await page.evaluate(() => {
    const toasts = [...document.querySelectorAll('.toast-in')] as HTMLElement[];
    const head = document.querySelector('header.panel') as HTMLElement | null;
    if (!head || toasts.length === 0) return { measured: false, overlaps: true, toastTop: -1, headTop: -1 };
    const h = head.getBoundingClientRect();
    const overlaps = toasts.some((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > h.top && r.top < h.bottom;
    });
    return {
      measured: true, overlaps,
      toastTop: Math.round(toasts[0]!.getBoundingClientRect().top),
      headTop: Math.round(h.top),
    };
  });
  console.log();
  check(clash.measured, true, false, 'both the toast stack and the room header were on screen');
  check(clash.overlaps, false, true, 'NO TOAST INTERSECTS THE ROOM HEADER');

  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(overflow, 0, 1, 'no horizontal overflow at 380px');
  check(errors.length, 0, 1, `no page errors${errors.length ? ` — ${errors.join(' | ')}` : ''}`);
  console.log(problems.length === 0 ? '\nALL PASS' : `\nFAILURES: ${problems.join(', ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
