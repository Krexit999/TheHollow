/**
 * Persistence controller: boots the engine from storage (computing offline
 * gains), autosaves every 10s and on tab-hide, and reconciles long throttled
 * gaps when the tab returns.
 */
import type { Engine } from '../engine';
import { deserialize, serialize } from '../engine/save/codec';
import type { StorageAdapter } from '../engine/save/storage';

export const AUTOSAVE_INTERVAL_MS = 10_000;

export class PersistenceController {
  private timer: number | null = null;
  private hiddenAt: number | null = null;
  lastSaveAt = 0;
  /** True when boot() found a damaged save and set it aside. */
  corruptSaveQuarantined = false;

  constructor(
    private engine: Engine,
    private storage: StorageAdapter,
  ) {}

  /** Load an existing save (if any) into the engine. Returns true if loaded. */
  async boot(): Promise<boolean> {
    let raw: string | null = null;
    try {
      raw = await this.storage.load();
    } catch (err) {
      console.error('Save load failed; starting fresh.', err);
    }
    if (!raw) return false;
    try {
      const state = deserialize(raw);
      this.engine.dispatch({ type: 'hydrate', state, nowMs: Date.now() });
      return true;
    } catch (err) {
      // QUARANTINE BEFORE STARTING FRESH. The autosave fires ten seconds from
      // now and would otherwise overwrite the damaged save with an empty one —
      // turning a recoverable problem into a permanent loss of the player's
      // entire run. Set it aside first, then carry on.
      this.corruptSaveQuarantined = true;
      try {
        await this.storage.quarantine?.(raw);
      } catch (qErr) {
        console.error('Could not quarantine the damaged save.', qErr);
      }
      console.error('Save was corrupt; it has been set aside and the game started fresh.', err);
      return false;
    }
  }

  async saveNow(): Promise<void> {
    const now = Date.now();
    this.engine.dispatch({ type: 'markSaved', nowMs: now });
    await this.storage.save(serialize(this.engine.getState(), now));
    this.lastSaveAt = now;
  }

  start(): void {
    this.timer = window.setInterval(() => void this.saveNow(), AUTOSAVE_INTERVAL_MS);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', () => void this.saveNow());
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = Date.now();
      void this.saveNow();
    } else if (this.hiddenAt !== null) {
      // Long throttled gaps resolve through offline math with a summary; the
      // rAF loop only catches up short ones.
      const gapSec = (Date.now() - this.hiddenAt) / 1000;
      this.hiddenAt = null;
      if (gapSec > 60) {
        this.engine.dispatch({ type: 'applyOffline', seconds: gapSec });
      }
    }
  };
}
