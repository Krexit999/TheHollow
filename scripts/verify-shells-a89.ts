/**
 * GLASSMERE, CINDER AND THE FLOODGATE, DRIVEN IN THE REAL GAME (A.89).
 *
 * Two shells share one driver because every claim is the same claim twice, and
 * a second copy would be a second thing to drift. The per-shell block runs once
 * for each; the flood block runs only where a flood station exists.
 *
 *   A  each Roll in the Shaft — three legible ahead, the floor pinned
 *   B  a Collapse: names and depths persist while contents re-roll
 *   C  each shell's three gates paying ITS materials, not Loam's
 *   D  every orphan dropping, with where from, plus a barren control
 *   E  a WALL facing a real tier gate, per shell
 *   F  gear at a REST in each, refused elsewhere
 *   G  a band shored in each, with the purse named correctly
 *   H  the Circuit reading a station in each
 *   I  a FLOOD station flooding, and changing what the player does
 *   J  the clone check green, and RED-TESTED
 *   K  dpsMax unmoved at equal depth
 *   L  §23 beats, 380px, 0 overflow, 0 page errors
 *
 * Every assertion goes through `check(actual, want, bad, label)`.
 *
 *   npx tsx scripts/verify-shells-a89.ts [port] [outDir]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots-a89';
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

interface ShellCase {
  id: string;
  stations: number;
  floor: number;
  floorName: string;
  purse: string;
  purseName: string;
  chip: string;
  gates: [number, string][];
  orphans: string[];
  /** A depth with no burying station within ±4. */
  barren: number;
  /** [wall station depth, tier at it, tier one step past it] */
  wall: [number, number, number];
  /** [rest depth, rest name, a depth that is not a rest] */
  rest: [number, string, number];
  firstBand: string;
  drift: number;
  /** [depth, station name, type] for the Circuit read. */
  at: [number, string, string];
  dpsAt: number;
}

const SHELLS: ShellCase[] = [
  {
    id: 'glassmere', stations: 19, floor: 380, floorName: 'THE DARK PANE',
    purse: 'lumen', purseName: 'Lumen', chip: 'prism',
    gates: [[8, 'weepstone'], [14, 'truesilica'], [20, 'truelight']],
    orphans: ['glasschitin', 'coldsinew', 'lenswing', 'prismheart', 'unblinkingTear'],
    barren: 320, wall: [49, 9, 10], rest: [78, 'The Quiet Gallery', 300],
    firstBand: 'dimglassreach', drift: 14, at: [130, 'The Balance House', 'wreck'], dpsAt: 62,
  },
  {
    id: 'cinder', stations: 19, floor: 470, floorName: 'FLASHPOINT',
    purse: 'ember', purseName: 'Ember', chip: 'slag',
    gates: [[8, 'charstone'], [14, 'slagrock'], [20, 'slagglass']],
    orphans: ['emberplate', 'charsinew', 'magmaduct', 'pyregland', 'smolderheart'],
    barren: 320, wall: [54, 12, 13], rest: [80, 'The Ashfield', 250],
    firstBand: 'cinderfall', drift: 16, at: [355, 'The Choke', 'flood'], dpsAt: 58,
  },
];

/** Item 14 — what is still unauthored, sized. Printed, not asserted. */
const UNAUTHORED = [
  ['HOLLOW', 16, 560, "§19 authors its chemistry IN FULL, so it has the most already written around it. And `shellDef('hollow').walls` is EMPTY — \"there is no rock to be hard\" — so its Roll authors NO wall stations, which no shell has done yet and which `ferrite-roll.test.ts` handles by construction (it iterates the gates). Keystones: Condenser Wreck 55, Witness Hall 140"],
  ['ALEPH', 6, 40, "the short shell and the cheapest left: six rows against Cinder's nineteen, and a 40m floor. Keystones: The Author's Cut 16, The Reading Room 32"],
];

async function shellBlock(page: Page, c: ShellCase): Promise<void> {
  console.log(`\n══ ${c.id.toUpperCase()} ══════════════════════════════════════════════════`);
  await setup(page, `
    const s = engine.getState();
    s.shell.current = '${c.id}';
    s.shell.breachCount = 4;
    s.depthRecords['${c.id}'] = ${c.floor};
    s.maxDepthRecord = ${c.floor};
    s.depth = 0;
    // THE LAMP DOES NOT CARRY BETWEEN BLOCKS. Sable's Lamp reads one station
    // further (roll.ts), so the gear check in the FIRST shell made the fog
    // check in the SECOND read four ahead instead of three — a harness leak
    // that would have been reported as a game bug.
    s.gear = s.gear || {}; s.gear.worn = {}; s.gear.owned = [];
  `);

  // ── A — the Roll rendering ───────────────────────────────────────────────
  await tab(page, 'shaft');
  await dismiss(page);
  await page.waitForTimeout(500);
  const rolled = await page.evaluate(async (floorName) => {
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { depth: number };
    const rows = [...document.querySelectorAll('[data-testid^="station-"]')];
    s.depth = 100;
    const r = roll.rollRows(s) as { legible: boolean; behind: boolean; def: { name: string } }[];
    const ahead = r.filter((x) => !x.behind);
    s.depth = 0;
    return {
      n: roll.shellRoll(s).length,
      legible: rows.length,
      floorPinned: rows.some((x) => (x as HTMLElement).innerText.includes(floorName as string)),
      aheadLegible: ahead.filter((x) => x.legible).length,
      next: ahead.filter((x) => x.legible).map((x) => x.def.name),
    };
  }, c.floorName);
  check(rolled.n, c.stations, 0, `A — ${c.stations} stations render`);
  check(rolled.floorPinned, true, false, `A — ${c.floorName} pinned from arrival`);
  check(rolled.aheadLegible, 3, 0, `A — three legible ahead (${rolled.next.join(', ')})`);
  await page.screenshot({ path: `${OUT}/a89-${c.id}-roll.png`, fullPage: true }).catch(() => {});

  // ── B — a Collapse ───────────────────────────────────────────────────────
  const coll = await page.evaluate(async (floor) => {
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean } }>;
    const s = w['__engine']!.getState() as unknown as { depth: number; shaft: { reached: number } };
    const authored = () => (roll.shellRoll(s) as { id: string; depth: number; name: string; type: string; hardness?: number }[])
      .map((d) => `${d.id}|${d.depth}|${d.name}|${d.type}|${d.hardness ?? ''}`);
    const contents = () => (roll.shellRoll(s) as { id: string }[])
      .map((d) => JSON.stringify(roll.contentsOf(s, d.id)));
    const beforeA = authored(); let prev = contents();
    let moved = 0, falls = 0;
    for (let i = 0; i < 8; i++) {
      s.depth = (floor as number) - 10; s.shaft.reached = (floor as number) - 10;
      if (!w['__engine']!.dispatch({ type: 'collapse' }).ok) break;
      falls += 1;
      const now = contents();
      moved += now.filter((v, j) => v !== prev[j]).length;
      prev = now;
    }
    return { same: JSON.stringify(authored()) === JSON.stringify(beforeA), moved, falls };
  }, c.floor);
  check({ same: coll.same, falls: coll.falls }, { same: true, falls: 8 }, { same: false, falls: 8 },
    'B — eight Collapses moved no name, depth, type or hardness');
  check(coll.moved > 40, true, false, `B — contents re-rolled ${coll.moved} times — the control is real`);

  // ── C — the deep-entry gates ─────────────────────────────────────────────
  const gates = await page.evaluate(async () => {
    const comp = await import(/* @vite-ignore */ '/src/engine/systems/compaction' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState();
    const ctx = { emit() {}, dirty() {} };
    const out: Record<number, string[]> = {};
    for (const cc of [8, 14, 20]) {
      const got = new Set<string>();
      for (let i = 0; i < 4000; i++) { const id = comp.rollDeepEntry(s, ctx, cc); if (id) got.add(id); }
      out[cc] = [...got];
    }
    return out;
  });
  for (const [at, id] of c.gates) {
    check(gates[at], [id], ['deepgrave'], `C — c>=${at} pays ${id}, not Loam's`);
  }

  // ── D — the orphans ──────────────────────────────────────────────────────
  const drops = await page.evaluate(async (arg) => {
    const [ids, barren] = arg as [string[], number];
    const w = window as unknown as Record<string, never>;
    const e = w['__engine'] as unknown as { getState: () => never };
    const dropsMod = await import(/* @vite-ignore */ '/src/engine/systems/drops' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const s = e.getState() as unknown as { depth: number };
    const cache = new modsMod.ModifierCache();
    const ctx = { emit() {}, dirty() {} };
    const found: Record<string, string[]> = {};
    for (const st of roll.shellRoll(s) as { depth: number }[]) {
      const before: Record<string, number> = {};
      for (const id of ids) before[id] = forge.materialCount(s, id);
      s.depth = st.depth;
      cache.invalidate();
      for (let i = 0; i < 500; i++) dropsMod.rollForDrop(s, cache, ctx, 40, 1, 'verify');
      for (const id of ids) {
        const n = forge.materialCount(s, id) - before[id]!;
        if (n > 0) (found[id] ??= []).push(`${n}@${st.depth}m`);
      }
    }
    const beforeCtl: Record<string, number> = {};
    for (const id of ids) beforeCtl[id] = forge.materialCount(s, id);
    s.depth = barren; cache.invalidate();
    for (let i = 0; i < 3000; i++) dropsMod.rollForDrop(s, cache, ctx, 40, 1, 'verify');
    const stray = ids.filter((id) => forge.materialCount(s, id) - beforeCtl[id]! > 0);
    return { found, stray };
  }, [c.orphans, c.barren]);
  for (const id of c.orphans) {
    console.log(`      ${id.padEnd(15)} ${(drops.found[id] ?? []).join(' ') || 'NONE'}`);
  }
  check(c.orphans.filter((id) => !drops.found[id]), [], ['x'], 'D — every orphan drops in play');
  check(drops.stray, [], ['x'], `D — and none at ${c.barren}m, where nothing buries them`);

  // ── E — a WALL facing a tier gate ────────────────────────────────────────
  const wall = await page.evaluate(async (d) => {
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const rolls = await import(/* @vite-ignore */ '/src/engine/content/rolls' + '.ts');
    const shells = await import(/* @vite-ignore */ '/src/engine/shells' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { depth: number; shell: { current: string } };
    return {
      at: forge.requiredTier(s, d as number),
      past: forge.requiredTier(s, (d as number) + 1),
      walls: (rolls.authoredRoll(s.shell.current) as { name: string; depth: number; type: string; hardness?: number }[])
        .filter((x) => x.type === 'wall').map((x) => `${x.name} ${x.depth}m h${x.hardness}`),
      gates: (shells.shellDef(s.shell.current).walls as { depth: number; tier: number }[])
        .map((g) => `${g.depth}m t${g.tier}`),
    };
  }, c.wall[0]);
  console.log(`      walls: ${wall.walls.join(' · ')}`);
  console.log(`      gates: ${wall.gates.join(' · ')}`);
  check({ at: wall.at, past: wall.past }, { at: c.wall[1], past: c.wall[2] },
    { at: c.wall[1] + 99, past: c.wall[2] + 99 },
    `E — the WALL station sits one step above its gate (${wall.walls[0]})`);

  // ── F — gear at a REST ───────────────────────────────────────────────────
  const gear = await page.evaluate(async (arg) => {
    const [restDepth, away] = arg as [number, number];
    const g = await import(/* @vite-ignore */ '/src/engine/systems/gear' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string } }>;
    const s = w['__engine']!.getState() as unknown as {
      depth: number; gear: { owned: string[]; worn: Record<string, string | null> };
    };
    g.ensureGear(s as never);
    s.gear.owned = ['sableslamp'];
    s.gear.worn['lamp'] = null;
    s.depth = away;
    const no = w['__engine']!.dispatch({ type: 'equipGear', slot: 'lamp', id: 'sableslamp' });
    s.depth = restDepth;
    const yes = w['__engine']!.dispatch({ type: 'equipGear', slot: 'lamp', id: 'sableslamp' });
    return { noOk: no.ok, reason: no.reason ?? '', yesOk: yes.ok, worn: s.gear.worn['lamp'] };
  }, [c.rest[0], c.rest[2]]);
  console.log(`      away from a rest: "${gear.reason}"`);
  check({ no: gear.noOk, yes: gear.yesOk, worn: gear.worn },
    { no: false, yes: true, worn: 'sableslamp' }, { no: true, yes: true, worn: 'sableslamp' },
    `F — refused at ${c.rest[2]}m, allowed at ${c.rest[1]}`);

  // ── G — a band shored, purse named ───────────────────────────────────────
  const shore = await page.evaluate(async (arg) => {
    const [band, purse, chip] = arg as [string, string, string];
    const sh = await import(/* @vite-ignore */ '/src/engine/systems/shoring' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean } }>;
    const s = w['__engine']!.getState() as unknown as {
      roll: { rig?: boolean }; currencies: Record<string, never>;
      casting: { rack: unknown[] };
    };
    s.roll.rig = true;
    s.casting.rack = Array.from({ length: 10 }, (_, i) =>
      ({ id: `p${i}`, materialId: 'marl', shape: 'head', purity: 50, traits: [] }));
    // Read the refusal with a RACK but an empty purse, so it tests the purse.
    const zero = (s.currencies[chip] as unknown as { mul(n: number): { add(n: number): never } }).mul(0);
    s.currencies[purse] = zero as never;
    const poor = sh.shoreBlocker(s, band) as string;
    s.currencies[purse] = (s.currencies[chip] as unknown as { mul(n: number): { add(n: number): never } }).mul(0).add(1e30);
    const r = w['__engine']!.dispatch({ type: 'shoreBand', stationId: band });
    return { poor, ok: r.ok, drift: sh.driftDepth(s) };
  }, [c.firstBand, c.purse, c.chip]);
  console.log(`      the refusal reads: "${shore.poor}"`);
  check(shore.poor, `Not enough ${c.purseName}.`, 'Not enough Brick.', 'G — the purse is named per shell');
  check({ ok: shore.ok, drift: shore.drift }, { ok: true, drift: c.drift }, { ok: false, drift: 0 },
    `G — timbered, and the fall lands at ${c.drift}m`);

  // ── H — the Circuit ──────────────────────────────────────────────────────
  const circ = await page.evaluate(async (d) => {
    const cc = await import(/* @vite-ignore */ '/src/engine/systems/circuit' + '.ts');
    const mod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { depth: number; kiln: { built: boolean } };
    const m = new mod.ModifierCache(); m.invalidate();
    s.kiln.built = true;
    s.depth = d as number;
    const at = cc.stationHere(s) as { name: string; type: string };
    const now = (id: string) => (cc.READS as { id: string; now: (a: unknown, b: unknown) => string }[])
      .find((r) => r.id === id)!.now(s, m);
    return {
      reads: (cc.availableReads(s) as { id: string }[]).map((r) => r.id),
      at, station: now('station'), seam: now('seam'),
    };
  }, c.at[0]);
  console.log(`      the station here ${circ.station}`);
  console.log(`      the seam here    ${circ.seam}`);
  check(['seam', 'station', 'hazard'].every((r) => circ.reads.includes(r)), true, false,
    'H — the world reads are live');
  check({ name: circ.at.name, type: circ.at.type }, { name: c.at[1], type: c.at[2] }, { name: '', type: '' },
    `H — and they name ${c.at[1]}`);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('render recovered')) errors.push(m.text().slice(0, 160));
  });
  await page.addInitScript(() => {
    (window as never as Record<string, unknown>)['__name'] = (f: unknown) => f;
  });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await dismiss(page);

  // ═══ L(a) — §23 ON A FRESH SAVE ══════════════════════════════════════════
  console.log('\nL — §23, the first 45 minutes (read before anything is seeded)');
  const beats = await page.evaluate(async () => {
    const eng = await import(/* @vite-ignore */ '/src/engine/index' + '.ts');
    const mod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const up = await import(/* @vite-ignore */ '/src/engine/upgrades' + '.ts');
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const comp = await import(/* @vite-ignore */ '/src/engine/systems/compaction' + '.ts');
    const s = eng.createEngine({ nowMs: 0 }).getState();
    const m = new mod.ModifierCache(); m.invalidate();
    const blade = up.allUpgrades().find((u: { id: string }) => u.id === 'blade');
    return {
      cells: s.face.cells.length,
      bladeCost: blade ? Number(up.nextCost(blade, 0).toString()) : -1,
      dps: Math.round(face.dpsMax(s, m).toNumber() * 100) / 100,
      loam: roll.shellRoll(s).length,
      first: roll.shellRoll(s)[0]?.name,
      ladder: comp.deepGatesFor('loam').map((g: { materialId: string }) => g.materialId),
    };
  });
  check(beats.cells, 36, 0, '0:00 — a 6×6 grid');
  check(beats.bladeCost, 50, 0, '0:04 — BLADE at 50 Dust');
  check(beats.dps, 2.88, 0, '0:40 — the field ceiling is 2.88/s');
  check(beats.loam, 17, 0, 'Loam still has its seventeen rows');
  check(beats.first, 'The Turnrow', '', '...starting at The Turnrow');
  check(beats.ladder, ['deepgrave', 'graveclaydeep', 'umberjade'], ['slagglass', 'slagrock', 'charstone'],
    '...and its deep-entry ladder is untouched');

  // ═══ FIXTURE ═════════════════════════════════════════════════════════════
  console.log('\nFIXTURE');
  const fixture = await page.evaluate(async () => {
    const rolls = await import(/* @vite-ignore */ '/src/engine/content/rolls' + '.ts');
    return {
      authored: (rolls.AUTHORED_SHELLS as string[]).slice().sort(),
      unauthored: rolls.unauthoredShells() as string[],
      floods: Object.fromEntries((rolls.AUTHORED_SHELLS as string[]).map((id) =>
        [id, (rolls.authoredRoll(id) as { type: string; name: string }[])
          .filter((d) => d.type === 'flood').map((d) => d.name)])),
    };
  });
  check(fixture.authored, ['cinder', 'ferrite', 'glassmere', 'loam', 'verdance'], [],
    'five shells are authored');
  check(fixture.unauthored, ['hollow', 'aleph'], [], 'two are not');
  check(fixture.floods,
    { loam: [], ferrite: [], verdance: [], glassmere: [], cinder: ['The Bank', 'The Choke'] }, {},
    'Cinder authors the only two FLOOD stations in the game');

  for (const c of SHELLS) await shellBlock(page, c);

  // ═══ I — A FLOOD, IN PLAY ════════════════════════════════════════════════
  console.log('\nI — a FLOOD station flooding, and what it changes');
  await setup(page, `
    const s = engine.getState();
    s.shell.current = 'cinder';
    s.depthRecords['cinder'] = 470;
    s.maxDepthRecord = 470;
    s.depth = 210;
    s.roll.flooded = [];
    s.roll.floodgate = false;
  `);
  const before = await page.evaluate(async () => {
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const fl = await import(/* @vite-ignore */ '/src/engine/systems/flood' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState();
    const def = (roll.shellRoll(s) as { id: string }[]).find((d) => d.id === 'thebank')!;
    let moved = 0;
    let prev = JSON.stringify(roll.contentsOf(s, 'thebank'));
    for (let i = 0; i < 10; i++) {
      roll.rerollRoll(s, Math.random);
      const now = JSON.stringify(roll.contentsOf(s, 'thebank'));
      if (now !== prev) moved += 1;
      prev = now;
    }
    return { type: roll.typeOf(s, def), moved, gate: fl.floodBlocker(s, 'thebank') };
  });
  console.log(`      before: type ${before.type}, contents moved ${before.moved}/10 Collapses`);
  check({ type: before.type, gate: before.gate },
    { type: 'flood', gate: 'The Floodgate is not standing.' }, { type: 'hazard', gate: null },
    'I — before: it reads FLOOD, and the gate is not standing');
  check(before.moved > 3, true, false, 'I — and its contents move with everything else');

  // Raise the gate through its own row, then drown it through the panel.
  await setup(page, `
    const s = engine.getState();
    if (!s.roll.looted.includes('thepurge')) s.roll.looted.push('thepurge');
    s.currencies.ember = s.currencies.slag.mul(0).add(1e30);
    s.casting.rack = [];
    for (let i = 0; i < 10; i++) s.casting.rack.push({ id: 'p'+i, materialId: 'charstone', shape: 'head', purity: 50, traits: [] });
  `);
  await tab(page, 'shaft');
  await dismiss(page);
  await page.waitForTimeout(500);
  check(await page.evaluate(() => document.querySelectorAll('[data-testid="flood-panel"]').length),
    1, 0, 'I — the Floodgate panel is on the Cinder Shaft screen');
  await page.getByRole('button', { name: /Raise the Floodgate/ }).first().click();
  await page.waitForTimeout(600);
  // TWO presses: the second is the no-undo confirmation, which is the point.
  await page.getByTestId('flood-thebank').click();
  await page.waitForTimeout(250);
  const armed = await page.evaluate(() =>
    (document.querySelector('[data-testid="flood-thebank"]') as HTMLElement | null)?.innerText ?? '');
  check(armed.includes('no undo'), true, false, `I — the first press arms it ("${armed.split('\n')[0]}")`);
  await page.getByTestId('flood-thebank').click();
  await page.waitForTimeout(600);

  const after = await page.evaluate(async () => {
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const fl = await import(/* @vite-ignore */ '/src/engine/systems/flood' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState();
    const def = (roll.shellRoll(s) as { id: string; floodSeams?: string[] }[]).find((d) => d.id === 'thebank')!;
    const held = roll.contentsOf(s, 'thebank') as { seam: string; hazard: number };
    const frozen = JSON.stringify(held);
    let moved = 0, others = 0;
    for (let i = 0; i < 10; i++) {
      const was = (roll.shellRoll(s) as { id: string }[]).map((d) => JSON.stringify(roll.contentsOf(s, d.id)));
      roll.rerollRoll(s, Math.random);
      const now = (roll.shellRoll(s) as { id: string }[]).map((d) => JSON.stringify(roll.contentsOf(s, d.id)));
      others += now.filter((v, j) => v !== was[j]).length;
      if (JSON.stringify(roll.contentsOf(s, 'thebank')) !== frozen) moved += 1;
    }
    return {
      flooded: fl.isFlooded(s, 'thebank'),
      type: roll.typeOf(s, def),
      seam: mats.materialDef(held.seam).name,
      fromPool: (def.floodSeams ?? []).includes(held.seam),
      hazard: held.hazard,
      moved, others,
      blocker: fl.floodBlocker(s, 'thebank'),
      left: (fl.floodable(s) as { name: string }[]).map((d) => d.name),
    };
  });
  console.log(`      after:  type ${after.type}, seam ${after.seam} (from the deep pool: ${after.fromPool}), hazard ${after.hazard}`);
  console.log(`              moved ${after.moved}/10 Collapses while ${after.others} other contents turned over`);
  check({ flooded: after.flooded, type: after.type, hazard: after.hazard, fromPool: after.fromPool },
    { flooded: true, type: 'hazard', hazard: 3, fromPool: true },
    { flooded: false, type: 'flood', hazard: 0, fromPool: false },
    'I — after: drowned, reads HAZARD at full intensity, seam from the deep pool');
  check({ moved: after.moved, control: after.others > 40 }, { moved: 0, control: true },
    { moved: 10, control: true }, 'I — it never re-rolls again, while the shell turns around it');
  check({ blocker: after.blocker, left: after.left }, { blocker: 'Already drowned.', left: ['The Choke'] },
    { blocker: null, left: [] }, 'I — and there is no undo');
  await page.getByTestId('flood-panel').screenshot({ path: `${OUT}/a89-floodgate.png` }).catch(() => {});
  await page.screenshot({ path: `${OUT}/a89-cinder-shaft.png`, fullPage: true }).catch(() => {});

  // ═══ J — THE CLONE CHECK ═════════════════════════════════════════════════
  console.log('\nJ — the clone check, across every authored shell');
  const clones = await page.evaluate(async () => {
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const defs = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const rolls = await import(/* @vite-ignore */ '/src/engine/content/rolls' + '.ts');
    const out: Record<string, { hits: string[]; n: number }> = {};
    for (const shell of rolls.AUTHORED_SHELLS as string[]) {
      const seen = new Map<string, string>();
      const hits: string[] = [];
      const mined = (mats.MATERIALS as { id: string; name: string; shellId: string; worked?: boolean; source?: string }[])
        .filter((m) => m.shellId === shell && !m.worked && m.source !== 'combat');
      for (const m of mined) {
        const d = fp.derivePart(fp.makePart('head', m.id, 60));
        const key = (defs.TOOL_STATS as string[])
          .map((st) => (d.stats as Record<string, number>)[st]!.toFixed(3)).join('|');
        if (seen.has(key)) hits.push(`${m.name} = ${seen.get(key)}`);
        seen.set(key, m.name);
      }
      out[shell] = { hits, n: mined.length };
    }
    return out;
  });
  for (const [shell, r] of Object.entries(clones)) {
    console.log(`      ${shell.padEnd(10)} ${String(r.n).padStart(2)} mined · ${r.hits.length === 0 ? 'no clones' : r.hits.join(' · ')}`);
  }
  check(Object.values(clones).flatMap((r) => r.hits), [], ['x'],
    'J — no two mined materials in any shell make the same head');

  /**
   * RED-TESTED, in the live module: put the fifth clone's old traits back and
   * the SAME check must name it. A green check nobody has seen fail is a
   * green check nobody has tested.
   */
  const red = await page.evaluate(async () => {
    const traits = await import(/* @vite-ignore */ '/src/engine/traits' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const defs = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const table = traits.MATERIAL_TRAITS as Record<string, string[]>;
    const keep = table['cindersteel'];
    table['cindersteel'] = ['tough', 'warm']; // the clone, as it was until A.89
    const seen = new Map<string, string>();
    const hits: string[] = [];
    for (const m of (mats.MATERIALS as { id: string; name: string; shellId: string; worked?: boolean; source?: string }[])
      .filter((x) => x.shellId === 'cinder' && !x.worked && x.source !== 'combat')) {
      const d = fp.derivePart(fp.makePart('head', m.id, 60));
      const key = (defs.TOOL_STATS as string[])
        .map((st) => (d.stats as Record<string, number>)[st]!.toFixed(3)).join('|');
      if (seen.has(key)) hits.push(`${m.name} = ${seen.get(key)}`);
      seen.set(key, m.name);
    }
    table['cindersteel'] = keep!;
    return hits;
  });
  check(red, ['Cindersteel = Magmajade'], [], 'J — RED-TESTED: the old traits fail it, by name');

  // ═══ K — PILLAR 2 ════════════════════════════════════════════════════════
  console.log('\nK — PILLAR 2: geography is not income');
  const pillar = await page.evaluate(async () => {
    const eng = await import(/* @vite-ignore */ '/src/engine/index' + '.ts');
    const mod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const rolls = await import(/* @vite-ignore */ '/src/engine/content/rolls' + '.ts');
    const read = (shell: string, depth: number) => {
      const s = eng.createEngine({ nowMs: 0 }).getState();
      s.shell.current = shell;
      roll.ensureRoll(s);
      s.depth = depth;                            // THE SAME DEPTH IN BOTH ARMS
      const m = new mod.ModifierCache(); m.invalidate();
      return { dps: Math.round(face.dpsMax(s, m).toNumber() * 1e6), n: roll.shellRoll(s).length };
    };
    const none = rolls.anUnauthoredShell() as string;
    return {
      g: read('glassmere', 62), gN: read(none, 62),
      c: read('cinder', 58), cN: read(none, 58), noneId: none,
    };
  });
  console.log(`      glassmere@62 ${pillar.g.dps}  vs ${pillar.noneId}@62 ${pillar.gN.dps}`);
  console.log(`      cinder@58    ${pillar.c.dps}  vs ${pillar.noneId}@58 ${pillar.cN.dps}`);
  check(pillar.g.dps, pillar.gN.dps, pillar.gN.dps + 1, 'K — dpsMax unmoved at depth 62');
  check(pillar.c.dps, pillar.cN.dps, pillar.cN.dps + 1, 'K — dpsMax unmoved at depth 58');
  check({ g: pillar.g.n, c: pillar.c.n, none: pillar.gN.n }, { g: 19, c: 19, none: 0 },
    { g: 0, c: 0, none: 0 }, 'K — and the control arm really has no Roll');

  // ═══ WHAT REMAINS ════════════════════════════════════════════════════════
  console.log('\nWhat remains unauthored, sized');
  let n = 0;
  for (const [shell, s, floor, why] of UNAUTHORED) {
    n += s as number;
    console.log(`      ${String(shell).padEnd(8)} ~${String(s).padStart(2)} stations to ~${floor}m — ${why}`);
  }
  console.log(`      TOTAL ~${n} across two shells (17 + 19 + 20 + 19 + 19 = 94 written)`);

  // ═══ L(b) — 380px ════════════════════════════════════════════════════════
  console.log('\nL — 380px, overflow and page errors');
  const layout = await page.evaluate(() => {
    const over: string[] = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) {
        over.push(`${el.tagName}.${(el.className || '').toString().slice(0, 40)}`);
      }
    }
    const clipped: string[] = [];
    for (const el of document.querySelectorAll('.truncate')) {
      const e = el as HTMLElement;
      if (!e.innerText.trim()) continue;
      if (e.getBoundingClientRect().width >= 24) continue;
      if (e.scrollWidth <= e.clientWidth + 2) continue;
      clipped.push(`"${e.innerText.trim().slice(0, 20)}"`);
    }
    return { over: over.length, first: over.slice(0, 3), clipped, doc: document.documentElement.scrollWidth };
  });
  check(layout.over, 0, 1, `L — 0 elements overflow 380px (doc ${layout.doc}px)`);
  if (layout.over > 0) console.log(`      ${layout.first.join(' | ')}`);
  check(layout.clipped, [], ['x'], 'L — 0 station names clipped to nothing');
  check(errors.length, 0, 1, 'L — 0 page errors');
  for (const e of errors.slice(0, 5)) console.log(`      ${e}`);

  console.log(`\n${problems.length === 0 ? 'ALL PASS' : `${problems.length} PROBLEM(S)`}`);
  for (const p of problems) console.log(`  - ${p}`);
  console.log(`shots in ${OUT}/`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
