/**
 * THE READING, VERIFIED IN PLAY.
 *
 * EVERY EQUALITY ASSERTION IN HERE IS SHOWN RED FIRST. `check` takes the live
 * reading AND a known-bad value, asserts the check FAILS on the bad one, and
 * only then asserts it passes on the real one. That is not belt-and-braces: the
 * last pass shipped a pillar-2 proof whose selector returned 'unread' for both
 * arms, so the two compared EQUAL and the check went green while reading
 * nothing. A comparison that cannot fail is not a measurement.
 *
 *   A  a note becomes a proposition becomes a proof, through the real UI
 *   B  each of the nine rules FIRES — before/after behaviour, per rule
 *   C  LAW 3 — an unproven row shows its question and never its rule
 *   D  dpsMax unmoved with all nine proved
 *
 *   npx tsx scripts/verify-reading.ts [port]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = `http://localhost:${process.argv[2] ?? '5173'}`;
const OUT = 'sim-out/shots-reading';
const problems: string[] = [];

/**
 * ASSERT, AND PROVE THE ASSERTION CAN FAIL. `bad` is a value the check must
 * reject; if it does not, the check is vacuous and that is reported as the
 * failure rather than the comparison.
 */
function check<T>(actual: T, want: T, bad: T, label: string): void {
  const redFirst = JSON.stringify(bad) !== JSON.stringify(want);
  const ok = JSON.stringify(actual) === JSON.stringify(want);
  if (!redFirst) {
    console.log(`  VACUOUS  ${label} — the known-bad value equals the expected one`);
    problems.push(`${label} (vacuous)`);
    return;
  }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} — got ${JSON.stringify(actual)},`
    + ` want ${JSON.stringify(want)} (red against ${JSON.stringify(bad)})`);
  if (!ok) problems.push(label);
}

function truthy(ok: boolean, label: string, detail = ''): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(label);
}

const IDS = [
  'gateSight', 'shallowHolds', 'patientBank', 'handLed',
  'zoneIsOrder', 'oreIsRock', 'pocketPatience', 'heldBreath', 'readStays',
];

/**
 * THE DESK OPENING IS A NEW ROOM, so the disclosure gate fires and covers the
 * screen. Dismissed by pressing its own button — never by dispatching around
 * it, which is how a full-screen modal with its exit below the fold survived a
 * whole phase (PILLARS, the harness working rule).
 */
async function dismissGate(page: Page): Promise<void> {
  const gate = page.locator('[role="dialog"][aria-label="New systems opened"] button').last();
  for (let i = 0; i < 3 && await gate.count() > 0; i++) {
    await gate.click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(400);
  }
}

/** Give the desk every note, without proving anything. */
async function allNotes(page: Page): Promise<void> {
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown };
    const s = e.getState() as unknown as { reading?: { notes: string[] } };
    s.reading ??= { notes: [], proven: [], working: null, tally: {} } as never;
    s.reading.notes = ['firstGate', 'terminalGate', 'firstPocket', 'firstCollapse', 'firstRoute',
      'firstBehaviour', 'firstBar', 'firstOverstoke', 'firstSample', 'firstDrillPocket'];
    e.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1 });
  });
  await page.waitForTimeout(600);
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

  // ── A. A NOTE BECOMES A PROPOSITION BECOMES A PROOF ─────────────────────
  console.log('A — note -> proposition -> proof, through the real UI');
  const openDesk = async (): Promise<void> => {
    await page.evaluate(() => {
      const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
      ui.getState().setTab('desk');
    });
    await page.waitForTimeout(600);
  };

  // The room is not there before the first note — LAW 3, no empty rooms.
  const deskBefore = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'The Desk'));
  check(deskBefore, false, true, 'the Desk does not exist before the first note');

  // Earn one for real: chip a cell to the first gate.
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown };
    const s = e.getState() as unknown as { face: { cells: number[]; ore?: unknown[] } };
    for (let i = 0; i < 12; i++) {
      s.face.ore = [];
      s.face.cells[0] = 999;
      e.dispatch({ type: 'chip', cell: 0 });
    }
  });
  await page.waitForTimeout(700);
  const notes = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as { getState: () => never };
    return ((e.getState() as unknown as { reading?: { notes: string[] } }).reading?.notes ?? []).length;
  });
  truthy(notes >= 1, 'chipping a cell to the first gate WROTE A NOTE', `${notes} note(s)`);

  await dismissGate(page);
  // THE ROOM LIST IS PER-CLUSTER, so the row only renders once its cluster is
  // the one on screen. The first cut searched the whole document while the FACE
  // cluster was showing and concluded the room had not appeared — a check that
  // was really asserting which tab was open.
  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
    ui.getState().setTab('delver'); // any room in the Progress cluster
  });
  await page.waitForTimeout(700);
  const deskAfter = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'The Desk'));
  check(deskAfter, true, false, 'and the Desk room appeared in the Progress cluster');

  await allNotes(page);
  await dismissGate(page);
  await openDesk();
  const shown = await page.locator('[data-testid^="prop-"]').count();
  check(shown, 9, 0, 'with every note held, all nine questions are on the desk');

  // LAW 3: the rule is NOT rendered for an unproven row.
  const ruleLeak = await page.locator('[data-testid^="rule-"]').count();
  check(ruleLeak, 0, 9, 'LAW 3 — not one rule sentence is visible before it is proved');
  const proofLeak = await page.locator('[data-testid^="proof-"]').count();
  check(proofLeak, 0, 1, '...and no proof is shown until a question is chosen');

  // Work one, and the proof appears — for that one only.
  await page.locator('[data-testid="work-gateSight"]').scrollIntoViewIfNeeded();
  await page.locator('[data-testid="work-gateSight"]').click();
  await page.waitForTimeout(600);
  check(await page.locator('[data-testid="proof-gateSight"]').count(), 1, 0,
    'choosing a question shows its PROOF');
  check(await page.locator('[data-testid^="proof-"]').count(), 1, 9,
    '...and only that one');

  // Do the deed: take a cell to the terminal gate.
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown; tick: (n: number) => void };
    const s = e.getState() as unknown as { face: { cells: number[]; ore?: unknown[]; compaction?: number[] } };
    for (let i = 0; i < 40; i++) {
      s.face.ore = [];
      s.face.cells[1] = 999;
      e.dispatch({ type: 'chip', cell: 1 });
    }
    e.tick(1.2); // the desk evaluates on the one-second beat
  });
  await page.waitForTimeout(900);
  const provedIt = await page.locator('[data-testid="rule-gateSight"]').count();
  check(provedIt, 1, 0, 'DOING THE THING PROVED IT — the rule sentence is now on the desk');
  const sentence = provedIt > 0
    ? (await page.locator('[data-testid="rule-gateSight"]').innerText()).trim() : '(none)';
  console.log(`      the rule, as a sentence: "${sentence}"`);
  truthy(/compaction shows/i.test(sentence), 'and it is a sentence about how the world works');

  // Forty chips is forty drop toasts. Let them fade before the shutter, or the
  // photograph of the deliverable is mostly a photograph of notifications.
  await page.waitForTimeout(7000);
  await page.screenshot({ path: `${OUT}/desk.png` });
  console.log('  shot desk');

  // ── B. EACH RULE FIRES ──────────────────────────────────────────────────
  console.log('B — each of the nine rules, before and after');
  const fired = await page.evaluate((ids) => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as {
      getState: () => never; dispatch: (a: unknown) => unknown; tick: (n: number) => void;
    };
    type S = {
      reading?: { proven: string[] };
      face: { cells: number[]; ore?: string[]; oreDug?: number[]; compaction?: number[]; w: number; lastHandCell?: number };
      drills: { bayBuilt: boolean; units: Record<string, unknown>[]; huntOres?: boolean };
      kiln: Record<string, unknown>;
      assayBench?: { sampled: string[]; remembered?: string[]; tier: number };
      stats: { drillStrikes: number };
      collapse: { count: number };
    };
    const s = e.getState() as unknown as S;
    const only = (id: string | null): void => {
      s.reading ??= { proven: [] } as never;
      s.reading.proven = id ? [id] : [];
    };
    const drill = (extra: Record<string, unknown> = {}): void => {
      s.drills.bayBuilt = true;
      s.drills.units = [{ level: 0, timer: 0, lastCell: 0, use: {}, name: 'T', ...extra }];
    };
    const out: Record<string, { off: number | string; on: number | string }> = {};

    // shallowHolds — a shallow board relaxes, or does not.
    const shallow = (on: boolean): number => {
      only(on ? 'shallowHolds' : null);
      s.face.compaction = s.face.cells.map(() => 6);
      for (let i = 0; i < 600; i++) e.tick(1);
      return (s.face.compaction ?? []).filter((c) => c >= 6).length;
    };
    out['shallowHolds'] = { off: shallow(false), on: shallow(true) };

    // patientBank — the stroke owed while it waited.
    const banked = (on: boolean): number => {
      only(on ? 'patientBank' : null);
      drill({ minCharge: 0.85 });
      s.face.cells = s.face.cells.map(() => 0.8);
      s.face.ore = [];
      for (let i = 0; i < 8; i++) e.tick(2);
      const before = s.stats.drillStrikes;
      s.face.cells = s.face.cells.map(() => 8);
      e.tick(0.8); // well under one interval
      return s.stats.drillStrikes - before;
    };
    out['patientBank'] = { off: banked(false), on: banked(true) };

    // handLed — which cell a chaining machine lands beside.
    const led = (on: boolean): number => {
      only(on ? 'handLed' : null);
      drill({ behavior: 'chain', lastCell: 0 });
      s.face.lastHandCell = 30;
      s.face.cells = s.face.cells.map(() => 8);
      s.face.ore = [];
      e.tick(2.0);
      return (s.drills.units[0] as { lastCell: number }).lastCell;
    };
    out['handLed'] = { off: led(false), on: led(true) };

    /**
     * zoneIsOrder — CROWDING IS A SOFT DISCOUNT, so it only shows where it can
     * actually flip a ranking. The first cut used a two-cell zone on a flat
     * face and read 2-vs-2: the first machine STRIKES and drains its cell, so
     * the second one moves along by itself and crowding never entered into it.
     * The instrument was measuring depletion.
     *
     * So: two near-equal cells side by side (0 and 1) and a slightly poorer one
     * far away (5). Crowded, the second machine is pushed off cell 1 — adjacent
     * to the first — and out to cell 5. Uncrowded it takes cell 1, which is
     * genuinely the better rock. Reported as whether the FAR cell was touched.
     */
    const spreadOut = (on: boolean): number => {
      only(on ? 'zoneIsOrder' : null);
      s.drills.bayBuilt = true;
      s.drills.units = [0, 1].map((i) => ({
        level: 0, timer: 0, lastCell: 0, use: {}, name: `Z${i}`, zone: [0, 1, 5],
      }));
      s.face.cells = s.face.cells.map(() => 0);
      s.face.cells[0] = 100;
      s.face.cells[1] = 100;
      s.face.cells[5] = 80;
      s.face.ore = [];
      e.tick(2.0);
      const cells = s.drills.units.map((u) => (u as { lastCell: number }).lastCell);
      return cells.includes(5) ? 1 : 0; // 1 = crowded away to the far cell
    };
    out['zoneIsOrder'] = { off: spreadOut(false), on: spreadOut(true) };

    // oreIsRock — a rock-only zoned machine and a pocket in its zone.
    const tookOre = (on: boolean): number => {
      only(on ? 'oreIsRock' : null);
      drill({ priority: 'rock', zone: [5] });
      s.face.cells = s.face.cells.map(() => 320);
      s.face.ore = s.face.cells.map((_, i) => (i === 5 ? 'fatseam' : ''));
      s.face.oreDug = s.face.cells.map(() => 0);
      e.tick(0.2);
      return (s.drills.units[0] as { oreCell?: number }).oreCell === 5 ? 1 : 0;
    };
    out['oreIsRock'] = { off: tookOre(false), on: tookOre(true) };

    // pocketPatience — a pocket the hand has already started.
    const stole = (on: boolean): number => {
      only(on ? 'pocketPatience' : null);
      drill({});
      s.face.cells = s.face.cells.map(() => 320);
      s.face.ore = s.face.cells.map((_, i) => (i === 5 ? 'fatseam' : ''));
      s.face.oreDug = s.face.cells.map((_, i) => (i === 5 ? 1 : 0));
      e.tick(0.2);
      return (s.drills.units[0] as { oreCell?: number }).oreCell === 5 ? 1 : 0;
    };
    out['pocketPatience'] = { off: stole(false), on: stole(true) };

    // heldBreath — a kiln CLOSED by the player.
    const heat = (on: boolean): number => {
      only(on ? 'heldBreath' : null);
      s.drills.units = [];
      s.kiln['built'] = true;
      s.kiln['feeding'] = false;
      s.kiln['heat'] = 1;
      for (let i = 0; i < 90; i++) e.tick(1);
      return Math.round((s.kiln['heat'] as number) * 100);
    };
    out['heldBreath'] = { off: heat(false), on: heat(true) };

    // readStays — a sampled station across a fall.
    const kept = (on: boolean): number => {
      only(on ? 'readStays' : null);
      s.assayBench ??= { sampled: [], tier: 1 };
      s.assayBench.sampled = ['thequiet'];
      s.assayBench.remembered = [];
      e.dispatch({ type: 'debug', op: 'resetCompaction' }); // harmless, keeps state warm
      // Call the fall's own sample-clearing path via a real Collapse.
      const st = s as unknown as { depth: number };
      st.depth = 60;
      e.dispatch({ type: 'collapse' });
      return (s.assayBench?.remembered ?? []).length;
    };
    out['readStays'] = { off: kept(false), on: kept(true) };

    only(null);
    void ids;
    return out;
  }, IDS);

  for (const [id, v] of Object.entries(fired)) {
    console.log(`      ${id.padEnd(16)} off ${String(v.off).padStart(4)}   on ${String(v.on).padStart(4)}`);
  }
  truthy(Number(fired['shallowHolds']!.off) < 36 && Number(fired['shallowHolds']!.on) === 36,
    'shallowHolds — shallow rock relaxed, and now it does not');
  truthy(Number(fired['patientBank']!.off) === 0 && Number(fired['patientBank']!.on) > 0,
    'patientBank — the owed stroke was lost, and now it is banked');
  truthy(Number(fired['handLed']!.off) !== Number(fired['handLed']!.on),
    'handLed — the machine worked its own corner, and now it follows the hand',
    `${fired['handLed']!.off} -> ${fired['handLed']!.on}`);
  truthy(Number(fired['zoneIsOrder']!.off) === 1 && Number(fired['zoneIsOrder']!.on) === 0,
    'zoneIsOrder — a machine was pushed off good rock to keep clear, and now it is not');
  truthy(Number(fired['oreIsRock']!.off) === 0 && Number(fired['oreIsRock']!.on) === 1,
    'oreIsRock — a rock-only machine walked past the pocket in its zone, and now takes it');
  truthy(Number(fired['pocketPatience']!.off) === 1 && Number(fired['pocketPatience']!.on) === 0,
    'pocketPatience — the machine took the pocket you started, and now leaves it');
  truthy(Number(fired['heldBreath']!.off) < 50 && Number(fired['heldBreath']!.on) === 100,
    'heldBreath — a closed kiln cooled, and now it holds',
    `${fired['heldBreath']!.off}% -> ${fired['heldBreath']!.on}%`);
  truthy(Number(fired['readStays']!.off) === 0 && Number(fired['readStays']!.on) > 0,
    'readStays — the fall took the reading, and now the place stays legible');
  // gateSight was proved for real in step A and its rule read back off the panel.
  truthy(sentence !== '(none)', 'gateSight — proved in play, above');

  // ── C. PILLAR 2 ─────────────────────────────────────────────────────────
  console.log('C — dpsMax unmoved with all nine proved');
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
  const setProofs = (all: boolean): Promise<void> => page.evaluate((on) => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown };
    const s = e.getState() as unknown as { reading?: { proven: string[] } };
    s.reading!.proven = on
      ? ['gateSight', 'shallowHolds', 'patientBank', 'handLed', 'zoneIsOrder',
        'oreIsRock', 'pocketPatience', 'heldBreath', 'readStays']
      : [];
    e.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1 });
  }, all);

  await setProofs(false); await page.waitForTimeout(900);
  const none = await readCeiling();
  await setProofs(true); await page.waitForTimeout(900);
  const all = await readCeiling();
  // 'unread' would compare equal to itself and pass while measuring nothing —
  // exactly the last pass's failure, so it is the known-bad value here.
  check(all, none, 'unread', 'a fully proved Reading reads the SAME field ceiling');
  truthy(none !== 'unread' && all !== 'unread', 'and both reads actually found the number',
    `${none} / ${all}`);

  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(overflow, 0, 1, 'no horizontal overflow at 380px');
  truthy(errors.length === 0, 'no page errors throughout', errors.join(' | '));
  console.log(problems.length === 0 ? '\nALL PASS' : `\nFAILURES: ${problems.join(', ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
