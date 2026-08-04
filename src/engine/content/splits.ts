/**
 * SEPARATION — WHAT AN ORE COMES APART INTO (§13, the Centrifuge), A.93.
 *
 * §13: "CENTRIFUGE · SEPARATION · split an ore into components · ~10 split-only
 * materials."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE "~10" IS REAL, AND IT WAS MEASURED BEFORE A ROW WAS WRITTEN.
 *
 * `scripts/material-sources.ts` walks every producing path in the engine — the
 * rarity pools, seams, remains, deep-entry, chains, cures, and every literal or
 * named-constant `addMaterial` in `src/engine` — and asks which materials
 * NOTHING reaches. The answer, against 176 materials:
 *
 *   ELEVEN, and they are the eleven below.
 *
 *   steelcasting / brazecasting / platecasting / polecasting / cryocasting
 *       Ferrite's five castings. `CASTING_IDS` is a canonical exported list and
 *       `keystones.ts:143` REQUIRES one steelcasting — so a keystone gate was
 *       unsatisfiable, which is the sharpest form of this defect: not an unused
 *       material, an unreachable GATE.
 *   lodeframe / setresin / fibercloth / groundlens / glasseal / emberglass
 *       The bench-made exports. `content/exports.ts` says so in its own words:
 *       "`produceExport` / `EXPORT_RECIPES` are GONE (A.72). Every bench-made
 *       export was produced through them, and every one of those benches is
 *       cut." `setresin` has been ledgered as producerless since A.47.
 *
 * So this is not a spec collision — the spine and the codebase AGREE, and the
 * count agrees to within one. These rows are the machine's content, not a
 * re-authoring of somebody else's.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * HOW A SOURCE WAS CHOSEN. Each split reads down from an ore that is ALREADY
 * dug in the shell the component belongs to, at a band a player has by the time
 * the Centrifuge stands (Ferrite 126). Nothing here invents an ore, moves a
 * seam, or touches a rarity gate.
 *
 * ORDER MATTERS, and it is the one thing the tier ladder reads: the FIRST
 * component is what a tier-I machine gives back, so it is the one the ore is
 * mostly made of.
 */
import type { PurityBand } from '../materials';

export interface SplitDef {
  /** The ore that comes apart. */
  from: string;
  /** How many units one spin eats. Always more than it gives back. */
  units: number;
  /** What it comes apart INTO, majority first. */
  out: string[];
  /** One line, in the game's voice, for the panel. */
  line: string;
}

export const SPLITS: SplitDef[] = [
  // ── FERRITE: the five castings and the frame ────────────────────────────
  {
    from: 'lodestone', units: 3, out: ['lodeframe', 'steelcasting'],
    line: 'The stone lets go of its shape before it lets go of its pull.',
  },
  {
    from: 'bluesteel', units: 3, out: ['steelcasting', 'platecasting'],
    line: 'It was folded from two things and it remembers which.',
  },
  {
    from: 'rimeiron', units: 3, out: ['cryocasting', 'steelcasting'],
    line: 'The cold comes out first, and it comes out as something you can hold.',
  },
  {
    from: 'polarite', units: 3, out: ['polecasting', 'lodeframe'],
    line: 'Spun long enough, a pole is just iron that agreed to point.',
  },
  {
    from: 'voltglass', units: 3, out: ['brazecasting', 'platecasting'],
    line: 'What is left when the charge has been thrown to the outside and taken off.',
  },
  {
    from: 'magnetile', units: 3, out: ['platecasting', 'polecasting'],
    line: 'Flat all the way down, which is why it comes apart flat.',
  },
  // ── VERDANCE ────────────────────────────────────────────────────────────
  {
    from: 'resinpearl', units: 3, out: ['setresin', 'fibercloth'],
    line: 'The resin sets on the wall of the drum while it is still going round.',
  },
  {
    from: 'heartwood', units: 3, out: ['fibercloth', 'setresin'],
    line: 'Iron in the middle, thread all the way out. Only one of them stays in the middle.',
  },
  // ── GLASSMERE ───────────────────────────────────────────────────────────
  {
    from: 'prismite', units: 3, out: ['groundlens', 'glasseal'],
    line: 'It was already a lens. Spinning it only stopped it pretending to be a rock.',
  },
  {
    from: 'spectralite', units: 3, out: ['glasseal', 'groundlens'],
    line: 'The seal is the part that never wanted to let the light through.',
  },
  // ── CINDER ──────────────────────────────────────────────────────────────
  {
    /**
     * ONE COMPONENT, AND THAT IS THE MEASUREMENT SPEAKING. Cinder has exactly
     * ONE producerless material (`emberglass`), so this row cannot have a
     * second output without reaching into another shell — which the first
     * draft did, pairing it with Glassmere's `glasseal`, and the same-shell
     * test caught it immediately. A split reads DOWN from an ore into what
     * that ore is made of; a drum that spins Cinder rock into Glassmere stock
     * is a Balance wearing a drum's costume.
     *
     * So the asymmetry is honest: a tier-II Centrifuge buys nothing extra on
     * this one ore, because there is nothing extra in it.
     */
    from: 'obsidianheart', units: 3, out: ['emberglass'],
    line: 'The ember and the glass have been arguing since it cooled. This settles it.',
  },
];

export const SPLIT_BY_ORE = new Map(SPLITS.map((s) => [s.from, s]));

/** Everything the Centrifuge is the only route to — the §13 count, derived. */
export function splitOnly(): string[] {
  return [...new Set(SPLITS.flatMap((s) => s.out))].sort();
}

/** The band a spin's output lands at: the input's, never better. */
export function outBand(band: PurityBand): PurityBand {
  return band;
}
