/**
 * SIM — IS AN ORE POCKET WORTH THE ATTENTION IT COSTS?
 *
 * The report is "mining ores takes too long, I just leave them". That is a
 * SUPPLY-vs-ATTENTION question, not a yield question, and the two have to be
 * measured separately or the fix will breach pillar 1:
 *
 *   SUPPLY is spawn-bounded and always was. `tickOres` rolls `ORE_SPAWN_CHANCE`
 *   once per second against a cap of `ORE_CAP_SHARE` of the face, so the number
 *   of pockets that EXIST per hour has nothing to do with how fast you open
 *   one. Cutting `digSec` therefore cannot manufacture pockets — it can only
 *   move the player from "opens a third of them" toward "opens the ones that
 *   appear", which is the ceiling the design already chose.
 *
 *   ATTENTION is the thing that broke. At the shipped figures, taking every
 *   pocket the field produces costs a fixed number of minutes per hour of
 *   HOLDING ONE CELL — during which you are mining nothing else. Past some
 *   share of the hour that is not a decision, it is a tax, and the player does
 *   the correct thing and walks away.
 *
 * So this measures three numbers and one ratio:
 *   1. pockets produced per hour (the supply ceiling — must not move)
 *   2. minutes per hour spent holding, to take them all, before and after
 *   3. the DROP ECONOMY those pockets drive, which pillar 1 binds at ~5x
 *
 * Writes `sim-out/ore-time.md` and exits.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createEngine } from '../src/engine/index';
import {
  ORE_SPAWN_CHANCE, ORE_CAP_SHARE, ORE_VEIN_CHANCE, ORE_VEIN_MIN, ORE_VEIN_MAX,
  DRILL_ORE_SPEED,
} from '../src/engine/systems/ores';
import { ORES } from '../src/engine/content/ores';

createEngine();

const out: string[] = ['# Ore: time against supply', ''];

// ---------------------------------------------------------------------------
// 1 — the supply ceiling. Spawn-bounded, and this is the number that must NOT move.
// ---------------------------------------------------------------------------
const HOUR = 3600;
const meanVein = ORE_VEIN_CHANCE * ((ORE_VEIN_MIN + ORE_VEIN_MAX) / 2) + (1 - ORE_VEIN_CHANCE) * 1;
const eventsPerHour = ORE_SPAWN_CHANCE * HOUR;
const cellsPerHour = eventsPerHour * meanVein;

out.push('## 1 — supply, which this phase does not touch', '');
out.push(`- spawn roll: ${ORE_SPAWN_CHANCE}/sec → **${eventsPerHour.toFixed(1)} pocket events/hour**`);
out.push(`- mean pocket size ${meanVein.toFixed(2)} cells → **${cellsPerHour.toFixed(0)} ore cells/hour**`);
out.push(`- standing cap: ${ORE_CAP_SHARE * 100}% of the face`);
out.push('');
out.push('Supply is a function of the spawn roll and the cap. Dig time appears in');
out.push('neither, so nothing below can raise it.');
out.push('');

// ---------------------------------------------------------------------------
// 2 — attention. What it costs to take everything the field makes.
// ---------------------------------------------------------------------------
// Weighted mean dig time across the types actually rollable, weighted by their
// spawn weight — not a flat average, which would over-count the rare deep ones.
function meanDig(scale: number, minDepth: number): number {
  const live = ORES.filter((o) => o.minDepth <= minDepth);
  const w = live.reduce((n, o) => n + o.weight, 0);
  return live.reduce((n, o) => n + o.weight * o.digSec * scale, 0) / w;
}

out.push('## 2 — attention: minutes per hour spent holding one cell', '');
out.push('| depth band | dig BEFORE | dig NOW | hand min/hr BEFORE | hand min/hr NOW | drill min/hr NOW |', '|---|---|---|---|---|---|');

const SHIPPED: Record<string, number> = { fatseam: 8, blindglut: 12, heartrot: 16, lodeknot: 14 };
function meanDigShipped(minDepth: number): number {
  const live = ORES.filter((o) => o.minDepth <= minDepth);
  const w = live.reduce((n, o) => n + o.weight, 0);
  return live.reduce((n, o) => n + o.weight * (SHIPPED[o.id] ?? o.digSec), 0) / w;
}
const BANDS: Array<[string, number]> = [['shallow (d<25)', 0], ['mid (d 25-60)', 25], ['deep (d>60)', 60]];
const rows: Array<{ band: string; before: number; after: number }> = [];
// SCALE 1.0 is what shipped. The candidate is applied in `content/ores.ts`, so
// this sim reads the LIVE figures — if the constants move, this table moves.
for (const [band, minDepth] of BANDS) {
  const dig = meanDig(1, minDepth);
  const old = meanDigShipped(minDepth);
  const handMin = (cellsPerHour * dig) / 60;
  const oldMin = (cellsPerHour * old) / 60;
  const drillMin = (cellsPerHour * dig * DRILL_ORE_SPEED) / 60;
  rows.push({ band, before: oldMin, after: handMin });
  out.push(
    `| ${band} | ${old.toFixed(1)}s | ${dig.toFixed(1)}s | ${oldMin.toFixed(1)} min `
    + `| **${handMin.toFixed(1)} min** | ${drillMin.toFixed(1)} min |`,
  );
}
out.push('');

const worst = Math.max(...rows.map((r) => r.after));
const worstBefore = Math.max(...rows.map((r) => r.before));
const share = worst / 60;
out.push(`**Worst band: ${worstBefore.toFixed(1)} min/hr → ${worst.toFixed(1)} min of every 60 — ${(share * 100).toFixed(0)}% of the hour**`);
out.push('spent holding a single cell to clear what the field produced.');
out.push('');
out.push(`- Under 10% of the hour: an ore is a treat you take when you see one.`);
out.push(`- Over 20%: it is a second job, and the rational play is the one that was reported — skip them.`);
out.push('');
out.push(`Verdict: **${share > 0.20 ? 'A TAX — the report is correct' : share > 0.10 ? 'borderline' : 'a treat'}**`);
out.push('');

// ---------------------------------------------------------------------------
// 3 — the ceiling the fix must not move
// ---------------------------------------------------------------------------
out.push('## 3 — what a faster dig can and cannot change', '');
out.push('| quantity | set by | moves with digSec? |', '|---|---|---|');
out.push('| pockets/hour | `ORE_SPAWN_CHANCE` × 3600, capped | **no** |');
out.push('| charge per pocket | `harvestCell` — what the rock banked | **no** |');
out.push('| guaranteed drop rolls | `def.rolls`, per pocket opened | **no** |');
out.push('| depth bonus on the roll | `def.depthMult`, per pocket opened | **no** |');
out.push('| minutes/hour of attention | `digSec` ÷ `oreRate` | **yes — only this** |');
out.push('');
out.push('So the drop economy pillar 1 binds is a function of POCKETS TAKEN, and');
out.push('pockets taken is bounded above by pockets produced. A faster dig moves the');
out.push('player toward that pre-existing bound; it cannot move the bound. The');
out.push('honest way to say it: this is not a buff, it is the removal of a tax that');
out.push('was stopping players from collecting a ceiling the design already set.');
out.push('');

mkdirSync('sim-out', { recursive: true });
writeFileSync('sim-out/ore-time.md', out.join('\n'));
console.log(out.join('\n'));
