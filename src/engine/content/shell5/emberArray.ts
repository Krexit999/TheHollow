/**
 * THE EMBER ARRAY — Cinder's craft-system, and the only one that asks for
 * sustained live attention. A 6×6 furnace grid: place fuel, light it, and
 * hold the temperature inside the band as long as you can. Fire spreads —
 * a burning cell ignites its neighbors as it dies — so a layout is a fuse
 * you design and then ride.
 *
 * Because it demands presence, Passive Rank matters MORE here, not less:
 * the tuning target (charter) is engaged ≈ 2× passive, never 10×. The two
 * halves of the multiplier are sized to meet exactly there: passive rank
 * caps at +0.16, and a very good sustained burn adds +0.16 on top. Your
 * best-ever duration persists — a peak is never re-earned.
 *
 * OVERDRIVE feeds the furnace into the shaft itself: +50% burn heat and
 * the temperature bleeds into Pressure at +0.8 heat/s. It is an explicit
 * toggle, breaks Damper idleness while on, and shuts itself off the moment
 * the shaft hits OVERPRESSURE — the Array will not burn the mine down.
 */
import { D } from '../../decimal';
import type { ActionResult, EngineCtx, GameState } from '../../types';
import { spendCurrency } from '../../resources';
import { registerModifier } from '../../modifiers';
import { registerCraftSystem, type CraftSystem, type CodexEntry } from '../../craft';
import { addMaterial, consumeMaterial } from '../../systems/forge';
import { masteryLevel } from '../../systems/mastery';

export const ARRAY_SIZE = 6;
export const BAND_LOW = 45;
export const BAND_HIGH = 70;
export const TEMP_DECAY = 0.08; // 8%/s toward cold
export const IGNITE_AT = 0.2; // a dying cell (below this remaining share) lights neighbors
export const PASSIVE_RANK_SEC = 1500;
export const PASSIVE_RANK_CAP = 20;
/** In-band seconds per Emberglass annealed (Part B export spine). */
export const ANNEAL_SEC = 90;
export const PASSIVE_PER_RANK = 0.008; // ×20 = +0.16
export const BURN_BONUS_SCALE = 0.04; // × log2(1 + best/120) — +0.16 at ~30 min

export interface FuelDef {
  id: string;
  name: string;
  costCurrency: string;
  cost: number;
  burnSec: number;
  heatPerSec: number;
  flavor: string;
}

export const FUELS: FuelDef[] = [
  { id: 'slagchunk', name: 'Slag Chunk', costCurrency: 'slag', cost: 60, burnSec: 25, heatPerSec: 3.2, flavor: 'Burns twice as fast as it should, out of spite.' },
  { id: 'emberbillet', name: 'Ember Billet', costCurrency: 'ember', cost: 12, burnSec: 60, heatPerSec: 2.2, flavor: 'A steady worker. The backbone of every honest fire.' },
  { id: 'obsidianblock', name: 'Obsidian Block', costCurrency: 'obsidian', cost: 10, burnSec: 150, heatPerSec: 1.1, flavor: 'Barely burns at all. That is the point — it burns TOMORROW.' },
  { id: 'pyreresin', name: 'Pyre Resin', costCurrency: 'pyre', cost: 4, burnSec: 18, heatPerSec: 6.0, flavor: 'Fuel from below three-eighty. Handle with tongs, plan with respect.' },
];

export const FUEL_BY_ID = new Map(FUELS.map((f) => [f.id, f]));

export function arrayUnlocked(state: GameState): boolean {
  return masteryLevel(state, 'cinder') >= 3;
}

export function buyFuel(state: GameState, fuelId: string, n = 1): ActionResult {
  const fuel = FUEL_BY_ID.get(fuelId);
  if (!fuel) return { ok: false, reason: 'No such fuel' };
  if (!spendCurrency(state, fuel.costCurrency, D(fuel.cost * n))) {
    return { ok: false, reason: `${fuel.cost * n} ${fuel.costCurrency} for ${n}× ${fuel.name}` };
  }
  state.ember.fuelOwned[fuelId] = (state.ember.fuelOwned[fuelId] ?? 0) + n;
  return { ok: true };
}

/** Rows of the grate open to fuel: the first is free; every further row wants
 *  a Ground Lens socketed over it (Part B export spine — Glassmere's export
 *  steadies the draft). */
export function openRows(state: GameState): number {
  return Math.min(ARRAY_SIZE, 1 + (state.ember.sockets ?? 0));
}

export function installSocket(state: GameState): ActionResult {
  if (!arrayUnlocked(state)) return { ok: false, reason: 'The Array is cold' };
  if (openRows(state) >= ARRAY_SIZE) return { ok: false, reason: 'Every row is socketed' };
  if (consumeMaterial(state, 'groundlens', 1) === null) {
    return { ok: false, reason: 'A socket wants 1 Ground Lens — grind it at the Bench in Glassmere, or buy one from Serra' };
  }
  state.ember.sockets = (state.ember.sockets ?? 0) + 1;
  return { ok: true, data: { rows: openRows(state) } };
}

/** Place (or clear) fuel in a cold cell. Burning cells cannot be touched. */
export function placeFuel(state: GameState, cell: number, fuelId: string | null): ActionResult {
  if (cell < 0 || cell >= ARRAY_SIZE * ARRAY_SIZE) return { ok: false, reason: 'Off the grate' };
  if (state.ember.burn[cell]! > 0) return { ok: false, reason: 'That cell is burning' };
  if (fuelId !== null && Math.floor(cell / ARRAY_SIZE) >= openRows(state)) {
    return { ok: false, reason: 'That row has no lens over it — socket a Ground Lens (Bench in Glassmere, or Serra)' };
  }
  const current = state.ember.grid[cell];
  if (fuelId === null) {
    if (current) state.ember.fuelOwned[current] = (state.ember.fuelOwned[current] ?? 0) + 1;
    state.ember.grid[cell] = null;
    return { ok: true };
  }
  if (!FUEL_BY_ID.has(fuelId)) return { ok: false, reason: 'No such fuel' };
  if ((state.ember.fuelOwned[fuelId] ?? 0) < 1) return { ok: false, reason: 'None of that fuel on hand' };
  if (current) state.ember.fuelOwned[current] = (state.ember.fuelOwned[current] ?? 0) + 1;
  state.ember.fuelOwned[fuelId]! -= 1;
  state.ember.grid[cell] = fuelId;
  return { ok: true };
}

export function lightCell(state: GameState, cell: number): ActionResult {
  const fuelId = state.ember.grid[cell];
  if (!fuelId) return { ok: false, reason: 'Nothing to light there' };
  if (state.ember.burn[cell]! > 0) return { ok: false, reason: 'Already burning' };
  state.ember.burn[cell] = FUEL_BY_ID.get(fuelId)!.burnSec;
  state.ember.savedLayout = [...state.ember.grid]; // the fuse you lit is the one remembered
  return { ok: true };
}

export function setOverdrive(state: GameState, on: boolean): ActionResult {
  state.ember.overdrive = on;
  // The two couplings are opposites and cannot both be open.
  if (on) state.ember.draw = false;
  return { ok: true };
}

// --- THE DRAW (Phase 14) ---------------------------------------------------
//
// Cinder's back half was the shell fighting itself: the shaft's whole problem
// is heat you cannot get rid of, and the Array — the shell's own craft system —
// only ever made MORE of it. Overdrive fed the furnace into the shaft; nothing
// ever ran the other way, so the Array sat outside the very pressure economy it
// was supposed to be about, and a player at 15-30h had a minigame beside a
// problem rather than a tool for it.
//
// The Draw reverses the pipe. Held shaft heat becomes furnace temperature: the
// thing you were desperate to be rid of is now fuel. It costs nothing but
// presence, which is what the Array has always asked for.
//
// It cannot break the flood guarantees, because it only ever REMOVES shaft heat
// — an idle shaft with the Draw open is strictly cooler than one without.

/** Shaft heat drawn per second while the Draw is open. */
export const DRAW_RATE = 2.2;
/** Furnace degrees gained per point of shaft heat drawn. */
export const DRAW_EFFICIENCY = 1.35;
/** Below this the shaft has nothing worth pulling — the Draw idles. */
export const DRAW_FLOOR = 8;

export function setDraw(state: GameState, on: boolean): ActionResult {
  if (on && !arrayUnlocked(state)) return { ok: false, reason: 'The Array is cold' };
  state.ember.draw = on;
  if (on) state.ember.overdrive = false;
  return { ok: true };
}

/** How much heat the Draw would actually pull this tick. */
export function drawnHeat(state: GameState, dt: number): number {
  if (!state.ember.draw) return 0;
  const available = Math.max(0, state.pressure.heat - DRAW_FLOOR);
  return Math.min(available, DRAW_RATE * dt);
}

export function arrayTemp(state: GameState): number {
  return state.ember.temp;
}

function orth(cell: number): number[] {
  const x = cell % ARRAY_SIZE;
  const y = Math.floor(cell / ARRAY_SIZE);
  const out: number[] = [];
  if (x > 0) out.push(cell - 1);
  if (x < ARRAY_SIZE - 1) out.push(cell + 1);
  if (y > 0) out.push(cell - ARRAY_SIZE);
  if (y < ARRAY_SIZE - 1) out.push(cell + ARRAY_SIZE);
  return out;
}

function tickArray(state: GameState, ctx: EngineCtx, dt: number): void {
  const e = state.ember;
  let output = 0;
  for (let i = 0; i < ARRAY_SIZE * ARRAY_SIZE; i++) {
    if (e.burn[i]! <= 0) continue;
    const fuel = FUEL_BY_ID.get(e.grid[i]!)!;
    output += fuel.heatPerSec * (e.overdrive ? 1.5 : 1);
    const before = e.burn[i]!;
    e.burn[i] = Math.max(0, before - dt);
    // The dying breath lights the neighbors — the spread that makes layouts.
    if (before / fuel.burnSec > IGNITE_AT && e.burn[i]! / fuel.burnSec <= IGNITE_AT) {
      for (const n of orth(i)) {
        if (e.grid[n] && e.burn[n]! <= 0) e.burn[n] = FUEL_BY_ID.get(e.grid[n]!)!.burnSec;
      }
    }
    if (e.burn[i]! <= 0) e.grid[i] = null; // burned through
  }
  // The Draw: shaft heat becomes furnace heat. Taken here rather than in the
  // pressure tick so the two can never disagree about how much moved.
  const pulled = drawnHeat(state, dt);
  if (pulled > 0) {
    state.pressure.heat = Math.max(0, state.pressure.heat - pulled);
    output += (pulled * DRAW_EFFICIENCY) / dt;
  }
  e.temp = Math.max(0, e.temp * (1 - TEMP_DECAY * dt) + output * dt);
  const inBand = e.temp >= BAND_LOW && e.temp <= BAND_HIGH;
  if (inBand) {
    // THE ANNEAL (Part B export spine): 90 seconds held in the band, in total,
    // anneals one Emberglass — Cinder's export, the glass the Hollow rebuilds
    // with. Work done accumulates across band exits (unlike the sustain
    // streak); only a LIVE fire anneals — the banked fire makes rank, not
    // glass.
    const prevGlass = Math.floor((e.annealSec ?? 0) / ANNEAL_SEC);
    e.annealSec = (e.annealSec ?? 0) + dt;
    const nowGlass = Math.floor(e.annealSec / ANNEAL_SEC);
    if (nowGlass > prevGlass) {
      addMaterial(state, 'emberglass', 70, nowGlass - prevGlass);
      ctx.emit({ type: 'emberglassAnnealed', total: nowGlass });
      ctx.dirty();
    }
    e.sustainSec += dt;
    if (e.sustainSec > e.bestSustainSec) {
      const prevTier = Math.floor(e.bestSustainSec / 60);
      e.bestSustainSec = e.sustainSec;
      if (Math.floor(e.bestSustainSec / 60) > prevTier) {
        ctx.emit({ type: 'arrayBest', seconds: Math.floor(e.bestSustainSec) });
        ctx.dirty();
      }
    }
  } else if (e.sustainSec > 0) {
    e.sustainSec = 0;
  }
}

export const emberArraySystem: CraftSystem = {
  id: 'emberArray',
  name: 'The Ember Array',
  currencyId: 'pyre',
  unlocked: arrayUnlocked,
  ensureState(state) {
    if (!state.ember) state.ember = defaultEmberState();
    // A v12 save predates the Draw and loads without the field. Undefined is
    // falsy so nothing would misbehave, but a boolean that is sometimes absent
    // is the kind of thing that bites two phases later — normalise it here
    // rather than bump the save version for one flag (A.24).
    state.ember.draw ??= false;
    state.ember.sockets ??= 0;
    state.ember.annealSec ??= 0;
  },
  tick(state, _mods, ctx, dt) {
    tickArray(state, ctx, dt);
    state.ember.passiveProgressSec += dt;
    while (state.ember.passiveProgressSec >= PASSIVE_RANK_SEC && state.ember.passiveRank < PASSIVE_RANK_CAP) {
      state.ember.passiveProgressSec -= PASSIVE_RANK_SEC;
      state.ember.passiveRank += 1;
      ctx.dirty();
    }
  },
  offlineTick(state, _mods, _ctx, seconds, efficiency) {
    // Away, the fire banks itself: no live burn, no sustain — rank only.
    state.ember.passiveProgressSec += seconds * efficiency;
    while (state.ember.passiveProgressSec >= PASSIVE_RANK_SEC && state.ember.passiveRank < PASSIVE_RANK_CAP) {
      state.ember.passiveProgressSec -= PASSIVE_RANK_SEC;
      state.ember.passiveRank += 1;
    }
    state.ember.overdrive = false;
    state.ember.draw = false;
    state.ember.temp = 0;
    state.ember.sustainSec = 0;
  },
  passiveRank: (state) => state.ember.passiveRank,
  codex(state) {
    const out: CodexEntry[] = [];
    for (const f of FUELS) {
      if ((state.ember.fuelOwned[f.id] ?? 0) > 0 || state.ember.savedLayout.includes(f.id)) {
        out.push({ id: f.id, name: f.name, flavor: f.flavor, effect: `${f.heatPerSec}°/s for ${f.burnSec}s`, active: true, kind: 'pattern' });
      }
    }
    if (state.ember.bestSustainSec > 0) {
      out.push({
        id: 'bestBurn', name: 'The Long Burn', kind: 'pattern', active: true,
        flavor: 'Your steadiest fire, on record. Records do not cool.',
        effect: `${Math.floor(state.ember.bestSustainSec / 60)}m ${Math.floor(state.ember.bestSustainSec % 60)}s in the band`,
      });
    }
    return out;
  },
};

export function registerEmberArray(): void {
  registerCraftSystem(emberArraySystem);
  registerModifier({
    id: 'ember.burn',
    label: 'Ember Array (best burn + rank)',
    bucket: 'dustYield',
    value: (s) =>
      1 +
      PASSIVE_PER_RANK * (s.ember?.passiveRank ?? 0) +
      BURN_BONUS_SCALE * Math.log2(1 + (s.ember?.bestSustainSec ?? 0) / 120),
  });
}

export function defaultEmberState(): GameState['ember'] {
  return {
    grid: new Array(ARRAY_SIZE * ARRAY_SIZE).fill(null),
    burn: new Array(ARRAY_SIZE * ARRAY_SIZE).fill(0),
    temp: 0,
    sustainSec: 0,
    bestSustainSec: 0,
    savedLayout: new Array(ARRAY_SIZE * ARRAY_SIZE).fill(null),
    overdrive: false,
    draw: false,
    fuelOwned: {},
    passiveRank: 0,
    passiveProgressSec: 0,
    sockets: 0,
    annealSec: 0,
  };
}
