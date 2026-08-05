/**
 * THE OTHER THREE PLANTS — §3.2's table, finished.
 *
 * §3.2 gives every shell a power plant with its own SHAPE, and until A.95 all
 * seven ran the Hearth. A.95 built two of the six (the Coil, the Boiler) as
 * §13 machines. THESE THREE ARE NOT MACHINES: §13's map of forty-one does not
 * contain a Bloom, a Null, or a Prism ceiling, so none of them is a
 * construction event. They are what the Hearth is — a shape the shell's own
 * system already has, read rather than built:
 *
 *   VERDANCE  THE BLOOM     Flow, scales with cells you refuse to mine
 *   GLASSMERE THE PRISM     Flow, with a Surge CEILING set by unallocated bands
 *   HOLLOW    THE NULL      Flow that grows as the Silence worsens
 *
 * Each reads one number its shell has had for phases: `growth.stage` (vined
 * cells), the Prism's allocation, and `hollow.silence`. Nothing here writes to
 * any of them — every locked signature is read-only from this file.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY READER HAS A SHELL CONDITION, and that is the brief's own instruction
 * after the last pass. `boilerSurge` had none and a Cinder Boiler banked Surge
 * while the player stood in Ferrite, which is what blew the Coil's measurement.
 * So each shape below asks `…Shell(state)` FIRST, and each of those is "in the
 * shell, or carrying its signature" — §3.2's "because signatures carry down on
 * Breach, your power profile is a BUILD", stated once and used three times.
 *
 * AND ONLY ONE OF THE THREE CAN BE DEAD. The Boiler is a machine at Cinder 40,
 * so Cinder without one has no plant. Of these, only Glassmere has a machine in
 * the path (the Prism, at 20) — Verdance's vines sprout on their own and the
 * Hollow's Silence accrues on its own, so those two have a FLOOR and grow from
 * it. Forcing all three to be dead would mean gating a shell's power on
 * something it grows by itself, which is a wall with no door.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PILLAR 2. A plant is a ceiling on how fast you REALISE dpsMax, never a term
 * in it. There is no path from this file to `cellCap`, `cellRegen` or
 * `chipYield`, and a test drives every shape to maximum and reads the ceiling.
 */
import type { GameState } from '../types';
import { currentShell } from '../shells';

import { BAND_COUNT, INTENSITY, prismBuilt, spent } from './prism';

// ---------------------------------------------------------------------------
// Who is at home
// ---------------------------------------------------------------------------

/** In the shell, or carrying its signature down. The one rule, used thrice. */
function athome(state: GameState, shellId: string, signature: string): boolean {
  if (currentShell(state).id === shellId) return true;
  return state.shell?.signatures?.includes(signature) ?? false;
}

export function bloomShell(state: GameState): boolean {
  return athome(state, 'verdance', 'growth');
}

export function prismShell(state: GameState): boolean {
  return athome(state, 'glassmere', 'refraction');
}

export function nullShell(state: GameState): boolean {
  return athome(state, 'hollow', 'absence');
}

// ---------------------------------------------------------------------------
// THE BLOOM — Verdance
// ---------------------------------------------------------------------------

/**
 * FLOW PER VINED CELL. Sized against the Hearth: a face left half alone
 * (18 of 36 cells) reads about what a warm Kiln does, so a farmer's plant and a
 * stoker's plant are worth roughly the same and are good at different things —
 * which is the entire argument of §3.2 and the reason the number is small.
 */
export const BLOOM_PER_VINE = 0.14;

/** Cells nobody has mined. `growth.ts`'s own array, read and never written. */
export function vinedCells(state: GameState): number {
  const stage = state.growth?.stage ?? [];
  let n = 0;
  for (const s of stage) if ((s ?? 0) > 0) n += 1;
  return n;
}

/** Verdance's sustained draw. A floor, and then what you left standing. */
export function bloomFlow(state: GameState): number {
  if (!bloomShell(state)) return 0;
  return PLANT_FLOOR + BLOOM_PER_VINE * vinedCells(state);
}

// ---------------------------------------------------------------------------
// THE PRISM — Glassmere
// ---------------------------------------------------------------------------

/**
 * §3.2: "Flow, with a Surge ceiling set by unallocated bands."
 *
 * THE TRADE IS THE POINT, and it lands on a system that already exists. A.93's
 * Prism holds three points of INTENSITY across six bands; spending them lights
 * machines and aims the beam. Every point you have NOT spent is burst you keep.
 * So a Glassmere player choosing reach is choosing to give up their Surge, and
 * the two halves of that decision are already on one card.
 */
/**
 * THE SAME FLOOR EVERY PLANT HAS, and it is written out rather than aliased.
 *
 * The first draft was `export const PRISM_FLOOR = HEARTH_FLOOR`, which reads
 * across a documented runtime-only cycle AT MODULE SCOPE — the one thing the
 * rule in `plant.ts` forbids. It worked whenever `plant.ts` happened to load
 * first and threw `Cannot access 'HEARTH_FLOOR' before initialization` when it
 * did not, which a probe found in one run. A test pins the two together, so
 * the number cannot drift without saying so.
 */
export const PLANT_FLOOR = 2.4;
export const PRISM_FLOOR = PLANT_FLOOR;
/** Surge per point of intensity left unspent. */
export const PRISM_SURGE_PER_FREE = 9;
/** ...and per band nobody has lit at all, which is the wider version. */
export const PRISM_SURGE_PER_DARK = 2;

/** Points of intensity not spent on any band. */
export function freeIntensity(state: GameState): number {
  if (!prismBuilt(state)) return 0;
  return Math.max(0, INTENSITY - spent(state));
}

/** Bands carrying nothing at all. */
export function darkBands(state: GameState): number {
  if (!prismBuilt(state)) return 0;
  const p = state.prism?.intensity ?? [];
  let n = 0;
  for (let b = 0; b < BAND_COUNT; b++) if ((p[b] ?? 0) <= 0) n += 1;
  return n;
}

/** Glassmere's sustained draw. ZERO without a Prism — the shell's own machine. */
export function prismFlow(state: GameState): number {
  if (!prismShell(state)) return 0;
  if (!prismBuilt(state)) return 0;
  return PLANT_FLOOR;
}

/** ...and the ceiling on the burst, which is what you did NOT aim. */
export function prismSurge(state: GameState): number {
  if (!prismShell(state)) return 0;
  if (!prismBuilt(state)) return 0;
  return PRISM_SURGE_PER_FREE * freeIntensity(state) + PRISM_SURGE_PER_DARK * darkBands(state);
}

// ---------------------------------------------------------------------------
// THE NULL — Hollow
// ---------------------------------------------------------------------------

/**
 * §3.2: "Flow that grows as the Silence worsens."
 *
 * And that is the Hollow's whole management question restated in the plant:
 * the Silence mutes your carried income as it climbs and pays convexly when you
 * LISTEN, so letting it get loud is already a decision. Now it also decides how
 * fast the plant runs — and listening, which is the thing you do about it,
 * drops the plant back to its floor in the same instant it pays.
 */
export const NULL_PER_SILENCE = 0.045;

/** Hollow's sustained draw. A floor, and then however quiet you dared let it get. */
export function nullFlow(state: GameState): number {
  if (!nullShell(state)) return 0;
  return PLANT_FLOOR + NULL_PER_SILENCE * (state.hollow?.silence ?? 0);
}

// ---------------------------------------------------------------------------
// What the plant asks
// ---------------------------------------------------------------------------

/**
 * THE SHELL'S OWN FLOW, or null if this shell has no shape of its own and
 * should keep the Hearth. `plant.ts` owns the decision; this owns the answers.
 */
export function shellFlow(state: GameState): number | null {
  if (bloomShell(state)) return bloomFlow(state);
  if (prismShell(state)) return prismFlow(state);
  if (nullShell(state)) return nullFlow(state);
  return null;
}

/** ...and what any of them adds to the bank. Only Glassmere does. */
export function shellSurge(state: GameState): number {
  return prismSurge(state);
}

/** What the panel says — the UI computes nothing. */
export function shellPlantRead(state: GameState): {
  id: string; name: string; line: string; flow: number; surge: number; live: boolean;
} | null {
  if (bloomShell(state)) {
    return {
      id: 'bloom', name: 'The Bloom',
      line: `${vinedCells(state)} cells left standing`,
      flow: bloomFlow(state), surge: 0, live: true,
    };
  }
  if (prismShell(state)) {
    return {
      id: 'prism', name: 'The Prism',
      line: prismBuilt(state)
        ? `${freeIntensity(state)} intensity unspent · ${darkBands(state)} bands dark`
        : 'No Prism. Nothing here makes power.',
      flow: prismFlow(state), surge: prismSurge(state), live: prismBuilt(state),
    };
  }
  if (nullShell(state)) {
    return {
      id: 'null', name: 'The Null',
      line: `the Silence at ${Math.round(state.hollow?.silence ?? 0)}`,
      flow: nullFlow(state), surge: 0, live: true,
    };
  }
  return null;
}
