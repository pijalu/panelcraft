// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { BrowserDirectoryStorage, pickDirectoryStorage, supportsDirectoryPicker } from './directory';
import { newStoredWorkspace } from './port';
import { createFile } from '../fs';

class FakeFileHandle {
  readonly kind = 'file' as const;
  constructor(readonly name: string, public content = '') {}
  async getFile(): Promise<File> {
    return new File([this.content], this.name);
  }
  async createWritable(): Promise<{ write(text: string): Promise<void>; close(): Promise<void> }> {
    return {
      write: async (text: string) => { this.content = text; },
      close: async () => undefined,
    };
  }
}

class FakeDirectoryHandle {
  readonly kind = 'directory' as const;
  readonly children = new Map<string, FakeDirectoryHandle | FakeFileHandle>();
  constructor(readonly name: string) {}
  file(name: string, content = ''): FakeFileHandle {
    const file = new FakeFileHandle(name, content);
    this.children.set(name, file);
    return file;
  }
  directory(name: string): FakeDirectoryHandle {
    const directory = new FakeDirectoryHandle(name);
    this.children.set(name, directory);
    return directory;
  }
  async *entries(): AsyncIterableIterator<[string, FakeDirectoryHandle | FakeFileHandle]> {
    for (const entry of this.children) yield entry;
  }
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeDirectoryHandle> {
    const existing = this.children.get(name);
    if (existing instanceof FakeDirectoryHandle) return existing;
    if (existing || !options?.create) throw new DOMException('not found', 'NotFoundError');
    return this.directory(name);
  }
  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FakeFileHandle> {
    const existing = this.children.get(name);
    if (existing instanceof FakeFileHandle) return existing;
    if (existing || !options?.create) throw new DOMException('not found', 'NotFoundError');
    return this.file(name);
  }
  async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    const existing = this.children.get(name);
    if (!existing) throw new DOMException('not found', 'NotFoundError');
    if (existing instanceof FakeDirectoryHandle && existing.children.size > 0 && !options?.recursive) {
      throw new DOMException('directory not empty', 'InvalidModificationError');
    }
    this.children.delete(name);
  }
}

function handle(root: FakeDirectoryHandle): FileSystemDirectoryHandle {
  return root as unknown as FileSystemDirectoryHandle;
}

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
