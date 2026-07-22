/**
 * PERFORMANCE (Phase 13). Numbers, not impressions.
 *
 * Shell VII with every system running, a large save, a long session, on a phone
 * viewport. Measures cold load, sustained frame rate, frame drops, engine step
 * cost, and heap growth over time.
 *
 * Usage: npx tsx scripts/perf.ts [port]
 */
import { chromium } from 'playwright';

const PORT = process.argv[2] ?? '5174';
const URL = `http://localhost:${PORT}`;

/** Shell VII, everything unlocked, boards populated, big numbers. */
const HEAVY = `(() => {
  const e = window.__engine, s = e.getState();
  s.shell.current = 'hollow'; s.shell.breachCount = 6;
  s.shell.signatures = ['seepage','polarity','growth','refraction','pressure'];
  for (const [sh,d] of [['loam',150],['ferrite',250],['verdance',290],['glassmere',380],['cinder',470],['hollow',560]]) s.depthRecords[sh]=d;
  s.depth = 220; s.maxDepthRecord = 560;
  s.recursion.count = 3; s.recursion.axiomsEarned = 20;
  s.recursion.axioms = ['unemptying','twoHands'];
  s.spiral.count = 2; s.spiral.slots = 6; s.spiral.licences = 2;
  s.spiral.modules = ['autoBuyFace','autoKiln','autoDescend','autoCollapse'];
  s.spiral.grid = { 0:'autoBuyFace', 1:'autoKiln', 4:'autoDescend', 5:'autoCollapse' };
  s.spiral.shells = [{shellId:'loam',depth:80,policy:'balanced',runSec:0,collapses:3},
                     {shellId:'ferrite',depth:120,policy:'balanced',runSec:0,collapses:1}];
  s.kiln.built = true; s.kiln.feeding = true; s.drills.bayBuilt = true;
  for (let i=0;i<24;i++) s.drills.units.push({level:20,behavior:'fullest',timer:0,lastCell:0});
  s.forge.built = true; s.lattice.unlocked = true;
  s.materials.totalDrops = 20000; s.materials.geodes = 40;
  s.combat.seen.push('lodecrab','slagworm','nullwisp','rootboar','rimeshade');
  s.guild.discovered = true; s.guild.hirelings['pell']={hiredAtMs:0};
  s.pressure.pipes = new Array(35).fill(0);
  for (const c of [14,15,16,3,10,11]) s.pressure.pipes[c]=1;
  s.pressure.heat = 62;
  s.hollow.silence = 70; s.hollow.rebuilt = []; for (let i=0;i<36;i++) s.hollow.rebuilt.push(i);
  s.chamber.tape = []; for (let i=0;i<12;i++) s.chamber.tape.push({action:{type:'chip',cell:i%36},label:'chip'});
  s.chamber.running = true;
  // A LARGE save: lots of relics, materials, feed history.
  for (let i=0;i<120;i++) s.relics.held.push({uid:i+1,defId:'depth-2',rarity:2,affixes:{regen:0.08,cellCap:0.1},source:'depth',fusedFrom:0});
  s.relics.nextUid = 200; s.relics.found = 200; s.relics.equipped = [1,2,3,4,5,6];
  for (const c of ['dust','brick','void','resonance','slag','ember','spore','sap','prism','lumen','axiom','spiral','scrip'])
    e.dispatch({type:'debug',op:'grant',currency:c,amount:1e12});
  e.tick(1);
  return 'heavy';
})()`;

async function main(): Promise<void> {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  // A mid-range phone viewport, throttled CPU to approximate one.
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); // ~4x slower than desktop

  // --- cold load -----------------------------------------------------------
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('canvas', { timeout: 30000 });
  const coldLoadMs = Date.now() - t0;

  await page.waitForTimeout(1500);
  await page.evaluate(HEAVY);
  await page.waitForTimeout(2500);

  const saveBytes = await page.evaluate(`(() => {
    try { return JSON.stringify(window.__engine.getState()).length; } catch { return -1; }
  })()`);

  // --- sustained frame rate over a long window ------------------------------
  const frames = await page.evaluate(`(async () => {
    const times = [];
    let last = performance.now();
    await new Promise((resolve) => {
      let n = 0;
      const tick = () => {
        const now = performance.now();
        times.push(now - last); last = now; n++;
        if (n >= 600) resolve(null); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    times.sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    return {
      frames: times.length,
      meanMs: +mean.toFixed(2),
      medianMs: +times[Math.floor(times.length / 2)].toFixed(2),
      p95Ms: +times[Math.floor(times.length * 0.95)].toFixed(2),
      worstMs: +times[times.length - 1].toFixed(2),
      over33ms: times.filter((t) => t > 33).length,
      over100ms: times.filter((t) => t > 100).length,
    };
  })()`) as Record<string, number>;

  // --- engine step cost -----------------------------------------------------
  const step = await page.evaluate(`(() => {
    const e = window.__engine;
    const t = performance.now();
    for (let i = 0; i < 600; i++) e.tick(0.1);
    const total = performance.now() - t;
    return { sixtySecOfSimMs: +total.toFixed(1), perStepMs: +(total / 600).toFixed(3) };
  })()`) as Record<string, number>;

  // --- heap growth over a long session --------------------------------------
  const heap = await page.evaluate(`(async () => {
    const m = () => (performance).memory ? (performance).memory.usedJSHeapSize : -1;
    const before = m();
    const e = window.__engine;
    for (let round = 0; round < 20; round++) {
      for (let i = 0; i < 300; i++) e.tick(0.1);
      await new Promise((r) => setTimeout(r, 60));
    }
    const after = m();
    return { beforeMB: +(before / 1048576).toFixed(1), afterMB: +(after / 1048576).toFixed(1),
             growthMB: +((after - before) / 1048576).toFixed(1), simMinutes: 10 };
  })()`) as Record<string, number>;

  const feedLen = await page.evaluate(`window.__engine.getState().feed.length`);

  console.log('\n===== PERFORMANCE: Shell VII, everything running, phone @4x CPU throttle =====');
  console.log(`cold load (nav -> canvas)   : ${coldLoadMs} ms`);
  console.log(`save size (JSON chars)      : ${saveBytes}`);
  console.log(`feed ring length            : ${feedLen} (capped)`);
  console.log('\n-- frame pacing over 600 frames --');
  console.log(`  mean ${frames.meanMs}ms  median ${frames.medianMs}ms  p95 ${frames.p95Ms}ms  worst ${frames.worstMs}ms`);
  console.log(`  frames over 33ms (<30fps) : ${frames.over33ms} / ${frames.frames}`);
  console.log(`  frames over 100ms (hitch) : ${frames.over100ms} / ${frames.frames}`);
  console.log('\n-- engine cost --');
  console.log(`  60s of simulation         : ${step.sixtySecOfSimMs} ms  (${step.perStepMs} ms/step)`);
  console.log('\n-- heap over ~10 simulated minutes --');
  console.log(`  ${heap.beforeMB} MB -> ${heap.afterMB} MB   growth ${heap.growthMB} MB`);

  await browser.close();
}
void main();
