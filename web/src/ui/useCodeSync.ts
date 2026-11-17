// SPDX-License-Identifier: GPL-3.0-only
// Code view ⇄ canvas ⇄ workspace wiring (M4-WP2/3/4). The sync machine is
// owned here (one per App lifetime); CodeEditor receives it as a prop.
//
// apply(doc) → canvas loadState (docToState, the file-open path, FR-K5); the
// canvas then saves through the existing M3 onCtrlState→saveCanvas bridge, so
// saveText runs AFTER loadState — the load synchronously writes the canvas
// projection to the file, and the FULL canonical text must win (D-M4-6). The
// canvas→machine bridge watches controller snapshots (serialized via
// stateToPcd — the format is position-free, so drags produce identical text
// and are deduped): an emission equal to the last applied text is an echo →
// machine.applied() + machine.markSaved(canonical file text); anything else
// is a genuine canvas change → machine.canvasChanged(stateToDoc(...)) — the
// Doc is built directly from the state because the projection text is not
// guaranteed to re-parse (M4 fix: synthesized ids, dropped sections).
// mermaid pastes convert in the editor (D-M4-4). formatNow() is exposed for
// the format button (FR-K4).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { CanvasController, Snapshot } from './CanvasController';
import type { WorkspaceManager } from '../workspace/workspace';
import { docToState, stateToPcd } from '../workspace/workspace';
import { applyCanvasState } from '../engine/model/merge';
import { FORMAT_VERSION, IR_VERSION, type Doc } from '../engine/model/types';
import { printDoc } from '../engine/format/printer';
import { parsePDL } from '../engine/format/parser';
import { createSyncMachine, type SyncMachine, type SyncSnapshot } from './codeview/sync';
import type { DocumentSource } from './useDocumentSource';
import { resolveDocument } from '../workspace/documents';

/** Canonical print of `text`; the text itself if it does not parse. */
function canon(text: string): string {
  const { doc } = parsePDL(text);
  return doc === null ? text : printDoc(doc);
}

/** Parsed doc of `text`, or null when it does not parse. */
function docOf(text: string): Doc | null {
  return parsePDL(text).doc;
}

/** Blank document — the merge base when neither buffer nor file parse. */
function emptyDoc(): Doc {
  return {
    irVersion: IR_VERSION,
    formatVersion: FORMAT_VERSION,
    icons: [],
    imports: [],
    objects: [],
    links: [],
    flows: [],
    styles: [],
  };
}

export interface CodeSyncHandle {
  machine: SyncMachine;
  /** Latest machine snapshot (sync-state chip, FR-K5 close prompt). */
  snapshot: SyncSnapshot;
  /** Format button / save hook (FR-K4). */
  formatNow: () => void;
  /**
   * F-14: persist a document that the canvas produced out-of-band (geometry
   * commits) — writes the file *and* re-renders the code view, so the buffer
   * never goes stale behind a canvas-side write.
   */
  commitDoc: (doc: Doc) => void;
}

/**
 * @param deps.ready        workspace initialized
 * @param deps.activePath   active file path (null = no file)
 * @param deps.version      manager version bump (file switches)
 * @param deps.ctrlRef      canvas controller ref (apply target)
 * @param deps.snap         latest canvas snapshot (canvas → machine bridge)
 */
export function useCodeSync(deps: {
  manager: WorkspaceManager;
  ready: boolean;
  activePath: string | null;
  version: number;
  ctrlRef: { current: CanvasController | null };
  snap: Snapshot | null;
  /** Embedded children read and write through this instead of the root VFS path. */
  source?: DocumentSource;
}): CodeSyncHandle {
  const { manager, ready, activePath, version, ctrlRef, snap } = deps;
  // Root files keep the established path-based sync behaviour; only embedded
  // refs use the document source adapter.
  const docSource = deps.source?.ref.segments.length ? deps.source : undefined;
  const lastLoadedRef = useRef<string | null>(null);
  const appliedTextRef = useRef<string | null>(null);
  const lastBridgeTextRef = useRef<string | null>(null);
  const sourceRef = useRef(docSource);
  sourceRef.current = docSource;
  const documentKey = docSource?.key ?? activePath;

  const machine = useMemo(
    () =>
      createSyncMachine({
        schedule: (fn, ms) => setTimeout(fn, ms) as unknown as number,
        cancel: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
        apply: (doc) => {
          const text = printDoc(doc);
          const ctrl = ctrlRef.current;
          if (ctrl) {
            // canvas is the projection: load through the same doc→state path
            // the file open uses (grid layout for new objects; stored top-level
            // layout positions overlay — ADR 0007); the canvas then emits and
            // the bridge confirms via applied() (echo).
            const state = docToState(doc);
            appliedTextRef.current = stateToPcd(state);
            ctrl.loadState(state);
          }
          // FR-K5, file = source of truth: persist the FULL canonical text —
          // AFTER loadState, which synchronously drives the M3
          // onCtrlState→saveCanvas bridge writing the canvas projection (it
          // drops flows/views/styles; the buffer text must win, D-M4-6).
          const current = sourceRef.current;
          if (current !== undefined) current.writeText(text);
          else {
            const path = manager.activePath;
            if (path !== null) manager.saveText(path, text);
          }
        },
      }),
    // ctrlRef is a stable ref; the machine lives for the App lifetime
    [],
  );

  const [snapshot, setSnapshot] = useState<SyncSnapshot>(machine.snapshot());
  useEffect(() => machine.subscribe(setSnapshot), [machine]);

/* active document → machine (reset buffer on file or nested ref switch) */
useEffect(() => {
  if (!ready) return;
  if (documentKey === lastLoadedRef.current) return;
  lastLoadedRef.current = documentKey;
  const text = docSource?.text ?? (activePath === null ? '' : manager.text(activePath));
  appliedTextRef.current = null;
  lastBridgeTextRef.current = null;
  machine.loadFile(text);
}, [ready, documentKey, version, manager, machine, docSource]);

  /* canvas → machine bridge (echo-suppressed; deduped by serialized text) */
  useEffect(() => {
    if (!ready || snap === null) return;
    const ctrl = ctrlRef.current;
    // F-28: a snapshot taken before the canvas loaded its file is not a canvas
    // edit. Without this gate the startup empty snapshot is merged into the
    // document and the debounced render rewrites the code view (and the file)
    // with an empty diagram.
    if (ctrl === null || !ctrl.isHydrated()) return;
    // F-28: read the controller's LIVE state — the `snap` prop can be one
    // render behind (a file load inside the same commit), and merging that
    // stale (empty) state would rewrite the document without its objects.
    const live = ctrl.snapshot;
    const state = { objects: live.objects, links: live.links };
    const text = stateToPcd(state);
    const current = sourceRef.current;
    const saved = (): string => {
      const path = current === undefined ? manager.activePath : current.root;
      if (path === null || !manager.hasFile(path)) return canon('');
      const text = manager.text(path);
      if (current === undefined || current.ref.segments.length === 0) return canon(text);
      return canon(resolveDocument(path, text, current.ref)?.text ?? current.text);
    };
    // Echo check FIRST: a position-only apply (auto-layout, FR-V3) changes
    // neither the serialized projection nor the buffer — the dedupe below
    // would swallow the emission and the machine would stay pending-apply.
    if (text === appliedTextRef.current) {
      appliedTextRef.current = null;
      lastBridgeTextRef.current = text;
      machine.applied(); // no-op unless pending-apply (formatNow applies from clean)
      machine.markSaved(saved());
      return;
    }
    if (text === lastBridgeTextRef.current) return; // drags/selection/viewport spam
    lastBridgeTextRef.current = text;
    // Canvas changes are merged into the live document (F-01), so flows, views,
    // styles and imports never disappear when the canvas writes: the base is
    // the buffer the user sees (falling back to the file, then an empty doc).
    const base =
      docOf(machine.snapshot().codeText) ??
      docOf(current?.text ?? (manager.activePath === null ? '' : manager.text(manager.activePath))) ??
      emptyDoc();
    machine.canvasChanged(applyCanvasState(base, state));
    // the emission's saveCanvas (onCtrlState) already wrote the projection
    // to the file synchronously — record it, or the chip would show a
    // diverged false alarm whenever canvas edits re-canonicalize ids/types.
    machine.markSaved(saved());
  }, [ready, snap, manager, machine]);

  const commitDoc = (doc: Doc): void => {
    const current = sourceRef.current;
    if (current !== undefined) current.writeDoc(doc);
    else {
      const path = manager.activePath;
      if (path !== null) manager.saveText(path, printDoc(doc));
    }
    machine.canvasChanged(doc);
    machine.markSaved(printDoc(doc));
  };

  return { machine, snapshot, formatNow: () => machine.formatNow(), commitDoc };
}
