// SPDX-License-Identifier: GPL-3.0-only
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { IdbStorage, createDefaultStorage } from './idb';
import { MemoryStorage } from './memory';
import { StoreError, newStoredWorkspace, type StoredWorkspace } from './port';
import { createFile, readFile, getNode } from '../fs';

function sampleRecord(name = 'demo'): StoredWorkspace {
  const rec = newStoredWorkspace(name);
  rec.savedAt = 42;
  createFile(rec.tree, 'svc/api/main.pcd', 'sys "api"');
  createFile(rec.tree, 'доклад/обзор.pcd', 'sys "обзор"'); // unicode names
  rec.openTabs = ['svc/api/main.pcd'];
  rec.activePath = 'svc/api/main.pcd';
  return rec;
}

function putRaw(factory: IDBFactory, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = factory.open('panelcraft', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('workspace')) {
        req.result.createObjectStore('workspace');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('workspace', 'readwrite');
      tx.objectStore('workspace').put(value, 'current');
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

let factory: IDBFactory;

beforeEach(() => {
  factory = new IDBFactory(); // isolated database per test
});

describe('IdbStorage round-trip', () => {
  it('save → load restores the full tree (nested dirs + unicode + tabs)', async () => {
    const port = IdbStorage.open(factory);
    await port.save(sampleRecord());
    const out = await port.load();
    expect(out).not.toBeNull();
    expect(out?.name).toBe('demo');
    expect(out?.activePath).toBe('svc/api/main.pcd');
    expect(readFile(out!.tree, 'доклад/обзор.pcd')).toBe('sys "обзор"');
    expect(getNode(out!.tree, 'svc/api')?.kind).toBe('folder');
  });

  it('load on an empty database returns null', async () => {
    const port = IdbStorage.open(factory);
    expect(await port.load()).toBeNull();
  });

  it('save overwrites; clear empties the store', async () => {
    const port = IdbStorage.open(factory);
    await port.save(sampleRecord('first'));
    await port.save(sampleRecord('second'));
    expect((await port.load())?.name).toBe('second');
    await port.clear();
    expect(await port.load()).toBeNull();
  });

  it('estimate() degrades to null without navigator.storage (FR-S3 probe)', async () => {
    const port = IdbStorage.open(factory);
    expect(await port.estimate()).toBeNull();
  });

  it('mutating the record after save does not affect storage', async () => {
    const port = IdbStorage.open(factory);
    const rec = sampleRecord();
    await port.save(rec);
    rec.name = 'mutated';
    expect((await port.load())?.name).toBe('demo');
  });
});

describe('IdbStorage migrations + corruption (FR-S5)', () => {
  it('migrates a raw v0 record on load', async () => {
    await putRaw(factory, {
      schemaVersion: 0,
      name: 'legacy',
      tree: { kind: 'folder', name: '', children: [{ kind: 'file', name: 'a.pcd', content: 'x' }] },
    });
    const out = await IdbStorage.open(factory).load();
    expect(out?.schemaVersion).toBe(1);
    expect(out?.openTabs).toEqual([]);
    expect(getNode(out!.tree, 'a.pcd')?.content).toBe('x');
  });

  it('surfaces corrupt payloads as StoreError', async () => {
    await putRaw(factory, { schemaVersion: 1, tree: 'oops', name: 'x' });
    await expect(IdbStorage.open(factory).load()).rejects.toMatchObject({
      name: 'StoreError',
      code: 'corrupt',
    });
  });
});

describe('default storage selection', () => {
  it('uses IndexedDB when available', async () => {
    const port = await createDefaultStorage(factory);
    expect(port).toBeInstanceOf(IdbStorage);
  });

  it('falls back to memory when indexedDB is undefined', async () => {
    const port = await createDefaultStorage(undefined);
    expect(port).toBeInstanceOf(MemoryStorage);
  });

  it('falls back to memory when opening throws (private mode)', async () => {
    const broken = {
      open: () => {
        throw Object.assign(new Error('private mode'), { name: 'InvalidStateError' });
      },
    } as unknown as IDBFactory;
    const port = await createDefaultStorage(broken);
    expect(port).toBeInstanceOf(MemoryStorage);
  });

  it('workspace + snapshots share ONE database (M6 fix: no per-feature version race)', async () => {
    // order that used to break: snapshots open first (bumps the DB), then the
    // workspace open at the old version → VersionError → restore failure
    const snaps = await import('./snapshots');
    const snapshotStore = snaps.SnapshotStore.open(factory);
    const storage = IdbStorage.open(factory); // same factory, same database
    const rec = sampleRecord('shared');
    await storage.save(rec);
    await snapshotStore.save('point-in-time', rec);
    const restored = await storage.load();
    expect(restored?.name).toBe('shared'); // workspace intact after snapshot write
    expect((await snapshotStore.list()).length).toBe(1);
    // reverse open order is symmetric
    const storage2 = IdbStorage.open(factory);
    expect((await storage2.load())?.name).toBe('shared');
  });

  it('v1 database (pre-M6) upgrades to v2 without losing the workspace', async () => {
    // simulate the M3-era layout: version 1, 'workspace' store only
    await new Promise<void>((resolve, reject) => {
      const req = factory.open('panelcraft', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('workspace')) req.result.createObjectStore('workspace');
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('workspace', 'readwrite');
        tx.objectStore('workspace').put(sampleRecord('legacy'), 'current');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    const snaps = await import('./snapshots');
    const store = snaps.SnapshotStore.open(factory); // triggers v1 → v2 upgrade
    const storage = IdbStorage.open(factory);
    expect((await storage.load())?.name).toBe('legacy'); // data survives
    await store.save('after-upgrade', sampleRecord('snap'));
    expect((await storage.load())?.name).toBe('legacy'); // snapshot write didn't clobber
  });

  it('memory fallback behaves as a StoragePort (FR-S2 ephemeral base)', async () => {
    const mem = new MemoryStorage();
    expect(await mem.load()).toBeNull();
    await mem.save(sampleRecord());
    expect((await mem.load())?.name).toBe('demo');
    expect(await mem.estimate()).toBeGreaterThan(0);
    await mem.clear();
    expect(await mem.load()).toBeNull();
    expect(await mem.estimate()).toBeNull();
  });
});

describe('StoreError class shape', () => {
  it('exposes code + message', () => {
    expect(new StoreError('quota', 'q').code).toBe('quota');
    expect(new StoreError('quota').message).toContain('quota');
  });
});

afterEach(() => {
  // fake-indexeddb keeps global registries per instance; nothing to reset.
});
