/**
 * THE DRILL BAY — the standing verifier for the panel. Reads TEXT.
 *
 * Five things the rework claims, each driven in the real panel and confirmed
 * against the ENGINE, plus the reach check. The claims are deliberately
 * phrased as the player would feel them, not as the code does — "the budget
 * constrains" rather than "bayLoadFactor returns < 1", because the second can
 * be true while the panel says nothing about it.
 *
 *   npx tsx scripts/verify-bay.ts [port] [outDir]
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

/** innerText returns RENDERED text, so anything under `uppercase` shouts. */
const text = async (page: Page): Promise<string> =>
  (await page.locator('body').innerText()).replace(/\s+/g, ' ');
const has = (t: string, s: string): boolean => t.toLowerCase().includes(s.toLowerCase());

/** The bay as the ENGINE sees it — every behavioural claim is checked here. */
const bay = async (page: Page) =>
  page.evaluate(async () => {
    const d = await import(/* @vite-ignore */ '/src/engine/systems/drills' + '.ts');
    const mods = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const s = (window as unknown as Record<string, any>)['__engine'].getState();
    const cache = new mods.ModifierCache();
    return {
      drills: s.drills.units.length,
      supply: d.baySupply(s),
      draw: d.bayDraw(s),
      load: d.bayLoadFactor(s),
      seam: d.seamOf(s),
      stale: d.bayStaleness(s),
      found: s.drills.synergiesFound,
      live: d.activeSynergies(s).map((x: { id: string }) => x.id),
      power: s.drills.units.reduce((sum: number, u: unknown) => sum + d.drillPower(s, cache, u), 0),
      grains: s.drills.units.map((u: { bit?: { grain?: Record<string, number> } }) =>
        (u.bit ? d.bitGrainMult(u, s.shell.current) : null)),
      shell: s.shell.current,
    };
  });

/**
 * Click a control, sweeping the disclosure gate first.
 *
 * The gate batches its reveal, so seeding a shell or a depth mid-run pops a
 * full-screen modal several seconds LATER — after the setup-time dismiss and
 * on top of whatever the driver is about to press. It surfaces as an unrelated
 * click timing out sixty times, which reads as a broken control.
 */
async function press(page: Page, name: RegExp): Promise<boolean> {
  await dismiss(page);
  const b = page.getByRole('button', { name }).first();
  if ((await b.count()) === 0 || (await b.isDisabled().catch(() => true))) return false;
  await b.click({ timeout: 5000 }).catch(() => {});
  return true;
}

async function shot(page: Page, name: string, anchor = 'The feed'): Promise<void> {
  // Drills sit in the FACE cluster, so the hero stays on screen and the panel
  // is the footer under it. Scroll the bay into view or every shot is a
  // picture of the mining face with the panel off the bottom.
  // The room scrolls INSIDE its own container, so scrollIntoViewIfNeeded on the
  // element moves the page and not the panel. Drive the container.
  await page.evaluate((a) => {
    const target = Array.from(document.querySelectorAll('div'))
      .find((d) => d.textContent?.startsWith(a));
    const box = target?.closest('.overflow-y-auto') as HTMLElement | null;
    if (box && target) box.scrollTop = (target as HTMLElement).offsetTop - box.offsetTop - 8;
  }, anchor);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/bay-${name}.png` });
  shots.push(`${OUT}/bay-${name}.png`);
}

async function overflow(page: Page, name: string): Promise<void> {
  const px = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(px === 0, `${name}: no horizontal overflow at ${W}px`, `${px}px`);
}

/** Build a bay of `n` drills configured however the caller likes. */
const SEED = (extra: string) => `
  const st = engine.getState();
  st.drills.bayBuilt = true;
  st.currencies['brick'] = window.__D(500000);
  st.currencies['dust'] = window.__D(500000);
  ${extra}
`;

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[console] ${m.text().slice(0, 200)}`); });

  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    const d = await import(/* @vite-ignore */ '/src/engine/systems/drills' + '.ts');
    const dec = await import(/* @vite-ignore */ '/src/engine/decimal' + '.ts');
    const w = window as unknown as Record<string, unknown>;
    w['__D'] = dec.D;
    w['__drills'] = d;
    w['__mk'] = (s: never, over: Record<string, unknown>) => {
      const u = { ...d.newDrill('Bess'), ...over };
      (s as unknown as { drills: { units: unknown[] } }).drills.units.push(u);
      return u;
    };
  });

  // === 1. THE SHARED BUDGET CONSTRAINS ====================================
  console.log('\n1 — the feed is one budget, and it constrains');
  await setup(page, SEED(`
    st.depth = 40;
    for (let i = 0; i < 5; i++) window.__mk(st, {});   // draw 5 against a base feed of 6
  `));
  await dismiss(page);
  await tab(page, 'drills');
  await dismiss(page);
  await page.waitForTimeout(1500);
  await dismiss(page);

  const t0 = await text(page);
  // Scope to the ROOM: the Face and Lattice own canvases elsewhere in the tree,
  // and 'no canvas anywhere' is a claim about the app, not about this panel.
  const roomCanvases = await page.locator('section canvas:visible').count();
  check(roomCanvases === 0, 'plain HTML — no canvas in this panel', `${roomCanvases} visible`);
  for (const probe of ['The feed', 'drawn', 'chassis', 'The seam', 'Spread', 'Cluster', 'Hardness', 'draw', 'fit ×']) {
    check(has(t0, probe), `renders: "${probe}"`);
  }
  const b0 = await bay(page);
  check(b0.draw <= b0.supply && b0.load === 1, 'a bare bay sits inside its feed',
    `draw ${b0.draw.toFixed(1)} / ${b0.supply}`);

  // Now fit the thirstiest head on every chassis — the "max everything" play.
  await page.evaluate(() => {
    const s = (window as unknown as Record<string, any>)['__engine'].getState();
    for (let i = 0; i < s.drills.units.length; i++) {
      (window as unknown as Record<string, any>)['__engine'].dispatch({ type: 'fitDrillHead', index: i, head: 'maul' });
    }
  });
  await page.waitForTimeout(900);
  const b1 = await bay(page);
  const t1 = await text(page);
  check(b1.draw > b1.supply, 'maxing every chassis over-draws the feed',
    `draw ${b1.draw.toFixed(1)} / ${b1.supply}`);
  check(b1.load < 1, 'so the whole bay browns out', `every drill at ${Math.round(b1.load * 100)}%`);
  check(has(t1, 'Browning out'), 'and the panel says so in words');
  check(b1.power > 0, 'but nothing stops — a brownout is a penalty, not a block',
    `${b1.power.toFixed(0)} charge/strike across the bay`);
  await shot(page, '1-brownout');

  // Buying feed is the way out, and it is priced in the shell's own currency.
  const feedBefore = b1.supply;
  await page.getByRole('button', { name: /^Buy \d+ Bay Feed/ }).first().click();
  await page.waitForTimeout(700);
  const b2 = await bay(page);
  check(b2.supply > feedBefore, 'buying feed lifts the budget', `${feedBefore} → ${b2.supply}`);
  check(b2.load > b1.load, 'and the brownout eases', `${b1.load.toFixed(2)} → ${b2.load.toFixed(2)}`);

  // === 2. A BIT SPECIALISES THROUGH USE ===================================
  console.log('\n2 — a bit takes the shape of the rock it works');
  await setup(page, SEED(`
    st.depth = 40;
    st.drills.units = [];
    st.drills.supply = 8;
    window.__mk(st, { head: 'auger', bit: { materialId: 'marl', purity: 60 } });
    st.face.cells = st.face.cells.map(() => 8);
  `));
  await page.waitForTimeout(800);
  const g0 = await bay(page);
  check(g0.grains[0] === 1, 'a freshly fitted bit is exactly neutral', `×${g0.grains[0]}`);
  const t2a = await text(page);
  check(!has(t2a, 'Shaped for'), 'and says nothing about a shape it has not taken');

  // Work it. The grain is written by strikes, so this is real ticking.
  await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const mods = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const s = w['__engine'].getState();
    const cache = new mods.ModifierCache();
    // Refill the face each pass so the drill actually has rock to work.
    // tickDrills strikes at most 4 times per call however large dt is, so the
    // iteration count IS the strike count: 1500 x 4 clears GRAIN_SETTLE.
    for (let i = 0; i < 1500; i++) {
      s.face.cells = s.face.cells.map(() => 8);
      w['__drills'].tickDrills(s, cache, { emit() {}, dirty() {} }, 30);
    }
  });
  await page.waitForTimeout(900);
  const g1 = await bay(page);
  const t2b = await text(page);
  check(g1.grains[0]! > 1.05, 'after working one world the bit is sharpened FOR it',
    `×${g1.grains[0]!.toFixed(3)}`);
  check(has(t2b, 'Shaped for here'), 'and the panel names the shape it has taken');
  await shot(page, '2-grain', 'Bess');

  // The same bit, carried to a world it does not know: the decision.
  const g2 = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const d = await import(/* @vite-ignore */ '/src/engine/systems/drills' + '.ts');
    const s = w['__engine'].getState();
    return { here: d.bitGrainMult(s.drills.units[0], 'loam'), elsewhere: d.bitGrainMult(s.drills.units[0], 'ferrite') };
  });
  check(g2.here > g2.elsewhere, 'the same bit is worse in a world it has not worked',
    `loam ×${g2.here.toFixed(2)} vs ferrite ×${g2.elsewhere.toFixed(2)}`);
  await dismiss(page);
  const recut = page.getByRole('button', { name: /^Re-cut/ }).first();
  check((await recut.count()) > 0, 'and the panel offers the way out — a re-cut');
  await press(page, /^Re-cut/);
  await page.waitForTimeout(700);
  const g3 = await bay(page);
  check(g3.grains[0] === 1, 'which grinds it back to flat', `×${g3.grains[0]}`);

  // === 3. THE FACE MAKES THE SETUP GO STALE ===============================
  console.log('\n3 — the seam turns, and re-solving is worth more');
  await setup(page, SEED(`
    st.drills.units = [];
    st.drills.supply = 10;
    st.depth = 4;
    st.face.cells = st.face.cells.map(() => 8);      // shallow + even: the harrow's rock
    for (let i = 0; i < 6; i++) window.__mk(st, { head: 'harrow' });
  `));
  await page.waitForTimeout(1600);
  const s0 = await bay(page);
  const t3a = await text(page);
  const wording = (t: string, gain: number) =>
    gain > 0.04 ? has(t, 'rock has turned under this bay') : has(t, 'The heads suit what the face is doing');
  check(wording(t3a, s0.stale.gain), 'the panel wording matches the reading it is given',
    `${Math.round(s0.stale.gain * 100)}% left on the table`);
  const powerSolved = s0.power;

  // Descend and let the face concentrate: the same bay, different rock.
  await setup(page, `
    const st = engine.getState();
    st.depth = 150;
    st.face.cells = st.face.cells.map((_, i) => (i === 0 ? 8 : 0.05));
  `);
  await page.waitForTimeout(1800);
  const s1 = await bay(page);
  const t3b = await text(page);
  check(s1.stale.gain > s0.stale.gain + 0.05, 'the seam turned under a bay that did not move',
    `${Math.round(s0.stale.gain * 100)}% → ${Math.round(s1.stale.gain * 100)}% left on the table`);
  check(has(t3b, 'rock has turned under this bay'), 'and the panel says it has turned, and by how much');
  await shot(page, '3-stale', 'The seam');

  // Re-solve it by hand: fit the head this rock wants.
  await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    for (let i = 0; i < s.drills.units.length; i++) {
      w['__engine'].dispatch({ type: 'fitDrillHead', index: i, head: 'maul' });
    }
  });
  await page.waitForTimeout(1600);
  const s2 = await bay(page);
  check(s2.stale.gain < s1.stale.gain, 're-fitting for the new rock closes the gap',
    `${Math.round(s1.stale.gain * 100)}% → ${Math.round(s2.stale.gain * 100)}%`);
  check(s2.power > s1.power, 'and the bay genuinely produces more for it',
    `${s1.power.toFixed(0)} → ${s2.power.toFixed(0)} charge/strike`);
  void powerSolved;
  await shot(page, '3-resolved', 'The seam');

  // === 4. A BAY-WIDE ARRANGEMENT FIRES ====================================
  console.log('\n4 — an arrangement the whole bay makes');
  await setup(page, SEED(`
    st.drills.units = [];
    st.drills.supply = 10;
    st.depth = 40;
    st.drills.synergiesFound = [];   // the Codex is permanent; this check is about a FRESH bay
    for (let i = 0; i < 2; i++) window.__mk(st, { head: 'seeker' });
  `));
  await page.waitForTimeout(1600);
  const y0 = await bay(page);
  const t4a = await text(page);
  check(y0.live.length === 0 && y0.found.length === 0, 'nothing is arranged yet');
  check(!has(t4a, 'The Chain Gang'), 'and nothing names an arrangement that has not fired (pillar 5)');

  await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    (w['__mk'] as (s: unknown, o: unknown) => unknown)(w['__engine'].getState(), { head: 'seeker' });
  });
  await page.waitForTimeout(1800);
  const y1 = await bay(page);
  const t4b = await text(page);
  check(y1.live.includes('chainGang'), 'the third seeker forms one', y1.live.join(','));
  check(y1.found.includes('chainGang'), 'the Codex records it once it has happened');
  check(has(t4b, 'The Chain Gang') && has(t4b, 'The bay together'), 'and the panel names it and what it pays');
  await shot(page, '4-synergy', 'The bay together');

  // === 5. THE IDLE PLAYER IS NEVER BLOCKED ================================
  console.log('\n5 — a bay nobody has touched still works');
  await setup(page, SEED(`
    st.drills.units = [];
    st.drills.supply = 0;
    st.depth = 150;
    st.drills.synergiesFound = [];
    st.face.cells = st.face.cells.map(() => 8);
    for (let i = 0; i < 10; i++) window.__mk(st, {});   // no heads, no bits, no feed
  `));
  await page.waitForTimeout(1600);
  const i0 = await bay(page);
  check(i0.supply === 6 && i0.found.length === 0, 'no feed bought, nothing arranged',
    `supply ${i0.supply}`);
  check(i0.power > 0, 'and every drill still produces', `${i0.power.toFixed(0)} charge/strike`);
  const dust = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const mods = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const s = w['__engine'].getState();
    const before = s.currencies['dust'].toNumber();
    const cache = new mods.ModifierCache();
    for (let i = 0; i < 30; i++) {
      s.face.cells = s.face.cells.map(() => 8);
      w['__drills'].tickDrills(s, cache, { emit() {}, dirty() {} }, 10);
    }
    return { before, after: s.currencies['dust'].toNumber() };
  });
  check(dust.after > dust.before, 'an untouched bay earns while it is ignored',
    `${dust.before.toFixed(0)} → ${dust.after.toFixed(0)} dust`);
  await overflow(page, 'bay');
  await shot(page, '5-untouched');

  // === REACH — past Loam the bay is not a dead panel =======================
  console.log('\nREACH — the bay past the shell it was built in');
  await setup(page, `
    const st = engine.getState();
    st.shell.current = 'ferrite';
    st.shell.breachCount = 1;
    st.depthRecords['loam'] = 480;
    st.depth = 90;
    st.drills.bayBuilt = true;
    st.drills.units = [];
    st.drills.supply = 0;
    st.currencies['dust'] = window.__D(0);
    st.currencies['brick'] = window.__D(0);
    st.currencies['flux'] = window.__D(400000);
    for (let i = 0; i < 4; i++) window.__mk(st, { head: 'auger', bit: { materialId: 'marl', purity: 60, grain: { loam: 40000 } } });
  `);
  await dismiss(page);
  await tab(page, 'drills');
  await dismiss(page);
  await page.waitForTimeout(1600);
  await dismiss(page);
  const r0 = await bay(page);
  const tr = await text(page);
  check(r0.shell === 'ferrite', 'standing in a shell past the one the bay was built in', r0.shell);
  check(r0.power > 0, 'the bay still runs', `${r0.power.toFixed(0)} charge/strike`);
  check(r0.grains[0]! < 1, 'the bits carried down are shaped for the world above — the question lands',
    `×${r0.grains[0]!.toFixed(2)}`);
  check(has(tr, 'Shaped for somewhere else'), 'and the panel says exactly that');

  // Both verbs must be payable HERE, in this shell's own currency.
  const feedBtn = page.getByRole('button', { name: /^Buy \d+ Bay Feed/ }).first();
  const supplyBefore = r0.supply;
  check((await feedBtn.count()) > 0 && !(await feedBtn.isDisabled()), 'the feed is buyable in this shell');
  await feedBtn.click();
  await page.waitForTimeout(700);
  check((await bay(page)).supply > supplyBefore, 'and the purchase lands',
    `${supplyBefore} → ${(await bay(page)).supply}`);

  await dismiss(page);
  const recutHere = page.getByRole('button', { name: /^Re-cut/ }).first();
  check((await recutHere.count()) > 0 && !(await recutHere.isDisabled()), 'the re-cut is affordable in this shell');
  await press(page, /^Re-cut/);
  await page.waitForTimeout(700);
  const r1 = await bay(page);
  check(r1.grains[0] === 1, 'and it works — nothing here is a dead button',
    `×${r1.grains[0]}`);
  await overflow(page, 'reach');
  await shot(page, '6-reach');

  await browser.close();
  console.log(`\nshots:\n  ${shots.join('\n  ')}`);
  console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n  ${problems.join('\n  ')}` : '\nALL CHECKS PASS');
  process.exit(problems.length ? 1 : 0);
}
main();
