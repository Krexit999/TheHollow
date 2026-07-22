/**
 * ANOMALIES — rare events while mining, retrofit across all five shells.
 * A vein that screams. A cell with no bottom. A merchant who should not be
 * down here. Short, weird, occasionally very lucrative.
 *
 * THE CONSTRAINTS (charter):
 *  - Never punishing to miss: an unanswered anomaly SETTLES after 30 min of
 *    play — neutrally, costing nothing, still counted as seen.
 *  - Never requires presence to resolve safely: settling IS the safe
 *    resolution; answering is strictly opt-in upside.
 *  - Rare enough to stay an event on hour 80: one every 2.5-4 hours of
 *    PLAYED time (the schedule only advances while you play — being away
 *    never eats one), and none before the first Breach (the Loam teaching
 *    hours stay clean).
 */
import { D } from '../decimal';
import type { ActionResult, EngineCtx, GameState } from '../types';
import type { ModifierCache } from '../modifiers';
import { addCurrency } from '../resources';
import { chipYield, dpsMax } from './face';
import { chipCurrencyId, currentShell } from '../shells';
import { applyDrop } from './drops';
import { startFight } from '../combat/combat';
import { GEMS, rollDrop } from '../materials';

export const ANOMALY_MIN_GAP_SEC = 9000; // 2.5h of play...
export const ANOMALY_GAP_SPREAD_SEC = 5400; // ...to 4h
export const ANOMALY_SETTLE_SEC = 1800;
/** An ignored anomaly still pays a quarter-minute of your own ceiling — small,
 * never nothing. Ceiling-bound by construction: it is YOUR dpsMax, so it can
 * never outrun the field (pillar 2). */
export const SETTLE_SHARE = 0.25; // unanswered, it settles harmlessly

export interface AnomalyDef {
  id: string;
  name: string;
  /** null = any shell; otherwise only spawns there. */
  shellId: string | null;
  banner: string;
  answerLabel: string;
  settleLine: string;
  apply: (state: GameState, mods: ModifierCache, ctx: EngineCtx) => string;
}

const FIGHTABLE: Record<string, string> = {
  loam: 'gravegnaw', ferrite: 'lodecrab', verdance: 'rootboar', glassmere: 'rimeshade', cinder: 'slagworm',
  hollow: 'nullwisp', aleph: 'absentling',
};

export const ANOMALIES: AnomalyDef[] = [
  {
    id: 'screamingVein', name: 'A Vein That Screams', shellId: null,
    banner: 'A seam in the wall is screaming. Quietly, but definitely.',
    answerLabel: 'Cut it open',
    settleLine: 'The scream faded to a hum, then to nothing. The seam sealed itself.',
    apply: (s, mods, ctx) => {
      addCurrency(s, chipCurrencyId(s), chipYield(s, mods).mul(600));
      startFight(s, ctx, FIGHTABLE[currentShell(s).id] ?? 'gravegnaw');
      return 'It was full of ore and OPINIONS. Something is coming out with it.';
    },
  },
  {
    id: 'bottomlessCell', name: 'The Bottomless Cell', shellId: null,
    banner: 'One cell refills as fast as you empty it. That is not how rock works.',
    answerLabel: 'Drink it dry anyway',
    settleLine: 'The cell quietly remembered how bottoms work.',
    apply: (s, mods, _ctx) => {
      // A bounded gift, not a faucet: ninety chips' worth, then it closes.
      addCurrency(s, chipCurrencyId(s), chipYield(s, mods).mul(90));
      return 'Ninety strokes before it found its floor. A good argument while it lasted.';
    },
  },
  {
    id: 'hostileCrystal', name: 'A Hostile Crystal', shellId: null,
    banner: 'A crystal has grown overnight. It is facing you. Crystals do not face.',
    answerLabel: 'Crack it',
    settleLine: 'The crystal lost interest and became geology again.',
    apply: (s, _mods, ctx) => {
      const gem = GEMS[Math.floor(Math.random() * GEMS.length)]!;
      s.materials.gems[gem.id] = (s.materials.gems[gem.id] ?? 0) + 1;
      startFight(s, ctx, FIGHTABLE[currentShell(s).id] ?? 'gravegnaw');
      return `A ${gem.name} at its heart — and the thing that grew around it wants it back.`;
    },
  },
  {
    id: 'strayMerchant', name: 'A Merchant, Somehow', shellId: null,
    banner: 'There is a man with a cart at this depth. There is no road at this depth.',
    answerLabel: 'Trade',
    settleLine: 'When you looked again the cart was gone. The wheel-ruts stop mid-tunnel.',
    apply: (s, _mods, ctx) => {
      s.anomalies.merchantMeets += 1;
      const shell = currentShell(s).id;
      for (let i = 0; i < 3; i++) {
        const drop = rollDrop(shell, Math.max(45, s.depth));
        applyDrop(s, ctx, drop);
      }
      addCurrency(s, 'scrip', D(40));
      return 'He would not say how he got here. He overpaid, apologized for it, and left uphill. There is no uphill.';
    },
  },
  {
    id: 'echoPocket', name: 'An Echo Pocket', shellId: null,
    banner: 'Your pick rings back a fifth higher, one beat late.',
    answerLabel: 'Sing into it',
    settleLine: 'The pocket sang itself out.',
    apply: (s) => {
      addCurrency(s, 'motif', D(12));
      return 'The rock harmonized. Twelve Motifs, transcribed on the spot.';
    },
  },
  {
    id: 'weepingSeam', name: 'The Weeping Seam', shellId: null,
    banner: 'A seam is weeping something clear. The drops land upward.',
    answerLabel: 'Bottle the drops',
    settleLine: 'The seam cried itself out and closed.',
    apply: (s, _mods, ctx) => {
      for (let i = 0; i < 5; i++) {
        const drop = rollDrop(currentShell(s).id, s.depth, () => 0.5 + Math.random() * 0.5);
        if (drop.kind === 'material') drop.purity = Math.min(99, (drop.purity ?? 50) + 25);
        applyDrop(s, ctx, drop);
      }
      return 'Five finds, washed cleaner than the rock deserved.';
    },
  },
  {
    id: 'sporeBloom', name: 'A Sudden Bloom', shellId: 'verdance',
    banner: 'Every vine on the face just inhaled at once.',
    answerLabel: 'Let it happen',
    settleLine: 'The green exhaled and went back to its own pace.',
    apply: (s) => {
      for (let i = 0; i < s.growth.stage.length; i++) {
        if (s.growth.stage[i]! > 0) s.growth.stage[i] = Math.min(4, s.growth.stage[i]! + 2);
      }
      return 'Two seasons in a breath. The face is heavy with it.';
    },
  },
  {
    id: 'magnetInversion', name: 'A Field Inversion', shellId: 'ferrite',
    banner: 'Every needle in the shaft is pointing at YOU.',
    answerLabel: 'Take the compliment',
    settleLine: 'The field remembered north eventually.',
    apply: (s) => {
      addCurrency(s, 'lodestone', D(60));
      return 'Sixty lodestones surfaced to look at you. Flattering. Heavy.';
    },
  },
  {
    id: 'stillAirPocket', name: 'A Pocket of Perfect Still', shellId: 'glassmere',
    banner: 'The air here has stopped entirely. Light goes through it like a promise.',
    answerLabel: 'Read the sky through it',
    settleLine: 'A draft found the pocket and ordinary air resumed.',
    apply: (s) => {
      addCurrency(s, 'spectrum', D(25));
      return 'Twenty-five Spectrum read straight through the mountain.';
    },
  },
  {
    id: 'slagBubble', name: 'A Cold Bubble', shellId: 'cinder',
    banner: 'A pocket of old air, sealed since before the heat. It is COLD.',
    answerLabel: 'Vent it through the shaft',
    settleLine: 'The bubble seeped away through the stone, wasted on nobody.',
    apply: (s) => {
      s.pressure.heat = Math.max(0, s.pressure.heat - 30);
      s.pressure.ventedTotal += 30;
      return 'Thirty degrees of ancient winter, spent in one breath.';
    },
  },
  {
    id: 'veinOfTheOld', name: 'A Vein of the Old Shell', shellId: null,
    banner: 'A thread of stone from a shell above runs through this one. It should not reach here.',
    answerLabel: 'Follow it',
    settleLine: 'The thread thinned and was native rock again.',
    apply: (s, _mods, ctx) => {
      for (let i = 0; i < 4; i++) {
        const drop = rollDrop(currentShell(s).id, Math.max(115, s.depth));
        applyDrop(s, ctx, drop);
      }
      return 'It carried four finds from a depth this shell does not have.';
    },
  },
  {
    id: 'quietDoor', name: 'The Quiet Door', shellId: null,
    banner: 'A door in the rock. No hinges, no handle, no sound at all.',
    answerLabel: 'Knock',
    settleLine: 'The door was stone when you looked again. It was probably always stone.',
    apply: (s) => {
      s.materials.geodes += 5;
      return 'Nobody answered. Five geodes were stacked outside it, like milk bottles.';
    },
  },
  // --- Phase 15: twelve more ----------------------------------------------
  // Now that an IGNORED anomaly pays a quarter-minute of your own ceiling
  // (pillar-4 convention, A.23), these are events worth having more of. Each
  // one is a small scene with a decision, never a raw payout with a name.
  {
    id: 'countingWall', name: 'The Counting Wall', shellId: null,
    banner: 'Somebody has scratched tally marks down forty feet of the shaft. They are still going.',
    answerLabel: 'Read to the bottom',
    settleLine: 'You left them uncounted. The marks stop somewhere below you, or they do not.',
    apply: (s, mods) => {
      addCurrency(s, chipCurrencyId(s), chipYield(s, mods).mul(420));
      return 'The count ends at a number you recognise: your own depth record, from a run you have not made yet.';
    },
  },
  {
    id: 'warmDraught', name: 'A Warm Draught', shellId: null,
    banner: 'Air moving upward, and it is the wrong temperature to be coming from below.',
    answerLabel: 'Follow it back',
    settleLine: 'The draught died while you worked. The shaft is the temperature it should be.',
    apply: (s, _mods, ctx) => {
      applyDrop(s, ctx, rollDrop(currentShell(s).id, s.depth + 40));
      applyDrop(s, ctx, rollDrop(currentShell(s).id, s.depth + 40));
      return 'It came from a pocket forty deeper than you are, and it had things in it.';
    },
  },
  {
    id: 'looseFloor', name: 'The Floor Gives', shellId: null,
    banner: 'The floor under the left-hand cells sounds hollow when you set the lamp down.',
    answerLabel: 'Take up the floor',
    settleLine: 'You worked around it. Whatever is under there is still under there.',
    apply: (s, _mods, ctx) => {
      applyDrop(s, ctx, rollDrop(currentShell(s).id, s.depth + 15));
      startFight(s, ctx, FIGHTABLE[currentShell(s).id] ?? 'gravegnaw');
      return 'A cavity, a small hoard, and something that had been enjoying the quiet.';
    },
  },
  {
    id: 'oldRope', name: 'Somebody Else’s Rope', shellId: null,
    banner: 'A rope, fixed properly, going down past the reach of the lamp. Not yours.',
    answerLabel: 'Test it, then use it',
    settleLine: 'You left it hanging. It is good rope and it is not yours.',
    apply: (s, mods) => {
      addCurrency(s, chipCurrencyId(s), chipYield(s, mods).mul(700));
      return 'It held. At the bottom: a worked seam, abandoned mid-cut, and the tools left where they fell.';
    },
  },
  {
    id: 'stoppedClock', name: 'The Stopped Clock', shellId: 'ferrite',
    banner: 'A Guild survey clock, rusted into the rail. The hands are moving backwards, slowly.',
    answerLabel: 'Wind it forward',
    settleLine: 'You let it run. It will be at yesterday by the weekend.',
    apply: (s, mods) => {
      addCurrency(s, chipCurrencyId(s), chipYield(s, mods).mul(500));
      return 'It ran forward for exactly as long as you wound it, and the seam ran with it.';
    },
  },
  {
    id: 'greenLight', name: 'Light Where There Is None', shellId: 'verdance',
    banner: 'A green glow forty feet off, in a direction the shaft does not go.',
    answerLabel: 'Cut toward it',
    settleLine: 'It faded. Verdance does that — everything here is either growing or going out.',
    apply: (s, mods, ctx) => {
      applyDrop(s, ctx, rollDrop('verdance', s.depth + 30));
      addCurrency(s, chipCurrencyId(s), chipYield(s, mods).mul(300));
      return 'A pocket of something that had been photosynthesising in the dark for a very long time.';
    },
  },
  {
    id: 'perfectReflection', name: 'The Perfect Reflection', shellId: 'glassmere',
    banner: 'A face of the mere so flat it shows you the shaft behind you, in focus, at depth.',
    answerLabel: 'Look properly',
    settleLine: 'You kept your eyes on the work. Sensible.',
    apply: (s, mods, ctx) => {
      const gem = GEMS.filter((g) => g.shellId === 'glassmere')[0];
      if (gem) applyDrop(s, ctx, { kind: 'gem', gemId: gem.id });
      addCurrency(s, chipCurrencyId(s), chipYield(s, mods).mul(250));
      return 'In the reflection, the shaft behind you had one more lamp in it than the shaft behind you.';
    },
  },
  {
    id: 'coolSeam', name: 'A Seam That Is Cold', shellId: 'cinder',
    banner: 'One seam, running cold, in a shell where nothing runs cold.',
    answerLabel: 'Work it while it lasts',
    settleLine: 'It warmed up to match the rest. Cinder always wins that argument.',
    apply: (s, mods) => {
      addCurrency(s, chipCurrencyId(s), chipYield(s, mods).mul(650));
      s.pressure.heat = Math.max(0, s.pressure.heat - 30);
      return 'You worked it hard and the shaft cooled thirty points while you did.';
    },
  },
  {
    id: 'heldNote', name: 'A Held Note', shellId: 'hollow',
    banner: 'One sustained tone from somewhere below, at a pitch the Silence usually eats.',
    answerLabel: 'Listen to the end of it',
    settleLine: 'It stopped on its own. You will not hear where it was going.',
    apply: (s, mods) => {
      addCurrency(s, chipCurrencyId(s), chipYield(s, mods).mul(800));
      return 'It went on for four minutes and then resolved, and the resolution was worth the wait.';
    },
  },
  {
    id: 'writtenAlready', name: 'Already Written', shellId: 'aleph',
    banner: 'A page of your own notes, in your own hand, describing what you are about to find.',
    answerLabel: 'Do what it says',
    settleLine: 'You did something else. The page was still right, in a way you would rather not think about.',
    apply: (s, mods, ctx) => {
      applyDrop(s, ctx, rollDrop('aleph', s.depth));
      addCurrency(s, chipCurrencyId(s), chipYield(s, mods).mul(900));
      return 'It was correct in every particular, including the part where you decided to follow it.';
    },
  },
  {
    id: 'quietCrew', name: 'The Quiet Crew', shellId: null,
    banner: 'Voices below you, working. The Lamphouse has nobody down here today.',
    answerLabel: 'Call down to them',
    settleLine: 'You worked in silence and so did they. Eventually they stopped.',
    apply: (s, mods) => {
      addCurrency(s, chipCurrencyId(s), chipYield(s, mods).mul(550));
      return 'They answered in the right accent, told you where the good seam was, and were not there when you got down.';
    },
  },
  {
    id: 'lampGoesOut', name: 'The Lamp Goes Out', shellId: null,
    banner: 'The lamp dies. Not low, not guttering — out, with fuel still in it.',
    answerLabel: 'Work in the dark',
    settleLine: 'You relit it and lost the hour. Sensible, and it cost you the hour.',
    apply: (s, mods) => {
      addCurrency(s, chipCurrencyId(s), chipYield(s, mods).mul(750));
      return 'You worked twenty minutes by feel and the rock was easier to read without the glare.';
    },
  },
];

export const ANOMALY_BY_ID = new Map(ANOMALIES.map((a) => [a.id, a]));

function scheduleNext(state: GameState): void {
  state.anomalies.nextAtPlaySec =
    state.stats.playTimeSec + ANOMALY_MIN_GAP_SEC + Math.random() * ANOMALY_GAP_SPREAD_SEC;
}

export function tickAnomalies(state: GameState, mods: ModifierCache, ctx: EngineCtx): void {
  const a = state.anomalies;
  if (state.shell.breachCount < 1) return; // the teaching hours stay clean
  if (a.nextAtPlaySec === 0) {
    scheduleNext(state);
    return;
  }
  if (a.active) {
    if (state.stats.playTimeSec - a.active.startedAtPlaySec > ANOMALY_SETTLE_SEC) {
      const def = ANOMALY_BY_ID.get(a.active.id);
      a.active = null;
      scheduleNext(state);
      // PILLAR-4 CONVENTION (Phase 13 ruling): ignored still pays SOMETHING,
      // engaged pays full. "Settles harmlessly" made anomalies decoration —
      // free to ignore is the same as not there. Every other optional system
      // in this game already works this way (craft Passive Ranks, the drip,
      // auto-listen), so anomalies now match: a quarter share, unattended.
      if (def) {
        // Pays, but does NOT count as answered — `resolved` means you engaged,
        // and letting it lapse is not engaging. The share is the whole change.
        addCurrency(state, chipCurrencyId(state), dpsMax(state, mods).mul(SETTLE_SHARE * 60));
        ctx.emit({ type: 'anomalySettled', id: def.id });
      }
    }
    return;
  }
  if (state.stats.playTimeSec >= a.nextAtPlaySec) {
    const shell = currentShell(state).id;
    const pool = ANOMALIES.filter((d) => d.shellId === null || d.shellId === shell);
    const def = pool[Math.floor(Math.random() * pool.length)]!;
    a.active = { id: def.id, startedAtPlaySec: state.stats.playTimeSec };
    a.seen += 1;
    ctx.emit({ type: 'anomaly', id: def.id });
  }
}

export function answerAnomaly(state: GameState, mods: ModifierCache, ctx: EngineCtx): ActionResult {
  const a = state.anomalies.active;
  if (!a) return { ok: false, reason: 'Nothing strange is happening. Right now.' };
  const def = ANOMALY_BY_ID.get(a.id);
  if (!def) {
    state.anomalies.active = null;
    return { ok: false, reason: 'It was gone when you got there' };
  }
  state.anomalies.active = null;
  state.anomalies.resolved += 1;
  scheduleNext(state);
  const line = def.apply(state, mods, ctx);
  ctx.dirty();
  ctx.emit({ type: 'anomalyAnswered', id: def.id, line });
  return { ok: true, data: { line } };
}

export function defaultAnomaliesState(): GameState['anomalies'] {
  return { nextAtPlaySec: 0, active: null, seen: 0, resolved: 0, merchantMeets: 0 };
}
