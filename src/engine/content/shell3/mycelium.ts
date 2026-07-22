/**
 * THE MYCELIUM NETWORK — a node graph threading the shell, 3 lanes wide and
 * 14 rows deep (one row per 25 depths). Inoculate a site with Humus; fed
 * mycelium SPREADS ON ITS OWN along the graph on the game clock; connected
 * clusters amplify every node in them. This is Verdance's persistent
 * structure: like the Lattice board, it survives Collapse AND Breach.
 */
import type { ActionResult, EngineCtx, GameState } from '../../types';
import { registerModifier, type Bucket } from '../../modifiers';
import { masteryLevel } from '../../systems/mastery';
import { depthRecord } from '../../shells';
import { D } from '../../decimal';
import { getCurrency, spendCurrency } from '../../resources';

export const MYC_LANES = 3;
export const MYC_ROWS = 12; // rows cover depth 0..275 in 25s (floor 290, A.16)
export const MYC_DEPTH_PER_ROW = 25;
export const SPREAD_EVERY_MS = 20 * 60_000;
export const SPREAD_COST = 15; // humus from the reserve per auto-node
export const CLUSTER_AMP = 0.15; // each extra node amplifies the cluster
export const CLUSTER_AMP_CAP = 3;

export interface MycNodeType {
  id: string;
  name: string;
  bucket: Bucket;
  /** Per-node bonus before cluster amplification. */
  value: number;
  glyph: string;
}

export const MYC_NODE_TYPES: MycNodeType[] = [
  { id: 'marrowcap', name: 'Marrowcap', bucket: 'dustYield', value: 1.012, glyph: '⬢' },
  { id: 'dewthread', name: 'Dewthread', bucket: 'regen', value: 1.01, glyph: '﹅' },
  { id: 'lanterngill', name: 'Lanterngill', bucket: 'xpGain', value: 1.012, glyph: '☼' },
  { id: 'burrowlace', name: 'Burrowlace', bucket: 'dropRate', value: 1.012, glyph: '❉' },
  { id: 'sporefather', name: 'Sporefather', bucket: 'motifGain', value: 1.015, glyph: '፠' },
];

export function mycUnlocked(state: GameState): boolean {
  return masteryLevel(state, 'verdance') >= 3;
}

export function siteId(row: number, lane: number): string {
  return `${row}-${lane}`;
}

export function siteDepth(row: number): number {
  return row * MYC_DEPTH_PER_ROW;
}

export function siteReachable(state: GameState, row: number): boolean {
  return depthRecord(state, 'verdance') >= siteDepth(row);
}

export function inoculateCost(state: GameState): number {
  return Math.round(20 * Math.pow(1.3, Object.keys(state.mycelium.nodes).length));
}

function adjacentSites(id: string): string[] {
  const [r, l] = id.split('-').map(Number) as [number, number];
  const out: string[] = [];
  if (r > 0) out.push(siteId(r - 1, l));
  if (r < MYC_ROWS - 1) out.push(siteId(r + 1, l));
  if (l > 0) out.push(siteId(r, l - 1));
  if (l < MYC_LANES - 1) out.push(siteId(r, l + 1));
  return out;
}

/** Connected components of the owned graph. Small (≤42 sites) — compute live. */
export function clusters(state: GameState): string[][] {
  const owned = new Set(Object.keys(state.mycelium.nodes));
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const start of owned) {
    if (seen.has(start)) continue;
    const comp: string[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const cur = queue.pop()!;
      comp.push(cur);
      for (const adj of adjacentSites(cur)) {
        if (owned.has(adj) && !seen.has(adj)) {
          seen.add(adj);
          queue.push(adj);
        }
      }
    }
    out.push(comp);
  }
  return out;
}

export function inoculate(state: GameState, ctx: EngineCtx, id: string, nodeType: string): ActionResult {
  if (!mycUnlocked(state)) return { ok: false, reason: 'The Mycelium wants Verdance Mastery 3' };
  const [r, l] = id.split('-').map(Number) as [number, number];
  if (!(r >= 0 && r < MYC_ROWS && l >= 0 && l < MYC_LANES)) return { ok: false, reason: 'No such site' };
  if (!siteReachable(state, r)) return { ok: false, reason: `The threads want depth ${siteDepth(r)} first` };
  if (state.mycelium.nodes[id]) return { ok: false, reason: 'Already living' };
  if (!MYC_NODE_TYPES.some((t) => t.id === nodeType)) return { ok: false, reason: 'Unknown culture' };
  const cost = inoculateCost(state);
  if (!spendCurrency(state, 'humus', D(cost))) return { ok: false, reason: `${cost} Humus to take` };
  state.mycelium.nodes[id] = nodeType;
  ctx.dirty();
  ctx.emit({ type: 'myceliumSpread', siteId: id, auto: false });
  return { ok: true };
}

export function feedMycelium(state: GameState, humus: number): ActionResult {
  if (!mycUnlocked(state)) return { ok: false, reason: 'Nothing to feed yet' };
  if (!(humus > 0)) return { ok: false, reason: 'Nothing offered' };
  const amount = Math.min(humus, getCurrency(state, 'humus').toNumber());
  if (amount < 1) return { ok: false, reason: 'No Humus to spare' };
  spendCurrency(state, 'humus', D(Math.floor(amount)));
  state.mycelium.reserve += Math.floor(amount);
  return { ok: true };
}

/** Fed mycelium creeps on its own — one site per interval per cluster.
 * Catches up interval-by-interval, so a night away spreads a night's worth. */
export function tickMycelium(state: GameState, ctx: EngineCtx): void {
  if (!mycUnlocked(state)) return;
  const now = state.guild.clockMs;
  if (state.mycelium.lastSpreadMs === 0) state.mycelium.lastSpreadMs = now;
  let guard = 0;
  while (now - state.mycelium.lastSpreadMs >= SPREAD_EVERY_MS && guard++ < 200) {
    state.mycelium.lastSpreadMs += SPREAD_EVERY_MS;
    spreadOnce(state, ctx);
  }
  if (now - state.mycelium.lastSpreadMs >= SPREAD_EVERY_MS) state.mycelium.lastSpreadMs = now;
}

function spreadOnce(state: GameState, ctx: EngineCtx): void {
  if (state.mycelium.reserve < SPREAD_COST) return;
  for (const comp of clusters(state)) {
    if (state.mycelium.reserve < SPREAD_COST) break;
    // The cluster reaches for the shallowest reachable empty neighbor.
    let target: string | null = null;
    let targetRow = 99;
    let fromType = comp[0]!;
    for (const id of comp) {
      for (const adj of adjacentSites(id)) {
        const r = Number(adj.split('-')[0]);
        if (state.mycelium.nodes[adj] || !siteReachable(state, r)) continue;
        if (r < targetRow) {
          targetRow = r;
          target = adj;
          fromType = id;
        }
      }
    }
    if (!target) continue;
    state.mycelium.reserve -= SPREAD_COST;
    state.mycelium.nodes[target] = state.mycelium.nodes[fromType]!;
    ctx.dirty();
    ctx.emit({ type: 'myceliumSpread', siteId: target, auto: true });
  }
}

/** Cluster-amplified node bonuses: value^(n × amp-scaled) per type. */
export function registerMyceliumModifiers(): void {
  for (const t of MYC_NODE_TYPES) {
    registerModifier({
      id: `mycelium.${t.id}`,
      label: `Mycelium: ${t.name}`,
      bucket: t.bucket,
      value: (s) => {
        let mult = 1;
        for (const comp of clusters(s)) {
          const amp = 1 + Math.min(CLUSTER_AMP_CAP - 1, CLUSTER_AMP * (comp.length - 1));
          for (const id of comp) {
            if (s.mycelium.nodes[id] === t.id) mult *= 1 + (t.value - 1) * amp;
          }
        }
        return mult;
      },
    });
  }
}

export function defaultMyceliumState(): GameState['mycelium'] {
  return { nodes: {}, reserve: 0, lastSpreadMs: 0 };
}
