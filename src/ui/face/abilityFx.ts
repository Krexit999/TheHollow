/**
 * ABILITY FIGURES — what the twenty-nine A.57 abilities LOOK LIKE.
 *
 * THIS FILE IS THE POINT OF THE PHASE. The previous two ability passes were
 * mechanically sound and completely invisible: a player watching the face could
 * not tell an alloyed bay from a bare one. So the rule now is that an ability
 * is a named event with a picture, and the picture lives here.
 *
 * SIXTEEN FIGURES, NOT TWENTY-NINE RENDERERS. Each ability names a figure, a
 * colour and a geometry, and the figures compose: `burst` at nine cells is a
 * detonation, at one cell it is a thump; `bolt` along an ordered path is
 * forked lightning that travels, and the same primitive along the fullest
 * charged cells is Arc Lightning. That is what keeps twenty-nine distinct
 * things affordable — and they ARE distinct, because colour, geometry and
 * timing all differ even where the primitive does not.
 *
 * EVERY FIGURE IS DRAWN INTO ONE `Graphics` AND ANIMATED BY ONE NUMBER. A live
 * effect is `{ g, life, max, draw(t) }` and the frame loop calls `draw` with
 * t ∈ 0..1. No per-effect classes, no state machines, and — the thing that
 * actually matters on this codebase — nothing that can throw a second time
 * after the first bad frame, because `draw` is called inside the renderer's
 * existing try/catch and a dead effect is simply dropped.
 *
 * REDUCED MOTION is honoured by the caller: it passes a shorter life and skips
 * the shake. The figures still DRAW — an accessibility setting should not mean
 * "you cannot see what your machines are doing", it should mean "it does not
 * lunge at you".
 */
import { Container, Graphics } from 'pixi.js';

export interface FxPoint { x: number; y: number }

export interface FxSpec {
  figure: string;
  color: number;
  /** Screen positions of every cell the ability touched. */
  cells: FxPoint[];
  /** Ordered positions where order is the point — a bolt, a domino. */
  path?: FxPoint[];
  /** Where it came from. */
  from: FxPoint;
  /** Cell size, so figures scale with the grid. */
  size: number;
}

export interface LiveFx {
  g: Graphics;
  life: number;
  max: number;
  draw: (g: Graphics, t: number) => void;
}

const TAU = Math.PI * 2;

/** A deterministic wobble, so a bolt looks jagged but does not crawl between
 *  frames — it is redrawn every frame and must keep the same shape. */
function wob(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return (x - Math.floor(x)) - 0.5;
}

/** ease-out — most of these should be fast at the start and settle. */
const out = (t: number): number => 1 - (1 - t) * (1 - t);

/**
 * BUILD ONE. Returns null for an unknown figure rather than throwing, because
 * a renderer that dies on an unrecognised event id is how the face froze in
 * A.38 and it is not happening again over a cosmetic string.
 */
export function makeFx(spec: FxSpec, layer: Container, reduced: boolean): LiveFx | null {
  const g = new Graphics();
  layer.addChild(g);
  const s = spec.size;
  const c = spec.color;
  const cells = spec.cells;
  const path = spec.path && spec.path.length > 0 ? spec.path : cells;
  const from = spec.from;
  const fast = reduced ? 0.45 : 1;

  switch (spec.figure) {
    // ── the detonation. Ring out of every cell, plus shards. ───────────────
    case 'burst':
      return {
        g, life: 0, max: 0.55 * fast,
        draw: (gg, t) => {
          const e = out(t);
          const a = 1 - t;
          for (let i = 0; i < cells.length; i++) {
            const p = cells[i]!;
            gg.circle(p.x, p.y, s * (0.12 + e * 0.55)).stroke({ width: 3.2 * (1 - t * 0.6), color: c, alpha: 0.85 * a });
            gg.circle(p.x, p.y, s * 0.3 * (1 - e)).fill({ color: 0xffffff, alpha: 0.55 * a });
            for (let k = 0; k < 4; k++) {
              const ang = (k / 4) * TAU + i;
              const r0 = s * 0.2;
              const r1 = s * (0.25 + e * 0.7);
              gg.moveTo(p.x + Math.cos(ang) * r0, p.y + Math.sin(ang) * r0)
                .lineTo(p.x + Math.cos(ang) * r1, p.y + Math.sin(ang) * r1)
                .stroke({ width: 2, color: c, alpha: 0.7 * a });
            }
          }
        },
      };

    // ── one heavy hit. A shockwave and a cross. ────────────────────────────
    case 'slam':
      return {
        g, life: 0, max: 0.4 * fast,
        draw: (gg, t) => {
          const e = out(t);
          const a = 1 - t;
          const p = cells[0] ?? from;
          gg.circle(p.x, p.y, s * (0.1 + e * 0.9)).stroke({ width: 5 * (1 - t), color: c, alpha: a });
          gg.circle(p.x, p.y, s * 0.45 * (1 - e)).fill({ color: 0xffffff, alpha: 0.8 * a });
          for (let k = 0; k < 4; k++) {
            const ang = (k / 4) * TAU + Math.PI / 4;
            gg.moveTo(p.x, p.y)
              .lineTo(p.x + Math.cos(ang) * s * e * 1.1, p.y + Math.sin(ang) * s * e * 1.1)
              .stroke({ width: 3 * (1 - t), color: c, alpha: 0.8 * a });
          }
        },
      };

    // ── the chain. Forked lightning that TRAVELS the path, leaving a trail. ─
    case 'bolt':
      return {
        g, life: 0, max: 0.85 * fast,
        draw: (gg, t) => {
          if (path.length === 0) return;
          // The head runs the path in the first 55%; the trail then fades.
          const head = Math.min(path.length, Math.ceil(path.length * Math.min(1, t / 0.55)));
          const a = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
          let prev = from;
          for (let i = 0; i < head; i++) {
            const p = path[i]!;
            // A kinked mid-point: it should read as jumping, not as a ruler.
            const mx = (prev.x + p.x) / 2 + wob(i, 1) * s * 0.5;
            const my = (prev.y + p.y) / 2 + wob(i, 2) * s * 0.5;
            gg.moveTo(prev.x, prev.y).lineTo(mx, my).lineTo(p.x, p.y)
              .stroke({ width: 5, color: c, alpha: 0.22 * a });
            gg.moveTo(prev.x, prev.y).lineTo(mx, my).lineTo(p.x, p.y)
              .stroke({ width: 1.6, color: 0xffffff, alpha: 0.95 * a });
            gg.circle(p.x, p.y, s * 0.16).fill({ color: c, alpha: 0.8 * a });
            prev = p;
          }
          // The head flares where it currently is.
          const tip = path[Math.max(0, head - 1)]!;
          if (t < 0.55) gg.circle(tip.x, tip.y, s * 0.32).fill({ color: 0xffffff, alpha: 0.5 });
        },
      };

    // ── the beam. Straight, bright, from the source through every cell. ────
    case 'beam':
      return {
        g, life: 0, max: 0.45 * fast,
        draw: (gg, t) => {
          const a = 1 - t;
          const grow = Math.min(1, t / 0.25);
          for (const p of cells) {
            const dx = p.x - from.x;
            const dy = p.y - from.y;
            gg.moveTo(from.x, from.y).lineTo(from.x + dx * grow, from.y + dy * grow)
              .stroke({ width: s * 0.34 * a, color: c, alpha: 0.28 * a });
            gg.moveTo(from.x, from.y).lineTo(from.x + dx * grow, from.y + dy * grow)
              .stroke({ width: 2.4, color: 0xffffff, alpha: 0.9 * a });
            gg.circle(p.x, p.y, s * 0.22 * grow).fill({ color: 0xffffff, alpha: 0.7 * a });
          }
        },
      };

    // ── the expanding ring. A wave front you can watch arrive. ─────────────
    case 'ring':
      return {
        g, life: 0, max: 0.7 * fast,
        draw: (gg, t) => {
          const e = out(t);
          const a = 1 - t;
          let far = s;
          for (const p of cells) far = Math.max(far, Math.hypot(p.x - from.x, p.y - from.y));
          gg.circle(from.x, from.y, (far + s * 0.5) * e)
            .stroke({ width: 6 * (1 - t * 0.7), color: c, alpha: 0.85 * a });
          gg.circle(from.x, from.y, (far + s * 0.5) * e * 0.86)
            .stroke({ width: 2, color: 0xffffff, alpha: 0.5 * a });
          for (const p of cells) {
            gg.circle(p.x, p.y, s * 0.2 * e).fill({ color: c, alpha: 0.5 * a });
          }
        },
      };

    // ── dragged inward. The magnet and the singularity. ────────────────────
    case 'implode':
      return {
        g, life: 0, max: 0.6 * fast,
        draw: (gg, t) => {
          const e = out(t);
          const a = 1 - t * 0.8;
          for (const p of cells) {
            const x = p.x + (from.x - p.x) * e;
            const y = p.y + (from.y - p.y) * e;
            gg.moveTo(p.x, p.y).lineTo(x, y).stroke({ width: 2.6, color: c, alpha: 0.8 * a });
            gg.circle(x, y, s * 0.16 * (1 - e * 0.5)).fill({ color: c, alpha: a });
          }
          gg.circle(from.x, from.y, s * 0.3 * e).fill({ color: 0xffffff, alpha: 0.6 * e * a });
        },
      };

    // ── driven outward. The repulsor and the static discharge. ─────────────
    case 'push':
      return {
        g, life: 0, max: 0.5 * fast,
        draw: (gg, t) => {
          const e = out(t);
          const a = 1 - t;
          gg.circle(from.x, from.y, s * (0.2 + e * 0.9)).stroke({ width: 3, color: c, alpha: 0.6 * a });
          for (const p of cells) {
            const dx = p.x - from.x;
            const dy = p.y - from.y;
            const len = Math.max(1, Math.hypot(dx, dy));
            const ox = (dx / len) * s * 0.5 * e;
            const oy = (dy / len) * s * 0.5 * e;
            gg.moveTo(p.x, p.y).lineTo(p.x + ox, p.y + oy)
              .stroke({ width: 3.4, color: c, alpha: 0.9 * a });
            gg.circle(p.x + ox, p.y + oy, s * 0.14).fill({ color: 0xffffff, alpha: 0.7 * a });
          }
        },
      };

    // ── the domino. Cells go off one after another, in order. ──────────────
    case 'sequence':
      return {
        g, life: 0, max: 0.95 * fast,
        draw: (gg, t) => {
          const n = path.length;
          for (let i = 0; i < n; i++) {
            // Each cell has its own little window inside the whole.
            const start = (i / Math.max(1, n)) * 0.65;
            const local = (t - start) / 0.35;
            if (local <= 0 || local >= 1) continue;
            const p = path[i]!;
            const e = out(local);
            const a = 1 - local;
            gg.circle(p.x, p.y, s * (0.15 + e * 0.5)).stroke({ width: 3, color: c, alpha: a });
            gg.circle(p.x, p.y, s * 0.22 * (1 - e)).fill({ color: 0xffffff, alpha: 0.7 * a });
            if (i > 0) {
              const q = path[i - 1]!;
              gg.moveTo(q.x, q.y).lineTo(p.x, p.y).stroke({ width: 2, color: c, alpha: 0.55 * a });
            }
          }
        },
      };

    // ── the outline. A border round the whole set, then a sweep through. ───
    case 'outline':
      return {
        g, life: 0, max: 0.9 * fast,
        draw: (gg, t) => {
          const a = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
          for (const p of cells) {
            gg.roundRect(p.x - s * 0.46, p.y - s * 0.46, s * 0.92, s * 0.92, s * 0.14)
              .stroke({ width: 2.6, color: c, alpha: 0.9 * a });
          }
          // The sweep: a bright cell running the set in order.
          const i = Math.min(cells.length - 1, Math.floor(t / 0.7 * cells.length));
          const p = cells[Math.max(0, i)];
          if (p) {
            gg.roundRect(p.x - s * 0.46, p.y - s * 0.46, s * 0.92, s * 0.92, s * 0.14)
              .fill({ color: c, alpha: 0.35 * a });
          }
        },
      };

    // ── thrown. Parabolas from the source to each landing cell. ────────────
    case 'arcs':
      return {
        g, life: 0, max: 0.7 * fast,
        draw: (gg, t) => {
          const a = 1 - t * 0.7;
          for (let i = 0; i < cells.length; i++) {
            const p = cells[i]!;
            const k = Math.min(1, t / 0.65);
            const steps = 10;
            gg.moveTo(from.x, from.y);
            for (let j = 1; j <= steps; j++) {
              const u = (j / steps) * k;
              const x = from.x + (p.x - from.x) * u;
              const y = from.y + (p.y - from.y) * u - Math.sin(u * Math.PI) * s * 1.1;
              gg.lineTo(x, y);
            }
            gg.stroke({ width: 2, color: c, alpha: 0.85 * a });
            if (k >= 1) gg.circle(p.x, p.y, s * 0.18).fill({ color: c, alpha: a });
          }
        },
      };

    // ── the stain. An organic spread that stays a moment. ──────────────────
    case 'blot':
      return {
        g, life: 0, max: 1.1 * fast,
        draw: (gg, t) => {
          const a = t < 0.6 ? t / 0.6 : 1 - (t - 0.6) / 0.4;
          for (let i = 0; i < cells.length; i++) {
            const p = cells[i]!;
            const reach = Math.min(1, Math.max(0, (t - (i / Math.max(1, cells.length)) * 0.5) / 0.4));
            if (reach <= 0) continue;
            const r = s * 0.42 * reach;
            gg.moveTo(p.x + r, p.y);
            for (let k = 1; k <= 8; k++) {
              const ang = (k / 8) * TAU;
              const rr = r * (0.7 + Math.abs(wob(i, k)) * 0.9);
              gg.lineTo(p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr);
            }
            gg.fill({ color: c, alpha: 0.42 * a });
          }
        },
      };

    // ── the void. A dark disc that drags its cells into itself. ────────────
    case 'hole':
      return {
        g, life: 0, max: 0.85 * fast,
        draw: (gg, t) => {
          const grow = t < 0.6 ? out(t / 0.6) : 1 - out((t - 0.6) / 0.4);
          const a = 1;
          for (const p of cells) {
            const e = Math.min(1, t / 0.6);
            const x = p.x + (from.x - p.x) * e;
            const y = p.y + (from.y - p.y) * e;
            gg.circle(x, y, s * 0.2 * (1 - e * 0.6)).fill({ color: c, alpha: 0.75 * (1 - t) });
            gg.moveTo(p.x, p.y).lineTo(x, y).stroke({ width: 1.6, color: c, alpha: 0.5 * (1 - t) });
          }
          gg.circle(from.x, from.y, s * 0.95 * grow).fill({ color: 0x05030a, alpha: 0.92 * a });
          gg.circle(from.x, from.y, s * 0.95 * grow).stroke({ width: 3, color: c, alpha: 0.9 });
          if (t > 0.75) {
            const f = (t - 0.75) / 0.25;
            gg.circle(from.x, from.y, s * (0.9 + f * 1.6)).stroke({ width: 4 * (1 - f), color: c, alpha: 1 - f });
          }
        },
      };

    // ── the eruption. It comes UP, which nobody expects the first time. ────
    case 'plume':
      return {
        g, life: 0, max: 0.8 * fast,
        draw: (gg, t) => {
          const a = 1 - t;
          const rise = out(Math.min(1, t / 0.5));
          for (let i = 0; i < cells.length; i++) {
            const p = cells[i]!;
            const h = s * (0.6 + Math.abs(wob(i, 3)) * 1.4) * rise;
            gg.moveTo(p.x - s * 0.22, p.y + s * 0.3)
              .lineTo(p.x + wob(i, 4) * s * 0.3, p.y + s * 0.3 - h)
              .lineTo(p.x + s * 0.22, p.y + s * 0.3)
              .fill({ color: c, alpha: 0.55 * a });
            gg.circle(p.x, p.y + s * 0.3 - h, s * 0.13).fill({ color: 0xffe08a, alpha: 0.9 * a });
          }
          gg.circle(from.x, from.y, s * (0.3 + rise * 0.7))
            .stroke({ width: 3, color: c, alpha: 0.6 * a });
        },
      };

    // ── the replay. A translucent version of a shape that already happened. ─
    case 'ghost':
      return {
        g, life: 0, max: 0.8 * fast,
        draw: (gg, t) => {
          const a = Math.sin(Math.min(1, t) * Math.PI) * 0.9;
          for (const p of cells) {
            gg.roundRect(p.x - s * 0.42, p.y - s * 0.42, s * 0.84, s * 0.84, s * 0.12)
              .fill({ color: c, alpha: 0.22 * a });
            gg.roundRect(p.x - s * 0.42, p.y - s * 0.42, s * 0.84, s * 0.84, s * 0.12)
              .stroke({ width: 1.6, color: c, alpha: 0.8 * a });
          }
        },
      };

    // ── the teleport. Here, then there, with the streak between. ───────────
    case 'blink':
      return {
        g, life: 0, max: 0.5 * fast,
        draw: (gg, t) => {
          const a = 1 - t;
          const last = cells[cells.length - 1] ?? from;
          gg.moveTo(from.x, from.y).lineTo(last.x, last.y)
            .stroke({ width: s * 0.3 * a, color: c, alpha: 0.3 * a });
          for (const p of cells) {
            gg.circle(p.x, p.y, s * 0.36 * (1 - t * 0.5)).stroke({ width: 2.4, color: c, alpha: a });
          }
          gg.circle(from.x, from.y, s * 0.4 * (1 - t)).stroke({ width: 2, color: 0xffffff, alpha: 0.7 * a });
        },
      };

    // ── everything at once. Reserved for the two Aleph abilities. ──────────
    case 'cataclysm':
      return {
        g, life: 0, max: 1.2 * fast,
        draw: (gg, t) => {
          const a = 1 - t;
          const e = out(t);
          for (let k = 0; k < 5; k++) {
            const r = s * (1 + k * 1.5) * e;
            gg.circle(from.x, from.y, r)
              .stroke({ width: 4 * (1 - t), color: k % 2 ? 0xffffff : c, alpha: 0.7 * a });
          }
          for (let k = 0; k < 14; k++) {
            const ang = (k / 14) * TAU + t * 2;
            const r1 = s * (0.5 + e * 5);
            gg.moveTo(from.x, from.y)
              .lineTo(from.x + Math.cos(ang) * r1, from.y + Math.sin(ang) * r1)
              .stroke({ width: 2.2, color: c, alpha: 0.55 * a });
          }
          for (const p of cells) {
            gg.circle(p.x, p.y, s * 0.3 * (1 - t)).fill({ color: 0xffffff, alpha: 0.6 * a });
          }
        },
      };

    default:
      // Unknown figure: draw the honest fallback rather than nothing, so a
      // missing case is VISIBLE in play instead of silently doing what the old
      // abilities did.
      return {
        g, life: 0, max: 0.4 * fast,
        draw: (gg, t) => {
          const a = 1 - t;
          for (const p of cells) {
            gg.circle(p.x, p.y, s * 0.4).stroke({ width: 3, color: c, alpha: a });
          }
        },
      };
  }
}
