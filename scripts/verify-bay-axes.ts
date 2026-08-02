/**
 * THE DRILL BAY'S THREE AXES, VERIFIED IN PLAY.
 *
 *   A  THREE SEPARATE CHOICES on one machine — where it works, how it hunts,
 *      what it prefers — each settable without disturbing the other two.
 *   B  t0 / t1 / t2 each do something different: t0 the bay runs itself with
 *      nothing set, t1 the hunt rule changes which cell it takes, t2 the bar
 *      makes it WAIT rather than take a thin one.
 *   C  WEAR IS NOT THERE. The axis was cut; this asserts the cut, because a
 *      half-present field is how A.52's version would come back.
 *   D  PILLAR 2: a full bay with every axis set reads the bare field ceiling.
 *
 *   npx tsx scripts/verify-bay-axes.ts [port]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = `http://localhost:${process.argv[2] ?? '5173'}`;
const OUT = 'sim-out/shots-bay-axes';
const problems: string[] = [];
const check = (ok: boolean, label: string, detail = ''): void => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(label);
};

/** Give the bay some machines and open the room they live in. */
async function openBay(page: Page): Promise<void> {
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown };
    const s = e.getState() as unknown as {
      drills: { bayBuilt: boolean; units: unknown[] };
    };
    s.drills.bayBuilt = true;
    s.drills.units = [0, 1, 2].map((i) => ({ level: 0, timer: 0, lastCell: 0, use: {}, name: `Test ${i}` }));
    // NO DUST GRANT. The machines are injected directly, so nothing here needs
    // buying — and 1e12 dust trips "Ten Million Motes" and "A Billion Motes",
    // whose toasts then sit over the panel this script exists to photograph.
    e.dispatch({ type: 'markSystemsSeen', ids: ['dig', 'drills', 'kiln', 'hold', 'collapse'] });
  });
  // BUILDING THE BAY OPENS A ROOM, AND THE DISCLOSURE GATE SAYS SO. Dismissed
  // the way a player does — by pressing its own button — rather than by
  // dispatching state around it. That shortcut is what hid a full-screen modal
  // with its only exit below the fold for a whole phase (PILLARS, the harness
  // working rule); pressing the real control is also a check that the real
  // control works.
  await page.waitForTimeout(600);
  const gate = page.locator('[role="dialog"][aria-label="New systems opened"] button').last();
  if (await gate.count() > 0) {
    await gate.click();
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
    ui.getState().setTab('drills');
  });
  await page.waitForTimeout(900);
}

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
  await page.waitForTimeout(3000);
  await openBay(page);

  // ── A. THREE SEPARATE CHOICES ───────────────────────────────────────────
  console.log('A — three axes on one machine, set independently');
  const route = page.locator('[data-testid="route-0"]');
  await route.scrollIntoViewIfNeeded();
  await route.click();
  await page.waitForTimeout(600);
  check(await page.locator('[data-testid="route-picker"]').count() > 0, 'the routing picker opens');
  // Each axis has its own control group, and they are three DIFFERENT controls.
  const groups = {
    where: await page.locator('[data-testid="zone-cell-0"]').count(),
    hunts: await page.locator('[data-testid="behaviour-sweep"]').count(),
    prefers: await page.locator('[data-testid="priority-rock"]').count(),
    waits: await page.locator('[data-testid="bar-2"]').count(),
  };
  console.log(`      controls present: ${JSON.stringify(groups)}`);
  check(Object.values(groups).every((n) => n > 0),
    'WHERE / HOW IT HUNTS / WHAT IT PREFERS / WHAT IT WAITS FOR are four separate control groups');

  // Set each, and check setting one does not disturb the others.
  await page.locator('[data-testid="behaviour-sweep"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="priority-rock"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="bar-2"]').click();
  await page.waitForTimeout(400);
  const set = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as { getState: () => never };
    const s = e.getState() as unknown as {
      drills: { units: { behavior?: string; priority?: string; minCharge?: number }[] };
    };
    const u = s.drills.units[0]!;
    return { behavior: u.behavior, priority: u.priority, minCharge: u.minCharge };
  });
  console.log(`      drill 0 now: ${JSON.stringify(set)}`);
  check(set.behavior === 'sweep' && set.priority === 'rock' && set.minCharge === 0.6,
    'all three hold at once — they are axes, not one setting with three names');

  // THE SHOT IS TAKEN HERE, not at the end. The pillar-2 step seats twenty-four
  // machines, which trips four drill achievements, and the toasts covered the
  // picker completely — a screenshot of a deliverable with the deliverable
  // behind a notification is not evidence of anything.
  // ...and let the bay-built toast finish fading before the shutter.
  await page.waitForTimeout(6000);
  await page.locator('[data-testid="behaviour-sweep"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/bay-axes.png` });
  console.log('  shot bay-axes (picker open, three axes visible)');

  // ...and the row says so without opening the picker.
  await page.locator('[data-testid="route-done"]').click();
  await page.waitForTimeout(500);
  const rowText = (await page.locator('[data-testid="route-state-0"]').innerText()).trim();
  console.log(`      the drill's row reads: "${rowText}"`);
  check(/sweep/.test(rowText) && /rock only/.test(rowText) && /waits/.test(rowText),
    'and the list row names all three, so 24 machines do not need 24 visits');

  // ── B. t0 / t1 / t2 EACH DO SOMETHING DIFFERENT ─────────────────────────
  console.log('B — t0, t1, t2');
  const tiers = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; tick: (n: number) => void };
    const s = e.getState() as unknown as {
      face: { cells: number[]; ore?: unknown[]; w: number };
      drills: { units: Record<string, unknown>[] };
      stats: { drillStrikes: number };
    };
    const one = (setup: (u: Record<string, unknown>) => void, thin: boolean): {
      cells: number[]; strikes: number;
    } => {
      s.drills.units = [{ level: 0, timer: 0, lastCell: 0, use: {}, name: 'T' }];
      setup(s.drills.units[0]!);
      const before = s.stats.drillStrikes;
      const touched: number[] = [];
      for (let i = 0; i < 12; i++) {
        s.face.ore = [];
        // A persistent gradient: cell 12 rich, the rest thin. On a FLAT face
        // every rule drains cells in order and they look identical.
        s.face.cells = s.face.cells.map((_, k) => (thin ? 1.6 : k === 12 ? 8 : 1.6));
        (s.drills.units[0] as { timer: number }).timer = 0;
        e.tick(2.0);
        touched.push((s.drills.units[0] as { lastCell: number }).lastCell);
      }
      return { cells: [...new Set(touched)], strikes: s.stats.drillStrikes - before };
    };
    return {
      t0: one(() => { /* nothing set at all */ }, false),
      t1: one((u) => { u['behavior'] = 'sweep'; }, false),
      /**
       * t2 IS MEASURED ON THIN ROCK, and the first cut was not. It used the
       * same gradient as t0/t1 — one cell at full cap — so an 85% bar was
       * always satisfied by that cell and the drill struck twelve times out of
       * twelve. The reading said "the bar does nothing"; the bar was working
       * and the board simply had rock over it. The claim is about what happens
       * when NOTHING clears the bar, so the board has to be thin.
       */
      t2: one((u) => { u['minCharge'] = 0.85; }, true),
      t2Base: one(() => { /* same thin board, no bar */ }, true),
    };
  });
  console.log(`      t0 (nothing set) : ${tiers.t0.cells.length} distinct cells, ${tiers.t0.strikes} strikes`);
  console.log(`      t1 (sweep)       : ${tiers.t1.cells.length} distinct cells, ${tiers.t1.strikes} strikes`);
  console.log(`      t2 (bar 85%)     : ${tiers.t2.cells.length} distinct cells, ${tiers.t2.strikes} strikes`);
  check(tiers.t0.strikes > 0, 't0 — a bay with NOTHING set runs itself', `${tiers.t0.strikes} strikes`);
  check(tiers.t1.cells.length > tiers.t0.cells.length,
    't1 — the hunt rule changes WHICH cells it takes',
    `sweep covered ${tiers.t1.cells.length} against greedy's ${tiers.t0.cells.length}`);
  console.log(`      t2 baseline (thin rock, no bar): ${tiers.t2Base.strikes} strikes`);
  check(tiers.t2.strikes === 0 && tiers.t2Base.strikes > 0,
    't2 — on rock under its bar the machine WAITS rather than nibble',
    `${tiers.t2.strikes} strikes against ${tiers.t2Base.strikes} with no bar`);

  // ── C. WEAR IS NOT THERE ────────────────────────────────────────────────
  console.log('C — the wear axis was cut, and stayed cut');
  const wear = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => { ok: boolean } };
    const s = e.getState() as unknown as { drills: { units: Record<string, unknown>[] } };
    const u = s.drills.units[0]!;
    const dead = ['wear', 'condition', 'durability', 'head', 'bit']
      .filter((k) => u[k] !== undefined);
    return { dead, refused: !e.dispatch({ type: 'setDrillWear', index: 0, wear: 1 }).ok };
  });
  check(wear.dead.length === 0, 'no drill carries a wear or head field', wear.dead.join(', '));
  check(wear.refused, 'and the engine refuses an action that would set one');

  // ── D. PILLAR 2 ─────────────────────────────────────────────────────────
  console.log('D — dpsMax unmoved across a FULL bay with every axis set');
  /**
   * WHITESPACE IS COLLAPSED WITH `\s+`, WHICH `verify-decay.ts` MEANT TO DO AND
   * DID NOT — it wrote `/s+/`, a literal "s", so the label and the number stayed
   * on separate lines, the capture never matched, and the check fell back to
   * comparing the whole innerText block. That comparison happened to be right;
   * this one asked for the captured number and got 'unread' for both arms, which
   * compares EQUAL and would have passed as a pillar-2 proof reading nothing.
   */
  const readCeiling = (): Promise<string> => page.evaluate(() => {
    const el = [...document.querySelectorAll('div')]
      .find((d) => d.textContent?.trim().startsWith('Field ceiling'));
    const txt = (el?.parentElement?.innerText ?? '').replace(/\s+/g, ' ').trim();
    return (/Field ceiling ([0-9.]+)/.exec(txt)?.[1]) ?? 'unread';
  });
  const setBay = (n: number, axes: boolean): Promise<void> => page.evaluate(([count, on]) => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown };
    const s = e.getState() as unknown as { drills: { units: Record<string, unknown>[] } };
    const B = ['fullest', 'sweep', 'chain'];
    const P = ['both', 'oresFirst', 'ores', 'rock'];
    s.drills.units = Array.from({ length: count as number }, (_, i) => {
      const u: Record<string, unknown> = { level: 20, timer: 0, lastCell: 0, use: {}, name: `D${i}` };
      if (on) {
        u['behavior'] = B[i % 3];
        u['priority'] = P[i % 4];
        u['minCharge'] = [0, 0.35, 0.6, 0.85][i % 4];
        u['zone'] = [i % 36];
      }
      return u;
    });
    e.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1 }); // force a publish
  }, [n, axes]);

  // THE CEILING PANEL IS IN THE DIG ROOM. Read from the drills room it returned
  // 'unread' for BOTH arms — two identical blanks, which is exactly the shape of
  // a pass that is really a missing selector, and it compared equal.
  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
    ui.getState().setTab('dig');
  });
  await page.waitForTimeout(700);
  await setBay(0, false); await page.waitForTimeout(900);
  const empty = await readCeiling();
  await setBay(24, true); await page.waitForTimeout(900);
  const full = await readCeiling();
  console.log(`      empty bay          : ${empty}`);
  console.log(`      24 drills, all axes: ${full}`);
  check(full === empty && empty !== 'unread',
    'A FULL BAY WITH EVERY AXIS SET READS THE BARE CEILING — no axis is a formula input',
    `${full} vs ${empty}`);

  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(overflow === 0, 'no horizontal overflow at 380px', `${overflow}px`);
  check(errors.length === 0, 'no page errors throughout', errors.join(' | '));

  console.log(problems.length === 0 ? '\nALL PASS' : `\nFAILURES: ${problems.join(', ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
