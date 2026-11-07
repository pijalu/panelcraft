// SPDX-License-Identifier: GPL-3.0-only
// M6-WP6: named workspace snapshots (FR-W7) — separate IDB object store in
// the same database (version bump), one record per snapshot. Records carry
// the full StoredWorkspace; restore decodes through decodeStored so the
// forward-only migration chain applies (versioned restore).
import { decodeStored, mapStoreError, type StoredWorkspace } from './port';

export interface SnapshotRecord {
  /** `snap-<ISO-ish timestamp>-<rand>` — insertion-ordered, unique. */
  id: string;
  name: string;
  savedAt: number;
  ws: StoredWorkspace;
}

const DB_NAME = 'panelcraft';
const DB_VERSION = 2; // M6: adds the 'snapshots' store
const STORE = 'snapshots';

/** First free snapshot id (ms + random suffix). */
function newId(): string {
  return `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class SnapshotStore {
  private constructor(private readonly db: Promise<IDBDatabase>) {}

  static open(factory: IDBFactory): SnapshotStore {
    const db = new Promise<IDBDatabase>((resolve, reject) => {
      let req: IDBOpenDBRequest;
      try {
        req = factory.open(DB_NAME, DB_VERSION);
      } catch (err) {
        reject(mapStoreError(err));
        return;
      }
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const database = req.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      req.onerror = () => reject(mapStoreError(req.error));
      req.onblocked = () => reject(new Error('indexedDB open blocked'));
    });
    return new SnapshotStore(db);
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await this.db;
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(mapStoreError(req.error));
    });
  }

  /** Save a named snapshot of `ws` (structured-cloned on write by IDB). */
  async save(name: string, ws: StoredWorkspace): Promise<SnapshotRecord> {
    const rec: SnapshotRecord = { id: newId(), name, savedAt: Date.now(), ws };
    await this.tx('readwrite', (s) => s.put(rec));
    return rec;
  }

  /** All snapshots, newest first. Corrupt rows are decoded via decodeStored. */
  async list(): Promise<Array<SnapshotRecord & { ws: StoredWorkspace }>> {
    const raws = await this.tx<unknown[]>('readonly', (s) => s.getAll());
    return (raws as SnapshotRecord[])
      .map((r) => ({ ...r, ws: decodeStored(r.ws) }))
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  /** Delete one snapshot (prune). No-op for unknown ids. */
  async delete(id: string): Promise<void> {
    await this.tx('readwrite', (s) => s.delete(id));
  }

  /** Remove all snapshots (workspace clear-all path). */
  async clear(): Promise<void> {
    await this.tx('readwrite', (s) => s.clear());
  }
}

/** Default store: IndexedDB when available, null otherwise (FR-S3 parity). */
export async function createSnapshotStore(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<SnapshotStore | null> {
  if (!factory) return null;
  try {
    return SnapshotStore.open(factory);
  } catch {
    return null;
  }
}
