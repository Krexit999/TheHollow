/**
 * A.49 — THE RELIQUARY AND THE GALLERY, verified on the real canvas.
 *
 * A canvas cannot be probed by reading text, which is exactly why the previous
 * two attempts at these screens were reported "built" on the strength of a
 * green test run. So every check here does one of two things: it reads PIXELS
 * out of the live renderer, or it drives the real controls and reads the
 * engine back. Nothing is asserted from a component's props.
 *
 * Six checks, all at 380px:
 *   1  a relic rendered in a niche, visibly changing dormant → stirring → awake
 *   2  a resonance line drawn between two mounted relics
 *   3  fusion at a CHEAP shard cost, repeated, the keeper visibly marked
 *   4  the gallery hall scrolling in BOTH axes with owned relics on plinths
 *   5  a hidden set firing — plinths light, a name is carved in
 *   6  auto-scrap converting an unwanted relic  (+ the standing reach check)
 *
 *   npx tsx scripts/verify-a49.ts [port] [outDir]
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
  await page.screenshot({ path: `${OUT}/a49-${name}.png` });
  shots.push(`${OUT}/a49-${name}.png`);
}

async function guard(page: Page, name: string): Promise<void> {
  page.on('pageerror', (e) => problems.push(`[${name}] [pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[${name}] [console] ${m.text().slice(0, 200)}`);
  });
}

async function overflow(page: Page, name: string): Promise<void> {
  const px = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(px === 0, `${name}: no horizontal overflow at ${W}px`, `${px}px`);
}

/**
 * READ THE CANVAS.
 *
 * Pixi's context has no `preserveDrawingBuffer`, so `toDataURL` on the live
 * canvas is blank by the time we ask; the renderer's own `extract` is the
 * supported route. TWO TRAPS, both of which the first pass fell into:
 *
 *  - `extract.image()` returns an HTMLImageElement decoded from a data URL,
 *    which may not have decoded when `drawImage` runs. `extract.canvas()` is
 *    synchronous and needs no decode.
 *  - Extracting the STAGE frames to the stage's BOUNDS, and the collection
 *    strip hangs below the viewport, so every sample was scaled and offset by
 *    an amount that had nothing to do with the screen. Passing an explicit
 *    `frame` of exactly the screen is what makes canvas pixels comparable to
 *    the renderer's own hit coordinates.
 */
async function pixels(page: Page, box: { x: number; y: number; w: number; h: number }): Promise<{
  lum: number; warm: number; max: number; nonBlack: number;
}> {
  return page.evaluate((b) => {
    const w = window as unknown as Record<string, any>;
    const view = w['__reliquary'];
    const app = view?.['app'];
    if (!app) throw new Error('__reliquary missing — DEV build?');
    // The view owns the extract (it has Pixi's Rectangle; a bare specifier is
    // not resolvable from an evaluate) and frames it to the SCREEN.
    const out = view.snapshotCanvas();
    const c2 = out.getContext('2d')!;
    const sx = out.width / app.screen.width;
    const d = c2.getImageData(
      Math.round(b.x * sx), Math.round(b.y * sx),
      Math.max(1, Math.round(b.w * sx)), Math.max(1, Math.round(b.h * sx)),
    ).data;
    let lum = 0, warm = 0, max = 0, nonBlack = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i]!, g = d[i + 1]!, bl = d[i + 2]!;
      const l = (r * 0.299 + g * 0.587 + bl * 0.114) / 255;
      lum += l;
      warm += (r - bl) / 255;
      if (l > max) max = l;
      if (l > 0.06) nonBlack++;
    }
    const n = d.length / 4;
    return { lum: lum / n, warm: warm / n, max, nonBlack: nonBlack / n };
  }, box);
}

/** Where a niche's centre sits on screen, straight out of the renderer. */
async function nicheBox(page: Page, slot: number): Promise<{ x: number; y: number; w: number; h: number }> {
  return page.evaluate((s) => {
    const view = (window as unknown as Record<string, any>)['__reliquary'];
    const hit = view['hits'].find((h: any) => h.hit.kind === 'niche' && h.hit.slot === s);
    if (!hit) throw new Error(`no niche ${s}`);
    return { x: hit.x - hit.r * 0.5, y: hit.y - hit.r * 0.5, w: hit.r, h: hit.r };
  }, slot);
}

/**
 * Tap a point in CANVAS coordinates.
 *
 * The origin is re-read every single time, and that is the whole point: the
 * hint line above the canvas reflows as the collection changes, so the canvas
 * slides a few pixels down the page mid-run. Caching the origin once made
 * every tap after the first land on the scroll container instead — which read
 * as 'the second tap does nothing' and sent an hour into the renderer looking
 * for a Pixi event bug that was not there.
 */
async function tapCanvas(page: Page, x: number, y: number): Promise<void> {
  await dismiss(page); // the disclosure gate batches, and can land mid-run
  const box = await page.locator('canvas').last().boundingBox();
  if (!box) throw new Error('no reliquary canvas');
  await page.mouse.click(box.x + x, box.y + y);
}

/** Canvas page-origin, for drags that need several moves at once. */
async function origin(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas').last().boundingBox();
  if (!box) throw new Error('no reliquary canvas');
  return { x: box.x, y: box.y };
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  // === 1 + 2 + 3 + 6: the workshop ========================================
  {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await guard(page, 'workshop');
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.evaluate(async () => {
      const relics = await import(/* @vite-ignore */ '/src/engine/systems/relics' + '.ts');
      const dec = await import(/* @vite-ignore */ '/src/engine/decimal' + '.ts');
      const w = window as unknown as Record<string, unknown>;
      w['__D'] = dec.D;
      w['__relics'] = relics;
      w['__mk'] = (s: never, o: Record<string, unknown>) => relics.addRelic(s, {
        uid: 0, defId: 'x', rarity: 3, affixes: { regen: 0.08 }, source: 'depth', fusedFrom: 0,
        found: { depth: 428, shell: 'loam', run: 6, playSec: 900, by: 'The Badger' }, ...o,
      });
    });
    // Two from the deep shaft (they will resonate), one from elsewhere, plus
    // spares to feed the bench. The first is a hair short of Stirring.
    await setup(page, `
      const st = engine.getState();
      st.depth = 300; st.maxDepthRecord = 428; st.collapse.count = 6;
      st.relics.shards = 300;
      st.currencies['core'] = window.__D(40);
      const a = window.__mk(st, { source: 'depth', waking: 0, charge: 1780 });
      const b = window.__mk(st, { source: 'depth', waking: 2, charge: 9000 });
      const c = window.__mk(st, { source: 'warren', waking: 1, charge: 2200 });
      st.relics.equipped = [a.uid, b.uid, c.uid];
      for (let i = 0; i < 5; i++) window.__mk(st, { rarity: 1, source: 'well' });
    `);
    await dismiss(page);
    await tab(page, 'relics');
    await dismiss(page);
    await page.waitForTimeout(1200);
    await dismiss(page);

    console.log('\nCHECK 1 — a relic in a niche, changing dormant → stirring');
    const t0 = await text(page);
    check(has(t0, 'The Reliquary'), 'the reliquary surface is up, not a list of cards');
    check(!has(t0, 'Fabled relic') && !has(t0, 'Found at depth'), 'no stat-card spreadsheet on screen');

    const box0 = await nicheBox(page, 0);
    const before = await pixels(page, box0);
    check(before.nonBlack > 0.1, 'niche 1 has an object rendered in it',
      `${Math.round(before.nonBlack * 100)}% of the niche is lit`);
    await shot(page, '1-dormant');

    // Let it cross on its own — real ticks, no state poking.
    await page.waitForTimeout(24000);
    const after = await pixels(page, box0);
    const woke = await page.evaluate(() => {
      const s = (window as unknown as Record<string, any>)['__engine'].getState();
      return s.relics.held[0]?.waking ?? 0;
    });
    check(woke >= 1, 'it woke to Stirring on carry time alone', `waking ${woke}`);
    check(after.max > before.max + 0.02 || after.lum > before.lum * 1.08,
      'and the RENDERED object is visibly brighter for it',
      `max ${before.max.toFixed(3)} → ${after.max.toFixed(3)}, lum ${before.lum.toFixed(4)} → ${after.lum.toFixed(4)}`);
    await shot(page, '1-stirring');

    // The awake one, in its own niche, is brighter still than the dormant one was.
    const box1 = await nicheBox(page, 1);
    const awake = await pixels(page, box1);
    check(awake.max > before.max, 'an AWAKE relic is lit from within more than a dormant one',
      `${before.max.toFixed(3)} vs ${awake.max.toFixed(3)}`);

    console.log('\nCHECK 2 — a resonance line drawn between two mounted relics');
    const live = await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      return w['__relics'].activeResonances(w['__engine'].getState()).map((r: any) => r.id);
    });
    check(live.length > 0, 'the engine says a resonance is firing', live.join(','));
    // ON the segment vs OFF it, in the SAME frame. The first pass diffed
    // before/after unequipping and read identical numbers to four decimals,
    // which is the tell for a probe that is not measuring what it thinks.
    const seg = await page.evaluate(() => {
      const v = (window as unknown as Record<string, any>)['__reliquary'];
      const a = v['hits'].find((h: any) => h.hit.kind === 'niche' && h.hit.slot === 0);
      const b = v['hits'].find((h: any) => h.hit.kind === 'niche' && h.hit.slot === 1);
      return { ax: a.x, ay: a.y, bx: b.x, by: b.y };
    });
    const onLine = await pixels(page, { x: (seg.ax + seg.bx) / 2 - 8, y: (seg.ay + seg.by) / 2 - 8, w: 16, h: 16 });
    const offLine = await pixels(page, { x: (seg.ax + seg.bx) / 2 - 8, y: (seg.ay + seg.by) / 2 + 40, w: 16, h: 16 });
    check(onLine.max > offLine.max * 1.3, 'the line is DRAWN between the two niches',
      `on ${onLine.max.toFixed(3)} vs off ${offLine.max.toFixed(3)}`);
    // ...and it is the PAIR that draws it: break the set, the line goes.
    await page.evaluate(() => {
      (window as unknown as Record<string, any>)['__engine'].dispatch({ type: 'unequipRelic', slot: 1 });
    });
    await page.waitForTimeout(900);
    const broken = await pixels(page, { x: (seg.ax + seg.bx) / 2 - 8, y: (seg.ay + seg.by) / 2 - 8, w: 16, h: 16 });
    check(broken.max < onLine.max * 0.8, 'and it goes out when the pair is broken',
      `${onLine.max.toFixed(3)} → ${broken.max.toFixed(3)}`);
    await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      const s = w['__engine'].getState();
      const spare = s.relics.held.find((r: any) => r.source === 'depth' && !s.relics.equipped.includes(r.uid));
      if (spare) w['__engine'].dispatch({ type: 'equipRelic', uid: spare.uid, slot: 1 });
    });
    await page.waitForTimeout(900);
    await shot(page, '2-resonance');

    console.log('\nCHECK 3 — fusion is cheap, repeatable, and marks the keeper');
    const prices: number[] = [];
    let marks = 0;
    for (let i = 0; i < 3; i++) {
      // Tap a spare in the collection strip, then Fuse into this → first feed.
      const spot = await page.evaluate(() => {
        const v = (window as unknown as Record<string, any>)['__reliquary'];
        const h = v['hits'].find((x: any) => x.hit.kind === 'held');
        return h ? { x: h.x, y: h.y, uid: h.hit.uid } : null;
      });
      if (!spot) break;
      await tapCanvas(page, spot.x, spot.y);
      await page.waitForTimeout(350);
      const fuseBtn = page.getByRole('button', { name: /Fuse into this/ }).first();
      if ((await fuseBtn.count()) === 0) break;
      await fuseBtn.click();
      await page.waitForTimeout(300);
      // Read the SHEET, not the body. The HUD prints the shard BALANCE in the
      // same words, and the first pass cheerfully reported 300 → 276 → 248 as
      // "the fusion price" — an instrument that cannot tell a balance from a
      // price gives confident wrong answers.
      const sheetText = (await page.locator('div.rounded-t-xl').last().innerText()).replace(/\s+/g, ' ');
      const m = sheetText.match(/(\d+) shards/);
      if (m) prices.push(Number(m[1]));
      if (i === 0) check(!/\d+ Cores/.test(sheetText), 'Cores are not the base cost — the sheet asks for shards alone');
      const feed = page.getByRole('button', { name: /· (a Magma Well|a Warren|the deep shaft)/ }).first();
      if ((await feed.count()) === 0 || (await feed.isDisabled().catch(() => true))) break;
      await feed.click();
      await page.waitForTimeout(500);
      marks = await page.evaluate((uid) => {
        const s = (window as unknown as Record<string, any>)['__engine'].getState();
        return (s.relics.held.find((r: any) => r.uid === uid)?.ate ?? []).length;
      }, spot.uid);
      await page.keyboard.press('Escape').catch(() => {});
      await tapCanvas(page, 8, 8);
      await page.waitForTimeout(300);
    }
    console.log(`    prices seen: ${prices.join(' → ')} shards`);
    check(prices.length >= 2, 'the sheet states a shard price each time', `${prices.length} fusions`);
    check(prices.every((p) => p <= 40), 'the price is CHEAP — a few rendered spares, not a wall',
      `max ${Math.max(...prices)} shards`);
    check(marks >= 2, 'the keeper carries a mark for each thing it ate', `${marks} notches`);
    await shot(page, '3-fused');

    console.log('\nCHECK 6 — the standing order converts an unwanted find');
    const scrap = page.getByRole('button', { name: /Standing order/ }).first();
    await scrap.click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /Standing order is off/ }).first().click();
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: /^Uncommon$/ }).first().click();
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: /Always keep one that has a power/ }).first().click();
    await page.waitForTimeout(250);
    await shot(page, '6-standing-order');
    const scrapped = await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      const s = w['__engine'].getState();
      const held = s.relics.held.length;
      const shards = s.relics.shards;
      w['__relics'].addRelic(s, {
        uid: 0, defId: 'x', rarity: 0, affixes: { regen: 0.02 }, source: 'well', fusedFrom: 0,
      });
      const s2 = w['__engine'].getState();
      return { on: s2.relics.autoScrap.on, held, held2: s2.relics.held.length, shards, shards2: s2.relics.shards };
    });
    check(scrapped.on === true, 'the standing order is ON after driving the sheet');
    check(scrapped.held2 === scrapped.held, 'an unwanted find never reaches the hold',
      `${scrapped.held} → ${scrapped.held2}`);
    check(scrapped.shards2 > scrapped.shards, 'and arrives as shards instead',
      `${Math.floor(scrapped.shards)} → ${Math.floor(scrapped.shards2)}`);

    await overflow(page, 'workshop');
    await page.close();
  }

  // === 4 + 5: the gallery =================================================
  {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await guard(page, 'gallery');
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.evaluate(async () => {
      const relics = await import(/* @vite-ignore */ '/src/engine/systems/relics' + '.ts');
      const museum = await import(/* @vite-ignore */ '/src/engine/systems/museum' + '.ts');
      const dec = await import(/* @vite-ignore */ '/src/engine/decimal' + '.ts');
      const w = window as unknown as Record<string, unknown>;
      w['__D'] = dec.D; w['__relics'] = relics; w['__museum'] = museum;
      w['__mk'] = (s: never, o: Record<string, unknown>) => relics.addRelic(s, {
        uid: 0, defId: 'x', rarity: 2, affixes: { regen: 0.08 }, source: 'depth', fusedFrom: 0,
        found: { depth: 428, shell: 'loam', run: 6, playSec: 900, by: 'The Badger' }, ...o,
      });
    });
    // Enough to fill several rows, and DELIBERATELY one short of The Last Shift.
    await setup(page, `
      const st = engine.getState();
      st.depth = 428; st.maxDepthRecord = 428; st.collapse.count = 6;
      for (let i = 0; i < 3; i++) window.__mk(st, { found: { depth: 150, shell: 'loam', run: 11, playSec: 9, by: 'Nib' } });
      // Depths 110-162 and runs 100+ so that NOTHING is standing before the
      // check: the first pass put the trio at depth 300, which put the probe
      // plinth inside Out of the Deep already, and the lighting diff measured
      // a plinth that was lit both times.
      // Runs 100+ so nothing here collides with the run-11 trio above — the
      // first pass reused run 11 and the set was standing before the 'nothing
      // names it yet' check ran.
      for (let i = 0; i < 14; i++) window.__mk(st, { rarity: i % 3, source: ['depth','well','anomaly'][i % 3],
        found: { depth: 110 + i * 4, shell: 'loam', run: 100 + i, playSec: 9, by: 'Hand ' + i } });
    `);
    await dismiss(page);
    await tab(page, 'museum');
    await dismiss(page);
    await page.waitForTimeout(1500);
    await dismiss(page);

    console.log('\nCHECK 4 — the hall, scrolled in both axes');
    const t0 = await text(page);
    check(has(t0, 'The Gallery'), 'the gallery surface is up');
    check(has(t0, 'on the plinths'), 'it counts what is standing in the room');
    check(has(t0, 'Dovekin'), 'the curator says something about what came in');
    check(!has(t0, 'Give the case a relic') && !has(t0, 'empty empty'),
      'the donate button and the empty-slot grid are gone');
    await shot(page, '4-hall');

    const cam0 = await page.evaluate(() => {
      const v = (window as unknown as Record<string, any>)['__reliquary'];
      return { x: v['camX'], y: v['camY'], w: v['worldW'], h: v['worldH'] };
    });
    check(cam0.h > H * 0.8, 'the hall is longer than the window — there is somewhere to walk',
      `world ${Math.round(cam0.w)}x${Math.round(cam0.h)}`);
    // A real drag upward: walk down the hall. Re-read the origin first — see
    // tapCanvas above for why a cached one is a trap.
    const o = await origin(page);
    await page.mouse.move(o.x + 200, o.y + 320);
    await page.mouse.down();
    await page.mouse.move(o.x + 200, o.y + 120, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const cam1 = await page.evaluate(() => {
      const v = (window as unknown as Record<string, any>)['__reliquary'];
      return { x: v['camX'], y: v['camY'] };
    });
    check(cam1.y > cam0.y, 'dragging walks the camera DOWN the hall', `y ${Math.round(cam0.y)} → ${Math.round(cam1.y)}`);
    // ...and sideways, on a viewport narrow enough for the hall to overflow it.
    await page.mouse.move(o.x + 280, o.y + 300);
    await page.mouse.down();
    await page.mouse.move(o.x + 60, o.y + 300, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const cam2 = await page.evaluate(() => (window as unknown as Record<string, any>)['__reliquary']['camX']);
    const canPanX = cam0.w > W + 1;
    check(!canPanX || cam2 > cam1.x, 'and ACROSS it', canPanX ? `x ${Math.round(cam1.x)} → ${Math.round(cam2)}` : 'hall fits the width here');
    await shot(page, '4-walked');

    console.log('\nCHECK 5 — a hidden set fires from what you own');
    check(!has(await text(page), 'The Last Shift'), 'BEFORE: nothing names the set (pillar 5)');
    const beforePlinth = await page.evaluate(() => {
      const v = (window as unknown as Record<string, any>)['__reliquary'];
      v['camX'] = 0; v['camY'] = 0;
      const h = v['hits'][0];
      return { x: h.x, y: h.y };
    });
    await page.waitForTimeout(500);
    const probe = { x: beforePlinth.x - 34, y: beforePlinth.y - 20, w: 68, h: 80 };
    const dark = await pixels(page, probe);

    // The fourth from run 11 — the thing that makes it a set.
    await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      const s = w['__engine'].getState();
      w['__relics'].addRelic(s, {
        uid: 0, defId: 'x', rarity: 2, affixes: { regen: 0.08 }, source: 'depth', fusedFrom: 0,
        found: { depth: 300, shell: 'loam', run: 11, playSec: 9, by: 'Nib' },
      });
    });
    await page.waitForTimeout(2200);
    const t1 = await text(page);
    check(has(t1, 'The Last Shift'), 'AFTER: the room carves a name over those plinths');
    const litPx = await pixels(page, probe);
    check(litPx.lum > dark.lum * 1.05 || litPx.warm > dark.warm + 0.005,
      'and the plinths themselves come up lit',
      `lum ${dark.lum.toFixed(4)} → ${litPx.lum.toFixed(4)}, warm ${dark.warm.toFixed(4)} → ${litPx.warm.toFixed(4)}`);
    const setFx = await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      const s = w['__engine'].getState();
      return {
        live: w['__museum'].activeExhibits(s).map((a: any) => a.def.id),
        found: s.museum.exhibitsFound,
        pay: w['__museum'].exhibitBonus(s, 'dropRate'),
      };
    });
    check(setFx.live.includes('lastShift') && setFx.pay > 0, 'the set actually pays',
      `${setFx.live.join(',')} · +${Math.round(setFx.pay * 100)}% find rate`);
    check(setFx.found.includes('lastShift'), 'and the Codex records it once it has happened');
    await shot(page, '5-set-lit');

    await overflow(page, 'gallery');
    await page.close();
  }

  // === REACH — past the shell the relics came from ========================
  {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await guard(page, 'reach');
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.evaluate(async () => {
      const relics = await import(/* @vite-ignore */ '/src/engine/systems/relics' + '.ts');
      const dec = await import(/* @vite-ignore */ '/src/engine/decimal' + '.ts');
      const w = window as unknown as Record<string, unknown>;
      w['__D'] = dec.D; w['__relics'] = relics;
      w['__mk'] = (s: never, o: Record<string, unknown>) => relics.addRelic(s, {
        uid: 0, defId: 'x', rarity: 2, affixes: { regen: 0.08 }, source: 'depth', fusedFrom: 0,
        found: { depth: 428, shell: 'loam', run: 6, playSec: 900, by: 'The Badger' }, ...o,
      });
    });
    // Breached past Loam, standing in Ferrite, with an empty purse.
    await setup(page, `
      const st = engine.getState();
      st.shell.current = 'ferrite'; st.shell.breachCount = 1;
      st.depthRecords['loam'] = 480;
      st.depth = 120; st.maxDepthRecord = 120; st.collapse.count = 3;
      st.currencies['dust'] = window.__D(0);
      st.currencies['scrip'] = window.__D(0);
      st.currencies['core'] = window.__D(0);
      st.relics.shards = 0;
      for (let i = 0; i < 8; i++) window.__mk(st, { rarity: 1, source: 'depth' });
    `);
    await dismiss(page);
    await tab(page, 'relics');
    await dismiss(page);
    await page.waitForTimeout(1200);
    await dismiss(page);

    console.log('\nREACH — past the shell the relics came from');
    // Everything the player has here is relics. Render two down by hand and fuse.
    const state0 = await page.evaluate(() => {
      const s = (window as unknown as Record<string, any>)['__engine'].getState();
      return { shell: s.shell.current, held: s.relics.held.length, shards: s.relics.shards };
    });
    check(state0.shell === 'ferrite', 'standing in a later shell', state0.shell);
    check(state0.shards === 0, 'and starting with nothing in the purse');

    // An Uncommon renders for 4 shards against a 12-shard fusion, so the pile
    // IS the supply and the driver has to use it like one. Each pass reports
    // whether it landed: a loop that silently no-ops is how the first run
    // "earned 4 shards" from five attempts and looked like an engine bug.
    let rendered = 0;
    for (let i = 0; i < 6; i++) {
      const spot = await page.evaluate(() => {
        const v = (window as unknown as Record<string, any>)['__reliquary'];
        const h = v['hits'].find((x: any) => x.hit.kind === 'held');
        return h ? { x: h.x, y: h.y } : null;
      });
      if (!spot) break;
      await tapCanvas(page, spot.x, spot.y);
      await page.waitForTimeout(400);
      const render = page.getByRole('button', { name: /Render down/ }).first();
      if ((await render.count()) === 0) { await tapCanvas(page, 6, 6); await page.waitForTimeout(300); continue; }
      await render.click();
      rendered += 1;
      await page.waitForTimeout(500);
    }
    console.log(`    rendered ${rendered} spare relics by hand`);
    const earned = await page.evaluate(() =>
      (window as unknown as Record<string, any>)['__engine'].getState().relics.shards);
    check(earned > 0, 'SHARDS are earnable here — the pile is the input', `${Math.floor(earned)} shards`);

    let fused = false;
    const keep = await page.evaluate(() => {
      const v = (window as unknown as Record<string, any>)['__reliquary'];
      const h = v['hits'].find((x: any) => x.hit.kind === 'held');
      return h ? { x: h.x, y: h.y } : null;
    });
    if (keep) {
      await tapCanvas(page, keep.x, keep.y);
      await page.waitForTimeout(300);
      const fuseBtn = page.getByRole('button', { name: /Fuse into this/ }).first();
      if ((await fuseBtn.count()) > 0) {
        await fuseBtn.click();
        await page.waitForTimeout(300);
        const held0 = await page.evaluate(() =>
          (window as unknown as Record<string, any>)['__engine'].getState().relics.held.length);
        const feed = page.getByRole('button', { name: /· the deep shaft/ }).first();
        if ((await feed.count()) > 0 && !(await feed.isDisabled().catch(() => true))) {
          await feed.click();
          await page.waitForTimeout(500);
          const held1 = await page.evaluate(() =>
            (window as unknown as Record<string, any>)['__engine'].getState().relics.held.length);
          fused = held1 < held0;
        }
      }
    }
    check(fused, 'FUSION works in a later shell with NO Cores and no shell currency');
    await shot(page, 'reach-workshop');

    await tab(page, 'museum');
    await dismiss(page);
    await page.waitForTimeout(1200);
    const galleryLive = await page.evaluate(() => {
      const v = (window as unknown as Record<string, any>)['__reliquary'];
      const s = (window as unknown as Record<string, any>)['__engine'].getState();
      return { hits: v['hits'].length, held: s.relics.held.length, mode: v['mode'] };
    });
    check(galleryLive.mode === 'museum' && galleryLive.hits === galleryLive.held,
      'THE GALLERY shows the same collection in a later shell — never dead-live',
      `${galleryLive.hits} plinths for ${galleryLive.held} relics`);
    await shot(page, 'reach-gallery');
    await overflow(page, 'reach');
    await page.close();
  }

  // === PERF + REDUCED MOTION ==============================================
  // The brief's third rule. A rendered place that hitches on a full hold, or
  // that keeps breathing at someone who asked it not to, is not shipped.
  {
    const page = await browser.newPage({
      viewport: { width: W, height: H },
      reducedMotion: 'reduce',
    });
    await guard(page, 'perf');
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.evaluate(async () => {
      const relics = await import(/* @vite-ignore */ '/src/engine/systems/relics' + '.ts');
      const w = window as unknown as Record<string, unknown>;
      w['__mk'] = (s: never, o: Record<string, unknown>) => relics.addRelic(s, {
        uid: 0, defId: 'x', rarity: 2, affixes: { regen: 0.08 }, source: 'depth', fusedFrom: 0,
        found: { depth: 300, shell: 'loam', run: 3, playSec: 9, by: 'Nib' }, ...o,
      });
    });
    // A FULL hold, every relic distinct, half of them awake and haloed.
    await setup(page, `
      const st = engine.getState();
      st.depth = 428; st.maxDepthRecord = 428;
      for (let i = 0; i < 64; i++) window.__mk(st, {
        rarity: i % 5, source: ['depth','warren','anomaly','well','expedition','warden'][i % 6],
        waking: i % 2 === 0 ? 2 : 0, charge: 9000, ate: i % 3 === 0 ? ['warren','well'] : undefined,
        found: { depth: 100 + i * 5, shell: 'loam', run: i % 7, playSec: 9, by: 'Hand ' + (i % 4) },
      });
    `);
    await dismiss(page);
    await tab(page, 'museum');
    await dismiss(page);
    await page.waitForTimeout(2500);

    console.log('\nPERF + REDUCED MOTION');
    const still = await page.evaluate(() => {
      const v = (window as unknown as Record<string, any>)['__reliquary'];
      return { reduced: v['reducedMotion'], pulse: v['pulse'] };
    });
    check(still.reduced === true, 'the view honours prefers-reduced-motion');
    check(still.pulse === 0, 'and nothing breathes — the pulse never advances', `pulse ${still.pulse}`);

    // NOTE: no NAMED function may be declared inside an evaluate — tsx compiles
    // this file with esbuild's keepNames on, which wraps every named function
    // in a `__name(...)` helper that does not exist in the page.
    const perf = await page.evaluate(async () => {
      const v = (window as unknown as Record<string, any>)['__reliquary'];
      const times: number[] = [];
      let last = performance.now();
      for (let i = 0; i < 150; i++) {
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        const now = performance.now();
        times.push(now - last);
        last = now;
      }
      times.sort((a, b) => a - b);
      return {
        frames: times.length,
        p50: times[Math.floor(times.length * 0.5)] ?? 0,
        p95: times[Math.floor(times.length * 0.95)] ?? 0,
        baked: v.bakedCount(),
        held: (window as unknown as Record<string, any>)['__engine'].getState().relics.held.length,
      };
    });
    console.log(`    ${perf.held} relics · ${perf.frames} frames · p50 ${perf.p50.toFixed(1)}ms · p95 ${perf.p95.toFixed(1)}ms · ${perf.baked} baked textures`);
    check(perf.p95 < 34, 'a full hold holds 30fps at the 95th percentile', `p95 ${perf.p95.toFixed(1)}ms`);
    check(perf.baked <= 96, 'the bake cache stays inside its LRU cap', `${perf.baked} textures`);

    // MOUNT-AND-HIDE: leaving the tab must PAUSE the renderer, never destroy it.
    await tab(page, 'dig');
    await page.waitForTimeout(700);
    const asleep = await page.evaluate(() => {
      const v = (window as unknown as Record<string, any>)['__reliquary'];
      return { alive: !!v['app']?.renderer, started: v['app'].ticker.started, active: v['active'] };
    });
    check(asleep.alive && !asleep.started, 'leaving the tab stops the ticker and keeps the renderer',
      `alive ${asleep.alive}, ticking ${asleep.started}`);
    await tab(page, 'relics');
    await page.waitForTimeout(700);
    const awake = await page.evaluate(() => {
      const v = (window as unknown as Record<string, any>)['__reliquary'];
      return { alive: !!v['app']?.renderer, started: v['app'].ticker.started, hits: v['hits'].length };
    });
    check(awake.alive && awake.started && awake.hits > 0, 'and coming back wakes the same one',
      `${awake.hits} hit targets`);
    await shot(page, '7-reduced-motion');
    await page.close();
  }

  console.log(`\nshots:\n  ${shots.join('\n  ')}`);
  console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n  ${problems.join('\n  ')}` : '\nALL CHECKS PASS');
  await browser.close();
  process.exit(problems.length ? 1 : 0);
}
main();
