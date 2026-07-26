/**
 * WHERE THE BREAKDOWN PANEL GOES.
 *
 * Reported from play: hovering "speed bonuses" cut the breakdown off. The cause
 * was an absolutely-positioned panel inside a `overflow-y-auto` room, which
 * every browser clips — the fix is a portal, and the arithmetic below decides
 * where the portalled panel lands.
 *
 * This is a unit test and not a driver check for a specific reason: the FLIP
 * branch cannot be produced through any room in the game today, because the
 * face canvas owns the top ~430px of every screen so no label ever sits in the
 * top band. `scripts/verify-alloys.ts` says so out loud rather than hovering
 * something two-thirds down a panel and reporting that it flipped.
 */
import { describe, expect, it } from 'vitest';
import { TIP_MARGIN, TIP_MAX_W, TIP_MIN_ABOVE, tooltipPlacement } from '../tooltipPlacement';

const PHONE = { width: 380, height: 900 };
const anchorAt = (left: number, top: number, width = 80) => ({ left, top, width });

describe('it always fits the screen it is on', () => {
  it('centres on the anchor when there is room on both sides', () => {
    const p = tooltipPlacement(anchorAt(150, 500), PHONE);
    expect(p.width).toBe(TIP_MAX_W);
    expect(p.left + p.width / 2).toBeCloseTo(190, 0); // 150 + 80/2
  });

  it('pulls back inside the left edge instead of running off it', () => {
    const p = tooltipPlacement(anchorAt(2, 500), PHONE);
    expect(p.left).toBe(TIP_MARGIN);
    expect(p.left + p.width).toBeLessThanOrEqual(PHONE.width);
  });

  it('pulls back inside the right edge too', () => {
    const p = tooltipPlacement(anchorAt(PHONE.width - 20, 500), PHONE);
    expect(p.left).toBeGreaterThanOrEqual(0);
    expect(p.left + p.width).toBeLessThanOrEqual(PHONE.width - TIP_MARGIN);
  });

  /** The reported bug, as a property: at the game's narrowest supported width
   *  an anchor ANYWHERE across the row still yields a fully on-screen panel. */
  it('never overflows 380px, wherever the label sits', () => {
    for (let x = 0; x <= PHONE.width; x += 5) {
      const p = tooltipPlacement(anchorAt(x, 500, 60), PHONE);
      expect(p.left, `left edge at anchor x=${x}`).toBeGreaterThanOrEqual(0);
      expect(p.left + p.width, `right edge at anchor x=${x}`).toBeLessThanOrEqual(PHONE.width);
    }
  });

  it('narrows on a screen too small for its natural width', () => {
    const p = tooltipPlacement(anchorAt(10, 500), { width: 200, height: 600 });
    expect(p.width).toBe(200 - TIP_MARGIN * 2);
    expect(p.left + p.width).toBeLessThanOrEqual(200);
  });
});

describe('it flips rather than opening off the top', () => {
  it('opens ABOVE a label with headroom — it belongs to the thing you point at', () => {
    expect(tooltipPlacement(anchorAt(150, TIP_MIN_ABOVE + 1), PHONE).flipDown).toBe(false);
    expect(tooltipPlacement(anchorAt(150, 800), PHONE).flipDown).toBe(false);
  });

  it('opens BELOW a label near the top, where there is no room above it', () => {
    expect(tooltipPlacement(anchorAt(150, 0), PHONE).flipDown).toBe(true);
    expect(tooltipPlacement(anchorAt(150, TIP_MIN_ABOVE - 1), PHONE).flipDown).toBe(true);
  });
});
