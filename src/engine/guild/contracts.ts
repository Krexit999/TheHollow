/**
 * THE CONTRACTS BOARD — jobs generated against the player's CURRENT shell,
 * gear, depth, and spawn pool, so a good contract reads as "I was going to
 * do that anyway, and now it pays."
 *
 * Anti-patterns honored structurally: contracts never expire, never tick a
 * timer, rotate only on completion or a free player reroll.
 */
import { D } from '../decimal';
import type { ActionResult, Contract, ContractKind, EngineCtx, GameState } from '../types';
import { addCurrency } from '../resources';
import { currentShell, maxToolTier } from '../shells';
import { materialDef } from '../materials';
import { consumeMaterial, equippedTool, materialCount } from '../systems/forge';
import { rollSpecies, speciesDef, tierAffinity } from '../combat/species';
import { crucibleUnlocked } from '../content/shell2/crucibleSystem';
import { repAdd } from './guild';
import type { ModifierCache } from '../modifiers';

/** Issuers by job kind — contracts come from PEOPLE. */
const ISSUERS: Record<ContractKind, string[]> = {
  deliver: ['vess', 'marrow', 'anders'],
  cull: ['ashka', 'ruta'],
  depth: ['prill', 'brakka'],
  forge: ['marrow', 'nock'],
  pour: ['brine'],
  chain: ['magda'],
  geode: ['fenn'],
  assay: ['tally', 'prill'],
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Generate one contract against the live state. Null only if nothing fits. */
/**
 * A contract's identity AS THE PLAYER READS IT. `id` is a sequence number, so
 * two pegs can be byte-identical on the board while being distinct to the code
 * — worst for kinds whose target is deterministic (a `forge` job is always
 * "next tier", so every one generated in the same moment matches). The board
 * dedupes on this, not on id.
 */
export function contractIdentity(c: Contract): string {
  return [c.kind, c.npcId, c.target, c.materialId ?? '', c.speciesId ?? ''].join('|');
}

/** Identities currently posted, so a refill never repeats a neighbour. */
function boardIdentities(state: GameState): Set<string> {
  const out = new Set<string>();
  for (const c of state.guild.contracts.board) if (c) out.add(contractIdentity(c));
  return out;
}

export function generateContract(
  state: GameState,
  presentNpcIds: Set<string>,
  /** Identities already on the board; a match is rerolled, not posted. */
  avoid?: Set<string>,
): Contract | null {
  // The generator is random per call, so retrying is the whole mechanism.
  // Bounded: if the space is genuinely exhausted (one issuer, one kind, one
  // deterministic target) we leave the peg empty and try again next tick
  // rather than posting a visible twin.
  if (avoid && avoid.size > 0) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const c = generateOne(state, presentNpcIds);
      if (!c) return null;
      if (!avoid.has(contractIdentity(c))) return c;
    }
    return null;
  }
  return generateOne(state, presentNpcIds);
}

function generateOne(state: GameState, presentNpcIds: Set<string>): Contract | null {
  const shell = currentShell(state);
  const toolTier = equippedTool(state).tier;
  const kinds: ContractKind[] = [];

  // Which kinds make sense RIGHT NOW.
  if (state.assay.knownMaterials.some((id) => canAsk(state, id))) kinds.push('deliver', 'deliver');
  if (state.combat.stats.encounters > 0) kinds.push('cull', 'cull');
  if ((state.depthRecords[shell.id] ?? 0) < shell.floorDepth) kinds.push('depth');
  if (maxToolTier(state) > bestToolTier(state)) kinds.push('forge');
  if (crucibleUnlocked(state)) kinds.push('pour');
  if (shell.id === 'ferrite' && state.polarity.bestChain >= 3 && state.polarity.bestChain < 12) kinds.push('chain');
  if (state.materials.geodes >= 1 || state.materials.geodesCracked >= 1) kinds.push('geode');
  if (state.assay.surveysDone >= 1) kinds.push('assay');
  if (kinds.length === 0) return null;

  // Prefer kinds whose issuer is actually in the hall.
  const usable = kinds.filter((k) => ISSUERS[k].some((n) => presentNpcIds.has(n)));
  const kind = pick(usable.length > 0 ? usable : kinds);
  const npcId = pick(ISSUERS[kind].filter((n) => presentNpcIds.has(n)));
  if (!npcId) return null;

  const seq = state.guild.contracts.seq++;
  const base: Omit<Contract, 'kind' | 'desc' | 'target' | 'scrip' | 'renown'> = {
    id: seq, npcId, base: 0, accepted: false,
  };

  switch (kind) {
    case 'deliver': {
      const pool = state.assay.knownMaterials.filter((id) => canAsk(state, id));
      const materialId = pick(pool);
      const def = materialDef(materialId);
      // Counts sit under the hawker's keep-line so an auto-selling crew can
      // never sell a contract out from under you.
      const count = def.rarity === 'common' ? 14 + Math.floor(Math.random() * 10)
        : def.rarity === 'rich' ? 8 + Math.floor(Math.random() * 6)
        : 5 + Math.floor(Math.random() * 4);
      const scrip = Math.round(count * (def.rarity === 'common' ? 1.6 : def.rarity === 'rich' ? 3 : 7));
      return {
        ...base, kind, materialId, target: count, scrip, renown: 3,
        desc: `Bring ${count} ${def.name} to ${npcId === 'vess' ? 'Vess' : npcId === 'marrow' ? 'Marrow — clean lots only' : 'Cold Anders'}.`,
      };
    }
    case 'cull': {
      // Only species the player would actually meet AND can handle.
      const candidates = new Set<string>();
      for (let i = 0; i < 24; i++) {
        const sp = rollSpecies(shell.id, state.depth, Math.random, toolTier);
        if (sp && tierAffinity(sp.tier, toolTier) >= 0.2) candidates.add(sp.id);
      }
      if (candidates.size === 0) return null;
      const speciesId = pick([...candidates]);
      const sp = speciesDef(speciesId);
      const overTier = sp.tier > toolTier;
      const count = overTier ? 2 : 4 + Math.floor(Math.random() * 5);
      return {
        ...base, kind, speciesId, target: count,
        base: state.combat.kills[speciesId] ?? 0,
        scrip: Math.round(count * (6 + sp.tier * 3) * (overTier ? 1.6 : 1)), renown: 4,
        desc: `Cull ${count} ${sp.name}${count > 1 && !sp.name.endsWith('s') ? 's' : ''} for ${npcId === 'ashka' ? 'Ashka' : 'Ruta'}.`,
      };
    }
    case 'depth': {
      const record = state.depthRecords[shell.id] ?? 0;
      const target = Math.min(shell.floorDepth, record + 10 + Math.floor(Math.random() * 16));
      return {
        ...base, kind, target, scrip: 30 + Math.round(target / 4), renown: 5,
        desc: `Push ${shell.name} to depth ${target} in a single run — ${npcId === 'prill' ? 'Prill wants the map' : 'Brakka wants the bore-line'}.`,
      };
    }
    case 'forge': {
      const target = bestToolTier(state) + 1;
      return {
        ...base, kind, target, scrip: 25 + target * 15, renown: 5,
        desc: `Forge a Tier ${'I'.repeat(Math.min(3, target)) || target}${target > 3 ? `(${target})` : ''} tool. ${npcId === 'marrow' ? 'Marrow will be checking the purity.' : 'Nock wants to fit its counterweight.'}`,
      };
    }
    case 'pour': {
      const target = 2 + Math.floor(Math.random() * 3);
      return {
        ...base, kind, target, base: state.crucible.pours,
        scrip: 20 + target * 12, renown: 4,
        desc: `Run ${target} pours through the Crucible — true or slag, Brine reads them all.`,
      };
    }
    case 'chain': {
      const target = Math.min(12, state.polarity.bestChain + 2);
      return {
        ...base, kind, target, scrip: 15 + target * 8, renown: 4,
        desc: `Ride a polarity chain to ${target}. Magda swears the rails will sing.`,
      };
    }
    case 'geode': {
      const target = 2 + Math.floor(Math.random() * 3);
      return {
        ...base, kind, target, base: state.materials.geodesCracked,
        scrip: target * 18, renown: 3,
        desc: `Crack ${target} geodes at Fenn's bench. She wants to hear them first.`,
      };
    }
    case 'assay': {
      const target = 2 + Math.floor(Math.random() * 2);
      return {
        ...base, kind, target, base: state.assay.surveysDone,
        scrip: target * 22, renown: 3,
        desc: `Complete ${target} assay surveys — Tally is rebuilding the depth ledger.`,
      };
    }
  }
}

function canAsk(state: GameState, materialId: string): boolean {
  try {
    const def = materialDef(materialId);
    return (
      def.shellId === currentShell(state).id &&
      !def.source &&
      (def.rarity === 'common' || def.rarity === 'rich' || def.rarity === 'pure')
    );
  } catch {
    return false;
  }
}

function bestToolTier(state: GameState): number {
  return state.forge.tools.reduce((a, t) => Math.max(a, t.tier), 0);
}

/** Progress toward a contract, for the UI and completion check. */
export function contractProgress(state: GameState, c: Contract): { have: number; need: number } {
  switch (c.kind) {
    case 'deliver':
      return { have: Math.min(materialCount(state, c.materialId!), c.target), need: c.target };
    case 'cull':
      return { have: Math.min((state.combat.kills[c.speciesId!] ?? 0) - c.base, c.target), need: c.target };
    case 'depth':
      return { have: Math.min(state.depth, c.target), need: c.target };
    case 'forge':
      return { have: bestToolTier(state) >= c.target ? 1 : 0, need: 1 };
    case 'pour':
      return { have: Math.min(state.crucible.pours - c.base, c.target), need: c.target };
    case 'chain':
      return { have: Math.min(state.polarity.bestChain, c.target), need: c.target };
    case 'geode':
      return { have: Math.min(state.materials.geodesCracked - c.base, c.target), need: c.target };
    case 'assay':
      return { have: Math.min(state.assay.surveysDone - c.base, c.target), need: c.target };
  }
}

export function contractSatisfied(state: GameState, c: Contract): boolean {
  const p = contractProgress(state, c);
  return p.have >= p.need;
}

export function acceptContract(state: GameState, slot: number): ActionResult {
  const c = state.guild.contracts.board[slot];
  if (!c) return { ok: false, reason: 'Empty peg' };
  if (c.accepted) return { ok: false, reason: 'Already yours' };
  // Re-baseline counters at the moment of acceptance.
  if (c.kind === 'cull') c.base = state.combat.kills[c.speciesId!] ?? 0;
  if (c.kind === 'pour') c.base = state.crucible.pours;
  if (c.kind === 'geode') c.base = state.materials.geodesCracked;
  if (c.kind === 'assay') c.base = state.assay.surveysDone;
  c.accepted = true;
  return { ok: true };
}

export function completeContract(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  slot: number,
  presentNpcIds: Set<string>,
): ActionResult {
  const c = state.guild.contracts.board[slot];
  if (!c) return { ok: false, reason: 'Empty peg' };
  if (!c.accepted) return { ok: false, reason: 'Take the job first' };
  if (!contractSatisfied(state, c)) return { ok: false, reason: 'Not finished yet' };
  if (c.kind === 'deliver') {
    if (materialCount(state, c.materialId!) < c.target) return { ok: false, reason: 'Short on goods' };
    consumeMaterial(state, c.materialId!, c.target);
  }
  const scrip = Math.round(c.scrip * mods.get(state, 'scripGain').toNumber());
  addCurrency(state, 'scrip', D(scrip));
  addCurrency(state, 'renown', D(c.renown));
  repAdd(state, ctx, c.npcId, 8);
  state.guild.contracts.completed += 1;
  state.guild.contracts.board[slot] = null; // clear first: don't avoid yourself
  state.guild.contracts.board[slot] = generateContract(state, presentNpcIds, boardIdentities(state));
  ctx.dirty();
  ctx.emit({ type: 'contractDone', id: c.id, npcId: c.npcId, scrip });
  return { ok: true, data: { scrip } };
}

/** Free, no cooldown, no penalty, and "forget it" applies even to accepted
 * jobs — contracts rotate when completed or when the PLAYER chooses, never
 * on a timer. Walking away costs nothing but the work already done. */
export function rerollContract(state: GameState, slot: number, presentNpcIds: Set<string>): ActionResult {
  if (slot < 0 || slot >= state.guild.contracts.slots) return { ok: false, reason: 'No such peg' };
  state.guild.contracts.board[slot] = null; // clear first: don't avoid yourself
  state.guild.contracts.board[slot] = generateContract(state, presentNpcIds, boardIdentities(state));
  return { ok: true };
}

/** Keep the board full (called from the guild tick). */
export function refillBoard(state: GameState, presentNpcIds: Set<string>): void {
  const { board, slots } = state.guild.contracts;
  while (board.length < slots) board.push(null);
  // Track identities as we go so two pegs filled in the SAME pass can't twin
  // each other either.
  const taken = boardIdentities(state);
  for (let i = 0; i < slots; i++) {
    if (board[i]) continue;
    const c = generateContract(state, presentNpcIds, taken);
    if (!c) continue;
    board[i] = c;
    taken.add(contractIdentity(c));
  }
}
