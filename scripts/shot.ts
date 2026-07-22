/**
 * Dev screenshot helper: drives the running dev server with headless Chrome
 * and saves screenshots (desktop + phone) so art/feel can be reviewed.
 *   npx tsx scripts/shot.ts [outDir]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'sim-out/shots';
const URL = 'http://localhost:5173';

async function chipSpree(page: Page, times: number): Promise<void> {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) return;
  for (let i = 0; i < times; i++) {
    const x = box.x + box.width * (0.3 + 0.4 * Math.random());
    const y = box.y + box.height * (0.3 + 0.4 * Math.random());
    await page.mouse.click(x, y);
    await page.waitForTimeout(60);
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  // --- Desktop ---
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  desktop.on('pageerror', (err) => console.error('[pageerror]', err.stack ?? err.message));
  const seenErrors = new Set<string>();
  desktop.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      const t = msg.text();
      if (seenErrors.has(t.slice(0, 60))) return; // once per distinct error
      seenErrors.add(t.slice(0, 60));
      console.error(`[console.${msg.type()}]`, t.slice(0, 1600));
    }
  });
  await desktop.goto(URL);
  await desktop.waitForSelector('canvas', { timeout: 15000 });
  await desktop.waitForTimeout(1200);
  await desktop.screenshot({ path: `${OUT}/desktop-fresh.png` });

  // Chip around, buy an upgrade, screenshot the action.
  await chipSpree(desktop, 14);
  await desktop.screenshot({ path: `${OUT}/desktop-chipping.png` });
  await desktop.waitForTimeout(400);

  // Debug-boost into midgame to see kiln/drills/collapse UI.
  await desktop.getByRole('button', { name: 'Vault' }).click();
  for (let i = 0; i < 3; i++) await desktop.getByRole('button', { name: '+10K Dust' }).click();
  await desktop.getByRole('button', { name: '+100 Brick' }).click();
  await desktop.getByRole('button', { name: '+50 Cores' }).click();
  await desktop.getByRole('button', { name: 'Dig', exact: true }).click();
  await desktop.getByRole('button', { name: /Raise the Kiln/ }).locator('..').locator('button').first().click().catch(() => {});
  // Buy the kiln via its Build button.
  const buildBtn = desktop.getByRole('button', { name: /Build ·/ });
  if (await buildBtn.count()) await buildBtn.first().click();
  await desktop.waitForTimeout(300);
  // The bay is depth-gated now — raise the record via the dev hook.
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    engine.getState().maxDepthRecord = 60;
  });
  await desktop.waitForTimeout(300);
  await desktop.getByRole('button', { name: 'Drills' }).click();
  const bayBtn = desktop.getByRole('button', { name: /Build ·/ });
  if (await bayBtn.count()) await bayBtn.first().click();
  await desktop.waitForTimeout(200);
  // Add several drills.
  for (let i = 0; i < 5; i++) {
    const buy = desktop.getByRole('button', { name: /^Buy ·/ });
    if (await buy.count()) await buy.first().click();
    await desktop.waitForTimeout(120);
  }
  await desktop.waitForTimeout(2500);
  await desktop.screenshot({ path: `${OUT}/desktop-drills.png` });

  await desktop.getByRole('button', { name: 'Kiln', exact: true }).click();
  await desktop.waitForTimeout(3000);
  await desktop.screenshot({ path: `${OUT}/desktop-kiln.png` });

  await desktop.getByRole('button', { name: 'Delver' }).click();
  await desktop.waitForTimeout(300);
  await desktop.screenshot({ path: `${OUT}/desktop-delver.png` });

  await desktop.getByRole('button', { name: 'Grid' }).click();
  await desktop.waitForTimeout(300);
  await desktop.screenshot({ path: `${OUT}/desktop-grid.png` });

  // Hold-descend 16 times to surface the Collapse tab.
  const descend = desktop.getByRole('button', { name: /Descend/ });
  for (let i = 0; i < 16; i++) {
    const box = await descend.boundingBox();
    if (!box) break;
    await desktop.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await desktop.mouse.down();
    await desktop.waitForTimeout(800);
    await desktop.mouse.up();
    await desktop.waitForTimeout(80);
  }
  await desktop.getByRole('button', { name: 'Collapse', exact: true }).click();
  await desktop.waitForTimeout(300);
  await desktop.screenshot({ path: `${OUT}/desktop-collapse.png` });

  // Offline modal via the debug button.
  await desktop.getByRole('button', { name: 'Vault' }).click();
  await desktop.getByRole('button', { name: 'Offline 8h' }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-offline.png` });
  await desktop.getByRole('button', { name: 'Back to the dig' }).click();

  // --- The Lattice (via the dev engine hook) -------------------------------
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.lattice.unlocked = true;
    s.lattice.rings = 2;
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'motif', amount: 300 });
  });
  await desktop.getByRole('button', { name: 'Lattice' }).click();
  await desktop.waitForTimeout(600);
  await desktop.screenshot({ path: `${OUT}/desktop-lattice-empty.png` });

  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    // A triangle chord (with one rank-2: mixed), a flow pair, a near-line hum.
    engine.dispatch({ type: 'placeMotif', q: -1, r: 0, shape: 'triangle', rank: 1 });
    engine.dispatch({ type: 'placeMotif', q: 0, r: 0, shape: 'triangle', rank: 2 });
    engine.dispatch({ type: 'placeMotif', q: 1, r: 0, shape: 'triangle', rank: 1 });
    engine.dispatch({ type: 'placeMotif', q: -1, r: 2, shape: 'circle', rank: 1 });
    engine.dispatch({ type: 'placeMotif', q: 0, r: 1, shape: 'square', rank: 2 });
    engine.dispatch({ type: 'placeMotif', q: 1, r: -2, shape: 'hex', rank: 1 });
    engine.dispatch({ type: 'placeMotif', q: 0, r: -1, shape: 'hex', rank: 1 });
  });
  await desktop.waitForTimeout(700);
  await desktop.screenshot({ path: `${OUT}/desktop-lattice-chord.png` });
  await desktop.waitForTimeout(2600);
  await desktop.screenshot({ path: `${OUT}/desktop-lattice-later.png` });

  // --- The Hold + the Forge (Phase 3) --------------------------------------
  await desktop.evaluate(() => {
    // tsx/esbuild injects __name() around inner functions; shim it in-page.
    (window as unknown as Record<string, unknown>)['__name'] ??= (f: unknown) => f;
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    const add = (id: string, purity: number, count: number) => {
      const band = purity >= 95 ? 'exalted' : purity >= 80 ? 'fine' : purity >= 60 ? 'good' : purity >= 40 ? 'fair' : 'poor';
      s.materials.stacks[id] ??= {};
      s.materials.stacks[id][band] ??= { count: 0, puritySum: 0 };
      s.materials.stacks[id][band].count += count;
      s.materials.stacks[id][band].puritySum += purity * count;
      s.materials.totalDrops += count;
      if (!s.assay.knownMaterials.includes(id)) s.assay.knownMaterials.push(id);
    };
    add('marl', 48, 14); add('marl', 84, 3); add('ochre', 45, 8); add('bonechalk', 52, 6);
    add('graveclay', 38, 5); add('loamiron', 62, 9); add('rootglass', 55, 4); add('duskflint', 58, 7);
    add('umberjade', 71, 6); add('wormsteel', 66, 5); add('hollowamber', 90, 2);
    add('palegold', 31, 1); add('starmarl', 78, 1); add('weepstone', 97, 1);
    s.materials.gems['bloodgarnet'] = 1;
    s.materials.gems['hearthstone'] = 2;
    s.materials.geodes = 3;
    s.materials.geodesCracked = 1;
    s.forge.built = true;
    s.delver.skills['assayersHunch'] = 2;
    s.assay.reportDepth = 62;
    s.depth = 62;
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'brick', amount: 200 });
  });
  await desktop.getByRole('button', { name: 'Hold', exact: true }).click();
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: `${OUT}/desktop-hold.png` });

  await desktop.getByRole('button', { name: 'Forge', exact: true }).click();
  await desktop.waitForTimeout(400);
  // Craft a tier II pick so a real tool with a socket shows.
  const forgeBtn = desktop.getByRole('button', { name: /Forge · 12/ });
  if (await forgeBtn.count()) await forgeBtn.first().click();
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: `${OUT}/desktop-forge.png` });
  await desktop.evaluate(() => window.scrollTo(0, 0));

  // Wall warning in the depth bar (tier I tool at depth 44).
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.depth = 44;
    s.forge.equipped = 0; // back to the Delver's Pick
  });
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-wall.png` });

  // --- THE BREACH (Phase 4) ------------------------------------------------
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    const Dec = s.currencies.dust.constructor;
    s.depth = 150;
    s.depthRecords.loam = 150;
    s.shell.coresEarnedThisBreach = new Dec(800);
    s.forge.equipped = s.forge.tools.length - 1;
  });
  await desktop.getByRole('button', { name: 'Collapse', exact: true }).click();
  await desktop.waitForTimeout(400);
  // The Tapmother stands between us and the floor shot (Phase 5).
  await desktop.screenshot({ path: `${OUT}/desktop-warden-loam.png` });
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.combat.wardens.push('loam');
    s.combat.seen.push('tapmother');
    s.combat.kills['tapmother'] = 1;
  });
  await desktop.waitForTimeout(300);
  await desktop.screenshot({ path: `${OUT}/desktop-floor.png` });
  await desktop.evaluate(() => window.dispatchEvent(new CustomEvent('hollow:breach')));
  await desktop.waitForTimeout(700);
  await desktop.screenshot({ path: `${OUT}/desktop-breach-quake.png` });
  await desktop.waitForTimeout(2700);
  await desktop.screenshot({ path: `${OUT}/desktop-breach-title.png` });
  await desktop.waitForTimeout(2200);

  // Ferrite: polarity face, chains, magnets.
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'ingot', amount: 50000 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'scale', amount: 2000 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'flux', amount: 2000 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'lodestone', amount: 2000 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'rime', amount: 500 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'echo', amount: 6 });
    s.depthRecords.ferrite = 60; // mastery 6
    for (let i = 0; i < 4; i++) engine.dispatch({ type: 'buyMagnet' });
  });
  await desktop.waitForTimeout(400);
  // Chip a chain along same-signed cells.
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.polarity.signs.fill(1);
    for (const cell of [7, 8, 9, 14, 15]) {
      engine.dispatch({ type: 'chip', cell });
      s.polarity.signs.fill(1);
    }
  });
  await desktop.waitForTimeout(250);
  await desktop.screenshot({ path: `${OUT}/desktop-ferrite-face.png` });

  // Crucible: add a catalyst, pour one true.
  await desktop.evaluate(() => {
    (window as unknown as Record<string, unknown>)['__name'] ??= (f: unknown) => f;
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.materials.stacks['bluesteel'] = { good: { count: 6, puritySum: 6 * 72 } };
    engine.dispatch({ type: 'pourAlloy', amounts: [2, 1, 0, 0, 0], catalystId: 'bluesteel' });
    engine.dispatch({ type: 'pourAlloy', amounts: [1, 0, 0, 2, 0], catalystId: 'bluesteel' });
    engine.dispatch({ type: 'pourAlloy', amounts: [3, 2, 1, 0, 0], catalystId: 'bluesteel' });
  });
  await desktop.getByRole('button', { name: 'Crucible' }).click();
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: `${OUT}/desktop-crucible.png` });

  await desktop.getByRole('button', { name: 'Foundry' }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-foundry.png` });

  // --- COMBAT (Phase 5) ----------------------------------------------------
  // Seed combat drops + a lived-in bestiary.
  await desktop.evaluate(() => {
    (window as unknown as Record<string, unknown>)['__name'] ??= (f: unknown) => f;
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    const add = (id: string, purity: number, count: number) => {
      const band = purity >= 95 ? 'exalted' : purity >= 80 ? 'fine' : purity >= 60 ? 'good' : purity >= 40 ? 'fair' : 'poor';
      s.materials.stacks[id] ??= {};
      s.materials.stacks[id][band] ??= { count: 0, puritySum: 0 };
      s.materials.stacks[id][band].count += count;
      s.materials.stacks[id][band].puritySum += purity * count;
      s.materials.totalDrops += count;
      if (!s.assay.knownMaterials.includes(id)) s.assay.knownMaterials.push(id);
    };
    add('chitinshard', 55, 12); add('wormsilk', 60, 8); add('gravemote', 50, 8); add('burrowertooth', 55, 6);
    add('scalebackplate', 60, 10); add('ironsinew', 58, 8); add('voltgland', 55, 8); add('magnetheart', 62, 3);
    const seen = ['marlgrub', 'chalkmite', 'dustwisp', 'rootlasher', 'gravegnaw', 'marlhopper', 'chalkshell',
      'silkweaver', 'mournmoth', 'tunnelwight', 'clayback', 'scaleback', 'voltmite', 'lodecrab', 'fluxleech'];
    for (const id of seen) if (!s.combat.seen.includes(id)) s.combat.seen.push(id);
    Object.assign(s.combat.kills, {
      marlgrub: 14, chalkmite: 9, dustwisp: 5, rootlasher: 3, gravegnaw: 3, marlhopper: 2, chalkshell: 4,
      silkweaver: 1, mournmoth: 3, tunnelwight: 1, clayback: 3, scaleback: 6, voltmite: 2, lodecrab: 1, fluxleech: 3,
    });
    Object.assign(s.combat.stats, { encounters: 61, wins: 49, losses: 7, perfects: 23 });
  });
  await desktop.waitForTimeout(4600); // let the achievement toasts clear
  await desktop.getByRole('button', { name: 'Bestiary' }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-bestiary.png` });

  // The gear bench in the Forge.
  await desktop.getByRole('button', { name: 'Forge', exact: true }).click();
  await desktop.getByText('The other bench — gear').scrollIntoViewIfNeeded();
  await desktop.waitForTimeout(300);
  await desktop.screenshot({ path: `${OUT}/desktop-gear.png` });

  // An encounter rises out of the rock (a known species — named banner).
  await desktop.getByRole('button', { name: 'Dig', exact: true }).click();
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.combat.pending = { speciesId: 'scaleback', expiresAtSec: s.stats.playTimeSec + 30 };
  });
  await desktop.waitForTimeout(300);
  await desktop.screenshot({ path: `${OUT}/desktop-encounter.png` });

  // Engage: lanes, telegraph, beat bar.
  await desktop.getByRole('button', { name: 'Engage' }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-combat.png` });
  await desktop.getByRole('button', { name: '▶' }).click();
  await desktop.getByRole('button', { name: 'STRIKE' }).click();
  await desktop.waitForTimeout(300);
  await desktop.screenshot({ path: `${OUT}/desktop-combat-beat.png` });

  // The Loadstar at the Ferrite floor.
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.combat.active = null;
    s.depth = 250;
    s.depthRecords.ferrite = 250;
    s.maxDepthRecord = 250; // the Collapse tab keys off this per-shell record
  });
  await desktop.waitForTimeout(4600); // depth achievements toast; let them pass
  await desktop.getByRole('button', { name: 'Collapse', exact: true }).click();
  await desktop.waitForTimeout(300);
  await desktop.screenshot({ path: `${OUT}/desktop-warden-ferrite.png` });
  await desktop.getByRole('button', { name: 'Face it yourself' }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-warden-fight.png` });
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    engine.getState().combat.active = null;
  });

  // --- THE GUILD (Phase 6) -------------------------------------------------
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.collapse.count = 26; // opens the stair; Ashwalker within reach
    s.stats.manualChips = 11000;
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'scrip', amount: 2400 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'renown', amount: 140 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'charter', amount: 1 });
    // A lived-in hall: reps, the ledger, some story.
    s.guild.npcs['marrow'] = { rep: 120, met: true, questStep: 2 };
    s.guild.npcs['vess'] = { rep: 260, met: true, questStep: 2 };
    s.guild.npcs['quill'] = { rep: 45, met: true, questStep: 2 };
    s.guild.npcs['neev'] = { rep: 20, met: true, questStep: 1 };
    s.guild.vess = { trust: 12, grudge: 2, deals: 14 };
    const loamPages = ['p02','p03','p05','p06','p08','p09','p11','p12','p14','p15','p17','p18','p21'];
    const ferritePages = ['p22','p25','p29','p31','p41'];
    s.guild.sable.found.push(...loamPages, ...ferritePages);
    s.guild.sable.translated.push(...loamPages, 'p22', 'p25', 'p29');
    s.guild.sable.read.push(...loamPages.slice(0, 10), 'p22');
  });
  await desktop.waitForTimeout(1600); // the guild tick: arrivals, board, titles
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    engine.dispatch({ type: 'hire', npcId: 'sef' });
    engine.dispatch({ type: 'hire', npcId: 'tally' });
    engine.dispatch({ type: 'hire', npcId: 'pell' });
  });
  await desktop.waitForTimeout(4600); // toasts pass
  await desktop.getByRole('button', { name: 'Guild', exact: true }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-guild-hall.png` });

  await desktop.locator('button[title^="Marrow — Smith"]').click();
  await desktop.waitForTimeout(300);
  await desktop.screenshot({ path: `${OUT}/desktop-guild-marrow.png` });

  await desktop.locator('button[title^="Vess — Merchant"]').click();
  await desktop.waitForTimeout(300);
  await desktop.screenshot({ path: `${OUT}/desktop-guild-vess.png` });

  await desktop.getByText('The Board', { exact: true }).scrollIntoViewIfNeeded();
  await desktop.waitForTimeout(250);
  await desktop.screenshot({ path: `${OUT}/desktop-guild-board.png` });

  await desktop.getByText("Serra's Caravan").scrollIntoViewIfNeeded();
  await desktop.waitForTimeout(250);
  await desktop.screenshot({ path: `${OUT}/desktop-guild-road.png` });

  await desktop.getByRole('button', { name: /Sal's Book of Names/ }).click();
  await desktop.getByRole('button', { name: /Sal's Book of Names/ }).scrollIntoViewIfNeeded();
  await desktop.waitForTimeout(300);
  await desktop.screenshot({ path: `${OUT}/desktop-guild-titles.png` });

  // The Journal — her hand, and the cipher.
  await desktop.getByRole('button', { name: 'Journal', exact: true }).click();
  await desktop.waitForTimeout(300);
  await desktop.screenshot({ path: `${OUT}/desktop-journal.png` });
  await desktop.getByRole('button', { name: /p\.21/ }).click();
  await desktop.waitForTimeout(300);
  await desktop.screenshot({ path: `${OUT}/desktop-journal-page.png` });
  await desktop.getByRole('button', { name: /p\.31/ }).click();
  await desktop.waitForTimeout(300);
  await desktop.screenshot({ path: `${OUT}/desktop-journal-cipher.png` });

  // --- VERDANCE (Phase 7) --------------------------------------------------
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.shell.current = 'verdance';
    s.shell.breachCount = 2;
    s.shell.signatures = ['seepage', 'polarity'];
    s.depthRecords['verdance'] = 65;
    s.depth = 40;
    s.maxDepthRecord = 65;
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'spore', amount: 40000 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'sap', amount: 900 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'chlorophyll', amount: 120 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'humus', amount: 400 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'resin', amount: 90 });
    // A face mid-cultivation: ages, fruit, one feral quarter.
    const n = s.face.cells.length;
    s.growth.stage = new Array(n).fill(0);
    s.growth.fruit = new Array(n).fill(0);
    s.growth.age = new Array(n).fill(0);
    s.growth.fullSince = new Array(n).fill(0);
    const w = s.face.w;
    for (let i = 0; i < n; i++) {
      const x = i % w;
      const y = Math.floor(i / w);
      if (x < 3 && y < 3) {
        s.growth.stage[i] = 4;
        s.growth.fruit[i] = 200 + (i % 3) * 120;
      } else if (x >= w - 2 && y >= 3) {
        s.growth.stage[i] = Math.min(3, 1 + ((x + y) % 3));
        s.growth.fruit[i] = 40 * s.growth.stage[i];
      }
    }
    // Bloom Season if we can find it on the clock.
    for (let seg = 0; seg < 300; seg++) {
      s.guild.clockMs = seg * 50 * 60_000 + 1;
      const weather = (window as unknown as Record<string, any>)['__engine']; // segment scan below via UI read
      void weather;
      break;
    }
  });
  await desktop.waitForTimeout(4800); // arrivals + achievements toast past
  await desktop.getByRole('button', { name: 'Dig', exact: true }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-verdance-face.png` });

  // The Greenhouse: beds mid-breeding, a mature hybrid standing.
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.greenhouse.seeds = { lampmoss: 2, cablevine: 1, boltcap: 1, hushfern: 1 };
    s.greenhouse.codex = ['lampmoss', 'cablevine', 'boltcap', 'hushfern', 'hy.cablevine+lampmoss'];
    s.greenhouse.seeds['hy.cablevine+lampmoss'] = 1;
    s.greenhouse.plots = [
      { speciesId: 'lampmoss', progressMs: 11 * 60000 },
      { speciesId: 'boltcap', progressMs: 16 * 60000 },
      { speciesId: 'hy.cablevine+lampmoss', progressMs: 99 * 60000 },
      null,
    ];
  });
  await desktop.getByRole('button', { name: 'Greenhouse' }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-greenhouse.png` });

  // The Loom: a committed weave with a figure in it.
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.loom.threads = { silkS: 4, rootZ: 14, rootS: 4, ironZ: 2 };
    for (let i = 0; i < 6; i++) {
      engine.dispatch({ type: 'setThread', axis: 'warp', index: i, threadId: i === 0 ? 'silkS' : 'rootZ' });
      engine.dispatch({ type: 'setThread', axis: 'weft', index: i, threadId: i < 4 ? 'rootZ' : 'rootS' });
    }
    engine.dispatch({ type: 'commitWeave' });
  });
  await desktop.getByRole('button', { name: 'Loom' }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-loom.png` });

  // The Still: a cellar with the three named brews, one active.
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.brewing.discovered = ['longlight', 'ironblood', 'sablesDraught'];
    s.brewing.doses = { longlight: 2, ironblood: 1, sablesDraught: 1 };
    s.brewing.lastHint = 'The dregs smell almost right — more spore, perhaps.';
    engine.dispatch({ type: 'drinkBrew', brewId: 'longlight' });
  });
  await desktop.getByRole('button', { name: 'Still' }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-brew.png` });

  // The Mycelium: a fed cluster mid-wander.
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.mycelium.nodes = {
      '0-0': 'marrowcap', '0-1': 'marrowcap', '1-0': 'dewthread', '1-1': 'lanterngill',
      '2-0': 'marrowcap', '2-1': 'burrowlace', '0-2': 'sporefather',
    };
    s.mycelium.reserve = 120;
  });
  await desktop.getByRole('button', { name: 'Mycelium' }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-mycelium.png` });

  // --- GLASSMERE (Phase 8) -------------------------------------------------
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.shell.current = 'glassmere';
    s.shell.breachCount = 3;
    s.shell.signatures = ['seepage', 'polarity', 'growth'];
    s.depthRecords['glassmere'] = 250; // mastery 25: Wavelength Split lit
    s.depth = 120;
    s.maxDepthRecord = 250;
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'prism', amount: 60000 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'lumen', amount: 1200 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'silica', amount: 800 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'spectrum', amount: 240 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'frost', amount: 30 });
    // Clear the vines so the beam is the event; leave two young ones to bend it.
    const n = s.face.cells.length;
    const w = s.face.w;
    s.growth.stage = new Array(n).fill(0);
    s.growth.fruit = new Array(n).fill(0);
    // A charged face with two full lenses on the beam's road (cap ~8 here).
    for (let i = 0; i < n; i++) s.face.cells[i] = ((i * 7) % 10) / 10 * 5;
    s.face.cells[1 * w + 1] = 8; // amplifier on the entry row
    s.face.cells[3 * w + 3] = 8; // amplifier on the return road
    // Route a Z of light: right along row 1, down col 2, right along row 3, up col 4.
    s.refraction.entryRow = 1;
    s.refraction.mirrorStock = 6;
    s.refraction.mirrors = {};
    s.refraction.mirrors[1 * w + 2] = '\\';
    s.refraction.mirrors[3 * w + 2] = '\\';
    s.refraction.mirrors[3 * w + 4] = '/';
    s.refraction.pathDirty = true;
  });
  await desktop.waitForTimeout(4800); // depth/breach toasts pass; beam traces
  await desktop.getByRole('button', { name: 'Dig', exact: true }).click();
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: `${OUT}/desktop-glassmere-face.png` });

  // The Observatory: an exposure running, a sky half-collected.
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.observatory.pieces = {
      'pick.0': 1, 'pick.1': 1, 'pick.2': 1, 'pick.3': 1,
      'lamp.0': 1, 'lamp.2': 1, 'moth.1': 1, 'stair.0': 1, 'stair.3': 1,
    };
    s.observatory.constellations = ['pick'];
    s.observatory.completed = 9;
    engine.dispatch({ type: 'startObservation', tier: 2 });
    s.observatory.active.startedMs -= 150 * 60_000; // mid-exposure
  });
  await desktop.getByRole('button', { name: 'Stars' }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-observatory.png` });

  // The Refraction Bench: a lesson with mirrors mid-thought.
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.bench.solved = ['auth11', 'auth23', 'auth37'];
    s.bench.equippedLens = 'auth23';
  });
  await desktop.getByRole('button', { name: 'Bench' }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-bench.png` });

  // The Warrens: the index, then one room's door.
  await desktop.getByRole('button', { name: 'Warrens' }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-warrens.png` });
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    engine.dispatch({ type: 'warrenEnter', id: 'frostgallery' });
  });
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-warren-inside.png` });
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    engine.dispatch({ type: 'warrenLeave' });
  });

  // Runes: an inventory, a grammar half-learned, one fouled surface.
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.runes.found = { kel: 3, thur: 2, mol: 1, sen: 2, vey: 1, ash: 1 };
    s.runes.pairsSeen = ['kel|thur', 'sen|vey', 'mol|ash'];
    s.runes.inscriptions.tool = ['kel', 'thur', null];
    s.runes.fouled = { lantern: true };
  });
  await desktop.getByRole('button', { name: 'Runes' }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-runes.png` });

  // --- CINDER (Phase 9) ----------------------------------------------------
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.shell.current = 'cinder';
    s.shell.breachCount = 4;
    s.shell.signatures = ['seepage', 'polarity', 'growth', 'refraction'];
    s.depthRecords['cinder'] = 120;
    s.depth = 120;
    s.maxDepthRecord = 250;
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'slag', amount: 90000 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'ember', amount: 800 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'obsidian', amount: 900 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'pyre', amount: 60 });
    const n = s.face.cells.length;
    s.growth.stage = new Array(n).fill(0);
    s.growth.fruit = new Array(n).fill(0);
    s.refraction.mirrors = {};
    for (let i = 0; i < n; i++) s.face.cells[i] = ((i * 7) % 10) / 10 * 5;
    // A worked network and a warm-but-safe shaft: the ordinary hot day.
    s.pressure.pipes = new Array(35).fill(0);
    for (const c of [14, 15, 16, 17, 18, 19, 20, 3, 10, 17]) s.pressure.pipes[c] = 1;
    s.pressure.heat = 62;
    s.guild.hirelings['pell'] = { level: 3, xp: 900, status: 'well', hiredAtMs: 0 };
    s.guild.hirelings['grist'] = { level: 2, xp: 500, status: 'well', hiredAtMs: 100 };
  });
  await desktop.waitForTimeout(4800);
  await desktop.getByRole('button', { name: 'Dig', exact: true }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-cinder-face.png` });

  // The greedy line: choked vents + overdrive hold the pin — klaxon standing.
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    engine.dispatch({ type: 'setChoke', on: true });
    s.ember.overdrive = true; // sources outpace the choked vent: 100 HOLDS
    s.pressure.heat = 100;
    s.pressure.fuseAtSec = s.stats.playTimeSec - 3;
    s.pressure.lastStokeSec = s.stats.playTimeSec;
  });
  await desktop.waitForTimeout(600);
  await desktop.evaluate(() => {
    // Overdrive auto-kills at klaxon entry; re-arm so the countdown HOLDS
    // for the shot (a rider's hand doing exactly this is the failure story).
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.ember.overdrive = true;
    s.pressure.choke = true;
    s.pressure.heat = 100;
    s.pressure.lastStokeSec = s.stats.playTimeSec;
  });
  await desktop.waitForTimeout(600);
  await desktop.screenshot({ path: `${OUT}/desktop-cinder-overpressure.png` });
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    engine.dispatch({ type: 'emergencyPurge' });
    engine.dispatch({ type: 'setChoke', on: false });
  });
  await desktop.waitForTimeout(600);

  await desktop.getByRole('button', { name: 'Vents', exact: true }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-vents.png` });

  // The Array mid-burn.
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    engine.dispatch({ type: 'buyFuel', fuelId: 'emberbillet', count: 6 });
    for (const c of [14, 15, 16, 21, 22]) engine.dispatch({ type: 'placeFuel', cell: c, fuelId: 'emberbillet' });
    engine.dispatch({ type: 'lightCell', cell: 14 });
    engine.dispatch({ type: 'lightCell', cell: 21 });
    s.ember.temp = 56;
    s.ember.sustainSec = 74;
    s.ember.bestSustainSec = 312;
  });
  await desktop.getByRole('button', { name: 'Array' }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-array.png` });

  // The Wells with a rope down and the odds posted.
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    engine.dispatch({ type: 'commitWell', wellId: 'nearWell', amount: 800 });
    s.wells.rolls = 7;
    s.wells.wins = 2;
    s.wells.losses = 5;
  });
  await desktop.getByRole('button', { name: 'Wells' }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-wells.png` });

  // An anomaly asking politely.
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.anomalies.active = { id: 'strayMerchant', startedAtPlaySec: s.stats.playTimeSec };
  });
  await desktop.getByRole('button', { name: 'Dig', exact: true }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-anomaly.png` });

  // --- Phone ---
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await phone.goto(URL);
  await phone.waitForSelector('canvas', { timeout: 15000 });
  await phone.waitForTimeout(1200);
  await phone.screenshot({ path: `${OUT}/phone-fresh.png` });

  // Phone: the Lattice.
  await phone.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.lattice.unlocked = true;
    s.lattice.rings = 2;
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'motif', amount: 100 });
    engine.dispatch({ type: 'placeMotif', q: -1, r: 0, shape: 'triangle', rank: 1 });
    engine.dispatch({ type: 'placeMotif', q: 0, r: 0, shape: 'triangle', rank: 1 });
    engine.dispatch({ type: 'placeMotif', q: 1, r: 0, shape: 'triangle', rank: 1 });
    engine.dispatch({ type: 'placeMotif', q: 0, r: 1, shape: 'circle', rank: 1 });
  });
  await phone.getByRole('button', { name: 'Lattice' }).click();
  await phone.waitForTimeout(700);
  await phone.screenshot({ path: `${OUT}/phone-lattice.png` });

  // Phone: an encounter and the fight, one-handed.
  await phone.getByRole('button', { name: 'Dig', exact: true }).click();
  await phone.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.depth = 20;
    s.combat.pending = { speciesId: 'marlgrub', expiresAtSec: s.stats.playTimeSec + 30 };
  });
  await phone.waitForTimeout(300);
  await phone.screenshot({ path: `${OUT}/phone-encounter.png` });
  await phone.getByRole('button', { name: 'Engage' }).click();
  await phone.waitForTimeout(400);
  await phone.screenshot({ path: `${OUT}/phone-combat.png` });

  // Phone: the Lamphouse, one-thumbed.
  await phone.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.combat.active = null;
    s.combat.pending = null;
    s.collapse.count = 1;
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'scrip', amount: 300 });
    s.guild.sable.found.push('p02', 'p05', 'p08');
    s.guild.sable.translated.push('p02', 'p05', 'p08');
  });
  await phone.waitForTimeout(1600);
  await phone.getByRole('button', { name: 'Guild', exact: true }).click();
  await phone.waitForTimeout(5000); // toasts pass
  await phone.screenshot({ path: `${OUT}/phone-guild.png` });
  await phone.getByRole('button', { name: 'Journal', exact: true }).click();
  await phone.getByText('p.5', { exact: true }).click();
  await phone.waitForTimeout(300);
  await phone.screenshot({ path: `${OUT}/phone-journal.png` });

  // Phone: a green face, one-thumbed.
  await phone.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.shell.current = 'verdance';
    s.shell.breachCount = 2;
    s.depthRecords['verdance'] = 30;
    s.depth = 25;
    const n = s.face.cells.length;
    s.growth.stage = new Array(n).fill(0);
    s.growth.fruit = new Array(n).fill(0);
    s.growth.age = new Array(n).fill(0);
    s.growth.fullSince = new Array(n).fill(0);
    for (let i = 0; i < n; i += 3) {
      s.growth.stage[i] = 1 + (i % 4);
      s.growth.fruit[i] = 60 * (1 + (i % 4));
    }
  });
  await phone.getByRole('button', { name: 'Dig', exact: true }).click();
  await phone.waitForTimeout(4800);
  await phone.screenshot({ path: `${OUT}/phone-verdance.png` });

  // Phone: frozen light, one-thumbed — the beam and its controls.
  await phone.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.shell.current = 'glassmere';
    s.shell.breachCount = 3;
    s.depthRecords['glassmere'] = 60;
    s.depth = 45;
    const n = s.face.cells.length;
    const w = s.face.w;
    s.growth.stage = new Array(n).fill(0);
    s.growth.fruit = new Array(n).fill(0);
    for (let i = 0; i < n; i++) s.face.cells[i] = ((i * 7) % 10) / 10 * 5;
    s.refraction.entryRow = 1;
    s.refraction.mirrorStock = 4;
    s.refraction.mirrors = {};
    s.refraction.mirrors[1 * w + 3] = '\\';
    s.refraction.mirrors[3 * w + 3] = '/';
    s.refraction.pathDirty = true;
  });
  await phone.waitForTimeout(4800);
  await phone.screenshot({ path: `${OUT}/phone-glassmere.png` });

  // Phone: the burnt shell running hot, one-thumbed.
  await phone.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.shell.current = 'cinder';
    s.shell.breachCount = 4;
    s.depthRecords['cinder'] = 80;
    s.depth = 65;
    const n = s.face.cells.length;
    s.growth.stage = new Array(n).fill(0);
    s.refraction.mirrors = {};
    for (let i = 0; i < n; i++) s.face.cells[i] = ((i * 7) % 10) / 10 * 5;
    s.pressure.heat = 88;
    s.pressure.lastStokeSec = s.stats.playTimeSec;
    s.pressure.choke = true;
  });
  await phone.waitForTimeout(4800);
  await phone.screenshot({ path: `${OUT}/phone-cinder.png` });

  // --- THE HOLLOW + ALEPH (Phase 10) ---------------------------------------
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.shell.current = 'hollow';
    s.shell.breachCount = 5;
    s.shell.signatures = ['seepage', 'polarity', 'growth', 'refraction', 'pressure'];
    s.depthRecords['hollow'] = 220;
    s.depth = 140;
    s.maxDepthRecord = 470;
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'void', amount: 5e8 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'resonance', amount: 400 });
    s.hollow.silence = 62;
    s.hollow.listenAt = 70;
    s.hollow.silenceHarvested = 840;
    // A half-rebuilt face: the front rows remembered, the rest still absence.
    s.hollow.rebuilt = [];
    for (let i = 0; i < 16; i++) s.hollow.rebuilt.push(i);
    for (let i = 0; i < s.face.cells.length; i++) s.face.cells[i] = s.hollow.rebuilt.includes(i) ? ((i * 7) % 10) / 10 * 5 : 0;
    s.growth.stage = new Array(s.face.cells.length).fill(0);
    s.refraction.mirrors = {};
    s.chamber.tape = [
      { action: { type: 'chip', cell: 0 }, label: 'chip 0' },
      { action: { type: 'chip', cell: 1 }, label: 'chip 1' },
      { action: { type: 'listen' }, label: 'listen' },
    ];
    s.chamber.running = true;
    s.chamber.trace = [1.2e4, 9.8e3, 3.1e5];
    s.chamber.cursor = 1;
    s.chamber.loops = 47;
    s.chamber.bestEfficiency = 1.06e5;
  });
  await desktop.waitForTimeout(4800);
  await desktop.getByRole('button', { name: 'Dig', exact: true }).click();
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: `${OUT}/desktop-hollow-face.png` });

  await desktop.getByRole('button', { name: 'Silence', exact: true }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-hollow.png` });

  await desktop.getByRole('button', { name: 'Chamber', exact: true }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-chamber.png` });

  // Aleph: the Core, the Rewrite, the Parallel View.
  await desktop.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.shell.current = 'aleph';
    s.shell.breachCount = 6;
    s.depthRecords['aleph'] = 40;
    s.depth = 40;
    s.combat.wardens.push('loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph');
    s.aleph.coreTouched = true;
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'echo', amount: 120 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'axiom', amount: 3 });
    s.recursion.axioms = ['unemptying', 'twoHands'];
    s.recursion.count = 1;
    for (const id of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow']) s.depthRecords[id] = { loam: 150, ferrite: 250, verdance: 290, glassmere: 380, cinder: 470, hollow: 560 }[id];
  });
  await desktop.waitForTimeout(600);
  await desktop.getByRole('button', { name: 'Rewrite', exact: true }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-rewrite.png` });

  await desktop.getByRole('button', { name: 'All', exact: true }).click();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${OUT}/desktop-parallel.png` });

  // Phone: the void, one-thumbed.
  await phone.evaluate(() => {
    const engine = (window as unknown as Record<string, any>)['__engine'];
    const s = engine.getState();
    s.shell.current = 'hollow';
    s.shell.breachCount = 5;
    s.depthRecords['hollow'] = 120;
    s.depth = 80;
    s.hollow.silence = 48;
    s.hollow.rebuilt = [];
    for (let i = 0; i < 9; i++) s.hollow.rebuilt.push(i);
    for (let i = 0; i < s.face.cells.length; i++) s.face.cells[i] = s.hollow.rebuilt.includes(i) ? 3 : 0;
    s.growth.stage = new Array(s.face.cells.length).fill(0);
    s.refraction.mirrors = {};
  });
  await phone.waitForTimeout(4800);
  await phone.screenshot({ path: `${OUT}/phone-hollow.png` });

  await browser.close();
  console.log('shots ->', OUT);
}

void main();
