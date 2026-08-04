/**
 * Ore taxonomy — the substrate for alloys, runes, brewing, merchants,
 * contracts, and relics. Materials are DATA: 132 across seven shells, each
 * visually defined as palette + facet count + shimmer profile (the art is
 * generated, never drawn). Most are mineable; SIX are Loam REMAINS, dug at named
 * places (`remainsAt`); TWENTY-SIX still say `source: 'combat'` and are therefore
 * obtainable by no route at all, combat having been cut — that is a known, open
 * gap covering five shells, not a description of a working system.
 *
 * Every drop rolls a purity 0-100. Distributions are tight at low rarities
 * and wide at high ones — a Flawless stone with a bad roll should sting.
 *
 * Materials are POSSESSIONS, not shell currency: they survive Collapse.
 */
import type { Bucket } from './modifiers';
// Content, imported by the registry, and it is one-way: `roll.ts` is a pure
// authored list with no imports of its own, so there is no cycle. The remains
// need a geography (`remainsAt`), and this is where the geography lives.
import { authoredRoll } from './content/rolls';
import { shellDefOrNull } from './shells';

export type MaterialRarity = 'common' | 'rich' | 'pure' | 'flawless' | 'starred' | 'aberrant';

export const RARITIES: MaterialRarity[] = ['common', 'rich', 'pure', 'flawless', 'starred', 'aberrant'];

export type Shimmer = 'none' | 'soft' | 'crystalline' | 'aberrant';

export interface MaterialDef {
  id: string;
  name: string;
  /** 'loam' | 'ferrite' | 'verdance' | 'glassmere' | 'cinder' | 'hollow' | 'aleph' */
  shellId: string;
  rarity: MaterialRarity;
  /** [deep, mid, light] — the generated icon's gradient stops. */
  palette: [string, string, string];
  facets: number;
  shimmer: Shimmer;
  /**
   * MATERIALS THAT DO NOT COME OUT OF THE RARITY TABLE.
   *   'combat'  — the Deepwrought dropped them. COMBAT IS CUT (types.ts:88),
   *               so every one of these is unobtainable by any route. 31 of the
   *               registry's orphans are stranded here; A.84 re-sourced Loam's
   *               six and the other 26 are ledgered, not fixed.
   *   'deep'    — the compaction gates drop them (systems/compaction.ts).
   *   'remains' — they are IN THE ROCK, at named places. See `remainsAt`.
   * Every pool in this file filters on `!m.source`, so one flag keeps a
   * material out of ordinary chips AND out of cracked geodes; `remains` then
   * puts a place back under it, which `combat` never had once the fighting went.
   */
  source?: 'combat' | 'deep' | 'remains' | 'still' | 'alloy';
  /**
   * WORKED materials are made, never found: refinery byproducts, salvage
   * residue, transmutation intermediates, tempering media. rollDrop filters
   * on this, so a worked material can never appear in the rock — which is the
   * whole point of it being a worked material.
   */
  worked?: boolean;
  flavor?: string;
}

// ---------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------

/** Mean and spread per rarity. Aberrant ignores this and rolls uniform. */
export const PURITY_ROLL: Record<MaterialRarity, { mean: number; sigma: number }> = {
  common: { mean: 45, sigma: 7 },
  rich: { mean: 50, sigma: 10 },
  pure: { mean: 55, sigma: 14 },
  flawless: { mean: 58, sigma: 20 },
  starred: { mean: 62, sigma: 24 },
  aberrant: { mean: 50, sigma: 0 }, // uniform — see rollPurity
};

/** Box-Muller, clamped to [1, 100]. rng defaults to Math.random. */
export function rollPurity(rarity: MaterialRarity, rng: () => number = Math.random): number {
  if (rarity === 'aberrant') return Math.max(1, Math.min(100, Math.floor(rng() * 100) + 1));
  const { mean, sigma } = PURITY_ROLL[rarity];
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(1, Math.min(100, Math.round(mean + z * sigma)));
}

/** Purity bands — inventory stacks by these, not exact values. */
/**
 * SIX BANDS. `pristine` is A.68 and sits ABOVE the natural range.
 *
 * A drop rolls 0-100, so `exalted` [95,100] was the top of the ladder AND the
 * end of it: a player with a mountain of exalted stock had nothing left to
 * spend it on, which is exactly the dead end the Refinery exists to prevent.
 *
 * `pristine` is therefore UNROLLABLE — nothing in the rock produces it and no
 * drop table can. It exists only at the end of a refine, which makes it the
 * one band that is purely MADE. That is also why adding it is safe for every
 * existing save: no held stack can already be in it, and no band boundary
 * below it moved, so nobody wakes up in a different band than they went to
 * sleep in.
 */
export type PurityBand = 'poor' | 'fair' | 'good' | 'fine' | 'exalted' | 'pristine';

export const BANDS: PurityBand[] = ['poor', 'fair', 'good', 'fine', 'exalted', 'pristine'];

export const BAND_RANGES: Record<PurityBand, [number, number]> = {
  poor: [0, 39],
  fair: [40, 59],
  good: [60, 79],
  fine: [80, 94],
  exalted: [95, 100],
  /** Above what the world produces. Only a refine reaches here. */
  pristine: [101, 110],
};

export const BAND_LABELS: Record<PurityBand, string> = {
  poor: 'Poor',
  fair: 'Fair',
  good: 'Good',
  fine: 'Fine',
  exalted: 'Exalted',
  pristine: 'Pristine',
};

export function bandOf(purity: number): PurityBand {
  if (purity >= 101) return 'pristine';
  if (purity >= 95) return 'exalted';
  if (purity >= 80) return 'fine';
  if (purity >= 60) return 'good';
  if (purity >= 40) return 'fair';
  return 'poor';
}

// ---------------------------------------------------------------------------
// The taxonomy — Shell I live, the rest declared and dormant.
// ---------------------------------------------------------------------------

const M = (
  id: string,
  name: string,
  shellId: string,
  rarity: MaterialRarity,
  palette: [string, string, string],
  facets: number,
  shimmer: Shimmer,
  flavor?: string,
  worked?: boolean,
  source?: 'combat' | 'deep',
): MaterialDef => ({
  id, name, shellId, rarity, palette, facets, shimmer, flavor,
  ...(worked ? { worked } : {}), ...(source ? { source } : {}),
});

export const MATERIALS: MaterialDef[] = [
  // ================= WORKED MATERIALS (Phase 16) ==========================
  // These are NOT mined. Every one exists because a new ROLE appeared this
  // phase and no existing material could fill it — the bar the brief set, and
  // the reason there are seven of these rather than thirty.
  //
  // They carry `shellId: 'loam'` only because a material must name a shell for
  // the icon generator; `worked: true` is what marks them, and it keeps them
  // out of every drop table (rollDrop filters on it) so they can only ever be
  // MADE.
  M('refineslag', 'Slag', 'loam', 'common', ['#3a3632', '#5c554c', '#807567'], 3, 'none',
    'What is left when you cook three stones down to one. Coarse, heavy, and — annoyingly — useful.', true),
  M('salvagedust', 'Salvage Dust', 'loam', 'common', ['#4a4238', '#6e6151', '#96866e'], 4, 'none',
    'A tool ground back to what it was made of, minus everything that made it a tool.', true),
  M('temperash', 'Temper Ash', 'loam', 'rich', ['#3e3a44', '#5f5868', '#8a8096'], 6, 'soft',
    'The residue in the bottom of a quench trough. It holds the shape of the last thing cooled in it.', true),
  M('bindingclay', 'Binding Clay', 'loam', 'rich', ['#4a3a2e', '#77604a', '#a68a68'], 5, 'none',
    'Slag worked wet until it takes an edge. The intermediate everything coarse passes through.', true),
  M('truesilver', 'Truesilver', 'loam', 'pure', ['#6a7480', '#9aa8b6', '#d2dde6'], 8, 'crystalline',
    'Refined past the point where the impurity had a name. Smiths speak of it in the singular.', true),
  M('voidresidue', 'Void Residue', 'loam', 'flawless', ['#241f2e', '#443a56', '#6b5c85'], 7, 'aberrant',
    'Whatever is left when a Hollow stone is transmuted and the transmutation mostly works.', true),
  M('lawfiling', 'Law Filing', 'loam', 'starred', ['#4a4326', '#867a3e', '#d9c25c'], 9, 'aberrant',
    'Swarf from cutting something that should not have been cuttable. It files back.', true),

  // ================= CURED MATERIALS (Phase 19) ===========================
  // Not mined and not made at a bench — CHANGED. A stone left in a cache at depth
  // for real time becomes one of these. `worked: true` keeps them out of every
  // drop table (they can only ever be the OUTPUT of curing), exactly like the
  // Phase 16 worked set. What cures into what, and how long it takes, is a
  // discovery — this registry names the results, never the recipe table the
  // player builds by leaving things alone. (See CURE_RECIPES in shaftSys.ts.)
  M('rustochre', 'Rust Ochre', 'loam', 'rich', ['#5a2418', '#94402a', '#c86a44'], 5, 'soft',
    'Ochre left damp in the deep until the iron in it found the air. Redder, harder, and it remembers the shape of the cache.', true),
  M('setsilk', 'Set Silk', 'loam', 'pure', ['#4a4436', '#7c7458', '#b8ad86'], 7, 'soft',
    'Wormsilk left to set. It stopped being thread and started being cloth without anyone weaving it.', true),
  M('stillglass', 'Stillglass', 'loam', 'pure', ['#243a34', '#3e6a5c', '#6fb098'], 8, 'crystalline',
    'Rootglass that held still long enough for the charge in it to settle into a line. It rings true now.', true),
  M('bloomrust', 'Bloomrust', 'ferrite', 'rich', ['#4a2c1c', '#8a4e2e', '#c47a44'], 6, 'soft',
    'Rustmarrow taken all the way through the rust to the stable bloom on the far side. It will not rot further.', true),
  M('sunamber', 'Sunamber', 'verdance', 'pure', ['#5a3a12', '#a06e1e', '#e0b048'], 8, 'crystalline',
    'Sap left long enough stops being sap. Three days in the deep, and not a day less, and it comes out gold and true.', true),
  M('frostpane', 'Frostpane', 'glassmere', 'pure', ['#3a4650', '#647688', '#a8c0d4'], 8, 'crystalline',
    'Frostsand that settled, grain by grain, into a single clear pane. Light stands still in it.', true),
  M('cinderglass', 'Cinderglass', 'cinder', 'pure', ['#3a1e14', '#6e3620', '#a85c34'], 7, 'crystalline',
    'Ash grit left where the deep is warm until it fused. Heavy, dark, and it holds heat like a grudge.', true),

  // ================= EXPORT MATERIALS (Part B spine) ======================
  // One per shell, made by that shell's own craft and DEMANDED by the next
  // shell's signature infrastructure — the reason a shell needs the shell
  // before it. `worked: true` keeps them out of every drop table; they ride
  // the Hold and survive Breach like any material, and Serra hauls them up
  // the stair once their home shell is behind you. (The Hollow's export is
  // Resonance itself — a currency, so it is not in this registry.)
  M('kilnflux', 'Kilnflux', 'loam', 'rich', ['#5c4a2e', '#8f7648', '#cbb072'], 6, 'soft',
    'A grey-gold powder fired down at the Refinery that makes other stones agree to melt. Loam\'s last word in every Ferrite pour — which two stones go in the firing is yours to find.', true),
  M('lodeframe', 'Lodeframe', 'ferrite', 'rich', ['#33383e', '#565e68', '#8a949e'], 5, 'none',
    'An iron bed-frame, cast true and bolted square. Verdance grows things; Ferrite is what they grow IN.', true),
  M('setresin', 'Set Resin', 'verdance', 'rich', ['#4a3a16', '#7e6426', '#bd9a44'], 7, 'soft',
    'Resin rendered down at the still until it sets hard and optically dead-clear. Glassmere silvers its mirrors with it.', true),
  M('fibercloth', 'Fibercloth', 'verdance', 'rich', ['#3c4430', '#64724e', '#9aab78'], 6, 'soft',
    'A committed weave, cut from the frame and bolted. Glassmere wraps its lenses in it against the cold and the dust.', true),
  M('groundlens', 'Ground Lens', 'glassmere', 'rich', ['#3a4854', '#617a8c', '#9cc0d4'], 8, 'crystalline',
    'Silica ground against prism-dust until it focuses. Cinder sets one over each furnace row to steady the draft.', true),
  M('glasseal', 'Glasseal', 'glassmere', 'rich', ['#404a44', '#68796e', '#a2b8a8'], 6, 'crystalline',
    'Rime-tempered glass gasket. The only thing that keeps a vent pipe honest past the twelfth join.', true),
  M('emberglass', 'Emberglass', 'cinder', 'rich', ['#4a2214', '#843a1e', '#c8642e'], 7, 'crystalline',
    'Glass annealed in a fire held in the band for a minute and a half without wavering. The Hollow rebuilds with it, because it remembers heat the way the void remembers nothing.', true),

  // (CASTING_IDS below is the canonical list; order = family metal order.)
  // ================= ALLOY CASTINGS (Part B pull-through) =================
  // Cast at the Crucible from a DISCOVERED alloy's own ratio in metals — the
  // pattern made stock. One per alloy family; each carries the family's trait
  // set, and a casting only ever BINDS a Tier X or better tool. `worked: true`
  // keeps them out of every drop table, as with every made thing.
  M('steelcasting', 'Steel Casting', 'ferrite', 'rich', ['#3a3d42', '#5e646c', '#939ca8'], 5, 'none',
    'An Ingot-led alloy cast square for a tool\'s spine. It holds the head the way a beam holds a roof.', true),
  M('brazecasting', 'Braze Casting', 'ferrite', 'rich', ['#4a3a24', '#7c6138', '#b8925a'], 6, 'soft',
    'A Flux-led alloy cast thin and warm. A tool bound in it never quite cools between strokes.', true),
  M('platecasting', 'Plate Casting', 'ferrite', 'rich', ['#3c4440', '#606f68', '#96a89e'], 5, 'none',
    'A Scale-led alloy cast in leaves. It flexes on the bad angle and forgives the wrist that made it.', true),
  M('polecasting', 'Pole Casting', 'ferrite', 'rich', ['#2e3644', '#4c5a72', '#7e94b6'], 6, 'soft',
    'A Lodestone-led alloy cast with the grain aligned. Whatever is set in it stays exactly where it was set.', true),
  M('cryocasting', 'Cryo Casting', 'ferrite', 'rich', ['#38424c', '#5c7080', '#94b2c4'], 7, 'crystalline',
    'A Rime-led alloy cast cold and honed once. It keeps the edge it was born with and asks for nothing.', true),

  // ======================= SHELL I — LOAM (15, live) =======================
  M('marl', 'Marl', 'loam', 'common', ['#4a3b2a', '#7a6142', '#b39a6e', ], 5, 'none',
    'Clay that remembers being sea-bottom. The first useful thing you will ever dig.'),
  M('ochre', 'Ochre', 'loam', 'common', ['#5c3a1e', '#9c5f26', '#d99a4e'], 4, 'none',
    'Paint for the dead, mortar for the living.'),
  M('bonechalk', 'Bonechalk', 'loam', 'common', ['#6e685c', '#a8a191', '#e3dcc8'], 4, 'none',
    'Not actually bone. Probably not actually bone.'),
  M('graveclay', 'Graveclay', 'loam', 'common', ['#3a3532', '#5e5651', '#8b8078'], 5, 'none',
    'Dense, damp, and quiet. Holds a shape like a grudge.'),
  M('loamiron', 'Loamiron', 'loam', 'rich', ['#3b3230', '#6e5044', '#a5765c'], 6, 'soft',
    'Iron that grew in root-veins instead of seams. Bends once, then learns.'),
  M('rootglass', 'Rootglass', 'loam', 'rich', ['#2e3a2c', '#5a7a4e', '#9fc884'], 6, 'soft',
    'Old taproots turned to glass under pressure. Rings when struck.'),
  M('duskflint', 'Duskflint', 'loam', 'rich', ['#2a2733', '#4e4763', '#837a9e'], 7, 'soft',
    'Strikes sparks that fall upward. Nobody has explained this.'),
  M('umberjade', 'Umberjade', 'loam', 'pure', ['#2c3627', '#4f6b3f', '#8aa96b'], 7, 'crystalline',
    'Brown-green and waxy, warm to the touch a full day after digging.'),
  M('hollowamber', 'Hollowamber', 'loam', 'pure', ['#4a2f14', '#8a5a1e', '#d99c3e'], 6, 'crystalline',
    'There is always a bubble inside, and the bubble is always empty. Always.'),
  M('wormsteel', 'Wormsteel', 'loam', 'pure', ['#33302e', '#5c5754', '#918a85'], 8, 'soft',
    'Threaded through the loam in long soft coils. Straightens reluctantly.'),
  M('palegold', 'Palegold', 'loam', 'flawless', ['#5c5638', '#96905e', '#e0d79a'], 8, 'crystalline',
    'Gold that lost its colour somewhere. Worth more to the right buyer.'),
  M('chthonite', 'Chthonite', 'loam', 'flawless', ['#1e2229', '#3a4456', '#66789c'], 9, 'crystalline',
    'Heavier than it has any right to be. Wants to keep going down.'),
  M('starmarl', 'Starmarl', 'loam', 'starred', ['#2a2d3e', '#4a5178', '#8b93c9'], 9, 'crystalline',
    'Marl shot through with points of light. They are not reflections.'),
  M('sablequartz', 'Sablequartz', 'loam', 'starred', ['#1c1a1e', '#3c3644', '#6e6378'], 10, 'crystalline',
    "Black quartz that drinks lamplight. Sable named it, or it named her."),
  M('weepstone', 'Weepstone', 'loam', 'aberrant', ['#2e3438', '#50646c', '#89a8b0'], 7, 'aberrant',
    'It is wet when you find it and it is wet in a sealed box. Best not to hold it long.'),

  /**
   * MILLSTONE — LOAM'S TRAP MATERIAL (§16.3), and it is not a gotcha.
   *
   * `flawless` purity, so it assays superb and the numbers are real: it genuinely
   * has the best Core magnitude in the shell. And it is `brittle`, which is the
   * one trait a Core must not have — the part whose whole job is holding the
   * tool together. So the material that looks perfect for the seat is the
   * material that wrecks it, and the Assay says `brittle` out loud before you
   * pour, so nobody is ambushed.
   *
   * IT EXISTS FROM ERA I ON PURPOSE. The answer is the Still — distil the
   * brittle out and it becomes the best Core stone in Loam. The Still is a long
   * way off, which means the lesson is sitting in the Hold waiting for the
   * machine that teaches it, rather than arriving with it. That is the whole
   * design of a trap material: the problem is authored years before the tool.
   */
  M('millstone', 'Millstone', 'loam', 'flawless', ['#39322b', '#6b5c4c', '#a89a86'], 8, 'soft',
    'Grey and close-grained and heavier than it looks — the best seat-stone in the loam, if it would only stop cracking.'),

  // ---- DEEP ENTRY (Proof #1) ------------------------------------------------
  // These come out of COMPACTION, not out of the rarity table. They are marked
  // `source: 'deep'` for exactly the reason combat materials are marked at all:
  // the pools in rollDrop and crackGeodeRolls filter on `!m.source`, so a
  // material that must be EARNED by working a cell down cannot leak into an
  // ordinary chip or a cracked geode. Umberjade is not here — it already
  // existed at `pure`, and the 8-gate gives you a second way to find one rather
  // than a second material that means the same thing.
  M('graveclaydeep', 'Deep Graveclay', 'loam', 'flawless', ['#241f1d', '#463f3a', '#736760'], 6, 'none',
    'The same clay, from far enough down that it has forgotten how to be soft. It holds a shape the way a grudge holds a name.',
    false, 'deep'),
  M('deepgrave', 'Deepgrave', 'loam', 'starred', ['#141318', '#2e2a36', '#585067'], 11, 'aberrant',
    'Comes out of a cell one strike from dead, and only out of one. Cold in a way that has nothing to do with temperature.',
    false, 'deep'),

  // ======================= SHELL II — FERRITE (14, dormant) ================
  M('ironbloom', 'Ironbloom', 'ferrite', 'common', ['#3a3230', '#6b5a52', '#a08a7c'], 5, 'none'),
  M('scalechip', 'Scalechip', 'ferrite', 'common', ['#333a40', '#5a6a75', '#8fa5b3'], 4, 'none'),
  M('rustmarrow', 'Rustmarrow', 'ferrite', 'common', ['#4a2c20', '#84462c', '#c47a4a'], 5, 'none'),
  M('greyflux', 'Greyflux', 'ferrite', 'common', ['#3c3c3a', '#686863', '#9c9c94'], 4, 'none'),
  M('lodestone', 'Lodestone Ore', 'ferrite', 'rich', ['#26282e', '#464a58', '#767c92'], 6, 'soft'),
  M('bluesteel', 'Bluesteel', 'ferrite', 'rich', ['#242c38', '#40536e', '#7089ab'], 6, 'soft'),
  M('rimeiron', 'Rimeiron', 'ferrite', 'rich', ['#2c3438', '#516871', '#8fb3bd'], 7, 'soft'),
  M('polarite', 'Polarite', 'ferrite', 'pure', ['#2e2a38', '#565073', '#918ab3'], 7, 'crystalline'),
  M('voltglass', 'Voltglass', 'ferrite', 'pure', ['#2a3038', '#4a6078', '#82a8c9'], 8, 'crystalline'),
  M('magnetile', 'Magnetile', 'ferrite', 'pure', ['#30282a', '#5c4650', '#96788a'], 7, 'soft'),
  M('nullsilver', 'Nullsilver', 'ferrite', 'flawless', ['#34383c', '#5e666e', '#a2adb8'], 9, 'crystalline'),
  M('stormcore', 'Stormcore', 'ferrite', 'flawless', ['#22262e', '#3e4a66', '#6e84b8'], 9, 'crystalline'),
  M('polestar', 'Polestar Iron', 'ferrite', 'starred', ['#282a36', '#4a4f73', '#8f96cf'], 10, 'crystalline'),
  M('gnashmetal', 'Gnashmetal', 'ferrite', 'aberrant', ['#33272a', '#5e4048', '#a06e7e'], 8, 'aberrant'),

  // ======================= SHELL III — VERDANCE (14, dormant) ==============
  M('sporewood', 'Sporewood', 'verdance', 'common', ['#33301f', '#5c5632', '#8f8a52'], 4, 'none'),
  M('mosscoal', 'Mosscoal', 'verdance', 'common', ['#232a20', '#3c4a34', '#5e7452'], 5, 'none'),
  M('sapstone', 'Sapstone', 'verdance', 'common', ['#3c3418', '#6e6026', '#ab9840'], 4, 'none'),
  M('barkiron', 'Barkiron', 'verdance', 'common', ['#332a22', '#5a4a3a', '#8a7458'], 5, 'none'),
  M('chlorite', 'Chlorite', 'verdance', 'rich', ['#22331f', '#3e6338', '#68a05e'], 6, 'soft'),
  M('resinpearl', 'Resinpearl', 'verdance', 'rich', ['#403618', '#7a682c', '#c2ac50'], 6, 'soft'),
  M('humusgold', 'Humusgold', 'verdance', 'rich', ['#33301a', '#605a2c', '#9c944c'], 6, 'soft'),
  M('verdantine', 'Verdantine', 'verdance', 'pure', ['#1e3322', '#37633f', '#5fa66c'], 7, 'crystalline'),
  M('bloomsteel', 'Bloomsteel', 'verdance', 'pure', ['#2c3324', '#526342', '#87a06c'], 7, 'soft'),
  M('feralglass', 'Feralglass', 'verdance', 'pure', ['#263420', '#477040', '#77b56c'], 8, 'crystalline'),
  M('heartwood', 'Ironheartwood', 'verdance', 'flawless', ['#3a2c1e', '#6e5436', '#ab8556'], 8, 'crystalline'),
  M('springvein', 'Springvein', 'verdance', 'flawless', ['#20362a', '#3c6a4e', '#66ab80'], 9, 'crystalline'),
  M('wildstar', 'Wildstar Bloom', 'verdance', 'starred', ['#2c3a24', '#527044', '#8fbf72'], 10, 'crystalline'),
  M('thornmind', 'Thornmind', 'verdance', 'aberrant', ['#2e2a30', '#565060', '#8f86a0'], 7, 'aberrant'),
  // =============== VERDANCE'S REMAINS (A.88) — re-sourced by PLACE =========
  //
  // The third set of six, by the same mechanism as Loam's (A.84) and Ferrite's
  // (A.87): bound to stations in `content/shell3/roll.ts`, substituted into a
  // drop that already happened, never added to the rarity pool. Four of the six
  // lines described no kill and are kept verbatim — a root that swallowed, silk
  // off a shed wing, a plant that bites, thread from something barely there.
  { id: 'throatroot', name: 'Throatroot', shellId: 'verdance', rarity: 'common', palette: ['#3a2f20', '#66543a', '#96805a'], facets: 4, shimmer: 'none', source: 'remains', flavor: 'A root that swallowed. Spin it before it remembers how.' },
  { id: 'mothspool', name: 'Mothspool', shellId: 'verdance', rarity: 'common', palette: ['#3a3830', '#6a6656', '#a09a84'], facets: 4, shimmer: 'soft', source: 'remains', flavor: 'Wound silk off a wing the size of a door.' },
  { id: 'wireweed', name: 'Wireweed', shellId: 'verdance', rarity: 'rich', palette: ['#2c332a', '#4e6349', '#7d9c74'], facets: 5, shimmer: 'none', source: 'remains', flavor: 'A plant doing an impression of cable. The impression bites.' },
  { id: 'palefiber', name: 'Palefiber', shellId: 'verdance', rarity: 'rich', palette: ['#343440', '#5e5e74', '#9494ae'], facets: 5, shimmer: 'soft', source: 'remains', flavor: 'Thread from something that was barely there. The Loom disagrees about the barely.' },
  // Was "the soft center of a hard argument" — an argument you win by killing
  // it, which is the shape `chitinshard` carried before A.84 rewrote it. A
  // canker is a wound the tree closed over; the pith is what is left inside.
  { id: 'mawpith', name: 'Mawpith', shellId: 'verdance', rarity: 'pure', palette: ['#332226', '#63424a', '#9c6c78'], facets: 6, shimmer: 'soft', source: 'remains', flavor: 'The soft centre of a wound the wood grew shut around. It kept the softness and lost the argument.' },
  // Was "It is still beating, at about one beat per season" under the name Old
  // Plenty's Heart — the Warden's heart, in your hand, in a game with no
  // fighting. Same correction as `taproot` and `loadstarcore`: she has more than
  // one, she drops them, and they are collected. The beat is kept; it was the
  // best line of the six.
  { id: 'plentyheart', name: "Old Plenty's Heart", shellId: 'verdance', rarity: 'flawless', palette: ['#2a3620', '#4c6a3a', '#7fa85e'], facets: 9, shimmer: 'crystalline', source: 'remains', flavor: 'She grows a new one every round and lets the old one fall. It is still beating, at about one beat per season.' },

  // ============ VERDANCE DEEP-ENTRY (§16.2) — compaction 20 ================
  //
  // The ladder is sapstone (c>=8) / bindingclay (c>=14) / Heartwood (c>=20),
  // and TWO OF THE THREE ALREADY EXIST — `sapstone` is Verdance's own common
  // and `bindingclay` is a Loam rich, so both are reused exactly as `wormsteel`
  // and `umberjade` were: a second way to find a stone, never a second stone
  // that means the same thing. Only the TERMINAL is new, because a terminal
  // must come out of the deepest gate and NOWHERE else — `heartwood` is a
  // pool-eligible ore called Ironheartwood and would have broken that.
  //
  // Named for the floor it comes out of, as `deepgrave` and `poleiron` are.
  M('thornwall', 'Thornwall Heart', 'verdance', 'starred', ['#181e16', '#33422c', '#5e7a4e'], 11, 'aberrant',
    'Comes out of a cell one strike from dead, and only out of one. Wood that stopped being wood without ever agreeing to be stone.',
    false, 'deep'),
  // Glassmere combat-only (Phase 8).
  // ============== GLASSMERE'S REMAINS (A.89) — re-sourced by PLACE =========
  //
  // The fourth set, by the same mechanism as Loam's (A.84), Ferrite's (A.87) and
  // Verdance's (A.88): bound to stations in `content/shell4/roll.ts`, substituted
  // into a drop that already happened, never added to the rarity pool.
  { id: 'glasschitin', name: 'Glasschitin', shellId: 'glassmere', rarity: 'common', palette: ['#3a4048', '#6a7684', '#a8b8c8'], facets: 6, shimmer: 'crystalline', source: 'remains', flavor: 'Armor you can read a page through. The page argues back.' },
  { id: 'coldsinew', name: 'Coldsinew', shellId: 'glassmere', rarity: 'common', palette: ['#38404a', '#5e6c7c', '#93a8ba'], facets: 5, shimmer: 'soft', source: 'remains', flavor: 'Muscle at four below. It flexes slowly and forever.' },
  { id: 'lenswing', name: 'Lenswing', shellId: 'glassmere', rarity: 'rich', palette: ['#404452', '#707a94', '#b0bcd8'], facets: 7, shimmer: 'crystalline', source: 'remains', flavor: 'A wing that focuses what it flies through.' },
  { id: 'prismheart', name: 'Prismheart', shellId: 'glassmere', rarity: 'pure', palette: ['#3c3a50', '#6c6890', '#a89ed0'], facets: 8, shimmer: 'crystalline', source: 'remains', flavor: 'It splits whatever light reaches it, including attention.' },
  // Was "It wept exactly once. You were there." — you, present at the death of
  // the shell's Warden, in a game with no fighting. The same correction as
  // `taproot`, `loadstarcore` and `plentyheart`: the Unblinking does not stop.
  // It weeps, the cold keeps what it wept, and the tear is still out there.
  { id: 'unblinkingTear', name: "The Unblinking's Tear", shellId: 'glassmere', rarity: 'flawless', palette: ['#3a4456', '#68809c', '#a8cce8'], facets: 10, shimmer: 'crystalline', source: 'remains', flavor: 'It weeps about once a decade and the cold keeps every one. This is not the first and will not be the last.' },

  // =========== GLASSMERE DEEP-ENTRY (§16.2) — compaction 14 and 20 =========
  //
  // The ladder is weepstone (c>=8) / truesilica (c>=14) / Truelight (c>=20).
  // `weepstone` ALREADY EXISTS as a Loam aberrant and §16.2 names it as
  // Glassmere's first gate anyway — the `bindingclay` case exactly: a stone that
  // is already in the game, given a second way to be found. The other two are
  // written here, `source: 'deep'` so neither can enter a rarity pool, and the
  // spine's own names are used because neither id was taken.
  M('truesilica', 'Truesilica', 'glassmere', 'flawless', ['#4a5460', '#7e909c', '#c0d4e0'], 8, 'crystalline',
    'Sand that agreed on a single direction all the way through. Cut it any way you like; it was already cut that way.',
    false, 'deep'),
  M('truelight', 'Truelight', 'glassmere', 'starred', ['#1a2028', '#3c4c5c', '#7ea0bc'], 11, 'aberrant',
    'Comes out of a cell one strike from dead, and only out of one. It is not lit and it is not dark, and it is the same either way.',
    false, 'deep'),
  // ============== CINDER'S REMAINS (A.89) — re-sourced by PLACE ===========
  //
  // The fifth set, by the same mechanism. Everything down here is partly
  // furnace, and four of the five lines said so without describing a kill.
  { id: 'emberplate', name: 'Emberplate', shellId: 'cinder', rarity: 'common', palette: ['#3a2a20', '#6e4630', '#b3714a'], facets: 5, shimmer: 'soft', source: 'remains', flavor: 'Armor shed still warm. It stays warm. Nobody knows what off is, down here.' },
  { id: 'charsinew', name: 'Charsinew', shellId: 'cinder', rarity: 'common', palette: ['#2c2422', '#4e3c36', '#7e5e52'], facets: 4, shimmer: 'none', source: 'remains', flavor: 'Muscle that cooked and kept working. An example to us all, says Hob.' },
  { id: 'magmaduct', name: 'Magmaduct', shellId: 'cinder', rarity: 'rich', palette: ['#3a221a', '#6e3a26', '#c25c38'], facets: 6, shimmer: 'soft', source: 'remains', flavor: 'A vein that carried fire instead of blood. Still carries a little.' },
  { id: 'pyregland', name: 'Pyregland', shellId: 'cinder', rarity: 'pure', palette: ['#40261a', '#7a422a', '#d97a42'], facets: 7, shimmer: 'crystalline', source: 'remains', flavor: 'The organ that decides when to burn. It has never once decided no.' },
  // Was "It beats once a minute, and each beat is a decision not to erupt" under
  // the name The Smolder's Heart — the Warden's, in your hand. Same correction
  // as taproot, loadstarcore, plentyheart and the Unblinking's Tear: she has
  // more than one, and the ones she is done with roll downhill.
  { id: 'smolderheart', name: "The Smolder's Heart", shellId: 'cinder', rarity: 'flawless', palette: ['#331e16', '#66301c', '#bf5426'], facets: 10, shimmer: 'crystalline', source: 'remains', flavor: 'She grows one a season and sheds the last. It beats about once a minute, and each beat is a decision not to erupt.' },

  // ============ CINDER DEEP-ENTRY (§16.2) — compaction 20 =================
  //
  // charstone (c>=8) and slagrock (c>=14) are BOTH Cinder's own commons and
  // both already exist, so this shell needed only its TERMINAL — the same
  // shape as Verdance. §19 also promises Slagglass out of the Crucible ('which
  // is Seat V and also your vent stock'); that second source is not built, and
  // this one does not pretend to be it.
  M('slagglass', 'Slagglass', 'cinder', 'starred', ['#1c1210', '#3e2418', '#7a4426'], 11, 'aberrant',
    'Comes out of a cell one strike from dead, and only out of one. Slag that cooled fast enough to stay honest about what was in it.',
    false, 'deep'),

  // ================== SHELL VI — HOLLOW (Phase 10, live) ===================
  M('nothingstone', 'Nothingstone', 'hollow', 'common', ['#2a2834', '#4a4660', '#787292'], 4, 'none',
    'A stone that is not there. It stacks neatly, which is the worst part.'),
  M('quietchalk', 'Quietchalk', 'hollow', 'common', ['#34323e', '#5a5670', '#928ca8'], 4, 'none'),
  M('echograin', 'Echograin', 'hollow', 'rich', ['#2e2c3a', '#544e78', '#8e86b8'], 6, 'soft'),
  M('umbralite', 'Umbralite', 'hollow', 'rich', ['#262432', '#443e5e', '#726a94'], 6, 'soft'),
  M('voidglass', 'Voidglass', 'hollow', 'pure', ['#222030', '#403a5c', '#6e6694'], 8, 'crystalline',
    'You can see through it to somewhere that is not behind it.'),
  M('hushmetal', 'Hushmetal', 'hollow', 'pure', ['#302e3c', '#565278', '#908ab4'], 7, 'soft'),
  M('absencia', 'Absencia', 'hollow', 'flawless', ['#282636', '#4c4674', '#847cb0'], 9, 'crystalline'),
  M('stillstar', 'Stillstar', 'hollow', 'starred', ['#2c2a3c', '#524a80', '#948ac8'], 10, 'crystalline',
    'A star that decided against it.'),
  // ============ HOLLOW'S REMAINS (A.90) — re-sourced by PLACE ==============
  //
  // The last three of the twenty-six this project has carried since A.84, minus
  // Aleph's one below. Same mechanism as Loam's six, Ferrite's six, Verdance's
  // six and the five each in Glassmere and Cinder: bound to stations in
  // `content/shell6/roll.ts`, substituted into a drop that already happened,
  // never added to the rarity pool.
  { id: 'quietsinew', name: 'Quietsinew', shellId: 'hollow', rarity: 'common', palette: ['#2e2c38', '#4e4a66', '#7e7898'], facets: 4, shimmer: 'none', source: 'remains', flavor: 'Muscle from something that moved without occupying the space between. It is still not occupying it.' },
  { id: 'hollowplate', name: 'Hollowplate', shellId: 'hollow', rarity: 'rich', palette: ['#2a2836', '#4a4468', '#7a72a0'], facets: 6, shimmer: 'soft', source: 'remains', flavor: 'Armour with no inside. It fits everyone, and it fitted somebody.' },
  { id: 'unheart', name: 'Unheart', shellId: 'hollow', rarity: 'flawless', palette: ['#262238', '#463e6c', '#7a6ea8'], facets: 10, shimmer: 'crystalline', source: 'remains', flavor: 'It beats. Do not ask what it pumps, or where.' },

  // ================== SHELL VII — ALEPH (Phase 10, live) ===================
  M('firstiron', 'First Iron', 'aleph', 'common', ['#3a362c', '#6e6650', '#b0a684'], 5, 'soft',
    'The iron every other iron is a copy of.'),
  M('protolith', 'Protolith', 'aleph', 'rich', ['#38342a', '#6a624a', '#a89a74'], 6, 'soft'),
  M('axiomite2', 'Ruleshard', 'aleph', 'pure', ['#3c3826', '#746a42', '#bfae6a'], 8, 'crystalline',
    'A fragment of how things are. Handle with conviction.'),
  M('alephite', 'Alephite', 'aleph', 'flawless', ['#403a24', '#7c6e3e', '#ccb862'], 9, 'crystalline',
    'The first material. Everything else is commentary.'),
  /**
   * ALEPH'S ONE REMAINS — DEMOTED AT A.90, RESTORED AT A.91, and the round trip
   * is PILLARS' "a cut is provisional, and its reason can dissolve" happening
   * inside two passes.
   *
   * A.90 brought it down to `pure` for a stated reason: `remainsAt` honours the
   * rarity gate, `RARITY_GATES` opened `flawless` at an absolute depth of 70,
   * and Aleph's floor is 40 — so re-sourcing it by place while leaving it
   * flawless would have shipped a rescue that never fires. The demotion was
   * right, and the row said exactly why, which is the only reason this could be
   * checked rather than inherited.
   *
   * A.91 re-keyed the gates to the shell's own shaft. `flawless` now opens at
   * depth 19 in Aleph, so the reason has dissolved and the band goes back. It
   * is a flawless-band prize again, and it comes up in the last handful of
   * depths around THE CORE rather than on one exact step.
   *
   * ITS TRAITS STAY `keen+charged` (A.90, clone #8). Those were changed because
   * at `pure` it collided with Ruleshard bit for bit; at `flawless` it sits
   * beside Alephite (`keen+trueseated`) and does not. Restoring the band does
   * not restore the collision, so the fix stays.
   */
  { id: 'authorsInk', name: "The Author's Ink", shellId: 'aleph', rarity: 'flawless', palette: ['#26242c', '#48444e', '#787280'], facets: 10, shimmer: 'crystalline', source: 'remains', flavor: 'It writes on the world directly. The pen is bolted down for a reason.' },

  // ======================= SHELL IV — GLASSMERE (14, dormant) ==============
  M('silicash', 'Silicash', 'glassmere', 'common', ['#333338', '#5e5e66', '#9a9aa5'], 4, 'none'),
  M('frostsand', 'Frostsand', 'glassmere', 'common', ['#2e343a', '#566670', '#93a8b3'], 4, 'none'),
  M('dimglass', 'Dimglass', 'glassmere', 'common', ['#2c2f36', '#4d5464', '#828da3'], 5, 'none'),
  M('mirrorgrit', 'Mirrorgrit', 'glassmere', 'common', ['#36363c', '#63636c', '#a3a3ad'], 4, 'soft'),
  M('lumenshard', 'Lumenshard', 'glassmere', 'rich', ['#38341e', '#6e6636', '#b8ab5c'], 7, 'soft'),
  M('prismite', 'Prismite', 'glassmere', 'rich', ['#2c2c3a', '#525273', '#8f8fbf'], 8, 'crystalline'),
  M('coldspar', 'Coldspar', 'glassmere', 'rich', ['#28343a', '#48626e', '#7ca4b3'], 7, 'soft'),
  M('spectralite', 'Spectralite', 'glassmere', 'pure', ['#30283a', '#5c4a73', '#9c82bf'], 8, 'crystalline'),
  M('sunglass', 'Sunglass', 'glassmere', 'pure', ['#3a301c', '#736032', '#c2a659'], 8, 'crystalline'),
  M('beamiron', 'Beamiron', 'glassmere', 'pure', ['#32323a', '#5c5c6b', '#9c9cb0'], 7, 'soft'),
  M('starlens', 'Starlens', 'glassmere', 'flawless', ['#2a2e3a', '#4c586e', '#8298b8'], 9, 'crystalline'),
  M('wavelength', 'Wavelength Ore', 'glassmere', 'flawless', ['#2c2a38', '#544e73', '#928abf'], 9, 'crystalline'),
  M('spectrum', 'True Spectrum', 'glassmere', 'starred', ['#33283a', '#664a73', '#b385bf'], 10, 'crystalline'),
  M('unlight', 'Unlight', 'glassmere', 'aberrant', ['#1e1e24', '#38384a', '#5e5e7c'], 8, 'aberrant'),

  // ======================= SHELL V — CINDER (14, dormant) ==================
  M('slagrock', 'Slagrock', 'cinder', 'common', ['#2e2624', '#54423c', '#8a6c60'], 4, 'none'),
  M('ashgrit', 'Ashgrit', 'cinder', 'common', ['#2c2a2a', '#4e4a4a', '#7e7878'], 4, 'none'),
  M('charstone', 'Charstone', 'cinder', 'common', ['#241f1e', '#443836', '#6e5a56'], 5, 'none'),
  M('emberflake', 'Emberflake', 'cinder', 'common', ['#3a231a', '#6e3c26', '#b3603c'], 5, 'soft'),
  M('pyroclast', 'Pyroclast', 'cinder', 'rich', ['#3a1e16', '#732f1e', '#bf4f30'], 6, 'soft'),
  M('obsidianheart', 'Obsidianheart', 'cinder', 'rich', ['#1c1a1e', '#363340', '#5e586e'], 7, 'soft'),
  M('brimshard', 'Brimshard', 'cinder', 'rich', ['#3a2e16', '#6e5626', '#b38f40'], 6, 'soft'),
  M('magmajade', 'Magmajade', 'cinder', 'pure', ['#33261c', '#664631', '#a87450'], 7, 'crystalline'),
  M('cindersteel', 'Cindersteel', 'cinder', 'pure', ['#2c2220', '#523c38', '#8a625a'], 7, 'soft'),
  M('pyrite', 'Truepyrite', 'cinder', 'pure', ['#3a3016', '#735e26', '#bf9c40'], 8, 'crystalline'),
  M('heartflame', 'Heartflame Ore', 'cinder', 'flawless', ['#3a1c14', '#73301e', '#c24f30'], 9, 'crystalline'),
  M('ventglass', 'Ventglass', 'cinder', 'flawless', ['#2a2024', '#4e3a44', '#82606e'], 8, 'crystalline'),
  M('coronaite', 'Coronaite', 'cinder', 'starred', ['#3a2412', '#734620', '#c27a36'], 10, 'crystalline'),
  M('howlbasalt', 'Howlbasalt', 'cinder', 'aberrant', ['#242026', '#443c4a', '#6e6078'], 7, 'aberrant'),

  // ======================= SHELL VI — HOLLOW (12, dormant) =================
  M('nullchalk', 'Nullchalk', 'hollow', 'common', ['#26262a', '#46464e', '#727280'], 3, 'none'),
  M('hushslate', 'Hushslate', 'hollow', 'common', ['#22242a', '#3e424e', '#666c80'], 4, 'none'),
  M('greyecho', 'Greyecho', 'hollow', 'common', ['#28282c', '#4a4a52', '#787886'], 4, 'none'),
  M('voidmarl', 'Voidmarl', 'hollow', 'rich', ['#1e1c24', '#383344', '#5e556e'], 5, 'soft'),
  M('umbrite', 'Umbrite', 'hollow', 'rich', ['#201e26', '#3a3648', '#615a75'], 6, 'soft'),
  M('silencesteel', 'Silencesteel', 'hollow', 'rich', ['#26262b', '#454550', '#737382'], 6, 'soft'),
  M('resonarium', 'Resonarium', 'hollow', 'pure', ['#242030', '#443c5c', '#726596'], 7, 'crystalline'),
  M('absentia', 'Absentia', 'hollow', 'pure', ['#1c1c22', '#343440', '#565668'], 8, 'crystalline'),
  M('phantomsilver', 'Phantomsilver', 'hollow', 'flawless', ['#2a2a32', '#4e4e5e', '#84849c'], 9, 'crystalline'),
  M('lacuna', 'Lacuna Stone', 'hollow', 'flawless', ['#1a1a20', '#30303e', '#4f4f66'], 9, 'crystalline'),
  M('voidstar', 'Voidstar', 'hollow', 'starred', ['#1e1e28', '#363650', '#5c5c8a'], 10, 'crystalline'),
  M('nothing', 'A Piece of Nothing', 'hollow', 'aberrant', ['#161618', '#28282c', '#414146'], 6, 'aberrant'),

  // HOLLOW'S TERMINAL (A.90, §16.2). Only a terminal is ever new: the ladder's
  // lower two rungs are `silencesteel` and `nothingstone`, both already in the
  // registry and both pool-eligible, which is the `umberjade` pattern — a
  // second way to FIND something, never a second thing that means the same.
  M('nothingstar', 'Nothingstone ★', 'hollow', 'starred', ['#101014', '#232330', '#484860'], 11, 'aberrant',
    'Comes out of a cell one strike from dead, and only out of one. The same stone that is not there, from far enough down that it has stopped apologising for it.',
    false, 'deep'),

  /**
   * ================= LOAM'S REMAINS (A.84) — found, not fought ==============
   *
   * These six were `source: 'combat'`, and combat was cut at A.7x. That left
   * them obtainable by NO ROUTE AT ALL: 45,000 drop rolls across depths 0-150
   * produced none of them, five sat on the orphan list where no chain could
   * honestly consume them, and `wormsilk` was worse than an orphan — a live
   * consumer asking for a stone the game cannot produce.
   *
   * THE FICTION IS KEPT, NOT IGNORED. Every one of these is a piece of
   * something that lived, and the flavour said so. The Deepwrought are gone;
   * what they left is still down here, which is the premise of the whole game
   * ("you are not the first one down"). So they are REMAINS: you dig them up.
   * Two lines that named a kill are rewritten below and marked; the other four
   * never needed one.
   *
   * They do NOT go into the rarity pool, and that is the load-bearing decision.
   * Loam holds four commons and three riches; dropping six more in would have
   * cut marl/ochre/bonechalk/graveclay by a THIRD and every rich by two fifths
   * — the tier-II floor recipe and the whole shallow chain board are made of
   * exactly those stones, so "adding content" would have quietly re-priced the
   * first hardness wall. Pillar 1 binds the drop economy, not just income.
   *
   * Instead they are bound to PLACE — `remainsAt` below.
   */
  { id: 'chitinshard', name: 'Chitinshard', shellId: 'loam', rarity: 'common', palette: ['#3a3226', '#6b5c42', '#a5936c'], facets: 5, shimmer: 'none', source: 'remains', flavor: 'Plate off something that objected to being dug through. It lost the argument a long time before you got here.' },
  { id: 'gravemote', name: 'Gravemote', shellId: 'loam', rarity: 'common', palette: ['#2e2c33', '#54505e', '#8a8496'], facets: 4, shimmer: 'soft', source: 'remains', flavor: 'It drifts upward if you stop watching it.' },
  { id: 'wormsilk', name: 'Wormsilk', shellId: 'loam', rarity: 'rich', palette: ['#3c3830', '#6e6753', '#ada183'], facets: 6, shimmer: 'soft', source: 'remains', flavor: 'Stronger than it should be. Damp forever.' },
  { id: 'burrowertooth', name: "Burrower's Tooth", shellId: 'loam', rarity: 'rich', palette: ['#42392c', '#7a6a4e', '#bda87c'], facets: 6, shimmer: 'none', source: 'remains', flavor: 'Curved for going forward. Only forward.' },
  { id: 'marrowglass', name: 'Marrowglass', shellId: 'loam', rarity: 'pure', palette: ['#443c33', '#7d7059', '#c4b494'], facets: 8, shimmer: 'crystalline', source: 'remains', flavor: 'Grown in the middle of something alive. It remembers a pulse.' },
  // Was "Cut from the Warden of the Loam floor" — a kill, in a game with no
  // fighting. Her roots reach further than she does, which is why this one
  // seams at DEEPGRAVE and nowhere shallower.
  { id: 'taproot', name: "Tapmother's Root", shellId: 'loam', rarity: 'flawless', palette: ['#33402c', '#5c744e', '#94b581'], facets: 9, shimmer: 'crystalline', source: 'remains', flavor: 'The Tapmother\'s roots run further down than she does. It is still growing, slowly.' },

  // =============== FERRITE'S REMAINS (A.87) — re-sourced by PLACE ==========
  //
  // These six were `source: 'combat'` and combat was cut, so they were
  // obtainable by no route at all — six of the twenty-six this project has
  // carried in the ledger since A.84 said re-sourcing them "needs authored
  // Rolls in six shells and that is not a content pass, it's six". Ferrite's
  // Roll is written, so Ferrite's six come off the list by the same mechanism
  // Loam's did: bound to stations in `content/shell2/roll.ts`, substituted into
  // a drop that already happened, never added to the rarity pool.
  { id: 'scalebackplate', name: 'Scaleback Plate', shellId: 'ferrite', rarity: 'common', palette: ['#2c3138', '#4e5865', '#7f8fa3'], facets: 5, shimmer: 'none', source: 'remains', flavor: 'Armor that grew, was shed, and is now yours.' },
  { id: 'ironsinew', name: 'Ironsinew', shellId: 'ferrite', rarity: 'rich', palette: ['#32302e', '#5c5754', '#948d87'], facets: 6, shimmer: 'soft', source: 'remains', flavor: 'Flexes once per day, whether you use it or not.' },
  { id: 'voltgland', name: 'Voltgland', shellId: 'ferrite', rarity: 'rich', palette: ['#2c3440', '#4c6078', '#7f9fc2'], facets: 7, shimmer: 'soft', source: 'remains', flavor: 'Handle with dry gloves, or briefly.' },
  { id: 'magnetheart', name: 'Magnetheart', shellId: 'ferrite', rarity: 'pure', palette: ['#28283a', '#4a4a6e', '#7f7fad'], facets: 8, shimmer: 'crystalline', source: 'remains', flavor: 'Still beating, in a way. Every compass in camp agrees.' },
  { id: 'nullquill', name: 'Nullquill', shellId: 'ferrite', rarity: 'flawless', palette: ['#26262c', '#46464f', '#787883'], facets: 9, shimmer: 'crystalline', source: 'remains', flavor: 'Writes on polarity itself. Erases it too.' },
  // Was "Cut from the Warden of the Ferrite floor" — a kill, in a game with no
  // fighting, and the same line `taproot` carried before A.84 rewrote it. The
  // Loadstar is not a thing you cut something out of; it is the floor, and the
  // floor sheds. Seams at POLEIRON and nowhere shallower.
  { id: 'loadstarcore', name: 'Loadstar Core', shellId: 'ferrite', rarity: 'flawless', palette: ['#2a3040', '#4e5f80', '#89a2ce'], facets: 10, shimmer: 'crystalline', source: 'remains', flavor: 'The Loadstar sheds these the way a magnet sheds filings, and just as unwillingly. It points at YOU.' },

  // ============ FERRITE DEEP-ENTRY (§16.2) — compaction 14 and 20 ==========
  //
  // The ladder is wormsteel (c>=8) / lodestone-cored (c>=14) / Poleiron (c>=20).
  // WORMSTEEL ALREADY EXISTS as a Loam `pure`, and the spine names it as
  // Ferrite's first gate anyway — which is exactly the `umberjade` pattern one
  // shell up: a stone that is already in the game, given a SECOND way to be
  // found, rather than a second stone that means the same thing. The other two
  // did not exist and are written here, `source: 'deep'` so neither can enter
  // a rarity pool.
  M('lodestonecored', 'Lodestone-Cored', 'ferrite', 'flawless', ['#232733', '#414a63', '#6e7c9e'], 7, 'crystalline',
    'Ordinary rock with a needle of lodestone grown through the middle of it. Break it and both halves still know which way is down.',
    false, 'deep'),
  M('poleiron', 'Poleiron', 'ferrite', 'starred', ['#14161c', '#2a3040', '#4e5a78'], 11, 'aberrant',
    'Comes out of a cell one strike from dead, and only out of one. It has a direction, and the direction is not one of the six.',
    false, 'deep'),

  // ======================= SHELL VII — ALEPH (7, dormant) ==================
  M('axiomdust', 'Axiom Dust', 'aleph', 'rich', ['#38342a', '#6e664a', '#b8ab7c'], 6, 'soft'),
  M('sigilstone', 'Sigilstone', 'aleph', 'pure', ['#343036', '#635c66', '#a89aab'], 8, 'crystalline'),
  M('lawgold', 'Lawgold', 'aleph', 'pure', ['#3a3418', '#736626', '#c2ab40'], 8, 'crystalline'),
  // (First Iron and Alephite moved to the live Phase-10 block above.)
  M('worldseed', 'Worldseed Ore', 'aleph', 'starred', ['#2e3328', '#586348', '#96a87a'], 10, 'crystalline'),
  M('paradoxa', 'Paradoxa', 'aleph', 'aberrant', ['#2c2830', '#544c5c', '#8f8299'], 9, 'aberrant'),

  // ALEPH'S TERMINAL (A.90, §16.2 — "RECORD at c≥20"). Aleph's ladder is TWO
  // rungs, not three: the spine writes an em-dash at c≥14 and `deepEntry.ts`
  // carries that literally, so a compaction between 14 and 19 pays Aleph
  // nothing. The lower rung is `sigilstone`, which already existed.
  M('record', 'The Record', 'aleph', 'starred', ['#2a2618', '#565030', '#9c9058'], 11, 'aberrant',
    'Comes out of a cell one strike from dead, and only out of one. Every rule that has ever been signed, in the order it was signed, and your name is on the last few.',
    false, 'deep'),
];

/** The five alloy castings, ordered by family metal [ingot, flux, scale,
 *  lodestone, rime]. A casting only ever BINDS, and only a Tier X+ tool. */
export const CASTING_IDS = ['steelcasting', 'brazecasting', 'platecasting', 'polecasting', 'cryocasting'] as const;
export const CASTING_BIND_TIER = 10;

const materialById = new Map(MATERIALS.map((m) => [m.id, m]));

/**
 * REGISTER A MATERIAL THAT DID NOT EXIST AT MODULE LOAD (A.90).
 *
 * The STILLED forms (§16.3, `content/traps.ts`) are a material minus a trait,
 * so they cannot be written until the thing they subtract from is — and a
 * tier-III Still can make one out of any pure+ stone, which is 180-odd rows
 * nobody should enumerate. They are appended instead.
 *
 * The index above is built ONCE at module load, which is exactly the bug shape
 * this project keeps finding (a cache that is correct only until someone adds a
 * mount). So every append goes through here and the index is maintained rather
 * than rebuilt or bypassed — pushing to `MATERIALS` alone would leave
 * `materialDef` throwing on a material the game had just handed the player.
 */
export function registerMaterial(def: MaterialDef): MaterialDef {
  const already = materialById.get(def.id);
  if (already) return already;
  MATERIALS.push(def);
  materialById.set(def.id, def);
  return def;
}

export function materialDef(id: string): MaterialDef {
  const def = materialById.get(id);
  if (!def) throw new Error(`Unknown material: ${id}`);
  return def;
}

/**
 * A shell's taxonomy. WORKED materials are excluded: they carry a shellId only
 * because the icon generator needs a palette source, and they belong to the
 * bench that makes them, not to any shell's rock. Without this filter they
 * would show up as Loam ore in the Crucible's catalyst list, the Compendium's
 * shell filter, and every merchant's stock.
 */
export function materialsOfShell(shellId: string): MaterialDef[] {
  return MATERIALS.filter((m) => m.shellId === shellId && !m.worked);
}

/** The made-not-found materials, as their own group. */
export function workedMaterials(): MaterialDef[] {
  return MATERIALS.filter((m) => m.worked);
}

// ---------------------------------------------------------------------------
// Gems — a different KIND of thing. Socketed, never smelted. No purity.
// ---------------------------------------------------------------------------

export interface GemDef {
  id: string;
  name: string;
  color: string;
  /** The thing a material can't do — a modifier while socketed in the equipped tool. */
  /** TYPED, not string — see modifiers.ts. */
  bucket: Bucket;
  value: number;
  effectText: string;
  /** Every gem also has a combat face (Phase 5). */
  combat: { strikeMult?: number; hp?: number };
  combatText: string;
  /** Which shell's depths can drop it (dormant gems wait for their shell). */
  shellId: string;
  flavor: string;
}

export const GEMS: GemDef[] = [
  {
    id: 'bloodgarnet', name: 'Bloodgarnet', color: '#b03040', bucket: 'dustYield', value: 1.15,
    combat: { strikeMult: 1.15 }, combatText: '+15% strike power',    effectText: '+15% Dust while socketed', shellId: 'loam',
    flavor: 'Warm. Faintly rhythmic, if you hold it long enough to notice.',
  },
  {
    id: 'hearthstone', name: 'Hearthstone', color: '#d97a30', bucket: 'kilnRate', value: 1.25,
    combat: { hp: 8 }, combatText: '+8 HP',    effectText: '+25% Kiln intake while socketed', shellId: 'loam',
    flavor: 'A coal that never went out, cut and polished. The Kiln loves it.',
  },
  {
    id: 'voidopal', name: 'Voidopal', color: '#5c5080', bucket: 'dropRate', value: 1.3,
    combat: { hp: 6 }, combatText: '+6 HP',    effectText: '+30% Motifs while socketed', shellId: 'ferrite',
    flavor: 'Looking into it feels like being looked out of.',
  },
  {
    id: 'cinderquartz', name: 'Cinderquartz', color: '#c25030', bucket: 'drillSpeed', value: 1.2,
    combat: { strikeMult: 1.12 }, combatText: '+12% strike power',    effectText: '+20% drill speed while socketed', shellId: 'cinder',
    flavor: 'Still hot. Always still hot.',
  },
  {
    id: 'mourningpearl', name: 'Mourningpearl', color: '#8a93a8', bucket: 'offlineEffAdd', value: 0.05,
    combat: { hp: 10 }, combatText: '+10 HP',    effectText: '+5% offline efficiency while socketed', shellId: 'hollow',
    flavor: 'Grown around a grief by something that had no other way to carry it.',
  },
  {
    id: 'axiomite', name: 'Axiomite', color: '#d9c25c', bucket: 'xpGain', value: 1.25,
    combat: { strikeMult: 1.1 }, combatText: '+10% strike power',    effectText: '+25% Delver XP while socketed', shellId: 'aleph',
    flavor: 'A rule, crystallised. It is illegal for this to exist yet.',
  },
];

const gemById = new Map(GEMS.map((g) => [g.id, g]));

export function gemDef(id: string): GemDef {
  const def = gemById.get(id);
  if (!def) throw new Error(`Unknown gem: ${id}`);
  return def;
}

// ---------------------------------------------------------------------------
// Drop tables — drops ride ON TOP of the regen ceiling (they roll per chip,
// and chips are charge-bound), they are never a second income rate.
// ---------------------------------------------------------------------------

/** Chance per manual chip at full charge; scaled by charge/8 and depth. */
export const DROP_BASE_CHANCE = 0.012;
/** Drills roll the same formula at reduced weight. */
export const DRILL_DROP_FACTOR = 0.4;
export const DROP_DEPTH_FACTOR = 0.004; // +0.4% relative per depth
export const GEODE_SHARE = 0.02; // of successful drops
export const GEM_SHARE = 0.004; // of successful drops, depth 60+ only

/**
 * RARITY AVAILABILITY, KEYED TO SHELL PROGRESSION (A.91 — re-keyed by ruling).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE OLD TABLE WAS LOAM'S FLOOR FRACTIONS WITH THE DENOMINATOR ERASED.
 *
 * It read `common 0 · rich 10 · pure 40 · flawless 70 · starred 110 · aberrant
 * 150` as ABSOLUTE depths, and its own comment said "(Shell I)". Loam's floor is
 * 150. So every one of those numbers is a fraction of Loam's shaft — 0, 1/15,
 * 4/15, 7/15, 11/15, 15/15 — applied to six other shells whose floors are 250 to
 * 560, and to one whose floor is 40.
 *
 * That did two opposite things at once, and only one of them was visible:
 *
 *   ALEPH WAS STARVED. Its floor is 40, so `flawless` (70), `starred` (110) and
 *   `aberrant` (150) could not be rolled ANYWHERE in the shell by any route.
 *   Three of its ten materials were unobtainable, found and ledgered at A.90.
 *
 *   EVERY SHELL BELOW LOAM WAS OVER-PAID, which nothing noticed because a
 *   player getting MORE does not file a bug. In Hollow, `aberrant` opened at
 *   depth 150 of 560 — a QUARTER of the way down the shaft — against Loam,
 *   where it opens on the last step. Six shells were handing out their rarest
 *   stone two to four times earlier than the shell the table was written for.
 *
 * So the numbers are kept and the DENOMINATOR IS PUT BACK. `ofFloor` is the
 * depth this band opened at in LOAM; `gateDepth` scales it by the shell's own
 * floor. Loam is therefore bit-identical by construction — `ofFloor · 150 / 150`
 * — which is the check that this is a re-keying and not a re-balance.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const LOAM_FLOOR = 150;

export const RARITY_GATES: Record<MaterialRarity, { ofFloor: number; weight: number }> = {
  common: { ofFloor: 0, weight: 100 },
  rich: { ofFloor: 10, weight: 32 },
  pure: { ofFloor: 40, weight: 13 },
  flawless: { ofFloor: 70, weight: 5 },
  starred: { ofFloor: 110, weight: 2 },
  aberrant: { ofFloor: 150, weight: 0.8 },
};

/**
 * THE DEPTH THIS BAND OPENS AT, IN THIS SHELL.
 *
 * THE LADDER COMPRESSES INTO A SHORT SHAFT AND NEVER STRETCHES INTO A LONG ONE:
 *
 *     gate(shell, r) = ofFloor · min(1, floor / 150)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY `min` AND NOT THE FLAT PROPORTION, WHICH IS WHAT THIS SET OUT TO BE.
 *
 * The flat proportion is the honest full reading of "key off shell
 * progression", and it was written, measured, and pulled back — because it
 * COLLIDES WITH AUTHORED GEOGRAPHY IN FIVE SHELLS. Measured:
 *
 *     42 seam pools name a stone their own station's depth could no longer roll
 *      5 remains placements land above their own gate
 *     11 of those 42 have NOTHING FREE in the band they would drop to
 *
 * Glassmere's Starlens Deep (258) could not hold `spectrum`; Cinder's Coronaway
 * (400) could not hold `howlbasalt`; and neither has an unused stone in the
 * band it would fall back to. The cause is that STATION DEPTHS are authored at
 * absolute, Loam-ish numbers across shells whose floors run 250 to 560 — and
 * §6 PINS several of them (Prism Fall 20, Retort Hall 120, The Balance House
 * 130, Witness Hall 140), so the stations cannot move either.
 *
 * Re-authoring 42 seam entries would push every shell's rare stone into its
 * last fifth and leave the shallow half commons-only. That is a change to what
 * five shells FEEL like, not a gate fix — the brief's own words for the Loam
 * case, "a drop-economy change wearing a bugfix's clothes", pointed at shells
 * II–VII. It needs its own ruling and its own pass; it is ledgered with the
 * measurement attached.
 *
 * So the clamp fixes exactly the case the ruling NAMES — a shell whose floor is
 * shallower than the ladder — and changes nothing where the shaft is long
 * enough to hold it. Every shell with a floor at or past 150 is bit-identical
 * by construction, which is Loam AND the five it would otherwise have moved.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `shellDef` throws on an unknown id and the shell registry is empty until an
 * engine exists (the `allShells()` trap, ledgered at A.58), so this falls back
 * to Loam's own floor rather than throwing — a caller with no shell gets
 * exactly the table this game has always had.
 */
/**
 * MEMOISED, because this went on the hot path the moment it existed.
 *
 * `rollRarity` asks twelve times per drop and the drop table is swept 45,000
 * times by several tests; an uncached `shellDef` + try/catch per ask timed two
 * suites out on the first run. Keyed by shell id and cleared by nothing — a
 * shell's floor is authored content and does not move inside a session.
 */
const gateCache = new Map<string, number[]>();
/** Loam's own ladder, and what an unregistered shell falls back to. */
const LOAM_LADDER = RARITIES.map((r) => RARITY_GATES[r].ofFloor);

export function gateDepth(shellId: string, rarity: MaterialRarity): number {
  let row = gateCache.get(shellId);
  if (!row) {
    // `shellDefOrNull`, NEVER `shellDef`. The registry is empty until an engine
    // exists (the `allShells()` trap, A.58), and a throw on this path costs
    // 40x what the whole roll does — it timed a suite out on the first run.
    const def = shellDefOrNull(shellId);
    // NOT cached before the registry exists: caching the fallback then would
    // freeze every shell on Loam's ladder for the life of the process.
    if (!def) return LOAM_LADDER[RARITIES.indexOf(rarity)] ?? 0;
    const scale = Math.min(1, (def.floorDepth || LOAM_FLOOR) / LOAM_FLOOR);
    row = RARITIES.map((r) => Math.round(RARITY_GATES[r].ofFloor * scale));
    gateCache.set(shellId, row);
  }
  return row[RARITIES.indexOf(rarity)] ?? 0;
}

/**
 * THE DEPTH THIS MATERIAL OPENS AT, IN ITS OWN SHELL — which is the question
 * every recipe audit is actually asking. A Ferrite stone's gate is a Ferrite
 * depth; comparing it against a Loam one was only ever right by accident.
 */
export function gateOfMaterial(materialId: string): number {
  const m = MATERIALS.find((x) => x.id === materialId);
  return m ? gateDepth(m.shellId, m.rarity) : 0;
}

export interface RolledDrop {
  kind: 'material' | 'geode' | 'gem';
  materialId?: string;
  gemId?: string;
  purity?: number;
}

/**
 * Weighted rarity pick at a depth IN A SHELL; null if nothing is available.
 *
 * The shell id is not decoration — it is what turns the table above from six
 * absolute numbers into six proportions. A caller that cannot name a shell is
 * asking a question the re-keying made meaningless.
 */
export function rollRarity(
  shellId: string, depth: number, rng: () => number = Math.random,
): MaterialRarity | null {
  let total = 0;
  for (const r of RARITIES) {
    if (depth >= gateDepth(shellId, r)) total += RARITY_GATES[r].weight;
  }
  if (total <= 0) return null;
  let pick = rng() * total;
  for (const r of RARITIES) {
    if (depth < gateDepth(shellId, r)) continue;
    pick -= RARITY_GATES[r].weight;
    if (pick <= 0) return r;
  }
  return 'common';
}

/**
 * THE REMAINS ARE IN A PLACE, NOT IN THE POOL (A.84).
 *
 * How far from a station its remains reach, and what share of the drops inside
 * that window come up as them.
 *
 * SIZED AGAINST THE THING IT MUST NOT DO. This is a SUBSTITUTION, exactly like
 * THE ASSAY CALL below it: one unit in, one unit out, at a roll that had
 * already happened. It cannot change the drop chance, the number of drops, or
 * the charge that paid for them — so no value of either constant reaches
 * `dpsMax`, and pillar 2 holds structurally rather than by tuning. What the
 * SHARE buys is how much of a narrow depth band's drops are the local remains
 * instead of the local rock; what the REACH buys is how narrow.
 *
 * 4 and 0.35 make each seamed station about nine depths of the hundred and
 * fifty, so a stone stays a thing you go somewhere for.
 */
export const REMAINS_REACH = 4;
export const REMAINS_SHARE = 0.35;

/**
 * The live values, in one mutable object so a sim ARM can turn the mechanism
 * off without a second binary. `--remains-share 0` reproduces the drop table
 * exactly as it was before A.84 — a baseline measured by the same code as the
 * treatment, which is the only kind this project accepts (PILLARS, A.42).
 */
export const REMAINS_TUNING = { reach: REMAINS_REACH, share: REMAINS_SHARE };

/**
 * The remains a station within reach of this depth holds — read off the
 * AUTHORED station list, never off save state, so `rollDrop` stays pure and a
 * plain sweep of the drop table can find them.
 *
 * The authored `seams` pool is a geological fact about the place ("the rock
 * around The Sag holds one of these"); WHICH of them the station is featuring
 * this run is the §1.1 re-roll, and that is a different question this does not
 * ask. A remains stone still answers to its own RARITY GATE, so being near the
 * place is necessary and never sufficient — Marrowglass is at Sinter Row and
 * Sinter Row is at depth 60, but pure does not open until 40 either way.
 *
 * REMAINS NEED A GEOGRAPHY TO BE IN, which is why A.84 fixed Loam and ledgered
 * the rest. This asks `authoredRoll` now instead of testing for Loam by hand,
 * so Ferrite's six are re-sourced by the same mechanism rather than by a second
 * one, and the five shells still without a Roll return `[]` exactly as before.
 */
export function remainsAt(shellId: string, depth: number): MaterialDef[] {
  const stations = authoredRoll(shellId);
  if (stations.length === 0) return [];
  const out: MaterialDef[] = [];
  for (const st of stations) {
    if (Math.abs(st.depth - depth) > REMAINS_TUNING.reach) continue;
    for (const id of st.remains ?? []) {
      const def = MATERIALS.find((m) => m.id === id);
      if (!def || def.source !== 'remains') continue;
      if (depth < gateDepth(shellId, def.rarity)) continue;
      if (!out.includes(def)) out.push(def);
    }
  }
  return out;
}

/**
 * Roll a single drop for a shell at a depth. Assumes the drop CHANCE already
 * passed — this only decides what fell out.
 */
export function rollDrop(
  shellId: string,
  depth: number,
  rng: () => number = Math.random,
  /** THE ASSAY CALL: which material this run's band favours, or null. */
  favoured: string | null = null,
): RolledDrop {
  const kindRoll = rng();
  if (kindRoll < GEODE_SHARE) return { kind: 'geode' };
  if (depth >= 60 && kindRoll < GEODE_SHARE + GEM_SHARE) {
    const candidates = GEMS.filter((g) => g.shellId === shellId);
    if (candidates.length > 0) {
      return { kind: 'gem', gemId: candidates[Math.floor(rng() * candidates.length)]!.id };
    }
  }
  const rarity = rollRarity(shellId, depth, rng) ?? 'common';
  /**
   * THE REMAINS, BEFORE THE POOL. Near a station that holds them, this share of
   * drops comes up as what is buried there instead of what the rarity table
   * would have handed over. It SUBSTITUTES — the drop already happened, and one
   * stone still comes out — so it adds materials without adding throughput.
   *
   * Note this reads the depth it was PASSED, which for an ore pocket is
   * `state.depth + depthBonus`. That is deliberate and reads correctly: a table
   * rolled deeper reaches the deeper place too.
   */
  const remains = remainsAt(shellId, depth);
  if (remains.length > 0 && rng() < REMAINS_TUNING.share) {
    const def = remains[Math.floor(rng() * remains.length)]!;
    return { kind: 'material', materialId: def.id, purity: rollPurity(def.rarity, rng) };
  }
  // Combat-only materials never come out of the rock, and neither do WORKED
  // ones — those are made at a bench, not found in a seam. REMAINS are out of
  // this pool too: they have their own route above, which is a place.
  const pool = MATERIALS.filter((m) => m.shellId === shellId && m.rarity === rarity && !m.source && !m.worked);
  const def = pickFavoured(pool, favoured, rng) ?? FALLBACK_DROP;
  return { kind: 'material', materialId: def.id, purity: rollPurity(def.rarity, rng) };
}

/**
 * THE ASSAY CALL'S THUMB ON THE SCALE (§40.3), and it is a REDISTRIBUTION, not
 * a faucet.
 *
 * The favoured material is drawn with extra weight from the SAME pool, on the
 * SAME roll, at the SAME rarity that was already decided above. It cannot
 * change whether a drop happens, how many drop, or what rarity is rolled — only
 * which of the equally-likely candidates comes up. Every unit of weight it
 * gains is a unit some sibling loses.
 *
 * PILLAR 2: drops are outside the income path already, and this is outside the
 * drop RATE as well. There is no path from here to cellCap, cellRegen or
 * chipYield, and a test drives the Call across every material and reads dpsMax.
 */
function pickFavoured(
  pool: MaterialDef[],
  favoured: string | null,
  rng: () => number,
): MaterialDef | undefined {
  if (pool.length === 0) return undefined;
  if (!favoured || !pool.some((m) => m.id === favoured)) {
    return pool[Math.floor(rng() * pool.length)];
  }
  const weights = pool.map((m) => (m.id === favoured ? CALL_DROP_WEIGHT : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** How much likelier the favoured stone is than any one sibling. Mirrors
 *  `CALL_WEIGHT` in assayBench.ts; kept here so `rollDrop` stays pure. */
export const CALL_DROP_WEIGHT = 2.5;

/** The seam's floor: when a (shell, rarity) pool is empty, fall back to the
 *  first MINEABLE material — never MATERIALS[0], which is a worked material
 *  (refineslag) and would leak a bench product into the rock. */
const FALLBACK_DROP = MATERIALS.find((m) => !m.worked && !m.source)!;

/** Geodes crack into 2-4 rarity-boosted rolls with a real gem chance. */
export function crackGeodeRolls(shellId: string, depth: number, rng: () => number = Math.random): RolledDrop[] {
  const out: RolledDrop[] = [];
  const count = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < count; i++) {
    if (rng() < 0.08) {
      const candidates = GEMS.filter((g) => g.shellId === shellId);
      if (candidates.length > 0) {
        out.push({ kind: 'gem', gemId: candidates[Math.floor(rng() * candidates.length)]!.id });
        continue;
      }
    }
    // Boosted: roll at an effective depth 40 deeper than where it was found.
    // Worked materials are BENCH products — a cracked geode is still rock, so
    // it must exclude them exactly as rollDrop does (the leak the export spine
    // sim caught: a rich Loam geode was rolling Kilnflux, a Verdance one
    // Fibercloth — both bench exports appearing in the seam).
    const rarity = rollRarity(shellId, depth + 40, rng) ?? 'common';
    const pool = MATERIALS.filter((m) => m.shellId === shellId && m.rarity === rarity && !m.source && !m.worked);
    const def = pool[Math.floor(rng() * pool.length)] ?? FALLBACK_DROP;
    out.push({ kind: 'material', materialId: def.id, purity: rollPurity(def.rarity, rng) });
  }
  return out;
}
