/**
 * THE NINE PLAYTEST REPORTS, DRIVEN IN THE REAL GAME.
 *
 *   1  socket pickers say what a thing DOES, and are searchable by effect
 *   2  stat-from-use scaling, per stat, and a worn tool breaks slower
 *   3  living growth varies by part and stone, and prints its numbers
 *   4  section headers stick to the top of the scroll
 *   5  ore is worth the attention it costs
 *   6  the legends panel explains itself
 *   7  instability says what it does, what drives it, how to lower it
 *   8  balance says it is an ore-vs-rock choice
 *   9  the reaction bench narrows the search instead of being a slot machine
 *
 *   npx tsx scripts/verify-playtest-a69.ts [port] [outDir]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots';
const W = 380, H = 1600;

const problems: string[] = [];
const check = (ok: boolean, label: string, detail = ''): boolean => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(`${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
};
async function tapp(page: Page, sel: string): Promise<void> {
  await dismiss(page);
  await page.locator(sel).first().click();
  await page.waitForTimeout(300);
}
async function shot(page: Page, name: string, full = false): Promise<void> {
  await dismiss(page);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/a69-${name}.png`, fullPage: full });
}
const txt = async (page: Page, sel: string): Promise<string> =>
  (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

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

  // ═══ 5. ORE TIME (engine figures — read before any UI is touched) ═════════
  console.log('\n5 — ore is worth the attention it costs');
  const ore = await page.evaluate(async () => {
    const o = await import(/* @vite-ignore */ '/src/engine/content/ores' + '.ts');
    const sys = await import(/* @vite-ignore */ '/src/engine/systems/ores' + '.ts');
    const live = o.ORES.filter((x: any) => x.minDepth <= 60);
    const w = live.reduce((n: number, x: any) => n + x.weight, 0);
    const mean = live.reduce((n: number, x: any) => n + x.weight * x.digSec, 0) / w;
    const cellsPerHour = sys.ORE_SPAWN_CHANCE * 3600
      * (sys.ORE_VEIN_CHANCE * ((sys.ORE_VEIN_MIN + sys.ORE_VEIN_MAX) / 2) + (1 - sys.ORE_VEIN_CHANCE));
    return {
      mean, minPerHour: (cellsPerHour * mean) / 60,
      digs: o.ORES.map((x: any) => `${x.name} ${x.digSec}s`),
      drillSpeed: sys.DRILL_ORE_SPEED, drillShare: sys.DRILL_ORE_SHARE,
    };
  });
  // 28.0 min/hr was the shipped figure — measured in `sim-out/ore-time.md`.
  check(ore.minPerHour < 12,
    'taking every pocket the field makes costs well under a fifth of the hour',
    `28.0 min/hr → ${ore.minPerHour.toFixed(1)} min/hr (mean dig ${ore.mean.toFixed(1)}s)`);
  check(ore.drillSpeed < 1 && ore.drillShare < 1,
    'and the hand-vs-drill trade survives — faster, and leaves some behind',
    `drill ${ore.drillSpeed}x time, keeps ${ore.drillShare} of the charge`);
  console.log(`        ${ore.digs.join(' · ')}`);

  // ═══ 9. THE REACTION BENCH ═══════════════════════════════════════════════
  console.log('\n9 — the bench narrows the search instead of running blind');
  /*
   * DRIVEN THROUGH THE APP'S OWN ENGINE, not through a dynamic import.
   *
   * `CHAINS` is MODULE-LEVEL state filled by `registerChains()` at
   * `createEngine()`, and a `page.evaluate` dynamic import of the same
   * specifier resolves to a SECOND module instance whose array is still empty —
   * which is why the first cut of this check read "0 chains" against a bench
   * that plainly works. Every other driver in this repo gets away with the
   * import because it only calls state-passing helpers (`addMaterial` takes the
   * state object); anything reading module state has to go through `__engine`.
   *
   * So the pair below is HARDCODED from `content/shell2/chains.ts` and fired
   * through the real `dispatch`, and the narrowing is measured in node by
   * `scripts/sim-legendary`-style tooling rather than re-derived here.
   */
  const PAIR = { a: 'refineslag', b: 'sablequartz' };
  const fired = await page.evaluate(async ([a, b]) => {
    const w = window as unknown as Record<string, any>;
    const f = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const m = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const s = w['__engine'].getState();
    s.depthRecords['ferrite'] = 200;
    f.addMaterial(s, a!, m.BAND_RANGES['fair'][0], 50);
    f.addMaterial(s, b!, m.BAND_RANGES['fair'][0], 50);
    const res = w['__engine'].dispatch({ type: 'transmute', a, b });
    return {
      ok: res.ok, found: (res.data as any)?.found, out: (res.data as any)?.out,
      line: (res.data as any)?.line,
      pair: `${m.materialDef(a!).name} + ${m.materialDef(b!).name}`,
    };
  }, [PAIR.a, PAIR.b]);
  check(fired.ok && !!fired.found, 'a real pair produces a real result on the live path',
    `${fired.pair} → ${fired.out ? String(fired.out) : 'nothing'}`);

  await tab(page, 'refinery');
  await page.waitForTimeout(700);
  check(await page.locator('[data-testid="bench-reading"]').count() === 1,
    'the reading is on screen at the bench');

  // Put a stone the bench has smelled in slot A and read what it says.
  const scentUi = await page.evaluate(async ([a]) => {
    const w = window as unknown as Record<string, any>;
    const f = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const m = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    f.addMaterial(w['__engine'].getState(), a!, m.BAND_RANGES['fair'][0], 60);
    return true;
  }, [PAIR.a]);
  void scentUi;
  await page.waitForTimeout(400);
  // THE PICKER IS THE PORTALLED `Select`, not a native <select> — so it is
  // opened and read the way a player reads it, off role=option.
  await tapp(page, '[aria-label="Refinery slot A"]');
  const marked = await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent ?? '');
    return {
      total: opts.length,
      marked: opts.filter((t) => t.trim().startsWith('◆')).length,
      firstFew: opts.slice(0, 3).map((t) => t.trim().slice(0, 30)),
    };
  });
  check(marked.marked > 0 && marked.marked < marked.total,
    'and the picker MARKS the stones that react, so the field is narrowed where you choose',
    `${marked.marked} of ${marked.total} marked · ${marked.firstFew.join(' | ')}`);
  await page.keyboard.press('Escape');
  await shot(page, '9-bench');

  // ═══ SET UP A REAL TOOL for the casting-screen checks ════════════════════
  await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const f = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const m = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const rel = await import(/* @vite-ignore */ '/src/engine/systems/relics' + '.ts');
    const s = w['__engine'].getState();
    s.depthRecords['loam'] = 150;
    s.depthRecords['verdance'] = 120;
    // A LIVING tool, so growth has something to offer, with a dense core.
    const live = m.materialsOfShell('verdance');
    // Object-method shorthand, not a named const arrow — tsx's `keepNames`
    // compiles the latter into a `__name()` call that does not exist in-page.
    const pick = {
      stone(t: string): string {
        return t === 'core' ? (live[live.length - 1] as any).id : (live[0] as any).id;
      },
    };
    s.casting.tool = cp.PART_TYPES.map((t: string) => ({
      id: s.casting.nextId++, ...fp.makePart(t, pick.stone(t), 80),
    }));
    for (const p of s.casting.tool) p.growth = 99_999;
    // A worn-in history, so seasoning has something to say.
    s.casting.xp = 60_000;
    s.casting.repairs = 18;
    // A belt of real relics, so the picker has a pile to be useless about.
    // `addRelic` is the real grant path — `mintRelic` alone does not allocate
    // the uid, so pushing raw mints gives every relic the same one.
    for (let i = 0; i < 9; i++) rel.addRelic(s, rel.mintRelic(s, 'depth', 40 + i * 12));
    f.addMaterial(s, live[0].id, m.BAND_RANGES['good'][0], 300);
  });
  await page.waitForTimeout(500);
  await tab(page, 'casting');
  await page.waitForTimeout(700);

  // ═══ 2. SEASONING ════════════════════════════════════════════════════════
  console.log('\n2 — stats move with use, per stat, at their own rates');
  await tapp(page, '[data-testid="drawer-tool"] summary');
  const season = await txt(page, '[data-testid="tool-season"]');
  check(await page.locator('[data-testid="tool-season"]').count() === 1, 'the worn-in card is on screen');
  const rates = await page.evaluate(async () => {
    const t = await import(/* @vite-ignore */ '/src/engine/systems/toolSeason' + '.ts');
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    const rows = t.seasonRows(s).map((r: any) => `${r.stat} ${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(1)}%`);
    const distinct = new Set(t.seasonRows(s).map((r: any) => r.pct.toFixed(2))).size;
    const up = t.seasonRows(s).filter((r: any) => r.pct > 0).length;
    const down = t.seasonRows(s).filter((r: any) => r.pct < 0).length;
    return { rows, distinct, up, down, resist: t.wearResist(s) };
  });
  check(rates.distinct >= 6, 'every stat moves at its OWN rate, not one global one',
    `${rates.distinct} distinct magnitudes`);
  check(rates.up > 0 && rates.down > 0, 'and it is a SHAPE — some come in, some go off',
    `${rates.up} up, ${rates.down} down`);
  check(rates.resist > 0.2, 'and a worked, mended tool breaks slower',
    `${Math.round(rates.resist * 100)}% slower to wear`);
  console.log(`        ${rates.rows.join('  ')}`);
  check(/slower to wear/.test(season), 'and the card says so', season.slice(-60));
  await shot(page, '2-season');

  // ═══ 8. BALANCE ══════════════════════════════════════════════════════════
  console.log('\n8 — balance is legible as an ore-vs-rock choice');
  const bal = await txt(page, '[data-testid="tool-balance"]');
  check(/BUILT FOR (ORE|ROCK)/.test(bal), 'it leads with the JOB, not the mechanism',
    (bal.match(/BUILT FOR \w+/) ?? [''])[0]);
  check(/Want the other half/.test(bal), 'and says how to swap to the other one');
  check(/because of/.test(bal), 'and what in the stone is driving it');

  // ═══ 7. INSTABILITY ══════════════════════════════════════════════════════
  console.log('\n7 — instability says what it does, what drives it, how to lower it');
  const seat = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    // Carry something loud, so the card has a real number to explain.
    s.casting.knownMods = ['longarm', 'heavyhead', 'quarryjaw'];
    s.casting.mods = [{ id: 'longarm', n: 3 }, { id: 'heavyhead', n: 2 }, { id: 'quarryjaw', n: 2 }];
    return s.casting.mods.length;
  });
  await page.waitForTimeout(600);
  const SCOPE = '[data-testid="drawer-tool"] ';
  const inst = await txt(page, `${SCOPE}[data-testid="instability"]`);
  if (await page.locator(`${SCOPE}[data-testid="instability"]`).count() === 0) {
    check(false, 'the instability card is on screen', `seated ${seat} mods and it did not render`);
  } else {
    check(/swings in 100|does nothing at all/.test(inst), 'it says what a misfire COSTS',
      (inst.match(/About \d+ swings in 100[^.]*\./) ?? ['(quiet form)'])[0].slice(0, 90));
    check(await page.locator(`${SCOPE}[data-testid="instability-from"]`).count() === 1,
      'and itemises what is driving it up');
    const how = await txt(page, `${SCOPE}[data-testid="instability-how"]`);
    check(/seat |SUPPLE|STILLNESS|no stabilising/.test(how), 'and names what would bring it down',
      how.slice(0, 90));
  }
  await shot(page, '7-instability');

  // ═══ 3. LIVING GROWTH ════════════════════════════════════════════════════
  console.log('\n3 — growth varies by part and stone, and prints its numbers');
  const growth = await page.evaluate(async () => {
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    const per = s.casting.tool.map((p: any) => ({
      type: p.type,
      offer: fp.boonsFor(p).map((b: any) => b.id).join('+'),
      costs: fp.boonsFor(p).map((b: any) => fp.boonCost(p, b.id)),
      numbers: fp.boonsFor(p).map((b: any) => fp.boonNumbers(b.id)),
    }));
    return {
      per,
      distinctOffers: new Set(per.map((x: any) => x.offer)).size,
      distinctCosts: new Set(per.flatMap((x: any) => x.costs)).size,
      everyOneNumbered: per.every((x: any) => x.numbers.every((n: string) => /\d/.test(n))),
    };
  });
  check(growth.distinctOffers > 1, 'different parts are offered different things',
    `${growth.distinctOffers} distinct offers across 7 parts`);
  check(growth.distinctCosts > 1, 'and they cost different amounts of work',
    `${growth.distinctCosts} distinct costs`);
  check(growth.everyOneNumbered, 'and every option shows the number it will move');
  const card = await txt(page, '[data-testid="tool-living"]');
  check(/cells/.test(card), 'and the card prints the cost on screen');
  await shot(page, '3-growth');

  // ═══ 1. SOCKET PICKERS ═══════════════════════════════════════════════════
  console.log('\n1 — socket pickers say what a thing DOES');
  const sock = await page.locator('[data-testid="tool-sockets"]').count();
  if (sock === 0) {
    check(false, 'the sockets card is on screen');
  } else {
    const opts = await page.locator('[data-testid^="socket-opt-relic"]').count();
    check(opts > 0, 'the relic picker lists rows, not a dropdown', `${opts} rows`);
    const first = await txt(page, '[data-testid^="socket-opt-relic"]');
    // A decimal is expected: low-rarity affixes are genuinely worth 2.8%, and
    // the earlier `toFixed(0)` printing that as "0%" was the bug this fixed.
    check(/[+-]\d+(\.\d+)?%/.test(first), 'and each row prints its real affixes at real magnitudes',
      first.replace(/\n/g, ' ').slice(0, 90));
    const searchable = await page.locator('[data-testid="socket-search"]').count();
    check(searchable === 1, 'and the pile is searchable once it is big enough');
    if (searchable === 1) {
      await page.locator('[data-testid="socket-search"]').fill('yield');
      await page.waitForTimeout(300);
      const left = await page.locator('[data-testid^="socket-opt-relic"]').count();
      check(left < opts, 'and searching by EFFECT actually filters', `${opts} → ${left}`);
      await page.locator('[data-testid="socket-search"]').fill('');
      await page.waitForTimeout(200);
    }
    // Runes: a glyph is not an effect.
    await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      const s = w['__engine'].getState();
      for (const r of ['kel', 'thur', 'ash', 'vey']) s.runes.found[r] = 3;
    });
    await page.waitForTimeout(400);
    await tapp(page, '[data-testid="socket-kind-rune"]');
    const rune = await txt(page, '[data-testid^="socket-opt-rune"]');
    check(rune.length > 0 && !/^\S+ \S+$/.test(rune),
      'and a rune row says what it would DO in this slot, not just its glyph',
      rune.replace(/\n/g, ' ').slice(0, 90));
  }
  await shot(page, '1-sockets');

  // ═══ 6. LEGENDS ══════════════════════════════════════════════════════════
  console.log('\n6 — the legends panel explains itself');
  await tapp(page, '[data-testid="drawer-legends"] summary');
  const leg = await txt(page, '[data-testid="legends"]');
  check(/what a legendary part is/i.test(leg), 'it says what a legendary part IS');
  check(/how you get one/i.test(leg), 'and how you get one');
  check(/what re-pour does/i.test(leg), 'and what re-pour does');
  check(/Floor Warden \(the boss/.test(leg), 'and explains the jargon in the requirement');
  check(/half again as strong/.test(leg), 'and says how much it actually helps');
  const req = await txt(page, '[data-testid="legend-req-lastedge"]');
  check(/^To earn it:/.test(req), 'and an unearned row reads as an instruction', req);
  await shot(page, '6-legends');

  // ═══ 4. STICKY HEADERS ═══════════════════════════════════════════════════
  console.log('\n4 — section headers stick as you scroll');
  const sticky = await page.evaluate(() => {
    const d = document.querySelector('[data-testid="drawer-tool"] summary') as HTMLElement | null;
    if (!d) return null;
    const cs = getComputedStyle(d);
    return { position: cs.position, top: cs.top, z: cs.zIndex, bg: cs.backgroundColor };
  });
  check(sticky?.position === 'sticky', 'the section header is sticky', JSON.stringify(sticky));
  check(!!sticky && sticky.bg !== 'rgba(0, 0, 0, 0)',
    'and opaque, so the content cannot read through it', sticky?.bg ?? '');
  // And it really stays put: scroll deep into the open section and re-measure.
  const stuck = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="drawer-tool"] summary') as HTMLElement;
    const before = Math.round(el.getBoundingClientRect().top);
    // THE WINDOW DOES NOT SCROLL — the app scrolls an inner container, so
    // `window.scrollBy` moves nothing and the check would pass on a header that
    // is not sticky at all. Walk up to the element that actually scrolls.
    let sc: HTMLElement | null = el.parentElement;
    while (sc && sc.scrollHeight <= sc.clientHeight + 4) sc = sc.parentElement;
    const scrolled = sc ? sc.scrollTop : -1;
    if (sc) sc.scrollTop += 900;
    return new Promise<{ before: number; after: number; moved: number; tag: string }>((res) => {
      requestAnimationFrame(() => {
        res({
          before,
          after: Math.round(el.getBoundingClientRect().top),
          moved: sc ? sc.scrollTop - scrolled : 0,
          tag: sc ? `${sc.tagName}.${sc.className.split(' ')[0] ?? ''}` : 'none',
        });
      });
    });
  });
  check(stuck.moved > 100, 'the section really scrolls', `${stuck.tag} moved ${stuck.moved}px`);
  check(stuck.moved > 100 && Math.abs(stuck.after - stuck.before) <= 2,
    'and the header did not move with it — which is what sticky MEANS',
    `top ${stuck.before} → ${stuck.after} while the section scrolled ${stuck.moved}px`);
  await shot(page, '4-sticky');

  // ═══ 380px ═══════════════════════════════════════════════════════════════
  console.log('\n0 — 380px');
  const over = await page.evaluate(() => {
    const d = document.documentElement;
    return { sw: d.scrollWidth, cw: d.clientWidth };
  });
  check(over.sw <= over.cw + 1, 'no horizontal overflow at 380px', `${over.sw} vs ${over.cw}`);
  await shot(page, 'full', true);

  await browser.close();
  console.log(`\n${problems.length === 0 ? 'ALL PASS' : `${problems.length} PROBLEM(S)`}`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
