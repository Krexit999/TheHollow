/**
 * THE CIRCUIT — E3, THE CIRCUIT READS THE WORLD (§7.3, §25.3).
 *
 * A machine gains a CONDITION STRIP: up to four `WHEN <state> → <action>` rows,
 * evaluated top-down, first match wins. §25.3 draws those states from the
 * machine; §7.3 widens the vocabulary to the FACE and the STATION, which is the
 * whole point — the Roll re-rolls its contents at every Collapse (§1.1), so a
 * strip you wrote against a world you understood now runs against one you did
 * not author. The interaction between an authored circuit and an unauthored
 * band is unpredictable to the player who wrote it. That is the emergence.
 *
 * WHAT THIS IS NOT, and the line is load-bearing:
 *
 *   PILLAR 2. Every action in this file is a control a player can already reach
 *   by hand — the damper, a fuel, a drill's behaviour, a drill's priority, the
 *   Crusher's trigger. The Circuit decides WHEN they are thrown, never what
 *   they are worth. There is no path from anything here to `cellCap`,
 *   `cellRegen` or `chipYield`, so `dpsMax = W·H·regen·Y` cannot move, and
 *   `circuit.test.ts` asserts it with a full strip live at a fixed depth.
 *
 *   LAW 9. The gate is a condition done once, never a count: the Kiln standing
 *   and one drill ROUTED BY HAND. You may only delegate a decision you have
 *   made yourself — which is §25.1's "automation moves the decision one level
 *   up" stated as a door rather than as a slogan.
 *
 *   LAW 3. The vocabulary is not a browser of everything the Circuit will ever
 *   read. A read whose SOURCE does not exist in this shell is not listed, and a
 *   machine you have not built contributes no actions. Every read prints what
 *   it says RIGHT NOW beside itself, so the strip is written against a world
 *   you can see rather than against a manual.
 *
 * A READ THAT CANNOT CHANGE AN ACTION IS A READOUT, NOT A CIRCUIT. Each read
 * below is therefore paired, in the tests, with two world states Loam can
 * actually produce that select different rows.
 */
import type { EngineCtx, GameState } from '../types';
import type { ModifierCache } from '../modifiers';
import { materialDef } from '../materials';
import { KILN_FUELS } from '../content/kilnFuel';
import { cellCap } from './face';
import { contentsOf, shellRoll, typeOf } from './roll';
import { crush, crushable, crusherBuilt } from './crusher';
import { surgeCap } from './plant';
import { ensureSorting, filterSentence, filterable, sieveBuilt } from './sieve';
import { ensureLine, lineBuilt, runLine } from './line';
import {
  CONDITION_BITE, CONDITION_RULES, conditionLine, conditionOf, ruleFor,
} from './condition';
import { currentShell } from '../shells';
import type { StationType } from '../content/shell1/roll';

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export type MachineId = 'kiln' | 'bay' | 'crusher' | 'line';
export const CIRCUIT_MACHINES: MachineId[] = ['kiln', 'bay', 'crusher', 'line'];

export const MACHINE_LABEL: Record<MachineId, string> = {
  kiln: 'The Kiln',
  bay: 'The Drill Bay',
  crusher: 'The Crusher',
  line: 'The Line',
};

/**
 * FOUR ROWS, and §25.3 is explicit about why: small enough to hold in your head
 * and large enough to produce behaviour you did not intend.
 */
export const MAX_ROWS = 4;

/** How often the strips are read. One second — the same block confluences use. */
export const CIRCUIT_PERIOD_SEC = 1;

export type CircuitOp = 'is' | 'isnt' | 'gt' | 'lt';

export interface CircuitRow {
  read: string;
  op: CircuitOp;
  /** Enum reads carry the option value; number reads carry the threshold. */
  value: string | number;
  act: string;
}

export interface CircuitState {
  /** The gate, latched. Once open it never closes (see `circuitGateOpen`). */
  opened: boolean;
  strips: Record<string, CircuitRow[]>;
  /** machineId -> per-row count of times that row WON the strip. */
  fires: Record<string, number[]>;
  /** machineId -> times the winning row actually CHANGED the world. */
  acts: Record<string, number>;
  /** machineId -> times the winning row changed from one read to the next. */
  flips: Record<string, number>;
  /** machineId -> which row won last time. -1 = none matched. */
  last: Record<string, number>;
  clock: number;
}

export function defaultCircuitState(): CircuitState {
  return { opened: false, strips: {}, fires: {}, acts: {}, flips: {}, last: {}, clock: 0 };
}

export function ensureCircuit(state: GameState): CircuitState {
  const c = (state.circuit ??= defaultCircuitState());
  c.strips ??= {};
  c.fires ??= {};
  c.acts ??= {};
  c.flips ??= {};
  c.last ??= {};
  if (typeof c.clock !== 'number' || Number.isNaN(c.clock)) c.clock = 0;
  return c;
}

export function stripOf(state: GameState, machine: MachineId): CircuitRow[] {
  return ensureCircuit(state).strips[machine] ?? [];
}

// ---------------------------------------------------------------------------
// THE GATE (LAW 9)
// ---------------------------------------------------------------------------

/**
 * YOU MAY ONLY DELEGATE A DECISION YOU HAVE MADE YOURSELF.
 *
 * The condition, done once: the Kiln is standing (so there is a machine with a
 * damper worth throwing) and at least one drill has been routed off its default
 * by hand — a behaviour or a priority set deliberately. Not "route ten drills";
 * routing ONE is the whole proof, because the thing being proved is that you
 * know the decision exists.
 *
 * Latched by `tickCircuit`, so undoing the routing afterwards does not take the
 * Circuit away — a gate that closes behind you is a toll with extra steps.
 */
export function circuitGateOpen(state: GameState): boolean {
  if (!state.kiln.built) return false;
  return state.drills.units.some((d) => d.behavior !== undefined || d.priority !== undefined);
}

export function circuitUnlocked(state: GameState): boolean {
  return ensureCircuit(state).opened || circuitGateOpen(state);
}

// ---------------------------------------------------------------------------
// WHERE YOU ARE — the station the reads are taken at
// ---------------------------------------------------------------------------

/**
 * THE STATION YOU ARE STANDING IN: the deepest one at or above your depth.
 *
 * Deliberately NOT "the nearest station", which would let a strip read a place
 * you have not reached yet and turn the Circuit into a prospecting tool the
 * Assay Bench already is (§1, LEGIBLE_AHEAD). You have walked past everything
 * this can see.
 */
export function stationHere(state: GameState): { id: string; name: string; type: StationType } | null {
  let best: { id: string; name: string; type: StationType; depth: number } | null = null;
  for (const def of shellRoll(state)) {
    if (def.depth > state.depth) continue;
    if (!best || def.depth > best.depth) {
      best = { id: def.id, name: def.name, type: typeOf(state, def), depth: def.depth };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// THE READS
// ---------------------------------------------------------------------------

export interface ReadDef {
  id: string;
  /** Reads as the left half of a sentence: "WHEN <label> is ...". */
  label: string;
  kind: 'enum' | 'number';
  /** enum only. */
  options?: (state: GameState) => { value: string; label: string }[];
  /** number only: the slider bound and what the number means. */
  max?: number;
  unit?: string;
  /** Is its SOURCE in the game for this player, right now? */
  avail: (state: GameState) => boolean;
  /**
   * `machine` is the strip's OWN machine. Every read before A.90 was about the
   * world and ignored it; E2's condition read is the first that is about the
   * thing being told what to do, which is why the parameter exists at all.
   */
  read: (state: GameState, mods: ModifierCache, machine: MachineId) => string | number;
  /** What it says right now, in words. */
  now: (state: GameState, mods: ModifierCache, machine: MachineId) => string;
}

const STATION_TYPES: StationType[] = ['seam', 'wall', 'wreck', 'works', 'chamber', 'hazard', 'rest', 'floor', 'flood'];
const STATION_LABEL: Record<StationType, string> = {
  seam: 'a seam', wall: 'a wall', wreck: 'a wreck', works: 'a works',
  chamber: 'a chamber', hazard: 'a hazard', rest: 'a rest', floor: 'the floor',
  flood: 'a place that will take the heat',
};

/** Every material any station in this shell can be holding. */
function seamOptions(state: GameState): { value: string; label: string }[] {
  const ids = new Set<string>();
  for (const def of shellRoll(state)) for (const s of def.seams ?? []) ids.add(s);
  return [...ids]
    .map((id) => ({ value: id, label: materialDef(id).name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function hazardHere(state: GameState): number {
  const st = stationHere(state);
  return st ? contentsOf(state, st.id).hazard : 0;
}

function faceCharge(state: GameState, mods: ModifierCache): number {
  const cells = state.face.cells;
  if (!cells || cells.length === 0) return 0;
  const cap = cellCap(state, mods);
  if (cap <= 0) return 0;
  const sum = cells.reduce((n, c) => n + c, 0);
  return Math.round((sum / (cells.length * cap)) * 100);
}

function peakCompaction(state: GameState): number {
  const c = state.face.compaction;
  if (!c || c.length === 0) return 0;
  let hi = 0;
  for (const v of c) if (v > hi) hi = v;
  return Math.round(hi);
}

/**
 * THE VOCABULARY LOAM CAN ACTUALLY SUPPLY.
 *
 * §7.3 sketches four lines and three of them name systems this build does not
 * have — grain, the Sieve's abrasive, the Press. Those are CUT rather than
 * stubbed (a name against no mechanism is the deceptive stub PILLARS warns
 * about); the cut list and what would have to exist first is in the phase
 * report and the ledger.
 *
 * What is left is six reads, and every one of them moves under the player:
 * three from the world (the Roll re-rolls at every Collapse), one from the face
 * (compaction is a resource you spend), two from the plant.
 */
export const READS: ReadDef[] = [
  {
    id: 'seam',
    label: 'the seam here',
    kind: 'enum',
    options: seamOptions,
    // Only where the shell has an authored Roll. Ferrite has none, so a Ferrite
    // player is not offered a read that would answer "nothing" forever.
    avail: (s) => shellRoll(s).length > 0,
    read: (s) => {
      const st = stationHere(s);
      return st ? contentsOf(s, st.id).seam : '';
    },
    now: (s) => {
      const st = stationHere(s);
      const seam = st ? contentsOf(s, st.id).seam : '';
      return seam ? materialDef(seam).name : 'nothing';
    },
  },
  {
    id: 'station',
    label: 'the station here',
    kind: 'enum',
    options: () => STATION_TYPES.map((t) => ({ value: t, label: STATION_LABEL[t] })),
    avail: (s) => shellRoll(s).length > 0,
    read: (s) => stationHere(s)?.type ?? '',
    now: (s) => {
      const st = stationHere(s);
      return st ? `${st.name} — ${STATION_LABEL[st.type]}` : 'nowhere named';
    },
  },
  {
    id: 'hazard',
    label: 'the hazard here',
    kind: 'number',
    max: 3,
    unit: '',
    avail: (s) => shellRoll(s).length > 0,
    read: (s) => hazardHere(s),
    now: (s) => (hazardHere(s) > 0 ? `intensity ${hazardHere(s)}` : 'none here'),
  },
  {
    id: 'depth',
    label: 'depth',
    kind: 'number',
    max: 150,
    unit: 'm',
    avail: () => true,
    read: (s) => s.depth,
    now: (s) => `${s.depth}m`,
  },
  {
    id: 'compaction',
    label: 'the packed rock',
    kind: 'number',
    max: 26,
    unit: '',
    avail: () => true,
    read: (s) => peakCompaction(s),
    now: (s) => `${peakCompaction(s)} at its worst`,
  },
  {
    id: 'charge',
    label: 'the face',
    kind: 'number',
    max: 100,
    unit: '%',
    avail: () => true,
    read: (s, m) => faceCharge(s, m),
    now: (s, m) => `${faceCharge(s, m)}% full`,
  },
  {
    id: 'heat',
    label: 'the kiln heat',
    kind: 'number',
    max: 100,
    unit: '%',
    avail: (s) => s.kiln.built,
    read: (s) => Math.round(s.kiln.heat * 100),
    now: (s) => `${Math.round(s.kiln.heat * 100)}%`,
  },
  {
    id: 'surge',
    label: 'the Surge bank',
    kind: 'number',
    max: 100,
    unit: '%',
    avail: (s) => s.kiln.built,
    read: (s) => surgePct(s),
    now: (s) => `${surgePct(s)}%`,
  },
  {
    /**
     * E2's READ (§7.2, and the one A.85 had to cut). The ONLY read in the
     * vocabulary that is about the machine carrying the strip rather than about
     * the world — which is what makes it useful: "WHEN this machine is
     * magnetised → take rock and ore alike" is a rule you write once and that
     * fires in Ferrite and nowhere else, without naming Ferrite.
     *
     * It is listed only in a shell that HAS a rule, because a read that will
     * answer "nothing is wrong with it" forever is a readout (LAW 3). All seven
     * shells have one, so in practice it is always there — and the guard is what
     * keeps that honest rather than assumed.
     */
    id: 'condition',
    label: 'this machine',
    kind: 'enum',
    options: () => [
      { value: 'none', label: 'in good order' },
      ...CONDITION_RULES.map((r) => ({ value: r.id, label: r.label.toLowerCase() })),
      { value: 'seized', label: 'cracked and stopped' },
    ],
    avail: (s) => ruleFor(currentShell(s).id) !== undefined,
    read: (s, _m, machine) => {
      const c = conditionOf(s, machine);
      if (!c) return 'none';
      if (c.seized) return 'seized';
      return c.level >= CONDITION_BITE ? c.id : 'none';
    },
    now: (s, _m, machine) => conditionLine(s, machine) ?? 'in good order',
  },
];

function surgePct(state: GameState): number {
  const cap = surgeCap(state);
  if (cap <= 0) return 0;
  return Math.round(((state.plant?.surge ?? 0) / cap) * 100);
}

export function readDef(id: string): ReadDef | undefined {
  return READS.find((r) => r.id === id);
}

export function availableReads(state: GameState): ReadDef[] {
  return READS.filter((r) => r.avail(state));
}

// ---------------------------------------------------------------------------
// THE ACTIONS
// ---------------------------------------------------------------------------

export interface ActDef {
  id: string;
  machine: MachineId;
  /** Reads as the right half: "→ <label>". */
  label: string;
  avail: (state: GameState) => boolean;
  /** True when the world is ALREADY in this state — so a firing row that
   *  changes nothing is counted as a fire and not as an act. */
  holds: (state: GameState) => boolean;
  apply: (state: GameState, ctx: EngineCtx, mods: ModifierCache) => boolean;
}

/**
 * WHAT A LOAM CIRCUIT CAN DO, and every one of these is a control the panel
 * beside it already has. The Circuit throws them; it does not own them.
 */
export const ACTS: ActDef[] = [
  {
    id: 'feed', machine: 'kiln', label: 'open the damper',
    avail: (s) => s.kiln.built,
    holds: (s) => s.kiln.feeding,
    apply: (s) => { if (s.kiln.feeding) return false; s.kiln.feeding = true; return true; },
  },
  {
    id: 'damp', machine: 'kiln', label: 'shut the damper',
    avail: (s) => s.kiln.built,
    holds: (s) => !s.kiln.feeding,
    apply: (s) => { if (!s.kiln.feeding) return false; s.kiln.feeding = false; return true; },
  },
  {
    id: 'fuel:none', machine: 'kiln', label: 'burn bare',
    avail: (s) => s.kiln.built,
    holds: (s) => !s.kiln.fuel,
    apply: (s) => { if (!s.kiln.fuel) return false; s.kiln.fuel = null; return true; },
  },
  ...KILN_FUELS.map((f): ActDef => ({
    id: `fuel:${f.id}`, machine: 'kiln', label: `burn ${f.name}`,
    avail: (s) => s.kiln.built,
    holds: (s) => s.kiln.fuel === f.id,
    apply: (s) => { if (s.kiln.fuel === f.id) return false; s.kiln.fuel = f.id; return true; },
  })),
  ...(['fullest', 'sweep', 'chain'] as const).map((b): ActDef => ({
    id: `behaviour:${b}`, machine: 'bay',
    label: b === 'fullest' ? 'work the fullest cell' : b === 'sweep' ? 'sweep the zone' : 'chain off the last cell',
    avail: (s) => s.drills.units.length > 0,
    holds: (s) => s.drills.units.every((d) => (d.behavior ?? 'fullest') === b),
    apply: (s) => {
      let changed = false;
      for (const d of s.drills.units) {
        if ((d.behavior ?? 'fullest') === b) continue;
        if (b === 'fullest') delete d.behavior; else d.behavior = b;
        changed = true;
      }
      return changed;
    },
  })),
  ...(['both', 'oresFirst', 'ores', 'rock'] as const).map((p): ActDef => ({
    id: `priority:${p}`, machine: 'bay',
    label: p === 'both' ? 'take rock and ore alike'
      : p === 'oresFirst' ? 'take ore first'
        : p === 'ores' ? 'take ore only' : 'leave the ore alone',
    avail: (s) => s.drills.units.length > 0,
    holds: (s) => s.drills.units.every((d) => (d.priority ?? 'both') === p),
    apply: (s) => {
      let changed = false;
      for (const d of s.drills.units) {
        if ((d.priority ?? 'both') === p) continue;
        d.priority = p;
        changed = true;
      }
      return changed;
    },
  })),
  {
    /**
     * BANK THE SURGE — §7.3's own line, in the form Loam can honestly take. A
     * row above `run the Crusher` that says "not here" leaves the bank alone.
     *
     * It does nothing on purpose. In a top-down strip an action that does
     * nothing is how you say "and stop looking".
     */
    id: 'bank', machine: 'crusher', label: 'bank the Surge',
    avail: (s) => crusherBuilt(s),
    holds: () => true,
    apply: () => false,
  },
  /**
   * HOLD THE LINE — §7.3's fourth sketched line, CUT AT A.85 as a name against
   * no mechanism ("the Line does not exist to hold") and wired at A.91 because
   * it does now.
   *
   * `WHEN station type = hazard → hold the Line, bank Surge` is the spine's own
   * example, and it is a real decision: a Line is the biggest single draw in
   * the plant, so holding it at a hazard station keeps the bank for the Crusher
   * you might need instead.
   */
  {
    id: 'lineHold', machine: 'line', label: 'hold the Line',
    avail: (s) => lineBuilt(s),
    holds: (s) => ensureLine(s).held,
    apply: (s) => { if (ensureLine(s).held) return false; ensureLine(s).held = true; return true; },
  },
  {
    id: 'lineRelease', machine: 'line', label: 'let the Line run',
    avail: (s) => lineBuilt(s),
    holds: (s) => !ensureLine(s).held,
    apply: (s) => { if (!ensureLine(s).held) return false; ensureLine(s).held = false; return true; },
  },
  {
    /**
     * ...AND FIRE IT. The Line is the one machine whose whole point is that it
     * runs as one act, so a strip that can hold it and not throw it would be a
     * brake with no accelerator.
     */
    id: 'lineRun', machine: 'line', label: 'fire the Line',
    avail: (s) => lineBuilt(s),
    holds: () => false,
    apply: (s, ctx) => runLine(s, ctx).ok,
  },
  {
    /**
     * RUN THE CRUSHER on the biggest stack it can take. NEVER a RESERVED one —
     * §25.5's first automation problem ("it consumes what you were saving").
     *
     * A.85 read `qol.pins` inline here, and that was the whole of the reserve:
     * one act, of one machine, honoured the flag. `crushable` filters reserved
     * stacks out at source now (A.100), so this act does not need to know the
     * rule — which is the point. The Circuit is a consumer of RESERVE, not its
     * only enforcer.
     *
     * PILLAR 2: a batch is four stone in and two out. It converts at a LOSS and
     * costs Surge to do it, so no amount of circuitry makes this a faucet.
     */
    id: 'run', machine: 'crusher', label: 'run the Crusher',
    avail: (s) => crusherBuilt(s),
    holds: () => false,
    apply: (s, ctx) => {
      const pick = crushable(s)[0];
      if (!pick) return false;
      return crush(s, ctx, pick.materialId, pick.band).ok;
    },
  },
];

/**
 * FILTER AS AN ACTION (§14.3, §25.5) — the thing the Circuit has been waiting
 * on since A.85, and the reason `bank` and `run` were the only Crusher rows
 * this build could honestly offer.
 *
 * Every SAVED filter becomes a row you can throw at any machine the Sieve can
 * point at. That is what makes a strip a plant rather than a switchboard:
 *
 *     WHEN this machine is magnetised  → take only what is under Fair
 *     WHEN the seam here is Umberjade  → take only what is dense
 *
 * §25.5's first automation problem is "it consumes what you were saving", and
 * it now has BOTH answers the section asks for. RESERVE (`systems/reserve.ts`,
 * A.100) is the blunt one and every consumer honours it; this is the granular
 * one, and it is granular in the way that matters: a reserve names a STACK, a
 * filter names a PROPERTY, so it goes on applying to stone you have not mined
 * yet.
 *
 * Generated rather than authored — the same shape as the kiln fuels above — so
 * a filter written today is throwable today, without a registry entry.
 */
function filterActs(state: GameState): ActDef[] {
  if (!sieveBuilt(state)) return [];
  const machines = new Set(filterable(state));
  const out: ActDef[] = [];
  for (const f of ensureSorting(state).filters) {
    for (const m of CIRCUIT_MACHINES) {
      if (!machines.has(m)) continue;
      out.push({
        id: `filter:${m}:${f.id}`,
        machine: m,
        label: `take only what ${filterSentence(f)}`,
        avail: (s) => sieveBuilt(s) && ensureSorting(s).filters.some((x) => x.id === f.id),
        holds: (s) => ensureSorting(s).assigned[m] === f.id,
        apply: (s) => {
          const sort = ensureSorting(s);
          if (sort.assigned[m] === f.id) return false;
          sort.assigned[m] = f.id;
          return true;
        },
      });
    }
  }
  // ...AND THE ROW THAT TAKES IT BACK OFF. A strip that can only ever narrow a
  // machine is a ratchet, and a ratchet is not a decision.
  for (const m of CIRCUIT_MACHINES) {
    if (!machines.has(m)) continue;
    out.push({
      id: `unfilter:${m}`,
      machine: m,
      label: 'take anything',
      avail: (s) => sieveBuilt(s),
      holds: (s) => ensureSorting(s).assigned[m] === undefined,
      apply: (s) => {
        const sort = ensureSorting(s);
        if (sort.assigned[m] === undefined) return false;
        delete sort.assigned[m];
        return true;
      },
    });
  }
  return out;
}

/**
 * EVERY ACT, INCLUDING THE GENERATED ONES. The filter rows depend on state (a
 * filter is a thing the player wrote), so the list cannot be a module constant
 * — but nothing outside this file may hold a stale copy either, which is why
 * both lookups go through here.
 */
export function allActs(state: GameState): ActDef[] {
  return [...ACTS, ...filterActs(state)];
}

export function actDef(id: string, state?: GameState): ActDef | undefined {
  const found = ACTS.find((a) => a.id === id);
  if (found || !state) return found;
  return filterActs(state).find((a) => a.id === id);
}

export function availableActs(state: GameState, machine: MachineId): ActDef[] {
  return allActs(state).filter((a) => a.machine === machine && a.avail(state));
}

/** A machine can carry a strip only if it has something to be told to do. */
export function availableMachines(state: GameState): MachineId[] {
  return CIRCUIT_MACHINES.filter((m) => availableActs(state, m).length > 0);
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export function rowMatches(
  state: GameState, mods: ModifierCache, row: CircuitRow, machine: MachineId,
): boolean {
  const def = readDef(row.read);
  if (!def || !def.avail(state)) return false;
  const now = def.read(state, mods, machine);
  if (def.kind === 'enum') {
    const eq = String(now) === String(row.value);
    return row.op === 'isnt' ? !eq : eq;
  }
  const n = Number(now);
  const v = Number(row.value);
  if (Number.isNaN(n) || Number.isNaN(v)) return false;
  return row.op === 'lt' ? n < v : n > v;
}

/** Which row of a strip wins right now, or -1. Top-down, first match. */
export function winningRow(state: GameState, mods: ModifierCache, machine: MachineId): number {
  const strip = stripOf(state, machine);
  for (let i = 0; i < strip.length; i++) {
    if (rowMatches(state, mods, strip[i]!, machine)) return i;
  }
  return -1;
}

/**
 * READ EVERY STRIP AND THROW WHAT IT SAYS.
 *
 * Top-down, first match, one action per machine per read. The bookkeeping is
 * §25.3's: a row records how often it WON, a machine records how often the
 * winner actually CHANGED anything, and how often the winner CHANGED HANDS —
 * which is the honest Loam form of "row 1 → row 1, 340 times". Two rows taking
 * it in turns is not a bug; it is the thing you go and debug.
 */
export function tickCircuit(state: GameState, mods: ModifierCache, ctx: EngineCtx, dt: number): void {
  const c = ensureCircuit(state);
  if (!c.opened && circuitGateOpen(state)) c.opened = true;
  if (!c.opened) return;

  c.clock += dt;
  if (c.clock < CIRCUIT_PERIOD_SEC) return;
  c.clock = 0;

  for (const machine of CIRCUIT_MACHINES) {
    const strip = c.strips[machine];
    if (!strip || strip.length === 0) continue;
    const won = winningRow(state, mods, machine);
    const last = c.last[machine] ?? -1;
    if (won !== last) {
      if (last >= 0 && won >= 0) c.flips[machine] = (c.flips[machine] ?? 0) + 1;
      c.last[machine] = won;
    }
    if (won < 0) continue;

    const fires = (c.fires[machine] ??= []);
    while (fires.length < strip.length) fires.push(0);
    fires[won] = (fires[won] ?? 0) + 1;

    const act = actDef(strip[won]!.act, state);
    if (!act || !act.avail(state)) continue;
    if (act.apply(state, ctx, mods)) {
      c.acts[machine] = (c.acts[machine] ?? 0) + 1;
      ctx.dirty();
    }
  }
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

export function setRow(
  state: GameState, machine: MachineId, index: number, row: CircuitRow | null,
): { ok: boolean; reason?: string } {
  if (!circuitUnlocked(state)) return { ok: false, reason: 'No Circuit' };
  const c = ensureCircuit(state);
  const strip = (c.strips[machine] ??= []);
  if (row === null) {
    if (index < 0 || index >= strip.length) return { ok: false, reason: 'No such row' };
    strip.splice(index, 1);
    c.fires[machine] = [];
    c.last[machine] = -1;
    return { ok: true };
  }
  const rd = readDef(row.read);
  const ad = actDef(row.act, state);
  if (!rd || !rd.avail(state)) return { ok: false, reason: 'Nothing here reads that' };
  if (!ad || ad.machine !== machine || !ad.avail(state)) return { ok: false, reason: 'That machine cannot do that' };
  if (index >= MAX_ROWS) return { ok: false, reason: `A strip holds ${MAX_ROWS} rows` };
  if (index === strip.length && strip.length >= MAX_ROWS) return { ok: false, reason: `A strip holds ${MAX_ROWS} rows` };
  const clean: CircuitRow = {
    read: row.read,
    op: rd.kind === 'enum' ? (row.op === 'isnt' ? 'isnt' : 'is') : (row.op === 'lt' ? 'lt' : 'gt'),
    value: rd.kind === 'enum' ? String(row.value) : Math.max(0, Math.min(rd.max ?? 100, Number(row.value) || 0)),
    act: row.act,
  };
  if (index >= strip.length) strip.push(clean); else strip[index] = clean;
  c.fires[machine] = [];
  c.last[machine] = -1;
  return { ok: true };
}

export function moveRow(
  state: GameState, machine: MachineId, index: number, to: number,
): { ok: boolean; reason?: string } {
  const c = ensureCircuit(state);
  const strip = c.strips[machine] ?? [];
  if (index < 0 || index >= strip.length || to < 0 || to >= strip.length) {
    return { ok: false, reason: 'No such row' };
  }
  const [row] = strip.splice(index, 1);
  strip.splice(to, 0, row!);
  c.fires[machine] = [];
  c.last[machine] = -1;
  return { ok: true };
}

/** One row as a sentence, for the panel and the log. */
export function rowSentence(state: GameState, row: CircuitRow): string {
  const rd = readDef(row.read);
  const ad = actDef(row.act, state);
  if (!rd || !ad) return 'an unreadable row';
  const opWord = rd.kind === 'enum'
    ? (row.op === 'isnt' ? 'is not' : 'is')
    : (row.op === 'lt' ? 'is under' : 'is over');
  const val = rd.kind === 'enum'
    ? (rd.options?.(state).find((o) => o.value === row.value)?.label ?? String(row.value))
    : `${row.value}${rd.unit ?? ''}`;
  return `WHEN ${rd.label} ${opWord} ${val} → ${ad.label}`;
}
