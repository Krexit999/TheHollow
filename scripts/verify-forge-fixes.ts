/**
 * THE CASTING FLOOR FIX PASS — nine claims, driven in the real game.
 *
 *   npx tsx scripts/verify-forge-fixes.ts [port] [outDir]
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
  await page.screenshot({ path: `${OUT}/fix-${name}.png` });
  shots.push(`${OUT}/fix-${name}.png`);
}
const txt = async (page: Page, sel: string): Promise<string> =>
  (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

/** Fit a tool of one material through the live engine. */
async function fit(page: Page, materialId: string | null): Promise<void> {
  await page.evaluate(async ({ id }) => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const s = w['__engine'].getState();
    s.casting.tool = id === null
      ? []
      : cp.PART_TYPES.map((t: string, i: number) => ({ ...fp.makePart(t, id, 60), id: i + 1 }));
    s.casting.wear = 0;
  }, { id: materialId });
  await page.waitForTimeout(250);
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
  await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const s = w['__engine'].getState();
    for (const id of ['marl', 'graveclay', 'umberjade', 'lodestone', 'firstiron']) {
      forge.addMaterial(s, id, 60, 120);
    }
  });
  await tab(page, 'casting');
  await dismiss(page);

  // ═══ 1. DURABILITY LASTS ════════════════════════════════════════════════
  console.log('\n1 — durability lasts much longer');
  const uses = await page.evaluate(async () => {
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMining' + '.ts');
    // NO NAMED ARROW CONSTS IN HERE. tsx compiles `const f = () => …` to a
    // `__name(f, 'f')` call that does not exist in the page, and the whole
    // evaluate dies with "__name is not defined". Object-method shorthand is
    // safe; so is inlining, which is what this does.
    const make = {
      of(id: string) {
        return fp.assembleTool(cp.PART_TYPES.map((t: string) => fp.makePart(t, id, 60)));
      },
    };
    return {
      brittle: tm.usesOf(make.of('umberjade')),
      tough: tm.usesOf(make.of('graveclay')),
      plain: tm.usesOf(make.of('marl')),
    };
  });
  console.log(`    brittle ${uses.brittle} · plain ${uses.plain} · tough ${uses.tough} swings`);
  check(uses.brittle > 1200, 'even the most brittle build goes over a thousand swings', `${uses.brittle}`);
  check(uses.tough > 4000, 'and a tough one goes several thousand', `${uses.tough}`);
  check(uses.tough / uses.brittle > 1.8,
    'the brittle-vs-tough tradeoff survived the change',
    `${(uses.tough / uses.brittle).toFixed(2)}x`);

  // ═══ 2. MELT PARTS BACK ═════════════════════════════════════════════════
  console.log('\n2 — melt a part back at 60%');
  await fit(page, null);
  const cast = async (mat: string, type: string): Promise<void> => {
    await page.evaluate(({ id }) => {
      const e = (window as unknown as Record<string, any>)['__engine'];
      e.dispatch({ type: 'drainCrucible' });
      e.dispatch({ type: 'chargeCrucible', materialId: id, units: 4 });
    }, { id: mat });
    await page.waitForTimeout(900);
    // The disclosure gate re-opens as rooms unlock mid-run and swallows every
    // click until it is closed. Cheap to re-check; expensive to forget.
    await dismiss(page);
    await page.locator(`[data-testid="cast-${type}"]`).click();
    await page.waitForTimeout(150);
  };
  await cast('marl', 'head');
  await page.evaluate(() =>
    (window as unknown as Record<string, any>)['__engine'].dispatch({ type: 'drainCrucible' }));
  await page.waitForTimeout(250);

  await page.locator('[data-testid="rack-mode-melt"]').click();
  await page.waitForTimeout(150);
  const rackTile = page.locator('[data-testid="rack-grid"] > button').first();
  await rackTile.click();
  await page.waitForTimeout(300);
  const meltNote = await txt(page, '[data-testid="rack-note"]');
  const back = await page.evaluate(() =>
    (window as unknown as Record<string, any>)['__engine'].getState().casting.crucible.molten);
  console.log(`    ${meltNote}  (tub now ${back})`);
  check(Math.abs(back - 8 * 0.6) < 0.05, 'a Head (8 melt) came back as 4.8 — 60%', `${back}`);
  check(await page.locator('[data-testid="rack-grid"] > button').count() === 0,
    'and it left the rack');

  // ═══ 3. THE RACK IS AN INVENTORY GRID ═══════════════════════════════════
  console.log('\n3 — the rack is a scannable grid');
  await page.evaluate(() =>
    (window as unknown as Record<string, any>)['__engine'].dispatch({ type: 'drainCrucible' }));
  for (const [mat, type] of [
    ['marl', 'head'], ['marl', 'core'], ['graveclay', 'edge'], ['graveclay', 'binding'],
    ['umberjade', 'handle'], ['umberjade', 'grip'], ['lodestone', 'sockets'], ['lodestone', 'head'],
    ['firstiron', 'core'], ['firstiron', 'edge'],
  ] as Array<[string, string]>) {
    await cast(mat, type);
  }
  await page.locator('[data-testid="rack-mode-set"]').click();
  await page.waitForTimeout(200);
  const grid = page.locator('[data-testid="rack-grid"]');
  check(await grid.count() === 1, 'the rack is a grid, not a list');
  const cols = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="rack-grid"]');
    return el ? getComputedStyle(el).gridTemplateColumns.split(' ').length : 0;
  });
  check(cols >= 4, 'laid out in columns, so it scales', `${cols} columns`);
  const tiles = await page.locator('[data-testid="rack-grid"] > button').count();
  console.log(`    ${tiles} parts on the rack, ${cols} across`);
  check(tiles >= 10, 'and holds ten parts without becoming a scroll', `${tiles}`);
  check(await page.locator('[data-testid="rack-filter-all"]').count() === 1,
    'with filters by shape once there is more than one kind');
  await shot(page, '1-rack-grid', '[data-testid="rack"]');

  // ═══ 4. THE CRUCIBLE WEARS THE MATERIAL'S COLOUR ════════════════════════
  console.log('\n4 — the melt looks like the stone');
  const colourOf = async (mat: string): Promise<string> => {
    await page.evaluate(({ id }) => {
      const e = (window as unknown as Record<string, any>)['__engine'];
      e.dispatch({ type: 'drainCrucible' });
      e.dispatch({ type: 'chargeCrucible', materialId: id, units: 4 });
    }, { id: mat });
    await page.waitForTimeout(900);
    return page.evaluate(() => {
      const el = document.querySelector('[data-testid="tub-molten"]') as HTMLElement | null;
      return el ? getComputedStyle(el).backgroundImage : '';
    });
  };
  const marlBg = await colourOf('marl');
  const fireBg = await colourOf('firstiron');
  const palettes = await page.evaluate(async () => {
    const m = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    return { marl: m.materialDef('marl').palette, firstiron: m.materialDef('firstiron').palette };
  });
  console.log(`    marl palette ${palettes.marl.join(' ')}`);
  console.log(`    marl tub     ${marlBg.slice(0, 90)}`);
  const hasPalette = (bg: string, pal: string[]): boolean =>
    pal.every((c) => bg.toLowerCase().includes(hexToRgb(c)));
  check(hasPalette(marlBg, palettes.marl),
    "the tub is painted from the material's own three shades");
  check(marlBg !== fireBg, 'and a different stone melts a different colour');
  check(await page.locator('[data-testid="crucible"] canvas').count() === 0,
    'still no canvas anywhere near it');
  await shot(page, '2-crucible-colour', '[data-testid="crucible"]');

  // ═══ 5/6. NUMBERS AND STATS ═════════════════════════════════════════════
  console.log('\n5+6 — formatted numbers, and stats with context');
  await fit(page, 'firstiron');
  await tab(page, 'casting');
  await dismiss(page);
  const toolText = await txt(page, '[data-testid="your-tool"]');
  const longRuns = toolText.match(/\d{7,}/g) ?? [];
  const sci = toolText.match(/\d\.\d+e\+?\d+/g) ?? [];
  console.log(`    digit-runs of 7+: ${longRuns.length}  raw exponentials: ${sci.length}`);
  check(longRuns.length === 0, 'no raw digit soup on screen',
    longRuns.slice(0, 3).join(', ') || 'none');
  check(await page.locator('[data-testid="face-reach"]').count() === 1,
    'the headline is what the tool DOES, with a bar and a word');
  const reach = await txt(page, '[data-testid="face-reach"]');
  console.log(`    ${reach}`);
  check(/weak|fair|good|strong|exceptional/i.test(reach),
    'rated in words, not just a number', reach);
  const rawShown = await page.locator('[data-testid="tool-stats"]').isVisible().catch(() => false);
  check(!rawShown, 'and the twelve-number wall is folded away by default');
  await shot(page, '3-stats-context', '[data-testid="your-tool"]');

  // ═══ 7. COHERENCE SHOWS THE FIX ═════════════════════════════════════════
  console.log('\n7 — coherence names the lever');
  await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const s = w['__engine'].getState();
    const MIX: Array<[string, string]> = [
      ['head', 'firstiron'], ['core', 'lacuna'], ['edge', 'coronaite'],
      ['binding', 'starlens'], ['handle', 'wildstar'], ['grip', 'polestar'],
      ['sockets', 'starmarl'],
    ];
    s.casting.tool = MIX.map(([t, m], i) => ({ ...fp.makePart(t, m, 70), id: 500 + i }));
    s.casting.wear = 0;
  });
  await page.waitForTimeout(400);
  const fixLine = await txt(page, '[data-testid="tool-coherence-fix"]');
  console.log(`    ${fixLine}`);
  check(fixLine.length > 0, 'there is a "how to fix it" line at all');
  check(/To raise it/.test(fixLine), 'it leads with the lever, not the diagnosis');
  check(/Re-cast/.test(fixLine) && /stock/.test(fixLine),
    'and says the actual action', fixLine.slice(0, 60));
  check(/trueseated/.test(fixLine), 'plus the other way out');
  await shot(page, '4-coherence-fix', '[data-testid="tool-coherence"]');

  // A matched set says so instead of scolding.
  await fit(page, 'marl');
  await page.waitForTimeout(400);
  const goodLine = await txt(page, '[data-testid="tool-coherence-fix"]');
  console.log(`    matched: ${goodLine}`);
  check(/one world sit together|as well-matched/.test(goodLine),
    'and a matched set is told it is matched', goodLine.slice(0, 50));

  // ═══ 8. THE DRILL FINISHES ITS ORE ══════════════════════════════════════
  console.log('\n8 — a drill finishes the pocket it started');
  const lock = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const d = await import(/* @vite-ignore */ '/src/engine/systems/drills' + '.ts');
    const e = w['__engine'];
    const s = e.getState();
    s.drills.bayBuilt = true;
    s.drills.units.length = 0;
    const u = d.newDrill('Lock');
    u.priority = 'oresFirst';
    s.drills.units.push(u);
    s.face.cells = s.face.cells.map(() => 8);
    s.face.ore = new Array(s.face.cells.length).fill('');
    s.face.oreDug = new Array(s.face.cells.length).fill(0);
    s.face.ore[5] = 'fatseam';
    s.face.cells[5] = 900;

    e.dispatch({ type: 'debug', op: 'warp', seconds: 1 });
    const claimed = u.oreCell;
    // Dangle a fatter pocket next door for the whole dig.
    s.face.ore[20] = 'fatseam';
    s.face.cells[20] = 5000;
    /**
     * SAMPLE FINER THAN THE THING YOU ARE WATCHING. The first cut warped 0.5s
     * per sample and reported the drill "wandering" to cell 20 — but half a
     * second is several engine steps, long enough to FINISH cell 5 and claim
     * the next pocket inside one sample. It was measuring its own resolution.
     *
     * 0.1s is the engine's own step, and the claim is checked at the exact
     * moment the target changes: was the old pocket done, or abandoned?
     */
    let ticks = 0;
    let leftAt: number | null = null;
    let doneWhenItLeft = false;
    for (let t = 0; t < 2000; t++) {
      e.dispatch({ type: 'debug', op: 'warp', seconds: 0.1 });
      if (u.oreCell !== claimed) {
        leftAt = u.oreCell ?? -1;
        doneWhenItLeft = !s.face.ore[claimed as number];
        break;
      }
      ticks++;
    }
    return { claimed, ticks, leftAt, doneWhenItLeft, progress: u.oreProgress ?? 0 };
  });
  console.log(`    claimed cell ${lock.claimed}, worked it for ${lock.ticks} steps, then → ${lock.leftAt}`);
  check(lock.claimed === 5, 'it took the pocket', `cell ${lock.claimed}`);
  check(lock.ticks > 5, 'and stayed on it for real time', `${lock.ticks} steps`);
  check(lock.doneWhenItLeft,
    'when it finally let go, the pocket was FINISHED — not abandoned for the fatter one',
    lock.doneWhenItLeft ? 'cell 5 was fully mined' : 'cell 5 was still there');

  // ═══ 9. THE OLD FORGE HAS NO TOOL CRAFTING ══════════════════════════════
  console.log('\n9 — the old Forge no longer crafts tools');
  await tab(page, 'forge');
  await dismiss(page);
  const forgeText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check(!/Quick patterns/.test(forgeText), 'the fixed recipes are gone');
  check(!/Deeper patterns/.test(forgeText), 'the locked-tier preview is gone');
  check(!/The bench/i.test(forgeText) || !/Forge it/i.test(forgeText), 'the part bench is gone');
  check(await page.locator('[data-testid="crafting-moved"]').count() === 1,
    'and it says where crafting went');
  const stillThere = ['Salvage', 'Gear', 'alloy'].filter((s) => new RegExp(s, 'i').test(forgeText));
  console.log(`    what the room kept: ${stillThere.join(', ')}`);
  check(stillThere.length >= 2, 'while keeping what it still does', stillThere.join(', '));
  await shot(page, '5-old-forge', '[data-testid="crafting-moved"]');

  // A cast tool must still answer the walls the old bench used to.
  await fit(page, 'marl');
  const tier = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMining' + '.ts');
    return tm.castingToolTier(w['__engine'].getState());
  });
  console.log(`    a cast Loam tool is worth Tier ${tier} at the hardness wall`);
  check(tier >= 1, 'a cast tool answers the hardness walls — no bricked save', `Tier ${tier}`);

  // ═══ THE FRAME ══════════════════════════════════════════════════════════
  console.log('\nthe frame');
  for (const room of ['casting', 'forge', 'dig']) {
    await tab(page, room);
    await dismiss(page);
    const px = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    check(px === 0, `no horizontal overflow at ${W}px — ${room}`, `${px}px`);
  }

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

/** '#8a7f70' -> 'rgb(138, 127, 112)', the form getComputedStyle returns. */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

main().catch((e) => { console.error(e); process.exit(1); });
