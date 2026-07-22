/**
 * Storage abstraction so the engine stays platform-blind. The browser
 * provides an IndexedDB adapter (src/platform/idb.ts); tests and the sim use
 * MemoryStorage.
 */
export interface StorageAdapter {
  load(): Promise<string | null>;
  save(raw: string): Promise<void>;
  clear(): Promise<void>;
  /**
   * Set aside a save that failed to load, under a key the autosave never
   * touches. Without this, a damaged save is destroyed ten seconds after boot:
   * the game starts fresh, the autosave fires, and the only copy of a hundred
   * hours is overwritten by an empty one. Quarantine is not recovery, but it
   * keeps recovery POSSIBLE. Optional so MemoryStorage and the sim need not
   * care.
   */
  quarantine?(raw: string): Promise<void>;
  loadQuarantined?(): Promise<string | null>;
}

export class MemoryStorage implements StorageAdapter {
  private data: string | null = null;
  private bad: string | null = null;

  async load(): Promise<string | null> {
    return this.data;
  }

  async save(raw: string): Promise<void> {
    this.data = raw;
  }

  async clear(): Promise<void> {
    this.data = null;
  }

  async quarantine(raw: string): Promise<void> {
    this.bad = raw;
  }

  async loadQuarantined(): Promise<string | null> {
    return this.bad;
  }
}
