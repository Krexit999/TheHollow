import { ensureContentLoaded } from '../src/engine/content';
import { MATERIALS, materialDef } from '../src/engine/materials';
import { TEMPERS } from '../src/engine/systems/tempering';
import { traitsOf } from '../src/engine/traits';
ensureContentLoaded();
console.log('=== the six quench media, and who can reach them ===');
for (const t of TEMPERS) {
  const d = materialDef(t.medium);
  console.log(`  ${t.id.padEnd(7)} ${t.name.padEnd(16)} medium ${t.medium.padEnd(13)} ${d.shellId.padEnd(10)} ${d.rarity.padEnd(9)} cost ${t.mediumCost}  traits [${traitsOf(t.medium)}]`);
}
console.log('\n=== starred materials (what §13 says the Retort blocks) ===');
for (const m of MATERIALS.filter((x) => x.rarity === 'starred')) {
  console.log(`  ${m.id.padEnd(16)} ${m.shellId.padEnd(10)} worked=${!!m.worked} source=${m.source ?? '-'}`);
}
console.log('\n=== Cinder commons that read as ash/pyre ===');
for (const m of MATERIALS.filter((x) => x.shellId === 'cinder')) {
  console.log(`  ${m.id.padEnd(16)} ${m.rarity.padEnd(9)} worked=${!!m.worked} [${traitsOf(m.id)}]`);
}
