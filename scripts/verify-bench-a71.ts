/**
 * THE REACTION BENCH FOR A SHALLOW PLAYER, DRIVEN IN THE REAL GAME.
 *
 * A Loam+Ferrite hold built from REAL DROPS — not hand-stocked — then:
 *   1  the bench reads the PAIR, not two solo scents
 *   2  it refuses to promise anything about two unrelated stones
 *   3  the shallow board is real: several chains fireable from what you hold
 *   4  and they fire, through the live dispatch, guided by the reading
 *   5  380px, 0 overflow
 *
 *   npx tsx scripts/verify-bench-a71.ts [port] [outDir]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots';
const W = 380, H = 1500;

const problems: string[] = [];
const check = (ok: boolean, label: string, detail = ''): boolean => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(`${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
};
async function shot(page: Page, name: string, full = false): Promise<void> {
  await dismiss(page);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/a71-${name}.png`, fullPage: full });
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

  // A HOLD BUILT FROM REAL DROPS, so the board under test is the one a player
  // who has only mined Loam and Ferrite would actually be looking at.
  const hold = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const f = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const m = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const s = w['__engine'].getState();
    s.depthRecords['ferrite'] = 200;
    for (const sh of ['loam', 'ferrite']) {
      for (let d = 1; d <= 150; d++) {
        for (let i = 0; i < 40; i++) {
          const r = m.rollDrop(sh, d);
          if (r?.materialId) f.addMaterial(s, r.materialId, r.purity ?? 50, 1);
        }
      }
    }
    return Object.keys(s.materials.stacks).filter((id: string) => f.materialCount(s, id) > 0).length;
  });
  await page.waitForTimeout(500);
  console.log(`\n  (a Loam+Ferrite hold of ${hold} materials, from real drops)`);

  // ═══ 3. THE SHALLOW BOARD ════════════════════════════════════════════════
  console.log('\n3 — the shallow board is real');
  const board = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const f = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const s = w['__engine'].getState();
    const ids = Object.keys(s.materials.stacks).filter((id: string) => f.materialCount(s, id) > 0);
    // Ask the LIVE engine, through the reading the player sees, which pairs it
    // calls reactive — the module-instance trap from A.69 means we must not
    // import `CHAINS` here, so the question is asked the way the UI asks it.
    const hits: Array<[string, string]> = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const r = w['__ui'].benchReading(s, ids[i], ids[j]);
        if (r.read === 'reacts' || r.read === 'known') hits.push([ids[i], ids[j]]);
      }
    }
    return { pairs: (ids.length * (ids.length - 1)) / 2, hits };
  }).catch(() => null);

  // `__ui` may not expose it; fall back to driving the panel itself.
  let hits: Array<[string, string]> = [];
  if (board && board.hits.length > 0) {
    hits = board.hits;
    check(hits.length >= 6, 'several chains are reachable from stones actually held',
      `${hits.length} of ${board.pairs} pairs react (was 3 before A.71)`);
  } else {
    const viaDispatch = await page.evaluate(async () => {
      const w = window as unknown as Record<string, any>;
      const f = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
      const s = w['__engine'].getState();
      const ids = Object.keys(s.materials.stacks).filter((id: string) => f.materialCount(s, id) > 0);
      return { ids, pairs: (ids.length * (ids.length - 1)) / 2 };
    });
    // Fire every pair through the real dispatch and count what lands. Costly
    // but honest — it is the same verb the player presses.
    const fired: Array<[string, string]> = [];
    for (let i = 0; i < viaDispatch.ids.length; i++) {
      for (let j = i + 1; j < viaDispatch.ids.length; j++) {
        const got = await page.evaluate(([a, b]) => {
          const w = window as unknown as Record<string, any>;
          const r = w['__engine'].dispatch({ type: 'transmute', a, b });
          return r.ok ? (r.data as any)?.found ?? null : null;
        }, [viaDispatch.ids[i]!, viaDispatch.ids[j]!]);
        if (got) fired.push([viaDispatch.ids[i]!, viaDispatch.ids[j]!]);
      }
    }
    hits = fired;
    check(fired.length >= 6, 'several chains fire from stones actually held',
      `${fired.length} of ${viaDispatch.pairs} pairs produced a chain (was 3 before A.71)`);
  }

  // ═══ 1 + 2. THE READING ══════════════════════════════════════════════════
  console.log('\n1 — the bench reads the PAIR');
  await tab(page, 'refinery');
  await page.waitForTimeout(800);

  const pick = async (slot: 'A' | 'B', id: string): Promise<void> => {
    await dismiss(page);
    await page.locator(`[aria-label="Refinery slot ${slot}"]`).first().click();
    await page.waitForTimeout(250);
    await page.locator(`[role="option"]:has-text("${id}")`).first().click();
    await page.waitForTimeout(350);
  };
  const nameOf = async (id: string): Promise<string> => page.evaluate(async ([m]) => {
    const mm = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    return mm.materialDef(m!).name as string;
  }, [id]);

  const [ra, rb] = hits[0] ?? ['', ''];
  const an = await nameOf(ra); const bn = await nameOf(rb);
  await pick('A', an); await pick('B', bn);
  const good = await txt(page, '[data-testid="bench-reading"]');
  const goodRead = await page.locator('[data-testid="bench-reading"]').first().getAttribute('data-read');
  check(goodRead === 'reacts' || goodRead === 'known',
    'two stones that DO react are named as such before anything is spent',
    `${an} + ${bn} → "${good.slice(0, 80)}"`);
  check(/make together|you have run this one/i.test(good),
    'and the line promises what it can back up', good.slice(0, 70));
  await shot(page, '1-reacts');

  console.log('\n2 — and it does NOT promise anything about an unrelated pair');
  // Find a pair the engine says is inert, and check the bench says so.
  const dead = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const f = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const s = w['__engine'].getState();
    const ids = Object.keys(s.materials.stacks).filter((id: string) => f.materialCount(s, id) > 0);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const r = w['__engine'].dispatch({ type: 'transmute', a: ids[i], b: ids[j] });
        if (r.ok && !(r.data as any)?.found) return [ids[i], ids[j]];
      }
    }
    return null;
  });
  if (!dead) {
    check(false, 'an inert pair could be found to test against');
  } else {
    const dn = await nameOf(dead[0]!); const dn2 = await nameOf(dead[1]!);
    await pick('A', dn); await pick('B', dn2);
    const bad = await txt(page, '[data-testid="bench-reading"]');
    const badRead = await page.locator('[data-testid="bench-reading"]').first().getAttribute('data-read');
    check(badRead === 'inert', 'an unrelated pair is called slag BEFORE you spend it',
      `${dn} + ${dn2} → "${bad.slice(0, 80)}"`);
    check(!/want something/i.test(bad),
      'and the misleading "both want something" line is gone', bad.slice(0, 60));
    await shot(page, '2-inert');
  }

  // ═══ 4. AND THEY FIRE ════════════════════════════════════════════════════
  console.log('\n4 — and the reading is right: they fire');
  const ran = await page.evaluate(async (pairs) => {
    const w = window as unknown as Record<string, any>;
    const mm = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const out: string[] = [];
    for (const [a, b] of pairs as Array<[string, string]>) {
      const r = w['__engine'].dispatch({ type: 'transmute', a, b });
      const d = r.data as any;
      if (r.ok && d?.found) out.push(`${mm.materialDef(a).name} + ${mm.materialDef(b).name} → ${mm.materialDef(d.out).name}`);
    }
    return out;
  }, hits.slice(0, 8));
  check(ran.length >= 5, 'a shallow player can find and fire several reactions',
    `${ran.length} fired`);
  for (const line of ran) console.log(`        ${line}`);
  await page.waitForTimeout(400);
  const known = await txt(page, '[data-testid="bench-reading"]');
  void known;
  await shot(page, '3-found', true);

  console.log('\n5 — 380px');
  const over = await page.evaluate(() => {
    const d = document.documentElement;
    return { sw: d.scrollWidth, cw: d.clientWidth };
  });
  check(over.sw <= over.cw + 1, 'no horizontal overflow at 380px', `${over.sw} vs ${over.cw}`);

  await browser.close();
  console.log(`\n${problems.length === 0 ? 'ALL PASS' : `${problems.length} PROBLEM(S)`}`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
