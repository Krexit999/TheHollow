/**
 * Versioned migration chain. A save at version N passes through every
 * migration N -> N+1 -> ... -> SAVE_VERSION in order. Each migration receives
 * and returns the whole payload; state inside is `unknown` on purpose —
 * migrations are the one place allowed to poke at old shapes.
 *
 * To add one: bump SAVE_VERSION, add `MIGRATIONS[oldVersion] = (p) => {...}`.
 */
import type { SavePayload } from './codec';

export const SAVE_VERSION = 27;

export type Migration = (payload: SavePayload) => SavePayload;

/** Keyed by the version the migration upgrades FROM. */
/**
 * FROZEN snapshot of every tool recipe's input order at save v15. A migration
 * must not depend on live content — recipes could change — so the head/haft/
 * binding derivation for a legacy tool reads from here, not from TOOL_RECIPES.
 */
const RECIPE_INPUTS: Record<string, string[]> = {
  "marlsplitter": [
    "marl",
    "ochre"
  ],
  "gravewedge": [
    "bonechalk",
    "graveclay"
  ],
  "loamironPick": [
    "loamiron",
    "marl",
    "ochre"
  ],
  "duskcleaver": [
    "duskflint",
    "bonechalk",
    "graveclay"
  ],
  "rootglassRake": [
    "rootglass",
    "loamiron",
    "marl"
  ],
  "deepcutter": [
    "umberjade",
    "wormsteel",
    "loamiron"
  ],
  "wardenbreaker": [
    "hollowamber",
    "wormsteel",
    "duskflint"
  ],
  "lodestoneRake": [
    "lodestone",
    "bluesteel",
    "magnetile"
  ],
  "rimefang": [
    "rimeiron",
    "polarite",
    "nullsilver"
  ],
  "stormcaller": [
    "stormcore",
    "voltglass",
    "polarite"
  ],
  "verdantScythe": [
    "verdantine",
    "bloomsteel",
    "resinpearl"
  ],
  "bloomsteelMattock": [
    "bloomsteel",
    "feralglass",
    "springvein"
  ],
  "wildstarFalx": [
    "wildstar",
    "heartwood",
    "springvein"
  ],
  "prismpick": [
    "prismite",
    "coldspar",
    "beamiron"
  ],
  "lightwright": [
    "spectralite",
    "starlens",
    "beamiron"
  ],
  "meridianEdge": [
    "starlens",
    "sunglass",
    "spectrum"
  ],
  "slagbreaker": [
    "pyroclast",
    "cindersteel",
    "obsidianheart"
  ],
  "pyreheartPick": [
    "magmajade",
    "heartflame",
    "ventglass"
  ],
  "cinderMaul": [
    "heartflame",
    "coronaite",
    "pyrite"
  ],
  "delversPick": [
    "marl"
  ]
};

export const MIGRATIONS: Record<number, Migration> = {
  // v1 (Phase 1) -> v2 (Phase 2): the Lattice arrives. Old saves gain a
  // default (still-buried) board. defaultLatticeState is imported lazily to
  // keep this module dependency-light for tests.
  1: (p) => {
    const state = p.state as Record<string, unknown>;
    if (!state['lattice']) {
      state['lattice'] = {
        unlocked: false,
        rings: 1,
        cells: {},
        placeSeq: 0,
        passiveRank: 0,
        passiveProgressSec: 0,
        discovered: [],
        discoveredProgressions: [],
        activeChords: [],
        activeProgressions: [],
        doors: { ring4: false, progressions: false, press: false },
        pressOn: false,
        pressProgress: 0,
        // Plain number: the Decimal reviver has already run by migration
        // time; ensureState() coerces it on hydrate.
        chargeSeen: 0,
      };
    }
    return { ...p, version: 2, state };
  },
  // v2 (Phase 2) -> v3 (Phase 3): ore taxonomy, the Forge, the Assay Table.
  2: (p) => {
    const state = p.state as Record<string, unknown>;
    state['materials'] ??= { stacks: {}, gems: {}, geodes: 0, geodesCracked: 0, totalDrops: 0 };
    state['forge'] ??= {
      built: false,
      tools: [
        {
          id: 0, recipeId: 'delversPick', name: "Delver's Pick", tier: 1,
          purity: 50, chipPower: 1, strikePower: 3, sockets: [],
        },
      ],
      equipped: 0,
      nextId: 1,
    };
    state['assay'] ??= { active: null, boostChips: 0, surveysDone: 0, reportDepth: null, knownMaterials: [] };
    const stats = state['stats'] as Record<string, unknown> | undefined;
    if (stats) {
      stats['toolsForged'] ??= 0;
      stats['longestOfflineSec'] ??= 0;
    }
    return { ...p, version: 3, state };
  },
  // v3 (Phase 3) -> v4 (Phase 4): shells, signatures, polarity, the Crucible,
  // the Foundry, per-shell depth records.
  3: (p) => {
    const state = p.state as Record<string, unknown>;
    state['shell'] ??= {
      current: 'loam',
      breachCount: 0,
      coresEarnedThisBreach: 0,
      signatures: [],
      resonantMemory: 0,
    };
    state['polarity'] ??= {
      signs: [], chain: 0, lastSign: 0, lastChipAtSec: 0, bestChain: 0, magnets: [], magnetCount: 0,
    };
    state['crucible'] ??= {
      discovered: [], ranks: {}, purities: {}, pours: 0, fails: 0,
      passiveRank: 0, passiveProgressSec: 0, lastHint: null,
    };
    state['foundry'] ??= { slots: 3, installed: [] };
    state['depthRecords'] ??= { loam: (state['maxDepthRecord'] as number) ?? 0 };
    const forge = state['forge'] as { tools?: Array<Record<string, unknown>> } | undefined;
    for (const tool of forge?.tools ?? []) tool['alloys'] ??= [];
    return { ...p, version: 4, state };
  },
  // v4 (Phase 4) -> v5 (Phase 5): combat, the bestiary, gear slots.
  4: (p) => {
    const state = p.state as Record<string, unknown>;
    state['combat'] ??= {
      autoResolve: false,
      pending: null,
      active: null,
      kills: {},
      seen: [],
      wardens: [],
      stats: {
        encounters: 0, interruptions: 0, wins: 0, losses: 0,
        autoWins: 0, flees: 0, perfects: 0, lastSpawnAtSec: -1e9,
      },
    };
    const forge = state['forge'] as Record<string, unknown> | undefined;
    if (forge) forge['gear'] ??= { offhand: null, lantern: null, harness: null, boots: null };
    return { ...p, version: 5, state };
  },
  // v5 (Phase 5) -> v6 (Phase 6): the Guild — the Lamphouse, Sable's pages,
  // contracts, hirelings, the caravan, titles, warden-attempt ledger.
  5: (p) => {
    const state = p.state as Record<string, unknown>;
    state['guild'] ??= {
      discovered: false,
      clockMs: (p as unknown as { savedAtMs?: number }).savedAtMs ?? 0,
      gatesSeen: [],
      npcs: {},
      vess: { trust: 0, grudge: 0, deals: 0 },
      contracts: { board: [], slots: 3, completed: 0, seq: 1 },
      hirelings: {},
      berths: 1,
      caravan: { trades: 0 },
      titles: { earned: [], equipped: null },
      sable: { found: [], translated: [], read: [] },
      charterSpent: {},
      unlockedGear: [],
      stock: { window: -1, bought: {} },
      timers: {},
    };
    const combat = state['combat'] as Record<string, unknown> | undefined;
    if (combat) combat['wardenAttempts'] ??= {};
    return { ...p, version: 6, state };
  },
  // v6 (Phase 6) -> v7 (Phase 7): Verdance — Growth, the Greenhouse, the
  // Mycelium, the Loom, Brewing, Shell Weather.
  6: (p) => {
    const state = p.state as Record<string, unknown>;
    state['growth'] ??= { stage: [], fruit: [], age: [], fullSince: [], spreadTimer: 0, fruitHarvested: 0, autoDropped: 0 };
    state['weatherSeg'] ??= -1;
    state['greenhouse'] ??= { plots: [null, null, null, null], seeds: {}, codex: [], harvests: 0 };
    state['mycelium'] ??= { nodes: {}, reserve: 0, lastSpreadMs: 0 };
    state['brewing'] ??= { discovered: [], doses: {}, attempts: 0, fails: 0, lastHint: null, active: null, drunk: 0 };
    state['loom'] ??= {
      warp: [null, null, null, null, null, null],
      weft: [null, null, null, null, null, null],
      setWarp: [null, null, null, null, null, null],
      setWeft: [null, null, null, null, null, null],
      threads: {}, discoveredShapes: [], weaves: 0, passiveRank: 0, passiveProgressSec: 0,
    };
    const fight = (state['combat'] as Record<string, unknown> | undefined)?.['active'] as Record<string, unknown> | null | undefined;
    if (fight) fight['fruitLanes'] ??= [];
    return { ...p, version: 7, state };
  },
  // v7 (Phase 7) -> v8 (Phase 8): Glassmere — Refraction, the Observatory,
  // the Bench, the Warrens, Rune Inscription. Plus the macro-pass tranche-2
  // core nodes (no state needed) and the Deep Taper (formula only).
  7: (p) => {
    const state = p.state as Record<string, unknown>;
    state['refraction'] ??= { entryRow: 2, mirrors: {}, mirrorStock: 2, path: [], pathDirty: true, lastTraceSec: 0, beamHarvests: 0 };
    state['observatory'] ??= { active: null, completed: 0, pieces: {}, constellations: [] };
    state['bench'] ??= { solved: [], equippedLens: null, nextGenSeed: 1, passiveRank: 0, passiveProgressSec: 0 };
    state['warrens'] ??= { active: null, cleared: {}, uniques: [], gearUnlocked: [] };
    state['runes'] ??= {
      found: {},
      inscriptions: { tool: [null, null, null], offhand: [null, null, null], lantern: [null, null, null], harness: [null, null, null], boots: [null, null, null] },
      fouled: {}, pairsSeen: [],
    };
    return { ...p, version: 8, state };
  },
  // v8 (Phase 8) -> v9 (Phase 9): Cinder — Pressure (heat, the Vent Network,
  // the flood ledger), the Ember Array, Magma Wells, Anomalies, crew recall,
  // hireling hire-timestamps (existing crew backfill to 0 = eldest).
  8: (p) => {
    const state = p.state as Record<string, unknown>;
    state['pressure'] ??= {
      heat: 0, choke: false, overpressureAtSec: null, fuseAtSec: null, lastStokeSec: -9999,
      drillHeatPending: 0, pipes: new Array(35).fill(0),
      ventedTotal: 0, floods: 0, overpressures: 0, peakHeat: 0,
    };
    state['ember'] ??= {
      grid: new Array(36).fill(null), burn: new Array(36).fill(0),
      temp: 0, sustainSec: 0, bestSustainSec: 0, savedLayout: new Array(36).fill(null),
      overdrive: false, fuelOwned: {}, passiveRank: 0, passiveProgressSec: 0,
    };
    state['wells'] ??= { active: [], rolls: 0, wins: 0, losses: 0, totalCommitted: 0, totalReturned: 0 };
    state['anomalies'] ??= { nextAtPlaySec: 0, active: null, seen: 0, resolved: 0, merchantMeets: 0 };
    const guild = state['guild'] as Record<string, unknown> | undefined;
    if (guild) {
      guild['crewRecalled'] ??= false;
      const crew = guild['hirelings'] as Record<string, Record<string, unknown>> | undefined;
      if (crew) for (const h of Object.values(crew)) h['hiredAtMs'] ??= 0;
    }
    return { ...p, version: 9, state };
  },
  // v9 (Phase 9) -> v10 (Phase 10): the Hollow, Aleph, Recursion, Axioms.
  9: (p) => {
    const state = p.state as Record<string, unknown>;
    state['hollow'] ??= { silence: 0, listenAt: 0, silenceHarvested: 0, rebuilt: [], voidSpent: '0' };
    state['chamber'] ??= {
      tape: [], recording: false, running: false, cursor: 0, stepTimer: 0,
      trace: [], bestEfficiency: 0, loops: 0, passiveRank: 0, passiveProgressSec: 0,
    };
    state['aleph'] ??= { sigils: 0, coreTouched: false };
    state['recursion'] ??= { count: 0, axioms: [], axiomsEarned: 0, leftBehind: null };
    const bench = state['bench'] as Record<string, unknown> | undefined;
    if (bench) bench['equippedLens2'] ??= null;
    return { ...p, version: 10, state };
  },
  // v10 (Phase 10) -> v11 (Phase 11): the UI legibility pass. One save field:
  // seenSystems, so the "something opened" disclosure fires once per system
  // and survives export/import. Left empty; the UI silently backfills an
  // existing (non-fresh) save on first load so the gate doesn't fire for all.
  10: (p) => {
    const state = p.state as Record<string, unknown>;
    state['seenSystems'] ??= [];
    return { ...p, version: 11, state };
  },
  // v11 (Phase 11) -> v12 (Phase 12): the long tail. Four new slices, all
  // empty on an existing save — a returning player has done no Spiral, holds
  // no relics, has donated nothing and has no crews out, which is exactly what
  // these defaults say.
  11: (p) => {
    const state = p.state as Record<string, unknown>;
    state['spiral'] ??= {
      count: 0, earned: 0, slots: 0, licences: 0, grid: {}, modules: [],
      challengeDone: [], activeChallenge: null, shells: [], inHand: null,
    };
    state['relics'] ??= { held: [], equipped: [], nextUid: 1, found: 0, fused: 0, floorBonus: 0 };
    state['museum'] ??= { donated: {}, completed: [] };
    state['expeditions'] ??= { active: [], ready: [], completed: 0 };
    return { ...p, version: 12, state };
  },

  // v13 — CONFLUENCES. Which cross-system combinations the player has FOUND is
  // a record of play, so it belongs in the save beside the other Codex lists,
  // not in localStorage. An established save starts with none found and
  // re-discovers them the moment its conditions happen to hold, which is
  // correct: the confluence was always true, nobody had written it down.
  12: (p) => {
    const state = p.state as Record<string, unknown>;
    state['confluences'] ??= { found: [] };
    return { ...p, version: 13, state };
  },

  // v14 — THE REFINERY. Found transmutation chains are a Codex list, so they
  // live in the save. An established player starts with none found: the chains
  // were always true, nobody had run the reaction.
  13: (p) => {
    const state = p.state as Record<string, unknown>;
    state['refinery'] ??= { found: [], attempts: 0, refined: 0 };
    // The Forge gains a salvage counter; an established save has broken none.
    const forge = state['forge'] as Record<string, unknown> | undefined;
    if (forge && forge['salvaged'] === undefined) forge['salvaged'] = 0;
    if (forge && forge['tempersUsed'] === undefined) forge['tempersUsed'] = [];
    return { ...p, version: 14, state };
  },

  // v15 — TOOLS FROM PARTS. Every existing tool gets a composition derived from
  // its historical recipe, so NOTHING is lost — not a named tool, not an
  // inscribed one, and above all not an heirloom carried through a Recursion.
  // A tool keeps its stored chip/strike; parts are added alongside, and a
  // re-forge or a part swap recomputes from them going forward.
  14: (p) => {
    const state = p.state as Record<string, unknown>;
    const forge = state['forge'] as Record<string, unknown> | undefined;
    if (forge) {
      if (forge['pairsFound'] === undefined) forge['pairsFound'] = [];
      const tools = forge['tools'] as Array<Record<string, unknown>> | undefined;
      for (const t of tools ?? []) {
        if (t['parts']) continue;
        // Prefer the recipe's real inputs; fall back to the tool's own material
        // (the starter pick) or Marl so a part is never empty.
        const recipe = RECIPE_INPUTS[t['recipeId'] as string];
        const ids = recipe ?? ['marl'];
        const purity = typeof t['purity'] === 'number' ? t['purity'] : 50;
        t['parts'] = {
          head: { materialId: ids[0] ?? 'marl', purity },
          haft: { materialId: ids[1] ?? ids[0] ?? 'marl', purity },
          binding: { materialId: ids[2] ?? ids[1] ?? ids[0] ?? 'marl', purity },
        };
      }
    }
    return { ...p, version: 15, state };
  },

  // v16 — THE WORKBENCH. Crafting became a process; the bench keeps its job,
  // its practice counts, learned gem cuts and discovered casts. An established
  // save has an empty bench and no job in progress. Existing tools have no
  // recorded craftsmanship and read as 1.0 (the quick-path baseline), so
  // nothing changes for a tool already made — no silent buff, no nerf.
  15: (p) => {
    const state = p.state as Record<string, unknown>;
    state['workbench'] ??= {
      job: null,
      done: { forge: 0, carve: 0, cut: 0, cast: 0 },
      bestQuality: { forge: 0, carve: 0, cut: 0, cast: 0 },
      gemCuts: {},
      castsFound: [],
    };
    return { ...p, version: 16, state };
  },

  // v17 — THE SHAFT. The column became a place: `reached` is the deepest point
  // of the current run (seed it from the live depth so an in-progress run does
  // not suddenly re-charge for cleared rock), the RAIL starts unlaid, and the
  // scar record starts empty. No rail means descent behaves exactly as before,
  // so an established save is unchanged until the player lays the first track.
  16: (p) => {
    const state = p.state as Record<string, unknown>;
    const depth = typeof state['depth'] === 'number' ? (state['depth'] as number) : 0;
    state['shaft'] ??= { reached: depth, rail: {}, scars: [] };
    return { ...p, version: 17, state };
  },

  // v18 — THE COLUMN IS A PLACE. Caches (storage that outlives the Collapse),
  // curing (time as an ingredient), lifts (a car on the rail), and excavations
  // (things too big to chip, cleared a shift per visit). An established save has
  // none of it — no caches, no lift, an empty cure Codex, no dig started — so the
  // Shaft behaves exactly as it did until the player sinks the first cache.
  17: (p) => {
    const state = p.state as Record<string, unknown>;
    const shaft = (state['shaft'] ??= {}) as Record<string, unknown>;
    shaft['caches'] ??= [];
    shaft['lift'] ??= {};
    shaft['curesFound'] ??= [];
    shaft['digs'] ??= {};
    shaft['lastDigDepth'] ??= -1;
    return { ...p, version: 18, state };
  },

  // v19 — THE CONSIDERED HAND. Player-authored conveniences move INTO the save
  // (the Phase-11 seenSystems lesson: a handwritten note lost silently on an
  // export/import restore is the worst thing to lose). An established save starts
  // with none of them — empty bookmarks/notes/blueprints/layouts/pins/presets and
  // auto-collapse off — so nothing changes until the player authors something.
  18: (p) => {
    const state = p.state as Record<string, unknown>;
    state['qol'] ??= {
      bookmarks: [], notes: {}, readAt: {}, blueprints: [], latticeLayouts: [],
      lockedChords: [], pins: [], refinePresets: [], autoCollapseDepth: null,
      carryUpgradeId: null, confirmSpendFrac: 0.5,
    };
    // The run-summary ledger joins the collapse slice; an established save has
    // no prior run recorded and clocks its first duration from here.
    const collapse = state['collapse'] as Record<string, unknown> | undefined;
    if (collapse) {
      collapse['lastRun'] ??= null;
      collapse['runStartAt'] ??= 0;
    }
    return { ...p, version: 19, state };
  },

  // v20 — THE FACE CLUSTER. The Face gains marks (cells drills route around),
  // sweep stamina (the one new tracked value, starts full), a chip trail (empty),
  // and a FIGURES Codex (empty). An established save gets full stamina and no
  // marks/figures, so the Face behaves exactly as before until the player tags a
  // cell, sweeps, or traces a shape.
  19: (p) => {
    const state = p.state as Record<string, unknown>;
    const face = (state['face'] ??= {}) as Record<string, unknown>;
    face['marks'] ??= [];
    face['stamina'] ??= 100;
    face['staminaMax'] ??= 100;
    face['recentChips'] ??= [];
    state['figures'] ??= { found: [] };
    return { ...p, version: 20, state };
  },

  // v21 — THE FACE CLUSTER, the implements that learn. Tools and drills gain a
  // per-shell use-history (AFFINITY), and drills become individuals with names and
  // WEAR. Everything defaults empty/neutral: existing tools/drills keep no history
  // (so no affinity bonus yet), start unworn, and behave exactly as before until
  // they log some use.
  20: (p) => {
    const state = p.state as Record<string, unknown>;
    const forge = state['forge'] as { tools?: Array<Record<string, unknown>> } | undefined;
    if (forge?.tools) for (const t of forge.tools) t['use'] ??= {};
    const drills = state['drills'] as { units?: Array<Record<string, unknown>> } | undefined;
    if (drills?.units) {
      drills.units.forEach((u, i) => {
        u['use'] ??= {};
        u['wear'] ??= 0;
        if (u['name'] === undefined) u['name'] = DEFAULT_DRILL_NAMES[i] ?? `Drill ${i + 1}`;
      });
    }
    return { ...p, version: 21, state };
  },

  // v22 — IMPLEMENTS AND INSCRIPTION. Tools gain OPINIONS (from the same affinity
  // history, no new stat) and a HISTORY of what they did; the equipped tool tracks
  // when it was picked up so it can settle in. Everything defaults so an established
  // save is fully settled (equippedAt 0 → long ago → no sulking) and carries no
  // marks yet. Also seeds the rune PRACTICE log and TEMPORAL carve trail (empty).
  21: (p) => {
    const state = p.state as Record<string, unknown>;
    const forge = (state['forge'] ??= {}) as Record<string, unknown>;
    forge['equippedAt'] ??= 0;
    const tools = forge['tools'] as Array<Record<string, unknown>> | undefined;
    if (tools) for (const t of tools) t['history'] ??= [];
    const runes = (state['runes'] ??= {}) as Record<string, unknown>;
    runes['practiced'] ??= { harmonic: 0, dissonant: 0 };
    runes['carveTrail'] ??= [];
    runes['temporalFound'] ??= [];
    runes['castKinds'] ??= {};
    const mats = (state['materials'] ??= {}) as Record<string, unknown>;
    mats['gemFused'] ??= 0;
    return { ...p, version: 22, state };
  },

  // v22 -> v23 — THE EXPORT SPINE (Part B). The spine gates infrastructure on
  // exports; a save that already BUILT that infrastructure under the old rules
  // keeps every stick of it. Grandfathering reads the evidence in the save:
  //   - greenhouse beds beyond the free four  -> that many frames, granted
  //   - a loom that has ever committed a weave -> already iron-framed
  //   - fuel standing in a deeper Array row    -> that many sockets, granted
  22: (p) => {
    const state = p.state as Record<string, unknown>;
    const greenhouse = (state['greenhouse'] ??= {}) as Record<string, unknown>;
    const plots = greenhouse['plots'] as unknown[] | undefined;
    greenhouse['frames'] ??= Math.max(0, (plots?.length ?? 4) - 4);
    const loom = (state['loom'] ??= {}) as Record<string, unknown>;
    loom['framed'] ??= ((loom['weaves'] as number) ?? 0) > 0
      || (((loom['discoveredShapes'] as unknown[]) ?? []).length > 0);
    const ember = (state['ember'] ??= {}) as Record<string, unknown>;
    if (ember['sockets'] === undefined) {
      let deepestRow = 0;
      for (const key of ['grid', 'savedLayout'] as const) {
        const cells = ember[key] as unknown[] | undefined;
        if (!cells) continue;
        for (let i = 0; i < cells.length; i++) {
          if (cells[i] != null) deepestRow = Math.max(deepestRow, Math.floor(i / 6));
        }
      }
      ember['sockets'] = deepestRow;
    }
    ember['annealSec'] ??= 0;
    return { ...p, version: 23, state };
  },

  // v23 -> v24 — THE SETTLING (A.42). An idle-only, depth-scaling erosion of
  // the descend price; see systems/settle.ts. An existing save starts with an
  // empty bank and a chip watermark it will re-sync on the first tick, so the
  // aid begins working the moment the player next leaves the face alone.
  23: (p) => {
    const state = p.state as Record<string, unknown>;
    const shaft = (state['shaft'] ??= {}) as Record<string, unknown>;
    shaft['settle'] ??= 0;
    shaft['settleChips'] ??= 0;
    shaft['settleQuietSec'] ??= 0;
    return { ...p, version: 24, state };
  },

  // v24 -> v25 — the pillar-2 numerator (`stats.fieldChargeHarvested`).
  // CHARGE taken by the field, apart from every purse and every multiplier. An existing save
  // starts it at 0 rather than back-filling: the stat is a rate instrument
  // read over windows, and a fabricated lifetime total would be worse than an
  // honest zero that starts counting now.
  24: (p) => {
    const state = p.state as Record<string, unknown>;
    const stats = (state['stats'] ??= {}) as Record<string, unknown>;
    stats['fieldChargeHarvested'] ??= 0;
    return { ...p, version: 25, state };
  },

  // v25 -> v26 — the column's traces (A.45). A mark per Collapse so the shaft
  // reads as one you dug. An existing save starts EMPTY rather than
  // back-filling from collapse.count: the marks carry a depth and a fall type
  // that were never recorded, and inventing forty of them would put a
  // fabricated history in front of the player as if it were their own.
  25: (p) => {
    const state = p.state as Record<string, unknown>;
    const collapse = (state['collapse'] ??= {}) as Record<string, unknown>;
    collapse['traces'] ??= [];
    return { ...p, version: 26, state };
  },

  // v26 -> v27 — relic shards and found resonances (A.46). Both start EMPTY.
  // Relics already held get no  record either: the game did not keep
  // where they came from, and back-filling a plausible depth would be putting
  // an invented memory in front of the player as if it were theirs. They are
  // simply relics without a story, which is the truth about them.
  // v26 -> v27 — relic shards and found resonances (A.46). Both start EMPTY,
  // and relics already held get no `found` record: the game never kept where
  // they came from, and back-filling a plausible depth would put an invented
  // memory in front of the player as if it were their own. They are relics
  // without a story, which is the truth about them.
  26: (p) => {
    const state = p.state as Record<string, unknown>;
    const relics = (state['relics'] ??= {}) as Record<string, unknown>;
    relics['shards'] ??= 0;
    relics['resonancesFound'] ??= [];
    return { ...p, version: 27, state };
  },
};

// Kept here (not imported from drills.ts) so the migration stays a pure data
// transform with no engine dependency — same names the live code assigns.
const DEFAULT_DRILL_NAMES = ['Bess', 'Old Tom', 'The Mole', 'Gnash', 'Patience', 'Grinder', 'Sunday', 'Whistler', 'The Badger', 'Nib', 'Molly', 'Crib', 'Digby', 'The Ferret', 'Auntie', 'Rasp', 'Cinders', 'The Terrier', 'Nub', 'Gravel', 'The Toad', 'Pip', 'Quarry', 'Muncher'];

export function runMigrations(payload: SavePayload, chain: Record<number, Migration> = MIGRATIONS): SavePayload {
  let current = payload;
  let guard = 0;
  while (current.version < SAVE_VERSION) {
    const migrate = chain[current.version];
    if (!migrate) {
      throw new Error(`No migration from save version ${current.version}`);
    }
    const next = migrate(current);
    if (next.version <= current.version) {
      throw new Error(`Migration from ${current.version} did not advance the version`);
    }
    current = next;
    if (++guard > 1000) throw new Error('Migration chain did not terminate');
  }
  if (current.version > SAVE_VERSION) {
    throw new Error(`Save is from a newer build (v${current.version} > v${SAVE_VERSION})`);
  }
  return current;
}
