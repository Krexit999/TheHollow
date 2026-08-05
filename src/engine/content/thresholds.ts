/**
 * §53 — WORLD-CHANGE THRESHOLDS. The shell remembers what you took.
 *
 * Six of them, one per shell, Aleph deliberately excluded (§53 says so out
 * loud: forty depths and already the composite exam; a threshold there would be
 * scenery). Each is crossed by playing normally, never announced, and shows up
 * as a change to a place rather than a change to a number.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ITEM 8'S RULING, AND WHERE IT LANDED. "Thresholds are per-shell-per-world and
 * reset with the world." A.105 reported this as a blocked reset-ladder change,
 * because the six live counters it found — `materials.totalDrops`,
 * `polarity.bestChain`, `growth.fullSince`, `refraction.beamHarvests`,
 * `pressure.ventedTotal`, `hollow.silenceHarvested` — all survive a Recursion,
 * so a second world would open with THE GREAT FLIP already crossed.
 *
 * IT IS NOT A LADDER CHANGE. `doRecursion` builds `initialState()` and then
 * copies the survivors across by name; `doCollapse` and `doBreach` mutate in
 * place. So a slice that Recursion does not name resets with the world for
 * free, and a slice neither of the other two names survives them for free.
 * `state.thresholds` is that slice. Nothing in the ladder moved — the fix was
 * WHERE the counter lives, which is why the ledger row was right to stop and
 * ask rather than key a threshold off a global.
 *
 * ITEM 9, ANSWERED THE SAME WAY. `materials.totalDrops` is cross-shell, so a
 * Loam subsidence keyed on it would fire in Verdance. Every rule below is
 * accumulated ONLY while standing in its own shell — the global is read as a
 * DELTA and attributed to whichever shell you were in when it moved, so the
 * counter is per-shell without any system having to be taught about shells.
 * (`totalDrops` also goes DOWN — a conversion is not a find — so only increases
 * are counted; see `tickThresholds`.)
 *
 * ITEM 10. A threshold changes what the world DOES. Not one of the six touches
 * `cellCap`, `cellRegen`, `chipYield` or a currency: they open a wall, invert a
 * sign, spread a vine, add a wavelength, raise a floor and thicken a silence.
 * Asserted the same way `condition.ts` asserts it — every threshold crossed at
 * once, `dpsMax` read at one depth either side.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { GameState } from '../types';

export interface ThresholdDef {
  shellId: string;
  id: string;
  /** What the shell calls it once it has happened. Never shown before. */
  name: string;
  /** How much of the shell's own measure it takes. */
  at: number;
  /**
   * A monotonic-ish global the shell already keeps for its own reasons. Read as
   * a delta while you stand in this shell, which is what makes it per-shell.
   */
  total?: (s: GameState) => number;
  /** ...or a per-second rate, for a measure nothing counts a total of. */
  rate?: (s: GameState) => number;
  /** One line, past tense, for the Roll and the Codex. */
  changed: string;
  /** §53 rule 2 — always both, never one. */
  opportunity: string;
  cost: string;
  /** §53 rule 3 — what a marked row on the Roll reads. */
  mark: string;
  /**
   * The once-only thing the crossing DOES to the world, where the change is an
   * event rather than a standing query. Four of the six need nothing here — a
   * floor, a sign, a spread rate and a band count are read where they matter,
   * every tick, which is the shape that cannot desynchronise from the crossing.
   * This is for the two that genuinely happen: a Roll that gives way, and light
   * that will not go back through a lens solved for six bands.
   */
  onCross?: (s: GameState) => void;
}

/**
 * WHY THESE NUMBERS. Each is sized so a shell you push through does not cross
 * it and a shell you live in does — §53's "you cross it while doing something
 * else". They are measured, not asserted: `scripts/a106-thresholds.ts` reports
 * how far a three-hour run gets against each, and the answer is in the commit.
 */
export const THRESHOLDS: ThresholdDef[] = [
  {
    shellId: 'loam',
    id: 'subsidence',
    name: 'SUBSIDENCE',
    // MEASURED: a balanced 3h Loam run takes 828 (idle 565, active 903), so
    // this lands around hour nine of living in the shell. A player who breaches
    // Loam on schedule never sees it, which is exactly §53's "you cross it while
    // doing something else."
    at: 2500,
    total: (s) => s.materials?.totalDrops ?? 0,
    changed: 'The stations began to crack.',
    opportunity: 'A cracked station has already given way — the wall there is down.',
    cost: 'And one of them is unstable. Standing in it puts you back up the shaft, and it does not come back.',
    mark: 'CRACKED',
  },
  {
    shellId: 'ferrite',
    id: 'greatFlip',
    name: 'THE GREAT FLIP',
    // UNMEASURED — no sim arm reaches Ferrite natively, and the one reading
    // that existed was the cross-shell leak `bankChain` now refuses. Ledgered
    // as a claim, not a measurement.
    at: 900,
    // Banked by `polarity.ts` at the moment a chain extends — the one measure
    // §53 names that nothing was already keeping a total of.
    changed: 'The shell inverted. Every pole reads the other way now.',
    opportunity: 'The seams read richer against the grain you have been cutting.',
    cost: 'Four hours of chain instinct are now exactly wrong.',
    mark: 'INVERTED',
  },
  {
    shellId: 'verdance',
    id: 'feral',
    name: 'THE FERAL',
    // MEASURED and RE-CUT. The rate was a CELL COUNT, so a full 8×8 face banked
    // sixty-four a second and `--scenario verdance` crossed THE FERAL at 7487%
    // of its threshold — inside three minutes. It is a FRACTION of the face now,
    // which makes the unit "fallow-face-seconds" and independent of how wide
    // your face happens to be. Balanced Verdance leaves ~58% of it standing, so
    // 18000 is about nine hours.
    at: 18_000,
    rate: (s) => {
      const f = s.growth?.fullSince ?? [];
      const n = s.face?.cells?.length ?? f.length;
      return n > 0 ? f.filter((t) => t > 0).length / n : 0;
    },
    changed: 'The growth stopped being containable.',
    opportunity: 'It comes back faster than you can take it.',
    cost: 'And it comes back where you were working.',
    mark: 'FERAL',
  },
  {
    shellId: 'glassmere',
    id: 'bend',
    name: 'THE BEND',
    // UNMEASURED — no sim arm enters Glassmere. Beam-seconds, so 20000 is about
    // five and a half hours of light actually running. Ledgered as a claim.
    at: 20_000,
    // Beam-seconds: how long the light has been carrying anything at all.
    rate: (s) => ((s.refraction?.path?.length ?? 0) > 0 ? 1 : 0),
    /**
     * "Every saved Lens stops working and must be re-solved" (§53), taken
     * literally: the mirrors come off the wall. It costs no material and pays
     * nothing — what it takes is the arrangement, which is the only thing in
     * Glassmere that was ever really yours.
     */
    onCross: (s) => { if (s.refraction) { s.refraction.mirrors = {}; s.refraction.pathDirty = true; } },
    changed: 'The light bends differently through this shell now.',
    opportunity: 'A seventh band opened. There was never a seventh band.',
    cost: 'Every lens you solved was solved for six.',
    mark: 'BENT',
  },
  {
    shellId: 'cinder',
    id: 'burn',
    name: 'THE BURN',
    // MEASURED: `--scenario cinder` vents 16090 in three hours, so 4000 crossed
    // THE BURN before the first hour was out — a threshold you meet on your way
    // in is a tutorial, not a world change. 48000 is about nine hours of it.
    at: 48_000,
    total: (s) => s.pressure?.ventedTotal ?? 0,
    changed: 'The shell will not cool back down to where it started.',
    opportunity: 'It holds more before it floods than it was built to.',
    cost: 'And it never comes back below the floor. The margin is narrower forever.',
    mark: 'BURNT',
  },
  {
    shellId: 'hollow',
    id: 'deepening',
    name: 'THE DEEPENING',
    // MEASURED: `--scenario hollow` harvests 330 stacks in three hours, so this
    // lands around hour nine, in line with the other two that could be read.
    at: 1000,
    total: (s) => s.hollow?.silenceHarvested ?? 0,
    changed: 'The Silence thickened.',
    opportunity: 'It gathers faster than it did, and the Null pays for gathering.',
    cost: 'More of everything arrives undecided.',
    mark: 'DEEP',
  },
];

export function thresholdFor(shellId: string): ThresholdDef | undefined {
  return THRESHOLDS.find((t) => t.shellId === shellId);
}

export function thresholdById(id: string): ThresholdDef | undefined {
  return THRESHOLDS.find((t) => t.id === id);
}
