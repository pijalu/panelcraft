// SPDX-License-Identifier: GPL-3.0-only
// Drill-down wiring for the shell (IR v10, FILE-FORMAT.md §3.2): the breadcrumb trail,
// the decomposition target of the inspected element, the findings for the open
// file, and the two document edits (relation + embedded source).
//
// The trail is re-derived from the file after every edit instead of being kept in
// sync by hand: the document is the single source of truth, so undo/redo and a
// canvas write cannot leave the breadcrumbs describing a relation that no longer
// exists.
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { CanvasController } from './CanvasController';
import type { WorkspaceManager } from '../workspace/workspace';
import type { Diagnostic } from '../engine/format/diagnostics';
import { parsePDL } from '../engine/format/parser';
import type { Doc, Obj, SourceBlock } from '../engine/model/types';
import { auditHierarchy, type AuditFile } from './hierarchyAudit';
import {
  crumbs as crumbsOf, emptyTrail, parentOfTrail, popTo, pushEntry, resolveTarget,
  type Crumb, type Trail, type TrailEntry, type TrailProblem,
} from './drillTrail';

/** What the inspected element decomposes into, or why it cannot be opened. */
export type DrillTarget = { path: string; view?: string; label: string } | TrailProblem;

export interface DrilldownHandle {
  trail: Trail;
  crumbs: Crumb[];
  /** Element + file the current diagram is subordinate to (parent boundary). */
  parent: TrailEntry['from'] | undefined;
  /** Findings about decomposition/source of the open file (P211–P218). */
  issues: Diagnostic[];
  /** Last refused drill-down (cycle, escaping path, unreadable target). */
  notice: string | null;
  dismissNotice(): void;
  /** The element that decomposes, if the open file has one (authoring affordance). */
  primary: Obj | null;
  /** The inspected element's target, if it declares one. */
  targetOf(objectId: string | null): DrillTarget | null;
  /** Open the subordinate diagram of `objectId`; refusals keep the context. */
  drill(objectId: string): void;
  /** Jump to a breadcrumb (0 = root). */
  goTo(index: number): void;
  /** Set or clear the decomposition relation of `objectId` (one undoable step). */
  setDrilldown(objectId: string, path: string | null, view?: string): void;
  /** Replace or clear the embedded source of `objectId` (one undoable step). */
  setSource(objectId: string, source: SourceBlock | null): void;
}

export interface DrilldownDeps {
  activePath: string | null;
  manager: WorkspaceManager;
  /** Bumped on every workspace write (file text changes). */
  version: number;
  /** Change tick from the code-sync machine (buffer edits). */
  revision: unknown;
  ctrlRef: { current: CanvasController | null };
  commitDoc: (doc: Doc) => void;
  /** Open a file (the shell's tab opener). */
  openFile: (path: string) => void;
  /** Select the view a relation asked for (`undefined` = default view). */
  onView: (view: string | undefined) => void;
}

const workspaceFiles = (manager: WorkspaceManager): AuditFile[] =>
  manager.snapshotTree().map((f) => ({ path: f.path, text: f.content }));

const parseText = (text: string | null): Doc | null => (text === null ? null : parsePDL(text).doc);

const labelOf = (obj: Obj): string => obj.name ?? obj.id;

/** Object copy without one optional field (clearing a relation or its source). */
const omit = (obj: Obj, key: 'drilldown' | 'source'): Obj => {
  const next = { ...obj };
  delete next[key];
  return next;
};

/** Shell-facing layer: the handle plus the source dialog's open object. */
export interface DrillLayer {
  drill: DrilldownHandle;
  /** Object whose source dialog is open (`null` = closed). */
  sourceId: string | null;
  openSource: (objectId: string) => void;
  closeSource: () => void;
  /** Parsed document of the open file (the source dialog reads from it). */
  doc: Doc | null;
}

/**
 * `useDrilldown` plus the source-dialog state the shell needs. Kept here so the
 * shell component stays inside the function-length gate and the dialog's data
 * always comes from the same parsed document the trail is derived from.
 */
export function useDrillLayer(deps: DrilldownDeps): DrillLayer {
  const drill = useDrilldown(deps);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const doc = useMemo<Doc | null>(
    () => (deps.activePath === null ? null : parseText(deps.manager.text(deps.activePath))),
    [deps.activePath, deps.manager, deps.version, deps.revision],
  );
  return {
    drill,
    sourceId,
    doc,
    openSource: (objectId: string) => setSourceId(objectId),
    closeSource: () => setSourceId(null),
  };
}

export function useDrilldown(deps: DrilldownDeps): DrilldownHandle {
  const { activePath, manager, version, revision, ctrlRef, commitDoc, openFile, onView } = deps;
  const [trail, setTrail] = useState<Trail>(emptyTrail);
  const [notice, setNotice] = useState<string | null>(null);

  const doc = useMemo<Doc | null>(() => {
    const text = activePath === null ? '' : manager.text(activePath);
    return parseText(text);
  }, [activePath, manager, version, revision]);

  // The trail root follows the file the reader is on: opening another file
  // directly starts a new trail instead of pretending it is a child of the old one.
  useEffect(() => {
    if (activePath === null) {
      setTrail(emptyTrail);
      return;
    }
    setTrail((current) => {
      if (current[current.length - 1]?.path === activePath) return current;
      if (current.some((entry) => entry.path === activePath)) return current;
      return [{ path: activePath }];
    });
  }, [activePath]);

  const issues = useMemo<Diagnostic[]>(() => {
    void version;
    void revision;
    if (activePath === null) return [];
    return auditHierarchy(workspaceFiles(manager), activePath);
  }, [activePath, manager, version, revision]);

  const primary = useMemo<Obj | null>(() => {
    const fromDoc = doc?.objects.find((o) => o.drilldown !== undefined) ?? null;
    return fromDoc;
  }, [doc]);

  const read = (path: string): string | null => (manager.hasFile(path) ? manager.text(path) : null);

  const targetOf = (objectId: string | null): DrillTarget | null => {
    if (objectId === null || activePath === null) return null;
    const obj = doc?.objects.find((o) => o.id === objectId);
    if (obj === undefined) return null;
    const resolved = resolveTarget(activePath, objectId, read);
    return 'code' in resolved ? resolved : { ...resolved, label: labelOf(obj) };
  };

  const drill = (objectId: string): void => {
    if (activePath === null) return;
    const obj = doc?.objects.find((o) => o.id === objectId);
    const resolved = resolveTarget(activePath, objectId, read);
    if ('code' in resolved) {
      // A broken relation keeps the current context and says why .
      setNotice(resolved.message);
      return;
    }
    if (read(resolved.path) === null) {
      setNotice(`"${resolved.path}" is not in this workspace yet — create it first`);
      return;
    }
    const from = { path: activePath, objectId, label: obj === undefined ? objectId : labelOf(obj) };
    const next = pushEntry(trail, resolved.path, from, resolved.view);
    if (next.problem !== undefined) {
      setNotice(next.problem.message);
      return;
    }
    setNotice(null);
    onView(resolved.view);
    setTrail(next.trail);
    openFile(resolved.path);
  };

  const goTo = (index: number): void => {
    const entry = trail[index];
    if (entry === undefined) return;
    setNotice(null);
    setTrail(popTo(trail, index));
    onView(entry.view);
    openFile(entry.path);
  };

  const commit = (next: (source: Doc) => Doc, label: string): void => {
    const ctrl = ctrlRef.current;
    const currentDoc = parseText(activePath === null ? null : manager.text(activePath));
    if (ctrl === null || currentDoc === null) return;
    const updated = next(currentDoc);
    ctrl.pushDocCommand(label, commitDoc, currentDoc, updated);
    commitDoc(updated);
  };

  const setDrilldown = (objectId: string, path: string | null, view?: string): void => {
    commit((source) => ({
      ...source,
      objects: source.objects.map((o) => {
        if (o.id !== objectId) return o;
        if (path === null) return omit(o, 'drilldown');
        return { ...o, drilldown: view === undefined ? { path } : { path, view } };
      }),
    }), path === null ? 'Clear decomposition' : 'Set decomposition');
  };

  const setSource = (objectId: string, source: SourceBlock | null): void => {
    commit((current) => ({
      ...current,
      objects: current.objects.map((o) => {
        if (o.id !== objectId) return o;
        if (source === null) return omit(o, 'source');
        return { ...o, source };
      }),
    }), source === null ? 'Remove source' : 'Edit source');
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
    drill,
    goTo,
    setDrilldown,
    setSource,
  };
}
