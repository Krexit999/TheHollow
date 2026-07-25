/**
 * A.44 — CAN THE AUTHOR BE BEATEN? The harness-vs-game question at the Core.
 *
 * The sim cannot complete a Recursion. It is NOT that no policy tries: the
 * policy dispatches `fightWarden` at the aleph floor every 120s, fights it
 * MANUALLY through the real turn engine (the last two wardens are boss fights),
 * then dispatches `touchCore` and `recurse`. It simply loses, every time — 30
 * losses in one sim-hour with the full endgame kit.
 *
 * The suspicious shape: `MAX_TOOL_TIER` is 15, and the last three wardens are
 * tier 16 (Stillwarden), 17 (The Unattended) and 18 (The Author). The final
 * gate sits three tiers above the top of the tool ladder. And the recursion
 * scenario HAND-INJECTS loam..hollow as felled, so The Author is the only late
 * warden this project has ever actually fought — the other two have never been
 * tested at all.
 *
 * This probe answers the one question a ruling needs: with the best kit the
 * game can produce, at the best skill the AI can play, what is the win rate?
 * A game answer (unwinnable by construction) and a harness answer (winnable,
 * the AI is bad) need opposite fixes, so guessing is not allowed.
 *
 *   npx tsx scripts/a44-author.ts
 */
import { createEngine } from '../src/engine/index';
import type { GameState } from '../src/engine/types';
import { wardenOf } from '../src/engine/combat/species';
import { MAX_TOOL_TIER } from '../src/engine/systems/forge';
import { ACHIEVEMENTS } from '../src/engine/content/shell1/achievements';

const TRIALS = 200;

/** The endgame kit, matching `--scenario recursion` exactly. */
function primed(): { engine: ReturnType<typeof createEngine>; s: GameState } {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  s.shell.current = 'aleph';
  s.shell.breachCount = 6;
  s.depth = 40;
  s.maxDepthRecord = 560;
  s.delver.level = 200;
  s.delver.skills['twoHandedSwing'] = 5;
  s.delver.skills['deepGrip'] = 5;
  s.delver.skills['heavyHands'] = 3;
  s.forge.tools.push({
    id: 91, recipeId: 'cinderMaul', name: 'Cinder Maul', tier: 15,
    purity: 88, chipPower: 66, strikePower: 1500,
    sockets: ['bloodgarnet', 'cinderquartz'], alloys: ['greysteel'],
  } as GameState['forge']['tools'][number]);
  s.forge.equipped = s.forge.tools.length - 1;
  s.forge.gear.offhand = { defId: 'authorsRule', purity: 70 };
  s.forge.gear.harness = { defId: 'emberweave', purity: 70 };
  s.forge.gear.lantern = { defId: 'unblinkingMonocle', purity: 70 };
  s.forge.gear.boots = { defId: 'stokersGauntlet', purity: 70 };
  return { engine, s };
}

/**
 * The sim's own turn AI, at its BEST setting (optimal: answers 97%).
 *
 * Returns what the fight actually looked like. The first cut of this probe read
 * `combat.active?.enemyHp ?? 0` AFTER the loop — but `combat.active` is null the
 * moment a fight ends either way, so every loss reported "88000/88000 damage
 * dealt, 100% of the bar". A confident, meaningless number, produced by the
 * probe written to stop producing confident meaningless numbers. Sampled per
 * turn instead.
 */
function playOut(
  engine: ReturnType<typeof createEngine>,
  s: GameState,
): { minEnemyHp: number; minPlayerHp: number; turns: number } {
  let guard = 400;
  let minEnemyHp = s.combat.active?.enemyHp ?? Infinity;
  let minPlayerHp = s.combat.active?.playerHp ?? Infinity;
  let turns = 0;
  while (s.combat.active && guard-- > 0) {
    minEnemyHp = Math.min(minEnemyHp, s.combat.active.enemyHp);
    minPlayerHp = Math.min(minPlayerHp, s.combat.active.playerHp);
    turns++;
    const fight = s.combat.active;
    const tg = fight.telegraph;
    let move: -1 | 0 | 1 = 0;
    let act: 'strike' | 'guard' = 'strike';
    // Verbatim from sim.ts fightManually at `optimal`, field-for-field.
    if (tg && tg.windup === 0 && Math.random() < 0.97) {
      let bestScore = -Infinity;
      let safeExists = false;
      for (const m of [-1, 0, 1] as const) {
        const lane = Math.max(0, Math.min(4, fight.playerLane + m));
        const safe = !tg.lanes.includes(lane);
        const flank = Math.abs(lane - fight.enemyLane) === 1 ? 1 : 0;
        const score = (safe ? 10 : 0) + flank + (m === 0 ? 0.1 : 0);
        if (safe) safeExists = true;
        if (score > bestScore) { bestScore = score; move = m; }
      }
      if (!safeExists) act = 'guard';
    } else if (!tg || tg.windup > 0) {
      const d = fight.enemyLane - fight.playerLane;
      move = d > 1 ? 1 : d < -1 ? -1 : Math.abs(d) === 1 ? 0 : fight.playerLane > 0 ? -1 : 1;
    }
    if (!engine.dispatch({ type: 'combatTurn', move, act, timing: 1.5 }).ok) break;
  }
  return { minEnemyHp, minPlayerHp, turns };
}

const warden = wardenOf('aleph')!;
console.log(`THE AUTHOR — tier ${warden.tier}, hp ${warden.hp}, power ${warden.power}`);
console.log(`MAX_TOOL_TIER = ${MAX_TOOL_TIER}  (the gate is ${warden.tier - MAX_TOOL_TIER} tiers above the ladder)\n`);

let wins = 0;
let bestBarTaken = 0; // most of the warden's hp any attempt removed
const barTaken: number[] = [];
const turnCounts: number[] = [];
for (let i = 0; i < TRIALS; i++) {
  const { engine, s } = primed();
  if (!engine.dispatch({ type: 'fightWarden', auto: false }).ok) {
    console.log('fightWarden refused — cannot even start the fight');
    break;
  }
  const startHp = s.combat.active?.enemyHp ?? warden.hp;
  const r = playOut(engine, s);
  const after = engine.getState() as GameState;
  if (after.combat.wardens.includes('aleph')) wins++;
  const took = (startHp - r.minEnemyHp) / warden.hp;
  barTaken.push(took);
  turnCounts.push(r.turns);
  bestBarTaken = Math.max(bestBarTaken, took);
}
const med = barTaken.sort((a, b) => a - b)[Math.floor(barTaken.length / 2)] ?? 0;
const medTurns = turnCounts.sort((a, b) => a - b)[Math.floor(turnCounts.length / 2)] ?? 0;
console.log(`manual AI at 97% read, ${TRIALS} trials: ${wins} wins (${((wins / TRIALS) * 100).toFixed(1)}%)`);
console.log(`median attempt removed ${(med * 100).toFixed(1)}% of the warden's bar in ${medTurns} turns`);
console.log(`best single attempt removed ${(bestBarTaken * 100).toFixed(1)}%`);

// The auto resolver, for contrast — the "worst case" floor guarantee.
let autoWins = 0;
for (let i = 0; i < TRIALS; i++) {
  const { engine, s } = primed();
  engine.dispatch({ type: 'fightWarden', auto: true });
  if ((engine.getState() as GameState).combat.wardens.includes('aleph')) autoWins++;
  void s;
}
console.log(`auto resolver, ${TRIALS} trials: ${autoWins} wins (${((autoWins / TRIALS) * 100).toFixed(1)}%)`);

// ---------------------------------------------------------------------------
// HOW FAR OFF IS IT? The scenario's kit is hand-authored and carries no relics,
// runes, temper, brews, museum or achievement multipliers, so "0 wins" is not
// yet "unwinnable" — it is "unwinnable with THIS kit". Scale the striking arm
// until the fight turns, and the shortfall becomes a number a ruling can use:
// either real endgame systems can supply that factor, or the gate is mispriced.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// THE HYPOTHESIS: it is the KIT, not the warden. `strikePower` is a modifier
// bucket, and ~18 achievements feed it (1.05–1.20 each) alongside the core
// tree, a lattice chord and brews — none of which `--scenario recursion`
// grants. A player who reached the Core has essentially all of them.
// ---------------------------------------------------------------------------
{
  let w = 0;
  const N = 200;
  for (let i = 0; i < N; i++) {
    const { engine, s } = primed();
    for (const a of ACHIEVEMENTS) s.achievements.unlocked[a.id] = true;
    engine.dispatch({ type: 'fightWarden', auto: false });
    playOut(engine, s);
    if ((engine.getState() as GameState).combat.wardens.includes('aleph')) w++;
  }
  console.log(`\nsame kit + every achievement unlocked: ${w}/${N} wins (${((w / N) * 100).toFixed(1)}%)`);
}

console.log('\nstrike× needed (median of 60 trials each):');
for (const k of [1, 2, 3, 5, 8, 12, 20, 40]) {
  let w = 0;
  const N = 60;
  for (let i = 0; i < N; i++) {
    const { engine, s } = primed();
    s.forge.tools[s.forge.equipped]!.strikePower = 1500 * k;
    engine.dispatch({ type: 'fightWarden', auto: false });
    playOut(engine, s);
    if ((engine.getState() as GameState).combat.wardens.includes('aleph')) w++;
  }
  console.log(`  strike ×${String(k).padStart(2)} (${String(1500 * k).padStart(6)}): ` +
    `${String(w).padStart(2)}/${N} wins (${((w / N) * 100).toFixed(0)}%)`);
}
