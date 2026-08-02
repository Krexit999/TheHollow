/**
 * THE STANDOFF, VERIFIED IN PLAY (§27).
 *
 * Read off the RENDERED PANEL, not off state — the three claims are all things
 * a player either sees or does not:
 *
 *   A  a Standoff with a VISIBLE INTENT, free, before anything is spent
 *   B  the drill line acting EVERY exchange, and locked once the fight starts
 *   C  THE DEEPWROUGHT COUNTERING A REPEATED STRIKE
 *   D  it compacts — harder to hurt, and the withdraw is free
 *
 * Plus: 0 horizontal overflow at 380px.
 *
 *   npx tsx scripts/verify-standoff.ts [port]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = `http://localhost:${process.argv[2] ?? '5173'}`;
const OUT = 'sim-out/shots-standoff';
const problems: string[] = [];
const check = (ok: boolean, label: string, detail = ''): void => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(label);
};

const text = (page: Page, sel: string): Promise<string> => page.evaluate((s) => {
  const el = document.querySelector(s);
  return el ? (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
}, sel);

const shoot = async (page: Page, name: string): Promise<void> => {
  await page.waitForTimeout(400);
  await page.locator('[data-testid="standoff"]').screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
  console.log(`  shot ${name}`);
};

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  // WIDTH 380 is the constraint; the height is tall only so the whole panel
  // lands in one element screenshot instead of being sheared at the fold.
  const page = await browser.newPage({ viewport: { width: 380, height: 1400 }, isMobile: true, hasTouch: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    (window as never as Record<string, unknown>)['__name'] = (f: unknown) => f;
  });
  await page.goto(URL);
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForTimeout(3000);

  // Stand at The Ashfall. NOTHING else is granted — no dust, no tool, no
  // unlocks: §27.1's claim is that intent is free from the FIRST fight, and a
  // driver that hands itself a late-game save cannot test that.
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { dispatch: (a: unknown) => unknown; getState: () => { depth: number; shaft: { reached: number } }; tick: (n: number) => void };
    e.dispatch({ type: 'markSystemsSeen', ids: ['dig', 'shaft', 'kiln', 'hold', 'collapse'] });
    const s = e.getState();
    s.depth = 72; s.shaft.reached = 72; // The Ashfall
    e.tick(0.3);
  });
  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
    ui.getState().setTab('dig');
  });
  await page.waitForTimeout(900);

  // ── A. IT IS THERE, AND IT ANNOUNCES ITSELF ─────────────────────────────
  console.log('A — the Standoff at a hazard station, nothing spent');
  const offer = await text(page, '[data-testid="standoff"]');
  console.log(`      ${offer.slice(0, 200)}`);
  check(/THE DEADFALL/.test(offer), 'the Deepwrought is named before you engage');
  check(/Walking past costs nothing/.test(offer), 'and engaging is optional (§27.7)');
  // The intensity is the §1.1 re-roll's, and it must be the REAL one: a panel
  // reading "Hazard 0" over a fight running at intensity 1 is the engine and
  // the screen disagreeing about the same number.
  check(/Hazard [1-3]\b/.test(offer), 'and it names the intensity the fight will actually use',
    offer.match(/Hazard \d+/)?.[0] ?? '');

  // The three lines are pickable NOW and only now.
  for (const id of ['fullest', 'sweep', 'chain']) {
    check(await page.locator(`[data-testid="line-${id}"]`).count() > 0, `the ${id} drill line is offered before the fight`);
  }
  await page.locator('[data-testid="line-chain"]').click({ timeout: 4000 });
  await page.waitForTimeout(300);
  await shoot(page, 'A-before-the-fight');

  await page.locator('[data-testid="engage"]').click({ timeout: 4000 });
  await page.waitForTimeout(600);

  const intent = await text(page, '[data-testid="intent"]');
  console.log(`      intent: ${intent}`);
  check(/NEXT/i.test(intent) && /(swing|settle|number)/i.test(intent),
    'THE INTENT IS ON SCREEN, on exchange zero', intent);

  // ── B. THE DRILL LINE, LOCKED AND ACTING ────────────────────────────────
  console.log('B — the drill line as a second actor');
  const locked = await page.locator('[data-testid="line-sweep"]').isDisabled();
  check(locked, 'the line is LOCKED once the fight starts (§27.2)');
  const lockNote = await text(page, '[data-testid="standoff"]');
  check(/cannot be changed now/.test(lockNote), 'and the panel says why rather than going quiet');

  await page.locator('[data-testid="strike"]').click({ timeout: 4000 });
  await page.waitForTimeout(500);
  const log1 = await text(page, '[data-testid="standoff-log"]');
  console.log(`      ${log1}`);
  check(/Adjacency chain works for/.test(log1), 'THE DRILL LINE ACTED WITHOUT BEING ASKED', log1.slice(0, 90));

  // ── C. THE COUNTER ──────────────────────────────────────────────────────
  console.log('C — the Deepwrought counters a repeated STRIKE');
  await page.locator('[data-testid="strike"]').click({ timeout: 4000 });
  await page.waitForTimeout(500);
  const log2 = await text(page, '[data-testid="standoff-log"]');
  const intent2 = await text(page, '[data-testid="intent"]');
  console.log(`      ${log2}`);
  console.log(`      intent: ${intent2}`);
  check(/same way twice/.test(log2), 'a repeated stance lands for HALF', log2.slice(0, 110));
  check(/has your number/.test(intent2), 'AND ITS NEXT INTENT COUNTERS IT (§27.3)', intent2);
  await shoot(page, 'C-repeat-punished');

  // The counter is not a threat that never arrives: play into it and take it.
  const windBefore = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => { standoff: { wind: number; chain: number } } };
    return e.getState().standoff.wind;
  });
  await page.locator('[data-testid="strike"]').click({ timeout: 4000 });
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => { standoff: { wind: number; chain: number; compaction: number } } };
    return e.getState().standoff;
  });
  check(windBefore - after.wind >= 9, 'the counter lands harder than a swing',
    `${windBefore.toFixed(0)} -> ${after.wind.toFixed(0)} wind`);
  check(after.chain === 0, 'and it interrupts the chain the line was building', `chain ${after.chain}`);

  // ── D. IT COMPACTS, AND LEAVING IS FREE ─────────────────────────────────
  console.log('D — it compacts, and WITHDRAW costs nothing');
  const packed = await text(page, '[data-testid="compaction"]');
  console.log(`      ${packed}`);
  check(/packed [1-9]/.test(packed), 'it has hardened, visibly, and the panel counts it', packed);
  await shoot(page, 'D-compacting');

  const depthBefore = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => { depth: number; forge: { tools: unknown } } };
    const s = e.getState();
    return { depth: s.depth, tools: JSON.stringify(s.forge.tools) };
  });
  await page.locator('[data-testid="withdraw"]').click({ timeout: 4000 });
  await page.waitForTimeout(500);
  const outcome = await text(page, '[data-testid="standoff"]');
  check(/You backed off/.test(outcome), 'withdrawing ends it');
  const depthAfter = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => { depth: number; forge: { tools: unknown } } };
    const s = e.getState();
    return { depth: s.depth, tools: JSON.stringify(s.forge.tools) };
  });
  check(depthAfter.depth === depthBefore.depth, 'and costs no depth', `${depthBefore.depth} -> ${depthAfter.depth}`);
  check(depthAfter.tools === depthBefore.tools, 'NEVER THE TOOL');

  // Re-engaging is possible: the line can be changed again now, and only now.
  await page.locator('[data-testid="dismiss"]').click({ timeout: 4000 });
  await page.waitForTimeout(500);
  check(!(await page.locator('[data-testid="line-sweep"]').isDisabled()),
    'the line is choosable again once the fight is over');

  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(overflow === 0, 'no horizontal overflow at 380px', `${overflow}px`);
  check(errors.length === 0, 'no page errors throughout', errors.join(' | '));
  console.log(problems.length === 0 ? '\nALL PASS' : `\nFAILURES: ${problems.join(', ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
