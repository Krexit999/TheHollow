/**
 * THE RENDER GUARD — one bad frame must never kill a canvas.
 *
 * Pixi v8's ticker reschedules its requestAnimationFrame AFTER running the
 * listener list, so an uncaught throw inside the Application's own render
 * listener kills that app's loop PERMANENTLY — the canvas freezes on its last
 * frame (or blanks) until a page refresh. And with more than one Application
 * alive, the shared batch pools can be poisoned by RenderTexture churn in one
 * app interleaved with rendering in another (reproduced live: `Batcher.break →
 * null.clear`, then `BatcherPipe.execute → null.geometry` repeating every
 * frame). The lifecycle fix is to never render two apps at once — this guard is
 * the seatbelt for whatever slips through: a poisoned frame becomes a SKIPPED
 * frame (batch instruction sets rebuild from scratch on the next pass), the
 * ticker lives, and the view self-heals instead of dying.
 *
 * Wraps `app.renderer.render`, which covers BOTH the ticker's stage render and
 * the Shaft's chunk bakes to RenderTextures.
 */
import type { Application } from 'pixi.js';

/** Whether the LAST render call on this app threw (and was swallowed). The
 *  Shaft's chunk bake reads this: a failed bake must NOT be cached, or the
 *  blank RenderTexture becomes a permanent black band in the column. */
const lastFailed = new WeakMap<Application, boolean>();

export function lastRenderFailed(app: Application): boolean {
  return lastFailed.get(app) === true;
}

export function guardPixiRender(app: Application, label: string): void {
  const renderer = app.renderer as unknown as { render: (...args: unknown[]) => unknown };
  const original = renderer.render.bind(app.renderer);
  let logged = 0;
  renderer.render = (...args: unknown[]) => {
    lastFailed.set(app, false);
    try {
      return original(...args);
    } catch (e) {
      lastFailed.set(app, true);
      if (logged < 3) {
        logged += 1;
        // eslint-disable-next-line no-console
        console.error(`[pixi:${label}] render recovered (frame skipped, ticker alive):`, e);
      }
      return undefined;
    }
  };
}
