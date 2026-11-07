// SPDX-License-Identifier: GPL-3.0-only
// M3-WP2: in-memory StoragePort — ephemeral mode (FR-S2) and the fallback for
// browsers where IndexedDB is unavailable (private-mode Safari; ADR-0003).
import { newStoredWorkspace, type StoragePort, type StoredWorkspace } from './port';

export class MemoryStorage implements StoragePort {
  private record: StoredWorkspace | null = null;

  async load(): Promise<StoredWorkspace | null> {
    return this.record ? structuredClone(this.record) : null;
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
