// SPDX-License-Identifier: GPL-3.0-only
// Import ghosts wiring (F-20): resolves the active file's imports and pushes the
// read-only ghost objects into the canvas. Errors (missing file, cycle, escape)
// are returned so the shell can surface them instead of failing silently.
import { useEffect, useState } from 'preact/hooks';
import type { WorkspaceManager } from '../workspace/workspace';
import type { CanvasController } from './CanvasController';
import type { ImportError } from '../engine/model/imports';
import { layoutGhosts } from './ghostLayout';

/**
 * @param manager   workspace (file lookup)
 * @param ready     workspace initialised
 * @param activePath active file (null = nothing to resolve)
 * @param version   manager version bump (file edits create/remove imports)
 * @param ctrlRef   canvas controller (ghost target)
 */
export function useImportGhosts(
  manager: WorkspaceManager,
  ready: boolean,
  activePath: string | null,
  version: number,
  ctrlRef: { current: CanvasController | null },
): ImportError[] {
  const [errors, setErrors] = useState<ImportError[]>([]);

  useEffect(() => {
    const ctrl = ctrlRef.current;
    if (!ready || ctrl === null) return;
    if (activePath === null) {
      ctrl.setGhosts([]);
      setErrors([]);
      return;
    }
    const { ghosts, errors: errs } = manager.importGhosts(activePath);
    ctrl.setGhosts(layoutGhosts(ghosts, manager.canvasState(activePath)));
    setErrors(errs);
  }, [ready, activePath, version, manager, ctrlRef]);

  return errors;
}
