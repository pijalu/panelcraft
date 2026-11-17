// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP08: binds the canvas controller to the shell's inspector. The
// controller is created once and must not import Preact or the layout store, so
// it calls a trampoline; this hook owns that trampoline and the focus hand-off.
import { useCallback, useRef } from 'preact/hooks';
import type { PropertiesRequest } from './CanvasController';
import type { DocumentSource } from './useDocumentSource';
import { useCanvasController, useWorkspace } from './useWorkspace';
import { useUiLayout } from './useUiLayout';
import type { useCanvasGrid } from './useCanvasGrid';
import type { HoverInfo } from './hoverInfo';
import { usePropertiesRequest, type PropertiesRequestHandle } from './usePropertiesRequest';

export interface AppCanvasOptions {
  ws: ReturnType<typeof useWorkspace>;
  ui: ReturnType<typeof useUiLayout>;
  /** Ref filled by the pipeline once the code-sync writer exists. */
  commitDocRef: { current: ((doc: import('../engine/model/types').Doc) => void) | null };
  grid: ReturnType<typeof useCanvasGrid>;
  onRename: (id: string) => void;
  onGhostOpen: (path: string) => void;
  onHover: (info: HoverInfo | null) => void;
  source?: DocumentSource;
}

/** The canvas plus the inspector wiring that has to exist before it is built. */
export function useAppCanvas(
  p: AppCanvasOptions,
): { canvas: ReturnType<typeof useCanvasController>; inspect: PropertiesRequestHandle } {
  const inspectRef = useRef<(request: PropertiesRequest) => void>(() => {});
  const onPropertiesRequest = useCallback((request: PropertiesRequest) => {
    inspectRef.current(request);
  }, []);
  const canvas = useCanvasController(
    p.ws.manager,
    p.ws.ready,
    p.ws.version,
    p.commitDocRef,
    p.onRename,
    p.onGhostOpen,
    p.onHover,
    p.grid.grid,
    p.grid.toggle, // UX08-WP05: grid preference + the `g` hand-off
    onPropertiesRequest, // UX08-WP08: double-click/Enter/context menu → Properties
    p.source,
  );
  const selection = canvas.snap?.selection;
  const inspect = usePropertiesRequest({
    ctrlRef: canvas.ctrlRef,
    openPanel: p.ui.openPanel,
    nameFieldRef: canvas.nameFieldRef,
    selectionKey: `${selection?.objects[0] ?? ''}|${selection?.links[0] ?? ''}`,
  });
  inspectRef.current = inspect.request;
  return { canvas, inspect };
}
