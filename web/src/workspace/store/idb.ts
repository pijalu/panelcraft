// SPDX-License-Identifier: GPL-3.0-only
// M3-WP2: IndexedDB StoragePort (FR-S1) + default-port feature detection.
// Raw IDB API — no wrapper library (stdlib first, ADR-0004). The single
// object store 'workspace' holds one record under the fixed key 'current'.
import { decodeStored, mapStoreError, type StoragePort, type StoredWorkspace } from './port';
import { MemoryStorage } from './memory';

const DB_NAME = 'panelcraft';
const DB_VERSION = 1;
const STORE = 'workspace';
const KEY = 'current';

export class IdbStorage implements StoragePort {
  private constructor(private readonly db: Promise<IDBDatabase>) {}

  /** Open (creating the store when needed). Rejects StoreError('unavailable'). */
  static open(factory: IDBFactory): IdbStorage {
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
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
      };
      req.onsuccess = () => {
        const database = req.result;
        database.onversionchange = () => database.close(); // allow deletes/upgrades
        resolve(database);
      };
      req.onerror = () => reject(mapStoreError(req.error));
      req.onblocked = () => reject(new Error('indexedDB open blocked'));
    });
    return new IdbStorage(db);
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

  async load(): Promise<StoredWorkspace | null> {
    const raw = await this.tx<unknown>('readonly', (s) => s.get(KEY));
    return raw === undefined ? null : decodeStored(raw);
  }

  async save(ws: StoredWorkspace): Promise<void> {
    await this.tx('readwrite', (s) => s.put(ws, KEY));
  }

  async clear(): Promise<void> {
    await this.tx('readwrite', (s) => s.clear());
  }

  async estimate(): Promise<number | null> {
    try {
      const est = navigator.storage?.estimate?.();
      if (!est) return null;
      const { usage } = await est;
      return typeof usage === 'number' ? usage : null;
    } catch {
      return null;
    }
  }
}

/**
 * Default port: IndexedDB when available, in-memory fallback otherwise
 * (ADR-0003 — private-mode Safari and hardened browsers).
 */
export async function createDefaultStorage(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<StoragePort> {
  if (!factory) return new MemoryStorage();
  try {
    const port = IdbStorage.open(factory);
    await port.load(); // probe: some browsers throw only on first use
    return port;
  } catch {
    return new MemoryStorage();
  }
}
