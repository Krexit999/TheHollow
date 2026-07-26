/**
 * A.53 — THE BAY REVERT + DRILL ALLOYS, driven in the real UI.
 *
 * Six checks the brief asked to SEE, not to infer from tests:
 *   1  drills auto-mine with NO config screen (the revert landed)
 *   2  forging an alloy from materials grants an ability
 *   3  the ARC visibly arcs across grid cells when a drill hits
 *   4  the CALL changes what drops, and the SET persists on mined cells
 *   5  a trait HINT before discovery, the ability SHOWN after
 *   6  an idle player with no alloy still mines fine
 * plus the standing REACH check, past Loam.
 *
 * The three grid effects are drawn on the Pixi face, so those checks read the
 * live renderer's own state — the arcs it is currently drawing, and the bands
 * it has committed to each tile — rather than trusting that an event fired.
 *
 *   npx tsx scripts/verify-alloys.ts [port] [outDir]
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

/** innerText returns RENDERED text, so `uppercase` classes come back shouting. */
const text = async (page: Page): Promise<string> =>
  (await page.locator('body').innerText()).replace(/\s+/g, ' ');
const has = (t: string, s: string): boolean => t.toLowerCase().includes(s.toLowerCase());

const bay = async (page: Page) =>
  page.evaluate(async () => {
    const a = await import(/* @vite-ignore */ '/src/engine/systems/drillAlloys' + '.ts');
    const s = (window as unknown as Record<string, any>)['__engine'].getState();
    return {
      drills: s.drills.units.length,
      alloys: s.drills.alloys as string[],
      equipped: s.drills.equipped as string | null,
      ability: a.equippedAbility(s)?.name ?? null,
      dust: s.totals['dust']?.toNumber() ?? 0,
      drops: s.materials.totalDrops as number,
      strikes: s.stats.drillStrikes as number,
      shell: s.shell.current as string,
      // Per-drill keys — the revert's own assertion: nothing to configure.
      unitKeys: [...new Set(s.drills.units.flatMap((u: object) => Object.keys(u)))].sort(),
    };
  });

/** What the LIVE renderer is drawing right now. */
const faceFx = async (page: Page) =>
  page.evaluate(() => {
    const v = (window as unknown as Record<string, any>)['__faceView'];
    if (!v) return null;
    return {
      arcs: v['chainArcs'].length as number,
      setTiles: v['tiles'].filter((t: { setBand: number }) => t.setBand > 0).length as number,
      callTiles: v['tiles'].filter((t: { callBand: number }) => t.callBand > 0).length as number,
      look: v['drillSprites'][0]?.look ?? null,
    };
  });

async function press(page: Page, name: RegExp): Promise<boolean> {
  await dismiss(page);
  const b = page.getByRole('button', { name }).first();
  if ((await b.count()) === 0 || (await b.isDisabled().catch(() => true))) return false;
  await b.click({ timeout: 5000 }).catch(() => {});
  return true;
}

async function shot(page: Page, name: string, anchor?: string): Promise<void> {
  // A gate modal over the bottom half is how an earlier pass "found" three
  // missing labels that were on screen the whole time. Clear it every shot.
  await dismiss(page);
  if (anchor) {
    await page.evaluate((a) => {
      const target = Array.from(document.querySelectorAll('div')).find((d) => d.textContent?.startsWith(a));
      const box = target?.closest('.overflow-y-auto') as HTMLElement | null;
      if (box && target) box.scrollTop = (target as HTMLElement).offsetTop - box.offsetTop - 8;
    }, anchor);
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: `${OUT}/alloy-${name}.png` });
  shots.push(`${OUT}/alloy-${name}.png`);
}

async function overflow(page: Page, name: string): Promise<void> {
  const px = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(px === 0, `${name}: no horizontal overflow at ${W}px`, `${px}px`);
}

/** Run the bay hard for a while, refilling the face, and keep the view live. */
async function mine(page: Page, seconds: number): Promise<void> {
  await page.evaluate((sec) => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    s.face.cells = s.face.cells.map(() => 8);
    w['__engine'].dispatch({ type: 'debug', op: 'warp', seconds: sec });
  }, seconds);
  await page.waitForTimeout(500);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  // The three grid effects are motion. Say so explicitly rather than trusting
  // the headless default — a `reduce` preference silently skips the arc.
  const page = await browser.newPage({ viewport: { width: W, height: H }, reducedMotion: 'no-preference' });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[console] ${m.text().slice(0, 200)}`); });

  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    const d = await import(/* @vite-ignore */ '/src/engine/systems/drills' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const dec = await import(/* @vite-ignore */ '/src/engine/decimal' + '.ts');
    const w = window as unknown as Record<string, unknown>;
    w['__D'] = dec.D;
    w['__mkDrill'] = (s: never, n: number) => {
      for (let i = 0; i < n; i++) {
        (s as unknown as { drills: { units: unknown[] } }).drills.units.push(d.newDrill(`D${i}`));
      }
    };
    w['__give'] = (s: never, id: string, n: number) => forge.addMaterial(s, id, 70, n);
  });

  // === 1. THE REVERT: drills auto-mine, no config screen ==================
  console.log('\n1 — the bay is furniture again');
  await setup(page, `
    const st = engine.getState();
    st.drills.bayBuilt = true;
    st.forge.built = true;
    st.depth = 40;
    st.currencies['brick'] = window.__D(50000);
    st.currencies['dust'] = window.__D(50000);
    window.__mkDrill(st, 4);
  `);
  await dismiss(page);
  await tab(page, 'drills');
  await dismiss(page);
  await page.waitForTimeout(1200);
  await dismiss(page);

  const t1 = await text(page);
  const b1 = await bay(page);
  check(b1.unitKeys.join(',') === 'lastCell,level,name,timer,use',
    'a drill carries nothing to configure', b1.unitKeys.join(','));
  for (const gone of ['Drill head', 'Drill bit', 'The feed', 'The seam', 'Re-cut', 'Repair', 'Browning out', 'fit ×']) {
    check(!has(t1, gone), `gone from the panel: "${gone}"`);
  }
  check((await page.locator('section select, section [role="combobox"]').count()) === 0,
    'no selects left in the room — nothing to fiddle with');
  check(has(t1, 'The bay') && has(t1, 'drills'), 'the panel is a bay summary');
  check(has(t1, 'none fitted'), 'and says the alloy slot is empty');
  const before1 = b1.dust;
  await mine(page, 30);
  const b1b = await bay(page);
  check(b1b.dust > before1 && b1b.strikes > 0, 'and it mines with nothing configured at all',
    `${b1b.strikes} strikes, ${(b1b.dust - before1).toFixed(0)} dust`);
  // Shot last: the reveal gate re-opens per batch, so give it time to run dry.
  await dismiss(page);
  await page.waitForTimeout(800);
  await shot(page, '1-bay', 'The bay');

  // === 5a. THE HINT, BEFORE DISCOVERY =====================================
  console.log('\n5a — a trait hint before the discovery');
  await setup(page, `
    const st = engine.getState();
    window.__give(st, 'rootglass', 20);
    window.__give(st, 'umberjade', 20);
    window.__give(st, 'chthonite', 20);
    window.__give(st, 'temperash', 20);
    window.__give(st, 'graveclay', 20);
    window.__give(st, 'duskflint', 20);
  `);
  await tab(page, 'forge');
  await dismiss(page);
  await page.waitForTimeout(1000);
  const tf = await text(page);
  check(has(tf, 'Drill alloys'), 'the alloy bench is at the Forge');
  check(has(tf, 'Nobody wrote down which mixes make what'), 'and says the recipes are not written down');
  check(has(tf, 'charged') || has(tf, 'dense') || has(tf, 'warm'),
    'the materials show their TRAITS — the clue is on the card');
  for (const name of ['Arcvein', 'Lodecall', 'Emberset']) {
    check(!has(tf, name), `PILLAR 5: "${name}" is not listed before it is made`);
  }

  await press(page, /^Rootglass/);
  await press(page, /^Umberjade/);
  await page.waitForTimeout(400);
  const tHint = await text(page);
  check(has(tHint, 'looking for somewhere to jump'), 'picking two charged materials HINTS at what the mix wants');
  for (const name of ['Arcvein', 'Lodecall', 'Emberset']) {
    check(!has(tHint, name), `and still does not name it ("${name}")`);
  }
  await shot(page, '2-hint', 'Drill alloys');

  // === 2 + 5b. POUR IT: the ability is granted and SHOWN ==================
  console.log('\n2 — pouring an alloy grants an ability, and names it');
  await press(page, /^Pour the alloy/);
  await page.waitForTimeout(700);
  const b2 = await bay(page);
  const t2 = await text(page);
  check(b2.alloys.includes('arcvein'), 'the pour made something', b2.alloys.join(','));
  check(b2.equipped === 'arcvein' && b2.ability === 'Arcvein', 'and it fitted itself', b2.ability ?? 'none');
  check(has(t2, 'Arcvein'), 'the ability is NAMED after the make');
  check(has(t2, 'jumps to neighbouring cells'), 'and says exactly what it does');
  await shot(page, '3-made', 'Drill alloys');

  // === 3. THE ARC, VISIBLY ================================================
  console.log('\n3 — the arc, drawn on the grid');
  await tab(page, 'dig');
  await dismiss(page);
  await page.waitForTimeout(900);
  const fx0 = await faceFx(page);
  check(fx0 !== null, 'the face renderer is reachable');
  check(fx0?.look === 'arcvein', 'every drill visibly wears the alloy', fx0?.look ?? 'none');

  // Strike with the arc fitted and watch the renderer's own arc list.
  const arcSeen = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const v = w['__faceView'];
    const s = w['__engine'].getState();
    let peak = 0;
    for (let i = 0; i < 40; i++) {
      s.face.cells = s.face.cells.map(() => 8);
      w['__engine'].dispatch({ type: 'debug', op: 'warp', seconds: 3 });
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      peak = Math.max(peak, v['chainArcs'].length);
    }
    return peak;
  });
  check(arcSeen > 0, 'the renderer is drawing arcs between cells', `${arcSeen} live at peak`);
  await shot(page, '4-arc');

  // ...and it is the ALLOY that draws them.
  await page.evaluate(() => {
    (window as unknown as Record<string, any>)['__engine'].dispatch({ type: 'equipDrillAlloy', id: null });
  });
  const arcNone = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const v = w['__faceView'];
    const s = w['__engine'].getState();
    // Let anything still fading clear first.
    await new Promise((r) => setTimeout(r, 1200));
    let peak = 0;
    for (let i = 0; i < 40; i++) {
      s.face.cells = s.face.cells.map(() => 8);
      w['__engine'].dispatch({ type: 'debug', op: 'warp', seconds: 3 });
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      peak = Math.max(peak, v['chainArcs'].length);
    }
    return peak;
  });
  check(arcNone === 0, 'and it stops the moment the alloy comes out', `${arcNone} arcs with no alloy`);

  // === 4. THE SET and THE CALL, on the tiles ==============================
  console.log('\n4 — the set persists on mined rock, and the call changes drops');
  await setup(page, `
    const st = engine.getState();
    st.drills.alloys = ['arcvein', 'emberset', 'lodecall'];
  `);
  await page.evaluate(() => {
    (window as unknown as Record<string, any>)['__engine'].dispatch({ type: 'equipDrillAlloy', id: 'emberset' });
  });
  await mine(page, 12);
  const fxSet = await faceFx(page);
  check((fxSet?.setTiles ?? 0) > 0, 'THE SET leaves a visible mark on worked cells',
    `${fxSet?.setTiles} tiles still hot`);
  check(fxSet?.look === 'emberset', 'and the drills re-livery to it', fxSet?.look ?? 'none');
  await shot(page, '5-set');

  // It COOLS — a mark that never fades is a stain, not a mechanic.
  const cooled = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    s.drills.units = [];               // stop working it
    w['__engine'].dispatch({ type: 'debug', op: 'warp', seconds: 30 });
    await new Promise((r) => setTimeout(r, 900));
    return w['__faceView']['tiles'].filter((t: { setBand: number }) => t.setBand > 0).length;
  });
  check(cooled === 0, 'and it cools back off when the drills stop', `${cooled} still hot`);

  await setup(page, `
    const st = engine.getState();
    window.__mkDrill(st, 4);
  `);
  await page.evaluate(() => {
    (window as unknown as Record<string, any>)['__engine'].dispatch({ type: 'equipDrillAlloy', id: 'lodecall' });
  });
  await mine(page, 10);
  const fxCall = await faceFx(page);
  check((fxCall?.callTiles ?? 0) > 0, 'THE CALL shows ore gathering under worked cells',
    `${fxCall?.callTiles} tiles gathering`);
  await shot(page, '6-call');

  // The call's actual effect: it rolls the drop table DEEPER on a full cell.
  const deeper = await page.evaluate(async () => {
    const a = await import(/* @vite-ignore */ '/src/engine/systems/drillAlloys' + '.ts');
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    s.drills.richness = new Array(s.face.cells.length).fill(0);
    const bare = a.attractDepthBonus(s, 0);
    for (let i = 0; i < 8; i++) a.markRichness(s, 0);
    return { bare, gathered: a.attractDepthBonus(s, 0) };
  });
  check(deeper.bare === 0 && deeper.gathered > 0,
    'and a gathered cell rolls its drop as if the seam were deeper',
    `+${deeper.gathered} depth on the roll`);

  // === 6. THE IDLE PLAYER =================================================
  console.log('\n6 — no alloy, still mining');
  await setup(page, `
    const st = engine.getState();
    st.drills.alloys = [];
    st.drills.equipped = null;
    st.drills.units = [];
    window.__mkDrill(st, 6);
    st.currencies['dust'] = window.__D(0);
  `);
  await page.waitForTimeout(700);
  const i0 = await bay(page);
  check(i0.equipped === null && i0.alloys.length === 0, 'nothing forged, nothing fitted');
  await mine(page, 60);
  const i1 = await bay(page);
  check(i1.dust > i0.dust, 'a bay with no alloy earns perfectly well',
    `${(i1.dust - i0.dust).toFixed(0)} dust`);
  await tab(page, 'drills');
  await dismiss(page);
  await page.waitForTimeout(700);
  check(has(await text(page), 'a bare bay mines perfectly well'), 'and the panel says so, rather than nagging');
  await overflow(page, 'bay');
  await shot(page, '8-bare', 'The alloy');

  // === REACH — past Loam ==================================================
  console.log('\nREACH — the bench past the shell it was built in');
  await setup(page, `
    const st = engine.getState();
    st.shell.current = 'ferrite';
    st.shell.breachCount = 1;
    st.depthRecords['loam'] = 480;
    st.depth = 90;
    st.drills.alloys = [];
    st.drills.equipped = null;
    st.currencies['brick'] = window.__D(0);
    st.currencies['dust'] = window.__D(0);
    st.currencies['flux'] = window.__D(50000);
    window.__give(st, 'voltgland', 10);
    window.__give(st, 'magnetheart', 10);
  `);
  await dismiss(page);
  await tab(page, 'forge');
  await dismiss(page);
  await page.waitForTimeout(1000);
  const r0 = await bay(page);
  check(r0.shell === 'ferrite', 'standing past Loam', r0.shell);
  await press(page, /^Voltgland/);
  await press(page, /^Magnetheart/);
  await page.waitForTimeout(400);
  const tR = await text(page);
  check(has(tR, 'looking for somewhere to jump'), 'the hint reads this shell\'s materials too');
  check(has(tR, 'Flux'), 'and the pour is priced in THIS shell\'s coin');
  await press(page, /^Pour the alloy/);
  await page.waitForTimeout(700);
  const r1 = await bay(page);
  check(r1.alloys.length > 0 && r1.equipped !== null,
    'the bench works past Loam — not a dead panel', r1.ability ?? 'none');
  await overflow(page, 'reach');
  await shot(page, '7-reach', 'Drill alloys');

  await browser.close();
  console.log(`\nshots:\n  ${shots.join('\n  ')}`);
  console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n  ${problems.join('\n  ')}` : '\nALL CHECKS PASS');
  process.exit(problems.length ? 1 : 0);
}
main();
