/**
 * THE PRESS — DRAWING (§13, §11.1, keystone at Pressyard 120).
 *
 * §13: "billet → plate / rod / wire · blocks every part from tier VII."
 * §11.1 lists the vocabulary this game was always supposed to have and did not:
 * "sprue, grog, billets, plates, rods, wire". Three of those six existed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT UNLOCKS IS A VERB (LAW 4), AND THE VERB IS NOT "DRAW" — IT IS CASTING.
 *
 * Drawing stock on its own would be a row that turns two units into one, which
 * is a number wearing a machine's hat. What the Press actually changes is what
 * the MOULD will accept: there are three shapes in this game that cannot be
 * poured, only WORKED, and they exist as of this commit —
 *
 *   ROLLED core      out of PLATE   sheet folded on itself, not poured
 *   DRAWN handle     out of ROD     pulled to length through a die
 *   WOUND binding    out of WIRE    wound rather than lashed or pinned
 *
 * ROLLED IS A CORE AND NOT A HEAD BECAUSE THE SHAPE SUITE SAID SO. Only the
 * head sets a swing's geometry, there are six `ReachPattern`s and all six are
 * taken, so a seventh head shape necessarily cuts the same rock as one that
 * already exists — which is what `tool-shapes.test.ts` caught on the first run
 * (`rolled cuts exactly the same rock as wide`). The alternative was a seventh
 * face-reach pattern, which is not what a Press is for.
 *
 * Nothing was taken away to make room for them: every shape a player could cast
 * before is still castable from raw stone, at the same price. The Press adds a
 * route, and the route has its own stock, its own cost and its own three tiers.
 * That is the difference between a gate and a tax, and this project has reverted
 * two systems for being on the wrong side of it.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * TIERS ARE CAPABILITY (§15.4), and each is a form the Press could not make:
 *   I    PLATE — rolled flat
 *   II   ROD   — drawn to length
 *   III  WIRE  — drawn fine, which is the hardest thing a press does
 *
 * STOCK IS A REAL MATERIAL, registered on first draw — the mechanism the Still's
 * stilled forms, the Crucible's alloys and the Infuser's infusions all use, and
 * for the same reason. It keeps its stone's shell, rarity and traits: a press
 * does not change what metal is, it changes what SHAPE the metal is in. So the
 * clone class cannot open here — stock is its stone's triple, and `stoneLike`
 * would have found it — which is why stock is `worked` and carries a form
 * instead of pretending to be a different stone.
 *
 * PILLAR 2. A draw is STRICTLY LOSSY IN UNITS (two in, one out), cannot raise a
 * rarity, cannot touch a currency, and there is no path from this file to
 * `cellCap`, `cellRegen` or `chipYield`.
 *
 * WHAT IS NOT CLAIMED: §13's "blocks every part from tier VII". The tool ladder
 * in this codebase does not gate a cast on a tier, so there is nothing to hang
 * that clause on yet; the Press blocks the three worked shapes, which is the
 * half that can be true today. Ledgered rather than asserted.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import {
  MATERIALS, bandOf, materialDef, registerMaterial,
  type MaterialDef, type PurityBand,
} from '../materials';
import { MATERIAL_TRAITS, traitsOf } from '../traits';
import { MAX_MACHINE_TIER, TIER_PART_COST, ensurePlant, noteBuiltOf, tierOf } from './plant';
import { machineSpeed } from './condition';
import { deliver } from './witness';
import { isLooted } from './roll';
import { allAuthoredStations } from '../content/rolls';
import type { PartShape } from '../content/forgeParts';
import { reservedBlocker } from './reserve';

/** The wreck it is found in — Verdance, Pressyard 120 (§6). */
export const PRESS_WRECK = 'THE PRESS';

/** How many units of stone one draw eats. Strictly more than it gives back. */
export const BILLET_UNITS = 2;

export type StockForm = 'plate' | 'rod' | 'wire';

export interface FormDef {
  id: StockForm;
  name: string;
  /** The tier that can draw it. */
  tier: number;
  /** The shape it is the only route to, and the part that shape belongs to. */
  shape: PartShape;
  blurb: string;
}

export const FORMS: FormDef[] = [
  {
    id: 'plate', name: 'Plate', tier: 1, shape: 'rolled',
    blurb: 'Rolled flat and even. It will make a core no pour can.',
  },
  {
    id: 'rod', name: 'Rod', tier: 2, shape: 'drawn',
    blurb: 'Pulled to length through a die. A handle wants exactly this.',
  },
  {
    id: 'wire', name: 'Wire', tier: 3, shape: 'wound',
    blurb: 'Drawn fine enough to wind. The hardest thing a press does.',
  },
];

export const FORM_BY_ID = new Map(FORMS.map((f) => [f.id, f]));

export const TIER_CAPABILITY_PRESS = [
  'not built',
  'plate — rolled flat',
  '...and rod, drawn to length',
  '...and wire, drawn fine',
] as const;

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

export function pressStation(): { shellId: string; depth: number; name: string } | null {
  const f = allAuthoredStations().find((s) => s.def.wreck === PRESS_WRECK);
  return f ? { shellId: f.shellId, depth: f.def.depth, name: f.def.name } : null;
}

export function pressFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === PRESS_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

export function pressBuilt(state: GameState): boolean {
  return tierOf(state, 'press') > 0;
}

/** The forms this Press can draw right now. §15.4 as capability. */
export function formsAvailable(state: GameState): FormDef[] {
  const t = tierOf(state, 'press');
  return FORMS.filter((f) => f.tier <= t);
}

export function nextPressTierCost(state: GameState): number | null {
  const t = tierOf(state, 'press');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildPress(state: GameState, ctx: EngineCtx): ActionResult {
  if (!pressFound(state)) {
    const at = pressStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Press.' };
  }
  const cost = nextPressTierCost(state);
  if (cost === null) return { ok: false, reason: 'The Press is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'press', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['press'] = tierOf(state, 'press') + 1;
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'press', tier: plant.tiers['press']! });
  return { ok: true, data: { tier: plant.tiers['press'] } };
}

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

export function stockId(materialId: string, form: StockForm): string {
  return `${materialId}_${form}`;
}

/** The form a material is stock of, or null if it is not stock at all. */
export function formOf(materialId: string): StockForm | null {
  for (const f of FORMS) if (materialId.endsWith(`_${f.id}`)) {
    return MATERIALS.some((m) => m.id === materialId) ? f.id : null;
  }
  return null;
}

/** Which stock form a worked shape demands, or null if it is an ordinary pour. */
export function formForShape(shape: PartShape | undefined): StockForm | null {
  if (!shape) return null;
  return FORMS.find((f) => f.shape === shape)?.id ?? null;
}

/**
 * STOCK IS ITS STONE, IN A SHAPE. Same shell, same rarity, same traits — a
 * press works metal, it does not transmute it. `worked: true` keeps it out of
 * every pool and every seam, and out of the clone check's population for the
 * same reason grog and sprue are: it is not a stone anybody could dig.
 */
export function registerStock(materialId: string, form: StockForm): MaterialDef | null {
  const id = stockId(materialId, form);
  const already = MATERIALS.find((m) => m.id === id);
  if (already) return already;
  const src = MATERIALS.find((m) => m.id === materialId);
  if (!src) return null;
  const def: MaterialDef = {
    id,
    name: `${src.name} ${FORM_BY_ID.get(form)!.name}`,
    shellId: src.shellId,
    rarity: src.rarity,
    palette: src.palette,
    facets: src.facets,
    shimmer: src.shimmer,
    flavor: `${src.name}, worked. ${FORM_BY_ID.get(form)!.blurb}`,
    worked: true,
  };
  registerMaterial(def);
  MATERIAL_TRAITS[id] = [...traitsOf(materialId)];
  return def;
}

export function pressBlocker(
  state: GameState, materialId: string, band: PurityBand, form: StockForm,
): string | null {
  if (!pressBuilt(state)) return 'The Press is not standing.';
  // RESERVE (§25.5) — asked FIRST, so "it is reserved" is what you are told.
  const reserved = reservedBlocker(state, materialId);
  if (reserved) return reserved;
  if (machineSpeed(state, 'press') <= 0) return 'It has cracked. Re-cast it before it will run.';
  const def = FORM_BY_ID.get(form);
  if (!def) return 'No such form.';
  if (!formsAvailable(state).some((f) => f.id === form)) {
    return `This Press draws ${formsAvailable(state).map((f) => f.name.toLowerCase()).join(' and ') || 'nothing'}. ${def.name} is a later tier.`;
  }
  let src: MaterialDef;
  try { src = materialDef(materialId); } catch { return 'No such stone.'; }
  if (formOf(materialId)) return `${src.name} has already been through the Press.`;
  const stack = state.materials.stacks[materialId]?.[band];
  if (!stack || stack.count < BILLET_UNITS) {
    return `A billet is ${BILLET_UNITS} units of ${src.name} at one band. You have ${stack?.count ?? 0}.`;
  }
  return null;
}

/**
 * DRAW IT. Two units in, one out — the loss is the working, and it is what
 * keeps a route that reaches shapes nothing else reaches from being the cheap
 * route as well as the good one.
 */
export function press(
  state: GameState, ctx: EngineCtx, materialId: string, band: PurityBand, form: StockForm,
): ActionResult {
  const blocked = pressBlocker(state, materialId, band, form);
  if (blocked) return { ok: false, reason: blocked };
  const perMat = state.materials.stacks[materialId]!;
  const stack = perMat[band]!;
  const purity = stack.puritySum / stack.count;
  stack.count -= BILLET_UNITS;
  stack.puritySum -= purity * BILLET_UNITS;
  if (stack.count <= 0) delete perMat[band];

  const def = registerStock(materialId, form);
  if (!def) return { ok: false, reason: 'It would not draw.' };
  const got = deliver(state, 'press', def.id, purity, 1);
  // A DRAW IS A CONVERSION, NOT A FIND.
  state.materials.totalDrops -= 1;
  ctx.emit({ type: 'pressed', materialId, form, into: got });
  ctx.dirty();
  return { ok: true, data: { into: got, band: bandOf(purity) } };
}

/**
 * WHAT IS ON THE BENCH — held stone this Press would draw, one row per stack.
 * LAW 3: what you HAVE, never a catalogue of every stone the machine will take.
 */
export function drawable(
  state: GameState,
): { materialId: string; name: string; band: PurityBand; count: number }[] {
  if (!pressBuilt(state)) return [];
  const out: { materialId: string; name: string; band: PurityBand; count: number }[] = [];
  for (const [materialId, perMat] of Object.entries(state.materials.stacks)) {
    if (formOf(materialId)) continue;
    for (const [band, stack] of Object.entries(perMat)) {
      if (!stack || stack.count < BILLET_UNITS) continue;
      out.push({
        materialId,
        name: (() => { try { return materialDef(materialId).name; } catch { return materialId; } })(),
        band: band as PurityBand,
        count: stack.count,
      });
    }
  }
  return out.sort((a, b) => b.count - a.count);
}

/** Stock this save is holding — the Codex line, and what the mould can use. */
export function stockHeld(state: GameState): { id: string; form: StockForm; count: number }[] {
  const out: { id: string; form: StockForm; count: number }[] = [];
  for (const [id, perMat] of Object.entries(state.materials.stacks)) {
    const form = formOf(id);
    if (!form) continue;
    const n = Object.values(perMat).reduce((a, s) => a + (s?.count ?? 0), 0);
    if (n > 0) out.push({ id, form, count: n });
  }
  return out;
}
