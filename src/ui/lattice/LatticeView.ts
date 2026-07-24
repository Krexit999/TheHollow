/**
 * The Lattice — PixiJS renderer. Older and more deliberate than the mining
 * face: carved sockets in dark basalt, motifs as shapes with weight, and
 * resonance shown as engraved light between them. Completed chords read as a
 * single beam across the board. Respects prefers-reduced-motion.
 */
import { Application, Container, Graphics } from 'pixi.js';
import { guardPixiRender } from '../pixiGuard';
import type { Engine, GameState, MotifShape } from '../../engine';
import {
  boardRelations,
  cellScores,
  nearChordLines,
  type Relation,
} from '../../engine/systems/lattice/latticeCore';
import { boardCells, hexToPixel, isSealed, parseKey, pixelToHex } from '../../engine/systems/lattice/hex';

const BG = 0x0c100e;
const SOCKET_FILL = 0x141b17;
const SOCKET_EDGE_DARK = 0x080b09;
const SOCKET_EDGE_LIGHT = 0x2b3a32;
const ENGRAVING = 0x39493f;
const BONE = 0xcfc9b4;
const JADE = 0x9fd8c0;
const TEAL = 0x58b8c9;
const DISCORD = 0x8a4a38;
const CHORD_BEAM = 0xe4d69c;

const REL_COLORS: Record<Relation['kind'], number> = {
  harmony: JADE,
  flow: TEAL,
  discord: DISCORD,
};

export interface LatticeViewProps {
  /** Brush: what a tap on an empty cell places. */
  brush: { shape: MotifShape; rank: number };
  selected: string | null;
  patternGhost: number; // 0-2
  onTap(q: number, r: number): void;
}

interface Celebration {
  g: Graphics;
  life: number;
  maxLife: number;
  x: number;
  y: number;
}

export class LatticeView {
  private app!: Application;
  private root = new Container();
  private socketLayer = new Graphics();
  private relationLayer = new Graphics();
  private nearLayer = new Graphics();
  private chordLayer = new Graphics();
  private motifLayer = new Graphics();
  private overlayLayer = new Graphics();
  private fxLayer = new Container();

  private hexSize = 24;
  private boardSig = '';
  private ringsDrawn = 0;
  private time = 0;
  private lastFeedSeq = -1;
  private celebrations: Celebration[] = [];
  private destroyed = false;
  private resizeObserver!: ResizeObserver;

  props: LatticeViewProps;

  private constructor(
    private host: HTMLElement,
    private engine: Engine,
    private reducedMotion: boolean,
    props: LatticeViewProps,
  ) {
    this.props = props;
  }

  static async create(
    host: HTMLElement,
    engine: Engine,
    reducedMotion: boolean,
    props: LatticeViewProps,
  ): Promise<LatticeView> {
    const view = new LatticeView(host, engine, reducedMotion, props);
    await view.init();
    return view;
  }

  private async init(): Promise<void> {
    this.app = new Application();
    await this.app.init({
      background: BG,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      resizeTo: this.host,
    });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    guardPixiRender(this.app, 'lattice');
    this.host.appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = 'manipulation';

    this.root.addChild(
      this.socketLayer,
      this.relationLayer,
      this.nearLayer,
      this.chordLayer,
      this.motifLayer,
      this.overlayLayer,
      this.fxLayer,
    );
    this.app.stage.addChild(this.root);

    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = { contains: () => true };
    this.app.stage.on('pointertap', (e) => {
      const local = this.root.toLocal(e.global);
      const { q, r } = pixelToHex(local.x, local.y, this.hexSize);
      this.props.onTap(q, r);
    });

    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.host);
    this.layout();
    this.app.ticker.add(() => this.frame(this.app.ticker.deltaMS / 1000));
  }

  destroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    if (this.app?.renderer) this.app.destroy(true, { children: true });
  }

  private active = true;

  /** The Lattice stays mounted for its whole life (the documented exception) —
   *  but its ticker used to free-run under every other tab, a third live
   *  renderer interleaving with the Face and the Shaft. Same discipline now:
   *  hidden ⇒ paused; shown ⇒ resume and render a frame immediately. */
  setActive(active: boolean): void {
    if (this.active === active || !this.app?.ticker) return;
    this.active = active;
    if (active) {
      this.layout();
      this.app.ticker.start();
      this.frame(0.016);
      this.app.render();
    } else {
      this.app.ticker.stop();
    }
  }

  private layout(): void {
    if (!this.app?.renderer) return;
    this.app.resize(); // re-measure the host (it may have just been un-hidden)
    const rings = this.engine.getState().lattice.rings;
    const { width, height } = this.app.screen;
    // The board's largest drawn element is the background CIRCLE in drawSockets,
    // radius √3·(rings+1.15)·hexSize — bigger than the hex-center span. Fitting
    // only the hex span (as before) let that circle overflow and clip at ring 4.
    // So size the whole thing to fit the CIRCLE inside the smaller dimension,
    // with a touch of extra so a rim always shows. The floor is small (6px) so a
    // big board on a phone shrinks to fit rather than spilling out of the frame.
    const R = Math.sqrt(3) * (rings + 1.3); // circle radius in hex-size units, +rim
    const fit = Math.min(width, height) / (2 * R);
    this.hexSize = Math.max(6, Math.min(fit, 34));
    this.root.position.set(width / 2, height / 2);
    this.ringsDrawn = 0; // force socket redraw
    this.boardSig = '';
  }

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------

  private hexCorners(cx: number, cy: number, size: number): [number, number][] {
    const pts: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6; // pointy-top
      pts.push([cx + size * Math.cos(a), cy + size * Math.sin(a)]);
    }
    return pts;
  }

  private tracePoly(g: Graphics, pts: [number, number][]): Graphics {
    g.moveTo(pts[0]![0], pts[0]![1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]![0], pts[i]![1]);
    g.closePath();
    return g;
  }

  private drawSockets(rings: number): void {
    const g = this.socketLayer;
    g.clear();
    // The slab behind everything.
    const extent = this.hexSize * Math.sqrt(3) * (rings + 1.15);
    g.circle(0, 0, extent).fill({ color: 0x10150f, alpha: 0.55 });
    g.circle(0, 0, extent).stroke({ width: 1.5, color: ENGRAVING, alpha: 0.5 });
    for (const cell of boardCells(rings)) {
      const { x, y } = hexToPixel(cell.q, cell.r, this.hexSize);
      const pts = this.hexCorners(x, y, this.hexSize * 0.92);
      // THE NAVEL — the centre socket is fused shut. Sealed on purpose.
      if (isSealed(cell.q, cell.r)) {
        this.tracePoly(g, pts).fill(0x0a0d0b);
        this.tracePoly(g, pts).stroke({ width: 1.6, color: 0x1e2622, alpha: 0.9 });
        const s = this.hexSize * 0.34;
        g.moveTo(x - s, y - s * 0.6).lineTo(x + s * 0.7, y + s).stroke({ width: 1.4, color: ENGRAVING, alpha: 0.8 });
        g.moveTo(x + s * 0.5, y - s).lineTo(x - s * 0.4, y + s * 0.7).stroke({ width: 1.1, color: ENGRAVING, alpha: 0.6 });
        continue;
      }
      // Recessed socket: dark fill, carved shadow at the top, light foot.
      this.tracePoly(g, pts).fill(SOCKET_FILL);
      this.tracePoly(g, pts).stroke({ width: 1.4, color: SOCKET_EDGE_DARK, alpha: 0.9 });
      g.moveTo(pts[4]![0], pts[4]![1])
        .lineTo(pts[5]![0], pts[5]![1])
        .lineTo(pts[0]![0], pts[0]![1])
        .stroke({ width: 1, color: SOCKET_EDGE_LIGHT, alpha: 0.35 });
      // Faint engraved inner hex — the worn line of long use.
      this.tracePoly(g, this.hexCorners(x, y, this.hexSize * 0.62)).stroke({
        width: 0.8,
        color: ENGRAVING,
        alpha: 0.35,
      });
    }
  }

  private drawMotifShape(
    g: Graphics,
    shape: MotifShape,
    x: number,
    y: number,
    size: number,
    color: number,
    alpha = 1,
  ): void {
    switch (shape) {
      case 'circle':
        g.circle(x, y, size).fill({ color, alpha });
        g.circle(x, y, size * 0.6).stroke({ width: 1.2, color: BG, alpha: 0.55 });
        break;
      case 'square': {
        const s = size * 0.85;
        g.rect(x - s, y - s, s * 2, s * 2).fill({ color, alpha });
        g.rect(x - s * 0.55, y - s * 0.55, s * 1.1, s * 1.1).stroke({ width: 1.2, color: BG, alpha: 0.55 });
        break;
      }
      case 'triangle': {
        const s = size * 1.15;
        g.moveTo(x, y - s)
          .lineTo(x + s * 0.9, y + s * 0.62)
          .lineTo(x - s * 0.9, y + s * 0.62)
          .closePath()
          .fill({ color, alpha });
        g.moveTo(x, y - s * 0.45)
          .lineTo(x + s * 0.42, y + s * 0.3)
          .lineTo(x - s * 0.42, y + s * 0.3)
          .closePath()
          .stroke({ width: 1.1, color: BG, alpha: 0.55 });
        break;
      }
      case 'hex': {
        this.tracePoly(g, this.hexCorners(x, y, size)).fill({ color, alpha });
        this.tracePoly(g, this.hexCorners(x, y, size * 0.55)).stroke({ width: 1.2, color: BG, alpha: 0.55 });
        break;
      }
    }
  }

  private drawBoard(state: GameState): void {
    const lat = state.lattice;
    const scores = cellScores(lat);
    const g = this.motifLayer;
    g.clear();
    for (const [key, motif] of Object.entries(lat.cells)) {
      const { q, r } = parseKey(key);
      const { x, y } = hexToPixel(q, r, this.hexSize);
      const score = scores[key] ?? 0;
      // Weight: rank sets size; resonance warms the stone.
      const size = this.hexSize * (0.3 + motif.rank * 0.075);
      const lit = Math.max(0, Math.min(1, score / 8));
      const color = score < 0 ? 0xa89684 : BONE;
      // Ambient glow for resonating motifs.
      if (lit > 0.05) {
        g.circle(x, y, size * (1.7 + lit)).fill({ color: JADE, alpha: 0.05 + lit * 0.12 });
      }
      // Shadow foot, then the stone.
      this.drawMotifShape(g, motif.shape, x + 1, y + 2, size, 0x000000, 0.4);
      this.drawMotifShape(g, motif.shape, x, y, size, color);
      // Rank notches beneath.
      const nw = 2.6;
      const total = motif.rank * nw + (motif.rank - 1) * 1.4;
      for (let i = 0; i < motif.rank; i++) {
        g.rect(x - total / 2 + i * (nw + 1.4), y + this.hexSize * 0.55, nw, 2).fill({
          color: JADE,
          alpha: 0.85,
        });
      }
    }
  }

  private drawRelations(state: GameState): void {
    const g = this.relationLayer;
    g.clear();
    for (const rel of boardRelations(state.lattice)) {
      const a = parseKey(rel.from);
      const b = parseKey(rel.to);
      const pa = hexToPixel(a.q, a.r, this.hexSize);
      const pb = hexToPixel(b.q, b.r, this.hexSize);
      // Draw each undirected pair once (harmony/discord emit both directions).
      if (rel.kind !== 'flow' && (a.q < b.q || (a.q === b.q && a.r < b.r))) continue;
      const mag = Math.min(1, Math.abs(rel.value) / 4);
      const color = REL_COLORS[rel.kind];
      g.moveTo(pa.x, pa.y)
        .lineTo(pb.x, pb.y)
        .stroke({ width: rel.kind === 'discord' ? 1 : 1.5 + mag * 1.5, color, alpha: 0.2 + mag * 0.35 });
      if (rel.kind === 'flow') {
        // A small chevron at 2/3 along, pointing at the receiver.
        const t = 0.62;
        const mx = pa.x + (pb.x - pa.x) * t;
        const my = pa.y + (pb.y - pa.y) * t;
        const ang = Math.atan2(pb.y - pa.y, pb.x - pa.x);
        const s = 4;
        g.moveTo(mx - s * Math.cos(ang - 0.5), my - s * Math.sin(ang - 0.5))
          .lineTo(mx, my)
          .lineTo(mx - s * Math.cos(ang + 0.5), my - s * Math.sin(ang + 0.5))
          .stroke({ width: 1.4, color, alpha: 0.5 + mag * 0.3 });
      }
    }
  }

  private drawChords(state: GameState, pulse: number): void {
    const g = this.chordLayer;
    g.clear();
    for (const chord of state.lattice.activeChords) {
      const pts = chord.cells.map((k) => {
        const { q, r } = parseKey(k);
        return hexToPixel(q, r, this.hexSize);
      });
      const first = pts[0]!;
      const last = pts[pts.length - 1]!;
      // Wide soft glow, then the beam — reads from across the room.
      g.moveTo(first.x, first.y)
        .lineTo(last.x, last.y)
        .stroke({ width: this.hexSize * 0.7, color: CHORD_BEAM, alpha: 0.06 + pulse * 0.04 });
      g.moveTo(first.x, first.y)
        .lineTo(last.x, last.y)
        .stroke({ width: 3, color: CHORD_BEAM, alpha: 0.4 + pulse * 0.25 });
      for (const p of pts) {
        g.circle(p.x, p.y, this.hexSize * 0.5).stroke({
          width: 1.5,
          color: CHORD_BEAM,
          alpha: 0.35 + pulse * 0.2,
        });
      }
    }
  }

  private drawNearLines(state: GameState, shimmer: number): void {
    const g = this.nearLayer;
    g.clear();
    const strength = 1 + this.props.patternGhost * 0.8;
    for (const near of nearChordLines(state.lattice)) {
      const a = parseKey(near.placed[0]);
      const b = parseKey(near.placed[1]);
      const m = parseKey(near.missing);
      const pa = hexToPixel(a.q, a.r, this.hexSize);
      const pb = hexToPixel(b.q, b.r, this.hexSize);
      const pm = hexToPixel(m.q, m.r, this.hexSize);
      const alpha = (0.05 + shimmer * 0.09) * strength;
      // The hum: a faint line through all three, dashed toward the gap.
      g.moveTo(pa.x, pa.y).lineTo(pb.x, pb.y).stroke({ width: 1.2, color: JADE, alpha });
      const seg = 5;
      const dx = pm.x - pb.x;
      const dy = pm.y - pb.y;
      const len = Math.hypot(dx, dy);
      const steps = Math.max(2, Math.floor(len / (seg * 2)));
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = t0 + 0.5 / steps;
        g.moveTo(pb.x + dx * t0, pb.y + dy * t0)
          .lineTo(pb.x + dx * t1, pb.y + dy * t1)
          .stroke({ width: 1.2, color: JADE, alpha: alpha * 1.2 });
      }
      g.circle(pm.x, pm.y, this.hexSize * 0.35).stroke({ width: 1, color: JADE, alpha: alpha * 1.4 });
      // Pattern Ghost 2: the missing shape appears as an outline.
      if (this.props.patternGhost >= 2) {
        const ghost = new Graphics();
        this.drawMotifShape(ghost, near.shape, pm.x, pm.y, this.hexSize * 0.4, JADE, 0);
        // drawMotifShape fills — redraw as stroke-only ghost:
        ghost.clear();
        this.strokeMotifOutline(g, near.shape, pm.x, pm.y, this.hexSize * 0.4, alpha * 2.2);
        ghost.destroy();
      }
    }
  }

  private strokeMotifOutline(g: Graphics, shape: MotifShape, x: number, y: number, size: number, alpha: number): void {
    switch (shape) {
      case 'circle':
        g.circle(x, y, size).stroke({ width: 1.2, color: JADE, alpha });
        break;
      case 'square': {
        const s = size * 0.85;
        g.rect(x - s, y - s, s * 2, s * 2).stroke({ width: 1.2, color: JADE, alpha });
        break;
      }
      case 'triangle': {
        const s = size * 1.15;
        g.moveTo(x, y - s)
          .lineTo(x + s * 0.9, y + s * 0.62)
          .lineTo(x - s * 0.9, y + s * 0.62)
          .closePath()
          .stroke({ width: 1.2, color: JADE, alpha });
        break;
      }
      case 'hex':
        this.tracePoly(g, this.hexCorners(x, y, size)).stroke({ width: 1.2, color: JADE, alpha });
        break;
    }
  }

  private drawOverlay(state: GameState): void {
    const g = this.overlayLayer;
    g.clear();
    if (this.props.selected) {
      const { q, r } = parseKey(this.props.selected);
      const { x, y } = hexToPixel(q, r, this.hexSize);
      this.tracePoly(g, this.hexCorners(x, y, this.hexSize * 0.98)).stroke({
        width: 2,
        color: BONE,
        alpha: 0.9,
      });
    }
    void state;
  }

  // -------------------------------------------------------------------------
  // Celebration — a discovery is a real moment.
  // -------------------------------------------------------------------------

  private celebrate(cells: string[]): void {
    if (this.reducedMotion) return;
    for (const key of cells) {
      const { q, r } = parseKey(key);
      const { x, y } = hexToPixel(q, r, this.hexSize);
      for (let i = 0; i < 10; i++) {
        const g = new Graphics();
        const a = Math.random() * Math.PI * 2;
        const dist = 4 + Math.random() * 6;
        g.circle(0, 0, 1 + Math.random() * 1.6).fill(i % 3 === 0 ? CHORD_BEAM : JADE);
        g.position.set(x + Math.cos(a) * dist, y + Math.sin(a) * dist);
        this.fxLayer.addChild(g);
        this.celebrations.push({
          g,
          life: 0,
          maxLife: 0.7 + Math.random() * 0.5,
          x: Math.cos(a) * (30 + Math.random() * 50),
          y: Math.sin(a) * (30 + Math.random() * 50) - 20,
        });
      }
      const ring = new Graphics();
      ring.circle(0, 0, this.hexSize * 0.4).stroke({ width: 2, color: CHORD_BEAM, alpha: 0.9 });
      ring.position.set(x, y);
      this.fxLayer.addChild(ring);
      this.celebrations.push({ g: ring, life: 0, maxLife: 0.8, x: 0, y: 0 });
    }
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  private frame(dt: number): void {
    if (this.destroyed) return;
    this.time += dt;
    const state = this.engine.getState();
    const lat = state.lattice;

    if (lat.rings !== this.ringsDrawn) {
      this.ringsDrawn = lat.rings;
      this.layout();
      this.drawSockets(lat.rings);
    }

    // Redraw board layers only when the board actually changed.
    let ranks = 0;
    for (const m of Object.values(lat.cells)) ranks += m.rank;
    const sig = `${lat.rings}:${lat.placeSeq}:${Object.keys(lat.cells).length}:${ranks}:${this.props.selected}:${this.props.patternGhost}`;
    if (sig !== this.boardSig) {
      this.boardSig = sig;
      this.drawBoard(state);
      this.drawRelations(state);
      this.drawOverlay(state);
    }

    // Pulsing layers are cheap (a handful of lines) — redraw each frame
    // unless reduced motion, then only on board change.
    const pulse = this.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 2.2);
    const shimmer = this.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 3.1);
    this.drawChords(state, pulse);
    this.drawNearLines(state, shimmer);

    // Discovery events -> celebration.
    for (const entry of state.feed) {
      if (entry.seq <= this.lastFeedSeq) continue;
      this.lastFeedSeq = entry.seq;
      if (entry.event.type === 'chordDiscovered') this.celebrate(entry.event.cells);
      if (entry.event.type === 'progressionDiscovered') {
        this.celebrate(state.lattice.activeChords.flatMap((c) => c.cells));
      }
    }

    for (let i = this.celebrations.length - 1; i >= 0; i--) {
      const c = this.celebrations[i]!;
      c.life += dt;
      if (c.life >= c.maxLife) {
        this.fxLayer.removeChild(c.g);
        c.g.destroy();
        this.celebrations.splice(i, 1);
        continue;
      }
      const t = c.life / c.maxLife;
      c.g.position.x += c.x * dt;
      c.g.position.y += c.y * dt;
      c.g.alpha = 1 - t * t;
      if (c.x === 0 && c.y === 0) c.g.scale.set(1 + t * 2.4); // the ring
    }
  }
}
