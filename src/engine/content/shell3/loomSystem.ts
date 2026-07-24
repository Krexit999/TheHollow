/**
 * THE LOOM — craft-system #3, through the Phase-2 interface with zero
 * changes (the same proof the Crucible ran).
 *
 * Eight threads = 4 FIBERS × 2 TWISTS. Assign a thread to each of six warp
 * rows and six weft columns; a KNOT forms wherever twists OPPOSE (S over Z).
 * The lit grid is therefore the outer product of your twist choices — a
 * player can reason "S-Z-S rows against Z-Z-S columns" on paper — and the
 * EFFECTS come from tetromino shapes emerging among the knots: solve for
 * shape, never memorize recipes. Fibers set the strength of what the shape
 * does. Discovery per pillar 5: a shape enters the codex the first time it
 * forms on YOUR loom.
 */
import { D } from '../../decimal';
import type { CodexEntry, CraftSystem } from '../../craft';
import { registerCraftSystem } from '../../craft';
import { registerCurrency, spendCurrency, addCurrency } from '../../resources';
import { registerModifier, type Bucket } from '../../modifiers';
import type { ActionResult, EngineCtx, GameState, LoomState } from '../../types';
import { masteryLevel } from '../../systems/mastery';
import { materialCount, consumeMaterial, addMaterial } from '../../systems/forge';

export const LOOM_SIZE = 6;
export const WEAVE_THREAD_COST = 12;

export type Fiber = 'root' | 'silk' | 'iron' | 'ghost';
export type Twist = 'S' | 'Z';

export interface ThreadDef {
  id: string;
  fiber: Fiber;
  twist: Twist;
  name: string;
  /** Mastery gate (fibers deepen with the shell). */
  mastery: number;
}

export const THREADS: ThreadDef[] = (['root', 'silk', 'iron', 'ghost'] as Fiber[]).flatMap((fiber) =>
  (['S', 'Z'] as Twist[]).map((twist) => ({
    id: `${fiber}${twist}`,
    fiber,
    twist,
    name: `${fiber[0]!.toUpperCase()}${fiber.slice(1)} (${twist}-twist)`,
    mastery: fiber === 'iron' ? 6 : fiber === 'ghost' ? 10 : 4,
  })),
);

export const THREAD_BY_ID = new Map(THREADS.map((t) => [t.id, t]));
export const FIBER_MULT: Record<Fiber, number> = { root: 1, silk: 1.15, iron: 1.3, ghost: 1.5 };

/** Shape → bucket. Discovered on first emergence; stacks per instance. */
export const SHAPE_EFFECTS: Record<string, { name: string; bucket: Bucket; pct: number; flavor: string }> = {
  I: { name: 'The Long Reed', bucket: 'drillSpeed', pct: 0.04, flavor: 'Four knots in a line. The drills take the hint.' },
  O: { name: 'The Held Square', bucket: 'cap', pct: 0.04, flavor: 'Four knots holding hands. The cells hold more.' },
  T: { name: 'The Tap-Root', bucket: 'dustYield', pct: 0.04, flavor: 'Three across, one down. The classic cut.' },
  S: { name: 'The Green Step', bucket: 'regen', pct: 0.03, flavor: 'A stagger upward. The rock breathes easier.' },
  Z: { name: 'The Counter-Step', bucket: 'chainPower', pct: 0.04, flavor: 'A stagger against the grain. The rails approve.' },
  L: { name: 'The Gaff', bucket: 'dropRate', pct: 0.04, flavor: 'A long hook. Things catch on it.' },
  J: { name: 'The Crook', bucket: 'xpGain', pct: 0.04, flavor: 'The gaff\'s mirror. Lessons catch instead.' },
};

// ---------------------------------------------------------------------------
// Pattern math — pure, testable.
// ---------------------------------------------------------------------------

export function litGrid(warp: (string | null)[], weft: (string | null)[]): boolean[][] {
  const grid: boolean[][] = [];
  for (let r = 0; r < LOOM_SIZE; r++) {
    const row: boolean[] = [];
    const wt = warp[r] ? THREAD_BY_ID.get(warp[r]!) : null;
    for (let c = 0; c < LOOM_SIZE; c++) {
      const ft = weft[c] ? THREAD_BY_ID.get(weft[c]!) : null;
      row.push(!!wt && !!ft && wt.twist !== ft.twist);
    }
    grid.push(row);
  }
  return grid;
}

/** Normalize a 4-cell component to its tetromino letter (with rotations
 * and reflections folded — the loom doesn't care which way you hold it). */
function classifyTetromino(cells: Array<[number, number]>): string | null {
  if (cells.length !== 4) return null;
  const variants: string[] = [];
  let pts = cells;
  for (let flip = 0; flip < 2; flip++) {
    for (let rot = 0; rot < 4; rot++) {
      const minR = Math.min(...pts.map((p) => p[0]));
      const minC = Math.min(...pts.map((p) => p[1]));
      const norm = pts.map((p) => [p[0] - minR, p[1] - minC] as [number, number]);
      norm.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      variants.push(norm.map((p) => `${p[0]},${p[1]}`).join(';'));
      pts = pts.map((p) => [p[1], -p[0]] as [number, number]); // rotate 90°
    }
    pts = pts.map((p) => [p[0], -p[1]] as [number, number]); // reflect
  }
  const canon = [...variants].sort()[0]!;
  const SHAPES: Record<string, string> = {
    '0,0;0,1;0,2;0,3': 'I',
    '0,0;0,1;1,0;1,1': 'O',
    '0,0;0,1;0,2;1,1': 'T',
    '0,0;0,1;1,1;1,2': 'S', // S and Z fold together under reflection…
    '0,0;0,1;0,2;1,0': 'L', // …as do L and J; twist direction re-splits them.
  };
  // Compute canonical over rotations only (no reflection) first to keep
  // S/Z and L/J distinct — chirality is the point of twist.
  return SHAPES[canon] ?? null;
}

/** Chirality-preserving classification: rotations only. */
function classifyChiral(cells: Array<[number, number]>): string | null {
  if (cells.length !== 4) return null;
  const variants: string[] = [];
  let pts = cells;
  for (let rot = 0; rot < 4; rot++) {
    const minR = Math.min(...pts.map((p) => p[0]));
    const minC = Math.min(...pts.map((p) => p[1]));
    const norm = pts.map((p) => [p[0] - minR, p[1] - minC] as [number, number]);
    norm.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    variants.push(norm.map((p) => `${p[0]},${p[1]}`).join(';'));
    pts = pts.map((p) => [p[1], -p[0]] as [number, number]);
  }
  const canon = [...variants].sort()[0]!;
  const SHAPES: Record<string, string> = {
    '0,0;0,1;0,2;0,3': 'I',
    '0,0;0,1;1,0;1,1': 'O',
    '0,0;0,1;0,2;1,1': 'T',
    '0,1;0,2;1,0;1,1': 'S',
    '0,0;0,1;1,1;1,2': 'Z',
    '0,0;0,1;0,2;1,0': 'L',
    '0,0;0,1;0,2;1,2': 'J',
  };
  return SHAPES[canon] ?? null;
}
void classifyTetromino;

export interface WovenShape {
  shape: string;
  cells: Array<[number, number]>;
  /** Dominant fiber among the four knots (warp fiber counts double — it
   * carries the tension; ties resolve toward the humbler fiber). */
  fiber: Fiber;
}

export function findShapes(warp: (string | null)[], weft: (string | null)[]): WovenShape[] {
  const grid = litGrid(warp, weft);
  const seen: boolean[][] = grid.map((r) => r.map(() => false));
  const out: WovenShape[] = [];
  for (let r = 0; r < LOOM_SIZE; r++) {
    for (let c = 0; c < LOOM_SIZE; c++) {
      if (!grid[r]![c] || seen[r]![c]) continue;
      const comp: Array<[number, number]> = [];
      const queue: Array<[number, number]> = [[r, c]];
      seen[r]![c] = true;
      while (queue.length > 0) {
        const [cr, cc] = queue.pop()!;
        comp.push([cr, cc]);
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr < 0 || nr >= LOOM_SIZE || nc < 0 || nc >= LOOM_SIZE) continue;
          if (!grid[nr]![nc] || seen[nr]![nc]) continue;
          seen[nr]![nc] = true;
          queue.push([nr, nc]);
        }
      }
      const shape = classifyChiral(comp);
      if (!shape) continue;
      const fiberScore: Record<string, number> = {};
      for (const [rr, cc] of comp) {
        const wf = THREAD_BY_ID.get(warp[rr]!)!.fiber;
        const ff = THREAD_BY_ID.get(weft[cc]!)!.fiber;
        fiberScore[wf] = (fiberScore[wf] ?? 0) + 2;
        fiberScore[ff] = (fiberScore[ff] ?? 0) + 1;
      }
      const order: Fiber[] = ['root', 'silk', 'iron', 'ghost'];
      let fiber: Fiber = 'root';
      let bestScore = -1;
      for (const f of order) {
        if ((fiberScore[f] ?? 0) > bestScore) {
          bestScore = fiberScore[f] ?? 0;
          fiber = f;
        }
      }
      out.push({ shape, cells: comp, fiber });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// State + actions
// ---------------------------------------------------------------------------

export function defaultLoomState(): LoomState {
  return {
    warp: new Array(LOOM_SIZE).fill(null),
    weft: new Array(LOOM_SIZE).fill(null),
    setWarp: new Array(LOOM_SIZE).fill(null),
    setWeft: new Array(LOOM_SIZE).fill(null),
    threads: {},
    discoveredShapes: [],
    weaves: 0,
    passiveRank: 0,
    passiveProgressSec: 0,
    framed: false,
  };
}

export function loomUnlocked(state: GameState): boolean {
  return masteryLevel(state, 'verdance') >= 4;
}

/** Spin thread: verdance fiber-stuff + Sap → the craft currency. */
export const SPIN_INPUTS: Record<Fiber, { materials: Record<string, number>; sap: number; yields: number }> = {
  root: { materials: { throatroot: 2 }, sap: 8, yields: 4 },
  silk: { materials: { mothspool: 2 }, sap: 10, yields: 4 },
  iron: { materials: { wireweed: 3 }, sap: 14, yields: 4 },
  ghost: { materials: { palefiber: 2 }, sap: 20, yields: 3 },
};

export function spinThread(state: GameState, ctx: EngineCtx, threadId: string): ActionResult {
  if (!loomUnlocked(state)) return { ok: false, reason: 'The Loom wants Verdance Mastery 4' };
  const def = THREAD_BY_ID.get(threadId);
  if (!def) return { ok: false, reason: 'No such thread' };
  if (masteryLevel(state, 'verdance') < def.mastery) {
    return { ok: false, reason: `${def.fiber} fiber answers to Mastery ${def.mastery}` };
  }
  const recipe = SPIN_INPUTS[def.fiber];
  for (const [matId, n] of Object.entries(recipe.materials)) {
    if (materialCount(state, matId) < n) return { ok: false, reason: `Short of fiber-stuff` };
  }
  if (!spendCurrency(state, 'sap', D(recipe.sap))) return { ok: false, reason: `${recipe.sap} Sap to size the fiber` };
  for (const [matId, n] of Object.entries(recipe.materials)) consumeMaterial(state, matId, n);
  state.loom.threads[threadId] = (state.loom.threads[threadId] ?? 0) + recipe.yields;
  addCurrency(state, 'threadmark', D(recipe.yields));
  ctx.dirty();
  return { ok: true };
}

export function setThread(state: GameState, axis: 'warp' | 'weft', index: number, threadId: string | null): ActionResult {
  if (!loomUnlocked(state)) return { ok: false, reason: 'No loom yet' };
  if (index < 0 || index >= LOOM_SIZE) return { ok: false, reason: 'Off the frame' };
  if (threadId !== null && !THREAD_BY_ID.has(threadId)) return { ok: false, reason: 'No such thread' };
  state.loom[axis][index] = threadId;
  return { ok: true };
}

/** The iron frame (Part B export spine): one Lodeframe braces the loom for
 *  good. A wooden frame bows under a full warp — no commit without it. */
export function installLoomFrame(state: GameState): ActionResult {
  if (!loomUnlocked(state)) return { ok: false, reason: 'No loom yet' };
  if (state.loom.framed) return { ok: false, reason: 'The frame is already iron' };
  if (consumeMaterial(state, 'lodeframe', 1) === null) {
    return { ok: false, reason: 'The frame wants 1 Lodeframe — cast it at the Crucible in Ferrite, or buy one from Serra' };
  }
  state.loom.framed = true;
  return { ok: true };
}

export function commitWeave(state: GameState, ctx: EngineCtx): ActionResult {
  if (!loomUnlocked(state)) return { ok: false, reason: 'No loom yet' };
  if (!state.loom.framed) {
    return { ok: false, reason: 'The wooden frame bows under a full warp — brace it with 1 Lodeframe (Crucible in Ferrite, or Serra)' };
  }
  const { warp, weft } = state.loom;
  if (warp.some((t) => !t) || weft.some((t) => !t)) return { ok: false, reason: 'Every row and column wants a thread' };
  // The commit consumes one unit of each assigned thread choice's stock.
  const need: Record<string, number> = {};
  for (const t of [...warp, ...weft]) need[t!] = (need[t!] ?? 0) + 1;
  for (const [id, n] of Object.entries(need)) {
    if ((state.loom.threads[id] ?? 0) < n) return { ok: false, reason: `Short of ${THREAD_BY_ID.get(id)!.name}` };
  }
  for (const [id, n] of Object.entries(need)) state.loom.threads[id]! -= n;
  state.loom.setWarp = [...warp];
  state.loom.setWeft = [...weft];
  state.loom.weaves += 1;
  // The export spine: every committed weave bolts off one Fibercloth —
  // Verdance's cloth, wanted around Glassmere's lenses against cold and dust.
  addMaterial(state, 'fibercloth', 70, 1);
  const shapes = findShapes(warp, weft);
  const counts: Record<string, number> = {};
  for (const s of shapes) {
    counts[s.shape] = (counts[s.shape] ?? 0) + 1;
    if (!state.loom.discoveredShapes.includes(s.shape)) {
      state.loom.discoveredShapes.push(s.shape);
      ctx.emit({ type: 'shapeWoven', shapeId: s.shape, count: 1 });
    }
  }
  ctx.dirty();
  ctx.emit({ type: 'weaveSet' });
  return { ok: true, data: { shapes: shapes.map((s) => s.shape) } };
}

export function activeShapes(state: GameState): WovenShape[] {
  return findShapes(state.loom.setWarp, state.loom.setWeft);
}

// ---------------------------------------------------------------------------
// The CraftSystem registration — the whole point.
// ---------------------------------------------------------------------------

export const loomSystem: CraftSystem = {
  id: 'loom',
  name: 'The Loom',
  currencyId: 'threadmark',
  unlocked: loomUnlocked,
  ensureState(state) {
    if (!state.loom) state.loom = defaultLoomState();
  },
  tick(state, mods, ctx, dt) {
    void mods;
    void ctx;
    state.loom.passiveProgressSec += dt;
    while (state.loom.passiveProgressSec >= 1500 && state.loom.passiveRank < 20) {
      state.loom.passiveProgressSec -= 1500;
      state.loom.passiveRank += 1;
    }
  },
  offlineTick(state, mods, ctx, seconds, efficiency) {
    this.tick(state, mods, ctx, seconds * efficiency);
  },
  passiveRank(state) {
    return state.loom.passiveRank;
  },
  codex(state) {
    const out: CodexEntry[] = [];
    const active = new Set(activeShapes(state).map((s) => s.shape));
    for (const id of state.loom.discoveredShapes) {
      const def = SHAPE_EFFECTS[id];
      if (!def) continue;
      out.push({
        id,
        name: def.name,
        flavor: def.flavor,
        effect: `+${Math.round(def.pct * 100)}% per instance while woven (fiber-scaled)`,
        active: active.has(id),
        kind: 'pattern',
      });
    }
    return out;
  },
};

export function registerLoom(): void {
  registerCurrency({
    id: 'threadmark', name: 'Thread', tier: 'craft', color: '#b8d09a',
    description: 'Spun fiber, sized with sap, ready for the frame.',
    resetsOnCollapse: false,
  });
  registerCraftSystem(loomSystem);
  for (const [shapeId, def] of Object.entries(SHAPE_EFFECTS)) {
    registerModifier({
      id: `loom.${shapeId}`,
      label: `${def.name} (woven)`,
      bucket: def.bucket,
      value: (s) => {
        let mult = 1;
        for (const shape of activeShapes(s)) {
          if (shape.shape !== shapeId) continue;
          mult *= 1 + def.pct * FIBER_MULT[shape.fiber];
        }
        return mult;
      },
    });
  }
  registerModifier({
    id: 'loom.passive',
    label: 'Loom passive rank',
    bucket: 'dustYield',
    value: (s) => 1 + 0.005 * (s.loom?.passiveRank ?? 0),
  });
}
