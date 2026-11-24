// SPDX-License-Identifier: GPL-3.0-only
// Remembered native directory handles. A separate port from `StoragePort`: it
// persists a handle (metadata), never workspace content, so the workspace
// contract stays snapshot-oriented and no browser API leaks into it.
import { openPanelCraftDb, HANDLES_STORE } from './db';
import { mapStoreError } from './port';

const KEY = 'current';

export interface NativeDirectoryHandleStore {
  /** Remembered handle, or null when none/unreadable. Never throws. */
  load(): Promise<FileSystemDirectoryHandle | null>;
  /** Remember a handle; failures are swallowed (the session still works). */
  save(handle: FileSystemDirectoryHandle): Promise<void>;
  /** Forget the handle. Device files are untouched by design. */
  clear(): Promise<void>;
}

/** IndexedDB-backed store: the only place a persistent handle can live. */
export class IdbDirectoryHandleStore implements NativeDirectoryHandleStore {
  private readonly db: Promise<IDBDatabase>;

  constructor(factory: IDBFactory) {
    this.db = openPanelCraftDb(factory);
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await this.db;
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(HANDLES_STORE, mode);
      const req = fn(tx.objectStore(HANDLES_STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(mapStoreError(req.error));
    });
  }

  async load(): Promise<FileSystemDirectoryHandle | null> {
    try {
      const raw = await this.tx<unknown>('readonly', (store) => store.get(KEY));
      return isDirectoryHandle(raw) ? raw : null;
    } catch {
      return null; // unavailable store ⇒ no remembered directory, never a crash
    }
  }

  async save(handle: FileSystemDirectoryHandle): Promise<void> {
    try {
      await this.tx('readwrite', (store) => store.put(handle, KEY));
    } catch {
      // Persisting is best-effort: selection still works for this session.
    }
  }

  async clear(): Promise<void> {
    try {
      await this.tx('readwrite', (store) => store.clear());
    } catch {
      // Nothing to forget when the store is unavailable.
    }
  }
}

/** Session-only store (no IndexedDB): selection works, remembering does not. */
export class MemoryDirectoryHandleStore implements NativeDirectoryHandleStore {
  private handle: FileSystemDirectoryHandle | null = null;

  async load(): Promise<FileSystemDirectoryHandle | null> {
    return this.handle;
  }

  async save(handle: FileSystemDirectoryHandle): Promise<void> {
    this.handle = handle;
  }

  async clear(): Promise<void> {
    this.handle = null;
  }
}

export function createDirectoryHandleStore(factory: IDBFactory | undefined): NativeDirectoryHandleStore {
  return factory ? new IdbDirectoryHandleStore(factory) : new MemoryDirectoryHandleStore();
}

function isDirectoryHandle(value: unknown): value is FileSystemDirectoryHandle {
  const kind = (value as { kind?: unknown } | null)?.kind;
  return typeof value === 'object' && value !== null && kind === 'directory';
}
