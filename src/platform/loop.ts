/**
 * Render-decoupled game loop: requestAnimationFrame drives engine.tick with
 * real elapsed time; the engine steps at its fixed 100ms internally. Gaps
 * beyond 60s (throttled tab that visibilitychange already handled) are
 * dropped here to avoid double-counting.
 */
import type { Engine } from '../engine';

export function startLoop(engine: Engine): () => void {
  let last = performance.now();
  let raf = 0;
  const frame = (now: number): void => {
    const dt = Math.min((now - last) / 1000, 60);
    last = now;
    engine.tick(dt);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
