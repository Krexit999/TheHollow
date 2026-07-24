/**
 * THE LAMPHOUSE — the Guild's thirty. People, not vending machines: every
 * job touches a system the player already runs, and the three the doc names
 * (Marrow, Vess, Old Quill) anchor the rest.
 *
 * Schedules and moods are TEXTURE. They move people around the hall and
 * recolor what they say — they never gate a service, a price band, or
 * anything unique (the anti-patterns are constitutional). When a keeper is
 * "in the back", someone minds the stall.
 *
 * Portraits are procedural-geometric params, same language as the ore icons
 * and combat silhouettes — no sprites.
 */

export type ArrivalGate = 'open' | 'stalls' | 'crews' | 'ferrite';

export type StallKind = 'ore' | 'combat' | 'gems' | 'gear' | 'provisions' | 'geodes' | 'ferrite' | 'exports';

export interface PortraitDef {
  /** Base hue 0-360 for the garb. */
  hue: number;
  hat: 'hood' | 'cap' | 'bald' | 'braids' | 'helm' | 'scarf' | 'wild' | 'crown';
  eyes: 'dot' | 'slit' | 'wide' | 'spect' | 'patch';
  extra?: 'beard' | 'mask' | 'earring' | 'scar' | 'moth' | 'chain';
}

export interface NpcDef {
  id: string;
  name: string;
  role: string;
  /** One-line idle dialogue (mood recolors delivery, not content). */
  line: string;
  /** A sour-mood variant, because people have days. */
  sourLine: string;
  arrives: ArrivalGate;
  portrait: PortraitDef;
  /** Sells rotating stock of this kind; `buys` = pays Scrip for it. */
  stall?: { kind: StallKind; buys?: 'ore' | 'combat' };
  /** Hireable — the role id keys HIRELING_DEFS. */
  hireable?: boolean;
  /** Has an authored questline in questlines.ts. */
  questline?: boolean;
  /** Hour-of-clock window they're visibly on the floor (texture only). */
  floorHours: [number, number];
}

const N = (def: NpcDef): NpcDef => def;

export const NPCS: NpcDef[] = [
  // ===================== AT THE OPENING (first Collapse) ===================
  N({
    id: 'marrow', name: 'Marrow', role: 'Smith',
    line: 'Bring me clean ore or bring me nothing. The forge can tell the difference even if you can\'t.',
    sourLine: 'The last three delvers brought me mud and called it marl. Prove you\'re the fourth kind of person.',
    arrives: 'open', portrait: { hue: 18, hat: 'bald', eyes: 'slit', extra: 'beard' },
    questline: true, floorHours: [6, 20],
  }),
  N({
    id: 'vess', name: 'Vess', role: 'Merchant',
    line: 'Everything\'s for sale. The price depends on who\'s asking, and I never forget who\'s asking.',
    sourLine: 'You again. My ledger has a page with your name on it, and it isn\'t the nice ledger.',
    arrives: 'open', portrait: { hue: 280, hat: 'scarf', eyes: 'wide', extra: 'earring' },
    stall: { kind: 'ore', buys: 'ore' }, questline: true, floorHours: [0, 24],
  }),
  N({
    id: 'quill', name: 'Old Quill', role: 'Archivist',
    line: 'Sable sat where you\'re standing, once. She asked better questions. Bring me anything she wrote.',
    sourLine: 'Ink fades. Paper rots. Memory lies. I\'m the only honest record left, and I\'m tired.',
    arrives: 'open', portrait: { hue: 45, hat: 'cap', eyes: 'spect' },
    questline: true, floorHours: [4, 23],
  }),
  N({
    id: 'brakka', name: 'Brakka', role: 'Drill forewoman',
    line: 'A drill is a promise you make to the rock every morning. Keep yours oiled.',
    sourLine: 'Bay four\'s singing flat again. Nobody listens to a drill until it stops.',
    arrives: 'open', portrait: { hue: 200, hat: 'helm', eyes: 'dot', extra: 'scar' },
    hireable: true, questline: true, floorHours: [5, 14],
  }),
  N({
    id: 'tally', name: 'Tally', role: 'Assay clerk',
    line: 'Numbers don\'t flatter and they don\'t forgive. That\'s why I like them better than people.',
    sourLine: 'Someone logged a survey as "rocks: yes". I need a holiday.',
    arrives: 'open', portrait: { hue: 150, hat: 'cap', eyes: 'spect' },
    hireable: true, questline: true, floorHours: [8, 18],
  }),
  N({
    id: 'pell', name: 'Pell', role: 'Porter',
    line: 'You carry it down, I carry it up. Between us the whole world moves.',
    sourLine: 'My back is a ledger too, you know. Every sack\'s written in it.',
    arrives: 'open', portrait: { hue: 100, hat: 'hood', eyes: 'dot' },
    hireable: true, questline: true, floorHours: [3, 12],
  }),
  N({
    id: 'grist', name: 'Grist', role: 'Stoker',
    line: 'A kiln banked right holds heat all night. Same as a grudge. Same as a friendship.',
    sourLine: 'Cold kiln this morning. Someone let it die, and it wasn\'t me, and I know names.',
    arrives: 'open', portrait: { hue: 10, hat: 'wild', eyes: 'slit' },
    hireable: true, questline: true, floorHours: [14, 24],
  }),
  N({
    id: 'fenn', name: 'Fenn', role: 'Geode reader',
    line: 'Shake it. Hear that? That\'s either a fortune or a very disappointed pebble.',
    sourLine: 'Cracked forty today. Thirty-nine pebbles. Don\'t talk to me.',
    arrives: 'open', portrait: { hue: 170, hat: 'braids', eyes: 'wide' },
    stall: { kind: 'geodes' }, hireable: true, questline: true, floorHours: [9, 21],
  }),
  N({
    id: 'moth', name: 'Moth', role: 'Lattice hermit',
    line: 'The board remembers every stone you ever set. It\'s politer than I am about the bad ones.',
    sourLine: 'Someone called the Lattice "the hexagon minigame" in my hearing. I require silence now.',
    arrives: 'open', portrait: { hue: 260, hat: 'hood', eyes: 'wide', extra: 'moth' },
    hireable: true, questline: true, floorHours: [18, 24],
  }),
  N({
    id: 'lark', name: 'Widow Lark', role: 'Keeper of the Lamphouse',
    line: 'Sit. Eat. The rock will still be there when you\'ve remembered you\'re a person.',
    sourLine: 'Third bench broke this week. Delvers sit like they dig — too hard.',
    arrives: 'open', portrait: { hue: 330, hat: 'scarf', eyes: 'dot' },
    questline: true, floorHours: [0, 24],
  }),
  N({
    id: 'dovekin', name: 'Dovekin', role: 'Lamplighter',
    line: 'I count the lamps twice a night. Sable used to pay me a scrip a lamp. Nobody pays me now.',
    sourLine: 'Lamp nine keeps going out. Lamps don\'t just go out.',
    arrives: 'open', portrait: { hue: 55, hat: 'cap', eyes: 'wide' },
    questline: true, floorHours: [16, 24],
  }),
  N({
    id: 'hob', name: 'Hob', role: 'Cook',
    line: 'Deep-stew. Don\'t ask what\'s in it. Everyone who asks stops eating it, and it\'s good.',
    sourLine: 'The pot knows when you\'re rushing it. So do I.',
    arrives: 'open', portrait: { hue: 30, hat: 'bald', eyes: 'dot', extra: 'beard' },
    hireable: true, questline: true, floorHours: [5, 22],
  }),

  // ===================== WHEN THE STALLS FILL (Forge built) ================
  N({
    id: 'ashka', name: 'Ashka', role: 'Beast-broker',
    line: 'Chitin, silk, glands — the Deepwrought are a market that fights back. I pay best for what bit hardest.',
    sourLine: 'Someone sold me a "voltgland" that was a wet rock. I bite too, friend.',
    arrives: 'stalls', portrait: { hue: 0, hat: 'wild', eyes: 'slit', extra: 'chain' },
    stall: { kind: 'combat', buys: 'combat' }, questline: true, floorHours: [10, 24],
  }),
  N({
    id: 'nock', name: 'Nock', role: 'Gear-fitter',
    line: 'Boots, buckles, harness-rings. The rock kills the unprepared politely and the prepared not at all.',
    sourLine: 'Walked in with one boot, walked out with none. Some days the shop wins.',
    arrives: 'stalls', portrait: { hue: 120, hat: 'cap', eyes: 'dot' },
    stall: { kind: 'gear' }, questline: true, floorHours: [7, 19],
  }),
  N({
    id: 'sef', name: 'Sef', role: 'Hawker',
    line: 'Your surplus is somebody\'s treasure. I take a cut for knowing which somebody.',
    sourLine: 'Market\'s slow. Even the rats are haggling.',
    arrives: 'stalls', portrait: { hue: 210, hat: 'scarf', eyes: 'wide', extra: 'earring' },
    hireable: true, questline: true, floorHours: [8, 20],
  }),
  N({
    id: 'ilma', name: 'Ilma', role: 'Gem cutter',
    line: 'A gem is a piece of the dark that decided to be honest. I just help it along.',
    sourLine: 'Chipped a bloodgarnet at the last facet. We are not speaking, the garnet and I.',
    arrives: 'stalls', portrait: { hue: 350, hat: 'braids', eyes: 'spect' },
    stall: { kind: 'gems' }, questline: true, floorHours: [9, 17],
  }),
  N({
    id: 'rane', name: 'Two-Tongue Rane', role: 'Rumor-monger',
    line: 'I hear everything twice — once as it happened, once as it\'s told. I sell the difference.',
    sourLine: 'No rumors today. That\'s the worst rumor of all.',
    arrives: 'stalls', portrait: { hue: 80, hat: 'hood', eyes: 'patch' },
    questline: true, floorHours: [12, 24],
  }),
  N({
    id: 'cully', name: 'Cully', role: 'Apprentice smith',
    line: 'Marrow says I\'m allowed to nod. Sometimes I also point at things.',
    sourLine: 'Burned my thumb. Marrow said "good". I\'m told that\'s praise.',
    arrives: 'stalls', portrait: { hue: 20, hat: 'cap', eyes: 'wide' },
    questline: true, floorHours: [0, 24],
  }),

  // ===================== WHEN THE CREWS FORM (tier III forged) =============
  N({
    id: 'ruta', name: 'Ruta', role: 'Shield-bearer',
    line: 'You swing, I stand. It\'s a simple arrangement and it\'s kept better people than you alive.',
    sourLine: 'My shield has a new dent shaped like your judgment. We\'ll work on it.',
    arrives: 'crews', portrait: { hue: 230, hat: 'helm', eyes: 'slit', extra: 'scar' },
    hireable: true, questline: true, floorHours: [6, 18],
  }),
  N({
    id: 'jib', name: 'Jib', role: 'Runner',
    line: 'Fastest legs on the stair. I\'ve outrun three collapses and one wedding.',
    sourLine: 'Turned my ankle on the ninety-first step. The stair counts its victories.',
    arrives: 'crews', portrait: { hue: 140, hat: 'cap', eyes: 'wide' },
    hireable: true, questline: true, floorHours: [4, 16],
  }),
  N({
    id: 'sal', name: 'Old Iron Sal', role: 'Keeper of names',
    line: 'Every title\'s a scar with a ribbon on it. I keep the book. Earn a page.',
    sourLine: 'Somebody asked to BUY a title today. I laughed until I coughed. Worth it.',
    arrives: 'crews', portrait: { hue: 190, hat: 'bald', eyes: 'patch', extra: 'scar' },
    questline: true, floorHours: [10, 22],
  }),
  N({
    id: 'prill', name: 'Prill', role: 'Surveyor',
    line: 'The map ends where the pay ends. Fund me and I\'ll draw you the dark.',
    sourLine: 'Ink freezes at depth. Nobody puts that in the ballads.',
    arrives: 'crews', portrait: { hue: 60, hat: 'hood', eyes: 'spect' },
    questline: true, floorHours: [7, 15],
  }),
  N({
    id: 'verge', name: 'Nan Verge', role: 'Charter clerk',
    line: 'A charter is the Guild saying "we believe you\'ll come back". We don\'t print many.',
    sourLine: 'Stamp\'s worn out. Like my patience. Both get replaced quarterly.',
    arrives: 'crews', portrait: { hue: 305, hat: 'scarf', eyes: 'spect' },
    questline: true, floorHours: [9, 17],
  }),
  N({
    id: 'ossian', name: 'Keeper Ossian', role: 'Candle-priest',
    line: 'We light one for every delver below. Yours is the crooked one. It suits you.',
    sourLine: 'Wax is dear this month. Pray faster.',
    arrives: 'crews', portrait: { hue: 40, hat: 'hood', eyes: 'dot', extra: 'beard' },
    questline: true, floorHours: [0, 8],
  }),

  // ===================== AFTER THE BREACH (Ferrite folk) ===================
  N({
    id: 'serra', name: 'Serra', role: 'Caravan mistress',
    line: 'Two worlds, one road, and me in the middle taking a fair cut of both. Beautiful arrangement.',
    sourLine: 'A wheel cracked on the Breach stair. Do you know what a wheel COSTS down here?',
    arrives: 'ferrite', portrait: { hue: 25, hat: 'scarf', eyes: 'wide', extra: 'earring' },
    // The export shelf (Part B spine): she hauls every left-behind shell's
    // export down the stair — the spine's no-softlock guarantee has wheels.
    stall: { kind: 'exports' },
    questline: true, floorHours: [6, 20],
  }),
  N({
    id: 'magda', name: 'Magda Pole', role: 'Magnet-wright',
    line: 'North loves you or it doesn\'t. My job is making it love you on schedule.',
    sourLine: 'A compass bit me today. Fine. FINE.',
    arrives: 'ferrite', portrait: { hue: 215, hat: 'braids', eyes: 'slit' },
    stall: { kind: 'ferrite' }, questline: true, floorHours: [8, 18],
  }),
  N({
    id: 'brine', name: 'Brine', role: 'Crucible tapper',
    line: 'Slag tells you more than a pour that went true. Slag is honest about what you did wrong.',
    sourLine: 'Tapped a pour that screamed. We don\'t discuss Tuesday.',
    arrives: 'ferrite', portrait: { hue: 185, hat: 'helm', eyes: 'dot', extra: 'beard' },
    questline: true, floorHours: [11, 23],
  }),
  N({
    id: 'ferro', name: 'Ferro', role: 'Foundry fitter',
    line: 'Every module wants the same flue. Machines are just people with fewer excuses.',
    sourLine: 'The Dream Boiler is whistling in a key I don\'t care for.',
    arrives: 'ferrite', portrait: { hue: 240, hat: 'cap', eyes: 'spect', extra: 'chain' },
    questline: true, floorHours: [7, 19],
  }),
  N({
    id: 'neev', name: 'Echo-Ash Neev', role: 'Breach survivor',
    line: 'I was on Sable\'s crew. I\'m the one who turned back. Ask me why when you\'ve been deeper.',
    sourLine: 'You walk like her. Stop it.',
    arrives: 'ferrite', portrait: { hue: 270, hat: 'wild', eyes: 'patch', extra: 'scar' },
    questline: true, floorHours: [20, 24],
  }),
  N({
    id: 'anders', name: 'Cold Anders', role: 'Rime dealer',
    line: 'Below two hundred the rock sweats frost. I bottle it. Don\'t ask what keeps it cold.',
    sourLine: 'Somebody left the cellar door open. It\'s WARMER inside now. Ruined.',
    arrives: 'ferrite', portrait: { hue: 195, hat: 'hood', eyes: 'slit' },
    stall: { kind: 'provisions' }, questline: true, floorHours: [13, 24],
  }),
];

const byId = new Map(NPCS.map((n) => [n.id, n]));

export function npcDef(id: string): NpcDef {
  const def = byId.get(id);
  if (!def) throw new Error(`Unknown NPC: ${id}`);
  return def;
}

/** Which arrival gates are open for a given game state shape (pure helper —
 * the caller passes the flags so this file stays content-only). */
export function gatesOpen(flags: { forgeBuilt: boolean; tier3: boolean; breached: boolean }): ArrivalGate[] {
  const gates: ArrivalGate[] = ['open'];
  if (flags.forgeBuilt) gates.push('stalls');
  if (flags.tier3) gates.push('crews');
  if (flags.breached) gates.push('ferrite');
  return gates;
}

export function npcsPresent(flags: { forgeBuilt: boolean; tier3: boolean; breached: boolean }): NpcDef[] {
  const gates = new Set(gatesOpen(flags));
  return NPCS.filter((n) => gates.has(n.arrives));
}

// Reputation tiers: Stranger / Known / Trusted / Sworn.
export const REP_TIERS = [0, 30, 100, 250] as const;
export const REP_TIER_NAMES = ['Stranger', 'Known', 'Trusted', 'Sworn'] as const;

export function repTier(rep: number): number {
  let tier = 0;
  for (let i = 0; i < REP_TIERS.length; i++) if (rep >= REP_TIERS[i]!) tier = i;
  return tier;
}
