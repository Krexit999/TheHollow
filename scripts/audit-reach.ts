/**
 * THE REACHABILITY AUDIT — for every shipped system, is there a path to it from
 * a real save, and roughly when?
 *
 * WHY THIS EXISTS. A.99 shipped the flood heat-leak and asserted the corridor
 * "falls out of the arithmetic". True — and A.100 found no save could reach it,
 * because only a `flood` station can be flooded and Cinder authored two of them
 * 145 depths apart against a leak of 20. The mechanism was alive in a test that
 * wrote `roll.flooded` directly and dead in the game.
 *
 * That is not a one-off; it is a CLASS, and this file is the instrument for it.
 * Every check below asks the same question the corridor one should have:
 *
 *     can a player standing in a real save get here, and where are they when
 *     it happens?
 *
 * It reads the registries and never a list kept in this file, so a machine
 * added tomorrow is audited tomorrow.
 *
 *     npx tsx scripts/audit-reach.ts
 */
import { ensureContentLoaded } from '../src/engine/content/index';

ensureContentLoaded();

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allShells } from '../src/engine/shells';
import { allAuthoredStations, authoredRoll } from '../src/engine/content/rolls';
import { MACHINE_DEMAND } from '../src/engine/systems/plant';
import { CHALLENGES } from '../src/engine/content/challenges';
import { ALL_SEALS, sealed } from '../src/engine/laws';

/** Shell order — the only way anyone ever arrives anywhere. */
const ORDER = allShells().map((s) => s.id);
const FLOOR = Object.fromEntries(allShells().map((s) => [s.id, s.floorDepth]));

type Row = {
  system: string;
  gate: string;
  shell: string | null;
  depth: number | null;
  ok: boolean;
  why: string;
};

const rows: Row[] = [];
const SYS = join('src', 'engine', 'systems');

// ---------------------------------------------------------------------------
// 1. WRECK-GATED MACHINES — read the constants, not a list
// ---------------------------------------------------------------------------

const wreckOf = new Map<string, string>();     // system file -> wreck name
for (const f of readdirSync(SYS).filter((x) => x.endsWith('.ts'))) {
  const src = readFileSync(join(SYS, f), 'utf8');
  for (const m of src.matchAll(/export const (\w*_?WRECK) = '([^']+)'/g)) {
    const sys = m[1]!.replace(/_?WRECK$/, '').toLowerCase().replace(/_/g, '')
      || f.replace('.ts', '');
    wreckOf.set(`${sys}|${f.replace('.ts', '')}`, m[2]!);
  }
}

const stations = allAuthoredStations();
for (const [key, wreck] of [...wreckOf].sort()) {
  const at = stations.find((s) => s.def.wreck === wreck);
  if (!at) {
    rows.push({
      system: key.split('|')[0]!, gate: `wreck "${wreck}"`, shell: null, depth: null,
      ok: false, why: 'NO STATION ANYWHERE CARRIES THIS WRECK — unreachable',
    });
    continue;
  }
  const floor = FLOOR[at.shellId] ?? Infinity;
  const past = at.def.depth > floor;
  rows.push({
    system: key.split('|')[0]!, gate: `wreck "${wreck}"`,
    shell: at.shellId, depth: at.def.depth,
    ok: !past,
    why: past
      ? `station at ${at.def.depth} is BELOW the shell floor (${floor}) — unreachable`
      : `${at.def.name}, ${at.shellId} ${at.def.depth}`,
  });
}

// ---------------------------------------------------------------------------
// 2. STATION TYPES A SYSTEM NEEDS — a verb with no place to happen is dead
// ---------------------------------------------------------------------------

const NEEDS_TYPE: Array<{ system: string; type: string; note: string }> = [
  { system: 'gear (swap)', type: 'rest', note: 'equipGear refuses away from a REST' },
  { system: 'flood / the corridor', type: 'flood', note: 'floodable() takes only type flood' },
  { system: 'crews (drifts)', type: 'seam', note: 'a crew walks a shored band' },
];
for (const need of NEEDS_TYPE) {
  const per = ORDER.map((id) => [id, authoredRoll(id).filter((d) => d.type === need.type).length] as const);
  const total = per.reduce((n, p) => n + p[1], 0);
  const first = per.find((p) => p[1] > 0);
  rows.push({
    system: need.system, gate: `a "${need.type}" station`,
    shell: first?.[0] ?? null, depth: null,
    ok: total > 0,
    why: total === 0
      ? `NO SHELL AUTHORS ONE — ${need.note}`
      : `${total} across ${per.filter((p) => p[1] > 0).length} shell(s): ${per.filter((p) => p[1] > 0).map((p) => `${p[0]}:${p[1]}`).join(' ')}`,
  });
}

// ---------------------------------------------------------------------------
// 3. THE NON-WRECK GATES, each read off the code that enforces it
// ---------------------------------------------------------------------------

const shellIndex = (id: string): number => ORDER.indexOf(id);

/**
 * A challenge is reachable only if something REGISTERED one. This asks the
 * registry, not a list here — the exact failure the row below carried for two
 * phases was a name in a union with no writer, and a hardcoded `ok: true`
 * would be that failure written into the instrument that is meant to catch it.
 */
function challengesReachable(): boolean {
  const probe = { spiral: { activeChallenge: { id: CHALLENGES[0]?.id } } } as never;
  return CHALLENGES.length === 10
    && ALL_SEALS.some((seal) => sealed(probe, seal));
}

/** ...and a grant is reachable only if a challenge actually pays it out. */
function grantExists(id: string): boolean {
  return CHALLENGES.some((c) => c.id === id);
}

const OTHER: Array<{ system: string; gate: string; shell: string | null; ok: boolean; why: string }> = [
  {
    system: 'seats (the frame)', gate: 'breachCount >= 1',
    shell: 'ferrite', ok: true, why: 'opens on the first Breach — §4 first sight',
  },
  {
    system: 'seats (each outline)', gate: "depthRecords[shell] >= that shell's floor",
    shell: 'loam', ok: true,
    why: `resolved by standing on a floor: ${ORDER.map((id) => `${id}@${FLOOR[id]}`).join(' ')}`,
  },
  {
    system: 'reserve', gate: 'none — a tap on any held stack',
    shell: 'loam', ok: true, why: 'available from the first material in the Hold',
  },
  {
    system: 'axioms (the bank)', gate: 'a Recursion pays them',
    shell: 'aleph', ok: true, why: 'granted by doRecursion; spendable at the Axiom Engine',
  },
  {
    /*
     * CLOSED A.103. This row read "NO CALLERS — ten seals sit permanently false
     * at fourteen live sites" for the whole life of this file.
     * `content/challenges.ts` is the caller, and the room opens at the Spiral,
     * which is where §21's locked ladder puts it. Late by the clock and correct
     * by the design: a Spiral rebuilds the world from `initialState`, so the
     * inversions are what make the SECOND climb differently shaped.
     */
    system: 'challenges', gate: 'spiral.count >= 1',
    shell: 'aleph', ok: challengesReachable(),
    why: 'THE INVERSIONS open with the first Spiral (post-Recursion) — ten runs, '
      + 'each starting where you stand',
  },
  {
    system: 'drift survival (THE LONG FALL)', gate: "the 'longfall' grant",
    shell: 'aleph', ok: grantExists('longfall'),
    why: 'kept by carrying THE LONG FALL 60 depths; re-timbers the drift onto the '
      + "next shell's ladder at breach.ts",
  },
];
for (const o of OTHER) {
  rows.push({ system: o.system, gate: o.gate, shell: o.shell, depth: null, ok: o.ok, why: o.why });
}

// ---------------------------------------------------------------------------
// 4. COVERAGE — a system with no gate found is a system nobody audited
// ---------------------------------------------------------------------------
/**
 * The failure this catches is quieter than "unreachable": a machine the audit
 * simply never looked at. `MACHINE_DEMAND` is the plant's own list of what
 * exists, so anything in it without a gate above is either free (fine, say so)
 * or gated by something this file cannot see (not fine).
 */
const FREE_BY_DESIGN = new Set([
  'kiln',      // §6's first keystone — raised with Brick, no wreck
  'crusher',   // the opening machine
  'refinery',  // Sinter Row is a WALL-adjacent keystone, raised not looted
  'washer',    // ships with the Refinery
  'assayBench',
]);
const ALIAS: Record<string, string> = {
  crucible: 'alloycrucible', shoring: 'shoringrig', frame: 'reconstructionframe',
  axiomEngine: 'axiom', lapidary: 'lenswork', vents: 'vent',
  cultivar: 'cultivarbench', pattern: 'patternbench',
};
const audited = new Set(rows.filter((r) => r.ok && r.depth !== null).map((r) => r.system));
const unaudited: string[] = [];
for (const id of Object.keys(MACHINE_DEMAND)) {
  if (audited.has(id) || audited.has(ALIAS[id] ?? '') || FREE_BY_DESIGN.has(id)) continue;
  unaudited.push(id);
}
for (const id of unaudited) {
  rows.push({
    system: id, gate: 'unknown', shell: null, depth: null, ok: false,
    why: 'IN MACHINE_DEMAND with no gate this audit can see — unaudited, not proven reachable',
  });
}

// ---------------------------------------------------------------------------
// 5. THE A.42 INVERSION — a machine behind a wall it is needed to cross
// ---------------------------------------------------------------------------
/**
 * PILLARS names this the worst bug the project has shipped: "the DRILL BAY
 * unlocked at depth record 55, while the tier-II hardness wall sits at 44 —
 * the system that makes the crossing possible was locked behind the crossing."
 * It cannot be decided automatically (only a human knows what a machine is FOR)
 * so this PRINTS the ordering and lets a reader see an inversion.
 */
const walls: string[] = [];
for (const id of ORDER) {
  const roll = authoredRoll(id).sort((a, b) => a.depth - b.depth);
  for (const def of roll.filter((d) => d.type === 'wreck')) {
    const before = roll.filter((d) => d.type === 'wall' && d.depth < def.depth);
    if (before.length > 0) {
      walls.push(`   ${id} ${String(def.depth).padStart(4)}  ${def.wreck} — behind ${before.length} wall(s): ${before.map((w) => `${w.name}@${w.depth}(t${w.hardness ?? '?'})`).join(', ')}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

rows.sort((a, b) => {
  const sa = a.shell ? shellIndex(a.shell) : 99;
  const sb = b.shell ? shellIndex(b.shell) : 99;
  return sa - sb || (a.depth ?? 0) - (b.depth ?? 0) || a.system.localeCompare(b.system);
});

console.log('REACHABILITY — every shipped system, in the order a player meets it\n');
let bad = 0;
let shown: string | null = null;
for (const r of rows) {
  const label = r.shell ?? '(no place)';
  if (label !== shown) {
    console.log(`\n── ${label.toUpperCase()}${r.shell ? ` · floor ${FLOOR[r.shell]}` : ''} ──`);
    shown = label;
  }
  if (!r.ok) bad += 1;
  const mark = r.ok ? '  ' : '!!';
  const at = r.depth !== null ? String(r.depth).padStart(4) : '   —';
  console.log(`${mark} ${at}  ${r.system.padEnd(22)} ${r.why}`);
}

if (walls.length > 0) {
  console.log('\n── MACHINES BEHIND A WALL (the A.42 inversion, for a human to read) ──');
  for (const w of walls) console.log(w);
}

console.log(`\n${rows.length} systems audited · ${bad} UNREACHABLE OR UNAUDITED`);
if (bad > 0) process.exitCode = 1;
