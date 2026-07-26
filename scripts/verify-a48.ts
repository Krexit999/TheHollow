/**
 * A.48 — RELICS AND THE MUSEUM, verified in the PANEL, not in the data.
 *
 * The A.46/A.47 work shipped an engine that was right and a panel that never
 * asked the player the question. This script exists because "913 tests pass"
 * was accepted as proof last time and was not proof of anything a player
 * touches. Every check here drives the REAL controls with the mouse and reads
 * the REAL rendered text back.
 *
 * Six checks, all at 380px:
 *   1  fusing twice in a row hits a rising cost wall
 *   2  three-plus relics with genuinely different, non-multiplier effects
 *   3  an awakening fires live and the panel changes
 *   4  a set bonus fires when the right relics are worn together
 *   5  placing relics forms a hidden exhibit that was never listed
 *   6  REACH — all of the above still work after Breaching past the home shell
 *
 *   npx tsx scripts/verify-a48.ts [port] [outDir]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5174';
const OUT = process.argv[3] ?? 'sim-out/shots';
const W = 380, H = 900;

const problems: string[] = [];
const notes: string[] = [];
const check = (ok: boolean, label: string, detail = ''): boolean => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(`${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

/**
 * innerText returns RENDERED text, so anything under a `uppercase` class comes
 * back shouting. Every probe below is case-insensitive for that reason: the
 * first pass "found" four missing power labels that were on screen in caps.
 */
const text = async (page: Page): Promise<string> =>
  (await page.locator('body').innerText()).replace(/\s+/g, ' ');

const has = (t: string, s: string): boolean => t.toLowerCase().includes(s.toLowerCase());

/** Expose the real engine calls so the seed mints through the real paths. */
async function wire(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // Vite resolves these at runtime in the page; tsc cannot see a browser
    // module path, and making each a variable is the honest way to say so.
    const relics = await import(/* @vite-ignore */ '/src/engine/systems/relics' + '.ts');
    const powers = await import(/* @vite-ignore */ '/src/engine/systems/relicPowers' + '.ts');
    const museum = await import(/* @vite-ignore */ '/src/engine/systems/museum' + '.ts');
    const dec = await import(/* @vite-ignore */ '/src/engine/decimal' + '.ts');
    const w = window as unknown as Record<string, unknown>;
    w['__D'] = dec.D;
    w['__relics'] = relics;
    w['__powers'] = powers;
    w['__museum'] = museum;
    w['__mk'] = (s: never, o: Record<string, unknown>) => relics.addRelic(s, {
      uid: 0, defId: 'x', rarity: 3, affixes: { regen: 0.08, dustYield: 0.05 },
      source: 'depth', fusedFrom: 0,
      found: { depth: 428, shell: 'loam', run: 6, playSec: 900, by: 'The Badger' },
      ...o,
    });
  });
}

/** The current fusion price as the PANEL states it: "N shards  M Cores". */
async function shownPrice(page: Page): Promise<{ shards: number; cores: number } | null> {
  const t = await text(page);
  const m = t.match(/(\d+) shards (\d+) Cores/);
  return m ? { shards: Number(m[1]), cores: Number(m[2]) } : null;
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/a48-${name}.png` });
  notes.push(`${OUT}/a48-${name}.png`);
}

async function guard(page: Page, name: string): Promise<void> {
  page.on('pageerror', (e) => problems.push(`[${name}] [pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[${name}] [console] ${m.text().slice(0, 200)}`);
  });
}

async function overflow(page: Page, name: string): Promise<void> {
  const px = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(px === 0, `${name}: no horizontal overflow at ${W}px`, `${px}px`);
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  // === 1 + 2 + 4: the fusion wall, the powers, the resonance ===============
  {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await guard(page, 'relics');
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await wire(page);
    await setup(page, `
      const st = engine.getState();
      st.depth = 300; st.maxDepthRecord = 428; st.collapse.count = 6;
      st.museum.completed = ['a','b','c','d','e'];
      st.relics.shards = 400;
      st.currencies['core'] = window.__D(60);
      // Four powers, one of each KIND, all worn and past Dormant.
      const worn = [
        window.__mk(st, { power: 'twinBite',   waking: 2, charge: 9000, source: 'depth' }),
        window.__mk(st, { power: 'glassLung',  waking: 1, charge: 2000, source: 'well' }),
        window.__mk(st, { power: 'deepLedger', waking: 2, charge: 9000, source: 'depth' }),
        window.__mk(st, { power: 'leftHand',   waking: 2, charge: 9000, source: 'warren' }),
      ];
      st.relics.equipped = worn.map(r => r.uid);
      // ...and spares to feed the bench.
      for (let i = 0; i < 6; i++) window.__mk(st, { rarity: 1, source: 'warren', affixes: { dropRate: 0.06 } });
    `);
    await dismiss(page);
    await tab(page, 'relics');
    await dismiss(page);
    await page.waitForTimeout(6000);
    await dismiss(page);

    console.log('\nCHECK 2 — powers that are not percentages');
    const t0 = await text(page);
    for (const probe of [
      'The Second Bite', 'It changes the rule', 'TWO cells instead of one',
      'Glass Lung', 'It trades something away', '-30% cell capacity',
      'The Deep Ledger', 'It grows with what you do', 'per 15 of current depth',
      'The Left Hand', 'It needs company',
    ]) check(has(t0, probe), `panel renders: "${probe}"`);
    await shot(page, '2-powers');

    // FUNCTION, not just render: each kind asserted through the engine it changes.
    const fx = await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      const s = w['__engine'].getState();
      const before = w['__powers'].relicPowerBonus(s, 'dustYield');
      s.depth = 600;
      const after = w['__powers'].relicPowerBonus(s, 'dustYield');
      s.depth = 300;
      return {
        rule_twinBite: w['__powers'].relicRule(s, 'twinBite'),
        rule_holdCap: w['__relics'].holdCap(s),
        trade_capIsNegative: w['__powers'].relicPowerBonus(s, 'cap') < 0,
        scaling_movesWithDepth: after > before,
        pair_multiplier: w['__powers'].pairMultiplier(s),
      };
    });
    check(fx.rule_twinBite === true, 'RULE works: the drill rule is in force');
    check(fx.trade_capIsNegative, 'TRADE works: capacity is genuinely reduced');
    check(fx.scaling_movesWithDepth, 'SCALING works: the value moves when depth does');
    check(fx.pair_multiplier === 1.3, 'PAIR works: two Awake companions light it', `x${fx.pair_multiplier}`);

    console.log('\nCHECK 4 — a set bonus fires when worn together');
    check(/FIRING/i.test(t0), 'panel says a resonance is FIRING');
    check(/Resonating · \d/i.test(t0), 'the header counts the live resonances');
    const resFx = await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      const s = w['__engine'].getState();
      return w['__relics'].activeResonances(s).map((r: { id: string }) => r.id);
    });
    check(resFx.length > 0, 'the engine agrees a resonance is active', resFx.join(','));
    await shot(page, '4-resonance');

    console.log('\nCHECK 1 — fusing twice in a row hits a rising wall');
    const prices: Array<{ shards: number; cores: number }> = [];
    let walled = false;
    for (let i = 0; i < 8; i++) {
      const open = page.getByRole('button', { name: /Fuse one in/ }).first();
      if ((await open.count()) === 0) break;
      await open.click();
      await page.waitForTimeout(250);
      const p = await shownPrice(page);
      if (p) prices.push(p);
      if (i === 0) await shot(page, '1-price-first');
      const t = await text(page);
      if (/Short .*(shards|Cores)/i.test(t)) {
        walled = true;
        await shot(page, '1-wall');
        break;
      }
      const feed = page.getByRole('button', { name: /· from /, exact: false });
      const n = await feed.count();
      let fed = false;
      for (let j = 0; j < n; j++) {
        const b = feed.nth(j);
        if (await b.isDisabled().catch(() => true)) continue;
        await b.click({ timeout: 900 }).catch(() => {});
        fed = true;
        break;
      }
      if (!fed) break;
      await page.waitForTimeout(350);
    }
    console.log(`    prices seen: ${prices.map((p) => `${p.shards}s/${p.cores}c`).join(' → ')}`);
    check(prices.length >= 2, 'the panel states a price for each fusion', `${prices.length} seen`);
    check(!!prices[0] && prices[0].cores > 0 && prices[0].shards > 0, 'the FIRST fusion already costs something');
    check(!!prices[1] && prices[1]!.cores > prices[0]!.cores, 'the SECOND fusion costs more Cores than the first',
      prices.length >= 2 ? `${prices[0]!.cores} → ${prices[1]!.cores}` : '');
    check(!!prices[1] && prices[1]!.shards > prices[0]!.shards, 'the SECOND fusion costs more shards than the first',
      prices.length >= 2 ? `${prices[0]!.shards} → ${prices[1]!.shards}` : '');
    check(walled, 'the wall is REACHED — the panel refuses and says what is short');

    await overflow(page, 'relics');
    await page.close();
  }

  // === 3: an awakening, live ==============================================
  {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await guard(page, 'waking');
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await wire(page);
    await setup(page, `
      const st = engine.getState();
      st.depth = 300; st.maxDepthRecord = 428; st.collapse.count = 6;
      const r = window.__mk(st, { power: 'glassLung', source: 'well', waking: 0, charge: 1782 });
      st.relics.equipped = [r.uid];
    `);
    await dismiss(page);
    await tab(page, 'relics');
    await dismiss(page);
    await page.waitForTimeout(1500);
    await dismiss(page);

    console.log('\nCHECK 3 — an awakening fires live and the panel changes');
    const before = await text(page);
    check(/Dormant/i.test(before), 'before: the relic reads Dormant');
    check(/Something in it has not woken/i.test(before), 'before: its power is asleep and says nothing');
    check(!/45% dust yield/i.test(before), 'before: the effect is NOT applied');
    await shot(page, '3-before');

    // Real seconds of real ticks — no state poking. The relic crosses on its own.
    await page.waitForTimeout(22000);
    const after = await text(page);
    check(/Stirring/i.test(after), 'after: it has woken to Stirring');
    check(/Glass Lung/i.test(after), 'after: the power is named');
    check(/45% dust yield/i.test(after), 'after: the EFFECT is now stated and live');
    check(/The seam gives quicker and holds less/i.test(after), 'after: it tells its own line');
    const woke = await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      const s = w['__engine'].getState();
      return {
        waking: s.relics.held[0]?.waking ?? 0,
        yieldBonus: w['__powers'].relicPowerBonus(s, 'dustYield'),
      };
    });
    check(woke.waking >= 1 && woke.yieldBonus > 0, 'the engine agrees the effect turned on',
      `waking ${woke.waking}, +${Math.round(woke.yieldBonus * 100)}% yield`);
    await shot(page, '3-after');
    await overflow(page, 'waking');
    await page.close();
  }

  // === 5: place a relic, discover an exhibit ==============================
  {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await guard(page, 'museum');
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await wire(page);
    await setup(page, `
      const st = engine.getState();
      st.guild.discovered = true;
      st.depth = 428; st.maxDepthRecord = 428; st.collapse.count = 6;
      st.currencies['scrip'] = window.__D(50000);
      for (let i = 0; i < 3; i++) window.__mk(st, { rarity: 2, source: 'depth' });
    `);
    await dismiss(page);
    await tab(page, 'museum');
    await dismiss(page);
    await page.waitForTimeout(4000);
    await dismiss(page);

    console.log('\nCHECK 5 — arranging, and an exhibit nobody listed');
    const t0 = await text(page);
    check(/The halls/i.test(t0), 'the Museum shows halls, not a donate button');
    check(/empty/i.test(t0), 'empty plinths are drawn — the room asks a question');
    check(!/The Last Shift/i.test(t0), 'BEFORE: no exhibit is listed anywhere (pillar 5)');
    await shot(page, '5-halls-empty');

    // Place all three by hand: choose the hall, then choose WHICH relic.
    for (let i = 0; i < 3; i++) {
      const place = page.getByRole('button', { name: /Stand something here/ }).first();
      if ((await place.count()) === 0) break;
      await place.click();
      await page.waitForTimeout(300);
      const pick = page.getByRole('button', { name: /· from the deep shaft/ }).first();
      if ((await pick.count()) === 0) break;
      await pick.click();
      await page.waitForTimeout(400);
    }
    const tPlaced = await text(page);
    check(/▨ unstudied/i.test(tPlaced), 'three pieces now stand on plinths');
    check(!/The Last Shift/i.test(tPlaced), 'still no exhibit — unstudied pieces are invisible to the hall');
    await shot(page, '5-placed');

    // Study each one. The exhibit forms out of what ends up standing together.
    for (let i = 0; i < 3; i++) {
      const plinth = page.getByRole('button', { name: /unstudied/ }).first();
      if ((await plinth.count()) === 0) break;
      await plinth.click();
      await page.waitForTimeout(250);
      const study = page.getByRole('button', { name: /^Study · / }).first();
      if ((await study.count()) === 0) break;
      await study.click();
      await page.waitForTimeout(400);
    }
    const tStudied = await text(page);
    check(/The Last Shift/i.test(tStudied), 'AFTER arranging: a named exhibit formed');
    check(/Exhibits · \d+ found/i.test(tStudied), 'the Codex counts what was found by doing');
    check(/studied/i.test(tStudied), 'identify → the pieces read as studied');
    check(/from \d+ studied/i.test(tStudied), 'identify → VALUE: the hall is worth more for the research');
    const exFx = await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      const s = w['__engine'].getState();
      return {
        found: s.museum.exhibitsFound,
        live: w['__museum'].activeExhibits(s).map((a: { def: { id: string } }) => a.def.id),
        dropBonus: w['__museum'].exhibitBonus(s, 'dropRate'),
      };
    });
    check(exFx.live.length > 0 && exFx.dropBonus > 0, 'the exhibit actually pays',
      `${exFx.live.join(',')} · +${Math.round(exFx.dropBonus * 100)}% find rate`);
    await shot(page, '5-exhibit');

    // ...and it comes APART again, which is what makes placement a decision.
    const plinth = page.getByRole('button', { name: /^(Common|Uncommon|Rare|Fabled|Mythic)$/ }).first();
    if ((await plinth.count()) > 0) {
      await plinth.click();
      await page.waitForTimeout(250);
      const move = page.getByRole('button', { name: /^→ / }).first();
      if ((await move.count()) > 0) { await move.click(); await page.waitForTimeout(500); }
    }
    const tMoved = await text(page);
    check(/taken apart/i.test(tMoved), 'moving a piece OUT takes the exhibit apart — it is reversible');
    await shot(page, '5-taken-apart');
    await overflow(page, 'museum');
    await page.close();
  }

  // === 6: REACH — past the shell the relics came from =====================
  {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await guard(page, 'reach');
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await wire(page);
    // Breached past Loam and standing in Ferrite. Every relic in hand was found
    // in a world that no longer exists, and Loam's chip currency is gone.
    await setup(page, `
      const st = engine.getState();
      st.shell.current = 'ferrite';
      st.shell.breachCount = 1;
      st.depthRecords['loam'] = 480;
      st.depth = 120; st.maxDepthRecord = 120; st.collapse.count = 3;
      st.currencies['dust'] = window.__D(0);
      st.currencies['scrip'] = window.__D(0);
      st.museum.completed = ['a','b','c','d','e'];
      for (let i = 0; i < 14; i++) window.__mk(st, { rarity: 2, source: 'depth' });
    `);
    await dismiss(page);

    console.log('\nCHECK 6 — REACH: the standing per-system reach rule');
    // Are the INPUTS earnable here, or merely stipulated? Cores come from the
    // Collapse, which happens in every shell — asserted, not assumed.
    const earn = await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      const s = w['__engine'].getState();
      const before = Number(s.currencies['core']?.toNumber?.() ?? 0);
      w['__engine'].dispatch({ type: 'collapse' });
      const s2 = w['__engine'].getState();
      return {
        shell: s2.shell.current,
        coresBefore: before,
        coresAfter: Number(s2.currencies['core']?.toNumber?.() ?? 0),
        shards: s2.relics.shards,
        held: s2.relics.held.length,
      };
    });
    check(earn.shell === 'ferrite', 'standing in a shell past the one the relics came from', earn.shell);
    check(earn.coresAfter > earn.coresBefore, 'CORES are earnable here — a Collapse in Ferrite pays',
      `${earn.coresBefore} → ${earn.coresAfter}`);
    check(earn.held > 0, 'the relics survived the shell they were found in', `${earn.held} held`);

    await tab(page, 'relics');
    await dismiss(page);
    await page.waitForTimeout(3000);
    await dismiss(page);
    // Render a spare down for shards, then fuse — both with the mouse.
    // Render every spare down — one Rare is 6 shards against a 30-shard first
    // fusion, so the pile IS the supply and the driver must use it like one.
    for (let i = 0; i < 12; i++) {
      const render = page.getByRole('button', { name: /^⚒ / }).last();
      if ((await render.count()) === 0) break;
      await render.click({ timeout: 900 }).catch(() => {});
      await page.waitForTimeout(220);
    }
    const open = page.getByRole('button', { name: /Fuse one in/ }).first();
    let fusedHere = false;
    if ((await open.count()) > 0) {
      await open.click();
      await page.waitForTimeout(300);
      await shot(page, '6-reach-relics');
      const feed = page.getByRole('button', { name: /· from the deep shaft/ }).first();
      if ((await feed.count()) > 0 && !(await feed.isDisabled().catch(() => true))) {
        const held0 = await page.evaluate(() => (window as any)['__engine'].getState().relics.held.length);
        await feed.click();
        await page.waitForTimeout(500);
        const held1 = await page.evaluate(() => (window as any)['__engine'].getState().relics.held.length);
        fusedHere = held1 < held0;
      }
    }
    check(fusedHere, 'FUSION works in a later shell — not live-but-dead');

    await tab(page, 'museum');
    await dismiss(page);
    await page.waitForTimeout(1500);
    const place = page.getByRole('button', { name: /Stand something here/ }).first();
    let placedHere = false;
    if ((await place.count()) > 0) {
      await place.click();
      await page.waitForTimeout(300);
      const pick = page.getByRole('button', { name: /· from the deep shaft/ }).first();
      if ((await pick.count()) > 0) {
        await pick.click();
        await page.waitForTimeout(400);
        placedHere = await page.evaluate(() => (window as any)['__engine'].getState().museum.pieces.length > 0);
      }
    }
    check(placedHere, 'ARRANGING works in a later shell');
    // Scrip was zeroed above: the second input has to carry the study.
    const plinth = page.getByRole('button', { name: /unstudied/ }).first();
    let studiedOnShards = false;
    if ((await plinth.count()) > 0) {
      await plinth.click();
      await page.waitForTimeout(250);
      const study = page.getByRole('button', { name: /^Study · .*shards$/ }).first();
      if ((await study.count()) > 0 && !(await study.isDisabled().catch(() => true))) {
        await study.click();
        await page.waitForTimeout(400);
        studiedOnShards = await page.evaluate(() =>
          (window as any)['__engine'].getState().museum.pieces.some((p: { identified: boolean }) => p.identified));
      }
    }
    check(studiedOnShards, 'STUDY has a second earnable input — shards carry it with no Scrip at all');
    await shot(page, '6-reach-museum');
    await overflow(page, 'reach');
    await page.close();
  }

  console.log(`\nshots:\n  ${notes.join('\n  ')}`);
  console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n  ${problems.join('\n  ')}` : '\nALL CHECKS PASS');
  await browser.close();
  process.exit(problems.length ? 1 : 0);
}
main();
