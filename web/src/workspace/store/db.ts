// SPDX-License-Identifier: GPL-3.0-only
// Shared IndexedDB handle (M6 fix): ONE database, ONE version, both object
// stores created in a single upgrade. Opening per-feature with per-feature
// versions raced the two stores — the workspace open could hit the database
// after the snapshots open had already bumped it (VersionError → restore
// failed → the workspace silently re-bootstrapped and the next autosave
// clobbered the stored files, e2e S4 reload regression).
import { mapStoreError } from './port';

export const DB_NAME = 'panelcraft';
export const DB_VERSION = 2;
export const WORKSPACE_STORE = 'workspace';
export const SNAPSHOTS_STORE = 'snapshots';

/** Open the shared database; creates both stores on upgrade. */
export function openPanelCraftDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = factory.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(mapStoreError(err));
      return;
    }
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(WORKSPACE_STORE)) database.createObjectStore(WORKSPACE_STORE);
      if (!database.objectStoreNames.contains(SNAPSHOTS_STORE)) {
        database.createObjectStore(SNAPSHOTS_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      const database = req.result;
      database.onversionchange = () => database.close(); // allow deletes/upgrades
      resolve(database);
    };
    req.onerror = () => reject(mapStoreError(req.error));
    req.onblocked = () => reject(new Error('indexedDB open blocked'));
  });
}
