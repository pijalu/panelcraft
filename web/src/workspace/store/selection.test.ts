// SPDX-License-Identifier: GPL-3.0-only
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createAppStorage, selectBrowserPort, type AppStorageOptions } from './selection';
import { ApiStorage } from './api';
import { BrowserDirectoryStorage } from './directory';
import { openOpfsStorage, type OpfsStorage } from './opfs';
import { createDirectoryHandleStore, type NativeDirectoryHandleStore } from './directoryHandles';
import { IdbStorage } from './idb';
import { createLocalStorage, LocalStorageStorage } from './local';
import { MemoryStorage } from './memory';
import { asDirectory, FakeDirectoryHandle, FakeStorage, storableHandle } from '../../test/fakeHandles';
import { createFile } from '../fs';
import { newStoredWorkspace, type StoredWorkspace } from './port';

function record(name: string): StoredWorkspace {
  const stored = newStoredWorkspace(name);
  createFile(stored.tree, 'main.pcd', `system ${name}`);
  stored.openTabs = ['main.pcd'];
  stored.activePath = 'main.pcd';
  return stored;
}

function staticDocument(): Document {
  return { querySelector: vi.fn(() => null) } as unknown as Document;
}

function serverDocument(backend: 'filesystem' | 'git'): Document {
  const element = { getAttribute: () => backend };
  return { querySelector: vi.fn(() => element) } as unknown as Document;
}

interface Harness {
  factory: IDBFactory | undefined;
  opfsRoot: FakeDirectoryHandle | null;
  local: FakeStorage | null;
  handles: NativeDirectoryHandleStore & { handle: FileSystemDirectoryHandle | null };
  opfsCalls: () => number;
  options: AppStorageOptions;
}

function sessionHandles(initial: FileSystemDirectoryHandle | null = null): Harness['handles'] {
  let handle = initial;
  return {
    get handle() { return handle; },
    load: async () => handle,
    save: async (next: FileSystemDirectoryHandle) => { handle = next; },
    clear: async () => { handle = null; },
  };
}

function harness(overrides: { remember?: FileSystemDirectoryHandle | null } = {}): Harness {
  const factory = new IDBFactory();
  const opfsRoot = new FakeDirectoryHandle('opfs-root');
  const local = new FakeStorage();
  const handles = sessionHandles(overrides.remember ?? null);
  let calls = 0;
  return {
    factory,
    opfsRoot,
    local,
    handles,
    opfsCalls: () => calls,
    options: {
      document: staticDocument(),
      fetcher: vi.fn(),
      factory,
      handles,
      local,
      opfsRoot: async () => { calls++; return asDirectory(opfsRoot); },
    },
  };
}

/** Persist a workspace in each tier the plan treats as a candidate. */
async function seedOpfs(h: Harness, name: string): Promise<void> {
  const storage = await selectOpfs(h);
  await storage.save(record(name));
}

async function selectOpfs(h: Harness): Promise<OpfsStorage> {
  return openOpfsStorage(h.options.opfsRoot!);
}

async function seedLocal(h: Harness, name: string): Promise<void> {
  await new LocalStorageStorage(h.local!).save(record(name));
}

async function seedIdb(h: Harness, name: string): Promise<void> {
  await IdbStorage.open(h.factory!).save(record(name));
}

function permissionedHandle(state: 'granted' | 'prompt' | 'denied'): FakeDirectoryHandle {
  const handle = new FakeDirectoryHandle('architecture');
  handle.permission = state;
  return handle;
}

describe('explicit server selection', () => {
  it('uses the advertised backend and never probes a browser capability', async () => {
    const h = harness();
    const storage = await createAppStorage({
      ...h.options,
      document: serverDocument('git'),
      opfsRoot: async () => { throw new Error('opfs must not be probed'); },
    });
    expect(storage.port).toBeInstanceOf(ApiStorage);
    expect(storage.reconnect).toBeNull();
    expect(h.opfsCalls()).toBe(0);
    await expect(storage.browserPort()).resolves.toBe(storage.port);
  });
});

describe('remembered native directory', () => {
  it('reuses a granted handle instead of OPFS, with no permission prompt', async () => {
    const handle = permissionedHandle('granted');
    const h = harness({ remember: asDirectory(handle) });
    const storage = await createAppStorage(h.options);
    expect(storage.port).toBeInstanceOf(BrowserDirectoryStorage);
    expect(storage.port.kind).toBe('directory');
    expect(storage.reconnect).toBeNull();
    expect(handle.requestCalls).toBe(0);
    expect(h.opfsCalls()).toBe(0);
  });

  it('never requests permission during startup when the state is prompt', async () => {
    const handle = permissionedHandle('prompt');
    const h = harness({ remember: asDirectory(handle) });
    const storage = await createAppStorage(h.options);
    expect(handle.requestCalls).toBe(0);
    expect(storage.reconnect?.label).toBe('architecture');
    expect(storage.port.kind).toBe('opfs');
  });

  it('keeps the browser fallback and offers reconnect when permission was denied', async () => {
    const handle = permissionedHandle('denied');
    const h = harness({ remember: asDirectory(handle) });
    const storage = await createAppStorage(h.options);
    expect(handle.requestCalls).toBe(0);
    expect(storage.port).not.toBeInstanceOf(BrowserDirectoryStorage);
    expect(storage.reconnect).not.toBeNull();
  });

  it('falls back when the remembered handle cannot be read at all', async () => {
    const handles: NativeDirectoryHandleStore = {
      load: async () => { throw new Error('broken'); },
      save: async () => undefined,
      clear: async () => undefined,
    };
    const h = harness();
    const storage = await createAppStorage({ ...h.options, handles });
    expect(storage.reconnect).toBeNull();
    expect(storage.port.kind).toBe('opfs');
  });
});

describe('data-aware tier selection', () => {
  it('prefers existing OPFS data over existing Web Storage and IndexedDB data', async () => {
    const h = harness();
    await seedIdb(h, 'idb');
    await seedLocal(h, 'local');
    await seedOpfs(h, 'opfs');
    const port = await selectBrowserPort(h.options);
    expect(port.kind).toBe('opfs');
    await expect(port.load()).resolves.toMatchObject({ name: 'opfs' });
  });

  it('prefers existing Web Storage data over an empty OPFS and existing IndexedDB data', async () => {
    const h = harness();
    await seedIdb(h, 'idb');
    await seedLocal(h, 'local');
    const port = await selectBrowserPort(h.options);
    expect(port.kind).toBe('local');
    await expect(port.load()).resolves.toMatchObject({ name: 'local' });
  });

  it('keeps a non-empty legacy IndexedDB workspace instead of an empty preferred backend', async () => {
    const h = harness();
    await seedIdb(h, 'legacy');
    const port = await selectBrowserPort(h.options);
    expect(port).toBeInstanceOf(IdbStorage);
    await expect(port.load()).resolves.toMatchObject({ name: 'legacy' });
    // No migration: nothing was copied into the preferred backends.
    await expect(selectOpfs(h).then((s) => s.hasContent())).resolves.toBe(false);
    await expect(new LocalStorageStorage(h.local!).load()).resolves.toBeNull();
  });

  it('uses OPFS for an empty profile, then Web Storage, then IndexedDB, then memory', async () => {
    const withOpfs = harness();
    await expect(selectBrowserPort(withOpfs.options)).resolves.toMatchObject({ kind: 'opfs' });

    const noOpfs = harness();
    await expect(selectBrowserPort({ ...noOpfs.options, opfsRoot: null })).resolves.toMatchObject({ kind: 'local' });

    const noLocal = harness();
    await expect(selectBrowserPort({ ...noLocal.options, opfsRoot: null, local: null }))
      .resolves.toBeInstanceOf(IdbStorage);

    const nothing = harness();
    await expect(selectBrowserPort({ ...nothing.options, opfsRoot: null, local: null, factory: undefined }))
      .resolves.toBeInstanceOf(MemoryStorage);
  });

  it('treats a rejected OPFS root and a blocked Web Storage as unavailable, not empty', async () => {
    const h = harness();
    await seedIdb(h, 'legacy');
    const blocked = new FakeStorage();
    blocked.failOn = 'set';
    blocked.failName = 'SecurityError';
    const port = await selectBrowserPort({
      ...h.options,
      opfsRoot: async () => { throw new DOMException('denied', 'SecurityError'); },
      local: blocked,
    });
    await expect(port.load()).resolves.toMatchObject({ name: 'legacy' });
  });

  it('surfaces a corrupt OPFS record instead of selecting an empty lower backend', async () => {
    const h = harness();
    const opfs = await selectOpfs(h);
    await opfs.save(record('opfs'));
    // Corrupt the metadata file the adapter reads.
    const metadata = h.opfsRoot!.children.get('panelcraft-workspace') as FakeDirectoryHandle;
    const dir = metadata.children.get('.panelcraft') as FakeDirectoryHandle;
    (dir.children.get('workspace.json') as { content: string }).content = '{oops';
    await seedLocal(h, 'local');
    const port = await selectBrowserPort(h.options);
    expect(port.kind).toBe('opfs');
    await expect(port.load()).rejects.toMatchObject({ code: 'corrupt' });
  });
});

describe('switching storage', () => {
  it('remembers a handle only after the caller switched, and forgets it on demand', async () => {
    const h = harness();
    const storage = await createAppStorage(h.options);
    expect(h.handles.handle).toBeNull();
    await storage.remember(storableHandle('architecture'));
    expect(h.handles.handle?.name).toBe('architecture');
    await storage.forget();
    expect(h.handles.handle).toBeNull();
  });

  it('ignores handle persistence failures so the session keeps working', async () => {
    const h = harness();
    const handles: NativeDirectoryHandleStore = {
      load: async () => null,
      save: async () => { throw new Error('blocked'); },
      clear: async () => { throw new Error('blocked'); },
    };
    const storage = await createAppStorage({ ...h.options, handles });
    await expect(storage.remember(storableHandle('architecture'))).rejects.toThrow('blocked');
  });

  it('selects the browser tier for Use browser storage even while a native handle is remembered', async () => {
    const handle = permissionedHandle('granted');
    const h = harness({ remember: asDirectory(handle) });
    const storage = await createAppStorage(h.options);
    expect(storage.port.kind).toBe('directory');
    const browser = await storage.browserPort();
    expect(browser.kind).toBe('opfs');
  });

  it('never re-runs selection when the active port rejects a save', async () => {
    const h = harness();
    const storage = await createAppStorage(h.options);
    const calls = h.opfsCalls();
    const active = storage.port;
    await expect(active.save({ ...record('x'), tree: { kind: 'file', name: 'x' } } as never))
      .rejects.toMatchObject({ code: 'corrupt' });
    expect(storage.port).toBe(active);
    expect(h.opfsCalls()).toBe(calls);
  });
});

describe('composition defaults', () => {
  it('uses IndexedDB-backed handle persistence when a factory exists', async () => {
    const h = harness();
    const store = createDirectoryHandleStore(h.factory);
    expect(store).toBeInstanceOf(Object);
    await store.save(storableHandle('architecture'));
    await expect(store.load()).resolves.toMatchObject({ name: 'architecture' });
  });

  it('exposes the Web Storage adapter through the plan key', () => {
    const adapter = createLocalStorage({ localStorage: new FakeStorage() });
    expect(adapter).toBeInstanceOf(LocalStorageStorage);
  });
});

beforeEach(() => {
  vi.restoreAllMocks();
});
