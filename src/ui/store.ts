/**
 * Zustand bridge. The engine is the source of truth; React reads a snapshot
 * refreshed at ~12Hz (the Pixi face reads the engine directly every frame).
 */
import { create } from 'zustand';
import type { Engine, GameState, GameAction, NumberFormat } from '../engine';
import { setNumberFormat as applyNumberFormat } from '../engine';
import type { PersistenceController } from '../platform/persistence';

/** A spend held for confirmation (confirm-on-big-spend). */
export interface PendingSpend {
  action: GameAction;
  /** e.g. "Buy ×34 Finer Chisels" */
  title: string;
  /** e.g. "12.4K Dust — 82% of your Dust" */
  detail: string;
}

export type TabId =
  // The Face
  | 'dig' | 'shaft' | 'kiln' | 'drills' | 'vents' | 'hollow'
  // The Craft
  | 'lattice' | 'crucible' | 'foundry' | 'greenhouse' | 'mycelium'
  | 'loom' | 'bench' | 'array' | 'chamber' | 'automation'
  // The Hold
  // 'forge' RETIRED A.71 — the tool shelf folded into 'refinery', gear became
  // its own room. Removed from the union rather than left dangling, so any
  // straggler that still tries to navigate there is a compile error.
  | 'hold' | 'casting' | 'refinery' | 'runes' | 'brew' | 'relics' | 'museum'
  // The World
  | 'guild' | 'gear' | 'bestiary' | 'warrens' | 'observatory' | 'journal'
  | 'wells' | 'expeditions' | 'desk'
  // Progress
  | 'delver' | 'collapse' | 'rewrite' | 'parallel' | 'spiral'
  | 'grid' | 'vault';

export type BulkMode = 1 | 10 | 'max';

const BULK_KEY = 'hollow.bulkMode';
function loadBulk(): BulkMode {
  if (typeof localStorage === 'undefined') return 1;
  const v = localStorage.getItem(BULK_KEY);
  return v === '10' ? 10 : v === 'max' ? 'max' : 1;
}

// Number format is a device preference (not player data): localStorage, and a
// module-level flag every `fmt` call reads — so switching applies everywhere.
const NUMFMT_KEY = 'hollow.numberFormat';
function loadNumberFormat(): NumberFormat {
  if (typeof localStorage === 'undefined') return 'suffix';
  const v = localStorage.getItem(NUMFMT_KEY);
  return v === 'scientific' || v === 'engineering' ? v : 'suffix';
}

interface UIStore {
  engine: Engine | null;
  persistence: PersistenceController | null;
  /** Monotonic counter bumped on every snapshot — cheap re-render trigger. */
  rev: number;
  state: Readonly<GameState> | null;
  tab: TabId;
  /**
   * A run-summary page is up. THE MODAL STACK IS EXPLICIT, NOT DOM ORDER.
   * The DisclosureGate and the RunSummaryModal are both full-screen at z-50,
   * so which one wins was decided by which happened to be rendered second in
   * App.tsx — and both paint a bg-black/70 backdrop, so a fall that also opens
   * a room double-darkened the screen with two full-screen dialogs. The gate
   * now waits its turn: you read what the fall paid, THEN what it opened.
   */
  runSummaryOpen: boolean;
  /** Tabs the player has never opened since they appeared (glow hint). */
  freshTabs: TabId[];
  reducedMotion: boolean;
  /** Glassmere: while true, tapping the face cycles a mirror instead of chipping. */
  opticsMode: boolean;
  /** THE FACE CLUSTER (v20): what a press on the face does — chip (default),
   *  or arm a signature technique for the next tap. UI-only.
   *  'technique' (Part B): the next tap performs the armed signature verb. */
  faceMode: 'chip' | 'technique';
  /** Which targeted technique a face tap performs while faceMode='technique'. */
  armedTechnique: string | null;
  /** The bulk-buy multiplier, persisted across sessions (localStorage). */
  bulkMode: BulkMode;
  /** Number display format — device preference (localStorage), not in the save. */
  numberFormat: NumberFormat;
  /** The Compendium overlay — UI state only, deliberately not in the save. */
  compendiumOpen: boolean;
  compendiumEntry: string | null;
  /** A big spend awaiting the player's nod (confirm-on-big-spend). */
  pendingSpend: PendingSpend | null;
  /**
   * WHICH DRILLS THE ALLOY BENCH IS AIMED AT (A.54). UI state, not saved — it
   * is a cursor, not a setting. The Drill Bay's per-drill ALLOY button writes
   * it and jumps to the Forge; the bench also lets you pick the drills there,
   * so both entry paths land in the same place.
   */
  alloyTargets: number[];
  /**
   * Bumped only by `openAlloyBench` (the drill-card jump), never by manual
   * toggles in the bench itself. The bench scrolls itself into view on this
   * changing, not on `alloyTargets.length` — that used to auto-scroll on
   * every checkbox click inside the bench too, which read as the page
   * fighting the player each time they picked a second or third drill.
   */
  alloyJumpSeq: number;
  setTab: (tab: TabId) => void;
  /** Jump to the Forge's alloy bench with these drills already selected. */
  openAlloyBench: (drills: number[]) => void;
  setAlloyTargets: (drills: number[]) => void;
  setRunSummaryOpen: (open: boolean) => void;
  markFresh: (tab: TabId) => void;
  setOpticsMode: (on: boolean) => void;
  setFaceMode: (m: 'chip' | 'technique') => void;
  armTechnique: (id: string | null) => void;
  setBulkMode: (m: BulkMode) => void;
  setNumberFormat: (m: NumberFormat) => void;
  openCompendium: (entryId: string | null) => void;
  closeCompendium: () => void;
  /** Route a spend through the confirm gate, or straight to the engine. */
  askSpend: (pending: PendingSpend) => void;
  resolveSpend: (go: boolean) => void;
}

export const useGame = create<UIStore>((set, get) => ({
  engine: null,
  persistence: null,
  rev: 0,
  state: null,
  tab: 'dig',
  runSummaryOpen: false,
  freshTabs: [],
  reducedMotion:
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  opticsMode: false,
  faceMode: 'chip',
  armedTechnique: null,
  bulkMode: loadBulk(),
  numberFormat: loadNumberFormat(),
  alloyTargets: [],
  alloyJumpSeq: 0,
  setRunSummaryOpen: (open: boolean) => set({ runSummaryOpen: open }),
  setTab: (tab) =>
    set((s) => ({ tab, freshTabs: s.freshTabs.filter((t) => t !== tab) })),
  setAlloyTargets: (drills) => set({ alloyTargets: drills }),
  // A.70: THE BENCH IS IN THE DRILLS ROOM NOW. Every ALLOY button on a drill's
  // card came through here, and it was still sending the player to the Forge —
  // which is where the bench used to be and no longer is.
  openAlloyBench: (drills) =>
    set((s) => ({
      tab: 'drills', alloyTargets: drills, alloyJumpSeq: s.alloyJumpSeq + 1,
      freshTabs: s.freshTabs.filter((t) => t !== 'drills'),
    })),
  setOpticsMode: (on) => set({ opticsMode: on }),
  setFaceMode: (m) => set({ faceMode: m, ...(m !== 'technique' ? { armedTechnique: null } : {}) }),
  armTechnique: (id) => set(id ? { armedTechnique: id, faceMode: 'technique' } : { armedTechnique: null, faceMode: 'chip' }),
  setBulkMode: (m) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(BULK_KEY, String(m));
    set({ bulkMode: m });
  },
  setNumberFormat: (m) => {
    applyNumberFormat(m); // the module flag every fmt() reads
    if (typeof localStorage !== 'undefined') localStorage.setItem(NUMFMT_KEY, m);
    // Bump rev so every formatted label re-renders against the new mode.
    set((s) => ({ numberFormat: m, rev: s.rev + 1 }));
  },
  markFresh: (tab) => {
    const s = get();
    if (!s.freshTabs.includes(tab)) set({ freshTabs: [...s.freshTabs, tab] });
  },
  compendiumOpen: false,
  compendiumEntry: null,
  // Opening from a room lands on that room's page — contextual entry.
  openCompendium: (entryId) => set({ compendiumOpen: true, compendiumEntry: entryId }),
  closeCompendium: () => set({ compendiumOpen: false }),
  pendingSpend: null,
  askSpend: (pending) => set({ pendingSpend: pending }),
  resolveSpend: (go) => {
    const p = get().pendingSpend;
    set({ pendingSpend: null });
    if (go && p) dispatch(p.action);
  },
}));

/** Wire an engine into the store; call once at boot. */
export function bindEngine(engine: Engine, persistence: PersistenceController): void {
  // Apply the saved number-format preference to the module flag before first paint.
  applyNumberFormat(useGame.getState().numberFormat);
  useGame.setState({ engine, state: engine.getState(), rev: 1 });
  let pending = false;
  engine.subscribe((state) => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      useGame.setState((s) => ({ state, rev: s.rev + 1 }));
    }, 80);
  });
  useGame.setState({ persistence });
}

/** Convenience dispatch that tolerates being called before boot. */
export function dispatch(action: Parameters<Engine['dispatch']>[0]): ReturnType<Engine['dispatch']> {
  const engine = useGame.getState().engine;
  if (!engine) return { ok: false, reason: 'Engine not ready' };
  return engine.dispatch(action);
}
