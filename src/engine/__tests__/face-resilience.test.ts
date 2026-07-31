/**
 * FACE RESILIENCE — the live-playtest freeze (item 1).
 *
 * The core screen went black-and-frozen "after buying an upgrade" and "after
 * returning from the Shaft," recoverable only by refresh. Root cause: an
 * uncaught render throw with NO top-level React error boundary unmounted the
 * whole tree; the unmount ran the Pixi views' effect-cleanups, which call
 * `destroy()` and STOP their tickers for good, while the engine kept ticking on
 * its own loop (currency still moved). See DESIGN.md A.38.
 *
 * Two guards here:
 *  1. ENGINE INVARIANT — buying an upgrade must never wedge chipping. (The face
 *     bug was UI-level, but this pins the engine contract the user named:
 *     "buy an upgrade → the face still accepts chips.")
 *  2. STRUCTURAL — the error boundaries that stop a throw from unmounting the
 *     canvases must stay wired. A future refactor that drops them silently
 *     reintroduces the catastrophe, and nothing else would catch it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createEngine } from '../index';

const read = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');

/**
 * SEEDED, BECAUSE AN UNSEEDED GATE IS NOT A GATE.
 *
 * These two cases chip a live face, and chipping rolls drops, crits and ore
 * formation off the shared Math.random stream. Alone the file passed every
 * time; inside the full suite it failed intermittently, and THE FAILING LINE
 * MOVED between runs -- once on the upgrade being affordable, once on the chip
 * landing at all -- which is the signature of a shared stream, not of a bug in
 * anything this file guards.
 *
 * A gate that fails at random says nothing on either outcome, so it had stopped
 * being evidence about the thing it exists to protect. Pinned to a constant:
 * the invariant under test is "an upgrade never wedges chipping", which has
 * nothing to do with what the dice said.
 */
beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterEach(() => { vi.restoreAllMocks(); });

describe('buying an upgrade never wedges the face', () => {
  it('a chip still pays after any purchase', () => {
    const engine = fresh();
    // Earn enough for the first upgrade, buy it, then keep chipping.
    for (let i = 0; i < 7; i++) engine.dispatch({ type: 'chip', cell: i });
    const buy = engine.dispatch({ type: 'buyUpgrade', id: 'blade' });
    expect(buy.ok).toBe(true);
    engine.tick(5); // let the face regen so there is charge to take
    const before = engine.getState().currencies['dust']!.toNumber();
    const chip = engine.dispatch({ type: 'chip', cell: 0 });
    expect(chip.ok).toBe(true);
    expect(engine.getState().currencies['dust']!.toNumber()).toBeGreaterThan(before);
  });

  it('the engine keeps running (currency accrues) independent of any UI', () => {
    // The tell in the report — "currency IS being spent and gained in state" —
    // is exactly this: the engine loop is not the thing that froze.
    const engine = fresh();
    for (let i = 0; i < 6; i++) engine.dispatch({ type: 'chip', cell: i });
    const t0 = engine.getState().currencies['dust']!.toNumber();
    engine.tick(20);
    expect(engine.getState().currencies['dust']!.toNumber()).toBeGreaterThan(t0);
  });
});

describe('the error boundaries that keep a throw from black-screening the game', () => {
  it('main.tsx wraps <App/> in the root AppErrorBoundary', () => {
    const main = read('main.tsx');
    expect(main).toMatch(/AppErrorBoundary/);
    // The boundary must actually WRAP App, not merely be imported.
    expect(main).toMatch(/<AppErrorBoundary>[\s\S]*<App\s*\/>[\s\S]*<\/AppErrorBoundary>/);
  });

  it('the hero overlays sit inside an error boundary, apart from the Face canvas', () => {
    const app = read('ui/App.tsx');
    // FaceCanvas is bare (Pixi is resilient; the root net covers it); the chips
    // and banners over it are boundaried so one throwing overlay cannot unmount
    // the hero and destroy the Face's renderer.
    expect(app).toMatch(/<PanelErrorBoundary[^>]*>\s*<WeatherChip/);
  });

  it('the Pixi frame loop is wrapped so a bad frame cannot kill the ticker', () => {
    const face = read('ui/face/FaceView.ts');
    expect(face).toMatch(/private frame\([^)]*\)[^{]*\{\s*try\s*\{/);
    const shaft = read('ui/shaft/ShaftView.ts');
    expect(shaft).toMatch(/private frame\([^)]*\)[^{]*\{\s*try\s*\{/);
  });
});

describe('the A.38-addendum lifecycle: one live renderer, guarded renders, recycled RTs', () => {
  it('every Pixi view guards renderer.render (poisoned frame = skipped frame)', () => {
    expect(read('ui/face/FaceView.ts')).toMatch(/guardPixiRender\(this\.app, 'face'\)/);
    expect(read('ui/shaft/ShaftView.ts')).toMatch(/guardPixiRender\(this\.app, 'shaft'\)/);
    expect(read('ui/lattice/LatticeView.ts')).toMatch(/guardPixiRender\(this\.app, 'lattice'\)/);
  });

  it('the Face sleeps while the Shaft owns the hero (no interleaved rendering)', () => {
    expect(read('ui/face/FaceView.ts')).toMatch(/setActive\(active: boolean\)/);
    expect(read('ui/components/FaceCanvas.tsx')).toMatch(/setActive\(active\)/);
    expect(read('ui/App.tsx')).toMatch(/<FaceCanvas active=\{!onShaft\}/);
    expect(read('ui/App.tsx')).toMatch(/<LatticePanel active=\{tab === 'lattice'\}/);
  });

  it('the Shaft defers layout (and its RT churn) while hidden', () => {
    const shaft = read('ui/shaft/ShaftView.ts');
    expect(shaft).toMatch(/if \(!this\.active\) \{ this\.pendingLayout = true; return; \}/);
    expect(shaft).toMatch(/if \(this\.pendingLayout\) this\.layout\(\);/);
  });

  it('evicted chunk textures are RECYCLED, never destroyed mid-flight', () => {
    const shaft = read('ui/shaft/ShaftView.ts');
    expect(shaft).toMatch(/this\.rtPool\.push\(dead\.rt\)/);
    expect(shaft).toMatch(/this\.rtPool\.pop\(\) \?\? RenderTexture\.create/);
    expect(shaft).toMatch(/pendingDispose/);
  });

  it('a FAILED chunk bake is never cached (the blank-band bug): retry, not a black hole', () => {
    const shaft = read('ui/shaft/ShaftView.ts');
    // The guard swallows poisoned renders; the bake must detect that and bail…
    expect(shaft).toMatch(/if \(lastRenderFailed\(this\.app\)\)/);
    expect(shaft).toMatch(/private bakeChunk\(index: number\): Chunk \| null/);
    // …and the caller must skip caching so next frame retries.
    expect(shaft).toMatch(/if \(!baked\) continue;/);
    const guard = read('ui/pixiGuard.ts');
    expect(guard).toMatch(/export function lastRenderFailed/);
  });
});

function fresh() {
  return createEngine({ nowMs: 0 });
}
