/**
 * IndexedDB storage adapter (localStorage caps at ~5MB; the save will exceed
 * it in later shells). Tiny promise wrapper, no dependency.
 */
import type { StorageAdapter } from '../engine/save/storage';

const DB_NAME = 'the-hollow';
const STORE = 'saves';
const KEY = 'main';
const QUARANTINE_KEY = 'main' + ".corrupt";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = op(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IndexedDBStorage implements StorageAdapter {
  private db: Promise<IDBDatabase> | null = null;

  private get(): Promise<IDBDatabase> {
    this.db ??= openDB();
    return this.db;
  }

  async load(): Promise<string | null> {
    const db = await this.get();
    const raw = await tx<unknown>(db, 'readonly', (s) => s.get(KEY));
    return typeof raw === 'string' ? raw : null;
  }

  async save(raw: string): Promise<void> {
    const db = await this.get();
    await tx(db, 'readwrite', (s) => s.put(raw, KEY));
  }

  /** Set a damaged save aside so the autosave cannot overwrite it. */
  async quarantine(raw: string): Promise<void> {
    const db = await this.get();
    await tx(db, 'readwrite', (s) => s.put(raw, QUARANTINE_KEY));
  }

  async loadQuarantined(): Promise<string | null> {
    const db = await this.get();
    const raw = await tx<unknown>(db, 'readonly', (s) => s.get(QUARANTINE_KEY));
    return typeof raw === 'string' ? raw : null;
  }

  async clear(): Promise<void> {
    const db = await this.get();
    await tx(db, 'readwrite', (s) => s.delete(KEY));
  }
}
