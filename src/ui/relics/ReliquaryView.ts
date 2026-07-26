/**
 * THE RELIQUARY — one Pixi application, two rendered places.
 *
 * A.48 made Relics and the Museum correct and left them a spreadsheet: rows of
 * stat cards and a grid of `empty / empty / empty`. This is the Shaft treatment
 * applied to the collection screens — the same discipline, for the same reason
 * (they are the "big memorable game" surface and a list cannot carry that).
 *
 *  - THE WORKSHOP is a reliquary wall. Six lamplit niches; a relic mounted in
 *    each; dull and cold when dormant, cracked with light when stirring, lit
 *    from within when awake. An empty niche is a dark hollow. A resonance draws
 *    a line of light between the niches it binds, so a set FIRING is a thing
 *    you see rather than a badge you read.
 *  - THE GALLERY is a hall you pan in both axes. Plinths carry what you own.
 *    Empty plinths glow faintly as invitations. When the collection forms a set
 *    the plinths holding it come up bright and a name is carved over them.
 *
 * ONE APPLICATION FOR BOTH. Relics and the Museum are adjacent tabs over the
 * same collection, and every extra Pixi Application is another WebGL context
 * and another set of shared batch pools to poison. They swap SCENES, not apps —
 * which is also what lets "view it in the gallery" be a camera move.
 *
 * PERF, the Shaft's rules:
 *  - The hall background (floor, wall, lamps, plinth stone) bakes ONCE to a
 *    RenderTexture and is a sprite thereafter.
 *  - Every relic bakes to its own RenderTexture keyed by `lookKey`, so it
 *    re-draws when it wakes or is fused and never on an idle frame.
 *  - A failed bake is never cached (`lastRenderFailed`) — the Shaft learned
 *    that one the hard way: a blank texture becomes a permanent hole.
 *  - Mount-and-hide: the ticker stops when the tab is not showing. The app is
 *    never destroyed under a live Face.
 *  - Reduced motion: no pulse, no inertia. Everything still reads.
 */
import { Application, Container, Graphics, Rectangle, Sprite, Texture, RenderTexture } from 'pixi.js';
import { guardPixiRender, lastRenderFailed } from '../pixiGuard';
import type { Engine } from '../../engine';
import type { GameState, RelicInstance } from '../../engine/types';
import { RELIC_SLOTS, activeResonances } from '../../engine/systems/relics';
import { activeExhibits } from '../../engine/systems/museum';
import { drawRelic, drawHalo, lookKey, lookOf } from './relicArt';

export type ReliquaryMode = 'relics' | 'museum';

export type ReliquaryHit =
  | { kind: 'niche'; slot: number; uid: number | null }
  | { kind: 'held'; uid: number }
  | { kind: 'plinth'; uid: number | null };

/** A carved name the HTML layer draws over the canvas, in page pixels. */
export interface CarvedLabel {
  id: string;
  name: string;
  line: string;
  x: number;
  y: number;
}

const BG = 0x07060a;
const LAMP = 0xffcf8a;
const STONE = 0x171419;
const STONE_LIT = 0x2a242b;

/** World geometry of the gallery. */
const PLINTH_W = 86;
const PLINTH_H = 104;
const HALL_PAD = 46;

interface Baked { rt: RenderTexture; used: number }

export class ReliquaryView {
  private app!: Application;
  private mode: ReliquaryMode = 'relics';

  // --- workshop ------------------------------------------------------------
  private shop = new Container();
  private shopWall = new Sprite(Texture.WHITE);
  private nicheLayer = new Container();
  private resoLayer = new Graphics();
  private heldLayer = new Container();
  private heldClip = new Graphics();
  private heldScroll = 0;
  private heldMax = 0;

  // --- gallery -------------------------------------------------------------
  private hall = new Container();
  private hallFloor = new Sprite(Texture.WHITE);
  private plinthLayer = new Container();
  private setGlow = new Graphics();
  private camX = 0;
  private camY = 0;
  private worldW = 0;
  private worldH = 0;
  private hallBake: RenderTexture | null = null;
  private hallKey = '';

  // --- shared --------------------------------------------------------------
  private glowLayer = new Container();
  private vignette = new Sprite(Texture.WHITE);
  private baked = new Map<string, Baked>();
  private bakeClock = 0;
  private static readonly BAKE_CAP = 96;

  private viewW = 0;
  private viewH = 0;
  private res = 1;
  private pulse = 0;
  private active = true;
  private destroyed = false;
  private pendingLayout = false;
  private resizeObserver!: ResizeObserver;
  private wheelHandler?: (e: WheelEvent) => void;

  private dragging = false;
  private dragX = 0;
  private dragY = 0;
  private dragMoved = 0;
  private hits: Array<{ hit: ReliquaryHit; x: number; y: number; r: number }> = [];
  private sig = '';

  private constructor(
    private host: HTMLElement,
    private engine: Engine,
    private reducedMotion: boolean,
    private onSelect: (h: ReliquaryHit | null) => void,
    private onLabels: (labels: CarvedLabel[]) => void,
  ) {}

  static async create(
    host: HTMLElement, engine: Engine, reducedMotion: boolean,
    onSelect: (h: ReliquaryHit | null) => void,
    onLabels: (labels: CarvedLabel[]) => void,
  ): Promise<ReliquaryView> {
    const v = new ReliquaryView(host, engine, reducedMotion, onSelect, onLabels);
    await v.init();
    return v;
  }

  private async init(): Promise<void> {
    this.app = new Application();
    this.res = Math.min(window.devicePixelRatio || 1, 2);
    await this.app.init({
      background: BG, antialias: true, resolution: this.res,
      autoDensity: true, resizeTo: this.host,
    });
    if (this.destroyed) { this.app.destroy(true); return; }
    guardPixiRender(this.app, 'reliquary');
    this.host.appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = 'none';

    this.shop.addChild(this.shopWall, this.resoLayer, this.nicheLayer, this.heldClip, this.heldLayer);
    this.hall.addChild(this.hallFloor, this.setGlow, this.plinthLayer);
    // The set-light is LIGHT: additive, so it lifts the floor and the plinth
    // stone it lands on rather than fogging them.
    this.setGlow.blendMode = 'add';
    this.app.stage.addChild(this.hall, this.shop, this.glowLayer, this.vignette);
    this.vignette.eventMode = 'none';
    this.glowLayer.eventMode = 'none';

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
    for (const b of this.baked.values()) b.rt.destroy(true);
    this.baked.clear();
    this.hallBake?.destroy(true);
    this.hallBake = null;
    if (this.app?.renderer) this.app.destroy(true, { children: true });
  }

  setActive(active: boolean): void {
    if (this.active === active || !this.app?.ticker) return;
    this.active = active;
    if (active) {
      if (this.pendingLayout) this.layout();
      this.sig = ''; // force a rebuild: state moved while we slept
      this.app.ticker.start();
    } else {
      this.app.ticker.stop();
    }
  }

  setMode(mode: ReliquaryMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.sig = '';
    this.layoutScenes();
  }

  /** Pan the gallery to the plinth holding this relic, and light it. */
  focusRelic(uid: number): void {
    const held = this.state().relics.held;
    const idx = held.findIndex((r) => r.uid === uid);
    if (idx < 0) return;
    const cols = this.hallCols();
    const x = HALL_PAD + (idx % cols) * PLINTH_W + PLINTH_W / 2;
    const y = HALL_PAD + Math.floor(idx / cols) * PLINTH_H + PLINTH_H / 2;
    this.camX = x - this.viewW / 2;
    this.camY = y - this.viewH / 2;
    this.clampCam();
  }

  /** Bake cache hit-rate, for the perf harness. */
  bakedCount(): number { return this.baked.size; }

  /**
   * THE VISIBLE FRAME as a 2D canvas — the only way a harness can assert
   * anything about a rendered surface. It exists because the alternative is
   * asserting from component props, which is precisely how two rebuilds of
   * these screens were reported "built" without anyone looking at them.
   *
   * Framed to the SCREEN, not the stage: the stage bounds include the
   * collection strip hanging below the viewport, and extracting those makes
   * every sample coordinate silently wrong.
   */
  snapshotCanvas(): HTMLCanvasElement {
    return this.app.renderer.extract.canvas({
      target: this.app.stage,
      frame: new Rectangle(0, 0, this.viewW, this.viewH),
    }) as HTMLCanvasElement;
  }

  private state(): GameState { return this.engine.getState() as GameState; }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  private layout(): void {
    if (!this.app?.renderer) return;
    // Same guard as the Shaft: resizing destroys textures, and doing that while
    // another renderer is live is the shared-batcher poisoning that killed the
    // Face in A.38.
    if (!this.active) { this.pendingLayout = true; return; }
    this.pendingLayout = false;
    this.app.resize();
    this.viewW = this.app.screen.width;
    this.viewH = this.app.screen.height;
    this.drawVignette();
    this.hallKey = '';
    this.sig = '';
    this.layoutScenes();
  }

  private layoutScenes(): void {
    this.shop.visible = this.mode === 'relics';
    this.hall.visible = this.mode === 'museum';
  }

  private hallCols(): number {
    return Math.max(2, Math.floor((this.viewW - HALL_PAD) / PLINTH_W));
  }

  private drawVignette(): void {
    const g = new Graphics();
    const steps = 7;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      g.rect(0, 0, this.viewW, this.viewH * 0.16 * (1 - t) + 2).fill({ color: 0x000000, alpha: 0.1 });
      g.rect(0, this.viewH - (this.viewH * 0.16 * (1 - t) + 2), this.viewW, this.viewH * 0.16 * (1 - t) + 2)
        .fill({ color: 0x000000, alpha: 0.1 });
    }
    this.vignette.texture = this.app.renderer.generateTexture(g);
    this.vignette.width = this.viewW;
    this.vignette.height = this.viewH;
    g.destroy();
  }

  // -------------------------------------------------------------------------
  // Baking — one texture per relic, keyed by everything the drawing reads
  // -------------------------------------------------------------------------

  private relicTexture(r: RelicInstance, radius: number): Texture {
    const key = lookKey(r, radius);
    const hit = this.baked.get(key);
    if (hit) { hit.used = ++this.bakeClock; return hit.rt; }

    const g = new Graphics();
    drawRelic(g, r, radius, 1);
    const size = Math.ceil(radius * 2.8);
    const rt = RenderTexture.create({ width: size, height: size, resolution: this.res });
    const holder = new Container();
    holder.addChild(g);
    holder.position.set(size / 2, size / 2);
    this.app.renderer.render({ container: holder, target: rt, clear: true });
    holder.destroy({ children: true });

    // A poisoned frame must never become a permanent blank object.
    if (lastRenderFailed(this.app)) { rt.destroy(true); return Texture.EMPTY; }

    this.baked.set(key, { rt, used: ++this.bakeClock });
    if (this.baked.size > ReliquaryView.BAKE_CAP) {
      let oldestKey = '';
      let oldest = Infinity;
      for (const [k, v] of this.baked) if (v.used < oldest) { oldest = v.used; oldestKey = k; }
      const victim = this.baked.get(oldestKey);
      if (victim) { victim.rt.destroy(true); this.baked.delete(oldestKey); }
    }
    return rt;
  }

  // -------------------------------------------------------------------------
  // The frame
  // -------------------------------------------------------------------------

  private frame(dt: number): void {
    if (this.destroyed || !this.app?.renderer) return;
    if (!this.reducedMotion) this.pulse = (this.pulse + dt * 0.7) % (Math.PI * 2);

    const s = this.state();
    const sig = this.signature(s);
    if (sig !== this.sig) {
      this.sig = sig;
      if (this.mode === 'relics') this.buildWorkshop(s); else this.buildGallery(s);
    }
    if (this.mode === 'museum') {
      this.hall.position.set(-Math.round(this.camX), -Math.round(this.camY));
      this.publishLabels(s);
    }
    // The breathing is the only per-frame work: one alpha on one layer.
    const breathe = this.reducedMotion ? 1 : 0.82 + 0.18 * (0.5 + 0.5 * Math.sin(this.pulse));
    this.glowLayer.alpha = breathe;
    if (this.mode === 'museum') this.setGlow.alpha = 0.86 + 0.14 * (breathe - 0.82) / 0.18;
  }

  /** Everything a rebuild depends on. Cheap to compute, and it means the scene
   *  graph is untouched on a frame where nothing about the collection moved. */
  private signature(s: GameState): string {
    const held = s.relics.held.map((r) => `${r.uid}.${r.rarity}.${r.waking ?? 0}.${r.fusedFrom}`).join(',');
    return `${this.mode}|${this.viewW}x${this.viewH}|${s.relics.equipped.join('-')}|${held}|${s.museum.exhibitsFound.length}`;
  }

  // -------------------------------------------------------------------------
  // THE WORKSHOP — six niches and the collection you draw from
  // -------------------------------------------------------------------------

  private buildWorkshop(s: GameState): void {
    this.hits = [];
    this.nicheLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.heldLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.glowLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.resoLayer.clear();

    // The wall behind everything, baked once per size.
    this.drawWall();

    const cols = this.viewW >= 520 ? 3 : 2;
    const rows = Math.ceil(RELIC_SLOTS / cols);
    const wallH = Math.min(this.viewH * 0.62, rows * 128 + 26);
    const cw = this.viewW / cols;
    const ch = wallH / rows;
    const radius = Math.min(cw, ch) * 0.26;

    const worn = s.relics.equipped;
    const centres: Array<{ x: number; y: number; uid: number | null }> = [];

    for (let slot = 0; slot < RELIC_SLOTS; slot++) {
      const cx = (slot % cols) * cw + cw / 2;
      const cy = Math.floor(slot / cols) * ch + ch / 2 + 8;
      const uid = worn[slot] ?? null;
      const relic = uid === null ? null : s.relics.held.find((r) => r.uid === uid) ?? null;
      centres.push({ x: cx, y: cy, uid: relic ? relic.uid : null });

      const niche = new Graphics();
      // A hollow cut into the wall: an arch, dark inside, with a lit lip.
      const w = radius * 1.72;
      const h = radius * 2.1;
      niche.roundRect(cx - w, cy - h, w * 2, h * 2, radius * 0.5)
        .fill({ color: 0x050407, alpha: 0.95 });
      niche.roundRect(cx - w, cy - h, w * 2, h * 2, radius * 0.5)
        .stroke({ width: 1.4, color: relic ? 0x6b5a3e : 0x2a2530, alpha: relic ? 0.8 : 0.55 });
      if (relic) {
        // Lamp wash down the inside of an occupied niche.
        niche.ellipse(cx, cy - h * 0.5, w * 0.9, h * 0.55).fill({ color: LAMP, alpha: 0.05 });
      }
      this.nicheLayer.addChild(niche);

      if (relic) {
        const halo = new Graphics();
        drawHalo(halo, relic, radius);
        halo.position.set(cx, cy);
        halo.blendMode = 'add';
        this.glowLayer.addChild(halo);

        const sp = new Sprite(this.relicTexture(relic, radius));
        sp.anchor.set(0.5);
        sp.position.set(cx, cy);
        this.nicheLayer.addChild(sp);
        this.hits.push({ hit: { kind: 'niche', slot, uid: relic.uid }, x: cx, y: cy, r: radius * 1.7 });
      } else {
        // An empty niche is a dark hollow, not a slot with a plus sign in it.
        this.hits.push({ hit: { kind: 'niche', slot, uid: null }, x: cx, y: cy, r: radius * 1.7 });
      }
    }

    // RESONANCE — a line of light between the niches that are binding. This is
    // the set firing, drawn: two stones out of the same dark, humming.
    for (const res of activeResonances(s)) {
      const bound = centres.filter((c) => {
        const r = c.uid === null ? null : s.relics.held.find((x) => x.uid === c.uid);
        return !!r && r.source === res.source;
      });
      const colour = lookOf(res.source).ember;
      for (let i = 0; i < bound.length; i++) {
        for (let j = i + 1; j < bound.length; j++) {
          const a = bound[i]!, b = bound[j]!;
          this.resoLayer.moveTo(a.x, a.y).lineTo(b.x, b.y)
            .stroke({ width: 9, color: colour, alpha: 0.16 });
          this.resoLayer.moveTo(a.x, a.y).lineTo(b.x, b.y)
            .stroke({ width: 3.5, color: colour, alpha: 0.4 });
          this.resoLayer.moveTo(a.x, a.y).lineTo(b.x, b.y)
            .stroke({ width: 1.3, color: 0xffffff, alpha: 0.7 });
        }
      }
    }

    // THE COLLECTION you draw from — everything not in a niche.
    const spare = s.relics.held.filter((r) => !worn.includes(r.uid));
    const top = wallH + 10;
    const cellW = Math.max(52, Math.min(74, this.viewW / Math.floor(this.viewW / 62)));
    const perRow = Math.max(3, Math.floor(this.viewW / cellW));
    const rad = cellW * 0.3;
    this.heldLayer.position.set(0, top);
    this.heldClip.clear()
      .rect(0, top - 6, this.viewW, this.viewH - top + 6)
      .fill({ color: 0x0a0810, alpha: 0.85 });

    spare.forEach((r, i) => {
      const x = (i % perRow) * cellW + cellW / 2;
      const y = Math.floor(i / perRow) * (cellW + 6) + rad + 10;
      const sp = new Sprite(this.relicTexture(r, rad));
      sp.anchor.set(0.5);
      sp.position.set(x, y);
      this.heldLayer.addChild(sp);
      this.hits.push({ hit: { kind: 'held', uid: r.uid }, x, y: y + top - this.heldScroll, r: rad * 1.4 });
    });
    const contentH = Math.ceil(spare.length / perRow) * (cellW + 6) + 20;
    this.heldMax = Math.max(0, contentH - (this.viewH - top));
    this.heldScroll = Math.min(this.heldScroll, this.heldMax);
    this.heldLayer.position.set(0, top - this.heldScroll);
    this.onLabels([]);
  }

  private wallKey = '';

  private drawWall(): void {
    const key = `${this.viewW}x${this.viewH}`;
    if (this.wallKey === key) return;
    this.wallKey = key;
    const g = new Graphics();
    g.rect(0, 0, this.viewW, this.viewH).fill({ color: STONE });
    // Courses of stone, and a warm wash where the lamps hang.
    for (let y = 0; y < this.viewH; y += 26) {
      g.moveTo(0, y).lineTo(this.viewW, y).stroke({ width: 1, color: 0x000000, alpha: 0.28 });
    }
    for (let i = 0; i < 5; i++) {
      g.ellipse(this.viewW * 0.5, this.viewH * 0.16, this.viewW * (0.5 + i * 0.14), this.viewH * (0.12 + i * 0.07))
        .fill({ color: LAMP, alpha: 0.016 });
    }
    this.shopWall.texture = this.app.renderer.generateTexture(g);
    this.shopWall.width = this.viewW;
    this.shopWall.height = this.viewH;
    g.destroy();
  }

  // -------------------------------------------------------------------------
  // THE GALLERY — a hall you walk, showing what you own
  // -------------------------------------------------------------------------

  private buildGallery(s: GameState): void {
    this.hits = [];
    this.plinthLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.glowLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.setGlow.clear();

    const held = s.relics.held;
    const cols = this.hallCols();
    // Always at least one row of empty plinths past the end: an invitation, not
    // a grid of homework. The old panel drew `need` slots and called the gap a
    // to-do list; here the room is simply bigger than the collection.
    const rows = Math.max(3, Math.ceil((held.length + cols) / cols));
    this.worldW = HALL_PAD * 2 + cols * PLINTH_W;
    this.worldH = HALL_PAD * 2 + rows * PLINTH_H;

    this.bakeHall(cols, rows);

    // Which plinths a standing set is about — those are the ones that light.
    const lit = new Map<number, { name: string; line: string }>();
    for (const { def, members } of activeExhibits(s)) {
      for (const m of members) lit.set(m.uid, { name: def.name, line: def.line });
    }
    this.litSets = activeExhibits(s).map(({ def, members }) => ({ def, members }));

    held.forEach((r, i) => {
      const c = i % cols, row = Math.floor(i / cols);
      const x = HALL_PAD + c * PLINTH_W + PLINTH_W / 2;
      const y = HALL_PAD + row * PLINTH_H + PLINTH_H * 0.42;
      const rad = PLINTH_W * 0.27;
      const sp = new Sprite(this.relicTexture(r, rad));
      sp.anchor.set(0.5, 0.85);
      sp.position.set(x, y);
      this.plinthLayer.addChild(sp);

      if (lit.has(r.uid)) {
        // THE HALL REACTING. This has to be unmistakable from across the room —
        // the first pass drew it at alpha 0.05 and a pixel probe could not tell
        // it from the floor, which means neither could a player. A shaft of
        // lamplight down onto the plinth, and a bright pool under it.
        for (let k = 5; k >= 1; k--) {
          const t = k / 5;
          this.setGlow.ellipse(x, y - PLINTH_H * 0.1, PLINTH_W * 0.5 * t, PLINTH_H * 0.6 * t)
            .fill({ color: LAMP, alpha: 0.05 });
        }
        this.setGlow.ellipse(x, y + PLINTH_H * 0.3, PLINTH_W * 0.42, PLINTH_H * 0.12)
          .fill({ color: LAMP, alpha: 0.34 });
        this.setGlow.ellipse(x, y, PLINTH_W * 0.3, PLINTH_W * 0.1)
          .fill({ color: LAMP, alpha: 0.28 });
      }
      if ((r.waking ?? 0) >= 1) {
        const halo = new Graphics();
        drawHalo(halo, r, rad);
        halo.position.set(x - this.camX, y - this.camY);
        halo.blendMode = 'add';
        halo.label = `halo:${x}:${y}`;
        this.glowLayer.addChild(halo);
      }
      this.hits.push({ hit: { kind: 'plinth', uid: r.uid }, x, y, r: PLINTH_W * 0.42 });
    });

    this.clampCam();
  }

  private litSets: Array<{ def: { id: string; name: string; line: string }; members: RelicInstance[] }> = [];

  /** The hall itself: floor, wall, lamps, and every plinth's stone. Baked once
   *  per (cols,rows) — it changes only when the collection changes size. */
  private bakeHall(cols: number, rows: number): void {
    const key = `${cols}x${rows}`;
    if (this.hallKey === key && this.hallBake) return;
    this.hallKey = key;
    this.hallBake?.destroy(true);

    const g = new Graphics();
    g.rect(0, 0, this.worldW, this.worldH).fill({ color: 0x0b0910 });
    // Floor boards running away down the hall.
    for (let y = 0; y < this.worldH; y += 34) {
      g.rect(0, y, this.worldW, 17).fill({ color: 0x100d14, alpha: 0.7 });
    }
    // The two long walls, darker at the edges — the hall has sides.
    g.rect(0, 0, HALL_PAD * 0.7, this.worldH).fill({ color: 0x07060a, alpha: 0.85 });
    g.rect(this.worldW - HALL_PAD * 0.7, 0, HALL_PAD * 0.7, this.worldH).fill({ color: 0x07060a, alpha: 0.85 });

    for (let row = 0; row < rows; row++) {
      // A lamp on the wall every other row, and its pool on the floor.
      if (row % 2 === 0) {
        const ly = HALL_PAD + row * PLINTH_H;
        for (const lx of [HALL_PAD * 0.35, this.worldW - HALL_PAD * 0.35]) {
          g.circle(lx, ly, 3.4).fill({ color: LAMP, alpha: 0.9 });
          for (let i = 4; i >= 1; i--) {
            g.circle(lx, ly, 10 * i).fill({ color: LAMP, alpha: 0.012 * (5 - i) });
          }
        }
      }
      for (let c = 0; c < cols; c++) {
        const x = HALL_PAD + c * PLINTH_W + PLINTH_W / 2;
        const y = HALL_PAD + row * PLINTH_H + PLINTH_H * 0.42;
        const pw = PLINTH_W * 0.34;
        // Shadow, body, lit top — a stone standing in a room.
        g.ellipse(x, y + PLINTH_H * 0.3, pw * 1.2, 7).fill({ color: 0x000000, alpha: 0.5 });
        g.rect(x - pw, y, pw * 2, PLINTH_H * 0.3).fill({ color: STONE });
        g.rect(x - pw, y, pw * 0.6, PLINTH_H * 0.3).fill({ color: STONE_LIT, alpha: 0.5 });
        g.ellipse(x, y, pw, pw * 0.34).fill({ color: STONE_LIT });
        g.ellipse(x, y, pw, pw * 0.34).stroke({ width: 1, color: 0x3d3542, alpha: 0.8 });
      }
    }

    const rt = RenderTexture.create({ width: this.worldW, height: this.worldH, resolution: 1 });
    this.app.renderer.render({ container: g, target: rt, clear: true });
    g.destroy();
    if (lastRenderFailed(this.app)) { rt.destroy(true); this.hallKey = ''; return; }
    this.hallBake = rt;
    this.hallFloor.texture = rt;
    this.hallFloor.width = this.worldW;
    this.hallFloor.height = this.worldH;
  }

  /**
   * The carved names. HTML, positioned from the camera — the same call the
   * Shaft's depth ruler makes, and for the same reason: serif small-caps at
   * 10px is crisper as text than as a texture, and it stays selectable.
   */
  private publishLabels(s: GameState): void {
    const cols = this.hallCols();
    const held = s.relics.held;
    const out: CarvedLabel[] = [];
    for (const { def, members } of this.litSets) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity;
      for (const m of members) {
        const i = held.findIndex((r) => r.uid === m.uid);
        if (i < 0) continue;
        const x = HALL_PAD + (i % cols) * PLINTH_W + PLINTH_W / 2;
        const y = HALL_PAD + Math.floor(i / cols) * PLINTH_H;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y);
      }
      if (!Number.isFinite(minX)) continue;
      out.push({
        id: def.id, name: def.name, line: def.line,
        x: (minX + maxX) / 2 - this.camX,
        // Never under the readout in the top corner — the first pass clamped to
        // 46 and the name landed straight across "N on the plinths".
        y: Math.max(64, minY - this.camY - 10),
      });
    }
    // TWO SETS CAN CLAIM THE SAME PLINTHS. Four relics off one run are also
    // four turned up by one drill, and the first pass drew both names at the
    // same point, on top of each other, which read as neither. Stack them.
    out.sort((a, b) => a.y - b.y || a.x - b.x);
    for (let i = 1; i < out.length; i++) {
      const prev = out[i - 1]!, cur = out[i]!;
      if (Math.abs(cur.y - prev.y) < 26 && Math.abs(cur.x - prev.x) < 150) cur.y = prev.y + 26;
    }
    this.onLabels(out);
  }

  // -------------------------------------------------------------------------
  // Pointer — drag pans (gallery) or scrolls (workshop); a tap selects
  // -------------------------------------------------------------------------

  private clampCam(): void {
    this.camX = Math.max(0, Math.min(Math.max(0, this.worldW - this.viewW), this.camX));
    this.camY = Math.max(0, Math.min(Math.max(0, this.worldH - this.viewH), this.camY));
  }

  private setupPointer(): void {
    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = { contains: () => true };

    stage.on('pointerdown', (e) => {
      this.dragging = true;
      this.dragMoved = 0;
      this.dragX = e.global.x;
      this.dragY = e.global.y;
    });
    stage.on('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.global.x - this.dragX;
      const dy = e.global.y - this.dragY;
      this.dragX = e.global.x;
      this.dragY = e.global.y;
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      if (this.mode === 'museum') {
        this.camX -= dx; this.camY -= dy; this.clampCam();
      } else {
        this.heldScroll = Math.max(0, Math.min(this.heldMax, this.heldScroll - dy));
        this.sig = ''; // hit boxes move with the strip
      }
    });
    const end = (x: number, y: number) => {
      const wasDrag = this.dragMoved > 8;
      this.dragging = false;
      if (wasDrag) return;
      const px = this.mode === 'museum' ? x + this.camX : x;
      const py = this.mode === 'museum' ? y + this.camY : y;
      let best: ReliquaryHit | null = null;
      let bestD = Infinity;
      for (const h of this.hits) {
        const d = Math.hypot(h.x - px, h.y - py);
        if (d < h.r && d < bestD) { bestD = d; best = h.hit; }
      }
      this.onSelect(best);
    };
    stage.on('pointerup', (e) => end(e.global.x, e.global.y));
    stage.on('pointerupoutside', () => { this.dragging = false; });

    this.wheelHandler = (ev: WheelEvent) => {
      ev.preventDefault();
      if (this.mode === 'museum') { this.camY += ev.deltaY * 0.6; this.camX += ev.deltaX * 0.6; this.clampCam(); }
      else { this.heldScroll = Math.max(0, Math.min(this.heldMax, this.heldScroll + ev.deltaY * 0.6)); this.sig = ''; }
    };
    this.app.canvas.addEventListener('wheel', this.wheelHandler, { passive: false });
  }
}
