import { ensureContentLoaded } from '../src/engine/content';
import { createEngine } from '../src/engine/index';
import { SURGE_FLOOR, SURGE_PER_RANK, demandOf, flowCap, surgeCap } from '../src/engine/systems/plant';
import { allAuthoredStations } from '../src/engine/content/rolls';
import type { GameState } from '../src/engine/types';
ensureContentLoaded();
const s = createEngine({ nowMs: 0 }).getState() as GameState;

console.log('=== SURGE (item 11) ===');
console.log('bare surgeCap          ', surgeCap(s));
console.log('LINE demand            ', JSON.stringify(demandOf('line')));
console.log('PRESS demand           ', JSON.stringify(demandOf('press')));
console.log('can a bare plant fire a Line?', surgeCap(s) >= demandOf('line').surge);
console.log('ranks needed for a Line', Math.ceil((demandOf('line').surge - SURGE_FLOOR) / SURGE_PER_RANK));

console.log('\n=== FLOW / the plant shape (§3.2) ===');
s.kiln.built = false;
console.log('flowCap, no kiln       ', flowCap(s));
s.kiln.built = true; s.kiln.heat = 0;
console.log('flowCap, cold kiln     ', flowCap(s));
s.kiln.heat = 1;
console.log('flowCap, hot kiln      ', flowCap(s));
for (const shell of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
  s.shell.current = shell;
  console.log(`  ${shell.padEnd(10)} flow ${flowCap(s).toFixed(2)}  surge ${surgeCap(s)}`);
}

console.log('\n=== UNCLAIMED WRECKS in the four shells ===');
for (const w of allAuthoredStations().filter((x) => x.def.type === 'wreck')) {
  if (!['cinder', 'verdance', 'ferrite'].includes(w.shellId)) continue;
  console.log(`  ${w.shellId.padEnd(9)} ${String(w.def.depth).padStart(4)} ${w.def.name.padEnd(22)} ${w.def.wreck}`);
}
