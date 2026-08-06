/**
 * A.110 DRIVEN IN THE REAL GAME — two ruled fixes, and §23 re-cut.
 *
 *   A  the two fuel stones are authored, PLACE-BOUND, and producerless stays 0
 *   B  three burn profiles, all burnable, at the real Kiln panel
 *   C  the Ash counter moving on the live drop path
 *   D  the dangling-fuel audit FAILING on a planted row, then green again
 *   E  the field reaching 8x8, and the minute it arrives
 *   F  `expand` with and against a Collapse reset — driven, then measured
 *   G  the re-cut §23 table, a verdict per beat, and zero NEVER
 *   H  every audit green
 *   I  dpsMax unmoved at the SAME depth with the new stones live
 *   J  380px, 0 overflow, 0 page errors
 *
 * NO NAMED FUNCTION MAY BE DECLARED INSIDE A `page.evaluate` BODY — esbuild's
 * `keepNames` rewrites `const f = () => {}` into `__name(...)`, which does not
 * exist in the page. It has cost ten runs across A.90-A.105.
 *
 * The long arms are NOT re-run here. They write to `sim-out/` and exit, per the
 * standing rule; this reads what they wrote and fails if it is missing, so a
 * green run cannot mean "the file was not there".
 *
 *   npx tsx scripts/verify-a110.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';
import { MATERIALS } from '../src/engine/materials';
import { KILN_FUELS } from '../src/engine/content/kilnFuel';
import { traitsOf } from '../src/engine/traits';
import { LOAM_ROLL } from '../src/engine/content/shell1/roll';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots-a110';
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

/** Read a sim-out file, or fail loudly. A missing file is not a pass. */
function simOut(name: string): string {
  const path = `sim-out/${name}`;
  if (!existsSync(path)) {
    problems.push(`${name} is missing — re-run the arm that writes it`);
    console.log(`  MISSING  ${path} — the arm that writes it has not been run`);
    return '';
  }
  return readFileSync(path, 'utf8');
}

/** Run a script and return {code, out} — the EXIT STATUS, never a pipe. */
function run(script: string): { code: number; out: string } {
  try {
    return { code: 0, out: execFileSync('npx', ['tsx', script], { encoding: 'utf8', shell: true }) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    return { code: err.status ?? 1, out: err.stdout ?? '' };
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  // ═══ A — THE TWO STONES ═══════════════════════════════════════════════════
  console.log('\n== A — the stones KILN_FUELS has been naming ===================');
  const byId = new Map(MATERIALS.map((m) => [m.id, m]));
  for (const id of ['ash', 'loam']) {
    const m = byId.get(id);
    const places = LOAM_ROLL.filter((st) => (st.remains ?? []).includes(id)).map((st) => `${st.name}@${st.depth}`);
    console.log(`  ${id.padEnd(5)} ${m ? `${m.name} · ${m.rarity} · source ${m.source} · ${traitsOf(id).join('+')}` : 'NOT AUTHORED'}`
      + `  ->  ${places.join(', ') || 'nowhere'}`);
  }
  check(['ash', 'loam'].every((id) => byId.has(id)), true, false, 'A1 both stones are in the registry');
  check(['ash', 'loam'].map((id) => byId.get(id)?.source), ['remains', 'remains'], ['deep', 'deep'],
    'A2 ...as REMAINS, so neither dilutes the four Loam commons the tier-II floor recipe is made of');
  check(['ash', 'loam'].every((id) => traitsOf(id).length >= 2), true, false, 'A3 ...each carrying real traits');
  check(['ash', 'loam'].every((id) => LOAM_ROLL.filter((st) => (st.remains ?? []).includes(id)).length >= 2),
    true, false, 'A4 ...and each buried at TWO places, so leaving the shallow band does not cut the supply');
  check(KILN_FUELS.every((f) => byId.has(f.materialId)), true, false, 'A5 every burn profile resolves to a real stone');

  const sources = run('scripts/material-sources.ts');
  const nothing = /MATERIALS NOTHING PRODUCES: (\d+)/.exec(sources.out)?.[1];
  const total = /(\d+) materials, (\d+) with a route/.exec(sources.out);
  console.log(`  ${total?.[1]} materials · ${total?.[2]} with a route · producerless ${nothing}`);
  check(nothing, '0', '2', 'A6 PRODUCERLESS STAYS 0');

  // ═══ B — THREE PROFILES, ALL BURNABLE ═════════════════════════════════════
  console.log('\n== B — three burn profiles at the real Kiln ====================');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await dismiss(page);

  await setup(page, `
    const s = engine.getState();
    s.kiln.built = true;
    s.kiln.feeding = true;
    s.depth = 9;
    s.maxDepthRecord = 40;
    s.depthRecords['loam'] = 40;
    s.currencies['dust'] = s.currencies['dust'].add(500000);
  `);
  // The stones go in through `addMaterial`, the engine's own door — a hand-written
  // stack is a fixture that can drift from the shape the Hold actually stores.
  await page.evaluate(async () => {
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    for (const id of ['ash', 'marl', 'loam']) forge.addMaterial(s, id, 60, 40);
    w['__engine'].tick(1);
  });
  await tab(page, 'kiln');
  await dismiss(page);

  /**
   * THE PANEL, not the registry: `panels.tsx` disables a fuel you cannot feed,
   * so "all three are burnable" is a question about what the player can click.
   *
   * The fuel control is the portalled `Select` (A.37), so it renders NO options
   * until it is opened — a first cut read the trigger's subtree, found zero, and
   * reported the fuels missing. Open it the way a player does, then read the
   * listbox out of the portal at document level.
   */
  await page.click('[role="combobox"][aria-label="Kiln fuel"]');
  await page.waitForSelector('[role="listbox"][aria-label="Kiln fuel"] [role="option"]', { timeout: 5000 });
  const opts = await page.evaluate(() => {
    const list = document.querySelector('[role="listbox"][aria-label="Kiln fuel"]');
    const out: { label: string; disabled: boolean }[] = [];
    for (const o of Array.from(list?.querySelectorAll('[role="option"]') ?? [])) {
      out.push({
        label: (o.textContent ?? '').replace(/\s+/g, ' ').trim(),
        disabled: o.getAttribute('aria-disabled') === 'true',
      });
    }
    return out;
  });
  for (const o of opts) console.log(`  ${o.disabled ? 'DISABLED' : 'offered '}  ${o.label}`);
  const live = opts.filter((o) => !o.disabled && !/Bare fire/.test(o.label));
  check(live.length, KILN_FUELS.length, 0, 'B1 every authored profile is offered and NOT disabled');
  check(live.every((o) => /×\d+/.test(o.label) && !/×0/.test(o.label)), true, false,
    'B2 ...each naming a stock the player actually holds');
  await page.screenshot({ path: `${OUT}/b-kiln-fuels-380.png`, fullPage: true });

  // ...and the ENGINE applies each one. Heat is the kiln's own; the profile is
  // readable exactly when `materialCount >= 1`, which is what was impossible.
  const applied = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const out: Record<string, number> = {};
    for (const id of ['ash', 'marl', 'loam']) {
      const s = w['__engine'].getState();
      s.kiln.heat = 0;
      s.kiln.fuel = id;
      s.kiln.feeding = true;
      s.currencies['dust'] = s.currencies['dust'].add(500000);
      for (let t = 0; t < 20; t++) w['__engine'].tick(1);
      out[id] = Math.round(s.kiln.heat * 1000) / 1000;
    }
    return out;
  });
  console.log(`  heat after 20s fed:  ash ${applied['ash']} · marl ${applied['marl']} · loam ${applied['loam']}`);
  check(applied['ash']! > applied['marl']! && applied['marl']! > applied['loam']!, true, false,
    'B3 the profiles ORDER as authored — ash x1.8 ramps fastest, packed loam x0.85 slowest');

  // ═══ C — THE ASH COUNTER ══════════════════════════════════════════════════
  console.log('\n== C — the counter §23 says starts moving at 4:00 ==============');
  const beats = simOut('a110-beats-3h.md');
  const peakAsh = Number(/peak ash (\d+)/.exec(beats)?.[1] ?? 0);
  const ashAt = /Ash moving\s+got\s+([\d.]+)m/.exec(beats)?.[1];
  console.log(`  peak ash ${peakAsh} · the counter first moved at ${ashAt ?? '—'}m (§23 authors 4:00)`);
  check(peakAsh > 0, true, false, 'C1 the Ash counter MOVES — A.109 read 0 across three hours of every policy');

  // ═══ E + F — THE FIELD ════════════════════════════════════════════════════
  console.log('\n== E — the 8x8 face §23 promises at minute 12 ==================');
  const keep = simOut('a110-expand-keep.md');
  const at = (t: string): number | null => {
    const m = /field 8x8\s+got\s+([\d.]+)m/.exec(t);
    return m ? Number(m[1]) : null;
  };
  const reset = at(beats), kept = at(keep);
  console.log(`  peak: ${/peak face (\d+) cells · peak expand L(\d+)/.exec(beats)?.[0]}`);
  console.log(`  8x8 arrives at ${reset ?? 'NEVER'}min with the Collapse reset · ${kept ?? 'NEVER'}min without it`);
  check(/peak face 64 cells/.test(beats), true, false, 'E1 the field REACHES 8x8 — every prior run peaked at 49');
  check(reset !== null, true, false, 'E2 ...and the beat has a minute on it at last');
  check(reset !== null && reset > 12, true, false, 'E3 ...which is nowhere near §23\'s authored 12:00 — reported, not tuned');

  console.log('\n== F — `expand` with and against a Collapse reset ==============');
  /**
   * DRIVEN, not read off a tag. A boolean in a registry is a claim about what
   * `doCollapse` does; the only proof is to stand a width up, collapse, and
   * look. Both directions, so a run where nothing collapsed cannot read as a
   * pass — which is exactly how this phase's FIRST reset measurement lied.
   */
  const survives = await page.evaluate(async () => {
    const ups = await import(/* @vite-ignore */ '/src/engine/upgrades' + '.ts');
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    const def = ups.allUpgrades().find((u: { id: string }) => u.id === 'expand');
    s.depth = 60; s.maxDepthRecord = 60; s.depthRecords['loam'] = 60;
    s.upgrades['expand'] = 4;
    w['__engine'].tick(0.001);
    // `fieldDims` is the engine's own map from level to grid. Reading `s.face.w`
    // here measured the LAST BUY instead: `applyFieldSize` runs inside
    // `buyUpgrade`, so a level written straight into the save leaves the live
    // face at whatever it already was, and the first cut of this read 6x6.
    const dims = face.fieldDims(4);
    const before = { level: s.upgrades['expand'], w: dims.w, h: dims.h };
    w['__engine'].dispatch({ type: 'collapse' });
    const after = s.upgrades['expand'] ?? 0;
    // ...and the counterfactual, through the same door the sim's flag uses.
    def.resetsOnCollapse = false;
    s.depth = 60; s.maxDepthRecord = 60; s.upgrades['expand'] = 4;
    w['__engine'].tick(0.001);
    w['__engine'].dispatch({ type: 'collapse' });
    const kept = s.upgrades['expand'] ?? 0;
    def.resetsOnCollapse = true;
    return { before, after, kept };
  });
  console.log(`  L${survives.before.level} (${survives.before.w}x${survives.before.h}) `
    + `-> collapse -> L${survives.after} shipped · L${survives.kept} with the tag off`);
  check(survives.before.w * survives.before.h, 64, 42, 'F0a L4 really is the 8x8 face');
  check(survives.after, 0, 4, 'F0b the shipped Collapse WIPES the width');
  check(survives.kept, 4, 0, 'F0c ...and turning the tag off keeps it — both arms proven, neither chosen');
  check(reset !== null && kept !== null && kept < reset, true, false,
    'F1 keeping the width through Collapse brings 8x8 EARLIER — the flag is live, not a null');
  if (reset !== null && kept !== null) {
    console.log(`  ${(reset - kept).toFixed(1)} minutes earlier (${(100 * (1 - kept / reset)).toFixed(0)}%). Both reported; the ruling is the user's.`);
  }
  check(/peak expand L4/.test(keep), true, false, 'F2 ...and peak width is L4 either way — the reset changes WHEN, never WHETHER');

  // ═══ G — THE RE-CUT TABLE ═════════════════════════════════════════════════
  console.log('\n== G — §23, a verdict per beat ================================');
  const rows = [...beats.matchAll(/^ {2}\s*([\d.]+)m {2}(.+?) {2,}got\s+(—|[\d.]+)m\s+(\S.*?)\s*$/gm)]
    .map((m) => ({ at: Number(m[1]), name: m[2]!.trim(), got: m[3] === '—' ? null : Number(m[3]), verdict: m[4]!.trim() }));
  for (const r of rows) {
    console.log(`  ${String(r.at).padStart(5)}m  ${r.name.padEnd(34)} got ${(r.got === null ? '—' : r.got.toFixed(1)).padStart(6)}m  ${r.verdict}`);
  }
  const holds = rows.filter((r) => r.verdict === 'holds').length;
  const never = rows.filter((r) => r.verdict === 'NEVER').length;
  console.log(`  ${holds} hold · ${rows.length - holds - never} off · ${never} never`);
  check(rows.length > 15, true, false, 'G1 every §23 beat carries a verdict');
  check(never, 0, 2, 'G2 ZERO beats never happen — A.109 read two, and both now fire');
  check(rows.filter((r) => r.verdict.includes('EARLY')).length > 0, true, false,
    'G3 the opening is still COMPRESSED, and the doc now says the measured minute');
  check(/\(no predicate\)/.test(beats), true, false, 'G4 the eight FEELINGS are printed, never silently dropped');

  const spine = readFileSync('DESIGN_SPINE.md', 'utf8');
  check(/# 23\. THE FIRST TWENTY-FIVE MINUTES/.test(spine), true, false, 'G5 §23 is re-titled to the measured game');
  check(/## 23\.1 What the re-cut exposed/.test(spine), true, false, 'G6 ...and the three ORDER inversions are written down');
  check(/\*\*FEELING\*\*/.test(spine), true, false, 'G7 ...and the unmeasurable beats are marked as feelings in the doc');

  // ═══ H — THE AUDITS ═══════════════════════════════════════════════════════
  console.log('\n== H — every audit ============================================');
  for (const a of ['ensure', 'reach', 'supply', 'recipes']) {
    const r = run(`scripts/audit-${a}.ts`);
    check(r.code, 0, 1, `H-${a} audit-${a} exits 0`);
  }

  // ═══ I — dpsMax ═══════════════════════════════════════════════════════════
  console.log('\n== I — dpsMax at ONE depth, both arms =========================');
  const ceiling = await page.evaluate(async () => {
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    s.depth = 30;
    s.upgrades['expand'] = 2;
    s.kiln.built = true;
    s.kiln.fuel = null;
    w['__engine'].tick(0.001);
    const bare = w['__probe']['dps']();
    // ...and the same state with a profile lit and its stone in the Hold. A
    // fuel bends heat DYNAMICS; it must not reach cap, regen or yield.
    for (const id of ['ash', 'marl', 'loam']) forge.addMaterial(s, id, 60, 50);
    s.kiln.fuel = 'ash';
    s.kiln.feeding = true;
    for (let t = 0; t < 30; t++) w['__engine'].tick(1);
    return { bare, fuelled: w['__probe']['dps'](), depth: s.depth, heat: Math.round(s.kiln.heat * 100) / 100 };
  });
  console.log(`  depth ${ceiling.depth}: ${ceiling.bare} bare · ${ceiling.fuelled} with Ash lit (heat ${ceiling.heat})`);
  check(ceiling.fuelled, ceiling.bare, 'moved', 'I1 dpsMax is bit-identical at the same depth with a fuel burning');

  // ═══ J — THE SCREEN ═══════════════════════════════════════════════════════
  console.log('\n== J — 380px, bounded ========================================');
  await tab(page, 'kiln');
  await dismiss(page);
  const shape = await page.evaluate(() => {
    const de = document.documentElement;
    return { overflow: de.scrollWidth - de.clientWidth };
  });
  console.log(`  overflow ${shape.overflow}px`);
  check(shape.overflow, 0, 12, 'J1 0 horizontal overflow at 380px');
  await page.screenshot({ path: `${OUT}/j-kiln-380.png`, fullPage: true });

  /**
   * THE 8x8 FACE, REACHED THE WAY A PLAYER REACHES IT.
   *
   * `applyFieldSize` runs inside `buyUpgrade`, so a level written into the save
   * leaves the rendered face at whatever it already was — an earlier version of
   * this shot showed an 8x8 grid that was a side effect of block F's
   * counterfactual collapse rather than of the level under it. Four real buys
   * with the Brick to pay for them, so the picture means what it looks like.
   */
  await tab(page, 'dig');
  await dismiss(page);
  const grid = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const s = w['__engine'].getState();
    s.upgrades['expand'] = 0;
    s.currencies['brick'] = s.currencies['brick'].add(100000);
    for (let i = 0; i < 4; i++) w['__engine'].dispatch({ type: 'buyUpgrade', id: 'expand' });
    w['__engine'].tick(0.001);
    return { level: s.upgrades['expand'], w: s.face.w, h: s.face.h, cells: s.face.cells.length };
  });
  console.log(`  bought L${grid.level} through the real shop -> ${grid.w}x${grid.h}, ${grid.cells} cells`);
  check([grid.w, grid.h, grid.cells], [8, 8, 64], [6, 6, 36], 'J2 four real buys render the 8x8 face');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/j-face-8x8-380.png`, fullPage: true });
  check(errors.length, 0, 1, 'J3 0 page errors across the whole run');
  if (errors.length) console.log('  ' + errors.slice(0, 5).join('\n  '));
  await browser.close();

  // Last, deliberately: it WRITES a source file, vite hot-reloads, and the
  // page context dies. A.108 lost a whole run to exactly this ordering.
  // ═══ D — THE AUDIT, RED-TESTED ════════════════════════════════════════════
  console.log('\n== D — the dangling-fuel audit, planted and restored ===========');
  const FUEL_SRC = 'src/engine/content/kilnFuel.ts';
  const BAK = `${OUT}/kilnFuel.bak`;
  copyFileSync(FUEL_SRC, BAK);
  let red = { code: -1, out: '' };
  try {
    // ANCHORED TO THE PREDICATE — the KILN_FUELS literal the audit walks, never
    // a comment. A.108's red-test rewrote a COMMENT that quoted the predicate
    // verbatim and read GREEN; uniqueness is checked here so that cannot recur.
    const src = readFileSync(FUEL_SRC, 'utf8');
    const anchor = 'export const KILN_FUELS: KilnFuel[] = [';
    check(src.split(anchor).length - 1, 1, 0, 'D1 the red-test anchor is the predicate, and it is unique');
    writeFileSync(FUEL_SRC, src.replace(anchor, `${anchor}\n  { id: 'redtest', name: 'Red Test', note: 'planted', `
      + `materialId: 'nosuchstone', burnPerSec: 1, heatUpMult: 1, coolMult: 1 },`));
    red = run('scripts/audit-reach.ts');
  } finally {
    copyFileSync(BAK, FUEL_SRC);
  }
  const green = run('scripts/audit-reach.ts');
  console.log(`  planted -> exit ${red.code} · restored -> exit ${green.code}`);
  check(red.code, 1, 0, 'D2 a registry naming a material nobody authored FAILS THE BUILD');
  check(/redtest\s+wants material 'nosuchstone'/.test(red.out), true, false, 'D3 ...and the failure names the row');
  check(green.code, 0, 1, 'D4 ...and the file is restored, green again');

  console.log(`\nscreenshots -> ${OUT}`);
  console.log(problems.length === 0 ? '\nALL PASS' : `\n${problems.length} PROBLEM(S):\n  ${problems.join('\n  ')}`);
  process.exit(problems.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
