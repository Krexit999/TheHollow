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
import { sealed } from '../engine/laws';
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
      { id: 'shaft', label: 'Shaft', visible: (s) => s.maxDepthRecord >= 10 || s.shaft.reached >= 10 },
      { id: 'kiln', label: 'Kiln', visible: (s) => s.kiln.built },
      { id: 'drills', label: 'Drills', visible: (s) => s.kiln.built && (s.maxDepthRecord >= 55 || s.drills.bayBuilt) },
      { id: 'vents', label: 'Vents', visible: (s) => rec(s, 'cinder', 10) },
      { id: 'hollow', label: 'Silence', visible: (s) => s.shell.breachCount >= 5 || (s.depthRecords['hollow'] ?? 0) > 0 },
    ],
  },
  {
    id: 'craft',
    label: 'The Craft',
    glyph: '⚒',
    systems: [
      { id: 'lattice', label: 'Lattice', visible: (s) => s.lattice.unlocked },
      { id: 'crucible', label: 'Crucible', visible: (s) => s.shell.breachCount >= 1 },
      { id: 'automation', label: 'Automation', visible: (s) => s.spiral.count >= 1 },
    ],
  },
  {
    id: 'hold',
    label: 'The Hold',
    glyph: '▤',
    systems: [
      { id: 'hold', label: 'Materials', visible: (s) => s.materials.totalDrops > 0 },
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
      // A.47 UNFOLDED: Museum split back into its own room. It became a real
      // arrange-and-discover screen (exhibits, identify, curated halls) rather
      // than a sidecar to Relics, and stacking two full panels under one
      // header buried the exhibits below a long relic list.
      { id: 'museum', label: 'Museum', visible: (s) => s.relics.found > 0 || s.museum.completed.length > 0 },
    ],
  },
  {
    id: 'world',
    label: 'The World',
    glyph: '◍',
    systems: [
      { id: 'guild', label: 'Guild', visible: (s) => s.guild.discovered },
      // B5: codex surfaces — read, not worked. Wells folded into Vents.
      // GEAR (A.71): armour, out of the Forge. It belongs beside the Bestiary —
      // the only reason to wear any of it is what is down there.
      { id: 'gear', label: 'Gear', visible: (s) => s.combat.stats.encounters > 0 || s.materials.totalDrops >= 30 },
      { id: 'bestiary', label: 'Bestiary', visible: (s) => s.combat.seen.length > 0, codex: true },
      { id: 'journal', label: 'Journal', visible: (s) => s.guild.sable.found.length > 0, codex: true },
      { id: 'expeditions', label: 'Expeditions', visible: (s) => Object.keys(s.guild.hirelings).length > 0 },
    ],
  },
  {
    id: 'progress',
    label: 'Progress',
    glyph: '▲',
    systems: [
      { id: 'delver', label: 'Delver', visible: always },
      { id: 'collapse', label: 'Collapse', visible: (s) => s.maxDepthRecord >= 15 || s.collapse.count > 0 },
      { id: 'rewrite', label: 'Rewrite', visible: (s) => s.shell.breachCount >= 6 || s.recursion.count >= 1 || s.recursion.axioms.length > 0 },
      { id: 'parallel', label: 'All Worlds', visible: (s) => s.recursion.count >= 1 || s.shell.current === 'aleph', codex: true },
      { id: 'spiral', label: 'The Spiral', visible: (s) => s.recursion.count >= 1 },
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
  return c.systems.some((sys) => sys.visible(s));
}

/** The first visible system in a cluster — its default destination. */
export function defaultSystem(c: ClusterDef, s: GameState): TabId | null {
  return c.systems.find((sys) => sys.visible(s))?.id ?? null;
}
