// SPDX-License-Identifier: GPL-3.0-only
// Embedded document identity and single-root writer (bugs.md: derived explorer
// tree). A DocumentRef is the root file plus the owner/path chain of nested
// decomposition targets; embedded children never become virtual files.
import { parsePDL } from '../engine/format/parser';
import { printDoc } from '../engine/format/printer';
import { resolveDrilldown } from '../engine/model/hierarchy';
import type { Doc, Obj } from '../engine/model/types';

export interface RefSegment {
  /** Stable logical workspace path of the embedded child. */
  path: string;
  /** Owning object id, used to recover a selection after a path change. */
  objectId: string;
}

export interface DocumentRef {
  root: string;
  /** Empty for the root file; one segment per embedded child. */
  segments: RefSegment[];
}

export interface DocumentNode {
  ref: DocumentRef;
  path: string;
  label: string;
  doc: Doc;
  children: DocumentNode[];
}

export interface ResolvedDocument {
  doc: Doc;
  text: string;
}

export const rootRef = (root: string): DocumentRef => ({ root, segments: [] });

/** Stable key for React lists and collapsed-state sets. */
export const refKey = (ref: DocumentRef): string => JSON.stringify(ref);

const labelOf = (doc: Doc, path: string): string => {
  if (doc.title !== undefined && doc.title !== '') return doc.title;
  const name = path.slice(path.lastIndexOf('/') + 1);
  return name === '' ? path : name;
};

interface FoundChild {
  path: string;
  doc: Doc;
  set(next: Doc): void;
}

/** Find a nested target by logical path, falling back to its owning object id. */
function findChild(doc: Doc, declaring: string, segment: RefSegment): FoundChild | undefined {
  const candidates: Array<{ obj: Obj; path: string }> = [];
  for (const obj of doc.objects) {
    if (obj.drilldown?.kind !== 'embedded') continue;
    const resolved = resolveDrilldown(declaring, obj.drilldown.path);
    if (!resolved.ok) continue;
    candidates.push({ obj, path: resolved.path });
  }
  const match = candidates.find((c) => c.path === segment.path)
    ?? candidates.find((c) => c.obj.id === segment.objectId);
  if (match === undefined) return undefined;
  const target = match.obj.drilldown;
  if (target?.kind !== 'embedded') return undefined;
  return {
    path: match.path,
    doc: target.doc,
    set: (next) => { target.doc = next; },
  };
}

function walkTree(rootPath: string, doc: Doc, declaring: string, segments: RefSegment[]): DocumentNode[] {
  const nodes: DocumentNode[] = [];
  for (const obj of doc.objects) {
    if (obj.drilldown?.kind !== 'embedded') continue;
    const resolved = resolveDrilldown(declaring, obj.drilldown.path);
    if (!resolved.ok) continue;
    const child = obj.drilldown.doc;
    const chain = [...segments, { path: resolved.path, objectId: obj.id }];
    nodes.push({
      ref: { root: rootPath, segments: chain },
      path: resolved.path,
      label: labelOf(child, resolved.path),
      doc: child,
      children: walkTree(rootPath, child, resolved.path, chain),
    });
  }
  return nodes;
}

/** Project embedded children from a parsed root into an explorer tree. */
export function embeddedTree(rootPath: string, doc: Doc): DocumentNode[] {
  return walkTree(rootPath, doc, rootPath, []);
}

/** Read the selected document; null means the ref no longer resolves. */
export function resolveDocument(
  rootPath: string,
  rootText: string,
  ref: DocumentRef,
): ResolvedDocument | null {
  if (ref.root !== rootPath) return null;
  const root = parsePDL(rootText).doc;
  if (root === null) return null;
  let current = root;
  let declaring = rootPath;
  for (const segment of ref.segments) {
    const child = findChild(current, declaring, segment);
    if (child === undefined) return null;
    current = child.doc;
    declaring = child.path;
  }
  return { doc: current, text: printDoc(current) };
}

/**
 * Commit a nested document edit into its root. The returned string is the only
 * write: callers pass it to the existing root-file writer so undo stays one
 * root-document command and no VFS file is invented.
 */
export function writeDocument(
  rootPath: string,
  rootText: string,
  ref: DocumentRef,
  next: Doc,
): string | null {
  if (ref.root !== rootPath) return null;
  const root = parsePDL(rootText).doc;
  if (root === null) return null;
  if (ref.segments.length === 0) return printDoc(next);
  let current = root;
  let declaring = rootPath;
  for (const segment of ref.segments.slice(0, -1)) {
    const child = findChild(current, declaring, segment);
    if (child === undefined) return null;
    current = child.doc;
    declaring = child.path;
  }
  const target = findChild(current, declaring, ref.segments[ref.segments.length - 1]!);
  if (target === undefined) return null;
  target.set(next);
  return printDoc(root);
}
