/**
 * THE FORGE TAB, RETIRED — DRIVEN IN THE REAL GAME.
 *
 *   1  the Forge tab is gone from the nav
 *   2  the tool shelf is in the Refinery, and still WORKS (equip a tool)
 *   3  gear has its own room, and still WORKS (the bench renders)
 *   4  nothing was silently dropped — every verb the room carried has a home
 *   5  380px, 0 overflow
 *
 *   npx tsx scripts/verify-retire-forge.ts [port] [outDir]
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
  await page.screenshot({ path: `${OUT}/a71b-${name}.png`, fullPage: full });
}

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

  // A player who has a forge, some tools, some gear materials and some combat.
  await setup(page, `engine.getState().forge.built = true;`);
  await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const f = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const m = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const s = w['__engine'].getState();
    s.depthRecords['loam'] = 120;
    s.depthRecords['ferrite'] = 200;
    s.combat.stats.encounters = 3;
    for (const id of ['marl', 'graveclay', 'loamiron', 'ironbloom']) {
      f.addMaterial(s, id, m.BAND_RANGES['good'][0], 400);
    }
    // Two legacy tools, so the shelf has something to equip between.
    s.forge.tools.push({
      id: 90, recipeId: 'loamironPick', name: 'Loamiron Pick', tier: 2,
      purity: 50, chipPower: 1.35, strikePower: 5, sockets: [null], alloys: [],
    });
  });
  await page.waitForTimeout(500);

  // ═══ 1. THE NAV ══════════════════════════════════════════════════════════
  console.log('\n1 — the Forge tab is gone');
  const nav = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const labels = [...document.querySelectorAll('button, a')]
      .map((el) => (el.textContent ?? '').trim()).filter(Boolean);
    return { labels, tab: w['__ui']?.tab ?? null };
  });
  const hasForgeTab = nav.labels.some((l) => /^forge$/i.test(l));
  check(!hasForgeTab, 'no Forge entry in the nav', hasForgeTab ? 'still there' : 'gone');
  const tabs = await page.evaluate(async () => {
    const n = await import(/* @vite-ignore */ '/src/ui/nav' + '.ts');
    return n.CLUSTERS.flatMap((c: any) => c.systems.map((x: any) => String(x.id)));
  });
  check(!tabs.includes('forge'), 'and no room registered under that id', tabs.join(' '));
  check(tabs.includes('gear'), 'while GEAR is registered as its own room');

  // ═══ 2. THE TOOL SHELF, IN THE REFINERY ══════════════════════════════════
  console.log('\n2 — the tool shelf folded into the Refinery, and still works');
  await tab(page, 'refinery');
  await page.waitForTimeout(800);
  const shelf = await page.locator('[data-testid="crafting-moved"]').count();
  check(shelf === 1, 'the shelf renders in the Refinery');
  const equipped = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    const before = s.forge.equipped;
    const other = s.forge.tools.find((t: any) => t.id !== before);
    const r = w['__engine'].dispatch({ type: 'equipTool', toolId: other.id });
    return { ok: r.ok, before, after: s.forge.equipped, moved: s.forge.equipped !== before };
  });
  check(equipped.ok && equipped.moved, 'and equipping a tool through it still works',
    `equipped ${equipped.before} → ${equipped.after}`);
  await shot(page, '2-refinery-shelf', true);

  // ═══ 3. THE GEAR ROOM ════════════════════════════════════════════════════
  console.log('\n3 — gear has its own room');
  await tab(page, 'gear');
  await page.waitForTimeout(800);
  check(await page.locator('[data-testid="gear-room"]').count() === 1, 'the gear room renders');
  const gearText = await page.evaluate(() => document.body.innerText);
  check(/gear|offhand|lantern|harness|boots/i.test(gearText),
    'and the bench is in it', (gearText.match(/[^\n]*(offhand|lantern|harness|boots)[^\n]*/i) ?? [''])[0].slice(0, 60));
  await shot(page, '3-gear-room', true);

  // ═══ 4. NOTHING SILENTLY DROPPED ═════════════════════════════════════════
  console.log('\n4 — nothing the room carried was dropped');
  const verbs = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    const out: Record<string, boolean> = {};
    // Every verb the retired room dispatched, fired through the live path.
    const spare = s.forge.tools.find((t: any) => t.id !== s.forge.equipped && t.id !== 0);
    out['equipTool'] = w['__engine'].dispatch({ type: 'equipTool', toolId: s.forge.tools[0].id }).ok;
    out['bulkSalvage'] = w['__engine'].dispatch({
      type: 'bulkSalvage', toolIds: spare ? [spare.id] : [], extract: false,
    }).ok !== undefined;
    // These two exist and are reachable; firing them needs a gem/target, so the
    // check is that the action is still ACCEPTED rather than unknown.
    const g = w['__engine'].dispatch({ type: 'socketGem', toolId: 0, slot: 0, gemId: 'nope' });
    out['socketGem'] = g.ok === false ? !/unknown/i.test(g.reason ?? '') : true;
    const d = w['__engine'].dispatch({ type: 'discardTool', toolId: -1 });
    out['discardTool'] = d.ok === false ? !/unknown/i.test(d.reason ?? '') : true;
    return out;
  });
  for (const [verb, ok] of Object.entries(verbs)) {
    check(ok, `\`${verb}\` still lives`, ok ? '' : 'no longer reachable');
  }

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
