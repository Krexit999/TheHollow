/**
 * The Face — PixiJS renderer. Beveled procedural tiles, charge as warm light
 * in the rock, cracks as cells deplete, shards + number pops + screen shake
 * on chips, drills as readable geometric bots. No assets: everything is
 * generated. Respects prefers-reduced-motion.
 */
import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
  Texture,
  Sprite,
} from 'pixi.js';
import { cellCap, type ChipResult } from '../../engine/systems/face';
import {
  COMPACTION_SHOW_AT, MAX_COMPACTION, TERMINAL_GATE, compactionAt, gateCrossed,
} from '../../engine/systems/compaction';
import { materialDef } from '../../engine/materials';
import { guardPixiRender } from '../pixiGuard';
import { figureHintCells } from '../../engine/systems/figures';
import {
  rotLevel, burnLevel, chargeLevel, drillReady,
} from '../../engine/systems/drillAlloys';
import { ABILITY_BY_ID, gradeStep } from '../../engine/content/drillAlloys';
import { makeFx, type LiveFx } from './abilityFx';
import { digProgress } from '../../engine/systems/ores';
import { oreDef } from '../../engine/content/ores';
import { ModifierCache } from '../../engine/modifiers';
import type { Engine } from '../../engine';
import { fmt } from '../../engine';
import { useGame } from '../store';

// Per-shell face themes. Loam: warm lamplight on stone. Ferrite: cold,
// magnetic, industrial — charge as pale voltage in the metal.
interface FaceTheme {
  coldStone: number;
  coldStoneEdge: number;
  warmLow: number;
  warmHigh: number;
  glowCore: number;
  tileEdgeDark: number;
  crackColor: number;
  shardHues: number[];
  popFill: number;
  lampInner: string;
  backdrop: number;
}

const FACE_THEMES: Record<string, FaceTheme> = {
  loam: {
    coldStone: 0x23242c,
    coldStoneEdge: 0x33343e,
    warmLow: 0x4a3a24,
    warmHigh: 0xc98e4a,
    glowCore: 0xf3c678,
    tileEdgeDark: 0x08070a,
    crackColor: 0x0a0908,
    shardHues: [0xd4a86a, 0xa97c42, 0x8a6a3f, 0xe8c98f],
    popFill: 0xfcd34d,
    lampInner: 'rgba(251,191,36,0.05)',
    backdrop: 0x14110e,
  },
  ferrite: {
    coldStone: 0x1e2126,
    coldStoneEdge: 0x363c46,
    warmLow: 0x2c3a46,
    warmHigh: 0x7fa8c0,
    glowCore: 0xd8eef8,
    tileEdgeDark: 0x05070a,
    crackColor: 0x060809,
    shardHues: [0x9fb3c8, 0x7089ab, 0xb8ccd8, 0x5c6b7c],
    popFill: 0xcfe8f5,
    lampInner: 'rgba(160,210,235,0.055)',
    backdrop: 0x0e1216,
  },
  // Glassmere: frozen light. Cold, still, clear — the beam is the event.
  glassmere: {
    coldStone: 0x232833,
    coldStoneEdge: 0x3c4658,
    warmLow: 0x35455c,
    warmHigh: 0xa8c8e8,
    glowCore: 0xeef8ff,
    tileEdgeDark: 0x06080c,
    crackColor: 0x080a0e,
    shardHues: [0xbcd8ee, 0x8aa8c8, 0xe0f0fa, 0x6c88a8],
    popFill: 0xe8f4ff,
    lampInner: 'rgba(190,220,245,0.05)',
    backdrop: 0x0c1016,
  },
  // Cinder: the loudest shell in a quiet game. Ember on near-black; ALL the
  // boldness is spent on heat — everything that isn't burning stays quiet.
  cinder: {
    coldStone: 0x241d1a,
    coldStoneEdge: 0x3d302a,
    warmLow: 0x4a2418,
    warmHigh: 0xd06438,
    glowCore: 0xffb36a,
    tileEdgeDark: 0x0a0605,
    crackColor: 0x0c0605,
    shardHues: [0xd08a5a, 0xa85434, 0xe8a05c, 0x7c4630],
    popFill: 0xffc27a,
    lampInner: 'rgba(255,140,70,0.05)',
    backdrop: 0x120b08,
  },
  // Hollow: the absence of everything the game has been. Near-black on
  // near-black; the carried signatures are the only things alive on screen,
  // and a rebuilt cell is light returning — a faint warm ghost of rock.
  hollow: {
    coldStone: 0x0e0e14,
    coldStoneEdge: 0x1a1a26,
    warmLow: 0x2a2740,
    warmHigh: 0x7a72a8,
    glowCore: 0xc8bfe8,
    tileEdgeDark: 0x060608,
    crackColor: 0x050508,
    shardHues: [0x8a82b0, 0x635a86, 0xa89ed0, 0x4a4468],
    popFill: 0xc8bfe8,
    lampInner: 'rgba(140,130,190,0.04)',
    backdrop: 0x08080c,
  },
  // Aleph: everything at once. The first rock, warm gold — the arrival.
  aleph: {
    coldStone: 0x1a1710,
    coldStoneEdge: 0x30291a,
    warmLow: 0x4a3c1e,
    warmHigh: 0xd9c25c,
    glowCore: 0xf0e6a8,
    tileEdgeDark: 0x0a0805,
    crackColor: 0x0a0805,
    shardHues: [0xd9c25c, 0xa8934a, 0xf0e6a8, 0x8a7838],
    popFill: 0xf0e6a8,
    lampInner: 'rgba(230,210,120,0.06)',
    backdrop: 0x100d08,
  },
  // Verdance: humid, green, slightly too eager. The rock is ALIVE.
  verdance: {
    coldStone: 0x202a1d,
    coldStoneEdge: 0x394a30,
    warmLow: 0x2e4a22,
    warmHigh: 0x8fbf5e,
    glowCore: 0xe6f5aa,
    tileEdgeDark: 0x070a06,
    crackColor: 0x090c07,
    shardHues: [0x9ccf7a, 0x6ba14e, 0xc9e694, 0x577f3f],
    popFill: 0xdcf2a4,
    lampInner: 'rgba(160,220,120,0.05)',
    backdrop: 0x0d130c,
  },
};

/**
 * WHAT A DRILL LOOKS LIKE. A.53: the four behaviour glyphs went with the
 * behaviour selector; what a drill wears now is the BAY-WIDE ALLOY, so
 * equipping one visibly re-liveries every machine on the rails.
 */
/**
 * WHAT A DRILL LOOKS LIKE. A.57: twenty-nine abilities each carry their own
 * colour in the def (one family per shell), so the livery reads a def rather
 * than a hand-kept table that could rot away from the content. A bare machine
 * is amber, as it has always been.
 */
const BARE_LOOK = 0xfbbf24;
function lookColor(id: string): number {
  return ABILITY_BY_ID.get(id)?.color ?? BARE_LOOK;
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}

/** Deterministic per-cell rng for crack shapes. */
function mulberry(seed: number): () => number {
  let a = seed + 0x6d2b79f5;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface TileEntry {
  g: Graphics;
  band: number;
  crackStage: number;
  flash: number;
  vine: number;
  fruitBand: number;
  /** DRILL ALLOY marks (A.53), banded so they join the redraw gate rather than
   *  forcing a repaint every frame: THE SET's warmth and THE CALL's gather. */
  rotBand: number;
  burnBand: number;
  /** ORES: which pocket type sits in this cell (`''` for none), and the dig
   *  ring's step. Both join the redraw gate — see drawTile. */
  oreId: string;
  digBand: number;
  /** WORKED ROCK. Joins the redraw gate: compaction is already an integer, so
   *  it cannot force a repaint every frame. */
  compaction: number;
  /** The compaction digit. A Graphics cannot draw text, and a number this
   *  load-bearing is not going to be a bar. One per tile, updated only when the
   *  gate above opens. */
  label: Text | null;
}

/** A deep-entry drop, named. Throw-safe: a def that has gone missing must not
 *  take the render path down with it (the A.36 lesson). */
function deepDropLabel(materialId: string): string {
  try {
    return materialDef(materialId).name.toUpperCase();
  } catch {
    return 'DEEP FIND';
  }
}

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  vr: number;
  life: number;
  maxLife: number;
}

interface Pop {
  t: Text;
  life: number;
  maxLife: number;
  vy: number;
}

interface DrillSprite {
  root: Container;
  body: Graphics;
  beam: Graphics;
  /** The equipped alloy id, or 'plain'. The drills WEAR the ability. */
  look: string;
  pulse: number;
}

export class FaceView {
  private app!: Application;
  private world = new Container(); // shaken
  private backdrop = new Graphics();
  private tileLayer = new Container();
  private drillLayer = new Container();
  private fxLayer = new Container();
  private popLayer = new Container();

  private tiles: TileEntry[] = [];
  private faceW = 0;
  private faceH = 0;
  private cellSize = 48;
  private gridX = 0;
  private gridY = 0;

  private particles: Particle[] = [];
  private particlePool: Graphics[] = [];
  private pops: Pop[] = [];
  private popPool: Text[] = [];
  private drillSprites: DrillSprite[] = [];

  private shakeAmp = 0;
  private mods = new ModifierCache();
  private lastFeedSeq = -1;
  private shellId = 'loam';
  private lampSprite: Sprite | null = null;
  private chainArcs: { g: Graphics; life: number }[] = [];
  /** LIVE ABILITY FIGURES (A.57). Each redraws itself from one number every
   *  frame and is dropped when its life runs out. */
  private abilityFx: LiveFx[] = [];
  private lastChainCell = -1;
  private magnetLayer = new Graphics();
  private beamLayer = new Graphics();
  private heatLayer = new Graphics();
  // THE FACE CLUSTER (v20): marks, sweep trail, and the pillar-5 figure hint.
  private markLayer = new Graphics();
  private lastPx = 0;
  private lastPy = 0;
  private sweepCells: number[] = [];
  private hintPhase = 0;

  private get theme(): FaceTheme {
    return FACE_THEMES[this.shellId] ?? FACE_THEMES['loam']!;
  }
  private pointerDown = false;
  private cellCooldown = new Map<number, number>();
  /** ORES: which pocket the finger is currently working, and when it last
   *  billed the engine. -1 means the hand is not on one. */
  private oreCell = -1;
  private oreLastMs = 0;
  private destroyed = false;
  private resizeObserver!: ResizeObserver;

  private constructor(
    private host: HTMLElement,
    private engine: Engine,
    private reducedMotion: boolean,
  ) {}

  static async create(host: HTMLElement, engine: Engine, reducedMotion: boolean): Promise<FaceView> {
    const view = new FaceView(host, engine, reducedMotion);
    await view.init();
    return view;
  }

  private async init(): Promise<void> {
    this.app = new Application();
    await this.app.init({
      background: 0x0c0a09,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      resizeTo: this.host,
      preserveDrawingBuffer: true,
    });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    guardPixiRender(this.app, 'face'); // a poisoned frame skips, never kills the loop
    this.host.appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = 'none';

    this.shellId = this.engine.getState().shell.current;
    this.world.addChild(this.backdrop, this.tileLayer, this.heatLayer, this.beamLayer, this.markLayer, this.magnetLayer, this.drillLayer, this.fxLayer, this.popLayer);
    this.app.stage.addChild(this.world);
    this.lampSprite = this.makeLamplight();
    this.app.stage.addChild(this.lampSprite);

    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = { contains: () => true };
    this.app.stage.on('pointerdown', (e) => {
      this.pointerDown = true;
      this.lastPx = e.globalX; this.lastPy = e.globalY;
      this.onPress(e.globalX, e.globalY);
    });
    this.app.stage.on('pointermove', (e) => {
      this.lastPx = e.globalX; this.lastPy = e.globalY;
      if (this.pointerDown) this.onDrag(e.globalX, e.globalY);
    });
    const up = () => {
      if (this.pointerDown && useGame.getState().faceMode === 'sweep' && this.sweepCells.length > 0) {
        this.engine.dispatch({ type: 'sweep', cells: this.sweepCells.slice() });
      }
      this.pointerDown = false;
      this.sweepCells = [];
      // Letting go stops the dig where it stands. The progress KEEPS (the
      // engine never decays it), so a slip costs nothing and coming back to a
      // half-open pocket is a normal thing to do.
      this.oreCell = -1;
    };
    this.app.stage.on('pointerup', up);
    this.app.stage.on('pointerupoutside', up);

    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.host);

    this.rebuildTiles();
    this.app.ticker.add(() => this.frame(this.app.ticker.deltaMS / 1000));
  }

  destroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    if (this.app?.renderer) {
      this.app.destroy(true, { children: true });
    }
  }

  private active = true;

  /**
   * Mount-and-hide, SYMMETRIC at last. The Face used to keep rendering while
   * hidden under the Shaft — so the Shaft's chunk bakes and RenderTexture
   * evictions interleaved with live Face renders, which is exactly the shared-
   * batcher poisoning that froze/blanked the grid (A.38 addendum). Now only one
   * renderer runs at a time, and waking FORCES a full repaint: every tile is
   * invalidated and one frame is rendered immediately, so whatever happened
   * while asleep, returning to the Dig always shows a freshly drawn grid.
   */
  setActive(active: boolean): void {
    if (this.active === active || !this.app?.ticker) return;
    this.active = active;
    if (active) {
      for (const t of this.tiles) { t.band = -1; t.crackStage = -1; t.rotBand = -1; t.burnBand = -1; t.oreId = '?'; t.digBand = -1; }
      // ANY LIVE ABILITY FIGURE BELONGS TO THE FACE THAT IS BEING REPLACED.
      // Re-activating (a hard reset, a shell change, coming back from the
      // Shaft) rebuilds the board under them, and a figure drawn against the
      // old one is at best in the wrong place. Dropped rather than carried.
      this.dropAbilityFx();
      this.layout(); // the hero height differs between Shaft and Dig on phone
      // Start the ticker but do NOT render synchronously: this call runs inside
      // a React effect, in the same commit where the OTHER view is about to be
      // deactivated (tree order runs the Face first). A sync render here is a
      // one-frame overlap with the Shaft — the exact interleave being removed.
      // The first RAF tick lands after the commit, when the Shaft is asleep;
      // preserveDrawingBuffer keeps the last frame up until then, so no flash.
      this.app.ticker.start();
    } else {
      this.app.ticker.stop();
    }
  }

  // -------------------------------------------------------------------------
  // Layout + tiles
  // -------------------------------------------------------------------------

  /**
   * A HOST THIS SMALL IS NOT A LAYOUT, IT IS A MEASUREMENT IN PROGRESS.
   *
   * Below this the ResizeObserver is reporting a transient — a sibling's height
   * changing, a panel mounting, a phone's URL bar sliding — and there is
   * nothing meaningful to fit a grid into. See `layout`.
   */
  private static readonly MIN_HOST_PX = 48;

  /**
   * THE GRID FLASHING EMPTY, and it was this.
   *
   * `cellSize` is floored at 20 so a tile never vanishes — but `gridX/gridY`
   * were then computed by CENTRING that floored grid in whatever the host
   * measured. When the host is briefly tiny the two disagree violently:
   * measured at a 2px-tall host, cellSize held at 20 while gridY came out at
   *
   *     (2 - 20 x 6) / 2 + 4  =  -55
   *
   * so every tile was positioned above the top edge and the face went blank.
   * The next resize laid it out correctly again — which is exactly why it read
   * as a FLASH rather than a broken screen, and why it repeated: anything that
   * makes a sibling's height wobble (a status line wrapping to two lines, a
   * hint appearing, a toast) fires the observer twice.
   *
   * Two guards, because the two failures are different:
   *   1. A DEGENERATE host is ignored outright and the last good layout stands.
   *      Fitting a grid to 2 pixels has no right answer; keeping the previous
   *      one does.
   *   2. The grid origin is CLAMPED to the canvas. A host that is small but
   *      real (a short phone hero) now shows the top-left of the grid instead
   *      of centring it out of view — cramped, which is honest, rather than
   *      absent, which looks broken.
   */
  private layout(): void {
    if (!this.app?.renderer) return;
    this.app.resize(); // re-measure the host before fitting the grid
    const { width, height } = this.app.screen;
    if (width < FaceView.MIN_HOST_PX || height < FaceView.MIN_HOST_PX) return;
    const pad = 18;
    /**
     * THE CONTROLS SIT ON THE FACE, SO THE FACE HAS TO GET OUT OF THE WAY.
     *
     * On phone the Chip/Sweep bar (and now the With/Across bar above it) is
     * absolutely positioned across the bottom of this same box, with its buttons
     * pointer-active. It was already covering the bottom row; adding a second
     * bar covered two, and those cells could not be TAPPED at all — a 380px
     * screenshot is what found it, which is why the brief asks for one.
     *
     * The desktop layout pins the controls to the viewport corner instead, so it
     * reserves nothing. `640` is Tailwind's `lg` boundary for this component.
     */
    const controlsReserve = width < 640 ? 118 : 0;
    const usable = height - controlsReserve;
    const size = Math.min(
      (width - pad * 2) / this.faceW,
      (usable - pad * 2 - 14) / this.faceH,
      72,
    );
    this.cellSize = Math.max(20, size);
    this.gridX = Math.max(0, (width - this.cellSize * this.faceW) / 2);
    this.gridY = Math.max(0, (usable - this.cellSize * this.faceH) / 2 + 4);
    this.tiles.forEach((tile, i) => {
      const x = i % this.faceW;
      const y = Math.floor(i / this.faceW);
      tile.g.position.set(this.gridX + x * this.cellSize, this.gridY + y * this.cellSize);
      // The compaction digit sits in the tile's top-right corner, clear of the
      // compaction wash and clear of the pocket rim around the edge.
      // It scales with the tile so a 380px face and a desktop one read the same.
      if (tile.label) {
        const m = Math.max(1.5, this.cellSize * 0.05);
        tile.label.position.set(this.cellSize - m - 1, m + 1);
        tile.label.style.fontSize = Math.max(9, Math.round(this.cellSize * 0.24));
      }
      tile.band = -1; // force redraw at new size
    });
    this.drawBackdrop();
  }

  /** The rock wall behind the tiles: a dark slab flecked with mineral dust. */
  private drawBackdrop(): void {
    const g = this.backdrop;
    g.clear();
    const pad = this.cellSize * 0.45;
    const x = this.gridX - pad;
    const y = this.gridY - pad;
    const w = this.cellSize * this.faceW + pad * 2;
    const h = this.cellSize * this.faceH + pad * 2;
    g.roundRect(x, y, w, h, 14).fill({ color: this.theme.backdrop, alpha: 0.9 });
    g.roundRect(x, y, w, h, 14).stroke({ width: 1, color: 0x35302a, alpha: 0.6 });
    // Mineral speckle, denser toward the bottom — the dark presses in.
    const rng = mulberry(this.faceW * 1000 + this.faceH);
    const { width, height } = this.app.screen;
    for (let i = 0; i < 130; i++) {
      const sx = rng() * width;
      const sy = rng() * height;
      const warm = rng() > 0.7;
      g.circle(sx, sy, rng() * 1.1 + 0.3).fill({
        color: warm ? 0x8a6a3f : 0x3a3a44,
        alpha: 0.05 + rng() * 0.07,
      });
    }
  }

  private rebuildTiles(): void {
    const state = this.engine.getState();
    this.faceW = state.face.w;
    this.faceH = state.face.h;
    this.tileLayer.removeChildren().forEach((c) => c.destroy());
    this.tiles = state.face.cells.map(() => {
      const g = new Graphics();
      this.tileLayer.addChild(g);
      // The compaction digit rides the tile's own Graphics, so it moves and
      // resizes with it and needs no separate layout pass.
      const label = new Text({
        text: '',
        style: new TextStyle({
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          fontWeight: '800',
          fontSize: 11,
          fill: 0xbfc6d4,
          stroke: { color: 0x000000, width: 3 },
        }),
      });
      label.anchor.set(1, 0);
      label.eventMode = 'none';
      g.addChild(label);
      // oreId starts as a string no def can ever have, so the first paint of a
      // plain cell still counts as a change and the gate does not swallow it.
      return {
        g, band: -1, crackStage: -1, flash: 0, vine: -1, fruitBand: -1, rotBand: -1, burnBand: -1,
        oreId: '?', digBand: -1, compaction: -1,
        label,
      };
    });
    this.layout();
  }

  private drawTile(i: number, charge: number, cap: number): void {
    const tile = this.tiles[i];
    if (!tile) return;
    const ratio = cap > 0 ? Math.min(1, charge / cap) : 0;
    const band = Math.round(ratio * 14);
    const crackStage = ratio > 0.66 ? 0 : ratio > 0.33 ? 1 : ratio > 0.05 ? 2 : 3;
    // GROWTH: vine stage + fruit fullness participate in the redraw gate so
    // the face visibly LIVES — it looks different every time you return.
    const gstate = this.engine.getState();
    const vine = gstate.growth.stage[i] ?? 0;
    const cellCapPx = 8; // fruit banding only needs a coarse visual scale
    const fruitBand = vine > 0 ? Math.min(4, Math.floor((gstate.growth.fruit[i] ?? 0) / (cellCapPx * 4))) : 0;
    // DRILL ALLOY marks. Banded to 5 steps so they take part in the redraw
    // gate below — a smoothly-decaying float would repaint every tile every
    // frame, which is exactly what the gate exists to prevent.
    const rotBand = Math.round(rotLevel(gstate, i) * 4);
    // CINDERHOLD (A.56): the cell is still burning and still giving.
    const burnBand = Math.round(burnLevel(gstate, i) * 4);
    // ORES. The one thing in this phase that CANNOT be a hidden number — a
    // pocket the player cannot see is not a place, it is a trap. The id joins
    // the gate so a pocket forming or opening repaints exactly once, and the
    // dig ring is banded to 12 steps: fine enough to read as filling, coarse
    // enough not to repaint the tile every frame while somebody holds on it.
    const oreId = gstate.face.ore?.[i] ?? '';
    const digBand = oreId ? Math.round(digProgress(gstate, i) * 12) : 0;
    // COMPACTION is an integer, so it costs the gate nothing — a face nobody is
    // chipping still repaints zero tiles per frame.
    const compaction = compactionAt(gstate, i);
    if (band === tile.band && crackStage === tile.crackStage && vine === tile.vine && fruitBand === tile.fruitBand
      && rotBand === tile.rotBand && burnBand === tile.burnBand
      && oreId === tile.oreId && digBand === tile.digBand
      && compaction === tile.compaction && tile.flash <= 0) return;
    tile.compaction = compaction;
    tile.band = band;
    tile.crackStage = crackStage;
    tile.vine = vine;
    tile.fruitBand = fruitBand;
    tile.rotBand = rotBand;
    tile.burnBand = burnBand;
    tile.oreId = oreId;
    tile.digBand = digBand;

    const s = this.cellSize;
    const m = Math.max(1.5, s * 0.05); // grout gap
    const w = s - m * 2;
    const r = Math.max(2, s * 0.14);
    const g = tile.g;
    g.clear();

    const theme = this.theme;
    // THE HOLLOW: there is no rock. A cell not yet reconstructed is ABSENCE —
    // a faint dashed outline of where rock would be, nothing filled. Only a
    // rebuilt cell draws as a real slab below (light returning, cell by cell).
    if (gstate.shell.current === 'hollow' && !gstate.hollow.rebuilt.includes(i)) {
      g.roundRect(m, m, w, w, r).stroke({ width: 1, color: 0x2a2740, alpha: 0.35 });
      return;
    }
    // Seeded per-cell character: tone jitter + facet layout stay stable.
    const rng = mulberry(i * 7919);
    const jitter = 0.88 + rng() * 0.24;

    // Base: cold stone that warms (or charges) as it fills.
    const warm = lerpColor(theme.warmLow, theme.warmHigh, ratio);
    const base = lerpColor(theme.coldStone, warm, Math.min(1, ratio * 1.15));
    const jbase = lerpColor(theme.tileEdgeDark, base, jitter);
    // Drop shadow foot, then the slab.
    g.roundRect(m + 1, m + 2.5, w, w, r).fill({ color: 0x000000, alpha: 0.35 });
    g.roundRect(m, m, w, w, r).fill(jbase);
    // Bevel: bright crest top-left, dark foot bottom-right.
    const crest = lerpColor(ratio > 0.3 ? theme.glowCore : theme.coldStoneEdge, 0xffffff, 0.08);
    g.moveTo(m + r, m + 1)
      .lineTo(m + w - r, m + 1)
      .stroke({ width: 1.2, color: crest, alpha: 0.14 + ratio * 0.22 });
    g.roundRect(m, m, w, w, r).stroke({ width: 1, color: ratio > 0.25 ? warm : theme.coldStoneEdge, alpha: 0.55 });
    g.moveTo(m + r, m + w - 0.5)
      .lineTo(m + w - r, m + w - 0.5)
      .stroke({ width: 1.6, color: theme.tileEdgeDark, alpha: 0.8 });

    // Charge = light held inside the rock: layered radial-ish glow.
    if (ratio > 0.08) {
      const cx = m + w / 2;
      const cy = m + w / 2;
      // The glow has to stay INSIDE the slab. At full charge the outer ring
      // used to reach 0.693w from centre against a half-width of 0.5w, so a
      // charged cell bulged ~19% of a tile past each edge and the grid read as
      // overlapping circles rather than tiles — worst at full charge, which is
      // exactly what a new player looks at first. Clamp the outer ring just
      // inside the slab, clear of the corner radius; the growth curve at low
      // charge is unchanged, only the top end is held.
      const maxOuter = w * 0.46;
      const gr = Math.min(w * (0.18 + 0.24 * ratio), maxOuter / 1.65);
      g.circle(cx, cy, gr * 1.65).fill({ color: warm, alpha: 0.1 + 0.2 * ratio });
      g.circle(cx, cy, gr).fill({ color: lerpColor(warm, theme.glowCore, 0.55), alpha: 0.12 + 0.3 * ratio });
      g.circle(cx, cy, gr * 0.45).fill({ color: theme.glowCore, alpha: 0.18 + 0.4 * ratio });
    }

    // POLARITY: sign etched as SHAPE, not hue — a cross for +, a bar for −.
    const state = this.engine.getState();
    if (state.shell.current === 'ferrite' || state.shell.signatures.includes('polarity')) {
      const sign = state.polarity.signs[i] ?? 1;
      const px = m + w * 0.82;
      const py = m + w * 0.18;
      const sz = Math.max(2.5, w * 0.075);
      const alpha = 0.5 + ratio * 0.3;
      if (sign === 1) {
        g.moveTo(px - sz, py).lineTo(px + sz, py).stroke({ width: 1.6, color: 0xe8f0f5, alpha });
        g.moveTo(px, py - sz).lineTo(px, py + sz).stroke({ width: 1.6, color: 0xe8f0f5, alpha });
      } else {
        g.moveTo(px - sz, py).lineTo(px + sz, py).stroke({ width: 1.8, color: 0x9aa8b5, alpha });
      }
    }

    // Facets: angular strata lines, brighter above the glow, darker below.
    const facets = 2 + Math.floor(rng() * 2);
    for (let f = 0; f < facets; f++) {
      const y1 = m + w * (0.2 + rng() * 0.6);
      const x1 = m + w * (0.08 + rng() * 0.25);
      const midX = x1 + w * (0.2 + rng() * 0.3);
      const drop = (rng() - 0.5) * w * 0.22;
      g.moveTo(x1, y1)
        .lineTo(midX, y1 + drop)
        .lineTo(Math.min(m + w * 0.92, midX + w * (0.15 + rng() * 0.3)), y1 + drop * 0.4)
        .stroke({ width: 1, color: rng() > 0.5 ? 0xffffff : 0x000000, alpha: 0.05 + ratio * 0.05 });
    }

    // Hairline cracks spread from the edges as the cell empties.
    if (crackStage > 0) {
      const crng = mulberry(i * 104729 + 7);
      for (let c = 0; c < crackStage + 2; c++) {
        // Start on a random edge, wander toward the middle.
        const edge = Math.floor(crng() * 4);
        let x = edge === 1 ? m + w : edge === 3 ? m : m + w * crng();
        let y = edge === 0 ? m : edge === 2 ? m + w : m + w * crng();
        const tx = m + w * (0.3 + crng() * 0.4);
        const ty = m + w * (0.3 + crng() * 0.4);
        g.moveTo(x, y);
        const segs = 3 + Math.floor(crng() * 2);
        for (let sgi = 1; sgi <= segs; sgi++) {
          const t = sgi / segs;
          x = x + (tx - x) * t + (crng() - 0.5) * w * 0.16;
          y = y + (ty - y) * t + (crng() - 0.5) * w * 0.16;
          g.lineTo(x, y);
        }
        g.stroke({ width: 0.8 + crackStage * 0.25, color: theme.crackColor, alpha: 0.28 + crackStage * 0.14 });
      }
    }

    // ------------------------------------------------------------------
    // DRILL ALLOY MARKS (A.53) — the abilities are drawn ON THE ROCK, which
    // is the whole point of them: an ability that cannot be seen happening
    // does not belong in the system.
    // ------------------------------------------------------------------
    if (rotBand > 0) {
      // THE SET: rock a drill has just worked stays hot and soft. An ember
      // wash across the slab plus a bright fracture through it — it reads as
      // "this one is still giving" without needing a number.
      // Alpha is pitched to be read against a DRAINED cell — which is exactly
      // when the mark matters, since the rock is soft because a drill just
      // emptied it. Tuned against a 380px screenshot, where a tile is ~55px.
      const heat = rotBand / 4;
      g.roundRect(m, m, w, w, r).fill({ color: 0xe0703c, alpha: 0.16 + heat * 0.34 });
      g.moveTo(m + w * 0.2, m + w * 0.78)
        .lineTo(m + w * 0.48, m + w * 0.44)
        .lineTo(m + w * 0.72, m + w * 0.6)
        .stroke({ width: 1.4 + heat * 1.2, color: 0xffcf9a, alpha: 0.55 + heat * 0.45 });
    }
    if (burnBand > 0) {
      // CINDERHOLD: the rock caught, and it is still going. Deliberately not
      // THE SET's wash — this one is a live fire drawn as tongues climbing the
      // slab, because the Loam and Cinder marks sit on the same cells often
      // enough that they have to be tellable apart at a glance.
      const fire = burnBand / 4;
      g.roundRect(m, m, w, w, r).fill({ color: 0xff6a2c, alpha: 0.10 + fire * 0.22 });
      for (let f = 0; f < 3; f++) {
        const fx = m + w * (0.26 + f * 0.24);
        g.moveTo(fx, m + w * 0.86)
          .lineTo(fx - w * 0.05, m + w * (0.55 - fire * 0.12))
          .lineTo(fx + w * 0.06, m + w * (0.34 - fire * 0.14))
          .stroke({ width: 1.1 + fire * 0.9, color: 0xffb066, alpha: 0.45 + fire * 0.5 });
      }
    }

    // ------------------------------------------------------------------
    // A POCKET. Drawn LAST of the rock marks and drawn heavily, because the
    // whole feature rests on being able to tell at a glance that this cell is
    // not the same as the one beside it. Three parts, each doing a job:
    //   the SEAM     — a rough crystalline body in the ore's own colour, so
    //                  different types read as different things, not tiers;
    //   the RIM      — a bright outline, because a wash alone disappears
    //                  against a full cell (the A.53 lesson, one phase on);
    //   the RING     — how far the hand has got, only while it is being dug.
    // ------------------------------------------------------------------
    if (oreId) {
      const def = oreDef(oreId);
      const col = def?.colour ?? 0xc8a45a;
      const cx = m + w / 2;
      const cy = m + w / 2;
      // The wash and rim say POCKET; the pattern says WHICH ONE. Deterministic
      // per cell (mulberry on the index) so a pocket never shimmers.
      const orng = mulberry(i * 7717 + 13);
      g.roundRect(m, m, w, w, r).fill({ color: col, alpha: 0.16 });
      g.roundRect(m, m, w, w, r).stroke({ width: 2, color: col, alpha: 0.85 });

      if (def?.pattern === 'bands') {
        // A SEAM THAT SWELLED: flat strata across the cell, thick in the middle
        // and thinning out — it should read as layers, horizontal and calm.
        for (let b = 0; b < 4; b++) {
          const t = (b + 0.5) / 4;
          const thick = w * (0.055 + 0.05 * Math.sin(t * Math.PI));
          const inset = w * (0.08 + 0.06 * Math.abs(t - 0.5) * 2);
          g.roundRect(m + inset, m + w * t - thick / 2, w - inset * 2, thick, thick / 2)
            .fill({ color: col, alpha: 0.55 + 0.3 * Math.sin(t * Math.PI) });
        }
      } else if (def?.pattern === 'cluster') {
        // GATHERED IN THE DARK: round nodules of different sizes, touching.
        // Circles against the bands' rectangles reads instantly.
        const spots: [number, number, number][] = [
          [0.38, 0.40, 0.19], [0.62, 0.36, 0.13], [0.55, 0.62, 0.16],
          [0.32, 0.66, 0.10], [0.72, 0.58, 0.08],
        ];
        for (const [sx, sy, sr] of spots) {
          g.circle(m + w * sx, m + w * sy, w * sr).fill({ color: col, alpha: 0.75 });
          g.circle(m + w * (sx - sr * 0.25), m + w * (sy - sr * 0.25), w * sr * 0.4)
            .fill({ color: 0xffffff, alpha: 0.22 });
        }
      } else if (def?.pattern === 'core') {
        // WENT SOFT AT ITS MIDDLE: a bright heart with cracks running out of
        // it, and a dark ring so the middle reads as hollow rather than solid.
        for (let k = 0; k < 6; k++) {
          const a0 = (k / 6) * Math.PI * 2 + orng() * 0.4;
          g.moveTo(cx + Math.cos(a0) * w * 0.16, cy + Math.sin(a0) * w * 0.16)
            .lineTo(cx + Math.cos(a0) * w * 0.44, cy + Math.sin(a0) * w * 0.44)
            .stroke({ width: Math.max(1, w * 0.035), color: col, alpha: 0.7 });
        }
        g.circle(cx, cy, w * 0.24).fill({ color: 0x000000, alpha: 0.3 });
        g.circle(cx, cy, w * 0.19).fill({ color: col, alpha: 0.9 });
        g.circle(cx, cy, w * 0.08).fill({ color: 0xffffff, alpha: 0.4 });
      } else {
        // EVERY FILING LEANS AT IT: spikes pointing inward from the edges.
        // All line, no fill — the opposite silhouette to the cluster.
        for (let k = 0; k < 8; k++) {
          const a0 = (k / 8) * Math.PI * 2;
          const ox = cx + Math.cos(a0) * w * 0.46;
          const oy = cy + Math.sin(a0) * w * 0.46;
          g.moveTo(ox, oy)
            .lineTo(cx + Math.cos(a0) * w * 0.14, cy + Math.sin(a0) * w * 0.14)
            .stroke({ width: Math.max(1, w * 0.045), color: col, alpha: 0.8 });
        }
        g.circle(cx, cy, w * 0.09).fill({ color: col, alpha: 0.95 });
      }
      // THE DIG. A ring closing around the pocket as the hand works it, so
      // "this is taking time" is a thing you watch rather than a number.
      if (digBand > 0) {
        const frac = digBand / 12;
        g.circle(cx, cy, w * 0.42).stroke({ width: 2, color: 0x000000, alpha: 0.35 });
        g.arc(cx, cy, w * 0.42, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2)
          .stroke({ width: 3, color: 0xffffff, alpha: 0.9 });
      }
    }

    // GROWTH: vines drawn by AGE — a sprout curls in from a corner, a
    // creeper walks two edges, a bloom flowers, a feral cell is swallowed.
    // Stage is silhouette, fruit is berries: readable at a glance, no hue
    // dependence (shape + density carry the information).
    if (vine > 0) {
      const vrng = mulberry(i * 31337 + vine * 101);
      const young = 0x9ee07a;
      const old = 0x3f6b32;
      const vcol = lerpColor(young, old, (vine - 1) / 3);
      const stroke = { width: Math.max(1.2, w * 0.035 + vine * 0.4), color: vcol, alpha: 0.85 };
      const curl = (sx: number, sy: number, dx: number, dy: number, len: number) => {
        g.moveTo(sx, sy);
        let x = sx;
        let y = sy;
        for (let seg = 0; seg < 3; seg++) {
          const wob = (vrng() - 0.5) * w * 0.18;
          x += dx * len * 0.33 + -dy * wob;
          y += dy * len * 0.33 + dx * wob;
          g.lineTo(x, y);
        }
        g.stroke(stroke);
        return [x, y] as const;
      };
      // Stage 1+: a tendril from the bottom-left. 2+: along the top. 3+: the
      // right wall. 4: it owns the border.
      curl(m + w * 0.08, m + w * 0.95, 1, -0.5, w * (0.3 + 0.15 * vine));
      if (vine >= 2) curl(m + w * 0.9, m + w * 0.08, -1, 0.4, w * 0.5);
      if (vine >= 3) curl(m + w * 0.95, m + w * 0.9, -0.4, -1, w * 0.5);
      if (vine >= 4) {
        g.roundRect(m + 1, m + 1, w - 2, w - 2, r).stroke({ width: Math.max(2, w * 0.07), color: old, alpha: 0.75 });
        curl(m + w * 0.06, m + w * 0.1, 1, 0.6, w * 0.55);
      }
      // Berries: banked fruit as bright drupelets — what it's WORTH.
      const berries = fruitBand + (vine >= 3 ? 1 : 0);
      for (let b = 0; b < berries; b++) {
        const bx = m + w * (0.15 + vrng() * 0.7);
        const by = m + w * (0.15 + vrng() * 0.7);
        g.circle(bx, by, Math.max(1.5, w * 0.045)).fill({ color: 0xd9f2a0, alpha: 0.95 });
        g.circle(bx, by, Math.max(0.8, w * 0.02)).fill({ color: 0xf6ffd8, alpha: 0.9 });
      }
      // Blooms at stage 3: five-petal marks.
      if (vine === 3) {
        const bx = m + w * 0.5;
        const by = m + w * 0.42;
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          g.circle(bx + Math.cos(a) * w * 0.06, by + Math.sin(a) * w * 0.06, w * 0.035).fill({ color: 0xeaf7c0, alpha: 0.8 });
        }
      }
    }

    // Chip flash.
    if (tile.flash > 0) {
      g.roundRect(m, m, w, w, r).fill({ color: theme.popFill, alpha: tile.flash * 0.45 });
    }

    // WORKED ROCK, drawn LAST and over everything: a darkening that deepens
    // with the count, a gold ring at the deepest gate, and the number once it
    // starts paying.
    this.drawCompaction(tile, g, m, w, r);
  }

  /**
   * WORKED ROCK. Three marks, drawn over everything else because a cell's
   * compaction is the one thing on the tile that says what it is WORTH.
   */
  private drawCompaction(tile: TileEntry, g: Graphics, m: number, w: number, r: number): void {
    // DENSITY. A cool grey-violet wash that deepens with the count —
    // deliberately NOT the warm channel, which belongs to charge, and
    // deliberately subtractive: worked rock should look tighter and colder, not
    // brighter. Below the display threshold this is the ONLY signal, which is
    // what keeps the opening face quiet.
    if (tile.compaction > 0) {
      const t = Math.min(1, tile.compaction / MAX_COMPACTION);
      g.roundRect(m, m, w, w, r).fill({ color: 0x2b2733, alpha: 0.10 + t * 0.42 });
    }

    // THE DEEPEST GATE, RUNG. Warm gold: this is rock worked all the way down,
    // and it pays the terminal material on every chip.
    if (tile.compaction >= TERMINAL_GATE) {
      g.roundRect(m + 1, m + 1, w - 2, w - 2, r).stroke({ width: Math.max(2, w * 0.055), color: 0xe0b25a, alpha: 0.9 });
      g.roundRect(m + 3.5, m + 3.5, w - 7, w - 7, r * 0.8).stroke({ width: 1, color: 0xffe3a8, alpha: 0.55 });
    }

    // THE NUMBER, from the first deep-entry gate up. Below 8 there is nothing it
    // could tell you that the wash does not; at 8 it starts naming which table
    // this cell is rolling on.
    if (tile.label) {
      tile.label.text = tile.compaction >= COMPACTION_SHOW_AT ? String(tile.compaction) : '';
      tile.label.style.fill = tile.compaction >= TERMINAL_GATE ? 0xffe3a8
        : tile.compaction >= 14 ? 0xe8d9ff : 0xbfc6d4;
    }
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private cellAt(px: number, py: number): number {
    const x = Math.floor((px - this.gridX) / this.cellSize);
    const y = Math.floor((py - this.gridY) / this.cellSize);
    if (x < 0 || x >= this.faceW || y < 0 || y >= this.faceH) return -1;
    return y * this.faceW + x;
  }

  /** PRESSURE: heat is FELT before it is read. An ember wash climbs the face
   * from below as the gauge rises, and the grid takes a burning border by
   * band. Every state is a static color — reduced-motion loses nothing but
   * a slow breathing on the border; the danger reads identically without it. */
  private heatPhase = 0;
  private drawHeat(state: Readonly<ReturnType<Engine['getState']>>, dt: number): void {
    const g = this.heatLayer;
    g.clear();
    const native = state.shell.current === 'cinder';
    const carried = state.shell.signatures.includes('pressure');
    if (!native && !carried) return;
    const heat = state.pressure.heat;
    if (heat <= 1) return;
    const s = this.cellSize;
    const gw = this.faceW * s;
    const gh = this.faceH * s;
    const dim = native ? 1 : 0.5;
    // The wash: magma light climbing from the floor of the face.
    const rise = gh * Math.min(1, heat / 100) * 0.9;
    const bands = 6;
    for (let i = 0; i < bands; i++) {
      const h = (rise / bands) * (i + 1);
      g.rect(this.gridX, this.gridY + gh - h, gw, rise / bands)
        .fill({ color: i < 2 ? 0xff9a4a : 0xe05a28, alpha: (0.05 + 0.022 * (bands - i)) * (heat / 100) * dim });
    }
    // The floor of the face glows like a hearth-mouth from 40 heat up.
    if (heat >= 40) {
      g.rect(this.gridX, this.gridY + gh - 4, gw, 4)
        .fill({ color: 0xff7a3a, alpha: 0.25 * (heat / 100) * dim + 0.1 });
    }
    // The border: amber past 70, burning past 85, full klaxon in overpressure.
    if (heat >= 70) {
      const hot = heat >= 85;
      const klaxon = state.pressure.overpressureAtSec !== null;
      this.heatPhase += dt;
      const breathe = this.reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(this.heatPhase * (klaxon ? 6 : 2));
      const col = klaxon ? 0xff4a2a : hot ? 0xf07038 : 0xc98a4a;
      const width = klaxon ? 6 : hot ? 4 : 2;
      g.rect(this.gridX - width, this.gridY - width, gw + width * 2, gh + width * 2)
        .stroke({ width, color: col, alpha: (klaxon ? 0.95 : hot ? 0.7 : 0.45) * breathe * dim });
    }
  }

  /** REFRACTION: the beam is the centerpiece — a bright polyline walking
   * the traced path, colored per wavelength segment, with mirror glyphs and
   * amplifier sparkles. Hierarchy over effects: one line, one glow. */
  private static WAVE_COLORS = [0xeef8ff, 0xff9a8a, 0xffc878, 0x9ee07a, 0x7fd4e0, 0xc0a8f0];
  private drawBeam(state: Readonly<ReturnType<Engine['getState']>>): void {
    const g = this.beamLayer;
    g.clear();
    const isGlass = state.shell.current === 'glassmere';
    const carried = state.shell.signatures.includes('refraction');
    if (!isGlass && !carried) return;
    const path = state.refraction.path;
    if (path.length === 0) return;
    const s = this.cellSize;
    const cx = (cell: number) => this.gridX + (cell % this.faceW) * s + s / 2;
    const cy = (cell: number) => this.gridY + Math.floor(cell / this.faceW) * s + s / 2;
    const dim = carried && !isGlass ? 0.45 : 1;
    // Entry stub from the left edge.
    g.moveTo(this.gridX - s * 0.4, cy(path[0]!.cell))
      .lineTo(cx(path[0]!.cell), cy(path[0]!.cell))
      .stroke({ width: 3, color: FaceView.WAVE_COLORS[path[0]!.color]!, alpha: 0.9 * dim });
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const col = FaceView.WAVE_COLORS[a.color] ?? 0xeef8ff;
      g.moveTo(cx(a.cell), cy(a.cell)).lineTo(cx(b.cell), cy(b.cell))
        .stroke({ width: a.amplified ? 4.5 : 3, color: col, alpha: (a.amplified ? 0.95 : 0.8) * dim });
      g.moveTo(cx(a.cell), cy(a.cell)).lineTo(cx(b.cell), cy(b.cell))
        .stroke({ width: a.amplified ? 10 : 7, color: col, alpha: 0.18 * dim });
    }
    // Mirrors: crisp diagonal strokes in a socket.
    for (const [cellStr, kind] of Object.entries(state.refraction.mirrors)) {
      const cell = Number(cellStr);
      const x = cx(cell);
      const y = cy(cell);
      const r = s * 0.26;
      g.circle(x, y, r + 3).stroke({ width: 1.5, color: 0x8aa8c8, alpha: 0.8 });
      if (kind === '/') g.moveTo(x - r, y + r).lineTo(x + r, y - r).stroke({ width: 3, color: 0xe8f4ff, alpha: 0.95 });
      else g.moveTo(x - r, y - r).lineTo(x + r, y + r).stroke({ width: 3, color: 0xe8f4ff, alpha: 0.95 });
    }
    // Amplifier sparkle at full lenses on the path.
    for (const b of path) {
      if (!b.amplified) continue;
      const x = cx(b.cell);
      const y = cy(b.cell);
      g.moveTo(x - 3, y).lineTo(x + 3, y).stroke({ width: 1.2, color: 0xffffff, alpha: 0.85 });
      g.moveTo(x, y - 3).lineTo(x, y + 3).stroke({ width: 1.2, color: 0xffffff, alpha: 0.85 });
    }
  }

  /** Magnet strip above the grid: + / − / ○ glyphs per rigged column. */
  private drawMagnets(state: Readonly<ReturnType<Engine['getState']>>): void {
    const g = this.magnetLayer;
    g.clear();
    if (state.shell.current !== 'ferrite' || state.polarity.magnetCount === 0) return;
    const y = this.gridY - Math.max(12, this.cellSize * 0.28);
    for (let col = 0; col < state.polarity.magnetCount; col++) {
      const x = this.gridX + col * this.cellSize + this.cellSize / 2;
      const pole = state.polarity.magnets[col] ?? 0;
      const r = Math.max(5, this.cellSize * 0.14);
      g.circle(x, y, r).fill({ color: 0x10141a, alpha: 0.9 });
      g.circle(x, y, r).stroke({ width: 1.4, color: pole === 0 ? 0x4a5560 : 0x9fc4dd, alpha: 0.9 });
      const sz = r * 0.55;
      if (pole === 1) {
        g.moveTo(x - sz, y).lineTo(x + sz, y).stroke({ width: 1.8, color: 0xe8f0f5 });
        g.moveTo(x, y - sz).lineTo(x, y + sz).stroke({ width: 1.8, color: 0xe8f0f5 });
      } else if (pole === -1) {
        g.moveTo(x - sz, y).lineTo(x + sz, y).stroke({ width: 2, color: 0x9aa8b5 });
      }
    }
  }

  /** A press begins: what it does depends on the face mode. */
  private onPress(px: number, py: number): void {
    const ui = useGame.getState();
    if (ui.faceMode === 'sweep') { this.sweepCells = []; this.addSweep(px, py); return; }
    // TECHNIQUE (Part B): the armed signature verb lands on the tapped cell.
    if (ui.faceMode === 'technique' && ui.armedTechnique) {
      const cell = this.cellAt(px, py);
      if (cell < 0) return;
      const r = this.engine.dispatch({ type: 'useTechnique', id: ui.armedTechnique, cell });
      if (r.ok) {
        const { x, y } = this.cellCenter(cell);
        this.spawnShards(x, y, 6, false);
        const tile = this.tiles[cell];
        if (tile) tile.flash = 0.8;
      }
      this.pointerDown = false;
      return;
    }
    this.chipAt(px, py);
  }

  /** A drag continues in the current mode. */
  private onDrag(px: number, py: number): void {
    const mode = useGame.getState().faceMode;
    if (mode === 'sweep') { this.addSweep(px, py); return; }
    if (mode === 'technique') return; // a verb is a tap, never a drag
    this.chipAt(px, py);
  }

  private addSweep(px: number, py: number): void {
    const cell = this.cellAt(px, py);
    if (cell < 0 || this.sweepCells.includes(cell)) return;
    this.sweepCells.push(cell);
  }

  /** The sweep trail and the pillar-5 figure hint — on one layer. */
  private drawFaceOverlay(state: Readonly<ReturnType<Engine['getState']>>, dt: number): void {
    const g = this.markLayer;
    g.clear();
    const s = this.cellSize;
    const mode = useGame.getState().faceMode;
    const n = this.faceW * this.faceH;

    // The sweep swathe under the finger.
    if (mode === 'sweep' && this.pointerDown) {
      for (const cell of this.sweepCells) {
        if (cell < 0 || cell >= n) continue;
        const { x, y } = this.cellCenter(cell);
        const half = s * 0.42;
        g.roundRect(x - half, y - half, half * 2, half * 2, s * 0.12)
          .fill({ color: 0xffd98a, alpha: 0.18 }).stroke({ width: 1.5, color: 0xffd98a, alpha: 0.6 });
      }
    }

    // FIGURE HINT (pillar 5): a faint glow at cells one chip from completing a
    // figure. A POSITION, never a shape name. Static under reduced motion.
    if (mode === 'chip') {
      const hints = figureHintCells(state);
      if (hints.length > 0) {
        this.hintPhase += dt;
        const pulse = this.reducedMotion ? 0.5 : 0.4 + 0.25 * Math.sin(this.hintPhase * 4);
        for (const cell of hints) {
          const { x, y } = this.cellCenter(cell);
          g.circle(x, y, s * 0.2).stroke({ width: 2, color: this.theme.glowCore, alpha: 0.35 * pulse + 0.12 });
        }
      }
    }
  }

  private chipAt(px: number, py: number): void {
    const state = this.engine.getState();
    // Optics mode (Glassmere): taps cycle a mirror ( / then \ then clear ).
    if (useGame.getState().opticsMode) {
      const cell = this.cellAt(px, py);
      if (cell >= 0) {
        const kind = state.refraction.mirrors[cell];
        this.engine.dispatch({
          type: 'setMirror',
          cell,
          kind: kind === '/' ? '\\' : kind === '\\' ? null : '/',
        });
      }
      this.pointerDown = false;
      return;
    }
    // Taps on the magnet strip cycle poles instead of chipping.
    if (state.shell.current === 'ferrite' && state.polarity.magnetCount > 0) {
      const stripY = this.gridY - Math.max(12, this.cellSize * 0.28);
      if (Math.abs(py - stripY) < Math.max(8, this.cellSize * 0.2)) {
        const col = Math.floor((px - this.gridX) / this.cellSize);
        if (col >= 0 && col < state.polarity.magnetCount) {
          this.engine.dispatch({ type: 'toggleMagnet', col });
          this.pointerDown = false;
          return;
        }
      }
    }
    const cell = this.cellAt(px, py);
    if (cell < 0) return;

    // A POCKET IS WORKED, NOT TAPPED. The hold loop already calls this every
    // frame, so the gesture the player makes is simply "stay on it" — and the
    // cost is honest, because while your finger is here it is not chipping
    // anything else. That opportunity cost is the whole thing a drill competes
    // against; make it free and the choice the feature is built on disappears.
    //
    // Real elapsed time, not a per-frame constant: a slow frame must not make
    // the rock softer, and the engine takes seconds so it never learns what a
    // frame is (pillar 8).
    if (state.face.ore?.[cell]) {
      const now = performance.now();
      const dtSec = Math.min(0.25, Math.max(0, (now - (this.oreLastMs || now)) / 1000));
      this.oreLastMs = now;
      if (this.oreCell !== cell) { this.oreCell = cell; return; } // first touch just latches on
      const r = this.engine.dispatch({ type: 'workOre', cell, seconds: dtSec });
      const d = r.data as { done?: boolean; charge?: number } | undefined;
      if (d?.done) {
        this.oreCell = -1;
        const at = this.cellCenter(cell);
        this.spawnShards(at.x, at.y, 16, true);
        this.addShake(8);
      }
      return;
    }
    this.oreCell = -1;

    const now = performance.now();
    const until = this.cellCooldown.get(cell) ?? 0;
    if (now < until) return;
    this.cellCooldown.set(cell, now + 170);
    const result = this.engine.dispatch({ type: 'chip', cell });
    const data = result.data as ChipResult | undefined;
    if (!result.ok || !data || data.charge <= 0) return;
    this.onChip(cell, data);
  }

  private onChip(cell: number, data: ChipResult): void {
    const tile = this.tiles[cell];
    if (tile) tile.flash = 1;
    const { x, y } = this.cellCenter(cell);
    const intensity = Math.min(1, data.charge / 8);
    this.spawnShards(x, y, data.crit ? 12 : 5 + Math.round(intensity * 4), data.crit);
    this.spawnPop(x, y, `+${fmt(data.dust)}`, data.crit);
    for (const f of data.fractured) {
      const c = this.cellCenter(f);
      this.spawnShards(c.x, c.y, 3, false);
      const ft = this.tiles[f];
      if (ft) ft.flash = 0.7;
    }
    // SAY WHAT THE WORK WAS FOR, ON THE CELL IT CAME OUT OF. Without this the
    // number just goes up in a corner and nothing joins it to the seams it
    // opens — a player reported exactly that, and it was right.
    const comp = data.compaction;
    if (comp) {
      for (const id of comp.deepDrops) this.spawnPop(x, y, deepDropLabel(id), true);
      // CROSSING A GATE is the other half: the moment this cell started paying
      // a table it was not paying before. Fires on the chip that crosses it,
      // not on every chip above it.
      const gate = gateCrossed(comp.before, comp.after);
      if (gate !== null) {
        this.spawnPop(x, y, `SEAM ${gate}`, gate === TERMINAL_GATE);
        this.addShake(gate === TERMINAL_GATE ? 6 : 3);
      }
    }
    this.addShake(data.crit ? 7 : 1.5 + intensity * 3 + data.fractured.length);
  }

  private cellCenter(cell: number): { x: number; y: number } {
    return {
      x: this.gridX + (cell % this.faceW) * this.cellSize + this.cellSize / 2,
      y: this.gridY + Math.floor(cell / this.faceW) * this.cellSize + this.cellSize / 2,
    };
  }

  // -------------------------------------------------------------------------
  // Juice
  // -------------------------------------------------------------------------

  private makeLamplight(): Sprite {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(256, 190, 60, 256, 256, 340);
    grad.addColorStop(0, this.theme.lampInner);
    grad.addColorStop(0.55, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(5,3,2,0.42)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
    const sprite = new Sprite(Texture.from(c));
    sprite.eventMode = 'none';
    const fit = () => {
      // The lamp is remade on shell change; stale handlers must self-remove.
      if (sprite.destroyed) {
        this.app.renderer.off('resize', fit);
        return;
      }
      sprite.width = this.app.screen.width;
      sprite.height = this.app.screen.height;
    };
    fit();
    this.app.renderer.on('resize', fit);
    return sprite;
  }

  private spawnShards(x: number, y: number, count: number, crit: boolean): void {
    if (this.reducedMotion) return;
    if (this.particles.length > 220) return;
    for (let i = 0; i < count; i++) {
      const g = this.particlePool.pop() ?? this.makeShard();
      g.visible = true;
      g.position.set(x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10);
      g.rotation = Math.random() * Math.PI * 2;
      g.scale.set(crit ? 1 + Math.random() : 0.5 + Math.random() * 0.7);
      g.alpha = 1;
      this.fxLayer.addChild(g);
      const angle = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * (crit ? 260 : 160);
      this.particles.push({
        g,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 110,
        vr: (Math.random() - 0.5) * 10,
        life: 0,
        maxLife: 0.5 + Math.random() * 0.4,
      });
    }
  }

  private makeShard(): Graphics {
    const g = new Graphics();
    const hues = this.theme.shardHues;
    const color = hues[Math.floor(Math.random() * hues.length)]!;
    const r = 2.6;
    g.moveTo(r, 0);
    const sides = 3 + Math.floor(Math.random() * 2);
    for (let i = 1; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      g.lineTo(Math.cos(a) * r * (0.6 + Math.random() * 0.7), Math.sin(a) * r * (0.6 + Math.random() * 0.7));
    }
    g.fill(color);
    return g;
  }

  private spawnPop(x: number, y: number, text: string, crit: boolean): void {
    if (this.pops.length > 24) return;
    const t = this.popPool.pop() ?? this.makePop();
    t.text = crit ? `${text}!` : text;
    t.style.fontSize = crit ? 17 : 12;
    t.style.fill = crit ? 0xfb923c : this.theme.popFill;
    t.visible = true;
    t.alpha = 1;
    t.position.set(x + (Math.random() - 0.5) * 12, y - 6);
    t.anchor.set(0.5);
    this.popLayer.addChild(t);
    this.pops.push({ t, life: 0, maxLife: this.reducedMotion ? 0.45 : 0.8, vy: this.reducedMotion ? 0 : -52 });
  }

  private makePop(): Text {
    return new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontWeight: '700',
        fontSize: 12,
        fill: 0xfcd34d,
        stroke: { color: 0x0c0a09, width: 3 },
      }),
    });
  }

  private addShake(amount: number): void {
    if (this.reducedMotion) return;
    this.shakeAmp = Math.min(10, this.shakeAmp + amount * 0.55);
  }

  // -------------------------------------------------------------------------
  // Drills
  // -------------------------------------------------------------------------

  private makeDrillSprite(look: string): DrillSprite {
    const root = new Container();
    const beam = new Graphics();
    const body = new Graphics();
    this.drawDrillBody(body, look);
    root.addChild(beam, body);
    this.drillLayer.addChild(root);
    return { root, body, beam, look, pulse: 0 };
  }

  /**
   * The chassis, and the mark of whatever alloys this machine is carrying.
   *
   * The `look` key is `<id>|<id>|…` plus a `+` and the grade sum, plus `*` for a
   * prize chassis — one string that changes exactly when the picture should,
   * which is what lets `syncDrills` decide whether to redraw by comparison.
   *
   * A PRIZE IS DRAWN BIGGER, and it is the same size difference a player can
   * pick out at 380px without being told: 1.55× the radius, a double ring, and
   * a gold pip per spare slot. GRADE shows as small ticks around the rim, so a
   * grade-IV Arcvein and a grade-I Arcvein are different objects on the face.
   */
  private drawDrillBody(g: Graphics, look: string): void {
    g.clear();
    const [idPart, rest] = look.split('+');
    const ids = (idPart ?? 'plain').split('|').filter(Boolean);
    const prize = (rest ?? '').includes('*');
    const grade = Math.max(0, parseInt(rest ?? '0', 10) || 0);
    const primary = ids[0] ?? 'plain';
    const color = lookColor(primary);
    const r = Math.max(6, this.cellSize * 0.17) * (prize ? 1.55 : 1);
    // Hex chassis
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.fill(0x1c1815).stroke({ width: prize ? 2.2 : 1.5, color, alpha: 0.9 });
    if (prize) {
      // The outer ring nobody else has.
      g.circle(0, 0, r * 1.22).stroke({ width: 1.2, color: 0xe8d48f, alpha: 0.75 });
    }
    const gr = r * 0.45;
    this.drawAlloyGlyph(g, primary, gr, color);
    // A SECOND ALLOY reads as a second, smaller glyph offset below-right — the
    // only place in the game two abilities sit on one machine.
    const second = ids[1];
    if (second) {
      g.setStrokeStyle({ width: 1 });
      const c2 = lookColor(second);
      g.circle(r * 0.62, r * 0.62, gr * 0.55).fill(c2);
    }
    const third = ids[2];
    if (third) {
      const c3 = lookColor(third);
      g.circle(-r * 0.62, r * 0.62, gr * 0.55).fill(c3);
    }
    // GRADE TICKS — one per step above the ability's own shell, around the top.
    for (let i = 0; i < Math.min(6, grade); i++) {
      const a = -Math.PI / 2 + (i - (Math.min(6, grade) - 1) / 2) * 0.42;
      g.circle(Math.cos(a) * r * 1.32, Math.sin(a) * r * 1.32, 1.4).fill(0xe8d48f);
    }
  }

  /**
   * THE GLYPH — the shape half of the livery, keyed on the ability's FIGURE
   * rather than on its id. Twenty-nine abilities share sixteen figures, so the
   * badge on a chassis tells you what KIND of thing it is about to do (it
   * explodes / it arcs / it beams / it opens a hole) without needing
   * twenty-nine bespoke doodles that would be indistinguishable at 8px anyway.
   */
  private drawAlloyGlyph(g: Graphics, look: string, gr: number, color: number): void {
    const figure = ABILITY_BY_ID.get(look)?.figure ?? '';
    switch (figure) {
      case 'burst':
      case 'plume':
        g.circle(0, 0, gr * 0.34).fill(color);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          g.moveTo(Math.cos(a) * gr * 0.5, Math.sin(a) * gr * 0.5)
            .lineTo(Math.cos(a) * gr, Math.sin(a) * gr).stroke({ width: 1.2, color });
        }
        return;
      case 'bolt':
        g.moveTo(-gr * 0.5, -gr).lineTo(gr * 0.2, -gr * 0.1).lineTo(-gr * 0.2, gr * 0.1)
          .lineTo(gr * 0.5, gr).stroke({ width: 1.6, color });
        return;
      case 'beam':
        g.moveTo(-gr, 0).lineTo(0, 0).stroke({ width: 1.6, color });
        g.moveTo(0, 0).lineTo(gr, -gr * 0.7).stroke({ width: 1, color });
        g.moveTo(0, 0).lineTo(gr, gr * 0.7).stroke({ width: 1, color });
        return;
      case 'ring':
      case 'push':
        g.circle(0, 0, gr * 0.3).fill(color);
        g.circle(0, 0, gr).stroke({ width: 1.3, color, alpha: 0.85 });
        return;
      case 'implode':
        g.circle(0, 0, gr * 0.28).fill(color);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          g.moveTo(Math.cos(a) * gr * 1.1, Math.sin(a) * gr * 1.1)
            .lineTo(Math.cos(a) * gr * 0.45, Math.sin(a) * gr * 0.45).stroke({ width: 1.2, color });
        }
        return;
      case 'sequence':
      case 'blot':
        g.circle(-gr * 0.6, 0, gr * 0.34).fill(color);
        g.circle(0, 0, gr * 0.34).fill({ color, alpha: 0.75 });
        g.circle(gr * 0.6, 0, gr * 0.34).fill({ color, alpha: 0.45 });
        return;
      case 'outline':
        g.rect(-gr, -gr, gr * 2, gr * 2).stroke({ width: 1.4, color });
        g.circle(0, 0, gr * 0.3).fill(color);
        return;
      case 'arcs':
        g.moveTo(-gr, gr * 0.6);
        for (let k = 1; k <= 8; k++) {
          const u = k / 8;
          g.lineTo(-gr + u * gr * 2, gr * 0.6 - Math.sin(u * Math.PI) * gr);
        }
        g.stroke({ width: 1.3, color });
        return;
      case 'hole':
        g.circle(0, 0, gr).stroke({ width: 1.4, color });
        g.circle(0, 0, gr * 0.6).fill(0x0c0a09);
        return;
      case 'ghost':
        g.rect(-gr * 0.9, -gr * 0.9, gr * 1.8, gr * 1.8).fill({ color, alpha: 0.3 });
        g.rect(-gr * 0.9, -gr * 0.9, gr * 1.8, gr * 1.8).stroke({ width: 1.2, color });
        return;
      case 'blink':
        g.circle(-gr * 0.6, 0, gr * 0.32).fill(color);
        g.circle(gr * 0.6, 0, gr * 0.32).fill({ color, alpha: 0.4 });
        g.moveTo(-gr * 0.3, 0).lineTo(gr * 0.3, 0).stroke({ width: 1, color, alpha: 0.6 });
        return;
      case 'slam':
        g.circle(0, 0, gr * 0.45).fill(color);
        g.circle(0, 0, gr).stroke({ width: 2, color, alpha: 0.7 });
        return;
      case 'cataclysm':
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          g.moveTo(0, 0).lineTo(Math.cos(a) * gr, Math.sin(a) * gr).stroke({ width: 1.1, color });
        }
        g.circle(0, 0, gr * 0.3).fill(0xffffff);
        return;
      default:
        // Bare: the diamond that has always meant "the richest cell".
        g.moveTo(0, -gr).lineTo(gr, 0).lineTo(0, gr).lineTo(-gr, 0).closePath().fill(color);
    }
  }

  /** The key that decides whether a chassis needs redrawing. */
  private drillLook(unit: { fits?: { id: string; grade: number }[]; prize?: string }): string {
    const fits = unit.fits ?? [];
    const ids = fits.length > 0 ? fits.map((f) => f.id).join('|') : 'plain';
    // The grade STEP, not the raw grade: a Cinder ability poured from Cinder
    // stone is step 0 and wears no ticks, which is the honest picture.
    const step = fits.reduce((n, f) => {
      const def = ABILITY_BY_ID.get(f.id);
      return def ? Math.max(n, gradeStep(def, f.grade)) : n;
    }, 0);
    return `${ids}+${step}${unit.prize ? '*' : ''}`;
  }

  /** Drop every live ability figure, safely, whatever state they are in. */
  private dropAbilityFx(): void {
    for (const fx of this.abilityFx) {
      if (fx.g.destroyed) continue;
      this.fxLayer.removeChild(fx.g);
      fx.g.destroy();
    }
    this.abilityFx.length = 0;
  }

  private syncDrills(): void {
    const st = this.engine.getState();
    const units = st.drills.units;
    // ONE ALLOY PER DRILL (A.54): each machine wears its OWN livery, so a mixed
    // bay reads as a mixed bay from across the room — three colours on the rails
    // is the picture of the decision the player made at the Forge. A.56 adds the
    // grade ticks and the prize chassis to the same string.
    while (this.drillSprites.length < units.length) {
      const unit = units[this.drillSprites.length]!;
      const sprite = this.makeDrillSprite(this.drillLook(unit));
      const at = this.cellCenter(unit.lastCell);
      sprite.root.position.set(at.x, at.y - this.cellSize * 0.18);
      this.drillSprites.push(sprite);
    }
    while (this.drillSprites.length > units.length) {
      const sprite = this.drillSprites.pop()!;
      sprite.root.destroy({ children: true });
    }
    for (let i = 0; i < units.length; i++) {
      const sprite = this.drillSprites[i]!;
      const look = this.drillLook(units[i]!);
      if (sprite.look !== look) {
        sprite.look = look;
        this.drawDrillBody(sprite.body, look);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  private frameErrCount = 0;
  /**
   * The ticker's callback. Pixi v8 reschedules its requestAnimationFrame AFTER
   * running listeners, so a listener that THROWS never reaches the reschedule and
   * the ticker dies permanently — the core screen freezes until a page refresh
   * (the "grid stops responding" / "beam stuck" report). A render loop must
   * survive a single bad frame: catch, log once, and keep ticking. The catch is
   * defence, not the fix — the underlying throw is still hunted and removed.
   */
  private frame(dt: number): void {
    try {
      this.frameInner(dt);
    } catch (e) {
      if (this.frameErrCount < 3) {
        this.frameErrCount += 1;
        // eslint-disable-next-line no-console
        console.error('[FaceView.frame] recovered from a throw (ticker kept alive):', e);
      }
    }
  }

  private frameInner(dt: number): void {
    if (this.destroyed) return;
    const state = this.engine.getState();

    // A Breach happened: new shell, new physics, new palette.
    if (state.shell.current !== this.shellId) {
      this.shellId = state.shell.current;
      if (this.lampSprite) {
        this.app.stage.removeChild(this.lampSprite);
        this.lampSprite.destroy(true);
      }
      this.lampSprite = this.makeLamplight();
      this.app.stage.addChild(this.lampSprite);
      this.rebuildTiles();
    }

    // Face dimensions changed (expansion / collapse) — rebuild.
    if (state.face.w !== this.faceW || state.face.h !== this.faceH || state.face.cells.length !== this.tiles.length) {
      this.rebuildTiles();
    }

    // Tiles.
    this.mods.invalidate();
    const cap = cellCap(state, this.mods);
    for (let i = 0; i < state.face.cells.length; i++) {
      const tile = this.tiles[i]!;
      if (tile.flash > 0) tile.flash = Math.max(0, tile.flash - dt * 5);
      this.drawTile(i, state.face.cells[i]!, cap);
    }

    // Feed events -> drill strikes, fractures, collapse thunder.
    for (const entry of state.feed) {
      if (entry.seq <= this.lastFeedSeq) continue;
      this.lastFeedSeq = entry.seq;
      const ev = entry.event;
      if (ev.type === 'drillStrike') {
        const sprite = this.drillSprites[ev.drill];
        const at = this.cellCenter(ev.cell);
        if (sprite) {
          sprite.pulse = 1;
          if (!this.reducedMotion && Math.random() < 0.5) this.spawnShards(at.x, at.y, 2, false);
          if (Math.random() < 0.12) this.spawnPop(at.x, at.y, `+${fmt(ev.dust)}`, false);
        }
        const tile = this.tiles[ev.cell];
        if (tile) tile.flash = Math.max(tile.flash, 0.4);
      } else if (ev.type === 'collapse') {
        this.addShake(10);
      } else if (ev.type === 'breach') {
        this.addShake(14);
        this.lastChainCell = -1;
      } else if (ev.type === 'descend') {
        this.addShake(4);
        this.lastChainCell = -1;
        if (!this.reducedMotion) this.tileLayer.position.y = -14;
      } else if (ev.type === 'chainChip') {
        // The chain draws itself as the player routes a path.
        const at = this.cellCenter(ev.cell);
        if (ev.chain > 1 && this.lastChainCell >= 0 && !this.reducedMotion) {
          const from = this.cellCenter(this.lastChainCell);
          const arc = new Graphics();
          arc.moveTo(from.x, from.y)
            .lineTo(at.x, at.y)
            .stroke({ width: 2.5, color: this.theme.glowCore, alpha: 0.85 });
          arc.circle(at.x, at.y, 3).fill({ color: this.theme.glowCore, alpha: 0.9 });
          this.fxLayer.addChild(arc);
          this.chainArcs.push({ g: arc, life: 0 });
        }
        if (ev.chain >= 2) this.spawnPop(at.x, at.y - this.cellSize * 0.3, `×${ev.chain}`, ev.chain >= 6);
        this.lastChainCell = ev.cell;
      } else if (ev.type === 'abilityFire') {
        // ══ THE WHOLE POINT OF A.57 ══════════════════════════════════════
        // An ability fired. Twenty-nine of them, sixteen figures, one path
        // through the renderer. The engine says WHAT happened and WHERE; this
        // decides what it looks like (ui/face/abilityFx.ts).
        //
        // The name is popped over the origin as well as the figure being drawn,
        // because the previous two ability passes failed on exactly this: a
        // player could not tell what had just happened, or that anything had.
        const pts = ev.cells.map((c) => this.cellCenter(c));
        const fx = makeFx({
          figure: ev.figure,
          color: ev.color,
          cells: pts,
          path: ev.path?.map((c) => this.cellCenter(c)),
          from: this.cellCenter(ev.from),
          size: this.cellSize,
        }, this.fxLayer, this.reducedMotion);
        if (fx) {
          this.abilityFx.push(fx);
          // A hard cap, because Cataclysm fires every ability in the bay at
          // once and a twenty-four-drill Aleph bay can put a lot on screen in
          // one frame. Oldest goes first.
          while (this.abilityFx.length > 40) {
            const old = this.abilityFx.shift()!;
            this.fxLayer.removeChild(old.g);
            old.g.destroy();
          }
        }
        const at = this.cellCenter(ev.from);
        const named = ABILITY_BY_ID.get(ev.id);
        if (named) this.spawnPop(at.x, at.y - this.cellSize * 0.5, named.name.toUpperCase(), true);
        if (ev.shake) this.addShake(ev.shake);
      } else if (ev.type === 'chainBroken') {
        const at = this.cellCenter(ev.at);
        this.spawnPop(at.x, at.y - this.cellSize * 0.3, 'snap', false);
        this.lastChainCell = -1;
      }
    }

    // ABILITY FIGURES. One number each: t from 0 to 1, redrawn every frame.
    // A figure that throws is DROPPED rather than allowed to kill the ticker —
    // Pixi v8 reschedules its rAF after the listener returns, so one bad frame
    // in here would freeze the whole face permanently (the A.38 report).
    for (let i = this.abilityFx.length - 1; i >= 0; i--) {
      const fx = this.abilityFx[i]!;
      // A DESTROYED GRAPHICS MUST NEVER REACH THE BATCHER. Pixi throws from
      // deep inside its own render pass ("Cannot read properties of null
      // (reading 'clear')" in DefaultBatcher.break) if a dead display object is
      // still parented, and that throw lands OUTSIDE this loop's try — the
      // frame guard catches it and the face skips a frame. Checked here so it
      // never gets that far.
      if (fx.g.destroyed) { this.abilityFx.splice(i, 1); continue; }
      fx.life += dt;
      if (fx.life >= fx.max) {
        this.fxLayer.removeChild(fx.g);
        fx.g.destroy();
        this.abilityFx.splice(i, 1);
        continue;
      }
      try {
        fx.g.clear();
        fx.draw(fx.g, fx.life / fx.max);
      } catch {
        this.fxLayer.removeChild(fx.g);
        fx.g.destroy();
        this.abilityFx.splice(i, 1);
      }
    }

    // Chain arcs fade fast — the route is a trace, not a decoration.
    for (let i = this.chainArcs.length - 1; i >= 0; i--) {
      const arc = this.chainArcs[i]!;
      arc.life += dt;
      if (arc.life > 0.7) {
        this.fxLayer.removeChild(arc.g);
        arc.g.destroy();
        this.chainArcs.splice(i, 1);
      } else {
        arc.g.alpha = 1 - arc.life / 0.7;
      }
    }

    // HOLD-TO-CHIP: while the finger is down in chip mode, keep chipping the cell
    // under it. The per-cell 170ms cooldown paces it — holding is continuous but
    // regen-bound (pillar 2), it just spares the tapping.
    if (this.pointerDown && useGame.getState().faceMode === 'chip') {
      this.chipAt(this.lastPx, this.lastPy);
    }

    this.drawMagnets(state);
    this.drawBeam(state);
    this.drawHeat(state, dt);
    this.drawFaceOverlay(state, dt);

    // Drills chase their targets.
    this.syncDrills();
    const units = state.drills.units;
    for (let i = 0; i < this.drillSprites.length; i++) {
      const sprite = this.drillSprites[i]!;
      // A DESTROYED SPRITE MUST NOT BE TOUCHED. `.clear()` on a destroyed
      // Graphics reads a null context, and a destroyed display object still
      // parented makes Pixi throw from inside its own batcher — both land as a
      // skipped frame via the A.38 guard rather than as anything a player can
      // act on. Cheap to check, and it is the same class of defect either way.
      if (sprite.root.destroyed || sprite.beam.destroyed) continue;
      const unit = units[i];
      if (!unit) continue;
      const at = this.cellCenter(unit.lastCell);
      // Per-drill orbital offset so drills sharing a target don't stack.
      const oa = (i * 2.4) % (Math.PI * 2);
      at.x += Math.cos(oa) * this.cellSize * 0.16;
      at.y += Math.sin(oa) * this.cellSize * 0.1;
      const targetY = at.y - this.cellSize * 0.18;
      const k = Math.min(1, dt * 7);
      sprite.root.position.x += (at.x - sprite.root.position.x) * k;
      sprite.root.position.y += (targetY - sprite.root.position.y) * k;
      if (sprite.pulse > 0) {
        sprite.pulse = Math.max(0, sprite.pulse - dt * 4);
        const sc = 1 + sprite.pulse * 0.35;
        sprite.body.scale.set(sc);
        sprite.beam.clear();
        if (!this.reducedMotion) {
          sprite.beam
            .moveTo(0, 0)
            .lineTo(0, this.cellSize * 0.34)
            .stroke({ width: 2, color: lookColor(sprite.look.split('|')[0] ?? ''), alpha: sprite.pulse * 0.8 });
        }
      } else {
        sprite.body.scale.set(1);
        sprite.beam.clear();
        // ── THE CHARGE METER, ON THE MACHINE ──────────────────────────────
        // An arc round the chassis that closes as the ability fills, and a
        // full bright ring when it is READY. This is what makes "saved and
        // unleashed on purpose" a thing a player can actually see coming —
        // without it, a manual fire is a button with no tension behind it.
        const unit = units[i];
        if (unit?.fits && unit.fits.length > 0) {
          const rr = Math.max(6, this.cellSize * 0.17) * (unit.prize ? 1.55 : 1) * 1.5;
          for (let sl = 0; sl < unit.fits.length; sl++) {
            const lvl = chargeLevel(state, unit, sl);
            if (lvl <= 0.02) continue;
            const col = lookColor(unit.fits[sl]!.id);
            const r0 = rr + sl * 2.6;
            const a0 = -Math.PI / 2;
            const a1 = a0 + Math.PI * 2 * lvl;
            sprite.beam.arc(0, 0, r0, a0, a1)
              .stroke({ width: 2, color: col, alpha: lvl >= 1 ? 1 : 0.55 });
          }
          if (drillReady(unit)) {
            sprite.beam.circle(0, 0, rr + 4)
              .stroke({ width: 1.4, color: 0xffffff, alpha: 0.35 + Math.sin(performance.now() / 160) * 0.25 });
          }
        }
        // Idle bob so the bay feels alive.
        if (!this.reducedMotion) {
          sprite.root.position.y += Math.sin(performance.now() / 400 + i) * 0.15;
        }
      }
    }

    // Tile layer descend slide-back.
    if (this.tileLayer.position.y < 0) {
      this.tileLayer.position.y = Math.min(0, this.tileLayer.position.y + dt * 60);
    }

    // Particles.
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.g.visible = false;
        this.fxLayer.removeChild(p.g);
        this.particlePool.push(p.g);
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += 620 * dt;
      p.g.position.x += p.vx * dt;
      p.g.position.y += p.vy * dt;
      p.g.rotation += p.vr * dt;
      p.g.alpha = 1 - p.life / p.maxLife;
    }

    // Pops.
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i]!;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.t.visible = false;
        this.popLayer.removeChild(p.t);
        this.popPool.push(p.t);
        this.pops.splice(i, 1);
        continue;
      }
      p.t.position.y += p.vy * dt;
      p.t.alpha = 1 - (p.life / p.maxLife) ** 2;
    }

    // Screen shake.
    if (this.shakeAmp > 0.05) {
      this.world.position.set(
        (Math.random() - 0.5) * this.shakeAmp,
        (Math.random() - 0.5) * this.shakeAmp,
      );
      this.shakeAmp *= Math.exp(-dt * 7);
    } else {
      this.world.position.set(0, 0);
    }
  }

}
