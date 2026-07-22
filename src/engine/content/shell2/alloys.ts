/**
 * The 60 alloys of the Crucible. A recipe is a normalized ratio over the five
 * Ferrite metals [Ingot, Flux, Scale, Lodestone, Rime] — a sparse set in a
 * large space. Discovery is by pouring; the Codex hints narrow the search.
 * An alloy's live stat = basePct × purityMult(catalyst) × rankMult(fusions).
 */
import type { Bucket } from '../../modifiers';

export type Ratio = [number, number, number, number, number]; // I F S L R

export interface AlloyDef {
  id: string;
  name: string;
  ratio: Ratio; // primitive (gcd 1)
  bucket: Bucket;
  basePct: number; // percent, negative for descendCost-style reductions
  flavor?: string;
}

export const METALS = ['ingot', 'flux', 'scale', 'lodestone', 'rime'] as const;

const A = (id: string, name: string, ratio: Ratio, bucket: Bucket, basePct: number, flavor?: string): AlloyDef =>
  ({ id, name, ratio, bucket, basePct, flavor });

/**
 * 60 recipes. Families by dominant metal: Ingot=steels, Flux=brazes,
 * Scale=laminates, Lodestone=magnetics, Rime=cryosteels; mixed triples are
 * the strong late finds.
 */
export const ALLOY_DEFS: AlloyDef[] = [
  // --- Steels (Ingot-led) --------------------------------------------------
  A('greysteel', 'Greysteel', [2, 1, 0, 0, 0], 'dustYield', 6, 'The first thing every smith pours. The Codex opens with it.'),
  A('bloomsteel2', 'Bloom Steel', [3, 1, 0, 0, 0], 'kilnRate', 8),
  A('wroughtiron', 'Wroughtiron', [4, 1, 0, 0, 0], 'brickYield', 8),
  A('anvilsteel', 'Anvilsteel', [3, 2, 0, 0, 0], 'dustYield', 8),
  A('shearsteel', 'Shearsteel', [5, 2, 0, 0, 0], 'drillPower', 9),
  A('tampsteel', 'Tampsteel', [2, 0, 1, 0, 0], 'cap', 5),
  A('ledgersteel', 'Ledgersteel', [3, 0, 1, 0, 0], 'xpGain', 6),
  A('mulesteel', 'Mulesteel', [4, 0, 2, 0, 0], 'drillSpeed', 7),
  A('waysteel', 'Waysteel', [3, 0, 0, 1, 0], 'descendCost', -4),
  A('keensteel', 'Keensteel', [5, 0, 0, 2, 0], 'chainPower', 6),
  A('coldiron', 'Coldiron', [3, 0, 0, 0, 1], 'offlineEffAdd', 2),
  A('longiron', 'Longiron', [5, 0, 0, 0, 2], 'regen', 6),
  // --- Brazes (Flux-led) ---------------------------------------------------
  A('quickbraze', 'Quickbraze', [1, 2, 0, 0, 0], 'kilnRate', 7),
  A('lampbraze', 'Lampbraze', [1, 3, 0, 0, 0], 'xpGain', 7),
  A('fatbraze', 'Fatbraze', [2, 3, 0, 0, 0], 'brickYield', 9),
  A('glassbraze', 'Glassbraze', [0, 2, 1, 0, 0], 'assaySpeed', 8),
  A('honeybraze', 'Honeybraze', [0, 3, 1, 0, 0], 'motifGain', 7),
  A('slickbraze', 'Slickbraze', [0, 3, 2, 0, 0], 'drillSpeed', 8),
  A('polebraze', 'Polebraze', [0, 2, 0, 1, 0], 'chainPower', 5),
  A('draftbraze', 'Draftbraze', [0, 4, 0, 1, 0], 'kilnRate', 10),
  A('mistbraze', 'Mistbraze', [0, 3, 0, 0, 1], 'offlineEffAdd', 2.5),
  A('stillbraze', 'Stillbraze', [0, 5, 0, 0, 2], 'regen', 8),
  // --- Laminates (Scale-led) ----------------------------------------------
  A('greyplate', 'Greyplate', [1, 0, 2, 0, 0], 'cap', 6),
  A('fishplate', 'Fishplate', [0, 1, 2, 0, 0], 'dropRate', 7),
  A('roofplate', 'Roofplate', [1, 1, 2, 0, 0], 'brickYield', 8),
  A('millplate', 'Millplate', [0, 0, 3, 1, 0], 'drillPower', 8),
  A('bookplate', 'Bookplate', [0, 1, 3, 0, 0], 'xpGain', 8),
  A('frostplate', 'Frostplate', [0, 0, 3, 0, 1], 'dropRate', 9),
  A('wardplate', 'Wardplate', [1, 0, 3, 0, 1], 'offlineEffAdd', 3),
  A('vaultplate', 'Vaultplate', [2, 0, 4, 0, 1], 'cap', 10),
  // --- Magnetics (Lodestone-led) ------------------------------------------
  A('poleiron', 'Poleiron', [1, 0, 0, 2, 0], 'chainPower', 8, 'The needle of every compass that ever lied.'),
  A('northsteel', 'Northsteel', [2, 0, 0, 3, 0], 'chainPower', 11),
  A('gatemetal', 'Gatemetal', [0, 1, 0, 2, 0], 'descendCost', -6),
  A('spinmetal', 'Spinmetal', [0, 0, 1, 2, 0], 'drillSpeed', 9),
  A('lurestone', 'Lurestone Alloy', [0, 0, 0, 3, 1], 'dropRate', 11),
  A('veinmetal', 'Veinmetal', [1, 1, 0, 3, 0], 'dustYield', 10),
  A('chorusmetal', 'Chorusmetal', [0, 1, 1, 3, 0], 'motifGain', 9),
  A('tidemetal', 'Tidemetal', [0, 0, 2, 3, 0], 'kilnRate', 11),
  // --- Cryosteels (Rime-led) ----------------------------------------------
  A('hoarsteel', 'Hoarsteel', [1, 0, 0, 0, 2], 'offlineEffAdd', 3.5, 'Cold enough to keep working while you sleep.'),
  A('sleepsteel', 'Sleepsteel', [0, 1, 0, 0, 2], 'offlineEffAdd', 4),
  A('glacierine', 'Glacierine', [0, 0, 1, 0, 2], 'regen', 9),
  A('winterbrass', 'Winterbrass', [1, 1, 0, 0, 2], 'cap', 9),
  A('stillmetal', 'Stillmetal', [0, 0, 0, 1, 2], 'assaySpeed', 10),
  A('quietsteel', 'Quietsteel', [1, 0, 1, 0, 3], 'xpGain', 10),
  // --- Named triples — the strong finds ------------------------------------
  A('marrowsteel', 'Marrowsteel', [3, 1, 2, 0, 0], 'dustYield', 12, 'Marrow will not pour it for you. She will, however, watch you try.'),
  A('lodebright', 'Lodebright', [3, 1, 0, 2, 0], 'dustYield', 13),
  A('stormbrass', 'Stormbrass', [2, 2, 0, 1, 0], 'chainPower', 9),
  A('needlelight', 'Needlelight', [1, 2, 0, 2, 0], 'chainPower', 10),
  A('deepbraze', 'Deepbraze', [2, 1, 0, 0, 1], 'descendCost', -7),
  A('rimeway', 'Rimeway', [1, 0, 0, 2, 2], 'descendCost', -9),
  A('harvestiron', 'Harvestiron', [2, 0, 2, 1, 0], 'dropRate', 10),
  A('gleanersteel', "Gleaner's Steel", [1, 1, 2, 1, 0], 'dropRate', 12),
  A('foundrybrass', 'Foundrybrass', [2, 3, 1, 0, 0], 'kilnRate', 13),
  A('surgebraze', 'Surgebraze', [1, 3, 0, 1, 1], 'kilnRate', 14),
  A('archivemetal', 'Archivemetal', [1, 2, 1, 0, 1], 'xpGain', 12),
  A('sablesteel', "Sable's Steel", [2, 1, 1, 1, 1], 'dustYield', 15, 'Her journals give the ratio outright. It reads like a signature.'),
  A('wakemetal', 'Wakemetal', [0, 2, 1, 0, 2], 'offlineEffAdd', 5),
  A('meridian', 'Meridian', [1, 1, 0, 3, 1], 'chainPower', 12),
  A('assayersfriend', "Assayer's Friend", [0, 1, 2, 0, 2], 'assaySpeed', 13),
  A('motherlode', 'Motherlode', [2, 0, 1, 3, 1], 'dropRate', 14, 'Every prospector\'s bedtime story, poured and cooled.'),
];

const byId = new Map(ALLOY_DEFS.map((a) => [a.id, a]));

export function alloyDef(id: string): AlloyDef {
  const def = byId.get(id);
  if (!def) throw new Error(`Unknown alloy: ${id}`);
  return def;
}

/** Normalize a pour to a primitive ratio (divide by gcd). Null if empty. */
export function normalizeRatio(amounts: number[]): Ratio | null {
  const arr = [0, 1, 2, 3, 4].map((i) => Math.max(0, Math.floor(amounts[i] ?? 0))) as Ratio;
  const sum = arr.reduce((a, b) => a + b, 0);
  if (sum <= 0) return null;
  const gcd2 = (a: number, b: number): number => (b === 0 ? a : gcd2(b, a % b));
  const g = arr.reduce((a, b) => (b > 0 ? gcd2(a, b) : a), 0);
  return arr.map((v) => v / (g || 1)) as Ratio;
}

export function matchAlloy(amounts: number[]): AlloyDef | null {
  const norm = normalizeRatio(amounts);
  if (!norm) return null;
  return (
    ALLOY_DEFS.find((a) => a.ratio.every((v, i) => v === norm[i])) ?? null
  );
}

/** L1 distance between primitive ratios — drives the Codex margin hints. */
export function ratioDistance(a: Ratio, b: Ratio): number {
  return a.reduce((acc, v, i) => acc + Math.abs(v - b[i]!), 0);
}
