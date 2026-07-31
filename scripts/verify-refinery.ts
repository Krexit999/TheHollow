/**
 * THE REFINERY EXTENSIONS, DRIVEN IN THE REAL GAME.
 *
 *  1  THE NEW TOP BAND — `pristine` exists, is UNROLLABLE (no drop makes it),
 *     and a refine reaches it.
 *  2  REFINE-TO-TARGET — the whole climb in one act, priced before you commit,
 *     and costing exactly what doing it by hand costs.
 *  3  THE FORGE KNOWS ABOUT THE TROUGH — the Casting stone picker says a stone
 *     could be taken up a band, and what that would cost.
 *  4  380px, 0 overflow.
 *
 *   npx tsx scripts/verify-refinery.ts [port] [outDir]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots';
const W = 380, H = 1500;

const problems: string[] = [];
const shots: string[] = [];
const check = (ok: boolean, label: string, detail = ''): boolean => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(`${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
};
async function tapp(page: Page, sel: string): Promise<void> {
  await dismiss(page);
  await page.locator(sel).first().click();
  await page.waitForTimeout(320);
}
async function shot(page: Page, name: string, full = false): Promise<void> {
  await dismiss(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/ref-${name}.png`, fullPage: full });
  shots.push(`${OUT}/ref-${name}.png`);
}
const txt = async (page: Page, sel: string): Promise<string> =>
  (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

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

  /** A player deep enough for the trough, with a heap of poor stock. */
  const stone = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const s = w['__engine'].getState();
    s.depthRecords['loam'] = 60;
    s.depthRecords['ferrite'] = 100;      // the Refinery gate is Ferrite mastery 3
    const pick = mats.materialsOfShell('loam')[0].id as string;
    // 243 poor = exactly enough to walk the whole ladder if nothing were lost.
    forge.addMaterial(s, pick, mats.BAND_RANGES['poor'][0], 243);
    return pick;
  });
  await page.waitForTimeout(400);

  // ═══ 1. THE NEW TOP BAND ═════════════════════════════════════════════════
  console.log('\n1 — pristine: a band you can only MAKE');

  const bands = await page.evaluate(async () => {
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    return { list: mats.BANDS as string[], range: mats.BAND_RANGES['pristine'] as number[] };
  });
  check(bands.list[bands.list.length - 1] === 'pristine',
    'the ladder has a new top', bands.list.join(' → '));
  check(bands.range[0]! > 100,
    'and it sits ABOVE what the world rolls', `[${bands.range.join(', ')}] vs a 0-100 drop`);

  const unrollable = await page.evaluate(async () => {
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    let top = 0;
    for (let i = 0; i < 4000; i++) {
      const d = mats.rollDrop('loam', 150);
      if (d && typeof d === 'object' && 'purity' in d) top = Math.max(top, Number(d.purity));
    }
    return top;
  });
  check(unrollable <= 100 && unrollable > 0,
    'no drop can roll into it — 4,000 rolls at depth 150', `best purity seen ${unrollable}`);

  // ═══ 2. REFINE-TO-TARGET ═════════════════════════════════════════════════
  console.log('\n2 — the whole climb in one act, priced first');

  await tab(page, 'refinery');
  await dismiss(page);
  await page.waitForTimeout(500);

  check(await page.locator(`[data-testid="climb-${stone}"]`).count() === 1,
    'the trough offers a climb for a stone that can make one');
  const quote = await page.locator(`[data-testid="climb-${stone}-good"]`).getAttribute('title');
  check(!!quote && /spent/.test(quote), 'and it QUOTES the climb before you commit', quote ?? '');

  const before = await page.evaluate(async ([id]) => {
    const w = window as unknown as Record<string, any>;
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const st = w['__engine'].getState().materials.stacks[id!] ?? {};
    return Object.fromEntries((mats.BANDS as string[]).map((b) => [b, st[b]?.count ?? 0]));
  }, [stone]);

  await tapp(page, `[data-testid="climb-${stone}-good"]`);
  const after = await page.evaluate(async ([id]) => {
    const w = window as unknown as Record<string, any>;
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const st = w['__engine'].getState().materials.stacks[id!] ?? {};
    return Object.fromEntries((mats.BANDS as string[]).map((b) => [b, st[b]?.count ?? 0]));
  }, [stone]);

  check((after['good'] ?? 0) > (before['good'] ?? 0),
    'one tap walks every rung to the target band',
    `good ${before['good']} → ${after['good']}`);
  const spent = (before['poor'] ?? 0) - (after['poor'] ?? 0);
  check(spent > 0, 'and it spends the bottom of the ladder to do it', `poor −${spent}`);
  const note = await txt(page, `[data-testid="climb-note-${stone}"]`);
  check(/spent/.test(note), 'and says what it cost', note);
  await shot(page, '1-climb');

  // IT IS NOT A DISCOUNT — the climb costs what doing it by hand costs.
  const same = await page.evaluate(async ([id]) => {
    const w = window as unknown as Record<string, any>;
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const ref = await import(/* @vite-ignore */ '/src/engine/systems/refinery' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const engine = w['__engine'];
    const s = engine.getState();
    const ctx = { emit() {}, dirty() {} };
    // Object-method shorthand, not a named arrow: tsx compiles a named const
    // arrow with keepNames and emits a __name() call that does not exist in-page.
    const C = {
      count(st: any) { return (mats.BANDS as string[]).reduce((n, b) => n + (st?.[b]?.count ?? 0), 0); },
    };

    // Two identical stacks on the same save, one climbed, one done by hand.
    const A = 'zzz_climb_probe';
    void A;
    // By hand: refine poor, then fair, then good — the rungs, one at a time.
    forge.addMaterial(s, id!, mats.BAND_RANGES['poor'][0], 81);
    const startHand = C.count(s.materials.stacks[id!]);
    ref.refine(s, ctx, id!, 'poor');
    ref.refine(s, ctx, id!, 'fair');
    const handCost = startHand - C.count(s.materials.stacks[id!]);

    // Reset to the same stock and climb it in one act.
    for (const b of mats.BANDS as string[]) {
      if (s.materials.stacks[id!]?.[b]) s.materials.stacks[id!][b] = { count: 0, puritySum: 0 };
    }
    forge.addMaterial(s, id!, mats.BAND_RANGES['poor'][0], 81);
    const startClimb = C.count(s.materials.stacks[id!]);
    ref.refineTo(s, ctx, id!, 'good');
    const climbCost = startClimb - C.count(s.materials.stacks[id!]);
    return { handCost, climbCost };
  }, [stone]);
  check(same.handCost === same.climbCost,
    'the climb costs exactly what doing it by hand costs — it is not a discount',
    `by hand ${same.handCost}, climbed ${same.climbCost}`);

  // AND IT REACHES THE NEW BAND.
  const reached = await page.evaluate(async ([id]) => {
    const w = window as unknown as Record<string, any>;
    const mats = await import(/* @vite-ignore */ '/src/engine/systems/../materials' + '.ts');
    const ref = await import(/* @vite-ignore */ '/src/engine/systems/refinery' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const s = w['__engine'].getState();
    const ctx = { emit() {}, dirty() {} };
    forge.addMaterial(s, id!, mats.BAND_RANGES['exalted'][0], 9);
    ref.refineTo(s, ctx, id!, 'pristine');
    const st = s.materials.stacks[id!];
    return { n: st?.pristine?.count ?? 0, purity: Math.round((st?.pristine?.puritySum ?? 0) / Math.max(1, st?.pristine?.count ?? 1)) };
  }, [stone]);
  check(reached.n > 0, 'and a refine really does reach pristine',
    `${reached.n} units at purity ${reached.purity}`);
  check(reached.purity > 100, 'at a purity the world cannot roll', `${reached.purity}`);

  // ═══ 3. THE FORGE KNOWS ABOUT THE TROUGH ═════════════════════════════════
  console.log('\n3 — the Casting floor says a stone could be taken up');

  // FRESH STOCK: the climb tests above legitimately SPENT what was in the Hold,
  // and a picker with nothing left to refine correctly offers nothing. Restock
  // rather than weaken the assertion.
  await page.evaluate(async ([id]) => {
    const w = window as unknown as Record<string, any>;
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    forge.addMaterial(w['__engine'].getState(), id!, mats.BAND_RANGES['poor'][0], 120);
  }, [stone]);
  await page.waitForTimeout(300);

  await tab(page, 'casting');
  await dismiss(page);
  await page.waitForTimeout(500);
  await tapp(page, `[data-testid="melt-picker-opt-${stone}"]`);
  const offer = await txt(page, '[data-testid="melt-picker-refine"]');
  check(offer.length > 0, 'the picker offers the trough where the need is felt', offer);
  check(/would take \d+ .* to \d+/i.test(offer), 'and prices it', offer);
  await shot(page, '2-forge-offer');

  // ═══ 4. 380px ════════════════════════════════════════════════════════════
  console.log('\n4 — 380px');
  for (const room of ['refinery', 'casting']) {
    await tab(page, room);
    await dismiss(page);
    await page.waitForTimeout(400);
    const over = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth, win: window.innerWidth,
    }));
    check(over.doc <= over.win + 1, `${room} does not scroll sideways`, `${over.doc} vs ${over.win}`);
  }

  await browser.close();
  console.log(`\n${shots.length} shots → ${OUT}`);
  if (problems.length) {
    console.log(`\n${problems.length} PROBLEM(S):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  console.log('\nALL CHECKS PASS');
}

main().catch((e) => { console.error(e); process.exit(1); });
