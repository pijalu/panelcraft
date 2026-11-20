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
import { createAppStorage } from '../workspace/store/selection';
import type { DocumentSource } from './useDocumentSource';

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
      manager.attachStorage(await createAppStorage()); // Server marker, IDB, or memory fallback
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
 * A handler a once-built controller calls: it reads the latest render's closure
 * at event time, so the controller's creation effect never has to re-run.
 */
function useEventCallback<T extends (...args: never[]) => void>(
  fn: T | undefined,
): { current: T | undefined } {
  const ref = useRef<T | undefined>(fn);
  ref.current = fn;
  return ref;
}

/**
 * Persist drag/resize geometry into the top-level layout (debounced 250
 * ms). Only the ids that moved are written; other layout lines, flows, styles
 * and imports are untouched (writePositions replaces just those ids). Never
 * called for open/switch — only for interaction end.
 */
function useGeometryCommit(
  manager: WorkspaceManager,
  commitDocRef: { current: ((doc: import('../engine/model/types').Doc) => void) | null },
  source?: DocumentSource,
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
      const path = source?.root ?? manager.activePath;
      if (path === null) return;
      const { doc } = parsePDL(source?.text ?? manager.text(path));
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

interface CanvasLoadArgs {
  ctrl: CanvasController;
  path: string | null;
  manager: WorkspaceManager;
  source?: DocumentSource;
  documentKey: string | null;
  loadingRef: { current: string | null };
  lastCanvasTextRef: { current: string | null };
  firstRunRef: { current: boolean };
}

/** Keep canvas work placed before init from being wiped by the first load. */
function adoptInitialCanvas(a: CanvasLoadArgs): boolean {
  if (a.source !== undefined || !a.firstRunRef.current || a.path === null) return false;
  if (a.lastCanvasTextRef.current !== null) return false;
  if (a.ctrl.snapshot.objects.length === 0) return false;
  if (a.manager.canvasState(a.path).objects.length !== 0) return false;
  a.firstRunRef.current = false;
  a.manager.saveCanvas(a.path, {
    objects: a.ctrl.snapshot.objects,
    links: a.ctrl.snapshot.links,
  });
  a.manager.markClean(a.path);
  return true;
}

/** Load the active document into the canvas with echo suppression. */
function loadCanvasDocument(a: CanvasLoadArgs): void {
  a.firstRunRef.current = false;
  a.lastCanvasTextRef.current = null; // new document: re-baseline projection dedupe
  if (a.path === null || a.source?.doc === null) {
    a.loadingRef.current = '\u0000';
    a.ctrl.loadState(EMPTY_STATE);
    a.loadingRef.current = null;
    return;
  }
  const path = a.path!;
  const curText = stateToPcd({
    objects: a.ctrl.snapshot.objects,
    links: a.ctrl.snapshot.links,
  });
  if ((a.source?.text ?? a.manager.text(path)) === curText) return;
  a.loadingRef.current = a.documentKey;
  a.ctrl.loadState(a.source?.canvasState() ?? a.manager.canvasState(path));
  a.loadingRef.current = null;
  if (a.source === undefined) a.manager.markClean(path);
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
  /** A press landed on the diagram (the shell ends panel-started edits). */
  onUserPointer?: () => void,
  source?: DocumentSource,
): CanvasHandle {
  const docSource = source?.ref.segments.length ? source : undefined;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const ctrlRef = useRef<CanvasController | null>(null);
  const nameFieldRef = useRef<HTMLInputElement | null>(null);
  const lastLoadedRef = useRef<string | null>(null);
  const loadingRef = useRef<string | null>(null);
  const lastCanvasTextRef = useRef<string | null>(null); // last projection persisted via onCtrlState
  const firstRunRef = useRef(true); // adoption only guards the initial load
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const { gridRef, gridShortcutRef } = useGridHandoff(gridSettings, onGridShortcut, ctrlRef);
  // Event-time read: the controller is built once, the handler is not.
  const userPointerRef = useEventCallback(onUserPointer);
  const resync = (): void => {
    lastLoadedRef.current = null;
  };
  const documentKey = docSource?.key ?? manager.activePath;
  const onCtrlStateRef = useRef<((s: Snapshot) => void) | null>(null);
  const commitGeometryRef = useRef<((positions: Record<string, { x: number; y: number }>) => void) | null>(null);

  /* active file → canvas */
  useEffect(() => {
    if (!ready) return;
    const ctrl = ctrlRef.current;
    if (!ctrl || documentKey === lastLoadedRef.current) return;
    const args: CanvasLoadArgs = {
      ctrl,
      path: manager.activePath,
      manager,
      source: docSource,
      documentKey,
      loadingRef,
      lastCanvasTextRef,
      firstRunRef,
    };
    if (adoptInitialCanvas(args)) return;
    lastLoadedRef.current = documentKey;
    loadCanvasDocument(args);
  }, [ready, version, manager, documentKey, docSource]);

  const commitGeometry = useGeometryCommit(manager, commitDocRef, docSource);
  commitGeometryRef.current = commitGeometry;

  const onCtrlState = (s: Snapshot): void => {
    setSnap(s);
    const path = manager.activePath;
    if (path === null || loadingRef.current === documentKey) return;
    // F-28: never persist a snapshot the canvas emitted before it loaded the
    // active file — a pre-load (empty) state would overwrite the file.
    if (lastLoadedRef.current !== documentKey) return;
    if (!ctrlRef.current?.isHydrated()) return;
    /* Persist only real canvas-content changes: render/selection/camera
       churn re-emits the same objects/links, and writing the projection
       then would clobber the file's full text (flows/views/styles the
       projection cannot model — D-M4-6). Dedupe by serialized projection. */
    const text = stateToPcd({ objects: s.objects, links: s.links });
    if (text === lastCanvasTextRef.current) return;
    lastCanvasTextRef.current = text;
    if (docSource === undefined) manager.saveCanvas(path, { objects: s.objects, links: s.links });
    else docSource.saveCanvas({ objects: s.objects, links: s.links });
  };
  onCtrlStateRef.current = onCtrlState;

  /* controller creation (once) */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || ctrlRef.current) return;
    const ctrl = new CanvasController(svg, {
      onState: (s) => onCtrlStateRef.current?.(s),
      onRenameRequest: (id) => onInlineRename(id),
      onGhostOpen,
      onGeometry: (positions) => commitGeometryRef.current?.(positions),
      onHover,
      // `g` is a preference change: the shell re-applies the stored settings.
      onGridShortcut: () => gridShortcutRef.current(),
      onPropertiesRequest,
      onUserPointer: () => userPointerRef.current?.(),
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
