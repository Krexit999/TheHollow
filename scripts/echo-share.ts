/**
 * ECHO-SHARE — what is the echo layer worth during engaged play?
 *
 * The echo layer is everything a Breach pays: carried signatures, Resonant
 * Memory, Foundry slots, and (B3) attended confluences. This measures its
 * share of engaged income by replaying the SAME snapshot twice — once as-is,
 * once with the layer stripped — under identical active play, then reading
 * the difference. Per-component strips attribute the total.
 *
 *   npx tsx scripts/sim.ts --hours 10 --policy active --quiet \
 *       --snap-breach 2 --snap-out sim-out/snap-b2.json --out sim-out/es.csv
 *   npx tsx scripts/echo-share.ts sim-out/snap-b2.json --window 900
 *
 * B3 gate: total share 15-25% post-Breach-2 (was ~3-8% before the slots).
 * Results append to sim-out/echo-share.md (read next session, per rules).
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createEngine, type Engine, type GameState } from '../src/engine';
import { deserialize } from '../src/engine/save/codec';
import { chipCurrencyId } from '../src/engine/shells';

const file = process.argv[2];
if (!file) throw new Error('usage: echo-share.ts <snapshot> [--window sec]');
const wi = process.argv.indexOf('--window');
const WINDOW = wi >= 0 ? Number(process.argv[wi + 1]) : 900;

const raw = readFileSync(file, 'utf8');

type Strip = (s: GameState) => void;
const STRIPS: Record<string, Strip> = {
  // Each strip removes ONE component; 'all' removes the whole layer.
  signatures: (s) => {
    s.shell.signatures = [];
    s.shell.resonantMemory = 0;
  },
  foundry: (s) => {
    s.foundry.slots = 0;
    s.foundry.installed = [];
  },
  attention: (s) => {
    s.confluences.slots = [];
  },
  all: (s) => {
    STRIPS['signatures']!(s);
    STRIPS['foundry']!(s);
    STRIPS['attention']!(s);
  },
};

/** Chip the fullest cells n times — the sim harness's active hand, in small. */
function chipFullest(engine: Engine, n: number): void {
  const s = engine.getState();
  for (let k = 0; k < n; k++) {
    let best = -1;
    let bestCharge = 0;
    for (let i = 0; i < s.face.cells.length; i++) {
      const c = s.face.cells[i]!;
      if (c > bestCharge) {
        bestCharge = c;
        best = i;
      }
    }
    if (best < 0 || bestCharge < 1) break;
    engine.dispatch({ type: 'chip', cell: best });
  }
}

/** Engaged income over WINDOW seconds from the snapshot, with a strip applied. */
function run(strip: Strip | null): { perSec: number; currency: string } {
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
  const after = engine.getState().totals[cur]?.toNumber() ?? 0;
  return { perSec: (after - before) / WINDOW, currency: cur };
}

const on = run(null);
const rows: string[] = [];
rows.push(`shell chip currency: ${on.currency} | engaged income ${on.perSec.toExponential(3)}/s | window ${WINDOW}s`);
for (const [name, strip] of Object.entries(STRIPS)) {
  const off = run(strip);
  const share = on.perSec > 0 ? 1 - off.perSec / on.perSec : 0;
  rows.push(`strip ${name.padEnd(10)} -> ${off.perSec.toExponential(3)}/s | that component carries ${(share * 100).toFixed(1)}%`);
}

const s0 = deserialize(raw);
const header =
  `\n## ${new Date().toISOString()} — ${file}\n` +
  `breach ${s0.shell.breachCount}, shell ${s0.shell.current}, ` +
  `signatures [${s0.shell.signatures.join(', ')}], resonantMemory ${s0.shell.resonantMemory}, ` +
  `slots ${JSON.stringify(s0.confluences.slots)}, found ${s0.confluences.found.length}\n`;
mkdirSync('sim-out', { recursive: true });
appendFileSync('sim-out/echo-share.md', header + rows.map((r) => `- ${r}`).join('\n') + '\n');
console.log(header + rows.map((r) => `- ${r}`).join('\n'));
