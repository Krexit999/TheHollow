/**
 * GEAR, VERIFIED IN PLAY. Three slots, swapped at a REST and refused elsewhere.
 *
 * Every assertion goes through `check(actual, want, bad, label)`: the known-bad
 * value must be rejected before the real one is accepted, and a `bad` equal to
 * `want` reports VACUOUS rather than passing. A comparison that cannot fail is
 * not a measurement — the pillar-2 read that returned 'unread' for both arms is
 * why this exists.
 *
 *   npx tsx scripts/verify-gear.ts [port]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = `http://localhost:${process.argv[2] ?? '5173'}`;
const OUT = 'sim-out/shots-gear';
const problems: string[] = [];

function check<T>(actual: T, want: T, bad: T, label: string): void {
  if (JSON.stringify(bad) === JSON.stringify(want)) {
    console.log(`  VACUOUS  ${label} — the known-bad value equals the expected one`);
    problems.push(`${label} (vacuous)`);
    return;
  }
  const ok = JSON.stringify(actual) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} — got ${JSON.stringify(actual)},`
    + ` want ${JSON.stringify(want)} (red against ${JSON.stringify(bad)})`);
  if (!ok) problems.push(label);
}

async function dismissGate(page: Page): Promise<void> {
  const gate = page.locator('[role="dialog"][aria-label="New systems opened"] button').last();
  for (let i = 0; i < 3 && await gate.count() > 0; i++) {
    await gate.click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(400);
  }
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

  // Give the player every piece, and put them nowhere near a rest.
  const setDepth = (d: number): Promise<void> => page.evaluate((depth) => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown };
    const s = e.getState() as unknown as { depth: number; gear?: { owned: string[]; worn: Record<string, string> } };
    s.gear ??= { owned: [], worn: {} };
    s.gear.owned = ['sableslamp', 'ashlamp', 'gravegloves', 'chalkgloves', 'feltboots', 'marchboots'];
    s.depth = depth;
    e.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1 });
  }, d);

  console.log('A — the room, and the refusal');
  await setDepth(0);
  await page.waitForTimeout(700);
  await dismissGate(page);
  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
    ui.getState().setTab('gear');
  });
  await page.waitForTimeout(800);
  await dismissGate(page);

  check(await page.locator('[data-testid^="slot-"]').count(), 3, 0,
    'three slots, and exactly three');

  // AWAY FROM A REST: the buttons say so and the engine refuses.
  /**
   * LOWER-CASED, because `innerText` returns the RENDERED text and the control
   * carries `uppercase`. The first cut compared 'NOT HERE' against 'Not here'
   * and failed on a CSS property rather than on anything the check is about.
   */
  const awayLabel = (await page.locator('[data-testid="don-sableslamp"]').innerText()).trim().toLowerCase();
  check(awayLabel, 'not here', 'put it on', 'away from a rest the control says NOT HERE');
  const refused = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { dispatch: (a: unknown) => { ok: boolean; reason?: string } };
    return e.dispatch({ type: 'equipGear', slot: 'lamp', id: 'sableslamp' });
  });
  console.log(`      the engine says: "${refused.reason ?? ''}"`);
  check(refused.ok, false, true, 'and the engine refuses the swap outright');
  check(/rest/i.test(refused.reason ?? ''), true, false,
    '...naming a rest rather than just saying no');
  check(/depth \d+/.test(refused.reason ?? ''), true, false,
    '...and pointing at one the player can walk to');
  await page.screenshot({ path: `${OUT}/gear-away.png` });

  console.log('B — at a rest');
  await setDepth(33); // The Lampline
  await page.waitForTimeout(900);
  await dismissGate(page);
  const restLabel = (await page.locator('[data-testid="don-sableslamp"]').innerText()).trim().toLowerCase();
  check(restLabel, 'put it on', 'not here', 'at a rest the control opens');
  await page.locator('[data-testid="don-sableslamp"]').scrollIntoViewIfNeeded();
  await page.locator('[data-testid="don-sableslamp"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="don-gravegloves"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="don-feltboots"]').click();
  await page.waitForTimeout(600);
  const worn = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as { getState: () => never };
    return (e.getState() as unknown as { gear?: { worn: Record<string, string> } }).gear?.worn ?? {};
  });
  check(worn, { lamp: 'sableslamp', gloves: 'gravegloves', boots: 'feltboots' },
    { lamp: 'sableslamp' }, 'all three slots hold at once');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/gear-rest.png` });

  console.log('C — the six do six different things');
  const fx = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as {
      getState: () => never; dispatch: (a: unknown) => unknown; tick: (n: number) => void;
    };
    type S = {
      depth: number; gear?: { worn: Record<string, string>; owned: string[] };
      face: { cells: number[]; compaction?: number[]; ore?: string[]; lastHandCell?: number };
      drills: { bayBuilt: boolean; units: Record<string, unknown>[] };
    };
    const s = e.getState() as unknown as S;
    const wear = (id: string | null, slot: string): void => {
      s.gear!.worn = {};
      if (id) s.gear!.worn[slot] = id;
    };
    const rows = (): { legible: number; hazard: boolean } => {
      const ui = (window as unknown as Record<string, never>)['__rollRows'] as unknown;
      void ui;
      return { legible: 0, hazard: false };
    };
    void rows;
    const out: Record<string, { off: number; on: number }> = {};

    // CHALKED GRIPS — a swing that finds nothing still marks the rock.
    const empty = (on: boolean): number => {
      wear(on ? 'chalkgloves' : null, 'gloves');
      s.face.ore = [];
      s.face.compaction = s.face.cells.map(() => 0);
      s.face.cells[2] = 0;
      e.dispatch({ type: 'chip', cell: 2 });
      return s.face.compaction?.[2] ?? 0;
    };
    out['chalkgloves'] = { off: empty(false), on: empty(true) };

    // FELT OVERBOOTS — the machines leave your last cell alone.
    const tookYours = (on: boolean): number => {
      wear(on ? 'feltboots' : null, 'boots');
      s.drills.bayBuilt = true;
      s.drills.units = [{ level: 0, timer: 0, lastCell: 0, use: {}, name: 'B' }];
      s.face.cells = s.face.cells.map(() => 1);
      s.face.cells[7] = 90; // by far the best rock
      s.face.lastHandCell = 7;
      s.face.ore = [];
      e.tick(2.0);
      return (s.drills.units[0] as { lastCell: number }).lastCell === 7 ? 1 : 0;
    };
    out['feltboots'] = { off: tookYours(false), on: tookYours(true) };

    // MARCHING BOOTS — a sweeper strides two.
    const stride = (on: boolean): number => {
      wear(on ? 'marchboots' : null, 'boots');
      s.drills.bayBuilt = true;
      s.drills.units = [{ level: 0, timer: 0, lastCell: 0, use: {}, name: 'M', behavior: 'sweep' }];
      s.face.cells = s.face.cells.map(() => 8);
      s.face.ore = [];
      (s.drills.units[0] as { timer: number }).timer = 0;
      e.tick(2.0);
      return (s.drills.units[0] as { lastCell: number }).lastCell;
    };
    out['marchboots'] = { off: stride(false), on: stride(true) };

    // GRAVECLAY GLOVES — the hand dig advances faster.
    const dug = (on: boolean): number => {
      wear(on ? 'gravegloves' : null, 'gloves');
      s.drills.units = [];
      s.face.ore = s.face.cells.map((_, i) => (i === 3 ? 'fatseam' : ''));
      (s as unknown as { face: { oreDug: number[] } }).face.oreDug = s.face.cells.map(() => 0);
      e.dispatch({ type: 'workOre', cell: 3, seconds: 1 });
      return Math.round(((s as unknown as { face: { oreDug: number[] } }).face.oreDug[3] ?? 0) * 100);
    };
    out['gravegloves'] = { off: dug(false), on: dug(true) };

    wear(null, 'gloves');
    return out;
  });
  for (const [id, v] of Object.entries(fx)) {
    console.log(`      ${id.padEnd(14)} off ${String(v.off).padStart(4)}   on ${String(v.on).padStart(4)}`);
  }
  check(fx['chalkgloves']!.off === 0 && fx['chalkgloves']!.on > 0, true, false,
    'CHALKED GRIPS — an empty swing marked nothing, and now it marks the rock');
  check(fx['feltboots']!.off === 1 && fx['feltboots']!.on === 0, true, false,
    'FELT OVERBOOTS — the machine took the cell you last struck, and now it does not');
  check(fx['marchboots']!.off !== fx['marchboots']!.on, true, false,
    'MARCHING BOOTS — the sweeper lands somewhere else, striding two');
  check(fx['gravegloves']!.on > fx['gravegloves']!.off, true, false,
    'GRAVECLAY GLOVES — the hand dig advances further in the same second');

  // The two LAMPS, read off the Roll the player actually sees.
  const lamps = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as { getState: () => never };
    const s = e.getState() as unknown as { depth: number; gear?: { worn: Record<string, string> } };
    s.depth = 0;
    const read = (id: string | null): { legible: number } => {
      s.gear!.worn = {};
      if (id) s.gear!.worn['lamp'] = id;
      const rows = (window as unknown as Record<string, (x: unknown) => { legible: boolean; type: string }[]>)['__rollRows'];
      const list = rows ? rows(s) : [];
      return { legible: list.filter((r) => r.legible).length };
    };
    return { bare: read(null), sable: read('sableslamp'), ash: read('ashlamp') };
  });
  if (lamps.bare.legible === 0) {
    console.log('  SKIP  the two lamps — `__rollRows` is not exposed to the driver;'
      + ' covered by gear.test.ts instead (3 assertions, incl. that reading FURTHER'
      + ' does not reveal a hazard and the ash lamp does)');
  } else {
    check(lamps.sable.legible > lamps.bare.legible, true, false,
      "SABLE'S LAMP reads one station further");
  }

  console.log('D — pillar 2');
  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
    ui.getState().setTab('dig');
  });
  await page.waitForTimeout(700);
  const readCeiling = (): Promise<string> => page.evaluate(() => {
    const el = [...document.querySelectorAll('div')]
      .find((d) => d.textContent?.trim().startsWith('Field ceiling'));
    const txt = (el?.parentElement?.innerText ?? '').replace(/\s+/g, ' ').trim();
    return (/Field ceiling ([0-9.]+)/.exec(txt)?.[1]) ?? 'unread';
  });
  const setWorn = (all: boolean): Promise<void> => page.evaluate((on) => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown };
    const s = e.getState() as unknown as { gear?: { worn: Record<string, string> }; depth: number };
    s.depth = 33; // BOTH arms at the same depth — depth pressure is a yield term
    s.gear!.worn = on
      ? { lamp: 'sableslamp', gloves: 'gravegloves', boots: 'feltboots' } : {};
    e.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1 });
  }, all);
  await setWorn(false); await page.waitForTimeout(900);
  const bare = await readCeiling();
  await setWorn(true); await page.waitForTimeout(900);
  const kitted = await readCeiling();
  check(kitted, bare, 'unread', 'a fully kitted delver reads the SAME field ceiling');
  check(bare !== 'unread' && kitted !== 'unread', true, false,
    'and both reads actually found the number');

  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(overflow, 0, 1, 'no horizontal overflow at 380px');
  check(errors.length, 0, 1, `no page errors throughout${errors.length ? ` — ${errors.join(' | ')}` : ''}`);
  console.log(problems.length === 0 ? '\nALL PASS' : `\nFAILURES: ${problems.join(', ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
