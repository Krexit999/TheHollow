/**
 * RELICS + MUSEUM — the standing verifier for both panels. Reads TEXT.
 *
 * A.49's driver read pixels out of a Pixi renderer, which was the right tool
 * for a canvas and is the wrong tool for this: there is no canvas any more.
 * Everything these two screens claim is a string on the page, so every check
 * here reads the rendered text, and every behavioural check drives a real
 * control and then reads the ENGINE back to prove the click meant something.
 *
 * Named for the SURFACE, not the phase: it was verify-a49 (pixel probes into a
 * Pixi canvas), then verify-a50 (the panel that replaced it), and renaming it
 * every restyle is how a project ends up with four stale drivers.
 *
 *   npx tsx scripts/verify-relics.ts [port] [outDir]
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

/** innerText renders `text-transform: uppercase` as caps, so probe case-insensitively. */
const text = async (page: Page): Promise<string> =>
  (await page.locator('body').innerText()).replace(/\s+/g, ' ');
const has = (t: string, s: string): boolean => t.toLowerCase().includes(s.toLowerCase());

const relics = async (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as Record<string, any>)['__engine'].getState();
    return {
      held: s.relics.held.length,
      equipped: s.relics.equipped.length,
      shards: Math.floor(s.relics.shards),
      fused: s.relics.fused,
      autoScrap: s.relics.autoScrap,
      exhibits: s.museum.exhibitsFound,
      halls: s.museum.completed.length,
    };
  });

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/relics-${name}.png`, fullPage: true });
  shots.push(`${OUT}/relics-${name}.png`);
}

async function overflow(page: Page, name: string): Promise<void> {
  const px = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(px === 0, `${name}: no horizontal overflow at ${W}px`, `${px}px`);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[console] ${m.text().slice(0, 200)}`); });

  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    const rel = await import(/* @vite-ignore */ '/src/engine/systems/relics' + '.ts');
    const dec = await import(/* @vite-ignore */ '/src/engine/decimal' + '.ts');
    const w = window as unknown as Record<string, unknown>;
    w['__D'] = dec.D;
    w['__mk'] = (s: never, o: Record<string, unknown>) => rel.addRelic(s, {
      uid: 0, defId: 'x', rarity: 3, affixes: { regen: 0.08 }, source: 'depth', fusedFrom: 0,
      found: { depth: 428, shell: 'loam', run: 6, playSec: 900, by: 'The Badger' }, ...o,
    });
  });
  // Two from the deep shaft (they resonate), an awake one, a dormant one, spares.
  await setup(page, `
    const st = engine.getState();
    st.depth = 300; st.maxDepthRecord = 428; st.collapse.count = 6;
    st.relics.shards = 200;
    st.currencies['core'] = window.__D(40);
    const a = window.__mk(st, { source: 'depth', power: 'twinBite',   waking: 2, charge: 9000, rarity: 4 });
    const b = window.__mk(st, { source: 'depth', power: 'glassLung',  waking: 0, charge: 10 });
    const c = window.__mk(st, { source: 'warren', power: 'longTally', waking: 1, charge: 2200, rarity: 2 });
    st.relics.equipped = [a.uid, b.uid, c.uid];
    // Mid-depth finds with distinct runs and hands, so NOTHING here forms a
    // set and the Museum's "nothing named yet" check has something to be true
    // about. Deliberately between 100 and 200: shallower and The First Hundred
    // fires off the spares, deeper and Out of the Deep does.
    window.__mk(st, { rarity: 3, source: 'depth',
      found: { depth: 180, shell: 'loam', run: 20, playSec: 9, by: 'Molly' } });
    for (let i = 0; i < 5; i++) window.__mk(st, { rarity: 1, source: 'well',
      found: { depth: 120 + i * 4, shell: 'loam', run: 10 + i, playSec: 9, by: 'Hand ' + i } });
  `);
  await dismiss(page);
  await tab(page, 'relics');
  await dismiss(page);
  await page.waitForTimeout(900);
  await dismiss(page);

  // === 1. THE PANEL RENDERS, AND IT IS NOT A CANVAS ========================
  console.log('\n1 — the Relics panel renders');
  const t0 = await text(page);
  check((await page.locator('canvas:visible').count()) === 0, 'no canvas on this screen any more',
    `${await page.locator('canvas:visible').count()} visible`);
  for (const probe of [
    'RELICS', 'Equipped', 'Held', 'Fusion', 'Auto-scrap',
    'Empty setting', 'the deep shaft', 'The Badger',
  ]) check(has(t0, probe), `renders: "${probe}"`);
  // The header carries both purses as glyphs, not sentences.
  check(/◆\s?[\d,]+/.test(t0) && /✦\s?\d+/.test(t0), 'the header states shards and Cores',
    t0.match(/◆\s?[\d,]+\s*✦\s?\d+/)?.[0] ?? '');
  await page.waitForTimeout(7000); // let the seeding achievement toasts clear
  await shot(page, '1-relics');

  console.log('\n2 — a relic reads as its power, its band and its awakening');
  for (const probe of [
    'The Second Bite', 'TWO cells instead of one',
    'Glass Lung', 'Something in it has not woken',
    'Awake', 'Dormant', 'Stirring',
  ]) check(has(t0, probe), `renders: "${probe}"`);
  check(/\d+:\d\d/.test(t0), 'awakening shows a clock, not a sentence', t0.match(/\d+:\d\d(:\d\d)?/)?.[0] ?? '');
  check(has(t0, 'held'), 'and a fully awake relic reads "held"');
  check(has(t0, 'Firing') && has(t0, 'The Deep Chord'), 'a live resonance names itself and says it is firing');
  // RARITY IS A COLOURED EDGE. Asserted from the DOM, because "it looks right"
  // is exactly the claim that failed twice on these screens.
  const edges = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('div[style*="border-left"]'))) {
      const w = getComputedStyle(el).borderLeftWidth;
      if (parseFloat(w) >= 2) out.push(getComputedStyle(el).borderLeftColor);
    }
    return out;
  });
  check(edges.length >= 3, 'every setting carries a rarity-coloured left edge', `${edges.length} edges`);
  check(new Set(edges).size >= 2, 'and the bands are genuinely different colours',
    `${new Set(edges).size} distinct`);

  // === 3. WEAR / TAKE OFF MOVE ENGINE STATE ================================
  console.log('\n3 — a control actually moves the engine');
  const before = await relics(page);
  await page.getByRole('button', { name: /^Wear$/ }).first().click();
  await page.waitForTimeout(400);
  const afterWear = await relics(page);
  check(afterWear.equipped === before.equipped + 1, 'Wear equips a relic',
    `${before.equipped} → ${afterWear.equipped}`);
  await page.getByRole('button', { name: /^Take off$/ }).last().click();
  await page.waitForTimeout(400);
  check((await relics(page)).equipped === before.equipped, 'Take off unequips again');

  // === 4. THE BENCH: STAGE, PRICE, FUSE ====================================
  console.log('\n4 — the fusion bench');
  const bench = () => page.locator('text=Cores are spent only when').locator('xpath=..');
  check(has(t0, 'tap FUSE on a held relic') && has(t0, 'consumed on fuse'),
    'the bench shows an empty keeper and feeder slot');

  await page.getByRole('button', { name: /^Fuse$/ }).first().click();   // keeper
  await page.waitForTimeout(350);
  await page.getByRole('button', { name: /^Fuse$/ }).nth(1).click();    // feeder
  await page.waitForTimeout(350);
  const tBench = (await bench().innerText()).replace(/\s+/g, ' ');
  for (const probe of ['Keeper', 'Feeder', 'Rarity', 'Lines', 'Power', 'Awakening']) {
    check(has(tBench, probe), `the bench compares: ${probe}`);
  }
  check(/◆\s?\d+/.test(tBench), 'and states the shard price', tBench.match(/◆\s?\d+\s*·\s*✦\s?\d+/)?.[0] ?? '');
  await shot(page, '2-bench');

  const f0 = await relics(page);
  const uidsBefore = await page.evaluate(() => {
    const s = (window as unknown as Record<string, any>)['__engine'].getState();
    return s.relics.held.map((r: any) => r.uid);
  });
  await bench().getByRole('button', { name: /^Fuse$/ }).click();
  await page.waitForTimeout(500);
  const f1 = await relics(page);
  const gone = await page.evaluate((uids: number[]) => {
    const s = (window as unknown as Record<string, any>)['__engine'].getState();
    const now = new Set(s.relics.held.map((r: any) => r.uid));
    return uids.filter((u) => !now.has(u)).length;
  }, uidsBefore);
  // The COUNT is not the assertion: a live game can grant a relic underneath us
  // (it did, on an earlier pass, and read as 'the fusion did not happen').
  check(f1.fused === f0.fused + 1 && gone === 1, 'the fusion lands: the fed relic is gone, one more fusion',
    `${gone} consumed, fused ${f0.fused} → ${f1.fused}`);
  check(f1.shards < f0.shards, 'and it was paid for', `${f0.shards} → ${f1.shards} shards`);

  // CORES ARE A LATE SINK. Under the rarity sort the hold runs high → low, so
  // the LAST row is the weakest keeper and the FIRST is the strongest feeder —
  // which is exactly a lift into the top band.
  await page.getByRole('button', { name: /^Clear$/ }).click();
  await page.waitForTimeout(300);
  const heldFuse = page.getByRole('button', { name: /^Fuse$/ });
  const nFuse = await heldFuse.count();
  if (nFuse >= 3) {
    await heldFuse.nth(nFuse - 2).click();   // last HELD row (the bench Fuse is last)
    await page.waitForTimeout(300);
    await heldFuse.first().click();          // strongest held row
    await page.waitForTimeout(350);
  }
  const liftText = (await bench().innerText()).replace(/\s+/g, ' ');
  const cores = Number(liftText.match(/✦\s?(\d+)/)?.[1] ?? -1);
  // innerText returns RENDERED text, so the label comes back as 'RARITY'.
  const lifting = /Rarity .*→/i.test(liftText);
  check(!lifting || cores > 0, 'a fusion that LIFTS a rarity is charged Cores',
    lifting ? `lift priced ✦${cores}` : 'no lift available to stage');
  check(has(liftText, 'Cores are spent only when the feeder lifts the keeper a rarity'),
    'and the bench states the rule in words');
  // === 5. AUTO-SCRAP: RULES SET, AND A FIND IS TURNED AWAY =================
  console.log('\n5 — the standing order');
  const tScrap = await text(page);
  check(has(tScrap, 'Scrap at or below'), 'the bands are on screen, not behind a disclosure');
  check(has(tScrap, 'Keep powered relics'), 'and so is the power exemption');
  // The ON pill, the band, and the exemption — three separate writes.
  await page.getByRole('button', { name: /^Off$/ }).click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: /^Scrap at or below Uncommon$/ }).click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: /^Kept$/ }).click();
  await page.waitForTimeout(300);
  const rule = (await relics(page)).autoScrap;
  check(rule.on === true && rule.maxRarity === 1 && rule.keepPowered === false,
    'all three controls write to the engine', JSON.stringify(rule));
  check(has(await text(page), 'Scrapping Uncommon and below on pickup'),
    'and the panel restates the live rule in words');
  await shot(page, '3-standing-order');

  const s0 = await relics(page);
  await page.evaluate(async () => {
    const rel = await import(/* @vite-ignore */ '/src/engine/systems/relics' + '.ts');
    const s = (window as unknown as Record<string, any>)['__engine'].getState();
    rel.addRelic(s, { uid: 0, defId: 'x', rarity: 0, affixes: { regen: 0.02 }, source: 'well', fusedFrom: 0 });
  });
  await page.waitForTimeout(400);
  const s1 = await relics(page);
  check(s1.held === s0.held && s1.shards > s0.shards, 'an unwanted find never reaches the hold',
    `held ${s0.held} → ${s1.held}, shards ${s0.shards} → ${s1.shards}`);
  await overflow(page, 'relics');

  // === 6. THE MUSEUM: HALLS, AND SETS ONLY AFTER THEY FIRE =================
  console.log('\n6 — the Museum');
  await tab(page, 'museum');
  await dismiss(page);
  await page.waitForTimeout(600);
  const m0 = await text(page);
  check(has(m0, 'Halls'), 'the halls are counted');
  check(has(m0, 'The First Finds') && has(m0, 'Wants'), 'each hall says what it wants');
  check(has(m0, 'Nothing is handed over'), 'and that nothing is donated');
  check(!has(m0, 'Give the case a relic') && !has(m0, 'Study ·'), 'the donate and study verbs are gone');
  // PILLAR 5, stated as an invariant rather than "the panel is empty": relics
  // drop while the driver works, so a set can legitimately fire mid-run. What
  // must never happen is a set being NAMED before it has fired once.
  const unfired = await page.evaluate(async () => {
    const mus = await import(/* @vite-ignore */ '/src/engine/systems/museum' + '.ts');
    const s = (window as unknown as Record<string, any>)['__engine'].getState();
    return mus.EXHIBITS.filter((e: { id: string }) => !s.museum.exhibitsFound.includes(e.id))
      .map((e: { name: string }) => e.name);
  });
  const leaked = unfired.filter((name: string) => has(m0, name));
  check(leaked.length === 0, 'BEFORE: no set that has not fired is named (pillar 5)',
    leaked.length ? `leaked ${leaked.join(', ')}` : `${unfired.length} still dark`);
  await shot(page, '4-museum');

  // Four off one run forms The Last Shift — from OWNERSHIP, no placing.
  await page.evaluate(async () => {
    const rel = await import(/* @vite-ignore */ '/src/engine/systems/relics' + '.ts');
    const s = (window as unknown as Record<string, any>)['__engine'].getState();
    s.relics.autoScrap.on = false;
    for (let i = 0; i < 4; i++) {
      rel.addRelic(s, {
        uid: 0, defId: 'x', rarity: 2, affixes: { regen: 0.05 }, source: 'depth', fusedFrom: 0,
        found: { depth: 260, shell: 'loam', run: 42, playSec: 9, by: 'Nib' },
      });
    }
  });
  await page.waitForTimeout(2200);
  const m1 = await text(page);
  check(has(m1, 'Named by the room'), 'AFTER: the room names what it noticed');
  check(has(m1, 'The Last Shift'), 'and the set is the one the collection formed');
  const st = await relics(page);
  check(st.exhibits.includes('lastShift'), 'the engine agrees it fired', st.exhibits.join(','));
  check(has(m1, '% drop rate') || has(m1, '% find rate'), 'and the panel states what it pays');
  await shot(page, '5-museum-set');
  await overflow(page, 'museum');

  await browser.close();
  console.log(`\nshots:\n  ${shots.join('\n  ')}`);
  console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n  ${problems.join('\n  ')}` : '\nALL CHECKS PASS');
  process.exit(problems.length ? 1 : 0);
}
main();
