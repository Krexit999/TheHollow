/**
 * Phase 11 verification: assert NO horizontal scroll at 380px in any of the
 * four progression states (Part 1's hard promise — the five-cluster bar can
 * never overflow). Reuses the seeds from shot-ui via a light re-declaration.
 * Usage: npx tsx scripts/check-overflow.ts  (dev server must be running)
 */
import { chromium, type Page } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:5173';
const IDS = ['dig','kiln','drills','vents','hollow','lattice','crucible','foundry','greenhouse','mycelium','loom','bench','array','chamber','hold','forge','runes','brew','guild','bestiary','warrens','observatory','journal','wells','delver','collapse','rewrite','parallel','grid','vault'];

/* eslint-disable @typescript-eslint/no-explicit-any */
const seeds: Record<string, string> = {
  fresh: `(()=>{})()`,
  ferrite: `(()=>{const s=window.__engine.getState();s.shell.current='ferrite';s.shell.breachCount=1;s.shell.signatures=['seepage'];s.depthRecords.loam=150;s.depthRecords.ferrite=120;s.depth=120;s.maxDepthRecord=150;s.kiln.built=true;s.kiln.feeding=true;s.kiln.heat=0.7;s.drills.bayBuilt=true;for(let i=0;i<4;i++)s.drills.units.push({level:5,behavior:'fullest',timer:0,lastCell:0});s.forge.built=true;s.lattice.unlocked=true;s.materials.totalDrops=300;s.combat.seen.push('lodecrab');s.guild.discovered=true;window.__engine.tick(0.2);})()`,
  cinder: `(()=>{const s=window.__engine.getState();s.shell.current='cinder';s.shell.breachCount=4;s.shell.signatures=['seepage','polarity','growth','refraction'];for(const[sh,d] of [['loam',150],['ferrite',250],['verdance',290],['glassmere',380],['cinder',120]])s.depthRecords[sh]=d;s.depth=120;s.maxDepthRecord=250;s.kiln.built=true;s.kiln.feeding=true;s.kiln.heat=0.8;s.drills.bayBuilt=true;for(let i=0;i<6;i++)s.drills.units.push({level:8,behavior:'fullest',timer:0,lastCell:0});s.forge.built=true;s.lattice.unlocked=true;s.materials.totalDrops=900;s.combat.seen.push('slagworm');s.guild.discovered=true;s.pressure.pipes=new Array(35).fill(0);s.pressure.heat=58;window.__engine.tick(0.2);})()`,
  recursion: `(()=>{const s=window.__engine.getState();s.shell.current='hollow';s.shell.breachCount=5;s.shell.signatures=['seepage','polarity','growth','refraction','pressure'];for(const[sh,d] of [['loam',150],['ferrite',250],['verdance',290],['glassmere',380],['cinder',470],['hollow',220]])s.depthRecords[sh]=d;s.depth=140;s.maxDepthRecord=470;s.recursion.count=1;s.recursion.axioms=['unemptying','twoHands'];s.kiln.built=true;s.drills.bayBuilt=true;s.forge.built=true;s.lattice.unlocked=true;s.materials.totalDrops=2000;s.combat.seen.push('nullwisp');s.guild.discovered=true;s.hollow.silence=60;s.hollow.rebuilt=[];for(let i=0;i<16;i++)s.hollow.rebuilt.push(i);window.__engine.tick(0.2);})()`,
};

async function probe(page: Page, name: string): Promise<{ name: string; ok: boolean; detail: string }> {
  await page.goto(URL);
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForTimeout(900);
  await page.evaluate(seeds[name]!).catch(() => {});
  await page.waitForTimeout(600);
  await page.evaluate(`window.__engine && window.__engine.dispatch({type:'markSystemsSeen',ids:${JSON.stringify(IDS)}})`).catch(() => {});
  await page.waitForTimeout(600);
  // Visit each cluster; at every stop, assert the document and the bottom nav
  // never scroll horizontally.
  const worst = await page.evaluate(`(() => {
    const clusters = ['dig']; // face
    const ui = window.__ui;
    const results = [];
    const navs = Array.from(document.querySelectorAll('nav'));
    const overflow = () => {
      const de = document.documentElement;
      const docOver = de.scrollWidth - de.clientWidth;
      let navOver = 0;
      for (const n of navs) navOver = Math.max(navOver, n.scrollWidth - n.clientWidth);
      return { docOver, navOver };
    };
    // Sample the face plus one system from each other cluster the store knows.
    const tabs = ['dig','kiln','drills','vents','hollow','lattice','crucible','hold','forge','guild','bestiary','delver','collapse','grid','vault','array','chamber','parallel','rewrite'];
    let maxDoc = 0, maxNav = 0, at = '';
    for (const t of tabs) {
      try { ui.getState().setTab(t); } catch (e) {}
      const o = overflow();
      if (o.docOver > maxDoc) { maxDoc = o.docOver; }
      if (o.navOver > maxNav) { maxNav = o.navOver; at = t; }
    }
    return { maxDoc, maxNav, at, w: window.innerWidth };
  })()`) as any;
  const ok = worst.maxDoc <= 1 && worst.maxNav <= 1;
  return { name, ok, detail: `docOverflow=${worst.maxDoc}px navOverflow=${worst.maxNav}px (worst tab: ${worst.at||'none'}) @${worst.w}px` };
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 380, height: 820 }, isMobile: true, hasTouch: true });
  let allOk = true;
  for (const name of Object.keys(seeds)) {
    const r = await probe(page, name);
    allOk = allOk && r.ok;
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${name.padEnd(10)} ${r.detail}`);
  }
  await browser.close();
  console.log(allOk ? '\nALL STATES: no horizontal scroll at 380px ✓' : '\nHORIZONTAL SCROLL DETECTED ✗');
  process.exit(allOk ? 0 : 1);
}
void main();
