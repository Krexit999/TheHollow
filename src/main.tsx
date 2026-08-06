import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './ui/App';
import { AppErrorBoundary } from './ui/components/ErrorBoundary';
import { createEngine } from './engine';
import { IndexedDBStorage } from './platform/idb';
import { PersistenceController } from './platform/persistence';
import { startLoop } from './platform/loop';
import { bindEngine, useGame } from './ui/store';
import { ModifierCache } from './engine/modifiers';
import { allUpgrades } from './engine/upgrades';
import { dpsMax } from './engine/systems/face';
import { cascadeChain, conditionOf, conditionedMachines } from './engine/systems/condition';
import { BREAKS, recipeHidden, ripeness, stopped } from './engine/systems/breaks';
import { bandOfMachine } from './engine/systems/condition';
import { flowSatisfaction } from './engine/systems/plant';
import { strikeDamage } from './engine/systems/standoff';
import { shellRoll, unstableHere } from './engine/systems/roll';
import { THRESHOLDS, thresholdFor } from './engine/content/thresholds';
import { allAuthoredStations } from './engine/content/rolls';
import type { GameState } from './engine';

async function boot(): Promise<void> {
  const engine = createEngine({ nowMs: Date.now() });
  const persistence = new PersistenceController(engine, new IndexedDBStorage());
  await persistence.boot();
  persistence.start();
  startLoop(engine);
  bindEngine(engine, persistence);
  if (import.meta.env.DEV) {
    // Dev-only: lets the screenshot harness and console poke the engine and
    // drive UI navigation (__ui.getState().setTab('kiln')) without brittle
    // role selectors.
    const dev = window as unknown as Record<string, unknown>;
    dev['__engine'] = engine;
    dev['__ui'] = useGame;
    /**
     * ...AND THE REGISTRIES, so a driver can PROBE rather than transcribe.
     *
     * Every one of these is a live registry read or a live engine function. A
     * verification script that hardcodes "there are six thresholds" or "the
     * machines are kiln, crusher, refinery" is asserting its own fixture, and
     * the moment a seventh is authored the instrument keeps passing while the
     * thing it claims to check has changed underneath it.
     */
    dev['__probe'] = {
      machines: () => conditionedMachines(),
      chain: (s: GameState, id: string) => cascadeChain(s, id),
      dps: () => String(dpsMax(engine.getState() as GameState, new ModifierCache())),
      strike: (s: GameState, halved: boolean) => strikeDamage(s, halved),
      thresholdIds: () => THRESHOLDS.map((t) => t.id),
      thresholdAt: (shellId: string) => thresholdFor(shellId)?.at ?? 0,
      unstable: (s: GameState) => unstableHere(s),
      // §55 (A.107) — what has BROKEN, how close the rest are, and the reasons.
      breaks: () => BREAKS.map((x) => ({ id: x.id, shellId: x.shellId, name: x.name })),
      broken: (s: GameState) => ({ ...(s.plant?.broken ?? {}) }),
      band: (s: GameState, id: string) => bandOfMachine(s, id),
      ripeness: (s: GameState, id: string) => ripeness(s, id),
      hidden: (s: GameState, id: string) => recipeHidden(s, id),
      // A.108 — the condition a machine is under, and the supply ratio Verdance's
      // rule now reads. Both live functions: `served` is computed on the spot
      // rather than read off the cached field, which is the whole re-pointing.
      condition: (s: GameState, id: string) => conditionOf(s, id),
      served: (s: GameState, id: string) => flowSatisfaction(s, id),
      stopped: (s: GameState, id: string) => stopped(s, id),
      shellRoll: (s: GameState) => shellRoll(s).map((d) => ({ id: d.id, depth: d.depth, type: d.type })),
      upgrades: (s: GameState) => allUpgrades().filter((u) => u.visible?.(s) ?? true).map((u) => u.id),
      wrecks: () => Object.fromEntries(
        allAuthoredStations()
          .filter((x) => x.def.wreck && x.shellId === 'loam')
          .map((x) => [x.def.wreck as string, { id: x.def.id, name: x.def.name, depth: x.def.depth }]),
      ),
    };
  }

  // No StrictMode: its deliberate double-mount forces a create+destroy of the
  // Pixi Applications, and Pixi v8's shared object pools do not survive a
  // renderer being destroyed while another renders (batcher pool poisoning).
  //
  // AppErrorBoundary is the root net: without it, ANY uncaught render throw
  // unmounted the whole tree, whose effect-cleanups destroy the Pixi views and
  // stop their tickers — a black, frozen screen recoverable only by refresh.
  createRoot(document.getElementById('root')!).render(
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>,
  );
}

void boot();
