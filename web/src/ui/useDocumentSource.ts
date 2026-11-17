// SPDX-License-Identifier: GPL-3.0-only
// One document source for canvas, code and properties. An embedded child uses
// its root file as the only writer; no fake VFS path ever enters the workspace.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { parsePDL } from '../engine/format/parser';
import { printDoc } from '../engine/format/printer';
import { applyCanvasState } from '../engine/model/merge';
import type { Doc } from '../engine/model/types';
import {
  docToState, type CanvasState, type WorkspaceManager,
} from '../workspace/workspace';
import {
  embeddedTree, resolveDocument, rootRef, writeDocument, type DocumentNode, type DocumentRef,
} from '../workspace/documents';

export interface DocumentSource {
  /** Changes when the root file or the nested reference changes. */
  key: string;
  root: string | null;
  ref: DocumentRef;
  /** Human-facing logical path of the selected document. */
  label: string;
  text: string;
  doc: Doc | null;
  writeText(text: string): void;
  writeDoc(doc: Doc): void;
  saveCanvas(state: CanvasState): void;
  canvasState(): CanvasState;
  markClean(): void;
}

const emptySource = (ref: DocumentRef): DocumentSource => ({
  key: ref.root,
  root: null,
  ref,
  label: '',
  text: '',
  doc: null,
  writeText: () => {},
  writeDoc: () => {},
  saveCanvas: () => {},
  canvasState: () => ({ objects: [], links: [] }),
  markClean: () => {},
});

/** Resolve a ref against the live root; every write goes back through it. */
function makeSource(
  manager: WorkspaceManager,
  root: string,
  ref: DocumentRef,
): DocumentSource {
  const rootText = manager.text(root);
  const resolved = resolveDocument(root, rootText, ref);
  const doc = resolved?.doc ?? null;
  const isRoot = ref.segments.length === 0;
  const writeText = (text: string): void => manager.saveText(root, text);
  const writeDoc = (next: Doc): void => {
    const written = writeDocument(root, manager.text(root), ref, next);
    if (written !== null) writeText(written);
  };
  const saveCanvas = (state: CanvasState): void => {
    if (isRoot) {
      manager.saveCanvas(root, state);
      return;
    }
    if (doc !== null) writeDoc(applyCanvasState(doc, state));
  };
  return {
    key: `${root}|${JSON.stringify(ref.segments)}`,
    root,
    ref,
    label: isRoot ? root : (ref.segments[ref.segments.length - 1]?.path ?? root),
    text: resolved?.text ?? '',
    doc,
    writeText,
    writeDoc,
    saveCanvas,
    canvasState: () => (doc === null ? { objects: [], links: [] } : docToState(doc)),
    markClean: () => manager.markClean(root),
  };
}

/** Resolve the current ref against the live root text; no network, no cache. */
export function useDocumentSource(
  manager: WorkspaceManager,
  activePath: string | null,
  version: number,
  ref: DocumentRef | null,
): DocumentSource {
  void version; // re-resolve on every workspace bump
  return useMemo<DocumentSource>(() => {
    const fallback = rootRef(activePath ?? '');
    if (activePath === null || (ref !== null && ref.root !== activePath)) return emptySource(fallback);
    return makeSource(manager, activePath, ref ?? fallback);
  }, [activePath, manager, ref, version]);
}

/** Owns the current document ref and resets it when the root file changes. */
/** Derived explorer rows for the active root, never written to the VFS. */
export function useEmbeddedTree(
  manager: WorkspaceManager,
  root: string | null,
  version: number,
  revision: unknown,
): DocumentNode[] {
  return useMemo<DocumentNode[]>(() => {
    void version;
    void revision;
    if (root === null) return [];
    const doc = parsePDL(manager.text(root)).doc;
    return doc === null ? [] : embeddedTree(root, doc);
  }, [manager, root, version, revision]);
}

export function useActiveDocument(
  manager: WorkspaceManager,
  activePath: string | null,
  version: number,
): { source: DocumentSource; embedded: DocumentNode[]; setRef: (ref: DocumentRef | null) => void } {
  const [ref, setRef] = useState<DocumentRef | null>(null);
  useEffect(() => {
    setRef(activePath === null ? null : rootRef(activePath));
  }, [activePath]);
  const source = useDocumentSource(manager, activePath, version, ref);
  const embedded = useEmbeddedTree(manager, source.root, version, null);
  return { source, embedded, setRef };
}

/** Canonical text used by the sync machine's saved-state checks. */
export const canonicalText = (text: string): string => {
  const parsed = parsePDL(text);
  return parsed.doc === null ? text : printDoc(parsed.doc);
};
