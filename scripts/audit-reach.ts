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
// 1b. WRECK PAYLOADS NOTHING READS — the mirror of section 1 (A.104)
// ---------------------------------------------------------------------------
/**
 * Section 1 asks "does this system's wreck have a station". This asks the
 * question the other way round, and it had never been asked: **does this
 * station's wreck have a system?**
 *
 * A station carries `wreck: 'X'`. If no code anywhere reads the string 'X',
 * the player walks into a named place, loots it, and NOTHING HAPPENS. The
 * system it is named after is still reachable — by some other gate entirely —
 * so every structural check in the project passes and the audit above reports
 * green. It is "reachable and useless" in its purest form: the gate is real,
 * the reward behind it is not.
 *
 * This is a REPORT, not a failure. Wiring a payload to its system would change
 * WHEN that system unlocks, which is pacing, and pacing is a ruling.
 */
const STRIP = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  .replace(/`(?:[^`\\]|\\.)*`/g, ' ');

const wreckReaders = new Set<string>();
for (const dir of [SYS, join('src', 'engine'), join('src', 'ui')]) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts') || x.endsWith('.tsx'))) {
    /**
     * A PROSE MENTION IS NOT A READER (A.91, and again here). The raw scan
     * counts a wreck name written in a comment explaining why something is NOT
     * wired — which is exactly the sentence a dead payload attracts. Comments
     * and template literals come out before matching, and the probe below
     * plants both cases every run so this cannot quietly stop working.
     */
    for (const m of STRIP(readFileSync(join(dir, f), 'utf8')).matchAll(/'([A-Z][A-Z ']{2,})'/g)) {
      wreckReaders.add(m[1]!);
    }
  }
}
/**
 * ── THE PAYLOAD-WITH-NO-READER CHECK IS NOW A FAILURE (A.106, item 4) ────────
 *
 * It shipped at A.104 as a REPORT, on the stated grounds that wiring a payload
 * changes WHEN a system unlocks and pacing is a ruling. The ruling came: all
 * six were dealt with — five wired to their machines, and THE RENDERY struck
 * from its row because no such machine exists. With the class closed, leaving
 * the check advisory would let the next one accumulate exactly as these six
 * did: silently, for the whole project, behind a green audit.
 *
 * So a station whose `wreck:` names something nothing reads is a BUILD FAILURE.
 * Author a payload and you wire it in the same pass, or you do not write it.
 */
const inert: string[] = [];
for (const st of stations) {
  if (st.def.wreck && !wreckReaders.has(st.def.wreck)) {
    inert.push(`   ${st.shellId} ${String(st.def.depth).padStart(4)}  ${st.def.name} — "${st.def.wreck}" is read by nothing`);
  }
}

/**
 * AND THE CHECK CHECKS ITSELF, in both directions, every run. An audit that has
 * quietly stopped matching reports a clean sheet, which is indistinguishable
 * from the thing it exists to find.
 */
const selfTest: string[] = [];
{
  const hit = (src: string, name: string) =>
    [...STRIP(src).matchAll(/'([A-Z][A-Z ']{2,})'/g)].some((m) => m[1] === name);
  if (!hit(`const X = 'A PLANTED WRECK';`, 'A PLANTED WRECK')) {
    selfTest.push('the wreck-reader scan no longer matches a real declaration');
  }
  if (hit(`/* nothing reads 'A PROSE ONLY WRECK' */`, 'A PROSE ONLY WRECK')) {
    selfTest.push('the wreck-reader scan counts a comment as a reader');
  }
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
  /*
   * `refinery` — AND THIS COMMENT WAS WRONG (corrected A.104). It read "Sinter
   * Row is a WALL-adjacent keystone, raised not looted", which excused the row
   * by hand on a claim the Roll contradicts: Sinter Row is `type: 'wreck'`
   * carrying `wreck: 'REFINERY'`, so it IS looted — and the string 'REFINERY'
   * is read by nothing, so the looting pays nothing. The room opens on FERRITE
   * mastery 3 (`refineryUnlocked`), two shells from the station named after it.
   * It stays excused here because the room is genuinely reachable; the dead
   * payload is reported by section 1b instead of hidden by this list.
   */
  'refinery',
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
 *
 * THE ONE THIS FLAGGED HAS BEEN RULED (A.104). A.102 named THE VENT ARRAY at
 * cinder 58, behind THE CLINKER at 54, as the row to re-check — §6 said the
 * Array's absence made "the shell impassable". Six sim arms from depth 40 with
 * no Array reached the shell FLOOR at 470 with zero floods, including the arm
 * with nothing plumbed: the Governor caps unchoked heat at holdLine+15 against
 * a flood line of 100, so the Array is an income machine and not a survival
 * gate. §6's row was the bug and is corrected there. Nothing moved.
 *
 * The list below still prints, because the next inversion will look exactly
 * like the twenty entries that are the intended shape.
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
// 6 — A RULE THAT EXISTS AND CAN NEVER BE WRITTEN (A.108 item 5)
// ---------------------------------------------------------------------------

/**
 * THE SAME CLASS THIS FILE WAS BUILT FOR, ONE LAYER DOWN.
 *
 * A.99 shipped a heat corridor no save could reach. A.108 found Verdance's
 * `overgrown` in exactly that state and found it BY ACCIDENT: the rule asked
 * whether `served` had fallen to zero, `served` is a supply RATIO with a floor,
 * and so the shell's whole signature had never fired for any player since it
 * shipped. Nothing failed. A test read green over it, because the test wrote the
 * precondition by hand.
 *
 * The criterion here is the cheapest one that catches that bug and cannot be
 * argued with: PUSH EACH RULE'S INPUT TO THE CEILING ITS OWN SYSTEM ALLOWS, and
 * ask the predicate. A rule that is still false when its input is at the maximum
 * the game can produce can never be written, and that is a build failure.
 *
 * WHAT THIS DOES NOT CLAIM. Reachable in principle is not "a player meets it" —
 * that is a RATE, it needs a real run, and it lives in `sim.ts --conditions`,
 * which measures writing and biting seconds against shell residency. This file
 * is the gate; that one is the measurement. Neither substitutes for the other.
 *
 * Coverage is a failure too: a rule added tomorrow with no probe here fails
 * tomorrow, rather than waiting to be stumbled on the way this one was.
 */
import { createEngine } from '../src/engine/index';
import { CONDITION_RULES, conditionedMachines } from '../src/engine/systems/condition';
import { ensurePlant, flowSatisfaction } from '../src/engine/systems/plant';
import { ensurePrism } from '../src/engine/systems/prism';
import { chainCap } from '../src/engine/systems/polarity';
import { MATERIALS } from '../src/engine/materials';
import { KILN_FUELS } from '../src/engine/content/kilnFuel';
import { STRAINS, strainStone } from '../src/engine/content/strains';
import { ModifierCache } from '../src/engine/modifiers';
import type { GameState } from '../src/engine/types';

/** Stand a full plant up in a shell. Nothing is written to the condition table. */
function plantIn(shellId: string): GameState {
  const g = createEngine({ nowMs: 0 }).getState() as GameState;
  g.shell.current = shellId;
  g.depthRecords[shellId] = 400;
  g.depth = 30;
  g.kiln.built = true;
  const p = ensurePlant(g);
  for (const id of conditionedMachines()) p.tiers[id] = 1;
  return g;
}

/**
 * Each rule's input, pushed to its own system's ceiling. The ceiling is named
 * and read from the system that owns it — never a number written down here.
 */
const CEILINGS: Record<string, { shell: string; how: string; push: (g: GameState) => void }> = {
  baked: {
    shell: 'cinder',
    how: 'pressure.heat at the gauge ceiling (100)',
    push: (g) => { g.pressure.heat = 100; },
  },
  overgrown: {
    shell: 'verdance',
    how: 'every machine built, drawing against a bare Bloom',
    push: () => { /* the full plant IS the push — max demand, floor supply */ },
  },
  unlit: {
    shell: 'glassmere',
    how: 'a standing Prism with its intensity spent off this band',
    push: (g) => { ensurePrism(g).intensity = [0, 1, 1, 1, 0, 1]; },
  },
  undecided: {
    shell: 'hollow',
    how: 'hollow.silence at its cap (100)',
    push: (g) => { g.hollow.silence = 100; },
  },
  magnetised: {
    shell: 'ferrite',
    how: 'polarity.chain at chainCap',
    push: (g) => { g.polarity.chain = chainCap(g); },
  },
};

const condBad: string[] = [];
const condRows: string[] = [];

/** Is this rule written by ANY machine, with its input at the ceiling? */
function ruleWrites(rule: (typeof CONDITION_RULES)[number], push: (g: GameState) => void): boolean {
  const g = plantIn(rule.shellId);
  push(g);
  const mods = new ModifierCache();
  mods.invalidate();
  return conditionedMachines().some((id) => rule.writing(g, id, mods));
}

for (const rule of CONDITION_RULES) {
  const c = CEILINGS[rule.id];
  if (!c) {
    condBad.push(`   ${rule.shellId.padEnd(10)} ${rule.id.padEnd(11)} NO PROBE — a rule was added and this audit was not taught its ceiling`);
    continue;
  }
  if (c.shell !== rule.shellId) {
    condBad.push(`   ${rule.shellId.padEnd(10)} ${rule.id.padEnd(11)} PROBE NAMES THE WRONG SHELL (${c.shell})`);
    continue;
  }
  const writes = ruleWrites(rule, c.push);
  if (!writes) {
    condBad.push(`   ${rule.shellId.padEnd(10)} ${rule.id.padEnd(11)} CANNOT BE WRITTEN — false with ${c.how}`);
  } else {
    condRows.push(`   ${rule.shellId.padEnd(10)} ${rule.id.padEnd(11)} writes with ${c.how}`);
  }
}

/**
 * THE SELF-TEST, BOTH WAYS. A probe that can only ever say "fine" is a comment.
 * One planted rule that cannot fire must be caught, and one that can must not.
 */
const selfCond: string[] = [];
{
  const real = CONDITION_RULES.find((r) => r.id === 'overgrown')!;
  const dead = { ...real, writing: (g: GameState, id: string) => flowSatisfaction(g, id) < 0 };
  if (ruleWrites(dead, CEILINGS['overgrown']!.push)) {
    selfCond.push('a rule that asks for a satisfaction below zero was read as reachable');
  }
  const alive = { ...real, writing: (g: GameState, id: string) => flowSatisfaction(g, id) <= 1 };
  if (!ruleWrites(alive, CEILINGS['overgrown']!.push)) {
    selfCond.push('a rule that is always true was read as unreachable');
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

if (inert.length > 0) {
  console.log('\n!! STATIONS WHOSE WRECK PAYLOAD IS READ BY NOTHING — BUILD FAILURE (A.106) !!');
  for (const i of inert) console.log(i);
  console.log('   A named place that pays nothing is §22.5 as scenery. Wire it, or strike the row.');
  bad += inert.length;
}
if (selfTest.length > 0) {
  console.log('\n!! THE WRECK-READER SCAN IS BROKEN — its own probe failed !!');
  for (const s of selfTest) console.log(`   ${s}`);
  bad += selfTest.length;
}

if (walls.length > 0) {
  console.log('\n── MACHINES BEHIND A WALL (the A.42 inversion, for a human to read) ──');
  for (const w of walls) console.log(w);
}

/**
 * 7 — A REGISTRY THAT NAMES A MATERIAL NOBODY AUTHORED (A.109)
 *
 * `material-audit.ts` walks the CONSUMER side: which authored stones nothing
 * eats. This is the other direction and nothing was checking it — a registry
 * row that names a material id which does not exist at all. The row loads, the
 * UI offers it, and the lookup that would make it work returns 0 forever.
 *
 * FOUND BY TIMING §23. Its minute-4 beat is "two fuel profiles: fast burn (Brick
 * now, Ash later) or long burn" — the first real trade in the game — and BOTH of
 * the fuels it names want a material that was never authored. Only Marl burns,
 * so the trade has one option and the Ash counter §23 says starts moving at 4:00
 * cannot move at all. Three hours of every policy: 0 ash.
 *
 * NOT FIXED HERE. Authoring a source for those stones adds fuel a player can
 * burn, which moves output, and A.109 measures. Gated instead, so it cannot
 * spread and cannot be forgotten.
 */
const dangling: string[] = [];
const authored = new Set(MATERIALS.map((m) => m.id));
for (const f of KILN_FUELS) {
  if (!authored.has(f.materialId)) {
    dangling.push(`   kiln fuel  ${f.id.padEnd(10)} wants material '${f.materialId}' — never authored`);
  }
}
for (const s of STRAINS) {
  // `strainStone` resolves a TRAIT to a Verdance stone and falls back to
  // 'sapstone', so this asks whether whatever it lands on actually exists.
  const stone = strainStone(s.trait);
  if (stone && !authored.has(stone)) {
    dangling.push(`   strain     ${s.id.padEnd(10)} resolves to material '${stone}' — never authored`);
  }
}

/** ...and the two-way self-test, because a scan that can only say "fine" is a comment. */
const selfDangle: string[] = [];
if (!authored.has('__nope__')) {
  const pretend = [...KILN_FUELS, { materialId: '__nope__' } as (typeof KILN_FUELS)[number]];
  if (pretend.filter((f) => !authored.has(f.materialId)).length <= dangling.length - 1) {
    selfDangle.push('a planted dangling reference was not seen');
  }
}
if (!authored.has('marl')) selfDangle.push('a material that IS authored read as missing');

console.log('');
console.log('-- MATERIAL IDS NAMED BY A REGISTRY - do they exist? --');
console.log(`   ${MATERIALS.length} authored · ${KILN_FUELS.length} fuels · ${STRAINS.length} strains checked`);

console.log('');
console.log('-- SHELL CONDITION RULES - can the world write them at all? --');
for (const r of condRows) console.log(r);
if (condBad.length > 0) {
  console.log('');
  console.log('!! A SHELL RULE CANNOT BE WRITTEN - BUILD FAILURE (A.108) !!');
  for (const c of condBad) console.log(c);
  console.log('   A signature that cannot fire is not a signature. Re-point it, or strike it.');
  bad += condBad.length;
}
if (selfCond.length > 0) {
  console.log('');
  console.log('!! THE CONDITION PROBE IS BROKEN - its own self-test failed !!');
  for (const sc of selfCond) console.log('   ' + sc);
  bad += selfCond.length;
}
/**
 * A REPORT, NOT A FAILURE — and on the same grounds section 1b shipped on.
 *
 * A.104 found six wreck payloads nothing read and PRINTED them, because wiring
 * one changes when a system unlocks and that is a ruling. A.106 got the ruling,
 * dealt with all six, and only then made the check a build failure. This is the
 * same shape at the same stage: the two fixes available are to author the stones
 * (which adds fuel a player can burn, and A.109 measures rather than moves
 * output) or to strike the rows (which deletes a trade §23 authors by name).
 * Both are rulings. Failing the build now would also fail it for work that has
 * nothing to do with this.
 *
 * It becomes a failure the moment the ruling lands, exactly as 1b did.
 */
if (dangling.length > 0) {
  console.log('');
  console.log('-- A REGISTRY NAMES A MATERIAL NOBODY AUTHORED (A.109, for a human to rule on) --');
  for (const d of dangling) console.log(d);
  console.log('   The row loads, the UI offers it, and the lookup returns 0 forever.');
  console.log('   NOT a build failure yet: authoring the stone moves output, striking the row');
  console.log('   deletes a trade §23 names. Both are rulings. Make it fail once one lands.');
}
if (selfDangle.length > 0) {
  console.log('');
  console.log('!! THE DANGLING-REFERENCE SCAN IS BROKEN - its own self-test failed !!');
  for (const sd of selfDangle) console.log('   ' + sd);
  bad += selfDangle.length;
}
console.log(`\n${rows.length} systems audited · ${bad} UNREACHABLE OR UNAUDITED`);
if (bad > 0) process.exitCode = 1;
