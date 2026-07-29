/**
 * CAST SHAPES AND EMERGENT CLASSES, DRIVEN IN THE REAL GAME.
 *
 *  1  THE SAME STONE IN TWO MOULDS mines differently — cast a Needle head and
 *     a Wide head from one material and watch the swing sweep different rock.
 *  2  A BUILD TIPS INTO A CLASS, the tool says which traits tipped it, and the
 *     class unlocks a modifier that could not be made before.
 *  3  A SCATTERED BUILD GETS NO CLASS, says why, and the class modifier it was
 *     carrying goes to sleep rather than vanishing.
 *  4  380px, 0 overflow.
 *
 *   npx tsx scripts/verify-tool-shapes.ts [port] [outDir]
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
  await page.screenshot({ path: `${OUT}/shp-${name}.png` });
  shots.push(`${OUT}/shp-${name}.png`);
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

  await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMining' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const s = w['__engine'].getState();
    for (const id of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      s.depthRecords[id] = 60;
    }
    for (const shell of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      for (const m of mats.materialsOfShell(shell)) forge.addMaterial(s, m.id, 60, 500);
    }
    s.casting.xp = tm.xpForLevel(320);
    s.casting.mods = [];
    s.casting.knownMods = [];
    s.casting.knownClasses = [];
    s.casting.tool = [];
    s.casting.rack = [];
  });
  await page.waitForTimeout(300);
  await tab(page, 'casting');
  await dismiss(page);

  // ═══ 1. THE SAME STONE, TWO MOULDS ══════════════════════════════════════
  console.log('\n1 — the same stone in two moulds mines differently');

  // Pour a Needle head and a Wide head through the REAL casting path.
  const poured = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const engine = w['__engine'];
    const s = engine.getState();
    const out: Array<{ shape: string; ok: boolean; reason: string }> = [];
    for (const shape of ['needle', 'wide']) {
      engine.dispatch({ type: 'chargeCrucible', materialId: 'marl', units: 10 });
      const st = engine.getState();
      for (const ch of st.casting.crucible.queue) { ch.molten += ch.solid; ch.solid = 0; }
      const r = engine.dispatch({ type: 'castPart', partType: 'head', shape });
      out.push({ shape, ok: !!r.ok, reason: r.reason ?? '' });
    }
    const shapes = s.casting.rack.map((p: any) => p.shape);
    return { out, shapes, melt: { needle: 0, wide: 0 } };
  });
  check(poured.out.every((p) => p.ok), 'both moulds pour',
    poured.out.map((p) => `${p.shape}:${p.ok ? 'ok' : p.reason}`).join(' '));
  check(poured.shapes.includes('needle') && poured.shapes.includes('wide'),
    'and the parts remember which mould they came out of', poured.shapes.join(','));
  await shot(page, '1-moulds', '[data-testid="casts"]');

  /**
   * THE CLAIM, MEASURED: build the SAME material into two tools that differ only
   * by the head's mould, and read back which cells one swing actually took
   * charge out of. If those sets match, the axis is decoration.
   */
  const cut = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMining' + '.ts');
    const engine = w['__engine'];
    const s = engine.getState();
    // Object method, not a named const arrow — tsx's keepNames compiles the
    // latter into a __name() call that does not exist in the page.
    const go = {
      swing(head: string) {
        s.casting.tool = cp.PART_TYPES.map((t: string, i: number) => ({
          ...fp.makePart(t, 'marl', 60, t === 'head' ? head : undefined), id: i + 1,
        }));
        s.casting.wear = 0;
        s.face.cells = s.face.cells.map(() => 8);
        s.face.ore = new Array(s.face.cells.length).fill('');
        s.growth.stage = s.growth.stage.map(() => 0);
        const before = s.face.cells.slice();
        engine.dispatch({ type: 'chip', cell: 14 });
        const after = engine.getState().face.cells;
        const hit: number[] = [];
        for (let i = 0; i < before.length; i++) if ((after[i] ?? 0) < before[i] - 1e-9) hit.push(i);
        const e = tm.toolEffect(engine.getState());
        return { hit, pattern: e.pattern, cells: e.cells };
      },
    };
    return { needle: go.swing('needle'), wide: go.swing('wide'), point: go.swing('point') };
  });
  check(cut.needle.hit.length === 1, 'a Needle head takes exactly one cell',
    `${cut.needle.hit.length} cells, pattern ${cut.needle.pattern}`);
  check(cut.wide.hit.length > 1, 'a Wide head takes a footprint',
    `${cut.wide.hit.length} cells, pattern ${cut.wide.pattern}`);
  check(
    cut.wide.hit.join(',') !== cut.point.hit.join(','),
    'and Wide sweeps DIFFERENT rock than Point from the same swing',
    `wide [${cut.wide.hit.join(',')}] vs point [${cut.point.hit.join(',')}]`,
  );

  // ═══ 2. A CLASS EMERGES, AND UNLOCKS SOMETHING ══════════════════════════
  console.log('\n2 — a build tips into a class, and the class opens a door');

  const tipped = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const tc = await import(/* @vite-ignore */ '/src/engine/systems/toolClass' + '.ts');
    const cc = await import(/* @vite-ignore */ '/src/engine/content/toolClasses' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const engine = w['__engine'];
    const s = engine.getState();

    // ASK THE ENGINE which stone tips which class — never hardcode a material
    // id, because the registry moves and a driver that pins one rots silently.
    let found: { stone: string; classId: string } | null = null;
    for (const shell of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      for (const m of mats.materialsOfShell(shell)) {
        const tool = fp.assembleTool(cp.PART_TYPES.map((t: string) => fp.makePart(t, m.id, 60)));
        const read = tc.classOf(tool);
        if (read.def) { found = { stone: m.id, classId: read.def.id }; break; }
      }
      if (found) break;
    }
    if (!found) return null;

    s.casting.tool = cp.PART_TYPES.map((t: string, i: number) => ({
      ...fp.makePart(t, found!.stone, 60), id: i + 1,
    }));
    s.casting.wear = 0;
    s.casting.knownClasses = [];
    const seen: string[] = [];
    tc.noteToolClass(s, { emit(e: any) { if (e.type === 'toolClassFound') seen.push(e.name); }, dirty() {} });
    const read = tc.classOf(fp.assembleTool(s.casting.tool));
    const def = cc.CLASS_BY_ID.get(found.classId);
    return {
      stone: found.stone,
      classId: found.classId,
      className: def.name,
      unlocks: def.unlocks,
      tipped: read.tipped.map((t: any) => `${t.trait}x${t.have}`),
      announced: seen,
      known: s.casting.knownClasses,
    };
  });
  await page.waitForTimeout(400);

  if (!tipped) {
    check(false, 'a single stone tips some class — none did');
  } else {
    check(true, 'a coherent build lands in a class',
      `${tipped.stone} → ${tipped.className}`);
    check(tipped.tipped.length > 0, 'and the tool says what tipped it', tipped.tipped.join(', '));
    check(tipped.announced.length === 1, 'announced once, as a discovery', tipped.announced.join(','));
    check(tipped.known.includes(tipped.classId), 'and recorded');

    const nameOnScreen = await txt(page, '[data-testid="tool-class-name"]');
    check(nameOnScreen.toLowerCase() === tipped.className.toLowerCase(),
      'the panel names it', nameOnScreen);
    const tippedOnScreen = await txt(page, '[data-testid="tool-class-tipped"]');
    check(tippedOnScreen.length > 0, 'and shows what tipped it on screen', tippedOnScreen.slice(0, 70));
    const unlocksOnScreen = await txt(page, '[data-testid="tool-class-unlocks"]');
    check(unlocksOnScreen.length > 0, 'and what only this one can carry',
      unlocksOnScreen.replace(/\n/g, ' ').slice(0, 70));
    await shot(page, '2-class', '[data-testid="tool-class"]');

    // THE LOCK IS REAL: the class modifier can be made now, and could not before.
    const lock = await page.evaluate(async (classId) => {
      const cm = await import(/* @vite-ignore */ '/src/engine/content/toolMods' + '.ts');
      const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
      const target = cm.TOOL_MODS.find((m: any) => m.classOnly === classId);
      const pool: string[] = [];
      for (const shell of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
        for (const m of mats.materialsOfShell(shell)) pool.push(m.id);
      }
      let withClass = false, withoutClass = false;
      for (const a of pool) {
        for (const b of pool) {
          const mix = [a, a, b];
          if (cm.matchToolMod(mix, { reached: 7, classId, prefer: target.id })?.id === target.id) withClass = true;
          if (cm.matchToolMod(mix, { reached: 7, classId: null, prefer: target.id })?.id === target.id) withoutClass = true;
        }
        if (withClass && withoutClass) break;
      }
      return { id: target.id, name: target.name, withClass, withoutClass };
    }, tipped.classId);
    check(lock.withClass, `${lock.name} becomes makeable in class`);
    check(!lock.withoutClass, 'and is unmakeable without it — the lock is real');
  }

  // ═══ 3. A SCATTERED BUILD GETS NOTHING ══════════════════════════════════
  console.log('\n3 — a scattered build is not a thing, and says so');
  const scattered = await page.evaluate(async (classId: string | null) => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const tc = await import(/* @vite-ignore */ '/src/engine/systems/toolClass' + '.ts');
    const tmods = await import(/* @vite-ignore */ '/src/engine/systems/toolMods' + '.ts');
    const cm = await import(/* @vite-ignore */ '/src/engine/content/toolMods' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const engine = w['__engine'];
    const s = engine.getState();

    // One part from each shell — the definition of not belonging together.
    const spread = ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']
      .map((sh) => mats.materialsOfShell(sh)[0].id);
    // Keep the class modifier ON the tool across the rebuild.
    const target = classId ? cm.TOOL_MODS.find((m: any) => m.classOnly === classId) : null;
    if (target) {
      s.casting.mods = [{ id: target.id, n: 1, xp: 0 }];
      s.casting.knownMods = [target.id];
    }
    s.casting.tool = cp.PART_TYPES.map((t: string, i: number) => ({
      ...fp.makePart(t, spread[i % spread.length], 60), id: i + 1,
    }));
    s.casting.wear = 0;
    const read = tc.classOf(fp.assembleTool(s.casting.tool));
    const cache = tmods.modCache(s, 0);
    return {
      hasClass: !!read.def,
      why: read.why ?? '',
      coherence: read.coherence,
      dormant: cache.dormant,
      stillOnTool: s.casting.mods.map((m: any) => m.id),
      modId: target ? target.id : null,
      why2: target ? tmods.whyDormant(s, target, 0) : null,
    };
  }, tipped ? tipped.classId : null);
  await page.waitForTimeout(400);

  check(!scattered.hasClass, 'seven shells in one tool is not a class',
    `coherence ${scattered.coherence.toFixed(2)}`);
  check(/belong together/.test(scattered.why), 'and the tool says why', scattered.why.slice(0, 70));
  const noneOnScreen = await txt(page, '[data-testid="tool-class-none"]');
  check(noneOnScreen.length > 0, 'on screen too', noneOnScreen.slice(0, 70));
  if (scattered.modId) {
    check(scattered.dormant.includes(scattered.modId),
      'the class modifier it was carrying goes to SLEEP', scattered.modId);
    check(scattered.stillOnTool.includes(scattered.modId),
      'and is not taken away — the materials are not confiscated');
    check(!!scattered.why2 && /not one right now/.test(scattered.why2),
      'and it says exactly why', scattered.why2 ?? '');
  }
  await shot(page, '3-scattered', '[data-testid="tool-class"]');

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
