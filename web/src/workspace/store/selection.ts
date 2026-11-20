// SPDX-License-Identifier: GPL-3.0-only
// Composition root for storage selection. Static hosting never probes an API,
// and no adapter imports UI code: the browser capability chain (native folder →
// OPFS → Web Storage → legacy IndexedDB → memory) is decided here.
import { ApiStorage, type Fetcher } from './api';
import {
  BrowserDirectoryStorage, queryDirectoryPermission,
  type DirectoryPickerHost,
} from './directory';
import { createDirectoryHandleStore, type NativeDirectoryHandleStore } from './directoryHandles';
import { IdbStorage } from './idb';
import { createLocalStorage } from './local';
import { MemoryStorage } from './memory';
import { defaultOpfsRoot, openOpfsStorage, type OpfsRootProvider } from './opfs';
import { isContentProbe, mapStoreError, type StoragePort } from './port';

export interface AppStorageOptions {
  document: Document;
  fetcher: Fetcher;
  factory: IDBFactory | undefined;
  /** Remembered native handle persistence; defaults to IndexedDB or session-only. */
  handles?: NativeDirectoryHandleStore;
  /** Capability probe + picker receiver for native directory selection. */
  pickerHost?: DirectoryPickerHost;
  /** OPFS root provider; null when the engine lacks it (injected in tests). */
  opfsRoot?: OpfsRootProvider | null;
  /** Web Storage implementation; null when blocked (injected in tests). */
  local?: Storage | null;
}

/** A remembered native directory whose permission must be re-requested by a click. */
export interface NativeDirectoryCandidate {
  handle: FileSystemDirectoryHandle;
  label: string;
}

/** Selected port plus the state the shell needs to render storage controls. */
export interface AppStorage {
  port: StoragePort;
  /** Non-null ⇒ show Reconnect; never prompted automatically. */
  reconnect: NativeDirectoryCandidate | null;
  /** Remember a handle — only after switching to it succeeded. */
  remember(handle: FileSystemDirectoryHandle): Promise<void>;
  /** Forget the remembered handle — only after switching away succeeded. */
  forget(): Promise<void>;
  /** Data-aware browser-tier port, ignoring remembered native handles. */
  browserPort(): Promise<StoragePort>;
}

function readLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // blocked cookies / hardened privacy settings
  }
}

export function defaultAppStorageOptions(): AppStorageOptions {
  const fetcher: Fetcher = (input, init) => fetch(input, init);
  return {
    document: globalThis.document,
    fetcher,
    factory: globalThis.indexedDB,
    pickerHost: globalThis as DirectoryPickerHost,
    opfsRoot: defaultOpfsRoot(),
    local: readLocalStorage(),
  };
}

type TierState = 'data' | 'empty' | 'unavailable' | 'corrupt';

interface Inspection {
  port: StoragePort;
  state: TierState;
}

async function inspect(port: StoragePort): Promise<Inspection> {
  try {
    // Presence, not decodability: a stored-but-corrupt record must be ranked as
    // data so its error surfaces, never skipped in favour of an empty backend.
    const hasContent = isContentProbe(port) ? await port.hasContent() : (await port.load()) !== null;
    return { port, state: hasContent ? 'data' : 'empty' };
  } catch (error) {
    const code = mapStoreError(error).code;
    // A missing/denied backend may fall through; readable-but-corrupt data must not.
    return { port, state: code === 'unavailable' ? 'unavailable' : 'corrupt' };
  }
}

async function tryOpen(opener: () => Promise<StoragePort | null>): Promise<StoragePort[]> {
  try {
    const port = await opener();
    return port === null ? [] : [port];
  } catch {
    return [];
  }
}

/**
 * Browser-tier candidates in preference order: OPFS, Web Storage, legacy
 * IndexedDB. A candidate that cannot be created at all is simply absent.
 */
async function browserCandidates(options: AppStorageOptions): Promise<StoragePort[]> {
  const opfsRoot = options.opfsRoot === undefined ? defaultOpfsRoot() : options.opfsRoot;
  const local = options.local === undefined ? readLocalStorage() : options.local;
  const candidates: StoragePort[] = [];
  if (opfsRoot) candidates.push(...await tryOpen(() => openOpfsStorage(opfsRoot)));
  if (local) candidates.push(...await tryOpen(async () => createLocalStorage({ localStorage: local })));
  if (options.factory) candidates.push(...await tryOpen(async () => IdbStorage.open(options.factory!)));
  return candidates;
}

/**
 * Data-aware choice: existing data in a higher tier wins, an empty preferred
 * backend never hides a non-empty lower one, and corrupt records surface through
 * the store they belong to instead of being skipped.
 */
export async function selectBrowserPort(options: AppStorageOptions): Promise<StoragePort> {
  const inspected = await Promise.all((await browserCandidates(options)).map(inspect));
  const found = (state: TierState): StoragePort | undefined =>
    inspected.find((entry) => entry.state === state)?.port;
  return found('data') ?? found('corrupt') ?? found('empty') ?? new MemoryStorage();
}

async function loadRemembered(
  handles: NativeDirectoryHandleStore,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await handles.load();
  } catch {
    return null;
  }
}

/** No-op actions for the explicitly configured server/Git backend. */
function serverOnly(port: StoragePort): AppStorage {
  return {
    port,
    reconnect: null,
    remember: async () => undefined,
    forget: async () => undefined,
    browserPort: async () => port,
  };
}

export async function createAppStorage(overrides?: Partial<AppStorageOptions>): Promise<AppStorage> {
  const options = { ...defaultAppStorageOptions(), ...overrides };
  // An advertised server/Git capability short-circuits every browser probe.
  const marker = options.document.querySelector('meta[name="panelcraft-storage"]');
  const backend = marker?.getAttribute('content');
  if (backend === 'filesystem' || backend === 'git') {
    return serverOnly(new ApiStorage('./api/v1/workspace', options.fetcher, backend));
  }

  const handles = options.handles ?? createDirectoryHandleStore(options.factory);
  const actions = {
    remember: (handle: FileSystemDirectoryHandle) => handles.save(handle),
    forget: () => handles.clear(),
    browserPort: () => selectBrowserPort(options),
  };

  // Reuse only when permission is already granted: a picker or prompt needs a gesture.
  const remembered = await loadRemembered(handles);
  if (remembered) {
    const permission = await queryDirectoryPermission(remembered);
    if (permission === 'granted') {
      return { port: new BrowserDirectoryStorage(remembered), reconnect: null, ...actions };
    }
    return {
      port: await selectBrowserPort(options),
      reconnect: { handle: remembered, label: remembered.name },
      ...actions,
    };
  }
  return { port: await selectBrowserPort(options), reconnect: null, ...actions };
}
