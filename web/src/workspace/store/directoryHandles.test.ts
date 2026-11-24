// SPDX-License-Identifier: GPL-3.0-only
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  createDirectoryHandleStore, IdbDirectoryHandleStore, MemoryDirectoryHandleStore,
} from './directoryHandles';
import { DB_NAME, DB_VERSION, HANDLES_STORE, openPanelCraftDb, SNAPSHOTS_STORE, WORKSPACE_STORE } from './db';
import { newStoredWorkspace } from './port';
import { storableHandle } from '../../test/fakeHandles';

let factory: IDBFactory;

beforeEach(() => {
  factory = new IDBFactory();
});

describe('remembered native directory handles', () => {
  it('saves, reloads and forgets a handle', async () => {
    const store = new IdbDirectoryHandleStore(factory);
    await expect(store.load()).resolves.toBeNull();
    await store.save(storableHandle('architecture'));
    const restored = await store.load();
    expect(restored?.kind).toBe('directory');
    expect(restored?.name).toBe('architecture');
    await store.clear();
    await expect(store.load()).resolves.toBeNull();
  });

  it('ignores a stored record that is not a directory handle', async () => {
    await new Promise<void>((resolve, reject) => {
      const req = factory.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(HANDLES_STORE)) req.result.createObjectStore(HANDLES_STORE);
      };
      req.onsuccess = () => {
        const tx = req.result.transaction(HANDLES_STORE, 'readwrite');
        tx.objectStore(HANDLES_STORE).put({ kind: 'file', name: 'x' }, 'current');
        tx.oncomplete = () => { req.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    await expect(new IdbDirectoryHandleStore(factory).load()).resolves.toBeNull();
  });

  it('degrades to no remembered handle when IndexedDB is broken', async () => {
    const broken = { open: () => { throw new DOMException('blocked', 'SecurityError'); } } as unknown as IDBFactory;
    const store = new IdbDirectoryHandleStore(broken);
    await expect(store.load()).resolves.toBeNull();
    await expect(store.save(storableHandle('a'))).resolves.toBeUndefined();
    await expect(store.clear()).resolves.toBeUndefined();
  });

  it('works for the session only when no IndexedDB factory exists', async () => {
    const store = createDirectoryHandleStore(undefined);
    expect(store).toBeInstanceOf(MemoryDirectoryHandleStore);
    await store.save(storableHandle('session'));
    expect((await store.load())?.name).toBe('session');
    await store.clear();
    await expect(store.load()).resolves.toBeNull();
  });
});

describe('shared database upgrade to v3', () => {
  it('adds the handle store while preserving workspace and snapshot records', async () => {
    // v2 database as shipped before this change.
    const record = newStoredWorkspace('legacy');
    await new Promise<void>((resolve, reject) => {
      const req = factory.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(WORKSPACE_STORE);
        req.result.createObjectStore(SNAPSHOTS_STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction([WORKSPACE_STORE, SNAPSHOTS_STORE], 'readwrite');
        tx.objectStore(WORKSPACE_STORE).put(record, 'current');
        tx.objectStore(SNAPSHOTS_STORE).put({ id: 'snap-1', message: 'first' });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    const db = await openPanelCraftDb(factory);
    expect([...db.objectStoreNames].sort()).toEqual([HANDLES_STORE, SNAPSHOTS_STORE, WORKSPACE_STORE].sort());
    const read = <T>(store: string, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      });
    await expect(read(WORKSPACE_STORE, (s) => s.get('current'))).resolves.toMatchObject({ name: 'legacy' });
    await expect(read(SNAPSHOTS_STORE, (s) => s.get('snap-1'))).resolves.toMatchObject({ message: 'first' });
    await expect(read(HANDLES_STORE, (s) => s.get('current'))).resolves.toBeUndefined();
    db.close();
  });

  it('keeps handles out of the stored workspace JSON', async () => {
    const store = new IdbDirectoryHandleStore(factory);
    await store.save(storableHandle('architecture'));
    const db = await openPanelCraftDb(factory);
    const dump = await new Promise<string>((resolve, reject) => {
      const tx = db.transaction(WORKSPACE_STORE, 'readonly');
      const req = tx.objectStore(WORKSPACE_STORE).get('current');
      req.onsuccess = () => resolve(JSON.stringify(req.result ?? null));
      req.onerror = () => reject(req.error);
    });
    expect(dump).not.toContain('architecture');
    db.close();
  });
});
