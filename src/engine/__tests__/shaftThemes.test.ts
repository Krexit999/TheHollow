/**
 * THE SHAFT VIEW (Phase 20) — a presentation rebuild, so the engine is
 * unchanged. The one thing the new renderer can silently get wrong is a SHELL
 * with no palette: it would fall back to Loam's warm gold in, say, the Hollow.
 * This pins that — every registered shell has its own Shaft theme and HUD accent,
 * so adding shell VIII without a palette fails here, not in a screenshot.
 *
 * (The colours and the noise/lerp math live in `shaftThemes.ts`, kept free of any
 * Pixi import precisely so this can run headless.)
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { allShells } from '../shells';
import { SHAFT_THEMES, SHELL_ACCENT, shaftTheme, lerp, noise } from '../../ui/shaft/shaftThemes';

describe('every shell has its own Shaft palette', () => {
  it('a theme and an accent for each registered shell — no silent Loam fallback', () => {
    createEngine({ nowMs: 0 }); // ensure the shell registry is loaded
    for (const sh of allShells()) {
      expect(SHAFT_THEMES[sh.id], `${sh.id} shaft theme`).toBeDefined();
      expect(SHELL_ACCENT[sh.id], `${sh.id} HUD accent`).toBeDefined();
      // Every channel colour is a real 24-bit value.
      const t = shaftTheme(sh.id);
      for (const key of ['stone', 'warm', 'cool', 'glow', 'rail'] as const) {
        expect(t[key], `${sh.id}.${key}`).toBeGreaterThanOrEqual(0);
        expect(t[key], `${sh.id}.${key}`).toBeLessThanOrEqual(0xffffff);
      }
    }
  });

  it('the carve noise is deterministic and in [0,1)', () => {
    expect(noise(42)).toBe(noise(42));
    for (const s of [0, 1, 7, 130, 559]) {
      const n = noise(s);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it('lerp blends channel colours end to end', () => {
    expect(lerp(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(lerp(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(lerp(0x000000, 0xffffff, 0.5)).toBe(0x808080); // round(127.5) = 128
  });
});
