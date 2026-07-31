/**
 * THE A.70 PLAYTEST FIXES, DRIVEN IN THE REAL GAME.
 *
 *   2  modifier levelling is a long investment, not a five-minute one
 *   3  instability explains itself without insider vocabulary
 *   4  durability is real again — no build is truly unbreakable
 *   5  no hard tool-tier gate: you can always descend, it just costs more
 *   6  the modifier menu says what each modifier DOES
 *   7  the Workbench is gone from the Forge
 *   8  the alloy bench is in the Drills room
 *
 *   npx tsx scripts/verify-playtest-a70.ts [port] [outDir]
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
  await page.screenshot({ path: `${OUT}/a70-${name}.png`, fullPage: full });
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

  // ═══ 2. MODIFIER XP ══════════════════════════════════════════════════════
  console.log('\n2 — levelling a modifier is a long investment');
  const xp = await page.evaluate(async () => {
    const m = await import(/* @vite-ignore */ '/src/engine/content/toolMods' + '.ts');
    // Measured in `scratch/xp.mts`: an active player at three clicks a second
    // banks this many cells an hour. The old curve maxed at 9,504 of them.
    const PER_HOUR = 25486;
    const rows = [2, 3, 4, 5].map((L) => ({ L, cells: m.modXpForLevel(L), hours: m.modXpForLevel(L) / PER_HOUR }));
    return { rows, max: m.MOD_LEVEL_MAX, base: m.MOD_XP_BASE, exp: m.MOD_XP_EXP };
  });
  const top = xp.rows[xp.rows.length - 1]!;
  const first = xp.rows[0]!;
  check(top.hours > 20, 'maxing one takes real playtime',
    `L5 = ${top.cells.toLocaleString()} cells = ${top.hours.toFixed(1)}h (was 9,504 = 0.4h)`);
  check(first.hours < 1, 'and the FIRST level still lands inside a session',
    `L2 = ${first.cells.toLocaleString()} cells = ${(first.hours * 60).toFixed(0)} min`);
  console.log(`        ${xp.rows.map((r) => `L${r.L} ${r.hours.toFixed(1)}h`).join('  ')}`);

  // ═══ 4. DURABILITY ═══════════════════════════════════════════════════════
  console.log('\n4 — durability is real again');
  const dur = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMining' + '.ts');
    const md = await import(/* @vite-ignore */ '/src/engine/systems/toolMods' + '.ts');
    const se = await import(/* @vite-ignore */ '/src/engine/systems/toolSeason' + '.ts');
    const s = w['__engine'].getState();
    for (const sh of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder']) s.depthRecords[sh] = 200;
    s.casting.tool = cp.PART_TYPES.map((t: string, i: number) => ({ id: i, ...fp.makePart(t, 'marl', 70) }));
    // The build the report names: every endurance modifier, on a veteran tool.
    s.casting.knownMods = ['unbreaking', 'selfmending'];
    s.casting.mods = [{ id: 'unbreaking', n: 2 }, { id: 'selfmending', n: 3 }];
    s.casting.xp = 200_000; s.casting.repairs = 60;
    const tool = fp.assembleTool(s.casting.tool);
    const pool = tm.poolOf(tool);
    const per = tm.wearPerUse(tool, tm.toolLevel(s), md.modCache(s), se.wearResist(s));
    const h = {
      mend(lastUsed: number): number {
        s.casting.wear = pool * 0.5;
        s.stats.playTimeSec = 1000;
        s.casting.lastUsedAt = lastUsed;
        const before = s.casting.wear;
        md.tickToolMods(s, 1);
        return before - s.casting.wear;
      },
    };
    return {
      uses: Math.round(pool / per),
      mendMining: h.mend(1000),
      mendIdle: h.mend(900),
      wearPerSec: per * 3,
      cap: tm.ENDURANCE_CAP,
    };
  });
  check(dur.mendMining <= 1e-9,
    'self-mending does NOT run while the tool is being worked',
    `${dur.mendMining.toFixed(4)}/s mid-swing vs ${dur.mendIdle.toFixed(3)}/s once put down`);
  check(dur.mendIdle > 0, 'but it still puts itself right once you stop', `${dur.mendIdle.toFixed(3)}/s`);
  const minutes = dur.uses / 3 / 60;
  check(minutes < 24 * 60,
    'so even the stacked build wears out under hard use',
    `${dur.uses.toLocaleString()} swings = ${(minutes / 60).toFixed(1)}h of continuous mining`);
  check(dur.cap > 1 && dur.cap < 100, 'and the endurance stack is capped', `x${dur.cap} over a bare build`);

  // ═══ 5. NO HARD TOOL GATE ════════════════════════════════════════════════
  console.log('\n5 — the wall is a price, not a door');
  const wall = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const f = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMining' + '.ts');
    const s = w['__engine'].getState();
    // Strip the tool entirely and stand under a wall the starter cannot pass.
    s.casting.tool = [];
    s.forge.tools = s.forge.tools.filter((t: any) => t.id === 0);
    s.forge.equipped = 0;
    let d = 1;
    while (d < 400 && f.requiredTier(s, d) <= tm.effectiveToolTier(s)) d++;
    s.depth = d - 1;
    s.currencies['dust'] = s.currencies['dust'].add(1e14);
    const need = f.requiredTier(s, d);
    const before = s.currencies['dust'].toNumber();
    const r = w['__engine'].dispatch({ type: 'descend' });
    return {
      wallDepth: d, need, have: tm.effectiveToolTier(s),
      ok: r.ok, reason: r.reason,
      paid: before - s.currencies['dust'].toNumber(),
      depthNow: s.depth,
    };
  });
  check(wall.ok === true,
    'an under-tooled player can still descend past a hardness wall',
    `depth ${wall.wallDepth} wanted tier ${wall.need}, player had ${wall.have} — ${wall.ok ? 'went down' : wall.reason}`);
  check(wall.depthNow === wall.wallDepth, 'and actually arrives', `now at ${wall.depthNow}`);
  check(wall.paid > 0, 'having paid a real surcharge for it', `${Math.round(wall.paid).toLocaleString()} dust`);

  // ═══ 7 + 8. THE ROOMS ════════════════════════════════════════════════════
  console.log('\n7 — the Workbench is gone from the Forge');
  await tab(page, 'forge');
  await page.waitForTimeout(700);
  const forge = await page.evaluate(() => document.body.innerText);
  const hit = (re: RegExp): string => (forge.match(new RegExp('[^\n]*' + re.source + '[^\n]*', 'i')) ?? [''])[0].slice(0, 80);
  check(!/Carving|Cutting/i.test(forge), 'no Carving / Cutting launchers in the Forge', hit(/Carving|Cutting/));
  check(!/The workbench/i.test(forge), 'and no workbench panel', hit(/The workbench/));
  await shot(page, '7-forge');

  console.log('\n8 — the alloy bench lives with the drills');
  check(!/alloy/i.test(forge), 'the Forge no longer carries the alloy bench', hit(/alloy/));
  await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    s.kiln.built = true; s.drills.bayBuilt = true; s.maxDepthRecord = 120;
  });
  await page.waitForTimeout(400);
  await tab(page, 'drills');
  await page.waitForTimeout(800);
  const drills = await page.evaluate(() => document.body.innerText);
  check(/alloy/i.test(drills), 'and the Drills room does', (drills.match(/[^\n]*[Aa]lloy[^\n]*/) ?? [''])[0].slice(0, 70));
  await shot(page, '8-drills');

  // ═══ 6 + 3. THE CASTING SCREEN ═══════════════════════════════════════════
  await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const s = w['__engine'].getState();
    s.casting.tool = cp.PART_TYPES.map((t: string, i: number) => ({ id: i, ...fp.makePart(t, 'marl', 70) }));
    /*
     * A FULLY PACKED LEVEL-5 TOOL, so instability is genuinely HOT and the
     * misfire sentence has to render — the quiet branch is the easy one and the
     * report was about the other. Simply seating "a lot" does not do it:
     * `instabilityFloor` scales with SLOT CAPACITY, so a bigger tool is allowed
     * to carry more, and the number only bites when the capacity is actually
     * spent. Measured: every slot filled at level 5 reaches the misfire cap.
     */
    const mods = await import(/* @vite-ignore */ '/src/engine/content/toolMods' + '.ts');
    const md = await import(/* @vite-ignore */ '/src/engine/systems/toolMods' + '.ts');
    for (const sh of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      s.depthRecords[sh] = 250;
    }
    s.casting.xp = 900_000;
    s.casting.knownMods = mods.TOOL_MODS.map((m: any) => m.id);
    const slots = md.modSlotsTotal(s);
    const pick = [...mods.TOOL_MODS].sort(
      (x: any, y: any) => (y.cost - (y.fx.stabilize ?? 0)) - (x.cost - (x.fx.stabilize ?? 0)),
    );
    const seated: any[] = [];
    let used = 0;
    for (const m of pick) {
      const n = Math.min(m.maxStacks, Math.floor((slots - used) / m.cost));
      if (n > 0) { seated.push({ id: m.id, n, xp: 900000 }); used += n * m.cost; }
    }
    s.casting.mods = seated;
  });
  await page.waitForTimeout(500);
  await tab(page, 'casting');
  await page.waitForTimeout(800);

  console.log('\n6 — the modifier menu says what each one does');
  await tapp(page, '[data-testid="drawer-mods"] summary');
  const lib = await txt(page, '[data-testid="mod-library-list"]');
  check(await page.locator('[data-testid="lib-fx-longarm"]').count() === 1,
    'every known modifier carries an effect line');
  const longarm = await txt(page, '[data-testid="lib-fx-longarm"]');
  check(/\d/.test(longarm), 'and it is a NUMBER, not a name', longarm);
  const named = await page.locator('[data-testid^="lib-fx-"]').count();
  const rows = await page.locator('[data-testid^="lib-"]').count();
  check(named > 0 && named * 2 === rows,
    'and every row has one, not just the first', `${named} effect lines across ${named} modifiers`);
  void lib;
  await shot(page, '6-modifiers');

  console.log('\n3 — instability in plain English');
  await tapp(page, '[data-testid="drawer-tool"] summary');
  const SCOPE = '[data-testid="drawer-tool"] ';
  const what = await txt(page, `${SCOPE}[data-testid="instability-what"]`);
  const how = await txt(page, `${SCOPE}[data-testid="instability-how"]`);
  /*
   * WHAT COUNTS AS JARGON, and "The Anchor" is NOT on the list.
   *
   * The old line read "seat The Anchor, grow a SUPPLE or STILLNESS boon, pour
   * EXCELLENT or TRUEBORN parts" — five internal terms in one sentence. The
   * brief asks for the opposite of that, and asks for it precisely: say plainly
   * "use X" with X being something the player can find. A modifier the player
   * has ALREADY DISCOVERED, named with what it is worth, is exactly that X.
   *
   * So the bar is the UNEXPLAINED SHOUTED TERMS — the craft tiers, the growth
   * boon ids, the word "boon" itself — not the in-game proper nouns a player
   * can act on. My first cut of this check had it wrong and flagged the fix.
   */
  const JARGON = /SUPPLE|STILLNESS|TRUEBORN|EXCELLENT|boons?/;
  check(what.length > 0 && !JARGON.test(what), 'the "what it does" line has no insider vocabulary',
    what.slice(0, 100));
  check(/goes off in the wrong place/i.test(what),
    'and says plainly what a misfire is, in the HOT case', what.slice(0, 110));
  check(how.length > 0 && !JARGON.test(how), 'and the "how to fix it" line has none either',
    how.replace(/\n/g, ' ').slice(0, 130));
  check(/Take something off/i.test(how), 'and leads with an action anyone can do today');
  await shot(page, '3-instability');

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
