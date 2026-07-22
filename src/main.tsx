import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './ui/App';
import { createEngine } from './engine';
import { IndexedDBStorage } from './platform/idb';
import { PersistenceController } from './platform/persistence';
import { startLoop } from './platform/loop';
import { bindEngine, useGame } from './ui/store';

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
  }

  // No StrictMode: its deliberate double-mount forces a create+destroy of the
  // Pixi Applications, and Pixi v8's shared object pools do not survive a
  // renderer being destroyed while another renders (batcher pool poisoning).
  createRoot(document.getElementById('root')!).render(<App />);
}

void boot();
