/**
 * MATERIAL ABILITIES ON TOOLS, DRIVEN IN THE REAL GAME.
 *
 *  1  THE STONE DECIDES. A tool built from dull rock reaches for nothing; one
 *     built from the right rock names what it can do, and the bench hints at
 *     the lean BEFORE you commit (pillar 5).
 *  2  IT FIRES ON THE GRID, VISIBLY. The meter fills as you swing, the button
 *     goes READY, and firing it puts a NAMED FIGURE on the face — read back off
 *     the live renderer, not asserted from the engine. The previous two ability
 *     passes both shipped mechanisms nobody could see; this is the check that
 *     exists because of them.
 *  3  IT IS THE SAME SYSTEM AS THE DRILLS. Discovery lands in the same codex.
 *  4  380px, 0 overflow.
 *
 *   npx tsx scripts/verify-tool-abilities.ts [port] [outDir]
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
  await page.screenshot({ path: `${OUT}/ab-${name}.png` });
  shots.push(`${OUT}/ab-${name}.png`);
}
const txt = async (page: Page, sel: string): Promise<string> =>
  (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

/** Seat a whole tool in one stone, bypassing the crucible — casting honestly is
 *  step 2's driver, and this one is about what the stone MAKES it able to do. */
async function fit(page: Page, materialId: string | null): Promise<void> {
  await page.evaluate(async (id) => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const ta = await import(/* @vite-ignore */ '/src/engine/systems/toolAbilities' + '.ts');
    const s = w['__engine'].getState();
    s.casting.tool = id === null
      ? []
      : cp.PART_TYPES.map((t: string, i: number) => ({ ...fp.makePart(t, id, 60), id: i + 1 }));
    s.casting.wear = 0;
    if (s.casting.hand) s.casting.hand.fits = [];
    ta.syncToolAbilities(s, { emit() {}, dirty() {} });
  }, materialId);
  await page.waitForTimeout(400);
}

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

  // Everything reached, and a hold to work from.
  await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const s = w['__engine'].getState();
    for (const id of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      s.depthRecords[id] = 60;
    }
    for (const id of ['marl', 'ochre', 'graveclay', 'bonechalk', 'umberjade']) {
      forge.addMaterial(s, id, 60, 200);
    }
  });

  // Which stones are loud and quiet, asked of the engine rather than assumed —
  // a hardcoded material id here would silently rot the moment the registry
  // moves, and this project has shipped exactly that (A.56's vacuous reach).
  const stones = await page.evaluate(async () => {
    const da = await import(/* @vite-ignore */ '/src/engine/content/drillAlloys' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const ROCK = new Set(['single', 'block', 'radius', 'ring', 'line', 'row', 'split',
      'behind', 'bounce', 'chain', 'charged']);
    let loud = '', loudNames: string[] = [], quiet = '';
    for (const shell of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      for (const m of mats.materialsOfShell(shell)) {
        const got = da.matchAllAbilities([m.id, m.id, m.id], { reached: 7 });
        if (got.length === 0) { if (!quiet) quiet = m.id; continue; }
        if (!loud && ROCK.has(got[0].shape)) { loud = m.id; loudNames = got.map((a: any) => a.name); }
      }
    }
    return { loud, loudNames, quiet };
  });

  // ═══ 1. THE STONE DECIDES ═══════════════════════════════════════════════
  console.log('\n1 — what a tool can do comes out of what it is made of');
  await tab(page, 'casting');
  await dismiss(page);

  await fit(page, stones.quiet);
  const noneTxt = await txt(page, '[data-testid="tool-abilities-none"]');
  check(noneTxt.length > 0, 'a tool of dull rock says so plainly', noneTxt.slice(0, 90));
  check(
    await page.locator('[data-testid="tool-ability-0"]').count() === 0,
    'and carries nothing',
  );
  await shot(page, '1-quiet', '[data-testid="tool-abilities"]');

  await fit(page, stones.loud);
  const name0 = await txt(page, '[data-testid="tool-ability-name-0"]');
  const slotsTxt = await txt(page, '[data-testid="tool-ability-slots"]');
  check(name0.length > 0, 'the right stone gives it a named ability', name0);
  check(/1\/1 carried/.test(slotsTxt), 'a first tool carries exactly one', slotsTxt);
  const spare = await txt(page, '[data-testid="tool-ability-spare"]');
  check(spare.length > 0, 'and says what else it was built for, with no room yet',
    spare.replace(/\n/g, ' ').slice(0, 80));
  await shot(page, '2-granted', '[data-testid="tool-abilities"]');

  // The codex — the SAME one the crucible writes to.
  const codex = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    return w['__engine'].getState().drills.alloys as string[];
  });
  check(codex.length > 0, 'building it wrote to the drills own codex', `${codex.length} known`);

  // ═══ 2. IT FIRES, VISIBLY, ON THE GRID ══════════════════════════════════
  console.log('\n2 — it charges as you swing, and goes off on the face');
  await tab(page, 'dig');
  await dismiss(page);
  await page.waitForTimeout(400);

  check(
    await page.locator('[data-testid="face-abilities"]').count() === 1,
    'the meter is at the face, where the swinging happens',
  );
  const before = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    return w['__engine'].getState().casting.hand.fits[0].ch ?? 0;
  });

  // SWING AT THE ROCK. Real chips through the real action path.
  const need = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    s.face.cells = s.face.cells.map(() => 8);
    const da = await import(/* @vite-ignore */ '/src/engine/content/drillAlloys' + '.ts');
    return da.ABILITY_BY_ID.get(s.casting.hand.fits[0].id).charge.need as number;
  });
  for (let i = 0; i < Math.max(2, need - 1); i++) {
    await page.evaluate((c) => {
      const w = window as unknown as Record<string, any>;
      w['__engine'].dispatch({ type: 'chip', cell: c });
    }, 14);
    await page.waitForTimeout(30);
  }
  const after = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    return w['__engine'].getState().casting.hand.fits[0].ch ?? 0;
  });
  check(after > before, 'swinging fills the meter', `${before} → ${after} of ${need}`);

  // Top it to READY without firing it, so the button can be caught full.
  await page.evaluate((n) => {
    const w = window as unknown as Record<string, any>;
    w['__engine'].getState().casting.hand.fits[0].ch = n;
  }, need);
  await page.waitForTimeout(600);
  const btn = page.locator('[data-testid="face-fire-0"]').first();
  check(await btn.isEnabled(), 'a full meter offers the shot rather than taking it');
  await shot(page, '3-ready', '[data-testid="face-abilities"]');

  /**
   * THE PART THAT MATTERS: read the FIGURE back off the live renderer.
   *
   * `FaceView.abilityFx` is the list of live figures being drawn. An ability
   * that changed the rock but drew nothing is the exact failure A.57 was
   * written to end, and asserting it from the engine's own event would prove
   * only that the engine emitted one.
   */
  // TWO EVALUATES, BECAUSE THE RENDERER IS NOT SYNCHRONOUS. FaceView drains the
  // engine's event queue on its NEXT FRAME, so reading `abilityFx` in the same
  // evaluate as the dispatch counts zero every time — the lesson `verify-a57`
  // paid for and the reason this is not one block.
  const fired = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    s.face.cells = s.face.cells.map(() => 8);
    const heldBefore = s.face.cells.reduce((a: number, b: number) => a + b, 0);
    s.casting.hand.lastCell = 14;
    const view = w['__faceView'];
    const fxBefore = view ? view.abilityFx.length : -1;
    const da = await import(/* @vite-ignore */ '/src/engine/systems/drillAlloys' + '.ts');
    const r = w['__engine'].dispatch({ type: 'fireAbility', index: da.TOOL_CARRIER, slot: 0 });
    const s2 = w['__engine'].getState();
    return {
      ok: r.ok,
      reason: r.reason ?? '',
      name: (r.data && r.data.name) || '',
      heldBefore,
      heldAfter: s2.face.cells.reduce((a: number, b: number) => a + b, 0),
      fxBefore,
      meter: s2.casting.hand.fits[0].ch,
    };
  });
  await page.waitForTimeout(180);
  const fxAfter = await page.evaluate(() => {
    const v = (window as unknown as Record<string, any>)['__faceView'];
    return v ? v['abilityFx'].length : -1;
  });
  check(fired.ok, 'firing it by hand works', fired.name || fired.reason);
  check(fired.heldAfter < fired.heldBefore, 'and it takes charge out of the rock',
    `${fired.heldBefore.toFixed(0)} → ${fired.heldAfter.toFixed(0)}`);
  check(fxAfter > fired.fxBefore,
    'and DRAWS A FIGURE on the face — read off the live renderer',
    `abilityFx ${fired.fxBefore} → ${fxAfter}`);
  check(fired.meter === 0, 'and spends the meter');
  await shot(page, '4-firing');

  // The auto-fire half — pillar 1's, and it must not need a click.
  const auto = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    s.face.cells = s.face.cells.map(() => 8);
    const da = await import(/* @vite-ignore */ '/src/engine/content/drillAlloys' + '.ts');
    const dr = await import(/* @vite-ignore */ '/src/engine/systems/drillAlloys' + '.ts');
    const def = da.ABILITY_BY_ID.get(s.casting.hand.fits[0].id);
    // One swing short of firing on its own, with nobody touching the button.
    s.casting.hand.fits[0].ch = def.charge.need + dr.READY_GRACE - 1;
    const view = w['__faceView'];
    const fxBefore = view ? view.abilityFx.length : -1;
    w['__engine'].dispatch({ type: 'chip', cell: 20 });
    return { fxBefore, meter: w['__engine'].getState().casting.hand.fits[0].ch };
  });
  await page.waitForTimeout(180);
  const autoFx = await page.evaluate(() => {
    const v = (window as unknown as Record<string, any>)['__faceView'];
    return v ? v['abilityFx'].length : -1;
  });
  check(auto.meter === 0 && autoFx > auto.fxBefore,
    'and it fires ITSELF on the next swing — no click anywhere (pillar 1)',
    `meter back to ${auto.meter}, abilityFx ${auto.fxBefore} → ${autoFx}`);

  // ═══ 3. THE BENCH HINTS, AND NEVER LISTS ════════════════════════════════
  console.log('\n3 — the bench says what the stones lean toward, never what they make');
  await tab(page, 'casting');
  await dismiss(page);
  // Melt the loud stone, pour the three rock-facing parts, and put them on the
  // station — all through the real actions, so the lean is read off a bench the
  // player could actually have built.
  const lean = await page.evaluate(async (id) => {
    const w = window as unknown as Record<string, any>;
    const engine = w['__engine'];
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    forge.addMaterial(engine.getState(), id, 60, 60);
    engine.dispatch({ type: 'chargeCrucible', materialId: id, units: 10 });
    // Let it liquefy — the tub is the melt, not a toggle.
    const s = engine.getState();
    for (const c of s.casting.crucible.queue) { c.molten += c.solid; c.solid = 0; }
    const poured: string[] = [];
    for (const t of ['head', 'edge', 'sockets']) {
      const r = engine.dispatch({ type: 'castPart', partType: t });
      if (r.ok) poured.push(t);
    }
    const s2 = engine.getState();
    for (const p of s2.casting.rack) engine.dispatch({ type: 'benchPlace', partId: p.id });
    return { poured, onBench: Object.keys(s2.casting.bench) };
  }, stones.loud);
  check(lean.poured.length === 3, 'three rock-facing parts poured and seated',
    lean.poured.join('+'));
  await page.waitForTimeout(400);

  const leanTxt = await txt(page, '[data-testid="bench-lean-text"]');
  const names = stones.loudNames.map((n) => n.toLowerCase());
  check(leanTxt.length > 0, 'the bench describes the lean of the three stones',
    leanTxt.slice(0, 80));
  check(
    leanTxt.length === 0 || !names.some((n) => leanTxt.toLowerCase().includes(n)),
    'and names no ability — a guess, not a recipe (pillar 5)',
  );
  await shot(page, '5-bench-lean', '[data-testid="bench-lean"]');

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
