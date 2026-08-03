/**
 * FERRITE'S GEOGRAPHY, DRIVEN IN THE REAL GAME (A.87).
 *
 *   A  the Roll rendering in the Shaft — three legible ahead, the floor pinned
 *   B  a Collapse: names and depths persist while contents re-roll
 *   C  the three deep-entry gates paying, in the shell they belong to
 *   D  all six combat orphans dropping, with where from
 *   E  a WALL facing a real tier gate
 *   F  gear swapped at a Ferrite REST, and refused away from one
 *   G  a band shored in Ferrite
 *   H  the Circuit reading a Ferrite station
 *   I  dpsMax unmoved at equal depth, Roll against no-Roll
 *   J  §23 — the opening beats, including the one this phase could break
 *   K  380px, 0 overflow, 0 page errors
 *
 * Every assertion goes through `check(actual, want, bad, label)` and reports
 * VACUOUS if the known-bad value equals the expected one. Clipping is asserted
 * with getBoundingClientRect, never innerText.
 *
 *   npx tsx scripts/verify-ferrite-a87.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots-a87';
const W = 380, H = 1500;

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

const ORPHANS = ['scalebackplate', 'ironsinew', 'voltgland', 'magnetheart', 'nullquill', 'loadstarcore'];

/** What is still unauthored, sized — item 7, printed rather than asserted. */
const UNAUTHORED = [
  ['VERDANCE', 18, 250, 'the spine names its 18 in the v4 listing; none of its stations, seams or remains exist'],
  ['GLASSMERE', 18, 250, 'same; plus §7.2 wants unallocated-band behaviour the Roll would key off'],
  ['CINDER', 18, 250, 'same, and §36 adds TWO FLOOD-eligible stations the type system has no `flood` for'],
  ['HOLLOW', 16, 250, 'same; §19 authors its chemistry in full, so its Roll is the one with the most already written around it'],
  ['ALEPH', 6, 40, 'the short shell — six stations against Loam\'s fifteen, and the cheapest of the five'],
];

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

  // ═══ J — §23 BEFORE THE FIXTURE IS DIRTIED ═══════════════════════════════
  console.log('\nJ — §23, the first 45 minutes (read on a fresh save)');
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
      // A NEW PLAYER STANDS IN LOAM, and everything about Loam must be what it
      // was: the same fifteen stations, the same first deep-entry stone.
      loamStations: roll.shellRoll(s).length,
      firstStation: roll.shellRoll(s)[0]?.name,
      loamGate8: comp.deepGatesFor('loam').find((g: { at: number }) => g.at === 8)?.materialId,
    };
  });
  check(beats.cells, 36, 0, '0:00 — a 6×6 grid');
  check(beats.bladeCost, 50, 0, '0:04 — BLADE at 50 Dust');
  check(beats.dps, 2.88, 0, '0:40 — the field ceiling is 2.88/s');
  check(beats.loamStations, 17, 0, 'Loam still has its seventeen rows');
  check(beats.firstStation, 'The Turnrow', '', '...starting at The Turnrow');
  check(beats.loamGate8, 'umberjade', 'wormsteel', '...and its first deep-entry stone is unchanged');

  // ═══ FIXTURE ═════════════════════════════════════════════════════════════
  console.log('\nFIXTURE — a player standing in Ferrite');
  await setup(page, `
    const s = engine.getState();
    s.shell.current = 'ferrite';
    s.shell.breachCount = 1;
    s.depthRecords['loam'] = 150;
    s.depthRecords['ferrite'] = 250;
    s.maxDepthRecord = 250;
  `);
  const fixture = await page.evaluate(async () => {
    const rolls = await import(/* @vite-ignore */ '/src/engine/content/rolls' + '.ts');
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState();
    return {
      authored: rolls.AUTHORED_SHELLS.slice().sort(),
      stations: roll.shellRoll(s).length,
      types: roll.shellRoll(s).reduce((acc: Record<string, number>, d: { type: string }) => {
        acc[d.type] = (acc[d.type] ?? 0) + 1; return acc;
      }, {}),
      rows: roll.shellRoll(s).map((d: { depth: number; name: string; type: string }) =>
        `${String(d.depth).padStart(3)} ${d.name} [${d.type}]`),
    };
  });
  check(fixture.authored, ['ferrite', 'loam'], [], 'two shells are authored');
  check(fixture.stations, 19, 0, 'Ferrite has nineteen stations');
  console.log(`      ${JSON.stringify(fixture.types)}`);
  for (const r of fixture.rows) console.log(`      ${r}`);

  // ═══ A — THE ROLL RENDERING ══════════════════════════════════════════════
  console.log('\nA — the Roll rendering in the Shaft');
  await tab(page, 'shaft');
  await dismiss(page);
  await page.evaluate(() => {
    const w = window as unknown as Record<string, { getState: () => { depth: number } }>;
    w['__engine']!.getState().depth = 0;
  });
  await page.waitForTimeout(600);
  const rendered = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid^="station-"]')];
    return {
      legible: rows.length,
      names: rows.map((r) => (r as HTMLElement).innerText.split('\n')[0]!.trim()).slice(0, 5),
      floorPinned: [...document.querySelectorAll('[data-testid^="station-"]')]
        .some((r) => (r as HTMLElement).innerText.includes('POLEIRON')),
      allRows: document.querySelectorAll('.panel')[1]?.querySelectorAll('div').length ?? 0,
    };
  });
  console.log(`      legible rows: ${rendered.legible}`);
  // At depth 0 the fog rule is: the station you are at, plus the next three.
  check(rendered.legible >= 4, true, false, 'the near rows are legible');
  check(rendered.floorPinned, true, false, 'and POLEIRON is pinned at the bottom from the start');
  await page.screenshot({ path: `${OUT}/a87-ferrite-roll.png`, fullPage: true }).catch(() => {});

  const fog = await page.evaluate(async () => {
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { depth: number };
    s.depth = 48;
    const rows = roll.rollRows(s) as { legible: boolean; behind: boolean; def: { name: string } }[];
    const ahead = rows.filter((r) => !r.behind);
    return {
      aheadLegible: ahead.filter((r) => r.legible).length,
      next: ahead.filter((r) => r.legible).map((r) => r.def.name),
    };
  });
  check(fog.aheadLegible, 3, 0, `three legible ahead (${fog.next.join(', ')})`);

  // ═══ B — A COLLAPSE ══════════════════════════════════════════════════════
  console.log('\nB — a Collapse: names and depths persist, contents re-roll');
  const collapse = await page.evaluate(async () => {
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean } }>;
    const s = w['__engine']!.getState() as unknown as {
      depth: number; shaft: { reached: number }; roll: { rolls: number };
    };
    const authored = () => (roll.shellRoll(s) as { id: string; depth: number; name: string; type: string; hardness?: number }[])
      .map((d) => `${d.id}|${d.depth}|${d.name}|${d.type}|${d.hardness ?? ''}`);
    const contents = () => (roll.shellRoll(s) as { id: string }[])
      .map((d) => JSON.stringify(roll.contentsOf(s, d.id)));
    const beforeA = authored(); let prev = contents();
    let moved = 0, falls = 0;
    for (let i = 0; i < 8; i++) {
      s.depth = 240; s.shaft.reached = 240;
      if (!w['__engine']!.dispatch({ type: 'collapse' }).ok) break;
      falls += 1;
      const now = contents();
      moved += now.filter((v, j) => v !== prev[j]).length;
      prev = now;
    }
    return { same: JSON.stringify(authored()) === JSON.stringify(beforeA), moved, falls, rolls: s.roll.rolls };
  });
  check({ same: collapse.same, falls: collapse.falls }, { same: true, falls: 8 }, { same: false, falls: 8 },
    'eight Collapses moved no name, depth, type or hardness');
  check(collapse.moved > 40, true, false,
    `and contents re-rolled ${collapse.moved} times across those eight — the control is real`);

  // ═══ C — THE DEEP-ENTRY GATES ════════════════════════════════════════════
  console.log('\nC — the three deep-entry gates, in the shell they belong to');
  const gates = await page.evaluate(async () => {
    const comp = await import(/* @vite-ignore */ '/src/engine/systems/compaction' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState();
    const ctx = { emit() {}, dirty() {} };
    const out: Record<number, string[]> = {};
    for (const c of [8, 14, 20]) {
      const got = new Set<string>();
      for (let i = 0; i < 4000; i++) {
        const id = comp.rollDeepEntry(s, ctx, c);
        if (id) got.add(id);
      }
      out[c] = [...got];
    }
    return { out, table: comp.deepGatesFor('ferrite').map((g: { at: number; materialId: string }) => `${g.at}:${g.materialId}`) };
  });
  console.log(`      ferrite ladder: ${gates.table.join('  ')}`);
  check(gates.out[8], ['wormsteel'], [], 'c>=8 pays Wormsteel');
  check(gates.out[14], ['lodestonecored'], [], 'c>=14 pays Lodestone-Cored');
  check(gates.out[20], ['poleiron'], [], 'c>=20 pays Poleiron');

  // ═══ D — THE SIX ORPHANS ═════════════════════════════════════════════════
  console.log('\nD — all six combat orphans dropping, through the real harvest path');
  const drops = await page.evaluate(async (ids) => {
    const w = window as unknown as Record<string, never>;
    const e = w['__engine'] as unknown as { getState: () => never };
    const dropsMod = await import(/* @vite-ignore */ '/src/engine/systems/drops' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const rolls = await import(/* @vite-ignore */ '/src/engine/content/rolls' + '.ts');
    const s = e.getState() as unknown as { depth: number };
    const cache = new modsMod.ModifierCache();
    const ctx = { emit() {}, dirty() {} };
    const found: Record<string, { at: number; n: number }[]> = {};
    for (const st of rolls.authoredRoll('ferrite') as { depth: number; name: string }[]) {
      const before: Record<string, number> = {};
      for (const id of ids) before[id] = forge.materialCount(s, id);
      s.depth = st.depth;
      cache.invalidate();
      // The SAME function a chip calls. Not `rollDrop`.
      for (let i = 0; i < 500; i++) dropsMod.rollForDrop(s, cache, ctx, 40, 1, 'verify');
      for (const id of ids) {
        const n = forge.materialCount(s, id) - before[id]!;
        if (n > 0) (found[id] ??= []).push({ at: st.depth, n });
      }
    }
    // A CONTROL: a depth with no burying station near it.
    const beforeCtl: Record<string, number> = {};
    for (const id of ids) beforeCtl[id] = forge.materialCount(s, id);
    s.depth = 125; cache.invalidate();
    for (let i = 0; i < 2500; i++) dropsMod.rollForDrop(s, cache, ctx, 40, 1, 'verify');
    const barren = ids.filter((id) => forge.materialCount(s, id) - beforeCtl[id]! > 0);
    return { found, barren };
  }, ORPHANS);
  for (const id of ORPHANS) {
    const at = drops.found[id] ?? [];
    console.log(`      ${id.padEnd(15)} ${at.map((x) => `${x.n}@${x.at}m`).join(' ') || 'NONE'}`);
  }
  check(ORPHANS.filter((id) => !drops.found[id]), [], ['x'], 'all six drop in play');
  check(drops.barren, [], ['x'], '...and none of them at depth 125, where nothing buries them');

  // ═══ E — A WALL FACING A TIER GATE ═══════════════════════════════════════
  console.log('\nE — a WALL facing a real tier gate');
  const wall = await page.evaluate(async () => {
    const rolls = await import(/* @vite-ignore */ '/src/engine/content/rolls' + '.ts');
    const shells = await import(/* @vite-ignore */ '/src/engine/shells' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { depth: number };
    const walls = (rolls.authoredRoll('ferrite') as { depth: number; name: string; type: string; hardness?: number }[])
      .filter((d) => d.type === 'wall');
    const gates = shells.shellDef('ferrite').walls as { depth: number; tier: number }[];
    return {
      walls: walls.map((d) => `${d.name} ${d.depth}m h${d.hardness}`),
      gates: gates.map((g) => `${g.depth}m tier ${g.tier}`),
      // The step past POLEBREAK is the one that asks for the tool.
      atWall: forge.requiredTier(s, 39),
      pastWall: forge.requiredTier(s, 40),
    };
  });
  console.log(`      walls: ${wall.walls.join(' · ')}`);
  console.log(`      gates: ${wall.gates.join(' · ')}`);
  check({ at: wall.atWall, past: wall.pastWall }, { at: 3, past: 4 }, { at: 4, past: 4 },
    'standing at POLEBREAK (39m) asks tier 3; the next step asks tier 4');

  // ═══ F — GEAR AT A FERRITE REST ══════════════════════════════════════════
  console.log('\nF — gear swapped at a Ferrite REST');
  const gear = await page.evaluate(async () => {
    const g = await import(/* @vite-ignore */ '/src/engine/systems/gear' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string } }>;
    const s = w['__engine']!.getState() as unknown as {
      depth: number; gear: { owned: string[]; worn: Record<string, string | null> };
    };
    g.ensureGear(s as never);
    s.gear.owned = ['sableslamp'];
    s.depth = 60;
    const away = w['__engine']!.dispatch({ type: 'equipGear', slot: 'lamp', id: 'sableslamp' });
    s.depth = 112; // Iron Vespers
    const at = w['__engine']!.dispatch({ type: 'equipGear', slot: 'lamp', id: 'sableslamp' });
    return {
      awayOk: away.ok, awayReason: away.reason ?? '', atOk: at.ok,
      worn: s.gear.worn['lamp'], rest: g.atRest(s as never), near: g.nearestRest(s as never),
    };
  });
  console.log(`      away from a rest: "${gear.awayReason}"`);
  check({ away: gear.awayOk, at: gear.atOk, worn: gear.worn },
    { away: false, at: true, worn: 'sableslamp' }, { away: true, at: true, worn: 'sableslamp' },
    'refused at 60m, allowed at Iron Vespers (112m)');

  // ═══ G — A BAND SHORED IN FERRITE ════════════════════════════════════════
  console.log('\nG — a band shored in Ferrite');
  const shore = await page.evaluate(async () => {
    const sh = await import(/* @vite-ignore */ '/src/engine/systems/shoring' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string } }>;
    const s = w['__engine']!.getState() as unknown as {
      roll: { rig?: boolean }; currencies: Record<string, { mul(n: number): { add(n: number): never } }>;
      casting: { rack: unknown[] }; depth: number; shaft: { reached: number; drift?: number };
    };
    // The RIG IS A TECHNIQUE: raised at Loam's Shoring Deep, and `breach.ts`
    // never touches `state.roll`, so it is already standing down here.
    s.roll.rig = true;
    s.currencies['flux'] = s.currencies['ingot']!.mul(0).add(1e14);
    s.casting.rack = Array.from({ length: 8 }, (_, i) =>
      ({ id: `p${i}`, materialId: 'ironbloom', shape: 'head', purity: 50, traits: [] }));
    const first = sh.bands(s)[0] as { def: { id: string; name: string }; from: number; to: number };
    const cost = sh.shoreCost(s, first.def.id) as { brick: { toString(): string }; parts: number };
    const r = w['__engine']!.dispatch({ type: 'shoreBand', stationId: first.def.id });
    s.depth = 240; s.shaft.reached = 240;
    w['__engine']!.dispatch({ type: 'collapse' });
    return {
      band: `${first.def.name} ${first.from}-${first.to}m`,
      cost: `${cost.brick.toString()} Flux + ${cost.parts} cast`,
      ok: r.ok, reason: r.reason ?? '',
      drift: sh.driftDepth(s), landed: s.depth,
    };
  });
  console.log(`      ${shore.band} — ${shore.cost}`);
  check({ ok: shore.ok, drift: shore.drift, landed: shore.landed },
    { ok: true, drift: 14, landed: 14 }, { ok: false, drift: 0, landed: 0 },
    'timbered, and the Collapse lands the run at 14m instead of the surface');
  /**
   * AND THE PANEL IS REACHABLE. `ShoringPanel` gated on the rig's own WRECK
   * being in the current shell, which is true only in Loam — so shoring worked
   * in Ferrite and had no screen. Found by looking at the first Ferrite
   * screenshot, not by a test, which is why this one exists now.
   */
  await tab(page, 'shaft');
  await dismiss(page);
  await page.waitForTimeout(500);
  const panel = await page.evaluate(() => ({
    panel: document.querySelectorAll('[data-testid="shoring-panel"]').length,
    drift: (document.querySelector('[data-testid="drift-depth"]') as HTMLElement | null)?.innerText ?? '',
    chain: (document.querySelector('[data-testid="drift-chain"]') as HTMLElement | null)?.innerText ?? '',
  }));
  console.log(`      panel says: "${panel.drift}" · chain "${panel.chain.replace(/\n/g, ' ')}"`);
  check({ panel: panel.panel, drift: panel.drift }, { panel: 1, drift: 'the fall lands at 14m' },
    { panel: 0, drift: '' }, 'the Drifts panel is on the Ferrite Shaft screen');
  await page.getByTestId('shoring-panel').screenshot({ path: `${OUT}/a87-ferrite-drifts.png` }).catch(() => {});

  // ═══ H — THE CIRCUIT READING A FERRITE STATION ═══════════════════════════
  console.log('\nH — the Circuit reading a Ferrite station');
  const circuit = await page.evaluate(async () => {
    const c = await import(/* @vite-ignore */ '/src/engine/systems/circuit' + '.ts');
    const mod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { depth: number; kiln: { built: boolean; feeding: boolean } };
    const m = new mod.ModifierCache(); m.invalidate();
    s.kiln.built = true;
    const reads = (c.availableReads(s) as { id: string; label: string }[]).map((r) => r.id);
    s.depth = 85; // The Attracting Dark
    const at = c.stationHere(s) as { name: string; type: string };
    const seam = (c.READS as { id: string; now: (s: unknown, m: unknown) => string }[])
      .find((r) => r.id === 'seam')!.now(s, m);
    const station = (c.READS as { id: string; now: (s: unknown, m: unknown) => string }[])
      .find((r) => r.id === 'station')!.now(s, m);
    return { reads, name: at.name, type: at.type, seam, station };
  });
  console.log(`      the seam here    ${circuit.seam}`);
  console.log(`      the station here ${circuit.station}`);
  check(circuit.reads.includes('seam') && circuit.reads.includes('station') && circuit.reads.includes('hazard'),
    true, false, 'the world reads are live in Ferrite');
  check({ name: circuit.name, type: circuit.type }, { name: 'The Attracting Dark', type: 'hazard' },
    { name: '', type: '' }, '...and they name the station you are standing in');

  // ═══ I — PILLAR 2 ════════════════════════════════════════════════════════
  console.log('\nI — PILLAR 2: geography is not income');
  const pillar = await page.evaluate(async () => {
    const eng = await import(/* @vite-ignore */ '/src/engine/index' + '.ts');
    const mod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const read = (shell: string) => {
      const s = eng.createEngine({ nowMs: 0 }).getState();
      s.shell.current = shell;
      roll.ensureRoll(s);
      s.depth = 48;                              // THE SAME DEPTH IN BOTH ARMS
      const m = new mod.ModifierCache(); m.invalidate();
      return { dps: Math.round(face.dpsMax(s, m).toNumber() * 1e6), stations: roll.shellRoll(s).length };
    };
    return { ferrite: read('ferrite'), verdance: read('verdance') };
  });
  console.log(`      ferrite  (19 stations) dpsMax ${pillar.ferrite.dps}`);
  console.log(`      verdance (no Roll)     dpsMax ${pillar.verdance.dps}`);
  check(pillar.ferrite.dps, pillar.verdance.dps, pillar.verdance.dps + 1, 'dpsMax unmoved at depth 48');
  check({ f: pillar.ferrite.stations, v: pillar.verdance.stations }, { f: 19, v: 0 }, { f: 0, v: 0 },
    'and one arm really has a Roll — not a vacuous comparison');

  // ═══ WHAT REMAINS UNAUTHORED ═════════════════════════════════════════════
  console.log('\nWhat remains unauthored, sized');
  let stations = 0;
  for (const [shell, n, floor, why] of UNAUTHORED) {
    stations += n as number;
    console.log(`      ${String(shell).padEnd(10)} ${String(n).padStart(2)} stations to ${floor}m — ${why}`);
  }
  console.log(`      TOTAL ${stations} stations across five shells (Loam 17 + Ferrite 19 = 36 written)`);

  // ═══ K — 380px ═══════════════════════════════════════════════════════════
  console.log('\nK — 380px, overflow and page errors');
  await tab(page, 'shaft');
  await dismiss(page);
  await page.evaluate(() => {
    const w = window as unknown as Record<string, { getState: () => { depth: number } }>;
    w['__engine']!.getState().depth = 85;
  });
  await page.waitForTimeout(600);
  const layout = await page.evaluate(() => {
    const over: string[] = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) {
        over.push(`${el.tagName}.${(el.className || '').toString().slice(0, 40)}`);
      }
    }
    // CLIPPING, measured. A truncating span reads perfectly out of a zero-width
    // box, so innerText cannot see this and getBoundingClientRect can.
    const clipped: string[] = [];
    for (const el of document.querySelectorAll('.truncate')) {
      const e = el as HTMLElement;
      if (!e.innerText.trim()) continue;
      if (e.getBoundingClientRect().width >= 24) continue;
      if (e.scrollWidth <= e.clientWidth + 2) continue;
      clipped.push(`"${e.innerText.trim().slice(0, 20)}" at ${Math.round(e.getBoundingClientRect().width)}px`);
    }
    return { over: over.length, first: over.slice(0, 3), clipped, doc: document.documentElement.scrollWidth };
  });
  check(layout.over, 0, 1, `0 elements overflow 380px (doc ${layout.doc}px)`);
  if (layout.over > 0) console.log(`      ${layout.first.join(' | ')}`);
  check(layout.clipped, [], ['x'], '0 station names clipped to nothing');
  await page.screenshot({ path: `${OUT}/a87-ferrite-shaft.png`, fullPage: true }).catch(() => {});
  check(errors.length, 0, 1, '0 page errors');
  for (const e of errors.slice(0, 5)) console.log(`      ${e}`);

  console.log(`\n${problems.length === 0 ? 'ALL PASS' : `${problems.length} PROBLEM(S)`}`);
  for (const p of problems) console.log(`  - ${p}`);
  console.log(`shots in ${OUT}/`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
