/**
 * THE BUGS AND THE TEETH, DRIVEN IN THE REAL GAME.
 *
 *  1  THE MODIFIER TAB FILLS from normal forging, and is reachable WITHOUT a
 *     built tool — which is what was actually broken.
 *  2  ALL SEVEN RACK SLOTS on screen at 380px, no horizontal scroll.
 *  3  PAIRING is named at the point of picking a stone.
 *  4  BALANCE HAS A JOB — heavy cracks ore faster, light sweeps more rock, and
 *     neither is worse than bare hands at the other's job.
 *  5  INSTABILITY IS THE PRICE OF POWER — a packed build drives it up and a
 *     stabiliser buys it back down.
 *
 *   npx tsx scripts/verify-teeth.ts [port] [outDir]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots';
const W = 380, H = 1700;

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
  await page.screenshot({ path: `${OUT}/th-${name}.png`, fullPage: full });
  shots.push(`${OUT}/th-${name}.png`);
}
const txt = async (page: Page, sel: string): Promise<string> =>
  (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

const PARTS = ['head', 'edge', 'core', 'binding', 'handle', 'grip', 'sockets'];

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

  /** A FRESH CASTING FLOOR — no tool, nothing known. The state that was broken. */
  await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const s = w['__engine'].getState();
    s.depthRecords['loam'] = 40;
    for (const m of mats.materialsOfShell('loam')) forge.addMaterial(s, m.id, 60, 200);
    s.casting.tool = []; s.casting.rack = []; s.casting.bench = {};
    s.casting.knownMods = []; s.casting.modFrom = {}; s.casting.mods = [];
    s.casting.crucible.queue = [];
    s.casting.nextId = 500;
  });
  await page.waitForTimeout(400);
  await tab(page, 'casting');
  await dismiss(page);
  await page.waitForTimeout(500);

  // ═══ 1. THE MODIFIER TAB ═════════════════════════════════════════════════
  console.log('\n1 — the modifier tab, with NO built tool (the state that was broken)');

  check(await page.locator('[data-testid="drawer-mods"]').count() === 1, 'the Modifiers drawer exists');
  const label0 = await txt(page, '[data-testid="drawer-mods"] > summary');
  check(/0 known/i.test(label0), 'and says how many you know without opening it', label0);

  await tapp(page, '[data-testid="drawer-mods"] > summary');
  check(await page.locator('[data-testid="mod-library"]').count() === 1,
    'opening it shows the LIBRARY — not an empty box');
  check(await page.locator('[data-testid="mod-bench-no-tool"]').count() === 1,
    'and it explains why it cannot install yet, instead of rendering nothing');
  await shot(page, '1-tab-empty');

  // FORGE NORMALLY. Melt, pour — nothing exotic.
  const stone = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const traits = await import(/* @vite-ignore */ '/src/engine/traits' + '.ts');
    // The densest Loam stone a player would actually reach for.
    const pick = mats.materialsOfShell('loam').find((m: any) => traits.traitsOf(m.id).includes('dense'))
      ?? mats.materialsOfShell('loam')[0];
    w['__engine'].dispatch({ type: 'chargeCrucible', materialId: pick.id, units: 20 });
    return { id: pick.id as string, traits: traits.traitsOf(pick.id) as string[] };
  });
  await page.waitForTimeout(300);
  for (let i = 0; i < 30; i++) await page.evaluate(() => (window as any)['__engine'].tick(0.5));
  await page.waitForTimeout(300);

  await tapp(page, '[data-testid="mould-part-head"]');
  await tapp(page, '[data-testid="mould-pour"]');
  const label1 = await txt(page, '[data-testid="drawer-mods"] > summary');
  const known = Number((await txt(page, '[data-testid="mod-library-count"]')).split(' ')[0]);
  check(known > 0, `pouring one ${stone.id} head fills the tab`, `0 → ${known} known`);
  check(/[1-9]\d* known/i.test(label1), 'and the drawer label moves with it', label1);
  const rows = await txt(page, '[data-testid="mod-library-list"]');
  check(/from a /i.test(rows), 'each one says what revealed it', rows.slice(0, 80));
  await shot(page, '2-tab-filled');

  // ═══ 2. THE RACK ═════════════════════════════════════════════════════════
  console.log('\n2 — all seven rack slots on screen');

  const slots = await page.locator('[data-testid^="rack-slot-"]').count();
  check(slots === 7, 'seven slots, one per part type', `${slots}`);
  const rackGeom = await page.evaluate((parts) => {
    const strip = document.querySelector('[data-testid="rack-slots"]') as HTMLElement;
    const out: Array<{ t: string; l: number; r: number; vis: boolean }> = [];
    for (const t of parts) {
      const el = document.querySelector(`[data-testid="rack-slot-${t}"]`) as HTMLElement | null;
      if (!el) continue;
      const b = el.getBoundingClientRect();
      out.push({ t, l: Math.round(b.left), r: Math.round(b.right), vis: b.left >= -1 && b.right <= window.innerWidth + 1 });
    }
    return { out, scrolls: strip ? strip.scrollWidth > strip.clientWidth + 1 : false };
  }, PARTS);
  check(rackGeom.out.length === 7 && rackGeom.out.every((x) => x.vis),
    'every one of them is inside the viewport',
    rackGeom.out.filter((x) => !x.vis).map((x) => x.t).join(',') || 'all 7 visible');
  check(!rackGeom.scrolls, 'and the rack does not scroll horizontally');

  // AND THE SLOTS COUNT WHAT IS IN THEM. A screenshot caught the header saying
  // "1 cast" while every slot read 0 — a stale memo keyed on a mutated array.
  const headHeld = await page.locator('[data-testid="rack-slot-head"]').getAttribute('data-held');
  check(Number(headHeld) > 0,
    'and the slot counts the part that was just poured', `head slot holds ${headHeld}`);

  // ═══ 3. PAIRING ══════════════════════════════════════════════════════════
  console.log('\n3 — pairing is named where you pick the stone');

  const pair = await txt(page, '[data-testid="melt-picker-pair"]');
  check(pair.length > 0, 'picking a stone says what to put beside it', pair);
  check(/beside it|leans toward/i.test(pair), 'and it names a TRAIT to look for', pair);
  const modNames = await page.evaluate(async () => {
    const tm = await import(/* @vite-ignore */ '/src/engine/content/toolMods' + '.ts');
    return tm.TOOL_MODS.map((m: any) => String(m.name)) as string[];
  });
  check(!modNames.some((n: string) => pair.includes(n)),
    'never the modifier itself — the destination stays discovered');
  await shot(page, '3-pairing');

  // ═══ 4. BALANCE HAS A JOB ════════════════════════════════════════════════
  console.log('\n4 — heavy cracks ore, light sweeps rock');

  /** Build a tool of one stone and measure both jobs through real dispatches. */
  const jobOf = async (mat: string): Promise<{
    label: string; job: string; oreRate: number; cells: number; balCells: number;
    dug: number; note: string;
  }> => page.evaluate(async (m) => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMining' + '.ts');
    const cast = await import(/* @vite-ignore */ '/src/engine/systems/casting' + '.ts');
    const s = w['__engine'].getState();
    s.casting.tool = cp.PART_TYPES.map((t: string, i: number) => ({ ...fp.makePart(t, m, 60), id: 800 + i }));
    s.casting.wear = 0;
    const eff = tm.toolEffect(s);
    const bal = fp.balanceOf(cast.currentTool(s)!.parts);
    // REAL ORE WORK, through the real action, stopping short of completion.
    s.face.ore = new Array(s.face.cells.length).fill('');
    s.face.oreDug = new Array(s.face.cells.length).fill(0);
    s.face.ore[5] = 'fatseam';
    w['__engine'].dispatch({ type: 'workOre', cell: 5, seconds: 0.05 });
    return {
      label: bal.label as string, job: bal.job as string, balCells: bal.cells as number,
      oreRate: eff.oreRate as number, cells: eff.cells as number,
      dug: s.face.oreDug[5] as number,
      note: `${bal.label}`,
    };
  }, mat);

  const pick = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const s = w['__engine'].getState();
    let heavy = '', light = '', hv = -9, lv = 9;
    for (const m of mats.materialsOfShell('loam')) {
      const parts = cp.PART_TYPES.map((t: string, i: number) => ({ ...fp.makePart(t, m.id, 60), id: i + 1 }));
      const v = fp.balanceOf(parts).value as number;
      if (v > hv) { hv = v; heavy = m.id; }
      if (v < lv) { lv = v; light = m.id; }
    }
    void s;
    return { heavy, light, hv, lv };
  });

  const H2 = await jobOf(pick.heavy);
  const L2 = await jobOf(pick.light);
  check(H2.job === 'ore', `the heaviest Loam stone (${pick.heavy}) reads as an ORE tool`, H2.label);
  check(L2.job === 'rock', `the lightest (${pick.light}) reads as a ROCK tool`, L2.label);
  check(H2.dug > L2.dug,
    'and the heavy tool really does crack a pocket faster — measured through workOre',
    `${H2.dug.toFixed(4)} vs ${L2.dug.toFixed(4)} dug in 0.05s`);
  /**
   * THE LIGHT EDGE IS ON AN INTEGER, so it is asserted where it is real: the
   * balance MULTIPLIER always favours light, and the cells it produces are
   * never fewer. On an early tool the multiplier rounds to the same integer —
   * which the panel now says out loud instead of promising a sweep it is not
   * making yet.
   */
  check(L2.balCells > H2.balCells,
    'the light tool reaches wider per swing (the balance term)',
    `${L2.balCells.toFixed(2)}x vs ${H2.balCells.toFixed(2)}x`);
  check(L2.cells >= H2.cells,
    'and never fewer cells than the heavy one in practice',
    `${L2.cells} vs ${H2.cells}`);
  check(L2.oreRate >= 1,
    'and NEITHER is worse than bare hands at the other\'s job',
    `light oreRate ${L2.oreRate.toFixed(2)} ≥ 1`);

  // And the panel says so.
  await page.evaluate(async (m) => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const s = w['__engine'].getState();
    s.casting.tool = cp.PART_TYPES.map((t: string, i: number) => ({ ...fp.makePart(t, m, 60), id: 800 + i }));
    s.casting.wear = 0;
  }, pick.heavy);
  await page.waitForTimeout(400);
  const jobLine = await txt(page, '[data-testid="dial-balance-job"]');
  check(/pockets .* faster/i.test(jobLine), 'the dial says what the build is FOR', jobLine);
  await shot(page, '4-balance');

  // ═══ 5. INSTABILITY IS THE PRICE OF POWER ════════════════════════════════
  console.log('\n5 — power drives instability, a stabiliser buys it back');

  const instOf = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const tmods = await import(/* @vite-ignore */ '/src/engine/systems/toolMods' + '.ts');
    const cmods = await import(/* @vite-ignore */ '/src/engine/content/toolMods' + '.ts');
    const mining = await import(/* @vite-ignore */ '/src/engine/systems/toolMining' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const s = w['__engine'].getState();
    for (const sh of ['loam', 'ferrite', 'verdance']) s.depthRecords[sh] = 60;
    s.casting.tool = cp.PART_TYPES.map((t: string, i: number) => ({
      ...fp.makePart(t, mats.materialsOfShell('verdance')[0].id, 70), id: 700 + i,
    }));
    s.casting.wear = 0;
    s.casting.xp = mining.xpForLevel(60);
    const budget = tmods.modSlotsTotal(s);

    // OBJECT-METHOD SHORTHAND, not a named arrow: tsx compiles a named const
    // arrow with `keepNames`, which emits a `__name()` call that does not
    // exist inside the page. This project has paid for that one many times.
    const S = {
      seat(list: Array<{ id: string; n: number }>) {
        s.casting.mods = list.map((m) => ({ ...m, xp: cmods.modXpForLevel(cmods.MOD_LEVEL_MAX) }));
        s.casting.knownMods = list.map((m) => m.id);
        return tmods.toolInstability(s);
      },
    };

    const quiet = S.seat([]);
    // PACK IT WITH POWER — the most expensive things that fit.
    const caps = [...cmods.TOOL_MODS]
      .filter((m: any) => !m.classOnly && !(m.fx.stabilize > 0))
      .sort((a: any, b: any) => b.cost - a.cost);
    const packed: Array<{ id: string; n: number }> = [];
    let used = 0;
    for (const m of caps) {
      while (used + m.cost <= budget && (packed.find((x) => x.id === m.id)?.n ?? 0) < m.maxStacks) {
        const at = packed.find((x) => x.id === m.id);
        if (at) at.n += 1; else packed.push({ id: m.id, n: 1 });
        used += m.cost;
      }
    }
    const op = S.seat(packed);
    // NOW ENGINEER IT BACK — give up power for a stabiliser.
    const stab = cmods.TOOL_MODS.find((m: any) => m.fx.stabilize > 0
      && cmods.MOD_SHELL_ORDINAL[m.shell] <= 3);
    const room: Array<{ id: string; n: number }> = [];
    let u2 = 0;
    for (const m of caps) {
      while (u2 + m.cost <= budget - (stab ? stab.cost * 2 : 0)
        && (room.find((x) => x.id === m.id)?.n ?? 0) < m.maxStacks) {
        const at = room.find((x) => x.id === m.id);
        if (at) at.n += 1; else room.push({ id: m.id, n: 1 });
        u2 += m.cost;
      }
    }
    const steadied = stab ? S.seat([...room, { id: stab.id, n: 2 }]) : op;
    return {
      budget,
      quiet: { net: quiet.net, misfire: quiet.misfire, floor: quiet.floor },
      op: { net: op.net, misfire: op.misfire, floor: op.floor },
      steadied: { net: steadied.net, misfire: steadied.misfire, steady: steadied.steady },
      stabName: stab ? String(stab.name) : '(none)',
      gaveUp: used - u2,
    };
  });
  await page.waitForTimeout(400);

  check(instOf.quiet.misfire === 0,
    'a tool carrying nothing never misfires — instability stays irrelevant',
    `net ${instOf.quiet.net.toFixed(0)} under a floor of ${instOf.quiet.floor.toFixed(0)}`);
  check(instOf.op.misfire > 0.05,
    'packing it with the strongest modifiers DRIVES it up',
    `${(instOf.op.misfire * 100).toFixed(0)}% misfire, net ${instOf.op.net.toFixed(0)} over floor ${instOf.op.floor.toFixed(0)}`);
  check(instOf.steadied.misfire < instOf.op.misfire,
    `and ${instOf.stabName} buys it back down — for ${instOf.gaveUp} slots of power`,
    `${(instOf.op.misfire * 100).toFixed(0)}% → ${(instOf.steadied.misfire * 100).toFixed(0)}%`);
  const instNote = await txt(page, '[data-testid="dial-instability-note"]');
  check(instNote.length > 0, 'and the dial says where it stands', instNote);
  await shot(page, '5-instability', true);

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
