/**
 * LEVELS, SYNERGIES AND INSTABILITY, DRIVEN IN THE REAL GAME.
 *
 *  1  A MODIFIER LEVELS FROM USE and its effect visibly grows.
 *  2  A SYNERGY AWAKENS from an arrangement — shown discovered, and the hint
 *     that pointed at it named neither half nor the result.
 *  3  INSTABILITY RISES as you stack, and a stabiliser brings it back down —
 *     without buying any power back.
 *  4  A MISFIRE HAPPENS at high instability, and takes nothing extra with it.
 *  5  380px, 0 overflow.
 *
 *   npx tsx scripts/verify-tool-depth.ts [port] [outDir]
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
  await page.screenshot({ path: `${OUT}/dep-${name}.png` });
  shots.push(`${OUT}/dep-${name}.png`);
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

  await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMining' + '.ts');
    const ta = await import(/* @vite-ignore */ '/src/engine/systems/toolAbilities' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const s = w['__engine'].getState();
    for (const id of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      s.depthRecords[id] = 60;
    }
    for (const shell of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      for (const m of mats.materialsOfShell(shell)) forge.addMaterial(s, m.id, 60, 400);
    }
    s.casting.tool = cp.PART_TYPES.map((t: string, i: number) => ({
      ...fp.makePart(t, 'bonechalk', 60), id: i + 1,
    }));
    s.casting.wear = 0;
    s.casting.xp = tm.xpForLevel(320);   // a deep, well-used tool: room for a real build
    // SLOTS MATTER TO THIS DRIVER. The first run levelled to 120 (~25 slots) and
    // then piled 44 slots of modifiers on, so most of them — INCLUDING the
    // stabiliser under test — went dormant for lack of room and the stabiliser
    // check read "16% -> 16%". The overflow rule was working; the fixture was not.
    s.casting.mods = [];
    s.casting.knownMods = [];
    s.casting.knownSynergies = [];
    if (s.casting.hand) s.casting.hand.fits = [];
    ta.syncToolAbilities(s, { emit() {}, dirty() {} });
  });
  await page.waitForTimeout(400);
  await tab(page, 'casting');
  await dismiss(page);

  // ═══ 1. A MODIFIER LEVELS FROM USE ══════════════════════════════════════
  console.log('\n1 — a modifier grows into what it does');
  const lvl = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const tmods = await import(/* @vite-ignore */ '/src/engine/systems/toolMods' + '.ts');
    const s = w['__engine'].getState();
    s.casting.mods = [{ id: 'longarm', n: 1, xp: 0 }];
    s.casting.knownMods = ['longarm'];
    const at1 = { level: tmods.modProgress(s.casting.mods[0]).level, cells: tmods.modCache(s, 0).cells };
    // Mine it up. Real cells, through the real gain path.
    s.face.cells = s.face.cells.map(() => 8);
    tmods.gainModXp(s, { emit() {}, dirty() {} }, 100000);
    const at5 = { level: tmods.modProgress(s.casting.mods[0]).level, cells: tmods.modCache(s, 0).cells };
    return { at1, at5 };
  });
  await page.waitForTimeout(500);
  check(lvl.at1.level === 1 && lvl.at5.level > lvl.at1.level,
    'work levels it up', `${lvl.at1.level} → ${lvl.at5.level}`);
  check(lvl.at5.cells > lvl.at1.cells,
    'and the EFFECT grows with the level', `+${lvl.at1.cells} → +${lvl.at5.cells} reach`);
  const lvlText = await txt(page, '[data-testid="mod-level-text-longarm"]');
  check(lvlText.length > 0, 'the tool shows the level and the progress', lvlText);
  const nameText = await txt(page, '[data-testid="mod-name-longarm"]');
  check(/\b(I|II|III|IV|V)\b/.test(nameText), 'and wears it on its name', nameText);
  await shot(page, '1-level', '[data-testid="mod-bench"]');

  // ═══ 2. A SYNERGY AWAKENS ═══════════════════════════════════════════════
  console.log('\n2 — a synergy found by arranging, not from a list');
  const half = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const cm = await import(/* @vite-ignore */ '/src/engine/content/toolMods' + '.ts');
    const tmods = await import(/* @vite-ignore */ '/src/engine/systems/toolMods' + '.ts');
    const s = w['__engine'].getState();
    const syn = cm.SYNERGY_BY_ID.get('stormbreaker');
    // ONE half only, at level.
    s.casting.mods = [{ id: syn.from[0], n: 1, xp: cm.modXpForLevel(syn.minLevel) }];
    s.casting.knownMods = [syn.from[0], syn.from[1]];
    return {
      hints: tmods.synergyHints(s),
      awake: tmods.modCache(s, 1).awake,
      synName: syn.name,
      otherName: cm.MOD_BY_ID.get(syn.from[1]).name,
      thisName: cm.MOD_BY_ID.get(syn.from[0]).name,
    };
  });
  await page.waitForTimeout(500);
  check(half.awake.length === 0, 'half of it wakes nothing');
  const hintText = await txt(page, '[data-testid="synergy-hint"]');
  check(hintText.length > 0, 'but the tool says something on it is reaching', hintText);
  const lower = hintText.toLowerCase();
  check(
    !lower.includes(half.synName.toLowerCase())
    && !lower.includes(half.otherName.toLowerCase())
    && !lower.includes(half.thisName.toLowerCase()),
    'and names neither half nor the result (pillar 5)',
  );
  await shot(page, '2-reaching', '[data-testid="synergies"]');

  const woke = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const cm = await import(/* @vite-ignore */ '/src/engine/content/toolMods' + '.ts');
    const tmods = await import(/* @vite-ignore */ '/src/engine/systems/toolMods' + '.ts');
    const s = w['__engine'].getState();
    const syn = cm.SYNERGY_BY_ID.get('stormbreaker');
    const usedBefore = tmods.modSlotsUsed(s);
    const seen: string[] = [];
    s.casting.mods.push({ id: syn.from[1], n: 1, xp: cm.modXpForLevel(syn.minLevel) });
    tmods.noteSynergies(s, { emit(e: any) { if (e.type === 'synergyAwoke') seen.push(e.name); }, dirty() {} });
    const cache = tmods.modCache(s, 1);
    return {
      awake: cache.awake,
      announced: seen,
      known: s.casting.knownSynergies,
      // The synergy itself costs no slots — only its two parents did.
      slotsFromParents: tmods.modSlotsUsed(s) - usedBefore,
      parentCost: cm.MOD_BY_ID.get(syn.from[1]).cost,
      refire: cache.refire,
    };
  });
  await page.waitForTimeout(500);
  check(woke.awake.includes('stormbreaker'), 'putting the other half on wakes it', woke.awake.join(','));
  check(woke.announced.length === 1, 'it announces itself once, as a discovery', woke.announced.join(','));
  check(woke.known.includes('stormbreaker'), 'and is recorded');
  check(woke.slotsFromParents === woke.parentCost,
    'and costs no slots of its own — you arranged it, you did not buy it',
    `${woke.slotsFromParents} slots, all of them the parent`);
  check(woke.refire > 0, 'and it actually does something new', `refire ${woke.refire}`);
  const synText = await txt(page, '[data-testid="synergy-stormbreaker"]');
  check(synText.toLowerCase().includes('stormbreaker'), 'the tool names what it turned into', synText.slice(0, 70));
  await shot(page, '3-synergy', '[data-testid="synergies"]');

  // ═══ 3. INSTABILITY ═════════════════════════════════════════════════════
  console.log('\n3 — instability rises as you stack, and a stabiliser answers it');
  const steady0 = await txt(page, '[data-testid="instability-n"]');
  const piled = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const cm = await import(/* @vite-ignore */ '/src/engine/content/toolMods' + '.ts');
    const tmods = await import(/* @vite-ignore */ '/src/engine/systems/toolMods' + '.ts');
    const s = w['__engine'].getState();
    s.casting.mods = ['farreach', 'voidbite', 'widerblast2', 'overgrade', 'firstform']
      .map((id) => ({ id, n: 2, xp: cm.modXpForLevel(cm.MOD_LEVEL_MAX) }));
    s.casting.knownMods = cm.TOOL_MODS.map((m: any) => m.id);
    s.casting.hand.fits = [{ id: 'slagburst', grade: 7, ch: 0, fired: 300 }];
    return tmods.toolInstability(s);
  });
  await page.waitForTimeout(500);
  check(piled.misfire > 0, 'stacking the powerful things makes it unreliable',
    `${Math.round(piled.net)} net, ${Math.round(piled.misfire * 100)}% misfire`);
  const fromText = await txt(page, '[data-testid="instability-from"]');
  check(fromText.length > 0, 'and it says what is driving it', fromText.slice(0, 80));
  await shot(page, '4-unstable', '[data-testid="instability"]');

  const calmed = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const cm = await import(/* @vite-ignore */ '/src/engine/content/toolMods' + '.ts');
    const tmods = await import(/* @vite-ignore */ '/src/engine/systems/toolMods' + '.ts');
    const s = w['__engine'].getState();
    const reachBefore = tmods.modCache(s, 1).cells;
    s.casting.mods.push({ id: 'theanchor', n: 2, xp: cm.modXpForLevel(cm.MOD_LEVEL_MAX) });
    return { inst: tmods.toolInstability(s), reachBefore, reachAfter: tmods.modCache(s, 1).cells };
  });
  await page.waitForTimeout(500);
  check(calmed.inst.misfire < piled.misfire, 'a stabiliser brings it down',
    `${Math.round(piled.misfire * 100)}% → ${Math.round(calmed.inst.misfire * 100)}%`);
  check(Math.abs(calmed.reachAfter - calmed.reachBefore) < 1e-6,
    'and buys NO power back — it is reliability only',
    `reach ${calmed.reachBefore.toFixed(2)} → ${calmed.reachAfter.toFixed(2)}`);
  const steadyText = await txt(page, '[data-testid="instability-n"]');
  check(steadyText !== steady0, 'the meter moved on screen', `${steady0} → ${steadyText}`);
  await shot(page, '5-stabilised', '[data-testid="instability"]');

  // ═══ 4. A MISFIRE, AND IT TAKES NOTHING EXTRA ═══════════════════════════
  console.log('\n4 — a misfire, and what it costs');
  const mis = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const cm = await import(/* @vite-ignore */ '/src/engine/content/toolMods' + '.ts');
    const engine = w['__engine'];
    const s = engine.getState();
    // Maximum instability, no stabilisers, so the roll fires often.
    s.casting.mods = ['farreach', 'voidbite', 'widerblast2', 'overgrade', 'firstform', 'echoform']
      .map((id) => ({ id, n: 2, xp: cm.modXpForLevel(cm.MOD_LEVEL_MAX) }));
    s.casting.hand.fits = [{ id: 'slagburst', grade: 7, ch: 999, fired: 300 }];

    let fizzles = 0, wilds = 0, clean = 0;
    let tookOnMisfire = 0, tookOnClean = 0;
    const off = engine.subscribe ? null : null;
    void off;
    for (let i = 0; i < 400; i++) {
      s.face.cells = s.face.cells.map(() => 8);
      const before = s.face.cells.reduce((a: number, b: number) => a + b, 0);
      s.casting.hand.fits[0].ch = 999;
      s.casting.hand.lastCell = 14;
      let kind = '';
      const r = engine.dispatch({ type: 'fireAbility', index: -1, slot: 0, cell: 14 });
      // Read the feed for what just happened.
      const feed = engine.getState().feed ?? [];
      for (let k = feed.length - 1; k >= Math.max(0, feed.length - 6); k--) {
        if (feed[k]?.event?.type === 'misfire') { kind = feed[k].event.kind; break; }
      }
      const after = engine.getState().face.cells.reduce((a: number, b: number) => a + b, 0);
      const took = before - after;
      if (kind === 'fizzle') { fizzles++; tookOnMisfire += took; }
      else if (kind === 'wild') { wilds++; tookOnMisfire += took; }
      else if (r.ok) { clean++; tookOnClean += took; }
    }
    return {
      fizzles, wilds, clean,
      perMisfire: (fizzles + wilds) > 0 ? tookOnMisfire / (fizzles + wilds) : 0,
      perClean: clean > 0 ? tookOnClean / clean : 0,
    };
  });
  check(mis.fizzles + mis.wilds > 0, 'high instability actually misfires',
    `${mis.fizzles} fizzled, ${mis.wilds} went wild, ${mis.clean} landed`);
  check(mis.fizzles > 0, 'a fizzle is one of the ways it goes wrong');
  check(mis.perMisfire <= mis.perClean + 1e-6,
    'and a misfire NEVER takes more than a clean firing (pillar 2)',
    `${mis.perMisfire.toFixed(1)} vs ${mis.perClean.toFixed(1)} charge`);

  // PILLAR 1 — the swing itself is untouched by any of it.
  const swing = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const engine = w['__engine'];
    const s = engine.getState();
    // Object method, not a named const arrow: tsx's keepNames compiles the
    // latter into a __name() call that does not exist in the page.
    const go = {
      run(): number {
        s.face.cells = s.face.cells.map(() => 8);
        s.face.ore = new Array(s.face.cells.length).fill('');
        const before = s.stats.fieldChargeHarvested.toNumber();
        engine.dispatch({ type: 'chip', cell: 14 });
        return engine.getState().stats.fieldChargeHarvested.toNumber() - before;
      },
    };
    const unstable = go.run();
    s.casting.mods = [];
    s.casting.hand.fits = [];
    const bare = go.run();
    return { unstable, bare };
  });
  check(swing.unstable > 0 && swing.bare > 0,
    'and the tool still mines, unstable or not (pillar 1)',
    `${swing.unstable.toFixed(1)} / ${swing.bare.toFixed(1)} charge a swing`);
  await shot(page, '6-misfire');

  // ═══ 5. THE FRAME ═══════════════════════════════════════════════════════
  console.log('\nthe frame');
  for (const t of ['casting', 'dig']) {
    await tab(page, t);
    await dismiss(page);
    await page.waitForTimeout(300);
    const over = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    check(over === 0, `no horizontal overflow at ${W}px — ${t}`, `${over}px`);
  }

  console.log(`\nshots: ${shots.length}`);
  for (const s of shots) console.log(`  ${s}`);
  await browser.close();

  if (problems.length > 0) {
    console.log(`\n${problems.length} PROBLEM(S):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  console.log('\nall checks passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
