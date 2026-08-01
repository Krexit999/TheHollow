/**
 * COMPENDIUM COVERAGE, in the spirit of copy-coverage.ts.
 *
 * Every registered material, currency and system must have an entry, and no
 * entry may point at something the registries do not contain. The wiki is
 * generated from the source of truth, so a gap here means either the
 * generator missed a registry or a registry grew a member the generator does
 * not understand — both silent, both the kind of drift this exists to stop.
 *
 * It also enforces the PILLAR 5 rule mechanically: no entry may contain the
 * literal answers to a discovery system. If a rune ordering, a transmute
 * chain or a trait pairing ever leaks into the wiki text, this fails.
 *
 * Usage: npx tsx scripts/compendium-coverage.ts
 */
import { ensureContentLoaded } from '../src/engine/content';
ensureContentLoaded();

import { allEntries } from '../src/ui/compendium/data';
import { MATERIALS } from '../src/engine/materials';
import { allCurrencies } from '../src/engine/resources';
import { CLUSTERS } from '../src/ui/nav';
import { RUNE_PAIRS } from '../src/engine/content/shell4/runes';
import { CHAINS } from '../src/engine/systems/refinery';
import { materialDef } from '../src/engine/materials';
import { TRAIT_PAIRS } from '../src/engine/traits';
import { CURE_RECIPES } from '../src/engine/systems/curing';

const entries = allEntries();
const ids = new Set(entries.map((e) => e.id));
let failures = 0;
const fail = (msg: string) => { console.error('  MISSING  ' + msg); failures++; };

// --- coverage --------------------------------------------------------------
const systems = CLUSTERS.flatMap((c) => c.systems);
for (const s of systems) if (!ids.has(`system:${s.id}`)) fail(`system '${s.id}' has no Compendium entry`);
for (const m of MATERIALS) if (!ids.has(`material:${m.id}`)) fail(`material '${m.id}' has no Compendium entry`);
for (const c of allCurrencies()) if (!ids.has(`currency:${c.id}`)) fail(`currency '${c.id}' has no Compendium entry`);

// --- no orphans ------------------------------------------------------------
const matIds = new Set(MATERIALS.map((m) => m.id));
const curIds = new Set(allCurrencies().map((c) => c.id));
const sysIds = new Set<string>(systems.map((s) => String(s.id)));
for (const e of entries) {
  const [kind, rest] = e.id.split(':') as [string, string];
  if (kind === 'material' && !matIds.has(rest)) fail(`entry '${e.id}' has no such material`);
  if (kind === 'currency' && !curIds.has(rest)) fail(`entry '${e.id}' has no such currency`);
  if (kind === 'system' && !sysIds.has(rest)) fail(`entry '${e.id}' has no such system`);
  if (!e.title || !e.summary) fail(`entry '${e.id}' is missing a title or summary`);
  if (e.body.paragraphs.length === 0) fail(`entry '${e.id}' has no body`);
}

// --- PILLAR 5: mechanics, never solutions ----------------------------------
// The wiki must never contain a discovery ANSWER. Chord names and rune
// orderings are the two that would be easiest to leak by accident.
const corpus = entries.map((e) => `${e.title} ${e.body.paragraphs.join(' ')}`).join(' ').toLowerCase();

/**
 * MATCH ON WORD BOUNDARIES, NOT SUBSTRINGS.
 *
 * The first version of this check used `corpus.includes(name)` and a
 * three-strikes threshold to absorb the false positives that produced. Both
 * were wrong. The substring match was firing INSIDE longer words — the Chord
 * "The Press" matched inside "The Pressured Fire", and the rune ordering
 * `ur-kel` matched inside "thur-kel" — and the threshold was papering over
 * those bugs by allowing two real leaks through.
 *
 * Precise matching means the check can go back to being a TRIPWIRE: one
 * genuine leak fails the build. The single real collision left (there is a
 * Chord named "The Grammar", and the runes page correctly says order is the
 * grammar) is named here explicitly, so it is a documented exemption rather
 * than a tolerance band that hides the next real one.
 */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const saysWord = (phrase: string): boolean =>
  new RegExp(`(^|[^a-z0-9])${escapeRe(phrase.toLowerCase())}($|[^a-z0-9])`).test(corpus);

/**
 * Known word-collisions between content names and ordinary English. Each one
 * is a phrase the wiki is ALLOWED to say because it is not revealing the thing
 * that shares its name. Keep this list short and justified.
 */
const COLLISIONS = new Set([
  'the grammar',  // Chord vs. the runes page teaching that order is grammar
]);

const runeHits = Object.keys(RUNE_PAIRS).filter((key) => {
  const [a, b] = key.split('|');
  const ordering = `${a}-${b}`;
  // The runes page uses ONE ordering as the worked example of the rule; that
  // is teaching the grammar, not handing over the answer table.
  if (ordering === 'kel-thur' || ordering === 'thur-kel') return false;
  return saysWord(ordering);
});

/**
 * Phase 16 adds a third discovery system, so it gets the same guard: the
 * Compendium may say transmutation exists and how the bench works, and may
 * never name a chain or spell out a pair.
 */
const chainHits = CHAINS
  .map((c) => c.name)
  .filter((name) => !COLLISIONS.has(name.toLowerCase()) && saysWord(name));

const pairHits = CHAINS
  .filter((c) => {
    // "X and Y" or "X + Y" in the same sentence would be handing over a recipe.
    const a = materialDef(c.a).name.toLowerCase();
    const b = materialDef(c.b).name.toLowerCase();
    return new RegExp(`${escapeRe(a)}[^.]{0,40}${escapeRe(b)}|${escapeRe(b)}[^.]{0,40}${escapeRe(a)}`).test(corpus);
  })
  .map((c) => c.id);

/**
 * Phase 17: trait PAIRS are the discovered layer of the parts system. Trait
 * NAMES (keen, tough) are visible properties and appear everywhere; but the
 * PAIR names ("The Shatter", "The Anvil") are the discovery, and naming two
 * traits together as an interaction spells out a solution. Guard both.
 */
const traitPairHits = TRAIT_PAIRS
  .map((p) => p.name)
  .filter((name) => !COLLISIONS.has(name.toLowerCase()) && saysWord(name));

// Scope the "two traits named together" scan to AUTHORED concept prose. A
// generated material entry legitimately states its OWN two traits ("It is dense
// and tough") — that is visible, not a leak. A real leak would be a concept
// page DESCRIBING a pairing's effect, and that is what this catches.
const conceptCorpus = entries
  .filter((e) => e.kind === 'concept')
  .map((e) => `${e.title} ${e.body.paragraphs.join(' ')}`)
  .join(' ')
  .toLowerCase();
const traitComboHits = TRAIT_PAIRS
  .filter((p) => {
    const a = p.a.toLowerCase();
    const b = p.b.toLowerCase();
    return new RegExp(`\\b${a}\\b[^.]{0,30}\\b${b}\\b|\\b${b}\\b[^.]{0,30}\\b${a}\\b`).test(conceptCorpus);
  })
  .map((p) => `${p.a}+${p.b}`);

/**
 * Phase 19: CURING is the fifth discovery system — which stone turns into which,
 * given time at depth, is found not listed. The result is a `worked` material
 * whose own entry is sealed until you make it; the leak this guards is a CONCEPT
 * page naming a cure's source AND result in one sentence, which would be the
 * recipe table in prose. Scoped to concept corpus for the same reason as the
 * trait/cast combos: a material entry legitimately describes its own nature.
 */
const cureComboHits = CURE_RECIPES
  .filter((r) => {
    const a = materialDef(r.from).name.toLowerCase();
    const b = materialDef(r.to).name.toLowerCase();
    return new RegExp(`${escapeRe(a)}[^.]{0,40}${escapeRe(b)}|${escapeRe(b)}[^.]{0,40}${escapeRe(a)}`).test(conceptCorpus);
  })
  .map((r) => r.id);

const leaks = [
  ...runeHits.map((r) => `rune ordering ${r}`),
  ...chainHits.map((c) => `transmute chain "${c}"`),
  ...pairHits.map((c) => `chain PAIR for '${c}'`),
  ...traitPairHits.map((c) => `trait pair "${c}"`),
  ...traitComboHits.map((c) => `trait combo ${c} named together`),
  ...cureComboHits.map((c) => `cure pairing for '${c}' spelled out`),
];
if (leaks.length > 0) {
  console.error('\n  PILLAR 5 VIOLATION — the Compendium is giving away answers:');
  for (const l of leaks.slice(0, 10)) console.error('    ' + l);
  failures += leaks.length;
}

// --- report ----------------------------------------------------------------
const byKind: Record<string, number> = {};
for (const e of entries) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
console.log('COMPENDIUM COVERAGE');
console.log(`  systems    ${byKind['system'] ?? 0} / ${systems.length}`);
console.log(`  materials  ${byKind['material'] ?? 0} / ${MATERIALS.length}`);
console.log(`  currencies ${byKind['currency'] ?? 0} / ${allCurrencies().length}`);
console.log(`  concepts   ${byKind['concept'] ?? 0} (hand-authored)`);
console.log(`  TOTAL      ${entries.length} entries`);
console.log(failures === 0 ? '\nno gaps, no orphans, no spoilers ✓' : `\n${failures} PROBLEMS`);
process.exit(failures === 0 ? 0 : 1);
