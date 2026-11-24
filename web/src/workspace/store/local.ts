// SPDX-License-Identifier: GPL-3.0-only
// Web Storage (`localStorage`) workspace adapter — the last persistent browser
// fallback before memory. One namespaced JSON key; no other storage key is read
// or written (the theme cache keeps its own key).
import {
  decodeStored, mapStoreError, StoreError, type ContentProbePort, type StoragePort, type StoredWorkspace,
} from './port';

/** Namespaced key: never shared with UI preference caches. */
export const LOCAL_WORKSPACE_KEY = 'panelcraft.workspace.v1';
const PROBE_KEY = 'panelcraft.probe';

export class LocalStorageStorage implements StoragePort, ContentProbePort {
  readonly kind = 'local' as const;
  readonly label = 'Browser Web Storage';

  constructor(private readonly store: Storage) {}

  async load(): Promise<StoredWorkspace | null> {
    let raw: string | null;
    try {
      raw = this.store.getItem(LOCAL_WORKSPACE_KEY);
    } catch (error) {
      throw mapStoreError(error);
    }
    if (raw === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new StoreError('corrupt', 'stored workspace is not valid JSON');
    }
    return decodeStored(parsed);
  }

  async save(workspace: StoredWorkspace): Promise<void> {
    // Same validation as every other port: never persist an unusable record.
    decodeStored(workspace);
    try {
      this.store.setItem(LOCAL_WORKSPACE_KEY, JSON.stringify(workspace));
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async clear(): Promise<void> {
    try {
      this.store.removeItem(LOCAL_WORKSPACE_KEY);
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async estimate(): Promise<number | null> {
    try {
      const raw = this.store.getItem(LOCAL_WORKSPACE_KEY);
      return raw === null ? null : raw.length;
    } catch {
      return null;
    }
  }

  /** Present key, even when its JSON is unreadable (that error must surface). */
  async hasContent(): Promise<boolean> {
    return this.store.getItem(LOCAL_WORKSPACE_KEY) !== null;
  }
}

export interface LocalStorageHost {
  localStorage?: Storage;
}

/**
 * Adapter when Web Storage is writable in this context, otherwise null.
 * Private modes and blocked-cookie settings throw on the getter or on the first
 * write, so the probe write is what separates "unavailable" from "empty".
 */
export function createLocalStorage(host: LocalStorageHost = globalThis as LocalStorageHost): LocalStorageStorage | null {
  try {
    const store = host.localStorage;
    if (!store) return null;
    store.setItem(PROBE_KEY, '1');
    store.removeItem(PROBE_KEY);
    return new LocalStorageStorage(store);
  } catch {
    return null;
  }
}
