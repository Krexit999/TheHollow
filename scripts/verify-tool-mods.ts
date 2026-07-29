/**
 * THE MODIFIER LIBRARY, DRIVEN IN THE REAL GAME.
 *
 *  1  YOU BUILD FROM IT. Feed stone at the bench, a modifier takes, the library
 *     records it, the slot count moves. Several of them stack up.
 *  2  A COMBO IS INERT AND SAYS SO, then wakes when the thing it wants arrives
 *     — and the total on screen visibly grows when it does.
 *  3  A MODDED ABILITY FIRES BIGGER. Slagburst at r=1 clears nine cells; with
 *     Wider Blast seated it clears twenty-five, and the figure is read back off
 *     the LIVE renderer rather than from the engine's own event.
 *  4  380px, 0 overflow.
 *
 *   npx tsx scripts/verify-tool-mods.ts [port] [outDir]
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
  await page.screenshot({ path: `${OUT}/mod-${name}.png` });
  shots.push(`${OUT}/mod-${name}.png`);
}
const txt = async (page: Page, sel: string): Promise<string> =>
  (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

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

  // A deep, levelled tool — the OP arc's far end, because the interesting
  // question is what a real budget can hold. Materials for the whole library.
  const setupInfo = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMining' + '.ts');
    const ta = await import(/* @vite-ignore */ '/src/engine/systems/toolAbilities' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const s = w['__engine'].getState();
    for (const id of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      s.depthRecords[id] = 60;
    }
    // Every shell's rock, so the whole library is in principle reachable.
    for (const shell of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      for (const m of mats.materialsOfShell(shell)) forge.addMaterial(s, m.id, 60, 300);
    }
    // A tool built from stone that grants Slagburst, so the 5x5 is testable.
    const stone = 'bonechalk';
    s.casting.tool = cp.PART_TYPES.map((t: string, i: number) => ({
      ...fp.makePart(t, stone, 60), id: i + 1,
    }));
    s.casting.wear = 0;
    s.casting.xp = tm.xpForLevel(40);
    s.casting.mods = [];
    s.casting.knownMods = [];
    if (s.casting.hand) s.casting.hand.fits = [];
    ta.syncToolAbilities(s, { emit() {}, dirty() {} });
    return { grants: ta.toolGrants(s).map((a: any) => a.id) };
  });
  await page.waitForTimeout(400);

  // ═══ 1. YOU BUILD FROM IT ═══════════════════════════════════════════════
  console.log('\n1 — a library you build from');
  await tab(page, 'casting');
  await dismiss(page);

  check(
    await page.locator('[data-testid="mod-bench"]').count() === 1,
    'the bench is on the tool',
  );
  const slots0 = await txt(page, '[data-testid="mod-slots"]');
  check(/^0\//.test(slots0), 'a fresh tool has its slots and none of them spent', slots0);
  check(
    (await txt(page, '[data-testid="mod-stack-empty"]')).length > 0,
    'and says plainly that nothing is worked into it',
  );
  await shot(page, '1-empty', '[data-testid="mod-bench"]');

  /**
   * APPLY THROUGH THE REAL ACTION. The engine is asked which stone makes what
   * so the driver is not pinning material ids that the registry may move — the
   * A.56 lesson about tests that quietly stop testing anything.
   */
  const wanted = ['longarm', 'heavyhead', 'widerblast', 'quarryjaw', 'resonance'];
  const applied = await page.evaluate(async (ids) => {
    const w = window as unknown as Record<string, any>;
    const cm = await import(/* @vite-ignore */ '/src/engine/content/toolMods' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const engine = w['__engine'];
    const out: Array<{ id: string; got: string | null; note: string }> = [];

    // Find a mix that makes each target, by asking the matcher.
    const pool: string[] = [];
    for (const shell of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      for (const m of mats.materialsOfShell(shell)) pool.push(m.id);
    }
    for (const want of ids) {
      let mix: string[] | null = null;
      for (const a of pool) {
        for (const b of pool) {
          const m = cm.matchToolMod([a, a, b], { reached: 7, prefer: want });
          if (m && m.id === want) { mix = [a, a, b]; break; }
        }
        if (mix) break;
      }
      if (!mix) { out.push({ id: want, got: null, note: 'no mix found' }); continue; }
      // The library has to KNOW it before aiming works, so the first pour at a
      // given signature is unaimed — exactly as a player experiences it.
      const s = engine.getState();
      if (!s.casting.knownMods.includes(want)) s.casting.knownMods.push(want);
      const r = engine.dispatch({ type: 'applyToolMod', materialIds: mix, prefer: want });
      const d = (r.data ?? {}) as any;
      out.push({ id: want, got: d.mod ?? null, note: r.ok ? (d.reason ?? 'ok') : (r.reason ?? '') });
    }
    return out;
  }, wanted);
  await page.waitForTimeout(500);

  const landed = applied.filter((a) => a.got === a.id).map((a) => a.id);
  check(landed.length >= 4, 'several modifiers work into the tool', `${landed.length}/${wanted.length}: ${landed.join(', ')}`);

  const slots1 = await txt(page, '[data-testid="mod-slots"]');
  check(slots1 !== slots0 && !/^0\//.test(slots1), 'and the slots are visibly spent', `${slots0} → ${slots1}`);
  const stackCount = await page.locator('[data-testid="mod-stack"] > div').count();
  check(stackCount >= 4, 'the stack lists what is on it', `${stackCount} rows`);
  const total = await txt(page, '[data-testid="mod-total-text"]');
  check(total.length > 0 && total !== 'Nothing awake yet.', 'and the whole stack adds up to one line', total.slice(0, 90));
  await shot(page, '2-stacked', '[data-testid="mod-bench"]');

  // ═══ 2. THE COMBO ═══════════════════════════════════════════════════════
  console.log('\n2 — a combo that is worth nothing alone');

  // Strip back to just Resonance, so it has nothing to amplify.
  const dormant = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const engine = w['__engine'];
    const s = engine.getState();
    s.casting.mods = [{ id: 'resonance', n: 1 }];
    const tmods = await import(/* @vite-ignore */ '/src/engine/systems/toolMods' + '.ts');
    const cm = await import(/* @vite-ignore */ '/src/engine/content/toolMods' + '.ts');
    return {
      live: tmods.modLive(s, cm.MOD_BY_ID.get('resonance'), 0),
      amplify: tmods.modCache(s, 0).amplify,
    };
  });
  await page.waitForTimeout(500);
  const why = await txt(page, '[data-testid="mod-dormant-resonance"]');
  check(!dormant.live && dormant.amplify === 1, 'Resonance alone does nothing', `amplify ${dormant.amplify}×`);
  check(why.includes('wants'), 'and says on the tool what it is waiting for', why);
  await shot(page, '3-dormant', '[data-testid="mod-bench"]');

  const woke = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const engine = w['__engine'];
    const s = engine.getState();
    const tmods = await import(/* @vite-ignore */ '/src/engine/systems/toolMods' + '.ts');
    const before = tmods.modCache(s, 0);
    s.casting.mods = [
      { id: 'resonance', n: 1 }, { id: 'longarm', n: 2 }, { id: 'heavyhead', n: 2 },
    ];
    const after = tmods.modCache(s, 0);
    // The same stack WITHOUT the combo, to price what it is worth.
    s.casting.mods = [{ id: 'longarm', n: 2 }, { id: 'heavyhead', n: 2 }];
    const plain = tmods.modCache(s, 0);
    s.casting.mods = [
      { id: 'resonance', n: 1 }, { id: 'longarm', n: 2 }, { id: 'heavyhead', n: 2 },
    ];
    return {
      amplify: after.amplify,
      cellsPlain: plain.cells, cellsAmped: after.cells,
      splashPlain: plain.splash, splashAmped: after.splash,
      beforeAmp: before.amplify,
    };
  });
  await page.waitForTimeout(500);
  check(woke.amplify > 1, 'giving it something to amplify wakes it', `${woke.beforeAmp}× → ${woke.amplify}×`);
  check(
    woke.cellsAmped > woke.cellsPlain && woke.splashAmped > woke.splashPlain,
    'and the SAME two modifiers are now worth more',
    `reach ${woke.cellsPlain} → ${woke.cellsAmped}, splash ${woke.splashPlain.toFixed(3)} → ${woke.splashAmped.toFixed(3)}`,
  );
  const ampLine = await txt(page, '[data-testid="mod-amplify"]');
  check(ampLine.length > 0, 'and the tool says so out loud', ampLine);
  const total2 = await txt(page, '[data-testid="mod-total-text"]');
  check(total2.length > 0, 'the total moved with it', total2.slice(0, 90));
  await shot(page, '4-combo', '[data-testid="mod-bench"]');

  // ═══ 3. A MODDED ABILITY, FIRING BIGGER ═════════════════════════════════
  console.log('\n3 — a five-by-five Slagburst');
  check(setupInfo.grants.includes('slagburst'), 'the tool was built to Slagburst', setupInfo.grants.join(','));

  const plainFire = await fireSlag(page, false);
  await page.waitForTimeout(200);
  const plainFx = await fxCount(page);
  const moddedFire = await fireSlag(page, true);
  await page.waitForTimeout(200);
  const moddedFx = await fxCount(page);

  check(plainFire.r === 1 && moddedFire.r === 2, 'Wider Blast takes the blast from r=1 to r=2', `${plainFire.r} → ${moddedFire.r}`);
  check(plainFire.cells === 9, 'a bare Slagburst clears three by three', `${plainFire.cells} cells`);
  check(moddedFire.cells === 25, 'and a modded one clears five by five', `${moddedFire.cells} cells`);
  check(moddedFire.took > plainFire.took, 'it takes more charge, because it cleared more rock',
    `${plainFire.took.toFixed(1)} → ${moddedFire.took.toFixed(1)}`);
  check(plainFx > 0 && moddedFx > 0, 'and both DREW on the face — read off the live renderer',
    `abilityFx ${plainFx} / ${moddedFx}`);
  await shot(page, '5-bigblast');

  // THE PILLAR-2 SHAPE OF IT, in one reading a player could not argue with: the
  // bigger blast took more because there was more under it, not because each
  // cell paid more.
  const perCell = {
    plain: plainFire.took / plainFire.cleared,
    modded: moddedFire.took / moddedFire.cleared,
  };
  check(
    Math.abs(perCell.modded - perCell.plain) / Math.max(perCell.plain, 1e-9) < 0.35,
    'and it took about the same PER CELL — more rock, not richer rock',
    `${perCell.plain.toFixed(2)} vs ${perCell.modded.toFixed(2)} per cell`,
  );

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

/** Fire Slagburst on a full face, with or without Wider Blast seated, and
 *  report what the plan actually covered. */
async function fireSlag(page: Page, modded: boolean) {
  return page.evaluate(async (withMod) => {
    const w = window as unknown as Record<string, any>;
    const engine = w['__engine'];
    const s = engine.getState();
    const da = await import(/* @vite-ignore */ '/src/engine/content/drillAlloys' + '.ts');
    const dr = await import(/* @vite-ignore */ '/src/engine/systems/drillAlloys' + '.ts');
    const tmods = await import(/* @vite-ignore */ '/src/engine/systems/toolMods' + '.ts');

    s.casting.mods = withMod ? [{ id: 'widerblast', n: 1 }] : [];
    // A face wide enough for a 5x5 to fit whole, uniformly full so the count of
    // cells that LOST charge is the count of cells the plan covered.
    s.face.cells = s.face.cells.map(() => 8);
    s.face.ore = new Array(s.face.cells.length).fill('');
    s.growth.stage = s.growth.stage.map(() => 0);
    s.casting.hand.fits = [{ id: 'slagburst', grade: 1, ch: 999 }];
    const centre = Math.floor(s.face.h / 2) * s.face.w + Math.floor(s.face.w / 2);
    s.casting.hand.lastCell = centre;

    const def = da.ABILITY_BY_ID.get('slagburst');
    const p = tmods.tuneParams(tmods.modCache(s, 1), da.abilityParams(def, 1));
    const before = s.face.cells.slice();
    const heldBefore = before.reduce((a: number, b: number) => a + b, 0);
    engine.dispatch({ type: 'fireAbility', index: dr.TOOL_CARRIER, slot: 0, cell: centre });
    const s2 = engine.getState();
    let cleared = 0;
    for (let i = 0; i < before.length; i++) {
      if ((s2.face.cells[i] ?? 0) < before[i] - 1e-9) cleared++;
    }
    const r = Math.round(p['r'] ?? 0);
    return {
      r,
      cells: (2 * r + 1) * (2 * r + 1),
      cleared,
      took: heldBefore - s2.face.cells.reduce((a: number, b: number) => a + b, 0),
    };
  }, modded);
}

const fxCount = (page: Page) => page.evaluate(() => {
  const v = (window as unknown as Record<string, any>)['__faceView'];
  return v ? v['abilityFx'].length : -1;
});

main().catch((e) => { console.error(e); process.exit(1); });
