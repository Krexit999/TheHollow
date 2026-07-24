/**
 * B3 verification shots — THE ATTENDED MARGIN in the Journal.
 * Seeds a post-Breach state with found confluences + Echoes, then proves the
 * real controls by CLICKING them: Widen (buy slot) → Dwell → Deepen, reading
 * state back after each. Usage: npx tsx scripts/shot-b3.ts [port]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'sim-out/b3-shots';
const URL = `http://localhost:${process.argv[2] ?? '5173'}`;

/* eslint-disable @typescript-eslint/no-explicit-any */

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const [dev, vp] of [['phone', { width: 380, height: 820 }], ['desk', { width: 1440, height: 900 }]] as const) {
    const page = await browser.newPage({ viewport: vp, isMobile: dev === 'phone', hasTouch: dev === 'phone' });
    await page.goto(URL);
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      const e = (window as any).__engine;
      const s = e.getState();
      s.shell.current = 'verdance'; s.shell.breachCount = 2; s.shell.signatures = ['seepage', 'polarity'];
      s.depthRecords['loam'] = 150; s.depthRecords['ferrite'] = 250; s.guild.discovered = true;
      s.confluences.found.push('stormChord', 'warrenFlavour', 'nothingWasted');
      e.dispatch({ type: 'debug', op: 'grant', currency: 'echo', amount: 40 });
      e.tick(0.2);
    });
    // Full nav list, as in shot-ui.ts: the seed reveals many systems at once
    // (real play staggers them) and the gate must not cover the shot. Marked
    // twice — some systems reveal only after the first mark settles.
    const ALL = [
      'dig', 'kiln', 'drills', 'vents', 'hollow', 'lattice', 'crucible', 'foundry',
      'greenhouse', 'mycelium', 'loom', 'bench', 'array', 'chamber', 'hold', 'forge',
      'runes', 'brew', 'guild', 'bestiary', 'warrens', 'observatory', 'journal',
      'delver', 'collapse', 'rewrite', 'parallel', 'grid', 'vault', 'refinery',
      'salvage', 'workbench', 'relics', 'titles', 'expeditions', 'caravan',
      'shaft', 'spiral', 'compendium', 'gear', 'automation',
    ];
    await page.evaluate(`window.__engine.dispatch({ type: 'markSystemsSeen', ids: ${JSON.stringify(ALL)} })`);
    await page.waitForTimeout(4600); // seed toasts fade
    await page.evaluate(`window.__ui && window.__ui.getState().setTab('journal')`);
    await page.waitForTimeout(600);
    await page.evaluate(`window.__engine.dispatch({ type: 'markSystemsSeen', ids: ${JSON.stringify(ALL)} })`);
    await page.waitForTimeout(300);
    await page.evaluate('window.scrollTo(0,0)');
    await page.screenshot({ path: `${OUT}/${dev}-1-margins.png` });

    // The click proof (desktop pass only — one is enough for state changes).
    if (dev === 'desk') {
      const read = () => page.evaluate(`(() => {
        const s = window.__engine.getState();
        return { echo: s.currencies['echo'].toNumber(), slots: JSON.parse(JSON.stringify(s.confluences.slots)) };
      })()`);
      await page.getByRole('button', { name: /Widen/ }).click();
      await page.waitForTimeout(400);
      console.log('after Widen:', JSON.stringify(await read()));
      await page.getByRole('button', { name: 'Dwell', exact: true }).first().click();
      await page.waitForTimeout(400);
      console.log('after Dwell:', JSON.stringify(await read()));
      await page.getByRole('button', { name: /Deepen/ }).click();
      await page.waitForTimeout(400);
      console.log('after Deepen:', JSON.stringify(await read()));
      await page.screenshot({ path: `${OUT}/desk-2-dwelt.png` });
    }
    await page.close();
  }
  await browser.close();
  console.log('b3 shots ->', OUT);
}
void main();
