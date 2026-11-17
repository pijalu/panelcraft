// SPDX-License-Identifier: GPL-3.0-only
// The document pipeline: canvas controller → code-sync machine → project icons.
//
// These three are one unit of wiring — the controller emits canvas snapshots, the
// sync machine turns them into document changes, and the icon handle commits
// through the same write. Keeping them in one hook (instead of three call sites
// inside the shell component) is what keeps `App` readable and makes the "who
// writes the file" answer unambiguous: `code.commitDoc`.
import type { CanvasController } from './CanvasController';
import type { useWorkspace } from './useWorkspace';
import type { useUiLayout } from './useUiLayout';
import type { useCanvasGrid } from './useCanvasGrid';
import type { CodeSyncHandle } from './useCodeSync';
import type { HoverInfo } from './hoverInfo';
import { useAppCanvas } from './useAppCanvas';
import { useCodeSync } from './useCodeSync';
import { useProjectIcons, type ProjectIconsHandle } from './useProjectIcons';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { Doc } from '../engine/model/types';
import type { DocumentSource } from './useDocumentSource';
import { iconAssetsOf } from '../engine/render/iconAssets';

export interface DocumentPipeline {
  canvas: ReturnType<typeof useAppCanvas>['canvas'];
  inspect: ReturnType<typeof useAppCanvas>['inspect'];
  code: CodeSyncHandle;
  icons: ProjectIconsHandle;
}

export function useDocumentPipeline(p: {
  ws: ReturnType<typeof useWorkspace>;
  ui: ReturnType<typeof useUiLayout>;
  grid: ReturnType<typeof useCanvasGrid>;
  activePath: string | null;
  source: DocumentSource;
  onRename: (id: string) => void;
  onGhostOpen: (path: string) => void;
  onHover: (info: HoverInfo | null) => void;
}): DocumentPipeline {
  const { ws, activePath } = p;
  const commitDocRef = useRef<((doc: Doc) => void) | null>(null);
  const { canvas, inspect } = useAppCanvas({
    ws,
    ui: p.ui,
    commitDocRef,
    grid: p.grid,
    source: p.source,
    onRename: p.onRename,
    onGhostOpen: p.onGhostOpen,
    onHover: p.onHover,
  });
  const code = useCodeSync({
    manager: ws.manager,
    ready: ws.ready,
    activePath,
    version: ws.version,
    ctrlRef: canvas.ctrlRef,
    snap: canvas.snap,
    source: p.source,
  });
  commitDocRef.current = code.commitDoc;
  const icons = useProjectIcons({
    activePath, manager: ws.manager, version: ws.version, revision: code.snapshot,
    ctrlRef: canvas.ctrlRef, commitDoc: code.commitDoc,
  });
  // IR v9: the canvas resolves `icon name` against the open file's declarations,
  // so a changed handle can never keep drawing the previous picture.
  // Memoised on the parsed document: `iconAssetsOf` builds a fresh Map, and a
  // new dep value every render would re-run the publish effect forever.
  const assets = useMemo(
    () => (icons.doc === null ? null : iconAssetsOf(icons.doc)),
    [icons.doc],
  );
  useEffect(() => {
    const ctrl = canvas.ctrlRef.current;
    if (ctrl !== null && assets !== null) ctrl.setIconAssets(assets);
  }, [canvas.ctrlRef, assets]);
  return { canvas, inspect, code, icons };
}

/** Structural check for callers: the controller type the pipeline hands out. */
export type PipelineController = CanvasController;
