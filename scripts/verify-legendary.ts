/**
 * LEGENDARY PARTS, DRIVEN IN THE REAL GAME.
 *
 *  1  NOTHING IS SHOWN AS A LIST OF LOCKS — an unearned legend shows a GOAL and
 *     withholds its name (pillar 5).
 *  2  IT ARRIVES BY DOING. Stand at Loam 120 and the one-second beat hands you
 *     a part nobody poured, named, at pristine, masterwork.
 *  3  IT IS MEANINGFULLY BETTER, measured against the best part in the same
 *     stone on the LIVE tool — and still inside every clamp.
 *  4  IT BUILDS INTO THE ORDINARY SEVEN — seat it, assemble, see it on the tool.
 *  5  IT SURVIVES THE SHELL — re-pour it in a deeper stone, at a real cost.
 *  6  380px, 0 overflow.
 *
 *   npx tsx scripts/verify-legendary.ts [port] [outDir]
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
async function tapp(page: Page, sel: string): Promise<void> {
  await dismiss(page);
  await page.locator(sel).first().click();
  await page.waitForTimeout(320);
}
async function shot(page: Page, name: string, full = false): Promise<void> {
  await dismiss(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/leg-${name}.png`, fullPage: full });
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

  // A forge, a stocked Hold, and NOT yet deep enough for anything.
  const stone = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const s = w['__engine'].getState();
    s.depthRecords['loam'] = 40;
    const pick = mats.materialsOfShell('loam')[0].id as string;
    forge.addMaterial(s, pick, mats.BAND_RANGES['exalted'][0], 400);
    return pick;
  });
  await page.waitForTimeout(400);
  await tab(page, 'casting');
  await page.waitForTimeout(500);

  // ═══ 1. A GOAL, NOT A LOCK ═══════════════════════════════════════════════
  console.log('\n1 — an unearned legend is a goal, not a padlock');
  await tapp(page, '[data-testid="drawer-legends"] summary');
  const head = await txt(page, '[data-testid="legend-firstbite"]');
  check(await page.locator('[data-testid="legends"]').count() === 1, 'the legends drawer opens');
  check(/Loam 120/.test(head), 'and an unearned one names the DEED', head.slice(0, 80));
  check(!/First Bite/.test(head), 'and withholds the name until you have done it');
  await shot(page, '1-unearned');

  // ═══ 2. IT ARRIVES BY DOING ══════════════════════════════════════════════
  console.log('\n2 — stand at Loam 120 and it arrives');
  const before = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    return w['__engine'].getState().casting.rack.length as number;
  });
  await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    // The DEED, done — not a grant call. The one-second beat is what has to see it.
    w['__engine'].getState().depthRecords['loam'] = 120;
  });
  await page.waitForTimeout(2500);

  const got = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    const p = s.casting.rack.find((r: any) => r.legend === 'firstbite');
    return p
      ? { n: s.casting.rack.length, mat: p.materialId, purity: p.purity, craft: p.craft, work: p.work, id: p.id }
      : null;
  });
  check(got !== null, 'the beat handed over a part nobody poured', got ? `rack ${before} → ${got.n}` : 'nothing arrived');
  check(got?.purity === 110, 'poured at PRISTINE — above anything a drop rolls', `purity ${got?.purity}`);
  check(got?.craft === 'masterwork', 'and masterwork, with a perk you do not get to choose', `${got?.craft}/${got?.work}`);

  await page.waitForTimeout(400);
  const earned = await txt(page, '[data-testid="legend-firstbite"]');
  check(/First Bite/.test(earned), 'and NOW it has a name', earned.slice(0, 70));
  await shot(page, '2-earned');

  // ═══ 3. MEANINGFULLY BETTER, AND STILL INSIDE THE CLAMPS ═════════════════
  console.log('\n3 — better than the best pour, and still capped');
  const cmp = await page.evaluate(async ([id, legId]) => {
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMining' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    // The LUCKIEST castable head — exalted stock that also rolled masterwork.
    const best = { type: 'head', materialId: id, purity: 100, craft: 'masterwork', work: 'flawless' };
    const leg = { ...best, purity: fp.PURITY_CEILING, legend: legId };
    // OBJECT-METHOD SHORTHAND, not a named const arrow: tsx's `keepNames`
    // compiles a named arrow to a `__name()` call that does not exist in-page.
    const h = {
      all(l: boolean): any[] {
        return cp.PART_TYPES.map((t: string) => ({
          type: t, materialId: id, purity: l ? fp.PURITY_CEILING : 100,
          ...(l ? { craft: 'masterwork', work: 'flawless', legend: legId } : {}),
        }));
      },
    };
    const e = tm.effectOf(fp.assembleTool(h.all(true)), false);
    return {
      best: fp.derivePart(best).magnitude,
      leg: fp.derivePart(leg).magnitude,
      cells: e.cells, splash: e.splash, oreRate: e.oreRate,
      capCells: tm.MAX_EXTRA_CELLS, capOre: tm.ORE_RATE_CAP,
    };
  }, [stone, 'firstbite']);
  const gain = cmp.leg / cmp.best;
  check(gain >= 1.25, 'beats the LUCKIEST castable part in the same stone',
    `${cmp.best.toFixed(2)} → ${cmp.leg.toFixed(2)} = ${gain.toFixed(2)}x`);
  check(cmp.cells <= cmp.capCells && cmp.splash <= 1 && cmp.oreRate <= cmp.capOre,
    'and a FULLY legendary tool sits inside every clamp',
    `reach ${cmp.cells}/${cmp.capCells}, splash ${cmp.splash.toFixed(3)}/1, ore ${cmp.oreRate.toFixed(2)}/${cmp.capOre}`);

  // ═══ 4. IT BUILDS INTO THE ORDINARY SEVEN ════════════════════════════════
  console.log('\n4 — it slots into the normal seven-part tool');
  await page.evaluate(async ([id]) => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const s = w['__engine'].getState();
    // The other six, poured plainly — the legend has to live among ordinary parts.
    for (const t of cp.PART_TYPES) {
      if (t === 'head') continue;
      s.casting.rack.push({ id: s.casting.nextId++, ...fp.makePart(t, id!, 90) });
    }
  }, [stone]);
  await page.waitForTimeout(400);

  const built = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    for (const p of s.casting.rack) w['__engine'].dispatch({ type: 'benchPlace', partId: p.id });
    const r = w['__engine'].dispatch({ type: 'buildTool' });
    return { ok: r.ok, reason: r.reason, head: s.casting.tool.find((p: any) => p.type === 'head')?.legend };
  });
  check(built.ok === true, 'a tool assembles with a legend in it', built.reason ?? '');
  check(built.head === 'firstbite', 'and the head IS the legend', String(built.head));

  await page.waitForTimeout(600);
  const onDiagram = await page.locator('[data-testid="diagram-legend-head"]').first()
    .getAttribute('title').catch(() => null);
  check(onDiagram === 'The First Bite', 'and the tool diagram marks it as the legend', String(onDiagram));
  await shot(page, '3-on-the-tool');

  // ═══ 5. IT SURVIVES THE SHELL ════════════════════════════════════════════
  console.log('\n5 — re-pour it deeper, at a real cost');
  const deep = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const s = w['__engine'].getState();
    const pick = mats.materialsOfShell('ferrite')[0].id as string;
    forge.addMaterial(s, pick, mats.BAND_RANGES['good'][0], 300);
    return { id: pick, have: forge.materialCount(s, pick) as number };
  });
  await page.waitForTimeout(500);

  await tapp(page, '[data-testid="legend-repour-firstbite"]');
  const offered = await page.locator(`[data-testid="legend-stone-${deep.id}"]`).count();
  check(offered === 1, 'the re-pour offers a deeper stone you actually hold', deep.id);
  await tapp(page, `[data-testid="legend-stone-${deep.id}"]`);

  const after = await page.evaluate(async ([id]) => {
    const w = window as unknown as Record<string, any>;
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cast = await import(/* @vite-ignore */ '/src/engine/systems/casting' + '.ts');
    const s = w['__engine'].getState();
    const p = s.casting.tool.find((r: any) => r.legend === 'firstbite');
    return {
      mat: p?.materialId, purity: p?.purity,
      have: forge.materialCount(s, id!) as number,
      copies: [...s.casting.tool, ...s.casting.rack].filter((r: any) => r.legend === 'firstbite').length,
      mag: p ? fp.derivePart(p).magnitude : 0,
      tool: fp.assembleTool(s.casting.tool).stats.bite,
      key: cast.currentTool(s)?.parts.find((r: any) => r.type === 'head')?.materialId,
    };
  }, [deep.id]);

  check(after.mat === deep.id, 'the legend is now a deeper stone', `${stone} → ${after.mat}`);
  check(after.have < deep.have, 'and it COST real stock', `${deep.have} → ${after.have}`);
  check(after.copies === 1, 'and it is still ONE part, not a second copy', `${after.copies}`);
  check(after.purity === 110, 'still pristine after the pour', `${after.purity}`);
  // THE MEMO IS THE TRAP HERE — `currentTool` is hashed on every Part field, and
  // a re-pour that did not re-key would leave the live tool on the old stone.
  check(after.key === deep.id, 'and the LIVE tool re-derived, not the memo\'s stale copy', String(after.key));
  await shot(page, '4-repoured');

  // ═══ 6. 380px ════════════════════════════════════════════════════════════
  console.log('\n6 — 380px');
  const over = await page.evaluate(() => {
    const d = document.documentElement;
    return { sw: d.scrollWidth, cw: d.clientWidth };
  });
  check(over.sw <= over.cw + 1, 'no horizontal overflow at 380px', `${over.sw} vs ${over.cw}`);
  await shot(page, '5-full', true);

  await browser.close();
  console.log(`\n${problems.length === 0 ? 'ALL PASS' : `${problems.length} PROBLEM(S)`}`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
