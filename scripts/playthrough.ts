/**
 * PLAY IT BY HAND (Phase 13). Not screenshots, not the sim — a real pointer
 * clicking real controls at four progression states, checking after every click
 * that the thing that was supposed to happen happened.
 *
 * This exists because the DisclosureGate made the game unplayable while 233
 * tests and a screenshot harness both passed: a modal whose only button falls
 * below the fold is not a logic error and does not render as a broken pixel.
 * The only thing that catches it is pressing the button.
 *
 * Usage: npx tsx scripts/playthrough.ts [port]
 */
import { chromium, type Page } from 'playwright';

const PORT = process.argv[2] ?? '5174';
const URL = `http://localhost:${PORT}`;
const findings: string[] = [];
const note = (s: string) => { findings.push(s); console.log('  ! ' + s); };

const IDS = ['dig','kiln','drills','vents','hollow','lattice','crucible','foundry','greenhouse','mycelium','loom','bench','array','chamber','automation','hold','forge','runes','brew','relics','museum','guild','bestiary','warrens','observatory','journal','wells','expeditions','delver','collapse','rewrite','parallel','spiral','grid','vault'];

const SEEDS: Record<string, string> = {
  fresh: '(() => "fresh")()',
  ferrite: `(() => { const e=window.__engine,s=e.getState();
    s.shell.current='ferrite'; s.shell.breachCount=1; s.shell.signatures=['seepage'];
    s.depthRecords.loam=150; s.depthRecords.ferrite=120; s.depth=120; s.maxDepthRecord=150;
    s.kiln.built=true; s.kiln.feeding=true; s.kiln.heat=0.7; s.drills.bayBuilt=true;
    for(let i=0;i<4;i++) s.drills.units.push({level:5,behavior:'fullest',timer:0,lastCell:0});
    s.forge.built=true; s.lattice.unlocked=true; s.materials.totalDrops=300;
    s.combat.seen.push('lodecrab'); s.guild.discovered=true; s.guild.sable.found.push('p02');
    for(const c of ['dust','brick','ingot','flux']) e.dispatch({type:'debug',op:'grant',currency:c,amount:200000});
    e.tick(0.3); return 'ok'; })()`,
  cinder: `(() => { const e=window.__engine,s=e.getState();
    s.shell.current='cinder'; s.shell.breachCount=4; s.shell.signatures=['seepage','polarity','growth','refraction'];
    for(const [sh,d] of [['loam',150],['ferrite',250],['verdance',290],['glassmere',380],['cinder',120]]) s.depthRecords[sh]=d;
    s.depth=120; s.maxDepthRecord=250; s.kiln.built=true; s.kiln.feeding=true;
    s.drills.bayBuilt=true; for(let i=0;i<6;i++) s.drills.units.push({level:8,behavior:'fullest',timer:0,lastCell:0});
    s.forge.built=true; s.lattice.unlocked=true; s.materials.totalDrops=900;
    s.combat.seen.push('slagworm'); s.guild.discovered=true; s.guild.hirelings['pell']={hiredAtMs:0};
    s.pressure.pipes=new Array(35).fill(0); s.pressure.heat=48;
    for(const c of ['slag','ember','obsidian','scrip']) e.dispatch({type:'debug',op:'grant',currency:c,amount:500000});
    e.tick(0.3); return 'ok'; })()`,
  recursion: `(() => { const e=window.__engine,s=e.getState();
    s.shell.current='hollow'; s.shell.breachCount=6; s.recursion.count=1; s.recursion.axiomsEarned=20;
    for(const [sh,d] of [['loam',150],['ferrite',250],['verdance',290],['glassmere',380],['cinder',470],['hollow',220]]) s.depthRecords[sh]=d;
    s.depth=140; s.maxDepthRecord=470; s.kiln.built=true; s.drills.bayBuilt=true; s.forge.built=true;
    s.lattice.unlocked=true; s.materials.totalDrops=2000; s.combat.seen.push('nullwisp');
    s.guild.discovered=true; s.guild.hirelings['pell']={hiredAtMs:0}; s.hollow.silence=55;
    s.hollow.rebuilt=[]; for(let i=0;i<16;i++) s.hollow.rebuilt.push(i);
    for(const c of ['void','resonance','axiom','spiral']) e.dispatch({type:'debug',op:'grant',currency:c,amount:100000});
    e.tick(0.3); return 'ok'; })()`,
};

async function settle(p: Page, ms = 700): Promise<void> { await p.waitForTimeout(ms); }

async function playState(p: Page, name: string): Promise<void> {
  console.log(`\n──────── ${name} ────────`);
  await p.goto(URL);
  await p.waitForSelector('canvas', { timeout: 20000 });
  await settle(p, 1500);
  await p.evaluate(SEEDS[name]!);
  await settle(p, 1200);
  await p.evaluate(`window.__engine.dispatch({type:'markSystemsSeen',ids:${JSON.stringify(IDS)}})`);
  await settle(p, 4600); // let one-time toasts clear

  // A modal must never be undismissable. Press its button like a player.
  const dialog = await p.$('[role="dialog"]');
  if (dialog) {
    const btns = await dialog.$$('button');
    const ack = btns[btns.length - 1];
    const box = ack ? await ack.boundingBox() : null;
    const vh = p.viewportSize()!.height;
    if (!box || box.y + box.height > vh) note(`${name}: modal dismiss button is off-screen (y=${box?.y})`);
    else { await ack!.click(); await settle(p, 400); }
    if (await p.$('[role="dialog"]')) note(`${name}: modal survived its own dismiss button`);
  }

  // Walk every visible room and click the first enabled control in it.
  const rooms = await p.evaluate(`(() => Array.from(document.querySelectorAll('[role="tab"]')).map((t) => t.textContent.trim()))()`) as string[];
  console.log(`  rooms in this cluster: ${rooms.join(', ')}`);

  for (const id of IDS) {
    await p.evaluate(`window.__ui.getState().setTab('${id}')`).catch(() => {});
    await settle(p, 260);
    const health = await p.evaluate(`(() => {
      const root = document.getElementById('root');
      const sec = document.querySelector('section[aria-label]');
      const hdr = sec ? sec.querySelector('header') : null;
      const btns = sec ? Array.from(sec.querySelectorAll('button')) : [];
      const enabled = btns.filter((b) => !b.disabled);
      const de = document.documentElement;
      return {
        rootAlive: (root ? root.children.length : 0) > 0,
        hasHeader: !!hdr,
        headerText: hdr ? hdr.innerText.slice(0, 40) : '',
        buttons: btns.length,
        enabled: enabled.length,
        overflowX: de.scrollWidth - de.clientWidth,
        bodyText: sec ? sec.innerText.length : 0,
      };
    })()`) as Record<string, number | boolean | string>;

    if (!health.rootAlive) { note(`${name}/${id}: RENDER CRASH — root unmounted`); continue; }
    if (!health.hasHeader) note(`${name}/${id}: no SystemHeader rendered`);
    if ((health.overflowX as number) > 0) note(`${name}/${id}: horizontal overflow ${health.overflowX}px`);
    if ((health.bodyText as number) < 40) note(`${name}/${id}: room is essentially empty (${health.bodyText} chars)`);

    // Actually press something.
    const clicked = await p.evaluate(`(() => {
      const sec = document.querySelector('section[aria-label]');
      if (!sec) return 'no section';
      const b = Array.from(sec.querySelectorAll('button')).find((x) => !x.disabled && !/back/i.test(x.textContent||''));
      if (!b) return 'nothing enabled';
      b.click();
      return 'clicked: ' + (b.textContent||'').trim().slice(0, 30);
    })()`) as string;
    await settle(p, 260);
    const after = await p.evaluate(`(() => ({ alive: (document.getElementById('root')?.children.length ?? 0) > 0, err: !!document.querySelector('vite-error-overlay') }))()`) as { alive: boolean; err: boolean };
    if (!after.alive) note(`${name}/${id}: CRASHED after clicking (${clicked})`);
    if (after.err) note(`${name}/${id}: vite error overlay after clicking (${clicked})`);
  }
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => note(`PAGEERROR: ${e.message.slice(0, 120)}`));
  page.on('console', (m) => { if (m.type() === 'error') note(`CONSOLE: ${m.text().slice(0, 120)}`); });

  for (const name of ['fresh', 'ferrite', 'cinder', 'recursion']) await playState(page, name);

  await browser.close();
  console.log(`\n===== ${findings.length} findings =====`);
  for (const f of findings) console.log(' - ' + f);
}
void main();
