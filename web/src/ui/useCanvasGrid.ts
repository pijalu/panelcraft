// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP05: the canvas grid preference as App-side glue. The pure model lives
// in engine/render/grid.ts; this hook adopts the stored value, applies it to the
// canvas and persists every change. Nothing here reaches the document.
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { WorkspaceManager } from '../workspace/workspace';
import {
  normaliseGrid,
  setGridSnap,
  setGridType,
  toggleGridVisibility,
  type GridSettings,
  type GridType,
} from '../engine/render/grid';

export interface CanvasGridHandle {
  grid: GridSettings;
  setType: (type: GridType) => void;
  setSnap: (snap: boolean) => void;
  /** The `g` shortcut: flip visibility, keeping the last visible type. */
  toggle: () => void;
}

/**
 * @param manager  workspace manager (settings persistence)
 * @param ready    workspace initialized (stored preference available)
 * @param version  manager version bump (adopt restored settings)
 */
export function useCanvasGrid(
  manager: WorkspaceManager,
  ready: boolean,
  version: number,
): CanvasGridHandle {
  // Start from whatever the manager already holds so an explicit `off` choice
  // cannot flash the default grid on the first frame after a load.
  const [grid, setGrid] = useState<GridSettings>(() => normaliseGrid(manager.settings.canvasGrid));
  const gridRef = useRef<GridSettings>(grid);
  const adoptedFrom = useRef<unknown>(undefined);
  const touched = useRef(false);

  const stored = manager.settings.canvasGrid;
  if (ready && stored !== adoptedFrom.current) {
    adoptedFrom.current = stored;
    // A user change made before the workspace finished loading wins: it is
    // already in the manager and re-adopting the old value would undo it.
    if (!touched.current) {
      const next = normaliseGrid(stored);
      gridRef.current = next;
      setGrid(next);
    }
  }

  const commit = useCallback(
    (next: GridSettings) => {
      touched.current = true;
      gridRef.current = next;
      setGrid(next);
      // Persist immediately: a reload right after the change must keep it
      // (same durability rule as the panel layout).
      manager.setSetting('canvasGrid', next);
    },
    [manager],
  );

  const setType = useCallback((type: GridType) => commit(setGridType(gridRef.current, type)), [commit]);
  const setSnap = useCallback((snap: boolean) => commit(setGridSnap(gridRef.current, snap)), [commit]);
  const toggle = useCallback(() => commit(toggleGridVisibility(gridRef.current)), [commit]);

  // A change made before the stored value arrived must still be written once
  // the workspace is ready (the manager drops settings before init).
  useEffect(() => {
    if (!ready || !touched.current) return;
    manager.setSetting('canvasGrid', gridRef.current);
    // Revision-only effect: the value is read from the ref on purpose.
  }, [manager, ready, version]);

  return { grid, setType, setSnap, toggle };
}
