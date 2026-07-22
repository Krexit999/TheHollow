/**
 * Phase 21 verification shots — THE CONSIDERED HAND. Seeds a mid-game state,
 * populates the new QoL surfaces (a pin, a refine preset, a blueprint, a saved
 * layout, a carry mark, a bookmark + note, auto-collapse), and shoots the key
 * screens at 380px. Requires the dev server (npm run dev).
 *   npx tsx scripts/shot-p21.ts [tag]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = `sim-out/shots-p21-${process.argv[2] ?? 'after'}`;
const URL = 'http://localhost:5173';
const IDS = ['dig','kiln','drills','vents','hollow','lattice','crucible','foundry','greenhouse','mycelium','loom','bench','array','chamber','hold','forge','runes','brew','guild','bestiary','warrens','observatory','journal','wells','delver','collapse','rewrite','parallel','grid','vault'];

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  shot ${name}`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 380, height: 820 }, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.log('  PAGEERROR:', e.message));
  await page.addInitScript(() => { (window as any).__name = (window as any).__name || ((f: any) => f); });
  await page.goto(URL);
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForTimeout(900);

  // Seed a ferrite-era state with the Refinery open, a Grid running, motifs down.
  await page.evaluate(() => {
    const e = (window as any).__engine;
    const s = e.getState();
    // Loam shell so blade buys with dust (populating carry-one); ferrite record
    // opens the Refinery so auto-refine shows.
    s.shell.current = 'loam';
    s.depthRecords['loam'] = 150; s.depthRecords['ferrite'] = 40; s.depth = 40; s.maxDepthRecord = 150;
    s.kiln.built = true; s.drills.bayBuilt = true; s.forge.built = true; s.lattice.unlocked = true;
    s.lattice.rings = 2; s.materials.totalDrops = 300;
    e.tick(0.2);
  });
  await page.waitForTimeout(300);

  // Give materials + a blade level, then populate the QoL surfaces via dispatch.
  await page.evaluate(() => {
    const e = (window as any).__engine;
    e.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 5e6 });
    e.dispatch({ type: 'debug', op: 'grant', currency: 'brick', amount: 5000 });
    e.dispatch({ type: 'debug', op: 'grant', currency: 'motif', amount: 5000 });
  });
  await page.evaluate(() => {
    const e = (window as any).__engine;
    // Materials to hold, so the Hold, pins and the Forge picker have content.
    const s = e.getState();
    const add = (id: string, purity: number, count: number) => {
      const band = purity < 40 ? 'poor' : purity < 55 ? 'fair' : purity < 70 ? 'good' : purity < 85 ? 'fine' : 'exalted';
      s.materials.stacks[id] = s.materials.stacks[id] || {};
      const st = s.materials.stacks[id][band] || (s.materials.stacks[id][band] = { count: 0, puritySum: 0 });
      st.count += count; st.puritySum += purity * count;
    };
    add('marl', 35, 40); add('ochre', 60, 20); add('loamiron', 50, 12); add('bonechalk', 45, 15); add('graveclay', 55, 10);
    e.tick(0.1);
  });
  await page.evaluate(() => {
    const e = (window as any).__engine;
    e.dispatch({ type: 'buyUpgrade', id: 'blade', count: 10 });
    e.dispatch({ type: 'togglePin', materialId: 'marl' });
    e.dispatch({ type: 'setRefinePreset', materialId: 'marl', toBand: 'good' });
    e.dispatch({ type: 'saveBlueprint', name: 'Cleaver I', tier: 1, head: 'bonechalk', haft: 'graveclay', binding: 'bonechalk' });
    e.dispatch({ type: 'saveBlueprint', name: 'Splitter', tier: 1, head: 'marl', haft: 'ochre', binding: 'marl' });
    e.dispatch({ type: 'placeMotif', q: 1, r: 0, shape: 'triangle', rank: 1 });
    e.dispatch({ type: 'placeMotif', q: 0, r: 1, shape: 'square', rank: 1 });
    e.dispatch({ type: 'saveLatticeLayout', name: 'Opening' });
    e.dispatch({ type: 'setCarryUpgrade', upgradeId: 'blade' });
    e.dispatch({ type: 'setBookmark', entryId: 'sys.forge', on: true });
    e.dispatch({ type: 'setNote', entryId: 'sys.forge', note: 'Marrow eyes it before I spend — soft haft = no sing.' });
  });
  await page.evaluate(`window.__engine && window.__engine.dispatch({type:'markSystemsSeen',ids:${JSON.stringify(IDS)}})`).catch(() => {});
  // Dismiss the disclosure gate — it batches, so acknowledge until it's gone.
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500);
    const btn = page.getByRole('button', { name: /One at a time|Go on, then/ });
    if (await btn.count() === 0) break;
    await btn.click({ timeout: 2000 }).catch(() => {});
  }
  // Let the seed's toasts (4.2s) AND the undo window (12s from the blade buy) clear.
  await page.waitForTimeout(12500);

  const dismissGate = async () => {
    for (let i = 0; i < 6; i++) {
      const btn = page.getByRole('button', { name: /One at a time|Go on, then/ });
      if (await btn.count() === 0) return;
      await btn.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  };
  const go = async (tab: string) => {
    await page.evaluate(`window.__ui.getState().setTab('${tab}')`);
    await page.waitForTimeout(400);
    await dismissGate();
    await page.waitForTimeout(300);
  };

  await go('hold'); await shoot(page, 'hold-pins-shortfall');
  await go('forge'); await shoot(page, 'forge-blueprints');
  await go('lattice'); await shoot(page, 'lattice-layouts');
  await go('collapse'); await shoot(page, 'collapse-controls');
  await go('vault'); await shoot(page, 'vault-comfort');

  // The Compendium overlay (opened on the forge page, which is bookmarked + noted).
  await page.evaluate(`window.__ui.getState().openCompendium('sys.forge')`);
  await page.waitForTimeout(500);
  await shoot(page, 'compendium-bookmark-note');

  await browser.close();
  console.log('done → ' + OUT);
}
void main();
