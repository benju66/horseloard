import { newSave, type SaveData } from '../engine/progression';

const DB_NAME = 'horse-lord';
const STORE = 'save';
const KEY = 'profile';

/**
 * All IndexedDB access lives here (CLAUDE.md #4). Versioned schema with a
 * migration path from day one; designed as if a Supabase sync will sit
 * behind it later (no derived state, timestamps on writes).
 */
export class SaveManager {
  private db: IDBDatabase | null = null;

  async open(): Promise<void> {
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async load(): Promise<SaveData> {
    if (!this.db) await this.open();
    const raw = await new Promise<unknown>((resolve, reject) => {
      const tx = this.db!.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!raw || typeof raw !== 'object') return newSave();
    return this.migrate(raw as { schemaVersion?: number });
  }

  async save(data: SaveData): Promise<void> {
    if (!this.db) await this.open();
    data.updatedAt = new Date().toISOString();
    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /** Chain migrations version by version; v1 is current. */
  private migrate(raw: { schemaVersion?: number }): SaveData {
    switch (raw.schemaVersion) {
      case 1:
        return raw as SaveData;
      default:
        // Unknown/corrupt: don't destroy the row silently — start fresh in memory.
        return newSave();
    }
  }
}
