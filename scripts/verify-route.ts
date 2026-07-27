/**
 * THE ROUTE PICKER, DRIVEN WITHOUT HELP.
 *
 * The complaint was "clicking route does nothing but hang for a second". The
 * picker was mounting and working the whole time — at the BOTTOM of the room,
 * below every drill row, thousands of pixels from the button that opened it.
 * A control that opens where the player is not looking has not opened.
 *
 * So the assertion this script exists for is that the driver does NO SCROLLING
 * OF ITS OWN. `verify-a56.ts` needed a `scrollIntoViewIfNeeded` to test this at
 * all, and by this project's working rule a harness that routes around the
 * layout is a bug report about the layout, not a fix. Here: click, wait, and
 * require the painter to be inside the viewport on its own.
 *
 *   1  ROUTE is collapsed by default — a label and a summary, no grid
 *   2  clicking it opens the painter AND brings it on screen unaided
 *   3  three cells paint under a real pointer drag
 *   4  DONE collapses it and scrolls BACK to the drill it came from
 *   5  the drill then works only those cells
 *
 *   npx tsx scripts/verify-route.ts [port] [outDir]
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

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/route-${name}.png` });
  shots.push(`${OUT}/route-${name}.png`);
}

/**
 * IS THIS WHERE A PLAYER CAN ACTUALLY SEE AND TOUCH IT?
 *
 * MEASURED AGAINST THE SCROLLING ANCESTOR, NOT THE WINDOW, and that distinction
 * is the entire reason this file exists in its current form. The first version
 * compared against `window.innerHeight` and cheerfully reported the painter
 * "ON SCREEN, top 466px" while the room's scroll viewport began at y=560 — so
 * the grid's first rows were clipped ABOVE the container, every pointer event
 * landed on the room selector, and the check was green for something invisible.
 * A viewport test that ignores the box the content actually lives in counts
 * nothing, which is the failure mode PILLARS names.
 *
 * It also hit-tests: `elementFromPoint` at the element's own centre must return
 * the element (or a descendant). Visible-by-arithmetic and clickable are two
 * different claims and only the second one matters.
 */
async function onScreen(page: Page, sel: string) {
  return page.evaluate((q) => {
    const el = document.querySelector(q) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    let box: HTMLElement | null = el.parentElement;
    while (box && box.scrollHeight <= box.clientHeight + 1) box = box.parentElement;
    const c = box ? box.getBoundingClientRect() : new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const top = Math.max(c.top, 0);
    const bottom = Math.min(c.bottom, window.innerHeight);
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    return {
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      port: `${Math.round(top)}..${Math.round(bottom)}`,
      visible: r.bottom > top && r.top < bottom,
      fully: r.top >= top && r.bottom <= bottom,
      hits: !!hit && (hit === el || el.contains(hit)),
    };
  }, sel);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: W, height: H }, reducedMotion: 'no-preference' });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[console] ${m.text().slice(0, 200)}`); });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    const w = window as unknown as Record<string, unknown>;
    w['__D'] = (await import(/* @vite-ignore */ '/src/engine/decimal' + '.ts')).D;
    w['__drills'] = await import(/* @vite-ignore */ '/src/engine/systems/drills' + '.ts');
  });

  // A REALISTIC BAY. Eight machines, because the whole defect is that the
  // painter renders below all of them — a one-drill bay would hide it.
  await setup(page, `
    const st = engine.getState();
    st.drills.bayBuilt = true; st.forge.built = true; st.kiln.built = true;
    st.depth = 40; st.maxDepthRecord = 60; st.depthRecords['loam'] = 60;
    st.currencies['dust'] = window.__D(1e12); st.currencies['brick'] = window.__D(1e12);
    st.face.cells = st.face.cells.map(() => 8);
    st.face.ore = new Array(st.face.cells.length).fill('');
    st.face.oreDug = new Array(st.face.cells.length).fill(0);
    st.drills.units = [];
    for (let i = 0; i < 8; i++) st.drills.units.push(window.__drills.newDrill('D' + i));
  `);
  await tab(page, 'drills');
  await dismiss(page);
  // LET THE ACHIEVEMENT TOASTS FINISH. Stipulating a deep save unlocks a dozen
  // of them at once and they stack over the panel — the DOM checks read through
  // them fine, but the screenshots are the evidence a human looks at, and four
  // toasts across the painter is not evidence of anything.
  await page.waitForTimeout(11_000);
  await dismiss(page);

  // === 1. COLLAPSED BY DEFAULT ============================================
  console.log('\n1 — collapsed by default');
  check(await page.locator('[data-testid="route-picker"]').count() === 0,
    'the grid painter is NOT on screen until it is asked for');
  const label = await page.locator('[data-testid="route-0"]').innerText();
  check(/routing/i.test(label), 'the drill shows a ROUTING label instead', label);
  const summary = await page.locator('[data-testid="route-state-0"]').innerText();
  check(/whole face/i.test(summary), 'and a summary of where it currently works', summary);
  await shot(page, '1-collapsed');

  // === 2. IT OPENS WHERE THE PLAYER IS LOOKING =============================
  console.log('\n2 — clicking it brings the painter to the player');
  const before = await onScreen(page, '[data-testid="drill-row-0"]');
  await page.locator('[data-testid="route-0"]').click();
  // NOTHING ELSE. No scrollIntoView, no keyboard, no evaluate. If the painter
  // is not on screen after this, the control has not opened.
  await page.waitForTimeout(900); // smooth scroll
  check(await page.locator('[data-testid="route-picker"]').count() > 0, 'the painter mounts');
  const at = await onScreen(page, '[data-testid="route-picker"]');
  check(!!at?.visible, 'and it is inside the room own scroll viewport',
    at ? `panel ${at.top}..${at.bottom}, viewport ${at.port}` : 'absent');
  const first = await onScreen(page, '[data-testid="zone-cell-0"]');
  const last = await onScreen(page, `[data-testid="zone-cell-${await page.evaluate(() => (window as unknown as Record<string, any>)['__engine'].getState().face.cells.length - 1)}"]`);
  check(!!first?.fully && !!last?.fully, 'the WHOLE grid is in view, first cell to last',
    `first ${first?.top}..${first?.bottom}, last ${last?.top}..${last?.bottom}, viewport ${first?.port}`);
  check(!!first?.hits, 'and a click at the first cell lands ON the first cell',
    first?.hits ? 'hit' : 'something else is on top');
  check(/editing/i.test(await page.locator('[data-testid="route-0"]').innerText()),
    'and the drill says it is being edited');
  void before;
  await shot(page, '2-open');

  // === 3. PAINT ===========================================================
  console.log('\n3 — paint three squares');
  const b0 = await page.locator('[data-testid="zone-cell-0"]').boundingBox();
  const b2 = await page.locator('[data-testid="zone-cell-2"]').boundingBox();
  if (b0 && b2) {
    await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
    await page.mouse.down();
    await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2, { steps: 10 });
    await page.mouse.up();
  }
  await page.waitForTimeout(200);
  const painted = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="zone-cell-"]'))
      .filter((e) => e.getAttribute('aria-pressed') === 'true').length);
  check(painted === 3, 'dragging across three squares selects exactly three', `${painted} lit`);
  check(/3 squares/.test(await page.locator('[data-testid="route-count"]').innerText()),
    'and the painter says so');
  await shot(page, '3-painted');

  // === 4. PRIORITY ========================================================
  console.log('\n4 — the priority toggle');
  // The DISCLOSURE GATE ("New systems opened") turns up mid-run, because the
  // stipulated state keeps unlocking rooms as the engine ticks, and it is a
  // full-screen modal that eats every click behind it. A player dismisses it
  // too; the driver does the same rather than clicking through it.
  await dismiss(page);
  await page.locator('[data-testid="priority-rock"]').click();
  await page.waitForTimeout(200);
  const prio = await page.evaluate(() =>
    (window as unknown as Record<string, any>)['__engine'].getState().drills.units[0].priority);
  check(prio === 'rock', 'picking ROCK ONLY sets it on that drill', String(prio));

  // === 5. DONE COLLAPSES AND COMES BACK ===================================
  console.log('\n5 — Done puts it away and puts you back');
  await dismiss(page);
  await page.locator('[data-testid="route-done"]').click();
  await page.waitForTimeout(900);
  check(await page.locator('[data-testid="route-picker"]').count() === 0,
    'the painter is gone again');
  const rowAfter = await onScreen(page, '[data-testid="drill-row-0"]');
  check(!!rowAfter?.visible, 'and the drill it came from is back in the room viewport',
    rowAfter ? `row ${rowAfter.top}..${rowAfter.bottom}, viewport ${rowAfter.port}` : 'absent');
  const zone: number[] = (await page.evaluate(() =>
    (window as unknown as Record<string, any>)['__engine'].getState().drills.units[0].zone)) ?? [];
  check(zone.length === 3, 'the selection was committed', JSON.stringify(zone));
  const state0 = await page.locator('[data-testid="route-state-0"]').innerText();
  check(/3 squares/.test(state0) && /rock only/i.test(state0),
    'and the collapsed summary reports it without opening anything', state0);
  await shot(page, '5-collapsed-back');

  // === 6. THE DRILL OBEYS =================================================
  console.log('\n6 — and the machine actually does it');
  const worked = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const drills = await import(/* @vite-ignore */ '/src/engine/systems/drills' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const s = w['__engine'].getState();
    // Only the zoned machine works rock; the rest are parked on ore they will
    // never find, so anything touched is attributable to drill 0.
    for (let i = 1; i < s.drills.units.length; i++) s.drills.units[i].priority = 'ores';
    s.face.cells = s.face.cells.map(() => 8);
    const before = s.face.cells.slice();
    const ctx = { emit() {}, dirty() {} };
    for (let t = 0; t < 60; t++) drills.tickDrills(s, new modsMod.ModifierCache(), ctx, 1);
    const touched: number[] = [];
    for (let i = 0; i < before.length; i++) {
      if ((s.face.cells[i] ?? 0) < before[i] - 1e-9) touched.push(i);
    }
    return touched;
  });
  const outside = worked.filter((c) => !zone.includes(c));
  check(outside.length === 0, 'it works NOTHING outside the three squares',
    `touched ${worked.join(',')} | zone ${zone.join(',')}`);
  check(worked.length > 0, 'and it does work the ones it was given', `${worked.length} cells`);

  const px = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(px === 0, `no horizontal overflow at ${W}px`, `${px}px`);

  await browser.close();
  console.log(`\nshots: ${shots.length}`);
  for (const s of shots) console.log(`  ${s}`);
  if (problems.length > 0) {
    console.log(`\n${problems.length} PROBLEM(S):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  console.log('\nall checks passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
