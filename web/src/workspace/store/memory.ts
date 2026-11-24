// SPDX-License-Identifier: GPL-3.0-only
// M3-WP2: in-memory StoragePort — ephemeral mode (FR-S2) and the fallback for
// browsers where IndexedDB is unavailable (private-mode Safari; ADR-0003).
import { decodeStored, newStoredWorkspace, type StoragePort, type StoredWorkspace } from './port';

export class MemoryStorage implements StoragePort {
  readonly kind = 'memory' as const;
  readonly label = 'In-memory workspace';
  private record: StoredWorkspace | null = null;

  async load(): Promise<StoredWorkspace | null> {
    // Same validation path as IndexedDB: corrupt records throw StoreError.
    return this.record === null ? null : decodeStored(structuredClone(this.record));
  }

  async save(ws: StoredWorkspace): Promise<void> {
    this.record = structuredClone(ws);
  }

  async clear(): Promise<void> {
    this.record = null;
  }

  async estimate(): Promise<number | null> {
    return this.record === null ? null : JSON.stringify(this.record).length;
  }
}

/** Fresh record factory re-exported for ephemeral mode bootstrap (FR-S2). */
export { newStoredWorkspace };
