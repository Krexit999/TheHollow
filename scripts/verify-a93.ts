/**
 * A.93 DRIVEN IN THE REAL GAME — four machines, four first builds.
 *
 *   A  §23's opening, read FIRST on a reset state
 *   B  each machine raised from CAST PARTS (three at a wreck, one at the Crusher)
 *   C  THE FACE LIT IN GLASSMERE, and lit WITHOUT a Prism — the collision, driven
 *   D  intensity allocated across bands, the six rules responding, and a
 *      machine going UNLIT because a band went dark
 *   E  a pattern recorded and re-poured AT IDENTICAL COST
 *   F  an ore split into components, with the split-only list
 *   G  grit washed to concentrate and silt, and the REFINERY eating it
 *   H  tier I vs II vs III each doing something DIFFERENT, per machine
 *   I  the clone check green, and RED-TESTED in the live module
 *   J  dpsMax unmoved at equal depth with all of it live
 *   K  380px, 0 overflow, 0 page errors
 *
 * NO NAMED FUNCTION MAY BE DECLARED INSIDE A `page.evaluate` BODY — tsx
 * compiles this with esbuild's `keepNames`, which rewrites `const f = () => {}`
 * into `__name(...)`, and `__name` does not exist in the page. It has cost three
 * runs across A.90–A.92. Every block inlines its repetition or builds helpers
 * with `new Function` from a string esbuild cannot touch.
 *
 * A WRECK IS FOUND BY BEING WALKED INTO, not by the depth record (A.92's first
 * run lost five checks to that). `markReached` is called per SHELL below.
 *
 *   npx tsx scripts/verify-a93.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots-a93';
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

const PLANT_SETUP = `
  const s = engine.getState();
  s.shell.breachCount = 6;
  for (const id of ['loam','ferrite','verdance','glassmere','cinder','hollow','aleph']) {
    s.depthRecords[id] = 999;
  }
  s.maxDepthRecord = 999;
  s.kiln.built = true;
  s.kiln.heat = 40;
  s.forge.built = true;
  s.plant = s.plant || {};
  s.plant.surge = 99999;
  s.plant.tiers = s.plant.tiers || {};
  s.plant.tiers['crusher'] = 1;
  s.casting.rack = [];
  for (let i = 0; i < 90; i++) {
    s.casting.rack.push({ id: 30000 + i, type: 'head', materialId: 'marl', purity: 50 });
  }
  s.casting.nextId = 31000;
  s.gear = s.gear || {}; s.gear.worn = {}; s.gear.owned = [];
`;

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

  // ═══ A — §23, READ FIRST ═════════════════════════════════════════════════
  console.log('\n== A — the opening, on a state nothing has touched =============');
  await tab(page, 'dig');
  await dismiss(page);
  await page.waitForTimeout(400);
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
    'A — §23: 36 cells, depth 0, 2.97 dust/sec');
  await page.screenshot({ path: `${OUT}/a93-opening.png`, fullPage: true }).catch(() => {});

  // ═══ C — THE FACE, LIT, WITH NO PRISM ════════════════════════════════════
  // Read BEFORE anything is built: the collision is only visible on a bare save.
  console.log('\n== C — the face lit in Glassmere, WITHOUT a Prism ==============');
  const bare = await page.evaluate(async () => {
    const refr = await import(/* @vite-ignore */ '/src/engine/systems/refraction' + '.ts');
    const prism = await import(/* @vite-ignore */ '/src/engine/systems/prism' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { shell: { current: string } };
    s.shell.current = 'glassmere';
    const m = new modsMod.ModifierCache(); m.invalidate();
    const path = refr.traceBeam(s, m) as { cell: number; color: number }[];
    return {
      built: prism.prismBuilt(s) as boolean,
      lit: path.length,
      colours: [...new Set(path.map((b) => b.color))],
      split: refr.splitUnlocked(s) as boolean,
    };
  });
  check([bare.built, bare.lit > 0, bare.colours], [false, true, [0]], [true, false, [1]],
    `C — no Prism, and the beam lights ${bare.lit} cells anyway, all WHITE`);
  console.log('        §13 says the Prism "blocks MINING IN GLASSMERE". It does not, and');
  console.log('        it cannot be made to without taking a shipped shell off every save.');

  // ═══ B — THE FOUR MACHINES ═══════════════════════════════════════════════
  console.log('\n== B — each machine raised from cast parts =====================');
  await setup(page, PLANT_SETUP);
  const raised = await page.evaluate(async () => {
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const prism = await import(/* @vite-ignore */ '/src/engine/systems/prism' + '.ts');
    const pat = await import(/* @vite-ignore */ '/src/engine/systems/pattern' + '.ts');
    const cen = await import(/* @vite-ignore */ '/src/engine/systems/centrifuge' + '.ts');
    const plant = await import(/* @vite-ignore */ '/src/engine/systems/plant' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    const st0 = e.getState() as unknown as { shell: { current: string } };
    for (const id of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      st0.shell.current = id;
      roll.markReached(e.getState(), 999, 50);
    }
    st0.shell.current = 'glassmere';
    const before = (e.getState() as unknown as { casting: { rack: unknown[] } }).casting.rack.length;
    const found = {
      prism: prism.prismFound(e.getState()),
      pattern: pat.patternFound(e.getState()),
      centrifuge: cen.centrifugeFound(e.getState()),
    };
    for (const a of ['buildPrism', 'buildPatternBench', 'buildCentrifuge', 'buildWasher']) {
      e.dispatch({ type: a });
    }
    const s = e.getState() as unknown as { casting: { rack: unknown[] }; plant: { builtOf: Record<string, string[]> } };
    return {
      found,
      tiers: ['prism', 'pattern', 'centrifuge', 'washer']
        .map((id) => plant.tierOf(e.getState(), id) as number),
      spent: before - s.casting.rack.length,
      builtOf: ['prism', 'pattern', 'centrifuge', 'washer'].map((id) => (s.plant.builtOf[id] ?? []).length),
      stations: {
        prism: prism.prismStation(),
        pattern: pat.patternStation(),
        centrifuge: cen.centrifugeStation(),
      },
    };
  });
  check(Object.values(raised.found), [true, true, true], [false, false, false],
    'B — three wrecks found by a player who walked every shell');
  check(raised.tiers, [1, 1, 1, 1], [0, 0, 0, 0],
    'B — four machines standing at tier I (the Washer at the Crusher, not a wreck)');
  check(raised.spent, 8, 0, 'B — eight cast parts spent, two each, off the rack');
  check(raised.builtOf, [2, 2, 2, 2], [0, 0, 0, 0],
    'B — §11.2: each remembers the two parts it was cast from');
  console.log(`        prism      ${JSON.stringify(raised.stations.prism)}`);
  console.log(`        pattern    ${JSON.stringify(raised.stations.pattern)}`);
  console.log(`        centrifuge ${JSON.stringify(raised.stations.centrifuge)}  (authored A.93)`);

  // ═══ D — INTENSITY, AND THE SIX RULES ════════════════════════════════════
  console.log('\n== D — intensity allocated, and a band going dark ==============');
  const spectrum = await page.evaluate(async () => {
    const prism = await import(/* @vite-ignore */ '/src/engine/systems/prism' + '.ts');
    const refr = await import(/* @vite-ignore */ '/src/engine/systems/refraction' + '.ts');
    const cond = await import(/* @vite-ignore */ '/src/engine/systems/condition' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    const s = e.getState() as unknown as {
      face: { w: number; h: number }; plant: { tiers: Record<string, number>; condition: Record<string, unknown> };
      refraction: { pathDirty: boolean };
    };
    s.face.w = 8; s.face.h = 8;
    // Everything on VIOLET: one band carrying, five dark.
    for (let b = 0; b < 6; b++) e.dispatch({ type: 'allocate', band: b, points: 0 });
    e.dispatch({ type: 'allocate', band: 5, points: 1 });
    s.refraction.pathDirty = true;
    const m = new modsMod.ModifierCache(); m.invalidate();
    const path = refr.traceBeam(e.getState(), m) as { color: number }[];
    const lit = [...(cond.litBands(e.getState()) as Set<number>)];

    // A machine in a DARK band, and the rule the A.90 ledger said could not fire.
    s.plant.tiers['sieve'] = 2;
    cond.setMachineBand(e.getState(), 'sieve', 1);
    s.plant.condition = {};
    cond.tickCondition(e.getState(), m, 600);
    const bit = cond.biting(e.getState(), 'sieve', 'unlit') as boolean;
    const speed = cond.machineSpeed(e.getState(), 'sieve') as number;
    // ...and moving it into the light clears it.
    cond.setMachineBand(e.getState(), 'sieve', 5);
    cond.tickCondition(e.getState(), m, 600);
    const cleared = !(cond.biting(e.getState(), 'sieve', 'unlit') as boolean);
    return {
      carried: prism.carriedBands(e.getState()) as number[],
      colours: [...new Set(path.map((b) => b.color))],
      lit, bit, speed, cleared,
      split: refr.splitUnlocked(e.getState()) as boolean,
      rules: (prism.spectrum(e.getState()) as { rule: string }[]).length,
    };
  });
  check([spectrum.carried, spectrum.colours, spectrum.lit], [[5], [5], [5]], [[], [0], [0, 1]],
    'D — one point on Violet: the beam carries Violet and nothing else is lit');
  check(spectrum.rules, 6, 0, 'D — six wavelengths, six rules, read off refraction.ts');
  check([spectrum.bit, spectrum.speed, spectrum.cleared], [true, 0.5, true], [false, 1, false],
    `D — A.90's UNLIT rule FIRES at half speed (split=${spectrum.split}), and clears in the light`);

  // ═══ E — A PATTERN, AT IDENTICAL COST ════════════════════════════════════
  console.log('\n== E — a pattern recorded and re-poured, at identical cost =====');
  const pattern = await page.evaluate(async () => {
    const casting = await import(/* @vite-ignore */ '/src/engine/systems/casting' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const pat = await import(/* @vite-ignore */ '/src/engine/systems/pattern' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    const c = { emit() {}, dirty() {} };
    const s = e.getState() as unknown as {
      casting: { rack: { id: number; type: string }[]; bench: Record<string, number>;
        crucible: { queue: { molten: number; solid: number }[] } };
    };
    s.casting.crucible.queue.length = 0;
    forge.addMaterial(e.getState(), 'marl', 90, 80);
    casting.chargeCrucible(e.getState(), c, 'marl', 40);
    const q = s.casting.crucible.queue[0]!; q.molten += q.solid; q.solid = 0;

    // BY HAND: three casts, and what the tub lost.
    const handBefore = q.molten;
    for (const [type, shape] of [['head', 'wide'], ['core', 'banded'], ['grip', 'knurled']] as [string, string][]) {
      casting.castPart(e.getState(), c, type, shape);
      s.casting.bench[type] = s.casting.rack[s.casting.rack.length - 1]!.id;
    }
    const handSpent = handBefore - s.casting.crucible.queue[0]!.molten;
    e.dispatch({ type: 'recordPattern', name: 'the same again' });
    const held = pat.patternsHeld(e.getState()) as { id: number; cost: { melt: number } }[];

    // OFF THE PATTERN: the same three, on a re-filled tub.
    const benchBefore = s.casting.crucible.queue[0]!.molten;
    const rackBefore = s.casting.rack.length;
    const r = e.dispatch({ type: 'repour', patternId: held[0]!.id }) as { ok: boolean; reason?: string };
    const benchSpent = benchBefore - (s.casting.crucible.queue[0]?.molten ?? 0);
    return {
      ok: r.ok, reason: r.reason ?? '',
      handSpent, benchSpent,
      quoted: held[0]!.cost.melt,
      parts: s.casting.rack.length - rackBefore,
    };
  });
  check([pattern.ok, pattern.parts], [true, 3], [false, 0], 'E — a re-pour made the same three parts');
  check(pattern.benchSpent, pattern.handSpent, -1,
    `E — AND IT COST THE SAME: ${pattern.handSpent} melt by hand, ${pattern.benchSpent} off the pattern`);
  check(pattern.quoted, pattern.handSpent, -1, 'E — ...which is exactly the price the panel quoted');

  // ═══ F — AN ORE SPLIT ════════════════════════════════════════════════════
  console.log('\n== F — an ore split into components ============================');
  const split = await page.evaluate(async () => {
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const splits = await import(/* @vite-ignore */ '/src/engine/content/splits' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    const s = e.getState() as unknown as { plant: { tiers: Record<string, number> } };
    s.plant.tiers['centrifuge'] = 2;                 // every component
    forge.addMaterial(e.getState(), 'lodestone', 88, 6);
    const def = splits.SPLIT_BY_ORE.get('lodestone') as { units: number; out: string[] };
    const before = forge.materialCount(e.getState(), 'lodestone') as number;
    const r = e.dispatch({ type: 'spin', materialId: 'lodestone', band: 'fine' }) as { ok: boolean; reason?: string };
    return {
      ok: r.ok, reason: r.reason ?? '',
      spent: before - (forge.materialCount(e.getState(), 'lodestone') as number),
      got: def.out.map((id) => forge.materialCount(e.getState(), id) as number),
      out: def.out,
      only: splits.splitOnly() as string[],
    };
  });
  check([split.ok, split.spent, split.got], [true, 3, [1, 1]], [false, 0, [0, 0]],
    `F — three lodestone in, ${split.out.join(' + ')} out`);
  check(split.only.length, 11, 0,
    `F — the split-only list: ${split.only.join(' ')}`);

  // ═══ G — GRIT WASHED, AND THE REFINERY EATING IT ═════════════════════════
  console.log('\n== G — grit washed to concentrate and silt =====================');
  const washed = await page.evaluate(async () => {
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const washer = await import(/* @vite-ignore */ '/src/engine/systems/washer' + '.ts');
    const refinery = await import(/* @vite-ignore */ '/src/engine/systems/refinery' + '.ts');
    const res = await import(/* @vite-ignore */ '/src/engine/resources' + '.ts');
    const dec = await import(/* @vite-ignore */ '/src/engine/decimal' + '.ts');
    const shells = await import(/* @vite-ignore */ '/src/engine/shells' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    const c = { emit() {}, dirty() {} };
    const sol = shells.convCurrencyId(e.getState()) as string;
    res.addCurrency(e.getState(), sol, dec.D(9999));
    forge.addMaterial(e.getState(), 'refineslag', 50, 20);
    const before = res.getCurrency(e.getState(), sol).toNumber() as number;
    const r = e.dispatch({ type: 'wash', materialId: 'refineslag', band: 'fair' }) as
      { ok: boolean; reason?: string; data?: { band: string; solvent: string } };
    const conc = forge.materialCount(e.getState(), washer.CONCENTRATE) as number;
    const silt = forge.materialCount(e.getState(), washer.SILT) as number;
    // ...and the Refinery eats the concentrate.
    for (let i = 0; i < 3; i++) e.dispatch({ type: 'wash', materialId: 'refineslag', band: 'fair' });
    const rr = refinery.refine(e.getState(), c, washer.CONCENTRATE, 'good') as { ok: boolean; reason?: string };
    const st = e.getState() as unknown as { materials: { stacks: Record<string, Record<string, unknown>> } };
    return {
      ok: r.ok, reason: r.reason ?? '',
      solvent: r.data?.solvent ?? '', into: r.data?.band ?? '',
      paid: before - (res.getCurrency(e.getState(), sol).toNumber() as number),
      conc, silt,
      refined: rr.ok, refinedReason: rr.reason ?? '',
      bands: Object.keys(st.materials.stacks[washer.CONCENTRATE] ?? {}),
    };
  });
  check([washed.ok, washed.into, washed.conc, washed.silt], [true, 'good', 1, 2], [false, 'fair', 0, 0],
    `G — four Fair grit -> one Good concentrate + two silt, for ${washed.paid} ${washed.solvent}`);
  check([washed.refined, washed.bands.includes('fine')], [true, true], [false, false],
    'G — AND THE REFINERY EATS IT: the concentrate refines to Fine');

  // ═══ H — TIER I vs II vs III ═════════════════════════════════════════════
  console.log('\n== H — every tier a different sentence, not a bigger number ====');
  const tiers = await page.evaluate(async () => {
    const prism = await import(/* @vite-ignore */ '/src/engine/systems/prism' + '.ts');
    const pat = await import(/* @vite-ignore */ '/src/engine/systems/pattern' + '.ts');
    const cen = await import(/* @vite-ignore */ '/src/engine/systems/centrifuge' + '.ts');
    const washer = await import(/* @vite-ignore */ '/src/engine/systems/washer' + '.ts');
    const splits = await import(/* @vite-ignore */ '/src/engine/content/splits' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const e = w['__engine']!;
    const s = e.getState() as unknown as { plant: { tiers: Record<string, number> } };
    const rows: Record<string, unknown[]> = {};
    rows['prism'] = [1, 2, 3].map((t) => {
      s.plant.tiers['prism'] = t;
      return [prism.weighted(e.getState()), prism.reachesWhite(e.getState())];
    });
    rows['pattern'] = [1, 2, 3].map((t) => {
      s.plant.tiers['pattern'] = t;
      return [pat.chargesItself(e.getState()), pat.patternSlots(e.getState()) === Infinity];
    });
    const ore = (splits.SPLITS as { from: string }[])[0]!.from;
    rows['centrifuge'] = [1, 2, 3].map((t) => {
      s.plant.tiers['centrifuge'] = t;
      return [(cen.componentsOf(e.getState(), ore) as string[]).length, cen.takesWorked(e.getState())];
    });
    rows['washer'] = [1, 2, 3].map((t) => {
      s.plant.tiers['washer'] = t;
      return [(washer.washable(e.getState()) as string[]).length, washer.anySolvent(e.getState())];
    });
    return rows;
  });
  for (const [id, row] of Object.entries(tiers)) {
    const distinct = new Set(row.map((x) => JSON.stringify(x))).size;
    check(distinct, 3, 1, `H — ${id}: I/II/III are three different things  ${JSON.stringify(row)}`);
  }

  // ═══ I — THE CLONE CHECK ═════════════════════════════════════════════════
  /**
   * ON ITS OWN PAGE, and the reason is a real harness finding rather than
   * tidiness. The first run died with `Unknown material: __twin__` from inside
   * `derivePart`, and the stack named the culprit: `materials.ts?t=1785844305594`.
   * Vite had HMR-invalidated the module between the driver's earlier dynamic
   * import and this one, so the registry this block wrote to was NOT the
   * registry `forgeParts` reads — two live copies of `MATERIALS`, and a
   * red-test that registered into the wrong one.
   *
   * A fresh page has one copy of everything. This block needs no game state
   * (it is a pure registry sweep), so giving it its own page is both correct
   * and the smallest possible fix.
   */
  console.log('\n== I — the clone check, green and RED-TESTED ===================');
  const clonePage = await browser.newPage({ viewport: { width: W, height: H } });
  await clonePage.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  const clones = await clonePage.evaluate(async () => {
    /**
     * IMPORT THE URL THE APP ACTUALLY LOADED, not the bare path.
     *
     * DIAGNOSED, not guessed: a probe registered a material through
     * `/src/engine/materials.ts` and read `MATERIALS.length` 169 -> 170, while
     * `derivePart` — reached through `/src/engine/systems/forgeParts.ts` — threw
     * `Unknown material`. Vite serves the app's copy under
     * `materials.ts?t=<stamp>` (an HMR-invalidated URL that survives in the
     * module graph), so a bare specifier is a SECOND live registry. Clearing
     * `node_modules/.vite` and restarting the server did not change it.
     *
     * So the specifier is read off the page's own resource list. Everything
     * downstream — the sweep and the red-test — then talks to the registry the
     * game is using, which is the only registry a check about the game means
     * anything against.
     */
    const url = performance.getEntriesByType('resource')
      .map((r) => r.name)
      .filter((n) => n.includes('/src/engine/materials.ts'))
      .sort((a, b) => b.length - a.length)[0] ?? '/src/engine/materials.ts';
    const mats = await import(/* @vite-ignore */ url);
    const traitsUrl = performance.getEntriesByType('resource')
      .map((r) => r.name)
      .filter((n) => n.includes('/src/engine/traits.ts'))
      .sort((a, b) => b.length - a.length)[0] ?? '/src/engine/traits.ts';
    const traits = await import(/* @vite-ignore */ traitsUrl);
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cfp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const washer = await import(/* @vite-ignore */ '/src/engine/systems/washer' + '.ts');
    washer.ensureWashProducts();
    const key = new Function('fp', 'cfp', 'return function (id) { return cfp.TOOL_STATS.map(function (s) { return fp.derivePart(fp.makePart("head", id, 60)).stats[s].toFixed(3); }).join("|"); };')(fp, cfp) as (id: string) => string;
    const seen = new Map<string, string>();
    const found: string[] = [];
    for (const m of mats.MATERIALS as { id: string; name: string; worked?: boolean; source?: string }[]) {
      if (m.worked || m.source === 'combat') continue;
      const k = key(m.id);
      if (seen.has(k)) found.push(`${m.name} = ${seen.get(k)}`);
      else seen.set(k, m.name);
    }
    // RED-TEST: mint a deliberate twin of a split product's SOURCE ore.
    const src = (mats.MATERIALS as { id: string; name: string; shellId: string; rarity: string; palette: unknown; facets: number; shimmer: string }[])
      .find((m) => m.id === 'lodestone')!;
    mats.registerMaterial({ ...src, id: '__twin__', name: 'Twin Lodestone' });
    (traits.MATERIAL_TRAITS as Record<string, unknown>)['__twin__'] = [...(traits.traitsOf('lodestone') as string[])];
    const redSeen = new Map<string, string>();
    const red: string[] = [];
    for (const m of mats.MATERIALS as { id: string; name: string; worked?: boolean; source?: string }[]) {
      if (m.worked || m.source === 'combat') continue;
      const k = key(m.id);
      if (redSeen.has(k)) red.push(`${m.name} = ${redSeen.get(k)}`);
      else redSeen.set(k, m.name);
    }
    return { population: seen.size, found, red: red.length, redSays: red[0] ?? '' };
  });
  check(clones.found, [], ['x'], `I — zero clones across ${clones.population} materials`);
  check(clones.red, 1, 0, `I — RED-TESTED: a deliberate twin IS caught (${clones.redSays})`);
  await clonePage.close();

  // ═══ J — PILLAR 2 ════════════════════════════════════════════════════════
  console.log('\n== J — dpsMax at the SAME depth, with all of it live ===========');
  const ceiling = await page.evaluate(async () => {
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as {
      depth: number; plant: { tiers: Record<string, number>; condition: Record<string, unknown> };
      prism?: unknown; pattern?: unknown;
    };
    s.depth = 48;                                   // THE SAME DEPTH IN BOTH ARMS
    const m = new modsMod.ModifierCache(); m.invalidate();
    const live = Math.round((face.dpsMax(s, m) as { toNumber: () => number }).toNumber() * 1e6);
    // STRIPPED AND PUT BACK, so block K still has four panels to photograph.
    const keep = { tiers: s.plant.tiers, cond: s.plant.condition, prism: s.prism, pattern: s.pattern };
    s.plant.tiers = {}; s.plant.condition = {};
    delete s.prism; delete s.pattern;
    m.invalidate();
    const bareNow = Math.round((face.dpsMax(s, m) as { toNumber: () => number }).toNumber() * 1e6);
    s.plant.tiers = keep.tiers; s.plant.condition = keep.cond;
    s.prism = keep.prism; s.pattern = keep.pattern;
    return { live, bare: bareNow };
  });
  check(ceiling.live, ceiling.bare, -1,
    `J — the ceiling at depth 48 is identical bare and with all four machines (${ceiling.live})`);

  // ═══ K — THE PANELS, AT 380px ════════════════════════════════════════════
  console.log('\n== K — the panels, at 380px ===================================');
  // THE PLANT CLUSTER LIVES IN THE KILN ROOM (`panels.tsx` renders it inside
  // `KilnPanel`, because §3.2's Hearth IS the Kiln). A.92's first run asked for
  // a 'plant' tab that does not exist.
  await tab(page, 'kiln');
  await dismiss(page);
  await page.waitForTimeout(500);
  for (const id of ['prism-panel', 'pattern-panel', 'centrifuge-panel', 'washer-row']) {
    const el = page.locator(`[data-testid="${id}"]`).first();
    const there = (await el.count()) > 0;
    check(there, true, false, `K — ${id} is on the screen`);
    if (there) await el.screenshot({ path: `${OUT}/a93-${id}.png` }).catch(() => {});
  }
  await page.screenshot({ path: `${OUT}/a93-plant.png`, fullPage: true }).catch(() => {});
  const overflow = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.left < -1 || r.right > window.innerWidth + 1)) {
        out.push(`${el.tagName}.${(el.className || '').toString().slice(0, 30)}`);
      }
    }
    return out.slice(0, 6);
  });
  check(overflow, [], ['x'], 'K — nothing overflows 380px');
  check(errors, [], ['x'], 'K — no page errors');

  await browser.close();
  console.log(`\n${problems.length === 0 ? 'ALL PASS' : `${problems.length} PROBLEM(S)`}`);
  if (problems.length) { for (const p of problems) console.log(`  - ${p}`); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
