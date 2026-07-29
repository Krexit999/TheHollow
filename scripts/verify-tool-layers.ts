/**
 * LAYERING AND BALANCE, DRIVEN IN THE REAL GAME.
 *
 *  1  A LAYERED PART POURS from more than one stone, and its blended traits are
 *     the union of what went in — read off the real part, through the real verb.
 *  2  A HEAVY BUILD READS HEAVY on the tool (slow, big) and a LIGHT one reads
 *     light (fast, small), both from stone alone.
 *  3  THE WIND-UP IS REAL: a heavy tool refuses a second swing and a light one
 *     never does.
 *  4  380px, 0 overflow.
 *
 *   npx tsx scripts/verify-tool-layers.ts [port] [outDir]
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
  await page.screenshot({ path: `${OUT}/lay-${name}.png` });
  shots.push(`${OUT}/lay-${name}.png`);
}
const txt = async (page: Page, sel: string): Promise<string> =>
  (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

const HEAVY = 'graveclay';
const LIGHT = 'hollowamber';

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
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const s = w['__engine'].getState();
    for (const id of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      s.depthRecords[id] = 60;
    }
    for (const shell of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      for (const m of mats.materialsOfShell(shell)) forge.addMaterial(s, m.id, 60, 500);
    }
    s.casting.tool = [];
    s.casting.rack = [];
    s.casting.mods = [];
    s.casting.windup = 0;
  });
  await page.waitForTimeout(300);
  await tab(page, 'casting');
  await dismiss(page);

  // ═══ 1. A LAYERED POUR ══════════════════════════════════════════════════
  console.log('\n1 — one part, more than one stone');

  // Queue two stones so the layer picker is even offered.
  const queued = await page.evaluate(async ({ a, b }) => {
    const w = window as unknown as Record<string, any>;
    const engine = w['__engine'];
    engine.dispatch({ type: 'chargeCrucible', materialId: a, units: 5 });
    engine.dispatch({ type: 'chargeCrucible', materialId: b, units: 5 });
    const s = engine.getState();
    for (const q of s.casting.crucible.queue) { q.molten += q.solid; q.solid = 0; }
    return s.casting.crucible.queue.map((q: any) => `${q.materialId}:${Math.floor(q.molten)}`);
  }, { a: HEAVY, b: LIGHT });
  await page.waitForTimeout(400);
  check(queued.length === 2, 'two stones in the heat', queued.join(' '));
  check(
    await page.locator('[data-testid="layer-picker"]').count() === 1,
    'the layer picker appears once there is more than one',
  );

  await page.locator('[data-testid="layers-2"]').first().click();
  await page.waitForTimeout(400);
  const plan = await txt(page, '[data-testid="layer-plan"]');
  check(/outer/i.test(plan) && /core|middle/i.test(plan),
    'and it names which stone goes where', plan.slice(0, 90));
  await shot(page, '1-layers', '[data-testid="casts"]');

  const poured = await page.evaluate(async ({ a, b }) => {
    const w = window as unknown as Record<string, any>;
    const engine = w['__engine'];
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const before = engine.getState().casting.crucible.queue.map((q: any) => q.molten);
    const r = engine.dispatch({ type: 'castPart', partType: 'head', shape: 'point', layers: 2 });
    const s = engine.getState();
    const part = s.casting.rack[s.casting.rack.length - 1];
    const after = s.casting.crucible.queue.map((q: any) => q.molten);

    // The blend, off the REAL part, against the two solids it is made of.
    const blend = fp.blendOf(part);
    const solidA = fp.blendOf(fp.makePart('head', a, 60));
    const solidB = fp.blendOf(fp.makePart('head', b, 60));
    return {
      ok: !!r.ok,
      reason: r.reason ?? '',
      outer: part?.materialId ?? '',
      inner: part?.layers?.[0]?.materialId ?? '',
      paid: before.map((m: number, i: number) => m - (after[i] ?? 0)),
      traits: blend.traits,
      soloA: solidA.traits,
      soloB: solidB.traits,
      pulls: blend.pull.map((p: any) => `${p.trait}@${p.weight.toFixed(2)}`),
      magnitude: blend.magnitude,
      magA: solidA.magnitude,
      magB: solidB.magnitude,
      materials: fp.partMaterials(part),
    };
  }, { a: HEAVY, b: LIGHT });
  await page.waitForTimeout(400);

  check(poured.ok, 'it pours', poured.reason);
  check(poured.outer === HEAVY && poured.inner === LIGHT,
    'outer and core are the stones in queue order', `${poured.outer} over ${poured.inner}`);
  check(poured.paid.length >= 2 && poured.paid[0]! > 0 && poured.paid[1]! > 0,
    'BOTH stones paid for it', poured.paid.map((n: number) => n.toFixed(0)).join(' + '));

  // The blend carries traits neither solid had alone.
  const onlyA = poured.soloA.filter((t: string) => !poured.soloB.includes(t));
  const onlyB = poured.soloB.filter((t: string) => !poured.soloA.includes(t));
  check(onlyA.length > 0 && onlyB.length > 0,
    'the two stones have traits the other does not', `${onlyA.join(',')} vs ${onlyB.join(',')}`);
  check(
    [...onlyA, ...onlyB].every((t: string) => poured.traits.includes(t)),
    'and the layered part carries BOTH sets — a part no single stone makes',
    poured.traits.join(','),
  );
  check(poured.pulls.some((p: string) => !p.endsWith('@1.00')),
    'with the core pulling less than the outer', poured.pulls.join(' '));
  const lo = Math.min(poured.magA, poured.magB);
  const hi = Math.max(poured.magA, poured.magB);
  check(poured.magnitude > lo && poured.magnitude < hi,
    'and its magnitude sits BETWEEN them, never past either',
    `${lo.toFixed(1)} < ${poured.magnitude.toFixed(1)} < ${hi.toFixed(1)}`);

  // ═══ 2. HEAVY READS HEAVY, LIGHT READS LIGHT ════════════════════════════
  console.log('\n2 — the same build, two weights, on the tool');

  const wear = await page.evaluate(async (ids) => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMining' + '.ts');
    const engine = w['__engine'];
    const s = engine.getState();
    const go = {
      read(id: string) {
        s.casting.tool = cp.PART_TYPES.map((t: string, i: number) => ({
          ...fp.makePart(t, id, 60), id: i + 1,
        }));
        s.casting.wear = 0;
        s.casting.windup = 0;
        const e = tm.toolEffect(s);
        return {
          label: e.balance.label,
          value: e.balance.value,
          cells: e.cells,
          splash: e.splash,
          windup: e.balance.windup,
          wear: e.balance.wear,
          charge: e.balance.charge,
        };
      },
    };
    return { heavy: go.read(ids.h), light: go.read(ids.l) };
  }, { h: HEAVY, l: LIGHT });

  check(wear.heavy.label === 'heavy' && wear.light.label === 'light',
    'stone alone decides the weight', `${wear.heavy.label} / ${wear.light.label}`);
  check(wear.heavy.splash > wear.light.splash,
    'heavy takes more out of every cell it reaches',
    `${(wear.heavy.splash * 100).toFixed(0)}% vs ${(wear.light.splash * 100).toFixed(0)}%`);
  check(wear.heavy.windup > 0 && wear.light.windup === 0,
    'and pays a wind-up light never does',
    `${wear.heavy.windup.toFixed(2)}s vs ${wear.light.windup.toFixed(2)}s`);
  check(wear.light.wear < 1 && wear.heavy.wear > 1,
    'while light gets more swings out of the tool',
    `wear ${wear.light.wear.toFixed(2)}× vs ${wear.heavy.wear.toFixed(2)}×`);
  check(wear.light.charge > 0 && wear.heavy.charge === 0,
    'and builds what it carries faster',
    `+${wear.light.charge.toFixed(2)} meter a swing`);

  // ...and it is all on screen.
  await page.evaluate(async (id) => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const s = w['__engine'].getState();
    s.casting.tool = cp.PART_TYPES.map((t: string, i: number) => ({
      ...fp.makePart(t, id, 60), id: i + 1,
    }));
    s.casting.wear = 0;
    s.casting.windup = 0;
  }, HEAVY);
  await page.waitForTimeout(500);
  const label = await txt(page, '[data-testid="tool-balance-label"]');
  const trade = await txt(page, '[data-testid="tool-balance-trade"]');
  const from = await txt(page, '[data-testid="tool-balance-from"]');
  check(label.toLowerCase() === 'heavy', 'the tool says it is heavy', label);
  check(/come round again/.test(trade), 'and states both halves of the trade', trade.slice(0, 90));
  check(from.length > 0, 'and which traits put it there', from);
  await shot(page, '2-heavy', '[data-testid="tool-balance"]');

  // ═══ 3. THE WIND-UP, IN PLAY ════════════════════════════════════════════
  console.log('\n3 — a heavy tool will not swing twice');
  const swings = await page.evaluate(async (ids) => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const engine = w['__engine'];
    const s = engine.getState();
    const go = {
      burst(id: string) {
        s.casting.tool = cp.PART_TYPES.map((t: string, i: number) => ({
          ...fp.makePart(t, id, 60), id: i + 1,
        }));
        s.casting.wear = 0;
        s.casting.windup = 0;
        s.face.cells = s.face.cells.map(() => 8);
        s.face.ore = new Array(s.face.cells.length).fill('');
        s.growth.stage = s.growth.stage.map(() => 0);
        let landed = 0;
        // Five clicks back to back, no time passing between them.
        for (let i = 0; i < 5; i++) {
          if (engine.dispatch({ type: 'chip', cell: i * 3 }).ok) landed++;
        }
        return { landed, windup: engine.getState().casting.windup ?? 0 };
      },
    };
    return { heavy: go.burst(ids.h), light: go.burst(ids.l) };
  }, { h: HEAVY, l: LIGHT });

  check(swings.heavy.landed === 1,
    'five clicks with a heavy tool land ONE swing', `${swings.heavy.landed}/5`);
  check(swings.heavy.windup > 0, 'and it is visibly winding up',
    `${swings.heavy.windup.toFixed(2)}s left`);
  check(swings.light.landed === 5,
    'five clicks with a light tool land all five', `${swings.light.landed}/5`);
  check((swings.light.windup ?? 0) === 0, 'and it never winds up at all');

  // PILLAR 1: bare hands, untouched.
  const bare = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const engine = w['__engine'];
    const s = engine.getState();
    s.casting.tool = [];
    s.casting.windup = 0;
    s.face.cells = s.face.cells.map(() => 8);
    s.face.ore = new Array(s.face.cells.length).fill('');
    let landed = 0;
    for (let i = 0; i < 5; i++) if (engine.dispatch({ type: 'chip', cell: i * 3 }).ok) landed++;
    return { landed, windup: engine.getState().casting.windup ?? 0 };
  });
  check(bare.landed === 5 && bare.windup === 0,
    'and bare hands never wind up either (pillar 1)', `${bare.landed}/5`);
  await shot(page, '3-swings');

  // ═══ 4. THE FRAME ═══════════════════════════════════════════════════════
  console.log('\nthe frame');
  for (const t of ['casting', 'dig']) {
    await tab(page, t);
    await dismiss(page);
    await page.waitForTimeout(300);
    const over = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    check(over === 0, `no horizontal overflow at ${W}px — ${t}`, `${over}px`);
  }

  console.log(`\nshots: ${shots.length}`);
  for (const s of shots) console.log(`  ${s}`);
  await browser.close();

  if (problems.length > 0) {
    console.log(`\n${problems.length} PROBLEM(S):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  console.log('\nall checks passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
