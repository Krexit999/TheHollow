/**
 * EXCAVATIONS — objects too big to chip out, cleared across many sessions.
 *
 * Hand-built, like the Warrens: each one a specific idea, not a generated thing.
 * They sit at fixed depths on the column and you clear AROUND them a shift at a
 * time — one shift per visit, so you must come back to a site to work the next
 * (the Shaft's own climb-and-return, given a reason). Each shift reveals more of
 * the SHAPE; only the last reveals the IDENTITY. The reveal is the reward; the
 * one-time find at the end is a keepsake, never an income (pillar 2).
 *
 * Headless data + helpers. The clearing lives in shaftSys.ts.
 */
export interface ExcavationSite {
  id: string;
  shell: string;
  depth: number;
  name: string;
  /** Revealed one per cleared shift — shape first, identity last. Length = effort. */
  stages: string[];
  /** A one-time keepsake when the last shift lands. Never repeatable. */
  find?: { scrip?: number; renown?: number; relic?: boolean };
}

export const EXCAVATIONS: ExcavationSite[] = [
  // ---- LOAM ----
  {
    id: 'loamSpine', shell: 'loam', depth: 42, name: 'The Long Spine',
    stages: [
      'A curve in the wall too regular to be rock. You clear the loam off one arc of it.',
      'Vertebrae — dozens, each the size of a stool. It ran the length of the gallery and further.',
      'A spine with no skull at either end. It simply stops, both ways, as if it were always only middle.',
      'THE LONG SPINE, whole. Nothing that large should fit in Loam. It did not fit; it was here first, and Loam grew around it.',
    ],
    find: { scrip: 220 },
  },
  {
    id: 'loamDoor', shell: 'loam', depth: 96, name: 'The Sealed Door',
    stages: [
      'Dressed stone, cut square, where there should be none.',
      'A frame. A lintel. The unmistakable idea of a threshold, packed solid with clay.',
      'A door — mortared shut from the FAR side. THE SEALED DOOR. It does not open, and you decide, on reflection, that you are glad.',
    ],
    find: { relic: true },
  },
  // ---- FERRITE ----
  {
    id: 'ferriteEngine', shell: 'ferrite', depth: 84, name: 'The Stopped Engine',
    stages: [
      'Iron that was SHAPED — flat planes, a right angle, a tooth.',
      'A gear the width of the shaft, meshed into a second you cannot yet see.',
      'Rods, a housing, a flywheel seized mid-turn. It was RUNNING once.',
      'THE STOPPED ENGINE. No boiler, no fuel, no reason. It turned for something, for a long time, and then it did not.',
    ],
    find: { renown: 40 },
  },
  {
    id: 'ferriteAnchor', shell: 'ferrite', depth: 210, name: 'The Anchor',
    stages: [
      'A chain-link, each ring taller than you are.',
      'The chain runs UP, into the ceiling, taut, holding weight from above.',
      'THE ANCHOR. Something up there is moored to something down here. Neither end is visible. You leave the chain where it is.',
    ],
    find: { relic: true },
  },
  // ---- VERDANCE ----
  {
    id: 'verdanceSeed', shell: 'verdance', depth: 66, name: 'The Great Seed',
    stages: [
      'A smooth shell, warm to the touch, half again your height.',
      'Not stone — a HUSK, veined, with something coiled dark inside it.',
      'THE GREAT SEED. It has waited to sprout longer than the shell has existed. You clear the last of the soil and, very carefully, put some of it back.',
    ],
    find: { scrip: 400 },
  },
  {
    id: 'verdanceArch', shell: 'verdance', depth: 250, name: 'The Living Arch',
    stages: [
      'Two trunks, grown deliberately toward each other.',
      'They MET, and fused, and kept growing as one span.',
      'A third has joined them, and a fourth. This was tended.',
      'THE LIVING ARCH. Someone planted a doorway and waited centuries for it to grow. It is still growing. It is nearly shut.',
    ],
    find: { renown: 60 },
  },
  // ---- GLASSMERE ----
  {
    id: 'glassmereLens', shell: 'glassmere', depth: 108, name: 'The Buried Lens',
    stages: [
      'A disc of clear glass, ground perfectly flat, set into the wall.',
      'It is enormous, and it is AIMED — angled at a point deeper in the shell.',
      'THE BURIED LENS. It focuses the little light down here onto one exact spot below. You resolve to find out what is standing there.',
    ],
    find: { relic: true },
  },
  {
    id: 'glassmereMouth', shell: 'glassmere', depth: 330, name: 'The Glass Mouth',
    stages: [
      'An opening in the rock, rimmed in fused glass, as if something breathed fire once.',
      'The glass is grooved from within — it was blown OUTWARD, from a throat.',
      'The throat goes down further than your lamp reaches, all of it glass.',
      'THE GLASS MOUTH. Something the size of the gallery exhaled here, once, hot enough to make the walls run. It has not exhaled again. Yet.',
    ],
    find: { scrip: 800 },
  },
];

export const EXCAVATION_BY_ID = new Map(EXCAVATIONS.map((e) => [e.id, e]));

export function excavationsOfShell(shellId: string): ExcavationSite[] {
  return EXCAVATIONS.filter((e) => e.shell === shellId);
}

/** The site at a given (shell, depth), if any. */
export function excavationAt(shellId: string, depth: number): ExcavationSite | undefined {
  return EXCAVATIONS.find((e) => e.shell === shellId && e.depth === depth);
}
