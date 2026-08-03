import { migrateV1ToV2, newSave, SAVE_VERSION, type SaveData } from '../engine/progression';

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

  /**
   * Chain migrations one version at a time, each handing off to the next.
   *
   * A ladder rather than a lookup table, so a save two versions behind is
   * upgraded by composition — adding v3 means appending one step, never
   * authoring a bespoke v1→v3 path that would have to be kept in sync with
   * both of the others.
   */
  private migrate(raw: { schemaVersion?: number }): SaveData {
    let save = raw as SaveData;
    if (save.schemaVersion === 1) save = migrateV1ToV2(save);
    // Unknown/corrupt, or from a future build: don't destroy the row silently —
    // start fresh in memory and leave what is on disk alone.
    if (save.schemaVersion !== SAVE_VERSION) return newSave();
    return save;
  }
}
