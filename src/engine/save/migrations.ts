/**
 * Versioned migration chain. A save at version N passes through every
 * migration N -> N+1 -> ... -> SAVE_VERSION in order. Each migration receives
 * and returns the whole payload; state inside is `unknown` on purpose —
 * migrations are the one place allowed to poke at old shapes.
 *
 * To add one: bump SAVE_VERSION, add `MIGRATIONS[oldVersion] = (p) => {...}`.
 */
import type { SavePayload } from './codec';

export const SAVE_VERSION = 43;

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

  // v27 -> v28 — the halls keep the relics they are given (A.47), and the
  // exhibits they form. Both start EMPTY: donating used to DELETE the relic,
  // so a save from before this genuinely has no instances to recover — the
  // cases remember their counts, and the pieces standing in them have no
  // stories because those stories were thrown away at the time. Reconstructing
  // plausible ones would be inventing a museum.
  27: (p) => {
    const state = p.state as Record<string, unknown>;
    const museum = (state['museum'] ??= {}) as Record<string, unknown>;
    museum['pieces'] ??= [];
    museum['exhibitsFound'] ??= [];
    return { ...p, version: 28, state };
  },

  // v28 -> v29 — THE GALLERY SHOWS WHAT YOU OWN (A.49). Donation, identify and
  // move are gone, so every relic standing on a plinth comes HOME: the hold
  // gets bigger and nothing is taken. `donated` and `pieces` are dropped after
  // the relics are recovered from them.
  //
  // `completed` is KEPT exactly as it stands. It is monotonic by design now,
  // and a player who filled halls the old way has filled them.
  28: (p) => {
    const state = p.state as Record<string, unknown>;
    const museum = (state['museum'] ??= {}) as Record<string, unknown>;
    const relics = (state['relics'] ??= {}) as Record<string, unknown>;
    const held = (relics['held'] ??= []) as Array<Record<string, unknown>>;
    const pieces = (museum['pieces'] ?? []) as Array<{ relic?: Record<string, unknown> }>;
    let nextUid = Number(relics['nextUid'] ?? 1);
    for (const piece of pieces) {
      if (!piece?.relic) continue;
      // A donated relic kept its uid, but a hold that has moved on since may
      // have reissued it — re-stamp so two relics can never share one.
      held.push({ ...piece.relic, uid: nextUid });
      nextUid += 1;
    }
    relics['nextUid'] = nextUid;
    delete museum['pieces'];
    delete museum['donated'];
    museum['completed'] ??= [];
    museum['exhibitsFound'] ??= [];
    // AUTO-SCRAP (A.49) starts OFF, so a load can never eat anything.
    relics['autoScrap'] ??= { on: false, maxRarity: 0, keepPowered: true };
    return { ...p, version: 29, state };
  },

  // v29 -> v30 — THE BAY IS A BUDGET (A.52). An existing bay keeps every
  // chassis it has; it simply now draws on a feed it has bought none of.
  //
  // WHICH WOULD BROWN IT OUT ON LOAD, so the feed is seeded to cover what the
  // player already built: a save's drills are grandfathered to a supply level
  // that leaves them at full power. Nobody loses output for having played
  // before this existed — the puzzle starts from where they are, not below it.
  29: (p) => {
    const state = p.state as Record<string, unknown>;
    const drills = (state['drills'] ??= {}) as Record<string, unknown>;
    const units = (drills['units'] ?? []) as Array<Record<string, unknown>>;
    // The pre-A.52 draw of an existing bay: one per chassis plus its levels and
    // whatever bit it carries. Rounded UP into feed levels (3 each, base 6).
    let draw = 0;
    for (const u of units) {
      const level = Number(u['level'] ?? 0);
      draw += 1.35 * (1 + 0.05 * level); // a generous stand-in for head x bit
    }
    drills['supply'] ??= Math.max(0, Math.ceil((draw - 6) / 3));
    drills['synergiesFound'] ??= [];
    return { ...p, version: 30, state };
  },

  // v30 -> v31 — THE BAY GOES BACK TO BEING FURNITURE (A.53). Every knob the
  // configuration layer added is stripped from each chassis, and the bay-wide
  // bookkeeping goes with it. What a player had that MATTERED — the chassis
  // themselves and their levels — is untouched, so nobody loses a drill.
  //
  // Nothing is granted in exchange: drill alloys are DISCOVERED, and handing
  // an existing save a free ability would spend the discovery on its behalf.
  30: (p) => {
    const state = p.state as Record<string, unknown>;
    const drills = (state['drills'] ??= {}) as Record<string, unknown>;
    for (const u of (drills['units'] ?? []) as Array<Record<string, unknown>>) {
      delete u['head'];
      delete u['bit'];
      delete u['wear'];
      delete u['behavior'];
    }
    delete drills['supply'];
    delete drills['synergiesFound'];
    delete drills['seam'];
    drills['alloys'] ??= [];
    drills['equipped'] ??= null;
    return { ...p, version: 31, state };
  },

  // v31 -> v32 — ONE ALLOY PER DRILL (A.54).
  //
  // A.53 fitted a single alloy bay-wide (`drills.equipped`); the fitting now
  // lives on the individual machine. A save that had one running gets it
  // copied onto EVERY drill, so nothing a player had stops working the moment
  // they load — they end up exactly where they were, with the new freedom to
  // pull it out of some of them.
  //
  // The knowledge list is untouched, and no drill that was bare becomes
  // alloyed. Re-fitting costs a pour now, so silently handing out extra
  // abilities here would be giving away the thing the phase just priced.
  31: (p) => {
    const state = p.state as Record<string, unknown>;
    const drills = (state['drills'] ??= {}) as Record<string, unknown>;
    const wasFitted = drills['equipped'];
    if (typeof wasFitted === 'string') {
      for (const u of (drills['units'] ?? []) as Array<Record<string, unknown>>) {
        u['alloy'] = wasFitted;
      }
    }
    delete drills['equipped'];
    return { ...p, version: 32, state };
  },

  // v32 -> v33 — ORES IN THE GRID.
  //
  // The face gains its pocket arrays and the bay gains the hunt toggle. Nothing
  // is seeded here: the drought floor puts ore in the rock within a minute of
  // loading, which is a better first impression than a save that opens with a
  // grid already full of timers the player never saw form.
  //
  // `huntOres` defaults ON so an existing bay starts harvesting pockets without
  // the player having to find a switch they have never been told about.
  32: (p) => {
    const state = p.state as Record<string, unknown>;
    const face = (state['face'] ??= {}) as Record<string, unknown>;
    const cells = (face['cells'] ?? []) as unknown[];
    face['ore'] ??= new Array(cells.length).fill('');
    face['oreDug'] ??= new Array(cells.length).fill(0);
    face['oreDryFor'] ??= 0;
    face['oreSeen'] ??= [];
    const drills = (state['drills'] ??= {}) as Record<string, unknown>;
    drills['huntOres'] ??= true;
    return { ...p, version: 33, state };
  },

  // v33 -> v34 — THE POOL GROWS AND DEEPENS, AND A DRILL IS A DECISION (A.56).
  //
  // Three shape changes, and the rule for all three is that a loaded save must
  // land where it already was:
  //
  //  1  `alloy: string` becomes `fits: [{ id, grade }]`. Everything already
  //     poured is stamped GRADE 1 — the ability's own shell ordinal is applied
  //     by `gradeStep`, so a Loam alloy at grade 1 is step 0 and behaves
  //     EXACTLY as it did before this migration existed. Nothing gets stronger
  //     for free and nothing gets weaker.
  //  2  Slots. Every existing chassis was bought, so every one gets one slot,
  //     which is the default anyway. Prize drills are granted forward by the
  //     one-second check, not backfilled here.
  //  3  The drillCount row is re-priced 1.25 -> 1.75 and its cap 23 -> 15. A
  //     save holding MORE than 16 bought drills KEEPS THEM. The level is left
  //     alone rather than clamped: `maxLevel` only gates further purchases, the
  //     units array is what the bay reads, and taking machines off somebody
  //     because a price curve changed would be the worst kind of migration.
  33: (p) => {
    const state = p.state as Record<string, unknown>;
    const drills = (state['drills'] ??= {}) as Record<string, unknown>;
    for (const u of (drills['units'] ?? []) as Array<Record<string, unknown>>) {
      const had = u['alloy'];
      if (typeof had === 'string' && had) u['fits'] = [{ id: had, grade: 1 }];
      delete u['alloy'];
      u['slots'] ??= 1;
    }
    drills['burn'] ??= [];
    return { ...p, version: 34, state };
  },

  // v34 -> v35 — THE ABILITY SET IS REPLACED (A.57).
  //
  // All fifteen A.53/A.56 abilities are gone and twenty-nine new ones stand in
  // their place. Nothing about a save's MACHINES changes — every drill, level,
  // name, prize, zone and priority survives untouched. What cannot survive is a
  // fitted ability whose id no longer exists.
  //
  // THREE OF THEM MAP CLEANLY, and those are mapped rather than dropped,
  // because they are the three a real save is overwhelmingly likely to hold:
  //   arcvein  -> chainbreaker  (a strike that jumps onward, and keeps going)
  //   lodecall -> veinminer     (the ore-seeking one)
  //   emberset -> heavystrike   (the one that hits harder than it should)
  // All three successors are LOAM, so a Loam save is not handed something from
  // a world it has never seen.
  //
  // The other twelve are dropped from `fits` and from the discovery record.
  // That is a real loss and it is deliberate: leaving an id in `alloys` that
  // no def answers to would put a permanent blank row in the codex, and the
  // A.53 marks arrays (`residue`/`richness`) describe rules nothing reads any
  // more. Re-pouring is a bench visit; a corrupt codex is forever.
  34: (p) => {
    const state = p.state as Record<string, unknown>;
    const drills = (state['drills'] ??= {}) as Record<string, unknown>;
    const MAP: Record<string, string> = {
      arcvein: 'chainbreaker', lodecall: 'veinminer', emberset: 'heavystrike',
    };
    const LIVE = new Set([
      'veinminer', 'slagburst', 'chainbreaker', 'tunnelbore', 'heavystrike',
      'arclightning', 'magneticpull', 'staticoverload', 'repulsor',
      'rootbreaker', 'bloomharvest', 'seedspread', 'parasite',
      'prismshot', 'ricochet', 'refraction', 'overchargebeam',
      'magmaburst', 'heatwave', 'pressureblast', 'moltencore',
      'voidconsumption', 'realityskip', 'echomine', 'nullpulse',
      'cataclysm', 'cascade', 'singularity', 'genesis',
    ]);
    const carry = (id: unknown): string | null => {
      if (typeof id !== 'string') return null;
      const next = MAP[id] ?? id;
      return LIVE.has(next) ? next : null;
    };
    for (const u of (drills['units'] ?? []) as Array<Record<string, unknown>>) {
      const fits = (u['fits'] ?? []) as Array<Record<string, unknown>>;
      const kept: Array<Record<string, unknown>> = [];
      for (const f of fits) {
        const id = carry(f['id']);
        // `ch` starts at 0: a migrated ability arrives uncharged rather than
        // firing the instant the save loads, which would be a jump-scare.
        if (id) kept.push({ id, grade: f['grade'] ?? 1, ch: 0 });
      }
      if (kept.length > 0) u['fits'] = kept; else delete u['fits'];
    }
    const known = (drills['alloys'] ?? []) as unknown[];
    drills['alloys'] = [...new Set(known.map(carry).filter(Boolean))];
    delete drills['residue'];
    delete drills['richness'];
    drills['rot'] ??= [];
    return { ...p, version: 35, state };
  },

  /**
   * v36 — THE NEW FORGE, step 2. A purely ADDITIVE slice: the crucible, the
   * rack, the station and the tool. Nothing existing is touched, and the old
   * `forge` (head/haft/binding) keeps every tool it holds — the two benches
   * coexist until the old one is deliberately retired.
   *
   * `ensureStateShape` would seed this on its own at hydrate; it is written out
   * anyway because a migration that says what it added is the record of WHEN
   * the slice appeared, and the shape net is a safety floor rather than the
   * place a new system is declared.
   */
  35: (p) => {
    const state = p.state as Record<string, unknown>;
    state['casting'] ??= {
      rack: [], bench: {}, tool: [],
      crucible: { materialId: '', solid: 0, molten: 0, purity: 0 },
      nextId: 1, cast: 0, built: 0, wear: 0, repairs: 0,
    };
    return { ...p, version: 36, state };
  },

  /**
   * v37 — THE NEW FORGE, step 3. The tool meets the rock and starts wearing.
   * A save from v36 has a tool but no pool behind it; it arrives FRESH rather
   * than at some notional accumulated wear, because charging a player for
   * swings they took before the mechanic existed is a bill for nothing.
   */
  36: (p) => {
    const state = p.state as Record<string, unknown>;
    const casting = (state['casting'] ??= {}) as Record<string, unknown>;
    casting['wear'] ??= 0;
    casting['repairs'] ??= 0;
    return { ...p, version: 37, state };
  },

  /**
   * v38 — the crucible became a QUEUE, and the tool started keeping a record.
   *
   * The tub used to be one charge: { materialId, solid, molten, purity }. It is
   * now { queue: [charge, ...] }. A save mid-melt must not lose the stone that
   * was in it, so the old shape is lifted into the queue's front rather than
   * dropped — somebody was three seconds from a pour when they closed the tab.
   */
  37: (p) => {
    const state = p.state as Record<string, unknown>;
    const casting = (state['casting'] ??= {}) as Record<string, unknown>;
    casting['xp'] ??= 0;
    const old = casting['crucible'] as Record<string, unknown> | undefined;
    if (old && !Array.isArray(old['queue'])) {
      const held = Number(old['solid'] ?? 0) + Number(old['molten'] ?? 0);
      casting['crucible'] = {
        queue: old['materialId'] && held > 0
          ? [{
            materialId: old['materialId'],
            solid: Number(old['solid'] ?? 0),
            molten: Number(old['molten'] ?? 0),
            purity: Number(old['purity'] ?? 50),
          }]
          : [],
      };
    }
    casting['crucible'] ??= { queue: [] };
    return { ...p, version: 38, state };
  },

  /**
   * v39 — MATERIAL ABILITIES ON TOOLS. The tool became a carrier, so it needs
   * the same shape a drill has: `casting.hand`, holding `fits` and the meters.
   *
   * NOTHING IS GRANTED HERE, on purpose. A save arriving with a tool already
   * built has parts that may well satisfy two or three signatures, and awarding
   * them silently on load would hand the player a codex entry they never made —
   * which is the one thing pillar 5 asks this system not to do. The abilities
   * arrive the first time they BUILD, which for an existing tool is a re-seat
   * away and is the moment the discovery belongs to.
   */
  38: (p) => {
    const state = p.state as Record<string, unknown>;
    const casting = (state['casting'] ??= {}) as Record<string, unknown>;
    casting['hand'] ??= { level: 1, timer: 0, lastCell: -1, name: 'your tool', fits: [] };
    return { ...p, version: 39, state };
  },

  /**
   * v40 — THE MODIFIER LIBRARY. Two empty arrays, and they are empty on
   * purpose: the library is what you have MADE, and an existing tool's owner
   * has made none of it. Seeding a starter modifier would be the same mistake
   * v39 avoided one phase earlier — handing the player a thing they never did.
   *
   * Nothing about an existing tool changes value here. `modCache` on an empty
   * stack returns `NO_MODS`, whose every term is the identity, so a save that
   * loads with no modifiers mines exactly as it did before this existed.
   */
  39: (p) => {
    const state = p.state as Record<string, unknown>;
    const casting = (state['casting'] ??= {}) as Record<string, unknown>;
    if (!Array.isArray(casting['mods'])) casting['mods'] = [];
    if (!Array.isArray(casting['knownMods'])) casting['knownMods'] = [];
    return { ...p, version: 40, state };
  },

  /**
   * v41 — MODIFIER LEVELS, SYNERGIES, INSTABILITY.
   *
   * Every seated modifier starts at level I with no work behind it, and every
   * seated ability at I likewise. That is a real (small) nerf to a save that
   * was mid-flight, and it is the honest one: a level is a record of work done,
   * and back-dating work nobody did would make the readout a lie on its first
   * render. They climb again from the next swing.
   *
   * `knownSynergies` is empty for the same reason v40's library was: a synergy
   * is something you FOUND, and it will announce itself the moment the tool is
   * carrying the pair — which for anyone whose stack already qualifies is the
   * next firing.
   */
  40: (p) => {
    const state = p.state as Record<string, unknown>;
    const casting = (state['casting'] ??= {}) as Record<string, unknown>;
    const mods = casting['mods'];
    if (Array.isArray(mods)) {
      for (const m of mods) {
        if (m && typeof m === 'object') (m as Record<string, unknown>)['xp'] ??= 0;
      }
    }
    const hand = casting['hand'] as Record<string, unknown> | undefined;
    const fits = hand?.['fits'];
    if (Array.isArray(fits)) {
      for (const f of fits) {
        if (f && typeof f === 'object') (f as Record<string, unknown>)['fired'] ??= 0;
      }
    }
    if (!Array.isArray(casting['knownSynergies'])) casting['knownSynergies'] = [];
    return { ...p, version: 41, state };
  },

  /**
   * v42 — CAST SHAPES and EMERGENT CLASSES.
   *
   * Every existing part is stamped with its part type's PLAIN shape, which is
   * what it has effectively been all along: the plain shapes are no-ops to the
   * last decimal and 'spread' is the geometry the reach has always cut. A
   * loaded tool therefore mines byte-identically to before, which is the bar a
   * migration that touches the mining path has to clear.
   *
   * The table is FROZEN here rather than read from the registry, for the
   * standing reason migrations do not import live content: a plain shape could
   * be renamed next phase, and this must keep describing the world as it was.
   *
   * knownClasses starts empty. A class is read off the parts, so an existing
   * coherent tool is ALREADY in one — it simply has not been told yet, and it
   * will be the next time it is built or the panel is opened. Seeding the
   * record here would mark a discovery the player has not had.
   */
  41: (p) => {
    const state = p.state as Record<string, unknown>;
    const casting = (state['casting'] ??= {}) as Record<string, unknown>;
    const PLAIN: Record<string, string> = {
      head: 'point', core: 'solid', edge: 'keened', binding: 'lashed',
      handle: 'straight', grip: 'plain', sockets: 'open',
    };
    for (const key of ['rack', 'tool']) {
      const list = casting[key];
      if (!Array.isArray(list)) continue;
      for (const part of list) {
        if (!part || typeof part !== 'object') continue;
        const rec = part as Record<string, unknown>;
        rec['shape'] ??= PLAIN[String(rec['type'])] ?? 'point';
      }
    }
    if (!Array.isArray(casting['knownClasses'])) casting['knownClasses'] = [];
    return { ...p, version: 42, state };
  },

  /**
   * v43 — MATERIAL LAYERING and TOOL BALANCE.
   *
   * NOTHING IS ADDED TO A PART. An existing part has no layers, and the blend of
   * one layer is the identity — same traits at full pull, same magnitude, same
   * intensity — so every stat it derives is bit-for-bit what it derived before.
   * There is deliberately no attempt to guess layers for anybody.
   *
   * BALANCE IS DERIVED, not stored, so there is nothing to migrate for it either
   * — except the wind-up, which is a live countdown and starts at zero. A save
   * loaded mid-swing does not owe the player a wait.
   *
   * The one thing worth stating plainly: an existing tool WILL now read a
   * balance, because balance is read off the stone it was already made of. A
   * third of single-material tools land in the deadzone and are untouched; the
   * rest gain a trade they did not ask for. That is the point of an emergent
   * axis, and the deadzone is why it is a trade rather than a nerf.
   */
  42: (p) => {
    const state = p.state as Record<string, unknown>;
    const casting = (state['casting'] ??= {}) as Record<string, unknown>;
    casting['windup'] = 0;
    return { ...p, version: 43, state };
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
