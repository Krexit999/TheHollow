/**
 * Core engine types. Pure data — no React / Pixi / DOM.
 */
import type { Decimal } from './decimal';
import type { MaterialRarity, PurityBand, RolledDrop } from './materials';

// ---------------------------------------------------------------------------
// Materials, tools, assay (Phase 3)
// ---------------------------------------------------------------------------

/** An inventory stack: count + running purity sum (avg = sum / count). */
export interface Stack {
  count: number;
  puritySum: number;
}

export interface ToolInstance {
  id: number;
  recipeId: string;
  name: string;
  tier: number;
  /** Weighted avg purity of its inputs — why two of the same tool differ. */
  purity: number;
  /** Survived a Recursion: blunted to the Shell I ladder, kept its name,
   * purity, gems, and alloys. A tool that outlived its world. */
  heirloom?: boolean;
  /** The tier it held before the world reset — worn as a whisper of edge. */
  formerTier?: number;
  /** Live: a dustYield multiplier while equipped. */
  chipPower: number;
  /** Computed and displayed; does nothing until combat (Phase 5). */
  strikePower: number;
  sockets: (string | null)[];
  /** Alloy slots (tier IV+) — the affix system: alloys slot into tools. */
  alloys: (string | null)[];
  /** THE TEMPER (v14): what this tool was cooled in. A CONDITION, not a stat. */
  temper?: string;
  /** CRAFTSMANSHIP (v16): the quality this tool was made with at the Workbench. */
  craft?: number;
  /**
   * THE PARTS (v15): head/haft/binding, each a material + purity. The source of
   * truth for a tool built compositionally. Legacy tools (pre-v15) may lack it
   * and fall back to their stored chipPower/strikePower until re-forged; the
   * v15 migration fills it in from the historical recipe so nothing is lost.
   */
  parts?: { head: { materialId: string; purity: number }; haft: { materialId: string; purity: number }; binding: { materialId: string; purity: number } };
  /** AFFINITY (v21): use-history per shell — the implement learns the rock it works.
   *  Accumulates, never decays; drives a small capped bonus through the modifiers. */
  use?: Record<string, number>;
  /** HEIRLOOM HISTORY (v22): distinct deeds this tool has earned a MARK for — felled
   *  a Warden, survived a Recursion, cracked a hundred geodes, carried through a
   *  Breach. A record with a light mechanical edge; pairs with the opinions above. */
  history?: string[];
  /** Running counters toward marks that need a threshold (e.g. geodes cracked). */
  deeds?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Shells, signatures, Ferrite (Phase 4)
// ---------------------------------------------------------------------------

export interface ShellState {
  current: string; // 'loam' | 'ferrite' | ...
  breachCount: number;
  /** Feeds Echoes = floor(3·(cores/200)^0.6); resets on Breach. Re-rated A.44. */
  coresEarnedThisBreach: Decimal;
  /** Signature ids carried down, in breach order. Permanent. */
  signatures: string[];
  /** Echo sink: +15% carried-signature strength per level. */
  resonantMemory: number;
}

export interface PolarityState {
  /** +1 / −1 per face cell (parallel to face.cells). */
  signs: number[];
  chain: number;
  lastSign: number;
  lastChipAtSec: number;
  bestChain: number;
  /** Pole per column: +1 / −1 / 0 (owned but off). Length face.w. */
  magnets: number[];
  /** Columns 0..magnetCount-1 are rigged. */
  magnetCount: number;
}

export interface CrucibleState {
  discovered: string[];
  /** Fuse-upward rank per alloy (1-5). */
  ranks: Record<string, number>;
  /** Best catalyst purity per alloy — drives the slotted effect. */
  purities: Record<string, number>;
  pours: number;
  fails: number;
  passiveRank: number;
  passiveProgressSec: number;
  lastHint: string | null;
}

export interface FoundryState {
  slots: number;
  installed: string[];
}

// ---------------------------------------------------------------------------
// Combat (Phase 5)
// ---------------------------------------------------------------------------

export interface GearInstance {
  defId: string;
  purity: number;
}

export interface ActiveFight {
  speciesId: string;
  enemyHp: number;
  enemyMaxHp: number;
  playerHp: number;
  playerLane: number;
  enemyLane: number;
  turn: number;
  phase: number;
  /** Current pole (ferrite species); 0 = unpoled. */
  pole: 1 | -1 | 0;
  /** The Tapmother's guard cycle. */
  guardUp: boolean;
  /** Old Plenty's offering: lanes currently full of fruit (abundance). */
  fruitLanes: number[];
  telegraph: { kind: string; lanes: number[]; power: number; windup: number } | null;
  /** One further ahead — revealed by lanterns. */
  nextTelegraph: { kind: string; lanes: number[]; power: number; windup: number } | null;
}

export interface CombatState {
  /** Resolve encounters silently with the player's stats (the idle path). */
  autoResolve: boolean;
  pending: { speciesId: string; expiresAtSec: number } | null;
  active: ActiveFight | null;
  kills: Record<string, number>;
  /** Species ever encountered — the bestiary shows these and only these. */
  seen: string[];
  /** Shell ids whose Floor Warden has fallen — gates the Breach. */
  wardens: string[];
  /** Attempts per warden (titles read this — The Unbroken is first-try). */
  wardenAttempts: Record<string, number>;
  stats: {
    encounters: number;
    interruptions: number;
    wins: number;
    losses: number;
    autoWins: number;
    flees: number;
    perfects: number;
    lastSpawnAtSec: number;
  };
}

export interface MaterialsState {
  /** materialId -> band -> stack. Possessions: survive Collapse. */
  stacks: Record<string, Partial<Record<PurityBand, Stack>>>;
  gems: Record<string, number>;
  geodes: number;
  geodesCracked: number;
  totalDrops: number;
  /** GEM FUSION (v22): duplicates fused into cut quality — a running tally. */
  gemFused?: number;
}

export interface ForgeState {
  built: boolean;
  /** Tools broken back down (v14) — the counter the Forge never had. */
  salvaged: number;
  /** Quench media the player has ever used — a small Codex. */
  tempersUsed: string[];
  /** Trait pairs discovered by forging (v15) — the Codex; NOT in the Compendium. */
  pairsFound: string[];
  tools: ToolInstance[];
  equipped: number; // index into tools
  /** Play-seconds when the equipped tool was last picked up — drives OPINIONS'
   *  short settling-in period (v22). */
  equippedAt?: number;
  nextId: number;
  /** Worn gear — every piece has a mining face AND a combat face. */
  gear: {
    offhand: GearInstance | null;
    lantern: GearInstance | null;
    harness: GearInstance | null;
    boots: GearInstance | null;
  };
}

export interface AssayState {
  active: { endsAtPlaySec: number; depth: number } | null;
  /** Chips remaining with doubled drop chance after a survey. */
  boostChips: number;
  surveysDone: number;
  reportDepth: number | null;
  /** Materials the player has actually seen — the report names only these. */
  knownMaterials: string[];
}

// ---------------------------------------------------------------------------
// Face
// ---------------------------------------------------------------------------

export type DrillBehavior = 'fullest' | 'sweep' | 'random' | 'chain';

export interface DrillState {
  /** Per-drill upgrade level (chip power + a little speed). */
  level: number;
  behavior: DrillBehavior;
  /** Seconds accumulated toward the next strike. */
  timer: number;
  /** Sweep cursor / chain anchor: last cell index this drill touched. */
  lastCell: number;
  // --- THE FACE CLUSTER (v21) — a drill is an individual, not a slot number ---
  /** A name the player gave it. An individual, not "drill 3". */
  name?: string;
  /** AFFINITY: use-history per shell — a drill that worked a shell hits it harder. */
  use?: Record<string, number>;
  /** WEAR 0..1: strikes grind the head. At 1 the drill is BROKEN (idles) until
   *  repaired. Accrues ONLY online — an away/idle player's drills never wear
   *  (pillar 1). Visible long before it fails (pillar: never a surprise). */
  wear?: number;
  /** HEAD archetype id — determines targeting behaviour (a configured component,
   *  not the old `behavior` enum). When set, it supersedes `behavior`. */
  head?: string;
  /** BIT material — reads traits the way tool parts do (edge → power, cadence →
   *  speed, heft → wear resistance). A drill is configured, not merely levelled. */
  bit?: { materialId: string; purity: number };
}

// ---------------------------------------------------------------------------
// The Lattice (Shell I craft-system)
// ---------------------------------------------------------------------------

export type MotifShape = 'circle' | 'square' | 'triangle' | 'hex';

export interface MotifPlacement {
  shape: MotifShape;
  rank: number; // 1-5
  /** Placement index — Progressions are read in placement order. */
  seq: number;
}

export interface ActiveChord {
  /** Chord id: `${shape}.${context}.${uniform|mixed}` */
  id: string;
  /** The three cell keys forming the line. */
  cells: string[];
  sumRanks: number;
  /** Order stamp: the seq of the line's last-placed motif. */
  seq: number;
}

export interface LatticeState {
  unlocked: boolean;
  /** Board radius in rings: 1 (7 hexes) .. 4 (61 hexes). */
  rings: number;
  /** Placements keyed by axial "q,r". */
  cells: Record<string, MotifPlacement>;
  placeSeq: number;
  /** Passive Rank — accrues with time, online or off. */
  passiveRank: number;
  passiveProgressSec: number;
  /** Discovered chord ids — the Codex shows these and ONLY these. */
  discovered: string[];
  discoveredProgressions: string[];
  /** Currently-formed chords/progressions (recomputed on board change). */
  activeChords: ActiveChord[];
  activeProgressions: string[];
  /** Permanent doors opened by discovery (survive breaking the chord). */
  doors: { ring4: boolean; progressions: boolean; press: boolean };
  pressOn: boolean;
  pressProgress: number;
  /** Watermark of stats.totalChargeChipped already converted to Motifs. */
  chargeSeen: Decimal;
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export interface OfflineSummary {
  seconds: number;
  efficiency: number;
  dust: Decimal;
  brick: Decimal;
  xp: Decimal;
  levelsGained: number;
  chargeFilled: number;
  motifs: Decimal;
  passiveRanks: number;
  /** The hawker's overnight sales (Phase 6). */
  scrip: number;
}

// ---------------------------------------------------------------------------
// Verdance (Phase 7)
// ---------------------------------------------------------------------------

export interface GreenhouseState {
  /** Planted plots; progressMs advances on the game clock × weather. */
  plots: Array<{ speciesId: string; progressMs: number } | null>;
  seeds: Record<string, number>;
  /** Discovered strains — base finds and bred hybrids. Pillar 5: only this. */
  codex: string[];
  harvests: number;
  /** Iron bed-frames (Part B export spine): each Lodeframe installed opens one
   *  plot beyond the free four. Mastery still sets the CEILING (6 at 8, 8 at
   *  15) — mastery reveals the room, Ferrite iron builds the bed. */
  frames: number;
}

export interface MyceliumState {
  /** siteId ("row-lane") -> node type. Survives Collapse AND Breach. */
  nodes: Record<string, string>;
  /** Humus banked for self-spread. */
  reserve: number;
  lastSpreadMs: number;
}

export interface BrewingState {
  discovered: string[];
  doses: Record<string, number>;
  attempts: number;
  fails: number;
  lastHint: string | null;
  active: { brewId: string; endsAtSec: number } | null;
  drunk: number;
}

export interface LoomState {
  /** Thread id per warp row / weft column (6 each), or null. */
  warp: (string | null)[];
  weft: (string | null)[];
  /** The committed weave (modifiers run off THIS, not the working draft). */
  setWarp: (string | null)[];
  setWeft: (string | null)[];
  threads: Record<string, number>;
  discoveredShapes: string[];
  weaves: number;
  passiveRank: number;
  passiveProgressSec: number;
  /** The iron frame (Part B export spine): a wooden loom cannot hold a full
   *  warp. One Ferrite Lodeframe braces it for good; until then, no commit. */
  framed: boolean;
}

// ---------------------------------------------------------------------------
// Glassmere (Phase 8)
// ---------------------------------------------------------------------------

export interface RefractionState {
  entryRow: number;
  mirrors: Record<number, '/' | '\\'>;
  mirrorStock: number;
  path: Array<{ cell: number; color: number; dir: number; amplified: boolean }>;
  pathDirty: boolean;
  lastTraceSec: number;
  beamHarvests: number;
}

export interface ObservatoryState {
  active: { tier: number; startedMs: number } | null;
  completed: number;
  pieces: Record<string, number>;
  constellations: string[];
}

export interface BenchState {
  solved: string[];
  equippedLens: string | null;
  /** The second slot (Phase 10 gear deepening; opens at Hollow Mastery 5). */
  equippedLens2: string | null;
  nextGenSeed: number;
  passiveRank: number;
  passiveProgressSec: number;
}

export interface WarrensState {
  active: { id: string; stage: 'puzzle' | 'fight'; killBase: number } | null;
  cleared: Record<string, number>;
  uniques: string[];
  gearUnlocked: string[];
}

export interface RunesState {
  found: Record<string, number>;
  inscriptions: Record<string, (string | null)[]>;
  fouled: Record<string, boolean>;
  pairsSeen: string[];
  // --- IMPLEMENTS AND INSCRIPTION (v22) ---
  /** PRACTICE ON SCRAP: how many joins you have tried that RANG (harmonic) vs
   *  FOUGHT (dissonant). Structure learned, never the answer — the pair names and
   *  effects stay out of this (pillar 5). */
  practiced?: { harmonic: number; dissonant: number };
  /** ORDER-OVER-TIME: the trail of runes carved onto the tool, in order with the
   *  play-second each landed — the substrate the slow temporal combos read. */
  carveTrail?: { rune: string; at: number }[];
  /** Temporal combos the trail has completed — a permanent discovery Codex. */
  temporalFound?: string[];
  /** CAST vs FOUND: how many of each rune came from the crucible, so a cast rune is
   *  distinguishable from a found one (a per-rune count of the cast portion). */
  castKinds?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Cinder (Phase 9)
// ---------------------------------------------------------------------------

export interface PressureState {
  /** 0-100. The gauge. */
  heat: number;
  /** The greedy line: vents choked to a quarter. Releases itself when idle. */
  choke: boolean;
  /** playTimeSec when the OVERPRESSURE countdown began; null = not in it. */
  overpressureAtSec: number | null;
  /** playTimeSec when heat first pinned at 100 (the klaxon's 2s fuse). */
  fuseAtSec: number | null;
  /** Last manual stoke (chip / choke) — the Damper's idle test. */
  lastStokeSec: number;
  /** Drill heat batched into the next tick so the Damper can clamp it. */
  drillHeatPending: number;
  /** The Vent Network: 7×5 grid, 0 = bare rock, 1 = laid pipe. */
  pipes: number[];
  ventedTotal: number;
  floods: number;
  overpressures: number;
  peakHeat: number;
}

export interface EmberState {
  grid: (string | null)[];
  /** Remaining burn seconds per cell; 0 = cold. */
  burn: number[];
  temp: number;
  sustainSec: number;
  bestSustainSec: number;
  savedLayout: (string | null)[];
  overdrive: boolean;
  /** The Draw (P14): pulling shaft heat into the furnace. Opposite of overdrive. */
  draw: boolean;
  fuelOwned: Record<string, number>;
  passiveRank: number;
  passiveProgressSec: number;
  /** Lens sockets (Part B export spine): row r of the grate needs r sockets
   *  open — each Ground Lens from the Glassmere bench focuses one more row's
   *  draft. Row 0 is free; 5 sockets open the whole 6×6. */
  sockets: number;
  /** Cumulative in-band seconds toward the next Emberglass anneal (90s each).
   *  Unlike sustainSec this never resets on a band exit — annealing is WORK
   *  DONE, the streak is a record. Live burns only; the banked fire anneals
   *  nothing while you are away. */
  annealSec: number;
}

export interface WellsState {
  /** `tapped` (B5): fed while the vent gallery ran hot — the rope stirs and
   *  the well resolves 25% faster. Absent on old records = not tapped. */
  active: Array<{ wellId: string; currencyId: string; amount: Decimal; startedMs: number; tapped?: boolean }>;
  rolls: number;
  wins: number;
  losses: number;
  totalCommitted: Decimal;
  totalReturned: Decimal;
}

export interface AnomaliesState {
  nextAtPlaySec: number;
  active: { id: string; startedAtPlaySec: number } | null;
  seen: number;
  resolved: number;
  merchantMeets: number;
}

// ---------------------------------------------------------------------------
// Hollow, Aleph, Recursion (Phase 10)
// ---------------------------------------------------------------------------

export interface HollowState {
  /** The Silence, 0-100: mutes carried strength as it climbs; harvests
   * convexly into Void. You farm entropy by choosing how loud the quiet gets. */
  silence: number;
  /** Auto-listener threshold (the Damper pattern): harvest at this stack. */
  listenAt: number;
  silenceHarvested: number;
  /** Reconstructed phantom cells, by face index. The long arc. */
  rebuilt: number[];
  /** Void spent on reconstruction, lifetime (the receipt for the epitaph). */
  voidSpent: string;
}

export interface ChamberState {
  /** The tape: recorded actions, replayed through REAL dispatch forever. */
  tape: Array<{ action: unknown; label: string }>;
  recording: boolean;
  running: boolean;
  cursor: number;
  stepTimer: number;
  /** Last replay pass's per-step yield trace (Void-equivalent) — the legible
   * execution trace that shows where a program wastes steps. */
  trace: number[];
  /** Best efficiency (yield per step per loop) ever achieved — persists. */
  bestEfficiency: number;
  loops: number;
  passiveRank: number;
  passiveProgressSec: number;
}

export interface AlephState {
  /** Sigils placed at the Core seal (its warden + warrens grant them). */
  sigils: number;
  coreTouched: boolean;
}

// ---------------------------------------------------------------------------
// The long tail (Phase 12)
// ---------------------------------------------------------------------------

/** One abstracted parallel shell. It has a depth and a ceiling; it has NO
 * interactive face — the face/depth/collapse systems are singletons keyed off
 * currentShell(), and six live faces would be a rewrite of the layer the whole
 * game sits on. Exactly one shell is "in hand" (fully playable) at a time; the
 * rest run themselves at the IDLE rate through the same modifier buckets, so
 * pillar 2 binds each of them separately and explicitly. */
export interface ParallelShell {
  shellId: string;
  depth: number;
  /** Automation policy driving it, or null for "banked, not running". */
  policy: string | null;
  /** Seconds of run time accumulated (drives its own collapse cadence). */
  runSec: number;
  collapses: number;
}

export interface SpiralState {
  count: number;
  /** Lifetime Spiral awarded — the high-water mark the formula pays past. */
  earned: number;
  /** Automation Grid slots bought with Spiral. */
  slots: number;
  /** Parallel-shell licences bought with Spiral. */
  licences: number;
  /** cell index -> module id. The grid is 4x4; adjacency matters. */
  grid: Record<number, string>;
  /** Module ids unlocked (by challenges), available to place. */
  modules: string[];
  challengeDone: string[];
  /** The challenge being run by hand right now. */
  activeChallenge: { id: string; startedAtPlaySec: number } | null;
  shells: ParallelShell[];
  /** Which shell is in hand; null = the ordinary single-world game. */
  inHand: string | null;
  /** Your real world, put down whole while a challenge runs. Serialized with
   * the save codec so Decimals round-trip; restored on finish or abandon. A
   * challenge can therefore never cost you the run you were playing. */
  saved?: string;
}

/** A rolled relic. Affixes come from CONTEXT (where and how it was found),
 * never from a blind roll — so the "roll" is steerable and a bad one is not a
 * punishment. Fusion keeps the better of each affix and never destroys. */
/**
 * WHERE IT CAME FROM (A.46). The game already knew every one of these at the
 * moment a relic was minted and threw all of it away, keeping a rarity colour.
 * "A Rare" is not a memory; "the one the Badger turned up at depth 428 on run
 * six" is. Near-zero cost, and it is the whole identity half.
 */
export interface RelicFind {
  depth: number;
  shell: string;
  /** Collapse count when found — "run 6". */
  run: number;
  /** Play-time seconds at the find, for "how long ago". */
  playSec: number;
  /** The drill that turned it up, when a drill did. */
  by?: string;
}

export interface RelicInstance {
  uid: number;
  defId: string;
  rarity: number; // 0 Common .. 4 Mythic
  /** bucket -> rolled magnitude. Keys are modifier bucket ids. */
  affixes: Record<string, number>;
  /** Where it came from — shown, and what shaped the affixes. */
  source: string;
  fusedFrom: number;
  /** The find. Absent on relics from before A.46 — they simply have no story,
   *  which is honest; back-filling one would be inventing a memory. */
  found?: RelicFind;
  /** 0 dormant · 1 stirring · 2 awake. Absent = 0. */
  waking?: number;
  /** Progress toward the next waking: seconds carried, plus deeds in its own
   *  element. Time-based so it is idle-friendly (pillar 1) — carrying is
   *  enough, working it is faster. */
  charge?: number;
  /** LOCKED (v22): the player has marked this one keep-forever. A locked relic
   *  can never be consumed — not fed into a fusion, not given to a Museum case.
   *  Absent means unlocked, so old saves load correctly with no migration. */
  locked?: boolean;
}

export interface RelicsState {
  held: RelicInstance[];
  /** uids equipped, up to 6 slots. */
  equipped: number[];
  nextUid: number;
  found: number;
  fused: number;
  /** Rarity floor rises with museum/codex completion — a late Mythic can
   * never roll worse than an early one. */
  floorBonus: number;
  /**
   * SHARDS (A.46) — what a rendered relic becomes, and the only thing that
   * pays for a fusion. Before this, fusion was FREE and the hold was
   * unbounded, so two hundred commons sat in an infinite scroll and the
   * correct play was to fuse everything into everything. Shards make the
   * pile the resource rather than the clutter.
   */
  shards: number;
  /** Set resonances the player has actually seen fire. Discovery, not a list
   *  (pillar 5) — nothing here is shown before it happens once. */
  resonancesFound: string[];
}

/**
 * A RELIC ON DISPLAY (A.47). Donating used to DELETE the relic — which was
 * survivable while a relic was a rarity colour and a stat, and became a bug the
 * moment A.46 gave each one a story: the museum would have been a wall of
 * anonymous plinths built out of the only records of where anything came from.
 * The instance is kept whole here, so the relic's history has exactly ONE home
 * and the exhibit reads it rather than restating it.
 */
export interface MuseumPiece {
  relic: RelicInstance;
  /** The hall it stands in — the player's choice, and what exhibits read. */
  caseId: string;
  /** Studied. An unidentified piece is a shape under a cloth: it counts for the
   *  case, but an exhibit cannot recognise what it does not know. */
  identified: boolean;
}

export interface MuseumState {
  /** caseId -> donated item keys. */
  donated: Record<string, string[]>;
  completed: string[];
  /** Relics given to the halls, whole. */
  pieces: MuseumPiece[];
  /** Named exhibits the arrangement has actually formed. Discovery, never a
   *  list (pillar 5) — nothing here is shown before it happens once. */
  exhibitsFound: string[];
}

export interface ExpeditionsState {
  /** Running expeditions; resolve on the GAME CLOCK and wait forever.
   *  `fromDepth` (Phase 19) is the installed point on the column they set off
   *  from — 0 or absent is the surface. Deeper start, deeper world reached. */
  active: Array<{ crewId: string; routeId: string; startedMs: number; durationMs: number; fromDepth?: number }>;
  /** Resolved and unclaimed — nothing is ever missed. */
  ready: Array<{ crewId: string; routeId: string; seed: number; fromDepth?: number }>;
  completed: number;
}

export interface RecursionState {
  count: number;
  /** Axioms OWNED (ids into AXIOMS) — permanent across Recursions. */
  axioms: string[];
  /** Lifetime Axiom currency awarded (the formula's high-water mark). */
  axiomsEarned: number;
  /** Twin Descent: the pace of the shell you left, snapshotted at Breach. */
  leftBehind: { chipCurrencyId: string; ratePerSec: Decimal } | null;
}

// ---------------------------------------------------------------------------
// The Guild (Phase 6)
// ---------------------------------------------------------------------------

export type ContractKind =
  | 'deliver' // bring N of a material (consumed at turn-in)
  | 'cull' // fell N of a species
  | 'depth' // push past a depth without collapsing
  | 'forge' // forge a tool of tier N
  | 'pour' // pour alloys true
  | 'chain' // ride a polarity chain to N
  | 'geode' // crack geodes
  | 'assay'; // complete surveys

export interface Contract {
  id: number;
  npcId: string;
  kind: ContractKind;
  desc: string;
  /** deliver */
  materialId?: string;
  /** deliver / cull / pour / geode / assay counts; depth / chain / forge targets */
  target: number;
  /** cull */
  speciesId?: string;
  /** progress baseline snapshotted at accept (kills, pours, collapse count...) */
  base: number;
  accepted: boolean;
  scrip: number;
  renown: number;
}

export interface HirelingState {
  level: number;
  xp: number;
  /** The Cinder interface — live since Phase 9: a completed flood with crew
   * still stationed fells the longest-serving hand, deterministically. */
  status: 'well' | 'hurt' | 'fallen';
  /** Hire time (game clock) — the flood casualty is the LONGEST-serving. */
  hiredAtMs?: number;
}

export interface GuildState {
  discovered: boolean;
  /** Persistent game clock (played + away), ms. Schedules, stock windows and
   * caravan drift read THIS — deterministic, sim-testable, no login logic. */
  clockMs: number;
  /** Arrival gates already announced (open/stalls/crews/ferrite). */
  gatesSeen: string[];
  npcs: Record<string, { rep: number; met: boolean; questStep: number }>;
  /** Vess's ledger. She remembers. */
  vess: { trust: number; grudge: number; deals: number };
  contracts: { board: (Contract | null)[]; slots: number; completed: number; seq: number };
  hirelings: Record<string, HirelingState>;
  /** Crew berths — how many hirelings can work at once. */
  berths: number;
  caravan: { trades: number };
  titles: { earned: string[]; equipped: string | null };
  sable: { found: string[]; translated: string[]; read: string[] };
  /** Charter spends, by sink id. */
  charterSpent: Record<string, number>;
  /** Guild-lock recipe ids opened by questlines. */
  unlockedGear: string[];
  /** Per-window stall purchases (resets when the stock window turns). */
  stock: { window: number; bought: Record<string, number> };
  /** Hireling action clocks, keyed by npc id (game-clock ms). */
  timers: Record<string, number>;
  /** Cinder: crew pulled off the floor (no casualty possible, bonuses pause).
   * Auto-restations when the shaft cools under 70. */
  crewRecalled: boolean;
}

/** One Echo-bought attention slot (B3). Holds a FOUND confluence id or sits
 *  empty; `rank` (0..2) deepens the amplifier and belongs to the slot itself. */
export interface ConfluenceSlot {
  id: string | null;
  rank: number;
}

export interface GameState {
  /** Currency balances, keyed by currency id from the registry. */
  currencies: Record<string, Decimal>;
  /** Lifetime totals earned per currency (achievements, prestige math). */
  totals: Record<string, Decimal>;
  /** Upgrade levels, keyed by upgrade id. */
  upgrades: Record<string, number>;
  /** UI-only (Phase 11): systems the player has been introduced to, so the
   * "something opened" disclosure fires once per system and rides export/import
   * (localStorage would misfire on a restored save). The engine ignores it. */
  seenSystems: string[];

  face: {
    w: number;
    h: number;
    /** Charge per cell, row-major. Plain numbers: cell charge stays small. */
    cells: number[];
    /** Sweep stamina 0..staminaMax. Regenerates fast, never gates ordinary
     *  chipping, an idle player is unaffected. Part 1's one new tracked value. */
    stamina: number;
    staminaMax: number;
    /** Recent manual chips (cell + play-seconds), the trail FIGURES read. Tiny,
     *  self-expiring; a stale trail from a reloaded save just doesn't match. */
    recentChips: { cell: number; at: number }[];
    /** SKIM (Loam's technique): extra seep the pool banks for the hand, in
     *  charge units. Strictly ON TOP of the idle leak — an untouched pool
     *  changes nothing an idle player earns (tested, not promised). */
    seepPool: number;
  };

  /** Signature techniques — per-technique last-used play-seconds. */
  techniques: {
    lastUsed: Record<string, number>;
  };

  /** Keystones — the Breach gates (Progression phase). A placed keystone is
   *  remembered FOREVER (breach, collapse, recursion): the gate exists to
   *  make a shell's headline system load-bearing once, not every lap. */
  keystones: {
    placed: string[];
  };

  kiln: {
    built: boolean;
    /** 0..1 — the fuel curve. Output efficiency scales with heat. */
    heat: number;
    feeding: boolean;
    /** Dust-equivalent progress toward the next Brick. */
    progress: Decimal;
    /** The Reversed Kiln (Axiom): Brick melts back to Dust at a premium. */
    reverse?: boolean;
    // --- THE FACE CLUSTER (v21) ---
    /** Chosen FUEL id — a burn profile, not a ladder (each is a trade). Consumes a
     *  little of a material you own while feeding; falls back to the bare curve if
     *  the material runs out. null/undefined = the bare kiln (the old behaviour). */
    fuel?: string | null;
    /** OVERSTOKE: play-seconds until the deliberate burst window ends. */
    overstokeUntil?: number;
    /** Play-seconds until overstoke can be lit again (its cost is time + Dust). */
    overstokeReadyAt?: number;
    /** Fractional fuel burned but not yet consumed as a whole unit (keeps material
     *  stacks integer). */
    fuelBurn?: number;
  };

  drills: {
    bayBuilt: boolean;
    units: DrillState[];
  };

  depth: number;
  /** The CURRENT shell's record (kept in sync; UI convenience). */
  maxDepthRecord: number;
  /** Permanent per-shell records — survive every reset layer. */
  depthRecords: Record<string, number>;

  shell: ShellState;
  polarity: PolarityState;
  crucible: CrucibleState;
  foundry: FoundryState;
  combat: CombatState;
  guild: GuildState;
  /** GROWTH (Verdance signature) — vines over the face. Owned slice. */
  growth: {
    stage: number[];
    fruit: number[];
    age: number[];
    fullSince: number[];
    spreadTimer: number;
    fruitHarvested: number;
    autoDropped: number;
  };
  /** Last-seen weather segment (for change events). */
  weatherSeg: number;
  greenhouse: GreenhouseState;
  mycelium: MyceliumState;
  brewing: BrewingState;
  loom: LoomState;
  refraction: RefractionState;
  observatory: ObservatoryState;
  bench: BenchState;
  warrens: WarrensState;
  runes: RunesState;
  pressure: PressureState;
  ember: EmberState;
  wells: WellsState;
  anomalies: AnomaliesState;
  hollow: HollowState;
  chamber: ChamberState;
  aleph: AlephState;
  recursion: RecursionState;
  /** The long tail (Phase 12). */
  spiral: SpiralState;
  relics: RelicsState;
  museum: MuseumState;
  /** Cross-system confluences the player has FOUND (v13). A record of play.
   *  B3 (Interlock): `slots` is THE ATTENDED MARGIN — Echo-bought attention.
   *  Each slot holds one FOUND confluence and amplifies it ×(2 + 0.5·rank),
   *  capped ×3. Rank rides the SLOT, not the choice, so re-choosing is never
   *  punished. Unattended confluences pay ×1 exactly as before. */
  confluences: { found: string[]; slots: ConfluenceSlot[]; hinted: string[] };
  /** THE FACE CLUSTER (v20): FIGURES traced in the rock and found — a discovery
   *  Codex, permanent (survives Collapse), never listed in the Compendium. */
  figures: { found: string[] };
  /** THE REFINERY (v14): transmutation chains found, and bench counters. */
  refinery: { found: string[]; attempts: number; refined: number };
  /** THE WORKBENCH (v16): crafting-as-a-process. */
  workbench: import("./systems/workbench").WorkbenchState;
  /** THE SHAFT (v17): the column as a place — go back up, rail that outlives
   *  Collapse, and a scar record of what happened where. */
  shaft: import("./systems/shaftSys").ShaftState;
  expeditions: ExpeditionsState;

  /** THE CONSIDERED HAND (v19): player-authored conveniences that must survive
   *  an export/import — handwritten notes are the worst thing to lose silently. */
  qol: QolState;

  collapse: {
    count: number;
    /** Core tree node levels, keyed by node id. */
    nodes: Record<string, number>;
    /** The last completed run's ledger — for the summary's "vs last run". */
    lastRun: RunSummary | null;
    /** play-time seconds at the run's start, to clock its duration. */
    runStartAt: number;
    /** Marks the column keeps, newest last, bounded. Per-shell: the column you
     *  are standing in is the one that remembers, so a Breach starts a fresh
     *  one. */
    traces: CollapseTrace[];
  };

  delver: {
    /** XP progress into the current level. */
    xp: Decimal;
    level: number;
    skillPoints: number;
    /** Skill node ranks, keyed by node id. */
    skills: Record<string, number>;
  };

  achievements: {
    /** Unlocked achievement ids. */
    unlocked: Record<string, true>;
  };

  stats: {
    manualChips: number;
    drillStrikes: number;
    totalChargeChipped: Decimal;
    /**
     * CHARGE taken out of the rock by every field path — manual chips,
     * drills, seepage, offline harvest. Charge, not currency, on purpose.
     *
     * Pillar 2 says field regen is the hard ceiling on income. Until A.42 the
     * only instrument for it compared TOTAL chip income against the field
     * ceiling, so every coin the Guild paid read as the field over-producing:
     * a 12h idle run showed windows above 100% with nothing wrong, and the
     * pillar's gate could no longer fail honestly. This is the numerator that
     * gate actually needs. Lifetime; never resets.
     */
    fieldChargeHarvested: Decimal;
    bricksFired: Decimal;
    upgradesBought: number;
    descents: number;
    playTimeSec: number;
    /** Wall-clock ms of the last save — offline calc measures from here. */
    lastSavedAt: number;
    saveExported: boolean;
    offlineClaimed: boolean;
    toolsForged: number;
    longestOfflineSec: number;
  };

  /** The Lattice — persists through Collapse AND Breach. */
  lattice: LatticeState;

  /** Possessions — materials, gems, geodes. Survive Collapse. */
  materials: MaterialsState;
  forge: ForgeState;
  assay: AssayState;

  /** Pending offline summary for the UI to display; not serialized. */
  offline: OfflineSummary | null;

  /** Recent-event ring buffer the UI drains for juice/toasts; not serialized. */
  feed: FeedEntry[];
}

// ---------------------------------------------------------------------------
// THE CONSIDERED HAND (Phase 21) — player-authored conveniences, in the save.
// ---------------------------------------------------------------------------

/** One run's closing ledger, kept so the next Collapse can compare against it. */
/**
 * HOW THE SHAFT CAME DOWN (A.45). The Collapse fires 24-37 times in a Loam arc
 * — measured, the most repeated screen in the game — so the choice attached to
 * it has to be ONE CLICK and never a modal. Ceremony is the enemy here.
 *
 * Every type pays IDENTICAL Cores. What differs is what the cave-in spares, so
 * the Core faucet is untouched and A.44's ladder sizing still stands; the
 * choice shapes the next run's OPENING, not its payout. `clean` is the old
 * behaviour bit-for-bit, which is why no pacing number needs re-baselining.
 */
export type CollapseType = 'clean' | 'braced' | 'ember';

/** A mark the column keeps. Traces survive the fall that made them — the point
 *  is that the shaft accumulates a history you can see. */
export interface CollapseTrace {
  depth: number;
  /** Which collapse this was, so the column reads in order. */
  count: number;
  type: CollapseType;
}

export interface RunSummary {
  depth: number;
  cores: Decimal;
  sec: number;
  count: number;
  /** How it came down. Absent on saves from before types existed. */
  type?: CollapseType;
  /** What the CARRY-ONE mark saved this fall: the upgrade kept and the levels it
   *  held that would otherwise have reset. Optional — absent when nothing carried
   *  (and on saves from before it was recorded). */
  carried?: { name: string; levels: number };
}

/** A saved tool composition — recall it and re-forge with different stone. */
export interface Blueprint {
  id: string;
  name: string;
  tier: number;
  head: string | null;
  haft: string | null;
  binding: string | null;
}

/** A saved Lattice board arrangement — recall it, pay to restore it. */
export interface LatticeLayout {
  id: string;
  name: string;
  motifs: { q: number; r: number; shape: MotifShape; rank: number }[];
}

/** A standing rule: refine this stone up while it sits below the target band. */
export interface RefinePreset {
  materialId: string;
  toBand: PurityBand;
  enabled: boolean;
}

export interface QolState {
  /** Compendium: bookmarked entry ids, per-entry notes, and last-read stamps. */
  bookmarks: string[];
  notes: Record<string, string>;
  readAt: Record<string, number>;
  /** Forge: saved compositions. */
  blueprints: Blueprint[];
  /** Lattice: saved boards, and chords locked against a misclick. */
  latticeLayouts: LatticeLayout[];
  lockedChords: string[];
  /** The Hold: pinned materials and auto-refine standing rules. */
  pins: string[];
  refinePresets: RefinePreset[];
  /** Collapse: auto-collapse at this depth (null = off). */
  autoCollapseDepth: number | null;
  /** Collapse: one face upgrade to carry at full level through the NEXT collapse
   *  (null = none). Non-stacking; consumed by the collapse it survives. */
  carryUpgradeId: string | null;
  /** Confirm-on-big-spend: fraction of a holding above which a spend confirms
   *  (0 = off). A device preference kept here so it rides an export. */
  confirmSpendFrac: number;
}

export function defaultQolState(): QolState {
  return {
    bookmarks: [], notes: {}, readAt: {}, blueprints: [], latticeLayouts: [],
    lockedChords: [], pins: [], refinePresets: [], autoCollapseDepth: null,
    carryUpgradeId: null, confirmSpendFrac: 0.5,
  };
}

// ---------------------------------------------------------------------------
// Events — engine-internal bus + a feed the UI drains for juice/toasts.
// ---------------------------------------------------------------------------

export type GameEvent =
  | { type: 'chip'; cell: number; dust: Decimal; charge: number; crit: boolean; manual: boolean }
  | { type: 'fracture'; cells: number[] }
  | { type: 'drillStrike'; drill: number; cell: number; dust: Decimal }
  | { type: 'brick'; count: Decimal }
  | { type: 'purchase'; id: string; levels: number }
  | { type: 'descend'; depth: number }
  | { type: 'climb'; depth: number }
  | { type: 'railExtended'; shell: string; depth: number }
  | { type: 'cacheInstalled'; depth: number }
  | { type: 'cacheDeposited'; materialId: string; qty: number }
  | { type: 'cacheCollected'; materialId: string; qty: number; cured: boolean }
  | { type: 'cureFound'; id: string; to: string }
  | { type: 'liftInstalled'; shell: string }
  | { type: 'digShift'; id: string; name: string; shift: number }
  | { type: 'digComplete'; id: string; name: string; shift: number }
  | { type: 'collapse'; cores: Decimal; depth: number; sec: number; prev: RunSummary | null; auto: boolean }
  | { type: 'levelUp'; level: number }
  | { type: 'achievement'; id: string }
  | { type: 'rowComplete'; row: number }
  | { type: 'colComplete'; col: number }
  | { type: 'motifPlaced'; cell: string; shape: MotifShape; rank: number }
  | { type: 'chordFormed'; id: string; cells: string[] }
  | { type: 'chordDiscovered'; id: string; cells: string[] }
  | { type: 'progressionDiscovered'; id: string }
  | { type: 'doorOpened'; door: string }
  | { type: 'latticeRing'; rings: number }
  /** `first` is true only the very first time this material ever reaches your
   *  hands — the UI announces those and stays quiet for every find after. */
  | { type: 'materialFound'; materialId: string; purity: number; rarity: MaterialRarity; first: boolean }
  | { type: 'gemFound'; gemId: string }
  | { type: 'geodeFound' }
  | { type: 'geodeCracked'; drops: RolledDrop[] }
  | { type: 'toolForged'; toolId: number; name: string; tier: number; purity: number }
  | { type: 'assayComplete'; depth: number }
  | { type: 'breach'; from: string; to: string; echoes: Decimal }
  | { type: 'chainChip'; cell: number; chain: number; mult: number }
  | { type: 'chainBroken'; at: number }
  | { type: 'alloyDiscovered'; id: string; purity: number }
  | { type: 'alloyFused'; id: string; rank: number }
  | { type: 'pourFailed'; refund: string }
  | { type: 'foundryInstalled'; id: string }
  | { type: 'encounter'; speciesId: string; known: boolean }
  | { type: 'combatStart'; speciesId: string; warden: boolean }
  | { type: 'combatPhase'; speciesId: string; phase: number }
  | {
      type: 'combatEnd';
      speciesId: string;
      result: 'win' | 'loss' | 'fled';
      drops: { materialId: string; purity: number }[];
      auto: boolean;
    }
  | { type: 'wardenFelled'; shellId: string; speciesId: string }
  | { type: 'gearForged'; gearId: string; slot: string; purity: number }
  | { type: 'guildOpened' }
  | { type: 'npcsArrived'; gate: string; count: number }
  | { type: 'fragmentFound'; id: string }
  | { type: 'fragmentTranslated'; id: string }
  | { type: 'contractDone'; id: number; npcId: string; scrip: number }
  | { type: 'questAdvanced'; npcId: string; step: number; note: string }
  | { type: 'repTier'; npcId: string; tier: number }
  | { type: 'titleEarned'; id: string }
  | { type: 'hired'; npcId: string }
  | { type: 'caravanTraded'; route: string }
  | { type: 'vineHarvest'; cell: number; stage: number; dust: Decimal }
  | { type: 'vineRipe'; cell: number; dust: Decimal }
  | { type: 'weatherChanged'; id: string; name: string; blurb: string }
  | { type: 'seedFound'; speciesId: string }
  | { type: 'hybridBred'; id: string }
  | { type: 'plotHarvested'; speciesId: string }
  | { type: 'myceliumSpread'; siteId: string; auto: boolean }
  | { type: 'brewDiscovered'; id: string }
  | { type: 'brewDrunk'; id: string }
  | { type: 'shapeWoven'; shapeId: string; count: number }
  | { type: 'weaveSet' }
  /** THE FACE CLUSTER (v20): a FIGURE traced in the rock. `first` on discovery. */
  | { type: 'figure'; id: string; name: string; first: boolean }
  /** THE FACE CLUSTER (v21): a drill wore through and dropped to its floor. */
  | { type: 'drillBroke'; drill: number; name?: string }
  /** IMPLEMENTS AND INSCRIPTION (v22). */
  | { type: 'gemFused'; gemId: string; quality: number }
  | { type: 'bulkSalvaged'; count: number; units: number }
  | { type: 'runePracticed'; harmonic: number; dissonant: number }
  | { type: 'temporalFound'; id: string; name: string }
  | { type: 'observationDone'; tier: number; pieces: number }
  | { type: 'constellation'; id: string }
  | { type: 'lensGround'; puzzleId: string }
  | { type: 'warrenCleared'; warrenId: string }
  | { type: 'warrenUnique'; warrenId: string; note: string }
  | { type: 'runeFound'; runeId: string }
  | { type: 'pairDiscovered'; pair: string }
  | { type: 'inscribed'; target: string }
  | { type: 'inscriptionFailed'; target: string }
  | { type: 'overpressure'; secondsLeft: number }
  | { type: 'overpressureCleared' }
  | { type: 'chokeReleased'; reason: 'idle' | 'overpressure' }
  | { type: 'purged'; heat: number }
  | { type: 'flood'; depth: number }
  | { type: 'hirelingLost'; npcId: string }
  | { type: 'crewRecalled' }
  | { type: 'crewRestationed' }
  | { type: 'arrayBest'; seconds: number }
  | { type: 'emberglassAnnealed'; total: number }
  | { type: 'wellResult'; wellId: string; mult: number; amount: Decimal }
  | { type: 'anomaly'; id: string }
  | { type: 'anomalyAnswered'; id: string; line: string }
  | { type: 'anomalySettled'; id: string }
  | { type: 'silenceHarvest'; stacks: number; voidGained: Decimal }
  | { type: 'cellRebuilt'; cell: number; total: number }
  | { type: 'faceWhole' }
  | { type: 'tapeStep'; index: number; label: string }
  | { type: 'coreTouched' }
  | { type: 'recursion'; count: number; axiomsGained: number }
  | { type: 'axiomBought'; id: string; heresy: boolean }
  // --- Phase 12: the long tail -------------------------------------------
  | { type: 'spiral'; count: number; spiralGained: number }
  | { type: 'challengeStarted'; id: string }
  | { type: 'challengeDone'; id: string; moduleId: string }
  | { type: 'challengeAbandoned'; id: string }
  | { type: 'modulePlaced'; id: string; cell: number }
  | { type: 'shellLicensed'; shellId: string }
  | { type: 'relicFound'; relicId: string; rarity: string; source: string }
  | { type: 'relicWoke'; uid: number; step: number }
  | { type: 'resonanceFound'; id: string }
  | { type: 'exhibitFormed'; id: string }
  | { type: 'relicFused'; relicId: string; rarity: string }
  | { type: 'expeditionReturned'; crewId: string; haul: number }
  | { type: 'caseCompleted'; caseId: string }
  | { type: 'confluenceFound'; id: string; name: string }
  | { type: 'journalReveal'; kind: 'confluenceHint' | 'cure'; a: string; b: string }
  | { type: 'techniqueUsed'; id: string; cell?: number }
  | { type: 'skimmed'; charge: number; paid: Decimal }
  | { type: 'poleShifted'; cell: number; sign: number }
  | { type: 'keystonePlaced'; shellId: string; leg: 'craft' | 'buy' }
  | { type: 'refined'; materialId: string; from: number; to: number; band: string }
  | { type: 'chainFound'; chainId: string; name: string }
  | { type: 'salvaged'; toolName: string; units: number }
  | { type: 'tempered'; temperId: string; toolName: string }
  | { type: 'traitPairFound'; name: string }
  | { type: 'craftFinished'; act: string; quality: number; delegated: boolean }
  | { type: 'carveBotched'; target: string }
  | { type: 'gemCut'; gemId: string; lean: string; quality: number }
  | { type: 'castFound'; id: string; name: string }
  | { type: 'castMissed' };

export type GameEventType = GameEvent['type'];

export interface FeedEntry {
  seq: number;
  event: GameEvent;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type GameAction =
  | { type: 'chip'; cell: number }
  | { type: 'buyUpgrade'; id: string; count?: number | 'max' }
  | { type: 'setKilnFeeding'; feeding: boolean }
  | { type: 'upgradeDrill'; index: number }
  | { type: 'setDrillBehavior'; index: number; behavior: DrillBehavior }
  | { type: 'descend' }
  | { type: 'descendMany'; count: number }
  | { type: 'climb'; to?: number }
  | { type: 'extendRail' }
  | { type: 'installCache' }
  | { type: 'removeCache'; index: number }
  | { type: 'depositCache'; index: number; materialId: string; qty: number }
  | { type: 'collectCache'; index: number }
  | { type: 'installLift' }
  | { type: 'rideLift' }
  | { type: 'workExcavation'; id: string }
  | { type: 'collapse'; fall?: CollapseType }
  | { type: 'placeMotif'; q: number; r: number; shape: MotifShape; rank: number }
  | { type: 'removeMotif'; q: number; r: number }
  | { type: 'upgradeMotif'; q: number; r: number }
  | { type: 'buyLatticeRing' }
  | { type: 'setLatticePress'; on: boolean }
  | { type: 'craftTool'; recipeId: string; refined?: boolean }
  | { type: 'craftFromParts'; tier: number; head: string; haft: string; binding: string }
  | { type: 'replacePart'; toolId: number; slot: 'head' | 'haft' | 'binding'; materialId: string }
  | { type: 'beginCraft'; act: 'forge' | 'carve' | 'cut' | 'cast'; context: Record<string, unknown> }
  | { type: 'craftStage'; execution: number; data?: Record<string, unknown> }
  | { type: 'delegateCraft' }
  | { type: 'abandonCraft' }
  | { type: 'equipTool'; toolId: number }
  | { type: 'socketGem'; toolId: number; slot: number; gemId: string }
  | { type: 'discardTool'; toolId: number }
  | { type: 'crackGeode' }
  | { type: 'startAssay' }
  | { type: 'breach' }
  | { type: 'buyResonantMemory' }
  | { type: 'confluenceBuySlot' }
  | { type: 'confluenceSetSlot'; slot: number; id: string | null }
  | { type: 'confluenceBuyRank'; slot: number }
  | { type: 'buyMagnet' }
  | { type: 'toggleMagnet'; col: number }
  | { type: 'useTechnique'; id: string; cell?: number }
  | { type: 'placeKeystone'; leg: 'craft' | 'buy' }
  | { type: 'pourAlloy'; amounts: number[]; catalystId: string }
  | { type: 'socketAlloy'; toolId: number; slot: number; alloyId: string }
  | { type: 'castBinding'; alloyId: string }
  | { type: 'grindChartLens'; constellationId: string }
  | { type: 'buyFoundrySlot' }
  | { type: 'installModule'; id: string }
  | { type: 'uninstallModule'; id: string }
  | { type: 'combatEngage' }
  | { type: 'combatAuto' }
  | { type: 'combatFlee' }
  | { type: 'combatTurn'; move: -1 | 0 | 1; act: 'strike' | 'guard'; timing: number }
  | { type: 'fightWarden'; auto: boolean }
  | { type: 'setAutoResolve'; on: boolean }
  | { type: 'craftGear'; gearId: string }
  | { type: 'unequipGear'; slot: 'offhand' | 'lantern' | 'harness' | 'boots' }
  | { type: 'buyStock'; npcId: string; slot: number; stance?: 'fair' | 'press' | 'lowball' }
  | { type: 'sellMaterial'; materialId: string; count: number }
  | { type: 'acceptContract'; slot: number }
  | { type: 'completeContract'; slot: number }
  | { type: 'rerollContract'; slot: number }
  | { type: 'hire'; npcId: string }
  | { type: 'translateFragment'; fragmentId: string }
  | { type: 'markFragmentRead'; fragmentId: string }
  | { type: 'equipTitle'; titleId: string | null }
  | { type: 'caravanTrade'; route: string; amount: number }
  | { type: 'spendCharter'; sink: 'berth' | 'boardSlot' }
  | { type: 'plantSeed'; plot: number; speciesId: string }
  | { type: 'harvestPlot'; plot: number }
  | { type: 'inoculate'; siteId: string; nodeType: string }
  | { type: 'feedMycelium'; humus: number }
  | { type: 'brewExperiment'; sap: number; spore: number; resin: number }
  | { type: 'drinkBrew'; brewId: string }
  | { type: 'setThread'; axis: 'warp' | 'weft'; index: number; threadId: string | null }
  | { type: 'commitWeave' }
  | { type: 'spinThread'; threadId: string }
  | { type: 'setBeamRow'; row: number }
  | { type: 'setMirror'; cell: number; kind: '/' | '\\' | null }
  | { type: 'buyMirror' }
  | { type: 'startObservation'; tier: number }
  | { type: 'collectObservation' }
  | { type: 'benchAttempt'; puzzleId: string; mirrors: Record<number, '/' | '\\'> }
  | { type: 'equipLens'; puzzleId: string | null; slot?: 1 | 2 }
  | { type: 'warrenEnter'; id: string }
  | { type: 'warrenAnswer'; id: string; answer: number[] }
  | { type: 'warrenClaim' }
  | { type: 'warrenLeave' }
  | { type: 'inscribe'; target: 'tool' | 'offhand' | 'lantern' | 'harness' | 'boots'; sequence: (string | null)[] }
  | { type: 'setChoke'; on: boolean }
  | { type: 'emergencyPurge' }
  | { type: 'layPipe'; cell: number }
  | { type: 'recallCrew' }
  | { type: 'buyFuel'; fuelId: string; count?: number }
  | { type: 'placeFuel'; cell: number; fuelId: string | null }
  | { type: 'lightCell'; cell: number }
  | { type: 'setOverdrive'; on: boolean }
  | { type: 'setDraw'; on: boolean }
  // Part B export spine — production + the installs that consume exports.
  | { type: 'produceExport'; id: string }
  | { type: 'installFrame' }
  | { type: 'installLoomFrame' }
  | { type: 'installSocket' }
  | { type: 'refine'; materialId: string; band: string }
  | { type: 'transmute'; a: string; b: string }
  | { type: 'salvageTool'; toolId: number; extract: boolean }
  | { type: 'temperTool'; temperId: string }
  | { type: 'commitWell'; wellId: string; amount: number }
  | { type: 'collectWell'; wellId: string }
  | { type: 'answerAnomaly' }
  | { type: 'listen' }
  | { type: 'setListenAt'; stacks: number }
  | { type: 'rebuildCell'; cell: number }
  | { type: 'tapeRecord'; on: boolean }
  | { type: 'tapeRun'; on: boolean }
  | { type: 'tapeClear' }
  | { type: 'touchCore' }
  | { type: 'recurse' }
  | { type: 'buyAxiom'; id: string }
  | { type: 'markSystemsSeen'; ids: string[] }
  | { type: 'setKilnReverse'; on: boolean }
  | { type: 'buyCoreNode'; id: string }
  | { type: 'buySkillNode'; id: string }
  | { type: 'respecSkills' }
  // --- Phase 12: the long tail -------------------------------------------
  | { type: 'spiral' }
  | { type: 'buyGridSlot' }
  | { type: 'buyLicence' }
  | { type: 'placeModule'; id: string; cell: number }
  | { type: 'clearModule'; cell: number }
  | { type: 'startChallenge'; id: string }
  | { type: 'abandonChallenge' }
  | { type: 'licenseShell'; shellId: string }
  | { type: 'setShellPolicy'; shellId: string; policy: string | null }
  | { type: 'takeInHand'; shellId: string | null }
  | { type: 'equipRelic'; uid: number; slot: number }
  | { type: 'unequipRelic'; slot: number }
  | { type: 'fuseRelics'; keepUid: number; feedUid: number }
  | { type: 'toggleRelicLock'; uid: number }
  | { type: 'renderRelic'; uid: number }
  | { type: 'identifyPiece'; uid: number }
  | { type: 'movePiece'; uid: number; caseId: string }
  | { type: 'donateRelic'; uid: number; caseId: string }
  | { type: 'donateItem'; caseId: string; key: string }
  | { type: 'sendExpedition'; crewId: string; routeId: string; fromDepth?: number }
  | { type: 'claimExpedition'; crewId: string }
  | { type: 'hydrate'; state: GameState; nowMs: number }
  | { type: 'applyOffline'; seconds: number }
  | { type: 'dismissOffline' }
  | { type: 'markSaved'; nowMs: number }
  | { type: 'markExported' }
  | { type: 'hardReset' }
  | { type: 'undo' }
  | { type: 'setConfirmSpendFrac'; frac: number }
  | { type: 'saveBlueprint'; name: string; tier: number; head: string | null; haft: string | null; binding: string | null }
  | { type: 'deleteBlueprint'; id: string }
  | { type: 'saveLatticeLayout'; name: string }
  | { type: 'restoreLatticeLayout'; id: string }
  | { type: 'deleteLatticeLayout'; id: string }
  | { type: 'toggleChordLock'; id: string }
  | { type: 'togglePin'; materialId: string }
  | { type: 'setRefinePreset'; materialId: string; toBand: PurityBand | null }
  | { type: 'toggleRefinePreset'; materialId: string }
  | { type: 'setAutoCollapseDepth'; depth: number | null }
  | { type: 'setCarryUpgrade'; upgradeId: string | null }
  | { type: 'setBookmark'; entryId: string; on: boolean }
  | { type: 'setNote'; entryId: string; note: string }
  | { type: 'markRead'; entryId: string; sig: number }
  // --- THE FACE CLUSTER (v20) --------------------------------------------
  | { type: 'sweep'; cells: number[] }
  // --- THE FACE CLUSTER (v21) — Drill Bay -------------------------------
  | { type: 'renameDrill'; index: number; name: string }
  | { type: 'repairDrill'; index: number }
  | { type: 'fitDrillHead'; index: number; head: string | null }
  | { type: 'fitDrillBit'; index: number; materialId: string | null }
  | { type: 'setKilnFuel'; fuelId: string | null }
  | { type: 'overstoke' }
  // --- IMPLEMENTS AND INSCRIPTION (v22) ---------------------------------
  | { type: 'fuseGems'; gemId: string }
  | { type: 'bulkSalvage'; toolIds: number[]; extract: boolean }
  | { type: 'practiceRunes'; sequence: (string | null)[] }
  | { type: 'debug'; op: 'grant'; currency: string; amount: number }
  | { type: 'debug'; op: 'warp'; seconds: number };

export interface ActionResult {
  ok: boolean;
  reason?: string;
  /** Action-specific payload, e.g. chip yield for UI juice. */
  data?: unknown;
}

// ---------------------------------------------------------------------------
// Engine facade — this is the entire surface the UI may touch.
// ---------------------------------------------------------------------------

export type Unsubscribe = () => void;

export interface Engine {
  tick(dtSeconds: number): void;
  getState(): Readonly<GameState>;
  dispatch(action: GameAction): ActionResult;
  subscribe(fn: (state: Readonly<GameState>) => void): Unsubscribe;
  /** The last reversible action, if one is still inside the undo window. */
  undoInfo(): { label: string; atMs: number } | null;
}

/** Engine-internal context threaded through systems. */
export interface EngineCtx {
  emit(event: GameEvent): void;
  /** Invalidate the modifier cache (levels/depth/achievements changed). */
  dirty(): void;
}
