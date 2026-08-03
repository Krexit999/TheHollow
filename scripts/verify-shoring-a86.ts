/**
 * SHORING AND DRIFTS, DRIVEN IN THE REAL GAME (A.86, §9.4).
 *
 *   A  a band SHORED with Brick and cast parts, through the real button
 *   B  the fall — a Collapse lands the run at the bottom of the drift, instantly
 *   C  it SURVIVES the Collapse, and the Roll says so on the row itself
 *   D  it REFUSES TO RE-ROLL while unshored bands re-roll around it, across
 *      real Collapses, in play
 *   E  two drifts CHAINING — and one bought out of order moving nothing
 *   F  the re-cover fraction, before and after
 *   G  dust/hr unmoved and dpsMax unmoved, both arms at the SAME depth
 *   H  §23 — the opening beats, including the one this phase could break
 *   I  380px, 0 overflow, 0 page errors
 *
 * Every assertion goes through `check(actual, want, bad, label)` and reports
 * VACUOUS if the known-bad value equals the expected one. Clipping is asserted
 * with getBoundingClientRect, never innerText — a squeezed span reads perfectly
 * in the DOM.
 *
 *   npx tsx scripts/verify-shoring-a86.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5174';
const OUT = process.argv[3] ?? 'sim-out/shots-a86';
const W = 380, H = 1400;

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
 * WHAT SHORING WANTS THAT LOAM CANNOT GIVE IT, and the system that has to exist
 * first. Printed, not asserted — the point is that these are named and open.
 */
const WANTS = [
  ['drifts through a BREACH', 'THE LONG FALL (challenge 2, §21.2 / spine:1539)', 'the spine already authors it as a challenge reward — "you may not Collapse" pays "drifts survive Breach". Challenge wiring is its own phase, so a Loam drift dies at the Breach today.'],
  ['drifts through a RECURSION', 'THE LONG STAIR (a Seat, spine:3424)', '"Brick + cast parts, continuously. Every drift you own becomes permanent through Recursion." The Seats are a terminal-craft layer that does not exist yet.'],
  ['a drift in any shell but Loam', 'AN AUTHORED ROLL PER SHELL (§1.3)', '`shellRoll` returns [] for the other six, so there are no bands to timber. The same wall the Circuit hit at A.85 and the remains at A.84 — six Rolls is a content pass, not a line.'],
  ['a crew walking your drifts', 'CREWS (automation t7, §25.4)', '§25.4: "Assign it to a drift; it descends the Roll alone." The drift is the road; nothing walks it but you.'],
  ['a drift you have NOT walked', 'PROSPECTING / STAKING (§9)', 'shoring refuses ahead of your record on purpose, so a drift can never buy depth. §41\'s "crews can open drifts you have not walked" is the authored exception and it needs crews first.'],
  ['un-shoring that returns the timber', 'THE BREAKER (§15)', 'pulling the props costs the Brick again and loses the cast parts. Salvage-back is the Breaker\'s job everywhere else in the game; it has no hook on a drift.'],
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

  // ═══ FIXTURE FIRST ═══════════════════════════════════════════════════════
  console.log('\nFIXTURE — the rig station, the bands, and the price rule');
  const fixture = await page.evaluate(async () => {
    const sh = await import(/* @vite-ignore */ '/src/engine/systems/shoring' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState();
    const def = sh.rigStation(s);
    return {
      rig: def ? { id: def.id, depth: def.depth, wreck: def.wreck } : null,
      payback: sh.SHORE_PAYBACK,
      bandCount: sh.bands(s).length,
      firstBands: sh.bands(s).slice(0, 4).map((b: { def: { name: string }; from: number; to: number }) =>
        `${b.def.name} ${b.from}-${b.to}`),
    };
  });
  check(fixture.rig, { id: 'shoringdeep', depth: 120, wreck: 'SHORING RIG' }, null,
    'Loam authors the rig at Shoring Deep 120');
  check(fixture.payback, 3, 0, 'a band costs three walks of itself');
  check(fixture.bandCount, 16, 0, 'sixteen timberable bands (The Turnrow at 0 has none)');
  console.log(`      ${fixture.firstBands.join(' · ')}`);

  // ═══ H — §23 BEFORE ANYTHING IS SEEDED ═══════════════════════════════════
  console.log('\nH — §23, the first 45 minutes (read before the fixture is dirtied)');
  const beats = await page.evaluate(async () => {
    const eng = await import(/* @vite-ignore */ '/src/engine/index' + '.ts');
    const mod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const up = await import(/* @vite-ignore */ '/src/engine/upgrades' + '.ts');
    const sh = await import(/* @vite-ignore */ '/src/engine/systems/shoring' + '.ts');
    const shaft = await import(/* @vite-ignore */ '/src/engine/systems/shaftSys' + '.ts');
    const s = eng.createEngine({ nowMs: 0 }).getState();
    const m = new mod.ModifierCache(); m.invalidate();
    const blade = up.allUpgrades().find((u: { id: string }) => u.id === 'blade');
    // DEPTH PRESSURE IS A dustYield TERM, so the 2.88 beat is only 2.88 at the
    // surface. Reading it at depth 37 came out 5.01 — the exact trap the brief
    // warns about, tripped by the check that was supposed to guard it. The peak
    // reading below therefore gets its own state.
    const peakState = eng.createEngine({ nowMs: 0 }).getState();
    peakState.depth = 37; peakState.shaft.reached = 37;
    return {
      cells: s.face.cells.length,
      bladeCost: blade ? Number(up.nextCost(blade, 0).toString()) : -1,
      dps: Math.round(face.dpsMax(s, m).toNumber() * 100) / 100,
      shoring: sh.shoringUnlocked(s),
      // THE ONE THIS PHASE COULD BREAK: a player with no rig must read the
      // Collapse payout exactly as they always did.
      peak: shaft.shaftPeak(peakState),
    };
  });
  check(beats.cells, 36, 0, '0:00 — a 6×6 grid');
  check(beats.bladeCost, 50, 0, '0:04 — BLADE at 50 Dust');
  check(beats.dps, 2.88, 0, '0:40 — the field ceiling is 2.88/s');
  check(beats.shoring, false, true, 'no shoring anywhere in the first 45 minutes');
  check(beats.peak, 37, 0, 'and a player with no rig reads the Collapse peak unchanged');

  // ═══ A — SHORE A BAND, THROUGH THE REAL BUTTON ═══════════════════════════
  console.log('\nA — a band shored with Brick and cast parts');
  /**
   * The wreck is LOOTED by walking to it, which is the real gate; seeding the
   * loot record and the depth record is the fixture, and everything after this
   * point goes through the panel.
   */
  await setup(page, `
    const s = engine.getState();
    s.depthRecords['loam'] = 150;
    s.maxDepthRecord = 150;
    s.kiln.built = true;
    if (!s.roll.looted.includes('shoringdeep')) s.roll.looted.push('shoringdeep');
    s.currencies.brick = s.currencies.dust.mul(0).add(1e9);
    s.currencies.dust = s.currencies.dust.add(1e9);
    s.casting.rack = [];
    for (let i = 0; i < 20; i++) s.casting.rack.push({ id: 'p'+i, materialId: 'marl', shape: 'head', purity: 40 + i, traits: [] });
  `);
  await tab(page, 'shaft');
  await dismiss(page);
  await page.waitForTimeout(400);

  const beforeRaise = await page.evaluate(() => ({
    panel: document.querySelectorAll('[data-testid="shoring-panel"]').length,
    canTimber: document.querySelectorAll('[data-testid^="shore-"]').length,
  }));
  check(beforeRaise.panel, 1, 0, 'the wreck is walked, so the rig panel is on the Shaft screen');
  check(beforeRaise.canTimber, 0, 1, '...but nothing can be timbered until the rig is raised');
  await page.screenshot({ path: `${OUT}/a86-rig-unraised.png`, fullPage: true }).catch(() => {});

  // Raise it through the real UpgradeRow button.
  await page.getByRole('button', { name: /Raise the Shoring Rig/ }).first().click();
  await page.waitForTimeout(500);
  const raised = await page.evaluate(async () => {
    const sh = await import(/* @vite-ignore */ '/src/engine/systems/shoring' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    return sh.shoringUnlocked(w['__engine']!.getState());
  });
  check(raised, true, false, 'the rig is raised, with Brick, through its own row');

  // Timber the first band with the panel's own button.
  const spend = async (label: string) => {
    const before = await page.evaluate(() => {
      const w = window as unknown as Record<string, { getState: () => never }>;
      const s = w['__engine']!.getState() as unknown as {
        currencies: Record<string, { toNumber(): number }>; casting: { rack: unknown[] };
      };
      return { brick: s.currencies['brick']!.toNumber(), rack: s.casting.rack.length };
    });
    await page.getByTestId(`shore-${label}`).click();
    await page.waitForTimeout(400);
    const after = await page.evaluate(async () => {
      const sh = await import(/* @vite-ignore */ '/src/engine/systems/shoring' + '.ts');
      const w = window as unknown as Record<string, { getState: () => never }>;
      const s = w['__engine']!.getState() as unknown as {
        currencies: Record<string, { toNumber(): number }>; casting: { rack: unknown[] };
      };
      return {
        brick: s.currencies['brick']!.toNumber(),
        rack: s.casting.rack.length,
        drift: sh.driftDepth(s),
      };
    });
    return { paidBrick: Math.round(before.brick - after.brick), parts: before.rack - after.rack, drift: after.drift };
  };

  const kilnyard = await spend('kilnyard');
  console.log(`      Kiln Yard 0-9m: paid ${kilnyard.paidBrick} Brick + ${kilnyard.parts} cast parts`);
  check(kilnyard.paidBrick > 0, true, false, 'it cost Brick');
  check(kilnyard.parts, 1, 0, 'and it cost a cast part');
  check(kilnyard.drift, 9, 0, 'the fall now lands at 9m');

  // ═══ E — DRIFTS CHAIN ════════════════════════════════════════════════════
  console.log('\nE — drifts chain, and a band bought out of order moves nothing');
  // Buy one OUT of order first, so the stranded case is shown before the fix.
  await page.evaluate(() => {
    const w = window as unknown as Record<string, { dispatch: (a: unknown) => unknown }>;
    w['__engine']!.dispatch({ type: 'shoreBand', stationId: 'undersill' });
  });
  await page.waitForTimeout(400);
  const stranded = await page.evaluate(async () => {
    const sh = await import(/* @vite-ignore */ '/src/engine/systems/shoring' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState();
    return {
      drift: sh.driftDepth(s),
      stranded: sh.strandedDrifts(s).map((b: { def: { id: string } }) => b.def.id),
      warned: document.querySelectorAll('[data-testid="drift-stranded"]').length,
    };
  });
  check({ drift: stranded.drift, stranded: stranded.stranded }, { drift: 9, stranded: ['undersill'] },
    { drift: 28, stranded: [] }, 'a band with a gap above it moves the fall by NOTHING');
  check(stranded.warned, 1, 0, '...and the panel says why');

  const sag = await spend('sag');
  console.log(`      The Sag 10-17m: paid ${sag.paidBrick} Brick + ${sag.parts} cast parts`);
  check(sag.drift, 28, 9, 'buying the gap chains all three into one fall to 28m');
  await page.screenshot({ path: `${OUT}/a86-drifts-chained.png`, fullPage: true }).catch(() => {});

  // ═══ F(a) + D(a) — WHAT THE ROLL HOLDS BEFORE THE FALL ═══════════════════
  const before = await page.evaluate(async () => {
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { roll: { rolled: Record<string, unknown> } };
    const out: Record<string, string> = {};
    for (const id of Object.keys(s.roll.rolled)) {
      const c = roll.contentsOf(s, id) as { seam: string; feature: string; hazard: number };
      out[id] = `${c.seam}|${c.feature}|${c.hazard}`;
    }
    return out;
  });

  // ═══ B + C — THE FALL, AND SURVIVING IT ══════════════════════════════════
  console.log('\nB — the fall: a Collapse lands the run at the bottom of the drift');
  const fell = await page.evaluate(async () => {
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean } }>;
    const sh = await import(/* @vite-ignore */ '/src/engine/systems/shoring' + '.ts');
    const s = w['__engine']!.getState() as unknown as {
      depth: number; shaft: { reached: number; drift?: number }; roll: { rolls: number };
    };
    s.depth = 140; s.shaft.reached = 140;
    const rollsBefore = s.roll.rolls;
    const ok = w['__engine']!.dispatch({ type: 'collapse' }).ok;
    return {
      ok, depth: s.depth, reached: s.shaft.reached, drift: s.shaft.drift ?? 0,
      driftDepth: sh.driftDepth(s), rolled: s.roll.rolls > rollsBefore,
    };
  });
  check({ ok: fell.ok, depth: fell.depth }, { ok: true, depth: 28 }, { ok: true, depth: 0 },
    'the run starts at 28m instead of the surface');
  check({ reached: fell.reached, drift: fell.drift }, { reached: 28, drift: 28 }, { reached: 0, drift: 0 },
    'your own tunnel is cleared rock, and the floor it handed you is recorded');
  check(fell.driftDepth, 28, 0, 'C — the drifts survived the Collapse');
  check(fell.rolled, true, false, '...and the Roll really did re-roll (the next check is not vacuous)');

  await tab(page, 'shaft');
  await dismiss(page);
  await page.waitForTimeout(400);
  const marks = await page.evaluate(() =>
    ['kilnyard', 'sag', 'undersill', 'marlgate'].map((id) => {
      const el = document.querySelector(`[data-testid="station-${id}"]`);
      return `${id}:${el && (el as HTMLElement).innerText.includes('⌸') ? 'timbered' : '—'}`;
    }));
  check(marks, ['kilnyard:timbered', 'sag:timbered', 'undersill:timbered', 'marlgate:—'], [],
    'and the Roll marks the timbered rows, on the rows themselves');
  await page.screenshot({ path: `${OUT}/a86-after-collapse.png`, fullPage: true }).catch(() => {});

  // ═══ D — IT REFUSES TO RE-ROLL WHILE THE REST TURNS OVER ═════════════════
  console.log('\nD — shored bands hold still while unshored bands re-roll around them');
  const churn = await page.evaluate(async (was: Record<string, string>) => {
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean } }>;
    const s = w['__engine']!.getState() as unknown as {
      depth: number; shaft: { reached: number }; roll: { rolled: Record<string, unknown> };
    };
    const read = () => {
      const out: Record<string, string> = {};
      for (const id of Object.keys(s.roll.rolled)) {
        const c = roll.contentsOf(s, id) as { seam: string; feature: string; hazard: number };
        out[id] = `${c.seam}|${c.feature}|${c.hazard}`;
      }
      return out;
    };
    // TEN REAL COLLAPSES, dispatched. Not `rerollRoll` — the claim is about
    // what a player sees across falls, so the falls have to be falls.
    const moved: Record<string, number> = {};
    let prev = was;
    for (let i = 0; i < 10; i++) {
      s.depth = 140; s.shaft.reached = 140;
      w['__engine']!.dispatch({ type: 'collapse' });
      const now = read();
      for (const id of Object.keys(now)) {
        if (now[id] !== prev[id]) moved[id] = (moved[id] ?? 0) + 1;
      }
      prev = now;
    }
    return { moved, shored: ['kilnyard', 'sag', 'undersill'] };
  }, before);
  const frozen = churn.shored.map((id) => `${id}:${churn.moved[id] ?? 0}`);
  const movers = Object.entries(churn.moved)
    .filter(([id]) => !churn.shored.includes(id))
    .sort((a, b) => b[1] - a[1]);
  console.log(`      shored, across 10 real Collapses: ${frozen.join(' ')}`);
  console.log(`      unshored, same 10:              ${movers.slice(0, 6).map(([id, n]) => `${id}:${n}`).join(' ')}`);
  check(frozen, ['kilnyard:0', 'sag:0', 'undersill:0'], ['kilnyard:1', 'sag:1', 'undersill:1'],
    'a shored band never changed in ten Collapses');
  check(movers.length >= 6, true, false,
    `and ${movers.length} unshored stations did — the control is real`);

  // ═══ F — THE RE-COVER FRACTION ═══════════════════════════════════════════
  console.log('\nF — what fraction of a Collapse re-covers ground already walked');
  const recover = await page.evaluate(async () => {
    const sh = await import(/* @vite-ignore */ '/src/engine/systems/shoring' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { depthRecords: Record<string, number> };
    const record = s.depthRecords['loam'] ?? 0;
    const drift = sh.driftDepth(s);
    // The run this player actually does: fall/start, then push to the record.
    return {
      record,
      drift,
      before: sh.recoverFraction(record, record, 0),
      after: sh.recoverFraction(record, record, drift),
    };
  });
  console.log(`      a run to the record (${recover.record}m), no drifts : ${(recover.before * 100).toFixed(1)}% re-covered`);
  console.log(`      the same run with the drift at ${recover.drift}m       : ${(recover.after * 100).toFixed(1)}% re-covered`);
  check(recover.before > 0.99, true, false, 'without drifts a repeat run re-covers essentially all of itself');
  check(Math.round(recover.after * 1000) / 1000, Math.round(((150 - 28) / 150) * 1000) / 1000, 1,
    'the drift removes exactly its own share');

  // ═══ G — PILLAR 2 ════════════════════════════════════════════════════════
  console.log('\nG — PILLAR 2: dust/hr and dpsMax at the SAME depth, drifts and none');
  const pillar = await page.evaluate(async () => {
    const eng = await import(/* @vite-ignore */ '/src/engine/index' + '.ts');
    const mod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const sh = await import(/* @vite-ignore */ '/src/engine/systems/shoring' + '.ts');
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const ctx = { emit() {}, dirty() {} };
    /**
     * A SEEDED STREAM, or this measures the weather.
     *
     * Crits, fractures and drill targeting all reach for `Math.random`, so the
     * first cut of this check read 1,792,861 against 1,798,714 dust/hr and
     * called a 0.33% RNG wobble a pillar-2 violation. Both arms run the same
     * stream from the same seed, so "unmoved" can be asserted as EQUAL rather
     * than as a tolerance — and a tolerance wide enough to swallow that wobble
     * would be wide enough to swallow a real leak.
     */
    const seeded = (seed: number) => {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    const read = (shore: boolean) => {
      const engine = eng.createEngine({ nowMs: 0 });
      const s = engine.getState();
      roll.ensureRoll(s, () => 0.5);            // the SAME Roll in both arms
      s.depthRecords['loam'] = 150;
      s.roll.rig = true;
      s.currencies['brick'] = s.currencies['dust'].mul(0).add(1e9);
      s.casting.rack = Array.from({ length: 12 }, (_, i) => ({ id: 'p' + i, materialId: 'marl', shape: 'head', purity: 50, traits: [] }));
      if (shore) for (const id of ['kilnyard', 'sag', 'undersill']) sh.shoreBand(s, ctx, id);
      s.depth = 28;                              // THE SAME DEPTH IN BOTH ARMS
      const m = new mod.ModifierCache(); m.invalidate();
      const dps = Math.round(face.dpsMax(s, m).toNumber() * 1e6);
      // Live income: run the real engine for 600 ticked seconds and read the
      // Dust it actually produced. Depth Pressure is a dustYield term, so this
      // is only meaningful because both arms stand in the same place.
      const total = () => s.totals['dust']?.toNumber() ?? 0;
      const start = total();
      const real = Math.random;
      Math.random = seeded(20260804);
      try {
        for (let i = 0; i < 600; i++) engine.tick(1000);
      } finally {
        Math.random = real;
      }
      const dustPerHr = (total() - start) * 6;
      return { dps, dustPerHr, drift: sh.driftDepth(s), depth: s.depth };
    };
    return { on: read(true), off: read(false) };
  });
  console.log(`      drifts  dpsMax ${pillar.on.dps}  dust/hr ${pillar.on.dustPerHr.toFixed(0)}  (drift ${pillar.on.drift}m, standing at ${pillar.on.depth}m)`);
  console.log(`      none    dpsMax ${pillar.off.dps}  dust/hr ${pillar.off.dustPerHr.toFixed(0)}  (drift ${pillar.off.drift}m, standing at ${pillar.off.depth}m)`);
  check(pillar.on.dps, pillar.off.dps, pillar.off.dps + 1, 'dpsMax unmoved at depth 28');
  check(pillar.on.dustPerHr.toFixed(2), pillar.off.dustPerHr.toFixed(2), '0.00', 'dust/hr unmoved at depth 28');
  check({ on: pillar.on.drift, off: pillar.off.drift }, { on: 28, off: 0 }, { on: 0, off: 0 },
    'and the drift arm really has a drift — not a vacuous comparison');

  // ═══ WHAT SHORING WANTS ══════════════════════════════════════════════════
  console.log('\nWhat shoring wants that Loam cannot give it');
  for (const [want, sys, why] of WANTS) console.log(`      ${want}\n         needs ${sys} — ${why}`);

  // ═══ I — 380px ═══════════════════════════════════════════════════════════
  console.log('\nI — 380px, overflow and page errors');
  await tab(page, 'shaft');
  await dismiss(page);
  await page.waitForTimeout(400);
  const layout = await page.evaluate(() => {
    const over: string[] = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) {
        over.push(`${el.tagName}.${(el.className || '').toString().slice(0, 40)}`);
      }
    }
    // CLIPPING, measured — not innerText, which reads perfectly out of a
    // zero-width box. A truncating span whose content is wider than the box it
    // was given, next to a sibling that refuses to shrink, is the defect.
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
  check(layout.clipped, [], ['x'], '0 names clipped to nothing on the Shaft screen');
  await page.getByTestId('shoring-panel').screenshot({ path: `${OUT}/a86-drifts-panel.png` }).catch(() => {});
  check(errors.length, 0, 1, '0 page errors');
  for (const e of errors.slice(0, 5)) console.log(`      ${e}`);

  console.log(`\n${problems.length === 0 ? 'ALL PASS' : `${problems.length} PROBLEM(S)`}`);
  for (const p of problems) console.log(`  - ${p}`);
  console.log(`shots in ${OUT}/`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
