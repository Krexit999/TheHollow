/**
 * A.109 DRIVEN IN THE REAL GAME — the re-measurement pass.
 *
 *   A  §23's beats against the fixed harness, with a verdict per beat
 *   B  the 3-hour census — what a player has, and what they have never seen
 *   C  the active/idle gap, re-measured across all three gates pillar 1 binds
 *   D  six thresholds re-sized, at 3h and 9h
 *   E  subsidence measured in its own shell, which nothing had ever done
 *   F  the Bloom coverage curve
 *   G  every audit green, and the dangling-reference scan reporting
 *   H  dpsMax unmoved at the SAME depth
 *   I  380px, 0 overflow, 0 page errors
 *
 * NO NAMED FUNCTION MAY BE DECLARED INSIDE A `page.evaluate` BODY — esbuild's
 * `keepNames` rewrites `const f = () => {}` into `__name(...)`, which does not
 * exist in the page. It has cost ten runs across A.90–A.105.
 *
 * The long arms are NOT re-run here. They write to `sim-out/` and exit, per the
 * standing rule; this reads what they wrote and fails if it is missing, so a
 * green run cannot mean "the file was not there".
 *
 *   npx tsx scripts/verify-a109.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { setup, tab, dismiss, SEL, hold } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots-a109';
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

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  // ═══ A — §23's BEATS ══════════════════════════════════════════════════════
  console.log('\n== A — §23 against a hand that lands its strokes ===============');
  const beats = simOut('a109-beats-3h.md');
  const rows = [...beats.matchAll(/^ {2}\s*([\d.]+)m {2}(.+?) {2,}got\s+(—|[\d.]+)m\s+(\S.*?)\s*$/gm)]
    .map((m) => ({ at: Number(m[1]), name: m[2]!.trim(), got: m[3] === '—' ? null : Number(m[3]), verdict: m[4]!.trim() }));
  for (const r of rows) {
    console.log(`  ${String(r.at).padStart(5)}m  ${r.name.padEnd(34)} got ${(r.got === null ? '—' : r.got.toFixed(1)).padStart(6)}m  ${r.verdict}`);
  }
  check(rows.length > 15, true, false, 'A1 every §23 beat carries a verdict');
  const early = rows.filter((r) => r.verdict.includes('EARLY')).length;
  const never = rows.filter((r) => r.verdict === 'NEVER').length;
  console.log(`  ${rows.filter((r) => r.verdict === 'holds').length} hold · ${early} early · ${never} never`);
  check(early > 0, true, false, 'A2 the opening is COMPRESSED, and the table says so');
  // The two NEVERs are findings, not gaps in the instrument — each has a reason
  // printed beside it, which is the difference between a zero and a dash.
  check(never, 2, 0, 'A3 two beats never happen at all — field 8x8 and Ash');
  check(/peak face 49 cells/.test(beats), true, false, 'A4 ...the field peaks at 7x7, never the 8x8 §23 promises at 12:00');
  check(/peak ash 0/.test(beats), true, false, 'A5 ...and the Ash counter never moves');

  // ═══ B — THE 3-HOUR CENSUS ════════════════════════════════════════════════
  console.log('\n== B — what a player has at hour three =========================');
  const matrix = simOut('a109-matrix.md');
  for (const line of matrix.split('\n').filter((l) => /rooms (LIT|DARK)|machines UP|CENSUS @/.test(l))) {
    console.log('  ' + line.trim().slice(0, 150));
  }
  check(/machines UP/.test(matrix), true, false, 'B1 the census reads the plant');
  check(/rooms DARK/.test(matrix), true, false, 'B2 ...and names what has never been seen');

  // ═══ C — THE ACTIVE/IDLE GAP ══════════════════════════════════════════════
  console.log('\n== C — the gap, across all three gates pillar 1 binds ==========');
  const arms = matrix.split(/^=== /m).slice(1);
  const read = (arm: string): { depth: number; income: number; drops: number } => {
    const depth = Number(/record (\d+)/.exec(arm)?.[1] ?? 0);
    const inc = /income ([\d.e+]+)\/s/.exec(arm.split('diag h3')[1] ?? '')?.[1];
    const drops = Number(/materials: (\d+) drops/.exec(arm)?.[1] ?? 0);
    return { depth, income: inc ? Number(inc) : 0, drops };
  };
  const idle = read(arms.find((a) => a.startsWith('idle')) ?? '');
  const active = read(arms.find((a) => a.startsWith('active')) ?? '');
  const ratio = (a: number, b: number): number => (b > 0 ? Math.round((a / b) * 100) / 100 : 0);
  console.log(`  depth   idle ${idle.depth} · active ${active.depth}   = ${ratio(active.depth, idle.depth)}x`);
  console.log(`  income  idle ${idle.income} · active ${active.income} = ${ratio(active.income, idle.income)}x`);
  console.log(`  drops   idle ${idle.drops} · active ${active.drops}   = ${ratio(active.drops, idle.drops)}x`);
  check(idle.depth > 0 && active.depth > 0, true, false, 'C1 both arms ran');
  check(ratio(active.depth, idle.depth) < 1.2, true, false, 'C2 the DESCENT gate has converged — 1.007x was this, and only this');
  check(ratio(active.drops, idle.drops) > 2, true, false, 'C3 ...and the DROP economy has not, which one number hid');
  check(ratio(active.drops, idle.drops) <= 5.5, true, false, 'C4 ...and it is inside pillar 1’s ~5x bound');

  // ═══ D + E — THE THRESHOLDS ═══════════════════════════════════════════════
  console.log('\n== D — six thresholds, re-cut, in their own shells =============');
  const thr3 = simOut('a109-thr2.md');
  const seen: Record<string, string> = {};
  for (const m of thr3.matchAll(/^ {2}(\w+) +(\w+) +(\d+)\/(\d+) +([\d.]+)%/gm)) {
    const [, shell, id, got, at, pct] = m;
    if (Number(got) > 0) seen[id!] = `${shell} ${got}/${at} = ${pct}%`;
  }
  for (const [id, line] of Object.entries(seen)) console.log(`  ${id.padEnd(11)} ${line}`);
  check(Object.keys(seen).length, 6, 0, 'D1 all six banked in their own shell at 3h');
  const pcts = Object.values(seen).map((l) => Number(/= ([\d.]+)%/.exec(l)?.[1] ?? 0));
  check(pcts.every((p) => p > 15 && p < 100), true, false,
    'D2 ...and not one is crossed at 3h — a threshold met on the way in is a tutorial');

  console.log('\n== E — subsidence, in the shell that owns it ===================');
  check(/subsidence/.test(thr3), true, false, 'E1 subsidence banks at all');
  const sub = /subsidence +(\d+)\/(\d+)/.exec(thr3);
  console.log(`  loam subsidence ${sub?.[1]}/${sub?.[2]} at 3h — 0 in every arm before --stay existed`);
  check(Number(sub?.[1] ?? 0) > 0, true, false, 'E2 ...which no arm had ever measured, because none stayed');

  // ═══ F — THE BLOOM CURVE ══════════════════════════════════════════════════
  console.log('\n== F — the Bloom ceiling ======================================');
  const bloom = execFileSync('npx', ['tsx', 'scripts/a109-bloom.ts'], {
    encoding: 'utf8', shell: process.platform === 'win32',
  });
  for (const l of bloom.split('\n').filter((x) => /carries|self-test|cliff|^\s+(6|7|2|3)\s/.test(x))) {
    if (l.trim()) console.log('  ' + l.trim());
  }
  check(/the idle face carries 6 machines/.test(bloom), true, false, 'F1 an idle face carries 6');
  check(/a worked face carries 2/.test(bloom), true, false, 'F2 ...and a worked face carries 2');
  check(/self-test: coverage falls/.test(bloom), true, false, 'F3 ...and the curve self-tests as a curve');

  // ═══ G — THE AUDITS ═══════════════════════════════════════════════════════
  console.log('\n== G — every audit ============================================');
  for (const a of ['audit-reach', 'audit-ensure', 'audit-supply', 'audit-recipes']) {
    let out = '', code = 0;
    try {
      out = execFileSync('npx', ['tsx', `scripts/${a}.ts`], { encoding: 'utf8', shell: process.platform === 'win32' });
    } catch (e: unknown) {
      code = 1; out = String((e as { stdout?: string }).stdout ?? '');
    }
    console.log(`  ${a.padEnd(14)} exit ${code}  ${out.trim().split('\n').pop()?.slice(0, 80)}`);
    check(code, 0, 1, `G-${a} exits clean`);
  }
  const reach = execFileSync('npx', ['tsx', 'scripts/audit-reach.ts'], {
    encoding: 'utf8', shell: process.platform === 'win32',
  });
  check(/NAMES A MATERIAL NOBODY AUTHORED/.test(reach), true, false,
    'G5 ...and the dangling-reference scan REPORTS the two dead kiln fuels');
  check(/0 UNREACHABLE OR UNAUDITED/.test(reach), true, false, 'G6 ...without failing the build on a ruling');

  // ═══ H + I — THE GAME ═════════════════════════════════════════════════════
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await dismiss(page);

  console.log('\n== H — dpsMax at ONE depth, with every condition live ==========');
  const ceiling = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    s.depth = 30;
    s.plant.condition = {}; s.plant.broken = {}; s.plant.dragged = {};
    w['__engine'].tick(0.001);
    const clean = w['__probe']['dps']();
    for (const id of w['__probe']['machines']()) {
      s.plant.condition[id] = { id: 'overgrown', level: 1, seized: true, fullFor: 999 };
    }
    w['__engine'].tick(0.001);
    return { clean, written: w['__probe']['dps'](), depth: s.depth };
  });
  console.log(`  depth ${ceiling.depth}: ${ceiling.clean} clean · ${ceiling.written} with the table written`);
  check(ceiling.written, ceiling.clean, 'moved', 'H1 dpsMax is bit-identical at the same depth');

  console.log('\n== I — 380px, bounded, named ==================================');
  await setup(page, `
    const s = engine.getState();
    s.shell.current = 'verdance';
    s.depthRecords['verdance'] = 400;
    s.depth = 100;
    s.kiln.built = true;
    s.plant.condition = {}; s.plant.dragged = {}; s.plant.broken = {}; s.plant.ripe = {};
    s.plant.tiers = {};
    for (const id of window.__probe.machines()) s.plant.tiers[id] = 1;
    for (let t = 0; t < 340; t++) engine.tick(1);
  `);
  await tab(page, 'kiln');
  await dismiss(page);
  const shape = await page.evaluate(() => {
    const de = document.documentElement;
    const list = Array.from(document.querySelectorAll(
      '[data-testid^="broke-"], [data-testid^="drag-"], [data-testid^="ripe-"], [data-testid^="harvest-"]'));
    return {
      overflow: de.scrollWidth - de.clientWidth,
      rows: list.length,
      unnamed: list.filter((r) => (r.textContent ?? '').replace(/\s+/g, ' ').trim().length < 6).length,
      doubled: list.filter((r) => /\bthe [Tt]he\b/.test(r.textContent ?? '')).length,
    };
  });
  console.log(`  overflow ${shape.overflow}px · ${shape.rows} rows`);
  check(shape.overflow, 0, 12, 'I1 0 horizontal overflow at 380px');
  check(shape.unnamed, 0, 1, 'I2 every row says something');
  check(shape.doubled, 0, 1, 'I3 ...and no row says "the The"');
  await page.screenshot({ path: `${OUT}/i-plant-380.png`, fullPage: true });
  await tab(page, 'dig');
  await dismiss(page);
  await hold(page, SEL.descend, 200).catch(() => false);
  await page.screenshot({ path: `${OUT}/i-face-380.png`, fullPage: true });
  check(errors.length, 0, 1, 'I4 0 page errors across the whole run');
  if (errors.length) console.log('  ' + errors.slice(0, 5).join('\n  '));

  console.log(`\nscreenshots -> ${OUT}`);
  console.log(problems.length === 0 ? '\nALL PASS' : `\n${problems.length} PROBLEM(S):\n  ${problems.join('\n  ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
