/**
 * THE AXIOM ENGINE — RULE EDITING (§13), in the wreck at The Author's Cut 16.
 *
 * §13: "rewrite a generation rule permanently · tiers XIV–XV". §6 names it a
 * KEYSTONE — "tiers XIV–XV unreachable" — and §21 has always said what the
 * reward is: "Axioms are rule rewrites, not multipliers."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MACHINE IS THE HALF THAT WAS MISSING, AND SO WAS THE OTHER HALF.
 *
 * `laws.ts` — 8 numeric slots, 14 flag slots, fourteen live choke points — has
 * had exactly one writer since Phase 10, and `registerLawContribution` had zero
 * callers. `content/axioms.ts` was deleted at A.7x and never replaced, so the
 * Axiom currency has banked at every Recursion into a layer that could not
 * spend it. See that file for the full measurement.
 *
 * So this machine is the VERB and `content/axioms.ts` is the CONTENT, and the
 * split is deliberate: `laws.ts` still imports nothing from content, exactly as
 * its own header requires.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * TIERS ARE CAPABILITY (§15.4) — three different sentences, never three sizes:
 *
 *   I    one rule a Recursion, and only rules this world has shown you
 *   II   ...and it says what a rule will change BEFORE you write it
 *   III  ...and a rule may be REDRAFTED once, and two written from one sitting
 *
 * THREE AND NOT FIVE, and that is a correction. §15.4's table says "every
 * machine runs I–V"; `MAX_MACHINE_TIER` is **3** and has been for the whole
 * project, which is why all twenty-two machines built before this one carry a
 * four-row ladder. A.97 wrote six rows here and two of them described tiers no
 * player could ever build. PILLARS: where a sentence disagrees with the code,
 * the code is right and the sentence is the bug.
 *
 * PILLAR 2 IS THE REASON THE HERESY IS NOT AUTHORED. One slot in `laws.ts`
 * multiplies the regen ceiling; it is marked a heresy there and it stays
 * writer-less this pass. Every Axiom the Engine can write is reach, retention,
 * routing or direction, and `axioms.test.ts` writes all fourteen and reads
 * `dpsMax` unmoved at the same depth in both arms.
 *
 * LAW 9 — NO TOLLS, and this is why §13's "blocks tiers XIV–XV" is NOT
 * enforced here. `maxToolTier` is `3 × shell ordinal`, so a Cinder player
 * already forges XIV and XV, and has for the whole life of the project.
 * Capping that behind an Aleph wreck would put a construction event in front of
 * shipped work — the exact shape of the ruling this brief made about the Rune
 * Bench. Measured and ledgered rather than re-authored.
 */
import { D } from '../decimal';
import type { ActionResult, EngineCtx, GameState } from '../types';
import { AXIOMS, AXIOM_BY_ID, type AxiomDef } from '../content/axioms';
import { MAX_MACHINE_TIER, TIER_PART_COST, ensurePlant, noteBuiltOf, tierOf } from './plant';
import { conditionOf } from './condition';
import { isLooted } from './roll';
import { allAuthoredStations } from '../content/rolls';
import { getCurrency, spendCurrency } from '../resources';

/** The wreck it is found in — Aleph, The Author's Cut 16. Authored with §6. */
export const AXIOM_WRECK = 'THE AXIOM ENGINE';

export const TIER_CAPABILITY_AXIOM = [
  'not built',
  'one rule a Recursion, and only rules this world has shown you',
  '...and it says what a rule will change before you write it',
  '...and a rule may be redrafted once, and two written from one sitting',
] as const;

export interface AxiomEngineState {
  /** Rules written this Recursion — the redraft budget is per Recursion. */
  writtenThisRecursion: number;
  /** Has the one redraft been spent? Tier III only. */
  redrafted: boolean;
  /** The Recursion the counters above belong to. */
  countedAt: number;
}

export function defaultAxiomEngineState(): AxiomEngineState {
  return { writtenThisRecursion: 0, redrafted: false, countedAt: 0 };
}

export function ensureAxiomEngine(state: GameState): AxiomEngineState {
  const a = (state.axiomEngine ??= defaultAxiomEngineState());
  a.writtenThisRecursion ??= 0;
  a.redrafted ??= false;
  a.countedAt ??= 0;
  // A Recursion resets the sitting. Detected rather than hooked, so no reset
  // path has to remember this machine exists.
  const now = state.recursion?.count ?? 0;
  if (a.countedAt !== now) {
    a.countedAt = now;
    a.writtenThisRecursion = 0;
    a.redrafted = false;
  }
  return a;
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

export function axiomStation(): { shellId: string; depth: number; name: string } | null {
  const f = allAuthoredStations().find((s) => s.def.wreck === AXIOM_WRECK);
  return f ? { shellId: f.shellId, depth: f.def.depth, name: f.def.name } : null;
}

export function axiomEngineFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === AXIOM_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

export function axiomEngineBuilt(state: GameState): boolean {
  return tierOf(state, 'axiomEngine') > 0;
}

/** Tier II: the Engine says what a rule changes before you commit to it. */
export function showsTheChange(state: GameState): boolean {
  return tierOf(state, 'axiomEngine') >= 2;
}

/** Tier III: one written rule may be taken back per Recursion. */
export function canRedraft(state: GameState): boolean {
  return tierOf(state, 'axiomEngine') >= MAX_MACHINE_TIER;
}

/** Rules this Engine will write in one Recursion. The last tier writes two. */
export function sittingLimit(state: GameState): number {
  const t = tierOf(state, 'axiomEngine');
  if (t <= 0) return 0;
  return t >= MAX_MACHINE_TIER ? 2 : 1;
}

export function nextAxiomTierCost(state: GameState): number | null {
  const t = tierOf(state, 'axiomEngine');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildAxiomEngine(state: GameState, ctx: EngineCtx): ActionResult {
  if (!axiomEngineFound(state)) {
    const at = axiomStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Engine.' };
  }
  const cost = nextAxiomTierCost(state);
  if (cost === null) return { ok: false, reason: 'The Engine is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'axiomEngine', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['axiomEngine'] = tierOf(state, 'axiomEngine') + 1;
  ensureAxiomEngine(state);
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'axiomEngine', tier: plant.tiers['axiomEngine']! });
  return { ok: true, data: { tier: plant.tiers['axiomEngine'] } };
}

// ---------------------------------------------------------------------------
// Writing a rule
// ---------------------------------------------------------------------------

export function owned(state: GameState): string[] {
  return state.recursion?.axioms ?? [];
}

/**
 * THE MENU. Only rules this world has shown you — §31.2's own rule for the
 * Casting Floor's defects ("a defect you don't care about is never on the
 * menu"), applied here because it is the same problem: fourteen rules about
 * systems you have not met is a spoiler, not a choice.
 */
export function offered(state: GameState): AxiomDef[] {
  if (!axiomEngineBuilt(state)) return [];
  return AXIOMS.filter((a) => a.shown(state));
}

export function writeBlocker(state: GameState, id: string): string | null {
  const def = AXIOM_BY_ID.get(id);
  if (!def) return 'No such rule.';
  if (!axiomEngineBuilt(state)) return 'The Engine is not standing.';
  if (conditionOf(state, 'axiomEngine')?.seized) return 'The type has cracked. Re-cast it.';
  if (owned(state).includes(id)) return 'It is already true.';
  if (!def.shown(state)) return 'This world has not shown you the thing that rule is about.';
  const a = ensureAxiomEngine(state);
  if (a.writtenThisRecursion >= sittingLimit(state)) {
    return sittingLimit(state) === 1
      ? 'One rule a Recursion. A deeper Engine writes two.'
      : 'Two is all it writes in one Recursion.';
  }
  const have = getCurrency(state, 'axiom');
  if (have.lt(def.cost)) {
    return `It costs ${def.cost} Axiom${def.cost === 1 ? '' : 's'}. You have ${Math.floor(have.toNumber())}.`;
  }
  return null;
}

/**
 * WRITE IT. Permanent — `state.recursion.axioms` rides every reset but the
 * Spiral, which washes the laws on purpose and always has.
 */
export function writeRule(state: GameState, ctx: EngineCtx, id: string): ActionResult {
  const blocked = writeBlocker(state, id);
  if (blocked) return { ok: false, reason: blocked };
  const def = AXIOM_BY_ID.get(id)!;
  spendCurrency(state, 'axiom', D(def.cost));
  state.recursion.axioms = [...owned(state), id];
  const a = ensureAxiomEngine(state);
  a.writtenThisRecursion += 1;
  ctx.dirty();
  ctx.emit({ type: 'ruleWritten', axiomId: id, owned: state.recursion.axioms.length });
  return { ok: true, data: { axiomId: id, owned: state.recursion.axioms.length } };
}

export function redraftBlocker(state: GameState, id: string): string | null {
  if (!canRedraft(state)) return 'This Engine does not take a rule back. A deeper one does.';
  if (!owned(state).includes(id)) return 'That rule is not written.';
  if (ensureAxiomEngine(state).redrafted) return 'One redraft a Recursion, and it is spent.';
  return null;
}

/**
 * THE REDRAFT (tier III). Un-write one rule and take the Axioms back. It is
 * ONCE per Recursion, which is what keeps a permanent decision permanent while
 * refusing to punish the one that was read wrong.
 */
export function redraft(state: GameState, ctx: EngineCtx, id: string): ActionResult {
  const blocked = redraftBlocker(state, id);
  if (blocked) return { ok: false, reason: blocked };
  const def = AXIOM_BY_ID.get(id)!;
  state.recursion.axioms = owned(state).filter((x) => x !== id);
  state.currencies['axiom'] = getCurrency(state, 'axiom').add(def.cost);
  const a = ensureAxiomEngine(state);
  a.redrafted = true;
  a.writtenThisRecursion = Math.max(0, a.writtenThisRecursion - 1);
  ctx.dirty();
  ctx.emit({ type: 'ruleWritten', axiomId: id, owned: state.recursion.axioms.length });
  return { ok: true, data: { axiomId: id, returned: def.cost } };
}

// ---------------------------------------------------------------------------
// What the panel says — the UI computes nothing
// ---------------------------------------------------------------------------

export interface RuleRow {
  id: string;
  name: string;
  rule: string;
  flavor: string;
  cost: number;
  slot: string;
  written: boolean;
  /** Tier II: what it will change, said before you commit. Null below tier II. */
  preview: string | null;
  waiting: string | null;
}

export function axiomRead(state: GameState): {
  built: boolean; tier: number; capability: string;
  axioms: number; written: number; sitting: number; redraftLeft: boolean;
  rows: RuleRow[]; hidden: number;
} {
  const built = axiomEngineBuilt(state);
  const tier = tierOf(state, 'axiomEngine');
  const menu = offered(state);
  const a = built ? ensureAxiomEngine(state) : defaultAxiomEngineState();
  return {
    built, tier,
    capability: TIER_CAPABILITY_AXIOM[Math.min(tier, MAX_MACHINE_TIER)] ?? '',
    axioms: Math.floor(getCurrency(state, 'axiom').toNumber()),
    written: owned(state).length,
    sitting: sittingLimit(state),
    redraftLeft: canRedraft(state) && !a.redrafted,
    hidden: AXIOMS.length - menu.length,
    rows: menu.map((d) => ({
      id: d.id, name: d.name, rule: d.rule, flavor: d.flavor,
      cost: d.cost, slot: d.slot,
      preview: showsTheChange(state) ? d.rule : null,
      written: owned(state).includes(d.id),
      waiting: owned(state).includes(d.id) ? null : writeBlocker(state, d.id),
    })),
  };
}
