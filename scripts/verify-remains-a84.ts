/**
 * THE REMAINS AND THE REMAINS BOARD, DRIVEN IN THE REAL GAME (A.84).
 *
 * Six Loam materials were `source: 'combat'` after combat was cut, which made
 * them obtainable by no route at all. This drives the live build and shows:
 *
 *   A  all six drop THROUGH THE REAL HARVEST PATH — a chip at a depth, not a
 *      call to rollDrop — and each one only near the station that buries it
 *   B  the 45,000-roll coverage table, read off the live module
 *   C  nothing was added to the rarity pool: a depth with no station nearby
 *      rolls exactly what it rolled before
 *   D  PILLAR 2 — dpsMax identical at the SAME depth, mechanism on and off
 *   E  each of the five new chains fires, and names the orphan it consumes
 *   F  a chain fired AT THE BENCH, through the panel a player uses
 *   G  the pair reading names a live pair before any spend, and refuses a dead
 *      one
 *   H  the shallow board is bigger than it was
 *   I  380px, 0 overflow, 0 page errors
 *
 * Every assertion goes through `check(actual, want, bad, label)` and reports
 * VACUOUS if the known-bad value equals the expected one.
 *
 *   npx tsx scripts/verify-remains-a84.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots-a84';
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

const REMAINS = ['chitinshard', 'gravemote', 'wormsilk', 'burrowertooth', 'marrowglass', 'taproot'];

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('render recovered')) errors.push(m.text().slice(0, 160));
  });
  // esbuild names every arrow it transpiles into the page; without this the
  // first `const f = () => …` inside an evaluate dies on `__name is not defined`.
  await page.addInitScript(() => {
    (window as never as Record<string, unknown>)['__name'] = (f: unknown) => f;
  });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await dismiss(page);
  await setup(page, 'engine.getState().forge.built = true;');

  // ═══ FIXTURE FIRST ═══════════════════════════════════════════════════════
  console.log('\nFIXTURE — the six are remains, and they are buried somewhere');
  const fixture = await page.evaluate(async () => {
    const m = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const roll = await import(/* @vite-ignore */ '/src/engine/content/shell1/roll' + '.ts');
    const remains = m.MATERIALS.filter((x: { source?: string }) => x.source === 'remains');
    const placed: Record<string, number[]> = {};
    for (const st of roll.loamRoll()) {
      for (const id of st.remains ?? []) (placed[id] ??= []).push(st.depth);
    }
    return {
      ids: remains.map((x: { id: string }) => x.id).sort(),
      combatLeftInLoam: m.MATERIALS.filter((x: { shellId: string; source?: string }) =>
        x.shellId === 'loam' && x.source === 'combat').length,
      placed,
    };
  });
  check(fixture.ids, [...REMAINS].sort(), [], 'six Loam materials are REMAINS');
  check(fixture.combatLeftInLoam, 0, 6, '...and none of them still says combat');
  for (const id of REMAINS) {
    console.log(`      ${id.padEnd(15)} buried at depth ${(fixture.placed[id] ?? []).join(', ')}`);
  }

  // ═══ A — THEY DROP IN PLAY ═══════════════════════════════════════════════
  console.log('\nA — dropping through the REAL harvest path, at the place that holds them');
  /**
   * NOT `rollDrop`. This stands the player at a station's depth and fires the
   * live `rollForDrop` — the same function a chip calls — so what is being
   * shown is the drop economy, not a pure function that happens to exist.
   */
  const inPlay = await page.evaluate(async (ids) => {
    const w = window as unknown as Record<string, never>;
    const e = w['__engine'] as unknown as { getState: () => never };
    const drops = await import(/* @vite-ignore */ '/src/engine/systems/drops' + '.ts');
    const mods = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const roll = await import(/* @vite-ignore */ '/src/engine/content/shell1/roll' + '.ts');
    const s = e.getState() as unknown as { depth: number; materials: { stacks: Record<string, unknown> } };
    const cache = new mods.ModifierCache();
    const ctx = { emit() {}, dirty() {} };
    const found: Record<string, { at: number; n: number }[]> = {};
    for (const st of roll.loamRoll()) {
      const before: Record<string, number> = {};
      for (const id of ids) before[id] = forge.materialCount(s, id);
      s.depth = st.depth;
      cache.invalidate();
      // 400 harvests at full charge: the drop CHANCE is untouched, so this is
      // simply enough rolls for a share to show.
      for (let i = 0; i < 400; i++) drops.rollForDrop(s, cache, ctx, 40, 1, 'verify');
      for (const id of ids) {
        const got = forge.materialCount(s, id) - before[id]!;
        if (got > 0) (found[id] ??= []).push({ at: st.depth, n: got });
      }
    }
    return found;
  }, REMAINS);
  /**
   * WITHIN REACH OF a burying station, not AT one. The first cut of this check
   * compared the drop depth to the station depth exactly and failed honestly on
   * BRICKLIGHT — depth 44, which is four under Marlgate (chitinshard, 40) and
   * three over The Long Cut (burrowertooth, 47). Both readings were the reach
   * window working; the assertion was the thing that was wrong.
   */
  const REACH = 4;
  for (const id of REMAINS) {
    const at = inPlay[id] ?? [];
    const buried = fixture.placed[id] ?? [];
    console.log(`      ${id.padEnd(15)} ${at.map((x) => `${x.n}@${x.at}`).join('  ') || 'NONE'}`);
    check(at.length > 0, true, false, `${id} drops in play`);
    check(at.every((x) => buried.some((d) => Math.abs(d - x.at) <= REACH)), true, false,
      `...and only within ${REACH} of a station that buries it (${buried.join('/')})`);
  }
  // The other half of the same claim: a station burying NOTHING gives none of
  // them, which is what makes this a place rather than a shell-wide drop.
  const barren = await page.evaluate(async (ids) => {
    const w = window as unknown as Record<string, never>;
    const e = w['__engine'] as unknown as { getState: () => never };
    const drops = await import(/* @vite-ignore */ '/src/engine/systems/drops' + '.ts');
    const mods = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const s = e.getState() as unknown as { depth: number };
    const before: Record<string, number> = {};
    for (const id of ids) before[id] = forge.materialCount(s, id);
    const cache = new mods.ModifierCache();
    const ctx = { emit() {}, dirty() {} };
    s.depth = 120; // Shoring Deep — a station, and it buries nothing
    cache.invalidate();
    for (let i = 0; i < 2000; i++) drops.rollForDrop(s, cache, ctx, 40, 1, 'verify');
    return ids.filter((id) => forge.materialCount(s, id) > before[id]!);
  }, REMAINS);
  check(barren, [], REMAINS, '2,000 harvests at Shoring Deep (buries nothing) produce NONE of them');

  // ═══ B — THE COVERAGE TABLE ══════════════════════════════════════════════
  console.log('\nB — 45,000 rolls, depths 0-150, off the live module');
  const cover = await page.evaluate(async (ids) => {
    const m = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const seen: Record<string, { n: number; lo: number; hi: number }> = {};
    for (let i = 0; i < 45000; i++) {
      const d = i % 151;
      const r = m.rollDrop('loam', d);
      if (r.kind !== 'material') continue;
      const s = (seen[r.materialId] ??= { n: 0, lo: 999, hi: -1 });
      s.n += 1; s.lo = Math.min(s.lo, d); s.hi = Math.max(s.hi, d);
    }
    return { seen, missing: ids.filter((id) => !seen[id]) };
  }, REMAINS);
  for (const id of REMAINS) {
    const s = cover.seen[id];
    console.log(`      ${id.padEnd(15)} ${String(s?.n ?? 0).padStart(5)} units   depths ${s ? `${s.lo}-${s.hi}` : '-'}`);
  }
  check(cover.missing, [], REMAINS, 'all six come out of 45,000 rolls');

  // ═══ C — THE POOL IS UNTOUCHED ═══════════════════════════════════════════
  console.log('\nC — nothing was added to the rarity pool');
  const pool = await page.evaluate(async () => {
    const m = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    // depth 105: Quillrest 98 and THE KNOT 109 are the neighbours and neither
    // buries anything, so this depth must roll bit-for-bit as it did before.
    const rng = (): number => 0.5;
    const on = m.rollDrop('loam', 105, rng);
    const share = m.REMAINS_TUNING.share;
    m.REMAINS_TUNING.share = 0;
    const off = m.rollDrop('loam', 105, rng);
    m.REMAINS_TUNING.share = share;
    return { on, off, near: m.remainsAt('loam', 105).length };
  });
  check(pool.near, 0, 1, 'depth 105 has no station burying anything');
  check(pool.on, pool.off, { kind: 'nothing' }, '...so it rolls exactly what it rolled before A.84');

  // ═══ D — PILLAR 2 ════════════════════════════════════════════════════════
  console.log('\nD — PILLAR 2, both arms at the SAME depth');
  const ceiling = await page.evaluate(async () => {
    const w = window as unknown as Record<string, never>;
    const e = w['__engine'] as unknown as { getState: () => never };
    const m = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const mods = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const s = e.getState() as unknown as { depth: number };
    s.depth = 28; // The Undersill — a station that buries TWO things
    const read = (share: number): number => {
      m.REMAINS_TUNING.share = share;
      const c = new mods.ModifierCache();
      c.invalidate();
      return Math.round(face.dpsMax(s, c).toNumber() * 1e6);
    };
    const on = read(0.35);
    const off = read(0);
    m.REMAINS_TUNING.share = 0.35;
    return { on, off };
  });
  console.log(`      dpsMax x1e6 at depth 28 — remains ON ${ceiling.on} · OFF ${ceiling.off}`);
  check(ceiling.on, ceiling.off, -1, 'the field ceiling does not move with the mechanism');
  check(ceiling.on > 0, true, false, '...and the read found a real number');

  // ═══ E — THE FIVE NEW CHAINS FIRE ════════════════════════════════════════
  console.log('\nE — the five new chains, fired through the live dispatch');
  const NEW = [
    { id: 'plateFolding', a: 'chitinshard', b: 'loamiron', out: 'wormsteel', rescues: 'chitinshard' },
    { id: 'risingAsh', a: 'gravemote', b: 'ochre', out: 'temperash', rescues: 'gravemote' },
    { id: 'toothDrawing', a: 'burrowertooth', b: 'duskflint', out: 'truesilver', rescues: 'burrowertooth' },
    { id: 'marrowSetting', a: 'marrowglass', b: 'rootglass', out: 'umberjade', rescues: 'marrowglass' },
    { id: 'deepgraveDraw', a: 'taproot', b: 'starmarl', out: 'truesilver', rescues: 'taproot' },
  ];
  await page.evaluate(async () => {
    const w = window as unknown as Record<string, never>;
    const e = w['__engine'] as unknown as { getState: () => never };
    const s = e.getState() as unknown as { depthRecords: Record<string, number> };
    s.depthRecords['ferrite'] = 300; // opens the far half of the bench
  });
  for (const c of NEW) {
    const r = await page.evaluate(async (ch) => {
      const w = window as unknown as Record<string, never>;
      const e = w['__engine'] as unknown as {
        getState: () => never; dispatch: (a: unknown) => { ok: boolean; data?: unknown };
      };
      const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
      const s = e.getState() as never;
      forge.addMaterial(s, ch.a, 55, 8);
      forge.addMaterial(s, ch.b, 55, 8);
      const heldBefore = forge.materialCount(s, ch.rescues);
      const outBefore = forge.materialCount(s, ch.out);
      const res = e.dispatch({ type: 'transmute', a: ch.a, b: ch.b });
      const d = (res.data ?? {}) as { found?: string | null };
      return {
        found: d.found ?? null,
        ate: heldBefore - forge.materialCount(s, ch.rescues),
        made: forge.materialCount(s, ch.out) - outBefore,
      };
    }, c);
    console.log(`      ${c.id.padEnd(15)} ate ${r.ate} ${c.rescues}, made ${r.made} ${c.out}`);
    check(r.found, c.id, null, `${c.id} fires`);
    check(r.ate > 0, true, false, `...and CONSUMES the orphan it rescues (${c.rescues})`);
    check(r.made > 0, true, false, `...and produces ${c.out}`);
  }

  // ═══ H — THE BOARD ═══════════════════════════════════════════════════════
  console.log('\nH — the shallow board, asked of the live engine');
  const board = await page.evaluate(async () => {
    const w = window as unknown as Record<string, never>;
    const e = w['__engine'] as unknown as { getState: () => never };
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const roll = await import(/* @vite-ignore */ '/src/engine/content/shell1/roll' + '.ts');
    const s = e.getState() as unknown as { materials: { stacks: Record<string, unknown> } };
    // A HOLD A SHALLOW LOAM PLAYER COULD HAVE, built from real drops at every
    // station ABOVE the floor — so the board measured is the one they see.
    s.materials.stacks = {};
    for (const st of roll.loamRoll()) {
      if (st.depth >= 150) continue;
      for (let i = 0; i < 900; i++) {
        const r = mats.rollDrop('loam', st.depth);
        if (r.materialId) forge.addMaterial(s, r.materialId, r.purity ?? 50, 1);
      }
    }
    const refinery = await import(/* @vite-ignore */ '/src/engine/systems/refinery' + '.ts');
    const held = Object.keys(s.materials.stacks).filter((id) => forge.materialCount(s, id) > 0);
    const hits: string[] = [];
    for (let i = 0; i < held.length; i++) {
      for (let j = i + 1; j < held.length; j++) {
        const ch = refinery.findChain(held[i]!, held[j]!);
        if (ch && !hits.includes(ch.id)) hits.push(ch.id);
      }
    }
    return { held: held.length, hits: hits.sort() };
  });
  console.log(`      a shallow hold of ${board.held} materials fires: ${board.hits.join(', ')}`);
  check(board.hits.length >= 8, true, false,
    `at least 8 chains fire from shallow stock (${board.hits.length})`);
  for (const id of ['plateFolding', 'risingAsh', 'toothDrawing', 'marrowSetting']) {
    check(board.hits.includes(id), true, false, `...including ${id}`);
  }
  check(board.hits.includes('deepgraveDraw'), false, true,
    'and NOT the floor chain — taproot does not come up shallow');

  // ═══ F + G — THE BENCH ITSELF ════════════════════════════════════════════
  console.log('\nF/G — the panel a player uses');
  /**
   * FORGET WHAT SECTION E FOUND. E fired all five through dispatch, so the
   * Codex knows them and the reading correctly comes back `known` — which
   * NAMES the output, by design ("no reason to make a player re-derive their
   * own Codex"). The first cut of this driver read that as a LAW 3 breach. It
   * was the driver testing a player who had already done the work.
   */
  await page.evaluate(() => {
    const w = window as unknown as Record<string, never>;
    const e = w['__engine'] as unknown as { getState: () => never };
    (e.getState() as unknown as { refinery: { found: string[] } }).refinery.found = [];
  });
  await tab(page, 'refinery');
  await page.waitForTimeout(900);
  await dismiss(page);

  const pick = async (slot: 'A' | 'B', name: string): Promise<void> => {
    await dismiss(page);
    await page.locator(`[aria-label="Refinery slot ${slot}"]`).first().click();
    await page.waitForTimeout(300);
    await page.locator(`[role="option"]:has-text("${name}")`).first().click();
    await page.waitForTimeout(400);
  };
  const reading = async (): Promise<{ read: string; line: string }> => ({
    read: (await page.locator('[data-testid="bench-reading"]').first().getAttribute('data-read')) ?? 'none',
    line: (await page.locator('[data-testid="bench-reading"]').first().innerText()).replace(/\s+/g, ' ').trim(),
  });

  // A LIVE PAIR: burrowertooth + duskflint, which is `toothDrawing`.
  await pick('A', "Burrower's Tooth");
  await pick('B', 'Duskflint');
  const live = await reading();
  console.log(`      live pair  -> [${live.read}] ${live.line}`);
  check(live.read, 'reacts', 'inert', 'the bench NAMES a live pair before anything is spent');
  check(/have something to make together/.test(live.line), true, false,
    '...in the pair\'s voice, not two solo scents');
  await page.screenshot({ path: `${OUT}/a84-bench-live.png` });

  // A DEAD PAIR: two stones with nothing in common.
  await pick('B', 'Bonechalk');
  const dead = await reading();
  console.log(`      dead pair  -> [${dead.read}] ${dead.line}`);
  check(dead.read, 'inert', 'reacts', 'and refuses to promise anything about a dead pair');
  check(/nothing to say to each other/.test(dead.line), true, false, '...saying so plainly');
  await page.screenshot({ path: `${OUT}/a84-bench-dead.png` });

  // FIRE IT, through the button.
  await pick('B', 'Duskflint');
  const before = await page.evaluate(async () => {
    const w = window as unknown as Record<string, never>;
    const e = w['__engine'] as unknown as { getState: () => never };
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    return forge.materialCount(e.getState() as never, 'truesilver') as number;
  });
  await page.getByRole('button', { name: /Run it/ }).first().click();
  await page.waitForTimeout(700);
  const after = await page.evaluate(async () => {
    const w = window as unknown as Record<string, never>;
    const e = w['__engine'] as unknown as { getState: () => never };
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    return forge.materialCount(e.getState() as never, 'truesilver') as number;
  });
  console.log(`      truesilver ${before} -> ${after}`);
  check(after > before, true, false, 'a chain FIRES at the bench, from the button');
  // DISCOVERY SURVIVES AS "I FOUND WHAT IT MAKES" — the panel names the output
  // only after the pour, never before.
  const result = (await page.locator('.text-center.text-\\[11px\\]').first().innerText().catch(() => ''))
    .replace(/\s+/g, ' ').trim();
  console.log(`      it said: "${result}"`);
  check(/Truesilver/.test(result), true, false, '...and only THEN names what it made');
  check(/Truesilver/.test(live.line), false, true,
    'the reading before the pour never named it (LAW 3, pillar 5)');
  // AND NOW IT DOES. Discovery survives as "I found what it makes": the Codex
  // is written by pouring, and only afterwards does the bench say the name.
  const known = await reading();
  console.log(`      after the pour -> [${known.read}] ${known.line}`);
  check(known.read, 'known', 'reacts', 'the found chain reads as KNOWN afterwards');
  check(/Truesilver/.test(known.line), true, false, '...and names it, having been found');
  await page.waitForTimeout(4500); // let announcements clear the shot
  await page.screenshot({ path: `${OUT}/a84-bench-fired.png`, fullPage: true });

  // ═══ I — THE FRAME ═══════════════════════════════════════════════════════
  console.log('\nI — 380px');
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(overflow, 0, 1, 'no horizontal overflow at 380px');
  check(errors.length, 0, 1, `no page errors${errors.length ? ` — ${errors.slice(0, 3).join(' | ')}` : ''}`);

  console.log(problems.length === 0 ? '\nALL PASS' : `\nFAILURES (${problems.length}): ${problems.join(', ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
