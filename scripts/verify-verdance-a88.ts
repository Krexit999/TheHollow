/**
 * VERDANCE'S GEOGRAPHY, DRIVEN IN THE REAL GAME (A.88).
 *
 *   A  the Roll rendering in the Shaft — three legible ahead, the floor pinned
 *   B  a Collapse: names and depths persist while contents re-roll
 *   C  the three deep-entry gates paying VERDANCE's stones, not Loam's
 *   D  all six combat orphans dropping, with where from, plus a barren control
 *   E  a WALL facing a real tier gate
 *   F  gear swapped at a Verdance REST, refused elsewhere
 *   G  a band shored in Verdance, with the purse named correctly
 *   H  the Circuit reading a Verdance station
 *   I  the clone check green across every authored shell
 *   J  dpsMax unmoved at equal depth
 *   K  §23 — the opening beats, including the ones this phase could break
 *   L  380px, 0 overflow, 0 page errors
 *
 * Every assertion goes through `check(actual, want, bad, label)` and reports
 * VACUOUS if the known-bad value equals the expected one. Clipping is asserted
 * with getBoundingClientRect, never innerText.
 *
 *   npx tsx scripts/verify-verdance-a88.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots-a88';
const W = 380, H = 1600;

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

const ORPHANS = ['throatroot', 'mothspool', 'wireweed', 'palefiber', 'mawpith', 'plentyheart'];

/** Item 7, printed rather than asserted. */
const UNAUTHORED = [
  ['GLASSMERE', 18, 250, '§7.2 wants unallocated-band behaviour the Roll would key off; three keystones authored (Prism Fall 20, Patternwright\'s Rest 90, The Balance House 130)'],
  ['CINDER', 18, 250, 'needs a `flood` StationType first — §36 wants two FLOOD-eligible stations and the union has no such member. Keystones: Boilerworks 40, Vent Row 58, Retort Hall 120'],
  ['HOLLOW', 16, 250, '§19 authors its chemistry IN FULL, so it has the most already written around it. Keystones: Condenser Wreck 55, Witness Hall 140'],
  ['ALEPH', 6, 40, 'the short shell, and the cheapest left. Keystones: The Author\'s Cut 16, The Reading Room 32'],
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

  // ═══ K — §23 ON A FRESH SAVE ═════════════════════════════════════════════
  console.log('\nK — §23, the first 45 minutes (read before the fixture is dirtied)');
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
      loamStations: roll.shellRoll(s).length,
      firstStation: roll.shellRoll(s)[0]?.name,
      loamGate8: comp.deepGatesFor('loam').find((g: { at: number }) => g.at === 8)?.materialId,
      loamGate20: comp.deepGatesFor('loam').find((g: { at: number }) => g.at === 20)?.materialId,
    };
  });
  check(beats.cells, 36, 0, '0:00 — a 6×6 grid');
  check(beats.bladeCost, 50, 0, '0:04 — BLADE at 50 Dust');
  check(beats.dps, 2.88, 0, '0:40 — the field ceiling is 2.88/s');
  check(beats.loamStations, 17, 0, 'Loam still has its seventeen rows');
  check(beats.firstStation, 'The Turnrow', '', '...starting at The Turnrow');
  check([beats.loamGate8, beats.loamGate20], ['umberjade', 'deepgrave'], ['sapstone', 'thornwall'],
    '...and its deep-entry ladder is untouched');

  // ═══ FIXTURE ═════════════════════════════════════════════════════════════
  console.log('\nFIXTURE — a player standing in Verdance');
  await setup(page, `
    const s = engine.getState();
    s.shell.current = 'verdance';
    s.shell.breachCount = 2;
    s.depthRecords['loam'] = 150;
    s.depthRecords['ferrite'] = 250;
    s.depthRecords['verdance'] = 290;
    s.maxDepthRecord = 290;
  `);
  const fixture = await page.evaluate(async () => {
    const rolls = await import(/* @vite-ignore */ '/src/engine/content/rolls' + '.ts');
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState();
    return {
      authored: rolls.AUTHORED_SHELLS.slice().sort(),
      unauthored: rolls.unauthoredShells(),
      stations: roll.shellRoll(s).length,
      types: roll.shellRoll(s).reduce((acc: Record<string, number>, d: { type: string }) => {
        acc[d.type] = (acc[d.type] ?? 0) + 1; return acc;
      }, {}),
      rows: roll.shellRoll(s).map((d: { depth: number; name: string; type: string }) =>
        `${String(d.depth).padStart(3)} ${d.name} [${d.type}]`),
    };
  });
  check(fixture.authored, ['ferrite', 'loam', 'verdance'], [], 'three shells are authored');
  check(fixture.stations, 20, 0, 'Verdance has twenty stations');
  console.log(`      ${JSON.stringify(fixture.types)}`);
  for (const r of fixture.rows) console.log(`      ${r}`);
  console.log(`      still unauthored: ${fixture.unauthored.join(', ')}`);

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
      floorPinned: rows.some((r) => (r as HTMLElement).innerText.includes('THORNWALL')),
      names: rows.map((r) => (r as HTMLElement).innerText
        .replace(/\s+/g, ' ').replace(/^[^A-Za-z0-9]*/, '').slice(0, 24)).slice(0, 5),
    };
  });
  console.log(`      legible rows: ${rendered.legible} — ${rendered.names.join(' · ')}`);
  check(rendered.legible >= 4, true, false, 'the near rows are legible');
  check(rendered.floorPinned, true, false, 'and THORNWALL is pinned at the bottom from arrival');
  await page.screenshot({ path: `${OUT}/a88-verdance-roll.png`, fullPage: true }).catch(() => {});

  const fog = await page.evaluate(async () => {
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { depth: number };
    s.depth = 56;
    const rows = roll.rollRows(s) as { legible: boolean; behind: boolean; def: { name: string } }[];
    const ahead = rows.filter((r) => !r.behind);
    return {
      n: ahead.filter((r) => r.legible).length,
      next: ahead.filter((r) => r.legible).map((r) => r.def.name),
    };
  });
  check(fog.n, 3, 0, `three legible ahead (${fog.next.join(', ')})`);

  // ═══ B — A COLLAPSE ══════════════════════════════════════════════════════
  console.log('\nB — a Collapse: names and depths persist, contents re-roll');
  const collapse = await page.evaluate(async () => {
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
      s.depth = 280; s.shaft.reached = 280;
      if (!w['__engine']!.dispatch({ type: 'collapse' }).ok) break;
      falls += 1;
      const now = contents();
      moved += now.filter((v, j) => v !== prev[j]).length;
      prev = now;
    }
    return { same: JSON.stringify(authored()) === JSON.stringify(beforeA), moved, falls };
  });
  check({ same: collapse.same, falls: collapse.falls }, { same: true, falls: 8 }, { same: false, falls: 8 },
    'eight Collapses moved no name, depth, type or hardness');
  check(collapse.moved > 40, true, false,
    `and contents re-rolled ${collapse.moved} times across those eight — the control is real`);

  // ═══ C — THE DEEP-ENTRY GATES ════════════════════════════════════════════
  console.log("\nC — the three gates pay Verdance's stones, not Loam's");
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
    return { out, table: comp.deepGatesFor('verdance').map((g: { at: number; materialId: string }) => `${g.at}:${g.materialId}`) };
  });
  console.log(`      verdance ladder: ${gates.table.join('  ')}`);
  check(gates.out[8], ['sapstone'], ['umberjade'], 'c>=8 pays Sapstone (reused, not new)');
  check(gates.out[14], ['bindingclay'], ['graveclaydeep'], 'c>=14 pays Binding Clay (reused, not new)');
  check(gates.out[20], ['thornwall'], ['deepgrave'], 'c>=20 pays Thornwall Heart — the only new stone');

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
    for (const st of rolls.authoredRoll('verdance') as { depth: number }[]) {
      const before: Record<string, number> = {};
      for (const id of ids) before[id] = forge.materialCount(s, id);
      s.depth = st.depth;
      cache.invalidate();
      for (let i = 0; i < 500; i++) dropsMod.rollForDrop(s, cache, ctx, 40, 1, 'verify');
      for (const id of ids) {
        const n = forge.materialCount(s, id) - before[id]!;
        if (n > 0) (found[id] ??= []).push({ at: st.depth, n });
      }
    }
    // A BARREN CONTROL: 230m — The Split is at 209 and Old Plenty's Round at
    // 240, both outside the +-4 reach.
    const beforeCtl: Record<string, number> = {};
    for (const id of ids) beforeCtl[id] = forge.materialCount(s, id);
    s.depth = 230; cache.invalidate();
    for (let i = 0; i < 3000; i++) dropsMod.rollForDrop(s, cache, ctx, 40, 1, 'verify');
    const barren = ids.filter((id) => forge.materialCount(s, id) - beforeCtl[id]! > 0);
    return { found, barren };
  }, ORPHANS);
  for (const id of ORPHANS) {
    const at = drops.found[id] ?? [];
    console.log(`      ${id.padEnd(13)} ${at.map((x) => `${x.n}@${x.at}m`).join(' ') || 'NONE'}`);
  }
  check(ORPHANS.filter((id) => !drops.found[id]), [], ['x'], 'all six drop in play');
  check(drops.barren, [], ['x'], '...and none of them at 230m, where nothing buries them');

  // ═══ E — A WALL FACING A TIER GATE ═══════════════════════════════════════
  console.log('\nE — a WALL facing a real tier gate');
  const wall = await page.evaluate(async () => {
    const rolls = await import(/* @vite-ignore */ '/src/engine/content/rolls' + '.ts');
    const shells = await import(/* @vite-ignore */ '/src/engine/shells' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { depth: number };
    const walls = (rolls.authoredRoll('verdance') as { depth: number; name: string; type: string; hardness?: number }[])
      .filter((d) => d.type === 'wall');
    const gates = shells.shellDef('verdance').walls as { depth: number; tier: number }[];
    return {
      walls: walls.map((d) => `${d.name} ${d.depth}m h${d.hardness}`),
      gates: gates.map((g) => `${g.depth}m tier ${g.tier}`),
      atWall: forge.requiredTier(s, 44),
      pastWall: forge.requiredTier(s, 45),
    };
  });
  console.log(`      walls: ${wall.walls.join(' · ')}`);
  console.log(`      gates: ${wall.gates.join(' · ')}`);
  check({ at: wall.atWall, past: wall.pastWall }, { at: 6, past: 7 }, { at: 7, past: 7 },
    'standing at BRAMBLEWALL (44m) asks tier 6; the next step asks tier 7');

  // ═══ F — GEAR AT A VERDANCE REST ═════════════════════════════════════════
  console.log('\nF — gear swapped at a Verdance REST');
  const gear = await page.evaluate(async () => {
    const g = await import(/* @vite-ignore */ '/src/engine/systems/gear' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string } }>;
    const s = w['__engine']!.getState() as unknown as {
      depth: number; gear: { owned: string[]; worn: Record<string, string | null> };
    };
    g.ensureGear(s as never);
    s.gear.owned = ['sableslamp'];
    s.depth = 200;
    const away = w['__engine']!.dispatch({ type: 'equipGear', slot: 'lamp', id: 'sableslamp' });
    s.depth = 145; // The Quiet Quarter
    const at = w['__engine']!.dispatch({ type: 'equipGear', slot: 'lamp', id: 'sableslamp' });
    return { awayOk: away.ok, awayReason: away.reason ?? '', atOk: at.ok, worn: s.gear.worn['lamp'] };
  });
  console.log(`      away from a rest: "${gear.awayReason}"`);
  check({ away: gear.awayOk, at: gear.atOk, worn: gear.worn },
    { away: false, at: true, worn: 'sableslamp' }, { away: true, at: true, worn: 'sableslamp' },
    'refused at 200m, allowed at The Quiet Quarter (145m)');

  // ═══ G — A BAND SHORED IN VERDANCE ═══════════════════════════════════════
  console.log('\nG — a band shored in Verdance, and the purse named correctly');
  const shore = await page.evaluate(async () => {
    const sh = await import(/* @vite-ignore */ '/src/engine/systems/shoring' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string } }>;
    const s = w['__engine']!.getState() as unknown as {
      roll: { rig?: boolean }; currencies: Record<string, { mul(n: number): { add(n: number): never } }>;
      casting: { rack: unknown[] }; depth: number; shaft: { reached: number };
    };
    // THE RIG IS A TECHNIQUE raised at Loam's Shoring Deep; `state.roll` is
    // never touched by a Breach, so it is standing two shells down.
    s.roll.rig = true;
    const first = sh.bands(s)[0] as { def: { id: string; name: string }; from: number; to: number };
    // STOCK THE RACK FIRST. `shoreBlocker` reports the PARTS refusal before the
    // currency one, so reading it on an empty rack tests the wrong string — the
    // first cut of this check read "Needs 1 cast parts" and called it a purse.
    s.casting.rack = Array.from({ length: 8 }, (_, i) =>
      ({ id: `p${i}`, materialId: 'sporewood', shape: 'head', purity: 50, traits: [] }));
    const poor = sh.shoreBlocker(s, first.def.id) as string;
    s.currencies['sap'] = s.currencies['spore']!.mul(0).add(1e16);
    const cost = sh.shoreCost(s, first.def.id) as { brick: { toString(): string }; parts: number };
    const r = w['__engine']!.dispatch({ type: 'shoreBand', stationId: first.def.id });
    s.depth = 280; s.shaft.reached = 280;
    w['__engine']!.dispatch({ type: 'collapse' });
    return {
      band: `${first.def.name} ${first.from}-${first.to}m`,
      cost: `${cost.brick.toString()} + ${cost.parts} cast`,
      poor, ok: r.ok, drift: sh.driftDepth(s), landed: s.depth,
    };
  });
  console.log(`      ${shore.band} — ${shore.cost}`);
  console.log(`      the refusal reads: "${shore.poor}"`);
  check(shore.poor, 'Not enough Sap.', 'Not enough Brick.', 'the purse is named per shell');
  check({ ok: shore.ok, drift: shore.drift, landed: shore.landed },
    { ok: true, drift: 12, landed: 12 }, { ok: false, drift: 0, landed: 0 },
    'timbered, and the Collapse lands the run at 12m instead of the surface');

  await tab(page, 'shaft');
  await dismiss(page);
  await page.waitForTimeout(500);
  const panel = await page.evaluate(() => ({
    n: document.querySelectorAll('[data-testid="shoring-panel"]').length,
    drift: (document.querySelector('[data-testid="drift-depth"]') as HTMLElement | null)?.innerText ?? '',
  }));
  check({ n: panel.n, drift: panel.drift }, { n: 1, drift: 'the fall lands at 12m' }, { n: 0, drift: '' },
    'and the Drifts panel is on the Verdance Shaft screen');
  await page.getByTestId('shoring-panel').screenshot({ path: `${OUT}/a88-verdance-drifts.png` }).catch(() => {});

  // ═══ H — THE CIRCUIT ═════════════════════════════════════════════════════
  console.log('\nH — the Circuit reading a Verdance station');
  const circuit = await page.evaluate(async () => {
    const c = await import(/* @vite-ignore */ '/src/engine/systems/circuit' + '.ts');
    const mod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { depth: number; kiln: { built: boolean } };
    const m = new mod.ModifierCache(); m.invalidate();
    s.kiln.built = true;
    const reads = (c.availableReads(s) as { id: string }[]).map((r) => r.id);
    s.depth = 72; // The Cankerworks
    const at = c.stationHere(s) as { name: string; type: string };
    const now = (id: string) => (c.READS as { id: string; now: (a: unknown, b: unknown) => string }[])
      .find((r) => r.id === id)!.now(s, m);
    return { reads, name: at.name, type: at.type, seam: now('seam'), station: now('station') };
  });
  console.log(`      the seam here    ${circuit.seam}`);
  console.log(`      the station here ${circuit.station}`);
  check(['seam', 'station', 'hazard'].every((r) => circuit.reads.includes(r)), true, false,
    'the world reads are live in Verdance');
  check({ name: circuit.name, type: circuit.type }, { name: 'The Cankerworks', type: 'hazard' },
    { name: '', type: '' }, '...and they name the station you are standing in');

  // ═══ I — THE CLONE CHECK ═════════════════════════════════════════════════
  console.log('\nI — the clone check, across every authored shell');
  const clones = await page.evaluate(async () => {
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const defs = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const rolls = await import(/* @vite-ignore */ '/src/engine/content/rolls' + '.ts');
    const out: Record<string, string[]> = {};
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
      out[shell] = hits;
    }
    return out;
  });
  for (const [shell, hits] of Object.entries(clones)) {
    console.log(`      ${shell.padEnd(9)} ${hits.length === 0 ? 'no clones' : hits.join(' · ')}`);
  }
  check(Object.values(clones).flat(), [], ['x'], 'no two mined materials in any shell make the same head');

  // ═══ J — PILLAR 2 ════════════════════════════════════════════════════════
  console.log('\nJ — PILLAR 2: geography is not income');
  const pillar = await page.evaluate(async () => {
    const eng = await import(/* @vite-ignore */ '/src/engine/index' + '.ts');
    const mod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const rolls = await import(/* @vite-ignore */ '/src/engine/content/rolls' + '.ts');
    const read = (shell: string) => {
      const s = eng.createEngine({ nowMs: 0 }).getState();
      s.shell.current = shell;
      roll.ensureRoll(s);
      s.depth = 56;                              // THE SAME DEPTH IN BOTH ARMS
      const m = new mod.ModifierCache(); m.invalidate();
      return { dps: Math.round(face.dpsMax(s, m).toNumber() * 1e6), n: roll.shellRoll(s).length };
    };
    const none = rolls.anUnauthoredShell() as string;
    return { verdance: read('verdance'), none: read(none), noneId: none };
  });
  console.log(`      verdance (20 stations) dpsMax ${pillar.verdance.dps}`);
  console.log(`      ${pillar.noneId.padEnd(8)} (no Roll)     dpsMax ${pillar.none.dps}`);
  check(pillar.verdance.dps, pillar.none.dps, pillar.none.dps + 1, 'dpsMax unmoved at depth 56');
  check({ v: pillar.verdance.n, n: pillar.none.n }, { v: 20, n: 0 }, { v: 0, n: 0 },
    'and one arm really has a Roll — not a vacuous comparison');

  // ═══ WHAT REMAINS ════════════════════════════════════════════════════════
  console.log('\nWhat remains unauthored, sized');
  let stations = 0;
  for (const [shell, n, floor, why] of UNAUTHORED) {
    stations += n as number;
    console.log(`      ${String(shell).padEnd(10)} ~${String(n).padStart(2)} stations to ~${floor}m — ${why}`);
  }
  console.log(`      TOTAL ~${stations} across four shells (Loam 17 + Ferrite 19 + Verdance 20 = 56 written)`);

  // ═══ L — 380px ═══════════════════════════════════════════════════════════
  console.log('\nL — 380px, overflow and page errors');
  await tab(page, 'shaft');
  await dismiss(page);
  await page.evaluate(() => {
    const w = window as unknown as Record<string, { getState: () => { depth: number } }>;
    w['__engine']!.getState().depth = 120;
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
  await page.screenshot({ path: `${OUT}/a88-verdance-shaft.png`, fullPage: true }).catch(() => {});
  check(errors.length, 0, 1, '0 page errors');
  for (const e of errors.slice(0, 5)) console.log(`      ${e}`);

  console.log(`\n${problems.length === 0 ? 'ALL PASS' : `${problems.length} PROBLEM(S)`}`);
  for (const p of problems) console.log(`  - ${p}`);
  console.log(`shots in ${OUT}/`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
