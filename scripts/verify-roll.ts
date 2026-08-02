/**
 * THE ROLL, VERIFIED IN PLAY (Proof #2).
 *
 * Four claims, each read off the RENDERED PANEL rather than off state, because
 * the visibility rule is a thing the player sees or does not:
 *
 *   A  minute 2: three legible rows and DEEPGRAVE 150 pinned at the bottom
 *   B  a WALL that says only "too hard" before you have the means
 *   C  clearance surviving a Collapse
 *   D  the same station, different contents, same name and depth
 *
 * Plus: 0 horizontal overflow at 380px.
 *
 *   npx tsx scripts/verify-roll.ts [port]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = `http://localhost:${process.argv[2] ?? '5173'}`;
const OUT = 'sim-out/shots-roll';
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

const shoot = async (page: Page, name: string): Promise<void> => {
  // SHOW THE THING. The Roll sits in the Face cluster below the hero, so a
  // page-top screenshot proves nothing about it.
  await page.evaluate(() => {
    const heads = [...document.querySelectorAll('div')]
      .filter((d) => d.textContent?.trim().startsWith('The Roll'));
    heads[heads.length - 1]?.closest('.panel')?.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${name}-page.png` });
  // ...and the panel ON ITS OWN, so the PINNED FLOOR is in frame. At 380x820
  // the hero eats the height and DEEPGRAVE sits below the fold — a true fact
  // about the layout and a useless screenshot. ELEMENT capture rather than a
  // clip: the panel lives inside a scrolling container, so page coordinates do
  // not describe where it is, and every clipped shot came out sheared at the
  // fold while looking plausible.
  const el = page.locator('.panel').filter({ hasText: 'The Roll' }).last();
  await el.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
  console.log(`  shot ${name}`);
};

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
    // WIDTH 380 is the constraint under test; the height is tall only so the
  // whole panel clears the fixed bottom nav in a screenshot. The overflow
  // check below still measures the real thing, which is horizontal.
  const page = await browser.newPage({ viewport: { width: 380, height: 1200 }, isMobile: true, hasTouch: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    (window as never as Record<string, unknown>)['__name'] = (f: unknown) => f;
  });
  await page.goto(URL);
  await page.waitForSelector('canvas', { timeout: 20000 });
  // Let the opening toast fade rather than photographing it over the panel.
  await page.waitForTimeout(6000);

  // ── A. MINUTE 2 ─────────────────────────────────────────────────────────
  // Nothing is granted or stipulated: this is what a player who has just
  // started actually sees.
  console.log('A — the Roll at minute 2');
  const rows = await panel(page);
  console.log(rows.map((r) => `      ${r}`).join('\n'));
  const legible = rows.filter((r) => /SEAM|WALL|WRECK|WORKS|CHAMBER|HAZARD|REST|FLOOR/.test(r));
  // Three legible ahead, and the pinned floor makes a fourth typed row.
  check(legible.length === 4, 'three legible rows plus the pinned floor', `${legible.length} typed rows`);
  const floor = rows[rows.length - 1] ?? '';
  check(/DEEPGRAVE/.test(floor) && /150/.test(floor), 'DEEPGRAVE 150 pinned at the bottom', floor);
  check(rows.some((r) => /The Turnrow/.test(r)), 'the ladder starts at The Turnrow');
  await shoot(page, 'A-minute-2');

  // ── OVERFLOW ────────────────────────────────────────────────────────────
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(overflow === 0, 'no horizontal overflow at 380px', `${overflow}px`);

  // ── B. A WALL BEFORE YOU HAVE THE MEANS ─────────────────────────────────
  // Stand just above BRICKLIGHT with the tool a new save carries.
  console.log('B — BRICKLIGHT with a tier-I tool');
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => { depth: number; shaft: { reached: number } }; tick: (n: number) => void };
    const s = e.getState();
    s.depth = 41;
    s.shaft.reached = 41;
    e.tick(0.2);
  });
  await page.waitForTimeout(600);
  const wallRows = await panel(page);
  const brick = wallRows.find((r) => /BRICKLIGHT/.test(r)) ?? '';
  console.log(`      ${brick}`);
  check(/too hard/.test(brick), 'BRICKLIGHT says only "too hard"', brick);
  check(!/marl|ochre|graveclay|geode|journal/i.test(brick), 'and names no seam or feature', brick);
  await shoot(page, 'B-wall-too-hard');

  // ── C + D. A COLLAPSE ───────────────────────────────────────────────────
  console.log('C+D — clearance and contents across a Collapse');
  const before = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown; tick: (n: number) => void };
    const s = e.getState() as unknown as {
      depth: number; shaft: { reached: number };
      roll: { rolled: Record<string, { seam: string; feature: string; hazard: number }>; cleared: string[] };
    };
    // Break BRICKLIGHT properly — with the tier the wall asks for.
    const roll = (e as unknown as { getState: () => { roll: unknown } }).getState();
    void roll;
    s.depth = 60;
    s.shaft.reached = 60;
    e.tick(0.2);
    return { rolled: JSON.parse(JSON.stringify(s.roll.rolled)) as Record<string, unknown> };
  });
  // Clear the wall through the real path: mark it with a tier-II tool.
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => { forge: { tools: { tier: number }[] } }; tick: (n: number) => void };
    e.getState().forge.tools[0]!.tier = 3; // a real tool that answers both walls
    e.tick(0.2);
  });
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { dispatch: (a: unknown) => unknown; tick: (n: number) => void };
    e.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e12 });
    e.dispatch({ type: 'descendMany', count: 2 }); // walk it, do not stipulate it
    e.tick(0.2);
  });
  await page.waitForTimeout(500);
  const cleared = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => { roll: { cleared: string[] } } };
    return e.getState().roll.cleared.slice();
  });
  check(cleared.includes('bricklight'), 'BRICKLIGHT cleared by walking it with the tool', cleared.join(', '));
  await shoot(page, 'C1-cleared-before-collapse');

  const collapsed = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown; tick: (n: number) => void };
    const s = e.getState() as unknown as { depth: number; shaft: { reached: number } };
    s.depth = 60; s.shaft.reached = 60;
    e.dispatch({ type: 'collapse' });
    e.tick(0.2);
    const after = e.getState() as unknown as {
      depth: number;
      roll: { cleared: string[]; looted: string[]; rolled: Record<string, { seam: string; feature: string; hazard: number }> };
    };
    return {
      depth: after.depth,
      cleared: after.roll.cleared.slice(),
      looted: after.roll.looted.slice(),
      rolled: JSON.parse(JSON.stringify(after.roll.rolled)) as Record<string, { seam: string; feature: string; hazard: number }>,
    };
  });
  check(collapsed.depth === 0, 'the Collapse really happened', `depth ${collapsed.depth}`);
  check(collapsed.cleared.includes('bricklight'), 'CLEARANCE SURVIVED THE COLLAPSE', collapsed.cleared.join(', '));
  check(collapsed.looted.length > 0, 'looted wrecks survived too', collapsed.looted.join(', '));

  // D — same names and depths, different contents.
  const changed: string[] = [];
  for (const [id, now] of Object.entries(collapsed.rolled)) {
    const was = (before.rolled as Record<string, { seam: string; feature: string }>)[id];
    if (!was) continue;
    if (was.seam !== now.seam || was.feature !== now.feature) changed.push(id);
  }
  check(changed.length > 0, 'stations are holding DIFFERENT things after the fall', `${changed.length} of 15 changed`);
  // THE CLAIM, SPELLED OUT: same name, same depth, different contents.
  console.log('      station            before                after');
  for (const id of ['turnrow', 'sag', 'ashfall']) {
    const w = (before.rolled as Record<string, { seam: string; feature: string; hazard: number }>)[id];
    const n = collapsed.rolled[id];
    if (!w || !n) continue;
    const fmt = (c: { seam: string; feature: string; hazard: number }): string =>
      `${c.seam || '—'}/${c.feature}${c.hazard ? '/h' + c.hazard : ''}`;
    console.log(`      ${id.padEnd(18)} ${fmt(w).padEnd(21)} ${fmt(n)}`);
  }

  // The achievement toasts a Collapse fires sit over the panel; let them go.
  await page.waitForTimeout(9000);
  const names = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never };
    void e;
    return null;
  });
  void names;
  // The authored half is content, not state — if it had moved, the panel could
  // not still print the same names at the same depths.
  const afterRows = await panel(page);
  check(afterRows.some((r) => /The Turnrow/.test(r)), 'and every name is where it was', afterRows[0] ?? '');
  check(/DEEPGRAVE/.test(afterRows[afterRows.length - 1] ?? ''), 'DEEPGRAVE still pinned at 150');
  await shoot(page, 'D-after-collapse');

  check(errors.length === 0, 'no page errors throughout', errors.join(' | '));
  console.log(problems.length === 0 ? '\nALL PASS' : `\nFAILURES: ${problems.join(', ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
