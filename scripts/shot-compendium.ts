/**
 * Compendium verification: proves the wiki actually RENDERS and SEARCHES in a
 * real browser, and that the new header glyph did not cost us the 380px
 * overflow guarantee.
 *
 * Screenshots go to sim-out/compendium/. Anything that fails prints FAIL and
 * exits non-zero, so this is a check and not just a picture-taker.
 *   npx tsx scripts/shot-compendium.ts
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'sim-out/compendium';
const URL = 'http://localhost:5173';
let failures = 0;
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

/** Widest scrollable element on the page — the 0px-overflow guarantee. */
async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    let worst = 0;
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      worst = Math.max(worst, Math.ceil(r.right - document.documentElement.clientWidth));
    }
    return Math.max(0, worst);
  });
}

async function openCompendium(page: Page): Promise<void> {
  await page.getByLabel('Open the Compendium').first().click();
  await page.waitForSelector('[aria-label="The Compendium"]', { timeout: 5000 });
  await page.waitForTimeout(250);
}

async function searchFor(page: Page, q: string): Promise<string[]> {
  const box = page.getByLabel('Search the Compendium');
  await box.fill('');
  await box.type(q, { delay: 8 });
  await page.waitForTimeout(300);
  // Read the RESULT LIST specifically. The first pass of this scraper grabbed
  // every button in the panel, which meant it was reading the filter chips
  // ("All", "Systems"...) and would have passed with zero search results.
  return page.evaluate(() => {
    const panel = document.querySelector('[aria-label="The Compendium"]');
    if (!panel) return [];
    return Array.from(panel.querySelectorAll('button.block'))
      .map((b) => (b.textContent ?? '').trim())
      .filter(Boolean)
      .slice(0, 6);
  });
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  // ---- Desktop -----------------------------------------------------------
  console.log('\nDESKTOP 1440x900');
  const d = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  d.on('pageerror', (e) => errors.push(e.message));
  await d.goto(URL, { waitUntil: 'networkidle' });
  await d.waitForTimeout(1200);

  check((await d.getByLabel('Open the Compendium').count()) >= 1, 'header glyph present');
  await openCompendium(d);
  await d.screenshot({ path: `${OUT}/desktop-index.png` });

  const idxCount = await d.evaluate(() => {
    const p = document.querySelector('[aria-label="The Compendium"]');
    return p ? p.querySelectorAll('button').length : 0;
  });
  check(idxCount > 20, 'index lists entries', `${idxCount} buttons`);

  // Contextual entry — opening from a room should land on that room's page.
  const heading = await d.evaluate(() => document.querySelector('[aria-label="The Compendium"] h2')?.textContent ?? '');
  check(heading.length > 0, 'contextual entry landed on a page', heading || '(none)');

  // Search: the three the brief named.
  for (const q of ['Weepstone', 'Breach', 'why is my income capped']) {
    const hits = await searchFor(d, q);
    check(hits.length > 0, `search "${q}"`, hits.slice(0, 3).join(' / ') || 'NO RESULTS');
  }
  await d.screenshot({ path: `${OUT}/desktop-search.png` });

  // A gated page must be LISTED and say so, never hidden.
  await searchFor(d, 'Aleph');
  const gatedShown = await d.evaluate(() => {
    const p = document.querySelector('[aria-label="The Compendium"]');
    return (p?.textContent ?? '').includes('not yet');
  });
  check(gatedShown, 'gated pages are listed, not hidden');

  // Escape must always close.
  await d.keyboard.press('Escape');
  await d.waitForTimeout(200);
  check((await d.locator('[aria-label="The Compendium"]').count()) === 0, 'Escape closes');

  check(errors.length === 0, 'no page errors', errors.slice(0, 2).join(' | '));

  // ---- Phone 380px -------------------------------------------------------
  console.log('\nPHONE 380x820');
  const p = await browser.newPage({ viewport: { width: 380, height: 820 } });
  const perr: string[] = [];
  p.on('pageerror', (e) => perr.push(e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);

  const before = await overflow(p);
  check(before === 0, 'no overflow at 380px with header glyph (closed)', `${before}px`);
  await p.screenshot({ path: `${OUT}/phone-header.png` });

  await openCompendium(p);
  await p.screenshot({ path: `${OUT}/phone-index.png` });
  const openOverflow = await overflow(p);
  check(openOverflow === 0, 'no overflow at 380px with Compendium open', `${openOverflow}px`);

  // The close control must never be able to fall below the fold.
  const closeVisible = await p.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent?.trim() === 'Close');
    if (!b) return false;
    const r = b.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  });
  check(closeVisible, 'Close stays on screen on a phone');

  // Reader on phone replaces the index (no side-by-side at 380px).
  const first = p.locator('[aria-label="The Compendium"] button').filter({ hasNotText: 'Close' }).nth(6);
  await first.click().catch(() => undefined);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/phone-reader.png` });
  const backBtn = await p.evaluate(() =>
    Array.from(document.querySelectorAll('button')).some((b) => (b.textContent ?? '').includes('Index')));
  check(backBtn, 'phone reader offers a route back to the index');

  const readerOverflow = await overflow(p);
  check(readerOverflow === 0, 'no overflow at 380px in the reader', `${readerOverflow}px`);
  check(perr.length === 0, 'no page errors on phone', perr.slice(0, 2).join(' | '));

  await browser.close();
  console.log(failures === 0 ? '\nCOMPENDIUM VERIFIED ✓' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
