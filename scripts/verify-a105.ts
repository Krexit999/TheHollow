/**
 * A.105 DRIVEN IN THE REAL GAME — THE DEAD.
 *
 *   A  §23's opening, read FIRST on a state nothing has touched
 *   B  the room is SHUT before anything is found — not empty, absent
 *   C  an object found by DESCENDING, not by writing state
 *   D  what it says, read off the screen, against what the Roll shows
 *   E  the trail INCOMPLETE — a gap, with no name in it
 *   F  the absence walked, and the epitaph appearing that did not exist before
 *   G  dpsMax unmoved at the SAME depth with every object in hand
 *   H  permanence through a Collapse
 *   I  380px, 0 overflow, panel HEIGHT bounded, every row NAMED, 0 page errors
 *
 * NO NAMED FUNCTION MAY BE DECLARED INSIDE A `page.evaluate` BODY — esbuild's
 * `keepNames` rewrites `const f = () => {}` into `__name(...)`, which does not
 * exist in the page. It has cost nine runs across A.90–A.104.
 *
 *   npx tsx scripts/verify-a105.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss, hold } from './drive';
import { SEL } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots-a105';
const W = 380, H = 1700;

const problems: string[] = [];

function check<T>(actual: T, want: T, bad: T, label: string): void {
  if (JSON.stringify(bad) === JSON.stringify(want)) {
    console.log(`  VACUOUS  ${label} — the known-bad value equals the expected one`);
    problems.push(`${label} (vacuous)`);
    return;
  }
  const ok = JSON.stringify(actual) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    console.log(`        got  ${JSON.stringify(actual)}`);
    console.log(`        want ${JSON.stringify(want)}`);
    problems.push(label);
  }
}

/** Enough purse and tool to actually walk down Loam, and nothing else. */
const WALKABLE = `
  const s = engine.getState();
  s.currencies['dust'] = s.currencies['dust'].mul(0).add(1e30);
  s.forge.tools = s.forge.tools ?? [];
  s.depthRecords['loam'] = 0;
  s.depth = 0;
  s.dead = { found: [], closed: [] };
`;

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

  // ═══ A — §23, READ FIRST, BEFORE ANY FIXTURE ══════════════════════════════
  console.log('\n== A — the opening beats, on a state nothing has touched ========');
  await dismiss(page);
  const open = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    const m = w['__engine'].getModifiers ? w['__engine'].getModifiers() : null;
    return { cells: s.face.w * s.face.h, depth: s.depth, dps: m ? Number(m.dpsMax) : null };
  });
  check(open.cells, 36, 0, 'A1 §23 opens on 36 cells');
  check(open.depth, 0, 1, 'A2 §23 opens at depth 0');

  // ═══ B — THE ROOM IS ABSENT, NOT EMPTY ════════════════════════════════════
  console.log('\n== B — before anything is found ================================');
  await setup(page, WALKABLE);
  const shut = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const tabs = Array.from(document.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());
    return { tabHere: tabs.includes('The Dead'), found: (w['__engine'].getState().dead?.found ?? []).length };
  });
  check(shut.found, 0, 1, 'B1 nothing found yet');
  check(shut.tabHere, false, true, 'B2 the room is not in the nav at all — absent, not a locked row');
  await tab(page, 'dead');
  const emptyPanel = await page.locator('[data-testid="dead-panel"]').count();
  check(emptyPanel, 0, 1, 'B3 ...and renders nothing even if navigated to directly');

  // ═══ C — FOUND BY WALKING, NOT BY WRITING STATE ═══════════════════════════
  console.log('\n== C — found by descending ====================================');
  await tab(page, 'dig');
  await dismiss(page);
  let depth = 0;
  for (let i = 0; i < 40 && depth < 9; i++) {
    await hold(page, SEL.descend, 900);
    depth = await page.evaluate(() => (window as unknown as Record<string, any>)['__engine'].getState().depth);
  }
  const walked = await page.evaluate(() => {
    const s = (window as unknown as Record<string, any>)['__engine'].getState();
    return { depth: s.depth, found: [...(s.dead?.found ?? [])] };
  });
  console.log(`  walked to depth ${walked.depth}; picked up ${JSON.stringify(walked.found)}`);
  check(walked.depth >= 9, true, false, 'C1 the driver actually descended past Kiln Yard (depth 9)');
  check(walked.found.includes('tallowbox'), true, false, "C2 Tallow's tinderbox is in hand, off the floor at Kiln Yard");
  check(walked.found.includes('garnrake'), true, false, "C3 ...and so is Garn's rake, which lies at the same station");
  check(walked.found.includes('peelcoat'), true, false, "C4 ...and Peel's good coat");

  // ═══ D — WHAT IT SAYS vs WHAT THE ROLL SHOWS ══════════════════════════════
  console.log('\n== D — it says something the Roll does not ======================');
  await tab(page, 'dead');
  await dismiss(page);
  const said = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="object-tallowbox"]');
    return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  });
  console.log(`  on screen: ${said.slice(0, 150)}`);
  check(said.includes('SEVENTY-TWO'), true, false, 'D1 the line on screen names depth 72');
  // ...and the Roll, from where the object lay, does NOT say what is at 72.
  const rollSays = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    const before = s.depth;
    s.depth = 9;
    const rows = w['__roll'] ? w['__roll'](s) : null;
    s.depth = before;
    if (!rows) return null;
    const r = rows.find((x: any) => x.def.id === 'ashfall');
    return r ? { legible: r.legible, type: r.legible ? r.type : null } : null;
  });
  if (rollSays === null) {
    console.log('  NOTE  no __roll bridge in the page; D2 falls back to the engine test (dead.test.ts §3)');
  } else {
    check(rollSays.legible, false, true, 'D2 the Roll at depth 9 cannot read what The Ashfall IS');
  }

  // ═══ E — THE GAP ═══════════════════════════════════════════════════════════
  console.log('\n== E — an unfound object is a gap, with no name in it ============');
  const gaps = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[data-testid^="object-gap-"]'));
    return els.map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim());
  });
  check(gaps.length > 0, true, false, 'E1 there are gaps on screen');
  // NOT `gaps.every(...)` — on an empty array that is true, so E2 passed while
  // E1 was failing and there was nothing on the screen at all. An instrument
  // that cannot tell "clean" from "absent" is this project's oldest bug.
  const leaky = gaps.filter((g) => /lamp|glove|ledger|rope|apron|slate|pipe|book|pen/i.test(g)).length;
  check(gaps.length > 0 && leaky === 0, true, false, 'E2 not one gap leaks the name of the thing behind it');
  const epitaphsYet = await page.locator('[data-testid^="epitaph-"]').count();
  check(epitaphsYet, 0, 1, 'E3 nobody has stopped yet — no epitaph on screen');
  await page.screenshot({ path: `${OUT}/e-partial-trails.png`, fullPage: true });

  // ═══ F — THE ABSENCE WALKED ════════════════════════════════════════════════
  console.log('\n== F — walk the ground under the last of them ===================');
  await tab(page, 'dig');
  await setup(page, `
    const s = engine.getState();
    s.currencies['dust'] = s.currencies['dust'].mul(0).add(1e30);
  `);
  for (let i = 0; i < 90 && depth < 95; i++) {
    await hold(page, SEL.descend, 700);
    depth = await page.evaluate(() => (window as unknown as Record<string, any>)['__engine'].getState().depth);
    await dismiss(page);
  }
  const closed = await page.evaluate(() => {
    const s = (window as unknown as Record<string, any>)['__engine'].getState();
    return { depth: s.depth, found: (s.dead?.found ?? []).length, closed: [...(s.dead?.closed ?? [])] };
  });
  console.log(`  depth ${closed.depth} · ${closed.found} found · closed ${JSON.stringify(closed.closed)}`);
  check(closed.depth > 33, true, false, 'F1 walked past the deepest thing Peel left (33)');
  check(closed.closed.includes('peel'), true, false, 'F2 Peel’s trail closed — by absence, nothing was picked up to do it');
  await tab(page, 'dead');
  await dismiss(page);
  const epitaph = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="epitaph-peel"]');
    return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  });
  console.log(`  epitaph: ${epitaph.slice(0, 180)}`);
  check(epitaph.length > 80, true, false, 'F3 the epitaph is on screen and is prose');
  check(epitaph.includes('content'), true, false, 'F4 ...and it is the one written for Peel, not a generic line');
  await page.screenshot({ path: `${OUT}/f-trail-closed.png`, fullPage: true });

  // ═══ G — PILLAR 2 ══════════════════════════════════════════════════════════
  console.log('\n== G — every object in hand moves the ceiling by nothing =========');
  // BOTH ARMS AT THE SAME DEPTH, in the same page, one field apart. No named
  // arrow inside the evaluate body — esbuild's keepNames turns one into
  // `__name(...)`, which does not exist here. It cost this driver a run.
  const pillar = await page.evaluate(async () => {
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const deadMod = await import(/* @vite-ignore */ '/src/engine/content/dead' + '.ts');
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    const m = new modsMod.ModifierCache();
    s.depth = 40;                                    // the SAME depth in both arms
    s.dead.found = [];
    m.invalidate();
    const without = String(face.dpsMax(s, m));
    // EVERY object, not just the nine this run walked past.
    s.dead.found = deadMod.ALL_OBJECTS.map((o: any) => o.id);
    m.invalidate();
    const withThem = String(face.dpsMax(s, m));
    return { withThem, without, n: s.dead.found.length };
  });
  console.log(`  dpsMax@40   none: ${pillar.without}   all ${pillar.n}: ${pillar.withThem}`);
  check(pillar.n, 37, 0, 'G0 the treatment arm holds every object in the registry');
  check(pillar.withThem, pillar.without, pillar.without + 'x', `G1 dpsMax at depth 40 unmoved (${pillar.without})`);

  // ═══ H — PERMANENCE ════════════════════════════════════════════════════════
  console.log('\n== H — a Collapse takes the depth and leaves the record ==========');
  await tab(page, 'collapse');
  await dismiss(page);
  const beforeCollapse = await page.evaluate(() => {
    const s = (window as unknown as Record<string, any>)['__engine'].getState();
    return { found: (s.dead?.found ?? []).length, closed: (s.dead?.closed ?? []).length, depth: s.depth };
  });
  const fell = await hold(page, SEL.collapse, 1400);
  await dismiss(page);
  const afterCollapse = await page.evaluate(() => {
    const s = (window as unknown as Record<string, any>)['__engine'].getState();
    return { found: (s.dead?.found ?? []).length, closed: (s.dead?.closed ?? []).length, depth: s.depth };
  });
  console.log(`  collapse fired: ${fell} · depth ${beforeCollapse.depth} -> ${afterCollapse.depth}`);
  check(afterCollapse.depth < beforeCollapse.depth, true, false, 'H1 the Collapse actually happened');
  check(afterCollapse.found, beforeCollapse.found, 0, 'H2 the record survives it intact');
  check(afterCollapse.closed, beforeCollapse.closed, 0, 'H3 ...and so does what you learned by absence');

  // ═══ I — THE SCREEN ════════════════════════════════════════════════════════
  console.log('\n== I — 380px, named rows, bounded height =========================');
  await tab(page, 'dead');
  await dismiss(page);
  const screen = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="dead-panel"]') as HTMLElement | null;
    const rows = Array.from(document.querySelectorAll('[data-testid^="delver-"]'));
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panelH: panel ? Math.round(panel.getBoundingClientRect().height) : -1,
      rows: rows.length,
      named: rows.map((r) => (r.querySelector('span')?.textContent ?? '').trim()).filter((x) => x.length > 0).length,
      blank: rows.filter((r) => (r.textContent ?? '').trim().length < 40).length,
    };
  });
  console.log(`  ${screen.rows} delver rows, ${screen.named} named, panel ${screen.panelH}px`);
  check(screen.overflow, 0, 20, 'I1 zero horizontal overflow at 380px');
  check(screen.named, screen.rows, 0, 'I2 every row on screen carries a name');
  check(screen.blank, 0, 1, 'I3 no row is a stub');
  check(screen.panelH > 0 && screen.panelH < 9000, true, false, `I4 panel height bounded (${screen.panelH}px)`);
  check(errors.length, 0, 1, `I5 zero page errors${errors.length ? ` — ${errors[0]}` : ''}`);
  await page.screenshot({ path: `${OUT}/i-the-dead.png`, fullPage: true });

  await browser.close();
  console.log(`\nshots -> ${OUT}`);
  if (problems.length) {
    console.log(`\n${problems.length} PROBLEM(S): ${problems.join(' · ')}`);
    process.exit(1);
  }
  console.log('\nALL PASS');
}

main().catch((e) => { console.error(e); process.exit(1); });
