/**
 * Phase 11 UI verification shots. Four progression states × phone(380) +
 * desktop, plus the Kiln reference. Usage: npx tsx scripts/shot-ui.ts [tag]
 * Requires the dev server (npm run dev).
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = `sim-out/shots-p11-${process.argv[2] ?? 'after'}`;
const URL = 'http://localhost:5173';

// Every system id (nav.ts CLUSTERS, flat). Dispatched as seen to keep the
// disclosure gate from covering a seeded shot.
const ALL_SYSTEM_IDS = [
  'dig', 'kiln', 'drills', 'vents', 'hollow', 'lattice', 'crucible', 'foundry',
  'greenhouse', 'mycelium', 'loom', 'bench', 'array', 'chamber', 'hold', 'forge',
  'runes', 'brew', 'guild', 'bestiary', 'warrens', 'observatory', 'journal',
  'wells', 'delver', 'collapse', 'rewrite', 'parallel', 'grid', 'vault',
];

/* eslint-disable @typescript-eslint/no-explicit-any */
type Seed = (page: Page) => Promise<void>;

const grant = (cs: string[], n = 60000) =>
  `(${((cur: string[], amt: number) => {
    const e = (window as any).__engine;
    for (const c of cur) e.dispatch({ type: 'debug', op: 'grant', currency: c, amount: amt });
    e.tick(0.2);
  }).toString()})(${JSON.stringify(cs)}, ${n})`;

const seeds: Record<string, Seed> = {
  fresh: async () => {},
  ferrite: async (p) => {
    await p.evaluate(() => {
      const s = (window as any).__engine.getState();
      s.shell.current = 'ferrite'; s.shell.breachCount = 1; s.shell.signatures = ['seepage'];
      s.depthRecords['loam'] = 150; s.depthRecords['ferrite'] = 120; s.depth = 120; s.maxDepthRecord = 150;
      s.kiln.built = true; s.kiln.feeding = true; s.kiln.heat = 0.7; s.drills.bayBuilt = true;
      for (let i = 0; i < 4; i++) s.drills.units.push({ level: 5, behavior: 'fullest', timer: 0, lastCell: 0 });
      s.forge.built = true; s.lattice.unlocked = true; s.materials.totalDrops = 300;
      s.combat.seen.push('lodecrab'); s.guild.discovered = true; s.guild.sable.found.push('p02');
    });
    await p.evaluate(grant(['dust', 'brick', 'ingot', 'flux', 'scale']));
  },
  cinder: async (p) => {
    await p.evaluate(() => {
      const s = (window as any).__engine.getState();
      s.shell.current = 'cinder'; s.shell.breachCount = 4; s.shell.signatures = ['seepage', 'polarity', 'growth', 'refraction'];
      for (const [sh, d] of [['loam', 150], ['ferrite', 250], ['verdance', 290], ['glassmere', 380], ['cinder', 120]] as [string, number][]) s.depthRecords[sh] = d;
      s.depth = 120; s.maxDepthRecord = 250; s.kiln.built = true; s.kiln.feeding = true; s.kiln.heat = 0.8;
      s.drills.bayBuilt = true; for (let i = 0; i < 6; i++) s.drills.units.push({ level: 8, behavior: 'fullest', timer: 0, lastCell: 0 });
      s.forge.built = true; s.lattice.unlocked = true; s.materials.totalDrops = 900; s.combat.seen.push('slagworm');
      s.guild.discovered = true; s.guild.sable.found.push('p02', 'p22'); s.pressure.pipes = new Array(35).fill(0);
      for (const c of [14, 15, 16, 3]) s.pressure.pipes[c] = 1; s.pressure.heat = 58;
    });
    await p.evaluate(grant(['dust', 'brick', 'ingot', 'flux', 'spore', 'sap', 'prism', 'lumen', 'slag', 'ember', 'silica', 'obsidian']));
  },
  recursion: async (p) => {
    await p.evaluate(() => {
      const s = (window as any).__engine.getState();
      s.shell.current = 'hollow'; s.shell.breachCount = 5; s.shell.signatures = ['seepage', 'polarity', 'growth', 'refraction', 'pressure'];
      for (const [sh, d] of [['loam', 150], ['ferrite', 250], ['verdance', 290], ['glassmere', 380], ['cinder', 470], ['hollow', 220]] as [string, number][]) s.depthRecords[sh] = d;
      s.depth = 140; s.maxDepthRecord = 470; s.recursion.count = 1; s.recursion.axioms = ['unemptying', 'twoHands'];
      s.kiln.built = true; s.drills.bayBuilt = true; s.forge.built = true; s.lattice.unlocked = true; s.materials.totalDrops = 2000;
      s.combat.seen.push('nullwisp', 'slagworm'); s.guild.discovered = true; s.guild.sable.found.push('p02', 'p55'); s.hollow.silence = 60;
      s.hollow.rebuilt = []; for (let i = 0; i < 16; i++) s.hollow.rebuilt.push(i);
    });
    await p.evaluate(grant(['void', 'resonance', 'axiom', 'dust', 'brick'], 5e8));
  },
};

async function shoot(browser: Awaited<ReturnType<typeof chromium.launch>>, name: string, seed: Seed): Promise<void> {
  for (const [dev, vp] of [['phone', { width: 380, height: 820 }], ['desk', { width: 1440, height: 900 }]] as const) {
    const page = await browser.newPage({ viewport: vp, isMobile: dev === 'phone', hasTouch: dev === 'phone' });
    try {
      await page.goto(URL);
      await page.waitForSelector('canvas', { timeout: 15000 });
      await page.waitForTimeout(1000);
      await seed(page);
      await page.waitForTimeout(800);
      // Dismiss the "something opened" disclosure card deterministically: the
      // seed reveals many systems at once (real play staggers them), and its
      // acknowledge button sits below a tall list off-screen on a 380px phone.
      // Marking every system seen is idempotent and never covers the shot.
      await page.evaluate(
        `window.__engine && window.__engine.dispatch({ type: 'markSystemsSeen', ids: ${JSON.stringify(ALL_SYSTEM_IDS)} })`,
      );
      // Let the one-time achievement/page toasts the seed's bulk grant fires
      // fade out (they auto-clear at 4200ms and otherwise overlap the panel on
      // a phone) before shooting anything.
      await page.waitForTimeout(4600);
      // Navigate through the UI store directly (window.__ui, dev-only) rather
      // than role selectors: the sub-tab labels ("Kiln") aren't unique enough
      // for a strict-mode click, and the cluster's default-system resolution
      // lives in nav.ts. setTab is exact and deterministic.
      const go = (t: string) => page.evaluate(`window.__ui && window.__ui.getState().setTab('${t}')`).catch(() => {});
      await go('dig');
      await page.waitForTimeout(600);
      await page.evaluate('window.scrollTo(0,0)').catch(() => {});
      await page.screenshot({ path: `${OUT}/${name}-${dev}-face.png` }).catch((e) => console.error('shot fail', name, dev, e.message.slice(0, 80)));
      // The Kiln reference (mid states only).
      if (name === 'ferrite' || name === 'cinder') {
        await go('kiln');
        await page.waitForTimeout(500);
        await page.evaluate('window.scrollTo(0,0)').catch(() => {});
        await page.screenshot({ path: `${OUT}/${name}-${dev}-kiln.png` }).catch(() => {});
      }
      // The Craft cluster — its first visible system (varies by state).
      await page.getByRole('button', { name: 'The Craft', exact: true }).click().catch(() => {});
      await page.waitForTimeout(600);
      await page.evaluate('window.scrollTo(0,0)').catch(() => {});
      await page.screenshot({ path: `${OUT}/${name}-${dev}-craft.png` }).catch(() => {});
    } finally {
      await page.close();
    }
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const [name, seed] of Object.entries(seeds)) await shoot(browser, name, seed);
  await browser.close();
  console.log('ui shots ->', OUT);
}
void main();
