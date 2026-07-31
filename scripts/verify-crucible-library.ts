/**
 * THE FIVE FIXES, DRIVEN IN THE REAL GAME.
 *
 *  1  ONE CRUCIBLE — stones stack, same-material MERGES, click-to-front.
 *  2  THE MELT IS THE MATERIAL — the tub carries the front stone's own colour
 *     and RECOLOURS when the front changes.
 *  3  THE PICKER IS NOT A 158-SCROLL — search, trait cuts, shell cuts.
 *  4  TRAITS NAME A DIRECTION — so a combination is reasoned, not guessed.
 *  5  THE LIBRARY FILLS BY FORGING — empty at start, a pour teaches it, and
 *     what it taught can be installed on a tool.
 *
 *   npx tsx scripts/verify-crucible-library.ts [port] [outDir]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots';
const W = 380, H = 1600;

const problems: string[] = [];
const shots: string[] = [];
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
  await page.screenshot({ path: `${OUT}/fx-${name}.png`, fullPage: full });
  shots.push(`${OUT}/fx-${name}.png`);
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

  /** A fresh casting floor with three shells' stone in the Hold. */
  const stones = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const s = w['__engine'].getState();
    for (const id of ['loam', 'ferrite', 'verdance']) s.depthRecords[id] = 60;
    for (const sh of ['loam', 'ferrite', 'verdance']) {
      for (const m of mats.materialsOfShell(sh)) forge.addMaterial(s, m.id, 60, 200);
    }
    s.casting.tool = []; s.casting.rack = []; s.casting.bench = {};
    s.casting.knownMods = []; s.casting.modFrom = {}; s.casting.mods = [];
    s.casting.crucible.queue = [];
    const M = { one(sh: string, i = 0) { return mats.materialsOfShell(sh)[i].id as string; } };
    return { a: M.one('loam', 0), b: M.one('loam', 2), c: M.one('ferrite', 0) };
  });
  await page.waitForTimeout(400);
  await tab(page, 'casting');
  await dismiss(page);
  await page.waitForTimeout(500);

  // ═══ 1. ONE CRUCIBLE — STACK, MERGE, CLICK-TO-FRONT ══════════════════════
  console.log('\n1 — one crucible: stones stack, the same stone merges, tap brings it forward');

  const melt = async (id: string, units: number): Promise<void> => {
    await page.evaluate(
      ([m, u]) => (window as any)['__engine'].dispatch({ type: 'chargeCrucible', materialId: m, units: u }),
      [id, units] as [string, number],
    );
    await page.waitForTimeout(250);
  };

  await melt(stones.a, 3);
  check(await page.locator('[data-testid^="crucible-stone-"]').count() === 1,
    'one stone in, one stone shown');
  const oneChip = await txt(page, '[data-testid="crucible-chip-0"]');

  // THE MERGE: more of the SAME stone must widen it, never add a second.
  await melt(stones.a, 2);
  const afterMerge = await page.locator('[data-testid^="crucible-stone-"]').count();
  const mergedChip = await txt(page, '[data-testid="crucible-chip-0"]');
  check(afterMerge === 1, 'more of the same stone MERGES — still one stone', `${afterMerge} stone(s)`);
  check(mergedChip !== oneChip, 'and it got bigger rather than duplicating', `${oneChip} → ${mergedChip}`);

  // DIFFERENT stones sit separately.
  await melt(stones.b, 2);
  await melt(stones.c, 2);
  const three = await page.locator('[data-testid^="crucible-stone-"]').count();
  check(three === 3, 'different stones sit as their own stones', `${three}`);

  const frontBefore = await page.locator('[data-testid="crucible-stone-0"]').getAttribute('data-material');
  const thirdMat = await page.locator('[data-testid="crucible-stone-2"]').getAttribute('data-material');
  check(frontBefore === stones.a, 'the first stone in is at the front', `${frontBefore}`);

  await tapp(page, '[data-testid="crucible-stone-2"]');
  const frontAfter = await page.locator('[data-testid="crucible-stone-0"]').getAttribute('data-material');
  check(frontAfter === thirdMat, 'tapping the THIRD stone brings it to the front',
    `${frontBefore} → ${frontAfter}`);
  check((await txt(page, '[data-testid="crucible-front"]')).includes('pours next'),
    'and the tub says which pours next', await txt(page, '[data-testid="crucible-front"]'));
  check(await page.locator('[data-testid="crucible-queue"]').count() === 0,
    'there is no separate queue any more — it is one tub');

  // ═══ 2. THE MELT IS THE MATERIAL ═════════════════════════════════════════
  console.log('\n2 — the tub carries the stone\'s own colour, and recolours');

  const colourOf = async (sel: string): Promise<string> =>
    page.evaluate((x) => getComputedStyle(document.querySelector(x) as HTMLElement).backgroundImage, sel);

  const frontColour = await colourOf('[data-testid="crucible-stone-0"]');
  const secondColour = await colourOf('[data-testid="crucible-stone-1"]');
  check(frontColour !== secondColour && frontColour.includes('gradient'),
    'each stone paints in its own material colour');

  const truth = await page.evaluate(async (mat) => {
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    return mats.materialDef(mat).palette as string[];
  }, frontAfter!);
  const rgb = (hex: string): string => {
    const h = hex.replace('#', '');
    return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
  };
  check(truth.some((p) => frontColour.includes(rgb(p))),
    'and that colour IS MaterialDef.palette, not a decoration', truth.join(','));

  await tapp(page, '[data-testid="crucible-stone-1"]');
  const recoloured = await colourOf('[data-testid="crucible-stone-0"]');
  check(recoloured !== frontColour, 'bringing another stone forward RECOLOURS the front of the tub');
  await shot(page, '2-crucible');

  // ═══ 3. THE PICKER ═══════════════════════════════════════════════════════
  console.log('\n3 — the picker is filtered, not a 158-scroll');

  check(await page.locator('[data-testid="melt-picker-search"]').count() === 1, 'there is a search box');
  const allOpts = await page.locator('[data-testid^="melt-picker-opt-"]').count();
  const heldTotal = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const s = w['__engine'].getState();
    let n = 0;
    for (const sh of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      for (const m of mats.materialsOfShell(sh)) if (forge.materialCount(s, m.id) > 0) n++;
    }
    return n;
  });
  check(allOpts > 0 && allOpts <= heldTotal, 'it lists what you hold', `${allOpts} of ${heldTotal} held`);

  const traitBtns = await page.locator('[data-testid^="melt-picker-trait-"]').count();
  check(traitBtns > 0, 'and offers a cut by trait', `${traitBtns} traits you actually hold`);
  const firstTrait = (await page.locator('[data-testid^="melt-picker-trait-"]').first()
    .getAttribute('data-testid'))!;
  await tapp(page, `[data-testid="${firstTrait}"]`);
  const cut = await page.locator('[data-testid^="melt-picker-opt-"]').count();
  check(cut < allOpts, 'picking a trait narrows the list', `${allOpts} → ${cut}`);

  // ═══ 4. TRAITS NAME A DIRECTION ══════════════════════════════════════════
  console.log('\n4 — a trait says where it leans, so a combination is reasoned');

  const lean = await txt(page, '[data-testid="melt-picker-lean"]');
  check(lean.length > 0, 'the chosen trait says what it reaches for', lean);
  check(/reach|endurance|steadiness|ore|carries|turns up|learning|ability/i.test(lean),
    'and it names a DIRECTION, not a number', lean);
  const modNames = await page.evaluate(async () => {
    const tm = await import(/* @vite-ignore */ '/src/engine/content/toolMods' + '.ts');
    return tm.TOOL_MODS.map((m: any) => String(m.name)) as string[];
  });
  check(!modNames.some((n: string) => lean.includes(n)),
    'and never names the modifier outright — pillar 5 holds');

  await page.locator('[data-testid="melt-picker-search"]').fill('a');
  await page.waitForTimeout(300);
  const searched = await page.locator('[data-testid^="melt-picker-opt-"]').count();
  check(searched <= cut, 'search narrows it further still', `${cut} → ${searched}`);
  await page.locator('[data-testid="melt-picker-search"]').fill('');
  await page.waitForTimeout(250);
  await tapp(page, `[data-testid="${firstTrait}"]`);
  await shot(page, '3-picker');

  // ═══ 5. THE LIBRARY FILLS BY FORGING ═════════════════════════════════════
  console.log('\n5 — the modifier library: empty → taught by forging → installed');

  check((await txt(page, '[data-testid="mod-library-count"]')) === '0 known',
    'the library starts EMPTY', await txt(page, '[data-testid="mod-library-count"]'));
  check(await page.locator('[data-testid="mod-library-empty"]').count() === 1,
    'and says how to fill it rather than showing a locked list');

  await tapp(page, '[data-testid="mould-part-head"]');
  await tapp(page, '[data-testid="mould-pour"]');
  const after = await txt(page, '[data-testid="mod-library-count"]');
  const learned = Number(after.split(' ')[0]);
  check(learned > 0, 'POURING A PART discovers a modifier', `0 known → ${after}`);

  const rows = await txt(page, '[data-testid="mod-library-list"]');
  check(/from a /i.test(rows), 'and the library records WHAT revealed it', rows.slice(0, 90));

  const engineSide = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMods' + '.ts');
    const s = w['__engine'].getState();
    const known = tm.knownMods(s);
    return { n: known.length, shells: [...new Set(known.map((m: any) => String(m.shell)))] as string[] };
  });
  check(engineSide.n === learned, 'the panel count is the engine\'s count', `${engineSide.n}`);
  check(engineSide.shells.every((sh) => ['loam', 'ferrite', 'verdance'].includes(sh)),
    'and nothing deeper than the player has been is leaked in', engineSide.shells.join(','));
  await shot(page, '4-library');

  // INSTALL IT — a known modifier goes onto a tool through the real bench verb.
  const installed = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMods' + '.ts');
    const mining = await import(/* @vite-ignore */ '/src/engine/systems/toolMining' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const traits = await import(/* @vite-ignore */ '/src/engine/traits' + '.ts');
    const s = w['__engine'].getState();
    s.casting.tool = cp.PART_TYPES.map((t: string, i: number) => ({
      ...fp.makePart(t, 'marl', 70), id: 900 + i,
    }));
    s.casting.wear = 0;
    s.casting.xp = mining.xpForLevel(30);
    const want = tm.knownMods(s)[0];
    if (!want) return { ok: false, reason: 'nothing known', before: 0, after: 0 };
    const pick: string[] = [];
    for (const [t, n] of Object.entries(want.needs) as Array<[string, number]>) {
      const stone = mats.materialsOfShell('loam').find((m: any) => traits.traitsOf(m.id).includes(t));
      for (let i = 0; i < (n as number); i++) if (stone) pick.push(stone.id);
    }
    const before = tm.modStacks(s).length;
    const r = w['__engine'].dispatch({
      type: 'applyToolMod', materialIds: pick.slice(0, 3), prefer: want.id,
    });
    return {
      ok: r.ok, reason: r.reason ?? '', want: want.name,
      before, after: tm.modStacks(s).length,
    };
  });
  await page.waitForTimeout(400);
  check(installed.ok === true, `installing ${installed.want ?? '?'} through the bench`,
    installed.reason ?? '');
  check(installed.after > installed.before,
    'a discovered modifier is now ON the tool', `${installed.before} → ${installed.after}`);
  await shot(page, '5-installed', true);

  // ═══ 6. 380px ════════════════════════════════════════════════════════════
  console.log('\n6 — 380px');
  const over = await page.evaluate(() => {
    const bad: string[] = [];
    const root = document.querySelector('[data-testid="the-station"]');
    if (root) {
      for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width > 0 && (r.left < -1 || r.right > window.innerWidth + 1)) {
          const who = (el as HTMLElement).dataset['testid']
            ?? ((el as HTMLElement).className || el.tagName);
          bad.push(`${who} ${Math.round(r.left)}..${Math.round(r.right)}`);
        }
      }
    }
    return { bad, doc: document.documentElement.scrollWidth, win: window.innerWidth };
  });
  check(over.bad.length === 0, 'nothing leaves the viewport', over.bad.slice(0, 4).join(' | '));
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
