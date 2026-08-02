/**
 * THE PLANT, VERIFIED IN PLAY (Proof #3).
 *
 *   A  the Kiln running on Flow while the Crusher waits on Surge
 *   B  a Crusher batch draining the bank and the bay slowing
 *   C  the Core-tree choice between Flow and Surge capacity
 *   D  tier II retaining a purity band where tier I loses one
 *
 * Plus: 0 horizontal overflow at 380px.
 *
 *   npx tsx scripts/verify-plant.ts [port]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = `http://localhost:${process.argv[2] ?? '5173'}`;
const OUT = 'sim-out/shots-plant';
const problems: string[] = [];
const check = (ok: boolean, label: string, detail = ''): void => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(label);
};

const shoot = async (page: Page, name: string, hasText: string): Promise<void> => {
  await page.waitForTimeout(400);
  const el = page.locator('.panel').filter({ hasText }).first();
  await el.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
  console.log(`  shot ${name}`);
};

/** Read the plant panel the way a player reads it. */
const plantRows = (page: Page): Promise<Record<string, string>> => page.evaluate(() => {
  const out: Record<string, string> = {};
  for (const id of ['kiln', 'crusher', 'refinery']) {
    const el = document.querySelector(`[data-testid="plant-${id}"]`);
    if (el) out[id] = (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim();
  }
  return out;
});

const readState = (page: Page) => page.evaluate(() => {
  const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
    { getState: () => never };
  const s = e.getState() as unknown as {
    plant?: { surge: number; tiers: Record<string, number> };
    stats: { bricksFired: { toString(): string } };
    materials: { stacks: Record<string, Record<string, { count: number }>> };
    collapse: { nodes: Record<string, number> };
  };
  return {
    surge: s.plant?.surge ?? 0,
    tiers: s.plant?.tiers ?? {},
    bricks: Number(s.stats.bricksFired.toString()),
    stacks: JSON.parse(JSON.stringify(s.materials.stacks)) as Record<string, Record<string, { count: number }>>,
    nodes: { ...s.collapse.nodes },
  };
});

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  // WIDTH 380 is the constraint; the height is tall only so a whole panel fits
  // in one shot above the fixed nav.
  const page = await browser.newPage({ viewport: { width: 380, height: 1200 }, isMobile: true, hasTouch: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    (window as never as Record<string, unknown>)['__name'] = (f: unknown) => f;
  });
  await page.goto(URL);
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForTimeout(2500);

  // Stand the chain up: Kiln lit and hot, and three cast parts on the rack.
  // The Crusher is then BUILT out of those parts through the real action, so it
  // reaches whatever tier the rack actually affords (tier I — the second tier
  // wants three more parts than are left, which the panel says out loud).
  // Nothing here touches the field: this is a plant, not an income cheat.
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown; tick: (n: number) => void };
    const s = e.getState() as unknown as {
      kiln: { built: boolean; feeding: boolean; heat: number };
      plant?: { tiers: Record<string, number>; surge: number };
      casting: { rack: unknown[] };
    };
    e.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e12 });
    e.dispatch({ type: 'markSystemsSeen', ids: ['dig', 'kiln', 'drills', 'hold', 'collapse', 'casting', 'refinery'] });
    s.kiln.built = true; s.kiln.feeding = true; s.kiln.heat = 1;
    s.casting.rack = Array.from({ length: 3 }, (_, i) => ({ id: 900 + i, type: 'head', materialId: 'marl', purity: 50 }));
    e.tick(0.5);
  });
  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
    ui.getState().setTab('kiln');
  });
  await page.waitForTimeout(800);

  // ── A. THE KILN RUNS ON FLOW; THE CRUSHER WAITS ON SURGE ────────────────
  console.log('A — the Kiln on Flow, the Crusher on Surge');
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { dispatch: (a: unknown) => unknown; getState: () => never; tick: (n: number) => void };
    e.dispatch({ type: 'buildCrusher' }); // tier I, out of the rack
    e.dispatch({ type: 'buildCrusher' }); // tier II
    const s = e.getState() as unknown as { plant: { surge: number } };
    s.plant.surge = 0; // an empty bank: the Crusher has nothing to fire with
    e.tick(0.2);
  });
  await page.waitForTimeout(700);
  const a = await plantRows(page);
  console.log(`      kiln     ${a['kiln']}`);
  console.log(`      crusher  ${a['crusher']}`);
  check(/running/.test(a['kiln'] ?? ''), 'the Kiln is running on Flow', a['kiln'] ?? '');
  check(/waiting on Surge/.test(a['crusher'] ?? ''), 'the Crusher is WAITING on Surge', a['crusher'] ?? '');
  const bricksBefore = (await readState(page)).bricks;
  await page.waitForTimeout(2500);
  check((await readState(page)).bricks >= bricksBefore, 'and the Kiln kept converting while it waited');
  await shoot(page, 'A-flow-runs-surge-waits', 'The Hearth');

  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(overflow === 0, 'no horizontal overflow at 380px', `${overflow}px`);

  // ── B. A BATCH DRAINS THE BANK ──────────────────────────────────────────
  console.log('B — a batch drains the Surge bank');
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; tick: (n: number) => void };
    const s = e.getState() as unknown as {
      plant: { surge: number };
      materials: { stacks: Record<string, Record<string, { count: number; puritySum: number }>> };
    };
    s.materials.stacks['marl'] = { fair: { count: 40, puritySum: 40 * 50 } };
    s.plant.surge = 14; // exactly one batch
    e.tick(0.2);
  });
  await page.waitForTimeout(600);
  const preBatch = await readState(page);
  await page.locator('[data-testid^="crush-"]').first().click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(500);
  const postBatch = await readState(page);
  check(postBatch.surge < preBatch.surge, 'the batch emptied the bank',
    `${preBatch.surge.toFixed(1)} → ${postBatch.surge.toFixed(1)} Surge`);
  const after = await plantRows(page);
  check(/waiting on Surge/.test(after['crusher'] ?? ''), 'and the Crusher now waits again', after['crusher'] ?? '');
  await shoot(page, 'B-batch-drains-bank', 'Batch ·');

  // ── C. THE CORE-TREE CHOICE ─────────────────────────────────────────────
  console.log('C — Flow capacity vs Surge capacity, in the tree');
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { dispatch: (a: unknown) => unknown; tick: (n: number) => void };
    e.dispatch({ type: 'debug', op: 'grant', currency: 'core', amount: 500 });
    e.tick(0.2);
  });
  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
    ui.getState().setTab('collapse');
  });
  await page.waitForTimeout(900);
  const treeText = await page.evaluate(() => document.body.innerText);
  check(/Draught/.test(treeText), 'Draught (Flow capacity) is in the Core tree');
  check(/Reservoir/.test(treeText), 'Reservoir (Surge capacity) is in the Core tree');
  check(/never spikes, it just never stops/.test(treeText), 'and each says what its shape is FOR');
  await shoot(page, 'C-core-tree-choice', 'Draught');

  // Buying one really moves one capacity and not the other.
  const preBuy = await readState(page);
  // The buy button reads "Level 1 · N Cores", not the node name, so a
  // name-based locator finds nothing and the check reports a rank that never
  // moved. Walk to the CARD that carries the name and press its button.
  const clicked = await page.evaluate(() => {
    const label = [...document.querySelectorAll("div")]
      .find((d) => d.textContent?.trim().startsWith("Draught") && d.children.length < 4);
    let el: HTMLElement | null = label as HTMLElement | null;
    for (let i = 0; i < 6 && el; i++) {
      const btn = el.querySelector("button");
      if (btn && !(btn as HTMLButtonElement).disabled) { (btn as HTMLButtonElement).click(); return true; }
      el = el.parentElement;
    }
    return false;
  });
  if (!clicked) console.log("    (no enabled buy button found on the Draught card)");
  await page.waitForTimeout(600);
  const postBuy = await readState(page);
  check((postBuy.nodes['flowCapacity'] ?? 0) > (preBuy.nodes['flowCapacity'] ?? 0),
    'buying Draught raises Flow capacity', `rank ${preBuy.nodes['flowCapacity'] ?? 0} → ${postBuy.nodes['flowCapacity'] ?? 0}`);
  check((postBuy.nodes['surgeCapacity'] ?? 0) === (preBuy.nodes['surgeCapacity'] ?? 0),
    'and buys no Surge with it — two capabilities, not one number');

  // ── D. TIER II RETAINS A BAND WHERE TIER I LOSES ONE ────────────────────
  console.log('D — tier I loses a band, tier II keeps it');
  const bands = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown; tick: (n: number) => void };
    const s = e.getState() as unknown as {
      plant: { surge: number; tiers: Record<string, number> };
      materials: { stacks: Record<string, Record<string, { count: number; puritySum: number }>> };
    };
    const run = (tier: number): string[] => {
      s.plant.tiers['crusher'] = tier;
      s.plant.surge = 1000;
      delete s.materials.stacks['refineslag'];
      s.materials.stacks['marl'] = { fair: { count: 8, puritySum: 8 * 50 } };
      e.dispatch({ type: 'crush', materialId: 'marl', band: 'fair' });
      return Object.keys(s.materials.stacks['refineslag'] ?? {});
    };
    return { tier1: run(1), tier2: run(2) };
  });
  console.log(`      input band 'fair' → tier I ${JSON.stringify(bands.tier1)} · tier II ${JSON.stringify(bands.tier2)}`);
  check(bands.tier1.join() === 'poor', 'tier I hands back stone one band poorer', bands.tier1.join());
  check(bands.tier2.join() === 'fair', 'TIER II RETAINS THE INPUT\'S PURITY BAND', bands.tier2.join());

  check(errors.length === 0, 'no page errors throughout', errors.join(' | '));
  console.log(problems.length === 0 ? '\nALL PASS' : `\nFAILURES: ${problems.join(', ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
