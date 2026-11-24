// SPDX-License-Identifier: GPL-3.0-only
// Optional browser-only File System Access adapter. No server or network is used.
// The handle-backed reconciliation lives in `HandleDirectoryStorage`, which is
// shared by the user-selected native folder (this module) and the origin-private
// file system adapter (`opfs.ts`) — one implementation, two capability labels.
import {
  createFolder, MANIFEST_NAME, newRoot, parentPath, walkNodes, writeFile, type FsNode,
} from '../fs';
import {
  decodeStored, mapStoreError, newStoredWorkspace, StoreError,
  type ContentProbePort, type StorageKind, type StoragePort, type StoredWorkspace,
} from './port';

const METADATA_DIR = '.panelcraft';
const METADATA_FILE = 'workspace.json';
const decoder = new TextDecoder('utf-8', { fatal: true });

/** Unreadable metadata means corrupt data, not an unavailable backend. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new StoreError('corrupt', 'stored workspace is not valid JSON');
  }
}

export interface DirectoryPickerHost {
  showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}

export type DirectoryPicker = DirectoryPickerHost['showDirectoryPicker'];

/** Read/write permission state of a remembered directory handle. */
export type DirectoryPermissionState = 'granted' | 'prompt' | 'denied';

interface PermissionHandle {
  queryPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
}

export function supportsDirectoryPicker(host: DirectoryPickerHost = globalThis as DirectoryPickerHost): boolean {
  return typeof host.showDirectoryPicker === 'function';
}

/**
 * Ask whether a remembered handle still has read/write permission. Browsers
 * expose this on the handle; test doubles and older engines may omit it, which
 * is treated as already granted (the handle was handed to us by a real picker).
 */
export async function queryDirectoryPermission(handle: FileSystemDirectoryHandle): Promise<DirectoryPermissionState> {
  const capable = handle as unknown as PermissionHandle;
  if (typeof capable.queryPermission !== 'function') return 'granted';
  try {
    return await capable.queryPermission({ mode: 'readwrite' });
  } catch {
    return 'denied';
  }
}

/** Request permission from a user gesture (the Reconnect click). */
export async function requestDirectoryPermission(handle: FileSystemDirectoryHandle): Promise<DirectoryPermissionState> {
  const capable = handle as unknown as PermissionHandle;
  if (typeof capable.requestPermission !== 'function') return 'granted';
  try {
    return await capable.requestPermission({ mode: 'readwrite' });
  } catch {
    return 'denied';
  }
}

/**
 * Invoke the picker with the right receiver. Browsers require a secure context
 * and a user gesture; `host.showDirectoryPicker` must not be detached from its
 * host object or the call throws an illegal-invocation error.
 */
export async function pickDirectoryHandle(
  picker?: DirectoryPicker,
  host: DirectoryPickerHost = globalThis as DirectoryPickerHost,
): Promise<FileSystemDirectoryHandle> {
  const select = picker ?? host.showDirectoryPicker?.bind(host);
  if (!select) throw new StoreError('unavailable', 'this browser does not support local directory selection');
  return select({ mode: 'readwrite' });
}

export async function pickDirectoryStorage(picker?: DirectoryPicker): Promise<BrowserDirectoryStorage> {
  return new BrowserDirectoryStorage(await pickDirectoryHandle(picker));
}

/** Adapter identity supplied by the composition root (native folder vs OPFS). */
export interface HandleDirectoryOptions {
  kind?: StorageKind;
  label?: string;
}

/**
 * Snapshot StoragePort over a directory handle: files mirror the workspace tree,
 * `.panelcraft/workspace.json` carries tabs/settings. Revisions guard against
 * edits made outside PanelCraft.
 */
export class HandleDirectoryStorage implements StoragePort, ContentProbePort {
  readonly kind: StorageKind;
  readonly label: string;
  private revision: string | null = null;

  constructor(private readonly root: FileSystemDirectoryHandle, options: HandleDirectoryOptions = {}) {
    this.kind = options.kind ?? 'directory';
    this.label = options.label ?? root.name;
  }

  /** Directory name, used for labels and diagnostics. */
  get directoryName(): string {
    return this.root.name;
  }

  /** Directory snapshot; never null, an empty folder is a readable workspace. */
  async load(): Promise<StoredWorkspace | null> {
    try {
      const workspace = await this.read();
      this.revision = JSON.stringify(workspace);
      return workspace;
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async save(workspace: StoredWorkspace): Promise<void> {
    try {
      decodeStored(workspace);
      const current = await this.read();
      this.checkRevision(current);
      await this.reconcile(current.tree, workspace.tree);
      await this.writeMetadata(workspace);
      const saved = await this.read();
      this.revision = JSON.stringify(saved);
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async clear(): Promise<void> {
    try {
      const current = await this.read();
      this.checkRevision(current);
      const empty = newStoredWorkspace(current.name);
      await this.reconcile(current.tree, empty.tree);
      await this.removeMetadata();
      this.revision = JSON.stringify(await this.read());
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async estimate(): Promise<number | null> {
    return JSON.stringify(await this.read()).length;
  }

  /**
   * Presence, not validity: a stored-but-corrupt metadata file still counts as
   * content so selection surfaces the error instead of starting elsewhere.
   */
  async hasContent(): Promise<boolean> {
    try {
      const metadata = await this.root.getDirectoryHandle(METADATA_DIR);
      await metadata.getFileHandle(METADATA_FILE);
      return true;
    } catch (error) {
      if ((error as { name?: string }).name !== 'NotFoundError') throw error;
    }
    for await (const [name, entry] of this.root.entries()) {
      if (entry.kind === 'file' && name !== MANIFEST_NAME) return true;
    }
    return false;
  }

  private checkRevision(current: StoredWorkspace): void {
    if (this.revision !== null && JSON.stringify(current) !== this.revision) {
      throw new StoreError('conflict', 'local folder changed outside PanelCraft; reopen it before saving');
    }
  }

  private async read(): Promise<StoredWorkspace> {
    const workspace = await this.readMetadata();
    workspace.tree = newRoot();
    await this.readFolder(this.root, workspace.tree, '');
    return workspace;
  }

  private async readMetadata(): Promise<StoredWorkspace> {
    try {
      const directory = await this.root.getDirectoryHandle(METADATA_DIR);
      const file = await (await directory.getFileHandle(METADATA_FILE)).getFile();
      return decodeStored(parseJson(await file.text()));
    } catch (error) {
      if ((error as { name?: string }).name === 'NotFoundError') return newStoredWorkspace(this.root.name);
      throw error;
    }
  }

  private async readFolder(handle: FileSystemDirectoryHandle, folder: FsNode, parent: string): Promise<void> {
    for await (const [name, entry] of handle.entries()) {
      const path = parent === '' ? name : `${parent}/${name}`;
      if (name === '.git' || (parent === '' && (name === METADATA_DIR || name === MANIFEST_NAME))) continue;
      if (entry.kind === 'directory') {
        createFolder(folder, path);
        await this.readFolder(entry, folder, path);
        continue;
      }
      const bytes = await (await entry.getFile()).arrayBuffer();
      try {
        writeFile(folder, path, decoder.decode(bytes));
      } catch (error) {
        if (error instanceof TypeError) continue; // Preserve non-UTF-8 files without exposing them.
        throw error;
      }
    }
  }

  private async reconcile(current: FsNode, target: FsNode): Promise<void> {
    const oldEntries = walkNodes(current);
    const newEntries = walkNodes(target);
    const desired = new Map(newEntries.map((entry) => [entry.path, entry.node.kind]));
    await this.removeOldEntries(oldEntries, desired);
    await this.writeNewEntries(newEntries, oldEntries);
  }

  private async removeOldEntries(entries: ReturnType<typeof walkNodes>, desired: Map<string, string>): Promise<void> {
    const sorted = [...entries].sort((a, b) => b.path.split('/').length - a.path.split('/').length || b.path.localeCompare(a.path));
    for (const entry of sorted) {
      const next = desired.get(entry.path);
      if (next === entry.node.kind) continue;
      const parent = await this.directoryAt(parentPath(entry.path));
      try {
        await parent.removeEntry(entry.node.name);
      } catch (error) {
        if (entry.node.kind === 'file' || next === 'file') throw error;
        // A non-empty folder contains hidden/non-UTF-8 content and must survive.
      }
    }
  }

  private async writeNewEntries(entries: ReturnType<typeof walkNodes>, current: ReturnType<typeof walkNodes>): Promise<void> {
    const previous = new Map(current.map((entry) => [entry.path, entry.node]));
    const sorted = [...entries].sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path));
    for (const entry of sorted) {
      if (entry.node.kind === 'folder') {
        await this.directoryAt(entry.path, true);
        continue;
      }
      const before = previous.get(entry.path);
      if (before?.kind === 'file' && before.content === entry.node.content) continue;
      const parent = await this.directoryAt(parentPath(entry.path), true);
      const file = await parent.getFileHandle(entry.node.name, { create: true });
      const writable = await file.createWritable();
      await writable.write(entry.node.content ?? '');
      await writable.close();
    }
  }

  private async directoryAt(path: string, create = false): Promise<FileSystemDirectoryHandle> {
    let current = this.root;
    if (path === '') return current;
    for (const segment of path.split('/')) current = await current.getDirectoryHandle(segment, { create });
    return current;
  }

  private async writeMetadata(workspace: StoredWorkspace): Promise<void> {
    const directory = await this.root.getDirectoryHandle(METADATA_DIR, { create: true });
    const file = await directory.getFileHandle(METADATA_FILE, { create: true });
    const writable = await file.createWritable();
    await writable.write(`${JSON.stringify(workspace, null, 2)}\n`);
    await writable.close();
  }

  private async removeMetadata(): Promise<void> {
    try {
      const directory = await this.root.getDirectoryHandle(METADATA_DIR);
      await directory.removeEntry(METADATA_FILE);
      await this.root.removeEntry(METADATA_DIR);
    } catch (error) {
      if ((error as { name?: string }).name !== 'NotFoundError') throw error;
    }
  }
}

/** A user-selected, user-visible device folder (native storage). */
export class BrowserDirectoryStorage extends HandleDirectoryStorage {
  constructor(root: FileSystemDirectoryHandle) {
    super(root, { kind: 'directory' });
  }
}
