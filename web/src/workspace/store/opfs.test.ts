// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { defaultOpfsRoot, openOpfsStorage, OPFS_DIR } from './opfs';
import { createFile } from '../fs';
import { newStoredWorkspace } from './port';
import { asDirectory, FakeDirectoryHandle } from '../../test/fakeHandles';

describe('OPFS root capability', () => {
  it('is absent when the engine has no origin-private file system', () => {
    expect(defaultOpfsRoot({})).toBeNull();
    expect(defaultOpfsRoot({ storage: {} })).toBeNull();
  });

  it('binds getDirectory to its owner object', async () => {
    const root = new FakeDirectoryHandle('opfs-root');
    const owner = { calls: 0, getDirectory: async () => { owner.calls++; return asDirectory(root); } };
    const provider = defaultOpfsRoot({ storage: owner });
    expect(provider).not.toBeNull();
    await expect(provider!()).resolves.toBe(asDirectory(root));
    expect(owner.calls).toBe(1);
  });

  it('finds the real capability on navigator.storage in a browser', async () => {
    // Regression: reading only `globalThis.storage` made OPFS invisible in the
    // browser, so every profile silently fell through to Web Storage.
    const root = new FakeDirectoryHandle('opfs-root');
    const owner = { calls: 0, getDirectory: async () => { owner.calls++; return asDirectory(root); } };
    const provider = defaultOpfsRoot({ navigator: { storage: owner } });
    expect(provider).not.toBeNull();
    await expect(provider!()).resolves.toBe(asDirectory(root));
    expect(owner.calls).toBe(1);
  });
});

describe('openOpfsStorage', () => {
  it('creates and reuses one stable PanelCraft child directory', async () => {
    const root = new FakeDirectoryHandle('opfs-root');
    const first = await openOpfsStorage(async () => asDirectory(root));
    const second = await openOpfsStorage(async () => asDirectory(root));
    expect(root.children.has(OPFS_DIR)).toBe(true);
    expect(root.children.size).toBe(1);
    expect(first.kind).toBe('opfs');
    expect(second.label).toBe(first.label);
  });

  it('labels origin-private files distinctly from a device folder', async () => {
    const storage = await openOpfsStorage(async () => asDirectory(new FakeDirectoryHandle('opfs-root')));
    expect(storage.kind).toBe('opfs');
    expect(storage.label).not.toBe('opfs-root');
    expect(storage.label).toContain('Origin-private');
  });

  it('rejects when the root is unavailable so selection can fall through', async () => {
    await expect(openOpfsStorage(async () => { throw new DOMException('denied', 'SecurityError'); }))
      .rejects.toMatchObject({ name: 'SecurityError' });
  });

  it('round-trips a workspace without touching the OPFS root itself', async () => {
    const root = new FakeDirectoryHandle('opfs-root');
    const storage = await openOpfsStorage(async () => asDirectory(root));
    const record = newStoredWorkspace('workspace');
    createFile(record.tree, 'svc/api.pcd', 'sys "api"');
    record.openTabs = ['svc/api.pcd'];
    // A first visit reports no record, so the app bootstraps its first document.
    expect(await storage.load()).toBeNull();
    await storage.save(record);
    const restored = await openOpfsStorage(async () => asDirectory(root)).then((port) => port.load());
    expect(restored?.tree.children?.map((node) => node.name)).toEqual(['svc']);
    expect(restored?.openTabs).toEqual(['svc/api.pcd']);
  });
});
