// SPDX-License-Identifier: GPL-3.0-only
// M3 app hooks: workspace lifecycle (init + subscribe + unload flush +
// private-mode reminder) and the canvas controller wiring (creation, active
// file ⇄ canvas sync, palette drop). Extracted to keep App() lean.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GridSettings } from '../engine/render/grid';
import { CanvasController, type Snapshot } from './CanvasController';
import type { Kind } from '../engine/model/types';
import { stateToPcd, WorkspaceManager } from '../workspace/workspace';
import { parsePDL } from '../engine/format/parser';
import { printDoc } from '../engine/format/printer';
import { writePositions } from '../engine/layout/apply';
import { createDefaultStorage } from '../workspace/store/idb';

/** Structurally-equal empty DiagramState (controller + manager share shape). */
const EMPTY_STATE = { objects: [], links: [] };

export interface WorkspaceHandle {
  manager: WorkspaceManager;
  ready: boolean;
  version: number;
  reminder: boolean;
  clearReminder: () => void;
}

/**
 * Owns the WorkspaceManager instance: IDB attach + init on mount, change
 * subscription (bumps `version` so chrome re-renders), autosave flush on
 * hide/unload (FR-S1) and the 10-minute private-mode reminder (FR-S2).
 */
export function useWorkspace(): WorkspaceHandle {
  const managerRef = useRef<WorkspaceManager | null>(null);
  if (managerRef.current === null) managerRef.current = new WorkspaceManager();
  const manager = managerRef.current;
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);
  const [reminder, setReminder] = useState(false);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      manager.attachStorage(await createDefaultStorage()); // IDB; falls back to memory
      await manager.init();
      if (!disposed) setReady(true);
    })();
    const unsub = manager.subscribe(() => setVersion((v) => v + 1));
    return () => {
      disposed = true;
      unsub();
    };
  }, [manager]);

  useEffect(() => {
    const flush = (): void => {
      void manager.flush();
    };
    const onVisible = (): void => {
      if (document.hidden) flush();
    };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [manager]);

  useEffect(() => {
    if (!ready || !manager.ephemeral) return undefined;
    setReminder(false);
    const timer = window.setInterval(() => setReminder(true), 600_000);
    return () => window.clearInterval(timer);
  }, [ready, manager.ephemeral, version]);

  return { manager, ready, version, reminder, clearReminder: () => setReminder(false) };
}

export interface CanvasHandle {
  svgRef: { current: SVGSVGElement | null };
  ctrlRef: { current: CanvasController | null };
  nameFieldRef: { current: HTMLInputElement | null };
  /** Latest controller snapshot (null until the first render). */
  snap: Snapshot | null;
  onCtrlState: (s: Snapshot) => void;
  onPaletteDrop: (kind: Kind, e: PointerEvent) => void;
  /** Forget the last-loaded path (after clearAll reset the workspace). */
  resync: () => void;
}

/**
 * Creates the CanvasController once and keeps the active workspace file in
 * sync with the canvas: file → ctrl.loadState on open/switch (echo-suppressed
 * via loadingRef), canvas → manager.saveCanvas on every state change (the
 * manager's content-compare turns clean saves into no-ops).
 */
/**
 * UX08-WP05: the controller is created once, before the stored grid preference
 * is known, so both directions go through refs — the latest settings are applied
 * when the controller appears, and `g` always calls the current toggle.
 */
function useGridHandoff(
  settings: GridSettings | null,
  onShortcut: () => void,
  ctrlRef: { current: CanvasController | null },
): { gridRef: { current: GridSettings | null }; gridShortcutRef: { current: () => void } } {
  const gridRef = useRef<GridSettings | null>(settings);
  const gridShortcutRef = useRef<() => void>(onShortcut);
  useEffect(() => {
    gridShortcutRef.current = onShortcut;
  }, [onShortcut]);
  useEffect(() => {
    gridRef.current = settings;
    if (settings !== null) ctrlRef.current?.applyGrid(settings);
  }, [ctrlRef, settings]);
  return { gridRef, gridShortcutRef };
}

/**
 * F-14: persist drag/resize geometry into the top-level layout (debounced 250
 * ms). Only the ids that moved are written; other layout lines, flows, styles
 * and imports are untouched (writePositions replaces just those ids). Never
 * called for open/switch — only for interaction end.
 */
function useGeometryCommit(
  manager: WorkspaceManager,
  commitDocRef: { current: ((doc: import('../engine/model/types').Doc) => void) | null },
): (positions: Record<string, { x: number; y: number }>) => void {
  const geometryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingGeometry = useRef<Record<string, { x: number; y: number }>>({});
  return (positions: Record<string, { x: number; y: number }>): void => {
    pendingGeometry.current = { ...pendingGeometry.current, ...positions };
    if (geometryTimer.current !== null) clearTimeout(geometryTimer.current);
    geometryTimer.current = setTimeout(() => {
      geometryTimer.current = null;
      const moved = pendingGeometry.current;
      pendingGeometry.current = {};
      const path = manager.activePath;
      if (path === null) return;
      const { doc } = parsePDL(manager.text(path));
      if (doc === null) return;
      const { doc: updated, written } = writePositions(doc, moved);
      if (written.length === 0) return;
      // F-14: go through the sync machine so the code view shows the commit
      // immediately (a bare file write would leave the buffer stale).
      const commitDoc = commitDocRef.current;
      if (commitDoc) commitDoc(updated);
      else manager.saveText(path, printDoc(updated));
    }, 250);
  };
}

export function useCanvasController(
  manager: WorkspaceManager,
  ready: boolean,
  version: number,
  commitDocRef: { current: ((doc: import('../engine/model/types').Doc) => void) | null } = {
    current: null,
  },
  onInlineRename: (id: string) => void = () => {},
  onGhostOpen: (path: string) => void = () => {},
  onHover: (info: import('./hoverInfo').HoverInfo | null) => void = () => {},
  /** UX08-WP05: grid preference; `null` until the workspace reports one. */
  gridSettings: GridSettings | null = null,
  onGridShortcut: () => void = () => {},
  /** UX08-WP08: a canvas gesture asked the shell to show an inspector. */
  onPropertiesRequest: (request: import('./CanvasController').PropertiesRequest) => void = () => {},
): CanvasHandle {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const ctrlRef = useRef<CanvasController | null>(null);
  const nameFieldRef = useRef<HTMLInputElement | null>(null);
  const lastLoadedRef = useRef<string | null>(null);
  const loadingRef = useRef<string | null>(null);
  const lastCanvasTextRef = useRef<string | null>(null); // last projection persisted via onCtrlState
  const firstRunRef = useRef(true); // adoption only guards the initial load
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const { gridRef, gridShortcutRef } = useGridHandoff(gridSettings, onGridShortcut, ctrlRef);
  const resync = (): void => {
    lastLoadedRef.current = null;
  };

  /* active file → canvas */
  useEffect(() => {
    if (!ready) return;
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    const path = manager.activePath;
    if (path === lastLoadedRef.current) return;
    /* adoption: work placed on the canvas before init finished (welcome file
       just bootstrapped, still empty) must not be wiped by the empty load.
       Only on the initial load — after clearAll() the empty file is the truth. */
    if (
      firstRunRef.current &&
      path !== null &&
      lastLoadedRef.current === null &&
      ctrl.snapshot.objects.length > 0 &&
      manager.canvasState(path).objects.length === 0
    ) {
      firstRunRef.current = false;
      manager.saveCanvas(path, { objects: ctrl.snapshot.objects, links: ctrl.snapshot.links });
      manager.markClean(path);
      lastLoadedRef.current = path;
      return;
    }
    firstRunRef.current = false;
    lastLoadedRef.current = path;
    lastCanvasTextRef.current = null; // new file: re-baseline the projection dedupe
    if (path === null) {
      loadingRef.current = '\u0000';
      ctrl.loadState(EMPTY_STATE);
      loadingRef.current = null;
      return;
    }
    /* File already mirrors the canvas (autosave raced init)? Keep selection,
       geometry and the dirty flag — a loadState here would only deselect. */
    const curText = stateToPcd({ objects: ctrl.snapshot.objects, links: ctrl.snapshot.links });
    if (manager.text(path) === curText) return;
    loadingRef.current = path;
    ctrl.loadState(manager.canvasState(path));
    loadingRef.current = null;
    manager.markClean(path);
  }, [ready, version, manager]);

  const commitGeometry = useGeometryCommit(manager, commitDocRef);

  const onCtrlState = (s: Snapshot): void => {
    setSnap(s);
    const path = manager.activePath;
    if (path === null || loadingRef.current === path) return;
    // F-28: never persist a snapshot the canvas emitted before it loaded the
    // active file — a pre-load (empty) state would overwrite the file.
    if (lastLoadedRef.current !== path) return;
    if (!ctrlRef.current?.isHydrated()) return;
    /* Persist only real canvas-content changes: render/selection/camera
       churn re-emits the same objects/links, and writing the projection
       then would clobber the file's full text (flows/views/styles the
       projection cannot model — D-M4-6). Dedupe by serialized projection. */
    const text = stateToPcd({ objects: s.objects, links: s.links });
    if (text === lastCanvasTextRef.current) return;
    lastCanvasTextRef.current = text;
    manager.saveCanvas(path, { objects: s.objects, links: s.links });
  };

  /* controller creation (once) */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || ctrlRef.current) return;
    const ctrl = new CanvasController(svg, {
      onState: onCtrlState,
      onRenameRequest: (id) => onInlineRename(id),
      onGhostOpen,
      onGeometry: commitGeometry,
      onHover,
      // `g` is a preference change: the shell re-applies the stored settings.
      onGridShortcut: () => gridShortcutRef.current(),
      onPropertiesRequest,
    });
    ctrlRef.current = ctrl;
    if (gridRef.current !== null) ctrl.applyGrid(gridRef.current);
    return () => {
      ctrl.destroy();
      ctrlRef.current = null;
    };
  }, []);

  const onPaletteDrop = (kind: Kind, e: PointerEvent): void => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const p = ctrl.viewport;
    ctrl.addObject(kind, {
      x: (e.clientX - rect.left - p.x) / p.k,
      y: (e.clientY - rect.top - p.y) / p.k,
    });
  };

  return { svgRef, ctrlRef, nameFieldRef, snap, onCtrlState, onPaletteDrop, resync };
}
