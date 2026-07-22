/**
 * THE DEEPWROUGHT — things live in the shells. ~15 species per shell as
 * BEHAVIOR data (pattern sets, defenses, movement, specials), never
 * stat-scaled reskins: each demands a different answer. They drop materials
 * that cannot be mined. Ferrite species interact with polarity.
 *
 * Silhouette archetypes drive the procedural art: grub / swarm / stalker /
 * sentinel / flyer / coil.
 */

export type TelegraphKind =
  | 'single' // one lane, hits hard
  | 'sweep' // three adjacent lanes
  | 'cross' // player's lane + both neighbours (predictive)
  | 'allbut' // every lane except one safe gap
  | 'charge'; // two-turn windup, huge, whole side

export type Silhouette = 'grub' | 'swarm' | 'stalker' | 'sentinel' | 'flyer' | 'coil';

export interface SpeciesDef {
  id: string;
  name: string;
  shellId: string;
  /** Threat tier maps to tool tiers (loam 1-3, ferrite 4-6). */
  tier: number;
  hp: number;
  power: number;
  /** Which telegraphs it uses (behavior identity). */
  patterns: TelegraphKind[];
  /** Behaviour axes — each changes the correct answer. */
  shieldedFront?: boolean; // frontal strikes half; flank fully
  phaseSkin?: boolean; // only fully hurt on alternating turns (rhythm test)
  enrage?: boolean; // +50% power below one-third hp
  swarm?: boolean; // many small hits; guard is weak against it
  burrower?: boolean; // relocates, denying flanks
  mirror?: boolean; // copies your lane — you cannot simply stand aside
  regenerator?: boolean; // heals unless killed briskly
  thief?: boolean; // hits also skim chip currency
  /** Ferrite: polarity pole. Matching your last chip's sign = +50% damage
   * dealt to it; opposing = −25%. Routing reaches into combat. */
  pole?: 1 | -1;
  poleFlips?: boolean; // pole alternates every 3 turns
  /** Verdance: spawn weight rises with your feral vine count — some things
   * nest in what you let grow. */
  feralAffinity?: number;
  /** Old Plenty's thesis: fruit lanes tempt; striking into abundance FEEDS
   * it, waiting starves it. Patience under abundance. */
  abundance?: boolean;
  /** Glassmere: telegraphs are INVISIBLE without reveal gear — it punishes
   * acting without looking. Sight is the counter, not reflexes. */
  veiled?: boolean;
  /** Cinder: only surfaces when the shaft runs at or above this heat —
   * the hot bestiary is opt-in danger, like everything else about heat. */
  hotOnly?: number;
  /** Cinder: killing it VENTS this much heat — the shell's live cooling. */
  ventsOnKill?: number;
  /** Cinder: each hit it lands stokes the shaft by this much heat. */
  stokes?: number;
  /** The Smolder's thesis: RESTRAINT. Its power scales with YOUR heat —
   * greed literally arms the warden. Fight it cool or feed it. */
  wrathful?: boolean;
  /** The Unattended's thesis: PRESENCE. It grows SOLID under observation —
   * reveal gear feeds it. The curriculum, inverted once, at the end. */
  presence?: boolean;
  silhouette: Silhouette;
  /** Depth window it haunts. */
  minDepth: number;
  maxDepth: number;
  weight: number;
  drops: { materialId: string; chance: number }[];
  xp: number;
  flavor: string;
  /** Bestiary behaviour note — EARNED at 3 kills, not given. */
  note: string;
  isWarden?: boolean;
}

const S = (def: SpeciesDef): SpeciesDef => def;

export const SPECIES: SpeciesDef[] = [
  // ========================= LOAM (15) =====================================
  S({
    id: 'marlgrub', name: 'Marlgrub', shellId: 'loam', tier: 1, hp: 14, power: 3,
    patterns: ['single'], silhouette: 'grub', minDepth: 5, maxDepth: 60, weight: 100,
    drops: [{ materialId: 'chitinshard', chance: 0.8 }], xp: 30,
    flavor: 'A thumb-thick worm with opinions about your lantern.',
    note: 'Spits at one lane, always the one it faces. Step aside; step back in.',
  }),
  S({
    id: 'chalkmite', name: 'Chalkmite Swarm', shellId: 'loam', tier: 1, hp: 10, power: 2,
    patterns: ['sweep'], swarm: true, silhouette: 'swarm', minDepth: 5, maxDepth: 55, weight: 80,
    drops: [{ materialId: 'gravemote', chance: 0.7 }], xp: 30,
    flavor: 'Dust that bites. Hundreds of it.',
    note: 'Guarding barely helps against many small teeth. Move out of the sweep instead.',
  }),
  S({
    id: 'dustwisp', name: 'Dustwisp', shellId: 'loam', tier: 1, hp: 12, power: 3,
    patterns: ['cross'], mirror: true, silhouette: 'flyer', minDepth: 8, maxDepth: 70, weight: 70,
    drops: [{ materialId: 'gravemote', chance: 0.6 }], xp: 34,
    flavor: 'Your shadow, if your shadow hated you.',
    note: 'Follows your lane. Feint one way at the last beat — it commits before you do.',
  }),
  S({
    id: 'rootlasher', name: 'Rootlasher', shellId: 'loam', tier: 1, hp: 18, power: 4,
    patterns: ['sweep', 'single'], silhouette: 'coil', minDepth: 12, maxDepth: 75, weight: 70,
    drops: [{ materialId: 'wormsilk', chance: 0.5 }], xp: 38,
    flavor: 'A root that learned the whip before it learned the sun.',
    note: 'Alternates wide sweeps and precise snaps. The pattern is a two-count.',
  }),
  S({
    id: 'gravegnaw', name: 'Gravegnaw', shellId: 'loam', tier: 1, hp: 22, power: 3,
    patterns: ['single'], thief: true, silhouette: 'stalker', minDepth: 15, maxDepth: 80, weight: 60,
    drops: [{ materialId: 'chitinshard', chance: 0.6 }, { materialId: 'burrowertooth', chance: 0.25 }], xp: 40,
    flavor: 'Eats Dust. Yours, specifically.',
    note: 'Every hit it lands skims your Dust. Kill it fast or pay it rent.',
  }),
  S({
    id: 'marlhopper', name: 'Marlhopper', shellId: 'loam', tier: 2, hp: 40, power: 5,
    patterns: ['cross', 'single'], burrower: true, silhouette: 'stalker', minDepth: 40, maxDepth: 100, weight: 80,
    drops: [{ materialId: 'burrowertooth', chance: 0.6 }], xp: 60,
    flavor: 'Six legs, no patience.',
    note: 'Re-tunnels to a new lane after every strike — flanking it is a moving target.',
  }),
  S({
    id: 'chalkshell', name: 'Chalkshell', shellId: 'loam', tier: 2, hp: 55, power: 5,
    patterns: ['single', 'sweep'], shieldedFront: true, silhouette: 'sentinel', minDepth: 45, maxDepth: 105, weight: 75,
    drops: [{ materialId: 'chitinshard', chance: 0.9 }, { materialId: 'marrowglass', chance: 0.2 }], xp: 65,
    flavor: 'A boulder, until it isn\'t.',
    note: 'Its face is a wall. Strike from the lanes beside it or barely scratch.',
  }),
  S({
    id: 'silkweaver', name: 'Silkweaver', shellId: 'loam', tier: 2, hp: 38, power: 6,
    patterns: ['allbut'], silhouette: 'coil', minDepth: 50, maxDepth: 110, weight: 65,
    drops: [{ materialId: 'wormsilk', chance: 0.85 }], xp: 66,
    flavor: 'It webs the whole gallery and leaves you one gap. Rude.',
    note: 'Covers every lane but one. Find the gap early; it telegraphs the mercy, not the threat.',
  }),
  S({
    id: 'mournmoth', name: 'Mournmoth', shellId: 'loam', tier: 2, hp: 34, power: 5,
    patterns: ['sweep', 'cross'], phaseSkin: true, silhouette: 'flyer', minDepth: 55, maxDepth: 115, weight: 60,
    drops: [{ materialId: 'gravemote', chance: 0.8 }, { materialId: 'marrowglass', chance: 0.15 }], xp: 70,
    flavor: 'Wings like slate. It grieves audibly.',
    note: 'Solid only every other beat. Swing on its beat, not yours.',
  }),
  S({
    id: 'tunnelwight', name: 'Tunnelwight', shellId: 'loam', tier: 2, hp: 48, power: 6,
    patterns: ['charge', 'single'], enrage: true, silhouette: 'stalker', minDepth: 60, maxDepth: 120, weight: 55,
    drops: [{ materialId: 'marrowglass', chance: 0.35 }], xp: 75,
    flavor: 'It was a delver. It kept delving.',
    note: 'Bleeds patience: past its last third it doubles down. Save your guard for the end.',
  }),
  S({
    id: 'clayback', name: 'Clayback Bull', shellId: 'loam', tier: 3, hp: 120, power: 8,
    patterns: ['charge', 'sweep'], shieldedFront: true, enrage: true, silhouette: 'sentinel', minDepth: 110, maxDepth: 150, weight: 70,
    drops: [{ materialId: 'chitinshard', chance: 1 }, { materialId: 'marrowglass', chance: 0.4 }], xp: 110,
    flavor: 'The gallery shakes before you see it.',
    note: 'Two-beat charges that flatten half the lanes. Its flanks stay soft the whole time.',
  }),
  S({
    id: 'hollowmaw', name: 'Hollowmaw', shellId: 'loam', tier: 3, hp: 100, power: 9,
    patterns: ['allbut', 'cross'], regenerator: true, silhouette: 'grub', minDepth: 115, maxDepth: 150, weight: 60,
    drops: [{ materialId: 'wormsilk', chance: 0.7 }, { materialId: 'marrowglass', chance: 0.4 }], xp: 115,
    flavor: 'Mostly mouth. The rest is also mouth.',
    note: 'Knits itself shut between your blows. Hesitate and you fight it twice.',
  }),
  S({
    id: 'gravetide', name: 'Gravetide', shellId: 'loam', tier: 3, hp: 90, power: 7,
    patterns: ['sweep', 'allbut'], swarm: true, mirror: true, silhouette: 'swarm', minDepth: 120, maxDepth: 150, weight: 55,
    drops: [{ materialId: 'gravemote', chance: 1 }, { materialId: 'burrowertooth', chance: 0.5 }], xp: 118,
    flavor: 'The floor moves. All of it.',
    note: 'A tide that follows you and cannot be guarded, only outrun.',
  }),
  S({
    id: 'silkmatron', name: 'Silk Matron', shellId: 'loam', tier: 3, hp: 110, power: 8,
    patterns: ['allbut', 'single'], regenerator: true, thief: true, silhouette: 'coil', minDepth: 125, maxDepth: 150, weight: 45,
    drops: [{ materialId: 'wormsilk', chance: 1 }, { materialId: 'marrowglass', chance: 0.5 }], xp: 125,
    flavor: 'The weavers answer to her. So does the dark, a little.',
    note: 'Webs, heals, and robs you while you decide which problem to solve first. Solve the healing.',
  }),
  S({
    id: 'marlwidow', name: 'Marlwidow', shellId: 'loam', tier: 3, hp: 85, power: 10,
    patterns: ['cross', 'charge'], phaseSkin: true, burrower: true, silhouette: 'stalker', minDepth: 130, maxDepth: 150, weight: 40,
    drops: [{ materialId: 'burrowertooth', chance: 0.8 }, { materialId: 'marrowglass', chance: 0.6 }], xp: 130,
    flavor: 'Eight holes in the marl. She is in one of them.',
    note: 'Phases and re-tunnels. The only reliable beat is the one right after she strikes.',
  }),

  // ========================= FERRITE (15) ==================================
  S({
    id: 'scaleback', name: 'Scaleback', shellId: 'ferrite', tier: 4, hp: 240, power: 14,
    patterns: ['single', 'sweep'], pole: 1, silhouette: 'stalker', minDepth: 5, maxDepth: 60, weight: 100,
    drops: [{ materialId: 'scalebackplate', chance: 0.85 }], xp: 170,
    flavor: 'Armor walking. Something small inside is steering.',
    note: 'North-poled: end your chipping on a + cell and your edge bites half again deeper.',
  }),
  S({
    id: 'voltmite', name: 'Voltmite Cloud', shellId: 'ferrite', tier: 4, hp: 180, power: 11,
    patterns: ['sweep', 'cross'], swarm: true, pole: -1, silhouette: 'swarm', minDepth: 8, maxDepth: 65, weight: 80,
    drops: [{ materialId: 'voltgland', chance: 0.6 }], xp: 175,
    flavor: 'Static with appetite.',
    note: 'A south-poled swarm. Guarding grounds you badly — move, and mind your last sign.',
  }),
  S({
    id: 'railshade', name: 'Railshade', shellId: 'ferrite', tier: 4, hp: 210, power: 15,
    patterns: ['cross'], mirror: true, phaseSkin: true, silhouette: 'flyer', minDepth: 12, maxDepth: 70, weight: 70,
    drops: [{ materialId: 'ironsinew', chance: 0.5 }], xp: 185,
    flavor: 'It rides the cold rails between here and somewhere worse.',
    note: 'Copies your lane and only takes iron on the odd beats. Count.',
  }),
  S({
    id: 'lodecrab', name: 'Lodecrab', shellId: 'ferrite', tier: 4, hp: 300, power: 13,
    patterns: ['single', 'charge'], shieldedFront: true, pole: 1, silhouette: 'sentinel', minDepth: 15, maxDepth: 75, weight: 75,
    drops: [{ materialId: 'scalebackplate', chance: 0.8 }, { materialId: 'magnetheart', chance: 0.2 }], xp: 190,
    flavor: 'Carries a lodestone boulder as a shell. Strong opinions about magnets.',
    note: 'A shield you cannot open from the front. Its pole is fixed — set yours before you knock.',
  }),
  S({
    id: 'fluxleech', name: 'Fluxleech', shellId: 'ferrite', tier: 4, hp: 190, power: 12,
    patterns: ['single', 'sweep'], thief: true, regenerator: true, silhouette: 'grub', minDepth: 20, maxDepth: 80, weight: 60,
    drops: [{ materialId: 'voltgland', chance: 0.7 }], xp: 195,
    flavor: 'Drinks charge. Yours, the rock\'s, anyone\'s.',
    note: 'Steals Ingot and knits its wounds with it. Broke enemies heal slower — starve it fast.',
  }),
  S({
    id: 'polarwisp', name: 'Polarwisp', shellId: 'ferrite', tier: 5, hp: 520, power: 20,
    patterns: ['cross', 'allbut'], poleFlips: true, silhouette: 'flyer', minDepth: 100, maxDepth: 150, weight: 80,
    drops: [{ materialId: 'voltgland', chance: 0.8 }, { materialId: 'magnetheart', chance: 0.25 }], xp: 260,
    flavor: 'A compass needle that got free and is making the most of it.',
    note: 'Flips pole every third beat. Ride your chain sign across the flip and it opens like a door.',
  }),
  S({
    id: 'sinewbrute', name: 'Sinewbrute', shellId: 'ferrite', tier: 5, hp: 650, power: 24,
    patterns: ['charge', 'sweep'], enrage: true, silhouette: 'sentinel', minDepth: 105, maxDepth: 160, weight: 70,
    drops: [{ materialId: 'ironsinew', chance: 0.9 }], xp: 270,
    flavor: 'Muscle with the bones on the outside.',
    note: 'Winds up like a landslide and finishes angrier than it starts. Bank your guard.',
  }),
  S({
    id: 'nullmoth', name: 'Nullmoth', shellId: 'ferrite', tier: 5, hp: 480, power: 22,
    patterns: ['allbut'], phaseSkin: true, pole: -1, silhouette: 'flyer', minDepth: 110, maxDepth: 165, weight: 60,
    drops: [{ materialId: 'nullquill', chance: 0.3 }, { materialId: 'voltgland', chance: 0.5 }], xp: 280,
    flavor: 'Its wings erase the letters off your charts.',
    note: 'Phases, webs the lanes, and hates the south sign. Bring the wrong pole and bring patience.',
  }),
  S({
    id: 'railtide', name: 'Railtide', shellId: 'ferrite', tier: 5, hp: 560, power: 19,
    patterns: ['sweep', 'allbut'], swarm: true, burrower: true, silhouette: 'swarm', minDepth: 115, maxDepth: 170, weight: 55,
    drops: [{ materialId: 'scalebackplate', chance: 1 }, { materialId: 'ironsinew', chance: 0.4 }], xp: 285,
    flavor: 'Filings in their millions, moving with intent.',
    note: 'A magnetized flood that re-forms wherever you are not looking. Keep moving.',
  }),
  S({
    id: 'gaussgrub', name: 'Gaussgrub', shellId: 'ferrite', tier: 5, hp: 700, power: 18,
    patterns: ['single', 'charge'], regenerator: true, pole: 1, silhouette: 'grub', minDepth: 120, maxDepth: 175, weight: 50,
    drops: [{ materialId: 'magnetheart', chance: 0.5 }], xp: 290,
    flavor: 'It eats Lodestone. The Array is, to it, a buffet.',
    note: 'Heals off the field\'s charge. Matching its pole starves the heal AND deepens your cut.',
  }),
  S({
    id: 'compasswight', name: 'Compasswight', shellId: 'ferrite', tier: 6, hp: 1500, power: 30,
    patterns: ['cross', 'charge'], mirror: true, poleFlips: true, silhouette: 'stalker', minDepth: 170, maxDepth: 250, weight: 70,
    drops: [{ materialId: 'magnetheart', chance: 0.7 }, { materialId: 'nullquill', chance: 0.3 }], xp: 420,
    flavor: 'It knows where you are. That is its whole nature.',
    note: 'Mirrors your lane and flips its pole. The answer is a rhythm, not a position.',
  }),
  S({
    id: 'hullbreaker', name: 'Hullbreaker', shellId: 'ferrite', tier: 6, hp: 1900, power: 36,
    patterns: ['charge', 'allbut'], shieldedFront: true, enrage: true, silhouette: 'sentinel', minDepth: 180, maxDepth: 250, weight: 60,
    drops: [{ materialId: 'scalebackplate', chance: 1 }, { materialId: 'ironsinew', chance: 0.8 }], xp: 440,
    flavor: 'Named by the first crew to meet one. Posthumously.',
    note: 'The front is a bulkhead; the end is a fury. Open with flanks, close with everything.',
  }),
  S({
    id: 'stormcoil', name: 'Stormcoil', shellId: 'ferrite', tier: 6, hp: 1400, power: 34,
    patterns: ['allbut', 'sweep'], pole: -1, swarm: true, silhouette: 'coil', minDepth: 185, maxDepth: 250, weight: 55,
    drops: [{ materialId: 'voltgland', chance: 1 }, { materialId: 'nullquill', chance: 0.35 }], xp: 450,
    flavor: 'A living solenoid. The hum arrives a full minute early.',
    note: 'Discharges through every lane it webs. South-signed edges cut it; guards do not.',
  }),
  S({
    id: 'ferrophage', name: 'Ferrophage', shellId: 'ferrite', tier: 6, hp: 1600, power: 32,
    patterns: ['single', 'cross'], thief: true, regenerator: true, phaseSkin: true, silhouette: 'grub', minDepth: 190, maxDepth: 250, weight: 45,
    drops: [{ materialId: 'ironsinew', chance: 0.9 }, { materialId: 'magnetheart', chance: 0.5 }], xp: 460,
    flavor: 'It eats tools. It would very much like yours.',
    note: 'Steals, heals, and phases. Strike on-beat with your pole set or feed it forever.',
  }),
  S({
    id: 'polarreaver', name: 'Polar Reaver', shellId: 'ferrite', tier: 6, hp: 1300, power: 38,
    patterns: ['cross', 'charge'], burrower: true, poleFlips: true, enrage: true, silhouette: 'stalker', minDepth: 200, maxDepth: 250, weight: 40,
    drops: [{ materialId: 'nullquill', chance: 0.5 }, { materialId: 'magnetheart', chance: 0.6 }], xp: 480,
    flavor: 'Reads the board better than you. Prove it wrong.',
    note: 'Everything at once: tunnels, flips, rages. The Loadstar\'s honor guard, unofficially.',
  }),

  // ========================= VERDANCE (15) =================================
  S({
    id: 'mulchmaw', name: 'Mulchmaw', shellId: 'verdance', tier: 7, hp: 2000, power: 34,
    patterns: ['single', 'sweep'], regenerator: true, silhouette: 'grub', minDepth: 5, maxDepth: 70, weight: 100,
    drops: [{ materialId: 'throatroot', chance: 0.8 }, { materialId: 'mawpith', chance: 0.2 }], xp: 620,
    flavor: 'Eats the dead leaves. Eats the live ones. Eats.',
    note: 'Knits shut on rot and patience. Hit it briskly; it heals politely but constantly.',
  }),
  S({
    id: 'sporefinch', name: 'Sporefinch Flock', shellId: 'verdance', tier: 7, hp: 1550, power: 28,
    patterns: ['sweep', 'cross'], swarm: true, feralAffinity: 1, silhouette: 'swarm', minDepth: 8, maxDepth: 80, weight: 85,
    drops: [{ materialId: 'mothspool', chance: 0.6 }], xp: 640,
    flavor: 'Birds, botanically speaking.',
    note: 'They nest in feral quadrants — the wilder your face, the thicker the flocks. Guarding is feathers; move.',
  }),
  S({
    id: 'tanglewisp', name: 'Tanglewisp', shellId: 'verdance', tier: 7, hp: 1800, power: 32,
    patterns: ['cross'], mirror: true, phaseSkin: true, silhouette: 'flyer', minDepth: 12, maxDepth: 90, weight: 70,
    drops: [{ materialId: 'mothspool', chance: 0.7 }], xp: 660,
    flavor: 'A knot in the air where a plant is thinking.',
    note: 'Follows your lane and is only solid on its own beat. Feint, count, cut.',
  }),
  S({
    id: 'rootboar', name: 'Rootboar', shellId: 'verdance', tier: 7, hp: 2500, power: 37,
    patterns: ['charge', 'single'], shieldedFront: true, silhouette: 'sentinel', minDepth: 15, maxDepth: 100, weight: 75,
    drops: [{ materialId: 'throatroot', chance: 0.9 }], xp: 680,
    flavor: 'A tuber with tusks and a commute.',
    note: 'The brow is bark over bark. Let the charge pass, then take the flanks.',
  }),
  S({
    id: 'sicklemantis', name: 'Sicklemantis', shellId: 'verdance', tier: 7, hp: 1900, power: 40,
    patterns: ['single', 'cross'], thief: true, silhouette: 'stalker', minDepth: 20, maxDepth: 110, weight: 65,
    drops: [{ materialId: 'wireweed', chance: 0.5 }], xp: 700,
    flavor: 'Harvests what you were about to.',
    note: 'Every landed cut skims your Spore. It is literally reaping your margin.',
  }),
  S({
    id: 'loomspider', name: 'Loomspider', shellId: 'verdance', tier: 8, hp: 3000, power: 42,
    patterns: ['allbut'], thief: true, regenerator: true, silhouette: 'coil', minDepth: 100, maxDepth: 170, weight: 80,
    drops: [{ materialId: 'wireweed', chance: 0.85 }, { materialId: 'palefiber', chance: 0.3 }], xp: 950,
    flavor: 'Its web has a warp and a weft and opinions about your Loom.',
    note: 'Webs every lane but one and mends itself with what it steals. Starve it fast through the gap.',
  }),
  S({
    id: 'bloomtyrant', name: 'Bloomtyrant', shellId: 'verdance', tier: 8, hp: 3600, power: 46,
    patterns: ['sweep', 'charge'], enrage: true, shieldedFront: true, feralAffinity: 1, silhouette: 'sentinel', minDepth: 105, maxDepth: 180, weight: 70,
    drops: [{ materialId: 'mawpith', chance: 0.6 }], xp: 1000,
    flavor: 'The biggest flower you will ever run from.',
    note: 'Petals like shields, temper like spring. It ends angrier than it began — bank your guard.',
  }),
  S({
    id: 'mirefiend', name: 'Mirefiend', shellId: 'verdance', tier: 8, hp: 3100, power: 40,
    patterns: ['allbut', 'single'], regenerator: true, swarm: true, silhouette: 'grub', minDepth: 110, maxDepth: 190, weight: 60,
    drops: [{ materialId: 'throatroot', chance: 0.8 }, { materialId: 'mawpith', chance: 0.4 }], xp: 1020,
    flavor: 'The bog, personally.',
    note: 'It is many small wet things pretending to be one large wet thing. Guards drown; keep moving.',
  }),
  S({
    id: 'wireworm', name: 'Wireworm', shellId: 'verdance', tier: 8, hp: 3200, power: 43,
    patterns: ['sweep', 'single'], phaseSkin: true, silhouette: 'coil', minDepth: 115, maxDepth: 200, weight: 65,
    drops: [{ materialId: 'wireweed', chance: 1 }], xp: 1050,
    flavor: 'Segmented cable with a destination.',
    note: 'The segments align every other beat — that is the only beat your edge matters.',
  }),
  S({
    id: 'palemoth', name: 'Palemoth', shellId: 'verdance', tier: 8, hp: 2800, power: 45,
    patterns: ['allbut', 'cross'], phaseSkin: true, mirror: true, silhouette: 'flyer', minDepth: 120, maxDepth: 210, weight: 55,
    drops: [{ materialId: 'palefiber', chance: 0.8 }, { materialId: 'mothspool', chance: 0.5 }], xp: 1080,
    flavor: 'You see it best by not quite looking.',
    note: 'Half-there, and where you are. The Loom pays double for what it is almost made of.',
  }),
  S({
    id: 'canopywight', name: 'Canopywight', shellId: 'verdance', tier: 9, hp: 5000, power: 55,
    patterns: ['cross', 'charge'], burrower: true, enrage: true, silhouette: 'stalker', minDepth: 200, maxDepth: 350, weight: 70,
    drops: [{ materialId: 'palefiber', chance: 0.7 }, { materialId: 'mawpith', chance: 0.5 }], xp: 1500,
    flavor: 'It was a climber. The canopy kept it.',
    note: 'Drops from above, tunnels through green, finishes furious. The flanks stay soft if you can find them.',
  }),
  S({
    id: 'vervainreaver', name: 'Vervain Reaver', shellId: 'verdance', tier: 9, hp: 4700, power: 60,
    patterns: ['charge', 'allbut'], enrage: true, thief: true, feralAffinity: 1.5, silhouette: 'stalker', minDepth: 210, maxDepth: 350, weight: 60,
    drops: [{ materialId: 'wireweed', chance: 0.9 }, { materialId: 'mawpith', chance: 0.6 }], xp: 1560,
    flavor: 'It prunes delvers.',
    note: 'The wilder your face, the bolder it gets. It robs you on the way in AND the way out.',
  }),
  S({
    id: 'plentygrub', name: 'Plentygrub', shellId: 'verdance', tier: 9, hp: 6200, power: 52,
    patterns: ['single', 'charge'], regenerator: true, shieldedFront: true, silhouette: 'grub', minDepth: 220, maxDepth: 350, weight: 55,
    drops: [{ materialId: 'throatroot', chance: 1 }, { materialId: 'mawpith', chance: 0.7 }], xp: 1620,
    flavor: "One of Old Plenty's, grown fat on the tithe.",
    note: 'Armored ahead, healing always. The warden feeds it; you must outpace the feeding.',
  }),
  S({
    id: 'chorusbloom', name: 'Chorusbloom', shellId: 'verdance', tier: 9, hp: 4400, power: 53,
    patterns: ['sweep', 'allbut'], swarm: true, mirror: true, silhouette: 'swarm', minDepth: 230, maxDepth: 350, weight: 50,
    drops: [{ materialId: 'mothspool', chance: 1 }, { materialId: 'palefiber', chance: 0.5 }], xp: 1650,
    flavor: 'Flowers that sing in your voice.',
    note: 'It moves where you move and cannot be guarded, only outsung. Keep the feet honest.',
  }),
  S({
    id: 'thornshade', name: 'Thornshade', shellId: 'verdance', tier: 9, hp: 4100, power: 62,
    patterns: ['cross', 'allbut'], mirror: true, enrage: true, silhouette: 'flyer', minDepth: 250, maxDepth: 350, weight: 45,
    drops: [{ materialId: 'palefiber', chance: 0.9 }, { materialId: 'mawpith', chance: 0.7 }], xp: 1700,
    flavor: 'The shadow a thorn casts at midnight, weaponized.',
    note: "Old Plenty's honor guard. Fast, furious, and exactly where you are. Rhythm, not position.",
  }),

  // ========================= GLASSMERE (15) ================================
  S({
    id: 'glasswight', name: 'Glasswight', shellId: 'glassmere', tier: 10, hp: 6500, power: 78,
    patterns: ['single', 'cross'], veiled: true, silhouette: 'stalker', minDepth: 5, maxDepth: 90, weight: 100,
    drops: [{ materialId: 'glasschitin', chance: 0.8 }], xp: 2100,
    flavor: 'You see through it. That is the problem.',
    note: 'Its wind-up is invisible to the naked eye. Bring a light that reads intentions.',
  }),
  S({
    id: 'chimeworm', name: 'Chimeworm', shellId: 'glassmere', tier: 10, hp: 7200, power: 74,
    patterns: ['sweep', 'single'], phaseSkin: true, silhouette: 'coil', minDepth: 10, maxDepth: 100, weight: 80,
    drops: [{ materialId: 'coldsinew', chance: 0.6 }], xp: 2150,
    flavor: 'A tube of struck notes. It rings before it strikes — count them.',
    note: 'Solid on the note, hollow between. The chime IS the rhythm.',
  }),
  S({
    id: 'splinterhost', name: 'Splinterhost', shellId: 'glassmere', tier: 10, hp: 5800, power: 66,
    patterns: ['sweep', 'cross'], swarm: true, silhouette: 'swarm', minDepth: 15, maxDepth: 110, weight: 85,
    drops: [{ materialId: 'glasschitin', chance: 0.7 }], xp: 2200,
    flavor: 'A window that lost an argument, holding a grudge collectively.',
    note: 'A thousand edges. Guarding is a handshake with broken glass; move.',
  }),
  S({
    id: 'mirrorcrab', name: 'Mirrorcrab', shellId: 'glassmere', tier: 10, hp: 8500, power: 72,
    patterns: ['single', 'charge'], shieldedFront: true, silhouette: 'sentinel', minDepth: 20, maxDepth: 120, weight: 75,
    drops: [{ materialId: 'glasschitin', chance: 0.9 }, { materialId: 'lenswing', chance: 0.2 }], xp: 2250,
    flavor: 'Its shell shows you your own swing, slightly improved.',
    note: 'The front reflects everything, including effort. The flanks are honest.',
  }),
  S({
    id: 'lightlouse', name: 'Lightlouse', shellId: 'glassmere', tier: 10, hp: 6000, power: 68,
    patterns: ['single', 'sweep'], thief: true, silhouette: 'grub', minDepth: 25, maxDepth: 130, weight: 60,
    drops: [{ materialId: 'coldsinew', chance: 0.7 }], xp: 2300,
    flavor: 'It drinks Prism. Your Prism.',
    note: 'Every landed hit dims your purse. Squash it before it fills.',
  }),
  S({
    id: 'rimeshade', name: 'Rimeshade', shellId: 'glassmere', tier: 11, hp: 9500, power: 104,
    patterns: ['cross', 'allbut'], veiled: true, mirror: true, silhouette: 'flyer', minDepth: 110, maxDepth: 200, weight: 80,
    drops: [{ materialId: 'coldsinew', chance: 0.8 }, { materialId: 'lenswing', chance: 0.3 }], xp: 2900,
    flavor: 'The cold spot in the room, ambulatory.',
    note: 'Invisible intentions AND it stands where you stand. Sight first, rhythm second.',
  }),
  S({
    id: 'prismmantis', name: 'Prismmantis', shellId: 'glassmere', tier: 11, hp: 9000, power: 112,
    patterns: ['single', 'cross'], thief: true, silhouette: 'stalker', minDepth: 120, maxDepth: 210, weight: 70,
    drops: [{ materialId: 'lenswing', chance: 0.7 }], xp: 2950,
    flavor: 'Arms like decisions.',
    note: 'Fast, precise, and it taxes every mistake in Prism. Do not be taxed.',
  }),
  S({
    id: 'frostchoir', name: 'Frostchoir', shellId: 'glassmere', tier: 11, hp: 8800, power: 98,
    patterns: ['sweep', 'allbut'], swarm: true, mirror: true, silhouette: 'swarm', minDepth: 130, maxDepth: 220, weight: 65,
    drops: [{ materialId: 'coldsinew', chance: 1 }], xp: 3000,
    flavor: 'They sing in your key.',
    note: 'It follows and it floods. Only footwork answers a choir.',
  }),
  S({
    id: 'lenskeeper', name: 'Lenskeeper', shellId: 'glassmere', tier: 11, hp: 11500, power: 95,
    patterns: ['charge', 'single'], shieldedFront: true, regenerator: true, silhouette: 'sentinel', minDepth: 140, maxDepth: 230, weight: 60,
    drops: [{ materialId: 'lenswing', chance: 0.6 }, { materialId: 'prismheart', chance: 0.2 }], xp: 3100,
    flavor: 'It polishes something behind its back. It will not show you.',
    note: 'Armored ahead, mending always. Flank fast or fund its hobby.',
  }),
  S({
    id: 'coldwright', name: 'Coldwright', shellId: 'glassmere', tier: 11, hp: 10500, power: 100,
    patterns: ['allbut', 'single'], regenerator: true, silhouette: 'grub', minDepth: 150, maxDepth: 240, weight: 55,
    drops: [{ materialId: 'coldsinew', chance: 0.9 }, { materialId: 'prismheart', chance: 0.25 }], xp: 3150,
    flavor: 'It builds frost the way masons build walls: on purpose.',
    note: 'Webs the lanes in ice and repairs itself with the leftovers.',
  }),
  S({
    id: 'prismreaver', name: 'Prismreaver', shellId: 'glassmere', tier: 12, hp: 14500, power: 150,
    patterns: ['charge', 'cross'], enrage: true, veiled: true, silhouette: 'stalker', minDepth: 240, maxDepth: 380, weight: 70,
    drops: [{ materialId: 'prismheart', chance: 0.6 }, { materialId: 'lenswing', chance: 0.5 }], xp: 4200,
    flavor: 'It hunts by your light. Your lantern is its dinner bell.',
    note: 'Unseen wind-ups that get ANGRIER. Reveal gear is not optional down here.',
  }),
  S({
    id: 'shardtyrant', name: 'Shardtyrant', shellId: 'glassmere', tier: 12, hp: 17000, power: 160,
    patterns: ['charge', 'sweep'], shieldedFront: true, enrage: true, silhouette: 'sentinel', minDepth: 250, maxDepth: 380, weight: 60,
    drops: [{ materialId: 'glasschitin', chance: 1 }, { materialId: 'prismheart', chance: 0.4 }], xp: 4400,
    flavor: 'A cathedral window that learned siegecraft.',
    note: 'The front is a rose window; the sides are just glass. Break the glass.',
  }),
  S({
    id: 'stillwatcher', name: 'Stillwatcher', shellId: 'glassmere', tier: 12, hp: 13000, power: 155,
    patterns: ['cross', 'allbut'], veiled: true, phaseSkin: true, silhouette: 'flyer', minDepth: 260, maxDepth: 380, weight: 55,
    drops: [{ materialId: 'lenswing', chance: 0.9 }], xp: 4500,
    flavor: 'It does not move. It is suddenly elsewhere, not moving.',
    note: 'Invisible intent on a rhythm-skin. The full curriculum in one creature.',
  }),
  S({
    id: 'meridianworm', name: 'Meridianworm', shellId: 'glassmere', tier: 12, hp: 15500, power: 145,
    patterns: ['sweep', 'single'], phaseSkin: true, silhouette: 'coil', minDepth: 270, maxDepth: 380, weight: 50,
    drops: [{ materialId: 'coldsinew', chance: 1 }, { materialId: 'prismheart', chance: 0.5 }], xp: 4600,
    flavor: 'It swims through the glass the way meaning swims through a sentence.',
    note: 'Aligned on the beat, elsewhere between. Strike where it WILL be.',
  }),
  S({
    id: 'nullgazer', name: 'Nullgazer', shellId: 'glassmere', tier: 12, hp: 12500, power: 165,
    patterns: ['single', 'allbut'], veiled: true, regenerator: true, silhouette: 'grub', minDepth: 280, maxDepth: 380, weight: 45,
    drops: [{ materialId: 'prismheart', chance: 0.7 }], xp: 4700,
    flavor: 'It looks at nothing so hard the nothing looks back.',
    note: "The Unblinking's understudy. Unseen, unhurried, and healing the whole time.",
  }),

  // ========================= CINDER (15) ===================================
  // Tier 13 — the shallows: everything is a little on fire, including you.
  S({
    id: 'slagworm', name: 'Slagworm', shellId: 'cinder', tier: 13, hp: 21000, power: 215,
    patterns: ['single', 'sweep'], silhouette: 'coil', minDepth: 5, maxDepth: 100, weight: 100,
    drops: [{ materialId: 'charsinew', chance: 0.8 }], xp: 6200,
    flavor: 'It swims in cooling slag and resents the word "cooling".',
    note: 'The honest worm of the burnt shell. Sidestep, strike, repeat.',
  }),
  S({
    id: 'embermite', name: 'Embermite', shellId: 'cinder', tier: 13, hp: 16500, power: 200,
    patterns: ['single'], swarm: true, stokes: 2, silhouette: 'swarm', minDepth: 10, maxDepth: 110, weight: 90,
    drops: [{ materialId: 'emberplate', chance: 0.9 }], xp: 6000,
    flavor: 'A spark with legs and a grudge.',
    note: 'Every bite it lands stokes the shaft. Kill it before it heats the room.',
  }),
  S({
    id: 'ashchoir', name: 'Ashchoir', shellId: 'cinder', tier: 13, hp: 19500, power: 210,
    patterns: ['sweep', 'allbut'], swarm: true, silhouette: 'swarm', minDepth: 20, maxDepth: 130, weight: 80,
    drops: [{ materialId: 'charsinew', chance: 1 }], xp: 6300,
    flavor: 'They sing what burned. It is a long song.',
    note: 'Floods the lanes like its cold cousin. Footwork answers choirs; it always has.',
  }),
  S({
    id: 'ventgnaw', name: 'Ventgnaw', shellId: 'cinder', tier: 13, hp: 23000, power: 205,
    patterns: ['cross', 'single'], stokes: 3, silhouette: 'grub', minDepth: 30, maxDepth: 140, weight: 75,
    drops: [{ materialId: 'magmaduct', chance: 0.6 }], xp: 6500,
    flavor: 'It chews on the pipework, and the pipework is what keeps you alive.',
    note: 'Its landed hits CHOKE the vents a little. Guard less, dodge more, end it fast.',
  }),
  S({
    id: 'coalhound', name: 'Coalhound', shellId: 'cinder', tier: 13, hp: 20000, power: 225,
    patterns: ['charge'], ventsOnKill: 8, silhouette: 'stalker', minDepth: 40, maxDepth: 150, weight: 70,
    drops: [{ materialId: 'emberplate', chance: 0.7 }, { materialId: 'magmaduct', chance: 0.3 }], xp: 6600,
    flavor: 'It fetches heat. Nobody threw it.',
    note: 'Carries a bellyful of the shaft\'s own fire — putting it down vents the room.',
  }),
  // Tier 14 — the deeps: the rock is an opinion the fire disagrees with.
  S({
    id: 'pyreclaw', name: 'Pyreclaw', shellId: 'cinder', tier: 14, hp: 31000, power: 310,
    patterns: ['cross', 'charge'], enrage: true, silhouette: 'stalker', minDepth: 150, maxDepth: 260, weight: 70,
    drops: [{ materialId: 'pyregland', chance: 0.5 }, { materialId: 'charsinew', chance: 0.6 }], xp: 8800,
    flavor: 'Its claws cauterize. Efficient. Horrible, but efficient.',
    note: 'Angrier as it bleeds, like everything else down here. Finish arguments you start.',
  }),
  S({
    id: 'obsidianshell', name: 'Obsidianshell', shellId: 'cinder', tier: 14, hp: 38000, power: 290,
    patterns: ['charge', 'single'], shieldedFront: true, ventsOnKill: 10, silhouette: 'sentinel', minDepth: 160, maxDepth: 270, weight: 65,
    drops: [{ materialId: 'emberplate', chance: 1 }, { materialId: 'pyregland', chance: 0.3 }], xp: 9000,
    flavor: 'Glass armor over a furnace core. The glassmaker is the furnace.',
    note: 'The front is volcanic glass; the core wants OUT. Crack the sides and stand back — it vents.',
  }),
  S({
    id: 'cindershade', name: 'Cindershade', shellId: 'cinder', tier: 14, hp: 29000, power: 320,
    patterns: ['allbut', 'cross'], phaseSkin: true, stokes: 2, silhouette: 'flyer', minDepth: 170, maxDepth: 280, weight: 60,
    drops: [{ materialId: 'magmaduct', chance: 0.8 }], xp: 9200,
    flavor: 'The smoke of something that is still burning somewhere else.',
    note: 'On the beat it is ash; between beats it is fire. Strike the rhythm, not the shape.',
  }),
  S({
    id: 'magmalurk', name: 'Magmalurk', shellId: 'cinder', tier: 14, hp: 34000, power: 300,
    patterns: ['single', 'sweep'], hotOnly: 50, regenerator: true, silhouette: 'coil', minDepth: 180, maxDepth: 290, weight: 55,
    drops: [{ materialId: 'pyregland', chance: 0.7 }], xp: 9500,
    flavor: 'It only surfaces when the shaft runs hot. You invited it.',
    note: 'A creature of YOUR ambition — it exists above fifty heat. The safe line never meets one.',
  }),
  S({
    id: 'bellowsbeast', name: 'Bellowsbeast', shellId: 'cinder', tier: 14, hp: 36000, power: 295,
    patterns: ['sweep', 'charge'], stokes: 4, silhouette: 'sentinel', minDepth: 190, maxDepth: 300, weight: 50,
    drops: [{ materialId: 'charsinew', chance: 1 }, { materialId: 'pyregland', chance: 0.4 }], xp: 9600,
    flavor: 'Every breath it takes, the shaft takes with it.',
    note: 'It BREATHES heat into the room while you dance with it. The long fight is the hot fight.',
  }),
  // Tier 15 — the floor's approach: the fire has opinions about visitors.
  S({
    id: 'pyrewight', name: 'Pyrewight', shellId: 'cinder', tier: 15, hp: 46000, power: 430,
    patterns: ['cross', 'allbut'], veiled: true, silhouette: 'stalker', minDepth: 300, maxDepth: 470, weight: 65,
    drops: [{ materialId: 'pyregland', chance: 0.8 }], xp: 12500,
    flavor: 'Heat-shimmer with intent. You have been squinting at it your whole descent.',
    note: 'The veil returns, written in shimmer. Reveal gear reads through fire too.',
  }),
  S({
    id: 'slagtyrant', name: 'Slagtyrant', shellId: 'cinder', tier: 15, hp: 54000, power: 450,
    patterns: ['charge', 'sweep'], shieldedFront: true, enrage: true, silhouette: 'sentinel', minDepth: 310, maxDepth: 470, weight: 60,
    drops: [{ materialId: 'emberplate', chance: 1 }, { materialId: 'smolderheart', chance: 0.05 }], xp: 13000,
    flavor: 'It was a king of something, before the fire. It kept the posture.',
    note: 'Armored, furious, and escalating. The textbook ends here; so does the ladder.',
  }),
  S({
    id: 'moltenchoir', name: 'Molten Choir', shellId: 'cinder', tier: 15, hp: 48000, power: 460,
    patterns: ['allbut', 'sweep'], swarm: true, hotOnly: 65, ventsOnKill: 15, silhouette: 'swarm', minDepth: 320, maxDepth: 470, weight: 50,
    drops: [{ materialId: 'magmaduct', chance: 1 }, { materialId: 'pyregland', chance: 0.5 }], xp: 13500,
    flavor: 'The Ashchoir\'s finale. Everything that ever burned, in unison, briefly.',
    note: 'Only above sixty-five heat — the greedy line\'s own predator. Felling it vents the whole verse.',
  }),
  S({
    id: 'emberking', name: 'Emberking', shellId: 'cinder', tier: 15, hp: 50000, power: 440,
    patterns: ['single', 'charge'], regenerator: true, stokes: 5, silhouette: 'grub', minDepth: 330, maxDepth: 470, weight: 45,
    drops: [{ materialId: 'pyregland', chance: 0.9 }, { materialId: 'smolderheart', chance: 0.08 }], xp: 14000,
    flavor: 'Every fire answers to an older fire. This one stopped answering.',
    note: 'Mends itself and stokes the room. The clock is against you twice; strike like it.',
  }),
  S({
    id: 'stillfurnace', name: 'The Still Furnace', shellId: 'cinder', tier: 15, hp: 52000, power: 425,
    patterns: ['cross', 'charge'], phaseSkin: true, veiled: true, silhouette: 'flyer', minDepth: 340, maxDepth: 470, weight: 40,
    drops: [{ materialId: 'pyregland', chance: 1 }, { materialId: 'smolderheart', chance: 0.1 }], xp: 14500,
    flavor: 'A furnace with the door shut. The door is a courtesy.',
    note: 'Veiled AND rhythm-skinned — the whole deep curriculum, lit from inside.',
  }),

  // ========================= HOLLOW (15) ===================================
  // Faceless by construction: the lane engine never needed rock. Tier 16 —
  // there is no tool past XV by ruling; these are fought with heirloom-age
  // kit and the whole curriculum: sight, rhythm, patience, restraint.
  S({
    id: 'nullwisp', name: 'Nullwisp', shellId: 'hollow', tier: 16, hp: 58000, power: 520,
    patterns: ['single'], silhouette: 'flyer', minDepth: 5, maxDepth: 140, weight: 100,
    drops: [{ materialId: 'quietsinew', chance: 0.8 }], xp: 17000,
    flavor: 'A draft with intent. The lamp does not flicker; you do.',
    note: 'The void\'s honest grub. It telegraphs politely; even nothing keeps the old manners.',
  }),
  S({
    id: 'hushmoth', name: 'Hushmoth', shellId: 'hollow', tier: 16, hp: 52000, power: 540,
    patterns: ['sweep'], swarm: true, silhouette: 'swarm', minDepth: 10, maxDepth: 160, weight: 90,
    drops: [{ materialId: 'quietsinew', chance: 1 }], xp: 17500,
    flavor: 'They eat sound. A crew that stops hearing its own drills is about to meet them.',
    note: 'A flood of quiet. Footwork answers; it answered the choirs and it answers this.',
  }),
  S({
    id: 'absentling', name: 'Absentling', shellId: 'hollow', tier: 16, hp: 63000, power: 530,
    patterns: ['cross', 'single'], phaseSkin: true, silhouette: 'grub', minDepth: 30, maxDepth: 200, weight: 80,
    drops: [{ materialId: 'hollowplate', chance: 0.6 }], xp: 18000,
    flavor: 'It is not there on the beat and very much there between.',
    note: 'The rhythm-skin, unlearned: strike where it ISN\'T going to be.',
  }),
  S({
    id: 'echoshade', name: 'Echoshade', shellId: 'hollow', tier: 16, hp: 60000, power: 560,
    patterns: ['allbut', 'cross'], mirror: true, silhouette: 'stalker', minDepth: 60, maxDepth: 240, weight: 75,
    drops: [{ materialId: 'quietsinew', chance: 0.7 }], xp: 18500,
    flavor: 'Your own last move, returned with interest.',
    note: 'It mirrors your rhythm. Break your own habit and it stumbles over the echo.',
  }),
  S({
    id: 'stillwarden', name: 'Stillwarden', shellId: 'hollow', tier: 16, hp: 72000, power: 545,
    patterns: ['charge', 'single'], shieldedFront: true, silhouette: 'sentinel', minDepth: 90, maxDepth: 280, weight: 70,
    drops: [{ materialId: 'hollowplate', chance: 1 }], xp: 19000,
    flavor: 'A sentry for a door that has not been built yet.',
    note: 'Armored ahead, patient always. Flank it — the sides are absent, literally.',
  }),
  S({
    id: 'voidlouse', name: 'Voidlouse', shellId: 'hollow', tier: 16, hp: 50000, power: 570,
    patterns: ['single', 'sweep'], swarm: true, thief: true, silhouette: 'swarm', minDepth: 120, maxDepth: 320, weight: 65,
    drops: [{ materialId: 'quietsinew', chance: 0.9 }], xp: 19500,
    flavor: 'It steals. Nobody knows where it puts anything.',
    note: 'The toll-taker of the nothing. End it fast or fund its museum.',
  }),
  S({
    id: 'unravel', name: 'Unravel', shellId: 'hollow', tier: 16, hp: 66000, power: 580,
    patterns: ['sweep', 'allbut'], regenerator: true, silhouette: 'coil', minDepth: 150, maxDepth: 350, weight: 60,
    drops: [{ materialId: 'quietsinew', chance: 0.8 }, { materialId: 'hollowplate', chance: 0.3 }], xp: 20000,
    flavor: 'A thread pulled from the world\'s hem, still pulling.',
    note: 'It knits itself back with what it frays off you. Sustained pressure, no pauses.',
  }),
  S({
    id: 'quietsire', name: 'Quietsire', shellId: 'hollow', tier: 16, hp: 78000, power: 555,
    patterns: ['charge', 'cross'], veiled: true, silhouette: 'sentinel', minDepth: 180, maxDepth: 380, weight: 55,
    drops: [{ materialId: 'unheart', chance: 0.08 }, { materialId: 'hollowplate', chance: 0.7 }], xp: 21000,
    flavor: 'The father of every silence you have ever been glad of.',
    note: 'Veiled in absence. The Monocle still reads it — some habits deserve keeping.',
  }),
  S({
    id: 'nulltide', name: 'Nulltide', shellId: 'hollow', tier: 16, hp: 70000, power: 590,
    patterns: ['sweep', 'charge'], swarm: true, silhouette: 'swarm', minDepth: 220, maxDepth: 420, weight: 50,
    drops: [{ materialId: 'quietsinew', chance: 1 }, { materialId: 'quietsinew', chance: 0.5 }], xp: 21500,
    flavor: 'The tide that comes in when everything else has gone out.',
    note: 'It floods every lane but one, then floods that one. Count the gaps; they count you.',
  }),
  S({
    id: 'umbrawright', name: 'Umbrawright', shellId: 'hollow', tier: 16, hp: 74000, power: 600,
    patterns: ['cross', 'allbut'], phaseSkin: true, regenerator: true, silhouette: 'grub', minDepth: 260, maxDepth: 460, weight: 48,
    drops: [{ materialId: 'hollowplate', chance: 0.8 }], xp: 22000,
    flavor: 'It builds shadows for things that do not exist yet. Spec work.',
    note: 'Rhythm-skinned and self-mending: the mid-curriculum, recited in the dark.',
  }),
  S({
    id: 'lacunae', name: 'Lacunae', shellId: 'hollow', tier: 17, hp: 88000, power: 620,
    patterns: ['allbut', 'single'], veiled: true, phaseSkin: true, silhouette: 'flyer', minDepth: 320, maxDepth: 520, weight: 45,
    drops: [{ materialId: 'hollowplate', chance: 0.6 }], xp: 24000,
    flavor: 'The gaps in the text, come looking for the reader.',
    note: 'Unseen AND off-beat. The whole Glassmere-and-Verdance syllabus in one absence.',
  }),
  S({
    id: 'hollowking', name: 'Hollowking', shellId: 'hollow', tier: 17, hp: 96000, power: 610,
    patterns: ['charge', 'sweep'], shieldedFront: true, enrage: true, silhouette: 'sentinel', minDepth: 360, maxDepth: 540, weight: 40,
    drops: [{ materialId: 'hollowplate', chance: 1 }, { materialId: 'unheart', chance: 0.1 }], xp: 25000,
    flavor: 'A king of nothing, and nothing is a large kingdom.',
    note: 'Armored, escalating, furious at being interrupted mid-reign.',
  }),
  S({
    id: 'stillbirth', name: 'The Stillborn Choir', shellId: 'hollow', tier: 17, hp: 84000, power: 640,
    patterns: ['sweep', 'allbut'], swarm: true, mirror: true, silhouette: 'swarm', minDepth: 400, maxDepth: 560, weight: 35,
    drops: [{ materialId: 'quietsinew', chance: 1 }, { materialId: 'hollowplate', chance: 0.4 }], xp: 26000,
    flavor: 'Every choir the deep never got to finish, singing anyway.',
    note: 'It follows and it floods and it never was. The last choir. Dance it out.',
  }),
  S({
    id: 'voidmaw', name: 'Voidmaw', shellId: 'hollow', tier: 17, hp: 100000, power: 630,
    patterns: ['charge'], silhouette: 'coil', minDepth: 440, maxDepth: 560, weight: 30,
    drops: [{ materialId: 'unheart', chance: 0.15 }, { materialId: 'hollowplate', chance: 0.6 }], xp: 27000,
    flavor: 'A mouth with no animal behind it. The appetite is freelance.',
    note: 'Two-turn windups the size of the world. WALK. You have always known how to walk.',
  }),
  S({
    id: 'thewaiting', name: 'The Waiting', shellId: 'hollow', tier: 17, hp: 92000, power: 650,
    patterns: ['cross', 'charge'], veiled: true, regenerator: true, silhouette: 'stalker', minDepth: 480, maxDepth: 560, weight: 28,
    drops: [{ materialId: 'unheart', chance: 0.2 }, { materialId: 'unheart', chance: 0.5 }], xp: 28000,
    flavor: 'It has been down here longer than the down has.',
    note: 'The last ordinary fight before the floor. Nothing about it is ordinary.',
  }),

  // ========================= FLOOR WARDENS =================================
  S({
    id: 'tapmother', name: 'The Tapmother', shellId: 'loam', tier: 3, hp: 260, power: 8,
    patterns: ['sweep', 'allbut', 'charge'], regenerator: true, shieldedFront: true,
    silhouette: 'coil', minDepth: 150, maxDepth: 150, weight: 0, isWarden: true,
    drops: [{ materialId: 'taproot', chance: 1 }, { materialId: 'marrowglass', chance: 1 }], xp: 900,
    flavor: 'Root of the floor. Every taproot in the Loam runs to her, eventually. So do you.',
    note: 'She guards in long cycles and punishes greed — strikes into her guard feed her. Patience opens her; the floor opens after.',
  }),
  S({
    id: 'oldplenty', name: 'Old Plenty', shellId: 'verdance', tier: 9, hp: 3800, power: 28,
    patterns: ['sweep', 'allbut', 'charge'], abundance: true, regenerator: true,
    silhouette: 'coil', minDepth: 290, maxDepth: 290, weight: 0, isWarden: true,
    drops: [{ materialId: 'plentyheart', chance: 1 }, { materialId: 'mawpith', chance: 1 }], xp: 3200,
    flavor: 'Warden of the green floor. It does not guard the way down; it OFFERS things instead, and watches what you do.',
    note: 'The lanes fill with fruit. Strike while standing in plenty and you feed it; wait, and the plenty rots off it. Patience under abundance — the whole shell in one fight.',
  }),
  S({
    id: 'cinderwarden', name: 'The Smolder', shellId: 'cinder', tier: 15, hp: 48000, power: 150,
    patterns: ['sweep', 'allbut', 'charge'], wrathful: true, regenerator: true,
    silhouette: 'sentinel', minDepth: 470, maxDepth: 470, weight: 0, isWarden: true,
    drops: [{ materialId: 'smolderheart', chance: 1 }, { materialId: 'pyregland', chance: 1 }], xp: 26000,
    flavor: 'Warden of the burnt floor. She has been banking this fire since the shell cooled, and she can wait longer than you can want.',
    note: 'Her strength is YOUR heat — she burns exactly as hot as your greed. Vent to the safe line before the stair down, fight her cool, and she is only embers. The restraint the whole shell taught, examined once.',
  }),
  S({
    id: 'hollowwarden', name: 'The Unattended', shellId: 'hollow', tier: 17, hp: 120000, power: 480,
    patterns: ['sweep', 'allbut', 'charge'], presence: true, regenerator: true,
    silhouette: 'sentinel', minDepth: 560, maxDepth: 560, weight: 0, isWarden: true,
    drops: [{ materialId: 'unheart', chance: 1 }, { materialId: 'unheart', chance: 1 }], xp: 60000,
    flavor: 'Warden of the unwritten floor. It exists exactly while you are not looking at it, and it has been unlooked-at for a very long time.',
    note: 'PRESENCE is its thesis, and it inverts the whole curriculum: reveal gear FEEDS it — it grows solid under observation. Put the Monocle away. Fight it the way you fought your first marlgrub: half-blind, honest, and paying attention with something other than eyes.',
  }),
  S({
    id: 'alephwarden', name: 'The Author', shellId: 'aleph', tier: 18, hp: 88000, power: 440,
    patterns: ['single', 'sweep', 'cross', 'allbut', 'charge'],
    veiled: true, phaseSkin: true, mirror: true, regenerator: true, shieldedFront: true, enrage: true,
    silhouette: 'sentinel', minDepth: 40, maxDepth: 40, weight: 0, isWarden: true,
    drops: [{ materialId: 'authorsInk', chance: 1 }, { materialId: 'authorsInk', chance: 1 }], xp: 120000,
    flavor: 'The final Warden, at a desk, at the bottom of everything. It is not guarding the Core. It is FINISHING it, and you are interrupting.',
    note: 'Every thesis at once: sight, rhythm, loyalty, patience, restraint, and the fury of the interrupted. The whole game is the strategy guide. When it yields, it does not die — it stands, and offers you the chair.',
  }),
  S({
    id: 'glasswarden', name: 'The Unblinking', shellId: 'glassmere', tier: 12, hp: 9500, power: 82,
    patterns: ['cross', 'allbut', 'charge'], veiled: true, mirror: true,
    silhouette: 'sentinel', minDepth: 380, maxDepth: 380, weight: 0, isWarden: true,
    drops: [{ materialId: 'unblinkingTear', chance: 1 }, { materialId: 'prismheart', chance: 1 }], xp: 9000,
    flavor: 'Warden of the frozen light. It has watched the floor since before there were eyes, and it has never once needed to guess.',
    note: 'It stands where you stand and winds up where you cannot see. SIGHT is the whole fight: bring a light that reads intentions, and look before every single act.',
  }),
  S({
    id: 'loadstar', name: 'The Loadstar', shellId: 'ferrite', tier: 6, hp: 1800, power: 22,
    patterns: ['cross', 'allbut', 'charge'], poleFlips: true,
    silhouette: 'sentinel', minDepth: 250, maxDepth: 250, weight: 0, isWarden: true,
    drops: [{ materialId: 'loadstarcore', chance: 1 }, { materialId: 'nullquill', chance: 1 }], xp: 1600,
    flavor: 'Warden of nine poles. The reason every compass down here lies: they are all pointing at it.',
    note: 'The lanes themselves polarize under it and its vulnerable pole walks. Route across the board like a chain — the fight IS the routing problem.',
  }),
];

const byId = new Map(SPECIES.map((s) => [s.id, s]));

export function speciesDef(id: string): SpeciesDef {
  const def = byId.get(id);
  if (!def) throw new Error(`Unknown species: ${id}`);
  return def;
}

export function speciesOfShell(shellId: string): SpeciesDef[] {
  return SPECIES.filter((s) => s.shellId === shellId && !s.isWarden);
}

export function wardenOf(shellId: string): SpeciesDef | undefined {
  return SPECIES.find((s) => s.shellId === shellId && s.isWarden);
}

/**
 * Tier affinity (Phase 6 Step Zero): what rises answers what you carry.
 * Species keep their depth windows, but the roll biases toward the player's
 * tool tier so ~60-70% of spawns are engageable at current gear — over-tier
 * stays an occasional real threat instead of the default, and under-tier
 * fades without vanishing.
 */
export function tierAffinity(speciesTier: number, playerTier: number): number {
  const diff = speciesTier - playerTier;
  if (diff >= 2) return 0.04;
  if (diff === 1) return 0.26;
  if (diff === 0) return 1;
  if (diff === -1) return 0.85;
  return 0.4; // trivially under-tier — quick wins, rarely offered
}

/**
 * Soft window tails (Step Zero, part two): a species' minDepth is HARD (no
 * deep horrors in the shallows), but past maxDepth it lingers at decaying
 * weight — the shallows' creatures follow the warm shafts down. Without this
 * the deep pools go homogeneous-top-tier and no affinity can fix the mix.
 */
function windowFactor(s: SpeciesDef, depth: number): number {
  if (depth < s.minDepth) return 0;
  if (depth <= s.maxDepth) return 1;
  const f = Math.exp(-(depth - s.maxDepth) / 40);
  return f < 0.02 ? 0 : f;
}

/** Weighted pick for an encounter at a depth; null if nothing haunts it. */
export function rollSpecies(
  shellId: string,
  depth: number,
  rng: () => number = Math.random,
  playerTier?: number,
  feralCells = 0,
  heat = 0,
): SpeciesDef | null {
  const pool = speciesOfShell(shellId);
  const w = (s: SpeciesDef) =>
    s.weight *
    windowFactor(s, depth) *
    (playerTier === undefined ? 1 : tierAffinity(s.tier, playerTier)) *
    (1 + (s.feralAffinity ?? 0) * Math.min(1, feralCells / 12)) *
    // Cinder opt-in danger: hot-only species do not exist below their heat.
    (s.hotOnly !== undefined && heat < s.hotOnly ? 0 : 1);
  const total = pool.reduce((a, s) => a + w(s), 0);
  if (total <= 0) return null;
  let pick = rng() * total;
  for (const s of pool) {
    pick -= w(s);
    if (pick <= 0) return s;
  }
  return pool[pool.length - 1] ?? null;
}
