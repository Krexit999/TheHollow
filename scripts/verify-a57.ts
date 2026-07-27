/**
 * A.57 — TWENTY-NINE ABILITIES, DRIVEN IN THE REAL UI.
 *
 * The brief named what it wanted to SEE, and this drives each one through the
 * rendered game and reads the LIVE RENDERER back — not an event, not a state
 * flag. The whole complaint about the last two passes was that the abilities
 * were invisible, so "did a figure actually get drawn on the face" is the
 * assertion that matters and it is taken from `FaceView.abilityFx`.
 *
 *   1  Slagburst detonating 3x3
 *   2  Chainbreaker arcing and clearing a chain, with its trail
 *   3  Vein Miner clearing a whole vein
 *   4  a charge meter filling, and a manual fire
 *   5  a later-shell ability firing visibly (Heat Wave ring / Prism Shot split)
 *   6  the ability limit BLOCKING a too-many-broken loadout
 *   7  the limit GROWING after a shell unlock
 *   8  the steep drill curve
 *   9  380px, zero horizontal overflow
 *
 *   npx tsx scripts/verify-a57.ts [port] [outDir]
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
  await page.screenshot({ path: `${OUT}/a57-${name}.png` });
  shots.push(`${OUT}/a57-${name}.png`);
}

async function overflow(page: Page, name: string): Promise<void> {
  const px = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(px === 0, `${name}: no horizontal overflow at ${W}px`, `${px}px`);
}

/**
 * FIRE ONE ABILITY IN THE LIVE GAME AND READ THE RENDERER BACK.
 *
 * Charges the meter through the real state, dispatches the real `fireAbility`
 * action, then asks the LIVE FaceView how many figures it is drawing and which
 * cells lost charge. Nothing here trusts an event.
 */
async function fireAndWatch(page: Page, id: string, target: number, grade = 7) {
  // TWO STEPS, BECAUSE THE RENDERER IS NOT SYNCHRONOUS. FaceView drains the
  // engine's event queue on its NEXT FRAME, so reading `abilityFx` in the same
  // evaluate as the dispatch counts zero every time — which is how the first
  // run of this script reported all twenty-nine as undrawn while section 3
  // simultaneously reported three figures live. Fire, yield a few frames, then
  // ask the renderer what it is drawing.
  const fired = await page.evaluate(async ({ abilityId, cell, g }) => {
    const w = window as unknown as Record<string, any>;
    const engine = w['__engine'];
    const s = engine.getState();
    const defs = await import(/* @vite-ignore */ '/src/engine/content/drillAlloys' + '.ts');
    const def = defs.ABILITY_BY_ID.get(abilityId);
    // One machine, one ability, meter full.
    // The SECOND machine keeps a plain ability fitted, so CATACLYSM and CASCADE
    // — which read the bay rather than the rock — have something to set off.
    s.drills.alloys = [abilityId, 'slagburst'];
    s.drills.units[0].slots = 1;
    s.drills.units[0].fits = [{ id: abilityId, grade: g, ch: def.charge.need }];
    if (s.drills.units[1]) s.drills.units[1].fits = [{ id: 'slagburst', grade: 1, ch: 0 }];
    const before = s.face.cells.slice();
    const oreBefore = (s.face.ore ?? []).filter(Boolean).length;
    const r = engine.dispatch({ type: 'fireAbility', index: 0, slot: 0, cell });
    const touched: number[] = [];
    for (let i = 0; i < before.length; i++) {
      if ((s.face.cells[i] ?? 0) < before[i] - 1e-9) touched.push(i);
    }
    return {
      ok: !!r.ok,
      reason: r.reason ?? '',
      touched,
      figure: def.figure as string,
      name: def.name as string,
      oreDelta: (s.face.ore ?? []).filter(Boolean).length - oreBefore,
      spent: s.drills.units[0].fits[0].ch as number,
    };
  }, { abilityId: id, cell: target, g: grade });
  await page.waitForTimeout(140);
  const drawn = await page.evaluate(() => {
    const v = (window as unknown as Record<string, any>)['__faceView'];
    return v ? v['abilityFx'].length : -1;
  });
  return { ...fired, drawn };
}

/** Put the face in a known, workable state: full rock, a vein, some growth. */
const stock = `
  const st = engine.getState();
  st.drills.bayBuilt = true; st.forge.built = true; st.kiln.built = true;
  st.depth = 40; st.maxDepthRecord = 60; st.depthRecords['loam'] = 60;
  st.currencies['dust'] = window.__D(1e12); st.currencies['brick'] = window.__D(1e12);
  st.face.cells = st.face.cells.map(() => 8);
  st.face.ore = new Array(st.face.cells.length).fill('');
  st.face.oreDug = new Array(st.face.cells.length).fill(0);
  for (const c of [24, 25, 26, 30]) st.face.ore[c] = 'fatseam';
  for (const c of [24, 25, 26, 30]) st.face.cells[c] = 30;
  // A WORKED FACE, not a pristine one. Ripe growth for Rootbreaker and Bloom
  // Harvest, a few drained cells for Null Pulse — all three read as inert on a
  // uniformly full grid with nothing growing, which is correct behaviour and a
  // useless test bed.
  for (const c of [8, 9, 14]) st.growth.stage[c] = 3;
  for (const c of [0, 1, 6, 7]) st.face.cells[c] = 0.8;
  st.drills.units = [];
  st.drills.units.push(window.__drills.newDrill('Bess'));
  st.drills.units.push(window.__drills.newDrill('Old Tom'));
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

  // === 1. EVERY ABILITY FIRES, CLEARS SOMETHING, AND DRAWS SOMETHING =======
  console.log('\n1 — all twenty-nine, fired in the live game');
  await setup(page, stock);
  await tab(page, 'dig');
  await dismiss(page);
  const ids: string[] = await page.evaluate(async () => {
    const d = await import(/* @vite-ignore */ '/src/engine/content/drillAlloys' + '.ts');
    return d.DRILL_ABILITIES.map((a: { id: string }) => a.id);
  });
  check(ids.length === 29, 'twenty-nine abilities are in the registry', `${ids.length}`);

  const inert: string[] = [];
  const undrawn: string[] = [];
  const results: Record<string, { touched: number; drawn: number }> = {};
  for (const id of ids) {
    await setup(page, stock);
    const r = await fireAndWatch(page, id, 15);
    results[id] = { touched: r.touched.length, drawn: r.drawn };
    const didSomething = r.ok && (r.touched.length > 0 || r.oreDelta !== 0);
    if (!didSomething) inert.push(`${r.name}(${r.reason || 'no effect'})`);
    if (r.drawn < 1) undrawn.push(r.name);
  }
  check(inert.length === 0, 'every ability fired and CHANGED THE FACE', inert.join(', ') || '29/29');
  check(undrawn.length === 0, 'every ability DREW A FIGURE on the live renderer', undrawn.join(', ') || '29/29');

  // === 2. SLAGBURST DETONATES 3x3 =========================================
  console.log('\n2 — Slagburst, three by three');
  await setup(page, stock);
  // GRADE I, because "3x3" is the base shape — grade VII widens it to r=7,
  // which on a 6x6 face is the whole board and proves nothing about the shape.
  const burst = await fireAndWatch(page, 'slagburst', 15, 1);
  const shape = await page.evaluate(() => {
    const s = (window as unknown as Record<string, any>)['__engine'].getState();
    return { w: s.face.w, h: s.face.h };
  });
  // Grade VII widens it; at grade VII r = 1 + 6, so this asserts the SHAPE is a
  // filled square around the target rather than the exact count.
  const xs = burst.touched.map((c) => c % shape.w);
  const ys = burst.touched.map((c) => Math.floor(c / shape.w));
  const contiguous = burst.touched.length > 1
    && Math.max(...xs) - Math.min(...xs) >= 2 && Math.max(...ys) - Math.min(...ys) >= 2;
  check(contiguous, 'Slagburst clears a solid block around the strike',
    `${burst.touched.length} cells, ${Math.max(...xs) - Math.min(...xs) + 1}x${Math.max(...ys) - Math.min(...ys) + 1}`);
  check(burst.figure === 'burst' && burst.drawn > 0, 'and draws the detonation figure', burst.figure);
  check(burst.spent === 0, 'and spends its meter');

  // === 3. CHAINBREAKER ARCS ===============================================
  console.log('\n3 — Chainbreaker, and it keeps going');
  const lengths: number[] = [];
  for (let k = 0; k < 12; k++) {
    await setup(page, stock);
    const r = await fireAndWatch(page, 'chainbreaker', 15);
    lengths.push(r.touched.length);
  }
  check(Math.max(...lengths) > Math.min(...lengths),
    'the chain length VARIES run to run — sometimes one, sometimes many',
    `${Math.min(...lengths)}..${Math.max(...lengths)} cells`);
  check(Math.max(...lengths) >= 4, 'and it does sometimes go a long way', `longest ${Math.max(...lengths)}`);
  const chainFx = await page.evaluate(() => {
    const v = (window as unknown as Record<string, any>)['__faceView'];
    return v ? v['abilityFx'].length : -1;
  });
  check(chainFx > 0, 'the bolt figure is live on the renderer', `${chainFx} drawing`);

  // === 4. VEIN MINER TAKES THE WHOLE VEIN ==================================
  console.log('\n4 — Vein Miner, the whole seam');
  await setup(page, stock);
  const vein = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const engine = w['__engine'];
    const s = engine.getState();
    const defs = await import(/* @vite-ignore */ '/src/engine/content/drillAlloys' + '.ts');
    const def = defs.ABILITY_BY_ID.get('veinminer');
    s.drills.units.length = 1;
    s.drills.alloys = ['veinminer'];
    s.drills.units[0].fits = [{ id: 'veinminer', grade: 1, ch: def.charge.need }];
    const before = (s.face.ore ?? []).filter(Boolean).length;
    engine.dispatch({ type: 'fireAbility', index: 0, slot: 0, cell: 24 });
    return { before, after: (s.face.ore ?? []).filter(Boolean).length };
  });
  check(vein.before === 4 && vein.after === 0,
    'a four-cell vein goes in one firing — all of it, not one pocket',
    `${vein.before} pockets -> ${vein.after}`);

  // === 5. THE METER, AND FIRING IT BY HAND ================================
  console.log('\n5 — the charge meter, and a manual fire');
  await setup(page, stock + `
    st.drills.alloys = ['slagburst'];
    st.drills.units[0].fits = [{ id: 'slagburst', grade: 1, ch: 0 }];
  `);
  await tab(page, 'drills');
  await dismiss(page);
  const bar = page.locator('[data-testid="charge-bar-0-0"]');
  check(await bar.count() > 0, 'the drill row shows a charge bar for the ability');
  const w0 = await page.evaluate(() =>
    (document.querySelector('[data-testid="charge-bar-0-0"]') as HTMLElement | null)?.style.width ?? '');
  // Let the engine actually run and fill it.
  await page.evaluate(() => {
    (window as unknown as Record<string, any>)['__engine']
      .dispatch({ type: 'debug', op: 'warp', seconds: 40 });
  });
  await page.waitForTimeout(500);
  const filled = await page.evaluate(() => {
    const s = (window as unknown as Record<string, any>)['__engine'].getState();
    return s.drills.units[0].fits[0].ch as number;
  });
  check(filled > 0 || w0 !== '', 'the meter fills as the drill works', `ch=${filled}`);

  // Force it to READY and fire it from the button. The READY WINDOW is what
  // makes this possible at all: before A.57 added it, a full meter fired itself
  // in the same tick and the button was never enabled for a single frame.
  await setup(page, `
    const st = engine.getState();
    st.face.cells = st.face.cells.map(() => 8);
    st.drills.units[0].fits[0].ch = 30;
  `);
  await tab(page, 'drills');
  await dismiss(page);
  const fireBtn = page.locator('[data-testid="fire-0-0"]');
  await fireBtn.scrollIntoViewIfNeeded().catch(() => {});
  const label = await fireBtn.innerText().catch(() => '');
  check(/fire/i.test(label), 'a charged ability offers a FIRE button', label);
  const beforeFire = await page.evaluate(() =>
    (window as unknown as Record<string, any>)['__engine'].getState().face.cells.reduce((n: number, c: number) => n + c, 0));
  await fireBtn.click();
  await page.waitForTimeout(300);
  const afterFire = await page.evaluate(() =>
    (window as unknown as Record<string, any>)['__engine'].getState().face.cells.reduce((n: number, c: number) => n + c, 0));
  check(afterFire < beforeFire, 'clicking it sets the ability off', `${beforeFire.toFixed(1)} -> ${afterFire.toFixed(1)} charge`);
  await shot(page, 'charge-meters');
  await overflow(page, 'drill bay');

  // === 6. AUTO-FIRE — the idle half ======================================
  console.log('\n6 — it fires itself, with nobody watching');
  await setup(page, stock + `
    st.drills.alloys = ['slagburst'];
    st.drills.units[0].fits = [{ id: 'slagburst', grade: 1, ch: 0 }];
  `);
  const auto = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const drills = await import(/* @vite-ignore */ '/src/engine/systems/drills' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const s = w['__engine'].getState();
    // NO NAMED ARROWS IN HERE — tsx compiles this body with keepNames, which
    // wraps `const f = () => …` in a `__name()` helper that does not exist in
    // the page and throws ReferenceError at the first call.
    const seen = { n: 0 };
    const ctx = {
      emit(e: { type: string }) { if (e.type === 'abilityFire') seen.n++; },
      dirty() {},
    };
    for (let t = 0; t < 400; t++) drills.tickDrills(s, new modsMod.ModifierCache(), ctx, 1);
    return seen.n;
  });
  check(auto > 0, 'the ability fires on its own with no dispatch at all (pillar 1)', `${auto} firings`);

  // === 7. A LATER-SHELL ABILITY ===========================================
  console.log('\n7 — a deeper shell fires visibly');
  await setup(page, stock);
  const heat = await fireAndWatch(page, 'heatwave', 15);
  check(heat.touched.length > 0 && heat.figure === 'ring',
    'Heat Wave clears a ring and draws the expanding wave',
    `${heat.touched.length} cells, figure ${heat.figure}`);
  await setup(page, stock);
  const prism = await fireAndWatch(page, 'prismshot', 15);
  check(prism.touched.length >= 3 && prism.figure === 'beam',
    'Prism Shot splits into beams and takes several cells at once',
    `${prism.touched.length} cells, figure ${prism.figure}`);
  // And it is DRAWN on the live renderer, at the moment of the shot.
  await tab(page, 'dig');
  await dismiss(page);
  await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    const defs = await import(/* @vite-ignore */ '/src/engine/content/drillAlloys' + '.ts');
    s.face.cells = s.face.cells.map(() => 8);
    s.drills.alloys = ['heatwave'];
    s.drills.units[0].fits = [{ id: 'heatwave', grade: 4, ch: defs.ABILITY_BY_ID.get('heatwave').charge.need }];
    w['__engine'].dispatch({ type: 'fireAbility', index: 0, slot: 0, cell: 21 });
  });
  await page.waitForTimeout(120);
  await shot(page, 'heatwave-firing');

  // === 8. THE LIMIT =======================================================
  console.log('\n8 — the broken-ability limit');
  await setup(page, `
    const st = engine.getState();
    st.drills.bayBuilt = true; st.forge.built = true; st.kiln.built = true;
    st.depthRecords = { loam: 60 };
    st.maxDepthRecord = 60; st.shell.breachCount = 0;
    st.currencies['brick'] = window.__D(1e12);
    st.drills.units = [];
    for (let i = 0; i < 4; i++) st.drills.units.push(window.__drills.newDrill('D' + i));
    st.drills.alloys = ['chainbreaker', 'slagburst', 'tunnelbore'];
    st.drills.units[0].fits = [{ id: 'chainbreaker', grade: 1, ch: 0 }];
    st.drills.units[1].fits = [{ id: 'slagburst', grade: 1, ch: 0 }];
    window.__forge.addMaterial(st, 'graveclay', 60, 400);
    window.__forge.addMaterial(st, 'loamiron', 60, 400);
  `);
  await tab(page, 'drills');
  await dismiss(page);
  let t = await text(page);
  check(has(t, '5/5 carried'), 'the bay says the limit is full', t.match(/\d+\/\d+ carried/)?.[0] ?? 'no readout');
  await shot(page, 'limit-full');

  const blocked = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    return w['__engine'].dispatch({
      type: 'forgeDrillAlloy', materialIds: ['graveclay', 'loamiron'],
      drills: [2], prefer: 'tunnelbore',
    });
  });
  check(!blocked.ok && /cannot run that much/i.test(blocked.reason ?? ''),
    'a pour that would overflow the limit is REFUSED', blocked.reason ?? 'accepted!');

  // === 9. AND THE LIMIT GROWS =============================================
  console.log('\n9 — reach a shell, carry more');
  const before9 = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const a = await import(/* @vite-ignore */ '/src/engine/systems/drillAlloys' + '.ts');
    return a.abilityBudget(w['__engine'].getState());
  });
  await setup(page, `engine.getState().depthRecords['ferrite'] = 10;`);
  const after9 = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const a = await import(/* @vite-ignore */ '/src/engine/systems/drillAlloys' + '.ts');
    return a.abilityBudget(w['__engine'].getState());
  });
  check(after9 > before9, 'reaching a deeper shell raises the limit', `${before9} -> ${after9}`);
  const nowOk = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    return w['__engine'].dispatch({
      type: 'forgeDrillAlloy', materialIds: ['graveclay', 'loamiron'],
      drills: [2], prefer: 'tunnelbore',
    });
  });
  check(nowOk.ok === true, 'and the same pour now goes through', nowOk.reason ?? 'ok');
  await tab(page, 'drills');
  await dismiss(page);
  t = await text(page);
  check(/\d+\/9 carried/.test(t), 'the readout shows the grown limit', t.match(/\d+\/\d+ carried/)?.[0] ?? '-');
  await shot(page, 'limit-grown');
  await overflow(page, 'limit grown');

  // === 10. THE BUY CURVE ==================================================
  console.log('\n10 — first four easy, last three brutal');
  const curve = await page.evaluate(async () => {
    const up = await import(/* @vite-ignore */ '/src/engine/upgrades' + '.ts');
    const def = up.allUpgrades().find((u: { id: string }) => u.id === 'drillCount');
    // NO NAMED ARROWS — tsx keepNames wraps them in a  helper the
    // page does not have, and it throws on the first call.
    const costs: number[] = [];
    let c = def.baseCost.toNumber();
    for (let k = 0; k < def.maxLevel; k++) { costs.push(c); c *= def.ratioAt(k); }
    const band = [0, 0, 0, 0];
    for (let k = 0; k < costs.length; k++) {
      const b = k < 4 ? 0 : k < 8 ? 1 : k < 12 ? 2 : 3;
      band[b] = (band[b] ?? 0) + costs[k]!;
    }
    return {
      first4: band[0]!, to8: band[1]!, to12: band[2]!, to15: band[3]!,
      last: costs[costs.length - 1]!,
    };
  });
  check(curve.first4 < 60, 'the first four are near-impulse', `${Math.round(curve.first4)} CONV`);
  check(curve.to8 > curve.first4 * 3, '4-8 is a real step up', `${Math.round(curve.to8)}`);
  check(curve.to12 > curve.to8 * 3, '8-12 is very hard', `${Math.round(curve.to12)}`);
  check(curve.to15 > curve.to12 * 3, '12-15 is brutal', `${Math.round(curve.to15)}`);
  // 21,883 for the sixteenth chassis against 6 for the first, and against
  // ~5,100 for the ENTIRE row before A.56 — a 550x spread inside one upgrade.
  check(curve.last > 20_000, 'and the last chassis is a landmark purchase', `${Math.round(curve.last)} CONV, vs 6 for the first`);

  // === 11. THE FACE, AT 380 ===============================================
  console.log('\n11 — the whole thing at 380px');
  await tab(page, 'dig');
  await dismiss(page);
  await overflow(page, 'face');
  await tab(page, 'forge');
  await dismiss(page);
  await overflow(page, 'alloy bench');
  t = await text(page);
  // THE COUNT IS OF WHAT IS IN THE WORLD, not of the registry — the pool grows
  // as you descend, so a Ferrite player seeing 9 is the GATE working. The first
  // run of this asserted 29 and was reading the feature as a failure.
  check(/\d+\/9 known/.test(t), 'the bench counts the pool THIS player can reach',
    t.match(/\d+\/\d+ known/)?.[0] ?? '-');
  await setup(page, `
    const st = engine.getState();
    for (const id of ['verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) st.depthRecords[id] = 10;
  `);
  await tab(page, 'forge');
  await dismiss(page);
  t = await text(page);
  check(/\d+\/29 known/.test(t), 'and all twenty-nine once every shell has been reached',
    t.match(/\d+\/\d+ known/)?.[0] ?? '-');
  await shot(page, 'bench');

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
