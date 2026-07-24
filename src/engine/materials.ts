/**
 * Ore taxonomy — the substrate for alloys, runes, brewing, merchants,
 * contracts, and relics. Materials are DATA: 132 across seven shells, each
 * visually defined as palette + facet count + shimmer profile (the art is
 * generated, never drawn). 100 are mineable; 32 drop only from the Deepwrought.
 *
 * Every drop rolls a purity 0-100. Distributions are tight at low rarities
 * and wide at high ones — a Flawless stone with a bad roll should sting.
 *
 * Materials are POSSESSIONS, not shell currency: they survive Collapse.
 */
import type { Bucket } from './modifiers';

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
  /** 'combat' materials cannot be mined — the Deepwrought drop them. */
  source?: 'combat';
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
export type PurityBand = 'poor' | 'fair' | 'good' | 'fine' | 'exalted';

export const BANDS: PurityBand[] = ['poor', 'fair', 'good', 'fine', 'exalted'];

export const BAND_RANGES: Record<PurityBand, [number, number]> = {
  poor: [0, 39],
  fair: [40, 59],
  good: [60, 79],
  fine: [80, 94],
  exalted: [95, 100],
};

export const BAND_LABELS: Record<PurityBand, string> = {
  poor: 'Poor',
  fair: 'Fair',
  good: 'Good',
  fine: 'Fine',
  exalted: 'Exalted',
};

export function bandOf(purity: number): PurityBand {
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
): MaterialDef => ({ id, name, shellId, rarity, palette, facets, shimmer, flavor, ...(worked ? { worked } : {}) });

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
  // Verdance combat-only (Phase 7) — the Loom's fibers walk and bite.
  { id: 'throatroot', name: 'Throatroot', shellId: 'verdance', rarity: 'common', palette: ['#3a2f20', '#66543a', '#96805a'], facets: 4, shimmer: 'none', source: 'combat', flavor: 'A root that swallowed. Spin it before it remembers how.' },
  { id: 'mothspool', name: 'Mothspool', shellId: 'verdance', rarity: 'common', palette: ['#3a3830', '#6a6656', '#a09a84'], facets: 4, shimmer: 'soft', source: 'combat', flavor: 'Wound silk off a wing the size of a door.' },
  { id: 'wireweed', name: 'Wireweed', shellId: 'verdance', rarity: 'rich', palette: ['#2c332a', '#4e6349', '#7d9c74'], facets: 5, shimmer: 'none', source: 'combat', flavor: 'A plant doing an impression of cable. The impression bites.' },
  { id: 'palefiber', name: 'Palefiber', shellId: 'verdance', rarity: 'rich', palette: ['#343440', '#5e5e74', '#9494ae'], facets: 5, shimmer: 'soft', source: 'combat', flavor: 'Thread from something that was barely there. The Loom disagrees about the barely.' },
  { id: 'mawpith', name: 'Mawpith', shellId: 'verdance', rarity: 'pure', palette: ['#332226', '#63424a', '#9c6c78'], facets: 6, shimmer: 'soft', source: 'combat', flavor: 'The soft center of a hard argument.' },
  { id: 'plentyheart', name: "Old Plenty's Heart", shellId: 'verdance', rarity: 'flawless', palette: ['#2a3620', '#4c6a3a', '#7fa85e'], facets: 9, shimmer: 'crystalline', source: 'combat', flavor: 'It is still beating, at about one beat per season.' },
  // Glassmere combat-only (Phase 8).
  { id: 'glasschitin', name: 'Glasschitin', shellId: 'glassmere', rarity: 'common', palette: ['#3a4048', '#6a7684', '#a8b8c8'], facets: 6, shimmer: 'crystalline', source: 'combat', flavor: 'Armor you can read a page through. The page argues back.' },
  { id: 'coldsinew', name: 'Coldsinew', shellId: 'glassmere', rarity: 'common', palette: ['#38404a', '#5e6c7c', '#93a8ba'], facets: 5, shimmer: 'soft', source: 'combat', flavor: 'Muscle at four below. It flexes slowly and forever.' },
  { id: 'lenswing', name: 'Lenswing', shellId: 'glassmere', rarity: 'rich', palette: ['#404452', '#707a94', '#b0bcd8'], facets: 7, shimmer: 'crystalline', source: 'combat', flavor: 'A wing that focuses what it flies through.' },
  { id: 'prismheart', name: 'Prismheart', shellId: 'glassmere', rarity: 'pure', palette: ['#3c3a50', '#6c6890', '#a89ed0'], facets: 8, shimmer: 'crystalline', source: 'combat', flavor: 'It splits whatever light reaches it, including attention.' },
  { id: 'unblinkingTear', name: "The Unblinking's Tear", shellId: 'glassmere', rarity: 'flawless', palette: ['#3a4456', '#68809c', '#a8cce8'], facets: 10, shimmer: 'crystalline', source: 'combat', flavor: 'It wept exactly once. You were there.' },
  // Cinder combat-only (Phase 9) — everything down here is partly furnace.
  { id: 'emberplate', name: 'Emberplate', shellId: 'cinder', rarity: 'common', palette: ['#3a2a20', '#6e4630', '#b3714a'], facets: 5, shimmer: 'soft', source: 'combat', flavor: 'Armor shed still warm. It stays warm. Nobody knows what off is, down here.' },
  { id: 'charsinew', name: 'Charsinew', shellId: 'cinder', rarity: 'common', palette: ['#2c2422', '#4e3c36', '#7e5e52'], facets: 4, shimmer: 'none', source: 'combat', flavor: 'Muscle that cooked and kept working. An example to us all, says Hob.' },
  { id: 'magmaduct', name: 'Magmaduct', shellId: 'cinder', rarity: 'rich', palette: ['#3a221a', '#6e3a26', '#c25c38'], facets: 6, shimmer: 'soft', source: 'combat', flavor: 'A vein that carried fire instead of blood. Still carries a little.' },
  { id: 'pyregland', name: 'Pyregland', shellId: 'cinder', rarity: 'pure', palette: ['#40261a', '#7a422a', '#d97a42'], facets: 7, shimmer: 'crystalline', source: 'combat', flavor: 'The organ that decides when to burn. It has never once decided no.' },
  { id: 'smolderheart', name: "The Smolder's Heart", shellId: 'cinder', rarity: 'flawless', palette: ['#331e16', '#66301c', '#bf5426'], facets: 10, shimmer: 'crystalline', source: 'combat', flavor: 'It beats once a minute, and each beat is a decision not to erupt.' },

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
  { id: 'quietsinew', name: 'Quietsinew', shellId: 'hollow', rarity: 'common', palette: ['#2e2c38', '#4e4a66', '#7e7898'], facets: 4, shimmer: 'none', source: 'combat', flavor: 'Muscle from something that moves without occupying the space between.' },
  { id: 'hollowplate', name: 'Hollowplate', shellId: 'hollow', rarity: 'rich', palette: ['#2a2836', '#4a4468', '#7a72a0'], facets: 6, shimmer: 'soft', source: 'combat', flavor: 'Armor with no inside. It fits everyone.' },
  { id: 'unheart', name: 'Unheart', shellId: 'hollow', rarity: 'flawless', palette: ['#262238', '#463e6c', '#7a6ea8'], facets: 10, shimmer: 'crystalline', source: 'combat', flavor: 'It beats. Do not ask what it pumps, or where.' },

  // ================== SHELL VII — ALEPH (Phase 10, live) ===================
  M('firstiron', 'First Iron', 'aleph', 'common', ['#3a362c', '#6e6650', '#b0a684'], 5, 'soft',
    'The iron every other iron is a copy of.'),
  M('protolith', 'Protolith', 'aleph', 'rich', ['#38342a', '#6a624a', '#a89a74'], 6, 'soft'),
  M('axiomite2', 'Ruleshard', 'aleph', 'pure', ['#3c3826', '#746a42', '#bfae6a'], 8, 'crystalline',
    'A fragment of how things are. Handle with conviction.'),
  M('alephite', 'Alephite', 'aleph', 'flawless', ['#403a24', '#7c6e3e', '#ccb862'], 9, 'crystalline',
    'The first material. Everything else is commentary.'),
  { id: 'authorsInk', name: "The Author's Ink", shellId: 'aleph', rarity: 'flawless', palette: ['#26242c', '#48444e', '#787280'], facets: 10, shimmer: 'crystalline', source: 'combat', flavor: 'It writes on the world directly. The pen is bolted down for a reason.' },

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

  // ============ COMBAT-ONLY (the Deepwrought drop these; unminable) ========
  { id: 'chitinshard', name: 'Chitinshard', shellId: 'loam', rarity: 'common', palette: ['#3a3226', '#6b5c42', '#a5936c'], facets: 5, shimmer: 'none', source: 'combat', flavor: 'Plate off something that objected to being dug through.' },
  { id: 'gravemote', name: 'Gravemote', shellId: 'loam', rarity: 'common', palette: ['#2e2c33', '#54505e', '#8a8496'], facets: 4, shimmer: 'soft', source: 'combat', flavor: 'It drifts upward if you stop watching it.' },
  { id: 'wormsilk', name: 'Wormsilk', shellId: 'loam', rarity: 'rich', palette: ['#3c3830', '#6e6753', '#ada183'], facets: 6, shimmer: 'soft', source: 'combat', flavor: 'Stronger than it should be. Damp forever.' },
  { id: 'burrowertooth', name: "Burrower's Tooth", shellId: 'loam', rarity: 'rich', palette: ['#42392c', '#7a6a4e', '#bda87c'], facets: 6, shimmer: 'none', source: 'combat', flavor: 'Curved for going forward. Only forward.' },
  { id: 'marrowglass', name: 'Marrowglass', shellId: 'loam', rarity: 'pure', palette: ['#443c33', '#7d7059', '#c4b494'], facets: 8, shimmer: 'crystalline', source: 'combat', flavor: 'Grown in the middle of something alive. It remembers a pulse.' },
  { id: 'taproot', name: "Tapmother's Root", shellId: 'loam', rarity: 'flawless', palette: ['#33402c', '#5c744e', '#94b581'], facets: 9, shimmer: 'crystalline', source: 'combat', flavor: 'Cut from the Warden of the Loam floor. It is still growing, slowly.' },
  { id: 'scalebackplate', name: 'Scaleback Plate', shellId: 'ferrite', rarity: 'common', palette: ['#2c3138', '#4e5865', '#7f8fa3'], facets: 5, shimmer: 'none', source: 'combat', flavor: 'Armor that grew, was shed, and is now yours.' },
  { id: 'ironsinew', name: 'Ironsinew', shellId: 'ferrite', rarity: 'rich', palette: ['#32302e', '#5c5754', '#948d87'], facets: 6, shimmer: 'soft', source: 'combat', flavor: 'Flexes once per day, whether you use it or not.' },
  { id: 'voltgland', name: 'Voltgland', shellId: 'ferrite', rarity: 'rich', palette: ['#2c3440', '#4c6078', '#7f9fc2'], facets: 7, shimmer: 'soft', source: 'combat', flavor: 'Handle with dry gloves, or briefly.' },
  { id: 'magnetheart', name: 'Magnetheart', shellId: 'ferrite', rarity: 'pure', palette: ['#28283a', '#4a4a6e', '#7f7fad'], facets: 8, shimmer: 'crystalline', source: 'combat', flavor: 'Still beating, in a way. Every compass in camp agrees.' },
  { id: 'nullquill', name: 'Nullquill', shellId: 'ferrite', rarity: 'flawless', palette: ['#26262c', '#46464f', '#787883'], facets: 9, shimmer: 'crystalline', source: 'combat', flavor: 'Writes on polarity itself. Erases it too.' },
  { id: 'loadstarcore', name: 'Loadstar Core', shellId: 'ferrite', rarity: 'flawless', palette: ['#2a3040', '#4e5f80', '#89a2ce'], facets: 10, shimmer: 'crystalline', source: 'combat', flavor: 'Cut from the Warden of the Ferrite floor. It points at YOU.' },

  // ======================= SHELL VII — ALEPH (7, dormant) ==================
  M('axiomdust', 'Axiom Dust', 'aleph', 'rich', ['#38342a', '#6e664a', '#b8ab7c'], 6, 'soft'),
  M('sigilstone', 'Sigilstone', 'aleph', 'pure', ['#343036', '#635c66', '#a89aab'], 8, 'crystalline'),
  M('lawgold', 'Lawgold', 'aleph', 'pure', ['#3a3418', '#736626', '#c2ab40'], 8, 'crystalline'),
  // (First Iron and Alephite moved to the live Phase-10 block above.)
  M('worldseed', 'Worldseed Ore', 'aleph', 'starred', ['#2e3328', '#586348', '#96a87a'], 10, 'crystalline'),
  M('paradoxa', 'Paradoxa', 'aleph', 'aberrant', ['#2c2830', '#544c5c', '#8f8299'], 9, 'aberrant'),
];

/** The five alloy castings, ordered by family metal [ingot, flux, scale,
 *  lodestone, rime]. A casting only ever BINDS, and only a Tier X+ tool. */
export const CASTING_IDS = ['steelcasting', 'brazecasting', 'platecasting', 'polecasting', 'cryocasting'] as const;
export const CASTING_BIND_TIER = 10;

const materialById = new Map(MATERIALS.map((m) => [m.id, m]));

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
    id: 'voidopal', name: 'Voidopal', color: '#5c5080', bucket: 'motifGain', value: 1.3,
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

/** Rarity availability by depth (Shell I) and weights once available. */
export const RARITY_GATES: Record<MaterialRarity, { minDepth: number; weight: number }> = {
  common: { minDepth: 0, weight: 100 },
  rich: { minDepth: 10, weight: 32 },
  pure: { minDepth: 40, weight: 13 },
  flawless: { minDepth: 70, weight: 5 },
  starred: { minDepth: 110, weight: 2 },
  aberrant: { minDepth: 150, weight: 0.8 },
};

export interface RolledDrop {
  kind: 'material' | 'geode' | 'gem';
  materialId?: string;
  gemId?: string;
  purity?: number;
}

/** Weighted rarity pick at a depth; returns null if nothing is available. */
export function rollRarity(depth: number, rng: () => number = Math.random): MaterialRarity | null {
  let total = 0;
  for (const r of RARITIES) {
    const gate = RARITY_GATES[r];
    if (depth >= gate.minDepth) total += gate.weight;
  }
  if (total <= 0) return null;
  let pick = rng() * total;
  for (const r of RARITIES) {
    const gate = RARITY_GATES[r];
    if (depth < gate.minDepth) continue;
    pick -= gate.weight;
    if (pick <= 0) return r;
  }
  return 'common';
}

/**
 * Roll a single drop for a shell at a depth. Assumes the drop CHANCE already
 * passed — this only decides what fell out.
 */
export function rollDrop(shellId: string, depth: number, rng: () => number = Math.random): RolledDrop {
  const kindRoll = rng();
  if (kindRoll < GEODE_SHARE) return { kind: 'geode' };
  if (depth >= 60 && kindRoll < GEODE_SHARE + GEM_SHARE) {
    const candidates = GEMS.filter((g) => g.shellId === shellId);
    if (candidates.length > 0) {
      return { kind: 'gem', gemId: candidates[Math.floor(rng() * candidates.length)]!.id };
    }
  }
  const rarity = rollRarity(depth, rng) ?? 'common';
  // Combat-only materials never come out of the rock.
  // Combat-only materials never come out of the rock, and neither do WORKED
  // ones — those are made at a bench, not found in a seam.
  const pool = MATERIALS.filter((m) => m.shellId === shellId && m.rarity === rarity && !m.source && !m.worked);
  const def = pool[Math.floor(rng() * pool.length)] ?? FALLBACK_DROP;
  return { kind: 'material', materialId: def.id, purity: rollPurity(def.rarity, rng) };
}

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
    const rarity = rollRarity(depth + 40, rng) ?? 'common';
    const pool = MATERIALS.filter((m) => m.shellId === shellId && m.rarity === rarity && !m.source && !m.worked);
    const def = pool[Math.floor(rng() * pool.length)] ?? FALLBACK_DROP;
    out.push({ kind: 'material', materialId: def.id, purity: rollPurity(def.rarity, rng) });
  }
  return out;
}
