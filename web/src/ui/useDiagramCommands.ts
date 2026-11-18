// SPDX-License-Identifier: GPL-3.0-only
// Wires the shared diagram-reset policy to the canvas controller (ADR 0007).
// Both menu adapters receive the same selection object and the same commands,
// so enablement and behaviour cannot drift between them.
import { useCallback, useMemo } from 'preact/hooks';
import type { CanvasController } from './CanvasController';
import type { useCanvasController } from './useWorkspace';
import type { WorkspaceManager } from '../workspace/workspace';
import type { CommandSelection, RouteResetTarget } from './commandPolicy';
import { runRouteReset } from './diagramCommands';
import { autoLayoutPositions } from './diagramCommands';
import { parsePDL } from '../engine/format/parser';
import { effectiveLayout } from './layoutDoc';

export interface DiagramCommands {
  selection: CommandSelection;
  resetRoutes: (target: RouteResetTarget) => void;
  resetDiagramLayout: () => void;
}

export function useDiagramCommands(
  canvas: ReturnType<typeof useCanvasController>,
  manager: WorkspaceManager,
): DiagramCommands {
  const selection = useMemo<CommandSelection>(() => ({
    objects: canvas.snap?.selection.objects ?? [],
    links: canvas.snap?.selection.links ?? [],
  }), [canvas.snap]);

  const resetRoutes = useCallback((target: RouteResetTarget): void => {
    const ctrl: CanvasController | null = canvas.ctrlRef.current;
    if (ctrl !== null) runRouteReset(ctrl, target);
  }, [canvas.ctrlRef]);

  const resetDiagramLayout = useCallback((): void => {
    const ctrl = canvas.ctrlRef.current;
    const path = manager.activePath;
    if (ctrl === null || path === null) return;
    const { doc } = parsePDL(manager.text(path));
    if (doc === null) return;
    const ev = effectiveLayout(doc);
    const dir = ev.layout.mode === 'auto' ? ev.layout.dir : (doc.direction ?? 'LR');
    ctrl.applyLayoutCommand(autoLayoutPositions(doc, dir), 'reset diagram layout');
  }, [canvas.ctrlRef, manager]);

  return { selection, resetRoutes, resetDiagramLayout };
}
