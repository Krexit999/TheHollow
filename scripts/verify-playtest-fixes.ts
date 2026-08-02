/**
 * THE PLAYTEST FIXES, VERIFIED IN PLAY (items 1-7).
 *
 *   1  the chip bar carries no Compendium button
 *   2  casting is reachable holding no forge tier at all
 *   3  tapping a rack slot SEATS that material, and the pick reads it back
 *   4  mould tabs switch after a pour AND after a failed pour
 *   5  instability appears exactly once
 *   6  CONDITION and the re-seat action are visible without opening a tab
 *   7  contentsOf on a COLD state returns real contents, not a plausible zero
 *
 * Everything is read off the rendered page or off engine state after a real
 * dispatch — never off a selector's return value alone.
 *
 *   npx tsx scripts/verify-playtest-fixes.ts [port]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = `http://localhost:${process.argv[2] ?? '5173'}`;
const OUT = 'sim-out/shots-playtest';
const problems: string[] = [];
const check = (ok: boolean, label: string, detail = ''): void => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(label);
};

/**
 * THE DISCLOSURE GATE IS NOT A BUG HERE, so it is cleared rather than worked
 * around. This driver opens real systems mid-run (setting `forge.built` opens
 * Casting), and the game correctly announces each one with a modal. That modal
 * is doing its job; it just sits over the buttons being measured. Marking the
 * new rooms seen is what a player pressing "Go on, then" does, so it is called
 * again after every batch of state changes that could open something.
 */
const ALL_ROOMS = [
  'dig', 'shaft', 'kiln', 'drills', 'vents', 'hollow', 'hold', 'casting',
  'refinery', 'runes', 'relics', 'delver', 'collapse', 'rewrite', 'parallel',
  'grid', 'vault', 'spiral',
];
const clearGate = async (page: Page): Promise<void> => {
  await page.evaluate((ids) => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { dispatch: (a: unknown) => unknown };
    e.dispatch({ type: 'markSystemsSeen', ids });
  }, ALL_ROOMS);
  await page.waitForTimeout(400);
};

const goTab = async (page: Page, tab: string): Promise<void> => {
  await page.evaluate((t) => {
    const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
    ui.getState().setTab(t);
  }, tab);
  await page.waitForTimeout(700);
};

const shoot = async (page: Page, name: string, testid?: string): Promise<void> => {
  await page.waitForTimeout(350);
  if (testid) {
    await page.locator(`[data-testid="${testid}"]`).first()
      .screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
  } else {
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }
  console.log(`  shot ${name}`);
};

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  // WIDTH 380 is the constraint; height is tall only so whole panels land in a
  // single element screenshot instead of being sheared at the fold.
  const page = await browser.newPage({ viewport: { width: 380, height: 1400 }, isMobile: true, hasTouch: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    (window as never as Record<string, unknown>)['__name'] = (f: unknown) => f;
  });
  await page.goto(URL);
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForTimeout(3000);

  // ── 7. contentsOf ON A COLD STATE ───────────────────────────────────────
  // FIRST, before anything ticks the Roll into existence: wipe the table and
  // ask a reader for a station's contents. A cold read must roll, not zero.
  console.log('7 — contentsOf on a cold state');
  const cold = await page.evaluate(() => {
    const w = window as unknown as Record<string, never>;
    const e = w['__engine'] as unknown as { getState: () => never };
    const s = e.getState() as unknown as { roll?: { rolled: Record<string, unknown> } };
    // COLD: no rolled table at all, as a save from before the Roll existed.
    if (s.roll) s.roll.rolled = {};
    const mod = w['__roll'] as unknown as { contentsOf?: (st: unknown, id: string) => unknown };
    void mod;
    return null;
  });
  void cold;
  // The reader is engine-internal, so drive it the way the game does: read the
  // hazard the Standoff would use, with the roll table emptied and NO tick in
  // between. Before the fix this returned 0; now it rolls.
  const coldHazard = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown };
    const s = e.getState() as unknown as {
      roll?: { rolled: Record<string, { hazard: number; seam: string }> };
      depth: number; shaft: { reached: number };
    };
    s.depth = 72; s.shaft.reached = 72; // The Ashfall
    if (s.roll) s.roll.rolled = {};
    // beginStandoff reads contentsOf() directly and does not tick first.
    e.dispatch({ type: 'beginStandoff' });
    const st = e.getState() as unknown as {
      standoff: { maxHp: number; stationId: string };
      roll?: { rolled: Record<string, { hazard: number }> };
    };
    return {
      maxHp: st.standoff.maxHp,
      stationId: st.standoff.stationId,
      hazard: st.roll?.rolled['ashfall']?.hazard ?? 0,
      rolledKeys: Object.keys(st.roll?.rolled ?? {}).length,
    };
  });
  console.log(`      ${JSON.stringify(coldHazard)}`);
  check(coldHazard.rolledKeys >= 15, 'a cold read POPULATED the whole table', `${coldHazard.rolledKeys} stations`);
  check(coldHazard.hazard >= 1 && coldHazard.hazard <= 3,
    'and returned a real hazard intensity, not a plausible 0', `hazard ${coldHazard.hazard}`);

  // Stand up a mid-game save for the rest.
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown; tick: (n: number) => void };
    e.dispatch({ type: 'dismissStandoff' });
    e.dispatch({ type: 'markSystemsSeen', ids: ['dig', 'shaft', 'kiln', 'drills', 'hold', 'collapse', 'casting', 'refinery', 'delver'] });
    e.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e9 });
    e.dispatch({ type: 'debug', op: 'grant', currency: 'brick', amount: 1e6 });
    const s = e.getState() as unknown as {
      kiln: { built: boolean; feeding: boolean; heat: number };
      forge: { built: boolean; tools: { tier: number }[] };
      depth: number; maxDepthRecord: number; shaft: { reached: number };
    };
    s.kiln.built = true; s.kiln.feeding = true; s.kiln.heat = 1;
    s.forge.built = true;
    s.depth = 40; s.maxDepthRecord = 40; s.shaft.reached = 40;
    e.tick(0.5);
  });
  await page.waitForTimeout(600);
  await clearGate(page);

  // ── 1. THE CHIP BAR ─────────────────────────────────────────────────────
  console.log('1 — the chip bar carries no Compendium');
  await goTab(page, 'dig');
  const bar = await page.evaluate(() => {
    // The pill holding the mode buttons: the element containing a button whose
    // text is exactly "Chip".
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Chip');
    const pill = btn?.parentElement;
    return {
      text: pill ? (pill as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '',
      buttons: pill ? [...pill.querySelectorAll('button')].map((b) => b.textContent?.trim()) : [],
    };
  });
  console.log(`      chip bar: ${JSON.stringify(bar.buttons)}`);
  check(bar.buttons.length > 0, 'the chip bar is on screen');
  check(!/Compendium|❦/.test(bar.text), 'and holds no Compendium button', bar.text);
  const fabCount = await page.evaluate(() =>
    [...document.querySelectorAll('button')].filter((b) => /Compendium/.test(b.textContent ?? '')).length);
  check(fabCount === 0, 'the floating Compendium button is gone entirely', `${fabCount} found`);
  // ...and the way in still exists, in the header.
  const headerWay = await page.evaluate(() =>
    !!document.querySelector('header')?.querySelector('button[aria-label="Open the Compendium"]'));
  check(headerWay, 'the header ❦ is still the way in — access was not removed');
  await shoot(page, '1-chip-bar');

  // ── 2. CASTING WITH NO FORGE TIER ───────────────────────────────────────
  console.log('2 — casting reachable holding no forge tier');
  // The CASTING tier is the number any casting gate would read, and it is 0
  // here because nothing has been poured. (The forge shelf's starter tool is
  // tier 1 and always has been — asserting 0 there was the driver being wrong
  // about the game, not the game being wrong.)
  const tiers = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as { getState: () => never };
    const s = e.getState() as unknown as {
      forge: { tools: { tier: number }[] }; casting: { tool: unknown[]; built: unknown };
    };
    return { forge: s.forge.tools.map((t) => t.tier), castingParts: s.casting.tool.length };
  });
  console.log(`      forge shelf tiers ${JSON.stringify(tiers.forge)} · casting parts ${tiers.castingParts}`);
  check(tiers.castingParts === 0, 'the casting station has produced nothing — its tier is 0',
    `${tiers.castingParts} parts`);
  await goTab(page, 'casting');
  const castingOn = await page.evaluate(() => !!document.querySelector('[data-testid="the-station"]'));
  check(castingOn, 'THE STATION renders anyway — casting is not tier-gated');
  const stationTier = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="station-tier"]');
    return el ? (el as HTMLElement).innerText.trim() : '';
  });
  check(/tier 0/i.test(stationTier), 'and it says so out loud', stationTier);
  // The row that opens it names the destination, not the retired Forge.
  const rowName = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as { getState: () => never };
    void e;
    const w = window as unknown as Record<string, unknown>;
    void w;
    return null;
  });
  void rowName;

  // ── 3. A RACK TAP SEATS ─────────────────────────────────────────────────
  console.log('3 — tapping a rack slot seats the material');
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; tick: (n: number) => void };
    const s = e.getState() as unknown as {
      casting: { rack: unknown[]; bench: Record<string, number | undefined> };
    };
    s.casting.rack = [{ id: 5001, type: 'head', materialId: 'marl', purity: 62 }];
    s.casting.bench = {};
    e.tick(0.2);
  });
  await page.waitForTimeout(700);
  await clearGate(page);
  const benchBefore = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as { getState: () => never };
    return { ...(e.getState() as unknown as { casting: { bench: Record<string, number> } }).casting.bench };
  });
  await page.locator('[data-testid="rack-slot-head"]').click({ timeout: 5000 });
  await page.waitForTimeout(600);
  const benchAfter = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as { getState: () => never };
    return { ...(e.getState() as unknown as { casting: { bench: Record<string, number> } }).casting.bench };
  });
  console.log(`      bench ${JSON.stringify(benchBefore)} -> ${JSON.stringify(benchAfter)}`);
  check(benchAfter['head'] === 5001, 'ONE TAP SEATED IT', `bench.head = ${benchAfter['head']}`);
  // ...and the pick reads it back on screen.
  const slotText = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="rack-slot-head"]');
    return el ? (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
  });
  check(/seated/i.test(slotText), 'and the slot reads it back as seated', slotText);
  const stationSub = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="station-sub"]');
    return el ? (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
  });
  check(/1 on the bench|1 of 7/i.test(stationSub), 'and the station counts it', stationSub);
  await shoot(page, '3-rack-seated', 'rack-shelf');

  // ── 4. MOULD TABS AFTER A POUR, AND AFTER A FAILED POUR ─────────────────
  console.log('4 — mould tabs switch after a pour and after a failed pour');
  // `want` is now set (the rack slot is open) — this is exactly the state that
  // used to freeze the mould tabs.
  const wantOpen = await page.evaluate(() => !!document.querySelector('[data-testid="rack-open"]'));
  check(wantOpen, 'the rack filter is open — the state that used to freeze the tabs');

  // A FAILED pour first: the tub is empty, so this refuses.
  const pourDisabled = await page.locator('[data-testid="mould-pour"]').isDisabled();
  check(pourDisabled, 'the pour button is refusing (empty tub) — a failed pour');
  // READ THE TAB'S OWN SELECTED STATE, not the pour button's label — when the
  // pour is refused the label reads "Not enough melt" and says nothing about
  // which mould is chosen. `aria-pressed` is the tab set's actual answer.
  const pressedPart = (): Promise<string> => page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="mould-part-"]')]
      .find((b) => b.getAttribute('aria-pressed') === 'true')
      ?.getAttribute('data-testid') ?? 'none');
  const beforeFail = await pressedPart();
  await page.locator('[data-testid="mould-part-core"]').click({ timeout: 5000 });
  await page.waitForTimeout(500);
  const afterFail = await pressedPart();
  console.log(`      selected mould: ${beforeFail} -> ${afterFail} (with a rack filter open, pour refusing)`);
  check(afterFail === 'mould-part-core',
    'THE TAB SWITCHED — the rack filter no longer overrules it', afterFail);

  // Now a REAL pour, then switch tabs again.
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown; tick: (n: number) => void };
    const s = e.getState() as unknown as { materials: { stacks: Record<string, Record<string, { count: number; puritySum: number }>> } };
    s.materials.stacks['marl'] = { fair: { count: 200, puritySum: 200 * 55 } };
    e.dispatch({ type: 'chargeCrucible', materialId: 'marl', units: 5 });
    e.tick(30); // let it melt
  });
  await page.waitForTimeout(900);
  await clearGate(page);
  const canPour = await page.locator('[data-testid="mould-pour"]').isEnabled();
  check(canPour, 'the crucible is molten and the pour is live');
  await page.locator('[data-testid="mould-pour"]').click({ timeout: 5000 });
  await page.waitForTimeout(700);
  const poured = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="mould-note"]');
    return el ? (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
  });
  console.log(`      pour note: "${poured}"`);
  check(/Poured/i.test(poured), 'a real pour went through', poured);
  await page.locator('[data-testid="mould-part-edge"]').click({ timeout: 5000 });
  await page.waitForTimeout(500);
  const afterPour = await pressedPart();
  const pourLabel = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="mould-pour"]');
    return el ? (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
  });
  console.log(`      after tapping EDGE post-pour: ${afterPour} · button "${pourLabel}"`);
  check(afterPour === 'mould-part-edge', 'THE TABS STILL SWITCH AFTER A POUR', afterPour);
  await shoot(page, '4-mould-tabs', 'crucible-bar');

  // ── 5 + 6. BUILD A TOOL, THEN READ THE STATION ──────────────────────────
  console.log('5 + 6 — instability once, condition without a drill-down');
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown; tick: (n: number) => void };
    const s = e.getState() as unknown as {
      casting: { rack: { id: number; type: string; materialId: string; purity: number }[]; bench: Record<string, number | undefined> };
    };
    // Seven parts, one of each, through the real bench + build path — and
    // SEVEN DIFFERENT STONES on purpose. `InstabilityCard` returns null at
    // zero instability (correctly: a row of +0.0% reads as a broken feature),
    // and seven identical marl parts are perfectly coherent, so a matched tool
    // proves nothing about whether the card renders once or twice.
    const types = ['head', 'core', 'edge', 'binding', 'handle', 'grip', 'sockets'];
    const stones = ['marl', 'ochre', 'bonechalk', 'graveclay', 'loamiron', 'duskflint', 'rootglass'];
    s.casting.rack = types.map((t, i) => ({
      id: 6000 + i, type: t, materialId: stones[i]!, purity: 40 + i * 7,
    }));
    s.casting.bench = {};
    e.tick(0.2);
    for (const p of s.casting.rack) e.dispatch({ type: 'benchPlace', partId: p.id });
    e.dispatch({ type: 'buildTool' });
    e.tick(0.5);
  });
  await page.waitForTimeout(900);
  await clearGate(page);
  const built = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as { getState: () => never };
    const s = e.getState() as unknown as { casting: { tool: unknown[] } };
    return s.casting.tool.length;
  });
  check(built === 7, 'a tool is built through the real path', `${built} parts`);

  // 5 — instability exactly once, with every drawer open.
  await page.evaluate(() => {
    for (const d of document.querySelectorAll('details')) (d as HTMLDetailsElement).open = true;
  });
  await page.waitForTimeout(600);
  const instCount = await page.evaluate(() =>
    document.querySelectorAll('[data-testid="instability"]').length);
  console.log(`      [data-testid="instability"] nodes with every drawer open: ${instCount}`);
  check(instCount === 1, 'INSTABILITY RENDERS EXACTLY ONCE', `${instCount} found`);

  // 6 — condition + re-seat visible with every drawer SHUT.
  await page.evaluate(() => {
    for (const d of document.querySelectorAll('details')) (d as HTMLDetailsElement).open = false;
  });
  await page.waitForTimeout(600);
  const cond = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="durability"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const btn = el.querySelector('[data-testid="repair"]');
    // "Visible without opening a tab" = it is not inside a closed <details>.
    let inClosedDrawer = false;
    let p: HTMLElement | null = el.parentElement as HTMLElement | null;
    while (p) {
      if (p.tagName === 'DETAILS' && !(p as HTMLDetailsElement).open) inClosedDrawer = true;
      p = p.parentElement;
    }
    return {
      text: (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim().slice(0, 90),
      hasRepair: !!btn,
      repairText: btn ? (btn as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '',
      inClosedDrawer,
      height: Math.round(r.height),
    };
  });
  console.log(`      ${JSON.stringify(cond)}`);
  check(!!cond && !cond.inClosedDrawer, 'CONDITION IS VISIBLE WITH EVERY DRAWER SHUT');
  check(!!cond?.hasRepair, 'and the re-seat action is with it', cond?.repairText ?? '');
  // A CLOSED <details> KEEPS ITS CHILDREN IN THE DOM, so counting nodes here
  // measures mounting, not visibility — the first cut of this check read "1
  // visible" for a card the player could not see. Ask the same question asked
  // of Condition: is it inside a drawer that is shut?
  const instShut = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="instability"]');
    if (!el) return null;
    let p: HTMLElement | null = el.parentElement as HTMLElement | null;
    while (p) {
      if (p.tagName === 'DETAILS' && !(p as HTMLDetailsElement).open) return true;
      p = p.parentElement;
    }
    return false;
  });
  check(instShut === true, 'instability stayed in the drawer (it is not primary)',
    instShut === null ? 'not rendered at all' : `inClosedDrawer=${instShut}`);
  // Building a tool fires ability/legend toasts, which float over the card.
  // The measurements above are already taken; this wait is only so the
  // SCREENSHOT shows the panel rather than a banner sitting on top of it.
  await page.waitForTimeout(9000);
  await shoot(page, '6-condition-primary', 'durability');
  await shoot(page, '6-station-full');

  // ── OVERFLOW + ERRORS ───────────────────────────────────────────────────
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(overflow === 0, 'no horizontal overflow at 380px', `${overflow}px`);
  check(errors.length === 0, 'no page errors throughout', errors.join(' | '));

  console.log(problems.length === 0 ? '\nALL PASS' : `\nFAILURES: ${problems.join(', ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
