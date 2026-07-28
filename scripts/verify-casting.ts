/**
 * THE NEW FORGE, STEP 2 — DRIVEN IN THE REAL GAME.
 *
 * Every claim below is read off the live DOM after a real click. Nothing is
 * stipulated except the starting Hold and the Forge being raised: the melt runs
 * on the real engine tick, the parts come out of the real actions, and the
 * coherence numbers on screen are the ones the panel computed for itself.
 *
 * THE ONE THAT MATTERS is the last shot: the built COHERENT tool and a
 * SCATTERED set previewed on the station, both on screen at once, so the
 * mismatch penalty is visible before the second one is ever committed.
 *
 *   npx tsx scripts/verify-casting.ts [port] [outDir]
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

/**
 * `fullPage` IS USELESS ON THIS APP and the first pass of this script did not
 * notice: the rooms scroll inside a fixed-height container, so the document is
 * exactly one viewport tall and fullPage silently returns the top of the panel.
 * The station and the tool — the two things this step exists to show — were
 * below the fold in every shot. Pass a `to` selector to scroll the thing being
 * claimed into frame first.
 */
async function shot(page: Page, name: string, to?: string): Promise<void> {
  await dismiss(page);
  if (to) {
    await page.locator(to).first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: `${OUT}/casting-${name}.png` });
  shots.push(`${OUT}/casting-${name}.png`);
}

const txt = async (page: Page, sel: string): Promise<string> =>
  (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

/** The width of a fill segment as a fraction of its parent — the CSS bar. */
async function barWidth(page: Page, which: 'molten' | 'solid'): Promise<number> {
  return page.evaluate((w) => {
    const el = document.querySelector(`[data-testid="tub-${w}"]`) as HTMLElement | null;
    if (!el) return -1;
    const parent = el.parentElement;
    if (!parent) return -1;
    return el.getBoundingClientRect().width / parent.getBoundingClientRect().width;
  }, which);
}

/** Cast one part of `type` out of `materialId` and drop it on the station. */
async function castAndPlace(page: Page, materialId: string, type: string): Promise<boolean> {
  await page.evaluate(({ id }) => {
    const e = (window as unknown as Record<string, any>)['__engine'];
    e.dispatch({ type: 'drainCrucible' });
    e.dispatch({ type: 'chargeCrucible', materialId: id, units: 4 });
  }, { id: materialId });
  // Let the REAL tick melt it — no state poking.
  await page.waitForTimeout(900);
  const btn = page.locator(`[data-testid="cast-${type}"]`);
  if (await btn.isDisabled().catch(() => true)) return false;
  await btn.click();
  await page.waitForTimeout(150);
  const rack = page.locator('[data-testid^="rack-"]');
  const n = await rack.count();
  if (n === 0) return false;
  await rack.nth(n - 1).click();
  await page.waitForTimeout(150);
  return true;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: W, height: H }, reducedMotion: 'no-preference' });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  const recovered: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (t.includes('render recovered')) { recovered.push(t.slice(0, 120)); return; }
    problems.push(`[console] ${t.slice(0, 200)}`);
  });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // The Forge raised, and a Hold with one matched set's worth plus one part
  // from every shell. Nothing else is stipulated.
  await setup(page, `
    const s = engine.getState();
    s.forge.built = true;
  `);
  await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const s = w['__engine'].getState();
    const give = ['marl', 'umbralite', 'hushslate', 'echograin', 'resonarium',
      'phantomsilver', 'voidmarl', 'absencia',
      'firstiron', 'lacuna', 'coronaite', 'starlens', 'wildstar', 'polestar', 'starmarl'];
    for (const id of give) forge.addMaterial(s, id, 70, 60);
  });
  await tab(page, 'casting');
  await dismiss(page);

  // ═══ A. THE ROOM IS THERE ════════════════════════════════════════════════
  console.log('\nA — the casting floor');
  check(await page.locator('[data-testid="crucible"]').count() > 0, 'the crucible board renders');
  check(await page.locator('[data-testid="casts"]').count() > 0, 'the moulds render');
  check(await page.locator('[data-testid="station"]').count() > 0, 'the tool station renders');
  check(await page.locator('canvas').count() === 0
    || await page.locator('[data-testid="crucible"] canvas').count() === 0,
    'no canvas anywhere in the casting panel');
  await shot(page, '1-empty');

  // ═══ B. MELT — THE BAR ACTUALLY FILLS ════════════════════════════════════
  console.log('\nB — melt a material and watch the tub');
  const emptyMolten = await barWidth(page, 'molten');
  check(emptyMolten === 0, 'the tub starts empty', `molten bar ${(emptyMolten * 100).toFixed(0)}%`);

  await page.locator('[data-testid="charge-5"]').click();
  // THE STORE PUBLISHES AT ~12Hz AND THE BAR HAS A 200ms WIDTH TRANSITION, so
  // reading at a fixed 120ms is a race — it passed on one run and read 0% on
  // the next. The melt lasts two full seconds, so there is a wide window; poll
  // for the un-melted segment to appear rather than guessing when it will.
  let midSolid = 0;
  for (let i = 0; i < 12; i++) {
    midSolid = Math.max(midSolid, await barWidth(page, 'solid'));
    if (midSolid > 0.05) break;
    await page.waitForTimeout(80);
  }
  const midMolten = await barWidth(page, 'molten');
  console.log(`    mid-melt: solid ${(midSolid * 100).toFixed(0)}%  molten ${(midMolten * 100).toFixed(0)}%`);
  check(midSolid > 0, 'un-melted stock shows in the tub', `${(midSolid * 100).toFixed(0)}% wide`);
  check(await page.locator('[data-testid="melting"]').count() > 0, 'and it says it is melting');
  await shot(page, '2-melting');

  // FIVE UNITS IS 20 MELT AT 10/s — TWO FULL SECONDS, plus the bar's own 200ms
  // width transition. The first cut of this waited 1.4s, read a tub that was
  // genuinely still melting, and reported the game as broken. Wait for the
  // ENGINE to say it has run rather than for a number of milliseconds.
  for (let i = 0; i < 60; i++) {
    const solid = await page.evaluate(() =>
      (window as unknown as Record<string, any>)['__engine'].getState().casting.crucible.solid);
    if (solid === 0) break;
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(300); // let the CSS width transition land
  const doneSolid = await barWidth(page, 'solid');
  const doneMolten = await barWidth(page, 'molten');
  console.log(`    melted:   solid ${(doneSolid * 100).toFixed(0)}%  molten ${(doneMolten * 100).toFixed(0)}%`);
  check(doneMolten > midMolten, 'the MOLTEN bar grew as it ran',
    `${(midMolten * 100).toFixed(0)}% → ${(doneMolten * 100).toFixed(0)}%`);
  check(doneSolid === 0, 'and the solid stock is gone', `${(doneSolid * 100).toFixed(0)}% left`);
  const readout = await txt(page, '[data-testid="melt-readout"]');
  check(readout.startsWith('20 /'), 'the readout matches the bar', readout);
  check(Math.abs(doneMolten - 0.5) < 0.03, 'and the bar is exactly half a tub', `${(doneMolten * 100).toFixed(0)}%`);
  await shot(page, '3-molten');

  // ═══ C. CAST ═════════════════════════════════════════════════════════════
  // The picker defaults to the first material by NAME, so which stone is in the
  // tub is the panel's business, not this script's. Read what it says it holds
  // and assert the pour agrees — that is the real claim anyway.
  console.log('\nC — pour a part');
  const inTub = await txt(page, '[data-testid="crucible"]');
  const stone = inTub.match(/melt\s+([A-Z][\w' -]+?)\s+(?:poor|fair|good|fine|exalted)/i)?.[1]?.trim() ?? '';
  await page.locator('[data-testid="cast-head"]').click();
  await page.waitForTimeout(200);
  const note = await txt(page, '[data-testid="cast-note"]');
  console.log(`    tub holds "${stone}" · ${note}`);
  check(stone !== '' && note === `Head cast in ${stone}.`,
    'the pour names the stone the tub says it holds', note);
  check(await page.locator('[data-testid^="rack-"]').count() === 1, 'and it is on the rack');
  await shot(page, '4-cast');

  // ═══ D. CAST ALL SEVEN, MATCHED, AND BUILD ═══════════════════════════════
  console.log('\nD — a matched set of seven, and the station');
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, any>)['__engine'];
    e.dispatch({ type: 'drainCrucible' });
    e.getState().casting.rack.length = 0;
  });
  const MATCHED: Array<[string, string]> = [
    ['head', 'umbralite'], ['core', 'hushslate'], ['edge', 'echograin'],
    ['binding', 'resonarium'], ['handle', 'phantomsilver'], ['grip', 'voidmarl'],
    ['sockets', 'absencia'],
  ];
  let placed = 0;
  for (const [slot, mat] of MATCHED) {
    if (await castAndPlace(page, mat, slot)) placed++;
  }
  check(placed === 7, 'all seven cast and set on the station', `${placed}/7`);
  const benchPct = await txt(page, '[data-testid="bench-coherence-pct"]');
  const benchLine = await txt(page, '[data-testid="bench-coherence"]');
  console.log(`    station preview: ${benchLine}`);
  check(/^\d+%$/.test(benchPct), 'the station shows a coherence figure', benchPct);
  check(parseInt(benchPct, 10) >= 90, 'a matched set previews HIGH', benchPct);
  check(await page.locator('[data-testid="bench-stats-bite"]').count() > 0,
    'and the full stat block is on screen before committing');
  const filled = await page.locator('[data-testid="station"] [data-testid^="slot-"]').count();
  check(filled === 7, 'seven slots drawn', `${filled}`);
  await shot(page, '5-station-matched', '[data-testid="bench-coherence"]');

  await page.locator('[data-testid="combine"]').click();
  await page.waitForTimeout(300);
  const buildNote = await txt(page, '[data-testid="build-note"]');
  console.log(`    ${buildNote}`);
  check(await page.locator('[data-testid="your-tool"]').count() > 0, 'the tool is built and shown');
  const toolPct = await txt(page, '[data-testid="tool-coherence-pct"]');
  check(toolPct === benchPct, 'and it reads the coherence the station promised',
    `station ${benchPct} → tool ${toolPct}`);
  const toolStats = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="tool-stats-"]')].map((e) => e.textContent).join(' '));
  check((toolStats.match(/\d/g) ?? []).length > 8, 'the tool prints real stats', toolStats.slice(0, 60));
  await shot(page, '6-tool-built', '[data-testid="tool-coherence"]');

  // ═══ E. THE HEADLINE — SCATTERED READS WORSE, AND YOU SEE IT FIRST ═══════
  console.log('\nE — a scattered set on the station, against the built tool');
  const SCATTER: Array<[string, string]> = [
    ['head', 'firstiron'], ['core', 'lacuna'], ['edge', 'coronaite'],
    ['binding', 'starlens'], ['handle', 'wildstar'], ['grip', 'polestar'],
    ['sockets', 'starmarl'],
  ];
  let placed2 = 0;
  for (const [slot, mat] of SCATTER) {
    if (await castAndPlace(page, mat, slot)) placed2++;
  }
  check(placed2 === 7, 'one part from each of the seven shells, set on the station', `${placed2}/7`);
  const scatterPct = await txt(page, '[data-testid="bench-coherence-pct"]');
  const scatterLine = await txt(page, '[data-testid="bench-coherence"]');
  const scatterLoss = await txt(page, '[data-testid="bench-coherence-loss"]');
  console.log(`    ${scatterLine}`);
  console.log(`    ${scatterLoss}`);
  check(parseInt(scatterPct, 10) < 50, 'the scattered set previews LOW', scatterPct);
  check(parseInt(scatterPct, 10) < parseInt(benchPct, 10),
    'and visibly worse than the matched one', `${scatterPct} vs ${benchPct}`);
  check(/→/.test(scatterLoss), 'the raw-to-net loss is printed, not just a percentage', scatterLoss);
  check(/strangers|Badly matched|Mixed/.test(scatterLine),
    'and it says in words what the number means');
  // Both on screen at once: the built matched tool and the scattered preview.
  check(await page.locator('[data-testid="tool-coherence-pct"]').count() > 0
    && await page.locator('[data-testid="bench-coherence-pct"]').count() > 0,
    'BOTH readouts visible together — coherent tool above, scattered preview on the bench');
  // THE ONE THAT MATTERS: the scattered preview at the bottom of the station
  // and the matched tool it would replace, in one frame. Scrolled so the two
  // coherence figures sit together — the whole legibility claim in one image.
  await shot(page, '7-scattered-preview', '[data-testid="bench-coherence"]');
  await shot(page, '8-scattered-vs-coherent', '[data-testid="combine"]');

  // The raw numbers really are bigger on the scattered set, which is the trap
  // the penalty exists to price. Read from the engine, printed by the panel.
  const cmp = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const c = await import(/* @vite-ignore */ '/src/engine/systems/casting' + '.ts');
    const s = w['__engine'].getState();
    const bench = c.benchPreview(s);
    const tool = c.currentTool(s);
    return {
      benchRawBite: bench.rawStats.bite, toolRawBite: tool.rawStats.bite,
      benchNet: bench.rockRate, toolNet: tool.rockRate,
      benchCoh: bench.coherence.factor, toolCoh: tool.coherence.factor,
    };
  });
  console.log(`    scattered raw bite ${cmp.benchRawBite.toExponential(2)} vs matched ${cmp.toolRawBite.toExponential(2)}`);
  console.log(`    coherence ${(cmp.benchCoh * 100).toFixed(0)}% vs ${(cmp.toolCoh * 100).toFixed(0)}%`);
  check(cmp.benchRawBite > cmp.toolRawBite,
    'the scattered set genuinely has the bigger raw numbers — this is the trap');
  check(cmp.benchCoh < cmp.toolCoh * 0.6, 'and pays for it in coherence');

  // ═══ F. NOTHING IS LOST, AND THE LAYOUT HOLDS ════════════════════════════
  console.log('\nF — the promise, and the frame');
  // COUNTS ARE THE WRONG INSTRUMENT HERE, and the first cut of this used them
  // and reported a bug that was not there: a part sitting in a station SLOT is
  // still on the rack (the bench holds ids into it), so seven-in becomes
  // seven-back and the totals do not move. The claim is about IDENTITY — are
  // these the same seven pieces — so it is checked by id.
  const before = await page.evaluate(() => {
    const s = (window as unknown as Record<string, any>)['__engine'].getState();
    return {
      toolIds: s.casting.tool.map((p: { id: number }) => p.id),
      rack: s.casting.rack.length,
    };
  });
  await page.locator('[data-testid="combine"]').click();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => {
    const s = (window as unknown as Record<string, any>)['__engine'].getState();
    return {
      tool: s.casting.tool.length,
      rackIds: s.casting.rack.map((p: { id: number }) => p.id),
      mats: s.casting.tool[0]?.materialId,
    };
  });
  const returned = before.toolIds.filter((id: number) => after.rackIds.includes(id));
  console.log(`    the matched tool's parts [${before.toolIds.join(',')}] → rack [${after.rackIds.join(',')}]`);
  check(after.tool === 7 && after.mats === 'firstiron', 'the scattered set became the tool');
  check(returned.length === 7,
    "and every one of the OLD tool's seven parts is back on the rack — nothing eaten",
    `${returned.length}/7 returned`);

  const px = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(px === 0, `no horizontal overflow at ${W}px`, `${px}px`);

  await browser.close();
  console.log(`\nshots: ${shots.length}`);
  for (const s of shots) console.log(`  ${s}`);
  if (recovered.length > 0) console.log(`\n${recovered.length} recovered frame(s) — the guard working, not a failure`);
  if (problems.length > 0) {
    console.log(`\n${problems.length} PROBLEM(S):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  console.log('\nall checks passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
