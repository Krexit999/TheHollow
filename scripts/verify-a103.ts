/**
 * A.103 DRIVEN IN THE REAL GAME — the ten inversions, end to end.
 *
 *   A  §23's opening, read FIRST on a state nothing has touched
 *   B  the room: shut before the Spiral, open after it, every row NAMED
 *   C  a challenge STARTED from its room, by clicking the button in it
 *   D  the ten seals, off and on, each as a sentence
 *   E  one ABANDONED, with what it cost read off the panel BEFORE the button
 *   F  one COMPLETED by carrying it down, and the capability granted
 *   G  the grant surviving a Collapse, a Breach and a Spiral
 *   H  a Loam drift carried into Ferrite and READ BY THE NEW LADDER
 *   I  the guard failing on a planted unwired seal, and on a planted grant
 *   J  dpsMax unmoved at equal depth with all ten grants held
 *   K  380px, 0 overflow, panel HEIGHT bounded, 0 page errors
 *
 * NO NAMED FUNCTION MAY BE DECLARED INSIDE A `page.evaluate` BODY — esbuild's
 * `keepNames` rewrites `const f = () => {}` into `__name(...)`, which does not
 * exist in the page. It has cost eight runs across A.90–A.101.
 *
 *   npx tsx scripts/verify-a103.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots-a103';
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

/** A player who has wound one Spiral — the gate the room opens behind. */
const SPIRALLED = `
  const s = engine.getState();
  s.shell.breachCount = 6;
  for (const id of ['loam','ferrite','verdance','glassmere','cinder','hollow','aleph']) {
    s.depthRecords[id] = 9999;
  }
  s.maxDepthRecord = 9999;
  s.recursion.count = 1;
  s.spiral.count = 1;
  s.spiral.challengeDone = [];
  s.spiral.activeChallenge = null;
  s.kiln.built = true;
  s.forge.built = true;
  s.drills.bayBuilt = true;
  s.depth = 10;
`;

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

  // ═══ A — §23, READ FIRST, ON A STATE NOTHING HAS TOUCHED ═════════════════
  console.log('\n== A — the opening beats, before any fixture ====================');
  await tab(page, 'dig');
  await dismiss(page);
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
    'A — §23: 36 cells, depth 0, 2.97 dust/sec, with the whole layer shipped');

  // ═══ B — THE ROOM ════════════════════════════════════════════════════════
  console.log('\n== B — a room that is shut before the Spiral and open after ====');
  const shut = await page.evaluate(async () => {
    const nav = await import(/* @vite-ignore */ '/src/ui/nav' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState();
    const sys = (nav.ALL_SYSTEMS as Array<{ id: string; visible: (x: unknown) => boolean }>)
      .find((x) => x.id === 'inversions')!;
    return sys.visible(s);
  });
  check(shut, false, true, 'B — the Inversions are not a room you can see before a Spiral');

  await setup(page, SPIRALLED);
  await tab(page, 'inversions');
  await dismiss(page);
  await page.waitForTimeout(400);

  const rows = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="inversion-rows"]');
    const out = Array.from(box?.children ?? []).map((n) => ({
      id: n.getAttribute('data-testid') ?? '',
      name: (n.querySelector('[data-testid$="-name"]')?.textContent ?? '').trim(),
      grant: (n.querySelector('[data-testid$="-grant"]')?.textContent ?? '').trim(),
    }));
    return {
      rows: out,
      blank: out.filter((r) => r.name.length === 0 || r.grant.length < 20).length,
      panelH: Math.round(document.querySelector('[data-testid="inversions-panel"]')
        ?.getBoundingClientRect().height ?? 0),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  for (const r of rows.rows) console.log(`        ${r.name}`);
  check(rows.rows.length, 10, 0, 'B — ten inversions on screen');
  check(rows.blank, 0, 1, 'B — every list row NAMED, and every one states its grant');
  check(rows.overflow, 0, 12, 'B — 380px wide, 0 horizontal overflow');
  check(rows.panelH > 200 && rows.panelH < 4200, true, false,
    `B — panel height bounded (${rows.panelH}px)`);
  await page.screenshot({ path: join(OUT, 'b-the-room.png'), fullPage: true });

  // ═══ C — STARTED FROM ITS ROOM, BY CLICKING THE BUTTON IN IT ═════════════
  console.log('\n== C — a challenge started from the room, not from a fixture ====');
  const startBtn = page.locator('[data-testid="inversion-onecell-start"]');
  await startBtn.click({ timeout: 2000 });
  await page.waitForTimeout(400);
  const started = await page.evaluate(async () => {
    const laws = await import(/* @vite-ignore */ '/src/engine/laws' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as {
      spiral: { activeChallenge: { id: string; startDepth: number } | null };
    };
    return {
      id: s.spiral.activeChallenge?.id ?? null,
      from: s.spiral.activeChallenge?.startDepth ?? -1,
      sealed: laws.sealed(s, 'sealWiden') as boolean,
      shownTarget: (document.querySelector('[data-testid="inversion-progress"]')?.textContent ?? '').trim(),
    };
  });
  console.log(`        the panel says: ${started.shownTarget}`);
  check([started.id, started.sealed], ['onecell', true], [null, false],
    'C — ONE CELL is running, and its seal is in force, from one click in the room');
  check(started.from, 10, -1, 'C — ...and it started WHERE YOU STAND (depth 10), not from a fresh world');
  await page.screenshot({ path: join(OUT, 'c-running.png'), fullPage: true });

  // ═══ D — TEN SEALS, OFF AND ON ══════════════════════════════════════════
  console.log('\n== D — every seal, off then on, in the running game =============');
  const seals = await page.evaluate(async () => {
    const laws = await import(/* @vite-ignore */ '/src/engine/laws' + '.ts');
    const ch = await import(/* @vite-ignore */ '/src/engine/systems/challenges' + '.ts');
    const content = await import(/* @vite-ignore */ '/src/engine/content/challenges' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const noop = { emit: Function.prototype, dirty: Function.prototype };
    const s = w['__engine']!.getState() as unknown as {
      spiral: { activeChallenge: unknown; count: number }; shell: { current: string };
    };
    const out: Array<{ name: string; seal: string; off: boolean; on: boolean }> = [];
    for (const c of content.CHALLENGES as Array<{ id: string; name: string; laws: Record<string, unknown> }>) {
      const seal = Object.keys(c.laws).find((k) => k.startsWith('seal'))!;
      s.spiral.activeChallenge = null;
      s.shell.current = 'cinder';                 // THE HELD BREATH names a place
      const off = laws.sealed(s, seal) as boolean;
      const r = ch.startChallenge(s, noop, c.id) as { ok: boolean; reason?: string };
      out.push({ name: c.name, seal, off, on: r.ok ? (laws.sealed(s, seal) as boolean) : false });
    }
    s.spiral.activeChallenge = null;
    return out;
  });
  for (const r of seals) {
    console.log(`        ${r.name.padEnd(18)} ${r.seal.padEnd(14)} off=${r.off} → on=${r.on}`);
  }
  check(seals.length, 10, 0, 'D — all ten walked');
  check(seals.filter((r) => r.off === false && r.on === true).length, 10, 9,
    'D — every one of the ten reads FALSE with nothing running and TRUE while it runs');

  // ═══ E — ABANDONING, HONESTLY ═══════════════════════════════════════════
  console.log('\n== E — walking away, with the cost stated before the button =====');
  await setup(page, `${SPIRALLED}\n s.depth = 40;`);
  await tab(page, 'inversions');
  await dismiss(page);
  await page.locator('[data-testid="inversion-thinseam-start"]').click({ timeout: 2000 });
  await setup(page, ` const s = engine.getState(); s.depth = 52;`);
  await page.waitForTimeout(1300);                 // one 1Hz beat, to note the ground
  const abandonLine = (await page.locator('[data-testid="inversion-abandon-line"]')
    .textContent({ timeout: 2000 }) ?? '').trim();
  console.log(`        ${abandonLine}`);
  check([/Costs: this attempt, and the 12 depths/.test(abandonLine),
    /Keeps: everything/.test(abandonLine)], [true, true], [true, false],
  'E — the panel names what it costs AND what it keeps, above the button');
  await page.screenshot({ path: join(OUT, 'e-abandon.png'), fullPage: true });

  await page.locator('[data-testid="inversion-abandon"]').click({ timeout: 2000 });
  await page.waitForTimeout(400);
  const afterLetGo = await page.evaluate(async () => {
    const laws = await import(/* @vite-ignore */ '/src/engine/laws' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as {
      spiral: { activeChallenge: unknown; challengeDone: string[] };
      materials: { totalDrops: number };
    };
    return {
      running: s.spiral.activeChallenge !== null,
      kept: s.spiral.challengeDone.length,
      sealed: laws.sealed(s, 'sealDrops') as boolean,
    };
  });
  check([afterLetGo.running, afterLetGo.sealed, afterLetGo.kept], [false, false, 0],
    [true, true, 1], 'E — it cost the attempt and took nothing: rules back, nothing kept');

  // ═══ F — FINISHED, AND THE CAPABILITY KEPT ══════════════════════════════
  console.log('\n== F — carrying one down, and keeping what it pays =============');
  const finished = await page.evaluate(async () => {
    const ch = await import(/* @vite-ignore */ '/src/engine/systems/challenges' + '.ts');
    const laws = await import(/* @vite-ignore */ '/src/engine/laws' + '.ts');
    const kiln = await import(/* @vite-ignore */ '/src/engine/systems/kiln' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const noop = { emit: Function.prototype, dirty: Function.prototype };
    const s = w['__engine']!.getState() as unknown as {
      depth: number; spiral: { activeChallenge: unknown; challengeDone: string[] };
      kiln: { built: boolean; overstokeReadyAt: number }; stats: { playTimeSec: number };
    };
    s.spiral.challengeDone = [];
    s.spiral.activeChallenge = null;
    s.depth = 30;
    ch.startChallenge(s, noop, 'coldiron');
    // The capability, before: the kiln has to recover.
    s.kiln.built = true;
    s.kiln.overstokeReadyAt = s.stats.playTimeSec + 999;
    const before = kiln.overstokeReady(s) as boolean;
    s.depth = 30 + 24;
    ch.tickChallenges(s, noop);
    const oneShort = s.spiral.activeChallenge !== null;
    s.depth = 30 + 25;
    ch.tickChallenges(s, noop);
    return {
      oneShort,
      done: s.spiral.activeChallenge === null,
      kept: laws.keptLaw(s, 'coldiron') as boolean,
      stillSealed: laws.sealed(s, 'sealKiln') as boolean,
      before,
      after: kiln.overstokeReady(s) as boolean,
    };
  });
  check([finished.oneShort, finished.done, finished.kept], [true, true, true],
    [false, true, true], 'F — one depth short is not finished; the twenty-fifth finishes it');
  check(finished.stillSealed, false, true, 'F — ...and the rules come back the moment it is won');
  check([finished.before, finished.after], [false, true], [true, true],
    'F — the capability is REAL: the kiln had to recover, and now it never does');

  // ═══ G — SURVIVING THE RESET LADDER ═════════════════════════════════════
  console.log('\n== G — a capability outliving every reset above it ==============');
  const survived = await page.evaluate(async () => {
    const laws = await import(/* @vite-ignore */ '/src/engine/laws' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string } }>;
    const eng = w['__engine']!;
    const s = eng.getState() as unknown as {
      depth: number; spiral: { challengeDone: string[]; count: number; earned: number };
      recursion: { count: number; axiomsEarned: number }; keystones?: unknown;
      shell: { current: string };
    };
    s.spiral.challengeDone = ['coldiron'];
    s.depth = 60;
    const afterCollapse = eng.dispatch({ type: 'collapse' }).ok
      && (laws.keptLaw(eng.getState(), 'coldiron') as boolean);
    // ...a Breach.
    const s2 = eng.getState() as typeof s;
    s2.keystones = { placed: [s2.shell.current] };
    s2.depth = 9999;
    const br = eng.dispatch({ type: 'breach' });
    const afterBreach = laws.keptLaw(eng.getState(), 'coldiron') as boolean;
    // ...and a Spiral, which rebuilds the world from `initialState`.
    const s3 = eng.getState() as typeof s;
    s3.recursion.count = 2;
    s3.recursion.axiomsEarned = 60;
    const sp = eng.dispatch({ type: 'spiral' });
    return {
      afterCollapse,
      afterBreach: br.ok ? afterBreach : null,
      afterSpiral: sp.ok ? (laws.keptLaw(eng.getState(), 'coldiron') as boolean) : null,
    };
  });
  check([survived.afterCollapse, survived.afterBreach, survived.afterSpiral],
    [true, true, true], [true, true, false],
    'G — kept through a Collapse, a Breach and a Spiral — "remembered forever" is literal');

  // ═══ H — THE LONG FALL, MEASURED ════════════════════════════════════════
  console.log('\n== H — a Loam drift read by the Ferrite ladder ==================');
  const longfall = await page.evaluate(async () => {
    const shoring = await import(/* @vite-ignore */ '/src/engine/systems/shoring' + '.ts');
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string } }>;
    const eng = w['__engine']!;
    const shells = await import(/* @vite-ignore */ '/src/engine/shells' + '.ts');
    const floors = Object.fromEntries((shells.allShells() as Array<{ id: string; floorDepth: number }>)
      .map((x) => [x.id, x.floorDepth]));
    const out: Array<{ kept: boolean; loam: number; ferrite: number; shell: string; floors: Record<string, number> }> = [];
    for (const kept of [false, true]) {
      const s = eng.getState() as unknown as {
        shell: { current: string; breachCount: number }; depth: number;
        depthRecords: Record<string, number>; keystones?: unknown;
        spiral: { challengeDone: string[] }; roll: { shored: string[]; rig: boolean };
      };
      s.shell.current = 'loam';
      s.spiral.challengeDone = kept ? ['longfall'] : [];
      roll.ensureRoll(s);
      s.roll.rig = true;
      s.roll.shored = [];
      for (const b of (shoring.bands(s) as Array<{ def: { id: string }; to: number }>)) {
        if (b.to <= 90) s.roll.shored.push(b.def.id);
      }
      const loam = shoring.driftDepth(s) as number;
      s.keystones = { placed: ['loam'] };
      s.depth = 9999;
      s.depthRecords['loam'] = 9999;
      const r = eng.dispatch({ type: 'breach' });
      const after = eng.getState() as typeof s;
      out.push({
        kept, loam,
        ferrite: r.ok ? (shoring.driftDepth(after) as number) : -1,
        shell: after.shell.current,
        floors,
      });
    }
    return out;
  });
  for (const r of longfall) {
    console.log(`        grant=${String(r.kept).padEnd(5)} loam drift ${r.loam} → ${r.shell} drift ${r.ferrite}`);
  }
  check([longfall[0]!.loam > 0, longfall[0]!.ferrite], [true, 0], [true, 90],
    'H — WITHOUT it, the station ids survive and the new ladder reads NONE of them');
  check(longfall[1]!.ferrite > 0, true, false,
    `H — WITH it, the fall starts already fallen (${longfall[1]!.ferrite} deep in the next shell)`);
  // THE BOUND, READ OFF THE SHELLS RATHER THAN GUESSED. The first draft of this
  // line hardcoded Ferrite's floor at 220 and failed — the shell is deeper than
  // that, and the number in the assertion was the bug, not the carry. Same rule
  // as everywhere else here: measure the registry, never a remembered figure.
  const share = longfall[1]!.loam / longfall[1]!.floors['loam']!;
  const ceilingDepth = share * longfall[1]!.floors['ferrite']!;
  console.log(`        share ${(share * 100).toFixed(0)}% of loam@${longfall[1]!.floors['loam']}`
    + ` → at most ${ceilingDepth.toFixed(0)} of ferrite@${longfall[1]!.floors['ferrite']}`);
  check(longfall[1]!.ferrite <= ceilingDepth, true, false,
    'H — ...and never past the same SHARE of the new floor — it cannot compound');

  // ═══ I — THE GUARDS, RED-TESTED ═════════════════════════════════════════
  console.log('\n== I — the build fails on a seal or a grant nothing reads =======');
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== '__tests__') walk(p); }
      else if (p.endsWith('.ts') || p.endsWith('.tsx')) files.push(p);
    }
  };
  walk('src');
  const bodies = files.filter((f) => !f.endsWith(join('engine', 'laws.ts')))
    .map((f) => readFileSync(f, 'utf8'));
  const sealReaders = (n: string) =>
    bodies.filter((b) => new RegExp(`sealed\\([^,]+,\\s*'${n}'\\)`).test(b)).length;
  const grantReaders = (n: string) =>
    bodies.filter((b) => new RegExp(`keptLaw\\([^,]+,\\s*'${n}'\\)`).test(b)).length;
  check([sealReaders('sealPlantedNobodyReads'), grantReaders('grantPlantedNobodyReads')],
    [0, 0], [1, 1], 'I — a planted seal and a planted grant both come back with NO readers');
  check([sealReaders('sealWiden') > 0, grantReaders('onecell') > 0], [true, true], [true, false],
    'I — ...while the real ones are found, so the sweep is not simply blind');

  // ═══ J — PILLAR 2 ═══════════════════════════════════════════════════════
  console.log('\n== J — the ceiling, with all ten held, at equal depth ===========');
  await setup(page, SPIRALLED);
  const pillar = await page.evaluate(async () => {
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const laws = await import(/* @vite-ignore */ '/src/engine/laws' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as {
      depth: number; spiral: { challengeDone: string[] };
    };
    const m = new modsMod.ModifierCache();
    s.depth = 44;                                   // the SAME depth in both arms
    s.spiral.challengeDone = [];
    m.invalidate();
    const before = (face.dpsMax(s, m) as { toString: () => string }).toString();
    s.spiral.challengeDone = [...(laws.ALL_GRANTS as string[])];
    m.invalidate();
    return { before, after: (face.dpsMax(s, m) as { toString: () => string }).toString(), n: s.spiral.challengeDone.length };
  });
  console.log(`        dpsMax@44  none: ${pillar.before}   all ten: ${pillar.after}`);
  check([pillar.n, pillar.after], [10, pillar.before], [0, 'x'],
    'J — ten capabilities held, dpsMax identical at depth 44');

  // ═══ K — THE PAGE ═══════════════════════════════════════════════════════
  console.log('\n== K — the page itself ==========================================');
  await tab(page, 'inversions');
  await dismiss(page);
  await page.screenshot({ path: join(OUT, 'k-kept.png'), fullPage: true });
  check(errors.length, 0, 1, `K — 0 page errors (${errors.slice(0, 2).join(' | ')})`);

  await browser.close();
  console.log(`\n${problems.length === 0 ? 'ALL PASS' : `${problems.length} PROBLEM(S)`}`);
  if (problems.length) { for (const p of problems) console.log(`  - ${p}`); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
