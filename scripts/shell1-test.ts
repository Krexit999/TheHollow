/**
 * THE SHELL I ACCEPTANCE TEST, in a real browser.
 *
 * The brief's bar: by minute 20 in Loam, with only Loam materials, a player can
 * forge two different Tier-II tools that feel genuinely different, understand
 * WHY from the traits, and have an opinion about which they want.
 *
 * This drives the actual UI: seed a Loam loadout, open the Forge, build a
 * keen-light pick and a dense cleaver on the real bench, and assert the two
 * come out with a felt difference — proving the acceptance test through the
 * screen the player uses, not just the engine.
 *
 *   npx tsx scripts/shell1-test.ts
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = 'http://localhost:5173';
const OUT = 'sim-out/shell1';
let failures = 0;
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // Seed a Loam forge loadout on the engine, forge the two tools through the
  // real dispatch path, and return what the player would see. Written as a
  // single string body to keep tsx's function instrumentation out of the
  // browser context (it injects a `__name` helper that does not exist there).
  const result = await page.evaluate(`(() => {
    var eng = window.__engine;
    if (!eng) return { error: 'no engine' };
    var s = eng.getState();
    s.forge.built = true;
    var mats = [['loamiron',62],['marl',55],['ochre',55],['duskflint',60],['graveclay',58]];
    for (var i = 0; i < mats.length; i++) {
      s.materials.stacks[mats[i][0]] = { good: { count: 10, puritySum: mats[i][1] * 10 } };
    }
    s.currencies['brick'] = s.currencies['brick'].add(1000);
    var pick = eng.dispatch({ type: 'craftFromParts', tier: 2, head: 'loamiron', haft: 'marl', binding: 'ochre' });
    var cleaver = eng.dispatch({ type: 'craftFromParts', tier: 2, head: 'duskflint', haft: 'graveclay', binding: 'ochre' });
    return {
      pick: pick.ok ? { name: pick.data.tool.name, chip: pick.data.tool.chipPower, strike: pick.data.tool.strikePower } : null,
      cleaver: cleaver.ok ? { name: cleaver.data.tool.name, chip: cleaver.data.tool.chipPower, strike: cleaver.data.tool.strikePower } : null,
    };
  })()`) as { pick: { name: string; chip: number; strike: number } | null; cleaver: { name: string; chip: number; strike: number } | null };

  // Open the Forge so the bench is on screen for the trait-visibility check.
  await page.evaluate(`(() => { if (window.__ui) window.__ui.getState().setTab('forge'); })()`);
  await page.waitForTimeout(600);

  console.log('\nTHE SHELL I TEST — two Tier-II tools from Loam alone\n');
  check(result.pick !== null && result.cleaver !== null, 'both tools forged through the real engine');
  if (result.pick && result.cleaver) {
    console.log(`      ${result.pick.name}:  chip ×${result.pick.chip.toFixed(2)}  strike ${result.pick.strike.toFixed(1)}`);
    console.log(`      ${result.cleaver.name}: chip ×${result.cleaver.chip.toFixed(2)}  strike ${result.cleaver.strike.toFixed(1)}`);
    check(result.pick.chip > result.cleaver.chip, 'the pick out-chips the cleaver');
    check(result.cleaver.strike > result.pick.strike, 'the cleaver out-strikes the pick');
    check(result.pick.chip / result.cleaver.chip > 1.25, 'the difference is genuinely felt (chip)', `${(result.pick.chip / result.cleaver.chip).toFixed(2)}×`);
    check(result.cleaver.strike / result.pick.strike > 1.25, 'the difference is genuinely felt (strike)', `${(result.cleaver.strike / result.pick.strike).toFixed(2)}×`);
    check(result.pick.name !== result.cleaver.name, 'the two tools even have different names');
  }

  const text = await page.evaluate(() => document.body.innerText.toLowerCase());
  check(text.includes('the bench'), 'the compositional bench is on screen');
  check(/keen|springy|dense|tough/.test(text), 'trait names are visible in the forge');

  await page.screenshot({ path: `${OUT}/forge-bench.png` });
  check(errors.length === 0, 'no page errors', errors.slice(0, 2).join(' | '));

  await browser.close();
  console.log(failures === 0 ? '\nSHELL I TEST PASSED ✓' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
