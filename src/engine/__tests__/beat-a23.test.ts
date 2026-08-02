/**
 * §23 THE FIRST 45 MINUTES — three beats, checked against the LIVE PATH rather
 * than trusted from the prose. Bands, not floors: HEARTH_FLOOR at 1.5 passed a
 * floor test while quietly cutting the measured opening by a third (plant.ts),
 * and this project's standing rule is that a number in the spec is a claim
 * until it is measured against `src/engine/` (PILLARS.md, "a number in this
 * document is not evidence").
 *
 * The driver below is a minimal, deterministic-enough ACTIVE policy — two
 * manual chips/sec round-robin across the field, greedy buy of kilnBuild then
 * expand — run through the real engine via dispatch()/tick(), not stubbed
 * state. It intentionally does NOT divert Brick into bellows/firebrick: that
 * is the BEST CASE for reaching field size, so a band built around it is
 * already generous to the beat, not adversarial to it.
 *
 * MEASURED, NOT ASSUMED: this driver was run to 35 simulated minutes before
 * these bands were written (see the chat record / sim-out/plant-mix.md
 * neighbours for the method). Two of the three §23 beats land close to the
 * prose. The third does not, and the test says so rather than hiding it in a
 * band wide enough to always pass.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { Engine, GameState } from '../types';
import { fieldDims } from '../systems/face';
import { upgradeLevel, nextCost, allUpgrades } from '../../engine/upgrades';
import { D } from '../decimal';
import { KILN_FUELS } from '../content/kilnFuel';
import { flowSatisfaction } from '../systems/plant';

const STEP = 0.1;
const SIM_MINUTES = 35;

interface BeatResult {
  /** Simulated seconds at which the Kiln was bought. */
  kilnBuiltAt: number | null;
  /** Earliest second at which two DIFFERENT fuel ids both dispatch ok:true. */
  twoFuelsAt: number | null;
  /** Earliest second the field first reads 8x8. */
  field8x8At: number | null;
  /**
   * §3.1's own invariant, checked the instant the Kiln is bought: a lone
   * converter must never be starved by the plant it IS. This is the number
   * that actually moves when HEARTH_FLOOR regresses — the three beats above
   * barely do, because a lone Kiln's heat-ramp window where it would starve
   * is ~11 simulated seconds inside a run measured in minutes.
   */
  kilnSatisfactionAtBuild: number | null;
}

/**
 * THE ACTIVE POLICY THIS TEST PLAYS. Two chips/sec (§23's own "2 clicks/sec"),
 * round-robin across the live field so no single cell is stripped repeatedly;
 * greedy buy of the Kiln the instant it is affordable, then every Brick into
 * `expand` and nothing else — the fastest path to field size the current
 * formulas allow, so this is not a driver rigged to fail the beat.
 */
function playActive(engine: Engine, minutes: number): BeatResult {
  let cellCursor = 0;
  const result: BeatResult = {
    kilnBuiltAt: null, twoFuelsAt: null, field8x8At: null, kilnSatisfactionAtBuild: null,
  };
  const totalSec = minutes * 60;

  for (let t = 0; t < totalSec; t += STEP) {
    engine.tick(STEP);
    const s = engine.getState() as GameState;
    const dims = fieldDims(upgradeLevel(s, 'expand'));

    if (Math.floor(t / 0.5) !== Math.floor((t - STEP) / 0.5)) {
      engine.dispatch({ type: 'chip', cell: cellCursor % (dims.w * dims.h) });
      cellCursor++;
    }

    if (Math.floor(t) !== Math.floor(t - STEP)) {
      if (upgradeLevel(s, 'kilnBuild') === 0) {
        const r = engine.dispatch({ type: 'buyUpgrade', id: 'kilnBuild' });
        if (r.ok && result.kilnBuiltAt === null) {
          result.kilnBuiltAt = s.stats.playTimeSec;
          result.kilnSatisfactionAtBuild = flowSatisfaction(s, 'kiln');
        }
      }
      if (s.kiln.built && result.twoFuelsAt === null) {
        const a = engine.dispatch({ type: 'setKilnFuel', fuelId: KILN_FUELS[0]!.id });
        const b = engine.dispatch({ type: 'setKilnFuel', fuelId: KILN_FUELS[1]!.id });
        engine.dispatch({ type: 'setKilnFuel', fuelId: null }); // leave it bare, as a fresh build would be
        if (a.ok && b.ok) result.twoFuelsAt = s.stats.playTimeSec;
      }
      const expandDef = allUpgrades().find((u) => u.id === 'expand')!;
      const level = upgradeLevel(s, 'expand');
      if (s.kiln.built && level < expandDef.maxLevel) {
        const cost = nextCost(expandDef, level);
        const brick = s.currencies['brick'] ?? D(0);
        if (brick.gte(cost)) engine.dispatch({ type: 'buyUpgrade', id: 'expand' });
      }
    }

    if (result.field8x8At === null && dims.w === 8 && dims.h === 8) {
      result.field8x8At = (engine.getState() as GameState).stats.playTimeSec;
    }
  }
  return result;
}

describe('§23 beats, against the live path (bands, not floors)', () => {
  it('the Kiln goes up near 3:00 — measured band 1:00-4:00', () => {
    const engine = createEngine({ nowMs: 0 });
    const r = playActive(engine, SIM_MINUTES);
    expect(r.kilnBuiltAt).not.toBeNull();
    expect(r.kilnBuiltAt!).toBeGreaterThanOrEqual(60);
    expect(r.kilnBuiltAt!).toBeLessThanOrEqual(240);
  });

  /**
   * THE ACTUAL HEARTH_FLOOR REGRESSION GUARD. The three timing beats above
   * are almost insensitive to HEARTH_FLOOR — a lone Kiln's under-fed window
   * at 1.5 lasts only ~11 simulated seconds while heat climbs past 0.36, which
   * a beat measured in minutes cannot see. This is the number that broke:
   * §3.1 says a lone converter must never be starved by the plant it IS, and
   * at HEARTH_FLOOR 1.5 a cold Kiln ran at 62.5% the moment it was lit.
   */
  it('the Kiln is never starved by its own plant, the instant it is lit (§3.1)', () => {
    const engine = createEngine({ nowMs: 0 });
    const r = playActive(engine, SIM_MINUTES);
    expect(r.kilnSatisfactionAtBuild).toBe(1);
  });

  it('two fuel profiles are choosable near 4:00 — measured band: by 5:00, and the registry actually holds >= 2', () => {
    // §23's prose describes exactly two ("fast burn or long burn"); the
    // registry holds three (KILN_FUELS). Per PILLARS's "a number in this
    // document is not evidence", the registry is the authority — the test
    // asserts what the spine's CLAIM needs (at least two genuinely different
    // profiles exist and are both selectable), not its literal count.
    expect(KILN_FUELS.length).toBeGreaterThanOrEqual(2);
    const engine = createEngine({ nowMs: 0 });
    const r = playActive(engine, SIM_MINUTES);
    expect(r.twoFuelsAt).not.toBeNull();
    expect(r.twoFuelsAt!).toBeLessThanOrEqual(300);
  });

  /**
   * THIS ONE FAILS THE PROSE, ON PURPOSE, AND SAYS SO.
   *
   * Measured against the live path with the FASTEST policy the current
   * formulas allow (100% of Brick into `expand`, nothing spent on bellows or
   * firebrick), the field reaches 8x8 at ~30:00, not ~12:00 — 2.5x the beat.
   * The ceiling is structural, not a matter of better play: the Kiln is
   * rate-capped at `KILN_BASE_RATE = 2` dust/sec regardless of surplus dust
   * (§3.1 — it is pure Flow, and nothing in this window feeds it faster), so
   * effective Brick income tops out near ~4.8/min once heat saturates
   * (~+1.5min after the Kiln is built). Reaching expand level 4 (8x8) costs a
   * CUMULATIVE 12+21+36.75+64.31 ≈ 134 Brick — about 28 minutes of Kiln
   * output at that ceiling, plus the ~3-4 minutes to get the Kiln lit and
   * hot. Spending any of that Brick on bellows/firebrick (as a real player
   * plausibly would, and as `scripts/sim.ts`'s reference policy does) makes
   * it slower, not faster, because they compete for the same currency the
   * beat is timed on.
   *
   * This is not this pass's balance to fix (the brief is explicit: report,
   * don't tune). It is flagged here so the beat ladder in §23 is not quoted
   * again as measured until someone either re-times it against a real
   * playtest or corrects the Kiln's rate/expand cost curve.
   */
  it('field 8x8 is NOT reached by 12:00 against the live path — it lands near 30:00', () => {
    const engine = createEngine({ nowMs: 0 });
    const r = playActive(engine, SIM_MINUTES);
    expect(r.field8x8At).not.toBeNull();
    // The prose's claim, stated as a band around 12:00 — and disproven.
    expect(r.field8x8At!).toBeGreaterThan(15 * 60);
    // The measured band this pass actually found, so a future change to the
    // Kiln rate or the expand cost curve that moves this number is caught
    // rather than silently re-drifting.
    expect(r.field8x8At!).toBeGreaterThanOrEqual(25 * 60);
    expect(r.field8x8At!).toBeLessThanOrEqual(33 * 60);
  });
});
