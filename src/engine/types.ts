/**
 * Core engine types. Pure data — no React / Pixi / DOM.
 */
import type { Decimal } from './decimal';
import type { MaterialRarity, PurityBand, RolledDrop } from './materials';
import type { RollState } from './systems/roll';

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

// Crucible removed A.7x (crucibleSystem.ts + shell2/alloys.ts cut).
// Combat removed A.7x (combat/* cut).

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

/**
 * A DRILL IS FURNITURE (A.53). It has a level, a name, and a memory of the
 * rock it has worked — nothing to configure. The head, the bit, the wear, the
 * grain and the behaviour selector were all stripped when the bay went back to
 * being the idle layer; what they were reaching for lives in DRILL ALLOYS now
 * (content/drillAlloys.ts), one bay-wide ability forged at the Forge.
 */
export interface DrillState {
  /** Per-drill upgrade level (chip power + a little speed). */
  level: number;
  /** Seconds accumulated toward the next strike. */
  timer: number;
  /** Last cell index this drill touched — the face draws the arm reaching. */
  lastCell: number;
  /** A name the player gave it. An individual, not "drill 3". */
  name?: string;
  /**
   * DRILL ALLOYS (A.54 one per drill → A.56 a list).
   *
   * Each entry is an ability id and the GRADE it was poured at (1..7 — the
   * deepest shell any material in the pour came from). Grade is stamped at the
   * pour and never moves: making a better one means pouring a better one.
   * Absent or empty = a bare machine, which mines perfectly well.
   */
  fits?: { id: string; grade: number; ch?: number; fired?: number }[];
  /** How many alloys this chassis holds. Absent = 1. Only a PRIZE drill has
   *  more, and that is most of what makes it a prize. */
  slots?: number;
  /** Where this drill came from, when it was not bought — the achievement, the
   *  skill node, the deed. Present = a prize chassis: bigger bite, drawn
   *  larger, more slots. */
  prize?: string;

  // ── ROUTING (A.56) ───────────────────────────────────────────────────────
  /** Cell indices this drill is allowed to work. Absent/empty = the whole face,
   *  which is what every drill did before routing existed. Remapped by
   *  COORDINATE when the face widens (`applyFieldSize`) — an index-copy would
   *  slide every painted cell one row over. */
  zone?: number[];
  /** What this machine would rather be doing. Absent = follow the bay-wide
   *  hunt switch, i.e. exactly the old behaviour. */
  priority?: 'both' | 'oresFirst' | 'ores' | 'rock';
  /**
   * HOW IT HUNTS (A.75). The third routing axis, and the honest remains of
   * §20.1's "head": A.52's heads were `power/speed/wear/draw` multipliers with a
   * targeting rule attached, and the targeting rule was the only part that was
   * a capability. So the rule ships and the multipliers do not.
   *
   * Absent = `fullest` = the greedy scorer every drill has always used, byte
   * for byte, so an untouched bay is unchanged.
   */
  behavior?: 'fullest' | 'sweep' | 'chain';
  /**
   * AUTOMATION t2 — THE FILTER. A fraction of cell cap below which this machine
   * will not take a cell: it WAITS instead of nibbling. Absent = 0 = takes
   * whatever is best, which is the old behaviour.
   *
   * It can only ever harvest LESS than no filter at all, which is what makes it
   * pillar-2 safe by construction — it is a bar, not a bonus. What it buys is
   * bite SHAPE (fewer, fuller strikes) and rock left standing for the hand.
   */
  minCharge?: number;

  // ── PER-ABILITY COUNTERS ─────────────────────────────────────────────────
  /** LONGLENS: strokes banked toward the big one. */
  hold?: number;
  /** CREEPVINE: how long the current crawl has run, in consecutive steps. */
  creepRun?: number;
  /** SEEDSET: strokes since the last seed took. */
  bloom?: number;
  /** AFFINITY: use-history per shell — a drill that worked a shell hits it
   *  harder. Invisible and automatic; nothing to manage. */
  use?: Record<string, number>;
  /** The pocket this drill has committed to, and how long it has been at it.
   *  A drill working an ore is doing nothing else — that time is what the
   *  player buys when they leave one to the machines instead of digging it. */
  oreCell?: number;
  oreProgress?: number;
}

// The Lattice removed A.7x (lattice/* cut).

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
}

// ---------------------------------------------------------------------------
// Verdance (Phase 7)
// ---------------------------------------------------------------------------





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
  /** WHAT IT HAS EATEN (A.49). One entry per relic fused in, newest last,
   *  capped — the reliquary renders these as notches cut into the object, so a
   *  much-fused relic LOOKS much-fused. `fusedFrom` still carries the count;
   *  this carries the character of each meal. */
  ate?: string[];
  /** POWER OVERRIDE (A.48). Normally absent: `powerOf` DERIVES the power from
   *  (uid, source, rarity), so every relic in every existing save already has
   *  one and nothing needed migrating. This field exists only for the case
   *  where a power has to move — a fusion carrying the fed relic's power onto
   *  a keeper that had none. */
  power?: string;
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
  /**
   * AUTO-SCRAP (A.49) — the standing order that stops the collection becoming
   * a two-hundred-item scroll again. It runs at the moment a relic ARRIVES,
   * before it is ever held, so the pile never grows past what the player
   * actually wants to look at.
   *
   * OFF by default and never retroactive: it can only ever refuse a NEW find,
   * so turning it on cannot eat anything already in the hold.
   */
  autoScrap: {
    on: boolean;
    /** Scrap anything at or below this rarity index (0 Common .. 4 Mythic). */
    maxRarity: number;
    /** Never scrap one that carries a power, whatever its rarity. */
    keepPowered: boolean;
  };
}

// Museum and Expeditions removed A.7x (museum.ts cut).

export interface RecursionState {
  count: number;
  /** Axioms OWNED (ids into AXIOMS) — permanent across Recursions. */
  axioms: string[];
  /** Lifetime Axiom currency awarded (the formula's high-water mark). */
  axiomsEarned: number;
  /** Twin Descent: the pace of the shell you left, snapshotted at Breach. */
  leftBehind: { chipCurrencyId: string; ratePerSec: Decimal } | null;
}

// The Guild removed A.7x (guild/* cut).

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
    /** Recent manual chips (cell + play-seconds), the trail FIGURES read. Tiny,
     *  self-expiring; a stale trail from a reloaded save just doesn't match. */
    recentChips: { cell: number; at: number }[];
    /** The last cell the PLAYER struck. Absent until they strike one. Read by
     *  the `handLed` proposition so a chaining machine can follow the hand. */
    lastHandCell?: number;
    /**
     * ORES — richer pockets in the rock, parallel to `cells`. `''` is plain
     * rock; anything else is an OreDef id. An ore raises that cell's CAP and
     * nothing else, so the pillar-2 ceiling cannot move (systems/ores.ts).
     */
    ore?: string[];
    /** Seconds of HAND work banked per cell. Persists if you let go. */
    oreDug?: number[];
    /** Seconds the face has been completely bare. Feeds the drought floor. */
    oreDryFor?: number;
    /** Ore types actually opened. The discovery record — nothing is listed
     *  before one has come out of the rock (pillar 5). Survives a Breach. */
    oreSeen?: string[];

    /**
     * COMPACTION, 0-26, parallel to `cells`. Every hand chip packs the cell it
     * lands on by one; at 8, 14 and 20 that cell starts rolling the deep-entry
     * drop tables. Wiped by the Collapse, so it is a run-length project.
     *
     * NOT income — it moves what DROPS, never how much charge the field grew,
     * so `dpsMax = W·H·regen·Y` cannot see it (pillar 2). A plain number array
     * on purpose: break_infinity is for currency, and this caps at 26.
     *
     * Created lazily and repaired on read (systems/compaction.ts), so a save
     * written before it existed needs no migration.
     */
    compaction?: number[];
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

  /**
   * THE READING (§10.1). Optional on the type because every save written before
   * A.76 has none, and `ensureReading` heals it at the engine's entry points —
   * the same self-healing pattern as `face.compaction`. The migration exists as
   * well; nothing depends on it having run.
   */
  reading?: import('./systems/reading').ReadingState;

  /** GEAR (A.77) — three slots, swapped only at a REST. Optional for the same
   *  reason `reading` is: every older save has none and `ensureGear` heals it. */
  gear?: import('./systems/gear').GearState;

  drills: {
    bayBuilt: boolean;
    units: DrillState[];
    /**
     * DRILL ALLOYS — abilities forged at the Forge. A.53 fitted one bay-wide;
     * A.54 moved the fitting onto the individual drill (`DrillState.alloy`), so
     * what lives here is only the KNOWLEDGE and the marks left on the rock.
     */
    /** Ability ids the player has actually made. The discovery record —
     *  nothing is shown before it has been forged once (pillar 5). Survives a
     *  Breach; the physical alloys in the drills do not. */
    alloys: string[];
    /**
     * SEND THEM AT THE POCKETS. One toggle for the whole bay, on by default so
     * an idle player gets ore value without ever opening this screen (pillar 1).
     * Turning it OFF is the real use: pockets are richer by hand, so a player
     * who wants them for themselves tells the machines to leave them alone.
     */
    huntOres?: boolean;
    /** Per-cell marks, parallel to face.cells, written by whichever drill
     *  carries the ability and read by ANY drill that comes to that cell.
     *  Created lazily, decayed on their own beat, resized with the face.
     *  PARASITE writes `rot` (rock that gives up a bigger share of what it
     *  holds); MAGMA BURST and MOLTEN CORE write `burn` (seconds the cell keeps
     *  giving on its own). Both decay on the one-second beat. */
    rot?: number[];
    burn?: number[];
    /** ECHO MINE: the cells the last ability cleared, so the shape can happen
     *  again somewhere else. Trimmed to 24 — a record, not a replay buffer. */
    lastShape?: number[];
  };

  depth: number;
  /** The CURRENT shell's record (kept in sync; UI convenience). */
  maxDepthRecord: number;
  /** Permanent per-shell records — survive every reset layer. */
  depthRecords: Record<string, number>;

  shell: ShellState;
  polarity: PolarityState;
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
  refraction: RefractionState;
  runes: RunesState;
  pressure: PressureState;
  hollow: HollowState;
  aleph: AlephState;
  recursion: RecursionState;
  /** The long tail (Phase 12). */
  spiral: SpiralState;
  relics: RelicsState;
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
  /**
   * `attempts` is a LIFETIME total and always has been — the denominator the
   * discovery analysis at refinery.ts:289 rests on. `attemptsRun` is the one
   * since the last Collapse. They were one number labelled "run", which showed
   * historical data as current for the whole life of the bench.
   */
  refinery: { found: string[]; attempts: number; attemptsRun?: number; refined: number };
  /** THE NEW FORGE (v36), step 2: the crucible, the rack of cast parts, the
   *  tool station, and the one tool you grow. Coexists with `forge` (the old
   *  head/haft/binding bench) until that one is deliberately retired. */
  casting: import("./systems/casting").CastingState;
  /** THE SHAFT (v17): the column as a place — go back up, rail that outlives
   *  Collapse, and a scar record of what happened where. */
  shaft: import("./systems/shaftSys").ShaftState;

  /** THE CONSIDERED HAND (v19): player-authored conveniences that must survive
   *  an export/import — handwritten notes are the worst thing to lose silently. */
  qol: QolState;

  /**
   * THE ROLL (§1). What each station is holding this run, and what the player
   * has permanently done to the road. Contents re-roll at every Collapse;
   * clearance and looting never do.
   */
  roll?: RollState;
  /** THE PLANT (§3): the Surge bank, machine tiers, and what Flow each machine
   *  actually got last tick. Flow CAPACITY is derived, never stored. */
  plant?: import('./systems/plant').PlantState;
  /** THE CIRCUIT (§7.3, §25.3): per-machine condition strips, and what they
   *  have been doing — fires per row, acts and flips per machine. */
  circuit?: import('./systems/circuit').CircuitState;
  /** THE STANDOFF (§27): the live fight, if there is one, plus the drill line
   *  chosen for the NEXT one — which is the only moment it can be chosen. */
  standoff?: import('./systems/standoff').StandoffState;
  /** THE ASSAY BENCH (§9.3) + THE ASSAY CALL (§40.3): fog burnt off the Roll,
   *  and which material the band favours this run. */
  assayBench?: import('./systems/assayBench').AssayBenchState;
  /** SHOP FORKS (§40.2): how many of each forked row's levels went PACKED. */
  shop?: import('./systems/shopFork').ShopState;
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
    /** Pockets opened, by hand or by machine. */
    oresOpened?: number;
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
    bookmarks: [], notes: {}, readAt: {},
    pins: [], refinePresets: [], autoCollapseDepth: null,
    carryUpgradeId: null, confirmSpendFrac: 0.5,
  };
}

// ---------------------------------------------------------------------------
// Events — engine-internal bus + a feed the UI drains for juice/toasts.
// ---------------------------------------------------------------------------

export type GameEvent =
  /** THE READING. A note is a first-and-only-time observation; a proposition is
   *  the sentence it eventually buys, and carries its rule so the toast can say
   *  what changed rather than that something did. */
  | { type: 'note'; id: string; text: string }
  | { type: 'proposition'; id: string; rule: string }
  | { type: 'chip'; cell: number; dust: Decimal; charge: number; crit: boolean; manual: boolean }
  | { type: 'fracture'; cells: number[] }
  /** A named station was passed for the first time — cleared, or looted. */
  | { type: 'stationReached'; id: string; depth: number }
  | { type: 'machineBuilt'; machineId: string; tier: number }
  | { type: 'crushed'; materialId: string; output: number; band: string; byproduct: number }
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
  | { type: 'vineHarvest'; cell: number; stage: number; dust: Decimal }
  | { type: 'vineRipe'; cell: number; dust: Decimal }
  /** THE FACE CLUSTER (v20): a FIGURE traced in the rock. `first` on discovery. */
  | { type: 'figure'; id: string; name: string; first: boolean }
  /** THE FACE CLUSTER (v21): a drill wore through and dropped to its floor. */
  /** IMPLEMENTS AND INSCRIPTION (v22). */
  | { type: 'bulkSalvaged'; count: number; units: number }
  | { type: 'runePracticed'; harmonic: number; dissonant: number }
  | { type: 'temporalFound'; id: string; name: string }
  | { type: 'runeFound'; runeId: string }
  | { type: 'pairDiscovered'; pair: string }
  | { type: 'inscribed'; target: string }
  | { type: 'inscriptionFailed'; target: string }
  | { type: 'overpressure'; secondsLeft: number }
  | { type: 'overpressureCleared' }
  | { type: 'chokeReleased'; reason: 'idle' | 'overpressure' }
  | { type: 'purged'; heat: number }
  | { type: 'flood'; depth: number }
  | { type: 'silenceHarvest'; stacks: number; voidGained: Decimal }
  | { type: 'cellRebuilt'; cell: number; total: number }
  | { type: 'faceWhole' }
  | { type: 'coreTouched' }
  | { type: 'recursion'; count: number; axiomsGained: number }
  // --- Phase 12: the long tail -------------------------------------------
  | { type: 'spiral'; count: number; spiralGained: number }
  | { type: 'relicFound'; relicId: string; rarity: string; source: string }
  | { type: 'relicWoke'; uid: number; step: number }
  | { type: 'resonanceFound'; id: string }
  | { type: 'drillAlloyFound'; id: string }
  /** THE ARC: a strike jumped from one cell to these. The face draws it. */
  /**
   * AN ABILITY FIRED (A.57). One event for all twenty-nine, because the engine
   * only knows "this happened, here, to these cells" — the renderer owns what
   * each `figure` looks like. `path` is ORDERED where order is the point (a
   * bolt travelling, a domino going off); `cells` is the set.
   */
  | {
      type: 'abilityFire'; id: string; figure: string; color: number;
      from: number; cells: number[]; path?: number[]; shake?: number; drill: number;
    }
  | { type: 'drillArc'; from: number; to: number[] }
  /** A.56 REACH family — halfmark / prismcut / slagburst / throughline /
   *  everywhen. One event for all five: the renderer draws a different figure
   *  per ability, but the engine only knows "this stroke also landed there". */
  | { type: 'drillReach'; from: number; to: number[] }
  /** LONGLENS is gathering. `at` is 0..1 toward the big bite. */
  | { type: 'drillHold'; drill: number; at: number }
  /** A drill arrived from somewhere that was not the shop. */
  | { type: 'prizeDrill'; source: string; name: string; slots: number }
  /** A legend arrived, poured in the best stone the Hold was holding. */
  | { type: 'legendaryPart'; legend: string; name: string; partType: string; materialId: string; line: string }
  | { type: 'legendaryRecast'; legend: string; name: string; materialId: string; cost: number }
  /** ORES: a pocket formed, opened, or the drought floor seeded the face. */
  | { type: 'oreAppeared'; cells: number[]; oreId: string }
  | { type: 'oreOpened'; cell: number; oreId: string; charge: number; by: 'hand' | 'drill'; first: boolean }
  | { type: 'oreDrought'; cells: number }
  | { type: 'relicFused'; relicId: string; rarity: string }
  | { type: 'confluenceFound'; id: string; name: string }
  | { type: 'techniqueUsed'; id: string; cell?: number }
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
  | { type: 'castMissed' }
  // --- THE NEW FORGE, step 2: casting and the tool station ---------------
  | { type: 'crucibleCharged'; materialId: string; units: number; molten: number }
  | { type: 'partCast'; partType: string; materialId: string; purity: number }
  | { type: 'toolBuilt'; coherence: number; rockRate: number }
  | { type: 'toolRepaired'; partType: string; materialId: string }
  | { type: 'partMelted'; partType: string; materialId: string; molten: number }
  | { type: 'toolLevelled'; level: number; slots: number }
  | { type: 'toolModFound'; id: string; name: string }
  | { type: 'toolModApplied'; id: string; name: string; stacks: number }
  /** The build turned out to BE something. Emergent, never chosen. */
  | { type: 'toolClassFound'; id: string; name: string }
  /** A living part has done enough work to become something. Offers a choice. */
  | { type: 'partReadyToGrow'; partType: string }
  | { type: 'partMatured'; partType: string; boon: string; name: string; stage: number }
  | { type: 'socketSet'; slot: number; kind: 'relic' | 'rune' | 'gem' }
  | { type: 'socketCleared'; slot: number; kind: 'relic' | 'rune' | 'gem' }
  | { type: 'toolModLevelled'; id: string; name: string; level: number }
  /** A pair on the tool turned out to be a third thing. Found, never listed. */
  | { type: 'synergyAwoke'; id: string; name: string }
  /** Instability got its way. `kind` is what went wrong, never a payout. */
  | { type: 'misfire'; id: string; name: string; kind: 'fizzle' | 'wild'; cell: number };

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
  | { type: 'buyUpgrade'; id: string; count?: number | 'max'; branch?: import('./systems/shopFork').Branch }
  | { type: 'setKilnFeeding'; feeding: boolean }
  | { type: 'upgradeDrill'; index: number }
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
  | { type: 'collapse'; fall?: CollapseType }
  /*
   * RETIRED A.70 — 'beginCraft' / 'craftStage' / 'delegateCraft' / 'abandonCraft'.
   *
   * These four drove the Workbench's staged craft job (carve / cut / cast), and
   * the Casting Floor does all three now: the crucible pours the part, the
   * station assembles the tool, and the rune wall and the gem bench took the two
   * jobs that were NOT about tools. With the Workbench stripped, nothing could
   * dispatch them — `reachability.test.ts` said so the moment the file was
   * deleted, which is exactly what that test exists for. Removed from the union
   * rather than left as an unreachable branch, so the compiler enforces it.
   */
  | { type: 'equipTool'; toolId: number }
  | { type: 'socketGem'; toolId: number; slot: number; gemId: string }
  /** RETIRED FROM THE UI (the Casting Floor makes tools now), still driven by
   *  the headless balance sim and by the Workbench's FORGE act. The old tool
   *  system is not retired — it owns strike power, sockets, heirlooms,
   *  opinions and tempering — only its bench is. */
  | { type: 'craftTool'; recipeId: string; refined?: boolean }
  | { type: 'craftFromParts'; tier: number; head: string; haft: string; binding: string }
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
  | { type: 'setBeamRow'; row: number }
  | { type: 'setMirror'; cell: number; kind: '/' | '\\' | null }
  | { type: 'buyMirror' }
  | { type: 'inscribe'; target: 'tool' | 'offhand' | 'lantern' | 'harness' | 'boots'; sequence: (string | null)[] }
  | { type: 'setChoke'; on: boolean }
  | { type: 'emergencyPurge' }
  | { type: 'layPipe'; cell: number }
  | { type: 'refine'; materialId: string; band: string }
  /** Walk every rung up to a target band in one act. Same cost, fewer taps. */
  | { type: 'refineTo'; materialId: string; band: string }
  | { type: 'recastLegendary'; legend: string; materialId: string }
  | { type: 'transmute'; a: string; b: string }
  | { type: 'salvageTool'; toolId: number; extract: boolean }
  | { type: 'temperTool'; temperId: string }
  | { type: 'listen' }
  | { type: 'setListenAt'; stacks: number }
  | { type: 'rebuildCell'; cell: number }
  | { type: 'touchCore' }
  | { type: 'recurse' }
  | { type: 'markSystemsSeen'; ids: string[] }
  | { type: 'setKilnReverse'; on: boolean }
  | { type: 'buyCoreNode'; id: string }
  | { type: 'buySkillNode'; id: string }
  | { type: 'respecSkills' }
  // --- Phase 12: the long tail -------------------------------------------
  | { type: 'spiral' }
  | { type: 'buyGridSlot' }
  | { type: 'buyLicence' }
  | { type: 'equipRelic'; uid: number; slot: number }
  | { type: 'unequipRelic'; slot: number }
  | { type: 'fuseRelics'; keepUid: number; feedUid: number }
  | { type: 'toggleRelicLock'; uid: number }
  | { type: 'renderRelic'; uid: number }
  | { type: 'setAutoScrap'; on?: boolean; maxRarity?: number; keepPowered?: boolean }
  | { type: 'hydrate'; state: GameState; nowMs: number }
  | { type: 'applyOffline'; seconds: number }
  | { type: 'dismissOffline' }
  | { type: 'markSaved'; nowMs: number }
  | { type: 'markExported' }
  | { type: 'hardReset' }
  | { type: 'undo' }
  | { type: 'setConfirmSpendFrac'; frac: number }
  | { type: 'togglePin'; materialId: string }
  | { type: 'setRefinePreset'; materialId: string; toBand: PurityBand | null }
  | { type: 'toggleRefinePreset'; materialId: string }
  | { type: 'setAutoCollapseDepth'; depth: number | null }
  | { type: 'setCarryUpgrade'; upgradeId: string | null }
  | { type: 'setBookmark'; entryId: string; on: boolean }
  | { type: 'setNote'; entryId: string; note: string }
  | { type: 'markRead'; entryId: string; sig: number }
  // --- THE FACE CLUSTER (v20) --------------------------------------------
  // --- THE FACE CLUSTER (v21) — Drill Bay -------------------------------
  | { type: 'renameDrill'; index: number; name: string }
  | {
      type: 'forgeDrillAlloy'; materialIds: string[]; drills: number[];
      /** A KNOWN ability to aim the pour at, when a rich mix would otherwise
       *  resolve to a deeper one (A.56). Never an undiscovered id. */
      prefer?: string | null;
      /** Which slot to fill on a multi-slot prize chassis. */
      slot?: number;
    }
  | { type: 'clearDrillAlloy'; index: number; slot?: number }
  /** MANUAL FIRE (A.57). Never required — auto-fire covers the idle player —
   *  and refused unless the meter is genuinely full, so it can never be
   *  clicked into a free extra firing. */
  | { type: 'fireAbility'; index: number; slot: number; cell?: number }
  /** ROUTING (A.56). An empty/absent `cells` clears the zone back to the whole
   *  face, which is the shape every drill ships with. */
  | { type: 'setDrillZone'; index: number; cells: number[] }
  | { type: 'setDrillPriority'; index: number; priority: 'both' | 'oresFirst' | 'ores' | 'rock' }
  /** THE READING: choose which question you are working. Null puts the desk down. */
  | { type: 'workProposition'; id: string | null }
  | { type: 'equipGear'; slot: 'lamp' | 'gloves' | 'boots'; id: string | null }
  | { type: 'setDrillBehaviour'; index: number; behavior: 'fullest' | 'sweep' | 'chain' }
  | { type: 'setDrillFilter'; index: number; minCharge: number }
  /** THE PLANT (§3, §15.4). A machine tier is built from cast parts, never
   *  bought with currency; a batch is fired by hand and costs Surge. */
  | { type: 'buildCrusher' }
  | { type: 'crush'; materialId: string; band: PurityBand }
  /** THE CIRCUIT (§7.3, §25.3). A null `row` deletes the row at `index`;
   *  `index === strip.length` appends. Four rows a strip, hard. */
  | {
      type: 'setCircuitRow';
      machine: import('./systems/circuit').MachineId;
      index: number;
      row: import('./systems/circuit').CircuitRow | null;
    }
  | {
      type: 'moveCircuitRow';
      machine: import('./systems/circuit').MachineId;
      index: number;
      to: number;
    }
  | { type: 'setDrillLine'; line: import('./systems/standoff').DrillLine }
  | { type: 'beginStandoff' }
  | { type: 'exchange'; stance: import('./systems/standoff').Stance }
  | { type: 'dismissStandoff' }
  | { type: 'beginSample'; stationId: string }
  | { type: 'buildAssayBench' }
  /** ORES: hand-work a pocket for `seconds`, and the bay-wide hunt toggle. */
  | { type: 'workOre'; cell: number; seconds: number }
  | { type: 'setHuntOres'; on: boolean }
  | { type: 'setKilnFuel'; fuelId: string | null }
  | { type: 'overstoke' }
  // --- IMPLEMENTS AND INSCRIPTION (v22) ---------------------------------
  | { type: 'bulkSalvage'; toolIds: number[]; extract: boolean }
  | { type: 'practiceRunes'; sequence: (string | null)[] }
  | { type: 'debug'; op: 'grant'; currency: string; amount: number }
  | { type: 'debug'; op: 'warp'; seconds: number }
  | { type: 'debug'; op: 'giveAll' }
  /** Dev hook: wipe worked rock without a full Collapse run. */
  | { type: 'debug'; op: 'resetCompaction' }
  /** UNLOCK EVERYTHING — every shell reached, every room open, every structure
   *  raised. A dev-build shortcut past the whole progression, so any system can
   *  be looked at without playing to it. */
  // --- THE NEW FORGE (v36): casting and the tool station ------------------
  | { type: 'chargeCrucible'; materialId: string; units: number }
  | { type: 'drainCrucible'; index?: number }
  /** Move a queued stone to the front, so the next pour is in that material. */
  | { type: 'bringToFront'; index: number }
  | { type: 'castPart'; partType: string; shape?: string; layers?: number }
  | { type: 'benchPlace'; partId: number }
  | { type: 'benchClear'; partType: string }
  | { type: 'buildTool' }
  | { type: 'breakDownTool' }
  /** Seat one of the abilities THIS BUILD grants in a slot, or empty it with
   *  `null`. Firing reuses `fireAbility` with `index: TOOL_CARRIER`. */
  | { type: 'setToolAbility'; slot: number; id: string | null }
  /** MODIFIERS: work materials into the tool. Which mix makes which modifier is
   *  hinted and never listed — the same grammar as an alloy pour. */
  | { type: 'applyToolMod'; materialIds: string[]; prefer?: string | null }
  | { type: 'stripToolMod'; id: string }
  /** Take one of the three things a matured living part offers. */
  | { type: 'matureLivingPart'; partType: string; boon: string }
  | { type: 'repairTool'; partType: string }
  /**
   * SET OR CLEAR ONE SOCKET. `fill: null` pulls out whatever is in the slot, so
   * one action covers both directions — socketing is reversible by the shape of
   * the verb rather than by a second one beside it.
   */
  | {
      type: 'setSocket';
      slot: number;
      fill: { kind: 'relic'; uid: number } | { kind: 'rune'; id: string } | { kind: 'gem'; id: string } | null;
    }
  | { type: 'meltBack'; partId: number }
  | { type: 'debug'; op: 'unlockAll' };

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
