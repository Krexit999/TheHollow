/**
 * Part B verification shots — techniques + keystones, proved by CLICKING.
 *  1. Loam at floor: Skim button pays the pool; the Keystone card's craft leg
 *     consumes Brick; the breach button flips from "unshored" to ready.
 *  2. Ferrite: arm Poleshift from the face bar, tap the canvas, read the sign
 *     array change back.
 * Usage: npx tsx scripts/shot-progression.ts [port]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'sim-out/prog-shots';
const URL = `http://localhost:${process.argv[2] ?? '5173'}`;

const ALL = [
  'dig', 'kiln', 'drills', 'vents', 'hollow', 'lattice', 'crucible', 'foundry',
  'greenhouse', 'mycelium', 'loom', 'bench', 'array', 'chamber', 'hold', 'forge',
  'runes', 'brew', 'guild', 'bestiary', 'warrens', 'observatory', 'journal',
  'delver', 'collapse', 'rewrite', 'parallel', 'grid', 'vault', 'refinery',
  'salvage', 'workbench', 'relics', 'titles', 'expeditions', 'caravan',
  'shaft', 'spiral', 'compendium', 'gear', 'automation',
];

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(URL);
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // --- Scene 1: Loam floor, pool banked, keystone unset --------------------
  await page.evaluate(`(() => {
    const e = window.__engine; const s = e.getState();
    s.depth = 150; s.depthRecords['loam'] = 150;
    s.combat.wardens.push('loam');
    s.kiln.built = true;
    s.face.seepPool = 20;
    e.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 100000 });
    e.dispatch({ type: 'debug', op: 'grant', currency: 'brick', amount: 100 });
    e.dispatch({ type: 'markSystemsSeen', ids: ${JSON.stringify(ALL)} });
    e.tick(0.2);
  })()`);
  await page.waitForTimeout(4600);
  await page.evaluate(`window.__engine.dispatch({ type: 'markSystemsSeen', ids: ${JSON.stringify(ALL)} })`);
  await page.waitForTimeout(400);

  const read = (expr: string) => page.evaluate(`(() => { const s = window.__engine.getState(); return ${expr}; })()`);
  console.log('dust before skim:', await read(`s.currencies['dust'].toNumber()`));
  await page.getByRole('button', { name: /Skim/ }).click();
  await page.waitForTimeout(300);
  console.log('after skim:', JSON.stringify(await read(`({ dust: s.currencies['dust'].toNumber(), pool: s.face.seepPool })`)));
  await page.screenshot({ path: `${OUT}/1-loam-face.png` });

  // Keystone: the collapse cluster hosts the breach card.
  await page.evaluate(`window.__ui.getState().setTab('collapse')`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/2-keystone-card.png` });
  await page.getByRole('button', { name: /Set it/ }).click();
  await page.waitForTimeout(400);
  console.log('after craft leg:', JSON.stringify(await read(`({ brick: s.currencies['brick'].toNumber(), placed: s.keystones.placed })`)));
  await page.screenshot({ path: `${OUT}/3-keystone-set.png` });

  // --- Scene 2: Ferrite, poleshift armed and tapped ------------------------
  await page.evaluate(`(() => {
    const e = window.__engine; const s = e.getState();
    s.shell.current = 'ferrite'; s.shell.breachCount = 1; s.shell.signatures = ['seepage'];
    s.depthRecords['ferrite'] = 50;
    s.techniques.lastUsed = {}; // a prior shot run's cooldown persists in the save
    e.dispatch({ type: 'chip', cell: 0 }); // primes the polarity sign array
    e.tick(0.2);
  })()`);
  await page.evaluate(`window.__engine.dispatch({ type: 'markSystemsSeen', ids: ${JSON.stringify(ALL)} })`);
  await page.evaluate(`window.__ui.getState().setTab('dig')`);
  await page.waitForTimeout(600);
  await page.evaluate(`window.__engine.dispatch({ type: 'markSystemsSeen', ids: ${JSON.stringify(ALL)} })`);
  await page.waitForTimeout(300);
  const signsBefore = (await read(`s.polarity.signs.join(',')`)) as string;
  await page.getByRole('button', { name: /Poleshift/ }).click();
  await page.waitForTimeout(200);
  console.log('armed:', JSON.stringify(await page.evaluate(`(() => { const u = window.__ui.getState(); return { mode: u.faceMode, armed: u.armedTechnique }; })()`)));
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas box');
  // A spray of taps — the grid's exact placement is the renderer's business;
  // one of these lands on a cell. Cooldown means at most one flips.
  for (const [fx, fy] of [[0.5, 0.5], [0.4, 0.45], [0.6, 0.55], [0.5, 0.35], [0.45, 0.6]] as Array<[number, number]>) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(150);
  }
  const signsAfter = (await read(`s.polarity.signs.join(',')`)) as string;
  const a = signsBefore.split(',');
  const c2 = signsAfter.split(',');
  const flipped = a.filter((v, i) => c2[i] !== v).length;
  console.log(`poleshift: ${flipped} sign(s) flipped by canvas taps (signs primed: ${a.length})`);
  await page.screenshot({ path: `${OUT}/4-poleshift-armed.png` });

  await browser.close();
  console.log('prog shots ->', OUT);
}
void main();
