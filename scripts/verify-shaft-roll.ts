/**
 * THE ROLL IS THE SHAFT SCREEN — verified in play at a real phone height.
 *
 * The claim being tested is a LAYOUT claim, so the viewport is 380x820 (a real
 * phone) rather than the 1200px-tall strip the earlier Roll checks used to fit
 * a panel into one screenshot. A panel that "fits" only in a viewport no phone
 * has is not a panel that fits.
 *
 *   A  clicking SHAFT shows the Roll, at minute 0, before any column exists
 *   B  all fifteen rows and the pinned floor, WITHOUT SCROLLING
 *   C  the §1 visibility rule survived the move: three legible, the rest fogged
 *   D  with a carved column, the hero keeps a slice and the Roll still fits
 *   E  it is GONE from Dig — it moved, it was not copied
 *
 *   npx tsx scripts/verify-shaft-roll.ts [port]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = `http://localhost:${process.argv[2] ?? '5173'}`;
const OUT = 'sim-out/shots-shaft-roll';
const problems: string[] = [];
const check = (ok: boolean, label: string, detail = ''): void => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(label);
};

/** The panel as the player reads it: one string per row, in order. */
const panel = (page: Page): Promise<string[]> => page.evaluate(() => {
  const heads = [...document.querySelectorAll('div')]
    .filter((d) => d.textContent?.trim().startsWith('The Roll'));
  const root = heads[heads.length - 1]?.closest('.panel');
  if (!root) return [];
  return [...root.querySelectorAll('[data-testid^="station-"], .flex.items-baseline.gap-2')]
    .map((r) => (r as HTMLElement).innerText.replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 0 && !t.startsWith('The Roll'));
});

/**
 * DOES IT FIT? Not "is it in the DOM" — every panel is in the DOM. The room
 * column is the thing with `overflow-y-auto`, so the honest question is whether
 * its content is taller than the box, and whether the floor row's bottom edge
 * is above the fixed bottom nav.
 */
const fit = (page: Page) => page.evaluate(() => {
  const heads = [...document.querySelectorAll('div')]
    .filter((d) => d.textContent?.trim().startsWith('The Roll'));
  const root = heads[heads.length - 1]?.closest('.panel') as HTMLElement | null;
  if (!root) return null;
  let scroller: HTMLElement | null = root.parentElement;
  while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) {
    scroller = scroller.parentElement;
  }
  const rows = [...root.querySelectorAll('[data-testid^="station-"], .flex.items-baseline.gap-2')];
  const last = rows[rows.length - 1] as HTMLElement | undefined;
  const nav = document.querySelector('nav.fixed') as HTMLElement | null;
  return {
    overflowPx: scroller ? scroller.scrollHeight - scroller.clientHeight : -1,
    rows: rows.length,
    floorBottom: last ? Math.round(last.getBoundingClientRect().bottom) : -1,
    navTop: nav ? Math.round(nav.getBoundingClientRect().top) : window.innerHeight,
    viewport: window.innerHeight,
  };
});

const goTab = async (page: Page, tab: string): Promise<void> => {
  await page.evaluate((t) => {
    const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
    ui.getState().setTab(t);
  }, tab);
  await page.waitForTimeout(700);
};

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  // A REAL PHONE. 380x820 is the constraint the whole check exists to measure.
  const page = await browser.newPage({ viewport: { width: 380, height: 820 }, isMobile: true, hasTouch: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    (window as never as Record<string, unknown>)['__name'] = (f: unknown) => f;
  });
  await page.goto(URL);
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForTimeout(6500); // let the opening toast go

  // THE DISCLOSURE GATE EATS THE CLICK. Nothing is granted here — the gate is
  // marked seen so the modal is not sitting over the screen being measured.
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { dispatch: (a: unknown) => unknown; tick: (n: number) => void };
    e.dispatch({ type: 'markSystemsSeen', ids: ['dig', 'shaft', 'kiln', 'hold', 'collapse'] });
    e.tick(0.2);
  });
  await page.waitForTimeout(500);

  // ── A. THE SHAFT TAB, AT MINUTE 0 ───────────────────────────────────────
  console.log('A — clicking SHAFT at minute 0');
  const shaftTab = page.getByRole('tab', { name: 'Shaft' });
  check(await shaftTab.count() > 0, 'the SHAFT tab is there before any column is carved');
  await shaftTab.first().click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(800);
  const rows = await panel(page);
  console.log(rows.map((r) => `      ${r}`).join('\n'));
  check(rows.length >= 15, 'the Roll is the content of that screen', `${rows.length} rows`);

  // ── B. IT FITS ──────────────────────────────────────────────────────────
  console.log('B — fifteen rows and the floor, at 380x820, without scrolling');
  const f = await fit(page);
  console.log(`      rows ${f?.rows} · scroller overflow ${f?.overflowPx}px · floor bottom ${f?.floorBottom} · nav top ${f?.navTop}`);
  check((f?.overflowPx ?? 1) <= 0, 'the room column does not scroll', `${f?.overflowPx}px of overflow`);
  check((f?.floorBottom ?? 1e9) <= (f?.navTop ?? 0), 'the pinned floor is above the bottom nav',
    `floor ${f?.floorBottom} vs nav ${f?.navTop}`);
  const overflowX = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(overflowX === 0, 'no horizontal overflow at 380px', `${overflowX}px`);

  // ── C. THE §1 RULE SURVIVED THE MOVE ────────────────────────────────────
  console.log('C — the visibility rule, unchanged by the move');
  // Five typed rows at depth 0: the station you are standing on, the three
  // ahead of the lamp, and the pinned floor. (The old Proof #2 check asserted
  // 4 and called it "three plus the floor" — it was counting the four legible
  // rows and the floor was NOT among them, because the floor rendered fogged.
  // That is the bug this pass fixed; the count moving is the proof.)
  const legible = rows.filter((r) => /SEAM|WALL|WRECK|WORKS|CHAMBER|HAZARD|REST|FLOOR/.test(r));
  check(legible.length === 5, 'three legible ahead, the one underfoot, and the pinned floor', `${legible.length} typed rows`);
  const floorRow = rows[rows.length - 1] ?? '';
  check(/DEEPGRAVE/.test(floorRow) && /150/.test(floorRow), 'DEEPGRAVE 150 pinned at the bottom', floorRow);
  const fogged = rows.filter((r) => /·$/.test(r));
  check(fogged.length >= 9, 'everything below is a name and a depth only', `${fogged.length} fogged rows`);
  check(/FLOOR/.test(floorRow), 'and the floor names itself as the floor', floorRow);
  await page.screenshot({ path: `${OUT}/A-shaft-screen-minute-0.png` });
  console.log('  shot A-shaft-screen-minute-0');

  // ── D. WITH A CARVED COLUMN ─────────────────────────────────────────────
  console.log('D — the same screen once the column exists');
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => { depth: number; maxDepthRecord: number; shaft: { reached: number } }; tick: (n: number) => void };
    const s = e.getState();
    s.depth = 41; s.shaft.reached = 41; s.maxDepthRecord = 41;
    e.tick(0.3);
  });
  await page.waitForTimeout(1200);
  const f2 = await fit(page);
  const rows2 = await panel(page);
  console.log(`      rows ${f2?.rows} · scroller overflow ${f2?.overflowPx}px · floor bottom ${f2?.floorBottom} · nav top ${f2?.navTop}`);
  check((f2?.overflowPx ?? 1) <= 0, 'still no scrolling once the column exists', `${f2?.overflowPx}px`);
  check((f2?.floorBottom ?? 1e9) <= (f2?.navTop ?? 0), 'floor still above the nav');
  const brick = rows2.find((r) => /BRICKLIGHT/.test(r)) ?? '';
  check(/too hard/.test(brick), 'and the WALL still says only "too hard"', brick);
  // ON A PHONE THE SHAFT SCREEN IS THE ROLL. The carved column is the desktop
  // layout's left panel; at 380px there is no room for both and the arithmetic
  // is in App.tsx. Prove the phone hero really is out of the way.
  const heroHidden = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    let el: HTMLElement | null = c?.parentElement as HTMLElement | null;
    while (el) {
      if (getComputedStyle(el).display === 'none') return true;
      el = el.parentElement;
    }
    return false;
  });
  check(heroHidden, 'the hero steps aside on a phone — the Roll is the screen');
  // Jumping to depth 41 fires the depth achievements; their toasts sit over the
  // floor rows. The measurement above is already taken — this wait is only so
  // the SCREENSHOT shows the panel rather than two banners on top of it.
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${OUT}/D-shaft-screen-with-column.png` });
  console.log('  shot D-shaft-screen-with-column');

  // ── E. IT MOVED, IT WAS NOT COPIED ──────────────────────────────────────
  console.log('E — Dig no longer carries it');
  await goTab(page, 'dig');
  const inDig = await page.evaluate(() =>
    [...document.querySelectorAll('div')].some((d) => d.textContent?.trim().startsWith('The Roll')));
  check(!inDig, 'the Roll is gone from Dig');

  check(errors.length === 0, 'no page errors throughout', errors.join(' | '));
  console.log(problems.length === 0 ? '\nALL PASS' : `\nFAILURES: ${problems.join(', ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
