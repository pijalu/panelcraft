// SPDX-License-Identifier: GPL-3.0-only
// Test-only file-handle doubles: a minimal in-memory tree that satisfies the
// File System Access subset PanelCraft uses (entries/getFileHandle/
// getDirectoryHandle/removeEntry/createWritable). Never imported by app code.
export class FakeFileHandle {
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

export class FakeDirectoryHandle {
  readonly kind = 'directory' as const;
  readonly children = new Map<string, FakeDirectoryHandle | FakeFileHandle>();
  /** Optional permission hooks; omitted means "already granted". */
  permission: 'granted' | 'prompt' | 'denied' | 'unavailable' = 'granted';
  queryCalls = 0;
  requestCalls = 0;

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

  /** True when the double exposes permission methods at all. */
  get permissionCapable(): boolean {
    return this.permission !== 'unavailable';
  }

  async queryPermission(): Promise<PermissionState> {
    this.queryCalls++;
    return this.permission === 'unavailable' ? 'granted' : this.permission;
  }

  async requestPermission(): Promise<PermissionState> {
    this.requestCalls++;
    return this.permission === 'unavailable' ? 'granted' : this.permission;
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

/** Present the double as the platform handle type. */
export function asDirectory(root: FakeDirectoryHandle): FileSystemDirectoryHandle {
  return root as unknown as FileSystemDirectoryHandle;
}

/** Structured-cloneable handle record: what IndexedDB can actually store. */
export interface StoredFakeHandle {
  kind: 'directory';
  name: string;
}

export function storableHandle(name: string): FileSystemDirectoryHandle {
  return { kind: 'directory', name } as unknown as FileSystemDirectoryHandle;
}

/** In-memory `Storage` double with failure switches. */
export class FakeStorage implements Storage {
  readonly map = new Map<string, string>();
  failOn: 'get' | 'set' | 'remove' | null = null;
  failName = 'QuotaExceededError';

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    if (this.failOn === 'get') throw new DOMException('blocked', this.failName);
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  /** Test convenience: every key currently stored. */
  itemKeys(): string[] {
    return [...this.map.keys()];
  }

  removeItem(key: string): void {
    if (this.failOn === 'remove') throw new DOMException('blocked', this.failName);
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.failOn === 'set') throw new DOMException('full', this.failName);
    this.map.set(key, value);
  }
}
