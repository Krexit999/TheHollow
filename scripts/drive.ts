/**
 * THE DRIVER — play the real game in a browser, far enough to render any panel.
 *
 * Shared by every UI-verification script. The rest of SYSTEM_IMPROVEMENTS is a
 * UI pass, so "can we get a panel on screen and look at it" is load-bearing
 * tooling, not a one-off.
 *
 * TWO BUGS COST A WHOLE SESSION AND BOTH LOOKED LIKE SUCCESS:
 *
 *  1. DESCEND AND COLLAPSE ARE HOLD CONTROLS. A plain `.click()` does nothing.
 *     The button reports enabled, playwright reports the click landed, and the
 *     game correctly ignores it — fourteen rounds of "descending" that never
 *     left depth 0.
 *  2. THE BUY BUTTON'S ACCESSIBLE NAME IS NOT ITS LABEL. It renders
 *     "Buy ×1 · 50" but its aria-label is "Buy 1 Whetted Blades for Dust"
 *     (UpgradeRow.tsx). Matching the visible text found ZERO elements, so the
 *     spam helper broke out of its loop on the first iteration and every
 *     upgrade stayed at level 0 while the driver reported buying ten of them.
 *
 * Both are the project's recurring failure mode — an instrument that cannot
 * tell "did nothing" from "did the thing" — so this module asserts PROGRESS
 * (depth actually rose) rather than trusting that its clicks meant anything.
 */
import type { Page } from 'playwright';

/** Accessible names, which are NOT the visible labels. See the note above. */
export const SEL = {
  buy: /^Buy \d+ /,
  open: /^(Open|Build) /,
  descend: /^Descend/,
  collapse: /Hold for the/,
};

export async function chip(page: Page, times: number): Promise<void> {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no face canvas — the game did not mount');
  for (let i = 0; i < times; i++) {
    await page.mouse.click(
      box.x + box.width * (0.2 + 0.6 * Math.random()),
      box.y + box.height * (0.2 + 0.6 * Math.random()),
    );
  }
}

/** Hold-to-confirm. Returns false when the control is absent or disabled. */
export async function hold(page: Page, label: RegExp, ms = 1050): Promise<boolean> {
  const b = page.getByRole('button', { name: label }).first();
  if ((await b.count()) === 0) return false;
  if (await b.isDisabled().catch(() => true)) return false;
  await b.hover().catch(() => {});
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
  await page.waitForTimeout(100);
  return true;
}

/** Click every affordable match, newest state each time. */
export async function clickAll(page: Page, label: RegExp, rounds: number): Promise<number> {
  let hits = 0;
  for (let i = 0; i < rounds; i++) {
    const all = page.getByRole('button', { name: label });
    const n = await all.count();
    if (n === 0) break;
    let clicked = false;
    for (let j = 0; j < n; j++) {
      const b = all.nth(j);
      if (await b.isDisabled().catch(() => true)) continue;
      await b.click({ timeout: 700 }).catch(() => {});
      hits++;
      clicked = true;
    }
    if (!clicked) break;
  }
  return hits;
}

export const deepest = async (page: Page): Promise<number> =>
  Number((await page.locator('body').innerText()).match(/Deepest: (\d+)/)?.[1] ?? 0);

export async function room(page: Page, name: RegExp): Promise<boolean> {
  const t = page.getByRole('button', { name }).first();
  if ((await t.count()) === 0) return false;
  await t.click().catch(() => {});
  await page.waitForTimeout(350);
  return true;
}

/**
 * THE DEV HOOKS ARE THE INTENDED ROUTE, AND THEY WERE THERE ALL ALONG.
 *
 * `main.tsx` exposes `window.__engine` and `window.__ui` in DEV with a comment
 * saying exactly this: "lets the screenshot harness and console poke the engine
 * and drive UI navigation without brittle role selectors." A whole session went
 * into brittle role selectors before anyone read it.
 *
 * Hand-playing to a renderable state is not just slow, it is the WRONG TOOL for
 * a layout check: the early game is minutes long BY DESIGN (pillar 7), so a
 * driver that plays it honestly spends its whole budget proving the pacing we
 * already measure in the sim. For RENDERING, a stipulated state is correct —
 * the recursion-scenario lesson was that stipulated numbers must not feed
 * RATIOS, not that they must not feed a screenshot.
 */
export async function setup(page: Page, fn: string): Promise<void> {
  const err = await page.evaluate((src) => {
    const w = window as unknown as Record<string, unknown>;
    if (!w['__engine']) return '__engine missing — is this a DEV build?';
    try {
      // eslint-disable-next-line no-new-func
      new Function('engine', 'ui', src)(w['__engine'], w['__ui']);
      return null;
    } catch (e) { return String(e); }
  }, fn);
  if (err) throw new Error(`setup failed: ${err}`);
  await page.waitForTimeout(400);
}

/**
 * Clear anything modal sitting over the page.
 *
 * Two things cover the board after a seeded collapse and BOTH looked like the
 * panel being broken: the post-fall `RunSummaryModal` ("Begin again") and the
 * disclosure gate that batches new-room reveals ("One at a time"). A shot taken
 * without dismissing them reports half the panel missing, which is how the
 * first pass of this script "found" three absent labels that were on screen.
 */
export async function dismiss(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    let clicked = false;
    // 'Go on, then' is the SINGLE-item wording of the same gate button, and it
    // was missing here for several phases: any run that revealed exactly one
    // new system hit a full-screen modal this helper could not close, and the
    // failure surfaced as an unrelated click timing out 57 times.
    /**
     * `/^Begin again$/` IS ANCHORED, AND THAT IS A BUG FIX (A.97).
     *
     * The run-summary modal's button says exactly "Begin again" (`qol.tsx`).
     * The RECURSION button says "Begin again, knowing — RECURSION n"
     * (`hollow.tsx`) — and the unanchored pattern matched BOTH, so every driver
     * run that opened the rewrite tab silently fired the third reset layer in
     * the game while trying to close a modal. It cost A.97 three failing checks
     * that read as engine bugs: a pour "refused", a Recursion count one higher
     * than the driver had counted, and a rack the reset had emptied.
     *
     * An instrument that cannot tell "closed a dialog" from "ended the world"
     * is the recurring failure mode this file was written about.
     */
    for (const label of [/^Begin again$/, /One at a time/, /Go on, then/, /^Got it$/, /^Continue$/, /^Close$/]) {
      const b = page.getByRole('button', { name: label }).first();
      if ((await b.count()) > 0 && !(await b.isDisabled().catch(() => true))) {
        await b.click({ timeout: 700 }).catch(() => {});
        clicked = true;
        await page.waitForTimeout(250);
      }
    }
    /**
     * ...AND THEN CHECK IT IS ACTUALLY GONE (A.101).
     *
     * The gate opens on a RENDER, so a helper that clicks once and returns can
     * lose the race with the render that reveals the next batch — which is what
     * it did here: block L's hold arm failed twice with the modal sitting over
     * the RECURSION button, and `hover()` timed out for thirty seconds saying
     * only "intercepts pointer events".
     *
     * ESCAPE IS THE RELIABLE LEVER — `DisclosureGate` supports it by design
     * ("a modal that can only be closed by one button is..."), so it does not
     * depend on this file keeping a list of button labels in sync with the UI.
     * Loop until no full-screen dialog remains.
     */
    const stillUp = await page.evaluate(() =>
      document.querySelectorAll('[role="dialog"][aria-modal="true"]').length);
    if (stillUp > 0) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(250);
      clicked = true;
    }
    if (!clicked) return;
  }
}

/** Every full-screen modal currently over the page, by its accessible name. */
export async function modalsUp(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]'))
      .map((n) => n.getAttribute('aria-label') ?? '(unnamed)'));
}

/** Jump to a room by id (see src/ui/store.ts Tab) rather than by label. */
export async function tab(page: Page, id: string): Promise<void> {
  await page.evaluate((t) => {
    const w = window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>;
    w['__ui']?.getState().setTab(t);
  }, id);
  await page.waitForTimeout(400);
}

/**
 * Play to a target depth record with the hands, for the cases that need a real
 * economy underneath them. Regen-bound, not click-bound: the face holds
 * cells x cap and hand-chipping empties it in seconds, after which clicking
 * does nothing until it refills — so this alternates chipping with waiting.
 * Slow; prefer `setup` unless the test is ABOUT the early loop.
 */
export async function playTo(page: Page, targetDepth: number, budgetMs = 240_000): Promise<number> {
  const started = Date.now();
  let best = 0;
  let stalled = 0;
  while (Date.now() - started < budgetMs) {
    await chip(page, 45);
    await clickAll(page, SEL.buy, 3);
    await page.waitForTimeout(2500); // the field refills — this IS the income
    await chip(page, 45);
    await clickAll(page, SEL.buy, 3);
    for (let d = 0; d < 8; d++) if (!(await hold(page, SEL.descend, 950))) break;

    const rec = await deepest(page);
    if (rec > best) { best = rec; stalled = 0; } else { stalled++; }
    if (rec >= targetDepth) return rec;
    if (stalled === 4) await clickAll(page, SEL.open, 2);
    if (stalled > 12) break;
  }
  return best;
}
