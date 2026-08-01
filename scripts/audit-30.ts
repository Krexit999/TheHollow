/**
 * PART 8, done properly (Phase 11b): every surviving system, shot at a
 * single state, then composed into contact sheets for a per-screen verdict.
 * A.72 cut ten of the original thirty tabs (Foundry, Greenhouse, Mycelium,
 * Loom, Bench, Array, Chamber, Warrens, Observatory, Wells) along with their
 * systems; the file name is historical.
 *
 * All are only simultaneously visible POST-RECURSION (parallel needs
 * recursion>=1, rewrite needs breach>=6, hollow needs Hollow records), so
 * that is the state used. Shoots the room region — SystemHeader + panel —
 * which is what the audit is actually about.
 *
 * Usage: npx tsx scripts/audit-30.ts        (dev server must be running)
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const OUT = 'sim-out/audit-30';
const URL = 'http://localhost:5173';

const SYSTEMS = [
  ['dig', 'The Face'], ['kiln', 'The Kiln'], ['drills', 'The Drill Bay'],
  ['vents', 'The Vent Network'], ['hollow', 'The Silence'],
  ['lattice', 'The Lattice'], ['crucible', 'The Alloy Crucible'],
  ['hold', 'The Hold'], ['forge', 'The Forge'], ['runes', 'Rune Inscription'],
  ['guild', 'The Lamphouse'], ['bestiary', 'The Bestiary'],
  ['journal', "Sable's Journal"],
  ['delver', 'The Delver'], ['collapse', 'The Collapse'], ['rewrite', 'The Rewrite'],
  ['parallel', 'The Parallel View'], ['grid', 'Achievements'], ['vault', 'The Vault'],
] as const;

/** Open EVERYTHING: the only state where all 30 coexist. */
const SEED = `(() => {
  const e = window.__engine; const s = e.getState();
  s.shell.current='hollow'; s.shell.breachCount=6;
  s.shell.signatures=['seepage','polarity','growth','refraction','pressure'];
  for (const [sh,d] of [['loam',150],['ferrite',250],['verdance',290],['glassmere',380],['cinder',470],['hollow',220]]) s.depthRecords[sh]=d;
  s.depth=140; s.maxDepthRecord=470;
  s.recursion.count=1; s.recursion.axioms=['unemptying','twoHands'];
  s.kiln.built=true; s.kiln.feeding=true; s.kiln.heat=0.72;
  s.drills.bayBuilt=true; for(let i=0;i<6;i++) s.drills.units.push({level:8,behavior:'fullest',timer:0,lastCell:0});
  s.forge.built=true; s.lattice.unlocked=true;
  s.materials.totalDrops=2000; s.materials.geodes=3; s.materials.geodesCracked=5;
  s.combat.seen.push('lodecrab','slagworm','nullwisp'); s.combat.stats.encounters=40;
  s.guild.discovered=true; s.guild.sable.found.push('p02','p22');
  s.guild.contracts.slots=4; s.guild.contracts.board=[null,null,null,null];
  // NOTE: only REAL content ids may be injected here. Fake ids ('m1', 'a1',
  // 'b1'…) sail through the engine but crash the panel that looks them up in
  // its registry, blanking the whole app — a harness trap, not a game bug.
  // Counters and unlocks are safe; collections of ids are left to fill
  // themselves or stay empty.
  s.pressure.pipes=new Array(35).fill(0); for(const c of [14,15,16,3]) s.pressure.pipes[c]=1; s.pressure.heat=48;
  s.crucible.pours=17;
  s.hollow.silence=55; s.hollow.rebuilt=[]; for(let i=0;i<16;i++) s.hollow.rebuilt.push(i);
  s.delver.level=40; s.delver.skillPoints=3;
  s.stats.saveExported=false;
  for (const c of ['dust','brick','ingot','flux','spore','sap','prism','lumen','slag','ember','silica','obsidian','void','resonance','axiom','core','echo','scrip','renown','humus','fiber','ray','spectrum'])
    e.dispatch({type:'debug',op:'grant',currency:c,amount:5e8});
  e.tick(0.3);
  return 'seeded';
})()`;

const IDS = SYSTEMS.map(([id]) => id);

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page: Page = await browser.newPage({ viewport: { width: 1440, height: 1250 } });
  // A render crash unmounts the whole root and every later shot fails with a
  // useless locator timeout. Make it loud instead.
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message.slice(0, 160)));
  await page.goto(URL);
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.evaluate(SEED);
  await page.waitForTimeout(600);
  await page.evaluate(`window.__engine.dispatch({type:'markSystemsSeen',ids:${JSON.stringify(IDS)}})`);
  await page.waitForTimeout(4800); // let the seed's one-time toasts clear

  for (const [id, name] of SYSTEMS) {
    await page.evaluate(`window.__ui.getState().setTab('${id}')`);
    await page.waitForTimeout(650);
    // NB: locator.screenshot() waits for the element to stop moving, and this
    // app re-renders at 12Hz with live animations — it never settles. Clip a
    // page screenshot to the room's box instead: no stability wait.
    const box = await page.locator('section[aria-label]').first().boundingBox();
    if (!box) { console.error(`FAILED ${id} (${name}): no room box`); continue; }
    await page
      .screenshot({
        path: `${OUT}/${id}.png`,
        animations: 'disabled',
        clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 1150) },
      })
      .catch((err) => console.error(`FAILED ${id} (${name}):`, String(err).slice(0, 90)));
  }
  await browser.close();

  // Contact sheets: 6 per sheet (2 across), so header text stays readable.
  const uri = (p: string) => `data:image/png;base64,${readFileSync(p).toString('base64')}`;
  const sheets = Math.ceil(SYSTEMS.length / 6);
  const b2 = await chromium.launch({ channel: 'chrome', headless: true });
  for (let s = 0; s < sheets; s++) {
    const group = SYSTEMS.slice(s * 6, s * 6 + 6);
    const cards = group.map(([id, name]) => `
      <div class="card">
        <div class="cap">${id} — ${name}</div>
        <img src="${uri(`${OUT}/${id}.png`)}">
      </div>`).join('');
    const html = `<html><head><meta charset="utf8"><style>
      *{margin:0;box-sizing:border-box}
      body{background:#0c0a09;color:#d4c9b8;font-family:system-ui,sans-serif;padding:18px;width:1300px}
      h1{color:#fbbf24;font-size:16px;letter-spacing:.16em;margin-bottom:14px;text-transform:uppercase}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
      .card{border:1px solid #35302a;border-radius:8px;overflow:hidden;background:#151210}
      .cap{font-size:12px;font-weight:700;color:#fbbf24;padding:6px 9px;border-bottom:1px solid #241f1b}
      img{display:block;width:100%;max-height:560px;object-fit:cover;object-position:top}
    </style></head><body>
      <h1>Part 8 audit — sheet ${s + 1} of ${sheets}</h1>
      <div class="grid">${cards}</div>
    </body></html>`;
    const p2 = await b2.newPage({ viewport: { width: 1300, height: 1000 } });
    await p2.setContent(html, { waitUntil: 'load' });
    await p2.waitForTimeout(350);
    await (await p2.$('body'))!.screenshot({ path: `${OUT}/_sheet-${s + 1}.png` });
    await p2.close();
  }
  await b2.close();
  console.log(`wrote ${SYSTEMS.length} shots + ${sheets} contact sheets -> ${OUT}`);
}
void main();
