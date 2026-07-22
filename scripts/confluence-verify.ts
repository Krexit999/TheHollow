/**
 * CONFLUENCE VERIFICATION — does the cross-system layer actually reach a
 * player, and does it stay inside the constraint that makes it safe?
 *
 * Unit tests prove each condition evaluates. This proves the loop: a state a
 * real player could be in gets noticed by the running engine, recorded, paid
 * through the modifier pipeline, and dropped again when the condition lapses.
 *
 *   npx tsx scripts/confluence-verify.ts
 */
import { ensureContentLoaded } from '../src/engine/content';
ensureContentLoaded();
import { createEngine } from '../src/engine';
import type { GameState } from '../src/engine/types';
import { CONFLUENCES, activeConfluences } from '../src/engine/systems/confluence';
import { computeBucket } from '../src/engine/modifiers';

let failures = 0;
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

console.log('\nCONFLUENCES — verification\n');
console.log(`  ${CONFLUENCES.length} confluences across ${
  new Set(CONFLUENCES.flatMap((c) => c.systems)).size
} systems\n`);

// --- 1. The loop actually closes on a running engine ------------------------
console.log('1. does the running engine notice one?');
{
  const eng = createEngine({ nowMs: 0 });
  const s = eng.getState() as GameState;
  // Measure BEFORE the condition exists — the first draft read this after
  // setting the relics, so it compared an already-active bucket with itself.
  const before = computeBucket(s, 'dropRate').toNumber();
  s.relics.held = [1, 2, 3].map((uid) => ({
    uid, defId: 'warren-1', rarity: 2, affixes: { dropRate: 0.1 }, source: 'warren', fusedFrom: 0,
  }));
  for (let i = 0; i < 5; i++) eng.tick(1);
  const after = eng.getState();
  check(after.confluences.found.includes('warrenFlavour'), 'the tick recorded it');
  check(
    computeBucket(after as GameState, 'dropRate').toNumber() > before,
    'and it is paying through the modifier pipeline',
    `${before.toFixed(3)} → ${computeBucket(after as GameState, 'dropRate').toNumber().toFixed(3)}`,
  );
}

// --- 2. Every confluence is REACHABLE at all --------------------------------
// A condition nobody can satisfy is content that does not exist. This drives
// each one to true by hand and asserts it flips.
console.log('\n2. is every confluence reachable?');
{
  const eng = createEngine({ nowMs: 0 });
  const s = eng.getState() as GameState;
  // A late-game state: everything unlocked, every codex partly full.
  s.shell.current = 'aleph';
  s.shell.signatures = ['seepage', 'polarity', 'growth', 'refraction', 'pressure', 'absence'];
  s.depthRecords = { loam: 300, ferrite: 300, verdance: 300, glassmere: 300, cinder: 300, hollow: 300, aleph: 40 };
  s.lattice.discovered = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  s.crucible.discovered = ['a', 'b', 'c', 'd', 'e', 'f'];
  s.loom.discoveredShapes = ['a', 'b', 'c'];
  s.bench.solved = ['a', 'b', 'c', 'd'];
  s.brewing.discovered = ['a', 'b', 'c', 'd'];
  s.greenhouse.codex = ['a+b', 'c+d', 'e+f', 'g+h', 'i+j', 'k+l', 'm+n', 'o+p', 'q+r'];
  s.ember.bestSustainSec = 300;
  s.chamber.tape = [{ action: {}, label: 'x' }];
  s.combat.seen = Array.from({ length: 20 }, (_, i) => `sp${i}`);
  s.combat.kills = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`sp${i}`, 3]));
  s.anomalies.resolved = 5;
  s.museum.completed = ['a', 'b', 'c', 'd'];
  s.expeditions.completed = 8;
  s.relics.held = [1, 2, 3, 4].map((uid) => ({
    uid, defId: 'warren-1', rarity: 2, affixes: {}, source: 'warren', fusedFrom: 0,
  }));
  const tool = s.forge.tools.find((t) => t.id === s.forge.equipped);
  if (tool) {
    tool.alloys = ['a', 'b', 'c'];
    tool.sockets = ['bloodgarnet', null, null];
  }
  s.runes.inscriptions['tool'] = ['kel', 'thur', 'ash'];
  // Phase 16: the smithing depth. A fully-played state has a tempered tool,
  // a closed salvage loop, and chains worked out.
  if (tool) {
    tool.temper = 'ember';
    tool.parts = {
      head: { materialId: 'polarite', purity: 60 }, // charged+keen
      haft: { materialId: 'stormcore', purity: 60 }, // charged+warm
      binding: { materialId: 'ochre', purity: 60 },
    };
  }
  s.forge.salvaged = 5;
  s.refinery.found = ['slagToClay', 'palegoldBinder', 'trueFromScale'];

  const live = new Set(activeConfluences(s).map((c) => c.id));
  // Weather-gated ones need their segment; report them separately rather than
  // pretending a fixed clock covers them.
  // Weather reads neutral until the Guild opens (the Lamphouse folk are the
  // ones who NAME the weather), so a real weather state needs this set.
  s.guild.discovered = true;
  const weatherGated = ['stormChord', 'warmBoard', 'chargedInStorm'];
  const unreachable = CONFLUENCES.filter((c) => !live.has(c.id) && !weatherGated.includes(c.id));
  check(
    unreachable.length === 0,
    'every non-weather confluence fires in a fully-played state',
    unreachable.length > 0 ? `dead: ${unreachable.map((c) => c.id).join(', ')}` : `${live.size} live`,
  );

  // Weather ones: force the segment and check they can fire.
  for (const id of weatherGated) {
    const def = CONFLUENCES.find((c) => c.id === id)!;
    let everTrue = false;
    for (let seg = 0; seg < 40; seg++) {
      s.guild.clockMs = seg * 50 * 60_000;
      s.shell.current = (id === 'stormChord' || id === 'chargedInStorm') ? 'ferrite' : 'loam';
      if (def.active(s)) { everTrue = true; break; }
    }
    check(everTrue, `weather confluence '${id}' can fire`, everTrue ? '' : 'never true in 40 segments');
  }
}

// --- 3. The constraint: a bonus for having both, never a requirement --------
console.log('\n3. does ignoring a system lock anything?');
{
  // A player who never brews: every non-brew confluence must still be
  // reachable, and the game must not refuse them anything.
  const eng = createEngine({ nowMs: 0 });
  const s = eng.getState() as GameState;
  s.brewing.discovered = [];
  s.relics.held = [1, 2, 3].map((uid) => ({
    uid, defId: 'warren-1', rarity: 1, affixes: {}, source: 'warren', fusedFrom: 0,
  }));
  for (let i = 0; i < 5; i++) eng.tick(1);
  const after = eng.getState();
  check(after.confluences.found.includes('warrenFlavour'), 'a non-brewer still finds unrelated confluences');
  check(eng.dispatch({ type: 'chip', cell: 0 }).ok, 'and the game refuses them nothing');

  const brewOnes = CONFLUENCES.filter((c) => c.systems.includes('brew'));
  check(brewOnes.length < CONFLUENCES.length / 3, 'no single system dominates the layer', `${brewOnes.length}/${CONFLUENCES.length} need brewing`);
}

// --- 4. Total magnitude stays a seasoning, not a second economy -------------
console.log('\n4. how much is the whole layer worth at once?');
{
  const byBucket = new Map<string, number>();
  for (const c of CONFLUENCES) byBucket.set(c.bucket, (byBucket.get(c.bucket) ?? 0) + c.bonus);
  const worst = [...byBucket.entries()].sort((a, b) => b[1] - a[1])[0]!;
  check(worst[1] <= 0.75, 'even every confluence at once stays under +75% on one bucket', `${worst[0]} +${Math.round(worst[1] * 100)}%`);
  console.log('      per-bucket totals: ' + [...byBucket.entries()].map(([b, v]) => `${b} +${Math.round(v * 100)}%`).join(', '));
}

console.log(failures === 0 ? '\nCONFLUENCES VERIFIED ✓' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
