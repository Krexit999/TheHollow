/**
 * THE SUPPLY AUDIT — is a system's INPUT there when the system is?
 *
 * WHY THIS EXISTS, AND WHY `audit-reach.ts` CANNOT ANSWER IT. That instrument
 * asks "can a player get to this machine, and where are they standing when it
 * happens". It reads GATES. It is blind to the failure one step past a gate:
 *
 *     the machine is reachable, it is gated correctly, the player builds it,
 *     and the thing it eats does not exist yet.
 *
 * That is not hypothetical — it is the class the deep-material sink was, and
 * that one was found BY HAND. A machine with a supply of zero passes every
 * structural check this project owns: it has a station, a wreck, a demand
 * entry, a panel, a test. Nothing anywhere asks whether the rock it wants is in
 * the shell it was put in.
 *
 * TWO HALVES, because "input" means two different things:
 *
 *   DRAW      Flow and Surge are a RATE. A machine draws continuously against
 *             a plant whose ceiling is set by the shell you are standing in
 *             (§3.2). Demand accumulates — you keep the roster across a Breach
 *             — while supply is whatever THIS shell's plant makes. So the
 *             question is arithmetic and has a real answer: at each shell, what
 *             fraction of what you own can you actually run?
 *
 *   MATERIAL  A machine's stone is a PLACE. Every material declares the shell
 *             it comes from; every machine sits at a station in a shell. An
 *             input whose shell is DEEPER than the machine's own gate is a
 *             supply of zero at the moment of demand — the sink class, stated
 *             structurally.
 *
 * It reads the registries and never a list kept here, so a machine added
 * tomorrow is audited tomorrow. Exits 1 on any hard failure.
 *
 * WHAT THIS STILL CANNOT SEE, stated so the next reader does not mistake a
 * green run for a cleared field — the same failure the SELF_EXPLAINING
 * exclusion set was (PILLARS: a coverage number read green over the screens
 * already known to be fine):
 *
 *   - THE RATE A STONE ARRIVES AT. Half 2 answers "is there a route by then",
 *     not "does it come fast enough to feed the machine". A seam that drops one
 *     unit an hour against a machine that eats six reads as supplied here.
 *     `material-sources.ts` has the routes; nothing has the rates, and pricing
 *     them means a sim per machine.
 *   - A VERB WHOSE REFUSAL CAN NEVER BE FALSE. `reachability.test.ts` proves a
 *     dispatch site exists; nothing proves the blocker in front of it is
 *     satisfiable. That is the same shape as Seat IV (A.98, unsatisfiable for
 *     phases behind a correct-looking condition) and it is still open.
 *   - THE OTHER DIRECTION. `material-audit.ts` reports **60 materials with zero
 *     consumers after chains** — supplied, wanted by nothing. That is a real
 *     gap and it is that instrument's, not this one's.
 *
 *     npx tsx scripts/audit-supply.ts
 */
import { ensureContentLoaded } from '../src/engine/content/index';

ensureContentLoaded();

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createEngine } from '../src/engine/index';
import { ModifierCache } from '../src/engine/modifiers';
import { allShells } from '../src/engine/shells';
import { allAuthoredStations } from '../src/engine/content/rolls';
import { MACHINE_DEMAND, ensurePlant, flowCap, surgeCap } from '../src/engine/systems/plant';
import { MATERIALS } from '../src/engine/materials';
import type { GameState } from '../src/engine/types';

const ORDER = allShells().map((s) => s.id);
const idx = (id: string): number => ORDER.indexOf(id);
const SYS = join('src', 'engine', 'systems');

let failures = 0;
const note = (s: string): void => { console.log(s); };

// ---------------------------------------------------------------------------
// WHERE EACH MACHINE IS GATED — the same registry read audit-reach.ts uses
// ---------------------------------------------------------------------------
/**
 * A machine's home shell is the shell of the station carrying its wreck. The
 * ones with no wreck are raised rather than looted (§6's keystones that come
 * with the shell) and belong to Loam, which is where the game starts.
 */
const wreckOf = new Map<string, string>();
for (const f of readdirSync(SYS).filter((x) => x.endsWith('.ts'))) {
  const src = readFileSync(join(SYS, f), 'utf8');
  for (const m of src.matchAll(/export const (\w*_?WRECK) = '([^']+)'/g)) {
    wreckOf.set(m[1]!.replace(/_?WRECK$/, '').toLowerCase().replace(/_/g, ''), m[2]!);
  }
}
const stations = allAuthoredStations();

/** Machine id -> the shell it can first be built in. */
const homeShell = new Map<string, string>();
for (const id of Object.keys(MACHINE_DEMAND)) {
  const key = id.toLowerCase();
  const wreck = wreckOf.get(key)
    ?? wreckOf.get(key.replace(/bench$/, ''))
    ?? wreckOf.get(`${key}bench`)
    ?? wreckOf.get(`alloy${key}`)
    ?? wreckOf.get(`${key}rig`)
    ?? (key === 'lapidary' ? wreckOf.get('lenswork') : undefined)
    ?? (key === 'vents' ? wreckOf.get('vent') : undefined)
    ?? (key === 'axiomengine' ? wreckOf.get('axiom') : undefined)
    ?? (key === 'frame' ? wreckOf.get('reconstructionframe') : undefined);
  const at = wreck ? stations.find((s) => s.def.wreck === wreck) : undefined;
  homeShell.set(id, at?.shellId ?? 'loam');
}

// ---------------------------------------------------------------------------
// HALF 1 — DRAW: what you own, against what the shell you stand in produces
// ---------------------------------------------------------------------------
/**
 * DEMAND ACCUMULATES AND SUPPLY DOES NOT. The machine ROSTER survives a Breach
 * (`breach.ts` keeps it and drops the tiers to I), so by Cinder a player owns
 * every machine from five shells — while the plant is whichever shape THIS
 * shell has (§3.2). That asymmetry is the whole reason this half exists, and it
 * is invisible to any per-machine check.
 *
 * The plant is read through the real `flowCap`/`surgeCap` on a real state, at a
 * plausible investment for the shell, rather than modelled here — a hand model
 * of a power system is exactly the "sim result is a claim" failure one level
 * down.
 */
function plantAt(shellId: string, rank: number): { flow: number; surge: number } {
  const s = createEngine({ nowMs: 0 }).getState() as GameState;
  const mods = new ModifierCache();
  s.shell.current = shellId;
  s.shell.breachCount = Math.max(0, idx(shellId));
  s.depth = Math.round((allShells().find((x) => x.id === shellId)?.floorDepth ?? 100) * 0.6);
  s.depthRecords[shellId] = s.depth;
  s.kiln.built = true;
  s.kiln.heat = 1;                       // a fed Kiln: the Hearth at full
  ensurePlant(s);
  // CAPACITY IS BOUGHT WITH CORES, so the rank is Core-tree levels — the only
  // source §3.1 gives it. Reading it anywhere else would be a hand model of
  // the thing under measurement.
  s.collapse.nodes['flowCapacity'] = rank;
  s.collapse.nodes['surgeCapacity'] = rank;
  // The carried plants (§3.2): a player standing here has the signatures of
  // every shell above, which is what makes a late plant a BUILD.
  s.shell.signatures = ORDER.slice(0, idx(shellId))
    .map((id) => ({ ferrite: 'polarity', verdance: 'growth', glassmere: 'refraction', cinder: 'pressure', hollow: 'absence' } as Record<string, string>)[id])
    .filter((x): x is string => x !== undefined);
  // Each shell's own plant MACHINE standing, because a shell plant that is not
  // built reports zero and that is a different finding (it is the keystone
  // working, not a supply gap).
  s.plant!.tiers['boiler'] = 1;
  s.plant!.tiers['prism'] = 1;
  s.plant!.tiers['coil'] = 1;
  s.pressure.heat = 60;                  // a Cinder player riding the band
  s.hollow.silence = 40;                 // ...and a Hollow one deep in it
  void mods;
  return { flow: flowCap(s), surge: surgeCap(s) };
}

note('DRAW — what a shell\'s plant makes, against every machine you own by then\n');
note('  shell      rank  supply F/S      demand F/S     owned  covered');

const drawRows: Array<{ shell: string; ratio: number; owned: number }> = [];
for (const shell of ORDER) {
  const owned = Object.keys(MACHINE_DEMAND)
    .filter((m) => idx(homeShell.get(m)!) <= idx(shell));
  const demand = owned.reduce(
    (a, m) => ({ flow: a.flow + MACHINE_DEMAND[m]!.flow, surge: a.surge + MACHINE_DEMAND[m]!.surge }),
    { flow: 0, surge: 0 },
  );
  // Rank scales with the shell you are in — a Cinder player has bought more
  // Core tree than a Loam one. Deliberately generous: this is the ceiling case,
  // so a shortfall HERE is a real shortfall.
  const rank = 4 + 4 * idx(shell);
  const supply = plantAt(shell, rank);
  const covF = demand.flow === 0 ? 1 : supply.flow / demand.flow;
  const covS = demand.surge === 0 ? 1 : supply.surge / demand.surge;
  const cov = Math.min(covF, covS);
  drawRows.push({ shell, ratio: cov, owned: owned.length });
  note(
    `  ${shell.padEnd(10)} ${String(rank).padStart(3)}   `
    + `${supply.flow.toFixed(1).padStart(6)}/${supply.surge.toFixed(0).padStart(4)}   `
    + `${demand.flow.toFixed(1).padStart(6)}/${demand.surge.toFixed(0).padStart(4)}   `
    + `${String(owned.length).padStart(4)}   ${(cov * 100).toFixed(0)}%`,
  );
}

/**
 * A PLANT THAT CANNOT RUN A THIRD OF WHAT YOU OWN IS NOT SCARCITY, IT IS A
 * DEAD ROSTER. §3.1's whole design is that Draw is a real constraint you route
 * around — the Governor exists to back machines off deliberately — so anything
 * above the floor is working as intended. Below it, machines you were given are
 * machines you can never switch on together.
 */
const DRAW_FLOOR = 0.33;
for (const r of drawRows) {
  if (r.ratio < DRAW_FLOOR) {
    note(`  !! ${r.shell}: covers ${(r.ratio * 100).toFixed(0)}% of ${r.owned} owned machines — under the ${DRAW_FLOOR * 100}% floor`);
    failures += 1;
  }
}

// ---------------------------------------------------------------------------
// HALF 2 — MATERIAL: a stone from a shell you have not reached is a supply of 0
// ---------------------------------------------------------------------------
/**
 * Every material declares the shell it comes from and every machine sits in
 * one. A machine that names a stone from a DEEPER shell than its own gate has,
 * at the moment a player first builds it, a supply of exactly zero — which is
 * the sink class, and the reason it survives every other check is that both
 * halves are individually correct.
 *
 * The scan is deliberately crude (quoted ids in the machine's own module,
 * matched against the registry), because the failure is crude and a subtle
 * check would be one more thing that quietly passes. It reads what the module
 * NAMES, so a stone reached through a chain shows up under the chain's module,
 * which is where the decision about it lives.
 */
note('\n\nMATERIAL — a machine naming a stone from deeper than its own gate\n');

const MAT_SHELL = new Map(MATERIALS.map((m) => [m.id, m.shellId]));
/** Modules whose subject IS the deeper shell — a recipe table is not a gate. */
const CROSS_SHELL_BY_DESIGN = new Set([
  // §18: "each tier needs materials from the current shell AND one shell above,
  // forcing older shells to stay alive." The tool ladder is the mechanism that
  // rule is made of, so its recipes name every shell by construction.
  'forge', 'forgeParts', 'toolParts', 'casting', 'salvage',
  // The Roll and the drop tables ARE the producers; naming a deep stone there
  // is the definition of the stone existing, not a demand for one.
  'roll', 'drops', 'compaction', 'ores', 'relics', 'legendary',
]);

/**
 * COMMENTS AND TEMPLATE LITERALS ARE STRIPPED FIRST, AND THAT IS NOT TIDINESS.
 *
 * The first run of this audit reported exactly one crossing — "press, gated in
 * verdance, names nothing(hollow)" — and it was PROSE: `press.ts:226` builds a
 * refusal that ends `.join(' ') || 'nothing'`, and the Hollow ships a material
 * whose id is `nothing`. A supply audit whose one finding is a sentence in a
 * error message is worse than no audit, because the next real one arrives in a
 * list a reader has already learned to discount.
 *
 * So the scan reads DATA POSITIONS only. Ids in recipe tables live in plain
 * quoted contexts; ids in prose live inside backticks.
 */
function dataOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')     // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ') // line comments (not `https://`)
    .replace(/`(?:[^`\\]|\\.)*`/g, ' ');   // template literals — every prose string
}

/** Materials this module NAMES in a data position, deeper than `shell`. */
function deeperStones(src: string, shell: string): string[] {
  const out = new Set<string>();
  for (const m of dataOnly(src).matchAll(/'([a-z][a-z0-9]{3,})'/g)) {
    const matShell = MAT_SHELL.get(m[1]!);
    if (matShell && idx(matShell) > idx(shell)) out.add(`${m[1]!}(${matShell})`);
  }
  return [...out].sort();
}

let crossings = 0;
for (const [machine, shell] of [...homeShell].sort()) {
  if (CROSS_SHELL_BY_DESIGN.has(machine)) continue;
  const file = join(SYS, `${machine}.ts`);
  let src: string;
  try { src = readFileSync(file, 'utf8'); } catch { continue; }
  const deeper = deeperStones(src, shell);
  if (deeper.length > 0) {
    crossings += 1;
    note(`  !! ${machine.padEnd(14)} gated in ${shell.padEnd(10)} names ${deeper.join(' ')}`);
  }
}
if (crossings === 0) note('  none — every machine\'s named stone is from its own shell or above it');
failures += crossings;

/**
 * ...AND THE SCAN IS RED-TESTED, HERE, EVERY RUN.
 *
 * "None found" is the answer a broken sweep gives too, and this project has
 * shipped three instruments that reported green over a dead system. So the
 * audit plants the failure it exists to catch and refuses to pass unless it
 * sees it — and plants the prose case it got wrong first time, to prove the
 * strip is doing work rather than merely being present.
 */
const deepest = MATERIALS.find((m) => m.shellId === ORDER[ORDER.length - 2]);
if (!deepest) throw new Error('no deep material to plant — the registry moved');
const plantedData = `const RECIPE = { in: '${deepest.id}', out: 'marl' };`;
const plantedProse = 'const line = `it draws ${x} or \'' + deepest.id + '\'`;';
const sawData = deeperStones(plantedData, 'loam');
const sawProse = deeperStones(plantedProse, 'loam');
note('');
if (sawData.length !== 1) {
  note(`  !! RED-TEST FAILED: a planted '${deepest.id}' in a recipe was not seen`);
  failures += 1;
} else {
  note(`  red-test: a planted ${sawData[0]} in a recipe IS caught`);
}
if (sawProse.length !== 0) {
  note(`  !! RED-TEST FAILED: the same id in prose was reported — the press false positive is back`);
  failures += 1;
} else {
  note(`  red-test: the same id inside a template literal is NOT — prose is not demand`);
}

// ---------------------------------------------------------------------------
// HALF 3 — SINGLE-SOURCE: a stone with exactly one producer is one edit from 0
// ---------------------------------------------------------------------------
/**
 * Not a failure — a FRAGILITY REPORT, and the reason it is here is that the
 * sink class does not always arrive as "zero". It arrives as "one", and then a
 * later pass re-rolls a seam or moves a station and it becomes zero without
 * anything noticing. `material-sources.ts` already answers "does this have a
 * route"; this asks the sharper question of how many.
 */
note('\n\nFRAGILE — stones with exactly one authored seam anywhere\n');
const seamCount = new Map<string, number>();
for (const st of stations) {
  for (const id of [...(st.def.seams ?? []), ...(st.def.floodSeams ?? []), ...(st.def.remains ?? [])]) {
    seamCount.set(id, (seamCount.get(id) ?? 0) + 1);
  }
}
const single = [...seamCount].filter(([, n]) => n === 1).map(([id]) => id).sort();
note(`  ${single.length} of ${seamCount.size} seam-sourced stones sit at exactly one station`);
if (single.length > 0) note(`  ${single.slice(0, 24).join(' ')}${single.length > 24 ? ' …' : ''}`);

// ---------------------------------------------------------------------------
note(`\n${Object.keys(MACHINE_DEMAND).length} machines · ${ORDER.length} shells · ${failures} SUPPLY FAILURE(S)`);
if (failures > 0) process.exitCode = 1;
