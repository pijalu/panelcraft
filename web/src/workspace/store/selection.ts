// SPDX-License-Identifier: GPL-3.0-only
// Composition root for storage selection. Static hosting never probes an API.
import { ApiStorage, type Fetcher } from './api';
import { createDefaultStorage } from './idb';
import type { StoragePort } from './port';

export interface AppStorageOptions {
  document: Document;
  fetcher: Fetcher;
  factory: IDBFactory | undefined;
}

export function defaultAppStorageOptions(): AppStorageOptions {
  const fetcher: Fetcher = (input, init) => fetch(input, init);
  return { document: globalThis.document, fetcher, factory: globalThis.indexedDB };
}

export async function createAppStorage(overrides?: Partial<AppStorageOptions>): Promise<StoragePort> {
  const options = { ...defaultAppStorageOptions(), ...overrides };
  const marker = options.document.querySelector('meta[name="panelcraft-storage"]');
  if (marker?.getAttribute('content') === 'filesystem') {
    return new ApiStorage('./api/v1/workspace', options.fetcher);
  }
  return createDefaultStorage(options.factory);
}
