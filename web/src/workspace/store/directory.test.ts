// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  BrowserDirectoryStorage, pickDirectoryHandle, pickDirectoryStorage,
  queryDirectoryPermission, requestDirectoryPermission, supportsDirectoryPicker,
} from './directory';
import { newStoredWorkspace } from './port';
import { createFile } from '../fs';

import { asDirectory as handle, FakeDirectoryHandle } from '../../test/fakeHandles';

describe('BrowserDirectoryStorage', () => {
  it('loads, reconciles, and restores real directory content and metadata', async () => {
    const root = new FakeDirectoryHandle('diagrams');
    root.file('old.pcd', 'old');
    root.directory('.git').file('config', 'private');
    const storage = new BrowserDirectoryStorage(handle(root));
    const initial = await storage.load();
    expect(initial?.name).toBe('diagrams');
    expect(initial?.tree.children?.map((node) => node.name)).toEqual(['old.pcd']);

    const next = newStoredWorkspace('renamed');
    next.settings = { appTheme: 'dark' };
    next.openTabs = ['nested/new.pcd'];
    next.activePath = 'nested/new.pcd';
    createFile(next.tree, 'nested/new.pcd', 'new');
    await storage.save(next);
    expect(root.children.has('old.pcd')).toBe(false);
    expect(root.children.has('nested')).toBe(true);
    expect(root.children.get('.git')).toBeInstanceOf(FakeDirectoryHandle);
    expect((root.children.get('.git') as FakeDirectoryHandle).children.has('config')).toBe(true);

    const restored = await new BrowserDirectoryStorage(handle(root)).load();
    expect(restored?.name).toBe('renamed');
    expect(restored?.settings.appTheme).toBe('dark');
    expect(restored?.activePath).toBe('nested/new.pcd');
    expect(restored?.tree.children?.map((node) => node.name)).toEqual(['nested']);
  });

  it('detects an external directory edit instead of overwriting it', async () => {
    const root = new FakeDirectoryHandle('diagrams');
    const storage = new BrowserDirectoryStorage(handle(root));
    const workspace = await storage.load();
    root.file('external.pcd', 'external');
    await expect(storage.save(workspace!)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('clears workspace files but never removes Git metadata', async () => {
    const root = new FakeDirectoryHandle('diagrams');
    root.file('a.pcd', 'a');
    root.directory('.git').file('config', 'private');
    const storage = new BrowserDirectoryStorage(handle(root));
    await storage.load();
    await storage.clear();
    expect(root.children.has('a.pcd')).toBe(false);
    expect(root.children.has('.git')).toBe(true);
  });
});

describe('directory picker capability', () => {
  it('feature-detects the picker without invoking it', () => {
    expect(supportsDirectoryPicker({})).toBe(false);
    expect(supportsDirectoryPicker({ showDirectoryPicker: () => Promise.reject(new Error('unused')) })).toBe(true);
  });

  it('returns a storage adapter only after the user selects a directory', async () => {
    const root = handle(new FakeDirectoryHandle('selected'));
    const storage = await pickDirectoryStorage(async () => root);
    expect(storage).toBeInstanceOf(BrowserDirectoryStorage);
    expect(storage.label).toBe('selected');
    await expect(pickDirectoryStorage(async () => { throw new DOMException('cancelled', 'AbortError'); })).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('directory permission helpers', () => {
  it('reports the browser permission state without prompting', async () => {
    const granted = new FakeDirectoryHandle('granted');
    const prompt = new FakeDirectoryHandle('prompt');
    prompt.permission = 'prompt';
    await expect(queryDirectoryPermission(handle(granted))).resolves.toBe('granted');
    await expect(queryDirectoryPermission(handle(prompt))).resolves.toBe('prompt');
    expect(prompt.requestCalls).toBe(0);
  });

  it('requests permission only when explicitly asked to', async () => {
    const dir = new FakeDirectoryHandle('reconnect');
    dir.permission = 'prompt';
    await expect(queryDirectoryPermission(handle(dir))).resolves.toBe('prompt');
    await expect(requestDirectoryPermission(handle(dir))).resolves.toBe('prompt');
    expect(dir.requestCalls).toBe(1);
  });

  it('treats a handle without permission methods as already granted', async () => {
    const plain = { kind: 'directory', name: 'plain' } as unknown as FileSystemDirectoryHandle;
    await expect(queryDirectoryPermission(plain)).resolves.toBe('granted');
    await expect(requestDirectoryPermission(plain)).resolves.toBe('granted');
  });

  it('maps a throwing permission check to denied instead of crashing the startup', async () => {
    const broken = {
      kind: 'directory',
      name: 'broken',
      queryPermission: async () => { throw new DOMException('nope', 'SecurityError'); },
    } as unknown as FileSystemDirectoryHandle;
    await expect(queryDirectoryPermission(broken)).resolves.toBe('denied');
  });
});

describe('directory picker invocation', () => {
  it('calls the picker with its host as receiver', async () => {
    const root = handle(new FakeDirectoryHandle('bound'));
    const seen: unknown[] = [];
    const host = {
      showDirectoryPicker(this: unknown): Promise<FileSystemDirectoryHandle> {
        seen.push(this);
        return Promise.resolve(root);
      },
    };
    await expect(pickDirectoryHandle(undefined, host)).resolves.toBe(root);
    // Detached invocation would receive undefined and browsers reject it.
    expect(seen[0]).toBe(host);
  });

  it('reports a missing picker instead of throwing a type error', async () => {
    await expect(pickDirectoryHandle(undefined, {})).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('treats user cancellation as an abort, not a storage failure', async () => {
    await expect(pickDirectoryHandle(async () => { throw new DOMException('cancelled', 'AbortError'); }))
      .rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('directory content presence', () => {
  it('distinguishes an untouched folder from a stored workspace', async () => {
    const root = new FakeDirectoryHandle('empty');
    const storage = new BrowserDirectoryStorage(handle(root));
    await expect(storage.hasContent()).resolves.toBe(false);
    await storage.load();
    await storage.save(newStoredWorkspace('empty'));
    await expect(storage.hasContent()).resolves.toBe(true);
  });

  it('counts ordinary files as content even without PanelCraft metadata', async () => {
    const root = new FakeDirectoryHandle('plain-files');
    root.file('main.pcd', 'sys "main"');
    await expect(new BrowserDirectoryStorage(handle(root)).hasContent()).resolves.toBe(true);
  });
});
