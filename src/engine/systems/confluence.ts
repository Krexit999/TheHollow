/**
 * CONFLUENCES — what happens when two systems are true at once.
 *
 * The game had 35 systems that all talked to the modifier pipeline and almost
 * none that talked to each other. A rune did not care what alloy it was carved
 * into; the Lattice did not know the weather; five carried signatures sat beside
 * seven craft boards that had never heard of them. Every system was deep and
 * every pair was empty.
 *
 * A confluence is a condition over TWO systems plus what it pays. It is not a
 * new system: there is no room, no currency, no board, no upkeep. It is the
 * space between things that already exist.
 *
 * THREE RULES, and they are what make this safe:
 *
 *  1. A CONFLUENCE IS A BONUS FOR HAVING BOTH, NEVER A REQUIREMENT TO HAVE
 *     BOTH. Nothing is gated behind one. A player who never brews is never
 *     locked out of combat content — they simply never light that particular
 *     lamp. Additive discovery, not gated content.
 *
 *  2. IT IS DISCOVERED, NOT ANNOUNCED. The first time the condition holds, it
 *     records itself in the Codex and says so. Pillar 5: the Compendium
 *     explains that confluences exist and how they work, and never lists which
 *     pairings pay.
 *
 *  3. IT PAYS THROUGH THE MODIFIER PIPELINE like everything else, so it is
 *     visible in a breakdown and cannot secretly break pillar 2.
 *
 * Discovery is a RECORD OF PLAY, so it lives in the save (v13), beside the
 * Codex lists it belongs with.
 */
import type { EngineCtx, GameState } from '../types';
import { registerModifier, foldBonus, type Bucket } from '../modifiers';
import { currentWeather } from './weather';
import { traitsOf, type TraitId } from '../traits';

export interface ConfluenceDef {
  id: string;
  /** The name it is recorded under once found. */
  name: string;
  /** The two systems it needs — shown in the Codex, used by the coverage checker. */
  systems: [string, string];
  /** In the game's voice. Says what it IS, never how to get it. */
  flavor: string;
  /** Live right now? Pure function of state — no stored flags, no timers. */
  active: (s: GameState) => boolean;
  /** What it pays while live. */
  bucket: Bucket;
  /** Magnitude, as a raw bonus — foldBonus decides the shape. */
  bonus: number;
}

/** Small helpers so the conditions below read as sentences. */
const wearing = (s: GameState, sig: string): boolean => s.shell.signatures.includes(sig);
const weatherIs = (s: GameState, id: string): boolean => currentWeather(s).id === id;

/** Traits of the equipped tool's three parts — the reach of the parts system. */
function equippedHasTrait(s: GameState, trait: TraitId): boolean {
  const tool = s.forge.tools[s.forge.equipped];
  if (!tool?.parts) return false;
  for (const slot of ['head', 'haft', 'binding'] as const) {
    if (traitsOf(tool.parts[slot].materialId).includes(trait)) return true;
  }
  return false;
}
const equippedTemper = (s: GameState): string | undefined => s.forge.tools[s.forge.equipped]?.temper;

export const CONFLUENCES: ConfluenceDef[] = [
  // --- RUNE × ALLOY -------------------------------------------------------
  // A grammar that knows what it is carved into.
  {
    id: 'temperedGrammar', name: 'The Tempered Grammar', systems: ['runes', 'crucible'],
    flavor: 'A rune cut into an alloy rather than into plain steel. The metal argues back, and the argument is louder than either.',
    active: (s) => s.runes.inscriptions['tool']?.some((r) => r !== null) === true
      && (s.forge.tools.find((t) => t.id === s.forge.equipped)?.alloys.some((a) => a !== null) ?? false),
    bucket: 'strikePower', bonus: 0.12,
  },
  {
    id: 'quietedMetal', name: 'The Quieted Metal', systems: ['runes', 'forge'],
    flavor: 'Three runes and three alloys on the same tool. It stops ringing entirely, which everyone agrees is worse.',
    active: (s) => {
      const tool = s.forge.tools.find((t) => t.id === s.forge.equipped);
      const runes = (s.runes.inscriptions['tool'] ?? []).filter((r) => r !== null).length;
      const alloys = (tool?.alloys ?? []).filter((a) => a !== null).length;
      return runes >= 3 && alloys >= 3;
    },
    bucket: 'dustYield', bonus: 0.18,
  },

  // --- GEM × RUNE ---------------------------------------------------------
  // Sockets and inscriptions on the same item, which used to ignore each other.
  {
    id: 'litInscription', name: 'The Lit Inscription', systems: ['runes', 'gems'],
    flavor: 'A socketed stone behind a cut rune. The glyph holds the light instead of letting it through.',
    active: (s) => {
      const tool = s.forge.tools.find((t) => t.id === s.forge.equipped);
      return (tool?.sockets.some((g) => g !== null) ?? false)
        && (s.runes.inscriptions['tool'] ?? []).some((r) => r !== null);
    },
    bucket: 'dropRate', bonus: 0.15,
  },

  // --- CHORD × WEATHER ----------------------------------------------------
  // The Lattice is static; weather cycles. A reason to check back in.
  {
    id: 'stormChord', name: 'The Storm Chord', systems: ['lattice', 'weather'],
    flavor: 'The board reads differently when the shell is charged. The same stones, a different sentence.',
    active: (s) => s.lattice.discovered.length >= 3 && weatherIs(s, 'magneticStorm'),
    bucket: 'motifGain', bonus: 0.4,
  },
  {
    // Deliberately NOT keyed to 'stillness': that is Loam's neutral weather
    // AND the pre-Guild fallback, so a confluence on it would fire on a fresh
    // save having discovered nothing. A confluence keyed to the default state
    // of the world is not a discovery. Warm Seams is a real roll.
    id: 'warmBoard', name: 'The Warm Board', systems: ['lattice', 'weather'],
    flavor: 'The loam runs warm and the stones take it up. Every resonance on the board holds a half-beat longer than it should.',
    active: (s) => s.lattice.discovered.length >= 6 && weatherIs(s, 'warmSeams'),
    bucket: 'cap', bonus: 0.15,
  },

  // --- SIGNATURE × CRAFT-SYSTEM -------------------------------------------
  // Five carried ghosts, seven boards that had never heard of them.
  {
    id: 'polarPour', name: 'The Polar Pour', systems: ['polarity', 'crucible'],
    flavor: 'Pouring with the poles rigged. The metal separates along lines nobody drew.',
    active: (s) => wearing(s, 'polarity') && s.crucible.discovered.length >= 5,
    bucket: 'chainPower', bonus: 0.2,
  },
  {
    id: 'growingWeave', name: 'The Growing Weave', systems: ['growth', 'loom'],
    flavor: 'Thread spun while the vines are up. It keeps growing on the frame, very slightly, for about a day.',
    active: (s) => wearing(s, 'growth') && s.loom.discoveredShapes.length >= 2,
    bucket: 'brickYield', bonus: 0.15,
  },
  {
    id: 'refractedGrammar', name: 'The Refracted Grammar', systems: ['refraction', 'runes'],
    flavor: 'A rune read through a lens is not the rune you cut. Both are true.',
    active: (s) => wearing(s, 'refraction') && s.bench.solved.length >= 3,
    bucket: 'assaySpeed', bonus: 0.25,
  },
  {
    id: 'pressuredFire', name: 'The Pressured Fire', systems: ['pressure', 'array'],
    flavor: 'The furnace and the shaft on the same circuit. Each one is the other\'s exhaust.',
    active: (s) => wearing(s, 'pressure') && s.ember.bestSustainSec >= 120,
    bucket: 'kilnHeatRamp', bonus: 0.3,
  },
  {
    id: 'absentBoard', name: 'The Absent Board', systems: ['absence', 'chamber'],
    flavor: 'A recorded program running in a world that is not there. It works better than it has any right to.',
    active: (s) => wearing(s, 'absence') && s.chamber.tape.length >= 1,
    bucket: 'offlineEffAdd', bonus: 0.04,
  },

  // --- HYBRID × EVERYTHING ------------------------------------------------
  // 78 Greenhouse hybrids with nothing downstream of them.
  {
    id: 'gardenersHand', name: "The Gardener's Hand", systems: ['greenhouse', 'forge'],
    flavor: 'Hybrid fibre in the haft. The tool is a little alive and forgives a bad angle.',
    active: (s) => s.greenhouse.codex.filter((c) => c.includes('+')).length >= 4,
    bucket: 'drillPower', bonus: 0.14,
  },
  {
    id: 'deepRootstock', name: 'The Deep Rootstock', systems: ['greenhouse', 'mycelium'],
    flavor: 'A hybrid strain fed into the spread. The network takes to it the way it never took to the base stock.',
    active: (s) => s.greenhouse.codex.filter((c) => c.includes('+')).length >= 8,
    bucket: 'dustYield', bonus: 0.16,
  },

  // --- BREW × COMBAT ------------------------------------------------------
  // Brews are spikes; combat is events. They should meet.
  {
    id: 'steadyHand', name: 'The Steady Hand', systems: ['brew', 'bestiary'],
    flavor: 'Something bitter, drunk before the lanes. The telegraphs read a half-beat slower.',
    active: (s) => s.brewing.discovered.length >= 3 && s.combat.kills !== undefined
      && Object.values(s.combat.kills).reduce((a, b) => a + b, 0) >= 25,
    bucket: 'strikePower', bonus: 0.15,
  },

  // --- WARREN × RELIC -----------------------------------------------------
  {
    id: 'warrenFlavour', name: 'The Warren Hoard', systems: ['warrens', 'relics'],
    flavor: 'Relics pulled out of the same warren start to resemble each other. Nobody is sure which way the causation runs.',
    active: (s) => s.relics.held.filter((r) => r.source === 'warren').length >= 3,
    bucket: 'dropRate', bonus: 0.12,
  },

  // --- SPECIES × ANOMALY --------------------------------------------------
  {
    id: 'drawnOut', name: 'Drawn Out', systems: ['wells', 'bestiary'],
    flavor: 'Anomalies bring things up with them. The Bestiary fills faster in a strange season.',
    active: (s) => s.anomalies.resolved >= 3 && s.combat.seen.length >= 12,
    bucket: 'xpGain', bonus: 0.18,
  },

  // --- MATERIALS WITH SOULS (Phase 17): traits reach outward --------------
  {
    id: 'liveTool', name: 'The Live Tool', systems: ['forge', 'polarity'],
    flavor: 'A charged tool in the hand of someone who carries the field with them. The two hum on the same note.',
    active: (s) => wearing(s, 'polarity') && equippedHasTrait(s, 'charged'),
    bucket: 'regen', bonus: 0.16,
  },
  {
    id: 'warmQuenchWarmShell', name: 'The Banked Forge', systems: ['refinery', 'pressure'],
    flavor: 'A warm-tempered tool of warm-trait metal, worked in a hot shaft. It never truly cools between strokes.',
    active: (s) => equippedTemper(s) === 'ember' && equippedHasTrait(s, 'warm'),
    bucket: 'kilnHeatRamp', bonus: 0.25,
  },
  {
    id: 'chargedInStorm', name: 'The Grounded Rod', systems: ['forge', 'weather'],
    flavor: 'A charged tool during a charged season. It draws the storm down the haft and into the work.',
    active: (s) => weatherIs(s, 'magneticStorm') && equippedHasTrait(s, 'charged'),
    bucket: 'chainPower', bonus: 0.3,
  },

  // --- THE SMITHING DEPTH (Phase 16) --------------------------------------
  // The brief asked for these three specifically, and they are the natural
  // extension: the new axis meeting the two that already existed.
  {
    id: 'matchedQuench', name: 'The Matched Quench', systems: ['refinery', 'growth'],
    flavor: 'A tool cooled in the medium of the shell whose signature you carry. The two agree about what the tool is for, which is rarer than it sounds.',
    active: (s) => {
      const t = s.forge.tools.find((x) => x.id === s.forge.equipped)?.temper;
      if (!t) return false;
      // Sap↔growth, void↔absence, ember↔pressure: the temper and the ghost agree.
      const pairs: Record<string, string> = { sap: 'growth', void: 'absence', ember: 'pressure' };
      const sig = pairs[t];
      return sig !== undefined && wearing(s, sig);
    },
    bucket: 'dustYield', bonus: 0.2,
  },
  {
    id: 'writtenAndCooled', name: 'Written and Cooled', systems: ['runes', 'refinery'],
    flavor: 'Runes cut into a tool that was quenched afterwards. The letters set into the metal rather than sitting on it.',
    active: (s) => {
      const tool = s.forge.tools.find((x) => x.id === s.forge.equipped);
      return tool?.temper != null && (s.runes.inscriptions['tool'] ?? []).some((r) => r !== null);
    },
    bucket: 'strikePower', bonus: 0.16,
  },
  {
    id: 'setInAlloy', name: 'Set in Alloy', systems: ['gems', 'crucible'],
    flavor: 'A stone socketed into an alloyed head. The alloy holds it differently — tighter, and it rings at a different pitch.',
    active: (s) => {
      const tool = s.forge.tools.find((x) => x.id === s.forge.equipped);
      return (tool?.sockets.some((g) => g !== null) ?? false)
        && (tool?.alloys.some((a) => a !== null) ?? false);
    },
    bucket: 'cap', bonus: 0.14,
  },
  {
    id: 'nothingWasted', name: 'Nothing Wasted', systems: ['refinery', 'forge'],
    flavor: 'A tool forged out of what an older tool used to be. The smiths call this closing the loop and charge extra to say it.',
    active: (s) => s.forge.salvaged >= 3 && s.refinery.found.length >= 2,
    bucket: 'brickYield', bonus: 0.18,
  },

  // --- MUSEUM × EXPEDITION ------------------------------------------------
  {
    id: 'providedFor', name: 'Provided For', systems: ['museum', 'expeditions'],
    flavor: 'The crews walk further when the cases are full. Ashka says it is morale; Dovekin says it is the better boots.',
    active: (s) => s.museum.completed.length >= 3 && s.expeditions.completed >= 5,
    bucket: 'scripGain', bonus: 0.2,
  },
];

export const CONFLUENCE_BY_ID = new Map(CONFLUENCES.map((c) => [c.id, c]));

/** Every confluence currently live. */
export function activeConfluences(state: GameState): ConfluenceDef[] {
  return CONFLUENCES.filter((c) => {
    try {
      return c.active(state);
    } catch {
      // A confluence reads two systems' state; on a save where one slice is
      // mid-migration it must go quiet, never throw the tick.
      return false;
    }
  });
}

/**
 * Notice anything newly true and record it. Called from the tick — cheap,
 * because every condition is a handful of length checks.
 */
export function noticeConfluences(state: GameState, ctx: EngineCtx): void {
  for (const c of activeConfluences(state)) {
    if (state.confluences.found.includes(c.id)) continue;
    state.confluences.found.push(c.id);
    ctx.emit({ type: 'confluenceFound', id: c.id, name: c.name });
    ctx.dirty();
  }
}

/** A confluence pays only while its condition holds — found is not kept. */
export function confluenceBonus(state: GameState, bucket: Bucket): number {
  let total = 0;
  for (const c of activeConfluences(state)) {
    if (c.bucket === bucket) total += c.bonus;
  }
  return total;
}

export function registerConfluenceModifiers(): void {
  const buckets = new Set(CONFLUENCES.map((c) => c.bucket));
  for (const bucket of buckets) {
    registerModifier({
      id: `confluence.${bucket}`,
      label: 'Confluences',
      bucket,
      value: (s) => foldBonus(bucket, confluenceBonus(s, bucket)),
    });
  }
}

export function defaultConfluenceState(): GameState['confluences'] {
  return { found: [] };
}
