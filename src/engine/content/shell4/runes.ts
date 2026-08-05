/**
 * RUNE INSCRIPTION — a positional grammar etched into gear. ADJACENT runes
 * interact: Kel-Thur-Kel is not Kel-Kel-Thur. Pairs are discovered by
 * experimenting (pillar 5); runes are FOUND, never bought — the Warrens
 * are their primary source.
 *
 * THE SOFTENED RULING (amending the doc, per instruction): a dissonant
 * sequence ruins the INSCRIPTION — the etched runes are lost and a Silica
 * fee re-preps the surface — but the item itself is never destroyed.
 * Stakes without the trap.
 */
import { D } from '../../decimal';
import type { ActionResult, EngineCtx, GameState } from '../../types';
import { spendCurrency } from '../../resources';
import { registerModifier, type Bucket } from '../../modifiers';
import { lawFlag } from '../../laws';

export const RUNES = ['kel', 'thur', 'ash', 'vey', 'mol', 'sen', 'ur', 'nix'] as const;
export type RuneId = (typeof RUNES)[number];

export const RUNE_NAMES: Record<RuneId, string> = {
  kel: 'Kel (the Edge)', thur: 'Thur (the Weight)', ash: 'Ash (the Ember)', vey: 'Vey (the Veil)',
  mol: 'Mol (the Root)', sen: 'Sen (the Eye)', ur: 'Ur (the Deep)', nix: 'Nix (the Null)',
};

export const RUNE_GLYPHS: Record<RuneId, string> = {
  kel: 'ᚲ', thur: 'ᚦ', ash: 'ᚨ', vey: 'ᚹ', mol: 'ᛗ', sen: 'ᛋ', ur: 'ᚢ', nix: 'ᚾ',
};

/** Ordered pairs: LEFT feeds RIGHT. Order is the grammar. */
export const RUNE_PAIRS: Record<string, { bucket: Bucket; value: number; name: string }> = {
  'kel|thur': { bucket: 'drillPower', value: 1.05, name: 'The Weighted Edge' },
  'thur|kel': { bucket: 'dustYield', value: 1.04, name: 'The Sharpened Load' },
  'ash|mol': { bucket: 'regen', value: 1.04, name: 'The Warm Root' },
  'mol|ash': { bucket: 'kilnRate', value: 1.05, name: 'The Fed Fire' },
  'sen|vey': { bucket: 'dropRate', value: 1.05, name: 'The Seeing Veil' },
  'vey|sen': { bucket: 'xpGain', value: 1.04, name: 'The Veiled Lesson' },
  'ur|nix': { bucket: 'offlineEffAdd', value: 0.01, name: 'The Deep Silence' },
  'nix|ur': { bucket: 'descendCost', value: 0.98, name: 'The Hollow Step' },
  'mol|kel': { bucket: 'chainPower', value: 1.05, name: 'The Rooted Chain' },
  'thur|ash': { bucket: 'brickYield', value: 1.05, name: 'The Heavy Ember' },
  'sen|kel': { bucket: 'dustYield', value: 1.03, name: 'The Aimed Edge' },
  'vey|mol': { bucket: 'dropRate', value: 1.05, name: 'The Hidden Garden' },
  'ur|thur': { bucket: 'cap', value: 1.04, name: 'The Deep Weight' },
  'ash|sen': { bucket: 'assaySpeed', value: 1.2, name: 'The Bright Eye' },
  // Phase 10 — ten more orderings speak (the endgame gear loop's widest
  // axis; 24 of 56 now harmonic, 9 dissonant, 23 still silent for later).
  'kel|ur': { bucket: 'dustYield', value: 1.04, name: 'The Deep Edge' },
  'ur|kel': { bucket: 'descendCost', value: 0.98, name: 'The Cutting Fall' },
  'sen|nix': { bucket: 'dropRate', value: 1.04, name: 'The Eye of Nothing' },
  'nix|sen': { bucket: 'xpGain', value: 1.05, name: 'The Lesson of Absence' },
  'thur|mol': { bucket: 'cap', value: 1.05, name: 'The Rooted Weight' },
  'mol|thur': { bucket: 'regen', value: 1.05, name: 'The Weighted Root' },
  'vey|ash': { bucket: 'kilnRate', value: 1.05, name: 'The Veiled Flame' },
  'ash|kel': { bucket: 'chainPower', value: 1.04, name: 'The Ember Chain' },
  'sen|ur': { bucket: 'assaySpeed', value: 1.05, name: 'The Deep Sight' },
  'nix|vey': { bucket: 'offlineEffAdd', value: 0.01, name: 'The Hidden Nothing' },

  // --- Phase 14: the grammar finishes speaking -----------------------------
  // Eight runes make 56 ordered pairs. Twenty-four spoke, nine were dissonant,
  // and TWENTY-THREE were silent — a finished system (grammar, UI, dissonance,
  // the order-matters rule) starved of the only thing it needed, which was
  // words. Every remaining ordering now says something. The reading stays
  // consistent: the LEFT rune feeds the RIGHT, so 'kel|X' sharpens X and
  // 'X|kel' is X made keen.
  'kel|ash': { bucket: 'kilnHeatRamp', value: 1.06, name: 'The Struck Spark' },
  'kel|mol': { bucket: 'regen', value: 1.03, name: 'The Cut Root' },
  'kel|sen': { bucket: 'dropRate', value: 1.03, name: 'The Edge That Notices' },
  'kel|nix': { bucket: 'descendCost', value: 0.99, name: 'The Edge of Nothing' },
  'thur|vey': { bucket: 'cap', value: 1.03, name: 'The Heavy Veil' },
  'thur|sen': { bucket: 'drillPower', value: 1.05, name: 'The Measured Load' },
  'thur|ur': { bucket: 'cap', value: 1.06, name: 'The Deep Ballast' },
  'thur|thur': { bucket: 'cap', value: 1.04, name: 'Weight Upon Weight' },
  'ash|thur': { bucket: 'brickYield', value: 1.04, name: 'The Banked Coal' },
  'ash|vey': { bucket: 'kilnHeatRamp', value: 1.05, name: 'The Smothered Ember' },
  'ash|nix': { bucket: 'kilnRate', value: 1.03, name: 'The Ember in the Dark' },
  'ash|ash': { bucket: 'kilnRate', value: 1.06, name: 'Fire Feeding Fire' },
  'vey|thur': { bucket: 'dropRate', value: 1.04, name: 'The Weighted Veil' },
  'vey|ur': { bucket: 'offlineEffAdd', value: 0.01, name: 'The Veil Over the Deep' },
  'vey|nix': { bucket: 'dropRate', value: 1.04, name: 'The Veil of Nothing' },
  'mol|vey': { bucket: 'regen', value: 1.04, name: 'The Hidden Root' },
  'mol|ur': { bucket: 'regen', value: 1.06, name: 'The Root That Reaches' },
  'mol|nix': { bucket: 'cap', value: 1.04, name: 'The Root in Absence' },
  'mol|mol': { bucket: 'regen', value: 1.05, name: 'Root Upon Root' },
  'sen|thur': { bucket: 'assaySpeed', value: 1.15, name: 'The Weighed Glance' },
  'sen|ash': { bucket: 'kilnHeatRamp', value: 1.05, name: 'The Watched Fire' },
  'sen|mol': { bucket: 'dropRate', value: 1.06, name: 'The Eye on the Root' },
  'sen|sen': { bucket: 'assaySpeed', value: 1.25, name: 'Eye Meeting Eye' },
  'ur|vey': { bucket: 'offlineEffAdd', value: 0.01, name: 'The Deep Veil' },
  'ur|mol': { bucket: 'cap', value: 1.05, name: 'The Deep Root' },
  'ur|sen': { bucket: 'dropRate', value: 1.06, name: 'The Deep Regard' },
  'ur|ur': { bucket: 'descendCost', value: 0.97, name: 'Deep Beneath Deep' },
  'nix|kel': { bucket: 'dustYield', value: 1.05, name: 'The Nothing That Cuts' },
  'nix|ash': { bucket: 'brickYield', value: 1.03, name: 'The Cold Forge' },
  'nix|mol': { bucket: 'regen', value: 1.03, name: 'The Root of Nothing' },
  'kel|kel': { bucket: 'dustYield', value: 1.06, name: 'Edge Against Edge' },
  // (nix|nix and vey|vey stay DISSONANT — a rune doubled on itself is the one
  // shape the grammar refuses, and those two were always the refusal.)
};

/** Dissonant pairs: the inscription fails and the runes are lost. */
export const DISSONANT: ReadonlySet<string> = new Set([
  'kel|vey', 'vey|kel', 'thur|nix', 'nix|thur', 'ash|ur', 'ur|ash',
  'mol|sen', 'nix|nix', 'vey|vey',
]);

export const INSCRIPTION_TARGETS = ['tool', 'offhand', 'lantern', 'harness', 'boots'] as const;
export const RUNE_SLOTS = 3;
export const REINSCRIBE_SILICA = 30;
export const PRACTICE_SILICA = 5;

/**
 * TOOL RUNE-SLOTS (v22): the tool gets MORE room the higher its tier, so a great
 * implement carries a longer sequence — and a longer sequence is where TRIPLES live
 * (three consecutive runes speaking together, below). Gear stays at the base three.
 */
export function runeSlots(state: GameState, target: string): number {
  if (target !== 'tool') return RUNE_SLOTS;
  const tier = state.forge.tools[state.forge.equipped]?.tier ?? 1;
  return Math.min(5, RUNE_SLOTS + Math.floor((tier - 1) / 5)); // I-V:3, VI-X:4, XI-XV:5
}

/**
 * THREE-RUNE TRIPLES (v22): a run of three CONSECUTIVE runes can say a third thing
 * on top of its two adjacent pairs — an interaction that only exists once a tool is
 * long enough to hold three in a row. Discovered by carving, never listed (pillar 5).
 */
export const RUNE_TRIPLES: Record<string, { bucket: Bucket; value: number; name: string }> = {
  'kel|thur|kel': { bucket: 'dustYield', value: 1.08, name: 'The Balanced Blade' },
  'mol|ash|mol': { bucket: 'regen', value: 1.08, name: 'The Tended Hearth' },
  'sen|vey|sen': { bucket: 'dropRate', value: 1.08, name: 'The Watching Dark' },
  'ur|thur|ur': { bucket: 'cap', value: 1.09, name: 'The Deepest Weight' },
  'ash|kel|ash': { bucket: 'kilnRate', value: 1.08, name: 'The Struck Forge' },
  'nix|ur|nix': { bucket: 'descendCost', value: 0.96, name: 'The Long Fall' },
  'kel|kel|kel': { bucket: 'dustYield', value: 1.1, name: 'Three Edges' },
  'mol|mol|mol': { bucket: 'regen', value: 1.09, name: 'The Deep Garden' },
};

export function sequenceTriples(seq: (string | null)[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + 2 < seq.length; i++) {
    if (seq[i] && seq[i + 1] && seq[i + 2]) out.push(`${seq[i]}|${seq[i + 1]}|${seq[i + 2]}`);
  }
  return out;
}

export function runesUnlocked(state: GameState): boolean {
  return state.shell.breachCount >= 3 || Object.values(state.runes.found).some((n) => n > 0);
}

/**
 * PRACTICE ON SCRAP (v22): try a sequence on scrap for a little Silica. It tells you
 * the SHAPE of the join — how many pairs RANG and how many FOUGHT — and nothing else.
 * PILLAR 5: it never names a pair, never reveals an effect, never touches the codex
 * (`pairsSeen`), and never spends your real runes. You learn that adjacency and order
 * matter; which orderings PAY stays a thing you commit to a real tool to find.
 */
export function practiceRunes(state: GameState, ctx: EngineCtx, sequence: (string | null)[]): ActionResult {
  const pairs = sequencePairs(sequence);
  if (pairs.length === 0) return { ok: false, reason: 'Set at least two runes to practise a join' };
  if (!spendCurrency(state, 'silica', D(PRACTICE_SILICA))) {
    return { ok: false, reason: `${PRACTICE_SILICA} Silica for the scrap` };
  }
  let harmonic = 0, dissonant = 0;
  for (const p of pairs) {
    if (DISSONANT.has(p)) dissonant += 1;
    else if (RUNE_PAIRS[p]) harmonic += 1;
    // a "silent" pair (neither) teaches only that it said nothing — counted as neither.
  }
  const pr = (state.runes.practiced ??= { harmonic: 0, dissonant: 0 });
  pr.harmonic += harmonic; pr.dissonant += dissonant;
  ctx.dirty();
  ctx.emit({ type: 'runePracticed', harmonic, dissonant });
  return { ok: true, data: { harmonic, dissonant, silent: pairs.length - harmonic - dissonant } };
}

export function pairKey(a: string, b: string): string {
  return `${a}|${b}`;
}

export function sequencePairs(seq: (string | null)[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < seq.length; i++) {
    if (seq[i] && seq[i + 1]) out.push(pairKey(seq[i]!, seq[i + 1]!));
  }
  return out;
}

export function grantRune(state: GameState, ctx: EngineCtx, runeId: RuneId, n = 1): void {
  state.runes.found[runeId] = (state.runes.found[runeId] ?? 0) + n;
  ctx.emit({ type: 'runeFound', runeId });
}

/**
 * Etch a full sequence in one act. Dissonance ruins the inscription (runes
 * lost, surface fouled until a Silica re-prep); harmony etches and records
 * every discovered pair in the codex.
 */
export function inscribe(
  state: GameState,
  ctx: EngineCtx,
  target: (typeof INSCRIPTION_TARGETS)[number],
  sequence: (RuneId | null)[],
): ActionResult {
  if (!INSCRIPTION_TARGETS.includes(target)) return { ok: false, reason: 'No surface there' };
  const seq = sequence.slice(0, runeSlots(state, target));
  const used: Record<string, number> = {};
  for (const r of seq) {
    if (!r) continue;
    used[r] = (used[r] ?? 0) + 1;
    if ((state.runes.found[r] ?? 0) < used[r]!) return { ok: false, reason: `Short of ${RUNE_NAMES[r]}` };
  }
  if (state.runes.fouled[target]) {
    if (!spendCurrency(state, 'silica', D(REINSCRIBE_SILICA))) {
      return { ok: false, reason: `The surface is fouled — ${REINSCRIBE_SILICA} Silica to re-prep` };
    }
    state.runes.fouled[target] = false;
  }
  for (const [r, n] of Object.entries(used)) state.runes.found[r]! -= n;
  const pairs = sequencePairs(seq);
  const dissonant = pairs.some((p) => DISSONANT.has(p));
  if (dissonant) {
    state.runes.inscriptions[target] = [null, null, null];
    state.runes.fouled[target] = true;
    ctx.dirty();
    ctx.emit({ type: 'inscriptionFailed', target });
    return { ok: true, data: { dissonant: true } };
  }
  const slots = runeSlots(state, target);
  state.runes.inscriptions[target] = [...seq, null, null, null, null, null].slice(0, slots);
  for (const p of pairs) {
    if (RUNE_PAIRS[p] && !state.runes.pairsSeen.includes(p)) {
      state.runes.pairsSeen.push(p);
      ctx.emit({ type: 'pairDiscovered', pair: p });
    }
  }
  // TRIPLES (v22): a run of three consecutive runes may say a third thing. Recorded
  // in the same codex, distinguishable by the two bars in the key.
  const triples = sequenceTriples(seq);
  for (const t of triples) {
    if (RUNE_TRIPLES[t] && !state.runes.pairsSeen.includes(t)) {
      state.runes.pairsSeen.push(t);
      ctx.emit({ type: 'pairDiscovered', pair: t });
    }
  }
  // ORDER-OVER-TIME (v22): a carve appends its LEAD rune to the trail with the moment
  // it landed. Some combos only complete when their runes are carved in order across
  // time — the slowest discovery in the game.
  if (target === 'tool' && seq[0]) logCarve(state, ctx, seq[0]);
  ctx.dirty();
  ctx.emit({ type: 'inscribed', target });
  return { ok: true, data: { dissonant: false, pairs: pairs.filter((p) => RUNE_PAIRS[p]) } };
}

export function activePairs(state: GameState): string[] {
  const out: string[] = [];
  const mirror = lawFlag(state, 'runeMirror');
  for (const target of INSCRIPTION_TARGETS) {
    for (const p of sequencePairs(state.runes.inscriptions[target] ?? [])) {
      if (RUNE_PAIRS[p]) out.push(p);
      // THE MIRRORED GRAMMAR (law): every pair also speaks backwards.
      if (mirror) {
        const [a, b] = p.split('|');
        const rev = `${b}|${a}`;
        if (RUNE_PAIRS[rev]) out.push(rev);
      }
    }
  }
  return out;
}

/** Active TRIPLES across all inscriptions (consecutive threes that are defined). */
export function activeTriples(state: GameState): string[] {
  const out: string[] = [];
  for (const target of INSCRIPTION_TARGETS) {
    for (const t of sequenceTriples(state.runes.inscriptions[target] ?? [])) {
      if (RUNE_TRIPLES[t]) out.push(t);
    }
  }
  return out;
}

export function registerRuneModifiers(): void {
  const buckets = [...new Set([
    ...Object.values(RUNE_PAIRS).map((p) => p.bucket),
    ...Object.values(RUNE_TRIPLES).map((t) => t.bucket),
  ])];
  for (const bucket of buckets) {
    const additive = bucket === 'offlineEffAdd';
    registerModifier({
      id: `runes.${bucket}`,
      label: 'Rune pairs + triples (etched)',
      bucket,
      value: (s) => {
        let mult = additive ? 0 : 1;
        for (const p of activePairs(s)) {
          const def = RUNE_PAIRS[p]!;
          if (def.bucket !== bucket) continue;
          if (additive) mult += def.value; else mult *= def.value;
        }
        for (const t of activeTriples(s)) {
          const def = RUNE_TRIPLES[t]!;
          if (def.bucket !== bucket) continue;
          if (additive) mult += def.value; else mult *= def.value;
        }
        return mult;
      },
    });
  }
}

// ---------------------------------------------------------------------------
// ORDER-OVER-TIME COMBOS (v22) — the slowest discovery in the game
// ---------------------------------------------------------------------------

/** Real play-seconds that must pass between consecutive carves for a temporal
 *  combo to count them. Deliberately long — this is meant to span sessions. */
export const TEMPORAL_MIN_GAP = 1800; // 30 minutes of play between carves
const CARVE_TRAIL_MAX = 40;

export const TEMPORAL_COMBOS: Array<{ id: string; name: string; runes: RuneId[]; bucket: Bucket; value: number; note: string }> = [
  { id: 'slowdawn', name: 'The Slow Dawn', runes: ['mol', 'ash', 'sen'], bucket: 'dropRate', value: 1.08, note: 'Root, then ember, then the eye — carved a session apart each. Only patience reads it.' },
  { id: 'longfall', name: 'The Long Descent', runes: ['ur', 'nix', 'thur'], bucket: 'descendCost', value: 0.94, note: 'The deep, the nothing, the weight — in that order, unhurried. The shaft opens.' },
  { id: 'temper', name: 'The Tempered Year', runes: ['kel', 'thur', 'kel'], bucket: 'dustYield', value: 1.09, note: 'Edge, weight, edge — worked slowly into the same tool over a long while.' },
];

/** Append a carved lead-rune to the trail (with the play-second), then look for a
 *  temporal combo the trail has now completed. */
export function logCarve(state: GameState, ctx: EngineCtx, rune: string): void {
  const trail = (state.runes.carveTrail ??= []);
  trail.push({ rune, at: state.stats.playTimeSec });
  while (trail.length > CARVE_TRAIL_MAX) trail.shift();
  const found = (state.runes.temporalFound ??= []);
  /**
   * THE PALINDROME LAW (A.99) — "Progressions also read right-to-left".
   *
   * `laws.ts`'s `progressionPalindrome` slot has had a name and no reader since
   * Phase 10, and THIS is what it was named for: a TEMPORAL_COMBO is a
   * progression carved over sessions, and `trailCompletes` scans it strictly
   * left-to-right. The law says the world will also read your trail backwards.
   *
   * REACH, NOT RATE, and the distinction is exact: a combo pays what it always
   * paid, through the same modifier, once. The law changes only whether the
   * order you happened to carve in COUNTS — which is the difference between
   * "you did the wrong thing" and "you did it the other way round".
   *
   * ITS OWN RED TEST IS AUTHORED: 'The Tempered Year' is `kel · thur · kel`,
   * already a palindrome, so the law must change nothing whatsoever about it.
   * A reader that "works" by finding that one is a reader that does nothing.
   */
  const bothWays = lawFlag(state, 'progressionPalindrome');
  for (const combo of TEMPORAL_COMBOS) {
    if (found.includes(combo.id)) continue;
    const hit = trailCompletes(trail, combo.runes)
      || (bothWays && trailCompletes(trail, [...combo.runes].reverse()));
    if (hit) {
      found.push(combo.id);
      ctx.emit({ type: 'temporalFound', id: combo.id, name: combo.name });
    }
  }
}

/** Does the trail contain the combo's runes IN ORDER, each at least the gap after
 *  the previous match? A greedy left-to-right scan. */
function trailCompletes(trail: { rune: string; at: number }[], runes: RuneId[]): boolean {
  let need = 0;
  let lastAt = -Infinity;
  for (const e of trail) {
    if (e.rune === runes[need] && e.at - lastAt >= (need === 0 ? 0 : TEMPORAL_MIN_GAP)) {
      lastAt = e.at;
      need += 1;
      if (need === runes.length) return true;
    }
  }
  return false;
}

export function registerTemporalModifiers(): void {
  const buckets = [...new Set(TEMPORAL_COMBOS.map((t) => t.bucket))];
  for (const bucket of buckets) {
    const additive = bucket === 'offlineEffAdd';
    registerModifier({
      id: `temporal.${bucket}`,
      label: 'Order-over-time carvings',
      bucket,
      value: (s) => {
        let mult = additive ? 0 : 1;
        for (const c of TEMPORAL_COMBOS) {
          if (c.bucket !== bucket) continue;
          if ((s.runes.temporalFound ?? []).includes(c.id)) {
            if (additive) mult += c.value; else mult *= c.value;
          }
        }
        return mult;
      },
    });
  }
}

export function defaultRunesState(): GameState['runes'] {
  return {
    found: {},
    inscriptions: { tool: [null, null, null], offhand: [null, null, null], lantern: [null, null, null], harness: [null, null, null], boots: [null, null, null] },
    fouled: {},
    pairsSeen: [],
    practiced: { harmonic: 0, dissonant: 0 },
    carveTrail: [],
    temporalFound: [],
    castKinds: {},
  };
}
