/**
 * THE SHAFT — PixiJS renderer, rebuilt as a lit cave rather than a diagram of one.
 *
 * ART DIRECTION: THE CHANNEL IS THE LIGHT SOURCE — a warm gold column, brightest
 * at its centre, pouring light up out of the shaft. The rock around it is near-
 * black but always visible, graded by distance from the edge (a lit lip → dark
 * mass), textured with real stone grain, and threaded with a DENSE web of thin
 * glowing cracks that carry the channel's light out into the mass. The player's
 * lantern is a soft warm swell IN the column, not a bulb on top of it; the
 * vignette only touches the outer frame. All of it is BAKED per chunk from
 * deterministic grammar — no per-frame filters.
 *
 * ARCHITECTURE: the world is CHUNKED (16 depths). A chunk is baked ONCE into a
 * RenderTexture from deterministic grammar (silhouette, edge-shading, cracks,
 * texture, decals) seeded on (shell, chunkIndex) — a place you re-enter looks the
 * same every time. An LRU cache keeps a handful; the rest are evicted. Scrolling
 * is then just moving sprites. Dynamic things (rail, caches, the player, scars)
 * are drawn in a separate overlay, never baked, since they change.
 *
 * The ticker pauses when hidden; the renderer is mounted-and-hidden, never
 * destroyed under the live Face (Pixi's shared batch pools do not survive it).
 */
import { Application, Container, Graphics, Sprite, Texture, RenderTexture } from 'pixi.js';
import { guardPixiRender, lastRenderFailed } from '../pixiGuard';
import type { Engine } from '../../engine';
import { currentShell } from '../../engine/shells';
import { railDepth, cacheReady } from '../../engine/systems/shaftSys';
import { WALL_BY_SHELL } from '../../engine/content/shellWalls';
import { equippedTool } from '../../engine/systems/forge';
import { SHAFT_THEMES, type ShaftTheme, shaftGrammar, channelStops, rockBands, lerp } from './shaftThemes';
import {
  channelProfile, crackNetwork, decals, driftParams, CHUNK_DEPTHS, type ChannelSample,
} from './shaftGrammar';

export type ShaftMarker =
  | { kind: 'cache'; depth: number }
  | { kind: 'wall'; depth: number; tier: number }
  | { kind: 'unmineable'; depth: number }
  | { kind: 'floor'; depth: number }
  | { kind: 'you'; depth: number };

export interface ShaftScrollInfo { top: number; bottom: number; ppd: number; }

interface DynSig {
  shell: string; record: number; reached: number; rail: number; floor: number;
  toolTier: number; scars: string; caches: string;
}

const DUST_MAX = 180;

/** One baked chunk in the LRU: its texture, its sprite, and when we last used it. */
interface Chunk { key: string; index: number; rt: RenderTexture; sprite: Sprite; used: number; }

/**
 * Every eye-tuning number in the renderer, in one place so the dev tuning panel
 * can drive them live and the final values can be hard-coded here. Multipliers
 * default to 1 (no change to the authored per-shell palette); absolute knobs are
 * the shipping defaults.
 */
export interface ShaftTuning {
  veinBright: number;        // ×brightness of the continuous lit vein
  veinWidth: number;         // ×half-width of the vein (constant down the centre)
  rockValue: number;         // ×rock base brightness
  rimBright: number;         // ×wall rim glow (the lit lip on the walls)
  texScale: number;          // ×feature size of the stone grain (1 = ~4/12/40px octaves)
  texStrength: number;       // ± value modulation the grain applies to the rock (0..1)
  mineralVar: number;        // hue/saturation variation across the rock face (0..1)
  sediment: number;          // ×horizontal sediment banding
  crackDensity: number;      // fraction of the crack web drawn (0..1)
  crackBright: number;       // ×crack brightness
  lampRadius: number;        // ×lantern pool size
  lampFalloff: number;       // radial stop where the lantern dies (0..1)
  vignette: number;          // vignette darkness at the frame edge (0..1)
}

export const DEFAULT_TUNING: ShaftTuning = {
  veinBright: 1, veinWidth: 1,
  rockValue: 1, rimBright: 1,
  texScale: 1, texStrength: 0.35,
  mineralVar: 0.6, sediment: 1,
  crackDensity: 1, crackBright: 1,
  lampRadius: 1, lampFalloff: 0.6,
  vignette: 0.85,
};

/** How pronounced horizontal sediment strata are, per shell — thick in soft
 *  earth, absent in fired cinder. */
const SEDIMENT_BY_SHELL: Record<string, number> = {
  loam: 1, ferrite: 0.4, verdance: 0.6, glassmere: 0.25, cinder: 0, hollow: 0.15, aleph: 0.2,
};

// Rock mineral variation works in HSL so it can shift hue/saturation while holding
// value — real stone has redder clay and greyer patches, same brightness.
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dd = mx - mn;
  let h = 0, s = 0;
  if (dd > 1e-6) {
    s = dd / (1 - Math.abs(2 * l - 1));
    if (mx === r) h = ((g - b) / dd) % 6; else if (mx === g) h = (b - r) / dd + 2; else h = (r - g) / dd + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export class ShaftView {
  private app!: Application;
  private parallax = new Container();
  private world = new Container();       // scrolls with the player
  private chunkLayer = new Container();
  private overlay = new Graphics();      // rail, scars — cheap lines
  private markerLayer = new Container(); // caches / walls / digs / floor / you
  private surface = new Container();     // the headframe at depth 0
  private lamp: Sprite | null = null;
  private dust = new Container();
  private vignette = new Sprite(Texture.WHITE);
  private tuning: ShaftTuning = { ...DEFAULT_TUNING };

  private ppd = 22;
  private centerX = 0;
  private viewW = 0;
  private viewH = 0;
  private anchorY = 0;                    // screen y the player sits at
  private res = 1;

  private lampDepth = 0;                  // eased camera/lantern depth
  private targetDepth = 0;
  private dragging = false;
  private dragLast = 0;
  private dragMoved = 0;
  private dragVel = 0;
  private lastPlayerDepth = 0;             // follow only when THIS changes, never on a timer
  private wheelHandler?: (ev: WheelEvent) => void;
  private flick = 0;
  private lampBaseScale = 1;

  private shellId = 'loam';
  private dynSig: DynSig | null = null;
  private markerHits: { marker: ShaftMarker; x: number; depth: number }[] = [];
  private chunks = new Map<string, Chunk>();
  private chunkClock = 0;
  private chunkReqs = 0;
  private chunkHits = 0;
  private destroyed = false;
  private active = true;
  private resizeObserver!: ResizeObserver;

  private static readonly LRU_CAP = 6;
  /** Chunks bake with this much overlap (in depths) top and bottom, so the seam
   *  where two RenderTextures meet is covered rather than showing a hairline. */
  private static readonly PAD = 0.75;

  private constructor(
    private host: HTMLElement,
    private engine: Engine,
    private reducedMotion: boolean,
    private onSelect: (m: ShaftMarker | null) => void,
    private onScroll?: (info: ShaftScrollInfo) => void,
  ) {}

  static async create(
    host: HTMLElement, engine: Engine, reducedMotion: boolean,
    onSelect: (m: ShaftMarker | null) => void, onScroll?: (info: ShaftScrollInfo) => void,
  ): Promise<ShaftView> {
    const v = new ShaftView(host, engine, reducedMotion, onSelect, onScroll);
    await v.init();
    return v;
  }

  private get theme(): ShaftTheme { return SHAFT_THEMES[this.shellId] ?? SHAFT_THEMES['loam']!; }

  private async init(): Promise<void> {
    this.app = new Application();
    this.res = Math.min(window.devicePixelRatio || 1, 2);
    await this.app.init({
      background: 0x05040a,
      antialias: true,
      resolution: this.res,
      autoDensity: true,
      resizeTo: this.host,
      preserveDrawingBuffer: true,
    });
    if (this.destroyed) { this.app.destroy(true); return; }
    guardPixiRender(this.app, 'shaft'); // covers chunk bakes AND the stage render
    this.host.appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = 'none';

    this.shellId = this.engine.getState().shell.current;
    this.lampDepth = this.targetDepth = this.lastPlayerDepth = this.engine.getState().depth;

    this.world.addChild(this.chunkLayer, this.overlay, this.surface, this.markerLayer);
    this.app.stage.addChild(this.parallax, this.world);
    // The whole cross-section (rock + grain + cracks + channel) is baked per chunk
    // to ONE opaque canvas from GLOBAL coordinates — so chunk overlap draws
    // identical pixels and no seam is possible, and the grain has no tile period.
    this.lamp = new Sprite(this.lampTexture());
    this.lamp.anchor.set(0.5);
    this.lamp.eventMode = 'none';
    this.lamp.blendMode = 'add';
    this.app.stage.addChild(this.lamp, this.dust);
    this.vignette.eventMode = 'none';
    this.app.stage.addChild(this.vignette);
    this.buildDust();

    this.setupPointer();
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.host);
    this.layout();
    this.app.ticker.add(() => this.frame(this.app.ticker.deltaMS / 1000));
  }

  destroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    if (this.wheelHandler && this.app?.canvas) this.app.canvas.removeEventListener('wheel', this.wheelHandler);
    this.flushDisposals();
    for (const c of this.chunks.values()) { c.rt.destroy(true); }
    this.chunks.clear();
    for (const rt of this.rtPool) rt.destroy(true);
    this.rtPool = [];
    if (this.app?.renderer) this.app.destroy(true, { children: true });
  }

  setActive(active: boolean): void {
    if (this.active === active || !this.app?.ticker) return;
    this.active = active;
    if (active) {
      this.targetDepth = this.lampDepth = this.lastPlayerDepth = this.engine.getState().depth;
      // A resize (or the very first sizing) arrived while hidden — run it now,
      // while THIS renderer is the live one.
      if (this.pendingLayout) this.layout();
      // Shell may have changed while hidden.
      const nowShell = this.engine.getState().shell.current;
      if (nowShell !== this.shellId) { this.shellId = nowShell; this.clearChunks(); this.rebuildStatics(); }
      this.app.ticker.start();
    } else {
      this.app.ticker.stop();
    }
  }

  /** Cache hit rate over the session — reported by the perf harness. */
  cacheHitRate(): number { return this.chunkReqs === 0 ? 1 : this.chunkHits / this.chunkReqs; }

  /** The current tuning — the dev panel seeds its sliders from this. */
  getTuning(): ShaftTuning { return { ...this.tuning }; }

  /** Live-tune the renderer (dev panel). Merge, then invalidate everything the
   *  changed values feed: the baked chunks, the lantern texture, the vignette. */
  setTuning(partial: Partial<ShaftTuning>): void {
    Object.assign(this.tuning, partial);
    if (this.lamp) this.lamp.texture = this.lampTexture();
    this.drawVignette();
    this.positionLamp();
    this.clearChunks();   // re-bake with the new numbers
    this.dynSig = null;
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  /** Layout was requested while the view slept — run it on the next wake. */
  private pendingLayout = false;

  private layout(): void {
    if (!this.app?.renderer) return;
    // While the Shaft is hidden, DEFER: layout clears the chunk cache, and
    // destroying RenderTextures while the Face's renderer is the live one is
    // exactly the shared-batcher poisoning that killed the Face (A.38). The
    // ResizeObserver fires on every hero height swap (phone: 66vh ↔ 42vh), so
    // this path runs on every single "back to Dig" without the guard.
    if (!this.active) { this.pendingLayout = true; return; }
    this.pendingLayout = false;
    this.app.resize();
    const { width, height } = this.app.screen;
    this.viewW = width;
    this.viewH = height;
    this.centerX = width / 2;
    this.anchorY = height * 0.54;
    // Show ~20 depths in the viewport; clamp so it reads on a phone and a desktop.
    this.ppd = Math.max(15, Math.min(34, height / 20));
    this.drawVignette();
    this.positionLamp();
    this.clearChunks();       // ppd changed → bakes are the wrong size
    this.dynSig = null;       // force overlay rebuild
    this.rebuildStatics();
  }

  /** Evicted chunk textures waiting to be rendered over (same size until layout). */
  private rtPool: RenderTexture[] = [];
  /** Destruction deferred to the top of the next frame — never mid-batch. */
  private pendingDispose: (() => void)[] = [];

  private flushDisposals(): void {
    if (this.pendingDispose.length === 0) return;
    const list = this.pendingDispose;
    this.pendingDispose = [];
    for (const f of list) f();
  }

  private clearChunks(): void {
    this.flushDisposals();
    for (const c of this.chunks.values()) { c.sprite.destroy(); c.rt.destroy(true); }
    this.chunks.clear();
    this.chunkLayer.removeChildren();
    // Sizes are about to change (ppd/viewW) — the pooled textures are stale.
    for (const rt of this.rtPool) rt.destroy(true);
    this.rtPool = [];
  }

  // -------------------------------------------------------------------------
  // Textures: lantern, noise, vignette
  // -------------------------------------------------------------------------

  private lampTexture(): Texture {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    // A soft warm SWELL, not a bulb: no hard core (inner radius 0, modest alpha),
    // dying gently (falloff stop tunable) so it reads as the player brightening the
    // column they sit in rather than a light on top of it. Max brightness #ffe4b0.
    const fall = Math.max(0.15, Math.min(0.95, this.tuning.lampFalloff));
    g.addColorStop(0.0, 'rgba(255,228,176,0.55)');
    g.addColorStop(fall * 0.37, this.theme.lampInner);
    g.addColorStop(fall, 'rgba(0,0,0,0)');
    g.addColorStop(1.0, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return Texture.from(c);
  }

  private positionLamp(): void {
    if (!this.lamp) return;
    // A soft swell a few vein-widths across — the vein already carries the light,
    // so the lantern just lifts the player's depth, not the whole frame.
    const cap = Math.max(10, this.viewW * 0.042);
    const d = Math.max(170, cap * 9) * this.tuning.lampRadius;
    this.lamp.width = this.lamp.height = d;
    this.lampBaseScale = this.lamp.scale.x;
    this.lamp.position.set(this.centerX, this.anchorY);
  }

  /**
   * Fine-grained stone grain as GLOBAL value-noise, sampled per pixel in the bake
   * (not a repeating tile). Three octaves at ~4/12/40px feature sizes with the
   * FINEST weighted most — granite at arm's length, not a weather map. Because it's
   * a pure function of GLOBAL (x, worldDepth) coordinates it is continuous across
   * chunk boundaries (no seam) and has no tile period (no visible repeat). Returns
   * n∈[0,1] centred ~0.5; the bake maps it to ±brightness on the rock.
   */
  /** One octave of smootherstep value-noise at GLOBAL (gx, gy) — the shared
   *  primitive for the grain, the mineral field and the sediment strata. */
  private vnoise(gx: number, gy: number): number {
    const h = (X: number, Y: number): number => {
      let n = (Math.imul(X | 0, 374761393) + Math.imul(Y | 0, 668265263)) | 0;
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };
    const xi = Math.floor(gx), yi = Math.floor(gy);
    const xf = gx - xi, yf = gy - yi;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  /** Fine-grained stone grain: 3 octaves at ~4/12/40px, finest weighted most.
   *  A pure function of GLOBAL coords → seamless across chunks, no tile period. */
  private stoneNoise(gx: number, gy: number): number {
    const s = this.tuning.texScale;
    const n = this.vnoise(gx / (4 * s), gy / (4 * s)) * 0.5
      + this.vnoise(gx / (12 * s), gy / (12 * s)) * 0.32
      + this.vnoise(gx / (40 * s), gy / (40 * s)) * 0.18;
    return Math.max(0, Math.min(1, n));
  }

  private drawVignette(): void {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d')!;
    // Only the OUTER ~15% of the frame darkens — the rock must stay visible right
    // out to the edges, not be swallowed by the vignette.
    const vig = Math.max(0, Math.min(1, this.tuning.vignette));
    const g = ctx.createRadialGradient(S / 2, S * 0.5, S * 0.1, S / 2, S * 0.5, S * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.85, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${vig})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    // A whisper of extra darkness at the very top/bottom edges only.
    const lg = ctx.createLinearGradient(0, 0, 0, S);
    lg.addColorStop(0, `rgba(0,0,0,${vig * 0.33})`);
    lg.addColorStop(0.1, 'rgba(0,0,0,0)');
    lg.addColorStop(0.9, 'rgba(0,0,0,0)');
    lg.addColorStop(1, `rgba(0,0,0,${vig * 0.33})`);
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, S, S);
    this.vignette.texture = Texture.from(c);
    this.vignette.width = this.viewW;
    this.vignette.height = this.viewH;
    this.vignette.position.set(0, 0);
  }

  private buildDust(): void {
    this.dust.removeChildren();
    if (this.reducedMotion) return;
    for (let i = 0; i < DUST_MAX; i++) {
      const g = new Graphics();
      g.circle(0, 0, 0.6 + Math.random() * 1.1).fill({ color: 0xffe6b0, alpha: 0.5 });
      (g as unknown as { _v: number })._v = 4 + Math.random() * 10;
      (g as unknown as { _p: number })._p = Math.random();
      g.eventMode = 'none';
      this.dust.addChild(g);
    }
    this.dust.eventMode = 'none';
  }

  // -------------------------------------------------------------------------
  // Chunk baking — the static rock, deterministic per (shell, chunk)
  // -------------------------------------------------------------------------

  private edgeX(profile: ChannelSample[], d0: number, depth: number, side: -1 | 1): number {
    // Nearest sample — profile is dense (3/depth), so this is smooth enough.
    const idx = Math.max(0, Math.min(profile.length - 1, Math.round((depth - d0) * 3)));
    const s = profile[idx]!;
    const hw = side < 0 ? s.l : s.r;
    return this.centerX + side * hw * this.ppd;
  }

  private bakeChunk(index: number): Chunk | null {
    const d0 = index * CHUNK_DEPTHS - ShaftView.PAD;
    const d1 = index * CHUNK_DEPTHS + CHUNK_DEPTHS + ShaftView.PAD;
    const W = Math.ceil(this.viewW);
    const H = Math.ceil((CHUNK_DEPTHS + 2 * ShaftView.PAD) * this.ppd);
    const gr = shaftGrammar(this.shellId);
    const profile = channelProfile(this.shellId, d0, d1, 3);
    const yOf = (d: number) => (d - d0) * this.ppd;
    const ppd = this.ppd;
    const cx = this.centerX;
    const t = this.tuning;

    // Wall boundaries — the ACTUAL cave polygon; the light follows these, no cap.
    const lx = (d: number) => this.edgeX(profile, d0, d, -1);
    const rx = (d: number) => this.edgeX(profile, d0, d, 1);

    const hexRGB = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
    const rgbaHex = (c: number, a: number) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

    // The ENTIRE cross-section is composited onto ONE opaque canvas. Because every
    // layer is a pure function of GLOBAL coordinates, the PAD overlap between chunks
    // draws identical pixels — no seam is possible — and the grain (sampled per
    // pixel from global value-noise) has no tile period.
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

    // ---- 1. ROCK — full-canvas textured stone. The walls come from a SMOOTH path
    //         below (not per-pixel classification), so there are NO stair steps.
    //         Value from grain + horizontal sediment strata; hue/saturation varied
    //         by an independent low-frequency MINERAL field and drifted by depth
    //         (shallow warmer/browner → deep cooler/greyer). Half-res, upscaled.
    const rockBase = hexRGB(rockBands(this.shellId)[2]!).map((v) => clamp255(v * t.rockValue)) as [number, number, number];
    const [hB, sB, lB] = rgbToHsl(rockBase[0], rockBase[1], rockBase[2]);
    const sed = SEDIMENT_BY_SHELL[this.shellId] ?? 0.3;
    const RW = Math.max(1, Math.ceil(W / 2)), RH = Math.max(1, Math.ceil(H / 2));
    // The MINERAL field is low-frequency (~240-300px), so it is precomputed on a
    // coarse grid aligned to a GLOBAL cell size (so adjacent chunks sample the same
    // grid points → seamless) and bilinear-sampled per pixel. This keeps the two
    // expensive mineral noise calls off the per-pixel path.
    const CS = 24;                                   // coarse cell, global px
    const gxBase = 0, gyBase = Math.floor((d0 * ppd) / CS) * CS - CS;
    const CW = Math.ceil(W / CS) + 3, CH = Math.ceil(H / CS) + 3;
    const mHue = new Float32Array(CW * CH), mSat = new Float32Array(CW * CH);
    for (let cy = 0; cy < CH; cy++) for (let cxi = 0; cxi < CW; cxi++) {
      const gx = gxBase + cxi * CS, gyc = gyBase + cy * CS;
      mHue[cy * CW + cxi] = this.vnoise((gx + 9137) / 240, (gyc + 4271) / 240) - 0.5;
      mSat[cy * CW + cxi] = this.vnoise((gx + 2311) / 300, (gyc + 8123) / 300) - 0.5;
    }
    const sampleC = (arr: Float32Array, gx: number, gy: number): number => {
      const fx = (gx - gxBase) / CS, fy = (gy - gyBase) / CS;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const i = y0 * CW + x0;
      const a = arr[i]!, b = arr[i + 1]!, c = arr[i + CW]!, d = arr[i + CW + 1]!;
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    };
    const rc = document.createElement('canvas');
    rc.width = RW; rc.height = RH;
    const rctx = rc.getContext('2d')!;
    const img = rctx.createImageData(RW, RH);
    const dat = img.data;
    const sxr = W / RW, syr = H / RH;
    const gx0 = d0 * ppd;
    for (let py = 0; py < RH; py++) {
      const wy = py * syr;
      const gy = gx0 + wy;                                  // GLOBAL depth px — continuous across chunks
      const temp = driftParams(this.shellId, d0 + wy / ppd).temp; // 0 shallow-warm .. 1 deep-cool
      // Sediment strata: a low band-frequency function of DEPTH only (horizontal).
      const strata = (this.vnoise(0, gy / 5.5) - 0.5) * 0.9 + (this.vnoise(0, gy / 17) - 0.5);
      for (let px = 0; px < RW; px++) {
        const wx = px * sxr;
        const grain = this.stoneNoise(wx, gy) - 0.5;
        const mh = sampleC(mHue, wx, gy), msv = sampleC(mSat, wx, gy);
        const h = hB + mh * 30 * t.mineralVar - temp * 8;
        const s = clamp01(sB + msv * 0.4 * t.mineralVar - temp * 0.22 * sB);
        const l = clamp01(lB * (1 + grain * 2 * t.texStrength) + strata * 0.05 * sed * t.sediment - temp * 0.07 * lB);
        let [r, g, b] = hslToRgb(h, s, l);
        // Rare ore glint — sparse high-frequency peaks (a cheap hash); a find, not sparkle.
        let hh = (Math.imul((wx | 0) + 555, 374761393) + Math.imul((gy | 0) + 777, 668265263)) | 0;
        hh = Math.imul(hh ^ (hh >>> 13), 1274126177);
        const fl = ((hh ^ (hh >>> 16)) >>> 0) / 4294967296;
        if (fl > 0.9975) { const k = (fl - 0.9975) / 0.0025 * 0.7; r += (255 - r) * k; g += (198 - g) * k * 0.8; b += (90 - b) * k * 0.4; }
        const i = (py * RW + px) * 4;
        dat[i] = clamp255(r); dat[i + 1] = clamp255(g); dat[i + 2] = clamp255(b); dat[i + 3] = 255;
      }
    }
    rctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(rc, 0, 0, RW, RH, 0, 0, W, H);

    // ---- 2. CRACKS — additive glow leaking out of the walls into the rock (drawn
    //         before the void, so the void's dark fill trims any that stray inward).
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const TIP = lerp(gr.crackWarm, 0x140a04, 0.82);
    const FADE = 4.5;
    const cracks = crackNetwork(this.shellId, index, d0, d1);
    const nDraw = Math.floor(cracks.length * Math.max(0, Math.min(1, t.crackDensity)));
    for (let ci = 0; ci < nDraw; ci++) {
      const cr = cracks[ci]!;
      const side: -1 | 1 = cr.pts[cr.pts.length - 1]!.x < 0 ? -1 : 1;
      const anchorX = this.edgeX(profile, d0, cr.pts[0]!.y, side);
      ctx.beginPath();
      for (let k = 0; k < cr.pts.length; k++) { const p = cr.pts[k]!, x = anchorX + p.x * ppd, y = yOf(p.y); if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.strokeStyle = rgbaHex(gr.crackWarm, 0.1 * t.crackBright); ctx.lineWidth = 3.4; ctx.stroke();
      for (let i = 1; i < cr.pts.length; i++) {
        const p0 = cr.pts[i - 1]!, p1 = cr.pts[i]!;
        const tt = Math.min(1, ((p0.dist + p1.dist) / 2) / FADE);
        ctx.beginPath(); ctx.moveTo(anchorX + p0.x * ppd, yOf(p0.y)); ctx.lineTo(anchorX + p1.x * ppd, yOf(p1.y));
        ctx.strokeStyle = rgbaHex(lerp(gr.crackWarm, TIP, tt), Math.max(0.06, 0.95 * (1 - tt)) * t.crackBright);
        ctx.lineWidth = 2 * (1 - tt) + 0.25 * tt; ctx.stroke();
      }
    }
    ctx.restore();

    // ---- 3. THE CAVE VOID — a SMOOTH antialiased bezier path (no pixel stairs).
    //         The dug space is dark; a chamber is WIDER dark space, not a gap in
    //         the light. Walls come from here, not per-pixel classification.
    const leftPts: [number, number][] = [], rightPts: [number, number][] = [];
    for (let d = d0; d <= d1 + 1e-6; d += 0.5) leftPts.push([lx(d), yOf(d)]);
    for (let d = d1; d >= d0 - 1e-6; d -= 0.5) rightPts.push([rx(d), yOf(d)]);
    const smooth = (pts: [number, number][], move: boolean) => {
      if (move) ctx.moveTo(pts[0]![0], pts[0]![1]); else ctx.lineTo(pts[0]![0], pts[0]![1]);
      for (let i = 1; i < pts.length - 1; i++) { const xc = (pts[i]![0] + pts[i + 1]![0]) / 2, yc = (pts[i]![1] + pts[i + 1]![1]) / 2; ctx.quadraticCurveTo(pts[i]![0], pts[i]![1], xc, yc); }
      const n = pts.length; ctx.quadraticCurveTo(pts[n - 2]![0], pts[n - 2]![1], pts[n - 1]![0], pts[n - 1]![1]);
    };
    ctx.beginPath(); smooth(leftPts, true); smooth(rightPts, false); ctx.closePath();
    ctx.fillStyle = '#0a0705'; ctx.fill();

    // ---- 4. WALL RIM — the lit lip on the walls: a soft additive stroke on each
    //         wall curve (open paths, so no horizontal connector line at chunk ends).
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const rimPass = (w: number, c: number, a: number) => {
      ctx.strokeStyle = rgbaHex(c, a * t.rimBright); ctx.lineWidth = w;
      ctx.beginPath(); smooth(leftPts, true); ctx.stroke();
      ctx.beginPath(); smooth(rightPts, true); ctx.stroke();
    };
    rimPass(16, gr.rim, 0.08);
    rimPass(6, gr.rim, 0.2);
    rimPass(2, gr.crackWarm, 0.45);
    ctx.restore();

    // ---- 5. THE VEIN — the through-line: a CONSTANT-width lit thread down the
    //         centre at EVERY depth, never widening, dimming, or breaking. One
    //         additive strip with soft edges (a rect → no per-row stairs).
    const vh = Math.max(3, 8 * t.veinWidth);
    const vc = channelStops(this.shellId)[5]!; // brightest channel tone
    const vg = ctx.createLinearGradient(cx - vh, 0, cx + vh, 0);
    vg.addColorStop(0, rgbaHex(vc, 0));
    vg.addColorStop(0.5, rgbaHex(vc, 0.85 * t.veinBright));
    vg.addColorStop(1, rgbaHex(vc, 0));
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = vg; ctx.fillRect(cx - vh, 0, vh * 2, H); ctx.restore();

    // Compose: the opaque canvas is the base; decals (Pixi) go on top. Because the
    // canvas is opaque and global-continuous, the chunk overlap can never seam.
    const canvasTex = Texture.from(canvas);
    const cont = new Container();
    cont.addChild(new Sprite(canvasTex));
    this.drawDecals(cont, index, d0, d1, profile, yOf);
    // RECYCLE, don't destroy: evicted chunk textures go back to a pool and are
    // rendered over. Destroying a texture that a pooled batch still references
    // is the shared-batcher poisoning reproduced in A.38 ("null.clear" /
    // "null.geometry" on later frames) — recycling removes the destroy entirely.
    const rt = this.rtPool.pop() ?? RenderTexture.create({ width: W, height: H, resolution: 1 });
    this.app.renderer.render({ container: cont, target: rt, clear: true });
    // Defer the bake scaffolding's destruction to the top of the NEXT frame:
    // tearing it down while this frame's batches still reference it is the
    // same poisoning by another door.
    this.pendingDispose.push(() => { cont.destroy({ children: true }); canvasTex.destroy(true); });
    // A SWALLOWED bake render (the guard eats poisoned frames) must not be
    // cached — a blank RenderTexture cached forever IS the "random empty band
    // in the column" report. Return the texture to the pool and signal the
    // caller to retry next frame, when the batch pools have rebuilt.
    if (lastRenderFailed(this.app)) {
      this.rtPool.push(rt);
      return null;
    }
    const sprite = new Sprite(rt);
    sprite.eventMode = 'none';
    return { key: `${this.shellId}:${index}`, index, rt, sprite, used: this.chunkClock++ };
  }

  private drawDecals(cont: Container, index: number, d0: number, d1: number, profile: ChannelSample[], yOf: (d: number) => number): void {
    const gr = shaftGrammar(this.shellId);
    const th = this.theme;
    for (const dc of decals(this.shellId, index, d0, d1)) {
      const ex = this.edgeX(profile, d0, dc.depth, dc.side as -1 | 1);
      const g = new Graphics();
      const s = 6 * dc.scale;
      const into = dc.side; // + into right rock, − into left
      switch (dc.kind) {
        case 'root': case 'vine':
          g.moveTo(0, 0).lineTo(into * s, -s * 0.6).lineTo(into * s * 1.8, -s * 0.2).moveTo(into * s, -s * 0.6).lineTo(into * s * 1.5, -s * 1.2)
            .stroke({ width: 1.2, color: dc.kind === 'vine' ? 0x8fbf5e : th.rail, alpha: 0.55 });
          break;
        case 'support': case 'bolt':
          g.rect(into > 0 ? 0 : -s * 2, -s * 0.5, s * 2, s).fill({ color: th.rail, alpha: 0.4 });
          break;
        case 'crystal': case 'facet': case 'shard':
          g.poly([0, 0, into * s, -s * 0.8, into * s * 1.6, 0, into * s, s * 0.8]).fill({ color: th.stoneEdge, alpha: 0.6 })
            .poly([0, 0, into * s, -s * 0.8, into * s * 1.6, 0, into * s, s * 0.8]).stroke({ width: 0.8, color: gr.rim, alpha: 0.5 });
          break;
        case 'vein': case 'ember': case 'crack': case 'seam': case 'fracture': case 'goldvein':
          g.moveTo(0, -s).lineTo(into * s * 1.4, s).stroke({ width: 1.6, color: gr.crackWarm, alpha: 0.55 });
          g.blendMode = 'add';
          break;
        case 'fossil': case 'glyph':
          g.circle(into * s, 0, s * 0.7).stroke({ width: 1, color: gr.rim, alpha: 0.5 });
          break;
        default: // moss / wetmoss / void / beamcatch
          g.circle(into * s * 0.6, 0, s * 0.6).fill({ color: th.dust, alpha: 0.35 });
      }
      g.position.set(ex, yOf(dc.depth));
      g.rotation = dc.rot;
      cont.addChild(g);
    }
  }

  private ensureChunks(): void {
    const topDepth = this.lampDepth - (this.anchorY / this.ppd) - 2;
    const botDepth = this.lampDepth + ((this.viewH - this.anchorY) / this.ppd) + 2;
    const first = Math.max(0, Math.floor(topDepth / CHUNK_DEPTHS));
    const last = Math.floor(botDepth / CHUNK_DEPTHS);
    for (let i = first; i <= last; i++) {
      const key = `${this.shellId}:${i}`;
      this.chunkReqs++;
      let c = this.chunks.get(key);
      if (c) { this.chunkHits++; c.used = this.chunkClock++; }
      else {
        const baked = this.bakeChunk(i);
        if (!baked) continue; // failed bake — retry next frame, never cache blank
        c = baked;
        this.chunks.set(key, c);
        this.chunkLayer.addChild(c.sprite);
      }
      c.sprite.position.set(0, (i * CHUNK_DEPTHS - ShaftView.PAD) * this.ppd);
    }
    // Evict LRU beyond the cap. The sprite comes off the stage now but is
    // destroyed next frame; the RenderTexture is recycled, never destroyed.
    while (this.chunks.size > ShaftView.LRU_CAP) {
      let lru: Chunk | null = null;
      for (const c of this.chunks.values()) if (!lru || c.used < lru.used) lru = c;
      if (!lru) break;
      const dead = lru;
      this.chunkLayer.removeChild(dead.sprite);
      this.pendingDispose.push(() => dead.sprite.destroy());
      this.rtPool.push(dead.rt);
      this.chunks.delete(dead.key);
    }
  }

  // -------------------------------------------------------------------------
  // Dynamic overlay — rail, scars, markers, the player. Never baked.
  // -------------------------------------------------------------------------

  private rebuildStatics(): void {
    const s = this.engine.getState();
    const shell = currentShell(s);
    const rail = railDepth(s);
    const sig: DynSig = {
      shell: shell.id, record: s.depthRecords[shell.id] ?? 0, reached: s.shaft.reached, rail,
      floor: shell.floorDepth, toolTier: equippedTool(s).tier,
      scars: s.shaft.scars.filter((x) => x.shell === shell.id).map((x) => `${x.depth}${x.kind}`).join(','),
      caches: s.shaft.caches.filter((x) => x.shell === shell.id).map((c) => `${c.depth}${c.material ? (cacheReady(s, c) ? 'R' : 'C') : 'E'}`).join(','),
    };
    if (this.dynSig && JSON.stringify(this.dynSig) === JSON.stringify(sig)) return;
    this.dynSig = sig;
    this.drawOverlay(s, shell, rail);
  }

  private drawOverlay(s: ReturnType<Engine['getState']>, shell: ReturnType<typeof currentShell>, rail: number): void {
    const th = this.theme;
    const gr = shaftGrammar(this.shellId);
    const yOf = (d: number) => d * this.ppd;
    const revealed = Math.max(s.depthRecords[shell.id] ?? 0, s.shaft.reached);
    this.overlay.clear();
    this.markerLayer.removeChildren();
    this.markerHits = [];

    // Rail down the left wall.
    if (rail > 0) {
      const railX = () => this.centerX - shaftGrammar(this.shellId).hw * this.ppd - 6;
      this.overlay.moveTo(railX() - 3, 0).lineTo(railX() - 3, yOf(rail)).moveTo(railX() + 1, 0).lineTo(railX() + 1, yOf(rail))
        .stroke({ width: 1.4, color: th.rail, alpha: 0.6 });
      for (let d = 0; d <= rail; d += 2) this.overlay.moveTo(railX() - 4, yOf(d)).lineTo(railX() + 2, yOf(d)).stroke({ width: 1.2, color: th.rail, alpha: 0.5 });
    }

    // Scars — small glyphs where things happened.
    for (const sc of s.shaft.scars) {
      if (sc.shell !== shell.id || sc.depth > revealed) continue;
      const y = yOf(sc.depth);
      const col = sc.kind === 'flood' ? 0x4a7fa0 : sc.kind === 'warden' ? 0xc06040 : 0x8b7fb0;
      this.overlay.circle(this.centerX + (sc.depth % 2 ? 1 : -1) * (gr.hw * this.ppd + 12), y, 2).fill({ color: col, alpha: 0.6 });
    }

    // Markers (physical things). Positioned at the channel centre / edge.
    for (const w of shell.walls) {
      if (w.depth > revealed) continue;
      this.addMarker({ kind: 'wall', depth: w.depth, tier: w.tier }, this.centerX, w.depth, () => {
        const g = new Graphics();
        for (let i = -2; i <= 2; i++) g.moveTo(-10, i * 3).lineTo(10, i * 3 + 1.5).stroke({ width: 1.4, color: 0xd8a080, alpha: 0.5 });
        return g;
      });
    }
    const wallDef = WALL_BY_SHELL.get(shell.id);
    if (wallDef && wallDef.depth <= revealed) {
      this.addMarker({ kind: 'unmineable', depth: wallDef.depth }, this.centerX, wallDef.depth, () => {
        const g = new Graphics();
        g.rect(-this.ppd * 0.9, -6, this.ppd * 1.8, 12).fill({ color: 0x2a2740, alpha: 0.9 }).stroke({ width: 1, color: 0xcfc6e0, alpha: 0.4 });
        return g;
      });
    }
    for (const c of s.shaft.caches) {
      if (c.shell !== shell.id || c.depth > revealed) continue;
      const ready = !!c.material && cacheReady(s, c);
      this.addMarker({ kind: 'cache', depth: c.depth }, this.edgeCX(1), c.depth, () => {
        const g = new Graphics();
        g.rect(-6, -6, 12, 12).fill({ color: 0x141018, alpha: 0.9 }).stroke({ width: 1, color: c.material ? (ready ? 0x9fd8c0 : 0x8a7f70) : 0x50463a, alpha: 0.8 });
        if (c.material) g.circle(0, 0, 3).fill({ color: ready ? 0x9fd8c0 : 0xc98e4a, alpha: 0.9 });
        return g;
      });
    }
    if (revealed >= shell.floorDepth - 1) {
      this.addMarker({ kind: 'floor', depth: shell.floorDepth }, this.centerX, shell.floorDepth, () => {
        const g = new Graphics();
        g.ellipse(0, 4, this.ppd * 1.1, 6).fill({ color: 0x000000, alpha: 0.95 });
        g.moveTo(-this.ppd, 0).lineTo(this.ppd, 0).stroke({ width: 1, color: 0xf0d890, alpha: 0.35 });
        return g;
      });
    }

    // The player — a soft warm swell in the channel's own glow, no hard white
    // core: a bead of light that belongs to the column, not a pin dropped on top.
    const you = new Graphics();
    you.circle(0, 0, 8).fill({ color: this.theme.glow, alpha: 0.26 });
    you.circle(0, 0, 3.5).fill({ color: 0xffe4b0, alpha: 0.9 });
    you.blendMode = 'add';
    you.position.set(this.centerX, yOf(s.depth));
    this.markerLayer.addChild(you);

    // The surface — a headframe silhouette at depth 0, the only sky in the game.
    this.surface.removeChildren();
    if (revealed >= 0) this.buildSurface();
  }

  private edgeCX(side: -1 | 1): number {
    return this.centerX + side * shaftGrammar(this.shellId).hw * this.ppd;
  }

  private addMarker(marker: ShaftMarker, x: number, depth: number, make: () => Graphics): void {
    const g = make();
    g.position.set(x, depth * this.ppd);
    g.eventMode = 'none';
    this.markerLayer.addChild(g);
    this.markerHits.push({ marker, x, depth });
  }

  private buildSurface(): void {
    const cx = this.centerX;
    const p = this.ppd;
    const g = new Graphics();
    // Dim horizon: a night sky with the faintest glow at the ground line — the
    // only sky in the game. Dark to nearly-black upward.
    g.rect(-cx, -p * 9, this.viewW, p * 9).fill({ color: 0x07060c });
    for (let i = 0; i < 5; i++) {
      g.rect(-cx, -p * (1 + i * 0.9), this.viewW, p * 0.9).fill({ color: 0x0d0b16, alpha: 0.5 - i * 0.09 });
    }
    // Faint warm glow behind the works, low on the horizon.
    const glow = new Sprite(this.lamp!.texture);
    glow.anchor.set(0.5); glow.width = glow.height = p * 10; glow.tint = 0xffd890;
    glow.alpha = 0.18; glow.blendMode = 'add'; glow.position.set(cx, 0);
    // Ground line + spoil heaps (mounds of dug rock) as black mass.
    g.moveTo(-cx, 0).lineTo(this.viewW, 0).stroke({ width: 1.2, color: 0x2a2418, alpha: 0.6 });
    g.moveTo(-p * 6, 0).quadraticCurveTo(-p * 4, -p * 1.6, -p * 2, 0).fill({ color: 0x000000 });
    g.moveTo(p * 2.4, 0).quadraticCurveTo(p * 4.5, -p * 2.1, p * 7, 0).fill({ color: 0x000000 });
    // A HEADFRAME with mass: a hoist house, an A-frame derrick over the mouth,
    // the winding wheel, a chimney — all solid black against the glow.
    const S = new Graphics();
    // hoist house (a low building to one side)
    S.rect(p * 1.4, -p * 2.4, p * 3.0, p * 2.4).fill({ color: 0x000000 });
    S.rect(p * 3.9, -p * 3.2, p * 0.5, p * 0.9).fill({ color: 0x000000 }); // chimney
    // derrick legs over the mouth
    const hh = p * 5.2;
    S.poly([-p * 1.5, 0, -p * 0.35, -hh, p * 0.35, -hh, p * 1.5, 0, p * 0.95, 0, p * 0.18, -hh * 0.92, -p * 0.18, -hh * 0.92, -p * 0.95, 0]).fill({ color: 0x000000 });
    // cross-bracing
    for (let i = 1; i <= 3; i++) {
      const yy = -hh * (i / 4);
      const wsp = p * 1.5 * (1 - (i / 4) * 0.78);
      S.moveTo(-wsp, yy).lineTo(wsp, yy).stroke({ width: 1.4, color: 0x000000 });
      S.moveTo(-wsp, yy).lineTo(wsp * 0.6, yy - hh / 6).stroke({ width: 1, color: 0x000000 });
    }
    // the winding wheel at the top
    S.circle(0, -hh - p * 0.2, p * 0.85).stroke({ width: p * 0.28, color: 0x000000 });
    S.circle(0, -hh - p * 0.2, p * 0.85).fill({ color: 0x000000, alpha: 0.0 });
    S.circle(0, -hh - p * 0.2, p * 0.16).fill({ color: 0x000000 });
    // a single lit window in the hoist house
    S.rect(p * 2.6, -p * 1.5, p * 0.5, p * 0.6).fill({ color: 0xf3c678, alpha: 0.6 });
    g.position.set(cx, 0);
    S.position.set(cx, 0);
    this.surface.addChild(glow, g, S);
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  private frameErrCount = 0;
  /** Same throw-proofing as FaceView: a bad frame is logged and skipped, never
   *  the death of the loop. */
  private frame(dt: number): void {
    try {
      this.frameInner(dt);
    } catch (e) {
      if (this.frameErrCount < 3) {
        this.frameErrCount += 1;
        // eslint-disable-next-line no-console
        console.error('[ShaftView.frame] recovered from a throw (ticker kept alive):', e);
      }
    }
  }

  private frameInner(dt: number): void {
    if (this.destroyed || !this.active) return;
    // Yesterday's bake scaffolding and evicted sprites die HERE, before any
    // rendering this frame — never while a batch still points at them.
    this.flushDisposals();
    const s = this.engine.getState();
    if (s.shell.current !== this.shellId) { this.shellId = s.shell.current; this.clearChunks(); this.dynSig = null; }

    // Follow the player ONLY when their depth actually changes (a climb or a
    // descend) — never on a timer. A view the user scrolled or wheeled to stays
    // exactly where they left it until they choose to move.
    if (s.depth !== this.lastPlayerDepth) { this.lastPlayerDepth = s.depth; this.targetDepth = s.depth; }
    // Momentum on release.
    if (!this.dragging && Math.abs(this.dragVel) > 0.01) {
      this.targetDepth += this.dragVel * dt;
      this.dragVel *= 0.9;
    }
    this.targetDepth = Math.max(-3, this.targetDepth);
    const ease = this.reducedMotion ? 1 : Math.min(1, dt * 7);
    this.lampDepth += (this.targetDepth - this.lampDepth) * ease;

    this.ensureChunks();
    this.rebuildStatics();

    // Scroll: place the world so lampDepth sits at the anchor.
    this.world.y = this.anchorY - this.lampDepth * this.ppd;
    this.world.x = 0;
    this.parallax.y = this.anchorY - this.lampDepth * this.ppd * 0.7;

    // Lantern flicker + dust — off under reduced motion.
    if (!this.reducedMotion && this.lamp) {
      this.flick += dt;
      const f = 1 + Math.sin(this.flick * 6.3) * 0.02 + Math.sin(this.flick * 2.1) * 0.025;
      this.lamp.scale.set(this.lampBaseScale * f);
      this.tickDust(dt);
    }

    if (this.onScroll) {
      const top = this.lampDepth - this.anchorY / this.ppd;
      const bottom = this.lampDepth + (this.viewH - this.anchorY) / this.ppd;
      this.onScroll({ top, bottom, ppd: this.ppd });
    }
  }

  private tickDust(dt: number): void {
    const coneR = Math.min(this.viewW, this.viewH) * 0.32;
    for (const child of this.dust.children) {
      const g = child as Graphics & { _v: number; _p: number };
      g._p += dt * 0.04;
      if (g._p > 1) { g._p = 0; }
      const ang = g._p * Math.PI * 2 + (g as unknown as { rotation: number }).rotation;
      const rad = coneR * (0.2 + g._p * 0.8);
      g.position.set(this.centerX + Math.cos(ang * 3.3) * rad, this.anchorY + (g._p - 0.5) * coneR * 1.4 + Math.sin(this.flick + g._v) * 4);
      g.alpha = 0.5 * (1 - g._p) * (rad < coneR ? 1 : 0.2);
    }
  }

  // -------------------------------------------------------------------------
  // Pointer — drag to look, tap to travel or open a marker
  // -------------------------------------------------------------------------

  private setupPointer(): void {
    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = { contains: () => true };
    stage.on('pointerdown', (e: { global: { y: number } }) => {
      this.dragging = true; this.dragLast = e.global.y; this.dragMoved = 0; this.dragVel = 0;
    });
    stage.on('pointermove', (e: { global: { y: number } }) => {
      if (!this.dragging) return;
      const dy = e.global.y - this.dragLast;
      this.dragLast = e.global.y;
      this.dragMoved += Math.abs(dy);
      this.targetDepth -= dy / this.ppd;
      this.dragVel = -dy / this.ppd / Math.max(0.001, this.app.ticker.deltaMS / 1000) * 0.2;
    });
    const end = (e: { global: { x: number; y: number } }) => {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.dragMoved < 6) this.handleTap(e.global.x, e.global.y);
    };
    stage.on('pointerup', end);
    stage.on('pointerupoutside', () => { this.dragging = false; });

    // Wheel / trackpad scrolls the column on the same axis as a drag — down the
    // wheel moves deeper. Normalise the two delta modes to a gentle notch.
    this.wheelHandler = (ev: WheelEvent) => {
      ev.preventDefault();
      const step = ev.deltaMode === 1 ? ev.deltaY * 1.1 : ev.deltaY / 42; // lines vs pixels
      this.targetDepth = Math.max(-3, this.targetDepth + step);
      this.dragVel = 0; // a wheel notch is a discrete move, not a flick
    };
    this.app.canvas.addEventListener('wheel', this.wheelHandler, { passive: false });
  }

  private handleTap(px: number, py: number): void {
    // Screen → depth.
    const depth = this.lampDepth + (py - this.anchorY) / this.ppd;
    // Nearest marker within a generous row.
    let best: { m: ShaftMarker; score: number } | null = null;
    for (const h of this.markerHits) {
      const rowDist = Math.abs(h.depth - depth);
      const xDist = Math.abs(h.x - px);
      if (rowDist < 1.4 && xDist < 96) {
        const score = rowDist + xDist / 120;
        if (!best || score < best.score) best = { m: h.marker, score };
      }
    }
    if (best) { this.onSelect(best.m); return; }
    // A tap on bare rock never travels — it only dismisses an open sheet. Moving
    // is done with the Climb / Descend controls (and the rail / lift), so a stray
    // tap can no longer change your depth.
    this.onSelect(null);
  }
}
