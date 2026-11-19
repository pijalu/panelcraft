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

/**
 * The canvas projection of `text` — what the canvas emits after loading it. It
 * is a projection (objects/links only), so it never equals the file text; only
 * comparing like with like identifies a load.
 */
function projectionOf(text: string): string | null {
  const doc = docOf(text);
  return doc === null ? null : stateToPcd(docToState(doc));
}

/**
 * What a canvas emission means: 'apply' confirms a pending apply, 'load' is the
 * canvas reading the open file, 'edit' is a real change to carry into the code.
 */
function echoKind(text: string, applied: string | null, loaded: string | null): 'apply' | 'load' | 'edit' {
  if (text === applied) return 'apply';
  if (text === loaded) return 'load';
  return 'edit';
}

/**
 * What a canvas change is merged into: the buffer the user sees, else the file's
 * own text, else a blank document. The buffer first, because a canvas edit must
 * preserve the parts of the document the canvas cannot model (flows, views,
 * styles) exactly as the user is reading them.
 */
function mergeBase(
  machine: SyncMachine,
  manager: WorkspaceManager,
  current: DocumentSource | undefined,
): Doc {
  const file = manager.activePath === null ? '' : manager.text(manager.activePath);
  return docOf(machine.snapshot().codeText) ?? docOf(current?.text ?? file) ?? emptyDoc();
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
  /**
   * The machine holds the open file's text. False while the workspace is still
   * starting: the buffer is empty and "clean" at that point only because
   * nothing has been loaded yet, so the editor must not be offered for typing —
   * a keystroke in that window would be overwritten by the incoming file text.
   */
  loaded: boolean;
  /** Re-read the active document after an in-place workspace restoration. */
  resync: () => void;
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
  /** Projection the canvas emits when it loads the open file (not an edit). */
  const loadEchoRef = useRef<string | null>(null);
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
  // Sticky: once a file's text is in the machine it stays true (a file switch
  // replaces the buffer in place, and unmounting the editor on every switch
  // would throw away its scroll and cursor for nothing).
  const [loaded, setLoaded] = useState(false);
  useEffect(() => machine.subscribe(setSnapshot), [machine]);

/* active document → machine (reset buffer on file or nested ref switch) */
useEffect(() => {
  if (!ready) return;
  // Nothing to load: with no open file the (empty) buffer is already the truth.
  if (documentKey === null) setLoaded(true);
  if (documentKey === lastLoadedRef.current) return;
  lastLoadedRef.current = documentKey;
  const text = docSource?.text ?? (activePath === null ? '' : manager.text(activePath));
  appliedTextRef.current = null;
  lastBridgeTextRef.current = null;
  // Remember what the canvas will emit when it loads this text: opening a file
  // is not a canvas edit, and on a slow start that load lands *after* the user
  // may already have typed a different document (see the bridge below).
  loadEchoRef.current = projectionOf(text);
  machine.loadFile(text);
  setLoaded(true);
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
    // would swallow the emission and the machine would stay pending-apply. The
    // canvas loading the open file is a second such non-edit: without it, a load
    // that finishes after the user started typing hands the code view the file's
    // entities while keeping the typed flows, so the buffer shows a document
    // nobody wrote (and, with dangling flow steps, a parse error). Compared by
    // content, so the gate does not depend on which load won the race.
    const echo = echoKind(text, appliedTextRef.current, loadEchoRef.current);
    if (echo !== 'edit') {
      if (echo === 'apply') {
        appliedTextRef.current = null;
        machine.applied(); // no-op unless pending-apply (formatNow applies from clean)
      } else {
        loadEchoRef.current = null;
      }
      lastBridgeTextRef.current = text;
      machine.markSaved(saved());
      return;
    }
    if (text === lastBridgeTextRef.current) return; // drags/selection/viewport spam
    lastBridgeTextRef.current = text;
    machine.canvasChanged(applyCanvasState(mergeBase(machine, manager, current), state));
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

  return {
    machine,
    snapshot,
    loaded,
    resync: () => {
      lastLoadedRef.current = null;
    },
    formatNow: () => machine.formatNow(),
    commitDoc,
  };
}
