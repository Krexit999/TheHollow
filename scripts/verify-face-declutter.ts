/**
 * THE FACE, DECLUTTERED — verified in play.
 *
 *   A  no compaction digit on any cell, at any compaction, including 26
 *   B  no floating verb pill over the canvas
 *   C  the verbs are still reachable, as plain HTML under the face
 *
 * A is read off the PIXI SCENE GRAPH, not off a screenshot: "I cannot see a
 * number" in a 380px capture is not the same claim as "no Text object is
 * attached to any tile", and only the second one is checkable.
 *
 *   npx tsx scripts/verify-face-declutter.ts [port]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = `http://localhost:${process.argv[2] ?? '5173'}`;
const OUT = 'sim-out/shots-declutter';
const problems: string[] = [];
const check = (ok: boolean, label: string, detail = ''): void => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(label);
};

const ALL_ROOMS = ['dig', 'shaft', 'kiln', 'drills', 'hold', 'casting', 'refinery', 'collapse', 'delver'];

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
  await page.waitForTimeout(3500);
  await page.evaluate((ids) => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { dispatch: (a: unknown) => unknown };
    e.dispatch({ type: 'markSystemsSeen', ids });
  }, ALL_ROOMS);
  await page.waitForTimeout(400);

  // ── A. WORK THE WHOLE FACE TO MAX COMPACTION ────────────────────────────
  // The reported screenshot was a face of 21-26s. Reproduce exactly that, then
  // ask the scene graph whether any tile carries a Text child.
  console.log('A — a fully compacted face carries no digits');
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; tick: (n: number) => void };
    const s = e.getState() as unknown as { face: { compaction?: number[]; cells: number[] } };
    // Straight to the state the screenshot showed: everything at or near 26.
    s.face.compaction = s.face.cells.map((_, i) => (i === 35 ? 14 : 21 + (i % 6)));
    e.tick(0.5);
  });
  await page.waitForTimeout(1200);

  const scene = await page.evaluate(() => {
    const v = (window as unknown as { __faceView?: unknown }).__faceView as unknown as {
      tiles: { g: { children: { constructor: { name: string }; text?: string }[] } }[];
    } | undefined;
    if (!v) return null;
    let textChildren = 0;
    const samples: string[] = [];
    for (const t of v.tiles) {
      for (const c of t.g.children ?? []) {
        // A Pixi Text has a `text` property; a Graphics does not.
        if (typeof (c as { text?: string }).text === 'string') {
          textChildren += 1;
          if (samples.length < 5) samples.push(String((c as { text?: string }).text));
        }
      }
    }
    return { tiles: v.tiles.length, textChildren, samples };
  });
  console.log(`      ${JSON.stringify(scene)}`);
  check(scene !== null, 'the face view is live and inspectable');
  check((scene?.tiles ?? 0) >= 36, 'the whole face is built', `${scene?.tiles} tiles`);
  check(scene?.textChildren === 0, 'NO TILE CARRIES A TEXT CHILD — the digits are gone',
    `${scene?.textChildren} found ${JSON.stringify(scene?.samples ?? [])}`);

  // The compaction SIGNAL is still there — the wash and the terminal ring.
  const stillSignals = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as { getState: () => never };
    const s = e.getState() as unknown as { face: { compaction?: number[] } };
    const c = s.face.compaction ?? [];
    return { max: Math.max(...c), atTerminal: c.filter((n) => n >= 20).length };
  });
  check(stillSignals.max >= 20, 'the rock really is worked to the terminal gate',
    `max ${stillSignals.max}, ${stillSignals.atTerminal} cells at/над 20`);
  await page.screenshot({ path: `${OUT}/A-no-digits.png` });
  console.log('  shot A-no-digits');

  // ── B. NO FLOATING PILL OVER THE CANVAS ─────────────────────────────────
  console.log('B — no verb pill over the face');
  const overlay = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const host = canvas?.parentElement?.parentElement;
    if (!host) return null;
    // Any BUTTON positioned inside the canvas host is chrome sitting on the rock.
    const buttons = [...host.querySelectorAll('button')].map((b) => b.textContent?.trim());
    return { buttons };
  });
  console.log(`      buttons inside the face host: ${JSON.stringify(overlay?.buttons)}`);
  check((overlay?.buttons.length ?? 1) === 0, 'the face host holds no buttons at all',
    JSON.stringify(overlay?.buttons));

  // ── C. THE VERBS ARE STILL REACHABLE ────────────────────────────────────
  console.log('C — the verbs live under the face, in plain HTML');
  const verbs = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="face-verbs"]');
    if (!el) return null;
    return {
      onCanvas: el.closest('canvas') !== null,
      buttons: [...el.querySelectorAll('button')].map((b) => b.textContent?.trim()),
      text: (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim().slice(0, 60),
    };
  });
  console.log(`      ${JSON.stringify(verbs)}`);
  check(verbs !== null, 'the verb row exists');
  check((verbs?.buttons ?? []).includes('Chip'), 'Chip is reachable');
  check((verbs?.buttons ?? []).includes('Sweep'), 'Sweep is reachable — not cut');
  const skim = (verbs?.buttons ?? []).find((b) => /Skim/.test(b ?? ''));
  check(!!skim, 'Skim is reachable — not cut', skim ?? 'absent');

  // ...and switching to Sweep still works from here.
  await page.locator('[data-testid="verb-sweep"]').click({ timeout: 5000 });
  await page.waitForTimeout(500);
  const sweptOn = await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { faceMode: string } }>)['__ui']!;
    return ui.getState().faceMode;
  });
  check(sweptOn === 'sweep', 'and pressing Sweep really changes the mode', sweptOn);
  await page.screenshot({ path: `${OUT}/C-verbs-under-face.png` });
  console.log('  shot C-verbs-under-face');

  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(overflow === 0, 'no horizontal overflow at 380px', `${overflow}px`);
  check(errors.length === 0, 'no page errors throughout', errors.join(' | '));

  console.log(problems.length === 0 ? '\nALL PASS' : `\nFAILURES: ${problems.join(', ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
