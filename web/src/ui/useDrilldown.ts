// SPDX-License-Identifier: GPL-3.0-only
// Drill-down and decomposition authoring for the shell (IR v12, FILE-FORMAT §3.2).
// The trail is re-derived from the live document after every edit, so undo,
// canvas writes and nested embedded edits cannot leave stale breadcrumbs.
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { CanvasController } from './CanvasController';
import type { WorkspaceManager } from '../workspace/workspace';
import type { Diagnostic } from '../engine/format/diagnostics';
import type { Doc, Obj, SourceBlock } from '../engine/model/types';
import { parsePDL } from '../engine/format/parser';
import { resolveDrilldown } from '../engine/model/hierarchy';
import { auditHierarchy, type AuditFile } from './hierarchyAudit';
import {
  crumbs as crumbsOf, emptyTrail, parentOfTrail, popTo, pushEntry,
  type Crumb, type Trail, type TrailEntry, type TrailProblem,
} from './drillTrail';
import { relativePath } from '../workspace/rewriteRefs';
import { embeddedTree, rootRef, type DocumentNode, type DocumentRef } from '../workspace/documents';
import type { DocumentSource } from './useDocumentSource';

export interface PathCandidate {
  /** Value written into the decomposition line. */
  path: string;
  label: string;
  disabled: boolean;
  reason: string;
  unresolved: boolean;
}

export type DrillTarget =
  | { path: string; raw: string; label: string; kind: 'linked' | 'embedded' }
  | TrailProblem;

export interface DrilldownHandle {
  trail: Trail;
  crumbs: Crumb[];
  parent: TrailEntry['from'] | undefined;
  issues: Diagnostic[];
  notice: string | null;
  dismissNotice(): void;
  primary: Obj | null;
  targetOf(objectId: string | null): DrillTarget | null;
  /** Known-value options for the decomposition picker, including unresolved legacy values. */
  candidates(objectId: string | null): PathCandidate[];
  drill(objectId: string): void;
  goTo(index: number): void;
  setDrilldown(objectId: string, path: string | null): void;
  setSource(objectId: string, source: SourceBlock | null): void;
}

export interface DrilldownDeps {
  activePath: string | null;
  manager: WorkspaceManager;
  version: number;
  revision: unknown;
  ctrlRef: { current: CanvasController | null };
  commitDoc: (doc: Doc) => void;
  openFile: (path: string) => void;
  /** Current document; an embedded child still writes through its root. */
  source?: DocumentSource;
  setRef?: (ref: DocumentRef | null) => void;
}

const workspaceFiles = (manager: WorkspaceManager): AuditFile[] =>
  manager.snapshotTree().map((f) => ({ path: f.path, text: f.content }));

const parseText = (text: string | null): Doc | null => (text === null ? null : parsePDL(text).doc);

const labelOf = (obj: Obj): string => obj.name ?? obj.id;

const omit = (obj: Obj, key: 'drilldown' | 'source'): Obj => {
  const next = { ...obj };
  delete next[key];
  return next;
};

const problem = (code: TrailProblem['code'], message: string): TrailProblem => ({ code, message });

interface TargetInfo {
  raw: string;
  path: string;
  kind: 'linked' | 'embedded';
}

/** Resolve a decomposition from the live doc without assuming a VFS read. */
function targetOfObject(doc: Doc | null, declaring: string, objectId: string): TargetInfo | TrailProblem | null {
  const obj = doc?.objects.find((o) => o.id === objectId);
  if (obj === undefined) return null;
  const target = obj.drilldown;
  if (target === undefined) return problem('escape', `"${objectId}" has no drilldown line`);
  const resolved = resolveDrilldown(declaring, target.path);
  if (!resolved.ok) {
    return problem(resolved.problem,
      resolved.problem === 'not-pcd'
        ? `drilldown target is not a .pcd path: "${target.path}"`
        : `drilldown target escapes the workspace: "${target.path}"`);
  }
  return { raw: target.path, path: resolved.path, kind: target.kind };
}

/** True when a candidate already points back at the current logical document. */
function pointsBack(doc: Doc, declaring: string, current: string): boolean {
  return doc.objects.some((obj) => {
    if (obj.drilldown === undefined) return false;
    const target = resolveDrilldown(declaring, obj.drilldown.path);
    return target.ok && target.path === current;
  });
}

function flattenNodes(nodes: readonly DocumentNode[], out: DocumentNode[] = []): DocumentNode[] {
  for (const node of nodes) {
    out.push(node);
    flattenNodes(node.children, out);
  }
  return out;
}

/** Build known `.pcd` options plus embedded children, with disabled reasons. */
function buildCandidates(
  manager: WorkspaceManager,
  doc: Doc | null,
  declaring: string,
  currentRaw: string | undefined,
): PathCandidate[] {
  if (doc === null) return [];
  const options = new Map<string, PathCandidate>();
  for (const file of manager.files()) {
    if (!file.path.toLowerCase().endsWith('.pcd')) continue;
    const value = relativePath(declaring, file.path);
    const parsed = parseText(manager.text(file.path));
    options.set(value, {
      path: value,
      label: file.path,
      disabled: parsed !== null && pointsBack(parsed, file.path, declaring),
      reason: parsed !== null && pointsBack(parsed, file.path, declaring)
        ? 'would create a decomposition cycle'
        : '',
      unresolved: false,
    });
  }
  const rootPath = declaring === '' ? '' : declaring;
  const embedded = flattenNodes(embeddedTree(rootPath, doc));
  for (const node of embedded) {
    options.set(node.path, {
      path: node.path,
      label: `${node.label} — ${node.path}`,
      disabled: node.path === declaring,
      reason: node.path === declaring ? 'this is the current document' : '',
      unresolved: false,
    });
  }
  const list = [...options.values()].sort((a, b) => a.label.localeCompare(b.label));
  if (currentRaw === undefined || list.some((c) => c.path === currentRaw)) return list;
  return [{
    path: currentRaw,
    label: `${currentRaw} (not in this workspace)`,
    disabled: true,
    reason: 'legacy target is not a known file or embedded child',
    unresolved: true,
  }, ...list];
}

function embeddedNodeFor(
  root: string | null,
  manager: WorkspaceManager,
  path: string,
): DocumentNode | undefined {
  if (root === null) return undefined;
  const rootDoc = parseText(manager.text(root));
  if (rootDoc === null) return undefined;
  return flattenNodes(embeddedTree(root, rootDoc)).find((node) => node.path === path);
}

interface NavigateDeps {
  root: string | null;
  manager: WorkspaceManager;
  declaring: string;
  info: TargetInfo;
  trail: Trail;
  obj: Obj | undefined;
  setNotice(message: string): void;
  setTrail(trail: Trail): void;
  setRef?: (ref: DocumentRef | null) => void;
  openFile(path: string): void;
  fileExists(path: string): boolean;
}

/** Open an embedded child in place or switch the tab to a linked file. */
function navigate(d: NavigateDeps): void {
  const from = { path: d.declaring, objectId: '', label: '' };
  const next = pushEntry(d.trail, d.info.path, {
    ...from,
    objectId: d.obj?.id ?? '',
    label: d.obj === undefined ? d.info.path : labelOf(d.obj),
  });
  if (next.problem !== undefined) {
    d.setNotice(next.problem.message);
    return;
  }
  if (d.info.kind === 'embedded') {
    const node = embeddedNodeFor(d.root, d.manager, d.info.path);
    if (node === undefined) {
      d.setNotice(`"${d.info.path}" is no longer embedded in "${d.root}"`);
      return;
    }
    d.setRef?.(node.ref);
  } else {
    if (!d.fileExists(d.info.path)) {
      d.setNotice(`"${d.info.path}" is not in this workspace yet — create it first`);
      return;
    }
    d.setRef?.(rootRef(d.info.path));
    d.openFile(d.info.path);
  }
  d.setTrail(next.trail);
}

export interface DrillLayer {
  drill: DrilldownHandle;
  sourceId: string | null;
  openSource(objectId: string): void;
  closeSource(): void;
  doc: Doc | null;
}

export function useDrillLayer(deps: DrilldownDeps): DrillLayer {
  const drill = useDrilldown(deps);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const doc = useMemo<Doc | null>(
    () => deps.source?.doc ?? (deps.activePath === null
      ? null
      : parseText(deps.manager.text(deps.activePath))),
    [deps.activePath, deps.manager, deps.version, deps.revision, deps.source],
  );
  return {
    drill,
    sourceId,
    doc,
    openSource: (objectId) => setSourceId(objectId),
    closeSource: () => setSourceId(null),
  };
}

function useDocumentFacts(deps: DrilldownDeps) {
  const { activePath, manager, version, revision, source } = deps;
  const root = source?.root ?? activePath;
  const declaring = source?.label ?? activePath ?? '';
  const doc = useMemo<Doc | null>(() => source?.doc
    ?? (activePath === null ? null : parseText(manager.text(activePath))),
  [activePath, manager, version, revision, source]);
  const issues = useMemo<Diagnostic[]>(() => {
    void version;
    void revision;
    return root === null ? [] : auditHierarchy(workspaceFiles(manager), root);
  }, [root, manager, version, revision]);
  const primary = useMemo<Obj | null>(
    () => doc?.objects.find((o) => o.drilldown !== undefined) ?? null,
    [doc],
  );
  const read = (path: string): string | null => (manager.hasFile(path) ? manager.text(path) : null);
  return { root, declaring, doc, issues, primary, read };
}

export function useDrilldown(deps: DrilldownDeps): DrilldownHandle {
  const { activePath, ctrlRef, commitDoc, openFile, source, setRef } = deps;
  const [trail, setTrail] = useState<Trail>(emptyTrail);
  const [notice, setNotice] = useState<string | null>(null);
  const { root, declaring, doc, issues, primary, read } = useDocumentFacts(deps);
  const { manager } = deps;
  useEffect(() => {
    if (root === null) {
      setTrail(emptyTrail);
      return;
    }
    setTrail((current) => {
      if (current[current.length - 1]?.path === root) return current;
      if (current.some((entry) => entry.path === root)) return current;
      return [{ path: root }];
    });
  }, [root]);


  const targetOf = (objectId: string | null): DrillTarget | null => {
    if (objectId === null || root === null) return null;
    const obj = doc?.objects.find((o) => o.id === objectId);
    if (obj === undefined) return null;
    const info = targetOfObject(doc, declaring, objectId);
    if (info === null) return null;
    if ('code' in info) return info;
    return { ...info, label: labelOf(obj) };
  };

  const candidates = (objectId: string | null): PathCandidate[] => {
    if (objectId === null) return [];
    const current = doc?.objects.find((o) => o.id === objectId)?.drilldown?.path;
    return buildCandidates(manager, doc, declaring, current);
  };

  const drill = (objectId: string): void => {
    if (root === null) return;
    const info = targetOfObject(doc, declaring, objectId);
    if (info === null) return;
    if ('code' in info) {
      setNotice(info.message);
      return;
    }
    setNotice(null);
    navigate({
      root,
      manager,
      declaring,
      info,
      trail,
      obj: doc?.objects.find((o) => o.id === objectId),
      setNotice,
      setTrail,
      setRef,
      openFile,
      fileExists: (path) => read(path) !== null,
    });
  };
  const goTo = (index: number): void => {
    const entry = trail[index];
    if (entry === undefined) return;
    setNotice(null);
    setTrail(popTo(trail, index));
    if (entry.path === root) {
      setRef?.(root === null ? null : rootRef(root));
      return;
    }
    const node = embeddedNodeFor(root, manager, entry.path);
    if (node !== undefined) setRef?.(node.ref);
    else openFile(entry.path);
  };
  const commit = (next: (current: Doc) => Doc, label: string): void => {
    const ctrl = ctrlRef.current;
    const currentDoc = source?.doc ?? (activePath === null ? null : parseText(manager.text(activePath)));
    if (ctrl === null || currentDoc === null) return;
    // Route every hierarchical edit through the code-sync writer: it updates
    // the buffer and, when the ref is nested, writes back through the root.
    const write = commitDoc;
    const updated = next(currentDoc);
    ctrl.pushDocCommand(label, write, currentDoc, updated);
    write(updated);
  };
  const setDrilldown = (objectId: string, path: string | null): void => {
    commit((current) => ({
      ...current,
      objects: current.objects.map((o) => {
        if (o.id !== objectId) return o;
        if (path === null) return omit(o, 'drilldown');
        return { ...o, drilldown: { kind: 'linked', path } };
      }),
    }), path === null ? 'Clear decomposition' : 'Set decomposition');
  };
  const setSource = (objectId: string, value: SourceBlock | null): void => {
    commit((current) => ({
      ...current,
      objects: current.objects.map((o) => {
        if (o.id !== objectId) return o;
        return value === null ? omit(o, 'source') : { ...o, source: value };
      }),
    }), value === null ? 'Remove source' : 'Edit source');
  };
  return {
    trail,
    crumbs: crumbsOf(trail),
    parent: parentOfTrail(trail),
    issues,
    notice,
    dismissNotice: () => setNotice(null),
    primary,
    targetOf,
    candidates,
    drill,
    goTo,
    setDrilldown,
    setSource,
  };
}
