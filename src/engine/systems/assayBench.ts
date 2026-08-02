/**
 * THE ASSAY BENCH (§9.3) and THE ASSAY CALL (§40.3).
 *
 * TWO INFORMATION SYSTEMS THAT PULL AGAINST EACH OTHER, which is the only
 * reason either is interesting.
 *
 *   THE BENCH NARROWS. Spend time and SURGE to sample a station: you learn its
 *   rock class, its seam materials with purity bands, and — at tier III — what
 *   its deep-entry would pay. Its one job under LAW 3 is BURNING FOG OFF THE
 *   GREYED PART OF THE ROLL, one station at a time. It never prints a recipe,
 *   never says "unlock X to see Y", and never lists a thing you have not met.
 *
 *   THE CALL UNSETTLES. Each run the shell's band FAVOURS one material, and the
 *   §1.1 re-roll changes it at every Collapse. So the Roll's contents are
 *   knowable and the answer to "what is worth digging for" is not — information
 *   narrows it and nothing settles it. That is the fix §40.3 records for the
 *   Assay Call, which used to be a SIGHT-3 gate and therefore a one-time
 *   purchase rather than a live question.
 *
 * PILLAR 2 IS UNTOUCHED AND THIS IS THE LOAD-BEARING SENTENCE. The Call changes
 * WHICH material a drop rolls, never how much charge the field grows or how
 * much Dust a chip pays. There is no path from anything here to `cellCap`,
 * `cellRegen` or `chipYield`, so `dpsMax = W·H·regen·Y` cannot move. Drops sit
 * outside the income path by construction; the Call redistributes them and
 * mints nothing. A test asserts exactly this.
 *
 * WHAT IS NOT BUILT, ON PURPOSE: staking and standing samples (§9.3's fourth
 * and fifth rungs). They are the "survives Collapse" half, and a sample that
 * survives a Collapse is only meaningful once the re-roll it has to outlive is
 * proven — which is the Call, this pass.
 */
import type { EngineCtx, GameState } from '../types';
import { shellRoll, contentsOf, ensureRoll } from './roll';
import { fire, canFire } from './plant';
import { materialDef, bandOf, type PurityBand } from '../materials';
import { traitsOf } from '../traits';
import { DEEP_GATES } from './compaction';
import type { StationDef } from '../content/shell1/roll';

// ---------------------------------------------------------------------------
// The numbers
// ---------------------------------------------------------------------------

/** Seconds a sample takes at each bench tier. Deeper benches read faster. */
export const SAMPLE_SECONDS = [0, 45, 34, 26];

/**
 * SURGE PER SAMPLE, and it is Surge rather than Flow on purpose. A sample is
 * one hard pull on the bank and then nothing — the Crusher's shape, not the
 * Kiln's — so a plant built for sustained draw finds the Bench expensive and a
 * plant with a Reservoir finds it cheap. That is §3's claim doing work in a
 * system that is not a machine.
 */
export const SAMPLE_SURGE = 9;

export const MAX_BENCH_TIER = 3;

/** What each tier can do. Capability, never a number (§15.4's grammar). */
export const BENCH_CAPABILITY = [
  'not built',
  'samples the station you are standing at',
  'samples any station ahead of you',
  'reads the deep-entry a station would pay',
] as const;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface AssayBenchState {
  /** 0 = not built. */
  tier: number;
  /** The sample in progress, if any. */
  running: { stationId: string; endsAtPlaySec: number } | null;
  /** Stations whose fog is burnt off. Cleared by a Collapse — the CONTENTS it
   *  read are re-rolled, so the reading is stale by definition. */
  sampled: string[];
  /** The material this run's band favours, and the run it was rolled for. */
  call: { materialId: string; rolls: number } | null;
}

export function defaultAssayBenchState(): AssayBenchState {
  return { tier: 0, running: null, sampled: [], call: null };
}

export function ensureAssayBench(state: GameState): AssayBenchState {
  const a = (state.assayBench ??= defaultAssayBenchState());
  a.sampled ??= [];
  if (typeof a.tier !== 'number') a.tier = 0;
  return a;
}

export function benchTier(state: GameState): number {
  return ensureAssayBench(state).tier;
}

export function benchBuilt(state: GameState): boolean {
  return benchTier(state) > 0;
}

// ---------------------------------------------------------------------------
// THE ASSAY CALL — what the band favours today
// ---------------------------------------------------------------------------

/**
 * THE POOL IS THE SHELL'S OWN SEAMS, not the whole registry. A Call naming a
 * material the shell cannot produce is noise, and a Call naming a deep-entry
 * material would be telling you to do the thing compaction already tells you to
 * do. Both are excluded by taking the union of what the Roll's stations hold.
 */
export function callPool(state: GameState): string[] {
  const out = new Set<string>();
  for (const def of shellRoll(state)) {
    for (const id of def.seams ?? []) out.add(id);
  }
  return [...out].sort();
}

/**
 * ROLL THE CALL FOR THIS RUN. Keyed to `roll.rolls` — the re-roll counter — so
 * it changes exactly when the stations' contents change and never drifts out of
 * step with them. Re-reading is free and idempotent; only a Collapse moves it.
 */
export function ensureCall(state: GameState, rng: () => number = Math.random): string | null {
  ensureRoll(state);
  const a = ensureAssayBench(state);
  const rolls = state.roll?.rolls ?? 0;
  if (a.call && a.call.rolls === rolls) return a.call.materialId;
  const pool = callPool(state);
  if (pool.length === 0) { a.call = null; return null; }
  const pick = pool[Math.floor(rng() * pool.length)]!;
  a.call = { materialId: pick, rolls };
  return pick;
}

export function assayCall(state: GameState): string | null {
  return ensureAssayBench(state).call?.materialId ?? null;
}

/**
 * HOW MUCH THE FAVOUR IS WORTH, as a weight on the drop table — NEVER as a
 * bonus to the number of drops. A favoured material is likelier to be the one
 * that comes up; nothing here makes more come up. That distinction is the whole
 * of pillar 2 in this system.
 */
export const CALL_WEIGHT = 2.5;

// ---------------------------------------------------------------------------
// THE BENCH — sampling
// ---------------------------------------------------------------------------

export interface ActionResult { ok: boolean; reason?: string }

/** Stations this bench is allowed to point at, given its tier. */
export function sampleable(state: GameState): StationDef[] {
  const tier = benchTier(state);
  if (tier <= 0) return [];
  const defs = shellRoll(state);
  if (tier === 1) {
    // Tier I reads the ground under your feet and nothing else.
    let here: StationDef | null = null;
    for (const d of defs) if (d.depth <= state.depth && (!here || d.depth > here.depth)) here = d;
    return here ? [here] : [];
  }
  // Tier II and up read ahead — which is the only place fog exists.
  return defs.filter((d) => !isSampled(state, d.id));
}

export function isSampled(state: GameState, id: string): boolean {
  return ensureAssayBench(state).sampled.includes(id);
}

export function sampleRunning(state: GameState): { stationId: string; endsAtPlaySec: number } | null {
  return ensureAssayBench(state).running;
}

export function sampleSecondsLeft(state: GameState): number {
  const r = sampleRunning(state);
  return r ? Math.max(0, r.endsAtPlaySec - state.stats.playTimeSec) : 0;
}

export function beginSample(state: GameState, ctx: EngineCtx, stationId: string): ActionResult {
  const a = ensureAssayBench(state);
  if (a.tier <= 0) return { ok: false, reason: 'No bench' };
  if (a.running) return { ok: false, reason: 'A sample is already running' };
  if (isSampled(state, stationId)) return { ok: false, reason: 'Already read' };
  if (!sampleable(state).some((d) => d.id === stationId)) {
    return { ok: false, reason: a.tier === 1 ? 'This bench only reads where you stand' : 'Not on this Roll' };
  }
  // THE SURGE COMES OFF THE BANK, all at once, and refuses rather than running
  // slow — a half-read station is not a thing (§3.1's all-or-nothing).
  if (!canFire(state, 'assayBench')) {
    return { ok: false, reason: `The bank is short — a sample wants ${SAMPLE_SURGE} Surge` };
  }
  if (!fire(state, 'assayBench')) return { ok: false, reason: 'The bank is short' };
  a.running = {
    stationId,
    endsAtPlaySec: state.stats.playTimeSec + SAMPLE_SECONDS[Math.min(a.tier, MAX_BENCH_TIER)]!,
  };
  ctx.dirty();
  return { ok: true };
}

export function tickAssayBench(state: GameState, ctx: EngineCtx): void {
  const a = ensureAssayBench(state);
  if (!a.running) return;
  if (state.stats.playTimeSec < a.running.endsAtPlaySec) return;
  const id = a.running.stationId;
  a.running = null;
  if (!a.sampled.includes(id)) a.sampled.push(id);
  ctx.emit({ type: 'assaySample', stationId: id } as never);
  ctx.dirty();
}

/** A Collapse re-rolls what stations hold, so every reading of them is stale. */
export function clearSamples(state: GameState): void {
  const a = ensureAssayBench(state);
  a.sampled = [];
  a.running = null;
}

// ---------------------------------------------------------------------------
// What a sample SAYS
// ---------------------------------------------------------------------------

export interface SampleSeam {
  materialId: string;
  name: string;
  band: PurityBand;
  traits: string[];
}

export interface SampleReport {
  stationId: string;
  name: string;
  depth: number;
  /** The rock class — the station's type, in the Roll's own vocabulary. */
  rockClass: string;
  seams: SampleSeam[];
  /** Tier III only. Null below it — and ABSENT, not greyed (LAW 3). */
  deepEntry: { materialId: string; name: string; at: number; traits: string[] }[] | null;
}

/**
 * THE READING. Only ever describes a station that has actually been sampled —
 * there is no "preview" of an unsampled one, because that would be the recipe
 * browser LAW 3 forbids wearing an information system's clothes.
 */
export function sampleReport(state: GameState, stationId: string): SampleReport | null {
  if (!isSampled(state, stationId)) return null;
  const def = shellRoll(state).find((d) => d.id === stationId);
  if (!def) return null;
  const held = contentsOf(state, stationId);
  const pool = held.seam ? [held.seam] : (def.seams ?? []);
  const seams: SampleSeam[] = pool.map((id) => {
    let name = id;
    try { name = materialDef(id).name; } catch { /* a def that has gone missing must not take the panel down */ }
    return {
      materialId: id,
      name,
      // The BAND, not the number: a sample tells you what class of stone is in
      // there, and the exact purity is what digging it is for.
      band: bandOf(bandMidpoint(id)),
      traits: traitsOf(id).slice(),
    };
  });
  return {
    stationId,
    name: def.name,
    depth: def.depth,
    rockClass: def.type,
    seams,
    deepEntry: benchTier(state) >= 3 ? deepEntryReading() : null,
  };
}

/** A representative purity for a material, so a sample can name a BAND. */
function bandMidpoint(id: string): number {
  try {
    const r = materialDef(id).rarity;
    return r === 'common' ? 32 : r === 'rich' ? 48 : r === 'pure' ? 62 : r === 'flawless' ? 76 : 88;
  } catch {
    return 50;
  }
}

/**
 * THE DEEP-ENTRY PREDICTION (tier III). It reads the gates that actually exist
 * rather than restating a table — if `DEEP_GATES` changes, this changes with it,
 * which is the difference between a prediction and a printed sheet.
 */
function deepEntryReading(): { materialId: string; name: string; at: number; traits: string[] }[] {
  return [...DEEP_GATES]
    .sort((a, b) => a.at - b.at)
    .map((g) => {
      let name = g.materialId;
      try { name = materialDef(g.materialId).name; } catch { /* keep the id */ }
      return { materialId: g.materialId, name, at: g.at, traits: traitsOf(g.materialId).slice() };
    });
}

/** Fog burnt off, as a fraction — what the panel prints as progress. */
export function fogBurnt(state: GameState): { read: number; total: number } {
  const defs = shellRoll(state);
  return { read: defs.filter((d) => isSampled(state, d.id)).length, total: defs.length };
}
