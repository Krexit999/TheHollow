/**
 * THE SHAFT renderer shots. Seeds a shell + depth, opens the Shaft takeover, and
 * captures it. Same depth across seven shells (does the wall grammar diverge?),
 * plus shallow vs deep in one shell (does it drift?). Requires the dev server.
 *   npx tsx scripts/shot-shaft.ts [tag]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = `sim-out/shots-shaft-${process.argv[2] ?? 'after'}`;
const URL = 'http://localhost:5173';
const IDS = ['dig','kiln','drills','vents','hollow','lattice','crucible','foundry','greenhouse','mycelium','loom','bench','array','chamber','hold','forge','runes','brew','guild','bestiary','warrens','observatory','journal','wells','delver','collapse','rewrite','parallel','grid','vault'];

function seed(shell: string, depth: number): string {
  return `(() => {
    const e = window.__engine; const s = e.getState();
    s.shell.current = ${JSON.stringify(shell)};
    s.depth = ${depth}; s.shaft.reached = ${depth};
    s.depthRecords[${JSON.stringify(shell)}] = ${depth + 20};
    s.maxDepthRecord = 500;
    s.kiln.built = true; s.drills.bayBuilt = true; s.forge.built = true; s.lattice.unlocked = true;
    s.materials.totalDrops = 400; s.guild.discovered = true;
    e.tick(0.05);
  })()`;
}

async function shoot(page: Page, name: string) {
  // Let the ticker settle (ease to player, bake chunks, one flicker cycle).
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('  shot', name);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  async function run(page: Page, tag: string, shell: string, depth: number) {
    await page.evaluate(seed(shell, depth)).catch((e) => console.log('seed err', e.message));
    await page.waitForTimeout(300);
    await page.evaluate(`window.__engine && window.__engine.dispatch({type:'markSystemsSeen',ids:${JSON.stringify(IDS)}})`).catch(() => {});
    await page.waitForTimeout(300);
    for (let i = 0; i < 5; i++) {
      const btn = page.getByRole('button', { name: /One at a time|Go on, then/ });
      if (await btn.count() === 0) break;
      await btn.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(250);
    }
    await page.evaluate(`window.__ui.getState().setTab('shaft')`);
    await shoot(page, tag);
  }

  // Desktop: same depth across all seven shells.
  const desk = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  desk.on('pageerror', (e) => console.log('  PAGEERROR:', e.message));
  await desk.goto(URL); await desk.waitForSelector('canvas', { timeout: 15000 }); await desk.waitForTimeout(900);
  for (const shell of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
    await run(desk, `shell-${shell}`, shell, 40);
  }
  // Shallow vs deep within one shell (drift) — depth 5 vs depth 140 in Loam.
  await run(desk, 'drift-loam-05', 'loam', 5);
  await run(desk, 'drift-loam-140', 'loam', 140);

  // A 100% crop of the lit rock beside the channel — is there real grain?
  await run(desk, 'zoom-src', 'loam', 40);
  await desk.waitForTimeout(600);
  // The left channel edge, upper area — baked rim is lit there without the lantern.
  await desk.screenshot({ path: `${OUT}/zoom-loam-rock.png`, clip: { x: 300, y: 250, width: 130, height: 150 } });
  console.log('  shot zoom-loam-rock');

  // Phone: loam takeover, 0px overflow check by eye.
  const phone = await browser.newPage({ viewport: { width: 380, height: 820 }, isMobile: true, hasTouch: true });
  phone.on('pageerror', (e) => console.log('  PAGEERROR:', e.message));
  await phone.goto(URL); await phone.waitForSelector('canvas', { timeout: 15000 }); await phone.waitForTimeout(900);
  await run(phone, 'phone-loam', 'loam', 40);
  await run(phone, 'phone-cinder', 'cinder', 120);

  // Reduced motion — must be static and fully legible (no flicker, no dust).
  const rm = await browser.newPage({ viewport: { width: 380, height: 820 }, isMobile: true, hasTouch: true });
  await rm.emulateMedia({ reducedMotion: 'reduce' });
  rm.on('pageerror', (e) => console.log('  PAGEERROR:', e.message));
  await rm.goto(URL); await rm.waitForSelector('canvas', { timeout: 15000 }); await rm.waitForTimeout(900);
  await run(rm, 'reduced-motion-verdance', 'verdance', 40);

  await browser.close();
  console.log('done →', OUT);
}
void main();
