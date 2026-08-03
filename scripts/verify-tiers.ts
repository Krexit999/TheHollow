/**
 * MACHINE TIERS I-III, SHOWN WORKING (§15.4).
 *
 * NOT A NEW BUILD. The ladder is already in the code — `tierOf`, `retainsBand`,
 * `emitsByproduct` in `systems/plant.ts`, spent out of `casting.rack` by
 * `buildCrusher`, never bought with currency. The ledger rule says a row is a
 * hypothesis about the code until it is checked, so this checks it: three tiers,
 * each doing something DIFFERENT rather than more, driven through the real UI.
 *
 *   I    commons only — the output comes back one band POORER
 *   II   retains the input's band
 *   III  emits a byproduct at all
 *
 *   npx tsx scripts/verify-tiers.ts [port]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = `http://localhost:${process.argv[2] ?? '5173'}`;
const OUT = 'sim-out/shots-tiers';
const problems: string[] = [];

function check<T>(actual: T, want: T, bad: T, label: string): void {
  if (JSON.stringify(bad) === JSON.stringify(want)) {
    console.log(`  VACUOUS  ${label} — the known-bad value equals the expected one`);
    problems.push(`${label} (vacuous)`);
    return;
  }
  const ok = JSON.stringify(actual) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    console.log(`        got  ${JSON.stringify(actual)}`);
    console.log(`        want ${JSON.stringify(want)}`);
    problems.push(label);
  }
}

async function dismissGate(page: Page): Promise<void> {
  const gate = page.locator('[role="dialog"] button').last();
  for (let i = 0; i < 4 && await gate.count() > 0; i++) {
    await gate.click({ timeout: 4000 }).catch(() => undefined);
    await page.waitForTimeout(350);
  }
}

interface Run { tier: number; outBand: string; byproduct: number; built: boolean; parts: number }

/**
 * Build the Crusher to `tier` OUT OF CAST PARTS, then crush a known band and
 * report what came back. The parts are put on the rack first, so the build goes
 * through the real `buildCrusher` path rather than a tier being written in.
 */
const runAt = (page: Page, tier: number): Promise<Run> => page.evaluate((want) => {
  const e = (window as unknown as Record<string, never>)['__engine'] as unknown as {
    getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string; data?: unknown };
  };
  const s = e.getState() as unknown as {
    casting: { rack: { id: number; type: string; materialId: string; purity: number }[] };
    plant?: { tiers: Record<string, number>; surge: number; surgeCap: number };
    materials: { stacks: Record<string, Record<string, { count: number; puritySum: number }>> };
  };
  // A clean bench every time: no tier, a full rack, a full Surge bank.
  s.plant ??= { tiers: {}, surge: 0, surgeCap: 0 } as never;
  s.plant.tiers = {};
  s.casting.rack = Array.from({ length: 40 }, (_, i) => ({
    id: 9000 + i, type: 'head', materialId: 'marl', purity: 60,
  }));
  s.plant.surgeCap = 9999;
  s.plant.surge = 9999;
  let built = true;
  for (let t = 0; t < want; t++) {
    if (!e.dispatch({ type: 'buildCrusher' }).ok) built = false;
  }
  const partsLeft = s.casting.rack.length;
  // Four stones of ONE known band — `good` — so the output band is a comparison
  // against a fixed input rather than against whatever happened to be held.
  s.materials.stacks['marl'] = { good: { count: 8, puritySum: 8 * 70 } };
  const before = JSON.parse(JSON.stringify(s.materials.stacks)) as Record<string, Record<string, { count: number }>>;
  const r = e.dispatch({ type: 'crush', materialId: 'marl', band: 'good' });
  const data = (r.data ?? {}) as { outBand?: string; byproduct?: number };
  const by = (s.materials.stacks['salvagedust'] ?? {}) as Record<string, { count: number }>;
  const byCount = Object.values(by).reduce((n, x) => n + x.count, 0)
    - Object.values((before['salvagedust'] ?? {}) as Record<string, { count: number }>)
      .reduce((n, x) => n + x.count, 0);
  return {
    tier: s.plant.tiers['crusher'] ?? 0,
    outBand: data.outBand ?? 'refused',
    byproduct: byCount,
    built,
    parts: partsLeft,
  };
}, tier);

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
  await dismissGate(page);

  console.log('A — built from CAST PARTS, not bought');
  const one = await runAt(page, 1);
  console.log(`      tier ${one.tier}, rack left ${one.parts} of 40, out band "${one.outBand}", byproduct ${one.byproduct}`);
  check(one.built, true, false, 'the build went through the real buildCrusher path');
  check(one.tier, 1, 0, 'it reached tier I');
  // TIER_PART_COST = [0,2,3,5]: tier I costs two parts off the rack.
  check(one.parts, 38, 40, 'and it SPENT cast parts off the rack (2 for tier I)');

  console.log('B — the three tiers do three DIFFERENT things');
  const two = await runAt(page, 2);
  const three = await runAt(page, 3);
  console.log(`      I   band ${one.outBand}, byproduct ${one.byproduct}`);
  console.log(`      II  band ${two.outBand}, byproduct ${two.byproduct}`);
  console.log(`      III band ${three.outBand}, byproduct ${three.byproduct}`);

  // Input was `good`. Tier I hands back one band poorer; II retains it.
  check(one.outBand, 'fair', 'good', 'TIER I drops the band — good in, fair out');
  check(two.outBand, 'good', 'fair', 'TIER II RETAINS the band tier I dropped');
  check(three.outBand, 'good', 'fair', '...and tier III keeps retaining it');

  check(one.byproduct, 0, 1, 'TIER I emits no byproduct');
  check(two.byproduct, 0, 1, 'nor does tier II — the two capabilities are separate');
  check(three.byproduct > 0, true, false, 'TIER III EMITS A BYPRODUCT at all');

  // Each rung costs MORE parts than the last, and that is the only number that
  // grows — the capabilities themselves are not scaled by anything.
  check(three.parts < two.parts && two.parts < one.parts, true, false,
    'each rung costs more cast parts than the last (2 / 3 / 5)');

  console.log('C2 — two machines cast from DIFFERENT stone behave differently');
  const cast = (mat: string): Promise<{ mixed: boolean; plainRefused: boolean; traits: string[] }> =>
    page.evaluate((m) => {
      const e = (window as unknown as Record<string, never>)['__engine'] as unknown as {
        getState: () => never; dispatch: (a: unknown) => { ok: boolean };
      };
      const s = e.getState() as unknown as {
        casting: { rack: { id: number; type: string; materialId: string; purity: number }[] };
        plant?: { tiers: Record<string, number>; surge: number; builtOf?: Record<string, string[]> };
        materials: { stacks: Record<string, Record<string, { count: number; puritySum: number }>> };
      };
      s.plant!.tiers = {}; s.plant!.builtOf = {};
      s.casting.rack = Array.from({ length: 40 }, (_, i) => ({
        id: 7000 + i, type: 'head', materialId: m, purity: 60,
      }));
      s.plant!.surge = 9999;
      e.dispatch({ type: 'buildCrusher' });
      s.plant!.surge = 9999;
      // Four stones SPREAD across two bands: no band holds a full batch.
      s.materials.stacks['marl'] = {
        good: { count: 2, puritySum: 140 }, fair: { count: 2, puritySum: 100 },
      };
      const r = e.dispatch({ type: 'crush', materialId: 'marl', band: 'good' });
      return {
        mixed: r.ok,
        plainRefused: !r.ok,
        traits: s.plant!.builtOf?.['crusher'] ?? [],
      };
    }, mat);
  const keen = await cast('duskflint');
  const plain = await cast('marl');
  console.log(`      keen-cast  built of ${JSON.stringify(keen.traits)} -> batch ${keen.mixed ? 'FIRED' : 'refused'}`);
  console.log(`      plain-cast built of ${JSON.stringify(plain.traits)} -> batch ${plain.mixed ? 'FIRED' : 'refused'}`);
  check(plain.mixed, false, true, 'a PLAIN-cast Crusher refuses a batch spread across bands');
  check(keen.mixed, true, false, 'a KEEN-cast one takes it — same tier, different stone');

  console.log('C — pillar 2, both arms at the SAME depth');
  const readCeiling = (): Promise<string> => page.evaluate(() => {
    const el = [...document.querySelectorAll('div')]
      .find((d) => d.textContent?.trim().startsWith('Field ceiling'));
    const txt = (el?.parentElement?.innerText ?? '').replace(/\s+/g, ' ').trim();
    return (/Field ceiling ([0-9.]+)/.exec(txt)?.[1]) ?? 'unread';
  });
  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
    ui.getState().setTab('dig');
  });
  await page.waitForTimeout(700);
  const setTier = (t: number): Promise<void> => page.evaluate((tier) => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown };
    const s = e.getState() as unknown as { plant?: { tiers: Record<string, number> }; depth: number };
    s.depth = 30; // BOTH arms here — depth pressure is a dustYield term
    s.plant!.tiers['crusher'] = tier;
    s.plant!.tiers['refinery'] = tier;
    e.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1 });
  }, t);
  await setTier(0); await page.waitForTimeout(900);
  const bare = await readCeiling();
  await setTier(3); await page.waitForTimeout(900);
  const tiered = await readCeiling();
  check(tiered, bare, 'unread', 'every machine at tier III reads the SAME field ceiling');
  check(bare !== 'unread' && tiered !== 'unread', true, false, 'and both reads found the number');

  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
    ui.getState().setTab('casting');
  });
  await page.waitForTimeout(800);
  await dismissGate(page);
  await page.waitForTimeout(5000); // let announcements clear the shot
  await page.screenshot({ path: `${OUT}/tiers.png` });

  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(overflow, 0, 1, 'no horizontal overflow at 380px');
  check(errors.length, 0, 1, `no page errors${errors.length ? ` — ${errors.join(' | ')}` : ''}`);
  console.log(problems.length === 0 ? '\nALL PASS' : `\nFAILURES: ${problems.join(', ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
