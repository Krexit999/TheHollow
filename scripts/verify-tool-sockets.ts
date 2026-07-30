/**
 * SOCKETS, DRIVEN IN THE REAL GAME.
 *
 * The audit that opened this phase found the Sockets part was a stub whose stat
 * nothing read, so this driver is written to be the thing that would have caught
 * that: every effect check reads the REAL FOLDED MODIFIER BUCKET through the
 * live engine, not the socket module's own arithmetic. A socket that computed a
 * number nothing consumed would fail here.
 *
 *  1  SLOTS come from the Sockets part's material — and a deeper/hollower stone
 *     holds more.
 *  2  A REAL RELIC goes in and its effect lands on the live path; a real RUNE
 *     pair speaks through the row; a real GEM lands its bonus.
 *  3  REVERSIBLE — pull one out, put another in, nothing is consumed.
 *  4  THE POOL IS SHARED — socketing takes it off the belt, and it cannot be
 *     scrapped while it is in the tool.
 *  5  380px, 0 overflow.
 *
 *   npx tsx scripts/verify-tool-sockets.ts [port] [outDir]
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
async function settle(page: Page): Promise<void> {
  for (let i = 0; i < 30; i++) {
    if (await page.locator('.toast-in').count() === 0) return;
    await page.waitForTimeout(400);
  }
}
async function shot(page: Page, name: string, to?: string): Promise<void> {
  await dismiss(page);
  await settle(page);
  if (to) {
    await page.locator(to).first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: `${OUT}/sok-${name}.png` });
  shots.push(`${OUT}/sok-${name}.png`);
}
const txt = async (page: Page, sel: string): Promise<string> =>
  (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

const SHELLS = ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph'];

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: W, height: H }, reducedMotion: 'no-preference' });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (t.includes('render recovered')) return;
    problems.push(`[console] ${t.slice(0, 200)}`);
  });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await setup(page, `engine.getState().forge.built = true;`);

  await page.evaluate(async (shells) => {
    const w = window as unknown as Record<string, any>;
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const s = w['__engine'].getState();
    for (const id of shells) s.depthRecords[id] = 60;
    for (const shell of shells) {
      for (const m of mats.materialsOfShell(shell)) forge.addMaterial(s, m.id, 60, 500);
    }
    s.casting.tool = [];
    s.casting.mods = [];
    s.casting.sockets = [];
    s.casting.windup = 0;
  }, SHELLS);
  await page.waitForTimeout(300);
  await tab(page, 'casting');
  await dismiss(page);

  /**
   * ONE HELPER, and it is the whole point of the driver: build a tool from a
   * chosen Sockets stone and read back what the LIVE ENGINE says — the socket
   * count, and the real folded value of every bucket we are about to move.
   */
  const buildTool = async (socketsMat: string): Promise<{ n: number; focus: number }> =>
    page.evaluate(async (mat) => {
      const w = window as unknown as Record<string, any>;
      const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
      const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
      const ts = await import(/* @vite-ignore */ '/src/engine/systems/toolSockets' + '.ts');
      const cast = await import(/* @vite-ignore */ '/src/engine/systems/casting' + '.ts');
      const s = w['__engine'].getState();
      s.casting.tool = cp.PART_TYPES.map((t: string, i: number) => ({
        ...fp.makePart(t, t === 'sockets' ? mat : 'graveclay', 60), id: i + 1,
      }));
      s.casting.wear = 0;
      s.casting.sockets = [];
      const tool = cast.currentTool(s);
      return { n: ts.socketCount(tool), focus: ts.socketFocus(tool) };
    }, socketsMat);

  /** The REAL folded bucket, through the live engine's own modifier layer. */
  const bucket = async (name: string): Promise<number> =>
    page.evaluate(async (b) => {
      const w = window as unknown as Record<string, any>;
      const mod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
      return mod.computeBucket(w['__engine'].getState(), b).toNumber();
    }, name);

  // ═══ 1. THE SLOT COUNT COMES FROM THE STONE ══════════════════════════════
  console.log('\n1 — the Sockets part decides how many, and a hollower stone holds more');

  const marl = await buildTool('marl');
  check(marl.n >= 1, 'the starter stone holds at least one', `${marl.n}`);
  check(Math.abs(marl.focus - 1) < 0.01, 'and holds it at exactly 1.00 focus', marl.focus.toFixed(3));

  const deep = await buildTool('voidstar');
  check(deep.n > marl.n, 'a hollow+charged deep stone holds MORE', `${marl.n} → ${deep.n}`);
  check(deep.focus > 1.05, 'and holds them harder', `${deep.focus.toFixed(2)}×`);

  // The standing reach rule, asked of the live engine per shell.
  const reach = await page.evaluate(async (shells) => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const ts = await import(/* @vite-ignore */ '/src/engine/systems/toolSockets' + '.ts');
    const cast = await import(/* @vite-ignore */ '/src/engine/systems/casting' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const s = w['__engine'].getState();
    const out: Record<string, number> = {};
    for (const shell of shells) {
      let best = 0;
      for (const m of mats.materialsOfShell(shell)) {
        s.casting.tool = cp.PART_TYPES.map((t: string, i: number) => ({
          ...fp.makePart(t, m.id, 60), id: i + 1,
        }));
        best = Math.max(best, ts.socketCount(cast.currentTool(s)));
      }
      out[shell] = best;
    }
    return out;
  }, SHELLS);
  const starved = Object.entries(reach).filter(([, n]) => n < 1).map(([k]) => k);
  check(starved.length === 0, 'every shell can build a tool that sockets something',
    Object.entries(reach).map(([k, v]) => `${k}:${v}`).join(' '));

  await buildTool('voidstar');
  await page.waitForTimeout(400);
  check(await page.locator('[data-testid="tool-sockets"]').count() === 1, 'the card is on screen');
  check((await txt(page, '[data-testid="socket-count"]')).startsWith('0/'),
    'and says the row is empty', await txt(page, '[data-testid="socket-count"]'));
  await shot(page, '1-empty', '[data-testid="tool-sockets"]');

  // ═══ 2. A REAL RELIC, AND ITS EFFECT ON THE LIVE PATH ════════════════════
  console.log('\n2 — a real relic goes in, and the real bucket moves');

  /**
   * A REAL RELIC, MINTED BY THE GAME'S OWN `mintRelic` — affixes rolled from the
   * context, not a fixture. Only its waking is forced (to Awake), because
   * carrying one for two hours is not something a driver can do.
   */
  const relic = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const rel = await import(/* @vite-ignore */ '/src/engine/systems/relics' + '.ts');
    const s = w['__engine'].getState();
    s.relics.held = [];
    s.relics.equipped = [];
    // Mint until one carries an off-income affix we can watch move. Every one of
    // these is a real roll from the 'depth' pool.
    let r: any = null;
    for (let i = 0; i < 60; i++) {
      const made = rel.addRelic(s, rel.mintRelic(s, 'depth', 1000 + i));
      if (made.affixes && made.affixes['dropRate'] > 0) { r = made; break; }
      s.relics.held = s.relics.held.filter((x: any) => x.uid !== made.uid);
    }
    if (!r) r = rel.addRelic(s, rel.mintRelic(s, 'depth', 7));
    r.waking = 2;
    return {
      uid: r.uid, source: r.source, rarity: r.rarity,
      affixes: r.affixes, minted: true,
      // RESOLVE THE AFFIX ID TO ITS BUCKET. 'hardDrill' is an affix id, not a
      // bucket — asking the modifier layer for it is asking for nothing, which
      // is a smaller version of the very bug this driver went on to find.
      watch: (() => {
        for (const k of Object.keys(r.affixes)) {
          const def = rel.AFFIXES[k];
          if (def) return def.bucket as string;
        }
        return 'dropRate';
      })(),
    };
  });
  await page.waitForTimeout(300);
  check(!!relic.uid, 'a real relic is in the hold', `#${relic.uid} ${relic.source}`);

  const WATCH = relic.watch as string;
  const dropBefore = await bucket(WATCH);
  const setRelic = await page.evaluate(async (uid) => {
    const w = window as unknown as Record<string, any>;
    return w['__engine'].dispatch({ type: 'setSocket', slot: 0, fill: { kind: 'relic', uid } });
  }, relic.uid);
  await page.waitForTimeout(400);
  check(setRelic.ok === true, 'it sockets', setRelic.reason ?? '');
  const dropAfter = await bucket(WATCH);
  check(dropAfter > dropBefore,
    `AND THE REAL ${WATCH} BUCKET MOVED — the live path, not a local sum`,
    `${dropBefore.toFixed(4)} → ${dropAfter.toFixed(4)}`);
  const detail = await txt(page, '[data-testid="socket-detail"]');
  check((await txt(page, '[data-testid="socket-affixes"]')).length > 0 || detail.length > 0,
    'and the card names what it is doing', detail.slice(0, 80));
  await shot(page, '2-relic', '[data-testid="tool-sockets"]');

  // MINE WITH IT — the brief asks to see the power working through the tool.
  const mined = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const engine = w['__engine'];
    const s = engine.getState();
    s.face.cells = s.face.cells.map(() => 8);
    s.face.ore = new Array(s.face.cells.length).fill('');
    const before = s.stats.fieldChargeHarvested.toNumber();
    let ok = 0;
    for (let i = 0; i < 40; i++) {
      s.casting.windup = 0;
      if (engine.dispatch({ type: 'chip', cell: i % s.face.cells.length }).ok) ok++;
    }
    return { swings: ok, charge: s.stats.fieldChargeHarvested.toNumber() - before };
  });
  await page.waitForTimeout(300);
  check(mined.swings > 0 && mined.charge > 0,
    'and you can mine with the thing while it is socketed',
    `${mined.swings} swings, ${mined.charge.toFixed(1)} charge`);

  // ═══ 3. A REAL RUNE PAIR, THROUGH THE REAL GRAMMAR ═══════════════════════
  console.log('\n3 — two adjacent runes speak, using the inscription grammar');

  await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    for (const id of ['kel', 'thur', 'mol', 'vey']) s.runes.found[id] = 5;
    s.runes.pairsSeen = [];
  });
  const strikeBefore = await bucket('strikePower');
  const oneRune = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    return w['__engine'].dispatch({ type: 'setSocket', slot: 1, fill: { kind: 'rune', id: 'kel' } });
  });
  await page.waitForTimeout(300);
  check(oneRune.ok === true, 'one rune sockets', oneRune.reason ?? '');
  const saysAfterOne = await page.locator('[data-testid="socket-speaks"]').count();
  check(saysAfterOne === 0, 'and alone it says nothing — a pair needs two');

  const twoRune = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    return w['__engine'].dispatch({ type: 'setSocket', slot: 2, fill: { kind: 'rune', id: 'thur' } });
  });
  await page.waitForTimeout(400);
  check(twoRune.ok === true, 'the neighbour sockets', twoRune.reason ?? '');
  const speaks = await txt(page, '[data-testid="socket-speaks"]');
  check(/Weighted Edge/i.test(speaks), 'and the row SPEAKS — kel then thur is The Weighted Edge', speaks);
  const strikeAfter = await bucket('strikePower');
  check(strikeAfter > strikeBefore, 'and the real strikePower bucket moved',
    `${strikeBefore.toFixed(4)} → ${strikeAfter.toFixed(4)}`);
  const seen = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    return w['__engine'].getState().runes.pairsSeen as string[];
  });
  check(seen.includes('kel|thur'), 'and it is written into the SAME codex an inscription uses',
    seen.join(','));
  await shot(page, '3-runes', '[data-testid="tool-sockets"]');

  // DISSONANCE IS REFUSED, AND EATS NOTHING.
  const dis = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    const had = s.runes.found['vey'];
    // kel|vey is dissonant, and slot 1 holds kel — so slot 0 taking vey fights.
    const r = w['__engine'].dispatch({ type: 'setSocket', slot: 0, fill: { kind: 'rune', id: 'vey' } });
    return { ok: r.ok, reason: r.reason ?? '', had, now: s.runes.found['vey'] };
  });
  await page.waitForTimeout(300);
  check(dis.ok === false, 'a dissonant neighbour is REFUSED', dis.reason);
  check(dis.now === dis.had, 'and the rune was NOT eaten — an inscription would have burned it',
    `${dis.had} → ${dis.now}`);

  // ═══ 4. A REAL GEM ═══════════════════════════════════════════════════════
  console.log('\n4 — a real gem lands its bonus');

  const gem = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const s = w['__engine'].getState();
    const g = mats.GEMS[0];
    s.materials.gems[g.id] = 2;
    return { id: g.id, name: g.name, bucket: g.bucket, value: g.value };
  });
  const gemBefore = await bucket(gem.bucket);
  const setGem = await page.evaluate(async (id) => {
    const w = window as unknown as Record<string, any>;
    return w['__engine'].dispatch({ type: 'setSocket', slot: 3, fill: { kind: 'gem', id } });
  }, gem.id);
  await page.waitForTimeout(400);
  check(setGem.ok === true, `${gem.name} sockets`, setGem.reason ?? '');
  const gemAfter = await bucket(gem.bucket);
  check(gemAfter > gemBefore, `and the real ${gem.bucket} bucket moved`,
    `${gemBefore.toFixed(4)} → ${gemAfter.toFixed(4)}`);
  const gemCount = await page.evaluate((id) => {
    const w = window as unknown as Record<string, any>;
    return w['__engine'].getState().materials.gems[id] as number;
  }, gem.id);
  check(gemCount === 1, 'and it came off the pile', `2 → ${gemCount}`);
  await shot(page, '4-gem', '[data-testid="tool-sockets"]');

  // ═══ 5. REVERSIBLE ═══════════════════════════════════════════════════════
  console.log('\n5 — pull one out, socket another, nothing consumed');

  const pulled = await page.evaluate(async (id) => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    const r = w['__engine'].dispatch({ type: 'setSocket', slot: 3, fill: null });
    return { ok: r.ok, reason: r.reason ?? '', gems: s.materials.gems[id] as number };
  }, gem.id);
  await page.waitForTimeout(400);
  check(pulled.ok === true, 'the gem comes out', pulled.reason);
  check(pulled.gems === 2, 'and goes back on the pile — nothing was used up', `${pulled.gems}`);
  const gemBack = await bucket(gem.bucket);
  check(Math.abs(gemBack - gemBefore) < 1e-9, 'and its effect is gone with it',
    `${gemAfter.toFixed(4)} → ${gemBack.toFixed(4)}`);

  const swapped = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    return w['__engine'].dispatch({ type: 'setSocket', slot: 3, fill: { kind: 'rune', id: 'mol' } });
  });
  await page.waitForTimeout(400);
  check(swapped.ok === true, 'and something else goes in its place', swapped.reason ?? '');

  // ═══ 6. THE POOL IS SHARED ═══════════════════════════════════════════════
  console.log('\n6 — worn OR set, never both');

  /**
   * THROUGH THE ENGINE'S OWN DISPATCH, not through an imported module — and the
   * first version of this got it wrong in a way worth writing down.
   *
   * It called `relics.equipRelic` on a module the driver had dynamically
   * imported, and the guard did not fire. The guard was fine: a probe showed
   * `toolSockets.relicIsSocketed` returning true while `relics.isSocketedRelic`
   * returned false in the same breath, which means Vite handed the driver a
   * SECOND instance of `relics.ts` whose `wireSocketed` had never been called.
   * The app's instance — the one the game actually runs on — is wired.
   *
   * So the lesson is a harness rule, not a fix: a WIRED cross-module hook can
   * only be tested through the live dispatch path, because an imported copy has
   * its own unwired module scope. Which is what should have been done anyway,
   * this being a driver.
   */
  const pool = await page.evaluate(async (uid) => {
    const w = window as unknown as Record<string, any>;
    const engine = w['__engine'];
    const s = engine.getState();
    const socketed = s.casting.sockets.some((f: any) => f?.kind === 'relic' && f.uid === uid);
    const onBelt = s.relics.equipped.includes(uid);
    const equip = engine.dispatch({ type: 'equipRelic', uid, slot: 0 });
    const render = engine.dispatch({ type: 'renderRelic', uid });
    return {
      socketed, onBelt,
      equipRefused: !equip.ok, equipWhy: equip.reason ?? '',
      renderRefused: !render.ok, renderWhy: render.reason ?? '',
      stillHeld: s.relics.held.some((r: any) => r.uid === uid),
      beltAfter: s.relics.equipped.includes(uid),
    };
  }, relic.uid);
  check(pool.socketed === true, 'the relic is in the tool');
  check(pool.onBelt === false, 'and is NOT on the belt');
  check(pool.beltAfter === false, 'and the refused equip did not sneak it on');
  check(pool.equipRefused, 'wearing it is refused while it is set', pool.equipWhy);
  check(pool.renderRefused, 'and it cannot be scrapped out from under you', pool.renderWhy);
  check(pool.stillHeld, 'and it still exists');

  // Now take it off the belt side: socket it out and wear it, to show it moves back.
  const moved = await page.evaluate(async (uid) => {
    const w = window as unknown as Record<string, any>;
    const engine = w['__engine'];
    engine.dispatch({ type: 'setSocket', slot: 0, fill: null });
    const equip = engine.dispatch({ type: 'equipRelic', uid, slot: 0 });
    return { ok: equip.ok, onBelt: engine.getState().relics.equipped.includes(uid) };
  }, relic.uid);
  await page.waitForTimeout(300);
  check(moved.ok && moved.onBelt, 'pull it out and it can be worn again — the move goes both ways');

  // ═══ 7. THE SWING IS UNTOUCHED ═══════════════════════════════════════════
  console.log('\n7 — a socket never reaches the swing');

  const swing = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const cast = await import(/* @vite-ignore */ '/src/engine/systems/casting' + '.ts');
    const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMining' + '.ts');
    const ts = await import(/* @vite-ignore */ '/src/engine/systems/toolSockets' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const s = w['__engine'].getState();
    s.casting.sockets = [];
    const bare = JSON.stringify(tm.effectOf(cast.currentTool(s), false, 1));
    // Fill every socket with the strongest things available.
    for (const g of mats.GEMS) s.materials.gems[g.id] = 5;
    for (const id of ['kel', 'thur', 'mol']) s.runes.found[id] = 5;
    const n = ts.socketCount(cast.currentTool(s));
    for (let i = 0; i < n; i++) {
      const r = { uid: s.relics.nextUid++, defId: 'x', rarity: 4, waking: 2, fusedFrom: 0,
        source: 'depth', affixes: { dustYield: 2, regen: 2, cap: 2 } };
      s.relics.held.push(r);
      w['__engine'].dispatch({ type: 'setSocket', slot: i, fill: { kind: 'relic', uid: r.uid } });
    }
    const full = JSON.stringify(tm.effectOf(cast.currentTool(s), false, 1));
    return { same: bare === full, filled: s.casting.sockets.filter(Boolean).length, n, bare, full };
  });
  await page.waitForTimeout(400);
  check(swing.filled === swing.n, 'every socket filled with a Mythic yield relic', `${swing.filled}/${swing.n}`);
  check(swing.same, 'and the SWING is byte-identical — reach, splash and ore untouched',
    swing.same ? '' : `${swing.bare} vs ${swing.full}`);
  await shot(page, '5-full', '[data-testid="tool-sockets"]');

  // ═══ 8. 380px, 0 OVERFLOW ════════════════════════════════════════════════
  console.log('\n8 — 380px');
  const over = await page.evaluate(() => {
    const bad: string[] = [];
    const root = document.querySelector('[data-testid="tool-sockets"]');
    if (root) {
      for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width > 0 && (r.left < -1 || r.right > window.innerWidth + 1)) {
          bad.push(`${(el as HTMLElement).className || el.tagName} ${Math.round(r.left)}..${Math.round(r.right)}`);
        }
      }
    }
    return { bad, doc: document.documentElement.scrollWidth, win: window.innerWidth };
  });
  check(over.bad.length === 0, 'nothing in the card leaves the viewport', over.bad.slice(0, 3).join(' | '));
  check(over.doc <= over.win + 1, 'and the page does not scroll sideways', `${over.doc} vs ${over.win}`);

  await browser.close();

  console.log(`\n${shots.length} shots → ${OUT}`);
  if (problems.length) {
    console.log(`\n${problems.length} PROBLEM(S):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  console.log('\nALL CHECKS PASS');
}

main().catch((e) => { console.error(e); process.exit(1); });
