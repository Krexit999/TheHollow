/**
 * A.56 — FINISH DRILLS, driven in the real UI.
 *
 * The brief named eight things it wanted to SEE, and this drives every one of
 * them through the rendered game rather than through the engine:
 *
 *   1  a newer-shell ability unlocked, and visibly stronger than a Loam one
 *   2  a Loam ability forged with newer materials performing better
 *   3  newer materials clearly marked as newer in the alloy picker
 *   4  the zone-select GUI painting cells, and a drill obeying them
 *   5  a priority toggle working — ores-only vs rock-only
 *   6  the steep buy curve
 *   7  a system-unlocked drill: visibly bigger, with an extra ability slot
 *   8  380px, zero horizontal overflow
 *
 * WHERE IT LOOKS MATTERS. Grid behaviour is read off the LIVE ENGINE's cell
 * charges after driving the real UI — not off an event, and not off a number
 * the UI printed. The A.53 lesson is that a mechanism can pass every isolated
 * check while the bay never uses it, so anything claiming "stronger" here is
 * measured as cells actually touched or charge actually taken.
 *
 *   npx tsx scripts/verify-a56.ts [port] [outDir]
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
  await page.screenshot({ path: `${OUT}/a56-${name}.png` });
  shots.push(`${OUT}/a56-${name}.png`);
}

async function overflow(page: Page, name: string): Promise<void> {
  const px = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(px === 0, `${name}: no horizontal overflow at ${W}px`, `${px}px`);
}

/** Run the bay for N stepped seconds and report which cells it touched. */
const workFace = (page: Page, seconds: number) =>
  page.evaluate(async (sec) => {
    const w = window as unknown as Record<string, any>;
    const drills = await import(/* @vite-ignore */ '/src/engine/systems/drills' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const s = w['__engine'].getState();
    // DOES NOT RESET THE FACE. It used to flatten every cell to 8, which
    // silently undid the caller's setup — the grade probe was aiming a drill at
    // a fat middle cell and measuring a corner instead, so grade I and grade V
    // both read "3 neighbours" and the grade looked inert when it was not.
    const before = s.face.cells.slice();
    const ctx = { emit() {}, dirty() {} };
    // STEPPED. `tickDrills` caps a machine at four strikes per call however
    // long the tick is, so one big dt is four strokes, not a minute of them.
    for (let t = 0; t < sec; t++) drills.tickDrills(s, new modsMod.ModifierCache(), ctx, 1);
    const touched: number[] = [];
    let took = 0;
    for (let i = 0; i < before.length; i++) {
      const d = before[i] - (s.face.cells[i] ?? 0);
      if (d > 1e-9) { touched.push(i); took += d; }
    }
    return { touched, took, cells: before.length,
      units: s.drills.units.length,
      zones: s.drills.units.map((u: { zone?: number[] }) => u.zone ?? null) };
  }, seconds);

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

  // === 1. THE POOL GROWS — a deeper shell unlocks deeper abilities =========
  console.log('\n1 — the pool grows as you descend');
  await setup(page, `
    const st = engine.getState();
    st.drills.bayBuilt = true; st.forge.built = true; st.kiln.built = true;
    st.depth = 40; st.maxDepthRecord = 60; st.depthRecords['loam'] = 60;
    st.currencies['dust'] = window.__D(1e9); st.currencies['brick'] = window.__D(1e9);
    st.drills.units = [];
    window.__drills.newDrill && [0,1,2].forEach((i) => st.drills.units.push(window.__drills.newDrill('D'+i)));
    st.face.ore = []; st.face.oreDug = [];
  `);
  await tab(page, 'drills');
  await dismiss(page);
  await tab(page, 'forge');
  await dismiss(page);
  let t = await text(page);
  const loamOnly = t.match(/(\d+)\/(\d+) known/);
  check(!!loamOnly && loamOnly[2] === '3',
    'in Loam the bench counts only the three Loam abilities', `saw ${loamOnly?.[0]}`);

  // Now the player has been to Cinder. The pool grows without a save edit to
  // the alloy list — it is the DEPTH RECORD that opens it.
  await setup(page, `
    const st = engine.getState();
    st.depthRecords['ferrite'] = 20; st.depthRecords['verdance'] = 20;
    st.depthRecords['glassmere'] = 20; st.depthRecords['cinder'] = 20;
    st.shell.breachCount = 4;
  `);
  await tab(page, 'drills');
  await tab(page, 'forge');
  await dismiss(page);
  t = await text(page);
  const deepPool = t.match(/(\d+)\/(\d+) known/);
  check(!!deepPool && deepPool[2] === '11',
    'after Cinder the bench counts eleven — the pool GREW with the descent', `saw ${deepPool?.[0]}`);
  await overflow(page, 'alloy bench');

  // === 2. NEWER MATERIALS ARE MARKED AS NEWER =============================
  console.log('\n2 — a player can see which metal is new');
  await setup(page, `
    const st = engine.getState();
    for (const [id, n] of [['marl',40],['rootglass',40],['umberjade',40],
                           ['lodestone',40],['bluesteel',40],['polarite',40],
                           ['heartflame',40],['pyrite',40]]) {
      window.__forge.addMaterial(st, id, 60, n);
    }
  `);
  await tab(page, 'forge');
  await dismiss(page);
  // The tier headers ARE the marking — one per shell, newest first.
  const tiers = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="tier-head-"]'))
      .map((e) => (e as HTMLElement).getAttribute('data-testid')!.replace('tier-head-', '')));
  check(tiers.length >= 3, 'the pool is grouped by shell, newest first', tiers.join(' > '));
  check(tiers[0] === 'cinder', 'the DEEPEST metal held is at the top of the list', `top = ${tiers[0]}`);
  t = await text(page);
  check(has(t, 'newest'), 'the newest group is labelled NEWEST out loud');
  check(has(t, 'newest metal first'), 'the list says how it is ordered');
  const chips = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="pool-"] span'))
      .map((e) => (e as HTMLElement).innerText.trim())
      .filter((x) => /^(I|II|III|IV|V|VI|VII)▲?$/.test(x)).length);
  check(chips > 0, 'every material row carries a roman tier chip', `${chips} chips`);
  // `closest('.overflow-y-auto')` finds the BENCH'S OWN inner list, so scrolling
  // it moved the pool inside a box that was itself off screen — the first shot
  // of this came out showing the top of the Forge. `scrollIntoViewIfNeeded`
  // walks every scrolling ancestor, which is what was wanted.
  await page.locator('[data-testid^="tier-head-"]').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(2600); // let the achievement toasts finish
  await shot(page, 'material-tiers');

  // === 3. THE GRADE — an old ability poured from newer metal ===============
  console.log('\n3 — a Loam ability, poured from Cinder metal');
  // Pour Arcvein from LOAM stone. rootglass + umberjade is two charged.
  await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    // Aimed, because in Cinder that mix would otherwise resolve deeper — the
    // aim affordance is itself part of what is being verified.
    const st = w['__engine'].getState();
    st.drills.alloys.push('arcvein');
    w['__engine'].dispatch({
      type: 'forgeDrillAlloy', materialIds: ['rootglass', 'umberjade'],
      drills: [0], prefer: 'arcvein',
    });
  });
  await page.waitForTimeout(300);
  const gradeI = await page.evaluate(() =>
    (window as unknown as Record<string, any>)['__engine'].getState().drills.units[0].fits);
  check(gradeI?.[0]?.id === 'arcvein' && gradeI[0].grade === 1,
    'Loam stone pours Arcvein at grade I', JSON.stringify(gradeI));

  // The SAME ability, from Cinder stone. heartflame+pyroclast was the first
  // try and it made EMBERSET — both are warm, which is the SET's signature, and
  // the aim correctly declined to override a mix that could not carry Arcvein.
  // pyrite is keen/charged, so heartflame+pyrite is charged:2 in Cinder metal.
  await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    w['__engine'].dispatch({
      type: 'forgeDrillAlloy', materialIds: ['heartflame', 'pyrite'],
      drills: [1], prefer: 'arcvein',
    });
  });
  await page.waitForTimeout(300);
  const gradeV = await page.evaluate(() =>
    (window as unknown as Record<string, any>)['__engine'].getState().drills.units[1].fits);
  check(gradeV?.[0]?.id === 'arcvein' && gradeV[0].grade === 5,
    'Cinder stone pours the SAME ability at grade V', JSON.stringify(gradeV));

  // And it is actually stronger on the rock, not just in the label.
  const reachAt = async (grade: number): Promise<number> => {
    await setup(page, `
      const st = engine.getState();
      st.drills.units = [];
      st.drills.units.push(window.__drills.newDrill('probe'));
      st.drills.units[0].fits = [{ id: 'arcvein', grade: ${grade} }];
      st.face.cells = st.face.cells.map(() => 8);
      const mid = Math.floor(st.face.h/2)*st.face.w + Math.floor(st.face.w/2);
      st.face.cells[mid] = 60;
    `);
    const r = await workFace(page, 3);
    return r.touched.length;
  };
  const r1 = await reachAt(1);
  const r5 = await reachAt(5);
  check(r5 > r1, 'the grade-V Arcvein reaches further on the live face than grade I',
    `${r1} cells vs ${r5} cells per stroke`);

  // And a DEEPER-SHELL ability is stronger again than the Loam one.
  await setup(page, `
    const st = engine.getState();
    st.drills.units = [];
    st.drills.units.push(window.__drills.newDrill('probe'));
    st.drills.units[0].fits = [{ id: 'everywhen', grade: 7 }];
    st.face.cells = st.face.cells.map(() => 8);
  `);
  const deepReach = (await workFace(page, 3)).touched.length;
  check(deepReach > r5, 'an Aleph ability reaches further than a graded Loam one',
    `everywhen ${deepReach} vs arcvein-V ${r5}`);
  await tab(page, 'drills');
  await dismiss(page);
  await shot(page, 'grades-in-the-bay');
  await overflow(page, 'drill bay');

  // === 4. ROUTING — paint the squares, and the drill obeys ================
  console.log('\n4 — the zone picker paints, and the bay obeys it');
  await setup(page, `
    const st = engine.getState();
    st.drills.units = [];
    [0,1].forEach((i) => st.drills.units.push(window.__drills.newDrill('D'+i)));
    st.face.cells = st.face.cells.map(() => 8);
  `);
  await tab(page, 'drills');
  await dismiss(page);
  const routeBtn = page.locator('[data-testid="route-0"]');
  check(await routeBtn.count() > 0, 'every drill row has a Route button');
  await routeBtn.click();
  await page.waitForTimeout(300);
  check(await page.locator('[data-testid="route-picker"]').count() > 0, 'the routing GUI opens');
  await page.locator('[data-testid="route-picker"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  // PAINT: a real pointer drag across the first row, not a state poke.
  //
  // SCROLL THE CELL INTO VIEW, NOT THE PICKER. Bringing the picker's top edge
  // on screen leaves its ~400px grid below the fold at 380x900, so the drag
  // was landing on nothing and reporting "0 lit" — which reads as the painting
  // being broken when it is the driver aiming off-screen.
  const first = page.locator('[data-testid="zone-cell-0"]');
  await first.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const b0 = await first.boundingBox();
  const b2 = await page.locator('[data-testid="zone-cell-2"]').boundingBox();
  check(!!b0 && b0.y + b0.height <= H, 'the zone grid is on screen to be dragged on',
    b0 ? `cell 0 at y=${Math.round(b0.y)}` : 'no box');
  if (b0 && b2) {
    await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
    await page.mouse.down();
    await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2, { steps: 10 });
    await page.mouse.up();
  }
  await page.waitForTimeout(200);
  const painted = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="zone-cell-"]'))
      .filter((e) => e.getAttribute('aria-pressed') === 'true').length);
  check(painted >= 3, 'dragging across the grid paints the cells it passed', `${painted} lit`);
  await shot(page, 'zone-picker');
  await overflow(page, 'zone picker');

  await page.locator('[data-testid="route-done"]').click();
  await page.waitForTimeout(300);
  const zone: number[] = (await page.evaluate(() =>
    (window as unknown as Record<string, any>)['__engine'].getState().drills.units[0].zone)) ?? [];
  check(zone.length >= 3, 'Done commits the zone to the drill', JSON.stringify(zone));
  t = await text(page);
  check(has(t, `${zone.length} squares`), 'the drill row reports its zone without opening the menu');

  // THE OBEDIENCE CHECK: only the painted cells lose charge.
  // ONLY THE ZONED MACHINE MAY WORK ROCK. Truncating the array was not enough:
  // the live engine loop keeps granting prize drills between the setup and the
  // measurement (which is itself evidence the Part 3 hook is running), and an
  // unzoned newcomer chipping the whole face reads as the zone being ignored.
  // So every OTHER drill is routed at ore, and there is no ore — they idle.
  await setup(page, `
    const st = engine.getState();
    st.drills.units.forEach((u, i) => { if (i > 0) u.priority = 'ores'; });
    st.face.ore = new Array(st.face.cells.length).fill('');
    st.face.cells = st.face.cells.map(() => 8);
  `);
  const worked = await workFace(page, 40);
  const outside = worked.touched.filter((c) => !zone.includes(c));
  check(outside.length === 0, 'a zoned drill touches NOTHING outside its squares',
    `touched ${worked.touched.join(',')} | zone ${zone.join(',')} | units ${worked.units} | zones ${JSON.stringify(worked.zones)}`);
  check(worked.touched.length > 0, 'and it does work the squares it was given');

  // === 5. PRIORITY — ores only vs rock only ===============================
  console.log('\n5 — the priority toggle');
  await setup(page, `
    const st = engine.getState();
    st.drills.units = [];
    [0,1].forEach((i) => st.drills.units.push(window.__drills.newDrill('D'+i)));
    st.face.cells = st.face.cells.map(() => 8);
    st.face.ore = new Array(st.face.cells.length).fill('');
    st.face.ore[10] = 'fatseam';
    st.face.cells[10] = 400;                  // worth the trip
    st.face.oreDug = new Array(st.face.cells.length).fill(0);
  `);
  await tab(page, 'drills');
  await dismiss(page);
  await page.locator('[data-testid="route-0"]').click();
  await page.waitForTimeout(250);
  await page.locator('[data-testid="priority-rock"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="route-done"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="route-1"]').click();
  await page.waitForTimeout(250);
  await page.locator('[data-testid="priority-ores"]').click();
  await page.waitForTimeout(200);
  await shot(page, 'priority');
  await page.locator('[data-testid="route-done"]').click();
  await page.waitForTimeout(200);

  const prio = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    return w['__engine'].getState().drills.units.map((u: { priority?: string }) => u.priority ?? null);
  });
  check(prio[0] === 'rock' && prio[1] === 'ores',
    'the two machines hold two different priorities', JSON.stringify(prio));

  const claims = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const drills = await import(/* @vite-ignore */ '/src/engine/systems/drills' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const s = w['__engine'].getState();
    // THE GAME NEVER STOPPED. Between placing that pocket and setting the two
    // priorities, the real engine loop ran for a couple of seconds and a drill
    // claimed it under the OLD routing — so the measurement was reading a
    // claim made before the thing being measured existed. Release everything
    // and re-place the pocket immediately before the tick under test.
    for (const u of s.drills.units) { delete u.oreCell; delete u.oreProgress; }
    s.face.ore = new Array(s.face.cells.length).fill('');
    s.face.ore[10] = 'fatseam';
    s.face.cells[10] = 400;
    drills.tickDrills(s, new modsMod.ModifierCache(), { emit() {}, dirty() {} }, 1);
    return s.drills.units.map((u: { oreCell?: number }) => u.oreCell ?? -1);
  });
  check(claims[0] === -1, 'the ROCK-ONLY machine refuses the pocket', `oreCell ${claims[0]}`);
  check(claims[1] === 10, 'the ORE-ONLY machine takes it', `oreCell ${claims[1]}`);
  t = await text(page);
  check(has(t, 'rock only') && has(t, 'ore only'), 'the rows say which is which in plain words');
  await overflow(page, 'priority set');

  // === 6. THE BUY CURVE ===================================================
  console.log('\n6 — a drill is an investment now');
  const curve = await page.evaluate(async () => {
    const up = await import(/* @vite-ignore */ '/src/engine/upgrades' + '.ts');
    const def = up.allUpgrades().find((u: { id: string }) => u.id === 'drillCount');
    // NO NAMED ARROWS IN HERE. tsx compiles this body with keepNames, which
    // wraps a `const f = () => …` in a `__name()` helper that does not exist in
    // the page — it throws ReferenceError at the first call and reads as a
    // game bug rather than a harness one.
    const base = def.baseCost.toNumber();
    return {
      ratio: def.ratio, maxLevel: def.maxLevel,
      last: base * Math.pow(def.ratio, def.maxLevel),
      whole: base * (Math.pow(def.ratio, def.maxLevel + 1) - 1) / (def.ratio - 1),
      old: 6 * (Math.pow(1.25, 24) - 1) / 0.25,
    };
  });
  check(curve.ratio === 1.75 && curve.maxLevel === 15,
    'the shop row is the STRUCTURAL class (r=1.75, 15 levels)', `r=${curve.ratio}, n=${curve.maxLevel}`);
  check(curve.last > curve.old,
    'the LAST bought chassis alone costs more than the entire old row did',
    `${Math.round(curve.last)} vs ${Math.round(curve.old)}`);
  await setup(page, `
    const st = engine.getState();
    st.upgrades['drillCount'] = 12;
    st.currencies['brick'] = window.__D(1e9);
  `);
  await tab(page, 'drills');
  await dismiss(page);
  await shot(page, 'buy-curve');

  // === 7. A DRILL YOU DID NOT BUY =========================================
  console.log('\n7 — the prize chassis');
  await setup(page, `
    const st = engine.getState();
    st.drills.units = [];
    st.drills.units.push(window.__drills.newDrill('Bess'));
    for (let i = 0; i < 12; i++) st.achievements.unlocked['seed'+i] = true;
  `);
  // The engine's own one-second beat grants it — not a dispatch from here.
  await page.evaluate(() => {
    (window as unknown as Record<string, any>)['__engine']
      .dispatch({ type: 'debug', op: 'warp', seconds: 5 });
  });
  await page.waitForTimeout(600);
  await tab(page, 'drills');
  await dismiss(page);
  const prize = await page.evaluate(() => {
    const s = (window as unknown as Record<string, any>)['__engine'].getState();
    const u = s.drills.units.find((x: { prize?: string }) => x.prize);
    return u ? { name: u.name, prize: u.prize, slots: u.slots } : null;
  });
  check(!!prize, 'reaching ten achievements delivers a drill nobody bought', JSON.stringify(prize));
  check((prize?.slots ?? 0) >= 2, 'and it carries more than one alloy slot', `${prize?.slots} slots`);
  t = await text(page);
  check(has(t, 'prize') && has(t, 'slots'), 'the row says it is a prize and says why it is better');
  check(has(t, 'Not for sale'), 'the panel explains where the other rails come from');

  // BIGGER ON THE FACE. Read the renderer's own drawn radius, not the state.
  const sizes = await page.evaluate(() => {
    const v = (window as unknown as Record<string, any>)['__faceView'];
    if (!v) return null;
    return v['drillSprites'].map((sp: { body: { getLocalBounds: () => { width: number } }; look: string }) => ({
      w: sp.body.getLocalBounds().width, look: sp.look,
    }));
  });
  if (sizes && sizes.length >= 2) {
    const prizeSprite = sizes.find((x: { look: string }) => x.look.includes('*'));
    const plainSprite = sizes.find((x: { look: string }) => !x.look.includes('*'));
    check(!!prizeSprite && !!plainSprite && prizeSprite.w > plainSprite.w * 1.3,
      'the prize chassis is DRAWN bigger than a bought one',
      `${plainSprite?.w?.toFixed(1)}px vs ${prizeSprite?.w?.toFixed(1)}px`);
  } else {
    check(false, 'the renderer exposed its drill sprites', 'no __faceView');
  }

  // TWO ABILITIES ON ONE MACHINE — the thing only a prize can do.
  const both = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    const i = s.drills.units.findIndex((x: { prize?: string }) => x.prize);
    s.drills.alloys = ['arcvein', 'emberset'];
    s.drills.units[i].fits = [{ id: 'arcvein', grade: 1 }, { id: 'emberset', grade: 1 }];
    return { i, fits: s.drills.units[i].fits.length, slots: s.drills.units[i].slots };
  });
  check(both.fits === 2, 'a prize drill holds two abilities at once', JSON.stringify(both));
  await tab(page, 'forge');
  await tab(page, 'drills');
  await dismiss(page);
  t = await text(page);
  check(has(t, 'Arcvein') && has(t, 'Emberset'),
    'and the bay row prints both of them on one machine');
  await page.locator('[data-testid="drill-row-1"]').scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(2600); // toasts out of the way of the row being shown
  await shot(page, 'prize-drill');
  await overflow(page, 'prize drill');

  // Both hooks actually run on that one machine.
  const mixed = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const drills = await import(/* @vite-ignore */ '/src/engine/systems/drills' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const s = w['__engine'].getState();
    s.face.cells = s.face.cells.map(() => 8);
    const before = s.face.cells.slice();
    for (let i = 0; i < 8; i++) drills.tickDrills(s, new modsMod.ModifierCache(), { emit() {}, dirty() {} }, 1);
    let touched = 0;
    for (let i = 0; i < before.length; i++) if ((s.face.cells[i] ?? 0) < before[i] - 1e-9) touched++;
    return { touched, residue: (s.drills.residue ?? []).filter((r: number) => r > 0).length };
  });
  check(mixed.touched > 1, 'the arc half of the pair reaches', `${mixed.touched} cells`);
  check(mixed.residue > 0, 'the set half of the pair marks the rock', `${mixed.residue} soft cells`);

  // === 8. THE FACE STILL RENDERS ALL OF IT ================================
  console.log('\n8 — the whole thing at 380px');
  await tab(page, 'dig');
  await dismiss(page);
  await page.waitForTimeout(600);
  await shot(page, 'face');
  await overflow(page, 'face');

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
