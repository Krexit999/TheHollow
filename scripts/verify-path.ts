/**
 * TWO THINGS, DRIVEN IN THE REAL UI.
 *
 * A — THE FOUR ROUTING MODES, each measured for a DIFFERENT outcome. "Ore
 *     first" used to be a queue tie-break and nothing else, so it measured
 *     identical to "rock and ore" — 140 pockets and 248 strikes for both, to
 *     the unit. A setting that reads as a choice and changes nothing is worse
 *     than no setting, so each mode now has to prove it does its own thing.
 *
 * B — THE PATH TO AN ABILITY, walked end to end without private knowledge:
 *     "I have materials" -> find the bench -> narrow a hundred materials down
 *     -> pour -> see it on the drill -> watch it charge -> watch it fire.
 *     The system worked in code and was unreachable in play; every step below
 *     is a place a player could previously get stuck.
 *
 *   npx tsx scripts/verify-path.ts [port] [outDir]
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
const text = async (page: Page): Promise<string> =>
  (await page.locator('body').innerText()).replace(/\s+/g, ' ');
const has = (t: string, s: string): boolean => t.toLowerCase().includes(s.toLowerCase());

async function shot(page: Page, name: string): Promise<void> {
  await dismiss(page);
  await page.screenshot({ path: `${OUT}/path-${name}.png` });
  shots.push(`${OUT}/path-${name}.png`);
}

async function overflow(page: Page, name: string): Promise<void> {
  const px = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(px === 0, `${name}: no horizontal overflow at ${W}px`, `${px}px`);
}

/**
 * Run a bay of four machines on a stocked face for N stepped seconds and report
 * what they did. `fill` is how full the pockets are as a fraction of an ore
 * cell's cap — the only regime where "ore first" and "rock and ore" can
 * possibly differ is between the two thresholds (0.35 and 0.70).
 */
async function measure(page: Page, prio: string | null, fill: number) {
  return page.evaluate(async ({ p, f }) => {
    const w = window as unknown as Record<string, any>;
    const drills = await import(/* @vite-ignore */ '/src/engine/systems/drills' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const s = w['__engine'].getState();
    s.drills.units.length = 0;
    for (let i = 0; i < 4; i++) s.drills.units.push(drills.newDrill('D' + i));
    if (p) for (const u of s.drills.units) u.priority = p;
    s.face.cells = s.face.cells.map(() => 8);
    s.face.ore = new Array(s.face.cells.length).fill('');
    s.face.oreDug = new Array(s.face.cells.length).fill(0);
    // NO NAMED ARROWS IN AN EVALUATE — tsx compiles this body with keepNames,
    // which wraps `const f = () => …` in a `__name()` helper the page does not
    // have, and it throws ReferenceError on the first call. Object-method
    // shorthand is fine; a const arrow is not.
    const topUp = { run(): void {
      let n = (s.face.ore ?? []).filter(Boolean).length;
      for (let i = 0; i < s.face.cells.length && n < 6; i++) {
        if (!s.face.ore[i]) { s.face.ore[i] = 'fatseam'; s.face.cells[i] = 8 * 2.2 * f; n++; }
      }
    } };
    topUp.run();
    const ore0 = s.stats.oresOpened ?? 0;
    const st0 = s.stats.drillStrikes;
    const ctx = { emit() {}, dirty() {} };
    for (let t = 0; t < 300; t++) {
      drills.tickDrills(s, new modsMod.ModifierCache(), ctx, 1);
      if (t % 10 === 0) topUp.run();
    }
    return { ore: (s.stats.oresOpened ?? 0) - ore0, strikes: s.stats.drillStrikes - st0 };
  }, { p: prio, f: fill });
}

const STOCK = `
  const st = engine.getState();
  st.drills.bayBuilt = true; st.forge.built = true; st.kiln.built = true;
  st.depth = 40; st.maxDepthRecord = 60; st.depthRecords['loam'] = 60;
  st.currencies['dust'] = window.__D(1e12); st.currencies['brick'] = window.__D(1e12);
  st.face.cells = st.face.cells.map(() => 8);
  st.face.ore = new Array(st.face.cells.length).fill('');
  st.face.oreDug = new Array(st.face.cells.length).fill(0);
  st.drills.units = [];
  st.drills.units.push(window.__drills.newDrill('Bess'));
  st.drills.alloys = [];
  st.drills.units[0].fits = undefined;
`;

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: W, height: H }, reducedMotion: 'no-preference' });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[console] ${m.text().slice(0, 200)}`); });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    const w = window as unknown as Record<string, unknown>;
    w['__D'] = (await import(/* @vite-ignore */ '/src/engine/decimal' + '.ts')).D;
    w['__drills'] = await import(/* @vite-ignore */ '/src/engine/systems/drills' + '.ts');
    w['__forge'] = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
  });
  await setup(page, STOCK);

  // ═══ A. THE FOUR MODES ══════════════════════════════════════════════════
  console.log('\nA — the four routing modes, each doing its own thing');
  console.log('  (pockets HALF full — between the eager bar and the ordinary one)');
  const half: Record<string, { ore: number; strikes: number }> = {};
  for (const p of ['both', 'oresFirst', 'ores', 'rock']) half[p] = await measure(page, p, 0.5);
  for (const [k, v] of Object.entries(half)) console.log(`    ${k.padEnd(10)} ore ${v.ore}  strikes ${v.strikes}`);

  check(half['both']!.ore === 0 && half['both']!.strikes > 0,
    'ROCK AND ORE waits for a pocket to be worth the trip, and chips meanwhile',
    `ore ${half['both']!.ore}, strikes ${half['both']!.strikes}`);
  check(half['oresFirst']!.ore > 0,
    'ORE FIRST takes them at a third full — the thing it never used to do',
    `ore ${half['oresFirst']!.ore}`);
  check(half['oresFirst']!.ore > half['both']!.ore,
    'and it is measurably different from ROCK AND ORE (it used to be identical)',
    `${half['oresFirst']!.ore} vs ${half['both']!.ore}`);
  check(half['ores']!.strikes === 0,
    'ORE ONLY chips no rock at all — it waits, which is the trade',
    `strikes ${half['ores']!.strikes}`);
  check(half['rock']!.ore === 0 && half['rock']!.strikes > 0,
    'ROCK ONLY never touches a pocket', `ore ${half['rock']!.ore}, strikes ${half['rock']!.strikes}`);

  console.log('  (pockets NEARLY full — everyone should want them now)');
  const full: Record<string, { ore: number; strikes: number }> = {};
  for (const p of ['both', 'oresFirst', 'ores', 'rock']) full[p] = await measure(page, p, 0.95);
  for (const [k, v] of Object.entries(full)) console.log(`    ${k.padEnd(10)} ore ${v.ore}  strikes ${v.strikes}`);
  check(full['both']!.ore > 0 && full['oresFirst']!.ore > 0,
    'both ore-taking modes take a full pocket');
  check(full['ores']!.ore > 0 && full['ores']!.strikes === full['ores']!.ore,
    'ORE ONLY still spends every stroke on pockets and none on rock',
    `ore ${full['ores']!.ore}, strikes ${full['ores']!.strikes}`);
  check(full['rock']!.ore === 0, 'ROCK ONLY still refuses a full pocket');

  // ═══ B. THE PATH TO AN ABILITY ══════════════════════════════════════════
  console.log('\nB — from "I have materials" to a Slagburst going off');

  // --- 1. Does the game TELL me abilities exist? -------------------------
  console.log('\n  1 — the bay says abilities exist, and where they come from');
  await setup(page, STOCK);
  await tab(page, 'drills');
  await dismiss(page);
  await page.waitForTimeout(9000); // achievement toasts, so the shot is readable
  await dismiss(page);
  check(await page.locator('[data-testid="ability-howto"]').count() > 0,
    'a bay with no abilities shows how to get one');
  let t = await text(page);
  check(has(t, 'alloy') && has(t, 'traits are the clue'),
    'it names the mechanism — an alloy, and the traits are the lever');
  check(await page.locator('[data-testid="goto-bench"]').count() > 0,
    'and gives a button straight to the bench');
  await shot(page, '1-howto');
  await overflow(page, 'bay');

  // --- 2. Does the button get me there? ---------------------------------
  console.log('\n  2 — the button opens the bench, aimed at a drill');
  await page.locator('[data-testid="goto-bench"]').click();
  await page.waitForTimeout(800);
  check(await page.locator('[data-testid="bench-loadout"]').count() > 0,
    'the alloy bench is on screen');
  const targets = await page.evaluate(() =>
    (window as unknown as Record<string, any>)['__ui'].getState().alloyTargets);
  check(Array.isArray(targets) && targets.length > 0,
    'and it arrived with a drill already picked', JSON.stringify(targets));

  // --- 3. Can I find two brittle materials among a hundred? -------------
  console.log('\n  3 — narrowing a hundred materials to the ones that matter');
  await setup(page, `
    const st = engine.getState();
    for (const [id, n] of [['marl',60],['ochre',60],['bonechalk',60],['graveclay',60],
                           ['duskflint',60],['rootglass',60],['loamiron',60],['umberjade',60]]) {
      window.__forge.addMaterial(st, id, 60, n);
    }
  `);
  await tab(page, 'forge');
  await dismiss(page);
  const filter = page.locator('[data-testid="trait-filter"]');
  check(await filter.count() > 0, 'the pool can be filtered by trait');
  const allRows = await page.locator('[data-testid^="pool-"]').count();
  await page.locator('[data-testid="trait-brittle"]').click();
  await page.waitForTimeout(300);
  const brittleRows = await page.locator('[data-testid^="pool-"]').count();
  check(brittleRows > 0 && brittleRows < allRows,
    'picking BRITTLE narrows the list to just the brittle ones',
    `${allRows} materials -> ${brittleRows}`);
  t = await text(page);
  check(/carry brittle/.test(t), 'and it says how many carry it', t.match(/\d+ carry brittle/)?.[0] ?? '-');
  await shot(page, '3-trait-filter');

  // --- 4. Does the crucible tell me what I am holding? ------------------
  console.log('\n  4 — the crucible counts the traits, so the mix is legible');
  // TWO BRITTLE, AND ONE OF THEM CARRYING NOTHING ELSE THE WORLD READS.
  // Loam has three brittle materials and TWO of them also carry `charged`, so
  // the obvious pick (the top two in the filtered list) pools brittle x2 AND
  // charged x2 — which satisfies Chainbreaker's richer signature and wins on
  // rank. That is legitimate discovery rather than a bug, and it is exactly why
  // the pooled-trait readout matters: the player can SEE why they got something
  // else. The driver takes bonechalk (brittle/light) + rootglass (charged/
  // brittle), which pools brittle x2, charged x1 — Slagburst and nothing above it.
  await page.locator('[data-testid="pool-bonechalk"]').click();
  await page.locator('[data-testid="pool-rootglass"]').click();
  await page.waitForTimeout(300);
  check(await page.locator('[data-testid="pool-traits"]').count() > 0,
    'the bench shows the POOLED traits of what is in the crucible');
  const pooled = await page.locator('[data-testid="pool-traits"]').innerText();
  check(/brittle ×2/.test(pooled.replace(/\s+/g, ' ')),
    'and it reads "brittle ×2" — the number the signatures are made of', pooled.replace(/\s+/g, ' '));
  await shot(page, '4-crucible');

  // --- 5. Pour it. --------------------------------------------------------
  console.log('\n  5 — pour, and get Slagburst');
  // Fired through the BUTTON, not a hand-built dispatch — the button is the
  // thing a player has to be able to find and press.
  const pourBtn = page.getByRole('button', { name: /^Pour it into/ });
  check(await pourBtn.count() > 0, 'the bench offers a POUR button naming the target',
    await pourBtn.innerText().catch(() => '-'));
  await pourBtn.click();
  await page.waitForTimeout(500);
  const got = await page.evaluate(() => {
    const s = (window as unknown as Record<string, any>)['__engine'].getState();
    return { known: s.drills.alloys, fitted: s.drills.units[0].fits ?? [] };
  });
  check(got.known.includes('slagburst'),
    'two brittle materials make SLAGBURST', JSON.stringify(got.known));
  check(got.fitted.some((f: { id: string }) => f.id === 'slagburst'),
    'and it went straight onto the drill that was picked', JSON.stringify(got.fitted));
  await page.waitForTimeout(400);
  t = await text(page);
  check(has(t, 'Slagburst'), 'and the bench now names it, with its signature');
  await shot(page, '5-poured');

  // --- 6. Is it obvious the drill has it? --------------------------------
  console.log('\n  6 — the drill says what it has and when it goes off');
  await tab(page, 'drills');
  await dismiss(page);
  check(await page.locator('[data-testid="charge-0-0"]').count() > 0,
    'the drill row carries a charge readout for the ability');
  const row = await page.locator('[data-testid="charge-0-0"]').innerText();
  const flat = row.replace(/\s+/g, ' ');
  check(/SLAGBURST/i.test(flat), 'it names the ability', flat.slice(0, 60));
  check(/every 30 strokes/.test(flat), 'it says WHEN it fires', flat.match(/every \d+ strokes/)?.[0] ?? '-');
  check(/\d+\/30/.test(flat) || /READY/.test(flat), 'and how far along it is', flat.match(/\d+\/30|READY/)?.[0] ?? '-');
  check(has(flat.toLowerCase(), 'three cells by three'), 'and what it will do', flat.slice(-70));
  await shot(page, '6-on-the-drill');
  await overflow(page, 'drill row');

  // --- 7. Watch it charge, with nobody helping ---------------------------
  console.log('\n  7 — it charges while the drill works');
  const c0 = await page.evaluate(() =>
    (window as unknown as Record<string, any>)['__engine'].getState().drills.units[0].fits[0].ch);
  await page.evaluate(() => {
    (window as unknown as Record<string, any>)['__engine']
      .dispatch({ type: 'debug', op: 'warp', seconds: 30 });
  });
  await page.waitForTimeout(500);
  const c1 = await page.evaluate(() =>
    (window as unknown as Record<string, any>)['__engine'].getState().drills.units[0].fits[0].ch);
  check(c1 > c0, 'the meter moves as the machine works', `${c0} -> ${c1}`);

  // --- 8. FIRE ------------------------------------------------------------
  console.log('\n  8 — charged, and a button that says so');
  await setup(page, `
    const st = engine.getState();
    st.face.cells = st.face.cells.map(() => 8);
    st.drills.units[0].fits[0].ch = 30;
  `);
  await tab(page, 'drills');
  await dismiss(page);
  const btn = page.locator('[data-testid="fire-0-0"]');
  const lbl = await btn.innerText();
  check(/fire/i.test(lbl), 'a charged ability offers a FIRE button', lbl);
  const readyRow = (await page.locator('[data-testid="charge-0-0"]').innerText()).replace(/\s+/g, ' ');
  check(/READY/.test(readyRow), 'and the row says READY', readyRow.slice(0, 60));
  await shot(page, '8-ready');

  const before = await page.evaluate(() =>
    (window as unknown as Record<string, any>)['__engine'].getState().face.cells.slice());
  await btn.click();
  await page.waitForTimeout(150);
  const after = await page.evaluate(() =>
    (window as unknown as Record<string, any>)['__engine'].getState().face.cells.slice());
  const touched: number[] = [];
  for (let i = 0; i < before.length; i++) if (after[i] < before[i] - 1e-9) touched.push(i);
  const w6 = await page.evaluate(() =>
    (window as unknown as Record<string, any>)['__engine'].getState().face.w);
  const xs = touched.map((c) => c % w6);
  const ys = touched.map((c) => Math.floor(c / w6));
  check(touched.length >= 4
    && Math.max(...xs) - Math.min(...xs) <= 2 && Math.max(...ys) - Math.min(...ys) <= 2,
    'clicking it detonates a solid block, three by three',
    `${touched.length} cells, ${Math.max(...xs) - Math.min(...xs) + 1}x${Math.max(...ys) - Math.min(...ys) + 1}`);
  const drawn = await page.evaluate(() => {
    const v = (window as unknown as Record<string, any>)['__faceView'];
    return v ? v['abilityFx'].length : -1;
  });
  check(drawn > 0, 'and the face draws the burst', `${drawn} figure(s) live`);
  await tab(page, 'dig');
  await dismiss(page);
  await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    s.face.cells = s.face.cells.map(() => 8);
    s.drills.units[0].fits[0].ch = 30;
    w['__engine'].dispatch({ type: 'fireAbility', index: 0, slot: 0, cell: 21 });
  });
  await page.waitForTimeout(120);
  await shot(page, '9-firing');

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
