// SPDX-License-Identifier: GPL-3.0-only
// Snapshot store tests (M6-WP6, FR-W7) — fake-indexeddb; versioned restore
// via decodeStored (forward-only migration chain applies on the way out).
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { SnapshotStore } from './snapshots';
import { newStoredWorkspace, SCHEMA_VERSION, type StoredWorkspace } from './port';
import { createFile, readFile, type FsNode } from '../fs';

let factory: IDBFactory;

function wsWithFile(path: string, content: string, name = 'ws'): StoredWorkspace {
  const rec = newStoredWorkspace(name);
  createFile(rec.tree as FsNode, path, content);
  rec.openTabs = [path];
  rec.activePath = path;
  return rec;
}

describe('SnapshotStore (FR-W7)', () => {
  beforeEach(() => {
    factory = new IDBFactory();
  });

  afterEach(() => {
    // fake-indexeddb keeps registries per-factory; drop to isolate tests
    void factory;
  });

  it('save → list returns newest first with decoded workspace', async () => {
    const store = SnapshotStore.open(factory);
    await store.save('before', wsWithFile('a.pcd', 'pcd 1.0', 'w1'));
    await new Promise((r) => setTimeout(r, 5));
    await store.save('after', wsWithFile('b.pcd', 'pcd 1.0', 'w2'));
    const list = await store.list();
    expect(list.map((s) => s.name)).toEqual(['after', 'before']);
    expect(list[1]!.ws.name).toBe('w1');
    expect(readFile(list[1]!.ws.tree as FsNode, 'a.pcd')).toBe('pcd 1.0');
    expect(list[1]!.ws.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('record stays pristine across restores (deep copy on adopt is manager-side; store returns decoded copies)', async () => {
    const store = SnapshotStore.open(factory);
    const ws = wsWithFile('a.pcd', 'pcd 1.0');
    await store.save('snap', ws);
    const [rec] = await store.list();
    // mutate the returned copy — a fresh list() must be unaffected
    createFile(rec!.ws.tree as FsNode, 'extra.pcd', 'x');
    const [again] = await store.list();
    expect(() => readFile(again!.ws.tree as FsNode, 'extra.pcd')).toThrow();
  });

  it('delete prunes one snapshot; clear wipes all', async () => {
    const store = SnapshotStore.open(factory);
    const a = await store.save('a', newStoredWorkspace());
    const b = await store.save('b', newStoredWorkspace());
    expect((await store.list()).length).toBe(2);
    await store.delete(a.id);
    let list = await store.list();
    expect(list.map((s) => s.name)).toEqual(['b']);
    expect(list[0]!.id).toBe(b.id);
    await store.clear();
    list = await store.list();
    expect(list).toEqual([]);
  });

  it('ids are unique (two saves never collide)', async () => {
    const store = SnapshotStore.open(factory);
    const a = await store.save('x', newStoredWorkspace());
    const b = await store.save('x', newStoredWorkspace());
    expect(a.id).not.toBe(b.id);
  });
});
