/**
 * B6 — THE PAYOFF FLOOR, measured. For systems with NO consumed output the
 * floor demands ≥5% of engaged power at their home era. Same instrument as
 * echo-share.ts: replay the same snapshot 900s active, with and without the
 * system's contribution, and read the difference.
 *
 *   npx tsx scripts/b6-floor.ts sim-out/snap-b2.json
 *
 * Results append to sim-out/b6-floor.md.
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createEngine, type Engine, type GameState } from '../src/engine';
import { deserialize } from '../src/engine/save/codec';
import { chipCurrencyId } from '../src/engine/shells';

const file = process.argv[2];
if (!file) throw new Error('usage: b6-floor.ts <snapshot>');
const WINDOW = 900;
const raw = readFileSync(file, 'utf8');

type Strip = (s: GameState) => void;
// Only the systems WITHOUT a consumed output — everything else clears the
// floor structurally (its output is demanded somewhere).
const STRIPS: Record<string, Strip> = {
  museumCases: (s) => { s.museum.completed = []; },
  titlesEquip: (s) => { s.guild.titles.equipped = null; },
};

function chipFullest(engine: Engine, n: number): void {
  const s = engine.getState();
  for (let k = 0; k < n; k++) {
    let best = -1;
    let bestCharge = 0;
    for (let i = 0; i < s.face.cells.length; i++) {
      const c = s.face.cells[i]!;
      if (c > bestCharge) { bestCharge = c; best = i; }
    }
    if (best < 0 || bestCharge < 1) break;
    engine.dispatch({ type: 'chip', cell: best });
  }
}

function run(strip: Strip | null): number {
  const engine = createEngine({ nowMs: 0 });
  const st = deserialize(raw);
  engine.dispatch({ type: 'hydrate', state: st, nowMs: 0 });
  const s = engine.getState();
  if (strip) strip(s);
  const cur = chipCurrencyId(s);
  const before = s.totals[cur]?.toNumber() ?? 0;
  for (let sec = 1; sec <= WINDOW; sec++) {
    chipFullest(engine, 2);
    engine.tick(1);
  }
  return ((engine.getState().totals[cur]?.toNumber() ?? 0) - before) / WINDOW;
}

const s0 = deserialize(raw);
const on = run(null);
const rows = [`baseline ${on.toExponential(3)}/s · breach ${s0.shell.breachCount}, shell ${s0.shell.current}, window ${WINDOW}s`];
for (const [name, strip] of Object.entries(STRIPS)) {
  const off = run(strip);
  const share = on > 0 ? 1 - off / on : 0;
  rows.push(`${name.padEnd(18)} carries ${(share * 100).toFixed(1)}% of engaged income here`);
}
mkdirSync('sim-out', { recursive: true });
const out = `\n## ${file}\n` + rows.map((r) => `- ${r}`).join('\n') + '\n';
appendFileSync('sim-out/b6-floor.md', out);
console.log(out);
