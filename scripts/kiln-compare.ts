/**
 * One-off: compose the Kiln before/after paired comparison (Phase 11 report).
 * Phone + desktop, BEFORE (Phase-10 strip UI) | AFTER (Phase-11 rooms UI).
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const uri = (p: string) => `data:image/png;base64,${readFileSync(p).toString('base64')}`;
const BEFORE = 'sim-out/shots-p11-before';
const AFTER = 'sim-out/shots-p11-v5';

const html = `<!doctype html><html><head><meta charset="utf8"><style>
  * { margin:0; box-sizing:border-box; }
  body { background:#0c0a09; color:#d4c9b8; font-family:'Segoe UI',system-ui,sans-serif; padding:28px 32px 34px; width:1500px; }
  h1 { font-family:'Palatino Linotype',Georgia,serif; color:#fbbf24; font-size:26px; letter-spacing:.14em; font-weight:700; }
  .sub { color:#8a7f70; font-size:13px; margin:6px 0 22px; font-style:italic; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:22px 26px; }
  .col-h { text-align:center; font-size:13px; letter-spacing:.2em; text-transform:uppercase; font-weight:700; padding-bottom:8px; }
  .before .col-h { color:#8a7f70; }
  .after .col-h { color:#fbbf24; }
  .card { border:1px solid #35302a; border-radius:12px; overflow:hidden; background:#151210; }
  .before .card { opacity:.92; }
  .after .card { border-color:#4a3b28; box-shadow:0 6px 24px rgba(245,158,11,.10); }
  img { display:block; width:100%; }
  .cap { font-size:11px; color:#8a7f70; padding:7px 10px; line-height:1.4; border-top:1px solid #241f1b; }
  .after .cap { color:#b0a494; }
  .phone img { max-height:520px; width:auto; margin:0 auto; }
  .phone .card { display:flex; justify-content:center; }
  .row-label { grid-column:1/3; color:#8a7f70; font-size:11px; letter-spacing:.18em; text-transform:uppercase; margin-top:8px; border-bottom:1px solid #241f1b; padding-bottom:4px; }
</style></head><body>
  <h1>THE KILN — BEFORE / AFTER</h1>
  <div class="sub">"I have NO idea what the Kiln does." Same system, same numbers — the Phase-11 screen states its purpose in the game's own voice before it shows you a single dial.</div>
  <div class="grid">
    <div class="row-label">Phone · 380px</div>
    <div class="before phone"><div class="col-h">Before — the strip</div><div class="card"><img src="${uri(`${BEFORE}/phone-03-kiln-BEFORE.png`)}"></div><div class="cap">A tab in a horizontal strip. A heat bar and four unlabelled numbers. Nothing says what a Kiln is or why you'd feed it.</div></div>
    <div class="after phone"><div class="col-h">After — the room</div><div class="card"><img src="${uri(`${AFTER}/ferrite-phone-kiln.png`)}"></div><div class="cap">Title, live status, and the purpose in Sable's voice: "It eats Dust and gives back Brick… a cold kiln wastes most of what it swallows." Then the next thing to do.</div></div>
    <div class="row-label">Desktop · 1440px</div>
    <div class="before"><div class="col-h">Before — the strip</div><div class="card"><img src="${uri(`${BEFORE}/desktop-kiln-BEFORE.png`)}"></div><div class="cap">Same story wide: instrumentation with no explanation.</div></div>
    <div class="after"><div class="col-h">After — the room</div><div class="card"><img src="${uri(`${AFTER}/ferrite-desk-kiln.png`)}"></div><div class="cap">Purpose + next-action header, then the dials get room to breathe; every upgrade previews its effect.</div></div>
  </div>
</body></html>`;

async function main(): Promise<void> {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1400 } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const el = await page.$('body');
  await el!.screenshot({ path: 'sim-out/kiln-before-after.png' });
  await browser.close();
  console.log('wrote sim-out/kiln-before-after.png');
}
void main();
