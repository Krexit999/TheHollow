/**
 * THE COMPENDIUM — the in-game wiki. A player should never need a browser tab
 * open beside this game.
 *
 * GENERATED FROM THE REGISTRIES, NOT WRITTEN BY HAND. Materials, currencies,
 * systems and species come out of the same source of truth the engine reads, so
 * the wiki cannot drift from the game. Only the CONCEPTUAL pages (mechanics,
 * the reset ladder, combat, "how do I play this") are authored prose, and those
 * live in pages.ts.
 *
 * PILLAR 5 IS NOT SUSPENDED. This explains mechanics and never solutions. It
 * says a Chord is three motifs of the same shape in a line, found by placing
 * and watching. It does not list the forty Chords. Same for alloy ratios, weave
 * shapes, rune orderings, brew recipes and Bench solutions — the Codex records
 * what YOU found; the Compendium never front-runs it.
 *
 * The test: read it cover to cover and you understand exactly how every system
 * works, with every discovery still ahead of you.
 */
import type { GameState } from '../../engine';
import { allCurrencies } from '../../engine/resources';
import { MATERIALS, type MaterialDef } from '../../engine/materials';
import { SPECIES } from '../../engine/combat/species';
import { allShells } from '../../engine/shells';
import { CLUSTERS } from '../nav';
import { systemCopy } from '../systemCopy';
import type { TabId } from '../store';
import { CONCEPT_PAGES, SYSTEM_ESSAYS, type ConceptPage } from './pages';
import { CONFLUENCES } from '../../engine/systems/confluence';
import { traitsOf, TRAITS } from '../../engine/traits';
import { CURE_RECIPES } from '../../engine/systems/curing';

/** Materials that are the OUTPUT of curing — keyed to the recipe that makes them. */
const CURED_BY = new Map(CURE_RECIPES.map((r) => [r.to, r.id]));

export type EntryKind = 'system' | 'material' | 'currency' | 'species' | 'concept';

export interface CompendiumEntry {
  id: string;
  kind: EntryKind;
  title: string;
  /** One line for the search list. */
  summary: string;
  /** Searchable text beyond the title. */
  keywords: string[];
  /** Section groupings within a kind (shell name, cluster, "The ladder"...). */
  group: string;
  /** Rendered body, as paragraphs and labelled facts. */
  body: { paragraphs: string[]; facts?: Array<[string, string]> };
  /**
   * Deep pages stay honest rather than hidden: if the player has not reached
   * the shell, the entry is LISTED and says so plainly instead of vanishing.
   */
  gate?: (s: GameState) => boolean;
  gateNote?: string;
}

const shellName = (id: string) => allShells().find((s) => s.id === id)?.name ?? id;

/** Has the player set foot in this shell? Depth records survive everything. */
const reached = (shellId: string) => (s: GameState) =>
  (s.depthRecords[shellId] ?? 0) > 0 || s.shell.current === shellId;

// ---------------------------------------------------------------------------
// Systems — 35, from nav.ts + systemCopy.ts + an authored essay per system
// ---------------------------------------------------------------------------

function systemEntries(): CompendiumEntry[] {
  const out: CompendiumEntry[] = [];
  for (const cluster of CLUSTERS) {
    for (const sys of cluster.systems) {
      const copy = systemCopy(sys.id as TabId);
      if (!copy) continue;
      const essay = SYSTEM_ESSAYS[sys.id] ?? [];
      out.push({
        id: `system:${sys.id}`,
        kind: 'system',
        title: copy.title,
        summary: copy.purpose.split('.')[0] + '.',
        keywords: [sys.id, sys.label, cluster.label, 'system', 'room'],
        group: cluster.label,
        body: {
          // Layer 1 gets a paragraph rather than a line, then the essay says
          // why it exists and how it touches the rest of the game.
          paragraphs: [copy.purpose, ...essay],
          facts: [['Where', `${cluster.glyph} ${cluster.label}`]],
        },
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Materials — 132, filterable by shell, rarity, and how you get them
// ---------------------------------------------------------------------------

/** The depth band a rarity opens at — the honest answer to "where do I get X". */
function rarityBand(m: MaterialDef): string {
  const gate = RARITY_DEPTH[m.rarity];
  return gate === 0 ? 'any depth' : `depth ${gate}+`;
}
const RARITY_DEPTH: Record<string, number> = {
  common: 0, rich: 20, pure: 60, flawless: 120, starred: 200, aberrant: 260,
};

/**
 * Traits are VISIBLE — the one place pillar 5 does not apply, because a trait
 * is a property, not a solution. What traits do IN COMBINATION stays discovered.
 */
function traitLine(id: string): string {
  const ts = traitsOf(id);
  if (ts.length === 0) return '';
  return 'It is ' + ts.map((t) => TRAITS[t].name.toLowerCase()).join(' and ') + '. ' + ts.map((t) => TRAITS[t].blurb).join(' ');
}

function materialEntries(): CompendiumEntry[] {
  return MATERIALS.map((m) => {
    const combat = m.source === 'combat';
    const curedBy = CURED_BY.get(m.id);
    const from = curedBy
      ? 'Not dug and not bench-made — CHANGED. A stone left to cure in a cache at depth becomes this, given time.'
      : m.worked
        ? 'Made at a bench, never dug. It only exists because you worked for it.'
        : combat
          ? 'Dropped by the Deepwrought. No amount of digging will turn one up.'
          : `Mined from ${shellName(m.shellId)} rock, ${rarityBand(m)}.`;
    return {
      id: `material:${m.id}`,
      kind: 'material' as const,
      title: m.name,
      summary: `${m.rarity} · ${shellName(m.shellId)} · ${combat ? 'combat-only' : 'mineable'}`,
      keywords: [m.id, m.name, m.rarity, m.shellId, shellName(m.shellId), combat ? 'combat' : 'mineable', 'material', 'ore'],
      group: shellName(m.shellId),
      body: {
        paragraphs: [m.flavor ?? '', from,
          traitLine(m.id),
          'Purity is rolled per find and carries through everything you make from it — a clean stack is worth more than a big one.'].filter(Boolean),
        facts: [
          ['Shell', shellName(m.shellId)],
          ['Rarity', m.rarity],
          ['Traits', traitsOf(m.id).map((t) => TRAITS[t].name).join(', ') || '—'],
          ['Source', combat ? 'Combat only' : 'Mineable'],
          ['Found at', combat ? 'wherever its species lives' : rarityBand(m)],
        ],
      },
      // A cured stone is a DISCOVERY: its entry — flavor and all — stays sealed
      // until you have actually made the cure, so the book never hands over which
      // stone becomes what (pillar 5).
      gate: curedBy
        ? (s: GameState) => s.shaft.curesFound.includes(curedBy)
        : reached(m.shellId),
      gateNote: curedBy
        ? 'Something that only patience makes. You have not made it yet.'
        : `Found in ${shellName(m.shellId)}. You have not been there yet.`,
    };
  });
}

// ---------------------------------------------------------------------------
// Currencies — 39, with what makes it, what spends it, what survives
// ---------------------------------------------------------------------------

const TIER_SURVIVAL: Record<string, string> = {
  shell: 'Washes away at Collapse, and again at every layer above it.',
  meta: 'Survives Collapse, Breach, Recursion and the Spiral. Yours for good.',
  reset: 'Paid by a reset layer and spent on permanent things; survives everything below it.',
};

function currencyEntries(): CompendiumEntry[] {
  return allCurrencies().map((c) => ({
    id: `currency:${c.id}`,
    kind: 'currency' as const,
    title: c.name,
    summary: c.description.split('.')[0] + '.',
    keywords: [c.id, c.name, c.tier, 'currency', 'money'],
    group: c.tier === 'shell' ? 'Shell currencies' : c.tier === 'meta' ? 'Meta currencies' : 'Reset currencies',
    body: {
      paragraphs: [
        c.description,
        TIER_SURVIVAL[c.tier] ?? 'Survives what the reset ladder says it survives.',
        c.resetsOnCollapse
          ? 'A Collapse takes it. That is the trade the Collapse makes.'
          : 'A Collapse leaves it alone.',
      ],
      facts: [
        ['Tier', c.tier],
        ['Survives a Collapse', c.resetsOnCollapse ? 'No' : 'Yes'],
      ],
    },
  }));
}

// ---------------------------------------------------------------------------
// The Deepwrought — ONLY what the player has already met
// ---------------------------------------------------------------------------

function speciesEntries(): CompendiumEntry[] {
  return SPECIES.map((sp) => ({
    id: `species:${sp.id}`,
    kind: 'species' as const,
    title: sp.name,
    summary: `${shellName(sp.shellId)} · threat ${sp.tier}`,
    keywords: [sp.id, sp.name, sp.shellId, 'species', 'deepwrought', 'monster', 'combat'],
    group: shellName(sp.shellId),
    body: {
      paragraphs: [
        sp.flavor ?? 'Something that lives down here.',
        'What it drops and how it fights are recorded in the Bestiary as you learn them — kill one three times and the book gives up its tell.',
      ],
      facts: [
        ['Shell', shellName(sp.shellId)],
        ['Threat tier', String(sp.tier)],
      ],
    },
    // The Bestiary earns its notes; the Compendium reads from it and never
    // spoils a thing you have not met.
    gate: (s: GameState) => s.combat.seen.includes(sp.id),
    gateNote: 'You have not met this one. The Bestiary fills in as you do.',
  }));
}

// ---------------------------------------------------------------------------
// Conceptual pages — hand-authored, in pages.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Confluences — the MECHANIC gets a page; the pairings never do
// ---------------------------------------------------------------------------

/**
 * PILLAR 5, restated for the cross-system layer. The Compendium explains that
 * confluences exist, how they are found, that they pay only while they hold,
 * and that nothing is ever gated behind one. It does NOT list which two
 * systems pay — that is the discovery, and it goes in the Codex when you make
 * it, exactly like a Chord.
 *
 * So: ONE page, generated from the count, and a per-confluence entry that
 * appears only once the player has actually found it.
 */
function confluenceEntries(): CompendiumEntry[] {
  const out: CompendiumEntry[] = [{
    id: 'concept:confluence',
    kind: 'concept',
    title: 'Confluences',
    summary: 'What happens when two systems are true at once.',
    keywords: ['confluence', 'combination', 'cross', 'synergy', 'pair', 'margins'],
    group: 'How it works',
    body: {
      paragraphs: [
        'Some things in this world only happen when two other things are both true. A rune cut into an alloy is not the same as a rune cut into steel. The Lattice reads differently in some weather than in others. There are a number of these.',
        'You find one by being in the state that makes it true — never by unlocking it, and never by being told. The first time it holds, it writes itself into your own margins in the Journal, with a note on what it is.',
        'A confluence PAYS ONLY WHILE IT HOLDS. Take the condition away and the bonus stops; the note stays. This is deliberate — it makes a confluence something you can arrange on purpose rather than a permanent bonus you collected once.',
        'Nothing in this game is ever locked behind one. A confluence is a reward for having two systems, never a requirement to have them: if you never brew, every door is still open to you and one particular lamp simply never lights.',
        'A noticed confluence can be DWELT ON, from the second Breach onward. Attention is bought with Echoes in the Journal: a dwelt-on note pays double while it holds, and a deepened one up to triple. You hold one slot for yourself and one more for every signature you carry — each Breach widens what you can keep in mind. Choosing which notes to dwell on is free to change and loses nothing by the change; everything you leave unattended pays exactly what it always did.',
        'This book will not tell you which pairs pay. That is the whole of the thing.',
      ],
      facts: [
        ['How many there are', String(CONFLUENCES.length)],
        ['How they are found', 'By being in the state'],
        ['While the condition holds', 'It pays'],
        ['When it lapses', 'It stops; the note remains'],
        ['Dwelt on (Echoes)', '×2, deepened up to ×3'],
        ['Attention slots', 'From the second Breach: one, plus one per carried signature'],
        ['Ever required for anything', 'No'],
      ],
    },
  }];

  // The individual ones: LISTED only after you have found them, so the index
  // cannot be read as a checklist of what is left.
  for (const c of CONFLUENCES) {
    out.push({
      id: `confluence:${c.id}`,
      kind: 'concept',
      title: c.name,
      summary: `${c.systems[0]} × ${c.systems[1]}`,
      keywords: [c.id, c.name, ...c.systems, 'confluence'],
      group: 'Your own margins',
      body: {
        paragraphs: [
          c.flavor,
          'It holds while both halves are true, and pays nothing when they are not.',
        ],
        facts: [
          ['Needs', `${c.systems[0]} and ${c.systems[1]}`],
          ['Pays', `+${Math.round(c.bonus * 100)}%`],
        ],
      },
      gate: (s: GameState) => s.confluences.found.includes(c.id),
      gateNote: 'You have not noticed this one yet. It writes itself down when you do.',
    });
  }
  return out;
}

function conceptEntries(): CompendiumEntry[] {
  return CONCEPT_PAGES.map((p: ConceptPage) => ({
    id: `concept:${p.id}`,
    kind: 'concept' as const,
    title: p.title,
    summary: p.summary,
    keywords: [...p.keywords, 'mechanic', 'how'],
    group: p.group,
    body: { paragraphs: p.paragraphs, facts: p.facts },
  }));
}

// ---------------------------------------------------------------------------

let cache: CompendiumEntry[] | null = null;

export function allEntries(): CompendiumEntry[] {
  cache ??= [
    ...conceptEntries(),
    ...confluenceEntries(),
    ...systemEntries(),
    ...materialEntries(),
    ...currencyEntries(),
    ...speciesEntries(),
  ];
  return cache;
}

export function entryById(id: string): CompendiumEntry | undefined {
  return allEntries().find((e) => e.id === id);
}

/** The page a room opens into — contextual entry. */
export function entryForTab(tab: TabId): string {
  return `system:${tab}`;
}

/** Is this entry readable yet? Gated pages are LISTED, never hidden. */
export function isGated(e: CompendiumEntry, s: GameState | null): boolean {
  if (!e.gate || !s) return false;
  return !e.gate(s);
}

/**
 * Search. Deliberately forgiving: exact id, title prefix, keyword, then a
 * substring sweep over the summary, so "Weepstone", "breach" and "why is my
 * income capped" all land somewhere sensible.
 */
export function search(query: string, s: GameState | null): CompendiumEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/);
  const scored: Array<{ e: CompendiumEntry; score: number }> = [];
  for (const e of allEntries()) {
    const title = e.title.toLowerCase();
    const hay = `${title} ${e.summary} ${e.keywords.join(' ')} ${e.body.paragraphs.join(' ')}`.toLowerCase();
    let score = 0;
    if (title === q) score += 100;
    if (title.startsWith(q)) score += 50;
    if (e.keywords.some((k) => k.toLowerCase() === q)) score += 40;
    if (title.includes(q)) score += 20;
    // Every term present anywhere still counts — that is what makes a
    // question like "why is my income capped" resolve.
    const all = terms.every((t) => hay.includes(t));
    if (all) score += 10 + terms.length;
    for (const t of terms) if (title.includes(t)) score += 4;
    if (score > 0) scored.push({ e, score: score - (isGated(e, s) ? 5 : 0) });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 40).map((x) => x.e);
}

export const KIND_LABEL: Record<EntryKind, string> = {
  concept: 'How it works',
  system: 'Systems',
  material: 'Materials',
  currency: 'Currencies',
  species: 'The Deepwrought',
};

export const KIND_ORDER: EntryKind[] = ['concept', 'system', 'material', 'currency', 'species'];
