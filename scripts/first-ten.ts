/**
 * PART 6, done properly (Phase 11b): walk a genuinely fresh save through the
 * opening beats and record WHAT THE SCREEN SAYS at each one. The earlier pass
 * asserted "every screen was walked" without producing findings; this prints
 * the evidence so the findings can be written from it rather than from memory.
 *
 * Usage: npx tsx scripts/first-ten.ts   (dev server must be running)
 */
import { chromium, type Page } from 'playwright';

const URL = 'http://localhost:5173';

async function snap(p: Page, beat: string): Promise<void> {
  const o = (await p.evaluate(`(() => {
    const j = (t) => t.split(String.fromCharCode(10)).join(' / ');
    const q = (sel) => { const el = document.querySelector(sel); return el ? j(el.innerText).trim() : null; };
    const tabs = Array.from(document.querySelectorAll('[role="tab"]')).map(t => t.innerText.trim());
    const clusters = Array.from(document.querySelectorAll('nav button')).map(t => t.innerText.trim().split(String.fromCharCode(10)).pop());
    const buys = Array.from(document.querySelectorAll('button')).filter(b => /Buy|Open|Build/.test(b.textContent||'')).map(b => ({ t: b.textContent.trim(), on: !b.disabled }));
    const s = window.__engine.getState();
    return {
      header: q('section header'),
      hint: q('[data-hint], .lamplight') ? null : null,
      tabs, clusters,
      buys: buys.slice(0, 4),
      dust: s.currencies.dust ? s.currencies.dust.toNumber().toFixed(1) : '0',
      depth: s.depth, record: s.maxDepthRecord,
    };
  })()`)) as any;
  console.log(`\n──────── ${beat}`);
  console.log(`  dust=${o.dust} depth=${o.depth} record=${o.record}`);
  console.log(`  clusters: [${o.clusters.join(' | ')}]`);
  console.log(`  sub-tabs: [${o.tabs.join(' | ')}]`);
  console.log(`  HEADER:  ${o.header ?? '(none)'}`);
  console.log(`  buttons: ${o.buys.map((b: any) => `${b.t}${b.on ? '' : ' [disabled]'}`).join(' ; ') || '(none)'}`);
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 380, height: 820 }, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message.slice(0, 120)));
  await page.goto(URL);
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForTimeout(1500);

  await snap(page, 'BEAT 1 — first load, never touched');

  // Beat 2: the player taps the rock ~12 times (all they can do).
  await page.evaluate(`(() => { const e = window.__engine; for (let i=0;i<12;i++) e.dispatch({type:'chip', cell: i % 36}); e.tick(0.4); })()`);
  await page.waitForTimeout(700);
  await snap(page, 'BEAT 2 — after ~12 taps');

  // Beat 3: enough Dust for the first upgrade.
  await page.evaluate(`(() => { const e=window.__engine,s=e.getState(); s.currencies.dust=s.currencies.dust.mul(0).add(60); e.tick(0.3); })()`);
  await page.waitForTimeout(700);
  await snap(page, 'BEAT 3 — first upgrade affordable (50 Dust)');

  // Beat 4: bought some upgrades, now near the Kiln.
  await page.evaluate(`(() => { const e=window.__engine,s=e.getState(); s.currencies.dust=s.currencies.dust.mul(0).add(1200); e.tick(0.3); })()`);
  await page.waitForTimeout(700);
  await snap(page, 'BEAT 4 — Kiln within reach');

  // Beat 5: Kiln built — a whole new system just appeared.
  await page.evaluate(`(() => { const e=window.__engine,s=e.getState(); s.kiln.built=true; s.currencies.dust=s.currencies.dust.mul(0).add(400); e.tick(0.3); })()`);
  await page.waitForTimeout(900);
  await snap(page, 'BEAT 5 — Kiln just built (new system appears)');

  await page.evaluate(`window.__ui.getState().setTab('kiln')`);
  await page.waitForTimeout(600);
  await snap(page, 'BEAT 5b — opening the Kiln for the first time');

  // Beat 6: first descent, and the Collapse cluster unlocking at record 15.
  await page.evaluate(`(() => { const e=window.__engine,s=e.getState(); s.depth=16; s.maxDepthRecord=16; e.tick(0.3); })()`);
  await page.waitForTimeout(900);
  await page.evaluate(`window.__ui.getState().setTab('dig')`);
  await page.waitForTimeout(600);
  await snap(page, 'BEAT 6 — depth 16, Collapse now exists');

  await browser.close();
}
void main();
