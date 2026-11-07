// SPDX-License-Identifier: GPL-3.0-only
// M6-WP6 snapshot store lifecycle (FR-W7): opens the IDB-backed snapshot store
// once per mount; null while loading or in environments without indexedDB.
import { useEffect, useState } from 'preact/hooks';
import { createSnapshotStore, type SnapshotStore } from '../workspace/store/snapshots';

export function useSnapshotStore(): SnapshotStore | null {
  const [store, setStore] = useState<SnapshotStore | null>(null);
  useEffect(() => {
    let alive = true;
    void createSnapshotStore().then((s) => {
      if (alive) setStore(s);
    });
    return () => {
      alive = false;
    };
  }, []);
  return store;
}
