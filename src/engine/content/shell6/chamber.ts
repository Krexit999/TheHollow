/**
 * THE ECHO CHAMBER — the deepest system in the game: a programming language
 * whose only primitive is YOU. Record up to N of your own actions; the
 * Chamber replays the tape forever, THROUGH THE REAL DISPATCH — a replayed
 * program obeys every ceiling, law, and cost automatically and eternally,
 * because the engine cannot tell it from a hand. It buys your attention
 * back, never your limits.
 *
 * THE COST MODEL (what makes optimization matter): every replayed step
 * burns Resonance upkeep, and a loop's SCORE is its yield per step — a
 * twelve-step tape that does what eight steps could do pays 50% more
 * upkeep for the same work and scores worse. The EXECUTION TRACE records
 * each step's yield so you can watch your own program run and see exactly
 * which steps waste their keep. Your best efficiency ever is permanent.
 *
 * Recording and replay live on the ENGINE FACADE (the declared small
 * addition — a dispatch-tape recorder; no CraftSystem interface change):
 * the whitelist below is which verbs the Chamber can hold.
 */
import type { GameAction, GameState } from '../../types';
import { registerCurrency } from '../../resources';
import { registerModifier } from '../../modifiers';
import { registerCraftSystem, type CodexEntry, type CraftSystem } from '../../craft';
import { masteryLevel } from '../../systems/mastery';

export const TAPE_WHITELIST: ReadonlyArray<GameAction['type']> = [
  'chip', 'listen', 'descend', 'toggleMagnet', 'setMirror', 'lightCell', 'harvestPlot', 'setChoke',
];
export const RESONANCE_PER_STEP = 0.4;
export const REPLAY_STEP_SEC = 1.6;
export const CHAMBER_PASSIVE_SEC = 1500;
export const CHAMBER_PASSIVE_CAP = 20;

export function chamberUnlocked(state: GameState): boolean {
  return masteryLevel(state, 'hollow') >= 2;
}

export function replayInterval(state: GameState): number {
  return REPLAY_STEP_SEC / (1 + 0.04 * state.chamber.passiveRank);
}

export function tapeLabel(action: GameAction): string {
  switch (action.type) {
    case 'chip': return `chip ${(action as { cell: number }).cell}`;
    case 'listen': return 'listen';
    case 'descend': return 'descend';
    case 'toggleMagnet': return `magnet ${(action as { col: number }).col}`;
    case 'setMirror': return 'mirror';
    case 'lightCell': return 'light';
    case 'harvestPlot': return 'harvest';
    case 'setChoke': return 'choke';
    default: return action.type;
  }
}

export const chamberSystem: CraftSystem = {
  id: 'chamber',
  name: 'The Echo Chamber',
  currencyId: 'resonance',
  unlocked: chamberUnlocked,
  ensureState(state) {
    if (!state.chamber) state.chamber = defaultChamberState();
  },
  tick(state, _mods, ctx, dt) {
    state.chamber.passiveProgressSec += dt;
    while (state.chamber.passiveProgressSec >= CHAMBER_PASSIVE_SEC && state.chamber.passiveRank < CHAMBER_PASSIVE_CAP) {
      state.chamber.passiveProgressSec -= CHAMBER_PASSIVE_SEC;
      state.chamber.passiveRank += 1;
      ctx.dirty();
    }
  },
  offlineTick(state, mods, ctx, seconds, efficiency) {
    this.tick(state, mods, ctx, seconds * efficiency);
    // Away, the tape keeps a reduced cadence — the engine's offline path
    // cannot replay real dispatches, so the Chamber banks its SCORE only.
    state.chamber.running = state.chamber.running && state.chamber.tape.length > 0;
  },
  passiveRank: (state) => state.chamber.passiveRank,
  codex(state) {
    const out: CodexEntry[] = [];
    if (state.chamber.bestEfficiency > 0) {
      out.push({
        id: 'bestProgram', name: 'The Shortest Sentence', kind: 'pattern', active: true,
        flavor: 'Your most efficient program, on record. The Chamber recites it to itself.',
        effect: `${state.chamber.bestEfficiency.toFixed(2)} yield/step at best`,
      });
    }
    return out;
  },
};

export function registerChamber(): void {
  registerCurrency({
    id: 'resonance', name: 'Resonance', tier: 'shell', color: '#9a8ec0',
    description: 'What the quiet gives back when you strike it in rhythm. The Chamber runs on it.',
    resetsOnCollapse: false,
  });
  registerCraftSystem(chamberSystem);
  registerModifier({
    id: 'chamber.program',
    label: 'Echo Chamber (best program + rank)',
    bucket: 'dustYield',
    value: (s) =>
      1 + 0.006 * (s.chamber?.passiveRank ?? 0) + Math.min(0.25, 0.05 * Math.log10(1 + (s.chamber?.bestEfficiency ?? 0))),
  });
}

export function defaultChamberState(): GameState['chamber'] {
  return {
    tape: [], recording: false, running: false, cursor: 0, stepTimer: 0,
    trace: [], bestEfficiency: 0, loops: 0, passiveRank: 0, passiveProgressSec: 0,
  };
}
