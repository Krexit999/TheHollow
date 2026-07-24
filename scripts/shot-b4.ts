/**
 * B4 verification shots — the pull-through surfaces, proved by clicking:
 * Cast a binding at the Crucible (0→1 Steel Casting, metals spent), the
 * Refined forge button naming its worked material, and the cellar quench
 * naming its dose. Usage: npx tsx scripts/shot-b4.ts [port]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'sim-out/b4-shots';
const URL = `http://localhost:${process.argv[2] ?? '5173'}`;
const ALL = [
  'dig', 'kiln', 'drills', 'vents', 'hollow', 'lattice', 'crucible', 'foundry',
  'greenhouse', 'mycelium', 'loom', 'bench', 'array', 'chamber', 'hold', 'forge',
  'runes', 'brew', 'guild', 'bestiary', 'warrens', 'observatory', 'journal',
  'wells', 'delver', 'collapse', 'rewrite', 'parallel', 'grid', 'vault',
  // the mastery-6 seed opens these after the first mark — mark them too
  'refinery', 'salvage', 'workbench', 'museum', 'relics', 'titles',
  'expeditions', 'caravan', 'shaft', 'spiral', 'compendium', 'gear',
];

/* eslint-disable @typescript-eslint/no-explicit-any */

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(URL);
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const e = (window as any).__engine;
    const s = e.getState();
    s.shell.current = 'ferrite'; s.shell.breachCount = 1; s.shell.signatures = ['seepage'];
    s.depthRecords['loam'] = 150; s.depthRecords['ferrite'] = 200; // mastery 6: trough + alloy slots
    s.forge.built = true; s.guild.discovered = true;
    s.crucible.discovered.push('greysteel'); s.crucible.purities['greysteel'] = 82;
    s.brewing.doses['ironblood'] = 1;
    for (const c of ['ingot', 'flux', 'scale', 'lodestone', 'rime', 'brick']) {
      e.dispatch({ type: 'debug', op: 'grant', currency: c, amount: 5000 });
    }
    e.tick(0.2);
  });
  await page.evaluate(`window.__engine.dispatch({ type: 'markSystemsSeen', ids: ${JSON.stringify(ALL)} })`);
  await page.waitForTimeout(4600);
  const go = (t: string) => page.evaluate(`window.__ui && window.__ui.getState().setTab('${t}')`);
  const read = () => page.evaluate(`(() => {
    const s = window.__engine.getState();
    const count = (id) => { let n = 0; const per = s.materials.stacks[id] || {}; for (const k in per) n += per[k].count; return n; };
    return { ingot: s.currencies['ingot'].toNumber(), casting: count('steelcasting') };
  })()`);

  await go('crucible');
  await page.waitForTimeout(600);
  // Anything the seed revealed late — mark again so the gate stays down.
  await page.evaluate(`window.__engine.dispatch({ type: 'markSystemsSeen', ids: ${JSON.stringify(ALL)} })`);
  await page.waitForTimeout(300);
  console.log('before Cast:', JSON.stringify(await read()));
  await page.getByRole('button', { name: /Cast · Steel/ }).click();
  await page.waitForTimeout(400);
  console.log('after Cast:', JSON.stringify(await read()));
  await page.evaluate('window.scrollTo(0,0)');
  await page.screenshot({ path: `${OUT}/crucible-cast.png` });

  await go('forge');
  await page.waitForTimeout(600);
  await page.getByText('QUICK PATTERNS', { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  const refinedBtn = page.getByRole('button', { name: /Refined ·/ }).first();
  await refinedBtn.scrollIntoViewIfNeeded().catch(() => {});
  console.log('refined button visible:', await refinedBtn.count() > 0);
  await page.screenshot({ path: `${OUT}/forge-refined.png` });

  await go('refinery'); // the Refinery panel hosts the quench trough
  await page.waitForTimeout(600);
  const quench = await page.getByText("Hawk's-Blood-quenched").count();
  console.log('cellar quenches visible:', quench > 0);
  await browser.close();
  console.log('b4 shots ->', OUT);
}
void main();
