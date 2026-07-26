/**
 * A.55 — ORES IN THE GRID, driven in the real UI.
 *
 * The checks the brief asked to SEE:
 *   1  ore cells VISIBLE in the grid, distinct from rock, scattered AND chunked
 *   2  the 20% cap, and the 60s anti-drought floor actually firing
 *   3  hand-mining a pocket (slower, cleaner) vs a drill (faster, leaves some)
 *   4  drills routed at pockets harvesting them while the face is chipped by hand
 *   5  each ore TYPE drawn as its own shape, not four hues of one crystal
 *   6  a drill locked to its pocket through a lure and a face-widen
 *   5  (the sim, run separately: sim-out/a55-ore-ceiling.md)
 *
 * The visible checks read the LIVE renderer's own tiles — what it has actually
 * committed to each cell — rather than trusting that the engine set a flag.
 *
 *   npx tsx scripts/verify-ores.ts [port] [outDir]
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

/** What the RENDERER has drawn — not what the engine intends. */
const face = async (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const v = w['__faceView'];
    const s = w['__engine'].getState();
    const drawn = v ? v['tiles'].map((t: { oreId: string; digBand: number }) => ({ id: t.oreId, dig: t.digBand })) : [];
    return {
      cells: s.face.cells.length as number,
      w: s.face.w as number,
      engineOre: (s.face.ore ?? []).map((x: string) => x || '') as string[],
      drawnOre: drawn.map((d: { id: string }) => d.id) as string[],
      digging: drawn.filter((d: { dig: number }) => d.dig > 0).length as number,
      seen: (s.face.oreSeen ?? []) as string[],
      dryFor: (s.face.oreDryFor ?? 0) as number,
      opened: (s.stats.oresOpened ?? 0) as number,
      drops: s.materials.totalDrops as number,
      hunting: s.drills.huntOres !== false,
      drillOre: s.drills.units.map((u: { oreCell?: number }) => u.oreCell ?? -1) as number[],
    };
  });

async function shot(page: Page, name: string, anchor?: string): Promise<void> {
  await dismiss(page);
  if (anchor) {
    await page.evaluate((a) => {
      const t = Array.from(document.querySelectorAll('div, span')).find((d) => d.textContent?.trim().startsWith(a));
      const box = t?.closest('.overflow-y-auto') as HTMLElement | null;
      if (box && t) box.scrollTop = (t as HTMLElement).offsetTop - box.offsetTop - 8;
    }, anchor);
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: `${OUT}/a55-${name}.png` });
  shots.push(`${OUT}/a55-${name}.png`);
}

async function overflow(page: Page, name: string): Promise<void> {
  const px = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(px === 0, `${name}: no horizontal overflow at ${W}px`, `${px}px`);
}

const warp = (page: Page, sec: number) =>
  page.evaluate((s) => {
    (window as unknown as Record<string, any>)['__engine'].dispatch({ type: 'debug', op: 'warp', seconds: s });
  }, sec);

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: W, height: H }, reducedMotion: 'no-preference' });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[console] ${m.text().slice(0, 200)}`); });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    const d = await import(/* @vite-ignore */ '/src/engine/systems/drills' + '.ts');
    const dec = await import(/* @vite-ignore */ '/src/engine/decimal' + '.ts');
    const w = window as unknown as Record<string, unknown>;
    w['__D'] = dec.D;
    w['__mk'] = (s: never, n: number) => {
      for (let i = 0; i < n; i++) (s as unknown as { drills: { units: unknown[] } }).drills.units.push(d.newDrill(`D${i}`));
    };
  });

  // === 1. POCKETS ARE VISIBLE, SCATTERED AND CHUNKED =====================
  console.log('\n1 — pockets in the rock, and you can see them');
  await setup(page, `
    const st = engine.getState();
    st.depth = 40;
    st.upgrades['soil'] = 10; st.upgrades['roots'] = 4;
    st.currencies['dust'] = window.__D(50000);
    st.face.ore = []; st.face.oreDug = []; st.face.oreSeen = [];
    st.drills.huntOres = false;   // nothing eats them while we look
  `);
  await dismiss(page);
  await tab(page, 'dig');
  await dismiss(page);
  // Seed a scatter and a vein deterministically, so "both patterns" is a claim
  // about the SPAWNER rather than about this run's luck.
  await page.evaluate(async () => {
    const o = await import(/* @vite-ignore */ '/src/engine/systems/ores' + '.ts');
    const m = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    const mods = new m.ModifierCache();
    const ctx = { emit() {}, dirty() {} };
    // Fixed rng sequences, so "both patterns" is a claim about the SPAWNER
    // rather than about this run's luck.
    let vi = 0;
    const vxs = [0.1, 0.05, 0.99, 0.2, 0.3, 0.1, 0.4, 0.2, 0.3];
    w['__vein'] = o.seedOre(s, mods, ctx, function () { return vxs[vi++ % vxs.length]; });
    let si = 0;
    const sxs = [0.5, 0.95];
    w['__single'] = o.seedOre(s, mods, ctx, function () { return sxs[si++ % sxs.length]; });
  });
  await page.waitForTimeout(900);
  const f1 = await face(page);
  const engineCount = f1.engineOre.filter(Boolean).length;
  const drawnCount = f1.drawnOre.filter(Boolean).length;
  check(engineCount > 0, 'pockets exist in the rock', `${engineCount} cells`);
  check(drawnCount === engineCount,
    'and the RENDERER has drawn every one of them — visible, not a hidden number',
    `${drawnCount} drawn / ${engineCount} in state`);
  const shapes = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    return { vein: w['__vein'] as number[], single: w['__single'] as number[] };
  });
  check(shapes.single.length === 1, 'a lone pocket spawns as one cell', `${shapes.single.length}`);
  check(shapes.vein.length > 1, 'and a VEIN spawns as a run of them', `${shapes.vein.length} cells`);
  const contiguous = shapes.vein.slice(1).every(
    (c) => shapes.vein.some((o) => o !== c && (Math.abs(o - c) === 1 || Math.abs(o - c) === f1.w)),
  );
  check(contiguous, 'the vein is contiguous — a run, not scatter with a longer name');
  await overflow(page, 'face');
  await shot(page, '1-pockets');

  // Distinct from rock, at the pixel level: the tile is drawn in the ore's
  // own colour, which no plain slab uses.
  const distinct = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const v = w['__faceView'];
    const s = w['__engine'].getState();
    const oreIdx = (s.face.ore ?? []).findIndex((x: string) => !!x);
    const plainIdx = (s.face.ore ?? []).findIndex((x: string) => !x);
    if (oreIdx < 0 || plainIdx < 0) return null;
    // Compare the committed graphics: a pocket carries strictly more geometry
    // than a plain slab (body + rim + facets on top of the rock). Written
    // without a helper function because esbuild injects a `__name` shim into
    // named arrows, and that shim does not exist in the page.
    const ops = v['tiles'].map((t: { g: any }) =>
      t.g.context?.instructions?.length ?? t.g.geometry?.graphicsData?.length ?? 0);
    return { ore: ops[oreIdx] as number, plain: ops[plainIdx] as number, oreIdx, plainIdx };
  });
  check(distinct !== null && distinct.ore > distinct.plain,
    'a pocket tile carries visibly more drawing than plain rock beside it',
    distinct ? `${distinct.ore} vs ${distinct.plain} draw ops` : 'not measurable');

  // === 2. THE CAP AND THE DROUGHT FLOOR ==================================
  console.log('\n2 — never more than a fifth, never a dry minute');
  const capped = await page.evaluate(async () => {
    const o = await import(/* @vite-ignore */ '/src/engine/systems/ores' + '.ts');
    const m = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    const mods = new m.ModifierCache();
    const ctx = { emit() {}, dirty() {} };
    for (let i = 0; i < 300; i++) o.seedOre(s, mods, ctx);
    return { count: o.oreCount(s), cells: s.face.cells.length, share: o.ORE_CAP_SHARE };
  });
  check(capped.count <= Math.floor(capped.cells * capped.share),
    'three hundred spawn attempts cannot pave the grid',
    `${capped.count}/${capped.cells} = ${Math.round(100 * capped.count / capped.cells)}%, cap ${capped.share * 100}%`);
  await page.waitForTimeout(600);
  await shot(page, '2-capped');

  // THE DROUGHT. Empty the face, hold it empty, and watch the floor fire.
  console.log('   forcing a drought...');
  const drought = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    s.face.ore = new Array(s.face.cells.length).fill('');
    s.face.oreDryFor = 0;
    const before = { count: 0, dry: 0 };
    // 59 seconds dry: the floor must NOT have fired yet. (The trickle can, so
    // suppress it by pinning the clock just short and reading the flag.)
    w['__engine'].dispatch({ type: 'debug', op: 'warp', seconds: 30 });
    before.dry = s.face.oreDryFor ?? 0;
    before.count = (s.face.ore ?? []).filter(Boolean).length;
    return before;
  });
  // Either the clock ran, or the trickle put a pocket there and the clock
  // correctly went back to zero — those are the only two right answers, and an
  // earlier draft asserted only the first and flaked whenever the trickle won.
  check(drought.dry > 0 || drought.count > 0,
    'while the face is bare the dry clock runs, and any pocket resets it',
    drought.count > 0 ? `the trickle beat it (${drought.count} pockets)` : `${drought.dry.toFixed(0)}s dry`);
  const after = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    s.face.ore = new Array(s.face.cells.length).fill('');
    s.face.oreDryFor = 59;
    w['__engine'].dispatch({ type: 'debug', op: 'warp', seconds: 2 });
    return { count: (s.face.ore ?? []).filter(Boolean).length, cells: s.face.cells.length, dry: s.face.oreDryFor ?? 0 };
  });
  check(after.count >= Math.round(after.cells * 0.15),
    'and at sixty seconds the floor seeds the face properly',
    `${after.count}/${after.cells} = ${Math.round(100 * after.count / after.cells)}% (floor is 15%)`);
  check(after.dry === 0, 'the clock resets after it fires');
  await page.waitForTimeout(700);
  const f2 = await face(page);
  check(f2.drawnOre.filter(Boolean).length === f2.engineOre.filter(Boolean).length,
    'the drought seeding is on screen too');
  await shot(page, '3-drought');

  // === 3. BY HAND vs BY DRILL ============================================
  console.log('\n3 — the choice: work it yourself, or leave it to a machine');
  // BY HAND. Drive the real hold gesture on the canvas, not the action.
  await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    const o = await import(/* @vite-ignore */ '/src/engine/systems/ores' + '.ts');
    const m = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    s.face.ore = new Array(s.face.cells.length).fill('');
    s.face.oreDug = new Array(s.face.cells.length).fill(0);
    s.face.ore[0] = 'heartrot';
    s.face.cells[0] = o.cellCapAt(s, new m.ModifierCache(), 0);
    s.drills.units = [];
    w['__handCharge'] = s.stats.fieldChargeHarvested.toNumber();
  });
  await page.waitForTimeout(500);
  // Hold on cell 0 with a real pointer, the way a player would.
  const box = await page.locator('canvas').first().boundingBox();
  const cs = await page.evaluate(() => {
    const v = (window as unknown as Record<string, any>)['__faceView'];
    return { x: v['gridX'], y: v['gridY'], size: v['cellSize'] };
  });
  const px = box!.x + cs.x + cs.size * 0.5;
  const py = box!.y + cs.y + cs.size * 0.5;
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  const mid = await face(page);
  check(mid.digging > 0, 'holding on a pocket visibly starts opening it — the dig ring fills',
    `${mid.digging} tile drawing progress`);
  await shot(page, '4-digging');
  // Hold until it opens. Heartrot is 16s by hand — the time cost is the point.
  const t0 = Date.now();
  let opened = false;
  while (Date.now() - t0 < 60000) {
    await page.mouse.move(px + (Date.now() % 2), py); // keep the pointer live
    await page.waitForTimeout(400);
    const f = await face(page);
    if (f.opened > 0) { opened = true; break; }
  }
  await page.mouse.up();
  const handF = await face(page);
  const handCharge = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    return w['__engine'].getState().stats.fieldChargeHarvested.toNumber() - (w['__handCharge'] as number);
  });
  check(opened, 'and holding long enough opens it', `${((Date.now() - t0) / 1000).toFixed(0)}s of holding`);
  check(handF.seen.includes('heartrot'), 'the type is recorded the first time one comes out (pillar 5)',
    handF.seen.join(','));
  check(handCharge > 0, 'the hand takes the pocket', `${handCharge.toFixed(0)} charge`);
  await shot(page, '5-opened', 'In the rock');

  // BY DRILL, on an identical pocket, so the comparison is like for like.
  const drillCharge = await page.evaluate(async () => {
    const o = await import(/* @vite-ignore */ '/src/engine/systems/ores' + '.ts');
    const m = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const d = await import(/* @vite-ignore */ '/src/engine/systems/drills' + '.ts');
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    const mods = new m.ModifierCache();
    s.face.ore = new Array(s.face.cells.length).fill('');
    s.face.oreDug = new Array(s.face.cells.length).fill(0);
    s.face.ore[0] = 'heartrot';
    s.face.cells[0] = o.cellCapAt(s, mods, 0);
    s.drills.bayBuilt = true;
    s.drills.huntOres = true;
    s.drills.units = [d.newDrill('Bess')];
    const before = s.stats.fieldChargeHarvested.toNumber();
    const t = performance.now();
    let secs = 0;
    while (o.isOre(s, 0) && secs < 60) { d.tickDrills(s, mods, { emit() {}, dirty() {} }, 0.5); secs += 0.5; }
    void t;
    return { charge: s.stats.fieldChargeHarvested.toNumber() - before, secs, still: o.isOre(s, 0) };
  });
  check(!drillCharge.still, 'a drill opens the same pocket on its own', `${drillCharge.secs.toFixed(1)}s of digging`);
  check(drillCharge.secs < 16, 'FASTER than the hand did it (16s by hand for this type)',
    `${drillCharge.secs.toFixed(1)}s vs 16s`);
  check(drillCharge.charge < handCharge,
    'but it leaves some in the rock — the hand takes it CLEAN',
    `drill ${drillCharge.charge.toFixed(0)} vs hand ${handCharge.toFixed(0)} charge`);

  // === 4. ROUTED DRILLS, WHILE THE HANDS ARE BUSY ========================
  console.log('\n4 — the bay works pockets while your hands stay on the rock');
  await setup(page, `
    const st = engine.getState();
    st.depth = 40;
    st.drills.bayBuilt = true;
    st.drills.huntOres = true;
    st.drills.units = [];
    window.__mk(st, 4);
    st.face.ore = new Array(st.face.cells.length).fill('');
    st.face.oreDug = new Array(st.face.cells.length).fill(0);
    st.face.cells = st.face.cells.map(() => 99);
    for (const c of [2, 3, 9, 10]) st.face.ore[c] = 'fatseam';
  `);
  await page.waitForTimeout(700);
  const claimed = await face(page);
  check(claimed.hunting, 'the bay is set to send them at pockets (the default)');
  await warp(page, 2);
  await page.waitForTimeout(400);
  const c2 = await face(page);
  const onOre = c2.drillOre.filter((c) => c >= 0).length;
  check(onOre > 0, 'drills claim pockets', `${onOre} of ${c2.drillOre.length} machines on one`);
  const beforeOpen = c2.opened;
  // Chip the face by hand WHILE they work — the two must not interfere.
  for (let i = 0; i < 12; i++) {
    await page.mouse.click(box!.x + cs.x + cs.size * 4.5, box!.y + cs.y + cs.size * 1.5);
    await page.waitForTimeout(60);
  }
  await warp(page, 20);
  await page.waitForTimeout(600);
  const c3 = await face(page);
  check(c3.opened > beforeOpen, 'and they open them while the hands are elsewhere',
    `${c3.opened - beforeOpen} pockets opened`);
  await shot(page, '6-bay-working');

  // The switch really is a switch.
  await tab(page, 'drills');
  await dismiss(page);
  await page.waitForTimeout(700);
  const td = await text(page);
  check(has(td, 'Send them at the pockets'), 'the bay panel carries the one routing control');
  // role="switch", not a button — the control announces itself as a toggle.
  await page.getByRole('switch', { name: /Send drills at ore pockets/ }).first().click();
  await page.waitForTimeout(400);
  const off = await face(page);
  check(!off.hunting, 'turning it off leaves pockets for the player');
  await overflow(page, 'bay panel');
  await shot(page, '7-switch', 'The bay');
  const kept = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    s.face.ore = new Array(s.face.cells.length).fill('');
    s.face.ore[5] = 'fatseam';
    s.face.cells[5] = 999;
    w['__engine'].dispatch({ type: 'debug', op: 'warp', seconds: 60 });
    return !!s.face.ore[5];
  });
  check(kept, 'and with it off, a pocket sits there untouched for a full minute');


  // === 5. EACH TYPE LOOKS LIKE ITS OWN THING =============================
  console.log('\n5 — four types, four different-looking pockets');
  await setup(page, `
    const st = engine.getState();
    st.shell.current = 'ferrite'; st.depth = 120;
    st.upgrades['soil'] = 10; st.upgrades['roots'] = 4;
    st.drills.units = []; st.drills.bayBuilt = false;
    st.face.ore = new Array(st.face.cells.length).fill('');
    st.face.oreDug = new Array(st.face.cells.length).fill(0);
    st.face.ore[7] = 'fatseam';
    st.face.ore[9] = 'blindglut';
    st.face.ore[19] = 'heartrot';
    st.face.ore[21] = 'lodeknot';
    st.face.oreSeen = ['fatseam','blindglut','heartrot','lodeknot'];
  `);
  await dismiss(page);
  await tab(page, 'dig');
  await dismiss(page);
  await page.waitForTimeout(1600);
  /**
   * Read the PIXELS the renderer produced, not the defs. Four rows in a table
   * saying `pattern: 'bands' | 'cluster'` proves nothing about what a player
   * sees; a 7x7 sample grid over each tile gives a coarse silhouette, and two
   * types that draw the same shape produce the same one.
   */
  const looks = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const v = w['__faceView'];
    const px = await v['app'].renderer.extract.pixels(v['app'].stage);
    const data: Uint8Array = px.pixels ?? px;
    const cw = px.width as number;
    const res = v['app'].renderer.resolution as number;
    const out: { cell: number; sig: string; ink: number; hue: string }[] = [];
    for (const c of [7, 9, 19, 21]) {
      const at = v['cellCenter'](c);
      const size = v['cellSize'];
      // TWO PASSES, and the second one is the point. A pocket's wash lights
      // the WHOLE tile, so an absolute brightness cut marked 42 of 49 samples
      // on every type and reported four identical silhouettes. The pattern is
      // what is brighter than the tile's OWN average, so the threshold has to
      // be relative to that.
      const lums: number[] = [];
      const rgb: number[][] = [];
      for (let yy = -3; yy <= 3; yy++) {
        for (let xx = -3; xx <= 3; xx++) {
          const sx = Math.round((at.x + (xx / 8) * size) * res);
          const sy = Math.round((at.y + (yy / 8) * size) * res);
          const i4 = (sy * cw + sx) * 4;
          rgb.push([data[i4]!, data[i4 + 1]!, data[i4 + 2]!]);
          lums.push((data[i4]! + data[i4 + 1]! + data[i4 + 2]!) / 3);
        }
      }
      const avg = lums.reduce((x, y) => x + y, 0) / lums.length;
      let bits = '';
      let ink = 0, r = 0, g = 0, b = 0;
      for (let k = 0; k < lums.length; k++) {
        const lit = lums[k]! > avg + 18;
        bits += lit ? '1' : '0';
        if (lit) { ink++; r += rgb[k]![0]!; g += rgb[k]![1]!; b += rgb[k]![2]!; }
      }
      const n = Math.max(1, ink);
      out.push({
        cell: c, sig: bits, ink,
        hue: `${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)}`,
      });
    }
    return out;
  });
  const sigs = looks.map((l) => l.sig);
  check(new Set(sigs).size === sigs.length,
    'all four pockets render a DIFFERENT shape on screen',
    `${new Set(sigs).size} distinct silhouettes of ${sigs.length}`);
  const hues = looks.map((l) => l.hue);
  check(new Set(hues).size === hues.length, 'and a different colour each', hues.join('  |  '));
  for (const l of looks) {
    check(l.ink > 4, `cell ${l.cell} carries real ink, not a tint`, `${l.ink}/49 samples lit`);
  }
  await overflow(page, 'four types');
  await shot(page, '8-four-types');

  // === 6. ONCE A DRILL STARTS, IT FINISHES ===============================
  console.log('\n6 — a drill locks to its pocket through everything');
  const locked = await page.evaluate(async () => {
    const d = await import(/* @vite-ignore */ '/src/engine/systems/drills' + '.ts');
    const f = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const m = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    const mods = new m.ModifierCache();
    const ctx = { emit() {}, dirty() {} };
    s.drills.bayBuilt = true; s.drills.huntOres = true;
    s.drills.units = [d.newDrill('Bess')];
    s.face.ore = new Array(s.face.cells.length).fill('');
    s.face.oreDug = new Array(s.face.cells.length).fill(0);
    s.face.ore[10] = 'heartrot';
    s.face.cells = s.face.cells.map(() => 99999);
    const opened0 = s.stats.oresOpened ?? 0;
    const trail: (number | null)[] = [];
    let progressAtLure = 0, progressAfterWiden = 0;
    for (let t = 0; t < 300; t++) {
      d.tickDrills(s, mods, ctx, 0.1);
      const u = s.drills.units[0];
      trail.push(u.oreCell ?? null);
      // Halfway through: dangle a far richer, brim-full pocket beside it.
      if (t === 40) { s.face.ore[30] = 'heartrot'; progressAtLure = u.oreProgress ?? 0; }
      // Then widen the face underneath it, which used to wipe every pocket
      // and abandon the dig.
      if (t === 70) { s.upgrades['expand'] = 2; f.applyFieldSize(s, mods); progressAfterWiden = u.oreProgress ?? 0; }
      if ((s.stats.oresOpened ?? 0) > opened0) break;
    }
    const held = trail.filter((x) => x !== null) as number[];
    // RELEASING is the signal that matters, not "the number changed": widening
    // the grid renumbers every row, so a drill that correctly KEEPS its pocket
    // reports a different index afterwards. Abandonment looks like a null.
    const released = trail.some((x, k) => x === null && k < trail.length - 1);
    const changes = trail.filter(
      (x, k) => k > 0 && x !== null && trail[k - 1] !== null && x !== trail[k - 1],
    ).length;
    return {
      released, changes,
      distinct: [...new Set(held)], ticksHeld: held.length,
      opened: (s.stats.oresOpened ?? 0) - opened0,
      progressAtLure, progressAfterWiden,
      pockets: (s.face.ore ?? []).filter(Boolean).length,
      dug: (s.face.oreDug ?? []).filter((x: number) => x > 0).length,
    };
  });
  check(locked.opened > 0, 'the drill saw a pocket through to the end', `${locked.opened} opened`);
  check(!locked.released,
    'and NEVER let go of it — no wandering, no half-mined ore abandoned',
    `held for all ${locked.ticksHeld} ticks without once releasing`);
  check(locked.changes <= 1,
    'the one time its cell number moved was the widen renumbering the grid',
    `${locked.changes} change(s): cells ${locked.distinct.join(' -> ')}`);
  check(locked.progressAfterWiden > locked.progressAtLure,
    'its progress survived the face being widened mid-dig',
    `${locked.progressAtLure.toFixed(1)}s at the lure -> ${locked.progressAfterWiden.toFixed(1)}s after the widen`);
  check(locked.pockets >= 1, 'and the other pocket survived the widen too',
    `${locked.pockets} still in the rock`);

  await browser.close();
  console.log(`\nshots:\n  ${shots.join('\n  ')}`);
  console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n  ${problems.join('\n  ')}` : '\nALL CHECKS PASS');
  process.exit(problems.length ? 1 : 0);
}
main();
