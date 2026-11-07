// SPDX-License-Identifier: GPL-3.0-only
// M3 app hooks: workspace lifecycle (init + subscribe + unload flush +
// private-mode reminder) and the canvas controller wiring (creation, active
// file ⇄ canvas sync, palette drop). Extracted to keep App() lean.
import { useEffect, useRef, useState } from 'preact/hooks';
import { CanvasController, type Snapshot } from './CanvasController';
import type { Kind } from '../engine/model/types';
import { stateToPcd, WorkspaceManager } from '../workspace/workspace';
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
}

/**
 * Creates the CanvasController once and keeps the active workspace file in
 * sync with the canvas: file → ctrl.loadState on open/switch (echo-suppressed
 * via loadingRef), canvas → manager.saveCanvas on every state change (the
 * manager's content-compare turns clean saves into no-ops).
 */
export function useCanvasController(
  manager: WorkspaceManager,
  ready: boolean,
  version: number,
): CanvasHandle {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const ctrlRef = useRef<CanvasController | null>(null);
  const nameFieldRef = useRef<HTMLInputElement | null>(null);
  const lastLoadedRef = useRef<string | null>(null);
  const loadingRef = useRef<string | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);

  /* active file → canvas */
  useEffect(() => {
    if (!ready) return;
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    const path = manager.activePath;
    if (path === lastLoadedRef.current) return;
    /* adoption: work placed on the canvas before init finished (welcome file
       just bootstrapped, still empty) must not be wiped by the empty load. */
    if (
      path !== null &&
      lastLoadedRef.current === null &&
      ctrl.snapshot.objects.length > 0 &&
      manager.canvasState(path).objects.length === 0
    ) {
      manager.saveCanvas(path, { objects: ctrl.snapshot.objects, links: ctrl.snapshot.links });
      manager.markClean(path);
      lastLoadedRef.current = path;
      return;
    }
    lastLoadedRef.current = path;
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

  const onCtrlState = (s: Snapshot): void => {
    setSnap(s);
    const path = manager.activePath;
    if (path !== null && loadingRef.current !== path) {
      manager.saveCanvas(path, { objects: s.objects, links: s.links });
    }
  };

  /* controller creation (once) */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || ctrlRef.current) return;
    const ctrl = new CanvasController(svg, {
      onState: onCtrlState,
      onRenameRequest: () => nameFieldRef.current?.focus(),
    });
    ctrlRef.current = ctrl;
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

  return { svgRef, ctrlRef, nameFieldRef, snap, onCtrlState, onPaletteDrop };
}
