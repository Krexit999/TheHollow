/**
 * THE SHAFT renderer — frame numbers with their load conditions.
 *
 * The Phase-13 heavy load (Shell VII, 24 drills, 120 relics, a large save) at
 * a 4x-throttled phone, ON THE SHAFT TAB. Reports steady-state
 * frame pacing, a scroll sweep (which bakes and evicts chunks), and the LRU cache
 * hit rate — the renderer's own guardrails. Baseline to beat: 9.7ms mean, 0
 * frames >100ms; do not regress past ~16ms mean.
 *
 *   npx tsx scripts/perf-shaft.ts [port]
 */
import { chromium } from 'playwright';

const PORT = process.argv[2] ?? '5173';
const URL = `http://localhost:${PORT}`;

const HEAVY = `(() => {
  const e = window.__engine, s = e.getState();
  s.shell.current = 'hollow'; s.shell.breachCount = 6;
  s.shell.signatures = ['seepage','polarity','growth','refraction','pressure'];
  for (const [sh,d] of [['loam',150],['ferrite',250],['verdance',290],['glassmere',380],['cinder',470],['hollow',560]]) s.depthRecords[sh]=d;
  s.depth = 220; s.maxDepthRecord = 560; s.shaft.reached = 240;
  s.recursion.count = 3; s.recursion.axioms = ['unemptying','twoHands'];
  s.kiln.built = true; s.kiln.feeding = true; s.drills.bayBuilt = true;
  for (let i=0;i<24;i++) s.drills.units.push({level:20,behavior:'fullest',timer:0,lastCell:0});
  s.forge.built = true; s.lattice.unlocked = true;
  s.materials.totalDrops = 20000; s.guild.discovered = true;
  for (let i=0;i<120;i++) s.relics.held.push({uid:i+1,defId:'depth-2',rarity:2,affixes:{regen:0.08},source:'depth',fusedFrom:0});
  s.relics.nextUid = 200; s.relics.equipped = [1,2,3,4,5,6];
  // Rail + caches + scars so the dynamic overlay is fully loaded too.
  s.shaft.rail = { hollow: 220 };
  for (const d of [40,90,140,190]) s.shaft.caches.push({shell:'hollow',depth:d,material:'voidsalt',qty:5,purity:60,startedMs:0});
  for (const d of [55,120,205]) s.shaft.scars.push({shell:'hollow',depth:d,kind:'flood'});
  e.tick(1);
  return 'heavy';
})()`;

const MEASURE = `(async (n) => {
  const times = []; let last = performance.now();
  await new Promise((resolve) => {
    let c = 0;
    const tick = () => { const now = performance.now(); times.push(now - last); last = now;
      if (++c >= n) resolve(null); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  times.sort((a,b)=>a-b);
  const mean = times.reduce((a,b)=>a+b,0)/times.length;
  return { mean:+mean.toFixed(2), median:+times[times.length>>1].toFixed(2),
    p95:+times[Math.floor(times.length*0.95)].toFixed(2), worst:+times[times.length-1].toFixed(2),
    over33:times.filter(t=>t>33).length, over100:times.filter(t=>t>100).length };
})(600)`;

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.evaluate(HEAVY);
  await page.waitForTimeout(400);
  await page.evaluate(`window.__ui.getState().setTab('shaft')`);
  await page.waitForTimeout(2000); // settle + bake the visible chunks

  const steady = await page.evaluate(MEASURE) as Record<string, number>;

  // Scroll sweep: drag up through ~120 depths, baking + evicting chunks, while
  // measuring. This is the worst case for the renderer.
  const sweep = await page.evaluate(`(async () => {
    const times = []; let last = performance.now();
    const v = window.__shaftView;
    await new Promise((resolve) => {
      let c = 0;
      const tick = () => {
        const now = performance.now(); times.push(now - last); last = now;
        // Travel monotonically 0 → 240 so the camera sweeps every chunk, forcing
        // fresh bakes and LRU evictions — the renderer's worst case.
        try { window.__engine.dispatch({ type: 'climb', to: Math.floor((c / 300) * 240) }); } catch(e) {}
        if (++c >= 300) resolve(null); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    times.sort((a,b)=>a-b);
    const mean = times.reduce((a,b)=>a+b,0)/times.length;
    const hit = (v && v.cacheHitRate) ? v.cacheHitRate() : -1;
    return { mean:+mean.toFixed(2), p95:+times[Math.floor(times.length*0.95)].toFixed(2),
      worst:+times[times.length-1].toFixed(2), over100:times.filter(t=>t>100).length, hitRate:+hit.toFixed(3) };
  })()`) as Record<string, number>;

  console.log('\n===== SHAFT RENDERER: Shell VII heavy, phone @4x CPU throttle =====');
  console.log('-- steady state (player fixed), 600 frames --');
  console.log(`  mean ${steady.mean}ms  median ${steady.median}ms  p95 ${steady.p95}ms  worst ${steady.worst}ms`);
  console.log(`  frames >33ms: ${steady.over33}/600   >100ms: ${steady.over100}/600`);
  console.log('-- scroll sweep (baking + evicting), 300 frames --');
  console.log(`  mean ${sweep.mean}ms  p95 ${sweep.p95}ms  worst ${sweep.worst}ms   >100ms: ${sweep.over100}/300`);
  console.log(`  LRU cache hit rate: ${((sweep.hitRate ?? 0) * 100).toFixed(1)}%`);
  const ok = (steady.mean ?? 99) <= 16 && (steady.over100 ?? 1) === 0;
  console.log(`\n${ok ? 'PASS' : 'CHECK'} — steady mean ${steady.mean}ms (budget ≤16), ${steady.over100} hitches`);
  await browser.close();
}
void main();
