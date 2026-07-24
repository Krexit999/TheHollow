/**
 * THE SHAPE NET — a loaded save can never be missing a slice the code expects.
 *
 * The class of crash this closes: "Cannot read properties of undefined
 * (reading 'push')" — an array (or record) added in some later version that a
 * long-lived save's record never received, because a migration missed one spot
 * or a seed/import predated it. Hunting each field individually is whack-a-mole
 * (A.36 and A.38 both hit instances of it); this walks the CURRENT default
 * state shape and fills anything missing, once, at the only door a save enters
 * through (hydrate).
 *
 * Rules — additive only, never overwrites real data:
 *  - key missing/null where the default has a value → deep-copy the default
 *  - default is an array but the save holds a non-array → []
 *  - both plain objects → recurse
 * Decimals are shared by reference (the engine reassigns, never mutates them).
 */
import { Decimal } from '../decimal';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

function cloneDefault(v: unknown): unknown {
  if (v instanceof Decimal) return v;
  if (Array.isArray(v)) return v.map(cloneDefault);
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) out[k] = cloneDefault(v[k]);
    return out;
  }
  return v;
}

export function ensureStateShape<T>(loaded: T, defaults: T): T {
  const t = loaded as unknown as Record<string, unknown>;
  const d = defaults as unknown as Record<string, unknown>;
  for (const key of Object.keys(d)) {
    const dv = d[key];
    const tv = t[key];
    if (tv === undefined || tv === null) {
      if (dv !== undefined) t[key] = cloneDefault(dv);
      continue;
    }
    if (Array.isArray(dv)) {
      if (!Array.isArray(tv)) t[key] = [];
      continue;
    }
    if (isPlainObject(dv) && isPlainObject(tv)) ensureStateShape(tv, dv);
  }
  return loaded;
}
