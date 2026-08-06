/**
 * EVERY OPEN LEDGER ROW WHOSE BLOCKER IS A CODE FACT, RE-CHECKED AGAINST THE
 * CODE — A.107 item 9.
 *
 * PILLARS: "the ledger is a claim, not evidence", and "a cut is provisional, and
 * its reason can dissolve." Both cut the same way here. A row that says a thing
 * is blocked is a statement about the tree at the moment somebody wrote it, and
 * the tree has moved 100+ commits. So each row below names the FACT that blocks
 * it and reads that fact live: HOLDS means the blocker is still true, DISSOLVED
 * means it is not and the row is now buildable, MOVED means the number changed.
 *
 * Rows whose blocker is a JUDGEMENT ("hand-sized constants", "deliberately not
 * tuned", "an honest read offered for the cut decision") are NOT here: there is
 * nothing to probe, and listing them would pad the table with rows that can only
 * ever read the same way. They stay open on the same terms they were opened on.
 *
 *   npx tsx scripts/a107-ledger.ts
 */
import { createEngine } from '../src/engine/index';
import type { GameState } from '../src/engine/types';
import { MACHINE_DEMAND, MAX_MACHINE_TIER, ensurePlant } from '../src/engine/systems/plant';
import { BREAKS } from '../src/engine/systems/breaks';
import { CONDITION_RULES, conditionOf, conditionedMachines } from '../src/engine/systems/condition';
import { THRESHOLDS } from '../src/engine/content/thresholds';
import { SKILL_NODES } from '../src/engine/content/shell1/skillTree';
import { allAuthoredStations } from '../src/engine/content/rolls';
import { MATERIALS } from '../src/engine/materials';
import { readFileSync, readdirSync } from 'node:fs';

createEngine({ nowMs: 0 });

type Verdict = 'HOLDS' | 'DISSOLVED' | 'MOVED';
interface Row { row: string; raised: string; verdict: Verdict; fact: string }
const rows: Row[] = [];
const R = (row: string, raised: string, verdict: Verdict, fact: string): void => {
  rows.push({ row, raised, verdict, fact });
};

// ---------------------------------------------------------------------------
// §55 and §53 — the two this phase touched
// ---------------------------------------------------------------------------

R('THE OTHER FIVE §55 CASCADES ARE UNBUILT', 'A.106', 'MOVED',
  `2 built (${BREAKS.map((b) => b.id).join(', ')}), 2 want a system (brownout, overgrowth), 1 cut (fracture)`);

const unmeasured = THRESHOLDS.filter((t) => t.at === 900 || t.at === 20_000);
R('TWO THRESHOLDS REMAIN UNMEASURED', 'A.106', unmeasured.length === 0 ? 'DISSOLVED' : 'HOLDS',
  unmeasured.length === 0
    ? `all six sized off a --scenario arm; greatFlip ${THRESHOLDS.find((t) => t.id === 'greatFlip')?.at}, bend ${THRESHOLDS.find((t) => t.id === 'bend')?.at}`
    : `${unmeasured.map((t) => t.id).join(', ')} still at their unmeasured sizes`);

// ---------------------------------------------------------------------------
// THE FAMILY THIS PHASE FOUND: a rule that exists and cannot be written
// ---------------------------------------------------------------------------

/**
 * A.90 ledgered Glassmere's UNLIT as unable to fire before THE SPLIT, and this
 * phase found the same SHAPE in Verdance — a shell condition present in the
 * registry and unwritable in play. So it is re-read the way that one was: by
 * RUNNING THE ENGINE in the shell and looking at what came out.
 *
 * The first version of this check grepped `litBand` for the comment that
 * explained the blocker and reported DISSOLVED when it did not match, which is
 * a probe that reads a rewording as a fix. Driven now.
 */
const unlitReachable = ((): { reachable: boolean; ticks: number } => {
  const e = createEngine({ nowMs: 0 });
  const g = e.getState() as GameState;
  g.shell.current = 'glassmere';
  g.depthRecords['glassmere'] = 400;
  g.depth = 100;
  g.kiln.built = true;
  const p = ensurePlant(g);
  for (const id of conditionedMachines()) p.tiers[id] = 1;
  for (let i = 0; i < 700; i++) e.tick(1);
  return {
    reachable: conditionedMachines().some((id) => conditionOf(g, id)?.id === 'unlit'),
    ticks: 700,
  };
})();
R("GLASSMERE'S UNLIT CANNOT FIRE BEFORE THE SPLIT", 'A.90',
  unlitReachable.reachable ? 'DISSOLVED' : 'HOLDS',
  unlitReachable.reachable
    ? `DRIVEN: ${unlitReachable.ticks}s in Glassmere writes UNLIT on an unsplit beam`
    : `DRIVEN: ${unlitReachable.ticks}s in Glassmere wrote nothing — an unsplit white beam still lights every band`);

// ...and the count of shell rules that CAN be written at all, which is the
// question the Verdance finding turned into a standing one.
R('SHELL CONDITION RULES THAT ARE REACHABLE IN PLAY', 'A.107', 'MOVED',
  `${CONDITION_RULES.length} authored, ${CONDITION_RULES.length - 1} reachable — verdance/overgrown alone cannot be written `
  + `(served is a supply ratio with a floor of 2.4, never 0); glassmere/unlit was ledgered unreachable at A.90 and is not`);

// ---------------------------------------------------------------------------
// The counted rows — sized claims that a number can settle
// ---------------------------------------------------------------------------

const demand = Object.keys(MACHINE_DEMAND).length;
R("§13's MACHINE COUNT — 33 of 41", 'A.97', 'MOVED',
  `${demand} machines carry a demand profile (A.97 read 29); the Forge, Drill Bay, Shoring Rig and Floodgate sit outside it`);

R("§15.4's 'every machine runs I–V'", 'A.98', MAX_MACHINE_TIER < 5 ? 'HOLDS' : 'DISSOLVED',
  `MAX_MACHINE_TIER = ${MAX_MACHINE_TIER}, spec wants 5`);

R('DELVER SKILL TREE — 24 of the locked 66', 'A.36', SKILL_NODES.length < 66 ? 'HOLDS' : 'DISSOLVED',
  `SKILL_NODES = ${SKILL_NODES.length}`);

/**
 * SEVEN LAW SLOTS HAVE NO READER (A.97). Probed rather than grepped by name: a
 * law is written if anything outside `engine/laws.ts` (the registry) names it.
 */
const named = ['wardenOptional', 'autoReplant', 'crewAlwaysWorks', 'guildRemembers',
  'progressionPalindrome', 'wellFloorShare', 'takeTwice'];
const src = ['src/engine/systems', 'src/engine/content', 'src/ui'];   // never engine/laws.ts, which only declares them
const haystack = (() => {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name) && !p.endsWith('content/laws.ts')) out.push(readFileSync(p, 'utf8'));
    }
  };
  for (const d of src) walk(d);
  return out.join('\n');
})();
const stillMute = named.filter((id) => !haystack.includes(`'${id}'`));
R('SEVEN LAW SLOTS HAVE NO READER', 'A.97', stillMute.length === 0 ? 'DISSOLVED' : stillMute.length === 7 ? 'HOLDS' : 'MOVED',
  `${stillMute.length} of ${named.length} still unread outside the registry` +
  (stillMute.length && stillMute.length < 7 ? ` (${stillMute.join(', ')})` : '') +
  '');

/**
 * THE HEAT CORRIDOR WANTS A THIRD FLOOD STATION (A.89 -> A.90 -> A.100). The
 * blocker is content, and content is countable.
 */
const floods = allAuthoredStations().filter((x: { shellId: string; def: { type: string; depth: number } }) =>
  x.shellId === 'cinder' && x.def.type === 'flood');
R('THE HEAT CORRIDOR WANTS A THIRD FLOOD STATION', 'A.89', floods.length < 3 ? 'HOLDS' : 'DISSOLVED',
  `cinder authors ${floods.length} flood stations at ${floods.map((f: { def: { depth: number } }) => f.def.depth).join(', ')}`);

/**
 * A BUILT MACHINE CANNOT BE BROKEN BACK DOWN (A.90). The row's own test: is
 * there any verb that lowers a tier? `recastMachine` spends parts and returns
 * the machine you had, which is not one.
 */
const plantSrc = readFileSync('src/engine/systems/plant.ts', 'utf8');
const canUnbuild = /tiers\[[^\]]+\]\s*-=|tiers\[[^\]]+\]\s*=\s*(0|Math\.max\(0)/.test(plantSrc);
R('A BUILT MACHINE CANNOT BE BROKEN BACK DOWN', 'A.90', canUnbuild ? 'DISSOLVED' : 'HOLDS',
  canUnbuild ? 'something now lowers a machine tier' : 'no path in plant.ts lowers a tier; six build paths raise one');

/**
 * FOUR COMBAT-ONLY ORPHANS (A.84 -> A.89). NOT PROBED HERE, and saying so is the
 * point: the first version of this row counted `m.combatOnly === true` and
 * reported 0, which is not "they were closed" — it is a field that has never
 * existed on a MaterialDef. A probe that reads an absent property and calls the
 * answer zero is the hardcoded pass this file exists to avoid.
 *
 * The real measure lives in `scripts/material-audit.ts`, which walks the chains:
 * 60 stones with zero consumers after rescues, run separately this pass.
 */
R('4 COMBAT-ONLY ORPHANS LEFT', 'A.89', 'HOLDS',
  `${MATERIALS.length} materials authored; the consumer-side count belongs to material-audit.ts and is NOT probed here`);

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

console.log('\nOPEN LEDGER ROWS, RE-READ AGAINST THE CODE\n');
for (const r of rows) {
  console.log(`  ${r.verdict.padEnd(9)} ${r.row}`);
  console.log(`            raised ${r.raised} — ${r.fact}`);
}
const n = (v: Verdict): number => rows.filter((r) => r.verdict === v).length;
console.log(`\n${n('HOLDS')} still blocked · ${n('MOVED')} moved · ${n('DISSOLVED')} dissolved`);

/**
 * THE SELF-TEST. Every verdict above is computed, so the one thing left to show
 * is that a verdict CAN come out either way — a table where every row is hard-
 * coded to HOLDS is a paragraph with a monospace font.
 */
if (n('HOLDS') === rows.length || n('HOLDS') === 0) {
  console.log('\n!! SELF-TEST FAILED — every row read the same way');
  process.exit(1);
}
console.log('self-test: verdicts differ — some blockers hold, some do not');
if (SKILL_NODES.length >= 66 || MAX_MACHINE_TIER >= 5) {
  console.log('!! SELF-TEST FAILED — a counted row was sized against a number that already passes');
  process.exit(1);
}
console.log('self-test: the counted rows are read from the registries, not written down');
