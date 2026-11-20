// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { createLocalStorage, LOCAL_WORKSPACE_KEY, LocalStorageStorage } from './local';
import { createFile, readFile } from '../fs';
import { newStoredWorkspace, SCHEMA_VERSION, type StoredWorkspace } from './port';
import { FakeStorage } from '../../test/fakeHandles';

function sample(name = 'web'): StoredWorkspace {
  const record = newStoredWorkspace(name);
  createFile(record.tree, 'svc/api.pcd', 'sys "api"');
  record.openTabs = ['svc/api.pcd'];
  record.activePath = 'svc/api.pcd';
  return record;
}

describe('LocalStorageStorage round-trip', () => {
  it('returns null for an untouched profile', async () => {
    await expect(new LocalStorageStorage(new FakeStorage()).load()).resolves.toBeNull();
  });

  it('saves and reloads the full record through one namespaced key', async () => {
    const store = new FakeStorage();
    const port = new LocalStorageStorage(store);
    await port.save(sample());
    expect([...store.map.keys()]).toEqual([LOCAL_WORKSPACE_KEY]);
    const restored = await new LocalStorageStorage(store).load();
    expect(restored?.name).toBe('web');
    expect(restored?.activePath).toBe('svc/api.pcd');
    expect(readFile(restored!.tree, 'svc/api.pcd')).toBe('sys "api"');
  });

  it('clears only the PanelCraft workspace key', async () => {
    const store = new FakeStorage();
    store.setItem('panelcraft.theme', 'dark');
    await new LocalStorageStorage(store).save(sample());
    await new LocalStorageStorage(store).clear();
    expect(store.map.get('panelcraft.theme')).toBe('dark');
    expect(store.itemKeys()).toEqual(['panelcraft.theme']);
  });

  it('estimates the stored size and reports null when empty', async () => {
    const port = new LocalStorageStorage(new FakeStorage());
    await expect(port.estimate()).resolves.toBeNull();
    await port.save(sample());
    const size = await port.estimate();
    expect(size).toBeGreaterThan(0);
  });
});

describe('LocalStorageStorage failures', () => {
  it('reports malformed JSON as corrupt instead of bootstrapping a new workspace', async () => {
    const store = new FakeStorage();
    store.setItem(LOCAL_WORKSPACE_KEY, '{not json');
    await expect(new LocalStorageStorage(store).load()).rejects.toMatchObject({ code: 'corrupt' });
  });

  it('refuses a record written by a newer schema', async () => {
    const store = new FakeStorage();
    store.setItem(LOCAL_WORKSPACE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1 }));
    await expect(new LocalStorageStorage(store).load()).rejects.toMatchObject({ code: 'newer-schema' });
  });

  it('maps a full store to a quota error on save', async () => {
    const store = new FakeStorage();
    store.failOn = 'set';
    await expect(new LocalStorageStorage(store).save(sample())).rejects.toMatchObject({ code: 'quota' });
  });

  it('maps blocked reads to an unavailable store', async () => {
    const store = new FakeStorage();
    store.failOn = 'get';
    store.failName = 'SecurityError';
    await expect(new LocalStorageStorage(store).load()).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('never writes a record that its own decoder would reject', async () => {
    const store = new FakeStorage();
    const broken = { ...sample(), tree: { kind: 'file', name: 'x' } } as unknown as StoredWorkspace;
    await expect(new LocalStorageStorage(store).save(broken)).rejects.toMatchObject({ code: 'corrupt' });
    expect(store.map.size).toBe(0);
  });
});

describe('createLocalStorage capability probe', () => {
  it('returns null when Web Storage is absent or refuses the probe write', () => {
    expect(createLocalStorage({})).toBeNull();
    const blocked = new FakeStorage();
    blocked.failOn = 'set';
    blocked.failName = 'SecurityError';
    expect(createLocalStorage({ localStorage: blocked })).toBeNull();
  });

  it('leaves no probe residue behind', () => {
    const store = new FakeStorage();
    expect(createLocalStorage({ localStorage: store })).toBeInstanceOf(LocalStorageStorage);
    expect([...store.map.keys()]).toEqual([]);
  });
});
