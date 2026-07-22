/**
 * THE GREENHOUSE — 12 base strains on a legible 4×3 grammar (FORM × HUMOR),
 * cross-bred into 66 pairwise hybrids: 78 codex entries, every one earned by
 * breeding, nothing listed before it's found (pillar 5).
 *
 * The grammar IS the hypothesis surface: a hybrid inherits the slower
 * parent's FORM and blends HUMORS — a player who breeds two iron-humored
 * strains knows what temper to expect before the seed sprouts. Same
 * standard as the Lattice: rules discoverable by observation.
 */
import { D } from '../../decimal';
import { lawFlag } from '../../laws';
import type { ActionResult, EngineCtx, GameState } from '../../types';
import { addCurrency } from '../../resources';
import { registerModifier } from '../../modifiers';
import { masteryLevel } from '../../systems/mastery';
import { greenhouseWeatherMult } from '../../systems/weather';

export type Form = 'moss' | 'vine' | 'fern' | 'cap';
export type Humor = 'bright' | 'iron' | 'chill';

export interface StrainDef {
  id: string;
  name: string;
  form: Form;
  humor: Humor | [Humor, Humor];
  growMs: number;
  /** Harvest yields, by humor: bright→Spore, iron→Sap, chill→Chlorophyll. */
  yieldMult: number;
  flavor: string;
  parents?: [string, string];
}

const G = (id: string, name: string, form: Form, humor: Humor, growMin: number, flavor: string): StrainDef => ({
  id, name, form, humor, growMs: growMin * 60_000, yieldMult: 1, flavor,
});

/** The twelve. FORM sets the silhouette; HUMOR sets the temper and yield. */
export const BASE_STRAINS: StrainDef[] = [
  G('lampmoss', 'Lampmoss', 'moss', 'bright', 12, 'Glows faintly toward whoever is talking.'),
  G('ironmoss', 'Ironmoss', 'moss', 'iron', 18, 'Dense as a bad mood. Rings if flicked.'),
  G('rimemoss', 'Rimemoss', 'moss', 'chill', 15, 'Cold to the eye, colder to the touch.'),
  G('sunvine', 'Sunvine', 'vine', 'bright', 14, 'Climbs toward lamplight and compliments.'),
  G('cablevine', 'Cablevine', 'vine', 'iron', 20, 'Would rather be a chain. Nearly is.'),
  G('wispvine', 'Wispvine', 'vine', 'chill', 16, 'Moves a half-second after the wind.'),
  G('dayfern', 'Dayfern', 'fern', 'bright', 13, 'Unfurls at anything resembling morning.'),
  G('anvilfern', 'Anvilfern', 'fern', 'iron', 22, 'Fronds like flat green hammers.'),
  G('hushfern', 'Hushfern', 'fern', 'chill', 17, 'Dampens sound. Conspirators cultivate it.'),
  G('gleamcap', 'Gleamcap', 'cap', 'bright', 11, 'A mushroom with theatrical instincts.'),
  G('boltcap', 'Boltcap', 'cap', 'iron', 19, 'The stem is structural. The cap is armor.'),
  G('mournpalecap', 'Mournpale Cap', 'cap', 'chill', 16, 'Grows where something is missed.'),
];

const HUMOR_ADJ: Record<string, string> = {
  bright: 'Gleaming', iron: 'Forged', chill: 'Hushed',
  'bright+chill': 'Dawnfrost', 'bright+iron': 'Emberwrought', 'chill+iron': 'Coldiron',
};
const FORM_NOUN: Record<Form, string> = { moss: 'Moss', vine: 'Vine', fern: 'Fern', cap: 'Cap' };

function humorKey(a: Humor, b: Humor): string {
  return a === b ? a : [a, b].sort().join('+');
}

export function hybridId(a: string, b: string): string {
  return `hy.${[a, b].sort().join('+')}`;
}

/** Deterministic hybrid of two base strains — the grammar made visible. */
export function hybridDef(aId: string, bId: string): StrainDef {
  const a = strainDef(aId);
  const b = strainDef(bId);
  const slower = a.growMs >= b.growMs ? a : b;
  const ha = a.humor as Humor;
  const hb = b.humor as Humor;
  const key = humorKey(ha, hb);
  const humor: Humor | [Humor, Humor] = ha === hb ? ha : ([ha, hb].sort() as [Humor, Humor]);
  return {
    id: hybridId(aId, bId),
    name: `${HUMOR_ADJ[key]} ${FORM_NOUN[slower.form]}`,
    form: slower.form,
    humor,
    growMs: Math.round(((a.growMs + b.growMs) / 2) * 1.15),
    yieldMult: 1.6,
    flavor: `Bred from ${a.name} and ${b.name}. The slower parent set its shape.`,
    parents: [aId, bId],
  };
}

const baseById = new Map(BASE_STRAINS.map((s) => [s.id, s]));

export function strainDef(id: string): StrainDef {
  const base = baseById.get(id);
  if (base) return base;
  if (id.startsWith('hy.')) {
    const [a, b] = id.slice(3).split('+');
    if (a && b && baseById.has(a) && baseById.has(b)) return hybridDef(a, b);
  }
  throw new Error(`Unknown strain: ${id}`);
}

export const TOTAL_STRAINS = 12 + (12 * 11) / 2; // 78 — "~80", exhaustively

// ---------------------------------------------------------------------------
// Unlock + plots
// ---------------------------------------------------------------------------

export function greenhouseUnlocked(state: GameState): boolean {
  return masteryLevel(state, 'verdance') >= 2;
}

export function plotCount(state: GameState): number {
  const m = masteryLevel(state, 'verdance');
  return m >= 15 ? 8 : m >= 8 ? 6 : 4;
}

function ensurePlots(state: GameState): void {
  while (state.greenhouse.plots.length < plotCount(state)) state.greenhouse.plots.push(null);
}

// ---------------------------------------------------------------------------
// Seeds — found, never bought. Vine harvests shed them.
// ---------------------------------------------------------------------------

export const SEED_CHANCE = 0.16; // per bloom+ vine harvest

export function rollForSeed(state: GameState, ctx: EngineCtx, stage: number): void {
  if (!greenhouseUnlocked(state)) return;
  if (stage < 3) return;
  if (Math.random() >= SEED_CHANCE * (stage >= 4 ? 1.5 : 1)) return;
  const pick = BASE_STRAINS[Math.floor(Math.random() * BASE_STRAINS.length)]!;
  state.greenhouse.seeds[pick.id] = (state.greenhouse.seeds[pick.id] ?? 0) + 1;
  if (!state.greenhouse.codex.includes(pick.id)) state.greenhouse.codex.push(pick.id);
  ctx.emit({ type: 'seedFound', speciesId: pick.id });
}

// ---------------------------------------------------------------------------
// Planting, growing, breeding, harvest
// ---------------------------------------------------------------------------

export function plantSeed(state: GameState, plot: number, speciesId: string): ActionResult {
  if (!greenhouseUnlocked(state)) return { ok: false, reason: 'The Greenhouse wants Verdance Mastery 2' };
  ensurePlots(state);
  if (plot < 0 || plot >= state.greenhouse.plots.length) return { ok: false, reason: 'No such bed' };
  if (state.greenhouse.plots[plot]) return { ok: false, reason: 'That bed is taken' };
  if ((state.greenhouse.seeds[speciesId] ?? 0) < 1) return { ok: false, reason: 'No seed of it' };
  strainDef(speciesId); // validates
  state.greenhouse.seeds[speciesId]! -= 1;
  state.greenhouse.plots[plot] = { speciesId, progressMs: 0 };
  return { ok: true };
}

export function plotMature(state: GameState, plot: number): boolean {
  const p = state.greenhouse.plots[plot];
  if (!p) return false;
  return p.progressMs >= strainDef(p.speciesId).growMs;
}

/** Flowering window: the last fifth of growth plus maturity. */
function plotFlowering(state: GameState, plot: number): boolean {
  const p = state.greenhouse.plots[plot];
  if (!p) return false;
  return p.progressMs >= strainDef(p.speciesId).growMs * 0.8;
}

export function harvestPlot(state: GameState, ctx: EngineCtx, plot: number): ActionResult {
  if (!plotMature(state, plot)) return { ok: false, reason: 'Not ripe' };
  const p = state.greenhouse.plots[plot]!;
  const def = strainDef(p.speciesId);
  const humors: Humor[] = Array.isArray(def.humor) ? def.humor : [def.humor];
  const per = 8 * def.yieldMult / humors.length;
  for (const h of humors) {
    if (h === 'bright') addCurrency(state, 'spore', D(per * 3));
    if (h === 'iron') addCurrency(state, 'sap', D(per));
    if (h === 'chill') addCurrency(state, 'chlorophyll', D(per));
  }
  // A harvested strain returns one seed of itself — cultivation is a cycle.
  state.greenhouse.seeds[p.speciesId] = (state.greenhouse.seeds[p.speciesId] ?? 0) + 1;
  // THE SECOND SEED (law): the plot replants itself with what it just gave.
  if (lawFlag(state, 'autoReplant') && (state.greenhouse.seeds[p.speciesId] ?? 0) > 0) {
    state.greenhouse.seeds[p.speciesId]! -= 1;
    state.greenhouse.plots[plot] = { speciesId: p.speciesId, progressMs: 0 };
  } else {
    state.greenhouse.plots[plot] = null;
  }
  state.greenhouse.harvests += 1;
  ctx.dirty();
  ctx.emit({ type: 'plotHarvested', speciesId: p.speciesId });
  return { ok: true };
}

/** Called from the guild tick cadence (1/s): growth + adjacent breeding. */
export function tickGreenhouse(state: GameState, ctx: EngineCtx, dtMs: number): void {
  if (!greenhouseUnlocked(state)) return;
  ensurePlots(state);
  const mult = greenhouseWeatherMult(state);
  const plots = state.greenhouse.plots;
  for (const p of plots) {
    if (p) p.progressMs += dtMs * mult;
  }
  // Breeding: adjacent beds, both flowering, both BASE strains -> the hybrid
  // seed appears once, and the codex learns it (the discovery moment).
  for (let i = 0; i + 1 < plots.length; i++) {
    const a = plots[i];
    const b = plots[i + 1];
    if (!a || !b) continue;
    if (!plotFlowering(state, i) || !plotFlowering(state, i + 1)) continue;
    if (a.speciesId.startsWith('hy.') || b.speciesId.startsWith('hy.')) continue;
    if (a.speciesId === b.speciesId) continue;
    const id = hybridId(a.speciesId, b.speciesId);
    if (state.greenhouse.codex.includes(id)) continue;
    state.greenhouse.codex.push(id);
    state.greenhouse.seeds[id] = (state.greenhouse.seeds[id] ?? 0) + 1;
    ctx.dirty();
    ctx.emit({ type: 'hybridBred', id });
  }
}

/** Cultivar passives: a MATURE hybrid left planted works while it stands. */
export function registerGreenhouseModifiers(): void {
  const humors: Array<{ h: Humor; bucket: 'xpGain' | 'strikePower' | 'regen'; v: number }> = [
    { h: 'bright', bucket: 'xpGain', v: 1.03 },
    { h: 'iron', bucket: 'strikePower', v: 1.03 },
    { h: 'chill', bucket: 'regen', v: 1.03 },
  ];
  for (const { h, bucket, v } of humors) {
    registerModifier({
      id: `greenhouse.${h}`,
      label: `Standing cultivars (${h})`,
      bucket,
      value: (s) => {
        let n = 0;
        for (let i = 0; i < s.greenhouse.plots.length; i++) {
          const p = s.greenhouse.plots[i];
          if (!p || !p.speciesId.startsWith('hy.')) continue;
          const def = strainDef(p.speciesId);
          if (p.progressMs < def.growMs) continue;
          const hs: Humor[] = Array.isArray(def.humor) ? def.humor : [def.humor];
          if (hs.includes(h)) n += 1;
        }
        return n > 0 ? 1 + (v - 1) * Math.min(3, n) : 1;
      },
    });
  }
}

export function defaultGreenhouseState(): GameState['greenhouse'] {
  return { plots: [null, null, null, null], seeds: {}, codex: [], harvests: 0 };
}
