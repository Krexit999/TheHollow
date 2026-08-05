import { ensureContentLoaded } from '../src/engine/content/index';
ensureContentLoaded();
import { MACHINE_DEMAND } from '../src/engine/systems/plant';
import { allShells } from '../src/engine/shells';
const k = Object.keys(MACHINE_DEMAND);
console.log(k.length, k.join(' '));
for (const s of allShells()) console.log(s.id, s.floorDepth);
