// SPDX-License-Identifier: GPL-3.0-only
// Origin Private File System adapter: the preferred empty-profile browser
// backend. Not a parallel workspace engine — it resolves a stable PanelCraft
// child directory and reuses the handle-backed reconciliation.
import { HandleDirectoryStorage } from './directory';
import type { StoredWorkspace } from './port';

/** Stable PanelCraft-only child directory below the origin's OPFS root. */
export const OPFS_DIR = 'panelcraft-workspace';

export interface OpfsRootHost {
  /** Direct capability (tests). */
  storage?: { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
  /** The real browser location of that capability: `navigator.storage`. */
  navigator?: { storage?: { getDirectory?: () => Promise<FileSystemDirectoryHandle> } };
}

/** Root-directory capability, injectable for tests (mirrors the picker host). */
export type OpfsRootProvider = () => Promise<FileSystemDirectoryHandle>;

/** `navigator.storage.getDirectory` bound to its owner, or null when absent. */
export function defaultOpfsRoot(host: OpfsRootHost = globalThis as OpfsRootHost): OpfsRootProvider | null {
  const storage = host.storage ?? host.navigator?.storage;
  const getDirectory = storage?.getDirectory;
  if (!storage || typeof getDirectory !== 'function') return null;
  return () => getDirectory.call(storage);
}

/**
 * Open the PanelCraft child directory and wrap it as a StoragePort. Rejects
 * (rather than silently degrading) when OPFS is missing or refuses the root, so
 * the composition root can fall through to the next backend.
 */
export async function openOpfsStorage(getRoot: OpfsRootProvider): Promise<OpfsStorage> {
  const root = await getRoot();
  const directory = await root.getDirectoryHandle(OPFS_DIR, { create: true });
  return new OpfsStorage(directory);
}

/**
 * Origin-private workspace port. This directory is created by PanelCraft for
 * this origin alone, so an untouched one means a first visit: report no record
 * and let the workspace bootstrap its first document, exactly as memory and
 * IndexedDB did. A picked device folder keeps the opposite behaviour — an empty
 * folder the user chose must not gain a file just because the app opened it.
 */
export class OpfsStorage extends HandleDirectoryStorage {
  constructor(root: FileSystemDirectoryHandle) {
    super(root, { kind: 'opfs', label: 'Origin-private browser files' });
  }

  override async load(): Promise<StoredWorkspace | null> {
    if (!await this.hasContent()) return null;
    return super.load();
  }
}
