/**
 * Modifier / multiplier pipeline.
 *
 * Every system that changes a number registers a NAMED source into a bucket
 * (dust yield, regen, drill speed, ...). The engine multiplies (or sums) the
 * bucket when it needs the value; the UI can call `breakdown()` to show the
 * player exactly where a number comes from. Sources are data + a pure
 * value(state) function, so the registry itself holds no mutable game state.
 */
import { D, Decimal, ONE } from './decimal';
import type { GameState } from './types';

export type Bucket =
  | 'dustYield'      // multiplies dust from every chip (manual, drill, fracture)
  | 'brickYield'     // multiplies kiln brick output
  | 'regen'          // multiplies cell charge regen
  | 'cap'            // multiplies cell charge cap
  | 'kilnRate'       // multiplies kiln dust intake rate
  | 'kilnHeatRamp'   // multiplies how fast the kiln heats up
  | 'drillSpeed'     // multiplies drill strike frequency
  | 'drillPower'     // multiplies charge per drill strike
  | 'xpGain'         // multiplies all Delver XP
  | 'descendCost'    // multiplies dust cost to descend (reductions < 1)
  | 'dropRate'       // multiplies material drop chance
  | 'assaySpeed'     // divides Assay Table survey time
  | 'chainPower'     // multiplies polarity chain growth (the 0.35 term)
  | 'offlineEffAdd'  // ADDS to offline efficiency (Persistence lives here)
  | 'oreChance'      // multiplies how often a richer pocket forms in the rock
  | 'oreRarity';     // leans the pocket-type roll toward the rarer seams

/**
 * Every bucket, enumerable. The union above is the compile-time truth; this is
 * the same list at runtime, and a test asserts the two never drift.
 */
export const ALL_BUCKETS = [
  'dustYield', 'brickYield', 'regen', 'cap', 'kilnRate', 'kilnHeatRamp',
  'drillSpeed', 'drillPower', 'xpGain', 'descendCost', 'dropRate',
  'assaySpeed', 'chainPower', 'offlineEffAdd',
  'oreChance', 'oreRarity',
] as const satisfies readonly Bucket[];

const BUCKET_SET: ReadonlySet<string> = new Set<string>(ALL_BUCKETS);

/** Runtime membership test — the gate for any bucket name that arrives as a string. */
export function isBucket(name: string): name is Bucket {
  return BUCKET_SET.has(name);
}

/**
 * WHERE EACH BUCKET IS CONSUMED.
 *
 * A modifier source registered into a bucket nobody reads is a silent no-op —
 * it computes, it shows up in a breakdown, and it changes nothing. That is the
 * `dropChance` / `cellCap` failure with the name spelled right, and the type
 * system cannot see it, because a valid bucket that no code reads is still a
 * valid bucket.
 *
 * So consumption is DECLARED here and checked two ways: `assertModifierIntegrity()`
 * fails at startup if a bucket has sources but no declared consumer, and a test
 * scans the engine source to prove these claims are actually true.
 */
const BUCKET_CONSUMERS: Record<Bucket, string> = {
  dustYield: 'systems/face.ts — dust per chip',
  brickYield: 'systems/kiln.ts — brick output',
  regen: 'systems/face.ts — cell charge regen',
  cap: 'systems/face.ts — cell charge cap',
  kilnRate: 'systems/kiln.ts — dust intake rate',
  kilnHeatRamp: 'systems/kiln.ts — heat-up speed',
  drillSpeed: 'systems/drills.ts — strike frequency',
  drillPower: 'systems/drills.ts — charge per strike',
  xpGain: 'systems/xp.ts — Delver XP',
  descendCost: 'systems/depthSys.ts — cost to descend',
  dropRate: 'systems/drops.ts — material drop chance',
  assaySpeed: 'systems/drops.ts — Assay survey time',
  chainPower: 'systems/polarity.ts — chain growth',
  offlineEffAdd: 'systems/offline.ts — offline efficiency',
  oreChance: 'systems/ores.ts — how often a pocket forms',
  oreRarity: 'systems/ores.ts — the pocket-type roll',
};

/** Buckets that sum instead of multiply. */
const ADDITIVE_BUCKETS: ReadonlySet<Bucket> = new Set<Bucket>(['offlineEffAdd']);

/** Is this bucket summed rather than multiplied? Exported so registrars can ask
 * instead of hardcoding `1 + bonus`, which is how the additive bug kept
 * reappearing (relics, then latently in the Museum). */
export function isAdditiveBucket(bucket: Bucket): boolean {
  return ADDITIVE_BUCKETS.has(bucket);
}

/** The neutral value for a bucket: 0 for additive, 1 for multiplicative. */
export function neutralFor(bucket: Bucket): number {
  return ADDITIVE_BUCKETS.has(bucket) ? 0 : 1;
}

/**
 * Fold a raw bonus into the right shape for its bucket.
 *
 * `1 + bonus` is correct for a multiplier and WRONG for an additive bucket,
 * where it adds a flat 1.0. That mistake shipped in the relic affixes, was
 * fixed there, and was still sitting latent in the Museum's identical
 * registration — invisible only because no case had yet used `offlineEffAdd`.
 * Registrars should call this rather than write the arithmetic themselves.
 */
export function foldBonus(bucket: Bucket, bonus: number): number {
  return ADDITIVE_BUCKETS.has(bucket) ? bonus : 1 + bonus;
}

export interface ModifierSource {
  id: string;
  /** Human-readable — shown verbatim in breakdown tooltips. */
  label: string;
  bucket: Bucket;
  /**
   * Current value. Multiplicative buckets: 1 = no effect.
   * Additive buckets: 0 = no effect. May return number or Decimal.
   */
  value: (state: GameState) => number | Decimal;
}

const registry: ModifierSource[] = [];
const byBucket = new Map<Bucket, ModifierSource[]>();

export function registerModifier(src: ModifierSource): void {
  if (registry.some((m) => m.id === src.id)) {
    throw new Error(`Duplicate modifier id: ${src.id}`);
  }
  registry.push(src);
  const list = byBucket.get(src.bucket) ?? [];
  list.push(src);
  byBucket.set(src.bucket, list);
}

/**
 * Register from a bucket name that is only known as a STRING.
 *
 * The typed `registerModifier` is the default and should be used everywhere a
 * bucket is written literally — an invalid name is then a compile error. This
 * exists for the handful of registrars that iterate over content definitions
 * and genuinely hold a string, and it THROWS on a name that is not a bucket
 * rather than registering into nothing.
 *
 * `dropChance` and `cellCap` would have died here, loudly, on the first boot.
 */
export function registerModifierChecked(
  src: Omit<ModifierSource, 'bucket'> & { bucket: string },
): void {
  if (!isBucket(src.bucket)) {
    throw new Error(
      `Modifier '${src.id}' targets '${src.bucket}', which is not a modifier bucket. ` +
      `Valid buckets: ${ALL_BUCKETS.join(', ')}`,
    );
  }
  registerModifier({ ...src, bucket: src.bucket });
}

/**
 * Fail the boot if anything registered into a bucket nothing consumes.
 *
 * Called from `ensureContentLoaded()` once every registrar has run. The type
 * system guarantees the NAME is real; this guarantees the name is WIRED. Those
 * are different failures and only one of them is a compile error.
 */
export function assertModifierIntegrity(): void {
  const problems: string[] = [];
  for (const [bucket, sources] of byBucket) {
    if (!BUCKET_CONSUMERS[bucket]) {
      problems.push(
        `${sources.length} source(s) register into '${bucket}', which no system reads — ` +
        `they compute, show in breakdowns, and change nothing`,
      );
    }
  }
  // The reverse is not an error: a bucket may legitimately be read before any
  // content registers into it (an empty bucket returns its neutral value).
  if (problems.length > 0) {
    throw new Error('Modifier integrity:\n  ' + problems.join('\n  '));
  }
}

/** Which buckets currently have at least one registered source. */
export function bucketsWithSources(): Bucket[] {
  return [...byBucket.keys()];
}

/** The declared consumer of a bucket — read by the integrity test. */
export function consumerOf(bucket: Bucket): string {
  return BUCKET_CONSUMERS[bucket];
}

/** Test-only: wipe the registry so content can re-register cleanly. */
export function clearModifiers(): void {
  registry.length = 0;
  byBucket.clear();
}

export function computeBucket(state: GameState, bucket: Bucket): Decimal {
  const sources = byBucket.get(bucket);
  const additive = ADDITIVE_BUCKETS.has(bucket);
  let acc = additive ? new Decimal(0) : ONE;
  if (!sources) return acc;
  for (const src of sources) {
    const v = D(src.value(state));
    acc = additive ? acc.add(v) : acc.mul(v);
  }
  return acc;
}

export interface BreakdownEntry {
  id: string;
  label: string;
  value: Decimal;
}

/**
 * Introspection for the UI: every source currently affecting a bucket.
 * Sources at their neutral value (x1 / +0) are filtered out.
 */
export function breakdown(state: GameState, bucket: Bucket): BreakdownEntry[] {
  const sources = byBucket.get(bucket) ?? [];
  const neutral = ADDITIVE_BUCKETS.has(bucket) ? 0 : 1;
  const out: BreakdownEntry[] = [];
  for (const src of sources) {
    const v = D(src.value(state));
    if (!v.eq(neutral)) out.push({ id: src.id, label: src.label, value: v });
  }
  return out;
}

/**
 * Per-tick cache. The engine invalidates it whenever an action, achievement
 * or level-up could change a modifier; between invalidations bucket lookups
 * are O(1), which is what keeps the sim harness fast.
 */
export class ModifierCache {
  private cache = new Map<Bucket, Decimal>();

  invalidate(): void {
    this.cache.clear();
  }

  get(state: GameState, bucket: Bucket): Decimal {
    let v = this.cache.get(bucket);
    if (!v) {
      v = computeBucket(state, bucket);
      this.cache.set(bucket, v);
    }
    return v;
  }
}
