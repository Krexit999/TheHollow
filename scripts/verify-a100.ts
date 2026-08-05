/**
 * A.100 DRIVEN IN THE REAL GAME — a safety primitive, a loadout, the remainder.
 *
 *   A  §23's opening, read FIRST on a reset state
 *   B  seven seats, each named, each holding a part — and outlines before that
 *   C  which seats are satisfiable, MEASURED not asserted
 *   D  a generation rule rewritten, and the world behaving differently after
 *   E  the axiom layer untouched: no Axiom reaches the ceiling slot
 *   F  seven parts seated and a world poured — through a HOLD, not a click
 *   G  a world authored at the Casting Floor, entered, and felt
 *   H  every list row NAMED — the twenty-three-blank-rows class
 *   I  dpsMax unmoved at equal depth with every one of them live
 *   J  the clone check, RED-TESTED
 *   K  380px, 0 overflow, panel HEIGHT bounded, 0 page errors
 *   L  A.98: A MODAL DISMISSED WITH THE RESET COUNT UNCHANGED
 *   M  A.98: the authored-Roll count, settled against `content/rolls.ts`
 *   N  A.98: a BANKED Axiom spent, and Seat IV satisfiable
 *   O  A.99: the tier table at three, with no unreachable row anywhere
 *   P  A.99: each new law slot read by something LIVE, and the world differing
 *   Q  A.99: a flood leaking into a machine, and the terraform paying nothing
 *   R  A.99: a crew assigned to a decision, walking a drift, made situational
 *   S  A.100: a stack RESERVED in one tap, and every consumer refusing by name
 *   T  A.100: the old Crusher pin gone, not doubled
 *   U  A.100: a crew carrying gear, and unable to swap it away from a REST
 *
 * NO NAMED FUNCTION MAY BE DECLARED INSIDE A `page.evaluate` BODY — esbuild's
 * `keepNames` rewrites `const f = () => {}` into `__name(...)`, which does not
 * exist in the page. It has cost six runs across A.90–A.96.
 *
 *   npx tsx scripts/verify-a100.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots-a100';
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

/** A player who has been everywhere once. Nothing seated, nothing written. */
const BEEN_EVERYWHERE = `
  const s = engine.getState();
  s.shell.breachCount = 6;
  for (const id of ['loam','ferrite','verdance','glassmere','cinder','hollow','aleph']) {
    s.depthRecords[id] = 9999;
  }
  s.maxDepthRecord = 9999;
  s.recursion.count = 1;
  s.currencies['axiom'] = s.currencies['axiom'].add(40);
  s.kiln.built = true;
  s.kiln.heat = 40;
  s.forge.built = true;
  s.drills.bayBuilt = true;
  s.stats.longestOfflineSec = 120;
  s.plant = s.plant || {};
  s.plant.surge = 99999;
  s.plant.tiers = s.plant.tiers || {};
  s.plant.tiers['axiomEngine'] = 3;   // MAX_MACHINE_TIER, corrected A.98
  s.plant.tiers['seating'] = 3;
  s.plant.tiers['crusher'] = 2;
  s.casting.rack = [];
  s.casting.nextId = 40000;
`;

/** ...and one who has the seven parts on the rack. */
const WITH_PARTS = `
  const s = engine.getState();
  const want = [
    ['core','deepgrave'], ['head','poleiron'], ['handle','heartwood'], ['edge','truelight'],
    ['binding','slagglass'], ['sockets','nothingstar'],
  ];
  s.casting.rack = [];
  let n = 41000;
  for (const [type, mat] of want) {
    s.casting.rack.push({ id: n++, type: type, materialId: mat, purity: 105 });
  }
  s.casting.nextId = n;
`;

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

  // ═══ A — §23, READ FIRST ═════════════════════════════════════════════════
  console.log('\n== A — the opening, on a state nothing has touched =============');
  await tab(page, 'dig');
  await dismiss(page);
  await page.waitForTimeout(400);
  const opening = await page.evaluate(async () => {
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { face: { cells: number[] }; depth: number };
    const m = new modsMod.ModifierCache(); m.invalidate();
    return {
      dps: Math.round((face.dpsMax(s, m) as { toNumber: () => number }).toNumber() * 100) / 100,
      cells: s.face.cells.length,
      depth: s.depth,
    };
  });
  check([opening.cells, opening.depth, opening.dps], [36, 0, 2.97], [0, 1, 0],
    'A — §23: 36 cells, depth 0, 2.97 dust/sec');

  // ═══ B — SEVEN OUTLINES, THEN SEVEN SEATS ════════════════════════════════
  console.log('\n== B — the frame: outlines first, then seven named seats =======');
  // A player at Breach 1 who has stood only on Loam's floor.
  await setup(page, `
    const s = engine.getState();
    s.shell.breachCount = 1;
    s.depthRecords['loam'] = 9999;
    // The Tool Station does not render at all without the Forge standing, so
    // this is fixture and not a claim — the frame it holds is block B's subject.
    s.kiln.built = true;
    s.forge.built = true;
  `);
  await tab(page, 'casting');
  await dismiss(page);
  await page.waitForTimeout(500);
  const outlines = await page.evaluate(() => {
    const out: Array<[string, string, string]> = [];
    for (const id of ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']) {
      const row = document.querySelector(`[data-testid="seat-${id}"]`);
      const name = row?.querySelector(`[data-testid="seat-${id}-name"]`)?.textContent ?? '';
      out.push([id, row?.getAttribute('data-known') ?? '?', name.trim()]);
    }
    return out;
  });
  check(outlines.map((o) => o[1]), ['1', '0', '0', '0', '0', '0', '0'], ['1', '1', '1', '1', '1', '1', '1'],
    'B — at Breach 1 only the Loam seat is known; six are outlines');
  check(outlines[3]![2], 'IV · —', 'IV · the edge',
    'B — an unknown seat is a numeral and a dash, with no material');
  const leaked = await page.evaluate(() =>
    (document.querySelector('[data-testid="seats-panel"]')?.textContent ?? '')
      .includes('Truelight'));
  check(leaked, false, true, 'B — and the material it wants is not on the screen anywhere');
  await page.locator('[data-testid="seats-panel"]').first()
    .screenshot({ path: `${OUT}/a100-seats-outlines.png` }).catch(() => {});

  await setup(page, BEEN_EVERYWHERE);
  await page.waitForTimeout(400);
  const named = await page.evaluate(() => {
    const out: Array<[string, string, string]> = [];
    for (const id of ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']) {
      out.push([
        id,
        document.querySelector(`[data-testid="seat-${id}-name"]`)?.textContent?.trim() ?? '',
        document.querySelector(`[data-testid="seat-${id}-material"]`)?.textContent?.trim() ?? '',
      ]);
    }
    return out;
  });
  check(named.map((n) => n[1]),
    ['I · the core', 'II · the head', 'III · the handle', 'IV · the edge',
      'V · the binding', 'VI · the sockets', 'VII · the grip'],
    ['', '', '', '', '', '', ''],
    'B — stood on every floor: seven seats, each named for its part');
  check(named.every((n) => n[2].length > 0), true, false,
    'B — ...and every one names its material');
  await page.locator('[data-testid="seats-panel"]').first()
    .screenshot({ path: `${OUT}/a100-seats-named.png` }).catch(() => {});

  // ═══ C — WHICH SEATS ARE SATISFIABLE BEFORE ALEPH ════════════════════════
  console.log('\n== C — which seats a Loam-to-Hollow player can satisfy =========');
  const reach = await page.evaluate(async () => {
    const seats = await import(/* @vite-ignore */ '/src/engine/systems/seats' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState();
    const out: Array<[string, string]> = [];
    for (const id of ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']) {
      out.push([id, String(seats.seatCondition(s, id) ?? 'satisfiable')]);
    }
    return out;
  });
  for (const [id, why] of reach) console.log(`        ${id}  ${why}`);
  check(reach.filter((r) => r[1].includes('author one')).map((r) => r[0]), ['V', 'VI', 'VII'],
    ['I'], 'C — V, VI and VII want a world you authored (§31); I–IV do not');
  check(reach.filter((r) => !r[1].includes('author one')).length, 4, 0,
    'C — the other four are satisfiable from their own shells');

  // ═══ D — A RULE REWRITTEN, AND THE WORLD DIFFERENT AFTER ═════════════════
  console.log('\n== D — a generation rule rewritten permanently =================');
  await tab(page, 'rewrite');
  await dismiss(page);
  await page.waitForTimeout(500);
  const before = await page.evaluate(async () => {
    const laws = await import(/* @vite-ignore */ '/src/engine/laws' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string } }>;
    const e = w['__engine']!;
    const s = e.getState();
    return {
      floor: laws.lawNum(s, 'regenFloorShare'),
      strokes: laws.lawNum(s, 'drillStrokes'),
      reverse: laws.lawFlag(s, 'kilnReverse'),
      kilnSays: String(e.dispatch({ type: 'setKilnReverse', on: true }).reason ?? ''),
    };
  });
  check([before.floor, before.strokes, before.reverse], [0, 1, false], [0.2, 2, true],
    'D — before: the slots read their bases, and nothing has been written');
  check(before.kilnSays.includes('only runs one way'), true, false,
    'D — ...and the Kiln refuses to run backwards, by name');

  const wrote = await page.locator('[data-testid="axiom-unemptying-write"]').first();
  check((await wrote.count()) > 0, true, false, 'D — the rule has a button in the real panel');
  if ((await wrote.count()) > 0) await wrote.click({ timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(300);
  const kilnBtn = page.locator('[data-testid="axiom-reverseKiln-write"]').first();
  if ((await kilnBtn.count()) > 0) await kilnBtn.click({ timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(300);

  const after = await page.evaluate(async () => {
    const laws = await import(/* @vite-ignore */ '/src/engine/laws' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean } }>;
    const e = w['__engine']!;
    const s = e.getState() as unknown as { recursion: { axioms: string[] } };
    return {
      owned: [...s.recursion.axioms].sort(),
      floor: laws.lawNum(s, 'regenFloorShare'),
      reverse: laws.lawFlag(s, 'kilnReverse'),
      kilnTakes: e.dispatch({ type: 'setKilnReverse', on: true }).ok,
    };
  });
  check(after.owned, ['reverseKiln', 'unemptying'], [],
    'D — two rules written from the real panel');
  check([after.floor, after.reverse], [0.2, true], [0, false],
    'D — ...and both reached their slots');
  check(after.kilnTakes, true, false,
    'D — THE WORLD BEHAVES DIFFERENTLY: the Kiln now runs backwards');
  await page.locator('[data-testid="axiom-panel"]').first()
    .screenshot({ path: `${OUT}/a100-axioms.png` }).catch(() => {});

  // ═══ E — THE AXIOM LAYER UNTOUCHED ═══════════════════════════════════════
  console.log('\n== E — no Axiom reaches the ceiling slot =======================');
  const heresy = await page.evaluate(async () => {
    const ax = await import(/* @vite-ignore */ '/src/engine/content/axioms' + '.ts');
    const laws = await import(/* @vite-ignore */ '/src/engine/laws' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { recursion: { axioms: string[] } };
    s.recursion.axioms = (ax.AXIOMS as Array<{ id: string }>).map((a) => a.id);
    return {
      count: (ax.AXIOMS as unknown[]).length,
      touching: (ax.AXIOMS as Array<{ slot: string }>).filter((a) => a.slot === 'regenCeilingMult').length,
      ceiling: laws.lawNum(s, 'regenCeilingMult'),
    };
  });
  check([heresy.touching, heresy.ceiling], [0, 1], [1, 1.15],
    `E — all ${heresy.count} Axioms live and the regen-ceiling slot is untouched`);

  // ═══ F — SEVEN PARTS SEATED, AND A WORLD POURED ══════════════════════════
  console.log('\n== F — seven parts seated, and a world poured ==================');
  await setup(page, BEEN_EVERYWHERE);
  await setup(page, WITH_PARTS);
  // Meet every condition the six cast seats ask for, and author a world so V-VII
  // are reachable at all.
  await setup(page, `
    const s = engine.getState();
    s.face.compaction = new Array(s.face.cells.length).fill(26);
    s.plant.tiers['refinery'] = 3;
    s.plant.tiers['prism'] = 3;
    s.plant.tiers['coil'] = 1;
    s.plant.tiers['retort'] = 1;
    s.prism = { intensity: [1,1,1,0,0,0] };
    s.polarity.chain = 99;
    s.cultivar = { beds: { nw: 'x' }, cropped: [], through: { nw: 9 } };
    s.witness = { residue: 0, hush: 0, named: [], fixed: 5000 };
    s.pressure.heat = 99;
    s.vents = { valves: [], line: null, answered: false };
    s.reading.proven = ['a','b','c','d'];
    s.delver.level = 60;
    s.spec = { bands: ['cinder','loam','hollow'], defect: 'hardwalls', live: true, poured: 1, learned: [] };
    s.shell.current = 'aleph';
    s.aleph.coreTouched = true;
    s.seating = { bequests: ['opendoor','brokenwall'], machine: null, poured: 0 };
    s.roll = s.roll || { rolled: {}, cleared: [], looted: [], rolls: 0 };
    s.roll.cleared = ['w1']; s.roll.looted = ['k1'];
  `);
  // SEAT II WANTS A FOUR-METAL POUR, and it gets a real one: four Ferrite
  // metals through the Crucible's own verb, not a flag set by hand.
  const alloy = await page.evaluate(async () => {
    const cru = await import(/* @vite-ignore */ '/src/engine/systems/crucible' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { plant: { tiers: Record<string, number> } };
    s.plant.tiers['crucible'] = 3;
    const metals = ['ironbloom', 'scalechip', 'greyflux', 'bloomrust'];
    for (const m of metals) forge.addMaterial(s, m, 60, 3);
    // `new Function` and not `() => {}`: esbuild's keepNames rewrites a named
    // arrow into `__name(...)`, which does not exist in the page. Seventh time.
    const c = { emit: new Function(''), dirty: new Function('') };
    const res = cru.pour(s, c, metals.map((m) => ({ materialId: m, count: 1 })));
    return { ok: (res as { ok: boolean }).ok, widest: cru.widestPour(s) as number };
  });
  check([alloy.ok, alloy.widest], [true, 4], [false, 0],
    'F — a real four-metal alloy poured through the Crucible, for Seat II');

  await tab(page, 'casting');
  await dismiss(page);
  await page.waitForTimeout(500);
  // Seat the six that come off the rack, through the real buttons.
  // AND THE INSTRUMENT SAYS WHAT IT DID. A silent loop of six clicks cannot
  // tell "seated six" from "seated one and skipped five", which is exactly the
  // ambiguity that cost this driver a round.
  const rackTrail: string[] = [];
  for (const id of ['I', 'II', 'III', 'IV', 'V', 'VI']) {
    const b = page.locator(`[data-testid="seat-${id}-seat"]`).first();
    const there = (await b.count()) > 0;
    const off = there ? await b.isDisabled().catch(() => true) : true;
    if (there && !off) {
      await b.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(150);
    }
    const left = await page.evaluate(() => ((window as unknown as Record<string, { getState: () => never }>)['__engine']!
      .getState() as unknown as { casting: { rack: unknown[] } }).casting.rack.length);
    rackTrail.push(`${id}:${there ? (off ? 'off' : 'clicked') : 'absent'}->${left}`);
  }
  console.log(`        rack trail  ${rackTrail.join('  ')}`);
  const rec = page.locator('[data-testid="record-make"]').first();
  if ((await rec.count()) > 0) await rec.click({ timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(250);
  const seven = page.locator('[data-testid="seat-VII-seat"]').first();
  if ((await seven.count()) > 0) await seven.click({ timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(300);

  const frame = await page.evaluate(async () => {
    const seats = await import(/* @vite-ignore */ '/src/engine/systems/seats' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { seats: { seated: Record<string, unknown> } };
    return {
      filled: Object.keys(s.seats?.seated ?? {}).sort(),
      all: seats.allSeven(s) as boolean,
      rackLeft: (w['__engine']!.getState() as unknown as { casting: { rack: unknown[] } }).casting.rack.length,
      rackHolds: ((w['__engine']!.getState() as unknown as
        { casting: { rack: Array<{ type: string; materialId: string }> } }).casting.rack)
        .map((r) => `${r.type}:${r.materialId}`),
    };
  });
  check(frame.filled, ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'], [],
    'F — SEVEN SEATS, each holding a part, all seated through the real buttons');
  console.log(`        rack holds  ${frame.rackHolds.join(' ')}`);
  check(frame.all, true, false, 'F — the frame is full: all seven seats hold a part');
  await page.locator('[data-testid="seats-panel"]').first()
    .screenshot({ path: `${OUT}/a100-seats-full.png` }).catch(() => {});

  await tab(page, 'rewrite');
  await dismiss(page);
  await page.waitForTimeout(500);
  const pourBtn = page.locator('[data-testid="seating-pour"]').first();
  const pourLabel = await pourBtn.textContent().catch(() => '');
  check((pourLabel ?? '').includes('POUR A WORLD'), true, false,
    'F — with seven seated the Seating offers the pour');
  // A.98 — AND IT WILL NOT TAKE A CLICK. The pour is a Recursion, so it holds.
  const recBeforeClick = await page.evaluate(() =>
    ((window as unknown as Record<string, { getState: () => { recursion: { count: number } } }>)['__engine']!
      .getState()).recursion.count);
  await pourBtn.click({ timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(400);
  const recAfterClick = await page.evaluate(() =>
    ((window as unknown as Record<string, { getState: () => { recursion: { count: number } } }>)['__engine']!
      .getState()).recursion.count);
  check(recAfterClick, recBeforeClick, recBeforeClick + 1,
    'F — a CLICK on the pour does nothing: the world only ends on a hold');
  const recBefore = await page.evaluate(() =>
    ((window as unknown as Record<string, { getState: () => { recursion: { count: number } } }>)['__engine']!
      .getState()).recursion.count);
  await pourBtn.hover().catch(() => {});
  await page.mouse.down();
  await page.waitForTimeout(2400);
  await page.mouse.up();
  await page.waitForTimeout(600);
  await dismiss(page);
  const poured = await page.evaluate(() => {
    const s = ((window as unknown as Record<string, { getState: () => never }>)['__engine']!
      .getState()) as unknown as {
        recursion: { count: number }; shell: { current: string };
        seating: { poured: number }; seats: { seated: Record<string, unknown> };
        roll: { looted: string[]; cleared: string[] };
      };
    return {
      count: s.recursion.count, shell: s.shell.current, poured: s.seating?.poured ?? 0,
      seats: Object.keys(s.seats?.seated ?? {}).length,
      looted: s.roll?.looted ?? [], cleared: s.roll?.cleared ?? [],
    };
  });
  check([poured.count, poured.shell, poured.poured], [recBefore + 1, 'loam', 1],
    [recBefore, 'aleph', 0],
    'F — A WORLD IS POURED: the same rung, once, and you are back in Loam');
  check(poured.seats, 7, 0, 'F — ...and the frame came with you');
  check([poured.looted, poured.cleared], [['k1'], ['w1']], [[], []],
    'F — ...and so did the two bequests');

  // ═══ G — A WORLD AUTHORED AT THE CASTING FLOOR, AND ENTERED ══════════════
  console.log('\n== G — a world authored at the Casting Floor, and entered ======');
  await setup(page, BEEN_EVERYWHERE);
  await setup(page, `
    const s = engine.getState();
    s.spec = { bands: [null,null,null], defect: null, live: false, poured: 0, learned: [] };
    s.roll = s.roll || { rolled: {}, cleared: [], looted: [], rolls: 1 };
    s.roll.rolls = 1;
    s.plant.condition = {};
  `);
  await tab(page, 'casting');
  await dismiss(page);
  await page.waitForTimeout(500);
  // THE GRAMMAR IS LEARNED BY BEING REFUSED. Try §31's own illegal arrangement.
  const bad = page.locator('[data-testid="band-0-hollow"]').first();
  check((await bad.count()) > 0, true, false, 'G — the Floor offers every shell for band 0');
  if ((await bad.count()) > 0) await bad.click({ timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(300);
  const learned = await page.evaluate(() => ({
    count: (document.querySelector('[data-testid="grammar-count"]')?.textContent ?? '').trim(),
    rows: Array.from(document.querySelectorAll('[data-testid="grammar-rows"] > div'))
      .map((n) => (n.textContent ?? '').trim()),
    band0: document.querySelector('[data-testid="band-0-shell"]')?.textContent?.trim() ?? '',
  }));
  check(learned.count, '1/3', '0/3',
    'G — the refusal IS the Codex entry: one grammar rule learned');
  check(learned.rows.some((r) => r.includes('absent from')), true, false,
    'G — ...and it is §31\'s own: absence needs something to be absent from');
  check(learned.band0, 'nothing yet', 'The Hollow', 'G — ...and the band stayed empty');

  for (const [band, shell] of [[0, 'cinder'], [1, 'loam'], [2, 'hollow']] as const) {
    const b = page.locator(`[data-testid="band-${band}-${shell}"]`).first();
    if ((await b.count()) > 0) await b.click({ timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(150);
  }
  const def = page.locator('[data-testid="defect-hardwalls"]').first();
  if ((await def.count()) > 0) await def.click({ timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(200);
  const wallBefore = await page.evaluate(async () => {
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { depth: number };
    s.depth = 44;
    return forge.requiredTier(s, 45) as number;
  });
  const specPour = page.locator('[data-testid="specify-pour"]').first();
  const specLabel = await specPour.textContent().catch(() => '');
  check((specLabel ?? '').includes('POUR IT'), true, false,
    'G — a complete specification offers the pour');
  await specPour.click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(500);

  const world = await page.evaluate(async () => {
    const sp = await import(/* @vite-ignore */ '/src/engine/systems/specify' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const cond = await import(/* @vite-ignore */ '/src/engine/systems/condition' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as {
      depth: number; shell: { current: string }; pressure: { heat: number };
      kiln: { built: boolean }; plant: { condition?: Record<string, { id: string }> };
    };
    s.depth = 20; s.pressure.heat = 90; s.kiln.built = true;
    const m = new modsMod.ModifierCache(); m.invalidate();
    for (let i = 0; i < 300; i++) cond.tickCondition(s, m, 1);
    return {
      live: sp.specLive(s) as boolean,
      standingIn: s.shell.current,
      physicsAt20: sp.physicsAt(s, 20) as string | null,
      physicsAt100: sp.physicsAt(s, 100) as string | null,
      wall: forge.requiredTier(s, 45) as number,
      kilnCondition: s.plant.condition?.['kiln']?.id ?? 'nothing',
    };
  });
  check([world.live, world.standingIn, world.physicsAt20, world.physicsAt100],
    [true, 'loam', 'cinder', 'hollow'], [false, 'loam', null, null],
    'G — A WORLD IS LIVE: standing in Loam, with Cinder shallow and the Hollow deep');
  check(world.wall, wallBefore + 1, wallBefore,
    'G — THE DEFECT BITES: every wall asks one hardness more');
  check(world.kilnCondition, 'baked', 'nothing',
    'G — AND THE PHYSICS ARE IN THE WRONG PLACE: a Loam Kiln BAKES at depth 20');
  await page.locator('[data-testid="specify-panel"]').first()
    .screenshot({ path: `${OUT}/a100-specify.png` }).catch(() => {});

  // ═══ H/I/J/K — the sweep ═════════════════════════════════════════════════
  console.log('\n== H — every list row is NAMED ================================');
  for (const [panel, sel] of [
    ['seats-panel', '[data-testid^="seat-"][data-known]'],
    ['axiom-panel', '[data-testid^="axiom-"][data-written]'],
    ['specify-panel', '[data-testid^="band-"]'],
  ] as const) {
    await tab(page, panel === 'axiom-panel' ? 'rewrite' : 'casting');
    await dismiss(page);
    await page.waitForTimeout(400);
    const blanks = await page.evaluate((s) => {
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll(s))) {
        if (!(el.textContent ?? '').trim()) out.push(el.getAttribute('data-testid') ?? '?');
      }
      return out.slice(0, 6);
    }, sel);
    check(blanks, [], ['x'], `H — every row in ${panel} carries text`);
  }

  console.log('\n== I — dpsMax unmoved with all of it live =====================');
  const ceiling = await page.evaluate(async () => {
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const ax = await import(/* @vite-ignore */ '/src/engine/content/axioms' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const stateMod = await import(/* @vite-ignore */ '/src/engine/state' + '.ts');
    const m = new modsMod.ModifierCache();
    const bare = stateMod.initialState(0) as unknown as { depth: number };
    bare.depth = 48;
    m.invalidate();
    const before = (face.dpsMax(bare, m) as { toNumber: () => number }).toNumber();

    const loaded = stateMod.initialState(0) as unknown as {
      depth: number; recursion: { axioms: string[] }; seats: unknown; seating: unknown; spec: unknown;
      shell: { breachCount: number }; upgrades: Record<string, number>;
    };
    loaded.depth = 48;                               // THE SAME DEPTH BOTH ARMS
    loaded.recursion.axioms = (ax.AXIOMS as Array<{ id: string }>).map((a) => a.id);
    loaded.seats = {
      seated: Object.fromEntries(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
        .map((i) => [i, { seat: i, materialId: 'record', purity: 105, atRecursion: 0 }])),
      known: [], record: true,
    };
    loaded.seating = { bequests: ['opendoor', 'brokenwall', 'longstair', 'standing'], machine: 'crusher', poured: 3 };
    loaded.spec = { bands: ['cinder', 'loam', 'hollow'], defect: 'halfdraw', live: true, poured: 2, learned: [] };
    m.invalidate();
    const after = (face.dpsMax(loaded, m) as { toNumber: () => number }).toNumber();

    loaded.upgrades['blade'] = 1;                    // the red arm
    m.invalidate();
    const moved = (face.dpsMax(loaded, m) as { toNumber: () => number }).toNumber();
    return { before, after, moved };
  });
  check(ceiling.after, ceiling.before, ceiling.before + 1,
    `I — dpsMax ${Math.round(ceiling.before * 100) / 100} at depth 48, with every seat, axiom, bequest and a poured world live`);
  check(ceiling.moved > ceiling.before, true, false,
    'I — ...and the harness CAN see a ceiling move (red-tested)');

  console.log('\n== J — the clone check, red-tested ===========================');
  const clones = await page.evaluate(async () => {
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const traits = await import(/* @vite-ignore */ '/src/engine/traits' + '.ts');
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const m of mats.MATERIALS as Array<{ id: string; shellId: string; rarity: string }>) {
      const key = `${m.shellId}|${m.rarity}|${(traits.traitsOf(m.id) as string[]).slice().sort().join(',')}`;
      const prev = seen.get(key);
      if (prev) {
        const a = fp.derivePart({ type: 'head', materialId: prev, purity: 60 });
        const b = fp.derivePart({ type: 'head', materialId: m.id, purity: 60 });
        if (JSON.stringify(a.stats) === JSON.stringify(b.stats)) dupes.push(`${prev}=${m.id}`);
      } else seen.set(key, m.id);
    }
    // RED TEST: the same stone against itself MUST read as a clone.
    const one = fp.derivePart({ type: 'head', materialId: 'marl', purity: 60 });
    const two = fp.derivePart({ type: 'head', materialId: 'marl', purity: 60 });
    return { dupes: dupes.slice(0, 6), redTest: JSON.stringify(one.stats) === JSON.stringify(two.stats) };
  });
  check(clones.redTest, true, false, 'J — the clone check can SEE a clone (red-tested)');
  console.log(`        ${clones.dupes.length === 0 ? 'no new clone classes' : `clone classes: ${clones.dupes.join(' ')}`}`);

  console.log('\n== K — 380px, panel height, page errors ======================');
  for (const [t, id] of [
    ['casting', 'seats-panel'], ['casting', 'specify-panel'],
    ['rewrite', 'axiom-panel'], ['rewrite', 'seating-panel'],
  ] as const) {
    await tab(page, t);
    await dismiss(page);
    await page.waitForTimeout(400);
    const el = page.locator(`[data-testid="${id}"]`).first();
    const there = (await el.count()) > 0;
    check(there, true, false, `K — ${id} is on the screen`);
    if (!there) continue;
    const box = await el.evaluate((n) => {
      const r = n.getBoundingClientRect();
      return { h: Math.round(r.height), w: Math.round(r.width) };
    });
    check(box.h < 1400, true, false, `K — ${id} is ${box.h}px tall, not a wall`);
    check(box.w <= W, true, false, `K — ${id} is ${box.w}px wide, inside 380`);
    await el.screenshot({ path: `${OUT}/a100-${id}.png` }).catch(() => {});
  }

  const overflow = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.left < -1 || r.right > window.innerWidth + 1)) {
        const par = el.parentElement;
        out.push(`${el.tagName}.${(el.className || '').toString().slice(0, 24)}` +
          ` ${Math.round(r.left)}..${Math.round(r.right)}` +
          ` in ${par?.tagName}.${(par?.className || '').toString().slice(0, 30)}` +
          ` [${par?.getAttribute('data-testid') ?? '-'}]`);
      }
    }
    return out.slice(0, 6);
  });
  // A CENSUS, so the next run starts with data rather than a class name. The
  // one overflow this driver finds is a CANVAS, and A.97 mounts none — every
  // panel it built is plain HTML and measured above.
  const canvases = await page.evaluate(() => Array.from(document.querySelectorAll('canvas')).map((n) => {
    const r = n.getBoundingClientRect();
    const par = n.parentElement;
    return `${Math.round(r.width)}w style=${n.style.width || '-'} attr=${n.width}` +
      ` parent=${Math.round(par?.getBoundingClientRect().width ?? 0)}w` +
      ` [${par?.parentElement?.getAttribute('data-testid') ?? par?.parentElement?.className?.toString().slice(0, 30) ?? '-'}]`;
  }));
  console.log(`        canvases  ${canvases.join('  |  ')}`);
  check(overflow, [], ['x'], 'K — nothing overflows 380px');
  check(errors, [], ['x'], 'K — no page errors');

  // ═══ L — A MODAL DISMISSED, AND THE RESET COUNT UNCHANGED ════════════════
  console.log('\n== L — dismiss a modal without ending the world ================');
  await setup(page, BEEN_EVERYWHERE);
  // The Core card only renders where the Core is, and only once it is touched.
  await setup(page, 'const s = engine.getState(); s.shell.current = "aleph"; s.aleph.coreTouched = true;');
  await tab(page, 'rewrite');
  await page.waitForTimeout(400);
  const recCount = () => page.evaluate(() =>
    ((window as unknown as Record<string, { getState: () => { recursion: { count: number } } }>)['__engine']!
      .getState()).recursion.count);
  const recBefore98 = await recCount();
  // Run the very helper that used to fire the third reset layer on this tab.
  await dismiss(page);
  await page.waitForTimeout(400);
  check(await recCount(), recBefore98, recBefore98 + 1,
    'L — dismiss() ran and the Recursion count did NOT move');

  const recBtn = page.getByRole('button', { name: /^Begin again, knowing/ }).first();
  const haveRec = (await recBtn.count()) > 0;
  if (!haveRec) {
    // AN INSTRUMENT THAT CANNOT NAME ITS OWN FAILURE PRODUCES CONFIDENT WRONG
    // ANSWERS. Say what IS on screen instead of just what is not.
    const seen = await page.evaluate(() => ({
      shell: ((window as unknown as Record<string, { getState: () => never }>)['__engine']!
        .getState() as unknown as { shell: { current: string }; aleph: { coreTouched: boolean } }),
      tab: (window as unknown as Record<string, { getState: () => { tab: string } }>)['__ui']?.getState().tab,
      buttons: Array.from(document.querySelectorAll('button'))
        .map((n) => (n.textContent ?? '').trim().slice(0, 40)).filter(Boolean).slice(0, 14),
    }));
    console.log(`        on screen: tab=${seen.tab} shell=${seen.shell.shell.current}`
      + ` touched=${seen.shell.aleph.coreTouched}`);
    console.log(`        buttons: ${seen.buttons.join(' | ')}`);
  }
  check(haveRec, true, false, 'L — the RECURSION control is on screen');
  if (haveRec) {
    await recBtn.click({ timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(400);
    check(await recCount(), recBefore98, recBefore98 + 1,
      'L — ...and a CLICK on it does nothing: the Recursion holds now');
    // RED ARM: a HOLD still ends the world, so this is a confirmation, not a wall.
    await recBtn.hover().catch(() => {});
    await page.mouse.down();
    await page.waitForTimeout(2400);
    await page.mouse.up();
    await page.waitForTimeout(700);
    await dismiss(page);
    check(await recCount(), recBefore98 + 1, recBefore98,
      'L — ...and a HOLD does end it: a confirmation, not a wall');
  }

  // ═══ M — THE AUTHORED-ROLL COUNT, SETTLED ════════════════════════════════
  console.log('\n== M — how many Rolls are authored, read off the registry =======');
  const rolls = await page.evaluate(async () => {
    const r = await import(/* @vite-ignore */ '/src/engine/content/rolls' + '.ts');
    const sh = await import(/* @vite-ignore */ '/src/engine/shells' + '.ts');
    const all = r.allAuthoredStations() as Array<{ shellId: string }>;
    const by: Record<string, number> = {};
    for (const one of all) by[one.shellId] = (by[one.shellId] ?? 0) + 1;
    const shells = (sh.allShells() as Array<{ id: string }>).map((x) => x.id);
    return {
      total: all.length,
      shells: shells.length,
      empty: shells.filter((id) => !by[id]),
      per: shells.map((id) => `${id}:${by[id] ?? 0}`),
    };
  });
  console.log(`        ${rolls.per.join('  ')}`);
  check(rolls.empty, [], ['loam'],
    `M — all ${rolls.shells} shells have an authored Roll (${rolls.total} stations)`);
  check(rolls.total > 100, true, false, 'M — ...and it is a geography, not a stub');

  // ═══ N — A BANKED AXIOM SPENT, AND SEAT IV SATISFIABLE ═══════════════════
  console.log('\n== N — the bank, and the seat that could not be filled ==========');
  await setup(page, BEEN_EVERYWHERE);
  const bank = await page.evaluate(async () => {
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const ax = await import(/* @vite-ignore */ '/src/engine/systems/axiomEngine' + '.ts');
    const laws = await import(/* @vite-ignore */ '/src/engine/laws' + '.ts');
    const w = window as unknown as Record<string, {
      getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string };
    }>;
    const e = w['__engine']!;
    const s = e.getState() as unknown as {
      shell: { current: string };
      currencies: Record<string, { toNumber: () => number; add: (n: number) => unknown }>;
      plant: { tiers: Record<string, number> };
      casting: { rack: unknown[]; nextId: number };
      recursion: { axioms: string[] };
    };
    // A RETURNING PLAYER: a bank, and no looted wreck. That is the normal state
    // after a Recursion, because it KEEPS the bank and WASHES the Roll.
    s.plant.tiers['axiomEngine'] = 0;
    s.currencies['axiom'] = s.currencies['axiom']!.add(9) as never;
    s.recursion.axioms = [];
    s.shell.current = 'aleph';
    const banked = (s.currencies['axiom'] as unknown as { toNumber: () => number }).toNumber();
    const beforeFound = ax.axiomEngineFound(s) as boolean;
    const at = ax.axiomStation() as { depth: number; name: string };
    roll.markReached(s, at.depth, 15);
    for (let i = 0; i < 3; i++) {
      s.casting.rack.push({ id: s.casting.nextId++, type: 'core', materialId: 'marl', purity: 50 });
    }
    const built = e.dispatch({ type: 'buildAxiomEngine' });
    const wrote = e.dispatch({ type: 'writeRule', axiomId: 'unemptying' });
    const now = e.getState() as unknown as { currencies: Record<string, { toNumber: () => number }> };
    return {
      banked, beforeFound, station: at.name,
      built: built.ok, wrote: wrote.ok, why: String(wrote.reason ?? ''),
      spent: banked - now.currencies['axiom']!.toNumber(),
      floor: laws.lawNum(e.getState(), 'regenFloorShare') as number,
    };
  });
  check([bank.beforeFound, bank.built, bank.wrote], [false, true, true], [true, false, false],
    `N — a banked Axiom is spendable: ${bank.station} unlooted, then built, then written`);
  check([bank.spent, bank.floor], [1, 0.2], [0, 0],
    'N — ...one Axiom left the bank and the law slot moved');

  const seatIV = await page.evaluate(async () => {
    const seats = await import(/* @vite-ignore */ '/src/engine/systems/seats' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as {
      plant: { tiers: Record<string, number> }; prism: { intensity: number[] }; spec: unknown;
    };
    s.spec = { bands: ['cinder', 'loam', 'hollow'], defect: 'hardwalls', live: true, poured: 1, learned: [] };
    s.plant.tiers['prism'] = 1;
    const shallow = String(seats.seatCondition(s, 'IV') ?? 'satisfiable');
    s.plant.tiers['prism'] = 3;
    s.prism = { intensity: [0, 1, 1, 1, 0, 0] };
    const noWhite = String(seats.seatCondition(s, 'IV') ?? 'satisfiable');
    s.prism = { intensity: [1, 1, 1, 0, 0, 0] };
    return { shallow, noWhite, full: String(seats.seatCondition(s, 'IV') ?? 'satisfiable') };
  });
  console.log(`        tier I    ${seatIV.shallow}`);
  console.log(`        no white  ${seatIV.noWhite}`);
  check(seatIV.full, 'satisfiable', seatIV.noWhite,
    'N — SEAT IV IS SATISFIABLE: white in the beam, every point spent');

  // ═══ O — THE TIER TABLE AT THREE, AND NOTHING ABOVE IT ═══════════════════
  console.log('\n== O — three tiers, and no row nobody can reach =================');
  const ladders = await page.evaluate(async () => {
    const plant = await import(/* @vite-ignore */ '/src/engine/systems/plant' + '.ts');
    const mods: Array<[string, Record<string, unknown>]> = [];
    for (const name of ['axiomEngine', 'seating', 'frame', 'prism', 'crusher', 'retort']) {
      mods.push([name, await import(/* @vite-ignore */ `/src/engine/systems/${name}.ts`)]);
    }
    const rows: Array<[string, number]> = [];
    for (const [name, m] of mods) {
      for (const [k, v] of Object.entries(m)) {
        if (k.startsWith('TIER_CAPABILITY') && Array.isArray(v)) rows.push([`${name}.${k}`, v.length]);
      }
    }
    return { cap: plant.MAX_MACHINE_TIER as number, rows };
  });
  console.log(`        ${ladders.rows.map((r) => `${r[0].split('.')[1]}:${r[1]}`).join('  ')}`);
  check(ladders.cap, 3, 5, 'O — MAX_MACHINE_TIER is 3');
  check(ladders.rows.filter((r) => r[1] !== ladders.cap + 1).map((r) => r[0]), [],
    ['axiomEngine.TIER_CAPABILITY_AXIOM'],
    `O — every ladder is exactly ${ladders.cap + 1} rows ('not built' plus I–III)`);
  check(ladders.rows.length > 4, true, false, 'O — ...and it really read the ladders');

  // ═══ P — THE TWO SLOTS THAT EARNED A READER ══════════════════════════════
  console.log('\n== P — a law slot with a live reader, and the world differing ===');
  const laws = await page.evaluate(async () => {
    const runes = await import(/* @vite-ignore */ '/src/engine/content/shell4/runes' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const combo = (runes.TEMPORAL_COMBOS as Array<{ id: string; runes: string[] }>)
      .find((c) => c.id === 'longfall')!;
    const backwards = [...combo.runes].reverse();
    const out: Record<string, unknown> = {};

    // THE PALINDROME — carve the progression backwards, twice over.
    for (const axioms of [[], ['palindrome']]) {
      const s = w['__engine']!.getState() as unknown as {
        recursion: { axioms: string[] }; runes: { temporalFound?: string[]; carveTrail?: unknown[] };
        stats: { playTimeSec: number };
      };
      s.recursion.axioms = axioms as string[];
      s.runes.temporalFound = [];
      s.runes.carveTrail = [];
      s.stats.playTimeSec = 0;
      for (const r of backwards) {
        s.stats.playTimeSec += (runes.TEMPORAL_MIN_GAP as number) + 1;
        runes.logCarve(s, { emit: Function.prototype, dirty: Function.prototype }, r);
      }
      out[axioms.length ? 'written' : 'bare'] = [...(s.runes.temporalFound ?? [])];
    }
    return out;
  });
  check([(laws['bare'] as string[]).includes('longfall'), (laws['written'] as string[]).includes('longfall')],
    [false, true], [true, false],
    'P — THE PALINDROME: a progression carved backwards counts only with the law');

  const mantle = await page.evaluate(async () => {
    const w = window as unknown as Record<string, {
      getState: () => never; dispatch: (a: unknown) => unknown;
    }>;
    const out: number[] = [];
    for (const axioms of [[], ['greenmantle']]) {
      const s = w['__engine']!.getState() as unknown as {
        shell: { current: string }; recursion: { axioms: string[] };
        growth: { stage: number[]; fruit: number[]; age: number[]; fullSince: number[] };
        face: { cells: number[] };
      };
      s.shell.current = 'verdance';
      s.recursion.axioms = axioms as string[];
      const n = s.face.cells.length;
      s.growth.stage = new Array(n).fill(0);
      s.growth.fruit = new Array(n).fill(0);
      s.growth.age = new Array(n).fill(0);
      s.growth.fullSince = new Array(n).fill(0);
      s.growth.stage[0] = 3;
      s.growth.fruit[0] = 50;
      s.face.cells[0] = 8;
      w['__engine']!.dispatch({ type: 'chip', cell: 0 });
      out.push((w['__engine']!.getState() as unknown as { growth: { stage: number[] } }).growth.stage[0]!);
    }
    return out;
  });
  check(mantle, [0, 1], [0, 0],
    'P — THE GREEN MANTLE: a harvested cell comes back vined only with the law');

  // ═══ Q — A FLOOD LEAKING, AND PAYING NOTHING ═════════════════════════════
  console.log('\n== Q — the leak, and the terraform that still buys certainty ====');
  const leak = await page.evaluate(async () => {
    const cond = await import(/* @vite-ignore */ '/src/engine/systems/condition' + '.ts');
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as {
      shell: { current: string }; depth: number; pressure: { heat: number };
      plant: { tiers: Record<string, number>; condition?: Record<string, unknown> };
      roll: { flooded: string[] }; upgrades: Record<string, number>;
    };
    s.shell.current = 'cinder';
    s.plant.tiers['crusher'] = 1;
    s.plant.condition = {};
    s.roll.flooded = [];
    /**
     * CLEAR THE POURED WORLD. Block G pours a specified world and leaves it
     * LIVE, and `conditionShellId` reads `physicsAt(depth)` before the shell —
     * which is §31.2 working exactly as designed. So without this the Cinder
     * rule was not the rule in force at depth 100 and the leak had nothing to
     * bake. A fixture fault, and the check now reports the rule it resolved so
     * the next one names itself.
     */
    (s as unknown as { spec?: unknown }).spec = undefined;
    s.pressure.heat = (cond.BAKE_HEAT as number) - (cond.LEAK_PER_STATION as number) + 2;

    const stations = roll.shellRoll(s) as Array<{ id: string; depth: number }>;
    const near = [...stations].sort((a, b) => Math.abs(a.depth - 100) - Math.abs(b.depth - 100))[0]!;
    s.depth = near.depth;
    const m = new modsMod.ModifierCache();

    // Arm 1: hot-ish shaft, nothing drowned. Under the line.
    const dry = cond.leakedHeat(s) as number;
    for (let i = 0; i < 240; i++) cond.tickCondition(s, m, 1);
    const dryCond = cond.conditionOf(s, 'crusher');

    // dpsMax read BEFORE, at this depth.
    m.invalidate();
    const dpsBefore = (face.dpsMax(s, m) as { toNumber: () => number }).toNumber();

    // Arm 2: same shaft, one station drowned in the band underfoot.
    s.plant.condition = {};
    s.roll.flooded.push(near.id);
    const wet = cond.leakedHeat(s) as number;
    const reach = (cond.leakingStations(s) as string[]).length;
    for (let i = 0; i < 240; i++) cond.tickCondition(s, m, 1);
    const wetCond = cond.conditionOf(s, 'crusher') as { id: string } | null;

    s.depth = near.depth;                       // THE SAME DEPTH BOTH ARMS
    m.invalidate();
    const dpsAfter = (face.dpsMax(s, m) as { toNumber: () => number }).toNumber();
    s.upgrades['blade'] = 1;
    m.invalidate();
    const dpsRed = (face.dpsMax(s, m) as { toNumber: () => number }).toNumber();
    s.upgrades['blade'] = 0;
    return {
      dry, wet, reach, station: near.id,
      rule: (cond.ruleFor(s.shell.current) as { id: string } | null)?.id ?? 'none',
      dryBaked: dryCond !== null, wetBaked: wetCond?.id ?? null,
      dpsBefore, dpsAfter, dpsRed, shaft: s.pressure.heat,
    };
  });
  console.log(`        shaft ${leak.shaft} · dry reads ${leak.dry}`
    + ` · with ${leak.reach} drowned reads ${leak.wet} · rule ${leak.rule}`);
  check([leak.dryBaked, leak.wetBaked], [false, 'baked'], [true, null],
    'Q — the leak BAKES a machine the shaft alone would not');
  check(leak.dpsAfter, leak.dpsBefore, leak.dpsBefore + 1,
    'Q — ...and the terraform pays NOTHING: dpsMax unmoved at the same depth');
  check(leak.dpsRed !== leak.dpsBefore, true, false,
    'Q — (red arm: the instrument can see a ceiling move)');

  // ═══ R — A CREW, ASSIGNED AND WALKING ════════════════════════════════════
  console.log('\n== R — a crew walks a drift you timbered ========================');
  await setup(page, `
    const s = engine.getState();
    s.roll = s.roll || {};
    s.roll.rolled = s.roll.rolled || {};
    s.roll.cleared = []; s.roll.looted = []; s.roll.shored = []; s.roll.flooded = [];
    s.roll.rolls = 0;
    s.crews = { crews: [], nextId: 1, resolved: 0 };
  `);
  const crew = await page.evaluate(async () => {
    const crews = await import(/* @vite-ignore */ '/src/engine/systems/crews' + '.ts');
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const w = window as unknown as Record<string, {
      getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string };
    }>;
    const e = w['__engine']!;
    const s = e.getState() as unknown as {
      roll: { shored: string[]; rolled: Record<string, unknown> };
      currencies: Record<string, { toString: () => string }>;
      materials: { stacks: Record<string, unknown>; totalDrops: number };
    };
    const stops = [...(roll.shellRoll(s) as Array<{ id: string; depth: number; type: string; seams?: string[] }>)]
      .sort((a, b) => a.depth - b.depth);

    // NO DRIFT, NO CREW — shoring is the gate, and it says so.
    const ungated = String(crews.crewBlocker(s, stops[3]!.id) ?? '');
    s.roll.shored.push(stops[3]!.id);
    const gated = crews.crewBlocker(s, stops[3]!.id);
    const sent = e.dispatch({ type: 'dispatchCrew', driftId: stops[3]!.id });

    const before = JSON.stringify(
      Object.entries(s.currencies).map(([k, v]) => [k, v.toString()]).sort());
    const stacksBefore = JSON.stringify(s.materials.stacks);
    const dropsBefore = s.materials.totalDrops;

    for (let i = 0; i < (crews.STATION_SEC as number) * 30; i++) {
      crews.tickCrews(s, { emit: Function.prototype, dirty: Function.prototype }, 1);
    }
    const rows = (crews.crewsRead(s) as { rows: Array<{ at: string; findings: unknown[] }> }).rows;

    // THE CIRCUIT MAKES IT SITUATIONAL: the same station, two circuits.
    const c = (crews.ensureCrews(s) as { crews: Array<{ reads: string[] }> }).crews[0]!;
    const seamed = stops.find((d) => (d.seams ?? []).length > 0 && d.type === 'seam')!;
    s.roll.rolled[seamed.id] = { seam: seamed.seams![0]!, feature: 'plain', hazard: 0 };
    c.reads = [];
    const blind = crews.findingAt(s, c, seamed) as { kind: string; line: string } | null;
    c.reads = ['seam'];
    const sighted = crews.findingAt(s, c, seamed);

    return {
      ungated, gated, sent: sent.ok,
      at: rows[0]?.at ?? '', found: rows[0]?.findings.length ?? 0,
      purseSame: JSON.stringify(
        Object.entries(s.currencies).map(([k, v]) => [k, v.toString()]).sort()) === before,
      stacksSame: JSON.stringify(s.materials.stacks) === stacksBefore,
      dropsSame: s.materials.totalDrops === dropsBefore,
      blindKind: blind?.kind ?? null,
      blindNamesTheStone: (blind?.line ?? '').includes(seamed.seams![0]!),
      sightedIsNull: sighted === null,
    };
  });
  check([crew.ungated.includes('timbered'), crew.gated, crew.sent], [true, null, true],
    [false, 'x', false], 'R — no drift no crew; timbered, one goes down');
  console.log(`        ${crew.at} · ${crew.found} finding(s)`);
  check(crew.found > 0, true, false, 'R — it walked the drift and brought findings back');
  check([crew.purseSame, crew.stacksSame, crew.dropsSame], [true, true, true],
    [false, false, false], 'R — ITEM 11: it produced NOTHING — no purse, no stack, no drop');
  check([crew.blindKind, crew.blindNamesTheStone, crew.sightedIsNull], ['call', false, true],
    [null, true, false], 'R — the Circuit makes it situational, and a blind crew cannot name the stone');
  // THE PANEL HAS TO BE ON SCREEN TO HAVE ROWS. R drove the engine directly, so
  // nothing had navigated to the room the crews live in.
  await tab(page, 'shaft');
  await page.waitForTimeout(500);
  await page.locator('[data-testid="crews-panel"]').first()
    .screenshot({ path: `${OUT}/a100-crews.png` }).catch(() => {});

  // ...and every row in the crew panel is NAMED — the blank-rows class.
  const crewRows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="crew-"]'))
      .filter((n) => /crew-\d+$/.test(n.getAttribute('data-testid') ?? ''))
      .map((n) => (n.querySelector('[data-testid$="-name"]')?.textContent ?? '').trim()));
  check(crewRows.length > 0 && crewRows.every((n) => n.length > 0), true, false,
    'R — every crew row is named');

  // ═══ S — RESERVED IN ONE TAP, AND EVERY CONSUMER REFUSING ════════════════
  console.log('\n== S — one tap, and fourteen machines will not touch it =========');
  await setup(page, `
    const s = engine.getState();
    s.spec = undefined;                       // no poured world across blocks
    s.qol.pins = [];
    s.forge.built = true;
    s.kiln.built = true;
    s.plant = s.plant || {};
    s.plant.tiers = s.plant.tiers || {};
    for (const m of ['crusher','washer','centrifuge','still','infuser','press',
                     'balance','retort','witness','crucible','refinery']) {
      s.plant.tiers[m] = 3;
    }
  `);
  await page.evaluate(async () => {
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    forge.addMaterial(w['__engine']!.getState(), 'marl', 50, 40);
  });
  await tab(page, 'hold');
  await dismiss(page);
  await page.waitForTimeout(500);

  // ONE TAP, through the real control.
  const star = page.locator('[data-testid="reserve-marl"]').first();
  const haveStar = (await star.count()) > 0;
  check(haveStar, true, false, 'S — the Hold offers a reserve control on the stack');
  if (haveStar) {
    await star.click();
    await page.waitForTimeout(300);
  }
  const reservedNow = await page.evaluate(async () => {
    const res = await import(/* @vite-ignore */ '/src/engine/systems/reserve' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    return res.isReserved(w['__engine']!.getState(), 'marl') as boolean;
  });
  check(reservedNow, true, false, 'S — ONE TAP reserved it');

  // ...and now every consumer refuses, by name.
  const refusals = await page.evaluate(async () => {
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState();
    const noop = { emit: Function.prototype, dirty: Function.prototype };
    const mods = ['crusher', 'washer', 'centrifuge', 'still', 'infuser', 'press',
      'balance', 'retort', 'witness', 'crucible', 'casting'];
    const m: Record<string, Record<string, unknown>> = {};
    for (const name of mods) {
      m[name] = await import(/* @vite-ignore */ `/src/engine/systems/${name}.ts`);
    }
    const said: Array<[string, string]> = [];
    said.push(['the Crusher', String((m['crusher']!['crush'] as never as
      (a: unknown, b: unknown, c: string, d: string) => { reason?: string })(s, noop, 'marl', 'poor').reason ?? '')]);
    said.push(['the Washer', String((m['washer']!['washBlocker'] as never as
      (a: unknown, b: string, c: string) => string | null)(s, 'marl', 'poor') ?? '')]);
    said.push(['the Centrifuge', String((m['centrifuge']!['spinBlocker'] as never as
      (a: unknown, b: string, c: string) => string | null)(s, 'marl', 'poor') ?? '')]);
    said.push(['the Still', String((m['still']!['distilBlocker'] as never as
      (a: unknown, b: string, c: string, d: string) => string | null)(s, 'marl', 'poor', 'keen') ?? '')]);
    said.push(['the Infuser', String((m['infuser']!['infuseBlocker'] as never as
      (a: unknown, b: unknown, c: string, d: string) => string | null)(s, { trait: 'keen', purity: 50 }, 'marl', 'poor') ?? '')]);
    said.push(['the Press', String((m['press']!['pressBlocker'] as never as
      (a: unknown, b: string, c: string, d: string) => string | null)(s, 'marl', 'poor', 'plate') ?? '')]);
    said.push(['the Balance', String((m['balance']!['balanceBlocker'] as never as
      (a: unknown, b: string, c: string, d: number) => string | null)(s, 'marl', 'grit', 1) ?? '')]);
    said.push(['the Retort', String((m['retort']!['reduceBlocker'] as never as
      (a: unknown, b: string, c: string) => string | null)(s, 'marl', 'poor') ?? '')]);
    said.push(['the Witness', String((m['witness']!['witnessBlocker'] as never as
      (a: unknown, b: string, c: string, d: string) => string | null)(s, 'marl', 'poor', 'grit') ?? '')]);
    said.push(['the Crucible', String((m['crucible']!['pourBlocker'] as never as
      (a: unknown, b: unknown) => string | null)(s, [{ materialId: 'marl', count: 2 }]) ?? '')]);
    said.push(['the melt', String((m['casting']!['chargeCrucible'] as never as
      (a: unknown, b: unknown, c: string, d: number) => { reason?: string })(s, noop, 'marl', 1).reason ?? '')]);
    return said;
  });
  for (const [who, said] of refusals) {
    console.log(`        ${who.padEnd(16)} ${said}`);
  }
  check(refusals.filter((r) => !/Marl is reserved/.test(r[1])).map((r) => r[0]), [],
    ['the Crusher'], `S — all ${refusals.length} consumers refuse BY NAME`);
  check(refusals.length >= 11, true, false, 'S — ...and it really asked every one of them');

  // THE PICKER never offers it, so the Circuit does not burn a cycle refusing.
  const picker = await page.evaluate(async () => {
    const cr = await import(/* @vite-ignore */ '/src/engine/systems/crusher' + '.ts');
    const res = await import(/* @vite-ignore */ '/src/engine/systems/reserve' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState();
    const held = (cr.crushable(s) as Array<{ materialId: string }>).some((c) => c.materialId === 'marl');
    res.toggleReserve(s, 'marl');
    const free = (cr.crushable(s) as Array<{ materialId: string }>).some((c) => c.materialId === 'marl');
    res.toggleReserve(s, 'marl');
    return { held, free };
  });
  check([picker.held, picker.free], [false, true], [true, false],
    'S — the Crusher picker skips it entirely, and offers it again once released');
  await page.locator('[data-testid="reserved-strip"]').first()
    .screenshot({ path: `${OUT}/a100-reserved.png` }).catch(() => {});

  // ═══ T — THE PIN IS REPLACED, NOT DOUBLED ════════════════════════════════
  console.log('\n== T — one flag, not two ========================================');
  const oneFlag = await page.evaluate(async () => {
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { qol: Record<string, unknown> };
    // A second array on qol would be the doubled flag the brief forbids.
    const arrays = Object.entries(s.qol)
      .filter(([, v]) => Array.isArray(v))
      .map(([k]) => k)
      .filter((k) => /pin|reserv/i.test(k));
    return arrays;
  });
  check(oneFlag, ['pins'], ['pins', 'reserved'],
    'T — exactly one reserve array on qol, and it is the one that was there');

  // ═══ U — A CREW CARRYING GEAR ════════════════════════════════════════════
  console.log('\n== U — the loadout, and the REST rule it cannot get around ======');
  const loadout = await page.evaluate(async () => {
    const crews = await import(/* @vite-ignore */ '/src/engine/systems/crews' + '.ts');
    const gear = await import(/* @vite-ignore */ '/src/engine/systems/gear' + '.ts');
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as {
      roll: { shored: string[]; flooded: string[] }; depth: number;
      gear: { worn: Record<string, string>; owned: string[] };
      crews?: unknown;
    };
    (s as unknown as { crews?: unknown }).crews = { crews: [], nextId: 1, resolved: 0 };
    s.roll.shored = [];
    s.gear = { worn: {}, owned: ['ashlamp', 'marchboots'] };

    const stops = [...(roll.shellRoll(s) as Array<{ id: string; depth: number; type: string }>)]
      .sort((a, b) => a.depth - b.depth);
    const rest = stops.find((d) => d.type === 'rest')!;

    // AWAY FROM A REST: the swap is refused, and it says where to go.
    s.depth = 9999;
    const away = gear.equipGear(s, 'ashlamp', 'lamp') as { ok: boolean; reason?: string };

    // AT the rest: it goes on.
    s.depth = rest.depth;
    const on = gear.equipGear(s, 'ashlamp', 'lamp') as { ok: boolean };

    s.roll.shored.push(stops[3]!.id);
    crews.dispatchCrew(s, { emit: Function.prototype, dirty: Function.prototype }, stops[3]!.id);
    const carried = (crews.ensureCrews(s) as { crews: Array<{ gear: Record<string, string> }> })
      .crews[0]!.gear;

    // ...and with a crew in the field the REST rule has not moved.
    s.depth = 9999;
    const stillGated = gear.equipGear(s, 'ashlamp', 'lamp') as { ok: boolean };

    const rows = (crews.crewsRead(s) as { rows: Array<{ gear: Array<{ name: string }> }> }).rows;
    return {
      awayOk: away.ok, awaySays: String(away.reason ?? ''), onOk: on.ok,
      carried: carried.lamp ?? null, stillGated: stillGated.ok,
      shown: rows[0]?.gear.map((g) => g.name) ?? [],
    };
  });
  console.log(`        away from a rest: ${loadout.awaySays}`);
  check([loadout.awayOk, loadout.onOk], [false, true], [true, false],
    'U — gear swaps at a REST and nowhere else');
  check(loadout.carried, 'ashlamp', null,
    'U — the crew walked out carrying what you were wearing');
  check(loadout.stillGated, false, true,
    'U — ...and with a crew in the field the REST rule has NOT moved');
  check(loadout.shown.length > 0 && loadout.shown.every((n) => n.length > 0), true, false,
    'U — every kit row in the crew panel is named');

  await browser.close();
  console.log(`\n${problems.length === 0 ? 'ALL PASS' : `${problems.length} PROBLEM(S)`}`);
  if (problems.length) { for (const p of problems) console.log(`  - ${p}`); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
