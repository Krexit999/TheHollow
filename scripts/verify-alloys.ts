/**
 * A.54 — ONE ALLOY PER DRILL, driven in the real UI.
 *
 * The four things the brief asked to SEE:
 *   1  a drill's ALLOY button jumps to the Forge aimed at THAT drill
 *   2  two different drills carrying two different abilities at once
 *   3  the new cost — a real spend, per drill, and again when you swap
 *   4  the "speed bonuses" tooltip showing in full at 380px
 *
 * Plus the A.53 checks that must survive the change: the arc still arcs, the
 * marks still land on the rock, discovery is still hint-then-confirm, a bare
 * bay still mines, and the bench still works past Loam.
 *
 * The grid effects read the LIVE renderer's own state — the arcs it is drawing
 * and the bands it has committed to each tile — rather than trusting an event.
 *
 *   npx tsx scripts/verify-alloys.ts [port] [outDir]
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

/** innerText returns RENDERED text, so `uppercase` classes come back shouting. */
const text = async (page: Page): Promise<string> =>
  (await page.locator('body').innerText()).replace(/\s+/g, ' ');
const has = (t: string, s: string): boolean => t.toLowerCase().includes(s.toLowerCase());

const bay = async (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    return {
      drills: s.drills.units.length,
      alloys: s.drills.alloys as string[],
      /** The bay's MIX — the whole point of the phase. */
      fitted: s.drills.units.map((u: { alloy?: string }) => u.alloy ?? null) as (string | null)[],
      conv: s.currencies[s.shell.current === 'loam' ? 'brick' : 'flux']?.toNumber() ?? 0,
      dust: s.totals['dust']?.toNumber() ?? 0,
      strikes: s.stats.drillStrikes as number,
      shell: s.shell.current as string,
      tab: w['__ui'].getState().tab as string,
      targets: w['__ui'].getState().alloyTargets as number[],
      unitKeys: [...new Set(s.drills.units.flatMap((u: object) => Object.keys(u)))].sort(),
    };
  });

/** What the LIVE renderer is drawing right now. */
const faceFx = async (page: Page) =>
  page.evaluate(() => {
    const v = (window as unknown as Record<string, any>)['__faceView'];
    if (!v) return null;
    return {
      arcs: v['chainArcs'].length as number,
      setTiles: v['tiles'].filter((t: { setBand: number }) => t.setBand > 0).length as number,
      callTiles: v['tiles'].filter((t: { callBand: number }) => t.callBand > 0).length as number,
      /** One livery per drill now, so this is a SET, not a single value. */
      looks: v['drillSprites'].map((d: { look: string }) => d.look) as string[],
    };
  });

async function press(page: Page, name: RegExp, nth = 0): Promise<boolean> {
  await dismiss(page);
  const b = page.getByRole('button', { name }).nth(nth);
  if ((await b.count()) === 0 || (await b.isDisabled().catch(() => true))) return false;
  await b.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(250);
  return true;
}

async function shot(page: Page, name: string, anchor?: string): Promise<void> {
  await dismiss(page);
  if (anchor) {
    await page.evaluate((a) => {
      const target = Array.from(document.querySelectorAll('div, span')).find((d) => d.textContent?.trim().startsWith(a));
      const box = target?.closest('.overflow-y-auto') as HTMLElement | null;
      if (box && target) box.scrollTop = (target as HTMLElement).offsetTop - box.offsetTop - 8;
    }, anchor);
    await page.waitForTimeout(350);
  }
  await page.screenshot({ path: `${OUT}/a54-${name}.png` });
  shots.push(`${OUT}/a54-${name}.png`);
}

async function overflow(page: Page, name: string): Promise<void> {
  const px = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(px === 0, `${name}: no horizontal overflow at ${W}px`, `${px}px`);
}

/** Run the bay hard for a while, refilling the face, and keep the view live. */
async function mine(page: Page, seconds: number): Promise<void> {
  await page.evaluate((sec) => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    s.face.cells = s.face.cells.map(() => 8);
    w['__engine'].dispatch({ type: 'debug', op: 'warp', seconds: sec });
  }, seconds);
  await page.waitForTimeout(500);
}

/** Pour a known mix into the currently-selected drills, from the Forge. */
async function pour(page: Page, mats: RegExp[]): Promise<void> {
  for (const m of mats) await press(page, m);
  await press(page, /^Pour it into/);
  await page.waitForTimeout(500);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  // The grid effects are motion. Say so rather than trusting the headless
  // default — a `reduce` preference silently skips the arc.
  const page = await browser.newPage({ viewport: { width: W, height: H }, reducedMotion: 'no-preference' });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[console] ${m.text().slice(0, 200)}`); });

  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    const d = await import(/* @vite-ignore */ '/src/engine/systems/drills' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const dec = await import(/* @vite-ignore */ '/src/engine/decimal' + '.ts');
    const w = window as unknown as Record<string, unknown>;
    w['__D'] = dec.D;
    w['__mkDrill'] = (s: never, n: number) => {
      for (let i = 0; i < n; i++) {
        (s as unknown as { drills: { units: unknown[] } }).drills.units.push(d.newDrill(`D${i}`));
      }
    };
    w['__give'] = (s: never, id: string, n: number) => forge.addMaterial(s, id, 70, n);
  });

  await setup(page, `
    const st = engine.getState();
    st.drills.bayBuilt = true;
    st.forge.built = true;
    st.depth = 40;
    st.currencies['brick'] = window.__D(50000);
    st.currencies['dust'] = window.__D(50000);
    window.__mkDrill(st, 4);
    for (const id of ['rootglass','umberjade','chthonite','temperash','graveclay','duskflint','marl'])
      window.__give(st, id, 60);
  `);
  await dismiss(page);
  await tab(page, 'drills');
  await dismiss(page);
  await page.waitForTimeout(1200);
  await dismiss(page);

  // === 1. THE ALLOY BUTTON ON A DRILL'S CARD ==============================
  console.log('\n1 — a drill\'s ALLOY button jumps to the Forge, aimed at that drill');
  const t0 = await text(page);
  check(has(t0, 'The mix'), 'the bay reads as a MIX, not one bay-wide alloy');
  check(has(t0, 'nothing fitted'), 'and starts with nothing fitted');
  check(has(t0, 'runs bare'), 'every chassis says what IT is running');
  check((await page.getByRole('button', { name: /^Alloy$/ }).count()) === 4,
    'one ALLOY button per drill', `${await page.getByRole('button', { name: /^Alloy$/ }).count()} buttons`);
  await shot(page, '1-bay-bare', 'The mix');

  // The THIRD drill's button, so "it targeted that one" is a real claim.
  await press(page, /^Alloy$/, 2);
  await page.waitForTimeout(900);
  const b1 = await bay(page);
  check(b1.tab === 'forge', 'the button carried us to the Forge', b1.tab);
  check(JSON.stringify(b1.targets) === '[2]', 'aimed at the drill whose button it was', JSON.stringify(b1.targets));
  const tForge = await text(page);
  check(has(tForge, 'Drill alloys'), 'the alloy bench is a subsection of the Forge');
  check(has(tForge, 'Into which drill · 1 picked'), 'and the bench says which drill it is aimed at');
  check(has(tForge, 'Pour it into 1 drill'), 'the pour button names the target count');
  await overflow(page, 'forge');
  await shot(page, '2-jumped', 'Drill alloys');

  // ...and the bench is BELOW the tools, not floating at the top of the room.
  const order = await page.evaluate(() => {
    // Count the Forge's own panels and find where the bench falls among them.
    // Index, not compareDocumentPosition against one sibling: `<details>` is
    // not a div, which is how the first version of this probe "found" the
    // bench above a tool section it had never located.
    const panels = Array.from(document.querySelectorAll('.panel'));
    const at = panels.findIndex((p) => p.textContent?.trim().startsWith('Drill alloys'));
    return { at, of: panels.length };
  });
  check((order?.at ?? -1) > 0, 'it sits UNDER the regular Forge, not above it',
    `panel ${order.at + 1} of ${order.of}`);

  // === 5a. THE HINT STILL COMES BEFORE THE ANSWER =========================
  console.log('\n(kept from A.53) — hint before, name after');
  for (const name of ['Arcvein', 'Lodecall', 'Emberset']) {
    check(!has(tForge, name), `PILLAR 5: "${name}" is not listed before it is made`);
  }
  await press(page, /^Rootglass/);
  await press(page, /^Umberjade/);
  await page.waitForTimeout(300);
  const tHint = await text(page);
  check(has(tHint, 'looking for somewhere to jump'), 'two charged materials HINT at what the mix wants');
  check(has(tHint, 'no telling, until you have made one'),
    'and the price is WITHHELD for a mix nobody has made — otherwise it is a free scanner');
  for (const name of ['Arcvein', 'Lodecall', 'Emberset']) {
    check(!has(tHint, name), `and still does not name it ("${name}")`);
  }
  await shot(page, '3-hint', 'Drill alloys');

  // === 2 + 3. POUR IT, AND SEE WHAT IT COST ===============================
  console.log('\n2 — the pour lands in that ONE drill, and costs something');
  const before = await bay(page);
  await press(page, /^Pour it into/);
  await page.waitForTimeout(700);
  const after = await bay(page);
  const spent = before.conv - after.conv;
  check(after.fitted[2] === 'arcvein', 'drill 3 is running Arcvein', JSON.stringify(after.fitted));
  check(after.fitted.filter(Boolean).length === 1, 'and it went into that drill ALONE — no bay-wide spill');
  check(spent >= 200, 'the pour was a real spend, not a rounding error', `${spent} Brick`);
  const tMade = await text(page);
  check(has(tMade, 'Arcvein'), 'the ability is NAMED after the make');
  check(has(tMade, 'jumps to neighbouring cells'), 'and says exactly what it does');
  check(has(tMade, 'from 2× charged'), 'a KNOWN alloy shows its signature, so re-pouring is not a memory test');
  await shot(page, '4-made', 'Drill alloys');

  // === 3b. RE-ALLOYING COSTS AGAIN ========================================
  console.log('\n3 — swapping is a decision, not a free toggle');
  const preSwap = await bay(page);
  await pour(page, [/^Chthonite/, /^Temper Ash/]);
  const postSwap = await bay(page);
  check(postSwap.fitted[2] === 'emberset', 'the same drill now runs Emberset instead', JSON.stringify(postSwap.fitted));
  check(preSwap.conv - postSwap.conv >= 100, 're-alloying charged the full price again',
    `${preSwap.conv - postSwap.conv} Brick`);
  // And the price is now QUOTED, because the player knows what they are buying.
  await press(page, /^Chthonite/);
  await press(page, /^Temper Ash/);
  await page.waitForTimeout(300);
  const tPrice = await text(page);
  check(/The pour wants \d+ Brick/i.test(tPrice), 'a known mix quotes its price up front',
    tPrice.match(/The pour wants[^·]*·[^(]*/)?.[0]?.trim() ?? 'not shown');
  await press(page, /^Chthonite/);
  await press(page, /^Temper Ash/);

  // === 2b. TWO DRILLS, TWO ABILITIES, AT ONCE =============================
  console.log('\n2b — a real mix: three drills, three different abilities');
  await page.evaluate(() => {
    (window as unknown as Record<string, any>)['__ui'].getState().setAlloyTargets([0]);
  });
  await page.waitForTimeout(300);
  await pour(page, [/^Rootglass/, /^Umberjade/]);
  await page.evaluate(() => {
    (window as unknown as Record<string, any>)['__ui'].getState().setAlloyTargets([1]);
  });
  await page.waitForTimeout(300);
  await pour(page, [/^Graveclay/, /^Duskflint/]);

  const mixed = await bay(page);
  const distinct = new Set(mixed.fitted.filter(Boolean));
  check(distinct.size >= 3, 'three different abilities are live in one bay at once',
    JSON.stringify(mixed.fitted));
  check(mixed.fitted.includes(null), 'and a bare drill is still sitting alongside them');
  await shot(page, '5-mix-forge', 'Drill alloys');

  await tab(page, 'drills');
  await dismiss(page);
  await page.waitForTimeout(700);
  const tMix = await text(page);
  check(has(tMix, 'Arcvein') && has(tMix, 'Emberset') && has(tMix, 'Lodecall'),
    'the bay panel names all three abilities it is running');
  check(/3 abilit/i.test(tMix), 'and counts them', tMix.match(/\d+ abilit\w+ · \d+ bare/)?.[0] ?? '');
  await overflow(page, 'bay mixed');
  await shot(page, '6-mix-bay', 'The mix');

  // The face wears the mix too — three liveries on the rails.
  await tab(page, 'dig');
  await dismiss(page);
  await page.waitForTimeout(900);
  const fx = await faceFx(page);
  check(new Set(fx?.looks ?? []).size >= 3, 'and each drill visibly wears its OWN alloy',
    JSON.stringify(fx?.looks));

  // === THE A.53 EFFECTS STILL WORK ========================================
  console.log('\n(kept from A.53) — the grid effects survive the move to per-drill');
  const arcSeen = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const v = w['__faceView'];
    const s = w['__engine'].getState();
    let peak = 0;
    for (let i = 0; i < 40; i++) {
      s.face.cells = s.face.cells.map(() => 8);
      w['__engine'].dispatch({ type: 'debug', op: 'warp', seconds: 3 });
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      peak = Math.max(peak, v['chainArcs'].length);
    }
    return peak;
  });
  check(arcSeen > 0, 'ONE arc drill in a mixed bay still visibly arcs', `${arcSeen} live at peak`);
  const fx2 = await faceFx(page);
  check((fx2?.setTiles ?? 0) > 0, 'THE SET still marks the rock', `${fx2?.setTiles} tiles hot`);
  check((fx2?.callTiles ?? 0) > 0, 'THE CALL still gathers', `${fx2?.callTiles} tiles gathering`);
  await shot(page, '7-face');

  // THE MARK IS ON THE ROCK: the bare drill benefits from the softened cell.
  const shared = await page.evaluate(async () => {
    const a = await import(/* @vite-ignore */ '/src/engine/systems/drillAlloys' + '.ts');
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    const bareIdx = s.drills.units.findIndex((u: { alloy?: string }) => !u.alloy);
    const emberIdx = s.drills.units.findIndex((u: { alloy?: string }) => u.alloy === 'emberset');
    // Guard, so a missing arm reports itself instead of throwing an
    // undefined-property error four lines away from what actually went wrong.
    if (emberIdx < 0 || bareIdx < 0) return { bareIdx, emberIdx, bite: -1 };
    a.markResidue(s, 0, a.drillAbility(s.drills.units[emberIdx]));
    return { bareIdx, emberIdx, bite: a.residueBite(s, 0) };
  });
  check(shared.bite > 1 && shared.bareIdx >= 0,
    'rock softened by the ember drill bites harder for the BARE one too — the mix interlocks',
    `bite ×${shared.bite}`);

  // === 6. THE IDLE PLAYER =================================================
  console.log('\n(kept from A.53) — no alloy anywhere, still mining');
  await setup(page, `
    const st = engine.getState();
    st.drills.units = [];
    window.__mkDrill(st, 6);
    st.currencies['dust'] = window.__D(0);
  `);
  await page.waitForTimeout(700);
  const i0 = await bay(page);
  check(i0.fitted.every((f) => f === null), 'nothing fitted anywhere');
  await mine(page, 60);
  const i1 = await bay(page);
  check(i1.dust > i0.dust, 'a bay with no alloy earns perfectly well', `${(i1.dust - i0.dust).toFixed(0)} dust`);
  await tab(page, 'drills');
  await dismiss(page);
  await page.waitForTimeout(700);
  check(has(await text(page), 'a bare bay mines perfectly well'), 'and the panel says so, rather than nagging');

  // === 4. THE TOOLTIP =====================================================
  console.log('\n4 — the bonus tooltip shows in full at 380px');
  // A REAL hover, not a synthetic `mouseenter`. React derives onMouseEnter from
  // mouseover/mouseout at the root, so a dispatched `mouseenter` does nothing
  // at all — the first version of this probe reported the tooltip "never
  // opened" when the only broken thing was the probe.
  await page.getByText('Speed bonuses', { exact: true }).first().hover();
  await page.waitForTimeout(400);
  const tip = await page.evaluate(() => {
    const el = document.querySelector('[role="tooltip"]') as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      inBody: el.parentElement === document.body,
      left: Math.round(r.left), right: Math.round(r.right),
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      vw: window.innerWidth, vh: window.innerHeight,
      // Every row fully inside the box — a clipped SOURCE is the same defect
      // one level down from a clipped tooltip.
      clippedRows: Array.from(el.querySelectorAll('div')).filter((d) => d.scrollWidth > d.clientWidth + 1).length,
      scrolls: el.scrollHeight > el.clientHeight + 1,
      text: (el.innerText ?? '').replace(/\s+/g, ' ').slice(0, 120),
    };
  });
  check(tip !== null, 'the tooltip opened');
  check(tip?.inBody === true, 'it is PORTALLED to the body — nothing can clip it to a scroll box');
  check((tip?.left ?? -1) >= 0 && (tip?.right ?? 1e9) <= (tip?.vw ?? 0),
    'it fits inside 380px horizontally', `${tip?.left}..${tip?.right} of ${tip?.vw}`);
  check((tip?.top ?? -1) >= 0 && (tip?.bottom ?? 1e9) <= (tip?.vh ?? 0),
    'and inside the viewport vertically', `${tip?.top}..${tip?.bottom} of ${tip?.vh}`);
  check(tip?.clippedRows === 0, 'no row of the breakdown is cut off', `${tip?.clippedRows} clipped`);
  check(tip?.scrolls === false, 'the whole breakdown is visible without scrolling it');
  check(has(tip?.text ?? '', 'Where this comes from'), 'and it says what it is', tip?.text ?? '');
  await shot(page, '8-tooltip');
  await overflow(page, 'tooltip open');

  // ...and near the TOP of the screen it flips below rather than off-screen.
  await tab(page, 'dig');
  await dismiss(page);
  await page.waitForTimeout(600);
  // THE SAME LABEL IN A SHORT WINDOW — the edge case the app can genuinely
  // produce. What it CANNOT produce is an anchor in the top 180px, because the
  // face canvas owns the top ~430px of every room, so the flip-DOWN branch of
  // the tooltip never fires through a room today. That guard is kept for the
  // placement it does cover and is asserted in the unit tests, not claimed
  // here: an earlier draft of this check hovered a label two-thirds down a
  // scrolled panel, watched the tooltip open upward exactly as normal, and
  // reported "it flips" — green output for a case it never created.
  await page.setViewportSize({ width: W, height: 380 });
  await page.waitForTimeout(500);
  await page.getByText('Yield / charge', { exact: true }).first().hover();
  await page.waitForTimeout(400);
  const flip = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('span')).find((s) => s.textContent?.trim() === 'Yield / charge');
    const host = el?.closest('span[class*="cursor-help"]') as HTMLElement | null;
    const tipEl = document.querySelector('[role="tooltip"]') as HTMLElement | null;
    if (!tipEl || !host) return null;
    const t = tipEl.getBoundingClientRect();
    return {
      top: Math.round(t.top), bottom: Math.round(t.bottom), left: Math.round(t.left), right: Math.round(t.right),
      vh: window.innerHeight, vw: window.innerWidth,
      anchorTop: Math.round(host.getBoundingClientRect().top),
      clippedRows: Array.from(tipEl.querySelectorAll('div')).filter((d) => d.scrollWidth > d.clientWidth + 1).length,
    };
  });
  check(flip !== null, 'the tooltip still opens in a 380x380 window');
  check((flip?.top ?? -1) >= 0 && (flip?.bottom ?? 1e9) <= (flip?.vh ?? 0),
    'and repositions to stay fully on screen when the room is half the height',
    flip ? `tip ${flip.top}..${flip.bottom} of ${flip.vh}, anchor at ${flip.anchorTop}` : 'no tooltip');
  check((flip?.left ?? -1) >= 0 && (flip?.right ?? 1e9) <= (flip?.vw ?? 0) && flip?.clippedRows === 0,
    'with nothing cut off either side', `${flip?.left}..${flip?.right} of ${flip?.vw}`);
  await overflow(page, 'short window');
  await shot(page, '9-tooltip-short');
  await page.setViewportSize({ width: W, height: H });
  await page.waitForTimeout(400);

  // === REACH — past Loam ==================================================
  console.log('\nREACH — the bench past the shell it was built in');
  await setup(page, `
    const st = engine.getState();
    st.shell.current = 'ferrite';
    st.shell.breachCount = 1;
    st.depthRecords['loam'] = 480;
    st.depth = 90;
    st.drills.alloys = [];
    st.drills.units = [];
    window.__mkDrill(st, 3);
    st.currencies['brick'] = window.__D(0);
    st.currencies['dust'] = window.__D(0);
    st.currencies['flux'] = window.__D(50000);
    window.__give(st, 'voltgland', 40);
    window.__give(st, 'magnetheart', 40);
  `);
  await dismiss(page);
  await tab(page, 'forge');
  await dismiss(page);
  await page.waitForTimeout(1000);
  const r0 = await bay(page);
  check(r0.shell === 'ferrite', 'standing past Loam', r0.shell);
  await press(page, /^Voltgland/);
  await press(page, /^Magnetheart/);
  await page.waitForTimeout(300);
  const tR = await text(page);
  check(has(tR, 'looking for somewhere to jump'), "the hint reads this shell's materials too");
  await page.evaluate(() => {
    (window as unknown as Record<string, any>)['__ui'].getState().setAlloyTargets([0]);
  });
  await page.waitForTimeout(300);
  await press(page, /^Pour it into/);
  await page.waitForTimeout(700);
  const r1 = await bay(page);
  check(r1.fitted[0] === 'arcvein', 'the bench works past Loam — not a dead panel', JSON.stringify(r1.fitted));
  check(50000 - r1.conv >= 300, "and the deeper shell paid MORE, in this shell's own coin",
    `${50000 - r1.conv} Flux`);
  await overflow(page, 'reach');
  await shot(page, '10-reach', 'Drill alloys');

  await browser.close();
  console.log(`\nshots:\n  ${shots.join('\n  ')}`);
  console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n  ${problems.join('\n  ')}` : '\nALL CHECKS PASS');
  process.exit(problems.length ? 1 : 0);
}
main();
