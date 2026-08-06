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
 * else" — which in practice means all six land near hour nine of living there.
 *
 * ALL SIX ARE NOW MEASURED, and none of them by a harness of its own: every
 * reading is `npm run sim -- --scenario <shell> --hours 3 --thresholds`, one
 * flag apart, printing what a three-hour run banked against each `at`. A.106
 * read four that way and ledgered Ferrite and Glassmere UNMEASURED because no
 * scenario entered those shells; A.107 added the two scenarios and read them.
 * Both were mis-sized in opposite directions — 31 hours and 6 — which is the
 * argument for the reading rather than for either number.
 *
 * AND ONE FINDING THAT LANDS ON ALL SIX, found by running the same arms to nine
 * hours instead of three: A BALANCED RUN IS NOT IN THE SHELL AT HOUR NINE. The
 * Ferrite arm is standing in Verdance by then and the Glassmere arm in Cinder,
 * so both bank LESS at 9h than at 3h — the counter stops the moment you breach.
 * That is not a bug in the sizing, it is what "a shell you live in" costs: every
 * threshold here is for a player who chooses to stay in a shell roughly twice as
 * long as the descent wants them to. Worth knowing before anyone reads a 0% in a
 * long run as a threshold that does not work.
 */
export const THRESHOLDS: ThresholdDef[] = [
  {
    shellId: 'loam',
    id: 'subsidence',
    name: 'SUBSIDENCE',
    // RE-MEASURED AND RE-CUT (A.109). Every number this row was sized against
    // was read through a hand that swung at a pocket the engine refuses — 99.7%
    // of manual strokes — and through a harness that had never built a machine.
    // Loam drops are 3.5x what the old hand banked.
    // Own-shell arm, --stay so the residency is real, --plant so the shell runs:
    //   3h 2879   ·   9h 10016
    // 2500 crossed at ~2.6h; 10000 puts it back at hour nine.
    // A player who breaches Loam on schedule still never sees it, which is
    // §53's "you cross it while doing something else."
    at: 10_000,
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
    // MEASURED (A.107), once `--scenario ferrite` existed to measure it in.
    // Six seeded 3h runs bank 92 · 157 · 25 · 57 · 106 · 83, mean 87 — so 900
    // was a 31-hour threshold in a set whose other five sit near hour nine.
    // 250 is 8.7h at the mean.
    //
    // AND THE SPREAD IS THE REAL READING. Six-to-one across seeds, where the
    // other five rows vary by a few percent, because this is the only measure
    // in the table that is ROLLED rather than accumulated: `bankChain` banks the
    // LENGTH of a chain at the moment it extends, and chain length falls out of
    // a sign layout nobody chose. At 250 that is 5 hours on a lucky world and
    // 30 on an unlucky one. Sized to the mean and left honest rather than
    // re-based onto a smoother measure, which would be a §53 change.
    //
    // WHY IT WAS THE ONE THAT COULD NOT BE READ AT ALL. Every other row reads a
    // global the shell keeps anyway, so a run that never enters the shell
    // reports 0 and says so. This one is banked in Ferrite only, so before the
    // scenario existed it reported 0 because nothing had ever chained there —
    // which reads identically to 0-by-construction and is not the same claim.
    // RE-MEASURED AND RE-CUT (A.109), and the note above is now VOID in both
    // halves. With a hand that lands its strokes, --scenario ferrite --stay
    // banks 8078 · 8077 · 8077 across seeds 11/23/47 at 3h — the mean of 87 this
    // row was cut against was a hand that had stopped chipping eleven seconds in,
    // and 250 crosses in minutes.
    //
    // AND THE SPREAD IS GONE, which retires the more interesting half of the old
    // note. Six-to-one across seeds was not "the only ROLLED measure in the
    // table" showing its nature; it was chain-banking being RARE enough that a
    // lucky sign layout dominated. A player who actually chips banks chains
    // continuously and the roll averages out — three seeds inside one unit.
    //
    // §53's LAW 5 is the target here, not hour nine: "Ferrite flipped and I have
    // FOUR HOURS of chain instincts that are now exactly wrong." Measured 4h:
    // 8527. 9h reads 10886, so the curve is nearly flat by then — it saturates.
    at: 8500,
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
    // your face happens to be.
    //
    // RE-MEASURED AND RE-CUT (A.109). The unit survives; the size does not. This
    // is the ONE row of the six that was too LATE rather than too early — the
    // old hand stalled, so cells sat fallow and banked faster than a player who
    // clears them does. Own-shell arm, --stay: 3h 2759 · 9h 10194, so 18000 was
    // about sixteen hours. 10000 is hour nine.
    at: 10_000,
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
    // MEASURED (A.107) via `--scenario glassmere`: three seeded 3h runs bank
    // 10469 · 10761 · 10119 beam-seconds against a 10800-second ceiling, so the
    // beam carries something ~97% of the time somebody is in the shell — this
    // is very nearly a clock. 20000 was therefore 5.7 hours of SHELL time, not
    // the 9-ish the other rows sit at; the old note read the unit right and the
    // pacing wrong.
    //
    // RE-MEASURED (A.109) and BARELY MOVED, which is itself the reading: this
    // row is very nearly a clock, so the chip fix — which changes how hard you
    // work, not how long the beam is lit — hardly touches it. Own-shell arm,
    // --stay: 3h 10800 · 9h 32399. 30000 crosses at 8.3h and 32000 at 9.0h; the
    // nudge is for consistency with the other five, not because 30000 was wrong.
    at: 32_000,
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
    // in is a tutorial, not a world change.
    //
    // RE-MEASURED AND RE-CUT (A.109). 16090-in-three-hours was the old hand.
    // Own-shell arm, --stay: 3h 37793 · 9h 117114, so 48000 crossed at ~3.8h —
    // the same "meet it on the way in" the last cut was written to stop.
    // 117000 is hour nine.
    at: 117_000,
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
    // RE-MEASURED AND RE-CUT (A.109). 330-in-three-hours was the old hand.
    // Own-shell arm, --stay: 3h 440 · 9h 1928, so 1000 crossed at ~4.7h.
    // 1900 is hour nine, in line with the other five.
    at: 1900,
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
