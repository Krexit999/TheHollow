/**
 * ABILITY PLANS — the geometry half of A.57.
 *
 * An ability fires and produces a PLAN: which cells it takes and how much of
 * each, plus what the renderer should draw and any world effect (ore moved,
 * seed planted, rot laid down). Nothing else. That single funnel is what makes
 * pillar 2 structural rather than argued — there is one place charge leaves the
 * field, and every one of the twenty-nine abilities goes through it.
 *
 * THE SHARE IS THE WHOLE SAFETY ARGUMENT. A plan hit says "take `share` of a
 * full bite of this cell", and the bite itself is `min(power, cellCharge)`. So
 * an explosion clearing nine cells takes the charge that was in those nine
 * cells and the field then has nine cells to refill instead of one. Faster to
 * the ceiling; the ceiling does not move. `abilityParams` clamps every `share`
 * at 1 at the data layer, so no grade and no combination can ask for more of a
 * cell than the cell contains.
 *
 * ZONES ARE RESPECTED, INCLUDING BY EXPLOSIONS. If a player painted four
 * squares for a machine, an ability that machine fires stays inside them. It
 * would be easy to argue an explosion should spill; it would also make the
 * routing UI a liar, and a control that only mostly works is worse than no
 * control.
 */
import type { GameState } from '../types';
import type { ModifierCache } from '../modifiers';
import type { DrillAbilityDef, PlanFigure } from '../content/drillAlloys';
import { cellCap } from './face';

export interface PlanHit { cell: number; share: number }

export interface AbilityPlan {
  /** What it takes. The only path by which charge leaves the field. */
  hits: PlanHit[];
  /** What it looks like. `path` is ordered for bolts and sequences. */
  figure: PlanFigure;
  color: number;
  from: number;
  cells: number[];
  path?: number[];
  shake?: number;
  // ── world effects, all outside the income path ────────────────────────
  /** SEED SPREAD: plant a pocket at these cells. */
  plantAt?: number[];
  /** PARASITE: leave rot (a residue mark) for this many seconds. */
  rot?: { cells: number[]; sec: number };
  /** MAGMA BURST / MOLTEN CORE: leave the rock burning. */
  burn?: { cells: number[]; sec: number };
  /** MAGNETIC PULL: slide these pockets one step toward the drill. */
  pullOre?: number[];
  /** VEIN MINER: open these pockets outright. */
  openOre?: number[];
}

type Ctx = {
  state: GameState;
  mods: ModifierCache;
  target: number;
  p: Record<string, number>;
  def: DrillAbilityDef;
  /** Cells this drill may not work — vined, or outside its painted zone. */
  blocked: (i: number) => boolean;
  rng: () => number;
};

const xOf = (s: GameState, i: number): number => i % s.face.w;
const yOf = (s: GameState, i: number): number => Math.floor(i / s.face.w);
const idx = (s: GameState, x: number, y: number): number => y * s.face.w + x;
const inBounds = (s: GameState, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < s.face.w && y < s.face.h;

/** A cell this plan is allowed to include: on the grid, not blocked, not a
 *  pocket (a pocket does not come away in a bite — A.55's rule), holding
 *  something worth taking. Ore-specific shapes bypass it deliberately. */
function live(c: Ctx, i: number): boolean {
  const s = c.state;
  if (i < 0 || i >= s.face.cells.length) return false;
  if (c.blocked(i)) return false;
  if (s.face.ore?.[i]) return false;
  return (s.face.cells[i] ?? 0) > 0.01;
}

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const ALL8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

// ---------------------------------------------------------------------------
// The sixteen shapes
// ---------------------------------------------------------------------------

/** Chebyshev square: the 3x3 and its bigger cousins. */
function block(c: Ctx, r: number): number[] {
  const out: number[] = [];
  const x0 = xOf(c.state, c.target);
  const y0 = yOf(c.state, c.target);
  const rr = Math.max(1, Math.round(r));
  for (let dy = -rr; dy <= rr; dy++) {
    for (let dx = -rr; dx <= rr; dx++) {
      const x = x0 + dx;
      const y = y0 + dy;
      if (!inBounds(c.state, x, y)) continue;
      const i = idx(c.state, x, y);
      if (live(c, i)) out.push(i);
    }
  }
  return out;
}

/** Euclidean disc — rounder than `block`, and it reads differently on the face. */
function radius(c: Ctx, r: number): number[] {
  const out: number[] = [];
  const x0 = xOf(c.state, c.target);
  const y0 = yOf(c.state, c.target);
  const rr = Math.ceil(r);
  for (let dy = -rr; dy <= rr; dy++) {
    for (let dx = -rr; dx <= rr; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = x0 + dx;
      const y = y0 + dy;
      if (!inBounds(c.state, x, y)) continue;
      const i = idx(c.state, x, y);
      if (live(c, i)) out.push(i);
    }
  }
  return out;
}

/**
 * The SHELL of a disc — a travelling wave front, not a filled blast.
 *
 * IT WALKS INWARD UNTIL IT FINDS ROCK, and that is a real fix rather than a
 * convenience: a grade-VII Heat Wave asks for radius 9 and a 6x6 face has no
 * cell nine steps from anything, so the exact ring came back EMPTY and the
 * ability silently did nothing. Found by the "every ability produces a plan"
 * test, which exists because the previous two ability passes shipped things
 * that did nothing and nobody noticed.
 *
 * "As far as it can reach" is also the honest reading of the fiction — the wave
 * goes out until it runs out of face.
 */
function ring(c: Ctx, r: number): number[] {
  const x0 = xOf(c.state, c.target);
  const y0 = yOf(c.state, c.target);
  const span = Math.max(c.state.face.w, c.state.face.h);
  for (let rr = Math.max(1, Math.min(Math.round(r), span)); rr >= 1; rr--) {
    const out: number[] = [];
    for (let dy = -rr; dy <= rr; dy++) {
      for (let dx = -rr; dx <= rr; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue;
        const x = x0 + dx;
        const y = y0 + dy;
        if (!inBounds(c.state, x, y)) continue;
        const i = idx(c.state, x, y);
        if (live(c, i)) out.push(i);
      }
    }
    if (out.length > 0) return out;
  }
  return [];
}

/**
 * A straight run, along whichever axis has the most left in it. `skip` leaves a
 * gap at the start — REALITY SKIP arrives PAST the rock it ignored.
 *
 * THE SKIP SHRINKS UNTIL IT LANDS SOMEWHERE, for the same reason the ring walks
 * inward: a grade-VII Reality Skip asks to start nine cells away and a 6x6 face
 * has nowhere nine cells away, so the run came back EMPTY and the ability
 * silently did nothing. Two abilities shipped inert in the same afternoon on
 * exactly this — a parameter that grades past the size of the board — which is
 * why both fixes are written as "reach as far as there is board", not as a
 * clamp on the grade.
 */
function lineRun(c: Ctx, len: number, skip = 0): number[] {
  const s = c.state;
  const span = Math.max(s.face.w, s.face.h);
  for (let sk = Math.max(0, Math.min(Math.round(skip), span)); sk >= 0; sk--) {
    let best: number[] = [];
    let bestCharge = -1;
    for (const [dx, dy] of ORTHO) {
      const run: number[] = [];
      let charge = 0;
      for (let k = 1 + sk; k <= len + sk; k++) {
        const x = xOf(s, c.target) + dx * k;
        const y = yOf(s, c.target) + dy * k;
        if (!inBounds(s, x, y)) break;
        const i = idx(s, x, y);
        if (!live(c, i)) continue;
        run.push(i);
        charge += s.face.cells[i] ?? 0;
      }
      if (charge > bestCharge) { bestCharge = charge; best = run; }
    }
    if (best.length > 0) return best;
  }
  return [];
}

/** The target's whole row. Overcharge Beam, and nothing else. */
function row(c: Ctx): number[] {
  const s = c.state;
  const y = yOf(s, c.target);
  const out: number[] = [];
  for (let x = 0; x < s.face.w; x++) {
    const i = idx(s, x, y);
    if (live(c, i)) out.push(i);
  }
  return out;
}

/** N rays fanning out — the prism. Each ray is `len` long. */
function split(c: Ctx, n: number, len: number): number[] {
  const out: number[] = [];
  const dirs = ALL8.slice(0, Math.max(2, Math.min(8, Math.round(n))));
  for (const [dx, dy] of dirs) {
    for (let k = 1; k <= len; k++) {
      const x = xOf(c.state, c.target) + dx * k;
      const y = yOf(c.state, c.target) + dy * k;
      if (!inBounds(c.state, x, y)) break;
      const i = idx(c.state, x, y);
      if (live(c, i)) out.push(i);
    }
  }
  return out;
}

/** The target and the cells BEHIND it — the beam does not stop at the face. */
function behind(c: Ctx, depth: number): number[] {
  const out: number[] = live(c, c.target) ? [c.target] : [];
  out.push(...lineRun(c, Math.max(1, Math.round(depth))));
  return out;
}

/** A ricochet path: travel, hit, turn, travel again. */
function bounce(c: Ctx, hops: number): number[] {
  const s = c.state;
  const out: number[] = [];
  let x = xOf(s, c.target);
  let y = yOf(s, c.target);
  let d = ALL8[Math.floor(c.rng() * 4) + 4]!; // start diagonal — it reads as a bounce
  for (let h = 0; h < Math.max(1, Math.round(hops)); h++) {
    let nx = x + d[0];
    let ny = y + d[1];
    // Reflect off the walls, which is what makes it look like a ricochet.
    if (nx < 0 || nx >= s.face.w) { d = [-d[0], d[1]] as unknown as typeof d; nx = x + d[0]; }
    if (ny < 0 || ny >= s.face.h) { d = [d[0], -d[1]] as unknown as typeof d; ny = y + d[1]; }
    if (!inBounds(s, nx, ny)) break;
    x = nx; y = ny;
    const i = idx(s, x, y);
    if (live(c, i)) out.push(i);
  }
  return out;
}

/**
 * THE CHAIN, and it is the one the brief cared most about: "chain continues
 * until a roll fails — sometimes 1 extra, sometimes 20."
 *
 * A random walk from the target through live neighbours, continuing while the
 * roll holds. `keep` is clamped below 1 by `abilityParams`, so the expected
 * length is finite (1/(1−keep)) and the hard `cap` bounds the tail. Ordered, so
 * the renderer can draw the bolt travelling rather than lighting the whole set.
 */
function chain(c: Ctx, keep: number, cap: number): number[] {
  const out: number[] = [];
  const seen = new Set<number>([c.target]);
  let at = c.target;
  const limit = Math.max(1, Math.round(cap));
  while (out.length < limit) {
    const opts: number[] = [];
    for (const [dx, dy] of ALL8) {
      const x = xOf(c.state, at) + dx;
      const y = yOf(c.state, at) + dy;
      if (!inBounds(c.state, x, y)) continue;
      const i = idx(c.state, x, y);
      if (!seen.has(i) && live(c, i)) opts.push(i);
    }
    if (opts.length === 0) break;
    const next = opts[Math.floor(c.rng() * opts.length)]!;
    seen.add(next);
    out.push(next);
    at = next;
    if (c.rng() >= keep) break;
  }
  return out;
}

/** The N fullest cells within r — "lightning between the charged cells". */
function charged(c: Ctx, n: number, r: number): number[] {
  return radius(c, r)
    .sort((a, b) => (c.state.face.cells[b] ?? 0) - (c.state.face.cells[a] ?? 0))
    .slice(0, Math.max(1, Math.round(n)));
}

/** Cells UNDER a fraction of cap — Null Pulse takes what was nearly gone. */
function weak(c: Ctx, r: number, under: number): number[] {
  const cap = cellCap(c.state, c.mods);
  return radius(c, r).filter((i) => (c.state.face.cells[i] ?? 0) < cap * under);
}

/** N cells anywhere on the face. Echo Mine and Genesis reach across it. */
function scatter(c: Ctx, n: number): number[] {
  const pool: number[] = [];
  for (let i = 0; i < c.state.face.cells.length; i++) if (live(c, i)) pool.push(i);
  // Fisher-Yates the first n, so a big scatter does not bias toward low indices.
  const take = Math.min(pool.length, Math.max(1, Math.round(n)));
  for (let k = 0; k < take; k++) {
    const j = k + Math.floor(c.rng() * (pool.length - k));
    const t = pool[k]!; pool[k] = pool[j]!; pool[j] = t;
  }
  return pool.slice(0, take);
}

/** The connected ORE pocket the drill is standing in or nearest to. */
function vein(c: Ctx, max: number): number[] {
  const s = c.state;
  const ore = s.face.ore;
  if (!ore) return [];
  let seed = ore[c.target] ? c.target : -1;
  if (seed < 0) {
    // Nothing under the drill: take the nearest pocket it is allowed to reach.
    let bestD = Infinity;
    for (let i = 0; i < ore.length; i++) {
      if (!ore[i] || c.blocked(i)) continue;
      const d = Math.abs(xOf(s, i) - xOf(s, c.target)) + Math.abs(yOf(s, i) - yOf(s, c.target));
      if (d < bestD) { bestD = d; seed = i; }
    }
  }
  if (seed < 0) return [];
  const type = ore[seed];
  const out: number[] = [];
  const seen = new Set<number>();
  const stack = [seed];
  const limit = Math.max(1, Math.round(max));
  while (stack.length > 0 && out.length < limit) {
    const at = stack.pop()!;
    if (seen.has(at)) continue;
    seen.add(at);
    if (ore[at] !== type || c.blocked(at)) continue;
    out.push(at);
    for (const [dx, dy] of ORTHO) {
      const x = xOf(s, at) + dx;
      const y = yOf(s, at) + dy;
      if (inBounds(s, x, y)) stack.push(idx(s, x, y));
    }
  }
  return out;
}

/** The connected VINED region — Rootbreaker's domino. */
function vines(c: Ctx, max: number): number[] {
  const s = c.state;
  const stage = s.growth.stage;
  let seed = -1;
  let bestD = Infinity;
  for (let i = 0; i < s.face.cells.length; i++) {
    if ((stage[i] ?? 0) <= 0) continue;
    const d = Math.abs(xOf(s, i) - xOf(s, c.target)) + Math.abs(yOf(s, i) - yOf(s, c.target));
    if (d < bestD) { bestD = d; seed = i; }
  }
  if (seed < 0) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  const stack = [seed];
  const limit = Math.max(1, Math.round(max));
  while (stack.length > 0 && out.length < limit) {
    const at = stack.pop()!;
    if (seen.has(at)) continue;
    seen.add(at);
    if ((stage[at] ?? 0) <= 0) continue;
    out.push(at);
    for (const [dx, dy] of ORTHO) {
      const x = xOf(s, at) + dx;
      const y = yOf(s, at) + dy;
      if (inBounds(s, x, y)) stack.push(idx(s, x, y));
    }
  }
  return out;
}

/** Ripe plants within r — Bloom Harvest sets off the whole bank. */
function mature(c: Ctx, r: number): number[] {
  const s = c.state;
  const out: number[] = [];
  const x0 = xOf(s, c.target);
  const y0 = yOf(s, c.target);
  const rr = Math.ceil(r);
  for (let dy = -rr; dy <= rr; dy++) {
    for (let dx = -rr; dx <= rr; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = x0 + dx;
      const y = y0 + dy;
      if (!inBounds(s, x, y)) continue;
      const i = idx(s, x, y);
      if ((s.growth.stage[i] ?? 0) >= 3) out.push(i);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/**
 * BUILD THE PLAN for one firing. Pure: it reads the face and returns what
 * should happen. Nothing here mutates state — the caller applies it, which is
 * what lets the test suite assert plans directly and the sim replay them.
 *
 * Returns `null` when the ability has nothing to work with (no vein in reach,
 * no ripe plants, an empty face). A firing that finds nothing does NOT consume
 * the charge — see `fireAbility`. An ability that silently ate its meter on an
 * empty grid would read as broken, and the player would be right.
 */
export function buildPlan(
  state: GameState, mods: ModifierCache, def: DrillAbilityDef,
  p: Record<string, number>, target: number,
  blocked: (i: number) => boolean, rng: () => number = Math.random,
): AbilityPlan | null {
  const c: Ctx = { state, mods, target, p, def, blocked, rng };
  const share = p['share'] ?? 1;
  let cells: number[] = [];
  let path: number[] | undefined;
  const plan: Partial<AbilityPlan> = {};

  switch (def.shape) {
    case 'single':
      cells = live(c, target) ? [target] : [];
      break;
    case 'block':
      cells = block(c, p['r'] ?? 1);
      break;
    case 'radius':
      cells = radius(c, p['r'] ?? 2);
      break;
    case 'ring':
      cells = ring(c, p['r'] ?? 3);
      break;
    case 'line':
      cells = lineRun(c, p['len'] ?? 5, Math.round(p['skip'] ?? 0));
      path = cells;
      break;
    case 'row':
      cells = row(c);
      break;
    case 'split':
      cells = split(c, p['n'] ?? 3, p['len'] ?? 2);
      break;
    case 'behind':
      cells = behind(c, p['depth'] ?? 2);
      path = cells;
      break;
    case 'bounce':
      cells = bounce(c, p['hops'] ?? 4);
      path = cells;
      break;
    case 'chain':
      cells = chain(c, p['keep'] ?? 0.7, p['cap'] ?? 20);
      path = cells;
      break;
    case 'charged':
      cells = charged(c, p['n'] ?? 5, p['r'] ?? 3);
      path = cells;
      break;
    case 'weak':
      cells = weak(c, p['r'] ?? 3, p['under'] ?? 0.45);
      break;
    case 'scatter':
      cells = scatter(c, p['n'] ?? 4);
      break;
    case 'vein':
      cells = vein(c, p['max'] ?? 10);
      break;
    case 'vines':
      cells = vines(c, p['max'] ?? 12);
      path = cells;
      break;
    case 'mature':
      cells = mature(c, p['r'] ?? 3);
      break;
  }

  // ── world effects, per ability ──────────────────────────────────────────
  if (def.id === 'veinminer') {
    // The vein is POCKETS, not plain rock: it opens them rather than chipping.
    plan.openOre = cells;
    cells = [];
  }
  if (def.id === 'magneticpull') plan.pullOre = nearbyOre(c, p['r'] ?? 3);
  if (def.id === 'seedspread') plan.plantAt = cells.slice(0, Math.max(1, Math.round(p['plant'] ?? 1)));
  if (def.id === 'parasite') plan.rot = { cells, sec: p['rot'] ?? 12 };
  if (def.id === 'magmaburst' || def.id === 'moltencore') {
    plan.burn = { cells, sec: p['burn'] ?? 6 };
  }

  const hits: PlanHit[] = cells.map((cell) => ({ cell, share }));
  const nothing = hits.length === 0
    && (plan.openOre?.length ?? 0) === 0
    && (plan.pullOre?.length ?? 0) === 0;
  if (nothing) return null;

  return {
    hits,
    figure: def.figure,
    color: def.color,
    from: target,
    cells: [...cells, ...(plan.openOre ?? []), ...(plan.pullOre ?? [])],
    path,
    shake: p['shake'],
    ...plan,
  };
}

/** Pockets within reach that MAGNETIC PULL will drag one step closer. */
function nearbyOre(c: Ctx, r: number): number[] {
  const s = c.state;
  const ore = s.face.ore;
  if (!ore) return [];
  const out: number[] = [];
  const x0 = xOf(s, c.target);
  const y0 = yOf(s, c.target);
  const rr = Math.ceil(r);
  for (let dy = -rr; dy <= rr; dy++) {
    for (let dx = -rr; dx <= rr; dx++) {
      if ((dx === 0 && dy === 0) || dx * dx + dy * dy > r * r) continue;
      const x = x0 + dx;
      const y = y0 + dy;
      if (!inBounds(s, x, y)) continue;
      const i = idx(s, x, y);
      if (ore[i] && !c.blocked(i)) out.push(i);
    }
  }
  return out;
}

/** One step of a pocket toward the drill, for MAGNETIC PULL. Returns the cell
 *  it should move to, or -1 if it cannot (occupied, vined, off the grid). */
export function stepToward(state: GameState, from: number, to: number): number {
  const s = state;
  const dx = Math.sign(xOf(s, to) - xOf(s, from));
  const dy = Math.sign(yOf(s, to) - yOf(s, from));
  const x = xOf(s, from) + dx;
  const y = yOf(s, from) + dy;
  if (!inBounds(s, x, y)) return -1;
  const i = idx(s, x, y);
  if (i === from) return -1;
  if (s.face.ore?.[i]) return -1;
  if ((s.growth.stage[i] ?? 0) > 0) return -1;
  return i;
}
