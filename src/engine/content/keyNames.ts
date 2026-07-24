/**
 * ONE PLACE THAT TURNS AN INTERNAL KEY INTO A REAL NAME.
 *
 * The Museum (and anywhere that shows a `kind:id` key) must never leak the raw
 * id — `hex.supported.mixed` on the wall instead of the chord's name. Each kind
 * has its own def registry with its own accessor, and several of those accessors
 * THROW on a miss (a throw in a render path black-screens the game, see the
 * Refinery crash). So every lookup here is wrapped: unknown ids fall back to a
 * humanised key rather than crashing or leaking the raw string.
 */
import { gemDef } from '../materials';
import { speciesDef } from '../combat/species';
import { CHORD_BY_ID } from './shell1/latticeChords';
import { alloyDef } from './shell2/alloys';
import { SHAPE_EFFECTS } from './shell3/loomSystem';
import { strainDef } from './shell3/greenhouse';
import { BREW_BY_ID } from './shell3/brews';
import { AUTHORED_PUZZLES } from './shell4/bench';

/** 'hex.supported.mixed' → 'Hex Supported Mixed' — the last-resort fallback. */
function humanise(id: string): string {
  return id
    .replace(/[._]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

const safe = (fn: () => string | undefined): string | undefined => {
  try {
    return fn();
  } catch {
    return undefined;
  }
};

/**
 * A display name for a `kind:id` key (or a bare id, treated as unknown). Kinds:
 * species, gem, chord, alloy, shape, strain, brew, lens — the things the Museum
 * and the Codex mount and list. Never throws; never returns the raw key.
 */
export function keyDisplayName(key: string): string {
  const sep = key.indexOf(':');
  if (sep < 0) return humanise(key);
  const kind = key.slice(0, sep);
  const id = key.slice(sep + 1);
  let name: string | undefined;
  switch (kind) {
    case 'species': name = safe(() => speciesDef(id).name); break;
    case 'gem': name = safe(() => gemDef(id).name); break;
    case 'chord': name = CHORD_BY_ID[id]?.name; break;
    case 'alloy': name = safe(() => alloyDef(id).name); break;
    case 'shape': name = SHAPE_EFFECTS[id]?.name; break;
    case 'strain': name = safe(() => strainDef(id).name); break;
    case 'brew': name = BREW_BY_ID.get(id)?.name; break;
    case 'lens': name = AUTHORED_PUZZLES.find((p) => p.id === id)?.name; break;
  }
  return name ?? humanise(id);
}
