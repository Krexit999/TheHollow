/**
 * THE INFORMATION ARCHITECTURE (Phase 11). Twenty-eight systems grouped into
 * FIVE fixed clusters — a count that can never overflow, on any viewport, at
 * any progression state. The face lives in THE FACE cluster and is the hero;
 * everything else is a room you walk into.
 *
 * A system's visibility predicate lives here (moved out of App.tsx). A cluster
 * shows when any of its systems is visible; a cluster's default system is its
 * first visible one.
 */
import type { GameState } from '../engine';
import { sealed, keptLaw } from '../engine/laws';
import { refineryUnlocked } from '../engine/systems/refinery';
import type { TabId } from './store';

export interface SystemDef {
  id: TabId;
  label: string;
  visible: (s: GameState) => boolean;
  /** B5: a CODEX SURFACE — a reference you read, not a system that owes a
   *  payoff. Reachable like any tab; exempt from the payoff floor and not
   *  part of the counted-system number. */
  codex?: true;
}

export interface ClusterDef {
  id: string;
  label: string;
  /** A restrained glyph — no emoji clutter against the lamplight palette. */
  glyph: string;
  systems: SystemDef[];
}

const always = () => true;
const rec = (s: GameState, shell: string, d: number) => (s.depthRecords[shell] ?? 0) >= d;

export const CLUSTERS: ClusterDef[] = [
  {
    id: 'face',
    label: 'The Face',
    glyph: '⛏',
    systems: [
      { id: 'dig', label: 'Dig', visible: always },
      // ALWAYS VISIBLE, because the Shaft screen is now the ROLL and §1 says the
      // floor is pinned from the moment you enter the shell. Gating it at depth
      // 10 would have hidden the whole geography for the opening two minutes —
      // the carved-column canvas is what waits for depth 10, not the list.
      { id: 'shaft', label: 'Shaft', visible: always },
      { id: 'kiln', label: 'Kiln', visible: (s) => s.kiln.built },
      { id: 'drills', label: 'Drills', visible: (s) => s.kiln.built && (s.maxDepthRecord >= 55 || s.drills.bayBuilt) },
      { id: 'vents', label: 'Vents', visible: (s) => rec(s, 'cinder', 10) },
      { id: 'hollow', label: 'Silence', visible: (s) => s.shell.breachCount >= 5 || (s.depthRecords['hollow'] ?? 0) > 0 },
    ],
  },
  {
    id: 'hold',
    label: 'The Hold',
    glyph: '▤',
    systems: [
      { id: 'hold', label: 'Materials', visible: (s) => s.materials.totalDrops > 0 },
      // GEAR opens on the first piece found — never before, so the room is
      // never an empty list of kit you could have (LAW 3).
      { id: 'gear', label: 'Gear', visible: (s) => (s.gear?.owned?.length ?? 0) > 0 },
      /*
       * THE FORGE TAB IS RETIRED (A.71). Once casting moved to its own station
       * and the alloy bench moved to the Drills, what was left was an archive of
       * the legacy tool system plus the gear bench — and an archive does not
       * need a door. The tool shelf folded into the Refinery (the room that
       * already breaks tools down) and gear became its own room; nothing was
       * dropped, which `reachability.test.ts` is the check on.
       */
      { id: 'casting', label: 'Casting', visible: (s) => s.forge.built },
      { id: 'refinery', label: 'Refinery', visible: (s) => refineryUnlocked(s) },
      { id: 'runes', label: 'Runes', visible: (s) => Object.values(s.runes.found).some((n) => n > 0) || s.runes.pairsSeen.length > 0 },
      { id: 'relics', label: 'Relics', visible: (s) => s.relics.found > 0 },
    ],
  },
  {
    id: 'progress',
    label: 'Progress',
    glyph: '▲',
    systems: [
      { id: 'delver', label: 'Delver', visible: always },
      // THE DESK opens on your FIRST NOTE, not before. An empty room with a
      // locked list in it is exactly what LAW 3 forbids, and a note is
      // guaranteed within the first minutes — the first deep gate, the first
      // pocket, the first fall all write one.
      { id: 'desk', label: 'The Desk', visible: (s) => (s.reading?.notes?.length ?? 0) > 0 },
      { id: 'collapse', label: 'Collapse', visible: (s) => s.maxDepthRecord >= 15 || s.collapse.count > 0 },
      { id: 'parallel', label: 'All Worlds', visible: (s) => s.recursion.count >= 1 || s.shell.current === 'aleph', codex: true },
      { id: 'spiral', label: 'The Spiral', visible: (s) => s.recursion.count >= 1 },
      // THE INVERSIONS open with the Spiral itself, which is where §21's locked
      // ladder puts them ("Spiral: challenges, parallel shells, Automation
      // Grid"). Never before it: the room would be ten runs you cannot start.
      { id: 'inversions', label: 'Inversions', visible: (s) => s.spiral.count >= 1 },
      /*
       * THE DEAD open on the FIRST OBJECT and never before — there is no room
       * to visit until you have picked something up off the floor, which is
       * the difference between a record and a checklist. It is a CODEX
       * SURFACE: a thing you read, owing no payoff, and outside the counted
       * system number, because it produces nothing by design (§48.3).
       */
      { id: 'dead', label: 'The Dead', visible: (s) => (s.dead?.found?.length ?? 0) > 0, codex: true },
      { id: 'grid', label: 'Achievements', visible: always },
      { id: 'vault', label: 'Vault', visible: always },
    ],
  },
];

/** All systems flat — for id lookups and the disclosure gate. */
export const ALL_SYSTEMS: SystemDef[] = CLUSTERS.flatMap((c) => c.systems);

export function clusterOf(tab: TabId): ClusterDef {
  return CLUSTERS.find((c) => c.systems.some((sys) => sys.id === tab)) ?? CLUSTERS[0]!;
}

export function systemDef(tab: TabId): SystemDef | undefined {
  return ALL_SYSTEMS.find((s) => s.id === tab);
}

/** A cluster is reachable when any of its systems is visible.
 *
 * SABLE'S WALK (challenge): only the Face. She had a lamp, a pick and a hole —
 * no Lamphouse, no boards, no ledgers — and the run exists to show that the
 * core loop stands up without any of it. The seal lives here because "which
 * rooms exist" is a navigation question, not an engine one. */
export function clusterVisible(c: ClusterDef, s: GameState): boolean {
  if (sealed(s, 'sealRooms') && c.id !== 'face') return false;
  return c.systems.some((sys) => systemVisible(sys, s));
}

/**
 * SABLE'S WALK's grant, and its only reader: a room you have opened never
 * closes again.
 *
 * Every `visible` predicate above is a LIVE condition, so a room can go away —
 * a Breach drops machine tiers and the Kiln's door shuts, a salvaged relic
 * empties the Relics room, a Spiral takes the lot. That is correct default
 * behaviour (LAW 3: never show a locked list) and it is also the thing that
 * makes a re-climb feel like walking back through doors you have already
 * opened. The grant reads `seenSystems`, which is the disclosure gate's own
 * record of rooms you were actually shown, so it can only ever re-open a door
 * you personally walked through — never reveal one early.
 */
export function systemVisible(sys: SystemDef, s: GameState): boolean {
  if (sys.visible(s)) return true;
  return keptLaw(s, 'sableswalk') && (s.seenSystems?.includes(sys.id) ?? false);
}

/** The first visible system in a cluster — its default destination. */
export function defaultSystem(c: ClusterDef, s: GameState): TabId | null {
  return c.systems.find((sys) => systemVisible(sys, s))?.id ?? null;
}
