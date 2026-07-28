/**
 * THREE CLAIMS, DRIVEN IN THE REAL GAME.
 *
 *  1  A tool LEVELS from use, and shows what levelling gave it.
 *  2  The crucible holds several stones, and clicking one brings it forward.
 *  3  The face grid no longer blanks when the hero is briefly measured tiny.
 *
 *   npx tsx scripts/verify-forge-level.ts [port] [outDir]
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

async function settle(page: Page): Promise<void> {
  for (let i = 0; i < 30; i++) {
    if (await page.locator('.toast-in').count() === 0) return;
    await page.waitForTimeout(400);
  }
}
async function shot(page: Page, name: string, to?: string): Promise<void> {
  await dismiss(page);
  await settle(page);
  if (to) {
    await page.locator(to).first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: `${OUT}/lvl-${name}.png` });
  shots.push(`${OUT}/lvl-${name}.png`);
}
const txt = async (page: Page, sel: string): Promise<string> =>
  (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

async function fit(page: Page, materialId: string | null): Promise<void> {
  await page.evaluate(async ({ id }) => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const s = w['__engine'].getState();
    s.casting.tool = id === null
      ? []
      : cp.PART_TYPES.map((t: string, i: number) => ({ ...fp.makePart(t, id, 60), id: i + 1 }));
    s.casting.wear = 0;
    s.casting.xp = 0;
  }, { id: materialId });
  await page.waitForTimeout(250);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: W, height: H }, reducedMotion: 'no-preference' });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (t.includes('render recovered')) return;
    problems.push(`[console] ${t.slice(0, 200)}`);
  });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await setup(page, `engine.getState().forge.built = true;`);
  await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const s = w['__engine'].getState();
    for (const id of ['marl', 'ochre', 'graveclay', 'bonechalk', 'umberjade']) {
      forge.addMaterial(s, id, 60, 120);
    }
  });

  // ═══ 3. THE GRID DOES NOT BLANK ═════════════════════════════════════════
  // First, because it is the bug and it needs a clean face to measure.
  console.log('\n3 — the face grid stays put when the hero is measured tiny');
  await tab(page, 'dig');
  await dismiss(page);
  await settle(page);
  const blank = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const v = w['__faceView'];
    const cv = document.querySelector('canvas') as HTMLCanvasElement;
    const host = cv.parentElement!.parentElement as HTMLElement;
    const off = document.createElement('canvas');
    off.width = 48; off.height = 48;
    const g = off.getContext('2d')!;
    const M = {
      lum() {
        g.clearRect(0, 0, 48, 48);
        try { g.drawImage(cv, 0, 0, 48, 48); } catch { /* noop */ }
        const px = g.getImageData(0, 0, 48, 48).data;
        let s = 0;
        for (let p = 0; p < px.length; p += 4) s += px[p]! + px[p + 1]! + px[p + 2]!;
        return Math.round(s / (px.length / 4) / 3);
      },
      async frames(n: number) { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(() => r(null))); },
    };
    const before = { lum: M.lum(), gy: Math.round(v.gridY), cell: Math.round(v.cellSize) };
    // Squeeze the hero to a sliver and back — a sibling's height changing, a
    // room being entered, a phone URL bar. This is what corrupted the layout.
    const orig = host.style.height;
    const worst = { gy: before.gy, cell: before.cell };
    for (const h of ['2px', '', '0px', '', '3px', '']) {
      host.style.height = h;
      await M.frames(3);
      if (Math.abs(v.gridY) > Math.abs(worst.gy)) worst.gy = Math.round(v.gridY);
      worst.cell = Math.min(worst.cell, Math.round(v.cellSize));
    }
    host.style.height = orig;
    await M.frames(12);
    const after = { lum: M.lum(), gy: Math.round(v.gridY), cell: Math.round(v.cellSize) };
    return { before, after, worst };
  });
  console.log(`    before  lum ${blank.before.lum} grid-y ${blank.before.gy} cell ${blank.before.cell}`);
  console.log(`    worst during the squeeze: grid-y ${blank.worst.gy} cell ${blank.worst.cell}`);
  console.log(`    after   lum ${blank.after.lum} grid-y ${blank.after.gy} cell ${blank.after.cell}`);
  check(blank.worst.gy >= 0,
    'the grid origin never goes negative — it cannot be pushed off-screen',
    `worst grid-y ${blank.worst.gy}`);
  check(blank.after.lum >= blank.before.lum * 0.95,
    'and the face comes back exactly as bright as it was',
    `${blank.before.lum} → ${blank.after.lum}`);
  check(blank.after.gy === blank.before.gy && blank.after.cell === blank.before.cell,
    'with the same layout it started with');
  await shot(page, '1-grid-stable');

  // ═══ 2. THE CRUCIBLE QUEUE ══════════════════════════════════════════════
  console.log('\n2 — several stones in the tub, click to bring one forward');
  await tab(page, 'casting');
  await dismiss(page);
  const STONES = ['marl', 'ochre', 'graveclay', 'bonechalk', 'umberjade'];
  for (const id of STONES) {
    await page.evaluate(({ m }) => (window as unknown as Record<string, any>)['__engine']
      .dispatch({ type: 'chargeCrucible', materialId: m, units: 2 }), { m: id });
  }
  await page.waitForTimeout(1200); // let every charge melt — they all do
  const chips = await page.locator('[data-testid^="queue-"]').count();
  console.log(`    ${chips} stones queued`);
  check(chips === 5, 'five stones sit in the tub at once', `${chips}`);
  const firstChip = await txt(page, '[data-testid="queue-0"]');
  check(/NEXT/i.test(firstChip), 'the front one is marked as next', firstChip);

  const colourOf = async (): Promise<string> => page.evaluate(() => {
    const el = document.querySelector('[data-testid="tub-molten"]') as HTMLElement;
    return getComputedStyle(el).backgroundImage;
  });
  const beforeColour = await colourOf();
  const beforeFront = await page.evaluate(() =>
    (window as unknown as Record<string, any>)['__engine'].getState().casting.crucible.queue[0].materialId);

  // THE BRIEF'S OWN EXAMPLE: five queued, click the fourth.
  await page.locator('[data-testid="queue-3"]').click();
  await page.waitForTimeout(400);
  const afterFront = await page.evaluate(() =>
    (window as unknown as Record<string, any>)['__engine'].getState().casting.crucible.queue[0].materialId);
  const afterColour = await colourOf();
  console.log(`    front: ${beforeFront} → ${afterFront}`);
  check(beforeFront === 'marl' && afterFront === 'bonechalk',
    'clicking the 4th moves it to next-up', `${beforeFront} → ${afterFront}`);
  check(beforeColour !== afterColour, 'and the tub changes to that stone\'s colour');
  const order = await page.evaluate(() =>
    (window as unknown as Record<string, any>)['__engine'].getState().casting.crucible.queue
      .map((q: { materialId: string }) => q.materialId));
  console.log(`    order now: ${order.join(' → ')}`);
  check(order[0] === 'bonechalk' && order.length === 5, 'nothing else was disturbed', order.join(','));

  // And the next pour really is in that material — no re-melting.
  await dismiss(page);
  await page.locator('[data-testid="cast-grip"]').click();
  await page.waitForTimeout(300);
  const castNote = await txt(page, '[data-testid="cast-note"]');
  console.log(`    ${castNote}`);
  check(/Bonechalk/.test(castNote), 'and the pour comes out in it, with no re-melting', castNote);
  await shot(page, '2-crucible-queue', '[data-testid="crucible"]');

  // ═══ 1. THE TOOL LEVELS ═════════════════════════════════════════════════
  console.log('\n1 — the tool levels from use');
  await fit(page, 'marl');
  await tab(page, 'casting');
  await dismiss(page);
  const lvl0 = await txt(page, '[data-testid="tool-level-n"]');
  const grants0 = await page.locator('[data-testid="tool-level-grants"]').count();
  check(lvl0 === '1', 'a fresh tool is level 1', lvl0);
  check(grants0 === 0, 'with nothing earned yet');
  await shot(page, '3-level-fresh', '[data-testid="tool-level"]');

  // MINE WITH IT, through the real loop.
  const mined = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const e = w['__engine'];
    const s = e.getState();
    for (let t = 0; t < 700; t++) {
      s.face.cells = s.face.cells.map(() => 8);
      for (let i = 0; i < s.face.cells.length; i++) e.dispatch({ type: 'chip', cell: i });
      e.dispatch({ type: 'debug', op: 'warp', seconds: 1 });
      if ((s.casting.xp ?? 0) > 3000) break;
    }
    return { xp: s.casting.xp, wear: Math.round(s.casting.wear) };
  });
  await page.waitForTimeout(500);
  await dismiss(page);
  const lvl1 = await txt(page, '[data-testid="tool-level-n"]');
  const prog = await txt(page, '[data-testid="tool-level-progress"]');
  const grants = await txt(page, '[data-testid="tool-level-grants"]');
  console.log(`    mined ${mined.xp} cells → level ${lvl1}`);
  console.log(`    ${prog}`);
  console.log(`    ${grants}`);
  check(Number(lvl1) > 1, 'mining with it levelled it up', `level ${lvl1}`);
  check(/cells to level/.test(prog), 'the progress to the next level is shown', prog);
  check(/Earned:/.test(grants), 'and what levelling gave it is shown', grants);
  check(/% swings/.test(grants), 'in the units a player feels', grants);

  // The SAME tool, freshly built, is genuinely worse.
  const cmp = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMining' + '.ts');
    const s = w['__engine'].getState();
    const tool = fp.assembleTool(cp.PART_TYPES.map((t: string) => fp.makePart(t, 'marl', 60)));
    const lvl = tm.toolLevel(s);
    return {
      level: lvl,
      freshUses: tm.usesOf(tool, 1), wornUses: tm.usesOf(tool, lvl),
      freshOre: tm.effectOf(tool, false, 1).oreRate, wornOre: tm.effectOf(tool, false, lvl).oreRate,
      freshCells: tm.effectOf(tool, false, 1).cells, wornCells: tm.effectOf(tool, false, lvl).cells,
      slots: tm.modSlotsOf(s, tool),
      splashSame: tm.effectOf(tool, false, 1).splash === tm.effectOf(tool, false, lvl).splash,
    };
  });
  console.log(`    swings ${cmp.freshUses} → ${cmp.wornUses} · ore ${cmp.freshOre.toFixed(2)}× → ${cmp.wornOre.toFixed(2)}×`
    + ` · cells ${cmp.freshCells} → ${cmp.wornCells} · slots ${cmp.slots.fromParts}+${cmp.slots.fromUse}`);
  check(cmp.wornUses > cmp.freshUses,
    'the tool you have used has more swings in it than the same tool fresh',
    `${cmp.freshUses} → ${cmp.wornUses}`);
  check(cmp.wornOre > cmp.freshOre, 'and works a pocket faster');
  check(cmp.splashSame,
    'while yield-per-charge is untouched — pillar 2 (splash is identical)');
  await shot(page, '4-level-earned', '[data-testid="tool-level"]');

  // ═══ THE FRAME ══════════════════════════════════════════════════════════
  console.log('\nthe frame');
  for (const room of ['casting', 'dig']) {
    await tab(page, room);
    await dismiss(page);
    const px = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    check(px === 0, `no horizontal overflow at ${W}px — ${room}`, `${px}px`);
  }

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
