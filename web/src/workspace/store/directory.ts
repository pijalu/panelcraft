// SPDX-License-Identifier: GPL-3.0-only
// Optional browser-only File System Access adapter. No server or network is used.
import {
  createFolder, MANIFEST_NAME, newRoot, parentPath, walkNodes, writeFile, type FsNode,
} from '../fs';
import {
  decodeStored, mapStoreError, newStoredWorkspace, StoreError,
  type StoragePort, type StoredWorkspace,
} from './port';

const METADATA_DIR = '.panelcraft';
const METADATA_FILE = 'workspace.json';
const decoder = new TextDecoder('utf-8', { fatal: true });

export interface DirectoryPickerHost {
  showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}

export type DirectoryPicker = DirectoryPickerHost['showDirectoryPicker'];

export function supportsDirectoryPicker(host: DirectoryPickerHost = globalThis as DirectoryPickerHost): boolean {
  return typeof host.showDirectoryPicker === 'function';
}

export async function pickDirectoryStorage(picker?: DirectoryPicker): Promise<BrowserDirectoryStorage> {
  const select = picker ?? (globalThis as DirectoryPickerHost).showDirectoryPicker;
  if (!select) throw new StoreError('unavailable', 'this browser does not support local directory selection');
  const handle = await select({ mode: 'readwrite' });
  return new BrowserDirectoryStorage(handle);
}

export class BrowserDirectoryStorage implements StoragePort {
  readonly kind = 'directory' as const;
  readonly label: string;
  private revision: string | null = null;

  constructor(private readonly root: FileSystemDirectoryHandle) {
    this.label = root.name;
  }

  async load(): Promise<StoredWorkspace> {
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
      return decodeStored(JSON.parse(await file.text()));
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
