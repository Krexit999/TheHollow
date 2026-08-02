import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './ui/App';
import { AppErrorBoundary } from './ui/components/ErrorBoundary';
import { createEngine } from './engine';
import { IndexedDBStorage } from './platform/idb';
import { PersistenceController } from './platform/persistence';
import { startLoop } from './platform/loop';
import { bindEngine, useGame } from './ui/store';
import { faceReport } from './engine/systems/grain';

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
    // THE GRAIN'S TWO HOOKS (Proof #1 §5, §9), hung off the same object rather
    // than added to the Engine interface — they are instrumentation, and the
    // engine's public surface is not the place to keep a measuring tape.
    //   __engine.faceReport()   the six metrics that answer the question.
    //   __engine.rerollBand()   lock recovery without a full Collapse run.
    //   __ui.getState().setGrainScope('band')  the §6 per-band fallback.
    dev['__engine'] = Object.assign(engine, {
      faceReport: () => faceReport(engine.getState()).text,
      faceReportData: () => faceReport(engine.getState()),
      rerollBand: () => engine.dispatch({ type: 'debug', op: 'rerollBand' }),
    });
    dev['__ui'] = useGame;
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
