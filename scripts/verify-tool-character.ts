/**
 * LIVING MATERIALS, THE BIOGRAPHY AND MASTERWORK, DRIVEN IN THE REAL GAME.
 *
 *  1  A LIVING PART MATURES from real mining and offers its three-way choice;
 *     taking one changes the tool. A dead part never offers anything.
 *  2  THE BIOGRAPHY reads real tracked events — cells, swings, hours, depth,
 *     firings, collapses — and grants nothing.
 *  3  A MASTERWORK ROLL lands its unique bonus, and the stat block does not move.
 *  4  380px, 0 overflow.
 *
 *   npx tsx scripts/verify-tool-character.ts [port] [outDir]
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
  await page.screenshot({ path: `${OUT}/chr-${name}.png` });
  shots.push(`${OUT}/chr-${name}.png`);
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

  const live = await page.evaluate(async () => {
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
    s.casting.mods = [];
    s.casting.bio = undefined;
    s.casting.windup = 0;
    // ASK THE ENGINE which stock is alive — never pin a material id.
    return mats.materialsOfShell('verdance')[0].id as string;
  });
  await page.waitForTimeout(300);
  await tab(page, 'casting');
  await dismiss(page);

  // ═══ 1. A LIVING PART MATURES ═══════════════════════════════════════════
  console.log('\n1 — living stock keeps growing, and offers a choice');

  const dead = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const s = w['__engine'].getState();
    s.casting.tool = cp.PART_TYPES.map((t: string, i: number) => ({
      ...fp.makePart(t, 'marl', 60), id: i + 1,
    }));
    s.casting.wear = 0;
    return s.casting.tool.some((p: any) => fp.isLiving(p));
  });
  await page.waitForTimeout(400);
  check(dead === false, 'a Loam tool has nothing alive in it');
  check(
    await page.locator('[data-testid="tool-living"]').count() === 0,
    'and the card is absent entirely — not an empty promise',
  );

  const grown = await page.evaluate(async (stone) => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const engine = w['__engine'];
    const s = engine.getState();
    s.casting.tool = cp.PART_TYPES.map((t: string, i: number) => ({
      ...fp.makePart(t, stone, 60), id: i + 1,
    }));
    s.casting.wear = 0;
    s.face.cells = s.face.cells.map(() => 8);
    s.face.ore = new Array(s.face.cells.length).fill('');
    s.growth.stage = s.growth.stage.map(() => 0);

    const head = s.casting.tool[0];
    const need = fp.growthNeed(head);
    // MINE FOR IT, through the real chip action — the growth currency is cells
    // that actually gave something up.
    let mined = 0;
    for (let i = 0; i < 400 && (head.growth ?? 0) < need; i++) {
      s.face.cells = s.face.cells.map(() => 8);
      const r = engine.dispatch({ type: 'chip', cell: i % s.face.cells.length });
      if (r.ok) mined++;
    }
    const before = (head.growth ?? 0);
    // Top the rest up rather than clicking four hundred more times.
    head.growth = need;
    return {
      living: fp.isLiving(head),
      need,
      minedBySwinging: before,
      swings: mined,
      ready: fp.growthProgress(head).ready,
    };
  }, live);
  await page.waitForTimeout(500);

  check(grown.living, 'a Verdance tool is alive', `head needs ${grown.need} cells`);
  check(grown.minedBySwinging > 0,
    'and real mining is what grows it',
    `${grown.minedBySwinging} cells from ${grown.swings} swings`);
  check(grown.ready, 'once the work is done it is ready');

  const barText = await txt(page, '[data-testid="living-progress-head"]');
  check(/waiting to be told/.test(barText), 'the tool says it is waiting to be told what to become', barText);
  const choice = await page.locator('[data-testid="living-choice-head"] button').count();
  check(choice === 3, 'and offers exactly three things', `${choice} on the table`);
  await shot(page, '1-ready', '[data-testid="tool-living"]');

  const took = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMining' + '.ts');
    const engine = w['__engine'];
    const s = engine.getState();
    const beforeCells = tm.toolEffect(s).cells;
    const r = engine.dispatch({ type: 'matureLivingPart', partType: 'head', boon: 'reach' });
    const s2 = engine.getState();
    return {
      ok: !!r.ok,
      reason: r.reason ?? '',
      grown: s2.casting.tool[0].grown ?? [],
      beforeCells,
      afterCells: tm.toolEffect(s2).cells,
      fold: fp.growthFold(s2.casting.tool).cells,
      readyAgain: fp.growthProgress(s2.casting.tool[0]).ready,
    };
  });
  await page.waitForTimeout(500);

  check(took.ok, 'taking one works', took.reason);
  check(took.grown.includes('reach'), 'and is recorded on the part', took.grown.join(','));
  check(took.fold > 0, 'and the boon is doing something', `+${took.fold} reach from growth`);
  check(!took.readyAgain, 'the next stage starts from nothing — it does not double-mature');
  const total = await txt(page, '[data-testid="tool-living-total"]');
  check(total.length > 0, 'and the tool says what its growth adds up to', total.slice(0, 70));
  await shot(page, '2-taken', '[data-testid="tool-living"]');

  // ═══ 2. THE BIOGRAPHY ═══════════════════════════════════════════════════
  console.log('\n2 — a history read off real events');

  const bio = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const tb = await import(/* @vite-ignore */ '/src/engine/systems/toolBio' + '.ts');
    const engine = w['__engine'];
    const s = engine.getState();
    tb.startBio(s);
    // MEASURE THE DELTA, not the total. The biography was already accruing from
    // the four hundred swings section 1 mined — `startBio` KEEPS an existing one
    // and counts a rebuild, which is the behaviour, so a total would be wrong.
    const base = tb.readBio(s);
    s.face.cells = s.face.cells.map(() => 8);
    s.face.ore = new Array(s.face.cells.length).fill('');
    let landed = 0;
    for (let i = 0; i < 12; i++) {
      s.face.cells = s.face.cells.map(() => 8);
      if (engine.dispatch({ type: 'chip', cell: i * 2 }).ok) landed++;
    }
    // A collapse and a relic, through the counters the biography derives from.
    s.collapse.count += 2;
    s.relics.found += 3;
    engine.tick(5);
    const read = tb.readBio(engine.getState());
    return {
      landed,
      ...read,
      dSwings: read.swings - (base ? base.swings : 0),
      dCells: read.cells - (base ? base.cells : 0),
    };
  });
  await page.waitForTimeout(500);

  check(bio.dSwings === bio.landed, 'it counted the swings that landed',
    `${bio.dSwings}/${bio.landed} this stretch, ${bio.swings} lifetime`);
  check((bio.dCells ?? 0) >= bio.dSwings, 'and the cells they broke', `${bio.dCells} cells`);
  check((bio.hours ?? 0) > 0, 'and the time it has been in hand');
  check(bio.collapses === 2, 'collapses survived, derived from the counter', `${bio.collapses}`);
  // AT LEAST three: real drops happen while the driver mines, and a relic the
  // tool genuinely turned up belongs in the count.
  check((bio.relics ?? 0) >= 3, 'and relics turned up with it', `${bio.relics}`);
  check((bio.shells ?? []).length > 0, 'and where it has worked', (bio.shells ?? []).join(','));

  const rows = await txt(page, '[data-testid="tool-bio-rows"]');
  check(/Cells broken/.test(rows) && /Collapses survived/.test(rows),
    'and it is all on screen', rows.replace(/\n/g, ' ').slice(0, 90));
  const disclaimer = await txt(page, '[data-testid="tool-bio"]');
  check(/makes it stronger/.test(disclaimer),
    'and the panel says out loud that it grants nothing');
  await shot(page, '3-bio', '[data-testid="tool-bio"]');

  // THE INERTNESS, MEASURED — only the biography's own fields varied.
  const inert = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMining' + '.ts');
    const engine = w['__engine'];
    const s = engine.getState();
    const plain = JSON.stringify(tm.toolEffect(s));
    Object.assign(s.casting.bio, {
      cells: 9_999_999, swings: 500_000, secondsHeld: 400_000, fired: 20_000,
      rebuilds: 40, deepestShell: 'aleph', deepestDepth: 900,
    });
    return { plain, after: JSON.stringify(tm.toolEffect(engine.getState())) };
  });
  check(inert.plain === inert.after,
    'and a nine-million-cell history changes the tool not at all');

  // ═══ 3. MASTERWORK ══════════════════════════════════════════════════════
  console.log('\n3 — a masterwork pour, and what it is worth');

  const mw = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const cast = await import(/* @vite-ignore */ '/src/engine/systems/casting' + '.ts');
    const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMining' + '.ts');
    const engine = w['__engine'];
    const s = engine.getState();

    // The roll, through the real function, enough times to see all four tiers.
    const seen: Record<string, number> = {};
    for (let i = 0; i < 3000; i++) {
      const r = cast.rollCraft();
      seen[r.craft] = (seen[r.craft] ?? 0) + 1;
    }

    // A tool with one Deep-Cut head, and the same tool with a plain one.
    const plainParts = cp.PART_TYPES.map((t: string, i: number) => ({
      ...fp.makePart(t, 'marl', 60), id: i + 1,
    }));
    s.casting.tool = plainParts;
    s.casting.wear = 0;
    s.casting.xp = 0;
    const slotsBefore = tm.modSlotsOf(s, fp.assembleTool(s.casting.tool)).total;
    const statsBefore = JSON.stringify(fp.assembleTool(s.casting.tool).stats);

    s.casting.tool[0].craft = 'masterwork';
    s.casting.tool[0].work = 'roomy';
    const slotsAfter = tm.modSlotsOf(s, fp.assembleTool(s.casting.tool)).total;
    const statsAfter = JSON.stringify(fp.assembleTool(s.casting.tool).stats);
    return { seen, slotsBefore, slotsAfter, statsBefore, statsAfter };
  });
  await page.waitForTimeout(500);

  const tiers = Object.keys(mw.seen);
  check(tiers.length === 4, 'the roll produces all four tiers', tiers.join(','));
  const mwRate = (mw.seen['masterwork'] ?? 0) / 3000;
  check(mwRate > 0 && mwRate < 0.1, 'and a masterwork is rare',
    `${(mwRate * 100).toFixed(1)}% of 3000 pours`);
  check(mw.slotsAfter === mw.slotsBefore + 1,
    'a Deep-Cut head buys one modifier slot', `${mw.slotsBefore} → ${mw.slotsAfter}`);
  check(mw.statsAfter === mw.statsBefore,
    'and the stat block does not move by a hundredth — it is not a bigger number');

  const craftText = await txt(page, '[data-testid="tool-craft"]');
  // innerText returns CSS-transformed text, and the card uppercases the name.
  check(/deep-cut/i.test(craftText), "the tool names what the pour turned out to be",
    craftText.replace(/\n/g, ' ').slice(0, 80));
  check(/none of this is stats/i.test(craftText), "and says plainly that it is not stats");
  await shot(page, '4-masterwork', '[data-testid="tool-craft"]');

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
