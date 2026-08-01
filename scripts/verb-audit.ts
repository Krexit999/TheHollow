/**
 * A.44 A4 — THE INTERACTION CHECK, as a checker rather than a list.
 *
 * Part A's question: per system, is the thing the player DOES a real
 * interaction — a board, a route, a pour, a sequence — or is it a number with a
 * button next to it? SYSTEM_IMPROVEMENTS already carries the proposed verbs;
 * the audit's job is to say which systems have one TODAY, and to keep saying it
 * as the game changes.
 *
 * A prose answer would rot exactly the way the UNBUILT ledger rotted (rows
 * marked UNBUILT for two systems that had already shipped). So the
 * classification is authored here and CHECKED against the engine's real action
 * union: a system claiming a verb must name dispatchable actions that exist,
 * and a system claiming a SHAPING verb must have at least one action that is
 * not a purchase. A verb you cannot dispatch is a verb you do not have.
 *
 * KINDS
 *   shaping   the player arranges/routes/sequences something and the
 *             arrangement itself matters — a board, not a total
 *   timing    the player acts at a moment and the moment matters
 *   choosing  a real trade between named options, repeatedly revisited
 *   number    buy / allocate / toggle only — the flagged category
 *
 * `number` is not a bug on its own; some systems should be quiet. It is the
 * list to draw the next content pass from, ranked by how often the player
 * meets it — which is why FREQUENCY is recorded alongside.
 *
 *   npx tsx scripts/verb-audit.ts
 */
import { ensureContentLoaded } from '../src/engine/content';

ensureContentLoaded();

type Kind = 'shaping' | 'timing' | 'choosing' | 'number';

interface Entry {
  system: string;
  kind: Kind;
  /** What the player physically does. */
  verb: string;
  /** Dispatch actions that carry the verb. Checked to exist. */
  actions: string[];
  /** Roughly how often a player meets it over a shell arc. */
  frequency: 'constant' | 'per-run' | 'occasional' | 'rare';
  note?: string;
}

const AUDIT: Entry[] = [
  // --- constant: the things a player touches every minute -------------------
  { system: 'The Face (mining)', kind: 'timing', frequency: 'constant',
    verb: 'chip cells, hold to sustain, sweep a drag, mark cells the drills route around; FIGURES are shapes cut into the rock',
    actions: ['chip', 'sweep', 'useTechnique'] },
  { system: 'Drill Bay', kind: 'choosing', frequency: 'per-run',
    verb: 'fit heads and bits, set per-drill behaviour, name and repair them',
    actions: ['upgradeDrill', 'setDrillBehavior', 'fitDrillHead', 'fitDrillBit', 'renameDrill', 'repairDrill'] },
  { system: 'The Kiln', kind: 'choosing', frequency: 'per-run',
    verb: 'pick a fuel profile (a trade, not a ladder), overstoke for a burst, bank heat',
    actions: ['setKilnFeeding', 'setKilnFuel', 'overstoke', 'setKilnReverse'] },
  { system: 'The Stair (descent)', kind: 'number', frequency: 'constant',
    verb: 'buy the next depth',
    actions: ['descend', 'descendMany'],
    note: 'A pure number, met more often than anything else in the game. The Settling and the rail sit behind it but are not things you DO.' },

  // --- per-run --------------------------------------------------------------
  { system: 'The Collapse', kind: 'choosing', frequency: 'per-run',
    verb: 'read the run back, then choose HOW it comes down — Clean, Braced or Ember',
    actions: ['collapse', 'setAutoCollapseDepth', 'setCarryUpgrade'],
    note: 'A.45: was the top-ranked `number` here. CORRECTION to the A.44 entry, which called it "a confirm dialog" — a post-fall `RunSummaryModal` (qol.tsx, Phase 21) already showed earned/depth/vs-last, so the doc\'s "run summary" item was HALF BUILT and the audit classified the panel without checking what fires after the dispatch. What A.45 actually adds: the summary BEFORE you commit (which informs the choice rather than reporting it), what the Cores buy next, three fall types, and the column\'s trace strip. Core-NEUTRAL by construction — every fall pays the same, so A.44\'s faucet sizing stands — and Clean is the default, so the common path costs zero extra input.' },
  { system: 'The Forge', kind: 'choosing', frequency: 'per-run',
    verb: 'choose recipe, parts, materials and traits; stage a hand-craft; socket gems and alloys',
    actions: ['craftTool', 'craftFromParts', 'replacePart', 'beginCraft', 'craftStage', 'socketGem', 'socketAlloy'] },
  { system: 'The Lattice', kind: 'shaping', frequency: 'per-run',
    verb: 'place and rotate motifs on a ring board; adjacency forms chords',
    actions: ['placeMotif', 'removeMotif', 'upgradeMotif', 'buyLatticeRing', 'saveLatticeLayout'] },
  { system: 'Core tree', kind: 'number', frequency: 'per-run',
    verb: 'spend Cores on nodes',
    actions: ['buyCoreNode'],
    note: 'Per-shell build (wiped at Breach), so it is chosen fresh every world — the choice is real even though the verb is a button.' },
  { system: 'Face upgrades', kind: 'number', frequency: 'constant', verb: 'buy levels', actions: ['buyUpgrade'] },

  // --- occasional -----------------------------------------------------------
  { system: 'The Shaft / column', kind: 'shaping', frequency: 'occasional',
    verb: 'extend rail, install caches and lifts, dig excavations a shift at a time',
    actions: ['extendRail', 'installCache', 'depositCache', 'collectCache', 'installLift', 'rideLift', 'workExcavation'] },
  { system: 'Combat', kind: 'timing', frequency: 'occasional',
    verb: 'read a telegraph, step lanes, strike or guard on the beat',
    actions: ['combatEngage', 'combatTurn', 'combatFlee', 'fightWarden'] },
  { system: 'The Crucible (alloys)', kind: 'choosing', frequency: 'occasional',
    verb: 'pour metals in a ratio with a catalyst; sparse ratios are discovered',
    actions: ['pourAlloy', 'castBinding'] },
  { system: 'Refinery / transmutation', kind: 'choosing', frequency: 'occasional',
    verb: 'refine a band up, pair two materials into a third',
    actions: ['refine', 'transmute', 'salvageTool', 'bulkSalvage', 'setRefinePreset'] },
  { system: 'Workbench (cut/cast/inscribe)', kind: 'shaping', frequency: 'occasional',
    verb: 'cut a gem, cast a rune, seat runes in an ORDER that reads as grammar',
    actions: ['inscribe', 'gemCut', 'fuseGems', 'practiceRunes'] },
  { system: 'The Beam (Glassmere)', kind: 'shaping', frequency: 'occasional',
    verb: 'set rows and mirrors to route a beam across a board',
    actions: ['setBeamRow', 'setMirror', 'buyMirror'] },
  { system: 'Pressure / vents (Cinder)', kind: 'timing', frequency: 'occasional',
    verb: 'lay pipes, set the choke, purge before a flood',
    actions: ['setChoke', 'emergencyPurge', 'layPipe', 'chokeReleased'] },
  { system: 'The Guild', kind: 'choosing', frequency: 'occasional',
    verb: 'take or reroll contracts, hire crew, trade the caravan, wear a title',
    actions: ['acceptContract', 'completeContract', 'rerollContract', 'hire', 'caravanTrade', 'equipTitle'] },
  { system: 'Relics', kind: 'choosing', frequency: 'occasional',
    verb: 'read where each came from, render the spares to shards, spend those on a fusion, and build a worn set that resonates',
    actions: ['equipRelic', 'unequipRelic', 'fuseRelics', 'renderRelic', 'toggleRelicLock', 'donateRelic'],
    note: 'A.46: was flagged slot-and-stat. Now the hold is capped and the pile renders itself into the shards a fusion costs, so the spares ARE the resource; every relic carries where and by which drill it was found; carrying one wakes it (idle-friendly by construction); and a worn set can resonate. The choice is which six to wear and what to feed.' },
  { system: 'The Museum', kind: 'shaping', frequency: 'occasional',
    verb: 'choose which hall a relic stands in, study the unidentified, and rearrange until the pieces standing together mean something',
    actions: ['donateItem', 'donateRelic', 'identifyPiece', 'movePiece'],
    note: 'A.47: was a donate button. Donating also DELETED the relic, which became a bug the moment A.46 gave each one a story — the hall now keeps the instance whole, so an exhibit reads the relic\'s own record rather than restating it. Exhibits form from which pieces share a hall (same run, same drill, all deep) and are never listed before they form (pillar 5). Studying costs Scrip and is what lets a hall recognise a piece at all.' },
  { system: 'Expeditions', kind: 'choosing', frequency: 'occasional',
    verb: 'pick a route and crew, send, claim',
    actions: ['sendExpedition', 'claimExpedition'] },

  // --- rare: the ladder above a run ----------------------------------------
  { system: 'The Breach', kind: 'number', frequency: 'rare',
    verb: 'set the keystone, then fall through',
    actions: ['breach', 'placeKeystone'] },
  { system: 'Confluences / Echoes', kind: 'choosing', frequency: 'rare',
    verb: 'buy slots and set which confluence each amplifies',
    actions: ['confluenceBuySlot', 'confluenceSetSlot', 'confluenceBuyRank', 'buyResonantMemory'] },
  { system: 'Recursion / Axioms', kind: 'choosing', frequency: 'rare',
    verb: 'touch the Core, then choose which law to write',
    actions: ['touchCore', 'recurse', 'buyAxiom'],
    note: 'The choice is real (20 authored laws, and they are rule rewrites) — A.44 re-rated the ladder so a first Recursion can actually reach one.' },
  { system: 'Automation Grid (Spiral)', kind: 'shaping', frequency: 'rare',
    verb: 'place modules on a 16-cell board where adjacency pays',
    actions: ['spiral', 'buyGridSlot', 'buyLicence', 'placeModule', 'clearModule', 'licenseShell', 'setShellPolicy'],
    note: 'A genuine board that was priced 16x out of reach until A.44 re-rated it. The verb was always there; nobody could buy it.' },
  { system: 'Challenges', kind: 'choosing', frequency: 'rare',
    verb: 'enter a sealed world that forbids one thing you rely on',
    actions: ['startChallenge', 'abandonChallenge'] },
  { system: 'Delver skill tree', kind: 'number', frequency: 'rare',
    verb: 'spend points, free respec',
    actions: ['buySkillNode', 'respecSkills'],
    note: 'Flagged, and already ledgered short at 24/66 nodes.' },
];

// ---------------------------------------------------------------------------
// The check: a claimed verb must be dispatchable, and a shaping/timing verb
// must involve something other than buying.
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
const typesSrc = readFileSync('src/engine/types.ts', 'utf8');
const REAL = new Set([...typesSrc.matchAll(/\{ type: '(\w+)'/g)].map((m) => m[1]!));

let bad = 0;
const fail = (msg: string): void => { console.error(`  VIOLATION: ${msg}`); bad++; };

for (const e of AUDIT) {
  if (e.actions.length === 0) fail(`${e.system} claims a verb with no actions`);
  for (const a of e.actions) {
    if (!REAL.has(a)) fail(`${e.system} names '${a}', which is not a dispatchable action`);
  }
  if (e.kind === 'shaping' || e.kind === 'timing') {
    const nonPurchase = e.actions.filter((a) => !/^buy|^purchase/.test(a));
    if (nonPurchase.length === 0) {
      fail(`${e.system} is marked ${e.kind} but every action is a purchase — that is a number`);
    }
  }
}

const byKind = (k: Kind) => AUDIT.filter((e) => e.kind === k);
console.log('THE INTERACTION CHECK (A.44 A4)\n');
for (const k of ['shaping', 'timing', 'choosing', 'number'] as Kind[]) {
  const rows = byKind(k);
  console.log(`${k.toUpperCase()} — ${rows.length}`);
  for (const e of rows) console.log(`  ${e.frequency.padEnd(10)} ${e.system}`);
  console.log();
}

console.log('FLAGGED — a number, ranked by how often the player meets it:');
const rank = { constant: 0, 'per-run': 1, occasional: 2, rare: 3 };
for (const e of byKind('number').sort((a, b) => rank[a.frequency] - rank[b.frequency])) {
  console.log(`  ${e.frequency.padEnd(10)} ${e.system}${e.note ? `\n               ${e.note}` : ''}`);
}

console.log(`\n${AUDIT.length} systems | shaping ${byKind('shaping').length} · timing ${byKind('timing').length} · ` +
  `choosing ${byKind('choosing').length} · number ${byKind('number').length}`);
console.log(bad === 0 ? 'VERB AUDIT: ok — every claimed verb is dispatchable' : `VERB AUDIT: ${bad} VIOLATION(S)`);
if (bad > 0) process.exit(1);
