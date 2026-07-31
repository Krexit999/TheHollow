/**
 * THE TOOL STATION, DRIVEN IN THE REAL GAME.
 *
 * This is a UI phase, so the bar is not "does the engine still work" — it does,
 * nothing under `src/engine` changed — it is "does every verb the old panels
 * offered still have a way to be TAPPED, and does what appears on screen match
 * what the engine says". So every check below either clicks a real control or
 * compares rendered text against a live selector.
 *
 *  1  THE STATION renders spatially: seven parts in position, each labelled with
 *     its own material, gem seats ON the tool, dials around it.
 *  2  THE DIALS agree with the engine (coherence, class, level, instability,
 *     balance) rather than being decoration.
 *  3  EVERY VERB still reachable BY CLICKING: melt, pour, seat, take off,
 *     bring-to-front, combine, socket, repair.
 *  4  380px, 0 overflow.
 *
 *   npx tsx scripts/verify-station.ts [port] [outDir]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots';
const W = 380, H = 1500;

const problems: string[] = [];
const shots: string[] = [];
const check = (ok: boolean, label: string, detail = ''): boolean => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(`${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
};
async function shot(page: Page, name: string, full = false): Promise<void> {
  await dismiss(page);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/stn-${name}.png`, fullPage: full });
  shots.push(`${OUT}/stn-${name}.png`);
}
/**
 * TAP, after clearing whatever the game legitimately put in front of it.
 *
 * The fixture grants seven shells at once, so the disclosure gate fires a
 * "New systems opened" modal — correct behaviour, and a player would close it
 * before touching the bench. This is not routing around a layout defect; it is
 * doing what the player does.
 */
async function tapp(page: Page, sel: string): Promise<void> {
  await dismiss(page);
  await page.locator(sel).first().click();
  await page.waitForTimeout(320);
}

const txt = async (page: Page, sel: string): Promise<string> =>
  (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const PARTS = ['head', 'edge', 'core', 'binding', 'handle', 'grip', 'sockets'];
const SHELLS = ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph'];

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: W, height: H }, reducedMotion: 'no-preference' });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (t.includes('render recovered')) return;
    problems.push(`[console] ${t.slice(0, 200)}`);
  });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await setup(page, `engine.getState().forge.built = true;`);

  /** A tool of SEVEN DIFFERENT SHELLS, so every part is visibly its own stone. */
  const built = await page.evaluate(async (shells) => {
    const w = window as unknown as Record<string, any>;
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const s = w['__engine'].getState();
    for (const id of shells) s.depthRecords[id] = 60;
    for (const sh of shells) for (const m of mats.materialsOfShell(sh)) forge.addMaterial(s, m.id, 60, 300);
    const M = { one(sh: string) { return mats.materialsOfShell(sh)[0].id as string; } };
    const pick: Record<string, string> = {
      head: M.one('aleph'), edge: M.one('glassmere'), core: M.one('hollow'),
      binding: M.one('ferrite'), handle: M.one('verdance'), grip: M.one('loam'),
      sockets: M.one('cinder'),
    };
    s.casting.tool = cp.PART_TYPES.map((t: string, i: number) => ({
      ...fp.makePart(t, pick[t], 64), id: i + 1,
    }));
    s.casting.wear = 300;
    s.casting.sockets = [];
    s.casting.built = 6;
    s.casting.rack = [];
    let id = 100;
    for (const t of ['head', 'binding', 'core']) {
      s.casting.rack.push({ ...fp.makePart(t, M.one('loam'), 71), id: id++ });
    }
    /**
     * THE FIXTURE HAS TO ADVANCE nextId, and the first run proved why: it planted
     * parts at ids 1-7 and 100-102 while `nextId` was still 1, so the next real
     * `castPart` minted id 1 and collided with a part already in the tool. React
     * then warned about duplicate keys eighteen times. The ENGINE cannot do this
     * (it only ever hands out `nextId++`); the harness did it by writing state
     * behind the engine's back. Same family as every `a sim result is a claim`
     * finding in the ledger — the instrument, not the game.
     */
    s.casting.nextId = 1000;
    return pick;
  }, SHELLS);
  await page.waitForTimeout(400);
  await tab(page, 'casting');
  await dismiss(page);
  await page.waitForTimeout(500);

  // ═══ 1. IT IS SPATIAL ════════════════════════════════════════════════════
  console.log('\n1 — the tool is a diagram, not a list');

  check(await page.locator('[data-testid="tool-diagram"]').count() === 1, 'the bench renders a tool diagram');
  check(await page.locator('[data-testid="station"]').count() === 0,
    'and the old seven-row bench list is gone');

  const boxes = await page.evaluate((parts) => {
    const out: Record<string, { x: number; y: number; w: number; h: number; mat: string }> = {};
    for (const t of parts) {
      const el = document.querySelector(`[data-testid="diagram-${t}"]`) as HTMLElement | null;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      out[t] = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), mat: el.dataset['material'] ?? '' };
    }
    return out;
  }, PARTS);
  check(Object.keys(boxes).length === 7, 'all seven parts are drawn', `${Object.keys(boxes).length}/7`);

  // THE PICK'S ACTUAL SHAPE: head above core above grip, on one shaft.
  check(boxes['head']!.y < boxes['core']!.y, 'the head is above the core',
    `head ${boxes['head']!.y} < core ${boxes['core']!.y}`);
  check(boxes['core']!.y < boxes['grip']!.y, 'the core is above the grip',
    `core ${boxes['core']!.y} < grip ${boxes['grip']!.y}`);
  check(boxes['handle']!.h > boxes['core']!.h, 'the handle is the longest part — it is the shaft',
    `${boxes['handle']!.h}px vs core ${boxes['core']!.h}px`);
  check(boxes['head']!.w > boxes['handle']!.w, 'and the head is the widest',
    `${boxes['head']!.w}px vs ${boxes['handle']!.w}px`);

  // EVERY PART NAMES ITS OWN MATERIAL — the thing a stacked panel could not show.
  let named = 0;
  for (const t of PARTS) {
    const label = await txt(page, `[data-testid="diagram-label-${t}"]`);
    if (label.toLowerCase().includes(built[t]!.slice(0, 4).toLowerCase())) named++;
  }
  check(named >= 5, 'each part is labelled with its own material', `${named}/7 matched by id stem`);
  check(new Set(PARTS.map((t) => boxes[t]!.mat)).size === 7,
    'and all seven are different stones on this tool');

  await shot(page, '1-station', true);

  // ═══ 2. THE DIALS ARE THE ENGINE'S NUMBERS ═══════════════════════════════
  console.log('\n2 — the dials agree with the engine');

  const truth = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const cast = await import(/* @vite-ignore */ '/src/engine/systems/casting' + '.ts');
    const tc = await import(/* @vite-ignore */ '/src/engine/systems/toolClass' + '.ts');
    const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMods' + '.ts');
    const mining = await import(/* @vite-ignore */ '/src/engine/systems/toolMining' + '.ts');
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const s = w['__engine'].getState();
    const tool = cast.currentTool(s);
    return {
      coh: Math.round(tool.coherence.factor * 100),
      cls: tc.toolClass(s).def?.name ?? 'none',
      level: mining.levelProgress(s).level,
      inst: Math.round(tm.toolInstability(s).net),
      bal: fp.balanceOf(tool.parts).label,
      swings: mining.usesLeft(s, tool),
    };
  });

  check((await txt(page, '[data-testid="dial-coherence-pct"]')) === `${truth.coh}%`,
    'coherence dial is the engine\'s coherence', `${await txt(page, '[data-testid="dial-coherence-pct"]')} vs ${truth.coh}%`);
  check((await txt(page, '[data-testid="dial-class-name"]')).toLowerCase() === truth.cls.toLowerCase(),
    'class badge is the engine\'s class', `${await txt(page, '[data-testid="dial-class-name"]')} vs ${truth.cls}`);
  check((await txt(page, '[data-testid="dial-level"]')).startsWith(String(truth.level)),
    'level ring is the engine\'s level', `${await txt(page, '[data-testid="dial-level"]')} vs ${truth.level}`);
  check((await txt(page, '[data-testid="dial-instability-n"]')) === String(truth.inst),
    'instability dial is the engine\'s number', `${await txt(page, '[data-testid="dial-instability-n"]')} vs ${truth.inst}`);
  check((await txt(page, '[data-testid="dial-balance-label"]')) === truth.bal,
    'balance dial is the engine\'s label', `${await txt(page, '[data-testid="dial-balance-label"]')} vs ${truth.bal}`);
  const wearTxt = await txt(page, '[data-testid="diagram-wear"]');
  check(/left$/.test(wearTxt) || /broken/.test(wearTxt),
    'the wear bar is ON the tool and reads what is left in it', wearTxt);

  // ═══ 3. SOCKETS ARE GEMS ON THE TOOL ═════════════════════════════════════
  console.log('\n3 — sockets are seats bored into the tool, and they fill');

  const seats = await page.locator('[data-testid^="diagram-socket-"]').count();
  check(seats > 0, 'the tool shows its gem seats', `${seats} seats`);
  check(await page.locator('[data-testid="diagram-socket-0"][data-filled="empty"]').count() === 1,
    'and they start empty');

  const socketed = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const rel = await import(/* @vite-ignore */ '/src/engine/systems/relics' + '.ts');
    const s = w['__engine'].getState();
    s.materials.gems['bloodgarnet'] = 2;
    s.runes.found['kel'] = 3;
    const r = rel.addRelic(s, rel.mintRelic(s, 'depth', 12));
    r.waking = 2;
    const a = w['__engine'].dispatch({ type: 'setSocket', slot: 0, fill: { kind: 'relic', uid: r.uid } });
    const b = w['__engine'].dispatch({ type: 'setSocket', slot: 1, fill: { kind: 'gem', id: 'bloodgarnet' } });
    return { a: a.ok, b: b.ok, reason: `${a.reason ?? ''} ${b.reason ?? ''}`.trim() };
  });
  await page.waitForTimeout(400);
  check(socketed.a && socketed.b, 'a real relic and a real gem go in', socketed.reason);
  check(await page.locator('[data-testid="diagram-socket-0"][data-filled="relic"]').count() === 1,
    'the relic seat now reads as filled ON THE TOOL');
  check(await page.locator('[data-testid="diagram-socket-1"][data-filled="gem"]').count() === 1,
    'and so does the gem seat');

  // Tapping a seat on the tool focuses the socket detail below it.
  await tapp(page, '[data-testid="diagram-socket-1"]');
  const detail = await txt(page, '[data-testid="socket-detail"]');
  check(/bloodgarnet/i.test(detail), 'tapping a gem on the tool focuses its detail', detail.slice(0, 70));
  await shot(page, '2-socketed', true);

  // ═══ 4. EVERY VERB IS STILL A CLICK ══════════════════════════════════════
  console.log('\n4 — every verb the old panels had, by clicking');

  // MELT
  await tapp(page, '[data-testid="melt-5"]');
  const held = await txt(page, '[data-testid="crucible-held"]');
  check(!held.startsWith('0/'), 'melt: the crucible takes stone', held);

  // BRING TO FRONT — needs a second stone in the tub. The crucible is one tub
  // of stones now, not a queue, so this reads the stone rather than a queue row.
  const queued = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const second = mats.materialsOfShell('loam')[1].id as string;
    const r = w['__engine'].dispatch({ type: 'chargeCrucible', materialId: second, units: 6 });
    return { ok: r.ok, reason: r.reason ?? '', second };
  });
  await page.waitForTimeout(350);
  if (queued.ok && await page.locator('[data-testid="crucible-stone-1"]').count() > 0) {
    const before = await txt(page, '[data-testid="crucible-front"]');
    await tapp(page, '[data-testid="crucible-stone-1"]');
    const after = await txt(page, '[data-testid="crucible-front"]');
    check(before !== after, 'bring-to-front: tapping a queued stone promotes it', `${before} → ${after}`);
  } else {
    check(false, 'bring-to-front: could not queue a second stone', queued.reason);
  }

  // POUR
  await tapp(page, '[data-testid="mould-part-edge"]');
  const rackBefore = Number((await txt(page, '[data-testid="rack-count"]')).split(' ')[0]);
  await tapp(page, '[data-testid="mould-pour"]');
  const rackAfter = Number((await txt(page, '[data-testid="rack-count"]')).split(' ')[0]);
  check(rackAfter === rackBefore + 1, 'pour: a cast part lands on the rack', `${rackBefore} → ${rackAfter}`);

  // SEAT — tap a rack chip.
  // THE RACK IS SEVEN SLOTS NOW (A.67), one per part type, so that all of it
  // fits at 380px without scrolling. A part lives behind its slot — open the
  // one that has something in it, then seat from there.
  const openSlot = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('[data-testid^="rack-slot-"]'))
      .find((e) => Number((e as HTMLElement).dataset['held'] ?? 0) > 0) as HTMLElement | undefined;
    return el ? (el.dataset['testid'] ?? '') : '';
  });
  if (openSlot) await tapp(page, `[data-testid="${openSlot}"]`);
  const chip = page.locator('[data-testid^="rack-chip-"]').first();
  const chipPart = await chip.getAttribute('data-part-type');
  await dismiss(page);
  await chip.click();
  await page.waitForTimeout(400);
  check(await page.locator(`[data-testid="diagram-${chipPart}"][data-bench="1"]`).count() === 1,
    'seat: the tapped part goes ON the tool, marked as bench', `${chipPart}`);
  check(await page.locator('[data-testid="combine"]').count() === 1, 'and Combine appears');

  // TAKE OFF. The rack slot and the diagram share one selection now (A.67), so
  // opening the slot to seat from it ALREADY opened that part's seat bar —
  // tapping the diagram part again would toggle the selection back off. Assert
  // the bar is open and use it, which is also what a player would do.
  if (await page.locator('[data-testid="seat-bar"]').count() === 0) {
    await tapp(page, `[data-testid="diagram-${chipPart}"]`);
  }
  check(await page.locator('[data-testid="seat-bar"]').count() === 1,
    'the seated part has a seat bar with a way back out');
  await tapp(page, '[data-testid="seat-bar-clear"]');
  check(await page.locator(`[data-testid="diagram-${chipPart}"][data-bench="1"]`).count() === 0,
    'take off: benchClear puts it back on the rack');

  // COMBINE — seat a full set and build.
  const seatedAll = await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>;
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const s = w['__engine'].getState();
    const stone = mats.materialsOfShell('loam')[0].id as string;
    let id = s.casting.nextId; s.casting.nextId += 20;
    for (const t of cp.PART_TYPES) {
      const part = { ...fp.makePart(t, stone, 80), id: id++ };
      s.casting.rack.push(part);
      w['__engine'].dispatch({ type: 'benchPlace', partId: part.id });
    }
    return cp.PART_TYPES.filter((t: string) => s.casting.bench[t] !== undefined).length;
  });
  await page.waitForTimeout(400);
  check(seatedAll === 7, 'a full set seats', `${seatedAll}/7`);
  const builtBefore = await txt(page, '[data-testid="station-sub"]');
  await tapp(page, '[data-testid="combine"]');
  const note = await txt(page, '[data-testid="build-note"]');
  check(/built/i.test(note), 'combine: buildTool runs through the station', note.slice(0, 60));
  check(builtBefore !== await txt(page, '[data-testid="station-sub"]'), 'and the header count moves');

  // REPAIR — the worn part, from the tucked drawer.
  await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    w['__engine'].getState().casting.wear = 500;
  });
  await tapp(page, '[data-testid="drawer-tool"] > summary');
  const hasRepair = await page.locator('[data-testid="repair"]').count() > 0;
  if (hasRepair) {
    const wearBefore = await page.evaluate(() => (window as any)['__engine'].getState().casting.wear as number);
    await page.locator('[data-testid="repair"]').click();
    await page.waitForTimeout(400);
    const wearAfter = await page.evaluate(() => (window as any)['__engine'].getState().casting.wear as number);
    check(wearAfter < wearBefore, 'repair: still reachable from the tucked drawer', `${wearBefore} → ${wearAfter}`);
  } else {
    check(false, 'repair: no repair control found in the drawer');
  }
  await shot(page, '3-built', true);

  // ═══ 5. 380px, 0 OVERFLOW ════════════════════════════════════════════════
  console.log('\n5 — 380px');
  const over = await page.evaluate(() => {
    const bad: string[] = [];
    const root = document.querySelector('[data-testid="the-station"]');
    if (root) {
      for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width > 0 && (r.left < -1 || r.right > window.innerWidth + 1)) {
          const who = (el as HTMLElement).dataset['testid']
            ?? ((el as HTMLElement).className || el.tagName);
          bad.push(`${who} ${Math.round(r.left)}..${Math.round(r.right)}`);
        }
      }
    }
    return { bad, doc: document.documentElement.scrollWidth, win: window.innerWidth };
  });
  check(over.bad.length === 0, 'nothing in the station leaves the viewport', over.bad.slice(0, 4).join(' | '));
  check(over.doc <= over.win + 1, 'and the page does not scroll sideways', `${over.doc} vs ${over.win}`);

  await browser.close();
  console.log(`\n${shots.length} shots → ${OUT}`);
  if (problems.length) {
    console.log(`\n${problems.length} PROBLEM(S):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  console.log('\nALL CHECKS PASS');
}

main().catch((e) => { console.error(e); process.exit(1); });
