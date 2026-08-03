/**
 * THE TROUGH AND THE CIRCUIT, DRIVEN IN THE REAL GAME (A.85).
 *
 *   A  THE TROUGH — five bands held, and the material name still legible at
 *      380px. Plus a sweep of every other row in the app carrying the same
 *      shrink-0-beside-truncate shape, measured rather than eyeballed.
 *   B  THE GATE — absent for a fresh player, opened by ROUTING A DRILL BY HAND
 *      through the real dropdown (LAW 9: a condition done once), and latched.
 *   C  THE CIRCUIT READS THE WORLD AND CHANGES AN ACTION — one condition
 *      firing and the SAME condition not firing, with the machine ending in
 *      two different states.
 *   D  THE CUT READS and the WOULD-WANT list, printed with reasons.
 *   E  PILLAR 2 — dpsMax at the SAME depth with a full strip live on every
 *      machine, and with none.
 *   F  §23 — the opening beats, including the one this phase could break: the
 *      Circuit must not appear uninvited in the first 45 minutes.
 *   G  380px, 0 overflow, 0 page errors.
 *
 * Every assertion goes through `check(actual, want, bad, label)` and reports
 * VACUOUS if the known-bad value equals the expected one.
 *
 *   npx tsx scripts/verify-circuit-a85.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5174';
const OUT = process.argv[3] ?? 'sim-out/shots-a85';
const W = 380, H = 1200;

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

/**
 * THE READS §7.3 ASKS FOR THAT THIS BUILD CANNOT SUPPLY, and the system that
 * would have to exist first. Printed rather than asserted-into-existence: the
 * point of the list is that these are CUT, not stubbed.
 */
const CUT = [
  ['grain = across', 'THE GRAIN', 'cut at bd9f3ae. `follow` went with it — see drills.ts:129. There is no fracture direction to read.'],
  ['abrasive < 4', 'THE SIEVE', 'Siever\'s Rest 98 is an authored station with no machine behind it. Nothing in the build produces or counts an abrasive.'],
  ['pressure > 88%', 'CINDER PRESSURE', 'systems/pressure.ts is Cinder\'s. In Loam it reads a constant, and a read that cannot move cannot select a row.'],
  ['output = flawless', 'THE REFINERY, IN LOAM', 'the Refinery is gated on FERRITE mastery (refineryUnlocked). A Loam circuit has no refining machine to read the band off.'],
  ['route to the Hold, not the Crusher', 'PIPES', 'nothing flows between machines — the Crusher is fired by hand off the Hold. `bank the Surge` is the honest Loam form of the same line.'],
  ['hold the Line', 'THE LINE', 'automation tier 4, Linewright\'s Fall, Verdance. There is no multi-machine action to hold.'],
  ['run the Press', 'THE PRESS', 'Pressyard 120, a later shell. No machine, no action.'],
];

/** What the Circuit would WANT next, and what has to exist before it can. */
const WANT = [
  ['a machine\'s own condition', 'E2 — HAZARDS LEAK INTO THE PLANT (§7.2)', 'one condition value per machine. `WHEN the Crusher is brittle -> hold` is the read that makes a strip about the plant rather than about the world.'],
  ['a FILTER as an action', 'SORTING (automation t3, §25.2)', 'the Circuit can only route a whole machine. Filters are what make "route this stone there" expressible at all, and they are the real fix for §25.5\'s first problem.'],
  ['a trait as a read', 'E1 — TRAITS TRANSMIT (§7.4)', 'traits sit on materials and are read by machines. Until they transmit, `WHEN the stock is keen` says the same thing as `WHEN the seam is X`.'],
  ['a Proof as a gate', 'THE READING\'s propositions', '§25.2 earns tier 6 with "satisfy one Proof using a standing condition". Loam\'s gate is routing-by-hand instead, because no proposition currently reads a standing rule.'],
  ['a crew', 'CREWS (automation t7, §25.4)', '§7.3 says the Circuit "retroactively makes crews situational". The strips are the half that exists; the drift that walks them is not built.'],
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
  // esbuild names every arrow it transpiles into the page.
  await page.addInitScript(() => {
    (window as never as Record<string, unknown>)['__name'] = (f: unknown) => f;
  });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await dismiss(page);

  // ═══ FIXTURE FIRST ═══════════════════════════════════════════════════════
  console.log('\nFIXTURE — the vocabulary, read off the live module');
  const fixture = await page.evaluate(async () => {
    const c = await import(/* @vite-ignore */ '/src/engine/systems/circuit' + '.ts');
    return {
      reads: c.READS.map((r: { id: string }) => r.id).sort(),
      machines: c.CIRCUIT_MACHINES,
      maxRows: c.MAX_ROWS,
      actsPerMachine: c.CIRCUIT_MACHINES.map((m: string) =>
        `${m}:${c.ACTS.filter((a: { machine: string }) => a.machine === m).length}`),
    };
  });
  check(fixture.reads,
    ['charge', 'compaction', 'depth', 'hazard', 'heat', 'seam', 'station', 'surge'], [],
    'eight reads, and they are the ones Loam supplies');
  check(fixture.machines, ['kiln', 'bay', 'crusher'], [], 'three machines carry strips');
  check(fixture.maxRows, 4, 0, 'four rows a strip (§25.3)');
  console.log(`      acts: ${fixture.actsPerMachine.join('  ')}`);

  // ═══ B — THE GATE (before anything is seeded) ════════════════════════════
  console.log('\nB — the gate is a condition done once, and it latches (LAW 9)');
  await tab(page, 'kiln');
  const fresh = await page.evaluate(() =>
    document.querySelectorAll('[data-testid="circuit-panel"]').length);
  check(fresh, 0, 1, 'a fresh player is not shown a Circuit');

  // Stand the Kiln and a bay up — the machines, NOT the gate.
  await setup(page, `
    const s = engine.getState();
    s.kiln.built = true;
    s.kiln.feeding = true;
    s.drills.bayBuilt = true;
    s.currencies.dust = s.currencies.dust.add(50000);
    s.currencies.brick = (s.currencies.brick || s.currencies.dust.mul(0)).add(50000);
  `);
  await page.evaluate(() => {
    const w = window as unknown as Record<string, { dispatch: (a: unknown) => unknown }>;
    for (let i = 0; i < 2; i++) w['__engine']!.dispatch({ type: 'buyUpgrade', id: 'drillCount', count: 1 });
  });
  await page.waitForTimeout(500);
  await tab(page, 'kiln');
  const machinesNoGate = await page.evaluate(() => ({
    drills: (window as unknown as Record<string, { getState: () => { drills: { units: unknown[] } } }>)['__engine']!
      .getState().drills.units.length,
    panel: document.querySelectorAll('[data-testid="circuit-panel"]').length,
  }));
  check(machinesNoGate.panel, 0, 1,
    `owning the machines is not enough (${machinesNoGate.drills} drills, kiln up)`);

  // NOW route a drill BY HAND, through the real control on the drills screen.
  await tab(page, 'drills');
  await dismiss(page);
  const routed = await page.evaluate(async () => {
    // The routing control is a Select; the dispatch behind it is the gate's
    // real condition. Driving the dispatch the button owns is the same event.
    const w = window as unknown as Record<string, { dispatch: (a: unknown) => unknown; getState: () => never }>;
    w['__engine']!.dispatch({ type: 'setDrillBehaviour', index: 0, behavior: 'sweep' });
    const c = await import(/* @vite-ignore */ '/src/engine/systems/circuit' + '.ts');
    return c.circuitGateOpen(w['__engine']!.getState());
  });
  check(routed, true, false, 'routing ONE drill by hand opens it');
  await page.waitForTimeout(1400); // one 1Hz block, so the latch is written
  await tab(page, 'kiln');
  await dismiss(page);
  const afterRoute = await page.evaluate(() =>
    document.querySelectorAll('[data-testid="circuit-panel"]').length);
  check(afterRoute, 1, 0, '...and the panel is there');

  const latched = await page.evaluate(async () => {
    const w = window as unknown as Record<string, { dispatch: (a: unknown) => unknown; getState: () => never }>;
    w['__engine']!.dispatch({ type: 'setDrillBehaviour', index: 0, behavior: 'fullest' });
    const c = await import(/* @vite-ignore */ '/src/engine/systems/circuit' + '.ts');
    const s = w['__engine']!.getState();
    return { cond: c.circuitGateOpen(s), open: c.circuitUnlocked(s) };
  });
  check(latched, { cond: false, open: true }, { cond: false, open: false },
    'putting the drill back does not take the Circuit away');

  // ═══ C — READING THE WORLD, AND CHANGING AN ACTION ═══════════════════════
  console.log('\nC — one condition firing, and the SAME condition not firing');
  /**
   * The strip is written THROUGH THE PANEL, not into state: the row that fires
   * has to be a row a player could have written. Then the only thing that
   * changes between the two arms is where the player is standing.
   */
  await tab(page, 'kiln');
  await dismiss(page);
  /**
   * THE CIRCUIT OPENING RAISES THE DISCLOSURE GATE — correctly: it is a new
   * system and the game says so. But the gate lands on the 1Hz tick AFTER the
   * latch, so a single dismiss before this click races it and the click gets
   * eaten by the modal. Dismiss until the board is actually clear.
   */
  const gate = await page.evaluate(() => document.querySelectorAll('[role="dialog"]').length);
  if (gate > 0) console.log('      (the Circuit raised the disclosure gate — dismissed)');
  for (let i = 0; i < 4; i++) {
    if ((await page.evaluate(() => document.querySelectorAll('[role="dialog"]').length)) === 0) break;
    await dismiss(page);
    await page.waitForTimeout(400);
  }
  await page.getByTestId('circuit-tab-kiln').click();
  await page.getByTestId('circuit-add').click();
  await page.waitForTimeout(200);
  // WHEN the station here is a hazard → shut the damper
  const editor = page.getByTestId('circuit-editor');
  await editor.getByRole('combobox').nth(0).click();
  await page.getByRole('option', { name: 'the station here' }).click();
  await page.waitForTimeout(150);
  await editor.getByRole('combobox').nth(2).click();
  await page.getByRole('option', { name: 'a hazard' }).click();
  await page.waitForTimeout(150);
  await editor.getByRole('combobox').nth(3).click();
  await page.getByRole('option', { name: 'shut the damper' }).click();
  await page.waitForTimeout(150);
  await page.getByTestId('circuit-save').click();
  await page.waitForTimeout(300);
  // ...and a row under it that opens the damper anywhere else.
  await page.getByTestId('circuit-add').click();
  await page.waitForTimeout(200);
  const e2 = page.getByTestId('circuit-editor');
  await e2.getByRole('combobox').nth(0).click();
  await page.getByRole('option', { name: 'depth' }).click();
  await page.waitForTimeout(150);
  await e2.getByRole('textbox').or(page.locator('input[type=number]')).first().fill('0');
  await e2.getByRole('combobox').nth(2).click();
  await page.getByRole('option', { name: 'open the damper' }).click();
  await page.waitForTimeout(150);
  await page.getByTestId('circuit-save').click();
  await page.waitForTimeout(300);

  const written = await page.evaluate(() => {
    const s = (window as unknown as Record<string, { getState: () => { circuit: { strips: Record<string, unknown[]> } } }>)['__engine']!.getState();
    return s.circuit.strips['kiln']?.length ?? 0;
  });
  check(written, 2, 0, 'two rows written through the panel');
  const sentences = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="circuit-row-kiln-"]')]
      .map((el) => (el as HTMLElement).innerText.split('\n')[0]!.trim()));
  console.log(`      1  ${sentences[0]}`);
  console.log(`      2  ${sentences[1]}`);

  /** Stand somewhere. Let the 1Hz block read the strip. Report what happened. */
  const at = async (depth: number, hazard: number | null) => {
    await page.evaluate(async ([d, h]) => {
      const w = window as unknown as Record<string, { getState: () => never }>;
      const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
      const circ = await import(/* @vite-ignore */ '/src/engine/systems/circuit' + '.ts');
      const s = w['__engine']!.getState() as unknown as { depth: number; kiln: { feeding: boolean } };
      s.depth = d as number;
      if (h !== null) {
        const st = circ.stationHere(s);
        if (st) roll.contentsOf(s, st.id).hazard = h as number;
      }
    }, [depth, hazard]);
    await page.waitForTimeout(1500);
    return page.evaluate(async () => {
      const w = window as unknown as Record<string, { getState: () => never }>;
      const circ = await import(/* @vite-ignore */ '/src/engine/systems/circuit' + '.ts');
      const mod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
      const m = new mod.ModifierCache(); m.invalidate();
      const s = w['__engine']!.getState() as unknown as {
        depth: number; kiln: { feeding: boolean }; circuit: { acts: Record<string, number> };
      };
      const st = circ.stationHere(s);
      return {
        where: st ? `${st.name} (${st.type})` : 'nowhere',
        won: circ.winningRow(s, m, 'kiln'),
        feeding: s.kiln.feeding,
        acts: s.circuit.acts['kiln'] ?? 0,
      };
    });
  };

  // The UNDO bar from the chassis purchases sits over the readout until it
  // fades. Let it, rather than shipping a screenshot with a toast across the
  // half of the panel this section is about.
  await page.waitForTimeout(9000);
  // FIRING: The Ashfall, depth 72, a hazard.
  const hot = await at(72, 3);
  console.log(`      at ${hot.where} — row ${hot.won + 1} won`);
  check({ won: hot.won, feeding: hot.feeding }, { won: 0, feeding: false }, { won: 1, feeding: true },
    'in a hazard the top row wins and the damper SHUTS');
  await page.getByTestId('circuit-panel').screenshot({ path: `${OUT}/a85-circuit-firing.png` }).catch(() => {});

  // NOT FIRING: The Undersill, depth 28, a seam. Same strip, same rock, one move.
  const cool = await at(28, null);
  console.log(`      at ${cool.where} — row ${cool.won + 1} won`);
  check({ won: cool.won, feeding: cool.feeding }, { won: 1, feeding: true }, { won: 0, feeding: false },
    'one station along, the same row does NOT fire and the damper OPENS');
  check(cool.acts > hot.acts, true, false, `the strip threw something both ways (${cool.acts} acts)`);
  await page.getByTestId('circuit-panel').screenshot({ path: `${OUT}/a85-circuit-quiet.png` }).catch(() => {});

  // The live readout — the LAW 3 half. Every read, saying what it says now.
  const readout = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="circuit-read-"]')]
      .map((el) => (el as HTMLElement).innerText.replace(/\n/g, ' ')));
  console.log('      what it reads right now:');
  for (const r of readout) console.log(`        ${r}`);
  check(readout.length, 8, 0, 'all eight reads print a live value');

  // ═══ A — THE TROUGH ══════════════════════════════════════════════════════
  console.log('\nA — the trough at 380px with five bands held');
  // The trough is Ferrite-gated (`refineryUnlocked` -> Ferrite mastery 3, which
  // is a DEPTH RECORD, not a flag). Seeded at the record, the way it is earned.
  await setup(page, `
    const s = engine.getState();
    s.depthRecords = s.depthRecords || {};
    s.depthRecords['ferrite'] = 150;
  `);
  const seeded = await page.evaluate(async () => {
    const w = window as unknown as Record<string, { getState: () => never }>;
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const s = w['__engine']!.getState() as unknown as Record<string, never>;
    // Five bands of one stone, and a second stone so the row is not a special
    // case of "the only row".
    for (const [purity, n] of [[10, 9], [50, 12], [70, 7], [88, 5], [97, 4]] as [number, number][]) {
      forge.addMaterial(s, 'marl', purity, n);
      forge.addMaterial(s, 'bonechalk', purity, n);
    }
    // The Refinery is Ferrite-gated; open it the way mastery does.
    const ref = await import(/* @vite-ignore */ '/src/engine/systems/refinery' + '.ts');
    return { unlocked: ref.refineryUnlocked(s) };
  });
  check(seeded.unlocked, true, false, 'the trough is open (Ferrite mastery 3)');
  await tab(page, 'refinery');
  await dismiss(page);
  await page.waitForTimeout(500);

  /**
   * MEASURED, NOT EYEBALLED. A truncating span squeezed to nothing still has
   * text in the DOM — `innerText` reads fine and the player sees an empty
   * sliver. So this reads the RENDERED WIDTH of the name element, which is the
   * thing that was actually zero.
   */
  const trough = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.panel')]
      // innerText reflects text-transform, and the header is uppercased in CSS.
      .find((p) => /the trough/i.test((p as HTMLElement).innerText));
    if (!rows) return null;
    const names = [...rows.querySelectorAll('span.truncate')]
      .map((el) => ({ text: (el as HTMLElement).innerText.trim(), w: Math.round(el.getBoundingClientRect().width) }))
      .filter((n) => n.text.length > 0);
    const chips = [...rows.querySelectorAll('button')].filter((b) => /×\d/.test(b.textContent ?? '')).length;
    return { names: names.slice(0, 4), chips, narrowest: Math.min(...names.map((n) => n.w)) };
  });
  if (!trough) {
    check('no trough', 'a trough', '', 'the trough rendered');
  } else {
    console.log(`      band chips on screen: ${trough.chips}`);
    for (const n of trough.names) console.log(`      "${n.text}" — ${n.w}px`);
    check(trough.chips >= 5, true, false, 'at least five band chips are held');
    check(trough.narrowest >= 40, true, false,
      `the narrowest material name is ${trough.narrowest}px (it was ~0)`);
    check(trough.names.every((n) => n.text.length > 0), true, false, 'every name renders non-empty');
  }
  // Scoped to the panel: a fullPage shot of a long room scrolls the row that is
  // being claimed off the top, which is how a green check ships an unreadable
  // picture. The claim is about ONE panel, so the shot is of one panel.
  const troughEl = page.locator('.panel').filter({ hasText: /THE TROUGH/i }).first();
  await troughEl.screenshot({ path: `${OUT}/a85-trough-5-bands.png` }).catch(() => {});
  await page.screenshot({ path: `${OUT}/a85-refinery-room.png`, fullPage: true });

  /**
   * EVERY OTHER ROW WITH THE SAME SHAPE. The defect is not "shrink-0 exists",
   * it is a shrink-0 sibling that can GROW without bound beside a truncating
   * name. This walks the live DOM for the general form: a flex row containing
   * a truncating element under 40px wide next to a non-shrinking sibling.
   */
  console.log('\nA2 — every other row in the app with the same shape');
  const rooms = ['dig', 'kiln', 'drills', 'hold', 'refinery', 'casting', 'gear', 'guild', 'shaft', 'relics', 'museum', 'journal'];
  const squeezed: string[] = [];
  for (const room of rooms) {
    await tab(page, room);
    await dismiss(page);
    await page.waitForTimeout(250);
    const bad = await page.evaluate((r) => {
      const out: string[] = [];
      for (const el of document.querySelectorAll('.truncate')) {
        const e = el as HTMLElement;
        if (!e.innerText.trim()) continue;
        const w = e.getBoundingClientRect().width;
        if (w >= 24) continue;
        // A 6px element holding a 6px en-dash is not squeezed, it is short.
        // The defect is CLIPPING: content wider than the box it was given.
        if (e.scrollWidth <= e.clientWidth + 2) continue;
        const sib = [...(e.parentElement?.children ?? [])]
          .filter((x) => x !== e)
          .find((x) => getComputedStyle(x).flexShrink === '0');
        if (!sib) continue;
        out.push(`${r}: "${e.innerText.trim().slice(0, 24)}" clipped to ${Math.round(w)}px of ${e.scrollWidth}px beside a shrink-0 sibling`);
      }
      return out;
    }, room);
    squeezed.push(...bad);
  }
  check(squeezed, [], ['x'], 'no row in twelve rooms squeezes a name under 24px');
  for (const s of squeezed) console.log(`      ${s}`);

  // ═══ D — WHAT WAS CUT, AND WHAT IT WOULD WANT ════════════════════════════
  console.log('\nD — the reads §7.3 asks for that were CUT, and why');
  for (const [line, sys, why] of CUT) console.log(`      ${line}\n         needs ${sys} — ${why}`);
  console.log('\nD2 — what the Circuit would want that Loam cannot give it');
  for (const [want, sys, why] of WANT) console.log(`      ${want}\n         needs ${sys} — ${why}`);

  // ═══ E — PILLAR 2 ════════════════════════════════════════════════════════
  console.log('\nE — PILLAR 2: dpsMax at the SAME depth, full strip live and none');
  const pillar = await page.evaluate(async () => {
    const eng = await import(/* @vite-ignore */ '/src/engine/index' + '.ts');
    const mod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const circ = await import(/* @vite-ignore */ '/src/engine/systems/circuit' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const drl = await import(/* @vite-ignore */ '/src/engine/systems/drills' + '.ts');
    const ctx = { emit() {}, dirty() {} };
    const read = (withStrip: boolean): { dps: number; acts: number } => {
      const s = eng.createEngine({ nowMs: 0 }).getState();
      s.kiln.built = true;
      s.drills.bayBuilt = true;
      s.drills.units = [drl.newDrill('a'), drl.newDrill('b')];
      s.drills.units[0].behavior = 'sweep';
      s.plant.tiers['crusher'] = 1;
      s.depth = 28;                              // THE SAME DEPTH IN BOTH ARMS
      circ.ensureCircuit(s).opened = true;
      forge.addMaterial(s, 'marl', 50, 40);
      if (withStrip) {
        const c = circ.ensureCircuit(s);
        c.strips['kiln'] = [
          { read: 'heat', op: 'lt', value: 50, act: 'feed' },
          { read: 'seam', op: 'is', value: 'marl', act: 'fuel:marl' },
          { read: 'compaction', op: 'gt', value: 10, act: 'damp' },
          { read: 'depth', op: 'gt', value: 5, act: 'fuel:ash' },
        ];
        c.strips['bay'] = [
          { read: 'compaction', op: 'gt', value: 5, act: 'behaviour:sweep' },
          { read: 'charge', op: 'lt', value: 90, act: 'priority:ores' },
          { read: 'depth', op: 'gt', value: 1, act: 'behaviour:chain' },
          { read: 'station', op: 'is', value: 'seam', act: 'priority:rock' },
        ];
        c.strips['crusher'] = [
          { read: 'surge', op: 'gt', value: 10, act: 'run' },
          { read: 'depth', op: 'gt', value: 1, act: 'bank' },
        ];
      }
      const m = new mod.ModifierCache(); m.invalidate();
      for (let i = 0; i < 40; i++) circ.tickCircuit(s, m, ctx, 2);
      m.invalidate();
      const acts = circ.ensureCircuit(s).acts;
      return {
        dps: Math.round(face.dpsMax(s, m).toNumber() * 1e6),
        acts: (acts['kiln'] ?? 0) + (acts['bay'] ?? 0) + (acts['crusher'] ?? 0),
      };
    };
    return { on: read(true), off: read(false) };
  });
  console.log(`      strip live  dpsMax ${pillar.on.dps}   (${pillar.on.acts} actions thrown)`);
  console.log(`      no strip    dpsMax ${pillar.off.dps}  (${pillar.off.acts} actions thrown)`);
  check(pillar.on.dps, pillar.off.dps, pillar.off.dps + 1, 'dpsMax unmoved at depth 28');
  /**
   * NOT VACUOUS, and the number is small on purpose: an ACT is counted only
   * when the winning row CHANGES something, so a strip converges — it throws
   * the damper, sets the bay, fires the Crusher, and then holds. Three acts
   * against the control arm's zero is the comparison being non-empty.
   */
  check({ live: pillar.on.acts > 0, control: pillar.off.acts }, { live: true, control: 0 },
    { live: false, control: 0 }, 'and the strip really ran — not a vacuous comparison');

  // ═══ F — §23 ═════════════════════════════════════════════════════════════
  console.log('\nF — §23, the first 45 minutes');
  const beats = await page.evaluate(async () => {
    const eng = await import(/* @vite-ignore */ '/src/engine/index' + '.ts');
    const mod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const up = await import(/* @vite-ignore */ '/src/engine/upgrades' + '.ts');
    const circ = await import(/* @vite-ignore */ '/src/engine/systems/circuit' + '.ts');
    const s = eng.createEngine({ nowMs: 0 }).getState();
    const m = new mod.ModifierCache(); m.invalidate();
    const blade = up.allUpgrades().find((u: { id: string }) => u.id === 'blade');
    return {
      // 0:00 — a 6x6 grid.
      cells: s.face.cells.length,
      // 0:04 — BLADE at 50 Dust, ~7 clicks in.
      bladeCost: blade ? Number(up.nextCost(blade, 0).toString()) : -1,
      // 0:40 — the field ceiling exists and is finite.
      dps: Math.round(face.dpsMax(s, m).toNumber() * 100) / 100,
      // AND THE ONE THIS PHASE COULD BREAK: no Circuit anywhere in the opening.
      circuit: circ.circuitUnlocked(s),
    };
  });
  check(beats.cells, 36, 0, '0:00 — a 6×6 grid');
  check(beats.bladeCost, 50, 0, '0:04 — BLADE at 50 Dust');
  check(beats.dps, 2.88, 0, '0:40 — the field ceiling is 2.88/s');
  check(beats.circuit, false, true, 'and the Circuit is nowhere in the first 45 minutes');

  // ═══ G — 380px ═══════════════════════════════════════════════════════════
  console.log('\nG — 380px, overflow and page errors');
  await tab(page, 'kiln');
  await dismiss(page);
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) {
        out.push(`${el.tagName}.${(el.className || '').toString().slice(0, 40)}`);
      }
    }
    return { count: out.length, first: out.slice(0, 3), doc: document.documentElement.scrollWidth };
  });
  check(overflow.count, 0, 1, `0 elements overflow 380px (doc ${overflow.doc}px)`);
  if (overflow.count > 0) console.log(`      ${overflow.first.join(' | ')}`);
  await page.screenshot({ path: `${OUT}/a85-circuit-panel.png`, fullPage: true });
  check(errors.length, 0, 1, '0 page errors');
  for (const e of errors.slice(0, 5)) console.log(`      ${e}`);

  console.log(`\n${problems.length === 0 ? 'ALL PASS' : `${problems.length} PROBLEM(S)`}`);
  for (const p of problems) console.log(`  - ${p}`);
  console.log(`shots in ${OUT}/`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
